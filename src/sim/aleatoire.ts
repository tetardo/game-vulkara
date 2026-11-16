/** Hasard reproductible (mulberry32) : la même graine donne toujours la même carte. */
export class Aleatoire {
  constructor(private etat: number) {}

  suivant(): number {
    this.etat = (this.etat + 0x6d2b79f5) | 0;
    let t = this.etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  entre(min: number, max: number): number {
    return min + (max - min) * this.suivant();
  }

  entier(min: number, maxInclus: number): number {
    return Math.floor(this.entre(min, maxInclus + 1));
  }

  get graine(): number {
    return this.etat;
  }
}
