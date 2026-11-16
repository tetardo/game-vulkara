import { LIEUX } from "./carte";
import { chercherChemin, suivreChemin } from "./chemin";
import { batimentConstruit, distance, type Monde } from "./monde";
import { reglages } from "./reglages";
import { distanceAction, estMorceauDeMur, travailler } from "./batiments";
import { LEGUMES, type Batiment, type Robot, type Source, type Travail, type TypeSource } from "./types";

const T = reglages.simulation.ticksParSeconde;
const R = reglages.robots;

export const NOMS_TRAVAUX: Record<Travail, string> = {
  aucun: "Se reposer",
  bois: "Couper du bois",
  cueillette: "Cueillir fruits et noisettes",
  ferraille: "Démonter l'épave (métal)",
  potager: "S'occuper du potager",
  reparer: "Réparer la palissade",
  construire: "Aider à construire",
};

const SOURCES_DU_TRAVAIL: Partial<Record<Travail, TypeSource[]>> = {
  bois: ["arbre"],
  cueillette: ["buisson", "noisetier"],
  ferraille: ["debris", "epave"],
};

function aller(monde: Monde, r: Robot, but: { x: number; z: number }, arrivee: number): boolean {
  const c = chercherChemin(monde, r, but, arrivee);
  r.chemin = c ?? [];
  return c !== null;
}

function sourcePlusProche(monde: Monde, r: Robot, types: TypeSource[]): Source | null {
  let meilleure: Source | null = null;
  let dMin = Infinity;
  for (const s of monde.sources) {
    if (s.reste <= 0 || !types.includes(s.type)) continue;
    // On ne va pas chercher dans le brouillard : seulement les cases déjà découvertes.
    const i = Math.floor(s.z) * monde.carte.largeur + Math.floor(s.x);
    if (monde.brouillard[i] !== 1) continue;
    const d = distance(r, s) + distance(s, LIEUX.tente) * 0.5;
    if (d < dMin) {
      dMin = d;
      meilleure = s;
    }
  }
  return meilleure;
}

function deposer(monde: Monde, r: Robot): void {
  if (!r.sac) return;
  const t = r.sac.type;
  if (t === "bois" || t === "nourriture" || t === "metal" || t === "eclats") monde.ressources[t] += r.sac.quantite;
  else {
    monde.legumes[t] += r.sac.quantite;
    monde.stats.legumesRecoltes += r.sac.quantite;
  }
  r.sac = null;
}

function typeRecolte(s: Source): "bois" | "nourriture" | "metal" {
  if (s.type === "arbre") return "bois";
  if (s.type === "buisson" || s.type === "noisetier") return "nourriture";
  return "metal";
}

/** Une étape de la vie d'un robot. */
function avancerRobot(monde: Monde, r: Robot): void {
  if (r.etat === "casse") return;
  const vitesse = R.vitesse / T;
  if (r.minuterie > 0) r.minuterie -= 1;

  // La nuit, les robots qui doivent rentrer reviennent au camp et attendent le jour.
  const dehors = r.travail === "bois" || r.travail === "cueillette" || r.travail === "ferraille";
  if (monde.temps.nuit && r.rentrerLaNuit && dehors) {
    if (r.etat !== "rentre") {
      r.etat = "rentre";
      deposerSiProche(monde, r);
      aller(monde, r, LIEUX.tente, 3);
    }
    suivreChemin(r, vitesse);
    if (r.chemin.length === 0) deposerSiProche(monde, r);
    return;
  }
  if (r.etat === "rentre") {
    r.etat = "attend";
    r.cibleId = null;
  }

  const types = SOURCES_DU_TRAVAIL[r.travail];
  if (types) {
    recolter(monde, r, types, vitesse);
    return;
  }
  switch (r.travail) {
    case "potager":
      jardiner(monde, r, vitesse);
      return;
    case "reparer":
      reparer(monde, r, vitesse);
      return;
    case "construire":
      construire(monde, r, vitesse);
      return;
    default:
      if (r.sac) rapporter(monde, r, vitesse);
      else suivreChemin(r, vitesse);
  }
}

function deposerSiProche(monde: Monde, r: Robot): void {
  if (distance(r, LIEUX.tente) < 3.2) deposer(monde, r);
}

function rapporter(monde: Monde, r: Robot, vitesse: number): void {
  if (r.etat !== "rapporte") {
    r.etat = "rapporte";
    aller(monde, r, LIEUX.tente, 2.5);
  }
  if (suivreChemin(r, vitesse)) {
    deposer(monde, r);
    r.etat = "attend";
  }
}

function recolter(monde: Monde, r: Robot, types: TypeSource[], vitesse: number): void {
  if (r.sac && r.sac.quantite >= R.capaciteSac) {
    rapporter(monde, r, vitesse);
    return;
  }
  if (r.etat === "rapporte") {
    rapporter(monde, r, vitesse);
    return;
  }
  let s = monde.sources.find((x) => x.id === r.cibleId && x.reste > 0) ?? null;
  if (!s) {
    s = sourcePlusProche(monde, r, types);
    r.cibleId = s?.id ?? null;
    if (!s) {
      if (r.sac) rapporter(monde, r, vitesse);
      return; // plus rien à récolter de connu : il attend
    }
    r.etat = "va";
    if (!aller(monde, r, s, s.type === "epave" ? 3.4 : 1.6)) {
      // Inaccessible : on l'oublie pour un moment.
      r.cibleId = null;
      r.minuterie = T;
      return;
    }
  }
  if (r.etat === "va") {
    if (suivreChemin(r, vitesse)) {
      r.etat = "recolte";
      r.minuterie = Math.round(R.dureeRecolte * T);
    }
    return;
  }
  if (r.etat === "recolte") {
    r.orientation = Math.atan2(s.x - r.x, s.z - r.z);
    if (r.minuterie > 0) return;
    const type = typeRecolte(s);
    const place = R.capaciteSac - (r.sac?.type === type ? r.sac.quantite : 0);
    const q = Math.min(place, s.reste);
    s.reste -= q;
    if (s.reste <= 0) monde.versionObstacles += 1; // l'arbre est coupé, le passage s'ouvre
    r.sac = { type, quantite: (r.sac?.type === type ? r.sac.quantite : 0) + q };
    r.cibleId = s.reste > 0 ? s.id : null;
    rapporter(monde, r, vitesse);
    return;
  }
  r.etat = "va";
  aller(monde, r, s, s.type === "epave" ? 3.4 : 1.6);
}

/**
 * Le robot jardinier va au potager et y reste : il sème les parcelles vides
 * (un légume différent par parcelle, tant que le joueur n'a rien choisi),
 * puis récolte ce qui est mûr et le rapporte à la tente. Le légume est resemé.
 */
function jardiner(monde: Monde, r: Robot, vitesse: number): void {
  const p = batimentConstruit(monde, "potager");
  if (r.etat === "rapporte" || (r.sac && r.sac.quantite > 0)) {
    rapporter(monde, r, vitesse);
    return;
  }
  if (!p?.parcelles) return;
  if (distance(r, p) > distanceAction(p)) {
    r.etat = "va";
    if (r.chemin.length === 0) {
      if (r.minuterie > 0) return;
      // Chemin introuvable : on réessaie un peu plus tard, sans recalculer à chaque pas.
      if (!aller(monde, r, p, distanceAction(p) - 0.5)) r.minuterie = 2 * T;
    }
    suivreChemin(r, vitesse);
    return;
  }
  r.chemin = [];
  r.etat = "recolte";
  r.orientation = Math.atan2(p.x - r.x, p.z - r.z);
  if (r.minuterie > 0) return;
  r.minuterie = Math.round(R.dureeJardinage * T);
  const vide = p.parcelles.findIndex((x) => x.legume === null);
  if (vide >= 0) {
    p.parcelles[vide] = { legume: LEGUMES[vide % LEGUMES.length]!, pousse: 0 };
    return;
  }
  const mure = p.parcelles.find((x) => x.legume && x.pousse >= 1);
  if (!mure?.legume) return; // tout pousse : il attend sur place
  r.sac = { type: mure.legume, quantite: 1 };
  mure.pousse = 0;
  rapporter(monde, r, vitesse);
}

/** Le robot répare le morceau de palissade (ou la porte) le plus abîmé, avec du bois. */
function reparer(monde: Monde, r: Robot, vitesse: number): void {
  let pire: Batiment | null = null;
  for (const b of monde.batiments) {
    if (!estMorceauDeMur(b.type) || !b.construit) continue;
    const max = reglages.batiments[b.type].pvSegment;
    if ((b.pv ?? max) >= max) continue;
    if (!pire || (b.pv ?? 0) < (pire.pv ?? 0)) pire = b;
  }
  if (!pire || monde.ressources.bois <= 0) {
    suivreChemin(r, vitesse);
    return;
  }
  if (distance(r, pire) > 1.8) {
    if (r.chemin.length === 0 || r.cibleId !== pire.id) {
      r.cibleId = pire.id;
      if (!aller(monde, r, pire, 1.4)) aller(monde, r, pire, 2.4);
    }
    if (suivreChemin(r, vitesse) && distance(r, pire) > 2.6) r.chemin = [];
    return;
  }
  r.orientation = Math.atan2(pire.x - r.x, pire.z - r.z);
  if (r.minuterie > 0) return;
  r.minuterie = Math.round(0.5 * T);
  const etaitCasse = pire.pv === 0;
  pire.pv = Math.min(reglages.batiments[pire.type as "palissade"].pvSegment, (pire.pv ?? 0) + 2);
  monde.ressources.bois -= 1;
  if (etaitCasse) monde.versionObstacles += 1;
}

function construire(monde: Monde, r: Robot, vitesse: number): void {
  // Le chantier le plus proche (un mur se construit morceau par morceau).
  let b: Batiment | null = null;
  for (const x of monde.batiments) if (!x.construit && (!b || distance(r, x) < distance(r, b))) b = x;
  if (!b) {
    suivreChemin(r, vitesse);
    return;
  }
  const portee = distanceAction(b);
  if (distance(r, b) > portee) {
    if (r.chemin.length === 0 || r.cibleId !== b.id) {
      r.cibleId = b.id;
      if (!aller(monde, r, b, portee - 0.6)) aller(monde, r, b, portee + 1);
    }
    if (suivreChemin(r, vitesse) && distance(r, b) > portee + 1.2) r.chemin = [];
    return;
  }
  r.orientation = Math.atan2(b.x - r.x, b.z - r.z);
  travailler(monde, b, 1 / T);
}

export function avancerRobots(monde: Monde): void {
  for (const r of monde.robots) avancerRobot(monde, r);
}

export function changerTravail(monde: Monde, r: Robot, travail: Travail): void {
  if (r.etat === "casse") return;
  r.travail = travail;
  r.cibleId = null;
  r.chemin = [];
  r.etat = r.sac ? "rapporte" : "attend";
  if (r.sac) aller(monde, r, LIEUX.tente, 2.5);
}
