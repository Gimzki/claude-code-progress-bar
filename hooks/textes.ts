// Les textes que la personne lit, en anglais ou en français selon l'option `language` du mod. Ce que
// lit le modèle (la description de l'outil, la consigne, les réponses de l'outil) reste en anglais:
// il écrit lui-même les étapes dans la langue de la personne.
export type Langue = 'en' | 'fr'

export type Textes = {
  langue: Langue
  termine: string
  travailTermine: string
  etapeSur: (n: number, total: number) => string
  sur: (n: number, total: number) => string
  details: string
  progression: string
  commande: string
  aucuneTache: string
  aucuneTacheDetail: string
  enCours: string
  arrete: string
  avancement: string
  temps: string
  etape: string
  actions: string
  contexte: string
  etapes: string
  agents: string
  faite: string
  aVenir: string
  agentsEnCours: (n: number) => string
  agentsTermines: (n: number) => string
  nActions: (n: number) => string
  jetons: (n: string) => string
  agentArrete: string
  agentAuTravail: string
  agentTermine: string
  agentStoppe: string
  contexteLigne: (p: number) => string
}

const EN: Textes = {
  langue: 'en',
  termine: 'Done',
  travailTermine: 'Work done',
  etapeSur: (n, total) => `Step ${n} of ${total}`,
  sur: (n, total) => `${n} of ${total}`,
  details: 'Details',
  progression: 'Progress',
  commande: 'Show the progress of the current task',
  aucuneTache: 'No task in progress',
  aucuneTacheDetail: 'Progress shows here as soon as Claude announces the steps of a request.',
  enCours: 'In progress',
  arrete: 'Stopped',
  avancement: 'Task progress',
  temps: 'Time',
  etape: 'Step',
  actions: 'Actions',
  contexte: 'Context',
  etapes: 'Steps',
  agents: 'Agents',
  faite: 'Done',
  aVenir: 'Up next',
  agentsEnCours: n => `${n} running`,
  agentsTermines: n => `${n} done`,
  nActions: n => `${n} action${n > 1 ? 's' : ''}`,
  jetons: n => `${n} tokens`,
  agentArrete: 'stopped',
  agentAuTravail: 'Agent at work',
  agentTermine: 'Agent done',
  agentStoppe: 'Agent stopped',
  contexteLigne: p => `context ${p}%`,
}

const FR: Textes = {
  langue: 'fr',
  termine: 'Terminé',
  travailTermine: 'Travail terminé',
  etapeSur: (n, total) => `Étape ${n} sur ${total}`,
  sur: (n, total) => `${n} sur ${total}`,
  details: 'Détails',
  progression: 'Progression',
  commande: 'Afficher la progression de la tâche en cours',
  aucuneTache: 'Aucune tâche en cours',
  aucuneTacheDetail: "La progression s'affiche ici dès que Claude annonce les étapes d'une demande.",
  enCours: 'En cours',
  arrete: 'Arrêté',
  avancement: 'Avancement de la tâche',
  temps: 'Temps',
  etape: 'Étape',
  actions: 'Actions',
  contexte: 'Contexte',
  etapes: 'Étapes',
  agents: 'Agents',
  faite: 'Faite',
  aVenir: 'À venir',
  agentsEnCours: n => `${n} en cours`,
  agentsTermines: n => `${n} terminé${n > 1 ? 's' : ''}`,
  nActions: n => `${n} action${n > 1 ? 's' : ''}`,
  jetons: n => `${n} jetons`,
  agentArrete: 'arrêté',
  agentAuTravail: 'Agent au travail',
  agentTermine: 'Agent terminé',
  agentStoppe: 'Agent arrêté',
  contexteLigne: p => `contexte ${p} %`,
}

export const textes = (langue: unknown): Textes => (langue === 'fr' ? FR : EN)
