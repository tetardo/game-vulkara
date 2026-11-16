// Scène du crash (moins de 30 secondes, toujours passable) : le vaisseau tombe du ciel et s'écrase.
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { LIEUX } from "../sim/carte";
import type { Affichage } from "./scene";

export interface Etape {
  a: number; // seconde
  texte: string | null;
}

export const ETAPES_CRASH: Etape[] = [
  { a: 0, texte: "Vulkara. Une planète inconnue, très loin d'Élyra." },
  { a: 3.5, texte: "Une tempête frappe le vaisseau de Morris…" },
  { a: 7.2, texte: null },
  { a: 9, texte: "Morris est vivant. Son robot Lumo aussi." },
  { a: 12.5, texte: null },
];
export const DUREE_CRASH = 13.5;

/**
 * Joue la chute du vaisseau. Renvoie une fonction qui arrête tout (bouton « Passer »).
 * `etape` est appelé à chaque sous-titre, `impact` au moment du choc.
 */
export function jouerCrash(
  affichage: Affichage,
  epave: TransformNode,
  vaisseau: Mesh,
  etape: (texte: string | null) => void,
  impact: () => void,
  fin: () => void,
): () => void {
  const { scene, camera } = affichage;
  const cible = new Vector3(LIEUX.epave.x, 0, LIEUX.epave.z);
  const depart = cible.add(new Vector3(-45, 38, 30));
  const chute = vaisseau.clone("vaisseau-chute", null)!;
  chute.setEnabled(true);
  chute.scaling.setAll(3.3);
  epave.setEnabled(false);
  affichage.suivre.actif = false;
  camera.target.copyFrom(cible);
  camera.radius = 55;

  const tex = new DynamicTexture("feu", { width: 32, height: 32 }, scene, false);
  const c = tex.getContext() as CanvasRenderingContext2D;
  const g = c.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  tex.hasAlpha = true;
  tex.update();
  const feu = new ParticleSystem("trainee", 400, scene);
  feu.particleTexture = tex;
  feu.emitter = chute;
  feu.color1 = new Color4(1, 0.7, 0.2, 1);
  feu.color2 = new Color4(1, 0.35, 0.1, 1);
  feu.colorDead = new Color4(0.3, 0.3, 0.3, 0);
  feu.minSize = 0.8;
  feu.maxSize = 2.2;
  feu.minLifeTime = 0.4;
  feu.maxLifeTime = 1.2;
  feu.emitRate = 220;
  feu.minEmitPower = 0.5;
  feu.maxEmitPower = 2;
  feu.blendMode = ParticleSystem.BLENDMODE_ADD;
  feu.start();

  let t = 0;
  let etapeSuivante = 0;
  let choc = false;
  let fini = false;
  const observateur = scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    t += dt;
    while (etapeSuivante < ETAPES_CRASH.length && t >= ETAPES_CRASH[etapeSuivante]!.a) {
      etape(ETAPES_CRASH[etapeSuivante]!.texte);
      etapeSuivante += 1;
    }
    const k = Math.min(1, t / 7);
    const p = Vector3.Lerp(depart, cible, k * k);
    chute.position.copyFrom(p);
    chute.rotation.set(0.5 * k, t * 1.8, -0.4 + Math.sin(t * 6) * 0.15);
    camera.radius = 55 - 18 * Math.min(1, t / 8);
    if (k >= 1 && !choc) {
      choc = true;
      feu.stop();
      chute.setEnabled(false);
      epave.setEnabled(true);
      impact();
    }
    if (choc) {
      // Tremblement de la caméra juste après le choc.
      const s = Math.max(0, 1 - (t - 7) / 1.2);
      camera.target.x = cible.x + (Math.random() - 0.5) * s;
      camera.target.z = cible.z + (Math.random() - 0.5) * s;
    }
    if (t >= DUREE_CRASH) arreter();
  });

  function arreter(): void {
    if (fini) return;
    fini = true;
    scene.onBeforeRenderObservable.remove(observateur);
    feu.dispose();
    tex.dispose();
    chute.dispose();
    epave.setEnabled(true);
    affichage.suivre.actif = true;
    camera.radius = 46;
    etape(null);
    if (!choc) impact();
    fin();
  }
  return arreter;
}
