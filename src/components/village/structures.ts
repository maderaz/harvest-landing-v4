// The architectural vocabulary of Nieuw Amsterdam.
//
// Everything here writes into a TownBuilder, so a whole street of houses
// still merges down to a handful of draw calls. The proportions follow the
// Castello Plan and the surviving Dutch colonial record: narrow gable ends
// turned to the street, crow-stepped parapets, pantile roofs, a hoisting
// beam under every peak because the attic was the warehouse.

import type { MaterialKey, TownBuilder } from "./builder";
import { pick, range, rangeInt, type Rng } from "./random";

const WALL_MATERIALS: MaterialKey[] = ["brickRed", "brickRed", "brickYellow", "plaster"];

export interface HouseOptions {
  x: number;
  z: number;
  y: number;
  /** Facade width, metres. The gable end faces the street. */
  width: number;
  depth: number;
  /** Storeys, 1-3. */
  floors: number;
  /** Rotation about Y. At 0 the facade faces -Z. */
  rotY: number;
  wall?: MaterialKey;
  roofMat?: MaterialKey;
  stepped?: boolean;
  rng: Rng;
}

/**
 * The standard burgher house: brick box, steep gable roof, crow-stepped
 * parapets, a stoop and a bench beside the front door.
 */
export function dutchHouse(b: TownBuilder, o: HouseOptions) {
  const { x, z, y, width: w, depth: d, rotY, rng } = o;
  const wall = o.wall ?? pick(rng, WALL_MATERIALS);
  const roofMat = o.roofMat ?? (rng() < 0.78 ? "roof" : "thatch");
  const stepped = o.stepped ?? rng() < 0.72;
  const storey = 2.55;
  const h = o.floors * storey;
  const roofH = w * (0.62 + rng() * 0.2);

  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  /** Local (right, up, forward-into-block) -> world. Local -Z is the facade. */
  const at = (lx: number, ly: number, lz: number) => ({
    x: x + lx * cos + lz * sin,
    y: y + ly,
    z: z - lx * sin + lz * cos,
  });

  // Ground course in stone: Dutch builders set the first foot or two in
  // rubble to keep the brick out of the damp.
  b.boxOn("stone", { w: w + 0.24, h: 0.55, d: d + 0.24 }, { ...at(0, 0, 0), rotY });
  b.boxOn(wall, { w, h, d }, { ...at(0, 0, 0), rotY }, true);

  // Roof, eaves overhanging front and back.
  b.gable(roofMat, w + 0.5, roofH, d + 0.7, { ...at(0, h, 0), rotY });

  if (stepped) {
    steppedGable(b, wall, w, roofH, h, d, rotY, at);
  } else {
    // Plain gable: fill the triangle flush with the wall so no daylight shows.
    b.gable(wall, w, roofH, 0.3, { ...at(0, h, -d / 2 - 0.15), rotY });
    b.gable(wall, w, roofH, 0.3, { ...at(0, h, d / 2 + 0.15), rotY });
  }

  // Hoisting beam and pulley under the peak - every attic was a warehouse.
  b.box("timber", { w: 0.18, h: 0.18, d: 1.5 }, { ...at(0, h + roofH * 0.74, -d / 2 - 0.6), rotY });
  b.cylinder("iron", 0.12, 0.12, 0.09, { ...at(0, h + roofH * 0.74, -d / 2 - 1.25), rotY, rotX: Math.PI / 2 }, 8);

  // Front door with a stoop.
  const doorW = 1.05;
  b.box("trim", { w: doorW, h: 2.05, d: 0.14 }, { ...at(0, 1.02, -d / 2 - 0.06), rotY });
  b.cylinder("gold", 0.07, 0.07, 0.06, { ...at(0.34, 1.05, -d / 2 - 0.15), rotY, rotX: Math.PI / 2 }, 6);
  for (let s = 0; s < 2; s++) {
    b.boxOn(
      "stone",
      { w: doorW + 1.1 - s * 0.4, h: 0.16, d: 0.85 - s * 0.28 },
      { ...at(0, s * 0.16, -d / 2 - 0.5 + s * 0.14), rotY },
      true,
    );
  }
  // The stoep bench, where the household sat out the evening.
  if (rng() < 0.55) {
    const side = rng() < 0.5 ? -1 : 1;
    b.boxOn("wood", { w: 1.5, h: 0.1, d: 0.42 }, { ...at(side * (w / 2 - 1.0), 0.44, -d / 2 - 0.42), rotY }, true);
    for (const dx of [-0.6, 0.6]) {
      b.boxOn("wood", { w: 0.1, h: 0.44, d: 0.38 }, { ...at(side * (w / 2 - 1.0) + dx, 0, -d / 2 - 0.42), rotY });
    }
  }

  // Windows: three bays across the facade, two on each flank.
  for (let floor = 0; floor < o.floors; floor++) {
    const wy = 0.95 + floor * storey + (floor === 0 ? 0.35 : 0);
    const bays = w > 6.5 ? 3 : 2;
    for (let i = 0; i < bays; i++) {
      const lx = ((i + 0.5) / bays - 0.5) * (w - 1.4);
      if (floor === 0 && Math.abs(lx) < doorW) continue;
      windowUnit(b, at(lx, wy, -d / 2 - 0.07), rotY, 1.0, 1.35);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const lz = (i - 0.5) * d * 0.5;
        windowUnit(
          b,
          at(side * (w / 2 + 0.07), wy, lz),
          rotY + Math.PI / 2,
          0.9,
          1.25,
        );
      }
    }
  }
  // Attic shutter in the gable.
  b.box("trim", { w: 0.85, h: 0.95, d: 0.1 }, { ...at(0, h + roofH * 0.34, -d / 2 - 0.28), rotY });

  // Chimney, off to one side of the ridge.
  const chimX = (rng() < 0.5 ? -1 : 1) * (w / 2 - 0.75);
  b.boxOn("brickRed", { w: 0.85, h: roofH + 1.2, d: 0.85 }, { ...at(chimX, h - 0.3, d * 0.18), rotY });
  b.boxOn("stone", { w: 1.05, h: 0.16, d: 1.05 }, { ...at(chimX, h + roofH + 0.9, d * 0.18), rotY });
}

function steppedGable(
  b: TownBuilder,
  wall: MaterialKey,
  w: number,
  roofH: number,
  h: number,
  d: number,
  rotY: number,
  at: (lx: number, ly: number, lz: number) => { x: number; y: number; z: number },
) {
  const steps = 5;
  for (const face of [-1, 1]) {
    const lz = face * (d / 2 + 0.2);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const stepW = w * (1 - t) + 0.55;
      const y0 = h + roofH * t;
      const stepH = roofH / steps;
      b.box(wall, { w: stepW, h: stepH, d: 0.42 }, { ...at(0, y0 + stepH / 2, lz), rotY });
      // Sandstone coping caps each tread.
      b.box(
        "stone",
        { w: stepW + 0.14, h: 0.12, d: 0.56 },
        { ...at(0, y0 + stepH + 0.06, lz), rotY },
      );
    }
    b.box(wall, { w: 0.7, h: 0.5, d: 0.42 }, { ...at(0, h + roofH + 0.25, lz), rotY });
  }
}

/** Leaded casement with a frame and shutters; glows after dark. */
export function windowUnit(
  b: TownBuilder,
  p: { x: number; y: number; z: number },
  rotY: number,
  w: number,
  h: number,
) {
  b.box("trim", { w: w + 0.22, h: h + 0.22, d: 0.07 }, { ...p, rotY });
  b.box("window", { w, h, d: 0.09 }, { x: p.x, y: p.y, z: p.z, rotY });
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  for (const side of [-1, 1]) {
    b.box(
      "trim",
      { w: w * 0.52, h: h + 0.18, d: 0.06 },
      {
        x: p.x + side * (w * 0.78) * cos,
        y: p.y,
        z: p.z - side * (w * 0.78) * sin,
        rotY,
      },
    );
  }
}

/**
 * A West India Company warehouse: taller, blunter, shuttered rather than
 * glazed, with a loading door at every level.
 */
export function warehouse(
  b: TownBuilder,
  o: { x: number; z: number; y: number; width: number; depth: number; rotY: number; rng: Rng },
) {
  const { x, z, y, width: w, depth: d, rotY, rng } = o;
  const h = range(rng, 8.5, 10.5);
  const roofH = w * 0.5;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx: number, ly: number, lz: number) => ({
    x: x + lx * cos + lz * sin,
    y: y + ly,
    z: z - lx * sin + lz * cos,
  });

  b.boxOn("stone", { w: w + 0.3, h: 1.1, d: d + 0.3 }, { ...at(0, 0, 0), rotY });
  b.boxOn("brickRed", { w, h, d }, { ...at(0, 0, 0), rotY }, true);
  b.gable("roof", w + 0.6, roofH, d + 0.6, { ...at(0, h, 0), rotY });
  b.gable("brickRed", w, roofH, 0.35, { ...at(0, h, -d / 2 - 0.18), rotY });
  b.gable("brickRed", w, roofH, 0.35, { ...at(0, h, d / 2 + 0.18), rotY });

  // Stacked loading doors under a long hoisting beam.
  for (let level = 0; level < 3; level++) {
    b.box("wood", { w: 1.5, h: 1.9, d: 0.13 }, { ...at(0, 1.15 + level * 2.9, -d / 2 - 0.07), rotY });
    b.box("iron", { w: 1.6, h: 0.09, d: 0.16 }, { ...at(0, 2.05 + level * 2.9, -d / 2 - 0.13), rotY });
  }
  b.box("timber", { w: 0.22, h: 0.22, d: 1.9 }, { ...at(0, h + roofH * 0.7, -d / 2 - 0.8), rotY });
  b.cylinder("iron", 0.16, 0.16, 0.1, { ...at(0, h + roofH * 0.7, -d / 2 - 1.6), rotY, rotX: Math.PI / 2 }, 8);

  for (const side of [-1, 1]) {
    for (let level = 0; level < 3; level++) {
      for (let i = 0; i < 3; i++) {
        b.box(
          "trim",
          { w: 0.85, h: 1.05, d: 0.08 },
          { ...at(side * (w / 2 + 0.05), 1.5 + level * 2.9, (i - 1) * d * 0.3), rotY: rotY + Math.PI / 2 },
        );
      }
    }
  }
}

/** The Stadt Huys: stone-faced, five bays, a bell turret and a clock. */
export function stadtHuys(b: TownBuilder, x: number, z: number, y: number, rotY: number) {
  const w = 14;
  const d = 11;
  const h = 11.5;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx: number, ly: number, lz: number) => ({
    x: x + lx * cos + lz * sin,
    y: y + ly,
    z: z - lx * sin + lz * cos,
  });

  b.boxOn("stone", { w: w + 0.5, h: 1.0, d: d + 0.5 }, { ...at(0, 0, 0), rotY }, true);
  b.boxOn("brickYellow", { w, h, d }, { ...at(0, 0.9, 0), rotY }, true);
  b.gable("roof", w + 0.7, 5.4, d + 0.5, { ...at(0, h + 0.9, 0), rotY });
  for (const face of [-1, 1]) {
    const lz = face * (d / 2 + 0.2);
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const stepW = w * (1 - t) + 0.6;
      const y0 = h + 0.9 + 5.4 * t;
      b.box("brickYellow", { w: stepW, h: 0.9, d: 0.45 }, { ...at(0, y0 + 0.45, lz), rotY });
      b.box("stone", { w: stepW + 0.16, h: 0.13, d: 0.6 }, { ...at(0, y0 + 0.96, lz), rotY });
    }
  }

  // Five-bay facade over an arcaded ground floor.
  for (let floor = 0; floor < 3; floor++) {
    for (let i = 0; i < 5; i++) {
      const lx = (i - 2) * 2.5;
      if (floor === 0 && i === 2) continue;
      windowUnit(b, at(lx, 2.4 + floor * 3.3, -d / 2 - 0.07), rotY, 1.1, 1.5);
    }
  }
  b.box("trim", { w: 1.6, h: 2.6, d: 0.16 }, { ...at(0, 2.2, -d / 2 - 0.08), rotY });
  for (let s = 0; s < 3; s++) {
    b.boxOn("stone", { w: 4.2 - s * 0.5, h: 0.3, d: 1.9 - s * 0.5 }, { ...at(0, s * 0.3, -d / 2 - 1.4 + s * 0.3), rotY }, true);
  }

  // Bell cupola.
  b.boxOn("wood", { w: 2.4, h: 2.2, d: 2.4 }, { ...at(0, h + 5.4, 0), rotY });
  b.pyramid("roof", 3.0, 2.4, 3.0, { ...at(0, h + 7.6, 0), rotY });
  b.cylinder("gold", 0.09, 0.09, 1.5, { ...at(0, h + 10.6, 0), rotY }, 6);
  b.cylinder("gold", 0.0, 0.34, 0.7, { ...at(0, h + 11.6, 0), rotY }, 8);
  b.cylinder("iron", 0.42, 0.28, 0.6, { ...at(0, h + 6.1, 0), rotY }, 10);
}

/** St. Nicholas Church, built inside the fort in 1642. */
export function church(b: TownBuilder, x: number, z: number, y: number, rotY: number) {
  const w = 11;
  const d = 22;
  const h = 8.5;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx: number, ly: number, lz: number) => ({
    x: x + lx * cos + lz * sin,
    y: y + ly,
    z: z - lx * sin + lz * cos,
  });

  b.boxOn("stone", { w: w + 0.4, h: 1.0, d: d + 0.4 }, { ...at(0, 0, 0), rotY }, true);
  b.boxOn("stone", { w, h, d }, { ...at(0, 0.9, 0), rotY }, true);
  b.gable("roof", w + 0.6, 4.6, d + 0.4, { ...at(0, h + 0.9, 0), rotY });
  b.gable("stone", w, 4.6, 0.35, { ...at(0, h + 0.9, -d / 2 - 0.18), rotY });
  b.gable("stone", w, 4.6, 0.35, { ...at(0, h + 0.9, d / 2 + 0.18), rotY });

  // Buttresses down both flanks.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const lz = (i - 1.5) * 5;
      b.boxOn("stone", { w: 0.8, h: 6.5, d: 1.1 }, { ...at(side * (w / 2 + 0.3), 0.9, lz), rotY }, true);
      b.pyramid("stone", 1.1, 0.7, 1.4, { ...at(side * (w / 2 + 0.3), 7.4, lz), rotY });
    }
    for (let i = 0; i < 4; i++) {
      const lz = (i - 1.5) * 5 + 2.5;
      windowUnit(b, at(side * (w / 2 + 0.06), 4.6, lz), rotY + Math.PI / 2, 1.0, 2.4);
    }
  }

  // West tower and spire.
  const tw = 5.4;
  const towerZ = -d / 2 - tw / 2 + 0.6;
  b.boxOn("stone", { w: tw, h: 15, d: tw }, { ...at(0, 0.9, towerZ), rotY }, true);
  // Louvred belfry openings on all four faces.
  const faces = [
    { dx: 0, dz: -1, turn: 0 },
    { dx: 1, dz: 0, turn: Math.PI / 2 },
    { dx: 0, dz: 1, turn: Math.PI },
    { dx: -1, dz: 0, turn: -Math.PI / 2 },
  ];
  const off = tw / 2 + 0.07;
  for (const face of faces) {
    b.box(
      "trim",
      { w: 1.5, h: 2.2, d: 0.1 },
      { ...at(face.dx * off, 12.4, towerZ + face.dz * off), rotY: rotY + face.turn },
    );
    windowUnit(b, at(face.dx * (off + 0.02), 7.6, towerZ + face.dz * (off + 0.02)), rotY + face.turn, 0.8, 1.6);
  }
  b.box("trim", { w: 1.8, h: 3.0, d: 0.16 }, { ...at(0, 2.4, towerZ - tw / 2 - 0.06), rotY });
  b.pyramid("roof", tw + 0.7, 3.0, tw + 0.7, { ...at(0, 15.9, towerZ), rotY });
  b.cylinder("wood", 0.55, 1.5, 9.5, { ...at(0, 22.4, towerZ), rotY }, 8);
  b.cylinder("gold", 0.07, 0.07, 1.8, { ...at(0, 28.0, towerZ), rotY }, 6);
  // Weathercock.
  b.box("gold", { w: 0.8, h: 0.5, d: 0.05 }, { ...at(0.3, 28.8, towerZ), rotY });
}

export interface FortResult {
  /** Where the flag should fly. */
  flagpole: { x: number; y: number; z: number };
  /** Cannon muzzles, for the "fire a salute" moment. */
  cannons: Array<{ x: number; y: number; z: number; rotY: number }>;
}

/**
 * Fort Amsterdam: a square earthwork with four arrow-head bastions, faced
 * in stone on the seaward side, with the church and the governor's house
 * inside. The rampart walk is reachable by a ramp - the best view in town.
 */
export function fort(b: TownBuilder, cx: number, cz: number, y: number): FortResult {
  const half = 27;
  const wallH = 4.2;
  const thickness = 5.5;
  const cannons: FortResult["cannons"] = [];

  // Curtain walls. Each gets a parapet on its outer lip only, so the top
  // stays a walkable firing step rather than a solid block.
  const parapet = 1.3;
  const northSeg = half + thickness / 2 - 4.5;
  const walls: Array<{ x: number; z: number; w: number; d: number; nx: number; nz: number }> = [
    { x: cx, z: cz + half, w: half * 2 + thickness, d: thickness, nx: 0, nz: 1 },
    { x: cx - half, z: cz, w: thickness, d: half * 2, nx: -1, nz: 0 },
    { x: cx + half, z: cz, w: thickness, d: half * 2, nx: 1, nz: 0 },
    // North wall in two pieces, with a 9 m gate gap between them.
    { x: cx - (4.5 + northSeg / 2), z: cz - half, w: northSeg, d: thickness, nx: 0, nz: -1 },
    { x: cx + (4.5 + northSeg / 2), z: cz - half, w: northSeg, d: thickness, nx: 0, nz: -1 },
  ];
  for (const wall of walls) {
    b.boxOn("stone", { w: wall.w, h: wallH, d: wall.d }, { x: wall.x, y, z: wall.z }, true);
    b.boxOn(
      "stone",
      {
        w: wall.nx ? parapet : wall.w,
        h: 1.2,
        d: wall.nz ? parapet : wall.d,
      },
      {
        x: wall.x + wall.nx * (thickness / 2 - parapet / 2),
        y: y + wallH,
        z: wall.z + wall.nz * (thickness / 2 - parapet / 2),
      },
      true,
    );
  }

  // Gatehouse over the north entrance.
  for (const side of [-1, 1]) {
    b.boxOn("stone", { w: 2.4, h: 6.4, d: 6.5 }, { x: cx + side * 4.2, y, z: cz - half }, true);
  }
  b.boxOn("stone", { w: 11.2, h: 1.6, d: 6.5 }, { x: cx, y: y + 6.4, z: cz - half }, true);
  b.pyramid("roof", 12.4, 2.2, 7.6, { x: cx, y: y + 8.0, z: cz - half });
  b.box("wood", { w: 5.6, h: 0.4, d: 0.35 }, { x: cx, y: y + 6.1, z: cz - half - 3.3 });

  // Four bastions: squares turned 45 degrees so they read as arrow heads.
  const bastion = 13;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const bx = cx + sx * half;
      const bz = cz + sz * half;
      b.box("stone", { w: bastion, h: wallH, d: bastion }, { x: bx, y: y + wallH / 2, z: bz, rotY: Math.PI / 4 }, true);
      // A square turned 45 degrees presents its faces along the diagonals.
      // Wall the three outward ones; leave the face towards the parade
      // ground open so the gun platform can be walked onto.
      for (const [ax, az] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        if (ax === -sx && az === -sz) continue;
        const nx = ax * Math.SQRT1_2;
        const nz = az * Math.SQRT1_2;
        b.box(
          "stone",
          { w: bastion, h: 1.2, d: parapet },
          {
            x: bx + nx * (bastion / 2 - parapet / 2),
            y: y + wallH + 0.6,
            z: bz + nz * (bastion / 2 - parapet / 2),
            rotY: Math.atan2(nx, nz),
          },
          true,
        );
      }
      cannons.push({ x: bx + sx * 2.6, y: y + wallH, z: bz + sz * 2.6, rotY: Math.atan2(sx, sz) });
    }
  }

  // Stair from the parade ground up to the rampart walk, hard against the
  // inner face of the east curtain.
  const steps = 10;
  const stairX = cx + half - thickness / 2 - 2.4;
  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    b.boxOn(
      "stone",
      { w: 4.8, h: wallH * t, d: 1.5 },
      { x: stairX, y, z: cz - half + thickness + 1.5 + i * 1.5 },
      true,
    );
  }

  // Interior buildings.
  church(b, cx - 6.5, cz + 5, y, Math.PI);
  // Governor's house.
  b.boxOn("brickYellow", { w: 13, h: 6.6, d: 8.5 }, { x: cx + 12, y, z: cz - 6, rotY: 0 }, true);
  b.gable("roof", 13.6, 4.2, 9.2, { x: cx + 12, y: y + 6.6, z: cz - 6, rotY: Math.PI / 2 });
  for (let i = 0; i < 4; i++) {
    windowUnit(b, { x: cx + 12 - 4.5 + i * 3, y: y + 2.2, z: cz - 6 - 4.3 }, 0, 1.1, 1.4);
    windowUnit(b, { x: cx + 12 - 4.5 + i * 3, y: y + 5.0, z: cz - 6 - 4.3 }, 0, 1.1, 1.2);
  }
  // Soldiers' barracks.
  b.boxOn("brickRed", { w: 20, h: 4.4, d: 6.5 }, { x: cx + 9, y, z: cz + 16 }, true);
  b.gable("thatch", 20.6, 3.2, 7.1, { x: cx + 9, y: y + 4.4, z: cz + 16, rotY: Math.PI / 2 });
  for (let i = 0; i < 6; i++) {
    windowUnit(b, { x: cx + 9 - 7.5 + i * 3, y: y + 2.3, z: cz + 16 - 3.3 }, Math.PI, 0.8, 1.0);
  }

  // Flagpole on the parade ground.
  const flagX = cx - 1;
  const flagZ = cz - 14;
  b.cylinder("wood", 0.16, 0.24, 15, { x: flagX, y: y + 7.5, z: flagZ }, 8, true);
  b.boxOn("stone", { w: 2.2, h: 0.45, d: 2.2 }, { x: flagX, y, z: flagZ }, true);

  return { flagpole: { x: flagX, y: y + 14.6, z: flagZ }, cannons };
}

/**
 * The palisade of 1653 that gave Wall Street its name: split logs, sharpened,
 * set in a rammed-earth bank with a rail behind them.
 */
export function palisade(
  b: TownBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: (x: number, z: number) => number,
  gaps: Array<{ at: number; width: number }>,
  rng: Rng,
) {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const dirX = (x1 - x0) / length;
  const dirZ = (z1 - z0) / length;
  const rotY = Math.atan2(dirX, dirZ);
  const spacing = 0.35;

  for (let s = 0; s < length; s += spacing) {
    if (gaps.some((g) => Math.abs(s - g.at) < g.width / 2)) continue;
    const x = x0 + dirX * s + (rng() - 0.5) * 0.05;
    const z = z0 + dirZ * s + (rng() - 0.5) * 0.05;
    const base = y(x, z) - 0.3;
    const h = range(rng, 3.4, 3.9);
    b.cylinder("timber", 0.22, 0.25, h, { x, y: base + h / 2, z, rotY, rotZ: (rng() - 0.5) * 0.025 }, 6);
    b.cylinder("timber", 0.0, 0.22, 0.45, { x, y: base + h + 0.22, z }, 6);
  }
  // Earth bank and horizontal rails behind the stakes.
  const midX = (x0 + x1) / 2;
  const midZ = (z0 + z1) / 2;
  const yb = y(midX, midZ);
  b.colliders.addBox(midX, midZ, length / 2, 0.55, rotY, yb + 3.4, yb - 1);
  for (const gap of gaps) {
    // Re-open the collider where a gate stands.
    const gx = x0 + dirX * gap.at;
    const gz = z0 + dirZ * gap.at;
    b.colliders.addBox(gx, gz, gap.width / 2 - 0.4, 0.75, rotY, yb - 0.9, yb - 1.2);
  }
}

/** A gate through the palisade: two posts, a lintel, a peaked cap. */
export function landGate(b: TownBuilder, x: number, z: number, y: number, rotY: number, width: number) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx: number, ly: number, lz: number) => ({
    x: x + lx * cos + lz * sin,
    y: y + ly,
    z: z - lx * sin + lz * cos,
  });
  for (const side of [-1, 1]) {
    b.boxOn("timber", { w: 1.1, h: 5.2, d: 1.1 }, { ...at(side * (width / 2), 0, 0), rotY }, true);
  }
  b.boxOn("timber", { w: width + 1.4, h: 0.9, d: 0.9 }, { ...at(0, 5.2, 0), rotY });
  b.gable("roof", width + 2.2, 1.1, 1.8, { ...at(0, 6.1, 0), rotY: rotY + Math.PI / 2 });
  // Open leaves, swung back against the posts.
  for (const side of [-1, 1]) {
    b.box(
      "wood",
      { w: 0.18, h: 4.2, d: width / 2 - 0.4 },
      { ...at(side * (width / 2 - 0.35), 2.2, (width / 4) * 0.9), rotY },
    );
  }
}

/** Timber revetment either side of the canal, with mooring rings. */
export function canalQuay(
  b: TownBuilder,
  canalX: number,
  half: number,
  z0: number,
  z1: number,
  y: number,
) {
  for (const side of [-1, 1]) {
    const x = canalX + side * (half + 0.35);
    b.box("timber", { w: 0.7, h: 2.6, d: z1 - z0 }, { x, y: y - 0.5, z: (z0 + z1) / 2 }, false);
    b.colliders.addBox(x, (z0 + z1) / 2, 0.35, (z1 - z0) / 2, 0, y + 0.05, y - 1.8);
    for (let z = z0 + 3; z < z1; z += 6.5) {
      b.post("timber", 0.22, 1.1, x + side * 0.5, y - 0.2, z, false);
      b.cylinder("iron", 0.03, 0.03, 0.36, { x: x + side * 0.5, y: y + 0.5, z, rotX: Math.PI / 2 }, 6);
    }
  }
}

/** A humpback timber bridge over the gracht. */
export function bridge(b: TownBuilder, x: number, z: number, y: number, span: number, width: number) {
  b.boxOn("wood", { w: span, h: 0.35, d: width }, { x, y: y + 0.12, z }, true);
  for (const side of [-1, 1]) {
    b.boxOn("wood", { w: span, h: 0.16, d: 0.16 }, { x, y: y + 1.05, z: z + side * (width / 2 - 0.12) });
    for (let i = -2; i <= 2; i++) {
      b.post("wood", 0.09, 1.05, x + (i * span) / 5, y + 0.45, z + side * (width / 2 - 0.12), false);
    }
  }
  for (const side of [-1, 1]) {
    b.post("timber", 0.22, 2.4, x + side * (span / 2 - 0.6), y - 1.8, z - width / 2 + 0.5, false);
    b.post("timber", 0.22, 2.4, x + side * (span / 2 - 0.6), y - 1.8, z + width / 2 - 0.5, false);
  }
}

/** The pier - "de Brugh" - reaching out over the East River. */
export function pier(
  b: TownBuilder,
  x0: number,
  z: number,
  length: number,
  width: number,
  deckY: number,
  seabed: (x: number, z: number) => number,
) {
  b.boxOn("wood", { w: length, h: 0.3, d: width }, { x: x0 + length / 2, y: deckY - 0.3, z }, true);
  for (let i = 0; i <= Math.floor(length / 3); i++) {
    const px = x0 + i * 3;
    for (const side of [-1, 1]) {
      const pz = z + side * (width / 2 - 0.5);
      const bottom = seabed(px, pz);
      const h = deckY - bottom + 0.4;
      b.cylinder("timber", 0.28, 0.32, h, { x: px, y: bottom + h / 2, z: pz }, 7);
    }
    b.box("timber", { w: 0.3, h: 0.3, d: width }, { x: px, y: deckY - 0.55, z });
  }
  // Bollards along the seaward half.
  for (let i = 2; i <= Math.floor(length / 3); i += 2) {
    b.post("timber", 0.24, 0.85, x0 + i * 3, deckY, z + width / 2 - 0.35, true);
  }
}

/** Weigh house on the market square: open arcade under a tiled roof. */
export function weighHouse(b: TownBuilder, x: number, z: number, y: number, rotY: number) {
  const w = 9;
  const d = 7;
  b.boxOn("stone", { w: w + 0.6, h: 0.5, d: d + 0.6 }, { x, y, z, rotY }, true);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.boxOn(
        "brickRed",
        { w: 1.0, h: 4.2, d: 1.0 },
        { x: x + sx * (w / 2 - 0.7), y: y + 0.5, z: z + sz * (d / 2 - 0.7), rotY },
        true,
      );
    }
  }
  b.boxOn("brickRed", { w: w, h: 0.8, d: d }, { x, y: y + 4.7, z, rotY });
  b.gable("roof", w + 1.2, 3.2, d + 1.2, { x, y: y + 5.5, z, rotY });
  // The great beam scale.
  b.post("timber", 0.16, 3.4, x, y + 0.5, z, false);
  b.box("timber", { w: 3.4, h: 0.14, d: 0.14 }, { x, y: y + 3.9, z, rotY });
  for (const side of [-1, 1]) {
    b.cylinder("iron", 0.55, 0.5, 0.12, { x: x + side * 1.6, y: y + 2.9, z, rotY }, 10);
    b.cylinder("rope", 0.02, 0.02, 1.0, { x: x + side * 1.6, y: y + 3.4, z }, 4);
  }
}

/** Farmhouse and barn out on the bouwerij, north of the wall. */
export function farmstead(b: TownBuilder, x: number, z: number, y: number, rotY: number, rng: Rng) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx: number, lz: number) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });

  const house = at(0, 0);
  b.boxOn("plaster", { w: 11, h: 3.4, d: 7 }, { x: house.x, y, z: house.z, rotY }, true);
  b.gable("thatch", 11.8, 4.6, 7.8, { x: house.x, y: y + 3.4, z: house.z, rotY: rotY + Math.PI / 2 });
  b.boxOn("brickRed", { w: 0.9, h: 6.6, d: 0.9 }, { x: house.x + 4 * cos, y, z: house.z - 4 * sin, rotY });
  for (let i = 0; i < 3; i++) {
    windowUnit(
      b,
      { x: house.x + (i - 1) * 3 * cos - 3.55 * sin, y: y + 1.9, z: house.z - (i - 1) * 3 * sin - 3.55 * cos },
      rotY + Math.PI,
      0.9,
      1.1,
    );
  }
  b.box("trim", { w: 1.05, h: 2.0, d: 0.12 }, { x: house.x - 3.55 * sin, y: y + 1.0, z: house.z - 3.55 * cos, rotY });

  // Barn: a big thatched hay barn on timber posts.
  const barn = at(17, 4);
  b.boxOn("wood", { w: 13, h: 5.2, d: 9 }, { x: barn.x, y, z: barn.z, rotY: rotY + 0.15 }, true);
  b.gable("thatch", 14, 6.0, 10, { x: barn.x, y: y + 5.2, z: barn.z, rotY: rotY + 0.15 + Math.PI / 2 });
  b.box("timber", { w: 4.4, h: 4.0, d: 0.2 }, { x: barn.x, y: y + 2.0, z: barn.z - 4.6, rotY: rotY + 0.15 });

  // Haystacks.
  for (let i = 0; i < 3; i++) {
    const p = at(range(rng, 4, 26), range(rng, -12, -6));
    b.cylinder("hay", 1.5, 2.4, 2.2, { x: p.x, y: y + 1.1, z: p.z }, 9, true);
    b.cylinder("hay", 0.0, 1.6, 1.8, { x: p.x, y: y + 3.1, z: p.z }, 9);
  }
}

/** Split-rail fence following a polyline. */
export function fence(b: TownBuilder, points: Array<[number, number]>, y: (x: number, z: number) => number) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rotY = Math.atan2(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.round(len / 2.4));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      b.post("timber", 0.11, 1.35, px, y(px, pz) - 0.1, pz, false);
    }
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const my = y(mx, mz);
    for (const railY of [0.55, 1.05]) {
      b.box("wood", { w: 0.1, h: 0.14, d: len }, { x: mx, y: my + railY, z: mz, rotY });
    }
    b.colliders.addBox(mx, mz, 0.16, len / 2, rotY, my + 1.2, my - 0.5);
  }
}

/** Town well with a windlass and a bucket. */
export function well(b: TownBuilder, x: number, z: number, y: number) {
  b.cylinder("stone", 1.5, 1.6, 1.1, { x, y: y + 0.55, z }, 14, true);
  b.cylinder("stone", 1.62, 1.62, 0.14, { x, y: y + 1.14, z }, 14);
  for (const side of [-1, 1]) {
    b.post("timber", 0.13, 2.3, x + side * 1.3, y + 1.1, z, false);
  }
  b.box("timber", { w: 3.0, h: 0.16, d: 0.16 }, { x, y: y + 3.45, z });
  b.gable("wood", 3.6, 0.75, 2.2, { x, y: y + 3.5, z, rotY: Math.PI / 2 });
  b.cylinder("wood", 0.16, 0.16, 2.2, { x, y: y + 2.9, z, rotZ: Math.PI / 2 }, 8);
  b.cylinder("rope", 0.025, 0.025, 1.5, { x, y: y + 2.2, z }, 4);
  b.cylinder("wood", 0.3, 0.26, 0.42, { x, y: y + 1.35, z }, 10);
}

/** Gallows and the whipping post - colonial justice, plainly displayed. */
export function gallows(b: TownBuilder, x: number, z: number, y: number, rotY: number) {
  b.post("timber", 0.2, 5.0, x, y, z, true);
  b.post("timber", 0.2, 5.0, x + 3 * Math.cos(rotY), y, z - 3 * Math.sin(rotY), true);
  b.box("timber", { w: 3.6, h: 0.24, d: 0.24 }, { x: x + 1.5 * Math.cos(rotY), y: y + 5.0, z: z - 1.5 * Math.sin(rotY), rotY });
  b.cylinder("rope", 0.03, 0.03, 1.4, { x: x + 1.5 * Math.cos(rotY), y: y + 4.3, z: z - 1.5 * Math.sin(rotY) }, 5);
  b.boxOn("stone", { w: 4.6, h: 0.3, d: 1.6 }, { x: x + 1.5 * Math.cos(rotY), y, z: z - 1.5 * Math.sin(rotY), rotY }, true);
}

/** Market stall: four poles and a striped awning. */
export function marketStall(b: TownBuilder, x: number, z: number, y: number, rotY: number, rng: Rng) {
  const w = range(rng, 2.6, 3.6);
  const d = range(rng, 1.8, 2.4);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cos = Math.cos(rotY);
      const sin = Math.sin(rotY);
      const lx = sx * (w / 2);
      const lz = sz * (d / 2);
      b.post("wood", 0.07, 2.1, x + lx * cos + lz * sin, y, z - lx * sin + lz * cos, false);
    }
  }
  b.gable("sail", w + 0.7, 0.55, d + 0.6, { x, y: y + 2.1, z, rotY: rotY + Math.PI / 2 });
  b.boxOn("wood", { w, h: 0.1, d: d * 0.6 }, { x, y: y + 0.85, z, rotY }, true);
  for (const dx of [-w / 3, w / 3]) {
    b.boxOn("wood", { w: 0.1, h: 0.85, d: d * 0.55 }, { x: x + dx * Math.cos(rotY), y, z: z - dx * Math.sin(rotY), rotY });
  }
  // Goods on the board.
  for (let i = 0; i < 5; i++) {
    const key: MaterialKey = pick(rng, ["hay", "leaf", "wood", "canvasWhite"]);
    b.boxOn(
      key,
      { w: range(rng, 0.2, 0.4), h: range(rng, 0.15, 0.3), d: range(rng, 0.2, 0.4) },
      { x: x + range(rng, -w / 2 + 0.3, w / 2 - 0.3), y: y + 0.95, z: z + range(rng, -0.4, 0.4), rotY: rng() * 3 },
    );
  }
}

/** Barrels, crates and coils of rope - the clutter of a working waterfront. */
export function cargoPile(b: TownBuilder, x: number, z: number, y: number, rng: Rng, count = 6) {
  for (let i = 0; i < count; i++) {
    const px = x + range(rng, -2.2, 2.2);
    const pz = z + range(rng, -2.2, 2.2);
    if (rng() < 0.55) {
      const h = range(rng, 0.85, 1.05);
      b.cylinder("wood", 0.36, 0.42, h, { x: px, y: y + h / 2, z: pz, rotY: rng() * 3 }, 10, true);
      for (const band of [0.28, 0.72]) {
        b.cylinder("iron", 0.44, 0.44, 0.07, { x: px, y: y + h * band, z: pz }, 10);
      }
    } else {
      const s = range(rng, 0.6, 1.0);
      b.boxOn("wood", { w: s, h: s * 0.8, d: s }, { x: px, y, z: pz, rotY: rng() * 3 }, true);
    }
  }
  b.cylinder("rope", 0.55, 0.55, 0.12, { x: x + range(rng, -2, 2), y: y + 0.06, z: z + range(rng, -2, 2) }, 12);
}

/** A hand cart, tipped forward onto its shafts. */
export function handCart(b: TownBuilder, x: number, z: number, y: number, rotY: number) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  b.boxOn("wood", { w: 1.7, h: 0.7, d: 2.6 }, { x, y: y + 0.7, z, rotY }, true);
  for (const side of [-1, 1]) {
    b.cylinder(
      "wood",
      0.65,
      0.65,
      0.14,
      { x: x + side * 0.95 * cos, y: y + 0.65, z: z - side * 0.95 * sin, rotY, rotZ: Math.PI / 2 },
      12,
    );
  }
  for (const side of [-1, 1]) {
    b.box("wood", { w: 0.1, h: 0.1, d: 2.2 }, { x: x + side * 0.7 * cos - 2.2 * sin, y: y + 0.75, z: z - side * 0.7 * sin - 2.2 * cos, rotY, rotX: 0.22 });
  }
}

/** Lenape wigwam: bent saplings under bark sheets. */
export function wigwam(b: TownBuilder, x: number, z: number, y: number, rng: Rng) {
  const r = range(rng, 2.6, 3.3);
  b.cylinder("bark", r * 0.55, r, 2.3, { x, y: y + 1.15, z }, 12, true);
  b.cylinder("bark", 0.0, r * 0.62, 1.5, { x, y: y + 3.05, z }, 12);
  // Smoke hole ring and door frame.
  b.cylinder("timber", 0.42, 0.42, 0.12, { x, y: y + 3.7, z }, 8);
  b.box("timber", { w: 0.1, h: 1.5, d: 0.1 }, { x: x - 0.5, y: y + 0.75, z: z - r * 0.92 });
  b.box("timber", { w: 0.1, h: 1.5, d: 0.1 }, { x: x + 0.5, y: y + 0.75, z: z - r * 0.92 });
  b.box("hay", { w: 1.1, h: 1.4, d: 0.08 }, { x, y: y + 0.7, z: z - r * 0.96 });
}

/** A drying rack hung with fish and pelts. */
export function dryingRack(b: TownBuilder, x: number, z: number, y: number, rotY: number, rng: Rng) {
  for (const side of [-1, 1]) {
    b.post("timber", 0.09, 2.0, x + side * 1.8 * Math.cos(rotY), y, z - side * 1.8 * Math.sin(rotY), false);
  }
  b.box("timber", { w: 3.8, h: 0.09, d: 0.09 }, { x, y: y + 2.0, z, rotY });
  for (let i = 0; i < 5; i++) {
    const off = (i - 2) * 0.7;
    b.box(
      "bark",
      { w: 0.5, h: range(rng, 0.6, 0.9), d: 0.05 },
      { x: x + off * Math.cos(rotY), y: y + 1.6, z: z - off * Math.sin(rotY), rotY },
    );
  }
}

const LEAF_TONES: MaterialKey[] = ["leaf", "leafLight", "leafDark"];

/** Orchard / forest tree. Two silhouettes: broadleaf and conifer. */
export function tree(b: TownBuilder, x: number, z: number, y: number, rng: Rng, conifer = false) {
  const scale = range(rng, 0.78, 1.3);
  const tone = pick(rng, LEAF_TONES);

  if (conifer) {
    const h = 13 * scale;
    b.cylinder("bark", 0.2 * scale, 0.44 * scale, h * 0.5, { x, y: y + h * 0.25, z }, 7);
    // Stacked skirts, narrowing towards the leader.
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      b.cylinder(
        tone,
        (2.4 - t * 2.1) * scale,
        (3.1 - t * 2.1) * scale,
        (3.4 - t * 0.9) * scale,
        { x, y: y + h * 0.26 + t * h * 0.155, z, rotY: rng() * 3 },
        8,
      );
    }
    b.colliders.addCircle(x, z, 0.5 * scale, y + h, y);
    return;
  }

  // Broadleaf: a leaning trunk, two limbs, and a crown of overlapping blobs.
  const trunk = range(rng, 3.4, 5.4) * scale;
  const lean = range(rng, -0.05, 0.05);
  b.cylinder("bark", 0.24 * scale, 0.48 * scale, trunk, { x, y: y + trunk / 2, z, rotZ: lean }, 7);
  const crown = y + trunk + 1.5 * scale;
  const blobs = rangeInt(rng, 4, 6);
  b.blob(tone, range(rng, 2.1, 2.7) * scale, { x, y: crown, z }, range(rng, 0.72, 0.92));
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rng() * 0.7;
    const r = range(rng, 1.1, 2.0) * scale;
    b.blob(
      i % 3 === 0 ? pick(rng, LEAF_TONES) : tone,
      range(rng, 1.3, 2.0) * scale,
      {
        x: x + Math.cos(a) * r,
        y: crown + range(rng, -1.1, 1.2) * scale,
        z: z + Math.sin(a) * r,
        rotY: rng() * 3,
        rotX: rng() * 3,
      },
      range(rng, 0.7, 1),
    );
  }
  b.colliders.addCircle(x, z, 0.55 * scale, y + trunk, y);
}

/** A cannon on a naval carriage. */
export function cannon(b: TownBuilder, x: number, y: number, z: number, rotY: number) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  b.boxOn("wood", { w: 1.0, h: 0.55, d: 1.9 }, { x, y, z, rotY }, true);
  for (const side of [-1, 1]) {
    for (const fwd of [-0.6, 0.55]) {
      b.cylinder(
        "wood",
        0.3,
        0.3,
        0.13,
        {
          x: x + side * 0.55 * cos + fwd * sin,
          y: y + 0.3,
          z: z - side * 0.55 * sin + fwd * cos,
          rotY,
          rotZ: Math.PI / 2,
        },
        10,
      );
    }
  }
  b.cylinder("iron", 0.17, 0.26, 2.4, { x: x + 0.35 * sin, y: y + 0.85, z: z + 0.35 * cos, rotY, rotX: Math.PI / 2 }, 12);
  b.cylinder("iron", 0.3, 0.3, 0.3, { x: x - 0.85 * sin, y: y + 0.85, z: z - 0.85 * cos, rotY, rotX: Math.PI / 2 }, 12);
  // Shot pyramid alongside.
  for (let i = 0; i < 3; i++) {
    b.cylinder("iron", 0.11, 0.11, 0.22, { x: x + 1.3 * cos + (i - 1) * 0.24 * sin, y: y + 0.11, z: z - 1.3 * sin + (i - 1) * 0.24 * cos }, 8);
  }
}

/** Rowboat pulled up on the strand, or tied at a landing. */
export function rowboat(b: TownBuilder, x: number, y: number, z: number, rotY: number) {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  b.boxOn("wood", { w: 1.5, h: 0.5, d: 4.4 }, { x, y, z, rotY });
  b.box("wood", { w: 1.15, h: 0.42, d: 4.2 }, { x, y: y + 0.62, z, rotY });
  for (const fwd of [-1.2, 0, 1.2]) {
    b.box("wood", { w: 1.5, h: 0.08, d: 0.28 }, { x: x + fwd * sin, y: y + 0.55, z: z + fwd * cos, rotY });
  }
  b.box("wood", { w: 0.1, h: 0.09, d: 2.6 }, { x: x + 0.9 * cos, y: y + 0.7, z: z - 0.9 * sin, rotY, rotX: 0.1 });
}
