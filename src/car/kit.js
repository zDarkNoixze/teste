import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* Small modelling kit shared by the procedural parts. All positions are in car space:
 * front = -Z, right = +X, up = +Y, ground at y = 0. */

export const V = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(...a));
export const AX = { x: [0, 0, Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] };

export const rbox = (w, h, d, r = 0.01, s = 2) =>
  new RoundedBoxGeometry(w, h, d, s, Math.max(1e-4, Math.min(r, Math.min(w, h, d) / 2 - 1e-4)));

/** Mesh flagged as procedural so `mergeProcedural` can batch it. */
export function mesh(geo, mat, p = [0, 0, 0], r = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.userData.proc = true;
  return m;
}

export const box = (w, h, d, mat, p, r, rad = 0.008) => mesh(rbox(w, h, d, rad), mat, p, r);

/** Cylinder along `axis` ('x' | 'y' | 'z'). */
export const cyl = (radius, len, mat, p, axis = 'y', seg = 24, r2 = radius, open = false) =>
  mesh(new THREE.CylinderGeometry(radius, r2, len, seg, 1, open), mat, p, AX[axis]);

export const sphere = (r, mat, p, seg = 16) => mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), mat, p);

/** Orients a mesh's +Y along `dir`. */
export function alignY(m, dir) {
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(dir).normalize());
  return m;
}

export function tube(points, radius, mat, { seg, radial = 10, closed = false, tension } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(V), closed, tension ? 'catmullrom' : 'centripetal', tension);
  const segments = seg ?? Math.max(12, Math.round(curve.getLength() * 70));
  return mesh(new THREE.TubeGeometry(curve, segments, radius, radial, closed), mat);
}

export class Helix extends THREE.Curve {
  constructor(radius, height, turns) {
    super();
    Object.assign(this, { radius, height, turns });
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, t * this.height - this.height / 2, Math.sin(a) * this.radius);
  }
}

/** Corrugated bellows (CV / steering boots) along +Y, centred at origin. */
export function bellows(r0, r1, len, folds, mat) {
  const pts = [];
  const n = folds * 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = THREE.MathUtils.lerp(r0, r1, t) * (i % 2 ? 0.82 : 1);
    pts.push(new THREE.Vector2(r, t * len - len / 2));
  }
  return mesh(new THREE.LatheGeometry(pts, 20), mat);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

export const WIRE_COLORS = [0xc81e1e, 0x111111, 0xf2c200, 0x1f5fd1, 0x1e9a46, 0xeeeeee, 0x7a4a22, 0xf07d14, 0x8a3ec8, 0x8c8c8c];
const wireMats = new Map();
export function wireMat(hex) {
  if (!wireMats.has(hex)) wireMats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.42, metalness: 0.05 }));
  return wireMats.get(hex);
}

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

/**
 * A bundle of individually coloured wires following `points`, twisted around each other,
 * wrapped with tape every `tape` metres and ending in plugs.
 */
export function harness(points, { n = 7, r = 0.0024, colors, tape = 0.09, plugs = true, tapeMat, plugMat } = {}) {
  const base = new THREE.CatmullRomCurve3(points.map(V), false, 'centripetal');
  const len = base.getLength();
  const segs = Math.max(20, Math.round(len * 80));
  const { normals, binormals, tangents } = base.computeFrenetFrames(segs, false);
  const spread = n > 1 ? (r * 1.08) / Math.sin(Math.PI / n) : 0;
  const twist = len * 4 * Math.PI;
  const palette = colors ?? WIRE_COLORS;
  const out = [];
  const pts = [];
  for (let i = 0; i <= segs; i++) pts.push(base.getPointAt(i / segs));

  for (let w = 0; w < n; w++) {
    const a0 = (w / n) * Math.PI * 2;
    const wp = pts.map((p, i) => {
      const a = a0 + (i / segs) * twist;
      return p.clone().addScaledVector(normals[i], Math.cos(a) * spread).addScaledVector(binormals[i], Math.sin(a) * spread);
    });
    const c = new THREE.CatmullRomCurve3(wp);
    out.push(mesh(new THREE.TubeGeometry(c, segs, r, 5), wireMat(palette[(w + Math.floor(rand() * 3)) % palette.length])));
  }
  const outer = spread + r * 1.6;
  if (tapeMat) {
    for (let d = tape * 0.5; d < len - tape * 0.3; d += tape) {
      const u = d / len;
      const i = Math.round(u * segs);
      const m = mesh(new THREE.CylinderGeometry(outer, outer, 0.016, 10, 1, true), tapeMat, base.getPointAt(u).toArray());
      alignY(m, tangents[i]);
      out.push(m);
    }
  }
  if (plugs && plugMat) {
    for (const [u, i] of [[0, 0], [1, segs]]) {
      const m = mesh(rbox(outer * 2.6, 0.028, outer * 2.6, 0.003), plugMat, base.getPointAt(u).toArray());
      alignY(m, tangents[i]);
      out.push(m);
    }
  }
  return out;
}

/** Flat strap (seat belts) following `points`, facing roughly along `face`. */
export function ribbon(points, width, mat, face = [0, 0, -1]) {
  const curve = new THREE.CatmullRomCurve3(points.map(V), false, 'centripetal');
  const n = Math.max(12, Math.round(curve.getLength() * 60));
  const f = V(face).normalize();
  const pos = [];
  const idx = [];
  const side = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n);
    const t = curve.getTangentAt(i / n);
    side.crossVectors(t, f).normalize().multiplyScalar(width / 2);
    pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return mesh(g, mat);
}

/* ------------------------------------------------------------------ */
/* Audio hardware                                                      */
/* ------------------------------------------------------------------ */

/** Loudspeaker driver facing +Z (cone opening towards +Z), front plane at z = 0. */
export function speaker(diameter, M, { depth = diameter * 0.45, grille = false } = {}) {
  const R = diameter / 2;
  const g = new THREE.Group();
  const cone = [];
  const cd = depth * 0.55;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    cone.push(new THREE.Vector2(R * 0.24 + (R * 0.8 - R * 0.24) * t, -cd * Math.pow(1 - t, 1.5)));
  }
  g.add(mesh(new THREE.LatheGeometry(cone, 40).rotateX(Math.PI / 2), M.cone));
  g.add(mesh(new THREE.TorusGeometry(R * 0.86, R * 0.065, 8, 48), M.rubber));
  g.add(mesh(new THREE.TorusGeometry(R * 0.97, R * 0.035, 6, 48), M.cast));
  const cap = new THREE.SphereGeometry(R * 0.26, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  cap.scale(1, 1, 0.45);
  g.add(mesh(cap, M.carbon, [0, 0, -cd]));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const s = mesh(rbox(0.012, R * 0.12, depth * 0.95, 0.003), M.cast, [Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, -depth * 0.5]);
    s.rotation.z = a + Math.PI / 2;
    g.add(s);
  }
  g.add(cyl(R * 0.42, depth * 0.28, M.magnet, [0, 0, -depth * 0.86], 'z', 32));
  g.add(cyl(R * 0.46, 0.006, M.steel, [0, 0, -depth * 0.7], 'z', 32));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    g.add(cyl(0.004, 0.006, M.steel, [Math.cos(a) * R * 1.03, Math.sin(a) * R * 1.03, 0.002], 'z', 8));
  }
  if (grille) g.add(mesh(new THREE.CircleGeometry(R * 1.02, 40), M.grille, [0, 0, 0.012]));
  return g;
}

export function tweeter(diameter, M) {
  const R = diameter / 2;
  const g = new THREE.Group();
  g.add(cyl(R * 1.25, R * 0.9, M.cast, [0, 0, -R * 0.45], 'z', 32));
  g.add(mesh(new THREE.TorusGeometry(R * 1.2, R * 0.12, 8, 32), M.alu));
  const dome = new THREE.SphereGeometry(R * 0.75, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  dome.scale(1, 1, 0.6);
  g.add(mesh(dome, M.silk));
  return g;
}

/* ------------------------------------------------------------------ */
/* Batching                                                            */
/* ------------------------------------------------------------------ */

/** Merges all procedural meshes of a part into one mesh per material (fewer draw calls). */
export function mergeProcedural(part) {
  part.updateMatrixWorld(true);
  const inv = part.matrixWorld.clone().invert();
  const byMat = new Map();
  const remove = [];
  const rel = new THREE.Matrix4();
  part.traverse((o) => {
    if (!o.isMesh || !o.userData.proc) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo);
    remove.push(o);
  });
  for (const o of remove) o.removeFromParent();
  // Drop now-empty helper groups.
  [...part.children].forEach((c) => {
    if (!c.isMesh && c.children.length === 0 && !c.userData.keep) c.removeFromParent();
  });
  for (const [mat, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    part.add(new THREE.Mesh(merged, mat));
  }
}

/** 2D convex hull (monotone chain) of [x, y] points. */
export function hull2(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
