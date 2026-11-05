// Charge tous les .tweak (base + ep1) et résout l'héritage entre records.

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseTweakFile } from './tweakParser.mjs';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.tweak')) out.push(full);
  }
  return out;
}

export class TweakDb {
  constructor(tweakRoot) {
    this.root = tweakRoot;
    this.records = new Map();   // id complet -> record brut
    this.byName = new Map();    // nom court -> [ids]
    this.errors = [];
    this._resolved = new Map();
  }

  load() {
    for (const file of walk(this.root)) {
      const rel = relative(this.root, file).split(sep).join('/');
      try {
        const { records } = parseTweakFile(file, rel);
        for (const r of records) {
          if (this.records.has(r.id)) r.overrides = this.records.get(r.id).source;
          this.records.set(r.id, r);
          if (!this.byName.has(r.name)) this.byName.set(r.name, []);
          this.byName.get(r.name).push(r.id);
        }
      } catch (e) {
        this.errors.push(e.message);
      }
    }
    return this;
  }

  // Trouve l'id complet d'un parent : "Foo" dans le même package, ou "Pkg.Foo".
  resolveId(ref, fromPackage) {
    if (!ref) return null;
    if (this.records.has(ref)) return ref;
    if (fromPackage && this.records.has(`${fromPackage}.${ref}`)) return `${fromPackage}.${ref}`;
    const ids = this.byName.get(ref);
    if (ids && ids.length === 1) return ids[0];
    return null; // type de base RTDB (ex. "Quality", "CyberwareArea") : pas un record
  }

  get(id) { return this.records.get(id); }

  // Retourne les champs effectifs d'un record, héritage appliqué.
  // "+=" ajoute aux tableaux hérités, "=" remplace.
  resolve(id) {
    if (this._resolved.has(id)) return this._resolved.get(id);
    const rec = this.records.get(id);
    if (!rec) return null;
    const parentId = this.resolveId(rec.parent, rec.package);
    const base = parentId ? this.resolve(parentId) : { fields: {}, chain: [], rtdbType: rec.parent };
    const fields = { ...base.fields };
    for (const [k, entry] of Object.entries(rec.fields || {})) {
      const entries = entry.multi || [entry];
      for (const e of entries) {
        const prev = fields[k];
        if (e.op === '+=' && prev && Array.isArray(prev.value) && Array.isArray(e.value)) {
          fields[k] = { value: [...prev.value, ...e.value], from: id };
        } else if (e.op === '-=' && prev && Array.isArray(prev.value) && Array.isArray(e.value)) {
          const rm = new Set(e.value.map((v) => JSON.stringify(v)));
          fields[k] = { value: prev.value.filter((v) => !rm.has(JSON.stringify(v))), from: id };
        } else {
          fields[k] = { value: e.value, from: id };
        }
      }
    }
    const out = {
      id,
      fields,
      chain: [id, ...base.chain],
      rtdbType: base.rtdbType,
      tags: rec.tags,
      source: rec.source,
    };
    this._resolved.set(id, out);
    return out;
  }

  // Valeur simple d'un champ résolu.
  val(id, field) {
    const r = this.resolve(id);
    return r && r.fields[field] ? r.fields[field].value : undefined;
  }

  isA(id, ancestorName) {
    const r = this.resolve(id);
    return !!r && (r.chain.some((c) => c.endsWith('.' + ancestorName)) || r.rtdbType === ancestorName);
  }
}
