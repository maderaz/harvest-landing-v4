// Sky, sun and fog.
//
// The dome is a single inverted sphere with a procedural gradient, a sun
// disc, drifting cloud bands and - after dark - stars. Four presets drive
// everything else in the scene: the directional light, the fog, the colour
// the water reflects, and how brightly the windows glow.

import * as THREE from "three";

export interface SkyPreset {
  label: string;
  /** Degrees above the horizon. */
  altitude: number;
  /** Degrees clockwise from north. */
  azimuth: number;
  zenith: number;
  horizon: number;
  haze: number;
  sunColor: number;
  sunIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
  groundBounce: number;
  fogColor: number;
  fogDensity: number;
  /** How lit the windows and lanterns are, 0-1. */
  lampGlow: number;
  starAmount: number;
  waterDeep: number;
  waterShallow: number;
}

export const PRESETS: SkyPreset[] = [
  {
    label: "Dawn",
    altitude: 7,
    azimuth: 96,
    zenith: 0x2f4a72,
    horizon: 0xe8a06a,
    haze: 0xf2c79a,
    sunColor: 0xffcf9a,
    sunIntensity: 2.2,
    ambientColor: 0x8296bd,
    ambientIntensity: 0.85,
    groundBounce: 0x6b6045,
    fogColor: 0xd8b294,
    fogDensity: 0.0062,
    lampGlow: 0.55,
    starAmount: 0.15,
    waterDeep: 0x14202e,
    waterShallow: 0x2c3a3c,
  },
  {
    label: "Morning",
    altitude: 46,
    azimuth: 128,
    zenith: 0x2f6bb5,
    horizon: 0xa8c8e4,
    haze: 0xd6e4ef,
    sunColor: 0xfff2dc,
    sunIntensity: 4.1,
    ambientColor: 0xa9c6e6,
    ambientIntensity: 1.25,
    groundBounce: 0x7d7458,
    fogColor: 0xc3d4e0,
    fogDensity: 0.0034,
    lampGlow: 0,
    starAmount: 0,
    waterDeep: 0x0a1a24,
    waterShallow: 0x1d3a38,
  },
  {
    label: "Golden hour",
    altitude: 11,
    azimuth: 268,
    zenith: 0x3a5a8c,
    horizon: 0xf0a557,
    haze: 0xf6c98a,
    sunColor: 0xffb765,
    sunIntensity: 3.4,
    ambientColor: 0xa294b8,
    ambientIntensity: 0.95,
    groundBounce: 0x8a6f47,
    fogColor: 0xe0ac78,
    fogDensity: 0.0055,
    lampGlow: 0.4,
    starAmount: 0,
    waterDeep: 0x141c22,
    waterShallow: 0x3a3428,
  },
  {
    label: "Night",
    altitude: 34,
    azimuth: 210,
    zenith: 0x060c1c,
    horizon: 0x16233d,
    haze: 0x24334f,
    sunColor: 0xbcc9e8,
    sunIntensity: 0.7,
    ambientColor: 0x33456e,
    ambientIntensity: 0.55,
    groundBounce: 0x1e2432,
    fogColor: 0x101a2c,
    fogDensity: 0.0075,
    lampGlow: 1,
    starAmount: 1,
    waterDeep: 0x05080f,
    waterShallow: 0x0b1420,
  },
];

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w; // pin to the far plane
  }
`;

const SKY_FRAG = /* glsl */ `
  // The renderer's own prefix already supplies the tone-mapping and
  // colour-space helpers; including their _pars_ chunks here would redefine them.
  #include <common>
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, -1.0, 1.0);

    // Vertical gradient, with a bright band hugging the horizon.
    vec3 color = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.62));
    color = mix(color, uHaze, pow(1.0 - clamp(abs(h) * 3.2, 0.0, 1.0), 3.0) * 0.75);
    color = mix(color * 0.62, color, smoothstep(-0.25, 0.02, h));

    // Sun disc plus its bloom.
    float cosAngle = dot(dir, uSunDir);
    float disc = smoothstep(0.9993, 0.99975, cosAngle);
    float glow = pow(max(cosAngle, 0.0), 220.0) * 0.5 + pow(max(cosAngle, 0.0), 12.0) * 0.28;
    color += uSunColor * (disc * 9.0 + glow);

    // Stars, only above the horizon and only at night.
    if (uStars > 0.001 && h > 0.0) {
      vec2 sp = dir.xz / max(abs(dir.y), 0.08) * 6.0;
      float star = pow(hash(floor(sp * 34.0)), 240.0);
      float twinkle = 0.65 + 0.35 * sin(uTime * 2.4 + hash(floor(sp * 34.0)) * 90.0);
      color += vec3(0.85, 0.9, 1.0) * star * 34.0 * uStars * twinkle * smoothstep(0.0, 0.25, h);
    }

    // A thin, slow layer of cloud.
    if (h > 0.005) {
      vec2 cp = dir.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.0045, uTime * 0.0022);
      float clouds = smoothstep(0.52, 0.86, fbm(cp * 1.4));
      clouds *= smoothstep(0.0, 0.28, h);
      vec3 cloudColor = mix(uHaze, uSunColor, 0.28) * (0.85 + glow * 1.6);
      color = mix(color, cloudColor, clouds * 0.72);
    }

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SkyRig {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sunDirection = new THREE.Vector3();
  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private fog: THREE.FogExp2;
  private current: SkyPreset;
  private target: SkyPreset;
  private blend = 1;
  private index = 1;

  /** Interpolated lamp brightness, read by the window material each frame. */
  lampGlow = 0;

  constructor(scene: THREE.Scene, start = 1) {
    this.index = start;
    this.current = { ...PRESETS[start] };
    this.target = PRESETS[start];

    const geo = new THREE.SphereGeometry(1, 32, 20);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uHaze: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uStars: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.scale.setScalar(1);
    scene.add(this.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    const extent = 118;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.bias = -0.0007;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444422, 0.7);
    scene.add(this.hemi);

    this.fog = new THREE.FogExp2(0xc3d4e0, 0.0034);
    scene.fog = this.fog;

    this.applyImmediate(PRESETS[start]);
  }

  get presetLabel() {
    return PRESETS[this.index].label;
  }

  /** Cycle to the next time of day; the transition eases over ~2 seconds. */
  cycle(): string {
    this.index = (this.index + 1) % PRESETS.length;
    this.target = PRESETS[this.index];
    this.blend = 0;
    return this.target.label;
  }

  private applyImmediate(preset: SkyPreset) {
    this.current = { ...preset };
    this.blend = 1;
    this.push();
  }

  private push() {
    const c = this.current;
    const alt = (c.altitude * Math.PI) / 180;
    const azi = (c.azimuth * Math.PI) / 180;
    this.sunDirection.set(
      Math.cos(alt) * Math.sin(azi),
      Math.sin(alt),
      Math.cos(alt) * Math.cos(azi),
    );

    this.material.uniforms.uZenith.value.setHex(c.zenith).convertSRGBToLinear();
    this.material.uniforms.uHorizon.value.setHex(c.horizon).convertSRGBToLinear();
    this.material.uniforms.uHaze.value.setHex(c.haze).convertSRGBToLinear();
    this.material.uniforms.uSunColor.value.setHex(c.sunColor).convertSRGBToLinear();
    this.material.uniforms.uSunDir.value.copy(this.sunDirection);
    this.material.uniforms.uStars.value = c.starAmount;

    this.sun.color.setHex(c.sunColor);
    this.sun.intensity = c.sunIntensity;
    this.hemi.color.setHex(c.ambientColor);
    this.hemi.groundColor.setHex(c.groundBounce);
    this.hemi.intensity = c.ambientIntensity;
    this.fog.color.setHex(c.fogColor);
    this.fog.density = c.fogDensity;
    this.lampGlow = c.lampGlow;
  }

  update(dt: number, time: number, camera: THREE.Camera) {
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt * 0.5);
      // Smoothstep the crossfade so the light does not snap at either end.
      const t = this.blend * this.blend * (3 - 2 * this.blend);
      const from = this.current;
      const to = this.target;
      const lerp = (a: number, b: number) => a + (b - a) * t;
      const lerpHex = (a: number, b: number) => {
        const ca = new THREE.Color(a);
        const cb = new THREE.Color(b);
        return ca.lerp(cb, t).getHex();
      };
      this.current = {
        ...to,
        altitude: lerp(from.altitude, to.altitude),
        azimuth: lerp(from.azimuth, to.azimuth),
        zenith: lerpHex(from.zenith, to.zenith),
        horizon: lerpHex(from.horizon, to.horizon),
        haze: lerpHex(from.haze, to.haze),
        sunColor: lerpHex(from.sunColor, to.sunColor),
        sunIntensity: lerp(from.sunIntensity, to.sunIntensity),
        ambientColor: lerpHex(from.ambientColor, to.ambientColor),
        ambientIntensity: lerp(from.ambientIntensity, to.ambientIntensity),
        groundBounce: lerpHex(from.groundBounce, to.groundBounce),
        fogColor: lerpHex(from.fogColor, to.fogColor),
        fogDensity: lerp(from.fogDensity, to.fogDensity),
        lampGlow: lerp(from.lampGlow, to.lampGlow),
        starAmount: lerp(from.starAmount, to.starAmount),
        waterDeep: lerpHex(from.waterDeep, to.waterDeep),
        waterShallow: lerpHex(from.waterShallow, to.waterShallow),
      };
      // Reset the crossfade origin so the next frame interpolates from here.
      this.blend = Math.min(1, this.blend);
      this.push();
      if (this.blend >= 1) this.current = { ...this.target };
    }

    this.material.uniforms.uTime.value = time;

    // Keep the dome and the shadow volume centred on the viewer.
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(1);
    this.sun.target.position.copy(camera.position);
    this.sun.position.copy(camera.position).addScaledVector(this.sunDirection, 140);
    this.sun.target.updateMatrixWorld();
  }

  get preset(): SkyPreset {
    return this.current;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
