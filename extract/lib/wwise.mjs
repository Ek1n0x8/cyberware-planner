// Lecture minimale d'une banque Wwise (.bnk) pour retrouver les fichiers audio d'un événement.
//
// Chaîne suivie : Événement (type 4) → Actions (type 3, champ idExt = objet visé)
//   → Son (type 2, contient l'id du média = nom du .wem)
//   → ou conteneur (aléatoire, séquence, switch, couches…) dont on cherche les enfants.
//
// Les conteneurs ont un format long et variable selon la version de Wwise. Plutôt que de le
// décoder entièrement, on cherche dans leurs octets les identifiants (u32) d'autres objets connus
// de la banque : les identifiants Wwise sont des hachages 32 bits, les faux positifs sont très rares.

import { readFileSync } from 'node:fs';

const T = { SOUND: 2, ACTION: 3, EVENT: 4 };

export function readBank(path) {
  const buf = readFileSync(path);
  const chunks = {};
  let p = 0;
  while (p + 8 <= buf.length) {
    const tag = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    chunks[tag] = buf.subarray(p + 8, p + 8 + size);
    p += 8 + size;
  }
  const version = chunks.BKHD ? chunks.BKHD.readUInt32LE(0) : null;
  const objects = new Map(); // id -> { type, data }
  if (chunks.HIRC) {
    const h = chunks.HIRC;
    const count = h.readUInt32LE(0);
    let q = 4;
    for (let i = 0; i < count && q + 5 <= h.length; i++) {
      const type = h.readUInt8(q);
      const len = h.readUInt32LE(q + 1);
      const id = h.readUInt32LE(q + 5);
      objects.set(id, { type, data: h.subarray(q + 9, q + 5 + len) });
      q += 5 + len;
    }
  }
  // Médias intégrés à la banque (DIDX : id, offset, taille dans DATA)
  const embedded = new Map();
  if (chunks.DIDX && chunks.DATA) {
    for (let q = 0; q + 12 <= chunks.DIDX.length; q += 12) {
      const id = chunks.DIDX.readUInt32LE(q);
      const off = chunks.DIDX.readUInt32LE(q + 4);
      const size = chunks.DIDX.readUInt32LE(q + 8);
      embedded.set(id, chunks.DATA.subarray(off, off + size));
    }
  }
  return { version, objects, embedded };
}

function readVarint(buf, p) {
  let v = 0, shift = 0, b;
  do { b = buf.readUInt8(p++); v |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
  return [v >>> 0, p];
}

// Actions d'un événement. Le nombre d'actions est un u32 (anciennes versions) ou un entier variable.
function eventActions(bank, data) {
  const tryRead = (useVar) => {
    let n, p;
    if (useVar) [n, p] = readVarint(data, 0); else { n = data.readUInt32LE(0); p = 4; }
    if (p + n * 4 > data.length) return null;
    const ids = [];
    for (let i = 0; i < n; i++) ids.push(data.readUInt32LE(p + i * 4));
    return ids.every((id) => bank.objects.has(id)) ? ids : null;
  };
  return tryRead(true) || tryRead(false) || [];
}

// Id du média d'un objet Son : AkBankSourceData = pluginID u32, streamType u8, sourceID u32, …
function soundMedia(data) {
  return { mediaId: data.readUInt32LE(5), streamType: data.readUInt8(4) };
}

// Conteneurs suivis : 5 = aléatoire/séquence, 6 = switch, 9 = couches.
// (7 = « actor-mixer » : simple dossier de rangement, jamais suivi.)
const CONTAINERS = new Set([5, 6, 9]);
const PARENT_ZONE = 48; // le parent direct (DirectParentID) est écrit au début des paramètres du nœud

// Toutes les feuilles « Son » atteignables depuis un objet.
function collectSounds(bank, id, seen = new Set(), depth = 0) {
  if (seen.has(id) || depth > 8) return [];
  seen.add(id);
  const obj = bank.objects.get(id);
  if (!obj) return [];
  if (obj.type === T.SOUND) return [{ soundId: id, ...soundMedia(obj.data) }];
  if (!CONTAINERS.has(obj.type)) return [];
  const out = [];
  for (let p = 0; p + 4 <= obj.data.length; p++) {
    const ref = obj.data.readUInt32LE(p);
    if (ref === id || !bank.objects.has(ref)) continue;
    const t = bank.objects.get(ref).type;
    // Une référence à un conteneur en tout début d'objet est son parent : on ne remonte pas.
    if (p < PARENT_ZONE && (CONTAINERS.has(t) || t === 7)) continue;
    if (t === T.SOUND || CONTAINERS.has(t)) out.push(...collectSounds(bank, ref, seen, depth + 1));
  }
  return out;
}

// Comment jouer plusieurs médias : 'layers' = ensemble, 'random' = un au hasard, 'switch' = selon le contexte.
export function eventMode(bank, eventId) {
  const ev = bank.objects.get(eventId);
  if (!ev) return null;
  const targets = eventActions(bank, ev.data)
    .map((id) => bank.objects.get(id))
    .filter((a) => a && a.type === T.ACTION && a.data.readUInt16LE(0) === 0x0403)
    .map((a) => bank.objects.get(a.data.readUInt32LE(2)))
    .filter(Boolean);
  if (targets.length > 1) return 'layers'; // plusieurs actions « Play » : tout démarre en même temps
  if (!targets.length) return null;
  return { 2: 'single', 5: 'random', 6: 'switch', 9: 'layers' }[targets[0].type] || 'unknown';
}

// Pour un événement : liste des médias joués (souvent plusieurs variantes aléatoires).
export function eventMedia(bank, eventId) {
  const ev = bank.objects.get(eventId);
  if (!ev || ev.type !== T.EVENT) return null;
  const result = [];
  for (const actionId of eventActions(bank, ev.data)) {
    const action = bank.objects.get(actionId);
    if (!action || action.type !== T.ACTION) continue;
    const actionType = action.data.readUInt16LE(0);
    const target = action.data.readUInt32LE(2);
    // 0x0403 = Play ; on ignore Stop, SetVolume, etc.
    if (actionType !== 0x0403) continue;
    result.push(...collectSounds(bank, target));
  }
  const uniq = new Map(result.map((r) => [r.mediaId, r]));
  return [...uniq.values()];
}
