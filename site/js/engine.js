// Moteur de calcul d'un build. Chaque règle renvoie à RULES.md (à la racine du projet).

export const ATTRIBUTES = ['Strength', 'Reflexes', 'TechnicalAbility', 'Intelligence', 'Cool'];
export const MAX_LEVEL = 60;

// Perks pris en compte (identifiants du jeu) et leur niveau max
export const PERK_LEVELS = {
  Tech_Central_Milestone_2: 2, // Cyberbricoleuse : +10 % stats secondaires ; -20 % coût (variantes Tinkerer)
  Tech_Central_Perk_2_1: 1,    // Mise à jour des pilotes : active les stats secondaires « Toggle »
  Tech_Central_Perk_2_2: 1,    // Dépassement des limites : +4 capacité par attribut >= 9
  Tech_Central_Milestone_3: 3, // Pro du chrome : +10 % stats secondaires ; +40 armure ; 3e slot squelette + versions renforcées
  Tech_Central_Perk_3_2: 1,    // Ambidextre : 2e slot des mains
  Tech_Central_Perk_3_3: 1,    // Différente : requis pour équiper l'Adaptateur cellulaire (equipPrereqs)
  Tech_Master_Perk_3: 1,       // Edgerunner : +50 de dépassement, -0,5 % santé max par point dépassé
  Tech_Inbetween_Right_2: 1,   // Connaissance des puces : choix des stats à l'amélioration (ajouté en dernier : ordre du lien de partage)
};

export function defaultState(game) {
  const slots = {};
  for (const a of game.areas) slots[a.id] = a.slots.map(() => null);
  return {
    level: 60,
    attrs: { Strength: 3, Reflexes: 3, TechnicalAbility: 3, Intelligence: 3, Cool: 3 },
    techSkill: 1,
    perks: Object.fromEntries(Object.keys(PERK_LEVELS).map((p) => [p, 0])),
    shards: 0,        // capacité permanente donnée par les éclats (+2 / +3 / +4 / +6 chacun)
    maskQuest: false, // quête qui débloque le 2e slot du visage
    slots,
  };
}

// Évaluation d'une courbe exportée par extract/lib/curves.mjs (mêmes règles)
export function evalCurve(c, x) {
  if (!c || !c.points.length) return 0;
  const p = c.points;
  if (x <= p[0][0]) return p[0][1];
  if (x >= p[p.length - 1][0]) return p[p.length - 1][1];
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i][0]) {
      if (c.interpolation === 'Constant') return x === p[i][0] ? p[i][1] : p[i - 1][1];
      return p[i - 1][1] + ((x - p[i - 1][0]) * (p[i][1] - p[i - 1][1])) / (p[i][0] - p[i - 1][0]);
    }
  }
  return 0;
}

export function indexGame(game) {
  game.byKey = new Map(game.families.map((f) => [f.k, f]));
  game.byArea = new Map();
  for (const f of game.families) {
    if (!game.byArea.has(f.area)) game.byArea.set(f.area, []);
    game.byArea.get(f.area).push(f);
  }
  return game;
}

// ---------------------------------------------------------------- stats aléatoires à l'amélioration (RULES.md §11)
// Perk « Connaissance des puces » : en améliorant un implant (sauf système d'exploitation), on choisit entre les stats
// actuelles (option 1) et une pièce de stats tirée au hasard (options 2 et 3).
export function canChooseStats(state, game, area, family, qi) {
  return (state.perks.Tech_Inbetween_Right_2 || 0) >= 1 && area !== 'SystemReplacementCW' && !!(family.t[qi] && family.t[qi].up);
}
// Qualité de la pièce aléatoire et nombre de stats par groupe, d'après le palier visé
export function randomShardSlots(game, tier) {
  const rs = game.randomShard;
  const v = (game.qualities[tier.q] || {}).value || 0;
  const q = rs.shardQuality.find(([min]) => v >= min)[1];
  return { quality: q, counts: rs.counts[q], options: v >= rs.thirdOptionFrom ? 2 : 1 };
}
export const randomModKeys = (game) => Object.keys(game.randomShard.mods);

// Pose un implant dans un emplacement. Comme dans le jeu, un même implant ne peut pas être installé
// deux fois : s'il est déjà dans un autre emplacement, il y est retiré (il change de place).
export function placeImplant(state, area, slot, k, q) {
  for (const [a, list] of Object.entries(state.slots)) list.forEach((s, i) => { if (s && s.k === k && !(a === area && i === slot)) list[i] = null; });
  state.slots[area][slot] = { k, q };
}
// Emplacement (index) où cet implant est déjà installé dans la zone, ou -1
export function installedSlot(state, area, k) {
  return (state.slots[area] || []).findIndex((s) => s && s.k === k);
}

// Le slot est-il disponible ? (RULES.md §6)
export function slotUnlocked(state, slot) {
  const u = slot.u;
  if (!u) return true;
  if (u.type === 'perk') return (state.perks[u.perk] || 0) >= (u.level || 1);
  if (u.type === 'fact') return !!state.maskQuest;
  return false;
}

// Palier effectivement installé : avec « Pro du chrome » niveau 3, le squelette passe en version renforcée (RULES.md §6)
export function effectiveTier(state, family, qi) {
  const t = family.t[qi];
  if (!t) return null;
  if (family.area === 'MusculoskeletalSystemCW' && state.perks.Tech_Central_Milestone_3 >= 3 && t.side) return { ...t.side, boosted: true };
  return t;
}

// Coût en capacité d'un palier (RULES.md §2)
export function tierCost(state, tier) {
  let c = tier.cost || 0;
  if (tier.tink && state.perks.Tech_Central_Milestone_2 >= 2) c += tier.tink;
  return c;
}

// Prix d'achat de base en eddies (sans la remise de réputation, qui ne change pas le build)
export function tierPrice(state, game, tier) {
  return tier && tier.price ? tier.price : 0;
}

// Amélioration du palier qi vers qi+1 : coût en composants (RPGManager.GetCyberwareUpgradeCost), ou null
export function nextUpgrade(family, qi) {
  const next = family.t[qi + 1];
  return next && next.up ? { qi: qi + 1, mat: next.up.mat, n: next.up.n } : null;
}
// Total des composants pour passer de fromQi à toQi (chaque étape doit être une amélioration possible)
export function upgradePath(family, fromQi, toQi) {
  const total = {};
  for (let q = fromQi; q < toQi; q++) {
    const u = nextUpgrade(family, q);
    if (!u) return null;
    total[u.mat] = (total[u.mat] || 0) + u.n;
  }
  return total;
}

// Stat secondaire active ? (RULES.md §5 — « quality » : hypothèse Quality >= 1, à vérifier en jeu)
function secondaryActive(state, tier, sec) {
  if (sec.c === 'driver') return state.perks.Tech_Central_Perk_2_1 >= 1;
  if (sec.c === 'quality') return tier.qs >= 1;
  return true;
}

export function equipped(state, game) {
  const list = [];
  for (const area of game.areas) {
    (state.slots[area.id] || []).forEach((s, i) => {
      if (!s) return;
      const family = game.byKey.get(s.k);
      if (!family || !family.t[s.q]) return;
      // stats aléatoires choisies : seulement si le choix est permis (sinon l'implant garde ses stats)
      const random = s.r && canChooseStats(state, game, area.id, family, s.q) ? s.r : null;
      // palier acheté (b) : celui payé en eddies ; les paliers au-dessus ont été obtenus par amélioration
      const bought = Number.isInteger(s.b) && s.b < s.q && family.t[s.b] ? s.b : s.q;
      list.push({ area: area.id, slot: i, family, qi: s.q, bought, tier: effectiveTier(state, family, s.q), random, locked: !slotUnlocked(state, area.slots[i]) });
    });
  }
  return list;
}

export function compute(state, game) {
  const items = equipped(state, game).filter((e) => !e.locked);
  const p = state.perks;

  // --- Capacité max (RULES.md §2)
  const capParts = [
    { id: 'base', v: 21 },
    { id: 'level', v: 3 * state.level },
    { id: 'techSkill', v: evalCurve(game.curves.techSkillToCapacity, state.techSkill) },
  ];
  if (p.Tech_Central_Perk_2_2) capParts.push({ id: 'perk22', v: 4 * ATTRIBUTES.filter((a) => state.attrs[a] >= 9).length });
  if (state.shards) capParts.push({ id: 'shards', v: state.shards });
  for (const e of items) if (e.tier.capb) capParts.push({ id: 'booster', v: e.tier.capb, name: e.family.n });
  const capMax = capParts.reduce((s, x) => s + x.v, 0);
  const capUsed = items.reduce((s, e) => s + tierCost(state, e.tier), 0);
  const overMax = p.Tech_Master_Perk_3 ? 50 : 0;
  const over = Math.max(0, capUsed - capMax);
  const overInvalid = over > overMax;
  // Edgerunner : 0,5 × (1/50) × 0,5 × points dépassés = -0,5 % de santé par point (RULES.md §3)
  const healthPenalty = p.Tech_Master_Perk_3 && over > 0 ? Math.min(over, overMax) * 0.005 : 0;

  // --- Stats additionnées (RULES.md §1 : les additifs s'additionnent)
  const boost = 1 + (p.Tech_Central_Milestone_2 >= 1 ? 0.1 : 0) + (p.Tech_Central_Milestone_3 >= 1 ? 0.1 : 0);
  const stats = {};
  const add = (s, v, src) => {
    if (!stats[s]) stats[s] = { total: 0, sources: [] };
    stats[s].total += v;
    stats[s].sources.push({ v, src });
  };
  // Stats aléatoires : valeurs tirées par le jeu entre min et max → affichées en plage, pas ajoutées aux totaux
  const ranges = [];
  for (const e of items) {
    for (const [s, v] of Object.entries(e.tier.st || {})) add(s, v, e.family.n);
    if (e.random) {
      for (const key of e.random) {
        const m = game.randomShard.mods[key];
        if (m) ranges.push({ family: e.family, qi: e.qi, stat: m.stat, min: m.min * boost, max: m.max * boost });
      }
      // cases laissées « au hasard » : stat inconnue
      const total = Object.values(randomShardSlots(game, e.family.t[e.qi]).counts).reduce((a, b) => a + b, 0);
      for (let i = e.random.length; i < total; i++) ranges.push({ family: e.family, qi: e.qi, stat: null });
      continue; // la pièce aléatoire remplace les stats secondaires d'origine
    }
    for (const sec of e.tier.sec || []) if (secondaryActive(state, e.tier, sec)) add(sec.s, sec.v * boost, e.family.n);
  }
  if (p.Tech_Central_Milestone_3 >= 2) add('Armor', 40, 'perk:Tech_Central_Milestone_3');
  const techArmor = evalCurve(game.curves.techSkillToArmor, state.techSkill);
  if (techArmor) add('Armor', techArmor, 'techSkill');

  // --- Effets et bonus d'attribut
  const effects = [];
  for (const e of items) {
    const attVal = e.tier.att ? e.tier.att.p * (state.attrs[e.tier.att.a] || 0) : null;
    for (const fx of e.tier.fx || []) effects.push({ family: e.family, qi: e.qi, fx, attVal, att: e.tier.att });
  }

  // --- Avertissements
  const warnings = [];
  if (overInvalid) warnings.push({ id: p.Tech_Master_Perk_3 ? 'overEdgerunner' : 'overCapacity', v: over - overMax });
  for (const e of equipped(state, game)) if (e.locked) warnings.push({ id: 'lockedSlot', family: e.family, area: e.area });
  for (const e of items) {
    for (const r of e.tier.req || []) {
      if (r.type === 'PlayerIsNewPerkBoughtPrereq' && (state.perks[r.perkType] || 0) < (r.level || 1)) {
        warnings.push({ id: 'perkReq', family: e.family, perk: r.perkType });
        continue;
      }
      const attr = { StrengthPrereq: 'Strength', BodyPrereq: 'Strength', ReflexPrereq: 'Reflexes', IntelligencePrereq: 'Intelligence', TechnicalAbilityPrereq: 'TechnicalAbility', CoolPrereq: 'Cool' }[r.type];
      if (attr && r.value && state.attrs[attr] < r.value) warnings.push({ id: 'attrReq', family: e.family, attr, v: r.value });
    }
  }

  // Coût du build : achat de chaque implant au palier acheté, composants dépensés pour l'améliorer jusqu'au palier
  // installé, et composants pour tout monter au palier max. Retirer l'implant retire tout son coût.
  const totalPrice = items.reduce((s, e) => s + tierPrice(state, game, e.family.t[e.bought]), 0);
  const spent = {};
  const toMax = {};
  for (const e of items) {
    const done = e.bought < e.qi ? upgradePath(e.family, e.bought, e.qi) : null;
    if (done) for (const [m, n] of Object.entries(done)) spent[m] = (spent[m] || 0) + n;
    const path = upgradePath(e.family, e.qi, e.family.t.length - 1);
    if (path) for (const [m, n] of Object.entries(path)) toMax[m] = (toMax[m] || 0) + n;
  }

  return {
    totalPrice, spent, toMax,
    capMax, capParts, capUsed, overMax, over, overInvalid, healthPenalty,
    armor: stats.Armor ? stats.Armor.total : 0,
    maxArmorForLevel: evalCurve(game.curves.maxArmorForLevel, state.level),
    stats, effects, warnings, items, boost, ranges,
  };
}
