<script lang="ts">
  import { T } from '@threlte/core';

  // A rectangular border that frames the play area. The rectangle lives in
  // the iso camera's ground frame (u = screen right, v = screen depth) just
  // like the board, so on screen it reads as a clean rectangle even though
  // in world XZ it's rotated 45°. World mapping: x = (u+v)/√2, z = (v−u)/√2.
  let {
    halfU = 20,
    halfV = 20,
    thickness = 0.4,
    height = 0.5,
    y = 0.4,
    color = '#cfe0ec',
  }: {
    halfU?: number;
    halfV?: number;
    thickness?: number;
    height?: number;
    y?: number;
    color?: string;
  } = $props();

  const S = Math.SQRT1_2;

  // Two edges run along v (at u = ±halfU), two along u (at v = ±halfV). Each
  // edge is one box; lengths overrun by `thickness` so the corners overlap.
  const lenAlongV = $derived(2 * halfV + thickness); // for the u = ±halfU edges
  const lenAlongU = $derived(2 * halfU + thickness); // for the v = ±halfV edges

  // Edge midpoints in world. A v-running edge at u=±halfU sits at
  // (±halfU·S, y, ∓halfU·S); a u-running edge at v=±halfV sits at
  // (±halfV·S, y, ±halfV·S).
  const uEdges = $derived<Array<[number, number, number]>>([
    [halfU * S, y, -halfU * S],
    [-halfU * S, y, halfU * S],
  ]);
  const vEdges = $derived<Array<[number, number, number]>>([
    [halfV * S, y, halfV * S],
    [-halfV * S, y, -halfV * S],
  ]);
  // rotation.y that aligns a box's local +Z with each edge's direction:
  // v-running edges point along (1,1)/√2 → π/4; u-running along (1,−1)/√2 → 3π/4.
  const U_ROT = Math.PI / 4;
  const V_ROT = (3 * Math.PI) / 4;
</script>

{#each uEdges as pos}
  <T.Mesh position={pos} rotation={[0, U_ROT, 0]} castShadow receiveShadow>
    <T.BoxGeometry args={[thickness, height, lenAlongV]} />
    <T.MeshStandardMaterial {color} flatShading />
  </T.Mesh>
{/each}

{#each vEdges as pos}
  <T.Mesh position={pos} rotation={[0, V_ROT, 0]} castShadow receiveShadow>
    <T.BoxGeometry args={[thickness, height, lenAlongU]} />
    <T.MeshStandardMaterial {color} flatShading />
  </T.Mesh>
{/each}
