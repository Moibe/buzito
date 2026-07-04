<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    Mesh,
    MeshBasicMaterial,
  } from 'three';
  import { axialToWorld } from './hex';

  let {
    q = 0,
    r = 0,
    tileSize = 1,
    tileHeight = 0.4,
    scale = 1,
    showWake = false,
    onclick,
    onAnimate,
    forwardX,
    forwardZ,
    forceForward = false,
  }: {
    q?: number;
    r?: number;
    tileSize?: number;
    tileHeight?: number;
    scale?: number;
    showWake?: boolean;
    onclick?: () => void;
    onAnimate?: (x: number, z: number, rotY: number) => void;
    forwardX?: number;
    forwardZ?: number;
    forceForward?: boolean;
  } = $props();

  // Bigger wake than the warship — cargo ships are wider and heavier, leaving
  // a more pronounced foam trail. Geometry's front edge sits at z=0 (mesh-
  // local) and back tip at z=1.45; the mesh is positioned at z=0.95 (just
  // past the hull stern at z=0.9) so the wake's front stays at world z=0.95
  // regardless of pulse animation. Animating scale.z stretches only the back,
  // never letting the wake creep into the hull when it shrinks.
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
    opacity: 0.6,
    // depthTest on so other ships occlude our foam (transparent bucket
    // renders after opaque ships regardless of renderOrder). See
    // Warship.svelte for the full rationale.
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
  });
  // Per-ship ref so we can pulse the wake every frame. Cargo wakes pulse
  // slower and a bit more amply than warships' to match their heavier feel.
  let wakeRef = $state.raw<Mesh | undefined>(undefined);
  const WAKE_PULSE_FREQ = 1.7;
  const WAKE_LEN_BASE = 1.0;
  const WAKE_LEN_AMP = 0.22;
  const WAKE_OPACITY_BASE = 0.6;
  const WAKE_OPACITY_AMP = 0.2;
  // Wake-buildup factor — see Warship.svelte. Slower than warship's because
  // a heavier merchant takes longer to churn up a visible trail.
  let wakeBuildup = 1;
  const WAKE_BUILDUP_RATE = 0.9;

  const target = $derived(axialToWorld(q, r, tileSize));
  const baseY = $derived(tileHeight + 0.10);

  // svelte-ignore state_referenced_locally
  let currentX = $state(target.x);
  // svelte-ignore state_referenced_locally
  let currentZ = $state(target.z);
  // svelte-ignore state_referenced_locally
  let currentRotY = $state(
    forwardX !== undefined && forwardZ !== undefined
      ? Math.atan2(-forwardX, -forwardZ)
      : 0
  );
  let bobY = $state(0);
  let roll = $state(0);

  // Speed unified with Warship.svelte so the convoy advances cohesively
  // (everyone in formation arrives at their next hex together). Bob/roll
  // params remain slower/heavier to keep the cargo's "ponderous" feel.
  const SPEED = 2.0;
  const ROT_LERP = 5;
  // Enderezamiento (post-arrival bow alignment) — see Warship.svelte. Cargos
  // are heavier so their settle is even slower than a warship's.
  const STRAIGHTEN_LERP = 0.8;
  const STRAIGHTEN_EPS = 0.02;
  const EPS = 0.001;
  const BOB_AMP = 0.05;
  const BOB_FREQ = 0.9;
  const ROLL_AMP = 0.04;
  const ROLL_FREQ = 0.7;
  // svelte-ignore state_referenced_locally
  const phase = q * 1.7 + r * 2.3 + 1.1;
  let elapsed = 0;

  useTask((delta) => {
    elapsed += delta;
    bobY = BOB_AMP * Math.sin(elapsed * BOB_FREQ + phase);
    roll = ROLL_AMP * Math.sin(elapsed * ROLL_FREQ + phase + 0.6);

    const dx = target.x - currentX;
    const dz = target.z - currentZ;
    const dist = Math.hypot(dx, dz);

    // Travel toward target.
    if (dist > EPS) {
      const step = Math.min(SPEED * delta, dist);
      currentX += (dx / dist) * step;
      currentZ += (dz / dist) * step;
    } else if (currentX !== target.x || currentZ !== target.z) {
      currentX = target.x;
      currentZ = target.z;
    }

    // Rotation priority: forced > motion > rest > hold (see Warship.svelte
    // for the rationale; same behavior here so the whole fleet ends every
    // move pointing the same way).
    let targetRot = currentRotY;
    const hasForward = forwardX !== undefined && forwardZ !== undefined;
    if (forceForward && hasForward) {
      targetRot = Math.atan2(-forwardX!, -forwardZ!);
    } else if (dist > EPS) {
      targetRot = Math.atan2(-dx, -dz);
    } else if (hasForward) {
      targetRot = Math.atan2(-forwardX!, -forwardZ!);
    }
    let diff = targetRot - currentRotY;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const isStraightening =
      dist <= EPS && hasForward && Math.abs(diff) > STRAIGHTEN_EPS;
    const rotLerp = isStraightening ? STRAIGHTEN_LERP : ROT_LERP;
    currentRotY += diff * Math.min(delta * rotLerp, 1);

    // Wake pulse: slower and ampler than warships' to match the cargo's
    // heavier feel. Hidden during enderezamiento (no thrust → no wake).
    if (wakeRef && showWake) {
      if (isStraightening) {
        wakeBuildup = 0;
        wakeMaterial.opacity = 0;
      } else {
        wakeBuildup += (1 - wakeBuildup) * Math.min(WAKE_BUILDUP_RATE * delta, 1);
        const pulse = Math.sin(elapsed * WAKE_PULSE_FREQ + phase);
        wakeRef.scale.z = WAKE_LEN_BASE + WAKE_LEN_AMP * pulse;
        wakeMaterial.opacity =
          (WAKE_OPACITY_BASE + WAKE_OPACITY_AMP * pulse) * wakeBuildup;
      }
    }

    onAnimate?.(currentX, currentZ, currentRotY);
  });

  function handleClick(e: { stopPropagation?: () => void }) {
    e.stopPropagation?.();
    onclick?.();
  }
</script>

<T.Group
  position={[currentX, baseY + bobY, currentZ]}
  rotation={[0, currentRotY, roll]}
  scale={[scale, scale, scale]}
>
  <!-- Hull (long, wide; forward = -Z) -->
  <T.Mesh castShadow receiveShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.65, 0.20, 1.8]} />
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
    <T.ConeGeometry args={[0.30, 0.3, 4]} />
    <T.MeshStandardMaterial color="#3a4a5a" flatShading />
  </T.Mesh>

  <!-- Forward cargo hold -->
  <T.Mesh
    position={[0, 0.19, -0.4]}
    castShadow
    renderOrder={2}
    onclick={handleClick}
  >
    <T.BoxGeometry args={[0.5, 0.18, 0.45]} />
    <T.MeshStandardMaterial color="#6b4a2e" flatShading />
  </T.Mesh>

  <!-- Mid cargo hold -->
  <T.Mesh
    position={[0, 0.19, 0.15]}
    castShadow
    renderOrder={2}
    onclick={handleClick}
  >
    <T.BoxGeometry args={[0.5, 0.18, 0.45]} />
    <T.MeshStandardMaterial color="#6b4a2e" flatShading />
  </T.Mesh>

  <!-- Bridge / superstructure (rear) -->
  <T.Mesh
    position={[0, 0.20, 0.62]}
    castShadow
    renderOrder={2}
    onclick={handleClick}
  >
    <T.BoxGeometry args={[0.45, 0.20, 0.32]} />
    <T.MeshStandardMaterial color="#6a7a7a" flatShading />
  </T.Mesh>

  <!-- Smokestack -->
  <T.Mesh position={[0, 0.50, 0.62]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.07, 0.08, 0.4, 12]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>

  <!-- Forward mast -->
  <T.Mesh position={[0, 0.4, -0.6]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.022, 0.022, 0.45, 6]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>

  <!-- Foam wake (only visible while underway during cruise). Positioned just
       past the stern (hull ends at z=0.9). Y lifted to +0.05 so the world
       height clears the wave-crest max — see Warship.svelte for the
       depthTest rationale. -->
  {#if showWake}
    <T.Mesh
      bind:ref={wakeRef}
      geometry={wakeGeometry}
      material={wakeMaterial}
      position={[0, 0.05, 0.95]}
      renderOrder={1}
    />
  {/if}
</T.Group>
