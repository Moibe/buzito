<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import type {
    DirectionalLight as ThreeDirLight,
    OrthographicCamera as ThreeOrthoCam,
  } from 'three';
  import Board from './Board.svelte';
  import Submarine from './Submarine.svelte';
  import OceanCurrents from './OceanCurrents.svelte';
  import { axialToWorld } from './hex';
  import { game, toggleSubmerged } from './game.svelte';

  const TILE_SIZE = 1;

  // --- The arena ---
  // Fixed screen-aligned rectangle of hexes centered at the origin: this IS
  // the whole play area. Because the iso camera looks along the world
  // diagonal, the rectangle lives in the camera's ground axes
  // (u = screen right = (x−z)/√2, v = screen depth = (x+z)/√2) — see
  // buildBoardIsoRect. Half-extents are sized ONCE at mount so the arena
  // fills the viewport at BASE_ZOOM; the outermost tile row bleeds past the
  // screen edge, so no background gradient shows through.
  const BASE_ZOOM = 50;
  let halfU = $state(18);
  let halfV = $state(18);
  // Margin the hull keeps from the arena limits so it always stays visually
  // over the tiles.
  const EDGE_MARGIN = 1.0;

  // Camera rig: fixed orthographic iso-NE view aimed at the arena center.
  // Same yaw/pitch as hexa-turnos (yaw=π/4, pitch=atan(1/√2)≈35.26°) so the
  // world reads identically; the camera never moves.
  const ORBIT_RADIUS = 20 * Math.sqrt(3);
  const YAW = Math.PI / 4;
  const PITCH = Math.atan(1 / Math.SQRT2);
  const CAM_OFF_X = Math.sin(YAW) * ORBIT_RADIUS * Math.cos(PITCH);
  const CAM_OFF_Y = ORBIT_RADIUS * Math.sin(PITCH);
  const CAM_OFF_Z = Math.cos(YAW) * ORBIT_RADIUS * Math.cos(PITCH);

  // Size the arena to the viewport — at mount AND on every resize, so the
  // sea always fills the current window (fullscreen included). Regenerating
  // is safe: cell colors are a deterministic hash of (q, r), so tiles that
  // survive a resize keep their color, and the movement clamp pulls the sub
  // back in if the arena shrinks around it. On the ground plane 1 px maps
  // to 1/zoom world units horizontally and 1/(zoom·sin(pitch)) along the
  // depth axis.
  $effect(() => {
    const update = () => {
      halfU = window.innerWidth / (2 * BASE_ZOOM);
      halfV = window.innerHeight / (2 * BASE_ZOOM * Math.sin(PITCH));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  });

  // $state.raw — three.js mutates cam.quaternion etc. internally on every
  // lookAt/render. A deep $state Proxy would treat each of those as reactive
  // mutations and infinite-loop the reactive graph.
  let cam = $state.raw<ThreeOrthoCam | undefined>(undefined);
  let dirLight = $state.raw<ThreeDirLight | undefined>(undefined);

  // One-time orientation: the camera is static, so a single lookAt at the
  // arena center pins the iso view for the whole session.
  $effect(() => {
    if (!cam) return;
    cam.lookAt(0, 0, 0);
  });

  // No zoom-fit needed: the arena re-fits ITSELF to the viewport (effect
  // above), so the camera zoom is simply constant at BASE_ZOOM.

  // Shadow frustum: the default directional-light shadow camera only covers
  // ±5 world units — the sub would lose its shadow past the arena center.
  // Widen it to cover the whole arena (and bump the map so it stays crisp).
  $effect(() => {
    const l = dirLight;
    if (!l) return;
    const sc = l.shadow.camera;
    // Axis-aligned world half-extent of the rotated arena rectangle.
    const extent = (halfU + halfV) * Math.SQRT1_2 + 3;
    sc.left = -extent;
    sc.right = extent;
    sc.top = extent;
    sc.bottom = -extent;
    sc.updateProjectionMatrix();
    l.shadow.mapSize.set(1024, 1024);
    if (l.shadow.map) {
      l.shadow.map.dispose();
      l.shadow.map = null;
    }
  });

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
    // If the window loses focus mid-press (alt-tab, click outside), the
    // matching keyup never arrives and the sub would sail on its own.
    // Reset everything on blur / tab-hide.
    const resetKeys = () => {
      keys.up = keys.down = keys.left = keys.right = false;
    };
    const onVisibility = () => {
      if (document.hidden) resetKeys();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', resetKeys);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', resetKeys);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });

  // --- Physics, integrated once per frame ---
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

    // Confine the sub to the arena: clamp the POSITION per axis in the
    // camera-aligned u/v frame, which naturally slides the hull along the
    // walls instead of gluing it to them.
    const u = (game.x - game.z) * Math.SQRT1_2;
    const v = (game.x + game.z) * Math.SQRT1_2;
    const uLim = halfU - EDGE_MARGIN;
    const vLim = halfV - EDGE_MARGIN;
    const cu = Math.max(-uLim, Math.min(uLim, u));
    const cv = Math.max(-vLim, Math.min(vLim, v));
    if (cu !== u || cv !== v) {
      game.x = (cu + cv) * Math.SQRT1_2;
      game.z = (cv - cu) * Math.SQRT1_2;
    }

    // Forward way only: the wake renders at the stern, so backing up must
    // not build it (foam at the leading edge would read as wrong).
    game.moving = speed > 0.01;
  });

  // Fixed ambient current direction (world-space): foam streaks drift
  // toward the lower-left of the iso view, independent of the sub's heading.
  const CURRENT = axialToWorld(1, -1, TILE_SIZE);
</script>

<T.OrthographicCamera
  bind:ref={cam}
  makeDefault
  position={[CAM_OFF_X, CAM_OFF_Y, CAM_OFF_Z]}
  zoom={BASE_ZOOM}
  near={0.1}
  far={500}
/>

<T.AmbientLight intensity={0.6} />
<!-- Static light: with a fixed arena, the default target at the origin is
     exactly right — the light direction never needs to change. -->
<T.DirectionalLight
  bind:ref={dirLight}
  position={[10, 20, 10]}
  intensity={1.2}
  castShadow
/>
<T.HemisphereLight args={['#ffe9c2', '#3a2a1a', 0.4]} />

<Board {halfU} {halfV} tileSize={TILE_SIZE} seed={7} />

<!-- Foam-streak particle field over the arena — ambient sea current. -->
<OceanCurrents
  centerX={0}
  centerZ={0}
  headingX={CURRENT.x}
  headingZ={CURRENT.z}
  y={0.5}
  radius={Math.max(halfU, halfV)}
/>

<Submarine
  x={game.x}
  z={game.z}
  heading={game.heading}
  moving={game.moving}
  submerged={game.submerged}
/>
