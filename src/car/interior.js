import * as THREE from 'three';
import { S } from './timeline.js';
import { V, mesh, box, cyl, tube, ribbon, rbox } from './kit.js';

const who = (s) => (s < 0 ? 'do motorista' : 'do passageiro');

export function buildInterior({ M, P, steer }) {
  // Pedal box (left-hand drive, two-pedal F1 gearbox)
  const pedal = (x, w, h, padY, padZ, pivotY) => [
    tube([[x, pivotY, -1.0], [x, (pivotY + padY) / 2 + 0.03, -0.96], [x, padY + 0.04, padZ - 0.01]], 0.007, M.alu, { radial: 8 }),
    box(w, h, 0.012, M.aluBright, [x, padY, padZ], [-0.5, 0, 0], 0.004),
    ...Array.from({ length: 3 }, (_, i) => box(w * 0.8, 0.008, 0.004, M.rubber, [x, padY - h * 0.3 + i * h * 0.3, padZ - 0.0], [-0.5, 0, 0], 0.002)),
  ];
  P('Pedaleira em alumínio', 'Interior', [-0.38, 0.42, -0.95], [{ r: S(6, 0.15, 0.6), o: [-0.65, 0.55, -0.9] }], [
    box(0.32, 0.06, 0.08, M.cast, [-0.36, 0.6, -1.02], undefined, 0.01),
    ...pedal(-0.38, 0.085, 0.09, 0.33, -0.9, 0.58),
    ...pedal(-0.24, 0.05, 0.13, 0.3, -0.92, 0.56),
    box(0.075, 0.15, 0.008, M.aluBright, [-0.56, 0.3, -0.9], [-0.6, 0, 0], 0.004),
  ], { info: 'Freio e acelerador — sem pedal de embreagem' });

  for (const s of [-1, 1]) {
    P(`Tapete ${who(s)}`, 'Interior', [s * 0.33, 0.25, -0.75], [{ r: S(6, 0.45, 0.95), o: [s * 0.75, 0.55, -0.45] }], [
      box(0.34, 0.008, 0.4, M.mat, [s * 0.33, 0.252, -0.75], undefined, 0.003),
      box(0.35, 0.006, 0.41, M.leatherRed, [s * 0.33, 0.248, -0.75], undefined, 0.003),
      box(0.05, 0.002, 0.02, M.aluBright, [s * 0.33, 0.257, -0.58], undefined, 0.001),
    ]);

    // Seat belt: retractor at the B-pillar foot, strap up the pillar, across the seat, lap section.
    const top = [s * 0.64, 1.03, 0.3];
    const tongue = [s * 0.13, 0.46, -0.03];
    P(`Cinto de segurança de 3 pontos ${who(s)}`, 'Segurança', [s * 0.45, 0.7, 0.15], [{ r: S(6, 0.2, 0.65), o: [s * 0.7, 1.25, 0.3] }], [
      box(0.06, 0.12, 0.08, M.plastic, [s * 0.66, 0.42, 0.3], undefined, 0.01),
      ribbon([[s * 0.66, 0.48, 0.3], [s * 0.655, 0.75, 0.3], top], 0.046, M.belt, [-s, 0, 0]),
      box(0.05, 0.03, 0.02, M.plasticGrey, top, undefined, 0.006),
      ribbon([top, [s * 0.52, 1.0, 0.2], [s * 0.35, 0.78, 0.07], tongue], 0.046, M.belt, [0, 0.3, -1]),
      ribbon([tongue, [s * 0.35, 0.42, -0.05], [s * 0.62, 0.36, 0.05]], 0.046, M.belt, [0, 1, -0.3]),
      box(0.03, 0.05, 0.006, M.aluBright, tongue, [-0.3, 0, 0], 0.002),
      box(0.032, 0.07, 0.026, M.plastic, [s * 0.06, 0.42, -0.02], undefined, 0.006),
      box(0.012, 0.004, 0.006, M.emissiveRed, [s * 0.06, 0.457, -0.02], undefined, 0.001),
    ], { info: 'Pré-tensionador pirotécnico' });

    P(`Trilhos do banco ${who(s)}`, 'Interior', [s * 0.35, 0.2, -0.15], [{ r: S(6, 0.5, 1), o: [s * 0.45, 0.35, 0.05] }], [
      box(0.03, 0.025, 0.52, M.steel, [s * 0.22, 0.2, -0.15], undefined, 0.004),
      box(0.03, 0.025, 0.52, M.steel, [s * 0.48, 0.2, -0.15], undefined, 0.004),
      tube([[s * 0.22, 0.21, -0.42], [s * 0.35, 0.2, -0.46], [s * 0.48, 0.21, -0.42]], 0.005, M.steel, { radial: 6 }),
      box(0.06, 0.04, 0.05, M.plastic, [s * 0.5, 0.22, 0.05], undefined, 0.008),
    ], { info: 'Ajuste elétrico' });
  }

  // HVAC unit and ducts
  P('Ar-condicionado e dutos', 'Climatização', [0, 0.55, -0.93], [{ r: S(6, 0.3, 0.85), o: [0, 1.1, -1.05] }], [
    box(0.42, 0.22, 0.18, M.plasticGrey, [0, 0.55, -0.93], undefined, 0.02),
    cyl(0.07, 0.08, M.plastic, [0.28, 0.5, -0.93], 'x', 28),
    box(0.2, 0.12, 0.012, M.core, [0, 0.55, -1.025], undefined, 0.003),
    tube([[-0.12, 0.66, -0.9], [-0.35, 0.78, -0.82], [-0.5, 0.82, -0.76]], 0.028, M.plastic),
    tube([[0.12, 0.66, -0.9], [0.35, 0.78, -0.82], [0.5, 0.82, -0.76]], 0.028, M.plastic),
    tube([[0, 0.66, -0.88], [0, 0.82, -0.78], [0, 0.86, -0.72]], 0.026, M.plastic),
    tube([[-0.1, 0.45, -0.88], [-0.3, 0.32, -0.86]], 0.022, M.plastic),
    tube([[0.1, 0.45, -0.88], [0.3, 0.32, -0.86]], 0.022, M.plastic),
  ], { info: 'Climatização automática de duas zonas' });

  P('Airbag do passageiro', 'Segurança', [0.38, 0.8, -0.88], [{ r: S(6, 0.1, 0.55), o: [0.5, 1.15, -0.55] }], [
    box(0.2, 0.08, 0.12, M.cast, [0.38, 0.8, -0.88], undefined, 0.01),
    box(0.18, 0.02, 0.1, M.plasticWhite, [0.38, 0.845, -0.88], undefined, 0.006),
  ]);

  // Shift paddles follow the steering wheel, then pop off it.
  const c = steer.center;
  const back = steer.normal.z > 0 ? steer.normal.clone().negate() : steer.normal.clone();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), back);
  const paddles = [-1, 1].map((k) => {
    const m = mesh(rbox(0.055, 0.15, 0.008, 0.004), M.carbon, c.clone().addScaledVector(back, 0.06).addScaledVector(steer.right, k * 0.13).add(V([0, 0.03, 0])).toArray());
    m.quaternion.copy(q);
    return m;
  });
  const steerMove = steer.part.userData.moves[0];
  P('Borboletas de troca de marcha', 'Interior', c.toArray(),
    [{ r: steerMove.r, o: steerMove.o.toArray(), rot: steerMove.rot.toArray() }, { r: S(6, 0.5, 0.95), o: [0, 0.3, 0.35] }], paddles,
    { count: 1, info: 'Borboletas longas em fibra de carbono' });
}
