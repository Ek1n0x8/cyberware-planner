// Échantillon : extrait quelques implants pour valider le schéma JSON
// avant de lancer l'extraction complète.
//   node extract/sample.mjs [Items.RecordDeDepart ...]

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TweakDb } from './lib/tweakDb.mjs';
import { extractLocalization, loadLocTables } from './lib/loc.mjs';
import { CyberwareBuilder } from './lib/cyberware.mjs';
import { gamePaths } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const starts = process.argv.slice(2);
if (!starts.length) starts.push(
  'Items.AdvancedPainReductorEpic',
  'Items.AdvancedProximityReducerCommon',
  'Items.IconicDischargeConnectorRare',
);

const db = new TweakDb(gamePaths().tweaks).load();
if (db.errors.length) console.warn(`${db.errors.length} fichiers .tweak non lus`);
const loc = loadLocTables(extractLocalization());
const builder = new CyberwareBuilder(db, loc);

const out = {
  meta: {
    generatedAt: new Date().toISOString(),
    sources: { tweaks: 'tools/redmod/tweaks', localization: 'archive/pc/{content,ep1}/lang_{fr,en}_text.archive' },
  },
  qualities: builder.qualities,
  cyberware: starts.map((id) => builder.family(id)),
};

const file = join(ROOT, 'data', 'sample', 'cyberware_sample.json');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`écrit : ${file}`);
for (const c of out.cyberware) {
  console.log(`- ${c.name && c.name.fr} / ${c.name && c.name.en} (${c.area}) : ${c.tiers.map((t) => t.quality).join(', ')}`);
}
