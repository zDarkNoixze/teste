import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { routeTraces, makePCBTexture, makePulses, G } from '../board/pcb.js';
import { buildBoard } from '../board/board.js';
import { profile, projects } from '../data.js';

/*
 * Per-tier budgets. `maxPixels` caps the drawing-buffer size so a 4K monitor or a 3×-DPR phone
 * costs the same as a reasonable laptop; the governor scales resolution further at runtime.
 */
const QUALITY = {
  high: { dprMax: 2, maxPixels: 4.2e6, minScale: 0.6, msaa: 4, bloom: 1, shadows: 2048, hdr: 'studio.hdr', pcb: 1, tex: 1, aniso: 8, smd: 1, dust: 600, lights: 4, pickEvery: 2, shadowEvery: 1 },
  medium: { dprMax: 1.5, maxPixels: 2.3e6, minScale: 0.6, msaa: 2, bloom: 0.5, shadows: 1024, hdr: 'studio-512.hdr', pcb: 0.5, tex: 0.75, aniso: 4, smd: 0.6, dust: 280, lights: 4, pickEvery: 3, shadowEvery: 2 },
  low: { dprMax: 1.25, maxPixels: 1.2e6, minScale: 0.65, msaa: 0, bloom: 0, shadows: 0, hdr: null, pcb: 0.5, tex: 0.5, aniso: 2, smd: 0.35, dust: 110, lights: 2, pickEvery: 3, shadowEvery: 0 },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const BASE = import.meta.env.BASE_URL;

export async function startScene(app, tier, { govern = true } = {}) {
  const Q = { ...QUALITY[tier] };
  const { SECTIONS, CODES, reduced, isTouch, pointer } = app;
  const canvas = document.querySelector('#scene');
  const S = (i, a = 0, b = 1) => {
    const s = (i - 1) / SECTIONS + 0.01, e = i / SECTIONS - 0.03;
    return [s + (e - s) * a, s + (e - s) * b];
  };

  /* ---------------- Renderer ---------------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !Q.bloom, // with post-processing, MSAA lives in the composer's render target instead
    stencil: false,
    powerPreference: tier === 'high' ? 'high-performance' : 'default',
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !!Q.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // re-rendered only while something moves

  let govScale = 1;
  const dprFor = () => {
    const budget = Math.sqrt(Q.maxPixels / (innerWidth * innerHeight));
    return Math.max(0.4, Math.min(devicePixelRatio || 1, Q.dprMax, budget) * govScale);
  };

  const BG = 0x05060a;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 9, 22);
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 60);

  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(-3, 4, 6);
  key.castShadow = !!Q.shadows;
  if (Q.shadows) {
    key.shadow.mapSize.set(Q.shadows, Q.shadows);
    Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 1, far: 16 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.01;
  }
  scene.add(key);
  const cyan = new THREE.DirectionalLight(0x35e0ff, 0.9);
  cyan.position.set(5, -2, 3);
  scene.add(cyan);
  let flashLight = null;
  if (Q.lights > 2) {
    const magenta = new THREE.DirectionalLight(0xff3d9a, 0.6);
    magenta.position.set(-5, -3, 2);
    scene.add(magenta);
    flashLight = new THREE.PointLight(0x7fe9ff, 0, 2.5, 2);
    scene.add(flashLight);
  } else key.intensity = 1.9; // compensate for the dropped fill light

  function radial(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, inner);
    grd.addColorStop(1, outer);
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
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
  const dpos = new Float32Array(Q.dust * 3);
  for (let i = 0; i < Q.dust; i++) {
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

  /* ---------------- Environment: instant procedural, HDR swapped in when it arrives ---------------- */
  let disposed = false;
  let envKind = 'room';
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  let envTex = pmrem.fromScene(roomEnv, 0.04).texture;
  roomEnv.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = Q.hdr ? 0.5 : 0.62;
  let hdrReady = Promise.resolve(false);
  if (Q.hdr) {
    hdrReady = new HDRLoader()
      .loadAsync(`${BASE}hdr/${Q.hdr}`, (e) => e.total && (app.loadProgress = e.loaded / e.total))
      .then((hdr) => {
        if (disposed) return false;
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const t = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        envTex.dispose();
        envTex = scene.environment = t;
        envKind = Q.hdr;
        scene.environmentIntensity = 0.6;
        return true;
      })
      .catch(() => false);
  } else app.loadProgress = 1;

  /* ---------------- Board ---------------- */
  await Promise.race([
    Promise.all([document.fonts?.load('700 80px "Space Grotesk"'), document.fonts?.load('500 30px "JetBrains Mono"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});

  const traces = routeTraces();
  const pcbTex = makePCBTexture(traces, renderer, Q.pcb);
  const B = buildBoard({ profile, projects }, pcbTex, S, Q);
  const pulses = makePulses(traces);
  B.root.add(pulses.mesh);
  const boardGroup = new THREE.Group();
  boardGroup.rotation.x = Math.PI / 2; // stand the board up: board-y → world +z, board-z → world -y
  boardGroup.add(B.root);
  scene.add(boardGroup);
  if (!Q.shadows) B.root.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = false));
  // High-end: wait briefly for the HDR so the first frame already has final reflections.
  if (tier === 'high') await Promise.race([hdrReady, new Promise((r) => setTimeout(r, 1200))]);

  /* ---------------- Post-processing ---------------- */
  let composer = null;
  let bloom = null;
  function buildComposer() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.msaa });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.4, 0.96);
    const setSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => setSize(Math.max(64, Math.round(w * Q.bloom)), Math.max(64, Math.round(h * Q.bloom)));
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  function dropComposer() {
    if (!composer) return;
    composer.renderTarget1.dispose();
    composer.renderTarget2.dispose();
    bloom.dispose();
    composer = bloom = null;
  }
  if (Q.bloom) buildComposer();

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dprFor());
    renderer.setSize(innerWidth, innerHeight);
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(innerWidth, innerHeight);
    }
    renderer.shadowMap.needsUpdate = true;
  }
  resize();

  /* ---------------- Camera keys (world space) ---------------- */
  // [position, target, film offset] — film offset slides the board away from the text panel.
  const KEYS = [
    [[1.7, -2.6, 6.4], [0.15, -0.05, 0.2], -3.6],
    [[-1.25, 1.75, 2.3], [-0.42, 0.36, 0.05], 3.8],
    [[2.45, 1.45, 2.1], [0.38, 0.42, 0.25], -5.2],
    [[1.0, -3.4, 2.6], [-0.2, -0.65, 0.5], 3.8], // below the card, facing the fans
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

  const mouse = new THREE.Vector2();
  const mouseSmooth = new THREE.Vector2();
  const ZERO = new THREE.Vector2();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  function aimCamera(dt, p = app.progress) {
    const film = cameraAt(p);
    const aspect = camera.aspect;
    const dist = aspect < 1 ? 1 + (1 - aspect) * 1.9 : 1;
    camPos.sub(camTgt).multiplyScalar(dist).add(camTgt);
    mouse.set(pointer.nx, pointer.ny);
    mouseSmooth.lerp(pointer.inside && !isTouch ? mouse : ZERO, 1 - Math.exp(-dt * 2.5));
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
      const heroK = 1 - THREE.MathUtils.smoothstep(p, 0, 1 / SECTIONS);
      const shift = THREE.MathUtils.lerp(0.2, -0.24, heroK) * innerHeight;
      camera.setViewOffset(innerWidth, innerHeight, 0, shift, innerWidth, innerHeight);
    } else if (camera.view) camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  /* ---------------- Picking & hover ---------------- */
  const raycaster = new THREE.Raycaster();
  const pickable = B.meshes.filter((m) => m.userData.part.userData.kind !== 'pcb');
  const tip = app.tip;
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
  function pick(nx = pointer.nx, ny = pointer.ny) {
    raycaster.setFromCamera(mouse.set(nx, ny), camera);
    const hit = raycaster.intersectObjects(pickable, false)[0];
    return hit ? hit.object.userData.part : null;
  }
  function activate(part) {
    const d = part.userData;
    if (d.kind === 'ram') return app.modal.open(d.project);
    if (d.section) return app.goTo(d.section);
    app.showInspector(d);
  }
  let downAt = null;
  const onDown = (e) => (downAt = [e.clientX, e.clientY]);
  const onUp = (e) => {
    if (!downAt || pointer.overUI || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return (downAt = null);
    downAt = null;
    const p = pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (p) activate(p);
  };
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointerup', onUp);

  /* ---------------- Animation ---------------- */
  const tmp = new THREE.Vector3();
  const flashOffset = new THREE.Vector3(0, 0, 0.45);
  let frame = 0;
  let flash = 0;
  let sweeping = false;
  const boost = new Array(6).fill(0);
  const lift = projects.map(() => 0);
  const glow = projects.map(() => 0);

  /** Positions every installable part for progress `p`; reports whether anything is moving. */
  function placeParts(time, p = app.progress) {
    const doneBySection = [0, 0, 0, 0, 0, 0];
    const totalBySection = [0, 0, 0, 0, 0, 0];
    let moving = false;
    for (const ins of B.installs) {
      const { g, off, rot, r, seed } = ins;
      const t = clamp01((p - r[0]) / (r[1] - r[0]));
      const e = ins.noFloat ? easeInOut(t) : easeOutBack(t);
      const inv = 1 - e;
      const { base, baseRot } = g.userData;
      g.position.copy(base).addScaledVector(off, inv);
      // easeOutBack overshoots past the seat; never let a part sink into the PCB.
      g.position.y = base.y + off.y * Math.max(inv, 0);
      g.rotation.set(baseRot.x + rot.x * inv, baseRot.y + rot.y * inv, baseRot.z + rot.z * inv);
      if (!ins.noFloat && t < 1) {
        const bob = (1 - t) * (reduced ? 0 : 1);
        g.position.y += Math.sin(time * 1.1 + seed) * 0.04 * bob;
        g.rotation.z += Math.sin(time * 0.7 + seed) * 0.05 * bob;
        if (bob) moving = true;
      }
      if (t > 0 && t < 1) moving = true;
      const sec = g.userData.section;
      if (sec) {
        totalBySection[sec]++;
        if (t >= 1) doneBySection[sec]++;
      }
      const was = ins.done;
      ins.done = t >= 1;
      if (flashLight && ins.done && !was && frame > 2 && !ins.noFloat && !sweeping) {
        g.getWorldPosition(tmp);
        flashLight.position.copy(tmp).add(flashOffset);
        flash = 1;
      }
    }
    const installed = [1, 2, 3, 4, 5].filter((s) => totalBySection[s] && doneBySection[s] === totalBySection[s]);
    return { installed, moving };
  }

  function animate(dt, time) {
    const { installed, moving } = placeParts(time);
    const power = 0.3 + 0.14 * installed.length;
    let lifting = false;

    // RAM: the RGB bar lights only while its project is hovered (3D stick or card) or open.
    const hover3D = hovered && hovered.userData.kind === 'ram' ? hovered.userData.project : -1;
    B.ram.forEach((r, i) => {
      const want = app.modalProject === i ? 1 : app.hoverProject === i ? 0.45 : 0;
      lift[i] += (want - lift[i]) * (1 - Math.exp(-dt * 8));
      if (Math.abs(want - lift[i]) > 0.002) lifting = true;
      r.g.position.y += lift[i] * 0.22;
      const active = app.modalProject === i || app.hoverProject === i || hover3D === i ? 1 : 0;
      glow[i] += (active - glow[i]) * (1 - Math.exp(-dt * 10));
      r.light.emissiveIntensity = glow[i] * r.gain * (1 + Math.sin(time * 3 + i) * 0.12);
    });

    const hue = (time * 0.06) % 1;
    B.M.rgb.emissive.setHSL(hue, 0.9, 0.55);
    B.M.rgb.emissiveIntensity = 0.4 + power * 2.4;
    B.M.rgb2.emissive.setHSL((hue + 0.33) % 1, 0.9, 0.55);
    B.M.rgb2.emissiveIntensity = installed.includes(3) ? 3 : 0.3;
    B.M.fanGlow.emissive.copy(B.M.rgb2.emissive);
    B.M.fanGlow.emissiveIntensity = installed.includes(3) ? 0.9 : 0.1;
    const fanSpeed = installed.includes(3) ? 14 : 1.2;
    for (const f of B.fans) f.rotation.z -= fanSpeed * dt;
    B.leds.CPU.emissiveIntensity = installed.includes(1) ? 3 : 0;
    B.leds.DRAM.emissiveIntensity = installed.includes(2) ? 3 : 0;
    B.leds.VGA.emissiveIntensity = installed.includes(3) ? 3 : 0;
    B.leds.BOOT.emissiveIntensity = installed.includes(4) ? 3 : 0;
    const net = installed.includes(5);
    B.blink.forEach((m, i) => (m.emissiveIntensity = net ? (Math.sin(time * (9 + i * 5)) > 0.2 ? 3 : 0.3) : 0));
    if (flashLight) {
      flash = Math.max(0, flash - dt * 2.2);
      flashLight.intensity = flash * 0.7;
    }

    const idx = Math.round(app.progress * SECTIONS);
    const focus = [G.MISC, G.CPU, G.RAM, G.GPU, G.SSD, G.IO][idx];
    for (let g = 0; g < 6; g++) {
      let want = g === focus && idx > 0 ? 1 : 0.12;
      if (idx === SECTIONS) want = 0.7;
      if ((app.hoverProject >= 0 || hover3D >= 0) && g === G.RAM) want = 1;
      boost[g] += (want - boost[g]) * (1 - Math.exp(-dt * 3));
    }
    pulses.uniforms.uBoost.value = boost;
    pulses.uniforms.uTime.value = time;
    pulses.uniforms.uPower.value = power;
    dust.rotation.z += dt * 0.01;
    dust.position.y = Math.sin(time * 0.15) * 0.1;

    const code = idx === SECTIONS && installed.length === 5 ? 'AA' : CODES[idx];
    B.setCode(code);
    app.hud({ installed: installed.length, code });
    return moving || lifting;
  }

  function render() {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }

  /* ---------------- Governor: hold a smooth frame rate on any device ---------------- */
  const gov = { ema: 0, lastEval: 0, slow: 0, fast: 0, warmUntil: performance.now() + 2500, log: [] };
  function governFrame(dt, now) {
    if (!govern || now < gov.warmUntil || dt <= 0 || dt > 0.5) return;
    gov.ema = gov.ema ? gov.ema * 0.9 + dt * 0.1 : dt;
    if (now - gov.lastEval < 1000) return;
    gov.lastEval = now;
    const fps = 1 / gov.ema;
    if (fps < 40) (gov.slow++, (gov.fast = 0));
    else if (fps > 56) (gov.fast++, (gov.slow = 0));
    else gov.slow = gov.fast = 0;

    if (gov.slow >= 2) {
      gov.slow = 0;
      let step;
      if (govScale > Q.minScale + 1e-3) {
        govScale = Math.max(Q.minScale, govScale - 0.15);
        resize();
        step = `resolução ${Math.round(govScale * 100)}%`;
      } else if (composer) {
        dropComposer();
        renderer.dispose(); // drop cached programs built for the render target
        step = 'sem bloom';
      } else if (renderer.shadowMap.enabled) {
        renderer.shadowMap.enabled = false;
        step = 'sem sombras';
      } else if (govScale > 0.4 + 1e-3) {
        // Last resort stays in 3D: keep trading resolution for frame rate.
        govScale = Math.max(0.4, govScale - 0.1);
        resize();
        step = `resolução ${Math.round(govScale * 100)}%`;
      }
      if (step) gov.log.push(`${Math.round(fps)} fps → ${step}`);
      gov.warmUntil = now + 1500;
      gov.ema = 0;
    } else if (gov.fast >= 4 && govScale < 1) {
      gov.fast = 0;
      govScale = Math.min(1, govScale + 0.1);
      resize();
      gov.log.push(`${Math.round(fps)} fps → resolução ${Math.round(govScale * 100)}%`);
    }
  }

  /* ---------------- Loop ---------------- */
  const timer = new THREE.Timer();
  timer.connect(document);
  let raf = 0;
  let lastActive = performance.now();
  let lastFrameAt = 0;
  let lastEvery = 1;
  let pickProgress = -1;
  let skip = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    const time = timer.getElapsed();
    const scrolling = app.step(dt);
    if (scrolling || pointer.moved) lastActive = now;

    // Spend less while the scene is covered (modal) or the visitor is idle on modest hardware.
    const idle = now - lastActive > 4000;
    const every = app.modalProject >= 0 ? 3 : idle && tier !== 'high' ? 2 : 1;
    if (++skip < every) return;
    skip = 0;
    // Time per rendered frame, normalised by the skip factor, so idle/throttled phases are measured too.
    if (lastFrameAt) governFrame((now - lastFrameAt) / 1000 / lastEvery, now);
    lastFrameAt = now;
    lastEvery = every;

    const moving = animate(dt * every, time);
    aimCamera(dt * every);

    if (renderer.shadowMap.enabled && (moving || scrolling) && frame % Q.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;

    // Raycast only when the pointer or the camera actually moved.
    if (!isTouch && pointer.inside && !pointer.overUI && frame % Q.pickEvery === 0 && (pointer.moved || Math.abs(pickProgress - app.progress) > 1e-4)) {
      setHover(pick());
      pointer.moved = false;
      pickProgress = app.progress;
    } else if (pointer.overUI && hovered) setHover(null);
    if (hovered) tip.style.transform = `translate(${pointer.x + 18}px, ${pointer.y + 18}px)`;

    render();
    if (++frame === 3) app.ready();
  }

  /* ---------------- Lifecycle ---------------- */
  const onResize = () => resize();
  const onLost = (e) => {
    e.preventDefault();
    app.fallback('lost');
  };
  addEventListener('resize', onResize);
  canvas.addEventListener('webglcontextlost', onLost);
  renderer.shadowMap.needsUpdate = true;
  raf = requestAnimationFrame(tick);

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
    removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('webglcontextlost', onLost);
    timer.dispose?.();
    setHover(null);
    const seen = new Set();
    scene.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) seen.add(o.geometry), o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        for (const v of Object.values(m)) if (v && v.isTexture && !seen.has(v)) seen.add(v), v.dispose();
        m.dispose();
      }
    });
    hlCache.forEach((m) => m.dispose());
    envTex.dispose();
    pmrem.dispose();
    dropComposer();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.width = renderer.domElement.height = 1;
  }

  /* ---------------- Pre-rendered images for the static mode (used by /config) ---------------- */
  async function renderPosters(w = 1600, h = 1000) {
    sweeping = true;
    const saved = { dpr: renderer.getPixelRatio(), aspect: camera.aspect };
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    composer?.setPixelRatio(1);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    // hero: same view as the live intro (seamless swap); board: near-frontal map of the assembled
    // board, which reads best when the static mode zooms into each component.
    const POSES = { hero: null, board: [new THREE.Vector3(0.35, -1.25, 6.3), new THREE.Vector3(0, -0.02, 0.25)] };
    const pose = (p, kind) => {
      placeParts(0, p);
      if (POSES[kind]) {
        camera.position.copy(POSES[kind][0]);
        camera.up.set(0, 1, 0);
        camera.lookAt(POSES[kind][1]);
      } else {
        cameraAt(0);
        camera.position.copy(camPos);
        camera.up.set(0, 1, 0);
        camera.lookAt(camTgt);
      }
      camera.filmOffset = 0;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
      const on = kind === 'board';
      B.ram.forEach((r) => (r.light.emissiveIntensity = 0));
      B.M.rgb.emissive.setHSL(0.53, 0.9, 0.55);
      B.M.rgb.emissiveIntensity = on ? 1.6 : 1.1;
      B.M.rgb2.emissive.setHSL(0.86, 0.9, 0.55);
      B.M.rgb2.emissiveIntensity = on ? 2 : 0.3;
      B.M.fanGlow.emissive.copy(B.M.rgb2.emissive);
      B.M.fanGlow.emissiveIntensity = on ? 0.7 : 0.1;
      for (const k of ['CPU', 'DRAM', 'VGA', 'BOOT']) B.leds[k].emissiveIntensity = on ? 3 : 0;
      B.setCode(on ? 'AA' : 'b0');
      pulses.uniforms.uPower.value = on ? 0.9 : 0.3;
      pulses.uniforms.uBoost.value = new Array(6).fill(on ? 0.5 : 0.12);
      if (flashLight) flashLight.intensity = 0;
      renderer.shadowMap.needsUpdate = true;
      scene.updateMatrixWorld(true);
    };
    const shot = () => {
      render();
      return renderer.domElement.toDataURL('image/jpeg', 0.84);
    };
    pose(0, 'hero');
    const hero = shot();
    pose(1, 'board');
    const board = shot();
    const center = (g) => {
      const v = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3()).project(camera);
      return [+((v.x + 1) / 2).toFixed(4), +((1 - v.y) / 2).toFixed(4)];
    };
    const byKind = (k) => B.parts.find((p) => p.userData.kind === k);
    const ramC = B.ram.map((r) => center(r.g));
    const map = {
      cpu: center(byKind('cpu')),
      ram: [ramC.reduce((s, c) => s + c[0], 0) / ramC.length, ramC.reduce((s, c) => s + c[1], 0) / ramC.length].map((v) => +v.toFixed(4)),
      gpu: center(byKind('gpu')),
      ssd: center(B.parts.find((p) => p.userData.name === 'SSD NVMe')),
      io: center(B.parts.find((p) => p.userData.name.startsWith('Painel de I/O'))),
    };
    renderer.setPixelRatio(saved.dpr);
    camera.aspect = saved.aspect;
    resize();
    sweeping = false;
    return { hero, board, map };
  }

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __stats: () => {
        let calls = 0, tris = 0;
        scene.traverse((o) => {
          if (!o.isMesh || !o.visible) return;
          const g = o.geometry;
          calls += Array.isArray(o.material) ? g.groups.length || 1 : 1;
          tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
        });
        const db = renderer.getDrawingBufferSize(new THREE.Vector2());
        return JSON.stringify({ tier, calls, tris: Math.round(tris), parts: B.parts.length, buffer: `${db.x}x${db.y}`, dpr: +renderer.getPixelRatio().toFixed(2), bloom: !!composer, msaa: composer ? Q.msaa : 'canvas', shadows: renderer.shadowMap.enabled && Q.shadows, env: envKind, programs: renderer.info.programs?.length, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries });
      },
      __gov: () => JSON.stringify({ scale: govScale, fps: gov.ema ? Math.round(1 / gov.ema) : null, log: gov.log }),
      __screenOf: (name) => {
        const g = B.parts.find((p) => p.userData.name.includes(name));
        const v = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3()).project(camera);
        return [Math.round(((v.x + 1) / 2) * innerWidth), Math.round(((1 - v.y) / 2) * innerHeight)];
      },
      __ram: () => B.ram.map((r) => ({ color: '#' + r.color.getHexString(), intensity: +r.light.emissiveIntensity.toFixed(2) })),
      __loseContext: () => renderer.getContext().getExtension('WEBGL_lose_context').loseContext(),
      __posters: () => renderPosters().then((d) => JSON.stringify(d)),
    });
  }

  return { dispose, renderPosters, tier };
}
