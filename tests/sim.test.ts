import { describe, expect, it } from "vitest";
import { reglages } from "../src/sim/reglages";
import { avancer, creerMonde, Horloge } from "../src/sim/monde";
import { deserialiser, serialiser, VERSION_SAUVEGARDE } from "../src/sim/sauvegarde";

describe("simulation", () => {
  it("démarre avec les ressources des réglages", () => {
    const monde = creerMonde(reglages);
    expect(monde.tick).toBe(0);
    expect(monde.ressources).toEqual(reglages.ressourcesDeDepart);
  });

  it("avance à pas fixe, quelle que soit la vitesse d'affichage", () => {
    const lent = creerMonde(reglages);
    const rapide = creerMonde(reglages);
    const h1 = new Horloge(20);
    const h2 = new Horloge(20);
    for (let i = 0; i < 10; i += 1) h1.ecouler(lent, 100); // 10 images de 100 ms
    for (let i = 0; i < 60; i += 1) h2.ecouler(rapide, 1000 / 60); // 60 images à 60 i/s
    expect(lent.tick).toBe(20);
    expect(rapide.tick).toBe(20);
  });

  it("ne s'emballe pas après une longue pause", () => {
    const monde = creerMonde(reglages);
    new Horloge(20).ecouler(monde, 60_000);
    expect(monde.tick).toBe(10);
  });
});

describe("sauvegarde", () => {
  it("relit exactement ce qu'elle a écrit", () => {
    const monde = creerMonde(reglages);
    for (let i = 0; i < 42; i += 1) avancer(monde);
    monde.ressources.bois = 7;
    expect(deserialiser(serialiser(monde))).toEqual(monde);
  });

  it("porte le numéro de version", () => {
    const fichier = JSON.parse(serialiser(creerMonde(reglages)));
    expect(fichier.version).toBe(VERSION_SAUVEGARDE);
  });

  it("refuse une sauvegarde d'une version future", () => {
    const texte = JSON.stringify({ version: VERSION_SAUVEGARDE + 1, monde: {} });
    expect(() => deserialiser(texte)).toThrow(/trop récente/);
  });
});
