// Coffres au trésor (demande du 17/11) : cachés loin du camp, dans le brouillard, près des rochers
// et des arbres. Morris en ouvre un, Lumo pose une énigme à trois réponses.
import enigmes from "../../config/enigmes.json";
import { Aleatoire } from "./aleatoire";
import { estAutreRive, LIEUX } from "./carte";
import { atteignable, chercherChemin, estLibre } from "./chemin";
import { annoncer, distance, lumo, type Monde } from "./monde";
import { reglages, type Ressources } from "./reglages";
import type { Coffre } from "./types";

const T = reglages.simulation.ticksParSeconde;
const R = reglages.coffres;

export interface Enigme {
  question: string;
  reponses: string[];
  bonne: number;
}
export const ENIGMES: Enigme[] = enigmes.liste;

/**
 * Pose les coffres : loin du camp, dans une case encore cachée par le brouillard, entourée d'arbres
 * ou de rochers, que Morris peut atteindre (pas sur l'autre rive), et loin les uns des autres.
 */
export function placerCoffres(monde: Monde): void {
  const h = new Aleatoire(reglages.carte.graine * 31 + 7);
  const { largeur, hauteur } = monde.carte;
  // Cases déjà prises, et arbres ou rochers qui font une bonne cachette (calculés une fois).
  const occupees = new Set([...monde.sources, ...monde.batiments, ...monde.objets].map((o) => Math.floor(o.z) * largeur + Math.floor(o.x)));
  const pris = (x: number, z: number) => occupees.has(Math.floor(z) * largeur + Math.floor(x));
  const caches = [...monde.sources.filter((s) => s.type === "arbre" || s.type === "minerai"), ...monde.rochers];
  /** Nombre d'arbres et de rochers autour : plus il y en a, mieux le coffre est caché. */
  const cachette = (x: number, z: number) => caches.reduce((n, o) => n + (distance(o, { x, z }) <= R.cachetteRayon ? 1 : 0), 0);
  const enigmesLibres = ENIGMES.map((_, i) => i);
  for (let essai = 0; essai < 6000 && monde.coffres.length < R.nombre; essai += 1) {
    const x = Math.floor(h.entre(4, largeur - 4)) + 0.5;
    const z = Math.floor(h.entre(4, hauteur - 4)) + 0.5;
    if (distance({ x, z }, LIEUX.camp) < R.distanceCampMin) continue;
    if (monde.brouillard[Math.floor(z) * largeur + Math.floor(x)] === 1) continue;
    if (estAutreRive(x, z) || !estLibre(monde, x, z) || pris(x, z)) continue;
    if (monde.coffres.some((c) => distance(c, { x, z }) < R.ecartMin)) continue;
    if (cachette(x, z) < R.cachetteVoisinsMin) continue;
    if (!atteignable(monde, LIEUX.depart, { x, z }, reglages.morris.distanceAction)) continue;
    const k = h.entier(0, enigmesLibres.length - 1);
    const enigme = enigmesLibres.splice(k, 1)[0] ?? 0;
    monde.coffres.push({ id: monde.prochainId++, x, z, enigme, ouvert: false, fermeJusqua: 0 });
  }
}

type Resultat = string | null;

/** Morris part ouvrir un coffre. */
export function allerAuCoffre(monde: Monde, coffreId: number): Resultat {
  const c = monde.coffres.find((x) => x.id === coffreId);
  if (!c) return null;
  if (c.ouvert) return "Ce coffre est vide : tu as déjà trouvé son trésor.";
  if (monde.tick < c.fermeJusqua) return "Le coffre est encore verrouillé. Reviens dans un petit moment.";
  const m = monde.morris;
  m.interaction = { type: "coffre", coffreId };
  m.chemin = chercherChemin(monde, m, c, reglages.morris.distanceAction - 0.4) ?? [];
  return null;
}

/** Morris est arrivé devant le coffre : Lumo pose l'énigme (l'interface l'affiche). */
export function ouvrirCoffre(monde: Monde, c: Coffre): void {
  if (c.ouvert || monde.tick < c.fermeJusqua) return;
  lumo(monde, "Un coffre au trésor ! Il est fermé par une énigme. Réfléchis bien…", true);
  annoncer(monde, { type: "enigme", coffreId: c.id });
}

/** Le joueur répond à l'énigme du coffre (choix : 0, 1 ou 2). */
export function repondreEnigme(monde: Monde, coffreId: number, choix: number): Resultat {
  const c = monde.coffres.find((x) => x.id === coffreId);
  if (!c || c.ouvert) return null;
  const enigme = ENIGMES[c.enigme];
  if (!enigme) return null;
  if (choix !== enigme.bonne) {
    c.fermeJusqua = monde.tick + Math.round(R.attenteApresErreurSecondes * T);
    lumo(monde, "Hmm, ce n'est pas ça. Le coffre se referme… Reviens dans un moment pour réessayer.", true);
    return null;
  }
  c.ouvert = true;
  const tresor = R.tresors[monde.coffres.indexOf(c) % R.tresors.length] ?? {};
  const ICONES: Record<keyof Ressources, string> = { bois: "🪵", nourriture: "🍎", metal: "⚙️", eclats: "✨" };
  const morceaux: string[] = [];
  for (const [quoi, n] of Object.entries(tresor) as Array<[keyof Ressources, number]>) {
    if (!(quoi in ICONES)) continue;
    monde.ressources[quoi] += n;
    morceaux.push(`${n} ${ICONES[quoi]}`);
  }
  annoncer(monde, { type: "tresor", x: c.x, z: c.z });
  const restants = monde.coffres.filter((x) => !x.ouvert).length;
  lumo(
    monde,
    `Bravo, bonne réponse ! Le trésor : ${morceaux.join(" et ")}. ` +
      (restants > 0 ? `Il reste ${restants} coffre${restants > 1 ? "s" : ""} caché${restants > 1 ? "s" : ""} sur la carte.` : "Tu as trouvé tous les coffres !"),
    true,
  );
  return null;
}
