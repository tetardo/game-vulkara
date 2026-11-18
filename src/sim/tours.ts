// La tour de guet : elle voit loin, tire toute seule sur le monstre le plus proche
// et sonne l'alarme quand un monstre approche du camp.
import { effetDe } from "./batiments";
import { annoncer, distance, lumo, type Monde } from "./monde";
import { blesserMonstre } from "./monstres";
import { reglages } from "./reglages";
import type { Batiment, Monstre } from "./types";

const T = reglages.simulation.ticksParSeconde;
const TOUR = reglages.batiments.tour;

/** Dernière alarme de chaque tour (mémoire de passage : pas besoin de la sauvegarder). */
const derniereAlarme = new WeakMap<Batiment, number>();

function plusProche(monde: Monde, b: Batiment, rayon: number): Monstre | null {
  let choix: Monstre | null = null;
  for (const mo of monde.monstres) {
    const d = distance(b, mo);
    if (d <= rayon && (!choix || d < distance(b, choix))) choix = mo;
  }
  return choix;
}

export function portee(b: Batiment): number {
  return TOUR.portee * effetDe(b);
}

export function avancerTours(monde: Monde): void {
  for (const b of monde.batiments) {
    if (b.type !== "tour" || !b.construit) continue;

    // L'alarme : un monstre entre dans la zone d'alerte (pas plus d'une fois toutes les « alerteRepos » secondes).
    const vu = plusProche(monde, b, TOUR.alerte);
    if (vu) {
      const avant = derniereAlarme.get(b);
      if (avant === undefined || monde.tick - avant > TOUR.alerteRepos * T) {
        derniereAlarme.set(b, monde.tick);
        annoncer(monde, { type: "cloche" });
        lumo(monde, "La tour de guet a vu un monstre approcher !", true);
      }
    }

    // Le tir.
    if ((b.recharge ?? 0) > 0) {
      b.recharge = (b.recharge ?? 0) - 1;
      continue;
    }
    const cible = plusProche(monde, b, portee(b));
    if (!cible) continue;
    b.recharge = Math.round(TOUR.cadenceSecondes * T);
    annoncer(monde, { type: "tir", x: b.x, z: b.z, versX: cible.x, versZ: cible.z });
    blesserMonstre(monde, cible, TOUR.degats);
  }
}
