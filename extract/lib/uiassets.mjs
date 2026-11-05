// Éléments d'interface du charcudoc : silhouettes (homme / femme, par système du corps),
// fond de la salle et fonds des jauges verticales. Extraits des planches de l'interface du jeu
// (base/gameplay/gui/fullscreen/ripperdoc/…) et découpés avec leurs zones (inkatlas).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import pngjs from 'pngjs';
import { gamePaths, RAW_DIR } from '../config.mjs';

const { PNG } = pngjs;

// planche → { zone de la planche : nom de fichier dans assets/ui }
// La version « _1080p » des textures suffit pour l'affichage web et pèse 4 fois moins.
const ATLASES = {
  'base\\gameplay\\gui\\fullscreen\\ripperdoc\\man_body.inkatlas': {
    texture: 'man_body_1080p',
    parts: {
      ma_full_skeleton: 'man_skeleton', ma_circular: 'man_circulatory', ma_intergumentary: 'man_integumentary',
      ma_nervous: 'man_nervous', ma_immune: 'man_immune', ma_arms: 'man_arms', ma_hands: 'man_hands', ma_legs: 'man_legs',
      ma_operating_system: 'man_os', ma_pfrontal_cortex: 'man_frontal_cortex', ma_ocular: 'man_eyes', ma_ocular_mask: 'man_face',
    },
  },
  'base\\gameplay\\gui\\fullscreen\\ripperdoc\\woman_body.inkatlas': {
    texture: 'woman_body_1080p',
    parts: {
      wo_skeleton: 'woman_skeleton', wo_circular: 'woman_circulatory', wo_intergumentary: 'woman_integumentary',
      wo_nervous: 'woman_nervous', wo_immune: 'woman_immune', wo_arms: 'woman_arms', wo_hands: 'woman_hands', wo_legs: 'woman_legs',
      wo_operating_system: 'woman_os', wo_frontal_cortex: 'woman_frontal_cortex', wo_ocular: 'woman_eyes', wo_ocular_mask: 'woman_face',
    },
  },
  'base\\gameplay\\gui\\fullscreen\\ripperdoc\\background.inkatlas': {
    texture: 'background',
    parts: { background: 'background' },
  },
  'base\\gameplay\\gui\\fullscreen\\ripperdoc\\assets\\cw_bars_assets.inkatlas': {
    texture: 'cw_bars_assets',
    parts: { cw_barbg: 'gauge_capacity', armor_barbg: 'gauge_armor', upgrade_arrow: 'upgrade_arrow', upgrade_corner: 'upgrade_corner' },
  },
  // Icônes de l'infobulle des implants (common/tooltip/cyberware_tooltip_modules.inkwidget, fullscreen/ripperdoc/ripperdoc.inkwidget)
  'base\\gameplay\\gui\\common\\icons\\mappin_icons.inkatlas': {
    texture: 'mappin_icons',
    parts: { ripperdoc: 'icon_capacity', armor: 'icon_armor' },
  },
  // UIIcon.Body / Reflexes / TechnicalAbility / Intelligence / Cool (ui/attributes.tweak) : bloc « Sensible à… »
  'base\\gameplay\\gui\\common\\icons\\attributes_icons.inkatlas': {
    texture: 'attributes_icons',
    parts: { ico_body: 'attr_Strength', ico_ref: 'attr_Reflexes', ico_tech: 'attr_TechnicalAbility', ico_int: 'attr_Intelligence', ico_cool: 'attr_Cool' },
  },
  'base\\gameplay\\gui\\common\\icons\\atlas_cash.inkatlas': {
    texture: 'atlas_cash',
    parts: { cash_symbol_normal: 'icon_eddies' },
  },
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function extractUiAssets(outDir, { force = false } = {}) {
  const { game, archives } = gamePaths();
  const raw = join(RAW_DIR, 'ripui');
  const paths = Object.keys(ATLASES);
  if (force || paths.some((p) => !existsSync(join(raw, p)))) {
    mkdirSync(raw, { recursive: true });
    const re = '(' + paths.map((p) => escapeRe(p.replace(/\.inkatlas$/, ''))).join('|') + ')(_1080p)?\\.(inkatlas|xbm)$';
    execFileSync('cp77tools', ['uncook', join(archives, 'content'), '-o', raw, '-gp', game, '-r', re, '--uext', 'png'],
      { stdio: 'ignore', maxBuffer: 1 << 28 });
  }
  mkdirSync(outDir, { recursive: true });
  const written = {};
  const missing = [];
  for (const [atlasPath, { texture, parts }] of Object.entries(ATLASES)) {
    const atlasFile = join(raw, atlasPath);
    const jsonDir = join(RAW_DIR, 'ripuijson');
    const json = join(jsonDir, basename(atlasPath) + '.json');
    if (!existsSync(atlasFile)) { missing.push(atlasPath); continue; }
    if (force || !existsSync(json)) {
      mkdirSync(jsonDir, { recursive: true });
      execFileSync('cp77tools', ['convert', 's', atlasFile, '-o', jsonDir], { stdio: 'ignore' });
    }
    const slot = JSON.parse(readFileSync(json, 'utf8')).Data.RootChunk.slots.Elements[0];
    const uvs = new Map(slot.parts.map((p) => [p.partName.$value, p.clippingRectInUVCoords]));
    const texFile = join(raw, dirname(atlasPath), `${texture}.png`);
    if (!existsSync(texFile)) { missing.push(texFile); continue; }
    const img = PNG.sync.read(readFileSync(texFile));
    for (const [part, name] of Object.entries(parts)) {
      const uv = uvs.get(part);
      if (!uv) { missing.push(`${atlasPath} : ${part}`); continue; }
      const x0 = Math.round(uv.Left * img.width), y0 = Math.round(uv.Top * img.height);
      const w = Math.round(uv.Right * img.width) - x0, h = Math.round(uv.Bottom * img.height) - y0;
      const crop = new PNG({ width: w, height: h });
      PNG.bitblt(img, crop, x0, y0, w, h, 0, 0);
      writeFileSync(join(outDir, `${name}.png`), PNG.sync.write(crop));
      written[name] = { file: `ui/${name}.png`, width: w, height: h, source: `${atlasPath.replace(/\\/g, '/')}#${part}` };
    }
  }
  return { written, missing };
}
