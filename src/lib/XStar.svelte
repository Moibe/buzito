<script lang="ts">
  import { T, useTask } from '@threlte/core';

  // Pure renderer: a shiny magenta X power-up. Two perpendicular glowing bars
  // (the X — it liberates the two diagonal lines it forms) floating above its
  // tile at a FIXED random angle (so the shape shows exactly which lines it
  // will free — it does NOT spin), with a pulsing halo on the water.
  let {
    x = 0,
    z = 0,
    angle = 0,
    scale = 1,
    tileHeight = 0.4,
  }: {
    x?: number;
    z?: number;
    angle?: number;
    scale?: number;
    tileHeight?: number;
  } = $props();

  let bob = $state(0);
  let pulse = $state(0);
  let elapsed = 0;
  useTask((delta) => {
    elapsed += delta;
    bob = 0.08 * Math.sin(elapsed * 2.0);
    pulse = Math.sin(elapsed * 2.6);
  });
</script>

<T.Group position={[x, 0, z]}>
  <!-- Water halo (pulses so the X is easy to find). -->
  {@const ring = scale * (1 + 0.18 * pulse)}
  <T.Mesh position={[0, tileHeight + 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[ring, ring, ring]}>
    <T.RingGeometry args={[0.5, 0.82, 24]} />
    <T.MeshBasicMaterial color="#ff5ecb" transparent opacity={0.45} depthWrite={false} toneMapped={false} />
  </T.Mesh>

  <!-- Floating X, fixed at `angle` (two perpendicular bars along local X / Z). -->
  <T.Group position={[0, tileHeight + 0.5 + bob, 0]} rotation={[0, angle, 0]} scale={[scale, scale, scale]}>
    <T.Mesh castShadow>
      <T.BoxGeometry args={[0.95, 0.07, 0.14]} />
      <T.MeshStandardMaterial color="#ff9ae0" emissive="#ff33b8" emissiveIntensity={1.3} toneMapped={false} flatShading />
    </T.Mesh>
    <T.Mesh castShadow>
      <T.BoxGeometry args={[0.14, 0.07, 0.95]} />
      <T.MeshStandardMaterial color="#ff9ae0" emissive="#ff33b8" emissiveIntensity={1.3} toneMapped={false} flatShading />
    </T.Mesh>
    <!-- Bright core. -->
    <T.Mesh>
      <T.SphereGeometry args={[0.15, 12, 10]} />
      <T.MeshStandardMaterial color="#ffd0f2" emissive="#ff5ecb" emissiveIntensity={1.6} toneMapped={false} />
    </T.Mesh>
  </T.Group>
</T.Group>
