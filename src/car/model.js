import * as THREE from 'three';
import { S } from './timeline.js';

/*
 * The Ferrari body ships as a handful of large meshes. We split every mesh into connected
 * components and regroup those by position (`classify`) into real panels and trims.
 */

export const DOOR_PIVOT = (s) => [s * 0.92, 0.6, -0.68];
export const DOOR_MOVE = (s) =>
  s < 0
    ? { r: S(2, 0, 0.7), o: [-1.35, 0.25, -0.35], rot: [0, -0.95, 0] }
    : { r: S(2, 0.12, 0.82), o: [1.35, 0.25, -0.35], rot: [0, 0.95, 0] };

const side = (s) => (s < 0 ? 'esquerdo' : 'direito');
const sideF = (s) => (s < 0 ? 'esquerda' : 'direita');

/** id -> [label, category, pivot, moves, options] */
export function modelParts() {
  const P = {
    hood: ['Capô dianteiro', 'Carroceria', [0, 0.82, -0.9], [{ r: S(1, 0, 0.7), o: [0, 1.25, -0.9], rot: [0.75, 0, 0] }],
      { info: 'Alumínio estampado · abre o porta-malas dianteiro (230 L)' }],
    engineCover: ['Tampa do motor', 'Carroceria', [0, 0.98, 1.25], [{ r: S(1, 0.15, 0.9), o: [0, 1.35, 1.0], rot: [-0.7, 0, 0] }],
      { info: 'Aletas de ventilação extraem o calor do V8' }],
    roof: ['Para-brisa e arcos de proteção', 'Carroceria', [0, 1.1, 0.1], [{ r: S(3, 0, 0.5), o: [0, 1.9, 0] }],
      { info: 'Vidro laminado acústico e arcos de capotamento' }],
    wipers: ['Limpadores do para-brisa', 'Carroceria', [0, 0.8, -1.1], [{ r: S(3, 0, 0.4), o: [0, 1.35, -0.7], rot: [0.3, 0, 0] }]],
    bumperF: ['Para-choque e splitter dianteiro', 'Carroceria', [0, 0.45, -1.8], [{ r: S(3, 0.3, 0.85), o: [0, 0, -1.5] }]],
    bumperR: ['Para-choque traseiro e difusor', 'Carroceria', [0, 0.55, 2.0], [{ r: S(3, 0.3, 0.85), o: [0, 0, 1.5] }]],
    dash: ['Painel em couro', 'Interior', [0, 0.8, -0.7], [{ r: S(6, 0, 0.55), o: [0, 1.05, -0.6] }],
      { info: 'Couro costurado à mão em Maranello' }],
    cluster: ['Quadro de instrumentos', 'Interior', [-0.35, 0.84, -0.62], [{ r: S(6, 0.05, 0.6), o: [-0.35, 1.45, -0.4] }],
      { info: 'Conta-giros analógico central + 2 telas TFT' }],
    console: ['Console central em carbono', 'Interior', [0, 0.4, -0.2], [{ r: S(6, 0.15, 0.7), o: [0, 0.85, 0.05] }],
      { info: 'Botões de marcha (R · Auto · Launch)' }],
    carpet: ['Carpete do assoalho', 'Interior', [0, 0.3, -0.3], [{ r: S(6, 0.55, 1), o: [0, 0.75, -0.2] }]],
    bulkhead: ['Divisória traseira da cabine', 'Interior', [0, 0.7, 0.45], [{ r: S(6, 0.25, 0.8), o: [0, 1.5, 0.55] }],
      { info: 'Isola a cabine do calor e do ruído do motor' }],
    exhaustTips: ['Ponteiras de escape triplas', 'Escape', [0, 0.41, 2.2], [{ r: S(8, 0, 0.6), o: [0, 0.1, 1.3] }]],
    chassis: ['Chassi spaceframe em alumínio', 'Estrutura', [0, 0.5, 0], [], { info: '1.430 kg no total — o chassi responde por 270 kg' }],
  };
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const door = DOOR_MOVE(s);
    P[`door-${k}`] = [`Porta ${sideF(s)}`, 'Carroceria', DOOR_PIVOT(s), [door], { info: 'Painel externo em alumínio' }];
    P[`doorcard-${k}`] = [`Forro da porta ${sideF(s)}`, 'Interior', DOOR_PIVOT(s), [door, { r: S(2, 0.5, 1), o: [-s * 0.5, 0.05, 0.05] }], { count: 1 }];
    P[`mirror-${k}`] = [`Retrovisor ${side(s)}`, 'Carroceria', DOOR_PIVOT(s), [door, { r: S(2, 0.45, 0.95), o: [s * 0.3, 0.45, 0.1] }],
      { count: 1, info: 'Aquecido, com rebatimento elétrico' }];
    P[`fender-${k}`] = [`Para-lama dianteiro ${side(s)}`, 'Carroceria', [s * 0.87, 0.55, -1.1], [{ r: S(3, 0.1, 0.6), o: [s * 1.25, 0.2, -0.35] }]];
    P[`quarter-${k}`] = [`Painel lateral traseiro ${side(s)}`, 'Carroceria', [s * 0.75, 0.7, 1.2], [{ r: S(3, 0.2, 0.75), o: [s * 1.35, 0.35, 0.45] }]];
    P[`lightF-${k}`] = [`Farol full-LED ${side(s)}`, 'Iluminação', [s * 0.72, 0.66, -1.75], [{ r: S(3, 0.4, 0.95), o: [s * 0.45, 0.35, -2.2] }],
      { info: 'Bi-xenon adaptativo com DRL de LED' }];
    P[`lightR-${k}`] = [`Lanterna traseira ${sideF(s)}`, 'Iluminação', [s * 0.77, 0.87, 1.95], [{ r: S(3, 0.4, 0.95), o: [s * 0.4, 0.45, 2.2] }]];
    P[`seat-${k}`] = [`Encosto do banco ${s < 0 ? 'do motorista' : 'do passageiro'}`, 'Interior', [s * 0.35, 0.75, 0.15],
      [{ r: S(6, 0.25, 0.8), o: [s * 0.85, 1.0, 0.2] }], { info: 'Concha em fibra de carbono revestida em couro' }];
    P[`seatBase-${k}`] = [`Assento do banco ${s < 0 ? 'do motorista' : 'do passageiro'}`, 'Interior', [s * 0.35, 0.32, -0.15],
      [{ r: S(6, 0.35, 0.9), o: [s * 0.75, 0.6, -0.15] }]];
  }
  return P;
}

const has = (b, x0, x1, y0, y1, z0, z1) =>
  b.min.x >= x0 && b.max.x <= x1 && b.min.y >= y0 && b.max.y <= y1 && b.min.z >= z0 && b.max.z <= z1;

/** Assigns a connected component (bounding box in car space) of mesh `name` to a part id. */
export function classify(name, b) {
  const c = b.getCenter(new THREE.Vector3());
  const s = b.getSize(new THREE.Vector3());
  const k = c.x < 0 ? 'L' : 'R';
  const ax = Math.abs(c.x);

  if (name === 'wipers') return 'wipers';
  if (name === 'carpet') return 'carpet';

  // Lamp clusters straddle several source meshes.
  if (ax > 0.55 && has(b, -0.9, 0.9, 0.48, 0.84, -2.12, -1.4)) return `lightF-${k}`;
  if (ax > 0.55 && has(b, -0.92, 0.92, 0.76, 0.98, 1.78, 2.12)) return `lightR-${k}`;
  if (name !== 'body' && ax < 0.3 && c.z > 1.95 && c.y < 0.52 && s.x < 0.45) return 'exhaustTips';

  if (name === 'body') {
    if (c.z < -1.2 && c.y < 0.6) return 'bumperF';
    if (c.z < -0.8 && c.y > 0.6 && s.x > 1.4) return 'hood';
    if (c.z > 1.6 && c.y < 0.75) return 'bumperR';
    if (c.z > 1.2 && c.y > 0.85 && s.x > 1) return 'engineCover';
    if (c.y > 0.95 && s.x > 1) return 'roof';
    if (ax > 0.85 && c.y > 0.7 && c.z > -0.7 && c.z < -0.3 && s.z < 0.4) return `mirror-${k}`;
    if (ax > 0.75 && c.z > -0.4 && c.z < 0.1 && s.z > 1 && s.z < 1.4) return `door-${k}`;
    if (ax > 0.75 && c.z < -0.85 && c.z > -1.3 && s.z < 1) return `fender-${k}`;
    if (ax > 0.5 && c.z > 0.3 && c.y > 0.45 && s.x < 0.6) return `quarter-${k}`;
    return 'chassis';
  }

  if (c.z < -1.5 && c.y < 0.45 && s.x > 0.4) return 'bumperF';
  if (c.z > 1.6 && c.y < 0.62 && s.x > 0.9) return 'bumperR';
  if (name === 'grills' && c.z > 1.9) return 'bumperR';
  if (c.z > 1.2 && c.y > 0.86 && ax < 0.9) return 'engineCover';
  if (name === 'glass' && (c.y > 0.95 || s.x > 1.2)) return 'roof';
  if (c.y > 1.0 && c.z > -0.45) return 'roof';
  if (name === 'interior_light' && c.z > 0.3 && c.z < 0.6 && s.x > 1.2 && c.y > 0.5) return 'bulkhead';
  if (ax > 0.88 && c.z > -0.7 && c.z < -0.3 && c.y > 0.7) return `mirror-${k}`;
  if (ax > 0.88 && c.z < -0.7 && c.z > -1.3) return `fender-${k}`;
  if (ax > 0.85 && c.z > 0.3 && c.z < 1.3 && c.y > 0.3) return `quarter-${k}`;
  if (ax > 0.6 && ax < 0.88 && c.y > 0.36 && c.z > -0.75 && c.z < 0.5 && s.z < 1.4 && s.x < 0.25) return `doorcard-${k}`;
  if (ax > 0.06 && ax < 0.66 && s.x < 0.6 && c.z > -0.45 && c.z < 0.36 && c.y > 0.2 && c.y < 0.95) {
    return c.y < 0.45 && s.y < 0.32 ? `seatBase-${k}` : `seat-${k}`;
  }
  if (ax < 0.12 && s.x < 0.4 && c.z > -0.8 && c.z < 0.4 && c.y < 0.7) return 'console';
  if (c.x < -0.1 && c.x > -0.6 && c.y > 0.72 && c.z > -0.8 && c.z < -0.45 && s.x < 0.5) return 'cluster';
  if (c.z > -1.15 && c.z < -0.3 && c.y > 0.45 && c.y < 1.0) return 'dash';
  return 'chassis';
}

/**
 * Splits a (car-space) indexed geometry into connected components grouped by `classify`.
 * Sub-geometries share the original vertex attributes so the GPU uploads them once.
 */
export function splitByComponents(geo, name) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const index = geo.index ? geo.index.array : Uint32Array.from({ length: n }, (_, i) => i);
  const weld = new Int32Array(n);
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let w = seen.get(key);
    if (w === undefined) seen.set(key, (w = i));
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

// The source materials are light grey placeholders; retune them to a black-and-red cabin.
export const RETUNE = {
  Interior_light: { color: 0x26272b, roughness: 0.7, metalness: 0 },
  Interior_dark: { color: 0x121316, roughness: 0.6, metalness: 0 },
  Leather: { color: 0x1b1b1d, roughness: 0.55, metalness: 0 },
  Carpet: { color: 0x0f1012, roughness: 0.95, metalness: 0 },
  plastic_gray: { color: 0x2e3034, roughness: 0.5 },
  Tires: { color: 0x151617, roughness: 0.85, metalness: 0 },
};
