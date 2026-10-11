import type { Plan } from '../types'

// The motion timings, shared with the drawing: a new step, an action, the end.
export const GLIDE_S = 0.9
export const NUDGE_S = 0.45
export const END_S = 0.7
export const GLIDE_CURVE = [0.22, 1, 0.36, 1] as const

// Claude works in actions: it thinks, runs a tool (read, search, write, launch an agent), reads the
// result, then starts again. The bar follows this rhythm and nothing else: a new step makes it glide
// to the start of the step, and each action, Claude's own or an agent's, nudges it one notch further
// into the step. The notches shrink (half the step in 8 actions) so that it never reaches the next
// step before Claude announces it. Between two actions, Claude is thinking: the bar stays where it is,
// only its head breathes. Nothing moves with time any more, because time says nothing about the work
// done.
const HALF_STEP_ACTIONS = 8
const STEP_CEILING = 0.9

// The completion, in seconds since the work ended. Everything happens in place, nothing moves back:
// the bar reaches the end and turns solid red, a flash leaves from the end, a light veil sweeps over
// the whole bar, then the squares go out in mixed groups while sparks blink.
export const COMPLETION = {
  solid: END_S,
  flash: 0.72,
  veil: 0.78,
  dissolve: 0.95,
  spread: 0.85,
  sparks: 0.9,
  window: 1.0,
  exit: 1.95,
  exitDur: 0.35,
} as const
export const COMPLETION_S = COMPLETION.exit + COMPLETION.exitDur

// The Bezier curve SMIL follows with keySplines, to know where the bar is on screen.
function bezier([x1, y1, x2, y2]: readonly [number, number, number, number], p: number): number {
  if (p <= 0) return 0
  if (p >= 1) return 1
  const coord = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2
    if (coord(x1, x2, t) < p) lo = t
    else hi = t
  }
  return coord(y1, y2, (lo + hi) / 2)
}

// Where the bar must go for this plan, never moving back: the start of the step, plus one notch per
// action done in the step.
export function target(plan: Plan): number {
  if (plan.done) return 1
  const n = plan.steps.length
  const start = (plan.step - 1) / n
  const actions = plan.actions ?? 0
  return Math.max(plan.from, start + ((STEP_CEILING / n) * actions) / (actions + HALF_STEP_ACTIONS))
}

// The duration of the last move: a glide for a step, a quicker nudge for an action.
export function moveDuration(plan: Plan): number {
  if (plan.done) return END_S
  return (plan.actions ?? 0) > 0 ? NUDGE_S : GLIDE_S
}

// Where the bar is on screen, `elapsed` seconds after the last move.
export function visiblePosition(plan: Plan, elapsed: number): number {
  return plan.from + (target(plan) - plan.from) * bezier(GLIDE_CURVE, elapsed / moveDuration(plan))
}
