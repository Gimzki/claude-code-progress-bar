// `from`: where the bar actually was on screen at the last move, from 0 to 1.
// `movedAt`: the time (ms) of the last move; each drawing resumes its animation from there.
// `actions`: the actions of Claude and its agents since the step began; each one is a notch.
// `done`: Claude has finished; the bar fills up to the end, then fades out.
// `stepStart`: the time (ms) the current step began; the step change plays from there.
export type Plan = { steps: string[]; step: number; from: number; movedAt: number; stepStart?: number; actions?: number; done?: boolean }

// An agent tracked during the turn: its start and end times, its actions, its tokens at the end.
export type TrackedAgent = {
  id: string
  start: number
  end?: number
  actions: number
  tokens?: number
  model?: string
  stopped?: boolean
}

// The turn in progress: the person's request, the time, Claude's actions, the start of each step
// and the agents launched. Kept after the end so that the panel can show the summary.
export type Turn = {
  text: string
  stepNames: string[]
  start: number
  end?: number
  stopped?: boolean
  actions: number
  stepStarts: { step: number; start: number }[]
  agents: TrackedAgent[]
}

// What the band shows: the steps, each announced step with its time (ms), the time of the end.
// Written only when a step changes or the work ends: the band does not move in between.
export type BandView = { steps: string[]; events: [number, number][]; end: number | null; seed?: number }

declare module 'claude-code' {
  interface PluginState {
    'progress-bar': { plan: Plan | null; turn: Turn | null; tick: number; view: BandView | null }
  }
}
