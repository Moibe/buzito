<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import {
    BoxGeometry,
    InstancedMesh,
    MeshBasicMaterial,
    Object3D,
  } from 'three';
  import type { Tracer } from './game.svelte';

  // Renders the shared tracer pool (physics is driven by Scene). Each active
  // tracer is a short bright streak oriented along its velocity. One draw call
  // via an InstancedMesh; count tracks the number of live rounds each frame.
  let { pool }: { pool: Tracer[] } = $props();

  const MAX = 64;
  // Long along local +Z so a rotation.y aligns the streak with its heading.
  const geometry = new BoxGeometry(0.05, 0.05, 0.55);
  const material = new MeshBasicMaterial({
    color: '#ffe066',
    toneMapped: false,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  // $state.raw — three.js mutates the InstancedMesh internals every frame.
  let meshRef = $state.raw<InstancedMesh | undefined>(undefined);
  const dummy = new Object3D();

  useTask(() => {
    const inst = meshRef;
    if (!inst) return;
    let n = 0;
    for (let i = 0; i < pool.length && n < MAX; i++) {
      const t = pool[i];
      if (!t.active) continue;
      dummy.position.set(t.x, t.y, t.z);
      // local +Z under rotation.y=θ points to (sinθ, cosθ) — align with velocity.
      dummy.rotation.set(0, Math.atan2(t.vx, t.vz), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(n, dummy.matrix);
      n++;
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
  });
</script>

<T.InstancedMesh
  bind:ref={meshRef}
  args={[geometry, material, MAX]}
  frustumCulled={false}
  renderOrder={3}
/>
