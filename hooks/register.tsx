import { atom, read, update } from 'claude-code'
import type { AgentInfo, Register } from 'claude-code'

import type { AgentSuivi, Plan, Tour, VueBande } from '../types'
import { avancer, lirePlan, terminer } from './dessin'
import { positionVisible } from './mouvement'
import { etapeMontree, finVisuelle, ORANGE, pointsTexte, sceneSvg } from './points'
import type { Vue } from './points'
import { agentSvg, barreMini, icone } from './pixels'
import type { EtatAgent, EtatEtape } from './pixels'
import { compterAction, duree, finirAgent, finirTour, nombre, nomModele, nouveauTour, noterEtape } from './suivi'
import { textes } from './textes'

const PLUGIN = 'barre-progression'
const OUTIL = `mcp__${PLUGIN}__progression`
const PANNEAU = 'progression'

const plan = atom({ plugin: 'barre-progression', key: 'plan' } as const, null as Plan | null)
const tour = atom({ plugin: 'barre-progression', key: 'tour' } as const, null as Tour | null)
// Un battement par seconde pendant le travail: le panneau le lit pour ses durées, le terminal pour
// son signe animé. La barre de l'app de bureau ne le lit pas: elle ne bouge pas entre deux étapes.
const tic = atom({ plugin: 'barre-progression', key: 'tic' } as const, 0)
// Ce que la bande montre, écrit seulement quand une étape change ou que le travail finit.
const vue = atom({ plugin: 'barre-progression', key: 'vue' } as const, null as VueBande | null)
// Le plan dont le Client a échoué dans l'app (l'heure de sa première étape): pour ce plan, la bande
// dessine l'image elle-même; le plan suivant retente le Client.
const enPanne = atom({ plugin: 'barre-progression', key: 'enPanne' } as const, null as number | null)
// Ce que le dessin reçoit de la bande.
const vuePour = (v: VueBande): Vue => ({ n: v.etapes.length, ev: v.ev, fin: v.fin, graine: v.graine ?? v.ev[0]?.[1] ?? 0 })
// Au-delà, l'histoire d'une même liste d'étapes n'apprend plus rien (elle ne fait qu'avancer).
const HISTOIRE_MAX = 1000

// Ce que lit le modèle: en anglais, quelle que soit la langue de l'interface.
const DESCRIPTION =
  'Shows the person a progress bar above their prompt while you work. ' +
  'Call this tool at the start of any request that will take you more than three actions, with `steps` ' +
  "(2 to 8 short steps, each starting with a verb, written in the person's language) and `step: 1`. " +
  'Call it again with only `step` each time you move on to the next step. ' +
  'Send `steps` again if your plan changes along the way. The bar clears itself when you finish.'

const SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: { type: 'string' },
      minItems: 2,
      maxItems: 8,
      description: 'The whole plan, in order. Only on the first call, or when the plan changes.',
    },
    step: { type: 'integer', minimum: 1, description: 'The number of the step that starts, 1 for the first.' },
  },
  required: ['step'],
  additionalProperties: false,
}

const CONSIGNE = {
  id: `${PLUGIN}:consigne`,
  text:
    `When a request will take you more than three actions, first call ${OUTIL} with your steps, ` +
    'then call it again each time a new step starts. Never for a short answer, never from a subagent.',
  scope: 'session',
} as const

const TERMINES: AgentInfo['status'][] = ['completed', 'failed', 'killed']

// Ce que le panneau montre d'un agent: le suivi du tour, complété par la liste du moteur.
type LigneAgent = AgentSuivi & { description: string; type?: string; etat: EtatAgent }

function lignesAgents(suivis: AgentSuivi[], infos: AgentInfo[], debutTour: number): LigneAgent[] {
  const vus = new Set(suivis.map(a => a.id))
  const enAttente = infos
    .filter(i => !vus.has(i.id) && !TERMINES.includes(i.status) && i.status !== 'idle')
    .map((i): AgentSuivi => ({ id: i.id, debut: debutTour, actions: 0 }))

  return [...suivis, ...enAttente].map(a => {
    const info = infos.find(i => i.id === a.id)
    const fini = a.fin !== undefined || (info !== undefined && TERMINES.includes(info.status))
    const arrete = a.arrete || info?.status === 'failed' || info?.status === 'killed'
    return {
      ...a,
      description: info?.description || info?.name || 'Agent',
      type: info?.type,
      etat: arrete ? 'arrete' : fini ? 'fini' : 'actif',
    }
  })
}

export const register: Register = (on, options) => {
  // La langue de l'interface: l'option `language` du mod (anglais par défaut).
  const T = textes(options.language)

  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'progression', description: DESCRIPTION, inputSchema: SCHEMA, isDeferred: false })
    await $.command.register({ name: 'progression', description: T.commande })
    $.clock.every(1000, () => {
      void (async () => {
        // Tant qu'un tour ou une barre est en cours: le panneau compte le temps, la bande se redessine.
        const t = await read($, tour)
        const p = await read($, plan)
        const v = await read($, vue)
        if ((t !== null && t.fin === undefined) || (p !== null && !p.fini) || v !== null) await update($, tic, n => n + 1)
      })()
    })

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return { ...composed, sections: [...composed.sections, CONSIGNE] }
  })

  // Comme les commandes de l'app qui ouvrent un panneau: rien n'est écrit dans la conversation.
  on('command.run', { command: 'progression' }, async $ => {
    await $.ui.open({ id: PANNEAU, title: T.progression })

    return {}
  })

  // Un nouveau tour commence avec la demande de la personne; un message envoyé pendant le travail le
  // prolonge.
  on('turn.start', async ($, e, next) => {
    const t = await read($, tour)
    if (t === null || t.fin !== undefined) {
      const maintenant = await $.clock.now()
      await update($, tour, () => nouveauTour(e.text, maintenant))
    }

    return next(e)
  })

  // Chaque action de Claude ou d'un agent est comptée et fait avancer la barre d'un cran: c'est le
  // rythme réel du travail. L'outil de la barre ne compte pas.
  on('tool.call', async ($, e, next) => {
    if (e.tool !== OUTIL) {
      const maintenant = await $.clock.now()
      const t = await read($, tour)
      if (t !== null && t.fin === undefined) {
        await update($, tour, x => (x === null ? x : compterAction(x, e.agentId, maintenant)))
      }
      // Rien n'est écrit sans plan en cours: une écriture, même identique, fait tout redessiner.
      const p = await read($, plan)
      if (p !== null && !p.fini) await update($, plan, x => (x === null || x.fini ? x : avancer(x, maintenant)))
    }

    return next(e)
  })

  on('tool.call', { tool: 'mcp__barre-progression__progression' }, async ($, e) => {
    if (e.agentId !== undefined) {
      return { result: 'Ignored: the bar only follows the main conversation.' }
    }

    const maintenant = await $.clock.now()
    const avant = await read($, plan)
    const lu = lirePlan(e, avant, maintenant)
    if (typeof lu === 'string') return { deny: lu }
    if (lu === avant) return { result: `The bar is already at step ${lu.etape} of ${lu.etapes.length}.` }

    await update($, plan, () => lu)
    await update($, tour, x => (x === null ? x : noterEtape(x, lu, maintenant)))
    // La bande: la même liste d'étapes prolonge son histoire; une autre liste repart de zéro.
    await update($, vue, v =>
      v !== null && v.fin === null && v.etapes.join('\n') === lu.etapes.join('\n') && v.ev.length < HISTOIRE_MAX
        ? { ...v, ev: [...v.ev, [lu.etape, maintenant] as [number, number]] }
        : // L'heure du plan sert de graine: chaque tâche tire son propre ordre de danses.
          { etapes: lu.etapes, ev: [[lu.etape, maintenant] as [number, number]], fin: null, graine: maintenant },
    )

    return { result: `Bar updated: step ${lu.etape} of ${lu.etapes.length}.` }
  }).catch(() => ({ result: 'The bar is unavailable for this call; carry on with the work.' }))

  // La fin d'un agent note ses jetons. La fin de Claude joue la complétude de la barre et ferme le
  // tour; un arrêt ou une erreur efface la barre tout de suite. Rien au début d'un tour: un message
  // envoyé pendant que Claude travaille en ouvre un, et la barre en cours doit survivre.
  on('turn.complete', async ($, e, next) => {
    const maintenant = await $.clock.now()
    const arrete = e.reason !== 'answer'

    if (e.agentId !== undefined) {
      const id = e.agentId
      await update($, tour, x => (x === null || x.fin !== undefined ? x : finirAgent(x, id, maintenant, e.usage, arrete)))
      return next(e)
    }

    await update($, tour, x => (x === null || x.fin !== undefined ? x : finirTour(x, maintenant, arrete)))
    const actuel = await read($, plan)
    const montree = await read($, vue)
    if (arrete) {
      if (actuel !== null && !actuel.fini) await update($, plan, () => null)
      if (montree !== null) await update($, vue, () => null)
    } else {
      if (actuel !== null && !actuel.fini) await update($, plan, () => terminer(actuel, maintenant))
      if (montree !== null && montree.fin === null) {
        const finie = { ...montree, fin: maintenant }
        await update($, vue, () => finie)
        // La barre est retirée une fois effacée (le messager en route finit d'abord son vol).
        const efface = finVisuelle(vuePour(finie)) ?? maintenant
        // Une marge: l'affichage part de l'heure où il voit la dernière étape et la fin, au plus 400 ms
        // après que le moteur les a notées (barre-client.tsx).
        $.clock.after(Math.max(0, efface - maintenant) + 450, () => {
          void (async () => {
            if ((await read($, vue))?.fin === maintenant) await update($, vue, () => null)
            if ((await read($, plan))?.fini) await update($, plan, () => null)
          })()
        })
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, vue)
    const isQuiet = e.props.hasSurvey || e.props.view.agentId !== undefined

    if (isQuiet || v === null) {
      return next(e)
    }

    // Comme les bandes de l'app: le texte dans les couleurs du thème, l'étape en clair à gauche, le
    // compte en retrait à droite; l'orange est réservé à la barre.
    const total = v.etapes.length
    const enCours = etapeMontree(vuePour(v))
    const titre = v.fin !== null ? T.termine : (v.etapes[enCours - 1] ?? '')
    const compteur = T.etapeSur(v.fin !== null ? total : enCours, total)
    const alt = v.fin !== null ? T.travailTermine : `${compteur}: ${titre}`
    const ouvrir = () => $.ui.open({ id: PANNEAU, title: T.progression })
    const { Box, Button, Text } = $.ui.resolve(e)
    const ligne = (
      <Box key="ligne" flexDirection="row" gap={1} alignItems="center">
        <Box key="titre" flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">{titre}</Text>
        </Box>
        <Box key="compte" flexShrink={0}>
          <Text dimColor>{compteur}</Text>
        </Box>
        <Button key="details" label={T.details} hotkey="d" onPress={ouvrir} />
      </Box>
    )

    if (e.surface === 'terminal') {
      await read($, tic)
      const maintenant = await $.clock.now()
      return (
        <Box key="barre" flexDirection="column">
          {ligne}
          <Text color={ORANGE}>{pointsTexte(vuePour(v), maintenant, Math.max(10, e.props.bodyColumns - 1))}</Text>
        </Box>
      )
    }

    // Sur le bureau, la barre est un Client: l'app le garde tel quel entre deux réponses du moteur, et
    // il ne se redessine qu'avec ses props, c'est-à-dire quand une étape change ou que le travail finit.
    if (e.surface === 'desktop' && (await read($, enPanne)) !== (v.ev[0]?.[1] ?? null)) {
      const { Client } = $.ui.resolve(e)
      return (
        <Box key="barre" flexDirection="column" gap={1}>
          {ligne}
          <Client key="fil" module="./barre-client.tsx" props={{ vue: vuePour(v), alt }} width="100%" />
        </Box>
      )
    }

    // Ailleurs, ou si le Client a échoué: l'image directement, refaite chaque seconde.
    await read($, tic)
    const maintenant = await $.clock.now()
    const { Svg } = $.ui.resolve(e)
    return (
      <Box key="barre" flexDirection="column" gap={1}>
        {ligne}
        <Svg key="fil" source={sceneSvg(vuePour(v), maintenant)} alt={alt} width={4096} height={26} />
      </Box>
    )
  })

  // Le Client de la barre a échoué dans l'app: pour ce plan, la bande repasse à l'image dessinée par
  // le moteur, et la raison va au journal de débogage.
  on('ui.fault', async ($, e, next) => {
    if (e.module.includes('barre-client')) {
      const v = await read($, vue)
      await update($, enPanne, () => v?.ev[0]?.[1] ?? null)
      $.ui.log(`barre-progression: l'affichage de la barre a échoué (${e.phase}): ${e.reason}`, { to: 'debug' })
    }

    return next(e)
  })

  // Le panneau, dans la grammaire des panneaux de l'app: la demande et son état, la barre, quatre
  // chiffres sans cadre, les étapes avec leur icône et leur durée, puis les agents, chacun avec ses
  // quatre points. Aucune couleur écrite en dur pour le texte: tout suit le thème de la personne. Rien de
  // plus large que sa place dans une rangée: une image trop large y déborde au lieu de rapetisser.
  on('ui.render', { component: 'Pane', requestId: 'progression' }, async ($, e) => {
    await read($, tic)
    const t = await read($, tour)
    const p = await read($, plan)
    const maintenant = await $.clock.now()
    const infos: AgentInfo[] = await $.agent.list().catch(() => [])
    const contexte = await $.session
      .usage()
      .then(u => u.context.percent)
      .catch(() => undefined)

    const courant = t?.etapes.at(-1)?.etape ?? 0
    const etatEtape = (n: number): EtatEtape => {
      if (t === null) return 'a-venir'
      if ((t.fin !== undefined && !t.arrete) || n < courant) return 'faite'
      return t.fin === undefined && n === courant ? 'courante' : 'a-venir'
    }

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      if (t === null) return <Text dimColor>{T.aucuneTache}</Text>
      const agents = lignesAgents(t.agents, infos, t.debut)
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>{t.texte}</Text>
          <Text dimColor>
            {duree((t.fin ?? maintenant) - t.debut)} · {T.nActions(t.actions)}{contexte !== undefined ? ` · ${T.contexteLigne(contexte)}` : ''}
          </Text>
          {t.noms.map((nom, i) => {
            const etat = etatEtape(i + 1)
            return (
              <Text key={`e${i + 1}`} dimColor={etat !== 'courante'} bold={etat === 'courante'}>
                {etat === 'faite' ? '✓' : etat === 'courante' ? '●' : '○'} {nom}
              </Text>
            )
          })}
          {agents.map(a => (
            <Text key={a.id}>
              {a.etat === 'actif' ? '●' : a.etat === 'fini' ? '✓' : '×'} {a.description} · {T.nActions(a.actions)} ·{' '}
              {duree((a.fin ?? maintenant) - a.debut)}
            </Text>
          ))}
        </Box>
      )
    }

    const { Box, Svg, Text } = $.ui.resolve(e)

    if (t === null) {
      return (
        <Box flexDirection="column" padding={1} gap={1}>
          <Text>{T.aucuneTache}</Text>
          <Text dimColor wrap="wrap">
            {T.aucuneTacheDetail}
          </Text>
        </Box>
      )
    }

    const enCours = t.fin === undefined
    const fraction = p !== null ? positionVisible(p, Math.max(0, (maintenant - p.debut) / 1000)) : enCours ? null : 1
    const agents = lignesAgents(t.agents, infos, t.debut)
    const actifs = agents.filter(a => a.etat === 'actif').length
    const actionsAgents = agents.reduce((s, a) => s + a.actions, 0)
    // Dessinées un peu plus larges que la place, les barres sont réduites par l'app jusqu'au bord
    // droit, alignées sur le texte.
    const largeur = Math.max(200, Math.min(720, (e.props.bodyColumns ?? 50) * 9))
    const etat = enCours ? T.enCours : t.arrete ? T.arrete : T.termine

    const chiffre = (cle: string, titre: string, valeur: string) => (
      <Box key={cle} flexDirection="column" width="25%">
        <Text dimColor>{titre}</Text>
        <Text>{valeur}</Text>
      </Box>
    )
    const section = (cle: string, titre: string, detail?: string) => (
      <Box key={cle} flexDirection="row" gap={1}>
        <Box key="titre" flexGrow={1}>
          <Text dimColor>{titre}</Text>
        </Box>
        {detail !== undefined && <Text dimColor>{detail}</Text>}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box key="demande" flexDirection="column">
          <Text bold wrap="wrap">
            {t.texte}
          </Text>
          <Text dimColor>{etat}</Text>
        </Box>
        <Svg key="barre" source={barreMini(fraction, largeur, undefined, undefined, maintenant)} alt={T.avancement} />
        <Box key="chiffres" flexDirection="row">
          {chiffre('temps', T.temps, duree((t.fin ?? maintenant) - t.debut))}
          {chiffre('etape', T.etape, t.noms.length > 0 ? T.sur(t.fin !== undefined && !t.arrete ? t.noms.length : courant, t.noms.length) : '-')}
          {chiffre('actions', T.actions, String(t.actions + actionsAgents))}
          {chiffre('contexte', T.contexte, contexte !== undefined ? `${contexte}${T.langue === 'fr' ? ' ' : ''}%` : '-')}
        </Box>

        {t.noms.length > 0 && (
          <Box key="etapes" flexDirection="column" gap={1}>
            {section('titre-etapes', T.etapes)}
            {t.noms.map((nom, i) => {
              const n = i + 1
              const etatN = etatEtape(n)
              const passage = t.etapes.find(x => x.etape === n)
              const suivant = t.etapes.find(x => x.etape > n)
              const temps = passage ? duree((suivant?.debut ?? t.fin ?? maintenant) - passage.debut) : ''
              const alt = etatN === 'faite' ? T.faite : etatN === 'courante' ? T.enCours : T.aVenir
              return (
                <Box key={`e${n}`} flexDirection="row" gap={1} alignItems="center">
                  <Svg key="icone" source={icone(etatN, maintenant)} alt={alt} width={14} height={14} />
                  <Box key="nom" flexGrow={1} flexShrink={1}>
                    <Text bold={etatN === 'courante'} dimColor={etatN === 'faite'} wrap="truncate-end">
                      {nom}
                    </Text>
                  </Box>
                  <Box key="temps" flexShrink={0}>
                    <Text dimColor>{temps}</Text>
                  </Box>
                </Box>
              )
            })}
          </Box>
        )}

        {agents.length > 0 && (
          <Box key="agents" flexDirection="column" gap={1}>
            {section('titre-agents', T.agents, actifs > 0 ? T.agentsEnCours(actifs) : T.agentsTermines(agents.length))}
            {agents.map((a, rang) => {
              const details = [
                a.type,
                nomModele(a.modele),
                T.nActions(a.actions),
                a.jetons !== undefined ? T.jetons(nombre(a.jetons, T.langue)) : undefined,
                a.etat === 'arrete' ? T.agentArrete : undefined,
              ]
              return (
                <Box key={a.id} flexDirection="row" gap={1} alignItems="flex-start">
                  <Svg key="agent" source={agentSvg(a.etat, rang, maintenant)} alt={a.etat === 'actif' ? T.agentAuTravail : a.etat === 'fini' ? T.agentTermine : T.agentStoppe} width={22} height={22} />
                  <Box key="infos" flexDirection="column" flexGrow={1} flexShrink={1}>
                    <Box key="ligne" flexDirection="row" gap={1}>
                      <Box key="nom" flexGrow={1} flexShrink={1}>
                        <Text wrap="truncate-end">{a.description}</Text>
                      </Box>
                      <Box key="temps" flexShrink={0}>
                        <Text dimColor>{duree((a.fin ?? maintenant) - a.debut)}</Text>
                      </Box>
                    </Box>
                    <Text dimColor wrap="truncate-end">
                      {details.filter(Boolean).join(' · ')}
                    </Text>                  </Box>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })
}
