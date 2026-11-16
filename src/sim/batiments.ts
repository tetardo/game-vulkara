import { LIEUX, lieuPont, segmentPalissade } from "./carte";
import { EMPRISE, estLibre } from "./chemin";
import { annoncer, batimentConstruit, lumo, type Monde } from "./monde";
import { reglages, type Cout, type Ressources } from "./reglages";
import type { Batiment, Legume, Point, TypeBatiment } from "./types";

const T = reglages.simulation.ticksParSeconde;

export type Constructible = Exclude<TypeBatiment, "tente">;
export const CONSTRUCTIBLES: Constructible[] = ["potager", "atelier", "palissade", "cloche", "usine", "pont"];

export const NOMS_BATIMENTS: Record<TypeBatiment, string> = {
  tente: "la tente",
  potager: "le potager",
  atelier: "l'atelier",
  palissade: "la palissade",
  cloche: "la cloche d'alarme",
  usine: "l'usine à robots",
  pont: "le pont",
};

export function lieuBatiment(type: Constructible): { x: number; z: number } {
  if (type === "pont") return lieuPont();
  if (type === "palissade") return LIEUX.camp;
  return LIEUX[type];
}

/** Bâtiments que le joueur pose où il veut (la palissade entoure le camp, le pont va sur la rivière). */
export function estPlacable(type: Constructible): boolean {
  return type === "potager" || type === "atelier" || type === "cloche" || type === "usine";
}

/** Aligne un point de la souris sur la grille du bâtiment. */
export function caseDEmplacement(x: number, z: number): Point {
  return { x: Math.round(x), z: Math.round(z) };
}

/** Cases occupées par un bâtiment posé en (x, z). */
export function casesOccupees(type: TypeBatiment, x: number, z: number): Point[] {
  const e = EMPRISE[type] ?? 0;
  const cases: Point[] = [];
  for (let dz = -e; dz <= e; dz += 1) for (let dx = -e; dx <= e; dx += 1) cases.push({ x: Math.floor(x + dx), z: Math.floor(z + dz) });
  return cases;
}

/** Pourquoi on ne peut pas poser ce bâtiment ici, ou null si c'est possible. */
export function emplacementImpossible(monde: Monde, type: Constructible, lieu: Point): string | null {
  const { largeur } = monde.carte;
  const cases = casesOccupees(type, lieu.x, lieu.z);
  if (cases.some((c) => monde.brouillard[c.z * largeur + c.x] !== 1)) return "Il faut d'abord découvrir cet endroit.";
  if (cases.some((c) => segmentPalissade(c.x + 0.5, c.z + 0.5, 1.2) !== null)) return "Trop près de la palissade.";
  if (cases.some((c) => !estLibre(monde, c.x + 0.5, c.z + 0.5))) return "Pas assez de place ici.";
  if (cases.some((c) => Math.floor(monde.morris.x) === c.x && Math.floor(monde.morris.z) === c.z)) return "Morris est sur le chemin.";
  return null;
}

export function peutPayer(monde: Monde, cout: Cout): boolean {
  return (Object.keys(cout) as Array<keyof Ressources>).every((k) => monde.ressources[k] >= (cout[k] ?? 0));
}

export function payer(monde: Monde, cout: Cout): void {
  for (const k of Object.keys(cout) as Array<keyof Ressources>) monde.ressources[k] -= cout[k] ?? 0;
}

/** Distance à laquelle on peut travailler sur un bâtiment. */
export function distanceAction(b: Batiment): number {
  if (b.type === "palissade") return reglages.camp.rayonPalissade + 1.5;
  if (b.type === "pont") return 4.5;
  if (b.type === "cloche") return 1.8;
  return 3;
}

/** Ce qui manque pour construire, ou null si c'est possible. */
export function raisonImpossible(monde: Monde, type: Constructible): string | null {
  if (monde.batiments.some((b) => b.type === type)) return "Déjà construit.";
  if (type !== "potager" && !batimentConstruit(monde, "potager")) return "Lumo conseille de commencer par le potager.";
  if (!peutPayer(monde, reglages.batiments[type].cout)) return "Il manque des ressources.";
  return null;
}

/** Ajoute du travail sur un chantier. Le bâtiment est fini quand tout le travail est fait. */
export function travailler(monde: Monde, b: Batiment, secondes: number): void {
  if (b.construit || b.type === "tente") return;
  b.travailFait += secondes;
  if (b.travailFait >= reglages.batiments[b.type].travail) terminer(monde, b);
}

function terminer(monde: Monde, b: Batiment): void {
  b.construit = true;
  monde.versionObstacles += 1;
  annoncer(monde, { type: "construit", batiment: b.type });
  annoncer(monde, { type: "fumee", x: b.x, z: b.z, grande: true });
  switch (b.type) {
    case "potager":
      lumo(monde, "Le potager est prêt ! Clique dessus pour planter des légumes de Vulkara.", true);
      break;
    case "atelier":
      lumo(monde, "L'atelier est prêt. Clique dessus pour fabriquer l'épée avec le métal du vaisseau.", true);
      break;
    case "palissade":
      lumo(monde, "La palissade protège le camp. La porte se ferme toute seule la nuit.", true);
      break;
    case "cloche":
      lumo(monde, "La cloche sonnera si le camp est attaqué pendant que tu es loin.", true);
      break;
    case "usine":
      monde.grainesRestantes += reglages.robots.grainesDansEpave;
      lumo(
        monde,
        `L'usine marche ! J'ai trouvé ${reglages.robots.grainesDansEpave} graines-cubes dans l'épave. Clique sur l'usine pour faire grandir un robot.`,
        true,
      );
      break;
    case "pont":
      monde.versionObstacles += 1;
      monde.finDans = 9;
      lumo(monde, "Le pont est fini ! Attends… ma radio capte à nouveau le signal mystérieux. Il vient de l'autre rive !", true);
      break;
  }
}

/** Pose un chantier (les ressources sont payées tout de suite). */
export function poserChantier(monde: Monde, type: Constructible, choisi?: Point): Batiment | null {
  if (raisonImpossible(monde, type)) return null;
  const lieu = choisi && estPlacable(type) ? caseDEmplacement(choisi.x, choisi.z) : lieuBatiment(type);
  if (choisi && estPlacable(type) && emplacementImpossible(monde, type, lieu)) return null;
  payer(monde, reglages.batiments[type].cout);
  const b: Batiment = { id: monde.prochainId++, type, x: lieu.x, z: lieu.z, construit: false, travailFait: 0 };
  if (type === "palissade") b.segments = new Array<number>(reglages.camp.segmentsPalissade).fill(reglages.batiments.palissade.pvSegment);
  if (type === "potager") b.parcelles = Array.from({ length: 6 }, () => ({ legume: null, pousse: 0 }));
  monde.batiments.push(b);
  monde.versionObstacles += 1;
  return b;
}

export function avancerBatiments(monde: Monde): void {
  const potager = batimentConstruit(monde, "potager");
  if (potager?.parcelles) {
    for (const p of potager.parcelles) {
      if (!p.legume || p.pousse >= 1) continue;
      if (p.legume === "givrotte" && !monde.temps.nuit) continue; // pousse seulement la nuit, au frais
      p.pousse = Math.min(1, p.pousse + 1 / (reglages.legumes[p.legume].pousse * T));
    }
  }
}

export function potagerContient(monde: Monde, legume: Legume): boolean {
  const p = batimentConstruit(monde, "potager");
  return !!p?.parcelles?.some((x) => x.legume === legume);
}
