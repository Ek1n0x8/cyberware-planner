// Extraction des assets (étape 3) : icônes des implants / effets / perks, et sons du charcudoc.
// À lancer après extract-all.mjs (les noms d'icônes sont lus dans data/*.json).
//
//   node extract/extract-assets.mjs           (réutilise les fichiers déjà extraits)
//   node extract/extract-assets.mjs --force

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TweakDb } from './lib/tweakDb.mjs';
import { resolveIcons, extractAtlases, cropIcons, dirSize } from './lib/icons.mjs';
import { buildSounds } from './lib/sounds.mjs';
import { extractUiAssets } from './lib/uiassets.mjs';
import { gamePaths } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const ASSETS = join(ROOT, 'assets');
const force = process.argv.includes('--force');
const load = (n) => JSON.parse(readFileSync(join(DATA, n), 'utf8'));

// --- Icônes -------------------------------------------------------------
const { cyberware } = load('cyberware.json');
const { perks } = load('perks.json');
const names = new Set();
const add = (n) => { if (n && typeof n === 'string') names.add(n); };
for (const c of cyberware) {
  add(c.icon);
  for (const t of c.tiers) {
    add(t.icon);
    for (const p of t.onEquip) add(p.icon);
    if (t.sideVariant) add(t.sideVariant.icon);
  }
}
for (const p of perks) add(p.icon);
// Composants d'amélioration (RPGManager.GetCraftingMaterialRecord)
const dbMat = new TweakDb(gamePaths().tweaks).load();
for (const q of ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']) add(dbMat.val(`Items.${q}Material1`, 'iconPath'));

console.log(`Icônes demandées : ${names.size}`);
const db = new TweakDb(gamePaths().tweaks).load();
const { resolved, missing } = resolveIcons(db, names);
const atlases = [...new Set([...resolved.values()].map((r) => r.atlas))];
console.log(`Planches à extraire : ${atlases.length}`);
const rawDir = extractAtlases(atlases, { force });
const { manifest, failed } = cropIcons(resolved, rawDir, join(ASSETS, 'icons'));
const { n, size } = dirSize(join(ASSETS, 'icons'));
console.log(`Icônes écrites : ${Object.keys(manifest).length} (${n} fichiers, ${Math.round(size / 1024)} Ko)`);
console.log(`Sans planche : ${missing.length}, découpe impossible : ${failed.length}`);

writeFileSync(join(DATA, 'icons.json'), JSON.stringify({
  meta: { generatedAt: new Date().toISOString(), atlases: atlases.map((a) => a.replace(/\\/g, '/')) },
  icons: manifest,
  missing: [...missing, ...failed],
}, null, 2));
console.log('  data/icons.json');

// --- Interface du charcudoc (silhouettes, fond, jauges) ------------------
console.log('\nInterface du charcudoc…');
const ui = extractUiAssets(join(ASSETS, 'ui'), { force });
console.log(`Images d'interface : ${Object.keys(ui.written).length} ; manquantes : ${ui.missing.length}`);
writeFileSync(join(DATA, 'ui.json'), JSON.stringify({ meta: { generatedAt: new Date().toISOString() }, images: ui.written, missing: ui.missing }, null, 2));
console.log('  data/ui.json');

// --- Sons ---------------------------------------------------------------
console.log('\nSons du charcudoc…');
const sounds = buildSounds(join(ASSETS, 'sounds'), { force });
const s = dirSize(join(ASSETS, 'sounds'));
console.log(`Événements avec son : ${Object.keys(sounds.manifest).length} (${s.n} fichiers, ${Math.round(s.size / 1024)} Ko) ; sans son : ${sounds.missing.length}`);
writeFileSync(join(DATA, 'sounds.json'), JSON.stringify({
  meta: { generatedAt: new Date().toISOString(), source: 'sfx_container.bnk + sfx_container.opusinfo/.opuspak (audio_2_soundbanks.archive)' },
  sounds: sounds.manifest,
  missing: sounds.missing,
}, null, 2));
console.log('  data/sounds.json');
