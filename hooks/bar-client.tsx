// The bar, drawn by the desktop app itself (the surface module of a Client). The app keeps this
// drawing as it is when it rebuilds the band, which it does on every reply from the engine: an Svg
// image placed directly in the band would be recreated every time, and its animation would start over
// from zero. Here, the image is only redrawn when the props change (a step, the end) or the band
// changes width, and it is then computed at the exact time: what follows is continuous.
import type { ClientModule } from 'claude-code'

import { sceneSvg, type View } from './dots'

export type BarProps = { view: View; alt: string }

// A step arrives here a little after the engine recorded it. Starting from the engine's time would
// make the image jump by the length of that trip; so we start from the time the display sees it,
// without going past MAX_DELAY: the engine removes the band according to its own times, with a margin
// barely larger (register.tsx), and the bar must have finished its fade-out before then. What had
// already happened when the display first saw the plan keeps its time, except what just happened.
const RECENT_MS = 1500
const MAX_DELAY = 400
type Seen = { events: number[]; end: number | null }
const seen = new Map<string, Seen>()

function retimed(view: View, now: number): View {
  const key = `${view.n}:${view.events[0]?.[1] ?? 0}`
  let entry = seen.get(key)
  const shift = (t: number) => Math.min(Math.max(t, now), t + MAX_DELAY)
  const timeOf = (t: number, firstSight: boolean) => (firstSight && now - t >= RECENT_MS ? t : shift(t))
  const firstSight = entry === undefined
  if (entry === undefined) {
    entry = { events: [], end: null }
    seen.set(key, entry)
    // One plan at a time per band; the last eight are kept.
    for (const other of [...seen.keys()].slice(0, -8)) seen.delete(other)
  }
  for (let i = entry.events.length; i < view.events.length; i++) {
    // Never before the previous step: the order of the history is kept.
    entry.events.push(Math.max(timeOf(view.events[i]![1], firstSight), entry.events[i - 1] ?? -Infinity))
  }
  if (view.end !== null && entry.end === null) entry.end = Math.max(timeOf(view.end, firstSight), entry.events.at(-1) ?? -Infinity)
  return { n: view.n, events: view.events.map(([s], i) => [s, entry.events[i]!] as [number, number]), end: view.end === null ? null : entry.end, seed: view.seed }
}

// Each image carries the time and a count: never two identical sources.
let count = 0

const BarClient: ClientModule<BarProps> = props => {
  const now = Date.now()
  count += 1
  // The Svg element is not in a surface module's table, but the desktop app draws it: it goes
  // through h, like the others.
  return h('Svg', { source: sceneSvg(retimed(props.view, now), now, `${now}.${count}`), alt: props.alt, width: 4096, height: 26 }) as ReturnType<ClientModule>
}

export default BarClient
