// Les écrans plein cadre : chargement, titre, scène du crash, défaite, bilan, « À suivre… », pause.
import type { Monde } from "../sim/monde";

export interface Ecrans {
  chargement(fait: number, total: number): void;
  titre(peutContinuer: boolean): Promise<"nouvelle" | "continuer">;
  sousTitre(texte: string | null): void;
  boutonPasser(surClic: (() => void) | null): void;
  defaite(): Promise<void>;
  bilan(monde: Monde): Promise<void>;
  aSuivre(): Promise<void>;
  pauseConseillee(minutes: number, pauseMinutes: number): Promise<void>;
  cacher(): void;
}

export function creerEcrans(racine: HTMLElement): Ecrans {
  racine.innerHTML = `<div class="ecran cache"></div><div class="sous-titre cache"></div><button type="button" class="passer cache">Passer ▶</button>`;
  const ecran = racine.querySelector<HTMLElement>(".ecran")!;
  const sousTitre = racine.querySelector<HTMLElement>(".sous-titre")!;
  const passer = racine.querySelector<HTMLButtonElement>(".passer")!;

  function montrer(classe: string, html: string): void {
    ecran.className = `ecran ${classe}`;
    ecran.innerHTML = html;
  }

  function attendreBouton(selecteur: string): Promise<string> {
    return new Promise((ok) => {
      const surClic = (e: Event) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>(selecteur);
        if (!b) return;
        ecran.removeEventListener("click", surClic);
        ok(b.dataset.choix ?? "");
      };
      ecran.addEventListener("click", surClic);
    });
  }

  let surPasser: (() => void) | null = null;
  passer.addEventListener("click", () => surPasser?.());

  return {
    chargement(fait, total) {
      if (!ecran.classList.contains("chargement")) {
        montrer("chargement", `<div class="titre-jeu">Vulkara</div><div class="jauge"><div class="plein"></div></div><p>Préparation de la planète…</p>`);
      }
      ecran.querySelector<HTMLElement>(".plein")!.style.width = `${Math.round((100 * fait) / total)}%`;
    },
    async titre(peutContinuer) {
      montrer(
        "titre",
        `<div class="fond" style="background-image:url(images/couverture.jpg)"></div>
        <img class="couverture" src="images/couverture.jpg" alt="Vulkara : le secret de Malkor" />
        <div class="menu">
          <h1>Vulkara<small>le secret de Malkor</small></h1>
          <p class="version">Jeu d'essai : les Terres de l'Aube</p>
          ${peutContinuer ? `<button type="button" class="important" data-choix="continuer">▶ Continuer la partie</button>` : ""}
          <button type="button" class="${peutContinuer ? "" : "important"}" data-choix="nouvelle">✦ Nouvelle partie</button>
          <p class="createur">Un jeu imaginé par Eliot</p>
        </div>`,
      );
      return (await attendreBouton("button[data-choix]")) as "nouvelle" | "continuer";
    },
    sousTitre(texte) {
      sousTitre.classList.toggle("cache", !texte);
      if (texte) {
        sousTitre.textContent = texte;
        sousTitre.classList.remove("apparait");
        void sousTitre.offsetWidth;
        sousTitre.classList.add("apparait");
      }
    },
    boutonPasser(surClic) {
      surPasser = surClic;
      passer.classList.toggle("cache", !surClic);
    },
    async defaite() {
      montrer(
        "defaite",
        `<div class="carte-ecran panneau-verre"><h2>Morris est tombé…</h2>
        <p>Pas de panique : Lumo l'a ramené au dernier moment sauvegardé.</p>
        <button type="button" class="important" data-choix="ok">↺ Reprendre depuis la sauvegarde</button></div>`,
      );
      await attendreBouton("button[data-choix]");
    },
    async bilan(monde) {
      montrer(
        "bilan",
        `<div class="carte-ecran panneau-verre"><h2>Bilan de la partie</h2>
        <ul class="stats">
          <li><span>☀️</span>Jours sur Vulkara<b>${monde.temps.jour}</b></li>
          <li><span>⚔️</span>Monstres vaincus<b>${monde.stats.monstresVaincus}</b></li>
          <li><span>🥕</span>Légumes récoltés<b>${monde.stats.legumesRecoltes}</b></li>
          <li><span>🤖</span>Robots<b>${monde.robots.length}</b></li>
        </ul>
        <button type="button" class="important" data-choix="ok">Continuer ▶</button></div>`,
      );
      await attendreBouton("button[data-choix]");
    },
    async aSuivre() {
      montrer(
        "a-suivre",
        `<p class="signal">Lumo : « Le signal vient de l'autre rive… Quelqu'un est venu ici avant nous. »</p>
        <h1>À suivre…</h1>
        <button type="button" data-choix="ok">Retour à l'écran titre</button>`,
      );
      await attendreBouton("button[data-choix]");
    },
    async pauseConseillee(minutes, pauseMinutes) {
      montrer(
        "pause",
        `<div class="carte-ecran panneau-verre"><img class="portrait" src="images/lumo.jpg" alt="" />
        <h2>Lumo</h2>
        <p>Tu joues depuis ${minutes} minutes. Mes capteurs conseillent une pause de ${pauseMinutes} minutes : yeux, jambes, goûter… Le jeu attend.</p>
        <div class="choix"><button type="button" data-choix="pause">☕ Je fais une pause</button><button type="button" data-choix="continuer">▶ Je continue</button></div></div>`,
      );
      const choix = await attendreBouton("button[data-choix]");
      if (choix === "pause") {
        montrer("pause", `<div class="carte-ecran panneau-verre"><h2>Pause</h2><p>Le jeu t'attend.</p><button type="button" class="important" data-choix="ok">▶ Reprendre</button></div>`);
        await attendreBouton("button[data-choix]");
      }
    },
    cacher() {
      ecran.className = "ecran cache";
      ecran.innerHTML = "";
    },
  };
}
