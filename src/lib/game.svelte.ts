import { pickRandomCities, WORLD_CITIES } from './cities';
import { MISSIONS, ENEMY_INFO, BONUS_INFO } from './missions';
import type { Bonuses, BonusType } from './missions';

// Each city is played across this many arenas (one per image slot).
export const ARENAS_PER_CITY = 4;

// The 5 accent details the player can put in the sub's secondary color.
export const SUB_DETAILS: { id: string; name: string }[] = [
  { id: 'stripes', name: '2 bandas' },
  { id: 'diagonals', name: '3 diagonales' },
  { id: 'dorsal', name: 'Franja dorsal' },
  { id: 'tower', name: 'Torreta' },
  { id: 'nose', name: 'Proa' },
];

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
// Fresh copy of the base per-mission bonus (power-up) counts.
function baseMissionBonuses(): Bonuses[] {
  return MISSIONS.map((m) => ({ ...m.bonuses }));
}

export const config = $state({
  sub: {
    hp: 50,
    speed: 3.0,
    turnRate: 1.8,
    // Appearance (per-player; persisted in localStorage): primary hull color,
    // secondary accent color, and which accent detail wears it.
    color: '#2a2e30',
    detailColor: '#ffcf33',
    detail: 'stripes',
  },
  // Game rules the admin edits in "Ajustes" (persisted server-side so the
  // change reaches every player). winPct = fraction of tiles to cover to win;
  // heal = health per orb; respawn = seconds until a new wave of each bonus
  // after its previous wave is cleared.
  rules: {
    winPct: 0.9,
    heal: 12,
    respawn: { health: 180, line: 25, xstar: 50, star: 75 } as Record<BonusType, number>,
  },
  // Editable per-mission enemy composition (admin drag-to-add). Starts as the
  // base table; persisted so edits reach the game.
  missionEnemies: baseMissionEnemies(),
  // Editable per-mission bonus (power-up) counts. Admin-controlled + persisted.
  missionBonuses: baseMissionBonuses(),
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

// Validate a mission-bonuses override (server data could be stale/corrupt).
function isValidMissionBonuses(v: unknown): v is Bonuses[] {
  if (!Array.isArray(v) || v.length !== MISSIONS.length) return false;
  for (const b of v) {
    if (typeof b !== 'object' || b === null) return false;
    const bb = b as Record<string, unknown>;
    for (const k of Object.keys(BONUS_INFO)) {
      if (typeof bb[k] !== 'number' || (bb[k] as number) < 0) return false;
    }
  }
  return true;
}

// Validate a respawn map ({health,line,xstar,star} → positive seconds).
function isValidRespawn(v: unknown): v is Record<BonusType, number> {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(BONUS_INFO)) {
    if (typeof o[k] !== 'number' || (o[k] as number) <= 0) return false;
  }
  return true;
}

// Deep-merge a server-provided tuning tree onto a live config object, copying a
// leaf ONLY when the target already has a same-typed leaf at that path (so
// unknown/stale keys are ignored and untouched fields keep their client default;
// string fields like the per-player appearance are skipped entirely).
function mergeNumericTree(target: Record<string, unknown>, src: unknown) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return;
  const s = src as Record<string, unknown>;
  for (const k of Object.keys(target)) {
    if (!(k in s)) continue;
    const tv = target[k];
    const sv = s[k];
    if (typeof tv === 'number' && typeof sv === 'number' && Number.isFinite(sv)) target[k] = sv;
    else if (typeof tv === 'boolean' && typeof sv === 'boolean') target[k] = sv;
    else if (tv && typeof tv === 'object' && sv && typeof sv === 'object') {
      mergeNumericTree(tv as Record<string, unknown>, sv);
    }
  }
}

// Apply settings coming from the SERVER (the source of truth, loaded via the
// root layout). Validated before use.
export function applyServerSettings(
  s:
    | {
        winPct?: unknown;
        heal?: unknown;
        respawn?: unknown;
        missionEnemies?: unknown;
        missionBonuses?: unknown;
        sub?: unknown;
        player?: unknown;
        enemies?: unknown;
      }
    | null
    | undefined
) {
  if (!s) return;
  if (typeof s.winPct === 'number' && s.winPct > 0 && s.winPct <= 1) config.rules.winPct = s.winPct;
  if (typeof s.heal === 'number' && s.heal >= 0) config.rules.heal = s.heal;
  if (isValidRespawn(s.respawn)) config.rules.respawn = s.respawn;
  if (isValidMissionEnemies(s.missionEnemies)) config.missionEnemies = s.missionEnemies;
  if (isValidMissionBonuses(s.missionBonuses)) config.missionBonuses = s.missionBonuses;
  // Raw tuning knobs (admin-only, persisted server-side). Merged leaf-by-leaf
  // so the per-player appearance (config.sub.color/…) is never overwritten.
  mergeNumericTree(config.sub, s.sub);
  mergeNumericTree(config.player, s.player);
  mergeNumericTree(config.enemies, s.enemies);
}

// Save status the admin UI can show, so a failed write (e.g. expired session →
// 401) is visible instead of silent.
export const adminSync = $state<{ status: 'idle' | 'saving' | 'saved' | 'error' }>({
  status: 'idle',
});

// PUT a partial settings payload to the SERVER (admin-only; the endpoint is
// gated by the admin cookie, which merges it onto the stored settings). No-op
// during SSR. Kept partial so a rules save never rewrites the config knobs and
// vice-versa — otherwise a rules save would freeze the current config defaults
// server-side and mask later code-default changes.
async function putSettings(payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  adminSync.status = 'saving';
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    adminSync.status = res.ok ? 'saved' : 'error';
  } catch {
    adminSync.status = 'error';
  }
}

// Persist the game RULES (the mutators below call this). Only the admin edits
// them; the write endpoint is gated by the admin cookie.
function saveSettingsToServer() {
  putSettings({
    winPct: config.rules.winPct,
    heal: config.rules.heal,
    respawn: config.rules.respawn,
    missionEnemies: config.missionEnemies,
    missionBonuses: config.missionBonuses,
  });
}

// Persist the raw config knobs (called by the admin's Config panel after an
// edit). Sends only the config tree — the appearance (color/detailColor/detail)
// is per-player and stays in localStorage, so it's stripped from `sub` here.
export function saveConfig() {
  putSettings({
    sub: { hp: config.sub.hp, speed: config.sub.speed, turnRate: config.sub.turnRate },
    player: config.player,
    enemies: config.enemies,
  });
}

// Set the win-coverage rule from a PERCENTAGE (0-100), clamp, and persist it to
// the server so it applies to every player.
export function setWinPct(pct: number) {
  const v = Math.max(0.01, Math.min(1, (Number(pct) || 0) / 100));
  config.rules.winPct = v;
  saveSettingsToServer();
}

// --- Sub appearance + player name (per-player prefs, persisted in localStorage) ---
if (typeof localStorage !== 'undefined') {
  try {
    const a = JSON.parse(localStorage.getItem('buzito.appearance') || 'null');
    if (a && typeof a === 'object') {
      if (typeof a.color === 'string') config.sub.color = a.color;
      if (typeof a.detailColor === 'string') config.sub.detailColor = a.detailColor;
      if (typeof a.detail === 'string' && SUB_DETAILS.some((d) => d.id === a.detail)) {
        config.sub.detail = a.detail;
      }
    }
  } catch {
    /* ignore corrupt value */
  }
}

// Set (and persist) the player's name.
export function setPlayerName(name: string) {
  game.playerName = name;
  if (typeof localStorage !== 'undefined') localStorage.setItem('buzito.playerName', name);
}
function saveAppearance() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      'buzito.appearance',
      JSON.stringify({
        color: config.sub.color,
        detailColor: config.sub.detailColor,
        detail: config.sub.detail,
      })
    );
  }
}
export function setSubColor(v: string) {
  config.sub.color = v;
  saveAppearance();
}
export function setSubDetailColor(v: string) {
  config.sub.detailColor = v;
  saveAppearance();
}
export function setSubDetail(v: string) {
  config.sub.detail = v;
  saveAppearance();
}

// Health restored per orb.
export function setHeal(v: number) {
  config.rules.heal = Math.max(0, Number(v) || 0);
  saveSettingsToServer();
}

// Respawn delay (seconds) for a bonus type's next wave.
export function setRespawn(type: BonusType, v: number) {
  if (!(type in config.rules.respawn)) return;
  config.rules.respawn[type] = Math.max(1, Number(v) || 1);
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
// Change a mission's count of a bonus type by delta (clamped), then persist.
const MAX_BONUS_PER_TYPE = 12;
export function adjustMissionBonus(missionIndex: number, type: BonusType, delta: number) {
  const b = config.missionBonuses[missionIndex];
  if (!b || !(type in BONUS_INFO)) return;
  b[type] = Math.max(0, Math.min(MAX_BONUS_PER_TYPE, (b[type] ?? 0) + delta));
  saveSettingsToServer();
}

// Restore every mission to the base difficulty table (enemies + bonuses).
export function resetMissions() {
  config.missionEnemies = baseMissionEnemies();
  config.missionBonuses = baseMissionBonuses();
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
function makeEnemiesForMission(n: number, power: number): Enemy[] {
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
    const hp = Math.max(1, Math.round(baseHp * power));
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
  // Which screen: intro → (profile for returning players) → sub customization →
  // mission picker → arena.
  screen: 'intro' as 'intro' | 'profile' | 'sub' | 'select' | 'play',
  // Player name (entered on Start; persisted per-player in localStorage).
  playerName: '',
  // Currently selected mission slot (1-8). Cosmetic for now — all lead to arena.
  level: 1,
  // The 8 campaign cities: random from the world's 100 largest. The player
  // picks them in ANY order — the Nth city they beat is played at difficulty N.
  missions: pickRandomCities(8),
  // Cities already beaten (by name) IN THE CURRENT CAMPAIGN. length = how many
  // levels are cleared, so the NEXT pick is played at level (completed.length + 1).
  // Reset by reshuffle; in-memory only.
  completed: [] as string[],
  // All cities EVER conquered (by name) — the player's permanent "trophy case"
  // shown on the profile. Only grows; persisted per-player in localStorage
  // ('buzito.conquered') and NOT wiped by a campaign reshuffle.
  conquered: [] as string[],
  // True once the player has entered any mission — locks the city reshuffle so
  // an in-progress campaign can't be reset out from under itself.
  campaignStarted: false,
  // The city of the mission currently being played (set by startMission).
  missionCity: '',
  // Its 1-based index in WORLD_CITIES → the key for its stored images. 0 = none.
  missionCityN: 0,
  // Which of the city's 4 arenas is being played (1..4) — one per image slot.
  // "Volar a la siguiente misión" advances this; the city is beaten after 4.
  arena: 1,
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
  enemies: makeEnemiesForMission(1, MISSIONS[0].powers[0]),
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

// Restore the per-player name saved on a previous visit.
if (typeof localStorage !== 'undefined') {
  const savedName = localStorage.getItem('buzito.playerName');
  if (savedName) game.playerName = savedName;
}

// Restore the per-player conquered-cities trophy case (all cities ever beaten).
if (typeof localStorage !== 'undefined') {
  try {
    const c = JSON.parse(localStorage.getItem('buzito.conquered') || 'null');
    // Dedup on restore: the profile keys {#each} by city name, and Svelte throws
    // on duplicate keys if corrupt/hand-edited storage ever holds a repeat.
    if (Array.isArray(c)) {
      game.conquered = [...new Set(c.filter((x): x is string => typeof x === 'string'))];
    }
  } catch {
    /* ignore corrupt value */
  }
}

// Persist the trophy case.
function saveConquered() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('buzito.conquered', JSON.stringify(game.conquered));
  }
}

// Record a city as conquered forever (idempotent). Called when its last arena is
// beaten, so the profile keeps it across sessions and reshuffles.
export function recordConquered(city: string) {
  if (city && !game.conquered.includes(city)) {
    game.conquered.push(city);
    saveConquered();
  }
}

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
  game.enemies = makeEnemiesForMission(game.level, game.missionPower);
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
  game.missionCityN = WORLD_CITIES.indexOf(city) + 1; // 0 if not found
  game.arena = 1;
  game.missionPower = MISSIONS[level - 1].powers[0]; // arena 1 power
  resetGame();
  respawnEnemies();
  game.screen = 'play';
}

// Mark the current arena won. The CITY is only cleared once its LAST arena (4)
// is beaten — that's what advances the campaign difficulty for the next pick.
export function markMissionWon() {
  game.won = true;
  if (game.arena >= ARENAS_PER_CITY && game.missionCity && !game.completed.includes(game.missionCity)) {
    game.completed.push(game.missionCity);
    // Also add to the permanent trophy case shown on the profile.
    recordConquered(game.missionCity);
  }
}

// "Volar a la siguiente misión": reload the SAME city's next arena (next image),
// fresh sub/enemies, staying in the arena. No-op past the last one.
export function advanceArena() {
  if (game.arena >= ARENAS_PER_CITY) return;
  game.arena += 1;
  // Each arena ramps the power up (arena 1..4 → powers[0..3]).
  game.missionPower = MISSIONS[game.level - 1].powers[game.arena - 1];
  resetGame(); // fresh sub, cleared coverage, won=false
  respawnEnemies(); // same roster, sharper stats for this arena
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

// Show the submarine customization screen (start of the flow / from the picker).
export function goToSubScreen() {
  game.screen = 'sub';
}

// Back to the intro screen (clicking the "buzito" title).
export function goToIntro() {
  game.screen = 'intro';
}

// The player's profile (name, submarine, conquered cities). Returning players
// land here from "Iniciar Juego".
export function goToProfile() {
  game.screen = 'profile';
}

// Restart after sinking: fresh hull, back to the arena center, progress
// cleared. Enemies keep their state (position/active) — the threat remains.
export function resetGame() {
  // Guard a cleared/invalid sub HP (same floor as healSub / the HUD) so a blank
  // admin "Casco" field can't spawn the sub at null HP → instant game over.
  game.hp = config.sub.hp > 0 ? config.sub.hp : 1;
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

