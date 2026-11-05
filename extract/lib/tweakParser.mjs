// Parseur des fichiers .tweak (sources TweakDB livrées avec REDmod).
//
// Un fichier ressemble à :
//   package Items
//   using RTDB, BaseStats
//   [ notQueryable ]
//   MonRecord : Parent { champ = valeur; type champ += [ ... ]; }
//
// Le parseur produit, pour chaque record :
//   { id: "Items.MonRecord", name, parent, tags: [...], fields: { nom: {op, value} },
//     source: { file, line } }
// Les valeurs sont :
//   - nombres (le suffixe "f" est retiré), booléens, chaînes ;
//   - tableaux JS ;
//   - records inline : { $inline: true, type, parent, fields } ;
//   - références à d'autres records : chaînes ("Items.Foo", "BaseStats.Armor").

import { readFileSync } from 'node:fs';

const PUNCT = new Set(['{', '}', '[', ']', ':', ';', ',', '=', '<', '>', '(', ')']);

function tokenize(src, file) {
  const toks = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '﻿') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2; continue;
    }
    if (c === '"') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== '"') {
        // Seul \" est un échappement ; les chemins Windows (base\gameplay\…) gardent leurs antislashs
        if (src[j] === '\\' && src[j + 1] === '"') { s += '"'; j += 2; continue; }
        if (src[j] === '\n') line++;
        s += src[j++];
      }
      toks.push({ t: 'str', v: s, line });
      i = j + 1; continue;
    }
    if (c === '+' && src[i + 1] === '=') { toks.push({ t: 'p', v: '+=', line }); i += 2; continue; }
    if (c === '-' && src[i + 1] === '=') { toks.push({ t: 'p', v: '-=', line }); i += 2; continue; }
    if (PUNCT.has(c)) { toks.push({ t: 'p', v: c, line }); i++; continue; }
    // identifiant, nombre, ou nom qualifié (Items.Foo, LocKey#123 n'apparaît qu'entre guillemets)
    let j = i;
    while (j < n && !PUNCT.has(src[j]) && !/\s/.test(src[j]) && src[j] !== '"' &&
           !(src[j] === '+' && src[j + 1] === '=')) j++;
    if (j === i) throw new Error(`${file}:${line}: caractère inattendu '${c}'`);
    toks.push({ t: 'id', v: src.slice(i, j), line });
    i = j;
  }
  return toks;
}

const NUM_RE = /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?\.?f?$/i;

function atom(tok) {
  if (tok.t === 'str') return tok.v;
  const v = tok.v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (NUM_RE.test(v)) return parseFloat(v.replace(/\.?f$/i, ''));
  return { $ident: v };
}

export function parseTweakFile(path, relPath = path) {
  const src = readFileSync(path, 'utf8');
  const toks = tokenize(src, relPath);
  let p = 0;
  const peek = (o = 0) => toks[p + o];
  const next = () => toks[p++];
  const isP = (v, o = 0) => peek(o) && peek(o).t === 'p' && peek(o).v === v;
  const expect = (v) => {
    const t = next();
    if (!t || t.v !== v) throw new Error(`${relPath}:${t ? t.line : 'EOF'}: attendu '${v}', trouvé '${t ? t.v : 'EOF'}'`);
    return t;
  };

  let pkg = '';
  const usings = [];
  const records = [];

  // Saute un type éventuel devant un nom de champ : "fk< X >[]", "CName[]", "float", ...
  function skipTypeIfAny() {
    // Formes : ident [<...>] [[]] ident (=|+=)
    const save = p;
    if (peek().t !== 'id') return null;
    let type = next().v;
    if (isP('<')) { next(); type += '<'; while (!isP('>')) type += next().v; next(); type += '>'; }
    if (isP('[') && isP(']', 1)) { next(); next(); type += '[]'; }
    if (peek() && peek().t === 'id' && (isP('=', 1) || isP('+=', 1) || isP('-=', 1))) return type;
    p = save;
    return null;
  }

  function parseValue() {
    const t = peek();
    if (isP('[')) {
      next();
      const arr = [];
      while (!isP(']')) {
        arr.push(parseValue());
        if (isP(',')) next();
      }
      next();
      return arr;
    }
    if (isP('(')) {
      // Vecteur / couleur : ( 1, 1, 1 )
      next();
      const tuple = [];
      while (!isP(')')) {
        tuple.push(parseValue());
        if (isP(',')) next();
      }
      next();
      return { $tuple: tuple };
    }
    if (isP('{')) {
      const line = t.line;
      const body = parseBody();
      let type = null;
      if (isP(':')) { next(); type = next().v; }
      return { $inline: true, type, fields: body, line };
    }
    const v = atom(next());
    return v && v.$ident ? v.$ident : v;
  }

  function parseBody() {
    expect('{');
    const fields = {};
    let fieldTags = [];
    while (!isP('}')) {
      if (isP(';')) { next(); continue; }
      if (isP('[')) {
        // Attribut de champ, ex. « [ EP1 ] » devant un champ ajouté par Phantom Liberty
        next();
        const tag = [];
        while (!isP(']')) tag.push(next().v);
        next();
        fieldTags.push(tag.join(' '));
        continue;
      }
      const type = skipTypeIfAny();
      const nameTok = next();
      const opTok = next();
      if (!['=', '+=', '-='].includes(opTok.v)) {
        throw new Error(`${relPath}:${nameTok.line}: opérateur attendu après '${nameTok.v}', trouvé '${opTok.v}'`);
      }
      const value = parseValue();
      if (isP(';')) next();
      const entry = { op: opTok.v, value, line: nameTok.line };
      if (type) entry.type = type;
      if (fieldTags.length) { entry.tags = fieldTags; fieldTags = []; }
      // Un même champ peut apparaître deux fois (rare) : on garde l'ordre.
      if (fields[nameTok.v]) {
        const prev = fields[nameTok.v];
        fields[nameTok.v] = Array.isArray(prev.multi) ? prev : { multi: [prev] };
        fields[nameTok.v].multi.push(entry);
      } else fields[nameTok.v] = entry;
    }
    next();
    return fields;
  }

  let pendingTags = [];
  while (p < toks.length) {
    const t = peek();
    if (t.t === 'id' && t.v === 'package') { next(); pkg = next().v; continue; }
    if (t.t === 'id' && t.v === 'using') {
      next();
      while (true) { usings.push(next().v); if (isP(',')) { next(); continue; } break; }
      continue;
    }
    if (isP('[')) {
      next();
      const tag = [];
      while (!isP(']')) tag.push(next().v);
      next();
      pendingTags.push(tag.join(' '));
      continue;
    }
    if (isP(';')) { next(); continue; }
    // Record : Nom [: Parent] { ... }   ou   [type] Nom = valeur; (valeur globale « flat »)
    skipTypeIfAny();
    const nameTok = next();
    if (nameTok.t !== 'id') throw new Error(`${relPath}:${nameTok.line}: nom de record attendu`);
    if (isP('=') || isP('+=')) {
      const op = next().v;
      const value = parseValue();
      if (isP(';')) next();
      records.push({ id: `${pkg}.${nameTok.v}`, name: nameTok.v, flat: true, op, value,
        tags: pendingTags, source: { file: relPath, line: nameTok.line } });
      pendingTags = [];
      continue;
    }
    let parent = null;
    if (isP(':')) { next(); parent = next().v; }
    const fields = parseBody();
    records.push({ id: pkg ? `${pkg}.${nameTok.v}` : nameTok.v, name: nameTok.v, package: pkg,
      parent, tags: pendingTags, fields, source: { file: relPath, line: nameTok.line } });
    pendingTags = [];
  }
  return { package: pkg, usings, records };
}
