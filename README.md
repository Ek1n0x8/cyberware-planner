# Cyberware Planner — Cyberpunk 2077

A free, browser-based cyberware planner that recreates the Cyberpunk 2077 ripperdoc screen.
Plan your build, compare tiers and upgrade options, and share it with a single link.

**Live site:** https://ek1n0x8.github.io/cyberware-planner/

> This is an unofficial fan work and is not approved or endorsed by CD PROJEKT RED.
> Cyberpunk 2077 and its content (texts, icons, sounds, videos) © CD PROJEKT RED.

## Features

- Faithful recreation of the in-game ripperdoc screen (layout, animations, sounds).
- All 122 obtainable cyberware items, every tier, cost, price and stat.
- Cyber-capacity, armor, Edgerunner overload and build cost, computed with the game's own rules.
- Upgrade options with Chipware Connoisseur, including random stat ranges.
- Catalog with search, filters and sorting.
- 12 languages; cyberware names and descriptions come straight from the game's localization files.
- Builds are stored in the URL: bookmark or share the link to save a build.

## Data accuracy

Every value is extracted from the installed game files (REDmod tweaks and scripts, game archives via WolvenKit).
No wiki data is used, except for how to obtain a few items that no vendor sells; those are labelled
"community info" with their source. Values that cannot be read from the files are shown as "?".

`node extract/verify-game.mjs` compares the site data against the game's compiled database
(1,101 tiers and 74,500 values, 0 differences at the time of writing).
The rules and their sources in the game files are documented in [RULES.md](RULES.md) (in French).

## Project structure

| Path | Contents |
|---|---|
| `site/` | The website: plain HTML, CSS and JavaScript, no build step. This folder is what gets deployed. |
| `extract/` | Node.js tools that read the game files and generate the site data. |
| `docs/SCHEMA.md` | Data schema. |
| `RULES.md` | Ripperdoc rules with references to the game files. |

The raw extraction output (`data/`, `assets/`) is not committed; it can be regenerated from the game.

## Running locally

```bash
node extract/serve.mjs
```

Then open http://localhost:5173 (a local server is required; opening `index.html` directly will not work).

Engine tests:

```bash
node extract/test-engine.mjs
```

## Regenerating the data

Requirements:

- Cyberpunk 2077 installed with **REDmod** (free DLC). Set `CP2077_DIR` if the game is not in the default Steam folder.
- **Node.js** (LTS), then `npm install`.
- **WolvenKit CLI**: `dotnet tool install -g WolvenKit.CLI` (requires the .NET 10 SDK).
- For the body videos: **ffmpeg** and **RAD Video Tools** (official free Bink tool).

```bash
node extract/extract-all.mjs        # game data (add --force after a game update)
node extract/extract-assets.mjs     # icons, UI images and sounds
node extract/build-ripperdoc.mjs    # ripperdoc screen layout and animations
node extract/convert-videos.mjs     # body videos (Bink 2 → WebM VP9 with alpha)
node extract/build-site-data.mjs    # site/data/*.json and site/assets/
```

The game files are never modified.

## Deployment

Every push to `main` deploys the `site/` folder to GitHub Pages through GitHub Actions
(`.github/workflows/deploy.yml`).

## License and usage

This project follows the [CD PROJEKT RED Fan Content Guidelines](https://www.cdprojektred.com/en/fan-content):
the site is and will remain free, with no paywall, and keeps the unofficial fan work notice.
