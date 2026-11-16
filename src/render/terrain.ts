import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Scene } from "@babylonjs/core/scene";
import { centreRiviere, DEMI_LARGEUR_RIVIERE, LIEUX, lieuPont, versEcran } from "../sim/carte";
import type { Monde } from "../sim/monde";

/** Petit bruit doux et reproductible pour varier les couleurs de l'herbe. */
function bruit(x: number, z: number): number {
  return (
    Math.sin(x * 0.31 + z * 0.17) * 0.5 +
    Math.sin(x * 0.07 - z * 0.13 + 1.3) * 0.8 +
    Math.sin(x * 1.1 + z * 0.9) * 0.15
  );
}

function distanceSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export interface Terrain {
  sol: Mesh;
  eau: Mesh;
  brouillard: Mesh;
  mettreAJourBrouillard(monde: Monde): void;
  animerEau(temps: number): void;
}

export function creerTerrain(scene: Scene, monde: Monde): Terrain {
  const { largeur, hauteur } = monde.carte;
  const marge = 30;
  const sol = CreateGround(
    "sol",
    { width: largeur + marge * 2, height: hauteur + marge * 2, subdivisions: (largeur + marge * 2) / 1.5, updatable: true },
    scene,
  );
  sol.position.set(largeur / 2, 0, hauteur / 2);
  const positions = sol.getVerticesData(VertexBuffer.PositionKind)!;
  const couleurs: number[] = [];
  const pont = lieuPont();
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]! + largeur / 2;
    const z = positions[i + 2]! + hauteur / 2;
    const { u, v } = versEcran({ x, z });
    const dRiviere = Math.abs(u - centreRiviere(v)) / Math.SQRT2;
    const n = bruit(x, z);
    // Herbe : vert doux, un peu doré (les Terres de l'Aube).
    let r = 0.42 + n * 0.04;
    let g = 0.62 + n * 0.05;
    let b = 0.3 + n * 0.02;
    let y = 0;
    // Lit de la rivière creusé, berges sableuses.
    const demi = DEMI_LARGEUR_RIVIERE / Math.SQRT2;
    if (dRiviere < demi + 1.2) {
      const t = Math.max(0, 1 - (dRiviere - demi) / 1.2);
      r = r + (0.76 - r) * t;
      g = g + (0.68 - g) * t;
      b = b + (0.46 - b) * t;
    }
    if (dRiviere < demi + 0.3) y = -0.7 * Math.min(1, (demi + 0.3 - dRiviere) / 1.2);
    // Terre battue au camp et sur le chemin du pont.
    const dCamp = Math.hypot(x - LIEUX.camp.x, z - LIEUX.camp.z);
    const dChemin = distanceSegment(x, z, LIEUX.camp.x, LIEUX.camp.z, pont.x, pont.z);
    const terre = Math.max(dCamp < 8 ? Math.min(1, (8 - dCamp) / 3) * 0.75 : 0, dChemin < 1.4 ? (1.4 - dChemin) / 1.4 * 0.6 : 0);
    if (terre > 0) {
      r = r + (0.6 - r) * terre;
      g = g + (0.5 - g) * terre;
      b = b + (0.33 - b) * terre;
    }
    // Hors de la carte : collines un peu plus sombres.
    if (x < 0 || z < 0 || x > largeur || z > hauteur) {
      r *= 0.85;
      g *= 0.85;
      b *= 0.85;
      y = Math.min(3, Math.max(-x, -z, x - largeur, z - hauteur) * 0.15) + Math.max(0, n) * 0.6;
    }
    positions[i + 1] = y;
    couleurs.push(r, g, b, 1);
  }
  sol.updateVerticesData(VertexBuffer.PositionKind, positions);
  sol.setVerticesData(VertexBuffer.ColorKind, couleurs);
  const normales: number[] = [];
  VertexData.ComputeNormals(positions, sol.getIndices()!, normales);
  sol.updateVerticesData(VertexBuffer.NormalKind, normales);
  const matSol = new StandardMaterial("matSol", scene);
  matSol.diffuseColor = Color3.White();
  matSol.specularColor = Color3.Black();
  sol.material = matSol;
  sol.receiveShadows = true;
  sol.metadata = { type: "sol" };

  // L'eau : un ruban qui suit la rivière.
  const eau = new Mesh("eau", scene);
  const pos: number[] = [];
  const ind: number[] = [];
  const uvs: number[] = [];
  const pas = 1;
  let k = 0;
  for (let v = -20; v <= largeur + hauteur + 20; v += pas) {
    const u = centreRiviere(v);
    for (const cote of [-1, 1]) {
      const uu = u + cote * (DEMI_LARGEUR_RIVIERE + 0.4);
      pos.push((v - uu) / 2, -0.25, (v + uu) / 2);
      uvs.push(v / 6, cote);
    }
    if (k > 0) {
      const a = (k - 1) * 2;
      ind.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    k += 1;
  }
  const vd = new VertexData();
  vd.positions = pos;
  vd.indices = ind;
  vd.uvs = uvs;
  const nrm: number[] = [];
  VertexData.ComputeNormals(pos, ind, nrm);
  vd.normals = nrm;
  vd.applyToMesh(eau);
  const matEau = new StandardMaterial("matEau", scene);
  matEau.diffuseColor = new Color3(0.25, 0.55, 0.75);
  matEau.specularColor = new Color3(0.6, 0.7, 0.8);
  matEau.specularPower = 32;
  matEau.alpha = 0.85;
  matEau.backFaceCulling = false;
  const vagues = new DynamicTexture("vagues", { width: 128, height: 32 }, scene, true);
  const cv = vagues.getContext() as CanvasRenderingContext2D;
  cv.fillStyle = "#000";
  cv.fillRect(0, 0, 128, 32);
  cv.strokeStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 6; i += 1) {
    cv.beginPath();
    const y0 = 4 + i * 5;
    for (let x = 0; x <= 128; x += 4) cv.lineTo(x, y0 + Math.sin(x * 0.15 + i) * 1.5);
    cv.stroke();
  }
  vagues.update();
  matEau.emissiveTexture = vagues;
  eau.material = matEau;
  eau.isPickable = false;

  // Le brouillard : une couche sombre au-dessus du sol, percée là où Morris est passé.
  const R = 4; // pixels par case
  const tex = new DynamicTexture("brouillard", { width: (largeur + marge * 2) * R, height: (hauteur + marge * 2) * R }, scene, true);
  tex.hasAlpha = true;
  const brouillard = CreateGround("brouillard", { width: largeur + marge * 2, height: hauteur + marge * 2 }, scene);
  brouillard.position.set(largeur / 2, 0.6, hauteur / 2);
  const matB = new StandardMaterial("matBrouillard", scene);
  matB.diffuseColor = Color3.Black();
  matB.specularColor = Color3.Black();
  matB.emissiveColor = new Color3(0.13, 0.16, 0.22);
  matB.disableLighting = true;
  matB.opacityTexture = tex;
  matB.useAlphaFromDiffuseTexture = false;
  brouillard.material = matB;
  brouillard.isPickable = false;

  let version = -1;
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const W = (largeur + marge * 2) * R;
  const H = (hauteur + marge * 2) * R;
  const cases = document.createElement("canvas");
  cases.width = largeur;
  cases.height = hauteur;
  const cc = cases.getContext("2d")!;
  const img = cc.createImageData(largeur, hauteur);

  function mettreAJourBrouillard(m: Monde): void {
    if (m.versionBrouillard === version) return;
    version = m.versionBrouillard;
    for (let z = 0; z < hauteur; z += 1) {
      for (let x = 0; x < largeur; x += 1) {
        // La texture a le haut de l'image vers +z.
        const o = ((hauteur - 1 - z) * largeur + x) * 4;
        const vu = m.brouillard[z * largeur + x] === 1;
        img.data[o] = 255;
        img.data[o + 1] = 255;
        img.data[o + 2] = 255;
        img.data[o + 3] = vu ? 0 : 255;
      }
    }
    cc.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.filter = `blur(${R * 1.6}px)`;
    // Les cases vues « percent » le brouillard (on dessine leur masque inversé).
    const trous = document.createElement("canvas");
    trous.width = largeur;
    trous.height = hauteur;
    const tc = trous.getContext("2d")!;
    const ti = tc.createImageData(largeur, hauteur);
    for (let i = 0; i < img.data.length; i += 4) {
      ti.data[i] = 0;
      ti.data[i + 1] = 0;
      ti.data[i + 2] = 0;
      ti.data[i + 3] = 255 - img.data[i + 3]!;
    }
    tc.putImageData(ti, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(trous, marge * R, marge * R, largeur * R, hauteur * R);
    ctx.restore();
    tex.update();
  }

  let decalage = 0;
  function animerEau(t: number): void {
    decalage = t * 0.05;
    vagues.uOffset = decalage;
  }

  return { sol, eau, brouillard, mettreAJourBrouillard, animerEau };
}
