// Vérification de toutes les données des implants contre la base compilée du jeu (r6/cache/tweakdb_ep1.bin),
// c'est-à-dire les valeurs que le jeu charge vraiment. Pour chaque palier de chaque implant :
//   palier, multiplicateur et cible d'amélioration, nom et description (clés de texte), liste des prix,
//   modificateurs de stats (stat, type, valeur), effets (texte et valeurs affichées), coût en capacité,
//   stats secondaires (valeurs).
//   node extract/verify-game.mjs        → rapport dans data/verify-game.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompiledTweakDb, tdbid } from './lib/tweakdbBin.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { cyberware } = JSON.parse(readFileSync(join(ROOT, 'data', 'cyberware.json'), 'utf8'));
console.log('Lecture de la base compilée du jeu…');
const cdb = new CompiledTweakDb();

const errors = [];
let checks = 0, values = 0;
const err = (where, what, ours, game) => errors.push({ where, what, ours, game: typeof game === 'bigint' ? game.toString() : game });
const near = (a, b) => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a), Math.abs(b));
const idOf = (name) => (name ? tdbid(name) : 0n);
const locNum = (k) => (k ? BigInt(k.replace(/^LocKey#/i, '')) : 0n);
// Clé de texte du jeu : nombre (gamedataLocKeyWrapper) ou texte « LocKey#123 » (String) selon le champ
const sameLoc = (game, key) => (typeof game === 'string' ? game.toLowerCase() === String(key).toLowerCase() : game === locNum(key));
const statId = (s) => tdbid(`BaseStats.${s}`);

// Les noms des sous-records (« inline ») ne sont pas stockés dans la base compilée, seulement leur identifiant :
// on retrouve le nom en essayant « <record>_inline<N> » (et un niveau d'imbrication) pour chaque record de la chaîne d'héritage.
const nameCache = new Map();
function namesFor(base) {
  if (nameCache.has(base)) return nameCache.get(base);
  const m = new Map();
  for (let i = 0; i < 300; i++) {
    const n = `${base}_inline${i}`;
    const id = tdbid(n);
    m.set(id, n);
    for (let j = 0; j < 12; j++) m.set(tdbid(`${n}_inline${j}`), `${n}_inline${j}`);
  }
  nameCache.set(base, m);
  return m;
}
function nameOf(id, chain) {
  for (const base of chain) { const n = namesFor(base).get(id); if (n) return n; }
  return null;
}
const get = (name, field) => cdb.get(name, field);

for (const c of cyberware) {
  for (const t of c.tiers) {
    const r = t.record;
    const chain = t.inheritance || [r];
    const where = `${c.id} · ${t.quality}`;
    if (!cdb.has(r, 'quality')) { err(where, 'record absent du jeu', r, null); continue; }
    checks++;
    const cmp = (what, ok, ours, game) => { values++; if (!ok) err(where, what, ours, game); };
    // Palier, amélioration
    cmp('palier', get(r, 'quality') === idOf(`Quality.${t.quality}`), t.quality, get(r, 'quality'));
    const ucm = get(r, 'upgradeCostMult');
    if (ucm !== undefined) cmp('upgradeCostMult', near(ucm, t.upgradeCostMult || 0), t.upgradeCostMult, ucm);
    cmp('nextUpgradeItem', (get(r, 'nextUpgradeItem') || 0n) === idOf(t.nextUpgradeItem), t.nextUpgradeItem, get(r, 'nextUpgradeItem'));
    // Nom et description
    const tn = (t.name && t.name.key) ? t.name : c.name;
    if (tn && tn.key) cmp('nom (clé de texte)', sameLoc(get(r, 'displayName'), tn.key), tn.key, get(r, 'displayName'));
    const td = (t.description && t.description.key) ? t.description : c.description;
    if (td && td.key) cmp('description (clé de texte)', sameLoc(get(r, 'localizedDescription'), td.key), td.key, get(r, 'localizedDescription'));
    // Liste des modificateurs de prix
    const gp = get(r, 'buyPrice') || [];
    cmp('nombre de modificateurs de prix', gp.length === t.price.length, t.price.length, gp.length);
    t.price.forEach((p, i) => { if (typeof p === 'string') cmp(`prix[${i}]`, gp[i] === idOf(p), p, gp[i]); });
    // Modificateurs de stats : chaque modificateur compilé est relu (stat, type, valeur, stat de référence)
    const gsm = get(r, 'statModifiers') || [];
    const ours = t.statModifiers || [];
    cmp('nombre de modificateurs de stats', gsm.length === ours.length, ours.length, gsm.length);
    ours.forEach((m, i) => {
      const id = gsm[i];
      if (id === undefined) return;
      const n = m.ref && idOf(m.ref) === id ? m.ref : nameOf(id, chain);
      if (!n) { err(where, `modificateur[${i}] introuvable dans le jeu`, m.stat, id); return; }
      const st = get(n, 'statType');
      if (st !== undefined) cmp(`modificateur[${i}] stat`, st === statId(m.stat), m.stat, st);
      const gv = get(n, 'value');
      if (m.value !== undefined && gv !== undefined) cmp(`modificateur[${i}] valeur (${m.stat})`, near(m.value, gv), m.value, gv);
      const gmt = get(n, 'modifierType');
      if (gmt !== undefined && m.modifierType) cmp(`modificateur[${i}] type (${m.stat})`, gmt === m.modifierType, m.modifierType, gmt);
      const grs = get(n, 'refStat');
      if (m.refStat) cmp(`modificateur[${i}] stat de référence (${m.stat})`, grs === statId(m.refStat), m.refStat, grs);
      if (m.curve) cmp(`modificateur[${i}] courbe (${m.stat})`, get(n, 'id') === m.curve.set && get(n, 'column') === m.curve.column, `${m.curve.set}/${m.curve.column}`, `${get(n, 'id')}/${get(n, 'column')}`);
    });
    // Effets : texte et valeurs affichées (UIData du package OnEquip)
    const goe = get(r, 'OnEquip') || [];
    cmp('nombre d’effets', goe.length === (t.onEquip || []).length, (t.onEquip || []).length, goe.length);
    (t.onEquip || []).forEach((p, i) => {
      const pid = goe[i];
      if (pid === undefined) return;
      const pn = (p.ref && idOf(p.ref) === pid) ? p.ref : nameOf(pid, chain);
      if (!pn) { err(where, `effet[${i}] introuvable dans le jeu`, p.ref || '(inline)', pid); return; }
      const uid = get(pn, 'UIData');
      const un = typeof uid === 'bigint' ? (nameOf(uid, [pn, ...chain]) || null) : null;
      const uiName = un || (typeof uid === 'bigint' ? [...cdb.flats.keys()].length && null : null);
      const target = un;
      if (!target) return;
      const desc = get(target, 'localizedDescription');
      if (p.description && p.description.key && desc !== undefined) cmp(`effet[${i}] texte`, sameLoc(desc, p.description.key), p.description.key, desc);
      const fv = get(target, 'floatValues');
      const ofv = (p.uiValues && p.uiValues.floatValues) || [];
      if (fv) cmp(`effet[${i}] valeurs affichées`, fv.length === ofv.length && fv.every((x, j) => near(x, ofv[j])), ofv, fv.join(','));
      const iv = get(target, 'intValues');
      const oiv = (p.uiValues && p.uiValues.intValues) || [];
      if (iv) cmp(`effet[${i}] valeurs entières`, iv.length === oiv.length && iv.every((x, j) => x === oiv[j]), oiv, iv.join(','));
      // stats appliquées par l'effet
      const gst = get(pn, 'stats') || [];
      (p.stats || []).forEach((m, j) => {
        const sn = gst[j] !== undefined ? ((m.ref && idOf(m.ref) === gst[j]) ? m.ref : nameOf(gst[j], [pn, ...chain])) : null;
        if (!sn) return;
        const gv = get(sn, 'value');
        if (m.value !== undefined && gv !== undefined) cmp(`effet[${i}] stat ${m.stat}`, near(m.value, gv), m.value, gv);
      });
    });
    // Coût en capacité : modificateur HumanityAllocated sans référence de la variante
    for (const v of t.capacityCost || []) {
      const mods = get(v.variant, 'statModifiers') || [];
      let found = null;
      for (const id of mods) {
        const n = nameOf(id, [v.variant]);
        if (n && get(n, 'statType') === statId('HumanityAllocated') && get(n, 'refStat') === undefined) found = get(n, 'value');
      }
      if (found !== null) cmp('coût en capacité', near(found, v.base), v.base, found);
    }
    // Stats secondaires (pièce StatsShard)
    if (t.secondaryStats && t.secondaryStats.record) {
      const gm = get(t.secondaryStats.record, 'statModifiers') || [];
      for (const m of t.secondaryStats.modifiers || []) {
        if (!m.ref) continue;
        cmp(`stat secondaire présente (${m.stat})`, gm.includes(idOf(m.ref)), m.ref, null);
        const gv = get(m.ref, 'value');
        if (m.value !== undefined && gv !== undefined) cmp(`stat secondaire ${m.stat}`, near(m.value, gv), m.value, gv);
      }
    }
  }
}

// --- Contrôles de ce que le site affiche (site/data/game.json + textes des autres langues)
const site = JSON.parse(readFileSync(join(ROOT, 'site', 'data', 'game.json'), 'utf8'));
const langFiles = {};
for (const l of ['es', 'pt', 'de', 'it', 'pl', 'ru', 'zh', 'ja', 'ko', 'ar']) langFiles[l] = JSON.parse(readFileSync(join(ROOT, 'site', 'data', 'lang', `${l}.json`), 'utf8'));
const textOk = (where, what, o, allowStat = false) => {
  if (!o) return;
  const texts = [['fr', o.fr], ['en', o.en], ...Object.entries(langFiles).map(([l, arr]) => [l, o.i !== undefined ? arr[o.i] : null])];
  for (const [l, v] of texts) {
    const s = Array.isArray(v) ? v.join(' ') : v;
    if (!s) { err(where, `${what} : texte manquant (${l})`, null, null); continue; }
    const left = s.match(/\{(float|int|name)_\d+\}/g) || (allowStat ? null : s.match(/\{stat_\d+\}/g));
    if (left) err(where, `${what} : valeur non remplie (${l})`, left.join(' '), null);
  }
};
for (const fam of site.families) {
  textOk(fam.id, 'nom', fam.n);
  textOk(fam.id, 'description', fam.d);
  let prevPrice = 0;
  fam.t.forEach((tier) => {
    const where = `${fam.id} · ${tier.q}`;
    textOk(where, 'nom du palier', tier.n);
    (tier.fx || []).forEach((fx, i) => {
      textOk(where, `effet[${i}]`, fx, !!fx.att);
      // bonus « par point d'attribut » : le site calcule le total avec l'attribut du joueur (tier.att)
      if (fx.att && !tier.att) err(where, `effet[${i}] : bonus d'attribut sans données de calcul`, null, null);
    });
    const src = cyberware.find((x) => x.id === fam.id).tiers.find((x) => x.record === `Items.${tier.r}`);
    if (fam.sold && !tier.price && src && src.price.length) err(where, 'prix absent pour un implant vendu', null, null);
    if (tier.price && tier.price < prevPrice) err(where, 'prix plus bas que le palier précédent', tier.price, prevPrice);
    prevPrice = tier.price || prevPrice;
  });
}

writeFileSync(join(ROOT, 'data', 'verify-game.json'), JSON.stringify({ generatedAt: new Date().toISOString(), tiersChecked: checks, valuesChecked: values, errors }, null, 2));
console.log(`Paliers vérifiés : ${checks} · valeurs comparées : ${values}`);
console.log(`Différences avec le jeu : ${errors.length}`);
const byWhat = {};
for (const e of errors) { const k = e.what.replace(/\[\d+\]/, '[]').replace(/ \(.*\)$/, ''); byWhat[k] = (byWhat[k] || 0) + 1; }
console.log(byWhat);
for (const e of errors.slice(0, 20)) console.log(' -', e.where, '|', e.what, '| nous :', JSON.stringify(e.ours), '| jeu :', String(e.game));
