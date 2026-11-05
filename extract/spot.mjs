// Contrôle ponctuel : affiche quelques paliers (nom, coût, stats calculées, premier effet).
//   node extract/spot.mjs PainReductor MantisBlades CapacityBooster
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { cyberware } = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'cyberware.json'), 'utf8'));
for (const q of process.argv.slice(2)) {
  for (const c of cyberware.filter((x) => x.id.includes(q) || x.friendlyName === q)) {
    console.log(`\n${c.name.fr} / ${c.name.en} — ${c.area} — ${c.id}`);
    for (const t of c.tiers) {
      const cost = t.capacityCost.map((v) => v.base).join('/');
      const eff = (t.onEquip.find((p) => p.description) || {}).description;
      console.log(`  ${t.quality.padEnd(18)} coût ${cost}  ${JSON.stringify(t.computedStats)}  ${eff ? eff.fr.replace(/\n/g, ' ').slice(0, 90) : ''}${t.alternates ? `  (+${t.alternates.length} alt.)` : ''}`);
    }
  }
}
