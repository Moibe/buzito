<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    InstancedMesh,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    SphereGeometry,
  } from 'three';

  // Pure renderer: position (x, z) and heading come from the parent, which
  // owns the physics. This component only handles the "being a submarine in
  // the water" part: bob/roll, bubbles when submerged, wake when moving.
  let {
    x = 0,
    z = 0,
    // rotation.y. With heading = θ, the bow (local -Z) points at world
    // (-sin θ, -cos θ) — the parent integrates position with that formula.
    heading = 0,
    // True while the parent physics reports FORWARD way (not reverse — the
    // wake renders at the stern, and foam at the leading edge while backing
    // up would read as wrong). Drives the wake.
    moving = false,
    // When true, the sub is below the waterline: hull renders as a
    // translucent dark silhouette, the conning tower / vela disappear, and
    // the bubble field becomes active. When false, full surfaced model.
    submerged = false,
    // Periscope visibility. Always visible when surfaced. When submerged,
    // only visible if this is true.
    periscopeUp = false,
    scale = 0.95,
    tileHeight = 0.4,
  }: {
    x?: number;
    z?: number;
    heading?: number;
    moving?: boolean;
    submerged?: boolean;
    periscopeUp?: boolean;
    scale?: number;
    tileHeight?: number;
  } = $props();

  // Surfaced subs share the warship base Y so they sit at the same waterline.
  // Submerged drops the hull just a hair so wave peaks visibly slice across
  // the silhouette — which sells the "below the water" reading.
  const baseY = $derived(
    submerged ? tileHeight + 0.05 : tileHeight + 0.09
  );

  let bobY = $state(0);
  let roll = $state(0);

  // Surfaced subs ride flatter than warships (long slim hull, ballast tanks
  // dampen roll). Submerged subs barely move at all — water absorbs surface
  // motion, so we leave only a whisper of bob/roll for "alive but quiet".
  const BOB_AMP_SURFACED = 0.025;
  const BOB_AMP_SUBMERGED = 0.006;
  const BOB_FREQ = 1.0;
  const ROLL_AMP_SURFACED = 0.018;
  const ROLL_AMP_SUBMERGED = 0.004;
  const ROLL_FREQ = 0.7;
  const phase = 3.3;
  let elapsed = 0;

  // Bubble pool — only animated/rendered when submerged. Positions are
  // LOCAL to the sub's group so they follow the sub's pose (and any
  // rotation) naturally. Each bubble drifts upward from below the
  // silhouette and recycles when it pops at the upper bound.
  type Bubble = { lx: number; lz: number; ly: number; speed: number };
  const BUBBLE_COUNT = 16;
  const BUBBLE_RANGE = 0.55;
  const BUBBLE_BOTTOM = -0.04;
  const BUBBLE_TOP = 0.10;
  const bubbles: Bubble[] = [];
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    bubbles.push({
      lx: (Math.random() - 0.5) * BUBBLE_RANGE,
      lz: (Math.random() - 0.5) * BUBBLE_RANGE,
      ly: BUBBLE_BOTTOM + Math.random() * (BUBBLE_TOP - BUBBLE_BOTTOM),
      speed: 0.06 + Math.random() * 0.05,
    });
  }
  const bubbleGeometry = new SphereGeometry(0.022, 8, 6);
  const bubbleMaterial = new MeshBasicMaterial({
    color: '#dcecf5',
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  // $state.raw — see the three.js refs note in Board.svelte.
  let bubbleMeshRef = $state.raw<InstancedMesh | undefined>(undefined);
  const bubbleDummy = new Object3D();

  // Wake (only used while surfaced). Smaller than warship/cargo wakes —
  // a Type VII riding low in the water doesn't push much foam.
  const wakeGeometry = (() => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          -0.18, 0, 0,
          0.18, 0, 0,
          0, 0, 1.0,
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
  const WAKE_PULSE_FREQ = 2.0;
  const WAKE_LEN_BASE = 1.0;
  const WAKE_LEN_AMP = 0.15;
  const WAKE_OPACITY_BASE = 0.50;
  const WAKE_OPACITY_AMP = 0.16;
  // Foam ramps in as the sub starts moving and fades out when it stops —
  // replaces the old turn-based "dist > EPS" driver condition with `moving`.
  let wakeBuildup = 0;
  const WAKE_BUILDUP_RATE = 1.0;
  const WAKE_FADE_RATE = 2.0;

  useTask((delta) => {
    elapsed += delta;
    const bobAmp = submerged ? BOB_AMP_SUBMERGED : BOB_AMP_SURFACED;
    const rollAmp = submerged ? ROLL_AMP_SUBMERGED : ROLL_AMP_SURFACED;
    bobY = bobAmp * Math.sin(elapsed * BOB_FREQ + phase);
    roll = rollAmp * Math.sin(elapsed * ROLL_FREQ + phase + 0.4);

    // Bubble update — only when submerged. We shrink each bubble as it
    // rises (instead of fading opacity, which InstancedMesh doesn't expose
    // per-instance) so the visual reads as a popping/dissipating bubble.
    if (submerged && bubbleMeshRef) {
      const range = BUBBLE_TOP - BUBBLE_BOTTOM;
      for (let i = 0; i < BUBBLE_COUNT; i++) {
        const b = bubbles[i];
        b.ly += b.speed * delta;
        if (b.ly >= BUBBLE_TOP) {
          b.ly = BUBBLE_BOTTOM;
          b.lx = (Math.random() - 0.5) * BUBBLE_RANGE;
          b.lz = (Math.random() - 0.5) * BUBBLE_RANGE;
        }
        const t = (b.ly - BUBBLE_BOTTOM) / range;
        const s = 1.0 - t * 0.65;
        bubbleDummy.position.set(b.lx, b.ly, b.lz);
        bubbleDummy.scale.set(s, s, s);
        bubbleDummy.updateMatrix();
        bubbleMeshRef.setMatrixAt(i, bubbleDummy.matrix);
      }
      bubbleMeshRef.instanceMatrix.needsUpdate = true;
    }

    // Wake animation — only when surfaced. Pulsing stern wake that builds
    // up while moving and fades out while stopped.
    if (wakeRef && !submerged) {
      const rate = moving ? WAKE_BUILDUP_RATE : WAKE_FADE_RATE;
      const targetBuildup = moving ? 1 : 0;
      wakeBuildup += (targetBuildup - wakeBuildup) * Math.min(rate * delta, 1);
      const pulse = Math.sin(elapsed * WAKE_PULSE_FREQ + phase);
      wakeRef.scale.set(1, 1, WAKE_LEN_BASE + WAKE_LEN_AMP * pulse);
      wakeMaterial.opacity =
        (WAKE_OPACITY_BASE + WAKE_OPACITY_AMP * pulse) * wakeBuildup;
    }
  });
</script>

<T.Group
  position={[x, baseY + bobY, z]}
  rotation={[0, heading, roll]}
  scale={[scale, scale, scale]}
>
  {#if submerged}
    <!-- Submerged silhouette. Transparent dark blue + depthWrite off so
         nearby foam layers nicely on top. Wave peaks occluding parts of
         the hull is INTENDED — it sells the "below the surface" reading. -->
    <T.Mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={2}>
      <T.CylinderGeometry args={[0.18, 0.18, 1.5, 14]} />
      <T.MeshBasicMaterial
        color="#0a2030"
        transparent
        opacity={0.40}
        depthWrite={false}
      />
    </T.Mesh>
    <T.Mesh position={[0, 0, -0.75]} renderOrder={2}>
      <T.SphereGeometry args={[0.18, 12, 10]} />
      <T.MeshBasicMaterial
        color="#0a2030"
        transparent
        opacity={0.40}
        depthWrite={false}
      />
    </T.Mesh>
    <T.Mesh position={[0, 0, 0.75]} renderOrder={2}>
      <T.SphereGeometry args={[0.18, 12, 10]} />
      <T.MeshBasicMaterial
        color="#0a2030"
        transparent
        opacity={0.40}
        depthWrite={false}
      />
    </T.Mesh>
    <!-- Bubble particle field. -->
    <T.InstancedMesh
      bind:ref={bubbleMeshRef}
      args={[bubbleGeometry, bubbleMaterial, BUBBLE_COUNT]}
      renderOrder={1}
    />
  {:else}
    <!-- Surfaced: full sub model. Cigar hull + conning tower + vela. -->
    <T.Mesh
      rotation={[Math.PI / 2, 0, 0]}
      castShadow
      receiveShadow
      renderOrder={2}
    >
      <T.CylinderGeometry args={[0.18, 0.18, 1.5, 14]} />
      <T.MeshStandardMaterial color="#2a2e30" flatShading />
    </T.Mesh>
    <!-- Bow / stern rounded caps. -->
    <T.Mesh position={[0, 0, -0.75]} castShadow renderOrder={2}>
      <T.SphereGeometry args={[0.18, 12, 10]} />
      <T.MeshStandardMaterial color="#2a2e30" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0, 0.75]} castShadow renderOrder={2}>
      <T.SphereGeometry args={[0.18, 12, 10]} />
      <T.MeshStandardMaterial color="#2a2e30" flatShading />
    </T.Mesh>
    <!-- Conning tower. The iconic central block; slightly forward of mid -->
    <T.Mesh position={[0, 0.17, -0.05]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.18, 0.16, 0.36]} />
      <T.MeshStandardMaterial color="#1a1c1e" flatShading />
    </T.Mesh>
    <!-- Vela: the taller wedge at the front of the tower (the bridge). -->
    <T.Mesh position={[0, 0.28, -0.14]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.13, 0.1, 0.14]} />
      <T.MeshStandardMaterial color="#1a1c1e" flatShading />
    </T.Mesh>
    <!-- Tiny deck cleats fore and aft — silhouette detail. -->
    <T.Mesh position={[0, 0.20, 0.55]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.04, 0.04, 0.04]} />
      <T.MeshStandardMaterial color="#1a1c1e" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0.20, -0.55]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.04, 0.04, 0.04]} />
      <T.MeshStandardMaterial color="#1a1c1e" flatShading />
    </T.Mesh>
  {/if}

  <!-- Periscope: always visible when surfaced; when submerged, only if
       periscopeUp. The mast is tall enough that even from the submerged
       baseY it pokes well above the water. -->
  {#if !submerged || periscopeUp}
    <T.Mesh position={[0, 0.45, -0.10]} castShadow renderOrder={2}>
      <T.CylinderGeometry args={[0.014, 0.014, 0.45, 6]} />
      <T.MeshStandardMaterial color="#1a1c1e" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0.69, -0.10]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.045, 0.025, 0.06]} />
      <T.MeshStandardMaterial color="#1a1c1e" flatShading />
    </T.Mesh>
  {/if}

  <!-- Surfaced wake at the stern. Scale/opacity are set imperatively in
       useTask (pulse + buildup/fade driven by `moving`). -->
  {#if !submerged}
    <T.Mesh
      bind:ref={wakeRef}
      position={[0, 0.05, 0.80]}
      geometry={wakeGeometry}
      material={wakeMaterial}
      renderOrder={1}
    />
  {/if}
</T.Group>
