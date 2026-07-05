<script lang="ts">
  import { enhance } from '$app/forms';
  import { cityFlagCode, cityCountry } from '$lib/cityFlags';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Submit the slot's upload form as soon as a file is chosen.
  function onPick(e: Event) {
    (e.currentTarget as HTMLInputElement).form?.requestSubmit();
  }
</script>

<svelte:head>
  <title>{data.city} · Admin buzito</title>
</svelte:head>

<div class="page">
  <div class="bar">
    <a class="back" href="/admin?sec=ciudades">← Ciudades</a>
  </div>

  <div class="card glass">
    <header class="head">
      <h1>
        <span class="num">#{data.n}</span>
        {data.city}
        {#if cityFlagCode(data.city)}
          <span class="flag fi fi-{cityFlagCode(data.city)}" title={cityCountry(data.city)} aria-hidden="true"></span>
        {/if}
      </h1>
      <p>4 imágenes en secuencia (la posición importa). Clic en un cuadro para subir o reemplazar.</p>
    </header>

    {#if form?.error}
      <p class="err">{form.error}</p>
    {/if}

    <div class="grid">
      {#each data.slots as file, i}
        {@const k = i + 1}
        <div class="slot">
          <form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance>
            <input type="hidden" name="slot" value={k} />
            <input
              class="file"
              id="slot-{k}"
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onchange={onPick}
            />
            <label class="box" class:filled={!!file} for="slot-{k}">
              <span class="pos">{k}</span>
              {#if file}
                <img src="/api/cities/{data.n}/{file}" alt="{data.city} {k}" />
                <span class="overlay">Clic para reemplazar</span>
              {:else}
                <span class="plus">＋</span>
                <span class="lbl">Subir imagen {k}</span>
              {/if}
            </label>
          </form>
          {#if file}
            <form class="rm" method="POST" action="?/remove" use:enhance>
              <input type="hidden" name="slot" value={k} />
              <button type="submit" title="Quitar imagen" aria-label="Quitar imagen">✕</button>
            </form>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
  }
  :global(body) {
    min-height: 100vh;
    background: linear-gradient(135deg, #4169e1 0%, #1e3a8a 100%);
    background-attachment: fixed;
    color: rgba(255, 255, 255, 0.95);
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: 24px 20px 60px;
  }
  .bar {
    margin-bottom: 16px;
  }
  .back {
    color: #cfe0ff;
    text-decoration: none;
    font: 600 14px/1 system-ui, sans-serif;
    padding: 8px 14px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 8px;
    display: inline-block;
  }
  .back:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .glass {
    background: rgba(255, 255, 255, 0.012);
    backdrop-filter: blur(8px) saturate(110%);
    -webkit-backdrop-filter: blur(8px) saturate(110%);
    border: 1px solid #fff;
    border-radius: 16px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 16px rgba(0, 0, 0, 0.12);
    padding: 22px;
  }
  .head h1 {
    margin: 0 0 4px;
    font-size: 24px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #fff;
  }
  .head .num {
    color: rgba(255, 255, 255, 0.45);
    font-size: 16px;
    font-weight: 700;
  }
  .head .flag {
    font-size: 20px;
    border-radius: 3px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  }
  .head p {
    margin: 0 0 16px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
  }
  .err {
    margin: 0 0 14px;
    color: #ffd0d0;
    background: rgba(239, 68, 68, 0.18);
    border: 1px solid rgba(239, 68, 68, 0.5);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .slot {
    position: relative;
  }
  .slot form {
    margin: 0;
  }
  .file {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .box {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    aspect-ratio: 16 / 10;
    border-radius: 10px;
    border: 2px dashed rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    overflow: hidden;
    transition: border-color 0.15s, background 0.15s;
  }
  .box:hover {
    border-color: rgba(147, 197, 253, 0.8);
    background: rgba(147, 197, 253, 0.1);
  }
  .box.filled {
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.2);
  }
  .box img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pos {
    position: absolute;
    top: 6px;
    left: 8px;
    z-index: 2;
    font: 800 13px/1 system-ui, sans-serif;
    color: #fff;
    background: rgba(10, 20, 30, 0.6);
    border-radius: 6px;
    padding: 3px 7px;
  }
  .plus {
    font-size: 30px;
    font-weight: 300;
    line-height: 1;
  }
  .lbl {
    font-size: 12.5px;
  }
  .overlay {
    position: absolute;
    inset: auto 0 0 0;
    z-index: 2;
    background: rgba(10, 20, 30, 0.6);
    color: #fff;
    font-size: 12px;
    text-align: center;
    padding: 5px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .box.filled:hover .overlay {
    opacity: 1;
  }
  .rm {
    position: absolute;
    top: 8px;
    right: 8px;
    margin: 0;
    z-index: 3;
  }
  .rm button {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: none;
    background: rgba(10, 20, 30, 0.7);
    color: #ff9a9a;
    font: 700 14px/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .rm button:hover {
    background: rgba(239, 68, 68, 0.85);
    color: #fff;
  }
</style>
