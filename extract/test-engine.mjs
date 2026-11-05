// Tests du moteur de calcul du site (site/js/engine.js) sur des cas connus de RULES.md.
//   node extract/test-engine.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { defaultState, indexGame, compute, tierCost, tierPrice, placeImplant, installedSlot, canChooseStats, randomShardSlots, upgradePath } from '../site/js/engine.js';
import { encodeState, decodeState } from '../site/js/share.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = indexGame(JSON.parse(readFileSync(join(ROOT, 'site', 'data', 'game.json'), 'utf8')));
const fam = (id) => game.families.find((f) => f.id === id);
const qi = (f, q) => f.t.findIndex((t) => t.q === q);
let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok - ${name}`); };

test('capacité de base niveau 60 = 21 + 180', () => {
  const s = defaultState(game);
  assert.equal(compute(s, game).capMax, 201);
});

test('Dépassement des limites : +4 par attribut >= 9', () => {
  const s = defaultState(game);
  s.perks.Tech_Central_Perk_2_2 = 1;
  s.attrs.Reflexes = 9; s.attrs.Cool = 20;
  assert.equal(compute(s, game).capMax, 201 + 8);
});

test('Modificateur de douleur Épique : armure 88, coût 35 ; 28 avec Cyberbricoleuse 2', () => {
  const s = defaultState(game);
  const pe = fam('AdvancedPainReductorEpic');
  s.slots.IntegumentarySystemCW[0] = { k: pe.k, q: qi(pe, 'Epic') };
  const r = compute(s, game);
  assert.equal(r.stats.Armor.total, 88);
  assert.equal(r.capUsed, 35);
  s.perks.Tech_Central_Milestone_2 = 2;
  assert.equal(compute(s, game).capUsed, 28);
});

test('Compresseur de chrome Légendaire++ : +70 de capacité', () => {
  const s = defaultState(game);
  const cb = fam('CapacityBoosterUncommon');
  s.slots.SystemReplacementCW[0] = { k: cb.k, q: qi(cb, 'LegendaryPlusPlus') };
  assert.equal(compute(s, game).capMax, 201 + 70);
});

test('dépassement : refusé sans Edgerunner, -0,5 % santé par point avec', () => {
  const s = defaultState(game);
  s.level = 1; // capacité 24
  const pe = fam('AdvancedPainReductorEpic');
  s.slots.IntegumentarySystemCW[0] = { k: pe.k, q: 0 }; // coût 35 → 11 de trop
  let r = compute(s, game);
  assert.equal(r.over, 11);
  assert.equal(r.overInvalid, true);
  s.perks.Tech_Master_Perk_3 = 1;
  r = compute(s, game);
  assert.equal(r.overInvalid, false);
  assert.equal(Math.round(r.healthPenalty * 1000) / 10, 5.5);
});

test('slot verrouillé ignoré (3e squelette sans Pro du chrome 3)', () => {
  const s = defaultState(game);
  const f = game.byArea.get('MusculoskeletalSystemCW')[0];
  s.slots.MusculoskeletalSystemCW[2] = { k: f.k, q: 0 };
  const r = compute(s, game);
  assert.equal(r.capUsed, 0);
  assert.ok(r.warnings.some((w) => w.id === 'lockedSlot'));
});

test('squelette : version renforcée avec Pro du chrome 3', () => {
  const f = game.byArea.get('MusculoskeletalSystemCW').find((x) => x.t.some((t) => t.side));
  const s = defaultState(game);
  s.slots.MusculoskeletalSystemCW[0] = { k: f.k, q: 0 };
  const before = compute(s, game).items[0].tier;
  s.perks.Tech_Central_Milestone_3 = 3;
  const after = compute(s, game).items[0].tier;
  assert.equal(after.boosted, true);
  assert.notEqual(after.r, before.r);
});

test('lien de partage : aller-retour identique', () => {
  const s = defaultState(game);
  s.level = 42; s.attrs.Cool = 15; s.perks.Tech_Master_Perk_3 = 1; s.shards = 9; s.maskQuest = true;
  const pe = fam('AdvancedPainReductorEpic');
  s.slots.IntegumentarySystemCW[1] = { k: pe.k, q: 2 };
  const enc = encodeState(s, game);
  assert.equal(encodeState(decodeState(enc, game), game), enc);
});

test('coût jamais négatif', () => {
  const s = defaultState(game);
  s.perks.Tech_Central_Milestone_2 = 2;
  for (const f of game.families) for (const t of f.t) assert.ok(tierCost(s, t) >= 0, `${f.id} ${t.q}`);
});

test('lien v1 (ancien format) toujours lisible', () => {
  const s = decodeState('1;60;3.3.9.3.3;12;0100000;4;1;;20', game);
  assert.equal(s.techSkill, 12);
  assert.equal(s.perks.Tech_Central_Perk_2_1, 1);
  assert.equal(s.shards, 4);
});

test('prix de base : Éditeur de douleur Niveau 4 = 71 820 €$', () => {
  const pe = fam('AdvancedPainReductorEpic');
  assert.equal(tierPrice(defaultState(game), game, pe.t[qi(pe, 'Epic')]), 71820);
});

test('un même implant ne peut pas être installé deux fois', () => {
  const s = defaultState(game);
  const pe = fam('AdvancedPainReductorEpic');
  placeImplant(s, 'IntegumentarySystemCW', 0, pe.k, 0);
  placeImplant(s, 'IntegumentarySystemCW', 1, pe.k, 0);
  assert.equal(s.slots.IntegumentarySystemCW.filter((x) => x && x.k === pe.k).length, 1);
  assert.equal(installedSlot(s, 'IntegumentarySystemCW', pe.k), 1);
  // un lien avec un doublon ne garde qu'un exemplaire
  const enc = `1;60;3.3.3.3.3;1;0000000;0;0;${game.areas.findIndex((a) => a.id === 'IntegumentarySystemCW')}.0.${pe.k}.0_${game.areas.findIndex((a) => a.id === 'IntegumentarySystemCW')}.1.${pe.k}.0`;
  assert.equal(decodeState(enc, game).slots.IntegumentarySystemCW.filter(Boolean).length, 1);
});

test('Connaissance des puces : choix des stats seulement après une amélioration, hors système d’exploitation', () => {
  const s = defaultState(game);
  const pe = fam('AdvancedPainReductorEpic');
  const area = 'IntegumentarySystemCW';
  const q = qi(pe, 'EpicPlus');
  assert.equal(canChooseStats(s, game, area, pe, q), false); // sans le perk
  s.perks.Tech_Inbetween_Right_2 = 1;
  assert.equal(canChooseStats(s, game, area, pe, q), true);
  assert.equal(canChooseStats(s, game, area, pe, 0), false); // palier acheté, pas amélioré
  // palier visé Niveau 4+ → pièce Épique : 1 stat avancée + 1 spécialisée + 1 tirage « pilotes », 2 options aléatoires
  const sl = randomShardSlots(game, pe.t[q]);
  assert.deepEqual([sl.quality, sl.counts.advanced, sl.counts.specialized, sl.counts.driver, sl.options], [3, 1, 1, 1, 2]);
  // les stats aléatoires remplacent les stats secondaires et sont rendues en plage
  placeImplant(s, area, 0, pe.k, q);
  s.slots[area][0].r = ['HealthRandom'];
  const r = compute(s, game);
  // 1 stat visée + 2 cases laissées « au hasard » (stat inconnue)
  assert.deepEqual(r.ranges.map((x) => x.stat), ['Health', null, null]);
  const back = decodeState(encodeState(s, game), game);
  assert.deepEqual(back.slots[area][0].r, ['HealthRandom']);
  // pièce aléatoire sans stat visée : conservée dans le lien
  s.slots[area][0].r = [];
  assert.deepEqual(decodeState(encodeState(s, game), game).slots[area][0].r, []);
  assert.equal(compute(s, game).ranges.length, 3);
});

test('Implant amélioré : prix du palier acheté + composants dépensés ; retiré = plus rien', () => {
  const s = defaultState(game);
  const pe = fam('AdvancedPainReductorEpic');
  const area = 'IntegumentarySystemCW';
  const q = qi(pe, 'Epic');
  placeImplant(s, area, 0, pe.k, q + 2);
  s.slots[area][0].b = q; // acheté Épique, amélioré deux fois
  const r = compute(s, game);
  assert.equal(r.totalPrice, pe.t[q].price);
  assert.deepEqual(r.spent, upgradePath(pe, q, q + 2));
  assert.equal(decodeState(encodeState(s, game), game).slots[area][0].b, q);
  s.slots[area][0] = null;
  const r2 = compute(s, game);
  assert.equal(r2.totalPrice, 0);
  assert.deepEqual(r2.spent, {});
});

console.log(`\n${n} tests réussis`);
