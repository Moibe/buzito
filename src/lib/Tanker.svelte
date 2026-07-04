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

  // Tankers are the largest convoy member. Hull spans z=-1.0..1.0; wake's
  // front edge lives at mesh-local z=0 and the mesh sits at world z=1.05 so
  // pulse-driven scale.z stretches only the back tip and never overlaps the
  // hull on shrink phases.
  const wakeGeometry = (() => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          -0.32, 0, 0,
          0.32, 0, 0,
          0, 0, 1.6,
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
    // depthTest on so foam gets clipped behind any opaque hull in front
    // (see Warship.svelte for the rationale).
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
  });
  let wakeRef = $state.raw<Mesh | undefined>(undefined);
  const WAKE_PULSE_FREQ = 1.5;
  const WAKE_LEN_BASE = 1.0;
  const WAKE_LEN_AMP = 0.24;
  const WAKE_OPACITY_BASE = 0.6;
  const WAKE_OPACITY_AMP = 0.22;
  // Wake-buildup factor — see Warship.svelte. Slowest in the fleet: a fully
  // laden tanker takes the longest to churn up a visible foam trail.
  let wakeBuildup = 1;
  const WAKE_BUILDUP_RATE = 0.7;

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

  const SPEED = 2.0;
  const ROT_LERP = 4; // even heavier than cargo — full rolling tanks of fuel
  // Enderezamiento (post-arrival alignment) — slowest in the fleet to match
  // the tanker's mass and sloshing payload. See Warship.svelte for context.
  const STRAIGHTEN_LERP = 0.6;
  const STRAIGHTEN_EPS = 0.02;
  const EPS = 0.001;
  const BOB_AMP = 0.05;
  const BOB_FREQ = 0.8;
  const ROLL_AMP = 0.035;
  const ROLL_FREQ = 0.6;
  // svelte-ignore state_referenced_locally
  const phase = q * 1.7 + r * 2.3 + 2.2;
  let elapsed = 0;

  useTask((delta) => {
    elapsed += delta;
    bobY = BOB_AMP * Math.sin(elapsed * BOB_FREQ + phase);
    roll = ROLL_AMP * Math.sin(elapsed * ROLL_FREQ + phase + 0.6);

    const dx = target.x - currentX;
    const dz = target.z - currentZ;
    const dist = Math.hypot(dx, dz);

    if (dist > EPS) {
      const step = Math.min(SPEED * delta, dist);
      currentX += (dx / dist) * step;
      currentZ += (dz / dist) * step;
    } else if (currentX !== target.x || currentZ !== target.z) {
      currentX = target.x;
      currentZ = target.z;
    }

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
  <!-- Hull (longer + wider than a cargo). Rust-red livery distinguishes the
       tanker silhouette from the standard merchant grey. -->
  <T.Mesh castShadow receiveShadow renderOrder={2} onclick={handleClick}>
    <T.BoxGeometry args={[0.72, 0.22, 2.0]} />
    <T.MeshStandardMaterial color="#7a3a2a" flatShading />
  </T.Mesh>

  <!-- Bow (blunter still — tankers prioritize volume over speed) -->
  <T.Mesh
    position={[0, 0, -1.18]}
    rotation={[Math.PI / 2, 0, 0]}
    castShadow
    renderOrder={2}
    onclick={handleClick}
  >
    <T.ConeGeometry args={[0.34, 0.36, 4]} />
    <T.MeshStandardMaterial color="#7a3a2a" flatShading />
  </T.Mesh>

  <!-- Big continuous pressure vessel dominating the deck. One long horizontal
       cylinder (forward = -Z, so we rotate around X to lay it along Z). The
       large diameter + curved profile reads instantly as "liquid container"
       compared to the boxy holds of a normal cargo. -->
  <T.Mesh
    position={[0, 0.31, -0.05]}
    rotation={[Math.PI / 2, 0, 0]}
    castShadow
    renderOrder={2}
    onclick={handleClick}
  >
    <T.CylinderGeometry args={[0.26, 0.26, 1.3, 24]} />
    <T.MeshStandardMaterial color="#5a5a5a" flatShading />
  </T.Mesh>

  <!-- Hemispherical end domes — rounded caps on the front and rear of the
       tank give it a real pressure-vessel silhouette and reinforce the sense
       of pressurized liquid inside. -->
  <T.Mesh
    position={[0, 0.31, -0.7]}
    rotation={[-Math.PI / 2, 0, 0]}
    castShadow
    renderOrder={2}
  >
    <T.SphereGeometry args={[0.26, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
    <T.MeshStandardMaterial color="#5a5a5a" flatShading />
  </T.Mesh>
  <T.Mesh
    position={[0, 0.31, 0.6]}
    rotation={[Math.PI / 2, 0, 0]}
    castShadow
    renderOrder={2}
  >
    <T.SphereGeometry args={[0.26, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
    <T.MeshStandardMaterial color="#5a5a5a" flatShading />
  </T.Mesh>

  <!-- Catwalk along the spine of the tank -->
  <T.Mesh position={[0, 0.59, -0.05]} castShadow renderOrder={2}>
    <T.BoxGeometry args={[0.05, 0.03, 1.3]} />
    <T.MeshStandardMaterial color="#bbb39a" flatShading />
  </T.Mesh>

  <!-- Pressure-relief vent on top — sits above the catwalk so the silhouette
       reads as a pressurized vessel, not a generic deck cargo. -->
  <T.Mesh position={[0, 0.72, -0.2]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.04, 0.04, 0.20, 10]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>

  <!-- Bridge / superstructure (rear, behind the tank) -->
  <T.Mesh
    position={[0, 0.23, 0.82]}
    castShadow
    renderOrder={2}
    onclick={handleClick}
  >
    <T.BoxGeometry args={[0.5, 0.26, 0.32]} />
    <T.MeshStandardMaterial color="#6a7a7a" flatShading />
  </T.Mesh>

  <!-- Smokestack (taller, with a yellow band — common merchant tanker mark) -->
  <T.Mesh position={[0, 0.58, 0.82]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.08, 0.09, 0.46, 12]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>
  <T.Mesh position={[0, 0.68, 0.82]} renderOrder={2}>
    <T.CylinderGeometry args={[0.085, 0.085, 0.10, 12]} />
    <T.MeshStandardMaterial color="#d4a017" flatShading />
  </T.Mesh>

  <!-- Forward mast -->
  <T.Mesh position={[0, 0.4, -0.75]} castShadow renderOrder={2}>
    <T.CylinderGeometry args={[0.022, 0.022, 0.45, 6]} />
    <T.MeshStandardMaterial color="#2a2a2a" flatShading />
  </T.Mesh>

  <!-- Foam wake — Y lifted to +0.05 so depthTest doesn't let wave crests
       occlude the foam (see Warship.svelte for full rationale). -->
  {#if showWake}
    <T.Mesh
      bind:ref={wakeRef}
      geometry={wakeGeometry}
      material={wakeMaterial}
      position={[0, 0.05, 1.05]}
      renderOrder={1}
    />
  {/if}
</T.Group>
