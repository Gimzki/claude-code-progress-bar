import { expect, mock, test } from 'claude-code/testing'

import { agentSvg, barreMini, icone } from '../hooks/pixels'
import { compterAction, duree, finirAgent, nombre, nomModele, nouveauTour, noterEtape } from '../hooks/suivi'

const OUTIL = 'mcp__barre-progression__progression'
const ETAPES = ['Lire la soirée', 'Poser les vœux', 'Vérifier']

const PANNEAU = {
  component: 'Pane',
  requestId: 'progression',
  props: {
    title: 'Progression',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const USAGE = {
  input_tokens: 30000,
  output_tokens: 2000,
  cache_read_input_tokens: 8000,
  cache_creation_input_tokens: 1000,
  model: 'claude-opus-5-5',
}

test('le suivi compte les actions, note les étapes et écrit les durées comme l\'app', async () => {
  let t = nouveauTour('  Trouve-moi   une image de tigre  ', 0)
  expect(t.texte).toBe('Trouve-moi une image de tigre')
  t = compterAction(t, undefined, 100)
  t = compterAction(t, 'ag1', 200)
  t = compterAction(t, 'ag1', 300)
  expect(t.actions).toBe(1)
  expect(t.agents).toEqual([{ id: 'ag1', debut: 200, actions: 2 }])
  t = noterEtape(t, { etapes: ETAPES, etape: 1, depuis: 0, debut: 0 }, 400)
  t = noterEtape(t, { etapes: ETAPES, etape: 1, depuis: 0, debut: 0 }, 500)
  t = noterEtape(t, { etapes: ETAPES, etape: 2, depuis: 0, debut: 0 }, 600)
  expect(t.etapes).toEqual([{ etape: 1, debut: 400 }, { etape: 2, debut: 600 }])
  expect(t.noms).toEqual(ETAPES)
  t = finirAgent(t, 'ag1', 900, USAGE, false)
  expect(t.agents[0]).toMatchObject({ fin: 900, jetons: 41000, modele: 'claude-opus-5-5', arrete: false })
  // « 7min 56s », comme la ligne d'un agent dans la conversation.
  expect(duree(19_000)).toBe('19s')
  expect(duree(476_000)).toBe('7min 56s')
  expect(duree(3_725_000)).toBe('1h 2min')
  expect(nombre(41000)).toBe('41 k')
  expect(nombre(1_250_000)).toBe('1,3 M')
  expect(nomModele('claude-opus-5-5')).toBe('Opus 5.5')
})

test('les icônes d\'étape et les mini-barres', async () => {
  expect(icone('faite')).toContain('<path d="M5.3 8.3')
  expect(icone('courante')).toContain('type="rotate"')
  expect(icone('a-venir')).not.toContain('<animate')
  expect(barreMini(null)).toContain('dur="1.6s"')
  expect(barreMini(null)).toContain('repeatCount="indefinite"')
  expect(barreMini(0.5, 300)).toContain('width="148"')
  expect(barreMini(1, 300)).not.toContain('<animate')
  expect(barreMini(null, 200, '#CC7C5E', 2)).toContain('height="11"')
  // Redessinés chaque seconde, ils reprennent leur boucle là où elle en était.
  expect(icone('courante', 1450)).toContain('begin="-0.550s"')
  expect(barreMini(null, 300, undefined, 3, 2000)).toContain('begin="-0.400s"')
})

test('un agent: quatre points qui dansent au travail, un point plein fini, un point gris arrêté', async () => {
  const actif = agentSvg('actif', 0, 0)
  expect(actif.match(/<circle /g)!.length).toBe(4)
  expect(actif).toContain('repeatCount="indefinite"')
  // Deux agents ne dansent pas la même danse.
  expect(agentSvg('actif', 1, 0)).not.toBe(actif)
  expect(agentSvg('fini')).toContain('fill="#CC7C5E"')
  expect(agentSvg('arrete')).toContain('fill="#8A8A8A"')
  expect(agentSvg('fini')).not.toContain('<animate')
})

test('le panneau suit la demande, les étapes, les actions et les agents', { options: { language: 'fr' } }, async ($, on) => {
  const horloge = mock.clock(on)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.list', () => ({ value: [{ id: 'ag1', description: 'Chercher des tigres', type: 'Explore', status: 'running' as const }] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 34 }, rateLimits: [] } }))

  const ui = await $.ui.mount({ plugin: 'barre-progression', surface: 'desktop', ...PANNEAU })
  expect(await ui.find({ type: 'Text', text: 'Aucune tâche en cours' })).toBeDefined()

  await $.turn.start({ text: 'Trouve-moi une image de tigre', turnId: 't1' })
  await $.tool.call({ tool: OUTIL, tool_use_id: 'p1', steps: ETAPES, step: 1 })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'ls' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'r1', file_path: '/tmp/a', agentId: 'ag1' })
  await horloge.advance(19_000)
  await ui.redraw(PANNEAU.props)

  expect(await ui.find({ type: 'Text', text: 'Trouve-moi une image de tigre' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'En cours' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '19s' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 sur 3' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '34 %' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Poser les vœux' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 en cours' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Chercher des tigres' })).toBeDefined()
  expect((await ui.findAll({ type: 'Svg' })).map(d => d.props.alt)).toContain('Agent au travail')

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'a1', reason: 'answer', agentId: 'ag1', usage: USAGE })
  await ui.redraw(PANNEAU.props)
  expect(await ui.find({ type: 'Text', text: /Explore · Opus 5.5 · 1 action · 41 k jetons/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1 terminé' })).toBeDefined()
  expect((await ui.findAll({ type: 'Svg' })).map(d => d.props.alt)).toContain('Agent terminé')
  await ui.unmount()
})

test('la commande /progression ouvre le panneau sans rien écrire dans la conversation', async ($, on) => {
  const ouverts: string[] = []
  on('ui.open', (_, e) => {
    ouverts.push(e.id)
    return { value: { isPlaced: true } }
  })
  const reponse = await $.command.run({
    command: 'progression',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })
  expect(ouverts).toEqual(['progression'])
  expect(reponse.text).toBeUndefined()
})
