import "@fontsource/cinzel/600.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/700.css";
import "./style.css";

import { reglages } from "./sim/reglages";
import { creerMonde, Horloge, type Monde } from "./sim/monde";
import { deserialiser, serialiser } from "./sim/sauvegarde";
import { creerAffichage, deplacerCamera } from "./render/scene";
import { creerInterface } from "./ui/interface";
import { chargerSauvegarde, envoyerSauvegarde, envoyerSignalement } from "./serveur";

const SAUVEGARDE_AUTO_MS = 30_000;

// Journal des erreurs, joint au signalement d'un problème.
const erreurs: string[] = [];
window.addEventListener("error", (e) => erreurs.push(`${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener("unhandledrejection", (e) => erreurs.push(`Promesse rejetée : ${String(e.reason)}`));

async function demarrer(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
  const racineUi = document.querySelector<HTMLElement>("#interface")!;

  let monde: Monde = creerMonde(reglages);
  const existante = await chargerSauvegarde();
  if (existante) {
    try {
      monde = deserialiser(existante);
    } catch (e) {
      erreurs.push(`Sauvegarde illisible : ${String(e)}`);
    }
  }

  const { engine, scene, camera } = creerAffichage(canvas, monde);

  const ui = creerInterface(racineUi, async () => {
    const ok = await envoyerSignalement({
      date: new Date().toISOString(),
      capture: canvas.toDataURL("image/png"),
      erreurs: [...erreurs],
      navigateur: navigator.userAgent,
      sauvegarde: serialiser(monde),
    });
    ui.message(ok ? "Merci ! Le problème est enregistré." : "Impossible d'enregistrer le problème.");
  });

  const touches = new Set<string>();
  window.addEventListener("keydown", (e) => touches.add(e.key));
  window.addEventListener("keyup", (e) => touches.delete(e.key));

  const horloge = new Horloge(reglages.simulation.ticksParSeconde);
  engine.runRenderLoop(() => {
    const ms = engine.getDeltaTime();
    horloge.ecouler(monde, ms);
    deplacerCamera(camera, touches, ms);
    ui.mettreAJour(monde);
    scene.render();
  });

  const sauver = () => void envoyerSauvegarde(serialiser(monde));
  window.setInterval(sauver, SAUVEGARDE_AUTO_MS);
  window.addEventListener("pagehide", sauver);

  // Accès pour les tests automatiques uniquement.
  (window as unknown as { __vulkara: unknown }).__vulkara = { monde: () => monde };
}

void demarrer();
