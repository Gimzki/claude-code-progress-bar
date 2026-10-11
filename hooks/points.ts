// La barre en points, dans la langue de l'indicateur de travail de Claude: quatre points orange.
// - Chaque étape est un point sur un fil de petits points, réparti sur toute la largeur de la bande.
// - Une étape à venir est un point gris, endormi.
// - L'étape en cours est un indicateur de quatre points orange qui dansent; chaque étape a sa propre
//   danse (huit en tout), tirées dans un ordre différent à chaque tâche.
// - Quand l'étape finit, ses quatre points se rejoignent en un seul, qui pulse et reste: l'étape est
//   faite. Un point messager part de là, glisse sur le fil jusqu'à l'étape suivante en allumant le
//   fil derrière lui, et s'y sépare en quatre: l'étape suivante commence. Une étape annoncée pendant
//   qu'il glisse le fait changer de cap sans s'arrêter; une étape sautée est faite à son passage.
// - À la fin, le dernier indicateur se rejoint en un point (le messager en route finit d'abord son
//   vol), les étapes restantes s'allument, tous les points pulsent ensemble, puis la barre s'efface.
// Tout se déduit de l'histoire des étapes et de l'heure: un même instant donne le même dessin, quel
// que soit le nombre d'images refaites avant. Animation en SMIL et en CSS, sans hasard; une animation
// ponctuelle déjà jouée n'est plus écrite, son état final devient l'état de l'image.

const HAUT = 26
const CY = 13

// Les couleurs: l'orange de l'indicateur de Claude, mesuré sur l'app; le gris neutre des deux thèmes.
export const ORANGE = '#CC7C5E'
const GRIS = '#8B8C8A'

// Un point de l'indicateur: son rayon; le demi-côté du carré; l'écart des points en rang.
const RAYON = 2.2
const DEMI = 5.75
const RANG = 5

// Les étapes: un point fait, un point endormi, et le fil de petits points qui les relie (sa garde:
// le rayon autour de chaque étape où il s'interrompt; sa portée: assez long pour la bande la plus
// large, compté depuis le milieu de chaque intervalle).
const POINT = { fait: 3, dort: 2.2, dortOpacite: 0.42 }
const FIL = { rayon: 0.9, pas: 6, garde: 16, portee: 2100, opacite: 0.26, opaciteFait: 0.55 }

const n2 = (v: number) => String(+v.toFixed(2))
const n3 = (v: number) => String(+v.toFixed(3))
const modulo = (v: number, m: number) => ((v % m) + m) % m
const borne = (v: number) => Math.min(1, Math.max(0, v))
// Les courbes des danses: douce (lente au départ et à l'arrivée), cloche (0, 1, puis 0), rebond
// (dépasse un peu sa cible avant de s'y poser).
const douce = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2)
const cloche = (p: number) => Math.sin(Math.PI * borne(p)) ** 2
const rebond = (p: number) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2
const tourne = ([x, y]: [number, number], a: number): [number, number] => [
  x * Math.cos(a) - y * Math.sin(a),
  x * Math.sin(a) + y * Math.cos(a),
]

// La courbe de Bézier que suit SMIL avec keySplines: où l'on en est (0 à 1) à la fraction `p` du temps.
function bezier(courbe: string, p: number): number {
  const [x1, y1, x2, y2] = courbe.split(' ').map(Number) as [number, number, number, number]
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

// L'inverse: à quelle fraction du temps la courbe atteint `v`.
function tempsPour(courbe: string, v: number): number {
  let bas = 0
  let haut = 1
  for (let i = 0; i < 30; i++) {
    const m = (bas + haut) / 2
    if (bezier(courbe, m) < v) bas = m
    else haut = m
  }
  return (bas + haut) / 2
}

// Les quatre coins du carré, dans l'ordre des aiguilles d'une montre.
const COINS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

// Une danse: la durée d'un cycle, et où est le point `i` (0 à 3) à la fraction `f` du cycle, autour
// du centre. À la fin du cycle, les quatre points retrouvent les places du début (un point peut prendre
// la place d'un autre: ils sont identiques, la boucle ne se voit pas).
export type Danse = { nom: string; cycle: number; position: (i: number, f: number) => [number, number] }

export const DANSES: Danse[] = [
  // 1. Les paires: le carré tourne d'un quart de tour et se resserre en deux points, puis se rouvre.
  {
    nom: 'Les paires',
    cycle: 1.5,
    position: (i, f) => {
      const serre = f < 0.35 ? 1 - douce(f / 0.35) : f < 0.5 ? 0 : f < 0.85 ? douce((f - 0.5) / 0.35) : 1
      const [sx, sy] = COINS[i]!
      return tourne([sx * DEMI, sy * DEMI * serre], (f * Math.PI) / 2)
    },
  },
  // 2. L'orbite: les points font le tour d'un cercle; ils se serrent en comète au milieu du tour,
  //    quand ils vont le plus vite, et se répartissent quand ils ralentissent.
  {
    nom: "L'orbite",
    cycle: 1.5,
    position: (i, f) => {
      const ecart = Math.PI / 2 - (Math.PI / 2 - 0.42) * cloche(f)
      const angle = 2 * Math.PI * douce(f) - Math.PI / 2 - i * ecart
      return [6 * Math.cos(angle), 6 * Math.sin(angle)]
    },
  },
  // 3. Le pendule: les points en rang, comme un pendule de Newton; celui de gauche part et revient
  //    frapper, puis celui de droite.
  {
    nom: 'Le pendule',
    cycle: 1.5,
    position: (i, f) => {
      const x = (i - 1.5) * RANG
      const cote = i === 0 ? -1 : i === 3 ? 1 : 0
      const p = i === 0 ? borne(f / 0.5) : borne((f - 0.5) / 0.5)
      const elan = cote === 0 ? 0 : Math.sin(Math.PI * p)
      return [x + cote * 5 * elan, -1.6 * elan * elan]
    },
  },
  // 4. La vague: les points en rang sautent l'un après l'autre.
  {
    nom: 'La vague',
    cycle: 1.2,
    position: (i, f) => {
      const u = modulo(f - i * 0.11, 1)
      return [(i - 1.5) * RANG, u < 0.42 ? -3.4 * cloche(u / 0.42) : 0]
    },
  },
  // 5. Le tourbillon: les points s'enroulent vers le centre en tournant de plus en plus vite, puis
  //    se déroulent.
  {
    nom: 'Le tourbillon',
    cycle: 2,
    position: (i, f) => {
      const rayon = 6.2 - 4.8 * cloche(f)
      const angle = 2 * Math.PI * douce(f) + (i * Math.PI) / 2 - (3 * Math.PI) / 4
      return [rayon * Math.cos(angle), rayon * Math.sin(angle)]
    },
  },
  // 6. L'étoile: le carré se rejoint au centre, ressort en croix, se rejoint encore et ressort en carré.
  {
    nom: "L'étoile",
    cycle: 2,
    position: (i, f) => {
      const croix = f >= 0.3 && f < 0.8
      const rayon =
        f < 0.1 ? 6 : f < 0.3 ? 6 * (1 - douce((f - 0.1) / 0.2)) : f < 0.5 ? 6 * rebond((f - 0.3) / 0.2) : f < 0.6 ? 6 : f < 0.8 ? 6 * (1 - douce((f - 0.6) / 0.2)) : 6 * rebond((f - 0.8) / 0.2)
      const angle = (croix ? 0 : Math.PI / 4) + (i * Math.PI) / 2 - Math.PI / 2
      return [rayon * Math.cos(angle), rayon * Math.sin(angle)]
    },
  },
  // 7. Les satellites: deux paires qui tournent chacune sur elle-même, et l'une autour de l'autre.
  {
    nom: 'Les satellites',
    cycle: 2,
    position: (i, f) => {
      const autour = Math.PI * douce(f)
      const surSoi = -2 * Math.PI * f
      const signe = i < 2 ? 1 : -1
      const [cx, cy] = [signe * 5 * Math.cos(autour), signe * 5 * Math.sin(autour)]
      const bout = i % 2 === 0 ? 1 : -1
      return [cx + bout * 2.6 * Math.cos(surSoi), cy + bout * 2.6 * Math.sin(surSoi)]
    },
  },
  // 8. L'échange: deux coins opposés échangent leur place en se croisant, puis les deux autres.
  {
    nom: "L'échange",
    cycle: 2,
    position: (i, f) => {
      const premier = i === 0 || i === 2
      const debut = premier ? 0.08 : 0.54
      const e = douce(borne((f - debut) / 0.38))
      const [sx, sy] = COINS[i]!
      const depart: [number, number] = [sx * DEMI, sy * DEMI]
      // Chacun passe d'un côté du centre: ils se croisent sans se toucher.
      const [nx, ny] = [-sy / Math.SQRT2, sx / Math.SQRT2]
      const bosse = 2.9 * Math.sin(Math.PI * e)
      return [depart[0] * (1 - 2 * e) + nx * bosse, depart[1] * (1 - 2 * e) + ny * bosse]
    },
  },
]

// L'ordre des danses d'une tâche: tiré au hasard d'après sa graine, toujours le même pour une même
// graine (chaque dessin d'une tâche retrouve les mêmes danses), sans qu'une danse revienne deux fois.
export function ordreDes(graine: number): number[] {
  // La graine est une heure: deux tâches proches ont des graines proches. On la brasse d'abord, bits
  // hauts compris, pour que leurs ordres n'aient rien à voir.
  const brasse = (x: number) => {
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
    return (x ^ (x >>> 16)) >>> 0
  }
  let etat = brasse((graine >>> 0) ^ brasse(Math.floor(graine / 4294967296)))
  const hasard = () => {
    etat = (etat + 0x6d2b79f5) >>> 0
    let x = etat
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  const ordre = DANSES.map((_, i) => i)
  for (let i = ordre.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1))
    ;[ordre[i], ordre[j]] = [ordre[j]!, ordre[i]!]
  }
  return ordre
}

// La danse de l'étape `k` (0 pour la première): dans l'ordre de la tâche si elle a une graine, sinon
// dans l'ordre de la liste.
export const danseDe = (k: number, graine?: number) => {
  const i = modulo(k, DANSES.length)
  return DANSES[graine === undefined ? i : ordreDes(graine)[i]!]!
}

// Où sont les quatre points d'une danse `t` secondes après sa naissance, autour de son centre.
export const positionsA = (danse: Danse, t: number) =>
  [0, 1, 2, 3].map(i => danse.position(i, modulo(t, danse.cycle) / danse.cycle))

// La danse en SMIL: chaque point suit ses positions, relevées 48 fois par cycle, à partir de `debut`.
const RELEVES = 48
function danseSvg(danse: Danse, debut: string): string {
  return [0, 1, 2, 3]
    .map(i => {
      const valeurs = Array.from({ length: RELEVES + 1 }, (_, j) => danse.position(i, j / RELEVES).map(n2).join(' ')).join(';')
      return `<circle r="${RAYON}" fill="${ORANGE}"><animateTransform attributeName="transform" type="translate" values="${valeurs}" dur="${danse.cycle}s" begin="${debut}" repeatCount="indefinite"/></circle>`
    })
    .join('')
}

// L'indicateur seul (un aperçu, un agent du panneau): la danse de l'étape `k`, centrée, reprise à
// `debut` (un begin SMIL).
export function indicateurSvg(k: number, cote = 32, danse: Danse = danseDe(k), debut = '0s'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cote}" height="${cote}" viewBox="-16 -16 32 32">${danseSvg(danse, debut)}</svg>`
}

// ---------------------------------------------------------------------------------------------
// La chronologie: tout ce que la barre montre se déduit de l'histoire des étapes, sans rien d'autre.
// Une même histoire donne le même dessin à un instant donné, quel que soit le nombre de dessins faits
// avant: c'est ce qui garde l'animation continue quand l'image est refaite.

// Ce que la barre doit savoir: le nombre d'étapes, chaque étape annoncée avec son heure (ms), et
// l'heure de la fin du travail.
// `graine` tire l'ordre des danses de la tâche.
export type Vue = { n: number; ev: [number, number][]; fin: number | null; graine?: number }

// Les temps, en millisecondes.
const MS = {
  entree: 240, // la barre apparaît: le fil et les points endormis se dessinent en fondu
  entreePas: 40, // une étape après l'autre
  rejoint: 260, // les quatre points se rejoignent en un, sans perdre leur élan
  pulse: 420, // le point fait pulse une fois en apparaissant
  pose: 260, // à la fin, il apparaît sans dépasser: la pulsation commune est le seul battement
  depart: 300, // le messager quitte l'étape faite
  separe: 350, // à l'arrivée, il se sépare en quatre
  fondu: 100, // un point endormi s'efface quand le messager arrive ou passe
  finPulse: 600, // tous les points pulsent ensemble
  finPulseDur: 500,
  sortie: 1800, // puis la barre s'efface
  sortieDur: 400,
}
// Le temps de la fin, du début de la fin visible jusqu'à l'effacement complet.
export const FIN_VISUELLE_MS = MS.sortie + MS.sortieDur

const COURBES = {
  douce: '.65 0 .35 1',
  sortie: '.2 .8 .3 1',
  vol: '.45 0 .3 1',
}
// Les tailles d'un point fait: rayon 3; à l'échelle 0,733 il a la taille d'un point de danse (2,2):
// il naît donc là où les quatre points se sont rejoints, sans rapetisser.
const NAISSANCE = n3(RAYON / POINT.fait)

// Le trajet du messager: plus long sur un grand écart, sans jamais filer trop vite.
const dureeVol = (ecart: number, n: number) => 480 + 620 * Math.sqrt(Math.min(1, Math.abs(ecart) / Math.max(1, n - 1)))

// Un vol du messager, en positions d'étape (0 pour la première; une fraction entre deux).
type Vol = { de: number; a: number; t0: number; dur: number; courbe: string; fin: number }
type Noeud = {
  dort: number // quand le point endormi commence à s'effacer (Infinity: il reste)
  danse: { debut: number; fin: number } | null // née à `debut` (séparation), rejointe à `fin`
  rejoint: number | null // quand ses quatre points commencent à se rejoindre
  fait: number | null // quand le point fait apparaît (-Infinity: déjà là)
  pulse: 'fort' | 'doux' | null // fort: il pulse; doux: il se pose sans dépasser; null: déjà là
}
export type Chronologie = {
  n: number
  noeuds: Noeud[]
  vols: Vol[]
  // Le début du plan, l'étape de départ, la dernière étape visée, et le début de la fin (null
  // pendant le travail).
  debutPlan: number
  depart: number
  cible: number
  finDebut: number | null
}

const posVol = (v: Vol, t: number) => v.de + (v.a - v.de) * bezier(v.courbe, (t - v.t0) / v.dur)

export function chronologie(vue: Vue): Chronologie {
  const n = Math.max(1, Math.round(vue.n))
  const etapeDe = (s: number) => Math.min(n - 1, Math.max(0, Math.round(s) - 1))
  const debutPlan = vue.ev[0]?.[1] ?? 0
  const ev = vue.ev
  const noeuds: Noeud[] = Array.from({ length: n }, () => ({ dort: Infinity, danse: null, rejoint: null, fait: null, pulse: null }))
  const vols: Vol[] = []
  if (ev.length === 0) return { n, noeuds, vols, debutPlan, depart: 0, cible: 0, finDebut: null }

  let depart = 0
  let cible = 0
  let vol: Vol | null = null
  // Partir de l'étape `s` à `t`: les étapes d'avant sont faites, celle-ci danse. C'est aussi ce que fait
  // un vrai retour en arrière: l'histoire repart de lui.
  const commencer = (s: number, t: number) => {
    depart = etapeDe(s)
    for (let k = 0; k < n; k++) noeuds[k] = k < depart ? { dort: -Infinity, danse: null, rejoint: null, fait: -Infinity, pulse: null } : { dort: Infinity, danse: null, rejoint: null, fait: null, pulse: null }
    noeuds[depart]!.dort = -Infinity
    noeuds[depart]!.danse = { debut: t, fin: Infinity }
    vols.length = 0
    cible = depart
    vol = null
  }
  commencer(ev[0]![0], ev[0]![1])

  // Un vol fini (jusqu'à `jusqua`): les étapes qu'il a dépassées sont faites, au moment du passage.
  const clore = (v: Vol, jusqua: number) => {
    v.fin = jusqua
    for (let j = Math.floor(v.de) + 1; j < v.a; j++) {
      if (j <= v.de) continue
      const quand = v.t0 + tempsPour(v.courbe, (j - v.de) / (v.a - v.de)) * v.dur
      if (quand >= jusqua) continue
      noeuds[j] = { dort: quand - MS.fondu / 2, danse: null, rejoint: null, fait: quand, pulse: 'fort' }
    }
  }
  // Un vol arrivé: l'étape visée s'éveille et sa danse naît à l'instant même de l'arrivée.
  const arriver = (v: Vol) => {
    const arrivee = v.t0 + v.dur
    clore(v, arrivee)
    const noeud = noeuds[v.a]!
    noeud.dort = arrivee - MS.fondu / 2
    noeud.danse = { debut: arrivee, fin: Infinity }
  }
  // L'étape en cours se rejoint en un point à `t`, qui apparaît quand les quatre se sont rejoints.
  const rejoindre = (t: number, pulse: 'fort' | 'doux') => {
    const noeud = noeuds[cible]!
    if (noeud.danse) noeud.danse.fin = t
    noeud.rejoint = noeud.danse ? t : null
    noeud.fait = t + MS.rejoint
    noeud.pulse = pulse
  }

  for (let i = 1; i < ev.length; i++) {
    const [s, t] = ev[i]!
    const visee = etapeDe(s)
    if (visee === cible) continue
    const enRoute: Vol | null = vol !== null && t < vol.t0 + vol.dur ? vol : null
    const parti = enRoute !== null && t > enRoute.t0
    const u = enRoute === null ? cible : parti ? posVol(enRoute, t) : enRoute.de
    // Une étape plus basse que la cible, mais encore devant le messager, est un simple changement de
    // cap; derrière lui, c'est un retour en arrière.
    if (visee < cible && !(enRoute !== null && visee > u + 1e-3)) {
      commencer(s, t)
      continue
    }
    let nouveau: Vol
    if (enRoute !== null) {
      vol = enRoute
      // Le messager est en route: il change de cap là où il est, à la vitesse qu'il a.
      clore(vol, Math.max(t, vol.t0))
      const dur = dureeVol(visee - u, n)
      let courbe = COURBES.vol
      if (parti) {
        const vitesse = (posVol(vol, t + 1) - posVol(vol, t - 1)) / 2
        const pente = (vitesse * dur) / Math.max(1e-6, visee - u)
        courbe = `.3 ${n3(Math.min(1, Math.max(0, 0.3 * pente)))} .3 1`
      }
      nouveau = { de: u, a: visee, t0: Math.max(t, vol.t0), dur, courbe, fin: Infinity }
    } else {
      if (vol !== null) arriver(vol)
      rejoindre(t, 'fort')
      nouveau = { de: cible, a: visee, t0: t + MS.depart, dur: dureeVol(visee - cible, n), courbe: COURBES.vol, fin: Infinity }
    }
    vol = nouveau
    vols.push(vol)
    cible = visee
  }

  // La fin du travail: le messager en route finit son vol, puis tout se joue depuis son arrivée.
  let finDebut: number | null = null
  if (vue.fin !== null) {
    const tf = vue.fin
    if (vol !== null && tf < vol.t0 + vol.dur) {
      const arrivee = vol.t0 + vol.dur
      clore(vol, arrivee)
      const noeud = noeuds[vol.a]!
      noeud.dort = arrivee - MS.fondu / 2
      noeud.fait = arrivee
      noeud.pulse = 'doux'
      finDebut = arrivee
    } else {
      if (vol !== null) arriver(vol)
      rejoindre(tf, 'doux')
      finDebut = tf
    }
    // Les étapes qui restaient: le point gris s'efface pendant que le point orange pousse dessus.
    for (let j = cible + 1; j < n; j++) {
      noeuds[j] = { dort: finDebut + MS.rejoint - MS.fondu / 2, danse: null, rejoint: null, fait: finDebut + MS.rejoint, pulse: 'doux' }
    }
  } else if (vol !== null) {
    arriver(vol)
  }
  return { n, noeuds, vols, debutPlan, depart, cible, finDebut }
}

// Où est la tête de la barre (le messager, ou l'étape où il s'est posé) à l'heure `t`.
function tete(c: Chronologie, t: number): number {
  let u = c.depart
  for (const v of c.vols) {
    if (t < v.t0) return u
    if (t < v.fin) return posVol(v, t)
    u = v.fin >= v.t0 + v.dur ? v.a : posVol(v, v.fin)
  }
  return u
}

// L'heure où la barre a fini de s'effacer, pour la retirer ensuite.
export const finVisuelle = (vue: Vue) => {
  const c = chronologie(vue)
  return c.finDebut === null ? null : c.finDebut + FIN_VISUELLE_MS
}

// L'étape que la barre montre comme en cours (1 pour la première), ou 0 une fois le travail fini.
export function etapeMontree(vue: Vue): number {
  if (vue.fin !== null || vue.ev.length === 0) return 0
  return Math.min(vue.n, Math.max(1, Math.round(vue.ev.at(-1)![0])))
}

// ---------------------------------------------------------------------------------------------
// Le dessin: une image de la largeur de la bande, avec une marge fixe de chaque côté et des points de
// taille fixe. Les places sont des calc() en CSS (pixels et pour cent de la largeur), fixes: justes à
// toute largeur et dès la première image. Tout ce qui bouge est en SMIL, la seule horloge qui part au
// même moment dans chaque image (une animation CSS part 14 à 50 ms plus tard selon l'image, et une
// valeur SMIL en pour cent vaut 0 sur la première image). Le messager glisse donc par une mise à
// l'échelle SMIL d'un groupe placé en CSS, et son point garde sa taille (un trait qui ne grossit pas).
// Chaque animation part de son heure dans la chronologie; celle qui est déjà jouée n'est pas écrite,
// son état final devient l'état de l'image.

const MARGE = 16 // la marge de chaque côté, en pixels: la plus large danse y tient

// `marque` rend chaque image unique: Chrome réaffiche une image déjà vue (même source) avec son horloge
// d'animation d'alors, et deux plans de même taille dessinés à leur début donneraient la même source.
export function sceneSvg(vue: Vue, maintenant: number, marque = String(Math.round(maintenant))): string {
  const c = chronologie(vue)
  const n = c.n
  const f = (u: number) => (n === 1 ? 0.5 : u / (n - 1))
  const place = (u: number) => `calc(${MARGE}px + ${n3(f(u))} * (100% - ${2 * MARGE}px))`
  const debut = (T: number) => `${n3((T - maintenant) / 1000)}s`
  const jouee = (T: number, dur: number) => T + dur <= maintenant + 10
  const smil = (attr: string, valeurs: string, temps: string, T: number, dur: number, extra = '') =>
    `<animate${attr === 'transform' ? 'Transform attributeName="transform"' : ` attributeName="${attr}"`} ${extra}values="${valeurs}" keyTimes="${temps}" begin="${debut(T)}" dur="${n3(dur / 1000)}s" fill="freeze"/>`
  // Une opacité qui passe de `de` à `vers` à l'heure T; jouée, il ne reste que la valeur finale.
  const fondu = (de: number, vers: number, T: number, dur: number) =>
    jouee(T, dur) ? { attr: `opacity="${vers}"`, anim: '' } : { attr: `opacity="${de}"`, anim: smil('opacity', `${de};${vers}`, '0;1', T, dur) }
  // Visible à partir de T seulement.
  const desT = (T: number) => (T > maintenant ? { attr: 'opacity="0"', anim: `<set attributeName="opacity" to="1" begin="${debut(T)}"/>` } : { attr: '', anim: '' })
  const ici = (u: number, contenu: string, attrs = '') =>
    `<g class="p" style="transform:translateX(${place(u)})"${attrs}><g transform="translate(0 ${CY})">${contenu}</g></g>`

  // L'entrée: le fil et les points endormis se dessinent en fondu, une étape après l'autre.
  const entree = (k: number) => c.debutPlan + k * MS.entreePas

  // Le fil: entre deux étapes, des petits points comptés depuis le milieu de l'intervalle (les écarts
  // aux deux étapes sont égaux), découpés à une garde de chaque étape. Gris partout; orange jusqu'à la
  // tête, dont la découpe suit le messager avec la même courbe que lui.
  const decoupes: string[] = []
  const gris: string[] = []
  const orange: string[] = []
  const reste: string[] = []
  const pointilles = (k: number) =>
    ici(k + 0.5, `<line x1="0" x2="${FIL.portee}" y1="0" y2="0"/><line x1="0" x2="-${FIL.portee}" y1="0" y2="0"/>`)
  for (let k = 0; k < n - 1; k++) {
    // La garde rétrécit dans une bande étroite: le fil garde au moins 40 % de chaque intervalle.
    const garde = `min(${FIL.garde}px, ${n3(0.3 * (f(k + 1) - f(k)))} * (100% - ${2 * MARGE}px))`
    const gauche = `calc(${MARGE}px + ${n3(f(k))} * (100% - ${2 * MARGE}px) + ${garde})`
    const largeur = `calc(${n3(f(k + 1) - f(k))} * (100% - ${2 * MARGE}px) - 2 * ${garde})`
    decoupes.push(`<clipPath id="i${k}" clipPathUnits="userSpaceOnUse"><rect style="x:${gauche};width:${largeur}" y="0" height="${HAUT}"/></clipPath>`)
    const e = fondu(0, 1, entree(k) + MS.entreePas / 2, MS.entree)
    gris.push(`<g clip-path="url(#i${k})" ${e.attr}>${e.anim}${pointilles(k)}</g>`)
    if (c.finDebut !== null && k >= c.cible) {
      const allume = fondu(0, 1, c.finDebut + MS.rejoint, 250)
      reste.push(`<g clip-path="url(#i${k})" ${allume.attr}>${allume.anim}${pointilles(k)}</g>`)
    } else {
      orange.push(`<g clip-path="url(#i${k})">${pointilles(k)}</g>`)
    }
  }
  // Un vol: un groupe placé au départ, mis à l'échelle de 0 à 1 le long du vol (SMIL, avec la courbe
  // du vol), qui contient ce qui doit aller jusqu'à l'arrivée, placé à l'écart du trajet.
  const glisse = (v: Vol, contenu: string) => {
    const avance = maintenant <= v.t0 ? 0 : bezier(v.courbe, (maintenant - v.t0) / v.dur)
    // Jamais 0: un groupe à l'échelle nulle n'est pas dessiné, et le messager disparaîtrait une image.
    const echelle = (p: number) => `${n3(Math.max(0.001, p))} 1`
    const fini = jouee(v.t0, v.dur)
    const anim = fini
      ? ''
      : `<animateTransform attributeName="transform" type="scale" values="${echelle(0)};${echelle(1)}" keyTimes="0;1" calcMode="spline" keySplines="${v.courbe}" begin="${debut(v.t0)}" dur="${n3(v.dur / 1000)}s" fill="freeze"/>`
    return `<g class="p" style="transform:translateX(${place(v.de)})"><g transform="scale(${echelle(fini ? 1 : avance)})">${anim}${contenu}</g></g>`
  }
  const trajet = (v: Vol) => `calc(${n3(f(v.a) - f(v.de))} * (100% - ${2 * MARGE}px))`

  // Le fil allumé: jusqu'au messager pendant son vol, jusqu'à l'étape où il s'est posé sinon.
  const actif = c.vols.at(-1)
  const enVol = actif !== undefined && actif.fin >= actif.t0 + actif.dur && !jouee(actif.t0, actif.dur)
  const fixe = `<rect x="0" y="0" height="${HAUT}" fill="#fff" style="width:${place(enVol ? actif.de : tete(c, maintenant))}"/>`
  const pousse = enVol ? glisse(actif, `<rect x="-5000" y="0" height="${HAUT}" fill="#fff" style="width:calc(5000px + ${trajet(actif).slice(5)}"/>`) : ''
  decoupes.push(`<mask id="tete" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="${HAUT}">${fixe}${pousse}</mask>`)
  const fil =
    `<g stroke-width="${2 * FIL.rayon}" stroke-linecap="round" stroke-dasharray="0 ${FIL.pas}">` +
    `<g stroke="${GRIS}" opacity="${FIL.opacite}">${gris.join('')}</g>` +
    `<g stroke="${ORANGE}" opacity="${FIL.opaciteFait}"><g mask="url(#tete)">${orange.join('')}</g>${reste.join('')}</g></g>`

  // Les étapes.
  const etapes: string[] = []
  c.noeuds.forEach((noeud, k) => {
    const morceaux: string[] = []
    // Le point endormi: il apparaît avec la barre, et s'efface quand le messager arrive ou passe.
    if (noeud.dort === Infinity || !jouee(noeud.dort, MS.fondu)) {
      const naissance = entree(k)
      const apparait = jouee(naissance, MS.entree) ? '' : smil('opacity', `0;${POINT.dortOpacite}`, '0;1', naissance, MS.entree)
      const part = noeud.dort === Infinity ? '' : smil('opacity', `${POINT.dortOpacite};0`, '0;1', noeud.dort, MS.fondu)
      const base = jouee(naissance, MS.entree) ? POINT.dortOpacite : 0
      morceaux.push(`<circle r="${POINT.dort}" fill="${GRIS}" opacity="${base}">${apparait}${part}</circle>`)
    }
    // La danse: elle naît d'un point (les quatre partent du centre en gardant leur taille), puis boucle.
    const danse = danseDe(k, vue.graine)
    // L'écart des quatre points `ms` après la naissance de la danse: ils sortent du centre en ralentissant.
    const ecartement = (ms: number) => (ms >= MS.separe ? 1 : 1 - (1 - Math.max(0, ms) / MS.separe) ** 3)
    // La première danse du plan entre en fondu avec la barre; ses points le gardent jusqu'au rejoint.
    const entreeDanse = noeud.danse !== null && noeud.danse.debut === c.debutPlan ? fondu(0, 1, noeud.danse.debut, MS.entree) : { attr: '', anim: '' }
    if (noeud.danse !== null && noeud.danse.fin > maintenant) {
      const T = noeud.danse.debut
      const visible = T === c.debutPlan ? entreeDanse : desT(T)
      const cache = noeud.danse.fin === Infinity ? '' : `<set attributeName="opacity" to="0" begin="${debut(noeud.danse.fin)}"/>`
      const points = [0, 1, 2, 3]
        .map(i => {
          const boucle = Array.from({ length: RELEVES + 1 }, (_, j) => danse.position(i, j / RELEVES).map(n2).join(' ')).join(';')
          const ecarte = jouee(T, MS.separe)
            ? ''
            : `<animateTransform attributeName="transform" type="translate" values="${Array.from({ length: 13 }, (_, j) => {
                const s = (j / 12) * MS.separe
                const [px, py] = positionsA(danse, s / 1000)[i]!
                const r = ecartement(s)
                return `${n2(px * r)} ${n2(py * r)}`
              }).join(';')}" begin="${debut(T)}" dur="${n3(MS.separe / 1000)}s"/>`
          return `<circle r="${RAYON}" fill="${ORANGE}"><animateTransform attributeName="transform" type="translate" values="${boucle}" dur="${danse.cycle}s" begin="${debut(T)}" repeatCount="indefinite"/>${ecarte}</circle>`
        })
        .join('')
      morceaux.push(`<g ${visible.attr}>${visible.anim}${cache}${points}</g>`)
    }
    // Le rejoint: les quatre points continuent leur danse en se resserrant jusqu'au centre. Commencé
    // pendant la séparation ou le fondu d'entrée, il part de là où ils en sont. Ils restent dessinés
    // jusqu'à ce que le point fait apparaisse (dans ses 10 dernières ms, figés au centre): aucun trou.
    if (noeud.rejoint !== null && noeud.danse !== null && noeud.rejoint + MS.rejoint > maintenant) {
      const fige = jouee(noeud.rejoint, MS.rejoint)
      const age = noeud.rejoint - noeud.danse.debut
      const cercles: string[] = []
      for (let i = 0; i < 4; i++) {
        const valeurs = Array.from({ length: 13 }, (_, j) => {
          const ms = age + (j / 12) * MS.rejoint
          const [px, py] = positionsA(danse, ms / 1000)[i]!
          const r = ecartement(ms) * (1 - douce(j / 12))
          return `${n2(px * r)} ${n2(py * r)}`
        })
        const premier = valeurs[0]!
        const visible = desT(noeud.rejoint)
        cercles.push(
          fige
            ? `<circle r="${RAYON}" fill="${ORANGE}"/>`
            : `<circle r="${RAYON}" fill="${ORANGE}" transform="translate(${premier})" ${visible.attr}>${visible.anim}<animateTransform attributeName="transform" type="translate" values="${valeurs.join(';')}" begin="${debut(noeud.rejoint)}" dur="${n3(MS.rejoint / 1000)}s" fill="freeze"/></circle>`,
        )
      }
      morceaux.push(`<g ${entreeDanse.attr}>${entreeDanse.anim}${cercles.join('')}</g>`)
    }
    // Le point fait: il naît à la taille d'un point de danse, pulse une fois (ou se pose, à la fin),
    // puis pulse avec tous les autres quand le travail est fini.
    if (noeud.fait !== null) {
      const T = noeud.fait
      let echelle = { attr: '', anim: '' }
      if (noeud.pulse !== null && !jouee(T, noeud.pulse === 'fort' ? MS.pulse : MS.pose)) {
        echelle =
          noeud.pulse === 'fort'
            ? { attr: `transform="scale(${NAISSANCE})"`, anim: smil('transform', `${NAISSANCE};1.18;1`, '0;.4;1', T, MS.pulse, 'type="scale" calcMode="spline" keySplines=".2 .8 .3 1;.65 0 .35 1" ') }
            : { attr: `transform="scale(${NAISSANCE})"`, anim: smil('transform', `${NAISSANCE};1`, '0;1', T, MS.pose, 'type="scale" calcMode="spline" keySplines=".2 .8 .3 1" ') }
      }
      const visible = desT(T)
      const tous =
        c.finDebut !== null && !jouee(c.finDebut + MS.finPulse, MS.finPulseDur)
          ? { attr: '', anim: smil('transform', '1;1.25;1', '0;.35;1', c.finDebut + MS.finPulse, MS.finPulseDur, 'type="scale" calcMode="spline" keySplines=".2 .8 .3 1;.65 0 .35 1" ') }
          : { attr: '', anim: '' }
      morceaux.push(`<g ${visible.attr}>${visible.anim}<g>${tous.anim}<circle r="${POINT.fait}" fill="${ORANGE}" ${echelle.attr}>${echelle.anim}</circle></g></g>`)
    }
    if (morceaux.length) etapes.push(ici(k, morceaux.join('')))
  })

  // Le messager: il glisse d'une étape à l'autre, puis disparaît à l'instant où la danse naît sous lui.
  // Un point fait d'un trait de longueur nulle: l'échelle du vol ne le déforme pas.
  const messagers: string[] = []
  for (const v of c.vols) {
    const arrivee = v.t0 + v.dur
    // Dessiné jusqu'à l'instant de l'arrivée, où la danse prend sa place (sans la marge de 10 ms).
    if (v.fin < arrivee || arrivee <= maintenant) continue
    const visible = desT(v.t0)
    const point = `<path d="M0 ${CY}h0" stroke="${ORANGE}" stroke-width="${2 * RAYON}" stroke-linecap="round" vector-effect="non-scaling-stroke" ${visible.attr}>${visible.anim}<set attributeName="opacity" to="0" begin="${debut(arrivee)}"/></path>`
    messagers.push(glisse(v, `<g class="p" style="transform:translateX(${trajet(v)})">${point}</g>`))
  }

  // À la fin, toute la barre s'efface après la pulsation commune.
  const sortie = c.finDebut !== null ? fondu(1, 0, c.finDebut + MS.sortie, MS.sortieDur) : { attr: '', anim: '' }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${HAUT}"><!--${marque}--><style>.p{transform-box:view-box}</style><defs>${decoupes.join('')}</defs>` +
    `<g ${sortie.attr}>${sortie.anim}${fil}${etapes.join('')}${messagers.join('')}</g></svg>`
  )
}

// Pour le terminal: une étape faite est un point plein, l'étape en cours prend tour à tour les
// signes de l'indicateur de Claude, une étape à venir est un rond vide; le fil est fait de points.
const SIGNES = ['✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳']
export function pointsTexte(vue: Vue, maintenant: number, colonnes: number): string {
  const c = chronologie(vue)
  const n = c.n
  const ligne = Array.from({ length: Math.max(n, colonnes) }, () => '·')
  c.noeuds.forEach((noeud, k) => {
    const i = n === 1 ? 0 : Math.round((k * (ligne.length - 1)) / (n - 1))
    const fait = noeud.fait !== null && noeud.fait <= maintenant
    const danse = noeud.danse !== null && noeud.danse.debut <= maintenant && noeud.danse.fin > maintenant
    ligne[i] = fait ? '●' : danse ? SIGNES[Math.floor(maintenant / 1000) % SIGNES.length]! : '○'
  })
  return ligne.join('')
}
