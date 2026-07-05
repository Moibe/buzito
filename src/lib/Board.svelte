<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import {
    Color,
    CylinderGeometry,
    InstancedMesh,
    MeshStandardMaterial,
    Object3D,
  } from 'three';
  import { buildBoardIsoRect, type HexCell } from './hex';
  import { game, flipDelays } from './game.svelte';

  let {
    halfU = 18,
    halfV = 18,
    tileSize = 1,
    seed = 1,
    visited = undefined as Set<string> | undefined,
    visitedCount = 0,
    reveal = false,
  }: {
    halfU?: number;
    halfV?: number;
    tileSize?: number;
    seed?: number;
    visited?: Set<string>;
    visitedCount?: number;
    reveal?: boolean;
  } = $props();

  const TILE_HEIGHT = 0.4;
  const MAX_INSTANCES = 8000;
  const WAVE_AMP = 0.06;
  const WAVE_FREQ = 1.4;
  const WAVE_SPATIAL = 0.35;
  // Color for tiles the sub has visited.
  const VISITED_COLOR = '#b8864e';

  // --- Flip animation (a covered tile flips over "like a card" before it
  // vanishes / settles, giving the feel of turning it as you submerge) ---
  const FLIP_DURATION = 0.6; // seconds
  const FLIP_TURNS = 2; // full turns around a horizontal axis (integer → ends flat)
  const REVEAL_SINK = 0.6; // how far a revealing tile dives as it shrinks away
  const FLIP_HOP = 0.12; // little vertical dip for the no-image (recolor) flip

  const cells = $derived(
    buildBoardIsoRect(halfU, halfV, tileSize, seed, TILE_HEIGHT)
  );

  // Expose total tile count to the HUD via shared state.
  $effect(() => {
    game.totalTiles = cells.length;
  });

  const geometry = $derived(new CylinderGeometry(tileSize, tileSize, TILE_HEIGHT, 6));
  const material = new MeshStandardMaterial({ flatShading: true });

  let instancedRef = $state.raw<InstancedMesh | undefined>(undefined);

  const dummy = new Object3D();
  const tmpColor = new Color();

  let elapsed = 0;

  // Per-tile flip clock (seconds), sized to (and reset with) `cells`:
  //   Infinity     = not covered (idle),
  //   [-delay, 0)  = covered but waiting out its stagger delay (renders normal),
  //   [0, DURATION)= flipping,
  //   >= DURATION  = settled (reveal → hidden, no-image → flat visited tile).
  let flip: Float32Array | null = null;
  // Current uploaded per-tile color state: 0 = original, 1 = visited color.
  let colored: Uint8Array | null = null;
  let flipCells: HexCell[] | null = null;
  // Track reveal so we can re-flip already-covered tiles when the arena image
  // finishes loading (reveal false→true) instead of popping them to hidden.
  let lastReveal = false;

  function waveAt(x: number, z: number): number {
    return WAVE_AMP * Math.sin(elapsed * WAVE_FREQ + (x + z) * WAVE_SPATIAL);
  }

  useTask((delta) => {
    elapsed += delta;
    const inst = instancedRef;
    if (!inst) return;

    const n = Math.min(cells.length, MAX_INSTANCES);
    if (inst.count !== n) {
      inst.count = n;
    }

    // (Re)initialize per-tile state when the board rebuilds (e.g. new arena).
    // Tiles already covered at mount skip straight to "settled" (no replay), and
    // every instance's base color is uploaded here (allocates instanceColor).
    if (flipCells !== cells) {
      flipCells = cells;
      flip = new Float32Array(cells.length).fill(Infinity);
      colored = new Uint8Array(cells.length);
      lastReveal = reveal;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const vis = visited?.has(`${c.q},${c.r}`) ?? false;
        if (vis) {
          flip[i] = FLIP_DURATION;
          colored[i] = 1;
        }
        tmpColor.set(vis ? VISITED_COLOR : c.color);
        inst.setColorAt(i, tmpColor);
      }
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
    const f = flip!;
    const col = colored!;

    // Arena image just loaded (reveal false→true): re-flip tiles already covered
    // so they flip AWAY to reveal the image, rather than popping to hidden.
    if (reveal && !lastReveal) {
      for (let i = 0; i < n; i++) if (f[i] !== Infinity && f[i] >= 0) f[i] = 0;
    }
    lastReveal = reveal;

    let colorDirty = false;
    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      const key = `${cell.q},${cell.r}`;
      const isVisited = visited?.has(key) ?? false;

      // Newly covered → start (after its stagger delay, if any). A tile that LEFT
      // visited (retry / board cleared without remount) returns to idle.
      if (isVisited && f[i] === Infinity) {
        const d = flipDelays.get(key) ?? 0;
        f[i] = -d;
        if (d) flipDelays.delete(key);
      } else if (!isVisited && f[i] !== Infinity) {
        f[i] = Infinity;
      }
      // Advance through the negative delay and the flip itself.
      if (f[i] !== Infinity && f[i] < FLIP_DURATION) f[i] += delta;

      const baseY = cell.height / 2 + waveAt(cell.x, cell.z);
      let y = baseY;
      let rotX = 0;
      let s = 1;

      const fi = f[i];
      // fi === Infinity (idle) or fi < 0 (waiting) → normal, un-flipped tile.
      if (fi !== Infinity && fi >= 0) {
        const p = fi < FLIP_DURATION ? fi / FLIP_DURATION : 1;
        if (p >= 1) {
          if (reveal) s = 0; // settled: reveal → hidden
        } else {
          // Flip over a horizontal axis; integer turns so it ends flat.
          rotX = p * FLIP_TURNS * Math.PI * 2;
          if (reveal) {
            // Dive + shrink over the back half of the flip, then vanish.
            const fade = p < 0.5 ? 0 : (p - 0.5) / 0.5;
            s = 1 - fade;
            y = baseY - fade * REVEAL_SINK;
          } else {
            // Flip in place with a small dip; settles at full scale.
            y = baseY - Math.sin(p * Math.PI) * FLIP_HOP;
          }
        }
      }

      dummy.position.set(cell.x, y, cell.z);
      dummy.rotation.set(rotX, 0, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);

      // Take the visited color once the card has turned halfway over, so a
      // waiting/staggered tile keeps its original color until it actually flips.
      // Sticky once covered (|| col[i]===1): a re-flip (image load) must not flash
      // back to the water color; only an UNcovered tile (fi=Infinity) reverts.
      const want = fi !== Infinity && (fi >= FLIP_DURATION * 0.5 || col[i] === 1) ? 1 : 0;
      if (col[i] !== want) {
        tmpColor.set(want ? VISITED_COLOR : cell.color);
        inst.setColorAt(i, tmpColor);
        col[i] = want;
        colorDirty = true;
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (colorDirty && inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
  });
</script>

<T.InstancedMesh
  bind:ref={instancedRef}
  args={[geometry, material, MAX_INSTANCES]}
  castShadow
  receiveShadow
/>
