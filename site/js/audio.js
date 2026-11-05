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

// iPhone : session audio « ambient » = les sons du site se mélangent à la musique des autres applis
// au lieu de la couper (Safari 16.4+ ; suit aussi le bouton silencieux, comme les sons d'interface)
try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* non pris en charge */ }

function context() {
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = muted ? 0 : volume;
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
// Une seule fois : un son vide joué pendant le premier geste débloque la sortie audio sur iOS
// (le rejouer à chaque appui interrompait la musique des autres applis)
let unlocked = false;
function unlock() {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  if (unlocked) return;
  unlocked = true;
  try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch { /* ignoré */ }
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) window.removeEventListener(ev, unlock, { capture: true });
  // Ouverture du menu (ripperdoc.script : ui_gui_cyberware_tab_open) : lance aussi la boucle de fond.
  // Les navigateurs interdisent le son avant le premier geste : on la lance donc à ce moment-là.
  playLoopOf('ui_gui_cyberware_tab_open');
}
// Onglet caché : le son de fond s'arrête ; il reprend au retour
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {}); else if (unlocked) ctx.resume().catch(() => {});
});

// ---- boucle de fond (un seul exemplaire, jouée en continu comme dans le jeu)
let loopStarted = false;
let loopEl = null;
function startLoop(src) {
  if (loopStarted) return;
  loopStarted = true;
  const c = context();
  if (!c) {
    loopEl = new Audio(src);
    loopEl.loop = true;
    loopEl.volume = muted ? 0 : volume;
    loopEl.play().catch(() => { loopStarted = false; });
    return;
  }
  const go = (buf) => {
    if (!buf) { loopStarted = false; return; }
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    // MP3 / Opus ajoutent un peu de silence au début et à la fin : on le saute pour une boucle sans trou
    const d = buf.getChannelData(0);
    let a = 0, z = d.length - 1;
    while (a < d.length && Math.abs(d[a]) < 1e-4) a++;
    while (z > a && Math.abs(d[z]) < 1e-4) z--;
    if (z - a > buf.sampleRate * 0.5) { s.loopStart = a / buf.sampleRate; s.loopEnd = (z + 1) / buf.sampleRate; }
    s.connect(gain);
    s.start(0);
  };
  const b = buffers.get(src);
  if (b && !(b instanceof Promise)) go(b); else { const p = b || load(src); if (p) p.then(go); else loopStarted = false; }
}
function playLoopOf(event) {
  const s = sounds[event];
  const f = s && s.files.find((x) => x.lp);
  if (f) startLoop(srcOf(f));
}
const applyGain = () => {
  if (gain) gain.gain.value = muted ? 0 : volume;
  if (loopEl) loopEl.volume = muted ? 0 : volume;
};
for (const ev of ['pointerdown', 'touchstart', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });

export function initAudio(map) {
  sounds = map || {};
  if (unlocked) playLoopOf('ui_gui_cyberware_tab_open'); // premier geste fait avant la fin du chargement
  if (!context()) return;
  // préchargement au repos, pour que le premier clic sonne tout de suite
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 800));
  idle(() => { for (const s of Object.values(sounds)) for (const f of s.files) load(srcOf(f)); });
}
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  applyGain(); // la boucle de fond continue, à volume 0 quand le son est coupé
  try { localStorage.setItem('muted', m ? '1' : '0'); } catch { /* ignoré */ }
}
export const getVolume = () => volume;
export function setVolume(v) {
  volume = Math.min(1, Math.max(0, v));
  applyGain();
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
    if (f.lp) { startLoop(src); continue; } // la boucle de fond tourne déjà : pas de second exemplaire
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
