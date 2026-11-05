// Écran du charcudoc fidèle au jeu : toile de référence 3840×2160 (comme l'interface du jeu), mise à l'échelle.
// Positions et animations : data/ripperdoc.json (lu dans ripperdoc.inkwidget / ripperdoc_animations.inkanim).

export const REF_W = 3840;
export const REF_H = 2160;

// Ancres des groupes de slots (widgets « …Anchor » de ripperdoc.inkwidget) et côté d'alignement.
// À gauche, le groupe est aligné à droite d'un cadre de 550 px posé sur l'ancre ; à droite, aligné à gauche.
export const AREA_ANCHORS = {
  FrontalCortexCW: { anchor: 'frontalAnchor', side: 'left' },
  ArmsCW: { anchor: 'armsAnchor', side: 'left' },
  MusculoskeletalSystemCW: { anchor: 'skeletonAnchor', side: 'left' },
  NervousSystemCW: { anchor: 'nervousAnchor', side: 'left' },
  IntegumentarySystemCW: { anchor: 'integumentaryAnchor', side: 'left' },
  SystemReplacementCW: { anchor: 'systemAnchor', side: 'right' },
  EyesCW: { anchor: 'OcularNew', side: 'right' },
  HandsCW: { anchor: 'handsAnchorNew', side: 'right' },
  CardiovascularSystemCW: { anchor: 'cardiovascularAnchor', side: 'right' },
  LegsCW: { anchor: 'legsAnchor', side: 'right' },
};
export const MINIGRID_FRAME_W = 550; // taille du canvas racine de cyberwareInventoryMiniGridLeft/Right

// Ordre du sélecteur de zones (RipperDocGameController.EquipmentAreaToIndex)
export const FILTER_ORDER = ['FrontalCortexCW', 'SystemReplacementCW', 'ArmsCW', 'EyesCW', 'MusculoskeletalSystemCW',
  'HandsCW', 'NervousSystemCW', 'CardiovascularSystemCW', 'IntegumentarySystemCW', 'LegsCW'];

// Nom de zone dans les widgets / animations du jeu (RipperdocScreenAnimationController.GetName)
export const AREA_ANIM = {
  FrontalCortexCW: 'frontalCortex', EyesCW: 'ocular', CardiovascularSystemCW: 'circlatory', ImmuneSystemCW: 'immune',
  NervousSystemCW: 'nervous', IntegumentarySystemCW: 'integumentary', SystemReplacementCW: 'operating',
  MusculoskeletalSystemCW: 'skeleton', HandsCW: 'hands', ArmsCW: 'arms', LegsCW: 'legs',
};
// Image de surbrillance (femaleHovers / maleHovers) et canvas de zoom (Paperdoll_Item_tab) de chaque zone
const HOVER_WIDGET = {
  FrontalCortexCW: 'frontal_cortex', EyesCW: 'okular', CardiovascularSystemCW: 'circulatory', ImmuneSystemCW: 'imunne',
  NervousSystemCW: 'nervous', IntegumentarySystemCW: 'integumentary', SystemReplacementCW: 'operating',
  MusculoskeletalSystemCW: 'skeleton', HandsCW: 'hands', ArmsCW: 'arms', LegsCW: 'legs',
};
const ITEM_CANVAS = {
  FrontalCortexCW: 'frontal_cortex', EyesCW: 'ocular', CardiovascularSystemCW: 'circulatory', ImmuneSystemCW: 'immune',
  NervousSystemCW: 'nervous', IntegumentarySystemCW: 'integumentary', SystemReplacementCW: 'operating',
  MusculoskeletalSystemCW: 'skeleton', HandsCW: 'hands', ArmsCW: 'arms', LegsCW: 'legs',
};
// Fichiers d'image extraits (assets/ui) pour chaque zone de planche
const PART_FILE = {
  ma_full_skeleton: 'man_skeleton', ma_circular: 'man_circulatory', ma_intergumentary: 'man_integumentary', ma_nervous: 'man_nervous',
  ma_immune: 'man_immune', ma_arms: 'man_arms', ma_hands: 'man_hands', ma_legs: 'man_legs', ma_operating_system: 'man_os',
  ma_pfrontal_cortex: 'man_frontal_cortex', ma_ocular: 'man_eyes', ma_ocular_mask: 'man_face',
  wo_skeleton: 'woman_skeleton', wo_circular: 'woman_circulatory', wo_intergumentary: 'woman_integumentary', wo_nervous: 'woman_nervous',
  wo_immune: 'woman_immune', wo_arms: 'woman_arms', wo_hands: 'woman_hands', wo_legs: 'woman_legs', wo_operating_system: 'woman_os',
  wo_frontal_cortex: 'woman_frontal_cortex', wo_ocular: 'woman_eyes', wo_ocular_mask: 'woman_face',
};

// Courbes d'interpolation ink → CSS (approximations cubic-bezier des courbes classiques)
const EASING = {
  Linear: { EasyIn: 'linear', EasyOut: 'linear', EasyInOut: 'linear' },
  Sinusoidal: { EasyIn: 'cubic-bezier(.12,0,.39,0)', EasyOut: 'cubic-bezier(.61,1,.88,1)', EasyInOut: 'cubic-bezier(.37,0,.63,1)' },
  Quadratic: { EasyIn: 'cubic-bezier(.11,0,.5,0)', EasyOut: 'cubic-bezier(.5,1,.89,1)', EasyInOut: 'cubic-bezier(.45,0,.55,1)' },
  Qubic: { EasyIn: 'cubic-bezier(.32,0,.67,0)', EasyOut: 'cubic-bezier(.33,1,.68,1)', EasyInOut: 'cubic-bezier(.65,0,.35,1)' },
  Quartic: { EasyIn: 'cubic-bezier(.5,0,.75,0)', EasyOut: 'cubic-bezier(.25,1,.5,1)', EasyInOut: 'cubic-bezier(.76,0,.24,1)' },
  Quintic: { EasyIn: 'cubic-bezier(.64,0,.78,0)', EasyOut: 'cubic-bezier(.22,1,.36,1)', EasyInOut: 'cubic-bezier(.83,0,.17,1)' },
  Exponential: { EasyIn: 'cubic-bezier(.7,0,.84,0)', EasyOut: 'cubic-bezier(.16,1,.3,1)', EasyInOut: 'cubic-bezier(.87,0,.13,1)' },
};
export function easing(spec) {
  const [type, mode] = String(spec || 'Linear/EasyIn').split('/');
  return (EASING[type] || EASING.Linear)[mode] || 'linear';
}

export class RipperdocLayout {
  constructor(data) {
    this.data = data;
    this.byName = new Map();
    this.byNamePath = new Map();
    for (const [path, w] of Object.entries(data.widgets)) {
      w.path = path;
      if (!this.byName.has(w.name)) this.byName.set(w.name, w);
      this.byNamePath.set(w.namePath, w);
    }
  }
  w(name) { return this.byName.get(name); }
  anchor(area) {
    const a = AREA_ANCHORS[area];
    const w = a && this.w(a.anchor);
    return w ? { x: w.rect.x, y: w.rect.y, side: a.side } : null;
  }
  hoverWidget(gender, area) { return this.w(`paperdoll_${gender}_${HOVER_WIDGET[area]}`); }
  itemCanvas(area) { return this.w(`paperdoll_${ITEM_CANVAS[area]}_canvas`); }
  itemVideo(gender, area) { return this.w(`${gender}_paperdoll_${ITEM_CANVAS[area]}`); }
  partFile(texture) { return texture ? PART_FILE[texture.part] : null; }
  animation(gender, area, suffix) {
    const name = `${gender === 'man' ? 'M_' : ''}${AREA_ANIM[area]}_${suffix}`;
    return this.data.animations[name] || [];
  }
}

// Joue une animation du jeu sur des éléments DOM repérés par data-path (chemin d'index du widget).
// Types gérés : Translation, Scale, Transparency, Margin (décalage), Video (lecture depuis le début).
export function playInkAnimation(root, tracks, { speed = 1 } = {}) {
  const anims = [];
  for (const tr of tracks) {
    if (tr.path === null) continue;
    const el = root.querySelector(`[data-path="${tr.path}"]`);
    if (!el) continue;
    const timing = { duration: Math.max(1, (tr.duration * 1000) / speed), delay: (tr.delay * 1000) / speed, easing: easing(tr.easing), fill: 'both' };
    let kf = null;
    if (tr.type === 'Translation') kf = [{ translate: `${tr.from[0]}px ${tr.from[1]}px` }, { translate: `${tr.to[0]}px ${tr.to[1]}px` }];
    else if (tr.type === 'Scale') kf = [{ scale: `${tr.from[0]} ${tr.from[1]}` }, { scale: `${tr.to[0]} ${tr.to[1]}` }];
    else if (tr.type === 'Transparency') kf = [{ opacity: tr.from }, { opacity: tr.to }];
    else if (tr.type === 'Video') {
      const video = el.tagName === 'VIDEO' ? el : el.querySelector('video');
      if (video && tr.to > 0) { try { video.currentTime = 0; video.play().catch(() => {}); } catch { /* lecture impossible */ } }
      continue;
    }
    if (kf) anims.push(el.animate(kf, timing));
  }
  return anims;
}
