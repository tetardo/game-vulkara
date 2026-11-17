// Interface HTML/CSS posée par-dessus la scène 3D : barres, panneaux, menus et écrans.
// Elle lit le monde pour s'afficher et transmet les ordres du joueur (fonctions de src/sim/commandes).
import { caseSousPixel, dessinerCarte, LEGENDE_CARTE, vueDecouverte, type VueCarte } from "./carte";
import { CONSTRUCTIBLES, estMorceauDeMur, estPlacable, NOMS_BATIMENTS, maximumDe, raisonImpossible, remboursementDemolition, type Constructible,
  effetNiveau, estAmeliorable, niveauDe, NIVEAU_MAX, nourritureAbritee, prixAmelioration, prixNouveauRobot, prixReparation, pvMaxMur, rayonLanterne } from "../sim/batiments";
import * as C from "../sim/commandes";
import { ENIGMES } from "../sim/coffres";
import { LIEUX } from "../sim/carte";
import { batimentConstruit, type Monde } from "../sim/monde";
import { reglages, type Cout } from "../sim/reglages";
import { NOMS_TRAVAUX } from "../sim/robots";
import { portee as porteeTour } from "../sim/tours";
import { LEGUMES, type Batiment, type Legume, type Robot, type Travail, type TypeBatiment } from "../sim/types";
import { couleurLegume, COULEURS_ROBOTS } from "../render/fabrique";
import { reglagesSon, sons } from "./son";
import { GROUPES_TRAVAUX, icone, PICTOS, PICTOS_ACTIONS, PICTOS_MENU, TRAVAIL_COURT } from "./icones";

const ICONES: Record<string, string> = { bois: "🪵", nourriture: "🍎", metal: "⚙️", eclats: "✨" };

const DESCRIPTIONS: Record<Constructible, [string, string]> = {
  potager: ["🥕", "Fait pousser les légumes de Vulkara."],
  atelier: ["🔨", "Fabrique l'épée et répare les robots."],
  palissade: ["🪵", "Trace des murs : clique le début, puis la fin. Les monstres tapent dedans."],
  porte: ["🚪", "À mettre dans un mur : Morris et les robots passent, pas les monstres."],
  cloche: ["🔔", "Sonne si le camp est attaqué quand tu es loin."],
  usine: ["🤖", "Fabrique des graines-cubes et les fait grandir en robots."],
  pont: ["🌉", "Traverse la rivière. Le grand objectif !"],
  grenier: ["🏚️", "Dépôt des fruits et noisettes. Une partie de la nourriture est à l'abri des grignotins."],
  lanterne: ["💡", "La nuit, les grignotins ont peur de sa lumière et s'enfuient."],
  station: ["🔋", "Les robots abîmés qui passent à côté se réparent vite."],
  piege: ["🪤", "Attrape un grignotin qui marche dessus. Il rend ce qu'il a volé."],
  tour: ["🗼", "Voit loin, tire toute seule sur les monstres proches et sonne l'alarme."],
  scierie: ["🪚", "Dépôt du bois : pose-la près de la forêt, les robots bûcherons y rapportent le bois."],
  ferme: ["🌾", "Dépôt des légumes : les robots jardiniers y rangent la récolte du potager."],
  fonderie: ["🔥", "Dépôt du métal : pose-la près des rochers à minerai, les robots mineurs y apportent le minerai."],
};

/** Les onglets du menu Construire. */
const CATEGORIES: { nom: string; icone: string; types: Constructible[] }[] = [
  { nom: "Camp", icone: "🏕️", types: ["potager", "scierie", "grenier", "ferme", "fonderie"] },
  { nom: "Robots", icone: "🤖", types: ["atelier", "usine", "station"] },
  { nom: "Défense", icone: "🛡️", types: ["palissade", "porte", "tour", "cloche", "lanterne", "piege"] },
  { nom: "Aventure", icone: "🧭", types: ["pont"] },
];

const LEGUMES_INFOS: Record<Legume, [string, string]> = {
  lumirave: ["Lumirave", "Brille la nuit, nourrit peu."],
  croquerouge: ["Croquerouge", "Très nourrissant, rend 1 cœur. Pousse lentement."],
  "bulle-courge": ["Bulle-courge", "Sent mauvais : les grignotins fuient le potager."],
  patatonnerre: ["Patatonnerre", "Donne de la vitesse un moment."],
  givrotte: ["Givrotte", "Garde au frais. Pousse seulement la nuit."],
  "pique-chou": ["Pique-chou", "Ses épines piquent les scarabées. À cueillir par un robot."],
};

const OBJECTIFS: Record<Monde["tutoriel"], string> = {
  marcher: "Morris est choisi (anneau jaune) : clique sur le sol pour le faire marcher.",
  caisse: "Ouvre la caisse mystère (clique dessus).",
  travail: "Clique sur KX-7 et donne-lui un travail.",
  potager: "Construis le potager (🔨, 8 🪵).",
  planter: "Clique sur le potager et plante un légume.",
  atelier: "Construis l'atelier (🪵 + ⚙️).",
  epee: "Clique sur l'atelier : fabrique l'épée.",
  palissade: "Trace une palissade autour du camp, avec une porte.",
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

const ETATS: Record<Robot["etat"], string> = {
  attend: "attend",
  va: "y va",
  recolte: "travaille",
  rapporte: "rapporte au camp",
  rentre: "rentre pour la nuit",
  casse: "cassé !",
  combat: "se bat !",
};

export type Panneau =
  | { type: "robot"; id: number }
  | { type: "robots"; ids: number[] }
  | { type: "batiment"; id: number }
  | null;

/** Les robots choisis par le joueur (un seul, plusieurs, ou aucun). */
export function robotsDuPanneau(p: Panneau): number[] {
  if (p?.type === "robot") return [p.id];
  if (p?.type === "robots") return p.ids;
  return [];
}

/** Le panneau qui correspond à une liste de robots choisis. */
export function panneauDesRobots(ids: number[]): Panneau {
  if (ids.length === 0) return null;
  if (ids.length === 1) return { type: "robot", id: ids[0]! };
  return { type: "robots", ids };
}

export interface ActionsInterface {
  /** Un ordre a été donné (pour jouer un son, recentrer la caméra…). */
  ordre(resultat: string | null): void;
  signaler(): void;
  recentrer(): void;
  pause(active: boolean): void;
  /** Déplacer la caméra vers un point (clic sur la carte). */
  regarder(x: number, z: number): void;
  /** Le point que regarde la caméra (centre de la petite carte). */
  centreVue(): { x: number; z: number };
  /** Sauvegarder et revenir à l'écran titre. */
  menu(): void;
  /** Sauvegarder tout de suite (bouton du menu). */
  sauvegarder(): void;
  /** Le joueur a cliqué un robot dans la liste : on le choisit et la caméra va sur lui. */
  choisirRobot(id: number): void;
  /** Bouton « Tous » : choisir ces robots (et plus Morris). */
  choisirRobots(ids: number[]): void;
  /** Le joueur a choisi un bâtiment à poser où il veut : on passe en mode placement. */
  placer(type: Constructible): void;
}

export interface Interface {
  /** Bulle qui suit la souris : ce que les robots choisis feront si on clique (null : la cacher). */
  bulleOrdre(texte: string | null, x: number, y: number): void;
  mettreAJour(monde: Monde): void;
  message(texte: string): void;
  lumo(texte: string, important?: boolean): void;
  ouvrir(p: Panneau): void;
  panneau(): Panneau;
  /** Un menu qui met le jeu en pause est ouvert. */
  modalOuverte(): boolean;
  fermerTout(): void;
  etiquettes: HTMLElement;
  /** Raccourci clavier : renvoie true s'il a servi. */
  raccourci(touche: string): boolean;
  /** Flèche d'alerte au bord de l'écran (position en pixels, angle en radians), ou null pour la cacher. */
  alerteCamp(p: { x: number; y: number; angle: number } | null): void;
  /** Un nombre qui s'envole (+3 🪵) à cet endroit de l'écran. */
  nombreVolant(x: number, y: number, texte: string): void;
  /** Morris est devant un coffre : afficher son énigme (le jeu est en pause pendant qu'on réfléchit). */
  enigme(coffreId: number): void;
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
    <div class="colonne-gauche">
      <section class="objectif panneau-verre"><b>Objectif</b><span class="texte"></span></section>
      <section class="liste-robots panneau-verre cache">
        <div class="titre-liste"><b>Mes robots</b><button type="button" class="tous" data-tous title="Choisir tous les robots">Tous</button></div>
        <div class="lignes"></div>
      </section>
    </div>
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
      <button type="button" data-a="construire" title="Construire">${icone(PICTOS_ACTIONS.construire)}Construire</button>
      <button type="button" data-a="manger" title="Manger">${icone(PICTOS_ACTIONS.manger)}Manger</button>
      <button type="button" data-a="tourbillon" title="Tourbillon">${icone(PICTOS_ACTIONS.tourbillon)}Tourbillon<i class="recharge"></i></button>
      <button type="button" data-a="dormir" title="Dormir">${icone(PICTOS_ACTIONS.dormir)}Dormir</button>
      <button type="button" data-a="morris" title="Revenir sur Morris">${icone(PICTOS_ACTIONS.morris)}Morris</button>
      <button type="button" data-a="menu" title="Aide, sauvegarder, menu principal">${icone(PICTOS_ACTIONS.menu)}Menu</button>
    </nav>
    <aside class="cote panneau-verre cache"></aside>
    <section class="mini-carte panneau-verre">
      <canvas aria-label="Mini-carte : clique pour regarder là"></canvas>
      <button type="button" class="agrandir" data-a-carte title="Grande carte (C)" aria-label="Grande carte">⤢</button>
    </section>
    <button type="button" class="alerte-camp cache" title="Le camp est attaqué : clique pour y aller" aria-label="Le camp est attaqué">⚠️</button>
    <div class="popover manger-menu panneau-verre cache"></div>
    <div class="sous-menu-construire panneau-verre cache"></div>
    <div class="bulle-info panneau-verre cache" role="tooltip"></div>
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
  const listeRobots = $(".liste-robots");
  const lignesRobots = $(".liste-robots .lignes");
  const menuManger = $(".manger-menu");
  const modale = $(".modale");
  const boite = $(".modale .boite");
  const zoneMessage = $(".message");
  const recharge = $(".actions .recharge");
  const etiquettes = $(".etiquettes");

  let panneau: Panneau = null;
  /** Bâtiment dont on attend le 2e clic sur « Démolir ». */
  let aConfirmer: number | null = null;
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
        basculerConstruire();
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
        ouvrirMenuJeu();
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
  function ouvrirMenuJeu(): void {
    ouvrirModale(`<div class="menu-jeu">
      <h2>Menu</h2>
      <button type="button" data-menu="pause">${icone(PICTOS_MENU.pause)}Mettre le jeu en pause</button>
      <button type="button" data-menu="aide">${icone(PICTOS_MENU.aide)}Aide : les commandes</button>
      <button type="button" data-menu="sauver">${icone(PICTOS_MENU.sauver)}Sauvegarder</button>
      <button type="button" data-menu="audio">${icone(PICTOS_MENU.audio)}Réglages audio</button>
      <button type="button" data-menu="principal">${icone(PICTOS_MENU.principal)}Retour au menu principal</button>
      <p class="petit">La partie est aussi sauvegardée toute seule de temps en temps.</p>
      <button type="button" class="fermer" data-fermer>${icone(PICTOS_MENU.reprendre)}Reprendre le jeu</button>
    </div>`);
  }

  /** Écran de pause : tout est figé (jour, nuit, monstres, robots) jusqu'à « Reprendre ». */
  function ouvrirPause(): void {
    ouvrirModale(`<div class="menu-jeu ecran-pause">
      <div class="grande-icone">${icone(PICTOS_MENU.pause)}</div>
      <h2>Le jeu est en pause</h2>
      <p>Rien ne bouge tant que tu n'as pas repris.</p>
      <button type="button" data-menu="reprendre-pause" data-fermer>${icone(PICTOS_MENU.reprendre)}Reprendre le jeu</button>
    </div>`);
  }

  function ouvrirReglagesAudio(): void {
    const v = reglagesSon.volumes();
    const curseur = (quoi: "musique" | "bruits", icone: string, nom: string) =>
      `<label class="volume"><span>${icone} ${nom}</span>
        <input type="range" min="0" max="100" step="5" value="${Math.round(v[quoi] * 100)}" data-volume="${quoi}" aria-label="Volume ${nom.toLowerCase()}" /></label>`;
    ouvrirModale(`<div class="menu-jeu">
      <h2>Réglages audio</h2>
      <div class="volumes">${curseur("musique", "🎵", "Musique")}${curseur("bruits", "🔊", "Bruits")}</div>
      <button type="button" class="fermer" data-menu="retour">${icone(PICTOS_MENU.retour)}Retour au menu</button>
    </div>`);
  }

  modale.addEventListener("input", (e) => {
    const c = e.target as HTMLInputElement;
    const quoi = c.dataset.volume;
    if (quoi === "musique" || quoi === "bruits") reglagesSon.regler(quoi, Number(c.value) / 100);
  });
  // Quand on lâche le curseur des bruits, un petit son pour entendre le nouveau volume.
  modale.addEventListener("change", (e) => {
    if ((e.target as HTMLInputElement).dataset.volume === "bruits") sons.clic();
  });

  // Petits sons de l'interface : survol et clic sur les boutons.
  let dernierSurvole: Element | null = null;
  racine.addEventListener("pointerover", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b && b !== dernierSurvole && !b.disabled) sons.survol();
    dernierSurvole = b;
  });
  racine.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b && !b.disabled) sons.clic();
  });

  // ---------- Énigme d'un coffre au trésor ----------
  function ouvrirEnigme(coffreId: number): void {
    const coffre = getMonde().coffres.find((c) => c.id === coffreId);
    const enigme = coffre ? ENIGMES[coffre.enigme] : undefined;
    if (!coffre || !enigme) return;
    const boutons = enigme.reponses
      .map((r, i) => `<button type="button" data-reponse="${i}" data-coffre="${coffreId}">${["A", "B", "C"][i]}. ${r}</button>`)
      .join("");
    ouvrirModale(`<div class="menu-jeu enigme">
      <h2>🗝️ L'énigme du coffre</h2>
      <p class="question">${enigme.question}</p>
      <div class="reponses">${boutons}</div>
      <button type="button" class="fermer" data-fermer>Je réfléchis et je reviens plus tard</button>
    </div>`);
  }

  modale.addEventListener("click", (e) => {
    const cible = e.target as HTMLElement;
    const reponse = cible.closest<HTMLButtonElement>("button[data-reponse]");
    if (reponse) {
      fermerModale();
      faire(C.repondreEnigme(getMonde(), Number(reponse.dataset.coffre), Number(reponse.dataset.reponse)));
      return;
    }
    // En pause, un clic à côté ne relance pas le jeu : il faut le bouton « Reprendre ».
    const enPause = boite.querySelector(".ecran-pause") !== null;
    if ((cible === modale && !enPause) || cible.closest("[data-fermer]")) fermerModale();
    const choix = cible.closest<HTMLButtonElement>("button[data-menu]")?.dataset.menu;
    if (choix === "pause") ouvrirPause();
    else if (choix === "aide") ouvrirCommandes();
    else if (choix === "audio") ouvrirReglagesAudio();
    else if (choix === "retour") ouvrirMenuJeu();
    else if (choix === "sauver") {
      fermerModale();
      actions.sauvegarder();
    } else if (choix === "principal") {
      fermerModale();
      actions.menu();
    }
    const b = cible.closest<HTMLButtonElement>("button[data-construire]");
    if (b) {
      const type = b.dataset.construire as Constructible;
      const raison = raisonImpossible(getMonde(), type);
      if (!raison && (estPlacable(type) || type === "palissade")) {
        fermerModale();
        actions.placer(type);
        return;
      }
      const r = C.construire(getMonde(), type);
      if (!r) fermerModale();
      faire(r);
    }
  });

  // ---------- Sous-menu Construire : onglets par catégorie, vignettes, bulle au survol ----------
  const sousMenu = $(".sous-menu-construire");
  const bulle = $(".bulle-info");
  let categorie = 0;

  function nomCourt(t: Constructible): string {
    return NOMS_BATIMENTS[t].replace(/^(le |la |l')/, "").replace(/^./, (c) => c.toUpperCase());
  }

  function dessinerConstruire(): void {
    const monde = getMonde();
    const onglets = CATEGORIES.map(
      (c, i) => `<button type="button" class="onglet ${i === categorie ? "actif" : ""}" data-categorie="${i}">${c.icone} ${c.nom}</button>`,
    ).join("");
    const vignettes = CATEGORIES[categorie]!.types.map((t) => {
      const raison = raisonImpossible(monde, t);
      const fait = monde.batiments.filter((b) => b.type === t).length >= maximumDe(t);
      return `<button type="button" class="vignette" data-construire="${t}" ${raison ? "aria-disabled=\"true\"" : ""}>
        <span class="icone">${DESCRIPTIONS[t][0]}</span>
        <b>${nomCourt(t)}</b>
        <span class="prix">${fait ? "✔️ Déjà là" : cout(reglages.batiments[t].cout)}</span>
      </button>`;
    }).join("");
    sousMenu.innerHTML = `<div class="onglets">${onglets}</div><div class="vignettes">${vignettes}</div>`;
  }

  function basculerConstruire(): void {
    if (!sousMenu.classList.contains("cache")) return fermerConstruire();
    menuManger.classList.add("cache");
    dessinerConstruire();
    sousMenu.classList.remove("cache");
  }
  function fermerConstruire(): void {
    sousMenu.classList.add("cache");
    bulle.classList.add("cache");
  }

  sousMenu.addEventListener("click", (e) => {
    const cible = e.target as HTMLElement;
    const onglet = cible.closest<HTMLButtonElement>("button[data-categorie]");
    if (onglet) {
      categorie = Number(onglet.dataset.categorie);
      dessinerConstruire();
      return;
    }
    const v = cible.closest<HTMLButtonElement>("button[data-construire]");
    if (!v) return;
    const type = v.dataset.construire as Constructible;
    const raison = raisonImpossible(getMonde(), type);
    if (raison) {
      message(raison);
      return;
    }
    fermerConstruire();
    if (estPlacable(type) || type === "palissade") actions.placer(type);
    else faire(C.construire(getMonde(), type));
  });

  // Bulle au survol : description, prix, et pourquoi on ne peut pas (s'il y a une raison).
  sousMenu.addEventListener("pointerover", (e) => {
    const v = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-construire]");
    if (!v) return;
    const t = v.dataset.construire as Constructible;
    const raison = raisonImpossible(getMonde(), t);
    const max = maximumDe(t);
    bulle.innerHTML = `<b>${DESCRIPTIONS[t][0]} ${nomCourt(t)}</b>
      <p>${DESCRIPTIONS[t][1]}</p>
      <p class="prix">Prix : ${cout(reglages.batiments[t].cout)}${t === "palissade" ? " par morceau" : ""}${Number.isFinite(max) && max > 1 ? ` · ${max} au maximum` : ""}</p>
      ${raison ? `<p class="raison">${echapper(raison)}</p>` : ""}`;
    bulle.classList.remove("cache");
    const r = v.getBoundingClientRect();
    const racineR = racine.getBoundingClientRect();
    const largeur = bulle.offsetWidth;
    const gauche = Math.max(8, Math.min(racineR.width - largeur - 8, r.left - racineR.left + r.width / 2 - largeur / 2));
    bulle.style.left = `${gauche}px`;
    bulle.style.top = `${r.top - racineR.top - bulle.offsetHeight - 10}px`;
  });
  sousMenu.addEventListener("pointerleave", () => bulle.classList.add("cache"));
  // Un clic en dehors des menus du bas (Construire, Manger) les ferme (ce clic-là ne fait rien d'autre dans le jeu).
  window.addEventListener(
    "pointerdown",
    (e) => {
      const cible = e.target as HTMLElement;
      let ferme = false;
      if (!sousMenu.classList.contains("cache") && !sousMenu.contains(cible) && !cible.closest('[data-a="construire"]')) {
        fermerConstruire();
        ferme = true;
      }
      // Pareil pour le menu Manger.
      if (!menuManger.classList.contains("cache") && !menuManger.contains(cible) && !cible.closest('[data-a="manger"]')) {
        menuManger.classList.add("cache");
        ferme = true;
      }
      if (ferme && cible.tagName === "CANVAS" && !cible.closest(".mini-carte")) e.stopPropagation();
    },
    true,
  );

  function ouvrirCarte(): void {
    const monde = getMonde();
    const legende = LEGENDE_CARTE.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join("");
    ouvrirModale(`<h2>La carte</h2>
      <canvas class="carte-monde" aria-label="Carte de Vulkara"></canvas>
      <div class="legende-carte">${legende}</div>
      <p class="petit">Clique sur la carte pour y regarder.</p>
      <button type="button" class="fermer" data-fermer>Fermer</button>`);
    const canvas = boite.querySelector<HTMLCanvasElement>(".carte-monde")!;
    // La carte remplit tout le cadre, zoomée sur le pays déjà découvert.
    const cadre = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const vue = vueDecouverte(monde, Math.round(cadre.width * dpr), Math.round(cadre.height * dpr));
    dessinerCarte(canvas, monde, vue);
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      const p = caseSousPixel(monde, ((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height, vue);
      if (p.x < 0 || p.z < 0 || p.x > monde.carte.largeur || p.z > monde.carte.hauteur) return;
      fermerModale();
      actions.regarder(p.x, p.z);
    });
  }

  function ouvrirCommandes(): void {
    const section = (icone: string, titre: string, lignes: [string, string][]) =>
      `<section class="aide-bloc"><h3>${icone} ${titre}</h3><dl>${lignes.map(([g, d]) => `<dt>${g}</dt><dd>${d}</dd>`).join("")}</dl></section>`;
    ouvrirModale(`<h2>Les commandes</h2>
      <div class="aide">
        ${section("🧍", "Morris", [
          ["Clic sur Morris", "Le choisir (anneau jaune)."],
          ["Puis clic sur le sol", "Morris marche."],
          ["Puis clic sur un monstre", "Morris l'attaque."],
          ["🌀 Tourbillon", "Frappe tous les monstres autour. Il se recharge ensuite."],
          ["🍎 Manger · ⛺ Dormir", "Manger rend un peu de cœurs, dormir au camp les rend tous."],
        ])}
        ${section("🤖", "Robots", [
          ["Clic sur un robot", "Le choisir et lui donner un travail."],
          ["Robots choisis + sol", "Ils y vont et attendent là."],
          ["Glisser sur le sol", "Tracer un rectangle : choisir plusieurs robots (et Morris)."],
          ["Tous", "Dans la liste « Mes robots » : les choisir tous."],
          ["Robots choisis + monstre", "Ils l'attaquent."],
          ["Robots choisis + chantier", "Ils le construisent ensemble, plus vite."],
        ])}
        ${section("🔨", "Construire", [
          ["🔨 Construire (B)", "Choisis une catégorie, puis un bâtiment."],
          ["Poser", "Clic gauche pour poser, clic droit pour annuler."],
          ["Mur", "Clique le début, puis la fin. Clic droit pour finir."],
          ["Clic sur un bâtiment", "L'utiliser, ou le démolir."],
        ])}
        ${section("🗺️", "Regarder", [
          ["Molette", "Zoomer."],
          ["Bord de l'écran · flèches", "Regarder plus loin."],
          ["📍 Morris (Espace)", "Revenir sur Morris."],
          ["Mini-carte", "Clic : regarder là. ⤢ ou C : la grande carte."],
          ["⚠️ Flèche rouge", "Le camp est attaqué : clique pour y aller."],
          ["☰ Menu (M)", "Aide, sauvegarde, réglages audio. Échap ferme."],
        ])}
      </div>
      <button type="button" class="fermer" data-fermer>J'ai compris</button>`);
  }

  // ---------- Panneau de côté : robot ou bâtiment choisi ----------
  let signatureCote = "";
  function ouvrir(p: Panneau): void {
    panneau = p;
    aConfirmer = null;
    signatureCote = "";
    menuManger.classList.add("cache");
    rafraichirCote(true);
  }

  /**
   * Les tuiles des travaux, rangées par groupes (icône + un mot).
   * Le nom complet du travail s'affiche en bulle quand la souris passe dessus.
   */
  function tuilesTravaux(estActif: (t: Travail) => boolean, inactif: boolean): string {
    return GROUPES_TRAVAUX.map(
      (g) => `<h4>${g.titre}</h4><div class="tuiles">${g.travaux
        .map(
          (x) =>
            `<button type="button" class="tuile ${estActif(x.t) ? "actif" : ""}" data-travail="${x.t}" title="${NOMS_TRAVAUX[x.t]}" ${inactif ? "disabled" : ""}>${icone(x.icone)}<span>${x.mot}</span></button>`,
        )
        .join("")}</div>`,
    ).join("");
  }

  function choixNuit(rentrent: boolean, restent: boolean): string {
    return `<h4>La nuit</h4>
      <div class="choix">
        <button type="button" data-nuit="1" class="${rentrent ? "actif" : ""}" title="Le robot rentre au camp à la nuit tombée">${icone(PICTOS.maison)}<span>Rentrer</span></button>
        <button type="button" data-nuit="0" class="${restent ? "actif" : ""}" title="Le robot reste dehors : attention aux monstres">${icone(PICTOS.lune)}<span>Dehors</span></button>
      </div>`;
  }

  function htmlRobot(monde: Monde, r: Robot, numero: number): string {
    const atelier = batimentConstruit(monde, "atelier");
    return `<h3><i class="pastille" style="background:${COULEURS_ROBOTS[numero % 5]}"></i>${r.nom}</h3>
      <p class="etat">${NOMS_TRAVAUX[r.travail]} · ${ETATS[r.etat]} · ${"🔋".repeat(Math.max(0, r.pv))}</p>
      ${r.etat === "casse" ? `<button type="button" class="important" data-reparer="${r.id}" ${atelier ? "" : "disabled"}>Réparer (${prixReparation(monde)} ✨)${atelier ? "" : " – il faut l'atelier"}</button>` : ""}
      ${tuilesTravaux((t) => r.travail === t, r.etat === "casse")}
      ${choixNuit(r.rentrerLaNuit, !r.rentrerLaNuit)}`;
  }

  /** Ce que donne un niveau, en une phrase courte. */
  function texteEffet(type: TypeBatiment, niveau: number): string {
    const e = effetNiveau(type, niveau);
    switch (type) {
      case "potager":
        return `Les légumes poussent ×${e}.`;
      case "grenier":
        return `${Math.round(reglages.batiments.grenier.nourritureProtegee * e)} 🍎 à l'abri.`;
      case "atelier":
        return `Réparer un robot : ${Math.round(reglages.robots.reparationEclats * e)} ✨.`;
      case "usine":
        return `Robots ${e < 1 ? `${Math.round((1 - e) * 100)} % moins chers` : "au prix normal"}.`;
      case "station":
        return `Recharge ×${e}.`;
      case "lanterne":
        return `Lumière sur ${Math.round(reglages.batiments.lanterne.rayon * e)} cases.`;
      case "tour":
        return `Tire jusqu'à ${Math.round(reglages.batiments.tour.portee * e)} cases.`;
      case "piege":
        return `Réarmé en ${Math.round(reglages.batiments.piege.rearmementSecondes / e)} s.`;
      case "cloche":
        return e <= 0 ? "Elle sonne." : e > 100 ? "Tous les robots viennent défendre le camp." : `Les robots à moins de ${e} cases viennent défendre.`;
      case "palissade":
      case "porte":
        return `Solidité ${Math.round(reglages.batiments[type].pvSegment * e)} par morceau.`;
      default:
        return "";
    }
  }

  function htmlNiveau(monde: Monde, b: Batiment): string {
    if (!b.construit || !estAmeliorable(b.type)) return "";
    const n = niveauDe(b);
    const etoiles = "★".repeat(n) + "☆".repeat(NIVEAU_MAX - n);
    const prix = prixAmelioration(b);
    let bouton = "";
    if (prix) {
      const mur = b.type === "palissade" || b.type === "porte";
      const nb = mur ? monde.batiments.filter((x) => x.type === b.type && x.construit && niveauDe(x) === n).length : 1;
      const total: Cout = {};
      for (const [k, v] of Object.entries(prix) as [keyof Cout, number][]) total[k] = v * nb;
      bouton = `<button type="button" class="important" data-ameliorer="${b.id}">⬆️ ${mur ? `Améliorer tout le mur (${nb} morceaux)` : `Passer au niveau ${n + 1}`} · ${cout(total)}</button>
        <p class="petit">Niveau ${n + 1} : ${texteEffet(b.type, n + 1)}</p>`;
    }
    return `<div class="niveau"><p><span class="etoiles" title="Niveau ${n}">${etoiles}</span> Niveau ${n} : ${texteEffet(b.type, n)}</p>${bouton}</div>`;
  }

  function htmlBatiment(monde: Monde, b: Batiment): string {
    if (b.type === "tente" || b.type === "pont") return htmlBatimentContenu(monde, b);
    const rendu = Object.entries(remboursementDemolition(b)).filter(([, v]) => v > 0);
    const gain = rendu.length > 0 ? ` (rend ${cout(Object.fromEntries(rendu))})` : "";
    const bouton =
      aConfirmer === b.id
        ? `<button type="button" class="danger" data-demolir="${b.id}">Sûr ? Clique encore pour démolir</button>`
        : `<button type="button" class="discret" data-demolir="${b.id}">🧨 Démolir${gain}</button>`;
    return `${htmlBatimentContenu(monde, b)}${htmlNiveau(monde, b)}<div class="demolir">${bouton}</div>`;
  }

  function htmlBatimentContenu(monde: Monde, b: Batiment): string {
    const nom = NOMS_BATIMENTS[b.type].replace(/^(le |la |l')/, "").replace(/^./, (c) => c.toUpperCase());
    if (!b.construit && b.type !== "tente") {
      const total = reglages.batiments[b.type].travail;
      const pc = Math.floor((100 * b.travailFait) / total);
      return `<h3>${nom}</h3><p>En construction : ${pc} %</p><div class="jauge"><div class="plein" style="width:${pc}%"></div></div>
        <button type="button" data-aider="${b.id}">🔨 Aider à construire</button>
        <p class="petit">Choisis des robots puis clique sur ce chantier : ils le construisent ensemble, plus vite.</p>`;
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
        const potagers = monde.batiments.filter((x) => x.type === "potager");
        const titre = potagers.length > 1 ? `Potager ${potagers.indexOf(b) + 1}` : "Le potager";
        return `<h3>${titre}</h3><div class="parcelles">${parcelles}</div>
          <p class="petit">Un robot avec « S'occuper du potager » récolte et replante tout seul.</p>`;
      }
      case "atelier": {
        const casses = monde.robots.filter((r) => r.etat === "casse");
        return `<h3>L'atelier</h3>
          ${monde.morris.arme === "epee" ? "<p>✔️ Morris a son épée.</p>" : `<button type="button" class="important" data-epee>⚔️ Fabriquer l'épée (${cout(reglages.epee.cout)})</button>`}
          <h4>Robots cassés</h4>
          ${casses.length === 0 ? "<p>Aucun. Tant mieux !</p>" : casses.map((r) => `<button type="button" data-reparer="${r.id}">🔧 Réparer ${r.nom} (${prixReparation(monde)} ✨)</button>`).join("")}`;
      }
      case "usine": {
        const file = b.file?.length ?? 0;
        const pourcent = Math.min(100, Math.round(((b.croissance ?? 0) / reglages.robots.croissanceSecondes) * 100));
        const enCours = file === 0
          ? ""
          : `<p class="file-usine">🌱 ${file === 1 ? "1 robot grandit" : `${file} robots dans la file (un à la fois)`}</p>
             <div class="jauge"><i style="width:${pourcent}%"></i></div>
             <button type="button" class="discret" data-annuler-robot>✖ Annuler le dernier (rendu)</button>`;
        return `<h3>L'usine à robots</h3>
          <p>Robots : <b>${monde.robots.length}</b></p>
          <button type="button" class="important" data-nouveau>🤖 Faire grandir un robot (${cout(prixNouveauRobot(monde))})</button>
          ${enCours}`;
      }
      case "palissade":
      case "porte": {
        const murs = monde.batiments.filter((x) => estMorceauDeMur(x.type) && x.construit);
        const abimes = murs.filter((x) => (x.pv ?? 0) < pvMaxMur(x)).length;
        const max = pvMaxMur(b);
        return `<h3>${b.type === "porte" ? "La porte" : "La palissade"}</h3>
          <p>Ce morceau : ${b.pv ?? max} / ${max} de solidité.</p>
          <p>${abimes === 0 ? "Tous les murs sont solides." : `${abimes} morceau${abimes > 1 ? "x" : ""} abîmé${abimes > 1 ? "s" : ""} en tout.`}</p>
          <p class="petit">Pour réparer : choisis un robot et donne-lui « Réparer la palissade ». Il faut du bois.</p>`;
      }
      case "cloche":
        return `<h3>La cloche d'alarme</h3><p>Elle sonne quand le camp est attaqué et que Morris est loin.</p>`;
      case "pont":
        return `<h3>Le pont</h3><p>Il traverse la rivière. Lumo capte un signal de l'autre côté…</p>`;
      case "grenier": {
        const max = nourritureAbritee(monde);
        const abri = Math.min(monde.ressources.nourriture, max);
        return `<h3>Le grenier</h3><p>🍎 À l'abri des grignotins : <b>${abri} / ${max}</b></p>
          <p class="petit">Au-delà, la nourriture reste à la tente et peut être volée.</p>`;
      }
      case "lanterne":
        return `<h3>La lanterne de cristal</h3><p>${monde.temps.nuit ? "Elle brille : les grignotins n'osent pas approcher." : "Elle s'allumera à la nuit."}</p>`;
      case "station":
        return `<h3>La station de recharge</h3><p>Un robot abîmé à côté se recharge vite.</p>
          <p class="petit">Un robot cassé, lui, se répare à l'atelier.</p>`;
      case "piege": {
        const reste = Math.ceil((b.recharge ?? 0) / reglages.simulation.ticksParSeconde);
        return `<h3>Le piège à grignotins</h3><p>${reste > 0 ? `Il se réarme : encore ${reste} s.` : "✔️ Armé."}</p>`;
      }
      case "scierie":
        return `<h3>La scierie</h3><p>Les robots bûcherons y rapportent le bois quand elle est plus près que la tente.</p><p>🪵 Réserve : <b>${monde.ressources.bois}</b></p>`;
      case "ferme":
        return `<h3>La ferme</h3><p>Les robots jardiniers y rangent les légumes quand elle est plus près que la tente.</p>`;
      case "fonderie":
        return `<h3>La fonderie</h3><p>Les robots mineurs y apportent le minerai quand elle est plus près que la tente.</p><p>⚙️ Réserve : <b>${monde.ressources.metal}</b></p>`;
      case "tour":
        return `<h3>La tour de guet</h3><p>Elle tire toute seule sur les monstres à moins de ${Math.round(porteeTour(b))} cases, et sonne l'alarme quand un monstre approche.</p>`;
    }
  }

  function htmlGroupe(monde: Monde, groupe: Robot[]): string {
    const noms = groupe
      .map((r) => `<span class="membre"><i class="pastille" style="background:${COULEURS_ROBOTS[monde.robots.indexOf(r) % 5]}"></i>${echapper(r.nom)}</span>`)
      .join("");
    const tousCasses = groupe.every((r) => r.etat === "casse");
    return `<h3>${groupe.length} robots choisis</h3>
      <p class="membres">${noms}</p>
      ${tuilesTravaux((t) => groupe.every((r) => r.travail === t), tousCasses)}
      ${choixNuit(groupe.every((r) => r.rentrerLaNuit), groupe.every((r) => !r.rentrerLaNuit))}`;
  }

  /** Applique un ordre à chaque robot choisi ; on affiche le premier refus s'il y en a un. */
  function pourChaque(ids: number[], ordre: (id: number) => string | null): string | null {
    let refus: string | null = null;
    for (const id of ids) refus = ordre(id) ?? refus;
    return refus;
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
    } else if (panneau.type === "robots") {
      const ids = panneau.ids;
      const groupe = monde.robots.filter((r) => ids.includes(r.id));
      if (groupe.length !== ids.length) {
        // Un robot a disparu (nouvelle partie…) : on garde ceux qui restent.
        panneau = panneauDesRobots(groupe.map((r) => r.id));
        return rafraichirCote(true);
      }
      html = htmlGroupe(monde, groupe);
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
    // Souris sur le panneau : on ne redessine pas, sinon le bouton visé peut être remplacé
    // entre l'appui et le relâchement, et le clic serait perdu.
    if (!force && cote.matches(":hover")) return;
    if (!force && (cote.querySelector(".sous-choix")?.childElementCount ?? 0) > 0) return;
    signatureCote = html;
    cote.innerHTML = `<button type="button" class="croix" data-fermer-cote aria-label="Fermer">✕</button>${html}<div class="sous-choix"></div>`;
    cote.classList.remove("cache");
  }

  function idBatiment(): number {
    return panneau?.type === "batiment" ? panneau.id : -1;
  }

  cote.addEventListener("click", (e) => {
    const c = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!c) return;
    const monde = getMonde();
    const d = c.dataset;
    if ("fermerCote" in d) ouvrir(null);
    else if (d.travail && robotsDuPanneau(panneau).length > 0) {
      const refus = pourChaque(robotsDuPanneau(panneau), (id) => C.choisirTravail(monde, id, d.travail as Travail));
      faire(refus);
      // « Aider à construire » : on montre ensuite le chantier voulu (les robots restent choisis).
      if (!refus && d.travail === "construire") {
        const chantiers = monde.batiments.some((b) => !b.construit && b.type !== "tente");
        lumo(
          chantiers
            ? "Clique maintenant sur le chantier à construire. Sinon, j'irai au plus proche."
            : "Il n'y a pas de chantier. Pose d'abord un bâtiment avec 🔨 Construire, puis clique dessus.",
          true,
        );
      }
    }
    else if (d.nuit && robotsDuPanneau(panneau).length > 0)
      faire(pourChaque(robotsDuPanneau(panneau), (id) => C.choisirNuit(monde, id, d.nuit === "1")));
    else if (d.reparer) faire(C.reparerRobot(monde, Number(d.reparer)));
    else if (d.aider) faire(C.aiderAConstruire(monde, Number(d.aider)));
    else if ("dormir" in d) faire(C.dormir(monde));
    else if ("epee" in d) faire(C.fabriquerEpee(monde));
    else if ("nouveau" in d) faire(C.nouveauRobot(monde));
    else if ("annulerRobot" in d) faire(C.annulerRobot(monde));
    else if (d.ameliorer) faire(C.ameliorer(monde, Number(d.ameliorer)));
    else if (d.recolter) faire(C.recolterParcelle(monde, idBatiment(), Number(d.recolter)));
    else if (d.demolir) {
      // Deux clics : le premier demande confirmation.
      const id = Number(d.demolir);
      if (aConfirmer !== id) {
        aConfirmer = id;
        rafraichirCote(true);
        return;
      }
      aConfirmer = null;
      const r = C.demolir(monde, id);
      if (!r) ouvrir(null);
      faire(r);
    }
    else if (d.choisir) {
      const i = Number(d.choisir);
      const sous = cote.querySelector<HTMLElement>(".sous-choix")!;
      sous.innerHTML = `<h4>Planter dans la parcelle ${i + 1}</h4>${LEGUMES.map(
        (l) => `<button type="button" data-planter="${l}" data-parcelle="${i}"><i class="pastille" style="background:${couleurLegume(l)}"></i><b>${LEGUMES_INFOS[l][0]}</b> <span class="petit">${LEGUMES_INFOS[l][1]}</span></button>`,
      ).join("")}`;
      return;
    } else if (d.planter) faire(C.planter(monde, idBatiment(), Number(d.parcelle), d.planter as Legume));
  });

  // ---------- Liste des robots (sous l'objectif) ----------
  let signatureListe = "";
  function rafraichirListeRobots(monde: Monde): void {
    const choisis = robotsDuPanneau(panneau);
    const html = monde.robots
      .map((r, i) => {
        // Une seule ligne : pastille, nom, travail (icône + un mot), batteries. Le détail est dans la bulle.
        const t = TRAVAIL_COURT[r.travail];
        const titre = `${r.nom} : ${NOMS_TRAVAUX[r.travail]}, ${ETATS[r.etat]}`;
        return `<button type="button" class="ligne-robot ${choisis.includes(r.id) ? "actif" : ""} ${r.etat === "casse" ? "casse" : ""}" data-robot="${r.id}" title="${echapper(titre)}">
          <i class="pastille" style="background:${COULEURS_ROBOTS[i % 5]}"></i>
          <span class="nom">${echapper(r.nom)}</span>
          <span class="travail">${r.etat === "casse" ? "cassé !" : `${icone(t.icone)}${t.mot}`}</span>
          <span class="piles">${"🔋".repeat(Math.max(0, r.pv))}</span>
        </button>`;
      })
      .join("");
    listeRobots.classList.toggle("cache", monde.robots.length === 0);
    // On ne redessine que si quelque chose a changé, sinon le clic peut tomber entre deux dessins.
    if (html === signatureListe) return;
    signatureListe = html;
    lignesRobots.innerHTML = html;
  }

  $(".liste-robots .tous").addEventListener("click", () => actions.choisirRobots(getMonde().robots.map((r) => r.id)));
  lignesRobots.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-robot]");
    if (b) actions.choisirRobot(Number(b.dataset.robot));
  });

  // ---------- Mini-carte (toujours visible, cachée quand une fiche est ouverte) ----------
  const miniCarte = $(".mini-carte");
  const canvasMini = $<HTMLCanvasElement>(".mini-carte canvas");
  let dernierDessinMini = 0;
  const vueMini = (): VueCarte => ({ ...actions.centreVue(), rayon: reglages.interface.miniCarteRayon, taille: 360 });
  function rafraichirMiniCarte(monde: Monde): void {
    miniCarte.classList.toggle("cache", !cote.classList.contains("cache"));
    const maintenant = performance.now();
    if (maintenant - dernierDessinMini < reglages.interface.miniCarteRafraichissementMs) return;
    dernierDessinMini = maintenant;
    dessinerCarte(canvasMini, monde, vueMini());
  }
  canvasMini.addEventListener("click", (e) => {
    const monde = getMonde();
    const r = canvasMini.getBoundingClientRect();
    const p = caseSousPixel(monde, ((e.clientX - r.left) / r.width) * canvasMini.width, ((e.clientY - r.top) / r.height) * canvasMini.height, vueMini());
    if (p.x < 0 || p.z < 0 || p.x > monde.carte.largeur || p.z > monde.carte.hauteur) return;
    actions.regarder(p.x, p.z);
  });
  $(".mini-carte .agrandir").addEventListener("click", () => ouvrirCarte());

  // ---------- Flèche d'alerte et nombres qui s'envolent ----------
  const flecheAlerte = $(".alerte-camp");
  flecheAlerte.addEventListener("click", () => actions.regarder(LIEUX.camp.x, LIEUX.camp.z));
  function alerteCamp(p: { x: number; y: number; angle: number } | null): void {
    flecheAlerte.classList.toggle("cache", !p);
    if (!p) return;
    flecheAlerte.style.left = `${p.x}px`;
    flecheAlerte.style.top = `${p.y}px`;
    flecheAlerte.style.setProperty("--angle", `${p.angle}rad`);
  }
  function nombreVolant(x: number, y: number, texte: string): void {
    const e = document.createElement("span");
    e.className = "nombre-volant";
    e.textContent = texte;
    e.style.left = `${x}px`;
    e.style.top = `${y}px`;
    etiquettes.append(e);
    setTimeout(() => e.remove(), 1400);
  }

  // ---------- Raccourcis clavier (en plus de la souris) ----------
  function raccourci(touche: string): boolean {
    if (modalePause && touche !== "Escape") return false;
    switch (touche.toLowerCase()) {
      case "b":
        basculerConstruire();
        return true;
      case "m":
        ouvrirMenuJeu();
        return true;
      case "c":
        ouvrirCarte();
        return true;
      case " ":
        actions.recentrer();
        return true;
      default:
        return false;
    }
  }

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
    rafraichirListeRobots(monde);
    rafraichirMiniCarte(monde);
  }

  // ---------- Bulle du clic intelligent ----------
  const bulleClic = document.createElement("div");
  bulleClic.className = "bulle-ordre panneau-verre cache";
  document.body.append(bulleClic);
  function bulleOrdre(texte: string | null, x: number, y: number): void {
    bulleClic.classList.toggle("cache", !texte);
    if (!texte) return;
    if (bulleClic.textContent !== texte) bulleClic.textContent = texte;
    bulleClic.style.left = `${x + 18}px`;
    bulleClic.style.top = `${y + 14}px`;
  }

  return {
    bulleOrdre,
    mettreAJour,
    message,
    lumo,
    ouvrir,
    panneau: () => panneau,
    modalOuverte: () => modalePause,
    fermerTout() {
      bulleOrdre(null, 0, 0);
      ouvrir(null);
      fermerConstruire();
      menuManger.classList.add("cache");
      if (!modale.classList.contains("cache")) fermerModale();
    },
    etiquettes,
    raccourci,
    alerteCamp,
    nombreVolant,
    enigme: ouvrirEnigme,
  };
}
