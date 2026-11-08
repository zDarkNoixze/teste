import * as THREE from 'three';

/** Scroll chapters after the hero. */
export const SECTIONS = 8;

/** Progress window belonging to chapter i (1-based), optionally a sub-range a..b of it. */
export function S(i, a = 0, b = 1) {
  const start = (i - 1) / SECTIONS + 0.008;
  const end = i / SECTIONS - 0.016;
  return [start + (end - start) * a, start + (end - start) * b];
}

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Positions every part for scroll progress p (0..1). `onCross(part, dir)` fires when a part
 * starts leaving (dir = 1) or snaps back into place (dir = -1). Returns the detached count.
 */
export function applyExplode(parts, p, onCross) {
  let loose = 0;
  for (const g of parts) {
    const { base, baseRot, moves, countIdx = 0 } = g.userData;
    g.position.copy(base);
    g.rotation.copy(baseRot);
    let tc = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const t = easeInOut(clamp01((p - m.r[0]) / (m.r[1] - m.r[0])));
      if (i === countIdx) tc = t;
      if (t === 0) continue;
      g.position.addScaledVector(m.o, t);
      g.rotation.x += m.rot.x * t;
      g.rotation.y += m.rot.y * t;
      g.rotation.z += m.rot.z * t;
    }
    const prev = g.userData.tc ?? 0;
    if (onCross && moves.length) {
      if (prev < 0.03 && tc >= 0.03) onCross(g, 1);
      else if (prev >= 0.03 && tc < 0.03) onCross(g, -1);
    }
    g.userData.tc = tc;
    if (tc > 0.5) loose++;
  }
  return loose;
}

export function createMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    paint: phys({ color: 0xa30d14, metalness: 0.75, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.03 }),
    glass: phys({ color: 0xffffff, metalness: 0, roughness: 0.05, transmission: 1, thickness: 0.02, envMapIntensity: 0.35 }),
    rim: std({ color: 0xc9ccd1, metalness: 1, roughness: 0.28 }),
    alu: std({ color: 0x9a9ea5, metalness: 1, roughness: 0.45 }),
    aluBright: std({ color: 0xc8ccd2, metalness: 1, roughness: 0.22 }),
    cast: std({ color: 0x2b2d31, metalness: 0.75, roughness: 0.55 }),
    steel: std({ color: 0x5c6068, metalness: 1, roughness: 0.38 }),
    zinc: std({ color: 0x8f9298, metalness: 0.9, roughness: 0.5 }),
    copper: std({ color: 0xb8734a, metalness: 1, roughness: 0.32 }),
    brass: std({ color: 0xc9a24a, metalness: 1, roughness: 0.3 }),
    titanium: std({ color: 0xb7a58a, metalness: 1, roughness: 0.3 }),
    heatBlue: std({ color: 0x5a5f8c, metalness: 1, roughness: 0.3 }),
    rosso: phys({ color: 0xb10f16, metalness: 0.2, roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.35 }),
    carbon: std({ color: 0x15161a, metalness: 0.4, roughness: 0.32 }),
    rubber: std({ color: 0x0e0f10, roughness: 0.85 }),
    hose: std({ color: 0x121314, roughness: 0.55 }),
    plastic: std({ color: 0x1a1b1e, roughness: 0.6 }),
    plasticGrey: std({ color: 0x4a4d52, roughness: 0.55 }),
    plasticWhite: std({ color: 0xd9d6cc, roughness: 0.5, transparent: true, opacity: 0.85 }),
    ceramic: std({ color: 0xf1efe8, roughness: 0.35 }),
    spring: std({ color: 0xf2b705, metalness: 0.4, roughness: 0.35 }),
    caliper: phys({ color: 0xf2b705, metalness: 0.1, roughness: 0.35, clearcoat: 1 }),
    disc: std({ color: 0x3b3c40, metalness: 0.5, roughness: 0.55 }),
    pad: std({ color: 0x4a3f36, roughness: 0.9 }),
    felt: std({ color: 0x141518, roughness: 1 }),
    mat: std({ color: 0x0c0d0f, roughness: 1 }),
    leatherRed: std({ color: 0x8e1016, roughness: 0.55 }),
    belt: std({ color: 0x111214, roughness: 0.8, side: THREE.DoubleSide }),
    tape: std({ color: 0x0b0b0c, roughness: 0.7 }),
    pcb: std({ color: 0x0f5a2c, roughness: 0.5 }),
    cone: std({ color: 0x1c1d20, roughness: 0.8 }),
    silk: std({ color: 0x2a2b30, roughness: 0.95 }),
    magnet: std({ color: 0x3a3c40, metalness: 0.6, roughness: 0.5 }),
    grille: std({ color: 0x0d0e10, metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    core: std({ color: 0x3d4045, metalness: 0.8, roughness: 0.6 }),
    battery: std({ color: 0x17181b, roughness: 0.45 }),
    termRed: std({ color: 0xc1121a, roughness: 0.45 }),
    fuseRed: std({ color: 0xd42027, roughness: 0.35, transparent: true, opacity: 0.9 }),
    fuseBlue: std({ color: 0x2a5bd7, roughness: 0.35, transparent: true, opacity: 0.9 }),
    fuseYellow: std({ color: 0xf0c419, roughness: 0.35, transparent: true, opacity: 0.9 }),
    fuseGreen: std({ color: 0x2ea84a, roughness: 0.35, transparent: true, opacity: 0.9 }),
    fluid: std({ color: 0xd8c27a, roughness: 0.2, transparent: true, opacity: 0.75 }),
    coolant: std({ color: 0xe7e3d6, roughness: 0.3, transparent: true, opacity: 0.8 }),
    filterBlue: std({ color: 0x1a2a4e, metalness: 0.4, roughness: 0.4 }),
    emissiveRed: std({ color: 0x220000, emissive: 0xff2a2a, emissiveIntensity: 2 }),
  };
}
