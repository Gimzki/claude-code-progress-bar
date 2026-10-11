// Tracking a turn, in pure functions: what the progress panel shows.
import type { Plan, TrackedAgent, Turn } from '../types'

export function newTurn(text: string, now: number): Turn {
  const clean = text.replace(/\s+/g, ' ').trim()
  return {
    text: clean.length > 90 ? `${clean.slice(0, 89)}…` : clean || 'Demande en cours',
    stepNames: [],
    start: now,
    actions: 0,
    stepStarts: [],
    agents: [],
  }
}

const withAgent = (turn: Turn, id: string, now: number, change: (a: TrackedAgent) => TrackedAgent): Turn => {
  const exists = turn.agents.some(a => a.id === id)
  const agents = exists ? turn.agents : [...turn.agents, { id, start: now, actions: 0 }]
  return { ...turn, agents: agents.map(a => (a.id === id ? change(a) : a)) }
}

// An action by Claude (no agentId) or by one of its agents.
export function countAction(turn: Turn, agentId: string | undefined, now: number): Turn {
  if (agentId === undefined) return { ...turn, actions: turn.actions + 1 }
  return withAgent(turn, agentId, now, a => ({ ...a, actions: a.actions + 1 }))
}

// A step begins: its time is recorded, once per step, and the step names are kept so that the panel
// can still show them once the bar is gone.
export function recordStep(turn: Turn, plan: Plan, now: number): Turn {
  const last = turn.stepStarts.at(-1)
  const stepNames = plan.steps
  if (last?.step === plan.step) return { ...turn, stepNames }
  return { ...turn, stepNames, stepStarts: [...turn.stepStarts, { step: plan.step, start: now }] }
}

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; model: string }

export function endAgent(turn: Turn, agentId: string, now: number, usage: Usage | undefined, stopped: boolean): Turn {
  return withAgent(turn, agentId, now, a => ({
    ...a,
    end: now,
    stopped,
    model: usage?.model ?? a.model,
    tokens: usage
      ? usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      : a.tokens,
  }))
}

export function endTurn(turn: Turn, now: number, stopped: boolean): Turn {
  return { ...turn, end: now, stopped }
}

// 42s, 7min 56s, 1h 2min: durations written the way the app writes them in the conversation.
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return m > 0 ? `${m}min ${s % 60}s` : `${s}s`
}

// 840, 41 k, 1,2 M (1.2 M in English)
export function compactNumber(n: number, language: 'en' | 'fr' = 'fr'): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${Math.round(n / 1000)} k`
  const millions = (n / 1_000_000).toFixed(1)
  return `${language === 'fr' ? millions.replace('.', ',') : millions} M`
}

// claude-opus-5-5 -> Opus 5.5
export function modelName(id: string | undefined): string | undefined {
  if (!id) return undefined
  const m = /claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}` : id
}
