import { expect, test } from "@playwright/test";

type Vulkara = {
  etat: () => string;
  monde: () => { tick: number; morris: { x: number; z: number; chemin: unknown[] } };
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

  // Le bouton « Signaler un problème » enregistre bien un rapport.
  await page.getByRole("button", { name: "Signaler un problème" }).click();
  await expect(page.locator(".message")).toContainText("Merci");

  await page.screenshot({ path: "test-results/capture-fumee.png" });

  // Sauvegarde : le serveur accepte et renvoie la partie.
  const r = await page.request.post("/api/sauvegarde", { data: '{"version":2,"monde":{"tick":3}}' });
  expect(r.status()).toBe(204);
  const relue = await page.request.get("/api/sauvegarde");
  expect(await relue.json()).toMatchObject({ monde: { tick: 3 } });

  expect(erreurs).toEqual([]);
});
