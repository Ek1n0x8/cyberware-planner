// Exploration : records d'une zone donnée avec palier, nom, chaîne d'amélioration.
//   node extract/survey.mjs ArmsCW [filtre]
import { TweakDb } from './lib/tweakDb.mjs';
import { gamePaths } from './config.mjs';

const [area = 'ArmsCW', filter = ''] = process.argv.slice(2);
const db = new TweakDb(gamePaths().tweaks).load();
for (const id of db.records.keys()) {
  if (db.val(id, 'equipArea') !== `EquipmentArea.${area}` || !id.includes(filter)) continue;
  const v = (k) => db.val(id, k);
  console.log([id, v('quality'), v('displayName'), `next=${v('nextUpgradeItem') || ''}`, `side=${v('sideUpgradeItem') || ''}`,
    `variants=${v('variants') ? 'oui' : 'non'}`, db.get(id).parent].join(' | '));
}
