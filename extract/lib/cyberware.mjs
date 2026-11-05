// Construit les objets JSON « cyberware » à partir de la TweakDB résolue.
// Règle : on ne calcule une valeur que si tous ses ingrédients viennent de l'objet lui-même
// (palier, « + ») ou d'une courbe du jeu évaluée sur le palier. Tout ce qui dépend du joueur
// (attributs, perks) reste une formule (champ dependsOn).

import { resolveLoc, fillPlaceholders } from './loc.mjs';

export const QUALITY_ORDER = ['Common', 'CommonPlus', 'Uncommon', 'UncommonPlus', 'Rare', 'RarePlus',
  'Epic', 'EpicPlus', 'Legendary', 'LegendaryPlus', 'LegendaryPlusPlus'];

const strip = (s, prefix) => (typeof s === 'string' && s.startsWith(prefix) ? s.slice(prefix.length) : s);

// Stats « propres à l'implant » calculables depuis le palier.
const ITEM_STATS = ['Quality', 'IsItemPlus', 'StaticModifierMultiplier', 'QualityRequirementMetFlag'];

export class CyberwareBuilder {
  // curves : instance de Curves (facultatif) ; vendors : Map record -> [{ vendor, prereqs }]
  constructor(db, loc, curves = null, vendors = new Map()) {
    this.db = db;
    this.loc = loc;
    this.curves = curves;
    this.vendors = vendors;
    this.locKeysUsed = new Set();
    this.qualities = this.buildQualities();
  }

  loc_(value) {
    const r = resolveLoc(this.loc, value);
    if (r && r.key) this.locKeysUsed.add(r.key.replace('LocKey#', ''));
    return r;
  }

  // Valeurs numériques des paliers, lues dans items/quality/quality.tweak.
  buildQualities() {
    const out = {};
    for (const name of [...QUALITY_ORDER, 'Iconic']) {
      const id = `Quality.${name}`;
      const r = this.db.resolve(id);
      if (!r) continue;
      let qualityStat = 0, isItemPlus = 0;
      for (const m of r.fields.statModifiers ? r.fields.statModifiers.value : []) {
        const mod = typeof m === 'string' ? this.inlineOf(m) : m;
        if (!mod) continue;
        const stat = mod.fields.statType && mod.fields.statType.value;
        const v = mod.fields.value && mod.fields.value.value;
        if (stat === 'BaseStats.Quality') qualityStat += v;
        if (stat === 'BaseStats.IsItemPlus') isItemPlus += v;
      }
      out[name] = { id, value: r.fields.value.value, qualityStat, isItemPlus, source: r.source };
    }
    return out;
  }

  // Un record nommé (ex. "Quality.PlusModifier") vu comme un record inline.
  inlineOf(id) {
    const r = this.db.resolve(id);
    if (!r) return null;
    return { $inline: true, type: r.rtdbType, fields: r.fields, ref: id, source: r.source };
  }

  // Champs effectifs d'un record inline « { … } : Modèle » : ceux du modèle (record nommé), puis ceux de l'inline.
  // « += » ajoute au tableau du modèle (ex. HealthMonitorUIData : floatValues [50] += [2] → [50, 2]).
  mergedInline(v) {
    if (!v || !v.$inline) return v;
    const tplId = v.type && (this.db.resolveId(v.type) || this.db.resolveId(v.type, 'Items') || this.db.resolveId(v.type, 'BaseStats'));
    if (!tplId) return v;
    const fields = { ...this.db.resolve(tplId).fields };
    for (const [k, e] of Object.entries(v.fields)) {
      const prev = fields[k];
      fields[k] = e.op === '+=' && prev && Array.isArray(prev.value) && Array.isArray(e.value) ? { ...e, value: [...prev.value, ...e.value] } : e;
    }
    return { ...v, fields, template: tplId };
  }

  // Contexte de calcul d'un palier : valeurs des stats « propres à l'implant ».
  // StaticModifierMultiplier et QualityRequirementMetFlag sont définis dans
  // Items.CyberwareStatsShardStatic (items/cyberware/base_values.tweak).
  tierContext(q) {
    const ctx = { Quality: q.qualityStat, IsItemPlus: q.isItemPlus, QualityRequirementMetFlag: q.qualityStat };
    if (this.curves) {
      const m = this.curves.eval('cyberware_curves', 'quality_to_static_modifier_multiplier', q.qualityStat);
      if (m !== undefined) ctx.StaticModifierMultiplier = Math.round(m * 1e6) / 1e6;
    }
    return ctx;
  }

  // Normalise un modificateur de stat (inline ou référence) en objet lisible.
  // defaultRef : objet visé quand refObject est absent ("Self" = l'implant ;
  // "Owner" = le joueur, pour les stats appliquées par un package OnEquip).
  modifier(m, ctx, defaultRef = 'Self') {
    const mod = typeof m === 'string' ? this.inlineOf(m) : this.mergedInline(m);
    if (!mod) return { unresolved: m };
    const f = (k) => (mod.fields[k] ? mod.fields[k].value : undefined);
    const out = {
      stat: strip(f('statType'), 'BaseStats.'),
      modifierType: f('modifierType'),
      kind: mod.type || null,
    };
    if (mod.ref) out.ref = mod.ref;
    const value = f('value');
    if (value !== undefined) out.value = value;
    const refStat = strip(f('refStat'), 'BaseStats.');
    if (refStat) {
      out.refStat = refStat;
      out.refObject = f('refObject') || defaultRef;
      if (f('opSymbol')) out.op = f('opSymbol');
    }
    if (f('id')) out.curve = { set: f('id'), column: f('column') };
    if (f('min') !== undefined) { out.min = f('min'); out.max = f('max'); }

    const local = refStat && ['Self', 'Item', 'Root'].includes(out.refObject) && ITEM_STATS.includes(refStat);
    // Les modificateurs non additifs (Multiplier, AdditiveMultiplier…) ne sont pas calculés :
    // leur règle de combinaison sera établie à l'étape 2 (scripts du jeu).
    if (ctx && refStat && out.modifierType !== 'Additive') {
      out.dependsOn = `règle de combinaison ${out.modifierType} (étape 2) ; ${out.refObject}.${refStat}`;
      return out;
    }
    if (ctx) {
      if (out.curve && local && this.curves) {
        const v = this.curves.eval(out.curve.set, out.curve.column, ctx[refStat]);
        if (v !== undefined) out.computed = Math.round(v * 1e6) / 1e6;
      } else if (!out.curve && !refStat && value !== undefined && out.min === undefined) {
        out.computed = value;
      } else if (!out.curve && local && out.op === '*' && ctx[refStat] !== undefined) {
        out.computed = Math.round(value * ctx[refStat] * 1e6) / 1e6;
      }
    }
    if (out.computed === undefined && (out.curve || refStat)) {
      out.dependsOn = out.curve ? `courbe ${out.curve.set}/${out.curve.column}(${out.refObject || 'Self'}.${refStat})`
        : `${out.refObject}.${refStat}`;
    }
    return out;
  }

  // Coût en capacité : lu dans le record de variante (Variants.HumanityXXCost...).
  capacityCost(variantIds) {
    return (variantIds || []).map((vid) => {
      const r = this.db.resolve(vid);
      if (!r) return { variant: vid, unresolved: true };
      const mods = (r.fields.statModifiers ? r.fields.statModifiers.value : [])
        .map((m) => this.modifier(m, null))
        .filter((m) => m.stat === 'HumanityAllocated');
      const base = mods.filter((m) => !m.refStat).reduce((s, m) => s + m.value, 0);
      const adjustments = mods.filter((m) => m.refStat).map((m) => ({ refStat: m.refStat, refObject: m.refObject, value: m.value }));
      return { variant: vid, base, adjustments, source: r.source };
    });
  }

  // Un « package » OnEquip : effets + texte d'interface avec les valeurs injectées.
  logicPackage(p) {
    const pkg = typeof p === 'string' ? this.inlineOf(p) : p;
    if (!pkg) return { unresolved: p };
    const f = (k) => (pkg.fields[k] ? pkg.fields[k].value : undefined);
    const ui = f('UIData');
    let uiFields = {};
    if (typeof ui === 'string') uiFields = (this.inlineOf(ui) || { fields: {} }).fields;
    else if (ui) {
      // UIData inline peut hériter d'un record (ex. ResistancesBoosterUIData) via son type, avec « += »
      uiFields = this.mergedInline(ui).fields;
    }
    const u = (k) => (uiFields[k] ? uiFields[k].value : undefined);
    const vals = {
      floatValues: u('floatValues') || [], intValues: u('intValues') || [],
      nameValues: u('nameValues') || [], statValues: (u('stats') || []).map((s) => strip(s, 'BaseStats.')),
    };
    const desc = this.loc_(u('localizedDescription'));
    const name = this.loc_(u('localizedName'));
    const out = {};
    if (pkg.ref) out.ref = pkg.ref;
    if (name && name.key) out.name = name;
    if (desc && desc.key) {
      out.description = { key: desc.key };
      for (const lang of Object.keys(this.loc)) {
        const filled = fillPlaceholders(desc[lang], vals);
        out.description[lang] = filled ? filled.plain : null;
        out.description[`${lang}_rich`] = filled ? filled.rich : null;
        if (filled && filled.missing.length) out.description.missingValues = filled.missing;
      }
    }
    if (u('iconPath')) out.icon = u('iconPath');
    out.uiValues = Object.fromEntries(Object.entries(vals).filter(([, v]) => v.length));
    const stats = f('stats');
    if (stats) out.stats = stats.map((m) => this.modifier(m, null, 'Owner'));
    const effectors = f('effectors');
    if (effectors) out.effectors = effectors.map((e) => this.effector(e));
    return out;
  }

  effector(e) {
    const eff = typeof e === 'string' ? this.inlineOf(e) : e;
    if (!eff) return { unresolved: e };
    const out = { type: eff.type || (eff.fields.effectorClassName && eff.fields.effectorClassName.value) || null };
    if (eff.ref) out.ref = eff.ref;
    // On garde les paramètres simples (nombres, chaînes) ; les sous-structures sont résumées.
    const params = {};
    for (const [k, v] of Object.entries(eff.fields)) {
      const val = v.value;
      if (k === 'prereqRecord') params[k] = typeof val === 'string' ? val : (val && val.type) || 'inline';
      else if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') params[k] = val;
    }
    out.params = params;
    return out;
  }

  // Un palier = un record d'objet (ex. Items.AdvancedPainReductorEpic).
  tier(id, { withSide = true } = {}) {
    const r = this.db.resolve(id);
    const f = (k) => (r.fields[k] ? r.fields[k].value : undefined);
    const qName = strip(f('quality'), 'Quality.');
    const q = this.qualities[qName] || {};
    const ctx = this.tierContext(q);
    const mods = (f('statModifiers') || []).map((m) => this.modifier(m, ctx));
    const totals = {};
    for (const m of mods) {
      if (m.computed === undefined || !m.stat || m.modifierType !== 'Additive') continue;
      totals[m.stat] = Math.round(((totals[m.stat] || 0) + m.computed) * 1e6) / 1e6;
    }
    const shardPreset = (f('slotPartListPreset') || []).find((x) => typeof x === 'object' && x.fields && x.fields.itemPartPreset);
    const shardId = shardPreset ? shardPreset.fields.itemPartPreset.value : null;
    const shard = shardId ? this.db.resolve(shardId) : null;
    // Prérequis d'équipement : type + champs simples (ex. perkType, level, valueToCheck)
    const prereqs = (f('equipPrereqs') || []).map((p) => {
      if (typeof p === 'string') return { ref: p };
      const out = { type: p.type };
      for (const [k, v] of Object.entries(p.fields)) if (['string', 'number', 'boolean'].includes(typeof v.value)) out[k] = v.value;
      if (out.valueToCheck !== undefined) out.value = out.valueToCheck;
      return out;
    });
    const tags = [...(this.db.get(id).tags || [])];
    const out = {
      record: id,
      // nom et description propres au palier (certains changent : Berserk Mk.1 → Mk.3…)
      name: this.loc_(f('displayName')),
      description: this.loc_(f('localizedDescription')),
      quality: qName,
      qualityValue: q.value,
      qualityStat: q.qualityStat,
      isItemPlus: q.isItemPlus,
      dlc: tags.includes('EP1') ? 'EP1' : null,
      capacityCost: this.capacityCost(f('variants')),
      statModifiers: mods,
      computedStats: totals,
      // Groupes de stats (armes : dégâts, maniement…). Évalués par le moteur de stats du site.
      statModifierGroups: (f('statModifierGroups') || []).filter((g) => typeof g === 'string').map((g) => ({
        ref: g,
        modifiers: (this.db.val(g, 'statModifiers') || []).map((m) => this.modifier(m, ctx)),
      })),
      onEquip: (f('OnEquip') || []).map((p) => this.logicPackage(p)),
      secondaryStats: shard ? {
        record: shardId,
        staticModifierMultiplier: ctx.StaticModifierMultiplier,
        modifiers: (shard.fields.statModifiers ? shard.fields.statModifiers.value : [])
          .filter((m) => typeof m === 'string' && m.startsWith('Modifiers.'))
          .map((m) => this.modifier(m, ctx)),
      } : null,
      equipPrereqs: prereqs,
      // valeur par défaut du schéma : 1 (confirmé par la base compilée du jeu, ex. tatouages)
      upgradeCostMult: f('upgradeCostMult') ?? 1,
      nextUpgradeItem: f('nextUpgradeItem') || null,
      price: (f('buyPrice') || []).map((p) => (typeof p === 'string' ? p : this.modifier(p, ctx))),
      vendors: this.vendors.get(id) || [],
      icon: f('iconPath'),
      source: r.source,
      inheritance: r.chain,
    };
    const side = f('sideUpgradeItem');
    if (side && withSide && this.db.get(side)) {
      const s = this.tier(side, { withSide: false });
      delete s.inheritance;
      out.sideVariant = s;
    }
    return out;
  }

  // Une famille = des records de paliers (déjà regroupés), triés par valeur de qualité.
  family(ids) {
    const first = this.db.resolve(ids[0]);
    const v = (k) => (first.fields[k] ? first.fields[k].value : undefined);
    // Plusieurs records peuvent avoir le même palier (ex. version vendue + version de butin).
    // On garde comme palier principal celui vendu par un charcudoc, sinon le premier de la chaîne
    // principale ; les autres vont dans « alternates » (gardés pour traçabilité).
    const byQuality = new Map();
    ids.forEach((id, order) => {
      const t = this.tier(id);
      t._order = order;
      if (!byQuality.has(t.quality)) byQuality.set(t.quality, []);
      byQuality.get(t.quality).push(t);
    });
    const dup = [];
    const tiers = [...byQuality.values()].map((list) => {
      list.sort((a, b) => (b.vendors.length > 0) - (a.vendors.length > 0) || a._order - b._order);
      const [main, ...rest] = list;
      if (rest.length) {
        dup.push(main.quality);
        main.alternates = rest.map((t) => ({ record: t.record, vendors: t.vendors, computedStats: t.computedStats, source: t.source }));
      }
      return main;
    }).sort((a, b) => (a.qualityValue ?? 99) - (b.qualityValue ?? 99));
    for (const t of tiers) delete t._order;
    return {
      id: ids[0].replace(/^Items\./, ''),
      friendlyName: v('friendlyName') || null,
      cyberwareType: v('cyberwareType') || null,
      iconic: /Iconic/.test(ids[0]),
      name: this.loc_(v('displayName')),
      description: this.loc_(v('localizedDescription')),
      area: strip(v('equipArea'), 'EquipmentArea.'),
      icon: v('iconPath'),
      dlc: tiers.every((t) => t.dlc === 'EP1') ? 'EP1' : null,
      soldByRipperdocs: tiers.some((t) => t.vendors.length > 0),
      duplicateQualities: dup.length ? [...new Set(dup)] : undefined,
      tiers,
    };
  }
}
