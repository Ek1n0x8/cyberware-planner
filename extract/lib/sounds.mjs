// Sons de l'interface du charcudoc.
//  1. Les noms d'événements sont lus dans les scripts du charcudoc (appels Play( 'nom' )).
//  2. eventsmetadata.json donne l'id Wwise de chaque événement.
//  3. sfx_container.bnk donne les médias joués (voir wwise.mjs).
//  4. Les médias sont exportés par WolvenKit (paquets Opus, .wem isolés ou intégrés à la banque).
//  5. Sortie : .ogg (Ogg Opus, tel quel) et .mp3 (encodé depuis le .wav, pour les navigateurs sans Opus).

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { gamePaths, RAW_DIR } from '../config.mjs';
import { readBank, eventMedia, eventMode } from './wwise.mjs';

const require = createRequire(import.meta.url);

const SCRIPT_DIRS = ['cyberpunk/UI/fullscreen/ripperdoc'];
// Sons génériques utilisés aussi par le charcudoc (survol, achat), cités dans d'autres scripts d'interface
const EXTRA_EVENTS = ['ui_menu_hover', 'ui_menu_item_bought', 'ui_menu_item_sold'];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out); else if (f.endsWith('.script')) out.push(f);
  }
  return out;
}

// { nom: [ "fichier:ligne", … ] }
export function findRipperdocEvents() {
  const { scripts } = gamePaths();
  const events = new Map();
  for (const d of SCRIPT_DIRS) {
    for (const file of walk(join(scripts, d))) {
      readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
        for (const m of line.matchAll(/\bPlay\(\s*'(\w+)'/g)) {
          if (!events.has(m[1])) events.set(m[1], []);
          events.get(m[1]).push(`scripts/${file.slice(scripts.length + 1).replace(/\\/g, '/')}:${i + 1}`);
        }
      });
    }
  }
  for (const e of EXTRA_EVENTS) if (!events.has(e)) events.set(e, ['(son d’interface générique)']);
  return events;
}

function extractOnce(archive, regex, outDir) {
  mkdirSync(outDir, { recursive: true });
  execFileSync('cp77tools', ['extract', archive, '-o', outDir, '-r', regex], { stdio: 'ignore' });
}

export function loadSoundData({ force = false } = {}) {
  const { archives } = gamePaths();
  const dir = join(RAW_DIR, 'sound');
  const meta = join(dir, 'base', 'sound', 'event', 'eventsmetadata.json');
  const bnk = join(dir, 'base', 'sound', 'soundbanks', 'sfx_container.bnk');
  if (force || !existsSync(meta)) extractOnce(join(archives, 'content', 'audio_1_general.archive'), 'eventsmetadata\\.json$', dir);
  if (force || !existsSync(bnk)) extractOnce(join(archives, 'content', 'audio_2_soundbanks.archive'), 'sfx_container\\.(bnk|opusinfo)$', dir);
  const jsonDir = join(RAW_DIR, 'soundjson');
  const metaJson = join(jsonDir, 'eventsmetadata.json.json');
  if (force || !existsSync(metaJson)) {
    mkdirSync(jsonDir, { recursive: true });
    execFileSync('cp77tools', ['convert', 's', meta, '-o', jsonDir], { stdio: 'ignore' });
  }
  // nom d'événement -> id Wwise (toutes catégories confondues)
  const root = JSON.parse(readFileSync(metaJson, 'utf8')).Data.RootChunk.root.Data;
  const ids = new Map();
  for (const list of Object.values(root)) {
    if (!Array.isArray(list)) continue;
    for (const e of list) if (e && e.redId && e.wwiseId) ids.set(e.redId.$value, { wwiseId: e.wwiseId, isLooping: !!e.isLooping });
  }
  return { ids, bank: readBank(bnk) };
}

// Exporte les médias Opus demandés (une seule passe WolvenKit). Renvoie { id: { opus, wav } }.
export function exportOpus(mediaIds) {
  const { game, archives } = gamePaths();
  const out = join(RAW_DIR, 'opus');
  mkdirSync(out, { recursive: true });
  const todo = mediaIds.filter((id) => !existsSync(join(out, `${id}.opus`)));
  if (todo.length) {
    execFileSync('cp77tools', ['uncook', join(archives, 'content', 'audio_2_soundbanks.archive'), '-o', out, '-gp', game,
      '-r', 'sfx_container\\.opusinfo$', '--opus-hashes', todo.join(',')], { stdio: 'ignore', maxBuffer: 1 << 28 });
  }
  const res = {};
  for (const id of mediaIds) {
    const opus = join(out, `${id}.opus`), wav = join(out, `${id}.wav`);
    if (existsSync(opus)) res[id] = { opus, wav: existsSync(wav) ? wav : null };
  }
  return res;
}

// lamejs 1.2.1 : l'entrée npm (src/) est cassée sous Node ; on charge la version « tout-en-un »
// (lame.all.js), écrite pour le navigateur, dans un contexte isolé.
let lamejsCache = null;
function loadLamejs() {
  if (!lamejsCache) {
    const src = readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8');
    const ctx = vm.createContext({});
    // le fichier appelle lamejs() à la fin, qui accroche Mp3Encoder à la fonction lamejs elle-même
    vm.runInContext(`${src}\n;this.__lamejs = lamejs;`, ctx);
    lamejsCache = ctx.__lamejs;
  }
  return lamejsCache;
}

// WAV PCM 16 bits → MP3 (lamejs, 128 kb/s)
export function wavToMp3(wavPath, mp3Path) {
  const lamejs = loadLamejs();
  const buf = readFileSync(wavPath);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') data = buf.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error(`WAV non géré : ${wavPath}`);
  const samples = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
  const enc = new lamejs.Mp3Encoder(fmt.channels, fmt.rate, 128);
  const parts = [];
  const block = 1152;
  if (fmt.channels === 1) {
    for (let i = 0; i < samples.length; i += block) parts.push(enc.encodeBuffer(samples.subarray(i, i + block)));
  } else {
    const n = samples.length / 2, left = new Int16Array(n), right = new Int16Array(n);
    for (let i = 0; i < n; i++) { left[i] = samples[2 * i]; right[i] = samples[2 * i + 1]; }
    for (let i = 0; i < n; i += block) parts.push(enc.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block)));
  }
  parts.push(enc.flush());
  writeFileSync(mp3Path, Buffer.concat(parts.map((x) => Buffer.from(x.buffer, x.byteOffset, x.length))));
}

export function buildSounds(outDir, opts = {}) {
  mkdirSync(outDir, { recursive: true });
  const events = findRipperdocEvents();
  const { ids, bank } = loadSoundData(opts);
  const plan = [];
  const missing = [];
  for (const [name, usedIn] of events) {
    const meta = ids.get(name);
    if (!meta) { missing.push({ event: name, reason: 'absent de eventsmetadata.json' }); continue; }
    const media = eventMedia(bank, meta.wwiseId);
    if (!media || !media.length) { missing.push({ event: name, reason: 'aucun son trouvé dans sfx_container.bnk' }); continue; }
    plan.push({ name, usedIn, ...meta, media, mode: eventMode(bank, meta.wwiseId) });
  }
  const opus = exportOpus([...new Set(plan.flatMap((e) => e.media.map((m) => m.mediaId)))]);
  const manifest = {};
  for (const e of plan) {
    const files = [];
    e.media.forEach((m, i) => {
      const src = opus[m.mediaId];
      if (!src) return;
      const base = e.media.length > 1 ? `${e.name}_${i + 1}` : e.name;
      copyFileSync(src.opus, join(outDir, `${base}.ogg`));
      const f = { ogg: `sounds/${base}.ogg`, mediaId: m.mediaId };
      if (src.wav) { wavToMp3(src.wav, join(outDir, `${base}.mp3`)); f.mp3 = `sounds/${base}.mp3`; }
      files.push(f);
    });
    if (files.length) manifest[e.name] = { wwiseId: e.wwiseId, isLooping: e.isLooping, mode: e.mode, usedIn: e.usedIn, files };
    else missing.push({ event: e.name, reason: `médias introuvables dans les paquets Opus : ${e.media.map((m) => m.mediaId).join(', ')}` });
  }
  return { manifest, missing };
}
