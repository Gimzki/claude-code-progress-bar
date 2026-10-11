// The panel's small drawings: an indicator for each agent (the four dancing dots, like the bar), the
// step icons, and a mini bar as a grid of dots, in the bar's orange. The panel is redrawn every
// second: each animation starts from the clock time, to resume where it was instead of starting over.
import { danceFor, indicatorSvg, ORANGE } from './dots'

const PALE = '#F3D6CB'
const GRAY = '#8A8A8A'

// A loop of `period` seconds resumed at time `now` (ms): its negative `begin`.
const resumeAt = (now: number, period: number) => `-${((now / 1000) % period).toFixed(3)}s`

export type AgentState = 'running' | 'done' | 'stopped'

// An agent at work: four dancing dots, one dance per agent; done: a solid dot; stopped: a gray dot.
export function agentSvg(state: AgentState, index = 0, now = 0): string {
  if (state === 'running') {
    const dance = danceFor(index)
    return indicatorSvg(index, 22, dance, resumeAt(now, dance.cycle))
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="-11 -11 22 22"><circle r="3" fill="${state === 'done' ? ORANGE : GRAY}"/></svg>`
}

// The step icons, outlined like the app's: done (checked circle), in progress (spinning ring),
// upcoming (faint circle).
export type StepState = 'done' | 'current' | 'upcoming'

const CIRCLE = 'cx="8" cy="8" r="6.25"'
const STROKE = 'fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'

export function stepIcon(state: StepState, now = 0): string {
  const openTag = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">`
  if (state === 'done') {
    return `${openTag}<g ${STROKE} stroke="${ORANGE}"><circle ${CIRCLE}/><path d="M5.3 8.3l1.9 1.9 3.6-3.9"/></g></svg>`
  }
  if (state === 'current') {
    return (
      `${openTag}<g ${STROKE}><circle ${CIRCLE} stroke="#808080" stroke-opacity=".35"/>` +
      `<path d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25" stroke="${ORANGE}"><animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.9s" begin="${resumeAt(now, 0.9)}" repeatCount="indefinite"/></path></g></svg>`
    )
  }
  return `${openTag}<circle ${CIRCLE} ${STROKE} stroke="#808080" stroke-opacity=".55"/></svg>`
}

// A mini bar as a grid of dots on a rounded track, like the main bar: a fraction from 0 to 1, or
// `null` when the progress is unknown: a light sweep then passes over it in a loop.
export function miniBar(fraction: number | null, width = 300, color = ORANGE, rows = 3, now = 0): string {
  const pitch = 4
  const side = 3
  const margin = 2
  const cols = Math.floor((width - 2 * margin + (pitch - side)) / pitch)
  const height = rows * pitch - (pitch - side) + 2 * margin
  const background = `<pattern id="f" x="${margin}" y="${margin}" width="${pitch}" height="${pitch}" patternUnits="userSpaceOnUse"><rect width="${side}" height="${side}" rx=".6" fill="#808080" fill-opacity=".22"/></pattern>`
  const filled = `<pattern id="r" x="${margin}" y="${margin}" width="${pitch}" height="${pitch}" patternUnits="userSpaceOnUse"><rect width="${side}" height="${side}" rx=".6" fill="${color}"/></pattern>`
  const pale = `<pattern id="q" x="${margin}" y="${margin}" width="${pitch}" height="${pitch}" patternUnits="userSpaceOnUse"><rect width="${side}" height="${side}" rx=".6" fill="${PALE}"/></pattern>`
  const track = `<rect width="${width}" height="${height}" rx="4" fill="#808080" fill-opacity=".12"/>`
  const grid = `x="${margin}" y="${margin}" width="${cols * pitch - (pitch - side)}" height="${height - 2 * margin}"`
  const openTag = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`

  if (fraction === null) {
    const sweep = 10 * pitch
    return (
      openTag +
      `<defs>${background}${pale}<linearGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><g><animateTransform attributeName="transform" type="translate" from="${-sweep} 0" to="${width} 0" dur="1.6s" begin="${resumeAt(now, 1.6)}" repeatCount="indefinite"/><rect width="${sweep}" height="${height}" fill="url(#g)"/></g></mask></defs>` +
      `${track}<rect ${grid} fill="url(#f)"/><rect ${grid} fill="url(#q)" mask="url(#m)"/></svg>`
    )
  }

  const lit = Math.round(Math.min(1, Math.max(0, fraction)) * cols)
  return (
    openTag +
    `<defs>${background}${filled}</defs>` +
    `${track}<rect ${grid} fill="url(#f)"/>` +
    (lit > 0 ? `<rect x="${margin}" y="${margin}" width="${lit * pitch}" height="${height - 2 * margin}" fill="url(#r)"/>` : '') +
    `</svg>`
  )
}
