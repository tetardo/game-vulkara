#!/bin/bash
# Lance Vulkara sur le Mac : mise à jour, petit serveur local, puis Chrome sans barre ni onglets.
# Tout reste dans le dossier du jeu (Node portable dans runtime/, parties dans sauvegardes/).
set -uo pipefail

DOSSIER="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DOSSIER"

NODE_VERSION="v22.23.4"
PORT=4173
ADRESSE="http://127.0.0.1:${PORT}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
JOURNAL="$DOSSIER/runtime/lancement.log"

mkdir -p runtime
exec >>"$JOURNAL" 2>&1
echo "=== $(date) ==="

alerte() {
  /usr/bin/osascript -e "display alert \"Vulkara\" message \"$1\"" >/dev/null 2>&1 || true
}

# 1. Récupérer la dernière version (sans bloquer si internet est coupé).
git pull --ff-only --quiet || echo "Mise à jour impossible, on joue avec la version actuelle."

# 2. Node portable, téléchargé une seule fois dans le dossier du jeu.
NODE="$DOSSIER/runtime/node/bin/node"
if [ ! -x "$NODE" ]; then
  echo "Téléchargement de Node ${NODE_VERSION}..."
  ARCHIVE="node-${NODE_VERSION}-darwin-arm64"
  if ! curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${ARCHIVE}.tar.gz" -o runtime/node.tar.gz; then
    alerte "Impossible de télécharger Node. Vérifie la connexion internet, puis relance."
    exit 1
  fi
  rm -rf runtime/node && mkdir -p runtime/node
  tar -xzf runtime/node.tar.gz -C runtime/node --strip-components=1 && rm -f runtime/node.tar.gz
fi

if [ ! -x "$CHROME" ]; then
  alerte "Google Chrome est introuvable dans Applications. Installe-le, puis relance."
  exit 1
fi

# 3. Démarrer le serveur local, sauf s'il tourne déjà (double-clic répété).
SERVEUR_PID=""
if ! curl -fs "$ADRESSE" >/dev/null 2>&1; then
  VULKARA_RACINE="$DOSSIER" VULKARA_JEU="$DOSSIER/dist" PORT=$PORT "$NODE" server/serve.mjs &
  SERVEUR_PID=$!
  for _ in $(seq 1 50); do
    curl -fs "$ADRESSE" >/dev/null 2>&1 && break
    sleep 0.1
  done
fi

# 4. Ouvrir le jeu dans sa propre fenêtre (profil Chrome dédié, rangé dans le dossier du jeu).
"$CHROME" \
  --app="$ADRESSE" \
  --user-data-dir="$DOSSIER/.chrome-profile" \
  --window-size=1440,900 \
  --start-maximized \
  --no-first-run \
  --no-default-browser-check \
  --disable-features=Translate

# 5. Fenêtre fermée : on arrête le serveur.
[ -n "$SERVEUR_PID" ] && kill "$SERVEUR_PID" 2>/dev/null
exit 0
