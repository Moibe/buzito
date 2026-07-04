<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, DoubleSide } from 'three';

  // Pure renderer: a small mine-laying trawler. Compact drab hull, a forward
  // wheelhouse and a stern rack cradling spare mines. Parent owns the physics.
  let {
    x = 0,
    z = 0,
    heading = 0,
    moving = false,
    scale = 1,
    tileHeight = 0.4,
    onclick,
  }: {
    x?: number;
    z?: number;
    heading?: number;
    moving?: boolean;
    scale?: number;
    tileHeight?: number;
    onclick?: () => void;
  } = $props();

  const baseY = $derived(tileHeight + 0.08);

  let bobY = $state(0);
  let roll = $state(0);
  const BOB_AMP = 0.03;
  const BOB_FREQ = 1.25;
  const ROLL_AMP = 0.03;
  const ROLL_FREQ = 0.9;
  const phase = 1.7;
  let elapsed = 0;

  // Foam wake, driven by movement.
  const wakeGeometry = (() => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-0.18, 0, 0, 0.18, 0, 0, 0, 0, 0.85]), 3)
    );
    return geo;
  })();
  const wakeMaterial = new MeshBasicMaterial({
    color: '#e8eef2',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
  });
  let wakeRef = $state.raw<Mesh | undefined>(undefined);
  const WAKE_PULSE_FREQ = 2.4;
  const WAKE_LEN_BASE = 1.0;
  const WAKE_LEN_AMP = 0.16;
  const WAKE_OPACITY_BASE = 0.45;
  const WAKE_OPACITY_AMP = 0.16;
  let wakeBuildup = 0;
  const WAKE_BUILDUP_RATE = 1.2;
  const WAKE_FADE_RATE = 2.0;

  useTask((delta) => {
    elapsed += delta;
    bobY = BOB_AMP * Math.sin(elapsed * BOB_FREQ + phase);
    roll = ROLL_AMP * Math.sin(elapsed * ROLL_FREQ + phase + 0.3);

    if (wakeRef) {
      const rate = moving ? WAKE_BUILDUP_RATE : WAKE_FADE_RATE;
      const target = moving ? 1 : 0;
      wakeBuildup += (target - wakeBuildup) * Math.min(rate * delta, 1);
      const pulse = Math.sin(elapsed * WAKE_PULSE_FREQ + phase);
      wakeRef.scale.z = WAKE_LEN_BASE + WAKE_LEN_AMP * pulse;
      wakeMaterial.opacity = (WAKE_OPACITY_BASE + WAKE_OPACITY_AMP * pulse) * wakeBuildup;
    }
  });

  function handleClick(e: { stopPropagation?: () => void }) {
    e.stopPropagation?.();
    onclick?.();
  }
</script>

<T.Group position={[x, baseY + bobY, z]} rotation={[0, heading, roll]} scale={[scale, scale, scale]}>
  <!-- Hull -->
  <T.Mesh scale={[0.42, 0.16, 1.1]} castShadow receiveShadow onclick={handleClick}>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial color="#5c5238" flatShading />
  </T.Mesh>
  <!-- Bow wedge (bow = -Z) -->
  <T.Mesh position={[0, 0, -0.72]} rotation={[Math.PI / 2, 0, 0]} castShadow onclick={handleClick}>
    <T.CylinderGeometry args={[0.21, 0.21, 0.28, 3]} />
    <T.MeshStandardMaterial color="#5c5238" flatShading />
  </T.Mesh>
  <!-- Wheelhouse (forward) -->
  <T.Mesh position={[0, 0.16, -0.16]} scale={[0.28, 0.2, 0.34]} castShadow onclick={handleClick}>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial color="#8a7f5e" flatShading />
  </T.Mesh>
  <!-- Stern mine rack + two spare mines -->
  <T.Mesh position={[0, 0.1, 0.52]} scale={[0.34, 0.06, 0.2]} castShadow>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial color="#3a3428" flatShading />
  </T.Mesh>
  {#each [-0.09, 0.09] as ox}
    <T.Mesh position={[ox, 0.17, 0.52]} castShadow>
      <T.SphereGeometry args={[0.09, 10, 8]} />
      <T.MeshStandardMaterial color="#20242a" flatShading />
    </T.Mesh>
  {/each}

  <!-- Wake -->
  <T.Mesh
    bind:ref={wakeRef}
    geometry={wakeGeometry}
    material={wakeMaterial}
    position={[0, 0.05, 0.9]}
    renderOrder={1}
  />
</T.Group>
