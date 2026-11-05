// Test : quels médias joue l'événement « ui_gui_cyberware_tab_open » ?
import { readBank, eventMedia } from './lib/wwise.mjs';
import { join } from 'node:path';
import { RAW_DIR } from './config.mjs';

const bank = readBank(join(RAW_DIR, 'sound', 'base', 'sound', 'soundbanks', 'sfx_container.bnk'));
const types = {};
for (const o of bank.objects.values()) types[o.type] = (types[o.type] || 0) + 1;
console.log(`version ${bank.version}, objets ${bank.objects.size}, médias intégrés ${bank.embedded.size}`, types);
import { findRipperdocEvents, loadSoundData } from './lib/sounds.mjs';
const { ids } = loadSoundData();
for (const name of findRipperdocEvents().keys()) {
  const m = ids.get(name);
  const media = m ? eventMedia(bank, m.wwiseId) : null;
  console.log(name.padEnd(45), m ? `${media.length} média(s)` : 'inconnu', media && media.length < 6 ? media.map((x) => x.mediaId).join(',') : '');
}
