import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { routeTraces, makePCBTexture, makePulses, G } from './board/pcb.js';
import { buildBoard } from './board/board.js';
import { profile, projects } from './data.js';
import { renderPanels, createModal, runBoot, scramble } from './ui.js';
import './style.css';

const $ = (s) => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SECTIONS = 5;
const CODES = ['b0', 'C1', 'd4', '62', 'A2', 'AA'];

/** Progress window of chapter i (1-based), optionally its sub-range a..b. */
function S(i, a = 0, b = 1) {
  const s = (i - 1) / SECTIONS + 0.01, e = i / SECTIONS - 0.03;
  return [s + (e - s) * a, s + (e - s) * b];
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

/* ---------------- Renderer ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas: $('#scene'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const BG = 0x05060a;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 9, 22);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 60);

const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(-3, 4, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 1, far: 16 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
scene.add(key);
const cyan = new THREE.DirectionalLight(0x35e0ff, 0.9);
cyan.position.set(5, -2, 3);
scene.add(cyan);
const magenta = new THREE.DirectionalLight(0xff3d9a, 0.6);
magenta.position.set(-5, -3, 2);
scene.add(magenta);
const flashLight = new THREE.PointLight(0x7fe9ff, 0, 2.5, 2);
scene.add(flashLight);

/* Backdrop: soft glow + drifting dust */
function radial(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const backGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 10),
  new THREE.MeshBasicMaterial({ map: radial('rgba(40,90,140,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
);
backGlow.position.z = -1.2;
scene.add(backGlow);
const DUST = isTouch ? 250 : 600;
const dpos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dpos[i * 3] = (Math.random() - 0.5) * 14;
  dpos[i * 3 + 1] = (Math.random() - 0.5) * 9;
  dpos[i * 3 + 2] = Math.random() * 6 - 1;
}
const dgeo = new THREE.BufferGeometry();
dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({
  size: 0.025, map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), color: 0x9fd8ff,
  transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(dust);

/* ---------------- Boot + assets ---------------- */
let loadProgress = 0;
const fontsReady = Promise.race([
  Promise.all([
    document.fonts.load('700 80px "Space Grotesk"'),
    document.fonts.load('500 30px "JetBrains Mono"'),
  ]),
  new Promise((r) => setTimeout(r, 3000)),
]);
const hdrReady = new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}hdr/studio.hdr`, (e) => {
  if (e.total) loadProgress = e.loaded / e.total;
});
const bootDone = runBoot(() => loadProgress);
const [hdr] = await Promise.all([hdrReady, fontsReady]);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromEquirectangular(hdr).texture;
scene.environmentIntensity = 0.6;
hdr.dispose();

/* ---------------- Board ---------------- */
const traces = routeTraces();
const pcbTex = makePCBTexture(traces, renderer);
const B = buildBoard({ profile, projects }, pcbTex, S);
const pulses = makePulses(traces);
B.root.add(pulses.mesh);
const boardGroup = new THREE.Group();
boardGroup.rotation.x = Math.PI / 2; // stand the board up: board-y → world +z, board-z → world -y
boardGroup.add(B.root);
scene.add(boardGroup);

/* ---------------- Post ---------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.4, 0.96));
composer.addPass(new OutputPass());

/* ---------------- Camera keys (world space) ---------------- */
// [position, target, film offset] — film offset slides the board away from the text panel.
const KEYS = [
  [[1.7, -2.6, 6.4], [0.15, -0.05, 0.2], -3.6],
  [[-1.25, 1.75, 2.3], [-0.42, 0.36, 0.05], 3.8],
  [[2.45, 1.45, 2.1], [0.38, 0.42, 0.25], -5.2],
  [[1.55, 1.75, 2.75], [-0.2, -0.38, 0.4], 3.8],
  [[-1.2, 0.25, 2.1], [-0.6, -0.14, 0.05], -4.2],
  [[-3.6, 0.9, 5.2], [-0.15, 0.0, 0.3], 3.6],
].map(([p, t, f]) => {
  const tgt = new THREE.Vector3(...t);
  return { tgt, sph: new THREE.Spherical().setFromVector3(new THREE.Vector3(...p).sub(tgt)), film: f };
});
const camPos = new THREE.Vector3();
const camTgt = new THREE.Vector3();
const sph = new THREE.Spherical();
function cameraAt(p) {
  const f = clamp01(p) * SECTIONS;
  const i = Math.min(Math.floor(f), SECTIONS - 1);
  const t = easeInOut(f - i);
  const a = KEYS[i], b = KEYS[i + 1];
  let dT = b.sph.theta - a.sph.theta;
  if (dT > Math.PI) dT -= Math.PI * 2;
  if (dT < -Math.PI) dT += Math.PI * 2;
  sph.set(THREE.MathUtils.lerp(a.sph.radius, b.sph.radius, t), THREE.MathUtils.lerp(a.sph.phi, b.sph.phi, t), a.sph.theta + dT * t);
  camTgt.lerpVectors(a.tgt, b.tgt, t);
  camPos.setFromSpherical(sph).add(camTgt);
  return THREE.MathUtils.lerp(a.film, b.film, t);
}

/* ---------------- Scroll ---------------- */
let targetProgress = 0;
let progress = 0;
function readScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  targetProgress = max > 0 ? clamp01(scrollY / max) : 0;
}
addEventListener('scroll', readScroll, { passive: true });
readScroll();
progress = targetProgress;
// Dev-only hook for screenshots on slow (software) renderers: snaps scroll + animation.
if (import.meta.env.DEV) {
  window.__jump = (i) => {
    scrollTo(0, sections[i].offsetTop);
    readScroll();
    progress = targetProgress;
  };
  window.__stats = () => {
    let calls = 0, tris = 0;
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const g = o.geometry;
      calls += Array.isArray(o.material) ? g.groups.length || 1 : 1;
      tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    return JSON.stringify({ calls, tris: Math.round(tris), parts: B.parts.length });
  };
  window.__screenOf = (name) => {
    const g = B.parts.find((p) => p.userData.name.includes(name));
    const v = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3()).project(camera);
    return [Math.round(((v.x + 1) / 2) * innerWidth), Math.round(((1 - v.y) / 2) * innerHeight)];
  };
}

const sections = [...document.querySelectorAll('.panel')];
const STAGES = sections.map((s) => s.dataset.stage);
const rail = $('#rail');
STAGES.forEach((name, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<span>${name}</span>`;
  b.setAttribute('aria-label', `Ir para ${name}`);
  b.addEventListener('click', () => goTo(i));
  rail.appendChild(b);
});
const railButtons = [...rail.children];
function goTo(i) {
  scrollTo({ top: sections[i].offsetTop, behavior: reduced ? 'auto' : 'smooth' });
}
document.querySelectorAll('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const i = sections.findIndex((s) => `#${s.id}` === a.getAttribute('href'));
    if (i >= 0) {
      e.preventDefault();
      goTo(i);
    } else if (a.getAttribute('href') === '#top') {
      e.preventDefault();
      goTo(0);
    }
  }),
);

// Reveal each section once and keep it: hiding cards (and replaying bars, timeline and the
// heading scramble) while they were still on screen made content vanish and reappear on scroll.
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      e.target.querySelectorAll('.scr').forEach(scramble);
      io.unobserve(e.target);
    }),
  { threshold: 0, rootMargin: '0px 0px -12% 0px' },
);
sections.forEach((s) => io.observe(s));

/* ---------------- UI ---------------- */
let hoverProject = -1;
let modalProject = -1;
const modal = createModal({
  onOpen: (i) => (modalProject = i),
  onClose: () => (modalProject = -1),
});
renderPanels({ onProjectHover: (i) => (hoverProject = i), onProject: (i) => modal.open(i) });

/* ---------------- /config live preview bridge ---------------- */
// When embedded in the editor, follow what is being edited (section or project).
if (window.self !== window.top) {
  document.body.classList.add('embedded');
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
    const { type, section, project } = e.data;
    if (type !== 'x1:focus') return;
    if (Number.isInteger(section) && sections[section]) {
      scrollTo(0, sections[section].offsetTop);
      readScroll();
      progress = targetProgress;
    }
    if (Number.isInteger(project) && project >= 0 && project < projects.length) modal.open(project);
    else modal.close();
  });
  window.parent.postMessage({ type: 'x1:ready' }, location.origin);
}

/* ---------------- Picking ---------------- */
const mouse = new THREE.Vector2(0, 0);
const mouseSmooth = new THREE.Vector2(0, 0);
const pointer = { x: innerWidth / 2, y: innerHeight / 2, inside: false, overUI: false };
const glowEl = $('#glow');
addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.inside = true;
  pointer.overUI = !!e.target.closest?.('.card, .topbar, #rail, dialog, #inspector, .credits');
  glowEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
});
document.addEventListener('pointerleave', () => (pointer.inside = false));

const raycaster = new THREE.Raycaster();
const pickable = B.meshes.filter((m) => m.userData.part.userData.kind !== 'pcb');
const tip = $('#tip');
const hlCache = new Map();
let hovered = null;
function hl(mat) {
  if (Array.isArray(mat)) return mat.map(hl);
  if (!mat.emissive || mat.userData.keepLook) return mat;
  let h = hlCache.get(mat);
  if (!h) {
    h = mat.clone();
    h.emissive = new THREE.Color(0x35e0ff);
    h.emissiveIntensity = 0.35;
    hlCache.set(mat, h);
  }
  return h;
}
function setHover(part) {
  if (part === hovered) return;
  if (hovered) hovered.traverse((o) => o.isMesh && o.userData.baseMat && (o.material = o.userData.baseMat));
  hovered = part;
  if (part) {
    part.traverse((o) => {
      if (!o.isMesh || o.material === pulses.mesh.material) return;
      o.userData.baseMat = o.material;
      o.material = hl(o.material);
    });
    const d = part.userData;
    tip.querySelector('.cat').textContent = d.kind ? 'Clique para abrir' : 'Componente';
    tip.querySelector('strong').textContent = d.name;
    tip.querySelector('.info').textContent = d.spec || '';
  }
  tip.classList.toggle('show', !!part);
  document.body.style.cursor = part ? 'pointer' : '';
}
function pick() {
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(pickable, false)[0];
  return hit ? hit.object.userData.part : null;
}

const inspector = $('#inspector');
inspector.querySelector('.x').addEventListener('click', () => (inspector.hidden = true));
function activate(part) {
  const d = part.userData;
  if (d.kind === 'ram') return modal.open(d.project);
  if (d.section) return goTo(d.section);
  inspector.querySelector('strong').textContent = d.name;
  inspector.querySelector('b').textContent = d.spec || '';
  inspector.querySelector('p').textContent = d.desc || '';
  inspector.hidden = false;
  inspector.classList.remove('pop');
  void inspector.offsetWidth;
  inspector.classList.add('pop');
}
let downAt = null;
$('#scene').addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
addEventListener('pointerup', (e) => {
  if (!downAt || pointer.overUI || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return (downAt = null);
  downAt = null;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  const p = pick();
  if (p) activate(p);
});

/* ---------------- Loop ---------------- */
const counterEl = $('#installed');
const barEl = $('#bar');
const stageEl = $('#stage-name');
const qEl = $('#qcode');
const timer = new THREE.Timer();
timer.connect(document);
let activeIndex = -1;
let frame = 0;
const boost = new Array(6).fill(0);
const lift = projects.map(() => 0);
const glow = projects.map(() => 0);
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const tmp = new THREE.Vector3();
const ZERO = new THREE.Vector2();
let flash = 0;
let sweeping = false; // true while a dev sweep re-poses the scene

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  readScroll();
}
addEventListener('resize', resize);

/** Positions every installable part for the current `progress`. */
function placeParts(time) {
  const doneBySection = [0, 0, 0, 0, 0, 0];
  const totalBySection = [0, 0, 0, 0, 0, 0];
  for (const ins of B.installs) {
    const { g, off, rot, r, seed } = ins;
    const t = clamp01((progress - r[0]) / (r[1] - r[0]));
    const e = ins.noFloat ? easeInOut(t) : easeOutBack(t);
    const inv = 1 - e;
    const { base, baseRot } = g.userData;
    g.position.copy(base).addScaledVector(off, inv);
    // easeOutBack overshoots past the seat; never let a part sink into the PCB (it would vanish behind it).
    g.position.y = base.y + off.y * Math.max(inv, 0);
    g.rotation.set(baseRot.x + rot.x * inv, baseRot.y + rot.y * inv, baseRot.z + rot.z * inv);
    if (!ins.noFloat && t < 1) {
      const bob = (1 - t) * (reduced ? 0 : 1);
      g.position.y += Math.sin(time * 1.1 + seed) * 0.04 * bob;
      g.rotation.z += Math.sin(time * 0.7 + seed) * 0.05 * bob;
    }
    const sec = g.userData.section;
    if (sec) {
      totalBySection[sec]++;
      if (t >= 1) doneBySection[sec]++;
    }
    const was = ins.done;
    ins.done = t >= 1;
    if (ins.done && !was && frame > 2 && !ins.noFloat && !sweeping) {
      g.getWorldPosition(tmp);
      flashLight.position.copy(tmp).add(new THREE.Vector3(0, 0, 0.45));
      flash = 1;
    }
  }
  const installed = [1, 2, 3, 4, 5].filter((s) => totalBySection[s] && doneBySection[s] === totalBySection[s]);
  return { installed, doneBySection };
}

function aimCamera(dt) {
  const film = cameraAt(progress);
  const aspect = innerWidth / innerHeight;
  const dist = aspect < 1 ? 1 + (1 - aspect) * 1.9 : 1;
  camPos.sub(camTgt).multiplyScalar(dist).add(camTgt);
  mouseSmooth.lerp(pointer.inside ? mouse : ZERO, 1 - Math.exp(-dt * 2.5));
  camera.position.copy(camPos);
  camera.up.set(0, 1, 0);
  camera.lookAt(camTgt);
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const sway = reduced ? 0 : 1;
  camera.position.addScaledVector(right, mouseSmooth.x * 0.22 * sway).addScaledVector(up, mouseSmooth.y * 0.14 * sway);
  camera.lookAt(camTgt);
  camera.filmOffset = aspect > 1.15 ? film : 0;
  // Portrait: panels sit at the bottom (top in the hero), so slide the board out of their way.
  if (aspect < 1) {
    const heroK = 1 - THREE.MathUtils.smoothstep(progress, 0, 1 / SECTIONS);
    const shift = THREE.MathUtils.lerp(0.2, -0.24, heroK) * innerHeight;
    camera.setViewOffset(innerWidth, innerHeight, 0, shift, innerWidth, innerHeight);
  } else if (camera.view) camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

if (import.meta.env.DEV) {
  /*
   * Sweeps the whole scroll range without rendering and reports, per part:
   * - near: the camera gets closer than `margin` to the part (it gets clipped / camera passes through it)
   * - flicker: the part leaves the view frustum and comes back within one section
   */
  window.__hoverState = () => JSON.stringify({ hoverProject, modalProject, hovered: hovered?.userData.name ?? null, overUI: pointer.overUI, inside: pointer.inside, el: document.elementFromPoint(pointer.x, pointer.y)?.className });
  window.__ram = () => B.ram.map((r) => ({ color: '#' + r.color.getHexString(), gain: +r.gain.toFixed(2), intensity: +r.light.emissiveIntensity.toFixed(2) }));
  // Contact sheet of the 3D scene across the scroll range (rendered in chunks: software GL is slow).
  let sheet = null;
  window.__sheetStart = (n = 48, cols = 6, w = 360) => {
    const h = Math.round((w * innerHeight) / innerWidth);
    sheet = { n, cols, w, h, c: Object.assign(document.createElement('canvas'), { width: cols * w, height: Math.ceil(n / cols) * h }) };
    return `${sheet.c.width}x${sheet.c.height}`;
  };
  window.__sheetAdd = (from, to) => {
    const g = sheet.c.getContext('2d');
    const saved = progress;
    for (let i = from; i < Math.min(to, sheet.n); i++) {
      progress = i / (sheet.n - 1);
      sweeping = true;
      placeParts(0);
      aimCamera(0);
      composer.render();
      const x = (i % sheet.cols) * sheet.w, y = Math.floor(i / sheet.cols) * sheet.h;
      g.drawImage(renderer.domElement, x, y, sheet.w, sheet.h);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(x, y, 74, 20);
      g.fillStyle = '#fff';
      g.font = '13px monospace';
      g.fillText(progress.toFixed(3), x + 6, y + 15);
    }
    progress = saved;
    sweeping = false;
    return to;
  };
  window.__sheetGet = () => sheet.c.toDataURL('image/jpeg', 0.72).split(',')[1];
  window.__probe = (steps = 400, margin = 0.12) => {
    const saved = progress;
    const frustum = new THREE.Frustum();
    const m4 = new THREE.Matrix4();
    const box = new THREE.Box3();
    const near = {};
    const seen = new Map();
    for (let s = 0; s <= steps; s++) {
      progress = s / steps;
      sweeping = true;
      placeParts(0);
      aimCamera(0);
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const part of B.parts) {
        box.setFromObject(part);
        const d = box.distanceToPoint(camera.position);
        const name = part.userData.name;
        if (d < margin) (near[name] ||= []).push(+progress.toFixed(3));
        const vis = frustum.intersectsBox(box);
        const h = seen.get(name) || { last: null, out: [] };
        if (h.last === true && !vis) h.leftAt = progress;
        if (h.last === false && vis && h.leftAt != null && progress - h.leftAt < 1 / SECTIONS) h.out.push([+h.leftAt.toFixed(3), +progress.toFixed(3)]);
        h.last = vis;
        seen.set(name, h);
      }
    }
    progress = saved;
    sweeping = false;
    const flicker = Object.fromEntries([...seen].filter(([, h]) => h.out.length).map(([n, h]) => [n, h.out]));
    const nearR = Object.fromEntries(Object.entries(near).map(([n, a]) => [n, [a[0], a[a.length - 1], a.length]]));
    return JSON.stringify({ near: nearR, flicker }, null, 1);
  };
}

function tick(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.05);
  const time = timer.getElapsed();

  progress += (targetProgress - progress) * (1 - Math.exp(-dt * (reduced ? 20 : 5)));
  if (Math.abs(targetProgress - progress) < 1e-5) progress = targetProgress;

  const { installed } = placeParts(time);
  const power = 0.3 + 0.14 * installed.length;

  // RAM: the RGB bar lights only while its project is hovered (3D stick or card) or open.
  const hover3D = hovered?.userData.kind === 'ram' ? hovered.userData.project : -1;
  B.ram.forEach((r, i) => {
    const want = modalProject === i ? 1 : hoverProject === i ? 0.45 : 0;
    lift[i] += (want - lift[i]) * (1 - Math.exp(-dt * 8));
    r.g.position.y += lift[i] * 0.22;
    const active = modalProject === i || hoverProject === i || hover3D === i ? 1 : 0;
    glow[i] += (active - glow[i]) * (1 - Math.exp(-dt * 10));
    r.light.emissiveIntensity = glow[i] * r.gain * (1 + Math.sin(time * 3 + i) * 0.12);
  });

  // Lights, fans, codes
  const hue = (time * 0.06) % 1;
  B.M.rgb.emissive.setHSL(hue, 0.9, 0.55);
  B.M.rgb.emissiveIntensity = 0.4 + power * 2.4;
  B.M.rgb2.emissive.setHSL((hue + 0.33) % 1, 0.9, 0.55);
  B.M.rgb2.emissiveIntensity = installed.includes(3) ? 3 : 0.3;
  const fanSpeed = installed.includes(3) ? 14 : 1.2;
  for (const f of B.fans) f.rotation.z -= fanSpeed * dt;
  B.leds.CPU.emissiveIntensity = installed.includes(1) ? 3 : 0;
  B.leds.DRAM.emissiveIntensity = installed.includes(2) ? 3 : 0;
  B.leds.VGA.emissiveIntensity = installed.includes(3) ? 3 : 0;
  B.leds.BOOT.emissiveIntensity = installed.includes(4) ? 3 : 0;
  const net = installed.includes(5);
  B.blink.forEach((m, i) => (m.emissiveIntensity = net ? (Math.sin(time * (9 + i * 5)) > 0.2 ? 3 : 0.3) : 0));
  flash = Math.max(0, flash - dt * 2.2);
  flashLight.intensity = flash * 0.7;

  // Data pulses
  const idx = Math.round(progress * SECTIONS);
  const focus = [G.MISC, G.CPU, G.RAM, G.GPU, G.SSD, G.IO][idx];
  for (let g = 0; g < 6; g++) {
    let want = g === focus && idx > 0 ? 1 : 0.12;
    if (idx === SECTIONS) want = 0.7;
    if ((hoverProject >= 0 || hover3D >= 0) && g === G.RAM) want = 1;
    boost[g] += (want - boost[g]) * (1 - Math.exp(-dt * 3));
  }
  pulses.uniforms.uBoost.value = boost;
  pulses.uniforms.uTime.value = time;
  pulses.uniforms.uPower.value = power;

  // Camera
  aimCamera(dt);
  dust.rotation.z += dt * 0.01;
  dust.position.y = Math.sin(time * 0.15) * 0.1;

  // HUD
  if (idx !== activeIndex) {
    activeIndex = idx;
    railButtons.forEach((b, i) => b.classList.toggle('active', i === idx));
    stageEl.textContent = STAGES[idx];
  }
  const code = idx === SECTIONS && installed.length === 5 ? 'AA' : CODES[idx];
  B.setCode(code);
  qEl.textContent = code;
  counterEl.textContent = installed.length;
  barEl.style.transform = `scaleX(${progress})`;

  // Hover
  if (!isTouch && pointer.inside && !pointer.overUI && frame % 2 === 0) setHover(pick());
  else if (pointer.overUI && hovered) setHover(null);
  if (hovered) tip.style.transform = `translate(${pointer.x + 18}px, ${pointer.y + 18}px)`;

  composer.render();
  if (++frame === 3) bootDone.then((finish) => finish());
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
