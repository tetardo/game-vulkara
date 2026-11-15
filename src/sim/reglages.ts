import brut from "../../config/reglages.json";

/** Réglages typés, lus depuis config/reglages.json. */
export interface Reglages {
  simulation: { ticksParSeconde: number };
  ressourcesDeDepart: Ressources;
  carte: { largeurCases: number; hauteurCases: number; tailleCase: number };
}

export interface Ressources {
  bois: number;
  nourriture: number;
}

export const reglages: Reglages = brut;
