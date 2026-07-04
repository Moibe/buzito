export type EnemyType = 'warship' | 'submarineIx' | 'cargo' | 'tanker';

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
};

// Submarine health — from hexa-turnos' ship model (SHIP_CLASS_STATS.submarine
// Type VII: hpMax 50), reduced to the single player sub: no fuel/tonnage/turn
// machinery, just hull points, damage and game over.
export const SUB_HP_MAX = 50;

export const game = $state({
  x: 0,
  z: 0,
  heading: 0,
  moving: false,
  submerged: false,
  // Hull points. Machine-gun tracers chip away at this while surfaced.
  hp: SUB_HP_MAX,
  gameOver: false,
  // Transient red vignette on hit (set to 1 on damage, decayed per-frame by
  // Scene, rendered as an overlay by the HUD).
  hitFlash: 0,
  // Current hex tile under the sub (updated every frame by Scene).
  currentTileQ: 0,
  currentTileR: 0,
  // Visited tiles — keys are "q,r" strings.
  visited: new Set<string>(),
  visitedCount: 0,
  // Set by Board once cells are computed.
  totalTiles: 0,

  // --- Enemy vessels ---
  enemies: [
    { id: 'warship-1', type: 'warship', name: 'Destructor', q: 6, r: -7, active: true },
    { id: 'cargo-1', type: 'cargo', name: 'Carguero', q: -5, r: 4, active: true },
    { id: 'tanker-1', type: 'tanker', name: 'Petrolero', q: 0, r: 8, active: false },
    { id: 'subix-1', type: 'submarineIx', name: 'U-Boot', q: -4, r: -6, active: false },
  ] as Enemy[],
  // Context-menu selection. selectedEnemyId = null → no menu open.
  // menuMode: null = main card only, 'action' = the Acción submenu is open.
  selectedEnemyId: null as string | null,
  menuMode: null as null | 'action',
  // Screen-space anchor for the HTML context menu, written by Scene each
  // frame while a menu is open (so it follows a moving vehicle).
  menuSx: 0,
  menuSy: 0,
  // Move mode: after picking "Mover", the next click on the sea relocates the
  // selected vehicle. The actual placement is applied in Scene, which has the
  // world-space click point.
  moveMode: false,
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
}

export function closeEnemyMenu() {
  game.selectedEnemyId = null;
  game.menuMode = null;
  game.moveMode = false;
}

export function toggleEnemyActive(id: string) {
  const e = game.enemies.find((x) => x.id === id);
  if (e) e.active = !e.active;
}

// Apply damage to the submarine's hull (hexa-turnos hp model). Clamps at 0
// and flips game over; further damage is ignored once sunk.
export function damageSub(amount: number) {
  if (game.gameOver) return;
  game.hp = Math.max(0, game.hp - amount);
  game.hitFlash = 1;
  if (game.hp <= 0) game.gameOver = true;
}

// Restart after sinking: fresh hull, back to the arena center, progress
// cleared. Enemies keep their state (position/active) — the threat remains.
export function resetGame() {
  game.hp = SUB_HP_MAX;
  game.gameOver = false;
  game.hitFlash = 0;
  game.x = 0;
  game.z = 0;
  game.heading = 0;
  game.moving = false;
  game.submerged = false;
  game.visited.clear();
  game.visitedCount = 0;
  closeEnemyMenu();
}

// Enter move mode for the currently selected vehicle: the menu hides and the
// next sea click (handled in Scene) relocates it.
export function startMove() {
  if (!game.selectedEnemyId) return;
  game.moveMode = true;
  game.menuMode = null;
}

export function cancelMove() {
  game.moveMode = false;
}
