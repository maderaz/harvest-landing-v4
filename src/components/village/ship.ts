// The Dutch fluyt at the pier - the ship type that made the West India
// Company's Atlantic trade pay. Pear-shaped in section, narrow at the deck,
// wide at the waterline, because Danish sound tolls were charged on deck
// width. The hull is lofted from ribs rather than approximated with boxes;
// it is the one silhouette in town worth the extra triangles.

import * as THREE from "three";
import type { TownBuilder } from "./builder";
import { sailCloth } from "./textures";

const LENGTH = 30;
const HALF_L = LENGTH / 2;
const BEAM_HALF = 3.6;
const SECTIONS = 26;
const RIB_POINTS = 9;
/** Rib parameter at which the deck is planked; above it is bulwark. */
const DECK_S = 0.8;

/** Half-width of the hull at rib parameter s (0 = keel, 1 = gunwale). */
function ribProfile(s: number): number {
  const swell = Math.sin(Math.min(1, s * 1.45) * Math.PI * 0.5) ** 0.8;
  // Tumblehome: the topsides fall back in above the waterline.
  const tumble = 1 - 0.3 * Math.max(0, (s - 0.55) / 0.45) ** 1.6;
  return swell * tumble;
}

function sectionAt(t: number) {
  const at = Math.abs(t);
  let halfBeam = BEAM_HALF * Math.sqrt(Math.max(0, 1 - at ** 2.6));
  if (t > 0) halfBeam *= 1 - 0.22 * t * t; // finer entry at the bow
  const keelY = -2.5 + 2.0 * at ** 3;
  const deckY = 2.1 + 1.5 * t * t + (t < 0 ? 0.9 * t * t : 0); // sheer, raised aft
  return { halfBeam, keelY, deckY };
}

function buildHull(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];

  const ring = (t: number) => {
    const { halfBeam, keelY, deckY } = sectionAt(t);
    const points: Array<[number, number]> = [];
    for (let k = 0; k < RIB_POINTS; k++) {
      const s = k / (RIB_POINTS - 1);
      points.push([halfBeam * ribProfile(s), keelY + (deckY - keelY) * s]);
    }
    return points;
  };

  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    ua: [number, number],
    ub: [number, number],
    uc: [number, number],
    ud: [number, number],
  ) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    uvs.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  };

  for (let i = 0; i < SECTIONS; i++) {
    const t0 = -1 + (2 * i) / SECTIONS;
    const t1 = -1 + (2 * (i + 1)) / SECTIONS;
    const r0 = ring(t0);
    const r1 = ring(t1);
    const z0 = t0 * HALF_L;
    const z1 = t1 * HALF_L;

    for (let k = 0; k < RIB_POINTS - 1; k++) {
      const s0 = k / (RIB_POINTS - 1);
      const s1 = (k + 1) / (RIB_POINTS - 1);
      for (const side of [1, -1]) {
        const a: [number, number, number] = [side * r0[k][0], r0[k][1], z0];
        const b: [number, number, number] = [side * r1[k][0], r1[k][1], z1];
        const c: [number, number, number] = [side * r1[k + 1][0], r1[k + 1][1], z1];
        const d: [number, number, number] = [side * r0[k + 1][0], r0[k + 1][1], z0];
        // Planking runs fore-and-aft: u follows the hull length.
        const ua: [number, number] = [z0 * 0.5, s0 * 4];
        const ub: [number, number] = [z1 * 0.5, s0 * 4];
        const uc: [number, number] = [z1 * 0.5, s1 * 4];
        const ud: [number, number] = [z0 * 0.5, s1 * 4];
        if (side === 1) quad(a, b, c, d, ua, ub, uc, ud);
        else quad(d, c, b, a, ud, uc, ub, ua);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

function buildDeck(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const deckAt = (t: number) => {
    const { halfBeam, keelY, deckY } = sectionAt(t);
    return { w: halfBeam * ribProfile(DECK_S), y: keelY + (deckY - keelY) * DECK_S, z: t * HALF_L };
  };
  for (let i = 0; i < SECTIONS; i++) {
    const a = deckAt(-1 + (2 * i) / SECTIONS);
    const b = deckAt(-1 + (2 * (i + 1)) / SECTIONS);
    pos.push(-a.w, a.y, a.z, a.w, a.y, a.z, b.w, b.y, b.z);
    pos.push(-a.w, a.y, a.z, b.w, b.y, b.z, -b.w, b.y, b.z);
    uvs.push(0, a.z * 0.5, 2, a.z * 0.5, 2, b.z * 0.5);
    uvs.push(0, a.z * 0.5, 2, b.z * 0.5, 0, b.z * 0.5);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

export interface ShipRig {
  /** Sail planes, gently bellied by the wind each frame. */
  sails: THREE.Mesh[];
  group: THREE.Group;
}

/**
 * Writes the moored fluyt into the town builder (so the deck is walkable and
 * merges with everything else) and returns the rigging that has to animate.
 */
export function buildShip(
  b: TownBuilder,
  scene: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rotY: number,
): ShipRig {
  const place = { x, y, z, rotY };
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  /** Ship-local (right, up, forward) -> world. */
  const at = (lx: number, ly: number, lz: number) => ({
    x: x + lx * cos + lz * sin,
    y: y + ly,
    z: z - lx * sin + lz * cos,
  });

  const hull = buildHull();
  b.add("timber", hull, place);
  hull.dispose();
  const deck = buildDeck();
  b.add("wood", deck, place);
  deck.dispose();

  // Waterline wale: a heavy rubbing strake round the hull.
  for (const t of [-0.75, -0.4, 0, 0.4, 0.75]) {
    const { halfBeam } = sectionAt(t);
    for (const side of [-1, 1]) {
      b.box(
        "wood",
        { w: 0.22, h: 0.3, d: 4.2 },
        { ...at(side * (halfBeam * ribProfile(0.72) + 0.1), 1.35 + t * t * 1.2, t * HALF_L), rotY },
      );
    }
  }

  // Deck is a walkable platform; the bulwarks stop you walking off it.
  const midship = sectionAt(0);
  const deckY = y + midship.keelY + (midship.deckY - midship.keelY) * DECK_S;
  b.colliders.addBox(x, z, BEAM_HALF * 0.75, HALF_L * 0.82, rotY, deckY + 0.05, deckY - 4.5);
  for (const side of [-1, 1]) {
    b.colliders.addBox(
      x + side * (BEAM_HALF * 0.78) * cos,
      z - side * (BEAM_HALF * 0.78) * sin,
      0.3,
      HALF_L * 0.8,
      rotY,
      deckY + 1.0,
      deckY - 1,
    );
  }

  // Stern castle - the fluyt's high, narrow poop.
  b.boxOn("wood", { w: 4.6, h: 2.2, d: 6.0 }, { ...at(0, deckY - y, -HALF_L + 4.2), rotY }, true);
  b.boxOn("wood", { w: 3.8, h: 1.9, d: 4.2 }, { ...at(0, deckY - y + 2.2, -HALF_L + 3.4), rotY }, true);
  for (let i = 0; i < 3; i++) {
    b.box(
      "window",
      { w: 0.7, h: 0.85, d: 0.1 },
      { ...at((i - 1) * 1.1, deckY - y + 3.1, -HALF_L + 1.3), rotY: rotY + Math.PI },
    );
  }
  b.box("gold", { w: 2.6, h: 0.5, d: 0.12 }, { ...at(0, deckY - y + 4.25, -HALF_L + 1.35), rotY });
  // Stern lantern.
  b.cylinder("gold", 0.3, 0.24, 0.7, { ...at(0, deckY - y + 4.9, -HALF_L + 1.9), rotY }, 8);

  // Rudder and tiller.
  b.box("timber", { w: 0.3, h: 4.2, d: 1.4 }, { ...at(0, -0.6, -HALF_L - 0.3), rotY, rotX: -0.12 });

  // Bowsprit.
  b.cylinder("wood", 0.14, 0.24, 9, { ...at(0, 3.2, HALF_L - 1), rotY, rotX: Math.PI / 2 - 0.32 }, 8);

  // Three masts with yards, plus the standing rigging.
  const masts = [
    { lz: 8.5, height: 20, yard: 11, name: "fore" },
    { lz: -0.5, height: 26, yard: 13.5, name: "main" },
    { lz: -9.5, height: 15, yard: 8, name: "mizzen" },
  ];
  const sails: THREE.Mesh[] = [];
  const group = new THREE.Group();
  group.name = "ship-rig";
  scene.add(group);

  for (const mast of masts) {
    b.cylinder(
      "wood",
      0.16,
      0.34,
      mast.height,
      { ...at(0, deckY - y + mast.height / 2, mast.lz), rotY },
      8,
      false,
    );
    b.colliders.addCircle(at(0, 0, mast.lz).x, at(0, 0, mast.lz).z, 0.36, deckY + mast.height, deckY);
    // Top platform.
    b.cylinder("wood", 1.0, 0.9, 0.2, { ...at(0, deckY - y + mast.height * 0.7, mast.lz), rotY }, 10);

    const yardLevels = mast.name === "mizzen" ? [0.55] : [0.42, 0.72];
    for (const level of yardLevels) {
      const yy = deckY - y + mast.height * level;
      const span = mast.yard * (level > 0.6 ? 0.72 : 1);
      b.cylinder("wood", 0.09, 0.12, span, { ...at(0, yy, mast.lz), rotY, rotZ: Math.PI / 2 }, 6);
      sails.push(makeSail(group, at(0, y + yy - 0.05, mast.lz), rotY, span * 0.94, mast.height * 0.24));
    }

    // Shrouds down to the channels.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const spread = 1.6 + i * 0.5;
        const topY = deckY - y + mast.height * 0.68;
        const len = Math.hypot(topY - (deckY - y), spread);
        b.cylinder(
          "rope",
          0.035,
          0.035,
          len,
          {
            ...at(side * spread * 0.5, deckY - y + (topY - (deckY - y)) / 2, mast.lz),
            rotY,
            rotZ: side * Math.atan2(spread, topY - (deckY - y)),
          },
          4,
        );
      }
    }
  }

  // Gangplank across to the pier.
  b.boxOn("wood", { w: 1.3, h: 0.16, d: 5.2 }, { ...at(BEAM_HALF + 1.4, deckY - y - 0.2, 2), rotY: rotY + Math.PI / 2 }, true);

  // Cargo on deck.
  for (let i = 0; i < 4; i++) {
    const p = at(((i % 2) - 0.5) * 2.2, deckY - y + 0.45, 2 + i * 1.6);
    b.cylinder("wood", 0.34, 0.38, 0.9, { ...p, rotY }, 9, true);
  }

  return { sails, group };
}

const sailMaterials: THREE.MeshStandardMaterial[] = [];

function makeSail(
  parent: THREE.Object3D,
  p: { x: number; y: number; z: number },
  rotY: number,
  width: number,
  height: number,
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, height, 10, 6);
  geo.translate(0, -height / 2, 0);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width * 0.3, uv.getY(i) * height * 0.3);
  const cloth = sailCloth();
  const material = new THREE.MeshStandardMaterial({
    map: cloth.map,
    normalMap: cloth.normalMap,
    color: 0xe4dac2,
    roughness: 0.96,
    side: THREE.DoubleSide,
  });
  sailMaterials.push(material);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(p.x, p.y, p.z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.userData.rest = (geo.attributes.position as THREE.BufferAttribute).clone();
  mesh.userData.phase = Math.random() * 6.28;
  parent.add(mesh);
  return mesh;
}

/** Belly the canvas so the sails breathe with the harbour breeze. */
export function updateSails(sails: THREE.Mesh[], time: number) {
  for (const sail of sails) {
    const geo = sail.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const rest = sail.userData.rest as THREE.BufferAttribute;
    const phase = sail.userData.phase as number;
    for (let i = 0; i < pos.count; i++) {
      const x = rest.getX(i);
      const yy = rest.getY(i);
      const slack = Math.cos((x / 8) * Math.PI) * 0.5 + 0.5;
      const droop = Math.min(1, Math.abs(yy) / 3);
      pos.setZ(
        i,
        (Math.sin(time * 1.4 + phase + x * 0.35) * 0.22 + 0.55) * slack * droop +
          Math.sin(time * 2.6 + yy * 1.4) * 0.06,
      );
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
}

export function disposeShip() {
  for (const m of sailMaterials) m.dispose();
  sailMaterials.length = 0;
}
