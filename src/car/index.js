import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { S } from './timeline.js';
import { modelParts, splitByComponents, RETUNE } from './model.js';
import { mergeProcedural } from './kit.js';
import { buildMechanics } from './mechanics.js';
import { buildInterior } from './interior.js';
import { buildElectrics } from './electrics.js';

export { SECTIONS, S, easeInOut, clamp01, applyExplode, createMaterials } from './timeline.js';

export async function loadCar(M, onProgress) {
  const base = import.meta.env.BASE_URL;
  const draco = new DRACOLoader().setDecoderPath(`${base}draco/`);
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const gltf = await loader.loadAsync(`${base}models/ferrari.glb`, (e) => {
    if (e.total) onProgress?.(e.loaded / e.total);
  });
  draco.dispose();
  const src = gltf.scene;
  src.updateMatrixWorld(true);
  src.traverse((o) => {
    const r = o.isMesh && RETUNE[o.material.name];
    if (!r) return;
    o.material.color.set(r.color);
    if (r.roughness !== undefined) o.material.roughness = r.roughness;
    if (r.metalness !== undefined) o.material.metalness = r.metalness;
  });

  const group = new THREE.Group();
  const parts = [];
  const spinners = [];

  /** Creates a part pivoting at `at`. Each move = { r: [p0, p1], o: offset, rot: euler delta }. */
  function makePart(label, cat, at, moves = [], opts = {}) {
    const g = new THREE.Group();
    g.position.set(...at);
    g.userData = {
      label,
      cat,
      info: opts.info,
      countIdx: opts.count ?? 0,
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
  /** Adds objects positioned in car space to a part. */
  function addTo(part, ...objs) {
    for (const o of objs.flat()) {
      o.position.sub(part.userData.base);
      part.add(o);
    }
    return part;
  }
  const P = (label, cat, at, moves, children = [], opts) => addTo(makePart(label, cat, at, moves, opts), children);

  /* ---------------- Model panels ---------------- */
  const byId = {};
  for (const [id, [label, cat, at, moves, opts]] of Object.entries(modelParts())) byId[id] = makePart(label, cat, at, moves, opts);

  const wheelNodes = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((n) => src.getObjectByName(n));
  const steeringNode = src.getObjectByName('steering_wheel');
  const keep = new Set([...wheelNodes, steeringNode]);
  const sources = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    let p = o;
    while (p && !keep.has(p)) p = p.parent;
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
      addTo(byId[id], m);
    }
    o.geometry.dispose();
  }

  /* ---------------- Steering wheel ---------------- */
  const steerCenter = new THREE.Vector3().setFromMatrixPosition(steeringNode.matrixWorld);
  const steerQ = new THREE.Quaternion().setFromRotationMatrix(steeringNode.matrixWorld);
  const steering = makePart('Volante com manettino', 'Interior', steerCenter.toArray(),
    [{ r: S(6, 0.1, 0.65), o: [-0.1, 1.35, -0.35], rot: [0.4, 0, 0] }], { info: 'Aro em carbono, luzes de troca em LED e airbag' });
  steering.attach(steeringNode);
  const steer = {
    part: steering,
    center: steerCenter,
    normal: new THREE.Vector3(0, 1, 0).applyQuaternion(steerQ),
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(steerQ),
  };

  /* ---------------- Wheels: rim assembly, tyre and disc ---------------- */
  const wheels = [];
  for (const node of wheelNodes) {
    const wp = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    const s = Math.sign(wp.x);
    const front = wp.z < 0;
    const where = `${front ? 'dianteira' : 'traseira'} ${s < 0 ? 'esquerda' : 'direita'}`;
    const d = front ? 0 : 0.08;
    const wheelMove = { r: S(4, d, 0.6 + d), o: [s * 1.55, 0, 0] };
    node.children.forEach((c) => {
      if (c.name.startsWith('rim')) c.material = M.rim;
    });

    const rimPart = makePart(`Roda forjada 20" ${where}`, 'Rodas', wp.toArray(), [wheelMove],
      { info: front ? '8,5J × 20" · pneu 235/35 ZR20' : '10,5J × 20" · pneu 295/35 ZR20' });
    rimPart.attach(node);
    spinners.push(node);

    const tyre = node.children.find((c) => c.name.startsWith('tire'));
    const tyreSpin = new THREE.Group();
    tyreSpin.userData.keep = true;
    node.getWorldPosition(tyreSpin.position);
    node.getWorldQuaternion(tyreSpin.quaternion);
    const tyrePart = makePart(`Pneu ${where}`, 'Rodas', wp.toArray(),
      [wheelMove, { r: S(4, 0.45 + d, 0.95), o: [s * 0.3, 0.6, 0] }], { count: 1, info: 'Michelin Pilot Sport, composto de alta aderência' });
    tyreSpin.position.sub(tyrePart.userData.base);
    tyrePart.add(tyreSpin);
    tyreSpin.attach(tyre);
    spinners.push(tyreSpin);

    const disc = node.children.find((c) => c.name.startsWith('brake'));
    disc.material = M.disc;
    const discPart = makePart(`Disco de freio carbono-cerâmico ${where}`, 'Freios', wp.toArray(),
      [{ r: S(4, 0.25 + d, 0.85), o: [s * 0.95, 0, 0] }], { info: front ? '398 mm, ventilado e perfurado' : '360 mm, ventilado e perfurado' });
    discPart.attach(disc);

    wheels.push({ pos: wp, s, front, where, d });
  }

  /* Baked contact shadow (only while the car is whole). */
  const aoTex = new THREE.TextureLoader().load(`${base}models/ferrari_ao.png`);
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

  /* ---------------- Procedural systems ---------------- */
  const ctx = { M, P, byId, addTo, wheels, steer };
  buildMechanics(ctx);
  buildInterior(ctx);
  buildElectrics(ctx);

  /* Batch procedural meshes and tag everything for picking/shadows. */
  const meshes = [];
  for (const g of [...parts]) {
    mergeProcedural(g);
    let count = 0;
    g.traverse((o) => {
      if (!o.isMesh) return;
      count++;
      o.userData.part = g;
      o.castShadow = !o.material.transmission && !o.material.transparent;
      o.receiveShadow = true;
      meshes.push(o);
    });
    if (count === 0) {
      g.removeFromParent();
      parts.splice(parts.indexOf(g), 1);
    }
  }

  return { group, parts, meshes, spinners, ao };
}
