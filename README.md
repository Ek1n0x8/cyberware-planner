# Planner de cyberware — Cyberpunk 2077

Création de fan non officielle, non approuvée ni soutenue par CD PROJEKT RED.
Cyberpunk 2077 et ses contenus (textes, icônes, sons) © CD PROJEKT RED.

## Prérequis

- Cyberpunk 2077 installé avec **REDmod** (DLC gratuit).
- **Node.js** (LTS).
- **WolvenKit CLI** : `dotnet tool install -g WolvenKit.CLI` (demande le SDK .NET 10).
- Recommandé : activer les chemins longs de Windows (voir la FAQ de WolvenKit).

## Relancer l'extraction des données

```bash
node extract/extract-all.mjs
```

Après une mise à jour du jeu, forcer la ré-extraction des fichiers lus par WolvenKit :

```bash
node extract/extract-all.mjs --force
```

Si le jeu n'est pas dans le dossier Steam par défaut, définir `CP2077_DIR` avant de lancer la commande.
Les fichiers bruts de WolvenKit vont dans un dossier temporaire court (`%TEMP%\cwraw`, modifiable avec `CW_RAW_DIR`).
Les fichiers du jeu ne sont jamais modifiés.

Résultat dans `data/` : `cyberware.json`, `slots.json`, `perks.json`, `loc_fr.json`, `loc_en.json`, `extract-report.json`.
Contrôles rapides : `node extract/check.mjs` et `node extract/spot.mjs <nom>`.

Schéma des données : [docs/SCHEMA.md](docs/SCHEMA.md).
Règles du charcudoc (avec leurs sources dans les fichiers du jeu) : [RULES.md](RULES.md).
Vérification de quelques règles sur les données : `node extract/verify-rules.mjs`.

## Extraire les icônes et les sons

D'abord `npm install` (une fois), puis, après l'extraction des données :

```bash
node extract/extract-assets.mjs
```

Résultat :

- `assets/icons/*.png` : icônes des implants, des effets et des perks, découpées dans les planches du jeu.
  Correspondance nom → fichier : `data/icons.json` (avec la liste de ce qui manque).
- `assets/ui/*.png` : interface du charcudoc tirée du jeu — silhouettes de V homme et femme (corps entier par système :
  squelette, sanguin, tégumentaire, nerveux, immunitaire ; et parties : bras, mains, jambes, colonne, cerveau, yeux),
  fond de la salle, fonds des jauges verticales. Liste et provenance : `data/ui.json`.
- `assets/sounds/*.ogg` + `*.mp3` : sons de l'interface du charcudoc. `data/sounds.json` indique pour chaque
  événement les fichiers, s'ils se jouent ensemble (`mode: "layers"`) et le script du jeu qui les utilise.

Contrôle : `node extract/check-icons.mjs`.

### Écran du charcudoc et vidéos du corps

- `node extract/build-ripperdoc.mjs` : lit la mise en page (`ripperdoc.inkwidget`, référence 3840×2160) et les animations
  (`ripperdoc_animations.inkanim`) de l'écran du charcudoc → `site/data/ripperdoc.json`.
- `node extract/convert-videos.mjs` : convertit les 27 vidéos du corps (format Bink 2 du jeu) en WebM VP9 avec transparence
  (`assets/video/`). Nécessite :
  - **ffmpeg** (`winget install Gyan.FFmpeg`) ;
  - **RAD Video Tools**, l'outil officiel et gratuit du format Bink : https://www.radgametools.com/bnkdown.htm
    (archive `RADTools.7z`, mot de passe « RAD »). Il suffit d'en extraire `radvideo64.exe` (avec 7-Zip) dans
    `%LOCALAPPDATA%\RADVideoTools\`, ou d'indiquer son chemin dans la variable `RADVIDEO`.
- Safari ne lit pas le WebM transparent : il affiche les images fixes à la place.

## Le site

Le site est dans `site/` : HTML, CSS et JavaScript simples, **sans étape de compilation**. Le dossier `site/`
se suffit à lui-même (données et assets compris) : c'est lui qu'on met en ligne.

Pourquoi pas de framework (React, Svelte…) ni d'outil comme Vite : le site a une seule page et peu d'éléments
interactifs ; sans compilation, il n'y a rien à installer pour le modifier ou le publier, et le dossier `site/`
fonctionne tel quel sur n'importe quel hébergeur statique.

### Mettre à jour les données du site

Après une extraction (données, icônes, sons) :

```bash
node extract/build-site-data.mjs
```

Ce script produit `site/data/game.json` (version allégée, environ 900 Ko, ~100 Ko une fois compressé par l'hébergeur)
et `site/data/sounds.json`, puis copie `assets/` dans `site/assets/`.

### Lancer en local

```bash
node extract/serve.mjs
```

Puis ouvrir http://localhost:5173 (un serveur est nécessaire : un double-clic sur `index.html` ne suffit pas).

Tests du moteur de calcul :

```bash
node extract/test-engine.mjs
```

### Mettre en ligne gratuitement

- **Netlify** (le plus simple) : se connecter sur app.netlify.com → « Add new site » → « Deploy manually »,
  puis glisser-déposer le dossier `site/`. Une adresse en `.netlify.app` est donnée tout de suite.
- **GitHub Pages** : créer un dépôt, y envoyer le projet, puis dans Settings → Pages choisir « GitHub Actions »
  ou publier le contenu de `site/` sur une branche `gh-pages`.
- **Vercel** : importer le dépôt et indiquer `site` comme dossier racine, sans commande de build.

Le site doit rester **gratuit** et garder la mention « création de fan non officielle » du pied de page
(conditions des Fan Content Guidelines de CD PROJEKT RED).

### Comment le site est organisé

- `site/js/engine.js` : le calcul du build (capacité, coût, armure, stats secondaires, Edgerunner…), chaque règle
  renvoie à `RULES.md`.
- `site/js/main.js` : l'interface (corps, slots, choix d'implant, récapitulatif, catalogue, fiches).
- `site/js/share.js` : le build encodé dans l'adresse (`#b=…`) pour le partage par lien.
- `site/js/i18n.js` : les textes de l'interface en français et en anglais (les textes du jeu viennent des données).
- `site/js/audio.js` : les sons du charcudoc et le bouton pour couper le son.
