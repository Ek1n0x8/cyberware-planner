// Affiche des textes du jeu par numéro de clé : node extract/lockeys.mjs 1814 1817 ...
import { extractLocalization, loadLocTables } from './lib/loc.mjs';

const loc = loadLocTables(extractLocalization());
for (const k of process.argv.slice(2)) {
  const f = loc.fr.get(k), e = loc.en.get(k);
  console.log(k, '|', f && f.text, '|', e && e.text);
}
