// Le décor vivant : feu de camp, étincelles de l'épave, papillons, lucioles et oiseaux.
// Purement visuel : rien ici ne change les règles du jeu.
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { estRiviere, LIEUX } from "../sim/carte";
import type { Monde } from "../sim/monde";
import { reglages } from "../sim/reglages";
import type { Affichage } from "./scene";
import { fabriquerFeuDeCamp, fabriquerOiseau, fabriquerPapillon, type Modele3D } from "./fabrique";

export interface Vie {
  mettreAJour(monde: Monde, ms: number): void;
}

const COULEURS_PAPILLONS = ["#ffd23f", "#ff6fb5", "#4fb8ff", "#b58cff", "#ff9f43"];

function ailes(m: Modele3D): AbstractMesh[] {
  return m.corps.getChildMeshes().filter((x) => x.metadata && typeof x.metadata.aile === "number");
}

function sansClic(n: TransformNode): void {
  for (const x of n.getChildMeshes()) x.isPickable = false;
}

export function creerVie(affichage: Affichage, tex: Texture): Vie {
  const { scene, camera } = affichage;
  const D = reglages.decor;
  let temps = 0;

  // ---------- Feu de camp ----------
  const feu = fabriquerFeuDeCamp(scene);
  feu.position.set(LIEUX.feu.x, 0, LIEUX.feu.z);
  sansClic(feu);
  const flammes = new ParticleSystem("feu-flammes", 90, scene);
  flammes.particleTexture = tex;
  flammes.emitter = new Vector3(LIEUX.feu.x, 0.15, LIEUX.feu.z);
  flammes.minEmitBox = new Vector3(-0.15, 0, -0.15);
  flammes.maxEmitBox = new Vector3(0.15, 0.05, 0.15);
  flammes.color1 = new Color4(1, 0.8, 0.25, 1);
  flammes.color2 = new Color4(1, 0.4, 0.08, 1);
  flammes.colorDead = new Color4(0.5, 0.1, 0, 0);
  flammes.minSize = 0.25;
  flammes.maxSize = 0.55;
  flammes.minLifeTime = 0.35;
  flammes.maxLifeTime = 0.7;
  flammes.emitRate = 45;
  flammes.direction1 = new Vector3(-0.1, 1, -0.1);
  flammes.direction2 = new Vector3(0.1, 1.6, 0.1);
  flammes.minEmitPower = 0.7;
  flammes.maxEmitPower = 1.3;
  flammes.blendMode = ParticleSystem.BLENDMODE_ADD;
  flammes.start();

  const etincellesFeu = new ParticleSystem("feu-etincelles", 30, scene);
  etincellesFeu.particleTexture = tex;
  etincellesFeu.emitter = new Vector3(LIEUX.feu.x, 0.4, LIEUX.feu.z);
  etincellesFeu.color1 = new Color4(1, 0.9, 0.5, 1);
  etincellesFeu.color2 = new Color4(1, 0.6, 0.2, 1);
  etincellesFeu.colorDead = new Color4(1, 0.3, 0, 0);
  etincellesFeu.minSize = 0.05;
  etincellesFeu.maxSize = 0.09;
  etincellesFeu.minLifeTime = 0.8;
  etincellesFeu.maxLifeTime = 1.6;
  etincellesFeu.emitRate = 4;
  etincellesFeu.direction1 = new Vector3(-0.4, 2, -0.4);
  etincellesFeu.direction2 = new Vector3(0.4, 3, 0.4);
  etincellesFeu.minEmitPower = 0.6;
  etincellesFeu.maxEmitPower = 1.1;
  etincellesFeu.blendMode = ParticleSystem.BLENDMODE_ADD;
  etincellesFeu.start();

  const lumiereFeu = new PointLight("lumiere-feu", new Vector3(LIEUX.feu.x, 1, LIEUX.feu.z), scene);
  lumiereFeu.diffuse = new Color3(1, 0.55, 0.2);
  lumiereFeu.specular = new Color3(0.3, 0.15, 0.05);
  lumiereFeu.range = 9;

  // ---------- Étincelles de l'épave (par petites gerbes) ----------
  const gerbe = new ParticleSystem("epave-etincelles", 40, scene);
  gerbe.particleTexture = tex;
  gerbe.emitter = new Vector3(LIEUX.epave.x + 0.5, 2.2, LIEUX.epave.z);
  gerbe.color1 = new Color4(1, 1, 0.8, 1);
  gerbe.color2 = new Color4(1, 0.7, 0.3, 1);
  gerbe.colorDead = new Color4(1, 0.4, 0.1, 0);
  gerbe.minSize = 0.06;
  gerbe.maxSize = 0.12;
  gerbe.minLifeTime = 0.5;
  gerbe.maxLifeTime = 1;
  gerbe.direction1 = new Vector3(-1.5, 2, -1.5);
  gerbe.direction2 = new Vector3(1.5, 3.5, 1.5);
  gerbe.minEmitPower = 1;
  gerbe.maxEmitPower = 2;
  gerbe.gravity = new Vector3(0, -7, 0);
  gerbe.emitRate = 0;
  gerbe.blendMode = ParticleSystem.BLENDMODE_ADD;
  gerbe.start();
  let prochaineGerbe = 2;

  // ---------- Lucioles (la nuit, autour de ce qu'on regarde) ----------
  const lucioles = new ParticleSystem("lucioles", Math.max(1, D.lucioles * 2), scene);
  lucioles.particleTexture = tex;
  const centreLucioles = new Vector3(0, 0, 0);
  lucioles.emitter = centreLucioles;
  lucioles.minEmitBox = new Vector3(-16, 0.3, -16);
  lucioles.maxEmitBox = new Vector3(16, 1.8, 16);
  lucioles.color1 = new Color4(0.75, 1, 0.35, 1);
  lucioles.color2 = new Color4(1, 1, 0.55, 1);
  lucioles.colorDead = new Color4(0.6, 1, 0.3, 0);
  lucioles.minSize = 0.09;
  lucioles.maxSize = 0.16;
  lucioles.minLifeTime = 3;
  lucioles.maxLifeTime = 6;
  lucioles.direction1 = new Vector3(-0.3, -0.1, -0.3);
  lucioles.direction2 = new Vector3(0.3, 0.3, 0.3);
  lucioles.minEmitPower = 0.2;
  lucioles.maxEmitPower = 0.5;
  lucioles.emitRate = 0;
  lucioles.blendMode = ParticleSystem.BLENDMODE_ADD;
  lucioles.start();

  // ---------- Papillons (le jour) ----------
  const papillons = Array.from({ length: D.papillons }, (_, k) => {
    const m = fabriquerPapillon(scene, COULEURS_PAPILLONS[k % COULEURS_PAPILLONS.length]!);
    sansClic(m.racine);
    m.racine.setEnabled(false);
    return { m, ailes: ailes(m), ancre: { x: 0, z: 0 }, phase: Math.random() * 10, pret: false };
  });

  // ---------- Oiseaux (posés au sol, ils s'envolent quand on s'approche) ----------
  type EtatOiseau = "pose" | "vol" | "absent";
  const oiseaux = Array.from({ length: D.oiseaux }, () => {
    const m = fabriquerOiseau(scene);
    sansClic(m.racine);
    m.racine.setEnabled(false);
    return { m, ailes: ailes(m), x: 0, z: 0, y: 0, etat: "absent" as EtatOiseau, t: Math.random() * 5, dx: 0, dz: 1, phase: Math.random() * 10 };
  });

  const vu = (monde: Monde, x: number, z: number) => {
    const { largeur, hauteur } = monde.carte;
    if (x < 1 || z < 1 || x > largeur - 1 || z > hauteur - 1) return false;
    return monde.brouillard[Math.floor(z) * largeur + Math.floor(x)] === 1;
  };
  /** Un endroit au hasard, découvert et hors de l'eau, autour de ce qu'on regarde. */
  function endroit(monde: Monde, rMin: number, rMax: number): { x: number; z: number } | null {
    for (let essai = 0; essai < 12; essai += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      const x = camera.target.x + Math.cos(a) * r;
      const z = camera.target.z + Math.sin(a) * r;
      if (vu(monde, x, z) && !estRiviere(x, z)) return { x, z };
    }
    return null;
  }

  function mettreAJour(monde: Monde, ms: number): void {
    const dt = Math.min(0.1, ms / 1000);
    temps += dt;
    const c = affichage.clarte();
    const nuit = 1 - c;

    // Feu : la lumière vacille, plus forte la nuit.
    const vacille = 0.8 + 0.12 * Math.sin(temps * 13) + 0.08 * Math.sin(temps * 29 + 1);
    lumiereFeu.intensity = (0.15 + nuit * D.feuIntensite) * vacille;

    // Gerbes d'étincelles de l'épave.
    prochaineGerbe -= dt;
    if (prochaineGerbe <= 0) {
      gerbe.manualEmitCount = 6 + Math.floor(Math.random() * 8);
      prochaineGerbe = 2 + Math.random() * 4;
    }

    // Lucioles autour du point regardé.
    centreLucioles.set(camera.target.x, 0, camera.target.z);
    lucioles.emitRate = nuit > 0.5 ? D.lucioles / 4.5 : 0;

    // Papillons.
    const jour = c > 0.5;
    for (const p of papillons) {
      const loin = Math.hypot(p.ancre.x - camera.target.x, p.ancre.z - camera.target.z) > 22;
      if (!p.pret || loin) {
        const e = endroit(monde, 3, 16);
        if (e) {
          p.ancre = e;
          p.pret = true;
        }
      }
      const t = temps * 0.6 + p.phase;
      const x = p.ancre.x + Math.sin(t) * 1.6 + Math.sin(t * 2.3) * 0.5;
      const z = p.ancre.z + Math.cos(t * 0.8) * 1.6;
      const visible = jour && p.pret && vu(monde, x, z);
      p.m.racine.setEnabled(visible);
      if (!visible) continue;
      const vx = Math.cos(t) * 1.6 + Math.cos(t * 2.3) * 1.15;
      const vz = -Math.sin(t * 0.8) * 1.28;
      p.m.racine.position.set(x, 0.9 + 0.35 * Math.sin(t * 3.1), z);
      p.m.racine.rotation.y = Math.atan2(vx, vz);
      const battement = Math.sin(temps * 22 + p.phase) * 0.9;
      for (const a of p.ailes) a.rotation.z = (a.metadata.aile as number) * battement;
    }

    // Oiseaux.
    const menaces = [monde.morris, ...monde.robots];
    for (const o of oiseaux) {
      o.t -= dt;
      if (o.etat === "absent") {
        o.m.racine.setEnabled(false);
        if (o.t <= 0 && jour) {
          const e = endroit(monde, 6, 15);
          const assezLoin = e && menaces.every((m) => Math.hypot(m.x - e.x, m.z - e.z) > D.distanceEnvolOiseaux * 2);
          if (e && assezLoin) {
            Object.assign(o, { x: e.x, z: e.z, y: 0, etat: "pose" as EtatOiseau });
            o.m.racine.rotation.y = Math.random() * Math.PI * 2;
          } else o.t = 1;
        }
        continue;
      }
      if (o.etat === "pose") {
        const proche = menaces.find((m) => Math.hypot(m.x - o.x, m.z - o.z) < D.distanceEnvolOiseaux);
        const tropLoin = Math.hypot(o.x - camera.target.x, o.z - camera.target.z) > 24;
        if (proche || !jour || tropLoin) {
          const d = proche ? Math.hypot(o.x - proche.x, o.z - proche.z) || 1 : 1;
          o.dx = proche ? (o.x - proche.x) / d : Math.random() - 0.5;
          o.dz = proche ? (o.z - proche.z) / d : 1;
          o.etat = "vol";
          o.t = 4;
          o.m.racine.rotation.y = Math.atan2(o.dx, o.dz);
        }
      }
      if (o.etat === "vol") {
        o.x += o.dx * 6 * dt;
        o.z += o.dz * 6 * dt;
        o.y += 2.5 * dt;
        if (o.t <= 0) {
          o.etat = "absent";
          o.t = 8 + Math.random() * 8;
        }
      }
      const visible = vu(monde, o.x, o.z);
      o.m.racine.setEnabled(visible);
      if (!visible) continue;
      if (o.etat === "pose") {
        // Picore de temps en temps.
        const picore = Math.max(0, Math.sin(temps * 3 + o.phase));
        o.m.corps.rotation.x = picore * 0.6;
        o.m.racine.position.set(o.x, 0.1, o.z);
        for (const a of o.ailes) a.rotation.z = (a.metadata.aile as number) * -0.9;
      } else {
        o.m.corps.rotation.x = -0.2;
        o.m.racine.position.set(o.x, 0.1 + o.y, o.z);
        const b = Math.sin(temps * 26 + o.phase) * 0.8;
        for (const a of o.ailes) a.rotation.z = (a.metadata.aile as number) * b;
      }
    }
  }

  return { mettreAJour };
}
