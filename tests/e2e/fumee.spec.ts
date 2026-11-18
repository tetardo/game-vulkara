import { expect, test } from "@playwright/test";

type Vulkara = {
  etat: () => string;
  monde: () => { tick: number; morris: { x: number; z: number; chemin: unknown[] } };
};

type VulkaraTest = {
  monde: () => { robots: { x: number; z: number }[] };
  commandes: { ouvrirCaisse(m: unknown): void; creerRobot(m: unknown, x: number, z: number): unknown };
  scene: { activeCamera: { target: { x: number; z: number } } | null };
  aLEcran: (x: number, y: number, z: number) => { x: number; y: number };
};

test("le jeu se lance, passe l'écran titre et le crash, tourne et sauvegarde sans erreur", async ({ page }) => {
  const erreurs: string[] = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") erreurs.push(m.text());
  });
  // Chaque morceau et chaque bruit demandé doit exister.
  page.on("response", (r) => {
    if (/\/(sons|musique)\//.test(r.url()) && r.status() >= 400) erreurs.push(`${r.status()} ${r.url()}`);
  });

  await page.goto("/");
  await expect(page.locator("#scene")).toBeVisible();

  // Écran titre (couverture d'Eliot), puis nouvelle partie.
  await page.locator("button[data-choix=nouvelle]").click({ timeout: 45_000 });

  // La scène du crash se passe toujours.
  await page.locator("button.passer").click();
  await page.waitForFunction(() => (window as unknown as { __vulkara: Vulkara }).__vulkara.etat() === "jeu");
  await expect(page.locator(".barre")).toBeVisible();

  // La simulation avance.
  await page.waitForFunction(() => (window as unknown as { __vulkara: Vulkara }).__vulkara.monde().tick > 40);

  // Un clic sur le sol fait marcher Morris.
  const avant = await page.evaluate(() => {
    const m = (window as unknown as { __vulkara: Vulkara }).__vulkara.monde().morris;
    return { x: m.x, z: m.z };
  });
  await page.mouse.click(720, 560);
  await page.waitForFunction(
    (a) => {
      const m = (window as unknown as { __vulkara: Vulkara }).__vulkara.monde().morris;
      return Math.hypot(m.x - a.x, m.z - a.z) > 0.5;
    },
    avant,
    // Il faut quelques secondes de calme ; la machine de test est lente (peu d'images par seconde).
    { timeout: 60_000 },
  );

  // Liste des robots sous l'objectif : un clic choisit le robot et la caméra va sur lui.
  await expect(page.locator(".liste-robots")).toBeHidden();
  await page.evaluate(() => {
    const v = (window as unknown as { __vulkara: VulkaraTest }).__vulkara;
    v.commandes.ouvrirCaisse(v.monde());
    const premier = v.monde().robots[0]!;
    v.commandes.creerRobot(v.monde(), premier.x + 6, premier.z + 6);
  });
  await expect(page.locator(".ligne-robot")).toHaveCount(2);
  await page.locator(".ligne-robot").nth(1).click();
  await expect(page.locator("aside.cote h3")).toContainText("Kobalt-5");
  await expect(page.locator(".ligne-robot").nth(1)).toHaveClass(/actif/);
  const ecart = await page.evaluate(() => {
    const v = (window as unknown as { __vulkara: VulkaraTest }).__vulkara;
    const r = v.monde().robots[1]!;
    const t = v.scene.activeCamera!.target;
    return Math.hypot(t.x - r.x, t.z - r.z);
  });
  expect(ecart).toBeLessThan(1);

  // Robot choisi + clic sur le sol : le robot y va, Morris (pas choisi) ne bouge pas.
  const morrisAvantClic = await page.evaluate(() => {
    const m = (window as unknown as { __vulkara: Vulkara }).__vulkara.monde().morris;
    m.chemin.length = 0; // il a peut-être encore des pas à faire depuis le premier clic
    return { x: m.x, z: m.z };
  });
  await page.mouse.click(620, 420);
  await page.waitForFunction(() => {
    const r = (window as unknown as { __vulkara: { monde: () => { robots: { etat: string; travail: string }[] } } }).__vulkara.monde().robots[1]!;
    return r.travail === "aucun" && (r.etat === "va" || r.etat === "attend");
  });
  const morrisApresClic = await page.evaluate(() => {
    const m = (window as unknown as { __vulkara: Vulkara }).__vulkara.monde().morris;
    return { x: m.x, z: m.z, n: m.chemin.length };
  });
  expect(morrisApresClic.n).toBe(0);
  expect(Math.hypot(morrisApresClic.x - morrisAvantClic.x, morrisApresClic.z - morrisAvantClic.z)).toBeLessThan(0.3);

  // Bouton « Tous » : les deux robots sont choisis, avec une fiche commune.
  await page.locator(".liste-robots .tous").click();
  await expect(page.locator("aside.cote h3")).toHaveText("2 robots choisis");
  await expect(page.locator(".ligne-robot.actif")).toHaveCount(2);


  // Rectangle tracé en glissant sur le sol : seuls les robots dedans sont choisis.
  const glisser = async (indices: number[]) => {
    const pts = await page.evaluate((ix) => {
      const v = (window as unknown as { __vulkara: VulkaraTest }).__vulkara;
      const canvas = document.querySelector("#scene")!.getBoundingClientRect();
      return ix.map((i) => {
        const r = v.monde().robots[i]!;
        const p = v.aLEcran(r.x, 0.4, r.z);
        return { x: p.x + canvas.left, y: p.y + canvas.top };
      });
    }, indices);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    await page.mouse.move(Math.min(...xs) - 30, Math.min(...ys) - 30);
    await page.mouse.down();
    await page.mouse.move(Math.max(...xs) + 30, Math.max(...ys) + 30, { steps: 6 });
    await page.mouse.up();
  };
  await page.keyboard.press("Escape");
  await glisser([0]);
  await expect(page.locator("aside.cote h3")).toContainText("KX-7");
  await glisser([0, 1]);
  await expect(page.locator("aside.cote h3")).toHaveText("2 robots choisis");
  await page.screenshot({ path: "test-results/capture-selection.png" });

  // Clic intelligent : survol d'un arbre → bulle « Couper », clic → les deux robots coupent CET arbre.
  const arbre: { id: number } = await page.evaluate(() => {
    type MondeArbres = { sources: { id: number; type: string; x: number; z: number; reste: number }[]; brouillard: Uint8Array; carte: { largeur: number } };
    const v = (window as unknown as { __vulkara: VulkaraTest }).__vulkara;
    const m = v.monde() as unknown as MondeArbres;
    const t = v.scene.activeCamera!.target;
    const arbres = m.sources.filter((s) => s.type === "arbre" && s.reste > 0);
    arbres.sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z));
    const s = arbres[0]!;
    // On découvre l'arbre et on le regarde (au centre de l'écran, sans rien devant).
    for (let dz = -2; dz <= 2; dz += 1) for (let dx = -2; dx <= 2; dx += 1) m.brouillard[Math.floor(s.z + dz) * m.carte.largeur + Math.floor(s.x + dx)] = 1;
    (m as unknown as { versionBrouillard: number }).versionBrouillard += 1;
    (t as unknown as { set(x: number, y: number, z: number): void }).set(s.x, 0, s.z);
    return { id: s.id };
  });
  // On vise l'arbre à l'écran ; on recommence si la caméra a bougé entre-temps (machine lente).
  let ax = 0;
  let ay = 0;
  await expect(async () => {
    const p = await page.evaluate((id) => {
      const v = (window as unknown as { __vulkara: VulkaraTest }).__vulkara;
      const s = (v.monde() as unknown as { sources: { id: number; x: number; z: number }[] }).sources.find((x) => x.id === id)!;
      const canvas = document.querySelector("#scene")!.getBoundingClientRect();
      const q = v.aLEcran(s.x, 1.5, s.z);
      return { x: canvas.left + q.x, y: canvas.top + q.y };
    }, arbre.id);
    ax = p.x;
    ay = p.y;
    await page.mouse.move(ax - 6, ay - 6);
    await page.mouse.move(ax, ay, { steps: 2 });
    await expect(page.locator(".bulle-ordre")).toBeVisible({ timeout: 1500 });
    await expect(page.locator(".bulle-ordre")).toContainText("Couper", { timeout: 500 });
  }).toPass({ timeout: 30_000 });
  await page.mouse.click(ax, ay);
  await page.waitForFunction((id) => {
    const robots = (window as unknown as { __vulkara: { monde: () => { robots: { travail: string; cibleId: number | null }[] } } }).__vulkara.monde().robots;
    return robots.every((r) => r.travail === "bois" && r.cibleId === id);
  }, arbre.id);
  await page.screenshot({ path: "test-results/capture-clic-intelligent.png" });

  // Construire : sous-menu par catégorie, bulle d'information au survol.
  await page.keyboard.press("Escape");
  await page.locator('[data-a="construire"]').click();
  await expect(page.locator(".sous-menu-construire")).toBeVisible();
  await page.locator(".sous-menu-construire [data-categorie='2']").click();
  await expect(page.locator(".vignette")).toHaveCount(6);
  await page.locator(".vignette[data-construire=lanterne]").hover();
  await expect(page.locator(".bulle-info")).toContainText("grignotins");
  await page.screenshot({ path: "test-results/capture-construire.png" });
  await page.locator('[data-a="construire"]').click();
  await expect(page.locator(".sous-menu-construire")).toBeHidden();

  // Raccourcis clavier et mini-carte.
  await page.locator("#scene").click({ position: { x: 5, y: 450 }, button: "right" });
  await page.keyboard.press("b");
  await expect(page.locator(".sous-menu-construire")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sous-menu-construire")).toBeHidden();
  // Un clic en dehors ferme le sous-menu, sans faire marcher Morris.
  await page.keyboard.press("b");
  const morrisAvant = await page.evaluate(() => {
    const m = (window as unknown as { __vulkara: Vulkara }).__vulkara.monde().morris;
    return m.chemin.length;
  });
  await page.mouse.click(720, 300);
  await expect(page.locator(".sous-menu-construire")).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __vulkara: Vulkara }).__vulkara.monde().morris.chemin.length)).toBe(morrisAvant);
  await page.keyboard.press("m");
  await expect(page.locator(".modale h2")).toHaveText("Menu");
  await page.keyboard.press("Escape");
  await expect(page.locator(".mini-carte canvas")).toBeVisible();
  await page.locator(".mini-carte .agrandir").click();
  await expect(page.locator(".modale h2")).toHaveText("La carte");
  await page.keyboard.press("Escape");

  // Le bouton « Signaler un problème » enregistre bien un rapport.
  await page.getByRole("button", { name: "Signaler un problème" }).click();
  await expect(page.locator(".message")).toContainText("Merci");

  await page.screenshot({ path: "test-results/capture-fumee.png" });

  // Bouton Menu : aide, sauvegarder, retour à l'écran titre (puis on reprend la partie).
  await page.locator('[data-a="menu"]').click();
  await page.locator("button[data-menu=aide]").click();
  await expect(page.locator(".modale h2")).toHaveText("Les commandes");
  await page.locator(".modale [data-fermer]").first().click();
  await page.locator('[data-a="menu"]').click();
  await page.locator("button[data-menu=audio]").click();
  await expect(page.locator("input[data-volume=musique]")).toBeVisible();
  await page.locator("input[data-volume=bruits]").fill("40");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("vulkara-volumes") ?? "{}").bruits)).toBe(0.4);
  await page.screenshot({ path: "test-results/capture-audio.png" });
  await page.locator("button[data-menu=retour]").click();
  await page.locator("button[data-menu=sauver]").click();
  await expect(page.locator(".message")).toContainText("Partie sauvegardée");
  await page.locator('[data-a="menu"]').click();
  await page.locator("button[data-menu=principal]").click();
  await page.locator("button[data-choix=continuer]").click({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __vulkara: Vulkara }).__vulkara.etat() === "jeu");

  // Sauvegarde : le serveur accepte et renvoie la partie.
  const r = await page.request.post("/api/sauvegarde", { data: '{"version":2,"monde":{"tick":3}}' });
  expect(r.status()).toBe(204);
  const relue = await page.request.get("/api/sauvegarde");
  expect(await relue.json()).toMatchObject({ monde: { tick: 3 } });

  // Bouton « Ramasser » : il apparaît quand un éclat brille près de Morris, et Morris va le prendre.
  await expect(page.locator('[data-a="ramasser"]')).toBeHidden();
  await page.evaluate(() => {
    const v = (window as unknown as { __vulkara: { monde: () => { morris: { x: number; z: number }; objets: unknown[]; prochainId: number; brouillard: Uint8Array; carte: { largeur: number } } } }).__vulkara;
    const m = v.monde();
    const o = { id: m.prochainId++, type: "eclat", x: Math.floor(m.morris.x) + 3.5, z: Math.floor(m.morris.z) + 0.5 };
    m.brouillard[Math.floor(o.z) * m.carte.largeur + Math.floor(o.x)] = 1;
    m.objets.push(o);
  });
  await page.locator('[data-a="ramasser"]').click();
  // Machine de test lente : on laisse à Morris le temps de marcher.
  await expect(page.locator('[data-a="ramasser"]')).toBeHidden({ timeout: 30_000 });

  // Musique : le jour d'abord ; un monstre près de Morris lance la musique de combat ; puis la nuit.
  type VulkaraSon = {
    musique: () => string | null;
    monde: () => {
      morris: { x: number; z: number };
      monstres: { x: number; z: number; type: string }[];
      brouillard: Uint8Array;
      carte: { largeur: number };
      temps: { seconde: number };
    };
  };
  await page.waitForFunction(() => (window as unknown as { __vulkara: VulkaraSon }).__vulkara.musique()?.startsWith("jour:"));
  await page.evaluate(() => {
    const m = (window as unknown as { __vulkara: VulkaraSon }).__vulkara.monde();
    const mo = m.monstres[0]!;
    mo.x = m.morris.x + 4;
    mo.z = m.morris.z;
    m.brouillard[Math.floor(mo.z) * m.carte.largeur + Math.floor(mo.x)] = 1;
  });
  await page.waitForFunction(() => (window as unknown as { __vulkara: VulkaraSon }).__vulkara.musique()?.startsWith("combat:"));
  await page.evaluate(() => {
    const m = (window as unknown as { __vulkara: VulkaraSon }).__vulkara.monde();
    m.monstres.length = 0;
    m.temps.seconde = 250; // dureeJour = 240 : c'est la nuit
  });
  // Les monstres de la nuit arrivent tout de suite : on les retire pour entendre la musique de nuit.
  await page.waitForFunction(
    () => {
      const v = (window as unknown as { __vulkara: VulkaraSon }).__vulkara;
      v.monde().monstres.length = 0;
      return v.musique()?.startsWith("nuit:");
    },
    undefined,
    // Il faut quelques secondes de calme ; la machine de test est lente (peu d'images par seconde).
    { timeout: 60_000 },
  );

  expect(erreurs).toEqual([]);
});
