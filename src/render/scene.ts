// Imports ciblés : seul le nécessaire de Babylon.js entre dans le jeu.
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Culling/ray";
import "@babylonjs/core/Animations/animatable";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { reglages } from "../sim/reglages";
import type { Monde } from "../sim/monde";
import { LIEUX } from "../sim/carte";

/** Angle fixe de la caméra : vue de biais façon Age of Empires II, sans rotation libre. */
const INCLINAISON = 1.0;
const CHAMP_DE_VISION = 0.5;
const ORIENTATION = -Math.PI / 4;
const ZOOM_MIN = 18;
const ZOOM_MAX = 80;

export interface Affichage {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  ombres: ShadowGenerator;
  lumiereLumo: PointLight;
  /** La caméra suit Morris, sauf si le joueur la déplace lui-même. */
  suivre: { actif: boolean };
  mettreAJourAmbiance(monde: Monde): void;
  /** 1 en plein jour, 0 en pleine nuit (pour les effets du décor). */
  clarte(): number;
  deplacerCamera(touches: Set<string>, souris: { x: number; y: number } | null, ms: number, cible: { x: number; z: number }): void;
}

export function creerAffichage(canvas: HTMLCanvasElement): Affichage {
  // adaptToDeviceRatio à false : la 3D est calculée à la taille logique de la fenêtre
  // (≤ 1920 × 1080 sur le MacBook), les menus HTML restent nets en Retina.
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, false);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.6, 0.78, 0.92, 1);
  scene.ambientColor = new Color3(0.3, 0.3, 0.3);

  // Un style à nous : couleurs un peu plus chaudes et contrastées que les modèles d'origine.
  const ip = scene.imageProcessingConfiguration;
  ip.contrast = 1.15;
  ip.exposure = 1.05;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 1.6;
  ip.vignetteColor = new Color4(0.1, 0.05, 0.15, 0);

  const camera = new ArcRotateCamera("camera", ORIENTATION, INCLINAISON, 46, new Vector3(LIEUX.camp.x, 0, LIEUX.camp.z), scene);
  camera.fov = CHAMP_DE_VISION;
  camera.minZ = 1;
  camera.maxZ = 400;
  camera.lowerRadiusLimit = ZOOM_MIN;
  camera.upperRadiusLimit = ZOOM_MAX;

  // Molette = zoom. Pas de rotation : la vue de biais reste fixe.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camera.radius = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.radius + e.deltaY * 0.03));
    },
    { passive: false },
  );

  const ciel = new HemisphericLight("ciel", new Vector3(0.2, 1, -0.3), scene);
  ciel.groundColor = new Color3(0.35, 0.3, 0.25);
  const soleil = new DirectionalLight("soleil", new Vector3(-0.6, -1.4, 0.8).normalize(), scene);
  soleil.position = new Vector3(LIEUX.camp.x + 30, 60, LIEUX.camp.z - 40);
  const ombres = new ShadowGenerator(2048, soleil);
  ombres.usePercentageCloserFiltering = true;
  ombres.bias = 0.004;
  ombres.normalBias = 0.02;
  ombres.darkness = 0.35;
  soleil.autoCalcShadowZBounds = true;

  const lumiereLumo = new PointLight("lumiereLumo", Vector3.Zero(), scene);
  lumiereLumo.diffuse = new Color3(0.55, 0.85, 1);
  lumiereLumo.range = 11;
  lumiereLumo.intensity = 0;

  const glow = new GlowLayer("lueurs", scene, { mainTextureFixedSize: 512, blurKernelSize: 32 });
  glow.intensity = 0.8;

  const suivre = { actif: true };
  const limite = { x: 90, z: 90 };

  const J = reglages.journee;
  const JOUR = { ciel: new Color3(0.6, 0.78, 0.92), sol: 0.85, soleil: 1.05, couleur: new Color3(1, 0.95, 0.85) };
  const NUIT = { ciel: new Color3(0.04, 0.06, 0.14), sol: 0.22, soleil: 0.12, couleur: new Color3(0.5, 0.6, 1) };
  const SOIR = new Color3(0.95, 0.55, 0.35);

  let clarteActuelle = 1;
  /** 1 en plein jour, 0 en pleine nuit, avec des transitions douces au soir et au matin. */
  function clarte(s: number): number {
    const soir = 30;
    const matin = 20;
    if (s < matin) return 0.3 + 0.7 * (s / matin);
    if (s < J.dureeJour - soir) return 1;
    if (s < J.dureeJour) return 1 - (s - (J.dureeJour - soir)) / soir;
    const fin = J.dureeJour + J.dureeNuit;
    if (s > fin - 10) return 0.3 * (1 - (fin - s) / 10);
    return 0;
  }

  function mettreAJourAmbiance(monde: Monde): void {
    // La caméra reste au-dessus de la carte (qui a grandi avec la sauvegarde v11).
    limite.x = monde.carte.largeur;
    limite.z = monde.carte.hauteur;
    const s = monde.temps.seconde;
    const c = clarte(s);
    clarteActuelle = c;
    const crepuscule = s > J.dureeJour - 40 && s < J.dureeJour + 10 ? 1 - Math.abs(s - (J.dureeJour - 10)) / 30 : 0;
    const fondCiel = Color3.Lerp(NUIT.ciel, JOUR.ciel, c);
    const teinte = Color3.Lerp(fondCiel, SOIR, Math.max(0, crepuscule) * 0.5);
    scene.clearColor = new Color4(teinte.r, teinte.g, teinte.b, 1);
    ciel.intensity = NUIT.sol + (JOUR.sol - NUIT.sol) * c;
    ciel.diffuse = Color3.Lerp(new Color3(0.45, 0.55, 0.9), new Color3(1, 0.98, 0.92), c);
    soleil.intensity = NUIT.soleil + (JOUR.soleil - NUIT.soleil) * c;
    soleil.diffuse = Color3.Lerp(Color3.Lerp(NUIT.couleur, JOUR.couleur, c), SOIR, Math.max(0, crepuscule) * 0.6);
    ombres.darkness = 0.2 + 0.25 * c;
    lumiereLumo.intensity = (1 - c) * 1.6;
    glow.intensity = 0.5 + (1 - c) * 0.6;
    // L'ombre suit la zone regardée.
    soleil.position.set(camera.target.x + 30, 60, camera.target.z - 40);
  }

  function deplacerCamera(touches: Set<string>, souris: { x: number; y: number } | null, ms: number, cible: { x: number; z: number }): void {
    const vitesse = (camera.radius / 34) * 0.03 * ms;
    // Axes de l'écran : haut = (-x, +z), droite = (+x, +z).
    const haut = new Vector3(-Math.SQRT1_2, 0, Math.SQRT1_2);
    const droite = new Vector3(Math.SQRT1_2, 0, Math.SQRT1_2);
    const d = Vector3.Zero();
    if (touches.has("ArrowUp")) d.addInPlace(haut);
    if (touches.has("ArrowDown")) d.subtractInPlace(haut);
    if (touches.has("ArrowRight")) d.addInPlace(droite);
    if (touches.has("ArrowLeft")) d.subtractInPlace(droite);
    // Bord de l'écran, comme dans Age of Empires.
    if (souris) {
      const bord = 14;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (souris.x <= bord) d.subtractInPlace(droite);
      if (souris.x >= w - bord) d.addInPlace(droite);
      if (souris.y <= bord) d.addInPlace(haut);
      if (souris.y >= h - bord) d.subtractInPlace(haut);
    }
    if (d.lengthSquared() > 0) {
      suivre.actif = false;
      camera.target.addInPlace(d.normalize().scale(vitesse));
    } else if (suivre.actif) {
      const k = Math.min(1, ms * 0.004);
      camera.target.x += (cible.x - camera.target.x) * k;
      camera.target.z += (cible.z - camera.target.z) * k;
    }
    camera.target.x = Math.max(4, Math.min(limite.x - 4, camera.target.x));
    camera.target.z = Math.max(4, Math.min(limite.z - 4, camera.target.z));
  }

  window.addEventListener("resize", () => engine.resize());
  return { engine, scene, camera, ombres, lumiereLumo, suivre, mettreAJourAmbiance, deplacerCamera, clarte: () => clarteActuelle };
}
