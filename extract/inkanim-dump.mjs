// Résume un .inkanim (sérialisé en JSON par WolvenKit) : animations, cibles, interpolateurs.
//   node extract/inkanim-dump.mjs <fichier.inkanim.json> [filtre de nom]
import { readFileSync } from 'node:fs';

const [file, filter = ''] = process.argv.slice(2);
const root = JSON.parse(readFileSync(file, 'utf8')).Data.RootChunk;
const val = (x) => (x && typeof x === 'object' && '$value' in x ? x.$value : x);
const handles = new Map();
(function index(o) {
  if (Array.isArray(o)) return o.forEach(index);
  if (!o || typeof o !== 'object') return;
  if (o.HandleId !== undefined && o.Data) handles.set(o.HandleId, o.Data);
  for (const v of Object.values(o)) index(v);
}(root));
const deref = (h) => (h && h.HandleRefId !== undefined ? handles.get(h.HandleRefId) : h && h.Data ? h.Data : h);

function fmt(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object') return String(Math.round(v * 1000) / 1000);
  if ('left' in v) return `[${['left', 'top', 'right', 'bottom'].map((k) => Math.round(v[k])).join(',')}]`;
  if ('X' in v) return `(${Math.round(v.X * 1000) / 1000},${Math.round(v.Y * 1000) / 1000})`;
  if ('Red' in v) return `rgba(${[v.Red, v.Green, v.Blue, v.Alpha].map((x) => Math.round(x * 100) / 100).join(',')})`;
  return JSON.stringify(v).slice(0, 60);
}

// Une séquence = une animation nommée ; definitions[i] s'applique à targets[i] (chemin d'index dans l'arbre de widgets)
for (const sh of root.sequences || []) {
  const seq = deref(sh);
  const name = val(seq.name);
  if (filter && !String(name).includes(filter)) continue;
  console.log(`== ${name}`);
  (seq.definitions || []).forEach((dh, k) => {
    const def = deref(dh);
    const tgt = deref((seq.targets || [])[k]);
    const path = tgt && tgt.path ? tgt.path.join('/') : '?';
    for (const ih of (def && def.interpolators) || []) {
      const i = deref(ih);
      if (!i) continue;
      const type = i.$type.replace('inkanim', '').replace('Interpolator', '');
      console.log(`   [cible ${path}] ${type} ${fmt(i.startValue)} → ${fmt(i.endValue)}  délai ${fmt(i.startDelay)} durée ${fmt(i.duration)} ${i.interpolationType || ''}/${i.interpolationMode || ''}`);
    }
  });
}
