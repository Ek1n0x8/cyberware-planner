// Perks (système 2.x : records NewPerks.*) qui touchent au cyberware (perks.json).
// Un perk est retenu si au moins une de ces raisons est vraie (listées dans « reasons ») :
//  - il est cité par les données cyberware (déblocage de slot, stat de perk utilisée par un implant) ;
//  - il modifie une stat de capacité / cyberware (Humanity, CyberwareTinkererStat, ...) ;
//  - son texte (FR ou EN) parle de cyberware.

import { fillPlaceholders } from './loc.mjs';

const CW_STATS = new Set(['Humanity', 'CyberwareTinkererStat', 'SecondaryModifiersAdditiveMultiplier',
  'DriverUpdatePerkFlag', 'CyberwareStatsMultiplier']);
const TEXT_RE = /cyberware|cyberimplant|charcudoc|ripperdoc|capacit[ée] de cyberware/i;

// Parcourt une valeur et rassemble tous les modificateurs de stat (inline ou référencés).
function collectModifiers(builder, value, out = [], seen = new Set()) {
  if (Array.isArray(value)) { for (const v of value) collectModifiers(builder, v, out, seen); return out; }
  if (typeof value === 'string') {
    if (seen.has(value) || !/^(Perks|NewPerks|Effectors|Modifiers)\./.test(value)) return out;
    seen.add(value);
    const r = builder.inlineOf(value);
    if (r) collectModifiers(builder, r, out, seen);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  if (value.$inline) {
    if (value.fields.statType) out.push(builder.modifier(value, null, 'Owner'));
    for (const [, f] of Object.entries(value.fields)) collectModifiers(builder, f.value, out, seen);
  }
  return out;
}

export function buildPerks(db, builder, referencedPerks, referencedStats) {
  const perks = [];
  for (const id of db.records.keys()) {
    if (!db.isA(id, 'NewPerk')) continue;
    const r = db.resolve(id);
    const f = (k) => (r.fields[k] ? r.fields[k].value : undefined);
    const enumName = f('enumName');
    if (!enumName) continue;
    const name = builder.loc_(f('loc_name_key'));
    const descRaw = builder.loc_(f('loc_desc_key'));
    const ui = f('uiData');
    const vals = ui && ui.fields ? {
      floatValues: ui.fields.floatValues ? ui.fields.floatValues.value : [],
      intValues: ui.fields.intValues ? ui.fields.intValues.value : [],
    } : {};
    const description = descRaw && descRaw.key ? { key: descRaw.key } : null;
    if (description) for (const lang of Object.keys(builder.loc)) {
      const filled = fillPlaceholders(descRaw[lang], vals);
      description[lang] = filled ? filled.plain : null;
    }
    // Chaque niveau peut avoir sa propre description (ex. Tech_Central_Milestone_2)
    const levels = (f('levels') || []).map((lvl, i) => {
      const lf = (lvl && lvl.fields) || {};
      const out = { level: i + 1, modifiers: collectModifiers(builder, lvl) };
      const key = lf.loc_desc_key ? builder.loc_(lf.loc_desc_key.value) : null;
      if (key && key.key) {
        const lui = lf.uiData && lf.uiData.value.fields;
        const lvals = lui ? { floatValues: lui.floatValues ? lui.floatValues.value : [], intValues: lui.intValues ? lui.intValues.value : [] } : {};
        out.description = { key: key.key };
        for (const lang of Object.keys(builder.loc)) {
          const filled = fillPlaceholders(key[lang], lvals);
          out.description[lang] = filled ? filled.plain : null;
        }
      }
      return out;
    });
    const reasons = [];
    if (referencedPerks.has(enumName)) reasons.push(`cité par les données cyberware : ${[...referencedPerks.get(enumName)].join(', ')}`);
    const stats = new Set(levels.flatMap((l) => l.modifiers.map((m) => m.stat)));
    for (const s of stats) {
      if (CW_STATS.has(s)) reasons.push(`modifie BaseStats.${s}`);
      else if (referencedStats.has(s)) reasons.push(`modifie BaseStats.${s} (utilisée par des implants)`);
    }
    if (TEXT_RE.test(`${description && description.fr} ${description && description.en} ${f('enumComment') || ''}`)) {
      reasons.push('texte mentionnant le cyberware');
    }
    if (!reasons.length) continue;
    perks.push({
      id: enumName,
      record: id,
      name,
      description,
      comment: f('enumComment') || undefined,
      attribute: f('attribute') || null,
      tier: f('tier') || null,
      category: f('category') || null,
      requiresPerks: f('requiresPerks') || [],
      icon: f('perkIcon') || null,
      reasons,
      levels,
      source: r.source,
    });
  }
  return perks.sort((a, b) => a.id.localeCompare(b.id));
}
