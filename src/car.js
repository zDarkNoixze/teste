import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Number of scroll "chapters" after the hero. Progress i / SECTIONS = top of section i. */
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
      color: 0xb3121d, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x16202b, metalness: 0, roughness: 0.12, transparent: true, opacity: 0.42,
      clearcoat: 0.3, envMapIntensity: 0.5, depthWrite: false,
    }),
    chrome: std({ color: 0xf2f4f7, metalness: 1, roughness: 0.18 }),
    rim: std({ color: 0xa3a9b2, metalness: 1, roughness: 0.22 }),
    metal: std({ color: 0x3a3e45, metalness: 0.8, roughness: 0.42 }),
    engine: std({ color: 0x737882, metalness: 0.85, roughness: 0.3 }),
    rubber: std({ color: 0x121315, roughness: 0.9, side: THREE.DoubleSide }),
    plastic: std({ color: 0x17181b, roughness: 0.55, metalness: 0.1 }),
    leather: std({ color: 0x2a2421, roughness: 0.62 }),
    accent: std({ color: 0xc4161c, metalness: 0.5, roughness: 0.3 }),
    caliper: std({ color: 0xffb400, metalness: 0.3, roughness: 0.35 }),
    disc: std({ color: 0x8d9198, metalness: 0.9, roughness: 0.35 }),
    headlight: std({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 4.5 }),
    taillight: std({ color: 0x220000, emissive: 0xff1430, emissiveIntensity: 4.5 }),
    gauge: std({ color: 0x001018, emissive: 0x2ad4ff, emissiveIntensity: 3 }),
  };
}

const rbox = (w, h, d, r = 0.02, s = 3) =>
  new RoundedBoxGeometry(w, h, d, s, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));

function mesh(geo, mat, p = [0, 0, 0], r = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.castShadow = !mat.transparent;
  m.receiveShadow = true;
  return m;
}

/** Smooth-shaded extrusion (default extrude normals look faceted on curved panels). */
function smoothExtrude(shape, opts) {
  let g = new THREE.ExtrudeGeometry(shape, opts);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

function roundedRect(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

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

const WB = 1.35; // wheel x position
const WY = 0.36; // wheel centre height
const WZ = 0.8; // wheel track (half)

export function buildCar(M) {
  const group = new THREE.Group();
  const parts = [];
  const meshes = [];
  const spinners = [];

  /**
   * A part is a group pivoting at `at`; children are given in car coordinates.
   * Each move = { r: [p0, p1], o: offset, rot: euler delta }, applied cumulatively.
   */
  function P(label, cat, at, moves, children) {
    const g = new THREE.Group();
    g.position.set(...at);
    for (const c of children) {
      c.position.x -= at[0];
      c.position.y -= at[1];
      c.position.z -= at[2];
      g.add(c);
    }
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
    g.traverse((o) => {
      if (o.isMesh) {
        o.userData.part = g;
        meshes.push(o);
      }
    });
    group.add(g);
    parts.push(g);
    return g;
  }

  // Everything resting on top of the shell rides up with it.
  const BODY_LIFT = { r: S(3, 0.45, 1), o: [0, 2.2, 0] };

  /* ---------------- Carroceria ---------------- */
  const body = new THREE.Shape();
  body.moveTo(-2.12, 0.3);
  body.lineTo(-WB - 0.44, 0.3);
  body.absarc(-WB, WY, 0.44, Math.PI, 0, true);
  body.lineTo(-WB + 0.44, 0.3);
  body.lineTo(WB - 0.44, 0.3);
  body.absarc(WB, WY, 0.44, Math.PI, 0, true);
  body.lineTo(2.16, 0.32);
  body.quadraticCurveTo(2.3, 0.36, 2.3, 0.58);
  body.lineTo(2.22, 0.8);
  body.quadraticCurveTo(1.5, 0.88, 0.72, 0.94);
  body.lineTo(-1.6, 0.99);
  body.quadraticCurveTo(-2.05, 0.99, -2.14, 0.92);
  body.quadraticCurveTo(-2.22, 0.6, -2.12, 0.3);
  const bodyGeo = smoothExtrude(body, {
    depth: 1.66, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 6, curveSegments: 48,
  });
  bodyGeo.translate(0, 0, -0.83);
  P('Carroceria monobloco', 'Carroceria', [0, 0.6, 0], [BODY_LIFT], [
    mesh(bodyGeo, M.paint),
    mesh(rbox(1.7, 0.06, 1.86, 0.025), M.plastic, [0, 0.28, 0]),
  ]);

  /* Cabine envidraçada + teto */
  const cabin = new THREE.Shape();
  cabin.moveTo(0.8, 0.9);
  cabin.quadraticCurveTo(0.3, 1.2, -0.02, 1.3);
  cabin.lineTo(-0.95, 1.31);
  cabin.quadraticCurveTo(-1.5, 1.24, -1.78, 0.98);
  cabin.lineTo(-1.78, 0.9);
  const cabinGeo = smoothExtrude(cabin, {
    depth: 1.36, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 5, curveSegments: 32,
  });
  cabinGeo.translate(0, 0, -0.68);
  P('Vidros e para-brisa', 'Carroceria', [-0.5, 1.1, 0], [{ r: S(3, 0, 0.45), o: [0, 0.9, 0] }, BODY_LIFT], [
    mesh(cabinGeo, M.glass),
  ]);
  P('Teto em fibra de carbono', 'Carroceria', [-0.48, 1.36, 0], [{ r: S(3, 0, 0.4), o: [0, 1.5, 0] }, BODY_LIFT], [
    mesh(rbox(1.12, 0.04, 1.42, 0.018), M.plastic, [-0.48, 1.36, 0]),
  ]);

  /* Capô com tomada de ar */
  P('Capô', 'Carroceria', [1.485, 0.955, 0], [{ r: S(1, 0, 0.9), o: [0.4, 1.0, 0], rot: [0, 0, 0.3] }, BODY_LIFT], [
    mesh(rbox(1.52, 0.035, 1.6, 0.015), M.paint, [1.485, 0.955, 0], [0, 0, -0.09]),
    mesh(rbox(0.5, 0.06, 0.42, 0.025), M.paint, [1.42, 0.99, 0], [0, 0, -0.09]),
    mesh(rbox(0.04, 0.035, 0.34, 0.012), M.plastic, [1.67, 0.99, 0], [0, 0, -0.09]),
  ]);

  /* Porta-malas + aerofólio */
  P('Tampa traseira e aerofólio', 'Carroceria', [-1.84, 1.06, 0], [{ r: S(1, 0.1, 1), o: [-0.5, 0.9, 0], rot: [0, 0, -0.3] }, BODY_LIFT], [
    mesh(rbox(0.55, 0.03, 1.56, 0.012), M.paint, [-1.84, 1.055, 0], [0, 0, 0.1]),
    mesh(rbox(0.2, 0.025, 1.64, 0.01), M.plastic, [-2.06, 1.19, 0], [0, 0, 0.12]),
    mesh(rbox(0.05, 0.12, 0.03, 0.01), M.plastic, [-2.04, 1.12, 0.5]),
    mesh(rbox(0.05, 0.12, 0.03, 0.01), M.plastic, [-2.04, 1.12, -0.5]),
  ]);

  /* Portas (com retrovisor na dianteira) */
  for (const s of [1, -1]) {
    const zFace = s > 0 ? 0.9 : -0.93;
    const front = smoothExtrude(roundedRect(-0.42, 0.42, 0.62, 0.98, 0.06), {
      depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 8,
    });
    const rear = smoothExtrude(roundedRect(-1.42, 0.42, -0.45, 0.99, 0.06), {
      depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 8,
    });
    const side = s > 0 ? 'esquerda' : 'direita';
    P(`Porta dianteira ${side}`, 'Carroceria', [0.1, 0.7, s * 0.915], [{ r: S(2, 0, 0.75), o: [0.15, 0.25, s * 1.1], rot: [0, s * 0.22, 0] }], [
      mesh(front, M.paint, [0, 0, zFace]),
      mesh(rbox(0.14, 0.025, 0.03, 0.01), M.chrome, [0.32, 0.86, s * 0.95]),
      mesh(rbox(0.16, 0.08, 0.1, 0.035), M.paint, [0.52, 1.03, s * 0.98]),
      mesh(rbox(0.02, 0.06, 0.08, 0.008), M.chrome, [0.44, 1.03, s * 0.98]),
    ]);
    P(`Porta traseira ${side}`, 'Carroceria', [-0.93, 0.7, s * 0.915], [{ r: S(2, 0.2, 1), o: [-0.15, 0.25, s * 1.1], rot: [0, -s * 0.22, 0] }], [
      mesh(rear, M.paint, [0, 0, zFace]),
      mesh(rbox(0.14, 0.025, 0.03, 0.01), M.chrome, [-0.68, 0.86, s * 0.95]),
    ]);
  }

  /* Para-choques e iluminação */
  P('Para-choque dianteiro e grade', 'Carroceria', [2.32, 0.45, 0], [{ r: S(3, 0, 0.5), o: [1.1, 0, 0] }], [
    mesh(rbox(0.18, 0.14, 1.84, 0.05), M.plastic, [2.3, 0.33, 0]),
    mesh(rbox(0.04, 0.17, 0.95, 0.015), M.plastic, [2.36, 0.56, 0]),
    ...[0.5, 0.56, 0.62].map((y) => mesh(rbox(0.015, 0.012, 0.9, 0.005), M.chrome, [2.385, y, 0])),
  ]);
  P('Faróis full-LED', 'Iluminação', [2.31, 0.72, 0], [{ r: S(3, 0.05, 0.55), o: [1.7, 0.2, 0] }], [
    mesh(rbox(0.05, 0.07, 0.4, 0.02), M.headlight, [2.31, 0.72, 0.58]),
    mesh(rbox(0.05, 0.07, 0.4, 0.02), M.headlight, [2.31, 0.72, -0.58]),
  ]);
  P('Lanternas traseiras', 'Iluminação', [-2.21, 0.86, 0], [{ r: S(3, 0.05, 0.55), o: [-1.7, 0.2, 0] }], [
    mesh(rbox(0.04, 0.05, 1.5, 0.02), M.taillight, [-2.21, 0.86, 0]),
  ]);
  P('Para-choque traseiro e difusor', 'Carroceria', [-2.22, 0.33, 0], [{ r: S(3, 0, 0.5), o: [-1.1, 0, 0] }], [
    mesh(rbox(0.18, 0.14, 1.84, 0.05), M.plastic, [-2.22, 0.33, 0]),
    ...[-0.3, -0.1, 0.1, 0.3].map((z) => mesh(rbox(0.3, 0.08, 0.015, 0.006), M.plastic, [-2.2, 0.24, z])),
  ]);

  /* ---------------- Chassi (fica no lugar) ---------------- */
  P('Chassi e eixos', 'Estrutura', [0, 0.3, 0], [], [
    mesh(rbox(3.7, 0.06, 1.5, 0.02), M.metal, [0, 0.3, 0]),
    mesh(rbox(4.1, 0.1, 0.1, 0.03), M.metal, [0, 0.24, 0.6]),
    mesh(rbox(4.1, 0.1, 0.1, 0.03), M.metal, [0, 0.24, -0.6]),
    ...[-1.8, -0.6, 0.6, 1.8].map((x) => mesh(rbox(0.08, 0.08, 1.3, 0.02), M.metal, [x, 0.25, 0])),
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 16), M.metal, [WB, WY, 0], [Math.PI / 2, 0, 0]),
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 16), M.metal, [-WB, WY, 0], [Math.PI / 2, 0, 0]),
    mesh(rbox(0.55, 0.08, 0.36, 0.03), M.metal, [1.45, 0.34, 0]),
  ]);

  /* ---------------- Rodas, freios, suspensão ---------------- */
  const tireProfile = [
    [0.245, -0.125], [0.33, -0.13], [0.355, -0.115], [0.365, -0.07],
    [0.365, 0.07], [0.355, 0.115], [0.33, 0.13], [0.245, 0.125],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tireGeo = new THREE.LatheGeometry(tireProfile, 72).rotateX(Math.PI / 2);
  const barrelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 48, 1, true).rotateX(Math.PI / 2);
  const spokeGeo = rbox(0.045, 0.2, 0.03, 0.012);
  const hubGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.04, 24).rotateX(Math.PI / 2);
  const discGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.022, 48).rotateX(Math.PI / 2);
  const springGeo = new THREE.TubeGeometry(new Helix(0.07, 0.3, 6), 240, 0.012, 8);
  const damperGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.42, 12);

  for (const x of [WB, -WB]) {
    for (const s of [1, -1]) {
      const z = s * WZ;
      const where = `${x > 0 ? 'dianteira' : 'traseira'} ${s > 0 ? 'esquerda' : 'direita'}`;

      const spinner = new THREE.Group();
      spinner.position.set(x, WY, z);
      spinner.add(mesh(tireGeo, M.rubber));
      spinner.add(mesh(barrelGeo, new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 1, roughness: 0.3, side: THREE.DoubleSide })));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const spoke = mesh(spokeGeo, M.rim, [Math.sin(a) * 0.12, Math.cos(a) * 0.12, s * 0.1], [0, 0, -a]);
        spinner.add(spoke);
      }
      spinner.add(mesh(hubGeo, M.chrome, [0, 0, s * 0.11]));
      spinners.push(spinner);
      P(`Roda ${where}`, 'Rodas', [x, WY, z], [{ r: S(4, 0, 0.75), o: [0, 0, s * 1.6] }], [spinner]);

      P(`Freio a disco ${where}`, 'Freios', [x, WY, z], [{ r: S(4, 0.25, 0.9), o: [0, 0, s * 0.75] }], [
        mesh(discGeo, M.disc, [x, WY, z - s * 0.02]),
        mesh(rbox(0.08, 0.15, 0.07, 0.02), M.caliper, [x - 0.12, WY + 0.12, z - s * 0.02], [0, 0, 0.78]),
      ]);

      P(`Suspensão ${where}`, 'Suspensão', [x, 0.6, s * 0.55], [{ r: S(4, 0.45, 1), o: [0, 0.7, s * 0.5] }], [
        mesh(springGeo, M.accent, [x, 0.6, s * 0.55]),
        mesh(damperGeo, M.chrome, [x, 0.6, s * 0.55]),
      ]);
    }
  }

  /* ---------------- Motor V8 ---------------- */
  const EX = 1.45;
  P('Bloco do motor V8', 'Motor', [EX, 0.5, 0], [{ r: S(5, 0, 0.6), o: [0, 0.25, 0] }], [
    mesh(rbox(0.62, 0.26, 0.42, 0.03), M.engine, [EX, 0.5, 0]),
  ]);
  for (const s of [1, -1]) {
    const lado = s > 0 ? 'esquerdo' : 'direito';
    P(`Cabeçote ${lado}`, 'Motor', [EX, 0.68, s * 0.16], [{ r: S(5, 0.1, 0.7), o: [0, 0.5, s * 0.42] }], [
      mesh(rbox(0.62, 0.1, 0.16, 0.02), M.engine, [EX, 0.68, s * 0.16], [s * 0.45, 0, 0]),
    ]);
    P(`Tampa de válvulas ${lado}`, 'Motor', [EX, 0.752, s * 0.195], [{ r: S(5, 0.2, 0.8), o: [0, 0.75, s * 0.7] }], [
      mesh(rbox(0.6, 0.06, 0.14, 0.025), M.accent, [EX, 0.752, s * 0.195], [s * 0.45, 0, 0]),
    ]);

    const headers = [];
    for (let k = 0; k < 4; k++) {
      const hx = EX - 0.22 + k * 0.145;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(hx, 0.6, s * 0.25),
        new THREE.Vector3(hx, 0.52, s * 0.36),
        new THREE.Vector3((hx + 1.35) / 2, 0.4, s * 0.38),
        new THREE.Vector3(1.3, 0.31, s * 0.36),
      ]);
      headers.push(mesh(new THREE.TubeGeometry(curve, 24, 0.018, 8), M.chrome));
    }
    P(`Coletor de escape ${lado}`, 'Escape', [EX, 0.45, s * 0.33], [{ r: S(5, 0.3, 0.9), o: [0, 0.15, s * 0.65] }], headers);
  }
  P('Coletor de admissão', 'Motor', [EX, 0.72, 0], [{ r: S(5, 0.3, 0.85), o: [0, 0.95, 0] }], [
    mesh(rbox(0.56, 0.1, 0.18, 0.03), M.engine, [EX, 0.72, 0]),
    ...[-0.18, -0.06, 0.06, 0.18].map((dx) => mesh(rbox(0.05, 0.05, 0.3, 0.02), M.metal, [EX + dx, 0.7, 0])),
  ]);
  P('Filtro de ar', 'Motor', [EX, 0.82, 0], [{ r: S(5, 0.4, 1), o: [0, 1.3, 0] }], [
    mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 48), M.chrome, [EX, 0.82, 0]),
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16), M.accent, [EX, 0.865, 0]),
  ]);
  P('Polias e correia', 'Motor', [1.8, 0.56, 0], [{ r: S(5, 0.15, 0.7), o: [0.45, 0.3, 0] }], [
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 32), M.chrome, [1.8, 0.5, 0], [0, 0, Math.PI / 2]),
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 32), M.chrome, [1.8, 0.63, 0.15], [0, 0, Math.PI / 2]),
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 32), M.chrome, [1.8, 0.63, -0.15], [0, 0, Math.PI / 2]),
  ]);
  P('Radiador e ventoinha', 'Arrefecimento', [2.0, 0.58, 0], [{ r: S(5, 0, 0.5), o: [0.7, 0.1, 0] }], [
    mesh(rbox(0.06, 0.38, 1.1, 0.015), M.metal, [2.0, 0.58, 0]),
    mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 32), M.plastic, [1.94, 0.58, 0], [0, 0, Math.PI / 2]),
  ]);
  P('Bateria', 'Elétrica', [1.9, 0.5, 0.58], [{ r: S(5, 0.1, 0.6), o: [0.3, 0.55, 0.55] }], [
    mesh(rbox(0.2, 0.16, 0.14, 0.02), M.plastic, [1.9, 0.5, 0.58]),
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 12), M.accent, [1.85, 0.595, 0.58]),
  ]);

  /* Transmissão */
  P('Câmbio', 'Transmissão', [0.85, 0.42, 0], [{ r: S(5, 0.4, 1), o: [0, 0.45, 0] }], [
    mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.6, 32), M.engine, [0.85, 0.42, 0], [0, 0, -Math.PI / 2]),
  ]);
  P('Cardã', 'Transmissão', [-0.35, 0.38, 0], [{ r: S(5, 0.5, 1), o: [0, 0.2, 0] }], [
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 16), M.metal, [-0.35, 0.38, 0], [0, 0, Math.PI / 2]),
  ]);
  P('Diferencial', 'Transmissão', [-WB, WY, 0], [{ r: S(5, 0.5, 1), o: [0, 0.4, 0] }], [
    mesh(new THREE.SphereGeometry(0.12, 32, 16), M.engine, [-WB, WY, 0]),
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 20), M.engine, [-WB, WY, 0], [Math.PI / 2, 0, 0]),
  ]);

  /* ---------------- Interior ---------------- */
  P('Painel de instrumentos', 'Interior', [0.55, 0.9, 0], [{ r: S(6, 0, 0.6), o: [0.3, 0.9, 0] }], [
    mesh(rbox(0.3, 0.18, 1.4, 0.05), M.plastic, [0.55, 0.9, 0]),
    mesh(rbox(0.02, 0.07, 0.28, 0.01), M.gauge, [0.4, 0.96, 0.38]),
    mesh(rbox(0.02, 0.09, 0.32, 0.01), M.gauge, [0.4, 0.95, 0]),
  ]);
  const wheelGeo = new THREE.TorusGeometry(0.13, 0.016, 12, 48).rotateY(Math.PI / 2).rotateZ(0.35);
  P('Volante', 'Interior', [0.3, 0.98, 0.38], [{ r: S(6, 0.1, 0.7), o: [0, 1.2, 0], rot: [0, 0, 0.3] }], [
    mesh(wheelGeo, M.leather, [0.3, 0.98, 0.38]),
    mesh(rbox(0.03, 0.04, 0.24, 0.01), M.metal, [0.3, 0.98, 0.38], [0, 0, 0.35]),
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 12), M.metal, [0.4, 0.94, 0.38], [0, 0, 1.2]),
  ]);
  for (const s of [1, -1]) {
    const z = s * 0.36;
    P(`Banco concha ${s > 0 ? 'motorista' : 'passageiro'}`, 'Interior', [-0.15, 0.6, z], [{ r: S(6, 0.2, 0.85), o: [0, 0.85, s * 0.5] }], [
      mesh(rbox(0.5, 0.1, 0.44, 0.04), M.leather, [-0.15, 0.42, z]),
      mesh(rbox(0.1, 0.6, 0.44, 0.04), M.leather, [-0.42, 0.72, z], [0, 0, 0.2]),
      mesh(rbox(0.08, 0.15, 0.26, 0.03), M.leather, [-0.5, 1.07, z], [0, 0, 0.2]),
      mesh(rbox(0.105, 0.5, 0.05, 0.015), M.accent, [-0.415, 0.72, z], [0, 0, 0.2]),
    ]);
  }
  P('Banco traseiro', 'Interior', [-1.0, 0.55, 0], [{ r: S(6, 0.3, 0.95), o: [-0.3, 0.8, 0] }], [
    mesh(rbox(0.45, 0.1, 1.2, 0.04), M.leather, [-1.0, 0.42, 0]),
    mesh(rbox(0.1, 0.5, 1.2, 0.04), M.leather, [-1.25, 0.69, 0], [0, 0, 0.2]),
  ]);
  P('Console central', 'Interior', [0.1, 0.5, 0], [{ r: S(6, 0.15, 0.75), o: [0, 1.0, 0] }], [
    mesh(rbox(0.6, 0.15, 0.18, 0.04), M.plastic, [0.1, 0.5, 0]),
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 12), M.chrome, [0.2, 0.64, 0]),
    mesh(new THREE.SphereGeometry(0.035, 16, 12), M.leather, [0.2, 0.72, 0]),
  ]);

  /* ---------------- Escape ---------------- */
  for (const s of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.3, 0.3, s * 0.36),
      new THREE.Vector3(0.8, 0.2, s * 0.38),
      new THREE.Vector3(-1.2, 0.2, s * 0.38),
      new THREE.Vector3(-1.6, 0.22, s * 0.45),
      new THREE.Vector3(-2.3, 0.26, s * 0.5),
    ]);
    P(`Escapamento ${s > 0 ? 'esquerdo' : 'direito'}`, 'Escape', [-0.5, 0.22, s * 0.42], [{ r: S(7, 0, 0.6), o: [-0.5, 0, s * 0.75] }], [
      mesh(new THREE.TubeGeometry(curve, 80, 0.032, 12), M.metal),
      mesh(rbox(0.55, 0.12, 0.24, 0.05), M.metal, [-1.75, 0.22, s * 0.47]),
      mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 24), M.chrome, [-2.33, 0.26, s * 0.5], [0, 0, Math.PI / 2]),
    ]);
  }

  return { group, parts, meshes, spinners };
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
