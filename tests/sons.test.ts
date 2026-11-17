import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import musique from "../config/musique.json";
import configSons from "../config/sons.json";

// Un fichier oublié ne casse pas le jeu (bruit de secours), mais on veut le savoir tout de suite.
describe("Musique et bruits", () => {
  it("chaque morceau de musique existe dans public/musique", () => {
    for (const moment of ["jour", "nuit", "combat"] as const) {
      expect(musique[moment].length).toBeGreaterThan(0);
      for (const m of musique[moment]) expect(existsSync(`public/musique/${m.fichier}`), m.fichier).toBe(true);
    }
  });
  it("le jour a plusieurs morceaux qui s'enchaînent (choix d'Eliot)", () => {
    expect(musique.jour.length).toBeGreaterThan(1);
  });
  it("chaque bruit existe dans public/sons", () => {
    const fichiers = [configSons.nature.jour.fichier, configSons.nature.nuit.fichier];
    for (const b of Object.values(configSons.bruits)) fichiers.push(...b.fichiers);
    for (const f of fichiers) expect(existsSync(`public/sons/${f}.mp3`), f).toBe(true);
  });
});
