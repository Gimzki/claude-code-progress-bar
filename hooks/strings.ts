// The text the person reads, in English or French according to the mod's `language` option. What the
// model reads (the tool description, the instruction, the tool's replies) stays in English: the model
// writes the steps itself, in the person's language.
export type Language = 'en' | 'fr'

export type Strings = {
  language: Language
  done: string
  workDone: string
  stepOf: (n: number, total: number) => string
  outOf: (n: number, total: number) => string
  details: string
  progress: string
  command: string
  noTask: string
  noTaskDetail: string
  inProgress: string
  stopped: string
  taskProgress: string
  time: string
  step: string
  actions: string
  context: string
  steps: string
  agents: string
  stepDone: string
  upNext: string
  agentsRunning: (n: number) => string
  agentsDone: (n: number) => string
  nActions: (n: number) => string
  tokens: (n: string) => string
  agentStoppedNote: string
  agentAtWork: string
  agentDone: string
  agentStopped: string
  contextLine: (p: number) => string
}

const EN: Strings = {
  language: 'en',
  done: 'Done',
  workDone: 'Work done',
  stepOf: (n, total) => `Step ${n} of ${total}`,
  outOf: (n, total) => `${n} of ${total}`,
  details: 'Details',
  progress: 'Progress',
  command: 'Show the progress of the current task',
  noTask: 'No task in progress',
  noTaskDetail: 'Progress shows here as soon as Claude announces the steps of a request.',
  inProgress: 'In progress',
  stopped: 'Stopped',
  taskProgress: 'Task progress',
  time: 'Time',
  step: 'Step',
  actions: 'Actions',
  context: 'Context',
  steps: 'Steps',
  agents: 'Agents',
  stepDone: 'Done',
  upNext: 'Up next',
  agentsRunning: n => `${n} running`,
  agentsDone: n => `${n} done`,
  nActions: n => `${n} action${n > 1 ? 's' : ''}`,
  tokens: n => `${n} tokens`,
  agentStoppedNote: 'stopped',
  agentAtWork: 'Agent at work',
  agentDone: 'Agent done',
  agentStopped: 'Agent stopped',
  contextLine: p => `context ${p}%`,
}

const FR: Strings = {
  language: 'fr',
  done: 'Terminé',
  workDone: 'Travail terminé',
  stepOf: (n, total) => `Étape ${n} sur ${total}`,
  outOf: (n, total) => `${n} sur ${total}`,
  details: 'Détails',
  progress: 'Progression',
  command: 'Afficher la progression de la tâche en cours',
  noTask: 'Aucune tâche en cours',
  noTaskDetail: "La progression s'affiche ici dès que Claude annonce les étapes d'une demande.",
  inProgress: 'En cours',
  stopped: 'Arrêté',
  taskProgress: 'Avancement de la tâche',
  time: 'Temps',
  step: 'Étape',
  actions: 'Actions',
  context: 'Contexte',
  steps: 'Étapes',
  agents: 'Agents',
  stepDone: 'Faite',
  upNext: 'À venir',
  agentsRunning: n => `${n} en cours`,
  agentsDone: n => `${n} terminé${n > 1 ? 's' : ''}`,
  nActions: n => `${n} action${n > 1 ? 's' : ''}`,
  tokens: n => `${n} jetons`,
  agentStoppedNote: 'arrêté',
  agentAtWork: 'Agent au travail',
  agentDone: 'Agent terminé',
  agentStopped: 'Agent arrêté',
  contextLine: p => `contexte ${p} %`,
}

export const strings = (language: unknown): Strings => (language === 'fr' ? FR : EN)
