// Effets de lumière : coups, tourbillon, monstres vaincus, bâtiments finis, niveaux, cœur.
// Purement visuel : on lit les événements de la simulation et l'état de Morris.
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { Monde } from "../sim/monde";
import type { Evenement } from "../sim/types";

/** Étoile à quatre branches, blanche et floue au centre. */
function textureEtoile(scene: Scene): DynamicTexture {
  const t = new DynamicTexture("etoile", { width: 64, height: 64 }, scene, false);
  const c = t.getContext() as CanvasRenderingContext2D;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 14);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = "rgba(255,255,255,0.95)";
  c.beginPath();
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const r = k % 2 === 0 ? 31 : 5;
    c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  t.hasAlpha = true;
  t.update();
  return t;
}

interface Bouffee {
  couleur1: Color4;
  couleur2?: Color4;
  nombre: number;
  taille: [number, number];
  vie: [number, number];
  vitesse: [number, number];
  direction: [Vector3, Vector3];
  boite?: number;
  gravite?: number;
  etoile?: boolean;
}

export interface Effets {
  evenement(e: Evenement): void;
  mettreAJour(monde: Monde, ms: number): void;
}

export function creerEffets(scene: Scene, rond: Texture): Effets {
  const etoile = textureEtoile(scene);

  function bouffee(x: number, y: number, z: number, b: Bouffee): void {
    const ps = new ParticleSystem("effet", b.nombre, scene);
    ps.particleTexture = b.etoile ? etoile : rond;
    ps.emitter = new Vector3(x, y, z);
    const k = b.boite ?? 0.2;
    ps.minEmitBox = new Vector3(-k, -k / 2, -k);
    ps.maxEmitBox = new Vector3(k, k / 2, k);
    ps.color1 = b.couleur1;
    ps.color2 = b.couleur2 ?? b.couleur1;
    ps.colorDead = new Color4(b.couleur1.r, b.couleur1.g, b.couleur1.b, 0);
    [ps.minSize, ps.maxSize] = b.taille;
    [ps.minLifeTime, ps.maxLifeTime] = b.vie;
    [ps.minEmitPower, ps.maxEmitPower] = b.vitesse;
    [ps.direction1, ps.direction2] = b.direction;
    if (b.gravite) ps.gravity = new Vector3(0, -b.gravite, 0);
    ps.manualEmitCount = b.nombre;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.targetStopDuration = b.vie[1] + 0.3;
    ps.disposeOnStop = true;
    ps.start();
  }

  // B. Le tourbillon : un anneau d'étincelles bleues qui tourne autour de Morris.
  const tourbillon = new ParticleSystem("tourbillon", 260, scene);
  tourbillon.particleTexture = rond;
  const centre = new Vector3(0, 0, 0);
  tourbillon.emitter = centre;
  tourbillon.color1 = new Color4(0.4, 0.8, 1, 1);
  tourbillon.color2 = new Color4(0.75, 0.95, 1, 1);
  tourbillon.colorDead = new Color4(0.2, 0.5, 1, 0);
  tourbillon.minSize = 0.15;
  tourbillon.maxSize = 0.35;
  tourbillon.minLifeTime = 0.25;
  tourbillon.maxLifeTime = 0.45;
  tourbillon.emitRate = 0;
  tourbillon.blendMode = ParticleSystem.BLENDMODE_ADD;
  let angle = 0;
  tourbillon.startPositionFunction = (_m, pos) => {
    const a = angle + Math.random() * Math.PI * 2;
    const r = 1.2 + Math.random() * 0.4;
    pos.set(centre.x + Math.cos(a) * r, 0.4 + Math.random() * 0.8, centre.z + Math.sin(a) * r);
  };
  tourbillon.startDirectionFunction = (_m, dir, p) => {
    const a = Math.atan2(p.position.z - centre.z, p.position.x - centre.x);
    dir.set(-Math.sin(a) * 4, 0.6, Math.cos(a) * 4);
  };
  tourbillon.start();

  function evenement(e: Evenement): void {
    switch (e.type) {
      case "coup":
        // A. Une petite étoile blanche quand un monstre est touché.
        if (e.surMonstre) {
          bouffee(e.x, 1, e.z, { couleur1: new Color4(1, 1, 1, 1), nombre: 2, taille: [0.9, 1.3], vie: [0.15, 0.25], vitesse: [0, 0.2], direction: [new Vector3(0, 1, 0), new Vector3(0, 1, 0)], boite: 0.1, etoile: true });
          bouffee(e.x, 1, e.z, { couleur1: new Color4(1, 0.95, 0.7, 1), nombre: 8, taille: [0.08, 0.14], vie: [0.2, 0.4], vitesse: [2, 4], direction: [new Vector3(-1, 0.3, -1), new Vector3(1, 1.2, 1)] });
        }
        break;
      case "vaincu":
        // C. Le monstre part en fumée pleine d'étincelles.
        bouffee(e.x, 0.6, e.z, { couleur1: new Color4(1, 0.85, 0.3, 1), couleur2: new Color4(0.5, 0.95, 1, 1), nombre: 30, taille: [0.08, 0.16], vie: [0.5, 1], vitesse: [2, 4], direction: [new Vector3(-1, 1.5, -1), new Vector3(1, 3, 1)], gravite: 5, boite: 0.4 });
        break;
      case "construit":
        // E. Une pluie d'étincelles dorées sur le bâtiment fini.
        if (e.x !== undefined && e.z !== undefined) {
          bouffee(e.x, 3.5, e.z, { couleur1: new Color4(1, 0.85, 0.3, 1), couleur2: new Color4(1, 1, 0.7, 1), nombre: 70, taille: [0.08, 0.18], vie: [0.9, 1.5], vitesse: [0.5, 2], direction: [new Vector3(-1, 0.5, -1), new Vector3(1, 1.5, 1)], gravite: 4, boite: 1.2 });
        }
        break;
      case "niveau":
        // F. Des étoiles qui montent doucement.
        bouffee(e.x, 0.5, e.z, { couleur1: new Color4(1, 0.95, 0.5, 1), couleur2: new Color4(1, 1, 1, 1), nombre: 12, taille: [0.35, 0.6], vie: [1.2, 1.8], vitesse: [1, 1.8], direction: [new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 1, 0.2)], boite: 0.9, etoile: true });
        break;
      case "coeur":
        // H. Un halo rose autour de Morris.
        bouffee(e.x, 0.9, e.z, { couleur1: new Color4(1, 0.45, 0.75, 0.9), nombre: 2, taille: [3, 3.6], vie: [0.6, 0.8], vitesse: [0, 0], direction: [new Vector3(0, 0, 0), new Vector3(0, 0, 0)], boite: 0 });
        bouffee(e.x, 0.6, e.z, { couleur1: new Color4(1, 0.55, 0.8, 1), couleur2: new Color4(1, 0.85, 0.95, 1), nombre: 24, taille: [0.12, 0.22], vie: [0.8, 1.3], vitesse: [0.8, 1.6], direction: [new Vector3(-0.6, 1, -0.6), new Vector3(0.6, 1.6, 0.6)], boite: 0.5 });
        break;
      default:
        break;
    }
  }

  let prochainScintillement = 0;
  function mettreAJour(monde: Monde, ms: number): void {
    const m = monde.morris;
    centre.set(m.x, 0, m.z);
    angle += (ms / 1000) * 14;
    tourbillon.emitRate = m.animation === "tourbillon" ? 420 : 0;

    // G. Les éclats au sol scintillent de temps en temps.
    prochainScintillement -= ms;
    if (prochainScintillement <= 0) {
      prochainScintillement = 700;
      for (const o of monde.objets) {
        if (o.type !== "eclat" || monde.brouillard[Math.floor(o.z) * monde.carte.largeur + Math.floor(o.x)] !== 1) continue;
        if (Math.random() < 0.6) bouffee(o.x + (Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.3, o.z, { couleur1: new Color4(0.7, 1, 1, 1), nombre: 1, taille: [0.35, 0.55], vie: [0.25, 0.4], vitesse: [0, 0], direction: [new Vector3(0, 0, 0), new Vector3(0, 0, 0)], boite: 0, etoile: true });
      }
    }
  }

  return { evenement, mettreAJour };
}
