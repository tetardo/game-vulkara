import { defineConfig } from "vite";

// Chemins relatifs : le jeu construit fonctionne servi depuis n'importe quel dossier.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2022",
    chunkSizeWarningLimit: 4000,
  },
  server: {
    // En développement, les appels /api (sauvegardes, signalements) partent vers le serveur local.
    proxy: { "/api": "http://127.0.0.1:4173" },
  },
});
