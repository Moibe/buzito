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
  import { axialToWorld } from './hex';

  let {
    q = 0,
    r = 0,
    tileSize = 1,
    tileHeight = 0.4,
    scale = 1,
    submerged = false,
    periscopeUp = false,
    showWake = false,
    // See Submarine.svelte for the rule: false suppresses wake while
    // stationary (parent passes false when the sub is turned off the
    // convoy heading).
    wakeWhenStatic = true,
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
    submerged?: boolean;
    periscopeUp?: boolean;
    showWake?: boolean;
    wakeWhenStatic?: boolean;
    onclick?: () => void;
    onAnimate?: (x: number, z: number, rotY: number) => void;
    forwardX?: number;
    forwardZ?: number;
    forceForward?: boolean;
  } = $props();

  const target = $derived(axialToWorld(q, r, tileSize));
  // Same waterline strategy as the Type VII: surfaced shares the warship
  // baseY for clean rendering; submerged drops a hair so wave peaks cut
  // through the silhouette and reinforce "below the surface" reading.
  const baseY = $derived(
    submerged ? tileHeight + 0.05 : tileHeight + 0.09
  );

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
  // Heavier than the Type VII — longer hull, more displacement. ROT_LERP 5
  // (vs the Type VII's 7) so big course changes look ponderous, fitting
  // for the ocean-going variant. Straighten slightly slower too.
  const ROT_LERP = 5;
  const STRAIGHTEN_LERP = 0.75;
  const STRAIGHTEN_EPS = 0.02;
  const EPS = 0.001;
  // Bob/roll match the larger displacement: subtler than warships and
  // slower than Type VII. Submerged values stay almost-zero (water dampens).
  const BOB_AMP_SURFACED = 0.022;
  const BOB_AMP_SUBMERGED = 0.005;
  const BOB_FREQ = 0.85;
  const ROLL_AMP_SURFACED = 0.015;
  const ROLL_AMP_SUBMERGED = 0.003;
  const ROLL_FREQ = 0.6;
  // svelte-ignore state_referenced_locally
  const phase = q * 1.7 + r * 2.3 + 4.4;
  let elapsed = 0;

  // Bubble pool — wider lateral spread and more particles than Type VII
  // because the hull silhouette underneath is visibly bigger.
  type Bubble = { lx: number; lz: number; ly: number; speed: number };
  const BUBBLE_COUNT = 22;
  const BUBBLE_RANGE = 0.7;
  const BUBBLE_BOTTOM = -0.04;
  const BUBBLE_TOP = 0.10;
  const bubbles: Bubble[] = [];
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    bubbles.push({
      lx: (Math.random() - 0.5) * BUBBLE_RANGE,
      lz: (Math.random() - 0.5) * BUBBLE_RANGE,
      ly: BUBBLE_BOTTOM + Math.random() * (BUBBLE_TOP - BUBBLE_BOTTOM),
      speed: 0.05 + Math.random() * 0.05,
    });
  }
  const bubbleGeometry = new SphereGeometry(0.024, 8, 6);
  const bubbleMaterial = new MeshBasicMaterial({
    color: '#dcecf5',
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  let bubbleMeshRef = $state.raw<InstancedMesh | undefined>(undefined);
  const bubbleDummy = new Object3D();

  // Wake (only used while surfaced). Sized between Type VII and warship —
  // bigger sub = more pronounced foam, but still not as wide as a destroyer.
  const wakeGeometry = (() => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([
          -0.22, 0, 0,
          0.22, 0, 0,
          0, 0, 1.25,
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
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
  });
  let wakeRef = $state.raw<Mesh | undefined>(undefined);
  const WAKE_PULSE_FREQ = 1.7;
  const WAKE_LEN_BASE = 1.0;
  const WAKE_LEN_AMP = 0.18;
  const WAKE_OPACITY_BASE = 0.55;
  const WAKE_OPACITY_AMP = 0.18;
  let wakeBuildup = 1;
  const WAKE_BUILDUP_RATE = 0.85;

  useTask((delta) => {
    elapsed += delta;
    const bobAmp = submerged ? BOB_AMP_SUBMERGED : BOB_AMP_SURFACED;
    const rollAmp = submerged ? ROLL_AMP_SUBMERGED : ROLL_AMP_SURFACED;
    bobY = bobAmp * Math.sin(elapsed * BOB_FREQ + phase);
    roll = rollAmp * Math.sin(elapsed * ROLL_FREQ + phase + 0.4);

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

    // See Submarine.svelte for the three-state rationale and the side
    // wake's positioning math. Hull is wider (radius 0.20) so the side
    // anchor moves slightly further out at X=-0.24.
    if (wakeRef && showWake && !submerged) {
      const stoppedFacingOff = dist <= EPS && !wakeWhenStatic;
      if (isStraightening) {
        wakeBuildup = 0;
        wakeMaterial.opacity = 0;
      } else {
        wakeBuildup += (1 - wakeBuildup) * Math.min(WAKE_BUILDUP_RATE * delta, 1);
        const pulse = Math.sin(elapsed * WAKE_PULSE_FREQ + phase);
        const lenZ = WAKE_LEN_BASE + WAKE_LEN_AMP * pulse;
        const op = WAKE_OPACITY_BASE + WAKE_OPACITY_AMP * pulse;
        if (stoppedFacingOff) {
          wakeRef.position.set(-0.24, 0.05, 0);
          wakeRef.rotation.y = -Math.PI / 2;
          wakeRef.scale.set(0.5, 1, lenZ * 0.4);
          wakeMaterial.opacity = op * wakeBuildup * 0.5;
        } else {
          wakeRef.position.set(0, 0.05, 1.05);
          wakeRef.rotation.y = 0;
          wakeRef.scale.set(1, 1, lenZ);
          wakeMaterial.opacity = op * wakeBuildup;
        }
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
  {#if submerged}
    <!-- Submerged silhouette: longer + wider than the Type VII. Same
         transparent-dark material so wave peaks slice through and sell
         the underwater reading. -->
    <T.Mesh
      rotation={[Math.PI / 2, 0, 0]}
      renderOrder={2}
      onclick={handleClick}
    >
      <T.CylinderGeometry args={[0.20, 0.20, 2.0, 14]} />
      <T.MeshBasicMaterial
        color="#0a2030"
        transparent
        opacity={0.40}
        depthWrite={false}
      />
    </T.Mesh>
    <T.Mesh position={[0, 0, -1.0]} renderOrder={2}>
      <T.SphereGeometry args={[0.20, 12, 10]} />
      <T.MeshBasicMaterial
        color="#0a2030"
        transparent
        opacity={0.40}
        depthWrite={false}
      />
    </T.Mesh>
    <T.Mesh position={[0, 0, 1.0]} renderOrder={2}>
      <T.SphereGeometry args={[0.20, 12, 10]} />
      <T.MeshBasicMaterial
        color="#0a2030"
        transparent
        opacity={0.40}
        depthWrite={false}
      />
    </T.Mesh>
    <T.InstancedMesh
      bind:ref={bubbleMeshRef}
      args={[bubbleGeometry, bubbleMaterial, BUBBLE_COUNT]}
      renderOrder={1}
    />
  {:else}
    <!-- Surfaced: full ocean-going U-boat. Longer hull, larger conning
         tower, deck gun on the forward casing, radio mast aft. The slight
         hull-tone shift (`#252830` vs Type VII's `#2a2e30`) plus the deck
         gun + aft mast read at a glance as "bigger, more dangerous boat". -->
    <T.Mesh
      rotation={[Math.PI / 2, 0, 0]}
      castShadow
      receiveShadow
      renderOrder={2}
      onclick={handleClick}
    >
      <T.CylinderGeometry args={[0.20, 0.20, 2.0, 14]} />
      <T.MeshStandardMaterial color="#252830" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0, -1.0]} castShadow renderOrder={2}>
      <T.SphereGeometry args={[0.20, 12, 10]} />
      <T.MeshStandardMaterial color="#252830" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0, 1.0]} castShadow renderOrder={2}>
      <T.SphereGeometry args={[0.20, 12, 10]} />
      <T.MeshStandardMaterial color="#252830" flatShading />
    </T.Mesh>
    <!-- Conning tower: bigger box than the Type VII, more imposing. -->
    <T.Mesh
      position={[0, 0.20, -0.05]}
      castShadow
      renderOrder={2}
      onclick={handleClick}
    >
      <T.BoxGeometry args={[0.22, 0.20, 0.46]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Vela (taller wedge at the front of the tower). -->
    <T.Mesh position={[0, 0.34, -0.18]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.16, 0.12, 0.16]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Deck gun base on the forward casing (the iconic 105mm of the IX). -->
    <T.Mesh position={[0, 0.13, -0.55]} castShadow renderOrder={2}>
      <T.CylinderGeometry args={[0.07, 0.07, 0.08, 12]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Gun shield. -->
    <T.Mesh position={[0, 0.18, -0.62]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.11, 0.10, 0.04]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Barrel. Cylinder along Z, axis horizontal, pointing forward (-Z).
         Long enough to overhang the bow and read clearly in iso. -->
    <T.Mesh
      position={[0, 0.18, -0.82]}
      rotation={[Math.PI / 2, 0, 0]}
      castShadow
      renderOrder={2}
    >
      <T.CylinderGeometry args={[0.018, 0.018, 0.28, 10]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Radio / antenna mast aft (small detail to fill the silhouette). -->
    <T.Mesh position={[0, 0.36, 0.42]} castShadow renderOrder={2}>
      <T.CylinderGeometry args={[0.013, 0.013, 0.36, 6]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Deck cleats. -->
    <T.Mesh position={[0, 0.22, 0.75]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.045, 0.045, 0.045]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0.22, -0.30]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.045, 0.045, 0.045]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
  {/if}

  <!-- Periscope: always visible when surfaced; only when periscopeUp if
       submerged. Taller than the Type VII to reflect the bigger conning
       tower, and still clearly above water from the submerged baseY. -->
  {#if !submerged || periscopeUp}
    <T.Mesh position={[0, 0.52, -0.12]} castShadow renderOrder={2}>
      <T.CylinderGeometry args={[0.015, 0.015, 0.52, 6]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0.80, -0.12]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.052, 0.028, 0.07]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
  {/if}

  <!-- Surfaced wake. Position / rotation / scale set imperatively in
       useTask so the mesh swaps between default stern layout and side
       flank layout. -->
  {#if !submerged && showWake}
    <T.Mesh
      bind:ref={wakeRef}
      geometry={wakeGeometry}
      material={wakeMaterial}
      renderOrder={1}
    />
  {/if}
</T.Group>
