import type { Monde } from "../sim/monde";

/** Interface HTML/CSS posée par-dessus la scène 3D. */
export interface Interface {
  mettreAJour(monde: Monde): void;
  message(texte: string): void;
}

export function creerInterface(racine: HTMLElement, onSignaler: () => void): Interface {
  racine.innerHTML = `
    <header class="barre">
      <span class="titre">Vulkara</span>
      <span class="ressource" data-r="bois">Bois <b>0</b></span>
      <span class="ressource" data-r="nourriture">Nourriture <b>0</b></span>
    </header>
    <button class="signaler" type="button">Signaler un problème</button>
    <div class="message" role="status" aria-live="polite"></div>
  `;
  const bois = racine.querySelector<HTMLElement>('[data-r="bois"] b')!;
  const nourriture = racine.querySelector<HTMLElement>('[data-r="nourriture"] b')!;
  const zoneMessage = racine.querySelector<HTMLElement>(".message")!;
  racine.querySelector<HTMLButtonElement>(".signaler")!.addEventListener("click", onSignaler);

  let minuterie: number | undefined;
  return {
    mettreAJour(monde) {
      bois.textContent = String(monde.ressources.bois);
      nourriture.textContent = String(monde.ressources.nourriture);
    },
    message(texte) {
      zoneMessage.textContent = texte;
      zoneMessage.classList.add("visible");
      window.clearTimeout(minuterie);
      minuterie = window.setTimeout(() => zoneMessage.classList.remove("visible"), 4000);
    },
  };
}
