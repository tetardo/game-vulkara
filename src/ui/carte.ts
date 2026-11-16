// La carte de Vulkara, dessinée dans un canevas : seulement ce qui a été découvert.
// Même orientation que la caméra : le haut de l'écran est la direction (-x, +z).
import { estRiviere } from "../sim/carte";
import type { Monde } from "../sim/monde";

const CASE = 4; // pixels par case avant rotation
const S = Math.SQRT1_2;

const COULEURS = {
  brouillard: "#2a3646",
  herbe: "#5c9a3e",
  riviere: "#4fb3d9",
  arbre: "#24552b",
  buisson: "#9ccc5a",
  noisetier: "#b0874a",
  debris: "#c3c9cf",
  epave: "#e8ecef",
  rocher: "#8a8f96",
  batiment: "#f0a848",
  palissade: "#8b5a2b",
  robot: "#7fd7ff",
  monstre: "#ff4b3a",
  morris: "#ffe14d",
};

export const LEGENDE_CARTE: Array<[string, string]> = [
  [COULEURS.morris, "Morris"],
  [COULEURS.robot, "Robots"],
  [COULEURS.batiment, "Bâtiments"],
  [COULEURS.monstre, "Monstres"],
  [COULEURS.riviere, "Rivière"],
  [COULEURS.arbre, "Arbres"],
];

/** Taille du canevas (le losange de la carte tient dedans). */
export function tailleCarte(monde: Monde): { largeur: number; hauteur: number } {
  const n = monde.carte.largeur + monde.carte.hauteur;
  return { largeur: Math.ceil(n * CASE * S), hauteur: Math.ceil(n * CASE * S) };
}

function transformer(monde: Monde): DOMMatrix {
  const k = CASE * S;
  // ecranX = k (x + z), ecranY = k (x - z) + décalage
  return new DOMMatrix([k, k, k, -k, 0, monde.carte.hauteur * k]);
}

export function dessinerCarte(canvas: HTMLCanvasElement, monde: Monde): void {
  const { largeur, hauteur } = monde.carte;
  const t = tailleCarte(monde);
  canvas.width = t.largeur;
  canvas.height = t.hauteur;
  const c = canvas.getContext("2d")!;
  c.clearRect(0, 0, t.largeur, t.hauteur);
  c.setTransform(transformer(monde));
  const vu = (x: number, z: number) => monde.brouillard[Math.floor(z) * largeur + Math.floor(x)] === 1;

  // Le sol : brouillard, herbe ou rivière.
  for (let z = 0; z < hauteur; z += 1) {
    for (let x = 0; x < largeur; x += 1) {
      c.fillStyle = !vu(x, z) ? COULEURS.brouillard : estRiviere(x + 0.5, z + 0.5) ? COULEURS.riviere : COULEURS.herbe;
      c.fillRect(x, z, 1.04, 1.04);
    }
  }
  const point = (x: number, z: number, rayon: number, couleur: string) => {
    c.fillStyle = couleur;
    c.beginPath();
    c.arc(x, z, rayon, 0, Math.PI * 2);
    c.fill();
  };
  for (const r of monde.rochers) if (vu(r.x, r.z)) point(r.x, r.z, 0.6, COULEURS.rocher);
  for (const s of monde.sources) {
    if (s.reste <= 0 || !vu(s.x, s.z)) continue;
    if (s.type === "epave") {
      c.fillStyle = COULEURS.epave;
      c.fillRect(s.x - 2, s.z - 2, 4, 4);
    } else point(s.x, s.z, s.type === "arbre" ? 0.55 : 0.5, COULEURS[s.type]);
  }
  for (const b of monde.batiments) {
    if (b.type === "palissade" || b.type === "porte") {
      c.fillStyle = b.type === "porte" ? "#e3b072" : COULEURS.palissade;
      c.globalAlpha = b.construit && (b.pv ?? 0) > 0 ? 1 : 0.4;
      c.fillRect(Math.floor(b.x), Math.floor(b.z), 1, 1);
      c.globalAlpha = 1;
      continue;
    }
    c.fillStyle = COULEURS.batiment;
    c.globalAlpha = b.construit ? 1 : 0.5;
    c.fillRect(b.x - 1.4, b.z - 1.4, 2.8, 2.8);
    c.globalAlpha = 1;
  }
  for (const r of monde.robots) point(r.x, r.z, 0.9, COULEURS.robot);
  for (const m of monde.monstres) if (vu(m.x, m.z)) point(m.x, m.z, m.type === "sanglier" ? 1.3 : 0.9, COULEURS.monstre);
  // Morris : un point jaune cerclé de blanc, bien visible.
  point(monde.morris.x, monde.morris.z, 1.9, "#ffffff");
  point(monde.morris.x, monde.morris.z, 1.4, COULEURS.morris);
  c.setTransform(1, 0, 0, 1, 0, 0);
}

/** Case de la carte sous un point du canevas (en pixels du canevas). */
export function caseSousPixel(monde: Monde, px: number, py: number): { x: number; z: number } {
  const p = transformer(monde).inverse().transformPoint(new DOMPoint(px, py));
  return { x: p.x, z: p.y };
}
