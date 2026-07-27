"use client";

// The React shell around the engine: canvas lifecycle, input, HUD, minimap,
// and the plaques you collect by walking up to them.
//
// React state changes only on discrete events - a new landmark in range, a
// discovery, a change of hour. Per-frame values (the compass) are written
// straight to the DOM through refs so the render loop never re-renders.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { buildTerrain, buildWater, buildDistantShores, landHeight } from "./terrain";
import { buildWorld, type Landmark, type WorldResult } from "./world";
import { createInputState, Player, type InputState } from "./player";
import { SkyRig } from "./sky";
import { Ambience } from "./audio";
import { buildMapBackground, drawMap } from "./minimap";
import { disposeTextures } from "./textures";
import { disposeAnimated } from "./animated";
import { disposeNpcs } from "./npcs";
import { disposeShip } from "./ship";
import styles from "./game.module.css";

const MAP_SIZE = { w: 216, h: 222 };
const COMPASS_MARKS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
/** Two full turns, so the tape scrolls seamlessly through the wrap. */
const COMPASS_TAPE = [...COMPASS_MARKS, ...COMPASS_MARKS];

type Phase = "loading" | "ready" | "playing" | "paused";
type MoveKey = "forward" | "back" | "left" | "right";

export default function VillageGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLCanvasElement | null>(null);
  const compassStripRef = useRef<HTMLDivElement | null>(null);
  const compassLabelRef = useRef<HTMLSpanElement | null>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0);
  const [nearby, setNearby] = useState<Landmark | null>(null);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [hour, setHour] = useState("Morning");
  const [sound, setSound] = useState(true);
  const [showJournal, setShowJournal] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [isTouch, setIsTouch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<InputState>(createInputState());
  const soundRef = useRef(true);
  const discoveredRef = useRef<Set<string>>(new Set());
  const engineRef = useRef<{
    cycleTime: () => string;
    respawn: () => void;
    attachMap: () => void;
    ambience: Ambience;
  } | null>(null);

  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // The canvas covers the site chrome; stop the page behind it from scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // --- engine -------------------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let frameId = 0;
    const ambience = new Ambience();
    const cleanups: Array<() => void> = [];
    const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const boot = async () => {
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      } catch {
        setError("This browser could not start WebGL, so the town cannot be drawn.");
        return;
      }
      if (disposed) {
        renderer.dispose();
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      // updateStyle: false - the stylesheet keeps the canvas at 100% of the
      // mount, so a stale measurement can never leave a strip of page showing.
      renderer.setSize(mount.clientWidth, mount.clientHeight, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.domElement.classList.add(styles.canvas);
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.08, 1600);

      const sky = new SkyRig(scene, 1);
      setProgress(0.12);
      await nextFrame();
      if (disposed) return;

      const terrain = buildTerrain();
      scene.add(terrain.mesh);
      setProgress(0.32);
      await nextFrame();
      if (disposed) return;

      const water = buildWater(terrain.shoreTexture);
      scene.add(water.mesh);
      scene.add(buildDistantShores());
      setProgress(0.44);
      await nextFrame();
      if (disposed) return;

      let world: WorldResult;
      try {
        world = buildWorld(scene);
      } catch (err) {
        setError(err instanceof Error ? err.message : "The town failed to build.");
        return;
      }
      setLandmarks(world.landmarks);
      setProgress(0.88);
      await nextFrame();
      if (disposed) return;

      const player = new Player(world.builder.colliders, {
        onFootstep: (surface) => ambience.footstep(surface),
        onLand: (impact) => ambience.land(impact),
        onSplash: () => ambience.splash(),
      });
      player.spawn(world.spawn.x, world.spawn.z, world.spawn.yaw);
      // NPCs stand on whatever the player would stand on at their feet.
      world.attachPopulation((x, z) => player.supportHeight(x, z, landHeight(x, z) + 1.2).y);

      const mapBackground = buildMapBackground(world, MAP_SIZE.w, MAP_SIZE.h);
      let mapCtx: CanvasRenderingContext2D | null = null;
      const attachMap = () => {
        const canvas = mapRef.current;
        if (!canvas) {
          mapCtx = null;
          return;
        }
        const mapDpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(MAP_SIZE.w * mapDpr);
        canvas.height = Math.round(MAP_SIZE.h * mapDpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(mapDpr, 0, 0, mapDpr, 0, 0);
        mapCtx = ctx;
      };
      attachMap();

      setProgress(1);
      setPhase("ready");

      // --- keyboard --------------------------------------------------------
      const input = inputRef.current;
      const moveKeys: Record<string, MoveKey> = {
        KeyW: "forward",
        ArrowUp: "forward",
        KeyS: "back",
        ArrowDown: "back",
        KeyA: "left",
        ArrowLeft: "left",
        KeyD: "right",
        ArrowRight: "right",
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.repeat) return;
        const move = moveKeys[e.code];
        if (move) {
          input[move] = true;
          e.preventDefault();
          return;
        }
        switch (e.code) {
          case "Space":
            input.jump = true;
            e.preventDefault();
            break;
          case "ShiftLeft":
          case "ShiftRight":
            input.sprint = true;
            break;
          case "KeyT":
            setHour(sky.cycle());
            break;
          case "KeyM":
            setShowMap((v) => !v);
            break;
          case "KeyJ":
            setShowJournal((v) => !v);
            break;
          case "KeyR":
            player.spawn(world.spawn.x, world.spawn.z, world.spawn.yaw);
            break;
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        const move = moveKeys[e.code];
        if (move) input[move] = false;
        else if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.sprint = false;
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      cleanups.push(() => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      });

      // --- mouse look ------------------------------------------------------
      const onMouseMove = (e: MouseEvent) => {
        if (document.pointerLockElement !== renderer.domElement) return;
        input.lookX += e.movementX;
        input.lookY += e.movementY;
      };
      const onLockChange = () => {
        const locked = document.pointerLockElement === renderer.domElement;
        setPhase(locked ? "playing" : "paused");
        if (!locked) {
          input.forward = input.back = input.left = input.right = false;
          input.sprint = false;
        }
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("pointerlockchange", onLockChange);
      cleanups.push(() => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("pointerlockchange", onLockChange);
      });

      // --- touch: left thumb walks, right thumb looks -----------------------
      const active = new Map<number, { x: number; y: number; ox: number; oy: number; stick: boolean }>();
      const onPointerDown = (e: PointerEvent) => {
        if (e.pointerType !== "touch") return;
        setIsTouch(true);
        active.set(e.pointerId, {
          x: e.clientX,
          y: e.clientY,
          ox: e.clientX,
          oy: e.clientY,
          stick: e.clientX < window.innerWidth * 0.45,
        });
        renderer.domElement.setPointerCapture(e.pointerId);
      };
      const onPointerMove = (e: PointerEvent) => {
        const t = active.get(e.pointerId);
        if (!t) return;
        if (t.stick) {
          input.moveX = Math.max(-1, Math.min(1, (e.clientX - t.ox) / 55));
          input.moveY = Math.max(-1, Math.min(1, -(e.clientY - t.oy) / 55));
        } else {
          input.lookX += e.clientX - t.x;
          input.lookY += e.clientY - t.y;
        }
        t.x = e.clientX;
        t.y = e.clientY;
      };
      const onPointerUp = (e: PointerEvent) => {
        const t = active.get(e.pointerId);
        if (!t) return;
        if (t.stick) {
          input.moveX = 0;
          input.moveY = 0;
        }
        active.delete(e.pointerId);
      };
      const el = renderer.domElement;
      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", onPointerUp);
      cleanups.push(() => {
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
        el.removeEventListener("pointercancel", onPointerUp);
      });

      const onResize = () => {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      // A ResizeObserver catches mobile browser-chrome collapse and layout
      // settling, neither of which fires a window resize event.
      const observer = new ResizeObserver(onResize);
      observer.observe(mount);
      window.addEventListener("orientationchange", onResize);
      cleanups.push(() => {
        observer.disconnect();
        window.removeEventListener("orientationchange", onResize);
      });

      engineRef.current = {
        cycleTime: () => sky.cycle(),
        respawn: () => player.spawn(world.spawn.x, world.spawn.z, world.spawn.yaw),
        attachMap,
        ambience,
      };

      if (process.env.NODE_ENV !== "production") {
        // Dev handle for poking at the town from the console; the whole block
        // is compiled out of the production bundle.
        (window as unknown as { __village?: unknown }).__village = { player, sky, world, camera, scene };
      }

      // --- render loop --------------------------------------------------------
      let lastTime = performance.now();
      let elapsed = 0;
      let currentNearby: string | null = null;
      let mapClock = 0;
      let lastHeading = "";

      const tick = () => {
        frameId = requestAnimationFrame(tick);
        const now = performance.now();
        // Clamp so a backgrounded tab does not teleport the player on return.
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        elapsed += dt;

        player.update(dt, input, camera);
        sky.update(dt, elapsed, camera);
        world.update(dt, elapsed);
        world.setLampGlow(sky.preset.lampGlow);
        ambience.tick(dt);

        const u = water.material.uniforms;
        u.uTime.value = elapsed;
        u.uSunDir.value.copy(sky.sunDirection);
        u.uSunColor.value.setHex(sky.preset.sunColor).convertSRGBToLinear();
        u.uSkyColor.value.setHex(sky.preset.horizon).convertSRGBToLinear();
        u.uDeepColor.value.setHex(sky.preset.waterDeep).convertSRGBToLinear();
        u.uShallowColor.value.setHex(sky.preset.waterShallow).convertSRGBToLinear();
        // Keep the sea centred on the viewer so it always reaches the horizon.
        water.mesh.position.set(camera.position.x, 0, camera.position.z);

        // The nearest landmark you are standing inside.
        let found: Landmark | null = null;
        let best = Infinity;
        for (const landmark of world.landmarks) {
          const d = Math.hypot(player.position.x - landmark.x, player.position.z - landmark.z);
          if (d < landmark.radius && d < best) {
            best = d;
            found = landmark;
          }
        }
        if ((found?.id ?? null) !== currentNearby) {
          currentNearby = found?.id ?? null;
          setNearby(found);
          if (found && !discoveredRef.current.has(found.id)) {
            discoveredRef.current.add(found.id);
            setDiscovered(Array.from(discoveredRef.current));
            ambience.bell();
          }
        }

        // Compass, written straight to the DOM.
        const degrees = (((-player.yaw * 180) / Math.PI) % 360 + 360) % 360;
        if (compassStripRef.current) {
          compassStripRef.current.style.transform = `translateX(${-(degrees / 360) * 400}px)`;
        }
        const heading = COMPASS_MARKS[Math.round(degrees / 45) % 8];
        if (heading !== lastHeading && compassLabelRef.current) {
          lastHeading = heading;
          compassLabelRef.current.textContent = heading;
        }

        mapClock += dt;
        if (mapCtx && mapClock > 0.08) {
          mapClock = 0;
          drawMap(
            mapCtx,
            mapBackground,
            MAP_SIZE.w,
            MAP_SIZE.h,
            { x: player.position.x, z: player.position.z, yaw: player.yaw },
            world.landmarks,
            discoveredRef.current,
          );
        }

        renderer.render(scene, camera);
      };
      tick();

      cleanups.push(() => {
        cancelAnimationFrame(frameId);
        terrain.dispose();
        water.dispose();
        sky.dispose();
        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry?.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose();
        });
        renderer.dispose();
        renderer.domElement.remove();
      });
    };

    void boot();

    return () => {
      disposed = true;
      for (const fn of cleanups) fn();
      ambience.dispose();
      disposeAnimated();
      disposeNpcs();
      disposeShip();
      disposeTextures();
      engineRef.current = null;
    };
    // The engine builds once and manages its own lifecycle.
  }, []);

  // The map canvas is unmounted when hidden, so re-bind its context.
  useEffect(() => {
    if (showMap) engineRef.current?.attachMap();
  }, [showMap]);

  const enterGame = useCallback(() => {
    const canvas = mountRef.current?.querySelector("canvas");
    if (!canvas) return;
    void canvas.requestPointerLock?.();
    const ambience = engineRef.current?.ambience;
    if (ambience) void ambience.start().then(() => ambience.setEnabled(soundRef.current));
  }, []);

  const toggleSound = useCallback(() => {
    setSound((on) => {
      const next = !on;
      const ambience = engineRef.current?.ambience;
      if (ambience) void ambience.start().then(() => ambience.setEnabled(next));
      return next;
    });
  }, []);

  const total = landmarks.length || 14;

  if (error) {
    return (
      <div className={styles.root}>
        <div className={styles.overlay}>
          <div className={styles.panel}>
            <h1 className={styles.title}>Nieuw Amsterdam</h1>
            <p className={styles.lead}>{error}</p>
            <Link href="/" className={styles.play}>
              Back to Harvest
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div ref={mountRef} className={styles.mount} />

      <div className={styles.hud}>
        <div className={styles.topBar}>
          <div className={styles.badge}>
            <span className={styles.badgeTitle}>Nieuw Amsterdam</span>
            <span className={styles.badgeYear}>Anno 1660</span>
          </div>

          <div className={styles.compass} aria-hidden="true">
            <span className={styles.compassHeading} ref={compassLabelRef}>
              N
            </span>
            <div className={styles.compassTape}>
              <div className={styles.compassStrip} ref={compassStripRef}>
                {COMPASS_TAPE.map((mark, i) => (
                  <span key={`${mark}-${i}`} className={styles.compassMark}>
                    {mark}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.counter}>
            <span className={styles.counterNumber}>
              {discovered.length}
              <span className={styles.counterTotal}>/{total}</span>
            </span>
            <span className={styles.counterLabel}>plaques found</span>
          </div>
        </div>

        {phase === "playing" && <div className={styles.reticle} aria-hidden="true" />}

        {nearby && (
          <article className={styles.plaque} aria-live="polite">
            <div className={styles.plaqueHead}>
              <span className={styles.plaqueYear}>{nearby.year}</span>
              <h2 className={styles.plaqueTitle}>{nearby.title}</h2>
              {nearby.dutch && nearby.dutch !== nearby.title && (
                <span className={styles.plaqueDutch}>{nearby.dutch}</span>
              )}
            </div>
            <p className={styles.plaqueBody}>{nearby.blurb}</p>
            <p className={styles.plaqueToday}>
              <span>Today</span>
              {nearby.today}
            </p>
          </article>
        )}

        {total > 0 && discovered.length === total && (
          <div className={styles.complete}>
            All {total} plaques found. In 1664 the English sailed in and renamed it New York.
          </div>
        )}
      </div>

      {showMap && (
        <div className={styles.mapPanel}>
          <canvas ref={mapRef} className={styles.mapCanvas} style={{ width: MAP_SIZE.w, height: MAP_SIZE.h }} />
          <div className={styles.mapLabel}>Manhates · after the Castello plan</div>
        </div>
      )}

      {showJournal && (
        <div className={styles.journal}>
          <h3 className={styles.journalTitle}>Journal</h3>
          <ul className={styles.journalList}>
            {landmarks.map((landmark) => {
              const found = discovered.includes(landmark.id);
              return (
                <li key={landmark.id} className={found ? styles.journalFound : styles.journalMissing}>
                  <span>{found ? landmark.title : "· · · · · ·"}</span>
                  {found && <em>{landmark.today}</em>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className={styles.controls}>
        <button type="button" className={styles.chip} onClick={() => setHour(engineRef.current?.cycleTime() ?? hour)}>
          {hour}
        </button>
        <button type="button" className={styles.chip} onClick={toggleSound}>
          {sound ? "Sound on" : "Sound off"}
        </button>
        <button type="button" className={styles.chip} onClick={() => setShowMap((v) => !v)}>
          Map
        </button>
        <button type="button" className={styles.chip} onClick={() => setShowJournal((v) => !v)}>
          Journal
        </button>
      </div>

      <Link href="/" className={`${styles.chip} ${styles.exit}`}>
        Leave the colony
      </Link>

      {isTouch && phase !== "loading" && (
        <button
          type="button"
          className={styles.jumpButton}
          onPointerDown={() => {
            inputRef.current.jump = true;
          }}
        >
          Jump
        </button>
      )}

      {phase === "loading" && (
        <div className={styles.overlay}>
          <div className={styles.panel}>
            <h1 className={styles.title}>Nieuw Amsterdam</h1>
            <p className={styles.lead}>Raising the fort, digging the gracht, setting the palisade…</p>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      {(phase === "ready" || phase === "paused") && (
        <div className={styles.overlay}>
          <div className={styles.panel}>
            <h1 className={styles.title}>Nieuw Amsterdam</h1>
            <p className={styles.subtitle}>
              The Dutch town at the foot of Manhattan, as it stood around 1660
            </p>
            <p className={styles.lead}>
              Walk the Strand, cross the Heere Gracht, climb the fort rampart, and find all {total} plaques.
            </p>
            <div className={styles.keys}>
              <Key label="W A S D" note="walk" />
              <Key label="Mouse" note="look" />
              <Key label="Shift" note="run" />
              <Key label="Space" note="jump" />
              <Key label="T" note="time of day" />
              <Key label="M" note="map" />
              <Key label="J" note="journal" />
              <Key label="R" note="back to the gate" />
            </div>
            <button type="button" className={styles.play} onClick={enterGame}>
              {phase === "paused" ? "Resume" : "Enter the town"}
            </button>
            <p className={styles.hint}>
              Esc releases the mouse. On a phone, the left thumb walks and the right thumb looks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Key({ label, note }: { label: string; note: string }) {
  return (
    <span className={styles.key}>
      <kbd>{label}</kbd>
      <span>{note}</span>
    </span>
  );
}
