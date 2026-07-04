<script lang="ts">
  import { Canvas } from '@threlte/core';
  import Scene from '$lib/Scene.svelte';
  import { game, toggleSubmerged, markCurrentTile } from '$lib/game.svelte';

  function onDiveClick(e: MouseEvent) {
    markCurrentTile();
    toggleSubmerged();
    (e.currentTarget as HTMLButtonElement).blur();
  }
</script>

<div class="scene">
  <Canvas>
    <Scene />
  </Canvas>
</div>

<div class="hud">
  <div class="hint">← → girar · ↑ ↓ avanzar / reversa · Espacio: sumergir</div>
  <div class="progress">{game.visitedCount} / {game.totalTiles}</div>
  <button class="dive-btn" class:submerged={game.submerged} onclick={onDiveClick}>
    {game.submerged ? '▲ Emerger' : '▼ Sumergir'}
  </button>
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
  }
  :global(body) {
    min-height: 100vh;
    /* Ocean-blue gradient behind the canvas: if the camera ever peeks past
       the hex tiling, the gap blends into the same blue family as the cell
       sides instead of flashing a foreign background color. */
    background: linear-gradient(135deg, #1e5f8a 0%, #0a3d62 100%);
    background-attachment: fixed;
  }
  .scene {
    position: fixed;
    inset: 0;
  }
  .hud {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .hint {
    color: rgba(255, 255, 255, 0.78);
    font: 500 13px/1.4 system-ui, sans-serif;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
  }
  .progress {
    color: #ffd700;
    font: 700 15px/1 system-ui, sans-serif;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    letter-spacing: 0.03em;
  }
  .dive-btn {
    background: rgba(10, 20, 30, 0.65);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.6);
    border-radius: 8px;
    padding: 10px 16px;
    font: 600 14px/1 system-ui, sans-serif;
    cursor: pointer;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: background 0.15s, border-color 0.15s;
  }
  .dive-btn:hover {
    background: rgba(10, 20, 30, 0.85);
    border-color: rgba(255, 215, 0, 1);
  }
  .dive-btn:active {
    transform: translateY(1px);
  }
  .dive-btn.submerged {
    background: rgba(255, 215, 0, 0.18);
    color: #fff3b8;
    border-color: rgba(255, 215, 0, 0.9);
  }
</style>
