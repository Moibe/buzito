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

  // Fixed rectangular arena aligned to the iso camera's screen axes (see
  // buildBoardIsoRect). halfU/halfV are half-extents in world units along
  // screen-right / screen-depth.
  let {
    halfU = 18,
    halfV = 18,
    tileSize = 1,
    seed = 1,
  }: {
    halfU?: number;
    halfV?: number;
    tileSize?: number;
    seed?: number;
  } = $props();

  const TILE_HEIGHT = 0.4;
  // Upper bound on simultaneous instances. The viewport-fit radius yields
  // ~1600 cells at 1080p, ~2800 at 1440p and ~5700 at 4K/DPR-1 (radius 43);
  // 8000 covers up to radius ~50 with headroom. Everything that touches the
  // instance buffer clamps to this anyway — exceeding it must never write
  // past the buffer or draw garbage instances.
  const MAX_INSTANCES = 8000;
  const WAVE_AMP = 0.06;
  const WAVE_FREQ = 1.4;
  const WAVE_SPATIAL = 0.35;

  const cells = $derived(
    buildBoardIsoRect(halfU, halfV, tileSize, seed, TILE_HEIGHT)
  );

  // Shared geometry + material — one of each across all instances. This is
  // the core of the InstancedMesh win: 1 draw call instead of N. The default
  // CylinderGeometry has its first vertex at +Z, giving pointy-top orientation
  // that matches the axialToWorld pointy-top spacing.
  const geometry = $derived(new CylinderGeometry(tileSize, tileSize, TILE_HEIGHT, 6));
  const material = new MeshStandardMaterial({ flatShading: true });

  // $state.raw on three.js refs — deep $state Proxy on a three.js object
  // causes infinite reactivity loops via internal mutations.
  let instancedRef = $state.raw<InstancedMesh | undefined>(undefined);

  // Reused scratch objects so we don't allocate per-frame.
  const dummy = new Object3D();
  const tmpColor = new Color();

  let elapsed = 0;
  // Identity guard for the color pass: cells only gets a NEW array when the
  // arena dimensions change (once at mount, when Scene sizes it to the
  // viewport) — the colors are rewritten only then, not per frame.
  let lastCells: HexCell[] | null = null;

  function waveAt(x: number, z: number): number {
    return WAVE_AMP * Math.sin(elapsed * WAVE_FREQ + (x + z) * WAVE_SPATIAL);
  }

  // Per-frame: update instance matrices for the sea wave, keeping the
  // bounding sphere in sync with the instances.
  //
  // Colors are written HERE too (not in an $effect) so that when the cell
  // set changes, matrices and colors update atomically in the same frame.
  useTask((delta) => {
    elapsed += delta;
    const inst = instancedRef;
    if (!inst) return;

    // Clamp to buffer capacity: setMatrixAt/setColorAt past MAX_INSTANCES
    // silently drop writes while the renderer would still try to draw
    // inst.count instances from out-of-bounds attribute data.
    const n = Math.min(cells.length, MAX_INSTANCES);
    if (inst.count !== n) {
      inst.count = n;
    }

    if (lastCells !== cells) {
      lastCells = cells;
      for (let i = 0; i < n; i++) {
        tmpColor.set(cells[i].color);
        inst.setColorAt(i, tmpColor);
      }
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }

    for (let i = 0; i < n; i++) {
      const cell = cells[i];
      dummy.position.set(cell.x, cell.height / 2 + waveAt(cell.x, cell.z), cell.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
  });
</script>

<T.InstancedMesh
  bind:ref={instancedRef}
  args={[geometry, material, MAX_INSTANCES]}
  castShadow
  receiveShadow
/>
