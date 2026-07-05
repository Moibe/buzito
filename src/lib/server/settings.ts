import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MISSIONS, ENEMY_INFO, BONUS_INFO } from '$lib/missions';
import type { Bonuses, BonusType } from '$lib/missions';
import type { EnemyType } from '$lib/game.svelte';

// Server-side, file-backed store for the settings the admin edits, so they
// persist and apply to EVERY player (not just one browser). Written to
// data/settings.json under the app's working dir (survives restarts; on the
// droplet it lives outside the build output).
export type MissionEnemies = { type: EnemyType; count: number }[][];
// A tree of pure tuning leaves (numbers/booleans). Stores the admin's raw
// `config` knobs (sub tuning, player abilities, enemy stats) "as-is".
export type NumericTree = { [k: string]: number | boolean | NumericTree };
export type Settings = {
  winPct: number;
  heal: number;
  respawn: Record<BonusType, number>;
  // "Modo Amplio": covering a tile also covers its 6 hex neighbors.
  wideMode: boolean;
  missionEnemies: MissionEnemies;
  missionBonuses: Bonuses[];
  // Raw config knobs, present only once the admin has saved them (so a player's
  // client-side defaults win until then — no drift from a stale server default).
  sub?: NumericTree;
  player?: NumericTree;
  enemies?: NumericTree;
};

const FILE = join(process.cwd(), 'data', 'settings.json');

function base(): Settings {
  return {
    winPct: 0.9,
    heal: 12,
    respawn: { health: 180, line: 25, xstar: 50, star: 75 },
    wideMode: false,
    missionEnemies: MISSIONS.map((m) => m.enemies.map((e) => ({ type: e.type, count: e.count }))),
    missionBonuses: MISSIONS.map((m) => ({ ...m.bonuses })),
  };
}

function validMissionEnemies(v: unknown): v is MissionEnemies {
  if (!Array.isArray(v) || v.length !== MISSIONS.length) return false;
  for (const list of v) {
    if (!Array.isArray(list)) return false;
    for (const e of list) {
      if (typeof e !== 'object' || e === null) return false;
      const ee = e as { type?: unknown; count?: unknown };
      if (
        typeof ee.count !== 'number' ||
        ee.count < 0 ||
        typeof ee.type !== 'string' ||
        !(ee.type in ENEMY_INFO)
      ) {
        return false;
      }
    }
  }
  return true;
}

function validMissionBonuses(v: unknown): v is Bonuses[] {
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

// Deep-clean an arbitrary value into a tree of finite numbers / booleans,
// dropping anything else. Returns undefined if it isn't a usable object. Used
// to store the admin's raw config knobs without hand-validating every field.
function numericTree(v: unknown): NumericTree | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const out: NumericTree = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
    else if (typeof val === 'boolean') out[k] = val;
    else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const sub = numericTree(val);
      if (sub && Object.keys(sub).length) out[k] = sub;
    }
  }
  return out;
}

function validRespawn(v: unknown): v is Record<BonusType, number> {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(BONUS_INFO)) {
    if (typeof o[k] !== 'number' || (o[k] as number) <= 0) return false;
  }
  return true;
}

// Keep only well-formed, in-range fields from arbitrary input.
function sanitize(v: unknown): Partial<Settings> {
  const out: Partial<Settings> = {};
  const o = (v ?? {}) as {
    winPct?: unknown;
    heal?: unknown;
    respawn?: unknown;
    wideMode?: unknown;
    missionEnemies?: unknown;
    missionBonuses?: unknown;
    sub?: unknown;
    player?: unknown;
    enemies?: unknown;
  };
  if (typeof o.winPct === 'number' && o.winPct > 0 && o.winPct <= 1) out.winPct = o.winPct;
  if (typeof o.heal === 'number' && o.heal >= 0) out.heal = o.heal;
  if (validRespawn(o.respawn)) out.respawn = o.respawn;
  if (typeof o.wideMode === 'boolean') out.wideMode = o.wideMode;
  if (validMissionEnemies(o.missionEnemies)) out.missionEnemies = o.missionEnemies;
  if (validMissionBonuses(o.missionBonuses)) out.missionBonuses = o.missionBonuses;
  const sub = numericTree(o.sub);
  if (sub && Object.keys(sub).length) out.sub = sub;
  const player = numericTree(o.player);
  if (player && Object.keys(player).length) out.player = player;
  const enemies = numericTree(o.enemies);
  if (enemies && Object.keys(enemies).length) out.enemies = enemies;
  return out;
}

// Deep-merge tuning tree `over` onto `prev` — so a partial config payload (e.g.
// one that omits a leaf) never wipes previously-saved sibling leaves. Objects
// recurse; scalars overwrite.
function deepMergeTree(prev: NumericTree | undefined, over: NumericTree): NumericTree {
  const out: NumericTree = { ...(prev ?? {}) };
  for (const [k, v] of Object.entries(over)) {
    const p = out[k];
    if (v && typeof v === 'object' && p && typeof p === 'object') {
      out[k] = deepMergeTree(p, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Only the fields ever explicitly saved (NO base() defaults) — the actual file
// contents, sanitized. Used as the merge base for writes so a save never
// fabricates the OTHER domain's code defaults into the file (which would freeze
// them and mask later code-default changes).
function readStored(): Partial<Settings> {
  try {
    if (existsSync(FILE)) return sanitize(JSON.parse(readFileSync(FILE, 'utf-8')));
  } catch {
    /* corrupt/unreadable → nothing stored */
  }
  return {};
}

export function getSettings(): Settings {
  // base() defaults are applied only for READS/consumption, never persisted.
  return { ...base(), ...readStored() };
}

export function saveSettings(next: unknown): Settings {
  const prev = readStored();
  const sani = sanitize(next);
  const stored: Partial<Settings> = { ...prev, ...sani };
  // Config trees deep-merge onto the stored copy (defence-in-depth vs. a short
  // payload dropping a leaf); rules/tables replace wholesale as before.
  if (sani.sub) stored.sub = deepMergeTree(prev.sub, sani.sub);
  if (sani.player) stored.player = deepMergeTree(prev.player, sani.player);
  if (sani.enemies) stored.enemies = deepMergeTree(prev.enemies, sani.enemies);
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(stored, null, 2), 'utf-8');
  } catch {
    /* ignore write errors (read-only fs, etc.) */
  }
  return { ...base(), ...stored };
}
