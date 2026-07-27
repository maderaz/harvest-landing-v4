// A parchment plan of the town, drawn once into an offscreen canvas from the
// same shoreline function the terrain uses, then blitted each frame with the
// player's position and the landmarks on top.

import { shoreDistance } from "./terrain";
import type { Landmark, WorldResult } from "./world";

export const MAP_BOUNDS = { minX: -112, maxX: 132, minZ: -142, maxZ: 108 };
const MAP_W = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
const MAP_D = MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ;

export function project(x: number, z: number, width: number, height: number) {
  return {
    px: ((x - MAP_BOUNDS.minX) / MAP_W) * width,
    py: ((z - MAP_BOUNDS.minZ) / MAP_D) * height,
  };
}

/** Paint the static layer: water, island, streets, roofs. */
export function buildMapBackground(
  world: Pick<WorldResult, "mapShapes" | "mapRoads">,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const theme = {
    water: "#9cb2ba",
    land: "#e9dec3",
    shore: "#7d6b4c",
    road: "#cdbc98",
    building: "#8f7c5c",
    ink: "#4a3b28",
  };

  ctx.fillStyle = theme.water;
  ctx.fillRect(0, 0, width, height);

  // Rasterise the island by sampling the shoreline field.
  const step = 2;
  ctx.fillStyle = theme.land;
  for (let py = 0; py < height; py += step) {
    for (let px = 0; px < width; px += step) {
      const x = MAP_BOUNDS.minX + (px / width) * MAP_W;
      const z = MAP_BOUNDS.minZ + (py / height) * MAP_D;
      if (shoreDistance(x, z) > 0) ctx.fillRect(px, py, step, step);
    }
  }

  // Streets.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = theme.road;
  for (const street of world.mapRoads) {
    ctx.lineWidth = Math.max(1.6, (street.width / MAP_W) * width);
    ctx.beginPath();
    street.points.forEach(([x, z], i) => {
      const p = project(x, z, width, height);
      if (i === 0) ctx.moveTo(p.px, p.py);
      else ctx.lineTo(p.px, p.py);
    });
    ctx.stroke();
  }

  // Roof footprints.
  ctx.fillStyle = theme.building;
  for (const shape of world.mapShapes) {
    const p = project(shape.x, shape.z, width, height);
    const w = (shape.w / MAP_W) * width;
    const d = (shape.d / MAP_D) * height;
    ctx.save();
    ctx.translate(p.px, p.py);
    ctx.rotate(-shape.rot);
    ctx.fillRect(-w / 2, -d / 2, Math.max(1.5, w), Math.max(1.5, d));
    ctx.restore();
  }

  // A soft edge where land meets water.
  ctx.strokeStyle = "rgba(74,59,40,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  return canvas;
}

export function drawMap(
  ctx: CanvasRenderingContext2D,
  background: HTMLCanvasElement,
  width: number,
  height: number,
  player: { x: number; z: number; yaw: number },
  landmarks: Landmark[],
  discovered: Set<string>,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(background, 0, 0, width, height);

  for (const landmark of landmarks) {
    const p = project(landmark.x, landmark.z, width, height);
    const found = discovered.has(landmark.id);
    ctx.beginPath();
    ctx.arc(p.px, p.py, found ? 3.6 : 2.6, 0, Math.PI * 2);
    ctx.fillStyle = found ? "#8a5a1e" : "rgba(90,74,52,0.42)";
    ctx.fill();
    if (found) {
      ctx.strokeStyle = "rgba(255,246,230,0.9)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  const p = project(player.x, player.z, width, height);
  ctx.save();
  ctx.translate(p.px, p.py);
  // World yaw 0 looks towards -Z, which is up on the map.
  ctx.rotate(-player.yaw);
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fillStyle = "#c2410c";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,248,238,0.95)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}
