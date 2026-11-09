import * as THREE from 'three';

/*
 * Board space: the motherboard lies in the XZ plane with its top surface at y = 0.
 * x → right, z → towards the bottom edge (PCIe side), y → up off the board.
 * 1 unit = 10 cm (ATX = 30.5 × 24.4 cm). The whole board is later stood upright.
 */
export const BOARD = { w: 3.05, h: 2.44, t: 0.016 };

export const L = {
  cpu: { x: -0.42, z: -0.36 },
  dimmX: [0.17, 0.31, 0.45, 0.59],
  dimmZ: -0.415,
  pcie1: { x: -0.62, z: 0.42 },
  pcie2: { x: -0.62, z: 0.98 },
  pciex1: { x: -0.85, z: 0.7 },
  m2: { x: -0.6, z: 0.14 },
  chipset: { x: 0.78, z: 0.72 },
  cmos: { x: 0.26, z: 0.62 },
  audio: { x: -1.15, z: 0.95 },
  atx: { x: 1.38, z: -0.35 },
  qcode: { x: 1.27, z: -0.98 },
};

/** Groups used to light trace pulses per chapter. */
export const G = { MISC: 0, CPU: 1, RAM: 2, GPU: 3, SSD: 4, IO: 5 };

/* ------------------------------------------------------------------ */
/* Trace routing                                                       */
/* ------------------------------------------------------------------ */

function chamfer(pts, c) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1];
    const d1 = Math.hypot(bx - ax, bz - az), d2 = Math.hypot(cx - bx, cz - bz);
    const k = Math.min(c, d1 / 2, d2 / 2);
    out.push([bx - ((bx - ax) / d1) * k, bz - ((bz - az) / d1) * k], [bx + ((cx - bx) / d2) * k, bz + ((cz - bz) / d2) * k]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function offsetPolyline(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const prev = i > 0 ? norm(p[0] - a[0], p[1] - a[1]) : null;
    const next = i < n - 1 ? norm(b[0] - p[0], b[1] - p[1]) : null;
    const t = prev && next ? norm(prev[0] + next[0], prev[1] + next[1]) : prev || next;
    const nrm = [-t[1], t[0]];
    let scale = 1;
    if (prev && next) scale = 1 / Math.max(0.5, nrm[0] * -prev[1] + nrm[1] * prev[0]);
    return [p[0] + nrm[0] * d * scale, p[1] + nrm[1] * d * scale];
  });
}
const norm = (x, z) => {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
};

/** A bundle of `n` parallel traces following `path`. */
function bus(path, n, pitch, group, width = 0.0035) {
  const center = chamfer(path, 0.05);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ pts: offsetPolyline(center, (i - (n - 1) / 2) * pitch), group, width });
  return out;
}

let seed = 17;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

export function routeTraces() {
  const { cpu, dimmX, m2, pcie1, chipset, audio } = L;
  const T = [];
  // CPU ⇄ memory: two channels, out of the right side of the socket, under the DIMMs.
  T.push(...bus([[cpu.x + 0.3, cpu.z - 0.2], [0.05, cpu.z - 0.2], [0.05, -0.95], [0.66, -0.95]], 14, 0.012, G.RAM));
  T.push(...bus([[cpu.x + 0.3, cpu.z + 0.06], [0.05, cpu.z + 0.06], [0.05, 0.12], [0.66, 0.12]], 14, 0.012, G.RAM));
  for (const x of dimmX) T.push(...bus([[x, -0.95], [x, 0.12]], 3, 0.02, G.RAM, 0.0025));
  // CPU → PCIe x16 (GPU)
  T.push(...bus([[cpu.x - 0.05, cpu.z + 0.33], [cpu.x - 0.05, 0.3], [pcie1.x, 0.3], [pcie1.x, pcie1.z]], 16, 0.011, G.GPU));
  // CPU → M.2 (SSD)
  T.push(...bus([[cpu.x - 0.2, cpu.z + 0.33], [cpu.x - 0.2, 0.02], [m2.x - 0.3, 0.02], [m2.x - 0.3, m2.z]], 8, 0.012, G.SSD));
  // CPU → chipset (DMI)
  T.push(...bus([[cpu.x + 0.2, cpu.z + 0.33], [cpu.x + 0.2, 0.28], [0.4, 0.28], [0.4, chipset.z - 0.1], [chipset.x - 0.27, chipset.z - 0.1]], 8, 0.012, G.CPU));
  // CPU → rear I/O
  T.push(...bus([[cpu.x - 0.31, cpu.z - 0.1], [-1.2, cpu.z - 0.1], [-1.2, -0.7], [-1.45, -0.7]], 10, 0.012, G.IO));
  T.push(...bus([[cpu.x - 0.31, cpu.z + 0.12], [-1.25, cpu.z + 0.12], [-1.25, -0.15], [-1.45, -0.15]], 8, 0.012, G.IO));
  // chipset fan-out: SATA, USB headers, audio, LAN
  T.push(...bus([[chipset.x + 0.27, chipset.z - 0.05], [1.3, chipset.z - 0.05], [1.3, 0.5], [1.45, 0.5]], 8, 0.012, G.SSD));
  T.push(...bus([[chipset.x, chipset.z + 0.22], [chipset.x, 1.08], [1.15, 1.08]], 6, 0.012, G.IO));
  T.push(...bus([[chipset.x - 0.27, chipset.z + 0.1], [0.3, chipset.z + 0.1], [0.3, 1.18], [audio.x + 0.25, 1.18], [audio.x + 0.25, audio.z]], 6, 0.012, G.IO));
  T.push(...bus([[chipset.x - 0.2, chipset.z + 0.22], [chipset.x - 0.2, 1.12], [-0.1, 1.12], [-0.1, 0.98]], 4, 0.012, G.GPU));
  // VRM power feeds (wide)
  for (let i = 0; i < 6; i++) T.push({ pts: [[-0.85 + i * 0.12, -0.78], [-0.85 + i * 0.12, cpu.z - 0.33]], group: G.CPU, width: 0.02 });
  for (let i = 0; i < 5; i++) T.push({ pts: [[-0.86, -0.62 + i * 0.12], [cpu.x - 0.31, -0.62 + i * 0.12]], group: G.CPU, width: 0.02 });
  T.push(...bus([[1.33, -0.35], [1.0, -0.35], [1.0, -0.7], [0.75, -0.7]], 6, 0.018, G.CPU, 0.008));
  // Random short stubs for texture
  for (let i = 0; i < 260; i++) {
    const x = (rnd() - 0.5) * BOARD.w * 0.92, z = (rnd() - 0.5) * BOARD.h * 0.92;
    const l1 = 0.03 + rnd() * 0.12, l2 = 0.02 + rnd() * 0.08;
    const dx = rnd() < 0.5 ? -1 : 1, dz = rnd() < 0.5 ? -1 : 1;
    const pts = rnd() < 0.5 ? [[x, z], [x + dx * l1, z], [x + dx * l1, z + dz * l2]] : [[x, z], [x, z + dz * l1], [x + dx * l2, z + dz * l1]];
    T.push({ pts: chamfer(pts, 0.012), group: G.MISC, width: 0.002, stub: true });
  }
  return T;
}

/* ------------------------------------------------------------------ */
/* PCB texture                                                         */
/* ------------------------------------------------------------------ */

export function makePCBTexture(traces, renderer) {
  const W = 4096, H = Math.round((4096 * BOARD.h) / BOARD.w);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const px = (x) => ((x + BOARD.w / 2) / BOARD.w) * W;
  const pz = (z) => ((z + BOARD.h / 2) / BOARD.h) * H;
  const S = W / BOARD.w;

  g.fillStyle = '#0c0f12';
  g.fillRect(0, 0, W, H);
  // Ground-plane hatching
  g.strokeStyle = 'rgba(255,255,255,0.018)';
  g.lineWidth = 1;
  for (let i = -H; i < W; i += 14) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + H, H);
    g.stroke();
  }
  // Via field
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W, y = rnd() * H;
    g.fillStyle = '#1b2228';
    g.beginPath();
    g.arc(x, y, 3.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#05070a';
    g.beginPath();
    g.arc(x, y, 1.3, 0, Math.PI * 2);
    g.fill();
  }
  // Traces
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const t of traces) {
    g.strokeStyle = t.width > 0.01 ? '#1a2128' : t.stub ? '#161d22' : '#1d272f';
    g.lineWidth = Math.max(2, t.width * S);
    g.beginPath();
    t.pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
    g.stroke();
    for (const [x, z] of [t.pts[0], t.pts[t.pts.length - 1]]) {
      if (t.width > 0.01) continue;
      g.fillStyle = '#a07f3a';
      g.beginPath();
      g.arc(px(x), pz(z), 4.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#05070a';
      g.beginPath();
      g.arc(px(x), pz(z), 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Silkscreen
  const silk = 'rgba(214,220,228,0.78)';
  g.strokeStyle = silk;
  g.fillStyle = silk;
  const rect = (x, z, w, h, label, size = 26, where = 'tl') => {
    g.lineWidth = 3;
    g.strokeRect(px(x - w / 2), pz(z - h / 2), w * S, h * S);
    if (!label) return;
    g.font = `600 ${size}px "JetBrains Mono", monospace`;
    const tx = where.includes('r') ? px(x + w / 2) - g.measureText(label).width : px(x - w / 2);
    const ty = where.includes('b') ? pz(z + h / 2) + size + 6 : pz(z - h / 2) - 10;
    g.fillText(label, tx, ty);
  };
  const corners = (x, z, w, h, k = 0.04) => {
    g.lineWidth = 4;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = px(x + (sx * w) / 2), cz = pz(z + (sz * h) / 2);
      g.beginPath();
      g.moveTo(cx - sx * k * S, cz);
      g.lineTo(cx, cz);
      g.lineTo(cx, cz - sz * k * S);
      g.stroke();
    }
  };
  corners(L.cpu.x, L.cpu.z, 0.7, 0.74);
  g.font = '600 30px "JetBrains Mono", monospace';
  g.fillText('CPU1 · LGA-X1', px(L.cpu.x - 0.35), pz(L.cpu.z + 0.37) + 40);
  L.dimmX.forEach((x, i) => {
    g.font = '600 22px "JetBrains Mono", monospace';
    g.save();
    g.translate(px(x) + 6, pz(0.36));
    g.rotate(-Math.PI / 2);
    g.fillText(['DIMM_A1', 'DIMM_A2', 'DIMM_B1', 'DIMM_B2'][i], 0, 0);
    g.restore();
  });
  rect(L.pcie1.x, L.pcie1.z, 0.92, 0.08, 'PCIEX16_1', 26, 'tl');
  rect(L.pcie2.x, L.pcie2.z, 0.92, 0.08, 'PCIEX16_2 (X4)', 26, 'tl');
  rect(L.pciex1.x, L.pciex1.z, 0.28, 0.08, 'PCIEX1_1', 22, 'tl');
  rect(L.m2.x, L.m2.z, 0.86, 0.22, 'M.2_1 · PCIe 5.0 x4', 26, 'tl');
  rect(L.cmos.x, L.cmos.z, 0.24, 0.24, 'BAT1', 22, 'tl');
  rect(L.atx.x, L.atx.z, 0.12, 0.56, 'ATX_PWR', 22, 'tr');
  rect(L.audio.x, L.audio.z, 0.5, 0.42, 'HD AUDIO', 24, 'tl');
  rect(1.42, 0.65, 0.14, 0.42, 'SATA6G', 22, 'tr');
  rect(1.13, 1.12, 0.22, 0.08, 'F_PANEL', 22, 'tl');
  rect(0.55, 1.12, 0.16, 0.08, 'USB_E12', 20, 'tl');
  rect(0.28, 1.12, 0.16, 0.08, 'USB_E34', 20, 'tl');
  rect(-0.02, 1.12, 0.14, 0.08, 'ARGB_1', 20, 'tl');
  rect(0.38, -1.13, 0.12, 0.06, 'CPU_FAN', 20, 'tl');
  rect(0.7, -1.13, 0.12, 0.06, 'AIO_PUMP', 20, 'tl');
  rect(1.0, -1.13, 0.12, 0.06, 'SYS_FAN1', 20, 'tl');
  rect(1.43, 1.05, 0.08, 0.12, 'FAN2', 20, 'tr');
  rect(-0.45, -1.15, 0.5, 0.08, 'EATX12V_1 · EATX12V_2', 20, 'tl');
  // Audio isolation line
  g.save();
  g.strokeStyle = 'rgba(244,201,93,0.55)';
  g.lineWidth = 5;
  g.setLineDash([22, 12]);
  g.strokeRect(px(L.audio.x - 0.32), pz(L.audio.z - 0.27), 0.64 * S, 0.5 * S);
  g.restore();

  // Brand block
  g.font = '700 74px "Space Grotesk", sans-serif';
  g.fillStyle = 'rgba(232,236,242,0.9)';
  g.fillText('PORTFOLIO X1', px(0.15), pz(0.42));
  g.font = '500 30px "JetBrains Mono", monospace';
  g.fillStyle = 'rgba(214,220,228,0.6)';
  g.fillText('REV 1.0 · DESIGNED IN SÃO PAULO', px(0.15), pz(0.42) + 46);
  g.font = '500 22px "JetBrains Mono", monospace';
  g.fillText('ATX · 30.5 × 24.4 cm · 8-LAYER PCB · 2 oz COPPER', px(-1.45), pz(1.17));

  // Mounting holes
  for (const [x, z] of HOLES) {
    g.fillStyle = '#b8954a';
    g.beginPath();
    g.arc(px(x), pz(z), 0.032 * S, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#07090b';
    g.beginPath();
    g.arc(px(x), pz(z), 0.017 * S, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

export const HOLES = [
  [-1.37, -1.06], [0.12, -1.06], [1.43, -1.06],
  [-1.37, 0.2], [0.12, 0.2], [1.43, 0.2],
  [-1.37, 1.13], [0.12, 1.13], [1.43, 1.13],
];

/* ------------------------------------------------------------------ */
/* Animated data pulses                                                */
/* ------------------------------------------------------------------ */

export function makePulses(traces) {
  const pos = [], dist = [], side = [], grp = [], sd = [], idx = [];
  let v = 0;
  for (const t of traces) {
    if (t.stub || t.width > 0.01) continue;
    let acc = 0;
    const s = Math.random() * 10;
    const w = Math.max(0.0035, t.width) * 0.9;
    for (let i = 0; i < t.pts.length; i++) {
      const [x, z] = t.pts[i];
      if (i) acc += Math.hypot(x - t.pts[i - 1][0], z - t.pts[i - 1][1]);
      const a = t.pts[Math.max(0, i - 1)], b = t.pts[Math.min(t.pts.length - 1, i + 1)];
      const [tx, tz] = norm(b[0] - a[0], b[1] - a[1]);
      for (const k of [-1, 1]) {
        pos.push(x - tz * w * k, 0.0012, z + tx * w * k);
        dist.push(acc);
        side.push(k);
        grp.push(t.group);
        sd.push(s);
      }
      if (i) idx.push(v - 2, v - 1, v, v - 1, v + 1, v);
      v += 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aDist', new THREE.Float32BufferAttribute(dist, 1));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  geo.setAttribute('aGroup', new THREE.Float32BufferAttribute(grp, 1));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
  geo.setIndex(idx);

  const uniforms = {
    uTime: { value: 0 },
    uPower: { value: 0 },
    uBoost: { value: new Array(6).fill(0) },
    uColor: { value: new THREE.Color(0x35e0ff) },
    uHot: { value: new THREE.Color(0xff3d7f) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aDist; attribute float aSide; attribute float aGroup; attribute float aSeed;
      varying float vDist; varying float vSide; varying float vSeed; varying float vBoost;
      uniform float uBoost[6];
      void main() {
        vDist = aDist; vSide = aSide; vSeed = aSeed;
        int gi = int(aGroup + 0.5);
        float b = 0.0;
        for (int i = 0; i < 6; i++) if (i == gi) b = uBoost[i];
        vBoost = b;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vDist; varying float vSide; varying float vSeed; varying float vBoost;
      uniform float uTime; uniform float uPower; uniform vec3 uColor; uniform vec3 uHot;
      void main() {
        float speed = 0.35 + vBoost * 0.55;
        float ph = fract(vDist * 2.2 - uTime * speed + vSeed);
        float head = smoothstep(0.0, 0.015, ph) * (1.0 - smoothstep(0.015, 0.16, ph));
        float ph2 = fract(vDist * 5.3 - uTime * speed * 1.6 + vSeed * 1.7);
        float head2 = smoothstep(0.0, 0.01, ph2) * (1.0 - smoothstep(0.01, 0.06, ph2));
        float edge = 1.0 - smoothstep(0.2, 1.0, abs(vSide));
        float a = (0.05 + head * (0.35 + 1.6 * vBoost) + head2 * 0.6 * vBoost) * edge * uPower;
        vec3 col = mix(uColor, uHot, clamp(vBoost * head2, 0.0, 1.0));
        gl_FragColor = vec4(col * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}
