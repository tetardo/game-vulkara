/**
 * Les ordres du joueur. L'interface et les clics appellent ces fonctions ;
 * elles renvoient un message à afficher quand l'ordre est impossible.
 */
import { dansLeCamp, LIEUX } from "./carte";
import { chercherChemin, estLibre } from "./chemin";
import { annoncer, batimentConstruit, distance, lumo, type Monde } from "./monde";
import { reglages } from "./reglages";
import { blesserMonstre } from "./monstres";
import { changerTravail } from "./robots";
import { payer, peutPayer, poserChantier, raisonImpossible, type Constructible } from "./batiments";
import type { Legume, Point, Robot, Travail } from "./types";

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
  if (monde.robots.length >= reglages.robots.maximum) return null;
  const nom = reglages.robots.noms[monde.robots.length] ?? `Robot-${monde.robots.length + 1}`;
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

export function construire(monde: Monde, type: Constructible): Resultat {
  const raison = raisonImpossible(monde, type);
  if (raison) return raison;
  const b = poserChantier(monde, type)!;
  return aiderAConstruire(monde, b.id);
}

export function aiderAConstruire(monde: Monde, batimentId: number): Resultat {
  const b = monde.batiments.find((x) => x.id === batimentId);
  if (!b || b.construit) return null;
  const m = monde.morris;
  m.interaction = { type: "construire", batimentId };
  m.chemin = chercherChemin(monde, m, b, b.type === "pont" ? 4 : b.type === "palissade" ? 9 : 2.6) ?? [];
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

export function planter(monde: Monde, parcelle: number, legume: Legume | null): Resultat {
  const p = batimentConstruit(monde, "potager");
  const c = p?.parcelles?.[parcelle];
  if (!c) return "Il faut d'abord construire le potager.";
  c.legume = legume;
  c.pousse = 0;
  if (legume === "givrotte") lumo(monde, "La givrotte ne pousse que la nuit, quand il fait frais.");
  return null;
}

export function recolterParcelle(monde: Monde, parcelle: number): Resultat {
  const p = batimentConstruit(monde, "potager");
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
  lumo(monde, "Une épée taillée dans le métal du vaisseau ! Elle frappe bien plus fort que le bâton.", true);
  return null;
}

export function reparerRobot(monde: Monde, robotId: number): Resultat {
  const r = monde.robots.find((x) => x.id === robotId);
  if (!r || r.etat !== "casse") return null;
  if (!batimentConstruit(monde, "atelier")) return "Il faut l'atelier pour réparer un robot.";
  const prix = reglages.robots.reparationEclats;
  if (monde.ressources.eclats < prix) return `Il faut ${prix} éclats lumineux.`;
  monde.ressources.eclats -= prix;
  r.pv = reglages.robots.pv;
  r.etat = "attend";
  r.chemin = [];
  annoncer(monde, { type: "fumee", x: r.x, z: r.z });
  lumo(monde, `${r.nom} est réparé et repart au travail.`);
  return null;
}

export function nouveauRobot(monde: Monde): Resultat {
  const u = batimentConstruit(monde, "usine");
  if (!u) return "Il faut l'usine à robots.";
  if (monde.robots.length >= reglages.robots.maximum) return `${reglages.robots.maximum} robots, c'est le maximum.`;
  if (monde.grainesRestantes <= 0) return "Plus de graines-cubes.";
  const cout = reglages.robots.coutNouveauRobot;
  if (!peutPayer(monde, cout)) return "Il manque des ressources.";
  payer(monde, cout);
  monde.grainesRestantes -= 1;
  creerRobot(monde, u.x - 2, u.z + 1);
  return null;
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

export function choisirNuit(monde: Monde, robotId: number, rentrer: boolean): Resultat {
  const r = monde.robots.find((x) => x.id === robotId);
  if (r) r.rentrerLaNuit = rentrer;
  return null;
}
