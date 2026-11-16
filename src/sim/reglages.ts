import brut from "../../config/reglages.json";

/** Réglages typés, lus depuis config/reglages.json (le type suit le fichier). */
export type Reglages = typeof brut;

export interface Ressources {
  bois: number;
  nourriture: number;
  metal: number;
  eclats: number;
}

export type Cout = Partial<Ressources>;

export const reglages: Reglages = brut;
