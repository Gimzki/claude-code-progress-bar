import { expect, test } from 'claude-code/testing'

import { danceFor, DANCES, danceOrder, dotsText, indicatorSvg, positionsAt, sceneSvg, shownStep, timeline, VISUAL_END_MS, visualEnd } from '../hooks/dots'
import type { View } from '../hooks/dots'

// The Bezier curve, as the browser follows it.
function bezier(c: string, p: number): number {
  const [x1, y1, x2, y2] = c.split(' ').map(Number) as [number, number, number, number]
  const coord = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2
    if (coord(x1, x2, t) < p) lo = t
    else hi = t
  }
  return coord(y1, y2, (lo + hi) / 2)
}

// The one-off animations already played (or ending within 10 ms) that a drawing would still contain:
// there must be none, Chrome would bring them back to their base value. The same goes for CSS.
const played = (svg: string) => [
  ...[...svg.matchAll(/<animate(?:Transform)? (?![^>]*repeatCount)[^>]*begin="([\d.-]+)s" dur="([\d.]+)s"/g)]
    .map(m => Number(m[1]) + Number(m[2]))
    .filter(end => end <= 0.005),
  ...[...svg.matchAll(/animation:\w+ ([\d.]+)ms cubic-bezier\([^)]*\) ([\d.-]+)ms both/g)]
    .map(m => (Number(m[1]) + Number(m[2])) / 1000)
    .filter(end => end <= 0.01),
]

test('eight dances, one per step, all different and within their box', async () => {
  expect(DANCES.length).toBe(8)
  expect(new Set(DANCES.map(d => d.name)).size).toBe(8)
  expect(new Set(DANCES.map((_, k) => indicatorSvg(k))).size).toBe(8)
  expect(danceFor(8)).toBe(DANCES[0]!)

  for (const dance of DANCES) {
    for (let j = 0; j <= 200; j++) {
      for (const [x, y] of positionsAt(dance, (j / 200) * dance.cycle)) {
        expect(Math.abs(x)).toBeLessThan(13)
        expect(Math.abs(y)).toBeLessThan(8)
      }
    }
    // The loop does not show: at the end of the cycle, the four dots are in the places of the start.
    const key = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`.replace(/-0\.00/g, '0.00')).sort()
    expect(key([0, 1, 2, 3].map(i => dance.position(i, 1)))).toEqual(key([0, 1, 2, 3].map(i => dance.position(i, 0))))
  }
})

test('a step that ends: merge, pulse, messenger, split, in that order', async () => {
  const view: View = { n: 4, events: [[1, 0], [2, 4000], [3, 9000]], end: null }
  const c = timeline(view)
  const [one, two, three, four] = c.nodes
  // Step 1 merges at 4 s and its dot pulses once the four dots have merged.
  expect(one!.dance).toEqual({ start: 0, end: 4000 })
  expect(one!.mergeAt).toBe(4000)
  expect(one!.doneAt).toBe(4260)
  // The messenger leaves at 4.3 s; step 2 wakes up when it arrives, then ends at 9 s.
  expect(c.flights[0]!.t0).toBe(4300)
  const arrival = c.flights[0]!.t0 + c.flights[0]!.dur
  expect(two!.dance!.start).toBe(arrival)
  expect(two!.dance!.end).toBe(9000)
  expect(three!.dance!.end).toBe(Infinity)
  expect(four!.asleepUntil).toBe(Infinity)
  expect(shownStep(view)).toBe(3)
  expect(visualEnd(view)).toBe(null)
})

test('a step announced during the flight: the messenger changes course without stopping', async () => {
  const view: View = { n: 4, events: [[1, 0], [2, 4000], [3, 4600]], end: null }
  const c = timeline(view)
  const [first, second] = c.flights
  // The first flight is cut at 4.6 s, the second leaves from the same place at the same instant.
  expect(first!.end).toBe(4600)
  expect(second!.t0).toBe(4600)
  const u = first!.from + (first!.to - first!.from) * 0.0
  expect(second!.from).toBeGreaterThan(u)
  expect(second!.from).toBeLessThan(1)
  // Step 2 never danced: it is done as the messenger passes.
  expect(c.nodes[1]!.dance).toBe(null)
  expect(c.nodes[1]!.doneAt!).toBeGreaterThan(4600)
  expect(c.nodes[1]!.doneAt!).toBeLessThan(second!.t0 + second!.dur)
  expect(c.nodes[2]!.dance!.start).toBe(second!.t0 + second!.dur)
  // When it changes course, the messenger keeps its speed: no jolt.
  const position = (t: number) => {
    const v = t < 4600 ? first! : second!
    const p = Math.min(1, Math.max(0, (t - v.t0) / v.dur))
    return v.from + (v.to - v.from) * bezier(v.curve, p)
  }
  const before = (position(4600) - position(4590)) / 10
  const after = (position(4610) - position(4600)) / 10
  expect(Math.abs(after - before) / before).toBeLessThan(0.25)
})

test('a skipped step is done as the messenger passes; an end during the flight waits for the arrival', async () => {
  const skip = timeline({ n: 4, events: [[1, 0], [3, 4000]], end: null })
  expect(skip.nodes[1]!.dance).toBe(null)
  expect(skip.nodes[1]!.doneAt!).toBeGreaterThan(4300)
  expect(skip.nodes[2]!.dance).not.toBe(null)

  const view: View = { n: 4, events: [[1, 0], [2, 4000]], end: 4500 }
  const ended = timeline(view)
  const arrival = ended.flights[0]!.t0 + ended.flights[0]!.dur
  expect(ended.endStart).toBe(arrival)
  expect(ended.nodes[1]!.dance).toBe(null)
  expect(ended.nodes[1]!.doneAt).toBe(arrival)
  // The steps that were left fade out, then pulse, all together.
  expect(ended.nodes[2]!.doneAt).toBe(arrival + 260)
  expect(ended.nodes[2]!.asleepUntil).toBeLessThan(arrival + 260)
  expect(ended.nodes[3]!.doneAt).toBe(arrival + 260)
  expect(visualEnd(view)).toBe(arrival + VISUAL_END_MS)
  expect(shownStep(view)).toBe(0)
})

test('a step back starts over from zero', async () => {
  const c = timeline({ n: 4, events: [[1, 0], [3, 4000], [2, 9000]], end: null })
  expect(c.flights.length).toBe(0)
  expect(c.nodes[0]!.doneAt).toBe(-Infinity)
  expect(c.nodes[1]!.dance!.start).toBe(9000)
  expect(c.nodes[2]!.asleepUntil).toBe(Infinity)
})

test('no animation already played in the image, at any instant', async () => {
  const cases: View[] = [
    { n: 4, events: [[1, 0], [2, 4000], [3, 9000], [4, 14_000]], end: 19_000 },
    { n: 8, events: [[1, 0], [2, 3000], [3, 3400], [6, 3800], [7, 9000]], end: 9300 },
    { n: 2, events: [[1, 0], [2, 5000]], end: 12_000 },
  ]
  for (const view of cases) {
    for (let t = 0; t <= 24_000; t += 37) {
      const svg = sceneSvg(view, t)
      expect(played(svg)).toEqual([])
      expect(svg.length).toBeLessThan(40_000)
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="26">')).toBe(true)
    }
  }
})

test('the drawing stays light for every plan size, and the terminal follows', async () => {
  for (let n = 2; n <= 8; n++) {
    for (let s = 1; s <= n; s++) {
      const view: View = { n, events: s === 1 ? [[1, 0]] : [[1, 0], [s, 1000]], end: null }
      for (const t of [0, 1100, 1500, 5000]) expect(sceneSvg(view, t).length).toBeLessThan(40_000)
    }
  }
  const view: View = { n: 4, events: [[1, 0], [2, 1000]], end: null }
  const line = dotsText(view, 5000, 13)
  expect(line.length).toBe(13)
  expect(line[0]).toBe('●')
  expect(['✢', '✳', '✶', '✻', '✽']).toContain(line[4])
  expect(line[12]).toBe('○')
  expect(dotsText({ ...view, end: 5000 }, 9000, 13).replace(/·/g, '')).toBe('●●●●')
})

test('a step lower than the target but ahead of the messenger changes its course, without erasing anything', async () => {
  // Step 5 announced, then step 4 while the messenger is still between 1 and 2.
  const c = timeline({ n: 6, events: [[1, 0], [5, 2000], [4, 2450]], end: null })
  expect(c.flights.length).toBe(2)
  expect(c.flights[1]!.to).toBe(3)
  expect(c.flights[1]!.from).toBeGreaterThan(0)
  expect(c.nodes[0]!.doneAt).toBe(2260)
  expect(c.nodes[4]!.dance).toBe(null)
  // Behind the messenger, it is a real step back: the history starts over from it.
  const back = timeline({ n: 6, events: [[1, 0], [5, 2000], [2, 4000]], end: null })
  expect(back.flights.length).toBe(0)
  expect(back.nodes[1]!.dance!.start).toBe(4000)
})

test('two images are never identical, even for two identical plans', async () => {
  const view: View = { n: 4, events: [[1, 0]], end: null }
  const shifted: View = { n: 4, events: [[1, 50_000]], end: null }
  expect(sceneSvg(view, 0)).not.toBe(sceneSvg(shifted, 50_000))
  expect(sceneSvg(view, 10, 'a')).not.toBe(sceneSvg(view, 10, 'b'))
})

test('a merge during the split starts from the actual spread of the dots', async () => {
  // The end comes 100 ms after the first step: the dots have barely left the center.
  const svg = sceneSvg({ n: 4, events: [[1, 0]], end: 100 }, 100)
  const firsts = [...svg.matchAll(/<circle r="2.2" fill="#CC7C5E" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)].map(m => Math.hypot(Number(m[1]), Number(m[2])))
  expect(firsts.length).toBe(4)
  for (const r of firsts) expect(r).toBeLessThan(6)
})

test('the messenger is never at zero scale, even at the instant it leaves', async () => {
  for (const t of [2341, 2492, 2600]) {
    const svg = sceneSvg({ n: 8, events: [[1, 42], [5, 2041], [4, 2492]], end: null }, t)
    expect(svg).not.toMatch(/scale\(0 1\)|values="0 1;/)
  }
})

test('each task draws its own dance order, always the same for that task, with no repeats', async () => {
  const orders = new Set<string>()
  const secondDances = new Set<number>()
  for (let seed = 1_791_712_800_000; seed < 1_791_712_800_000 + 40_000; seed += 1000) {
    const order = danceOrder(seed)
    expect([...order].sort().join()).toBe('0,1,2,3,4,5,6,7')
    expect(danceOrder(seed).join()).toBe(order.join())
    orders.add(order.join())
    secondDances.add(order[1]!)
  }
  // Forty tasks: almost all of them have their own order, and step 2 changes dance.
  expect(orders.size).toBeGreaterThan(35)
  expect(secondDances.size).toBeGreaterThan(5)
  // The drawing follows the seed: the current step dances the dance drawn for it.
  const seed = 1_791_712_800_123
  const view: View = { n: 4, events: [[1, 0], [2, 1000]], end: null, seed }
  const expected = danceFor(1, seed)
  const svg = sceneSvg(view, 5000)
  expect(svg).toContain(`dur="${expected.cycle}s"`)
  const loop = Array.from({ length: 49 }, (_, j) => expected.position(0, j / 48).map(v => String(+v.toFixed(2))).join(' ')).join(';')
  expect(svg).toContain(loop)
})
