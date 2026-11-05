// Écran du charcudoc (bureau) : corps, groupes de slots, jauges, mode inventaire.
// Reproduit RipperDocGameController / RipperdocScreenAnimationController (scripts du jeu) :
//  - mode « Default » : corps + 10 groupes de slots ; survol = surbrillance de la zone (hover_area, 0,233 s),
//    les autres groupes s'estompent ; les jauges montrent le coût / gain prévu ;
//  - clic sur un slot → mode « Item » : animation <zone>_intro (zoom sur la zone), le groupe glisse vers
//    MinigridTargetAnchor, inventaire à gauche avec le sélecteur de zones (flèches, 10 points) ;
//  - Échap / Retour → <zone>_outro, retour au mode Default.

import { RipperdocLayout, REF_W, REF_H, AREA_ANCHORS, MINIGRID_FRAME_W, FILTER_ORDER, playInkAnimation } from './ripperdoc.js';

const BAR_COUNT = 50;           // RipperdocMetersCapacity.BAR_COUNT
const BAR_GAPS = [10, 20, 30, 40]; // m_barGaps
const OVERCHARGE_VALUE = 50;    // m_overchargeValue

export function createScreen(ctx) {
  const { h, fill, $, game, t, g, num, qualityName, areaName, qClass, play, showTooltip, hideTooltip, showGaugeTip } = ctx;
  let layout = null;
  let videos = {};
  let allVideos = {};
  let mode = 'default';   // 'default' | 'item'
  let filterArea = null;  // zone ouverte en mode inventaire
  let filterSlot = 0;
  let hoverArea = null;
  let previewTier = null; // implant survolé (aperçu sur les jauges)
  let tierFilter = null;  // palier choisi dans l'inventaire
  let stage = null;
  let gender = ctx.getGender();

  // ------------------------------------------------------------ mise à l'échelle 4K → fenêtre
  function fit() {
    const vp = $('#rd-viewport');
    if (!vp || !stage) return;
    const k = Math.min(vp.clientWidth / REF_W, vp.clientHeight / REF_H);
    if (!k) return; // onglet caché : on garde l'échelle actuelle, recalculée quand l'écran réapparaît
    stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  }
  window.addEventListener('resize', fit);
  // Recalcule l'échelle dès que la zone change de taille (retour sur l'onglet Build, panneau, fenêtre)
  if (window.ResizeObserver) new ResizeObserver(() => fit()).observe($('#rd-viewport'));

  // La vidéo de zoom de cette zone est-elle disponible (convertie depuis le Bink 2 du jeu) ?
  function zoomable(area) {
    const v = layout.itemVideo(gender, area);
    return !!(v && v.video && videos[v.video.replace('.bk2', '')]);
  }
  // Mode inventaire sans vidéo : la zone reste illuminée sur le corps, sans zoom
  function showItemHighlight(area) {
    stage.querySelectorAll('.rd-hover').forEach((el) => { el.getAnimations().forEach((a) => a.cancel()); el.style.opacity = el.dataset.area === area ? '1' : '0'; });
  }

  // ------------------------------------------------------------ corps (Paperdoll_default_tab + Paperdoll_Item_tab)
  const abs = (w, parent) => {
    const r = w.rect, p = parent ? parent.rect : { x: 0, y: 0 };
    const s = `left:${r.x - p.x}px;top:${r.y - p.y}px;width:${r.w}px;height:${r.h}px;`;
    const sc = w.scale && (w.scale[0] !== 1 || w.scale[1] !== 1) ? `transform:scale(${w.scale[0]},${w.scale[1]});` : '';
    return s + sc;
  };
  // Vidéos : seule la boucle du corps est chargée tout de suite ; celles des zones attendent que la page soit au repos
  // (preload « metadata », puis « auto » via warmVideos) pour un premier affichage rapide.
  // Une fois le corps affiché et la page au repos, les vidéos des zones se chargent en arrière-plan, une par une
  function warmVideos(root) {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
    const list = [...root.querySelectorAll('video.rd-media:not(.rd-base)')];
    const next = () => {
      const v = list.shift();
      if (!v || !v.isConnected) return;
      v.preload = 'auto';
      let done = false;
      const go = () => { if (!done) { done = true; idle(next); } };
      v.addEventListener('canplaythrough', go, { once: true });
      v.addEventListener('error', go, { once: true });
      if (v.paused && v.readyState < 4) v.load(); else go();
    };
    idle(next);
  }
  function media(w, parent, { fallbackPart, dim, eager = false } = {}) {
    const file = w.video ? videos[w.video.replace('.bk2', '')] : null;
    const style = abs(w, parent) + (w.opacity !== 1 ? `opacity:${w.opacity};` : '');
    if (file) {
      const v = h('video', { class: 'rd-media', 'data-path': w.path, style, muted: true, playsinline: true, preload: eager ? 'auto' : 'metadata', src: file });
      v.muted = true;
      return v;
    }
    const part = fallbackPart || layout.partFile(w.texture);
    if (!part) return h('div', { 'data-path': w.path, style });
    return h('img', { class: `rd-media ${dim ? 'dim' : ''}`, 'data-path': w.path, style, src: `assets/ui/${part}.png`, alt: '' });
  }
  function buildDoll() {
    const def = layout.w('Paperdoll_default_tab');
    const item = layout.w('Paperdoll_Item_tab');
    const wrapper = layout.w('paperDollWrapper');
    const genderBox = layout.w(gender === 'man' ? 'maleHovers' : 'femaleHovers');
    const body = layout.w(`paperdoll_${gender}_body_video`);
    const skeleton = layout.w(`paperdoll_${gender}_skeleton`);
    // Corps de base : vidéo en boucle du jeu ; à défaut (vidéo pas encore convertie), la silhouette « squelette » atténuée
    const base = videos[body.video.replace('.bk2', '')]
      ? Object.assign(media(body, genderBox, { eager: true }), { loop: true, autoplay: true })
      : media(skeleton, genderBox, { dim: true });
    base.classList.add('rd-base');
    base.removeAttribute('data-path');
    const hovers = Object.keys(AREA_ANCHORS).concat('ImmuneSystemCW').map((area) => {
      const w = layout.hoverWidget(gender, area);
      if (!w) return null;
      const el = media(w, genderBox);
      el.classList.add('rd-hover');
      el.dataset.area = area;
      el.style.opacity = '0';
      return el;
    });
    const itemCanvases = Object.keys(AREA_ANCHORS).map((area) => {
      const c = layout.itemCanvas(area);
      const v = layout.itemVideo(gender, area);
      if (!c || !v) return null;
      // Sans vidéo convertie, pas de zoom : le canvas reste vide et la zone est illuminée sur le corps (voir zoomable)
      return h('div', { class: 'rd-box rd-itemcanvas', 'data-path': c.path, 'data-area': area, style: `${abs(c, item)}opacity:0;` },
        zoomable(area) ? Object.assign(media(v, c), { loop: true }) : null);
    });
    return h('div', { class: 'rd-box', 'data-path': wrapper.path, style: abs(wrapper) },
      h('div', { class: 'rd-box', 'data-path': item.path, style: abs(item, wrapper) }, itemCanvases),
      h('div', { class: 'rd-box rd-default', 'data-path': def.path, style: abs(def, wrapper) },
        h('div', { class: 'rd-box', 'data-path': genderBox.path, style: abs(genderBox, def) }, base, hovers)));
  }

  // ------------------------------------------------------------ groupes de slots (CyberwareInventoryMiniGrid)
  function slotEl(area, i) {
    const a = game.areas.find((x) => x.id === area);
    const slot = a.slots[i];
    const s = ctx.state.slots[area][i];
    const fam = s ? game.byKey.get(s.k) : null;
    const unlocked = ctx.slotUnlocked(ctx.state, slot);
    if (!unlocked && slot.u && slot.u.type === 'fact' && !fam) return null; // slot du masque caché tant que la quête n'est pas faite
    const tier = fam ? ctx.effectiveTier(ctx.state, fam, s.q) : null;
    const selected = mode === 'item' && area === filterArea && i === filterSlot;
    return h('button', {
      type: 'button',
      class: `rd-slot ${fam ? `filled ${qClass(tier)}` : ''} ${unlocked ? '' : 'locked'} ${selected ? 'selected' : ''}`,
      'aria-label': `${areaName(area)} ${i + 1} : ${fam ? ctx.nameAt(fam, s.q) : unlocked ? t('empty') : t('locked')}`,
      onmouseenter: (e) => {
        play('ui_menu_hover');
        setHover(area);
        if (fam) { showTooltip(e.currentTarget, fam, s.q); previewTier = { area, slot: i, remove: true, tier }; drawGauges(); }
      },
      onmouseleave: () => { hideTooltip(); setHover(null); previewTier = null; drawGauges(); },
      onclick: () => {
        hideTooltip();
        if (!unlocked) { play('ui_menu_attributes_fail'); return; }
        play('ui_menu_onpress');
        enterItemMode(area, i);
      },
      oncontextmenu: (e) => { // clic droit : retirer (comme « unequip_item »)
        e.preventDefault();
        if (fam) { ctx.state.slots[area][i] = null; play('ui_menu_item_sold'); hideTooltip(); ctx.onChange(); }
      },
    },
    fam && fam.icon ? h('img', { src: `assets/${fam.icon}`, alt: '' }) : h('span', { class: unlocked ? 'rd-socket' : 'rd-socket lock' }),
    fam ? h('span', { class: 'rd-tier', text: qualityName(fam.t[s.q].q).replace(/^\D+/, '') }) : null);
  }
  function minigrid(area) {
    const an = layout.anchor(area);
    if (!an) return null;
    const a = game.areas.find((x) => x.id === area);
    const inItem = mode === 'item' && area === filterArea;
    // En mode inventaire, le groupe sélectionné rejoint MinigridTargetAnchor ; les autres disparaissent
    const target = layout.w('MinigridTargetAnchor');
    const x = inItem ? target.rect.x : an.side === 'left' ? an.x : an.x;
    const y = inItem ? target.rect.y : an.y;
    const side = inItem ? 'right' : an.side;
    const hidden = (mode === 'item' && !inItem) || (mode === 'default' && hoverArea && hoverArea !== area);
    return h('div', {
      class: `rd-minigrid ${side} ${hidden ? (mode === 'item' ? 'gone' : 'dim') : ''}`,
      'data-area': area,
      style: `left:${x}px;top:${y}px;width:${MINIGRID_FRAME_W}px;`,
      onmouseenter: () => { if (mode === 'default') setHover(area); },
      onmouseleave: () => { if (mode === 'default') setHover(null); },
    },
    h('div', { class: 'rd-label', text: areaName(area) }),
    h('div', { class: 'rd-slots' }, a.slots.map((_, i) => slotEl(area, i))));
  }

  // ------------------------------------------------------------ jauges (RipperdocMetersCapacity / RipperdocMetersArmor)
  function barsColumn(kind, cur, preview, max, possible, overMax, invalid) {
    const n = BAR_COUNT;
    const total = Math.max(possible, max + overMax, cur + Math.max(0, preview));
    const toBars = (v) => Math.min(n, Math.round((n * v) / total));
    const curBars = toBars(cur);
    const newBars = toBars(cur + preview);
    const maxBars = toBars(max);
    const overBars = toBars(max + overMax);
    const bars = [];
    for (let i = 0; i < n; i++) {
      let cls = '';
      const safe = i < maxBars;
      if (i < Math.min(curBars, newBars)) cls = safe ? 'on' : 'over';
      else if (i < newBars) cls = safe || kind === 'armor' ? 'add' : 'add over';
      else if (i < curBars) cls = 'remove';
      else if (!safe && i < overBars) cls = 'zone';
      if (invalid && i >= maxBars && i < curBars) cls = 'bad';
      bars.push(h('i', { class: `rd-bar ${cls} ${BAR_GAPS.includes(i) ? 'gap' : ''}` }));
    }
    return { bars, curBars, maxBars, newBars };
  }
  function gauge(kind, { cur, preview, max, possible, overMax = 0, invalid = false, maxLabel }) {
    const col = barsColumn(kind, cur, preview, max, possible, overMax, invalid);
    const pitch = 27; // CapacityMeterBar : barre de 9 px + marges 9/9
    const gapPx = 14;
    const yOf = (bar) => (BAR_COUNT - bar) * pitch + BAR_GAPS.filter((gIdx) => gIdx >= bar).length * gapPx;
    const w = layout.w(kind === 'capacity' ? 'capacity_bar' : 'armor_bar');
    // Survol (OnBarHover, ripperdoc.script) : infobulle de la jauge ; pour l'armure, seuls les groupes
    // Squelette, Système tégumentaire et Jambes restent visibles (en mode par défaut)
    const ARMOR_AREAS = ['IntegumentarySystemCW', 'MusculoskeletalSystemCW', 'LegsCW'];
    const hover = (on, tipKind, e) => {
      if (on) { play('ui_menu_hover'); showGaugeTip(e.currentTarget, tipKind); } else hideTooltip();
      if (kind === 'armor' && mode === 'default') {
        stage.querySelectorAll('.rd-minigrid').forEach((el) => el.classList.toggle('dim', on && !ARMOR_AREAS.includes(el.dataset.area)));
      }
    };
    return h('div', { class: `rd-gauge ${kind}`, style: `left:${w.rect.x}px;top:${w.rect.y}px;`,
      onmouseenter: (e) => hover(true, kind, e), onmouseleave: (e) => hover(false, kind, e) },
      h('div', { class: 'rd-gauge-bg' }),
      h('div', { class: 'rd-bars' }, col.bars.reverse()),
      h('div', { class: 'rd-glabel max', style: `top:${yOf(col.maxBars) - 25}px`, text: num(maxLabel, 0) }),
      h('div', { class: `rd-glabel cur ${invalid ? 'bad' : ''}`, style: `top:${yOf(Math.max(1, col.curBars)) - 25}px`, text: num(cur, 0) }),
      preview ? h('div', { class: `rd-glabel cost ${preview < 0 ? 'neg' : ''}`, style: `top:${yOf(Math.max(1, col.newBars)) - 25}px`, text: `${preview > 0 ? '+' : '−'}${num(Math.abs(preview), 0)}` }) : null,
      // cadenas de la zone de surcharge (overchargeBox) : infobulle « Edgerunner »
      kind === 'capacity' && overMax === 0 ? h('div', { class: 'rd-lock', style: `top:${yOf(Math.min(BAR_COUNT, col.maxBars + Math.round((BAR_COUNT * OVERCHARGE_VALUE) / Math.max(possible, max + overMax)))) }px`,
        onmouseenter: (e) => { e.stopPropagation(); showGaugeTip(e.currentTarget, 'edgerunner'); },
        onmouseleave: (e) => { e.stopPropagation(); showGaugeTip(e.currentTarget.parentElement, 'capacity'); } }, '🔒') : null);
  }
  function drawGauges() {
    if (!stage) return;
    const r = ctx.compute(ctx.state, game);
    let capPreview = 0, armorPreview = 0;
    if (previewTier) {
      const cost = ctx.tierCost(ctx.state, previewTier.tier);
      const armor = (previewTier.tier.st && previewTier.tier.st.Armor) || 0;
      if (previewTier.remove) { capPreview = -cost; armorPreview = -armor; } else {
        const cur = (ctx.state.slots[previewTier.area] || [])[previewTier.slot];
        const curFam = cur ? game.byKey.get(cur.k) : null;
        const curTier = curFam ? ctx.effectiveTier(ctx.state, curFam, cur.q) : null;
        capPreview = cost - (curTier ? ctx.tierCost(ctx.state, curTier) : 0);
        armorPreview = armor - ((curTier && curTier.st && curTier.st.Armor) || 0);
        // implant déplacé depuis un autre emplacement : il libère sa place d'origine
        if (previewTier.moved) {
          capPreview -= ctx.tierCost(ctx.state, previewTier.moved);
          armorPreview -= (previewTier.moved.st && previewTier.moved.st.Armor) || 0;
        }
      }
    }
    const old = stage.querySelectorAll('.rd-gauge');
    old.forEach((x) => x.remove());
    stage.append(
      gauge('capacity', { cur: r.capUsed, preview: capPreview, max: r.capMax, possible: game.gauges.capacityMax, overMax: r.overMax, invalid: r.overInvalid, maxLabel: r.capMax + r.overMax }),
      gauge('armor', { cur: r.armor, preview: armorPreview, max: r.maxArmorForLevel, possible: game.gauges.armorMax, maxLabel: r.maxArmorForLevel }),
    );
  }

  // ------------------------------------------------------------ survol du corps (hover_area / hoverover_area)
  function setHover(area) {
    if (hoverArea === area) return;
    const anim = (el, to) => el && el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: to }], { duration: 233, fill: 'forwards' });
    if (mode === 'default') {
      stage.querySelectorAll('.rd-hover').forEach((el) => anim(el, el.dataset.area === area ? 1 : 0));
      stage.querySelectorAll('.rd-minigrid').forEach((el) => el.classList.toggle('dim', !!area && el.dataset.area !== area));
    }
    hoverArea = area;
  }

  // ------------------------------------------------------------ mode inventaire
  function enterItemMode(area, slot) {
    const wasItem = mode === 'item';
    const prev = filterArea;
    filterSlot = slot;
    if (wasItem && prev === area) { render(); return; }
    filterArea = area;
    mode = 'item';
    tierFilter = null;
    render();
    if (wasItem) {
      if (zoomable(prev) && zoomable(area)) slideTo(prev, area, FILTER_ORDER.indexOf(area) > FILTER_ORDER.indexOf(prev));
      else play('ui_gui_tab_change');
    } else {
      play('ui_gui_cyberware_paperdoll_zoom_in_01');
      if (zoomable(area)) {
        stage.querySelectorAll('.rd-hover').forEach((el) => { el.style.opacity = '0'; });
        playInkAnimation(stage, layout.animation(gender, area, 'intro'));
      }
    }
  }
  // Changement de zone dans l'inventaire : le corps glisse de 500 px et s'efface (SlideDoll, 0,25 s), puis la nouvelle zone entre
  function slideTo(prev, next, right) {
    play('ui_gui_tab_change');
    const doll = stage.querySelector('[data-path="0/7"]');
    const dx = 500 * (right ? -1 : 1);
    const out = doll.animate([{ translate: '0 0', opacity: 1 }, { translate: `${dx}px 0`, opacity: 0 }], { duration: 250, easing: 'cubic-bezier(.61,1,.88,1)', fill: 'forwards' });
    out.onfinish = () => {
      playInkAnimation(stage, layout.animation(gender, prev, 'outro'), { speed: 100 });
      playInkAnimation(stage, layout.animation(gender, next, 'intro'), { speed: 100 });
      doll.animate([{ translate: `${-dx}px 0`, opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 250, easing: 'cubic-bezier(.61,1,.88,1)', fill: 'forwards' });
    };
  }
  // Sortie de l'inventaire : l'animation « outro » du jeu ramène le corps ; on garde la même scène (pas de reconstruction,
  // qui relancerait les vidéos et ferait sauter l'image) : le groupe de slots glisse vers sa place, les autres réapparaissent,
  // l'inventaire s'efface, puis l'état final de l'animation est fixé.
  function exitItemMode() {
    if (mode !== 'item') return;
    play('ui_gui_cyberware_paperdoll_zoom_out_01');
    const area = filterArea;
    const anims = zoomable(area) ? playInkAnimation(stage, layout.animation(gender, area, 'outro')) : [];
    if (!zoomable(area)) showItemHighlight(null);
    mode = 'default';
    hoverArea = null;
    previewTier = null;
    filterArea = null;
    hideTooltip();
    const scene = stage;
    scene.classList.replace('mode-item', 'mode-default');
    const inv = scene.querySelector('.rd-inventory');
    if (inv) { inv.classList.add('closing'); setTimeout(() => inv.remove(), 300); }
    // groupes de slots : mêmes éléments, nouvelle place et nouveau contenu (transition CSS de 0,5 s sur left / top / opacité)
    scene.querySelectorAll('.rd-minigrid').forEach((el) => {
      const fresh = minigrid(el.dataset.area);
      if (!fresh) return;
      el.className = fresh.className;
      el.style.left = fresh.style.left;
      el.style.top = fresh.style.top;
      el.replaceChildren(...fresh.childNodes);
    });
    drawGauges();
    // animation finie : son état final devient le style de l'élément (rien ne bouge à l'écran)
    Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {
      if (stage !== scene || mode !== 'default') return;
      const targets = new Set(anims.map((a) => a.effect && a.effect.target).filter(Boolean));
      for (const a of anims) { try { a.commitStyles(); } catch { /* élément retiré */ } }
      // les animations d'entrée (zoom) restent attachées aux éléments : on les retire toutes
      for (const el of targets) el.getAnimations().forEach((a) => a.cancel());
      // vidéos de zoom invisibles : en pause
      scene.querySelectorAll('.rd-itemcanvas video').forEach((v) => v.pause());
    });
  }
  function install(fam, qi) {
    ctx.placeImplant(ctx.state, filterArea, filterSlot, fam.k, qi);
    const r = ctx.compute(ctx.state, game);
    const tier = fam.t[qi];
    if (r.overInvalid) play('ui_menu_attributes_fail');
    else {
      play('ui_menu_item_bought');
      // ripperdoc.script PlayCyberwareSound : son de rareté pour les implants Légendaires / Épiques
      if (tier.qs >= 4) play('ui_loot_rarity_legendary'); else if (tier.qs === 3) play('ui_loot_rarity_epic');
    }
    ctx.onChange();
  }
  function inventory() {
    if (mode !== 'item') return null;
    const cont = layout.w('cyberwareContainer');
    const idx = FILTER_ORDER.indexOf(filterArea);
    const go = (d) => {
      const next = FILTER_ORDER[(idx + d + FILTER_ORDER.length) % FILTER_ORDER.length];
      enterItemMode(next, 0);
    };
    const families = (game.byArea.get(filterArea) || []).slice().sort((a, b) => g(a.n).localeCompare(g(b.n)));
    const qualities = Object.keys(game.qualities).filter((q) => q !== 'Iconic');
    const pickTier = (fam) => {
      if (!tierFilter) return fam.t.length - 1;
      const target = game.qualities[tierFilter].value;
      let best = -1;
      fam.t.forEach((x, i) => { if (game.qualities[x.q].value <= target) best = i; });
      return best;
    };
    const current = ctx.state.slots[filterArea][filterSlot];
    const curFam = current && game.byKey.get(current.k);
    const upgrade = curFam && ctx.nextUpgrade(curFam, current.q);
    const tiles = families.map((fam) => {
      const qi = pickTier(fam);
      if (qi < 0) return null;
      const tier = ctx.effectiveTier(ctx.state, fam, qi);
      const isCur = current && current.k === fam.k && current.q === qi;
      // Déjà installé dans un autre emplacement de la zone : le choisir ici le déplace
      const elsewhere = ctx.installedSlot(ctx.state, filterArea, fam.k);
      const moved = elsewhere >= 0 && elsewhere !== filterSlot;
      return h('button', {
        type: 'button', class: `rd-item ${qClass(tier)} ${isCur ? 'current' : ''} ${moved ? 'elsewhere' : ''}`,
        title: moved ? t('installedIn', elsewhere + 1) : undefined,
        'aria-label': `${ctx.nameAt(fam, qi)} — ${qualityName(fam.t[qi].q)}`,
        onmouseenter: (e) => {
          play('ui_menu_hover'); showTooltip(e.currentTarget, fam, qi);
          const from = moved ? ctx.state.slots[filterArea][elsewhere] : null;
          previewTier = { area: filterArea, slot: filterSlot, tier, moved: from ? ctx.effectiveTier(ctx.state, fam, from.q) : null };
          drawGauges();
        },
        onmouseleave: () => { hideTooltip(); previewTier = null; drawGauges(); },
        onclick: () => { hideTooltip(); previewTier = null; install(fam, qi); },
      },
      h('span', { class: 'rd-item-cost', text: ctx.tierCost(ctx.state, tier) }),
      fam.icon ? h('img', { src: `assets/${fam.icon}`, alt: '', loading: 'lazy' }) : null,
      h('span', { class: 'rd-item-name', text: ctx.nameAt(fam, qi) }),
      h('span', { class: 'rd-item-tier', text: qualityName(fam.t[qi].q) }),
      fam.t[qi].price ? h('span', { class: 'rd-item-price', text: ctx.eddies(ctx.priceOf(fam, qi)) }) : null,
      fam.iconic ? h('span', { class: 'rd-item-iconic', text: '◆' }) : null,
      moved ? h('span', { class: 'rd-item-installed', text: t('installedIn', elsewhere + 1) }) : null);
    });
    return h('div', { class: 'rd-inventory', style: `left:${cont.rect.x}px;top:${cont.rect.y}px;` },
      h('button', { type: 'button', class: 'rd-back', onclick: () => exitItemMode() }, `◄ ${t('back')}`),
      h('div', { class: 'rd-selector' },
        h('button', { type: 'button', class: 'rd-arrow left', 'aria-label': '◄', onclick: () => go(-1) }, '◄'),
        h('div', { class: 'rd-caption', text: areaName(filterArea) }),
        h('button', { type: 'button', class: 'rd-arrow right', 'aria-label': '►', onclick: () => go(1) }, '►'),
        h('div', { class: 'rd-dots' }, FILTER_ORDER.map((a, i) => h('i', { class: i === idx ? 'on' : '', title: areaName(a), onclick: () => enterItemMode(a, 0) })))),
      h('div', { class: 'rd-divider' }),
      h('div', { class: 'rd-tiers' },
        h('button', { type: 'button', class: !tierFilter ? 'on' : '', text: '★', title: t('allTiers'), onclick: () => { tierFilter = null; render(); } }),
        qualities.map((q) => h('button', { type: 'button', class: tierFilter === q ? 'on' : '', text: qualityName(q).replace(/^\D+/, ''), title: qualityName(q), onclick: () => { tierFilter = q; render(); } }))),
      h('div', { class: 'rd-grid' }, tiles),
      h('div', { class: 'rd-actions' },
        upgrade ? h('button', { type: 'button', class: 'rd-upgrade', onclick: () => ctx.upgradeSlot(filterArea, filterSlot) },
          h('b', { text: `${t('upgrade')} → ${qualityName(curFam.t[upgrade.qi].q)}` }), ctx.matEl(upgrade.mat, upgrade.n)) : null,
        current ? h('button', { type: 'button', class: 'rd-unequip', text: t('remove'), onclick: () => { ctx.state.slots[filterArea][filterSlot] = null; play('ui_menu_item_sold'); ctx.onChange(); } }) : null));
  }

  // ------------------------------------------------------------ rendu
  function render() {
    if (!layout) return;
    gender = ctx.getGender();
    hoverArea = null; // nouveau DOM : aucune surbrillance active
    const vp = $('#rd-viewport');
    stage = h('div', { class: `rd-stage mode-${mode}`, style: `width:${REF_W}px;height:${REF_H}px;` },
      h('div', { class: 'rd-bg' }),
      buildDoll(),
      Object.keys(AREA_ANCHORS).map(minigrid),
      inventory());
    fill(vp, stage);
    // Boucle animée du corps (muette) : lecture automatique
    const baseVideo = stage.querySelector('video.rd-base');
    if (baseVideo) { baseVideo.muted = true; baseVideo.play().catch(() => {}); }
    warmVideos(stage);
    if (mode === 'item' && filterArea) {
      // état final de l'animation d'intro, sans la rejouer (ou, sans vidéo, la zone illuminée)
      if (zoomable(filterArea)) playInkAnimation(stage, layout.animation(gender, filterArea, 'intro'), { speed: 1000 });
      else showItemHighlight(filterArea);
    }
    drawGauges();
    fit();
  }

  return {
    async load() {
      const [data, vids] = await Promise.all([
        fetch('data/ripperdoc.json').then((r) => r.json()),
        fetch('data/videos.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      ]);
      layout = new RipperdocLayout(data);
      // Les vidéos sont en WebM VP9 avec transparence : sinon (Safari), on garde les images fixes
      const vp9 = document.createElement('video').canPlayType('video/webm; codecs="vp9"');
      const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
      allVideos = vp9 && !safari ? (vids || {}) : {};
      videos = ctx.videosOn() ? allVideos : {};
    },
    // Option « vidéos animées » : sans elles, le corps et les zooms restent en images fixes
    setVideos(on) { videos = on ? allVideos : {}; if (mode === 'item') exitItemMode(); else render(); },
    get videosAvailable() { return Object.keys(allVideos).length > 0; },
    get videosShown() { return Object.keys(videos).length > 0; },
    render,
    refresh: () => { if (stage) render(); },
    // Retour sur l'onglet Build : remet l'échelle et relance la boucle vidéo du corps
    show: () => {
      fit();
      const v = stage && stage.querySelector('video.rd-base');
      if (v && v.paused) v.play().catch(() => {});
    },
    back: () => { if (mode === 'item') { exitItemMode(); return true; } return false; },
    get mode() { return mode; },
  };
}
