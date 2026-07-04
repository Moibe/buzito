import { pickRandomCities } from './cities';
import { MISSIONS, ENEMY_INFO } from './missions';

export type EnemyType = 'warship' | 'submarineIx' | 'cargo' | 'bomber' | 'shark' | 'minelayer';

// A machine-gun tracer round (pooled; physics driven by Scene, drawn by
// Tracers.svelte). y is a fixed gun height; velocity is world XZ.
export type Tracer = {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  owner?: string; // id of the warship that fired it (skipped in friendly fire)
};

export type Enemy = {
  id: string;
  type: EnemyType;
  name: string;
  q: number;
  r: number;
  // Whether the vessel's abilities are switched on. Toggled from its
  // context menu. Start inactive — the player activates them deliberately.
  active: boolean;
  // Hull points (friendly fire from other enemies chips these). Dies at 0.
  hp: number;
  hpMax: number;
  // Screen-space position of the enemy, written by Scene each frame so the
  // HTML health bar overlay can follow it.
  sx: number;
  sy: number;
};

// --- Tunable config (the in-game "knobs" panel binds to this; Scene reads it
// LIVE each frame, so slider changes take effect immediately). HP changes
// apply to enemies on the next "Regenerar enemigos" (respawnEnemies). ---
// Fresh copy of the base per-mission enemy composition (deep, so edits don't
// mutate the static MISSIONS table).
function baseMissionEnemies(): { type: EnemyType; count: number }[][] {
  return MISSIONS.map((m) => m.enemies.map((e) => ({ type: e.type, count: e.count })));
}

export const config = $state({
  sub: { hp: 50, speed: 3.0, turnRate: 1.8 },
  // Game rules the admin edits in "Ajustes" (persisted server-side so the
  // change reaches every player). winPct = fraction of tiles to cover to win.
  rules: { winPct: 0.9 },
  // Editable per-mission enemy composition (admin drag-to-add). Starts as the
  // base table; persisted so edits reach the game.
  missionEnemies: baseMissionEnemies(),
  pickup: { heal: 12, respawn: 180 },
  // Shiny asterisk power-ups: collecting one "liberates" (marks visited) every
  // tile along its horizontal, vertical and both diagonal lines on screen.
  stars: { count: 3, respawn: 25 },
  // X power-ups: like stars but liberate only the two diagonal lines of an X,
  // at each one's own random angle.
  xstars: { count: 3, respawn: 25 },
  // Line power-ups: liberate a SINGLE line, at each one's own random angle.
  linestars: { count: 3, respawn: 25 },
  // --- Player sub upgrades/abilities (the LEFT tuning panel binds to this).
  // Each has an `enabled` toggle so they can be switched on/off to test. ---
  player: {
    // Missiles fired with the M key: straight-line projectiles that damage the
    // first enemy they hit (any depth). interval = seconds between shots.
    missiles: { enabled: false, damage: 25, speed: 12, interval: 0.5 },
    // Speed boost — multiplies the base sub speed while enabled.
    speedBoost: { enabled: false, mult: 1.7 },
  },
  enemies: {
    warship: { hp: 100, ram: 8, speed: 2.8, fireInterval: 0.08, tracerDamage: 1, range: 2 },
    cargo: { hp: 80, ram: 18, speed: 2.0 },
    submarineIx: { hp: 65, ram: 16, speed: 2.4, depthMin: 2.2, depthMax: 5.0 },
    bomber: {
      hp: 70,
      ram: 20,
      speed: 0.9,
      salvoMin: 8,
      salvoMax: 14,
      salvoSize: 5,
      bombDamage: 12,
      blastRadius: 2.2,
    },
    // Shark sub: dives/surfaces at random; while submerged, fires torpedoes in
    // random 360° directions that cross the arena (hit the sub only if it's
    // submerged and in the line).
    shark: {
      hp: 55,
      ram: 14,
      speed: 2.6,
      depthMin: 2.0,
      depthMax: 4.5,
      torpedoInterval: 2.5, // seconds between torpedoes while submerged
      torpedoDamage: 15,
      torpedoSpeed: 4.5,
    },
    // Small ship that lays floating contact mines (harm at any depth).
    minelayer: {
      hp: 45,
      ram: 10,
      speed: 2.4,
      dropInterval: 2.5, // seconds between mines dropped
      mineDamage: 18,
      maxMines: 9, // never more than this many mines in the arena at once
    },
  },
});

// Validate a mission-enemies override before trusting it (server data could be
// stale/corrupt or from a different enemy set).
function isValidMissionEnemies(v: unknown): v is { type: EnemyType; count: number }[][] {
  if (!Array.isArray(v) || v.length !== MISSIONS.length) return false;
  for (const list of v) {
    if (!Array.isArray(list)) return false;
    for (const e of list) {
      if (typeof e !== 'object' || e === null) return false;
      const ee = e as { type?: unknown; count?: unknown };
      if (typeof ee.count !== 'number' || typeof ee.type !== 'string' || !(ee.type in ENEMY_INFO)) {
        return false;
      }
    }
  }
  return true;
}

// Apply settings coming from the SERVER (the source of truth, loaded via the
// root layout). Validated before use.
export function applyServerSettings(
  s: { winPct?: unknown; missionEnemies?: unknown } | null | undefined
) {
  if (!s) return;
  if (typeof s.winPct === 'number' && s.winPct > 0 && s.winPct <= 1) config.rules.winPct = s.winPct;
  if (isValidMissionEnemies(s.missionEnemies)) config.missionEnemies = s.missionEnemies;
}

// Save status the admin UI can show, so a failed write (e.g. expired session →
// 401) is visible instead of silent.
export const adminSync = $state<{ status: 'idle' | 'saving' | 'saved' | 'error' }>({
  status: 'idle',
});

// Persist the current admin-editable settings to the SERVER. Only the admin
// calls the mutators below; the write endpoint is gated by the admin cookie.
// No-op during SSR.
async function saveSettingsToServer() {
  if (typeof window === 'undefined') return;
  adminSync.status = 'saving';
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ winPct: config.rules.winPct, missionEnemies: config.missionEnemies }),
    });
    adminSync.status = res.ok ? 'saved' : 'error';
  } catch {
    adminSync.status = 'error';
  }
}

// Set the win-coverage rule from a PERCENTAGE (0-100), clamp, and persist it to
// the server so it applies to every player.
export function setWinPct(pct: number) {
  const v = Math.max(0.01, Math.min(1, (Number(pct) || 0) / 100));
  config.rules.winPct = v;
  saveSettingsToServer();
}

// --- Editable mission composition (admin drag-to-add), persisted server-side ---
const MAX_PER_TYPE = 20;
// Add one enemy of `type` to mission index (0-based). Validates the type.
export function addEnemyToMission(missionIndex: number, type: string) {
  const list = config.missionEnemies[missionIndex];
  if (!list || !(type in ENEMY_INFO)) return;
  const t = type as EnemyType;
  const found = list.find((e) => e.type === t);
  if (found) {
    if (found.count < MAX_PER_TYPE) found.count++;
  } else {
    list.push({ type: t, count: 1 });
  }
  saveSettingsToServer();
}
// Remove one enemy of `type` from mission index (drops the entry at 0).
export function removeEnemyFromMission(missionIndex: number, type: string) {
  const list = config.missionEnemies[missionIndex];
  if (!list) return;
  const idx = list.findIndex((e) => e.type === (type as EnemyType));
  if (idx < 0) return;
  list[idx].count--;
  if (list[idx].count <= 0) list.splice(idx, 1);
  saveSettingsToServer();
}
// Restore every mission to the base difficulty table.
export function resetMissions() {
  config.missionEnemies = baseMissionEnemies();
  saveSettingsToServer();
}

// Axial hex-ring helper (pure axial coords; no tile size needed). Ring k = the
// 6k tiles at hex-distance k from the center.
const AXIAL_DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
function hexRing(k: number): [number, number][] {
  if (k <= 0) return [[0, 0]];
  const out: [number, number][] = [];
  let q = AXIAL_DIRS[4][0] * k;
  let r = AXIAL_DIRS[4][1] * k;
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < k; step++) {
      out.push([q, r]);
      q += AXIAL_DIRS[side][0];
      r += AXIAL_DIRS[side][1];
    }
  }
  return out;
}

// Spread `count` spawn tiles around the arena (away from the center, where the
// sub starts), varying ring distance so they don't sit in one perfect circle.
function missionSpawnTiles(count: number): { q: number; r: number }[] {
  const rings = [6, 4, 8, 5, 7];
  const tiles: { q: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const ring = hexRing(rings[i % rings.length]);
    const t = ring[Math.floor((i / Math.max(1, count)) * ring.length) % ring.length];
    tiles.push({ q: t[0], r: t[1] });
  }
  return tiles;
}

// Build the enemy roster for mission n (1..8) from the difficulty table: each
// listed type × its count, placed on spread spawn tiles, with hull scaled by
// the mission's power multiplier ("características más filosas").
function makeEnemiesForMission(n: number): Enemy[] {
  const idx = Math.min(MISSIONS.length, Math.max(1, n)) - 1;
  const m = MISSIONS[idx];
  const composition = config.missionEnemies[idx] ?? m.enemies;
  const types: EnemyType[] = [];
  for (const e of composition) for (let i = 0; i < e.count; i++) types.push(e.type);
  const tiles = missionSpawnTiles(types.length);
  const counters: Partial<Record<EnemyType, number>> = {};
  return types.map((type, i) => {
    counters[type] = (counters[type] ?? 0) + 1;
    // Guard a cleared "Casco" panel field (→ null): keep the enemy alive
    // instead of spawning hp=0 (instantly removed) / NaN bars.
    const baseHp = config.enemies[type].hp > 0 ? config.enemies[type].hp : 1;
    const hp = Math.max(1, Math.round(baseHp * m.power));
    return {
      id: `${type}-${counters[type]}`,
      type,
      name: ENEMY_INFO[type].name,
      q: tiles[i].q,
      r: tiles[i].r,
      active: true,
      hp,
      hpMax: hp,
      sx: -9999,
      sy: -9999,
    };
  });
}

export const game = $state({
  // Which screen is showing: the mission picker or the arena.
  screen: 'select' as 'select' | 'play',
  // Currently selected mission slot (1-8). Cosmetic for now — all lead to arena.
  level: 1,
  // The 8 campaign cities: random from the world's 100 largest. The player
  // picks them in ANY order — the Nth city they beat is played at difficulty N.
  missions: pickRandomCities(8),
  // Cities already beaten (by name). length = how many levels are cleared, so
  // the NEXT pick is played at level (completed.length + 1).
  completed: [] as string[],
  // True once the player has entered any mission — locks the city reshuffle so
  // an in-progress campaign can't be reset out from under itself.
  campaignStarted: false,
  // The city of the mission currently being played (set by startMission).
  missionCity: '',
  // Difficulty multiplier of the current mission (Scene scales enemy stats by
  // this; 1 = baseline). Set by startLevel from the missions table.
  missionPower: 1,
  x: 0,
  z: 0,
  heading: 0,
  moving: false,
  submerged: false,
  // Hull points. Machine-gun tracers chip away at this while surfaced.
  hp: config.sub.hp,
  gameOver: false,
  // What sank the sub — shown on the game-over card.
  deathCause: '',
  // True once mission coverage reaches the win threshold — shows the
  // "Felicitaciones" banner. The sub becomes invincible once won.
  won: false,
  // Transient red vignette on hit (set to 1 on damage, decayed per-frame by
  // Scene, rendered as an overlay by the HUD).
  hitFlash: 0,
  // Transient green vignette on healing (blue-orb pickup).
  healFlash: 0,
  // Current hex tile under the sub (updated every frame by Scene).
  currentTileQ: 0,
  currentTileR: 0,
  // Visited tiles — keys are "q,r" strings.
  visited: new Set<string>(),
  visitedCount: 0,
  // Set by Board once cells are computed.
  totalTiles: 0,

  // --- Enemy vessels (roster for the current mission; rebuilt by respawnEnemies) ---
  enemies: makeEnemiesForMission(1),
  // Bumped by respawnEnemies so Scene rebuilds each enemy's live mover
  // (position/state) from the fresh list.
  enemiesEpoch: 0,
  // Context-menu selection. selectedEnemyId = null → no menu open.
  // menuMode: null = main card only, 'action' = the Acción submenu is open.
  selectedEnemyId: null as string | null,
  menuMode: null as null | 'action',
  // Screen-space anchor for the HTML context menu, written by Scene each
  // frame while a menu is open (so it follows a moving vehicle).
  menuSx: 0,
  menuSy: 0,
  // True while the pointer is over the menu — Scene pauses re-anchoring so the
  // buttons hold still and clicks land (otherwise a moving vessel drags the
  // menu out from under the cursor).
  menuHover: false,
});

export function toggleSubmerged() {
  game.submerged = !game.submerged;
}

// Mark the tile currently under the sub as visited.
export function markCurrentTile() {
  const key = `${game.currentTileQ},${game.currentTileR}`;
  if (!game.visited.has(key)) {
    game.visited.add(key);
    game.visitedCount++;
  }
}

// --- Enemy context-menu actions ---
export function selectEnemy(id: string) {
  game.selectedEnemyId = id;
  game.menuMode = null; // always (re)open on the main card
  game.menuHover = false; // resume following the newly selected vessel
}

export function closeEnemyMenu() {
  game.selectedEnemyId = null;
  game.menuMode = null;
  // The menu often closes while the pointer is still over it (e.g. clicking
  // an action), so its pointerleave never fires — clear the flag by hand or
  // the next menu would open frozen.
  game.menuHover = false;
}

export function toggleEnemyActive(id: string) {
  const e = game.enemies.find((x) => x.id === id);
  if (e) e.active = !e.active;
}

// TEMP (debug): freeze all enemies if any is active, else reactivate them all.
export function toggleAllEnemies() {
  const anyActive = game.enemies.some((e) => e.active);
  for (const e of game.enemies) e.active = !anyActive;
}

// Apply damage to the submarine's hull (hexa-turnos hp model). Clamps at 0
// and flips game over; further damage is ignored once sunk. `cause` is the
// message shown on the game-over card if this hit is the killing blow.
export function damageSub(amount: number, cause = 'Tu casco no aguantó.') {
  if (game.gameOver || game.won) return; // won → mission complete, invincible
  game.hp = Math.max(0, game.hp - amount);
  game.hitFlash = 1;
  if (game.hp <= 0) {
    game.gameOver = true;
    game.deathCause = cause;
  }
}

// Heal the hull (blue-orb pickup), clamped to full. No-op once sunk.
export function healSub(amount: number) {
  if (game.gameOver) return;
  // Guard against a cleared "Casco" panel field (config.sub.hp → null), which
  // would make Math.min(null, …) = 0 and silently zero the hull.
  const cap = config.sub.hp > 0 ? config.sub.hp : game.hp + amount;
  game.hp = Math.min(cap, game.hp + amount);
  game.healFlash = 1;
}

// Rebuild the enemy roster from config (fresh full HP at their spawn tiles,
// dead ones revived). Bumps enemiesEpoch so Scene resets their live movers.
export function respawnEnemies() {
  game.enemies = makeEnemiesForMission(game.level);
  game.enemiesEpoch++;
  closeEnemyMenu();
}

// Play a chosen city. Its DIFFICULTY is the player's progress: the Nth city
// beaten is played at level N, so this pick is level (completed + 1) — the
// grid position is irrelevant.
export function startMission(city: string) {
  const level = Math.min(MISSIONS.length, game.completed.length + 1);
  game.level = level;
  game.campaignStarted = true;
  game.missionCity = city;
  game.missionPower = MISSIONS[level - 1].power;
  resetGame();
  respawnEnemies();
  game.screen = 'play';
}

// Mark the current mission won and record its city as cleared (advances the
// difficulty for the next pick). Idempotent.
export function markMissionWon() {
  game.won = true;
  if (game.missionCity && !game.completed.includes(game.missionCity)) {
    game.completed.push(game.missionCity);
  }
}

// Draw a fresh random set of 8 cities and restart the campaign progress.
export function reshuffleMissions() {
  game.missions = pickRandomCities(8);
  game.completed = [];
  game.campaignStarted = false;
}

// Back out of the arena to the level picker.
export function goToLevelSelect() {
  closeEnemyMenu();
  game.screen = 'select';
}

// Restart after sinking: fresh hull, back to the arena center, progress
// cleared. Enemies keep their state (position/active) — the threat remains.
export function resetGame() {
  game.hp = config.sub.hp;
  game.gameOver = false;
  game.deathCause = '';
  game.won = false;
  game.hitFlash = 0;
  game.healFlash = 0;
  game.x = 0;
  game.z = 0;
  game.heading = 0;
  game.moving = false;
  game.submerged = false;
  game.visited.clear();
  game.visitedCount = 0;
  closeEnemyMenu();
}

