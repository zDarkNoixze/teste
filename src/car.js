import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/*
 * Car space (same as the glTF): front = -Z, right = +X, up = +Y, ground at y = 0.
 * The Ferrari body ships as a handful of meshes; we split them into connected components
 * and regroup those by position into real panels (hood, doors, fenders...).
 */

export const SECTIONS = 7;

/** Progress window belonging to chapter i (1-based), optionally a sub-range a..b of it. */
export function S(i, a = 0, b = 1) {
  const start = (i - 1) / SECTIONS + 0.01;
  const end = i / SECTIONS - 0.02;
  return [start + (end - start) * a, start + (end - start) * b];
}

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function createMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: 0xa30d14, metalness: 0.75, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 1, thickness: 0.02, envMapIntensity: 0.35,
    }),
    rim: std({ color: 0xc9ccd1, metalness: 1, roughness: 0.28 }),
    alu: std({ color: 0x9a9ea5, metalness: 1, roughness: 0.45 }),
    cast: std({ color: 0x2b2d31, metalness: 0.75, roughness: 0.55 }),
    steel: std({ color: 0x5c6068, metalness: 1, roughness: 0.38 }),
    titanium: std({ color: 0xb7a58a, metalness: 1, roughness: 0.3 }),
    rosso: new THREE.MeshPhysicalMaterial({ color: 0xb10f16, metalness: 0.2, roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.35 }),
    carbon: std({ color: 0x15161a, metalness: 0.4, roughness: 0.32 }),
    rubber: std({ color: 0x0e0f10, roughness: 0.85 }),
    spring: std({ color: 0xf2b705, metalness: 0.4, roughness: 0.35 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: 0xf2b705, metalness: 0.1, roughness: 0.35, clearcoat: 1 }),
    disc: std({ color: 0x3b3c40, metalness: 0.5, roughness: 0.55 }),
  };
}

/* ------------------------------------------------------------------ */
/* Part catalogue                                                      */
/* ------------------------------------------------------------------ */

// Each move: { r: [p0, p1], o: offset, rot: euler delta }, applied cumulatively.
const PARTS = {
  hood: ['Capô dianteiro', 'Carroceria', [0, 0.82, -0.9], [{ r: S(1, 0, 0.8), o: [0, 1.25, -0.9], rot: [0.75, 0, 0] }]],
  engineCover: ['Tampa do motor', 'Carroceria', [0, 0.98, 1.25], [{ r: S(1, 0.15, 1), o: [0, 1.35, 1.0], rot: [-0.7, 0, 0] }]],
  'door-L': ['Porta esquerda', 'Carroceria', [-0.92, 0.6, -0.68], [{ r: S(2, 0, 0.8), o: [-1.35, 0.25, -0.35], rot: [0, -0.95, 0] }]],
  'door-R': ['Porta direita', 'Carroceria', [0.92, 0.6, -0.68], [{ r: S(2, 0.15, 0.95), o: [1.35, 0.25, -0.35], rot: [0, 0.95, 0] }]],
  roof: ['Para-brisa e arcos de proteção', 'Carroceria', [0, 1.1, 0.1], [{ r: S(3, 0, 0.55), o: [0, 1.9, 0] }]],
  'fender-L': ['Para-lama dianteiro esquerdo', 'Carroceria', [-0.87, 0.55, -1.1], [{ r: S(3, 0.1, 0.65), o: [-1.25, 0.2, -0.35] }]],
  'fender-R': ['Para-lama dianteiro direito', 'Carroceria', [0.87, 0.55, -1.1], [{ r: S(3, 0.1, 0.65), o: [1.25, 0.2, -0.35] }]],
  'quarter-L': ['Painel lateral traseiro esquerdo', 'Carroceria', [-0.75, 0.7, 1.2], [{ r: S(3, 0.2, 0.8), o: [-1.35, 0.35, 0.45] }]],
  'quarter-R': ['Painel lateral traseiro direito', 'Carroceria', [0.75, 0.7, 1.2], [{ r: S(3, 0.2, 0.8), o: [1.35, 0.35, 0.45] }]],
  bumperF: ['Para-choque e splitter dianteiro', 'Carroceria', [0, 0.45, -1.8], [{ r: S(3, 0.3, 0.9), o: [0, 0, -1.5] }]],
  bumperR: ['Para-choque traseiro e difusor', 'Carroceria', [0, 0.55, 2.0], [{ r: S(3, 0.3, 0.9), o: [0, 0, 1.5] }]],
  lightsF: ['Faróis full-LED', 'Iluminação', [0, 0.66, -1.75], [{ r: S(3, 0.4, 1), o: [0, 0.35, -2.3] }]],
  lightsR: ['Lanternas traseiras', 'Iluminação', [0, 0.87, 1.95], [{ r: S(3, 0.4, 1), o: [0, 0.45, 2.3] }]],
  dash: ['Painel de instrumentos', 'Interior', [0, 0.8, -0.7], [{ r: S(6, 0, 0.6), o: [0, 1.05, -0.55] }]],
  console: ['Console central em carbono', 'Interior', [0, 0.4, -0.2], [{ r: S(6, 0.15, 0.75), o: [0, 0.85, 0.05] }]],
  'seat-L': ['Banco concha do motorista', 'Interior', [-0.35, 0.6, 0.1], [{ r: S(6, 0.25, 0.85), o: [-0.85, 0.95, 0.15] }]],
  'seat-R': ['Banco concha do passageiro', 'Interior', [0.35, 0.6, 0.1], [{ r: S(6, 0.3, 0.9), o: [0.85, 0.95, 0.15] }]],
  steering: ['Volante com manettino', 'Interior', [-0.35, 0.8, -0.35], [{ r: S(6, 0.1, 0.7), o: [-0.1, 1.35, -0.35], rot: [0.4, 0, 0] }]],
  exhaust: ['Ponteiras de escape triplas', 'Escape', [0, 0.41, 2.2], [{ r: S(7, 0, 0.7), o: [0, -0.05, 1.2] }]],
  chassis: ['Chassi spaceframe em alumínio', 'Estrutura', [0, 0.5, 0], []],
};

const has = (b, x0, x1, y0, y1, z0, z1) =>
  b.min.x >= x0 && b.max.x <= x1 && b.min.y >= y0 && b.max.y <= y1 && b.min.z >= z0 && b.max.z <= z1;

/** Assigns a connected component (bounding box in car space) to a part id. */
function classify(name, b) {
  const c = b.getCenter(new THREE.Vector3());
  const s = b.getSize(new THREE.Vector3());
  const side = c.x < 0 ? 'L' : 'R';
  const ax = Math.abs(c.x);

  if (name === 'wipers') return 'roof';

  // Lamp clusters first: they straddle several source meshes.
  if (ax > 0.55 && has(b, -0.9, 0.9, 0.48, 0.84, -2.12, -1.4)) return 'lightsF';
  if (ax > 0.55 && has(b, -0.92, 0.92, 0.76, 0.98, 1.78, 2.12)) return 'lightsR';
  if (name !== 'body' && ax < 0.3 && c.z > 1.95 && c.y < 0.52 && s.x < 0.45) return 'exhaust';

  if (name === 'body') {
    if (c.z < -1.2 && c.y < 0.6) return 'bumperF';
    if (c.z < -0.8 && c.y > 0.6 && s.x > 1.4) return 'hood';
    if (c.z > 1.6 && c.y < 0.75) return 'bumperR';
    if (c.z > 1.2 && c.y > 0.85 && s.x > 1) return 'engineCover';
    if (c.y > 0.95 && s.x > 1) return 'roof';
    if (ax > 0.85 && c.y > 0.7 && c.z > -0.7 && c.z < -0.3 && s.z < 0.4) return `door-${side}`; // mirrors
    if (ax > 0.75 && c.z > -0.4 && c.z < 0.1 && s.z > 1 && s.z < 1.4) return `door-${side}`;
    if (ax > 0.75 && c.z < -0.85 && c.z > -1.3 && s.z < 1) return `fender-${side}`;
    if (ax > 0.5 && c.z > 0.3 && c.y > 0.45 && s.x < 0.6) return `quarter-${side}`;
    return 'chassis';
  }

  // Everything else (interior, trim, lamps, glass...)
  if (c.z < -1.5 && c.y < 0.45 && s.x > 0.4) return 'bumperF';
  if (c.z > 1.6 && c.y < 0.62 && s.x > 0.9) return 'bumperR';
  if (name === 'grills' && c.z > 1.9) return 'bumperR';
  if (c.z > 1.2 && c.y > 0.86 && ax < 0.9) return 'engineCover';
  if (name === 'glass' && (c.y > 0.95 || s.x > 1.2)) return 'roof';
  if (c.y > 1.0 && c.z > -0.45) return 'roof';
  if (ax > 0.88 && c.z > -0.7 && c.z < -0.3 && c.y > 0.7) return `door-${side}`; // mirror stalks/glass
  if (ax > 0.88 && c.z < -0.7 && c.z > -1.3) return `fender-${side}`; // side repeaters
  if (ax > 0.85 && c.z > 0.3 && c.z < 1.3 && c.y > 0.3) return `quarter-${side}`;
  if (ax > 0.6 && ax < 0.88 && c.y > 0.36 && c.z > -0.75 && c.z < 0.5 && s.z < 1.4 && s.x < 0.25) return `door-${side}`;
  if (ax > 0.06 && ax < 0.66 && s.x < 0.6 && c.z > -0.45 && c.z < 0.36 && c.y > 0.2 && c.y < 0.95) return `seat-${side}`;
  if (ax < 0.12 && s.x < 0.4 && c.z > -0.8 && c.z < 0.4 && c.y < 0.7) return 'console';
  if (c.z > -1.15 && c.z < -0.3 && c.y > 0.45 && c.y < 1.0) return 'dash';
  return 'chassis';
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Splits a (world-baked) indexed geometry into connected components and groups their
 * triangles by `classify`. Sub-geometries share the original vertex attributes, so the
 * GPU only uploads the vertex data once.
 */
function splitByComponents(geo, name) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const index = geo.index ? geo.index.array : Uint32Array.from({ length: n }, (_, i) => i);
  const weld = new Int32Array(n);
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let w = seen.get(k);
    if (w === undefined) seen.set(k, (w = i));
    weld[i] = w;
  }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const triCount = index.length / 3;
  for (let t = 0; t < triCount; t++) {
    const a = find(weld[index[t * 3]]), b = find(weld[index[t * 3 + 1]]), c = find(weld[index[t * 3 + 2]]);
    parent[a] = c;
    parent[b] = c;
  }
  const comps = new Map();
  const v = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const root = find(weld[index[t * 3]]);
    let comp = comps.get(root);
    if (!comp) comps.set(root, (comp = { tris: [], box: new THREE.Box3() }));
    comp.tris.push(t);
    for (let k = 0; k < 3; k++) comp.box.expandByPoint(v.fromBufferAttribute(pos, index[t * 3 + k]));
  }
  const buckets = new Map();
  for (const comp of comps.values()) {
    const id = classify(name, comp.box);
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(comp.tris);
  }
  const out = new Map();
  for (const [id, lists] of buckets) {
    const tris = lists.flat();
    const idx = new Uint32Array(tris.length * 3);
    tris.forEach((t, i) => idx.set(index.subarray(t * 3, t * 3 + 3), i * 3));
    const g = new THREE.BufferGeometry();
    for (const key of Object.keys(geo.attributes)) g.setAttribute(key, geo.attributes[key]);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    out.set(id, g);
  }
  return out;
}

const rbox = (w, h, d, r = 0.02, s = 3) =>
  new RoundedBoxGeometry(w, h, d, s, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));

function mesh(geo, mat, p = [0, 0, 0], r = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const tube = (pts, radius, mat, seg = 64) =>
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, radius, 12), mat);

class Helix extends THREE.Curve {
  constructor(radius, height, turns) {
    super();
    Object.assign(this, { radius, height, turns });
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, t * this.height - this.height / 2, Math.sin(a) * this.radius);
  }
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

export async function loadCar(M, onProgress) {
  const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/ferrari.glb`, (e) => {
    if (e.total) onProgress?.(e.loaded / e.total);
  });
  draco.dispose();
  const src = gltf.scene;
  src.updateMatrixWorld(true);

  // The source materials are light grey placeholders; retune them to a black-and-red cabin.
  const RETUNE = {
    Interior_light: { color: 0x26272b, roughness: 0.7, metalness: 0 },
    Interior_dark: { color: 0x121316, roughness: 0.6, metalness: 0 },
    Leather: { color: 0x1b1b1d, roughness: 0.55, metalness: 0 },
    Carpet: { color: 0x0f1012, roughness: 0.95, metalness: 0 },
    plastic_gray: { color: 0x2e3034, roughness: 0.5 },
    Tires: { color: 0x151617, roughness: 0.85, metalness: 0 },
  };
  src.traverse((o) => {
    const r = o.isMesh && RETUNE[o.material.name];
    if (r) {
      o.material.color.set(r.color);
      if (r.roughness !== undefined) o.material.roughness = r.roughness;
      if (r.metalness !== undefined) o.material.metalness = r.metalness;
    }
  });

  const group = new THREE.Group();
  const parts = [];
  const meshes = [];
  const spinners = [];
  const byId = {};

  function makePart(label, cat, at, moves) {
    const g = new THREE.Group();
    g.position.set(...at);
    g.userData = {
      label,
      cat,
      base: g.position.clone(),
      baseRot: g.rotation.clone(),
      moves: moves.map((m) => ({
        r: m.r,
        o: new THREE.Vector3(...(m.o || [0, 0, 0])),
        rot: new THREE.Vector3(...(m.rot || [0, 0, 0])),
      })),
    };
    group.add(g);
    parts.push(g);
    return g;
  }
  /** Adds objects whose geometry/transform is in car space to a part. */
  function addTo(part, ...objs) {
    for (const o of objs) {
      o.position.sub(part.userData.base);
      part.add(o);
    }
  }
  /** Procedural part: children are positioned in car space. */
  function P(label, cat, at, moves, children) {
    const g = makePart(label, cat, at, moves);
    addTo(g, ...children);
    return g;
  }

  for (const [id, [label, cat, at, moves]] of Object.entries(PARTS)) byId[id] = makePart(label, cat, at, moves);

  /* Wheels, discs and the steering wheel come as their own nodes. */
  const wheelNodes = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => src.getObjectByName(n));
  const steeringNode = src.getObjectByName('steering_wheel');
  const keepNodes = new Set([...wheelNodes, steeringNode]);

  /* Body & interior: bake to car space, split, regroup. */
  const sources = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    let p = o;
    while (p && !keepNodes.has(p)) p = p.parent;
    if (!p) sources.push(o);
  });
  for (const o of sources) {
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    let mat = o.material;
    if (o.name === 'body') mat = M.paint;
    if (o.name === 'glass') mat = M.glass;
    for (const [id, g] of splitByComponents(geo, o.name)) {
      const m = new THREE.Mesh(g, mat);
      m.name = `${o.name}:${id}`;
      m.castShadow = !mat.transmission;
      m.receiveShadow = true;
      addTo(byId[id], m);
    }
    o.geometry.dispose();
  }

  const steering = byId.steering;
  steering.attach(steeringNode);

  /* Wheels + brakes */
  for (const node of wheelNodes) {
    const wp = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    const s = Math.sign(wp.x);
    const front = wp.z < 0;
    const where = `${front ? 'dianteira' : 'traseira'} ${s < 0 ? 'esquerda' : 'direita'}`;
    const delay = front ? 0 : 0.1;

    const disc = node.children.find((c) => c.name.startsWith('brake'));
    node.children.forEach((c) => {
      if (c.name.startsWith('rim')) c.material = M.rim;
    });

    const wheel = makePart(`Roda forjada 20" ${where}`, 'Rodas', wp.toArray(), [
      { r: S(4, delay, 0.7 + delay), o: [s * 1.55, 0, 0] },
    ]);
    wheel.attach(node);
    node.userData.spinBase = node.rotation.x;
    spinners.push(node);

    const brake = makePart(`Freio carbono-cerâmico ${where}`, 'Freios', wp.toArray(), [
      { r: S(4, 0.2 + delay, 0.85), o: [s * 0.8, 0, 0] },
    ]);
    brake.attach(disc);
    disc.material = M.disc;
    // Caliper: the model has none, so we add a 6-piston monobloc one.
    const cx = wp.x - s * 0.02;
    const cal = new THREE.Group();
    cal.position.set(cx, wp.y, wp.z);
    cal.rotation.x = front ? -0.55 : 0.55;
    cal.add(mesh(rbox(0.07, 0.07, 0.2, 0.025), M.caliper, [0, 0.17, 0]));
    cal.add(mesh(rbox(0.03, 0.03, 0.06, 0.01), M.cast, [s * 0.036, 0.17, 0]));
    addTo(brake, cal);

    // Double-wishbone + coilover
    const inner = s * 0.42;
    P(`Suspensão double-wishbone ${where}`, 'Suspensão', [s * 0.6, 0.45, wp.z], [{ r: S(4, 0.35, 1), o: [s * 0.55, 0.85, 0] }], [
      mesh(new THREE.TubeGeometry(new Helix(0.055, 0.26, 7), 300, 0.011, 8), M.spring, [s * 0.58, 0.58, wp.z], [0, 0, -s * 0.35]),
      mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 16), M.steel, [s * 0.58, 0.58, wp.z], [0, 0, -s * 0.35]),
      mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.12, 16), M.alu, [s * 0.52, 0.74, wp.z], [0, 0, -s * 0.35]),
      tube([[inner, 0.24, wp.z - 0.16], [s * 0.66, 0.22, wp.z], [inner, 0.24, wp.z + 0.16]], 0.014, M.cast, 24),
      tube([[inner, 0.52, wp.z - 0.13], [s * 0.64, 0.54, wp.z], [inner, 0.52, wp.z + 0.13]], 0.012, M.cast, 24),
      mesh(rbox(0.05, 0.36, 0.08, 0.02), M.alu, [s * 0.69, 0.38, wp.z]),
    ]);
  }

  /* Rear contact shadow baked for this model (fades as the car comes apart). */
  const aoTex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}models/ferrari_ao.png`);
  aoTex.colorSpace = THREE.SRGBColorSpace;
  const ao = new THREE.Mesh(
    new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4),
    new THREE.MeshBasicMaterial({
      map: aoTex, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true, premultipliedAlpha: true, depthWrite: false,
    }),
  );
  ao.rotation.x = -Math.PI / 2;
  ao.position.y = 0.003;
  ao.renderOrder = 2;
  group.add(ao);

  /* ---------------- Mid-mounted V8 (not in the source model) ---------------- */
  const EZ = 1.0; // crank centre
  const EY = 0.42;
  const engineParts = [];
  const E = (...a) => engineParts.push(P(...a));

  E('Bloco V8 4.5 F136', 'Motor', [0, EY, EZ], [{ r: S(5, 0, 0.55), o: [0, 0.3, 0] }], [
    mesh(rbox(0.3, 0.26, 0.66, 0.04), M.alu, [0, EY, EZ]),
    mesh(rbox(0.26, 0.1, 0.6, 0.03), M.cast, [0, EY - 0.16, EZ]),
    ...[-0.24, -0.08, 0.08, 0.24].map((dz) => mesh(rbox(0.32, 0.03, 0.04, 0.01), M.alu, [0, EY - 0.04, EZ + dz])),
    mesh(rbox(0.32, 0.24, 0.05, 0.02), M.alu, [0, EY, EZ - 0.35]),
  ]);
  for (const s of [-1, 1]) {
    const lado = s < 0 ? 'esquerdo' : 'direito';
    const hx = s * 0.17;
    E(`Cabeçote ${lado}`, 'Motor', [hx, EY + 0.17, EZ], [{ r: S(5, 0.1, 0.65), o: [s * 0.45, 0.55, 0] }], [
      mesh(rbox(0.16, 0.12, 0.64, 0.025), M.alu, [hx, EY + 0.17, EZ], [0, 0, -s * 0.5]),
    ]);
    E(`Tampa de válvulas ${lado}`, 'Motor', [s * 0.21, EY + 0.25, EZ], [{ r: S(5, 0.2, 0.75), o: [s * 0.75, 0.85, 0] }], [
      mesh(rbox(0.14, 0.06, 0.62, 0.025), M.rosso, [s * 0.21, EY + 0.25, EZ], [0, 0, -s * 0.5]),
      ...[-0.22, -0.07, 0.07, 0.22].map((dz) =>
        mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 16), M.cast, [s * 0.18, EY + 0.3, EZ + dz], [0, 0, -s * 0.5])),
    ]);
    const headers = [];
    for (let k = 0; k < 4; k++) {
      const z = EZ - 0.24 + k * 0.16;
      headers.push(tube([[s * 0.27, EY + 0.1, z], [s * 0.36, EY + 0.02, z + 0.03], [s * 0.36, EY - 0.1, EZ + 0.4], [s * 0.3, EY - 0.14, EZ + 0.62]], 0.017, M.titanium, 48));
    }
    E(`Coletor de escape ${lado}`, 'Escape', [s * 0.34, EY - 0.05, EZ + 0.2], [{ r: S(5, 0.3, 0.9), o: [s * 0.75, 0.15, 0] }], [
      ...headers,
      mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 24), M.titanium, [s * 0.3, EY - 0.14, EZ + 0.68], [Math.PI / 2, 0, 0]),
    ]);
  }
  E('Plenum de admissão', 'Motor', [0, EY + 0.29, EZ], [{ r: S(5, 0.3, 0.85), o: [0, 1.05, 0] }], [
    mesh(rbox(0.16, 0.08, 0.6, 0.035), M.rosso, [0, EY + 0.29, EZ]),
    ...[-0.21, -0.07, 0.07, 0.21].flatMap((dz) => [-1, 1].map((s) =>
      mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 16), M.alu, [s * 0.1, EY + 0.25, EZ + dz], [0, 0, s * 1.0]))),
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 24), M.alu, [0, EY + 0.29, EZ - 0.35], [Math.PI / 2, 0, 0]),
  ]);
  E('Caixas de ar', 'Motor', [0, EY + 0.36, EZ - 0.1], [{ r: S(5, 0.4, 1), o: [0, 1.35, -0.15] }], [
    mesh(rbox(0.13, 0.07, 0.3, 0.03), M.carbon, [-0.24, EY + 0.37, EZ - 0.1]),
    mesh(rbox(0.13, 0.07, 0.3, 0.03), M.carbon, [0.24, EY + 0.37, EZ - 0.1]),
  ]);
  E('Correias e alternador', 'Motor', [0, EY, EZ - 0.4], [{ r: S(5, 0.15, 0.7), o: [0, 0.35, -0.4] }], [
    mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 32), M.steel, [0, EY - 0.04, EZ - 0.39], [Math.PI / 2, 0, 0]),
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 32), M.steel, [-0.12, EY + 0.1, EZ - 0.39], [Math.PI / 2, 0, 0]),
    mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 24), M.alu, [0.12, EY + 0.1, EZ - 0.42], [Math.PI / 2, 0, 0]),
  ]);
  E('Câmbio dupla embreagem 7 marchas', 'Transmissão', [0, 0.4, 1.55], [{ r: S(5, 0.35, 1), o: [0, 0.5, 0.35] }], [
    mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.36, 32), M.cast, [0, 0.4, 1.52], [Math.PI / 2, 0, 0]),
    mesh(rbox(0.36, 0.2, 0.2, 0.05), M.cast, [0, 0.37, 1.48]),
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 16), M.steel, [0, 0.36, 1.5], [0, 0, Math.PI / 2]),
  ]);

  /* Exhaust: collectors to mufflers to the centre tips. */
  const muffler = [];
  for (const s of [-1, 1]) {
    muffler.push(tube([[s * 0.3, EY - 0.14, EZ + 0.8], [s * 0.3, 0.32, 1.8], [s * 0.2, 0.36, 1.98]], 0.032, M.titanium));
    muffler.push(tube([[s * 0.2, 0.39, 2.06], [s * 0.12, 0.41, 2.14], [s * 0.11, 0.41, 2.2]], 0.026, M.titanium, 24));
  }
  muffler.push(mesh(rbox(0.5, 0.14, 0.16, 0.06), M.titanium, [0, 0.38, 2.02]));
  addTo(byId.exhaust, ...muffler);

  /* Radiators in the front corners (where the 458 keeps them). */
  for (const s of [-1, 1]) {
    P(`Radiador ${s < 0 ? 'esquerdo' : 'direito'}`, 'Arrefecimento', [s * 0.55, 0.38, -1.7], [{ r: S(5, 0, 0.5), o: [s * 0.7, 0.25, -0.5] }], [
      mesh(rbox(0.36, 0.26, 0.04, 0.01), M.steel, [s * 0.55, 0.38, -1.7], [0.35, s * 0.35, 0]),
    ]);
  }

  /* Tag meshes for picking. */
  for (const g of parts) {
    g.traverse((o) => {
      if (o.isMesh) {
        o.userData.part = g;
        o.castShadow = !o.material.transmission;
        o.receiveShadow = true;
        meshes.push(o);
      }
    });
  }

  return { group, parts, meshes, spinners, ao };
}

/** Positions every part for scroll progress p (0..1). Returns how many parts are detached. */
export function applyExplode(parts, p) {
  let loose = 0;
  for (const g of parts) {
    const { base, baseRot, moves } = g.userData;
    g.position.copy(base);
    g.rotation.copy(baseRot);
    let first = 0;
    moves.forEach((m, i) => {
      const t = easeInOut(clamp01((p - m.r[0]) / (m.r[1] - m.r[0])));
      if (i === 0) first = t;
      if (t === 0) return;
      g.position.addScaledVector(m.o, t);
      g.rotation.x += m.rot.x * t;
      g.rotation.y += m.rot.y * t;
      g.rotation.z += m.rot.z * t;
    });
    if (first > 0.5) loose++;
  }
  return loose;
}
