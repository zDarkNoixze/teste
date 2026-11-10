/*
 * App shell: content, scroll, HUD, modal and the lightweight "static" mode.
 * The 3D scene is a separate chunk loaded only when the device can run it (see quality.js),
 * so old or weak devices never download or execute three.js.
 */
import { projects } from './data.js';
import { renderPanels, createModal, runBoot, scramble } from './ui.js';
import { detectTier } from './quality.js';
import './style.css';

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(pointer: coarse)').matches;
const SECTIONS = 5;
const CODES = ['b0', 'C1', 'd4', '62', 'A2', 'AA'];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const BASE = import.meta.env.BASE_URL;

/* ---------------- Shared state (also read by the 3D scene) ---------------- */
const sections = [...document.querySelectorAll('.panel')];
const STAGES = sections.map((s) => s.dataset.stage);
const app = {
  SECTIONS,
  CODES,
  sections,
  reduced,
  isTouch,
  progress: 0,
  targetProgress: 0,
  hoverProject: -1,
  modalProject: -1,
  loadProgress: 0,
  pointer: { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0, inside: false, overUI: false, moved: false },
  tip: $('#tip'),
};

app.readScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  app.targetProgress = max > 0 ? clamp01(scrollY / max) : 0;
};
/** Eases `progress` towards the scroll position; returns true while still moving. */
app.step = (dt) => {
  app.progress += (app.targetProgress - app.progress) * (1 - Math.exp(-dt * (reduced ? 20 : 5)));
  if (Math.abs(app.targetProgress - app.progress) < 1e-4) app.progress = app.targetProgress;
  return app.progress !== app.targetProgress;
};
app.snap = () => {
  app.readScroll();
  app.progress = app.targetProgress;
};
app.goTo = (i) => scrollTo({ top: sections[i].offsetTop, behavior: reduced ? 'auto' : 'smooth' });
addEventListener('scroll', () => {
  app.readScroll();
  wake();
}, { passive: true });
app.snap();

/* ---------------- Navigation ---------------- */
const rail = $('#rail');
STAGES.forEach((name, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<span>${name}</span>`;
  b.setAttribute('aria-label', `Ir para ${name}`);
  b.addEventListener('click', () => app.goTo(i));
  rail.appendChild(b);
});
const railButtons = [...rail.children];
document.querySelectorAll('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    const i = href === '#top' ? 0 : sections.findIndex((s) => `#${s.id}` === href);
    if (i >= 0) {
      e.preventDefault();
      app.goTo(i);
    }
  }),
);

// Reveal each section once and keep it (hiding cards while still on screen made content flicker).
function reveal(el) {
  el.classList.add('in');
  el.querySelectorAll('.scr').forEach(scramble);
}
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        reveal(e.target);
        io.unobserve(e.target);
      }),
    { threshold: 0, rootMargin: '0px 0px -12% 0px' },
  );
  sections.forEach((s) => io.observe(s));
} else sections.forEach(reveal);

/* ---------------- Panels + modal ---------------- */
app.modal = createModal({
  onOpen: (i) => ((app.modalProject = i), wake()),
  onClose: () => ((app.modalProject = -1), wake()),
});
renderPanels({ onProjectHover: (i) => ((app.hoverProject = i), wake()), onProject: (i) => app.modal.open(i) });

const inspector = $('#inspector');
inspector.querySelector('.x').addEventListener('click', () => (inspector.hidden = true));
app.showInspector = (d) => {
  inspector.querySelector('strong').textContent = d.name;
  inspector.querySelector('b').textContent = d.spec || '';
  inspector.querySelector('p').textContent = d.desc || '';
  inspector.hidden = false;
  inspector.classList.remove('pop');
  void inspector.offsetWidth;
  inspector.classList.add('pop');
};

/* ---------------- Pointer ---------------- */
const glowEl = $('#glow');
addEventListener('pointermove', (e) => {
  const p = app.pointer;
  p.x = e.clientX;
  p.y = e.clientY;
  p.nx = (e.clientX / innerWidth) * 2 - 1;
  p.ny = -(e.clientY / innerHeight) * 2 + 1;
  p.inside = true;
  p.moved = true;
  p.overUI = !!(e.target.closest && e.target.closest('.card, .topbar, #rail, dialog, #inspector, .credits'));
  if (!isTouch) glowEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
}, { passive: true });
document.addEventListener('pointerleave', () => (app.pointer.inside = false));

/* ---------------- HUD ---------------- */
const barEl = $('#bar');
const stageEl = $('#stage-name');
const qEl = $('#qcode');
let hudIdx = -1, hudCode = '';
app.hud = ({ code }) => {
  const idx = Math.round(app.progress * SECTIONS);
  if (idx !== hudIdx) {
    hudIdx = idx;
    railButtons.forEach((b, i) => b.classList.toggle('active', i === idx));
    stageEl.textContent = STAGES[idx];
  }
  if (code !== hudCode) qEl.textContent = hudCode = code;
  barEl.style.transform = `scaleX(${app.progress})`;
  return idx;
};

/* ---------------- Static mode: pre-rendered board + CSS camera ---------------- */
const poster = $('#poster');
const frame = poster.querySelector('.poster-frame');
const heroImg = $('#poster-hero');
const boardImg = $('#poster-board');
let posterMap = null;
let staticOn = false;
let raf = 0;
let last = 0;
let fw = 0, fh = 0, fl = 0, ft = 0;

function layoutPoster() {
  // Cover the viewport with the 16:10 render.
  const vw = innerWidth, vh = innerHeight;
  fw = Math.max(vw, vh * 1.6);
  fh = fw / 1.6;
  fl = (vw - fw) / 2;
  ft = (vh - fh) / 2;
  frame.style.width = `${fw}px`;
  frame.style.height = `${fh}px`;
  frame.style.left = `${fl}px`;
  frame.style.top = `${ft}px`;
}
const KEYS = ['hero', 'cpu', 'ram', 'gpu', 'ssd', 'io'];
function posterState(i) {
  const portrait = innerWidth / innerHeight < 1;
  const map = posterMap || {};
  if (i === 0) return { s: 1, p: [0.5, 0.5], t: portrait ? [0.5, 0.66] : [0.62, 0.52] };
  if (i === SECTIONS) return { s: portrait ? 1.25 : 1.08, p: [0.5, 0.5], t: portrait ? [0.5, 0.3] : [0.36, 0.5] };
  const right = i % 2 === 1; // panels on the right for CPU, GPU, I/O
  return {
    s: portrait ? 2.2 : 1.85,
    p: map[KEYS[i]] || [0.5, 0.5],
    t: portrait ? [0.5, 0.3] : right ? [0.3, 0.5] : [0.7, 0.5],
  };
}
function drawPoster() {
  const f = app.progress * SECTIONS;
  const i = Math.min(Math.floor(f), SECTIONS - 1);
  const k = easeInOut(f - i);
  const a = posterState(i), b = posterState(i + 1);
  const lerp = (x, y) => x + (y - x) * k;
  const s = lerp(a.s, b.s);
  const px = lerp(a.p[0], b.p[0]), py = lerp(a.p[1], b.p[1]);
  const tx = lerp(a.t[0], b.t[0]) * innerWidth - fl - s * px * fw;
  const ty = lerp(a.t[1], b.t[1]) * innerHeight - ft - s * py * fh;
  frame.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
  boardImg.style.opacity = String(clamp01((app.progress - 0.03) / 0.14));
  const installed = Math.max(0, Math.min(SECTIONS, Math.floor(app.progress * SECTIONS + 0.25)));
  app.hud({ installed, code: installed === SECTIONS ? 'AA' : CODES[Math.round(app.progress * SECTIONS)] });
}
function staticTick(now) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  const moving = app.step(dt);
  drawPoster();
  raf = moving ? requestAnimationFrame(staticTick) : 0;
}
function wake() {
  if (staticOn && !raf) {
    last = 0;
    raf = requestAnimationFrame(staticTick);
  }
}
async function loadPosterAssets() {
  if (!boardImg.getAttribute('src')) boardImg.src = `${BASE}poster-board.jpg`;
  if (!posterMap) {
    try {
      posterMap = await (await fetch(`${BASE}poster.json`, { cache: 'no-cache' })).json();
    } catch {
      posterMap = {};
    }
  }
}
function enterStatic() {
  staticOn = true;
  root.className = root.className.replace(/\bq-(low|medium|high)\b/g, '').trim();
  root.classList.add('q-static');
  root.classList.remove('gl-ready');
  layoutPoster();
  loadPosterAssets().then(() => {
    drawPoster();
    wake();
  });
  drawPoster();
  wake();
}
addEventListener('resize', () => {
  layoutPoster();
  if (staticOn) drawPoster();
});
layoutPoster();
drawPoster(); // hero placeholder while the 3D chunk loads

/* ---------------- 3D lifecycle ---------------- */
const detected = detectTier();
let tier = detected.tier;
let scene = null;
let loading = null;
// The old manual "modo leve" switch is gone; forget a choice saved by it.
try {
  localStorage.removeItem('x1-lite');
} catch {
  /* ignore */
}
root.dataset.gpu = detected.gpu || 'none';

const toast = $('#toast');
function notify(msg) {
  toast.textContent = msg;
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');
}

let finishBoot = null;
const bootDone = runBoot(() => app.loadProgress).then((f) => (finishBoot = f));
app.ready = () => {
  root.classList.add('gl-ready');
  bootDone.then(() => finishBoot && finishBoot());
};

/**
 * Called by the scene when the browser drops the WebGL context: rebuild the 3D one tier lower.
 * Only if that keeps failing does the page fall back to the pre-rendered images.
 */
let restarts = 0;
app.fallback = () => {
  stopScene();
  if (restarts++ < 2) {
    tier = tier === 'high' ? 'medium' : 'low';
    // A lost context stays lost on its canvas, so the new renderer gets a fresh one.
    const old = $('#scene');
    old.replaceWith(old.cloneNode(false));
    setTimeout(() => startScene(tier), 600);
    return;
  }
  enterStatic();
  notify('O navegador interrompeu o 3D — mostrando a versão em imagens.');
};

async function startScene(t) {
  if (scene || loading) return;
  root.className = root.className.replace(/\bq-\w+/g, '').trim();
  root.classList.add(`q-${t}`);
  loading = import('./scene/index.js')
    .then((m) => m.startScene(app, t, { govern: !detected.forced || /[?&]govern\b/.test(location.search) }))
    .then((s) => {
      scene = s;
      staticOn = false;
      if (raf) cancelAnimationFrame(raf), (raf = 0);
    })
    .catch((err) => {
      console.error(err);
      enterStatic();
      bootDone.then(() => finishBoot && finishBoot());
    })
    .finally(() => (loading = null));
  return loading;
}
function stopScene() {
  if (scene) scene.dispose();
  scene = null;
}

if (tier === 'static') {
  enterStatic();
  const done = () => bootDone.then(() => finishBoot && finishBoot());
  heroImg.complete ? done() : (heroImg.addEventListener('load', done, { once: true }), setTimeout(done, 2500));
} else startScene(tier);

/* ---------------- /config live preview bridge ---------------- */
if (window.self !== window.top) {
  root.classList.add('embedded');
  addEventListener('message', async (e) => {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    const { type, section, project } = e.data;
    if (type === 'x1:focus') {
      if (Number.isInteger(section) && sections[section]) {
        scrollTo(0, sections[section].offsetTop);
        app.snap();
        wake();
      }
      if (Number.isInteger(project) && project >= 0 && project < projects.length) app.modal.open(project);
      else app.modal.close();
    }
    if (type === 'x1:poster') {
      try {
        if (!scene) await startScene(tier === 'static' ? 'high' : tier);
        const data = await scene.renderPosters();
        e.source.postMessage({ type: 'x1:poster', ok: true, ...data }, location.origin);
      } catch (err) {
        e.source.postMessage({ type: 'x1:poster', ok: false, error: String(err && err.message) }, location.origin);
      }
    }
  });
  window.parent.postMessage({ type: 'x1:ready' }, location.origin);
}

if (import.meta.env.DEV) {
  Object.assign(window, {
    __app: app,
    __tier: () => JSON.stringify({ tier, detected, scene: !!scene, static: staticOn, classes: root.className }),
    __jump: (i) => {
      scrollTo(0, sections[i].offsetTop);
      app.snap();
      if (staticOn) drawPoster();
    },
  });
}
