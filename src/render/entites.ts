// Affiche l'état de la simulation : décor, camp, personnages, monstres, objets, effets.
// Rien n'est décidé ici : on lit le monde et on place les modèles.
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { EMPRISE } from "../sim/chemin";
import { LIEUX, lieuPont, positionSegment } from "../sim/carte";
import type { Monde } from "../sim/monde";
import { reglages } from "../sim/reglages";
import type { Batiment, Legume, Monstre, Robot } from "../sim/types";
import type { Affichage } from "./scene";
import type { Gabarits, NomModele } from "./modeles";
import {
  COULEURS_ROBOTS,
  fabriquerCloche,
  fabriquerCoeur,
  fabriquerEclat,
  fabriquerGrignotin,
  fabriquerLegume,
  fabriquerLumo,
  fabriquerRobot,
  fabriquerSanglier,
  fabriquerScarabee,
  fabriquerBuisson,
  fabriquerTente,
  fabriquerPotager,
  fabriquerPont,
  mat,
  type Modele3D,
} from "./fabrique";

const ECHELLE_DECOR = 2.6;

/** Ce que l'on peut viser au clic. */
export type Cible =
  | { type: "sol"; x: number; z: number }
  | { type: "robot"; id: number }
  | { type: "monstre"; id: number }
  | { type: "batiment"; id: number }
  | { type: "caisse" }
  | { type: "objet"; id: number };

/** Petit hasard fixe tiré d'un numéro (pour varier tailles et rotations du décor). */
function graine(id: number, k = 0): number {
  const s = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function marquer(n: TransformNode | AbstractMesh, meta: Cible): void {
  n.metadata = meta;
  for (const m of n.getChildMeshes(false)) {
    m.metadata = meta;
    m.isPickable = true;
  }
  if (n instanceof Mesh) n.isPickable = true;
}

/** Texture ronde et floue, pour la fumée et les étincelles. */
function textureParticule(scene: Scene): DynamicTexture {
  const t = new DynamicTexture("particule", { width: 64, height: 64 }, scene, false);
  const c = t.getContext() as CanvasRenderingContext2D;
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  t.hasAlpha = true;
  t.update();
  return t;
}

/** Groupe d'instances légères d'un même modèle (arbres, rochers…). */
class Foule {
  readonly mesh: Mesh;
  private matrices: Matrix[] = [];
  private visibles: boolean[] = [];
  private zero = Matrix.Scaling(0, 0, 0);

  constructor(gabarit: Mesh, nom: string, affichage: Affichage, ombre = true) {
    this.mesh = gabarit.clone(nom, null, true, false)!;
    this.mesh.makeGeometryUnique();
    this.mesh.setEnabled(true);
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = true;
    if (ombre) affichage.ombres.addShadowCaster(this.mesh);
    this.mesh.alwaysSelectAsActiveMesh = true;
  }

  ajouter(m: Matrix): number {
    this.matrices.push(m);
    this.visibles.push(false);
    return this.mesh.thinInstanceAdd(this.zero, false);
  }

  montrer(i: number, visible: boolean): void {
    if (this.visibles[i] === visible) return;
    this.visibles[i] = visible;
    this.mesh.thinInstanceSetMatrixAt(i, visible ? this.matrices[i]! : this.zero, false);
  }

  changer(i: number, m: Matrix): void {
    this.matrices[i] = m;
    if (this.visibles[i]) this.mesh.thinInstanceSetMatrixAt(i, m, false);
  }

  rafraichir(): void {
    this.mesh.thinInstanceBufferUpdated("matrix");
  }
}

function matrice(x: number, y: number, z: number, echelle: number, rotY: number, inclinaison = 0): Matrix {
  return Matrix.Compose(
    new Vector3(echelle, echelle, echelle),
    Quaternion.FromEulerAngles(inclinaison, rotY, inclinaison * 0.5),
    new Vector3(x, y, z),
  );
}

interface VisuelMonstre {
  modele: Modele3D;
  barre: Mesh;
  fond: Mesh;
}

export interface Rendu {
  synchroniser(monde: Monde, ms: number): void;
  cibleDuClic(x: number, y: number): Cible | null;
  survol(x: number, y: number): Cible | null;
  /** Position à l'écran d'un point du monde (pour les étiquettes HTML). */
  aLEcran(x: number, y: number, z: number): { x: number; y: number; visible: boolean };
  selection: { robotId: number | null };
  lumoPosition(): Vector3;
  epave: TransformNode;
  /** Point du sol sous la souris (pour poser un bâtiment). */
  solSous(x: number, y: number): { x: number; z: number } | null;
  /** Carré de placement d'un bâtiment : vert si on peut le poser, rouge sinon. null pour le cacher. */
  fantome(f: { type: string; x: number; z: number; valide: boolean } | null): void;
}

export function creerRendu(affichage: Affichage, gabarits: Gabarits, morrisContainer: AssetContainer, monde0: Monde): Rendu {
  const { scene, ombres } = affichage;
  const texParticule = textureParticule(scene);

  // ---------- Décor : sources et rochers ----------
  const foules = new Map<string, Foule>();
  const foule = (n: NomModele, ombre = true): Foule => {
    let f = foules.get(n);
    if (!f) {
      f = new Foule(gabarits[n], `foule-${n}`, affichage, ombre);
      foules.set(n, f);
    }
    return f;
  };
  const buissons = new Foule(fabriquerBuisson(scene), "buissons", affichage);
  const fruits = new Foule(CreateSphere("fruit", { diameter: 0.22, segments: 4 }, scene), "fruits", affichage, false);
  fruits.mesh.material = mat(scene, "#e2452f", 0.25);
  const noisettes = new Foule(CreateSphere("noisette", { diameter: 0.2, segments: 4 }, scene), "noisettes", affichage, false);
  noisettes.mesh.material = mat(scene, "#9b6a3a");
  scene.getMeshByName("fruit")?.setEnabled(false);
  scene.getMeshByName("gabarit-buisson")?.setEnabled(false);
  scene.getMeshByName("noisette")?.setEnabled(false);

  interface Place {
    cellule: number;
    elements: Array<{ f: Foule; i: number }>;
    vide?: { f: Foule; i: number };
    type: string;
  }
  const places = new Map<number, Place>();
  const largeur = monde0.carte.largeur;
  const cellule = (x: number, z: number) => Math.floor(z) * largeur + Math.floor(x);

  const MODELES_ARBRES: NomModele[] = ["arbreA", "arbreB", "arbreA", "arbreB", "arbresA", "arbresB"];
  for (const s of monde0.sources) {
    const rot = graine(s.id) * Math.PI * 2;
    const p: Place = { cellule: cellule(s.x, s.z), elements: [], type: s.type };
    if (s.type === "arbre") {
      const nom = MODELES_ARBRES[s.variante % MODELES_ARBRES.length]!;
      const ech = (nom.startsWith("arbres") ? 1.5 : ECHELLE_DECOR) * (0.85 + graine(s.id, 1) * 0.35);
      const f = foule(nom);
      p.elements.push({ f, i: f.ajouter(matrice(s.x, 0, s.z, ech, rot)) });
      const fc = foule("arbreCoupe");
      p.vide = { f: fc, i: fc.ajouter(matrice(s.x, 0, s.z, ECHELLE_DECOR * 0.9, rot)) };
    } else if (s.type === "buisson" || s.type === "noisetier") {
      const f = s.type === "buisson" ? buissons : foule("arbreB");
      const ech = s.type === "buisson" ? 0.95 + graine(s.id, 2) * 0.25 : 1.55;
      p.elements.push({ f, i: f.ajouter(matrice(s.x, s.type === "buisson" ? 0.35 : 0, s.z, ech, rot)) });
      const petits = s.type === "buisson" ? fruits : noisettes;
      for (let k = 0; k < 5; k += 1) {
        const a = rot + k * 1.3;
        const r = 0.25 + graine(s.id, k) * 0.15;
        const rr = s.type === "buisson" ? r + 0.25 : r + 0.1;
        p.elements.push({ f: petits, i: petits.ajouter(matrice(s.x + Math.cos(a) * rr, (s.type === "buisson" ? 0.5 : 0.9) + graine(s.id, k + 9) * 0.5, s.z + Math.sin(a) * rr, 1, 0)) });
      }
    } else if (s.type === "debris") {
      const noms: NomModele[] = ["cargoA", "cargoB", "cargoA"];
      const f = foule(noms[s.variante % 3]!);
      p.elements.push({ f, i: f.ajouter(matrice(s.x, -0.1, s.z, 3, rot, 0.35)) });
    } else continue; // l'épave est un modèle à part
    places.set(s.id, p);
  }
  const MODELES_ROCHERS: NomModele[] = ["rocherA", "rocherB", "rocherC", "rocherD"];
  for (const r of monde0.rochers) {
    const f = foule(MODELES_ROCHERS[r.variante % 4]!);
    places.set(r.id, {
      cellule: cellule(r.x, r.z),
      elements: [{ f, i: f.ajouter(Matrix.Compose(new Vector3(r.taille * 4.2, r.taille * 9, r.taille * 4.2), Quaternion.FromEulerAngles(0, graine(r.id) * 6, 0), new Vector3(r.x, -0.05, r.z))) }],
      type: "rocher",
    });
  }
  // Montagnes tout autour de la carte (décor fixe, toujours visible au loin).
  {
    const fa = foule("montagneA", false);
    const fb = foule("montagneB", false);
    const L = monde0.carte.largeur;
    let k = 0;
    for (let t = -6; t <= L + 6; t += 5.5) {
      for (const [x, z] of [
        [t, -4],
        [t, L + 4],
        [-4, t],
        [L + 4, t],
      ] as const) {
        const f = k % 2 === 0 ? fa : fb;
        const i = f.ajouter(matrice(x + graine(k) * 2, 0, z + graine(k, 3) * 2, 4 + graine(k, 2) * 2.5, graine(k, 5) * 6));
        f.montrer(i, true);
        k += 1;
      }
    }
  }
  // Plantes d'eau le long de la rivière (ne bougent pas).
  const plantesEau: Array<{ f: Foule; i: number; c: number }> = [];
  for (let v = 4; v < 176; v += 7) {
    const u = 30 + 3 * Math.sin(v * 0.07) + 1.5 * Math.sin(v * 0.19 + 1) + (graine(v) - 0.5) * 3;
    const x = (v - u) / 2;
    const z = (v + u) / 2;
    if (x < 3 || z < 3 || x > 87 || z > 87) continue;
    const f = graine(v, 2) > 0.5 ? foule("nenuphar", false) : foule("plante", false);
    plantesEau.push({ f, i: f.ajouter(matrice(x, -0.25, z, 2.6, graine(v) * 6)), c: cellule(x, z) });
  }

  let versionVue = -1;
  let versionObs = -1;
  function majDecor(monde: Monde): void {
    if (monde.versionBrouillard === versionVue && monde.versionObstacles === versionObs) return;
    versionVue = monde.versionBrouillard;
    versionObs = monde.versionObstacles;
    const restes = new Map(monde.sources.map((s) => [s.id, s.reste]));
    for (const [id, p] of places) {
      const vu = monde.brouillard[p.cellule] === 1;
      const reste = restes.get(id);
      const epuise = reste !== undefined && reste <= 0;
      for (const [k, e] of p.elements.entries()) {
        // Un buisson cueilli garde ses feuilles mais perd ses fruits.
        const garder = (p.type === "buisson" || p.type === "noisetier") && k === 0;
        e.f.montrer(e.i, vu && (!epuise || garder));
      }
      if (p.vide) p.vide.f.montrer(p.vide.i, vu && epuise);
    }
    for (const pe of plantesEau) pe.f.montrer(pe.i, monde.brouillard[pe.c] === 1);
    for (const f of foules.values()) f.rafraichir();
    for (const f of [buissons, fruits, noisettes]) f.rafraichir();
  }

  // ---------- L'épave du vaisseau ----------
  const epave = new TransformNode("epave", scene);
  const coque = gabarits.epave.clone("epave-coque", epave)!;
  coque.setEnabled(true);
  coque.scaling.setAll(3.3);
  coque.rotation.set(0.35, 0.8, -0.25);
  coque.position.y = -0.6;
  ombres.addShadowCaster(coque);
  coque.receiveShadows = true;
  epave.position.set(LIEUX.epave.x, 0, LIEUX.epave.z);
  for (const [n, dx, dz, r] of [
    ["rochesEspace", -2.4, 2, 0.3],
    ["panneau", 2.2, -1.8, 1.2],
    ["cargoB", -2.6, -1.6, 0.6],
  ] as const) {
    const m = gabarits[n].clone(`epave-${n}`, epave)!;
    m.setEnabled(true);
    m.scaling.setAll(2.6);
    m.position.set(dx, -0.05, dz);
    m.rotation.set(0.25, r, 0.15);
    ombres.addShadowCaster(m);
  }
  const fumeeEpave = new ParticleSystem("fumee-epave", 120, scene);
  fumeeEpave.particleTexture = texParticule;
  fumeeEpave.emitter = new Vector3(LIEUX.epave.x + 0.5, 2.5, LIEUX.epave.z);
  fumeeEpave.minEmitBox = new Vector3(-0.4, 0, -0.4);
  fumeeEpave.maxEmitBox = new Vector3(0.4, 0, 0.4);
  fumeeEpave.color1 = new Color4(0.5, 0.5, 0.52, 0.5);
  fumeeEpave.color2 = new Color4(0.35, 0.35, 0.38, 0.4);
  fumeeEpave.colorDead = new Color4(0.3, 0.3, 0.3, 0);
  fumeeEpave.minSize = 0.8;
  fumeeEpave.maxSize = 1.8;
  fumeeEpave.minLifeTime = 2.5;
  fumeeEpave.maxLifeTime = 4.5;
  fumeeEpave.emitRate = 10;
  fumeeEpave.direction1 = new Vector3(-0.2, 1, 0.1);
  fumeeEpave.direction2 = new Vector3(0.3, 1.4, 0.4);
  fumeeEpave.minEmitPower = 0.6;
  fumeeEpave.maxEmitPower = 1.1;
  fumeeEpave.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  fumeeEpave.start();

  // ---------- La caisse mystère ----------
  const caisse = new TransformNode("caisse", scene);
  const boite = gabarits.caisse.clone("caisse-boite", caisse)!;
  boite.setEnabled(true);
  boite.scaling.setAll(5.5);
  boite.rotation.y = 0.4;
  ombres.addShadowCaster(boite);
  const pointInterrogation = CreateSphere("caisse-lueur", { diameter: 0.35, segments: 6 }, scene);
  pointInterrogation.parent = caisse;
  pointInterrogation.position.y = 1.9;
  pointInterrogation.material = mat(scene, "#ffd65a", 1.2);
  caisse.position.set(LIEUX.caisse.x, 0, LIEUX.caisse.z);
  marquer(caisse, { type: "caisse" });

  // ---------- Morris ----------
  morrisContainer.addAllToScene();
  const morris = new TransformNode("morris", scene);
  const racineMorris = morrisContainer.meshes[0]!;
  racineMorris.parent = morris;
  racineMorris.scaling.scaleInPlace(0.9);
  for (const m of morrisContainer.meshes) {
    if (/Knife|Crossbow|Throwable/.test(m.name)) m.setEnabled(false);
    else if (m.getTotalVertices() > 0) {
      ombres.addShadowCaster(m);
      m.receiveShadows = true;
      m.isPickable = false;
    }
  }
  const main = morrisContainer.transformNodes.find((t) => t.name === "handslot.r");
  const baton = gabarits.baton.clone("morris-baton", main ?? null)!;
  const epee = gabarits.epee.clone("morris-epee", main ?? null)!;
  for (const arme of [baton, epee]) {
    arme.setEnabled(false);
    // Le gabarit a été converti dans le repère du jeu : on l'annule pour l'attacher à la main.
    arme.position.setAll(0);
    arme.rotationQuaternion = null;
    arme.rotation.set(0, 0, 0);
    arme.scaling.set(1, 1, -1);
    ombres.addShadowCaster(arme);
  }
  const animations = new Map<string, AnimationGroup>();
  for (const g of morrisContainer.animationGroups) {
    g.stop();
    animations.set(g.name, g);
    for (const ta of g.targetedAnimations) {
      ta.animation.enableBlending = true;
      ta.animation.blendingSpeed = 0.12;
    }
  }
  const NOMS_ANIM: Record<Monde["morris"]["animation"], [string, boolean]> = {
    repos: ["Idle", true],
    marche: ["Running_A", true],
    attaque: ["1H_Melee_Attack_Chop", false],
    tourbillon: ["2H_Melee_Attack_Spin", false],
    construit: ["1H_Melee_Attack_Chop", true],
    touche: ["Hit_A", false],
    ramasse: ["PickUp", false],
  };
  let animEnCours = "";
  function jouerMorris(nom: string, boucle: boolean, vitesse = 1): void {
    if (animEnCours === nom) return;
    animations.get(animEnCours)?.stop();
    animEnCours = nom;
    animations.get(nom)?.start(boucle, vitesse);
  }
  jouerMorris("Idle", true);

  // ---------- Lumo ----------
  const lumo = fabriquerLumo(scene);
  for (const m of lumo.ombres) ombres.addShadowCaster(m);
  const posLumo = new Vector3(LIEUX.depart.x + 1, 2.2, LIEUX.depart.z);

  // ---------- Anneau de sélection ----------
  const anneau = CreateDisc("selection", { radius: 0.75, tessellation: 24 }, scene);
  anneau.rotation.x = Math.PI / 2;
  anneau.material = mat(scene, "#ffe066", 0.9);
  anneau.isPickable = false;
  anneau.setEnabled(false);
  const selection = { robotId: null as number | null };

  // ---------- Robots, monstres, bâtiments, objets ----------
  const robots = new Map<number, Modele3D & { sac: Mesh; numero: number }>();
  const monstres = new Map<number, VisuelMonstre>();
  const batiments = new Map<number, { racine: TransformNode; corps: TransformNode; echafaudage?: Mesh; segments?: Mesh[]; legumes?: Array<Mesh | null>; parcellesVues?: Array<Legume | null> }>();
  const objets = new Map<number, TransformNode | Mesh>();
  const tas = {
    bois: gabarits.bois.clone("tas-bois", null)!,
    nourriture: gabarits.sac.clone("tas-nourriture", null)!,
    metal: gabarits.cargoA.clone("tas-metal", null)!,
  };
  tas.bois.position.set(LIEUX.tente.x - 2.2, 0, LIEUX.tente.z + 0.5);
  tas.nourriture.position.set(LIEUX.tente.x + 0.5, 0, LIEUX.tente.z + 2.2);
  tas.metal.position.set(LIEUX.tente.x - 1.6, 0, LIEUX.tente.z + 2);
  for (const t of Object.values(tas)) ombres.addShadowCaster(t);

  const COULEUR_SAC: Record<string, string> = { bois: "#8a5a32", nourriture: "#d8432f", metal: "#9aa6b0", eclats: "#7ff4ff" };

  function creerRobot3D(r: Robot, numero: number) {
    const m = fabriquerRobot(scene, `robot-${r.id}`, COULEURS_ROBOTS[numero % COULEURS_ROBOTS.length]!);
    for (const o of m.ombres) ombres.addShadowCaster(o);
    const sac = CreateBox(`robot-${r.id}-sac`, { size: 0.42 }, scene);
    sac.parent = m.corps;
    sac.position.set(0, 0.95, -0.42);
    marquer(m.racine, { type: "robot", id: r.id });
    return { ...m, sac, numero };
  }

  function creerMonstre3D(mo: Monstre): VisuelMonstre {
    const modele =
      mo.type === "scarabee" ? fabriquerScarabee(scene, `monstre-${mo.id}`) : mo.type === "grignotin" ? fabriquerGrignotin(scene, `monstre-${mo.id}`) : fabriquerSanglier(scene);
    for (const o of modele.ombres) ombres.addShadowCaster(o);
    const hauteur = mo.type === "sanglier" ? 2.6 : 1.3;
    const fond = CreatePlane(`barre-fond-${mo.id}`, { size: 1 }, scene);
    fond.scaling.set(1.1, 0.14, 1);
    fond.position.y = hauteur;
    fond.parent = modele.racine;
    fond.billboardMode = Mesh.BILLBOARDMODE_ALL;
    fond.material = mat(scene, "#222222", 0.4);
    const barre = CreatePlane(`barre-${mo.id}`, { size: 1 }, scene);
    barre.parent = fond;
    barre.position.z = -0.01;
    barre.material = mat(scene, "#ff5a4f", 0.9);
    fond.isPickable = false;
    barre.isPickable = false;
    fond.setEnabled(false);
    marquer(modele.racine, { type: "monstre", id: mo.id });
    return { modele, barre, fond };
  }

  function creerBatiment3D(b: Batiment) {
    const racine = new TransformNode(`bat-${b.id}`, scene);
    const corps = new TransformNode(`bat-${b.id}-corps`, scene);
    corps.parent = racine;
    racine.position.set(b.x, 0, b.z);
    const ajouter = (n: NomModele, echelle: number, rotY = 0, y = 0) => {
      const m = gabarits[n].clone(`bat-${b.id}-${n}`, corps)!;
      m.setEnabled(true);
      m.scaling.setAll(echelle);
      m.rotation.y = rotY;
      m.position.y = y;
      ombres.addShadowCaster(m);
      m.receiveShadows = true;
      return m;
    };
    const visuel: { racine: TransformNode; corps: TransformNode; echafaudage?: Mesh; segments?: Mesh[]; legumes?: Array<Mesh | null>; parcellesVues?: Array<Legume | null> } = { racine, corps };
    switch (b.type) {
      case "tente": {
        const t = fabriquerTente(scene);
        t.racine.parent = corps;
        t.racine.rotation.y = -Math.PI / 4;
        for (const o of t.ombres) ombres.addShadowCaster(o);
        ajouter("drapeau", 3, 0).position.set(1.8, 0, -1.2);
        ajouter("tonneau", 3, 0).position.set(-1.6, 0, -1.4);
        break;
      }
      case "potager": {
        const pot = fabriquerPotager(scene);
        pot.racine.parent = corps;
        for (const o of pot.ombres) ombres.addShadowCaster(o);
        visuel.legumes = [null, null, null, null, null, null];
        visuel.parcellesVues = [null, null, null, null, null, null];
        break;
      }
      case "atelier":
        ajouter("atelier", 2.5, -0.6);
        break;
      case "cloche": {
        const c = fabriquerCloche(scene);
        c.racine.parent = corps;
        for (const o of c.ombres) ombres.addShadowCaster(o);
        break;
      }
      case "usine":
        ajouter("usine", 1.45, Math.PI * 0.75);
        break;
      case "palissade": {
        visuel.segments = [];
        for (let i = 0; i < reglages.camp.segmentsPalissade; i += 1) {
          const p = positionSegment(i);
          const m = gabarits[i === 0 ? "barrierePorte" : "barriere"].clone(`palissade-${i}`, null)!;
          m.setEnabled(true);
          m.parent = corps;
          m.position.set(p.x - b.x, 0, p.z - b.z);
          m.rotation.y = -p.angle;
          m.scaling.set(2.3, 2.6, 1.95);
          ombres.addShadowCaster(m);
          visuel.segments.push(m);
        }
        break;
      }
      case "pont": {
        const lp = lieuPont();
        const pont = fabriquerPont(scene);
        pont.racine.parent = corps;
        // L'axe du pont traverse la rivière : direction (-x, +z).
        pont.racine.rotation.y = Math.PI / 4;
        for (const o of pont.ombres) ombres.addShadowCaster(o);
        racine.position.set(lp.x, 0, lp.z);
        break;
      }
    }
    if (b.type !== "tente" && b.type !== "palissade") {
      const e = gabarits.echafaudage.clone(`bat-${b.id}-echafaudage`, racine)!;
      e.setEnabled(!b.construit);
      e.scaling.setAll(b.type === "pont" ? 2.2 : b.type === "cloche" ? 1.1 : 1.8);
      ombres.addShadowCaster(e);
      visuel.echafaudage = e;
    }
    marquer(racine, { type: "batiment", id: b.id });
    if (b.type === "palissade") {
      // Seule la porte est cliquable, pour ne pas gêner les clics au sol.
      for (const m of racine.getChildMeshes()) m.isPickable = false;
    }
    return visuel;
  }

  function particules(x: number, y: number, z: number, couleur: Color4, nombre: number, taille: number, vitesse: number): void {
    const ps = new ParticleSystem("bouffee", nombre, scene);
    ps.particleTexture = texParticule;
    ps.emitter = new Vector3(x, y, z);
    ps.minEmitBox = new Vector3(-0.3, 0, -0.3);
    ps.maxEmitBox = new Vector3(0.3, 0.3, 0.3);
    ps.color1 = couleur;
    ps.color2 = couleur;
    ps.colorDead = new Color4(couleur.r, couleur.g, couleur.b, 0);
    ps.minSize = taille * 0.6;
    ps.maxSize = taille;
    ps.minLifeTime = 0.5;
    ps.maxLifeTime = 1.2;
    ps.direction1 = new Vector3(-1, 1.5, -1);
    ps.direction2 = new Vector3(1, 2.5, 1);
    ps.minEmitPower = vitesse * 0.5;
    ps.maxEmitPower = vitesse;
    ps.manualEmitCount = nombre;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.targetStopDuration = 1.5;
    ps.disposeOnStop = true;
    ps.start();
  }

  let temps = 0;

  function synchroniser(monde: Monde, ms: number): void {
    temps += ms / 1000;
    majDecor(monde);
    const vu = (x: number, z: number) => monde.brouillard[cellule(x, z)] === 1;

    // Effets demandés par la simulation.
    for (const e of monde.evenements) {
      if (e.type === "fumee") particules(e.x, 0.6, e.z, new Color4(0.78, 0.78, 0.82, 0.45), e.grande ? 40 : 18, e.grande ? 1.8 : 1.1, e.grande ? 2.2 : 1.5);
      else if (e.type === "coup") particules(e.x, 1, e.z, new Color4(1, 0.9, 0.5, 1), 10, 0.45, 3);
    }

    // Morris.
    const m = monde.morris;
    morris.position.set(m.x, 0, m.z);
    morris.rotation.y = lerpAngle(morris.rotation.y, m.orientation, Math.min(1, ms * 0.015));
    baton.setEnabled(m.arme === "baton");
    epee.setEnabled(m.arme === "epee");
    if (monde.fin === "defaite") jouerMorris("Death_A", false);
    else if (monde.fin === "victoire") jouerMorris("Cheer", true);
    else {
      const [nom, boucle] = NOMS_ANIM[m.animation];
      jouerMorris(nom, boucle, m.animation === "marche" && m.faim <= 0 ? 0.6 : 1);
    }

    // Lumo flotte derrière l'épaule de Morris.
    const derriere = new Vector3(m.x - Math.sin(m.orientation) * 1.1 + Math.cos(m.orientation) * 0.7, 2.3 + Math.sin(temps * 2.2) * 0.15, m.z - Math.cos(m.orientation) * 1.1 - Math.sin(m.orientation) * 0.7);
    Vector3.LerpToRef(posLumo, derriere, Math.min(1, ms * 0.004), posLumo);
    lumo.racine.position.copyFrom(posLumo);
    lumo.racine.rotation.y = lerpAngle(lumo.racine.rotation.y, Math.atan2(m.x - posLumo.x, m.z - posLumo.z) * 0.3 + m.orientation * 0.7, 0.1);
    affichage.lumiereLumo.position.set(posLumo.x, posLumo.y + 0.5, posLumo.z);

    // Caisse mystère.
    caisse.setEnabled(!monde.caisseOuverte);
    pointInterrogation.position.y = 1.9 + Math.sin(temps * 3) * 0.12;

    // Tas du camp (la réserve).
    tas.bois.setEnabled(monde.ressources.bois > 0);
    tas.bois.scaling.setAll(4 + Math.min(4, monde.ressources.bois / 10));
    tas.nourriture.setEnabled(monde.ressources.nourriture > 0);
    tas.nourriture.scaling.setAll(4.5);
    tas.metal.setEnabled(monde.ressources.metal > 0);
    tas.metal.scaling.setAll(2.4);

    // Robots.
    for (const [i, r] of monde.robots.entries()) {
      let v = robots.get(r.id);
      if (!v) {
        v = creerRobot3D(r, i);
        robots.set(r.id, v);
      }
      v.racine.position.set(r.x, 0, r.z);
      const casse = r.etat === "casse";
      v.racine.rotation.y = lerpAngle(v.racine.rotation.y, r.orientation, Math.min(1, ms * 0.012));
      v.corps.rotation.z = casse ? 1.3 : 0;
      // Au travail (récolte, jardinage) : le robot se penche en rythme.
      v.corps.rotation.x = r.etat === "recolte" ? Math.sin(temps * 7 + r.id) * 0.25 : 0;
      v.corps.position.y = casse ? 0.25 : r.chemin.length > 0 ? Math.abs(Math.sin(temps * 9 + r.id)) * 0.06 : 0;
      v.lueur.setEnabled(!casse);
      v.lueur.rotation.z = v.corps.rotation.z;
      v.lueur.position.y = v.corps.position.y;
      v.sac.setEnabled(!!r.sac && r.sac.quantite > 0);
      if (r.sac) v.sac.material = mat(scene, COULEUR_SAC[r.sac.type] ?? "#8fd16a", r.sac.type in COULEUR_SAC ? 0 : 0.5);
      if (casse && Math.floor(temps * 2) !== Math.floor((temps - ms / 1000) * 2)) particules(r.x, 0.8, r.z, new Color4(0.3, 0.3, 0.3, 0.6), 3, 0.6, 0.8);
    }
    const choisi = monde.robots.find((r) => r.id === selection.robotId);
    anneau.setEnabled(!!choisi);
    if (choisi) anneau.position.set(choisi.x, 0.05, choisi.z);

    // Monstres.
    const presents = new Set<number>();
    for (const mo of monde.monstres) {
      presents.add(mo.id);
      let v = monstres.get(mo.id);
      if (!v) {
        v = creerMonstre3D(mo);
        monstres.set(mo.id, v);
      }
      const r = v.modele.racine;
      r.position.set(mo.x, 0, mo.z);
      r.rotation.y = lerpAngle(r.rotation.y, mo.orientation, Math.min(1, ms * 0.015));
      // Dans le brouillard, on ne voit que leurs lueurs.
      const visible = vu(mo.x, mo.z);
      v.modele.corps.setEnabled(visible);
      v.modele.lueur.setEnabled(visible || monde.temps.nuit);
      if (mo.type === "scarabee") r.position.y = Math.abs(Math.sin(temps * 12 + mo.id)) * 0.05;
      if (mo.type === "grignotin") r.position.y = Math.abs(Math.sin(temps * 14 + mo.id)) * 0.25;
      if (mo.type === "sanglier") {
        v.modele.corps.rotation.z = mo.etat === "etourdi" ? Math.sin(temps * 10) * 0.15 : 0;
        r.position.y = mo.etat === "charge" ? Math.abs(Math.sin(temps * 16)) * 0.15 : 0;
      }
      const blesse = mo.pv < mo.pvMax;
      v.fond.setEnabled(blesse && visible);
      const f = Math.max(0, mo.pv / mo.pvMax);
      v.barre.scaling.x = f;
      v.barre.position.x = -(1 - f) / 2;
    }
    for (const [id, v] of monstres) {
      if (presents.has(id)) continue;
      v.modele.racine.dispose(false, false);
      monstres.delete(id);
    }

    // Bâtiments.
    for (const b of monde.batiments) {
      let v = batiments.get(b.id);
      if (!v) {
        v = creerBatiment3D(b);
        batiments.set(b.id, v);
      }
      const total = b.type === "tente" ? 1 : reglages.batiments[b.type].travail;
      const avance = b.construit ? 1 : Math.min(1, b.travailFait / total);
      if (v.echafaudage) v.echafaudage.setEnabled(!b.construit);
      if (b.type === "palissade" && v.segments && b.segments) {
        const montes = b.construit ? v.segments.length : Math.floor(avance * v.segments.length);
        for (const [i, s] of v.segments.entries()) {
          const pv = b.segments[i] ?? 0;
          s.setEnabled(i < montes && pv > 0);
          s.scaling.y = 2.6 * (b.construit ? 0.55 + 0.45 * (pv / reglages.batiments.palissade.pvSegment) : 1);
        }
        // La porte s'ouvre le jour : on la fait glisser sur le côté.
        const porte = v.segments[0];
        if (porte) porte.position.y = monde.temps.nuit ? 0 : -1.1;
      } else if (b.type !== "tente") {
        v.corps.scaling.y = b.construit ? 1 : 0.15 + 0.85 * avance;
      }
      if (b.type === "potager" && b.parcelles && v.legumes && v.parcellesVues) {
        for (const [i, p] of b.parcelles.entries()) {
          if (v.parcellesVues[i] !== p.legume) {
            v.legumes[i]?.dispose();
            v.legumes[i] = p.legume ? fabriquerLegume(scene, p.legume, `legume-${b.id}-${i}`) : null;
            v.parcellesVues[i] = p.legume;
            const l = v.legumes[i];
            if (l) {
              l.parent = v.racine;
              const col = i % 3;
              const lig = Math.floor(i / 3);
              l.position.set(-1.15 + col * 1.15, 0.55, -0.6 + lig * 1.2);
            }
          }
          const l = v.legumes[i];
          if (l) {
            const t = 0.25 + 0.75 * p.pousse;
            l.scaling.setAll(t * (p.pousse >= 1 ? 1 + Math.sin(temps * 4 + i) * 0.06 : 1));
          }
        }
      }
    }

    // Objets au sol : éclats lumineux et cœur caché.
    const restants = new Set<number>();
    for (const o of monde.objets) {
      restants.add(o.id);
      let n = objets.get(o.id);
      if (!n) {
        n = o.type === "eclat" ? fabriquerEclat(scene, `eclat-${o.id}`) : fabriquerCoeur(scene);
        n.position.set(o.x, 0.6, o.z);
        objets.set(o.id, n);
      }
      n.setEnabled(vu(o.x, o.z));
      n.rotation.y = temps * 2;
      n.position.y = (o.type === "coeur" ? 0.9 : 0.5) + Math.sin(temps * 3 + o.id) * 0.12;
    }
    for (const [id, n] of objets) {
      if (restants.has(id)) continue;
      n.dispose();
      objets.delete(id);
    }
  }

  function cibleDuClic(x: number, y: number): Cible | null {
    const pick = scene.pick(x, y, (mesh) => mesh.isPickable && mesh.isEnabled() && mesh.isVisible);
    if (!pick?.hit || !pick.pickedMesh) return null;
    const meta = pick.pickedMesh.metadata as Cible | { type: "sol" } | null;
    if (meta && meta.type !== "sol") return meta as Cible;
    if (pick.pickedPoint) return { type: "sol", x: pick.pickedPoint.x, z: pick.pickedPoint.z };
    return null;
  }

  function aLEcran(x: number, y: number, z: number) {
    const p = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.Identity(),
      scene.getTransformMatrix(),
      affichage.camera.viewport.toGlobal(affichage.engine.getRenderWidth(), affichage.engine.getRenderHeight()),
    );
    const echelle = affichage.engine.getRenderingCanvas()!.clientWidth / affichage.engine.getRenderWidth();
    return { x: p.x * echelle, y: p.y * echelle, visible: p.z > 0 && p.z < 1 };
  }

  // ---------- Placement d'un bâtiment ----------
  const fantomeMesh = CreateBox("fantome", { size: 1 }, scene);
  fantomeMesh.isPickable = false;
  const matOk = new StandardMaterial("fantome-ok", scene);
  matOk.diffuseColor = new Color3(0.3, 1, 0.4);
  matOk.emissiveColor = new Color3(0.2, 0.7, 0.3);
  matOk.alpha = 0.45;
  const matNon = new StandardMaterial("fantome-non", scene);
  matNon.diffuseColor = new Color3(1, 0.3, 0.25);
  matNon.emissiveColor = new Color3(0.8, 0.2, 0.15);
  matNon.alpha = 0.45;
  fantomeMesh.setEnabled(false);

  function fantome(f: { type: string; x: number; z: number; valide: boolean } | null): void {
    if (!f) {
      fantomeMesh.setEnabled(false);
      return;
    }
    const cote = 2 * (EMPRISE[f.type] ?? 0.5) + 1;
    fantomeMesh.setEnabled(true);
    fantomeMesh.scaling.set(cote, 0.6, cote);
    fantomeMesh.position.set(f.x, 0.3, f.z);
    fantomeMesh.material = f.valide ? matOk : matNon;
  }

  function solSous(x: number, y: number): { x: number; z: number } | null {
    const pick = scene.pick(x, y, (mesh) => (mesh.metadata as { type?: string } | null)?.type === "sol");
    return pick?.hit && pick.pickedPoint ? { x: pick.pickedPoint.x, z: pick.pickedPoint.z } : null;
  }

  return {
    solSous,
    fantome,
    synchroniser,
    cibleDuClic,
    survol: cibleDuClic,
    aLEcran,
    selection,
    lumoPosition: () => posLumo,
    epave,
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
