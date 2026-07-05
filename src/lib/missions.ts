import type { EnemyType } from './game.svelte';

// Display metadata for each enemy type (used by the admin missions view).
export const ENEMY_INFO: Record<EnemyType, { name: string; emoji: string }> = {
  cargo: { name: 'Carguero', emoji: '📦' },
  warship: { name: 'Destructor', emoji: '⚔️' },
  minelayer: { name: 'Minador', emoji: '💣' },
  submarineIx: { name: 'U-Boot', emoji: '🛥️' },
  bomber: { name: 'Bombardero', emoji: '✈️' },
  shark: { name: 'Tiburón', emoji: '🦈' },
};

// Bonuses = the tile-liberator power-ups, introduced gradually like enemies.
export type BonusType = 'health' | 'line' | 'xstar' | 'star';
export const BONUS_INFO: Record<BonusType, { name: string; emoji: string }> = {
  health: { name: 'Vida', emoji: '💙' },
  line: { name: 'Línea', emoji: '➖' },
  xstar: { name: 'X', emoji: '✖️' },
  star: { name: 'Estrella', emoji: '✳️' },
};
export type Bonuses = { health: number; line: number; xstar: number; star: number };

export type MissionEnemy = { type: EnemyType; count: number };
export type Mission = {
  n: number; // 1..8
  label: string; // human difficulty label
  power: number; // stat multiplier applied to enemy characteristics ("filo")
  enemies: MissionEnemy[]; // which types + how many
  bonuses: Bonuses; // how many of each liberator power-up
  note: string; // short summary of the twist
  newTypes: EnemyType[]; // types that FIRST appear on this mission (computed)
  newBonuses: BonusType[]; // bonuses that FIRST appear on this mission (computed)
  total: number; // total enemies (computed)
};

// --- Proposed difficulty curve ---
// Mission 1 is always the easiest and 8 the hardest, regardless of the city.
// Difficulty rises three ways: (1) new enemy TYPES introduced gradually, one at
// a time; (2) more of each; (3) a per-mission `power` multiplier that sharpens
// their stats (hull / ram / weapon damage / fire rate / speed).
const RAW: Omit<Mission, 'newTypes' | 'newBonuses' | 'total'>[] = [
  {
    n: 1,
    label: 'Muy fácil',
    power: 0.9,
    enemies: [{ type: 'cargo', count: 1 }],
    bonuses: { health: 2, line: 1, xstar: 0, star: 0 },
    note: 'Un solo Carguero que patrulla y embiste. Para aprender a moverte y cubrir mosaicos.',
  },
  {
    n: 2,
    label: 'Fácil',
    power: 1.0,
    enemies: [
      { type: 'cargo', count: 1 },
      { type: 'warship', count: 1 },
    ],
    bonuses: { health: 2, line: 1, xstar: 0, star: 0 },
    note: 'Aparece el Destructor y sus metralletas: sumérgete para romper su línea de tiro.',
  },
  {
    n: 3,
    label: 'Ligera',
    power: 1.1,
    enemies: [
      { type: 'cargo', count: 2 },
      { type: 'warship', count: 1 },
      { type: 'minelayer', count: 1 },
    ],
    bonuses: { health: 3, line: 2, xstar: 1, star: 0 },
    note: 'Entra el Minador: siembra minas flotantes que dañan por arriba y por abajo. Debuta la X.',
  },
  {
    n: 4,
    label: 'Media',
    power: 1.25,
    enemies: [
      { type: 'cargo', count: 2 },
      { type: 'warship', count: 2 },
      { type: 'minelayer', count: 1 },
      { type: 'submarineIx', count: 1 },
    ],
    bonuses: { health: 3, line: 2, xstar: 1, star: 0 },
    note: 'El U-Boot bucea y emerge, y te embiste cuando está a tu misma profundidad.',
  },
  {
    n: 5,
    label: 'Difícil',
    power: 1.4,
    enemies: [
      { type: 'cargo', count: 2 },
      { type: 'warship', count: 2 },
      { type: 'minelayer', count: 2 },
      { type: 'submarineIx', count: 1 },
      { type: 'bomber', count: 1 },
    ],
    bonuses: { health: 3, line: 2, xstar: 1, star: 1 },
    note: 'El Bombardero suelta salvas de bombas que caen a cualquier profundidad. Debuta la Estrella.',
  },
  {
    n: 6,
    label: 'Muy difícil',
    power: 1.55,
    enemies: [
      { type: 'cargo', count: 2 },
      { type: 'warship', count: 2 },
      { type: 'minelayer', count: 2 },
      { type: 'submarineIx', count: 2 },
      { type: 'bomber', count: 1 },
      { type: 'shark', count: 1 },
    ],
    bonuses: { health: 4, line: 3, xstar: 2, star: 1 },
    note: 'Llega el Tiburón con sus torpedos submarinos. Ya están todos los tipos en el mar.',
  },
  {
    n: 7,
    label: 'Brutal',
    power: 1.75,
    enemies: [
      { type: 'cargo', count: 2 },
      { type: 'warship', count: 3 },
      { type: 'minelayer', count: 2 },
      { type: 'submarineIx', count: 2 },
      { type: 'bomber', count: 2 },
      { type: 'shark', count: 2 },
    ],
    bonuses: { health: 4, line: 3, xstar: 2, star: 2 },
    note: 'Flota completa y más numerosa; todos más rápidos, más resistentes y más letales.',
  },
  {
    n: 8,
    label: 'Extrema',
    power: 2.0,
    enemies: [
      { type: 'cargo', count: 2 },
      { type: 'warship', count: 3 },
      { type: 'minelayer', count: 3 },
      { type: 'submarineIx', count: 3 },
      { type: 'bomber', count: 2 },
      { type: 'shark', count: 3 },
    ],
    bonuses: { health: 5, line: 3, xstar: 3, star: 3 },
    note: 'Asalto total: máxima cantidad y características al máximo filo (poder ×2).',
  },
];

// Enrich with computed fields: which enemy/bonus types debut here + total count.
const seenEnemies = new Set<EnemyType>();
const seenBonuses = new Set<BonusType>();
export const MISSIONS: Mission[] = RAW.map((m) => {
  const newTypes = m.enemies.map((e) => e.type).filter((t) => !seenEnemies.has(t));
  newTypes.forEach((t) => seenEnemies.add(t));
  const newBonuses = (Object.keys(m.bonuses) as BonusType[]).filter(
    (b) => m.bonuses[b] > 0 && !seenBonuses.has(b)
  );
  newBonuses.forEach((b) => seenBonuses.add(b));
  const total = m.enemies.reduce((s, e) => s + e.count, 0);
  return { ...m, newTypes, newBonuses, total };
});
