import { it } from "vitest";
import { reglages } from "../src/sim/reglages";
import { creerMonde } from "../src/sim/monde";
import { avancer } from "../src/sim/simulation";
import { LIEUX } from "../src/sim/carte";
import { serialiser, deserialiser } from "../src/sim/sauvegarde";
import * as C from "../src/sim/commandes";
import type { Constructible } from "../src/sim/batiments";
const T = reglages.simulation.ticksParSeconde;
const TYPES = ["potager", "atelier", "cloche", "usine", "grenier", "station", "lanterne", "tour", "scierie", "ferme", "fonderie", "porte", "piege", "pont"] as Constructible[];
const TRAVAUX = ["bois", "cueillette", "ferraille", "ramasser", "defendre", "potager", "reparer", "construire", "aucun"] as const;
// Partie au hasard (ordres, constructions, démolitions, sauvegardes…) : la simulation ne doit jamais planter.
for (let graine = 1; graine <= 2; graine++) it(`partie au hasard n° ${graine} : aucune erreur`, () => {
  let s = graine * 9301;
  const h = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let monde = creerMonde(reglages);
  monde.ressources.bois = 5000; monde.ressources.metal = 5000; monde.ressources.nourriture = 5000; monde.ressources.eclats = 500;
  const L = monde.carte.largeur;
  for (let z = 0; z < L; z++) for (let x = 0; x < L; x++) if (Math.hypot(x - LIEUX.camp.x, z - LIEUX.camp.z) < 50) monde.brouillard[z * L + x] = 1;
  C.ouvrirCaisse(monde);
  const log: string[] = [];
  let k = 0;
  try {
    for (k = 0; k < 300 * T; k++) {
      if (k % 7 === 0) {
        const choix = Math.floor(h() * 14);
        const p = { x: LIEUX.camp.x + (h() - 0.5) * 60, z: LIEUX.camp.z + (h() - 0.5) * 60 };
        const r = monde.robots[Math.floor(h() * monde.robots.length)];
        const b = monde.batiments[Math.floor(h() * monde.batiments.length)];
        const mo = monde.monstres[Math.floor(h() * monde.monstres.length)];
        const o = monde.objets[Math.floor(h() * monde.objets.length)];
        const src = monde.sources[Math.floor(h() * monde.sources.length)];
        const ids = monde.robots.filter(() => h() < 0.4).map((x) => x.id);
        log.push(`${k}:${choix}`);
        switch (choix) {
          case 0: C.deplacerMorris(monde, p.x, p.z); break;
          case 1: C.construire(monde, TYPES[Math.floor(h() * TYPES.length)]!, p); break;
          case 2: if (r) C.choisirTravail(monde, r.id, TRAVAUX[Math.floor(h() * TRAVAUX.length)]!); break;
          case 3: if (mo) C.attaquer(monde, mo.id); break;
          case 4: C.ramasserTout(monde); break;
          case 5: if (b && h() < 0.2) C.demolir(monde, b.id); break;
          case 6: if (b) C.ameliorer(monde, b.id); break;
          case 7: C.creerRobot(monde, LIEUX.camp.x + 2, LIEUX.camp.z + 2); break;
          case 8: C.deplacerRobots(monde, ids, p.x, p.z); break;
          case 9: if (o) C.robotsRamassent(monde, ids, o.id); break;
          case 10: if (src) C.robotsTravaillent(monde, ids, "bois", src.id); break;
          case 11: C.tourbillon(monde); C.tracerPalissade(monde, p, { x: p.x + 6, z: p.z }); break;
          case 12: if (r) C.choisirNuit(monde, r.id, h() < 0.5); C.nouveauRobot(monde); break;
          case 13: if (h() < 0.05) monde = deserialiser(serialiser(monde)); C.dormir(monde); C.manger(monde, "nourriture" as never); break;
        }
      }
      avancer(monde);
      monde.evenements = [];
    }
  } catch (e) {
    throw new Error(`tick ${k}, derniers ordres ${log.slice(-5).join(" ")} : ${(e as Error).message}`, { cause: e });
  }
}, 600000);
