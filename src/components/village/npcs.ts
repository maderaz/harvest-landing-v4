// The people and livestock of the settlement.
//
// Every figure is drawn from the same nine instanced body parts, and every
// animal from the same seven, so a street full of burghers and a yard full
// of pigs together cost sixteen draw calls. Per-instance colour handles the
// variation: coats, hats, hides.

import * as THREE from "three";
import { mulberry32, pick, range, type Rng } from "./random";

export type Ground = (x: number, z: number) => number;

interface Part {
  mesh: THREE.InstancedMesh;
  /** Rest offset from the agent's feet, in agent-local space. */
  offset: THREE.Vector3;
}

const owned: Array<{ dispose: () => void }> = [];

export function disposeNpcs() {
  for (const item of owned) item.dispose();
  owned.length = 0;
}

function instanced(geo: THREE.BufferGeometry, count: number, roughness = 0.85): THREE.InstancedMesh {
  const material = new THREE.MeshStandardMaterial({ roughness, flatShading: false });
  owned.push(geo, material);
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  return mesh;
}

// ---------------------------------------------------------------------------
// shared wandering behaviour
// ---------------------------------------------------------------------------

interface Agent {
  x: number;
  z: number;
  heading: number;
  speed: number;
  phase: number;
  waypoints: Array<[number, number]>;
  target: number;
  pause: number;
  scale: number;
}

function stepAgent(a: Agent, dt: number, rng: Rng) {
  if (a.pause > 0) {
    a.pause -= dt;
    return 0;
  }
  const [tx, tz] = a.waypoints[a.target];
  const dx = tx - a.x;
  const dz = tz - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.7) {
    a.target = (a.target + 1) % a.waypoints.length;
    if (rng() < 0.35) a.pause = range(rng, 1.5, 7);
    return 0;
  }
  const want = Math.atan2(dx, dz);
  // Shortest-way turn.
  let delta = want - a.heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  a.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, delta));
  const move = a.speed * dt;
  a.x += Math.sin(a.heading) * move;
  a.z += Math.cos(a.heading) * move;
  return a.speed;
}

/** A loop of waypoints scattered around a centre. */
export function wanderLoop(cx: number, cz: number, radius: number, count: number, rng: Rng): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const start = rng() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const a = start + (i / count) * Math.PI * 2;
    const r = radius * range(rng, 0.45, 1);
    points.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return points;
}

// ---------------------------------------------------------------------------
// people
// ---------------------------------------------------------------------------

export type PersonKind = "burgher" | "goodwife" | "soldier" | "sailor" | "lenape" | "child";

export interface PersonSpec {
  kind: PersonKind;
  waypoints: Array<[number, number]>;
}

const COAT_COLORS: Record<PersonKind, number[]> = {
  burgher: [0x2b2a33, 0x3d3226, 0x1f2a33, 0x4a3b2c, 0x33302b],
  goodwife: [0x4a2f38, 0x2f3a4a, 0x53412c, 0x3a3d2c],
  soldier: [0x5a3a22, 0x6b4526, 0x4a4a3a],
  sailor: [0x2c3d4a, 0x4a4438, 0x38424a],
  lenape: [0x6b543a, 0x7a5f42, 0x5c4a33],
  child: [0x4a4234, 0x394230, 0x53483a],
};
const SKIN_TONES = [0xd8ab86, 0xc99570, 0xa9784f, 0x8b6242, 0xe0bd9c, 0x6f4b32];

export interface PeopleSystem {
  update: (dt: number, time: number) => void;
  /** Nearest person to a point, for the "someone is talking to you" prompt. */
  positions: Float32Array;
  count: number;
}

export function buildPeople(
  scene: THREE.Object3D,
  specs: PersonSpec[],
  ground: Ground,
  seed = 21,
): PeopleSystem {
  const rng = mulberry32(seed);
  const n = specs.length;

  // Geometries are authored so their origin is the joint they rotate about.
  const legGeo = new THREE.BoxGeometry(0.17, 0.82, 0.19);
  legGeo.translate(0, -0.41, 0);
  const armGeo = new THREE.BoxGeometry(0.14, 0.66, 0.15);
  armGeo.translate(0, -0.33, 0);
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.31);
  const skirtGeo = new THREE.CylinderGeometry(0.3, 0.46, 0.5, 8);
  const collarGeo = new THREE.BoxGeometry(0.4, 0.08, 0.26);
  const headGeo = new THREE.SphereGeometry(0.135, 10, 8);
  const crownGeo = new THREE.CylinderGeometry(0.155, 0.165, 0.22, 10);
  const brimGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.035, 12);

  const parts: Record<string, Part> = {
    legL: { mesh: instanced(legGeo, n), offset: new THREE.Vector3(-0.13, 0.86, 0) },
    legR: { mesh: instanced(legGeo, n), offset: new THREE.Vector3(0.13, 0.86, 0) },
    armL: { mesh: instanced(armGeo, n), offset: new THREE.Vector3(-0.33, 1.5, 0) },
    armR: { mesh: instanced(armGeo, n), offset: new THREE.Vector3(0.33, 1.5, 0) },
    skirt: { mesh: instanced(skirtGeo, n), offset: new THREE.Vector3(0, 1.02, 0) },
    torso: { mesh: instanced(torsoGeo, n), offset: new THREE.Vector3(0, 1.28, 0) },
    collar: { mesh: instanced(collarGeo, n), offset: new THREE.Vector3(0, 1.63, 0) },
    head: { mesh: instanced(headGeo, n), offset: new THREE.Vector3(0, 1.79, 0) },
    crown: { mesh: instanced(crownGeo, n), offset: new THREE.Vector3(0, 1.93, 0) },
    brim: { mesh: instanced(brimGeo, n), offset: new THREE.Vector3(0, 1.85, 0) },
  };
  for (const part of Object.values(parts)) scene.add(part.mesh);

  const agents: Agent[] = [];
  const hats: number[] = [];
  const color = new THREE.Color();

  specs.forEach((spec, i) => {
    const scale = spec.kind === "child" ? range(rng, 0.62, 0.72) : range(rng, 0.94, 1.06);
    const [sx, sz] = spec.waypoints[0];
    agents.push({
      x: sx,
      z: sz,
      heading: rng() * Math.PI * 2,
      speed: spec.kind === "child" ? range(rng, 1.5, 2.1) : range(rng, 0.7, 1.25),
      phase: rng() * 6.28,
      waypoints: spec.waypoints,
      target: 1 % spec.waypoints.length,
      pause: range(rng, 0, 4),
      scale,
    });

    const coat = pick(rng, COAT_COLORS[spec.kind]);
    const skin = pick(rng, SKIN_TONES);
    const setColor = (key: string, hex: number) => {
      color.setHex(hex).convertSRGBToLinear();
      parts[key].mesh.instanceColor!.setXYZ(i, color.r, color.g, color.b);
    };
    setColor("torso", coat);
    setColor("skirt", spec.kind === "goodwife" ? coat : coat);
    setColor("armL", coat);
    setColor("armR", coat);
    setColor("legL", spec.kind === "lenape" ? skin : 0x3a3630);
    setColor("legR", spec.kind === "lenape" ? skin : 0x3a3630);
    setColor("head", skin);
    setColor(
      "collar",
      spec.kind === "goodwife" || spec.kind === "burgher" ? 0xe8e4d8 : spec.kind === "soldier" ? 0xc9b98f : coat,
    );

    // Hats: broad black felt for the men, a linen cap for the women,
    // nothing for the Lenape or the children running loose.
    let hat = 1;
    if (spec.kind === "lenape") hat = 0;
    else if (spec.kind === "child") hat = rng() < 0.4 ? 1 : 0;
    hats.push(hat);
    const hatColor = spec.kind === "goodwife" ? 0xefeade : spec.kind === "soldier" ? 0x4a3b23 : 0x1e1c1a;
    setColor("crown", hatColor);
    setColor("brim", hatColor);
  });

  for (const part of Object.values(parts)) part.mesh.instanceColor!.needsUpdate = true;

  const positions = new Float32Array(n * 3);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const vec = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const HIDDEN = new THREE.Vector3(0.0001, 0.0001, 0.0001);

  return {
    positions,
    count: n,
    update: (dt, time) => {
      for (let i = 0; i < n; i++) {
        const a = agents[i];
        const moving = stepAgent(a, dt, rng);
        const y = ground(a.x, a.z);
        positions[i * 3] = a.x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = a.z;

        const gait = moving > 0 ? Math.sin(time * 6.4 * (a.speed / 1.1) + a.phase) : 0;
        const bob = moving > 0 ? Math.abs(Math.sin(time * 6.4 * (a.speed / 1.1) + a.phase)) * 0.045 : 0;
        // Idle figures still breathe a little.
        const idle = moving > 0 ? 0 : Math.sin(time * 1.3 + a.phase) * 0.012;

        for (const [key, part] of Object.entries(parts)) {
          if ((key === "crown" || key === "brim") && hats[i] === 0) {
            matrix.compose(vec.set(0, -100, 0), quat.identity(), HIDDEN);
            part.mesh.setMatrixAt(i, matrix);
            continue;
          }
          let swing = 0;
          if (key === "legL" || key === "armR") swing = gait * 0.62;
          else if (key === "legR" || key === "armL") swing = -gait * 0.62;

          euler.set(swing, a.heading, 0, "YXZ");
          quat.setFromEuler(euler);

          const off = part.offset;
          // Rotate the local offset into world space about the agent's heading.
          const ch = Math.cos(a.heading);
          const sh = Math.sin(a.heading);
          vec.set(
            a.x + (off.x * ch + off.z * sh) * a.scale,
            y + (off.y + bob + idle) * a.scale,
            a.z + (-off.x * sh + off.z * ch) * a.scale,
          );
          scaleVec.setScalar(a.scale);
          matrix.compose(vec, quat, scaleVec);
          part.mesh.setMatrixAt(i, matrix);
        }
      }
      for (const part of Object.values(parts)) part.mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------
// animals
// ---------------------------------------------------------------------------

export type AnimalKind = "pig" | "chicken" | "cow" | "goat" | "dog";

export interface AnimalSpec {
  kind: AnimalKind;
  waypoints: Array<[number, number]>;
}

const ANIMAL_SHAPE: Record<AnimalKind, { scale: number; colors: number[]; speed: [number, number] }> = {
  pig: { scale: 0.62, colors: [0xc79a90, 0xb8867c, 0x8e6f66], speed: [0.5, 1.0] },
  chicken: { scale: 0.24, colors: [0xd8cfc0, 0x9a6a3c, 0x2e2b28], speed: [0.6, 1.4] },
  cow: { scale: 1.05, colors: [0x6d5340, 0x3a332c, 0xbfae96], speed: [0.35, 0.7] },
  goat: { scale: 0.55, colors: [0xbcae95, 0x7a6a54], speed: [0.5, 1.1] },
  dog: { scale: 0.5, colors: [0x8a6b46, 0x4a4038, 0xc9b190], speed: [1.2, 2.2] },
};

export function buildAnimals(
  scene: THREE.Object3D,
  specs: AnimalSpec[],
  ground: Ground,
  seed = 77,
): { update: (dt: number, time: number) => void } {
  const rng = mulberry32(seed);
  const n = specs.length;

  const bodyGeo = new THREE.CapsuleGeometry(0.42, 0.9, 4, 8);
  bodyGeo.rotateX(Math.PI / 2);
  const headGeo = new THREE.SphereGeometry(0.3, 8, 7);
  const snoutGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.28, 7);
  snoutGeo.rotateX(Math.PI / 2);
  const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.62, 6);
  legGeo.translate(0, -0.31, 0);
  const tailGeo = new THREE.CylinderGeometry(0.03, 0.06, 0.4, 5);
  tailGeo.translate(0, -0.2, 0);

  const parts: Record<string, Part> = {
    body: { mesh: instanced(bodyGeo, n), offset: new THREE.Vector3(0, 0.78, 0) },
    head: { mesh: instanced(headGeo, n), offset: new THREE.Vector3(0, 0.92, 0.78) },
    snout: { mesh: instanced(snoutGeo, n), offset: new THREE.Vector3(0, 0.86, 1.06) },
    legFL: { mesh: instanced(legGeo, n), offset: new THREE.Vector3(-0.26, 0.78, 0.42) },
    legFR: { mesh: instanced(legGeo, n), offset: new THREE.Vector3(0.26, 0.78, 0.42) },
    legBL: { mesh: instanced(legGeo, n), offset: new THREE.Vector3(-0.26, 0.78, -0.42) },
    legBR: { mesh: instanced(legGeo, n), offset: new THREE.Vector3(0.26, 0.78, -0.42) },
    tail: { mesh: instanced(tailGeo, n), offset: new THREE.Vector3(0, 0.9, -0.78) },
  };
  for (const part of Object.values(parts)) scene.add(part.mesh);

  const agents: Agent[] = [];
  const color = new THREE.Color();

  specs.forEach((spec, i) => {
    const shape = ANIMAL_SHAPE[spec.kind];
    const [sx, sz] = spec.waypoints[0];
    agents.push({
      x: sx,
      z: sz,
      heading: rng() * 6.28,
      speed: range(rng, shape.speed[0], shape.speed[1]),
      phase: rng() * 6.28,
      waypoints: spec.waypoints,
      target: 1 % spec.waypoints.length,
      pause: range(rng, 0, 6),
      scale: shape.scale * range(rng, 0.88, 1.12),
    });
    const hide = pick(rng, shape.colors);
    for (const key of Object.keys(parts)) {
      color.setHex(key === "snout" ? 0xd2a49a : hide).convertSRGBToLinear();
      parts[key].mesh.instanceColor!.setXYZ(i, color.r, color.g, color.b);
    }
  });
  for (const part of Object.values(parts)) part.mesh.instanceColor!.needsUpdate = true;

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const vec = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();

  return {
    update: (dt, time) => {
      for (let i = 0; i < n; i++) {
        const a = agents[i];
        const moving = stepAgent(a, dt, rng);
        const y = ground(a.x, a.z);
        const gait = moving > 0 ? Math.sin(time * 7.2 + a.phase) : 0;
        // Grazing: head dips when the animal stands still.
        const graze = moving > 0 ? 0 : Math.max(0, Math.sin(time * 0.7 + a.phase)) * 0.3;

        for (const [key, part] of Object.entries(parts)) {
          let swing = 0;
          if (key === "legFL" || key === "legBR") swing = gait * 0.5;
          else if (key === "legFR" || key === "legBL") swing = -gait * 0.5;
          else if (key === "tail") swing = Math.sin(time * 3.1 + a.phase) * 0.4;

          const off = part.offset;
          let drop = 0;
          if (key === "head" || key === "snout") drop = -graze;

          euler.set(swing + (key === "head" || key === "snout" ? graze * 1.6 : 0), a.heading, 0, "YXZ");
          quat.setFromEuler(euler);
          const ch = Math.cos(a.heading);
          const sh = Math.sin(a.heading);
          vec.set(
            a.x + (off.x * ch + off.z * sh) * a.scale,
            y + (off.y + drop) * a.scale,
            a.z + (-off.x * sh + off.z * ch) * a.scale,
          );
          scaleVec.setScalar(a.scale);
          matrix.compose(vec, quat, scaleVec);
          part.mesh.setMatrixAt(i, matrix);
        }
      }
      for (const part of Object.values(parts)) part.mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
