// Recherche dans les textes du jeu par « secondaryKey » (clé lisible) ou par texte.
//   node extract/find-loc.mjs <regex>
import { extractLocalization, loadLocTables } from './lib/loc.mjs';

const re = new RegExp(process.argv[2] || 'Quality', 'i');
const loc = loadLocTables(extractLocalization());
let n = 0;
for (const [key, e] of loc.fr) {
  if (!re.test(e.secondaryKey || '') && !re.test(e.text || '')) continue;
  const en = loc.en.get(key);
  console.log(`${key} | ${e.secondaryKey} | ${e.text} | ${en ? en.text : ''}`);
  if (++n > 60) break;
}
