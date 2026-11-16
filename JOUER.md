# Vulkara : le secret de Malkor

Version jouable, construite automatiquement. Ne pas modifier les fichiers à la main.

## Installation sur le Mac (une seule fois)

1. Vérifier que **Google Chrome** est dans Applications.
2. Récupérer cette branche dans le dossier de votre choix, par exemple :
   ```
   git clone --branch jouable https://github.com/tetardo/game-vulkara.git ~/Jeux/Vulkara
   ```
   Le dépôt est privé : git demandera de se connecter à GitHub la première fois, puis s'en souviendra.
3. Dans le Finder, ouvrir le dossier `mac` et double-cliquer sur **Installer l'icône.command**
   (si macOS refuse : clic droit, puis Ouvrir).
   Une icône **Vulkara** apparaît sur le bureau.

## Jouer

Double-clic sur l'icône **Vulkara**. Au premier lancement, Node est téléchargé dans `runtime/` (environ 1 minute).
Ensuite, à chaque lancement, la dernière version est récupérée automatiquement, puis le jeu s'ouvre dans sa propre fenêtre.

## Ce qu'il y a dans le dossier

| Dossier | Contenu |
| --- | --- |
| `dist/` | le jeu |
| `server/` | le petit serveur local (n'écoute que sur ce Mac) |
| `mac/` | l'icône de lancement |
| `runtime/` | Node portable et le journal de lancement (`lancement.log`) |
| `sauvegardes/` | les parties d'Eliot (`partie.json` et la précédente) |
| `signalements/` | les problèmes signalés depuis le jeu (capture + rapport) |

En cas de souci : regarder `runtime/lancement.log`, ou utiliser le bouton « Signaler un problème » dans le jeu.
