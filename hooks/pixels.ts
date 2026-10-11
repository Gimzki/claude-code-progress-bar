// Les petits dessins du panneau: un indicateur pour chaque agent (les quatre points qui dansent,
// comme la barre), les icônes d'étape, et une mini-barre en grille de points, dans l'orange de la
// barre. Le panneau est redessiné chaque seconde: chaque animation part de l'heure, pour reprendre
// où elle en était au lieu de repartir de zéro.
import { danseDe, indicateurSvg, ORANGE } from './points'

const PALE = '#F3D6CB'
const GRIS = '#8A8A8A'

// Une boucle de `periode` secondes reprise à l'heure `maintenant` (ms): son `begin` négatif.
const reprise = (maintenant: number, periode: number) => `-${((maintenant / 1000) % periode).toFixed(3)}s`

export type EtatAgent = 'actif' | 'fini' | 'arrete'

// Un agent au travail: quatre points qui dansent, une danse par agent; fini: un point plein; arrêté:
// un point gris.
export function agentSvg(etat: EtatAgent, rang = 0, maintenant = 0): string {
  if (etat === 'actif') {
    const danse = danseDe(rang)
    return indicateurSvg(rang, 22, danse, reprise(maintenant, danse.cycle))
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="-11 -11 22 22"><circle r="3" fill="${etat === 'fini' ? ORANGE : GRIS}"/></svg>`
}

// Les icônes d'étape, au trait comme celles de l'app: faite (cercle coché), en cours (anneau qui
// tourne), à venir (cercle discret).
export type EtatEtape = 'faite' | 'courante' | 'a-venir'

const CERCLE = 'cx="8" cy="8" r="6.25"'
const TRAIT = 'fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'

export function icone(etat: EtatEtape, maintenant = 0): string {
  const ouvrir = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">`
  if (etat === 'faite') {
    return `${ouvrir}<g ${TRAIT} stroke="${ORANGE}"><circle ${CERCLE}/><path d="M5.3 8.3l1.9 1.9 3.6-3.9"/></g></svg>`
  }
  if (etat === 'courante') {
    return (
      `${ouvrir}<g ${TRAIT}><circle ${CERCLE} stroke="#808080" stroke-opacity=".35"/>` +
      `<path d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" stroke="${ORANGE}"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" begin="${reprise(maintenant, 0.9)}" repeatCount="indefinite"/></path></g></svg>`
    )
  }
  return `${ouvrir}<circle ${CERCLE} ${TRAIT} stroke="#808080" stroke-opacity=".55"/></svg>`
}

// Une mini-barre en grille de points sur une piste arrondie, comme la barre principale: une fraction
// de 0 à 1, ou `null` quand l'avancement est inconnu: un balayage clair passe alors en boucle.
export function barreMini(fraction: number | null, largeur = 300, couleur = ORANGE, rangees = 3, maintenant = 0): string {
  const pas = 4
  const cote = 3
  const marge = 2
  const cols = Math.floor((largeur - 2 * marge + (pas - cote)) / pas)
  const haut = rangees * pas - (pas - cote) + 2 * marge
  const fond = `<pattern id="f" x="${marge}" y="${marge}" width="${pas}" height="${pas}" patternUnits="userSpaceOnUse"><rect width="${cote}" height="${cote}" rx=".6" fill="#808080" fill-opacity=".22"/></pattern>`
  const plein = `<pattern id="r" x="${marge}" y="${marge}" width="${pas}" height="${pas}" patternUnits="userSpaceOnUse"><rect width="${cote}" height="${cote}" rx=".6" fill="${couleur}"/></pattern>`
  const pale = `<pattern id="q" x="${marge}" y="${marge}" width="${pas}" height="${pas}" patternUnits="userSpaceOnUse"><rect width="${cote}" height="${cote}" rx=".6" fill="${PALE}"/></pattern>`
  const piste = `<rect width="${largeur}" height="${haut}" rx="4" fill="#808080" fill-opacity=".12"/>`
  const grille = `x="${marge}" y="${marge}" width="${cols * pas - (pas - cote)}" height="${haut - 2 * marge}"`
  const ouvrir = `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${haut}" viewBox="0 0 ${largeur} ${haut}">`

  if (fraction === null) {
    const balai = 10 * pas
    return (
      ouvrir +
      `<defs>${fond}${pale}<linearGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${largeur}" height="${haut}"><g><animateTransform attributeName="transform" type="translate" from="${-balai} 0" to="${largeur} 0" dur="1.6s" begin="${reprise(maintenant, 1.6)}" repeatCount="indefinite"/><rect width="${balai}" height="${haut}" fill="url(#g)"/></g></mask></defs>` +
      `${piste}<rect ${grille} fill="url(#f)"/><rect ${grille} fill="url(#q)" mask="url(#m)"/></svg>`
    )
  }

  const allumees = Math.round(Math.min(1, Math.max(0, fraction)) * cols)
  return (
    ouvrir +
    `<defs>${fond}${plein}</defs>` +
    `${piste}<rect ${grille} fill="url(#f)"/>` +
    (allumees > 0 ? `<rect x="${marge}" y="${marge}" width="${allumees * pas}" height="${haut - 2 * marge}" fill="url(#r)"/>` : '') +
    `</svg>`
  )
}
