<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { interactivity } from '@threlte/extras';
  import { untrack } from 'svelte';
  import { BackSide, DoubleSide, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
  import type {
    DirectionalLight as ThreeDirLight,
    OrthographicCamera as ThreeOrthoCam,
    Texture as ThreeTexture,
  } from 'three';
  import Board from './Board.svelte';
  import Submarine from './Submarine.svelte';
  import OceanCurrents from './OceanCurrents.svelte';
  import ArenaFrame from './ArenaFrame.svelte';
  import Warship from './Warship.svelte';
  import SubmarineIX from './SubmarineIX.svelte';
  import Cargo from './Cargo.svelte';
  import Bomber from './Bomber.svelte';
  import Shark from './Shark.svelte';
  import Minelayer from './Minelayer.svelte';
  import Mine from './Mine.svelte';
  import Star from './Star.svelte';
  import XStar from './XStar.svelte';
  import LineStar from './LineStar.svelte';
  import Tracers from './Tracers.svelte';
  import { axialToWorld, worldToAxial, axialRound, buildBoardIsoRect } from './hex';
  import {
    game,
    toggleSubmerged,
    selectEnemy,
    closeEnemyMenu,
    damageSub,
    healSub,
    markMissionWon,
    config,
    type EnemyType,
    type Enemy,
    type Tracer,
  } from './game.svelte';

  // Enables Threlte pointer picking so the enemy meshes' onclick fires.
  interactivity();

  // Enemy stats scaled by the CURRENT mission's power multiplier (harder
  // missions = sharper stats). Panel edits still flow through (base is
  // config.enemies); Scene reads THIS for gameplay. Fields not listed pass
  // through unchanged. Speed is scaled gentler so it stays dodgeable.
  function scaleEnemies(base: typeof config.enemies, power: number) {
    const sp = 1 + (power - 1) * 0.6;
    return {
      warship: {
        ...base.warship,
        ram: base.warship.ram * power,
        speed: base.warship.speed * sp,
        tracerDamage: base.warship.tracerDamage * power,
        fireInterval: base.warship.fireInterval / power,
      },
      cargo: { ...base.cargo, ram: base.cargo.ram * power, speed: base.cargo.speed * sp },
      submarineIx: {
        ...base.submarineIx,
        ram: base.submarineIx.ram * power,
        speed: base.submarineIx.speed * sp,
      },
      bomber: {
        ...base.bomber,
        ram: base.bomber.ram * power,
        speed: base.bomber.speed * sp,
        bombDamage: base.bomber.bombDamage * power,
        salvoMin: base.bomber.salvoMin / power,
        salvoMax: base.bomber.salvoMax / power,
      },
      shark: {
        ...base.shark,
        ram: base.shark.ram * power,
        speed: base.shark.speed * sp,
        torpedoDamage: base.shark.torpedoDamage * power,
        torpedoInterval: base.shark.torpedoInterval / power,
      },
      minelayer: {
        ...base.minelayer,
        ram: base.minelayer.ram * power,
        speed: base.minelayer.speed * sp,
        mineDamage: base.minelayer.mineDamage * power,
        dropInterval: base.minelayer.dropInterval / power,
      },
    };
  }
  const ep = $derived(scaleEnemies(config.enemies, game.missionPower));

  // The current mission's bonus (power-up) counts — how many of each liberator
  // spawn. Admin-controlled per mission (config.missionBonuses), 0 if none.
  const bonuses = $derived(
    config.missionBonuses[game.level - 1] ?? { line: 0, xstar: 0, star: 0 }
  );

  // --- Arena image (the city's image #1, revealed as tiles are covered) ---
  // Fetch the current city's slot-1 filename, load it as a texture, and show it
  // under the tiles. Board hides visited tiles so the picture shows through.
  // Must sit BELOW the lowest tile top: tops bob 0.4 ± wave(0.06) = 0.34..0.46,
  // so a plane above 0.34 pokes through the wave troughs (image bleeds in bands).
  const ARENA_IMG_Y = 0.28;
  let arenaTex = $state.raw<ThreeTexture | undefined>(undefined);
  $effect(() => {
    const n = game.missionCityN;
    const a = game.arena; // this arena's image = slot #a
    arenaTex = undefined;
    if (!n) return;
    let cancelled = false;
    let loaded: ThreeTexture | undefined;
    fetch(`/api/cities/${n}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const f = d?.slots?.[a - 1];
        if (cancelled || !f) return;
        new TextureLoader().load(`/api/cities/${n}/${f}`, (tex) => {
          if (cancelled) {
            tex.dispose();
            return;
          }
          tex.colorSpace = SRGBColorSpace;
          // "cover" fit: preserve the image's aspect ratio, fill the (square)
          // arena and crop the overflow — no stretching, whatever size uploaded.
          const img = tex.image as { width: number; height: number };
          const imgAspect = img.width / img.height;
          const planeAspect = ARENA_IMG_HALF_U / ARENA_IMG_HALF_V; // ~1 (square)
          tex.center.set(0.5, 0.5);
          if (imgAspect > planeAspect) {
            tex.repeat.set(planeAspect / imgAspect, 1); // wide image → crop sides
          } else {
            tex.repeat.set(1, imgAspect / planeAspect); // tall image → crop top/bottom
          }
          loaded = tex;
          arenaTex = tex;
        });
      })
      .catch(() => {});
    // Free the previous mission's texture on switch/unmount (frees GPU memory).
    return () => {
      cancelled = true;
      loaded?.dispose();
    };
  });

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
  // City-image extent: kept INSIDE the tile coverage (a hair under ARENA_HALF)
  // so at the start every part of the image sits under a tile — nothing peeks
  // out around the edges. (Reaching the frame would expose the photo's border.)
  const ARENA_IMG_HALF_U = ARENA_HALF_U - 1;
  const ARENA_IMG_HALF_V = ARENA_HALF_V - 1;

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

  // How far inside the tile rect the sub's CENTER is kept. It must be small
  // enough that the sub can still snap onto the OUTERMOST tiles — otherwise a
  // ring of edge cells is unreachable (at 1.5, 6/363 tiles couldn't be covered;
  // anything ≤ ~1.1 reaches them all). 0.8 clears every tile with margin, and
  // the hull (tip ~0.65 past center) still stops far short of the frame (~21.3).
  const EDGE_MARGIN = 0.8;
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
  // Player turn rate / speed live in config.sub (tunable from the panel).

  // --- Keyboard state ---
  // Plain object mutated by the listeners and read in useTask — no
  // reactivity needed, the physics polls it every frame.
  const keys = { up: false, down: false, left: false, right: false, m: false };

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
            coverCurrentTile();
            toggleSubmerged();
          }
          e.preventDefault();
          break;
        case 'm':
        case 'M':
          keys.m = true;
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
        case 'm':
        case 'M':
          keys.m = false;
          break;
      }
    };
    // If the window loses focus mid-press (alt-tab, click outside), the
    // matching keyup never arrives and the sub would sail on its own.
    // Reset everything on blur / tab-hide.
    const resetKeys = () => {
      keys.up = keys.down = keys.left = keys.right = keys.m = false;
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
    // "Mayor velocidad" ability: multiply the base speed while enabled. Guard
    // mult > 0 so an emptied/zeroed panel field (yields null) can't freeze the
    // sub — it just falls back to the base speed until a number is typed.
    const boost = config.player.speedBoost;
    const subSpeed = config.sub.speed * (boost.enabled && boost.mult > 0 ? boost.mult : 1);
    if (alive && keys.left) game.heading += config.sub.turnRate * delta;
    if (alive && keys.right) game.heading -= config.sub.turnRate * delta;

    let speed = 0;
    // Same speed surfaced or submerged, forward or reverse (no penalties).
    if (alive && keys.up) speed += subSpeed;
    if (alive && keys.down) speed -= subSpeed;

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
    shark: { behavior: 'patrol', margin: 2.0, rotLerp: 6 },
    // Small ship that patrols a line, laying mines along its path.
    minelayer: { behavior: 'patrol', margin: 2.0, rotLerp: 6 },
  };
  // Enemy types that dive/surface at random (and stay hidden as translucent
  // silhouettes while down).
  const DIVING = new Set<EnemyType>(['submarineIx', 'shark']);
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
    submerged: boolean; // U-boat / shark toggle this
    depthTimer: number; // seconds until the next depth flip (U-boat / shark)
    roamTimer: number; // seconds of idle left before the next roam (bomber)
    torpedoTimer: number; // seconds until the next torpedo (shark, while down)
    aimHeading: number; // rotation.y the submerged shark turns toward (fires along its bow)
    mineTimer: number; // seconds until the next mine dropped (minelayer)
    // Minelayer patrol line: a unit travel direction in the u/v frame (any
    // orientation — horizontal, vertical or diagonal), reflected off the walls.
    lineU: number;
    lineV: number;
    minesLaid: number; // mines dropped on the CURRENT line so far
    gunCooldown: number; // seconds until the next tracer (each warship)
    bombTimer: number; // seconds until the next salvo (each bomber)
  };
  // A random straight-line orientation for the minelayer, as a unit direction
  // in the camera-aligned u/v frame: horizontal (u), vertical (v), or one of
  // the two diagonals (world-x / world-z). Random travel sign.
  function randomLine() {
    const S = Math.SQRT1_2;
    const dirs = [
      { u: 1, v: 0 }, // horizontal on screen
      { u: 0, v: 1 }, // vertical on screen
      { u: S, v: S }, // diagonal (along world x)
      { u: S, v: -S }, // diagonal (along world z)
    ];
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    const sign = Math.random() < 0.5 ? 1 : -1;
    return { u: d.u * sign, v: d.v * sign };
  }
  // Depth-segment duration for a diving type (U-boat or shark).
  function randDepthTime(type: EnemyType) {
    const c = type === 'shark' ? config.enemies.shark : config.enemies.submarineIx;
    return c.depthMin + Math.random() * (c.depthMax - c.depthMin);
  }
  function newMover(e: Enemy): Mover {
    const w = axialToWorld(e.q, e.r, TILE_SIZE);
    // Random patrol axis for this match (line-movers only; unused for the
    // roaming bomber).
    const axis: 'u' | 'v' = Math.random() < 0.5 ? 'u' : 'v';
    const line = randomLine();
    return {
      x: w.x,
      z: w.z,
      axis,
      heading: patrolHeading(axis, 1),
      dir: 1,
      moving: false,
      moveTarget: null,
      submerged: false,
      depthTimer: randDepthTime(e.type),
      roamTimer: ROAM_IDLE_MIN + Math.random() * (ROAM_IDLE_MAX - ROAM_IDLE_MIN),
      torpedoTimer: config.enemies.shark.torpedoInterval,
      aimHeading: Math.random() * Math.PI * 2,
      mineTimer: config.enemies.minelayer.dropInterval,
      lineU: line.u,
      lineV: line.v,
      minesLaid: 0,
      gunCooldown: 0,
      // Desync multiple bombers so their salvos don't land in lockstep.
      bombTimer:
        config.enemies.bomber.salvoMin +
        Math.random() * (config.enemies.bomber.salvoMax - config.enemies.bomber.salvoMin),
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
      // A regenerated roster starts on a clean board — wipe the old minefield
      // and stars (they respawn fresh next frame).
      for (const mn of mines) mn.active = false;
      for (const s of stars) s.active = false;
      starRespawnTimer = 0;
      for (const s of xstars) s.active = false;
      xstarRespawnTimer = 0;
      for (const s of linestars) s.active = false;
      linestarRespawnTimer = 0;
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
  let muzzleFlash = $state(0);
  let muzzleX = $state(0);
  let muzzleZ = $state(0);

  // On revive (Reintentar → gameOver flips back to false), clear any rounds
  // still in flight from the previous life: the pool is Scene-local, so
  // resetGame() can't reach it, and a stale tracer crossing the arena center
  // would otherwise chip the freshly reset hull. Harmless on mount (pool
  // starts inactive).
  $effect(() => {
    if (!game.gameOver) {
      for (const t of tracers) t.active = false;
      for (const t of torpedoes) t.active = false;
      for (const mi of missiles) mi.active = false;
      missileCooldown = 0;
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
  // Salvo interval / size / bomb damage / blast radius live in
  // config.enemies.bomber (tunable). The rest are structural. Each bomber keeps
  // its OWN salvo timer in its mover (m.bombTimer).
  const BOMB_FLIGHT = 1.35; // seconds per arc
  const BOMB_LAUNCH_Y = 0.7; // launch height (bomber deck)
  const BOMB_ARC_H = 2.6; // parabola peak height above the straight line
  const SEA_Y = 0.42; // impact / sea-surface height
  const BLAST_DUR = 0.5; // explosion visual lifetime (s)

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
      // Each bomb targets an independent RANDOM point in the arena (not the
      // sub) — so a salvo scatters over 5 distinct spots.
      const p = randomArenaPoint();
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
    const dmg = ep.bomber.bombDamage;
    const r = ep.bomber.blastRadius;
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

  // --- Shark torpedoes ---
  // Straight-line underwater projectiles fired by a submerged shark in random
  // directions. They cross the arena and only hit the sub when it is SUBMERGED
  // (same depth) and in the line. A surface wake streak marks each one.
  const TORPEDO_HIT_R2 = 0.6 * 0.6;
  const TORPEDO_Y = 0.47; // render height (just at the surface, above the tiles)
  type Torpedo = { active: boolean; x: number; z: number; vx: number; vz: number };
  const torpedoes = $state<Torpedo[]>(
    Array.from({ length: 16 }, () => ({ active: false, x: 0, z: 0, vx: 0, vz: 0 }))
  );
  const TORPEDO_LAUNCH_OFFSET = 1.3; // emerge from the shark's bow, not its center
  function launchTorpedo(x: number, z: number, dirX: number, dirZ: number) {
    const t = torpedoes.find((p) => !p.active);
    if (!t) return;
    const spd = config.enemies.shark.torpedoSpeed;
    t.active = true;
    t.x = x + dirX * TORPEDO_LAUNCH_OFFSET;
    t.z = z + dirZ * TORPEDO_LAUNCH_OFFSET;
    t.vx = dirX * spd;
    t.vz = dirZ * spd;
  }

  // --- Minelayer mines ---
  // Floating contact mines dropped by the minelayer. They sit where dropped and
  // detonate on contact with the sub at ANY depth (above or below). The pool is
  // sized with headroom; the live cap is config.enemies.minelayer.maxMines.
  const MINE_HIT_R2 = 0.85 * 0.85;
  type Mine = { active: boolean; x: number; z: number };
  const mines = $state<Mine[]>(
    Array.from({ length: 16 }, () => ({ active: false, x: 0, z: 0 }))
  );
  function activeMineCount() {
    let n = 0;
    for (const m of mines) if (m.active) n++;
    return n;
  }
  // Drop a mine at (x, z) unless the arena is already at the cap. Returns
  // whether one was actually laid.
  function dropMine(x: number, z: number) {
    if (activeMineCount() >= config.enemies.minelayer.maxMines) return false;
    const m = mines.find((p) => !p.active);
    if (!m) return false;
    m.active = true;
    m.x = x;
    m.z = z;
    return true;
  }

  // --- Player missiles (M key ability) ---
  // Straight-line projectiles fired from the sub's bow; they damage the first
  // enemy they cross (at any depth) and expire at the arena frame.
  const MISSILE_HIT_R2 = 0.9 * 0.9;
  const MISSILE_Y = 0.6; // render height (rides above the surface)
  const MISSILE_LAUNCH_OFFSET = 0.9; // spawn a bit ahead of the bow
  type Missile = { active: boolean; x: number; z: number; vx: number; vz: number };
  const missiles = $state<Missile[]>(
    Array.from({ length: 12 }, () => ({ active: false, x: 0, z: 0, vx: 0, vz: 0 }))
  );
  let missileCooldown = 0;
  function launchMissile() {
    const mi = missiles.find((p) => !p.active);
    if (!mi) return;
    const spd = config.player.missiles.speed;
    // Don't spawn a stationary missile if the speed field is empty/0 — it would
    // never move, never reach the frame to expire, and clog the pool.
    if (!(spd > 0)) return;
    const fx = -Math.sin(game.heading);
    const fz = -Math.cos(game.heading);
    mi.active = true;
    mi.x = game.x + fx * MISSILE_LAUNCH_OFFSET;
    mi.z = game.z + fz * MISSILE_LAUNCH_OFFSET;
    mi.vx = fx * spd;
    mi.vz = fz * spd;
  }

  // --- Health pickups ---
  // Three blue orbs (each randomly submerged or surfaced) appear on the board;
  // touching one AT THE SAME DEPTH heals the sub. Once all three are taken, a
  // 3-minute timer runs before a fresh trio appears.
  const PICKUP_POOL = 12; // max active health orbs (per-mission count ≤ this)
  const PICKUP_RADIUS = 1.1;
  // Heal amount / respawn delay live in config.pickup; the COUNT is per-mission
  // (bonuses.health).
  type Pickup = { active: boolean; x: number; z: number; submerged: boolean };
  const pickups = $state<Pickup[]>(
    Array.from({ length: PICKUP_POOL }, () => ({ active: false, x: 0, z: 0, submerged: false }))
  );
  let pickupRespawnTimer = 0; // counts down while the set is cleared
  let pickupElapsed = 0;
  let pickupPulse = $state(0); // shared gentle bob/scale pulse

  // Spawn the mission's health-orb count at random points; deactivate the rest.
  function spawnPickups() {
    const count = Math.max(0, Math.min(pickups.length, Math.round(bonuses.health)));
    for (let i = 0; i < pickups.length; i++) {
      if (i < count) {
        const pt = randomArenaPoint();
        pickups[i].active = true;
        pickups[i].x = pt.x;
        pickups[i].z = pt.z;
        pickups[i].submerged = Math.random() < 0.5;
      } else {
        pickups[i].active = false;
      }
    }
  }

  // --- Star power-ups (liberate the asterisk of lines) ---
  // Valid tile keys of the board (same cells as Board.svelte builds) — so
  // liberateAsterisk only ever marks REAL tiles and visitedCount stays honest.
  const boardKeys = new Set(
    buildBoardIsoRect(ARENA_HALF_U, ARENA_HALF_V, TILE_SIZE, 7, 0.4).map((c) => `${c.q},${c.r}`)
  );
  const STAR_RADIUS2 = 1.1 * 1.1; // collect radius (XZ), any depth
  type Star = { active: boolean; x: number; z: number };
  const stars = $state<Star[]>(
    Array.from({ length: 8 }, () => ({ active: false, x: 0, z: 0 }))
  );
  let starRespawnTimer = 0;

  // Spawn the mission's star count on random tile centers; deactivate the rest.
  function spawnStars() {
    const count = Math.max(0, Math.min(stars.length, Math.round(bonuses.star)));
    for (let i = 0; i < stars.length; i++) {
      if (i < count) {
        const p = randomArenaPoint();
        const raw = worldToAxial(p.x, p.z, TILE_SIZE);
        const a = axialRound(raw.q, raw.r);
        const w = axialToWorld(a.q, a.r, TILE_SIZE);
        stars[i].active = true;
        stars[i].x = w.x;
        stars[i].z = w.z;
      } else {
        stars[i].active = false;
      }
    }
  }

  // X power-ups: same collectible pattern, but each liberates only the two
  // perpendicular lines of an X at its OWN random angle.
  type XStar = { active: boolean; x: number; z: number; angle: number };
  const xstars = $state<XStar[]>(
    Array.from({ length: 8 }, () => ({ active: false, x: 0, z: 0, angle: 0 }))
  );
  let xstarRespawnTimer = 0;
  function spawnXStars() {
    const count = Math.max(0, Math.min(xstars.length, Math.round(bonuses.xstar)));
    for (let i = 0; i < xstars.length; i++) {
      if (i < count) {
        const p = randomArenaPoint();
        const raw = worldToAxial(p.x, p.z, TILE_SIZE);
        const a = axialRound(raw.q, raw.r);
        const w = axialToWorld(a.q, a.r, TILE_SIZE);
        xstars[i].active = true;
        xstars[i].x = w.x;
        xstars[i].z = w.z;
        xstars[i].angle = Math.random() * Math.PI * 2; // any orientation
      } else {
        xstars[i].active = false;
      }
    }
  }

  // Line power-ups: same pattern, liberate a single line at a random angle.
  type LineStar = { active: boolean; x: number; z: number; angle: number };
  const linestars = $state<LineStar[]>(
    Array.from({ length: 8 }, () => ({ active: false, x: 0, z: 0, angle: 0 }))
  );
  let linestarRespawnTimer = 0;
  function spawnLineStars() {
    const count = Math.max(0, Math.min(linestars.length, Math.round(bonuses.line)));
    for (let i = 0; i < linestars.length; i++) {
      if (i < count) {
        const p = randomArenaPoint();
        const raw = worldToAxial(p.x, p.z, TILE_SIZE);
        const a = axialRound(raw.q, raw.r);
        const w = axialToWorld(a.q, a.r, TILE_SIZE);
        linestars[i].active = true;
        linestars[i].x = w.x;
        linestars[i].z = w.z;
        linestars[i].angle = Math.random() * Math.PI * 2; // any orientation
      } else {
        linestars[i].active = false;
      }
    }
  }

  // Mark VISITED every real tile along the star's 4 screen lines (the asterisk):
  // horizontal (const v), vertical (const u) and both diagonals (world x / z).
  // Walk each of the 8 rays step by step from the star, snapping to the nearest
  // hex, so the lines are contiguous with no gaps.
  const ASTERISK_DIRS: [number, number][] = [
    [1, -1], [-1, 1], // screen horizontal (const v)
    [1, 1], [-1, -1], // screen vertical (const u)
    [1, 0], [-1, 0], // screen diagonal (world x-axis)
    [0, 1], [0, -1], // screen diagonal (world z-axis)
  ];
  function markTileAt(wx: number, wz: number) {
    const raw = worldToAxial(wx, wz, TILE_SIZE);
    const a = axialRound(raw.q, raw.r);
    const key = `${a.q},${a.r}`;
    if (boardKeys.has(key) && !game.visited.has(key)) {
      game.visited.add(key);
      game.visitedCount++;
    }
  }
  // Mark a tile by axial (q,r) directly — guarded to REAL cells so visitedCount
  // stays honest (off-board keys are ignored). Used to cover the sub's tile and,
  // in "Modo Amplio", its 6 hex neighbors.
  function markTileAxial(q: number, r: number) {
    const key = `${q},${r}`;
    if (boardKeys.has(key) && !game.visited.has(key)) {
      game.visited.add(key);
      game.visitedCount++;
    }
  }
  // The 6 immediate pointy-top hex neighbors (axial deltas).
  const HEX_NEIGHBORS: [number, number][] = [
    [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
  ];
  // Cover the tile under the sub (+ its 6 neighbors when Modo Amplio is on).
  // Goes through the boardKeys-guarded marker: near the arena edge the sub's
  // snapped tile can resolve OFF-board (clamp margin < hex circumradius), and an
  // unguarded mark would inflate visitedCount and win below the set coverage.
  function coverCurrentTile() {
    const q = game.currentTileQ;
    const r = game.currentTileR;
    markTileAxial(q, r);
    if (config.rules.wideMode) {
      for (const [dq, dr] of HEX_NEIGHBORS) markTileAxial(q + dq, r + dr);
    }
  }
  // Walk each ray direction (world XZ) from (sx,sz), snapping to the nearest hex
  // each small step, marking every real tile until it leaves the arena — so the
  // lines are contiguous with no gaps. Also marks the origin tile.
  function liberateRays(sx: number, sz: number, dirs: [number, number][]) {
    const S = Math.SQRT1_2;
    const step = TILE_SIZE * 0.3;
    const reach = (ARENA_HALF_U + ARENA_HALF_V) * 2;
    markTileAt(sx, sz);
    for (const [dx, dz] of dirs) {
      const len = Math.hypot(dx, dz);
      const nx = dx / len;
      const nz = dz / len;
      for (let t = step; t <= reach; t += step) {
        const wx = sx + nx * t;
        const wz = sz + nz * t;
        const u = (wx - wz) * S;
        const v = (wx + wz) * S;
        if (Math.abs(u) > ARENA_HALF_U || Math.abs(v) > ARENA_HALF_V) break;
        markTileAt(wx, wz);
      }
    }
  }
  // Star: all 4 screen lines (H, V, both diagonals) — the full asterisk.
  function liberateAsterisk(sx: number, sz: number) {
    liberateRays(sx, sz, ASTERISK_DIRS);
  }
  // X: just the two perpendicular lines of an X, rotated to an arbitrary angle
  // theta (bars along local X and local Z under a Y-rotation of theta).
  function liberateX(sx: number, sz: number, theta: number) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    liberateRays(sx, sz, [
      [c, -s],
      [-c, s],
      [s, c],
      [-s, -c],
    ]);
  }
  // Line: a single line through the point, rotated to an arbitrary angle theta.
  function liberateLine(sx: number, sz: number, theta: number) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    liberateRays(sx, sz, [
      [c, -s],
      [-c, s],
    ]);
  }

  // On revive, clear in-flight bombs / explosions from the previous life so a
  // stale bomb can't blast the freshly reset hull (same rationale as tracers).
  // Also reset pickups so a fresh trio spawns next frame.
  $effect(() => {
    if (!game.gameOver) {
      for (const b of bombs) b.active = false;
      for (const bl of blasts) bl.active = false;
      for (const mn of mines) mn.active = false;
      for (const p of pickups) p.active = false;
      pickupRespawnTimer = 0;
      for (const s of stars) s.active = false;
      starRespawnTimer = 0;
      for (const s of xstars) s.active = false;
      xstarRespawnTimer = 0;
      for (const s of linestars) s.active = false;
      linestarRespawnTimer = 0;
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

  function spawnTracer(sx: number, sz: number, tx: number, tz: number, owner: string) {
    const t = tracers.find((p) => !p.active);
    if (!t) return;
    t.owner = owner;
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
    // --- Player missiles: fire with M while the ability is on (auto-repeats at
    // the configured interval while held). ---
    if (missileCooldown > 0) missileCooldown -= delta;
    if (config.player.missiles.enabled && keys.m && !game.gameOver && missileCooldown <= 0) {
      launchMissile();
      missileCooldown = Math.max(0.1, config.player.missiles.interval);
    }

    // --- Dynamic enemy motion (all enemies: cargo, warship, U-boat, bomber) ---
    for (const e of game.enemies) {
      if (!DYNAMIC.has(e.type)) continue;
      const m = movers[e.id];
      const cfg = MOVER_CFG[e.type];
      if (!m || !cfg) continue;
      const spd = ep[e.type].speed; // tunable per-enemy speed, scaled by mission power
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
      } else if (e.type === 'shark' && e.active && m.submerged) {
        // Submerged shark: turn toward a random bearing and prowl forward, so
        // its torpedoes always leave the BOW (fired below along m.heading).
        th = m.aimHeading;
        const fwdX = -Math.sin(m.heading);
        const fwdZ = -Math.cos(m.heading);
        const p = clampToArena(m.x + fwdX * spd * 0.7 * delta, m.z + fwdZ * spd * 0.7 * delta);
        m.x = p.x;
        m.z = p.z;
        m.moving = true;
      } else if (e.type === 'minelayer' && e.active) {
        // Minelayer: sail a straight line of ANY orientation (H / V / diagonal),
        // reflecting off the arena walls, laying mines along it. It keeps working
        // this line until it has laid its full capacity (see the drop block
        // below), then picks a fresh random line.
        const S = Math.SQRT1_2;
        const uLim = ARENA_HALF_U - cfg.margin;
        const vLim = ARENA_HALF_V - cfg.margin;
        let u = (m.x - m.z) * S;
        let v = (m.x + m.z) * S;
        u += m.lineU * spd * delta;
        v += m.lineV * spd * delta;
        // Reflect at the walls (flip the component's sign) so it bounces along.
        if (u > uLim) {
          u = uLim;
          m.lineU = -Math.abs(m.lineU);
        } else if (u < -uLim) {
          u = -uLim;
          m.lineU = Math.abs(m.lineU);
        }
        if (v > vLim) {
          v = vLim;
          m.lineV = -Math.abs(m.lineV);
        } else if (v < -vLim) {
          v = -vLim;
          m.lineV = Math.abs(m.lineV);
        }
        m.x = (u + v) * S;
        m.z = (v - u) * S;
        m.moving = true;
        // Face travel direction: world vel = ((du+dv)/√2, (dv−du)/√2), bow = −Z.
        const vx = (m.lineU + m.lineV) * S;
        const vz = (m.lineV - m.lineU) * S;
        th = Math.atan2(-vx, -vz);
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

      // Diving subs (U-boat / shark): randomly alternate submerged/surfaced
      // stretches while active (depth decides whether they can ram).
      if (DIVING.has(e.type) && e.active) {
        m.depthTimer -= delta;
        if (m.depthTimer <= 0) {
          m.submerged = !m.submerged;
          m.depthTimer = randDepthTime(e.type);
        }
      }

      // Shark: while submerged, fire a torpedo out its BOW, then pick a new
      // bearing to turn toward for the next shot (varies direction over time).
      if (e.type === 'shark' && e.active && m.submerged && !game.gameOver) {
        m.torpedoTimer -= delta;
        if (m.torpedoTimer <= 0) {
          const fwdX = -Math.sin(m.heading);
          const fwdZ = -Math.cos(m.heading);
          launchTorpedo(m.x, m.z, fwdX, fwdZ);
          m.aimHeading = Math.random() * Math.PI * 2;
          // floor guard: a 0 typed in the panel would otherwise fire every frame
          m.torpedoTimer = Math.max(0.1, ep.shark.torpedoInterval);
        }
      } else if (e.type === 'shark') {
        // Don't let the timer run down while surfaced; fire soon after diving.
        m.torpedoTimer = Math.min(m.torpedoTimer, ep.shark.torpedoInterval);
      }

      // Minelayer: drop a floating mine on an interval, capped at maxMines.
      // It stays on its current line until it has laid a FULL complement
      // (maxMines) there — i.e. exhausted its laying capacity — then swings onto
      // a fresh random line. While at the arena cap (no free slot) it just keeps
      // re-covering the same line, waiting for the sub to detonate one.
      if (e.type === 'minelayer' && e.active && !game.gameOver) {
        m.mineTimer -= delta;
        if (m.mineTimer <= 0) {
          if (dropMine(m.x, m.z)) {
            m.minesLaid++;
            // floor guard: a 0 typed in the panel would otherwise drop every frame
            m.mineTimer = Math.max(0.1, ep.minelayer.dropInterval);
            if (m.minesLaid >= config.enemies.minelayer.maxMines) {
              const ln = randomLine();
              m.lineU = ln.u;
              m.lineV = ln.v;
              m.minesLaid = 0;
            }
          } else {
            m.mineTimer = 0; // at the cap — keep re-covering this line, wait for a slot
          }
        }
      }
    }

    // --- Destroyer guns: EVERY active warship strafes the surfaced sub when
    // it's within range, each on its own cooldown. ---
    for (const e of game.enemies) {
      if (e.type !== 'warship' || !e.active) continue;
      const wm = movers[e.id];
      if (!wm) continue;
      const canFire =
        !game.submerged &&
        !game.gameOver &&
        hexDistTiles(wm.x, wm.z, game.x, game.z) <= ep.warship.range;
      if (canFire) {
        wm.gunCooldown -= delta;
        // Guard against spawning a huge burst after a long frame / tab-restore.
        let guard = 0;
        while (wm.gunCooldown <= 0 && guard < 4) {
          spawnTracer(wm.x, wm.z, game.x, game.z, e.id);
          wm.gunCooldown += Math.max(0.02, ep.warship.fireInterval);
          guard++;
        }
        if (wm.gunCooldown < 0) wm.gunCooldown = 0;
      } else {
        wm.gunCooldown = 0;
      }
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
        damageSub(ep[e.type].ram, `Te embistió el ${e.name}.`);
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
          damageSub(ep.warship.tracerDamage, 'Las metralletas del destructor acabaron con tu casco.');
          continue;
        }
      }
      for (const e of game.enemies) {
        if (e.id === t.owner) continue; // don't let a warship shoot itself
        const m = movers[e.id];
        if (!m) continue;
        const ex = t.x - m.x;
        const ez = t.z - m.z;
        if (ex * ex + ez * ez < TRACER_ENEMY_R2) {
          e.hp -= ep.warship.tracerDamage;
          t.active = false;
          break;
        }
      }
    }

    // --- Bomber: EVERY active bomber lobs salvos on its own timer. ---
    if (!game.gameOver) {
      for (const e of game.enemies) {
        if (e.type !== 'bomber' || !e.active) continue;
        const bmm = movers[e.id];
        if (!bmm) continue;
        bmm.bombTimer -= delta;
        if (bmm.bombTimer <= 0) {
          launchSalvo(bmm.x, bmm.z);
          bmm.bombTimer =
            ep.bomber.salvoMin + Math.random() * Math.max(0, ep.bomber.salvoMax - ep.bomber.salvoMin);
        }
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

    // --- Advance torpedoes: straight line until they exit the arena; hit the
    // sub only when it's SUBMERGED and in the path. ---
    for (const t of torpedoes) {
      if (!t.active) continue;
      t.x += t.vx * delta;
      t.z += t.vz * delta;
      // Expire at the arena frame (a rectangle in the rotated u/v frame), NOT
      // an axis-aligned x/z box — otherwise it stays visible past the frame.
      const tu = (t.x - t.z) * Math.SQRT1_2;
      const tv = (t.x + t.z) * Math.SQRT1_2;
      if (Math.abs(tu) > FRAME_U || Math.abs(tv) > FRAME_V) {
        t.active = false;
        continue;
      }
      if (game.submerged && !game.gameOver) {
        const dx = t.x - game.x;
        const dz = t.z - game.z;
        if (dx * dx + dz * dz < TORPEDO_HIT_R2) {
          t.active = false;
          damageSub(ep.shark.torpedoDamage, 'Un torpedo del Tiburón te alcanzó.');
        }
      }
    }

    // --- Advance player missiles: straight line; damage the first enemy in
    // range (any depth), then expire. Also expire at the arena frame. ---
    for (const mi of missiles) {
      if (!mi.active) continue;
      mi.x += mi.vx * delta;
      mi.z += mi.vz * delta;
      const mu = (mi.x - mi.z) * Math.SQRT1_2;
      const mv = (mi.x + mi.z) * Math.SQRT1_2;
      if (Math.abs(mu) > FRAME_U || Math.abs(mv) > FRAME_V) {
        mi.active = false;
        continue;
      }
      for (const e of game.enemies) {
        const m = movers[e.id];
        if (!m) continue;
        const dx = mi.x - m.x;
        const dz = mi.z - m.z;
        if (dx * dx + dz * dz < MISSILE_HIT_R2) {
          e.hp -= config.player.missiles.damage;
          spawnBlastVisual(mi.x, mi.z);
          mi.active = false;
          break;
        }
      }
    }

    // --- Mines: floating contact hazards. Detonate on contact with the sub at
    // ANY depth (above or below), damaging it and clearing that mine (which
    // frees a slot for the minelayer to lay another). ---
    if (!game.gameOver) {
      for (const mn of mines) {
        if (!mn.active) continue;
        const dx = mn.x - game.x;
        const dz = mn.z - game.z;
        if (dx * dx + dz * dz < MINE_HIT_R2) {
          mn.active = false;
          spawnBlastVisual(mn.x, mn.z);
          damageSub(ep.minelayer.mineDamage, 'Chocaste con una mina.');
        }
      }
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
            healSub(config.rules.heal);
          }
        }
        if (!pickups.some((p) => p.active)) pickupRespawnTimer = config.rules.respawn.health;
      }
    } else if (!game.gameOver && bonuses.health > 0) {
      pickupRespawnTimer -= delta;
      if (pickupRespawnTimer <= 0) spawnPickups();
    }

    // --- Star power-ups: collect on proximity (any depth) → liberate the
    // asterisk of lines; respawn the set a while after it's cleared. ---
    if (stars.some((s) => s.active)) {
      if (!game.gameOver) {
        for (const s of stars) {
          if (!s.active) continue;
          const dx = s.x - game.x;
          const dz = s.z - game.z;
          if (dx * dx + dz * dz < STAR_RADIUS2) {
            s.active = false;
            liberateAsterisk(s.x, s.z);
            spawnBlastVisual(s.x, s.z);
            game.healFlash = Math.max(game.healFlash, 0.6); // brief golden-ish flash
          }
        }
        if (!stars.some((s) => s.active)) starRespawnTimer = config.rules.respawn.star;
      }
    } else if (!game.gameOver && bonuses.star > 0) {
      starRespawnTimer -= delta;
      if (starRespawnTimer <= 0) spawnStars();
    }

    // --- X power-ups: collect on proximity (any depth) → liberate the two
    // diagonal lines of the X at its angle; respawn a while after cleared. ---
    if (xstars.some((s) => s.active)) {
      if (!game.gameOver) {
        for (const s of xstars) {
          if (!s.active) continue;
          const dx = s.x - game.x;
          const dz = s.z - game.z;
          if (dx * dx + dz * dz < STAR_RADIUS2) {
            s.active = false;
            liberateX(s.x, s.z, s.angle);
            spawnBlastVisual(s.x, s.z);
          }
        }
        if (!xstars.some((s) => s.active)) xstarRespawnTimer = config.rules.respawn.xstar;
      }
    } else if (!game.gameOver && bonuses.xstar > 0) {
      xstarRespawnTimer -= delta;
      if (xstarRespawnTimer <= 0) spawnXStars();
    }

    // --- Line power-ups: collect on proximity (any depth) → liberate a single
    // line at its angle; respawn a while after cleared. ---
    if (linestars.some((s) => s.active)) {
      if (!game.gameOver) {
        for (const s of linestars) {
          if (!s.active) continue;
          const dx = s.x - game.x;
          const dz = s.z - game.z;
          if (dx * dx + dz * dz < STAR_RADIUS2) {
            s.active = false;
            liberateLine(s.x, s.z, s.angle);
            spawnBlastVisual(s.x, s.z);
          }
        }
        if (!linestars.some((s) => s.active)) linestarRespawnTimer = config.rules.respawn.line;
      }
    } else if (!game.gameOver && bonuses.line > 0) {
      linestarRespawnTimer -= delta;
      if (linestarRespawnTimer <= 0) spawnLineStars();
    }

    // --- Win: at config.rules.winPct coverage the mission is complete — liberate every
    // remaining tile and raise the "Felicitaciones" banner (the sub is made
    // invincible in damageSub once won). ---
    if (
      !game.won &&
      !game.gameOver &&
      game.totalTiles > 0 &&
      game.visitedCount / game.totalTiles >= config.rules.winPct
    ) {
      for (const key of boardKeys) {
        if (!game.visited.has(key)) {
          game.visited.add(key);
          game.visitedCount++;
        }
      }
      markMissionWon();
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

<!-- City image beneath the tiles — revealed hex by hex as they're covered. -->
{#if arenaTex}
  <T.Group rotation={[0, Math.PI / 4, 0]}>
    <T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, ARENA_IMG_Y, 0]}>
      <T.PlaneGeometry args={[2 * ARENA_IMG_HALF_U, 2 * ARENA_IMG_HALF_V]} />
      <T.MeshBasicMaterial map={arenaTex} side={DoubleSide} toneMapped={false} />
    </T.Mesh>
  </T.Group>
{/if}

<Board halfU={ARENA_HALF_U} halfV={ARENA_HALF_V} tileSize={TILE_SIZE} seed={7} visited={game.visited} visitedCount={game.visitedCount} reveal={!!arenaTex} />

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
  color={config.sub.color}
  detailColor={config.sub.detailColor}
  detail={config.sub.detail}
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
  {:else if e.type === 'shark'}
    {@const m = movers[e.id]}
    <Shark
      x={m.x}
      z={m.z}
      heading={m.heading}
      moving={m.moving}
      submerged={m.submerged}
      scale={SUB_SCALE}
      onclick={() => selectEnemy(e.id)}
    />
  {:else if e.type === 'minelayer'}
    {@const m = movers[e.id]}
    <Minelayer
      x={m.x}
      z={m.z}
      heading={m.heading}
      moving={m.moving}
      scale={SUB_SCALE}
      onclick={() => selectEnemy(e.id)}
    />
  {/if}
{/each}

<!-- Floating contact mines laid by the Minelayer (harm the sub at any depth). -->
{#each mines as mn}
  {#if mn.active}
    <Mine x={mn.x} z={mn.z} scale={SUB_SCALE} />
  {/if}
{/each}

<!-- Torpedoes: a dark, chunky underwater body with a long trailing stream of
     bubbles behind it (reads as running below the surface). Only harms a
     SUBMERGED sub, but stays visible topside. -->
{#each torpedoes as t}
  {#if t.active}
    {@const ang = Math.atan2(t.vx, t.vz)}
    {@const inv = 1 / (Math.hypot(t.vx, t.vz) || 1)}
    {@const bx = -t.vx * inv}
    {@const bz = -t.vz * inv}
    <!-- Outline shell (same contour treatment + colors as the submerged shark). -->
    <T.Mesh position={[t.x, TORPEDO_Y, t.z]} rotation={[0, ang, 0]} renderOrder={3}>
      <T.BoxGeometry args={[0.2, 0.17, 0.95]} />
      <T.MeshBasicMaterial color="#cfe0ea" side={BackSide} transparent opacity={0.9} depthWrite={false} />
    </T.Mesh>
    <!-- Body in the submerged shark's grey. -->
    <T.Mesh position={[t.x, TORPEDO_Y, t.z]} rotation={[0, ang, 0]} renderOrder={4}>
      <T.BoxGeometry args={[0.15, 0.12, 0.85]} />
      <T.MeshBasicMaterial color="#5a6570" transparent opacity={0.55} depthWrite={false} />
    </T.Mesh>
    {#each Array.from({ length: 8 }) as _, i}
      {@const d = 0.55 + i * 0.34}
      {@const s = Math.max(0.025, 0.095 * (1 - i * 0.1))}
      <T.Mesh position={[t.x + bx * d, TORPEDO_Y + 0.02, t.z + bz * d]} renderOrder={4}>
        <T.SphereGeometry args={[s, 8, 6]} />
        <T.MeshBasicMaterial
          color="#dcecf5"
          transparent
          opacity={0.55 * (1 - i * 0.1)}
          depthWrite={false}
        />
      </T.Mesh>
    {/each}
  {/if}
{/each}

<!-- Player missiles (M ability): a bright body with a nose glow and a short
     orange exhaust trail — clearly distinct from the enemy's grey torpedo. -->
{#each missiles as mi}
  {#if mi.active}
    {@const ang = Math.atan2(mi.vx, mi.vz)}
    {@const inv = 1 / (Math.hypot(mi.vx, mi.vz) || 1)}
    {@const bx = -mi.vx * inv}
    {@const bz = -mi.vz * inv}
    <T.Mesh position={[mi.x, MISSILE_Y, mi.z]} rotation={[0, ang, 0]} castShadow>
      <T.BoxGeometry args={[0.12, 0.12, 0.5]} />
      <T.MeshStandardMaterial color="#eef4f8" emissive="#8fd0ff" emissiveIntensity={0.4} flatShading />
    </T.Mesh>
    <!-- Nose glow (front = opposite the trail direction). -->
    <T.Mesh position={[mi.x - bx * 0.3, MISSILE_Y, mi.z - bz * 0.3]}>
      <T.SphereGeometry args={[0.08, 8, 6]} />
      <T.MeshBasicMaterial color="#bfe8ff" toneMapped={false} />
    </T.Mesh>
    <!-- Exhaust trail. -->
    {#each Array.from({ length: 4 }) as _, i}
      {@const d = 0.3 + i * 0.16}
      {@const s = Math.max(0.03, 0.1 * (1 - i * 0.2))}
      <T.Mesh position={[mi.x + bx * d, MISSILE_Y, mi.z + bz * d]}>
        <T.SphereGeometry args={[s, 8, 6]} />
        <T.MeshBasicMaterial
          color="#ffa83a"
          transparent
          opacity={0.75 * (1 - i * 0.2)}
          depthWrite={false}
          toneMapped={false}
        />
      </T.Mesh>
    {/each}
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

<!-- Star power-ups: shiny golden asterisks. Collect one to liberate every tile
     on its horizontal, vertical and diagonal lines. -->
{#each stars as s}
  {#if s.active}
    <Star x={s.x} z={s.z} scale={SUB_SCALE} />
  {/if}
{/each}

<!-- X power-ups: magenta crosses at a fixed random angle. Collect one to
     liberate the two diagonal lines of the X. -->
{#each xstars as s}
  {#if s.active}
    <XStar x={s.x} z={s.z} angle={s.angle} scale={SUB_SCALE} />
  {/if}
{/each}

<!-- Line power-ups: green bars at a fixed random angle. Collect one to liberate
     that single line. -->
{#each linestars as s}
  {#if s.active}
    <LineStar x={s.x} z={s.z} angle={s.angle} scale={SUB_SCALE} />
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
