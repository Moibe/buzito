<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { InstancedMesh, Object3D, SphereGeometry, MeshBasicMaterial } from 'three';
  import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three';
  import Submarine from './Submarine.svelte';

  // Cinematic hero for the intro screen: the sub gently cruises + sways with a
  // wake, over a field of rising ambient bubbles. Contents of a <Canvas>.
  let {
    color = '#2a2e30',
    detailColor = '#ffcf33',
    detail = 'stripes',
  }: {
    color?: string;
    detailColor?: string;
    detail?: string;
  } = $props();

  let heading = $state(0);
  let elapsed = 0;

  let cam = $state.raw<ThreePerspectiveCamera | undefined>(undefined);
  $effect(() => {
    cam?.lookAt(0, 0.05, 0);
  });

  // Ambient rising bubbles filling the frame.
  const N = 48;
  const RX = 3.2;
  const RZ = 2.2;
  const Y_BOTTOM = -1.6;
  const Y_TOP = 2.6;
  type B = { x: number; z: number; y: number; s: number; v: number };
  const bubs: B[] = [];
  for (let i = 0; i < N; i++) {
    bubs.push({
      x: (Math.random() - 0.5) * 2 * RX,
      z: (Math.random() - 0.5) * 2 * RZ,
      y: Y_BOTTOM + Math.random() * (Y_TOP - Y_BOTTOM),
      s: 0.03 + Math.random() * 0.06,
      v: 0.25 + Math.random() * 0.4,
    });
  }
  const bubGeo = new SphereGeometry(1, 8, 6);
  const bubMat = new MeshBasicMaterial({ color: '#bfe4f5', transparent: true, opacity: 0.35, depthWrite: false });
  let bubRef = $state.raw<InstancedMesh | undefined>(undefined);
  const dummy = new Object3D();

  useTask((delta) => {
    elapsed += delta;
    heading = -0.55 + Math.sin(elapsed * 0.4) * 0.6; // gentle turntable sway

    if (bubRef) {
      for (let i = 0; i < N; i++) {
        const b = bubs[i];
        b.y += b.v * delta;
        b.x += Math.sin(elapsed * 0.8 + i) * 0.0015; // slight wobble
        if (b.y > Y_TOP) {
          b.y = Y_BOTTOM;
          b.x = (Math.random() - 0.5) * 2 * RX;
          b.z = (Math.random() - 0.5) * 2 * RZ;
        }
        dummy.position.set(b.x, b.y, b.z);
        dummy.scale.setScalar(b.s);
        dummy.updateMatrix();
        bubRef.setMatrixAt(i, dummy.matrix);
      }
      bubRef.instanceMatrix.needsUpdate = true;
    }
  });
</script>

<T.PerspectiveCamera bind:ref={cam} makeDefault position={[2.6, 1.7, 3.6]} fov={40} />
<T.AmbientLight intensity={0.75} />
<T.DirectionalLight position={[4, 6, 5]} intensity={1.2} castShadow />
<T.HemisphereLight args={['#ffe9c2', '#1e4a6e', 0.55]} />

<!-- Ambient bubbles behind/around the sub. -->
<T.InstancedMesh args={[bubGeo, bubMat, N]} bind:ref={bubRef} />

<Submarine {heading} moving={true} submerged={false} scale={1.6} tileHeight={0} {color} {detailColor} {detail} />
