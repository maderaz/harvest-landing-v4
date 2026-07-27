// The ground under Nieuw Amsterdam, and the water around it.
//
// The island is a signed-distance field (a rounded rectangle whose southern
// corners round off into the tip of Manhattan) perturbed by fractal noise so
// the shoreline wanders. The same height function feeds the terrain mesh, the
// player's footing, the shore texture the water shader reads for foam, and
// the minimap - one source of truth, no drift.

import * as THREE from "three";
import { fbm2D } from "./random";
import { groundDetail } from "./textures";

export const WATER_Y = 0;
/** Street level across the settlement. */
export const TOWN_Y = 0.6;
/** Terrain lower than this is too deep to wade; the player is stopped. */
export const WADE_LIMIT = -1.05;

// Terrain patch bounds. Beyond these the world is open water plus the
// distant shores of Breuckelen and the Jersey side.
export const TERRAIN_MIN_X = -180;
export const TERRAIN_MAX_X = 180;
export const TERRAIN_MIN_Z = -250;
export const TERRAIN_MAX_Z = 180;

// The Heere Gracht - the canal that became Broad Street.
export const CANAL_X = 28;
export const CANAL_HALF = 4.4;
export const CANAL_Z_NORTH = -10;
export const CANAL_Z_SOUTH = 88;
const CANAL_BED = -0.9;

const shoreNoise = fbm2D(1337, 4);
const hillNoise = fbm2D(5150, 4);
const bumpNoise = fbm2D(90210, 3);

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Rounded-rectangle SDF; negative inside. */
function sdRoundRect(px: number, pz: number, cx: number, cz: number, hx: number, hz: number, r: number) {
  const qx = Math.abs(px - cx) - hx + r;
  const qz = Math.abs(pz - cz) - hz + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, qz), 0);
  return outside + inside - r;
}

/**
 * Metres from the shoreline, positive on land.
 *
 * Two shapes, unioned. The island is a rounded rectangle with a noisy edge -
 * that wobble is what makes the coast read as a coast instead of a stadium.
 * Under it sits a clean "town platform" covering the settled ground, so the
 * noise can never eat the fort's south-west bastion or the Strand.
 */
export function shoreDistance(x: number, z: number): number {
  const island =
    -sdRoundRect(x, z, -4, -86, 90, 168, 40) +
    (shoreNoise(x * 0.014, z * 0.014) - 0.5) * 8 +
    (shoreNoise(x * 0.05 + 40, z * 0.05) - 0.5) * 3;
  const platform = -sdRoundRect(x, z, -2, 16, 76, 62, 28);
  return Math.max(island, platform);
}

/** Perpendicular distance from the canal's centre line, or Infinity if past its ends. */
function canalDistance(x: number, z: number): number {
  if (z < CANAL_Z_NORTH - 6 || z > CANAL_Z_SOUTH + 4) return Infinity;
  const clamped = Math.min(CANAL_Z_SOUTH, Math.max(CANAL_Z_NORTH, z));
  return Math.hypot(x - CANAL_X, z - clamped);
}

/** Ground height at a world point, before any building or deck is considered. */
export function landHeight(x: number, z: number): number {
  const d = shoreDistance(x, z);

  // -5 m offshore, 0 at the waterline, street level a few metres inland.
  const deep = smoothstep(-16, -0.5, d);
  let h = -5.2 + 5.2 * deep + TOWN_Y * smoothstep(-0.5, 7, d);

  // Rolling ground, suppressed inside the settled area so streets stay level.
  const settled = 1 - smoothstep(52, 130, Math.hypot(x - 5, (z - 12) * 0.8));
  const wild = (1 - settled) * smoothstep(4, 22, d);
  // Raised to a power rather than centred on zero: Manhattan was an island
  // of many hills, not of many ponds, and a dip here would flood the woods.
  h += Math.pow(hillNoise(x * 0.008, z * 0.008), 1.5) * 15 * wild;
  h += (bumpNoise(x * 0.05, z * 0.05) - 0.5) * 0.5 * smoothstep(1, 6, d) * (1 - settled * 0.8);

  // Carve the Heere Gracht. Only ever digs: where the canal reaches the
  // harbour the sea floor is already deeper, and it must stay that way.
  const cd = canalDistance(x, z);
  if (cd < CANAL_HALF + 1.4) {
    const t = smoothstep(CANAL_HALF + 1.4, CANAL_HALF - 0.2, cd);
    h = Math.min(h, h * (1 - t) + CANAL_BED * t);
  }

  return h;
}

export interface TerrainResult {
  mesh: THREE.Mesh;
  shoreTexture: THREE.DataTexture;
  dispose: () => void;
}

const SAND = new THREE.Color(0.74, 0.66, 0.5);
const WET_SAND = new THREE.Color(0.44, 0.39, 0.31);
const TURF = new THREE.Color(0.4, 0.49, 0.24);
const DRY_TURF = new THREE.Color(0.55, 0.54, 0.3);
const SILT = new THREE.Color(0.3, 0.27, 0.2);

export function buildTerrain(): TerrainResult {
  const width = TERRAIN_MAX_X - TERRAIN_MIN_X;
  const depth = TERRAIN_MAX_Z - TERRAIN_MIN_Z;
  const segX = 232;
  const segZ = 268;

  const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate((TERRAIN_MIN_X + TERRAIN_MAX_X) / 2, 0, (TERRAIN_MIN_Z + TERRAIN_MAX_Z) / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const tint = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = landHeight(x, z);
    pos.setY(i, h);

    // Ground detail texture is tiled in world units so nothing stretches.
    uv.setXY(i, x * 0.09, z * 0.09);

    const d = shoreDistance(x, z);
    const grain = bumpNoise(x * 0.11, z * 0.11);
    if (h < -0.45) {
      tint.copy(SILT).lerp(WET_SAND, smoothstep(-2.4, -0.45, h));
    } else {
      tint.copy(SAND).lerp(WET_SAND, 1 - smoothstep(-0.45, 0.25, h));
      const green = smoothstep(1.5, 9, d);
      tint.lerp(grain > 0.55 ? DRY_TURF : TURF, green);
    }
    tint.multiplyScalar(0.86 + grain * 0.28);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const detail = groundDetail();
  const material = new THREE.MeshStandardMaterial({
    map: detail.map,
    normalMap: detail.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.name = "terrain";

  return {
    mesh,
    shoreTexture: buildShoreTexture(),
    dispose: () => {
      geo.dispose();
      material.dispose();
    },
  };
}

/**
 * A coarse height map of the whole terrain patch, sampled by the water shader
 * to tint the shallows and draw the foam line where surf meets sand.
 */
function buildShoreTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = TERRAIN_MIN_X + ((i + 0.5) / size) * (TERRAIN_MAX_X - TERRAIN_MIN_X);
      const z = TERRAIN_MIN_Z + ((j + 0.5) / size) * (TERRAIN_MAX_Z - TERRAIN_MIN_Z);
      // Encode -6..+2 metres into 0..255.
      const h = Math.min(2, Math.max(-6, landHeight(x, z)));
      data[j * size + i] = Math.round(((h + 6) / 8) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// water
// ---------------------------------------------------------------------------

export interface WaterResult {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  dispose: () => void;
}

const WATER_VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorld = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    #include <fog_vertex>
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const WATER_FRAG = /* glsl */ `
  // Tone-mapping and colour-space helpers come from the renderer's prefix.
  #include <common>
  #include <fog_pars_fragment>

  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform sampler2D uShore;
  uniform vec2 uShoreMin;
  uniform vec2 uShoreSize;
  varying vec3 vWorld;

  // Four crossing swells; the derivative gives us a normal without any
  // extra geometry, which keeps the harbour at two triangles' worth of cost.
  vec3 waveNormal(vec2 p, float t) {
    vec2 dirs[4];
    dirs[0] = normalize(vec2(1.0, 0.35));
    dirs[1] = normalize(vec2(-0.4, 1.0));
    dirs[2] = normalize(vec2(0.7, -0.8));
    dirs[3] = normalize(vec2(-0.9, -0.25));
    float freqs[4]; freqs[0] = 0.42; freqs[1] = 0.75; freqs[2] = 1.6; freqs[3] = 2.9;
    float amps[4];  amps[0] = 0.085; amps[1] = 0.05; amps[2] = 0.022; amps[3] = 0.009;
    float speeds[4]; speeds[0] = 0.7; speeds[1] = 1.05; speeds[2] = 1.7; speeds[3] = 2.6;

    vec2 slope = vec2(0.0);
    for (int i = 0; i < 4; i++) {
      float phase = dot(dirs[i], p) * freqs[i] + t * speeds[i];
      float d = cos(phase) * amps[i] * freqs[i];
      slope += dirs[i] * d;
    }
    return normalize(vec3(-slope.x, 1.0, -slope.y));
  }

  float waveHeight(vec2 p, float t) {
    return sin(dot(normalize(vec2(1.0, 0.35)), p) * 0.42 + t * 0.7) * 0.5 + 0.5;
  }

  void main() {
    vec2 uvShore = (vWorld.xz - uShoreMin) / uShoreSize;
    float inPatch = step(0.0, uvShore.x) * step(uvShore.x, 1.0) * step(0.0, uvShore.y) * step(uvShore.y, 1.0);
    float ground = texture2D(uShore, clamp(uvShore, 0.0, 1.0)).r * 8.0 - 6.0;
    ground = mix(-6.0, ground, inPatch);

    // The sea sheet spans the whole world so it always reaches the horizon,
    // which means it also passes underneath the island. Throw those fragments
    // away: dry land is never underwater, and the surf band would otherwise
    // paint the streets white.
    if (ground > 0.02) discard;

    float depth = clamp(-ground, 0.0, 6.0);

    vec3 viewDir = normalize(cameraPosition - vWorld);
    // Ripple detail is only resolvable nearby; past that it turns to moire.
    float far = smoothstep(35.0, 240.0, length(cameraPosition.xz - vWorld.xz));
    vec3 normal = normalize(mix(waveNormal(vWorld.xz, uTime), vec3(0.0, 1.0, 0.0), far));
    float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.4);
    fresnel = mix(0.06, 1.0, fresnel);

    vec3 body = mix(uShallowColor, uDeepColor, smoothstep(0.2, 3.2, depth));
    vec3 color = mix(body, uSkyColor, fresnel * 0.82);

    // Sun glitter.
    vec3 halfway = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(normal, halfway), 0.0), 220.0);
    color += uSunColor * spec * 2.6;
    float sheen = pow(max(dot(normal, halfway), 0.0), 26.0);
    color += uSunColor * sheen * 0.16;

    // Surf: a band of foam that breathes with the leading swell.
    float band = 1.0 - smoothstep(0.0, 0.85, depth);
    float pulse = waveHeight(vWorld.xz * 1.6, uTime * 1.4);
    float foam = smoothstep(0.35, 0.95, band * (0.55 + pulse * 0.75));
    color = mix(color, vec3(0.92, 0.94, 0.93), foam * 0.85);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function buildWater(shoreTexture: THREE.DataTexture): WaterResult {
  const geo = new THREE.PlaneGeometry(2400, 2400, 72, 72);
  geo.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.5) },
        uSunColor: { value: new THREE.Color(1, 0.92, 0.78) },
        uSkyColor: { value: new THREE.Color(0.55, 0.68, 0.86) },
        uDeepColor: { value: new THREE.Color(0.035, 0.09, 0.115) },
        uShallowColor: { value: new THREE.Color(0.12, 0.22, 0.21) },
        uShore: { value: null },
        uShoreMin: { value: new THREE.Vector2(TERRAIN_MIN_X, TERRAIN_MIN_Z) },
        uShoreSize: { value: new THREE.Vector2(TERRAIN_MAX_X - TERRAIN_MIN_X, TERRAIN_MAX_Z - TERRAIN_MIN_Z) },
      },
    ]),
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    fog: true,
  });
  material.uniforms.uShore.value = shoreTexture;

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = WATER_Y;
  mesh.renderOrder = -1;
  mesh.name = "water";

  return {
    mesh,
    material,
    dispose: () => {
      geo.dispose();
      material.dispose();
      shoreTexture.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// distant shores
// ---------------------------------------------------------------------------

/**
 * Breuckelen across the East River, the Jersey bluffs to the west, and the
 * low green smudge of Staten Island out past the Narrows. Pure backdrop -
 * no colliders, no detail, just something on the horizon.
 */
export function buildDistantShores(): THREE.Group {
  const group = new THREE.Group();
  group.name = "distant-shores";

  const ridge = fbm2D(4242, 3);
  const strips: Array<{ cx: number; cz: number; w: number; d: number; rot: number }> = [
    { cx: 340, cz: -60, w: 300, d: 700, rot: 0 },
    { cx: -370, cz: -40, w: 300, d: 700, rot: 0 },
    { cx: 40, cz: 430, w: 900, d: 260, rot: 0 },
  ];

  const landMat = new THREE.MeshStandardMaterial({ color: 0x3c4a2c, roughness: 1 });
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2c3a22, roughness: 1, flatShading: true });
  const treeGeo = new THREE.ConeGeometry(4.5, 14, 5);

  let treeCount = 0;
  const treeMatrices: THREE.Matrix4[] = [];
  const matrix = new THREE.Matrix4();

  for (const strip of strips) {
    const geo = new THREE.PlaneGeometry(strip.w, strip.d, 44, 44);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + strip.cx;
      const z = pos.getZ(i) + strip.cz;
      // Sink the near edge below the waterline so the shore meets the sea.
      const edge = Math.min(
        1,
        Math.min(strip.w / 2 - Math.abs(pos.getX(i)), strip.d / 2 - Math.abs(pos.getZ(i))) / 45,
      );
      pos.setY(i, -6 + 8 * Math.max(0, edge) + ridge(x * 0.004, z * 0.004) * 16 * Math.max(0, edge));
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, landMat);
    mesh.position.set(strip.cx, 0, strip.cz);
    group.add(mesh);

    for (let i = 0; i < 130; i++) {
      const lx = (Math.sin(i * 12.9898 + strip.cx) * 43758.5453) % 1;
      const lz = (Math.sin(i * 78.233 + strip.cz) * 43758.5453) % 1;
      const x = strip.cx + lx * strip.w * 0.42;
      const z = strip.cz + lz * strip.d * 0.42;
      matrix.makeTranslation(x, 6 + ridge(x * 0.004, z * 0.004) * 12, z);
      treeMatrices.push(matrix.clone());
      treeCount++;
    }
  }

  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
  treeMatrices.forEach((m, i) => trees.setMatrixAt(i, m));
  trees.instanceMatrix.needsUpdate = true;
  group.add(trees);

  return group;
}
