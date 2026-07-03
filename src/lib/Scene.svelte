<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import type { OrthographicCamera as ThreeOrthoCam } from 'three';
  import Board from './Board.svelte';
  import Submarine from './Submarine.svelte';
  import OceanCurrents from './OceanCurrents.svelte';
  import { worldToAxial, axialRound, axialToWorld } from './hex';
  import { game, toggleSubmerged } from './game.svelte';

  const TILE_SIZE = 1;
  const ZOOM = 45;

  // Camera rig: fixed orthographic iso-NE view that follows the submarine.
  // Same yaw/pitch/radius as the original (cam offset (+20, +20, +20) from
  // target → yaw=π/4, pitch=atan(1/√2)≈35.26°, radius 20·√3) so the world
  // looks identical to hexa-turnos at boot. The offset is constant, so the
  // camera's orientation never changes — it just translates with the sub.
  const ORBIT_RADIUS = 20 * Math.sqrt(3);
  const YAW = Math.PI / 4;
  const PITCH = Math.atan(1 / Math.SQRT2);
  const CAM_OFF_X = Math.sin(YAW) * ORBIT_RADIUS * Math.cos(PITCH);
  const CAM_OFF_Y = ORBIT_RADIUS * Math.sin(PITCH);
  const CAM_OFF_Z = Math.cos(YAW) * ORBIT_RADIUS * Math.cos(PITCH);

  // $state.raw — three.js mutates cam.quaternion etc. internally on every
  // lookAt/render. A deep $state Proxy would treat each of those as reactive
  // mutations and infinite-loop the reactive graph.
  let cam = $state.raw<ThreeOrthoCam | undefined>(undefined);

  // --- Movement tuning ---
  const TURN_RATE = 1.8; // rad/s
  const MAX_SPEED = 3.0; // world units/s surfaced
  const REVERSE_FACTOR = 0.4; // reverse is slower than ahead
  const SUBMERGED_FACTOR = 0.5; // submerged runs on batteries — half speed

  // --- Keyboard state ---
  // Plain object mutated by the listeners and read in useTask — no
  // reactivity needed, the physics polls it every frame.
  const keys = { up: false, down: false, left: false, right: false };

  $effect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          keys.up = true;
          e.preventDefault();
          break;
        case 'ArrowDown':
          keys.down = true;
          e.preventDefault();
          break;
        case 'ArrowLeft':
          keys.left = true;
          e.preventDefault();
          break;
        case 'ArrowRight':
          keys.right = true;
          e.preventDefault();
          break;
        case ' ':
          // Ignore auto-repeat: holding Space must not strobe the ballast
          // tanks. preventDefault also stops a focused HUD button from
          // being re-activated by the browser's default Space handling.
          if (!e.repeat) toggleSubmerged();
          e.preventDefault();
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          keys.up = false;
          break;
        case 'ArrowDown':
          keys.down = false;
          break;
        case 'ArrowLeft':
          keys.left = false;
          break;
        case 'ArrowRight':
          keys.right = false;
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  // --- Physics + camera, integrated once per frame ---
  // Tank-style controls: ←/→ rotate the heading, ↑/↓ apply thrust along the
  // bow. With rotation.y = θ, the bow (local -Z) points at world
  // (-sin θ, -cos θ) — see the coordinate conventions in hexa-turnos.
  useTask((delta) => {
    if (keys.left) game.heading += TURN_RATE * delta;
    if (keys.right) game.heading -= TURN_RATE * delta;

    let speed = 0;
    if (keys.up) speed += MAX_SPEED * (game.submerged ? SUBMERGED_FACTOR : 1);
    if (keys.down) speed -= MAX_SPEED * REVERSE_FACTOR;

    const fwdX = -Math.sin(game.heading);
    const fwdZ = -Math.cos(game.heading);
    game.x += fwdX * speed * delta;
    game.z += fwdZ * speed * delta;
    game.moving = Math.abs(speed) > 0.01;

    // Camera follows the sub with a constant iso offset. Imperative (not
    // template-reactive) so position + lookAt always update atomically in
    // the same frame.
    if (cam) {
      cam.position.set(game.x + CAM_OFF_X, CAM_OFF_Y, game.z + CAM_OFF_Z);
      cam.lookAt(game.x, 0, game.z);
    }
  });

  // --- Board sizing + re-centering ---
  // The orthographic projection maps 1 screen pixel → 1/(ZOOM·sin(pitch))
  // world units on the y=0 plane. Size the hex disc so its edge never shows.
  // The +3 safety margin covers the disc-vs-rectangular-viewport slop.
  function calcRadius(width: number, height: number, pitchRad: number): number {
    const wScreen = width / ZOOM;
    const hScreen = height / ZOOM / Math.max(0.1, Math.sin(pitchRad));
    const halfDiagonal = Math.sqrt(wScreen * wScreen + hScreen * hScreen) / 2;
    return Math.ceil(halfDiagonal / (1.5 * TILE_SIZE)) + 3;
  }

  let radius = $state(20);
  $effect(() => {
    const update = () => {
      radius = calcRadius(window.innerWidth, window.innerHeight, PITCH);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  });

  // Re-center the hex disc on whichever hex the submarine is over. The cell
  // colors are a deterministic hash of (q, r, seed), so re-centering doesn't
  // make the sea flicker — the illusion of an infinite ocean.
  const boardCenter = $derived.by(() => {
    const c = worldToAxial(game.x, game.z, TILE_SIZE);
    return axialRound(c.q, c.r);
  });

  // Fixed ambient current direction (world-space): foam streaks drift
  // toward the lower-left of the iso view, independent of the sub's heading.
  const CURRENT = axialToWorld(1, -1, TILE_SIZE);
</script>

<T.OrthographicCamera
  bind:ref={cam}
  makeDefault
  position={[CAM_OFF_X, CAM_OFF_Y, CAM_OFF_Z]}
  zoom={ZOOM}
  near={0.1}
  far={500}
/>

<T.AmbientLight intensity={0.6} />
<T.DirectionalLight
  position={[10 + game.x, 20, 10 + game.z]}
  intensity={1.2}
  castShadow
/>
<T.HemisphereLight args={['#ffe9c2', '#3a2a1a', 0.4]} />

<Board
  centerQ={boardCenter.q}
  centerR={boardCenter.r}
  {radius}
  tileSize={TILE_SIZE}
  seed={7}
/>

<!-- Foam-streak particle field around the sub — ambient sea current. -->
<OceanCurrents
  centerX={game.x}
  centerZ={game.z}
  headingX={CURRENT.x}
  headingZ={CURRENT.z}
  y={0.5}
  radius={28}
/>

<Submarine
  x={game.x}
  z={game.z}
  heading={game.heading}
  moving={game.moving}
  submerged={game.submerged}
/>
