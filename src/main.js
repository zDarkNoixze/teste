import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { loadCar, applyExplode, createMaterials, SECTIONS, S, clamp01, easeInOut } from './car.js';
import './style.css';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const isTouch = matchMedia('(pointer: coarse)').matches;
const loaderText = $('#loader p');

/* ---------------- Renderer & cena ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const BG = 0x07080b;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 18, 40);

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);

const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(5, 10, -4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.015;
scene.add(key);
const rim = new THREE.DirectionalLight(0x6aa8ff, 1.2);
rim.position.set(-6, 3, 6);
scene.add(rim);
const warm = new THREE.DirectionalLight(0xff7a45, 0.5);
warm.position.set(6, 1.5, 5);
scene.add(warm);

/* Chão, brilho sob o carro, grade "blueprint" e partículas */
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(40, 64),
  new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.62, metalness: 0, envMapIntensity: 0.03 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function radialTexture(inner, outer) {
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
const glow = new THREE.Mesh(
  new THREE.PlaneGeometry(5, 9),
  new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(255,60,50,0.22)', 'rgba(0,0,0,0)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }),
);
glow.rotation.x = -Math.PI / 2;
glow.position.y = 0.002;
scene.add(glow);

const grid = new THREE.GridHelper(40, 80, 0x3a4a66, 0x1a2230);
grid.material.transparent = true;
grid.material.depthWrite = false;
grid.position.y = 0.001;
scene.add(grid);

const PCOUNT = isTouch ? 300 : 700;
const pPos = new Float32Array(PCOUNT * 3);
for (let i = 0; i < PCOUNT; i++) {
  pPos[i * 3] = (Math.random() - 0.5) * 26;
  pPos[i * 3 + 1] = Math.random() * 9;
  pPos[i * 3 + 2] = (Math.random() - 0.5) * 26;
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const particles = new THREE.Points(
  pGeo,
  new THREE.PointsMaterial({
    size: 0.04, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
    color: 0x9fc2ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending,
  }),
);
scene.add(particles);

/* ---------------- Ambiente HDR + carro ---------------- */
const M = createMaterials();
let loadShare = [0, 0];
const showLoad = () => (loaderText.textContent = `Ligando o motor… ${Math.round(((loadShare[0] + loadShare[1]) / 2) * 100)}%`);
const pmrem = new THREE.PMREMGenerator(renderer);
const [hdr, car] = await Promise.all([
  new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}hdr/studio.hdr`, (e) => {
    if (e.total) (loadShare[0] = e.loaded / e.total), showLoad();
  }),
  loadCar(M, (f) => ((loadShare[1] = f), showLoad())),
]);
hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = pmrem.fromEquirectangular(hdr).texture;
scene.environmentIntensity = 0.55;
scene.environmentRotation.y = Math.PI * 0.6;
hdr.dispose();
scene.add(car.group);
$('#total-parts').textContent = car.parts.length;
$('#final-count').textContent = car.parts.length;
$('#hero-count').textContent = car.parts.length;

/* ---------------- Pós-processamento ---------------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.35, 2.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------------- Câmera por capítulo ---------------- */
// [posição, alvo, deslocamento lateral do enquadramento] — um por seção. Frente do carro = -Z.
const KEYS = [
  [[5.4, 1.45, -6.2], [0, 0.55, 0], -3.5],
  [[-5.2, 4.4, -6.0], [0, 1.2, 0.3], 4],
  [[7.6, 2.8, -2.4], [0.3, 0.8, -0.1], -4],
  [[-7.6, 6.4, 7.0], [0, 1.2, 0], 4],
  [[6.6, 2.6, -6.2], [1.0, 0.7, -0.4], -3.5],
  [[-3.8, 4.0, 5.0], [0, 1.0, 1.0], 4],
  [[4.6, 3.9, -3.8], [0, 1.3, -0.2], -4],
  [[10.5, 6.8, -9.5], [0, 1.2, 0], 4],
].map(([p, t, f]) => {
  const tgt = new THREE.Vector3(...t);
  return { tgt, sph: new THREE.Spherical().setFromVector3(new THREE.Vector3(...p).sub(tgt)), film: f };
});

// Orbit between keys (spherical lerp) so the camera never cuts through the car.
const camPos = new THREE.Vector3();
const camTgt = new THREE.Vector3();
const sph = new THREE.Spherical();
function cameraAt(p) {
  const f = clamp01(p) * SECTIONS;
  const i = Math.min(Math.floor(f), SECTIONS - 1);
  const t = easeInOut(f - i);
  const a = KEYS[i], b = KEYS[i + 1];
  let dTheta = b.sph.theta - a.sph.theta;
  if (dTheta > Math.PI) dTheta -= Math.PI * 2;
  if (dTheta < -Math.PI) dTheta += Math.PI * 2;
  sph.set(
    THREE.MathUtils.lerp(a.sph.radius, b.sph.radius, t),
    THREE.MathUtils.lerp(a.sph.phi, b.sph.phi, t),
    a.sph.theta + dTheta * t,
  );
  camTgt.lerpVectors(a.tgt, b.tgt, t);
  camPos.setFromSpherical(sph).add(camTgt);
  return THREE.MathUtils.lerp(a.film, b.film, t);
}

/* ---------------- Scroll, ponteiro e HUD ---------------- */
let targetProgress = 0;
let progress = 0;
function readScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  targetProgress = max > 0 ? clamp01(scrollY / max) : 0;
}
addEventListener('scroll', readScroll, { passive: true });
readScroll();
progress = targetProgress;

const mouse = new THREE.Vector2(0, 0);
const mouseSmooth = new THREE.Vector2(0, 0);
const pointer = { x: 0, y: 0, inside: false };
addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.inside = true;
});
document.addEventListener('pointerleave', () => (pointer.inside = false));

const sections = [...document.querySelectorAll('.panel')];
const rail = $('#rail');
const STAGES = sections.map((s) => s.dataset.stage);
STAGES.forEach((name, i) => {
  const b = document.createElement('button');
  b.innerHTML = `<span>${name}</span>`;
  b.setAttribute('aria-label', `Ir para ${name}`);
  b.addEventListener('click', () => scrollTo({ top: sections[i].offsetTop, behavior: 'smooth' }));
  rail.appendChild(b);
});
const railButtons = [...rail.children];

const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.target.classList.toggle('in', e.isIntersecting)),
  { threshold: 0.45 },
);
sections.forEach((s) => io.observe(s));

$('#reassemble').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

/* Troca de cor da pintura */
const paintTarget = M.paint.color.clone();
document.querySelectorAll('.swatch').forEach((btn) => {
  btn.style.setProperty('--c', btn.dataset.color);
  btn.addEventListener('click', () => {
    document.querySelectorAll('.swatch').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    paintTarget.set(btn.dataset.color);
    $('#paint-name').textContent = btn.dataset.name;
  });
});

/* ---------------- Hover nas peças ---------------- */
// BVHs are built in small idle batches so the first frames stay smooth.
const bvhQueue = [...car.meshes];
let bvhReady = false;
(function buildBVH() {
  const end = performance.now() + 8;
  while (bvhQueue.length && performance.now() < end) {
    const m = bvhQueue.pop();
    if (!m.geometry.boundsTree) m.geometry.computeBoundsTree();
  }
  if (bvhQueue.length) setTimeout(buildBVH, 16);
  else bvhReady = true;
})();

const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const tip = $('#tip');
const hlCache = new Map();
let hovered = null;

function highlightMat(mat) {
  let h = hlCache.get(mat);
  if (!h) {
    h = mat.clone();
    h.color = mat.color; // shared so paint changes stay in sync
    if (h.emissive) {
      h.emissive = new THREE.Color(0x2f7bff);
      h.emissiveIntensity = 0.5;
    }
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
      if (!o.isMesh) return;
      o.userData.baseMat = o.material;
      o.material = highlightMat(o.material);
    });
    tip.querySelector('.cat').textContent = part.userData.cat;
    tip.querySelector('strong').textContent = part.userData.label;
  }
  tip.classList.toggle('show', !!part);
  document.body.style.cursor = part ? 'crosshair' : '';
}

/* ---------------- Loop ---------------- */
const counterEl = $('#counter');
const looseEl = $('#loose-parts');
const barEl = $('#bar');
const stageEl = $('#stage-name');
const timer = new THREE.Timer();
timer.connect(document);
let lastProgress = progress;
let activeIndex = -1;
let frame = 0;
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const AO_OFF = S(3, 0.3)[0];

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  readScroll();
}
addEventListener('resize', resize);

function tick(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.05);
  const time = timer.getElapsed();

  progress += (targetProgress - progress) * (1 - Math.exp(-dt * 5));
  if (Math.abs(targetProgress - progress) < 1e-5) progress = targetProgress;
  const velocity = (progress - lastProgress) / Math.max(dt, 1e-4);
  lastProgress = progress;

  const loose = applyExplode(car.parts, progress);
  car.ao.visible = progress < AO_OFF;

  // Hero: turntable suave; final: leve órbita contemplativa.
  const hero = 1 - THREE.MathUtils.smoothstep(progress, 0, 0.08);
  const finale = easeInOut(clamp01((progress - S(7)[0]) / (S(7)[1] - S(7)[0])));
  car.group.rotation.y = hero * Math.sin(time * 0.35) * 0.25 + finale * Math.sin(time * 0.18) * 0.35;

  const spin = 2.2 * hero + velocity * 60;
  for (const w of car.spinners) w.rotation.x -= spin * dt;

  M.paint.color.lerp(paintTarget, 1 - Math.exp(-dt * 6));

  // Câmera
  const film = cameraAt(progress);
  const aspect = innerWidth / innerHeight;
  const dist = aspect < 1 ? 1 + (1 - aspect) * 2 : 1;
  camPos.sub(camTgt).multiplyScalar(dist).add(camTgt);
  mouseSmooth.lerp(mouse, 1 - Math.exp(-dt * 3));
  camera.position.copy(camPos);
  camera.lookAt(camTgt);
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  camera.position.addScaledVector(right, mouseSmooth.x * 0.35).addScaledVector(up, mouseSmooth.y * 0.2);
  camera.lookAt(camTgt);
  camera.filmOffset = aspect > 1.15 ? film : 0;
  camera.updateProjectionMatrix();

  grid.material.opacity = 0.05 + 0.4 * THREE.MathUtils.smoothstep(progress, 0.25, 1);
  glow.material.opacity = 1 - 0.7 * THREE.MathUtils.smoothstep(progress, 0.3, 0.6);
  particles.rotation.y += dt * 0.012;
  particles.position.y = Math.sin(time * 0.2) * 0.15;

  // HUD
  const idx = Math.round(progress * SECTIONS);
  if (idx !== activeIndex) {
    activeIndex = idx;
    railButtons.forEach((b, i) => b.classList.toggle('active', i === idx));
    counterEl.textContent = `${String(idx).padStart(2, '0')} / ${String(SECTIONS).padStart(2, '0')}`;
    stageEl.textContent = STAGES[idx];
  }
  looseEl.textContent = loose;
  barEl.style.transform = `scaleX(${progress})`;

  // Hover (desktop)
  if (!isTouch && bvhReady && pointer.inside && frame % 2 === 0) {
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(car.meshes, false)[0];
    setHover(hit ? hit.object.userData.part : null);
  }
  if (hovered) tip.style.transform = `translate(${pointer.x + 18}px, ${pointer.y + 18}px)`;

  composer.render();
  if (++frame === 3) document.body.classList.add('ready');
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
