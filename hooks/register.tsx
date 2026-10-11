import { atom, read, update } from 'claude-code'
import type { AgentInfo, Register } from 'claude-code'

import type { BandView, Plan, TrackedAgent, Turn } from '../types'
import { dotsText, ORANGE, sceneSvg, shownStep, visualEnd } from './dots'
import type { View } from './dots'
import { agentSvg, miniBar, stepIcon } from './icons'
import type { AgentState, StepState } from './icons'
import { visiblePosition } from './motion'
import { advance, finish, readPlan } from './plan'
import { strings } from './strings'
import { compactNumber, countAction, duration, endAgent, endTurn, modelName, newTurn, recordStep } from './tracking'

const PLUGIN = 'progress-bar'
const TOOL = `mcp__${PLUGIN}__progress`
const PANEL = 'progress'

const plan = atom({ plugin: 'progress-bar', key: 'plan' } as const, null as Plan | null)
const turn = atom({ plugin: 'progress-bar', key: 'turn' } as const, null as Turn | null)
// One beat per second while working: the panel reads it for its durations, the terminal for its
// animated glyph. The desktop app's bar does not read it: it does not move between two steps.
const tick = atom({ plugin: 'progress-bar', key: 'tick' } as const, 0)
// What the band shows, written only when a step changes or the work ends.
const view = atom({ plugin: 'progress-bar', key: 'view' } as const, null as BandView | null)
// The plan whose Client failed in the app (the time of its first step): for that plan, the band draws
// the image itself; the next plan tries the Client again.
const faultedPlan = atom({ plugin: 'progress-bar', key: 'faultedPlan' } as const, null as number | null)
// What the drawing receives from the band.
const viewOf = (v: BandView): View => ({ n: v.steps.length, events: v.events, end: v.end, seed: v.seed ?? v.events[0]?.[1] ?? 0 })
// Beyond this, the history of one list of steps teaches nothing more (it only moves forward).
const MAX_HISTORY = 1000

// What the model reads: in English, whatever the interface language.
const DESCRIPTION =
  'Shows the person a progress bar above their prompt while you work. ' +
  'Call this tool at the start of any request that will take you more than three actions, with `steps` ' +
  "(2 to 8 short steps, each starting with a verb, written in the person's language) and `step: 1`. " +
  'Call it again with only `step` each time you move on to the next step. ' +
  'Send `steps` again if your plan changes along the way. The bar clears itself when you finish.'

const SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 8,
      description: 'The whole plan, in order. Only on the first call, or when the plan changes.',
    },
    step: { type: 'integer', minimum: 1, description: 'The number of the step that starts, 1 for the first.' },
  },
  required: ['step'],
  additionalProperties: false,
}

const INSTRUCTION = {
  id: `${PLUGIN}:instruction`,
  text:
    `When a request will take you more than three actions, first call ${TOOL} with your steps, ` +
    'then call it again each time a new step starts. Never for a short answer, never from a subagent.',
  scope: 'session',
} as const

const FINISHED: AgentInfo['status'][] = ['completed', 'failed', 'killed']

// What the panel shows of an agent: the turn's tracking, completed by the engine's list.
type AgentRow = TrackedAgent & { description: string; type?: string; state: AgentState }

function agentRows(tracked: TrackedAgent[], infos: AgentInfo[], turnStart: number): AgentRow[] {
  const seen = new Set(tracked.map(a => a.id))
  const pending = infos
    .filter(i => !seen.has(i.id) && !FINISHED.includes(i.status) && i.status !== 'idle')
    .map((i): TrackedAgent => ({ id: i.id, start: turnStart, actions: 0 }))

  return [...tracked, ...pending].map(a => {
    const info = infos.find(i => i.id === a.id)
    const done = a.end !== undefined || (info !== undefined && FINISHED.includes(info.status))
    const stopped = a.stopped || info?.status === 'failed' || info?.status === 'killed'
    return {
      ...a,
      description: info?.description || info?.name || 'Agent',
      type: info?.type,
      state: stopped ? 'stopped' : done ? 'done' : 'running',
    }
  })
}

export const register: Register = (on, options) => {
  // The interface language: the mod's `language` option (English by default).
  const T = strings(options.language)

  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'progress', description: DESCRIPTION, inputSchema: SCHEMA, isDeferred: false })
    await $.command.register({ name: 'progress', description: T.command })
    $.clock.every(1000, () => {
      void (async () => {
        // While a turn or a bar is in progress: the panel counts the time, the band redraws.
        const t = await read($, turn)
        const p = await read($, plan)
        const v = await read($, view)
        if ((t !== null && t.end === undefined) || (p !== null && !p.done) || v !== null) await update($, tick, n => n + 1)
      })()
    })

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return { ...composed, sections: [...composed.sections, INSTRUCTION] }
  })

  // Like the app's commands that open a panel: nothing is written to the conversation.
  on('command.run', { command: 'progress' }, async $ => {
    await $.ui.open({ id: PANEL, title: T.progress })

    return {}
  })

  // A new turn begins with the person's request; a message sent during the work extends it.
  on('turn.start', async ($, e, next) => {
    const t = await read($, turn)
    if (t === null || t.end !== undefined) {
      const now = await $.clock.now()
      await update($, turn, () => newTurn(e.text, now))
    }

    return next(e)
  })

  // Each action by Claude or an agent is counted and moves the bar one notch: that is the real rhythm
  // of the work. The bar's own tool does not count.
  on('tool.call', async ($, e, next) => {
    if (e.tool !== TOOL) {
      const now = await $.clock.now()
      const t = await read($, turn)
      if (t !== null && t.end === undefined) {
        await update($, turn, x => (x === null ? x : countAction(x, e.agentId, now)))
      }
      // Nothing is written without a plan in progress: a write, even an identical one, makes
      // everything redraw.
      const p = await read($, plan)
      if (p !== null && !p.done) await update($, plan, x => (x === null || x.done ? x : advance(x, now)))
    }

    return next(e)
  })

  on('tool.call', { tool: 'mcp__progress-bar__progress' }, async ($, e) => {
    if (e.agentId !== undefined) {
      return { result: 'Ignored: the bar only follows the main conversation.' }
    }

    const now = await $.clock.now()
    const previous = await read($, plan)
    const parsed = readPlan(e, previous, now)
    if (typeof parsed === 'string') return { deny: parsed }
    if (parsed === previous) return { result: `The bar is already at step ${parsed.step} of ${parsed.steps.length}.` }

    await update($, plan, () => parsed)
    await update($, turn, x => (x === null ? x : recordStep(x, parsed, now)))
    // The band: the same list of steps extends its history; another list starts from zero.
    await update($, view, v =>
      v !== null && v.end === null && v.steps.join('\n') === parsed.steps.join('\n') && v.events.length < MAX_HISTORY
        ? { ...v, events: [...v.events, [parsed.step, now] as [number, number]] }
        : // The plan's time serves as the seed: each task draws its own dance order.
          { steps: parsed.steps, events: [[parsed.step, now] as [number, number]], end: null, seed: now },
    )

    return { result: `Bar updated: step ${parsed.step} of ${parsed.steps.length}.` }
  }).catch(() => ({ result: 'The bar is unavailable for this call; carry on with the work.' }))

  // An agent's end records its tokens. Claude's end plays the bar's completion and closes the turn; a
  // stop or an error clears the bar at once. Nothing at the start of a turn: a message sent while
  // Claude works opens one, and the bar in progress must survive.
  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    const stopped = e.reason !== 'answer'

    if (e.agentId !== undefined) {
      const id = e.agentId
      await update($, turn, x => (x === null || x.end !== undefined ? x : endAgent(x, id, now, e.usage, stopped)))
      return next(e)
    }

    await update($, turn, x => (x === null || x.end !== undefined ? x : endTurn(x, now, stopped)))
    const current = await read($, plan)
    const shown = await read($, view)
    if (stopped) {
      if (current !== null && !current.done) await update($, plan, () => null)
      if (shown !== null) await update($, view, () => null)
    } else {
      if (current !== null && !current.done) await update($, plan, () => finish(current, now))
      if (shown !== null && shown.end === null) {
        const ended = { ...shown, end: now }
        await update($, view, () => ended)
        // The bar is removed once it has faded out (a messenger in flight finishes its flight first).
        const clearedAt = visualEnd(viewOf(ended)) ?? now
        // A margin: the display starts from the time it sees the last step and the end, at most 400 ms
        // after the engine recorded them (bar-client.tsx).
        $.clock.after(Math.max(0, clearedAt - now) + 450, () => {
          void (async () => {
            if ((await read($, view))?.end === now) await update($, view, () => null)
            if ((await read($, plan))?.done) await update($, plan, () => null)
          })()
        })
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    const isQuiet = e.props.hasSurvey || e.props.view.agentId !== undefined

    if (isQuiet || v === null) {
      return next(e)
    }

    // Like the app's bands: the text in the theme's colors, the step in plain text on the left, the
    // count dimmed on the right; orange is kept for the bar.
    const total = v.steps.length
    const current = shownStep(viewOf(v))
    const title = v.end !== null ? T.done : (v.steps[current - 1] ?? '')
    const counter = T.stepOf(v.end !== null ? total : current, total)
    const alt = v.end !== null ? T.workDone : `${counter}: ${title}`
    const openPanel = () => $.ui.open({ id: PANEL, title: T.progress })
    const { Box, Button, Text } = $.ui.resolve(e)
    const row = (
      <Box key="row" flexDirection="row" gap={1} alignItems="center">
        <Box key="title" flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">{title}</Text>
        </Box>
        <Box key="count" flexShrink={0}>
          <Text dimColor>{counter}</Text>
        </Box>
        <Button key="details" label={T.details} hotkey="d" onPress={openPanel} />
      </Box>
    )

    if (e.surface === 'terminal') {
      await read($, tick)
      const now = await $.clock.now()
      return (
        <Box key="bar" flexDirection="column">
          {row}
          <Text color={ORANGE}>{dotsText(viewOf(v), now, Math.max(10, e.props.bodyColumns - 1))}</Text>
        </Box>
      )
    }

    // On the desktop, the bar is a Client: the app keeps it as it is between two replies from the
    // engine, and it only redraws with its props, that is, when a step changes or the work ends.
    if (e.surface === 'desktop' && (await read($, faultedPlan)) !== (v.events[0]?.[1] ?? null)) {
      const { Client } = $.ui.resolve(e)
      return (
        <Box key="bar" flexDirection="column" gap={1}>
          {row}
          <Client key="thread" module="./bar-client.tsx" props={{ view: viewOf(v), alt }} width="100%" />
        </Box>
      )
    }

    // Elsewhere, or if the Client failed: the image directly, redrawn every second.
    await read($, tick)
    const now = await $.clock.now()
    const { Svg } = $.ui.resolve(e)
    return (
      <Box key="bar" flexDirection="column" gap={1}>
        {row}
        <Svg key="thread" source={sceneSvg(viewOf(v), now)} alt={alt} width={4096} height={26} />
      </Box>
    )
  })

  // The bar's Client failed in the app: for this plan, the band falls back to the image drawn by the
  // engine, and the reason goes to the debug log.
  on('ui.fault', async ($, e, next) => {
    if (e.module.includes('bar-client')) {
      const v = await read($, view)
      await update($, faultedPlan, () => v?.events[0]?.[1] ?? null)
      $.ui.log(`progress-bar: the bar display failed (${e.phase}): ${e.reason}`, { to: 'debug' })
    }

    return next(e)
  })

  // The panel, in the grammar of the app's panels: the request and its status, the bar, four figures
  // without a frame, the steps with their icon and duration, then the agents, each with its four
  // dots. No color hard-coded for the text: everything follows the person's theme. Nothing wider than
  // its place in a row: an image that is too wide overflows there instead of shrinking.
  on('ui.render', { component: 'Pane', requestId: 'progress' }, async ($, e) => {
    await read($, tick)
    const t = await read($, turn)
    const p = await read($, plan)
    const now = await $.clock.now()
    const infos: AgentInfo[] = await $.agent.list().catch(() => [])
    const context = await $.session
      .usage()
      .then(u => u.context.percent)
      .catch(() => undefined)

    const current = t?.stepStarts.at(-1)?.step ?? 0
    const stepState = (n: number): StepState => {
      if (t === null) return 'upcoming'
      if ((t.end !== undefined && !t.stopped) || n < current) return 'done'
      return t.end === undefined && n === current ? 'current' : 'upcoming'
    }

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      if (t === null) return <Text dimColor>{T.noTask}</Text>
      const agents = agentRows(t.agents, infos, t.start)
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>{t.text || T.currentRequest}</Text>
          <Text dimColor>
            {duration((t.end ?? now) - t.start)} · {T.nActions(t.actions)}{context !== undefined ? ` · ${T.contextLine(context)}` : ''}
          </Text>
          {t.stepNames.map((name, i) => {
            const state = stepState(i + 1)
            return (
              <Text key={`s${i + 1}`} dimColor={state !== 'current'} bold={state === 'current'}>
                {state === 'done' ? '✓' : state === 'current' ? '●' : '○'} {name}
              </Text>
            )
          })}
          {agents.map(a => (
            <Text key={a.id}>
              {a.state === 'running' ? '●' : a.state === 'done' ? '✓' : '×'} {a.description} · {T.nActions(a.actions)} ·{' '}
              {duration((a.end ?? now) - a.start)}
            </Text>
          ))}
        </Box>
      )
    }

    const { Box, Svg, Text } = $.ui.resolve(e)

    if (t === null) {
      return (
        <Box flexDirection="column" padding={1} gap={1}>
          <Text>{T.noTask}</Text>
          <Text dimColor wrap="wrap">
            {T.noTaskDetail}
          </Text>
        </Box>
      )
    }

    const running = t.end === undefined
    const fraction = p !== null ? visiblePosition(p, Math.max(0, (now - p.movedAt) / 1000)) : running ? null : 1
    const agents = agentRows(t.agents, infos, t.start)
    const runningAgents = agents.filter(a => a.state === 'running').length
    const agentActions = agents.reduce((s, a) => s + a.actions, 0)
    // Drawn a little wider than their place, the bars are scaled down by the app to the right edge,
    // aligned with the text.
    const width = Math.max(200, Math.min(720, (e.props.bodyColumns ?? 50) * 9))
    const status = running ? T.inProgress : t.stopped ? T.stopped : T.done

    const stat = (key: string, title: string, value: string) => (
      <Box key={key} flexDirection="column" width="25%">
        <Text dimColor>{title}</Text>
        <Text>{value}</Text>
      </Box>
    )
    const section = (key: string, title: string, detail?: string) => (
      <Box key={key} flexDirection="row" gap={1}>
        <Box key="title" flexGrow={1}>
          <Text dimColor>{title}</Text>
        </Box>
        {detail !== undefined && <Text dimColor>{detail}</Text>}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box key="request" flexDirection="column">
          <Text bold wrap="wrap">
            {t.text || T.currentRequest}
          </Text>
          <Text dimColor>{status}</Text>
        </Box>
        <Svg key="bar" source={miniBar(fraction, width, undefined, undefined, now)} alt={T.taskProgress} />
        <Box key="stats" flexDirection="row">
          {stat('time', T.time, duration((t.end ?? now) - t.start))}
          {stat('step', T.step, t.stepNames.length > 0 ? T.outOf(t.end !== undefined && !t.stopped ? t.stepNames.length : current, t.stepNames.length) : '-')}
          {stat('actions', T.actions, String(t.actions + agentActions))}
          {stat('context', T.context, context !== undefined ? `${context}${T.language === 'fr' ? ' ' : ''}%` : '-')}
        </Box>

        {t.stepNames.length > 0 && (
          <Box key="steps" flexDirection="column" gap={1}>
            {section('steps-title', T.steps)}
            {t.stepNames.map((name, i) => {
              const n = i + 1
              const state = stepState(n)
              const entry = t.stepStarts.find(x => x.step === n)
              const following = t.stepStarts.find(x => x.step > n)
              const time = entry ? duration((following?.start ?? t.end ?? now) - entry.start) : ''
              const alt = state === 'done' ? T.stepDone : state === 'current' ? T.inProgress : T.upNext
              return (
                <Box key={`s${n}`} flexDirection="row" gap={1} alignItems="center">
                  <Svg key="icon" source={stepIcon(state, now)} alt={alt} width={14} height={14} />
                  <Box key="name" flexGrow={1} flexShrink={1}>
                    <Text bold={state === 'current'} dimColor={state === 'done'} wrap="truncate-end">
                      {name}
                    </Text>
                  </Box>
                  <Box key="time" flexShrink={0}>
                    <Text dimColor>{time}</Text>
                  </Box>
                </Box>
              )
            })}
          </Box>
        )}

        {agents.length > 0 && (
          <Box key="agents" flexDirection="column" gap={1}>
            {section('agents-title', T.agents, runningAgents > 0 ? T.agentsRunning(runningAgents) : T.agentsDone(agents.length))}
            {agents.map((a, index) => {
              const details = [
                a.type,
                modelName(a.model),
                T.nActions(a.actions),
                a.tokens !== undefined ? T.tokens(compactNumber(a.tokens, T.language)) : undefined,
                a.state === 'stopped' ? T.agentStoppedNote : undefined,
              ]
              return (
                <Box key={a.id} flexDirection="row" gap={1} alignItems="flex-start">
                  <Svg key="agent" source={agentSvg(a.state, index, now)} alt={a.state === 'running' ? T.agentAtWork : a.state === 'done' ? T.agentDone : T.agentStopped} width={22} height={22} />
                  <Box key="info" flexDirection="column" flexGrow={1} flexShrink={1}>
                    <Box key="row" flexDirection="row" gap={1}>
                      <Box key="name" flexGrow={1} flexShrink={1}>
                        <Text wrap="truncate-end">{a.description}</Text>
                      </Box>
                      <Box key="time" flexShrink={0}>
                        <Text dimColor>{duration((a.end ?? now) - a.start)}</Text>
                      </Box>
                    </Box>
                    <Text dimColor wrap="truncate-end">
                      {details.filter(Boolean).join(' · ')}
                    </Text>                  </Box>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })
}
