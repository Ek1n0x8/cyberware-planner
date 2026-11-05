// Résumé lisible des JSON générés (contrôle rapide après extraction).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (n) => JSON.parse(readFileSync(join(DATA, n), 'utf8'));
const report = load('extract-report.json');
const { cyberware } = load('cyberware.json');
const slots = load('slots.json');
const { perks } = load('perks.json');

console.log('Doublons de palier :', JSON.stringify(report.familiesWithDuplicateQualities));
console.log('Non vendus par les charcudocs :', report.notSoldByRipperdocs.join(' | '));
console.log('\nZones :');
for (const a of slots.areas) {
  console.log(`  ${a.id} (${a.name ? a.name.fr : '-'}) : ${a.slots.length} slots${a.slots.filter((s) => s.unlock).map((s) => ` [${s.index}: ${JSON.stringify(s.unlock)}]`).join('')}`);
}
console.log('\nCapacité joueur :', JSON.stringify(slots.capacity.playerBase.map((m) => `${m.stat} ${m.value}${m.refStat ? ' × ' + m.refStat : ''}`)));
console.log('\nPerks :');
for (const p of perks) console.log(`  ${p.id} (${p.name && p.name.fr}) : ${p.reasons.join(' ; ')}`);
console.log('\nImplants par zone :');
const byArea = {};
for (const c of cyberware) (byArea[c.area] = byArea[c.area] || []).push(`${c.name.fr}${c.iconic ? ' ★' : ''} [${c.tiers.length}]`);
for (const [a, l] of Object.entries(byArea)) console.log(`  ${a} (${l.length}) : ${l.join(', ')}`);
const t = cyberware.find((c) => c.friendlyName === 'NoPainNoGain');
if (t) console.log('\nExemple secondaryStats :', JSON.stringify(t.tiers[6].secondaryStats.modifiers.slice(0, 3)), '\nside:', t.tiers[0].sideVariant && t.tiers[0].sideVariant.record);
