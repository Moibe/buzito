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
    // rotation.y. With heading = θ the bow (local −Z) points at world
    // (−sin θ, −cos θ).
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

  const baseY = $derived(tileHeight + 0.1);

  // Bigger wake than the warship — cargo ships are wider and heavier. Front
  // edge at z=0 (mesh-local), back tip at z=1.45; positioned at z=0.95 so the
  // wake's front stays just past the hull stern and scale.z stretches only
  // the back.
  const wakeGeometry = (() => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          -0.28, 0, 0,
          0.28, 0, 0,
          0, 0, 1.45,
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
  const WAKE_PULSE_FREQ = 1.7;
  const WAKE_LEN_BASE = 1.0;
  const WAKE_LEN_AMP = 0.22;
  const WAKE_OPACITY_BASE = 0.6;
  const WAKE_OPACITY_AMP = 0.2;
  // Foam ramps in while moving and fades out when stopped.
  let wakeBuildup = 0;
  const WAKE_BUILDUP_RATE = 0.9;
  const WAKE_FADE_RATE = 2.0;

  let bobY = $state(0);
  let roll = $state(0);
  const BOB_AMP = 0.05;
  const BOB_FREQ = 0.9;
  const ROLL_AMP = 0.04;
  const ROLL_FREQ = 0.7;
  const phase = 1.1;
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
  <!-- Hull (long, wide; forward = -Z) -->
  <T.Mesh castShadow receiveShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.65, 0.2, 1.8]} />
    <T.MeshStandardMaterial color="#3a4a5a" flatShading />
  </T.Mesh>

  <!-- Bow (4-sided pyramid, blunter than warship) -->
  <T.Mesh
    position={[0, 0, -1.05]}
    rotation={[Math.PI / 2, 0, 0]}
    castShadow
    renderOrder={2}
    onclick={handleClick}
  >
    <T.ConeGeometry args={[0.3, 0.3, 4]} />
    <T.MeshStandardMaterial color="#3a4a5a" flatShading />
  </T.Mesh>

  <!-- Forward cargo hold -->
  <T.Mesh position={[0, 0.19, -0.4]} castShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.5, 0.18, 0.45]} />
    <T.MeshStandardMaterial color="#6b4a2e" flatShading />
  </T.Mesh>

  <!-- Mid cargo hold -->
  <T.Mesh position={[0, 0.19, 0.15]} castShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.5, 0.18, 0.45]} />
    <T.MeshStandardMaterial color="#6b4a2e" flatShading />
  </T.Mesh>

  <!-- Bridge / superstructure (rear) -->
  <T.Mesh position={[0, 0.2, 0.62]} castShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.45, 0.2, 0.32]} />
    <T.MeshStandardMaterial color="#6a7a7a" flatShading />
  </T.Mesh>

  <!-- Smokestack -->
  <T.Mesh position={[0, 0.5, 0.62]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.07, 0.08, 0.4, 12]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>

  <!-- Forward mast -->
  <T.Mesh position={[0, 0.4, -0.6]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.022, 0.022, 0.45, 6]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>

  <!-- Foam wake — opacity ramps with movement (see useTask). -->
  <T.Mesh
    bind:ref={wakeRef}
    geometry={wakeGeometry}
    material={wakeMaterial}
    position={[0, 0.05, 0.95]}
    renderOrder={1}
  />
</T.Group>
