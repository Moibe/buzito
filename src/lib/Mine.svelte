<script lang="ts">
  import { T } from '@threlte/core';

  // Pure renderer: a floating naval contact mine — a dark spiky ball. Placed
  // by Scene at a world (x, z); it just sits there and threatens any depth.
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

  // Sits at the surface: half above, half below the waterline.
  const y = $derived(tileHeight + 0.12);

  const BODY_R = 0.22;
  // Five horns: up + the four cardinal sides (bottom stays under the hull).
  const SPIKES: { pos: [number, number, number]; rot: [number, number, number] }[] = [
    { pos: [0, BODY_R, 0], rot: [0, 0, 0] }, // up
    { pos: [BODY_R, 0, 0], rot: [0, 0, -Math.PI / 2] }, // +x
    { pos: [-BODY_R, 0, 0], rot: [0, 0, Math.PI / 2] }, // -x
    { pos: [0, 0, BODY_R], rot: [Math.PI / 2, 0, 0] }, // +z
    { pos: [0, 0, -BODY_R], rot: [-Math.PI / 2, 0, 0] }, // -z
  ];
</script>

<T.Group position={[x, y, z]} scale={[scale, scale, scale]}>
  <!-- Body -->
  <T.Mesh castShadow receiveShadow>
    <T.SphereGeometry args={[BODY_R, 16, 12]} />
    <T.MeshStandardMaterial color="#20242a" flatShading />
  </T.Mesh>
  <!-- Horns (contact detonators) -->
  {#each SPIKES as s}
    <T.Mesh position={s.pos} rotation={s.rot} castShadow>
      <T.ConeGeometry args={[0.05, 0.16, 6]} />
      <T.MeshStandardMaterial color="#c23a2a" flatShading />
    </T.Mesh>
  {/each}
</T.Group>
