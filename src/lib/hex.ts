export type Axial = { q: number; r: number };

export type HexCell = {
  q: number;
  r: number;
  x: number;
  z: number;
  height: number;
  color: string;
};

const SQRT3 = Math.sqrt(3);

// Pointy-top hex layout: each hex has pointy vertices at +Z/-Z (top/bottom in
// world XZ) and flat edges at left/right. In iso NE view this projects to
// vertices at upper-right/lower-left on screen and flat sides at upper-left/
// lower-right diagonals. The Board's CylinderGeometry default (first vertex
// on +Z) matches this layout so adjacent flat-sides meet without gaps.
export function axialToWorld(q: number, r: number, size = 1): { x: number; z: number } {
  return {
    x: size * SQRT3 * (q + r / 2),
    z: size * 1.5 * r,
  };
}

export function worldToAxial(x: number, z: number, size = 1): Axial {
  return {
    q: (x / SQRT3 - z / 3) / size,
    r: (z / 1.5) / size,
  };
}

export function axialRound(q: number, r: number): Axial {
  // Standard cube-coord rounding to find the nearest hex
  const x = q;
  const zCube = r;
  const y = -x - zCube;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(zCube);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - zCube);
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

// Multi-tone ocean palette. Each hex picks a tone via the deterministic
// hash below, so the sea has gentle color variation that stays put as the
// board re-centers around the submarine.
const PALETTE = [
  '#0a3d62', // deep ocean
  '#1e5f8a', // deep blue
  '#2b6cb0', // mid blue
  '#3b82c4', // ocean blue
  '#5ba3d0', // soft blue
];

// Deterministic hash from (q, r, seed) → [0, 1). Same coords always yield the same
// value, so hex color stays stable as the board re-centers across an infinite world.
function hash2D(q: number, r: number, seed: number): number {
  let h = seed | 0;
  h = Math.imul(h ^ (q | 0), 0x85ebca6b);
  h = Math.imul(h ^ (r | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function buildBoard(
  centerQ: number,
  centerR: number,
  radius: number,
  size = 1,
  seed = 1,
  tileHeight = 0.4
): HexCell[] {
  const cells: HexCell[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const dr1 = Math.max(-radius, -dq - radius);
    const dr2 = Math.min(radius, -dq + radius);
    for (let dr = dr1; dr <= dr2; dr++) {
      const q = centerQ + dq;
      const r = centerR + dr;
      const { x, z } = axialToWorld(q, r, size);
      const colorIdx = Math.floor(hash2D(q, r, seed) * PALETTE.length);
      cells.push({ q, r, x, z, height: tileHeight, color: PALETTE[colorIdx] });
    }
  }
  return cells;
}

// Hex cells covering a SCREEN-ALIGNED rectangle under the fixed yaw-45° iso
// camera. Because the camera looks along the world diagonal, a rectangle
// that reads as "the screen" on the ground plane is rotated 45° in world XZ.
// u/v are the camera's ground axes: u = (x − z)/√2 (screen right),
// v = (x + z)/√2 (screen depth). Cells whose CENTER falls inside the given
// half-extents are included, so the outermost row bleeds ~1 tile past the
// limits. Extents are the FIXED arena half-extents (ARENA_HALF_U/V in
// Scene.svelte); the sea reaching the screen edge is handled by the
// zoom-to-fit that frames this fixed rect to the viewport, not by sizing
// the extents to the window.
export function buildBoardIsoRect(
  halfU: number,
  halfV: number,
  size = 1,
  seed = 1,
  tileHeight = 0.4
): HexCell[] {
  const cells: HexCell[] = [];
  // Axis-aligned world bounds of the rotated rect: |x|, |z| ≤ (halfU+halfV)/√2.
  const worldBound = (halfU + halfV) * Math.SQRT1_2;
  const rMax = Math.ceil(worldBound / (1.5 * size));
  for (let r = -rMax; r <= rMax; r++) {
    const qMin = Math.ceil(-worldBound / (SQRT3 * size) - r / 2);
    const qMax = Math.floor(worldBound / (SQRT3 * size) - r / 2);
    for (let q = qMin; q <= qMax; q++) {
      const { x, z } = axialToWorld(q, r, size);
      const u = (x - z) * Math.SQRT1_2;
      const v = (x + z) * Math.SQRT1_2;
      if (Math.abs(u) > halfU || Math.abs(v) > halfV) continue;
      const colorIdx = Math.floor(hash2D(q, r, seed) * PALETTE.length);
      cells.push({ q, r, x, z, height: tileHeight, color: PALETTE[colorIdx] });
    }
  }
  return cells;
}
