import { pickRandomCities } from './cities';

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
export const config = $state({
  sub: { hp: 50, speed: 3.0, turnRate: 1.8 },
  pickup: { heal: 12, respawn: 180 },
  // Shiny asterisk power-ups: collecting one "liberates" (marks visited) every
  // tile along its horizontal, vertical and both diagonal lines on screen.
  stars: { count: 3, respawn: 25 },
  // X power-ups: like stars but liberate only the two diagonal lines of an X,
  // at each one's own random angle.
  xstars: { count: 3, respawn: 25 },
  // --- Player sub upgrades/abilities (the LEFT tuning panel binds to this).
  // Each has an `enabled` toggle so they can be switched on/off to test. ---
  player: {
    // Missiles fired with the M key: straight-line projectiles that damage the
    // first enemy they hit (any depth). interval = seconds between shots.
    missiles: { enabled: false, damage: 25, speed: 12, interval: 0.5 },
    // Speed boost — multiplies the base sub speed while enabled.
    speedBoost: { enabled: false, mult: 1.7 },
  },
  // Fraction of the arena's tiles you must submerge over to clear a stage
  // (1 = all of them; lower it if covering the whole board feels too long).
  stage: { coverage: 1.0 },
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

// Static spawn definitions (identity + starting tile). Per-enemy HP comes from
// config so the knobs panel controls it.
const SPAWN_DEFS: { id: string; type: EnemyType; name: string; q: number; r: number }[] = [
  { id: 'warship-1', type: 'warship', name: 'Destructor', q: 6, r: -7 },
  { id: 'cargo-1', type: 'cargo', name: 'Carguero', q: -5, r: 4 },
  { id: 'bomber-1', type: 'bomber', name: 'Bombardero', q: 2, r: 2 },
  { id: 'subix-1', type: 'submarineIx', name: 'U-Boot', q: -4, r: 3 },
  { id: 'shark-1', type: 'shark', name: 'Tiburón', q: 0, r: -6 },
  { id: 'minelayer-1', type: 'minelayer', name: 'Minador', q: -2, r: 5 },
];

function makeEnemies(): Enemy[] {
  return SPAWN_DEFS.map((d) => ({
    ...d,
    active: true,
    hp: config.enemies[d.type].hp,
    hpMax: config.enemies[d.type].hp,
    sx: -9999,
    sy: -9999,
  }));
}

export const game = $state({
  // Which screen is showing: the mission picker or the arena.
  screen: 'select' as 'select' | 'play',
  // Currently selected mission slot (1-8). Cosmetic for now — all lead to arena.
  level: 1,
  // The 8 missions: random cities drawn from the world's 100 largest. Picked
  // once at load; reshuffleMissions() draws a fresh set.
  missions: pickRandomCities(8),
  // The city of the mission currently being played (set by startLevel).
  missionCity: '',
  // Current stage within the level (1..STAGE_COUNT). Clear a stage by
  // submerging over the coverage target of tiles.
  stage: 1,
  // True once all 4 stages are cleared (shows the "level complete" overlay).
  levelComplete: false,
  // Transient banner value on stage transitions (decayed per-frame by Scene).
  stageFlash: 0,
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

  // --- Enemy vessels (seeded from config; rebuilt by respawnEnemies) ---
  enemies: makeEnemies(),
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
  if (game.gameOver) return;
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
  game.hp = Math.min(config.sub.hp, game.hp + amount);
  game.healFlash = 1;
}

// Rebuild the enemy roster from config (fresh full HP at their spawn tiles,
// dead ones revived). Bumps enemiesEpoch so Scene resets their live movers.
export function respawnEnemies() {
  game.enemies = makeEnemies();
  game.enemiesEpoch++;
  closeEnemyMenu();
}

// Enter a mission's arena from the picker: fresh sub, fresh enemy roster.
export function startLevel(n: number) {
  game.level = n;
  game.missionCity = game.missions[n - 1] ?? '';
  resetGame();
  respawnEnemies();
  game.screen = 'play';
}

// Draw a fresh random set of 8 mission cities (only meaningful on the picker).
export function reshuffleMissions() {
  game.missions = pickRandomCities(8);
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

