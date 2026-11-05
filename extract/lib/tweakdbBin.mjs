// Lecture de la base compilée du jeu (r6/cache/tweakdb_ep1.bin) : c'est elle que le jeu charge.
// Sert à vérifier que nos valeurs (lues dans les sources .tweak) sont identiques à celles du jeu.
// En-tête : magic, versions, sommes, puis offsets des sections. Section « flats » : table des types
// (hash FNV-1a 64 du nom du type, nb de valeurs, nb de clés, offset), puis pour chaque type ses valeurs et ses clés.
// Une clé = TweakDBID (CRC32 du nom complet + longueur du nom) → index de valeur.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gamePaths } from '../config.mjs';

export function fnv1a64(str) {
  let h = 0xcbf29ce484222325n;
  for (const c of Buffer.from(str, 'utf8')) { h ^= BigInt(c); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h;
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(str) {
  let c = 0xffffffff;
  for (const b of Buffer.from(str, 'utf8')) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// TweakDBID : 32 bits de CRC32 + 8 bits de longueur (le reste à 0 dans le fichier)
export const tdbid = (name) => (BigInt(Buffer.byteLength(name, 'utf8')) << 32n) | BigInt(crc32(name));

const TYPE_NAMES = ['Float', 'Int32', 'Bool', 'String', 'CName', 'TweakDBID', 'LocalizationString', 'gamedataLocKeyWrapper',
  'Vector2', 'Vector3', 'Quaternion', 'EulerAngles', 'raRef:CResource', 'Uint32', 'Uint64', 'Int64', 'Color'];

export class CompiledTweakDb {
  constructor(file = join(gamePaths().game, 'r6', 'cache', 'tweakdb_ep1.bin')) {
    this.b = readFileSync(file);
    const names = new Map();
    for (const n of TYPE_NAMES) { names.set(fnv1a64(n), n); names.set(fnv1a64(`array:${n}`), `array:${n}`); }
    const b = this.b;
    const flatsOffset = b.readUInt32LE(16);
    const typeCount = b.readUInt32LE(flatsOffset);
    this.types = [];
    for (let i = 0; i < typeCount; i++) {
      const o = flatsOffset + 4 + i * 20;
      const hash = b.readBigUInt64LE(o);
      this.types.push({ hash, name: names.get(hash) || `?${hash.toString(16)}`, values: b.readUInt32LE(o + 8), keys: b.readUInt32LE(o + 12), offset: b.readUInt32LE(o + 16) });
    }
    // Index : TweakDBID (BigInt) → { type, value }
    this.flats = new Map();
    for (const t of this.types) this.readType(t);
  }

  // Chaîne préfixée par sa longueur (CString RED4) : 1er octet = bit 7 « texte 8 bits », bit 6 « suite »,
  // 6 bits de longueur ; octets suivants = 7 bits de longueur + bit 7 « suite »
  readStr(o) {
    const b = this.b;
    const x = b[o++];
    const ansi = x & 0x80;
    let len = x & 0x3f;
    if (x & 0x40) {
      let shift = 6, y;
      do { y = b[o++]; len |= (y & 0x7f) << shift; shift += 7; } while (y & 0x80);
    }
    if (ansi) return [b.toString('utf8', o, o + len), o + len];
    return [b.toString('utf16le', o, o + len * 2), o + len * 2];
  }

  readValue(type, o) {
    const b = this.b;
    if (type.startsWith('array:')) {
      // longueur compacte (même codage que la longueur des CString, sans le bit « texte 8 bits »)
      const x = b[o++];
      let n = x & 0x3f;
      if (x & 0x40) { let shift = 6, y; do { y = b[o++]; n |= (y & 0x7f) << shift; shift += 7; } while (y & 0x80); }
      const out = [];
      for (let i = 0; i < n; i++) { const [v, no] = this.readValue(type.slice(6), o); out.push(v); o = no; }
      return [out, o];
    }
    switch (type) {
      case 'Float': return [b.readFloatLE(o), o + 4];
      case 'Int32': return [b.readInt32LE(o), o + 4];
      case 'Bool': return [!!b[o], o + 1];
      case 'TweakDBID': return [b.readBigUInt64LE(o) & 0xffffffffffn, o + 8];
      case 'gamedataLocKeyWrapper': return [b.readBigUInt64LE(o), o + 8];
      case 'raRef:CResource': return [b.readBigUInt64LE(o), o + 8];
      case 'String': case 'CName': return this.readStr(o);
      case 'Vector2': return [[b.readFloatLE(o), b.readFloatLE(o + 4)], o + 8];
      case 'Vector3': case 'EulerAngles': return [[b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8)], o + 12];
      case 'Quaternion': return [[b.readFloatLE(o), b.readFloatLE(o + 4), b.readFloatLE(o + 8), b.readFloatLE(o + 12)], o + 16];
      case 'Color': return [b.readUInt32LE(o), o + 4];
      default: throw new Error(`type inconnu ${type}`);
    }
  }

  readType(t) {
    const b = this.b;
    let o = t.offset;
    const n = b.readUInt32LE(o); o += 4;
    const values = new Array(n);
    for (let i = 0; i < n; i++) { const [v, no] = this.readValue(t.name, o); values[i] = v; o = no; }
    const k = b.readUInt32LE(o); o += 4;
    if (k !== t.keys) throw new Error(`${t.name} : ${k} clés lues, ${t.keys} attendues (format mal lu)`);
    for (let i = 0; i < k; i++) {
      const id = b.readBigUInt64LE(o) & 0xffffffffffn;
      const idx = b.readUInt32LE(o + 8);
      this.flats.set(id, { type: t.name, value: values[idx] });
      o += 12;
    }
  }

  // Valeur d'un champ : get('Items.X', 'quality')
  get(record, field) { const f = this.flats.get(tdbid(`${record}.${field}`)); return f ? f.value : undefined; }
  has(record, field) { return this.flats.has(tdbid(`${record}.${field}`)); }
}
