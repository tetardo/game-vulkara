# Vulkara — consignes pour Claude

- Jeu d'Eliot (10 ans) ; Greg (son père, ingénieur) tranche le technique. Textes du jeu et commentaires en français.
- Specs techniques décidées : Babylon.js + TypeScript strict, Vite, Vitest, Playwright ; 3D low-poly, caméra fixe de biais ; tout à la souris ; packs 3D gratuits CC0 (KayKit, Quaternius, Kenney) ; combats sans sang ; 0 € ; solo.
- Architecture : toute règle du jeu vit dans `src/sim/` (TS pur, pas d'import Babylon). `src/render/` affiche l'état sans rien décider. Interface en HTML/CSS (`src/ui/`).
- Chiffres de jeu dans `config/`, jamais en dur dans le code.
- Sauvegarde : tout changement du format de `Monde` augmente `VERSION_SAUVEGARDE` et ajoute une migration dans `src/sim/sauvegarde.ts`, avec un test.
- Imports Babylon ciblés (`@babylonjs/core/...`), pas l'index global (taille du jeu).
- Avant de proposer un changement : `npm run typecheck && npm test && npm run build && npm run test:e2e`.
  Dans l'environnement cloud de Claude : `PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e`, puis regarder `test-results/capture-fumee.png`.
- Fusion : automatique si les tests passent ; les gros changements (nouveau système, sauvegarde, architecture) attendent la relecture de Greg.
- Interface : derrière tout texte, une couleur unie opaque (jamais de texture ni de transparence) ; taille de texte normale par défaut.
