<script lang="ts">
  import { Canvas } from '@threlte/core';
  import Scene from '$lib/Scene.svelte';
  import {
    game,
    config,
    closeEnemyMenu,
    toggleEnemyActive,
    toggleAllEnemies,
    respawnEnemies,
    resetGame,
    startLevel,
    goToLevelSelect,
    reshuffleMissions,
  } from '$lib/game.svelte';

  const hpPct = $derived((game.hp / config.sub.hp) * 100);
  // TEMP (debug): whether any enemy is currently active.
  const enemiesActive = $derived(game.enemies.some((e) => e.active));
  // TEMP (debug): tuning panel open/closed.
  let showConfig = $state(false);
  // Player abilities/upgrades panel (left side) open/closed.
  let showAbilities = $state(false);

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

{#if game.screen === 'select'}
  <!-- Level picker: 8 numbered tiles (4 top, 4 bottom). Click one → its arena. -->
  <div class="levelselect">
    <h1 class="ls-title">buzito</h1>
    <p class="ls-sub">Elige tu misión</p>
    <div class="ls-grid">
      {#each game.missions as city, i}
        <button class="ls-tile" onclick={() => startLevel(i + 1)}>
          <span class="ls-tile-num">{i + 1}</span>
          <span class="ls-tile-city">{city}</span>
        </button>
      {/each}
    </div>
    <button class="ls-reroll" onclick={reshuffleMissions}>🎲 Otras ciudades</button>
  </div>
{:else}
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
  <button class="level-btn" onclick={goToLevelSelect}>◄ {game.missionCity || 'Misiones'}</button>
  <!-- TEMP (debug): freeze / reactivate all enemies at once. -->
  <button class="debug-btn" onclick={toggleAllEnemies}>
    {enemiesActive ? '⏸ Detener enemigos' : '▶ Reactivar enemigos'}
  </button>
  <!-- Open the player abilities/upgrades panel (left side). -->
  <button class="debug-btn abil-btn" onclick={() => (showAbilities = !showAbilities)}>🔱 Submarino</button>
  <!-- TEMP (debug): open the tuning panel. -->
  <button class="debug-btn" onclick={() => (showConfig = !showConfig)}>⚙ Config</button>
</div>

<!-- Submarine stats panel (top-left) — hull bar, hexa-turnos ShipStats style. -->
<div class="stats">
  <div class="stats-title">Submarino · Tipo VII</div>
  <div class="stat-row">
    <span class="stat-label">Casco</span>
    <span class="stat-value">{game.hp}/{config.sub.hp}</span>
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

<!-- Player abilities/upgrades — a LEFT-side panel (teal), mirroring the enemy
     config on the right. Toggle each ability on/off and tune its knobs to test.
     Bound to config.player; Scene reads it live each frame. -->
{#if showAbilities}
  <div class="abil-panel">
    <div class="abil-head">
      <span>🔱 Submarino</span>
      <button class="abil-x" onclick={() => (showAbilities = false)}>✕</button>
    </div>
    <div class="abil-body">
      <div class="abil-sec">Misiles · tecla M</div>
      <label class="abil-toggle">
        <span>Activar</span>
        <input type="checkbox" bind:checked={config.player.missiles.enabled} />
      </label>
      <label class="knob"><span>Daño</span><input type="number" step="1" min="0" bind:value={config.player.missiles.damage} /></label>
      <label class="knob"><span>Velocidad</span><input type="number" step="0.5" min="1" bind:value={config.player.missiles.speed} /></label>
      <label class="knob"><span>Cadencia (s)</span><input type="number" step="0.1" min="0.1" bind:value={config.player.missiles.interval} /></label>

      <div class="abil-sec">Mayor velocidad</div>
      <label class="abil-toggle">
        <span>Activar</span>
        <input type="checkbox" bind:checked={config.player.speedBoost.enabled} />
      </label>
      <label class="knob"><span>Multiplicador</span><input type="number" step="0.1" min="1" bind:value={config.player.speedBoost.mult} /></label>
    </div>
  </div>
{/if}

<!-- TEMP (debug): live tuning panel for enemy/sub/pickup characteristics.
     Bound directly to the reactive `config`; Scene reads it each frame so
     most sliders take effect instantly (HP applies on "Regenerar enemigos"). -->
{#if showConfig}
  <div class="cfg-panel">
    <div class="cfg-head">
      <span>⚙ Configuración</span>
      <button class="cfg-x" onclick={() => (showConfig = false)}>✕</button>
    </div>
    <div class="cfg-body">
      <div class="cfg-sec">Submarino (jugador)</div>
      <label class="knob"><span>Casco</span><input type="number" step="5" min="1" bind:value={config.sub.hp} /></label>
      <label class="knob"><span>Velocidad</span><input type="number" step="0.1" min="0" bind:value={config.sub.speed} /></label>
      <label class="knob"><span>Giro</span><input type="number" step="0.1" min="0" bind:value={config.sub.turnRate} /></label>

      <div class="cfg-sec">Destructor</div>
      <label class="knob"><span>Casco</span><input type="number" step="5" min="1" bind:value={config.enemies.warship.hp} /></label>
      <label class="knob"><span>Embestida</span><input type="number" step="1" min="0" bind:value={config.enemies.warship.ram} /></label>
      <label class="knob"><span>Velocidad</span><input type="number" step="0.1" min="0" bind:value={config.enemies.warship.speed} /></label>
      <label class="knob"><span>Cadencia (s)</span><input type="number" step="0.01" min="0.01" bind:value={config.enemies.warship.fireInterval} /></label>
      <label class="knob"><span>Daño bala</span><input type="number" step="1" min="0" bind:value={config.enemies.warship.tracerDamage} /></label>
      <label class="knob"><span>Alcance (tiles)</span><input type="number" step="0.5" min="0" bind:value={config.enemies.warship.range} /></label>

      <div class="cfg-sec">Carguero</div>
      <label class="knob"><span>Casco</span><input type="number" step="5" min="1" bind:value={config.enemies.cargo.hp} /></label>
      <label class="knob"><span>Embestida</span><input type="number" step="1" min="0" bind:value={config.enemies.cargo.ram} /></label>
      <label class="knob"><span>Velocidad</span><input type="number" step="0.1" min="0" bind:value={config.enemies.cargo.speed} /></label>

      <div class="cfg-sec">U-Boat</div>
      <label class="knob"><span>Casco</span><input type="number" step="5" min="1" bind:value={config.enemies.submarineIx.hp} /></label>
      <label class="knob"><span>Embestida</span><input type="number" step="1" min="0" bind:value={config.enemies.submarineIx.ram} /></label>
      <label class="knob"><span>Velocidad</span><input type="number" step="0.1" min="0" bind:value={config.enemies.submarineIx.speed} /></label>
      <label class="knob"><span>Prof. mín (s)</span><input type="number" step="0.5" min="0.5" bind:value={config.enemies.submarineIx.depthMin} /></label>
      <label class="knob"><span>Prof. máx (s)</span><input type="number" step="0.5" min="0.5" bind:value={config.enemies.submarineIx.depthMax} /></label>

      <div class="cfg-sec">Bombardero</div>
      <label class="knob"><span>Casco</span><input type="number" step="5" min="1" bind:value={config.enemies.bomber.hp} /></label>
      <label class="knob"><span>Embestida</span><input type="number" step="1" min="0" bind:value={config.enemies.bomber.ram} /></label>
      <label class="knob"><span>Velocidad</span><input type="number" step="0.1" min="0" bind:value={config.enemies.bomber.speed} /></label>
      <label class="knob"><span>Salva mín (s)</span><input type="number" step="0.5" min="0.5" bind:value={config.enemies.bomber.salvoMin} /></label>
      <label class="knob"><span>Salva máx (s)</span><input type="number" step="0.5" min="0.5" bind:value={config.enemies.bomber.salvoMax} /></label>
      <label class="knob"><span>Nº bombas</span><input type="number" step="1" min="1" bind:value={config.enemies.bomber.salvoSize} /></label>
      <label class="knob"><span>Daño bomba</span><input type="number" step="1" min="0" bind:value={config.enemies.bomber.bombDamage} /></label>
      <label class="knob"><span>Radio explosión</span><input type="number" step="0.2" min="0.2" bind:value={config.enemies.bomber.blastRadius} /></label>

      <div class="cfg-sec">Tiburón</div>
      <label class="knob"><span>Casco</span><input type="number" step="5" min="1" bind:value={config.enemies.shark.hp} /></label>
      <label class="knob"><span>Embestida</span><input type="number" step="1" min="0" bind:value={config.enemies.shark.ram} /></label>
      <label class="knob"><span>Velocidad</span><input type="number" step="0.1" min="0" bind:value={config.enemies.shark.speed} /></label>
      <label class="knob"><span>Prof. mín (s)</span><input type="number" step="0.5" min="0.5" bind:value={config.enemies.shark.depthMin} /></label>
      <label class="knob"><span>Prof. máx (s)</span><input type="number" step="0.5" min="0.5" bind:value={config.enemies.shark.depthMax} /></label>
      <label class="knob"><span>Torpedo cada (s)</span><input type="number" step="0.5" min="0.3" bind:value={config.enemies.shark.torpedoInterval} /></label>
      <label class="knob"><span>Daño torpedo</span><input type="number" step="1" min="0" bind:value={config.enemies.shark.torpedoDamage} /></label>
      <label class="knob"><span>Vel. torpedo</span><input type="number" step="0.5" min="1" bind:value={config.enemies.shark.torpedoSpeed} /></label>

      <div class="cfg-sec">Minador</div>
      <label class="knob"><span>Casco</span><input type="number" step="5" min="1" bind:value={config.enemies.minelayer.hp} /></label>
      <label class="knob"><span>Embestida</span><input type="number" step="1" min="0" bind:value={config.enemies.minelayer.ram} /></label>
      <label class="knob"><span>Velocidad</span><input type="number" step="0.1" min="0" bind:value={config.enemies.minelayer.speed} /></label>
      <label class="knob"><span>Mina cada (s)</span><input type="number" step="0.5" min="0.3" bind:value={config.enemies.minelayer.dropInterval} /></label>
      <label class="knob"><span>Daño mina</span><input type="number" step="1" min="0" bind:value={config.enemies.minelayer.mineDamage} /></label>
      <label class="knob"><span>Máx. minas</span><input type="number" step="1" min="1" max="16" bind:value={config.enemies.minelayer.maxMines} /></label>

      <div class="cfg-sec">Esferas de vida</div>
      <label class="knob"><span>Curación</span><input type="number" step="1" min="0" bind:value={config.pickup.heal} /></label>
      <label class="knob"><span>Reaparición (s)</span><input type="number" step="10" min="5" bind:value={config.pickup.respawn} /></label>

      <button class="cfg-regen" onclick={respawnEnemies}>♻ Regenerar enemigos (aplica casco)</button>
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

  /* Level picker screen. */
  .levelselect {
    position: fixed;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    text-align: center;
  }
  .ls-title {
    margin: 0;
    color: #ffd700;
    font: 800 46px/1 system-ui, sans-serif;
    letter-spacing: 0.08em;
    text-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
  }
  .ls-sub {
    margin: 0 0 26px;
    color: rgba(255, 255, 255, 0.82);
    font: 500 16px/1 system-ui, sans-serif;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .ls-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }
  .ls-tile {
    width: 120px;
    height: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
    background: rgba(10, 25, 40, 0.72);
    color: #ffd700;
    border: 2px solid rgba(255, 215, 0, 0.55);
    border-radius: 12px;
    cursor: pointer;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    transition: transform 0.12s, background 0.15s, border-color 0.15s;
  }
  .ls-tile-num {
    font: 800 16px/1 system-ui, sans-serif;
    color: rgba(255, 215, 0, 0.5);
  }
  .ls-tile-city {
    font: 700 16px/1.15 system-ui, sans-serif;
    text-align: center;
    word-break: break-word;
    letter-spacing: 0.01em;
  }
  .ls-tile:hover {
    background: rgba(20, 45, 68, 0.92);
    border-color: rgba(255, 215, 0, 1);
    transform: translateY(-3px);
  }
  .ls-tile:active {
    transform: translateY(0);
  }
  .ls-reroll {
    margin-top: 26px;
    background: rgba(10, 20, 30, 0.65);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.6);
    border-radius: 8px;
    padding: 10px 18px;
    font: 600 14px/1 system-ui, sans-serif;
    cursor: pointer;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: background 0.15s, border-color 0.15s;
  }
  .ls-reroll:hover {
    background: rgba(20, 45, 68, 0.9);
    border-color: rgba(255, 215, 0, 1);
  }

  /* "Back to levels" button in the arena HUD. */
  .level-btn {
    background: rgba(10, 20, 30, 0.65);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.6);
    border-radius: 8px;
    padding: 9px 14px;
    font: 600 13px/1 system-ui, sans-serif;
    cursor: pointer;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: background 0.15s, border-color 0.15s;
  }
  .level-btn:hover {
    background: rgba(10, 20, 30, 0.85);
    border-color: rgba(255, 215, 0, 1);
  }

  /* TEMP (debug): live tuning panel. Violet scaffold theme, scrollable. */
  .cfg-panel {
    position: fixed;
    top: 14px;
    right: 14px;
    z-index: 30;
    width: 230px;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    background: rgba(30, 14, 40, 0.92);
    border: 1px solid rgba(200, 130, 240, 0.6);
    border-radius: 10px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    color: #e9b8ff;
    font: 500 12px/1.2 system-ui, sans-serif;
  }
  .cfg-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(200, 130, 240, 0.25);
    font-weight: 700;
    color: #f0d8ff;
  }
  .cfg-x {
    background: transparent;
    border: none;
    color: #e9b8ff;
    font-size: 14px;
    cursor: pointer;
    line-height: 1;
  }
  .cfg-body {
    padding: 8px 12px 12px;
    overflow-y: auto;
  }
  .cfg-sec {
    margin: 12px 0 4px;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #c98fe6;
    border-bottom: 1px dashed rgba(200, 130, 240, 0.3);
    padding-bottom: 3px;
  }
  .cfg-sec:first-child {
    margin-top: 0;
  }
  .knob {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 5px;
  }
  .knob span {
    color: rgba(233, 184, 255, 0.85);
  }
  .knob input {
    width: 66px;
    background: rgba(10, 6, 16, 0.7);
    color: #fff;
    border: 1px solid rgba(200, 130, 240, 0.5);
    border-radius: 5px;
    padding: 3px 6px;
    font: 600 12px/1 system-ui, sans-serif;
    text-align: right;
  }
  .cfg-regen {
    width: 100%;
    margin-top: 14px;
    background: rgba(200, 130, 240, 0.18);
    color: #f0d8ff;
    border: 1px solid rgba(200, 130, 240, 0.7);
    border-radius: 7px;
    padding: 9px;
    font: 700 12px/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .cfg-regen:hover {
    background: rgba(200, 130, 240, 0.32);
  }

  /* Player abilities panel — LEFT side, teal theme (distinct from the violet
     enemy config on the right). Sits below the stats card. Reuses .knob. */
  .abil-panel {
    position: fixed;
    top: 116px;
    left: 14px;
    z-index: 30;
    width: 218px;
    max-height: 78vh;
    display: flex;
    flex-direction: column;
    background: rgba(8, 32, 38, 0.92);
    border: 1px solid rgba(90, 214, 200, 0.6);
    border-radius: 10px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    color: #a9ede4;
    font: 500 12px/1.2 system-ui, sans-serif;
  }
  .abil-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(90, 214, 200, 0.25);
    font-weight: 700;
    color: #d6fbf6;
  }
  .abil-x {
    background: transparent;
    border: none;
    color: #a9ede4;
    font-size: 14px;
    cursor: pointer;
    line-height: 1;
  }
  .abil-body {
    padding: 8px 12px 12px;
    overflow-y: auto;
  }
  .abil-sec {
    margin: 12px 0 4px;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #62d3c6;
    border-bottom: 1px dashed rgba(90, 214, 200, 0.3);
    padding-bottom: 3px;
  }
  .abil-sec:first-child {
    margin-top: 0;
  }
  /* Enable/disable toggle row. */
  .abil-toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;
    font-weight: 600;
    color: #d6fbf6;
  }
  .abil-toggle input {
    width: 18px;
    height: 18px;
    accent-color: #37c4b4;
    cursor: pointer;
  }
  /* Teal-tint the reused .knob inputs while inside the abilities panel. */
  .abil-panel .knob span {
    color: rgba(169, 237, 228, 0.85);
  }
  .abil-panel .knob input {
    border-color: rgba(90, 214, 200, 0.5);
    background: rgba(4, 16, 18, 0.7);
  }
  /* Teal variant of the HUD button that opens this panel. */
  .abil-btn {
    background: rgba(14, 60, 64, 0.72);
    color: #a9ede4;
    border-color: rgba(90, 214, 200, 0.7);
  }
  .abil-btn:hover {
    background: rgba(20, 82, 86, 0.9);
    border-color: rgba(150, 240, 230, 1);
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
