// Extraction complète : génère data/cyberware.json, slots.json, perks.json,
// loc_fr.json, loc_en.json et extract-report.json.
//
//   node extract/extract-all.mjs            (réutilise les fichiers déjà extraits par WolvenKit)
//   node extract/extract-all.mjs --force    (ré-extrait tout, à faire après une mise à jour du jeu)

import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TweakDb } from './lib/tweakDb.mjs';
import { extractLocalization, loadLocTables } from './lib/loc.mjs';
import { extractCurves, Curves } from './lib/curves.mjs';
import { CyberwareBuilder } from './lib/cyberware.mjs';
import { findFamilies } from './lib/families.mjs';
import { buildVendorIndex } from './lib/vendors.mjs';
import { buildSlots } from './lib/slots.mjs';
import { buildPerks } from './lib/perks.mjs';
import { gamePaths } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const force = process.argv.includes('--force');
const paths = gamePaths();

const write = (name, obj) => {
  const file = join(DATA, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2));
  console.log(`  ${name}  ${Math.round(statSync(file).size / 1024)} Ko`);
};

console.log('Lecture des .tweak…');
const db = new TweakDb(paths.tweaks).load();
if (db.errors.length) throw new Error(`fichiers .tweak non lus :\n${db.errors.join('\n')}`);
console.log('Localisation et courbes (WolvenKit)…');
const loc = loadLocTables(extractLocalization({ force }));
const curves = new Curves(extractCurves({ force }));
const builder = new CyberwareBuilder(db, loc, curves, buildVendorIndex(db));

const meta = {
  generatedAt: new Date().toISOString(),
  gameExeModified: statSync(join(paths.game, 'bin', 'x64', 'Cyberpunk2077.exe')).mtime.toISOString(),
  sources: {
    tweaks: 'tools/redmod/tweaks (REDmod)',
    localization: 'archive/pc/{content,ep1}/lang_{fr,en}_text.archive → localization/*/onscreens/onscreens.json',
    curves: Object.fromEntries(Object.entries(curves.sets).map(([k, v]) => [k, v.gamePath])),
  },
};

console.log('Implants…');
const { families, excluded } = findFamilies(db);
const all = families.map((ids) => builder.family(ids))
  .sort((a, b) => a.area.localeCompare(b.area) || (a.name.en || '').localeCompare(b.name.en || ''));
// Apparences de bras (Glamdoc, zone ArmsCWStyle) : purement cosmétiques, rangées à part
const COSMETIC_AREAS = new Set(['ArmsCWStyle']);
const cyberware = all.filter((c) => !COSMETIC_AREAS.has(c.area));
const cosmetics = all.filter((c) => COSMETIC_AREAS.has(c.area)).map((c) => ({
  id: c.id, name: c.name, description: c.description, area: c.area, icon: c.icon,
  record: c.tiers[0].record, source: c.tiers[0].source,
}));

// Implants obtenables : vendus par un charcudoc, ou cités ailleurs que dans leur propre fichier
// (récompense de quête, butin, équipement de départ…). Ceux cités nulle part (contenu coupé) ou seulement
// par les builds de test / debug du jeu (progression_builds, player_debug) sont marqués non obtenables.
const refFiles = new Map(); // nom court cité (avec ou sans « Items. ») → fichiers qui le citent
const walkRefs = (v, file) => {
  if (typeof v === 'string') { const k = v.replace(/^Items\./, ''); if (!refFiles.has(k)) refFiles.set(k, new Set()); refFiles.get(k).add(file); return; }
  if (Array.isArray(v)) { for (const x of v) walkRefs(x, file); return; }
  if (v && typeof v === 'object') for (const x of Object.values(v.fields || v)) walkRefs(x && x.value !== undefined ? x.value : x, file);
};
for (const rec of db.records.values()) for (const e of Object.values(rec.fields || {})) for (const x of e.multi || [e]) walkRefs(x.value, rec.source.file);
const TEST_FILES = /progression_builds|player_debug/;
for (const c of cyberware) {
  if (c.soldByRipperdocs) continue;
  const own = new Set(c.tiers.map((t) => t.source.file));
  const ext = new Set();
  for (const t of c.tiers) for (const f of refFiles.get(t.record.replace(/^Items\./, '')) || []) if (!own.has(f)) ext.add(f);
  const real = [...ext].filter((f) => !TEST_FILES.test(f));
  // Équipement des builds d'ennemis par difficulté (Normal_20_…, Hard_30_…, VHard_50_…) : jamais pour le joueur
  if (!real.length && ext.size && /^(Normal|Hard|VHard)_\d+_/.test(c.id)) c.unobtainable = `cité seulement par des builds de test : ${[...ext].join(', ')}`;
  // Non vendu et cité nulle part dans la TweakDB : peut venir d'une quête (fichiers de quête non analysés) ou être coupé
  else if (!real.length) c.obtainUnknown = true;
}
console.log(`Implants non obtenables : ${cyberware.filter((c) => c.unobtainable).map((c) => c.id).join(', ')}`);
console.log(`Obtention non trouvée : ${cyberware.filter((c) => c.obtainUnknown).map((c) => c.id).join(', ')}`);

console.log('Slots et capacité…');
const slots = buildSlots(db, builder, curves, new Set(cyberware.map((c) => c.area)));

// Perks et stats citées par les données cyberware (pour choisir les perks à exporter)
const referencedPerks = new Map();
const addPerk = (perk, why) => { if (!referencedPerks.has(perk)) referencedPerks.set(perk, new Set()); referencedPerks.get(perk).add(why); };
for (const a of slots.areas) for (const s of a.slots) if (s.unlock && s.unlock.perk) addPerk(s.unlock.perk, `slot ${a.id}[${s.index}]`);
const referencedStats = new Set();
const ATTRIBUTES = new Set(['Strength', 'Reflexes', 'Intelligence', 'TechnicalAbility', 'Cool', 'Level']);
const walkMods = (mods) => { for (const m of mods || []) if (m.refStat && ['Player', 'Owner'].includes(m.refObject) && !ATTRIBUTES.has(m.refStat)) referencedStats.add(m.refStat); };
for (const c of cyberware) for (const t of c.tiers) {
  walkMods(t.statModifiers);
  for (const p of t.onEquip) walkMods(p.stats);
  if (t.secondaryStats) walkMods(t.secondaryStats.modifiers);
  for (const v of t.capacityCost) for (const a of v.adjustments || []) referencedStats.add(a.refStat);
}
const perkIds = [...db.records.keys()].filter((id) => db.isA(id, 'NewPerk')).map((id) => db.val(id, 'enumName')).filter(Boolean);
for (const stat of referencedStats) {
  const perk = perkIds.find((p) => stat.startsWith(p + '_'));
  if (perk) addPerk(perk, `stat ${stat}`);
}
console.log('Perks…');
const perks = buildPerks(db, builder, referencedPerks, referencedStats);

console.log('Écriture :');
write('cyberware.json', { meta, qualities: builder.qualities, cyberware, cosmetics });
write('slots.json', { meta, ...slots });
write('perks.json', { meta, perks });
for (const lang of Object.keys(loc)) {
  const table = {};
  for (const key of [...builder.locKeysUsed].sort((a, b) => a - b)) {
    const e = loc[lang].get(key);
    if (e) table[key] = e.male ? { text: e.text, male: e.male } : e.text;
  }
  write(`loc_${lang}.json`, table);
}

// Rapport de contrôle : ce qui a été écarté, ce qui n'a pas pu être résolu
const unresolved = [];
const missingLoc = [];
const scan = (obj, path) => {
  if (Array.isArray(obj)) return obj.forEach((v, i) => scan(v, `${path}[${i}]`));
  if (!obj || typeof obj !== 'object') return;
  if (obj.unresolved) unresolved.push({ path, ref: obj.unresolved });
  if (obj.key && obj.key.startsWith('LocKey#') && (obj.fr === null || obj.en === null)) missingLoc.push({ path, key: obj.key });
  for (const [k, v] of Object.entries(obj)) scan(v, `${path}.${k}`);
};
scan(cyberware, 'cyberware');
scan(perks, 'perks');
const report = {
  meta,
  counts: {
    families: cyberware.length,
    tiers: cyberware.reduce((s, c) => s + c.tiers.length, 0),
    iconic: cyberware.filter((c) => c.iconic).length,
    cosmetics: cosmetics.length,
    notSoldByRipperdocs: cyberware.filter((c) => !c.soldByRipperdocs).length,
    areas: slots.areas.length,
    perks: perks.length,
    excludedRecords: excluded.length,
  },
  familiesWithDuplicateQualities: cyberware.filter((c) => c.duplicateQualities).map((c) => ({ id: c.id, qualities: c.duplicateQualities })),
  notSoldByRipperdocs: cyberware.filter((c) => !c.soldByRipperdocs).map((c) => `${c.id} (${c.name.fr})`),
  excluded,
  unresolved,
  missingLoc,
};
write('extract-report.json', report);
console.log(report.counts);
console.log(`références non résolues : ${unresolved.length}, textes manquants : ${missingLoc.length}`);
