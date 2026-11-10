import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOARD, L, HOLES } from './pcb.js';

/* ------------------------------------------------------------------ */
/* Modelling kit (board space, y = up off the board)                   */
/* ------------------------------------------------------------------ */

const rbox = (w, h, d, r = 0.004) =>
  new RoundedBoxGeometry(w, h, d, 2, Math.max(1e-4, Math.min(r, Math.min(w, h, d) / 2 - 1e-4)));
function mesh(geo, mat, p = [0, 0, 0], r = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  return m;
}
const box = (w, h, d, mat, p, r, rad) => mesh(rbox(w, h, d, rad ?? Math.min(w, h, d) * 0.15), mat, p, r);
const AX = { x: [0, 0, Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] };
const cyl = (rad, len, mat, p, axis = 'y', seg = 24, r2 = rad) => mesh(new THREE.CylinderGeometry(rad, r2, len, seg), mat, p, AX[axis]);
const keep = (m) => ((m.userData.keep = true), m);

// Texture budget for the current quality tier (set by buildBoard).
let TEX_SCALE = 1;
let ANISO = 8;

/** Canvas texture drawn in logical `w`×`h` units, stored at the tier's resolution. */
function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = Math.max(64, Math.round(w * TEX_SCALE));
  c.height = Math.max(64, Math.round(h * TEX_SCALE));
  const g = c.getContext('2d');
  g.scale(c.width / w, c.height / h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}
const MONO = '"JetBrains Mono", monospace';
const SANS = '"Space Grotesk", sans-serif';

/** Merges a part's plain meshes into one mesh per material. */
function mergePart(part) {
  part.updateMatrixWorld(true);
  const inv = part.matrixWorld.clone().invert();
  const byMat = new Map();
  const drop = [];
  const rel = new THREE.Matrix4();
  part.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.keep || Array.isArray(o.material)) return;
    let p = o.parent;
    while (p && p !== part) {
      if (p.userData.keep) return;
      p = p.parent;
    }
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
    drop.push(o);
  });
  drop.forEach((o) => o.removeFromParent());
  for (const [mat, geos] of byMat) part.add(new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat));
}

/**
 * Extrudes a board-space outline [[x, z], …] upwards from y0 to y0 + h with a soft bevel.
 * `holes` are [x, z, r] circles. Material groups: 0 = top/bottom faces, 1 = sides.
 */
function slab(pts, y0, h, mats, holes = [], bevel = 0.008) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const [cx, cz, r] of holes) shape.holes.push(new THREE.Path().absarc(cx, -cz, r, 0, Math.PI * 2, true));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 48,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0 + bevel, 0);
  return keep(new THREE.Mesh(geo, mats));
}

/**
 * Swept, pitched fan blades merged into one geometry (fan axis = +z). Each blade is a sickle
 * outline extruded thin, then twisted into a helix: steep at the root, flatter at the tip.
 */
function fanBlades(detail = 1, n = 9, r0 = 0.1, r1 = 0.395) {
  const steps = Math.max(6, Math.round(14 * detail));
  const sweep = (u) => 0.55 * u * u; // backward sweep (rad) at radius fraction u
  const half = (u) => 0.2 + 0.12 * Math.sin(Math.PI * Math.min(1, u * 1.15)); // half chord (rad)
  const at = (r, a) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push(at(r0 + (r1 - r0) * u, sweep(u) + half(u)));
  }
  for (let i = steps; i >= 0; i--) {
    const u = i / steps;
    pts.push(at(r0 + (r1 - r0) * u, sweep(u) - half(u)));
  }
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: detail < 1 ? 1 : 2,
  });
  geo.translate(0, 0, -0.002);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y), u = Math.min(1, Math.max(0, (r - r0) / (r1 - r0)));
    let d = Math.atan2(y, x) - sweep(u);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    pos.setZ(i, pos.getZ(i) + d * r * Math.tan(THREE.MathUtils.lerp(0.75, 0.38, u)) * 0.55);
  }
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  const blades = Array.from({ length: n }, (_, k) => geo.clone().rotateZ((k / n) * Math.PI * 2));
  geo.dispose();
  return mergeGeometries(blades);
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

function materials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    plastic: std({ color: 0x141518, roughness: 0.55 }),
    plasticGrey: std({ color: 0x3a3e45, roughness: 0.5 }),
    plasticWhite: std({ color: 0xd9dbe0, roughness: 0.5 }),
    gold: std({ color: 0xd8ad4c, metalness: 1, roughness: 0.28 }),
    steel: std({ color: 0xb7bcc4, metalness: 1, roughness: 0.3 }),
    darkSteel: std({ color: 0x5a6069, metalness: 1, roughness: 0.4 }),
    sink: std({ color: 0x30353d, metalness: 0.9, roughness: 0.38 }),
    sinkLight: std({ color: 0x8c939d, metalness: 1, roughness: 0.3 }),
    copper: std({ color: 0xc27b4c, metalness: 1, roughness: 0.3 }),
    ic: std({ color: 0x0f1012, roughness: 0.35, metalness: 0.2 }),
    choke: std({ color: 0x40444b, roughness: 0.6, metalness: 0.4 }),
    capTop: std({ color: 0xa9aeb6, metalness: 1, roughness: 0.32 }),
    capBody: std({ color: 0x1d1f23, metalness: 0.6, roughness: 0.35 }),
    audioCap: std({ color: 0xc9a243, metalness: 0.7, roughness: 0.3 }),
    substrate: std({ color: 0x1b4a31, roughness: 0.5 }),
    pcbGreen: std({ color: 0x0e2a1c, roughness: 0.6 }),
    pcbBlack: std({ color: 0x0b0c0e, roughness: 0.6 }),
    pad: std({ color: 0xe86fa8, roughness: 0.8 }),
    rubber: std({ color: 0x0b0b0c, roughness: 0.9 }),
    portBlue: std({ color: 0x1f5fe0, roughness: 0.45 }),
    portRed: std({ color: 0xd6203a, roughness: 0.45 }),
    portTeal: std({ color: 0x18b6a8, roughness: 0.45 }),
    hole: std({ color: 0x050506, roughness: 1 }),
    rgb: std({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 2.2 }),
    rgb2: std({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 2.2 }),
    fanGlow: std({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 0.8 }),
    ledOff: std({ color: 0x2a0d0d, emissive: 0xff2a2a, emissiveIntensity: 0 }),
  };
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export function buildBoard({ profile, projects }, pcbTexture, S, Q = {}) {
  TEX_SCALE = Q.tex ?? 1;
  ANISO = Q.aniso ?? 8;
  const SMD = Q.smd ?? 1;
  const M = materials();
  // Brushed, machined aluminium shared by the VRM, I/O, chipset and M.2 armour (UVs are in board units).
  const armorTex = canvasTex(1024, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#30343b');
    grd.addColorStop(1, '#272a30');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3200; i++) {
      g.fillStyle = Math.random() < 0.6 ? `rgba(255,255,255,${Math.random() * 0.035})` : `rgba(0,0,0,${Math.random() * 0.09})`;
      const x = Math.random() * w, y = Math.random() * h, l = 40 + Math.random() * 180;
      g.fillRect(x, y, l, 1);
      if (x + l > w) g.fillRect(x - w, y, l, 1); // wrap so the tile repeats seamlessly
    }
    // 45° grooves; the period divides the tile, so the pattern tiles too.
    for (let k = -4; k <= 4; k++) {
      const x = k * 256;
      g.lineWidth = 12;
      g.strokeStyle = 'rgba(0,0,0,0.42)';
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + h, h);
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.moveTo(x + 8, 0);
      g.lineTo(x + 8 + h, h);
      g.stroke();
    }
  });
  armorTex.wrapS = armorTex.wrapT = THREE.RepeatWrapping;
  armorTex.repeat.set(1.4, 1.4);
  M.armor = new THREE.MeshStandardMaterial({ map: armorTex, metalness: 0.85, roughness: 0.36 });
  M.armorSide = new THREE.MeshStandardMaterial({ color: 0x1d2025, metalness: 0.9, roughness: 0.42 });
  const ARMOR = [M.armor, M.armorSide];
  const root = new THREE.Group();
  const parts = [];
  const installs = [];
  const fans = [];
  const ram = [];
  const leds = {};
  const blink = [];

  /** A hoverable part. Children are placed in board space. */
  function part(info, children = [], base = null) {
    const g = new THREE.Group();
    g.userData = { ...info };
    if (base) {
      g.position.set(...base);
      g.userData.base = g.position.clone();
      g.userData.baseRot = g.rotation.clone();
    }
    for (const c of children.flat()) {
      if (base) c.position.sub(g.position);
      g.add(c);
    }
    root.add(g);
    parts.push(g);
    return g;
  }
  /** Registers an installation animation (floats at base + off until the window r). */
  function install(g, off, rot, r) {
    installs.push({ g, off: new THREE.Vector3(...off), rot: new THREE.Euler(...rot), r, seed: Math.random() * 10 });
  }

  /* ---------------- PCB ---------------- */
  const pcbMats = [M.pcbBlack, M.pcbBlack, new THREE.MeshStandardMaterial({ map: pcbTexture, roughness: 0.62, metalness: 0.25 }), M.pcbBlack, M.pcbBlack, M.pcbBlack];
  const pcb = keep(mesh(new THREE.BoxGeometry(BOARD.w, BOARD.t, BOARD.h), pcbMats, [0, -BOARD.t / 2, 0]));
  part({ name: 'Placa de circuito impresso', spec: '8 camadas · cobre 2 oz · ATX', desc: 'A base de tudo: trilhas finíssimas levam energia e dados entre os componentes.', kind: 'pcb' }, [pcb]);
  part({ name: 'Furos de fixação', spec: '9 pontos · padrão ATX', desc: 'Onde a placa é parafusada no gabinete.' },
    HOLES.map(([x, z]) => mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 24), M.gold, [x, 0.002, z], [Math.PI / 2, 0, 0])));

  /* ---------------- CPU socket + CPU ---------------- */
  const { cpu } = L;
  const pinTex = canvasTex(512, 600, (g, w, h) => {
    g.fillStyle = '#18140c';
    g.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 9) for (let x = 8 + ((y / 9) % 2) * 4; x < w; x += 9) {
      if (Math.abs(x - w / 2) < 70 && Math.abs(y - h / 2) < 90) continue;
      g.fillStyle = '#c99a3a';
      g.fillRect(x, y, 3, 3);
    }
  });
  const socketBase = [
    box(0.62, 0.025, 0.66, M.darkSteel, [cpu.x, 0.0125, cpu.z], undefined, 0.006),
    keep(mesh(new THREE.BoxGeometry(0.42, 0.004, 0.5), new THREE.MeshStandardMaterial({ map: pinTex, metalness: 0.6, roughness: 0.4 }), [cpu.x, 0.027, cpu.z])),
    box(0.46, 0.012, 0.025, M.plastic, [cpu.x, 0.03, cpu.z - 0.26]),
    box(0.46, 0.012, 0.025, M.plastic, [cpu.x, 0.03, cpu.z + 0.26]),
    box(0.025, 0.012, 0.5, M.plastic, [cpu.x - 0.22, 0.03, cpu.z]),
    box(0.025, 0.012, 0.5, M.plastic, [cpu.x + 0.22, 0.03, cpu.z]),
    ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => cyl(0.02, 0.03, M.steel, [cpu.x + sx * 0.28, 0.03, cpu.z + sz * 0.3], 'y', 12)),
  ];
  part({ name: 'Soquete do processador', spec: '1.700 contatos banhados a ouro', desc: 'O encaixe do processador. Cada pino é uma conexão elétrica.', section: 1 }, socketBase);

  // Load plate, hinged on its top edge, starts open.
  const hingeZ = cpu.z - 0.29;
  const plate = part({ name: 'Placa de retenção', spec: 'Aço inox', desc: 'Prende o processador contra os pinos com força uniforme.', section: 1 }, [
    box(0.5, 0.008, 0.04, M.steel, [cpu.x, 0.045, cpu.z - 0.27]),
    box(0.5, 0.008, 0.04, M.steel, [cpu.x, 0.045, cpu.z + 0.27]),
    box(0.04, 0.008, 0.54, M.steel, [cpu.x - 0.23, 0.045, cpu.z]),
    box(0.04, 0.008, 0.54, M.steel, [cpu.x + 0.23, 0.045, cpu.z]),
    box(0.06, 0.006, 0.05, M.steel, [cpu.x, 0.045, cpu.z + 0.3]),
  ], [cpu.x, 0.045, hingeZ]);
  install(plate, [0, 0, 0], [-1.9, 0, 0], S(1, 0.55, 0.85));
  installs[installs.length - 1].noFloat = true;

  const lever = part({ name: 'Alavanca do soquete', spec: 'Trava de retenção', desc: 'Fecha a placa de retenção com um clique.', section: 1 }, [
    cyl(0.007, 0.6, M.steel, [cpu.x + 0.3, 0.03, cpu.z], 'z', 10),
    cyl(0.007, 0.08, M.steel, [cpu.x + 0.335, 0.03, cpu.z + 0.3], 'x', 10),
    box(0.03, 0.02, 0.04, M.plastic, [cpu.x + 0.37, 0.03, cpu.z + 0.3]),
  ], [cpu.x + 0.3, 0.03, cpu.z]);
  install(lever, [0, 0, 0], [0, 0, 1.4], S(1, 0.75, 0.97));
  installs[installs.length - 1].noFloat = true;

  const ihsTex = canvasTex(1024, 1160, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#d9dde3');
    grd.addColorStop(0.5, '#b6bcc5');
    grd.addColorStop(1, '#cfd3da');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 120, 1);
    }
    g.fillStyle = 'rgba(40,44,52,0.85)';
    g.font = `600 30px ${MONO}`;
    g.fillText('PROCESSADOR', 90, 210);
    g.font = `700 ${profile.name.length > 14 ? 64 : 82}px ${SANS}`;
    g.fillText(profile.name.toUpperCase(), 90, 520);
    g.font = `500 34px ${MONO}`;
    g.fillText(profile.role.toUpperCase().slice(0, 34), 90, 590);
    g.fillText(profile.location.toUpperCase(), 90, 640);
    g.font = `500 28px ${MONO}`;
    g.fillText(`SRN-${String(Date.now()).slice(-6)} · ${new Date().getFullYear()}`, 90, 980);
    g.fillText('8 CORES · 6 YRS · ∞ CAFÉ', 90, 1030);
    g.beginPath();
    g.moveTo(w - 150, h - 120);
    g.lineTo(w - 90, h - 120);
    g.lineTo(w - 90, h - 60);
    g.closePath();
    g.fill();
  });
  const cpuGroup = part({ name: 'Processador', spec: profile.name, desc: 'Clique para ver as informações pessoais.', section: 1, kind: 'cpu' }, [
    box(0.375, 0.014, 0.45, M.substrate, [cpu.x, 0.04, cpu.z], undefined, 0.004),
    ...Array.from({ length: 16 }, (_, i) => box(0.012, 0.006, 0.006, M.gold, [cpu.x - 0.17 + (i % 8) * 0.012, 0.049, cpu.z + (i < 8 ? -0.205 : 0.205)])),
    box(0.3, 0.008, 0.36, M.steel, [cpu.x, 0.051, cpu.z], undefined, 0.01),
    keep(mesh(new THREE.BoxGeometry(0.26, 0.022, 0.31), [M.steel, M.steel, new THREE.MeshStandardMaterial({ map: ihsTex, metalness: 1, roughness: 0.32 }), M.steel, M.steel, M.steel], [cpu.x, 0.064, cpu.z])),
  ], [cpu.x, 0.05, cpu.z]);
  install(cpuGroup, [0, 0.6, 0], [0.22, 0.35, -0.12], S(1, 0.1, 0.6));

  /* ---------------- VRM armour, chokes, caps ---------------- */
  // One L-shaped sculpted cap over two fin stacks, joined by a heatpipe.
  const vrm = [];
  for (let x = -1.15; x <= 0.1; x += 0.03) vrm.push(box(0.008, 0.17, 0.2, M.sink, [x, 0.105, -1.0], undefined, 0.002));
  for (let z = -0.86; z <= -0.05; z += 0.03) vrm.push(box(0.15, 0.17, 0.008, M.sink, [-1.105, 0.105, z], undefined, 0.002));
  vrm.push(
    box(1.3, 0.02, 0.22, M.armorSide, [-0.52, 0.01, -1.0], undefined, 0.004),
    box(0.17, 0.02, 0.86, M.armorSide, [-1.105, 0.01, -0.45], undefined, 0.004),
    cyl(0.012, 1.1, M.copper, [-0.5, 0.06, -0.9], 'x', 12),
    cyl(0.012, 0.86, M.copper, [-1.03, 0.06, -0.45], 'z', 12),
    slab([[-1.19, -1.11], [0.06, -1.11], [0.15, -1.03], [0.15, -0.95], [0.1, -0.89], [-0.96, -0.89], [-1.02, -0.83],
      [-1.02, -0.1], [-1.08, -0.02], [-1.19, -0.02]], 0.19, 0.075, ARMOR),
    // raised machined spine + light-catching chamfer strips
    slab([[-0.9, -1.07], [-0.1, -1.07], [-0.04, -1.01], [-0.1, -0.95], [-0.9, -0.95]], 0.265, 0.018, [M.sinkLight, M.armorSide], [], 0.004),
    box(0.012, 0.012, 0.6, M.sinkLight, [-1.17, 0.265, -0.4]),
  );
  part({ name: 'Dissipador do VRM', spec: 'Alumínio usinado · heatpipe de cobre', desc: 'Mantém frios os MOSFETs que alimentam o processador.' }, vrm);

  const chokes = [];
  for (let i = 0; i < 15; i++) chokes.push(box(0.065, 0.055, 0.065, M.choke, [-0.98 + i * 0.075, 0.0275, -0.8], undefined, 0.008));
  for (let i = 0; i < 9; i++) chokes.push(box(0.065, 0.055, 0.065, M.choke, [-0.9, 0.0275, -0.7 + i * 0.075], undefined, 0.008));
  part({ name: 'Indutores do VRM', spec: '24 fases · 105 A cada', desc: 'Suavizam a corrente que chega ao processador.' }, chokes);

  const caps = [];
  const cap = (x, z, r = 0.022, h = 0.06) => [cyl(r, h, M.capBody, [x, h / 2, z], 'y', 16), cyl(r * 0.97, 0.004, M.capTop, [x, h + 0.002, z], 'y', 16)];
  for (let i = 0; i < 8; i++) caps.push(...cap(-0.15 + i * 0.05, -0.72));
  for (let i = 0; i < 6; i++) caps.push(...cap(-0.8, -0.5 + i * 0.07));
  for (let i = 0; i < 4; i++) caps.push(...cap(1.25, -0.7 + i * 0.06, 0.018, 0.05));
  part({ name: 'Capacitores de polímero sólido', spec: '820 µF · 10 mil horas a 105 °C', desc: 'Reservatórios de energia que estabilizam a tensão.' }, caps);

  const eps = [];
  for (const x of [-0.62, -0.3]) {
    eps.push(box(0.2, 0.11, 0.09, M.plastic, [x, 0.055, -1.16], undefined, 0.006));
    for (let i = 0; i < 8; i++) eps.push(box(0.03, 0.004, 0.028, M.hole, [x - 0.075 + (i % 4) * 0.05, 0.111, -1.16 + (i < 4 ? -0.02 : 0.02)]));
  }
  part({ name: 'Conectores EPS 8 pinos', spec: '2 × 8 pinos · 12 V', desc: 'Energia dedicada ao processador vinda da fonte.' }, eps);

  /* ---------------- DIMM slots + RAM sticks ---------------- */
  const slots = [];
  L.dimmX.forEach((x, i) => {
    const mat = i % 2 ? M.plasticGrey : M.plastic;
    slots.push(box(0.032, 0.07, 1.42, mat, [x, 0.035, L.dimmZ], undefined, 0.004));
    slots.push(box(0.012, 0.01, 1.36, M.hole, [x, 0.071, L.dimmZ]));
    for (const s of [-1, 1]) slots.push(box(0.03, 0.08, 0.05, mat, [x, 0.06, L.dimmZ + s * 0.7], [s * 0.25, 0, 0], 0.006));
  });
  part({ name: 'Slots de memória DDR5', spec: '4 slots · até 192 GB', desc: 'Cada slot guarda um projeto.', section: 2 }, slots);

  projects.forEach((p, i) => {
    const x = L.dimmX[i];
    const color = new THREE.Color(p.color);
    const label = canvasTex(1024, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, '#16181d');
      grd.addColorStop(1, '#0d0e11');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = p.color;
      g.fillRect(0, 0, w, 10);
      g.globalAlpha = 0.18;
      for (let k = 0; k < 6; k++) g.fillRect(w - 260 + k * 40, 10, 18, h);
      g.globalAlpha = 1;
      g.fillStyle = '#f2f4f8';
      g.font = `700 64px ${SANS}`;
      g.fillText(p.title, 40, 120);
      g.font = `500 26px ${MONO}`;
      g.fillStyle = 'rgba(242,244,248,0.6)';
      g.fillText(`${p.slot} · DDR5-6000 · ${p.year}`, 40, 170);
      g.fillStyle = p.color;
      g.fillText(p.role.toUpperCase(), 40, 215);
    });
    const spread = new THREE.MeshStandardMaterial({ color: 0x1a1c21, metalness: 0.8, roughness: 0.35 });
    const face = new THREE.MeshStandardMaterial({ map: label, metalness: 0.5, roughness: 0.4 });
    const light = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 0, roughness: 0.4 });
    light.userData.keepLook = true; // the hover highlight must not repaint the RGB bar
    const y0 = 0.035;
    const stick = part({ name: `${p.slot} · ${p.title}`, spec: p.tagline, desc: 'Clique para abrir o projeto.', section: 2, kind: 'ram', project: i }, [
      box(0.008, 0.31, 1.33, M.pcbGreen, [x, y0 + 0.155, L.dimmZ], undefined, 0.002),
      box(0.012, 0.03, 1.3, M.gold, [x, y0 + 0.012, L.dimmZ], undefined, 0.002),
      keep(mesh(new THREE.BoxGeometry(0.008, 0.3, 1.31), [face, spread, spread, spread, spread, spread], [x + 0.009, y0 + 0.19, L.dimmZ])),
      box(0.008, 0.3, 1.31, spread, [x - 0.009, y0 + 0.19, L.dimmZ], undefined, 0.002),
      keep(box(0.03, 0.035, 1.27, light, [x, y0 + 0.36, L.dimmZ], undefined, 0.008)),
      box(0.032, 0.012, 1.3, M.sinkLight, [x, y0 + 0.337, L.dimmZ], undefined, 0.003),
    ], [x, y0, L.dimmZ]);
    install(stick, [0, 0.55 + i * 0.05, 0], [0, 0.18 - i * 0.09, 0.14 - i * 0.04], S(2, 0.05 + i * 0.16, 0.35 + i * 0.16));
    // Equal-brightness glow whatever the project colour: bloom keys off luminance, so darker hues
    // (pink, purple, blue) need a higher intensity than cyan or green to light up at all.
    const lum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    const gain = Math.min(10, 1.45 / Math.max(lum, 0.05));
    ram.push({ g: stick, light, color, gain });
  });

  /* ---------------- PCIe slots + GPU ---------------- */
  const pcieSlot = (x, z, len, armored = false) => [
    box(len, 0.06, 0.04, M.plastic, [x, 0.03, z], undefined, 0.004),
    box(len, 0.004, 0.044, M.steel, [x, 0.062, z]),
    box(len * 0.98, 0.006, 0.014, M.hole, [x, 0.063, z]),
    box(0.06, 0.07, 0.035, M.plastic, [x + len / 2 + 0.02, 0.035, z], [0, 0, -0.3], 0.004),
    // steel sleeve: side walls plus end caps that clamp to the board
    ...(armored ? [
      ...[-1, 1].map((s) => box(len + 0.02, 0.058, 0.004, M.steel, [x, 0.031, z + s * 0.022], undefined, 0.001)),
      ...[-1, 1].map((s) => box(0.02, 0.066, 0.05, M.steel, [x + s * (len / 2 + 0.005), 0.033, z], undefined, 0.003)),
    ] : []),
  ];
  part({ name: 'Slot PCIe 5.0 x16', spec: '128 GB/s · blindagem de aço', desc: 'Onde entra a placa de vídeo.', section: 3 }, pcieSlot(L.pcie1.x, L.pcie1.z, 0.89, true));
  part({ name: 'Slot PCIe 4.0 x16 (x4)', spec: 'Placas de expansão', desc: 'Espaço para placas de captura, rede ou outra GPU.' }, pcieSlot(L.pcie2.x, L.pcie2.z, 0.89, true));
  part({ name: 'Slot PCIe x1', spec: 'Placas de expansão', desc: 'Para placas de som, Wi-Fi ou portas extras.' }, pcieSlot(L.pciex1.x, L.pciex1.z, 0.25));

  const gx0 = -1.5, gx1 = 1.12, gz = L.pcie1.z, gh = 1.02;
  const gcx = (gx0 + gx1) / 2;
  const backTex = canvasTex(2048, 800, (g, w, h) => {
    // The card stands up, so this face's texture "up" points at the viewer: rotate the art 180°.
    g.translate(w, h);
    g.scale(-1, -1);
    g.fillStyle = '#16181c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 3;
    for (let i = 0; i < 30; i++) {
      g.beginPath();
      g.moveTo(i * 90, 0);
      g.lineTo(i * 90 - 400, h);
      g.stroke();
    }
    g.fillStyle = '#e8ebf0';
    g.font = `700 120px ${SANS}`;
    g.fillText('HABILIDADES', 120, h / 2 + 20);
    g.font = `500 44px ${MONO}`;
    g.fillStyle = 'rgba(232,235,240,0.55)';
    g.fillText('STACK · FERRAMENTAS · LINGUAGENS', 124, h / 2 + 100);
  });
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, metalness: 0.7, roughness: 0.4 });
  const FAN_T = [0.2, 0.5, 0.8];
  // Shroud opening; sized so neighbouring fans (0.786 apart) never overlap. Every ring below is centred on it.
  const FAN_R = 0.375;
  const TIP = FAN_R - 0.035;
  const shroudTex = canvasTex(2048, 800, (g, w, h) => {
    g.fillStyle = '#1b1d22';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 2;
    for (let x = -h; x < w; x += 26) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + h * 0.6, 0);
      g.stroke();
    }
    const px = h / gh;
    for (const t of FAN_T) {
      const cx = t * w, cy = h / 2, r = FAN_R * px;
      const bevel = g.createRadialGradient(cx, cy, r, cx, cy, r + 26);
      bevel.addColorStop(0, '#5d636c');
      bevel.addColorStop(1, 'rgba(27,29,34,0)');
      g.fillStyle = bevel;
      g.beginPath();
      g.arc(cx, cy, r + 26, 0, Math.PI * 2);
      g.fill();
      const well = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      well.addColorStop(0, '#0b0c0e');
      well.addColorStop(1, '#030304');
      g.fillStyle = well;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      // stator struts seen behind the blades
      g.strokeStyle = '#17191d';
      g.lineWidth = 10;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        g.stroke();
      }
    }
    g.fillStyle = '#9aa1ab';
    g.fillRect(0, h - 40, w, 16);
  });
  const shroudMat = new THREE.MeshStandardMaterial({ map: shroudTex, metalness: 0.6, roughness: 0.45 });
  const gpuParts = [
    box(gx1 - gx0 - 0.05, gh - 0.02, 0.016, M.pcbBlack, [gcx + 0.02, 0.03 + gh / 2, gz]),
    box(0.85, 0.03, 0.02, M.gold, [L.pcie1.x, 0.03, gz], undefined, 0.003),
    keep(mesh(new THREE.BoxGeometry(gx1 - gx0, gh, 0.012), [M.sink, M.sink, M.sink, M.sink, M.sink, backMat], [gcx, 0.06 + gh / 2, gz - 0.016])),
    ...Array.from({ length: 70 }, (_, i) => box(0.006, gh - 0.1, 0.33, M.sinkLight, [gx0 + 0.12 + i * 0.035, 0.06 + gh / 2, gz + 0.19], undefined, 0.002)),
    ...[0.3, 0.55, 0.8].map((y) => cyl(0.012, gx1 - gx0 - 0.2, M.copper, [gcx, y, gz + 0.06], 'x', 10)),
    keep(mesh(new THREE.BoxGeometry(gx1 - gx0, gh, 0.03), [M.sink, M.sink, M.sink, M.sink, shroudMat, M.sink], [gcx, 0.06 + gh / 2, gz + 0.38])),
    box(gx1 - gx0, 0.04, 0.42, M.sink, [gcx, 0.06 + gh + 0.02, gz + 0.19], undefined, 0.01),
    keep(box(gx1 - gx0 - 0.3, 0.012, 0.03, M.rgb2, [gcx + 0.1, 0.06 + gh + 0.045, gz + 0.3], undefined, 0.004)),
    box(0.16, 0.06, 0.08, M.plastic, [0.75, 0.06 + gh + 0.05, gz + 0.12], undefined, 0.006),
    box(0.02, gh + 0.2, 0.46, M.steel, [-1.54, 0.12 + gh / 2, gz + 0.2], undefined, 0.002),
    ...[0.25, 0.5, 0.75].map((t) => box(0.025, 0.08, 0.06, M.hole, [-1.555, 0.06 + gh * t, gz + 0.2])),
  ];
  const bladeGeo = fanBlades(SMD > 0.5 ? 1 : 0.5, 9, 0.1, TIP + 0.002);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1c1f25, metalness: 0.35, roughness: 0.32, side: THREE.DoubleSide });
  const ring = (r, tube, mat, z, seg = 96) => mesh(new THREE.TorusGeometry(r, tube, 10, seg), mat, [0, 0, z]);
  const disc = (r, len, mat, z) => cyl(r, len, mat, [0, 0, z], 'z', 48);
  for (const t of FAN_T) {
    const cx = gx0 + (gx1 - gx0) * t, cy = 0.06 + gh / 2;
    // Static frame: bevelled rim + RGB halo around the opening.
    gpuParts.push(
      mesh(new THREE.TorusGeometry(FAN_R + 0.008, 0.014, 12, 96), M.sinkLight, [cx, cy, gz + 0.398]),
      keep(mesh(new THREE.TorusGeometry(FAN_R - 0.014, 0.003, 8, 96), M.fanGlow, [cx, cy, gz + 0.402])),
    );
    const fan = new THREE.Group();
    fan.userData.keep = true;
    fan.position.set(cx, cy, gz + 0.425);
    fan.add(mesh(bladeGeo, bladeMat));
    // Blade-tip ring, then the hub: body, chrome ring, cap, inner ring and lit badge on one axis.
    fan.add(ring(TIP, 0.008, bladeMat, 0));
    fan.add(disc(0.118, 0.034, M.plastic, 0));
    fan.add(ring(0.112, 0.006, M.sinkLight, 0.017, 64));
    fan.add(disc(0.094, 0.006, M.sink, 0.019));
    fan.add(ring(0.062, 0.004, M.sinkLight, 0.022, 64));
    fan.add(disc(0.048, 0.004, M.fanGlow, 0.022));
    fans.push(fan);
    gpuParts.push(fan);
  }
  const gpu = part({ name: 'Placa de vídeo', spec: 'Habilidades e ferramentas', desc: 'Clique para ver habilidades e ferramentas.', section: 3, kind: 'gpu' }, gpuParts, [gcx, 0.03, gz]);
  install(gpu, [0, 0.55, 0], [0.16, 0, 0.05], S(3, 0.1, 0.7));

  /* ---------------- M.2 SSD + heatsink ---------------- */
  const { m2 } = L;
  part({ name: 'Slot M.2', spec: 'PCIe 5.0 x4 · 2280', desc: 'Conector do SSD NVMe.', section: 4 }, [
    box(0.06, 0.03, 0.24, M.plastic, [m2.x - 0.42, 0.015, m2.z]),
    cyl(0.018, 0.02, M.gold, [m2.x + 0.38, 0.01, m2.z], 'y', 12),
  ]);
  const ssdTex = canvasTex(1024, 300, (g, w, h) => {
    g.fillStyle = '#0d0e10';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8ebf0';
    g.font = `700 70px ${SANS}`;
    g.fillText('EXPERIÊNCIA', 40, 120);
    g.font = `500 30px ${MONO}`;
    g.fillStyle = 'rgba(232,235,240,0.6)';
    g.fillText('NVMe 2 TB · 14.000 MB/s', 40, 180);
    g.fillStyle = '#35e0ff';
    g.fillRect(40, 220, 300, 8);
  });
  const ssdLabel = new THREE.MeshStandardMaterial({ map: ssdTex, roughness: 0.5 });
  const ssd = part({ name: 'SSD NVMe', spec: 'Experiência profissional', desc: 'Clique para ver a trajetória.', section: 4, kind: 'ssd' }, [
    box(0.8, 0.008, 0.22, M.pcbBlack, [m2.x, 0.035, m2.z], undefined, 0.002),
    box(0.04, 0.008, 0.2, M.gold, [m2.x - 0.4, 0.035, m2.z], undefined, 0.002),
    box(0.12, 0.012, 0.12, M.ic, [m2.x - 0.25, 0.045, m2.z]),
    box(0.16, 0.012, 0.16, M.ic, [m2.x - 0.05, 0.045, m2.z]),
    box(0.16, 0.012, 0.16, M.ic, [m2.x + 0.16, 0.045, m2.z]),
    keep(mesh(new THREE.BoxGeometry(0.6, 0.002, 0.18), ssdLabel, [m2.x + 0.04, 0.053, m2.z])),
  ], [m2.x, 0.035, m2.z]);
  install(ssd, [0, 0.45, 0], [0, 0.25, 0.12], S(4, 0.05, 0.5));
  const coverTex = canvasTex(1024, 300, (g, w, h) => {
    g.fillStyle = '#2b2f36';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = i % 2 ? '#22262c' : '#3a3f47';
      g.fillRect(560 + i * 18, 0, 9, h);
    }
    g.fillStyle = '#d8dce2';
    g.font = `700 54px ${SANS}`;
    g.fillText('M.2 SHIELD', 40, 120);
    g.font = `500 26px ${MONO}`;
    g.fillStyle = 'rgba(216,220,226,0.6)';
    g.fillText('FROZR · THERMAL GUARD', 40, 170);
  });
  const cover = part({ name: 'Dissipador do M.2', spec: 'Alumínio com thermal pad', desc: 'Evita que o SSD perca velocidade por calor.', section: 4, kind: 'ssd' }, [
    keep(mesh(new THREE.BoxGeometry(0.88, 0.035, 0.25), [M.sink, M.sink, new THREE.MeshStandardMaterial({ map: coverTex, metalness: 0.8, roughness: 0.4 }), M.sink, M.sink, M.sink], [m2.x, 0.07, m2.z])),
    box(0.78, 0.008, 0.2, M.pad, [m2.x, 0.05, m2.z]),
    ...[-0.4, 0.4].map((dx) => cyl(0.012, 0.012, M.steel, [m2.x + dx, 0.093, m2.z], 'y', 12)),
  ], [m2.x, 0.07, m2.z]);
  install(cover, [0, 0.75, 0], [0.12, -0.2, 0.08], S(4, 0.45, 0.9));

  /* ---------------- Chipset ---------------- */
  const chipTex = canvasTex(1024, 840, (g, w, h) => {
    g.fillStyle = '#23272d';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 6;
    for (let i = -h; i < w; i += 40) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.stroke();
    }
    g.fillStyle = '#eef1f5';
    g.font = `700 200px ${SANS}`;
    g.fillText('X1', 80, 420);
    g.font = `500 44px ${MONO}`;
    g.fillStyle = 'rgba(238,241,245,0.6)';
    g.fillText('PORTFOLIO CHIPSET', 86, 500);
  });
  const { chipset } = L;
  part({ name: 'Chipset', spec: 'Controlador de E/S · 28 linhas PCIe', desc: 'Distribui dados entre USB, SATA, áudio e rede.' }, [
    keep(mesh(new THREE.BoxGeometry(0.55, 0.06, 0.45), [M.sink, M.sink, new THREE.MeshStandardMaterial({ map: chipTex, metalness: 0.8, roughness: 0.4 }), M.sink, M.sink, M.sink], [chipset.x, 0.05, chipset.z])),
    keep(box(0.012, 0.012, 0.42, M.rgb, [chipset.x - 0.28, 0.06, chipset.z], undefined, 0.004)),
    keep(box(0.53, 0.012, 0.012, M.rgb, [chipset.x, 0.06, chipset.z + 0.23], undefined, 0.004)),
    box(0.5, 0.02, 0.4, M.sinkLight, [chipset.x, 0.012, chipset.z]),
  ]);

  /* ---------------- Rear I/O ---------------- */
  const io = [];
  const port = (z, y, h, d, insert, w = 0.18) => {
    io.push(box(w, h, d, M.steel, [-1.47, 0.02 + y + h / 2, z], undefined, 0.004));
    io.push(box(0.01, h * 0.75, d * 0.8, M.hole, [-1.56, 0.02 + y + h / 2, z]));
    if (insert) io.push(box(0.012, h * 0.22, d * 0.6, insert, [-1.558, 0.02 + y + h * 0.42, z]));
  };
  for (const z of [-1.08, -1.0]) io.push(cyl(0.022, 0.08, M.gold, [-1.52, 0.06, z], 'x', 16));
  port(-0.87, 0, 0.07, 0.07, M.portBlue); port(-0.87, 0.08, 0.07, 0.07, M.portBlue);
  port(-0.76, 0, 0.07, 0.07, M.portRed); port(-0.76, 0.08, 0.07, 0.07, M.portRed);
  port(-0.66, 0, 0.04, 0.04, M.plastic); port(-0.66, 0.06, 0.04, 0.04, M.plastic);
  port(-0.53, 0, 0.14, 0.09, null);
  const lanG = new THREE.MeshStandardMaterial({ color: 0x062b06, emissive: 0x3dff6a, emissiveIntensity: 0 });
  const lanO = new THREE.MeshStandardMaterial({ color: 0x2b1500, emissive: 0xffa21f, emissiveIntensity: 0 });
  io.push(keep(box(0.006, 0.014, 0.018, lanG, [-1.565, 0.145, -0.56])), keep(box(0.006, 0.014, 0.018, lanO, [-1.565, 0.145, -0.5])));
  blink.push(lanG, lanO);
  port(-0.41, 0, 0.05, 0.08, null); port(-0.32, 0, 0.06, 0.08, null);
  port(-0.21, 0, 0.07, 0.07, M.portBlue); port(-0.21, 0.08, 0.07, 0.07, M.portBlue);
  const jackColors = [0x3fb950, 0x4aa3ff, 0xff6fae, 0xf2c94c, 0x9aa1ab];
  jackColors.forEach((c, i) => {
    const y = 0.05 + (i % 3) * 0.06, z = -0.08 + Math.floor(i / 3) * 0.06;
    io.push(box(0.14, 0.055, 0.055, M.plastic, [-1.48, y, z], undefined, 0.006));
    io.push(cyl(0.016, 0.012, new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }), [-1.555, y, z], 'x', 16));
    io.push(cyl(0.008, 0.014, M.hole, [-1.56, y, z], 'x', 12));
  });
  io.push(box(0.012, 0.18, 1.18, M.darkSteel, [-1.535, 0.09, -0.55], undefined, 0.002));
  part({ name: 'Painel de I/O traseiro', spec: '10 USB · 2,5 GbE · Wi-Fi 7 · HDMI · DP', desc: 'Todas as conexões com o mundo. Clique para ver o contato.', section: 5, kind: 'io' }, io);

  const shroudTex2 = canvasTex(512, 1600, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#2a2e35');
    grd.addColorStop(1, '#16181c');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 4;
    for (let y = 0; y < h; y += 26) {
      g.beginPath();
      g.moveTo(40, y);
      g.lineTo(w - 40, y + 60);
      g.stroke();
    }
    g.save();
    g.translate(w / 2 + 40, h - 120);
    g.rotate(-Math.PI / 2);
    g.fillStyle = '#eef1f5';
    g.font = `700 120px ${SANS}`;
    g.fillText('PORTFOLIO', 0, 0);
    g.font = `500 40px ${MONO}`;
    g.fillStyle = 'rgba(238,241,245,0.55)';
    g.fillText('X1 · CONNECT', 6, 70);
    g.restore();
  });
  const shroud = part({ name: 'Cobertura do I/O', spec: 'Alumínio + iluminação ARGB', desc: 'Protege o painel traseiro. Clique para ver o contato.', section: 5, kind: 'io' }, [
    keep(mesh(new THREE.BoxGeometry(0.3, 0.3, 1.12), [M.sink, M.sink, new THREE.MeshStandardMaterial({ map: shroudTex2, metalness: 0.7, roughness: 0.4 }), M.sink, M.sink, M.sink], [-1.35, 0.15, -0.6])),
    keep(box(0.012, 0.012, 1.08, M.rgb, [-1.2, 0.3, -0.6], undefined, 0.004)),
    box(0.04, 0.29, 0.04, M.sinkLight, [-1.215, 0.145, -0.04]),
  ], [-1.35, 0.15, -0.6]);
  install(shroud, [0, 0.5, 0], [0, 0, 0.18], S(5, 0.05, 0.55));

  const antenna = part({ name: 'Antena Wi-Fi', spec: '2 × 2 MIMO', desc: 'Conectividade sem fio.', section: 5, kind: 'io' }, [
    box(0.22, 0.04, 0.16, M.plastic, [-1.9, 0.02, -1.04], undefined, 0.02),
    ...[-0.06, 0.06].map((dz) => cyl(0.014, 0.5, M.plastic, [-1.9, 0.27, -1.04 + dz], 'y', 12)),
    cyl(0.004, 0.32, M.gold, [-1.75, 0.03, -1.04], 'x', 8),
  ], [-1.9, 0.02, -1.04]);
  install(antenna, [0, 0.5, 0], [0.2, 0.5, 0], S(5, 0.3, 0.8));

  /* ---------------- Connectors & headers ---------------- */
  const atx = [box(0.12, 0.13, 0.53, M.plastic, [L.atx.x, 0.065, L.atx.z], undefined, 0.006)];
  for (let i = 0; i < 24; i++) atx.push(box(0.03, 0.004, 0.03, M.hole, [L.atx.x + (i % 2 ? 0.025 : -0.025), 0.131, L.atx.z - 0.24 + Math.floor(i / 2) * 0.043]));
  part({ name: 'Conector ATX 24 pinos', spec: '3,3 V · 5 V · 12 V', desc: 'Entrada principal de energia da fonte.' }, atx);

  const sata = [];
  for (let i = 0; i < 4; i++) {
    const z = 0.5 + Math.floor(i / 2) * 0.17, y = (i % 2) * 0.05;
    sata.push(box(0.12, 0.045, 0.1, M.plastic, [1.44, 0.024 + y, z], undefined, 0.004));
    sata.push(box(0.01, 0.02, 0.07, M.hole, [1.505, 0.024 + y, z]));
  }
  part({ name: 'Portas SATA', spec: '4 × 6 Gb/s', desc: 'Para HDs e SSDs de 2,5".' }, sata);

  const pins = [];
  const header = (x, z, cols, rows, label, base = M.plastic) => {
    const out = [box(cols * 0.025 + 0.01, 0.01, rows * 0.025 + 0.01, base, [x, 0.005, z])];
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      out.push(box(0.006, 0.06, 0.006, M.gold, [x - ((cols - 1) * 0.025) / 2 + c * 0.025, 0.03, z - ((rows - 1) * 0.025) / 2 + r * 0.025], undefined, 0.001));
    }
    pins.push([label, out]);
  };
  header(1.13, 1.12, 5, 2, ['Painel frontal', 'Power · Reset · LEDs', 'Liga os botões do gabinete.']);
  header(0.55, 1.12, 5, 2, ['Header USB 2.0', '2 portas', 'Portas USB frontais.']);
  header(0.28, 1.12, 5, 2, ['Header USB 2.0', '2 portas', 'Portas USB frontais.']);
  header(-0.02, 1.12, 4, 1, ['Header ARGB', '5 V · 3 pinos', 'Controla fitas de LED endereçáveis.']);
  for (const [label, children] of pins) part({ name: label[0], spec: label[1], desc: label[2] }, children);

  const fanHeader = (x, z, name) =>
    part({ name, spec: '4 pinos · PWM', desc: 'Controle de velocidade de ventoinha.' }, [
      box(0.1, 0.05, 0.04, M.plasticWhite, [x, 0.025, z], undefined, 0.004),
      ...Array.from({ length: 4 }, (_, i) => box(0.006, 0.04, 0.006, M.gold, [x - 0.036 + i * 0.024, 0.03, z], undefined, 0.001)),
    ]);
  fanHeader(0.38, -1.13, 'CPU_FAN');
  fanHeader(0.7, -1.13, 'AIO_PUMP');
  fanHeader(1.0, -1.13, 'SYS_FAN1');
  fanHeader(1.43, 1.05, 'SYS_FAN2');

  part({ name: 'Header USB 3.2', spec: '19 pinos · 10 Gb/s', desc: 'USB rápido no painel frontal.' }, [
    box(0.08, 0.06, 0.2, M.plastic, [1.44, 0.03, 0.18], undefined, 0.004),
    box(0.04, 0.01, 0.16, M.hole, [1.44, 0.061, 0.18]),
  ]);

  const btn = (x, z, mat, name, spec) =>
    part({ name, spec, desc: 'Botão integrado para testar a placa fora do gabinete.' }, [
      box(0.07, 0.03, 0.07, M.plastic, [x, 0.015, z], undefined, 0.006),
      keep(box(0.05, 0.02, 0.05, mat, [x, 0.035, z], undefined, 0.01)),
    ]);
  const powerMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2244, emissiveIntensity: 0.8, roughness: 0.4 });
  btn(1.2, -1.15, powerMat, 'Botão Power', 'Liga a placa');
  btn(1.33, -1.15, M.plasticGrey, 'Botão Reset', 'Reinicia');

  // Q-code + debug LEDs
  const qCanvas = document.createElement('canvas');
  qCanvas.width = 256;
  qCanvas.height = 160;
  const qTex = new THREE.CanvasTexture(qCanvas);
  qTex.colorSpace = THREE.SRGBColorSpace;
  const qMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: qTex, emissiveIntensity: 1.6 });
  part({ name: 'Display Q-Code', spec: 'Diagnóstico de POST', desc: 'Mostra em que etapa da inicialização a placa está.' }, [
    box(0.16, 0.03, 0.11, M.plastic, [L.qcode.x, 0.015, L.qcode.z], undefined, 0.006),
    keep(mesh(new THREE.BoxGeometry(0.13, 0.002, 0.08), qMat, [L.qcode.x, 0.031, L.qcode.z])),
  ]);
  const dbg = [];
  ['CPU', 'DRAM', 'VGA', 'BOOT'].forEach((k, i) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x220a0a, emissive: [0xff3344, 0xffb020, 0xffffff, 0x33ff88][i], emissiveIntensity: 0 });
    leds[k] = m;
    dbg.push(keep(box(0.02, 0.012, 0.012, m, [1.42, 0.006, -0.88 + i * 0.03], undefined, 0.003)));
  });
  part({ name: 'LEDs de diagnóstico', spec: 'CPU · DRAM · VGA · BOOT', desc: 'Acendem conforme cada componente é detectado.' }, dbg);

  part({ name: 'Bateria CMOS', spec: 'Bateria de lítio · 3 V', desc: 'Mantém relógio e configurações da BIOS com a placa desligada.' }, [
    cyl(0.11, 0.012, M.plastic, [L.cmos.x, 0.006, L.cmos.z], 'y', 32),
    cyl(0.1, 0.032, M.steel, [L.cmos.x, 0.028, L.cmos.z], 'y', 40),
    box(0.04, 0.03, 0.06, M.steel, [L.cmos.x + 0.11, 0.03, L.cmos.z], undefined, 0.004),
  ]);
  part({ name: 'Chip da BIOS', spec: '256 Mbit SPI Flash', desc: 'Firmware que inicializa tudo. Com botão de flashback.' }, [
    box(0.06, 0.012, 0.05, M.ic, [0.1, 0.006, 1.0]),
    ...Array.from({ length: 8 }, (_, i) => box(0.004, 0.006, 0.014, M.steel, [0.078 + (i % 4) * 0.015, 0.003, 1.0 + (i < 4 ? -0.032 : 0.032)])),
    box(0.04, 0.025, 0.04, M.plastic, [0.2, 0.0125, 1.0]),
  ]);

  // Audio
  const audio = [
    keep(box(0.09, 0.012, 0.09, M.ic, [L.audio.x, 0.006, L.audio.z])),
    box(0.05, 0.012, 0.03, M.ic, [L.audio.x + 0.12, 0.006, L.audio.z - 0.08]),
  ];
  for (let i = 0; i < 8; i++) {
    const x = L.audio.x - 0.2 + (i % 4) * 0.08, z = L.audio.z + (i < 4 ? -0.14 : 0.13);
    audio.push(cyl(0.022, 0.05, M.audioCap, [x, 0.025, z], 'y', 16), cyl(0.021, 0.004, M.capTop, [x, 0.051, z], 'y', 16));
  }
  part({ name: 'Codec de áudio', spec: '7.1 canais · 120 dB SNR', desc: 'Capacitores dourados e PCB isolada para som limpo.' }, audio);

  // Misc controllers
  const icDot = (x, z, s, name, spec, desc) =>
    part({ name, spec, desc }, [box(s, 0.01, s, M.ic, [x, 0.005, z], undefined, 0.002), cyl(0.004, 0.002, M.sinkLight, [x - s * 0.3, 0.011, z - s * 0.3], 'y', 8)]);
  icDot(-0.95, 0.35, 0.08, 'Controlador de rede', '2,5 GbE', 'Conecta a placa à internet.');
  icDot(1.05, 0.25, 0.09, 'Super I/O', 'Sensores e ventoinhas', 'Monitora temperaturas e controla as ventoinhas.');
  icDot(-0.15, 0.95, 0.06, 'Gerador de clock', 'BCLK 100 MHz', 'O metrônomo que sincroniza o sistema.');
  icDot(1.15, -0.45, 0.07, 'Controlador ARGB', '5 V endereçável', 'Coordena toda a iluminação da placa.');

  /* ---------------- SMD scatter ---------------- */
  const keepOut = [
    [L.cpu.x, L.cpu.z, 0.8, 0.82], [-0.48, -1.0, 1.32, 0.32], [-1.08, -0.42, 0.34, 1.0], [-1.37, -0.6, 0.36, 1.25],
    [0.38, L.dimmZ, 0.55, 1.5], [L.pcie1.x, L.pcie1.z, 1.0, 0.1], [L.pcie2.x, L.pcie2.z, 1.0, 0.1], [L.pciex1.x, L.pciex1.z, 0.32, 0.1],
    [L.m2.x, L.m2.z, 0.92, 0.28], [L.chipset.x, L.chipset.z, 0.6, 0.5], [L.cmos.x, L.cmos.z, 0.26, 0.26], [L.audio.x, L.audio.z, 0.5, 0.4],
    [L.atx.x, L.atx.z, 0.16, 0.6], [1.43, 0.6, 0.18, 0.4], [0.6, 1.12, 1.4, 0.1], [L.qcode.x, L.qcode.z, 0.4, 0.2], [0.7, -1.13, 0.8, 0.1],
    [0.38, 0.46, 1.0, 0.18],
  ];
  const free = (x, z) => keepOut.every(([cx, cz, w, h]) => Math.abs(x - cx) > w / 2 || Math.abs(z - cz) > h / 2);
  const smd = (count, geo, mat, name, spec, desc) => {
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
    let n = 0, tries = 0;
    while (n < count && tries++ < count * 20) {
      // Cluster parts along routing channels: pick a random seed point, then a short row.
      const x = (Math.random() - 0.5) * (BOARD.w - 0.12), z = (Math.random() - 0.5) * (BOARD.h - 0.12);
      const row = 1 + Math.floor(Math.random() * 5), along = Math.random() < 0.5;
      for (let k = 0; k < row && n < count; k++) {
        const px = x + (along ? k * 0.022 : 0), pz = z + (along ? 0 : k * 0.022);
        if (!free(px, pz) || Math.abs(px) > 1.48 || Math.abs(pz) > 1.18) continue;
        e.set(0, along ? 0 : Math.PI / 2, 0);
        m4.compose(new THREE.Vector3(px, geo.parameters?.height / 2 || 0.004, pz), q.setFromEuler(e), s);
        inst.setMatrixAt(n++, m4);
      }
    }
    inst.count = n;
    inst.castShadow = false;
    inst.receiveShadow = true;
    return part({ name, spec, desc }, [inst]);
  };
  smd(Math.round(900 * SMD), new THREE.BoxGeometry(0.012, 0.006, 0.006), M.ic, 'Resistores SMD', '0402 · milhares na placa', 'Componentes minúsculos que controlam a corrente.');
  smd(Math.round(700 * SMD), new THREE.BoxGeometry(0.01, 0.007, 0.006), new THREE.MeshStandardMaterial({ color: 0xa47c52, roughness: 0.6 }), 'Capacitores cerâmicos SMD', 'MLCC 0402', 'Filtram ruídos elétricos de alta frequência.');
  smd(Math.round(160 * SMD), new THREE.BoxGeometry(0.03, 0.01, 0.03), M.ic, 'MOSFETs e reguladores', 'Conversão de energia', 'Pequenos chips de chaveamento espalhados pela placa.');

  /* ---------------- Finish ---------------- */
  for (const g of parts) {
    mergePart(g);
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.part = g;
      if (!o.isInstancedMesh) o.castShadow = true;
      o.receiveShadow = true;
    });
  }
  const meshes = [];
  root.traverse((o) => o.isMesh && meshes.push(o));

  /* ---------------- Runtime helpers ---------------- */
  const seg = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd', A: 'abcefg', b: 'fgedc', C: 'afed', d: 'bgedc', E: 'afged', F: 'afge', '-': 'g' };
  let lastCode = '';
  function setCode(code) {
    if (code === lastCode) return;
    lastCode = code;
    const g = qCanvas.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 160);
    [...code].forEach((ch, i) => {
      const ox = 30 + i * 110, oy = 18, w = 80, h = 124, t = 13;
      const on = seg[ch] || '';
      const S2 = {
        a: [ox + t, oy, w - 2 * t, t], d: [ox + t, oy + h - t, w - 2 * t, t], g: [ox + t, oy + h / 2 - t / 2, w - 2 * t, t],
        f: [ox, oy + t, t, h / 2 - t], b: [ox + w - t, oy + t, t, h / 2 - t], e: [ox, oy + h / 2, t, h / 2 - t], c: [ox + w - t, oy + h / 2, t, h / 2 - t],
      };
      for (const [k, r] of Object.entries(S2)) {
        g.fillStyle = on.includes(k) ? '#ff3b30' : 'rgba(255,59,48,0.08)';
        g.fillRect(...r);
      }
    });
    qTex.needsUpdate = true;
  }
  setCode('--');

  return { root, parts, meshes, installs, fans, ram, leds, blink, setCode, M };
}
