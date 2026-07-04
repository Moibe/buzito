<script lang="ts">
  import { Canvas } from '@threlte/core';
  import Scene from '$lib/Scene.svelte';
  import {
    game,
    SUB_HP_MAX,
    toggleSubmerged,
    markCurrentTile,
    closeEnemyMenu,
    toggleEnemyActive,
    startMove,
    cancelMove,
    resetGame,
  } from '$lib/game.svelte';

  const hpPct = $derived((game.hp / SUB_HP_MAX) * 100);

  function onDiveClick(e: MouseEvent) {
    markCurrentTile();
    toggleSubmerged();
    (e.currentTarget as HTMLButtonElement).blur();
  }

  // The enemy whose context menu is open (null = no menu).
  const selectedEnemy = $derived(
    game.enemies.find((e) => e.id === game.selectedEnemyId) ?? null
  );

  function onSceneContextMenu(e: MouseEvent) {
    // Right-click: cancel move mode if active, otherwise close the menu.
    // Always suppress the browser's context menu.
    e.preventDefault();
    if (game.moveMode) cancelMove();
    else closeEnemyMenu();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scene" oncontextmenu={onSceneContextMenu}>
  <Canvas>
    <Scene />
  </Canvas>
</div>

<div class="hud">
  <div class="hint">
    ← → girar · ↑ ↓ avanzar / reversa · Espacio: sumergir · clic en un enemigo: menú
  </div>
  <div class="progress">{game.visitedCount} / {game.totalTiles}</div>
  <button class="dive-btn" class:submerged={game.submerged} onclick={onDiveClick}>
    {game.submerged ? '▲ Emerger' : '▼ Sumergir'}
  </button>
</div>

<!-- Submarine stats panel (top-left) — hull bar, hexa-turnos ShipStats style. -->
<div class="stats">
  <div class="stats-title">Submarino · Tipo VII</div>
  <div class="stat-row">
    <span class="stat-label">Casco</span>
    <span class="stat-value">{game.hp}/{SUB_HP_MAX}</span>
  </div>
  <div class="stat-bar">
    <div class="stat-bar-fill hp" style="width: {hpPct}%"></div>
  </div>
</div>

<!-- Red vignette flash on hit (opacity driven per-frame from game.hitFlash). -->
{#if game.hitFlash > 0}
  <div class="hit-vignette" style="opacity: {game.hitFlash * 0.6}"></div>
{/if}

<!-- Game over overlay. -->
{#if game.gameOver}
  <div class="gameover">
    <div class="gameover-card">
      <h1>¡Hundido!</h1>
      <p>{game.deathCause || 'Tu casco no aguantó.'}</p>
      <button onclick={resetGame}>Reintentar</button>
    </div>
  </div>
{/if}

<!-- Enemy context menu — main card + Acción submenu, anchored to the selected
     enemy's projected screen position (computed in Scene). Hidden while in
     Move mode (the board is being used to pick the destination). -->
{#if selectedEnemy && !game.moveMode}
  <div
    class="ctx-menu"
    style="left: {game.menuSx + 24}px; top: {game.menuSy - 30}px;"
    role="menu"
  >
    <div class="ctx-title">{selectedEnemy.name}</div>
    <button onclick={startMove}>Mover</button>
    <button class:active={game.menuMode === 'action'} onclick={() => (game.menuMode = 'action')}>
      Acción ▸
    </button>
    <button class="back" onclick={closeEnemyMenu}>✕ Cerrar</button>
  </div>
  {#if game.menuMode === 'action'}
    <div
      class="ctx-menu submenu"
      style="left: {game.menuSx + 24 + 138}px; top: {game.menuSy - 30 + 60}px;"
      role="menu"
    >
      <button onclick={() => toggleEnemyActive(selectedEnemy.id)}>
        {selectedEnemy.active ? 'Desactivar' : 'Activar'}
      </button>
      <button class="back" onclick={() => (game.menuMode = null)}>← Atrás</button>
    </div>
  {/if}
{/if}

<!-- Move-mode banner: shown while waiting for the sea click that relocates
     the selected vehicle. -->
{#if selectedEnemy && game.moveMode}
  <div class="move-hint">
    Haz clic en el mar para mover a <b>{selectedEnemy.name}</b> · clic derecho para cancelar
  </div>
{/if}

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

  /* Enemy context menu (main card + submenu) — gold theme, same chrome as
     the hexa-turnos ctx menu. */
  .ctx-menu {
    position: fixed;
    z-index: 20;
    background: rgba(10, 20, 30, 0.88);
    border: 1px solid rgba(255, 215, 0, 0.6);
    border-radius: 8px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .ctx-title {
    color: #fff3b8;
    font: 700 12px/1 system-ui, sans-serif;
    padding: 6px 10px 8px;
    border-bottom: 1px solid rgba(255, 215, 0, 0.18);
    margin-bottom: 2px;
    letter-spacing: 0.03em;
  }
  .ctx-menu button {
    background: transparent;
    color: #ffd700;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 8px 16px;
    cursor: pointer;
    text-align: left;
    min-width: 118px;
    font: 600 13px/1 system-ui, sans-serif;
    transition: background 0.1s, border-color 0.1s;
  }
  .ctx-menu button:hover {
    background: rgba(255, 215, 0, 0.12);
    border-color: rgba(255, 215, 0, 0.5);
  }
  .ctx-menu button:active {
    background: rgba(255, 215, 0, 0.22);
  }
  .ctx-menu button.active {
    background: rgba(255, 215, 0, 0.18);
    border-color: rgba(255, 215, 0, 0.6);
  }
  .ctx-menu button.back {
    color: rgba(255, 215, 0, 0.55);
    margin-top: 4px;
    border-top: 1px solid rgba(255, 215, 0, 0.18);
    border-radius: 0 0 4px 4px;
    padding-top: 10px;
  }
  .ctx-menu button.back:hover {
    color: #ffd700;
  }

  /* Submarine stats panel — same chrome as the ctx menu; bar styles lifted
     from hexa-turnos ShipStats. */
  .stats {
    position: fixed;
    top: 18px;
    left: 18px;
    z-index: 15;
    min-width: 190px;
    background: rgba(10, 20, 30, 0.85);
    border: 1px solid rgba(255, 215, 0, 0.6);
    border-radius: 8px;
    padding: 12px 14px;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    font: 500 13px/1.2 system-ui, sans-serif;
    color: #ffd700;
  }
  .stats-title {
    font-weight: 700;
    font-size: 12px;
    color: #fff3b8;
    letter-spacing: 0.04em;
    padding-bottom: 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(255, 215, 0, 0.2);
  }
  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .stat-label {
    color: rgba(255, 215, 0, 0.75);
    font-weight: 500;
  }
  .stat-value {
    font-variant-numeric: tabular-nums;
  }
  .stat-bar {
    height: 6px;
    background: rgba(255, 215, 0, 0.15);
    border-radius: 3px;
    margin-top: 4px;
    overflow: hidden;
  }
  .stat-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.25s ease-out;
  }
  .stat-bar-fill.hp {
    background: linear-gradient(90deg, #c43838, #e85a5a);
  }

  /* Red vignette flash when the sub takes a hit. */
  .hit-vignette {
    position: fixed;
    inset: 0;
    z-index: 18;
    pointer-events: none;
    box-shadow: inset 0 0 120px 40px rgba(200, 30, 30, 0.75);
  }

  /* Game over overlay. */
  .gameover {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(4, 10, 16, 0.65);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
  }
  .gameover-card {
    background: rgba(10, 20, 30, 0.92);
    border: 1px solid rgba(255, 215, 0, 0.6);
    border-radius: 12px;
    padding: 28px 40px;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  }
  .gameover-card h1 {
    margin: 0 0 8px;
    color: #e85a5a;
    font: 800 28px/1 system-ui, sans-serif;
    letter-spacing: 0.04em;
  }
  .gameover-card p {
    margin: 0 0 18px;
    color: rgba(255, 215, 0, 0.8);
    font: 500 14px/1.4 system-ui, sans-serif;
  }
  .gameover-card button {
    background: rgba(255, 215, 0, 0.15);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.7);
    border-radius: 8px;
    padding: 10px 26px;
    font: 700 14px/1 system-ui, sans-serif;
    cursor: pointer;
    transition: background 0.15s;
  }
  .gameover-card button:hover {
    background: rgba(255, 215, 0, 0.28);
  }

  /* Move-mode banner (top center). */
  .move-hint {
    position: fixed;
    top: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 25;
    background: rgba(10, 20, 30, 0.85);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.6);
    border-radius: 8px;
    padding: 9px 16px;
    font: 600 13px/1 system-ui, sans-serif;
    letter-spacing: 0.02em;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    pointer-events: none;
  }
  .move-hint b {
    color: #fff3b8;
  }
</style>
