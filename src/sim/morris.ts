import { LIEUX } from "./carte";
import { atteignable, chercherChemin, suivreChemin } from "./chemin";
import { annoncer, distance, lumo, type Monde } from "./monde";
import { reglages } from "./reglages";
import { distanceAction, estMorceauDeMur, travailler } from "./batiments";
import type { Batiment, ObjetAuSol, Point } from "./types";
import { blesserMonstre } from "./monstres";
import { ouvrirCaisse } from "./commandes";
import { ouvrirCoffre } from "./coffres";

const T = reglages.simulation.ticksParSeconde;

export function vitesseMorris(monde: Monde): number {
  const m = monde.morris;
  let v = reglages.morris.vitesse;
  if (m.faim <= 0) v *= reglages.morris.ralentiAffame;
  if (m.bonusVitesse > 0) v *= 1.5;
  return v / T;
}

export function avancerMorris(monde: Monde): void {
  const m = monde.morris;
  const r = reglages.morris;
  if (m.recharge > 0) m.recharge -= 1;
  if (m.rechargeTourbillon > 0) m.rechargeTourbillon -= 1;
  if (m.bonusVitesse > 0) m.bonusVitesse = Math.max(0, m.bonusVitesse - 1 / T);
  if (m.animationTicks > 0) m.animationTicks -= 1;

  // La faim.
  m.faim = Math.max(0, m.faim - 100 / (r.faimSecondesAvantVide * T));
  if (m.faim < r.faimAlerte && !m.aPrevenuFaim) {
    m.aPrevenuFaim = true;
    lumo(monde, "Morris a faim. Clique sur « Manger », sinon il va marcher plus lentement.", true);
  }
  if (m.faim <= 0 && monde.tick % (T * 40) === 0) {
    lumo(monde, "Morris est affamé : il avance au ralenti. Il faut manger !", true);
  }

  const i = m.interaction;
  let enMouvement = false;
  if (i) {
    if (i.type === "attaquer") {
      const cible = monde.monstres.find((x) => x.id === i.monstreId);
      if (!cible || cible.pv <= 0) {
        m.interaction = null;
        m.chemin = [];
      } else if (distance(m, cible) > r.porteeAttaque) {
        // On poursuit le monstre : chemin recalculé régulièrement.
        if (m.chemin.length === 0 || monde.tick % 8 === 0) {
          m.chemin = chercherChemin(monde, m, cible, r.porteeAttaque - 0.3, 3000) ?? [];
          if (m.chemin.length === 0) m.chemin = [{ x: cible.x, z: cible.z }];
        }
      } else {
        m.chemin = [];
        m.orientation = Math.atan2(cible.x - m.x, cible.z - m.z);
        if (m.recharge <= 0) {
          m.recharge = Math.round(r.cadenceAttaque * T);
          m.animation = "attaque";
          m.animationTicks = Math.round(0.5 * T);
          blesserMonstre(monde, cible, m.arme === "epee" ? r.degatsEpee : r.degatsBaton);
        }
      }
    } else {
      const cible = cibleInteraction(monde);
      if (!cible) {
        m.interaction = null;
        // L'objet visé a disparu (un robot l'a pris) : Morris passe au suivant.
        if (i.type === "ramasser") allerAuProchainObjet(monde);
      } else if (distance(m, cible) > cible.portee && m.chemin.length === 0 && monde.tick % 10 === 0) {
        // Arrivé trop loin pour agir (chemin approximatif) : on se rapproche encore.
        m.chemin = chercherChemin(monde, m, cible, cible.portee - (i.type === "ramasser" ? 0.05 : 0.4), 3000) ?? [];
      } else if (distance(m, cible) <= cible.portee) {
        m.chemin = [];
        m.orientation = Math.atan2(cible.x - m.x, cible.z - m.z);
        if (i.type === "caisse") {
          ouvrirCaisse(monde);
          m.interaction = null;
          m.animation = "ramasse";
          m.animationTicks = Math.round(1 * T);
        } else if (i.type === "construire") {
          const b = monde.batiments.find((x) => x.id === i.batimentId);
          if (!b || b.construit) {
            // Un mur se construit morceau par morceau : Morris enchaîne avec le morceau suivant tout proche.
            const suivant = b && estMorceauDeMur(b.type) ? morceauSuivant(monde, b) : null;
            m.interaction = suivant ? { type: "construire", batimentId: suivant.id } : null;
          } else {
            m.animation = "construit";
            m.animationTicks = 2;
            travailler(monde, b, 1 / T);
          }
        } else if (i.type === "ramasser") {
          m.interaction = null;
        } else if (i.type === "coffre") {
          const c = monde.coffres.find((x) => x.id === i.coffreId);
          m.interaction = null;
          m.animation = "ramasse";
          m.animationTicks = Math.round(1 * T);
          if (c) ouvrirCoffre(monde, c);
        }
      }
    }
  }

  if (m.chemin.length > 0) {
    suivreChemin(m, vitesseMorris(monde));
    enMouvement = true;
  }
  if (m.animationTicks <= 0) m.animation = enMouvement ? "marche" : "repos";
  else if (enMouvement && m.animation !== "tourbillon") m.animation = "marche";

  ramasserObjets(monde);
}

/** Où Morris doit se rendre pour son action en cours, et à quelle distance il peut agir. */
function cibleInteraction(monde: Monde): { x: number; z: number; portee: number } | null {
  const i = monde.morris.interaction;
  if (!i) return null;
  if (i.type === "caisse") {
    if (monde.caisseOuverte) return null;
    return { x: LIEUX.caisse.x, z: LIEUX.caisse.z, portee: reglages.morris.distanceAction };
  }
  if (i.type === "coffre") {
    const c = monde.coffres.find((x) => x.id === i.coffreId);
    return c && !c.ouvert ? { x: c.x, z: c.z, portee: reglages.morris.distanceAction } : null;
  }
  if (i.type === "construire") {
    const b = monde.batiments.find((x) => x.id === i.batimentId);
    if (!b) return null;
    return { x: b.x, z: b.z, portee: distanceAction(b) };
  }
  if (i.type === "ramasser") {
    const o = monde.objets.find((x) => x.id === i.objetId);
    // Morris prend un objet dès qu'il est à moins de 1,1 case : pas besoin d'être pile dessus (il peut être contre un mur).
    return o ? { x: o.x, z: o.z, portee: 1.05 } : null;
  }
  return null;
}


function morceauSuivant(monde: Monde, depuis: Point): Batiment | null {
  let meilleur: Batiment | null = null;
  for (const b of monde.batiments) {
    if (b.construit || !estMorceauDeMur(b.type) || distance(b, depuis) > 12) continue;
    if (!meilleur || distance(b, depuis) < distance(meilleur, depuis)) meilleur = b;
  }
  return meilleur;
}

function ramasserObjets(monde: Monde): void {
  const m = monde.morris;
  for (let k = monde.objets.length - 1; k >= 0; k -= 1) {
    const o = monde.objets[k]!;
    if (distance(m, o) > 1.1) continue;
    monde.objets.splice(k, 1);
    if (o.type === "eclat") {
      monde.ressources.eclats += 1;
      annoncer(monde, { type: "ramasse", quoi: "+1 éclat lumineux" });
    } else {
      m.pvMax += 2;
      m.pv = m.pvMax;
      annoncer(monde, { type: "ramasse", quoi: "+1 cœur !" });
      annoncer(monde, { type: "coeur", x: m.x, z: m.z });
      lumo(monde, "Un cœur en plus ! Morris est plus solide maintenant. Bien joué.", true);
    }
    // Bouton « Ramasser » : il enchaîne avec l'objet suivant tant qu'il en reste autour de lui.
    if (m.interaction?.type === "ramasser" && m.interaction.objetId === o.id) {
      m.interaction = null;
      allerAuProchainObjet(monde);
    }
  }
}

/**
 * L'objet brillant (éclat, cœur) le plus proche de Morris qu'il peut aller chercher :
 * visible (hors du brouillard), pas trop loin, et qu'on peut atteindre à pied.
 */
export function objetARamasser(monde: Monde): ObjetAuSol | null {
  const m = monde.morris;
  const L = monde.carte.largeur;
  let meilleur: ObjetAuSol | null = null;
  for (const o of monde.objets) {
    const d = distance(m, o);
    if (d > reglages.morris.rayonRamasser || (meilleur && d >= distance(m, meilleur))) continue;
    if (monde.brouillard[Math.floor(o.z) * L + Math.floor(o.x)] !== 1) continue;
    if (!atteignable(monde, m, o, 1)) continue;
    meilleur = o;
  }
  return meilleur;
}

function allerAuProchainObjet(monde: Monde): boolean {
  const o = objetARamasser(monde);
  if (!o) return false;
  const m = monde.morris;
  m.interaction = { type: "ramasser", objetId: o.id };
  // Même distance que atteignable() : une case voisine de l'objet suffit.
  m.chemin = chercherChemin(monde, m, o, 1, 6000) ?? [];
  return true;
}

/** Bouton « Ramasser » : Morris va chercher tous les objets brillants autour de lui, l'un après l'autre. */
export function ramasserTout(monde: Monde): string | null {
  return allerAuProchainObjet(monde) ? null : "Rien à ramasser près de Morris.";
}

/** Morris prend un coup (en demi-cœurs). */
export function blesserMorris(monde: Monde, degats: number): void {
  const m = monde.morris;
  if (monde.fin !== "en-cours") return;
  m.pv = Math.max(0, m.pv - degats);
  m.animation = "touche";
  m.animationTicks = Math.round(0.4 * T);
  annoncer(monde, { type: "coup", x: m.x, z: m.z });
  if (m.pv <= 0) {
    monde.fin = "defaite";
    annoncer(monde, { type: "defaite" });
  } else if (m.pv <= 2) {
    lumo(monde, "Attention, Morris n'a presque plus de cœurs ! Mange, ou va dormir à la tente.", true);
  }
}
