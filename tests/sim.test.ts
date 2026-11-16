import { describe, expect, it } from "vitest";
import { reglages } from "../src/sim/reglages";
import { creerMonde, type Monde } from "../src/sim/monde";
import { avancer, Horloge } from "../src/sim/simulation";
import { deserialiser, serialiser, VERSION_SAUVEGARDE } from "../src/sim/sauvegarde";
import { chercherChemin, estLibre } from "../src/sim/chemin";
import { estAutreRive, LIEUX, lieuPont } from "../src/sim/carte";
import * as C from "../src/sim/commandes";

const T = reglages.simulation.ticksParSeconde;

function secondes(monde: Monde, s: number): void {
  for (let i = 0; i < s * T; i += 1) avancer(monde);
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
  });

  it("le potager se construit et les légumes poussent", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 20;
    expect(C.construire(monde, "potager")).toBeNull();
    secondes(monde, reglages.batiments.potager.travail + 8);
    expect(monde.batiments.find((b) => b.type === "potager")?.construit).toBe(true);
    C.planter(monde, 0, "lumirave");
    secondes(monde, reglages.legumes.lumirave.pousse + 1);
    expect(C.recolterParcelle(monde, 0)).toBeNull();
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
    C.planter(monde, 1, "pique-chou");
    secondes(monde, reglages.legumes["pique-chou"].pousse + 1);
    expect(C.recolterParcelle(monde, 1)).toMatch(/robot/);
  });

  it("la givrotte ne pousse que la nuit", () => {
    const monde = creerMonde(reglages);
    monde.ressources.bois = 20;
    C.construire(monde, "potager");
    secondes(monde, reglages.batiments.potager.travail + 8);
    C.planter(monde, 2, "givrotte");
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

describe("robots", () => {
  it("on ne dépasse pas 5 robots, aux noms choisis par Eliot", () => {
    const monde = creerMonde(reglages);
    for (let i = 0; i < 7; i += 1) C.creerRobot(monde, 50, 40);
    expect(monde.robots.map((r) => r.nom)).toEqual(["KX-7", "Kobalt-5", "Ion-9", "Vexo-12", "Sigma-4"]);
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

  it("Lumo parle dès le début", () => {
    const monde = creerMonde(reglages);
    avancer(monde);
    avancer(monde);
    expect(evenementsLumo(monde).length).toBeGreaterThan(0);
  });
});
