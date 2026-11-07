// Prépare les données du site (version allégée de data/*.json) et copie les assets dans site/.
// À relancer après extract-all.mjs et extract-assets.mjs.
//
//   node extract/build-site-data.mjs

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TweakDb } from './lib/tweakDb.mjs';
import { extractLocalization, loadLocTables, resolveLoc, LANGS } from './lib/loc.mjs';
import { extractCurves, Curves } from './lib/curves.mjs';
import { gamePaths } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const SITE = join(ROOT, 'site');
const load = (n) => JSON.parse(readFileSync(join(DATA, n), 'utf8'));

const { meta, qualities } = load('cyberware.json');
let { cyberware } = load('cyberware.json');
const slots = load('slots.json');
const { perks } = load('perks.json');
const { icons } = load('icons.json');
const { sounds } = load('sounds.json');

const db = new TweakDb(gamePaths().tweaks).load();
const loc = loadLocTables(extractLocalization());
const curves = new Curves(extractCurves());
// Texte du jeu : FR / EN dans game.json (fr_male / en_male quand le jeu a une variante pour V homme).
// Les autres langues vont dans site/data/lang/<langue>.json : tableau indexé par « i » ([texte] ou [texte, variante V homme]).
const EXTRA_LANGS = Object.keys(LANGS).filter((l) => l !== 'fr' && l !== 'en');
const overlay = Object.fromEntries(EXTRA_LANGS.map((l) => [l, []]));
let textIndex = 0;
const txt = (o, suffix = '') => {
  if (!o || !(o.fr || o.en)) return null;
  // texte retiré par le jeu (« !OBSOLETE ») : non affiché
  if (/^!OBSOLETE/i.test(o.en || '')) return null;
  const out = { fr: o.fr && o.fr + suffix, en: o.en && o.en + suffix };
  if (o.fr_male) out.fr_male = o.fr_male + suffix;
  if (o.en_male) out.en_male = o.en_male + suffix;
  if (EXTRA_LANGS.some((l) => o[l])) {
    out.i = textIndex++;
    for (const l of EXTRA_LANGS) if (o[l]) overlay[l][out.i] = o[`${l}_male`] ? [o[l] + suffix, o[`${l}_male`] + suffix] : o[l] + suffix;
  }
  return out;
};

// Identifiant court et stable d'une famille (pour les liens de partage) : FNV-1a 32 bits en base 36
const shortKey = (s) => {
  let h = 0x811c9dc5;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
};

// --- Noms des stats (records BaseStats.*) ------------------------------------
const statNames = {};
const statName = (stat) => {
  if (!stat) return null;
  if (!(stat in statNames)) {
    const id = `BaseStats.${stat}`;
    const r = resolveLoc(loc, db.val(id, 'localizedName'));
    // Règles d'affichage lues dans le record de la stat (tweaks/stats/*.tweak)
    const fmt = {};
    if (db.val(id, 'displayPercent')) fmt.pct = 1;
    if (db.val(id, 'multiplyBy100InText')) fmt.x100 = 1;
    if (db.val(id, 'displayPlus')) fmt.plus = 1;
    if (db.val(id, 'decimalPlaces') !== undefined) fmt.dp = db.val(id, 'decimalPlaces');
    statNames[stat] = r && r.key && (r.fr || r.en) ? { ...txt(r), ...fmt } : null;
  }
  return statNames[stat];
};

// --- Stats secondaires : « …ModifierHelper » → vraie stat ------------------
// tweaks/items/cyberware/variants/modifier_groups.tweak, TransferCyberwareModifiersToItem
const helperToStat = {};
for (const m of db.val('ModifierGroups.TransferCyberwareModifiersToItem', 'statModifiers') || []) {
  if (!m || !m.fields || !m.fields.refStat) continue;
  helperToStat[m.fields.refStat.value.replace('BaseStats.', '')] = m.fields.statType.value.replace('BaseStats.', '');
}
// ItemArmor devient Armor sur l'implant (Items.ItemArmorToArmor)
const finalStat = (s) => (s === 'ItemArmor' ? 'Armor' : s);

const HIDDEN_STATS = new Set(['AttunementHelper', 'AttunementHelper2', 'AttunementHelper3', 'AttunementHelper4',
  'IsItemIconic', 'Quality', 'IsItemPlus', 'EffectiveTier', 'PowerLevel', 'ItemPlusDPS', 'WasItemUpgraded', 'Protection']);

function slimSecondary(t) {
  if (!t.secondaryStats) return [];
  const byHelper = new Map();
  for (const m of t.secondaryStats.modifiers) {
    if (!byHelper.has(m.stat)) byHelper.set(m.stat, { helper: m.stat });
    const e = byHelper.get(m.stat);
    if (m.ref && /QualityToggle$/.test(m.ref)) e.cond = 'quality';
    else if (m.ref && /Toggle$/.test(m.ref)) e.cond = 'driver';
    else if (m.computed !== undefined && m.modifierType === 'Additive') e.v = m.computed;
  }
  return [...byHelper.values()].filter((e) => e.v !== undefined).map((e) => {
    const s = finalStat(helperToStat[e.helper] || e.helper);
    statName(s);
    return { s, v: e.v, ...(e.cond ? { c: e.cond } : {}) };
  });
}

// Bonus « Sensible à … » : AttunementHelper = valeur × attribut du joueur
function attunement(t) {
  const m = t.statModifiers.find((x) => x.stat === 'AttunementHelper' && x.refObject === 'Player');
  return m ? { a: m.refStat, p: m.value } : null;
}

// DPS de base des bras : somme des DPS additifs × courbe de qualité (RULES.md §9)
function armsDps(t) {
  let base = 0;
  for (const g of t.statModifierGroups || []) for (const m of g.modifiers) if (m.stat === 'DPS' && m.modifierType === 'Additive' && m.computed !== undefined) base += m.computed;
  if (!base) return null;
  const q = curves.eval('quality_curves', 'quality_to_dps_multiplier_new', t.qualityStat);
  return Math.round(base * q * 10) / 10;
}

// Stats sans nom traduit dans le jeu mais utiles (Sandevistan, Berserk…) : le site affiche leur identifiant
const UNNAMED_USEFUL = /^(TimeDilationSandevistan|Berserk|SandevistanKill|CWMask)/;

// Prix d'achat avant remise de réputation (eddies) : (Σ additifs) × (Π multiplicateurs), RULES.md §1 et §10.
// Composantes : records Price.* (items/prices/price_modifiers.tweak) + courbes price_curves / cyberware_curves.
// La remise « BuyPrice_StreetCred_Discount » (AdditiveMultiplier, dépend du joueur) est appliquée par le site.
function buyPrice(t) {
  let add = 0, mult = 1;
  const itemStat = { Quality: t.qualityStat, IsItemPlus: t.isItemPlus, IsItemIconic: t.computedStats.IsItemIconic || 0 };
  for (const p of t.price) {
    let m = p;
    if (typeof p === 'string') {
      const r = db.resolve(p);
      if (!r) continue;
      const f = (k) => (r.fields[k] ? r.fields[k].value : undefined);
      m = { modifierType: f('modifierType'), value: f('value'), curve: f('id') ? { set: f('id'), column: f('column') } : null,
        refStat: f('refStat') ? f('refStat').replace('BaseStats.', '') : null, refObject: f('refObject') };
    }
    if (m.refObject === 'Player') continue; // remise de réputation : côté site
    let v = m.computed;
    if (v === undefined && m.curve) v = curves.eval(m.curve.set, m.curve.column, itemStat[m.refStat] ?? 0);
    if (v === undefined) v = m.value;
    if (v === undefined) continue;
    if (m.modifierType === 'Additive') add += v;
    else if (m.modifierType === 'Multiplier') mult *= v;
  }
  return Math.round(add * mult);
}

// Coût d'amélioration vers ce palier (RPGManager.GetCyberwareUpgradeCost, rpgManager.script l. 3717) :
// coût de base du palier (Items.CyberwareBaseUpgradeCosts, variante « _CoreCW » pour les paliers + des implants principaux)
// × upgradeCostMult de l'implant ; matériau selon le palier sans « + » (RPGManager.GetCraftingMaterialRecord).
const UPGRADE_KEY = { CommonPlus: 'commonPlus', Uncommon: 'uncommon', UncommonPlus: 'uncommonPlus', Rare: 'rare', RarePlus: 'rarePlus',
  Epic: 'epic', EpicPlus: 'epicPlus', Legendary: 'legendary', LegendaryPlus: 'legendaryPlus', LegendaryPlusPlus: 'legendaryPlusPlus' };
function upgradeCostTo(t) {
  const key = UPGRADE_KEY[t.quality];
  if (!key) return null;
  const core = !!db.val(t.record, 'isCoreCW');
  const plus = /Plus$/.test(t.quality);
  const base = (core && plus && db.val('Items.CyberwareBaseUpgradeCosts', `${key}_CoreCW`)) || db.val('Items.CyberwareBaseUpgradeCosts', key);
  if (!base) return null;
  return { mat: t.quality.replace(/Plus/g, ''), n: Math.floor((t.upgradeCostMult || 0) * base) };
}

function slimTier(t) {
  const stats = {};
  for (const [s, v] of Object.entries(t.computedStats)) {
    if (HIDDEN_STATS.has(s) || !v || (!statName(s) && !UNNAMED_USEFUL.test(s))) continue;
    stats[s] = v;
  }
  const cost = t.capacityCost[0] || { base: 0, adjustments: [] };
  const tink = (cost.adjustments || []).find((a) => a.refStat === 'CyberwareTinkererStat');
  const fx = t.onEquip.filter((p) => p.description && (p.description.fr || p.description.en)).map((p) => {
    const att = (p.ref && p.ref.startsWith('Attunements.')) || ((p.uiValues && p.uiValues.statValues) || []).includes('AttunementHelper');
    // {stat_N} = valeur d'une stat de l'implant (ex. chance d'hémorragie des lames Mantis) : calculée ici
    const statVals = att ? [] : ((p.uiValues && p.uiValues.statValues) || []).map((s) => itemStat(t, s));
    const desc = richify(p.description);
    const e = txt(markMissing(statVals.length ? fillStats(desc, statVals) : desc));
    if (att) {
      e.att = true;
      // titre du bloc dans l'infobulle du jeu (« Sensible aux réflexes »)
      const an = txt(p.name);
      if (an) e.an = an;
    }
    return e;
  });
  const out = {
    r: t.record.replace('Items.', ''),
    q: t.quality,
    qs: t.qualityStat,
    cost: cost.base,
    ...(tink ? { tink: tink.value } : {}),
    ...(Object.keys(stats).length ? { st: stats } : {}),
    ...(fx.length ? { fx } : {}),
  };
  const sec = slimSecondary(t);
  if (sec.length) out.sec = sec;
  const att = attunement(t);
  if (att) out.att = att;
  const dps = armsDps(t);
  if (dps) out.dps = dps;
  // Compresseur de chrome : capacité donnée = courbe capacity_booster_to_humanity(CapacityBoosterHumanity)
  if (t.computedStats.CapacityBoosterHumanity) {
    out.capb = curves.eval('cyberware_curves', 'capacity_booster_to_humanity', t.computedStats.CapacityBoosterHumanity);
  }
  if (t.equipPrereqs.length) out.req = t.equipPrereqs;
  if (t.dlc) out.dlc = t.dlc;
  if (t.vendors.length) out.sold = 1;
  const price = buyPrice(t);
  if (price) out.price = price;
  // Amélioration depuis le palier précédent de la chaîne (nextUpgradeItem pointe vers ce palier)
  const up = t._upFrom ? upgradeCostTo(t) : null;
  if (up && up.n) out.up = up;
  if (t.sideVariant) out.side = slimTier(t.sideVariant);
  return out;
}

// Valeur d'une stat propre à l'implant (modificateurs du palier + groupes), comme le StatsSystem :
// (Σ Additive) × (Π Multiplier) × (1 + Σ AdditiveMultiplier) ; références évaluées sur l'implant (Quality, IsItemPlus,
// DealsPhysicalDamage…). Une stat qui dépend du joueur reste inconnue (undefined).
function itemStat(t, stat, depth = 0) {
  if (stat === 'Quality') return t.qualityStat;
  if (stat === 'IsItemPlus') return t.isItemPlus;
  // Indicateur « inflige ce type de dégâts » : vaut 1 pour l'effet cité dans le texte de la variante
  // (ex. lames Mantis physiques → « chance d'hémorragie ») ; le type de dégâts de l'arme n'est pas dans ses modificateurs
  if (/^Deals\w+Damage$/.test(stat)) return 1;
  if (depth > 4) return 0;
  const mods = [...(t.statModifiers || []), ...(t.statModifierGroups || []).flatMap((g) => g.modifiers || [])].filter((m) => m.stat === stat);
  let add = 0, mult = 1, addMult = 0;
  for (const m of mods) {
    if (m.refStat && !['Self', 'Item', 'Root', undefined].includes(m.refObject)) return undefined;
    let v;
    if (m.curve && m.curve.set) v = curves.eval(m.curve.set, m.curve.column, m.refStat ? itemStat(t, m.refStat, depth + 1) : 0);
    else if (m.refStat) { const r = itemStat(t, m.refStat, depth + 1); v = r === undefined ? undefined : r * (m.value ?? 1); }
    else v = m.value;
    if (v === undefined) return undefined;
    if (m.modifierType === 'Multiplier') mult *= v; else if (m.modifierType === 'AdditiveMultiplier') addMult += v; else add += v;
  }
  return add * mult * (1 + addMult);
}
// Mise en forme du jeu (texte « _rich ») convertie en marqueurs compacts lus par le site (site/js/main.js richText) :
//   <Input actionName="Jump" …></>  → ⟨Jump⟩  (icône de la touche)
//   <Rich color="…Highlight…">x</>  → ⟪x⟫     (mot en surbrillance, demi-gras)
function richify(desc) {
  const out = { ...desc };
  for (const [k, s] of Object.entries(desc)) {
    if (!k.endsWith('_rich') || typeof s !== 'string') continue;
    out[k.slice(0, -5)] = s.replace(/<Input[^>]*actionName="([^"]+)"[^>]*><\/>/g, '⟨$1⟩')
      .replace(/<Rich[^>]*>([\s\S]*?)<\/>/g, '⟪$1⟫').replace(/<[^>]+>/g, '');
  }
  return out;
}
// Valeur absente des données du jeu ({float_N} / {int_N} sans valeur) : affichée « ? » plutôt qu'en accolades
function markMissing(desc) {
  const out = { ...desc };
  for (const [k, s] of Object.entries(desc)) {
    if (typeof s === 'string' && k !== 'key' && !k.endsWith('_rich')) out[k] = s.replace(/\{(float|int|name)_\d+\}/g, '?');
  }
  return out;
}
// Remplace {stat_N} par les valeurs calculées dans toutes les langues du texte
function fillStats(desc, vals) {
  const out = { ...desc };
  for (const [k, s] of Object.entries(desc)) {
    if (typeof s !== 'string' || k === 'key' || k.endsWith('_rich')) continue;
    out[k] = s.replace(/\{stat_(\d+)\}/g, (m, i) => (vals[+i] === undefined ? m : String(Math.round(vals[+i] * 100) / 100)));
  }
  return out;
}

const familyIcon = (name) => (icons[name] ? icons[name].file : null);
// Obtention des implants non vendus : ABSENTE des fichiers du jeu, relevée sur les wikis / guides (novembre 2026).
// Affichée sur le site comme « info communautaire », avec le lien de la source (RULES.md §12).
// free : implant offert (récompense de mission) → aucun prix d'achat compté dans le coût du build (RULES.md §17).
const COMMUNITY_SOURCES = {
  MaskCW: { free: 1, fr: 'Récompense de mission principale (Phantom Liberty).', en: 'Main job reward (Phantom Liberty).',
    url: 'https://gamerguides.com/cyberpunk-2077/guide/phantom-liberty/main-jobs/ive-seen-that-face-before-walkthrough' },
  AdvancedKiroshiOptics: { free: 1, fr: 'Offert par Viktor pendant la mission principale « The Ripperdoc ».', en: 'Given by Viktor during the main job “The Ripperdoc”.',
    url: 'https://cyberpunk2077.wiki.fextralife.com/Kiroshi+Optics+MK.1' },
  AdvancedReversePowerInductor: { fr: 'Vendu par le charcudoc de Downtown et Fingers selon Game8 (page peut-être antérieure à la 2.0).',
    en: 'Sold by the Downtown ripperdoc and Fingers according to Game8 (page may predate 2.0).',
    url: 'https://www.gamesatlas.com/cyberpunk-2077/cyberware/inductor' },
  AdvancedCasiusTattoo: { free: 1, fr: 'Récompense de « Chippin’ In » (la soirée avec Johnny).', en: 'Reward from “Chippin’ In” (Johnny’s night out).',
    url: 'https://game8.co/games/Cyberpunk-2077/archives/314216' },
  AdvancedYakuzaTattoo: { free: 1, fr: 'Récompense de « The Gig » : gratuit chez le charcudoc de Cassius Ryder.', en: 'Reward from “The Gig”: free at Cassius Ryder’s ripperdoc.',
    url: 'https://cyberpunk2077.wiki.fextralife.com/Tattoo:+Tyger+Claws+Dermal+Imprint' },
};
// Implants non obtenables (contenu coupé, builds de test : extract-all.mjs) : retirés du site
cyberware = cyberware.filter((c) => !c.unobtainable);
// Retirés aussi, après vérification dans les tweaks (aucune référence « Items.X » : ni vendeur, ni butin, ni récompense,
// ni équipement de départ — RULES.md §15) :
//  - AdvancedBaseLowEnergyDeck : ce ne sont pas des implants mais les MODÈLES dont héritent les vrais cyberdecks
//    (Militech Paraline Mk.1–5, Arasaka Shadow) ; le cyberdeck de départ de V est AdvancedMilitechParalineMKICommon.
//  - AdvancedSmartStorageCommon (Tampon de surmenage) : référencé seulement par ses propres paliers → contenu coupé.
const NOT_IN_GAME = new Set(['AdvancedBaseLowEnergyDeck', 'AdvancedSmartStorageCommon']);
cyberware = cyberware.filter((c) => !NOT_IN_GAME.has(c.id));
// Paliers non obtenables : pour un implant vendu, les paliers en dessous du premier palier vendu
// (on ne peut pas redescendre de palier). Le jeu les garde avec des valeurs à 0 (ex. Booster universel Niveau 1-2).
for (const c of cyberware) {
  const first = c.tiers.findIndex((t) => t.vendors.length);
  if (c.soldByRipperdocs && first > 0) c.tiers = c.tiers.slice(first);
}
// Une amélioration n'existe que si le palier précédent mène à celui-ci (nextUpgradeItem)
function linkUpgrades(c) {
  c.tiers.forEach((t, i) => { const prev = c.tiers[i - 1]; t._upFrom = !!prev && prev.nextUpgradeItem === t.record; });
}
cyberware.forEach(linkUpgrades);

const families = cyberware.map((c) => ({
  id: c.id,
  k: shortKey(c.id),
  n: txt(c.name),
  d: txt(c.description),
  area: c.area,
  icon: familyIcon(c.icon) || familyIcon(c.tiers[0].icon),
  ...(c.iconic ? { iconic: 1 } : {}),
  ...(c.dlc ? { dlc: c.dlc } : {}),
  ...(c.soldByRipperdocs ? { sold: 1 } : {}),
  ...(c.obtainUnknown ? { unk: 1 } : {}),
  ...(COMMUNITY_SOURCES[c.id] ? { src: (({ free, ...x }) => x)(COMMUNITY_SOURCES[c.id]) } : {}),
  ...(COMMUNITY_SOURCES[c.id] && COMMUNITY_SOURCES[c.id].free ? { free: 1 } : {}),
  t: c.tiers.map((t) => {
    const s = slimTier(t);
    // nom / description propres au palier quand ils diffèrent de ceux de la famille (Berserk Mk.1 → Mk.3…)
    if (t.name && t.name.key && c.name && t.name.key !== c.name.key) s.n = txt(t.name);
    if (t.description && t.description.key && c.description && t.description.key !== c.description.key) s.d = txt(t.description);
    // implant offert : prix de vente du jeu sans objet (on ne l'achète pas)
    if (COMMUNITY_SOURCES[c.id] && COMMUNITY_SOURCES[c.id].free) delete s.price;
    return s;
  }),
}));
const keys = new Set(families.map((f) => f.k));
if (keys.size !== families.length) throw new Error('collision de clés courtes : changer shortKey');

// --- Zones et slots --------------------------------------------------------
const areas = slots.areas.filter((a) => a.hasCyberware).map((a) => ({
  id: a.id,
  n: txt(a.name),
  slots: a.slots.map((s) => (s.unlock ? { u: s.unlock } : {})),
}));

// --- Perks utiles au calcul (logique dans site/js/engine.js, sources dans RULES.md) ---
const PERKS = ['Tech_Central_Milestone_2', 'Tech_Central_Perk_2_1', 'Tech_Inbetween_Right_2', 'Tech_Central_Perk_2_2', 'Tech_Central_Milestone_3',
  'Tech_Central_Perk_3_2', 'Tech_Central_Perk_3_3', 'Tech_Master_Perk_3'];
const perkData = PERKS.map((id) => perks.find((p) => p.id === id)).filter(Boolean).map((p) => ({
  id: p.id,
  n: txt(p.name),
  d: txt(p.description),
  icon: familyIcon(p.icon),
  levels: p.levels.map((l) => txt(l.description)),
}));

// --- Courbes utilisées côté site --------------------------------------------
const curve = (set, col) => curves.get(set, col);
const siteCurves = {
  techSkillToCapacity: curve('technical_ability_skill_passives', 'tech_ability_skill_to_humanity'),
  techSkillToArmor: curve('technical_ability_skill_passives', 'tech_ability_skill_to_armor'),
  boosterToCapacity: curve('cyberware_curves', 'capacity_booster_to_humanity'),
  maxArmorForLevel: curve('cyberware_curves', 'max_armor_for_level'),
};

// Échelle de la jauge de capacité du charcudoc (RipperDocGameController.GetMaxCapacityPossible, ripperdoc.script l. 1662) :
// max de la courbe power_level_to_humanity + « amountOfCapacityGivenForRipperdocUI » de 5 sources + 40
const uiAmount = (id) => db.val(id, 'amountOfCapacityGivenForRipperdocUI') || 0;
const powerCurve = curve('cyberware_curves', 'power_level_to_humanity');
const capacityGaugeMax = Math.max(...powerCurve.points.map((p) => p[1]))
  + uiAmount('NewPerks.Tech_Central_Perk_2_2') + uiAmount('NewPerks.Tech_Master_Perk_3')
  + uiAmount('Items.CWCapacityPermaRewardBase') + uiAmount('Proficiencies.TechnicalAbilitySkill')
  + uiAmount('Items.CapacityBoosterBase') + 40;
const armorGaugeMax = Math.max(...siteCurves.maxArmorForLevel.points.map((p) => p[1]));

// Noms des paliers : les records Quality.* n'ont pas de nom ; l'interface 2.x utilise
// « Niveau 1…5 » (clés Gameplay-RPG-Items-Quality-*) suivi de « + » / « ++ ».
const QUALITY_LOC = { Common: 1814, Uncommon: 1817, Rare: 1816, Epic: 1813, Legendary: 1815, Iconic: 49478 };
const qualityNames = {};
for (const q of Object.keys(qualities)) {
  const base = q.replace(/Plus/g, '');
  const r = resolveLoc(loc, `LocKey#${QUALITY_LOC[base]}`);
  const plus = '+'.repeat(qualities[q].isItemPlus);
  qualityNames[q] = { value: qualities[q].value, stat: qualities[q].qualityStat, plus: qualities[q].isItemPlus,
    ...(r && r.key ? txt(r, plus) : {}) };
}

// Composants d'amélioration (RPGManager.GetCraftingMaterialRecord) : nom et icône
const materials = {};
for (const q of ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']) {
  const id = `Items.${q}Material1`;
  const name = resolveLoc(loc, db.val(id, 'displayName'));
  materials[q] = { record: id, n: name && name.key ? txt(name) : { fr: q, en: q }, icon: familyIcon(db.val(id, 'iconPath')) };
}
siteCurves.streetCredDiscount = curve('player_level_up_curve', 'street_cred_to_vendor_discount');

// --- Stats aléatoires à l'amélioration (perk « Connaissance des puces », RULES.md §11) -----------------
// rpgManager.script GetCyberwareUpgradeData : option 1 = stats actuelles ; options 2 (et 3 si palier visé >= Niveau 3) =
// pièce Items.CyberwareStatsShard<qualité> tirée au hasard. Ses groupes (variants/modifier_groups.tweak) :
// simples, avancées (+ simples), spécialisées (+ avancées + simples), « pilotes » (1 tirage, avancées + Toggle).
// Nombre de stats par groupe = courbes cyberware_curves/quality_to_number_of_*_modifiers(qualité de la pièce).
const transfer = {};
for (const m of db.val('ModifierGroups.TransferCyberwareModifiersToItem', 'statModifiers') || []) {
  if (!m || !m.fields) continue;
  const st = m.fields.statType && m.fields.statType.value.replace('BaseStats.', '');
  const rs = m.fields.refStat && m.fields.refStat.value.replace('BaseStats.', '');
  if (st && rs) transfer[rs] = st === 'ItemArmor' ? 'Armor' : st; // ItemArmor de l'implant → Armure du joueur
}
const randomMods = {};
const groupList = (id) => (db.val(id, 'statModifiers') || []).filter((m) => typeof m === 'string' && /Random$/.test(m)).map((m) => {
  const key = m.replace('Modifiers.', '');
  if (!randomMods[key]) {
    const helper = (db.val(m, 'statType') || '').replace('BaseStats.', '');
    const stat = transfer[helper] || helper;
    statName(stat);
    randomMods[key] = { stat, min: db.val(m, 'min'), max: db.val(m, 'max') };
  }
  return key;
});
const shardCounts = {};
for (let q = 0; q <= 4; q++) {
  const n = (col) => Math.max(0, Math.round(curves.eval('cyberware_curves', col, q) || 0));
  shardCounts[q] = { simple: n('quality_to_number_of_simple_modifiers'), advanced: n('quality_to_number_of_advanced_modifiers'),
    specialized: n('quality_to_number_of_specialized_modifiers'), driver: db.val('ModifierGroups.AdvancedCyberwareModifiersDriverUpdate', 'statModsLimit') || 0 };
}
const randomShard = {
  lists: {
    simple: groupList('ModifierGroups.SimpleCyberwareModifiers'),
    advanced: groupList('ModifierGroups.AdvancedCyberwareModifiers'),
    specialized: groupList('ModifierGroups.SpecializedCyberwareModifiers'),
    driver: groupList('ModifierGroups.AdvancedCyberwareModifiersDriverUpdate'),
  },
  mods: randomMods,
  counts: shardCounts,
  // qualité de la pièce selon la valeur du palier visé (>= 8 Légendaire, >= 6 Épique, >= 4 Rare, >= 2 Peu commun)
  shardQuality: [[8, 4], [6, 3], [4, 2], [2, 1], [0, 0]],
  thirdOptionFrom: 4, // valeur de qualité (Niveau 3)
};

// Noms des attributs (pour les bonus « Sensible à… »)
for (const a of ['Strength', 'Reflexes', 'Intelligence', 'TechnicalAbility', 'Cool']) statName(a);

// Textes de la fenêtre d'amélioration du jeu (catégorie de l'objet, bouton, annulation)
// + infobulles des jauges (RipperdocBarTooltip, common/tooltip/cyberdecktooltip.inkwidget)
const UI_LOC = { cyberware: 1883, upgrade: 6863, cancel: 15481,
  capTitle: 88306, capDesc: 92541, capPerks: 92566, capExceeded: 92565, capHealth: 92567, capFury: 92568,
  armorTitle: 40290, armorDesc: 92542, armorReduction: 93545, armorPerks: 92569, armorCW: 92570, levelWord: 22291 };
// <Rich …>mot</> → ⟪mot⟫ (mot en gras / couleur) ; les autres balises sont retirées
const tagsToMarkers = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && k !== 'key'
  ? v.replace(/<Rich[^>]*>([\s\S]*?)<\/>/g, '⟪$1⟫').replace(/<[^>]+>/g, '').replace(/\\n/g, '\n') : v]));
const uiTexts = {};
for (const [k, id] of Object.entries(UI_LOC)) {
  const r = resolveLoc(loc, `LocKey#${id}`);
  if (r && r.key) uiTexts[k] = txt(tagsToMarkers(r));
}

const out = {
  meta: { generatedAt: new Date().toISOString(), gameExeModified: meta.gameExeModified },
  qualities: qualityNames,
  ui: uiTexts,
  stats: statNames,
  areas,
  perks: perkData,
  curves: siteCurves,
  gauges: { capacityMax: capacityGaugeMax, armorMax: armorGaugeMax },
  materials,
  randomShard,
  families,
};

// Icônes en WebP pour le site (≈ 4 fois plus légères que les PNG, même rendu) si ffmpeg est installé.
// Les PNG extraits restent la source dans /assets ; les WebP sont gardés en cache (data/webp) tant que le PNG ne change pas.
function webpIcons() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { return null; }
  const src = join(ROOT, 'assets', 'icons');
  const cache = join(DATA, 'webp');
  mkdirSync(cache, { recursive: true });
  const done = [];
  for (const f of readdirSync(src).filter((n) => n.endsWith('.png'))) {
    const out = join(cache, f.replace(/\.png$/, '.webp'));
    if (!existsSync(out) || statSync(out).mtimeMs < statSync(join(src, f)).mtimeMs) {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(src, f), '-c:v', 'libwebp', '-quality', '90', '-pix_fmt', 'yuva420p', out], { stdio: 'ignore' });
    }
    done.push(f);
  }
  return { cache, done };
}
const webp = webpIcons();
let gameJson = JSON.stringify(out);
if (webp) gameJson = gameJson.replace(/"icons\/([^"]+)\.png"/g, (m, n) => (webp.done.includes(`${n}.png`) ? `"icons/${n}.webp"` : m));

mkdirSync(join(SITE, 'data'), { recursive: true });
writeFileSync(join(SITE, 'data', 'game.json'), gameJson);
// Textes du jeu des autres langues (chargés par le site seulement si la langue est choisie)
mkdirSync(join(SITE, 'data', 'lang'), { recursive: true });
for (const l of EXTRA_LANGS) writeFileSync(join(SITE, 'data', 'lang', `${l}.json`), JSON.stringify(Array.from({ length: textIndex }, (_, i) => overlay[l][i] ?? null)));
// Boucle de fond : les événements « isLooping » du jeu (ui_gui_cyberware_tab_open, …_paperdoll_zoom_out_01) partagent
// un même son (mediaId) ; c'est lui qui tourne en boucle tant que le menu du charcudoc est ouvert → « lp: 1 »
const loopUse = new Map();
for (const v of Object.values(sounds)) if (v.isLooping) for (const f of v.files) loopUse.set(f.mediaId, (loopUse.get(f.mediaId) || 0) + 1);
const soundMap = Object.fromEntries(Object.entries(sounds).map(([k, v]) => [k, { mode: v.mode,
  files: v.files.map((f) => ({ ogg: f.ogg, mp3: f.mp3, ...(v.isLooping && loopUse.get(f.mediaId) > 1 ? { lp: 1 } : {}) })) }]));
writeFileSync(join(SITE, 'data', 'sounds.json'), JSON.stringify(soundMap));

// Vidéos du corps (extract/convert-videos.mjs) : liste nom → fichier
const videosFile = join(DATA, 'videos.json');
writeFileSync(join(SITE, 'data', 'videos.json'), existsSync(videosFile) ? readFileSync(videosFile, 'utf8') : '{}');

// Assets : copie complète (le site ne doit dépendre que de son propre dossier)
rmSync(join(SITE, 'assets'), { recursive: true, force: true });
cpSync(join(ROOT, 'assets'), join(SITE, 'assets'), { recursive: true });
if (webp) for (const f of webp.done) {
  rmSync(join(SITE, 'assets', 'icons', f));
  cpSync(join(webp.cache, f.replace(/\.png$/, '.webp')), join(SITE, 'assets', 'icons', f.replace(/\.png$/, '.webp')));
}

const size = Buffer.byteLength(JSON.stringify(out));
console.log(`site/data/game.json : ${families.length} implants, ${Math.round(size / 1024)} Ko`);
const noName = Object.entries(statNames).filter(([, v]) => !v).map(([k]) => k);
if (noName.length) console.log(`Stats secondaires sans nom affichable : ${noName.join(', ')}`);
