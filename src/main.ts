import "@fontsource/cinzel/600.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/700.css";
import "./style.css";

import { reglages } from "./sim/reglages";
import { creerMonde, type Monde } from "./sim/monde";
import { avancer, Horloge } from "./sim/simulation";
import { deserialiser, serialiser } from "./sim/sauvegarde";
import * as C from "./sim/commandes";
import { vitesseMorris } from "./sim/morris";
import { caseDEmplacement, casesDuMur, emplacementImpossible, NOMS_BATIMENTS, type Constructible } from "./sim/batiments";
import { EMPRISE } from "./sim/chemin";
import { creerAffichage } from "./render/scene";
import { chargerGabarits, chargerMorris } from "./render/modeles";
import { creerTerrain } from "./render/terrain";
import { creerRendu } from "./render/entites";
import { jouerCrash } from "./render/cinematique";
import { creerInterface } from "./ui/interface";
import { creerEcrans } from "./ui/ecrans";
import { sons } from "./ui/son";
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
    },
    pause(active) {
      enPause = active;
    },
    regarder(x, z) {
      affichage.suivre.actif = false;
      affichage.camera.target.set(x, 0, z);
    },
    menu() {
      sauver();
      annulerPlacement();
      ui.fermerTout();
      void menu();
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

  function sauver(): void {
    if (monde.fin !== "en-cours") return;
    derniereSauvegarde = serialiser(monde);
    tickSauvegarde = monde.tick;
    void envoyerSauvegarde(derniereSauvegarde);
  }

  // ---------- Souris ----------
  const touches = new Set<string>();
  window.addEventListener("keydown", (e) => {
    touches.add(e.key);
    if (e.key === "Escape") {
      annulerPlacement();
      ui.fermerTout();
    }
  });
  window.addEventListener("keyup", (e) => touches.delete(e.key));
  let souris: { x: number; y: number } | null = null;
  let dernierSurvol = 0;
  canvas.addEventListener("pointermove", (e) => {
    souris = { x: e.offsetX, y: e.offsetY };
    if (placement && etat === "jeu") majFantome(e.offsetX, e.offsetY);
    if (etat !== "jeu" || performance.now() - dernierSurvol < 90) return;
    dernierSurvol = performance.now();
    const c = rendu.survol(e.offsetX, e.offsetY);
    canvas.style.cursor = !c || c.type === "sol" ? "default" : c.type === "monstre" ? "crosshair" : "pointer";
  });
  canvas.addEventListener("pointerleave", () => (souris = null));
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
    const c = rendu.cibleDuClic(e.offsetX, e.offsetY);
    if (!c) return;
    let r: string | null = null;
    switch (c.type) {
      case "sol":
        r = C.deplacerMorris(monde, c.x, c.z);
        ui.ouvrir(null);
        rendu.selection.robotId = null;
        affichage.suivre.actif = true;
        break;
      case "robot":
        rendu.selection.robotId = c.id;
        ui.ouvrir({ type: "robot", id: c.id });
        break;
      case "monstre": {
        // Un robot est choisi : c'est lui qui attaque. Sinon, Morris.
        const robot = monde.robots.find((x) => x.id === rendu.selection.robotId);
        if (robot) {
          r = C.robotAttaque(monde, robot.id, c.id);
          if (!r) ui.message(`${robot.nom} attaque !`);
        } else {
          r = C.attaquer(monde, c.id);
          affichage.suivre.actif = true;
        }
        break;
      }
      case "caisse":
        r = C.allerALaCaisse(monde);
        affichage.suivre.actif = true;
        break;
      case "batiment": {
        const b = monde.batiments.find((x) => x.id === c.id);
        rendu.selection.robotId = null;
        if (b && !b.construit) r = C.aiderAConstruire(monde, b.id);
        else if (b?.type === "cloche") r = C.sonnerCloche(monde);
        ui.ouvrir({ type: "batiment", id: c.id });
        break;
      }
      case "objet":
        break;
    }
    if (r) ui.message(r);
  });

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
        case "ramasse":
          ui.message(e.quoi);
          sons.ramasse();
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
    rendu.synchroniser(monde, ms);
    monde.evenements = [];
    terrain.mettreAJourBrouillard(monde);
    terrain.animerEau(performance.now() / 1000);
    affichage.mettreAJourAmbiance(monde);
    if (etat === "jeu") ui.mettreAJour(monde);
    placerEtiquettes();
    scene.render();
    if (etat === "jeu") verifierFin();
  });

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
    tickSauvegarde = monde.tick;
    etat = "jeu";
    enPause = false;
    racineUi.classList.remove("cache");
    ui.fermerTout();
    affichage.suivre.actif = true;
    affichage.camera.target.set(monde.morris.x, 0, monde.morris.z);
  }

  async function menu(): Promise<void> {
    etat = "menu";
    racineUi.classList.add("cache");
    monde = creerMonde(reglages);
    affichage.camera.radius = 46;
    const choix = await ecrans.titre(derniereSauvegarde !== null);
    sons.activer();
    ecrans.cacher();
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
    /** Fait avancer la simulation de n pas d'un coup (tests). */
    avancer: (n: number) => {
      for (let i = 0; i < n; i += 1) avancer(monde);
    },
  };

  void menu();
}

void demarrer();
