<script lang="ts">
  import { enhance } from '$app/forms';
  import AdminSidebar from '$lib/AdminSidebar.svelte';
  import { MISSIONS, ENEMY_INFO, BONUS_INFO } from '$lib/missions';
  import type { BonusType } from '$lib/missions';
  import { cityFlagCode, cityCountry } from '$lib/cityFlags';
  import { page } from '$app/state';
  import {
    config,
    setWinPct,
    addEnemyToMission,
    removeEnemyFromMission,
    resetMissions,
    adjustMissionBonus,
    setHeal,
    setRespawn,
    adminSync,
  } from '$lib/game.svelte';

  // Typed [type, info] list of bonuses for the per-mission steppers.
  const BONUS_LIST = Object.entries(BONUS_INFO) as [BonusType, { name: string; emoji: string }][];

  // Human text for the save-status indicator.
  const saveText: Record<string, string> = {
    saving: 'Guardando…',
    saved: 'Guardado ✓',
    error: 'Error al guardar — vuelve a entrar al admin',
  };
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let collapsed = $state(false);
  // Initial section can be set via ?sec= (e.g. returning from a city page).
  const secParam = page.url.searchParams.get('sec');
  const initialSection = (['ajustes', 'ciudades', 'misiones'] as const).includes(
    secParam as 'ajustes' | 'ciudades' | 'misiones'
  )
    ? (secParam as 'ajustes' | 'ciudades' | 'misiones')
    : 'ajustes';
  let section = $state<'ajustes' | 'ciudades' | 'misiones'>(initialSection);
  // Which mission card the dragged enemy is hovering (for the drop highlight).
  let dragOverIndex = $state(-1);

  // Live mission view: static label/power/note merged with the EDITABLE enemy
  // composition (config.missionEnemies), with newTypes/total recomputed.
  const missionsView = $derived.by(() => {
    const seenE = new Set<string>();
    const seenB = new Set<string>();
    return MISSIONS.map((m, i) => {
      const enemies = config.missionEnemies[i] ?? m.enemies;
      const newTypes = enemies.map((e) => e.type).filter((t) => !seenE.has(t));
      newTypes.forEach((t) => seenE.add(t));
      const total = enemies.reduce((s, e) => s + e.count, 0);
      const bonuses = config.missionBonuses[i] ?? m.bonuses;
      const newBonuses = BONUS_LIST.map(([b]) => b).filter((b) => bonuses[b] > 0 && !seenB.has(b));
      newBonuses.forEach((b) => seenB.add(b));
      return { n: m.n, label: m.label, powers: m.powers, note: m.note, enemies, newTypes, total, bonuses, newBonuses };
    });
  });

  // View Transitions to animate the collapse when supported.
  function withTransition(fn: () => void) {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(fn);
    } else {
      fn();
    }
  }
  function toggleCollapsed() {
    withTransition(() => {
      collapsed = !collapsed;
    });
  }
</script>

<svelte:head>
  <title>Admin · buzito</title>
</svelte:head>

{#if !data.authed}
  <!-- Login gate -->
  <div class="login-wrap">
    <form class="login glass" method="POST" action="?/login" use:enhance>
      <h1>Admin · buzito</h1>
      <p class="sub">Área restringida</p>
      <input
        type="password"
        name="password"
        placeholder="Contraseña"
        autocomplete="current-password"
      />
      {#if form?.error}
        <p class="err">{form.error}</p>
      {/if}
      <button type="submit">Entrar</button>
    </form>
  </div>
{:else}
  <!-- Dashboard: glass sidebar + glass content panel -->
  <AdminSidebar {collapsed} {toggleCollapsed} current={section} onNavigate={(s) => (section = s as typeof section)} />
  <main class="work glass" class:collapsed>
    <div class="work-scroll">
      {#if section === 'ajustes'}
        <header class="work-head">
          <h2>Ajustes</h2>
          <p>Reglas del juego. Se guardan y aplican a las partidas.</p>
        </header>
        <div class="settings">
          <div class="setting">
            <div class="setting-label">
              <strong>Cobertura para ganar</strong>
              <span>% de mosaicos a cubrir para completar la misión.</span>
            </div>
            <div class="setting-input">
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={Math.round(config.rules.winPct * 100)}
                onchange={(e) => setWinPct(Number(e.currentTarget.value))}
              />
              <span class="unit">%</span>
            </div>
          </div>

          <div class="setting">
            <div class="setting-label">
              <strong>💙 Curación por orbe</strong>
              <span>Puntos de casco que restaura cada orbe de vida.</span>
            </div>
            <div class="setting-input">
              <input
                type="number"
                min="0"
                step="1"
                value={config.rules.heal}
                onchange={(e) => setHeal(Number(e.currentTarget.value))}
              />
              <span class="unit">hp</span>
            </div>
          </div>

          <div class="setting-group-title">Reaparición de bonos (segundos tras limpiar la tanda)</div>
          {#each BONUS_LIST as [type, info]}
            <div class="setting">
              <div class="setting-label">
                <strong>{info.emoji} {info.name}</strong>
              </div>
              <div class="setting-input">
                <input
                  type="number"
                  min="1"
                  step="5"
                  value={config.rules.respawn[type]}
                  onchange={(e) => setRespawn(type, Number(e.currentTarget.value))}
                />
                <span class="unit">s</span>
              </div>
            </div>
          {/each}

          {#if adminSync.status !== 'idle'}
            <span class="save-status {adminSync.status}">{saveText[adminSync.status]}</span>
          {/if}
        </div>
      {:else if section === 'ciudades'}
        <header class="work-head">
          <h2>Ciudades <span class="count">{data.cities.length}</span></h2>
          <p>Pool maestro de ciudades. Cada partida elige 8 al azar como misiones.</p>
        </header>
        <p class="cities-hint">Clic en una ciudad para gestionar sus imágenes.</p>
        <ol class="cities">
          {#each data.cities as city, i}
            <li>
              <a href="/admin/ciudades/{i + 1}">
                <span class="city-name">{city}</span>
                {#if cityFlagCode(city)}
                  <span class="flag fi fi-{cityFlagCode(city)}" title={cityCountry(city)} aria-hidden="true"></span>
                {/if}
              </a>
            </li>
          {/each}
        </ol>
      {:else if section === 'misiones'}
        <header class="work-head">
          <h2>Misiones <span class="count">{MISSIONS.length}</span></h2>
          <p>
            Dificultad creciente: la 1 es siempre la más fácil y la 8 la más difícil, sea cual
            sea la ciudad. <b>Arrastra un tipo de enemigo a una misión</b> para añadir uno; haz
            clic en un enemigo de la misión para quitarlo.
          </p>
        </header>

        <!-- Enemy-type palette: drag one onto a mission card to add a copy. -->
        <div class="palette">
          <div class="palette-head">
            <strong>Tipos de enemigos</strong>
            <span>Arrástralos a una misión para añadir uno</span>
            {#if adminSync.status !== 'idle'}
              <span class="save-status {adminSync.status}">{saveText[adminSync.status]}</span>
            {/if}
            <button class="reset-btn" onclick={resetMissions}>↺ Restablecer</button>
          </div>
          <div class="palette-items">
            {#each Object.entries(ENEMY_INFO) as [type, info]}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="palette-item"
                draggable="true"
                data-type={type}
                title={info.name}
                ondragstart={(e) => e.dataTransfer?.setData('text/plain', type)}
              >
                <span class="pi-emoji">{info.emoji}</span>
                <span>{info.name}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="missions">
          {#each missionsView as m, i}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <article
              class="mission"
              class:dragover={dragOverIndex === i}
              ondragover={(e) => {
                e.preventDefault();
                dragOverIndex = i;
              }}
              ondragleave={() => {
                if (dragOverIndex === i) dragOverIndex = -1;
              }}
              ondrop={(e) => {
                e.preventDefault();
                const t = e.dataTransfer?.getData('text/plain');
                if (t) addEnemyToMission(i, t);
                dragOverIndex = -1;
              }}
            >
              <div class="mission-top">
                <span class="mnum">{m.n}</span>
                <div class="mtitle">
                  <strong>Misión {m.n}</strong>
                  <span class="mlabel">{m.label}</span>
                </div>
              </div>
              <div class="diffbar"><span style="width: {(m.n / MISSIONS.length) * 100}%"></span></div>

              <!-- Power ramps across the mission's 4 arenas (one chip each). -->
              <div class="powers" title="Multiplicador de poder en cada arena (casco / embestida / daño / cadencia / velocidad)">
                <span class="powers-label">Poder</span>
                {#each m.powers as p, k}
                  <span class="pw">A{k + 1} <b>×{p}</b></span>
                {/each}
              </div>
              <div class="enemies">
                {#each m.enemies as e}
                  <button
                    class="chip"
                    class:isnew={m.newTypes.includes(e.type)}
                    title="Clic para quitar uno"
                    onclick={() => removeEnemyFromMission(i, e.type)}
                  >
                    <span class="chip-emoji">{ENEMY_INFO[e.type].emoji}</span>
                    {ENEMY_INFO[e.type].name}
                    <b>×{e.count}</b>
                    {#if m.newTypes.includes(e.type)}<em>nuevo</em>{/if}
                  </button>
                {/each}
                {#if m.enemies.length === 0}
                  <span class="empty-hint">Sin enemigos — arrastra uno aquí</span>
                {/if}
                <span class="total">{m.total} en total</span>
              </div>

              <p class="mnote">{m.note}</p>

              <!-- Bonuses (power-ups) per mission, with +/- steppers. -->
              <div class="bonuses">
                <span class="bonuses-label">Bonos</span>
                {#each BONUS_LIST as [type, info]}
                  <div class="bonus" class:isnew={m.newBonuses.includes(type)}>
                    <span class="chip-emoji">{info.emoji}</span>
                    <span class="bonus-name">{info.name}</span>
                    <div class="stepper">
                      <button
                        type="button"
                        aria-label="Quitar {info.name}"
                        onclick={() => adjustMissionBonus(i, type, -1)}>−</button
                      >
                      <b>{m.bonuses[type]}</b>
                      <button
                        type="button"
                        aria-label="Añadir {info.name}"
                        onclick={() => adjustMissionBonus(i, type, 1)}>+</button
                      >
                    </div>
                  </div>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </div>
  </main>
{/if}

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
  }
  :global(body) {
    min-height: 100vh;
    background: linear-gradient(135deg, #4169e1 0%, #1e3a8a 100%);
    background-attachment: fixed;
    color: rgba(255, 255, 255, 0.95);
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }

  /* Shared frosted-glass surface. */
  .glass {
    background: rgba(255, 255, 255, 0.012);
    backdrop-filter: blur(8px) saturate(110%);
    -webkit-backdrop-filter: blur(8px) saturate(110%);
    border: 1px solid #fff;
    border-radius: 16px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 4px 16px rgba(0, 0, 0, 0.12);
  }

  /* --- Login --- */
  .login-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .login {
    width: 320px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 28px;
  }
  .login h1 {
    margin: 0;
    font-size: 22px;
    color: #fff;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.25);
  }
  .login .sub {
    margin: -6px 0 8px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
  }
  .login input {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 8px;
    padding: 11px 12px;
    color: #fff;
    font-size: 14px;
  }
  .login input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }
  .login input:focus {
    outline: none;
    border-color: #fff;
  }
  .login button {
    background: #ffd700;
    color: #12224a;
    border: none;
    border-radius: 8px;
    padding: 11px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
  }
  .login button:hover {
    background: #ffe033;
  }
  .err {
    margin: 0;
    color: #ffd0d0;
    font-size: 13px;
  }

  /* --- Dashboard content panel (mirrors the project's glass main). --- */
  .work {
    position: fixed;
    top: 1rem;
    right: 1rem;
    bottom: 1rem;
    left: calc(var(--sidebar-width, 240px) + 2rem);
    box-sizing: border-box;
    overflow: hidden;
    transition: left 0.22s ease-out;
  }
  .work.collapsed {
    left: 2rem;
  }
  .work-scroll {
    position: absolute;
    inset: 20px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .work-head h2 {
    margin: 0 0 4px;
    font-size: 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #fff;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
  }
  .work-head .count {
    background: rgba(255, 255, 255, 0.12);
    color: #cfe0ff;
    font-size: 13px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 999px;
  }
  .work-head p {
    margin: 0 0 18px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
  }

  .cities {
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: city;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px;
  }
  .cities li {
    counter-increment: city;
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.95);
  }
  .cities li::before {
    content: counter(city);
    min-width: 24px;
    text-align: right;
    color: rgba(255, 255, 255, 0.5);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    font-weight: 700;
  }
  .cities .city-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Flag (flag-icons SVG) sits at the right edge of each pill, past the name.
     Sized via font-size; subtle border so light flags don't vanish. */
  .cities .flag {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 15px;
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  }
  .cities li a {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
    text-decoration: none;
    color: inherit;
  }
  .cities li {
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }
  .cities li:hover {
    border-color: rgba(147, 197, 253, 0.65);
    background: rgba(255, 255, 255, 0.1);
  }
  .cities-hint {
    margin: 0 0 12px;
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.6);
  }

  /* --- Settings (Ajustes) --- */
  .settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 520px;
  }
  .setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    padding: 14px 16px;
  }
  .setting-label {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .setting-label strong {
    font-size: 14px;
    color: #fff;
  }
  .setting-label span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }
  .setting-input {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .setting-input input {
    width: 72px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 8px;
    padding: 9px 10px;
    color: #fff;
    font: 700 15px/1 system-ui, sans-serif;
    text-align: right;
  }
  .setting-input input:focus {
    outline: none;
    border-color: #ffd700;
  }
  .setting-input .unit {
    color: rgba(255, 255, 255, 0.7);
    font-weight: 700;
  }
  .setting-group-title {
    margin-top: 8px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.55);
    border-bottom: 1px dashed rgba(255, 255, 255, 0.15);
    padding-bottom: 6px;
  }

  /* Save-status indicator (server persistence feedback). */
  .save-status {
    font-size: 12px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
  }
  .save-status.saving {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.8);
  }
  .save-status.saved {
    background: rgba(74, 222, 128, 0.16);
    color: #86efac;
  }
  .save-status.error {
    background: rgba(239, 68, 68, 0.18);
    color: #fca5a5;
  }

  /* --- Enemy-type palette (drag source, for the future) --- */
  .palette {
    background: rgba(255, 255, 255, 0.04);
    border: 1px dashed rgba(255, 255, 255, 0.3);
    border-radius: 12px;
    padding: 12px 14px;
    margin-bottom: 16px;
  }
  .palette-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .palette-head strong {
    font-size: 13px;
    color: #fff;
  }
  .palette-head span {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.55);
  }
  .palette-items {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .palette-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.07);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    padding: 7px 12px;
    font-size: 13px;
    color: #fff;
    cursor: grab;
    user-select: none;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
  }
  .palette-item:hover {
    background: rgba(255, 255, 255, 0.13);
    border-color: rgba(147, 197, 253, 0.6);
    transform: translateY(-1px);
  }
  .palette-item:active {
    cursor: grabbing;
  }
  .pi-emoji {
    font-size: 15px;
  }

  /* --- Missions (mosaic: 2 columns × 4 rows) --- */
  .missions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .mission {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    padding: 14px 16px;
  }
  .mission-top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .mnum {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(37, 99, 235, 0.3);
    border: 1px solid rgba(147, 197, 253, 0.5);
    border-radius: 9px;
    font-weight: 800;
    font-size: 15px;
    color: #fff;
  }
  .mtitle {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .mtitle strong {
    font-size: 14px;
    color: #fff;
  }
  .mlabel {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.65);
  }
  .powers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 10px 0 2px;
  }
  .powers-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 700;
  }
  .pw {
    background: rgba(255, 215, 0, 0.14);
    border: 1px solid rgba(255, 215, 0, 0.5);
    color: #ffe680;
    font-size: 12px;
    padding: 3px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pw b {
    color: #fff;
  }
  .diffbar {
    height: 5px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
    margin: 10px 0 12px;
  }
  .diffbar span {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, #4ade80, #facc15 55%, #ef4444);
  }
  .enemies {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    padding: 4px 10px;
    font: 500 12.5px/1 system-ui, sans-serif;
    color: rgba(255, 255, 255, 0.92);
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }
  .chip:hover {
    background: rgba(239, 68, 68, 0.18);
    border-color: rgba(239, 68, 68, 0.55);
  }
  .chip b {
    color: #fff;
  }
  .chip-emoji {
    font-size: 13px;
  }
  .chip.isnew {
    border-color: rgba(74, 222, 128, 0.6);
    background: rgba(74, 222, 128, 0.12);
  }
  .chip em {
    font-style: normal;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
    color: #86efac;
  }
  .total {
    margin-left: auto;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    font-variant-numeric: tabular-nums;
  }
  .empty-hint {
    font-size: 12px;
    font-style: italic;
    color: rgba(255, 255, 255, 0.45);
  }
  /* Per-mission bonuses (power-up) steppers. */
  .bonuses {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed rgba(255, 255, 255, 0.12);
  }
  .bonuses-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 700;
  }
  .bonus {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    padding: 3px 6px 3px 10px;
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.92);
  }
  .bonus.isnew {
    border-color: rgba(147, 197, 253, 0.6);
    background: rgba(147, 197, 253, 0.12);
  }
  .bonus-name {
    color: rgba(255, 255, 255, 0.75);
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .stepper button {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 6px;
    color: #fff;
    font: 700 14px/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .stepper button:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  .stepper b {
    min-width: 12px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .mnote {
    margin: 10px 0 0;
    font-size: 12.5px;
    line-height: 1.45;
    color: #fff;
  }
  /* Drop highlight while dragging an enemy type over a mission card. */
  .mission.dragover {
    border-color: rgba(147, 197, 253, 0.9);
    background: rgba(37, 99, 235, 0.18);
    box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.4) inset;
  }
  .reset-btn {
    margin-left: auto;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.85);
    font: 600 12px/1 system-ui, sans-serif;
    padding: 6px 12px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .reset-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.35);
    color: #fff;
  }
</style>
