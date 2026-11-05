// Vérifie sur les données extraites quelques affirmations de RULES.md.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const { cyberware } = JSON.parse(readFileSync(join(DATA, 'cyberware.json'), 'utf8'));

// 1. Le coût en capacité est-il le même sur tous les paliers d'une famille ?
const varying = cyberware.filter((c) => new Set(c.tiers.map((t) => t.capacityCost.map((v) => v.base).join('/'))).size > 1);
console.log(`Familles dont le coût varie selon le palier : ${varying.length}`);
for (const c of varying) console.log(`  ${c.id} : ${c.tiers.map((t) => `${t.quality}=${t.capacityCost.map((v) => v.base).join('/')}`).join(', ')}`);

// 2. Les variantes « Tinkerer » ne concernent-elles que squelette et tégumentaire ?
const tinker = new Set(cyberware.filter((c) => c.tiers.some((t) => t.capacityCost.some((v) => /Tinkerer/.test(v.variant)))).map((c) => c.area));
console.log(`Zones avec variante Tinkerer : ${[...tinker].join(', ')}`);

// 3. Les versions « sideVariant » n'existent-elles que pour le squelette ?
const side = new Set(cyberware.filter((c) => c.tiers.some((t) => t.sideVariant)).map((c) => c.area));
console.log(`Zones avec sideVariant : ${[...side].join(', ')}`);
