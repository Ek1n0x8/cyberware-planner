// Sons de l'interface du charcudoc (data/sounds.json), avec bouton pour couper le son.
// Lecture par Web Audio : les sons sont décodés à l'avance puis joués sans délai (l'élément <audio> a une
// latence nette sur iPhone). Repli sur <audio> si Web Audio est absent.

let sounds = {};
let muted = false;
let volume = 0.5; // 0 à 1, réglé dans l'onglet Options
try {
  muted = localStorage.getItem('muted') === '1';
  const v = parseFloat(localStorage.getItem('volume'));
  if (Number.isFinite(v)) volume = Math.min(1, Math.max(0, v));
} catch { /* stockage indisponible */ }
const useOgg = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs=opus') !== '';
const srcOf = (file) => (useOgg ? file.ogg : (file.mp3 || file.ogg));

const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, gain = null;
const buffers = new Map(); // src → AudioBuffer | Promise
const elements = new Map(); // repli <audio>

function context() {
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = volume;
      gain.connect(ctx.destination);
    } catch { ctx = null; }
  }
  return ctx;
}
function load(src) {
  if (buffers.has(src)) return buffers.get(src);
  const c = context();
  if (!c) return null;
  const p = fetch(src).then((r) => r.arrayBuffer())
    .then((data) => new Promise((ok, ko) => c.decodeAudioData(data, ok, ko)))
    .then((buf) => { buffers.set(src, buf); return buf; })
    .catch(() => { buffers.delete(src); return null; });
  buffers.set(src, p);
  return p;
}
// Le navigateur n'autorise le son qu'après un geste : on débloque au premier appui, puis on prépare tous les sons
function unlock() {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  // iOS : jouer un son vide pendant le geste débloque définitivement la sortie audio
  try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch { /* ignoré */ }
}
for (const ev of ['pointerdown', 'touchstart', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });

export function initAudio(map) {
  sounds = map || {};
  if (!context()) return;
  // préchargement au repos, pour que le premier clic sonne tout de suite
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 800));
  idle(() => { for (const s of Object.values(sounds)) for (const f of s.files) load(srcOf(f)); });
}
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('muted', m ? '1' : '0'); } catch { /* ignoré */ }
}
export const getVolume = () => volume;
export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  if (gain) gain.gain.value = volume;
  for (const a of elements.values()) a.volume = volume;
  try { localStorage.setItem('volume', String(volume)); } catch { /* ignoré */ }
}

function playElement(src) {
  if (!elements.has(src)) {
    const a = new Audio(src);
    a.preload = 'auto';
    a.volume = volume;
    elements.set(src, a);
  }
  const a = elements.get(src);
  try { a.currentTime = 0; a.play().catch(() => {}); } catch { /* lecture bloquée par le navigateur */ }
}
function playBuffer(buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.connect(gain);
  s.start(0);
}

// Joue un événement du jeu. « layers » = tous les fichiers ensemble ; sinon un seul.
export function play(event) {
  if (muted || !volume) return;
  const s = sounds[event];
  if (!s || !s.files.length) return;
  const files = s.mode === 'layers' ? s.files : [s.files[Math.floor(Math.random() * s.files.length)]];
  const c = context();
  for (const f of files) {
    const src = srcOf(f);
    if (!c) { playElement(src); continue; }
    if (c.state === 'suspended') c.resume().catch(() => {});
    const b = buffers.get(src);
    if (b && !(b instanceof Promise)) playBuffer(b);
    else {
      // pas encore décodé : on le joue dès qu'il est prêt (si c'est rapide), sinon on laisse tomber
      const t0 = performance.now();
      const p = b || load(src);
      if (p) p.then((buf) => { if (buf && performance.now() - t0 < 250) playBuffer(buf); });
    }
  }
}
