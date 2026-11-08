import * as THREE from 'three';
import { S } from './timeline.js';
import { V, mesh, box, cyl, sphere, tube, alignY, rbox, bellows, harness, Helix, hull2 } from './kit.js';

const EZ = 1.0; // V8 crank centre (z)
const EY = 0.42; // V8 deck reference height
const CYL_Z = [-0.24, -0.08, 0.08, 0.24];
const sideM = (s) => (s < 0 ? 'esquerdo' : 'direito');
const sideF = (s) => (s < 0 ? 'esquerda' : 'direita');
const bank = (s) => `banco ${s < 0 ? 'esquerdo' : 'direito'}`;

/** Point (lx, ly) of a cylinder head / valve cover rotated by -s*0.5 around Z, translated to (cx, cy). */
function rot2(s, cx, cy, lx, ly) {
  const a = -s * 0.5;
  return [cx + lx * Math.cos(a) - ly * Math.sin(a), cy + lx * Math.sin(a) + ly * Math.cos(a)];
}

/** Group placed at `p`, its +Y aligned with `dir`, containing local children. */
function oriented(p, dir, children) {
  const g = new THREE.Group();
  g.position.set(...p);
  alignY(g, dir);
  children.forEach((c) => g.add(c));
  return g;
}

export function buildMechanics({ M, P, wheels, steer }) {
  /* ================= Chapter 1 · frunk ================= */
  P('Revestimento do porta-malas', 'Carroceria', [0, 0.5, -1.62], [{ r: S(1, 0.35, 1), o: [0, 0.95, -2.3] }], [
    box(0.86, 0.012, 0.5, M.felt, [0, 0.405, -1.62]),
    box(0.86, 0.24, 0.012, M.felt, [0, 0.52, -1.87]),
    box(0.86, 0.24, 0.012, M.felt, [0, 0.52, -1.37]),
    box(0.012, 0.24, 0.5, M.felt, [-0.43, 0.52, -1.62]),
    box(0.012, 0.24, 0.5, M.felt, [0.43, 0.52, -1.62]),
  ], { info: '230 litros de bagagem' });

  /* ================= Chapter 4 · running gear ================= */
  for (const w of wheels) {
    const { pos, s, front, where, d } = w;
    const z = pos.z;

    const cal = new THREE.Group();
    cal.position.copy(pos);
    cal.rotation.x = front ? -0.55 : 0.55;
    cal.add(box(0.075, 0.075, 0.2, M.caliper, [0, 0.17, 0], undefined, 0.025));
    cal.add(box(0.03, 0.028, 0.07, M.cast, [-s * 0.045, 0.17, 0], undefined, 0.008));
    cal.add(box(0.012, 0.05, 0.15, M.pad, [0.019, 0.16, 0]));
    cal.add(box(0.012, 0.05, 0.15, M.pad, [-0.019, 0.16, 0]));
    for (const dz of [-0.06, 0.06]) cal.add(cyl(0.008, 0.09, M.steel, [0, 0.2, dz], 'x', 8));
    P(`Pinça de freio monobloco ${where}`, 'Freios', pos.toArray(),
      [{ r: S(4, 0.12 + d, 0.6 + d), o: [s * 0.6, 0.35, front ? -0.15 : 0.15] }], [cal],
      { info: front ? 'Brembo 6 pistões + pastilhas' : 'Brembo 4 pistões + pastilhas' });

    P(`Manga de eixo e cubo ${where}`, 'Suspensão', [s * 0.66, pos.y, z], [{ r: S(4, 0.4 + d * 0.5, 0.92), o: [s * 0.7, 0.05, 0] }], [
      box(0.045, 0.34, 0.09, M.alu, [s * 0.645, pos.y + 0.02, z], undefined, 0.015),
      cyl(0.055, 0.07, M.aluBright, [s * 0.7, pos.y, z], 'x', 32),
      cyl(0.03, 0.04, M.steel, [s * 0.745, pos.y, z], 'x', 16),
      ...(front ? [box(0.03, 0.03, 0.12, M.alu, [s * 0.64, pos.y - 0.02, z + 0.08], undefined, 0.01)] : []),
      cyl(0.01, 0.035, M.plastic, [s * 0.66, pos.y - 0.06, z - 0.05], 'y', 10),
    ], { info: 'Alumínio forjado com rolamento de cubo blindado' });

    const arm = (inner, outer, y, r) => [
      tube([[s * inner, y, z - 0.17], [s * (inner + outer) / 2, y, z - 0.06], [s * outer, y, z]], r, M.cast, { radial: 8 }),
      tube([[s * inner, y, z + 0.17], [s * (inner + outer) / 2, y, z + 0.06], [s * outer, y, z]], r, M.cast, { radial: 8 }),
      cyl(0.022, 0.045, M.rubber, [s * inner, y, z - 0.17], 'z', 12),
      cyl(0.022, 0.045, M.rubber, [s * inner, y, z + 0.17], 'z', 12),
      sphere(0.02, M.steel, [s * outer, y, z]),
    ];
    P(`Bandejas double-wishbone ${where}`, 'Suspensão', [s * 0.5, 0.36, z], [{ r: S(4, 0.5, 1), o: [s * 0.45, 0.6, front ? -0.25 : 0.25] }], [
      ...arm(0.33, 0.62, 0.2, 0.012),
      ...arm(0.37, 0.61, 0.53, 0.01),
    ], { info: 'Braços triangulares em alumínio' });

    const dir = V([-s * 0.13, 0.46, 0]).normalize();
    const mid = [s * 0.485, 0.45, z];
    P(`Amortecedor magnetoreológico ${where}`, 'Suspensão', mid, [{ r: S(4, 0.3 + d * 0.5, 0.88), o: [s * 0.5, 1.05, 0] }], [
      oriented(mid, dir, [
        mesh(new THREE.TubeGeometry(new Helix(0.05, 0.22, 6.5), 260, 0.009, 8), M.spring),
        cyl(0.022, 0.3, M.heatBlue, [0, -0.04, 0], 'y', 20),
        cyl(0.009, 0.2, M.aluBright, [0, 0.13, 0], 'y', 12),
        cyl(0.06, 0.012, M.alu, [0, -0.12, 0], 'y', 28),
        cyl(0.06, 0.012, M.alu, [0, 0.12, 0], 'y', 28),
        cyl(0.04, 0.03, M.cast, [0, 0.245, 0], 'y', 20),
        cyl(0.018, 0.06, M.alu, [0.035, 0.0, 0], 'y', 12),
      ]),
    ], { info: 'Magnetorheological SCM-E com mola helicoidal' });
  }

  for (const [z, zc, name] of [[-0.98, -1.15, 'dianteira'], [1.3, 1.5, 'traseira']]) {
    const f = z < 0 ? -1 : 1;
    P(`Barra estabilizadora ${name}`, 'Suspensão', [0, 0.28, z], [{ r: S(4, 0.5, 1), o: [0, 0.75, f * 0.85] }], [
      tube([[-0.52, 0.3, zc], [-0.44, 0.28, z], [0.44, 0.28, z], [0.52, 0.3, zc]], 0.011, M.cast),
      ...[-1, 1].flatMap((s) => [
        box(0.04, 0.035, 0.04, M.rubber, [s * 0.28, 0.29, z], undefined, 0.006),
        cyl(0.007, 0.12, M.steel, [s * 0.52, 0.24, zc], 'y', 8),
        sphere(0.014, M.steel, [s * 0.52, 0.3, zc]),
      ]),
    ], { info: 'Barra tubular oca' });
  }

  // Steering rack, tie rods and column
  const colEnd = steer.center.clone().addScaledVector(steer.normal.z > 0 ? steer.normal.clone().negate() : steer.normal, 0.14);
  P('Caixa de direção e coluna', 'Direção', [0, 0.32, -1.02], [{ r: S(4, 0.3, 0.85), o: [0, 0.5, -1.25] }], [
    cyl(0.028, 0.56, M.alu, [0, 0.3, -1.02], 'x', 20),
    cyl(0.036, 0.1, M.alu, [-0.2, 0.32, -1.02], 'y', 20),
    ...[-1, 1].flatMap((s) => {
      const b = bellows(0.026, 0.016, 0.1, 6, M.rubber);
      b.position.set(s * 0.33, 0.3, -1.02);
      b.rotation.z = (s * Math.PI) / 2;
      return [
        b,
        tube([[s * 0.37, 0.3, -1.02], [s * 0.5, 0.31, -1.04], [s * 0.63, 0.33, -1.08]], 0.009, M.steel, { radial: 8 }),
        sphere(0.016, M.steel, [s * 0.63, 0.33, -1.08]),
      ];
    }),
    tube([[-0.2, 0.36, -1.02], [-0.25, 0.5, -0.86], colEnd.toArray()], 0.012, M.steel, { radial: 8 }),
    sphere(0.02, M.steel, [-0.25, 0.5, -0.86]),
    cyl(0.03, 0.12, M.plastic, colEnd.clone().lerp(V([-0.25, 0.5, -0.86]), 0.3).toArray(), 'y', 16),
  ], { info: 'Pinhão e cremalheira com assistência eletro-hidráulica' });

  // Brake hydraulics
  P('Servofreio e cilindro mestre', 'Freios', [-0.38, 0.56, -1.18], [{ r: S(4, 0.55, 1), o: [-0.45, 0.85, -0.55] }], [
    cyl(0.09, 0.08, M.cast, [-0.38, 0.55, -1.1], 'z', 32),
    cyl(0.025, 0.15, M.alu, [-0.38, 0.55, -1.22], 'z', 16),
    box(0.08, 0.06, 0.05, M.plasticWhite, [-0.38, 0.62, -1.22], undefined, 0.01),
    box(0.07, 0.045, 0.04, M.fluid, [-0.38, 0.61, -1.22], undefined, 0.008),
    cyl(0.018, 0.015, M.plastic, [-0.38, 0.657, -1.22], 'y', 14),
  ]);
  P('Módulo ABS/ESP', 'Freios', [0.3, 0.33, -1.32], [{ r: S(4, 0.6, 1), o: [0.45, 0.9, -0.55] }], [
    box(0.12, 0.09, 0.1, M.alu, [0.3, 0.33, -1.32], undefined, 0.008),
    box(0.12, 0.03, 0.1, M.plastic, [0.3, 0.39, -1.32], undefined, 0.006),
    box(0.04, 0.025, 0.03, M.plasticGrey, [0.37, 0.39, -1.32], undefined, 0.004),
    cyl(0.025, 0.05, M.cast, [0.3, 0.33, -1.39], 'z', 16),
  ], { info: 'Bosch 9.0 · controle de estabilidade e tração' });
  const lines = [tube([[-0.38, 0.55, -1.3], [-0.1, 0.42, -1.4], [0.24, 0.36, -1.36], [0.27, 0.34, -1.32]], 0.0035, M.copper, { radial: 6 })];
  for (const w of wheels) {
    const { pos, s, front } = w;
    const route = front
      ? [[0.3, 0.33, -1.32], [s * 0.35, 0.28, -1.28], [s * 0.55, 0.36, -1.2], [s * 0.64, 0.4, pos.z + 0.04]]
      : [[0.3, 0.33, -1.32], [s * 0.08, 0.2, -1.1], [s * 0.08, 0.17, 0.6], [s * 0.4, 0.26, 1.3], [s * 0.64, 0.4, pos.z - 0.04]];
    lines.push(tube(route, 0.0032, M.copper, { radial: 6 }));
    const end = route[route.length - 1];
    lines.push(tube([[end[0] - s * 0.06, end[1] - 0.03, end[2]], end], 0.006, M.hose, { radial: 8, seg: 6 }));
  }
  P('Linhas de freio', 'Freios', [0, 0.3, 0], [{ r: S(4, 0.6, 1), o: [0, 1.15, 0] }], lines, { info: 'Tubos de cuproníquel + flexíveis trançados' });

  /* ================= Chapter 5 · V8 F136 FB ================= */
  const bankZ = (s, i) => EZ + CYL_Z[i] + s * 0.015;
  const bdir = (s) => V([s * Math.SQRT1_2, Math.SQRT1_2, 0]);
  const coverN = (s) => [s * Math.sin(0.5), Math.cos(0.5), 0];

  // Intake side (top of the engine) goes first.
  P('Caixas de ar e dutos de admissão', 'Admissão', [0, EY + 0.37, EZ - 0.1], [{ r: S(5, 0, 0.42), o: [0, 1.4, -0.1] }],
    [-1, 1].flatMap((s) => [
      box(0.13, 0.07, 0.3, M.carbon, [s * 0.24, EY + 0.37, EZ - 0.1], undefined, 0.03),
      cyl(0.03, 0.012, M.alu, [s * 0.24, EY + 0.41, EZ - 0.02], 'y', 20),
      tube([[s * 0.18, EY + 0.37, EZ - 0.22], [s * 0.1, EY + 0.36, EZ - 0.36], [s * 0.05, EY + 0.3, EZ - 0.44]], 0.03, M.carbon),
      tube([[s * 0.3, EY + 0.37, EZ - 0.05], [s * 0.55, 0.72, 0.78], [s * 0.78, 0.72, 0.76]], 0.035, M.carbon),
    ]), { info: 'Fibra de carbono · tomadas de ar laterais' });

  P('Corpos de borboleta eletrônicos', 'Admissão', [0, EY + 0.3, EZ - 0.38], [{ r: S(5, 0.05, 0.48), o: [0, 1.2, -0.45] }],
    [-1, 1].flatMap((s) => [
      cyl(0.034, 0.07, M.aluBright, [s * 0.05, EY + 0.3, EZ - 0.38], 'z', 24),
      box(0.04, 0.05, 0.05, M.plastic, [s * 0.1, EY + 0.3, EZ - 0.38], undefined, 0.008),
      cyl(0.006, 0.06, M.steel, [s * 0.05, EY + 0.3, EZ - 0.38], 'x', 8),
    ]));

  P('Coletor de admissão (plenum)', 'Admissão', [0, EY + 0.29, EZ], [{ r: S(5, 0.1, 0.52), o: [0, 1.05, 0] }], [
    box(0.16, 0.08, 0.6, M.rosso, [0, EY + 0.29, EZ], undefined, 0.035),
    box(0.06, 0.004, 0.2, M.aluBright, [0, EY + 0.332, EZ], undefined, 0.002),
    ...[-1, 1].flatMap((s) => CYL_Z.map((dz) => cyl(0.022, 0.12, M.alu, [s * 0.1, EY + 0.25, EZ + dz], 'y', 16))).map((m) => {
      m.rotation.z = -Math.sign(m.position.x) * 1.0;
      return m;
    }),
  ], { info: 'Geometria variável de admissão' });

  for (const s of [-1, 1]) {
    // Ignition coils + their harness
    const coils = [];
    const n = coverN(s);
    for (let i = 0; i < 4; i++) {
      const c = [s * 0.2435, EY + 0.311, bankZ(s, i)];
      coils.push(oriented(c, n, [
        mesh(rbox(0.03, 0.075, 0.03, 0.006), M.plastic),
        mesh(rbox(0.026, 0.02, 0.034, 0.004), M.plasticGrey, [0, 0.045, 0]),
        cyl(0.012, 0.03, M.rubber, [0, -0.05, 0], 'y', 12),
      ]));
    }
    P(`Bobinas de ignição — ${bank(s)}`, 'Ignição', [s * 0.24, EY + 0.31, EZ], [{ r: S(5, 0.12, 0.55), o: [s * 0.95, 1.1, 0] }], coils,
      { info: '4 bobinas individuais (coil-on-plug)' });

    const loom = [];
    const lx = s * 0.31;
    loom.push(...harness([[lx, EY + 0.3, EZ + 0.3], [lx, EY + 0.3, EZ - 0.36], [s * 0.36, 0.6, 0.62], [s * 0.38, 0.62, 0.55]], { n: 8, tapeMat: M.tape, plugMat: M.plastic }));
    for (let i = 0; i < 4; i++) {
      const z = bankZ(s, i);
      loom.push(...harness([[lx, EY + 0.3, z], [s * 0.285, EY + 0.35, z], [s * 0.267, EY + 0.362, z]], { n: 2, r: 0.0018, plugs: false }));
    }
    P(`Chicote de ignição — ${bank(s)}`, 'Chicotes', [lx, EY + 0.3, EZ], [{ r: S(5, 0.15, 0.6), o: [s * 1.15, 1.25, 0] }], loom,
      { info: 'Fios individuais de cada bobina até a central' });

    // Fuel rail + injectors
    const rail = [cyl(0.011, 0.6, M.aluBright, [s * 0.115, EY + 0.24, EZ], 'z', 14)];
    for (let i = 0; i < 4; i++) {
      const z = bankZ(s, i);
      const inj = cyl(0.008, 0.055, M.plastic, [s * 0.125, EY + 0.205, z], 'y', 12);
      inj.rotation.z = -s * 0.35;
      rail.push(inj, cyl(0.004, 0.03, M.plasticGrey, [s * 0.13, EY + 0.175, z], 'y', 8));
    }
    P(`Flauta e bicos injetores — ${bank(s)}`, 'Alimentação', [s * 0.12, EY + 0.23, EZ], [{ r: S(5, 0.18, 0.62), o: [s * 0.55, 0.9, 0.2] }], rail,
      { info: 'Injeção direta a 200 bar' });

    // Valve cover
    const [vx, vy] = [s * 0.21, EY + 0.25];
    P(`Tampa de válvulas — ${bank(s)}`, 'Motor', [vx, vy, EZ], [{ r: S(5, 0.2, 0.62), o: [s * 0.8, 0.85, 0] }], [
      mesh(rbox(0.14, 0.06, 0.62, 0.025), M.rosso, [vx, vy, EZ], [0, 0, -s * 0.5]),
      ...[-0.27, 0.27].map((dz) => mesh(rbox(0.06, 0.012, 0.06, 0.004), M.aluBright, [vx, vy + 0.03, EZ + dz], [0, 0, -s * 0.5])),
    ], { info: 'Vermelho Ferrari, como manda a tradição' });

    // Spark plugs
    const plugs = [];
    for (let i = 0; i < 4; i++) {
      const c = [s * 0.2, EY + 0.232, bankZ(s, i)];
      plugs.push(oriented(c, n, [
        cyl(0.007, 0.05, M.ceramic, [0, 0.015, 0], 'y', 12),
        cyl(0.011, 0.012, M.steel, [0, -0.015, 0], 'y', 6),
        cyl(0.007, 0.025, M.zinc, [0, -0.035, 0], 'y', 10),
      ]));
    }
    P(`Velas de ignição — ${bank(s)}`, 'Ignição', [s * 0.2, EY + 0.23, EZ], [{ r: S(5, 0.25, 0.68), o: [s * 0.65, 1.35, 0] }], plugs,
      { info: 'Ponta de irídio' });

    // Camshafts (2 per bank, DOHC)
    const cams = [];
    for (const lx2 of [-0.035, 0.035]) {
      const [cx, cy] = rot2(s, s * 0.17, EY + 0.17, lx2, 0.074);
      cams.push(cyl(0.012, 0.62, M.steel, [cx, cy, EZ], 'z', 12));
      for (let i = 0; i < 4; i++) {
        for (const dz of [-0.025, 0.025]) {
          const lobe = mesh(rbox(0.03, 0.022, 0.012, 0.008), M.aluBright, [cx, cy, bankZ(s, i) + dz]);
          lobe.rotation.z = i * 1.3 + dz * 40;
          cams.push(lobe);
        }
      }
      cams.push(cyl(0.035, 0.012, M.steel, [cx, cy, EZ - 0.33], 'z', 24));
    }
    P(`Comandos de válvulas — ${bank(s)}`, 'Motor', [s * 0.17, EY + 0.24, EZ], [{ r: S(5, 0.3, 0.75), o: [s * 0.55, 0.7, 0.15] }], cams,
      { info: 'Duplo comando com variador contínuo de fase' });

    // Cylinder head
    P(`Cabeçote — ${bank(s)}`, 'Motor', [s * 0.17, EY + 0.17, EZ], [{ r: S(5, 0.35, 0.8), o: [s * 0.45, 0.5, 0] }], [
      mesh(rbox(0.16, 0.12, 0.64, 0.02), M.alu, [s * 0.17, EY + 0.17, EZ], [0, 0, -s * 0.5]),
    ], { info: '4 válvulas por cilindro' });

    // Headers + lambda sensors
    const headers = [];
    for (let i = 0; i < 4; i++) {
      const z = bankZ(s, i);
      headers.push(tube([[s * 0.27, EY + 0.1, z], [s * 0.36, EY + 0.02, z + 0.03], [s * 0.36, EY - 0.1, EZ + 0.4], [s * 0.3, EY - 0.14, EZ + 0.56]], 0.017, M.titanium));
    }
    headers.push(cyl(0.035, 0.08, M.titanium, [s * 0.3, EY - 0.14, EZ + 0.54], 'z', 20, 0.045));
    P(`Coletor de escape 4-em-1 — ${bank(s)}`, 'Escape', [s * 0.33, EY - 0.04, EZ + 0.2], [{ r: S(5, 0.3, 0.85), o: [s * 0.8, 0.15, 0] }], headers,
      { info: 'Tubos de comprimento igual em aço inox' });

    P(`Catalisador — ${bank(s)}`, 'Escape', [s * 0.3, EY - 0.14, EZ + 0.68], [{ r: S(5, 0.4, 0.88), o: [s * 0.75, 0.15, 0.45] }], [
      cyl(0.06, 0.24, M.titanium, [s * 0.3, EY - 0.14, EZ + 0.68], 'z', 28),
      cyl(0.065, 0.05, M.zinc, [s * 0.3, EY - 0.14, EZ + 0.62], 'z', 28),
      cyl(0.009, 0.05, M.steel, [s * 0.3, EY - 0.08, EZ + 0.6], 'y', 10),
      ...harness([[s * 0.3, EY - 0.055, EZ + 0.6], [s * 0.33, EY + 0.05, EZ + 0.4], [s * 0.36, 0.6, 0.6]], { n: 4, r: 0.0018, plugs: false }),
    ], { info: 'Com sonda lambda de banda larga' });
  }

  // Accessory drive (front of the engine, towards the cabin)
  const AZ = 0.6;
  const pulleys = [[0, EY - 0.05, 0.07], [0, EY + 0.13, 0.045], [-0.21, EY + 0.14, 0.042], [0.21, EY + 0.04, 0.05]];
  const hull = hull2(pulleys.flatMap(([x, y, r]) => Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [x + Math.cos(a) * (r + 0.004), y + Math.sin(a) * (r + 0.004)];
  })));
  P('Correia de acessórios', 'Motor', [0, EY + 0.05, AZ], [{ r: S(5, 0.05, 0.45), o: [0, 0.95, -0.15] }], [
    tube(hull.map(([x, y]) => [x, y, AZ]), 0.005, M.rubber, { closed: true, seg: 160, radial: 6, tension: 0 }),
  ]);
  P('Alternador', 'Elétrica', [-0.21, EY + 0.14, AZ - 0.05], [{ r: S(5, 0.15, 0.6), o: [-0.65, 0.85, -0.2] }], [
    cyl(0.042, 0.025, M.steel, [-0.21, EY + 0.14, AZ], 'z', 28),
    cyl(0.05, 0.085, M.aluBright, [-0.21, EY + 0.14, AZ - 0.06], 'z', 28),
    ...Array.from({ length: 8 }, (_, i) => mesh(rbox(0.004, 0.09, 0.06, 0.001), M.alu, [-0.21, EY + 0.14, AZ - 0.06], [0, 0, (i / 8) * Math.PI])),
  ], { info: '14 V · 150 A' });
  P('Compressor do ar-condicionado', 'Climatização', [0.21, EY + 0.04, AZ - 0.05], [{ r: S(5, 0.15, 0.6), o: [0.65, 0.85, -0.2] }], [
    cyl(0.05, 0.025, M.steel, [0.21, EY + 0.04, AZ], 'z', 28),
    cyl(0.048, 0.095, M.alu, [0.21, EY + 0.04, AZ - 0.065], 'z', 28),
    tube([[0.21, EY + 0.09, AZ - 0.07], [0.3, 0.6, 0.45], [0.45, 0.6, -0.2], [0.35, 0.5, -0.9]], 0.007, M.alu, { radial: 8 }),
  ]);
  P('Bomba d’água', 'Arrefecimento', [0, EY + 0.13, AZ], [{ r: S(5, 0.2, 0.62), o: [0, 1.15, -0.2] }], [
    cyl(0.045, 0.025, M.steel, [0, EY + 0.13, AZ], 'z', 28),
    cyl(0.04, 0.05, M.alu, [0, EY + 0.13, AZ + 0.035], 'z', 24),
  ]);
  P('Filtro de óleo', 'Lubrificação', [-0.2, EY - 0.08, EZ - 0.15], [{ r: S(5, 0.25, 0.65), o: [-0.75, 0.55, 0] }], [
    cyl(0.036, 0.09, M.filterBlue, [-0.2, EY - 0.08, EZ - 0.15], 'x', 24),
  ]);
  P('Tanque de óleo (cárter seco)', 'Lubrificação', [-0.46, 0.5, 0.9], [{ r: S(5, 0.2, 0.65), o: [-0.75, 0.7, 0] }], [
    cyl(0.065, 0.26, M.alu, [-0.46, 0.5, 0.9], 'y', 28),
    cyl(0.025, 0.03, M.plastic, [-0.46, 0.645, 0.9], 'y', 16),
    tube([[-0.46, 0.38, 0.9], [-0.3, 0.3, 0.95], [-0.1, EY - 0.17, EZ]], 0.008, M.hose, { radial: 8 }),
  ], { info: 'Lubrificação por cárter seco · 10,5 L' });
  P('Reservatório de expansão', 'Arrefecimento', [0.38, 0.62, 0.62], [{ r: S(5, 0.2, 0.62), o: [0.7, 0.85, 0.1] }], [
    box(0.1, 0.1, 0.08, M.coolant, [0.38, 0.62, 0.62], undefined, 0.02),
    cyl(0.02, 0.02, M.plastic, [0.38, 0.68, 0.62], 'y', 16),
    tube([[0.38, 0.57, 0.62], [0.2, 0.5, 0.62], [0.02, EY + 0.13, AZ + 0.05]], 0.007, M.hose, { radial: 8 }),
  ]);
  P('Motor de partida', 'Elétrica', [0.19, EY - 0.1, EZ + 0.36], [{ r: S(5, 0.35, 0.8), o: [0.7, 0.45, 0.25] }], [
    cyl(0.038, 0.14, M.steel, [0.19, EY - 0.1, EZ + 0.36], 'z', 24),
    cyl(0.02, 0.09, M.zinc, [0.19, EY - 0.05, EZ + 0.36], 'z', 16),
  ]);

  // Block, pistons, crank, sump
  P('Bloco do motor V8 4.5', 'Motor', [0, EY, EZ], [{ r: S(5, 0.5, 0.9), o: [-0.9, 0.35, 0] }], [
    box(0.3, 0.26, 0.66, M.alu, [0, EY, EZ], undefined, 0.04),
    ...CYL_Z.map((dz) => box(0.32, 0.03, 0.04, M.alu, [0, EY - 0.04, EZ + dz], undefined, 0.01)),
    box(0.32, 0.24, 0.05, M.alu, [0, EY, EZ - 0.35], undefined, 0.02),
  ], { info: 'F136 FB · 4.497 cm³ · 90° · 570 cv a 9.000 rpm' });

  for (const s of [-1, 1]) {
    const pistons = [];
    const dirB = bdir(s);
    for (let i = 0; i < 4; i++) {
      const z = bankZ(s, i);
      const crank = V([0, EY - 0.06 + (i % 2 ? 0.035 : -0.035), z]);
      const pc = V([0, EY - 0.06, z]).addScaledVector(dirB, 0.17);
      const pin = pc.clone().addScaledVector(dirB, -0.015);
      const rodMid = crank.clone().add(pin).multiplyScalar(0.5);
      const rod = cyl(0.009, crank.distanceTo(pin), M.steel, rodMid.toArray(), 'y', 10);
      alignY(rod, pin.clone().sub(crank));
      pistons.push(
        rod,
        oriented(pc.toArray(), dirB, [
          cyl(0.044, 0.05, M.aluBright, [0, 0, 0], 'y', 28),
          mesh(new THREE.TorusGeometry(0.044, 0.0025, 6, 28).rotateX(Math.PI / 2), M.steel, [0, 0.016, 0]),
          mesh(new THREE.TorusGeometry(0.044, 0.0025, 6, 28).rotateX(Math.PI / 2), M.steel, [0, 0.006, 0]),
        ]),
      );
    }
    P(`Pistões e bielas — ${bank(s)}`, 'Motor', [s * 0.12, EY + 0.06, EZ], [{ r: S(5, 0.6, 1), o: [s * 0.25, 0.95, 0] }], pistons,
      { info: 'Pistões forjados, bielas em aço' });
  }
  const crank = [cyl(0.024, 0.66, M.steel, [0, EY - 0.06, EZ], 'z', 16)];
  CYL_Z.forEach((dz, i) => {
    const up = i % 2 ? 1 : -1;
    crank.push(box(0.1, 0.07, 0.022, M.steel, [0, EY - 0.06 - up * 0.02, EZ + dz - 0.03], undefined, 0.02));
    crank.push(box(0.1, 0.07, 0.022, M.steel, [0, EY - 0.06 - up * 0.02, EZ + dz + 0.03], undefined, 0.02));
    crank.push(cyl(0.02, 0.04, M.aluBright, [0, EY - 0.06 + up * 0.035, EZ + dz], 'z', 12));
  });
  crank.push(cyl(0.07, 0.025, M.steel, [0, EY - 0.05, AZ], 'z', 32));
  P('Virabrequim plano (180°)', 'Motor', [0, EY - 0.06, EZ], [{ r: S(5, 0.65, 1), o: [0.85, 0.45, 0] }], crank,
    { info: 'Flat-plane: o segredo do grito do V8 Ferrari' });
  P('Cárter seco', 'Lubrificação', [0, EY - 0.17, EZ], [{ r: S(5, 0.45, 0.85), o: [0.75, -0.06, 0.25] }], [
    box(0.26, 0.07, 0.6, M.cast, [0, EY - 0.17, EZ], undefined, 0.02),
    ...[-0.2, -0.1, 0, 0.1, 0.2].map((dz) => box(0.27, 0.01, 0.012, M.cast, [0, EY - 0.21, EZ + dz], undefined, 0.003)),
  ]);
  P('Coxins do motor', 'Motor', [0, EY - 0.1, EZ - 0.15], [{ r: S(5, 0.6, 1), o: [0, 0.2, -0.65] }],
    [-1, 1].flatMap((s) => [
      cyl(0.035, 0.04, M.rubber, [s * 0.2, EY - 0.12, EZ - 0.15], 'y', 18),
      box(0.06, 0.012, 0.08, M.steel, [s * 0.2, EY - 0.095, EZ - 0.15], undefined, 0.003),
    ]));

  // Drivetrain
  P('Embreagem dupla em banho de óleo', 'Transmissão', [0, EY - 0.02, 1.38], [{ r: S(5, 0.45, 0.85), o: [0, 0.65, 0.05] }], [
    cyl(0.16, 0.07, M.cast, [0, EY - 0.02, 1.38], 'z', 40),
    cyl(0.13, 0.012, M.aluBright, [0, EY - 0.02, 1.345], 'z', 40),
    cyl(0.1, 0.012, M.copper, [0, EY - 0.02, 1.415], 'z', 40),
  ], { info: '2 embreagens: uma para marchas pares, outra para ímpares' });
  P('Câmbio de dupla embreagem 7 marchas', 'Transmissão', [0, 0.4, 1.6], [{ r: S(5, 0.5, 0.95), o: [0, 0.45, 0.6] }], [
    cyl(0.15, 0.36, M.cast, [0, 0.4, 1.6], 'z', 32, 0.12),
    box(0.36, 0.2, 0.2, M.cast, [0, 0.37, 1.58], undefined, 0.05),
    box(0.14, 0.05, 0.1, M.plastic, [0.08, 0.53, 1.62], undefined, 0.01),
    ...harness([[0.08, 0.56, 1.6], [0.2, 0.6, 1.3], [0.36, 0.6, 0.62]], { n: 6, r: 0.0018, plugs: false }),
  ], { info: 'Getrag 7DCL750 · trocas em 60 ms' });
  P('Semieixos com juntas homocinéticas', 'Transmissão', [0, 0.37, 1.5], [{ r: S(5, 0.55, 1), o: [0, 0.2, 0.9] }],
    [-1, 1].flatMap((s) => {
      const b1 = bellows(0.04, 0.022, 0.08, 5, M.rubber);
      b1.position.set(s * 0.22, 0.37, 1.5);
      b1.rotation.z = (-s * Math.PI) / 2;
      const b2 = bellows(0.04, 0.022, 0.08, 5, M.rubber);
      b2.position.set(s * 0.6, 0.365, 1.5);
      b2.rotation.z = (s * Math.PI) / 2;
      return [cyl(0.016, 0.44, M.steel, [s * 0.41, 0.365, 1.5], 'x', 12), b1, b2];
    }));

  // Cooling
  for (const s of [-1, 1]) {
    const rad = new THREE.Group();
    rad.position.set(s * 0.55, 0.38, -1.7);
    rad.rotation.set(0.35, s * 0.35, 0);
    rad.add(mesh(rbox(0.36, 0.26, 0.035, 0.006), M.core));
    for (const x of [-0.195, 0.195]) rad.add(mesh(rbox(0.03, 0.27, 0.05, 0.008), M.plastic, [x, 0, 0]));
    rad.add(mesh(new THREE.TorusGeometry(0.1, 0.008, 8, 40), M.plastic, [0, 0, 0.045]));
    rad.add(cyl(0.03, 0.04, M.plastic, [0, 0, 0.05], 'z', 20));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      rad.add(mesh(rbox(0.06, 0.028, 0.004, 0.002), M.plastic, [Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.05], [0.4, 0, a]));
    }
    P(`Radiador e eletroventilador ${sideM(s)}`, 'Arrefecimento', [s * 0.55, 0.38, -1.7], [{ r: S(5, 0, 0.45), o: [s * 0.8, 0.35, -0.6] }], [rad],
      { info: 'Montado à frente das rodas, alimentado pelas entradas do para-choque' });
  }

  /* ================= Chapter 8 · fuel, exhaust, coolant pipes, subframes ================= */
  const pipes = [];
  for (const s of [-1, 1]) {
    for (const o of [0, 0.045]) {
      pipes.push(tube([[s * (0.45 - o), 0.33 - o * 0.5, -1.6], [s * (0.22 + o), 0.2, -1.25], [s * (0.14 + o), 0.16, -0.7],
        [s * (0.14 + o), 0.16, 0.3], [s * (0.1 + o), 0.28, 0.56], [s * (0.04 + o), EY + 0.06, AZ + 0.02]], 0.013, o ? M.hose : M.alu));
    }
  }
  P('Tubulação de arrefecimento', 'Arrefecimento', [0, 0.18, -0.4], [{ r: S(8, 0.05, 0.55), o: [0, 0.95, 0] }], pipes,
    { info: 'Liga os radiadores dianteiros ao motor central' });

  P('Tanque de combustível', 'Combustível', [0, 0.27, 0.48], [{ r: S(8, 0.15, 0.7), o: [0, 1.45, 0.4] }], [
    box(0.95, 0.17, 0.18, M.plasticGrey, [0, 0.27, 0.48], undefined, 0.05),
    cyl(0.055, 0.03, M.plastic, [0.2, 0.37, 0.48], 'y', 24),
    box(0.03, 0.02, 0.025, M.plasticGrey, [0.24, 0.39, 0.48], undefined, 0.004),
    tube([[0.42, 0.33, 0.5], [0.6, 0.55, 0.56], [0.84, 0.8, 0.62]], 0.025, M.rubber),
    cyl(0.035, 0.02, M.aluBright, [0.84, 0.8, 0.62], 'x', 20),
  ], { info: '86 litros · bomba de combustível submersa' });
  P('Linhas de combustível e cânister', 'Combustível', [0.15, 0.45, 0.6], [{ r: S(8, 0.2, 0.75), o: [0.55, 1.2, 0.35] }], [
    tube([[0.2, 0.39, 0.48], [0.12, 0.5, 0.6], [0.0, EY + 0.3, AZ + 0.08]], 0.005, M.aluBright, { radial: 8 }),
    tube([[0.18, 0.39, 0.46], [0.08, 0.5, 0.58], [-0.05, EY + 0.3, AZ + 0.08]], 0.004, M.hose, { radial: 8 }),
    cyl(0.04, 0.14, M.plastic, [-0.4, 0.35, 0.55], 'y', 20),
  ]);
  P('Silenciosos e tubos de escape', 'Escape', [0, 0.36, 1.95], [{ r: S(8, 0, 0.55), o: [0, 0.35, 1.05] }], [
    ...[-1, 1].flatMap((s) => [
      tube([[s * 0.3, EY - 0.14, EZ + 0.8], [s * 0.3, 0.32, 1.8], [s * 0.2, 0.36, 1.98]], 0.032, M.titanium),
      tube([[s * 0.2, 0.39, 2.06], [s * 0.12, 0.41, 2.14], [s * 0.11, 0.41, 2.2]], 0.026, M.titanium, { seg: 24 }),
      cyl(0.05, 0.12, M.titanium, [s * 0.25, 0.38, 2.02], 'x', 24),
    ]),
    box(0.5, 0.14, 0.16, M.titanium, [0, 0.38, 2.02], undefined, 0.06),
    cyl(0.018, 0.08, M.steel, [0, 0.47, 2.02], 'y', 12),
  ], { info: 'Válvulas de bypass abrem acima de 4.000 rpm' });

  const rail = (x, z0, z1, y) => box(0.06, 0.06, Math.abs(z1 - z0), M.alu, [x, y, (z0 + z1) / 2], undefined, 0.008);
  P('Subchassi dianteiro', 'Estrutura', [0, 0.2, -1.1], [{ r: S(8, 0.2, 0.75), o: [0, 0.4, -1.45] }], [
    rail(-0.42, -1.5, -0.72, 0.2), rail(0.42, -1.5, -0.72, 0.2),
    box(0.9, 0.05, 0.05, M.alu, [0, 0.2, -1.48], undefined, 0.008),
    box(0.9, 0.05, 0.05, M.alu, [0, 0.2, -0.75], undefined, 0.008),
    box(0.72, 0.12, 0.08, M.alu, [0, 0.36, -2.0], undefined, 0.02),
  ], { info: 'Inclui a estrutura de deformação programada' });
  P('Subchassi traseiro', 'Estrutura', [0, 0.22, 1.45], [{ r: S(8, 0.25, 0.8), o: [0, 0.4, 1.55] }], [
    rail(-0.38, 0.95, 1.95, 0.22), rail(0.38, 0.95, 1.95, 0.22),
    box(0.82, 0.05, 0.05, M.alu, [0, 0.22, 1.2], undefined, 0.008),
    box(0.82, 0.05, 0.05, M.alu, [0, 0.22, 1.92], undefined, 0.008),
  ]);
}
