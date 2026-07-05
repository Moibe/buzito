<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three';
  import Submarine from './Submarine.svelte';

  // Small rotating 3D preview of the player's surfaced submarine, for the
  // customization screen. Contents of a <Canvas>.
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
  useTask((delta) => {
    heading += delta * 0.6; // slow turntable
  });

  let cam = $state.raw<ThreePerspectiveCamera | undefined>(undefined);
  $effect(() => {
    cam?.lookAt(0, 0.1, 0);
  });
</script>

<T.PerspectiveCamera bind:ref={cam} makeDefault position={[0, 2.3, 3.6]} fov={38} />
<T.AmbientLight intensity={0.75} />
<T.DirectionalLight position={[4, 6, 5]} intensity={1.15} castShadow />
<T.HemisphereLight args={['#ffe9c2', '#22405f', 0.5]} />

<Submarine
  {heading}
  moving={false}
  submerged={false}
  scale={1.5}
  tileHeight={0}
  {color}
  {detailColor}
  {detail}
/>
