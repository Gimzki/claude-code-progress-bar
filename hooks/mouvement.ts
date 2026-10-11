import type { Plan } from '../types'

// Les temps du mouvement, partagés avec le dessin: une nouvelle étape, une action, la fin.
export const GLISSE_S = 0.9
export const CRAN_S = 0.45
export const FIN_S = 0.7
export const COURBE_GLISSE = [0.22, 1, 0.36, 1] as const

// Claude travaille par actions: il réfléchit, lance un outil (lire, chercher, écrire, lancer un
// agent), lit le résultat, puis recommence. La barre suit ce rythme et rien d'autre: une nouvelle
// étape la fait glisser au début de l'étape, et chaque action, la sienne ou celle d'un agent, la
// fait avancer d'un cran dans l'étape. Les crans rapetissent (la moitié de l'étape en 8 actions)
// pour ne jamais atteindre l'étape suivante avant que Claude l'annonce. Entre deux actions, Claude
// réfléchit: la barre reste où elle est, seule sa tête respire. Plus rien n'avance avec le temps,
// parce que le temps ne dit rien du travail fait.
const DEMI_ETAPE = 8
const FIN_ETAPE = 0.9

// La complétude, en secondes depuis la fin du travail. Tout se passe sur place, rien ne recule:
// la barre arrive au bout et passe au rouge uniforme, un éclat part du bout, un voile clair passe
// sur toute la barre, puis les carrés s'éteignent par groupes mêlés pendant que des étincelles
// clignotent.
export const COMPLETUDE = {
  uni: FIN_S,
  eclat: 0.72,
  voile: 0.78,
  dissout: 0.95,
  etalement: 0.85,
  etincelles: 0.9,
  fenetre: 1.0,
  sortie: 1.95,
  sortieDur: 0.35,
} as const
export const COMPLETUDE_S = COMPLETUDE.sortie + COMPLETUDE.sortieDur

// La courbe de Bézier que suit SMIL avec keySplines, pour savoir où la barre est à l'écran.
function bezier([x1, y1, x2, y2]: readonly [number, number, number, number], p: number): number {
  if (p <= 0) return 0
  if (p >= 1) return 1
  const coord = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  let bas = 0
  let haut = 1
  for (let i = 0; i < 30; i++) {
    const t = (bas + haut) / 2
    if (coord(x1, x2, t) < p) bas = t
    else haut = t
  }
  return coord(y1, y2, (bas + haut) / 2)
}

// Où la barre doit aller pour ce plan, sans jamais reculer: le début de l'étape, plus un cran par
// action faite dans l'étape.
export function cible(plan: Plan): number {
  if (plan.fini) return 1
  const n = plan.etapes.length
  const debut = (plan.etape - 1) / n
  const actions = plan.actions ?? 0
  return Math.max(plan.depuis, debut + ((FIN_ETAPE / n) * actions) / (actions + DEMI_ETAPE))
}

// La durée du dernier mouvement: une glisse pour une étape, un cran plus vif pour une action.
export function dureeMouvement(plan: Plan): number {
  if (plan.fini) return FIN_S
  return (plan.actions ?? 0) > 0 ? CRAN_S : GLISSE_S
}

// Où la barre se trouve à l'écran, `ecoule` secondes après le dernier mouvement.
export function positionVisible(plan: Plan, ecoule: number): number {
  return plan.depuis + (cible(plan) - plan.depuis) * bezier(COURBE_GLISSE, ecoule / dureeMouvement(plan))
}
