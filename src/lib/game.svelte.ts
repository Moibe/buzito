// Shared game state — the single source of truth for the submarine.
// The Scene (inside <Canvas>) integrates x/z/heading from the keyboard in a
// useTask; the HTML HUD (outside <Canvas>) reads/toggles `submerged`.
export const game = $state({
  // World position on the XZ plane.
  x: 0,
  z: 0,
  // rotation.y. With heading = θ, the bow points at world (-sin θ, -cos θ).
  heading: 0,
  // True while the physics reports non-zero speed. Drives the wake.
  moving: false,
  // Below the waterline? Toggled by the HUD button and the Space key.
  submerged: false,
});

export function toggleSubmerged() {
  game.submerged = !game.submerged;
}
