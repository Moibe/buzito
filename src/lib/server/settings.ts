import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MISSIONS, ENEMY_INFO, BONUS_INFO } from '$lib/missions';
import type { Bonuses } from '$lib/missions';
import type { EnemyType } from '$lib/game.svelte';

// Server-side, file-backed store for the settings the admin edits, so they
// persist and apply to EVERY player (not just one browser). Written to
// data/settings.json under the app's working dir (survives restarts; on the
// droplet it lives outside the build output).
export type MissionEnemies = { type: EnemyType; count: number }[][];
export type Settings = { winPct: number; missionEnemies: MissionEnemies; missionBonuses: Bonuses[] };

const FILE = join(process.cwd(), 'data', 'settings.json');

function base(): Settings {
  return {
    winPct: 0.9,
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

// Keep only well-formed, in-range fields from arbitrary input.
function sanitize(v: unknown): Partial<Settings> {
  const out: Partial<Settings> = {};
  const o = (v ?? {}) as { winPct?: unknown; missionEnemies?: unknown; missionBonuses?: unknown };
  if (typeof o.winPct === 'number' && o.winPct > 0 && o.winPct <= 1) out.winPct = o.winPct;
  if (validMissionEnemies(o.missionEnemies)) out.missionEnemies = o.missionEnemies;
  if (validMissionBonuses(o.missionBonuses)) out.missionBonuses = o.missionBonuses;
  return out;
}

export function getSettings(): Settings {
  try {
    if (existsSync(FILE)) {
      return { ...base(), ...sanitize(JSON.parse(readFileSync(FILE, 'utf-8'))) };
    }
  } catch {
    /* corrupt/unreadable → defaults */
  }
  return base();
}

export function saveSettings(next: unknown): Settings {
  const merged = { ...getSettings(), ...sanitize(next) };
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(merged, null, 2), 'utf-8');
  } catch {
    /* ignore write errors (read-only fs, etc.) */
  }
  return merged;
}
