import { expect, mock, test } from 'claude-code/testing'

import { visiblePosition } from '../hooks/motion'
import { advance, finish, readPlan } from '../hooks/plan'
import type { Plan } from '../types'

const TOOL = 'mcp__progress-bar__progress'
const STEPS = ['Review the evening', 'Place the vows', 'Check', 'Export']

const BAND = (isWorking: boolean) =>
  ({
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking,
      maxRows: 6,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 5 },
      view: {},
    },
  }) as const

const END = {
  answer: 'Done.',
  durationMs: 1000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
}

const plan = (parsed: Plan | string) => {
  if (typeof parsed === 'string') throw new Error(parsed)
  return parsed
}

test('the plan is read and clamped, and the same number restarts nothing', async () => {
  const first = plan(readPlan({ steps: STEPS, step: 1 }, null, 1000))
  expect(first).toEqual({ steps: STEPS, step: 1, from: 0, movedAt: 1000, stepStart: 1000 })
  expect(readPlan({ step: 1 }, first, 5000)).toBe(first)
  // Three actions in the first step, then the last step: it starts from where the bar actually was,
  // and counts its actions from zero.
  const afterActions = [2000, 3000, 4000].reduce((p, t) => advance(p, t), first)
  expect(afterActions.actions).toBe(3)
  const second = plan(readPlan({ step: 9 }, afterActions, 42000))
  expect(second.step).toBe(4)
  expect(second.actions ?? 0).toBe(0)
  expect(Math.abs(second.from - visiblePosition(afterActions, 38))).toBeLessThan(0.001)
  expect(second.from).toBeGreaterThan(0.05)
  expect(typeof readPlan({ step: 2 }, finish(second, 50000), 51000)).toBe('string')
  expect(typeof readPlan({ step: 1 }, null, 0)).toBe('string')
})

test('the bar never moves back, even when the steps follow each other quickly', async () => {
  // Step 1 at 0 s with actions close together, step 2 at 3 s, step 3 during the glide, actions during
  // a nudge, step 3 sent again, a longer plan, agents' actions, the end.
  const calls: [number, Record<string, unknown> | 'end' | 'action'][] = [
    [0, { steps: STEPS, step: 1 }],
    [200, 'action'],
    [350, 'action'],
    [1500, 'action'],
    [3000, { step: 2 }],
    [3100, 'action'],
    [3400, { step: 3 }],
    [3500, 'action'],
    [3600, 'action'],
    [5000, { step: 3 }],
    [9000, { steps: [...STEPS, 'Deliver', 'Tidy up', 'Take notes', 'Close'], step: 3 }],
    ...Array.from({ length: 40 }, (_, i): [number, 'action'] => [9500 + i * 200, 'action']),
    [20000, 'end'],
  ]
  let current: Plan | null = null
  let previous = -1
  let i = 0
  for (let t = 0; t <= 22000; t += 50) {
    while (i < calls.length && calls[i]![0] <= t) {
      const [when, args] = calls[i++]!
      current = args === 'end' ? finish(current!, when) : args === 'action' ? advance(current!, when) : plan(readPlan(args, current, when))
    }
    const position = visiblePosition(current!, (t - current!.movedAt) / 1000)
    expect(position).toBeGreaterThanOrEqual(previous - 1e-9)
    previous = position
  }
  expect(Math.abs(previous - 1)).toBeLessThan(1e-6)
})

test('the bar follows Claude, fills up to the end, then fades out', { options: { language: 'fr' } }, async ($, on) => {
  const clock = mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="empty" />
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'progress-bar', surface, ...BAND(true) })
    expect(await ui.find({ key: 'bar' })).toBeUndefined()

    const opening = await $.tool.call({ tool: TOOL, tool_use_id: 'a', steps: STEPS, step: 1 })
    expect(opening.deny).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Étape 1 sur 4$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Review the evening/ })).toBeDefined()

    await clock.advance(2000)
    await $.tool.call({ tool: TOOL, tool_use_id: 'b', step: 2 })
    expect(await ui.find({ type: 'Text', text: /^Étape 2 sur 4$/ })).toBeDefined()
    if (surface === 'desktop') {
      // On the desktop, the bar is a Client: the app keeps it as it is between two replies from the
      // engine. Its props only change with the steps: neither an action nor time redraws it.
      const client = async () => (await ui.find({ type: 'Client', key: 'thread' }))!.props as { module: string; props: { view: { n: number; events: number[][]; end: number | null } } }
      expect((await client()).module).toContain('bar-client.tsx')
      expect((await client()).props.view.events.length).toBe(2)
      const before = JSON.stringify((await client()).props)
      await $.tool.call({ tool: 'Bash', tool_use_id: 'action', command: 'ls' })
      await clock.advance(2000)
      expect(JSON.stringify((await client()).props)).toBe(before)
      // What the module draws: the image across the full width.
      const image = await ui.find({ type: 'Svg', in: 'thread' })
      expect(image?.props.width).toBe(4096)
      expect(String(image?.props.source)).toContain('width="100%"')
    }
    const repeated = await $.tool.call({ tool: TOOL, tool_use_id: 'b2', step: 2 })
    expect(JSON.stringify(repeated)).toContain('already')

    const fromSubagent = await $.tool.call({ tool: TOOL, tool_use_id: 'c', step: 3, agentId: 'x' })
    expect(fromSubagent.deny).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Étape 2 sur 4$/ })).toBeDefined()

    // Between two calls, the app may say that Claude is no longer working: the bar stays until the end.
    await ui.redraw(BAND(false).props)
    expect(await ui.find({ key: 'bar' })).toBeDefined()

    await $.turn.complete(END)
    expect(await ui.find({ type: 'Text', text: /^Terminé$/ })).toBeDefined()

    // The bar stays for the length of its end (a messenger in flight finishes its flight first), then leaves.
    await clock.advance(1700)
    expect(await ui.find({ type: 'Text', text: /^Terminé$/ })).toBeDefined()
    await clock.advance(2500)
    expect(await ui.find({ key: 'bar' })).toBeUndefined()
    await ui.unmount()
  }
})

test('a stop clears the bar at once, without the completion', { options: { language: 'fr' } }, async ($, on) => {
  mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="empty" />
  })

  const ui = await $.ui.mount({ plugin: 'progress-bar', surface: 'desktop', ...BAND(true) })
  await $.tool.call({ tool: TOOL, tool_use_id: 'a', steps: STEPS, step: 2 })
  expect(await ui.find({ key: 'bar' })).toBeDefined()

  await $.turn.complete({ ...END, reason: 'aborted' as const, isAborted: true })
  await ui.redraw(BAND(false).props)
  expect(await ui.find({ key: 'bar' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Terminé$/ })).toBeUndefined()
  await ui.unmount()
})

test('each action nudges the bar one notch, without ever reaching the next step', async () => {
  const p: Plan = { steps: STEPS, step: 1, from: 0, movedAt: 0 }
  // Without any action, time does not move it.
  expect(visiblePosition(p, 600)).toBe(visiblePosition(p, 1))
  // Each action pushes it a little further, by less and less, always before step 2.
  let current = p
  const positions: number[] = []
  for (let i = 1; i <= 60; i++) {
    current = advance(current, i * 1000)
    positions.push(visiblePosition(current, 5))
  }
  positions.slice(1).forEach((x, i) => expect(x).toBeGreaterThan(positions[i]!))
  expect(Math.abs(positions[7]! - 0.1125)).toBeLessThan(0.001)
  expect(positions.at(-1)!).toBeLessThan(0.25)
})

test('a step number without a plan is refused', async ($, on) => {
  mock.clock(on)
  const refusal = await $.tool.call({ tool: TOOL, tool_use_id: 'z', step: 2 })
  expect(refusal.deny).toContain('steps')
})

test('English by default: the band, the button and the end', async ($, on) => {
  mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="empty" />
  })
  const ui = await $.ui.mount({ plugin: 'progress-bar', surface: 'desktop', ...BAND(true) })
  await $.tool.call({ tool: TOOL, tool_use_id: 'a', steps: ['Read the brief', 'Draft', 'Check'], step: 2 })
  expect(await ui.find({ type: 'Text', text: /^Step 2 of 3$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Draft$/ })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'details' }))?.props.label).toBe('Details')
  await $.turn.complete(END)
  expect(await ui.find({ type: 'Text', text: /^Done$/ })).toBeDefined()
  await ui.unmount()
})
