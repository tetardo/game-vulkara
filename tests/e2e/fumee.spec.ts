import { expect, test } from "@playwright/test";

test("le jeu se lance, tourne et sauvegarde sans erreur", async ({ page }) => {
  const erreurs: string[] = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") erreurs.push(m.text());
  });

  await page.goto("/");
  await expect(page.locator("#scene")).toBeVisible();
  await expect(page.locator(".barre")).toContainText("Bois");

  // La simulation avance.
  await page.waitForFunction(() => {
    const v = (window as unknown as { __vulkara?: { monde: () => { tick: number } } }).__vulkara;
    return (v?.monde().tick ?? 0) > 40;
  });

  // Le bouton « Signaler un problème » enregistre bien un rapport.
  await page.getByRole("button", { name: "Signaler un problème" }).click();
  await expect(page.locator(".message")).toContainText("Merci");

  await page.screenshot({ path: "test-results/capture-fumee.png" });

  // Sauvegarde : le serveur accepte et renvoie la partie.
  const r = await page.request.post("/api/sauvegarde", { data: '{"version":1,"monde":{"tick":3}}' });
  expect(r.status()).toBe(204);
  const relue = await page.request.get("/api/sauvegarde");
  expect(await relue.json()).toMatchObject({ monde: { tick: 3 } });

  expect(erreurs).toEqual([]);
});
