// The bar in dots, in the language of Claude's working indicator: four orange dots.
// - Each step is a dot on a thread of small dots, spread across the full width of the band.
// - An upcoming step is a gray dot, asleep.
// - The current step is an indicator of four dancing orange dots; each step has its own dance (eight
//   in all), drawn in a different order for each task.
// - When the step ends, its four dots merge into one, which pulses and stays: the step is done. A
//   messenger dot leaves from there, glides along the thread to the next step while lighting the
//   thread behind it, and splits into four there: the next step begins. A step announced while it
//   glides makes it change course without stopping; a skipped step is done as it passes.
// - At the end, the last indicator merges into one dot (a messenger in flight finishes its flight
//   first), the remaining steps light up, every dot pulses together, then the bar fades out.
// Everything derives from the history of the steps and the clock: the same instant gives the same
// drawing, however many images were redrawn before. Animation in SMIL and CSS, with no randomness; a
// one-off animation already played is no longer written, its end state becomes the image's state.

const HEIGHT = 26
const CY = 13

// The colors: the orange of Claude's indicator, measured in the app; the neutral gray of both themes.
export const ORANGE = '#CC7C5E'
const GRAY = '#8B8C8A'

// One indicator dot: its radius; the half side of the square; the gap between dots in a row.
const RADIUS = 2.2
const HALF_SIDE = 5.75
const ROW_GAP = 5

// The steps: a done dot, an asleep dot, and the thread of small dots that links them (its guard: the
// radius around each step where it breaks off; its reach: long enough for the widest band, counted
// from the middle of each interval).
const DOT = { done: 3, asleep: 2.2, asleepOpacity: 0.42 }
const THREAD = { radius: 0.9, spacing: 6, guard: 16, reach: 2100, opacity: 0.26, doneOpacity: 0.55 }

const n2 = (v: number) => String(+v.toFixed(2))
const n3 = (v: number) => String(+v.toFixed(3))
const mod = (v: number, m: number) => ((v % m) + m) % m
const clamp = (v: number) => Math.min(1, Math.max(0, v))
// The dance curves: smooth (slow at the start and at the end), bell (0, 1, then 0), overshoot (goes a
// little past its target before settling on it).
const smooth = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2)
const bell = (p: number) => Math.sin(Math.PI * clamp(p)) ** 2
const overshoot = (p: number) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2
const rotate = ([x, y]: [number, number], a: number): [number, number] => [
  x * Math.cos(a) - y * Math.sin(a),
  x * Math.sin(a) + y * Math.cos(a),
]

// The Bezier curve SMIL follows with keySplines: how far along (0 to 1) it is at fraction `p` of the time.
function bezier(curve: string, p: number): number {
  const [x1, y1, x2, y2] = curve.split(' ').map(Number) as [number, number, number, number]
  if (p <= 0) return 0
  if (p >= 1) return 1
  const coord = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const t = (lo + hi) / 2
    if (coord(x1, x2, t) < p) lo = t
    else hi = t
  }
  return coord(y1, y2, (lo + hi) / 2)
}

// The inverse: at what fraction of the time the curve reaches `v`.
function timeFor(curve: string, v: number): number {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2
    if (bezier(curve, m) < v) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

// The four corners of the square, clockwise.
const CORNERS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

// A dance: the length of a cycle, and where dot `i` (0 to 3) is at fraction `f` of the cycle, around
// the center. At the end of the cycle, the four dots are back in their starting places (a dot may take
// another's place: they are identical, so the loop does not show).
export type Dance = { name: string; cycle: number; position: (i: number, f: number) => [number, number] }

export const DANCES: Dance[] = [
  // 1. Pairs: the square turns a quarter turn and closes into two dots, then opens again.
  {
    name: 'Pairs',
    cycle: 1.5,
    position: (i, f) => {
      const squeeze = f < 0.35 ? 1 - smooth(f / 0.35) : f < 0.5 ? 0 : f < 0.85 ? smooth((f - 0.5) / 0.35) : 1
      const [sx, sy] = CORNERS[i]!
      return rotate([sx * HALF_SIDE, sy * HALF_SIDE * squeeze], (f * Math.PI) / 2)
    },
  },
  // 2. Orbit: the dots go around a circle; they bunch up into a comet halfway round, when they go
  //    fastest, and spread out as they slow down.
  {
    name: 'Orbit',
    cycle: 1.5,
    position: (i, f) => {
      const gap = Math.PI / 2 - (Math.PI / 2 - 0.42) * bell(f)
      const angle = 2 * Math.PI * smooth(f) - Math.PI / 2 - i * gap
      return [6 * Math.cos(angle), 6 * Math.sin(angle)]
    },
  },
  // 3. Pendulum: the dots in a row, like a Newton's cradle; the left one swings out and comes back to
  //    strike, then the right one.
  {
    name: 'Pendulum',
    cycle: 1.5,
    position: (i, f) => {
      const x = (i - 1.5) * ROW_GAP
      const side = i === 0 ? -1 : i === 3 ? 1 : 0
      const p = i === 0 ? clamp(f / 0.5) : clamp((f - 0.5) / 0.5)
      const swing = side === 0 ? 0 : Math.sin(Math.PI * p)
      return [x + side * 5 * swing, -1.6 * swing * swing]
    },
  },
  // 4. Wave: the dots in a row jump one after the other.
  {
    name: 'Wave',
    cycle: 1.2,
    position: (i, f) => {
      const u = mod(f - i * 0.11, 1)
      return [(i - 1.5) * ROW_GAP, u < 0.42 ? -3.4 * bell(u / 0.42) : 0]
    },
  },
  // 5. Whirl: the dots wind in toward the center, turning faster and faster, then wind back out.
  {
    name: 'Whirl',
    cycle: 2,
    position: (i, f) => {
      const radius = 6.2 - 4.8 * bell(f)
      const angle = 2 * Math.PI * smooth(f) + (i * Math.PI) / 2 - (3 * Math.PI) / 4
      return [radius * Math.cos(angle), radius * Math.sin(angle)]
    },
  },
  // 6. Star: the square merges at the center, springs back out as a cross, merges again and springs
  //    back out as a square.
  {
    name: 'Star',
    cycle: 2,
    position: (i, f) => {
      const cross = f >= 0.3 && f < 0.8
      const radius =
        f < 0.1 ? 6 : f < 0.3 ? 6 * (1 - smooth((f - 0.1) / 0.2)) : f < 0.5 ? 6 * overshoot((f - 0.3) / 0.2) : f < 0.6 ? 6 : f < 0.8 ? 6 * (1 - smooth((f - 0.6) / 0.2)) : 6 * overshoot((f - 0.8) / 0.2)
      const angle = (cross ? 0 : Math.PI / 4) + (i * Math.PI) / 2 - Math.PI / 2
      return [radius * Math.cos(angle), radius * Math.sin(angle)]
    },
  },
  // 7. Satellites: two pairs, each spinning on itself, and around each other.
  {
    name: 'Satellites',
    cycle: 2,
    position: (i, f) => {
      const around = Math.PI * smooth(f)
      const spin = -2 * Math.PI * f
      const sign = i < 2 ? 1 : -1
      const [cx, cy] = [sign * 5 * Math.cos(around), sign * 5 * Math.sin(around)]
      const tip = i % 2 === 0 ? 1 : -1
      return [cx + tip * 2.6 * Math.cos(spin), cy + tip * 2.6 * Math.sin(spin)]
    },
  },
  // 8. Swap: two opposite corners swap places, crossing each other, then the other two.
  {
    name: 'Swap',
    cycle: 2,
    position: (i, f) => {
      const firstPair = i === 0 || i === 2
      const start = firstPair ? 0.08 : 0.54
      const e = smooth(clamp((f - start) / 0.38))
      const [sx, sy] = CORNERS[i]!
      const origin: [number, number] = [sx * HALF_SIDE, sy * HALF_SIDE]
      // Each one passes on its own side of the center: they cross without touching.
      const [nx, ny] = [-sy / Math.SQRT2, sx / Math.SQRT2]
      const bulge = 2.9 * Math.sin(Math.PI * e)
      return [origin[0] * (1 - 2 * e) + nx * bulge, origin[1] * (1 - 2 * e) + ny * bulge]
    },
  },
]

// A task's dance order: shuffled from its seed, always the same for the same seed (every drawing of a
// task finds the same dances), and no dance comes back twice.
export function danceOrder(seed: number): number[] {
  // The seed is a time: two tasks close in time have close seeds. It is mixed first, high bits
  // included, so that their orders have nothing in common.
  const mix = (x: number) => {
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
    return (x ^ (x >>> 16)) >>> 0
  }
  let state = mix((seed >>> 0) ^ mix(Math.floor(seed / 4294967296)))
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  const order = DANCES.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}

// The dance of step `k` (0 for the first): in the task's order if it has a seed, otherwise in the
// order of the list.
export const danceFor = (k: number, seed?: number) => {
  const i = mod(k, DANCES.length)
  return DANCES[seed === undefined ? i : danceOrder(seed)[i]!]!
}

// Where the four dots of a dance are `t` seconds after its birth, around its center.
export const positionsAt = (dance: Dance, t: number) =>
  [0, 1, 2, 3].map(i => dance.position(i, mod(t, dance.cycle) / dance.cycle))

// The dance in SMIL: each dot follows its positions, sampled 48 times per cycle, from `begin`.
const SAMPLES = 48
function danceSvg(dance: Dance, begin: string): string {
  return [0, 1, 2, 3]
    .map(i => {
      const values = Array.from({ length: SAMPLES + 1 }, (_, j) => dance.position(i, j / SAMPLES).map(n2).join(' ')).join(';')
      return `<circle r="${RADIUS}" fill="${ORANGE}"><animateTransform attributeName="transform" type="translate" values="${values}" dur="${dance.cycle}s" begin="${begin}" repeatCount="indefinite"/></circle>`
    })
    .join('')
}

// The indicator alone (a preview, an agent in the panel): the dance of step `k`, centered, resumed at
// `begin` (a SMIL begin).
export function indicatorSvg(k: number, side = 32, dance: Dance = danceFor(k), begin = '0s'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="-16 -16 32 32">${danceSvg(dance, begin)}</svg>`
}

// ---------------------------------------------------------------------------------------------
// The timeline: everything the bar shows derives from the history of the steps, and nothing else.
// The same history gives the same drawing at a given instant, however many drawings were made
// before: this is what keeps the animation continuous when the image is redrawn.

// What the bar needs to know: the number of steps, each announced step with its time (ms), and the
// time the work ended.
// `seed` draws the task's dance order.
export type View = { n: number; events: [number, number][]; end: number | null; seed?: number }

// The timings, in milliseconds.
const MS = {
  enter: 240, // the bar appears: the thread and the asleep dots fade in
  enterStagger: 40, // one step after the other
  merge: 260, // the four dots merge into one, without losing their momentum
  pulse: 420, // the done dot pulses once as it appears
  settle: 260, // at the end, it appears without overshooting: the shared pulse is the only beat
  takeoff: 300, // the messenger leaves the done step
  split: 350, // on arrival, it splits into four
  fade: 100, // an asleep dot fades out when the messenger arrives or passes
  endPulse: 600, // every dot pulses together
  endPulseDur: 500,
  exit: 1800, // then the bar fades out
  exitDur: 400,
}
// The length of the end, from the start of the visible end to the complete fade-out.
export const VISUAL_END_MS = MS.exit + MS.exitDur

const CURVES = {
  smooth: '.65 0 .35 1',
  exit: '.2 .8 .3 1',
  flight: '.45 0 .3 1',
}
// The sizes of a done dot: radius 3; at scale 0.733 it is the size of a dance dot (2.2): so it is
// born where the four dots merged, without shrinking.
const BIRTH_SCALE = n3(RADIUS / DOT.done)

// The messenger's trip: longer over a wide gap, without ever going too fast.
const flightDuration = (gap: number, n: number) => 480 + 620 * Math.sqrt(Math.min(1, Math.abs(gap) / Math.max(1, n - 1)))

// A flight of the messenger, in step positions (0 for the first; a fraction in between).
type Flight = { from: number; to: number; t0: number; dur: number; curve: string; end: number }
type StepNode = {
  asleepUntil: number // when the asleep dot starts fading out (Infinity: it stays)
  dance: { start: number; end: number } | null // born at `start` (split), merged at `end`
  mergeAt: number | null // when its four dots start merging
  doneAt: number | null // when the done dot appears (-Infinity: already there)
  pulse: 'strong' | 'soft' | null // strong: it pulses; soft: it settles without overshooting; null: already there
}
export type Timeline = {
  n: number
  nodes: StepNode[]
  flights: Flight[]
  // The start of the plan, the starting step, the last step aimed at, and the start of the end (null
  // while working).
  planStart: number
  startStep: number
  target: number
  endStart: number | null
}

const flightPos = (v: Flight, t: number) => v.from + (v.to - v.from) * bezier(v.curve, (t - v.t0) / v.dur)

export function timeline(view: View): Timeline {
  const n = Math.max(1, Math.round(view.n))
  const stepIndex = (s: number) => Math.min(n - 1, Math.max(0, Math.round(s) - 1))
  const planStart = view.events[0]?.[1] ?? 0
  const events = view.events
  const nodes: StepNode[] = Array.from({ length: n }, () => ({ asleepUntil: Infinity, dance: null, mergeAt: null, doneAt: null, pulse: null }))
  const flights: Flight[] = []
  if (events.length === 0) return { n, nodes, flights, planStart, startStep: 0, target: 0, endStart: null }

  let startStep = 0
  let target = 0
  let flight: Flight | null = null
  // Start from step `s` at `t`: the steps before it are done, this one dances. It is also what a real
  // step back does: the history starts over from it.
  const startFrom = (s: number, t: number) => {
    startStep = stepIndex(s)
    for (let k = 0; k < n; k++) nodes[k] = k < startStep ? { asleepUntil: -Infinity, dance: null, mergeAt: null, doneAt: -Infinity, pulse: null } : { asleepUntil: Infinity, dance: null, mergeAt: null, doneAt: null, pulse: null }
    nodes[startStep]!.asleepUntil = -Infinity
    nodes[startStep]!.dance = { start: t, end: Infinity }
    flights.length = 0
    target = startStep
    flight = null
  }
  startFrom(events[0]![0], events[0]![1])

  // A finished flight (up to `until`): the steps it went past are done, at the moment it passes them.
  const close = (v: Flight, until: number) => {
    v.end = until
    for (let j = Math.floor(v.from) + 1; j < v.to; j++) {
      if (j <= v.from) continue
      const when = v.t0 + timeFor(v.curve, (j - v.from) / (v.to - v.from)) * v.dur
      if (when >= until) continue
      nodes[j] = { asleepUntil: when - MS.fade / 2, dance: null, mergeAt: null, doneAt: when, pulse: 'strong' }
    }
  }
  // A flight that has arrived: the target step wakes up and its dance is born at the very instant of
  // arrival.
  const land = (v: Flight) => {
    const arrival = v.t0 + v.dur
    close(v, arrival)
    const node = nodes[v.to]!
    node.asleepUntil = arrival - MS.fade / 2
    node.dance = { start: arrival, end: Infinity }
  }
  // The current step merges into one dot at `t`, which appears once the four have merged.
  const merge = (t: number, pulse: 'strong' | 'soft') => {
    const node = nodes[target]!
    if (node.dance) node.dance.end = t
    node.mergeAt = node.dance ? t : null
    node.doneAt = t + MS.merge
    node.pulse = pulse
  }

  for (let i = 1; i < events.length; i++) {
    const [s, t] = events[i]!
    const aim = stepIndex(s)
    if (aim === target) continue
    const inFlight: Flight | null = flight !== null && t < flight.t0 + flight.dur ? flight : null
    const departed = inFlight !== null && t > inFlight.t0
    const u = inFlight === null ? target : departed ? flightPos(inFlight, t) : inFlight.from
    // A step lower than the target, but still ahead of the messenger, is a simple change of course;
    // behind it, it is a step back.
    if (aim < target && !(inFlight !== null && aim > u + 1e-3)) {
      startFrom(s, t)
      continue
    }
    let next: Flight
    if (inFlight !== null) {
      flight = inFlight
      // The messenger is in flight: it changes course where it is, at the speed it has.
      close(flight, Math.max(t, flight.t0))
      const dur = flightDuration(aim - u, n)
      let curve = CURVES.flight
      if (departed) {
        const speed = (flightPos(flight, t + 1) - flightPos(flight, t - 1)) / 2
        const slope = (speed * dur) / Math.max(1e-6, aim - u)
        curve = `.3 ${n3(Math.min(1, Math.max(0, 0.3 * slope)))} .3 1`
      }
      next = { from: u, to: aim, t0: Math.max(t, flight.t0), dur, curve, end: Infinity }
    } else {
      if (flight !== null) land(flight)
      merge(t, 'strong')
      next = { from: target, to: aim, t0: t + MS.takeoff, dur: flightDuration(aim - target, n), curve: CURVES.flight, end: Infinity }
    }
    flight = next
    flights.push(flight)
    target = aim
  }

  // The end of the work: a messenger in flight finishes its flight, then everything plays from its
  // arrival.
  let endStart: number | null = null
  if (view.end !== null) {
    const tEnd = view.end
    if (flight !== null && tEnd < flight.t0 + flight.dur) {
      const arrival = flight.t0 + flight.dur
      close(flight, arrival)
      const node = nodes[flight.to]!
      node.asleepUntil = arrival - MS.fade / 2
      node.doneAt = arrival
      node.pulse = 'soft'
      endStart = arrival
    } else {
      if (flight !== null) land(flight)
      merge(tEnd, 'soft')
      endStart = tEnd
    }
    // The steps that were left: the gray dot fades out while the orange dot grows over it.
    for (let j = target + 1; j < n; j++) {
      nodes[j] = { asleepUntil: endStart + MS.merge - MS.fade / 2, dance: null, mergeAt: null, doneAt: endStart + MS.merge, pulse: 'soft' }
    }
  } else if (flight !== null) {
    land(flight)
  }
  return { n, nodes, flights, planStart, startStep, target, endStart }
}

// Where the head of the bar is (the messenger, or the step it landed on) at time `t`.
function head(c: Timeline, t: number): number {
  let u = c.startStep
  for (const v of c.flights) {
    if (t < v.t0) return u
    if (t < v.end) return flightPos(v, t)
    u = v.end >= v.t0 + v.dur ? v.to : flightPos(v, v.end)
  }
  return u
}

// The time the bar has finished fading out, to remove it afterwards.
export const visualEnd = (view: View) => {
  const c = timeline(view)
  return c.endStart === null ? null : c.endStart + VISUAL_END_MS
}

// The step the bar shows as in progress (1 for the first), or 0 once the work is done.
export function shownStep(view: View): number {
  if (view.end !== null || view.events.length === 0) return 0
  return Math.min(view.n, Math.max(1, Math.round(view.events.at(-1)![0])))
}

// ---------------------------------------------------------------------------------------------
// The drawing: an image as wide as the band, with a fixed margin on each side and fixed-size dots.
// The places are CSS calc() values (pixels and percent of the width), static: right at any width and
// from the first image. Everything that moves is SMIL, the only clock that starts at the same moment
// in every image (a CSS animation starts 14 to 50 ms later depending on the image, and a SMIL value in
// percent is 0 on the first image). So the messenger glides through a SMIL scale of a group placed in
// CSS, and its dot keeps its size (a stroke that does not grow).
// Each animation starts at its time in the timeline; one already played is not written, its end
// state becomes the image's state.

const MARGIN = 16 // the margin on each side, in pixels: the widest dance fits in it

// `mark` makes each image unique: Chrome shows an image it has already seen (same source) with its
// animation clock from back then, and two plans of the same size drawn at their start would give the
// same source.
export function sceneSvg(view: View, now: number, mark = String(Math.round(now))): string {
  const c = timeline(view)
  const n = c.n
  const f = (u: number) => (n === 1 ? 0.5 : u / (n - 1))
  const placeAt = (u: number) => `calc(${MARGIN}px + ${n3(f(u))} * (100% - ${2 * MARGIN}px))`
  const begin = (T: number) => `${n3((T - now) / 1000)}s`
  const played = (T: number, dur: number) => T + dur <= now + 10
  const smil = (attr: string, values: string, times: string, T: number, dur: number, extra = '') =>
    `<animate${attr === 'transform' ? 'Transform attributeName="transform"' : ` attributeName="${attr}"`} ${extra}values="${values}" keyTimes="${times}" begin="${begin(T)}" dur="${n3(dur / 1000)}s" fill="freeze"/>`
  // An opacity that goes from `from` to `to` at time T; once played, only the final value is left.
  const fade = (from: number, to: number, T: number, dur: number) =>
    played(T, dur) ? { attr: `opacity="${to}"`, anim: '' } : { attr: `opacity="${from}"`, anim: smil('opacity', `${from};${to}`, '0;1', T, dur) }
  // Visible from T only.
  const visibleFrom = (T: number) => (T > now ? { attr: 'opacity="0"', anim: `<set attributeName="opacity" to="1" begin="${begin(T)}"/>` } : { attr: '', anim: '' })
  const placed = (u: number, content: string, attrs = '') =>
    `<g class="p" style="transform:translateX(${placeAt(u)})"${attrs}><g transform="translate(0 ${CY})">${content}</g></g>`

  // The entrance: the thread and the asleep dots fade in, one step after the other.
  const enterAt = (k: number) => c.planStart + k * MS.enterStagger

  // The thread: between two steps, small dots counted from the middle of the interval (the gaps to
  // both steps are equal), cut off at a guard from each step. Gray everywhere; orange up to the head,
  // whose cut follows the messenger with the same curve as the messenger.
  const clips: string[] = []
  const gray: string[] = []
  const orange: string[] = []
  const rest: string[] = []
  const dotted = (k: number) =>
    placed(k + 0.5, `<line x1="0" x2="${THREAD.reach}" y1="0" y2="0"/><line x1="0" x2="-${THREAD.reach}" y1="0" y2="0"/>`)
  for (let k = 0; k < n - 1; k++) {
    // The guard shrinks in a narrow band: the thread keeps at least 40% of each interval.
    const guard = `min(${THREAD.guard}px, ${n3(0.3 * (f(k + 1) - f(k)))} * (100% - ${2 * MARGIN}px))`
    const left = `calc(${MARGIN}px + ${n3(f(k))} * (100% - ${2 * MARGIN}px) + ${guard})`
    const width = `calc(${n3(f(k + 1) - f(k))} * (100% - ${2 * MARGIN}px) - 2 * ${guard})`
    clips.push(`<clipPath id="i${k}" clipPathUnits="userSpaceOnUse"><rect style="x:${left};width:${width}" y="0" height="${HEIGHT}"/></clipPath>`)
    const e = fade(0, 1, enterAt(k) + MS.enterStagger / 2, MS.enter)
    gray.push(`<g clip-path="url(#i${k})" ${e.attr}>${e.anim}${dotted(k)}</g>`)
    if (c.endStart !== null && k >= c.target) {
      const lit = fade(0, 1, c.endStart + MS.merge, 250)
      rest.push(`<g clip-path="url(#i${k})" ${lit.attr}>${lit.anim}${dotted(k)}</g>`)
    } else {
      orange.push(`<g clip-path="url(#i${k})">${dotted(k)}</g>`)
    }
  }
  // A flight: a group placed at the start, scaled from 0 to 1 along the flight (SMIL, with the
  // flight's curve), holding what must travel to the arrival, placed at the length of the trip.
  const glide = (v: Flight, content: string) => {
    const progress = now <= v.t0 ? 0 : bezier(v.curve, (now - v.t0) / v.dur)
    // Never 0: a group at zero scale is not drawn, and the messenger would vanish for one image.
    const scale = (p: number) => `${n3(Math.max(0.001, p))} 1`
    const done = played(v.t0, v.dur)
    const anim = done
      ? ''
      : `<animateTransform attributeName="transform" type="scale" values="${scale(0)};${scale(1)}" keyTimes="0;1" calcMode="spline" keySplines="${v.curve}" begin="${begin(v.t0)}" dur="${n3(v.dur / 1000)}s" fill="freeze"/>`
    return `<g class="p" style="transform:translateX(${placeAt(v.from)})"><g transform="scale(${scale(done ? 1 : progress)})">${anim}${content}</g></g>`
  }
  const travel = (v: Flight) => `calc(${n3(f(v.to) - f(v.from))} * (100% - ${2 * MARGIN}px))`

  // The lit thread: up to the messenger during its flight, otherwise up to the step it landed on.
  // (The mask id "tete" means "head".)
  const active = c.flights.at(-1)
  const inFlight = active !== undefined && active.end >= active.t0 + active.dur && !played(active.t0, active.dur)
  const fixed = `<rect x="0" y="0" height="${HEIGHT}" fill="#fff" style="width:${placeAt(inFlight ? active.from : head(c, now))}"/>`
  const growing = inFlight ? glide(active, `<rect x="-5000" y="0" height="${HEIGHT}" fill="#fff" style="width:calc(5000px + ${travel(active).slice(5)}"/>`) : ''
  clips.push(`<mask id="tete" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="${HEIGHT}">${fixed}${growing}</mask>`)
  const thread =
    `<g stroke-width="${2 * THREAD.radius}" stroke-linecap="round" stroke-dasharray="0 ${THREAD.spacing}">` +
    `<g stroke="${GRAY}" opacity="${THREAD.opacity}">${gray.join('')}</g>` +
    `<g stroke="${ORANGE}" opacity="${THREAD.doneOpacity}"><g mask="url(#tete)">${orange.join('')}</g>${rest.join('')}</g></g>`

  // The steps.
  const steps: string[] = []
  c.nodes.forEach((node, k) => {
    const parts: string[] = []
    // The asleep dot: it appears with the bar, and fades out when the messenger arrives or passes.
    if (node.asleepUntil === Infinity || !played(node.asleepUntil, MS.fade)) {
      const birth = enterAt(k)
      const appear = played(birth, MS.enter) ? '' : smil('opacity', `0;${DOT.asleepOpacity}`, '0;1', birth, MS.enter)
      const leave = node.asleepUntil === Infinity ? '' : smil('opacity', `${DOT.asleepOpacity};0`, '0;1', node.asleepUntil, MS.fade)
      const base = played(birth, MS.enter) ? DOT.asleepOpacity : 0
      parts.push(`<circle r="${DOT.asleep}" fill="${GRAY}" opacity="${base}">${appear}${leave}</circle>`)
    }
    // The dance: it is born from one dot (the four leave the center keeping their size), then loops.
    const dance = danceFor(k, view.seed)
    // How far apart the four dots are `ms` after the dance is born: they leave the center, slowing down.
    const spread = (ms: number) => (ms >= MS.split ? 1 : 1 - (1 - Math.max(0, ms) / MS.split) ** 3)
    // The plan's first dance fades in with the bar; its dots keep that fade until the merge.
    const danceEnter = node.dance !== null && node.dance.start === c.planStart ? fade(0, 1, node.dance.start, MS.enter) : { attr: '', anim: '' }
    if (node.dance !== null && node.dance.end > now) {
      const T = node.dance.start
      const visible = T === c.planStart ? danceEnter : visibleFrom(T)
      const hide = node.dance.end === Infinity ? '' : `<set attributeName="opacity" to="0" begin="${begin(node.dance.end)}"/>`
      const dots = [0, 1, 2, 3]
        .map(i => {
          const loop = Array.from({ length: SAMPLES + 1 }, (_, j) => dance.position(i, j / SAMPLES).map(n2).join(' ')).join(';')
          const splitAnim = played(T, MS.split)
            ? ''
            : `<animateTransform attributeName="transform" type="translate" values="${Array.from({ length: 13 }, (_, j) => {
                const s = (j / 12) * MS.split
                const [px, py] = positionsAt(dance, s / 1000)[i]!
                const r = spread(s)
                return `${n2(px * r)} ${n2(py * r)}`
              }).join(';')}" begin="${begin(T)}" dur="${n3(MS.split / 1000)}s"/>`
          return `<circle r="${RADIUS}" fill="${ORANGE}"><animateTransform attributeName="transform" type="translate" values="${loop}" dur="${dance.cycle}s" begin="${begin(T)}" repeatCount="indefinite"/>${splitAnim}</circle>`
        })
        .join('')
      parts.push(`<g ${visible.attr}>${visible.anim}${hide}${dots}</g>`)
    }
    // The merge: the four dots carry on with their dance while closing in on the center. Started
    // during the split or the entrance fade, it starts from where they are. They stay drawn until the
    // done dot appears (in its last 10 ms, frozen at the center): no gap.
    if (node.mergeAt !== null && node.dance !== null && node.mergeAt + MS.merge > now) {
      const frozen = played(node.mergeAt, MS.merge)
      const age = node.mergeAt - node.dance.start
      const circles: string[] = []
      for (let i = 0; i < 4; i++) {
        const values = Array.from({ length: 13 }, (_, j) => {
          const ms = age + (j / 12) * MS.merge
          const [px, py] = positionsAt(dance, ms / 1000)[i]!
          const r = spread(ms) * (1 - smooth(j / 12))
          return `${n2(px * r)} ${n2(py * r)}`
        })
        const first = values[0]!
        const visible = visibleFrom(node.mergeAt)
        circles.push(
          frozen
            ? `<circle r="${RADIUS}" fill="${ORANGE}"/>`
            : `<circle r="${RADIUS}" fill="${ORANGE}" transform="translate(${first})" ${visible.attr}>${visible.anim}<animateTransform attributeName="transform" type="translate" values="${values.join(';')}" begin="${begin(node.mergeAt)}" dur="${n3(MS.merge / 1000)}s" fill="freeze"/></circle>`,
        )
      }
      parts.push(`<g ${danceEnter.attr}>${danceEnter.anim}${circles.join('')}</g>`)
    }
    // The done dot: it is born at the size of a dance dot, pulses once (or settles, at the end), then
    // pulses with all the others when the work is done.
    if (node.doneAt !== null) {
      const T = node.doneAt
      let scale = { attr: '', anim: '' }
      if (node.pulse !== null && !played(T, node.pulse === 'strong' ? MS.pulse : MS.settle)) {
        scale =
          node.pulse === 'strong'
            ? { attr: `transform="scale(${BIRTH_SCALE})"`, anim: smil('transform', `${BIRTH_SCALE};1.18;1`, '0;.4;1', T, MS.pulse, 'type="scale" calcMode="spline" keySplines=".2 .8 .3 1;.65 0 .35 1" ') }
            : { attr: `transform="scale(${BIRTH_SCALE})"`, anim: smil('transform', `${BIRTH_SCALE};1`, '0;1', T, MS.settle, 'type="scale" calcMode="spline" keySplines=".2 .8 .3 1" ') }
      }
      const visible = visibleFrom(T)
      const all =
        c.endStart !== null && !played(c.endStart + MS.endPulse, MS.endPulseDur)
          ? { attr: '', anim: smil('transform', '1;1.25;1', '0;.35;1', c.endStart + MS.endPulse, MS.endPulseDur, 'type="scale" calcMode="spline" keySplines=".2 .8 .3 1;.65 0 .35 1" ') }
          : { attr: '', anim: '' }
      parts.push(`<g ${visible.attr}>${visible.anim}<g>${all.anim}<circle r="${DOT.done}" fill="${ORANGE}" ${scale.attr}>${scale.anim}</circle></g></g>`)
    }
    if (parts.length) steps.push(placed(k, parts.join('')))
  })

  // The messenger: it glides from one step to the next, then disappears at the instant the dance is
  // born beneath it. A dot made of a zero-length stroke: the flight's scale does not distort it.
  const messengers: string[] = []
  for (const v of c.flights) {
    const arrival = v.t0 + v.dur
    // Drawn until the instant of arrival, when the dance takes its place (without the 10 ms margin).
    if (v.end < arrival || arrival <= now) continue
    const visible = visibleFrom(v.t0)
    const dot = `<path d="M0 ${CY}h0" stroke="${ORANGE}" stroke-width="${2 * RADIUS}" stroke-linecap="round" vector-effect="non-scaling-stroke" ${visible.attr}>${visible.anim}<set attributeName="opacity" to="0" begin="${begin(arrival)}"/></path>`
    messengers.push(glide(v, `<g class="p" style="transform:translateX(${travel(v)})">${dot}</g>`))
  }

  // At the end, the whole bar fades out after the shared pulse.
  const exit = c.endStart !== null ? fade(1, 0, c.endStart + MS.exit, MS.exitDur) : { attr: '', anim: '' }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${HEIGHT}"><!--${mark}--><style>.p{transform-box:view-box}</style><defs>${clips.join('')}</defs>` +
    `<g ${exit.attr}>${exit.anim}${thread}${steps.join('')}${messengers.join('')}</g></svg>`
  )
}

// For the terminal: a done step is a solid dot, the current step cycles through the glyphs of
// Claude's indicator, an upcoming step is an empty circle; the thread is made of dots.
const GLYPHS = ['✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳']
export function dotsText(view: View, now: number, columns: number): string {
  const c = timeline(view)
  const n = c.n
  const line = Array.from({ length: Math.max(n, columns) }, () => '·')
  c.nodes.forEach((node, k) => {
    const i = n === 1 ? 0 : Math.round((k * (line.length - 1)) / (n - 1))
    const done = node.doneAt !== null && node.doneAt <= now
    const dancing = node.dance !== null && node.dance.start <= now && node.dance.end > now
    line[i] = done ? '●' : dancing ? GLYPHS[Math.floor(now / 1000) % GLYPHS.length]! : '○'
  })
  return line.join('')
}
