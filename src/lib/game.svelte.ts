export const game = $state({
  x: 0,
  z: 0,
  heading: 0,
  moving: false,
  submerged: false,
  // Current hex tile under the sub (updated every frame by Scene).
  currentTileQ: 0,
  currentTileR: 0,
  // Visited tiles — keys are "q,r" strings.
  visited: new Set<string>(),
  visitedCount: 0,
  // Set by Board once cells are computed.
  totalTiles: 0,
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
