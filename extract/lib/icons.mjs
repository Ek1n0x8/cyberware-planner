// Icônes : un nom d'icône (ex. "cw_skeleton_paineditor" ou "UIIcon.Cool") renvoie à un record
// UIIcon de la TweakDB, qui donne une planche (.inkatlas) et le nom de la zone à découper.
// On extrait les planches + leur texture (.xbm → .png) avec WolvenKit, puis on découpe chaque icône.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import pngjs from 'pngjs';
import { gamePaths, RAW_DIR } from '../config.mjs';

const { PNG } = pngjs;

// "cw_x" → "UIIcon.cw_x" ; "UIIcon.Cool" reste tel quel.
export function iconRecordId(name) {
  if (!name || typeof name !== 'string') return null;
  return name.includes('.') ? name : `UIIcon.${name}`;
}

// Résout les noms d'icônes en { atlas, part } via la TweakDB.
export function resolveIcons(db, names) {
  const resolved = new Map();
  const missing = [];
  for (const name of names) {
    const id = iconRecordId(name);
    const atlas = id && db.val(id, 'atlasResourcePath');
    const part = id && db.val(id, 'atlasPartName');
    if (atlas && part) resolved.set(name, { record: id, atlas: atlas.replace(/\//g, '\\'), part });
    else missing.push({ name, reason: id && db.get(id) ? 'record UIIcon sans planche' : 'pas de record UIIcon' });
  }
  return { resolved, missing };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Extrait les planches demandées (et leurs textures) dans RAW_DIR/atlases.
export function extractAtlases(atlasPaths, { force = false } = {}) {
  const { game, archives } = gamePaths();
  const out = join(RAW_DIR, 'atlases');
  const todo = atlasPaths.filter((a) => force || !existsSync(join(out, a)));
  if (todo.length) {
    mkdirSync(out, { recursive: true });
    // planche + textures du même nom (ex. item_icons8.xbm, item_icons8_1080p.xbm)
    const re = '(' + todo.map((a) => escapeRe(a.replace(/\.inkatlas$/, ''))).join('|') + ')(_\\w+)?\\.(inkatlas|xbm)$';
    for (const pack of ['content', 'ep1']) {
      execFileSync('cp77tools', ['uncook', join(archives, pack), '-o', out, '-gp', game, '-r', re, '--uext', 'png'],
        { stdio: 'ignore', maxBuffer: 1 << 28 });
    }
  }
  return out;
}

export function readAtlas(rawDir, atlasPath) {
  const file = join(rawDir, atlasPath);
  if (!existsSync(file)) return null;
  const jsonDir = join(RAW_DIR, 'atlasjson', dirname(atlasPath));
  const json = join(jsonDir, basename(atlasPath) + '.json');
  if (!existsSync(json)) {
    mkdirSync(jsonDir, { recursive: true });
    execFileSync('cp77tools', ['convert', 's', file, '-o', jsonDir], { stdio: 'ignore' });
  }
  const data = JSON.parse(readFileSync(json, 'utf8')).Data.RootChunk;
  // Premier slot qui a une texture = la plus haute résolution
  const slot = (data.slots.Elements || []).find((s) => s.texture && s.texture.DepotPath.$storage === 'string');
  if (!slot) return null;
  const tex = slot.texture.DepotPath.$value.replace(/\.xbm$/, '.png');
  const parts = new Map(slot.parts.map((p) => [p.partName.$value, p.clippingRectInUVCoords]));
  return { texture: join(rawDir, tex), texturePath: tex, parts };
}

// Découpe chaque icône et l'écrit en PNG. Renvoie le manifeste et la liste des échecs.
// maxSide : réduit les grandes icônes (moyenne des pixels par blocs) pour alléger le site
function shrink(img, maxSide) {
  const f = Math.ceil(Math.max(img.width, img.height) / maxSide);
  if (f <= 1) return img;
  const w = Math.floor(img.width / f), h = Math.floor(img.height / f);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const acc = [0, 0, 0, 0];
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const i = ((y * f + dy) * img.width + (x * f + dx)) * 4;
      const a = img.data[i + 3];
      acc[0] += img.data[i] * a; acc[1] += img.data[i + 1] * a; acc[2] += img.data[i + 2] * a; acc[3] += a;
    }
    const o = (y * w + x) * 4;
    out.data[o] = acc[3] ? acc[0] / acc[3] : 0; out.data[o + 1] = acc[3] ? acc[1] / acc[3] : 0;
    out.data[o + 2] = acc[3] ? acc[2] / acc[3] : 0; out.data[o + 3] = acc[3] / (f * f);
  }
  return out;
}

export function cropIcons(resolved, rawDir, outDir, { maxSide = 0 } = {}) {
  mkdirSync(outDir, { recursive: true });
  const atlases = new Map();
  const images = new Map();
  const manifest = {};
  const failed = [];
  for (const [name, { record, atlas, part }] of resolved) {
    if (!atlases.has(atlas)) atlases.set(atlas, readAtlas(rawDir, atlas));
    const a = atlases.get(atlas);
    if (!a) { failed.push({ name, reason: `planche non extraite : ${atlas}` }); continue; }
    const uv = a.parts.get(part);
    if (!uv) { failed.push({ name, reason: `zone « ${part} » absente de ${atlas}` }); continue; }
    if (!existsSync(a.texture)) { failed.push({ name, reason: `texture absente : ${a.texturePath}` }); continue; }
    if (!images.has(a.texture)) images.set(a.texture, PNG.sync.read(readFileSync(a.texture)));
    const img = images.get(a.texture);
    const x0 = Math.round(uv.Left * img.width), x1 = Math.round(uv.Right * img.width);
    const y0 = Math.round(uv.Top * img.height), y1 = Math.round(uv.Bottom * img.height);
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) { failed.push({ name, reason: 'zone vide' }); continue; }
    let crop = new PNG({ width: w, height: h });
    PNG.bitblt(img, crop, x0, y0, w, h, 0, 0);
    if (maxSide) crop = shrink(crop, maxSide);
    const file = `${name.replace(/^UIIcon\./, 'ui_').replace(/[^\w.-]/g, '_')}.png`;
    writeFileSync(join(outDir, file), PNG.sync.write(crop, { colorType: 6, deflateLevel: 9 }));
    manifest[name] = { file: `icons/${file}`, width: crop.width, height: crop.height, record, atlas: atlas.replace(/\\/g, '/'), part };
  }
  return { manifest, failed };
}

export function dirSize(dir) {
  let n = 0, size = 0;
  if (!existsSync(dir)) return { n, size };
  for (const e of readdirSync(dir)) { const s = statSync(join(dir, e)); if (s.isFile()) { n++; size += s.size; } }
  return { n, size };
}
