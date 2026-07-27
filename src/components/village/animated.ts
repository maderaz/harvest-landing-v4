// Things that move: the windmill's sweeps, flags on their poles, chimney
// smoke, the fire in the Lenape clearing, and the gulls that work the
// harbour. Each returns an object with an update(dt, time) method; the
// render loop just walks the list.

import * as THREE from "three";
import { createMaterial, type TownBuilder } from "./builder";
import { princeFlag } from "./textures";
import { mulberry32, range } from "./random";

export interface Animated {
  update: (dt: number, time: number) => void;
}

const owned: Array<{ dispose: () => void }> = [];

function track<T extends THREE.Material | THREE.BufferGeometry>(item: T): T {
  owned.push(item);
  return item;
}

export function disposeAnimated() {
  for (const item of owned) item.dispose();
  owned.length = 0;
}

/**
 * A tower mill on the west shore. The tower and its stage go into the merged
 * town geometry; only the cap and the four sweeps are separate objects.
 */
export function buildWindmill(
  b: TownBuilder,
  scene: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  facing: number,
): Animated {
  const towerH = 12.5;
  b.cylinder("stone", 4.2, 5.2, 2.2, { x, y: y + 1.1, z }, 10, true);
  b.cylinder("timber", 3.0, 4.1, towerH, { x, y: y + 2.2 + towerH / 2, z }, 8, true);
  // Working stage the miller walks to reach the sweeps.
  b.cylinder("wood", 5.0, 5.0, 0.22, { x, y: y + 6.6, z }, 10, false);
  b.colliders.addCircle(x, z, 5.0, y + 6.7, y + 6.4);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.post("wood", 0.07, 1.0, x + Math.cos(a) * 4.85, y + 6.7, z + Math.sin(a) * 4.85, false);
    // Handrail between the posts.
    const next = ((i + 1) / 10) * Math.PI * 2;
    const mid = (a + next) / 2;
    b.box(
      "wood",
      { w: 3.1, h: 0.08, d: 0.08 },
      { x: x + Math.cos(mid) * 4.85, y: y + 7.6, z: z + Math.sin(mid) * 4.85, rotY: -mid },
    );
  }
  b.box("trim", { w: 1.2, h: 2.1, d: 0.14 }, { x: x + 0.2, y: y + 3.2, z: z + 4.15, rotY: 0 });
  for (const a of [0.9, 2.4, 4.0, 5.4]) {
    b.box(
      "window",
      { w: 0.7, h: 0.9, d: 0.12 },
      { x: x + Math.cos(a) * 3.6, y: y + 9.2, z: z + Math.sin(a) * 3.6, rotY: -a + Math.PI / 2 },
    );
  }

  const capY = y + 2.2 + towerH;
  const cap = new THREE.Group();
  cap.position.set(x, capY, z);
  cap.rotation.y = facing;
  scene.add(cap);

  const capMat = createMaterial("thatch");
  const woodMat = createMaterial("wood");
  const timberMat = createMaterial("timber");
  const sailMat = createMaterial("sail");
  sailMat.side = THREE.DoubleSide;
  owned.push(capMat, woodMat, timberMat, sailMat);

  const capGeo = track(new THREE.SphereGeometry(3.4, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2));
  const capMesh = new THREE.Mesh(capGeo, capMat);
  capMesh.scale.set(1, 1.15, 1.25);
  capMesh.castShadow = true;
  cap.add(capMesh);
  // Collar under the cap: the hemisphere is open below, and from the ground
  // you would otherwise see straight through it.
  const collarGeo = track(new THREE.CylinderGeometry(3.4, 3.2, 1.1, 14));
  const collar = new THREE.Mesh(collarGeo, timberMat);
  collar.position.y = -0.5;
  collar.scale.set(1, 1, 1.25);
  collar.castShadow = true;
  cap.add(collar);

  // Tail pole the miller used to luff the cap into the wind.
  const tailGeo = track(new THREE.CylinderGeometry(0.1, 0.16, 9, 6));
  const tail = new THREE.Mesh(tailGeo, timberMat);
  tail.position.set(0, -1.4, 5.2);
  tail.rotation.x = 0.55;
  tail.castShadow = true;
  cap.add(tail);

  // Windshaft, tilted a few degrees up as they always were.
  const shaft = new THREE.Group();
  shaft.position.set(0, 1.3, -3.2);
  shaft.rotation.x = -0.16;
  cap.add(shaft);

  const shaftGeo = track(new THREE.CylinderGeometry(0.28, 0.28, 3.2, 8));
  const shaftMesh = new THREE.Mesh(shaftGeo, timberMat);
  shaftMesh.rotation.x = Math.PI / 2;
  shaft.add(shaftMesh);

  const sweeps = new THREE.Group();
  sweeps.position.z = -1.4;
  shaft.add(sweeps);

  const armGeo = track(new THREE.BoxGeometry(0.28, 13.5, 0.28));
  const barGeo = track(new THREE.BoxGeometry(1.9, 0.09, 0.09));
  const clothGeo = track(new THREE.PlaneGeometry(1.5, 9.5));
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / 4) * Math.PI * 2;
    sweeps.add(arm);

    const stock = new THREE.Mesh(armGeo, timberMat);
    stock.position.y = 6.4;
    stock.castShadow = true;
    arm.add(stock);

    for (let r = 0; r < 9; r++) {
      const bar = new THREE.Mesh(barGeo, woodMat);
      bar.position.set(0.85, 2.6 + r * 1.15, 0);
      arm.add(bar);
    }
    const cloth = new THREE.Mesh(clothGeo, sailMat);
    cloth.position.set(0.86, 7.1, 0.04);
    cloth.castShadow = true;
    arm.add(cloth);
  }

  return {
    update: (dt) => {
      sweeps.rotation.z += dt * 0.55;
    },
  };
}

/** A flag on a pole, rippling. Anchored along its hoist edge. */
export function buildFlag(
  scene: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rotY: number,
  width = 3.2,
  height = 2.1,
): Animated {
  const geo = track(new THREE.PlaneGeometry(width, height, 16, 8));
  geo.translate(width / 2, 0, 0);
  const material = track(
    new THREE.MeshStandardMaterial({
      map: princeFlag(),
      side: THREE.DoubleSide,
      roughness: 0.9,
    }),
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  scene.add(mesh);

  const rest = (geo.attributes.position as THREE.BufferAttribute).clone();
  return {
    update: (_dt, time) => {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const px = rest.getX(i);
        const py = rest.getY(i);
        const t = px / width;
        pos.setZ(i, Math.sin(px * 2.6 - time * 5.2) * 0.32 * t * t + Math.sin(py * 3.1 - time * 3.4) * 0.1 * t);
        pos.setY(i, py + Math.sin(px * 1.8 - time * 4.4) * 0.12 * t);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}

interface Puff {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  rise: number;
  drift: number;
  size: number;
}

/**
 * Chimney and campfire smoke. One instanced mesh covers every source in
 * town; puffs scale up and thin out as they climb, which reads as smoke
 * without needing per-instance alpha.
 */
export function buildSmoke(
  scene: THREE.Object3D,
  sources: Array<{ x: number; y: number; z: number; rate: number }>,
): Animated {
  const perSource = 14;
  const total = sources.length * perSource;
  const geo = track(new THREE.IcosahedronGeometry(0.9, 1));
  const material = track(
    new THREE.MeshStandardMaterial({
      color: 0x8e8b84,
      transparent: true,
      opacity: 0.3,
      roughness: 1,
      depthWrite: false,
    }),
  );
  const mesh = new THREE.InstancedMesh(geo, material, total);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  scene.add(mesh);

  const rng = mulberry32(88);
  const puffs: Puff[] = [];
  for (const source of sources) {
    for (let i = 0; i < perSource; i++) {
      puffs.push({
        x: source.x,
        y: source.y,
        z: source.z,
        age: (i / perSource) * source.rate * perSource,
        life: source.rate * perSource,
        rise: range(rng, 0.7, 1.5),
        drift: range(rng, -0.35, 0.35),
        size: range(rng, 0.35, 0.7),
      });
    }
  }

  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  return {
    update: (dt, time) => {
      for (let i = 0; i < puffs.length; i++) {
        const puff = puffs[i];
        puff.age += dt;
        if (puff.age > puff.life) puff.age -= puff.life;
        const t = puff.age / puff.life;
        const s = puff.size * (0.5 + t * 2.6) * Math.max(0, 1 - t * t);
        position.set(
          puff.x + Math.sin(time * 0.6 + i) * 0.4 * t + puff.drift * t * 6,
          puff.y + t * puff.rise * 9,
          puff.z + Math.cos(time * 0.5 + i * 1.7) * 0.4 * t + puff.drift * t * 4,
        );
        scale.setScalar(Math.max(0.001, s));
        quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i + time * 0.2);
        matrix.compose(position, quat, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** A camp fire: flickering light plus a couple of flame shells. */
export function buildFire(scene: THREE.Object3D, x: number, y: number, z: number): Animated {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  scene.add(group);

  const flameGeo = track(new THREE.ConeGeometry(0.42, 1.3, 7));
  const inner = track(new THREE.MeshBasicMaterial({ color: 0xffc451, transparent: true, opacity: 0.9 }));
  const outer = track(new THREE.MeshBasicMaterial({ color: 0xd8541f, transparent: true, opacity: 0.55 }));
  const flame = new THREE.Mesh(flameGeo, inner);
  flame.position.y = 0.65;
  group.add(flame);
  const flame2 = new THREE.Mesh(flameGeo, outer);
  flame2.position.y = 0.85;
  flame2.scale.set(1.5, 1.4, 1.5);
  group.add(flame2);

  const light = new THREE.PointLight(0xff9a3c, 6, 22, 2);
  light.position.y = 1.2;
  group.add(light);

  return {
    update: (_dt, time) => {
      const flicker = 0.8 + Math.sin(time * 13.7) * 0.12 + Math.sin(time * 7.1) * 0.1;
      flame.scale.set(flicker, 0.85 + flicker * 0.35, flicker);
      flame2.scale.set(1.4 * flicker, 1.2 + flicker * 0.4, 1.4 * flicker);
      flame.rotation.y = time * 1.6;
      flame2.rotation.y = -time * 1.1;
      light.intensity = 5 + flicker * 4;
    },
  };
}

/** Gulls working the harbour in lazy circles. */
export function buildGulls(scene: THREE.Object3D, count: number): Animated {
  const group = new THREE.Group();
  scene.add(group);
  const wingGeo = track(new THREE.PlaneGeometry(1.5, 0.42));
  wingGeo.translate(0.75, 0, 0);
  const material = track(
    new THREE.MeshStandardMaterial({ color: 0xe8e6df, side: THREE.DoubleSide, roughness: 0.9 }),
  );
  const rng = mulberry32(404);

  const birds: Array<{
    obj: THREE.Group;
    left: THREE.Mesh;
    right: THREE.Mesh;
    cx: number;
    cz: number;
    radius: number;
    height: number;
    speed: number;
    phase: number;
  }> = [];

  for (let i = 0; i < count; i++) {
    const bird = new THREE.Group();
    const left = new THREE.Mesh(wingGeo, material);
    const right = new THREE.Mesh(wingGeo, material);
    right.rotation.y = Math.PI;
    bird.add(left, right);
    group.add(bird);
    birds.push({
      obj: bird,
      left,
      right,
      cx: range(rng, -40, 110),
      cz: range(rng, -10, 110),
      radius: range(rng, 18, 55),
      height: range(rng, 14, 34),
      speed: range(rng, 0.14, 0.3),
      phase: range(rng, 0, 6.3),
    });
  }

  return {
    update: (_dt, time) => {
      for (const bird of birds) {
        const a = time * bird.speed + bird.phase;
        const x = bird.cx + Math.cos(a) * bird.radius;
        const z = bird.cz + Math.sin(a) * bird.radius * 0.75;
        bird.obj.position.set(x, bird.height + Math.sin(a * 2.3) * 2.4, z);
        bird.obj.rotation.y = -a + Math.PI / 2;
        bird.obj.rotation.z = Math.sin(a * 2.3) * 0.2;
        const flap = Math.sin(time * 5.5 + bird.phase) * 0.55;
        bird.left.rotation.z = flap;
        bird.right.rotation.z = -flap;
      }
    },
  };
}
