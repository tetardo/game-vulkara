import { estBordure, estRiviere, lieuPont } from "./carte";
import type { Monde } from "./monde";
import { reglages } from "./reglages";
import type { Point } from "./types";

/**
 * Grille des obstacles (1 = on ne passe pas) et recherche de chemin A*.
 * La grille est recalculée seulement quand un obstacle change (monde.versionObstacles).
 */
interface Cache {
  version: number;
  bloque: Uint8Array;
}
const caches = new WeakMap<Monde, Cache>();

/** Taille au sol des bâtiments (demi-côté, en cases). */
/** Demi-taille au sol des bâtiments (en cases). */
export const EMPRISE: Record<string, number> = {
  tente: 1,
  potager: 1.5,
  atelier: 1.5,
  cloche: 0.5,
  usine: 1.5,
  grenier: 1,
  station: 1,
  lanterne: 0.5,
  // Le piège ne bloque pas le passage : c'est le principe.
};

export function grille(monde: Monde): Uint8Array {
  const existant = caches.get(monde);
  if (existant && existant.version === monde.versionObstacles) return existant.bloque;
  const { largeur, hauteur } = monde.carte;
  const bloque = new Uint8Array(largeur * hauteur);
  const marquer = (x: number, z: number) => {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (cx >= 0 && cz >= 0 && cx < largeur && cz < hauteur) bloque[cz * largeur + cx] = 1;
  };
  const pont = monde.batiments.find((b) => b.type === "pont" && b.construit);
  const lp = lieuPont();
  for (let z = 0; z < hauteur; z += 1) {
    for (let x = 0; x < largeur; x += 1) {
      const cx = x + 0.5;
      const cz = z + 0.5;
      if (estBordure(cx, cz, reglages)) bloque[z * largeur + x] = 1;
      else if (estRiviere(cx, cz)) {
        // Le pont construit laisse passer sur une bande de 2 cases.
        const surPont = pont !== undefined && Math.abs(cx + cz - (lp.x + lp.z)) < 2;
        if (!surPont) bloque[z * largeur + x] = 1;
      }
    }
  }
  for (const s of monde.sources) {
    if (s.reste <= 0) continue;
    if (s.type === "epave") {
      for (let dz = -2; dz <= 2; dz += 1) for (let dx = -2; dx <= 2; dx += 1) marquer(s.x + dx, s.z + dz);
    } else marquer(s.x, s.z);
  }
  for (const r of monde.rochers) marquer(r.x, r.z);
  // Palissade : chaque morceau debout bloque. Les portes laissent passer Morris et les robots.
  for (const b of monde.batiments) {
    if (b.type === "palissade" && b.construit && (b.pv ?? 0) > 0) marquer(b.x, b.z);
  }
  for (const b of monde.batiments) {
    const e = EMPRISE[b.type];
    if (e === undefined) continue;
    for (let dz = -e; dz <= e; dz += 1) for (let dx = -e; dx <= e; dx += 1) marquer(b.x + dx, b.z + dz);
  }
  caches.set(monde, { version: monde.versionObstacles, bloque });
  return bloque;
}

export function estLibre(monde: Monde, x: number, z: number): boolean {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= monde.carte.largeur || cz >= monde.carte.hauteur) return false;
  return grille(monde)[cz * monde.carte.largeur + cx] === 0;
}

/** Tas binaire minimal pour A*. */
class Tas {
  private noeuds: number[] = [];
  private prios: number[] = [];
  get taille(): number {
    return this.noeuds.length;
  }
  ajouter(n: number, p: number): void {
    this.noeuds.push(n);
    this.prios.push(p);
    let i = this.noeuds.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prios[parent]! <= this.prios[i]!) break;
      this.echanger(i, parent);
      i = parent;
    }
  }
  retirer(): number {
    const haut = this.noeuds[0]!;
    const dernierN = this.noeuds.pop()!;
    const dernierP = this.prios.pop()!;
    if (this.noeuds.length > 0) {
      this.noeuds[0] = dernierN;
      this.prios[0] = dernierP;
      let i = 0;
      for (;;) {
        const g = 2 * i + 1;
        const d = g + 1;
        let min = i;
        if (g < this.noeuds.length && this.prios[g]! < this.prios[min]!) min = g;
        if (d < this.noeuds.length && this.prios[d]! < this.prios[min]!) min = d;
        if (min === i) break;
        this.echanger(i, min);
        i = min;
      }
    }
    return haut;
  }
  private echanger(a: number, b: number): void {
    [this.noeuds[a], this.noeuds[b]] = [this.noeuds[b]!, this.noeuds[a]!];
    [this.prios[a], this.prios[b]] = [this.prios[b]!, this.prios[a]!];
  }
}

const VOISINS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * Cherche un chemin de `depart` jusqu'à une case à moins de `arrivee` de `but`
 * (0 = la case du but elle-même). Renvoie les centres des cases à suivre, ou null.
 */
export function chercherChemin(monde: Monde, depart: Point, but: Point, arrivee = 0, maxNoeuds = 12000): Point[] | null {
  const { largeur, hauteur } = monde.carte;
  const bloque = grille(monde);
  const sx = Math.floor(depart.x);
  const sz = Math.floor(depart.z);
  const bx = Math.floor(but.x);
  const bz = Math.floor(but.z);
  if (sx < 0 || sz < 0 || sx >= largeur || sz >= hauteur) return null;
  const debut = sz * largeur + sx;
  const atteint = (x: number, z: number) =>
    arrivee <= 0 ? x === bx && z === bz : Math.hypot(x + 0.5 - but.x, z + 0.5 - but.z) <= arrivee;
  if (arrivee <= 0 && bloque[bz * largeur + bx] === 1) return null;

  const cout = new Map<number, number>([[debut, 0]]);
  const venant = new Map<number, number>();
  const tas = new Tas();
  const h = (x: number, z: number) => {
    const dx = Math.abs(x - bx);
    const dz = Math.abs(z - bz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  tas.ajouter(debut, h(sx, sz));
  let explores = 0;
  while (tas.taille > 0 && explores < maxNoeuds) {
    const n = tas.retirer();
    explores += 1;
    const x = n % largeur;
    const z = (n - x) / largeur;
    if (atteint(x, z)) {
      const chemin: Point[] = [];
      let c: number | undefined = n;
      while (c !== undefined && c !== debut) {
        const cx = c % largeur;
        chemin.push({ x: cx + 0.5, z: (c - cx) / largeur + 0.5 });
        c = venant.get(c);
      }
      chemin.reverse();
      if (arrivee <= 0 && chemin.length > 0) chemin[chemin.length - 1] = { x: but.x, z: but.z };
      return chemin;
    }
    const base = cout.get(n)!;
    for (const [dx, dz, pas] of VOISINS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= largeur || nz >= hauteur) continue;
      const v = nz * largeur + nx;
      if (bloque[v] === 1 && v !== debut) continue;
      // Pas de diagonale qui coupe un coin d'obstacle.
      if (dx !== 0 && dz !== 0 && (bloque[z * largeur + nx] === 1 || bloque[nz * largeur + x] === 1)) continue;
      const c = base + pas;
      if (c < (cout.get(v) ?? Infinity)) {
        cout.set(v, c);
        venant.set(v, n);
        tas.ajouter(v, c + h(nx, nz));
      }
    }
  }
  return null;
}

/** Avance un personnage le long de son chemin. Renvoie true quand il est arrivé au bout. */
export function suivreChemin(e: Point & { chemin: Point[]; orientation: number }, vitesseParTick: number): boolean {
  let reste = vitesseParTick;
  while (reste > 0 && e.chemin.length > 0) {
    const p = e.chemin[0]!;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001) e.orientation = Math.atan2(dx, dz);
    if (d <= reste) {
      e.x = p.x;
      e.z = p.z;
      e.chemin.shift();
      reste -= d;
    } else {
      e.x += (dx / d) * reste;
      e.z += (dz / d) * reste;
      reste = 0;
    }
  }
  return e.chemin.length === 0;
}
