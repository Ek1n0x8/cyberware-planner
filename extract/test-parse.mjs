// Vérifie que tous les fichiers .tweak se parsent sans erreur.
import { TweakDb } from './lib/tweakDb.mjs';
import { gamePaths } from './config.mjs';

const db = new TweakDb(gamePaths().tweaks).load();
console.log(`records: ${db.records.size}, erreurs: ${db.errors.length}`);
for (const e of db.errors.slice(0, 20)) console.log('  ' + e);
const ids = [...db.records.keys()];
const cw = ids.filter((id) => db.isA(id, 'Cyberware'));
console.log(`records héritant de Items.Cyberware: ${cw.length}`);
