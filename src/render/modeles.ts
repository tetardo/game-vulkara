// Chargement des modèles 3D KayKit (CC0). Chaque modèle devient un « gabarit » caché,
// copié ensuite autant de fois que nécessaire (instances légères).
import "@babylonjs/loaders/glTF/glTFFileLoader";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";

const BASE = "modeles/";

export const MODELES = {
  arbreA: "nature/tree_single_A",
  arbreB: "nature/tree_single_B",
  arbresA: "nature/trees_A_small",
  arbresB: "nature/trees_B_small",
  arbreCoupe: "nature/tree_single_A_cut",
  rocherA: "nature/rock_single_A",
  rocherB: "nature/rock_single_B",
  rocherC: "nature/rock_single_C",
  rocherD: "nature/rock_single_D",
  colline: "nature/hill_single_A",
  montagneA: "nature/mountain_A_grass_trees",
  montagneB: "nature/mountain_B_grass_trees",
  plante: "nature/waterplant_A",
  nenuphar: "nature/waterlily_A",
  buisson: "nature/bush",
  tente: "nature/tent",
  caisse: "nature/crate_A_big",
  bois: "nature/resource_lumber",
  sac: "nature/sack",
  tonneau: "nature/barrel",
  seau: "nature/bucket_water",
  drapeau: "nature/flag_blue",
  barriere: "nature/fence_wood_straight",
  barrierePorte: "nature/fence_wood_straight_gate",
  terre: "nature/building_dirt",
  echafaudage: "nature/building_scaffolding",
  atelier: "nature/building_blacksmith_blue",
  puits: "nature/building_well_blue",
  epave: "espace/lander_A",
  cargoA: "espace/cargo_A",
  cargoB: "espace/cargo_B",
  rochesEspace: "espace/rocks_A",
  usine: "espace/basemodule_garage",
  panneau: "espace/solarpanel",
  baton: "perso/staff",
  epee: "perso/sword_1handed",
} as const;

export type NomModele = keyof typeof MODELES;
export type Gabarits = Record<NomModele, Mesh>;

/** Fusionne toutes les pièces d'un modèle en un seul maillage, centré au sol. */
function gabarit(container: AssetContainer, nom: string, recentrer = true): Mesh {
  container.addAllToScene();
  const morceaux = container.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
  for (const m of morceaux) m.computeWorldMatrix(true);
  const fusion = Mesh.MergeMeshes(morceaux, true, true, undefined, false, true);
  if (!fusion) throw new Error(`Modèle vide : ${nom}`);
  for (const autre of container.meshes) if (!autre.isDisposed() && autre !== fusion) autre.dispose();
  fusion.name = nom;
  // On recentre le modèle (certains sont décalés dans leur fichier).
  fusion.refreshBoundingInfo();
  if (recentrer) {
    const b = fusion.getBoundingInfo().boundingBox;
    fusion.bakeTransformIntoVertices(Matrix.Translation(-(b.minimum.x + b.maximum.x) / 2, 0, -(b.minimum.z + b.maximum.z) / 2));
    fusion.refreshBoundingInfo();
  }
  fusion.setEnabled(false);
  fusion.isPickable = false;
  return fusion;
}

export async function chargerGabarits(scene: Scene, progression: (fait: number, total: number) => void): Promise<Gabarits> {
  const noms = Object.keys(MODELES) as NomModele[];
  let fait = 0;
  const resultats = await Promise.all(
    noms.map(async (n) => {
      const c = await LoadAssetContainerAsync(`${BASE}${MODELES[n]}.gltf`, scene);
      const g = gabarit(c, n, n !== "baton" && n !== "epee");
      fait += 1;
      progression(fait, noms.length + 1);
      return [n, g] as const;
    }),
  );
  return Object.fromEntries(resultats) as Gabarits;
}

/** Le personnage animé de Morris (avec ses animations). */
export async function chargerMorris(scene: Scene): Promise<AssetContainer> {
  return LoadAssetContainerAsync(`${BASE}perso/Rogue.glb`, scene);
}
