// Zones du corps, slots et sources de capacité de cyberware (slots.json).

const strip = (s, prefix) => (typeof s === 'string' && s.startsWith(prefix) ? s.slice(prefix.length) : s);

function describeUnlock(p) {
  if (!p) return null;
  const f = (k) => (p.fields[k] ? p.fields[k].value : undefined);
  if (f('prereqClassName') === 'AlwaysTruePrereq') return null; // slot toujours disponible
  if (p.type === 'PlayerIsNewPerkBoughtPrereq') return { type: 'perk', perk: f('perkType'), level: f('level') };
  if (p.type === 'FactValuePrereq') return { type: 'fact', fact: f('fact'), value: f('value'), comparison: f('comparisonType') };
  return { type: p.type, raw: Object.fromEntries(Object.entries(p.fields).map(([k, v]) => [k, v.value])) };
}

export function buildSlots(db, builder, curves, cyberwareAreas = new Set()) {
  const areas = [];
  for (const id of db.records.keys()) {
    if (!id.startsWith('EquipmentArea.') || !db.isA(id, 'CyberwareArea')) continue;
    const r = db.resolve(id);
    const f = (k) => (r.fields[k] ? r.fields[k].value : undefined);
    const used = cyberwareAreas.has(id.replace('EquipmentArea.', ''));
    const slots = (f('equipSlots') || []).map((s, index) => {
      const slot = typeof s === 'string' ? builder.inlineOf(s) : s;
      const sf = (k) => (slot && slot.fields[k] ? slot.fields[k].value : undefined);
      const out = { index };
      if (typeof s === 'string') out.ref = s;
      const unlock = sf('unlockPrereqRecord');
      const desc = unlock ? describeUnlock(typeof unlock === 'string' ? builder.inlineOf(unlock) : unlock) : null;
      if (desc) out.unlock = desc;
      if (sf('visibleWhenLocked') !== undefined) out.visibleWhenLocked = sf('visibleWhenLocked');
      const ins = sf('OnInsertion');
      if (ins) out.onInsertion = ins.map((p) => builder.logicPackage(p));
      return out;
    });
    areas.push({
      id: f('enumName') || id.replace('EquipmentArea.', ''),
      record: id,
      name: builder.loc_(f('localizedName')),
      comment: f('enumComment') || undefined,
      // false : aucune famille d'implant 2.x n'utilise cette zone (ex. bras cosmétiques du Glamdoc)
      hasCyberware: used,
      slots,
      source: r.source,
    });
  }

  // Capacité (stat BaseStats.Humanity) : modificateurs de base du joueur
  const humanity = [];
  for (const id of db.records.keys()) {
    const rec = db.get(id);
    if (!rec.source.file.endsWith('characters/player/player_base_stats.tweak')) continue;
    const mods = db.val(id, 'statModifiers') || [];
    for (const m of mods) {
      const mod = builder.modifier(m, null);
      if (['Humanity', 'CyberwareTinkererStat'].includes(mod.stat)) humanity.push({ record: id, ...mod });
    }
  }
  const curve = (set, col) => {
    const c = curves && curves.get(set, col);
    return c ? { set, column: col, ...c } : null;
  };
  return {
    areas,
    capacity: {
      note: 'Capacité = stat BaseStats.Humanity. Le calcul exact (et le dépassement) sera vérifié à l’étape 2 dans les scripts.',
      playerBase: humanity,
      techSkillPassive: curve('technical_ability_skill_passives', 'tech_ability_skill_to_humanity'),
      capacityBoosterCurve: curve('cyberware_curves', 'capacity_booster_to_humanity'),
      powerLevelToHumanityCurve: curve('cyberware_curves', 'power_level_to_humanity'),
    },
  };
}
