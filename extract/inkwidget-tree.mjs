// Résume un .inkwidget (sérialisé en JSON par WolvenKit) en arbre lisible :
// type, nom, taille, marges, ancrage, texture (planche#zone), texte, teinte, visibilité.
//   node extract/inkwidget-tree.mjs <fichier.inkwidget.json> [élément de bibliothèque] [profondeur max]
import { readFileSync } from 'node:fs';

const [file, itemFilter = '', maxDepthArg = '40'] = process.argv.slice(2);
const maxDepth = +maxDepthArg;
const data = JSON.parse(readFileSync(file, 'utf8')).Data.RootChunk;

// Les références (HandleId / HandleRefId) pointent vers des objets déjà vus, propres à chaque élément
let handles = new Map();
function index(o) {
  if (Array.isArray(o)) return o.forEach(index);
  if (!o || typeof o !== 'object') return;
  if (o.HandleId !== undefined && o.Data) handles.set(o.HandleId, o.Data);
  for (const v of Object.values(o)) index(v);
}
const deref = (h) => (h && h.HandleRefId !== undefined ? handles.get(h.HandleRefId) : h && h.Data ? h.Data : h);

const val = (x) => (x && typeof x === 'object' && '$value' in x ? x.$value : x);
function describe(w) {
  const parts = [w.$type.replace(/^ink/, '').replace(/Widget$/, ''), `"${val(w.name)}"`];
  if (w.size) parts.push(`size=${Math.round(w.size.X)}x${Math.round(w.size.Y)}`);
  const l = w.layout;
  if (l) {
    const m = l.margin;
    if (m && (m.left || m.top || m.right || m.bottom)) parts.push(`margin=${[m.left, m.top, m.right, m.bottom].map(Math.round).join(',')}`);
    if (l.anchor && l.anchor !== 'TopLeft') parts.push(`anchor=${l.anchor}`);
    if (l.HAlign && l.HAlign !== 'Fill') parts.push(`h=${l.HAlign}`);
    if (l.VAlign && l.VAlign !== 'Fill') parts.push(`v=${l.VAlign}`);
    const p = l.padding;
    if (p && (p.left || p.top || p.right || p.bottom)) parts.push(`pad=${[p.left, p.top, p.right, p.bottom].map(Math.round).join(',')}`);
  }
  if (w.childMargin && (w.childMargin.left || w.childMargin.top || w.childMargin.right || w.childMargin.bottom)) {
    const m = w.childMargin; parts.push(`childMargin=${[m.left, m.top, m.right, m.bottom].map(Math.round).join(',')}`);
  }
  if (w.orientation) parts.push(`orient=${w.orientation}`);
  if (w.textureAtlas) {
    const atlas = val(w.textureAtlas.DepotPath);
    if (atlas && atlas !== '0') parts.push(`tex=${String(atlas).split('\\').pop()}#${val(w.texturePart)}`);
  }
  if (w.text) parts.push(`text="${String(w.text).slice(0, 40)}"`);
  if (w.localizationString && val(w.localizationString.value)) parts.push(`loc=${val(w.localizationString.value)}`);
  if (w.fontFamily) parts.push(`font=${String(val(w.fontFamily.DepotPath) || '').split('\\').pop()}`);
  if (w.fontSize) parts.push(`fontSize=${w.fontSize}`);
  if (w.tintColor) { const c = w.tintColor; parts.push(`tint=${[c.Red, c.Green, c.Blue, c.Alpha].map((v) => Math.round(v * 100) / 100).join(',')}`); }
  if (w.opacity !== undefined && w.opacity !== 1) parts.push(`opacity=${Math.round(w.opacity * 100) / 100}`);
  if (w.visible === 0) parts.push('HIDDEN');
  if (w.rotation) parts.push(`rot=${w.rotation}`);
  if (w.renderTransform) {
    const r = w.renderTransform;
    if (r.translation && (r.translation.X || r.translation.Y)) parts.push(`translate=${Math.round(r.translation.X)},${Math.round(r.translation.Y)}`);
    if (r.scale && (r.scale.X !== 1 || r.scale.Y !== 1)) parts.push(`scale=${r.scale.X},${r.scale.Y}`);
  }
  if (w.style && val(w.style.DepotPath) && val(w.style.DepotPath) !== '0') parts.push(`style=${String(val(w.style.DepotPath)).split('\\').pop()}`);
  if (w.state && val(w.state)) parts.push(`state=${val(w.state)}`);
  const ctrl = (w.logicController && deref(w.logicController)) || null;
  if (ctrl && ctrl.$type) parts.push(`ctrl=${ctrl.$type}`);
  return parts.join(' ');
}
function walk(w, depth, out) {
  w = deref(w);
  if (!w || !w.$type || depth > maxDepth) return;
  out.push(`${'  '.repeat(depth)}${describe(w)}`);
  const kids = w.children && deref(w.children);
  const list = kids && kids.children ? kids.children : [];
  for (const c of list) walk(c, depth + 1, out);
}

const items = data.libraryItems || [];
for (const it of items) {
  const name = val(it.name);
  if (itemFilter && name !== itemFilter) continue;
  // WolvenKit 9 : packageData.Data.Chunks[0] = inkWidgetLibraryItemInstance (rootWidget + gameController)
  const chunk = it.packageData && it.packageData.Data && it.packageData.Data.Chunks ? it.packageData.Data.Chunks[0] : null;
  handles = new Map();
  if (chunk) index(chunk);
  const out = [];
  if (chunk && chunk.rootWidget) walk(chunk.rootWidget, 1, out);
  console.log(`== ${name} (${out.length} widgets)`);
  if (itemFilter) console.log(out.join('\n'));
}
if (!items.length) console.log('Aucun libraryItems ; clés :', Object.keys(data));
