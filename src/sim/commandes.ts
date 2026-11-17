/**
 * Les ordres du joueur. L'interface et les clics appellent ces fonctions ;
 * elles renvoient un message à afficher quand l'ordre est impossible.
 */
import { dansLeCamp, LIEUX } from "./carte";
import { chercherChemin, estLibre } from "./chemin";
import { annoncer, batimentConstruit, distance, lumo, type Monde } from "./monde";
import { reglages, type Cout, type Ressources } from "./reglages";
import { blesserMonstre } from "./monstres";
import { changerTravail } from "./robots";
import { caseDEmplacement, caseDeMurImpossible, casesDuMur, distanceAction, emplacementImpossible, estPlacable, estMorceauDeMur, payer, peutPayer, poserChantier, prixAmelioration, prixNouveauRobot, prixReparation, pvMaxMur, raisonImpossible, remboursementDemolition, niveauDe, NIVEAU_MAX, NOMS_BATIMENTS, type Constructible } from "./batiments";
import type { Batiment, Legume, Point, Robot, Travail } from "./types";

const T = reglages.simulation.ticksParSeconde;
export type Resultat = string | null;

/** Case libre la plus proche d'un point, à 6 cases au plus. */
function caseLibreProche(monde: Monde, x: number, z: number): Point | null {
  let meilleur: Point | null = null;
  let dMin = Infinity;
  for (let dz = -6; dz <= 6; dz += 1) {
    for (let dx = -6; dx <= 6; dx += 1) {
      const p = { x: Math.floor(x) + dx + 0.5, z: Math.floor(z) + dz + 0.5 };
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < dMin && d <= 6 && estLibre(monde, p.x, p.z)) {
        dMin = d;
        meilleur = p;
      }
    }
  }
  return meilleur;
}

export function deplacerMorris(monde: Monde, x: number, z: number): Resultat {
  const m = monde.morris;
  m.interaction = null;
  // Clic sur un obstacle (arbre, épave, rivière…) : Morris va à la case libre la plus proche.
  const but = estLibre(monde, x, z) ? { x, z } : caseLibreProche(monde, x, z);
  const c = but ? chercherChemin(monde, m, but) : null;
  if (!c) return "Morris ne peut pas aller là.";
  m.chemin = c;
  return null;
}

/**
 * Robots choisis + clic sur le sol : ils y vont et attendent là (travail « Se reposer »).
 * Ils se placent un peu à côté les uns des autres pour ne pas s'empiler.
 */
export function deplacerRobots(monde: Monde, robotIds: number[], x: number, z: number): Resultat {
  const DECALAGES = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]] as const;
  let partis = 0;
  for (const [i, id] of robotIds.entries()) {
    const r = monde.robots.find((y) => y.id === id);
    if (!r || r.etat === "casse") continue;
    const [dx, dz] = DECALAGES[i % DECALAGES.length]!;
    const voulu = { x: x + dx, z: z + dz };
    const but = estLibre(monde, voulu.x, voulu.z) ? voulu : caseLibreProche(monde, voulu.x, voulu.z);
    const c = but ? chercherChemin(monde, r, but) : null;
    if (!c) continue;
    changerTravail(monde, r, "aucun");
    r.chemin = c;
    r.etat = "va";
    partis += 1;
  }
  return partis === 0 && robotIds.length > 0 ? "Les robots ne peuvent pas aller là." : null;
}

export function attaquer(monde: Monde, monstreId: number): Resultat {
  const cible = monde.monstres.find((x) => x.id === monstreId);
  if (!cible) return null;
  monde.morris.interaction = { type: "attaquer", monstreId };
  monde.morris.chemin = [];
  return null;
}

export function allerALaCaisse(monde: Monde): Resultat {
  if (monde.caisseOuverte) return "La caisse est vide.";
  const m = monde.morris;
  m.interaction = { type: "caisse" };
  m.chemin = chercherChemin(monde, m, LIEUX.caisse, reglages.morris.distanceAction - 0.4) ?? [];
  return null;
}

export function ouvrirCaisse(monde: Monde): void {
  if (monde.caisseOuverte) return;
  monde.caisseOuverte = true;
  annoncer(monde, { type: "fumee", x: LIEUX.caisse.x, z: LIEUX.caisse.z });
  lumo(monde, "Une graine-cube ! Elle contient tout pour fabriquer un petit robot. Regarde…", true);
  creerRobot(monde, LIEUX.caisse.x + 1, LIEUX.caisse.z);
}

export function creerRobot(monde: Monde, x: number, z: number): Robot | null {
  const nom = nomDeRobot(monde.robots.length);
  const r: Robot = {
    id: monde.prochainId++,
    nom,
    x,
    z,
    travail: "aucun",
    etat: "attend",
    chemin: [],
    sac: null,
    cibleId: null,
    minuterie: 0,
    rentrerLaNuit: true,
    pv: reglages.robots.pv,
    orientation: 0,
  };
  monde.robots.push(r);
  annoncer(monde, { type: "robot", nom });
  lumo(monde, `Je l'appelle ${nom}. Clique sur ${nom} pour lui donner un travail.`, true);
  return r;
}

/**
 * Trace un mur de palissade de `de` à `a` (cases alignées, sans trou en diagonale).
 * Les cases qui ont déjà un mur sont gardées : c'est comme ça qu'on relie les murs.
 */
export function tracerPalissade(monde: Monde, de: Point, a: Point): Resultat {
  const raison = raisonImpossible(monde, "palissade");
  if (raison && raison !== "Il manque des ressources.") return raison;
  const P = reglages.batiments.palissade;
  const cases = casesDuMur(monde, de, a);
  if (cases.length > P.longueurMax) return `Mur trop long : ${P.longueurMax} morceaux au maximum d'un coup.`;
  const nouvelles = cases.filter((c) => !c.existe);
  if (nouvelles.length === 0) return "Il y a déjà une palissade ici.";
  const bloquee = nouvelles.find((c) => !c.valide);
  if (bloquee) return caseDeMurImpossible(monde, Math.floor(bloquee.x), Math.floor(bloquee.z)) ?? "Pas assez de place ici.";
  const bois = (P.cout.bois ?? 0) * nouvelles.length;
  if (monde.ressources.bois < bois) return `Il faut ${bois} bois pour ce mur (tu en as ${monde.ressources.bois}).`;
  monde.ressources.bois -= bois;
  let premier: number | null = null;
  for (const c of nouvelles) {
    const id = monde.prochainId++;
    premier ??= id;
    monde.batiments.push({ id, type: "palissade", x: c.x, z: c.z, construit: false, travailFait: 0, pv: P.pvSegment });
  }
  monde.versionObstacles += 1;
  return premier === null ? null : aiderAConstruire(monde, premier);
}

/** Construit un bâtiment. `lieu` : emplacement choisi à la souris (sinon l'emplacement prévu). */
export function construire(monde: Monde, type: Constructible, lieu?: Point): Resultat {
  const raison = raisonImpossible(monde, type);
  if (raison) return raison;
  if (type === "palissade") return "Trace la palissade avec la souris : clique le début, puis la fin.";
  if (type === "porte" && !lieu) return "Choisis où mettre la porte.";
  if (lieu && estPlacable(type)) {
    const ici = emplacementImpossible(monde, type, caseDEmplacement(lieu.x, lieu.z, type));
    if (ici) return ici;
  }
  const b = poserChantier(monde, type, lieu)!;
  return aiderAConstruire(monde, b.id);
}

export function aiderAConstruire(monde: Monde, batimentId: number): Resultat {
  const b = monde.batiments.find((x) => x.id === batimentId);
  if (!b || b.construit) return null;
  const m = monde.morris;
  m.interaction = { type: "construire", batimentId };
  // On s'arrête un peu avant la distance de travail du bâtiment (la cloche est petite : il faut s'approcher).
  m.chemin = chercherChemin(monde, m, b, distanceAction(b) - 0.4) ?? [];
  return null;
}

/** Clic sur la cloche construite : elle sonne (pour l'essayer). */
export function sonnerCloche(monde: Monde): Resultat {
  if (!batimentConstruit(monde, "cloche")) return null;
  annoncer(monde, { type: "cloche" });
  return null;
}

export function tourbillon(monde: Monde): Resultat {
  const m = monde.morris;
  if (m.rechargeTourbillon > 0) return "Le tourbillon se recharge…";
  const r = reglages.morris;
  m.rechargeTourbillon = Math.round(r.tourbillonRecharge * T);
  m.animation = "tourbillon";
  m.animationTicks = Math.round(0.9 * T);
  const degats = m.arme === "epee" ? r.tourbillonDegatsEpee : r.tourbillonDegatsBaton;
  for (const mo of [...monde.monstres]) {
    if (distance(m, mo) <= r.tourbillonRayon) blesserMonstre(monde, mo, degats);
  }
  return null;
}

export type Repas = "nourriture" | Legume;

export function manger(monde: Monde, quoi: Repas): Resultat {
  const m = monde.morris;
  if (quoi === "nourriture") {
    if (monde.ressources.nourriture <= 0) return "Plus de fruits ni de noisettes.";
    monde.ressources.nourriture -= 1;
    m.faim = Math.min(100, m.faim + reglages.nourriture.faim);
    m.pv = Math.min(m.pvMax, m.pv + reglages.nourriture.soin);
  } else {
    if (monde.legumes[quoi] <= 0) return "Il n'y en a plus.";
    const l = reglages.legumes[quoi];
    monde.legumes[quoi] -= 1;
    m.faim = Math.min(100, m.faim + l.faim);
    m.pv = Math.min(m.pvMax, m.pv + l.soin);
    if (quoi === "patatonnerre") {
      m.bonusVitesse = reglages.legumes.patatonnerre.vitesse;
      lumo(monde, "Patatonnerre ! Morris court plus vite pendant un moment.");
    }
  }
  if (m.faim >= reglages.morris.faimAlerte) m.aPrevenuFaim = false;
  annoncer(monde, { type: "ramasse", quoi: "Miam !" });
  return null;
}

export function dormir(monde: Monde): Resultat {
  const m = monde.morris;
  if (!dansLeCamp(m)) return "Il faut être au camp pour dormir dans la tente.";
  if (monde.monstres.some((mo) => mo.type !== "sanglier" && distance(mo, m) < 12)) return "Impossible de dormir : des monstres sont tout près !";
  m.pv = m.pvMax;
  m.chemin = [];
  m.interaction = null;
  m.faim = Math.max(0, m.faim - 10);
  lumo(monde, "Morris a bien dormi. Tous ses cœurs sont revenus.");
  return null;
}

/**
 * Après une défaite : Morris se réveille au camp, cœurs pleins. Tout le reste est gardé
 * (carte découverte, ressources, bâtiments, robots). Si c'était la nuit, on passe au matin
 * et les monstres de la nuit s'enfuient, pour ne pas retomber aussitôt.
 */
export function seRelever(monde: Monde): Resultat {
  if (monde.fin !== "defaite") return null;
  const m = monde.morris;
  monde.fin = "en-cours";
  m.x = LIEUX.depart.x;
  m.z = LIEUX.depart.z;
  m.pv = m.pvMax;
  m.faim = Math.max(m.faim, 50);
  m.chemin = [];
  m.interaction = null;
  m.animation = "repos";
  m.animationTicks = 0;
  if (monde.temps.nuit) {
    monde.temps.seconde = 0;
    monde.temps.nuit = false;
    monde.temps.jour += 1;
    monde.stats.joursSurvecus += 1;
    monde.monstres = monde.monstres.filter((mo) => mo.type === "sanglier");
    annoncer(monde, { type: "jour", jour: monde.temps.jour });
  }
  lumo(monde, "Ouf, te revoilà ! Je t'ai ramené à la tente. Le camp, les robots et les ressources sont toujours là.", true);
  return null;
}

/** Le potager choisi par le joueur (il peut y en avoir plusieurs). */
function potagerNumero(monde: Monde, potagerId: number): Batiment | undefined {
  return monde.batiments.find((b) => b.id === potagerId && b.type === "potager" && b.construit);
}

export function planter(monde: Monde, potagerId: number, parcelle: number, legume: Legume | null): Resultat {
  const p = potagerNumero(monde, potagerId);
  const c = p?.parcelles?.[parcelle];
  if (!c) return "Il faut d'abord construire le potager.";
  c.legume = legume;
  c.pousse = 0;
  if (legume === "givrotte") lumo(monde, "La givrotte ne pousse que la nuit, quand il fait frais.");
  return null;
}

export function recolterParcelle(monde: Monde, potagerId: number, parcelle: number): Resultat {
  const p = potagerNumero(monde, potagerId);
  const c = p?.parcelles?.[parcelle];
  if (!c?.legume || c.pousse < 1) return "Ce n'est pas encore mûr.";
  if (c.legume === "pique-chou") return "Aïe, ça pique ! Il faut un robot pour cueillir le pique-chou.";
  monde.legumes[c.legume] += 1;
  monde.stats.legumesRecoltes += 1;
  c.pousse = 0;
  annoncer(monde, { type: "ramasse", quoi: "+1 légume" });
  return null;
}

export function fabriquerEpee(monde: Monde): Resultat {
  if (!batimentConstruit(monde, "atelier")) return "Il faut l'atelier.";
  if (monde.morris.arme === "epee") return "Morris a déjà son épée.";
  if (!peutPayer(monde, reglages.epee.cout)) return "Il manque des ressources.";
  payer(monde, reglages.epee.cout);
  monde.morris.arme = "epee";
  lumo(monde, "Une épée forgée avec le métal des rochers ! Elle frappe bien plus fort que le bâton.", true);
  return null;
}

export function reparerRobot(monde: Monde, robotId: number): Resultat {
  const r = monde.robots.find((x) => x.id === robotId);
  if (!r || r.etat !== "casse") return null;
  if (!batimentConstruit(monde, "atelier")) return "Il faut l'atelier pour réparer un robot.";
  const prix = prixReparation(monde);
  if (monde.ressources.eclats < prix) return `Il faut ${prix} éclats lumineux.`;
  monde.ressources.eclats -= prix;
  r.pv = reglages.robots.pv;
  r.etat = "attend";
  r.chemin = [];
  annoncer(monde, { type: "fumee", x: r.x, z: r.z });
  lumo(monde, `${r.nom} est réparé et repart au travail.`);
  return null;
}

/**
 * Un vrai nom de robot (Eliot ne veut pas de noms rigolos) : les 5 premiers viennent des réglages,
 * les suivants reprennent les mêmes séries avec un autre numéro (KX-8, Kobalt-6…).
 */
export function nomDeRobot(rang: number): string {
  const noms = reglages.robots.noms;
  const base = noms[rang % noms.length]!;
  const tour = Math.floor(rang / noms.length);
  if (tour === 0) return base;
  const m = /^(.*?)(\d+)$/.exec(base);
  return m ? `${m[1]}${Number(m[2]) + tour}` : `${base}-${tour + 1}`;
}

/** Robots déjà là + robots qui grandissent à l'usine. */
export function robotsPrevus(monde: Monde): number {
  return monde.robots.length + monde.batiments.reduce((n, b) => n + (b.file?.length ?? 0), 0);
}

/**
 * Faire grandir un robot : on paie tout de suite et il entre dans la file de l'usine.
 * On peut cliquer autant de fois qu'on peut payer : pas de nombre maximum.
 */
export function nouveauRobot(monde: Monde): Resultat {
  const u = batimentConstruit(monde, "usine");
  if (!u) return "Il faut l'usine à robots.";
  const cout = prixNouveauRobot(monde);
  if (!peutPayer(monde, cout)) return "Il manque des ressources.";
  payer(monde, cout);
  u.file = [...(u.file ?? []), cout];
  u.croissance ??= 0;
  return null;
}

/** Annuler le dernier robot de la file : le prix est rendu. */
export function annulerRobot(monde: Monde): Resultat {
  const u = monde.batiments.find((b) => b.type === "usine" && (b.file?.length ?? 0) > 0);
  if (!u?.file) return null;
  const cout = u.file.pop()!;
  for (const [k, v] of Object.entries(cout) as [keyof Ressources, number][]) monde.ressources[k] += v;
  if (u.file.length === 0) u.croissance = 0;
  return null;
}

/** L'usine fait grandir le premier robot de sa file ; quand il est prêt, il sort. */
export function avancerUsines(monde: Monde): void {
  for (const u of monde.batiments) {
    if (u.type !== "usine" || !u.construit || !u.file?.length) continue;
    u.croissance = (u.croissance ?? 0) + 1 / T;
    if (u.croissance < reglages.robots.croissanceSecondes) continue;
    u.file.shift();
    u.croissance = 0;
    creerRobot(monde, u.x - 2, u.z + 1);
    annoncer(monde, { type: "fumee", x: u.x - 2, z: u.z + 1 });
  }
}

export function choisirTravail(monde: Monde, robotId: number, travail: Travail): Resultat {
  const r = monde.robots.find((x) => x.id === robotId);
  if (!r) return null;
  if (r.etat === "casse") return `${r.nom} est cassé. Répare-le à l'atelier.`;
  if (travail === "potager" && !batimentConstruit(monde, "potager")) return "Il faut d'abord un potager.";
  if (travail === "reparer" && !batimentConstruit(monde, "palissade")) return "Il n'y a pas encore de palissade.";
  changerTravail(monde, r, travail);
  return null;
}

/** Robot choisi + clic sur un monstre : le robot l'attaque, puis reprend son travail. */
export function robotAttaque(monde: Monde, robotId: number, monstreId: number): Resultat {
  const r = monde.robots.find((x) => x.id === robotId);
  const mo = monde.monstres.find((x) => x.id === monstreId);
  if (!r || !mo) return null;
  if (r.etat === "casse") return `${r.nom} est cassé. Répare-le à l'atelier.`;
  if (r.pv <= reglages.robots.pvRetraite) return `${r.nom} est trop abîmé pour se battre. Laisse-le se reposer au camp.`;
  r.travailApres = r.travail === "attaquer" ? r.travailApres : r.travail;
  r.travail = "attaquer";
  r.cibleId = mo.id;
  r.chemin = [];
  return null;
}

/**
 * Clic intelligent : robots choisis + clic sur une chose. Ils prennent le travail qui va avec,
 * en commençant par cette chose-là (cet arbre, ce potager, ce mur…).
 */
export function robotsTravaillent(monde: Monde, robotIds: number[], travail: Travail, cibleId: number | null): Resultat {
  let refus: Resultat = null;
  let partis = 0;
  for (const id of robotIds) {
    const r = choisirTravail(monde, id, travail);
    if (r) {
      refus = r;
      continue;
    }
    const robot = monde.robots.find((x) => x.id === id)!;
    if (cibleId !== null) robot.cibleId = cibleId;
    partis += 1;
  }
  return partis > 0 ? null : refus;
}

/** Robots choisis + clic sur un éclat lumineux : ils vont le chercher et le rapportent au camp. */
export function robotsRamassent(monde: Monde, robotIds: number[], objetId: number): Resultat {
  const o = monde.objets.find((x) => x.id === objetId);
  if (!o) return null;
  if (o.type === "coeur") return "Le cœur, c'est pour Morris : lui seul peut le prendre.";
  let refus: Resultat = null;
  let partis = 0;
  for (const id of robotIds) {
    const r = monde.robots.find((x) => x.id === id);
    if (!r) continue;
    if (r.etat === "casse") {
      refus = `${r.nom} est cassé. Répare-le à l'atelier.`;
      continue;
    }
    if (r.travail !== "ramasser" && r.travail !== "attaquer") r.travailApres = r.travail;
    r.travail = "ramasser";
    r.cibleId = o.id;
    r.chemin = [];
    r.etat = "attend";
    partis += 1;
  }
  return partis > 0 ? null : refus;
}

/** Robots choisis + clic sur un chantier : ils vont tous le construire (à plusieurs, ça va plus vite). */
export function robotsConstruisent(monde: Monde, robotIds: number[], batimentId: number): Resultat {
  const b = monde.batiments.find((x) => x.id === batimentId);
  if (!b || b.construit) return null;
  let partis = 0;
  for (const id of robotIds) {
    const r = monde.robots.find((x) => x.id === id);
    if (!r || r.etat === "casse") continue;
    changerTravail(monde, r, "construire");
    r.cibleId = b.id;
    partis += 1;
  }
  return partis === 0 ? "Aucun de ces robots ne peut construire : ils sont cassés." : null;
}

/**
 * Démolir un bâtiment ou un chantier : il disparaît, la place se libère et une partie du coût revient
 * (config/reglages.json, « demolition »). La tente et le pont ne se démolissent pas.
 */
export function demolir(monde: Monde, batimentId: number): Resultat {
  const b = monde.batiments.find((x) => x.id === batimentId);
  if (!b) return null;
  if (b.type === "tente") return "La tente reste : c'est là que Morris dort.";
  if (b.type === "pont") return "Le pont reste : c'est le chemin vers l'autre rive.";
  const rendu = remboursementDemolition(b);
  for (const [k, v] of Object.entries(rendu) as [keyof Ressources, number][]) monde.ressources[k] += v;
  // Une usine démolie rend le prix des robots qui grandissaient.
  while (b.file?.length) annulerRobot(monde);
  monde.batiments = monde.batiments.filter((x) => x !== b);
  monde.versionObstacles += 1;
  annoncer(monde, { type: "fumee", x: b.x, z: b.z });
  // Ceux qui allaient vers ce bâtiment passent à autre chose.
  for (const r of monde.robots) {
    if (r.cibleId !== b.id) continue;
    r.cibleId = null;
    r.chemin = [];
  }
  const m = monde.morris;
  if (m.interaction?.type === "construire" && m.interaction.batimentId === b.id) {
    m.interaction = null;
    m.chemin = [];
  }
  return null;
}

/**
 * Améliorer un bâtiment au niveau suivant (jusqu'au niveau 3), tout de suite, en payant le prix.
 * Pour un mur : tous les morceaux de ce niveau passent ensemble au suivant (prix par morceau).
 */
export function ameliorer(monde: Monde, batimentId: number): Resultat {
  const b = monde.batiments.find((x) => x.id === batimentId);
  if (!b || !b.construit) return null;
  const prix = prixAmelioration(b);
  if (!prix) return niveauDe(b) >= NIVEAU_MAX ? "C'est déjà le niveau maximum." : "Ce bâtiment ne s'améliore pas.";
  const groupe = estMorceauDeMur(b.type)
    ? monde.batiments.filter((x) => x.type === b.type && x.construit && niveauDe(x) === niveauDe(b))
    : [b];
  const total: Cout = {};
  for (const [k, v] of Object.entries(prix) as [keyof Cout, number][]) total[k] = v * groupe.length;
  if (!peutPayer(monde, total)) return "Il manque des ressources.";
  payer(monde, total);
  const niveau = niveauDe(b) + 1;
  for (const x of groupe) {
    x.niveau = niveau;
    if (estMorceauDeMur(x.type)) x.pv = pvMaxMur(x);
  }
  annoncer(monde, { type: "fumee", x: b.x, z: b.z, grande: true });
  annoncer(monde, { type: "construit", batiment: b.type });
  for (const x of groupe) annoncer(monde, { type: "niveau", x: x.x, z: x.z });
  const nom = NOMS_BATIMENTS[b.type];
  lumo(monde, groupe.length > 1 ? `${groupe.length} morceaux de mur passent au niveau ${niveau} !` : `${nom.replace(/^./, (c) => c.toUpperCase())} passe au niveau ${niveau} !`, true);
  return null;
}

export function choisirNuit(monde: Monde, robotId: number, rentrer: boolean): Resultat {
  const r = monde.robots.find((x) => x.id === robotId);
  if (r) r.rentrerLaNuit = rentrer;
  return null;
}
