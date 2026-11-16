// Petits modèles fabriqués directement dans le jeu, avec des formes simples (style low-poly) :
// Lumo, les robots de tâches, les monstres, la cloche, les légumes, les éclats et le cœur.
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Legume } from "../sim/types";

const materiaux = new Map<string, StandardMaterial>();

/** Matériau partagé (une couleur, éventuellement lumineuse). */
export function mat(scene: Scene, hex: string, lumineux = 0): StandardMaterial {
  const cle = `${hex}|${lumineux}`;
  const deja = materiaux.get(cle);
  if (deja) return deja;
  const m = new StandardMaterial(`mat-${cle}`, scene);
  const c = Color3.FromHexString(hex);
  m.diffuseColor = c;
  m.specularColor = new Color3(0.08, 0.08, 0.08);
  if (lumineux > 0) m.emissiveColor = c.scale(lumineux);
  materiaux.set(cle, m);
  return m;
}

function piece(m: Mesh, parent: TransformNode, materiau: StandardMaterial, x: number, y: number, z: number): Mesh {
  m.parent = parent;
  m.position.set(x, y, z);
  m.material = materiau;
  return m;
}

export interface Modele3D {
  racine: TransformNode;
  corps: TransformNode;
  lueur: TransformNode;
  ombres: Mesh[];
}

function nouveau(scene: Scene, nom: string): Modele3D {
  const racine = new TransformNode(nom, scene);
  const corps = new TransformNode(`${nom}-corps`, scene);
  const lueur = new TransformNode(`${nom}-lueur`, scene);
  corps.parent = racine;
  lueur.parent = racine;
  return { racine, corps, lueur, ombres: [] };
}

/** Lumo : petit robot volant, rond, avec un grand œil bleu. */
export function fabriquerLumo(scene: Scene): Modele3D {
  const m = nouveau(scene, "lumo");
  const coque = piece(CreateSphere("lumo-coque", { diameter: 0.62, segments: 8 }, scene), m.corps, mat(scene, "#e8ecef"), 0, 0, 0);
  piece(CreateTorus("lumo-anneau", { diameter: 0.7, thickness: 0.07, tessellation: 16 }, scene), m.corps, mat(scene, "#f0a63a"), 0, 0, 0);
  const oeil = piece(CreateCylinder("lumo-oeil", { diameter: 0.3, height: 0.08, tessellation: 12 }, scene), m.corps, mat(scene, "#4fd2ff", 1), 0, 0.04, 0.29);
  oeil.rotation.x = Math.PI / 2;
  piece(CreateCylinder("lumo-antenne", { diameter: 0.04, height: 0.3 }, scene), m.corps, mat(scene, "#9aa4ad"), 0, 0.42, 0);
  piece(CreateSphere("lumo-bout", { diameter: 0.11, segments: 6 }, scene), m.lueur, mat(scene, "#ffd86b", 1), 0, 0.6, 0);
  m.ombres.push(coque);
  return m;
}

export const COULEURS_ROBOTS = ["#f08a24", "#2f7fe0", "#38b26a", "#9b59d0", "#e8c22c"];

/** Robot de tâches : cubique, né d'une graine-cube. */
export function fabriquerRobot(scene: Scene, nom: string, couleur: string): Modele3D {
  const m = nouveau(scene, nom);
  const c = mat(scene, couleur);
  const sombre = mat(scene, "#2c3238");
  const corps = piece(CreateBox(`${nom}-corps`, { width: 0.75, height: 0.6, depth: 0.6 }, scene), m.corps, c, 0, 0.55, 0);
  const tete = piece(CreateBox(`${nom}-tete`, { width: 0.55, height: 0.42, depth: 0.5 }, scene), m.corps, mat(scene, "#dfe4e8"), 0, 1.08, 0);
  piece(CreateBox(`${nom}-visiere`, { width: 0.46, height: 0.2, depth: 0.05 }, scene), m.corps, sombre, 0, 1.1, 0.26);
  piece(CreateBox(`${nom}-oeilG`, { width: 0.09, height: 0.09, depth: 0.04 }, scene), m.lueur, mat(scene, "#5ff0ff", 1), -0.11, 1.1, 0.29);
  piece(CreateBox(`${nom}-oeilD`, { width: 0.09, height: 0.09, depth: 0.04 }, scene), m.lueur, mat(scene, "#5ff0ff", 1), 0.11, 1.1, 0.29);
  piece(CreateCylinder(`${nom}-antenne`, { diameter: 0.04, height: 0.25 }, scene), m.corps, sombre, 0.15, 1.4, 0);
  piece(CreateSphere(`${nom}-bout`, { diameter: 0.08, segments: 4 }, scene), m.lueur, mat(scene, couleur, 0.9), 0.15, 1.54, 0);
  piece(CreateBox(`${nom}-chenilleG`, { width: 0.18, height: 0.28, depth: 0.7 }, scene), m.corps, sombre, -0.36, 0.16, 0);
  piece(CreateBox(`${nom}-chenilleD`, { width: 0.18, height: 0.28, depth: 0.7 }, scene), m.corps, sombre, 0.36, 0.16, 0);
  piece(CreateBox(`${nom}-brasG`, { width: 0.12, height: 0.4, depth: 0.12 }, scene), m.corps, c, -0.46, 0.55, 0.1);
  piece(CreateBox(`${nom}-brasD`, { width: 0.12, height: 0.4, depth: 0.12 }, scene), m.corps, c, 0.46, 0.55, 0.1);
  m.ombres.push(corps, tete);
  return m;
}

/** Scarabée lumineux : carapace sombre avec des taches qui brillent. */
export function fabriquerScarabee(scene: Scene, nom: string): Modele3D {
  const m = nouveau(scene, nom);
  const carapace = CreateSphere(`${nom}-carapace`, { diameter: 1, segments: 6 }, scene);
  carapace.scaling.set(0.75, 0.42, 1);
  piece(carapace, m.corps, mat(scene, "#1d3b44"), 0, 0.35, 0);
  piece(CreateSphere(`${nom}-tete`, { diameter: 0.38, segments: 5 }, scene), m.corps, mat(scene, "#13262c"), 0, 0.3, 0.52);
  for (const [x, z] of [
    [-0.2, 0.15],
    [0.2, 0.15],
    [-0.16, -0.2],
    [0.16, -0.2],
    [0, -0.02],
  ] as const) {
    piece(CreateSphere(`${nom}-tache`, { diameter: 0.16, segments: 4 }, scene), m.lueur, mat(scene, "#59ffd0", 1.2), x, 0.53, z);
  }
  for (let i = 0; i < 3; i += 1) {
    for (const cote of [-1, 1]) {
      const patte = piece(CreateBox(`${nom}-patte`, { width: 0.4, height: 0.05, depth: 0.05 }, scene), m.corps, mat(scene, "#13262c"), cote * 0.42, 0.18, -0.25 + i * 0.25);
      patte.rotation.z = cote * -0.5;
    }
  }
  m.ombres.push(carapace);
  return m;
}

/** Grignotin : petite boule de poils voleuse, avec de grands yeux jaunes. */
export function fabriquerGrignotin(scene: Scene, nom: string): Modele3D {
  const m = nouveau(scene, nom);
  const poil = mat(scene, "#7a5a8c");
  const boule = piece(CreateSphere(`${nom}-corps`, { diameter: 0.7, segments: 6 }, scene), m.corps, poil, 0, 0.38, 0);
  for (const cote of [-1, 1]) {
    const oreille = piece(CreateCylinder(`${nom}-oreille`, { diameterTop: 0, diameterBottom: 0.2, height: 0.35, tessellation: 4 }, scene), m.corps, poil, cote * 0.2, 0.75, 0);
    oreille.rotation.z = cote * -0.4;
    piece(CreateSphere(`${nom}-oeil`, { diameter: 0.16, segments: 4 }, scene), m.lueur, mat(scene, "#ffe14d", 1.1), cote * 0.13, 0.48, 0.28);
  }
  const queue = piece(CreateCylinder(`${nom}-queue`, { diameter: 0.08, height: 0.5 }, scene), m.corps, poil, 0, 0.35, -0.42);
  queue.rotation.x = 1;
  m.ombres.push(boule);
  return m;
}

/** Sanglier sauvage : massif, avec ses défenses blanches. */
export function fabriquerSanglier(scene: Scene): Modele3D {
  const m = nouveau(scene, "sanglier");
  const poil = mat(scene, "#5a3d2b");
  const fonce = mat(scene, "#3a271c");
  const corps = piece(CreateBox("sanglier-corps", { width: 1.2, height: 1.1, depth: 2 }, scene), m.corps, poil, 0, 1.05, 0);
  piece(CreateBox("sanglier-crete", { width: 0.4, height: 0.3, depth: 1.6 }, scene), m.corps, fonce, 0, 1.7, -0.1);
  const tete = piece(CreateBox("sanglier-tete", { width: 0.9, height: 0.8, depth: 0.8 }, scene), m.corps, poil, 0, 0.95, 1.25);
  tete.rotation.x = 0.25;
  piece(CreateBox("sanglier-groin", { width: 0.45, height: 0.35, depth: 0.25 }, scene), m.corps, mat(scene, "#b98a74"), 0, 0.75, 1.72);
  for (const cote of [-1, 1]) {
    const defense = piece(CreateCylinder("sanglier-defense", { diameterTop: 0, diameterBottom: 0.1, height: 0.45, tessellation: 5 }, scene), m.corps, mat(scene, "#f4efe2"), cote * 0.3, 0.85, 1.75);
    defense.rotation.x = -0.6;
    piece(CreateSphere("sanglier-oeil", { diameter: 0.1, segments: 4 }, scene), m.lueur, mat(scene, "#ff7a2a", 0.8), cote * 0.28, 1.15, 1.62);
    for (const z of [-0.7, 0.7]) piece(CreateBox("sanglier-patte", { width: 0.25, height: 0.6, depth: 0.25 }, scene), m.corps, fonce, cote * 0.4, 0.3, z);
  }
  m.ombres.push(corps, tete);
  return m;
}

/** Cloche d'alarme : deux poteaux, une poutre et une cloche en bronze. */
export function fabriquerCloche(scene: Scene): Modele3D {
  const m = nouveau(scene, "cloche");
  const bois = mat(scene, "#7b5634");
  for (const x of [-0.6, 0.6]) m.ombres.push(piece(CreateBox("cloche-poteau", { width: 0.18, height: 2.4, depth: 0.18 }, scene), m.corps, bois, x, 1.2, 0));
  piece(CreateBox("cloche-poutre", { width: 1.5, height: 0.18, depth: 0.22 }, scene), m.corps, bois, 0, 2.4, 0);
  const cloche = piece(CreateCylinder("cloche-cloche", { diameterTop: 0.3, diameterBottom: 0.65, height: 0.6, tessellation: 10 }, scene), m.corps, mat(scene, "#c99a3b"), 0, 1.95, 0);
  m.ombres.push(cloche);
  return m;
}

const COULEURS_LEGUMES: Record<Legume, [string, number]> = {
  lumirave: ["#3fa4ff", 0.9],
  croquerouge: ["#e0402c", 0.15],
  "bulle-courge": ["#5cc24a", 0.2],
  patatonnerre: ["#f5d23a", 0.35],
  givrotte: ["#f4f8ff", 0.45],
  "pique-chou": ["#8a4fc8", 0.25],
};

/** Un légume de Vulkara dans sa parcelle (taille selon sa pousse). */
export function fabriquerLegume(scene: Scene, legume: Legume, nom: string): Mesh {
  const [couleur, lum] = COULEURS_LEGUMES[legume];
  const m = mat(scene, couleur, lum);
  let forme: Mesh;
  switch (legume) {
    case "lumirave":
      forme = CreateCylinder(nom, { diameterTop: 0.5, diameterBottom: 0.05, height: 0.6, tessellation: 6 }, scene);
      break;
    case "croquerouge":
      forme = CreateSphere(nom, { diameter: 0.55, segments: 5 }, scene);
      break;
    case "bulle-courge":
      forme = CreateSphere(nom, { diameter: 0.7, segments: 6 }, scene);
      forme.scaling.y = 0.75;
      break;
    case "patatonnerre":
      forme = CreatePolyhedron(nom, { type: 2, size: 0.28 }, scene);
      break;
    case "givrotte":
      forme = CreatePolyhedron(nom, { type: 1, size: 0.3 }, scene);
      break;
    case "pique-chou":
      forme = CreatePolyhedron(nom, { type: 3, size: 0.3 }, scene);
      break;
  }
  forme.material = m;
  forme.isPickable = false;
  return forme;
}

export function couleurLegume(l: Legume): string {
  return COULEURS_LEGUMES[l][0];
}

export function fabriquerEclat(scene: Scene, nom: string): Mesh {
  const e = CreatePolyhedron(nom, { type: 1, size: 0.22 }, scene);
  e.scaling.y = 1.6;
  e.material = mat(scene, "#7ff4ff", 1.2);
  e.isPickable = false;
  return e;
}

export function fabriquerCoeur(scene: Scene): TransformNode {
  const r = new TransformNode("coeur", scene);
  const rouge = mat(scene, "#ff3b5c", 0.8);
  for (const x of [-0.17, 0.17]) piece(CreateSphere("coeur-boule", { diameter: 0.42, segments: 8 }, scene), r, rouge, x, 0.1, 0);
  const pointe = piece(CreateCylinder("coeur-pointe", { diameterTop: 0.66, diameterBottom: 0, height: 0.5, tessellation: 4 }, scene), r, rouge, 0, -0.18, 0);
  pointe.rotation.y = Math.PI / 4;
  pointe.scaling.z = 0.5;
  return r;
}

/** Buisson sauvage : une boule de feuillage à facettes (gabarit pour les instances, posée à y = 0.4). */
export function fabriquerBuisson(scene: Scene): Mesh {
  const m = CreateSphere("gabarit-buisson", { diameter: 1.4, segments: 3 }, scene);
  m.convertToFlatShadedMesh();
  m.material = mat(scene, "#3f8f3a");
  return m;
}

/** La tente de Morris, sortie du vaisseau : une toile orange tendue sur deux pans. */
export function fabriquerTente(scene: Scene): Modele3D {
  const m = nouveau(scene, "tente");
  const toile = mat(scene, "#e0782f");
  const fonce = mat(scene, "#9b4a1c");
  for (const cote of [-1, 1]) {
    const pan = piece(CreateBox("tente-pan", { width: 1.9, height: 0.06, depth: 2.6 }, scene), m.corps, toile, cote * 0.68, 0.95, 0);
    pan.rotation.z = cote * -0.95;
    m.ombres.push(pan);
  }
  piece(CreateBox("tente-fond", { width: 0.06, height: 1.6, depth: 0.06 }, scene), m.corps, fonce, 0, 0.8, -1.3);
  piece(CreateBox("tente-avant", { width: 0.06, height: 1.6, depth: 0.06 }, scene), m.corps, fonce, 0, 0.8, 1.3);
  const porte = piece(CreateCylinder("tente-entree", { diameterTop: 0, diameterBottom: 1.3, height: 1.4, tessellation: 3 }, scene), m.corps, mat(scene, "#3a2418"), 0, 0.68, 1.29);
  porte.scaling.z = 0.05;
  return m;
}

/** Le potager : un carré de terre surélevé, bordé de planches. */
export function fabriquerPotager(scene: Scene): Modele3D {
  const m = nouveau(scene, "potager");
  const terre = piece(CreateBox("potager-terre", { width: 3.6, height: 0.3, depth: 2.4 }, scene), m.corps, mat(scene, "#5b3a22"), 0, 0.15, 0);
  terre.receiveShadows = true;
  const planche = mat(scene, "#9a6a3c");
  for (const [w, d, x, z] of [
    [3.8, 0.15, 0, 1.25],
    [3.8, 0.15, 0, -1.25],
    [0.15, 2.6, 1.85, 0],
    [0.15, 2.6, -1.85, 0],
  ] as const) {
    m.ombres.push(piece(CreateBox("potager-planche", { width: w, height: 0.4, depth: d }, scene), m.corps, planche, x, 0.2, z));
  }
  return m;
}

/** Le pont : un tablier de planches légèrement bombé, avec deux rambardes. Axe du pont = x local. */
export function fabriquerPont(scene: Scene): Modele3D {
  const m = nouveau(scene, "pont");
  const planche = mat(scene, "#a0703f");
  const sombre = mat(scene, "#6e4a28");
  const longueur = 7;
  const n = 13;
  const hauteur = (x: number) => 0.35 + 0.55 * (1 - (2 * x / longueur) ** 2);
  for (let i = 0; i < n; i += 1) {
    const x = -longueur / 2 + (i + 0.5) * (longueur / n);
    const p = piece(CreateBox("pont-planche", { width: longueur / n - 0.06, height: 0.16, depth: 2 }, scene), m.corps, i % 2 ? planche : sombre, x, hauteur(x), 0);
    p.receiveShadows = true;
    m.ombres.push(p);
  }
  for (const z of [-0.95, 0.95]) {
    for (const x of [-3.2, -1.6, 0, 1.6, 3.2]) {
      m.ombres.push(piece(CreateBox("pont-poteau", { width: 0.16, height: 0.8, depth: 0.16 }, scene), m.corps, sombre, x, hauteur(x) + 0.4, z));
    }
    // Rambarde en trois morceaux qui suivent la bosse.
    for (const [a, b] of [[-3.2, -1.6], [-1.6, 1.6], [1.6, 3.2]] as const) {
      const ya = hauteur(a) + 0.8;
      const yb = hauteur(b) + 0.8;
      const l = Math.hypot(b - a, yb - ya);
      const r = piece(CreateBox("pont-rambarde", { width: l, height: 0.12, depth: 0.12 }, scene), m.corps, planche, (a + b) / 2, (ya + yb) / 2, z);
      r.rotation.z = Math.atan2(yb - ya, b - a);
      m.ombres.push(r);
    }
  }
  return m;
}

/** Le grenier : une petite grange en bois sur pilotis, avec un toit pointu. */
export function fabriquerGrenier(scene: Scene): Modele3D {
  const m = nouveau(scene, "grenier");
  const bois = mat(scene, "#8a5a32");
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    piece(CreateBox("grenier-pilotis", { width: 0.22, height: 0.5, depth: 0.22 }, scene), m.corps, mat(scene, "#5e3d22"), x, 0.25, z);
  }
  m.ombres.push(piece(CreateBox("grenier-murs", { width: 2.4, height: 1.5, depth: 2.4 }, scene), m.corps, bois, 0, 1.25, 0));
  const toit = piece(CreateCylinder("grenier-toit", { diameter: 3.4, height: 2.7, tessellation: 3 }, scene), m.corps, mat(scene, "#b8452f"), 0, 2.45, 0);
  toit.rotation.z = Math.PI / 2;
  toit.scaling.set(0.55, 1, 1);
  m.ombres.push(toit);
  piece(CreateBox("grenier-porte", { width: 0.8, height: 1, depth: 0.05 }, scene), m.corps, mat(scene, "#4e3220"), 0, 1.1, 1.22);
  return m;
}

/** La lanterne de cristal : un poteau et un cristal lumineux au sommet. */
export function fabriquerLanterne(scene: Scene): Modele3D {
  const m = nouveau(scene, "lanterne");
  m.ombres.push(piece(CreateCylinder("lanterne-poteau", { diameter: 0.16, height: 2, tessellation: 6 }, scene), m.corps, mat(scene, "#4a4f5c"), 0, 1, 0));
  piece(CreateBox("lanterne-socle", { width: 0.5, height: 0.15, depth: 0.5 }, scene), m.corps, mat(scene, "#4a4f5c"), 0, 0.07, 0);
  const cristal = piece(CreatePolyhedron("lanterne-cristal", { type: 1, size: 0.28 }, scene), m.lueur, mat(scene, "#7fe8ff", 1.2), 0, 2.25, 0);
  cristal.scaling.y = 1.5;
  return m;
}

/** La station de recharge : un socle métallique, une borne et un anneau bleu qui brille. */
export function fabriquerStation(scene: Scene): Modele3D {
  const m = nouveau(scene, "station");
  const metal = mat(scene, "#7d8794");
  const socle = piece(CreateCylinder("station-socle", { diameter: 2.6, height: 0.2, tessellation: 8 }, scene), m.corps, metal, 0, 0.1, 0);
  socle.receiveShadows = true;
  m.ombres.push(piece(CreateBox("station-borne", { width: 0.6, height: 1.6, depth: 0.6 }, scene), m.corps, metal, 0, 1, 0));
  piece(CreateBox("station-ecran", { width: 0.4, height: 0.3, depth: 0.05 }, scene), m.corps, mat(scene, "#4fd2ff", 1), 0, 1.3, 0.31);
  const anneau = piece(CreateTorus("station-anneau", { diameter: 2.2, thickness: 0.08, tessellation: 24 }, scene), m.lueur, mat(scene, "#4fd2ff", 1), 0, 0.25, 0);
  anneau.isPickable = false;
  return m;
}

/** Le piège à grignotins : une petite cage en bois, porte relevée. */
export function fabriquerPiege(scene: Scene): Modele3D {
  const m = nouveau(scene, "piege");
  const bois = mat(scene, "#8a5a32");
  piece(CreateBox("piege-fond", { width: 1, height: 0.08, depth: 1 }, scene), m.corps, bois, 0, 0.04, 0);
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) {
    m.ombres.push(piece(CreateBox("piege-barreau", { width: 0.07, height: 0.6, depth: 0.07 }, scene), m.corps, bois, x, 0.3, z));
  }
  piece(CreateBox("piege-toit", { width: 1, height: 0.06, depth: 1 }, scene), m.corps, bois, 0, 0.62, 0);
  // L'appât : une pomme rouge au milieu.
  piece(CreateSphere("piege-appat", { diameter: 0.22, segments: 6 }, scene), m.corps, mat(scene, "#e2452f", 0.2), 0, 0.2, 0);
  return m;
}
