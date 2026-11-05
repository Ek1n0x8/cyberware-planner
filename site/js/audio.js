// Sons de l'interface du charcudoc (data/sounds.json), avec bouton pour couper le son.

let sounds = {};
let muted = false;
let volume = 0.5; // 0 à 1, réglé dans l'onglet Options
try {
  muted = localStorage.getItem('muted') === '1';
  const v = parseFloat(localStorage.getItem('volume'));
  if (Number.isFinite(v)) volume = Math.min(1, Math.max(0, v));
} catch { /* stockage indisponible */ }
const useOgg = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs=opus') !== '';
const cache = new Map();

export function initAudio(map) { sounds = map || {}; }
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('muted', m ? '1' : '0'); } catch { /* ignoré */ }
}
export const getVolume = () => volume;
export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  for (const a of cache.values()) a.volume = volume;
  try { localStorage.setItem('volume', String(volume)); } catch { /* ignoré */ }
}

function audioFor(file) {
  const src = useOgg ? file.ogg : (file.mp3 || file.ogg);
  if (!cache.has(src)) {
    const a = new Audio(src);
    a.preload = 'auto';
    a.volume = volume;
    cache.set(src, a);
  }
  return cache.get(src);
}

// Joue un événement du jeu. « layers » = tous les fichiers ensemble ; sinon un seul.
export function play(event) {
  if (muted || !volume) return;
  const s = sounds[event];
  if (!s || !s.files.length) return;
  const files = s.mode === 'layers' ? s.files : [s.files[Math.floor(Math.random() * s.files.length)]];
  for (const f of files) {
    const a = audioFor(f);
    try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* lecture bloquée par le navigateur */ }
  }
}
