import { dansLeCamp, LIEUX } from "./carte";
import { blesserMonstre } from "./monstres";
import { chercherChemin, suivreChemin } from "./chemin";
import { annoncer, batimentConstruit, distance, type Monde } from "./monde";
import { reglages } from "./reglages";
import { distanceAction, effetDe, estMorceauDeMur, potagersConstruits, pvMaxMur, travailler } from "./batiments";
import { LEGUMES, type Batiment, type Monstre, type Robot, type Source, type Travail, type TypeSource } from "./types";

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
  defendre: "Défendre le camp",
  attaquer: "Attaquer un monstre",
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
  if (r.sac.quantite > 0) annoncer(monde, { type: "depot", x: r.x, z: r.z, quoi: t, quantite: r.sac.quantite });
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

  // Au camp, un robot abîmé se répare tout doucement.
  if (dansLeCamp(r) && r.pv < R.pv && monde.tick % Math.round(R.soinAuCampSecondes * T) === 0) r.pv += 1;
  // À côté de la station de recharge, beaucoup plus vite.
  const S = reglages.batiments.station;
  if (r.pv < R.pv) {
    // La station la plus améliorée à portée donne le rythme.
    let effet = 0;
    for (const b of monde.batiments) if (b.type === "station" && b.construit && distance(b, r) <= S.rayon + 1.5) effet = Math.max(effet, effetDe(b));
    if (effet > 0 && monde.tick % Math.max(1, Math.round((S.soinSecondes / effet) * T)) === 0) r.pv += 1;
  }
  // Presque cassé : il arrête de se battre et rentre au camp.
  if ((r.travail === "attaquer" || r.travail === "defendre") && r.pv <= R.pvRetraite) {
    if (!dansLeCamp(r)) {
      if (r.etat !== "va" || r.chemin.length === 0) {
        r.etat = "va";
        aller(monde, r, LIEUX.tente, 2.5);
      }
      suivreChemin(r, vitesse);
      return;
    }
    r.etat = "attend";
    return;
  }
  if (r.travail === "attaquer") {
    const mo = monde.monstres.find((x) => x.id === r.cibleId);
    if (mo) combattre(monde, r, mo, vitesse);
    else {
      // Monstre vaincu ou parti : le robot reprend son travail.
      r.travail = r.travailApres ?? "aucun";
      r.travailApres = undefined;
      r.cibleId = null;
      r.chemin = [];
      r.etat = "attend";
    }
    return;
  }
  if (r.travail === "defendre") {
    defendre(monde, r, vitesse);
    return;
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
      // « Se reposer » : il rapporte son sac s'il rentrait au camp, sinon il va où on l'a envoyé et attend.
      if (r.sac && r.etat === "rapporte") rapporter(monde, r, vitesse);
      else if (r.chemin.length > 0) {
        if (suivreChemin(r, vitesse)) r.etat = "attend";
      } else if (r.etat === "va") r.etat = "attend";
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

/** Le robot va au contact du monstre et le frappe, moins fort que Morris. */
function combattre(monde: Monde, r: Robot, mo: Monstre, vitesse: number): void {
  if (distance(r, mo) > R.porteeAttaque) {
    r.etat = "va";
    if (r.chemin.length === 0 || (monde.tick + r.id) % 8 === 0) {
      r.chemin = chercherChemin(monde, r, mo, R.porteeAttaque - 0.3, 3000) ?? [{ x: mo.x, z: mo.z }];
    }
    suivreChemin(r, vitesse);
    return;
  }
  r.chemin = [];
  r.etat = "combat";
  r.orientation = Math.atan2(mo.x - r.x, mo.z - r.z);
  if (r.minuterie > 0) return;
  r.minuterie = Math.round(R.cadenceAttaque * T);
  blesserMonstre(monde, mo, R.degats);
}

/** Défendre le camp : attaquer le monstre le plus proche du camp, sinon attendre au camp. */
function defendre(monde: Monde, r: Robot, vitesse: number): void {
  let cible: Monstre | null = null;
  for (const mo of monde.monstres) {
    const d = distance(mo, LIEUX.camp);
    const vu = monde.brouillard[Math.floor(mo.z) * monde.carte.largeur + Math.floor(mo.x)] === 1;
    if (d > R.rayonDefense || !vu) continue;
    if (!cible || d < distance(cible, LIEUX.camp)) cible = mo;
  }
  if (cible) {
    combattre(monde, r, cible, vitesse);
    return;
  }
  if (distance(r, LIEUX.camp) > 4) {
    if (r.etat !== "rentre" || r.chemin.length === 0) {
      r.etat = "rentre";
      if (r.minuterie <= 0 && !aller(monde, r, LIEUX.camp, 3)) r.minuterie = 2 * T;
    }
    suivreChemin(r, vitesse);
    return;
  }
  r.etat = "attend";
}

/**
 * Le potager de ce jardinier : celui qu'il soigne déjà, sinon celui qui a le moins de jardiniers
 * (le plus proche à égalité). Ainsi plusieurs jardiniers se répartissent entre les potagers.
 */
function potagerDe(monde: Monde, r: Robot): Batiment | null {
  const potagers = potagersConstruits(monde);
  const actuel = potagers.find((p) => p.id === r.cibleId);
  if (actuel) return actuel;
  const jardiniers = (p: Batiment) => monde.robots.filter((x) => x !== r && x.travail === "potager" && x.cibleId === p.id).length;
  let choix: Batiment | null = null;
  for (const p of potagers) {
    if (!choix || jardiniers(p) < jardiniers(choix) || (jardiniers(p) === jardiniers(choix) && distance(r, p) < distance(r, choix))) choix = p;
  }
  r.cibleId = choix?.id ?? null;
  return choix;
}

/**
 * Le robot jardinier va à son potager et y reste : il sème les parcelles vides
 * (un légume différent par parcelle, tant que le joueur n'a rien choisi),
 * puis récolte ce qui est mûr et le rapporte à la tente. Le légume est resemé.
 */
function jardiner(monde: Monde, r: Robot, vitesse: number): void {
  if (r.etat === "rapporte" || (r.sac && r.sac.quantite > 0)) {
    rapporter(monde, r, vitesse);
    return;
  }
  const p = potagerDe(monde, r);
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
    const max = pvMaxMur(b);
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
  pire.pv = Math.min(pvMaxMur(pire), (pire.pv ?? 0) + 2);
  monde.ressources.bois -= 1;
  if (etaitCasse) monde.versionObstacles += 1;
}

function construire(monde: Monde, r: Robot, vitesse: number): void {
  // Le chantier donné par le joueur s'il n'est pas fini, sinon le plus proche
  // (un mur se construit morceau par morceau).
  const donne = monde.batiments.find((x) => x.id === r.cibleId && !x.construit);
  let b: Batiment | null = donne ?? null;
  if (!b) for (const x of monde.batiments) if (!x.construit && (!b || distance(r, x) < distance(r, b))) b = x;
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
  r.travailApres = undefined;
  r.cibleId = null;
  r.chemin = [];
  r.etat = r.sac ? "rapporte" : "attend";
  if (r.sac) aller(monde, r, LIEUX.tente, 2.5);
}
