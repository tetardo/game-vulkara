// Petit serveur local de Vulkara, sans dépendance.
// - sert le jeu construit (dossier dist/)
// - enregistre les parties dans sauvegardes/
// - enregistre les signalements de problème dans signalements/
// Il n'écoute que sur 127.0.0.1 : rien n'est accessible depuis le réseau.

import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile, copyFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const RACINE = resolve(process.env.VULKARA_RACINE ?? process.cwd());
const JEU = resolve(process.env.VULKARA_JEU ?? join(RACINE, "dist"));
const SAUVEGARDES = join(RACINE, "sauvegardes");
const SIGNALEMENTS = join(RACINE, "signalements");
const PORT = Number(process.env.PORT ?? 4173);
const HOTE = "127.0.0.1";

const MAX_SAUVEGARDE = 5 * 1024 * 1024;
const MAX_SIGNALEMENT = 20 * 1024 * 1024;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

function lireCorps(req, max) {
  return new Promise((ok, ko) => {
    const morceaux = [];
    let taille = 0;
    req.on("data", (m) => {
      taille += m.length;
      if (taille > max) {
        ko(new Error("trop gros"));
        req.destroy();
        return;
      }
      morceaux.push(m);
    });
    req.on("end", () => ok(Buffer.concat(morceaux)));
    req.on("error", ko);
  });
}

/** Écriture sûre : fichier temporaire puis renommage, et copie de la version précédente. */
async function ecrireSauvegarde(contenu) {
  JSON.parse(contenu.toString("utf8")); // refuse un contenu qui n'est pas du JSON
  await mkdir(SAUVEGARDES, { recursive: true });
  const fichier = join(SAUVEGARDES, "partie.json");
  try {
    await copyFile(fichier, join(SAUVEGARDES, "partie.precedente.json"));
  } catch {
    // première sauvegarde
  }
  const temporaire = `${fichier}.tmp`;
  await writeFile(temporaire, contenu);
  await rename(temporaire, fichier);
}

async function ecrireSignalement(contenu) {
  const rapport = JSON.parse(contenu.toString("utf8"));
  const nom = new Date().toISOString().replace(/[:.]/g, "-");
  const dossier = join(SIGNALEMENTS, nom);
  await mkdir(dossier, { recursive: true });
  if (typeof rapport.capture === "string" && rapport.capture.startsWith("data:image/png;base64,")) {
    const png = Buffer.from(rapport.capture.slice("data:image/png;base64,".length), "base64");
    await writeFile(join(dossier, "capture.png"), png);
    delete rapport.capture;
  }
  await writeFile(join(dossier, "rapport.json"), JSON.stringify(rapport, null, 2));
}

async function servirFichier(chemin, res) {
  const demande = decodeURIComponent(chemin.split("?")[0] ?? "/");
  let fichier = normalize(join(JEU, demande));
  if (fichier !== JEU && !fichier.startsWith(JEU + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(fichier)).isDirectory()) fichier = join(fichier, "index.html");
    const contenu = await readFile(fichier);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(fichier).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(contenu);
  } catch {
    res.writeHead(404).end("Introuvable");
  }
}

const serveur = createServer(async (req, res) => {
  const url = req.url ?? "/";
  try {
    if (url === "/api/sauvegarde" && req.method === "GET") {
      try {
        const contenu = await readFile(join(SAUVEGARDES, "partie.json"));
        res.writeHead(200, { "Content-Type": "application/json" }).end(contenu);
      } catch {
        res.writeHead(204).end(); // pas encore de partie enregistrée
      }
      return;
    }
    if (url === "/api/sauvegarde" && req.method === "POST") {
      await ecrireSauvegarde(await lireCorps(req, MAX_SAUVEGARDE));
      res.writeHead(204).end();
      return;
    }
    if (url === "/api/signalement" && req.method === "POST") {
      await ecrireSignalement(await lireCorps(req, MAX_SIGNALEMENT));
      res.writeHead(204).end();
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      await servirFichier(url, res);
      return;
    }
    res.writeHead(405).end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(400).end(String(e?.message ?? e));
  }
});

serveur.listen(PORT, HOTE, () => {
  console.log(`Vulkara est prêt sur http://${HOTE}:${PORT}`);
});
