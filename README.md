# Vulkara : le secret de Malkor

Jeu d'aventure, de survie et de construction en 3D simple, vue de biais façon Age of Empires II, style inspiré de Northgard.
Créé par Eliot (10 ans), code écrit par Claude.

- Cahier des charges et specs techniques : dans le projet Claude « Eliot ».
- Pour jouer sur le Mac : voir [JOUER.md](JOUER.md) (branche `jouable`).

## Développement

```
npm install
npm run dev        # jeu en développement (http://localhost:5173)
npm run serve      # serveur local (sauvegardes, signalements) sur le port 4173
npm run typecheck
npm test           # tests de la logique (Vitest)
npm run build
npm run test:e2e   # test de fumée Playwright sur le jeu construit
```

## Organisation

| Dossier | Rôle |
| --- | --- |
| `src/sim/` | logique du jeu en TypeScript pur, sans Babylon.js, à pas de temps fixe |
| `src/render/` | affichage 3D Babylon.js : montre l'état de la simulation, ne décide rien |
| `src/ui/` | interface HTML/CSS par-dessus la 3D |
| `config/` | réglages du jeu (coûts, vitesses…), base du futur mode créateur |
| `server/` | serveur local sans dépendance : fichiers du jeu, sauvegardes, signalements |
| `mac/` | lancement sur le Mac : Node portable + Chrome en mode application |
| `tests/` | tests Vitest (logique) et Playwright (`tests/e2e`) |

À chaque push sur `main`, GitHub Actions vérifie, teste, construit et publie la version jouable sur la branche `jouable`.
