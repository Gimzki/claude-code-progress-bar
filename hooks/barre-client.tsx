// La barre, dessinée par l'app de bureau elle-même (module de surface d'un Client). L'app garde ce
// dessin tel quel quand elle reconstruit la bande, ce qu'elle fait à chaque réponse du moteur: une
// image Svg posée directement dans la bande y serait recréée à chaque fois, et son animation
// repartirait de zéro. Ici, l'image n'est refaite que quand les props changent (une étape, la fin)
// ou que la bande change de largeur, et elle est alors calculée à l'heure exacte: la suite est continue.
import type { ClientModule } from 'claude-code'

import { sceneSvg, type Vue } from './points'

export type PropsBarre = { vue: Vue; alt: string }

// Une étape arrive ici un peu après que le moteur l'a notée. Partir de l'heure du moteur ferait
// sauter l'image du temps de ce trajet; on part donc de l'heure où l'affichage la voit, sans dépasser
// DECALAGE_MAX: le moteur retire la bande d'après ses heures à lui, avec une marge à peine plus grande
// (register.tsx), et la barre doit avoir fini son fondu avant. Ce qui était déjà arrivé quand
// l'affichage a vu le plan pour la première fois garde son heure, sauf ce qui vient d'arriver.
const RECENT_MS = 1500
const DECALAGE_MAX = 400
type Vu = { ev: number[]; fin: number | null }
const vus = new Map<string, Vu>()

function calee(vue: Vue, maintenant: number): Vue {
  const cle = `${vue.n}:${vue.ev[0]?.[1] ?? 0}`
  let vu = vus.get(cle)
  const cale = (t: number) => Math.min(Math.max(t, maintenant), t + DECALAGE_MAX)
  const heure = (t: number, premiere: boolean) => (premiere && maintenant - t >= RECENT_MS ? t : cale(t))
  const premiere = vu === undefined
  if (vu === undefined) {
    vu = { ev: [], fin: null }
    vus.set(cle, vu)
    // Un plan à la fois par bande; on garde les huit derniers.
    for (const autre of [...vus.keys()].slice(0, -8)) vus.delete(autre)
  }
  for (let i = vu.ev.length; i < vue.ev.length; i++) {
    // Jamais avant l'étape d'avant: l'ordre de l'histoire est gardé.
    vu.ev.push(Math.max(heure(vue.ev[i]![1], premiere), vu.ev[i - 1] ?? -Infinity))
  }
  if (vue.fin !== null && vu.fin === null) vu.fin = Math.max(heure(vue.fin, premiere), vu.ev.at(-1) ?? -Infinity)
  return { n: vue.n, ev: vue.ev.map(([s], i) => [s, vu.ev[i]!] as [number, number]), fin: vue.fin === null ? null : vu.fin, graine: vue.graine }
}

// Chaque image porte l'heure et un compte: jamais deux sources identiques.
let compte = 0

const BarreClient: ClientModule<PropsBarre> = props => {
  const maintenant = Date.now()
  compte += 1
  // L'élément Svg n'est pas dans la table d'un module de surface, mais l'app de bureau le dessine:
  // il passe par h, comme les autres.
  return h('Svg', { source: sceneSvg(calee(props.vue, maintenant), maintenant, `${maintenant}.${compte}`), alt: props.alt, width: 4096, height: 26 }) as ReturnType<ClientModule>
}

export default BarreClient
