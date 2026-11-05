// Courbes de stats (.curveset) : extraction avec WolvenKit, lecture et évaluation.
// Les modificateurs « CurveStatModifier » de la TweakDB pointent vers id = nom du fichier
// (ex. "cyberware_curves") et column = nom de la courbe.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gamePaths, RAW_DIR } from '../config.mjs';

// Jeux de courbes utiles au planner (id TweakDB = nom du fichier .curveset).
export const DEFAULT_SETS = ['cyberware_curves', 'price_curves', 'quality_curves', 'technical_ability_skill_passives',
  'player_powerLevelToDefensiveStats', 'player_armorEffectiveness', 'player_level_up_curve', 'random_distributions', 'item_meleeware_RPG_stats'];
const ARCHIVES = [['content', 'basegame_1_engine.archive'], ['content', 'basegame_4_gamedata.archive'], ['ep1', 'ep1_2_gamedata.archive']];

// Trouve le chemin interne de chaque .curveset dans les archives (liste mise en cache).
function locateSets(ids) {
  const listFile = join(RAW_DIR, 'curveset_list.json');
  let list;
  if (existsSync(listFile)) list = JSON.parse(readFileSync(listFile, 'utf8'));
  else {
    list = [];
    for (const [pack, name] of ARCHIVES) {
      const archive = join(gamePaths().archives, pack, name);
      const txt = execFileSync('cp77tools', ['archive', archive, '-l'], { encoding: 'utf8', maxBuffer: 1 << 30 });
      for (const line of txt.split(/\r?\n/)) if (line.endsWith('.curveset')) list.push({ archive, path: line.trim() });
    }
    mkdirSync(RAW_DIR, { recursive: true });
    writeFileSync(listFile, JSON.stringify(list));
  }
  const out = {};
  for (const id of ids) {
    // Les chemins des archives sont en minuscules, les id TweakDB non
    const hit = list.find((e) => basename(e.path.replace(/\\/g, '/')).toLowerCase() === `${id}.curveset`.toLowerCase());
    if (hit) out[id] = hit;
  }
  return out;
}

function findFile(dir, name) {
  if (!existsSync(dir)) return null;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) { const f = findFile(full, name); if (f) return f; }
    else if (e === name) return full;
  }
  return null;
}

export function extractCurves({ ids = DEFAULT_SETS, force = false } = {}) {
  const rawDir = join(RAW_DIR, 'curves');
  const jsonDir = join(RAW_DIR, 'curvesjson');
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(jsonDir, { recursive: true });
  const located = locateSets(ids);
  const out = {};
  for (const id of ids) {
    if (!located[id]) { console.warn(`courbe ${id} introuvable dans les archives`); continue; }
    const { archive, path } = located[id];
    const jsonName = `${basename(path.replace(/\\/g, '/'))}.json`;
    let json = findFile(jsonDir, jsonName);
    if (!json || force) {
      const re = path.replace(/\\/g, '\\\\').replace(/\./g, '\\.') + '$';
      execFileSync('cp77tools', ['extract', archive, '-o', rawDir, '-r', re], { stdio: 'ignore' });
      const raw = findFile(rawDir, basename(path));
      if (!raw) throw new Error(`${path} introuvable dans ${archive}`);
      execFileSync('cp77tools', ['convert', 's', raw, '-o', jsonDir], { stdio: 'ignore' });
      json = findFile(jsonDir, jsonName);
    }
    out[id] = { file: json, gamePath: path };
  }
  return out;
}

export class Curves {
  constructor(files) {
    this.sets = {};
    for (const [id, { file, gamePath }] of Object.entries(files)) {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const curves = {};
      for (const c of data.Data.RootChunk.curves) {
        curves[c.name.$value] = {
          interpolation: c.curve.InterpolationType,
          points: c.curve.Elements.map((e) => [e.Point, e.Value]),
        };
      }
      this.sets[id] = { gamePath, curves };
    }
  }

  get(set, column) {
    return this.sets[set] && this.sets[set].curves[column];
  }

  // Évalue une courbe en x. Linéaire entre les points, valeurs bornées aux extrémités.
  // Renvoie undefined si la courbe ou le type d'interpolation est inconnu.
  eval(set, column, x) {
    const c = this.get(set, column);
    if (!c || !c.points.length) return undefined;
    const pts = c.points;
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x0, y0] = pts[i - 1];
      if (x <= x1) {
        // Courbe en escalier : la valeur d'un point s'applique à partir de ce point
        if (c.interpolation === 'Constant') return x === x1 ? y1 : y0;
        if (c.interpolation === 'Linear') return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
        return undefined;
      }
    }
    return undefined;
  }
}

// node extract/lib/curves.mjs : affiche les courbes cyberware
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const set = process.argv[2] || 'cyberware_curves';
  const curves = new Curves(extractCurves({ ids: [set] }));
  for (const [name, c] of Object.entries(curves.sets[set].curves)) {
    console.log(name, c.interpolation, JSON.stringify(c.points));
  }
}
