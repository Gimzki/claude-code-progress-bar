// `depuis`: où la barre se trouvait vraiment à l'écran au dernier mouvement, de 0 à 1.
// `debut`: l'heure (ms) du dernier mouvement; chaque dessin reprend son animation à partir de là.
// `actions`: les actions de Claude et de ses agents depuis le début de l'étape; chacune est un cran.
// `fini`: Claude a terminé; la barre se remplit jusqu'au bout puis s'efface.
// `etapeDepuis`: l'heure (ms) où l'étape en cours a commencé; le passage d'étape se joue à partir de là.
export type Plan = { etapes: string[]; etape: number; depuis: number; debut: number; etapeDepuis?: number; actions?: number; fini?: boolean }

// Un agent suivi pendant le tour: son heure de départ et de fin, ses actions, ses jetons à la fin.
export type AgentSuivi = {
  id: string
  debut: number
  fin?: number
  actions: number
  jetons?: number
  modele?: string
  arrete?: boolean
}

// Le tour en cours: la demande de la personne, l'heure, les actions de Claude, le passage de chaque étape
// et les agents lancés. Gardé après la fin pour que le panneau montre le bilan.
export type Tour = {
  texte: string
  noms: string[]
  debut: number
  fin?: number
  arrete?: boolean
  actions: number
  etapes: { etape: number; debut: number }[]
  agents: AgentSuivi[]
}

// Ce que la bande montre: les étapes, chaque étape annoncée avec son heure (ms), l'heure de la fin.
// Écrit seulement quand une étape change ou que le travail finit: la bande ne bouge pas entre deux.
export type VueBande = { etapes: string[]; ev: [number, number][]; fin: number | null; graine?: number }

declare module 'claude-code' {
  interface PluginState {
    'barre-progression': { plan: Plan | null; tour: Tour | null; tic: number; vue: VueBande | null; enPanne: number | null }
  }
}
