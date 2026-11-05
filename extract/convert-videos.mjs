// Vidéos du corps du charcudoc (Bink 2, base/movies/misc/paperdoll/…) → WebM VP9 avec transparence.
//  1. extraction des .bk2 des archives (WolvenKit) ;
//  2. décodage en images PNG avec couche alpha par RAD Video Tools (« binkconv … /Alpha ») ;
//  3. encodage en WebM VP9 (yuva420p) par ffmpeg.
// Sortie : assets/video/<nom>.webm et data/videos.json.
//
//   node extract/convert-videos.mjs [--force]
// RAD Video Tools : variable RADVIDEO (chemin de radvideo64.exe), sinon %LOCALAPPDATA%\RADVideoTools\radvideo64.exe

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gamePaths, RAW_DIR } from './config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'video');
const force = process.argv.includes('--force');
const RADVIDEO = process.env.RADVIDEO || join(process.env.LOCALAPPDATA || '', 'RADVideoTools', 'radvideo64.exe');
if (!existsSync(RADVIDEO)) throw new Error(`RAD Video Tools introuvable : ${RADVIDEO}`);

// 1. extraction
const raw = join(RAW_DIR, 'paperdollvideo');
const archives = gamePaths().archives;
for (const a of ['basegame_1_engine.archive', 'basegame_5_video.archive']) {
  execFileSync('cp77tools', ['extract', join(archives, 'content', a), '-o', raw, '-r', 'movies\\\\misc\\\\paperdoll\\\\.*\\.bk2$'], { stdio: 'ignore' });
}
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const f = join(d, e); if (statSync(f).isDirectory()) walk(f, out); else if (e.endsWith('.bk2')) out.push(f); } return out; };
const sources = walk(raw);

// Images par seconde lues dans l'en-tête Bink (dividende / diviseur aux octets 28 et 32)
function binkInfo(file) {
  const b = readFileSync(file).subarray(0, 40);
  return { frames: b.readUInt32LE(8), w: b.readUInt32LE(20), h: b.readUInt32LE(24), fps: b.readUInt32LE(28) / (b.readUInt32LE(32) || 1) };
}

mkdirSync(OUT, { recursive: true });
const manifest = {};
for (const src of sources) {
  const name = basename(src, '.bk2');
  const dest = join(OUT, `${name}.webm`);
  const info = binkInfo(src);
  if (!force && existsSync(dest)) { manifest[name] = `assets/video/${name}.webm`; console.log(`  déjà converti : ${name}`); continue; }
  const frames = join(RAW_DIR, 'vidframes', name);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  // 2. décodage avec transparence
  execFileSync(RADVIDEO, ['binkconv', src, join(frames, 'f.png'), '/Alpha', '/NoAlphaWarn', '/O', '/#'], { stdio: 'ignore', timeout: 600000 });
  const pngs = readdirSync(frames).filter((f) => f.endsWith('.png')).sort();
  if (!pngs.length) { console.log(`  ÉCHEC décodage : ${name}`); continue; }
  const digits = pngs[0].match(/(\d+)\.png$/)[1].length;
  // 3. encodage. Les boucles du corps (1080×1920) sont affichées à ~0,46 de leur taille : réduites de moitié.
  const isLoop = /body_loop$/.test(name);
  const scale = isLoop ? ['-vf', 'scale=iw/2:ih/2:flags=lanczos'] : [];
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-framerate', String(info.fps || 30), '-i', join(frames, `f%0${digits}d.png`),
    ...scale, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', isLoop ? '30' : '34',
    '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-auto-alt-ref', '0', '-an', dest], { stdio: 'inherit', timeout: 1800000 });
  rmSync(frames, { recursive: true, force: true });
  manifest[name] = `assets/video/${name}.webm`;
  console.log(`  ${name} : ${pngs.length} images, ${info.w}×${info.h} à ${info.fps} i/s → ${Math.round(statSync(dest).size / 1024)} Ko`);
}
writeFileSync(join(ROOT, 'data', 'videos.json'), JSON.stringify(manifest, null, 2));
const total = Object.keys(manifest).reduce((s, n) => s + statSync(join(OUT, `${n}.webm`)).size, 0);
console.log(`${Object.keys(manifest).length} vidéos, ${Math.round(total / 1024 / 1024)} Mo → data/videos.json`);
