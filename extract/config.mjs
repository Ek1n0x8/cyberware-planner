// Emplacements du jeu et des dossiers de travail.
// Le dossier du jeu peut être changé avec la variable d'environnement CP2077_DIR.

import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function gamePaths() {
  const game = process.env.CP2077_DIR ||
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Cyberpunk 2077';
  return {
    game,
    tweaks: join(game, 'tools', 'redmod', 'tweaks'),
    scripts: join(game, 'tools', 'redmod', 'scripts'),
    archives: join(game, 'archive', 'pc'),
  };
}

// Dossier court pour les fichiers bruts extraits par WolvenKit
// (Windows limite les chemins à 260 caractères tant que les chemins longs ne sont pas activés).
export const RAW_DIR = process.env.CW_RAW_DIR || join(tmpdir(), 'cwraw');
