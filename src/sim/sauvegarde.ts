import { creerMonde, type Monde } from "./monde";
import { reglages } from "./reglages";
import { genererDecor, segmentPalissade } from "./carte";
import { placerCoffres } from "./coffres";

/** À augmenter à chaque changement du format, avec une migration ci-dessous. */
export const VERSION_SAUVEGARDE = 13;

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
  // Version 7 → 8 : nouveau travail de robot « ramasser » (un éclat). Absent des anciennes parties.
  7: (ancien) => ancien,
  // Version 8 → 9 : file d'attente de l'usine (`file`, `croissance`, facultatifs). Rien à convertir.
  8: (ancien) => ancien,
  // Version 9 → 10 : nouveaux bâtiments, la tour de guet (sa `recharge` de tir) et la scierie. Une partie v9 n'en a pas.
  9: (ancien) => ancien,
  // Version 10 → 11 : la carte devient 3 fois plus grande (le plan d'avant au centre), le métal vient
  // des rochers à minerai (plus de débris, l'épave n'est plus qu'un décor), dépôts ferme et fonderie.
  10: (ancien) => agrandirCarte(ancien),
  // Version 11 → 12 : coffres au trésor avec énigmes, cachés dans le pays pas encore découvert.
  11: (ancien) => {
    const monde = ancien as Monde;
    monde.coffres = [];
    placerCoffres(monde);
    return monde;
  },
  // Version 12 → 13 : le premier niveau grandit encore (270 × 270, 9 fois la surface de départ) ; plus
  // de rochers à minerai et de coffres dans le nouveau pays.
  12: (ancien) => {
    const monde = (ancien as { carte: { largeur: number } }).carte.largeur < reglages.carte.largeurCases ? (agrandirCarte(ancien) as Monde) : (ancien as Monde);
    placerCoffres(monde);
    return monde;
  },
};

type Pos = { x: number; z: number };
type MondeV10 = {
  carte: { largeur: number; hauteur: number };
  prochainId: number;
  brouillard: number[];
  versionBrouillard: number;
  versionObstacles: number;
  morris: Pos & { chemin: Pos[] };
  robots: Array<Pos & { chemin: Pos[]; cibleId: number | null }>;
  monstres: Array<Pos & { origine: Pos; chemin?: Pos[] }>;
  sources: Array<Pos & { id: number; type: string; reste: number }>;
  rochers: Array<Pos & { id: number }>;
  batiments: Array<Pos & { id: number }>;
  objets: Array<Pos & { id: number }>;
  /** Coffres (à partir de la v12). */
  coffres?: Array<Pos & { id: number }>;
};

/**
 * Agrandit une partie de la carte 90 × 90 : tout est décalé pour que l'ancien plan soit au centre, le
 * brouillard s'étend (le nouveau pays est caché) et le nouveau pays reçoit son décor. Les débris
 * disparaissent ; des rochers à minerai apparaissent (aussi dans l'ancien plan, sur des cases libres).
 */
function agrandirCarte(ancien: unknown): unknown {
  const m = ancien as MondeV10;
  const L = reglages.carte.largeurCases;
  const H = reglages.carte.hauteurCases;
  const ancL = m.carte.largeur;
  const ancH = m.carte.hauteur;
  const dx = (L - ancL) / 2;
  const dz = (H - ancH) / 2;
  const decaler = (p: Pos) => {
    p.x += dx;
    p.z += dz;
  };
  decaler(m.morris);
  m.morris.chemin = [];
  for (const r of m.robots) {
    decaler(r);
    r.chemin = [];
  }
  for (const mo of m.monstres) {
    decaler(mo);
    decaler(mo.origine);
    if (mo.chemin) mo.chemin = [];
  }
  for (const liste of [m.sources, m.rochers, m.batiments, m.objets, m.coffres ?? []]) for (const e of liste) decaler(e);

  // Brouillard : l'ancien plan garde ce qu'on avait découvert, le reste est caché.
  const brouillard = new Array<number>(L * H).fill(0);
  for (let z = 0; z < ancH; z += 1) for (let x = 0; x < ancL; x += 1) brouillard[(z + dz) * L + (x + dx)] = m.brouillard[z * ancL + x] ?? 0;
  m.brouillard = brouillard;
  m.carte = { largeur: L, hauteur: H };

  // Plus de débris ; l'épave redevient entière (simple décor).
  const debris = new Set(m.sources.filter((s) => s.type === "debris").map((s) => s.id));
  m.sources = m.sources.filter((s) => !debris.has(s.id));
  for (const s of m.sources) if (s.type === "epave") s.reste = reglages.sources.epave;
  for (const r of m.robots) if (r.cibleId !== null && debris.has(r.cibleId)) r.cibleId = null;

  // Le nouveau décor : tout ce qui tombe hors de l'ancien plan, et les rochers à minerai sur des cases libres.
  const neuf = genererDecor(reglages, () => m.prochainId++);
  const dansAncien = (p: Pos) => p.x >= dx && p.z >= dz && p.x < dx + ancL && p.z < dz + ancH;
  const pris = [...m.sources, ...m.rochers, ...m.batiments, ...m.objets, ...(m.coffres ?? [])];
  const libre = (p: Pos) => pris.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= 2.5);
  for (const s of neuf.sources) {
    if (!dansAncien(s) || (s.type === "minerai" && libre(s))) m.sources.push(s);
  }
  for (const r of neuf.rochers) if (!dansAncien(r)) m.rochers.push(r);
  m.versionBrouillard += 1;
  m.versionObstacles += 1;
  return m;
}

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
