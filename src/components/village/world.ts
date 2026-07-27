// Nieuw Amsterdam, laid out.
//
// The plan follows the Castello Plan of 1660 as closely as a walkable
// 250-metre world allows: the fort on the point, the Heere Gracht running
// inland from the harbour, the Strand along the East River, the palisade
// across the top of town, and the bouwerijen and woods beyond it.
//
// +X is east (the East River), -X west (the North River, later the Hudson),
// +Z is south (the harbour), -Z north (up the island).

import * as THREE from "three";
import { TownBuilder, type MaterialKey } from "./builder";
import { mulberry32, range, rangeInt, type Rng } from "./random";
import { CANAL_HALF, CANAL_X, CANAL_Z_NORTH, landHeight, TOWN_Y } from "./terrain";
import * as S from "./structures";
import { buildShip, updateSails } from "./ship";
import {
  buildFire,
  buildFlag,
  buildGulls,
  buildSmoke,
  buildWindmill,
  type Animated,
} from "./animated";
import { buildAnimals, buildPeople, wanderLoop, type AnimalSpec, type PersonSpec } from "./npcs";

export interface Landmark {
  id: string;
  title: string;
  dutch?: string;
  today: string;
  year: string;
  blurb: string;
  x: number;
  z: number;
  radius: number;
}

export interface WorldResult {
  builder: TownBuilder;
  landmarks: Landmark[];
  spawn: { x: number; z: number; yaw: number };
  attachPopulation: (ground: (x: number, z: number) => number) => void;
  update: (dt: number, time: number) => void;
  setLampGlow: (value: number) => void;
  /** Building footprints for the minimap, in world units. */
  mapShapes: Array<{ x: number; z: number; w: number; d: number; rot: number }>;
  /** Street centre lines for the minimap. */
  mapRoads: Array<{ points: Array<[number, number]>; width: number }>;
}

const g = (x: number, z: number) => landHeight(x, z);
/** Buildings sit slightly into the ground so a slope shows no gap. */
const base = (x: number, z: number) => landHeight(x, z) - 0.22;

// ---------------------------------------------------------------------------
// street helpers
// ---------------------------------------------------------------------------

type Point = [number, number];

/** Lay a road ribbon that follows the ground along a polyline. */
function pave(b: TownBuilder, key: MaterialKey, points: Point[], width: number) {
  const pos: number[] = [];
  const uvs: number[] = [];
  const scale = b.uvPerMeter(key);
  let travelled = 0;

  const samples: Array<{ x: number; z: number; nx: number; nz: number; v: number }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.001) continue;
    const steps = Math.max(1, Math.round(len / 3));
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      samples.push({
        x: x0 + (x1 - x0) * t,
        z: z0 + (z1 - z0) * t,
        nx: -dz,
        nz: dx,
        v: travelled + len * t,
      });
    }
    travelled += len;
    if (i === points.length - 2) samples.push({ x: x1, z: z1, nx: -dz, nz: dx, v: travelled });
  }

  const hw = width / 2;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const c = samples[i + 1];
    const corners: Array<[number, number, number, number]> = [
      [a.x - a.nx * hw, a.z - a.nz * hw, a.v, 0],
      [a.x + a.nx * hw, a.z + a.nz * hw, a.v, width],
      [c.x + c.nx * hw, c.z + c.nz * hw, c.v, width],
      [c.x - c.nx * hw, c.z - c.nz * hw, c.v, 0],
    ];
    const y = corners.map(([px, pz]) => g(px, pz) + 0.055);
    const push = (i0: number, i1: number, i2: number) => {
      for (const idx of [i0, i1, i2]) {
        pos.push(corners[idx][0], y[idx], corners[idx][1]);
        uvs.push(corners[idx][3] * scale, corners[idx][2] * scale);
      }
    };
    push(0, 1, 2);
    push(0, 2, 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  b.add(key, geo, { x: 0, y: 0, z: 0 });
  geo.dispose();
}

interface TerraceOptions {
  from: Point;
  to: Point;
  /** +1 or -1: which side of the line the houses stand on. */
  side: 1 | -1;
  /** Gap between the line and the house fronts. */
  setback: number;
  minWidth?: number;
  maxWidth?: number;
  depth?: number;
  floors?: [number, number];
  gap?: [number, number];
  wall?: MaterialKey;
  yards?: boolean;
  avoid?: Array<{ x: number; z: number; r: number }>;
}

/** A row of houses turned gable-end to the street. */
function terrace(b: TownBuilder, rng: Rng, o: TerraceOptions, shapes: WorldResult["mapShapes"]): void {
  const [x0, z0] = o.from;
  const [x1, z1] = o.to;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const dx = (x1 - x0) / len;
  const dz = (z1 - z0) / len;
  // Normal pointing to the side the houses stand on.
  const nx = dz * o.side;
  const nz = -dx * o.side;
  // The facade (local -Z) must look back across the street, so the house's
  // forward axis is +n: sin(rotY) = nx, cos(rotY) = nz.
  const rotY = Math.atan2(nx, nz);

  const minW = o.minWidth ?? 5.5;
  const maxW = o.maxWidth ?? 8.5;
  const depth = o.depth ?? 10.5;

  let cursor = range(rng, 0.5, 3.5);
  while (cursor < len - minW) {
    const w = range(rng, minW, Math.min(maxW, len - cursor));
    const centre = cursor + w / 2;
    const px = x0 + dx * centre + nx * (o.setback + depth / 2);
    const pz = z0 + dz * centre + nz * (o.setback + depth / 2);
    cursor += w + range(rng, o.gap?.[0] ?? 0.3, o.gap?.[1] ?? 2.4);

    if (o.avoid?.some((a) => Math.hypot(px - a.x, pz - a.z) < a.r)) continue;
    // Never build below the tide line.
    if (landHeight(px, pz) < 0.2) continue;

    const floors = rangeInt(rng, o.floors?.[0] ?? 1, o.floors?.[1] ?? 2);
    const jitter = (rng() - 0.5) * 0.05;
    S.dutchHouse(b, {
      x: px,
      z: pz,
      y: base(px, pz),
      width: w,
      depth,
      floors,
      rotY: rotY + jitter,
      wall: o.wall,
      rng,
    });
    shapes.push({ x: px, z: pz, w, d: depth, rot: rotY + jitter });

    // Back yards: a fruit tree or a privy behind the house.
    if (o.yards !== false && rng() < 0.45) {
      const yx = px + nx * (depth / 2 + 3.2);
      const yz = pz + nz * (depth / 2 + 3.2);
      if (landHeight(yx, yz) < 0.2) continue;
      if (rng() < 0.55) {
        S.tree(b, yx, yz, base(yx, yz), rng);
      } else {
        b.boxOn("wood", { w: 1.3, h: 2.0, d: 1.3 }, { x: yx, y: base(yx, yz), z: yz, rotY }, true);
        b.pyramid("thatch", 1.7, 0.7, 1.7, { x: yx, y: base(yx, yz) + 2.0, z: yz, rotY });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// key coordinates
// ---------------------------------------------------------------------------

const FORT = { x: -30, z: 44, half: 27 };
const WALL_Z = -46;
const PIER_Z = 34;
const PIER_DECK = 1.6;

// ---------------------------------------------------------------------------
// the landmarks
// ---------------------------------------------------------------------------

const LANDMARKS: Landmark[] = [
  {
    id: "fort",
    title: "Fort Amsterdam",
    dutch: "Fort Amsterdam",
    today: "The Custom House site, at Bowling Green",
    year: "begun 1625",
    blurb:
      "Four earth-and-stone bastions thrown up by the West India Company at the tip of the island, and the reason the settlement stood here at all. It never once repelled an attack. In 1664 an English fleet anchored in the harbour, Peter Stuyvesant was talked out of firing a shot by his own burghers, and the colony changed hands without a casualty.",
    x: -24,
    z: 12,
    radius: 11,
  },
  {
    id: "church",
    title: "St. Nicholas Church",
    dutch: "De Kerk in het Fort",
    today: "Ancestor of the Collegiate congregation",
    year: "1642",
    blurb:
      "Seventy-two feet of stone raised inside the fort walls, funded at the wedding feast of Sophia Roelants, where Director Kieft kept the guests drinking until they had all pledged generously. Services ran in Dutch here for a century after the English took the town.",
    x: -38,
    z: 33,
    radius: 12,
  },
  {
    id: "gracht",
    title: "The Heere Gracht",
    dutch: "Heere Gracht",
    today: "Broad Street",
    year: "canal cut 1657",
    blurb:
      "A proper Dutch canal, tidal and increasingly foul, dug inland from the East River so lighters could unload at the merchants' own doors. The English filled it in during the 1670s. The street that replaced it is unusually broad for lower Manhattan because it is, quite literally, a filled-in ditch.",
    x: 38,
    z: 26,
    radius: 10,
  },
  {
    id: "wall",
    title: "The Wall",
    dutch: "De Waal",
    today: "Wall Street",
    year: "1653",
    blurb:
      "A twelve-foot oak palisade with an earth bank, run right across the island in a panic over an English attack out of New England that never came. The Company charged the burghers for it. It came down in 1699; the lane that ran along the inside of it kept the name.",
    x: -10,
    z: -42,
    radius: 12,
  },
  {
    id: "heerestraat",
    title: "Heere Straat",
    dutch: "Heere Straat",
    today: "Broadway",
    year: "older than the town",
    blurb:
      "The high street, running north from the fort gate and out through the Landpoort. Beyond the wall it became the Wickquasgeck trail, the Lenape path along the spine of Manahatta that traders had walked for generations. Broadway's odd diagonal kinks are all inherited from it.",
    x: -24,
    z: -18,
    radius: 10,
  },
  {
    id: "strand",
    title: "The Strand",
    dutch: "De Strand",
    today: "Pearl Street",
    year: "1620s",
    blurb:
      "The shoreline road, named for the oyster shells that paved it - the beds in the harbour were so vast that shells were the cheapest hardcore going. Everything east of here is landfill. The original waterline now sits three blocks inland.",
    x: 52,
    z: 46,
    radius: 12,
  },
  {
    id: "stadthuys",
    title: "The Stadt Huys",
    dutch: "Stadt Huys",
    today: "85 Broad Street",
    year: "tavern 1642, city hall 1653",
    blurb:
      "Built as the Stadt Herberg, the Company's stone tavern, because visiting sailors kept bedding down in Director Kieft's own house. In 1653 it became city hall, when Nieuw Amsterdam was granted municipal government - the first on the island. Its foundations were dug up in 1979 and are marked in the pavement.",
    x: 73,
    z: 17,
    radius: 11,
  },
  {
    id: "waag",
    title: "The Weigh House & Market",
    dutch: "De Waag",
    today: "Near Whitehall and Bridge Streets",
    year: "market chartered 1656",
    blurb:
      "Everything brought to market was weighed here and the duty taken. The trade that mattered was beaver: some eighty thousand pelts left through this town in a single decade, and pelts served as money whenever coin ran short, which was most of the time.",
    x: 53,
    z: 34,
    radius: 10,
  },
  {
    id: "pier",
    title: "The Pier & the Fluyt",
    dutch: "De Brugh",
    today: "Roughly Moore Street at the river",
    year: "1648",
    blurb:
      "The town's one deepwater berth, and the fluyt tied up alongside it - the cheap, capacious, lightly crewed Dutch merchantman that made the Atlantic trade pay. Its pear-shaped hull is deliberate: Danish sound tolls were levied on deck width, so the deck was kept narrow and the belly let out below.",
    x: 76,
    z: 27,
    radius: 12,
  },
  {
    id: "windmill",
    title: "The Windmill",
    dutch: "De Molen",
    today: "Near Battery Place",
    year: "1626",
    blurb:
      "Grain first, then bark for the tanners, then sawn timber. The mill stood on the North River shore where the wind came clean off the water. When its sweeps were furled, the whole town knew weather was coming in.",
    x: -60,
    z: -6,
    radius: 13,
  },
  {
    id: "garden",
    title: "The Company Garden",
    dutch: "De Compagnies Tuyn",
    today: "Bowling Green",
    year: "1620s",
    blurb:
      "The Company's kitchen garden and orchard outside the fort gate, later a parade ground and cattle market. It became New York's first public park in 1733, leased to three neighbours for one peppercorn a year, and it is still there - the oldest park in the city.",
    x: -41,
    z: 10,
    radius: 10,
  },
  {
    id: "well",
    title: "The Town Well",
    dutch: "De Put",
    today: "Near Pearl and Broad",
    year: "1658",
    blurb:
      "Manhattan's groundwater was brackish nearly everywhere, and the wells the town dug were poor. Good water had to be carted down from the Collect Pond to the north. Complaints about the taste of New York water are older than New York.",
    x: 49,
    z: 12,
    radius: 8,
  },
  {
    id: "bouwerij",
    title: "The Bouwerij",
    dutch: "Bouwerij No. 1",
    today: "The Bowery",
    year: "1651",
    blurb:
      "The Company farms north of the wall. Stuyvesant bought the largest for 6,400 guilders and worked it until he died; he is buried in the chapel he built there, now St. Mark's in-the-Bowery. The Dutch for farm is bouwerij, and the road out to them kept the name.",
    x: 0,
    z: -62,
    radius: 14,
  },
  {
    id: "manahatta",
    title: "Manahatta",
    dutch: "Lenapehoking",
    today: "All of it",
    year: "long before 1624",
    blurb:
      "The island of many hills, home of the Lenape, who moved between planting grounds, fishing camps and hunting country by season. The 1626 'purchase' for sixty guilders of trade goods was almost certainly not understood by both sides as the same transaction. Lenape trails, camps and clearings stayed in use right through the Dutch period.",
    x: 40,
    z: -104,
    radius: 16,
  },
];

// ---------------------------------------------------------------------------
// world assembly
// ---------------------------------------------------------------------------

export function buildWorld(scene: THREE.Object3D): WorldResult {
  const b = new TownBuilder();
  const rng = mulberry32(1624);
  const animations: Animated[] = [];
  const mapShapes: WorldResult["mapShapes"] = [];
  const mapRoads: WorldResult["mapRoads"] = [];
  /** Pave a street and record it for the minimap in one call. */
  const road = (key: MaterialKey, points: Point[], width: number) => {
    pave(b, key, points, width);
    mapRoads.push({ points, width });
  };

  // --- streets --------------------------------------------------------
  const heereStraat: Point[] = [
    [-30, -4],
    [-30, -34],
    [-32, -66],
    [-34, -104],
    [-30, -150],
  ];
  const strand: Point[] = [
    [54, 52],
    [60, 40],
    [63, 20],
    [62, -4],
    [58, -26],
  ];
  const brughStraat: Point[] = [
    [-12, 18],
    [62, 18],
  ];
  const beverStraat: Point[] = [
    [-30, -4],
    [61, -4],
  ];
  const hooghStraat: Point[] = [
    [-6, -22],
    [59, -22],
  ];
  const waalStraat: Point[] = [
    [-66, -38],
    [70, -38],
  ];

  road("dirt", heereStraat, 9);
  road("cobble", strand, 9);
  road("dirt", brughStraat, 8);
  road("dirt", beverStraat, 7);
  road("dirt", hooghStraat, 7);
  road("dirt", waalStraat, 8);
  road("cobble", [[38, 30], [58, 30]], 16); // Marckvelt, the market square
  road("dirt", [[34, 40], [56, 40]], 6); // Slyck Steegh
  road("dirt", [[-12, 18], [-26, 2]], 6); // lane down to the green
  road("cobble", [[CANAL_X - 7.5, CANAL_Z_NORTH], [CANAL_X - 7.5, 78]], 5);
  road("cobble", [[CANAL_X + 7.5, CANAL_Z_NORTH], [CANAL_X + 7.5, 78]], 5);

  // --- the canal -------------------------------------------------------
  S.canalQuay(b, CANAL_X, CANAL_HALF, CANAL_Z_NORTH, 80, TOWN_Y);
  for (const z of [18, -4]) S.bridge(b, CANAL_X, z, TOWN_Y, CANAL_HALF * 2 + 3.6, 7);
  S.rowboat(b, CANAL_X - 1.4, -0.5, 36, 0.06);
  S.rowboat(b, CANAL_X + 1.2, -0.5, 56, -0.1);

  // --- the fort ---------------------------------------------------------
  const fortY = base(FORT.x, FORT.z);
  const fortInfo = S.fort(b, FORT.x, FORT.z, fortY);
  for (const c of fortInfo.cannons) S.cannon(b, c.x, c.y, c.z, c.rotY);
  mapShapes.push({ x: FORT.x, z: FORT.z, w: 62, d: 62, rot: 0 });
  animations.push(
    buildFlag(scene, fortInfo.flagpole.x + 0.12, fortInfo.flagpole.y, fortInfo.flagpole.z, 0.4, 4.4, 2.9),
  );

  // --- the Company garden, outside the fort gate -------------------------
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = -40 + col * 6.5;
      const z = 1 + row * 4.5;
      b.boxOn("leaf", { w: 4.6, h: 0.6, d: 2.4 }, { x, y: base(x, z), z });
    }
  }
  // Fruit trees down the west side only - Broadway runs through x = -30 and
  // the fort gate has to stay in view from the green.
  for (let i = 0; i < 8; i++) {
    const x = -45 + (i % 2) * 7;
    const z = 15 - Math.floor(i / 2) * 4.5;
    S.tree(b, x, z, base(x, z), rng);
  }
  // Open on the north side, where the lane comes down from Bever Straat.
  S.fence(
    b,
    [
      [-46, 0],
      [-46, 15],
      [-17, 15],
      [-17, 0],
    ],
    g,
  );

  // --- the palisade and its gates ----------------------------------------
  S.palisade(b, -70, WALL_Z, 70, WALL_Z, g, [{ at: 38, width: 10 }, { at: 128, width: 8 }], rng);
  S.landGate(b, -32, WALL_Z, base(-32, WALL_Z), Math.PI / 2, 8);
  S.landGate(b, 58, WALL_Z, base(58, WALL_Z), Math.PI / 2, 6);
  b.boxOn("timber", { w: 8, h: 5, d: 8 }, { x: -66, y: base(-66, WALL_Z), z: WALL_Z, rotY: 0.2 }, true);
  b.pyramid("roof", 9.6, 3, 9.6, { x: -66, y: base(-66, WALL_Z) + 5, z: WALL_Z, rotY: 0.2 });
  S.cannon(b, -62, base(-62, WALL_Z - 5), WALL_Z - 5, Math.PI);
  mapShapes.push({ x: -66, z: WALL_Z, w: 8, d: 8, rot: 0.2 });

  // --- the Strand, the Stadt Huys, the warehouses -------------------------
  S.stadtHuys(b, 73, 6, base(73, 6), -Math.PI / 2 + 0.06);
  mapShapes.push({ x: 73, z: 6, w: 11, d: 14, rot: 0 });
  for (let i = 0; i < 4; i++) {
    const x = 72 + (i % 2) * 1.5;
    const z = 46 - i * 9;
    const width = range(rng, 9, 11);
    S.warehouse(b, { x, z, y: base(x, z), width, depth: 10, rotY: -Math.PI / 2 + range(rng, -0.05, 0.05), rng });
    mapShapes.push({ x, z, w: 10, d: width, rot: 0 });
    S.cargoPile(b, x - 8, z - 3, base(x - 8, z - 3), rng, 5);
  }

  // --- market square -------------------------------------------------------
  S.weighHouse(b, 44, 34, base(44, 34), 0);
  mapShapes.push({ x: 44, z: 34, w: 9, d: 7, rot: 0 });
  for (let i = 0; i < 8; i++) {
    const x = 38 + (i % 4) * 5;
    const z = 25 + Math.floor(i / 4) * 4.5;
    S.marketStall(b, x, z, base(x, z), i % 2 ? 0 : Math.PI / 2, rng);
  }
  S.well(b, 49, 15, base(49, 15));
  S.gallows(b, 60, 47, base(60, 47), 0.4);
  S.handCart(b, 40, 38, base(40, 38), 1.1);
  S.cargoPile(b, 56, 26, base(56, 26), rng, 7);

  // --- the pier and the fluyt -----------------------------------------------
  S.pier(b, 76, PIER_Z, 34, 7, PIER_DECK, (x, z) => Math.min(-1, landHeight(x, z)));
  S.cargoPile(b, 80, PIER_Z + 1, PIER_DECK, rng, 6);
  const rig = buildShip(b, scene, 104, 0.4, 25, -Math.PI / 2);
  animations.push(buildFlag(scene, 104.5, 24.5, 25.4, Math.PI, 3.4, 2.2));
  mapShapes.push({ x: 104, z: 25, w: 8, d: 30, rot: -Math.PI / 2 });

  // Ferry landing for Breuckelen, across the river.
  S.pier(b, 66, -20, 14, 4, 1.4, (x, z) => Math.min(-1, landHeight(x, z)));
  S.rowboat(b, 78, -0.2, -23, 0.3);
  b.post("timber", 0.2, 2.6, 66, base(66, -16), -16, true);
  b.box("wood", { w: 1.5, h: 0.9, d: 0.1 }, { x: 66, y: base(66, -16) + 2.4, z: -16, rotY: 0.4 });

  // --- the windmill -----------------------------------------------------------
  // Clear of the fort's north-west bastion, on the North River bluff.
  const millX = -70;
  const millZ = -6;
  animations.push(buildWindmill(b, scene, millX, base(millX, millZ), millZ, 0.9));
  mapShapes.push({ x: millX, z: millZ, w: 11, d: 11, rot: 0 });

  // --- the houses ---------------------------------------------------------------
  const avoid = [
    { x: 73, z: 6, r: 16 },
    { x: 44, z: 34, r: 13 },
    { x: 49, z: 15, r: 7 },
    { x: FORT.x, z: FORT.z, r: 42 },
    { x: millX, z: millZ, r: 16 },
  ];
  // Brugh Straat, both sides.
  terrace(b, rng, { from: [-10, 22], to: [14, 22], side: -1, setback: 2.5, avoid }, mapShapes);
  terrace(b, rng, { from: [-10, 14], to: [14, 14], side: 1, setback: 2.5, avoid }, mapShapes);
  terrace(b, rng, { from: [40, 14], to: [58, 14], side: 1, setback: 2.5, avoid }, mapShapes);
  // Between Bever Straat and Hoogh Straat.
  terrace(
    b,
    rng,
    { from: [-10, -7.5], to: [57, -7.5], side: 1, setback: 2, depth: 8, avoid },
    mapShapes,
  );
  // Between Hoogh Straat and the wall lane.
  terrace(
    b,
    rng,
    { from: [-4, -25.5], to: [55, -25.5], side: 1, setback: 1.5, depth: 6.5, floors: [1, 1], avoid },
    mapShapes,
  );
  // Both sides of Broadway, running up to the gate.
  terrace(b, rng, { from: [-34.5, -8], to: [-36.5, -34], side: 1, setback: 2.5, depth: 9, avoid }, mapShapes);
  terrace(b, rng, { from: [-25.5, -8], to: [-27.5, -34], side: -1, setback: 4, depth: 9, avoid }, mapShapes);
  // Canal-side merchants: the best addresses in town, in yellow Dutch brick.
  terrace(
    b,
    rng,
    {
      from: [CANAL_X - 11, 68],
      to: [CANAL_X - 11, 24],
      side: 1,
      setback: 1.5,
      wall: "brickYellow",
      floors: [2, 3],
      avoid,
    },
    mapShapes,
  );
  terrace(
    b,
    rng,
    {
      from: [CANAL_X + 11, 46],
      to: [CANAL_X + 11, 68],
      side: 1,
      setback: 1.5,
      wall: "brickYellow",
      floors: [2, 3],
      avoid,
    },
    mapShapes,
  );

  // --- north of the wall: farms, orchards, woods ------------------------------
  S.farmstead(b, 10, -66, base(10, -66), -0.35, rng);
  mapShapes.push({ x: 10, z: -66, w: 11, d: 7, rot: -0.35 });
  S.farmstead(b, -58, -84, base(-58, -84), 1.9, rng);
  mapShapes.push({ x: -58, z: -84, w: 11, d: 7, rot: 1.9 });

  for (let f = 0; f < 4; f++) {
    const cx = -14 + f * 15;
    const cz = -88 - (f % 2) * 8;
    pave(b, "field", [[cx, cz - 13], [cx, cz + 13]], 10);
    S.fence(
      b,
      [
        [cx - 6, cz - 15],
        [cx + 6, cz - 15],
        [cx + 6, cz + 15],
        [cx - 6, cz + 15],
        [cx - 6, cz - 15],
      ],
      g,
    );
  }
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 7; col++) {
      const x = -50 + col * 6.5;
      const z = -56 - row * 7;
      S.tree(b, x + range(rng, -1, 1), z + range(rng, -1, 1), base(x, z), rng);
    }
  }

  // Woodland, thinning as it comes down towards the town.
  for (let i = 0; i < 340; i++) {
    const x = range(rng, -150, 150);
    const z = range(rng, -235, -55);
    const h = landHeight(x, z);
    if (h < 1.0) continue;
    if (Math.abs(x + 31) < 9 && z > -170) continue; // keep Broadway clear
    if (Math.hypot(x - 40, z + 112) < 24) continue; // and the camp
    if (z > -104 && Math.hypot(x - 4, z + 76) < 52) continue; // and the farmland
    S.tree(b, x, z, h - 0.2, rng, rng() < 0.42);
  }
  for (let i = 0; i < 46; i++) {
    const x = range(rng, -86, -64);
    const z = range(rng, -44, 8);
    const h = landHeight(x, z);
    if (h < 1.0) continue;
    if (Math.hypot(x - millX, z - millZ) < 16) continue; // the mill needs its wind
    S.tree(b, x, z, h - 0.2, rng, rng() < 0.3);
  }

  // --- the Lenape camp ----------------------------------------------------------
  const campX = 40;
  const campZ = -118;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const x = campX + Math.cos(a) * 9;
    const z = campZ + Math.sin(a) * 9;
    S.wigwam(b, x, z, base(x, z), rng);
    mapShapes.push({ x, z, w: 6, d: 6, rot: 0 });
  }
  S.dryingRack(b, campX + 6, campZ - 7, base(campX + 6, campZ - 7), 0.6, rng);
  S.dryingRack(b, campX - 7, campZ + 5, base(campX - 7, campZ + 5), 2.1, rng);
  animations.push(buildFire(scene, campX, base(campX, campZ) + 0.1, campZ));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.post("timber", 0.12, 0.7, campX + Math.cos(a) * 1.7, base(campX, campZ), campZ + Math.sin(a) * 1.7, false);
  }

  // --- landmark posts -------------------------------------------------------------
  for (const landmark of LANDMARKS) landmarkPost(b, landmark.x, landmark.z);

  // --- smoke and gulls --------------------------------------------------------------
  animations.push(
    buildSmoke(scene, [
      { x: 10, y: base(10, -66) + 7.6, z: -66, rate: 0.42 },
      { x: -58, y: base(-58, -84) + 7.6, z: -84, rate: 0.5 },
      { x: campX, y: base(campX, campZ) + 2.4, z: campZ, rate: 0.3 },
      { x: 2, y: base(2, 8) + 9, z: 8, rate: 0.55 },
      { x: 46, y: base(46, 12) + 9, z: 12, rate: 0.6 },
      { x: 73, y: base(73, 6) + 17, z: 6, rate: 0.5 },
      { x: 18, y: base(18, 40) + 11, z: 40, rate: 0.48 },
    ]),
  );
  animations.push(buildGulls(scene, 14));

  // --- the population -----------------------------------------------------------------
  const people: PersonSpec[] = [];
  const along = (points: Point[], count: number, kind: PersonSpec["kind"]) => {
    for (let i = 0; i < count; i++) {
      const spread = range(rng, -2.5, 2.5);
      const path: Point[] = points.map(([x, z]) => [x + spread, z + range(rng, -1.5, 1.5)]);
      people.push({ kind, waypoints: [...path, ...path.slice(0, -1).reverse()] });
    }
  };
  along(brughStraat, 3, "burgher");
  along(beverStraat, 2, "goodwife");
  along(strand, 3, "sailor");
  along(heereStraat.slice(0, 3), 3, "burgher");
  along(waalStraat, 2, "soldier");
  for (let i = 0; i < 4; i++) people.push({ kind: "goodwife", waypoints: wanderLoop(46, 30, 9, 5, rng) });
  for (let i = 0; i < 3; i++) people.push({ kind: "sailor", waypoints: wanderLoop(84, 32, 6, 4, rng) });
  for (let i = 0; i < 3; i++) people.push({ kind: "soldier", waypoints: wanderLoop(FORT.x, FORT.z - 8, 12, 5, rng) });
  for (let i = 0; i < 4; i++) {
    people.push({ kind: "child", waypoints: wanderLoop(range(rng, 0, 40), range(rng, 0, 22), 11, 6, rng) });
  }
  for (let i = 0; i < 4; i++) people.push({ kind: "lenape", waypoints: wanderLoop(campX, campZ, 11, 5, rng) });
  for (let i = 0; i < 3; i++) {
    people.push({ kind: "burgher", waypoints: wanderLoop(range(rng, 10, 50), range(rng, -20, 10), 13, 5, rng) });
  }
  for (let i = 0; i < 2; i++) people.push({ kind: "goodwife", waypoints: wanderLoop(10, -66, 13, 5, rng) });

  const animals: AnimalSpec[] = [];
  for (let i = 0; i < 7; i++) {
    animals.push({ kind: "pig", waypoints: wanderLoop(range(rng, 0, 50), range(rng, -24, 20), 8, 4, rng) });
  }
  for (let i = 0; i < 10; i++) {
    animals.push({ kind: "chicken", waypoints: wanderLoop(range(rng, 24, 54), range(rng, 8, 36), 4, 4, rng) });
  }
  for (let i = 0; i < 6; i++) {
    animals.push({ kind: "cow", waypoints: wanderLoop(range(rng, -6, 24), range(rng, -78, -58), 12, 4, rng) });
  }
  for (let i = 0; i < 4; i++) animals.push({ kind: "goat", waypoints: wanderLoop(-52, -80, 13, 4, rng) });
  for (let i = 0; i < 3; i++) {
    animals.push({ kind: "dog", waypoints: wanderLoop(range(rng, -10, 50), range(rng, -20, 30), 19, 6, rng) });
  }

  b.build(scene);
  const windowMesh = scene.getObjectByName("town-window") as THREE.Mesh | undefined;

  let peopleSystem: ReturnType<typeof buildPeople> | null = null;
  let animalSystem: ReturnType<typeof buildAnimals> | null = null;

  return {
    builder: b,
    landmarks: LANDMARKS,
    // On Brugh Straat, a few paces west of the bridge over the gracht.
    spawn: { x: 14, z: 18, yaw: -Math.PI / 2 },
    mapShapes,
    mapRoads,
    attachPopulation: (ground) => {
      peopleSystem = buildPeople(scene, people, ground);
      animalSystem = buildAnimals(scene, animals, ground);
    },
    setLampGlow: (value) => {
      const mat = windowMesh?.material as THREE.MeshStandardMaterial | undefined;
      if (mat) mat.emissiveIntensity = value * 1.7;
    },
    update: (dt, time) => {
      peopleSystem?.update(dt, time);
      animalSystem?.update(dt, time);
      for (const anim of animations) anim.update(dt, time);
      updateSails(rig.sails, time);
    },
  };
}

/** A carved post beside each landmark, so the plaques have somewhere to be. */
function landmarkPost(b: TownBuilder, x: number, z: number) {
  const y = base(x, z);
  b.post("timber", 0.13, 1.9, x, y, z, true);
  b.box("wood", { w: 1.5, h: 0.55, d: 0.08 }, { x, y: y + 1.75, z, rotY: 0.3 });
  b.box("iron", { w: 1.35, h: 0.06, d: 0.11 }, { x, y: y + 1.5, z, rotY: 0.3 });
  b.box("gold", { w: 0.9, h: 0.16, d: 0.1 }, { x, y: y + 1.78, z, rotY: 0.3 });
}
