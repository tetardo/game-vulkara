import { genererDecor, LIEUX } from "./carte";
import type { Reglages, Ressources } from "./reglages";
import type {
  Batiment,
  Evenement,
  Legume,
  Monstre,
  Morris,
  ObjetAuSol,
  Robot,
  Rocher,
  Source,
  Statistiques,
} from "./types";
import { LEGUMES } from "./types";

export type EtapeTutoriel =
  | "marcher"
  | "caisse"
  | "travail"
  | "potager"
  | "planter"
  | "atelier"
  | "epee"
  | "palissade"
  | "pont"
  | "fini";

/**
 * État complet de la partie. La simulation ne dépend pas de Babylon.js :
 * elle se teste seule, et la sauvegarde consiste à enregistrer cet objet.
 */
export interface Monde {
  tick: number;
  hasard: number;
  prochainId: number;
  carte: { largeur: number; hauteur: number };
  /** Moment de la journée en secondes depuis l'aube, et numéro du jour (1 = premier). */
  temps: { seconde: number; jour: number; nuit: boolean };
  ressources: Ressources;
  legumes: Record<Legume, number>;
  morris: Morris;
  robots: Robot[];
  grainesRestantes: number;
  sources: Source[];
  rochers: Rocher[];
  batiments: Batiment[];
  monstres: Monstre[];
  objets: ObjetAuSol[];
  /** Cases découvertes (0 cachée, 1 vue), ligne par ligne : brouillard[z * largeur + x]. */
  brouillard: number[];
  versionBrouillard: number;
  caisseOuverte: boolean;
  tutoriel: EtapeTutoriel;
  stats: Statistiques;
  fin: "en-cours" | "defaite" | "victoire";
  /** Compte à rebours avant l'écran de fin après le pont (secondes). */
  finDans: number;
  /** Changé à chaque fois qu'un obstacle apparaît ou disparaît (pour recalculer les chemins). */
  versionObstacles: number;
  derniereAlerte: number;
  vuSanglier: boolean;
  sanglierCogne: boolean;
  /** Événements de ce pas, lus par l'affichage et l'interface puis vidés. Non sauvegardés. */
  evenements: Evenement[];
}

export function creerMonde(r: Reglages): Monde {
  let id = 1;
  const prochainId = () => id++;
  const decor = genererDecor(r, prochainId);
  const batiments: Batiment[] = [
    { id: prochainId(), type: "tente", x: LIEUX.tente.x, z: LIEUX.tente.z, construit: true, travailFait: 0 },
  ];
  const sources: Source[] = [
    ...decor.sources,
    { id: prochainId(), type: "epave", x: LIEUX.epave.x, z: LIEUX.epave.z, reste: r.sources.epave, variante: 0 },
  ];
  const legumes = Object.fromEntries(LEGUMES.map((l) => [l, 0])) as Record<Legume, number>;
  const monde: Monde = {
    tick: 0,
    hasard: r.carte.graine * 7919,
    prochainId: 0,
    carte: { largeur: r.carte.largeurCases, hauteur: r.carte.hauteurCases },
    temps: { seconde: r.journee.debutEnSecondes, jour: 1, nuit: false },
    ressources: { ...r.ressourcesDeDepart },
    legumes,
    morris: {
      x: LIEUX.depart.x,
      z: LIEUX.depart.z,
      pv: r.morris.coeurs * 2,
      pvMax: r.morris.coeurs * 2,
      faim: 100,
      arme: "baton",
      chemin: [],
      interaction: null,
      recharge: 0,
      rechargeTourbillon: 0,
      bonusVitesse: 0,
      animation: "repos",
      animationTicks: 0,
      orientation: 0,
      aPrevenuFaim: false,
    },
    robots: [],
    grainesRestantes: 0,
    sources,
    rochers: decor.rochers,
    batiments,
    monstres: [],
    objets: [],
    brouillard: new Array<number>(r.carte.largeurCases * r.carte.hauteurCases).fill(0),
    versionBrouillard: 0,
    caisseOuverte: false,
    tutoriel: "marcher",
    stats: { monstresVaincus: 0, legumesRecoltes: 0, joursSurvecus: 0 },
    fin: "en-cours",
    finDans: 0,
    versionObstacles: 0,
    derniereAlerte: -100000,
    vuSanglier: false,
    sanglierCogne: false,
    evenements: [],
  };
  monde.prochainId = id;
  // Le sanglier garde le cœur caché.
  monde.monstres.push({
    id: monde.prochainId++,
    type: "sanglier",
    x: LIEUX.sanglier.x,
    z: LIEUX.sanglier.z,
    pv: r.monstres.sanglier.pv,
    pvMax: r.monstres.sanglier.pv,
    etat: "garde",
    recharge: 0,
    direction: null,
    minuterie: 0,
    vol: null,
    orientation: 0,
    origine: { x: LIEUX.sanglier.x, z: LIEUX.sanglier.z },
  });
  monde.objets.push({ id: monde.prochainId++, type: "coeur", x: LIEUX.coeurCache.x, z: LIEUX.coeurCache.z });
  return monde;
}

export function nouvelId(monde: Monde): number {
  monde.prochainId += 1;
  return monde.prochainId - 1;
}

/** Nombre au hasard entre 0 et 1, reproductible (l'état est sauvegardé avec la partie). */
export function hasard(monde: Monde): number {
  monde.hasard = (monde.hasard + 0x6d2b79f5) | 0;
  let t = monde.hasard;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function annoncer(monde: Monde, e: Evenement): void {
  monde.evenements.push(e);
}

export function lumo(monde: Monde, texte: string, important = false): void {
  monde.evenements.push({ type: "lumo", texte, important });
}

export function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function batiment(monde: Monde, type: Batiment["type"]): Batiment | undefined {
  return monde.batiments.find((b) => b.type === type);
}

export function batimentConstruit(monde: Monde, type: Batiment["type"]): Batiment | undefined {
  return monde.batiments.find((b) => b.type === type && b.construit);
}
