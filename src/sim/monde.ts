import type { Reglages, Ressources } from "./reglages";

/**
 * État complet de la partie. La simulation ne dépend pas de Babylon.js :
 * elle se teste seule, et la sauvegarde consiste à enregistrer cet objet.
 */
export interface Monde {
  tick: number;
  ressources: Ressources;
  carte: { largeur: number; hauteur: number };
}

export function creerMonde(r: Reglages): Monde {
  return {
    tick: 0,
    ressources: { ...r.ressourcesDeDepart },
    carte: { largeur: r.carte.largeurCases, hauteur: r.carte.hauteurCases },
  };
}

/** Avance la simulation d'un pas de temps fixe. */
export function avancer(monde: Monde): void {
  monde.tick += 1;
}

/**
 * Accumulateur à pas fixe : appelle `avancer` autant de fois que nécessaire
 * pour le temps écoulé, quelle que soit la vitesse d'affichage.
 */
export class Horloge {
  private reste = 0;
  private readonly pas: number;

  constructor(ticksParSeconde: number) {
    this.pas = 1000 / ticksParSeconde;
  }

  /** Renvoie le nombre de pas effectués. Limité pour éviter l'emballement après une pause. */
  ecouler(monde: Monde, millisecondes: number, maxPas = 10): number {
    this.reste += millisecondes;
    let pas = 0;
    while (this.reste >= this.pas && pas < maxPas) {
      avancer(monde);
      this.reste -= this.pas;
      pas += 1;
    }
    if (pas === maxPas) this.reste = 0;
    return pas;
  }
}
