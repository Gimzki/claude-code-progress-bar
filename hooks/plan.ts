import type { Plan } from '../types'
import { visiblePosition } from './motion'

const MAX_STEPS = 8

// A plan saved by an older version of the mod has no move time: it is taken as it is.
const elapsedSince = (plan: Plan, now: number) =>
  Number.isFinite(plan.movedAt) ? Math.max(0, (now - plan.movedAt) / 1000) : 0

// Reads the tool call (`steps`, `step`): the plan sent, or the one already shown when Claude only gives
// the number. The same number twice restarts nothing; a new step starts from the actual position on
// screen. Refusals are read by the model: in English.
export function readPlan(args: Record<string, unknown>, previous: Plan | null, now: number): Plan | string {
  const step = args.step
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 1) {
    return '`step` must be an integer, 1 for the first step.'
  }

  const current = previous && !previous.done ? previous : null
  const sent = Array.isArray(args.steps)
    ? args.steps.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean)
    : []
  const steps = sent.length > 0 ? sent.slice(0, MAX_STEPS) : current?.steps

  if (!steps || steps.length === 0) {
    return 'No plan shown: send `steps` first, with `step: 1`.'
  }

  const clamped = Math.min(step, steps.length)
  if (current && current.step === clamped && current.steps.join('\n') === steps.join('\n')) return current

  return {
    steps,
    step: clamped,
    from: current ? visiblePosition(current, elapsedSince(current, now)) : 0,
    movedAt: now,
    stepStart: current && current.step === clamped ? (current.stepStart ?? now) : now,
  }
}

// An action by Claude or an agent: the bar starts from where it is on screen and moves one notch.
export function advance(plan: Plan, now: number): Plan {
  return {
    ...plan,
    from: visiblePosition(plan, elapsedSince(plan, now)),
    movedAt: now,
    actions: (plan.actions ?? 0) + 1,
  }
}

// Claude is done: the bar starts from where it is on screen and goes all the way to the end.
export function finish(plan: Plan, now: number): Plan {
  return { ...plan, from: visiblePosition(plan, elapsedSince(plan, now)), movedAt: now, done: true }
}
