<script lang="ts">
  import { Canvas } from '@threlte/core';
  import Scene from '$lib/Scene.svelte';
  import {
    game,
    config,
    closeEnemyMenu,
    toggleEnemyActive,
    resetGame,
    startMission,
    advanceArena,
    goToLevelSelect,
    goToSubScreen,
    goToIntro,
    goToProfile,
    reshuffleMissions,
    startNewCampaign,
    ARENAS_PER_CITY,
    SUB_DETAILS,
    SUB_INTRO,
    setSubColor,
    setSubDetailColor,
    setSubDetail,
    setPlayerName,
    nextIntroCard,
    openSubIntro,
  } from '$lib/game.svelte';
  import SubPreview from '$lib/SubPreview.svelte';
  import IntroScene from '$lib/IntroScene.svelte';
  import CityThumb from '$lib/CityThumb.svelte';
  import { MISSIONS, ENEMY_INFO, BONUS_INFO } from '$lib/missions';
  import type { BonusType } from '$lib/missions';
  import type { EnemyType } from '$lib/game.svelte';
  import { cityFlagCode, cityCountry } from '$lib/cityFlags';

  // The current mission's difficulty definition (for the level indicator).
  const mission = $derived(MISSIONS[game.level - 1] ?? MISSIONS[0]);
  // Campaign progress: the NEXT city picked is played at this level.
  const nextLevel = $derived(Math.min(MISSIONS.length, game.completed.length + 1));
  const nextMission = $derived(MISSIONS[nextLevel - 1]);
  const campaignDone = $derived(game.completed.length >= MISSIONS.length);
  // One heart per current life — an arena win grants an extra life (uncapped,
  // can climb well past the starting count) and a death removes one.
  const lifeSlots = $derived(Array.from({ length: Math.max(0, game.lives) }));
  // Two-step confirm for the "Salir" (reset campaign) button.
  let confirmingExit = $state(false);

  // "Iniciar Juego" flow + the player-name modal.
  let showNameModal = $state(false);
  let nameInput = $state('');
  // Whether confirming the name should advance to the sub screen (first-timer
  // flow) or just save it in place (editing from the profile).
  let nameGoSub = $state(false);
  let nameField = $state.raw<HTMLInputElement | undefined>(undefined);
  $effect(() => {
    if (showNameModal) nameField?.focus();
  });
  // Start: a returning player (already has a saved name) goes straight to their
  // profile; a first-timer is asked for a name, then continues to customization.
  function startGame() {
    if (game.playerName) {
      goToProfile();
    } else {
      nameInput = '';
      nameGoSub = true;
      showNameModal = true;
    }
  }
  // Edit the name from the profile (stays on the profile after saving).
  function editName() {
    nameInput = game.playerName;
    nameGoSub = false;
    showNameModal = true;
  }
  function confirmName() {
    const n = nameInput.trim();
    if (!n) return; // a name is required to proceed
    setPlayerName(n);
    showNameModal = false;
    if (nameGoSub) game.screen = 'sub';
  }

  const hpPct = $derived(
    config.sub.hp > 0 ? Math.min(100, (game.hp / config.sub.hp) * 100) : 0
  );
  // Mission coverage percentage (clamped to 100 for display).
  const missionPct = $derived(
    game.totalTiles > 0 ? Math.min(100, (game.visitedCount / game.totalTiles) * 100) : 0
  );
  // True integer % target.
  const missionPctInt = $derived(Math.round(missionPct));
  // The % actually SHOWN — it climbs to the target ONE POINT AT A TIME so a jump
  // (wide mode / power-ups / win fill) counts up 29,30,31… each with its own pop.
  // Decreases (arena reset → 0) snap instantly. pctCursor is a plain mirror so
  // the effect doesn't depend on displayedPct (only on the target).
  let displayedPct = $state(0);
  let pctCursor = 0;
  $effect(() => {
    const target = missionPctInt;
    if (target <= pctCursor) {
      pctCursor = target;
      displayedPct = target;
      return;
    }
    const advance = () => {
      pctCursor += 1;
      displayedPct = pctCursor;
    };
    advance(); // first step immediately (responsive on a single +1)
    if (pctCursor >= target) return;
    // Pace: ~130ms per step, but speed up big jumps so the whole climb is ≤ ~1.6s.
    const step = Math.max(45, Math.min(130, 1600 / (target - pctCursor)));
    const id = setInterval(() => {
      advance();
      if (pctCursor >= target) clearInterval(id);
    }, step);
    return () => clearInterval(id);
  });

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

{#if game.screen === 'intro'}
  <!-- Cinematic intro: title, hero submarine, and Start. -->
  <div class="intro">
    <div class="intro-hero">
      <Canvas>
        <IntroScene color={config.sub.color} detailColor={config.sub.detailColor} detail={config.sub.detail} />
      </Canvas>
    </div>
    <div class="intro-overlay">
      <div class="intro-head">
        <h1 class="intro-title">buzito</h1>
        <p class="intro-tag">Sumérgete · Descubre · Conquista</p>
      </div>
      <button class="intro-start" onclick={startGame}>Iniciar Juego</button>
    </div>
  </div>
{:else if game.screen === 'profile'}
  <!-- Player profile: name, submarine, and the cities conquered so far. -->
  <div class="subscreen profilescreen">
    <button type="button" class="ls-title" title="Volver al inicio" onclick={goToIntro}>buzito</button>

    <div class="prof-top">
      <div class="sub-preview prof-sub">
        <Canvas>
          <SubPreview color={config.sub.color} detailColor={config.sub.detailColor} detail={config.sub.detail} />
        </Canvas>
      </div>
      <div class="prof-id">
        <span class="prof-hi">Capitán</span>
        <h2 class="prof-name">
          {game.playerName || 'Sin nombre'}
          <button class="prof-edit" title="Cambiar nombre" aria-label="Cambiar nombre" onclick={editName}>✎</button>
        </h2>
        <p class="prof-count">
          🏆 {game.conquered.length}
          {game.conquered.length === 1 ? 'ciudad conquistada' : 'ciudades conquistadas'}
        </p>
        <button class="sub-back" onclick={goToSubScreen}>🎨 Personalizar submarino</button>
      </div>
    </div>

    <h3 class="prof-section">Ciudades conquistadas</h3>
    {#if game.conquered.length > 0}
      <div class="prof-cities">
        {#each game.conquered as city (city)}
          <CityThumb name={city} />
        {/each}
      </div>
    {:else}
      <p class="prof-empty">
        Aún no has conquistado ninguna ciudad.<br />¡Zarpa y libera tu primera!
      </p>
    {/if}

    <button class="ls-reroll continue" onclick={goToLevelSelect}>Iniciar Campaña →</button>
  </div>
{:else if game.screen === 'sub'}
  <!-- Submarine choice & customization, shown before the city picker. -->
  <div class="subscreen">
    <button type="button" class="ls-title" title="Volver al inicio" onclick={goToIntro}>buzito</button>
    <p class="ls-sub">Personaliza tu submarino</p>
    <button class="sub-back" onclick={goToProfile}>◄ Perfil</button>
    <div class="sub-preview">
      <Canvas>
        <SubPreview color={config.sub.color} detailColor={config.sub.detailColor} detail={config.sub.detail} />
      </Canvas>
    </div>
    <div class="sub-colors">
      <label>
        <span>Color primario</span>
        <input type="color" value={config.sub.color} oninput={(e) => setSubColor(e.currentTarget.value)} />
      </label>
      <label>
        <span>Color secundario</span>
        <input type="color" value={config.sub.detailColor} oninput={(e) => setSubDetailColor(e.currentTarget.value)} />
      </label>
    </div>
    <div class="sub-details">
      {#each SUB_DETAILS as d}
        <button class="sub-detail-opt" class:sel={config.sub.detail === d.id} onclick={() => setSubDetail(d.id)}>
          {d.name}
        </button>
      {/each}
    </div>
    <button class="ls-reroll continue" onclick={goToLevelSelect}>Continuar →</button>
  </div>
{:else if game.screen === 'select'}
  <!-- City picker. Pick any city in any order — the Nth you beat is played at
       difficulty N. Beaten cities are marked and locked. -->
  <div class="levelselect">
    <button type="button" class="ls-title" title="Volver al inicio" onclick={goToIntro}>buzito</button>
    {#if campaignDone}
      <p class="ls-sub">🏆 ¡Campaña completada! Liberaste las 8 ciudades.</p>
    {:else}
      <p class="ls-sub">
        Elige tu ciudad — será tu
        <b>Nivel {nextLevel}</b> · {nextMission.label}
        <span class="ls-progress">({game.completed.length}/{MISSIONS.length} liberadas)</span>
        <span class="ls-progress lives-hearts">
          ·
          {#each lifeSlots as _}
            <span class="life-heart">♥</span>
          {/each}
        </span>
      </p>
    {/if}
    <div class="ls-nav-row">
      <button class="sub-back" onclick={goToProfile}>◄ Perfil</button>
      <button class="sub-back" onclick={goToSubScreen}>◄ Submarino</button>
    </div>
    <div class="ls-grid">
      {#each game.missions as city}
        {@const done = game.completed.includes(city)}
        <button
          class="ls-tile"
          class:done
          disabled={done}
          onclick={() => {
            confirmingExit = false;
            startMission(city);
          }}
        >
          {#if done}
            <span class="ls-tile-check">✓</span>
          {/if}
          <span class="ls-tile-city">{city}</span>
          {#if cityFlagCode(city)}
            <span class="ls-tile-flag fi fi-{cityFlagCode(city)}" title={cityCountry(city)} aria-hidden="true"></span>
          {/if}
        </button>
      {/each}
    </div>
    {#if !game.campaignStarted || campaignDone}
      <button class="ls-reroll" onclick={reshuffleMissions}>🎲 Otras ciudades (reinicia)</button>
    {:else if !confirmingExit}
      <button class="ls-exit" onclick={() => (confirmingExit = true)}>Salir</button>
    {:else}
      <div class="ls-confirm">
        <span>¿Salir y empezar todo de nuevo? Se perderá tu progreso.</span>
        <div class="ls-confirm-actions">
          <button
            class="ls-confirm-yes"
            onclick={() => {
              reshuffleMissions();
              confirmingExit = false;
            }}
          >
            Sí, salir
          </button>
          <button class="ls-confirm-no" onclick={() => (confirmingExit = false)}>Cancelar</button>
        </div>
      </div>
    {/if}
  </div>
{:else}
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scene" oncontextmenu={onSceneContextMenu}>
  <Canvas>
    <!-- Remount the scene per arena so all transient state resets cleanly when
         flying to the next arena (new image, fresh sub/enemies/pickups). -->
    {#key game.arena}
      <Scene />
    {/key}
  </Canvas>
</div>

<div class="hud">
  <div class="progress">
    {#key displayedPct}
      <span class="progress-pct">{displayedPct}%</span>
    {/key}
    <span class="progress-count">
      <svg class="tile-spin" viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="12,2 20.66,7 20.66,17 12,22 3.34,17 3.34,7" />
      </svg>
      {game.visitedCount} / {game.totalTiles}
    </span>
  </div>
</div>

<!-- Help: re-open the submarine how-to-play walkthrough at any time. -->
<button class="help-btn" onclick={openSubIntro} title="¿Cómo jugar?" aria-label="Cómo jugar">?</button>

<!-- Submarine stats panel (top-left) — hull bar, hexa-turnos ShipStats style. -->
<div class="stats">
  <div class="stats-title">
    <button class="home-btn" onclick={goToLevelSelect} title="Volver a Misiones" aria-label="Volver a Misiones">
      🏠
    </button>
    <span class="lvl-badge">Nivel {game.level}</span>
    <span class="lvl-diff">{mission.label}</span>
  </div>
  <div class="stat-sub">🎯 {game.missionCity} · Arena {game.arena}/{ARENAS_PER_CITY}</div>
  <div class="stat-row" style="margin-top: 10px;">
    <span class="stat-label">Vidas</span>
    <span class="stat-value lives-hearts">
      {#each lifeSlots as _}
        <span class="life-heart">♥</span>
      {/each}
    </span>
  </div>
  <div class="stat-row" style="margin-top: 6px;">
    <span class="stat-label">Energía</span>
    <span class="stat-value">{Math.max(0, Math.round(game.hp))}/{Math.round(config.sub.hp)}</span>
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

<!-- Win banner — top-center, celebratory, does NOT blur/cover the scene (unlike
     the game-over overlay). Non-interactive; play continues underneath. -->
{#if game.won}
  <div class="win-banner">
    <span class="win-title">🎉 ¡Felicitaciones!</span>
    <span class="win-sub">
      {#if game.arena < ARENAS_PER_CITY}
        {game.missionCity} · Arena {game.arena}/{ARENAS_PER_CITY} descubierta
      {:else}
        ¡{game.missionCity} completada! ({ARENAS_PER_CITY}/{ARENAS_PER_CITY})
      {/if}
    </span>
  </div>
  <!-- Continue: next arena of the same city, or (after arena 4) back to the picker. -->
  <div class="win-cta">
    {#if game.arena < ARENAS_PER_CITY}
      <button onclick={advanceArena}>✈ Volar a la siguiente misión ({game.arena + 1}/{ARENAS_PER_CITY})</button>
    {:else}
      <button onclick={goToLevelSelect}>
        {campaignDone ? '🏆 Campaña completada — Ver misiones' : '🏁 Ciudad completada — Volver a misiones'}
      </button>
    {/if}
  </div>
{/if}

<!-- Explanation card — a NEW ENEMY (first seen), a NEW BONUS (first touched), or
     the submarine how-to-play walkthrough (multi-step); anchored to the actor. -->
{#if game.introCard}
  {@const card = game.introCard}
  {@const info =
    card.kind === 'enemy'
      ? ENEMY_INFO[card.key as EnemyType]
      : card.kind === 'bonus'
        ? BONUS_INFO[card.key as BonusType]
        : SUB_INTRO[card.step]}
  {@const isSub = card.kind === 'sub'}
  {@const lastStep = isSub && card.step >= SUB_INTRO.length - 1}
  <div class="enemy-intro" style="left: {card.sx}px; top: {card.sy}px;">
    <span class="ei-tag">
      {card.kind === 'enemy' ? '¡Nuevo enemigo!' : card.kind === 'bonus' ? '¡Nuevo poder!' : '¿Cómo jugar?'}
    </span>
    <div class="ei-head">
      <span class="ei-emoji">{info.emoji}</span>
      <strong>{info.name}</strong>
    </div>
    <p class="ei-desc">{info.desc}</p>
    {#if isSub}
      <div class="ei-dots" aria-hidden="true">
        {#each SUB_INTRO as _, i}
          <span class="ei-dot" class:on={i === card.step}></span>
        {/each}
      </div>
    {/if}
    <button class="ei-go" onclick={nextIntroCard}>
      {isSub && !lastStep ? 'Siguiente →' : isSub ? '¡A jugar! →' : 'Continuar →'}
    </button>
  </div>
{/if}

<!-- Game over overlay. Two variants: a retry while lives remain, or the final
     "run over" card once the campaign's STARTING_LIVES are exhausted. -->
{#if game.gameOver}
  <div class="gameover">
    <div class="gameover-card">
      {#if game.lives > 0}
        <h1>¡Hundido!</h1>
        <p>{game.deathCause || 'Tu energía se agotó.'}</p>
        <p class="gameover-lives lives-hearts">
          Vidas restantes:
          {#each lifeSlots as _}
            <span class="life-heart">♥</span>
          {/each}
        </p>
        <button onclick={resetGame}>Reintentar</button>
      {:else}
        <h1>☠ Fin de la partida</h1>
        <p>{game.deathCause || 'Tu energía se agotó.'} Sin vidas restantes.</p>
        <p class="gameover-lives">
          Conquistaste {game.completed.length}/{MISSIONS.length} ciudades en esta campaña.
        </p>
        <button onclick={startNewCampaign}>Nueva campaña</button>
      {/if}
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

<!-- Player-name modal — top-level so it can overlay the intro (first-timer) or
     the profile (editing the name). -->
{#if showNameModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="name-backdrop" onclick={() => (showNameModal = false)}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="name-modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <h2>Nombre del Jugador</h2>
      <input
        bind:this={nameField}
        bind:value={nameInput}
        type="text"
        placeholder="Tu nombre"
        maxlength="24"
        onkeydown={(e) => e.key === 'Enter' && confirmName()}
      />
      <button class="name-go" onclick={confirmName}>{nameGoSub ? 'Zarpar ⚓' : 'Guardar'}</button>
    </div>
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
    top: 20px;
    right: 20px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .progress {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: #ffd700;
    font: 700 15px/1 system-ui, sans-serif;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
    letter-spacing: 0.03em;
  }
  /* Percentage first, slightly larger, and it pops each time it changes. */
  .progress-pct {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(255, 215, 0, 0.16);
    border: 1px solid rgba(255, 215, 0, 0.5);
    font-size: 20px;
    font-variant-numeric: tabular-nums;
    transform-origin: center;
    animation: pctPop 0.5s cubic-bezier(0.2, 1.4, 0.3, 1);
  }
  .progress-count {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    opacity: 0.85;
    font-variant-numeric: tabular-nums;
  }
  /* Little hex "tile" that spins slowly + forever next to the tile count. */
  .tile-spin {
    width: 16px;
    height: 16px;
    transform-origin: center;
    animation: tileSpin 4.5s linear infinite;
  }
  .tile-spin polygon {
    fill: rgba(255, 215, 0, 0.85);
    stroke: rgba(120, 80, 20, 0.85);
    stroke-width: 1.2;
    stroke-linejoin: round;
  }
  @keyframes tileSpin {
    to {
      transform: rotate(360deg);
    }
  }
  /* Dramatic pop: overshoot scale + bright flash + glow burst, then settle. */
  @keyframes pctPop {
    0% {
      transform: scale(1.9) rotate(-4deg);
      color: #fff;
      background: rgba(255, 235, 120, 0.55);
      border-color: #fff;
      box-shadow: 0 0 26px rgba(255, 215, 0, 0.95);
    }
    45% {
      transform: scale(0.82) rotate(1.5deg);
    }
    70% {
      transform: scale(1.12);
    }
    100% {
      transform: scale(1) rotate(0deg);
      color: #ffd700;
      background: rgba(255, 215, 0, 0.16);
      border-color: rgba(255, 215, 0, 0.5);
      box-shadow: 0 0 0 rgba(255, 215, 0, 0);
    }
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

  /* --- Intro screen --- */
  .intro {
    position: fixed;
    inset: 0;
    z-index: 5;
    overflow: hidden;
  }
  .intro-hero {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
  .intro-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 6vh 16px 8vh;
    box-sizing: border-box;
    pointer-events: none;
    text-align: center;
  }
  .intro-head {
    animation: introfloat 5s ease-in-out infinite;
  }
  .intro-title {
    margin: 0;
    color: #ffd700;
    font: 800 clamp(52px, 12vw, 128px) / 1 system-ui, sans-serif;
    letter-spacing: 0.08em;
    text-shadow: 0 4px 18px rgba(0, 0, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.35);
    animation: introglow 3.5s ease-in-out infinite;
  }
  .intro-tag {
    margin: 8px 0 0;
    color: rgba(255, 255, 255, 0.85);
    font: 600 clamp(13px, 2.2vw, 18px) / 1 system-ui, sans-serif;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  }
  .intro-start {
    pointer-events: auto;
    background: linear-gradient(135deg, #ffd700, #ffb300);
    color: #10233f;
    border: none;
    border-radius: 14px;
    padding: 16px 44px;
    font: 800 20px/1 system-ui, sans-serif;
    letter-spacing: 0.03em;
    cursor: pointer;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45), 0 0 34px rgba(255, 215, 0, 0.45);
    animation: introbtn 2s ease-in-out infinite;
    transition: transform 0.12s;
  }
  .intro-start:hover {
    transform: translateY(-2px) scale(1.03);
  }
  .intro-start:active {
    transform: translateY(0) scale(0.99);
  }
  @keyframes introfloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  @keyframes introglow {
    0%, 100% { text-shadow: 0 4px 18px rgba(0, 0, 0, 0.5), 0 0 30px rgba(255, 215, 0, 0.3); }
    50% { text-shadow: 0 4px 18px rgba(0, 0, 0, 0.5), 0 0 52px rgba(255, 215, 0, 0.6); }
  }
  @keyframes introbtn {
    0%, 100% { box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45), 0 0 26px rgba(255, 215, 0, 0.4); }
    50% { box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45), 0 0 46px rgba(255, 215, 0, 0.75); }
  }

  /* --- Player-name modal (on the intro) --- */
  .name-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(4, 12, 22, 0.55);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }
  .name-modal {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 320px;
    max-width: 88vw;
    padding: 24px;
    background: rgba(12, 26, 42, 0.96);
    border: 1px solid rgba(255, 215, 0, 0.5);
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55), 0 0 30px rgba(255, 215, 0, 0.2);
    animation: winpop 0.35s ease-out;
    text-align: center;
  }
  .name-modal h2 {
    margin: 0;
    color: #ffd700;
    font: 800 20px/1 system-ui, sans-serif;
    letter-spacing: 0.02em;
  }
  .name-modal input {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 9px;
    padding: 12px 14px;
    color: #fff;
    font: 600 16px/1 system-ui, sans-serif;
    text-align: center;
  }
  .name-modal input::placeholder {
    color: rgba(255, 255, 255, 0.45);
  }
  .name-modal input:focus {
    outline: none;
    border-color: #ffd700;
  }
  .name-go {
    background: linear-gradient(135deg, #ffd700, #ffb300);
    color: #10233f;
    border: none;
    border-radius: 10px;
    padding: 12px;
    font: 800 16px/1 system-ui, sans-serif;
    cursor: pointer;
    transition: transform 0.1s;
  }
  .name-go:hover {
    transform: translateY(-1px);
  }

  /* --- Submarine customization screen --- */
  .subscreen {
    position: fixed;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
    padding: 16px;
    box-sizing: border-box;
  }
  .sub-preview {
    width: min(420px, 80vw);
    height: 240px;
    border-radius: 14px;
    background: rgba(10, 25, 40, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  /* --- Player profile screen --- */
  .profilescreen {
    justify-content: flex-start;
    padding: max(4vh, 20px) 16px 36px;
    gap: 18px;
    overflow-y: auto;
  }
  .prof-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 24px;
    width: min(720px, 92vw);
  }
  .prof-sub {
    width: min(340px, 84vw);
    height: 200px;
    flex-shrink: 0;
  }
  .prof-id {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 7px;
    min-width: 200px;
  }
  .prof-hi {
    font: 700 12px/1 system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #ffd700;
    opacity: 0.9;
  }
  .prof-name {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #fff;
    font: 800 32px/1.05 system-ui, sans-serif;
    text-shadow: 0 0 14px rgba(255, 255, 255, 0.18);
    word-break: break-word;
  }
  .prof-edit {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 20, 30, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .prof-edit:hover {
    background: rgba(10, 20, 30, 0.8);
    border-color: rgba(255, 215, 0, 0.7);
    color: #ffd700;
  }
  .prof-count {
    margin: 0;
    color: rgba(255, 255, 255, 0.82);
    font: 600 15px/1 system-ui, sans-serif;
  }
  .prof-section {
    width: min(720px, 92vw);
    margin: 6px 0 0;
    text-align: left;
    color: rgba(255, 255, 255, 0.9);
    font: 700 15px/1 system-ui, sans-serif;
    letter-spacing: 0.02em;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    padding-bottom: 8px;
  }
  .prof-cities {
    width: min(720px, 92vw);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
  .prof-empty {
    width: min(720px, 92vw);
    margin: 8px 0;
    color: rgba(255, 255, 255, 0.6);
    font: 500 15px/1.5 system-ui, sans-serif;
    font-style: italic;
  }
  .sub-colors {
    display: flex;
    gap: 22px;
  }
  .sub-colors label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: rgba(255, 255, 255, 0.85);
    font: 600 13px/1 system-ui, sans-serif;
  }
  .sub-colors input[type='color'] {
    width: 52px;
    height: 32px;
    padding: 2px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    background: rgba(10, 20, 30, 0.6);
    cursor: pointer;
  }
  .sub-details {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    max-width: 460px;
  }
  .sub-detail-opt {
    background: rgba(10, 25, 40, 0.72);
    color: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(255, 215, 0, 0.4);
    border-radius: 8px;
    padding: 9px 14px;
    font: 600 13px/1 system-ui, sans-serif;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .sub-detail-opt:hover {
    background: rgba(20, 45, 68, 0.9);
  }
  .sub-detail-opt.sel {
    background: rgba(255, 215, 0, 0.18);
    border-color: #ffd700;
    color: #fff;
  }
  .continue {
    margin-top: 6px;
  }
  .sub-back {
    background: rgba(10, 20, 30, 0.55);
    color: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 8px;
    padding: 7px 14px;
    font: 600 13px/1 system-ui, sans-serif;
    cursor: pointer;
    margin-bottom: 14px;
  }
  .sub-back:hover {
    background: rgba(20, 45, 68, 0.85);
    color: #fff;
  }
  /* Row of back-nav buttons (city picker: ◄ Perfil + ◄ Submarino side by side). */
  .ls-nav-row {
    display: flex;
    gap: 10px;
    margin-bottom: 14px;
  }
  .ls-nav-row .sub-back {
    margin-bottom: 0;
  }
  .ls-title {
    margin: 0;
    background: none;
    border: none;
    padding: 0;
    color: #ffd700;
    font: 800 46px/1 system-ui, sans-serif;
    letter-spacing: 0.08em;
    text-shadow: 0 3px 10px rgba(0, 0, 0, 0.5);
    cursor: pointer;
    transition: text-shadow 0.15s, transform 0.12s;
  }
  .ls-title:hover {
    text-shadow: 0 3px 10px rgba(0, 0, 0, 0.5), 0 0 26px rgba(255, 215, 0, 0.6);
    transform: scale(1.03);
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
    width: 152px;
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
  .ls-tile-check {
    font: 800 20px/1 system-ui, sans-serif;
    color: #4ade80;
  }
  .ls-tile-city {
    font: 700 16px/1.15 system-ui, sans-serif;
    text-align: center;
    word-break: break-word;
    letter-spacing: 0.01em;
  }
  .ls-tile-flag {
    font-size: 26px;
    border-radius: 3px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
  }
  .ls-tile:hover:not(:disabled) {
    background: rgba(20, 45, 68, 0.92);
    border-color: rgba(255, 215, 0, 1);
    transform: translateY(-3px);
  }
  .ls-tile:active:not(:disabled) {
    transform: translateY(0);
  }
  .ls-tile.done {
    cursor: default;
    color: rgba(74, 222, 128, 0.85);
    border-color: rgba(74, 222, 128, 0.45);
    background: rgba(10, 30, 22, 0.6);
    opacity: 0.7;
  }
  .ls-progress {
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
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

  /* "Salir" (reset the whole campaign) — danger flavour, shown mid-campaign. */
  .ls-exit {
    margin-top: 26px;
    background: rgba(60, 16, 16, 0.6);
    color: #ff9a9a;
    border: 1px solid rgba(239, 68, 68, 0.6);
    border-radius: 8px;
    padding: 10px 22px;
    font: 700 14px/1 system-ui, sans-serif;
    cursor: pointer;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: background 0.15s, border-color 0.15s;
  }
  .ls-exit:hover {
    background: rgba(90, 22, 22, 0.85);
    border-color: rgba(239, 68, 68, 1);
    color: #ffc9c9;
  }
  .ls-confirm {
    margin-top: 26px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    background: rgba(10, 20, 30, 0.8);
    border: 1px solid rgba(239, 68, 68, 0.5);
    border-radius: 10px;
    padding: 16px 22px;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.4);
  }
  .ls-confirm > span {
    color: rgba(255, 255, 255, 0.9);
    font: 500 14px/1.3 system-ui, sans-serif;
  }
  .ls-confirm-actions {
    display: flex;
    gap: 10px;
  }
  .ls-confirm-yes,
  .ls-confirm-no {
    border-radius: 8px;
    padding: 9px 18px;
    font: 700 13px/1 system-ui, sans-serif;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .ls-confirm-yes {
    background: #ef4444;
    color: #fff;
  }
  .ls-confirm-yes:hover {
    background: #f05a5a;
  }
  .ls-confirm-no {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.85);
    border-color: rgba(255, 255, 255, 0.25);
  }
  .ls-confirm-no:hover {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }

  /* "Back to Misiones" icon button — top-left corner, inside the stats panel. */
  .home-btn {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 215, 0, 0.12);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.55);
    border-radius: 6px;
    padding: 0;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .home-btn:hover {
    background: rgba(255, 215, 0, 0.26);
    border-color: rgba(255, 215, 0, 0.9);
  }

  /* Help button — reopens the submarine how-to-play at any time (bottom-left). */
  .help-btn {
    position: fixed;
    bottom: 20px;
    left: 20px;
    z-index: 12;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 20, 30, 0.72);
    color: #ffd700;
    border: 1px solid rgba(255, 215, 0, 0.55);
    border-radius: 50%;
    font: 800 20px/1 system-ui, sans-serif;
    cursor: pointer;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4);
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
  }
  .help-btn:hover {
    background: rgba(20, 45, 68, 0.9);
    border-color: rgba(255, 215, 0, 0.95);
    transform: translateY(-1px);
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
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .lvl-badge {
    font-weight: 800;
    font-size: 15px;
    color: #fff3b8;
    letter-spacing: 0.02em;
  }
  .lvl-diff {
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 215, 0, 0.7);
  }
  .stat-sub {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.75);
    padding-bottom: 8px;
    margin-bottom: 2px;
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
  /* Lives display: one pink heart per current life (uncapped — an arena win
     grants an extra one, so this can wrap onto more than one row). */
  .lives-hearts {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
  }
  .life-heart {
    color: #ff5c9e;
    font-size: 15px;
    line-height: 1;
    text-shadow: 0 0 6px rgba(255, 92, 158, 0.6);
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
  /* Win banner — top-center celebratory card, no backdrop blur. */
  .win-banner {
    position: fixed;
    top: 22px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 25;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 14px 34px;
    background: rgba(10, 20, 30, 0.9);
    border: 2px solid rgba(255, 215, 0, 0.85);
    border-radius: 12px;
    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.45), 0 0 30px rgba(255, 215, 0, 0.35);
    pointer-events: none;
    text-align: center;
    animation: winpop 0.45s ease-out;
  }
  .win-title {
    color: #ffd700;
    font: 800 26px/1 system-ui, sans-serif;
    letter-spacing: 0.04em;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  }
  .win-sub {
    color: rgba(255, 243, 184, 0.9);
    font: 600 14px/1.2 system-ui, sans-serif;
  }
  @keyframes winpop {
    from {
      opacity: 0;
      transform: translate(-50%, -16px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  /* Continue-to-next-mission button, just below the win banner. */
  .win-cta {
    position: fixed;
    top: 108px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 25;
    animation: winpop 0.5s ease-out;
  }
  .win-cta button {
    background: rgba(255, 215, 0, 0.92);
    color: #12224a;
    border: none;
    border-radius: 10px;
    padding: 12px 24px;
    font: 800 15px/1 system-ui, sans-serif;
    letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.4), 0 0 22px rgba(255, 215, 0, 0.4);
    transition: background 0.15s, transform 0.1s;
  }
  .win-cta button:hover {
    background: #ffe033;
    transform: translateY(-2px);
  }
  .win-cta button:active {
    transform: translateY(0);
  }

  /* "New enemy" presentation card — anchored next to the highlighted enemy. */
  .enemy-intro {
    position: fixed;
    transform: translate(24px, -50%);
    width: 300px;
    max-width: 76vw;
    z-index: 26;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 18px;
    background: rgba(12, 26, 42, 0.96);
    border: 1px solid rgba(255, 215, 0, 0.6);
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55), 0 0 26px rgba(255, 215, 0, 0.22);
    animation: eipop 0.3s ease-out;
    pointer-events: auto;
  }
  @keyframes eipop {
    from {
      opacity: 0;
      transform: translate(10px, -50%) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(24px, -50%) scale(1);
    }
  }
  .ei-tag {
    align-self: flex-start;
    background: rgba(255, 215, 0, 0.16);
    color: #ffd700;
    font: 800 11px/1 system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 4px 9px;
    border-radius: 999px;
  }
  .ei-head {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #fff;
  }
  .ei-emoji {
    font-size: 26px;
  }
  .ei-head strong {
    font: 800 19px/1 system-ui, sans-serif;
  }
  .ei-desc {
    margin: 0;
    color: rgba(255, 255, 255, 0.85);
    font: 500 13.5px/1.5 system-ui, sans-serif;
  }
  /* Step dots for the multi-step submarine walkthrough. */
  .ei-dots {
    display: flex;
    gap: 6px;
    align-self: center;
    margin: 2px 0;
  }
  .ei-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.25);
    transition: background 0.15s;
  }
  .ei-dot.on {
    background: #ffd700;
  }
  .ei-go {
    align-self: flex-end;
    margin-top: 2px;
    background: linear-gradient(135deg, #ffd700, #ffb300);
    color: #10233f;
    border: none;
    border-radius: 9px;
    padding: 9px 18px;
    font: 800 14px/1 system-ui, sans-serif;
    cursor: pointer;
    transition: transform 0.1s;
  }
  .ei-go:hover {
    transform: translateY(-1px);
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
  .gameover-card p.gameover-lives {
    margin: -10px 0 18px;
    color: rgba(255, 255, 255, 0.65);
    font: 600 12px/1.3 system-ui, sans-serif;
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
