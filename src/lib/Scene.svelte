<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { interactivity } from '@threlte/extras';
  import { Vector3 } from 'three';
  import type {
    DirectionalLight as ThreeDirLight,
    OrthographicCamera as ThreeOrthoCam,
  } from 'three';
  import Board from './Board.svelte';
  import Submarine from './Submarine.svelte';
  import OceanCurrents from './OceanCurrents.svelte';
  import ArenaFrame from './ArenaFrame.svelte';
  import Warship from './Warship.svelte';
  import SubmarineIX from './SubmarineIX.svelte';
  import Cargo from './Cargo.svelte';
  import Tanker from './Tanker.svelte';
  import { axialToWorld, worldToAxial, axialRound } from './hex';
  import { game, toggleSubmerged, markCurrentTile, selectEnemy } from './game.svelte';

  // Enables Threlte pointer picking so the enemy meshes' onclick fires.
  interactivity();

  // Size of each hex in world units. Bigger TILE_SIZE → bigger tiles AND a
  // bigger submarine (SUB_SCALE tracks it), and — because the arena's world
  // extent below is fixed — FEWER tiles. The zoom-fit frames that fixed
  // extent, so raising this doesn't change how much screen the arena fills;
  // it just makes everything on it larger and coarser.
  const TILE_SIZE = 1.3;
  // Submarine size — tracks the tile size so the sub keeps its proportion
  // (~one tile long) as tiles grow/shrink.
  const SUB_SCALE = TILE_SIZE;

  // --- The arena (the game world) ---
  // A FIXED rectangle of hexes aligned to the iso camera's screen axes
  // (u = screen right, v = screen depth; see buildBoardIsoRect). Its WORLD
  // extent is constant — it does NOT depend on the window — so the number of
  // tiles (the whole point of the game: submerge on all of them) and the
  // difficulty stay the same on any screen. A bigger window just renders the
  // same tiles bigger, via the zoom-fit below.
  //
  // Extent halfU=halfV=20 world units; at TILE_SIZE=1.3 that's ~365 tiles.
  // Screen aspect halfU/(halfV·sin(pitch)) ≈ 1.73 (near 16:9), so it fills
  // widescreen monitors with little margin.
  const ARENA_HALF_U = 20;
  const ARENA_HALF_V = 20;

  // Frame box dimensions — single source of truth, passed to <ArenaFrame>
  // AND used by the zoom-fit below so the 3D rails are budgeted for.
  //
  // The frame is a WIDE band that OVERLAPS the ragged outer tile edge rather
  // than sitting in a gap beyond it. A hex tiling can't meet a straight line
  // cleanly — its boundary zigzags — so a thin frame would leave triangular
  // gaps inside it (and any tile poking past a thin frame would show on the
  // near side). Instead: the outer face sits a hair past the outermost tile
  // body (nothing pokes out), and the band reaches ~1.8 INWARD, over the
  // zigzag, so the sea reads solid right up to the frame with no gaps.
  // The box also dips below the waterline (y spans −0.05..0.65) so no
  // background shows under its outer lip.
  const FRAME_THICKNESS = 0.15;
  const FRAME_HEIGHT = 0.06;
  const FRAME_Y = 0.23;
  const FRAME_HALF_THICKNESS = FRAME_THICKNESS / 2;

  // A pointy-top hex body bleeds (√3+1)/(2√2)·tileSize ≈ 0.966·tileSize past
  // its center along u/v; the outermost tile centers reach ~ARENA_HALF, so
  // tile bodies reach ARENA_HALF + HEX_BLEED. Put the frame's OUTER face a
  // hair past that (+0.15), then let the thickness extend the band inward.
  const HEX_BLEED = 0.966 * TILE_SIZE;
  const FRAME_U = ARENA_HALF_U + HEX_BLEED + 0.15 - FRAME_HALF_THICKNESS;
  const FRAME_V = ARENA_HALF_V + HEX_BLEED + 0.15 - FRAME_HALF_THICKNESS;

  // How far inside the tile rect the hull center is kept, so the (larger)
  // hull never rides over the frame or off the tiles.
  const EDGE_MARGIN = 1.5;
  // Small gap kept between the frame and the screen edge so the whole box
  // is always visible.
  const FIT_MARGIN = 0.96;

  // Camera rig: fixed orthographic iso-NE view aimed at the arena center.
  // Same yaw/pitch as hexa-turnos (yaw=π/4, pitch=atan(1/√2)≈35.26°) so the
  // world reads identically; the camera never moves.
  const ORBIT_RADIUS = 20 * Math.sqrt(3);
  const YAW = Math.PI / 4;
  const PITCH = Math.atan(1 / Math.SQRT2);
  const CAM_OFF_X = Math.sin(YAW) * ORBIT_RADIUS * Math.cos(PITCH);
  const CAM_OFF_Y = ORBIT_RADIUS * Math.sin(PITCH);
  const CAM_OFF_Z = Math.cos(YAW) * ORBIT_RADIUS * Math.cos(PITCH);

  // On-screen half-extents of the FRAME box (not just the flat y=0 rect),
  // used by the zoom-fit so the raised rails never clip. Under yaw=45° the
  // world +Y axis projects to pure screen-up, so only the VERTICAL term
  // gains the frame's height/elevation (via cos·pitch) and its half-
  // thickness (via sin·pitch); screen-right (u) gains only the wall's own
  // half-thickness. Budgeting the taller top extent on both sides is
  // slightly conservative but guarantees no clip on any aspect ratio.
  const FIT_HALF_H = FRAME_U + FRAME_HALF_THICKNESS;
  const FIT_HALF_V =
    Math.sin(PITCH) * (FRAME_V + FRAME_HALF_THICKNESS) +
    Math.cos(PITCH) * (FRAME_Y + FRAME_HEIGHT / 2);

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

  // Zoom-to-fit: pick the largest zoom that still shows the WHOLE fixed
  // frame (with FIT_MARGIN breathing room) in both screen axes. On the
  // ground plane 1 px maps to 1/zoom world units horizontally and
  // 1/(zoom·sin(pitch)) along the depth axis. Re-fit on resize so the arena
  // stays fully framed at any window size (bigger window → bigger tiles, not
  // more tiles). Imperative + updateProjectionMatrix for immediate effect.
  $effect(() => {
    const c = cam;
    if (!c) return;
    const fit = () => {
      c.zoom =
        FIT_MARGIN *
        Math.min(
          window.innerWidth / (2 * FIT_HALF_H),
          window.innerHeight / (2 * FIT_HALF_V)
        );
      c.updateProjectionMatrix();
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });

  // Shadow frustum: the default directional-light shadow camera only covers
  // ±5 world units — the sub would lose its shadow across most of the arena.
  // Widen it to the arena's axis-aligned world half-extent.
  $effect(() => {
    const l = dirLight;
    if (!l) return;
    const sc = l.shadow.camera;
    const extent = (FRAME_U + FRAME_V) * Math.SQRT1_2 + 3;
    sc.left = -extent;
    sc.right = extent;
    sc.top = extent;
    sc.bottom = -extent;
    sc.updateProjectionMatrix();
    l.shadow.mapSize.set(2048, 2048);
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
          if (!e.repeat) {
            markCurrentTile();
            toggleSubmerged();
          }
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
    const uLim = ARENA_HALF_U - EDGE_MARGIN;
    const vLim = ARENA_HALF_V - EDGE_MARGIN;
    const cu = Math.max(-uLim, Math.min(uLim, u));
    const cv = Math.max(-vLim, Math.min(vLim, v));
    if (cu !== u || cv !== v) {
      game.x = (cu + cv) * Math.SQRT1_2;
      game.z = (cv - cu) * Math.SQRT1_2;
    }

    // Forward way only: the wake renders at the stern, so backing up must
    // not build it (foam at the leading edge would read as wrong).
    game.moving = speed > 0.01;

    // Keep current tile in sync so the HUD button can mark without
    // importing hex math.
    const raw = worldToAxial(game.x, game.z, TILE_SIZE);
    const ax = axialRound(raw.q, raw.r);
    game.currentTileQ = ax.q;
    game.currentTileR = ax.r;
  });

  // Fixed ambient current direction (world-space): foam streaks drift
  // toward the lower-left of the iso view, independent of the sub's heading.
  const CURRENT = axialToWorld(1, -1, TILE_SIZE);

  // World positions of the enemies (for rendering + their status rings).
  const enemyRender = $derived(
    game.enemies.map((e) => {
      const w = axialToWorld(e.q, e.r, TILE_SIZE);
      return { e, x: w.x, z: w.z };
    })
  );

  // Project the selected enemy's world position to screen space so the HTML
  // context menu (in +page.svelte) can anchor to it. The camera is static, so
  // this only needs recomputing when the selection changes or on resize.
  const projScratch = new Vector3();
  $effect(() => {
    const c = cam;
    const id = game.selectedEnemyId;
    if (!c || !id) return;
    const e = game.enemies.find((x) => x.id === id);
    if (!e) return;
    const update = () => {
      const w = axialToWorld(e.q, e.r, TILE_SIZE);
      c.updateMatrixWorld(true);
      c.matrixWorldInverse.copy(c.matrixWorld).invert();
      projScratch.set(w.x, 0, w.z).project(c);
      game.menuSx = (projScratch.x * 0.5 + 0.5) * window.innerWidth;
      game.menuSy = (-projScratch.y * 0.5 + 0.5) * window.innerHeight;
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  });
</script>

<T.OrthographicCamera
  bind:ref={cam}
  makeDefault
  position={[CAM_OFF_X, CAM_OFF_Y, CAM_OFF_Z]}
  zoom={30}
  near={0.1}
  far={500}
/>

<T.AmbientLight intensity={0.6} />
<!-- Static light: with a fixed arena centered at the origin, the default
     target at the origin is exactly right. -->
<T.DirectionalLight
  bind:ref={dirLight}
  position={[10, 20, 10]}
  intensity={1.2}
  castShadow
/>
<T.HemisphereLight args={['#ffe9c2', '#3a2a1a', 0.4]} />

<Board halfU={ARENA_HALF_U} halfV={ARENA_HALF_V} tileSize={TILE_SIZE} seed={7} visited={game.visited} visitedCount={game.visitedCount} />

<!-- The wide band that frames the play area and hides the ragged tile edge. -->
<ArenaFrame
  halfU={FRAME_U}
  halfV={FRAME_V}
  thickness={FRAME_THICKNESS}
  height={FRAME_HEIGHT}
  y={FRAME_Y}
/>

<!-- Foam-streak particle field over the arena — ambient sea current. -->
<OceanCurrents
  centerX={0}
  centerZ={0}
  headingX={CURRENT.x}
  headingZ={CURRENT.z}
  y={0.5}
  radius={(ARENA_HALF_U + ARENA_HALF_V) * Math.SQRT1_2}
/>

<Submarine
  x={game.x}
  z={game.z}
  heading={game.heading}
  moving={game.moving}
  submerged={game.submerged}
  scale={SUB_SCALE}
/>

<!-- Enemy vessels — click one to open its context menu (activate/deactivate).
     Each sits inside a status ring: gold when selected, green when active,
     gray when inactive. -->
{#each enemyRender as { e, x, z } (e.id)}
  {@const ringColor =
    e.id === game.selectedEnemyId ? '#ffd700' : e.active ? '#4ade80' : '#5b6b7a'}
  <T.Mesh position={[x, 0.44, z]} rotation={[-Math.PI / 2, 0, 0]}>
    <T.RingGeometry args={[1.15, 1.5, 32]} />
    <T.MeshBasicMaterial color={ringColor} transparent opacity={0.85} depthWrite={false} />
  </T.Mesh>

  {#if e.type === 'warship'}
    <Warship q={e.q} r={e.r} tileSize={TILE_SIZE} scale={SUB_SCALE} onclick={() => selectEnemy(e.id)} />
  {:else if e.type === 'cargo'}
    <Cargo q={e.q} r={e.r} tileSize={TILE_SIZE} scale={SUB_SCALE} onclick={() => selectEnemy(e.id)} />
  {:else if e.type === 'tanker'}
    <Tanker q={e.q} r={e.r} tileSize={TILE_SIZE} scale={SUB_SCALE} onclick={() => selectEnemy(e.id)} />
  {:else if e.type === 'submarineIx'}
    <SubmarineIX q={e.q} r={e.r} tileSize={TILE_SIZE} scale={SUB_SCALE} onclick={() => selectEnemy(e.id)} />
  {/if}
{/each}
