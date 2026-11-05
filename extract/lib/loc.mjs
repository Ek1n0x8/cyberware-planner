// Localisation : extraction des fichiers « onscreens » avec WolvenKit CLI
// et résolution des clés LocKey#12345 en texte FR / EN.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gamePaths, RAW_DIR } from '../config.mjs';

// Langue du site → archive lang_<archive>_text.archive et dossier base\localization\<folder>
export const LANGS = {
  fr: { archive: 'fr', folder: 'fr-fr' }, en: { archive: 'en', folder: 'en-us' },
  es: { archive: 'es-es', folder: 'es-es' }, pt: { archive: 'pt', folder: 'pt-br' }, de: { archive: 'de', folder: 'de-de' },
  it: { archive: 'it', folder: 'it-it' }, pl: { archive: 'pl', folder: 'pl-pl' }, ru: { archive: 'ru', folder: 'ru-ru' },
  zh: { archive: 'zh-cn', folder: 'zh-cn' }, ja: { archive: 'ja', folder: 'jp-jp' }, ko: { archive: 'ko', folder: 'kr-kr' },
  ar: { archive: 'ar', folder: 'ar-ar' },
  // Autres langues du jeu, pas encore proposées sur le site (dossiers relevés dans les archives) :
  // es-mx → es-mx, zh-tw → zh-tw, ua → ua-ua, cs → cz-cz, hu → hu-hu, th → th-th, tr → tr-tr
};
const PACKS = ['content', 'ep1'];

function findFile(dir, name) {
  if (!existsSync(dir)) return null;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) { const f = findFile(full, name); if (f) return f; }
    else if (e === name) return full;
  }
  return null;
}

// Extrait (si besoin) puis convertit en JSON les fichiers onscreens.json du jeu.
export function extractLocalization({ force = false } = {}) {
  const { archives } = gamePaths();
  const out = {};
  for (const [lang, { archive: arch, folder }] of Object.entries(LANGS)) {
    out[lang] = [];
    for (const pack of PACKS) {
      const rawDir = join(RAW_DIR, 'loc', pack, lang);
      const jsonDir = join(RAW_DIR, 'locjson', pack, lang);
      let json = findFile(jsonDir, 'onscreens.json.json');
      if (!json || force) {
        mkdirSync(rawDir, { recursive: true });
        mkdirSync(jsonDir, { recursive: true });
        const archive = join(archives, pack, `lang_${arch}_text.archive`);
        execFileSync('cp77tools', ['extract', archive, '-o', rawDir, '-r', `${folder}\\\\onscreens\\\\onscreens\\.json$`],
          { stdio: 'ignore' });
        const raw = findFile(rawDir, 'onscreens.json');
        if (!raw) throw new Error(`onscreens.json introuvable dans ${archive}`);
        execFileSync('cp77tools', ['convert', 's', raw, '-o', jsonDir], { stdio: 'ignore' });
        json = findFile(jsonDir, 'onscreens.json.json');
      }
      out[lang].push({ pack, file: json });
    }
  }
  return out;
}

// Charge une table { primaryKey: texte } par langue.
// femaleVariant est le texte par défaut ; maleVariant n'est rempli que s'il diffère.
export function loadLocTables(files) {
  const tables = {};
  for (const [lang, list] of Object.entries(files)) {
    const table = new Map();
    for (const { file } of list) {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      for (const e of data.Data.RootChunk.root.Data.entries) {
        const entry = { text: e.femaleVariant };
        if (e.maleVariant && e.maleVariant !== e.femaleVariant) entry.male = e.maleVariant;
        entry.secondaryKey = e.secondaryKey;
        table.set(String(e.primaryKey), entry);
      }
    }
    tables[lang] = table;
  }
  return tables;
}

export function locKeyOf(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(/^LocKey#(\d+)$/i); // le jeu écrit parfois « Lockey# »
  return m ? m[1] : null;
}

// { key, fr, en } pour une valeur "LocKey#123" ; null si pas de clé.
export function resolveLoc(tables, value) {
  const key = locKeyOf(value);
  if (!key) return value ? { key: null, raw: value } : null;
  const out = { key: `LocKey#${key}` };
  for (const [lang, t] of Object.entries(tables)) {
    const e = t.get(key);
    out[lang] = e ? e.text : null;
    if (e && e.male) out[`${lang}_male`] = e.male;
  }
  return out;
}

// Remplace {float_0}, {int_1}, ... par les valeurs UIData. Garde le texte riche du jeu
// (<Rich ...>) dans « rich », et une version texte brut dans « plain ».
export function fillPlaceholders(text, { floatValues = [], intValues = [], nameValues = [], statValues = [] } = {}) {
  if (!text) return null;
  const missing = [];
  // {stat_N} désigne une valeur calculée en jeu (ex. bonus d'attribut actuel) :
  // on la laisse en place, le site la calculera.
  const rich = text.replace(/\{(float|int|name)_(\d+)\}/g, (m, kind, idx) => {
    const arr = { float: floatValues, int: intValues, name: nameValues }[kind];
    const v = arr[Number(idx)];
    if (v === undefined) { missing.push(m); return m; }
    return kind === 'float' ? formatNumber(v) : String(v);
  }).replace(/\\n/g, '\n');
  const plain = rich.replace(/<[^>]*>/g, '').replace(/ /g, ' ');
  return { rich, plain, missing };
}

function formatNumber(v) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}
