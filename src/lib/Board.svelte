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
  import { game } from './game.svelte';

  let {
    halfU = 18,
    halfV = 18,
    tileSize = 1,
    seed = 1,
    visited = undefined as Set<string> | undefined,
    visitedCount = 0,
  }: {
    halfU?: number;
    halfV?: number;
    tileSize?: number;
    seed?: number;
    visited?: Set<string>;
    visitedCount?: number;
  } = $props();

  const TILE_HEIGHT = 0.4;
  const MAX_INSTANCES = 8000;
  const WAVE_AMP = 0.06;
  const WAVE_FREQ = 1.4;
  const WAVE_SPATIAL = 0.35;
  // Color for tiles the sub has visited.
  const VISITED_COLOR = '#b8864e';

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
  let lastCells: HexCell[] | null = null;
  let lastVisitedCount = -1;

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

    // Re-upload colors when the cell set or the visited set changes.
    if (lastCells !== cells || lastVisitedCount !== visitedCount) {
      lastCells = cells;
      lastVisitedCount = visitedCount;
      for (let i = 0; i < n; i++) {
        const c = cells[i];
        const isVisited = visited?.has(`${c.q},${c.r}`) ?? false;
        tmpColor.set(isVisited ? VISITED_COLOR : c.color);
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
