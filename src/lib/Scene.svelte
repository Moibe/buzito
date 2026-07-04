<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { interactivity } from '@threlte/extras';
  import { untrack } from 'svelte';
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
  import Bomber from './Bomber.svelte';
  import Tracers from './Tracers.svelte';
  import { axialToWorld, worldToAxial, axialRound } from './hex';
  import {
    game,
    toggleSubmerged,
    markCurrentTile,
    selectEnemy,
    closeEnemyMenu,
    damageSub,
    healSub,
    config,
    type EnemyType,
    type Enemy,
    type Tracer,
  } from './game.svelte';

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
  const REVERSE_FACTOR = 0.4; // reverse is slower than ahead
  // Player turn rate / speed live in config.sub (tunable from the panel).

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
    // A sunk sub doesn't answer the helm — controls freeze until restart.
    const alive = !game.gameOver;
    const subSpeed = config.sub.speed;
    if (alive && keys.left) game.heading += config.sub.turnRate * delta;
    if (alive && keys.right) game.heading -= config.sub.turnRate * delta;

    let speed = 0;
    // Same speed surfaced or submerged (no dive penalty).
    if (alive && keys.up) speed += subSpeed;
    if (alive && keys.down) speed -= subSpeed * REVERSE_FACTOR;

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

  // --- Enemy motion ---
  // Every enemy is a Scene-driven pure renderer whose continuous world
  // position lives here in `movers`.
  //
  // behavior: 'patrol' = bounce back and forth along an axis (u=horizontal,
  // v=vertical). 'roam' = slow, erratic wander with long pauses (the bomber).
  // Structural movement config (speed is tunable — comes from config.enemies).
  // The patrol AXIS is NOT fixed per type: each line-mover is randomly assigned
  // horizontal (u) or vertical (v) when its mover is created (i.e. at match
  // start), and keeps it for the whole match.
  type MoverCfg = {
    behavior: 'patrol' | 'roam';
    margin: number;
    rotLerp: number;
  };
  const MOVER_CFG: Record<string, MoverCfg> = {
    cargo: { behavior: 'patrol', margin: 2.0, rotLerp: 6 },
    warship: { behavior: 'patrol', margin: 2.0, rotLerp: 6 },
    submarineIx: { behavior: 'patrol', margin: 2.0, rotLerp: 5 },
    // The bomber creeps to random spots and sits idle for long stretches.
    bomber: { behavior: 'roam', margin: 2.5, rotLerp: 3 },
  };
  const DYNAMIC = new Set<EnemyType>(Object.keys(MOVER_CFG) as EnemyType[]);
  // How long the bomber sits still between roams (random per idle).
  const ROAM_IDLE_MIN = 3.0;
  const ROAM_IDLE_MAX = 8.0;

  // Resting/patrol heading for dir=+1 (the far direction along the axis) and
  // dir=−1. Bow = local −Z → forward = (−sinθ, −cosθ).
  //   u axis: +u dir → θ=−π/4,  −u dir → θ=3π/4
  //   v axis: +v dir → θ=−3π/4, −v dir → θ=π/4
  function patrolHeading(axis: 'u' | 'v', dir: number) {
    if (axis === 'v') return dir > 0 ? (-3 * Math.PI) / 4 : Math.PI / 4;
    return dir > 0 ? -Math.PI / 4 : (3 * Math.PI) / 4;
  }

  // U-boat depth-segment durations live in config.enemies.submarineIx
  // (depthMin/depthMax), tunable from the panel.

  type Mover = {
    x: number;
    z: number;
    axis: 'u' | 'v'; // this match's patrol axis (random per line-mover)
    heading: number;
    dir: number; // +1 / −1 along the patrol axis
    moving: boolean;
    moveTarget: { x: number; z: number } | null;
    submerged: boolean; // only the U-boat toggles this
    depthTimer: number; // seconds until the next depth flip (U-boat)
    roamTimer: number; // seconds of idle left before the next roam (bomber)
  };
  function randDepthTime() {
    const c = config.enemies.submarineIx;
    return c.depthMin + Math.random() * (c.depthMax - c.depthMin);
  }
  function newMover(e: Enemy): Mover {
    const w = axialToWorld(e.q, e.r, TILE_SIZE);
    // Random patrol axis for this match (line-movers only; unused for the
    // roaming bomber).
    const axis: 'u' | 'v' = Math.random() < 0.5 ? 'u' : 'v';
    return {
      x: w.x,
      z: w.z,
      axis,
      heading: patrolHeading(axis, 1),
      dir: 1,
      moving: false,
      moveTarget: null,
      submerged: false,
      depthTimer: randDepthTime(),
      roamTimer: ROAM_IDLE_MIN + Math.random() * (ROAM_IDLE_MAX - ROAM_IDLE_MIN),
    };
  }
  const movers = $state<Record<string, Mover>>(
    Object.fromEntries(
      game.enemies.filter((e) => DYNAMIC.has(e.type)).map((e) => [e.id, newMover(e)])
    )
  );

  // Rebuild movers when the roster is regenerated (respawnEnemies bumps the
  // epoch) so revived/reset enemies return to their spawn tiles + state.
  // untrack: only fire on epoch change, NOT when game.enemies mutates on death.
  $effect(() => {
    game.enemiesEpoch;
    untrack(() => {
      for (const k of Object.keys(movers)) delete movers[k];
      for (const e of game.enemies) {
        if (DYNAMIC.has(e.type)) movers[e.id] = newMover(e);
      }
    });
  });

  // Live world position of an enemy (all enemies are movers now).
  function enemyPos(e: { id: string }) {
    return movers[e.id];
  }

  // A random point inside the playable arena (used by the bomber's roam AI).
  function randomArenaPoint() {
    const uL = ARENA_HALF_U - PLACE_MARGIN;
    const vL = ARENA_HALF_V - PLACE_MARGIN;
    const u = (Math.random() * 2 - 1) * uL;
    const v = (Math.random() * 2 - 1) * vL;
    return { x: (u + v) * Math.SQRT1_2, z: (v - u) * Math.SQRT1_2 };
  }

  // Placement clamp so a vehicle can't be sent into/through the frame.
  const PLACE_MARGIN = 2.0;
  function clampToArena(x: number, z: number) {
    const u = (x - z) * Math.SQRT1_2;
    const v = (x + z) * Math.SQRT1_2;
    const uL = ARENA_HALF_U - PLACE_MARGIN;
    const vL = ARENA_HALF_V - PLACE_MARGIN;
    const cu = Math.max(-uL, Math.min(uL, u));
    const cv = Math.max(-vL, Math.min(vL, v));
    return { x: (cu + cv) * Math.SQRT1_2, z: (cv - cu) * Math.SQRT1_2 };
  }

  // With an enemy selected, a click on empty sea relocates it there (test
  // convenience — clicking another vehicle re-selects it instead, since its
  // own onclick fires first and stops this handler).
  function onGroundClick(ev: { point: Vector3; stopPropagation?: () => void }) {
    if (!game.selectedEnemyId) return;
    ev.stopPropagation?.();
    const e = game.enemies.find((x) => x.id === game.selectedEnemyId);
    if (!e) return;
    const p = clampToArena(ev.point.x, ev.point.z);
    if (DYNAMIC.has(e.type)) {
      movers[e.id].moveTarget = p;
    } else {
      // Fractional axial (no hex snap): axialToWorld(q,r) lands exactly on p,
      // so the ship's own driver glides it precisely there.
      const a = worldToAxial(p.x, p.z, TILE_SIZE);
      e.q = a.q;
      e.r = a.r;
    }
  }

  // --- Destroyer guns ---
  // The warship strafes the SURFACED sub with its side machine guns whenever
  // the sub is within range ("cuadros"). Submerging breaks the line of fire —
  // diving is the counter. Range / fire rate / damage live in config.enemies.
  const GUN_Y = 0.62; // tracer height (about the gun mounts)
  const GUN_OFFSET = 0.6; // spawn a bit off the hull toward the sub
  const TRACER_SPEED = 18; // world units/s
  const TRACER_LIFE = 0.7; // seconds
  const TRACER_HIT_R2 = 0.5 * 0.5; // squared radius counted as "on target" (sub)
  const TRACER_ENEMY_R2 = 0.9 * 0.9; // friendly-fire hit radius vs an enemy hull
  const MUZZLE_DECAY = 0.05; // muzzle-flash fade time (s)
  const TRACER_POOL = 60;
  const tracers: Tracer[] = Array.from({ length: TRACER_POOL }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vz: 0,
    age: 0,
  }));
  let fireCooldown = 0;
  let muzzleFlash = $state(0);
  let muzzleX = $state(0);
  let muzzleZ = $state(0);
  const warshipId = game.enemies.find((e) => e.type === 'warship')?.id;

  // On revive (Reintentar → gameOver flips back to false), clear any rounds
  // still in flight from the previous life: the pool is Scene-local, so
  // resetGame() can't reach it, and a stale tracer crossing the arena center
  // would otherwise chip the freshly reset hull. Harmless on mount (pool
  // starts inactive).
  $effect(() => {
    if (!game.gameOver) {
      for (const t of tracers) t.active = false;
      fireCooldown = 0;
      muzzleFlash = 0;
    }
  });

  // --- Ramming ---
  // Any enemy hull passing over the SURFACED sub deals its class ram damage
  // (hexa-turnos ramDamage). Per-enemy cooldown so a sustained overlap chips
  // in pulses instead of once per frame.
  const RAM_RADIUS = 1.4; // world units, center-to-center
  const RAM_COOLDOWN = 1.0; // seconds between hits from the same vessel
  const ramCooldowns: Record<string, number> = {};

  // --- Breach attack ---
  // Emerging (surfacing) right under a SURFACED enemy hits it from below: it
  // takes damage and gets flung to an adjacent tile, and YOU take none.
  const BREACH_RADIUS = 1.8; // overlap needed at the moment of surfacing
  const BREACH_DAMAGE = 25; // a solid surprise hit
  const BREACH_KNOCK = Math.sqrt(3) * TILE_SIZE; // one adjacent-tile distance
  let prevSubmerged = false; // sub depth last frame, to detect the emerge

  // --- Bomber bombs ---
  // The bomber lobs salvos of bombs in parabolic arcs to scattered points
  // around the sub. Where each lands it explodes, damaging the sub at ANY
  // depth — unlike guns/ram, diving does NOT save you; you must move clear.
  const bomberId = game.enemies.find((e) => e.type === 'bomber')?.id;
  // Salvo interval / size / bomb damage / blast radius live in
  // config.enemies.bomber (tunable). The rest are structural.
  const BOMB_SPREAD = 3.6; // scatter radius of targets around the sub
  const BOMB_FLIGHT = 1.35; // seconds per arc
  const BOMB_LAUNCH_Y = 0.7; // launch height (bomber deck)
  const BOMB_ARC_H = 2.6; // parabola peak height above the straight line
  const SEA_Y = 0.42; // impact / sea-surface height
  const BLAST_DUR = 0.5; // explosion visual lifetime (s)
  let bombTimer = config.enemies.bomber.salvoMin;

  type Bomb = {
    active: boolean;
    sx: number;
    sy: number;
    sz: number;
    tx: number;
    tz: number;
    t: number;
  };
  type Blast = { active: boolean; x: number; z: number; t: number };
  const bombs = $state<Bomb[]>(
    Array.from({ length: 24 }, () => ({ active: false, sx: 0, sy: 0, sz: 0, tx: 0, tz: 0, t: 0 }))
  );
  const blasts = $state<Blast[]>(
    Array.from({ length: 24 }, () => ({ active: false, x: 0, z: 0, t: 0 }))
  );

  function launchSalvo(sx: number, sz: number) {
    const n = Math.max(1, Math.round(config.enemies.bomber.salvoSize));
    for (let i = 0; i < n; i++) {
      const b = bombs.find((x) => !x.active);
      if (!b) break;
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * BOMB_SPREAD;
      const p = clampToArena(game.x + Math.cos(ang) * rad, game.z + Math.sin(ang) * rad);
      b.active = true;
      b.sx = sx;
      b.sy = BOMB_LAUNCH_Y;
      b.sz = sz;
      b.tx = p.x;
      b.tz = p.z;
      b.t = 0;
    }
  }

  // Just the expanding-ring visual (used for both bomb impacts and the puff
  // when an enemy is destroyed).
  function spawnBlastVisual(x: number, z: number) {
    const bl = blasts.find((b) => !b.active);
    if (bl) {
      bl.active = true;
      bl.x = x;
      bl.z = z;
      bl.t = 0;
    }
  }

  // A bomb impact: the visual + damage to the sub (any depth) AND to any enemy
  // caught in the blast (friendly fire).
  function spawnBlast(x: number, z: number) {
    spawnBlastVisual(x, z);
    const dmg = config.enemies.bomber.bombDamage;
    const r = config.enemies.bomber.blastRadius;
    const r2 = r * r;
    if (!game.gameOver) {
      const dx = x - game.x;
      const dz = z - game.z;
      if (dx * dx + dz * dz < r2) {
        damageSub(dmg, 'Una bomba del Bombardero te alcanzó.');
      }
    }
    for (const e of game.enemies) {
      const m = movers[e.id];
      if (!m) continue;
      const ex = m.x - x;
      const ez = m.z - z;
      if (ex * ex + ez * ez < r2) e.hp -= dmg;
    }
  }

  // --- Health pickups ---
  // Three blue orbs (each randomly submerged or surfaced) appear on the board;
  // touching one AT THE SAME DEPTH heals the sub. Once all three are taken, a
  // 3-minute timer runs before a fresh trio appears.
  const PICKUP_COUNT = 3;
  const PICKUP_RADIUS = 1.1;
  // Heal amount / respawn delay live in config.pickup (tunable).
  type Pickup = { active: boolean; x: number; z: number; submerged: boolean };
  const pickups = $state<Pickup[]>(
    Array.from({ length: PICKUP_COUNT }, () => ({ active: false, x: 0, z: 0, submerged: false }))
  );
  let pickupRespawnTimer = 0; // counts down while the trio is cleared
  let pickupElapsed = 0;
  let pickupPulse = $state(0); // shared gentle bob/scale pulse

  function spawnPickups() {
    for (const p of pickups) {
      const pt = randomArenaPoint();
      p.active = true;
      p.x = pt.x;
      p.z = pt.z;
      p.submerged = Math.random() < 0.5;
    }
  }

  // On revive, clear in-flight bombs / explosions from the previous life so a
  // stale bomb can't blast the freshly reset hull (same rationale as tracers).
  // Also reset pickups so a fresh trio spawns next frame.
  $effect(() => {
    if (!game.gameOver) {
      for (const b of bombs) b.active = false;
      for (const bl of blasts) bl.active = false;
      // untrack: reading config here must NOT subscribe this revive effect to
      // the bomber knob (editing it live would otherwise wipe bombs + pickups).
      bombTimer = untrack(() => config.enemies.bomber.salvoMin);
      for (const p of pickups) p.active = false;
      pickupRespawnTimer = 0;
    }
  });

  // Distance in hex "cuadros" between two world points.
  function hexDistTiles(ax: number, az: number, bx: number, bz: number) {
    const a = worldToAxial(ax, az, TILE_SIZE);
    const b = worldToAxial(bx, bz, TILE_SIZE);
    const dq = a.q - b.q;
    const dr = a.r - b.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  function spawnTracer(sx: number, sz: number, tx: number, tz: number) {
    const t = tracers.find((p) => !p.active);
    if (!t) return;
    let dx = tx - sx;
    let dz = tz - sz;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    // Small random spread so the stream reads as machine-gun fire, not a beam.
    const s = (Math.random() - 0.5) * 0.13;
    const cs = Math.cos(s);
    const sn = Math.sin(s);
    const ndx = dx * cs - dz * sn;
    const ndz = dx * sn + dz * cs;
    t.active = true;
    t.x = sx + ndx * GUN_OFFSET;
    t.z = sz + ndz * GUN_OFFSET;
    t.y = GUN_Y;
    t.vx = ndx * TRACER_SPEED;
    t.vz = ndz * TRACER_SPEED;
    t.age = 0;
    muzzleX = t.x;
    muzzleZ = t.z;
    muzzleFlash = 1;
  }

  const projScratch = new Vector3();
  useTask((delta) => {
    // --- Dynamic enemy motion (all enemies: cargo, warship, U-boat, bomber) ---
    for (const e of game.enemies) {
      if (!DYNAMIC.has(e.type)) continue;
      const m = movers[e.id];
      const cfg = MOVER_CFG[e.type];
      if (!m || !cfg) continue;
      const spd = config.enemies[e.type].speed; // tunable per-enemy speed
      let th = m.heading;
      if (m.moveTarget) {
        // Manual relocation glide (any direction) — overrides patrol.
        const dx = m.moveTarget.x - m.x;
        const dz = m.moveTarget.z - m.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.02) {
          const step = Math.min(spd * delta, dist);
          m.x += (dx / dist) * step;
          m.z += (dz / dist) * step;
          m.moving = true;
          th = Math.atan2(-dx, -dz);
        } else {
          m.moveTarget = null;
          m.moving = false;
          // After arriving, a roamer sits idle for a fresh long stretch.
          if (cfg.behavior === 'roam') {
            m.roamTimer = ROAM_IDLE_MIN + Math.random() * (ROAM_IDLE_MAX - ROAM_IDLE_MIN);
          }
        }
      } else if (e.active && cfg.behavior === 'roam') {
        // Erratic wander: hold still, then occasionally creep to a random
        // spot (and sometimes just stay put another stretch). Actual motion
        // happens via moveTarget on subsequent frames.
        m.roamTimer -= delta;
        if (m.roamTimer <= 0) {
          if (Math.random() < 0.65) {
            m.moveTarget = randomArenaPoint();
          } else {
            m.roamTimer = ROAM_IDLE_MIN + Math.random() * (ROAM_IDLE_MAX - ROAM_IDLE_MIN);
          }
        }
        m.moving = false;
      } else if (e.active) {
        // Patrol along the config axis (u = horizontal, v = vertical),
        // bouncing at the arena edge. The step is the projection of the
        // ACTUAL (lerped) heading, not m.dir directly — so after a bounce the
        // hull decelerates, pivots at the wall, and sails back bow-first
        // instead of sliding stern-first while the 180° turn completes.
        const S = Math.SQRT1_2;
        const u = (m.x - m.z) * S;
        const v = (m.x + m.z) * S;
        if (m.axis === 'v') {
          const lim = ARENA_HALF_V - cfg.margin;
          const fwd = (-Math.sin(m.heading) - Math.cos(m.heading)) * S; // dv of forward
          let nv = v + fwd * spd * delta;
          if (nv > lim) {
            nv = lim;
            m.dir = -1;
          } else if (nv < -lim) {
            nv = -lim;
            m.dir = 1;
          }
          m.x = (u + nv) * S;
          m.z = (nv - u) * S;
        } else {
          const lim = ARENA_HALF_U - cfg.margin;
          const fwd = (-Math.sin(m.heading) + Math.cos(m.heading)) * S; // du of forward
          let nu = u + fwd * spd * delta;
          if (nu > lim) {
            nu = lim;
            m.dir = -1;
          } else if (nu < -lim) {
            nu = -lim;
            m.dir = 1;
          }
          m.x = (nu + v) * S;
          m.z = (v - nu) * S;
        }
        m.moving = true;
        th = patrolHeading(m.axis, m.dir);
      } else {
        m.moving = false;
      }
      let dh = th - m.heading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      m.heading += dh * Math.min(delta * cfg.rotLerp, 1);

      // U-boat only: randomly alternate submerged/surfaced stretches while
      // active (its depth decides whether it can ram — see the ram loop).
      if (e.type === 'submarineIx' && e.active) {
        m.depthTimer -= delta;
        if (m.depthTimer <= 0) {
          m.submerged = !m.submerged;
          m.depthTimer = randDepthTime();
        }
      }
    }

    // --- Destroyer guns: strafe the surfaced sub within range ---
    const warship = warshipId ? game.enemies.find((e) => e.id === warshipId) : undefined;
    const wm = warshipId ? movers[warshipId] : undefined;
    const canFire =
      !!warship &&
      warship.active &&
      !!wm &&
      !game.submerged &&
      !game.gameOver &&
      hexDistTiles(wm.x, wm.z, game.x, game.z) <= config.enemies.warship.range;
    if (canFire && wm) {
      fireCooldown -= delta;
      // Guard against spawning a huge burst after a long frame / tab-restore.
      let guard = 0;
      while (fireCooldown <= 0 && guard < 4) {
        spawnTracer(wm.x, wm.z, game.x, game.z);
        fireCooldown += config.enemies.warship.fireInterval;
        guard++;
      }
      if (fireCooldown < 0) fireCooldown = 0;
    } else {
      fireCooldown = 0;
    }
    if (muzzleFlash > 0) {
      muzzleFlash = Math.max(0, muzzleFlash - delta / MUZZLE_DECAY);
    }
    // Red hit-vignette fade (set to 1 by damageSub, drawn by the HUD).
    if (game.hitFlash > 0) {
      game.hitFlash = Math.max(0, game.hitFlash - delta * 5);
    }
    // Green heal-vignette fade (set to 1 by healSub).
    if (game.healFlash > 0) {
      game.healFlash = Math.max(0, game.healFlash - delta * 3);
    }

    // --- Breach attack: surfacing this frame right under a SURFACED enemy
    // rams it from below — it takes damage + gets flung to an adjacent tile,
    // and the sub takes NONE (this replaces the ram that would otherwise fire
    // now that both are at the surface). ---
    if (prevSubmerged && !game.submerged && !game.gameOver) {
      for (const e of game.enemies) {
        const m = movers[e.id];
        if (!m || m.submerged) continue; // only enemies on the surface
        const dx = m.x - game.x;
        const dz = m.z - game.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < BREACH_RADIUS * BREACH_RADIUS) {
          e.hp -= BREACH_DAMAGE;
          const d = Math.sqrt(d2) || 1;
          const knock = clampToArena(m.x + (dx / d) * BREACH_KNOCK, m.z + (dz / d) * BREACH_KNOCK);
          m.x = knock.x;
          m.z = knock.z;
          m.moveTarget = null; // cancel any glide so the shove sticks
          ramCooldowns[e.id] = RAM_COOLDOWN; // and don't ram the sub this frame
          spawnBlastVisual(m.x, m.z);
        }
      }
    }
    prevSubmerged = game.submerged;

    // --- Ramming: an enemy hull over the sub deals ram damage, but ONLY when
    // both are at the SAME depth level. Surface ships (cargo/warship/bomber)
    // are always surfaced, so they only hit a surfaced sub; the U-boat hits
    // whenever its live depth matches the sub's (both up or both down). ---
    for (const e of game.enemies) {
      const cd = ramCooldowns[e.id] ?? 0;
      if (cd > 0) {
        ramCooldowns[e.id] = cd - delta;
        continue;
      }
      if (game.gameOver) continue;
      const enemySubmerged = DYNAMIC.has(e.type) ? movers[e.id].submerged : false;
      if (enemySubmerged !== game.submerged) continue; // different levels → pass by
      const p = enemyPos(e);
      const dx = p.x - game.x;
      const dz = p.z - game.z;
      if (dx * dx + dz * dz < RAM_RADIUS * RAM_RADIUS) {
        damageSub(config.enemies[e.type].ram, `Te embistió el ${e.name}.`);
        ramCooldowns[e.id] = RAM_COOLDOWN;
      }
    }

    // --- Advance tracers (hit the surfaced sub, OR any enemy in the line of
    // fire except the shooter — friendly fire). ---
    for (const t of tracers) {
      if (!t.active) continue;
      t.x += t.vx * delta;
      t.z += t.vz * delta;
      t.age += delta;
      if (t.age > TRACER_LIFE) {
        t.active = false;
        continue;
      }
      if (!game.submerged) {
        const ddx = t.x - game.x;
        const ddz = t.z - game.z;
        if (ddx * ddx + ddz * ddz < TRACER_HIT_R2) {
          t.active = false;
          damageSub(config.enemies.warship.tracerDamage, 'Las metralletas del destructor acabaron con tu casco.');
          continue;
        }
      }
      for (const e of game.enemies) {
        if (e.id === warshipId) continue; // don't let the destroyer shoot itself
        const m = movers[e.id];
        if (!m) continue;
        const ex = t.x - m.x;
        const ez = t.z - m.z;
        if (ex * ex + ez * ez < TRACER_ENEMY_R2) {
          e.hp -= config.enemies.warship.tracerDamage;
          t.active = false;
          break;
        }
      }
    }

    // --- Bomber: lob a salvo every so often while active ---
    const bomber = bomberId ? game.enemies.find((e) => e.id === bomberId) : undefined;
    const bmm = bomberId ? movers[bomberId] : undefined;
    if (bomber?.active && bmm && !game.gameOver) {
      bombTimer -= delta;
      if (bombTimer <= 0) {
        launchSalvo(bmm.x, bmm.z);
        bombTimer =
          config.enemies.bomber.salvoMin +
          Math.random() * (config.enemies.bomber.salvoMax - config.enemies.bomber.salvoMin);
      }
    }

    // --- Advance bombs (parabolic arc) → explode on landing ---
    for (const b of bombs) {
      if (!b.active) continue;
      b.t += delta;
      if (b.t >= BOMB_FLIGHT) {
        b.active = false;
        spawnBlast(b.tx, b.tz);
      }
    }
    // --- Advance explosions ---
    for (const bl of blasts) {
      if (!bl.active) continue;
      bl.t += delta;
      if (bl.t >= BLAST_DUR) bl.active = false;
    }

    // --- Remove enemies whose hull hit 0 (friendly fire), with a death puff.
    // Backwards splice so indices stay valid. ---
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];
      if (e.hp > 0) continue;
      const m = movers[e.id];
      if (m) spawnBlastVisual(m.x, m.z);
      if (game.selectedEnemyId === e.id) closeEnemyMenu();
      game.enemies.splice(i, 1);
    }

    // --- Health pickups: collect at matching depth; respawn the trio 3 min
    // after it's cleared. ---
    pickupElapsed += delta;
    pickupPulse = Math.sin(pickupElapsed * 2.2);
    if (pickups.some((p) => p.active)) {
      if (!game.gameOver) {
        for (const p of pickups) {
          if (!p.active || p.submerged !== game.submerged) continue;
          const dx = p.x - game.x;
          const dz = p.z - game.z;
          if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
            p.active = false;
            healSub(config.pickup.heal);
          }
        }
        if (!pickups.some((p) => p.active)) pickupRespawnTimer = config.pickup.respawn;
      }
    } else if (!game.gameOver) {
      pickupRespawnTimer -= delta;
      if (pickupRespawnTimer <= 0) spawnPickups();
    }

    // --- Project every enemy to screen space so its HTML health bar can
    // follow it (camera is static, enemies move → reproject each frame). ---
    if (cam) {
      cam.updateMatrixWorld(true);
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      for (const e of game.enemies) {
        const m = movers[e.id];
        if (!m) continue;
        projScratch.set(m.x, 0, m.z).project(cam);
        e.sx = (projScratch.x * 0.5 + 0.5) * window.innerWidth;
        e.sy = (-projScratch.y * 0.5 + 0.5) * window.innerHeight;
      }
    }

    // --- Keep the context menu anchored to the selected enemy each frame so
    // it stays pegged to a patrolling vessel. PAUSED while the pointer is over
    // the menu (game.menuHover) so its buttons stop being a moving target and
    // clicks land reliably. ---
    const c = cam;
    const id = game.selectedEnemyId;
    if (c && id && !game.menuHover) {
      const e = game.enemies.find((x) => x.id === id);
      if (e) {
        const w = enemyPos(e);
        c.updateMatrixWorld(true);
        c.matrixWorldInverse.copy(c.matrixWorld).invert();
        projScratch.set(w.x, 0, w.z).project(c);
        game.menuSx = (projScratch.x * 0.5 + 0.5) * window.innerWidth;
        game.menuSy = (-projScratch.y * 0.5 + 0.5) * window.innerHeight;
      }
    }
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

<!-- Enemy vessels — click one to open its context menu (activate/deactivate). -->
{#each game.enemies as e (e.id)}
  {#if e.type === 'warship'}
    {@const m = movers[e.id]}
    <Warship
      x={m.x}
      z={m.z}
      heading={m.heading}
      moving={m.moving}
      scale={SUB_SCALE}
      onclick={() => selectEnemy(e.id)}
    />
  {:else if e.type === 'cargo'}
    {@const m = movers[e.id]}
    <Cargo
      x={m.x}
      z={m.z}
      heading={m.heading}
      moving={m.moving}
      scale={SUB_SCALE}
      onclick={() => selectEnemy(e.id)}
    />
  {:else if e.type === 'bomber'}
    {@const m = movers[e.id]}
    <Bomber
      x={m.x}
      z={m.z}
      heading={m.heading}
      moving={m.moving}
      scale={SUB_SCALE}
      onclick={() => selectEnemy(e.id)}
    />
  {:else if e.type === 'submarineIx'}
    {@const m = movers[e.id]}
    <SubmarineIX
      x={m.x}
      z={m.z}
      heading={m.heading}
      moving={m.moving}
      submerged={m.submerged}
      scale={SUB_SCALE}
      onclick={() => selectEnemy(e.id)}
    />
  {/if}
{/each}

<!-- Bombs in flight: a dark sphere arcing along a parabola, plus a target
     reticle on the sea marking where it'll land (so the player can dodge). -->
{#each bombs as b}
  {#if b.active}
    {@const p = Math.min(b.t / BOMB_FLIGHT, 1)}
    {@const bx = b.sx + (b.tx - b.sx) * p}
    {@const bz = b.sz + (b.tz - b.sz) * p}
    {@const by = b.sy + (SEA_Y - b.sy) * p + BOMB_ARC_H * 4 * p * (1 - p)}
    <T.Mesh position={[bx, by, bz]} castShadow>
      <T.SphereGeometry args={[0.12, 10, 8]} />
      <T.MeshStandardMaterial color="#15150f" flatShading />
    </T.Mesh>
    <T.Mesh position={[b.tx, SEA_Y + 0.02, b.tz]} rotation={[-Math.PI / 2, 0, 0]}>
      <T.RingGeometry args={[0.55, 0.68, 20]} />
      <T.MeshBasicMaterial color="#e8603a" transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </T.Mesh>
  {/if}
{/each}

<!-- Explosions: an expanding, fading shockwave ring at the impact point. -->
{#each blasts as bl}
  {#if bl.active}
    {@const p = Math.min(bl.t / BLAST_DUR, 1)}
    {@const r = 0.3 + config.enemies.bomber.blastRadius * p}
    <T.Mesh position={[bl.x, SEA_Y + 0.04, bl.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[r, r, r]}>
      <T.RingGeometry args={[0.55, 1.0, 24]} />
      <T.MeshBasicMaterial color="#ffb24a" transparent opacity={(1 - p) * 0.9} depthWrite={false} toneMapped={false} />
    </T.Mesh>
  {/if}
{/each}

<!-- Health pickups: glowing blue orbs. Surfaced ones ride above the water,
     submerged ones sit below the surface as translucent orbs (collect at the
     matching depth). Gentle shared bob/scale pulse. -->
{#each pickups as p}
  {#if p.active}
    {@const py = p.submerged ? 0.3 : 0.55}
    {@const s = 0.27 * (1 + 0.12 * pickupPulse)}
    <T.Mesh position={[p.x, py + 0.04 * pickupPulse, p.z]} scale={[s, s, s]}>
      <T.SphereGeometry args={[1, 16, 12]} />
      <T.MeshStandardMaterial
        color={p.submerged ? '#4fdcff' : '#5fe8ff'}
        emissive={p.submerged ? '#2ab6e6' : '#37c4e6'}
        emissiveIntensity={p.submerged ? 1.2 : 0.7}
        transparent={p.submerged}
        opacity={p.submerged ? 0.75 : 1}
        depthWrite={!p.submerged}
        flatShading
      />
    </T.Mesh>
    {#if p.submerged}
      <!-- Surface marker: a pulsing cyan ring on the water directly above a
           submerged orb so it's easy to spot (dive there to collect it). -->
      {@const mr = 0.6 * (1 + 0.28 * pickupPulse)}
      <T.Mesh position={[p.x, 0.47, p.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[mr, mr, mr]}>
        <T.RingGeometry args={[0.6, 1.0, 24]} />
        <T.MeshBasicMaterial color="#5fe8ff" transparent opacity={0.6} depthWrite={false} toneMapped={false} />
      </T.Mesh>
    {/if}
  {/if}
{/each}

<!-- Destroyer muzzle flash — spikes on each round fired, fades fast. -->
{#if muzzleFlash > 0}
  <T.Mesh position={[muzzleX, GUN_Y, muzzleZ]}>
    <T.SphereGeometry args={[0.3, 8, 8]} />
    <T.MeshBasicMaterial
      color="#ffe08a"
      transparent
      opacity={muzzleFlash}
      depthWrite={false}
      toneMapped={false}
    />
  </T.Mesh>
{/if}

<!-- Machine-gun tracer rounds (pool driven by the useTask above). -->
<Tracers pool={tracers} />

<!-- Invisible sea plane: catches clicks on open water while in Move mode so
     the selected vehicle can be relocated to the click point. -->
<T.Mesh position={[0, 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]} onclick={onGroundClick}>
  <T.PlaneGeometry args={[140, 140]} />
  <T.MeshBasicMaterial transparent opacity={0} depthWrite={false} />
</T.Mesh>
