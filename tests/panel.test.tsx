import { expect, mock, test } from 'claude-code/testing'

import { agentSvg, miniBar, stepIcon } from '../hooks/icons'
import { compactNumber, countAction, duration, endAgent, modelName, newTurn, recordStep } from '../hooks/tracking'

const TOOL = 'mcp__progress-bar__progress'
const STEPS = ['Review the evening', 'Place the vows', 'Check']

const PANE = {
  component: 'Pane',
  requestId: 'progress',
  props: {
    title: 'Progression',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const USAGE = {
  input_tokens: 30000,
  output_tokens: 2000,
  cache_read_input_tokens: 8000,
  cache_creation_input_tokens: 1000,
  model: 'claude-opus-5-5',
}

test('tracking counts the actions, records the steps and writes durations like the app', async () => {
  let t = newTurn('  Find me   a picture of a tiger  ', 0)
  expect(t.text).toBe('Find me a picture of a tiger')
  t = countAction(t, undefined, 100)
  t = countAction(t, 'ag1', 200)
  t = countAction(t, 'ag1', 300)
  expect(t.actions).toBe(1)
  expect(t.agents).toEqual([{ id: 'ag1', start: 200, actions: 2 }])
  t = recordStep(t, { steps: STEPS, step: 1, from: 0, movedAt: 0 }, 400)
  t = recordStep(t, { steps: STEPS, step: 1, from: 0, movedAt: 0 }, 500)
  t = recordStep(t, { steps: STEPS, step: 2, from: 0, movedAt: 0 }, 600)
  expect(t.stepStarts).toEqual([{ step: 1, start: 400 }, { step: 2, start: 600 }])
  expect(t.stepNames).toEqual(STEPS)
  t = endAgent(t, 'ag1', 900, USAGE, false)
  expect(t.agents[0]).toMatchObject({ end: 900, tokens: 41000, model: 'claude-opus-5-5', stopped: false })
  // "7min 56s", like an agent's line in the conversation.
  expect(duration(19_000)).toBe('19s')
  expect(duration(476_000)).toBe('7min 56s')
  expect(duration(3_725_000)).toBe('1h 2min')
  expect(compactNumber(41000)).toBe('41 k')
  expect(compactNumber(1_250_000)).toBe('1,3 M')
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
})

test('the step icons and the mini bars', async () => {
  expect(stepIcon('done')).toContain('<path d="M5.3 8.3')
  expect(stepIcon('current')).toContain('type="rotate"')
  expect(stepIcon('upcoming')).not.toContain('<animate')
  expect(miniBar(null)).toContain('dur="1.6s"')
  expect(miniBar(null)).toContain('repeatCount="indefinite"')
  expect(miniBar(0.5, 300)).toContain('width="148"')
  expect(miniBar(1, 300)).not.toContain('<animate')
  expect(miniBar(null, 200, '#CC7C5E', 2)).toContain('height="11"')
  // Redrawn every second, they resume their loop where it was.
  expect(stepIcon('current', 1450)).toContain('begin="-0.550s"')
  expect(miniBar(null, 300, undefined, 3, 2000)).toContain('begin="-0.400s"')
})

test('an agent: four dots dancing at work, a solid dot when done, a gray dot when stopped', async () => {
  const running = agentSvg('running', 0, 0)
  expect(running.match(/<circle /g)!.length).toBe(4)
  expect(running).toContain('repeatCount="indefinite"')
  // Two agents do not dance the same dance.
  expect(agentSvg('running', 1, 0)).not.toBe(running)
  expect(agentSvg('done')).toContain('fill="#CC7C5E"')
  expect(agentSvg('stopped')).toContain('fill="#8A8A8A"')
  expect(agentSvg('done')).not.toContain('<animate')
})

test('the panel follows the request, the steps, the actions and the agents', { options: { language: 'fr' } }, async ($, on) => {
  const clock = mock.clock(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.list', () => ({ value: [{ id: 'ag1', description: 'Search for tigers', type: 'Explore', status: 'running' as const }] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 34 }, rateLimits: [] } }))

  const ui = await $.ui.mount({ plugin: 'progress-bar', surface: 'desktop', ...PANE })
  expect(await ui.find({ type: 'Text', text: 'Aucune tâche en cours' })).toBeDefined()

  await $.turn.start({ text: 'Find me a picture of a tiger', turnId: 't1' })
  await $.tool.call({ tool: TOOL, tool_use_id: 'p1', steps: STEPS, step: 1 })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'ls' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/tmp/a', agentId: 'ag1' })
  await clock.advance(19_000)
  await ui.redraw(PANE.props)

  expect(await ui.find({ type: 'Text', text: 'Find me a picture of a tiger' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'En cours' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '19s' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 sur 3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '34 %' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Place the vows' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 en cours' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Search for tigers' })).toBeDefined()
  expect((await ui.findAll({ type: 'Svg' })).map(d => d.props.alt)).toContain('Agent au travail')

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'a1', reason: 'answer', agentId: 'ag1', usage: USAGE })
  await ui.redraw(PANE.props)
  expect(await ui.find({ type: 'Text', text: /Explore · Opus 5.5 · 1 action · 41 k jetons/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 terminé' })).toBeDefined()
  expect((await ui.findAll({ type: 'Svg' })).map(d => d.props.alt)).toContain('Agent terminé')
  await ui.unmount()
})

test('the /progress command opens the panel without writing anything to the conversation', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  const reply = await $.command.run({
    command: 'progress',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
  expect(opened).toEqual(['progress'])
  expect(reply.text).toBeUndefined()
})
