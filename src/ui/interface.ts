// Interface HTML/CSS posée par-dessus la scène 3D : barres, panneaux, menus et écrans.
// Elle lit le monde pour s'afficher et transmet les ordres du joueur (fonctions de src/sim/commandes).
import { caseSousPixel, dessinerCarte, LEGENDE_CARTE } from "./carte";
import { CONSTRUCTIBLES, estPlacable, NOMS_BATIMENTS, raisonImpossible, type Constructible } from "../sim/batiments";
import * as C from "../sim/commandes";
import { batimentConstruit, type Monde } from "../sim/monde";
import { reglages, type Cout } from "../sim/reglages";
import { NOMS_TRAVAUX } from "../sim/robots";
import { LEGUMES, type Batiment, type Legume, type Robot, type Travail } from "../sim/types";
import { couleurLegume, COULEURS_ROBOTS } from "../render/fabrique";

const ICONES: Record<string, string> = { bois: "🪵", nourriture: "🍎", metal: "⚙️", eclats: "✨" };

const DESCRIPTIONS: Record<Constructible, [string, string]> = {
  potager: ["🥕", "Fait pousser les légumes de Vulkara."],
  atelier: ["🔨", "Fabrique l'épée et répare les robots."],
  palissade: ["🪵", "Protège le camp. La porte se ferme la nuit."],
  cloche: ["🔔", "Sonne si le camp est attaqué quand tu es loin."],
  usine: ["🤖", "Fait grandir les graines-cubes en robots."],
  pont: ["🌉", "Traverse la rivière. Le grand objectif !"],
};

const LEGUMES_INFOS: Record<Legume, [string, string]> = {
  lumirave: ["Lumirave", "Brille la nuit, nourrit peu."],
  croquerouge: ["Croquerouge", "Très nourrissant, rend 1 cœur. Pousse lentement."],
  "bulle-courge": ["Bulle-courge", "Sent mauvais : les grignotins fuient le potager."],
  patatonnerre: ["Patatonnerre", "Donne de la vitesse un moment."],
  givrotte: ["Givrotte", "Garde au frais. Pousse seulement la nuit."],
  "pique-chou": ["Pique-chou", "Ses épines piquent les scarabées. À cueillir par un robot."],
};

const OBJECTIFS: Record<Monde["tutoriel"], string> = {
  marcher: "Clique sur le sol pour faire marcher Morris.",
  caisse: "Ouvre la caisse mystère (clique dessus).",
  travail: "Clique sur KX-7 et donne-lui un travail.",
  potager: "Construis le potager (🔨, 8 🪵).",
  planter: "Clique sur le potager et plante un légume.",
  atelier: "Construis l'atelier (🪵 + ⚙️).",
  epee: "Clique sur l'atelier : fabrique l'épée.",
  palissade: "Construis la palissade autour du camp.",
  pont: "Construis le pont sur la rivière !",
  fini: "Le pont est construit !",
};

function cout(c: Cout): string {
  return Object.entries(c)
    .map(([k, v]) => `<span class="cout">${v} ${ICONES[k] ?? k}</span>`)
    .join(" ");
}

function echapper(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export type Panneau = { type: "robot"; id: number } | { type: "batiment"; id: number } | null;

export interface ActionsInterface {
  /** Un ordre a été donné (pour jouer un son, recentrer la caméra…). */
  ordre(resultat: string | null): void;
  signaler(): void;
  recentrer(): void;
  pause(active: boolean): void;
  /** Déplacer la caméra vers un point (clic sur la carte). */
  regarder(x: number, z: number): void;
  /** Sauvegarder et revenir à l'écran titre. */
  menu(): void;
  /** Le joueur a choisi un bâtiment à poser où il veut : on passe en mode placement. */
  placer(type: Constructible): void;
}

export interface Interface {
  mettreAJour(monde: Monde): void;
  message(texte: string): void;
  lumo(texte: string, important?: boolean): void;
  ouvrir(p: Panneau): void;
  panneau(): Panneau;
  /** Un menu qui met le jeu en pause est ouvert. */
  modalOuverte(): boolean;
  fermerTout(): void;
  etiquettes: HTMLElement;
}

export function creerInterface(racine: HTMLElement, getMonde: () => Monde, actions: ActionsInterface): Interface {
  racine.innerHTML = `
    <section class="hud-morris panneau-verre">
      <img class="portrait" src="images/morris.jpg" alt="" />
      <div>
        <div class="nom">Morris</div>
        <div class="coeurs" aria-label="cœurs"></div>
        <div class="faim"><span>🍖</span><div class="jauge"><div class="plein"></div></div></div>
      </div>
    </section>
    <section class="objectif panneau-verre"><b>Objectif</b><span class="texte"></span></section>
    <header class="barre panneau-verre">
      <span class="ressource" data-r="bois" title="Bois">🪵 <b>0</b></span>
      <span class="ressource" data-r="nourriture" title="Fruits et noisettes">🍎 <b>0</b></span>
      <span class="ressource" data-r="metal" title="Métal">⚙️ <b>0</b></span>
      <span class="ressource" data-r="eclats" title="Éclats lumineux">✨ <b>0</b></span>
      <span class="ressource" data-r="legumes" title="Légumes">🥕 <b>0</b></span>
    </header>
    <section class="horloge panneau-verre">
      <div class="cadran"><div class="astre"></div></div>
      <div class="jour">Jour 1</div>
    </section>
    <section class="lumo panneau-verre cache">
      <img class="portrait" src="images/lumo.jpg" alt="" />
      <p class="texte"></p>
    </section>
    <nav class="actions">
      <button type="button" data-a="construire" title="Construire"><span>🔨</span>Construire</button>
      <button type="button" data-a="manger" title="Manger"><span>🍎</span>Manger</button>
      <button type="button" data-a="tourbillon" title="Tourbillon"><span>🌀</span>Tourbillon<i class="recharge"></i></button>
      <button type="button" data-a="dormir" title="Dormir"><span>⛺</span>Dormir</button>
      <button type="button" data-a="morris" title="Revenir sur Morris"><span>📍</span>Morris</button>
      <button type="button" data-a="carte" title="Voir la carte"><span>🗺️</span>Carte</button>
      <button type="button" data-a="commandes" title="Fiche des commandes"><span>❓</span>Aide</button>
      <button type="button" data-a="menu" title="Sauvegarder et revenir au menu principal"><span>🏠</span>Menu</button>
    </nav>
    <aside class="cote panneau-verre cache"></aside>
    <div class="popover manger-menu panneau-verre cache"></div>
    <div class="etiquettes"></div>
    <div class="message" role="status" aria-live="polite"></div>
    <div class="modale cache"><div class="boite panneau-verre"></div></div>
    <button class="signaler" type="button">Signaler un problème</button>
  `;
  const $ = <T extends HTMLElement>(s: string) => racine.querySelector<T>(s)!;
  const coeurs = $(".coeurs");
  const faim = $(".faim .plein");
  const objectif = $(".objectif .texte");
  const astre = $(".horloge .astre");
  const jour = $(".horloge .jour");
  const bulleLumo = $(".lumo");
  const texteLumo = $(".lumo .texte");
  const cote = $("aside.cote");
  const menuManger = $(".manger-menu");
  const modale = $(".modale");
  const boite = $(".modale .boite");
  const zoneMessage = $(".message");
  const recharge = $(".actions .recharge");
  const etiquettes = $(".etiquettes");

  let panneau: Panneau = null;
  let modalePause = false;

  // ---------- Messages ----------
  let minuterieMessage: number | undefined;
  function message(texte: string): void {
    zoneMessage.textContent = texte;
    zoneMessage.classList.add("visible");
    window.clearTimeout(minuterieMessage);
    minuterieMessage = window.setTimeout(() => zoneMessage.classList.remove("visible"), 3500);
  }

  // Lumo parle : une file de messages, chacun reste affiché assez longtemps pour être lu.
  const file: Array<{ texte: string; important: boolean }> = [];
  let finAffichage = 0;
  function lumo(texte: string, important = false): void {
    if (file.some((f) => f.texte === texte) || texteLumo.textContent === texte) return;
    file.push({ texte, important });
    if (file.length > 4) file.splice(0, file.length - 4);
  }
  function avancerLumo(): void {
    const maintenant = performance.now();
    if (file.length > 0 && maintenant > finAffichage - (file[0]!.important ? 0 : 1500)) {
      const f = file.shift()!;
      texteLumo.textContent = f.texte;
      bulleLumo.classList.remove("cache");
      bulleLumo.classList.toggle("important", f.important);
      bulleLumo.classList.remove("apparait");
      void bulleLumo.offsetWidth;
      bulleLumo.classList.add("apparait");
      finAffichage = maintenant + Math.max(5000, f.texte.length * 70);
    } else if (file.length === 0 && maintenant > finAffichage + 4000) {
      bulleLumo.classList.add("cache");
    }
  }

  // ---------- Ordres ----------
  function faire(r: string | null): void {
    if (r) message(r);
    actions.ordre(r);
    rafraichirCote(true);
  }

  $(".actions").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-a]");
    if (!b) return;
    const monde = getMonde();
    switch (b.dataset.a) {
      case "construire":
        ouvrirCatalogue();
        break;
      case "manger":
        menuManger.classList.toggle("cache");
        remplirManger(monde);
        break;
      case "tourbillon":
        faire(C.tourbillon(monde));
        break;
      case "dormir":
        faire(C.dormir(monde));
        break;
      case "morris":
        actions.recentrer();
        break;
      case "menu":
        actions.menu();
        break;
      case "carte":
        ouvrirCarte();
        break;
      case "commandes":
        ouvrirCommandes();
        break;
    }
  });
  racine.querySelector(".signaler")!.addEventListener("click", () => actions.signaler());

  function remplirManger(monde: Monde): void {
    const lignes = [
      `<button type="button" data-repas="nourriture" ${monde.ressources.nourriture <= 0 ? "disabled" : ""}>🍎 Fruits et noisettes <b>${monde.ressources.nourriture}</b></button>`,
      ...LEGUMES.filter((l) => monde.legumes[l] > 0).map(
        (l) => `<button type="button" data-repas="${l}"><i class="pastille" style="background:${couleurLegume(l)}"></i>${LEGUMES_INFOS[l][0]} <b>${monde.legumes[l]}</b></button>`,
      ),
    ];
    menuManger.innerHTML = `<h3>Manger</h3>${lignes.join("")}`;
  }
  menuManger.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-repas]");
    if (!b) return;
    faire(C.manger(getMonde(), b.dataset.repas as C.Repas));
    remplirManger(getMonde());
  });

  // ---------- Modales (mettent le jeu en pause) ----------
  function ouvrirModale(html: string, pause = true): void {
    boite.innerHTML = html;
    modale.classList.remove("cache");
    modalePause = pause;
    actions.pause(pause);
  }
  function fermerModale(): void {
    modale.classList.add("cache");
    modalePause = false;
    actions.pause(false);
  }
  modale.addEventListener("click", (e) => {
    const cible = e.target as HTMLElement;
    if (cible === modale || cible.closest("[data-fermer]")) fermerModale();
    const b = cible.closest<HTMLButtonElement>("button[data-construire]");
    if (b) {
      const type = b.dataset.construire as Constructible;
      const raison = raisonImpossible(getMonde(), type);
      if (!raison && estPlacable(type)) {
        fermerModale();
        actions.placer(type);
        return;
      }
      const r = C.construire(getMonde(), type);
      if (!r) fermerModale();
      faire(r);
    }
  });

  function ouvrirCatalogue(): void {
    const monde = getMonde();
    const cartes = CONSTRUCTIBLES.map((t) => {
      const raison = raisonImpossible(monde, t);
      const fait = monde.batiments.some((b) => b.type === t);
      const [icone, desc] = DESCRIPTIONS[t];
      return `<button type="button" class="carte" data-construire="${t}" ${raison ? "disabled" : ""}>
        <span class="icone">${icone}</span>
        <b>${NOMS_BATIMENTS[t].replace(/^(le |la |l')/, "").replace(/^./, (c) => c.toUpperCase())}</b>
        <span class="desc">${desc}</span>
        <span class="prix">${fait ? "✔️ Déjà là" : cout(reglages.batiments[t].cout)}</span>
        ${raison && !fait ? `<span class="raison">${echapper(raison)}</span>` : ""}
      </button>`;
    }).join("");
    ouvrirModale(`<h2>Construire</h2><div class="catalogue">${cartes}</div><button type="button" class="fermer" data-fermer>Fermer</button>`);
  }

  function ouvrirCarte(): void {
    const monde = getMonde();
    const legende = LEGENDE_CARTE.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join("");
    ouvrirModale(`<h2>La carte</h2>
      <canvas class="carte-monde" aria-label="Carte de Vulkara"></canvas>
      <div class="legende-carte">${legende}</div>
      <p class="petit">Clique sur la carte pour y regarder.</p>
      <button type="button" class="fermer" data-fermer>Fermer</button>`);
    const canvas = boite.querySelector<HTMLCanvasElement>(".carte-monde")!;
    dessinerCarte(canvas, monde);
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      const p = caseSousPixel(monde, ((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height);
      if (p.x < 0 || p.z < 0 || p.x > monde.carte.largeur || p.z > monde.carte.hauteur) return;
      fermerModale();
      actions.regarder(p.x, p.z);
    });
  }

  function ouvrirCommandes(): void {
    ouvrirModale(`<h2>Les commandes</h2>
      <ul class="fiche">
        <li><b>Clic sur le sol</b> : Morris marche.</li>
        <li><b>Clic sur un monstre</b> : Morris l'attaque tout seul.</li>
        <li><b>🌀 Tourbillon</b> : frappe tous les monstres autour. Il faut attendre qu'il se recharge.</li>
        <li><b>Clic sur un robot</b> : choisir son travail.</li>
        <li><b>Clic sur un bâtiment</b> : l'utiliser (potager, atelier, usine, tente).</li>
        <li><b>🔨 Construire</b>, <b>🍎 Manger</b>, <b>⛺ Dormir</b> (au camp).</li>
        <li><b>Molette</b> : zoomer. <b>Souris au bord de l'écran</b> ou <b>flèches</b> : regarder plus loin.</li>
        <li><b>📍 Morris</b> : revenir sur Morris.</li>
      </ul>
      <button type="button" class="fermer" data-fermer>J'ai compris</button>`);
  }

  // ---------- Panneau de côté : robot ou bâtiment choisi ----------
  let signatureCote = "";
  function ouvrir(p: Panneau): void {
    panneau = p;
    signatureCote = "";
    menuManger.classList.add("cache");
    rafraichirCote(true);
  }

  function htmlRobot(monde: Monde, r: Robot, numero: number): string {
    const ETATS: Record<Robot["etat"], string> = {
      attend: "attend",
      va: "y va",
      recolte: "travaille",
      rapporte: "rapporte au camp",
      rentre: "rentre pour la nuit",
      casse: "cassé !",
    };
    const travaux = (Object.keys(NOMS_TRAVAUX) as Travail[])
      .map((t) => `<button type="button" data-travail="${t}" class="${r.travail === t ? "actif" : ""}" ${r.etat === "casse" ? "disabled" : ""}>${NOMS_TRAVAUX[t]}</button>`)
      .join("");
    const atelier = batimentConstruit(monde, "atelier");
    return `<h3><i class="pastille" style="background:${COULEURS_ROBOTS[numero % 5]}"></i>${r.nom}</h3>
      <p class="etat">${ETATS[r.etat]}</p>
      ${r.etat === "casse" ? `<button type="button" class="important" data-reparer="${r.id}" ${atelier ? "" : "disabled"}>Réparer (${reglages.robots.reparationEclats} ✨)${atelier ? "" : " – il faut l'atelier"}</button>` : ""}
      <h4>Son travail</h4><div class="liste">${travaux}</div>
      <h4>La nuit</h4>
      <div class="choix">
        <button type="button" data-nuit="1" class="${r.rentrerLaNuit ? "actif" : ""}">🏠 Rentrer au camp</button>
        <button type="button" data-nuit="0" class="${r.rentrerLaNuit ? "" : "actif"}">🌙 Rester dehors</button>
      </div>`;
  }

  function htmlBatiment(monde: Monde, b: Batiment): string {
    const nom = NOMS_BATIMENTS[b.type].replace(/^(le |la |l')/, "").replace(/^./, (c) => c.toUpperCase());
    if (!b.construit && b.type !== "tente") {
      const total = reglages.batiments[b.type].travail;
      const pc = Math.floor((100 * b.travailFait) / total);
      return `<h3>${nom}</h3><p>En construction : ${pc} %</p><div class="jauge"><div class="plein" style="width:${pc}%"></div></div>
        <button type="button" data-aider="${b.id}">🔨 Aider à construire</button>
        <p class="petit">Astuce : un robot avec le travail « Aider à construire » va plus vite à deux.</p>`;
    }
    switch (b.type) {
      case "tente":
        return `<h3>La tente</h3><p>Dormir rend tous les cœurs.</p><button type="button" data-dormir>⛺ Dormir</button>
          <p class="petit">Réserve du camp : ${monde.ressources.bois} 🪵 · ${monde.ressources.nourriture} 🍎 · ${monde.ressources.metal} ⚙️</p>`;
      case "potager": {
        const parcelles = (b.parcelles ?? [])
          .map((p, i) => {
            if (!p.legume) return `<div class="parcelle vide"><span>Parcelle ${i + 1}</span><button type="button" data-choisir="${i}">🌱 Planter</button></div>`;
            const [n] = LEGUMES_INFOS[p.legume];
            const mur = p.pousse >= 1;
            return `<div class="parcelle"><span><i class="pastille" style="background:${couleurLegume(p.legume)}"></i>${n}</span>
              <div class="jauge"><div class="plein" style="width:${Math.floor(p.pousse * 100)}%"></div></div>
              ${mur ? `<button type="button" class="important" data-recolter="${i}">Récolter</button>` : `<button type="button" data-choisir="${i}">Changer</button>`}</div>`;
          })
          .join("");
        return `<h3>Le potager</h3><div class="parcelles">${parcelles}</div>
          <p class="petit">Un robot avec « S'occuper du potager » récolte et replante tout seul.</p>`;
      }
      case "atelier": {
        const casses = monde.robots.filter((r) => r.etat === "casse");
        return `<h3>L'atelier</h3>
          ${monde.morris.arme === "epee" ? "<p>✔️ Morris a son épée.</p>" : `<button type="button" class="important" data-epee>⚔️ Fabriquer l'épée (${cout(reglages.epee.cout)})</button>`}
          <h4>Robots cassés</h4>
          ${casses.length === 0 ? "<p>Aucun. Tant mieux !</p>" : casses.map((r) => `<button type="button" data-reparer="${r.id}">🔧 Réparer ${r.nom} (${reglages.robots.reparationEclats} ✨)</button>`).join("")}`;
      }
      case "usine":
        return `<h3>L'usine à robots</h3>
          <p>Graines-cubes : <b>${monde.grainesRestantes}</b> · Robots : <b>${monde.robots.length} / ${reglages.robots.maximum}</b></p>
          <button type="button" class="important" data-nouveau ${monde.grainesRestantes <= 0 || monde.robots.length >= reglages.robots.maximum ? "disabled" : ""}>🤖 Faire grandir un robot (${cout(reglages.robots.coutNouveauRobot)})</button>`;
      case "palissade": {
        const max = reglages.batiments.palissade.pvSegment;
        const abimes = (b.segments ?? []).filter((v) => v < max).length;
        return `<h3>La palissade</h3><p>${abimes === 0 ? "Tout est solide." : `${abimes} morceau${abimes > 1 ? "x" : ""} abîmé${abimes > 1 ? "s" : ""}.`}</p>
          <p class="petit">Pour réparer : choisis un robot et donne-lui « Réparer la palissade ». Il faut du bois.</p>`;
      }
      case "cloche":
        return `<h3>La cloche d'alarme</h3><p>Elle sonne quand le camp est attaqué et que Morris est loin.</p>`;
      case "pont":
        return `<h3>Le pont</h3><p>Il traverse la rivière. Lumo capte un signal de l'autre côté…</p>`;
    }
  }

  function rafraichirCote(force = false): void {
    const monde = getMonde();
    if (!panneau) {
      cote.classList.add("cache");
      return;
    }
    let html = "";
    if (panneau.type === "robot") {
      const id = panneau.id;
      const i = monde.robots.findIndex((r) => r.id === id);
      const r = monde.robots[i];
      if (!r) {
        panneau = null;
        return rafraichirCote();
      }
      html = htmlRobot(monde, r, i);
    } else {
      const id = panneau.id;
      const b = monde.batiments.find((x) => x.id === id);
      if (!b) {
        panneau = null;
        return rafraichirCote();
      }
      html = htmlBatiment(monde, b);
    }
    // On ne redessine que si quelque chose a changé (sinon les boutons clignotent),
    // et pas pendant que le joueur choisit un légume à planter.
    if (!force && html === signatureCote) return;
    if (!force && (cote.querySelector(".sous-choix")?.childElementCount ?? 0) > 0) return;
    signatureCote = html;
    cote.innerHTML = `<button type="button" class="croix" data-fermer-cote aria-label="Fermer">✕</button>${html}<div class="sous-choix"></div>`;
    cote.classList.remove("cache");
  }

  cote.addEventListener("click", (e) => {
    const c = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!c) return;
    const monde = getMonde();
    const d = c.dataset;
    if ("fermerCote" in d) ouvrir(null);
    else if (d.travail && panneau?.type === "robot") faire(C.choisirTravail(monde, panneau.id, d.travail as Travail));
    else if (d.nuit && panneau?.type === "robot") faire(C.choisirNuit(monde, panneau.id, d.nuit === "1"));
    else if (d.reparer) faire(C.reparerRobot(monde, Number(d.reparer)));
    else if (d.aider) faire(C.aiderAConstruire(monde, Number(d.aider)));
    else if ("dormir" in d) faire(C.dormir(monde));
    else if ("epee" in d) faire(C.fabriquerEpee(monde));
    else if ("nouveau" in d) faire(C.nouveauRobot(monde));
    else if (d.recolter) faire(C.recolterParcelle(monde, Number(d.recolter)));
    else if (d.choisir) {
      const i = Number(d.choisir);
      const sous = cote.querySelector<HTMLElement>(".sous-choix")!;
      sous.innerHTML = `<h4>Planter dans la parcelle ${i + 1}</h4>${LEGUMES.map(
        (l) => `<button type="button" data-planter="${l}" data-parcelle="${i}"><i class="pastille" style="background:${couleurLegume(l)}"></i><b>${LEGUMES_INFOS[l][0]}</b> <span class="petit">${LEGUMES_INFOS[l][1]}</span></button>`,
      ).join("")}`;
      return;
    } else if (d.planter) faire(C.planter(monde, Number(d.parcelle), d.planter as Legume));
  });

  // ---------- Mise à jour à chaque image ----------
  let derniereMaj = 0;
  function mettreAJour(monde: Monde): void {
    avancerLumo();
    const maintenant = performance.now();
    if (maintenant - derniereMaj < 100) return; // 10 fois par seconde suffit
    derniereMaj = maintenant;
    const m = monde.morris;
    // Cœurs (en demi-cœurs).
    let h = "";
    for (let i = 0; i < m.pvMax / 2; i += 1) {
      const reste = m.pv - i * 2;
      h += `<i class="coeur ${reste >= 2 ? "plein" : reste === 1 ? "moitie" : "vide"}"></i>`;
    }
    if (coeurs.innerHTML !== h) coeurs.innerHTML = h;
    faim.style.width = `${m.faim}%`;
    faim.classList.toggle("bas", m.faim < reglages.morris.faimAlerte);
    for (const k of ["bois", "nourriture", "metal", "eclats"] as const) {
      racine.querySelector(`[data-r="${k}"] b`)!.textContent = String(monde.ressources[k]);
    }
    racine.querySelector('[data-r="legumes"] b')!.textContent = String(LEGUMES.reduce((s, l) => s + monde.legumes[l], 0));
    objectif.textContent = OBJECTIFS[monde.tutoriel];
    // Soleil-lune : l'astre fait le tour du cadran pendant la journée.
    const J = reglages.journee;
    const t = monde.temps.seconde / (J.dureeJour + J.dureeNuit);
    astre.style.transform = `rotate(${t * 360}deg)`;
    astre.textContent = monde.temps.nuit ? "🌙" : "☀️";
    jour.textContent = `Jour ${monde.temps.jour}${monde.temps.nuit ? " · nuit" : ""}`;
    racine.classList.toggle("nuit", monde.temps.nuit);
    const charge = 1 - m.rechargeTourbillon / (reglages.morris.tourbillonRecharge * reglages.simulation.ticksParSeconde);
    recharge.style.height = `${(1 - charge) * 100}%`;
    $('[data-a="tourbillon"]').classList.toggle("pret", m.rechargeTourbillon <= 0);
    rafraichirCote();
  }

  return {
    mettreAJour,
    message,
    lumo,
    ouvrir,
    panneau: () => panneau,
    modalOuverte: () => modalePause,
    fermerTout() {
      ouvrir(null);
      menuManger.classList.add("cache");
      if (!modale.classList.contains("cache")) fermerModale();
    },
    etiquettes,
  };
}
