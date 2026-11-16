#!/bin/bash
# À lancer une seule fois (double-clic) : crée l'icône « Vulkara » sur le bureau.
set -euo pipefail
DOSSIER="$(cd "$(dirname "$0")/.." && pwd)"
chmod +x "$DOSSIER/mac/lancer.sh"
APP="$HOME/Desktop/Vulkara.app"
rm -rf "$APP"
/usr/bin/osacompile -o "$APP" -e "do shell script quoted form of \"$DOSSIER/mac/lancer.sh\" & \" > /dev/null 2>&1 &\""
echo "Icône créée sur le bureau : Vulkara. Tu peux fermer cette fenêtre."
