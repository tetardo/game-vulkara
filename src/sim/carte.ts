import { Aleatoire } from "./aleatoire";
import { reglages, type Reglages } from "./reglages";
import type { Point, Rocher, Source } from "./types";

/**
 * Plan des Terres de l'Aube. À l'écran, la carte carrée apparaît en losange (vue de biais) :
 * « vers le haut de l'écran » correspond à la direction (-x, +z).
 * La rivière traverse le haut du losange ; l'autre rive reste cachée jusqu'au pont.
 */
export const LIEUX = {
  camp: { x: 50, z: 40 },
  tente: { x: 47.5, z: 42.5 },
  caisse: { x: 50.5, z: 44.5 },
  epave: { x: 55, z: 37 },
  potager: { x: 44.5, z: 37.5 },
  atelier: { x: 49.5, z: 34.5 },
  cloche: { x: 54.5, z: 45.5 },
  usine: { x: 52.5, z: 41.5 },
  // Places par défaut des nouveaux bâtiments (le joueur choisit d'habitude à la souris).
  grenier: { x: 45.5, z: 43.5 },
  lanterne: { x: 47, z: 46 },
  station: { x: 53.5, z: 34.5 },
  piege: { x: 43, z: 41 },
  sanglier: { x: 17, z: 19 },
  coeurCache: { x: 11.5, z: 13.5 },
  depart: { x: 50.5, z: 41.5 },
  /** Feu de camp devant la tente (décor, ne bloque pas). */
  feu: { x: 47.75, z: 40.25 },
} as const;

/** Axe « haut de l'écran » (u) et « droite de l'écran » (v), en cases. */
export function versEcran(p: Point): { u: number; v: number } {
  return { u: p.z - p.x, v: p.x + p.z };
}

/** Centre de la rivière (valeur de u) pour une position v le long de l'écran. */
export function centreRiviere(v: number): number {
  return 30 + 3 * Math.sin(v * 0.07) + 1.5 * Math.sin(v * 0.19 + 1);
}

export const DEMI_LARGEUR_RIVIERE = 2.4;

export function estRiviere(x: number, z: number): boolean {
  const { u, v } = versEcran({ x, z });
  return Math.abs(u - centreRiviere(v)) < DEMI_LARGEUR_RIVIERE;
}

/** L'autre rive : au-delà de la rivière (l'eau elle-même se dévoile, pour voir le pont). */
export function estAutreRive(x: number, z: number): boolean {
  const { u, v } = versEcran({ x, z });
  return u > centreRiviere(v) + DEMI_LARGEUR_RIVIERE + 0.5;
}

/** Emplacement du pont : là où la rivière croise le chemin qui part du camp vers le haut. */
export function lieuPont(): Point & { angle: number } {
  const v = LIEUX.camp.x + LIEUX.camp.z - 2;
  const u = centreRiviere(v);
  // Orientation : le pont suit l'axe u (perpendiculaire à la rivière, à peu près).
  return { x: (v - u) / 2, z: (v + u) / 2, angle: Math.atan2(1, -1) };
}

/** Angle de la porte de la palissade : tournée vers le haut de l'écran (vers le pont). */
export const ANGLE_PORTE = Math.atan2(1, -1);

/** Position du centre du morceau i de la palissade. */
export function positionSegment(i: number): Point & { angle: number } {
  const n = reglages.camp.segmentsPalissade;
  const a = ANGLE_PORTE + (i / n) * Math.PI * 2;
  const r = reglages.camp.rayonPalissade;
  return { x: LIEUX.camp.x + Math.cos(a) * r, z: LIEUX.camp.z + Math.sin(a) * r, angle: a };
}

/** Numéro du morceau de palissade sur lequel tombe ce point, ou null s'il n'est pas sur l'anneau. */
export function segmentPalissade(x: number, z: number, epaisseur = 0.75): number | null {
  const dx = x - LIEUX.camp.x;
  const dz = z - LIEUX.camp.z;
  const d = Math.hypot(dx, dz);
  if (Math.abs(d - reglages.camp.rayonPalissade) > epaisseur) return null;
  return indiceSegment(Math.atan2(dz, dx));
}

export function indiceSegment(angle: number): number {
  const n = reglages.camp.segmentsPalissade;
  const pas = (Math.PI * 2) / n;
  let a = angle - ANGLE_PORTE + pas / 2;
  a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(a / pas) % n;
}

export function dansLeCamp(p: Point): boolean {
  return Math.hypot(p.x - LIEUX.camp.x, p.z - LIEUX.camp.z) < reglages.camp.rayonPalissade - 0.6;
}

export function estBordure(x: number, z: number, r: Reglages): boolean {
  const m = 2.5;
  return x < m || z < m || x > r.carte.largeurCases - m || z > r.carte.hauteurCases - m;
}

export interface Decor {
  sources: Source[];
  rochers: Rocher[];
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Distance d'un point au segment [a, b]. */
function distanceSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/** Génère arbres, buissons, noisetiers, débris et rochers, toujours pareils pour une même graine. */
export function genererDecor(r: Reglages, prochainId: () => number): Decor {
  const h = new Aleatoire(r.carte.graine);
  const occupe = new Set<string>();
  const sources: Source[] = [];
  const rochers: Rocher[] = [];
  const pont = lieuPont();
  const cle = (x: number, z: number) => `${Math.floor(x)},${Math.floor(z)}`;

  const libre = (x: number, z: number, marge: number): boolean => {
    if (estBordure(x, z, r) || estRiviere(x, z)) return false;
    // Rivière : garder les berges dégagées.
    const { u, v } = versEcran({ x, z });
    if (Math.abs(u - centreRiviere(v)) < DEMI_LARGEUR_RIVIERE + 1.2) return false;
    if (distance({ x, z }, LIEUX.camp) < marge) return false;
    if (distanceSegment({ x, z }, LIEUX.camp, pont) < 3) return false; // chemin vers le pont
    if (distance({ x, z }, LIEUX.sanglier) < 3) return false;
    if (distance({ x, z }, LIEUX.coeurCache) < 1.5) return false;
    return !occupe.has(cle(x, z));
  };

  const poser = (x: number, z: number) => occupe.add(cle(x, z));

  // Débris du vaisseau, autour de l'épave.
  for (let i = 0; i < 6; i += 1) {
    for (let essai = 0; essai < 30; essai += 1) {
      const a = h.entre(0, Math.PI * 2);
      const d = h.entre(7, 13);
      const x = Math.floor(LIEUX.epave.x + Math.cos(a) * d) + 0.5;
      const z = Math.floor(LIEUX.epave.z + Math.sin(a) * d) + 0.5;
      if (libre(x, z, 10)) {
        poser(x, z);
        sources.push({ id: prochainId(), type: "debris", x, z, reste: r.sources.debris, variante: i % 3 });
        break;
      }
    }
  }

  // Forêts : des bosquets d'arbres.
  for (let b = 0; b < 26; b += 1) {
    const cx = h.entre(6, r.carte.largeurCases - 6);
    const cz = h.entre(6, r.carte.hauteurCases - 6);
    if (distance({ x: cx, z: cz }, LIEUX.camp) < 15) continue;
    const n = h.entier(8, 20);
    for (let i = 0; i < n; i += 1) {
      const x = Math.floor(cx + h.entre(-4.5, 4.5)) + 0.5;
      const z = Math.floor(cz + h.entre(-4.5, 4.5)) + 0.5;
      if (!libre(x, z, 13)) continue;
      poser(x, z);
      sources.push({ id: prochainId(), type: "arbre", x, z, reste: r.sources.arbre, variante: h.entier(0, 5) });
    }
  }
  // Quelques arbres isolés, dont certains assez près du camp pour bien démarrer.
  for (let i = 0; i < 60; i += 1) {
    const proche = i < 14;
    const a = h.entre(0, Math.PI * 2);
    const d = proche ? h.entre(12, 18) : h.entre(14, 60);
    const x = Math.floor(LIEUX.camp.x + Math.cos(a) * d) + 0.5;
    const z = Math.floor(LIEUX.camp.z + Math.sin(a) * d) + 0.5;
    if (!libre(x, z, 12)) continue;
    poser(x, z);
    sources.push({ id: prochainId(), type: "arbre", x, z, reste: r.sources.arbre, variante: h.entier(0, 5) });
  }

  // Buissons à fruits et noisetiers.
  for (const [type, nombre, proches] of [
    ["buisson", 26, 6],
    ["noisetier", 18, 4],
  ] as const) {
    let poses = 0;
    for (let essai = 0; essai < 400 && poses < nombre; essai += 1) {
      const a = h.entre(0, Math.PI * 2);
      const d = poses < proches ? h.entre(11, 17) : h.entre(14, 55);
      const x = Math.floor(LIEUX.camp.x + Math.cos(a) * d) + 0.5;
      const z = Math.floor(LIEUX.camp.z + Math.sin(a) * d) + 0.5;
      if (!libre(x, z, 11)) continue;
      poser(x, z);
      sources.push({ id: prochainId(), type, x, z, reste: r.sources[type], variante: h.entier(0, 2) });
      poses += 1;
    }
  }

  // Rochers : autour du sanglier (pour qu'il s'y cogne) et un peu partout.
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2 + h.entre(-0.2, 0.2);
    const d = h.entre(4.5, 7);
    const x = Math.floor(LIEUX.sanglier.x + Math.cos(a) * d) + 0.5;
    const z = Math.floor(LIEUX.sanglier.z + Math.sin(a) * d) + 0.5;
    if (!libre(x, z, 12)) continue;
    poser(x, z);
    rochers.push({ id: prochainId(), x, z, taille: h.entre(1.2, 1.8), variante: h.entier(0, 3) });
  }
  // Le cœur caché est entouré de rochers, avec une entrée.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 7) * Math.PI * 2 + 1.2;
    const x = Math.floor(LIEUX.coeurCache.x + Math.cos(a) * 2) + 0.5;
    const z = Math.floor(LIEUX.coeurCache.z + Math.sin(a) * 2) + 0.5;
    if (occupe.has(cle(x, z)) || estBordure(x, z, r)) continue;
    poser(x, z);
    rochers.push({ id: prochainId(), x, z, taille: h.entre(1, 1.4), variante: h.entier(0, 3) });
  }
  for (let i = 0; i < 45; i += 1) {
    const x = Math.floor(h.entre(4, r.carte.largeurCases - 4)) + 0.5;
    const z = Math.floor(h.entre(4, r.carte.hauteurCases - 4)) + 0.5;
    if (!libre(x, z, 12)) continue;
    poser(x, z);
    rochers.push({ id: prochainId(), x, z, taille: h.entre(0.7, 1.4), variante: h.entier(0, 3) });
  }

  return { sources, rochers };
}
