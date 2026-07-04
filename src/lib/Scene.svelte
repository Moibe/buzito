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
  import Tracers from './Tracers.svelte';
  import { axialToWorld, worldToAxial, axialRound } from './hex';
  import {
    game,
    toggleSubmerged,
    markCurrentTile,
    selectEnemy,
    damageSub,
    RAM_DAMAGE,
    type EnemyType,
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
    // A sunk sub doesn't answer the helm — controls freeze until restart.
    const alive = !game.gameOver;
    if (alive && keys.left) game.heading += TURN_RATE * delta;
    if (alive && keys.right) game.heading -= TURN_RATE * delta;

    let speed = 0;
    if (alive && keys.up) speed += MAX_SPEED * (game.submerged ? SUBMERGED_FACTOR : 1);
    if (alive && keys.down) speed -= MAX_SPEED * REVERSE_FACTOR;

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
  // DYNAMIC enemies (cargo + warship) are Scene-driven pure renderers whose
  // continuous world position lives here. STATIC enemies (tanker,
  // submarineIx) keep their own q/r glide driver and just mirror their live
  // position back via onAnimate so their ring/menu track them.
  const DYNAMIC = new Set<EnemyType>(['cargo', 'warship']);

  type MoverCfg = {
    patrolSpeed: number;
    moveSpeed: number;
    margin: number;
    rotLerp: number;
  };
  const MOVER_CFG: Record<string, MoverCfg> = {
    cargo: { patrolSpeed: 2.0, moveSpeed: 3.0, margin: 2.0, rotLerp: 6 },
    warship: { patrolSpeed: 2.8, moveSpeed: 3.2, margin: 2.0, rotLerp: 6 },
  };

  type Mover = {
    x: number;
    z: number;
    heading: number;
    dir: number; // +1 → +u (right), −1 → −u (left)
    moving: boolean;
    moveTarget: { x: number; z: number } | null;
  };
  const movers = $state<Record<string, Mover>>(
    Object.fromEntries(
      game.enemies
        .filter((e) => DYNAMIC.has(e.type))
        .map((e) => {
          const w = axialToWorld(e.q, e.r, TILE_SIZE);
          return [
            e.id,
            { x: w.x, z: w.z, heading: -Math.PI / 4, dir: 1, moving: false, moveTarget: null },
          ];
        })
    )
  );

  // Live positions of STATIC enemies, mirrored from their driver via onAnimate.
  const livePos = $state<Record<string, { x: number; z: number }>>(
    Object.fromEntries(
      game.enemies
        .filter((e) => !DYNAMIC.has(e.type))
        .map((e) => {
          const w = axialToWorld(e.q, e.r, TILE_SIZE);
          return [e.id, { x: w.x, z: w.z }];
        })
    )
  );
  function reportLive(id: string, x: number, z: number) {
    const p = livePos[id];
    if (p) {
      p.x = x;
      p.z = z;
    }
  }
  // Live world position of any enemy (dynamic → mover, static → mirrored).
  function enemyPos(e: { id: string; type: EnemyType; q: number; r: number }) {
    if (DYNAMIC.has(e.type)) return movers[e.id];
    return livePos[e.id] ?? axialToWorld(e.q, e.r, TILE_SIZE);
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
  // the sub is within SHOOT_RANGE_TILES ("cuadros"). Submerging breaks the
  // line of fire — diving is the counter.
  const SHOOT_RANGE_TILES = 2;
  const FIRE_INTERVAL = 0.08; // seconds between rounds (machine-gun cadence)
  const TRACER_DAMAGE = 1; // hull points per round on target
  const GUN_Y = 0.62; // tracer height (about the gun mounts)
  const GUN_OFFSET = 0.6; // spawn a bit off the hull toward the sub
  const TRACER_SPEED = 18; // world units/s
  const TRACER_LIFE = 0.7; // seconds
  const TRACER_HIT_R2 = 0.5 * 0.5; // squared radius counted as "on target"
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
    // --- Dynamic enemy motion (cargo + warship) ---
    for (const e of game.enemies) {
      if (!DYNAMIC.has(e.type)) continue;
      const m = movers[e.id];
      const cfg = MOVER_CFG[e.type];
      if (!m || !cfg) continue;
      let th = m.heading;
      if (m.moveTarget) {
        // Manual relocation glide (any direction) — overrides patrol.
        const dx = m.moveTarget.x - m.x;
        const dz = m.moveTarget.z - m.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.02) {
          const step = Math.min(cfg.moveSpeed * delta, dist);
          m.x += (dx / dist) * step;
          m.z += (dz / dist) * step;
          m.moving = true;
          th = Math.atan2(-dx, -dz);
        } else {
          m.moveTarget = null;
          m.moving = false;
        }
      } else if (e.active) {
        // Patrol along u at the current row (v derived from live position).
        // The u-step is the projection of the ACTUAL (lerped) heading, not
        // m.dir directly — so after a bounce the hull decelerates, pivots at
        // the wall, and sails back bow-first instead of sliding stern-first
        // while the 180° turn completes.
        const u = (m.x - m.z) * Math.SQRT1_2;
        const v = (m.x + m.z) * Math.SQRT1_2;
        const uLim = ARENA_HALF_U - cfg.margin;
        const fwdU = (-Math.sin(m.heading) + Math.cos(m.heading)) * Math.SQRT1_2;
        let nu = u + fwdU * cfg.patrolSpeed * delta;
        if (nu > uLim) {
          nu = uLim;
          m.dir = -1;
        } else if (nu < -uLim) {
          nu = -uLim;
          m.dir = 1;
        }
        m.x = (nu + v) * Math.SQRT1_2;
        m.z = (v - nu) * Math.SQRT1_2;
        m.moving = true;
        th = m.dir > 0 ? -Math.PI / 4 : (3 * Math.PI) / 4;
      } else {
        m.moving = false;
      }
      let dh = th - m.heading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      m.heading += dh * Math.min(delta * cfg.rotLerp, 1);
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
      hexDistTiles(wm.x, wm.z, game.x, game.z) <= SHOOT_RANGE_TILES;
    if (canFire && wm) {
      fireCooldown -= delta;
      // Guard against spawning a huge burst after a long frame / tab-restore.
      let guard = 0;
      while (fireCooldown <= 0 && guard < 4) {
        spawnTracer(wm.x, wm.z, game.x, game.z);
        fireCooldown += FIRE_INTERVAL;
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

    // --- Ramming: any enemy hull over the surfaced sub deals ram damage ---
    for (const e of game.enemies) {
      const cd = ramCooldowns[e.id] ?? 0;
      if (cd > 0) {
        ramCooldowns[e.id] = cd - delta;
        continue;
      }
      if (game.submerged || game.gameOver) continue;
      const p = enemyPos(e);
      const dx = p.x - game.x;
      const dz = p.z - game.z;
      if (dx * dx + dz * dz < RAM_RADIUS * RAM_RADIUS) {
        damageSub(RAM_DAMAGE[e.type], `Te embistió el ${e.name}.`);
        ramCooldowns[e.id] = RAM_COOLDOWN;
      }
    }

    // --- Advance tracers ---
    for (const t of tracers) {
      if (!t.active) continue;
      t.x += t.vx * delta;
      t.z += t.vz * delta;
      t.age += delta;
      if (t.age > TRACER_LIFE) {
        t.active = false;
      } else if (!game.submerged) {
        const ddx = t.x - game.x;
        const ddz = t.z - game.z;
        if (ddx * ddx + ddz * ddz < TRACER_HIT_R2) {
          t.active = false;
          damageSub(TRACER_DAMAGE, 'Las metralletas del destructor acabaron con tu casco.');
        }
      }
    }

    // --- Anchor the open context menu to the selected enemy's live screen
    // position (follows a vehicle while it glides). ---
    const c = cam;
    const id = game.selectedEnemyId;
    if (c && id) {
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
  {:else if e.type === 'tanker'}
    <Tanker
      q={e.q}
      r={e.r}
      tileSize={TILE_SIZE}
      scale={SUB_SCALE}
      onclick={() => selectEnemy(e.id)}
      onAnimate={(ax, az) => reportLive(e.id, ax, az)}
    />
  {:else if e.type === 'submarineIx'}
    <SubmarineIX
      q={e.q}
      r={e.r}
      tileSize={TILE_SIZE}
      scale={SUB_SCALE}
      onclick={() => selectEnemy(e.id)}
      onAnimate={(ax, az) => reportLive(e.id, ax, az)}
    />
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
