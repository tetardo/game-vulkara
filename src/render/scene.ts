// Imports ciblés : seul le nécessaire de Babylon.js entre dans le jeu.
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateLineSystem } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { Scene } from "@babylonjs/core/scene";
import type { Monde } from "../sim/monde";

/** Angle fixe de la caméra : vue de biais façon Age of Empires II, sans rotation libre. */
const INCLINAISON = 0.8; // radians depuis la verticale (~46°)
const CHAMP_DE_VISION = 0.45; // étroit : peu de déformation, rendu proche d'une vue isométrique
const ORIENTATION = -Math.PI / 4; // diagonale, comme une vue isométrique
const ZOOM_MIN = 20;
const ZOOM_MAX = 110;

export interface Affichage {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
}

/**
 * Crée le monde 3D. L'affichage ne fait que montrer l'état de la simulation :
 * aucune règle du jeu n'est écrite ici.
 */
export function creerAffichage(canvas: HTMLCanvasElement, monde: Monde): Affichage {
  // adaptToDeviceRatio à false : la 3D est calculée à la taille logique de la fenêtre
  // (≤ 1920 × 1080 sur le MacBook), les menus HTML restent nets en Retina.
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, false);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.75, 0.9, 1);

  const centre = new Vector3(monde.carte.largeur / 2, 0, monde.carte.hauteur / 2);
  const camera = new ArcRotateCamera("camera", ORIENTATION, INCLINAISON, 50, centre, scene);
  camera.fov = CHAMP_DE_VISION;
  camera.lowerRadiusLimit = ZOOM_MIN;
  camera.upperRadiusLimit = ZOOM_MAX;

  // Molette = zoom. Pas de rotation : la vue de biais reste fixe.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camera.radius = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.radius + e.deltaY * 0.02));
    },
    { passive: false },
  );

  const ciel = new HemisphericLight("ciel", new Vector3(0, 1, 0), scene);
  ciel.intensity = 0.7;
  const soleil = new DirectionalLight("soleil", new Vector3(-1, -2, -1), scene);
  soleil.intensity = 0.6;

  const sol = CreateGround(
    "sol",
    { width: monde.carte.largeur, height: monde.carte.hauteur },
    scene,
  );
  sol.position = centre.clone();
  const herbe = new StandardMaterial("herbe", scene);
  herbe.diffuseColor = new Color3(0.42, 0.66, 0.32);
  herbe.specularColor = Color3.Black();
  sol.material = herbe;

  // Grille des cases (aide au développement, sera masquée plus tard).
  const lignes: Vector3[][] = [];
  for (let x = 0; x <= monde.carte.largeur; x += 1) {
    lignes.push([new Vector3(x, 0.01, 0), new Vector3(x, 0.01, monde.carte.hauteur)]);
  }
  for (let z = 0; z <= monde.carte.hauteur; z += 1) {
    lignes.push([new Vector3(0, 0.01, z), new Vector3(monde.carte.largeur, 0.01, z)]);
  }
  const grille = CreateLineSystem("grille", { lines: lignes }, scene);
  grille.color = new Color3(0.32, 0.52, 0.25);
  grille.isPickable = false;

  window.addEventListener("resize", () => engine.resize());
  return { engine, scene, camera };
}

/** Déplace la caméra avec les flèches du clavier (bord de l'écran : plus tard). */
export function deplacerCamera(camera: ArcRotateCamera, touches: Set<string>, ms: number): void {
  const vitesse = (camera.radius / 50) * 0.02 * ms;
  const avant = new Vector3(Math.cos(camera.alpha + Math.PI), 0, Math.sin(camera.alpha + Math.PI));
  const droite = new Vector3(-avant.z, 0, avant.x);
  const d = Vector3.Zero();
  if (touches.has("ArrowUp")) d.addInPlace(avant);
  if (touches.has("ArrowDown")) d.subtractInPlace(avant);
  if (touches.has("ArrowRight")) d.subtractInPlace(droite);
  if (touches.has("ArrowLeft")) d.addInPlace(droite);
  if (d.lengthSquared() > 0) camera.target.addInPlace(d.normalize().scale(vitesse));
}
