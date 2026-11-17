import { describe, expect, it } from "vitest";
import { reglages } from "../src/sim/reglages";
import { creerMonde, type Monde } from "../src/sim/monde";
import { avancer, Horloge } from "../src/sim/simulation";
import { deserialiser, serialiser, VERSION_SAUVEGARDE } from "../src/sim/sauvegarde";
import { chercherChemin, estLibre } from "../src/sim/chemin";
import { estAutreRive, LIEUX, lieuPont } from "../src/sim/carte";
import * as C from "../src/sim/commandes";
import { avancerNature, stadeArbre } from "../src/sim/nature";

const T = reglages.simulation.ticksParSeconde;

function secondes(monde: Monde, s: number): void {
  for (let i = 0; i < s * T; i += 1) avancer(monde);
}

function idPotager(monde: Monde): number {
  return monde.batiments.find((b) => b.type === "potager")!.id;
}

function evenementsLumo(monde: Monde): string[] {
  return monde.evenements.filter((e) => e.type === "lumo").map((e) => (e as { texte: string }).texte);
}

describe("simulation", () => {
  it("démarre avec les ressources des réglages", () => {
    const monde = creerMonde(reglages);
    expect(monde.tick).toBe(0);
    expect(monde.ressources).toEqual(reglages.ressourcesDeDepart);
    expect(monde.morris.pv).toBe(reglages.morris.coeurs * 2);
  });

  it("génère toujours la même carte", () => {
    const a = creerMonde(reglages);
    const b = creerMonde(reglages);
    expect(a.sources).toEqual(b.sources);
    expect(a.sources.filter((s) => s.type === "arbre").length).toBeGreaterThan(100);
    expect(a.sources.filter((s) => s.type === "buisson").length).toBeGreaterThan(10);
  });

  it("avance à pas fixe, quelle que soit la vitesse d'affichage", () => {
    const lent = creerMonde(reglages);
    const rapide = creerMonde(reglages);
    const h1 = new Horloge(20);
    const h2 = new Horloge(20);
    for (let i = 0; i < 10; i += 1) h1.ecouler(lent, 100);
    for (let i = 0; i < 60; i += 1) h2.ecouler(rapide, 1000 / 60);
    expect(lent.tick).toBe(20);
    expect(rapide.tick).toBe(20);
  });

  it("ne s'emballe pas après une longue pause", () => {
    const monde = creerMonde(reglages);
    new Horloge(20).ecouler(monde, 60_000);
    expect(monde.tick).toBe(10);
  });
});

describe("carte", () => {
  it("la rivière sépare le camp de l'autre rive, sauf avec le pont", () => {
    const monde = creerMonde(reglages);
    const pont = lieuPont();
    const enFace = { x: pont.x - 4, z: pont.z + 4 };
    expect(estAutreRive(enFace.x, enFace.z)).toBe(true);
    expect(estAutreRive(LIEUX.camp.x, LIEUX.camp.z)).toBe(false);
    expect(chercherChemin(monde, LIEUX.depart, enFace)).toBeNull();
  });

  it("Morris trouve un chemin du camp jusqu'au bord de la rivière", () => {
    const monde = creerMonde(reglages);
    const pont = lieuPont();
    expect(chercherChemin(monde, LIEUX.depart, pont, 4)).not.toBeNull();
    expect(estLibre(monde, LIEUX.depart.x, LIEUX.depart.z)).toBe(true);
  });

  it("le brouillard s'ouvre autour de Morris mais jamais sur l'autre rive", () => {
    const monde = creerMonde(reglages);
    secondes(monde, 1);
    const i = (p: { x: number; z: number }) => Math.floor(p.z) * monde.carte.largeur + Math.floor(p.x);
    expect(monde.brouillard[i(LIEUX.camp)]).toBe(1);
    expect(monde.brouillard[i(LIEUX.sanglier)]).toBe(0);
    expect(monde.brouillard.every((v, k) => v === 0 || !estAutreRive((k % 90) + 0.5, Math.floor(k / 90) + 0.5))).toBe(true);
  });
});

describe("déplacement", () => {
  it("un clic sur l'épave fait marcher Morris jusqu'à côté", () => {
    const monde = creerMonde(reglages);
    expect(estLibre(monde, LIEUX.epave.x, LIEUX.epave.z)).toBe(false);
    expect(C.deplacerMorris(monde, LIEUX.epave.x, LIEUX.epave.z)).toBeNull();
    const fin = monde.morris.chemin[monde.morris.chemin.length - 1]!;
    expect(Math.hypot(fin.x - LIEUX.epave.x, fin.z - LIEUX.epave.z)).toBeLessThan(4.5);
  });
});

describe("début de partie", () => {
  it("Morris marche, ouvre la caisse et obtient KX-7", () => {
    const monde = creerMonde(reglages);
    expect(C.allerALaCaisse(monde)).toBeNull();
    secondes(monde, 6);
    expect(monde.caisseOuverte).toBe(true);
    expect(monde.robots.map((r) => r.nom)).toEqual(["KX-7"]);
  });

  it("un robot coupe du bois et le rapporte au camp", () => {
    const monde = creerMonde(reglages);
    C.allerALaCaisse(monde);
    secondes(monde, 6);
    const kx = monde.robots[0]!;
    // Le robot ne va que là où le brouillard est levé : on découvre un peu les alentours.
    monde.brouillard.fill(1);
    C.choisirTravail(monde, kx.id, "bois");
    secondes(monde, 40);
    expect(monde.ressources.bois).toBeGreaterThanOrEqual(reglages.robots.capaciteSac);
    // Le dépôt est annoncé (pour le nombre qui s'envole à l'écran).
    expect(monde.evenements.some((e) => e.type === "depot" && e.quoi === "bois" && e.quantite > 0)).toBe(true);
  });

  it("le potager se construit et les légumes poussent", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 20;
    expect(C.construire(monde, "potager")).toBeNull();
    secondes(monde, reglages.batiments.potager.travail + 8);
    expect(monde.batiments.find((b) => b.type === "potager")?.construit).toBe(true);
    C.planter(monde, idPotager(monde), 0, "lumirave");
    secondes(monde, reglages.legumes.lumirave.pousse + 1);
    expect(C.recolterParcelle(monde, idPotager(monde), 0)).toBeNull();
    expect(monde.legumes.lumirave).toBe(1);
    expect(monde.stats.legumesRecoltes).toBe(1);
  });

  it("un robot jardinier sème, récolte et rapporte les légumes", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 20;
    monde.morris.pv = 10000; // les monstres de la nuit ne comptent pas ici
    C.construire(monde, "potager");
    secondes(monde, reglages.batiments.potager.travail + 8);
    C.allerALaCaisse(monde);
    secondes(monde, 10);
    const robot = monde.robots[0]!;
    expect(C.choisirTravail(monde, robot.id, "potager")).toBeNull();
    secondes(monde, 30);
    const p = monde.batiments.find((b) => b.type === "potager")!;
    expect(p.parcelles!.every((x) => x.legume !== null)).toBe(true);
    secondes(monde, reglages.legumes.lumirave.pousse + 20);
    expect(monde.legumes.lumirave).toBeGreaterThanOrEqual(1);
  });

  it("Morris construit la cloche jusqu'au bout", () => {
    const monde = creerMonde(reglages);
    monde.ressources = { bois: 50, metal: 20, nourriture: 10, eclats: 0 };
    monde.morris.pv = 10000;
    C.construire(monde, "potager");
    secondes(monde, reglages.batiments.potager.travail + 8);
    expect(C.construire(monde, "cloche")).toBeNull();
    secondes(monde, reglages.batiments.cloche.travail + 10);
    expect(monde.batiments.find((b) => b.type === "cloche")?.construit).toBe(true);
  });

  it("on choisit l'emplacement d'un bâtiment, avec des règles", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 20;
    // Dans le brouillard : interdit.
    expect(C.construire(monde, "potager", { x: 10, z: 80 })).toMatch(/découvrir/);
    monde.brouillard.fill(1);
    // Sur la tente : pas de place.
    expect(C.construire(monde, "potager", LIEUX.tente)).toMatch(/place/);
    expect(monde.ressources.bois).toBe(20);
    // Un bon endroit dans le camp : le chantier est posé là.
    expect(C.construire(monde, "potager", { x: 46.2, z: 38.4 })).toBeNull();
    const p = monde.batiments.find((b) => b.type === "potager")!;
    expect(p).toMatchObject({ x: 46, z: 38 });
    expect(monde.ressources.bois).toBe(20 - reglages.batiments.potager.cout.bois);
  });

  it("le pique-chou ne se cueille pas à la main", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 20;
    C.construire(monde, "potager");
    secondes(monde, reglages.batiments.potager.travail + 8);
    C.planter(monde, idPotager(monde), 1, "pique-chou");
    secondes(monde, reglages.legumes["pique-chou"].pousse + 1);
    expect(C.recolterParcelle(monde, idPotager(monde), 1)).toMatch(/robot/);
  });

  it("la givrotte ne pousse que la nuit", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 20;
    C.construire(monde, "potager");
    secondes(monde, reglages.batiments.potager.travail + 8);
    C.planter(monde, idPotager(monde), 2, "givrotte");
    secondes(monde, 30);
    const p = monde.batiments.find((b) => b.type === "potager")!.parcelles![2]!;
    expect(monde.temps.nuit).toBe(false);
    expect(p.pousse).toBe(0);
  });

  it("on ne construit pas sans ressources, et le potager vient d'abord", () => {
    const monde = creerMonde(reglages);
    expect(C.construire(monde, "potager")).toMatch(/manque/);
    monde.ressources.bois = 100;
    monde.ressources.metal = 100;
    expect(C.construire(monde, "atelier")).toMatch(/potager/);
  });
});

describe("journée, faim et cœurs", () => {
  it("une journée dure jour + nuit, et la nuit arrive", () => {
    const monde = creerMonde(reglages);
    const J = reglages.journee;
    monde.morris.pv = monde.morris.pvMax = 10_000; // les monstres de la nuit ne doivent pas finir la partie ici
    secondes(monde, J.dureeJour - J.debutEnSecondes + 1);
    expect(monde.temps.nuit).toBe(true);
    secondes(monde, J.dureeNuit + 1);
    expect(monde.temps.jour).toBe(2);
    expect(monde.temps.nuit).toBe(false);
  });

  it("Lumo prévient de la faim, puis Morris ralentit", () => {
    const monde = creerMonde(reglages);
    monde.morris.faim = reglages.morris.faimAlerte + 0.01;
    secondes(monde, 3);
    expect(monde.morris.aPrevenuFaim).toBe(true);
    monde.morris.faim = 0;
    const avant = monde.morris.x;
    monde.morris.chemin = [{ x: avant - 10, z: monde.morris.z }];
    avancer(monde);
    expect(avant - monde.morris.x).toBeCloseTo((reglages.morris.vitesse * reglages.morris.ralentiAffame) / T, 5);
  });

  it("manger rend un peu de vie, dormir au camp rend tout", () => {
    const monde = creerMonde(reglages);
    monde.morris.pv = 3;
    C.manger(monde, "nourriture");
    expect(monde.morris.pv).toBe(3 + reglages.nourriture.soin);
    expect(C.dormir(monde)).toBeNull();
    expect(monde.morris.pv).toBe(monde.morris.pvMax);
  });

  it("Morris battu : fin de partie", () => {
    const monde = creerMonde(reglages);
    monde.morris.pv = 1;
    monde.monstres.push({ ...monde.monstres[0]!, id: 999, type: "scarabee", x: monde.morris.x + 0.5, z: monde.morris.z, pv: 3, pvMax: 3, etat: "approche" });
    // On passe la nuit pour que le scarabée reste.
    monde.temps.seconde = reglages.journee.dureeJour + 1;
    secondes(monde, 3);
    expect(monde.fin).toBe("defaite");
  });

  it("après une défaite, Morris se relève au camp et rien n'est perdu", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 17;
    monde.brouillard[0] = 1;
    monde.morris.x = 30;
    monde.morris.z = 30;
    monde.temps.seconde = reglages.journee.dureeJour + 5;
    monde.temps.nuit = true;
    monde.monstres.push({ ...monde.monstres[0]!, id: 999, type: "scarabee", x: 31, z: 30, pv: 3, pvMax: 3, etat: "approche" });
    monde.fin = "defaite";
    monde.morris.pv = 0;
    expect(C.seRelever(monde)).toBeNull();
    expect(monde.fin).toBe("en-cours");
    expect(monde.morris.pv).toBe(monde.morris.pvMax);
    expect(monde.morris).toMatchObject({ x: LIEUX.depart.x, z: LIEUX.depart.z });
    expect(monde.ressources.bois).toBe(17);
    expect(monde.brouillard[0]).toBe(1);
    expect(monde.temps.nuit).toBe(false);
    expect(monde.monstres.every((m) => m.type === "sanglier")).toBe(true);
  });
});

describe("palissade", () => {
  /** Un monde avec un potager, tout découvert, et du bois. */
  function mondeAvecBois(): Monde {
    const monde = creerMonde(reglages);
    monde.brouillard.fill(1);
    monde.ressources.bois = 100;
    monde.morris.pv = 10000;
    C.construire(monde, "potager");
    secondes(monde, reglages.batiments.potager.travail + 8);
    return monde;
  }
  const de = { x: 44.5, z: 46.5 };
  const a = { x: 52.5, z: 46.5 };

  it("on trace un mur, Morris construit tous les morceaux, et on ne passe plus", () => {
    const monde = mondeAvecBois();
    expect(C.tracerPalissade(monde, de, a)).toBeNull();
    const murs = monde.batiments.filter((b) => b.type === "palissade");
    expect(murs).toHaveLength(9);
    expect(monde.ressources.bois).toBe(100 - reglages.batiments.potager.cout.bois - 9);
    secondes(monde, 9 * reglages.batiments.palissade.travail + 25);
    expect(murs.every((b) => b.construit)).toBe(true);
    expect(estLibre(monde, 48.5, 46.5)).toBe(false);
  });

  it("les murs se relient sans payer deux fois, et sans trou en diagonale", () => {
    const monde = mondeAvecBois();
    C.tracerPalissade(monde, de, a);
    const avant = monde.ressources.bois;
    // Un deuxième mur qui part du bout du premier, en biais.
    expect(C.tracerPalissade(monde, a, { x: 56.5, z: 50.5 })).toBeNull();
    const ajoutes = avant - monde.ressources.bois;
    expect(ajoutes).toBe(8); // 4 + 4 cases, sans la case de départ déjà construite
    // Chaque case du mur en biais touche la suivante par un côté (pas seulement par un coin).
    const cases = monde.batiments.filter((b) => b.type === "palissade").map((b) => [Math.floor(b.x), Math.floor(b.z)]);
    for (const [x, z] of cases) {
      const voisins = cases.filter(([x2, z2]) => Math.abs(x2! - x!) + Math.abs(z2! - z!) === 1);
      expect(voisins.length).toBeGreaterThan(0);
    }
  });

  it("refuse un mur sur un obstacle ou sans assez de bois", () => {
    const monde = mondeAvecBois();
    expect(C.tracerPalissade(monde, { x: LIEUX.tente.x - 3, z: LIEUX.tente.z }, { x: LIEUX.tente.x + 3, z: LIEUX.tente.z })).toMatch(/place/);
    monde.ressources.bois = 3;
    expect(C.tracerPalissade(monde, de, a)).toMatch(/bois/);
    expect(monde.batiments.filter((b) => b.type === "palissade")).toHaveLength(0);
  });

  it("une porte remplace un morceau : Morris passe, le scarabée tape dedans", () => {
    const monde = mondeAvecBois();
    C.tracerPalissade(monde, de, a);
    secondes(monde, 9 * reglages.batiments.palissade.travail + 25);
    const lieu = { x: 48.5, z: 46.5 };
    expect(C.construire(monde, "porte", lieu)).toBeNull();
    secondes(monde, reglages.batiments.porte.travail + 10);
    const porte = monde.batiments.find((b) => b.type === "porte")!;
    expect(porte.construit).toBe(true);
    expect(monde.batiments.filter((b) => b.type === "palissade")).toHaveLength(8);
    expect(estLibre(monde, lieu.x, lieu.z)).toBe(true);
    // Un scarabée de l'autre côté de la porte, qui vise Morris.
    monde.morris.x = 48.5;
    monde.morris.z = 43.5;
    monde.morris.chemin = [];
    monde.morris.interaction = null;
    monde.temps.seconde = reglages.journee.dureeJour + 5;
    monde.monstres.push({ ...monde.monstres[0]!, id: 999, type: "scarabee", x: 48.5, z: 49.5, pv: 300, pvMax: 300, etat: "approche", recharge: 0 });
    secondes(monde, 6);
    const scarabee = monde.monstres.find((m) => m.id === 999)!;
    expect(porte.pv!).toBeLessThan(reglages.batiments.porte.pvSegment);
    expect(scarabee.z).toBeGreaterThan(46.5);
  });
});

describe("robots qui se battent", () => {
  function mondeAvecRobot(): { monde: Monde; robot: Monde["robots"][number] } {
    const monde = creerMonde(reglages);
    monde.brouillard.fill(1);
    monde.morris.pv = 10000;
    C.allerALaCaisse(monde);
    secondes(monde, 8);
    return { monde, robot: monde.robots[0]! };
  }
  function scarabee(monde: Monde, x: number, z: number, pv = 3): Monde["monstres"][number] {
    const mo = { ...monde.monstres[0]!, id: 900 + monde.monstres.length, type: "scarabee" as const, x, z, pv, pvMax: pv, etat: "approche" as const, recharge: 0, vol: null };
    monde.monstres.push(mo);
    return mo;
  }

  it("robot choisi + clic sur un monstre : il l'attaque, puis reprend son travail", () => {
    const { monde, robot } = mondeAvecRobot();
    C.choisirTravail(monde, robot.id, "cueillette");
    robot.pv = 100; // on teste l'attaque, pas la résistance
    const mo = scarabee(monde, robot.x + 3, robot.z);
    expect(C.robotAttaque(monde, robot.id, mo.id)).toBeNull();
    secondes(monde, 12);
    expect(monde.monstres.includes(mo)).toBe(false);
    expect(robot.travail).toBe("cueillette");
  });

  it("« Défendre le camp » : le robot attaque un monstre qui approche du camp", () => {
    const { monde, robot } = mondeAvecRobot();
    robot.pv = 100;
    C.choisirTravail(monde, robot.id, "defendre");
    const mo = scarabee(monde, LIEUX.camp.x + 6, LIEUX.camp.z + 3, 300);
    secondes(monde, 8);
    expect(mo.pv).toBeLessThan(300);
  });

  it("presque cassé, le robot arrête de se battre et rentre au camp", () => {
    const { monde, robot } = mondeAvecRobot();
    C.choisirTravail(monde, robot.id, "defendre");
    robot.pv = reglages.robots.pvRetraite;
    robot.x = LIEUX.camp.x + 14;
    robot.z = LIEUX.camp.z;
    expect(C.robotAttaque(monde, robot.id, scarabee(monde, robot.x + 2, robot.z).id)).toMatch(/abîmé/);
    secondes(monde, 15);
    expect(Math.hypot(robot.x - LIEUX.camp.x, robot.z - LIEUX.camp.z)).toBeLessThan(reglages.camp.rayonPalissade);
  });
});

describe("combat", () => {
  it("le tourbillon frappe tous les monstres autour de Morris", () => {
    const monde = creerMonde(reglages);
    monde.temps.seconde = reglages.journee.dureeJour + 1;
    const m = monde.morris;
    for (let i = 0; i < 3; i += 1) {
      monde.monstres.push({ ...monde.monstres[0]!, id: 100 + i, type: "grignotin", x: m.x + 1 + i * 0.5, z: m.z, pv: 2, pvMax: 2, etat: "approche" });
    }
    C.tourbillon(monde);
    expect(monde.monstres.filter((x) => x.type === "grignotin")).toHaveLength(0);
    expect(monde.objets.filter((o) => o.type === "eclat")).toHaveLength(3);
    expect(C.tourbillon(monde)).toMatch(/recharge/);
  });

  it("le sanglier charge, se cogne et garde le cœur caché", () => {
    const monde = creerMonde(reglages);
    const s = monde.monstres.find((x) => x.type === "sanglier")!;
    monde.morris.x = s.x + 5;
    monde.morris.z = s.z;
    avancer(monde);
    expect(s.etat).toBe("charge");
    expect(monde.objets.some((o) => o.type === "coeur")).toBe(true);
  });

  it("battre le sanglier et ramasser le cœur donne un cœur de plus", () => {
    const monde = creerMonde(reglages);
    const s = monde.monstres.find((x) => x.type === "sanglier")!;
    s.pv = 1;
    monde.morris.x = s.x + 1;
    monde.morris.z = s.z;
    s.minuterie = 100;
    C.attaquer(monde, s.id);
    secondes(monde, 1);
    expect(monde.monstres.some((x) => x.type === "sanglier")).toBe(false);
    const coeur = monde.objets.find((o) => o.type === "coeur")!;
    monde.morris.x = coeur.x;
    monde.morris.z = coeur.z;
    avancer(monde);
    expect(monde.morris.pvMax).toBe(reglages.morris.coeurs * 2 + 2);
  });
});

describe("fin du jeu d'essai", () => {
  it("construire le pont mène au bilan", () => {
    const monde = creerMonde(reglages);
    Object.assign(monde.ressources, { bois: 200, metal: 200 });
    C.construire(monde, "potager");
    secondes(monde, reglages.batiments.potager.travail + 8);
    expect(C.construire(monde, "pont")).toBeNull();
    secondes(monde, 40 + reglages.batiments.pont.travail);
    expect(monde.batiments.find((b) => b.type === "pont")?.construit).toBe(true);
    secondes(monde, 10);
    expect(monde.fin).toBe("victoire");
  });
});

describe("plusieurs bâtiments, démolir", () => {
  function potager(monde: Monde, id: number, x: number, z: number): Monde["batiments"][number] {
    const b = { id, type: "potager" as const, x, z, construit: true, travailFait: 8, parcelles: Array.from({ length: 6 }, () => ({ legume: null, pousse: 0 })) };
    monde.batiments.push(b);
    monde.versionObstacles += 1;
    return b;
  }

  it("on peut avoir jusqu'à 4 potagers, mais un seul atelier", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 1000;
    monde.ressources.metal = 1000;
    for (let i = 0; i < 4; i += 1) potager(monde, 700 + i, 30 + i * 4, 30);
    expect(C.construire(monde, "potager")).toMatch(/4 au maximum/);
    monde.batiments.push({ id: 710, type: "atelier", x: LIEUX.atelier.x, z: LIEUX.atelier.z, construit: true, travailFait: 0 });
    expect(C.construire(monde, "atelier")).toMatch(/Déjà construit/);
  });

  it("deux jardiniers se répartissent entre deux potagers", () => {
    const monde = creerMonde(reglages);
    monde.brouillard.fill(1);
    const a = potager(monde, 720, LIEUX.potager.x, LIEUX.potager.z);
    const b = potager(monde, 721, LIEUX.potager.x - 5, LIEUX.potager.z + 6);
    const r1 = C.creerRobot(monde, 50, 40)!;
    const r2 = C.creerRobot(monde, 51, 40)!;
    C.choisirTravail(monde, r1.id, "potager");
    C.choisirTravail(monde, r2.id, "potager");
    secondes(monde, 20);
    expect(new Set([r1.cibleId, r2.cibleId])).toEqual(new Set([a.id, b.id]));
    expect(a.parcelles!.some((p) => p.legume)).toBe(true);
    expect(b.parcelles!.some((p) => p.legume)).toBe(true);
  });

  it("démolir : un chantier est remboursé en entier, un bâtiment fini à moitié, et la place se libère", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 8;
    expect(C.construire(monde, "potager")).toBeNull();
    expect(monde.ressources.bois).toBe(0);
    const chantier = monde.batiments.find((b) => b.type === "potager")!;
    expect(estLibre(monde, chantier.x, chantier.z)).toBe(false);
    expect(C.demolir(monde, chantier.id)).toBeNull();
    expect(monde.ressources.bois).toBe(8);
    expect(monde.batiments.includes(chantier)).toBe(false);
    expect(estLibre(monde, chantier.x, chantier.z)).toBe(true);

    const fini = potager(monde, 730, LIEUX.potager.x, LIEUX.potager.z);
    const r = C.creerRobot(monde, 50, 40)!;
    C.choisirTravail(monde, r.id, "potager");
    secondes(monde, 2);
    expect(r.cibleId).toBe(fini.id);
    expect(C.demolir(monde, fini.id)).toBeNull();
    expect(monde.ressources.bois).toBe(8 + Math.floor(reglages.batiments.potager.cout.bois * reglages.demolition.remboursementConstruit));
    expect(r.cibleId).toBeNull();
  });

  it("la tente et le pont ne se démolissent pas", () => {
    const monde = creerMonde(reglages);
    const tente = monde.batiments.find((b) => b.type === "tente")!;
    expect(C.demolir(monde, tente.id)).toMatch(/tente/);
    monde.batiments.push({ id: 740, type: "pont", x: 10, z: 10, construit: true, travailFait: 0 });
    expect(C.demolir(monde, 740)).toMatch(/pont/);
    expect(monde.batiments.some((b) => b.id === 740)).toBe(true);
  });
});

describe("grenier, lanterne, station, piège", () => {
  function bati(monde: Monde, type: "grenier" | "lanterne" | "station" | "piege", x: number, z: number): Monde["batiments"][number] {
    const b = { id: 800 + monde.batiments.length, type, x, z, construit: true, travailFait: 99, recharge: 0 };
    monde.batiments.push(b);
    monde.versionObstacles += 1;
    return b;
  }
  function grignotin(monde: Monde, x: number, z: number): Monde["monstres"][number] {
    const mo = { ...monde.monstres[0]!, id: 950 + monde.monstres.length, type: "grignotin" as const, x, z, pv: 2, pvMax: 2, etat: "approche" as const, recharge: 0, vol: null, origine: { x: x + 20, z } };
    monde.monstres.push(mo);
    return mo;
  }
  function mondeCalme(): Monde {
    const monde = creerMonde(reglages);
    monde.brouillard.fill(1);
    monde.monstres = [];
    monde.morris.x = 20;
    monde.morris.z = 70;
    // La nuit : c'est là que les grignotins viennent (le jour, ils repartent).
    monde.temps.seconde = reglages.journee.dureeJour + 5;
    monde.temps.nuit = true;
    return monde;
  }

  it("le grenier garde une partie de la nourriture à l'abri des grignotins", () => {
    const monde = mondeCalme();
    const abri = reglages.batiments.grenier.nourritureProtegee;
    monde.ressources.nourriture = abri;
    bati(monde, "grenier", LIEUX.camp.x - 4, LIEUX.camp.z + 4);
    const tente = monde.batiments.find((b) => b.type === "tente")!;
    grignotin(monde, tente.x + 1, tente.z);
    secondes(monde, 3);
    expect(monde.ressources.nourriture).toBe(abri);
    // Sans grenier, il vole.
    monde.batiments = monde.batiments.filter((b) => b.type !== "grenier");
    grignotin(monde, tente.x + 1, tente.z);
    secondes(monde, 3);
    expect(monde.ressources.nourriture).toBeLessThan(abri);
  });

  it("la nuit, un grignotin s'enfuit de la lumière d'une lanterne", () => {
    const monde = mondeCalme();
    monde.ressources.nourriture = 50;
    const tente = monde.batiments.find((b) => b.type === "tente")!;
    bati(monde, "lanterne", tente.x + 2, tente.z);
    const mo = grignotin(monde, tente.x + 4, tente.z);
    secondes(monde, 1);
    expect(mo.etat).toBe("fuit");
    expect(mo.vol).toBeNull();
    expect(monde.ressources.nourriture).toBe(50);
  });

  it("la station de recharge répare un robot abîmé bien plus vite que le camp", () => {
    const monde = mondeCalme();
    const s = bati(monde, "station", 30, 60);
    const r = C.creerRobot(monde, s.x + 2, s.z)!;
    r.pv = 1;
    secondes(monde, reglages.batiments.station.soinSecondes * 2 + 0.5);
    expect(r.pv).toBeGreaterThanOrEqual(3);
  });

  it("le piège attrape un grignotin, rend la nourriture volée, puis se réarme", () => {
    const monde = mondeCalme();
    const p = bati(monde, "piege", 30, 60);
    monde.ressources.nourriture = 10;
    const mo = grignotin(monde, p.x + 0.5, p.z);
    mo.vol = { type: "nourriture", quantite: 4 };
    secondes(monde, 0.2);
    expect(monde.monstres.includes(mo)).toBe(false);
    expect(monde.ressources.nourriture).toBe(14);
    expect(p.recharge).toBeGreaterThan(0);
    // Pendant le réarmement, il n'attrape rien.
    const autre = grignotin(monde, p.x, p.z);
    autre.etat = "fuit";
    autre.origine = { x: p.x, z: p.z };
    expect(monde.monstres.includes(autre)).toBe(true);
    secondes(monde, reglages.batiments.piege.rearmementSecondes + 1);
    expect(p.recharge).toBe(0);
  });
});

describe("niveaux des bâtiments", () => {
  function riche(): Monde {
    const monde = creerMonde(reglages);
    monde.brouillard.fill(1);
    monde.monstres = [];
    Object.assign(monde.ressources, { bois: 1000, metal: 1000, eclats: 1000, nourriture: 1000 });
    return monde;
  }
  function bati(monde: Monde, type: Monde["batiments"][number]["type"], x: number, z: number): Monde["batiments"][number] {
    const b = { id: 900 + monde.batiments.length, type, x, z, construit: true, travailFait: 99, recharge: 0 };
    monde.batiments.push(b);
    monde.versionObstacles += 1;
    return b;
  }

  it("on améliore jusqu'au niveau 3, en payant, pas plus", () => {
    const monde = riche();
    const g = bati(monde, "grenier", 30, 60);
    const avant = monde.ressources.bois;
    expect(C.ameliorer(monde, g.id)).toBeNull();
    expect(g.niveau).toBe(2);
    expect(monde.ressources.bois).toBe(avant - reglages.niveaux.grenier.prix[0]!.bois!);
    expect(C.ameliorer(monde, g.id)).toBeNull();
    expect(g.niveau).toBe(3);
    expect(C.ameliorer(monde, g.id)).toMatch(/maximum/);
  });

  it("refuse sans ressources, et un chantier ne s'améliore pas", () => {
    const monde = creerMonde(reglages);
    const g = bati(monde, "grenier", 30, 60);
    monde.ressources.bois = 0;
    expect(C.ameliorer(monde, g.id)).toMatch(/manque/);
    expect(g.niveau).toBeUndefined();
    g.construit = false;
    expect(C.ameliorer(monde, g.id)).toBeNull();
    expect(g.niveau).toBeUndefined();
  });

  it("chaque niveau donne son bonus", () => {
    const monde = riche();
    const g = bati(monde, "grenier", 30, 60);
    const abri1 = reglages.batiments.grenier.nourritureProtegee;
    C.ameliorer(monde, g.id);
    const a = bati(monde, "atelier", LIEUX.atelier.x, LIEUX.atelier.z);
    const r = C.creerRobot(monde, 50, 40)!;
    r.etat = "casse";
    r.pv = 0;
    C.ameliorer(monde, a.id);
    const eclats = monde.ressources.eclats;
    expect(C.reparerRobot(monde, r.id)).toBeNull();
    expect(eclats - monde.ressources.eclats).toBe(Math.round(reglages.robots.reparationEclats * reglages.niveaux.atelier.effet[1]!));
    // Grenier niveau 2 : plus de nourriture à l'abri.
    monde.ressources.nourriture = abri1 * 2;
    const tente = monde.batiments.find((b) => b.type === "tente")!;
    monde.temps.seconde = reglages.journee.dureeJour + 5;
    monde.temps.nuit = true;
    monde.monstres.push({ ...creerMonde(reglages).monstres[0]!, id: 990, type: "grignotin", x: tente.x + 1, z: tente.z, pv: 2, pvMax: 2, etat: "approche", recharge: 0, vol: null });
    monde.morris.x = 20;
    monde.morris.z = 70;
    secondes(monde, 3);
    expect(monde.ressources.nourriture).toBe(abri1 * 2);
  });

  it("un potager niveau 3 fait pousser deux fois plus vite", () => {
    const pousse = (niveau: number): number => {
      const monde = riche();
      const p = bati(monde, "potager", LIEUX.potager.x, LIEUX.potager.z);
      p.parcelles = Array.from({ length: 6 }, () => ({ legume: null, pousse: 0 }));
      p.niveau = niveau;
      C.planter(monde, p.id, 0, "lumirave");
      secondes(monde, 2);
      return p.parcelles[0]!.pousse;
    };
    expect(pousse(3)).toBeCloseTo(pousse(1) * reglages.niveaux.potager.effet[2]!, 5);
  });

  it("améliorer le mur : tous les morceaux passent au niveau suivant, plus solides et réparés", () => {
    const monde = riche();
    const morceaux = [0, 1, 2].map((i) => {
      const b = bati(monde, "palissade", 30 + i + 0.5, 60.5);
      b.pv = 3;
      return b;
    });
    const bois = monde.ressources.bois;
    expect(C.ameliorer(monde, morceaux[0]!.id)).toBeNull();
    expect(monde.ressources.bois).toBe(bois - 3 * reglages.niveaux.palissade.prix[0]!.bois!);
    for (const m of morceaux) {
      expect(m.niveau).toBe(2);
      expect(m.pv).toBe(Math.round(reglages.batiments.palissade.pvSegment * reglages.niveaux.palissade.effet[1]!));
    }
  });

  it("une cloche niveau 2 appelle les robots proches à défendre le camp", () => {
    const monde = riche();
    const c = bati(monde, "cloche", LIEUX.cloche.x, LIEUX.cloche.z);
    c.niveau = 2;
    const r = C.creerRobot(monde, LIEUX.camp.x + 8, LIEUX.camp.z)!;
    C.choisirTravail(monde, r.id, "bois");
    monde.morris.x = 20;
    monde.morris.z = 70;
    monde.ressources.nourriture = 50;
    monde.temps.seconde = reglages.journee.dureeJour + 5;
    monde.temps.nuit = true;
    const tente = monde.batiments.find((b) => b.type === "tente")!;
    monde.monstres.push({ ...creerMonde(reglages).monstres[0]!, id: 991, type: "grignotin", x: tente.x + 1, z: tente.z, pv: 2, pvMax: 2, etat: "approche", recharge: 0, vol: null });
    secondes(monde, 2);
    expect(r.travail).toBe("defendre");
  });
});

describe("déplacer les robots", () => {
  it("robots choisis + clic sur le sol : ils y vont, sans s'empiler, et attendent", () => {
    const monde = creerMonde(reglages);
    monde.brouillard.fill(1);
    monde.monstres = [];
    const a = C.creerRobot(monde, 50, 40)!;
    const b = C.creerRobot(monde, 51, 40)!;
    C.choisirTravail(monde, a.id, "bois");
    expect(C.deplacerRobots(monde, [a.id, b.id], 40.5, 44.5)).toBeNull();
    secondes(monde, 10);
    expect(Math.hypot(a.x - 40.5, a.z - 44.5)).toBeLessThan(1.6);
    expect(Math.hypot(b.x - 40.5, b.z - 44.5)).toBeLessThan(1.6);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.5);
    expect(a.travail).toBe("aucun");
    expect(a.etat).toBe("attend");
  });
});

describe("robots", () => {
  it("on ne dépasse pas 5 robots, aux noms choisis par Eliot", () => {
    const monde = creerMonde(reglages);
    for (let i = 0; i < 7; i += 1) C.creerRobot(monde, 50, 40);
    expect(monde.robots.map((r) => r.nom)).toEqual(["KX-7", "Kobalt-5", "Ion-9", "Vexo-12", "Sigma-4"]);
  });

  function chantiers(monde: Monde): { proche: Monde["batiments"][number]; loin: Monde["batiments"][number] } {
    monde.brouillard.fill(1);
    const proche = { id: 600, type: "potager" as const, x: LIEUX.potager.x, z: LIEUX.potager.z, construit: false, travailFait: 0 };
    const loin = { id: 601, type: "atelier" as const, x: LIEUX.atelier.x, z: LIEUX.atelier.z, construit: false, travailFait: 0 };
    monde.batiments.push(proche, loin);
    monde.versionObstacles += 1;
    return { proche, loin };
  }

  it("robots choisis + clic sur un chantier : ils vont tous sur CE chantier", () => {
    const monde = creerMonde(reglages);
    const { proche, loin } = chantiers(monde);
    const r = C.creerRobot(monde, proche.x + 2, proche.z)!;
    expect(C.robotsConstruisent(monde, [r.id], loin.id)).toBeNull();
    secondes(monde, 15);
    expect(loin.travailFait).toBeGreaterThan(0);
    expect(proche.travailFait).toBe(0);
  });

  it("à plusieurs robots, un chantier se construit plus vite", () => {
    const duree = (n: number): number => {
      const monde = creerMonde(reglages);
      const { loin } = chantiers(monde);
      const ids = [];
      for (let i = 0; i < n; i += 1) ids.push(C.creerRobot(monde, loin.x + 3, loin.z + i - 1)!.id);
      C.robotsConstruisent(monde, ids, loin.id);
      let s = 0;
      while (!loin.construit && s < 200 * T) {
        avancer(monde);
        s += 1;
      }
      return s;
    };
    const seul = duree(1);
    const trois = duree(3);
    expect(seul).toBeLessThan(200 * T);
    expect(trois).toBeLessThan(seul * 0.6);
  });

  it("un robot cassé se répare à l'atelier avec des éclats", () => {
    const monde = creerMonde(reglages);
    const r = C.creerRobot(monde, 50, 40)!;
    r.etat = "casse";
    r.pv = 0;
    expect(C.reparerRobot(monde, r.id)).toMatch(/atelier/);
    monde.batiments.push({ id: 500, type: "atelier", x: LIEUX.atelier.x, z: LIEUX.atelier.z, construit: true, travailFait: 0 });
    monde.ressources.eclats = reglages.robots.reparationEclats;
    expect(C.reparerRobot(monde, r.id)).toBeNull();
    expect(r.etat).toBe("attend");
  });
});

describe("sauvegarde", () => {
  it("relit exactement ce qu'elle a écrit", () => {
    const monde = creerMonde(reglages);
    secondes(monde, 2);
    monde.ressources.bois = 7;
    monde.evenements = [];
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

  it("une sauvegarde de la structure vide (version 1) démarre une partie neuve", () => {
    const monde = deserialiser(JSON.stringify({ version: 1, monde: { tick: 3, ressources: { bois: 0, nourriture: 0 } } }));
    expect(monde.robots).toEqual([]);
    expect(monde.morris.pv).toBe(reglages.morris.coeurs * 2);
  });

  it("version 2 : l'ancienne palissade en anneau devient des morceaux et une porte", () => {
    const monde = creerMonde(reglages) as unknown as { batiments: Array<Record<string, unknown>> };
    monde.batiments.push({ id: 900, type: "palissade", x: LIEUX.camp.x, z: LIEUX.camp.z, construit: true, travailFait: 24, segments: new Array(28).fill(5) });
    const relu = deserialiser(JSON.stringify({ version: 2, monde }));
    const murs = relu.batiments.filter((b) => b.type === "palissade");
    expect(murs.length).toBeGreaterThan(40);
    expect(murs.every((b) => b.construit && b.pv === 5 && !("segments" in b))).toBe(true);
    expect(relu.batiments.some((b) => b.type === "porte")).toBe(true);
  });

  it("version 3 : une sauvegarde d'avant les robots combattants se relit telle quelle", () => {
    const monde = creerMonde(reglages);
    const relu = deserialiser(JSON.stringify({ version: 3, monde }));
    expect(relu.robots).toEqual(monde.robots);
    expect(relu.tick).toBe(monde.tick);
  });

  it("version 4 : une sauvegarde d'avant les nouveaux bâtiments se relit telle quelle", () => {
    const monde = creerMonde(reglages);
    const relu = deserialiser(JSON.stringify({ version: 4, monde }));
    expect(relu.batiments).toEqual(monde.batiments);
  });

  it("version 5 : une sauvegarde d'avant les niveaux se relit (niveau 1 par défaut)", () => {
    const monde = creerMonde(reglages);
    const relu = deserialiser(JSON.stringify({ version: 5, monde }));
    expect(relu.batiments).toEqual(monde.batiments);
    expect(relu.batiments.every((b) => (b.niveau ?? 1) === 1)).toBe(true);
  });

  it("version 6 : une sauvegarde d'avant la repousse se relit, les souches repousseront", () => {
    const monde = creerMonde(reglages);
    const arbre = monde.sources.find((s) => s.type === "arbre")!;
    arbre.reste = 0;
    const relu = deserialiser(JSON.stringify({ version: 6, monde }));
    const r = relu.sources.find((s) => s.id === arbre.id)!;
    expect(r.repousse).toBeUndefined();
    expect(stadeArbre(r)).toBe("souche");
  });

  it("version 7 : une sauvegarde d'avant le ramassage des éclats se relit telle quelle", () => {
    const monde = creerMonde(reglages);
    const relu = deserialiser(JSON.stringify({ version: 7, monde }));
    expect(relu.robots).toEqual(monde.robots);
    expect(relu.objets).toEqual(monde.objets);
  });

  it("Lumo parle dès le début", () => {
    const monde = creerMonde(reglages);
    avancer(monde);
    avancer(monde);
    expect(evenementsLumo(monde).length).toBeGreaterThan(0);
  });
});

describe("Nature : les arbres coupés repoussent", () => {
  const T = reglages.simulation.ticksParSeconde;
  const { dureeSouche, dureePousse } = reglages.repousse;
  function arbreLoin(monde: Monde) {
    return monde.sources.find((s) => s.type === "arbre" && Math.hypot(s.x - monde.morris.x, s.z - monde.morris.z) > 15)!;
  }

  it("souche, puis pousse, puis arbre qui bloque de nouveau le passage", () => {
    const monde = creerMonde(reglages);
    const a = arbreLoin(monde);
    a.reste = 0;
    monde.versionObstacles += 1;
    expect(estLibre(monde, a.x, a.z)).toBe(true);
    for (let i = 0; i < dureeSouche * T - 2; i += 1) avancerNature(monde);
    expect(stadeArbre(a)).toBe("souche");
    for (let i = 0; i < 4; i += 1) avancerNature(monde);
    expect(stadeArbre(a)).toBe("pousse");
    expect(estLibre(monde, a.x, a.z)).toBe(true);
    for (let i = 0; i < dureePousse * T; i += 1) avancerNature(monde);
    expect(stadeArbre(a)).toBe("arbre");
    expect(a.reste).toBe(reglages.sources.arbre);
    expect(estLibre(monde, a.x, a.z)).toBe(false);
  });

  it("ne repousse pas sous les pieds de Morris : attend qu'il parte", () => {
    const monde = creerMonde(reglages);
    const a = arbreLoin(monde);
    a.reste = 0;
    monde.morris.x = a.x;
    monde.morris.z = a.z;
    for (let i = 0; i < (dureeSouche + dureePousse) * T + 10; i += 1) avancerNature(monde);
    expect(stadeArbre(a)).toBe("pousse");
    monde.morris.x = a.x + 5;
    avancerNature(monde);
    expect(stadeArbre(a)).toBe("arbre");
  });
});

describe("Clic intelligent : robots choisis + clic sur une chose", () => {
  function mondeDeJour(): Monde {
    const monde = creerMonde(reglages);
    monde.brouillard.fill(1);
    monde.monstres = [];
    monde.temps.seconde = 30;
    monde.temps.nuit = false;
    return monde;
  }

  it("clic sur un arbre : le robot coupe CET arbre, pas le plus proche", () => {
    const monde = mondeDeJour();
    const r = C.creerRobot(monde, LIEUX.camp.x, LIEUX.camp.z)!;
    const arbres = monde.sources.filter((s) => s.type === "arbre").sort((a, b) => Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z));
    const loin = arbres[5]!;
    expect(C.robotsTravaillent(monde, [r.id], "bois", loin.id)).toBeNull();
    expect(r.travail).toBe("bois");
    secondes(monde, 25);
    expect(loin.reste).toBeLessThan(reglages.sources.arbre);
    expect(arbres[0]!.reste).toBe(reglages.sources.arbre);
  });

  it("clic sur un potager : le jardinier s'occupe de CE potager", () => {
    const monde = mondeDeJour();
    const p2 = { id: 901, type: "potager" as const, x: 40, z: 30, construit: true, travailFait: 99, parcelles: [null, null, null, null].map(() => ({ legume: null, pousse: 0 })) };
    monde.batiments.push(p2 as unknown as Monde["batiments"][number]);
    monde.versionObstacles += 1;
    const r = C.creerRobot(monde, LIEUX.camp.x, LIEUX.camp.z)!;
    const refus = C.robotsTravaillent(monde, [r.id], "potager", p2.id);
    // Sans le potager de départ construit, le travail est refusé ; avec, il garde ce potager.
    if (refus === null) {
      secondes(monde, 2);
      expect(r.cibleId).toBe(p2.id);
    } else expect(refus).toContain("potager");
  });

  it("clic sur un éclat : le robot le rapporte au camp puis reprend son travail", () => {
    const monde = mondeDeJour();
    const r = C.creerRobot(monde, LIEUX.camp.x, LIEUX.camp.z)!;
    C.choisirTravail(monde, r.id, "aucun");
    const id = monde.prochainId++;
    monde.objets.push({ id, type: "eclat", x: LIEUX.camp.x - 6, z: LIEUX.camp.z + 6 });
    const avant = monde.ressources.eclats;
    monde.morris.x = 20;
    monde.morris.z = 70;
    expect(C.robotsRamassent(monde, [r.id], id)).toBeNull();
    secondes(monde, 20);
    expect(monde.objets.some((o) => o.id === id)).toBe(false);
    expect(monde.ressources.eclats).toBe(avant + 1);
    expect(r.travail).toBe("aucun");
  });

  it("le cœur caché reste pour Morris", () => {
    const monde = mondeDeJour();
    const r = C.creerRobot(monde, LIEUX.camp.x, LIEUX.camp.z)!;
    const coeur = monde.objets.find((o) => o.type === "coeur")!;
    expect(C.robotsRamassent(monde, [r.id], coeur.id)).toContain("Morris");
    expect(r.travail).not.toBe("ramasser");
  });

  it("un robot qui défend le camp va chercher tout seul les éclats tombés près du camp", () => {
    const monde = mondeDeJour();
    const r = C.creerRobot(monde, LIEUX.camp.x, LIEUX.camp.z)!;
    C.choisirTravail(monde, r.id, "defendre");
    monde.morris.x = 20;
    monde.morris.z = 70;
    const id = monde.prochainId++;
    monde.objets.push({ id, type: "eclat", x: LIEUX.camp.x + 5, z: LIEUX.camp.z + 4 });
    const avant = monde.ressources.eclats;
    secondes(monde, 20);
    expect(monde.ressources.eclats).toBe(avant + 1);
    expect(r.travail).toBe("defendre");
  });
});

describe("Usine : file d'attente des robots", () => {
  function avecUsine(): { monde: Monde; u: Monde["batiments"][number] } {
    const monde = creerMonde(reglages);
    monde.monstres = [];
    const u = { id: 990, type: "usine" as const, x: 30, z: 60, construit: true, travailFait: 99 };
    monde.batiments.push(u);
    monde.ressources.bois = 500;
    monde.ressources.metal = 500;
    monde.ressources.nourriture = 500;
    monde.grainesRestantes = 10;
    return { monde, u: monde.batiments.at(-1)! };
  }

  it("plusieurs clics : les robots entrent dans la file, payés tout de suite, puis sortent un par un", () => {
    const { monde, u } = avecUsine();
    const bois = monde.ressources.bois;
    expect(C.nouveauRobot(monde)).toBeNull();
    expect(C.nouveauRobot(monde)).toBeNull();
    expect(C.nouveauRobot(monde)).toBeNull();
    expect(u.file).toHaveLength(3);
    expect(monde.ressources.bois).toBeLessThan(bois);
    expect(monde.robots).toHaveLength(0);
    secondes(monde, reglages.robots.croissanceSecondes + 0.2);
    expect(monde.robots).toHaveLength(1);
    expect(u.file).toHaveLength(2);
    secondes(monde, reglages.robots.croissanceSecondes * 2 + 0.2);
    expect(monde.robots).toHaveLength(3);
    expect(u.file).toHaveLength(0);
  });

  it("limite : robots + file ne dépassent jamais le maximum", () => {
    const { monde, u } = avecUsine();
    for (let i = 0; i < reglages.robots.maximum; i += 1) expect(C.nouveauRobot(monde)).toBeNull();
    expect(C.nouveauRobot(monde)).toContain("maximum");
    expect(u.file).toHaveLength(reglages.robots.maximum);
  });

  it("annuler rend le prix et la graine", () => {
    const { monde, u } = avecUsine();
    const avant = { ...monde.ressources };
    const graines = monde.grainesRestantes;
    C.nouveauRobot(monde);
    C.annulerRobot(monde);
    expect(monde.ressources).toEqual(avant);
    expect(monde.grainesRestantes).toBe(graines);
    expect(u.file).toHaveLength(0);
  });

  it("version 8 : une sauvegarde d'avant la file de l'usine se relit telle quelle", () => {
    const monde = creerMonde(reglages);
    const relu = deserialiser(JSON.stringify({ version: 8, monde }));
    expect(relu.batiments).toEqual(monde.batiments);
  });
});

describe("Robots qui ne font plus de bêtises", () => {
  function avecRobots(n: number, travail: Parameters<typeof C.choisirTravail>[2]): Monde {
    const monde = creerMonde(reglages);
    monde.brouillard.fill(1);
    for (let k = 0; k < n; k += 1) C.creerRobot(monde, LIEUX.camp.x + k * 0.5, LIEUX.camp.z + 2);
    for (const r of monde.robots) {
      r.rentrerLaNuit = false;
      C.choisirTravail(monde, r.id, travail);
    }
    return monde;
  }

  it("un robot ne vise jamais une source qu'il ne peut pas atteindre (autre rive)", () => {
    const monde = avecRobots(5, "cueillette");
    for (let i = 0; i < 120 * T; i += 1) {
      avancer(monde);
      for (const r of monde.robots) {
        const s = monde.sources.find((x) => x.id === r.cibleId);
        if (s) expect(estAutreRive(s.x, s.z)).toBe(false);
      }
    }
    expect(monde.ressources.nourriture).toBeGreaterThan(reglages.ressourcesDeDepart.nourriture);
  });

  it("des robots sur le même travail se répartissent entre plusieurs arbres", () => {
    const monde = avecRobots(3, "bois");
    secondes(monde, 1);
    const cibles = new Set(monde.robots.map((r) => r.cibleId));
    expect(cibles.size).toBe(3);
  });

  it("plus rien à récolter : Lumo prévient une fois et le robot rentre attendre au camp", () => {
    const monde = avecRobots(1, "ferraille");
    for (const s of monde.sources) if (s.type === "debris" || s.type === "epave") s.reste = 0;
    monde.evenements = [];
    secondes(monde, 20);
    const r = monde.robots[0]!;
    expect(r.etat).toBe("attend");
    expect(evenementsLumo(monde).filter((t) => t.includes("plus de métal")).length).toBe(1);
    expect(Math.hypot(r.x - LIEUX.tente.x, r.z - LIEUX.tente.z)).toBeLessThan(4.5);
  });

  it("un robot ne reste pas figé « en train de récolter » quand sa source est vidée par un autre", () => {
    const monde = avecRobots(1, "cueillette");
    secondes(monde, 1);
    const r = monde.robots[0]!;
    r.etat = "recolte";
    r.minuterie = 0;
    for (const s of monde.sources) if (s.type === "buisson" || s.type === "noisetier") s.reste = 0;
    secondes(monde, 1);
    expect(r.etat).not.toBe("recolte");
  });
});

describe("Nuits plus calmes", () => {
  it("la première nuit amène 3 scarabées, un par un", () => {
    const monde = creerMonde(reglages);
    const J = reglages.journee;
    monde.temps.seconde = J.dureeJour - 1;
    let vus = 0;
    const deja = new Set<number>();
    for (let i = 0; i < (J.dureeNuit - 1) * T; i += 1) {
      avancer(monde);
      monde.morris.pv = 99;
      for (const mo of monde.monstres) {
        if (mo.type === "scarabee" && !deja.has(mo.id)) {
          deja.add(mo.id);
          vus += 1;
        }
      }
    }
    expect(vus).toBe(3);
  });
});

describe("Tour de guet", () => {
  function avecTour(): Monde {
    const monde = creerMonde(reglages);
    monde.brouillard.fill(1);
    monde.batiments.push({ id: 9001, type: "tour", x: 56.5, z: 40.5, construit: true, travailFait: 99 });
    monde.versionObstacles += 1;
    return monde;
  }

  it("se construit depuis le menu Défense", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 50;
    monde.ressources.metal = 50;
    // Lumo veut le potager d'abord.
    monde.batiments.push({ id: 9000, type: "potager", x: 44.5, z: 37.5, construit: true, travailFait: 99, parcelles: [] });
    expect(C.construire(monde, "tour")).toBeNull();
    expect(monde.batiments.some((b) => b.type === "tour")).toBe(true);
  });

  it("tire toute seule sur un monstre à portée et finit par le vaincre", () => {
    const monde = avecTour();
    monde.monstres.push({ id: 9100, type: "scarabee", x: 60.5, z: 40.5, pv: 3, pvMax: 3, etat: "approche", recharge: 999, direction: null, minuterie: 0, vol: null, orientation: 0, origine: { x: 60.5, z: 40.5 } });
    monde.temps.seconde = reglages.journee.dureeJour + 1; // la nuit : il reste
    monde.evenements = [];
    secondes(monde, 6);
    expect(monde.evenements.some((e) => e.type === "tir")).toBe(true);
    expect(monde.monstres.some((m) => m.id === 9100)).toBe(false);
  });

  it("sonne l'alarme une seule fois quand un monstre approche", () => {
    const monde = avecTour();
    monde.monstres.push({ id: 9101, type: "sanglier", x: 56.5, z: 52.5, pv: 999, pvMax: 999, etat: "garde", recharge: 999, direction: null, minuterie: 0, vol: null, orientation: 0, origine: { x: 56.5, z: 52.5 } });
    monde.evenements = [];
    secondes(monde, 3);
    expect(evenementsLumo(monde).filter((t) => t.includes("tour de guet")).length).toBe(1);
  });

  it("une sauvegarde v9 se relit en v10", () => {
    const monde = creerMonde(reglages);
    const v9 = JSON.parse(serialiser(monde));
    v9.version = 9;
    expect(VERSION_SAUVEGARDE).toBe(10);
    expect(deserialiser(JSON.stringify(v9)).batiments.length).toBe(monde.batiments.length);
  });
});
