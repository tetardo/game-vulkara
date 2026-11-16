import { LIEUX } from "./carte";
import { chercherChemin, suivreChemin } from "./chemin";
import { annoncer, distance, lumo, type Monde } from "./monde";
import { reglages } from "./reglages";
import { distanceAction, travailler } from "./batiments";
import { blesserMonstre } from "./monstres";
import { ouvrirCaisse } from "./commandes";

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
          if (!b || b.construit) m.interaction = null;
          else {
            m.animation = "construit";
            m.animationTicks = 2;
            travailler(monde, b, 1 / T);
          }
        } else if (i.type === "ramasser") {
          m.interaction = null;
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
  if (i.type === "construire") {
    const b = monde.batiments.find((x) => x.id === i.batimentId);
    if (!b) return null;
    return { x: b.x, z: b.z, portee: distanceAction(b) };
  }
  if (i.type === "ramasser") {
    const o = monde.objets.find((x) => x.id === i.objetId);
    return o ? { x: o.x, z: o.z, portee: 0.5 } : null;
  }
  return null;
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
      lumo(monde, "Un cœur en plus ! Morris est plus solide maintenant. Bien joué.", true);
    }
    if (m.interaction?.type === "ramasser" && m.interaction.objetId === o.id) m.interaction = null;
  }
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
