import { LIEUX, lieuPont } from "./carte";
import { EMPRISE, estLibre } from "./chemin";
import { annoncer, batimentConstruit, lumo, type Monde } from "./monde";
import { reglages, type Cout, type Ressources } from "./reglages";
import type { Batiment, Legume, Point, TypeBatiment } from "./types";

const T = reglages.simulation.ticksParSeconde;

export type Constructible = Exclude<TypeBatiment, "tente">;
export const CONSTRUCTIBLES: Constructible[] = [
  "potager",
  "grenier",
  "scierie",
  "atelier",
  "usine",
  "station",
  "palissade",
  "porte",
  "cloche",
  "lanterne",
  "piege",
  "tour",
  "pont",
];

/** Morceaux de palissade et portes : on en construit autant qu'on veut, une case chacun. */
export function estMorceauDeMur(type: TypeBatiment): type is "palissade" | "porte" {
  return type === "palissade" || type === "porte";
}

export const NOMS_BATIMENTS: Record<TypeBatiment, string> = {
  tente: "la tente",
  potager: "le potager",
  atelier: "l'atelier",
  palissade: "la palissade",
  porte: "la porte",
  cloche: "la cloche d'alarme",
  usine: "l'usine à robots",
  pont: "le pont",
  grenier: "le grenier",
  lanterne: "la lanterne de cristal",
  station: "la station de recharge",
  piege: "le piège à grignotins",
  tour: "la tour de guet",
  scierie: "la scierie",
};

export function lieuBatiment(type: Constructible): { x: number; z: number } {
  if (type === "pont") return lieuPont();
  if (type === "palissade" || type === "porte") return LIEUX.camp;
  return LIEUX[type];
}

/** Bâtiments que le joueur pose où il veut (la palissade entoure le camp, le pont va sur la rivière). */
export function estPlacable(type: Constructible): boolean {
  return type !== "palissade" && type !== "pont";
}

/** Le morceau de palissade ou la porte sur cette case, s'il y en a un. */
export function murSurCase(monde: Monde, cx: number, cz: number): Batiment | undefined {
  return monde.batiments.find((b) => estMorceauDeMur(b.type) && Math.floor(b.x) === cx && Math.floor(b.z) === cz);
}

/** Case du sol sous un point (centre de la case). */
export function caseSous(p: Point): Point {
  return { x: Math.floor(p.x) + 0.5, z: Math.floor(p.z) + 0.5 };
}

/**
 * Cases d'un mur tracé de `de` à `a`, sans trou en diagonale (les monstres ne
 * passent pas entre deux coins). Chaque case dit si on peut y construire.
 */
export function casesDuMur(monde: Monde, de: Point, a: Point): Array<Point & { valide: boolean; existe: boolean }> {
  let x = Math.floor(de.x);
  let z = Math.floor(de.z);
  const x1 = Math.floor(a.x);
  const z1 = Math.floor(a.z);
  const dx = Math.abs(x1 - x);
  const dz = Math.abs(z1 - z);
  const sx = x1 > x ? 1 : -1;
  const sz = z1 > z ? 1 : -1;
  const cases: Point[] = [{ x, z }];
  let err = dx - dz;
  // Bresenham « sans diagonale » : on avance d'une seule direction à la fois.
  for (let n = 0; n < dx + dz; n += 1) {
    if (err > 0 || (err === 0 && dx >= dz)) {
      x += sx;
      err -= 2 * dz;
    } else {
      z += sz;
      err += 2 * dx;
    }
    cases.push({ x, z });
  }
  return cases.map((c) => {
    const existe = murSurCase(monde, c.x, c.z) !== undefined;
    return { x: c.x + 0.5, z: c.z + 0.5, existe, valide: existe || caseDeMurImpossible(monde, c.x, c.z) === null };
  });
}

/** Pourquoi on ne peut pas mettre un morceau de mur sur cette case. */
export function caseDeMurImpossible(monde: Monde, cx: number, cz: number): string | null {
  if (monde.brouillard[cz * monde.carte.largeur + cx] !== 1) return "Il faut d'abord découvrir cet endroit.";
  if (murSurCase(monde, cx, cz)) return "Il y a déjà un mur ici.";
  if (!estLibre(monde, cx + 0.5, cz + 0.5)) return "Pas assez de place ici.";
  if (Math.floor(monde.morris.x) === cx && Math.floor(monde.morris.z) === cz) return "Morris est sur le chemin.";
  return null;
}

/** Aligne un point de la souris sur la grille du bâtiment. */
export function caseDEmplacement(x: number, z: number, type?: TypeBatiment): Point {
  if (type && estMorceauDeMur(type)) return caseSous({ x, z });
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
  if (type === "porte") {
    // Une porte va sur une case libre, ou remplace un morceau de palissade.
    const c = cases[0]!;
    const mur = murSurCase(monde, c.x, c.z);
    if (mur?.type === "porte") return "Il y a déjà une porte ici.";
    if (mur) return null;
    return caseDeMurImpossible(monde, c.x, c.z);
  }
  if (cases.some((c) => murSurCase(monde, c.x, c.z))) return "Pas assez de place ici : il y a un mur.";
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
  if (estMorceauDeMur(b.type)) return 1.8;
  if (b.type === "pont") return 4.5;
  if (b.type === "cloche") return 1.8;
  return 3;
}

/** Ce qui manque pour construire, ou null si c'est possible. */
export function raisonImpossible(monde: Monde, type: Constructible): string | null {
  const max = maximumDe(type);
  if (monde.batiments.filter((b) => b.type === type).length >= max) {
    return max === 1 ? "Déjà construit." : `${max} au maximum.`;
  }
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

/** Quelqu'un est debout sur la case d'un mur qui vient d'être fini : on le pousse à côté. */
function degagerCase(monde: Monde, b: Batiment): void {
  const cx = Math.floor(b.x);
  const cz = Math.floor(b.z);
  for (const e of [monde.morris, ...monde.robots, ...monde.monstres]) {
    if (Math.floor(e.x) !== cx || Math.floor(e.z) !== cz) continue;
    let mieux: Point | null = null;
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]] as const) {
      const p = { x: cx + dx + 0.5, z: cz + dz + 0.5 };
      if (!estLibre(monde, p.x, p.z)) continue;
      if (!mieux || Math.hypot(p.x - e.x, p.z - e.z) < Math.hypot(mieux.x - e.x, mieux.z - e.z)) mieux = p;
    }
    if (mieux) {
      e.x = mieux.x;
      e.z = mieux.z;
    }
  }
}

function terminer(monde: Monde, b: Batiment): void {
  b.construit = true;
  monde.versionObstacles += 1;
  if (estMorceauDeMur(b.type)) {
    if (b.type === "palissade") degagerCase(monde, b);
    // Un mur se construit morceau par morceau : pas de fanfare à chaque planche.
    annoncer(monde, { type: "fumee", x: b.x, z: b.z });
    const premier = monde.batiments.filter((x) => x.type === b.type && x.construit).length === 1;
    if (premier && b.type === "palissade") {
      lumo(monde, "Premier morceau de palissade ! Les monstres tapent dedans au lieu de passer. Pense à mettre une porte pour sortir.", true);
    }
    if (premier && b.type === "porte") lumo(monde, "La porte est posée : Morris et les robots passent, pas les monstres.", true);
    return;
  }
  annoncer(monde, { type: "construit", batiment: b.type, x: b.x, z: b.z });
  annoncer(monde, { type: "fumee", x: b.x, z: b.z, grande: true });
  switch (b.type) {
    case "potager":
      lumo(monde, "Le potager est prêt ! Clique dessus pour planter des légumes de Vulkara.", true);
      break;
    case "atelier":
      lumo(monde, "L'atelier est prêt. Clique dessus pour fabriquer l'épée avec le métal du vaisseau.", true);
      break;
    case "cloche":
      lumo(monde, "La cloche sonnera si le camp est attaqué pendant que tu es loin.", true);
      break;
    case "usine":
      lumo(monde, "L'usine marche ! Elle fabrique des graines-cubes avec le métal du vaisseau. Clique dessus pour faire grandir un robot.", true);
      break;
    case "grenier":
      lumo(monde, `Le grenier est prêt. ${nourritureAbritee(monde)} 🍎 y sont à l'abri : les grignotins ne peuvent pas les voler.`, true);
      break;
    case "lanterne":
      lumo(monde, "La lanterne de cristal brille. La nuit, les grignotins ont peur de sa lumière.", true);
      break;
    case "station":
      lumo(monde, "Station de recharge prête : un robot abîmé qui passe à côté se répare vite.", true);
      break;
    case "piege":
      b.recharge = 0;
      lumo(monde, "Le piège est armé. Un grignotin qui marche dessus est attrapé, et il rend ce qu'il a volé.", true);
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
  const lieu = choisi && estPlacable(type) ? caseDEmplacement(choisi.x, choisi.z, type) : lieuBatiment(type);
  if (choisi && estPlacable(type) && emplacementImpossible(monde, type, lieu)) return null;
  payer(monde, reglages.batiments[type].cout);
  if (type === "porte") {
    // La porte remplace le morceau de palissade qui était là.
    const ancien = murSurCase(monde, Math.floor(lieu.x), Math.floor(lieu.z));
    if (ancien) monde.batiments = monde.batiments.filter((x) => x !== ancien);
  }
  const b: Batiment = { id: monde.prochainId++, type, x: lieu.x, z: lieu.z, construit: false, travailFait: 0 };
  if (estMorceauDeMur(type)) b.pv = reglages.batiments[type].pvSegment;
  if (type === "potager") b.parcelles = Array.from({ length: 6 }, () => ({ legume: null, pousse: 0 }));
  monde.batiments.push(b);
  monde.versionObstacles += 1;
  return b;
}

/** Combien d'exemplaires de ce bâtiment on peut avoir (config/reglages.json, « maximum »). Les murs : sans limite. */
export function maximumDe(type: Constructible): number {
  const r = reglages.batiments[type];
  return "maximum" in r ? r.maximum : Infinity;
}

export function potagersConstruits(monde: Monde): Batiment[] {
  return monde.batiments.filter((b) => b.type === "potager" && b.construit && b.parcelles);
}

// ---------- Niveaux (1 à 3) ----------
export type Ameliorable = keyof typeof reglages.niveaux & TypeBatiment;
export const NIVEAU_MAX = 3;

export function niveauDe(b: Batiment): number {
  return b.niveau ?? 1;
}

export function estAmeliorable(type: TypeBatiment): type is Ameliorable {
  return type in reglages.niveaux && type !== ("$commentaire" as TypeBatiment);
}

/** L'effet d'un bâtiment à son niveau (config/reglages.json, « niveaux »). Sans niveaux : 1. */
export function effetNiveau(type: TypeBatiment, niveau: number): number {
  if (!estAmeliorable(type)) return 1;
  return reglages.niveaux[type].effet[Math.min(NIVEAU_MAX, Math.max(1, niveau)) - 1]!;
}

export function effetDe(b: Batiment): number {
  return effetNiveau(b.type, niveauDe(b));
}

/** Prix pour passer au niveau suivant, ou null si on ne peut plus l'améliorer. */
export function prixAmelioration(b: Batiment): Cout | null {
  if (!estAmeliorable(b.type) || niveauDe(b) >= NIVEAU_MAX) return null;
  return reglages.niveaux[b.type].prix[niveauDe(b) - 1] as Cout;
}

/** Solidité maximale d'un morceau de mur, selon son niveau. */
export function pvMaxMur(b: Batiment): number {
  return Math.round(reglages.batiments[b.type as "palissade"].pvSegment * effetDe(b));
}

/** Le meilleur effet parmi les bâtiments construits de ce type (ex. le grenier le plus amélioré). */
function meilleurEffet(monde: Monde, type: TypeBatiment): number | null {
  let meilleur: number | null = null;
  for (const b of monde.batiments) if (b.type === type && b.construit) meilleur = Math.max(meilleur ?? -Infinity, effetDe(b));
  return meilleur;
}

/** Nourriture que les grignotins peuvent voler à la tente (le grenier en garde une partie à l'abri). */
export function nourritureAbritee(monde: Monde): number {
  const e = meilleurEffet(monde, "grenier");
  return e === null ? 0 : Math.round(reglages.batiments.grenier.nourritureProtegee * e);
}
export function nourritureVolable(monde: Monde): number {
  return Math.max(0, monde.ressources.nourriture - nourritureAbritee(monde));
}

/** Prix en éclats pour réparer un robot à l'atelier (moins cher si l'atelier est amélioré). */
export function prixReparation(monde: Monde): number {
  return Math.round(reglages.robots.reparationEclats * (meilleurEffet(monde, "atelier") ?? 1));
}

/** Prix d'un nouveau robot à l'usine (moins cher si l'usine est améliorée). */
export function prixNouveauRobot(monde: Monde): Cout {
  const e = meilleurEffet(monde, "usine") ?? 1;
  const prix: Cout = {};
  for (const [k, v] of Object.entries(reglages.robots.coutNouveauRobot) as [keyof Cout, number][]) prix[k] = Math.round(v * e);
  return prix;
}

/** Rayon de lumière d'une lanterne. */
export function rayonLanterne(b: Batiment): number {
  return reglages.batiments.lanterne.rayon * effetDe(b);
}

/** Une lanterne construite éclaire ce point (la nuit seulement). */
export function eclaireParLanterne(monde: Monde, p: Point): boolean {
  if (!monde.temps.nuit) return false;
  return monde.batiments.some((b) => b.type === "lanterne" && b.construit && Math.hypot(b.x - p.x, b.z - p.z) <= rayonLanterne(b));
}

/** Les pièges armés attrapent les grignotins qui marchent dessus ; ils rendent ce qu'ils ont volé. */
function avancerPieges(monde: Monde): void {
  const P = reglages.batiments.piege;
  for (const b of monde.batiments) {
    if (b.type !== "piege" || !b.construit) continue;
    if ((b.recharge ?? 0) > 0) {
      b.recharge = (b.recharge ?? 0) - 1;
      continue;
    }
    const pris = monde.monstres.find((mo) => mo.type === "grignotin" && Math.hypot(mo.x - b.x, mo.z - b.z) <= P.rayon);
    if (!pris) continue;
    monde.monstres = monde.monstres.filter((x) => x !== pris);
    if (pris.vol?.type === "nourriture") monde.ressources.nourriture += pris.vol.quantite;
    b.recharge = Math.round((P.rearmementSecondes / effetDe(b)) * T);
    annoncer(monde, { type: "fumee", x: b.x, z: b.z });
    lumo(monde, pris.vol?.quantite ? "Le piège a attrapé un grignotin ! Il a rendu la nourriture volée." : "Le piège a attrapé un grignotin !");
  }
}

export function avancerBatiments(monde: Monde): void {
  avancerPieges(monde);
  for (const potager of potagersConstruits(monde)) {
    for (const p of potager.parcelles!) {
      if (!p.legume || p.pousse >= 1) continue;
      if (p.legume === "givrotte" && !monde.temps.nuit) continue; // pousse seulement la nuit, au frais
      p.pousse = Math.min(1, p.pousse + effetDe(potager) / (reglages.legumes[p.legume].pousse * T));
    }
  }
}

export function potagerContient(potager: Batiment, legume: Legume): boolean {
  return !!potager.parcelles?.some((x) => x.legume === legume);
}

/** Ce qu'on récupère en démolissant : tout pour un chantier, une part pour un bâtiment fini. */
export function remboursementDemolition(b: Batiment): Cout {
  const taux = b.construit ? reglages.demolition.remboursementConstruit : reglages.demolition.remboursementChantier;
  const cout = reglages.batiments[b.type as Constructible].cout as Cout;
  const rendu: Cout = {};
  for (const [k, v] of Object.entries(cout) as [keyof Cout, number][]) rendu[k] = Math.floor(v * taux);
  return rendu;
}
