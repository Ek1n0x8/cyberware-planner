// Interface du planner : vue Build (corps + slots + récapitulatif), Catalogue, À propos.

import { ATTRIBUTES, PERK_LEVELS, MAX_LEVEL, defaultState, indexGame, compute, slotUnlocked, effectiveTier, tierCost, tierPrice, nextUpgrade, placeImplant, installedSlot, canChooseStats, randomShardSlots } from './engine.js';
import { t, g, getLang, setLang, setMaleTexts, loadLangTexts, setPerkNames, LANGUAGES, LANG_NAMES } from './i18n.js';
import { initAudio, play, isMuted, setMuted, getVolume, setVolume } from './audio.js';
import { encodeState, decodeState } from './share.js';
import { createScreen } from './screen.js';

// Disposition des zones autour du corps, comme l'écran cyberware du jeu (v2.x).
// Le système immunitaire n'apparaît pas dans l'écran 2.x (un seul implant, retiré des boutiques) : il reste dans le catalogue.
const LEFT = ['FrontalCortexCW', 'ArmsCW', 'MusculoskeletalSystemCW', 'NervousSystemCW', 'IntegumentarySystemCW'];
const RIGHT = ['SystemReplacementCW', 'EyesCW', 'HandsCW', 'CardiovascularSystemCW', 'LegsCW'];
// Image du corps affichée au survol d'une zone (planches man_body / woman_body du jeu)
const BODY_IMAGE = {
  FrontalCortexCW: 'frontal_cortex', EyesCW: 'eyes', SystemReplacementCW: 'os', ArmsCW: 'arms', HandsCW: 'hands', LegsCW: 'legs',
  MusculoskeletalSystemCW: 'skeleton', NervousSystemCW: 'nervous', CardiovascularSystemCW: 'circulatory',
  IntegumentarySystemCW: 'integumentary', ImmuneSystemCW: 'immune',
};
const DEFAULT_BODY = 'skeleton';

let game;
let state;
let view = 'build';
let gender = 'man';
try { if (localStorage.getItem('gender') === 'woman') gender = 'woman'; } catch { /* ignoré */ }
setMaleTexts(gender === 'man');

// ---------------------------------------------------------------- utilitaires
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    // Survol : souris (et stylet) seulement. Sur écran tactile, iOS transforme le 1er appui en « survol » dès que
    // le survol change l'affichage (fiche, zone éclairée) : il fallait alors toucher deux fois pour ouvrir.
    else if (k === 'onmouseenter' || k === 'onmouseleave') {
      el.addEventListener(k === 'onmouseenter' ? 'pointerenter' : 'pointerleave', (e) => { if (e.pointerType !== 'touch') v(e); });
    } else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const $ = (sel) => document.querySelector(sel);
// Remplace le contenu d'un élément (accepte des tableaux imbriqués et ignore null/false)
const fill = (el, ...c) => el.replaceChildren(...c.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));

// Format des nombres par langue (chiffres latins partout, comme dans le jeu)
const NUM_LOCALE = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-BR', de: 'de-DE', it: 'it-IT', pl: 'pl-PL', ru: 'ru-RU',
  zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', ar: 'ar-u-nu-latn' };
function num(v, dp) {
  const d = dp ?? (Math.abs(v) >= 100 ? 0 : 2);
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return r.toLocaleString(NUM_LOCALE[getLang()] || 'en-US', { maximumFractionDigits: d });
}
// Affichage d'une stat selon les règles de son record (displayPercent, multiplyBy100InText…)
function fmtStat(stat, v) {
  const s = game.stats[stat] || {};
  const val = s.x100 ? v * 100 : v;
  const sign = s.plus && val > 0 ? '+' : '';
  return `${sign}${num(val, s.dp)}${s.pct ? (getLang() === 'fr' ? ' %' : '%') : ''}`;
}
function statLabel(stat) {
  const s = game.stats[stat];
  if (s) return g(s);
  return stat.replace(/([a-z])([A-Z])/g, '$1 $2'); // stat sans nom traduit dans le jeu : identifiant lisible
}
// Nom / description d'un implant à un palier donné (certains changent de nom : Berserk Mk.1 → Mk.3…)
const nameAt = (fam, qi) => g((fam.t[qi] && fam.t[qi].n) || fam.n);
const descAt = (fam, qi) => g((fam.t[qi] && fam.t[qi].d) || fam.d);
const areaName = (id) => g((game.areas.find((a) => a.id === id) || {}).n) || id;
const qualityName = (q) => g(game.qualities[q]) || q;
const qClass = (tier) => `q${tier.qs ?? 0}`;
const perkName = (id) => g((game.perks.find((p) => p.id === id) || {}).n) || id;
const familyOf = (s) => (s ? game.byKey.get(s.k) : null);
function effectText(fx, attVal) {
  const txt = g(fx);
  return attVal === null || attVal === undefined ? txt : txt.replace(/\{stat_0\}/g, num(attVal, 2));
}
// Touches par défaut du jeu sur PC (r6/config/inputUserMappings.xml + inputContexts.xml)
const MOUSE = (btn) => `<svg viewBox="0 0 12 16" aria-hidden="true"><rect x="1" y="1" width="10" height="14" rx="5" fill="none" stroke="currentColor" stroke-width="1.2"/>${
  btn === 'left' ? '<path d="M6 1v6H1V6a5 5 0 0 1 5-5z" fill="currentColor"/>' : '<rect x="5" y="3" width="2" height="4" rx="1" fill="currentColor"/>'}</svg>`;
const GAME_KEYS = {
  Jump: { cap: '␣', wide: true, title: 'Space' },
  MeleeAttack: { svg: MOUSE('left'), title: 'Mouse 1' },
  UseCombatGadget: { svg: MOUSE('middle'), title: 'Mouse 3' },
  IconicCyberware: { cap: 'E' },
  QuickMelee: { cap: 'Q' },
};
function keyCap(action) {
  const k = GAME_KEYS[action] || { cap: action };
  const el = h('span', { class: `key-cap ${k.wide ? 'wide' : ''} ${k.svg ? 'mouse' : ''}`, title: k.title || k.cap });
  if (k.svg) el.innerHTML = k.svg; else el.textContent = k.cap;
  return el;
}
// Texte du jeu mis en forme : ⟨Action⟩ = touche, ⟪…⟫ = mot en surbrillance (couleur des infobulles du jeu)
function rich(str) {
  return String(str).split(/(⟨[^⟩]*⟩|⟪[^⟫]*⟫)/).filter(Boolean).map((part) => {
    if (part[0] === '⟨') return keyCap(part.slice(1, -1));
    if (part[0] === '⟪') return h('span', { class: 'hl', text: part.slice(1, -1) });
    return part;
  });
}
// Même texte sans mise en forme (recherche, attributs title…)
const plain = (str) => String(str).replace(/⟨([^⟩]*)⟩/g, (m, a) => (GAME_KEYS[a] && (GAME_KEYS[a].cap || GAME_KEYS[a].title)) || a).replace(/[⟪⟫]/g, '');
// Prix en eddies (avec la remise de réputation) et coût en composants
const eddies = (n) => `${num(n, 0)} €$`;
const priceOf = (fam, qi) => tierPrice(state, game, fam.t[qi]);
function matEl(mat, n) {
  const m = game.materials[mat];
  if (!m) return h('span', { text: `${n} × ${mat}` });
  return h('span', { class: 'mat', title: g(m.n) }, m.icon ? h('img', { src: `assets/${m.icon}`, alt: '' }) : null, `${num(n, 0)} × ${g(m.n)}`);
}
function matList(totals) {
  const order = Object.keys(game.materials);
  return Object.entries(totals).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([m, n]) => matEl(m, n));
}
// Améliore l'implant d'un slot au palier suivant (coût en composants, pas en eddies).
// Comme dans le jeu, la fenêtre d'amélioration s'ouvre : options de stats avec « Connaissance des puces ».
function upgradeSlot(areaId, slotIndex) {
  const s = state.slots[areaId][slotIndex];
  const fam = familyOf(s);
  if (!fam || !nextUpgrade(fam, s.q)) return false;
  openStatChoice(areaId, slotIndex, { upgrade: true });
  return true;
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------------------------------------------------------------- état
function save() {
  const enc = encodeState(state, game);
  try { localStorage.setItem('build', enc); } catch { /* ignoré */ }
  history.replaceState(null, '', `#b=${enc}`);
}
function loadInitialState() {
  const m = location.hash.match(/#b=([^&]+)/);
  if (m) return decodeState(decodeURIComponent(m[1]), game);
  try { const s = localStorage.getItem('build'); if (s) return decodeState(s, game); } catch { /* ignoré */ }
  return defaultState(game);
}
let screen = null; // écran du charcudoc fidèle au jeu (bureau)
function update() {
  save();
  renderDoll();
  renderSummary();
  renderTabs();
  if (screen) screen.refresh();
}
// Languettes des panneaux : flèche + titre
function renderTabs() {
  fill($('#settings-tab'), h('span', { class: 'arrow', 'aria-hidden': 'true' }), h('span', { class: 'label', text: t('character') }));
  fill($('#summary-tab'), h('span', { class: 'arrow', 'aria-hidden': 'true' }), h('span', { class: 'label', text: t('statsEffects') }));
}
function setGender(v) {
  gender = v === 'woman' ? 'woman' : 'man';
  try { localStorage.setItem('gender', gender); } catch { /* ignoré */ }
  setMaleTexts(gender === 'man'); // les textes du jeu s'accordent (Cyberbricoleur / Cyberbricoleuse)
  play('ui_gui_cyberware_paperdoll_zoom_in_01');
  renderAll();
}

// ---------------------------------------------------------------- textes statiques
function applyStaticTexts() {
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.title = t('title');
  renderTabs();
  $('#data-date').textContent = `(${new Date(game.meta.gameExeModified).toLocaleDateString(NUM_LOCALE[getLang()] || 'en-US')})`;
}

// ---------------------------------------------------------------- réglages du personnage
// Champ numérique : la valeur est bornée (min-max) et appliquée dès qu'elle est valide
// (lazy : seulement à la validation, pour les écrans qui se redessinent à chaque changement)
let fieldId = 0;
function numberField(label, value, min, max, onValue, hintText, lazy = false) {
  const id = `nf${++fieldId}`;
  const apply = (e, final) => {
    const v = Math.round(+e.target.value);
    if (e.target.value === '' || !Number.isFinite(v)) { if (final) e.target.value = value; return; }
    const c = Math.min(max, Math.max(min, v));
    if (final && c !== v) e.target.value = c;
    if (c !== value) { value = c; onValue(c); }
  };
  const input = h('input', { id, type: 'number', min, max, step: 1, value, inputmode: 'numeric',
    oninput: (e) => { if (!lazy) apply(e, false); }, onchange: (e) => apply(e, true) });
  // boutons − / + : un clic = ±1, bornés
  const step = (d) => h('button', { type: 'button', class: 'step', text: d < 0 ? '−' : '+', 'aria-label': `${t(d < 0 ? 'decrease' : 'increase')} : ${label}`,
    onclick: () => { const v = Math.min(max, Math.max(min, value + d)); if (v === value) return; input.value = v; value = v; play('ui_menu_onpress'); onValue(v); } });
  return h('div', { class: 'field num' },
    h('label', { for: id, text: label }),
    h('div', { class: 'stepper' }, step(-1), input, step(1)),
    h('small', { class: 'range', text: hintText || `${min} – ${max}` }));
}
// ---------------------------------------------------------------- panneaux latéraux (réglages, stats)
function openDrawer(id) {
  closeDrawers(false);
  const el = $(`#${id}`);
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  $('#drawer-backdrop').hidden = false;
  play('ui_gui_tab_change');
  el.tabIndex = -1;
  el.focus({ preventScroll: true });
}
function closeDrawers(withSound = true) {
  let was = false;
  for (const el of document.querySelectorAll('.drawer.open')) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); was = true; }
  $('#drawer-backdrop').hidden = true;
  if (was && withSound) play('ui_menu_onpress');
}
const drawerHead = (title) => h('div', { class: 'drawer-head' }, h('h2', { text: title }),
  h('button', { type: 'button', class: 'drawer-close', text: '✕', title: t('close'), 'aria-label': t('close'), onclick: () => closeDrawers() }));

// Panneau des valeurs : uniquement ce qui change le build (capacité, armure, stats, slots, perks)
function renderSettings() {
  const el = $('#settings');
  fill(el,
    drawerHead(t('character')),
    // Réinitialiser : valeurs par défaut (les implants restent) ; Maximum : tout au max
    h('div', { class: 'values-actions' },
      h('button', { type: 'button', class: 'btn-max reset', title: t('resetValuesHint'), text: t('resetValues'), onclick: () => {
        const d = defaultState(game);
        Object.assign(state, { level: d.level, techSkill: d.techSkill, shards: d.shards, maskQuest: d.maskQuest, attrs: d.attrs, perks: d.perks });
        play('ui_menu_item_sold'); renderSettings(); update();
      } }),
      h('button', { type: 'button', class: 'btn-max', title: t('allMaxHint'), text: t('allMax'), onclick: () => {
        state.level = MAX_LEVEL; state.techSkill = 60; state.maskQuest = true;
        for (const a of ATTRIBUTES) state.attrs[a] = 20;
        for (const p of game.perks) state.perks[p.id] = PERK_LEVELS[p.id] || 1;
        play('ui_menu_item_bought'); renderSettings(); update();
      } })),
    h('div', { class: 'num-grid' },
      numberField(t('level'), state.level, 1, MAX_LEVEL, (v) => { state.level = v; update(); }),
      numberField(t('techSkill'), state.techSkill, 1, 60, (v) => { state.techSkill = v; update(); }),
      numberField(t('shards'), state.shards, 0, 200, (v) => { state.shards = v; update(); })),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: state.maskQuest, onchange: (e) => { state.maskQuest = e.target.checked; update(); } }),
      h('span', { text: t('maskQuest') })),
    h('h2', { text: t('attributes') }),
    h('div', { class: 'num-grid' },
      ATTRIBUTES.map((a) => numberField(statLabel(a), state.attrs[a], 3, 20, (v) => { state.attrs[a] = v; update(); }))),
    h('h2', { text: t('perks') }),
    game.perks.map((p) => {
      const max = PERK_LEVELS[p.id] || 1;
      const desc = [g(p.d), ...p.levels.map((l, i) => (l ? `${i + 1}. ${g(l)}` : ''))].filter(Boolean).join('\n');
      return h('div', { class: 'perk' },
        p.icon ? h('img', { src: `assets/${p.icon}`, alt: '' }) : h('span'),
        h('div', {},
          h('div', { class: 'name' }, g(p.n),
            // aide au survol / au clavier : description du perk et de chaque niveau (textes du jeu)
            h('span', { class: 'help-i', tabIndex: 0, role: 'note', 'aria-label': desc }, 'i', h('span', { class: 'help-pop', text: desc }))),
          h('div', { class: 'levels' }, Array.from({ length: max + 1 }, (_, lvl) => h('button', {
            type: 'button', text: lvl, 'aria-pressed': String((state.perks[p.id] || 0) === lvl),
            'aria-label': `${g(p.n)} : ${lvl}`,
            onclick: () => { state.perks[p.id] = lvl; play('ui_menu_onpress'); renderSettings(); update(); },
          })))));
    }),
  );
}

// ---------------------------------------------------------------- corps et slots
// Corps au centre : image du jeu ; au survol d'une zone, l'image du système correspondant
function bodyImage(part) { return `assets/ui/${gender}_${part}.png`; }
function showBody(areaId) {
  const part = (areaId && BODY_IMAGE[areaId]) || DEFAULT_BODY;
  const img = $('#body-img');
  if (!img) return;
  const src = bodyImage(part);
  if (img.getAttribute('src') === src) return;
  img.classList.toggle('zoom', !['skeleton', 'nervous', 'circulatory', 'integumentary', 'immune'].includes(part));
  img.setAttribute('src', src);
}

// Infobulle au survol : la même fiche que le jeu (gameCard, plus bas), avec la description de l'implant
// Infobulle des jauges (RipperdocBarTooltip, ripperdocBarTooltip.script) : capacité, armure, ou Edgerunner (cadenas)
function gaugeTip(kind) {
  const r = compute(state, game);
  const ui = game.ui;
  const has = (id, lvl = 1) => (state.perks[id] || 0) >= lvl;
  const perkLine = (id, label, bought) => {
    const p = game.perks.find((x) => x.id === id);
    return h('div', { class: `gt-perk ${bought ? 'bought' : ''}` },
      p && p.icon ? h('img', { src: `assets/${p.icon}`, alt: '' }) : h('span'),
      h('span', { text: label || (p ? g(p.n) : id) }), h('span', { class: 'gt-check', text: bought ? '✓' : '' }));
  };
  const head = (title, total, max, edge) => h('div', { class: `gt-head ${edge ? 'edge' : ''}` },
    h('span', { text: title }), h('b', {}, num(total, 0), h('small', { text: ` / ${num(max, 0)}` })));
  const stat = (label, value) => h('div', { class: 'gt-stat' }, h('span', { text: label }), h('b', { text: value }));
  if (kind === 'armor') {
    // la réduction de dégâts max dépend d'une constante du moteur (GetArmorEffectivenessValue), illisible dans les fichiers : « ? »
    return h('div', { class: 'cw-tooltip gauge-tip armor' },
      head(g(ui.armorTitle), r.armor, r.maxArmorForLevel),
      h('p', {}, rich(g(ui.armorDesc))),
      h('p', { class: 'gt-note' }, rich(g(ui.armorReduction).replace('{float_0}', '?'))),
      h('div', { class: 'gt-perks' }, h('div', { class: 'gt-perks-title', text: g(ui.armorPerks) }),
        perkLine('Tech_Central_Milestone_3', `${g((game.perks.find((x) => x.id === 'Tech_Central_Milestone_3') || {}).n)} (${g(ui.levelWord)} 2)`, has('Tech_Central_Milestone_3', 2))));
  }
  const edge = kind === 'edgerunner';
  const edgeOn = has('Tech_Master_Perk_3');
  const max = edgeOn ? r.capMax + r.overMax : r.capMax;
  return h('div', { class: `cw-tooltip gauge-tip ${edge ? 'edge' : ''}` },
    head(edge ? perkName('Tech_Master_Perk_3') : g(ui.capTitle), r.capUsed, max, edge && r.over > 0),
    edge ? null : h('p', {}, rich(g(ui.capDesc))),
    // Edgerunner : dépassement, santé max perdue (en % ici : la santé max de V n'est pas calculée), chances de Fureur (dépassement × 0,1 %)
    edge && edgeOn && r.over > 0 ? h('div', { class: 'gt-stats' },
      stat(g(ui.capExceeded), num(r.over, 0)),
      stat(g(ui.capHealth), `−${num(r.healthPenalty * 100, 1)} %`),
      stat(g(ui.capFury), `${num(r.over * 0.1, 1)} %`)) : null,
    h('div', { class: 'gt-perks' }, h('div', { class: 'gt-perks-title', text: g(ui.capPerks) }),
      perkLine('Tech_Master_Perk_3', null, edgeOn),
      perkLine('Tech_Central_Perk_2_2', null, has('Tech_Central_Perk_2_2'))));
}
function showGaugeTip(anchor, kind) { showTipEl(anchor, gaugeTip(kind)); }
function showTooltip(anchor, fam, qi) { showTipEl(anchor, h('div', { class: 'cw-tooltip gc-tip' }, gameCard(fam, qi, { desc: true }))); }
// Affiche une infobulle déjà construite à côté de l'élément survolé
function showTipEl(anchor, tip) {
  hideTooltip();
  tip.id = 'cw-tooltip';
  document.body.append(tip);
  const r = anchor.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = r.right + 12;
  if (x + tw > innerWidth - 8) x = r.left - tw - 12;
  const y = Math.min(Math.max(8, r.top), innerHeight - th - 8);
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${y}px`;
}
function hideTooltip() { const t0 = document.getElementById('cw-tooltip'); if (t0) t0.remove(); }

function slotButton(area, i) {
  const slot = area.slots[i];
  const s = state.slots[area.id][i];
  const fam = familyOf(s);
  const unlocked = slotUnlocked(state, slot);
  const tier = fam ? effectiveTier(state, fam, s.q) : null;
  const label = fam ? `${nameAt(fam, s.q)} —${qualityName(fam.t[s.q].q)}` : unlocked ? t('empty') : t('locked');
  const btn = h('button', {
    type: 'button',
    class: `slot ${fam ? `filled ${qClass(tier)}` : ''} ${unlocked ? '' : 'locked'}`,
    title: unlocked ? label : `${label} — ${slot.u.type === 'perk' ? perkName(slot.u.perk) + (slot.u.level > 1 ? ` (${slot.u.level})` : '') : t('maskQuest')}`,
    'aria-label': `${areaName(area.id)} ${i + 1} : ${label}`,
    onclick: () => { hideTooltip(); if (unlocked || fam) openPicker(area.id, i); else play('ui_menu_attributes_fail'); },
    onmouseenter: (e) => { play('ui_menu_hover'); showBody(area.id); if (fam) showTooltip(e.currentTarget, fam, s.q); },
    onmouseleave: () => { showBody(null); hideTooltip(); },
    onfocus: (e) => { showBody(area.id); if (fam) showTooltip(e.currentTarget, fam, s.q); },
    onblur: () => { showBody(null); hideTooltip(); },
  }, fam && fam.icon ? h('img', { src: `assets/${fam.icon}`, alt: '' }) : h('span', { class: unlocked ? 'socket' : 'socket lock' }),
  fam ? h('span', { class: 'q', text: qualityName(fam.t[s.q].q).replace(/^\D+/, '') }) : null);
  return btn;
}
function areaBlock(id, side, row) {
  const area = game.areas.find((a) => a.id === id);
  if (!area) return null;
  // Slots cachés tant qu'ils sont verrouillés, sauf si le jeu les montre (visibleWhenLocked) : ici on montre un cadenas
  const slots = area.slots.map((sl, i) => (sl.u && sl.u.type === 'fact' && !slotUnlocked(state, sl) && !state.slots[id][i] ? null : slotButton(area, i)));
  return h('div', { class: `area ${side}`, style: `grid-row:${row}`, 'data-area': id,
    onmouseenter: () => showBody(id), onmouseleave: () => showBody(null) },
  h('h3', { text: areaName(id) }),
  h('div', { class: 'slots' }, slots));
}
function renderDoll() {
  fill($('#doll'),
    LEFT.map((id, i) => areaBlock(id, 'left', i + 1)),
    h('div', { class: 'body', 'aria-hidden': 'true' }, h('img', { id: 'body-img', src: bodyImage(DEFAULT_BODY), alt: '' })),
    RIGHT.map((id, i) => areaBlock(id, 'right', i + 1)),
  );
  // Précharge les autres images du corps pour un survol fluide
  for (const part of new Set(Object.values(BODY_IMAGE))) { const im = new Image(); im.src = bodyImage(part); }
}

// ---------------------------------------------------------------- récapitulatif
function bars(count, parts) {
  // parts : [{ upTo: nb de barres, cls }]
  return h('div', { class: 'bars', 'aria-hidden': 'true' }, Array.from({ length: count }, (_, i) => {
    const p = parts.find((x) => i < x.upTo);
    return h('i', { class: p ? p.cls : '' });
  }));
}
// Jauge verticale : fill = part remplie (0-1), markers = étiquettes positionnées (max, valeur actuelle)
function vgauge(el, { title, fill: ratio, bad = false, zone = null, markers = [] }) {
  const pct = (x) => `${Math.round(Math.max(0, Math.min(1, x)) * 1000) / 10}%`;
  fill(el,
    h('div', { class: 'vg-title', text: title }),
    h('div', { class: 'vg-track' },
      h('div', { class: 'vg-layer base' }),
      zone !== null ? h('div', { class: 'vg-layer zone', style: `clip-path: inset(0 0 ${pct(zone)} 0)` }) : null,
      h('div', { class: `vg-layer fill ${bad ? 'bad' : ''}`, style: `clip-path: inset(${pct(1 - ratio)} 0 0 0)` }),
      markers.map((m) => h('div', { class: `vg-marker ${m.cls}`, style: `bottom:${pct(m.at)}` }, h('span', { text: m.text })))));
}

function renderSummary() {
  const r = compute(state, game);
  const N = 40;
  const scale = Math.max(r.capMax + r.overMax, r.capUsed, 1);
  const usedBars = Math.round((Math.min(r.capUsed, r.capMax) / scale) * N);
  const overBars = Math.round((Math.min(r.capUsed, scale) / scale) * N);
  const maxBars = Math.round((r.capMax / scale) * N);
  const zoneBars = Math.round(((r.capMax + r.overMax) / scale) * N);
  const capGauge = h('div', { class: 'gauge' },
    h('div', { class: 'head' },
      h('span', { class: 'label', text: t('capacity') }),
      h('span', { class: `value ${r.overInvalid ? 'bad' : ''}`, text: `${num(r.capUsed, 0)} / ${num(r.capMax, 0)}` })),
    bars(N, [
      { upTo: usedBars, cls: 'on' },
      { upTo: overBars, cls: r.overInvalid ? 'bad' : 'over' },
      { upTo: maxBars, cls: '' },
      ...(r.overMax ? [{ upTo: zoneBars, cls: 'zone' }] : []),
    ]),
    r.overMax ? h('small', { text: `${t('overcharge')} : +${r.overMax}` }) : null,
    h('details', { class: 'breakdown' },
      h('summary', { text: t('capDetail') }),
      h('table', {}, r.capParts.map((p) => h('tr', {}, h('td', { text: p.id === 'booster' ? `${t('cap_booster')} (${g(p.name)})` : t(`cap_${p.id}`) }), h('td', { text: num(p.v, 0) }))))));

  const armorGauge = h('div', { class: 'gauge' },
    h('div', { class: 'head' }, h('span', { class: 'label', text: t('armor') }), h('span', { class: 'value', text: num(r.armor, 0) })),
    bars(N, [{ upTo: Math.round(Math.min(1, r.armor / Math.max(1, r.maxArmorForLevel)) * N), cls: 'on' }]),
    h('small', { text: `${t('maxArmorHint')} : ${num(r.maxArmorForLevel, 0)}` }));

  const warnings = r.warnings.map((w) => h('div', { class: 'warn', text:
    w.id === 'overCapacity' || w.id === 'overEdgerunner' ? t(`warn_${w.id}`, num(w.v, 0))
      : w.id === 'lockedSlot' ? t('warn_lockedSlot', g(w.family.n))
        : w.id === 'perkReq' ? t('warn_perkReq', g(w.family.n), perkName(w.perk))
          : t('warn_attrReq', g(w.family.n), statLabel(w.attr), w.v) }));
  if (r.healthPenalty) {
    warnings.push(h('div', { class: 'warn', text: `${t('health')} : −${num(r.healthPenalty * 100, 1)} % (${t('overcharge')})` }));
  }

  const statEntries = Object.entries(r.stats).sort((a, b) => statLabel(a[0]).localeCompare(statLabel(b[0])));
  const statList = h('ul', { class: 'statlist' }, statEntries.map(([s, v]) => h('li', {},
    h('span', { text: statLabel(s) }), h('span', { class: 'v', text: fmtStat(s, v.total) }))));

  const effects = r.effects.length ? h('ul', { class: 'effects' }, r.effects.map((e) => h('li', {},
    h('b', { text: nameAt(e.family, e.qi) }), h('span', {}, rich(effectText(e.fx, e.fx.att ? e.attVal : null)))))) : h('p', { class: 'hint', text: t('noEffects') });

  // Jauges verticales façon charcudoc (fond de jauge tiré du jeu, coloré en CSS)
  const capTotal = Math.max(r.capMax + r.overMax, r.capUsed, 1);
  vgauge($('#gauge-cap'), {
    title: t('capacity'),
    fill: Math.min(r.capUsed, capTotal) / capTotal,
    bad: r.overInvalid,
    zone: r.overMax ? r.capMax / capTotal : null,
    markers: [
      { at: r.capMax / capTotal, text: num(r.capMax, 0), cls: 'max' },
      { at: Math.min(r.capUsed, capTotal) / capTotal, text: num(r.capUsed, 0), cls: r.overInvalid ? 'cur bad' : 'cur' },
    ],
  });
  vgauge($('#gauge-armor'), {
    title: t('armor'),
    fill: Math.min(1, r.armor / Math.max(1, r.maxArmorForLevel)),
    markers: [{ at: Math.min(1, r.armor / Math.max(1, r.maxArmorForLevel)), text: num(r.armor, 0), cls: 'cur armor' }],
  });

  // Barre compacte (petits écrans) : capacité et armure toujours visibles
  fill($('#mini'),
    h('span', {}, `${t('capacity')} `, h('b', { class: r.overInvalid ? 'bad' : '', text: `${num(r.capUsed, 0)} / ${num(r.capMax, 0)}` })),
    h('span', {}, `${t('armor')} `, h('b', { text: num(r.armor, 0) })),
    h('span', {}, `${t('price')} `, h('b', { text: eddies(r.totalPrice) })));

  // Coût du build : prix d'achat total et composants pour tout améliorer au maximum
  const toMax = matList(r.toMax);
  const spent = matList(r.spent);
  const upgradable = r.items.map((e) => ({ e, u: nextUpgrade(e.family, e.qi) })).filter((x) => x.u);
  const costBox = h('div', { class: 'build-cost' },
    h('h2', { text: t('buildCost') }),
    h('div', { class: 'tt-stat' }, h('span', { text: t('buyTotal') }), h('b', { text: eddies(r.totalPrice) })),
    spent.length ? h('div', { class: 'tomax spent' }, h('span', { text: t('spentUpgrades') }), spent) : null,
    h('p', { class: 'hint', text: t('priceNote') }),
    upgradable.length ? h('h3', { text: t('upgrades') }) : null,
    upgradable.length ? h('ul', { class: 'uplist' }, upgradable.map(({ e, u }) => h('li', {},
      h('span', { class: 'up-name', text: `${nameAt(e.family, e.qi)} : ${qualityName(e.family.t[e.qi].q)} → ${qualityName(e.family.t[u.qi].q)}` }),
      matEl(u.mat, u.n),
      h('button', { type: 'button', class: 'btn small accent', text: t('upgrade'), onclick: () => upgradeSlot(e.area, e.slot) })))) : null,
    toMax.length ? h('div', { class: 'tomax' }, h('span', { text: t('toMax') }), toMax) : null);

  fill($('#summary'), drawerHead(t('statsEffects')), capGauge, armorGauge, ...warnings, costBox,
    h('h2', { text: t('summary') }), statList,
    r.ranges.length ? h('h2', { text: t('statRangesTitle') }) : null,
    r.ranges.length ? h('ul', { class: 'statlist' }, r.ranges.map((x) => h('li', {},
      h('span', { text: `${x.stat ? statLabel(x.stat) : t('statRandomUnknown')} · ${nameAt(x.family, x.qi)}` }), h('span', { class: 'v', text: x.stat ? rangeText(x.stat, x.min, x.max) : '?' })))) : null,
    r.ranges.length ? h('p', { class: 'hint', text: t('statRangesNote') }) : null,
    h('h2', { text: t('effects') }), effects);
}

// ---------------------------------------------------------------- éléments communs
function badges(fam) {
  return [
    fam.iconic ? h('span', { class: 'badge iconic', text: t('iconic') }) : null,
    fam.dlc ? h('span', { class: 'badge dlc', text: t('dlc') }) : null,
    !fam.sold ? h('span', { class: 'badge nosale', text: t('notSold') }) : null,
    fam.unk && !fam.src ? h('span', { class: 'badge nosale', title: t('unknownSourceHint'), text: t('unknownSource') }) : null,
    // obtention relevée sur les wikis (absente des fichiers du jeu) : signalée comme info communautaire
    fam.src ? h(fam.src.url ? 'a' : 'span', { class: 'badge src', title: t('communityHint'), ...(fam.src.url ? { href: fam.src.url, target: '_blank', rel: 'noopener' } : {}) },
      `${t('obtain')} : ${g(fam.src)}`) : null,
  ];
}
function tierSummary(fam, tier, qi) {
  const parts = [h('span', {}, `${t('cost')} `, h('span', { class: 'v', text: tierCost(state, tier) }))];
  if (fam.t[qi].price) parts.push(h('span', {}, `${t('price')} `, h('span', { class: 'v', text: eddies(priceOf(fam, qi)) })));
  for (const [s, v] of Object.entries(tier.st || {})) parts.push(h('span', {}, `${statLabel(s)} `, h('span', { class: 'v', text: fmtStat(s, v) })));
  if (tier.dps) parts.push(h('span', {}, `${t('dps')} `, h('span', { class: 'v', text: num(tier.dps, 1) })));
  if (tier.capb) parts.push(h('span', {}, `${t('capGiven')} `, h('span', { class: 'v', text: `+${num(tier.capb, 0)}` })));
  return parts;
}

// ---------------------------------------------------------------- choix d'un implant pour un slot
function openPicker(areaId, slotIndex) {
  const dlg = $('#picker');
  const current = state.slots[areaId][slotIndex];
  const filters = { q: '', sold: false, iconic: false, dlc: false };
  const families = (game.byArea.get(areaId) || []).slice().sort((a, b) => g(a.n).localeCompare(g(b.n)));
  const list = h('div', { class: 'items' });

  function install(fam, qi) {
    placeImplant(state, areaId, slotIndex, fam.k, qi);
    const r = compute(state, game);
    play(r.overInvalid ? 'ui_menu_attributes_fail' : 'ui_menu_item_bought');
    dlg.close();
    update();
  }
  function renderList() {
    const q = filters.q.trim().toLowerCase();
    const shown = families.filter((f) => (!q || g(f.n).toLowerCase().includes(q) || g(f.d).toLowerCase().includes(q))
      && (!filters.sold || f.sold) && (!filters.iconic || f.iconic) && (!filters.dlc || f.dlc));
    list.replaceChildren(...shown.map((fam) => {
      const isCurrent = current && current.k === fam.k;
      let qi = isCurrent ? current.q : fam.t.length - 1;
      const meta = h('div', { class: 'meta' });
      const nameEl = h('span', { text: nameAt(fam, qi) });
      const fillMeta = () => { meta.replaceChildren(...tierSummary(fam, effectiveTier(state, fam, qi), qi)); nameEl.textContent = nameAt(fam, qi); };
      fillMeta();
      const sel = h('select', { 'aria-label': t('tier'), onchange: (e) => { qi = +e.target.value; fillMeta(); } },
        fam.t.map((tier, i) => h('option', { value: i, selected: i === qi, text: qualityName(tier.q) })));
      return h('div', { class: `item ${isCurrent ? 'current' : ''}` },
        fam.icon ? h('img', { src: `assets/${fam.icon}`, alt: '', loading: 'lazy' }) : h('span'),
        h('div', {}, h('div', { class: 'name' }, nameEl, ' ', badges(fam)), meta),
        h('div', { class: 'side' }, sel,
          h('div', {},
            h('button', { type: 'button', class: 'btn small', text: t('details'), onclick: () => openDetail(fam) }), ' ',
            h('button', { type: 'button', class: 'btn small accent', text: t('install'), onclick: () => install(fam, qi) }))));
    }));
  }
  const check = (key, label) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', onchange: (e) => { filters[key] = e.target.checked; renderList(); } }), h('span', { text: label }));

  fill(dlg,
    h('div', { class: 'sheet-head' },
      h('h2', { text: t('pickTitle', `${areaName(areaId)} ${slotIndex + 1}`) }),
      current && nextUpgrade(familyOf(current), current.q) ? h('button', { type: 'button', class: 'btn accent',
        onclick: () => { upgradeSlot(areaId, slotIndex); dlg.close(); } }, `${t('upgrade')} · `,
      matEl(nextUpgrade(familyOf(current), current.q).mat, nextUpgrade(familyOf(current), current.q).n)) : null,
      current ? h('button', { type: 'button', class: 'btn', text: t('remove'), onclick: () => {
        state.slots[areaId][slotIndex] = null; play('ui_menu_item_sold'); dlg.close(); update();
      } }) : null,
      h('button', { type: 'button', class: 'btn', text: t('close'), onclick: () => dlg.close() })),
    h('div', { class: 'sheet-body' },
      h('div', { class: 'toolbar' },
        h('input', { type: 'search', placeholder: t('search'), 'aria-label': t('search'), oninput: (e) => { filters.q = e.target.value; renderList(); } }),
        check('sold', t('soldOnly')), check('iconic', t('iconicOnly')), check('dlc', t('dlcOnly'))),
      list));
  renderList();
  play('ui_gui_cyberware_paperdoll_zoom_in_01');
  dlg.showModal();
}
$('#picker').addEventListener('close', () => play('ui_gui_cyberware_paperdoll_zoom_out_01'));

// ---------------------------------------------------------------- choix des stats à l'amélioration (Connaissance des puces)
// Comme le popup du jeu (ripperdocTokenPopup) : fiche actuelle (cadre cyan) → flèche → options (option 1 = stats actuelles ;
// option 2, et 3 à partir du Niveau 3, = pièce de stats aléatoire). On clique une option (cadre doré), puis « Améliorer » dessous.
// Les stats aléatoires : on choisit les stats visées dans la liste du jeu ; leurs valeurs sont tirées au hasard → plages.
const rangeText = (stat, min, max) => `${fmtStat(stat, min)} – ${fmtStat(stat, max)}`;
// Icône de l'attribut d'un bonus « Sensible à… » (UIIcon.<attribut> dans le jeu)
const ATTR_ICON = Object.fromEntries(['Strength', 'Reflexes', 'TechnicalAbility', 'Intelligence', 'Cool'].map((a) => [a, `ui/attr_${a}.png`]));
// Icônes de l'infobulle du jeu (mappin_icons#ripperdoc, #armor ; atlas_cash#cash_symbol_normal), teintées en CSS
const icon = (name) => h('span', { class: `gc-ico ico-${name}`, 'aria-hidden': 'true' });
// Fiche d'implant façon infobulle du jeu : nom, palier, catégorie, capacité + armure, effets, bonus d'attribut, stats, prix
function gameCard(fam, qi, { secBlock = null, desc = false } = {}) {
  const tier = effectiveTier(state, fam, qi);
  const attVal = tier.att ? tier.att.p * state.attrs[tier.att.a] : null;
  const driverOn = (state.perks.Tech_Central_Perk_2_1 || 0) >= 1;
  const statLine = (s, v, extra = '') => h('div', { class: 'gc-stat' }, h('b', { text: v }), h('span', { text: statLabel(s) + extra }));
  const armor = (tier.st || {}).Armor;
  const others = Object.entries(tier.st || {}).filter(([s]) => s !== 'Armor');
  return h('div', { class: 'gc' },
    h('div', { class: 'gc-name', text: nameAt(fam, qi) }),
    h('div', { class: 'gc-tier', text: `${qualityName(fam.t[qi].q)}${tier.boosted ? ' ★' : ''}` }),
    h('div', { class: 'gc-type', text: g(game.ui.cyberware) || 'Cyberware' }),
    h('div', { class: 'gc-row' },
      h('span', { class: 'gc-cap', title: t('capacity') }, h('b', { text: tierCost(state, tier) }), icon('capacity')),
      armor ? h('span', { class: 'gc-armor', title: statLabel('Armor') }, h('b', { text: num(armor, 0) }), icon('armor')) : null),
    h('div', { class: 'gc-body' },
      (tier.fx || []).map((fx) => (fx.att
        ? h('div', { class: 'gc-att' },
          h('div', { class: 'gc-att-head' }, tier.att && ATTR_ICON[tier.att.a] ? h('img', { src: `assets/${ATTR_ICON[tier.att.a]}`, alt: '' }) : null,
            h('span', { text: g(fx.an) || statLabel(tier.att ? tier.att.a : '') })),
          h('p', {}, rich(effectText(fx, attVal))))
        : h('p', { class: 'gc-fx' }, rich(effectText(fx, null))))),
      others.map(([s, v]) => statLine(s, fmtStat(s, v))),
      tier.dps ? h('div', { class: 'gc-stat' }, h('b', { text: num(tier.dps, 1) }), h('span', { text: t('dps') })) : null,
      tier.capb ? h('div', { class: 'gc-stat' }, h('b', { text: `+${num(tier.capb, 0)}` }), h('span', { text: t('capGiven') })) : null,
      secBlock || (tier.sec || []).map((x) => {
        // stat « Toggle » (⚙) : active seulement avec Mise à jour des pilotes
        const on = x.c !== 'driver' || driverOn;
        const line = statLine(x.s, on ? fmtStat(x.s, x.v) : '—', x.c === 'driver' ? ' ⚙' : '');
        if (!on) line.classList.add('off');
        return line;
      })),
    desc && descAt(fam, qi) ? h('p', { class: 'gc-desc', text: descAt(fam, qi) }) : null,
    fam.t[qi].price ? h('div', { class: 'gc-price', title: t('price') }, icon('eddies'), h('b', { text: num(priceOf(fam, qi), 0) })) : null);
}
// upgrade : fenêtre d'amélioration (palier suivant, coût, options) ; sinon modification du choix d'un implant déjà amélioré
function openStatChoice(areaId, slotIndex, { upgrade = false } = {}) {
  const s = state.slots[areaId][slotIndex];
  const fam = familyOf(s);
  if (!fam) return;
  const u = upgrade ? nextUpgrade(fam, s.q) : null;
  if (upgrade && !u) return;
  const targetQ = upgrade ? u.qi : s.q;
  const canRandom = canChooseStats(state, game, areaId, fam, targetQ);
  if (!upgrade && !canRandom) return;
  const tier = effectiveTier(state, fam, targetQ);
  const rs = game.randomShard;
  const slots = randomShardSlots(game, fam.t[targetQ]);
  const boost = compute(state, game).boost;
  const GROUPS = [['simple', t('statSimple')], ['advanced', t('statAdvanced')], ['specialized', t('statSpecialized')], ['driver', t('statDriver')]];
  // Une fiche par tirage aléatoire (option 2, et option 3 à partir du Niveau 3), chacune avec ses propres stats visées
  const newPicks = () => {
    const list = [];
    for (const [g0] of GROUPS) for (let i = 0; i < (slots.counts[g0] || 0); i++) list.push({ group: g0, key: null });
    return list;
  };
  const rolls = canRandom ? Array.from({ length: slots.options }, newPicks) : [];
  if (!upgrade && rolls[0]) (s.r || []).forEach((k, i) => { if (rolls[0][i] && rs.lists[rolls[0][i].group].includes(k)) rolls[0][i].key = k; });
  // option sélectionnée : 0 = stats actuelles, 1… = tirages aléatoires
  let sel = !upgrade && s.r ? 1 : 0;
  let busy = false; // animation de sortie en cours : plus d'action possible
  const dlg = $('#upgrade-popup');
  const row = h('div', { class: 'up-options' });
  const stage = h('div', { class: 'up-stage' }, row);
  const secActive = (x) => x.c !== 'driver' || (state.perks.Tech_Central_Perk_2_1 || 0) >= 1;
  const rollKeys = (i) => (i === 0 ? null : rolls[i - 1].map((p) => p.key).filter(Boolean));
  const motion = !reducedMotion();
  // Bouton « Améliorer » unique (upgradeBtnContainer) : il glisse sous l'option survolée et se valide en maintenant
  // le clic 0,5 s (action upgrade_cyberware, r6/config/inputContexts.xml) ; barre de progression = LinearWipe du jeu.
  const bar = h('span', { class: 'up-btn-bar' });
  const btn = h('button', { type: 'button', class: 'up-btn' }, bar,
    h('span', { class: 'up-btn-label', text: upgrade ? g(game.ui.upgrade) || t('upgrade') : t('statPick') }),
    upgrade ? matEl(u.mat, u.n) : null);
  stage.append(btn);
  let optionEls = [];
  // Déplacement du bouton : 0,3 s, Sinusoidal / EasyOut (MoveButtonToOption, ripperdocTokenPopup.script)
  function placeButton(instant) {
    const card = optionEls[sel];
    if (!card) return;
    btn.style.transition = instant || !motion ? 'none' : '';
    btn.style.width = `${card.offsetWidth}px`;
    btn.style.transform = `translate(${card.offsetLeft}px, ${card.offsetTop + card.offsetHeight + 10}px)`;
  }
  // Pendant l'intro, le survol est seulement noté puis appliqué à la fin (m_introAnimationPlaying)
  let introPlaying = false, pending = null;
  function select(i) {
    if (introPlaying) { pending = i; return; }
    if (busy || !optionEls[i]) return;
    if (sel !== i) play('ui_menu_hover');
    sel = i;
    optionEls.forEach((el, j) => { el.classList.toggle('sel', j === i); el.setAttribute('aria-pressed', String(j === i)); });
    placeButton(false);
  }
  // Petit écran (fiches empilées) : après un appui, fait défiler pour que le bouton soit visible
  // au-dessus de la barre « Annuler »
  function revealButton() {
    const box = btn.closest('dialog');
    if (!box || box.scrollHeight <= box.clientHeight) return;
    setTimeout(() => {
      const r = btn.getBoundingClientRect();
      const bar = box.querySelector('.up-hints');
      const limit = (bar ? bar.getBoundingClientRect().top : box.clientHeight) - 12;
      if (r.bottom > limit) box.scrollBy({ top: r.bottom - limit, behavior: reducedMotion() ? 'auto' : 'smooth' });
      else if (r.top < 0) box.scrollBy({ top: r.top - 12, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }, motion ? (introPlaying ? 860 : 320) : 0);
  }
  const optionCard = (i, card) => h('div', {
    class: `up-card opt ${sel === i ? 'sel' : ''}`, tabIndex: 0, role: 'button', 'aria-pressed': String(sel === i),
    onmouseenter: () => select(i), onfocus: () => select(i), onclick: () => { select(i); revealButton(); },
  }, card);
  function render() {
    // Fiche actuelle (cadre cyan), puis la flèche d'amélioration
    const cards = [h('div', { class: 'up-card cur' }, gameCard(fam, s.q))];
    cards.push(h('div', { class: 'up-arrow', 'aria-hidden': 'true' }, h('img', { src: 'assets/ui/upgrade_arrow.png', alt: '' })));
    // Option 1 : mêmes stats secondaires, au nouveau palier
    const keepSec = (tier.sec || []).map((x) => h('div', { class: `gc-stat ${secActive(x) ? '' : 'off'}` },
      h('b', { text: secActive(x) ? fmtStat(x.s, x.v * boost) : '—' }), h('span', { text: statLabel(x.s) + (x.c === 'driver' ? ' ⚙' : '') })));
    optionEls = [optionCard(0, gameCard(fam, targetQ, { secBlock: keepSec }))];
    // Options 2 / 3 : stats tirées au hasard ; on choisit les stats visées (plages de valeurs du jeu)
    rolls.forEach((picks, ri) => {
      const taken = new Set(picks.map((p) => p.key).filter(Boolean));
      const block = h('div', { class: 'up-random' },
        h('p', { class: 'up-random-note', text: t('statRandomShort') }),
        picks.map((p) => h('label', { class: 'choice-pick' },
          h('span', { text: GROUPS.find(([g0]) => g0 === p.group)[1] }),
          h('select', { onchange: (e) => { p.key = e.target.value || null; sel = ri + 1; render(); } },
            h('option', { value: '', text: t('statAny') }),
            rs.lists[p.group].map((k) => { const m = rs.mods[k]; return h('option', { value: k, selected: p.key === k, disabled: taken.has(k) && p.key !== k, text: `${statLabel(m.stat)} (${rangeText(m.stat, m.min * boost, m.max * boost)})` }); })))));
      optionEls.push(optionCard(ri + 1, gameCard(fam, targetQ, { secBlock: block })));
    });
    fill(row, cards, optionEls);
    requestAnimationFrame(() => placeButton(true));
  }
  // Maintien du clic (ou d'Entrée / Espace) : ui_menu_item_crafting_start, relâché trop tôt = ui_menu_item_crafting_fail
  const HOLD_MS = 500;
  let holdStart = 0, raf = 0, holdTimer = 0;
  // la barre suit l'affichage ; la validation, elle, tombe à 0,5 s même si l'affichage est ralenti
  function tick() {
    const p = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
    bar.style.width = `${p * 100}%`;
    if (p < 1) raf = requestAnimationFrame(tick);
  }
  function startHold() {
    if (busy || holdStart) return;
    holdStart = performance.now();
    btn.classList.add('holding');
    play('ui_menu_item_crafting_start');
    tick();
    holdTimer = setTimeout(() => endHold(true), HOLD_MS);
  }
  function endHold(done) {
    if (!holdStart) return;
    cancelAnimationFrame(raf);
    clearTimeout(holdTimer);
    holdStart = 0;
    btn.classList.remove('holding');
    if (done) { outro(); return; }
    play('ui_menu_item_crafting_fail');
    bar.style.width = '0';
  }
  btn.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.preventDefault(); startHold(); } });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => endHold(false));
  btn.addEventListener('contextmenu', (e) => e.preventDefault()); // appui long sur téléphone : pas de menu
  btn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); startHold(); } });
  btn.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') endHold(false); });
  // Flèches gauche / droite : option précédente / suivante (popup_moveLeft / popup_moveRight)
  stage.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const n = optionEls.length;
    select((sel + (e.key === 'ArrowRight' ? 1 : n - 1)) % n);
    optionEls[sel].focus({ preventScroll: true });
  });
  // Intro (choiceIntro, ripperdoc_token_popup_animations.inkanim) : la fiche actuelle apparaît zoomée (1,3 → 1),
  // puis les fiches partent du centre vers leur place (0,3 s, Quintic / EasyInOut) et la flèche s'allume.
  const QUINTIC = 'cubic-bezier(0.83, 0, 0.17, 1)';
  function intro() {
    if (!motion) return;
    const cards = [row.querySelector('.up-card.cur'), ...optionEls];
    const arrow = row.querySelector('.up-arrow');
    const cx = arrow.offsetLeft + arrow.offsetWidth / 2;
    cards.forEach((el, i) => {
      const dx = cx - (el.offsetLeft + el.offsetWidth / 2);
      el.animate([{ opacity: 0, transform: `translateX(${dx}px) scale(${i ? 1 : 1.3})` }, { opacity: 1, transform: `translateX(${dx}px) scale(1)`, offset: 0.33 },
        { opacity: 1, transform: `translateX(${dx}px)`, offset: 0.44 }, { opacity: 1, transform: 'translateX(0)' }], { duration: 533, easing: 'linear', fill: 'backwards' });
    });
    arrow.animate([{ opacity: 0 }, { opacity: 0, offset: 0.81 }, { opacity: 1 }], { duration: 533 });
    btn.animate([{ opacity: 0 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }], { duration: 600 });
    introPlaying = true;
    setTimeout(() => { introPlaying = false; if (pending !== null) select(pending); }, 533);
  }
  // Sortie (choice1Outro…) : la fiche choisie glisse au centre (0,471 s, Qubic / EasyInOut), les autres s'effacent (0,2 s),
  // un balayage passe sur la fiche, puis elle s'efface (à 1,8 s, 0,35 s) ; le choix est appliqué à la fin.
  function outro() {
    busy = true;
    const keys = rollKeys(sel);
    if (!motion) { commit(keys); return; }
    const card = optionEls[sel];
    const dx = stage.offsetWidth / 2 - (card.offsetLeft + card.offsetWidth / 2);
    card.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }], { duration: 471, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' });
    for (const el of [...row.children, btn, dlg.querySelector('.up-help'), dlg.querySelector('.up-hints')]) {
      if (el && el !== card) el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    }
    card.append(h('div', { class: 'up-scan', 'aria-hidden': 'true' }));
    card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 349, delay: 1799, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => commit(keys), 2150);
  }
  // valide le choix : en amélioration, l'implant passe au palier suivant
  // r : null = stats actuelles ; tableau = pièce aléatoire (stats visées ; les cases « au hasard » restent inconnues)
  function commit(r) {
    const next = { k: s.k, q: targetQ };
    if (r) next.r = r;
    // palier acheté conservé : le prix d'achat et les composants dépensés restent comptés
    const bought = Number.isInteger(s.b) ? s.b : s.q;
    if (bought < targetQ) next.b = bought;
    state.slots[areaId][slotIndex] = next;
    play('ui_menu_item_crafting_done');
    busy = false;
    dlg.close();
    update();
  }
  const help = canRandom ? t('statRandomNote') : areaId === 'SystemReplacementCW' ? t('statNoChoiceOS') : t('statNoChoicePerk');
  fill(dlg,
    h('div', { class: 'up-bg' }),
    h('div', { class: 'up-main' }, stage, h('p', { class: 'up-help', text: help })),
    h('div', { class: 'up-hints' },
      h('button', { type: 'button', class: 'rd-hint', onclick: () => { if (!busy) dlg.close(); } }, h('span', { class: 'key', text: 'Échap' }), h('span', { text: g(game.ui.cancel) || t('close') }))));
  // Échap pendant l'animation de sortie : ignoré (le choix est déjà validé)
  dlg.oncancel = (e) => { if (busy) e.preventDefault(); };
  dlg.onclose = () => { cancelAnimationFrame(raf); clearTimeout(holdTimer); holdStart = 0; };
  render();
  play('ui_gui_tab_change');
  dlg.showModal();
  requestAnimationFrame(() => { placeButton(true); intro(); });
  upgradeReflow = () => placeButton(true);
}
// Redimensionnement de la fenêtre : le bouton reste sous l'option choisie
let upgradeReflow = null;
addEventListener('resize', () => { if (upgradeReflow && $('#upgrade-popup').open) upgradeReflow(); });
// Animations réduites : option « Réduire les animations » du site, ou réglage du système
const reducedMotion = () => reduceMotionOpt || matchMedia('(prefers-reduced-motion: reduce)').matches;


// ---------------------------------------------------------------- fiche détaillée
function tierTable(fam) {
  const tiers = fam.t.map((tier) => effectiveTier(state, fam, fam.t.indexOf(tier)));
  const statKeys = [...new Set(tiers.flatMap((x) => Object.keys(x.st || {})))];
  const secKeys = [...new Map(tiers.flatMap((x) => (x.sec || []).map((s) => [s.s, s]))).values()];
  const rows = [];
  rows.push(h('tr', {}, h('td', { text: t('cost') }), tiers.map((x) => h('td', { text: tierCost(state, x) }))));
  rows.push(h('tr', {}, h('td', { text: t('price') }), fam.t.map((x, i) => h('td', { text: x.price ? eddies(priceOf(fam, i)) : '—' }))));
  if (fam.t.some((x) => x.up)) rows.push(h('tr', {}, h('td', {}, t('upgradeCost'), h('span', { class: 'hint', text: ` (${t('fromPrev')})` })),
    fam.t.map((x) => h('td', {}, x.up ? matEl(x.up.mat, x.up.n) : '—'))));
  for (const s of statKeys) rows.push(h('tr', {}, h('td', { text: statLabel(s) }), tiers.map((x) => h('td', { text: x.st && x.st[s] !== undefined ? fmtStat(s, x.st[s]) : '—' }))));
  if (tiers.some((x) => x.dps)) rows.push(h('tr', {}, h('td', { text: t('dps') }), tiers.map((x) => h('td', { text: x.dps ? num(x.dps, 1) : '—' }))));
  if (tiers.some((x) => x.capb)) rows.push(h('tr', {}, h('td', { text: t('capGiven') }), tiers.map((x) => h('td', { text: x.capb ? `+${num(x.capb, 0)}` : '—' }))));
  for (const sec of secKeys) {
    const cond = sec.c === 'driver' ? ` (${t('condDriver')})` : sec.c === 'quality' ? ` (${t('condQuality')})` : '';
    rows.push(h('tr', {}, h('td', {}, `${t('secondary')} · ${statLabel(sec.s)}`, cond ? h('span', { class: 'hint', text: cond }) : null),
      tiers.map((x) => { const v = (x.sec || []).find((y) => y.s === sec.s); return h('td', { text: v ? fmtStat(sec.s, v.v) : '—' }); })));
  }
  const maxFx = Math.max(0, ...tiers.map((x) => (x.fx || []).length));
  for (let i = 0; i < maxFx; i++) {
    rows.push(h('tr', {}, h('td', { text: `${t('effects')} ${maxFx > 1 ? i + 1 : ''}` }),
      tiers.map((x) => {
        const fx = (x.fx || [])[i];
        const attVal = x.att ? x.att.p * state.attrs[x.att.a] : null;
        return h('td', { class: 'fx' }, fx ? rich(effectText(fx, fx.att ? attVal : null)) : '—');
      })));
  }
  return h('div', { class: 'tiertable-wrap' }, h('table', { class: 'tiers' },
    h('thead', {}, h('tr', {}, h('th', { text: t('stat') }), tiers.map((x) => h('th', { class: qClass(x), text: qualityName(x.q) + (x.boosted ? ' ★' : '') })))),
    h('tbody', {}, rows)));
}
function openDetail(fam) {
  const dlg = $('#detail');
  const others = (game.byArea.get(fam.area) || []).filter((f) => f !== fam).sort((a, b) => g(a.n).localeCompare(g(b.n)));
  const compareBox = h('div');
  const boosted = fam.area === 'MusculoskeletalSystemCW' && state.perks.Tech_Central_Milestone_3 >= 3 && fam.t.some((x) => x.side);
  fill(dlg,
    h('div', { class: 'sheet-head' }, h('h2', { text: g(fam.n) }),
      h('button', { type: 'button', class: 'btn', text: t('close'), onclick: () => dlg.close() })),
    h('div', { class: 'sheet-body' },
      h('div', { class: 'detail-top' },
        fam.icon ? h('img', { src: `assets/${fam.icon}`, alt: '' }) : h('span'),
        h('div', {},
          h('p', {}, areaName(fam.area), ' ', badges(fam)),
          h('p', { text: g(fam.d) }),
          boosted ? h('p', { class: 'hint', text: `★ ${t('boosted')}` }) : null)),
      h('h2', { class: 'hint', text: t('tierTable') }),
      tierTable(fam),
      others.length ? h('div', { class: 'toolbar', style: 'margin-top:14px' },
        h('label', { text: t('compare') }),
        h('select', { onchange: (e) => {
          const other = game.byKey.get(e.target.value);
          compareBox.replaceChildren(...(other ? [h('h2', { class: 'hint', text: g(other.n) }), tierTable(other)] : []));
        } }, h('option', { value: '', text: t('compareNone') }), others.map((o) => h('option', { value: o.k, text: g(o.n) })))) : null,
      compareBox));
  dlg.showModal();
}

// ---------------------------------------------------------------- catalogue
const CATALOG_DEFAULT = { q: '', area: '', stat: '', tier: '', sold: false, iconic: false, dlc: false, sort: 'name' };
// filtres du catalogue retenus d'une visite à l'autre
const catalog = { ...CATALOG_DEFAULT };
try { Object.assign(catalog, JSON.parse(localStorage.getItem('catalog') || '{}')); } catch { /* ignoré */ }
const saveCatalog = () => { try { localStorage.setItem('catalog', JSON.stringify(catalog)); } catch { /* ignoré */ } };
function renderCatalogFilters() {
  const statKeys = [...new Set(game.families.flatMap((f) => f.t.flatMap((x) => [...Object.keys(x.st || {}), ...(x.sec || []).map((s) => s.s)])))]
    .sort((a, b) => statLabel(a).localeCompare(statLabel(b)));
  const check = (key, label) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: catalog[key], onchange: (e) => { catalog[key] = e.target.checked; renderCatalog(); } }), h('span', { text: label }));
  fill($('#catalog-filters'),
    h('input', { type: 'search', placeholder: t('search'), 'aria-label': t('search'), value: catalog.q, oninput: (e) => { catalog.q = e.target.value; renderCatalog(); } }),
    h('select', { 'aria-label': t('allAreas'), onchange: (e) => { catalog.area = e.target.value; renderCatalog(); } },
      h('option', { value: '', text: t('allAreas') }), game.areas.map((a) => h('option', { value: a.id, selected: catalog.area === a.id, text: g(a.n) }))),
    h('select', { 'aria-label': t('allStats'), onchange: (e) => { catalog.stat = e.target.value; renderCatalog(); } },
      h('option', { value: '', text: t('allStats') }), statKeys.map((s) => h('option', { value: s, selected: catalog.stat === s, text: statLabel(s) }))),
    h('select', { 'aria-label': t('allTiers'), onchange: (e) => { catalog.tier = e.target.value; renderCatalog(); } },
      h('option', { value: '', text: t('allTiers') }), Object.keys(game.qualities).filter((q) => q !== 'Iconic').map((q) => h('option', { value: q, selected: catalog.tier === q, text: qualityName(q) }))),
    check('sold', t('soldOnly')), check('iconic', t('iconicOnly')), check('dlc', t('dlcOnly')),
    h('label', { class: 'sort' }, h('span', { text: t('sortBy') }),
      h('select', { onchange: (e) => { catalog.sort = e.target.value; renderCatalog(); } },
        [['name', t('sortName')], ['price', t('sortPrice')], ['cap', t('sortCap')], ['armor', t('sortArmor')]]
          .map(([v, l]) => h('option', { value: v, selected: catalog.sort === v, text: l })))));
}
// Étiquettes des filtres actifs (✕ pour retirer un filtre) + « Effacer les filtres »
function catalogChips() {
  const chip = (label, clear) => h('button', { type: 'button', class: 'chip', onclick: () => { clear(); play('ui_menu_onpress'); renderCatalogFilters(); renderCatalog(); } },
    label, h('span', { class: 'x', 'aria-hidden': 'true', text: '✕' }));
  const list = [
    catalog.q.trim() ? chip(`« ${catalog.q.trim()} »`, () => { catalog.q = ''; }) : null,
    catalog.area ? chip(areaName(catalog.area), () => { catalog.area = ''; }) : null,
    catalog.stat ? chip(statLabel(catalog.stat), () => { catalog.stat = ''; }) : null,
    catalog.tier ? chip(qualityName(catalog.tier), () => { catalog.tier = ''; }) : null,
    catalog.sold ? chip(t('soldOnly'), () => { catalog.sold = false; }) : null,
    catalog.iconic ? chip(t('iconicOnly'), () => { catalog.iconic = false; }) : null,
    catalog.dlc ? chip(t('dlcOnly'), () => { catalog.dlc = false; }) : null,
  ].filter(Boolean);
  if (list.length > 1) list.push(h('button', { type: 'button', class: 'chip clear', text: t('clearFilters'),
    onclick: () => { Object.assign(catalog, CATALOG_DEFAULT, { sort: catalog.sort }); play('ui_menu_onpress'); renderCatalogFilters(); renderCatalog(); } }));
  return list;
}
function renderCatalog() {
  saveCatalog();
  const q = catalog.q.trim().toLowerCase();
  const hasStat = (x) => !catalog.stat || (x.st && catalog.stat in x.st) || (x.sec || []).some((s) => s.s === catalog.stat);
  const shown = game.families.filter((f) => (!catalog.area || f.area === catalog.area)
    && (!q || g(f.n).toLowerCase().includes(q) || g(f.d).toLowerCase().includes(q))
    && (!catalog.sold || f.sold) && (!catalog.iconic || f.iconic) && (!catalog.dlc || f.dlc)
    && f.t.some((x) => (!catalog.tier || x.q === catalog.tier) && hasStat(x)));
  // tri : valeurs du palier affiché (palier filtré, sinon le plus haut)
  const shownTier = (f) => f.t.find((x) => x.q === catalog.tier) || f.t[f.t.length - 1];
  const key = { price: (f) => shownTier(f).price || Infinity, cap: (f) => shownTier(f).cost || 0, armor: (f) => -((shownTier(f).st || {}).Armor || 0) }[catalog.sort];
  shown.sort((a, b) => (key ? key(a) - key(b) : 0) || g(a.n).localeCompare(g(b.n)));
  $('#catalog-count').replaceChildren(t('results', shown.length), ...catalogChips());
  $('#catalog-list').replaceChildren(...shown.map((fam) => {
    const tier = fam.t.find((x) => x.q === catalog.tier) || fam.t[fam.t.length - 1];
    const statLine = catalog.stat
      ? [tier.st && tier.st[catalog.stat] !== undefined ? fmtStat(catalog.stat, tier.st[catalog.stat]) : null,
        ...(tier.sec || []).filter((s) => s.s === catalog.stat).map((s) => fmtStat(s.s, s.v))].filter(Boolean).join(' · ')
      : '';
    return h('button', { type: 'button', class: 'card', onclick: () => openDetail(fam), onmouseenter: () => play('ui_menu_hover') },
      fam.icon ? h('img', { src: `assets/${fam.icon}`, alt: '', loading: 'lazy' }) : h('span'),
      h('div', {},
        h('div', { class: 'name', text: g(fam.n) }),
        h('div', { class: 'meta', text: `${areaName(fam.area)} · ${qualityName(fam.t[0].q)} → ${qualityName(fam.t[fam.t.length - 1].q)}` }),
        h('div', { class: 'meta' }, `${t('cost')} ${tier.cost}`, tier.price ? ` · ${eddies(tierPrice(state, game, tier))}` : '', statLine ? ` · ${statLabel(catalog.stat)} ${statLine}` : ''),
        h('div', {}, badges(fam))));
  }));
}

// ---------------------------------------------------------------- à propos
function renderAbout() {
  const fr = getLang() === 'fr';
  const p = (text) => h('p', { text });
  fill($('#about'),
    h('h2', { text: t('tabAbout') }),
    fr ? p('Ce planner reproduit l’écran du charcudoc de Cyberpunk 2077 pour préparer un build de cyberware hors du jeu. Toutes les valeurs (implants, paliers, coûts, stats, textes, icônes, sons) sont extraites des fichiers du jeu installé (REDmod et archives, via WolvenKit), sans recours aux wikis — sauf la façon d’obtenir quelques implants non vendus, signalée « info communautaire » avec sa source.')
      : p('This planner recreates the Cyberpunk 2077 ripperdoc screen so you can plan a cyberware build outside the game. All values (cyberware, tiers, costs, stats, texts, icons, sounds) are extracted from the installed game files (REDmod and archives, via WolvenKit), not from wikis — except how to get a few unsold items, marked “community info” with its source.'),
    h('h2', { text: fr ? 'Ce qui est calculé' : 'What is calculated' }),
    h('ul', {}, (fr ? [
      'Capacité max : 21 + 3 par niveau + compétence Tech + perk « Dépassement des limites » + éclats + Compresseur de chrome.',
      'Coût : fixe par implant, −20 % sur le squelette et le système tégumentaire avec « Cyberbricoleuse » niveau 2.',
      'Edgerunner : jusqu’à 50 points de dépassement, −0,5 % de santé max par point.',
      'Armure : somme des implants, des stats secondaires actives, de « Pro du chrome » niveau 2 et de la compétence Tech.',
      'Stats secondaires : +10 % par perk « Cyberbricoleuse » / « Pro du chrome » (niveau 1) ; les « Toggle » demandent « Mise à jour des pilotes ».',
      'Squelette : avec « Pro du chrome » niveau 3, les versions renforcées (★) remplacent les normales.',
    ] : [
      'Max capacity: 21 + 3 per level + Tech skill + “{perk:Tech_Central_Perk_2_2}” perk + shards + Chrome Compressor.',
      'Cost: fixed per item, −20% on skeleton and integumentary system with “{perk:Tech_Central_Milestone_2}” level 2.',
      'Edgerunner: up to 50 points over capacity, −0.5% max health per point.',
      'Armor: sum of items, active secondary stats, “{perk:Tech_Central_Milestone_3}” level 2 and Tech skill.',
      'Secondary stats: +10% per “{perk:Tech_Central_Milestone_2}” / “{perk:Tech_Central_Milestone_3}” perk (level 1); “Toggle” ones need “{perk:Tech_Central_Perk_2_1}”.',
      'Skeleton: with “{perk:Tech_Central_Milestone_3}” level 3, enhanced versions (★) replace the normal ones.',
    ].map((x) => x.replace(/\{perk:(\w+)\}/g, (_, id) => perkName(id)))).map((x) => h('li', { text: x }))),
    h('h2', { text: fr ? 'Limites connues' : 'Known limits' }),
    h('ul', {}, (fr ? [
      'Le % de réduction des dégâts par l’armure n’est pas affiché : une constante du moteur du jeu n’est pas lisible dans les fichiers.',
      'Les dégâts des bras affichés sont le DPS de base × palier, sans les bonus d’attributs ni de perks.',
      'Les bonus d’attributs (« Sensible à… ») sont affichés dans les effets, pas ajoutés aux stats cumulées.',
    ] : [
      'Armor damage reduction % is not shown: a game engine constant cannot be read from the files.',
      'Arm damage shown is base DPS × tier, without attribute or perk bonuses.',
      'Attribute bonuses (“… Attuned”) are shown in effects, not added to total stats.',
    ]).map((x) => h('li', { text: x }))),
    // mention spéciale : le planificateur officiel (attributs, compétences, perks)
    h('h2', { text: 'Build Planner' }),
    h('p', { class: 'official' }, `${t('officialPlanner')} `,
      h('a', { href: 'https://www.cyberpunk.net/en/build-planner', target: '_blank', rel: 'noopener', text: t('officialPlannerLink') })),
    h('h2', { text: fr ? 'Mentions' : 'Notices' }),
    p(t('fanNotice')), p(t('credits')),
  );
}

// ---------------------------------------------------------------- options (langue, son, affichage)
// iPhone / iPad / Safari : les vidéos du jeu (WebM VP9 avec transparence) n'y sont pas décodées par la puce vidéo
// (lecture lente, voire fond noir) → images fixes par défaut ; l'option « Vidéos » permet de les remettre.
const UA = navigator.userAgent;
const appleWebKit = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1)
  || (/Safari\//.test(UA) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android/.test(UA));
let videosOn = !appleWebKit;
let textSize = 'M'; // taille du texte des panneaux : S / M / L
let reduceMotionOpt = false; // « Réduire les animations »
try {
  const v = localStorage.getItem('videos');
  if (v !== null) videosOn = v !== '0';
  textSize = ['S', 'M', 'L'].includes(localStorage.getItem('textSize')) ? localStorage.getItem('textSize') : 'M';
  reduceMotionOpt = localStorage.getItem('reduceMotion') === '1';
} catch { /* ignoré */ }
const videosWanted = () => videosOn && !reduceMotionOpt;
// Applique les réglages d'affichage à toute la page
function applyDisplay() {
  document.documentElement.dataset.textSize = textSize;
  document.documentElement.classList.toggle('reduce-motion', reducedMotion());
  // vidéos : on ne redessine l'écran que si le réglage change vraiment (sinon les vidéos se rechargent pour rien)
  if (screen && screen.videosAvailable && screen.videosShown !== videosWanted()) screen.setVideos(videosWanted());
}
function renderOptions() {
  const seg = (label, options, current, onPick) => h('div', { class: 'field opt' },
    h('label', { text: label }),
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
      options.map(([v, text]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(current === v), text,
        onclick: () => { if (current !== v) onPick(v); } }))));
  const vol = Math.round(getVolume() * 100);
  const volOut = h('output', { text: `${vol} %` });
  fill($('#options'),
    h('h2', { text: t('tabOptions') }),
    h('section', { class: 'opt-group' },
      h('h3', { text: t('optLanguage') }),
      h('div', { class: 'lang-grid', role: 'radiogroup', 'aria-label': t('optLanguage') },
        LANGUAGES.map((l) => h('button', { type: 'button', role: 'radio', lang: l, 'aria-checked': String(getLang() === l), text: LANG_NAMES[l],
          onclick: async () => { if (getLang() === l) return; await loadLangTexts(l); setLang(l); play('ui_menu_onpress'); renderAll(); } }))),
      h('p', { class: 'hint', text: t('optLanguageHint') })),
    h('section', { class: 'opt-group' },
      h('h3', { text: t('optSound') }),
      seg(t('optSoundFx'), [[false, t('on')], [true, t('off')]], isMuted(), (v) => { setMuted(v); play('ui_menu_onpress'); renderOptions(); }),
      h('div', { class: 'field opt' },
        h('label', { for: 'opt-volume', text: t('optVolume') }), volOut,
        h('input', { id: 'opt-volume', type: 'range', min: 0, max: 100, value: vol, disabled: isMuted(),
          oninput: (e) => { setVolume(+e.target.value / 100); volOut.textContent = `${e.target.value} %`; },
          onchange: () => play('ui_menu_onpress') }))),
    h('section', { class: 'opt-group' },
      h('h3', { text: t('optDisplay') }),
      seg(t('body'), [['man', t('bodyMan')], ['woman', t('bodyWoman')]], gender, (v) => { setGender(v); renderOptions(); }),
      seg(t('optTextSize'), [['S', t('sizeS')], ['M', t('sizeM')], ['L', t('sizeL')]], textSize, (v) => {
        textSize = v;
        try { localStorage.setItem('textSize', v); } catch { /* ignoré */ }
        applyDisplay(); play('ui_menu_onpress'); renderOptions();
      }),
      seg(t('optReduceMotion'), [[true, t('on')], [false, t('off')]], reduceMotionOpt, (v) => {
        reduceMotionOpt = v;
        try { localStorage.setItem('reduceMotion', v ? '1' : '0'); } catch { /* ignoré */ }
        applyDisplay(); play('ui_menu_onpress'); renderOptions();
      }),
      h('p', { class: 'hint', text: t('optReduceMotionHint') }),
      screen && screen.videosAvailable && !reduceMotionOpt ? seg(t('optVideos'), [[true, t('on')], [false, t('off')]], videosOn, (v) => {
        videosOn = v;
        try { localStorage.setItem('videos', v ? '1' : '0'); } catch { /* ignoré */ }
        applyDisplay(); play('ui_menu_onpress'); renderOptions();
      }) : null,
      screen && screen.videosAvailable && !reduceMotionOpt ? h('p', { class: 'hint', text: t('optVideosHint') }) : null));
}

// ---------------------------------------------------------------- navigation et actions
function setView(v) {
  view = v;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  for (const name of ['build', 'catalog', 'options', 'about']) $(`#view-${name}`).hidden = name !== v;
  hideTooltip();
  closeDrawers(false);
  if (v === 'build' && screen) screen.show();
  if (v === 'options') renderOptions();
  if (v === 'catalog') { renderCatalogFilters(); renderCatalog(); }
  if (v === 'about') renderAbout();
}
function renderAll() {
  applyStaticTexts();
  renderSettings();
  update();
  if (screen) screen.render();
  if (view === 'catalog') { renderCatalogFilters(); renderCatalog(); }
  if (view === 'options') renderOptions();
  if (view === 'about') renderAbout();
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { play('ui_gui_tab_change'); setView(b.dataset.view); }));
// Fenêtre de confirmation (Échap / Annuler = rien ne se passe)
function confirmBox(title, text, okLabel, onOk) {
  const dlg = $('#confirm');
  fill(dlg,
    h('h2', { text: title }), h('p', { text }),
    h('div', { class: 'confirm-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, t('cancel'), h('span', { class: 'kbd', text: 'Échap' })),
      h('button', { type: 'button', class: 'btn danger', text: okLabel, onclick: () => { dlg.close(); onOk(); } })));
  play('ui_menu_onpress');
  dlg.showModal();
  dlg.querySelector('.btn').focus();
}
$('#btn-reset').addEventListener('click', () => confirmBox(t('resetTitle'), t('resetText'), t('resetOk'), () => {
  state = defaultState(game); play('ui_menu_item_sold'); renderSettings(); update();
}));
// Partage : copier le lien, réseaux sociaux (le lien contient tout le build), partage natif du téléphone
async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); toast(t('shareCopied')); } catch { window.prompt(t('shareManual'), location.href); }
}
// Téléphone / tablette : le bouton ouvre directement le menu « Partager » du système (iOS, Android) ;
// sur ordinateur (ou si le système refuse), la fenêtre de partage du site
// Téléphone ou tablette : système mobile (Android, iOS, iPadOS), ou écran tactile seul. Le seul test « tactile »
// ne suffit pas : certains Android (stylet S Pen…) se déclarent avec survol et pointeur fin.
const mobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.userAgentData && navigator.userAgentData.mobile)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  || matchMedia('(hover: none) and (pointer: coarse)').matches;
$('#btn-share').addEventListener('click', () => {
  save();
  const data = { title: t('shareText'), text: t('shareText'), url: location.href };
  // Le navigateur intégré de certaines applis (Discord, Instagram… sur Android) n'a pas le partage natif :
  // on ouvre alors la fenêtre du site (copier le lien, réseaux)
  const canNative = navigator.share && (!navigator.canShare || navigator.canShare(data));
  if (canNative && mobileDevice()) {
    play('ui_menu_onpress');
    try {
      navigator.share(data).catch((e) => {
        if (e && e.name !== 'AbortError') openShareDialog(); // annulé par l'utilisateur : rien à faire
      });
    } catch { openShareDialog(); }
    return;
  }
  // Android, navigateur d'appli sans partage web (WebView de Discord, de l'appli Google…) : on demande directement
  // à Android son menu « Partager » (intent ACTION_SEND). Si l'appli bloque la demande, la page reste visible :
  // la fenêtre du site s'ouvre alors au bout d'une seconde.
  if (/Android/i.test(navigator.userAgent)) {
    play('ui_menu_onpress');
    androidShare(data);
    return;
  }
  openShareDialog();
});
function androidShare({ text, url }) {
  const intent = `intent:#Intent;action=android.intent.action.SEND;type=text/plain;`
    + `S.android.intent.extra.TEXT=${encodeURIComponent(`${text} ${url}`)};`
    + `S.android.intent.extra.SUBJECT=${encodeURIComponent(text)};end`;
  let left = false;
  const away = () => { left = true; };
  document.addEventListener('visibilitychange', away, { once: true });
  window.addEventListener('blur', away, { once: true });
  // cadre caché : si l'appli refuse le lien, l'erreur reste dans le cadre et la page du site ne bouge pas
  const frame = h('iframe', { src: intent, style: 'display:none', 'aria-hidden': 'true' });
  document.body.append(frame);
  setTimeout(() => {
    frame.remove();
    document.removeEventListener('visibilitychange', away);
    window.removeEventListener('blur', away);
    if (!left) openShareDialog();
  }, 1000);
}
function openShareDialog() {
  const dlg = $('#share');
  const url = location.href;
  const text = t('shareText');
  const net = (icon, label, href) => h('a', { class: 'share-net', href, target: '_blank', rel: 'noopener', onclick: () => play('ui_menu_onpress') },
    h('span', { class: `share-ico ${icon}`, 'aria-hidden': 'true' }), label);
  fill(dlg,
    h('div', { class: 'share-head' }, h('h2', { text: t('shareTitle') }),
      h('button', { type: 'button', class: 'drawer-close', text: '✕', 'aria-label': t('close'), onclick: () => dlg.close() })),
    h('div', { class: 'share-link' },
      h('input', { type: 'text', readonly: true, value: url, 'aria-label': t('shareTitle'), onfocus: (e) => e.target.select() }),
      h('button', { type: 'button', class: 'btn accent', text: t('shareCopy'), onclick: () => { play('ui_menu_onpress'); copyLink(); } })),
    h('div', { class: 'share-grid' },
      net('reddit', 'Reddit', `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`),
      net('x', 'X', `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`),
      net('whatsapp', 'WhatsApp', `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`),
      net('facebook', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`),
      h('button', { type: 'button', class: 'share-net', onclick: () => { play('ui_menu_onpress'); copyLink(); } }, h('span', { class: 'share-ico discord', 'aria-hidden': 'true' }), t('shareDiscord')),
      navigator.share ? h('button', { type: 'button', class: 'share-net', onclick: () => navigator.share({ title: text, url }).catch(() => {}) },
        h('span', { class: 'share-ico more', 'aria-hidden': 'true' }), t('shareMore')) : null));
  play('ui_menu_onpress');
  dlg.showModal();
}
$('#drawer-backdrop').addEventListener('click', () => closeDrawers());
// Languette du bord gauche : ouvre / ferme le panneau des valeurs
// Languettes des bords : ouvrent / ferment les panneaux (valeurs à gauche, stats à droite)
const toggleDrawer = (id) => { if ($(`#${id}`).classList.contains('open')) closeDrawers(); else openDrawer(id); };
$('#settings-tab').addEventListener('click', () => toggleDrawer('settings'));
$('#summary-tab').addEventListener('click', () => toggleDrawer('summary'));
document.addEventListener('keydown', (e) => {
  // Échap : ferme d'abord un panneau, sinon quitte le mode inventaire (comme « Retour » dans le jeu)
  if (e.key !== 'Escape') return;
  if (document.querySelector('dialog[open]')) return; // la fenêtre ouverte se ferme d'elle-même
  if (document.querySelector('.drawer.open')) closeDrawers();
  else if (screen && view === 'build') screen.back();
});
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/#b=([^&]+)/);
  if (m && decodeURIComponent(m[1]) !== encodeState(state, game)) { state = decodeState(decodeURIComponent(m[1]), game); renderSettings(); update(); }
});

// ---------------------------------------------------------------- démarrage
// Écran de chargement façon jeu : progression réelle du téléchargement des données des implants
async function fetchWithProgress(url, onProgress) {
  const r = await fetch(url);
  const total = +r.headers.get('content-length') || 0;
  if (!r.body || !total) return r.json();
  const reader = r.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const all = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return JSON.parse(new TextDecoder().decode(all));
}
function loadingProgress(p) {
  $('#ld-fill').style.width = `${Math.round(p * 100)}%`;
  $('#ld-text').textContent = `${t('loadingData')} ${Math.round(p * 100)} %`;
}
(async function start() {
  applyDisplay();
  document.querySelector('#loading .ld-title').textContent = t('loading');
  loadingProgress(0);
  const [gameData, soundData] = await Promise.all([
    fetchWithProgress('data/game.json', (p) => loadingProgress(p * 0.9)),
    fetch('data/sounds.json').then((r) => r.json()).catch(() => ({})),
  ]);
  game = indexGame(gameData);
  setPerkNames(perkName);
  initAudio(Object.fromEntries(Object.entries(soundData).map(([k, v]) => [k, { ...v, files: v.files.map((f) => ({ ...f, ogg: `assets/${f.ogg}`, mp3: f.mp3 && `assets/${f.mp3}` })) }])));
  await loadLangTexts(getLang());
  setLang(getLang());
  state = loadInitialState();
  screen = createScreen({
    h, fill, $, game, t, g, num, qualityName, areaName, qClass, play, showTooltip, hideTooltip, showGaugeTip,
    nameAt, compute, slotUnlocked, effectiveTier, tierCost, nextUpgrade, openStatChoice,
    canChoose: (area, slot) => { const s = state.slots[area][slot]; const f = familyOf(s); return !!f && canChooseStats(state, game, area, f, s.q); },
    randomChosen: (area, slot) => !!(state.slots[area][slot] && state.slots[area][slot].r), eddies, priceOf, matEl, upgradeSlot, placeImplant, installedSlot,
    get state() { return state; },
    getGender: () => gender,
    videosOn: videosWanted,
    openDrawer,
    onChange: () => update(),
  });
  try { await screen.load(); } catch (err) { console.error('Écran du charcudoc indisponible', err); screen = null; }
  renderAll();
  setView('build');
  applyDisplay();
  loadingProgress(1);
  const ld = $('#loading');
  ld.classList.add('done');
  setTimeout(() => ld.remove(), reducedMotion() ? 0 : 400);
}());
