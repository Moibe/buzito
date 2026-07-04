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
    // The ship's "resting" forward direction in world coords. When the ship
    // isn't moving (and forceForward=false), the bow settles to face this so
    // the whole fleet ends every move pointing the same way.
    forwardX?: number;
    forwardZ?: number;
    // When true, forwardX/Z OVERRIDES motion-based rotation — the bow always
    // faces forward even while drifting backward. Used for ships that lost
    // tether in cruise mode (visual: ship adrift facing the convoy direction).
    forceForward?: boolean;
  } = $props();

  // Triangular foam wake. Geometry's front edge is at z=0 (mesh-local) and
  // the back tip at z=1.2; the mesh is positioned at z=0.75 (just past the
  // hull stern) so the wake's front sits at world z=0.75 regardless of the
  // pulse animation. Animating scale.z stretches only the back, never letting
  // the wake creep into the hull when it shrinks.
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
    opacity: 0.55,
    // depthWrite stays off so foam doesn't poison the depth buffer for
    // later transparent passes. depthTest is ON so the wake gets correctly
    // OCCLUDED by any opaque ship hull in front of it — without this, a
    // teammate's foam would draw over our own ship since the transparent
    // bucket renders after opaque regardless of renderOrder. The wake may
    // briefly clip behind wave crests, but the amplitude is small enough
    // that it reads as "foam dipping into a wave" rather than a bug.
    depthWrite: false,
    depthTest: true,
    // Visible from both sides so vertex winding is irrelevant.
    side: DoubleSide,
  });
  // Per-ship ref so we can pulse the wake (length + opacity) every frame to
  // sell active foam churn. $state.raw because we mutate the underlying
  // three.js mesh's scale/material directly — deep $state would loop.
  let wakeRef = $state.raw<Mesh | undefined>(undefined);
  const WAKE_PULSE_FREQ = 2.4;
  const WAKE_LEN_BASE = 1.0;
  const WAKE_LEN_AMP = 0.18;
  const WAKE_OPACITY_BASE = 0.55;
  const WAKE_OPACITY_AMP = 0.18;
  // Wake-buildup factor: 0 while the ship is parked/straightening, lerps up
  // to 1 once it starts moving again. Multiplied into the wake's pulse-driven
  // opacity so the foam fades IN gradually after every move (sells the
  // impression of water being churned up by re-engaging propellers). The
  // fade-out is still instant — a stopped ship has no foam to linger behind.
  let wakeBuildup = 1;
  const WAKE_BUILDUP_RATE = 1.2; // ~0.6 sec to reach ~50%, ~1.5 sec to ~85%

  // Target world position derived from the current (q, r) prop. Whenever the
  // user clicks a new destination, this updates and the animation chases it.
  const target = $derived(axialToWorld(q, r, tileSize));
  const baseY = $derived(tileHeight + 0.09);

  // Animated state. Initialized to the spawn position so the first render
  // doesn't slide in from the origin. We deliberately read target ONCE here.
  // svelte-ignore state_referenced_locally
  let currentX = $state(target.x);
  // svelte-ignore state_referenced_locally
  let currentZ = $state(target.z);
  // Initial bow direction = the resting forward (if provided) so the ship
  // spawns already pointing the right way and doesn't snap-rotate on first
  // frame. Falls back to -Z (default) when no forward direction was given.
  // svelte-ignore state_referenced_locally
  let currentRotY = $state(
    forwardX !== undefined && forwardZ !== undefined
      ? Math.atan2(-forwardX, -forwardZ)
      : 0
  );
  // Sea bobbing (vertical) and rolling (z-axis tilt). Updated per frame.
  let bobY = $state(0);
  let roll = $state(0);

  // Unified across Warship + Cargo so all convoy members start, travel, and
  // arrive together — gives a cohesive "everyone advances at once" feel
  // instead of warships finishing while cargos are still in motion.
  const SPEED = 2.0; // world units per second
  const ROT_LERP = 8; // larger = snappier turn while traveling
  // "Enderezamiento": once the ship has reached its destination hex, the bow
  // settles back to the convoy heading. That settle uses a much slower lerp
  // — the ship has no forward momentum, so a snappy turn looks artificial,
  // and the wake is forced off (no water to push) until alignment finishes.
  const STRAIGHTEN_LERP = 1.0;
  const STRAIGHTEN_EPS = 0.02; // ~1.1° — bow considered aligned within this
  const EPS = 0.001;
  // Sea motion: gentle bob + slight roll, with a unique phase per ship so the
  // fleet doesn't oscillate in lockstep.
  const BOB_AMP = 0.04;
  const BOB_FREQ = 1.2;
  const ROLL_AMP = 0.05;
  const ROLL_FREQ = 0.9;
  // svelte-ignore state_referenced_locally
  const phase = q * 1.7 + r * 2.3;
  let elapsed = 0;

  useTask((delta) => {
    elapsed += delta;
    bobY = BOB_AMP * Math.sin(elapsed * BOB_FREQ + phase);
    roll = ROLL_AMP * Math.sin(elapsed * ROLL_FREQ + phase + 0.6);

    const dx = target.x - currentX;
    const dz = target.z - currentZ;
    const dist = Math.hypot(dx, dz);

    // Position toward target (clamped to not overshoot).
    if (dist > EPS) {
      const step = Math.min(SPEED * delta, dist);
      currentX += (dx / dist) * step;
      currentZ += (dz / dist) * step;
    } else if (currentX !== target.x || currentZ !== target.z) {
      currentX = target.x;
      currentZ = target.z;
    }

    // Rotation target priority:
    //  1. forceForward + forward provided  → always face forward (sueltos)
    //  2. moving (dist > EPS)              → face direction of motion
    //  3. forward provided                 → settle to forward at rest (so
    //                                        every ship ends every move
    //                                        pointing the same way as the
    //                                        rest of the fleet)
    //  4. neither                          → hold current rotation
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
    // Detect enderezamiento: ship is parked but its bow hasn't yet swung back
    // to the convoy forward. While in this phase, use the slow lerp.
    const isStraightening =
      dist <= EPS && hasForward && Math.abs(diff) > STRAIGHTEN_EPS;
    const rotLerp = isStraightening ? STRAIGHTEN_LERP : ROT_LERP;
    currentRotY += diff * Math.min(delta * rotLerp, 1);

    // Animate the wake when visible: pulse length + opacity in a sine wave so
    // the foam looks alive instead of being a static decal. Per-ship phase
    // means the fleet doesn't all pulse in lockstep. While straightening,
    // force opacity to 0 — the ship isn't actually pushing water during the
    // re-alignment, so the wake should vanish.
    if (wakeRef && showWake) {
      if (isStraightening) {
        // Disappear immediately when the ship parks (no thrust = no foam).
        wakeBuildup = 0;
        wakeMaterial.opacity = 0;
      } else {
        // Lerp buildup toward full while moving — gives a perceptible
        // build-up phase right after departure / right after enderezamiento.
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

  <!-- Foam wake (only visible when ship is auto-moving with the convoy).
       Positioned just past the stern (hull ends at z=0.7). Y lifted to +0.05
       (was -0.10) so the wake's world height stays above the hex wave-crest
       max (~0.46) — otherwise depthTest=true would let nearby high-wave hex
       tops occlude the foam intermittently. The base ship Y is high enough
       that this still reads as surface foam rather than floating above. -->
  {#if showWake}
    <T.Mesh
      bind:ref={wakeRef}
      geometry={wakeGeometry}
      material={wakeMaterial}
      position={[0, 0.05, 0.75]}
      renderOrder={1}
    />
  {/if}
</T.Group>
