import * as THREE from 'three';
import { S } from './timeline.js';
import { DOOR_PIVOT, DOOR_MOVE } from './model.js';
import { mesh, box, cyl, tube, harness, speaker, tweeter } from './kit.js';

const sideM = (s) => (s < 0 ? 'esquerdo' : 'direito');
const sideF = (s) => (s < 0 ? 'esquerda' : 'direita');

/** Group at `p` whose local +Z faces `dir`. */
function facing(obj, p, dir) {
  obj.position.set(...p);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir).normalize());
  return obj;
}

export function buildElectrics({ M, P }) {
  const H = (pts, o = {}) => harness(pts, { tapeMat: M.tape, plugMat: M.plastic, ...o });

  /* ---------------- Power ---------------- */
  P('Bateria', 'Elétrica', [0.05, 0.3, -1.5], [{ r: S(7, 0, 0.45), o: [0.55, 1.3, -0.95] }], [
    box(0.24, 0.17, 0.17, M.battery, [0.05, 0.3, -1.5], undefined, 0.01),
    box(0.245, 0.02, 0.175, M.plasticGrey, [0.05, 0.39, -1.5], undefined, 0.006),
    ...[-0.08, -0.04, 0, 0.04, 0.08].map((dx) => cyl(0.009, 0.006, M.plastic, [0.05 + dx, 0.402, -1.46], 'y', 10)),
    cyl(0.013, 0.03, M.termRed, [0.15, 0.41, -1.55], 'y', 14),
    cyl(0.013, 0.03, M.plastic, [-0.05, 0.41, -1.55], 'y', 14),
    box(0.02, 0.19, 0.18, M.steel, [0.05, 0.3, -1.5], undefined, 0.003),
  ], { info: '12 V · 70 Ah AGM' });

  P('Cabos da bateria', 'Elétrica', [0.05, 0.25, -0.6], [{ r: S(7, 0.05, 0.5), o: [0.35, 1.05, -0.35] }], [
    tube([[0.15, 0.425, -1.55], [0.0, 0.4, -1.42], [-0.18, 0.38, -1.32], [-0.25, 0.36, -1.3]], 0.006, M.termRed),
    tube([[0.15, 0.425, -1.53], [0.12, 0.22, -1.25], [0.06, 0.165, -0.6], [0.06, 0.165, 0.8], [0.15, 0.25, 1.2], [0.19, 0.32, 1.3]], 0.006, M.termRed),
    tube([[-0.05, 0.425, -1.55], [-0.12, 0.3, -1.6], [-0.22, 0.19, -1.62]], 0.006, M.rubber),
    box(0.03, 0.01, 0.03, M.copper, [-0.22, 0.185, -1.62], undefined, 0.002),
  ], { info: 'Cabo de 35 mm² até o motor de partida' });

  P('Tampa da caixa de fusíveis', 'Elétrica', [-0.25, 0.405, -1.3], [{ r: S(7, 0, 0.35), o: [-0.35, 0.85, -0.55] }], [
    box(0.19, 0.03, 0.14, M.plastic, [-0.25, 0.405, -1.3], undefined, 0.008),
  ]);
  const fuses = [box(0.18, 0.06, 0.13, M.plasticGrey, [-0.25, 0.36, -1.3], undefined, 0.006)];
  const fm = [M.fuseRed, M.fuseBlue, M.fuseYellow, M.fuseGreen, M.fuseRed, M.fuseYellow];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) fuses.push(box(0.006, 0.012, 0.016, fm[(r * 3 + c) % fm.length], [-0.33 + c * 0.014, 0.396, -1.35 + r * 0.022], undefined, 0.001));
  }
  for (let k = 0; k < 4; k++) fuses.push(box(0.024, 0.026, 0.024, M.plastic, [-0.2 + (k % 2) * 0.03, 0.403, -1.34 + Math.floor(k / 2) * 0.03], undefined, 0.003));
  P('Caixa de fusíveis e relés', 'Elétrica', [-0.25, 0.37, -1.3], [{ r: S(7, 0.08, 0.5), o: [-0.6, 1.1, -0.75] }], fuses,
    { info: '28 fusíveis + 4 relés' });

  P('Buzinas', 'Elétrica', [0, 0.3, -1.95], [{ r: S(7, 0, 0.4), o: [0, 0.65, -1.25] }],
    [-1, 1].flatMap((s) => [
      mesh(new THREE.TorusGeometry(0.028, 0.011, 8, 24), M.plastic, [s * 0.42, 0.3, -1.95], [0, Math.PI / 2, 0]),
      cyl(0.03, 0.03, M.plastic, [s * 0.42, 0.3, -1.99], 'z', 20, 0.012),
      box(0.012, 0.06, 0.03, M.steel, [s * 0.42, 0.34, -1.95], undefined, 0.003),
    ]));

  for (const s of [-1, 1]) {
    const e = [];
    const x = s * 0.38;
    e.push(box(0.15, 0.035, 0.11, M.aluBright, [x, 0.62, 0.5], undefined, 0.006));
    for (let k = 0; k < 6; k++) e.push(box(0.15, 0.008, 0.004, M.alu, [x, 0.641, 0.46 + k * 0.016], undefined, 0.001));
    e.push(box(0.05, 0.03, 0.03, M.plastic, [x - s * 0.04, 0.62, 0.565], undefined, 0.005));
    e.push(box(0.04, 0.03, 0.03, M.plasticGrey, [x + s * 0.03, 0.62, 0.565], undefined, 0.005));
    P(`Central do motor (ECU) — banco ${sideM(s)}`, 'Elétrica', [x, 0.62, 0.5], [{ r: S(7, 0.15, 0.6), o: [s * 0.85, 1.25, 0.55] }], e,
      { info: 'Bosch Motronic MED 9.6.1 · uma por banco de cilindros' });
  }
  P('Módulo de carroceria (BCM)', 'Elétrica', [0.35, 0.62, -0.8], [{ r: S(7, 0.1, 0.55), o: [0.6, 1.1, -0.45] }], [
    box(0.12, 0.03, 0.1, M.plastic, [0.35, 0.62, -0.8], undefined, 0.006),
    box(0.11, 0.004, 0.09, M.pcb, [0.35, 0.637, -0.8], undefined, 0.001),
    box(0.04, 0.022, 0.025, M.plasticWhite, [0.31, 0.62, -0.745], undefined, 0.004),
  ], { info: 'Controla vidros, travas, luzes e CAN-bus' });

  /* ---------------- Wiring looms ---------------- */
  const sill = (s, end) => [[-0.25, 0.37, -1.24], [s * 0.45, 0.3, -1.1], [s * 0.6, 0.2, -0.8], [s * 0.62, 0.19, 0], [s * 0.6, 0.22, 0.3], [s * 0.48, 0.45, 0.45], end];
  P('Chicote principal esquerdo', 'Chicotes', [-0.6, 0.25, -0.2], [{ r: S(7, 0.1, 0.75), o: [-0.6, 1.0, 0] }],
    H(sill(-1, [-0.38, 0.6, 0.47]), { n: 10 }), { info: 'Do porta-malas à central do motor, pela soleira' });
  P('Chicote principal direito', 'Chicotes', [0.6, 0.25, -0.2], [{ r: S(7, 0.12, 0.78), o: [0.6, 1.0, 0] }],
    [...H(sill(1, [0.38, 0.6, 0.47]), { n: 9 }), ...H([[0.38, 0.6, 0.55], [0.36, 0.62, 0.6], [0.38, 0.57, 0.62]], { n: 3, r: 0.0018 })],
    { info: 'Inclui o barramento CAN entre as centrais' });
  P('Chicote do painel', 'Chicotes', [0, 0.7, -0.95], [{ r: S(7, 0.05, 0.6), o: [0, 1.3, -0.45] }], [
    ...H([[-0.25, 0.4, -1.25], [-0.45, 0.6, -1.05], [-0.5, 0.72, -0.95], [0.0, 0.73, -0.95], [0.5, 0.72, -0.95], [0.4, 0.64, -0.85]], { n: 10 }),
    ...H([[-0.35, 0.72, -0.95], [-0.36, 0.76, -0.8], [-0.35, 0.8, -0.68]], { n: 6, r: 0.002 }),
    ...H([[0.0, 0.73, -0.95], [0.02, 0.6, -0.75], [0.0, 0.48, -0.55]], { n: 6, r: 0.002 }),
    ...H([[0.0, 0.73, -0.95], [0.0, 0.72, -0.8]], { n: 4, r: 0.002 }),
  ], { info: 'Quadro de instrumentos, multimídia, climatização e console' });
  P('Chicote dianteiro (faróis e ventiladores)', 'Chicotes', [0, 0.45, -1.65], [{ r: S(7, 0.0, 0.5), o: [0, 0.9, -1.0] }], [
    ...H([[-0.3, 0.38, -1.36], [-0.35, 0.44, -1.55], [-0.6, 0.55, -1.72], [-0.68, 0.6, -1.82]], { n: 8 }),
    ...H([[-0.25, 0.38, -1.36], [0.0, 0.42, -1.72], [0.4, 0.48, -1.75], [0.68, 0.6, -1.82]], { n: 8 }),
    ...H([[-0.45, 0.48, -1.62], [-0.55, 0.42, -1.65]], { n: 3, r: 0.002 }),
    ...H([[0.4, 0.48, -1.75], [0.55, 0.42, -1.65]], { n: 3, r: 0.002 }),
    ...H([[0.0, 0.42, -1.72], [0.3, 0.32, -1.9], [0.42, 0.32, -1.93]], { n: 2, r: 0.002 }),
    ...H([[0.0, 0.42, -1.72], [-0.3, 0.32, -1.9], [-0.42, 0.32, -1.93]], { n: 2, r: 0.002 }),
  ]);
  P('Chicote traseiro (lanternas)', 'Chicotes', [0, 0.8, 1.6], [{ r: S(7, 0.15, 0.7), o: [0, 1.15, 0.95] }], [
    ...H([[-0.38, 0.62, 0.55], [-0.55, 0.72, 1.0], [-0.6, 0.8, 1.5], [-0.72, 0.85, 1.85]], { n: 8 }),
    ...H([[-0.68, 0.84, 1.88], [-0.3, 0.8, 1.98], [0.0, 0.88, 2.05], [0.3, 0.8, 1.98], [0.72, 0.85, 1.85]], { n: 6 }),
  ], { info: 'Lanternas, terceira luz de freio e placa' });
  for (const s of [-1, 1]) {
    const grommet = mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.08, 12), M.rubber, [s * 0.86, 0.58, -0.74], [0, 0, (s * Math.PI) / 2]);
    P(`Chicote da porta ${sideF(s)}`, 'Chicotes', [s * 0.8, 0.55, -0.8], [{ r: S(7, 0.2, 0.7), o: [s * 0.7, 0.8, -0.25] }], [
      ...H([[s * 0.62, 0.22, -0.82], [s * 0.72, 0.5, -0.85], [s * 0.82, 0.58, -0.76], [s * 0.9, 0.6, -0.72]], { n: 7 }),
      grommet,
    ], { info: 'Vidro elétrico, trava, retrovisor e alto-falante' });
  }

  /* ---------------- Audio ---------------- */
  for (const s of [-1, 1]) {
    const spk = facing(speaker(0.165, M, { grille: true }), [s * 0.8, 0.37, -0.4], [-s, 0, 0]);
    P(`Alto-falante da porta ${sideF(s)}`, 'Áudio', DOOR_PIVOT(s), [DOOR_MOVE(s), { r: S(2, 0.55, 1), o: [-s * 0.3, 0.45, 0.15] }], [spk],
      { count: 1, info: 'Woofer de 165 mm · cone de polipropileno' });
    const tw = facing(tweeter(0.028, M), [s * 0.55, 0.8, -0.85], [-s * 0.3, 0.8, 0.5]);
    P(`Tweeter ${sideM(s)}`, 'Áudio', [s * 0.55, 0.8, -0.85], [{ r: S(7, 0.05, 0.5), o: [s * 0.55, 1.4, -0.55] }], [tw],
      { info: 'Domo de seda de 28 mm' });
  }
  P('Alto-falante central', 'Áudio', [0, 0.82, -0.85], [{ r: S(7, 0.1, 0.55), o: [0, 1.5, -0.55] }], [
    facing(speaker(0.1, M), [0, 0.82, -0.85], [0, 1, 0.3]),
  ], { info: 'Médio de 100 mm' });
  const sub = speaker(0.2, M, { grille: true });
  P('Subwoofer', 'Áudio', [0, 0.55, 0.4], [{ r: S(7, 0.25, 0.75), o: [0, 1.45, 0.35] }], [
    box(0.36, 0.2, 0.14, M.carbon, [0, 0.55, 0.4], undefined, 0.02),
    facing(sub, [0, 0.55, 0.328], [0, 0, -1]),
  ], { info: '200 mm em caixa selada de carbono' });
  P('Amplificador', 'Áudio', [0.42, 0.5, 0.45], [{ r: S(7, 0.3, 0.8), o: [0.75, 1.2, 0.45] }], [
    box(0.2, 0.05, 0.14, M.aluBright, [0.42, 0.5, 0.45], undefined, 0.008),
    ...Array.from({ length: 9 }, (_, k) => box(0.2, 0.012, 0.004, M.alu, [0.42, 0.529, 0.392 + k * 0.0145], undefined, 0.001)),
    box(0.04, 0.03, 0.03, M.plastic, [0.33, 0.5, 0.52], undefined, 0.005),
    box(0.006, 0.006, 0.004, M.emissiveRed, [0.5, 0.51, 0.522], undefined, 0.001),
  ], { info: '4 canais × 50 W + subwoofer' });
  P('Central multimídia', 'Áudio', [0, 0.7, -0.75], [{ r: S(7, 0.1, 0.55), o: [0, 1.25, -0.25] }], [
    box(0.18, 0.055, 0.13, M.plastic, [0, 0.7, -0.75], undefined, 0.006),
    ...Array.from({ length: 6 }, (_, k) => box(0.16, 0.004, 0.006, M.alu, [0, 0.73, -0.8 + k * 0.018], undefined, 0.001)),
    box(0.05, 0.02, 0.02, M.plasticGrey, [0.06, 0.7, -0.68], undefined, 0.004),
  ], { info: 'Rádio, Bluetooth e navegação' });

  const pair = { n: 2, r: 0.0017, colors: [0xc81e1e, 0x111111], tapeMat: M.tape, plugMat: M.plastic };
  P('Cabos de áudio', 'Chicotes', [0, 0.3, -0.2], [{ r: S(7, 0.2, 0.7), o: [0, 0.95, 0.2] }], [
    ...harness([[0.33, 0.5, 0.45], [0.25, 0.55, 0.42], [0.18, 0.55, 0.4]], pair),
    ...harness([[0.45, 0.48, 0.52], [0.5, 0.2, 0.35], [0.6, 0.2, -0.6], [0.72, 0.5, -0.85], [0.55, 0.78, -0.86]], pair),
    ...harness([[0.4, 0.48, 0.52], [0.4, 0.2, 0.36], [-0.4, 0.2, 0.36], [-0.6, 0.2, -0.6], [-0.72, 0.5, -0.85], [-0.55, 0.78, -0.86]], pair),
    ...harness([[0.6, 0.2, -0.6], [0.66, 0.4, -0.8], [0.82, 0.38, -0.72]], pair),
    ...harness([[-0.6, 0.2, -0.6], [-0.66, 0.4, -0.8], [-0.82, 0.38, -0.72]], pair),
    ...harness([[0.0, 0.7, -0.82], [0.0, 0.8, -0.92], [0.0, 0.8, -0.86]], pair),
    ...harness([[0.0, 0.68, -0.69], [0.1, 0.5, -0.5], [0.2, 0.3, 0.1], [0.35, 0.45, 0.4], [0.37, 0.5, 0.45]],
      { n: 4, r: 0.0015, colors: [0x1f5fd1, 0xeeeeee, 0x111111, 0xf2c200], tapeMat: M.tape, plugMat: M.plastic }),
  ], { info: 'Pares trançados em cobre OFC' });
}
