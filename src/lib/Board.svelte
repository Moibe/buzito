<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import {
    Color,
    CylinderGeometry,
    InstancedMesh,
    MeshStandardMaterial,
    Object3D,
  } from 'three';
  import { buildBoard } from './hex';

  let {
    centerQ = 0,
    centerR = 0,
    radius = 6,
    tileSize = 1,
    seed = 1,
  }: {
    centerQ?: number;
    centerR?: number;
    radius?: number;
    tileSize?: number;
    seed?: number;
  } = $props();

  const TILE_HEIGHT = 0.4;
  // Upper bound on simultaneous instances. The viewport-fit radius caps cell
  // count well below this in practice (~1500 at 1080p, ~2200 at 4K).
  const MAX_INSTANCES = 5000;
  const WAVE_AMP = 0.06;
  const WAVE_FREQ = 1.4;
  const WAVE_SPATIAL = 0.35;

  const cells = $derived(
    buildBoard(centerQ, centerR, radius, tileSize, seed, TILE_HEIGHT)
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

  function waveAt(x: number, z: number): number {
    return WAVE_AMP * Math.sin(elapsed * WAVE_FREQ + (x + z) * WAVE_SPATIAL);
  }

  // Per-frame: update instance matrices for the sea wave. The bounding sphere
  // must follow the instances — the board re-centers around the submarine far
  // from the origin, and a stale sphere would get the whole mesh frustum-culled.
  useTask((delta) => {
    elapsed += delta;
    const inst = instancedRef;
    if (!inst) return;

    if (inst.count !== cells.length) {
      inst.count = cells.length;
    }

    for (let i = 0; i < cells.length; i++) {
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

  // Per-instance colors. Runs only when cells change (board re-centered),
  // NOT every frame. Each cell keeps its deterministic ocean tone.
  $effect(() => {
    const inst = instancedRef;
    if (!inst) return;
    for (let i = 0; i < cells.length; i++) {
      tmpColor.set(cells[i].color);
      inst.setColorAt(i, tmpColor);
    }
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  });
</script>

<T.InstancedMesh
  bind:ref={instancedRef}
  args={[geometry, material, MAX_INSTANCES]}
  castShadow
  receiveShadow
/>
