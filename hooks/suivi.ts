// Le suivi d'un tour, en fonctions pures: ce que le panneau de progression affiche.
import type { AgentSuivi, Plan, Tour } from '../types'

export function nouveauTour(texte: string, maintenant: number): Tour {
  const propre = texte.replace(/\s+/g, ' ').trim()
  return {
    texte: propre.length > 90 ? `${propre.slice(0, 89)}…` : propre || 'Demande en cours',
    noms: [],
    debut: maintenant,
    actions: 0,
    etapes: [],
    agents: [],
  }
}

const avecAgent = (tour: Tour, id: string, maintenant: number, change: (a: AgentSuivi) => AgentSuivi): Tour => {
  const existe = tour.agents.some(a => a.id === id)
  const agents = existe ? tour.agents : [...tour.agents, { id, debut: maintenant, actions: 0 }]
  return { ...tour, agents: agents.map(a => (a.id === id ? change(a) : a)) }
}

// Une action de Claude (agentId absent) ou d'un de ses agents.
export function compterAction(tour: Tour, agentId: string | undefined, maintenant: number): Tour {
  if (agentId === undefined) return { ...tour, actions: tour.actions + 1 }
  return avecAgent(tour, agentId, maintenant, a => ({ ...a, actions: a.actions + 1 }))
}

// Une étape commence: on note l'heure, une seule fois par étape, et on garde le nom des étapes pour
// que le panneau puisse encore les montrer une fois la barre effacée.
export function noterEtape(tour: Tour, plan: Plan, maintenant: number): Tour {
  const derniere = tour.etapes.at(-1)
  const noms = plan.etapes
  if (derniere?.etape === plan.etape) return { ...tour, noms }
  return { ...tour, noms, etapes: [...tour.etapes, { etape: plan.etape, debut: maintenant }] }
}

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; model: string }

export function finirAgent(tour: Tour, agentId: string, maintenant: number, usage: Usage | undefined, arrete: boolean): Tour {
  return avecAgent(tour, agentId, maintenant, a => ({
    ...a,
    fin: maintenant,
    arrete,
    modele: usage?.model ?? a.modele,
    jetons: usage
      ? usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      : a.jetons,
  }))
}

export function finirTour(tour: Tour, maintenant: number, arrete: boolean): Tour {
  return { ...tour, fin: maintenant, arrete }
}

// 42s, 7min 56s, 1h 2min: les durées écrites comme l'app les écrit dans la conversation.
export function duree(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return m > 0 ? `${m}min ${s % 60}s` : `${s}s`
}

// 840, 41 k, 1,2 M (1.2 M en anglais)
export function nombre(n: number, langue: 'en' | 'fr' = 'fr'): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${Math.round(n / 1000)} k`
  const millions = (n / 1_000_000).toFixed(1)
  return `${langue === 'fr' ? millions.replace('.', ',') : millions} M`
}

// claude-opus-5-5 -> Opus 5.5
export function nomModele(id: string | undefined): string | undefined {
  if (!id) return undefined
  const m = /claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}` : id
}
