<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    Mesh,
    MeshBasicMaterial,
  } from 'three';

  // Pure renderer: the parent owns the physics and feeds position (x, z) and
  // heading. This component only does the "being a ship in the water" part:
  // bob/roll and a foam wake that builds while moving.
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

  const baseY = $derived(tileHeight + 0.09);

  // Triangular foam wake; front edge at z=0 (mesh-local), back tip at z=1.2.
  const wakeGeometry = (() => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          -0.22, 0, 0,
          0.22, 0, 0,
          0, 0, 1.2,
        ]),
        3
      )
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
  const WAKE_LEN_AMP = 0.18;
  const WAKE_OPACITY_BASE = 0.55;
  const WAKE_OPACITY_AMP = 0.18;
  // Foam ramps in while moving and fades out when stopped.
  let wakeBuildup = 0;
  const WAKE_BUILDUP_RATE = 1.2;
  const WAKE_FADE_RATE = 2.0;

  let bobY = $state(0);
  let roll = $state(0);
  const BOB_AMP = 0.04;
  const BOB_FREQ = 1.2;
  const ROLL_AMP = 0.05;
  const ROLL_FREQ = 0.9;
  const phase = 2.0;
  let elapsed = 0;

  useTask((delta) => {
    elapsed += delta;
    bobY = BOB_AMP * Math.sin(elapsed * BOB_FREQ + phase);
    roll = ROLL_AMP * Math.sin(elapsed * ROLL_FREQ + phase + 0.6);

    if (wakeRef) {
      const rate = moving ? WAKE_BUILDUP_RATE : WAKE_FADE_RATE;
      const target = moving ? 1 : 0;
      wakeBuildup += (target - wakeBuildup) * Math.min(rate * delta, 1);
      const pulse = Math.sin(elapsed * WAKE_PULSE_FREQ + phase);
      wakeRef.scale.z = WAKE_LEN_BASE + WAKE_LEN_AMP * pulse;
      wakeMaterial.opacity =
        (WAKE_OPACITY_BASE + WAKE_OPACITY_AMP * pulse) * wakeBuildup;
    }
  });

  function handleClick(e: { stopPropagation?: () => void }) {
    e.stopPropagation?.();
    onclick?.();
  }
</script>

<T.Group
  position={[x, baseY + bobY, z]}
  rotation={[0, heading, roll]}
  scale={[scale, scale, scale]}
>
  <!-- Hull (long box, forward = -Z) -->
  <T.Mesh castShadow receiveShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.5, 0.18, 1.4]} />
    <T.MeshStandardMaterial color="#3a4a4a" flatShading />
  </T.Mesh>

  <!-- Bow (4-sided pyramid pointing forward) -->
  <T.Mesh
    position={[0, 0, -0.9]}
    rotation={[Math.PI / 2, 0, 0]}
    castShadow
    renderOrder={2}
    onclick={handleClick}
  >
    <T.ConeGeometry args={[0.25, 0.4, 4]} />
    <T.MeshStandardMaterial color="#3a4a4a" flatShading />
  </T.Mesh>

  <!-- Superstructure -->
  <T.Mesh position={[0, 0.215, 0.1]} castShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.35, 0.25, 0.5]} />
    <T.MeshStandardMaterial color="#5a6a6a" flatShading />
  </T.Mesh>

  <!-- Bridge -->
  <T.Mesh position={[0, 0.415, 0]} castShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.25, 0.15, 0.3]} />
    <T.MeshStandardMaterial color="#6a7a7a" flatShading />
  </T.Mesh>

  <!-- Mast -->
  <T.Mesh position={[0, 0.74, 0.05]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.02, 0.02, 0.5, 6]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>

  <!-- Turret -->
  <T.Mesh position={[0, 0.14, -0.35]} castShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.2, 0.1, 0.2]} />
    <T.MeshStandardMaterial color="#4a5a5a" flatShading />
  </T.Mesh>

  <!-- Cannon barrel (sticks forward over the bow) -->
  <T.Mesh position={[0, 0.16, -0.6]} rotation={[Math.PI / 2, 0, 0]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.025, 0.025, 0.4, 8]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>

  <!-- Side machine-gun mounts (the "metralletas al costado") — small barrels
       jutting out port and starboard from the superstructure. -->
  <T.Mesh position={[0.22, 0.28, 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.02, 0.02, 0.22, 6]} />
    <T.MeshStandardMaterial color="#20272a" flatShading />
  </T.Mesh>
  <T.Mesh position={[-0.22, 0.28, 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.02, 0.02, 0.22, 6]} />
    <T.MeshStandardMaterial color="#20272a" flatShading />
  </T.Mesh>

  <!-- Foam wake — opacity ramps with movement (see useTask). -->
  <T.Mesh
    bind:ref={wakeRef}
    geometry={wakeGeometry}
    material={wakeMaterial}
    position={[0, 0.05, 0.75]}
    renderOrder={1}
  />
</T.Group>
