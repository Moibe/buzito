<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import {
    BackSide,
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    InstancedMesh,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    SphereGeometry,
  } from 'three';

  // Pure renderer: the parent owns the physics (position/heading/depth). A
  // sleek shark-shaped raider sub — a flattened ellipsoid body with a dorsal
  // fin and tail (distinct from the cylindrical U-boats). Submerged → a
  // translucent silhouette + bubbles; surfaced → the solid shark.
  let {
    x = 0,
    z = 0,
    heading = 0,
    moving = false,
    submerged = false,
    scale = 1,
    tileHeight = 0.4,
    onclick,
  }: {
    x?: number;
    z?: number;
    heading?: number;
    moving?: boolean;
    submerged?: boolean;
    scale?: number;
    tileHeight?: number;
    onclick?: () => void;
  } = $props();

  const baseY = $derived(submerged ? tileHeight + 0.05 : tileHeight + 0.08);

  let bobY = $state(0);
  let roll = $state(0);
  const BOB_AMP_SURFACED = 0.02;
  const BOB_AMP_SUBMERGED = 0.005;
  const BOB_FREQ = 1.1;
  const ROLL_AMP_SURFACED = 0.02;
  const ROLL_AMP_SUBMERGED = 0.004;
  const ROLL_FREQ = 0.8;
  const phase = 3.9;
  let elapsed = 0;

  // Bubble pool (submerged only).
  type Bubble = { lx: number; lz: number; ly: number; speed: number };
  const BUBBLE_COUNT = 16;
  const BUBBLE_RANGE = 0.5;
  const BUBBLE_BOTTOM = -0.04;
  const BUBBLE_TOP = 0.1;
  const bubbles: Bubble[] = [];
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    bubbles.push({
      lx: (Math.random() - 0.5) * BUBBLE_RANGE,
      lz: (Math.random() - 0.5) * BUBBLE_RANGE,
      ly: BUBBLE_BOTTOM + Math.random() * (BUBBLE_TOP - BUBBLE_BOTTOM),
      speed: 0.06 + Math.random() * 0.05,
    });
  }
  const bubbleGeometry = new SphereGeometry(0.02, 8, 6);
  const bubbleMaterial = new MeshBasicMaterial({
    color: '#dcecf5',
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  let bubbleMeshRef = $state.raw<InstancedMesh | undefined>(undefined);
  const bubbleDummy = new Object3D();

  // Foam wake (surfaced only), driven by movement.
  const wakeGeometry = (() => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-0.16, 0, 0, 0.16, 0, 0, 0, 0, 0.9]), 3)
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
  const WAKE_PULSE_FREQ = 2.2;
  const WAKE_LEN_BASE = 1.0;
  const WAKE_LEN_AMP = 0.16;
  const WAKE_OPACITY_BASE = 0.5;
  const WAKE_OPACITY_AMP = 0.16;
  let wakeBuildup = 0;
  const WAKE_BUILDUP_RATE = 1.2;
  const WAKE_FADE_RATE = 2.0;

  useTask((delta) => {
    elapsed += delta;
    const bobAmp = submerged ? BOB_AMP_SUBMERGED : BOB_AMP_SURFACED;
    const rollAmp = submerged ? ROLL_AMP_SUBMERGED : ROLL_AMP_SURFACED;
    bobY = bobAmp * Math.sin(elapsed * BOB_FREQ + phase);
    roll = rollAmp * Math.sin(elapsed * ROLL_FREQ + phase + 0.3);

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

    if (wakeRef && !submerged) {
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

<T.Group
  position={[x, baseY + bobY, z]}
  rotation={[0, heading, roll]}
  scale={[scale, scale, scale]}
>
  {#if submerged}
    <!-- Outline shells (inverted-hull): a slightly larger copy of each shape in
         a bright edge color with BackSide, so a crisp contour rims the
         translucent silhouette and it reads clearly underwater. -->
    <T.Mesh scale={[0.35, 0.21, 1.06]} renderOrder={1}>
      <T.SphereGeometry args={[1, 16, 12]} />
      <T.MeshBasicMaterial color="#cfe0ea" side={BackSide} transparent opacity={0.9} depthWrite={false} />
    </T.Mesh>
    <T.Mesh position={[0, 0.16, -0.05]} rotation={[0, 0, -0.35]} scale={[0.26, 1.12, 1.12]} renderOrder={1}>
      <T.ConeGeometry args={[0.17, 0.34, 3]} />
      <T.MeshBasicMaterial color="#cfe0ea" side={BackSide} transparent opacity={0.9} depthWrite={false} />
    </T.Mesh>

    <!-- Submerged silhouette: the shark body as a translucent grey shape. -->
    <T.Mesh scale={[0.3, 0.18, 1.0]} renderOrder={2} onclick={handleClick}>
      <T.SphereGeometry args={[1, 16, 12]} />
      <T.MeshBasicMaterial color="#5a6570" transparent opacity={0.45} depthWrite={false} />
    </T.Mesh>
    <!-- Dorsal fin silhouette (the tell that pokes near the surface). -->
    <T.Mesh position={[0, 0.16, -0.05]} rotation={[0, 0, -0.35]} scale={[0.18, 1, 1]} renderOrder={2}>
      <T.ConeGeometry args={[0.17, 0.34, 3]} />
      <T.MeshBasicMaterial color="#5a6570" transparent opacity={0.45} depthWrite={false} />
    </T.Mesh>
    <T.InstancedMesh
      bind:ref={bubbleMeshRef}
      args={[bubbleGeometry, bubbleMaterial, BUBBLE_COUNT]}
      renderOrder={1}
    />
  {:else}
    <!-- Surfaced: sleek flattened body + dorsal fin + tail fin. -->
    <T.Mesh scale={[0.3, 0.18, 1.0]} castShadow receiveShadow renderOrder={2} onclick={handleClick}>
      <T.SphereGeometry args={[1, 16, 12]} />
      <T.MeshStandardMaterial color="#4a5560" flatShading />
    </T.Mesh>
    <!-- Dorsal fin: a swept triangular fin on the back. -->
    <T.Mesh position={[0, 0.16, -0.05]} rotation={[0, 0, -0.35]} scale={[0.18, 1, 1]} castShadow renderOrder={2} onclick={handleClick}>
      <T.ConeGeometry args={[0.17, 0.34, 3]} />
      <T.MeshStandardMaterial color="#2e353d" flatShading />
    </T.Mesh>
    <!-- Tail fin: a vertical fin at the stern (+Z). -->
    <T.Mesh position={[0, 0.05, 0.95]} rotation={[0, 0, 0]} scale={[0.14, 1, 0.5]} castShadow renderOrder={2}>
      <T.ConeGeometry args={[0.2, 0.4, 3]} />
      <T.MeshStandardMaterial color="#2e353d" flatShading />
    </T.Mesh>
  {/if}

  <!-- Surfaced wake — opacity ramps with movement. -->
  {#if !submerged}
    <T.Mesh
      bind:ref={wakeRef}
      geometry={wakeGeometry}
      material={wakeMaterial}
      position={[0, 0.05, 0.95]}
      renderOrder={1}
    />
  {/if}
</T.Group>
