<script lang="ts">
  import { Canvas } from '@threlte/core';
  import Scene from '$lib/Scene.svelte';
  import {
    game,
    SUB_HP_MAX,
    closeEnemyMenu,
    toggleEnemyActive,
    toggleAllEnemies,
    resetGame,
  } from '$lib/game.svelte';

  const hpPct = $derived((game.hp / SUB_HP_MAX) * 100);
  // TEMP (debug): whether any enemy is currently active.
  const enemiesActive = $derived(game.enemies.some((e) => e.active));

  // The enemy whose context menu is open (null = no menu).
  const selectedEnemy = $derived(
    game.enemies.find((e) => e.id === game.selectedEnemyId) ?? null
  );

  function onSceneContextMenu(e: MouseEvent) {
    // Right-click closes the menu (and suppresses the browser's own).
    e.preventDefault();
    closeEnemyMenu();
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
    (seleccionado + clic en el mar: mover)
  </div>
  <div class="progress">{game.visitedCount} / {game.totalTiles}</div>
  <!-- TEMP (debug): freeze / reactivate all enemies at once. -->
  <button class="debug-btn" onclick={toggleAllEnemies}>
    {enemiesActive ? '⏸ Detener enemigos' : '▶ Reactivar enemigos'}
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

<!-- Green vignette flash on healing (blue-orb pickup). -->
{#if game.healFlash > 0}
  <div class="heal-vignette" style="opacity: {game.healFlash * 0.5}"></div>
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

<!-- Enemy health bars — a small bar to the upper-right of each enemy, following
     its projected screen position (written by Scene each frame). -->
{#each game.enemies as e (e.id)}
  <div class="enemy-hp" style="left: {e.sx + 16}px; top: {e.sy - 34}px;">
    <div
      class="enemy-hp-fill"
      style="width: {(e.hp / e.hpMax) * 100}%; background: hsl({120 * (e.hp / e.hpMax)}, 70%, 46%);"
    ></div>
  </div>
{/each}

<!-- Enemy context menu — main card + Acción submenu, anchored to the selected
     enemy's projected screen position (computed in Scene). Hidden while in
     Move mode (the board is being used to pick the destination). -->
{#if selectedEnemy}
  <div
    class="ctx-menu"
    style="left: {game.menuSx + 24}px; top: {game.menuSy - 30}px;"
    role="menu"
    tabindex="-1"
    onpointerenter={() => (game.menuHover = true)}
    onpointerleave={() => (game.menuHover = false)}
  >
    <div class="ctx-title">{selectedEnemy.name}</div>
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
      tabindex="-1"
      onpointerenter={() => (game.menuHover = true)}
      onpointerleave={() => (game.menuHover = false)}
    >
      <button
        onclick={() => {
          toggleEnemyActive(selectedEnemy.id);
          closeEnemyMenu();
        }}
      >
        {selectedEnemy.active ? 'Desactivar' : 'Activar'}
      </button>
      <button class="back" onclick={() => (game.menuMode = null)}>← Atrás</button>
    </div>
  {/if}
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

  /* Enemy health bar — small overlay tracking each enemy's screen position. */
  .enemy-hp {
    position: fixed;
    z-index: 12;
    width: 40px;
    height: 5px;
    background: rgba(10, 20, 30, 0.72);
    border: 1px solid rgba(0, 0, 0, 0.5);
    border-radius: 3px;
    overflow: hidden;
    pointer-events: none;
  }
  .enemy-hp-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.15s linear;
  }

  /* TEMP (debug) button — distinct violet chrome so it reads as a scaffold
     control, not part of the real HUD. */
  .debug-btn {
    background: rgba(60, 20, 70, 0.72);
    color: #e9b8ff;
    border: 1px dashed rgba(200, 130, 240, 0.7);
    border-radius: 8px;
    padding: 9px 14px;
    font: 600 13px/1 system-ui, sans-serif;
    cursor: pointer;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: background 0.15s, border-color 0.15s;
  }
  .debug-btn:hover {
    background: rgba(80, 28, 92, 0.9);
    border-color: rgba(220, 160, 255, 1);
  }
  .debug-btn:active {
    transform: translateY(1px);
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
  .heal-vignette {
    position: fixed;
    inset: 0;
    z-index: 18;
    pointer-events: none;
    box-shadow: inset 0 0 120px 40px rgba(40, 200, 120, 0.7);
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

</style>
