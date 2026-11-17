import { creerMonde, type Monde } from "./monde";
import { reglages } from "./reglages";
import { segmentPalissade } from "./carte";

/** À augmenter à chaque changement du format, avec une migration ci-dessous. */
export const VERSION_SAUVEGARDE = 7;

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
  // Version 2 → 3 : la palissade en anneau (une liste `segments`) devient des morceaux d'une case
  // chacun, que le joueur trace où il veut ; le morceau 0 de l'anneau devient une porte.
  2: (ancien) => {
    const monde = ancien as { batiments: Array<Record<string, unknown>>; prochainId: number; carte: { largeur: number; hauteur: number } };
    const vieille = monde.batiments.find((b) => b.type === "palissade" && Array.isArray(b.segments));
    monde.batiments = monde.batiments.filter((b) => b !== vieille);
    if (!vieille) return monde;
    const segments = vieille.segments as number[];
    const construit = vieille.construit === true;
    for (let z = 0; z < monde.carte.hauteur; z += 1) {
      for (let x = 0; x < monde.carte.largeur; x += 1) {
        const i = segmentPalissade(x + 0.5, z + 0.5, 1);
        if (i === null) continue;
        const type = i === 0 ? "porte" : "palissade";
        monde.batiments.push({
          id: monde.prochainId++,
          type,
          x: x + 0.5,
          z: z + 0.5,
          construit,
          travailFait: construit ? reglages.batiments[type].travail : 0,
          pv: Math.min(reglages.batiments[type].pvSegment, segments[i] ?? reglages.batiments[type].pvSegment),
        });
      }
    }
    return monde;
  },
  // Version 3 → 4 : les robots peuvent attaquer (travaux « defendre » et « attaquer », champ
  // facultatif `travailApres`). Rien à transformer : les anciennes sauvegardes restent valables.
  3: (ancien) => ancien,
  // Version 4 → 5 : nouveaux bâtiments (grenier, lanterne, station, piège) et `recharge` des pièges.
  // Rien à convertir : une sauvegarde v4 n'en contient pas.
  4: (ancien) => ancien,
  // Version 5 → 6 : les bâtiments ont un niveau (1 à 3). Absent = niveau 1 : rien à convertir.
  5: (ancien) => ancien,
  // Version 6 → 7 : les arbres coupés repoussent (champ facultatif `repousse` des sources).
  // Absent = coupé à l'instant : les souches d'une vieille partie repousseront plus tard.
  6: (ancien) => ancien,
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
