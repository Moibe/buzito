<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
  <title>Admin · buzito</title>
</svelte:head>

{#if !data.authed}
  <!-- Login gate -->
  <div class="login-wrap">
    <form class="login" method="POST" action="?/login" use:enhance>
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
  <!-- Dashboard -->
  <div class="admin">
    <header class="topbar">
      <h1>Admin · buzito</h1>
      <form method="POST" action="?/logout" use:enhance>
        <button class="logout" type="submit">Salir</button>
      </form>
    </header>

    <section class="panel">
      <div class="panel-head">
        <h2>Ciudades <span class="count">{data.cities.length}</span></h2>
        <p>Pool maestro de ciudades. Cada partida elige 8 al azar como misiones.</p>
      </div>
      <ol class="cities">
        {#each data.cities as city}
          <li>{city}</li>
        {/each}
      </ol>
    </section>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    background: #0c1420;
    color: #e6edf3;
    font-family: system-ui, sans-serif;
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
    background: #141f2e;
    border: 1px solid #24344a;
    border-radius: 14px;
    padding: 28px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  }
  .login h1 {
    margin: 0;
    font-size: 22px;
    color: #ffd700;
  }
  .login .sub {
    margin: -6px 0 8px;
    color: #8aa0b8;
    font-size: 13px;
  }
  .login input {
    background: #0c1420;
    border: 1px solid #2b3d55;
    border-radius: 8px;
    padding: 11px 12px;
    color: #fff;
    font-size: 14px;
  }
  .login input:focus {
    outline: none;
    border-color: #ffd700;
  }
  .login button {
    background: #ffd700;
    color: #0c1420;
    border: none;
    border-radius: 8px;
    padding: 11px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
  }
  .login button:hover {
    background: #ffdf33;
  }
  .err {
    margin: 0;
    color: #ff7676;
    font-size: 13px;
  }

  /* --- Dashboard --- */
  .admin {
    max-width: 980px;
    margin: 0 auto;
    padding: 24px 20px 60px;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 16px;
    margin-bottom: 22px;
    border-bottom: 1px solid #24344a;
  }
  .topbar h1 {
    margin: 0;
    font-size: 22px;
    color: #ffd700;
    letter-spacing: 0.02em;
  }
  .logout {
    background: transparent;
    color: #8aa0b8;
    border: 1px solid #2b3d55;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .logout:hover {
    color: #fff;
    border-color: #3a5170;
  }

  .panel {
    background: #141f2e;
    border: 1px solid #24344a;
    border-radius: 14px;
    padding: 22px;
  }
  .panel-head h2 {
    margin: 0 0 4px;
    font-size: 17px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .panel-head .count {
    background: #24344a;
    color: #9fd0ff;
    font-size: 13px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 999px;
  }
  .panel-head p {
    margin: 0 0 16px;
    color: #8aa0b8;
    font-size: 13px;
  }
  .cities {
    margin: 0;
    padding: 0 0 0 0;
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
    background: #0c1420;
    border: 1px solid #1d2b3e;
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 14px;
  }
  .cities li::before {
    content: counter(city);
    min-width: 26px;
    text-align: right;
    color: #5f7591;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    font-weight: 700;
  }
</style>
