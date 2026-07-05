<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three';

  // A tiny 3D hex tile (like the board's cells) that spins slowly and forever —
  // the HUD progress icon. Contents of a <Canvas>; the canvas is transparent so
  // it blends into the HUD.
  let spin = $state(0);
  useTask((delta) => {
    spin += delta * 0.9; // slow continuous rotation
  });

  let cam = $state.raw<ThreePerspectiveCamera | undefined>(undefined);
  // Look slightly down at the tile so its thickness (the 3D) is visible.
  $effect(() => {
    cam?.lookAt(0, 0, 0);
  });
</script>

<T.PerspectiveCamera bind:ref={cam} makeDefault position={[0, 1.15, 1.5]} fov={34} />
<T.AmbientLight intensity={0.9} />
<T.DirectionalLight position={[2, 3, 2.5]} intensity={1.4} />

<!-- Pointy-top hex prism: 6 radial segments, with visible thickness. -->
<T.Mesh rotation={[0, spin, 0]} castShadow={false}>
  <T.CylinderGeometry args={[0.62, 0.62, 0.28, 6]} />
  <T.MeshStandardMaterial color="#3d9ad6" flatShading metalness={0.15} roughness={0.55} />
</T.Mesh>
