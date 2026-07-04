<script lang="ts">
  import { T, useTask } from '@threlte/core';

  // Pure renderer: a shiny golden asterisk power-up. Four glowing crossed bars
  // (the * — its 8 rays are the horizontal, vertical and two diagonal lines it
  // liberates), floating and slowly spinning above its tile, with a pulsing
  // halo on the water so it's easy to spot.
  let {
    x = 0,
    z = 0,
    scale = 1,
    tileHeight = 0.4,
  }: {
    x?: number;
    z?: number;
    scale?: number;
    tileHeight?: number;
  } = $props();

  let spin = $state(0);
  let bob = $state(0);
  let pulse = $state(0);
  let elapsed = 0;
  useTask((delta) => {
    elapsed += delta;
    spin = elapsed * 1.1;
    bob = 0.08 * Math.sin(elapsed * 2.0);
    pulse = Math.sin(elapsed * 2.6);
  });

  // Four bars → the asterisk (horizontal, vertical, both diagonals).
  const BARS = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4];
</script>

<T.Group position={[x, 0, z]}>
  <!-- Water halo (pulses so the star is easy to find). -->
  {@const ring = scale * (1 + 0.18 * pulse)}
  <T.Mesh position={[0, tileHeight + 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[ring, ring, ring]}>
    <T.RingGeometry args={[0.5, 0.82, 24]} />
    <T.MeshBasicMaterial color="#ffd54a" transparent opacity={0.45} depthWrite={false} toneMapped={false} />
  </T.Mesh>

  <!-- Floating, slowly spinning asterisk. -->
  <T.Group position={[0, tileHeight + 0.5 + bob, 0]} rotation={[0, spin, 0]} scale={[scale, scale, scale]}>
    {#each BARS as a}
      <T.Mesh rotation={[0, a, 0]} castShadow>
        <T.BoxGeometry args={[0.95, 0.07, 0.14]} />
        <T.MeshStandardMaterial
          color="#ffe680"
          emissive="#ffcf33"
          emissiveIntensity={1.3}
          toneMapped={false}
          flatShading
        />
      </T.Mesh>
    {/each}
    <!-- Bright core. -->
    <T.Mesh>
      <T.SphereGeometry args={[0.15, 12, 10]} />
      <T.MeshStandardMaterial
        color="#fff3b0"
        emissive="#ffd54a"
        emissiveIntensity={1.6}
        toneMapped={false}
      />
    </T.Mesh>
  </T.Group>
</T.Group>
