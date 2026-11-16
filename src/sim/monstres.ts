import { dansLeCamp, estAutreRive, LIEUX } from "./carte";
import { estLibre } from "./chemin";
import { annoncer, batimentConstruit, distance, hasard, lumo, type Monde } from "./monde";
import { blesserMorris } from "./morris";
import { reglages } from "./reglages";
import type { Batiment, Monstre, Point, TypeMonstre } from "./types";
import { eclaireParLanterne, murSurCase, nourritureVolable, potagerContient, potagersConstruits } from "./batiments";

const T = reglages.simulation.ticksParSeconde;
const RM = reglages.monstres;

/** Inflige des dégâts à un monstre ; il part en fumée s'il n'a plus de vie. */
export function blesserMonstre(monde: Monde, mo: Monstre, degats: number): void {
  if (mo.pv <= 0) return;
  const d = mo.type === "sanglier" && mo.etat === "etourdi" ? degats * 2 : degats;
  mo.pv -= d;
  annoncer(monde, { type: "coup", x: mo.x, z: mo.z });
  if (mo.type === "sanglier" && mo.etat !== "etourdi" && mo.etat !== "charge") mo.minuterie = Math.min(mo.minuterie, 0.5 * T);
  if (mo.pv <= 0) vaincre(monde, mo);
}

function vaincre(monde: Monde, mo: Monstre): void {
  monde.monstres = monde.monstres.filter((x) => x !== mo);
  monde.stats.monstresVaincus += 1;
  annoncer(monde, { type: "fumee", x: mo.x, z: mo.z, grande: mo.type === "sanglier" });
  // Ce qu'un grignotin avait volé revient au camp.
  if (mo.vol) {
    if (mo.vol.type in monde.ressources) monde.ressources[mo.vol.type as "nourriture"] += mo.vol.quantite;
    else monde.legumes[mo.vol.type as keyof Monde["legumes"]] += mo.vol.quantite;
  }
  const eclats = mo.type === "sanglier" ? 3 : 1;
  for (let i = 0; i < eclats; i += 1) {
    monde.objets.push({
      id: monde.prochainId++,
      type: "eclat",
      x: mo.x + (hasard(monde) - 0.5) * 1.2,
      z: mo.z + (hasard(monde) - 0.5) * 1.2,
    });
  }
  if (mo.type === "sanglier") lumo(monde, "Le sanglier est parti en fumée ! Le cœur caché n'est plus gardé.", true);
  else if (monde.stats.monstresVaincus === 1) lumo(monde, "Il a laissé un éclat lumineux. Marche dessus pour le ramasser : il sert à réparer les robots.");
}

/** Le monstre est-il arrêté à cet endroit ? Les portes, ouvertes pour Morris et les robots, l'arrêtent aussi. */
function bloque(monde: Monde, x: number, z: number): boolean {
  if (!estLibre(monde, x, z)) return true;
  const mur = murSurCase(monde, Math.floor(x), Math.floor(z));
  return !!mur && mur.type === "porte" && mur.construit && (mur.pv ?? 0) > 0;
}

/** Avance vers une cible en glissant le long des obstacles. Renvoie false si complètement bloqué. */
function marcherVers(monde: Monde, mo: Monstre, cible: Point, vitesse: number): boolean {
  const dx = cible.x - mo.x;
  const dz = cible.z - mo.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) return true;
  const pas = Math.min(d, vitesse / T);
  const nx = mo.x + (dx / d) * pas;
  const nz = mo.z + (dz / d) * pas;
  mo.orientation = Math.atan2(dx, dz);
  if (!bloque(monde, nx, nz)) {
    mo.x = nx;
    mo.z = nz;
    return true;
  }
  if (!bloque(monde, nx, mo.z)) {
    mo.x = nx;
    return true;
  }
  if (!bloque(monde, mo.x, nz)) {
    mo.z = nz;
    return true;
  }
  return false;
}

function alerteCamp(monde: Monde): void {
  if (!batimentConstruit(monde, "cloche")) return;
  if (distance(monde.morris, LIEUX.camp) < 15) return;
  if (monde.tick - monde.derniereAlerte < 20 * T) return;
  monde.derniereAlerte = monde.tick;
  annoncer(monde, { type: "cloche" });
  lumo(monde, "La cloche sonne ! Le camp est attaqué, il faut y retourner.", true);
}

/**
 * Un mur (palissade ou porte) juste devant le monstre, sur le chemin de sa cible ?
 * Il tape dedans au lieu de passer. Renvoie true s'il est occupé à taper.
 */
function frapperMur(monde: Monde, mo: Monstre, cible: Point): boolean {
  const dx = cible.x - mo.x;
  const dz = cible.z - mo.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.01) return false;
  const devant = { x: mo.x + (dx / d) * 0.8, z: mo.z + (dz / d) * 0.8 };
  const mur = murSurCase(monde, Math.floor(devant.x), Math.floor(devant.z));
  if (!mur || !mur.construit || (mur.pv ?? 0) <= 0) return false;
  mo.orientation = Math.atan2(dx, dz);
  if (mo.recharge > 0) return true;
  mo.recharge = Math.round(RM.scarabee.cadence * T);
  mur.pv = Math.max(0, (mur.pv ?? 0) - (mo.type === "sanglier" ? RM.sanglier.degats : RM.scarabee.degatsPalissade));
  annoncer(monde, { type: "coup", x: devant.x, z: devant.z });
  if (mur.pv === 0) {
    monde.versionObstacles += 1;
    lumo(monde, "Un morceau de la palissade est cassé ! Donne le travail « Réparer » à un robot.", true);
  }
  alerteCamp(monde);
  return true;
}

function scarabee(monde: Monde, mo: Monstre): void {
  if (mo.recharge > 0) mo.recharge -= 1;
  const m = monde.morris;
  // Choix de la cible : Morris s'il est proche, sinon un robot dehors, sinon le camp.
  let cible: Point = dansLeCamp(mo) ? m : LIEUX.camp;
  let viseRobot = null as Monde["robots"][number] | null;
  if (distance(mo, m) < 6) cible = m;
  else {
    for (const r of monde.robots) {
      if (r.etat !== "casse" && !dansLeCamp(r) && distance(mo, r) < 6) {
        cible = r;
        viseRobot = r;
        break;
      }
    }
  }
  // Les épines du pique-chou piquent les scarabées près d'un potager.
  const pique = potagersConstruits(monde).some((p) => potagerContient(p, "pique-chou") && distance(mo, p) < 3.5);
  if (pique && monde.tick % (3 * T) === 0) {
    blesserMonstre(monde, mo, 1);
    if (mo.pv <= 0) return;
  }
  const d = distance(mo, cible);
  if (d <= 1.2) {
    if (mo.recharge <= 0) {
      mo.recharge = Math.round(RM.scarabee.cadence * T);
      if (cible === m) blesserMorris(monde, RM.scarabee.degats);
      else if (viseRobot) {
        viseRobot.pv -= 1;
        annoncer(monde, { type: "coup", x: viseRobot.x, z: viseRobot.z });
        if (viseRobot.pv <= 0) {
          viseRobot.etat = "casse";
          viseRobot.chemin = [];
          viseRobot.sac = null;
          lumo(monde, `${viseRobot.nom} est cassé ! On peut le réparer à l'atelier avec ${reglages.robots.reparationEclats} éclats lumineux.`, true);
        }
      }
    }
    return;
  }
  if (frapperMur(monde, mo, cible)) {
    mo.etat = "attaque";
    return;
  }
  mo.etat = "approche";
  marcherVers(monde, mo, cible, RM.scarabee.vitesse);
}

function grignotin(monde: Monde, mo: Monstre): void {
  // La lumière d'une lanterne de cristal lui fait peur : il repart d'où il vient.
  if (!mo.vol && mo.etat !== "fuit" && eclaireParLanterne(monde, mo)) mo.etat = "fuit";
  if (mo.vol || mo.etat === "fuit") {
    // Il s'enfuit (avec son butin, ou de peur).
    mo.etat = "fuit";
    marcherVers(monde, mo, mo.origine, RM.grignotin.vitesse);
    if (distance(mo, mo.origine) < 1) {
      monde.monstres = monde.monstres.filter((x) => x !== mo);
      if (mo.vol) lumo(monde, "Un grignotin s'est enfui avec de la nourriture. Grr.");
    }
    return;
  }
  // Le potager le plus proche qui a des légumes. La bulle-courge sent si mauvais que les grignotins l'évitent.
  let potager: Batiment | null = null;
  for (const p of potagersConstruits(monde)) {
    if (!p.parcelles!.some((x) => x.legume && x.pousse > 0.2) || potagerContient(p, "bulle-courge")) continue;
    if (!potager || distance(mo, p) < distance(mo, potager)) potager = p;
  }
  const viserPotager = !!potager;
  const tente = monde.batiments.find((b) => b.type === "tente")!;
  const cible = viserPotager ? potager : nourritureVolable(monde) > 0 ? tente : null;
  if (!cible) {
    marcherVers(monde, mo, monde.morris, RM.grignotin.vitesse * 0.5);
    return;
  }
  if (distance(mo, cible) <= 2.4) {
    if (potager && cible === potager && potager.parcelles) {
      const p = potager.parcelles.find((x) => x.legume && x.pousse > 0.2);
      if (p?.legume) {
        mo.vol = { type: p.legume, quantite: 0 }; // une pousse arrachée : rien à rendre
        p.pousse = 0;
      }
    } else {
      const q = Math.min(RM.grignotin.vol, nourritureVolable(monde));
      monde.ressources.nourriture -= q;
      mo.vol = { type: "nourriture", quantite: q };
    }
    alerteCamp(monde);
    return;
  }
  if (mo.recharge > 0) mo.recharge -= 1;
  if (frapperMur(monde, mo, cible)) return;
  if (!marcherVers(monde, mo, cible, RM.grignotin.vitesse)) {
    // Bloqué par la palissade : il tourne autour en cherchant un trou.
    mo.minuterie += 1;
    const a = Math.atan2(mo.z - LIEUX.camp.z, mo.x - LIEUX.camp.x) + 0.3;
    marcherVers(monde, mo, { x: LIEUX.camp.x + Math.cos(a) * 11, z: LIEUX.camp.z + Math.sin(a) * 11 }, RM.grignotin.vitesse * 0.6);
  }
}

function sanglier(monde: Monde, mo: Monstre): void {
  const S = RM.sanglier;
  const m = monde.morris;
  if (mo.minuterie > 0) mo.minuterie -= 1;
  const dMorris = distance(mo, m);
  if (dMorris < 13 && !monde.vuSanglier) {
    monde.vuSanglier = true;
    lumo(monde, "Attention, le sanglier sauvage ! Il fonce tout droit. Esquive-le pour qu'il se cogne contre un rocher.", true);
  }
  if (mo.etat === "etourdi") {
    if (mo.minuterie <= 0) {
      mo.etat = "garde";
      mo.minuterie = Math.round(1.5 * T);
    }
    return;
  }
  if (mo.etat === "charge" && mo.direction) {
    const pas = S.vitesseCharge / T;
    const nx = mo.x + mo.direction.x * pas;
    const nz = mo.z + mo.direction.z * pas;
    if (dMorris < 1.3) {
      blesserMorris(monde, S.degats);
      mo.etat = "garde";
      mo.minuterie = Math.round(2 * T);
      return;
    }
    if (!estLibre(monde, nx, nz)) {
      mo.etat = "etourdi";
      mo.minuterie = Math.round(S.etourdi * T);
      annoncer(monde, { type: "coup", x: nx, z: nz });
      if (!monde.sanglierCogne) {
        monde.sanglierCogne = true;
        lumo(monde, "Il s'est cogné ! Il est tout étourdi : c'est le moment de taper fort !", true);
      }
      return;
    }
    mo.x = nx;
    mo.z = nz;
    if (mo.minuterie <= 0) {
      mo.etat = "garde";
      mo.minuterie = Math.round(1.5 * T);
    }
    return;
  }
  // Il garde son coin : il charge Morris s'il s'approche (même le jour).
  if (dMorris < S.detection && mo.minuterie <= 0 && monde.fin === "en-cours") {
    mo.etat = "charge";
    mo.direction = { x: (m.x - mo.x) / dMorris, z: (m.z - mo.z) / dMorris };
    mo.orientation = Math.atan2(mo.direction.x, mo.direction.z);
    mo.minuterie = Math.round(2.2 * T);
    return;
  }
  if (distance(mo, mo.origine) > 1.5) marcherVers(monde, mo, mo.origine, S.vitesse);
  else if (dMorris < S.detection + 4) mo.orientation = Math.atan2(m.x - mo.x, m.z - mo.z);
}

/** Fait apparaître un monstre de nuit dans le brouillard, loin du camp. */
function faireApparaitre(monde: Monde, type: TypeMonstre): void {
  for (let essai = 0; essai < 25; essai += 1) {
    const a = hasard(monde) * Math.PI * 2;
    const d = RM.distanceApparition + hasard(monde) * 4;
    const x = LIEUX.camp.x + Math.cos(a) * d;
    const z = LIEUX.camp.z + Math.sin(a) * d;
    if (!estLibre(monde, x, z) || estAutreRive(x, z)) continue;
    const pv = type === "scarabee" ? RM.scarabee.pv : RM.grignotin.pv;
    monde.monstres.push({
      id: monde.prochainId++,
      type,
      x,
      z,
      pv,
      pvMax: pv,
      etat: "approche",
      recharge: 0,
      direction: null,
      minuterie: 0,
      vol: null,
      orientation: 0,
      origine: { x, z },
    });
    return;
  }
}

export function avancerMonstres(monde: Monde): void {
  const J = reglages.journee;
  // Les vagues de la nuit.
  if (monde.temps.nuit) {
    const depuis = Math.round((monde.temps.seconde - J.dureeJour) * T);
    const periode = RM.vagueToutesLes * T;
    if (depuis % periode === 5 * T) {
      const nuitDeMonstres = monde.monstres.filter((x) => x.type !== "sanglier").length;
      const renfort = (monde.temps.jour - 1) * RM.renfortParJour;
      const scarabees = RM.scarabeesParVague + renfort;
      const grignotins = RM.grignotinsParVague + Math.floor(renfort / 2);
      for (let i = 0; i < scarabees && nuitDeMonstres + i < RM.maximum; i += 1) faireApparaitre(monde, "scarabee");
      for (let i = 0; i < grignotins && nuitDeMonstres + scarabees + i < RM.maximum; i += 1) faireApparaitre(monde, "grignotin");
    }
  }
  for (const mo of [...monde.monstres]) {
    if (!monde.monstres.includes(mo)) continue;
    if (mo.type !== "sanglier" && !monde.temps.nuit) {
      // Le jour se lève : les monstres de la nuit retournent dans le brouillard.
      mo.etat = "fuit";
      mo.minuterie += 1;
      marcherVers(monde, mo, mo.origine, 3);
      if (mo.minuterie > 4 * T || distance(mo, mo.origine) < 1) {
        monde.monstres = monde.monstres.filter((x) => x !== mo);
        annoncer(monde, { type: "fumee", x: mo.x, z: mo.z });
      }
      continue;
    }
    if (mo.type === "scarabee") scarabee(monde, mo);
    else if (mo.type === "grignotin") grignotin(monde, mo);
    else sanglier(monde, mo);
  }
}
