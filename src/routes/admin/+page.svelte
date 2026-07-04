<script lang="ts">
  import { enhance } from '$app/forms';
  import AdminSidebar from '$lib/AdminSidebar.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let collapsed = $state(false);

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
  <AdminSidebar {collapsed} {toggleCollapsed} />
  <main class="work glass" class:collapsed>
    <div class="work-scroll">
      <header class="work-head">
        <h2>Ciudades <span class="count">{data.cities.length}</span></h2>
        <p>Pool maestro de ciudades. Cada partida elige 8 al azar como misiones.</p>
      </header>
      <ol class="cities">
        {#each data.cities as city}
          <li>{city}</li>
        {/each}
      </ol>
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
</style>
