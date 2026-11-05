// Contrôle : chaque implant (famille et paliers) a-t-il une icône extraite ?
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const { cyberware } = JSON.parse(readFileSync(join(DATA, 'cyberware.json'), 'utf8'));
const { icons } = JSON.parse(readFileSync(join(DATA, 'icons.json'), 'utf8'));
let ok = 0;
for (const c of cyberware) {
  const tierIcons = new Set(c.tiers.map((t) => t.icon));
  const missing = [...tierIcons, c.icon].filter((i) => !icons[i]);
  if (missing.length) console.log(`${c.id} (${c.name.fr}) : sans icône → ${[...new Set(missing)].join(', ')}`);
  else ok++;
}
console.log(`${ok}/${cyberware.length} implants ont toutes leurs icônes`);
