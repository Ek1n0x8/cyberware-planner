// Encodage du build dans l'adresse (#b=…), pour le partager par lien.
// Format v1, champs séparés par « ; » :
//   1 ; niveau ; attributs (5, séparés par « . ») ; compétence Tech ; perks (dans l'ordre de PERK_LEVELS) ;
//   éclats ; quête visage (0/1) ; slots « zone.slot.clé.palier » séparés par « _ »
// Les liens v2 (écran Personnage, retiré) restent lisibles : niveau, attributs, compétence Tech, implants.
// Un champ « réputation » en fin de lien (anciennes versions) est ignoré.

import { ATTRIBUTES, PERK_LEVELS, defaultState, randomModKeys } from './engine.js';

const PERKS = Object.keys(PERK_LEVELS);

export function encodeState(state, game) {
  const slots = [];
  const keys = randomModKeys(game);
  game.areas.forEach((a, ai) => (state.slots[a.id] || []).forEach((s, si) => {
    if (!s) return;
    // stats aléatoires choisies : 5e champ « indices séparés par - » (ordre de game.randomShard.mods)
    // « x » = pièce aléatoire sans stat visée
    const r = s.r ? s.r.map((k) => keys.indexOf(k)).filter((i) => i >= 0).join('-') || 'x' : '';
    // 6e champ : palier acheté, quand l'implant a été amélioré depuis
    const b = Number.isInteger(s.b) && s.b < s.q ? `.${r}.${s.b}` : r ? `.${r}` : '';
    slots.push(`${ai}.${si}.${s.k}.${s.q}${b}`);
  }));
  return ['1', state.level, ATTRIBUTES.map((a) => state.attrs[a]).join('.'), state.techSkill,
    PERKS.map((p) => state.perks[p] || 0).join(''), state.shards, state.maskQuest ? 1 : 0, slots.join('_')].join(';');
}

const clamp = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function decodeState(str, game) {
  const s = defaultState(game);
  if (!str) return s;
  const f = str.split(';');
  if (f[0] !== '1' && f[0] !== '2') return s;
  s.level = clamp(+f[1], 1, 60, s.level);
  (f[2] || '').split('.').forEach((v, i) => { if (ATTRIBUTES[i]) s.attrs[ATTRIBUTES[i]] = clamp(+v, 3, 20, 3); });
  if (f[0] === '1') {
    s.techSkill = clamp(+f[3], 1, 60, 1);
    [...(f[4] || '')].forEach((c, i) => { if (PERKS[i]) s.perks[PERKS[i]] = clamp(+c, 0, PERK_LEVELS[PERKS[i]], 0); });
  } else {
    s.techSkill = clamp(+(f[3] || '').split('.')[2], 1, 60, 1); // v2 : compétences Solo.Shinobi.Ingénieur…
  }
  s.shards = clamp(+f[5], 0, 200, 0);
  s.maskQuest = f[6] === '1';
  for (const part of (f[7] || '').split('_')) {
    const [ai, si, k, q, r, b] = part.split('.');
    const area = game.areas[+ai];
    const fam = game.byKey.get(k);
    if (!area || !fam || fam.area !== area.id || !(+si < area.slots.length) || !fam.t[+q]) continue;
    if (s.slots[area.id].some((x) => x && x.k === k)) continue; // même implant deux fois : impossible en jeu
    s.slots[area.id][+si] = { k, q: +q };
    if (b !== undefined && /^\d+$/.test(b) && +b < +q) s.slots[area.id][+si].b = +b;
    if (r) {
      const keys = randomModKeys(game);
      const picked = [...new Set(r.split('-').map((i) => keys[+i]).filter(Boolean))];
      if (picked.length || r === 'x') s.slots[area.id][+si].r = picked;
    }
  }
  return s;
}
