// Icônes Lucide (licence ISC, gratuites). On n'importe que celles dont on a besoin (taille du jeu).
import { createElement, Bed, Cherry, Cog, Fence, Hammer, House, Moon, Shield, Sprout, TreePine, type IconNode } from "lucide";
import type { Travail } from "../sim/types";

const cache = new Map<IconNode, string>();

/** Le dessin SVG d'une icône, prêt à mettre dans du HTML. */
export function icone(i: IconNode): string {
  let s = cache.get(i);
  if (!s) {
    const el = createElement(i);
    el.setAttribute("aria-hidden", "true");
    el.classList.add("icone");
    s = el.outerHTML;
    cache.set(i, s);
  }
  return s;
}

export const PICTOS = { maison: House, lune: Moon };

/** Les travaux des robots, rangés en groupes, avec une icône et un mot court. */
export const GROUPES_TRAVAUX: { titre: string; travaux: { t: Travail; mot: string; icone: IconNode }[] }[] = [
  {
    titre: "Récolter",
    travaux: [
      { t: "bois", mot: "Bois", icone: TreePine },
      { t: "cueillette", mot: "Cueillir", icone: Cherry },
      { t: "ferraille", mot: "Métal", icone: Cog },
    ],
  },
  {
    titre: "Au camp",
    travaux: [
      { t: "potager", mot: "Potager", icone: Sprout },
      { t: "construire", mot: "Construire", icone: Hammer },
      { t: "reparer", mot: "Réparer", icone: Fence },
    ],
  },
  {
    titre: "Protéger ou se reposer",
    travaux: [
      { t: "defendre", mot: "Défendre", icone: Shield },
      { t: "aucun", mot: "Repos", icone: Bed },
    ],
  },
];
