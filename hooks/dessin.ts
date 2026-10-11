import type { Plan } from '../types'
import { positionVisible } from './mouvement'

const MAX_ETAPES = 8

// Un plan gardé par une version plus ancienne du mod n'a pas d'heure de début: on le prend tel quel.
const ecouleDepuis = (plan: Plan, maintenant: number) =>
  Number.isFinite(plan.debut) ? Math.max(0, (maintenant - plan.debut) / 1000) : 0

// Lit l'appel de l'outil (`steps`, `step`): le plan envoyé, ou celui déjà affiché quand Claude ne donne
// que le numéro. Le même numéro deux fois ne relance rien; une nouvelle étape part de la position
// réelle à l'écran. Les refus sont lus par le modèle: en anglais.
export function lirePlan(args: Record<string, unknown>, avant: Plan | null, maintenant: number): Plan | string {
  const etape = args.step
  if (typeof etape !== 'number' || !Number.isInteger(etape) || etape < 1) {
    return '`step` must be an integer, 1 for the first step.'
  }

  const enCours = avant && !avant.fini ? avant : null
  const envoyees = Array.isArray(args.steps)
    ? args.steps.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean)
    : []
  const etapes = envoyees.length > 0 ? envoyees.slice(0, MAX_ETAPES) : enCours?.etapes

  if (!etapes || etapes.length === 0) {
    return 'No plan shown: send `steps` first, with `step: 1`.'
  }

  const borne = Math.min(etape, etapes.length)
  if (enCours && enCours.etape === borne && enCours.etapes.join('\n') === etapes.join('\n')) return enCours

  return {
    etapes,
    etape: borne,
    depuis: enCours ? positionVisible(enCours, ecouleDepuis(enCours, maintenant)) : 0,
    debut: maintenant,
    etapeDepuis: enCours && enCours.etape === borne ? (enCours.etapeDepuis ?? maintenant) : maintenant,
  }
}

// Une action de Claude ou d'un agent: la barre part d'où elle est à l'écran et avance d'un cran.
export function avancer(plan: Plan, maintenant: number): Plan {
  return {
    ...plan,
    depuis: positionVisible(plan, ecouleDepuis(plan, maintenant)),
    debut: maintenant,
    actions: (plan.actions ?? 0) + 1,
  }
}

// Claude a fini: la barre part d'où elle est à l'écran et va jusqu'au bout.
export function terminer(plan: Plan, maintenant: number): Plan {
  return { ...plan, depuis: positionVisible(plan, ecouleDepuis(plan, maintenant)), debut: maintenant, fini: true }
}
