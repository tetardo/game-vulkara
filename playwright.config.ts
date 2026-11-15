import { defineConfig } from "@playwright/test";

// Test de fumée : construit le jeu, le sert avec le vrai serveur local, et joue quelques secondes.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      // PW_CHROMIUM permet d'utiliser un Chromium déjà installé (environnement de Claude).
      executablePath: process.env.PW_CHROMIUM || undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "node server/serve.mjs",
    url: "http://127.0.0.1:4174",
    env: { PORT: "4174", VULKARA_RACINE: "test-results/racine", VULKARA_JEU: "dist" },
    reuseExistingServer: false,
  },
});
