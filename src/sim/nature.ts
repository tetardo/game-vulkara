// La nature qui revit : les arbres coupés repoussent (souche → pousse → arbre), les rochers à minerai se rechargent.
import { estLibre } from "./chemin";
import type { Monde } from "./monde";
import { reglages } from "./reglages";
import type { Source } from "./types";

export type StadeArbre = "arbre" | "souche" | "pousse";

/** Où en est un arbre : debout, souche fraîche, ou petite pousse. */
export function stadeArbre(s: Source): StadeArbre {
  if (s.reste > 0) return "arbre";
  return (s.repousse ?? 0) < reglages.repousse.dureeSouche ? "souche" : "pousse";
}

/** Personne (Morris, robot, monstre) ni rien de construit à l'endroit de l'arbre. */
function placeLibre(monde: Monde, s: Source): boolean {
  if (!estLibre(monde, s.x, s.z)) return false;
  const d = reglages.repousse.distanceLibre;
  const loin = (p: { x: number; z: number }) => Math.hypot(p.x - s.x, p.z - s.z) > d;
  if (!loin(monde.morris)) return false;
  if (!monde.robots.every(loin)) return false;
  if (!monde.monstres.every(loin)) return false;
  return monde.batiments.every((b) => b.type === "piege" || loin(b));
}

export function avancerNature(monde: Monde): void {
  const dt = 1 / reglages.simulation.ticksParSeconde;
  const { dureeSouche, dureePousse } = reglages.repousse;
  for (const s of monde.sources) {
    // Un rocher à minerai vidé se recharge : ses cristaux repoussent (Eliot 17/11 : les robots
    // n'avaient plus de métal une fois les rochers proches vidés).
    if (s.type === "minerai" && s.reste <= 0) {
      s.repousse = (s.repousse ?? 0) + dt;
      if (s.repousse >= reglages.minerai.rechargeSecondes) {
        s.reste = reglages.sources.minerai;
        delete s.repousse;
        monde.versionObstacles += 1;
      }
      continue;
    }
    if (s.type !== "arbre" || s.reste > 0) continue;
    const avant = stadeArbre(s);
    s.repousse = Math.min((s.repousse ?? 0) + dt, dureeSouche + dureePousse);
    if (s.repousse >= dureeSouche + dureePousse && placeLibre(monde, s)) {
      s.reste = reglages.sources.arbre;
      delete s.repousse;
      monde.versionObstacles += 1; // l'arbre bloque de nouveau le passage
    } else if (stadeArbre(s) !== avant) monde.versionObstacles += 1; // le décor change (pousse)
  }
}
