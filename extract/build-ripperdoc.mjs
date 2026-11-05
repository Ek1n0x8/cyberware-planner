// Mise en page et animations de l'écran du charcudoc, lues dans les fichiers d'interface du jeu :
//   base/gameplay/gui/fullscreen/ripperdoc/ripperdoc.inkwidget           (arbre des widgets, référence 3840×2160)
//   base/gameplay/gui/fullscreen/ripperdoc/ripperdoc_animations.inkanim  (animations nommées)
// Produit site/data/ripperdoc.json : rectangle absolu (en pixels 4K) de chaque widget utile, et les animations.
//
//   node extract/build-ripperdoc.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import { gamePaths, RAW_DIR } from './config.mjs';

const { PNG } = pngjs;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUI = 'base\\gameplay\\gui\\fullscreen\\ripperdoc\\';

// --- extraction (WolvenKit) ------------------------------------------------
function ensure(file, regex) {
  const raw = join(RAW_DIR, 'ripwidget');
  const json = join(RAW_DIR, 'ripwidgetjson', file.split('\\').pop() + '.json');
  if (!existsSync(json)) {
    mkdirSync(dirname(json), { recursive: true });
    execFileSync('cp77tools', ['extract', join(gamePaths().archives, 'content', 'basegame_1_engine.archive'), '-o', raw, '-r', regex], { stdio: 'ignore' });
    execFileSync('cp77tools', ['convert', 's', join(raw, file), '-o', dirname(json)], { stdio: 'ignore' });
  }
  return JSON.parse(readFileSync(json, 'utf8')).Data.RootChunk;
}
const widgetRes = ensure(`${GUI}ripperdoc.inkwidget`, 'gui\\\\fullscreen\\\\ripperdoc\\\\ripperdoc\\.inkwidget$');
const animRes = ensure(`${GUI}ripperdoc_animations.inkanim`, 'gui\\\\fullscreen\\\\ripperdoc\\\\ripperdoc_animations\\.inkanim$');

// Taille réelle des textures pleine résolution (pour les images « fitToContent »)
function pngSize(file) {
  const buf = readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
const ATLAS_TEXTURES = {
  'man_body.inkatlas': join(RAW_DIR, 'ripui', GUI, 'man_body.png'),
  'woman_body.inkatlas': join(RAW_DIR, 'ripui', GUI, 'woman_body.png'),
};
const atlasParts = {};
for (const [atlas, tex] of Object.entries(ATLAS_TEXTURES)) {
  const json = JSON.parse(readFileSync(join(RAW_DIR, 'ripuijson', `${atlas}.json`), 'utf8')).Data.RootChunk;
  const slot = json.slots.Elements[0];
  const { w, h } = pngSize(tex);
  atlasParts[atlas] = Object.fromEntries(slot.parts.map((p) => {
    const u = p.clippingRectInUVCoords;
    return [p.partName.$value, { w: (u.Right - u.Left) * w, h: (u.Bottom - u.Top) * h }];
  }));
}

// --- arbre des widgets ------------------------------------------------------
const val = (x) => (x && typeof x === 'object' && '$value' in x ? x.$value : x);
function makeDeref(chunk) {
  const handles = new Map();
  (function index(o) {
    if (Array.isArray(o)) return o.forEach(index);
    if (!o || typeof o !== 'object') return;
    if (o.HandleId !== undefined && o.Data) handles.set(o.HandleId, o.Data);
    for (const v of Object.values(o)) index(v);
  }(chunk));
  return (h) => (h && h.HandleRefId !== undefined ? handles.get(h.HandleRefId) : h && h.Data ? h.Data : h);
}

// Position d'un enfant dans un parent (x, y, w, h), selon l'ancrage ink
function place(parent, w, h, l) {
  const m = l.margin || { left: 0, top: 0, right: 0, bottom: 0 };
  const a = l.anchor || 'TopLeft';
  const px = parent.x, py = parent.y, pw = parent.w, ph = parent.h;
  const cx = px + pw / 2 + m.left - m.right, cy = py + ph / 2 + m.top - m.bottom;
  switch (a) {
    case 'Fill': return { x: px + m.left, y: py + m.top, w: pw - m.left - m.right, h: ph - m.top - m.bottom };
    case 'Centered': return { x: cx - w / 2, y: cy - h / 2, w, h };
    case 'TopCenter': return { x: cx - w / 2, y: py + m.top, w, h };
    case 'BottomCenter': return { x: cx - w / 2, y: py + ph - m.bottom - h, w, h };
    case 'CenterLeft': return { x: px + m.left, y: cy - h / 2, w, h };
    case 'CenterRight': return { x: px + pw - m.right - w, y: cy - h / 2, w, h };
    case 'TopRight': return { x: px + pw - m.right - w, y: py + m.top, w, h };
    case 'BottomLeft': return { x: px + m.left, y: py + ph - m.bottom - h, w, h };
    case 'BottomRight': return { x: px + pw - m.right - w, y: py + ph - m.bottom - h, w, h };
    case 'LeftFillVerticaly': return { x: px + m.left, y: py + m.top, w, h: ph - m.top - m.bottom };
    case 'RightFillVerticaly': return { x: px + pw - m.right - w, y: py + m.top, w, h: ph - m.top - m.bottom };
    case 'CenterFillVerticaly': return { x: cx - w / 2, y: py + m.top, w, h: ph - m.top - m.bottom };
    default: return { x: px + m.left, y: py + m.top, w, h };
  }
}

const widgets = {}; // chemin d'index → infos
function walk(deref, wh, parentRect, path, namePath) {
  const w = deref(wh);
  if (!w || !w.$type) return;
  const name = val(w.name);
  let width = w.size ? w.size.X : 0, height = w.size ? w.size.Y : 0;
  let texture = null;
  if (w.textureAtlas && val(w.texturePart)) {
    const atlas = String(val(w.textureAtlas.DepotPath) || '').split('\\').pop();
    texture = { atlas, part: val(w.texturePart) };
    const nat = atlasParts[atlas] && atlasParts[atlas][texture.part];
    if (w.fitToContent && nat) { width = nat.w; height = nat.h; }
  }
  const rect = place(parentRect, width, height, w.layout || {});
  const rt = w.renderTransform || {};
  const info = {
    name, type: w.$type.replace(/^ink/, '').replace(/Widget$/, ''), namePath: namePath ? `${namePath}/${name}` : name,
    rect: Object.fromEntries(Object.entries(rect).map(([k, v]) => [k, Math.round(v * 10) / 10])),
    scale: rt.scale ? [rt.scale.X, rt.scale.Y] : [1, 1],
    translate: rt.translation ? [rt.translation.X, rt.translation.Y] : [0, 0],
    opacity: w.opacity ?? 1,
    visible: w.visible !== 0,
  };
  if (texture) info.texture = texture;
  if (w.videoPath && val(w.videoPath)) info.video = String(val(w.videoPath)).split('\\').pop();
  widgets[path] = info;
  const kids = w.children && deref(w.children);
  (kids && kids.children ? kids.children : []).forEach((c, i) => walk(deref, c, rect, path === '' ? String(i) : `${path}/${i}`, info.namePath));
}
const rootItem = widgetRes.libraryItems.find((it) => val(it.name) === 'Root');
const chunk = rootItem.packageData.Data.Chunks[0];
const deref = makeDeref(chunk);
// Le widget racine a le chemin « » ; les animations désignent ses descendants par indices (ex. 0/7/0/2/1)
walk(deref, chunk.rootWidget, { x: 0, y: 0, w: 3840, h: 2160 }, '', '');

// Vidéos : le chemin de la vidéo est dans les ressources du fichier, dans l'ordre des widgets Video
const videoPaths = (widgetRes.externalDependenciesForInternalItems || []).map((d) => val(d.DepotPath)).filter((p) => /\.bk2$/.test(p));
const byName = (n) => Object.entries(widgets).find(([, w]) => w.name === n);
for (const [, w] of Object.entries(widgets)) {
  if (w.type !== 'Video' || w.video) continue;
  // ex. « man_paperdoll_circulatory » → man_circulatory.bk2 ; « paperdoll_man_body_video » → male_body_loop.bk2
  const m = w.name.match(/^(man|woman)_paperdoll_(\w+)$/);
  const map = { hands: 'hand', arms: 'arm' };
  if (m) w.video = `${m[1]}_${map[m[2]] || m[2]}.bk2`;
  else if (w.name === 'paperdoll_man_body_video') w.video = 'male_body_loop.bk2';
  else if (w.name === 'paperdoll_woman_body_video') w.video = 'female_body_loop.bk2';
  if (w.video && !videoPaths.some((p) => p.endsWith(w.video))) w.videoMissing = true;
}

// --- animations ----------------------------------------------------------
const aDeref = makeDeref(animRes);
const animations = {};
for (const sh of animRes.sequences) {
  const seq = aDeref(sh);
  const name = val(seq.name);
  const tracks = [];
  (seq.definitions || []).forEach((dh, k) => {
    const def = aDeref(dh);
    const tgt = aDeref((seq.targets || [])[k]);
    const path = tgt && tgt.path ? tgt.path.join('/') : null;
    for (const ih of (def && def.interpolators) || []) {
      const i = aDeref(ih);
      if (!i) continue;
      const v = (x) => (x && typeof x === 'object' ? ('X' in x ? [x.X, x.Y] : 'left' in x ? [x.left, x.top, x.right, x.bottom] : x) : x);
      tracks.push({
        path, target: path !== null && widgets[path] ? widgets[path].namePath : null,
        type: i.$type.replace('inkanim', '').replace('Interpolator', ''),
        from: v(i.startValue), to: v(i.endValue), delay: i.startDelay || 0, duration: i.duration || 0,
        easing: `${i.interpolationType || 'Linear'}/${i.interpolationMode || 'EasyIn'}`,
      });
    }
  });
  animations[name] = tracks;
}

// --- sortie -------------------------------------------------------------
const out = {
  meta: { generatedAt: new Date().toISOString(), reference: '3840x2160', sources: [`${GUI}ripperdoc.inkwidget`, `${GUI}ripperdoc_animations.inkanim`] },
  widgets,
  animations,
};
mkdirSync(join(ROOT, 'site', 'data'), { recursive: true });
writeFileSync(join(ROOT, 'site', 'data', 'ripperdoc.json'), JSON.stringify(out));
writeFileSync(join(ROOT, 'data', 'ripperdoc-layout.json'), JSON.stringify(out, null, 1));
const n = Object.keys(widgets).length;
console.log(`site/data/ripperdoc.json : ${n} widgets, ${Object.keys(animations).length} animations`);
for (const name of ['paperdoll_man_body_video', 'paperdoll_man_skeleton', 'paperdoll_man_arms', 'man_paperdoll_circulatory', 'capacity_bar', 'armor_bar', 'frontalAnchor', 'cyberwareContainer']) {
  const e = byName(name);
  if (e) console.log(`  ${e[0].padEnd(12)} ${name} ${JSON.stringify(e[1].rect)} scale=${e[1].scale} ${e[1].video || ''}`);
}
