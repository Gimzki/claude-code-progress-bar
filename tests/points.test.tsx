import { expect, test } from 'claude-code/testing'

import { chronologie, DANSES, danseDe, etapeMontree, FIN_VISUELLE_MS, finVisuelle, indicateurSvg, ordreDes, pointsTexte, positionsA, sceneSvg } from '../hooks/points'
import type { Vue } from '../hooks/points'

// La courbe de Bézier, comme le navigateur la suit.
function courbe(c: string, p: number): number {
  const [x1, y1, x2, y2] = c.split(' ').map(Number) as [number, number, number, number]
  const coord = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  let bas = 0
  let haut = 1
  for (let i = 0; i < 40; i++) {
    const t = (bas + haut) / 2
    if (coord(x1, x2, t) < p) bas = t
    else haut = t
  }
  return coord(y1, y2, (bas + haut) / 2)
}

// Les animations ponctuelles déjà jouées (ou qui finissent dans les 10 ms) qu'un dessin contiendrait
// encore: il n'en faut aucune, Chrome les ramènerait à leur valeur de base. Pareil en CSS.
const jouees = (svg: string) => [
  ...[...svg.matchAll(/<animate(?:Transform)? (?![^>]*repeatCount)[^>]*begin="([\d.-]+)s" dur="([\d.]+)s"/g)]
    .map(m => Number(m[1]) + Number(m[2]))
    .filter(fin => fin <= 0.005),
  ...[...svg.matchAll(/animation:\w+ ([\d.]+)ms cubic-bezier\([^)]*\) ([\d.-]+)ms both/g)]
    .map(m => (Number(m[1]) + Number(m[2])) / 1000)
    .filter(fin => fin <= 0.01),
]

test('huit danses, une par étape, toutes différentes et dans leur case', async () => {
  expect(DANSES.length).toBe(8)
  expect(new Set(DANSES.map(d => d.nom)).size).toBe(8)
  expect(new Set(DANSES.map((_, k) => indicateurSvg(k))).size).toBe(8)
  expect(danseDe(8)).toBe(DANSES[0]!)

  for (const danse of DANSES) {
    for (let j = 0; j <= 200; j++) {
      for (const [x, y] of positionsA(danse, (j / 200) * danse.cycle)) {
        expect(Math.abs(x)).toBeLessThan(13)
        expect(Math.abs(y)).toBeLessThan(8)
      }
    }
    // La boucle ne se voit pas: à la fin du cycle, les quatre points occupent les places du début.
    const cle = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`.replace(/-0\.00/g, '0.00')).sort()
    expect(cle([0, 1, 2, 3].map(i => danse.position(i, 1)))).toEqual(cle([0, 1, 2, 3].map(i => danse.position(i, 0))))
  }
})

test('une étape qui finit: rejoint, pulsation, messager, séparation, dans cet ordre', async () => {
  const vue: Vue = { n: 4, ev: [[1, 0], [2, 4000], [3, 9000]], fin: null }
  const c = chronologie(vue)
  const [un, deux, trois, quatre] = c.noeuds
  // L'étape 1 se rejoint à 4 s et son point pulse quand les quatre points se sont rejoints.
  expect(un!.danse).toEqual({ debut: 0, fin: 4000 })
  expect(un!.rejoint).toBe(4000)
  expect(un!.fait).toBe(4260)
  // Le messager part à 4,3 s; l'étape 2 s'éveille à son arrivée, puis finit à 9 s.
  expect(c.vols[0]!.t0).toBe(4300)
  const arrivee = c.vols[0]!.t0 + c.vols[0]!.dur
  expect(deux!.danse!.debut).toBe(arrivee)
  expect(deux!.danse!.fin).toBe(9000)
  expect(trois!.danse!.fin).toBe(Infinity)
  expect(quatre!.dort).toBe(Infinity)
  expect(etapeMontree(vue)).toBe(3)
  expect(finVisuelle(vue)).toBe(null)
})

test('une étape annoncée pendant le vol: le messager change de cap sans s\'arrêter', async () => {
  const vue: Vue = { n: 4, ev: [[1, 0], [2, 4000], [3, 4600]], fin: null }
  const c = chronologie(vue)
  const [premier, second] = c.vols
  // Le premier vol est coupé à 4,6 s, le second repart de la même place au même instant.
  expect(premier!.fin).toBe(4600)
  expect(second!.t0).toBe(4600)
  const u = premier!.de + (premier!.a - premier!.de) * 0.0
  expect(second!.de).toBeGreaterThan(u)
  expect(second!.de).toBeLessThan(1)
  // L'étape 2 n'a jamais dansé: elle est faite au passage du messager.
  expect(c.noeuds[1]!.danse).toBe(null)
  expect(c.noeuds[1]!.fait!).toBeGreaterThan(4600)
  expect(c.noeuds[1]!.fait!).toBeLessThan(second!.t0 + second!.dur)
  expect(c.noeuds[2]!.danse!.debut).toBe(second!.t0 + second!.dur)
  // Au changement de cap, le messager garde sa vitesse: pas d'à-coup.
  const position = (t: number) => {
    const v = t < 4600 ? premier! : second!
    const p = Math.min(1, Math.max(0, (t - v.t0) / v.dur))
    return v.de + (v.a - v.de) * courbe(v.courbe, p)
  }
  const avant = (position(4600) - position(4590)) / 10
  const apres = (position(4610) - position(4600)) / 10
  expect(Math.abs(apres - avant) / avant).toBeLessThan(0.25)
})

test('une étape sautée est faite au passage; une fin pendant le vol attend l\'arrivée', async () => {
  const saut = chronologie({ n: 4, ev: [[1, 0], [3, 4000]], fin: null })
  expect(saut.noeuds[1]!.danse).toBe(null)
  expect(saut.noeuds[1]!.fait!).toBeGreaterThan(4300)
  expect(saut.noeuds[2]!.danse).not.toBe(null)

  const vue: Vue = { n: 4, ev: [[1, 0], [2, 4000]], fin: 4500 }
  const fin = chronologie(vue)
  const arrivee = fin.vols[0]!.t0 + fin.vols[0]!.dur
  expect(fin.finDebut).toBe(arrivee)
  expect(fin.noeuds[1]!.danse).toBe(null)
  expect(fin.noeuds[1]!.fait).toBe(arrivee)
  // Les étapes qui restaient s'effacent puis pulsent, toutes ensemble.
  expect(fin.noeuds[2]!.fait).toBe(arrivee + 260)
  expect(fin.noeuds[2]!.dort).toBeLessThan(arrivee + 260)
  expect(fin.noeuds[3]!.fait).toBe(arrivee + 260)
  expect(finVisuelle(vue)).toBe(arrivee + FIN_VISUELLE_MS)
  expect(etapeMontree(vue)).toBe(0)
})

test('un retour en arrière repart de zéro', async () => {
  const c = chronologie({ n: 4, ev: [[1, 0], [3, 4000], [2, 9000]], fin: null })
  expect(c.vols.length).toBe(0)
  expect(c.noeuds[0]!.fait).toBe(-Infinity)
  expect(c.noeuds[1]!.danse!.debut).toBe(9000)
  expect(c.noeuds[2]!.dort).toBe(Infinity)
})

test('aucune animation déjà jouée dans l\'image, à aucun instant', async () => {
  const cas: Vue[] = [
    { n: 4, ev: [[1, 0], [2, 4000], [3, 9000], [4, 14_000]], fin: 19_000 },
    { n: 8, ev: [[1, 0], [2, 3000], [3, 3400], [6, 3800], [7, 9000]], fin: 9300 },
    { n: 2, ev: [[1, 0], [2, 5000]], fin: 12_000 },
  ]
  for (const vue of cas) {
    for (let t = 0; t <= 24_000; t += 37) {
      const svg = sceneSvg(vue, t)
      expect(jouees(svg)).toEqual([])
      expect(svg.length).toBeLessThan(40_000)
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="26">')).toBe(true)
    }
  }
})

test('le dessin reste léger pour toutes les tailles de plan, et le terminal suit', async () => {
  for (let n = 2; n <= 8; n++) {
    for (let e = 1; e <= n; e++) {
      const vue: Vue = { n, ev: e === 1 ? [[1, 0]] : [[1, 0], [e, 1000]], fin: null }
      for (const t of [0, 1100, 1500, 5000]) expect(sceneSvg(vue, t).length).toBeLessThan(40_000)
    }
  }
  const vue: Vue = { n: 4, ev: [[1, 0], [2, 1000]], fin: null }
  const ligne = pointsTexte(vue, 5000, 13)
  expect(ligne.length).toBe(13)
  expect(ligne[0]).toBe('●')
  expect(['✢', '✳', '✶', '✻', '✽']).toContain(ligne[4])
  expect(ligne[12]).toBe('○')
  expect(pointsTexte({ ...vue, fin: 5000 }, 9000, 13).replace(/·/g, '')).toBe('●●●●')
})

test('une étape plus basse que la cible mais devant le messager change son cap, sans rien effacer', async () => {
  // Étape 5 annoncée, puis l'étape 4 pendant que le messager est encore entre 1 et 2.
  const c = chronologie({ n: 6, ev: [[1, 0], [5, 2000], [4, 2450]], fin: null })
  expect(c.vols.length).toBe(2)
  expect(c.vols[1]!.a).toBe(3)
  expect(c.vols[1]!.de).toBeGreaterThan(0)
  expect(c.noeuds[0]!.fait).toBe(2260)
  expect(c.noeuds[4]!.danse).toBe(null)
  // Derrière le messager, c'est un vrai retour: l'histoire repart de lui.
  const retour = chronologie({ n: 6, ev: [[1, 0], [5, 2000], [2, 4000]], fin: null })
  expect(retour.vols.length).toBe(0)
  expect(retour.noeuds[1]!.danse!.debut).toBe(4000)
})

test('deux images ne sont jamais identiques, même pour deux plans pareils', async () => {
  const vue: Vue = { n: 4, ev: [[1, 0]], fin: null }
  const decale: Vue = { n: 4, ev: [[1, 50_000]], fin: null }
  expect(sceneSvg(vue, 0)).not.toBe(sceneSvg(decale, 50_000))
  expect(sceneSvg(vue, 10, 'a')).not.toBe(sceneSvg(vue, 10, 'b'))
})

test('un rejoint pendant la séparation part de l\'écart réel des points', async () => {
  // Fin 100 ms après la première étape: les points sont à peine sortis du centre.
  const svg = sceneSvg({ n: 4, ev: [[1, 0]], fin: 100 }, 100)
  const premiers = [...svg.matchAll(/<circle r="2.2" fill="#CC7C5E" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)].map(m => Math.hypot(Number(m[1]), Number(m[2])))
  expect(premiers.length).toBe(4)
  for (const r of premiers) expect(r).toBeLessThan(6)
})

test('le messager n\'est jamais à l\'échelle nulle, même à l\'instant où il part', async () => {
  for (const t of [2341, 2492, 2600]) {
    const svg = sceneSvg({ n: 8, ev: [[1, 42], [5, 2041], [4, 2492]], fin: null }, t)
    expect(svg).not.toMatch(/scale\(0 1\)|values="0 1;/)
  }
})

test('chaque tâche tire son ordre de danses, toujours le même pour elle, sans répétition', async () => {
  const ordres = new Set<string>()
  const deuxiemes = new Set<number>()
  for (let graine = 1_791_712_800_000; graine < 1_791_712_800_000 + 40_000; graine += 1000) {
    const ordre = ordreDes(graine)
    expect([...ordre].sort().join()).toBe('0,1,2,3,4,5,6,7')
    expect(ordreDes(graine).join()).toBe(ordre.join())
    ordres.add(ordre.join())
    deuxiemes.add(ordre[1]!)
  }
  // Quarante tâches: presque toutes ont leur propre ordre, et l'étape 2 change de danse.
  expect(ordres.size).toBeGreaterThan(35)
  expect(deuxiemes.size).toBeGreaterThan(5)
  // Le dessin suit la graine: l'étape en cours danse la danse tirée pour elle.
  const graine = 1_791_712_800_123
  const vue: Vue = { n: 4, ev: [[1, 0], [2, 1000]], fin: null, graine }
  const attendue = danseDe(1, graine)
  const svg = sceneSvg(vue, 5000)
  expect(svg).toContain(`dur="${attendue.cycle}s"`)
  const boucle = Array.from({ length: 49 }, (_, j) => attendue.position(0, j / 48).map(v => String(+v.toFixed(2))).join(' ')).join(';')
  expect(svg).toContain(boucle)
})
