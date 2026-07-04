<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    Mesh,
    MeshBasicMaterial,
  } from 'three';

  // Pure renderer: the parent owns the physics (a slow, erratic roamer). This
  // component only does bob/roll and a foam wake that builds while creeping.
  // Model is the big tanker hull repurposed as a bombardment ship.
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

  const baseY = $derived(tileHeight + 0.1);

  const wakeGeometry = (() => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-0.3, 0, 0, 0.3, 0, 0, 0, 0, 1.5]), 3)
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
  const WAKE_PULSE_FREQ = 1.5;
  const WAKE_LEN_BASE = 1.0;
  const WAKE_LEN_AMP = 0.22;
  const WAKE_OPACITY_BASE = 0.55;
  const WAKE_OPACITY_AMP = 0.18;
  let wakeBuildup = 0;
  const WAKE_BUILDUP_RATE = 0.8;
  const WAKE_FADE_RATE = 2.0;

  let bobY = $state(0);
  let roll = $state(0);
  const BOB_AMP = 0.045;
  const BOB_FREQ = 0.8;
  const ROLL_AMP = 0.035;
  const ROLL_FREQ = 0.6;
  const phase = 5.2;
  let elapsed = 0;

  useTask((delta) => {
    elapsed += delta;
    bobY = BOB_AMP * Math.sin(elapsed * BOB_FREQ + phase);
    roll = ROLL_AMP * Math.sin(elapsed * ROLL_FREQ + phase + 0.5);

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
  <!-- Hull (long, wide; forward = -Z). Dark military livery. -->
  <T.Mesh castShadow receiveShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.72, 0.22, 2.0]} />
    <T.MeshStandardMaterial color="#3a4038" flatShading />
  </T.Mesh>

  <!-- Bow -->
  <T.Mesh position={[0, 0, -1.18]} rotation={[Math.PI / 2, 0, 0]} castShadow renderOrder={2} onclick={handleClick}>
    <T.ConeGeometry args={[0.34, 0.36, 4]} />
    <T.MeshStandardMaterial color="#3a4038" flatShading />
  </T.Mesh>

  <!-- Big central bomb magazine (repurposed pressure vessel). -->
  <T.Mesh position={[0, 0.31, -0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow renderOrder={2} onclick={handleClick}>
    <T.CylinderGeometry args={[0.26, 0.26, 1.3, 24]} />
    <T.MeshStandardMaterial color="#4a4a44" flatShading />
  </T.Mesh>
  <T.Mesh position={[0, 0.31, -0.7]} rotation={[-Math.PI / 2, 0, 0]} castShadow renderOrder={2}>
    <T.SphereGeometry args={[0.26, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
    <T.MeshStandardMaterial color="#4a4a44" flatShading />
  </T.Mesh>
  <T.Mesh position={[0, 0.31, 0.6]} rotation={[Math.PI / 2, 0, 0]} castShadow renderOrder={2}>
    <T.SphereGeometry args={[0.26, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
    <T.MeshStandardMaterial color="#4a4a44" flatShading />
  </T.Mesh>

  <!-- Catwalk along the spine -->
  <T.Mesh position={[0, 0.59, -0.05]} castShadow renderOrder={2}>
    <T.BoxGeometry args={[0.05, 0.03, 1.3]} />
    <T.MeshStandardMaterial color="#9a9280" flatShading />
  </T.Mesh>

  <!-- Mortar/launch tube on top (the "bomb thrower"). -->
  <T.Mesh position={[0, 0.74, -0.2]} rotation={[0.35, 0, 0]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.05, 0.06, 0.28, 10]} />
    <T.MeshStandardMaterial color="#1c1c1c" flatShading />
  </T.Mesh>

  <!-- Bridge / superstructure (rear) -->
  <T.Mesh position={[0, 0.23, 0.82]} castShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.5, 0.26, 0.32]} />
    <T.MeshStandardMaterial color="#5a6a62" flatShading />
  </T.Mesh>

  <!-- Smokestack with a red band (bomber mark). -->
  <T.Mesh position={[0, 0.58, 0.82]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.08, 0.09, 0.46, 12]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>
  <T.Mesh position={[0, 0.68, 0.82]} renderOrder={2}>
    <T.CylinderGeometry args={[0.085, 0.085, 0.1, 12]} />
    <T.MeshStandardMaterial color="#b03030" flatShading />
  </T.Mesh>

  <!-- Forward mast -->
  <T.Mesh position={[0, 0.4, -0.75]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.022, 0.022, 0.45, 6]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>

  <!-- Foam wake — opacity ramps with movement (see useTask). -->
  <T.Mesh
    bind:ref={wakeRef}
    geometry={wakeGeometry}
    material={wakeMaterial}
    position={[0, 0.05, 1.05]}
    renderOrder={1}
  />
</T.Group>
