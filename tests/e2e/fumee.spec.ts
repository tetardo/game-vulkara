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
    { timeout: 20_000 },
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

  // Construire : sous-menu par catégorie, bulle d'information au survol.
  await page.keyboard.press("Escape");
  await page.locator('[data-a="construire"]').click();
  await expect(page.locator(".sous-menu-construire")).toBeVisible();
  await page.locator(".sous-menu-construire [data-categorie='2']").click();
  await expect(page.locator(".vignette")).toHaveCount(5);
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

  expect(erreurs).toEqual([]);
});
