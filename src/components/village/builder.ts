// Geometry plumbing for the town.
//
// Every static structure is authored as small primitives, transformed into
// world space and dropped into a per-material bucket. At the end of world
// generation each bucket is merged into a single BufferGeometry, so the
// entire village - hundreds of houses, palisade logs, fences, crates -
// costs about a dozen draw calls.
//
// The same call that emits geometry usually registers a collider, which
// keeps the visible world and the walkable world from drifting apart.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as tex from "./textures";

export type MaterialKey =
  | "brickRed"
  | "brickYellow"
  | "plaster"
  | "roof"
  | "thatch"
  | "wood"
  | "timber"
  | "stone"
  | "cobble"
  | "dirt"
  | "field"
  | "grass"
  | "sail"
  | "window"
  | "trim"
  | "iron"
  | "gold"
  | "leaf"
  | "leafLight"
  | "leafDark"
  | "bark"
  | "hay"
  | "canvasWhite"
  | "rope";

interface MatSpec {
  painted?: () => { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture };
  color?: number;
  roughness: number;
  metalness?: number;
  /** How many texture tiles fit into one metre of surface. */
  uvPerMeter: number;
  normalScale?: number;
  emissive?: number;
  flatShading?: boolean;
}

const SPECS: Record<MaterialKey, MatSpec> = {
  brickRed: { painted: tex.brickRed, roughness: 0.94, uvPerMeter: 0.5, normalScale: 0.8 },
  brickYellow: { painted: tex.brickYellow, roughness: 0.93, uvPerMeter: 0.5, normalScale: 0.8 },
  plaster: { painted: tex.plaster, roughness: 0.97, uvPerMeter: 0.35, normalScale: 0.4 },
  roof: { painted: tex.roofTile, roughness: 0.86, uvPerMeter: 0.42, normalScale: 1.0 },
  thatch: { painted: tex.thatch, roughness: 1.0, uvPerMeter: 0.3, normalScale: 1.2 },
  wood: { painted: tex.woodPlank, roughness: 0.9, uvPerMeter: 0.55, normalScale: 0.7 },
  timber: { painted: tex.timber, roughness: 0.92, uvPerMeter: 0.7, normalScale: 0.6 },
  stone: { painted: tex.stoneWall, roughness: 0.95, uvPerMeter: 0.4, normalScale: 0.9 },
  cobble: { painted: tex.cobble, roughness: 0.93, uvPerMeter: 0.6, normalScale: 0.8 },
  dirt: { painted: tex.dirtRoad, roughness: 1.0, uvPerMeter: 0.32, normalScale: 0.35 },
  field: { painted: tex.fieldCrop, roughness: 1.0, uvPerMeter: 0.3, normalScale: 0.5 },
  grass: { painted: tex.grassGround, roughness: 1.0, uvPerMeter: 0.28, normalScale: 0.4 },
  sail: { painted: tex.sailCloth, roughness: 0.95, uvPerMeter: 0.25, normalScale: 0.3 },
  window: { color: 0xcfdcd8, roughness: 0.28, metalness: 0.0, uvPerMeter: 1, emissive: 0x000000 },
  trim: { color: 0x50624a, roughness: 0.75, uvPerMeter: 1 },
  iron: { color: 0x2a2a2c, roughness: 0.5, metalness: 0.75, uvPerMeter: 1 },
  gold: { color: 0xbb9548, roughness: 0.35, metalness: 0.85, uvPerMeter: 1 },
  // Three greens so an orchard is not one flat colour; the merged geometry
  // has no per-instance colour, so the variation lives in the material list.
  leaf: { color: 0x6f8f42, roughness: 0.92, uvPerMeter: 1, flatShading: true },
  leafLight: { color: 0x87a34f, roughness: 0.92, uvPerMeter: 1, flatShading: true },
  leafDark: { color: 0x546f34, roughness: 0.92, uvPerMeter: 1, flatShading: true },
  bark: { painted: tex.timber, roughness: 0.95, uvPerMeter: 0.5, normalScale: 0.6 },
  hay: { painted: tex.thatch, roughness: 1.0, uvPerMeter: 0.45, normalScale: 1.0 },
  canvasWhite: { color: 0xd9cfb6, roughness: 0.95, uvPerMeter: 1 },
  rope: { color: 0x6d5b3c, roughness: 1.0, uvPerMeter: 1 },
};

export function createMaterial(key: MaterialKey): THREE.MeshStandardMaterial {
  const spec = SPECS[key];
  const params: THREE.MeshStandardMaterialParameters = {
    roughness: spec.roughness,
    metalness: spec.metalness ?? 0,
    flatShading: spec.flatShading ?? false,
  };
  if (spec.painted) {
    const painted = spec.painted();
    params.map = painted.map;
    params.normalMap = painted.normalMap;
  } else {
    params.color = spec.color ?? 0xffffff;
  }
  const mat = new THREE.MeshStandardMaterial(params);
  if (spec.normalScale) mat.normalScale = new THREE.Vector2(spec.normalScale, spec.normalScale);
  if (key === "window") {
    mat.emissive = new THREE.Color(0xffb85c);
    mat.emissiveIntensity = 0;
    mat.map = tex.windowGlass();
  }
  return mat;
}

// ---------------------------------------------------------------------------
// colliders
// ---------------------------------------------------------------------------

export interface BoxCollider {
  kind: "box";
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  /** Rotation about Y, radians. */
  rot: number;
  cos: number;
  sin: number;
  /** World Y of the walkable top surface. */
  top: number;
  /** World Y of the underside; the player may pass beneath (bridge spans). */
  bottom: number;
}

export interface CircleCollider {
  kind: "circle";
  cx: number;
  cz: number;
  r: number;
  top: number;
  bottom: number;
}

export type Collider = BoxCollider | CircleCollider;

/** Anything the player can walk into, walk onto, or duck under. */
export class ColliderSet {
  readonly items: Collider[] = [];
  /** Uniform grid over XZ so a move tests ~6 colliders instead of ~2000. */
  private grid = new Map<number, number[]>();
  private cell = 8;
  private built = false;

  addBox(cx: number, cz: number, hx: number, hz: number, rot: number, top: number, bottom = -50) {
    this.items.push({
      kind: "box",
      cx,
      cz,
      hx,
      hz,
      rot,
      cos: Math.cos(rot),
      sin: Math.sin(rot),
      top,
      bottom,
    });
  }

  addCircle(cx: number, cz: number, r: number, top: number, bottom = -50) {
    this.items.push({ kind: "circle", cx, cz, r, top, bottom });
  }

  private key(ix: number, iz: number) {
    return ix * 10007 + iz;
  }

  /** Bucket every collider once the world is finished. */
  finalize() {
    this.grid.clear();
    this.items.forEach((c, index) => {
      const reach = c.kind === "circle" ? c.r : Math.hypot(c.hx, c.hz);
      const x0 = Math.floor((c.cx - reach - 1) / this.cell);
      const x1 = Math.floor((c.cx + reach + 1) / this.cell);
      const z0 = Math.floor((c.cz - reach - 1) / this.cell);
      const z1 = Math.floor((c.cz + reach + 1) / this.cell);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const k = this.key(ix, iz);
          const list = this.grid.get(k);
          if (list) list.push(index);
          else this.grid.set(k, [index]);
        }
      }
    });
    this.built = true;
  }

  /** Colliders whose cell overlaps a point, with a small query radius. */
  near(x: number, z: number, radius: number): Collider[] {
    if (!this.built) return this.items;
    const out: Collider[] = [];
    const seen = new Set<number>();
    const x0 = Math.floor((x - radius) / this.cell);
    const x1 = Math.floor((x + radius) / this.cell);
    const z0 = Math.floor((z - radius) / this.cell);
    const z1 = Math.floor((z + radius) / this.cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.grid.get(this.key(ix, iz));
        if (!list) continue;
        for (const index of list) {
          if (seen.has(index)) continue;
          seen.add(index);
          out.push(this.items[index]);
        }
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------

/**
 * mergeGeometries refuses to mix indexed and non-indexed inputs. three's own
 * primitives are indexed and the hand-built ones here are not, so give the
 * latter a trivial index rather than expanding the former.
 */
function ensureIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geo.getIndex()) return geo;
  const count = geo.attributes.position.count;
  const index = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  for (let i = 0; i < count; i++) index[i] = i;
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

/**
 * Box with UVs measured in world units, so a 12 m warehouse wall shows twelve
 * metres of brick rather than one stretched tile.
 */
export function worldBox(w: number, h: number, d: number, uvPerMeter: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry emits faces in the order +X, -X, +Y, -Y, +Z, -Z, four verts each.
  const spans: Array<[number, number]> = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = spans[face];
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su * uvPerMeter, uv.getY(idx) * sv * uvPerMeter);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * A gable roof solid: triangular cross-section in XY, extruded along Z.
 * Origin sits at the centre of the eaves line.
 */
export function gablePrism(width: number, height: number, depth: number, uvPerMeter: number): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const slope = Math.hypot(hw, height);
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];

  const tri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    n: [number, number, number],
    ta: [number, number],
    tb: [number, number],
    tc: [number, number],
  ) => {
    pos.push(...a, ...b, ...c);
    nor.push(...n, ...n, ...n);
    uvs.push(...ta, ...tb, ...tc);
  };

  const nRight: [number, number, number] = [height / slope, hw / slope, 0];
  const nLeft: [number, number, number] = [-height / slope, hw / slope, 0];
  const su = slope * uvPerMeter;
  const sv = depth * uvPerMeter;

  // right pitch
  tri([hw, 0, -hd], [0, height, -hd], [0, height, hd], nRight, [0, 0], [su, 0], [su, sv]);
  tri([hw, 0, -hd], [0, height, hd], [hw, 0, hd], nRight, [0, 0], [su, sv], [0, sv]);
  // left pitch
  tri([-hw, 0, hd], [0, height, hd], [0, height, -hd], nLeft, [0, sv], [su, sv], [su, 0]);
  tri([-hw, 0, hd], [0, height, -hd], [-hw, 0, -hd], nLeft, [0, sv], [su, 0], [0, 0]);
  // gable ends
  const gu = width * uvPerMeter;
  const gv = height * uvPerMeter;
  tri([-hw, 0, hd], [hw, 0, hd], [0, height, hd], [0, 0, 1], [0, 0], [gu, 0], [gu / 2, gv]);
  tri([hw, 0, -hd], [-hw, 0, -hd], [0, height, -hd], [0, 0, -1], [0, 0], [gu, 0], [gu / 2, gv]);
  // underside, so the roof is not see-through from a hilltop
  tri([-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [0, -1, 0], [0, 0], [gu, 0], [gu, sv]);
  tri([-hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [0, -1, 0], [0, 0], [gu, sv], [0, sv]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

/** A hipped/pyramid roof over a rectangular footprint. */
export function pyramidRoof(width: number, height: number, depth: number, uvPerMeter: number): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const pos: number[] = [];
  const uvs: number[] = [];
  const corners: Array<[number, number]> = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    pos.push(ax, 0, az, bx, 0, bz, 0, height, 0);
    const w = Math.hypot(bx - ax, bz - az) * uvPerMeter;
    const h = Math.hypot(height, (hw + hd) / 2) * uvPerMeter;
    uvs.push(0, 0, w, 0, w / 2, h);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

export function worldCylinder(
  rTop: number,
  rBottom: number,
  height: number,
  segments: number,
  uvPerMeter: number,
  open = false,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, height, segments, 1, open);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const circumference = Math.PI * (rTop + rBottom);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * circumference * uvPerMeter, uv.getY(i) * height * uvPerMeter);
  }
  uv.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------
// builder
// ---------------------------------------------------------------------------

const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3(1, 1, 1);
const _pos = new THREE.Vector3();

export interface Placement {
  x: number;
  y: number;
  z: number;
  rotY?: number;
  rotX?: number;
  rotZ?: number;
}

export class TownBuilder {
  private buckets = new Map<MaterialKey, THREE.BufferGeometry[]>();
  readonly colliders = new ColliderSet();

  uvPerMeter(key: MaterialKey) {
    return SPECS[key].uvPerMeter;
  }

  /** Push an already-built geometry into a material bucket at a placement. */
  add(key: MaterialKey, geo: THREE.BufferGeometry, p: Placement) {
    _euler.set(p.rotX ?? 0, p.rotY ?? 0, p.rotZ ?? 0, "YXZ");
    _quat.setFromEuler(_euler);
    _pos.set(p.x, p.y, p.z);
    _matrix.compose(_pos, _quat, _scale);
    const clone = ensureIndexed(geo.clone()).applyMatrix4(_matrix);
    const bucket = this.buckets.get(key);
    if (bucket) bucket.push(clone);
    else this.buckets.set(key, [clone]);
  }

  /**
   * Box whose origin is its centre. `solid` registers a collider spanning the
   * footprint with the box top as its walkable surface.
   */
  box(
    key: MaterialKey,
    size: { w: number; h: number; d: number },
    p: Placement,
    solid = false,
  ) {
    this.add(key, worldBox(size.w, size.h, size.d, this.uvPerMeter(key)), p);
    if (solid) {
      this.colliders.addBox(p.x, p.z, size.w / 2, size.d / 2, p.rotY ?? 0, p.y + size.h / 2, p.y - size.h / 2);
    }
  }

  /** Box resting on the ground: y is the base, not the centre. */
  boxOn(key: MaterialKey, size: { w: number; h: number; d: number }, p: Placement, solid = false) {
    this.box(key, size, { ...p, y: p.y + size.h / 2 }, solid);
  }

  cylinder(
    key: MaterialKey,
    rTop: number,
    rBottom: number,
    height: number,
    p: Placement,
    segments = 10,
    solid = false,
  ) {
    this.add(key, worldCylinder(rTop, rBottom, height, segments, this.uvPerMeter(key)), p);
    if (solid) {
      this.colliders.addCircle(p.x, p.z, Math.max(rTop, rBottom), p.y + height / 2, p.y - height / 2);
    }
  }

  /** A lumpy sphere - foliage, mostly. */
  blob(key: MaterialKey, radius: number, p: Placement, squash = 1, detail = 1) {
    const geo = new THREE.IcosahedronGeometry(radius, detail);
    if (squash !== 1) geo.scale(1, squash, 1);
    this.add(key, geo, p);
    geo.dispose();
  }

  /** Vertical post standing on the ground at (x, z). */
  post(key: MaterialKey, radius: number, height: number, x: number, y: number, z: number, solid = false) {
    this.cylinder(key, radius, radius * 1.08, height, { x, y: y + height / 2, z }, 7, false);
    if (solid) this.colliders.addCircle(x, z, radius, y + height, y);
  }

  gable(
    key: MaterialKey,
    width: number,
    height: number,
    depth: number,
    p: Placement,
  ) {
    this.add(key, gablePrism(width, height, depth, this.uvPerMeter(key)), p);
  }

  pyramid(key: MaterialKey, width: number, height: number, depth: number, p: Placement) {
    this.add(key, pyramidRoof(width, height, depth, this.uvPerMeter(key)), p);
  }

  /** Flat horizontal quad, e.g. a road surface or a dock deck. */
  quad(key: MaterialKey, w: number, d: number, p: Placement, segments = 1) {
    const geo = new THREE.PlaneGeometry(w, d, segments, segments);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const scale = this.uvPerMeter(key);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * scale, uv.getY(i) * d * scale);
    uv.needsUpdate = true;
    this.add(key, geo, { ...p, rotX: -Math.PI / 2 });
  }

  /** Merge every bucket and attach the result to the given parent. */
  build(scene: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const [key, geos] of this.buckets) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, createMaterial(key));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `town-${key}`;
      scene.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    this.colliders.finalize();
    return meshes;
  }
}
