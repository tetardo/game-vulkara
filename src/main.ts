import "@fontsource/cinzel/600.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/700.css";
import "./style.css";

import { reglages } from "./sim/reglages";
import { creerMonde, type Monde } from "./sim/monde";
import { avancer, Horloge } from "./sim/simulation";
import { deserialiser, serialiser } from "./sim/sauvegarde";
import * as C from "./sim/commandes";
import { LIEUX } from "./sim/carte";
import { vitesseMorris } from "./sim/morris";
import { caseDEmplacement, casesDuMur, emplacementImpossible, NOMS_BATIMENTS, pvMaxMur, type Constructible } from "./sim/batiments";
import { EMPRISE } from "./sim/chemin";
import { creerAffichage } from "./render/scene";
import { chargerGabarits, chargerMorris } from "./render/modeles";
import { creerTerrain } from "./render/terrain";
import { creerRendu } from "./render/entites";
import { jouerCrash } from "./render/cinematique";
import { creerInterface, panneauDesRobots, robotsDuPanneau } from "./ui/interface";
import { creerEcrans } from "./ui/ecrans";
import { sons, type Moment } from "./ui/son";
import reglagesMusique from "../config/musique.json";
import { chargerSauvegarde, envoyerSauvegarde, envoyerSignalement } from "./serveur";

const T = reglages.simulation.ticksParSeconde;

// Journal des erreurs, joint au signalement d'un problème.
const erreurs: string[] = [];
window.addEventListener("error", (e) => erreurs.push(`${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener("unhandledrejection", (e) => erreurs.push(`Promesse rejetée : ${String(e.reason)}`));

type Etat = "chargement" | "menu" | "cinematique" | "jeu" | "fin";

async function demarrer(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
  const racineUi = document.querySelector<HTMLElement>("#interface")!;
  const ecrans = creerEcrans(document.querySelector<HTMLElement>("#ecrans")!);
  ecrans.chargement(0, 1);
  racineUi.classList.add("cache");

  const affichage = creerAffichage(canvas);
  const { engine, scene } = affichage;
  const [gabarits, morris, sauvegardeServeur] = await Promise.all([
    chargerGabarits(scene, (f, t) => ecrans.chargement(f, t)),
    chargerMorris(scene),
    chargerSauvegarde(),
  ]);

  let monde: Monde = creerMonde(reglages);
  const terrain = creerTerrain(scene, monde);
  const rendu = creerRendu(affichage, gabarits, morris, monde);
  let derniereSauvegarde: string | null = sauvegardeServeur;
  let etat: Etat = "menu";
  let enPause = false;
  let tickSauvegarde = 0;
  let tempsJoueMs = 0;
  let prochainePause = reglages.jeu.pauseToutesLesMinutes * 60_000;

  const ui = creerInterface(racineUi, () => monde, {
    ordre(resultat) {
      if (!resultat) sons.ramasse();
    },
    async signaler() {
      const ok = await envoyerSignalement({
        date: new Date().toISOString(),
        capture: canvas.toDataURL("image/png"),
        erreurs: [...erreurs],
        navigateur: navigator.userAgent,
        sauvegarde: serialiser(monde),
      });
      ui.message(ok ? "Merci ! Le problème est enregistré." : "Impossible d'enregistrer le problème.");
    },
    recentrer() {
      affichage.suivre.actif = true;
      choisir(true, []);
    },
    pause(active) {
      enPause = active;
    },
    centreVue() {
      return { x: affichage.camera.target.x, z: affichage.camera.target.z };
    },
    regarder(x, z) {
      affichage.suivre.actif = false;
      affichage.camera.target.set(x, 0, z);
    },
    choisirRobots(ids) {
      choisir(false, ids);
    },
    choisirRobot(id) {
      const robot = monde.robots.find((r) => r.id === id);
      if (!robot) return;
      choisir(false, [id]);
      affichage.suivre.actif = false;
      affichage.camera.target.set(robot.x, 0, robot.z);
    },
    sauvegarder() {
      void sauver().then((ok) => ui.message(ok ? "Partie sauvegardée 💾" : "La sauvegarde n'a pas marché. Réessaie dans un moment."));
    },
    menu() {
      sauver();
      annulerPlacement();
      ui.fermerTout();
      // Le jeu se met en pause derrière le menu principal : « Continuer » reprend exactement ici.
      void menu(monde);
    },
    placer(type) {
      placement = type;
      debutMur = null;
      ui.message(
        type === "palissade"
          ? "Clique le début du mur, puis la fin. Les murs se relient. Clic droit pour finir."
          : `Choisis où poser ${NOMS_BATIMENTS[type]} : clic gauche pour poser, clic droit pour annuler.`,
      );
      if (souris) majFantome(souris.x, souris.y);
    },
  });

  // ---------- Placement d'un bâtiment à la souris ----------
  let placement: Constructible | null = null;
  /** Palissade : la case où commence le mur en cours (null tant qu'on n'a pas cliqué). */
  let debutMur: { x: number; z: number } | null = null;
  function majFantome(x: number, y: number): void {
    if (!placement) return;
    const p = rendu.solSous(x, y);
    if (!p) return rendu.fantome(null);
    if (placement === "palissade") {
      const cases = casesDuMur(monde, debutMur ?? p, p);
      rendu.fantome(cases.map((c) => ({ x: c.x, z: c.z, cote: 1, valide: c.valide })));
      return;
    }
    const c = caseDEmplacement(p.x, p.z, placement);
    const cote = 2 * (EMPRISE[placement] ?? 0) + 1;
    rendu.fantome([{ x: c.x, z: c.z, cote, valide: emplacementImpossible(monde, placement, c) === null }]);
  }
  function annulerPlacement(): void {
    placement = null;
    debutMur = null;
    rendu.fantome(null);
  }

  function sauver(): Promise<boolean> {
    if (monde.fin !== "en-cours") return Promise.resolve(false);
    derniereSauvegarde = serialiser(monde);
    tickSauvegarde = monde.tick;
    return envoyerSauvegarde(derniereSauvegarde);
  }

  // La musique démarre au premier clic (les navigateurs interdisent le son avant).
  window.addEventListener("pointerdown", () => sons.musique(), { once: true });

  // ---------- Souris ----------
  const touches = new Set<string>();
  window.addEventListener("keydown", (e) => {
    touches.add(e.key);
    if (e.key === "Escape") {
      annulerPlacement();
      ui.fermerTout();
      return;
    }
    // Raccourcis (B, M, C, Espace) : jamais pendant qu'on règle un curseur ou qu'on écrit.
    if (etat === "jeu" && !(e.target instanceof HTMLInputElement) && !e.repeat && ui.raccourci(e.key)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => touches.delete(e.key));
  let souris: { x: number; y: number } | null = null;
  let dernierSurvol = 0;
  // Survol : curseur et bulle du clic intelligent. Au plus ~11 fois par seconde, mais la
  // dernière position est toujours traitée (sinon la bulle peut rester sur un ancien état).
  let survolEnAttente: number | null = null;
  function survoler(x: number, y: number, cx: number, cy: number): void {
    dernierSurvol = performance.now();
    const c = rendu.survol(x, y);
    const choisis = robotsDuPanneau(ui.panneau()).filter((id) => monde.robots.some((r) => r.id === id));
    const ordre = placement ? null : ordreSous(x, y, c, choisis);
    ui.bulleOrdre(ordre?.texte ?? null, cx, cy);
    canvas.style.cursor = ordre ? "pointer" : !c || c.type === "sol" ? "default" : c.type === "monstre" ? "crosshair" : "pointer";
  }
  canvas.addEventListener("pointermove", (e) => {
    souris = { x: e.offsetX, y: e.offsetY };
    if (placement && etat === "jeu") majFantome(e.offsetX, e.offsetY);
    if (etat !== "jeu" || ui.modalOuverte()) {
      ui.bulleOrdre(null, 0, 0);
      return;
    }
    if (survolEnAttente !== null) clearTimeout(survolEnAttente);
    const attente = 90 - (performance.now() - dernierSurvol);
    const [x, y, cx, cy] = [e.offsetX, e.offsetY, e.clientX, e.clientY];
    if (attente <= 0) survoler(x, y, cx, cy);
    else
      survolEnAttente = window.setTimeout(() => {
        survolEnAttente = null;
        if (etat === "jeu") survoler(x, y, cx, cy);
      }, attente);
  });
  canvas.addEventListener("pointerleave", () => {
    souris = null;
    ui.bulleOrdre(null, 0, 0);
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    if (etat !== "jeu" || ui.modalOuverte()) return;
    if (placement) {
      if (e.button === 2) {
        annulerPlacement();
        return;
      }
      if (e.button !== 0) return;
      const p = rendu.solSous(e.offsetX, e.offsetY);
      if (!p) return;
      if (placement === "palissade") {
        // Premier clic : début du mur. Clics suivants : fin du mur, qui devient le début du suivant.
        if (!debutMur) {
          debutMur = p;
          ui.message("Maintenant, clique où le mur s'arrête.");
          majFantome(e.offsetX, e.offsetY);
          return;
        }
        const r = C.tracerPalissade(monde, debutMur, p);
        ui.message(r ?? "Morris construit le mur. Continue, ou clic droit pour finir.");
        if (!r) {
          sons.ramasse();
          debutMur = p;
          majFantome(e.offsetX, e.offsetY);
        }
        return;
      }
      const r = C.construire(monde, placement, p);
      ui.message(r ?? `Morris va construire ${NOMS_BATIMENTS[placement]}.`);
      if (!r) {
        sons.ramasse();
        annulerPlacement();
        affichage.suivre.actif = true;
      }
      return;
    }
    if (e.button !== 0) return;
    sons.activer();
    // On attend de savoir si c'est un clic ou un rectangle tracé en glissant.
    glisse = { x: e.offsetX, y: e.offsetY, ecranX: e.clientX, ecranY: e.clientY, actif: false };
  });

  // ---------- Rectangle de sélection des robots ----------
  let glisse: { x: number; y: number; ecranX: number; ecranY: number; actif: boolean } | null = null;
  const rectangle = document.createElement("div");
  rectangle.className = "selection-rectangle cache";
  document.body.append(rectangle);
  window.addEventListener("pointermove", (e) => {
    if (!glisse) return;
    const dx = e.clientX - glisse.ecranX;
    const dy = e.clientY - glisse.ecranY;
    if (!glisse.actif && Math.hypot(dx, dy) < reglages.interface.seuilGlissePx) return;
    glisse.actif = true;
    rectangle.classList.remove("cache");
    rectangle.style.left = `${Math.min(e.clientX, glisse.ecranX)}px`;
    rectangle.style.top = `${Math.min(e.clientY, glisse.ecranY)}px`;
    rectangle.style.width = `${Math.abs(dx)}px`;
    rectangle.style.height = `${Math.abs(dy)}px`;
  });
  window.addEventListener("pointerup", (e) => {
    const g = glisse;
    glisse = null;
    if (!g || etat !== "jeu") return;
    if (!g.actif) {
      cliquer(g.x, g.y);
      return;
    }
    rectangle.classList.add("cache");
    // Morris et les robots dont le pied est dans le rectangle (coordonnées du canevas).
    const bord = canvas.getBoundingClientRect();
    const x1 = Math.min(g.ecranX, e.clientX) - bord.left;
    const x2 = Math.max(g.ecranX, e.clientX) - bord.left;
    const y1 = Math.min(g.ecranY, e.clientY) - bord.top;
    const y2 = Math.max(g.ecranY, e.clientY) - bord.top;
    const dedans = (x: number, z: number) => {
      const p = rendu.aLEcran(x, 0.4, z);
      return p.visible && p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
    };
    const ids = monde.robots.filter((r) => dedans(r.x, r.z)).map((r) => r.id);
    choisir(dedans(monde.morris.x, monde.morris.z), ids);
    const n = ids.length + (morrisChoisi ? 1 : 0);
    if (n > 1) ui.message(`${n} choisis.`);
  });

  // ---------- Ce que le joueur a choisi : Morris et/ou des robots ----------
  // Les robots choisis vivent dans la fiche ouverte (ui.panneau) ; Morris, ici.
  let morrisChoisi = true;
  function choisir(morris: boolean, robots: number[]): void {
    morrisChoisi = morris;
    ui.ouvrir(panneauDesRobots(robots));
  }

  // ---------- Clic intelligent : ce que les robots choisis feront sur la chose cliquée ----------
  type Ordre = { texte: string; faire: () => string | null };
  const VISEE: Record<string, { h: number; r: number }> = {
    arbre: { h: 1.5, r: 1.1 },
    buisson: { h: 0.5, r: 0.9 },
    noisetier: { h: 1.2, r: 1.1 },
    minerai: { h: 0.6, r: 1 },
    eclat: { h: 0.6, r: 0.8 },
    coeur: { h: 0.9, r: 0.8 },
  };
  /** La source ou l'objet (découvert) sous la souris, en comparant à l'écran (les arbres ne sont pas cliquables en 3D). */
  function choseSous(x: number, y: number): { genre: "source" | "objet"; id: number; type: string } | null {
    const t = affichage.camera.target;
    const a = rendu.aLEcran(t.x, 0, t.z);
    const b = rendu.aLEcran(t.x + 1, 0, t.z);
    const pxParCase = Math.hypot(b.x - a.x, b.y - a.y);
    const vu = (px: number, pz: number) => monde.brouillard[Math.floor(pz) * monde.carte.largeur + Math.floor(px)] === 1;
    let meilleur: { genre: "source" | "objet"; id: number; type: string } | null = null;
    let score = 1;
    const essayer = (genre: "source" | "objet", id: number, type: string, px: number, pz: number) => {
      const v = VISEE[type];
      if (!v || !vu(px, pz)) return;
      const p = rendu.aLEcran(px, v.h, pz);
      const s = Math.hypot(p.x - x, p.y - y) / (v.r * pxParCase);
      if (s < score) {
        score = s;
        meilleur = { genre, id, type };
      }
    };
    for (const o of monde.objets) essayer("objet", o.id, o.type, o.x, o.z);
    for (const s of monde.sources) if (s.reste > 0) essayer("source", s.id, s.type, s.x, s.z);
    return meilleur;
  }
  const TRAVAIL_DE_LA_SOURCE: Record<string, { travail: "bois" | "cueillette" | "ferraille"; texte: string }> = {
    arbre: { travail: "bois", texte: "🪓 Couper cet arbre" },
    buisson: { travail: "cueillette", texte: "🍓 Cueillir ici" },
    noisetier: { travail: "cueillette", texte: "🌰 Cueillir les noisettes" },
    minerai: { travail: "ferraille", texte: "⛏️ Miner ce rocher" },
  };
  function ordreSous(x: number, y: number, c: ReturnType<typeof rendu.cibleDuClic>, choisis: number[]): Ordre | null {
    if (choisis.length === 0 || !c) return null;
    const dire = (texte: string) => (choisis.length > 1 ? `${texte} (${choisis.length} robots)` : texte);
    if (c.type === "monstre") return { texte: dire("⚔️ Attaquer"), faire: () => null };
    if (c.type === "batiment") {
      const b = monde.batiments.find((x) => x.id === c.id);
      if (!b) return null;
      if (!b.construit) return { texte: dire("🔨 Construire"), faire: () => C.robotsConstruisent(monde, choisis, b.id) };
      if (b.type === "potager") return { texte: dire("🥕 Jardiner ici"), faire: () => C.robotsTravaillent(monde, choisis, "potager", b.id) };
      if ((b.type === "palissade" || b.type === "porte") && (b.pv ?? 0) < pvMaxMur(b)) {
        return { texte: dire("🪵 Réparer ce mur"), faire: () => C.robotsTravaillent(monde, choisis, "reparer", b.id) };
      }
      if (b.type === "tente" || b.type === "station") return { texte: dire("⛺ Rentrer se reposer"), faire: () => C.deplacerRobots(monde, choisis, b.x, b.z) };
      return null;
    }
    if (c.type !== "sol" && c.type !== "objet") return null;
    const chose = choseSous(x, y);
    if (chose?.genre === "objet") {
      return chose.type === "eclat"
        ? { texte: dire("✨ Ramasser l'éclat"), faire: () => C.robotsRamassent(monde, choisis, chose.id) }
        : { texte: "💗 Le cœur, c'est pour Morris", faire: () => C.robotsRamassent(monde, choisis, chose.id) };
    }
    if (chose?.genre === "source") {
      const t = TRAVAIL_DE_LA_SOURCE[chose.type];
      if (!t) return null;
      return { texte: dire(t.texte), faire: () => C.robotsTravaillent(monde, choisis, t.travail, chose.id) };
    }
    return null;
  }

  function cliquer(x: number, y: number): void {
    const c = rendu.cibleDuClic(x, y);
    if (!c) return;
    const choisis = robotsDuPanneau(ui.panneau()).filter((id) => monde.robots.some((r) => r.id === id));
    const rienDeChoisi = !morrisChoisi && choisis.length === 0;
    let r: string | null = null;
    // Clic intelligent (sauf monstre et chantier, gérés plus bas) : les robots prennent le travail qui va avec.
    const ordre = c.type === "monstre" ? null : ordreSous(x, y, c, choisis);
    if (ordre && !(c.type === "batiment" && !monde.batiments.find((b) => b.id === c.id)?.construit)) {
      r = ordre.faire();
      if (!r) {
        ui.message(`${ordre.texte.replace(/^\S+ /, "")} : c'est parti !`);
        // Ordre donné : on lâche les robots. Sinon, le clic suivant sur le sol les enverrait
        // se promener… et ils arrêteraient le travail qu'on vient de leur donner.
        if (!morrisChoisi) ui.ouvrir(null);
      }
      if (morrisChoisi && c.type !== "batiment") {
        const p = rendu.solSous(x, y);
        if (p) C.deplacerMorris(monde, p.x, p.z);
      }
      if (r) ui.message(r);
      return;
    }
    switch (c.type) {
      case "sol":
        // On déplace ce qui est choisi, et seulement ça.
        if (rienDeChoisi) {
          ui.message("Clique d'abord sur Morris ou sur un robot, puis sur le sol.");
          break;
        }
        if (morrisChoisi) {
          r = C.deplacerMorris(monde, c.x, c.z);
          affichage.suivre.actif = true;
        }
        if (choisis.length > 0) r = C.deplacerRobots(monde, choisis, c.x, c.z) ?? r;
        break;
      case "morris":
        choisir(true, []);
        break;
      case "robot":
        choisir(false, [c.id]);
        break;
      case "monstre": {
        // Ceux qui sont choisis attaquent.
        if (rienDeChoisi) {
          ui.message("Clique d'abord sur Morris ou sur un robot, puis sur le monstre.");
          break;
        }
        let partis = 0;
        for (const id of choisis) {
          const refus = C.robotAttaque(monde, id, c.id);
          if (refus) r = refus;
          else partis += 1;
        }
        if (morrisChoisi) {
          r = C.attaquer(monde, c.id) ?? (partis > 0 ? null : r);
          affichage.suivre.actif = true;
        }
        if (partis > 0) {
          if (!morrisChoisi) r = null;
          const nom = monde.robots.find((x) => x.id === choisis[0])!.nom;
          ui.message(partis === 1 && choisis.length === 1 ? `${nom} attaque !` : `${partis} robots attaquent !`);
        }
        break;
      }
      case "coffre":
        if (!morrisChoisi) {
          ui.message("Clique d'abord sur Morris : c'est lui qui ouvre les coffres.");
          break;
        }
        r = C.allerAuCoffre(monde, c.id);
        affichage.suivre.actif = true;
        break;
      case "caisse":
        if (!morrisChoisi) {
          ui.message("Clique d'abord sur Morris : c'est lui qui ouvre la caisse.");
          break;
        }
        r = C.allerALaCaisse(monde);
        affichage.suivre.actif = true;
        break;
      case "batiment": {
        const b = monde.batiments.find((x) => x.id === c.id);
        if (b && !b.construit && !rienDeChoisi) {
          // Un chantier : tous ceux qui sont choisis vont le construire, et restent choisis.
          if (choisis.length > 0) {
            r = C.robotsConstruisent(monde, choisis, b.id);
            if (!r) ui.message(choisis.length === 1 ? "Le robot va construire ce chantier." : `${choisis.length} robots vont construire ensemble : ça ira plus vite !`);
          }
          if (morrisChoisi) r = C.aiderAConstruire(monde, b.id) ?? r;
          break;
        }
        if (b?.construit && b.type === "cloche") r = C.sonnerCloche(monde);
        ui.ouvrir({ type: "batiment", id: c.id });
        break;
      }
      case "objet":
        break;
    }
    if (r) ui.message(r);
  }

  // ---------- Étiquettes (noms des robots) ----------
  const noms = new Map<number, HTMLElement>();
  function placerEtiquettes(): void {
    const vus = new Set<number>();
    for (const r of monde.robots) {
      vus.add(r.id);
      let e = noms.get(r.id);
      if (!e) {
        e = document.createElement("span");
        e.className = "nom-robot";
        ui.etiquettes.append(e);
        noms.set(r.id, e);
      }
      const texte = r.etat === "casse" ? `${r.nom} 💥` : r.nom;
      if (e.textContent !== texte) e.textContent = texte;
      const p = rendu.aLEcran(r.x, 2.1, r.z);
      e.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      e.style.display = p.visible && etat === "jeu" ? "" : "none";
    }
    for (const [id, e] of noms) {
      if (!vus.has(id)) {
        e.remove();
        noms.delete(id);
      }
    }
  }

  // ---------- Événements de la simulation → sons et paroles de Lumo ----------
  function lireEvenements(): void {
    for (const e of monde.evenements) {
      switch (e.type) {
        case "lumo":
          ui.lumo(e.texte, e.important);
          sons.lumo();
          break;
        case "coup":
          sons.coup();
          break;
        case "vaincu":
          sons.vaincu();
          break;
        case "coeur":
        case "niveau":
          sons.soin();
          break;
        case "tir":
          if (rendu.aLEcran(e.x, 1, e.z).visible) sons.tir();
          break;
        case "cloche":
          sons.cloche();
          break;
        case "construit":
          sons.construit();
          break;
        case "robot":
          sons.robot();
          break;
        case "nuit":
          sons.nuit();
          break;
        case "depot": {
          const p = rendu.aLEcran(e.x, 2.6, e.z);
          const ICONES: Record<string, string> = { bois: "🪵", nourriture: "🍎", metal: "⚙️", eclats: "✨" };
          if (p.visible) {
            ui.nombreVolant(p.x, p.y, `+${e.quantite} ${ICONES[e.quoi] ?? "🥕"}`);
            sons.robotDepot();
          }
          break;
        }
        case "ramasse":
          ui.message(e.quoi);
          sons.ramasse();
          break;
        case "enigme":
          sons.coffre();
          ui.enigme(e.coffreId);
          break;
        case "tresor":
          sons.tresor();
          break;
        default:
          break;
      }
    }
  }

  // Bruits de pas : un pas toutes les ~0,34 s à vitesse normale, plus lents si Morris a faim.
  let prochainPas = 0;
  function bruitsDePas(ms: number): void {
    if (etat !== "jeu" || enPause || ui.modalOuverte() || monde.morris.animation !== "marche") {
      prochainPas = 0;
      return;
    }
    prochainPas -= ms;
    if (prochainPas <= 0) {
      sons.pas();
      prochainPas = reglages.son.intervallePasMs * (reglages.morris.vitesse / vitesseMorris(monde));
    }
  }

  const horloge = new Horloge(T);
  engine.runRenderLoop(() => {
    const ms = Math.min(engine.getDeltaTime(), 100);
    if (etat === "jeu" && !enPause && !ui.modalOuverte()) {
      horloge.ecouler(monde, ms);
      tempsJoueMs += ms;
      if (monde.tick - tickSauvegarde >= reglages.jeu.sauvegardeAutoSecondes * T) sauver();
    }
    lireEvenements();
    bruitsDePas(ms);
    if (etat === "jeu") affichage.deplacerCamera(touches, souris, ms, monde.morris);
    rendu.selection.robotIds = robotsDuPanneau(ui.panneau());
    rendu.selection.morris = morrisChoisi && etat === "jeu";
    rendu.synchroniser(monde, ms);
    monde.evenements = [];
    terrain.mettreAJourBrouillard(monde);
    terrain.animerEau(performance.now() / 1000);
    affichage.mettreAJourAmbiance(monde);
    if (etat === "jeu") ui.mettreAJour(monde);
    placerEtiquettes();
    if (etat === "jeu") verifierAlerteCamp();
    if (etat === "jeu") crepiterFeu();
    if (etat === "jeu") choisirMusique(ms);
    scene.render();
    if (etat === "jeu") verifierFin();
  });

  // ---------- La musique suit le jeu : jour, nuit, ou combat dès qu'un monstre approche ----------
  let enCombat = false;
  let calme = 0;
  function choisirMusique(ms: number): void {
    const R = reglagesMusique.distanceCombat;
    const L = monde.carte.largeur;
    const { morris } = monde;
    // Un monstre encore caché dans le brouillard ne compte pas : on ne le voit pas venir.
    const proche = monde.monstres.some(
      (m) =>
        monde.brouillard[Math.floor(m.z) * L + Math.floor(m.x)] === 1 &&
        (Math.hypot(m.x - morris.x, m.z - morris.z) < R || Math.hypot(m.x - LIEUX.camp.x, m.z - LIEUX.camp.z) < R),
    );
    if (proche) {
      if (!enCombat) sons.monstre();
      enCombat = true;
      calme = 0;
    } else if (enCombat && !enPause) {
      // On attend un peu de calme avant de quitter la musique de combat (pas de va-et-vient).
      calme += ms / 1000;
      if (calme >= reglagesMusique.calmeApresCombatSecondes) enCombat = false;
    }
    const moment: Moment = enCombat ? "combat" : monde.temps.nuit ? "nuit" : "jour";
    sons.ambiance(moment);
    sons.nature(monde.temps.nuit);
  }

  // ---------- Le feu de camp crépite quand on regarde le camp ----------
  let prochainCrepitement = 0;
  function crepiterFeu(): void {
    const t = performance.now();
    if (t < prochainCrepitement) return;
    prochainCrepitement = t + 250 + Math.random() * 600;
    const d = Math.hypot(affichage.camera.target.x - LIEUX.feu.x, affichage.camera.target.z - LIEUX.feu.z);
    sons.feu(Math.max(0, 1 - d / reglages.son.distanceFeu));
  }

  // ---------- Flèche d'alerte : le camp est attaqué hors de l'écran ----------
  let derniereAlerteVue = 0;
  function verifierAlerteCamp(): void {
    if (performance.now() - derniereAlerteVue < 250) return;
    derniereAlerteVue = performance.now();
    const R = reglages.interface.rayonAlerteCamp;
    const attaque = monde.monstres.some((m) => m.type !== "sanglier" && Math.hypot(m.x - LIEUX.camp.x, m.z - LIEUX.camp.z) < R);
    if (!attaque) return ui.alerteCamp(null);
    const p = rendu.aLEcran(LIEUX.camp.x, 0, LIEUX.camp.z);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const marge = 48;
    if (p.visible && p.x > marge && p.x < w - marge && p.y > marge && p.y < h - marge) return ui.alerteCamp(null);
    // Sur le bord de l'écran, dans la direction du camp.
    const cx = w / 2;
    const cy = h / 2;
    const angle = Math.atan2(p.y - cy, p.x - cx);
    const k = Math.min((w / 2 - marge) / Math.abs(Math.cos(angle) || 1e-6), (h / 2 - marge) / Math.abs(Math.sin(angle) || 1e-6));
    ui.alerteCamp({ x: cx + Math.cos(angle) * k, y: cy + Math.sin(angle) * k, angle });
  }

  function verifierFin(): void {
    if (monde.fin === "en-cours") {
      if (tempsJoueMs >= prochainePause) {
        prochainePause += reglages.jeu.pauseToutesLesMinutes * 60_000;
        enPause = true;
        void ecrans.pauseConseillee(Math.round(tempsJoueMs / 60_000), reglages.jeu.dureePauseConseilleeMinutes).then(() => {
          ecrans.cacher();
          enPause = false;
        });
      }
      return;
    }
    etat = "fin";
    racineUi.classList.add("cache");
    if (monde.fin === "defaite") {
      // Morris se relève au camp : la partie continue, rien n'est perdu.
      window.setTimeout(async () => {
        await ecrans.defaite();
        ecrans.cacher();
        C.seRelever(monde);
        lancerPartie(monde);
        sauver();
      }, 2500);
    } else {
      sons.victoire();
      window.setTimeout(async () => {
        await ecrans.bilan(monde);
        await ecrans.aSuivre();
        void menu();
      }, 2500);
    }
  }

  function lancerPartie(m: Monde): void {
    annulerPlacement();
    monde = m;
    morrisChoisi = true;
    tickSauvegarde = monde.tick;
    etat = "jeu";
    enPause = false;
    racineUi.classList.remove("cache");
    ui.fermerTout();
    affichage.suivre.actif = true;
    affichage.camera.target.set(monde.morris.x, 0, monde.morris.z);
  }

  /** Menu principal. `enPauseDerriere` : la partie en cours, figée derrière le menu, reprise telle quelle. */
  async function menu(enPauseDerriere?: Monde): Promise<void> {
    etat = "menu";
    racineUi.classList.add("cache");
    const zoom = affichage.camera.radius;
    if (!enPauseDerriere) {
      monde = creerMonde(reglages);
      affichage.camera.radius = 46;
    }
    const choix = await ecrans.titre(enPauseDerriere !== undefined || derniereSauvegarde !== null);
    sons.activer();
    ecrans.cacher();
    if (choix === "continuer" && enPauseDerriere) {
      lancerPartie(enPauseDerriere);
      affichage.camera.radius = zoom;
      return;
    }
    if (choix === "continuer" && derniereSauvegarde) {
      try {
        lancerPartie(deserialiser(derniereSauvegarde));
        return;
      } catch (e) {
        erreurs.push(`Sauvegarde illisible : ${String(e)}`);
      }
    }
    // Nouvelle partie : la scène du crash, puis on joue.
    monde = creerMonde(reglages);
    etat = "cinematique";
    const terminer = () => {
      ecrans.boutonPasser(null);
      ecrans.sousTitre(null);
      lancerPartie(monde);
      sauver();
    };
    const arreter = jouerCrash(
      affichage,
      rendu.epave,
      gabarits.epave,
      (t) => ecrans.sousTitre(t),
      () => sons.crash(),
      terminer,
    );
    ecrans.boutonPasser(() => arreter());
  }

  // Accès pour les tests automatiques uniquement.
  (window as unknown as { __vulkara: unknown }).__vulkara = {
    monde: () => monde,
    etat: () => etat,
    commandes: C,
    aLEcran: rendu.aLEcran,
    scene,
    /** Le morceau de musique qui joue, « moment:nom » (tests). */
    musique: () => sons.morceau(),
    /** Fait avancer la simulation de n pas d'un coup (tests). */
    avancer: (n: number) => {
      for (let i = 0; i < n; i += 1) avancer(monde);
    },
  };

  void menu();
}

void demarrer();
