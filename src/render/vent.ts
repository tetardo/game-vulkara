// Le vent : arbres, buissons et herbe se balancent doucement.
// Petit ajout au shader des matériaux : plus un point est haut, plus il bouge.
// Chaque plante a sa propre phase (tirée de sa position), pour que tout ne bouge pas ensemble.
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { Material } from "@babylonjs/core/Materials/material";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { reglages } from "../sim/reglages";

const debut = performance.now();

class PluginVent extends MaterialPluginBase {
  constructor(
    materiau: Material,
    private readonly force: number,
  ) {
    super(materiau, "Vent", 200, { VENT: false });
    this._enable(true);
  }

  override getClassName(): string {
    return "PluginVent";
  }

  override isCompatible(langage: ShaderLanguage): boolean {
    return langage === ShaderLanguage.GLSL;
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines["VENT"] = true;
  }

  override getUniforms() {
    return {
      ubo: [
        { name: "ventTemps", size: 1, type: "float" },
        { name: "ventForce", size: 1, type: "float" },
      ],
      vertex: "#ifdef VENT\nuniform float ventTemps;\nuniform float ventForce;\n#endif\n",
    };
  }

  override bindForSubMesh(ubo: UniformBuffer): void {
    ubo.updateFloat("ventTemps", ((performance.now() - debut) / 1000) * reglages.decor.ventVitesse);
    ubo.updateFloat("ventForce", this.force);
  }

  override getCustomCode(type: string) {
    if (type !== "vertex") return null;
    return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
#ifdef VENT
float ventPhase = dot(finalWorld[3].xz, vec2(0.23, 0.17));
float ventS = sin(ventTemps + ventPhase) + 0.35 * sin(ventTemps * 2.3 + ventPhase * 1.7);
worldPos.xz += vec2(0.8, 0.5) * ventS * ventForce * max(worldPos.y, 0.0);
#endif
`,
    };
  }
}

const dejaVentes = new WeakSet<Material>();

/** Ajoute le vent aux matériaux d'un maillage (une seule fois par matériau). */
export function ajouterVent(mesh: AbstractMesh, force: number): void {
  // 0 : pas de vent (aucun ajout au shader).
  if (force <= 0) return;
  const m = mesh.material;
  if (!m) return;
  const liste = m instanceof MultiMaterial ? m.subMaterials : [m];
  for (const sous of liste) {
    if (!sous || dejaVentes.has(sous)) continue;
    dejaVentes.add(sous);
    new PluginVent(sous, force);
  }
}
