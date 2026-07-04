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

  // Pure renderer: the parent owns the physics and feeds position (x, z),
  // heading and depth (submerged). Only handles bob/roll, the submerged
  // silhouette + bubbles, and a foam wake that builds while moving.
  let {
    x = 0,
    z = 0,
    heading = 0,
    moving = false,
    submerged = false,
    periscopeUp = false,
    scale = 1,
    tileHeight = 0.4,
    onclick,
  }: {
    x?: number;
    z?: number;
    heading?: number;
    moving?: boolean;
    submerged?: boolean;
    periscopeUp?: boolean;
    scale?: number;
    tileHeight?: number;
    onclick?: () => void;
  } = $props();

  // Surfaced shares the warship baseY; submerged drops a hair so wave peaks
  // cut through the silhouette and sell "below the surface".
  const baseY = $derived(submerged ? tileHeight + 0.05 : tileHeight + 0.09);

  let bobY = $state(0);
  let roll = $state(0);
  const BOB_AMP_SURFACED = 0.022;
  const BOB_AMP_SUBMERGED = 0.005;
  const BOB_FREQ = 0.85;
  const ROLL_AMP_SURFACED = 0.015;
  const ROLL_AMP_SUBMERGED = 0.003;
  const ROLL_FREQ = 0.6;
  const phase = 4.4;
  let elapsed = 0;

  // Bubble pool — wider spread + more particles than the Type VII (bigger hull).
  type Bubble = { lx: number; lz: number; ly: number; speed: number };
  const BUBBLE_COUNT = 22;
  const BUBBLE_RANGE = 0.7;
  const BUBBLE_BOTTOM = -0.04;
  const BUBBLE_TOP = 0.1;
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

  // Wake (surfaced only), sized between Type VII and warship.
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
    opacity: 0,
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
  let wakeBuildup = 0;
  const WAKE_BUILDUP_RATE = 0.85;
  const WAKE_FADE_RATE = 2.0;

  useTask((delta) => {
    elapsed += delta;
    const bobAmp = submerged ? BOB_AMP_SUBMERGED : BOB_AMP_SURFACED;
    const rollAmp = submerged ? ROLL_AMP_SUBMERGED : ROLL_AMP_SURFACED;
    bobY = bobAmp * Math.sin(elapsed * BOB_FREQ + phase);
    roll = rollAmp * Math.sin(elapsed * ROLL_FREQ + phase + 0.4);

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
  {#if submerged}
    <!-- Submerged silhouette: longer + wider than the Type VII. -->
    <T.Mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={2} onclick={handleClick}>
      <T.CylinderGeometry args={[0.2, 0.2, 2.0, 14]} />
      <T.MeshBasicMaterial color="#0a2030" transparent opacity={0.4} depthWrite={false} />
    </T.Mesh>
    <T.Mesh position={[0, 0, -1.0]} renderOrder={2}>
      <T.SphereGeometry args={[0.2, 12, 10]} />
      <T.MeshBasicMaterial color="#0a2030" transparent opacity={0.4} depthWrite={false} />
    </T.Mesh>
    <T.Mesh position={[0, 0, 1.0]} renderOrder={2}>
      <T.SphereGeometry args={[0.2, 12, 10]} />
      <T.MeshBasicMaterial color="#0a2030" transparent opacity={0.4} depthWrite={false} />
    </T.Mesh>
    <T.InstancedMesh
      bind:ref={bubbleMeshRef}
      args={[bubbleGeometry, bubbleMaterial, BUBBLE_COUNT]}
      renderOrder={1}
    />
  {:else}
    <!-- Surfaced: full ocean-going U-boat (deck gun, aft radio mast). -->
    <T.Mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow renderOrder={2} onclick={handleClick}>
      <T.CylinderGeometry args={[0.2, 0.2, 2.0, 14]} />
      <T.MeshStandardMaterial color="#252830" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0, -1.0]} castShadow renderOrder={2}>
      <T.SphereGeometry args={[0.2, 12, 10]} />
      <T.MeshStandardMaterial color="#252830" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0, 1.0]} castShadow renderOrder={2}>
      <T.SphereGeometry args={[0.2, 12, 10]} />
      <T.MeshStandardMaterial color="#252830" flatShading />
    </T.Mesh>
    <!-- Conning tower. -->
    <T.Mesh position={[0, 0.2, -0.05]} castShadow renderOrder={2} onclick={handleClick}>
      <T.BoxGeometry args={[0.22, 0.2, 0.46]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Vela (taller wedge at the front of the tower). -->
    <T.Mesh position={[0, 0.34, -0.18]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.16, 0.12, 0.16]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Deck gun base (the iconic 105mm of the IX). -->
    <T.Mesh position={[0, 0.13, -0.55]} castShadow renderOrder={2}>
      <T.CylinderGeometry args={[0.07, 0.07, 0.08, 12]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Gun shield. -->
    <T.Mesh position={[0, 0.18, -0.62]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.11, 0.1, 0.04]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Barrel (points forward -Z). -->
    <T.Mesh position={[0, 0.18, -0.82]} rotation={[Math.PI / 2, 0, 0]} castShadow renderOrder={2}>
      <T.CylinderGeometry args={[0.018, 0.018, 0.28, 10]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Radio / antenna mast aft. -->
    <T.Mesh position={[0, 0.36, 0.42]} castShadow renderOrder={2}>
      <T.CylinderGeometry args={[0.013, 0.013, 0.36, 6]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <!-- Deck cleats. -->
    <T.Mesh position={[0, 0.22, 0.75]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.045, 0.045, 0.045]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0.22, -0.3]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.045, 0.045, 0.045]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
  {/if}

  <!-- Periscope: always when surfaced; when submerged only if periscopeUp. -->
  {#if !submerged || periscopeUp}
    <T.Mesh position={[0, 0.52, -0.12]} castShadow renderOrder={2}>
      <T.CylinderGeometry args={[0.015, 0.015, 0.52, 6]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
    <T.Mesh position={[0, 0.8, -0.12]} castShadow renderOrder={2}>
      <T.BoxGeometry args={[0.052, 0.028, 0.07]} />
      <T.MeshStandardMaterial color="#15171a" flatShading />
    </T.Mesh>
  {/if}

  <!-- Surfaced wake — opacity ramps with movement (see useTask). -->
  {#if !submerged}
    <T.Mesh
      bind:ref={wakeRef}
      geometry={wakeGeometry}
      material={wakeMaterial}
      position={[0, 0.05, 1.05]}
      renderOrder={1}
    />
  {/if}
</T.Group>
