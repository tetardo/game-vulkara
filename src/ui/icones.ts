// Icônes Lucide (licence ISC, gratuites). On n'importe que celles dont on a besoin (taille du jeu).
import { createElement, ArrowLeft, CircleHelp, Pause, Play, Save, SlidersHorizontal, Apple, Bed, Cherry, Cog, Fence, Hammer, House, MapPin, Menu, Moon, Shield, Sparkles, Sprout, Swords, Tent, Tornado, TreePine, type IconNode } from "lucide";
import type { Travail } from "../sim/types";

const cache = new Map<IconNode, string>();

/** Le dessin SVG d'une icône, prêt à mettre dans du HTML. */
export function icone(i: IconNode): string {
  let s = cache.get(i);
  if (!s) {
    const el = createElement(i);
    el.setAttribute("aria-hidden", "true");
    el.classList.add("ico");
    s = el.outerHTML;
    cache.set(i, s);
  }
  return s;
}

export const PICTOS = { maison: House, lune: Moon };

/** Icônes du menu du jeu. */
export const PICTOS_MENU = { pause: Pause, reprendre: Play, aide: CircleHelp, sauver: Save, audio: SlidersHorizontal, principal: House, retour: ArrowLeft };

/** Icônes de la barre d'actions du bas. */
export const PICTOS_ACTIONS = { construire: Hammer, manger: Apple, tourbillon: Tornado, dormir: Tent, morris: MapPin, menu: Menu };

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

/** Chaque travail en un mot et une icône (liste des robots à gauche). */
export const TRAVAIL_COURT = Object.fromEntries([
  ...GROUPES_TRAVAUX.flatMap((g) => g.travaux.map((x) => [x.t, { mot: x.mot, icone: x.icone }] as const)),
  ["attaquer", { mot: "Attaque", icone: Swords }],
  ["ramasser", { mot: "Éclat", icone: Sparkles }],
]) as Record<Travail, { mot: string; icone: IconNode }>;
