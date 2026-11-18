import type { Cout, Ressources } from "./reglages";

/** Une position sur la carte, en cases (x vers la droite-bas, z vers la droite-haut à l'écran). */
export interface Point {
  x: number;
  z: number;
}

export const LEGUMES = ["lumirave", "croquerouge", "bulle-courge", "patatonnerre", "givrotte", "pique-chou"] as const;
export type Legume = (typeof LEGUMES)[number];

/** « debris » : anciennes parties seulement (supprimés à la migration v11). Le métal vient du « minerai ». */
export type TypeSource = "arbre" | "buisson" | "noisetier" | "debris" | "epave" | "minerai";
export type TypeBatiment =
  | "tente"
  | "potager"
  | "atelier"
  | "palissade"
  | "porte"
  | "cloche"
  | "usine"
  | "pont"
  | "grenier"
  | "lanterne"
  | "station"
  | "piege"
  | "tour"
  | "scierie"
  | "ferme"
  | "fonderie";
export type TypeMonstre = "scarabee" | "grignotin" | "sanglier";
export type Travail = "aucun" | "bois" | "cueillette" | "ferraille" | "potager" | "reparer" | "construire" | "defendre" | "attaquer" | "ramasser";

export interface Source extends Point {
  id: number;
  type: TypeSource;
  reste: number;
  variante: number;
  /** Arbre coupé : secondes depuis la coupe (souche, puis pousse, puis arbre). */
  repousse?: number;
}

export interface Rocher extends Point {
  id: number;
  taille: number;
  variante: number;
}

export interface Parcelle {
  legume: Legume | null;
  pousse: number; // 0 à 1
}

export interface Batiment extends Point {
  id: number;
  type: TypeBatiment;
  construit: boolean;
  travailFait: number; // en secondes de travail
  /** Morceau de palissade ou porte (une case chacun) : points de vie. */
  pv?: number;
  /** Potager : les 6 parcelles. */
  parcelles?: Parcelle[];
  /** Piège à grignotins : pas de simulation restants avant qu'il soit réarmé (0 = prêt). */
  recharge?: number;
  /** Niveau d'amélioration : 1 (absent = 1), 2 ou 3. */
  niveau?: number;
  /** Usine : robots qui grandissent, dans l'ordre (le prix payé pour chacun, rendu si on annule). */
  file?: Cout[];
  /** Usine : secondes de croissance du premier robot de la file. */
  croissance?: number;
}

export interface Robot extends Point {
  id: number;
  nom: string;
  travail: Travail;
  /** Après un ordre « attaquer », le travail que le robot reprend. */
  travailApres?: Travail;
  etat: "attend" | "va" | "recolte" | "rapporte" | "rentre" | "casse" | "combat";
  chemin: Point[];
  sac: { type: keyof Ressources | Legume; quantite: number } | null;
  cibleId: number | null;
  minuterie: number;
  rentrerLaNuit: boolean;
  pv: number;
  orientation: number;
}

export interface Monstre extends Point {
  id: number;
  type: TypeMonstre;
  pv: number;
  pvMax: number;
  etat: "approche" | "attaque" | "fuit" | "charge" | "etourdi" | "garde";
  recharge: number;
  /** Direction de la charge du sanglier. */
  direction: Point | null;
  minuterie: number;
  vol: { type: keyof Ressources | Legume; quantite: number } | null;
  orientation: number;
  origine: Point;
}

export interface ObjetAuSol extends Point {
  id: number;
  type: "eclat" | "coeur";
}

/** Coffre au trésor caché : Lumo pose une énigme quand Morris l'ouvre. */
export interface Coffre extends Point {
  id: number;
  /** Numéro de l'énigme dans config/enigmes.json. */
  enigme: number;
  ouvert: boolean;
  /** Après une mauvaise réponse : le coffre reste fermé jusqu'à ce pas de simulation. */
  fermeJusqua: number;
}

export type Interaction =
  | { type: "caisse" }
  | { type: "coffre"; coffreId: number }
  | { type: "construire"; batimentId: number }
  | { type: "attaquer"; monstreId: number }
  | { type: "ramasser"; objetId: number };

export interface Morris extends Point {
  pv: number; // en demi-cœurs
  pvMax: number;
  faim: number; // 100 = rassasié, 0 = affamé
  arme: "baton" | "epee";
  chemin: Point[];
  interaction: Interaction | null;
  recharge: number;
  rechargeTourbillon: number;
  bonusVitesse: number; // secondes restantes (patatonnerre)
  animation: "repos" | "marche" | "attaque" | "tourbillon" | "construit" | "touche" | "ramasse";
  animationTicks: number;
  orientation: number;
  aPrevenuFaim: boolean;
}

export type Evenement =
  | { type: "lumo"; texte: string; important?: boolean }
  | { type: "fumee"; x: number; z: number; grande?: boolean }
  /** surMonstre : c'est un monstre qui est touché (petite étoile blanche). */
  | { type: "coup"; x: number; z: number; surMonstre?: boolean }
  /** La tour de guet tire : de la tour (x, z) vers le monstre (versX, versZ). */
  | { type: "tir"; x: number; z: number; versX: number; versZ: number }
  | { type: "vaincu"; x: number; z: number }
  | { type: "niveau"; x: number; z: number }
  | { type: "coeur"; x: number; z: number }
  | { type: "cloche" }
  | { type: "construit"; batiment: TypeBatiment; x?: number; z?: number }
  | { type: "robot"; nom: string }
  | { type: "nuit" }
  | { type: "jour"; jour: number }
  | { type: "defaite" }
  | { type: "victoire" }
  | { type: "ramasse"; quoi: string }
  /** Morris est devant un coffre : l'interface montre l'énigme. */
  | { type: "enigme"; coffreId: number }
  | { type: "tresor"; x: number; z: number }
  | { type: "depot"; x: number; z: number; quoi: keyof Ressources | Legume; quantite: number };

export interface Statistiques {
  monstresVaincus: number;
  legumesRecoltes: number;
  joursSurvecus: number;
}
