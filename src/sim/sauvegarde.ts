import { creerMonde, type Monde } from "./monde";
import { reglages } from "./reglages";

/** À augmenter à chaque changement du format, avec une migration ci-dessous. */
export const VERSION_SAUVEGARDE = 2;

export interface FichierSauvegarde {
  version: number;
  enregistreeLe: string;
  monde: Monde;
}

type Migration = (ancien: unknown) => unknown;

/** migrations[n] transforme une sauvegarde de version n en version n + 1. */
const migrations: Record<number, Migration> = {
  // Version 1 : structure vide (aucun contenu de jeu) → on démarre le jeu d'essai.
  1: () => creerMonde(reglages),
};

export function serialiser(monde: Monde, date = new Date()): string {
  const fichier: FichierSauvegarde = {
    version: VERSION_SAUVEGARDE,
    enregistreeLe: date.toISOString(),
    monde: { ...monde, evenements: [] },
  };
  return JSON.stringify(fichier);
}

export function deserialiser(texte: string): Monde {
  const brut = JSON.parse(texte) as { version?: unknown; monde?: unknown };
  let version = typeof brut.version === "number" ? brut.version : 0;
  if (version > VERSION_SAUVEGARDE) {
    throw new Error(`Sauvegarde trop récente (version ${version}) pour ce jeu (version ${VERSION_SAUVEGARDE}).`);
  }
  let monde: unknown = brut.monde;
  while (version < VERSION_SAUVEGARDE) {
    const migrer = migrations[version];
    if (!migrer) throw new Error(`Aucune migration depuis la version ${version}.`);
    monde = migrer(monde);
    version += 1;
  }
  const resultat = monde as Monde;
  resultat.evenements = [];
  return resultat;
}
