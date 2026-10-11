import { expect, mock, test } from 'claude-code/testing'

import { avancer, lirePlan, terminer } from '../hooks/dessin'
import { positionVisible } from '../hooks/mouvement'
import type { Plan } from '../types'

const OUTIL = 'mcp__barre-progression__progression'
const ETAPES = ['Lire la soirée', 'Poser les vœux', 'Vérifier', 'Exporter']

const BANDE = (isWorking: boolean) =>
  ({
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking,
      maxRows: 6,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 5 },
      view: {},
    },
  }) as const

const FIN = {
  answer: 'Fini.',
  durationMs: 1000,
  isAborted: false,
  turnId: 't1',
  reason: 'answer' as const,
}

const plan = (lu: Plan | string) => {
  if (typeof lu === 'string') throw new Error(lu)
  return lu
}

test('le plan se lit, se borne, et le même numéro ne relance rien', async () => {
  const un = plan(lirePlan({ steps: ETAPES, step: 1 }, null, 1000))
  expect(un).toEqual({ etapes: ETAPES, etape: 1, depuis: 0, debut: 1000, etapeDepuis: 1000 })
  expect(lirePlan({ step: 1 }, un, 5000)).toBe(un)
  // Trois actions dans la première étape, puis la dernière étape: elle part de là où la barre était
  // vraiment, et compte ses actions à partir de zéro.
  const trois = [2000, 3000, 4000].reduce((p, t) => avancer(p, t), un)
  expect(trois.actions).toBe(3)
  const deux = plan(lirePlan({ step: 9 }, trois, 42000))
  expect(deux.etape).toBe(4)
  expect(deux.actions ?? 0).toBe(0)
  expect(Math.abs(deux.depuis - positionVisible(trois, 38))).toBeLessThan(0.001)
  expect(deux.depuis).toBeGreaterThan(0.05)
  expect(typeof lirePlan({ step: 2 }, terminer(deux, 50000), 51000)).toBe('string')
  expect(typeof lirePlan({ step: 1 }, null, 0)).toBe('string')
})

test('la barre ne recule jamais, même quand les étapes s\'enchaînent vite', async () => {
  // Étape 1 à 0 s avec des actions serrées, étape 2 à 3 s, étape 3 pendant la glisse, actions pendant
  // un cran, rappel de l'étape 3, plan rallongé, actions d'agents, fin.
  const appels: [number, Record<string, unknown> | 'fin' | 'action'][] = [
    [0, { steps: ETAPES, step: 1 }],
    [200, 'action'],
    [350, 'action'],
    [1500, 'action'],
    [3000, { step: 2 }],
    [3100, 'action'],
    [3400, { step: 3 }],
    [3500, 'action'],
    [3600, 'action'],
    [5000, { step: 3 }],
    [9000, { steps: [...ETAPES, 'Livrer', 'Ranger', 'Noter', 'Fermer'], step: 3 }],
    ...Array.from({ length: 40 }, (_, i): [number, 'action'] => [9500 + i * 200, 'action']),
    [20000, 'fin'],
  ]
  let actuel: Plan | null = null
  let avant = -1
  let i = 0
  for (let t = 0; t <= 22000; t += 50) {
    while (i < appels.length && appels[i]![0] <= t) {
      const [quand, args] = appels[i++]!
      actuel = args === 'fin' ? terminer(actuel!, quand) : args === 'action' ? avancer(actuel!, quand) : plan(lirePlan(args, actuel, quand))
    }
    const ici = positionVisible(actuel!, (t - actuel!.debut) / 1000)
    expect(ici).toBeGreaterThanOrEqual(avant - 1e-9)
    avant = ici
  }
  expect(Math.abs(avant - 1)).toBeLessThan(1e-6)
})

test('la barre suit Claude, finit au bout, puis s\'efface', { options: { language: 'fr' } }, async ($, on) => {
  const horloge = mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: 'ok' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="vide" />
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'barre-progression', surface, ...BANDE(true) })
    expect(await ui.find({ key: 'barre' })).toBeUndefined()

    const premier = await $.tool.call({ tool: OUTIL, tool_use_id: 'a', steps: ETAPES, step: 1 })
    expect(premier.deny).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Étape 1 sur 4$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Lire la soirée/ })).toBeDefined()

    await horloge.advance(2000)
    await $.tool.call({ tool: OUTIL, tool_use_id: 'b', step: 2 })
    expect(await ui.find({ type: 'Text', text: /^Étape 2 sur 4$/ })).toBeDefined()
    if (surface === 'desktop') {
      // Sur le bureau, la barre est un Client: l'app le garde tel quel entre deux réponses du moteur.
      // Ses props ne changent qu'avec les étapes: ni une action ni le temps ne le refont.
      const client = async () => (await ui.find({ type: 'Client', key: 'fil' }))!.props as { module: string; props: { vue: { n: number; ev: number[][]; fin: number | null } } }
      expect((await client()).module).toContain('barre-client.tsx')
      expect((await client()).props.vue.ev.length).toBe(2)
      const avant = JSON.stringify((await client()).props)
      await $.tool.call({ tool: 'Bash', tool_use_id: 'action', command: 'ls' })
      await horloge.advance(2000)
      expect(JSON.stringify((await client()).props)).toBe(avant)
      // Ce que le module dessine: l'image sur toute la largeur.
      const image = await ui.find({ type: 'Svg', in: 'fil' })
      expect(image?.props.width).toBe(4096)
      expect(String(image?.props.source)).toContain('width="100%"')
    }
    const rappel = await $.tool.call({ tool: OUTIL, tool_use_id: 'b2', step: 2 })
    expect(JSON.stringify(rappel)).toContain('already')

    const sousAgent = await $.tool.call({ tool: OUTIL, tool_use_id: 'c', step: 3, agentId: 'x' })
    expect(sousAgent.deny).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Étape 2 sur 4$/ })).toBeDefined()

    // Entre deux appels, l'app peut dire que Claude ne travaille plus: la barre reste jusqu'à la fin.
    await ui.redraw(BANDE(false).props)
    expect(await ui.find({ key: 'barre' })).toBeDefined()

    await $.turn.complete(FIN)
    expect(await ui.find({ type: 'Text', text: /^Terminé$/ })).toBeDefined()

    // La barre reste le temps de sa fin (le messager en route finit d'abord son vol), puis part.
    await horloge.advance(1700)
    expect(await ui.find({ type: 'Text', text: /^Terminé$/ })).toBeDefined()
    await horloge.advance(2500)
    expect(await ui.find({ key: 'barre' })).toBeUndefined()
    await ui.unmount()
  }
})

test('un arrêt efface la barre tout de suite, sans complétude', { options: { language: 'fr' } }, async ($, on) => {
  mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="vide" />
  })

  const ui = await $.ui.mount({ plugin: 'barre-progression', surface: 'desktop', ...BANDE(true) })
  await $.tool.call({ tool: OUTIL, tool_use_id: 'a', steps: ETAPES, step: 2 })
  expect(await ui.find({ key: 'barre' })).toBeDefined()

  await $.turn.complete({ ...FIN, reason: 'aborted' as const, isAborted: true })
  await ui.redraw(BANDE(false).props)
  expect(await ui.find({ key: 'barre' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Terminé$/ })).toBeUndefined()
  await ui.unmount()
})

test('chaque action avance la barre d\'un cran, sans jamais toucher l\'étape suivante', async () => {
  const p: Plan = { etapes: ETAPES, etape: 1, depuis: 0, debut: 0 }
  // Sans action, le temps ne la fait pas avancer.
  expect(positionVisible(p, 600)).toBe(positionVisible(p, 1))
  // Chaque action la pousse un peu plus loin, de moins en moins, toujours avant l'étape 2.
  let actuel = p
  const positions: number[] = []
  for (let i = 1; i <= 60; i++) {
    actuel = avancer(actuel, i * 1000)
    positions.push(positionVisible(actuel, 5))
  }
  positions.slice(1).forEach((x, i) => expect(x).toBeGreaterThan(positions[i]!))
  expect(Math.abs(positions[7]! - 0.1125)).toBeLessThan(0.001)
  expect(positions.at(-1)!).toBeLessThan(0.25)
})

test('un numéro sans plan est refusé', async ($, on) => {
  mock.clock(on)
  const refus = await $.tool.call({ tool: OUTIL, tool_use_id: 'z', step: 2 })
  expect(refus.deny).toContain('steps')
})

test('en anglais par défaut: la bande, le bouton et la fin', async ($, on) => {
  mock.clock(on)
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="vide" />
  })
  const ui = await $.ui.mount({ plugin: 'barre-progression', surface: 'desktop', ...BANDE(true) })
  await $.tool.call({ tool: OUTIL, tool_use_id: 'a', steps: ['Read the brief', 'Draft', 'Check'], step: 2 })
  expect(await ui.find({ type: 'Text', text: /^Step 2 of 3$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Draft$/ })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'details' }))?.props.label).toBe('Details')
  await $.turn.complete(FIN)
  expect(await ui.find({ type: 'Text', text: /^Done$/ })).toBeDefined()
  await ui.unmount()
})
