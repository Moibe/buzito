<script lang="ts">
  import { enhance } from '$app/forms';
  import { cityFlagCode, cityCountry } from '$lib/cityFlags';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // Always render `max` slots: filled ones first, then empty placeholders.
  const slots = $derived(Array.from({ length: data.max }, (_, i) => data.images[i] ?? null));
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
      <p>Imágenes de la ciudad — {data.images.length}/{data.max} usadas.</p>
    </header>

    {#if form?.error}
      <p class="err">{form.error}</p>
    {/if}

    <div class="grid">
      {#each slots as file, i}
        <div class="slot" class:filled={!!file}>
          {#if file}
            <img src="/api/cities/{data.n}/{file}" alt="{data.city} {i + 1}" />
            <form class="rm" method="POST" action="?/remove" use:enhance>
              <input type="hidden" name="file" value={file} />
              <button type="submit" title="Quitar imagen" aria-label="Quitar imagen">✕</button>
            </form>
          {:else}
            <span class="empty">Vacío</span>
          {/if}
        </div>
      {/each}
    </div>

    {#if data.images.length < data.max}
      <form class="upload" method="POST" action="?/upload" enctype="multipart/form-data" use:enhance>
        <input type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" required />
        <button type="submit">Subir imagen</button>
      </form>
    {:else}
      <p class="full">Máximo alcanzado — quita una para subir otra.</p>
    {/if}
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
    aspect-ratio: 16 / 10;
    border-radius: 10px;
    border: 1px dashed rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .slot.filled {
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.2);
  }
  .slot img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .empty {
    color: rgba(255, 255, 255, 0.4);
    font-size: 13px;
  }
  .rm {
    position: absolute;
    top: 8px;
    right: 8px;
    margin: 0;
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
  .upload {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 18px;
  }
  .upload input[type='file'] {
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
  }
  .upload input[type='file']::file-selector-button {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 8px;
    padding: 7px 12px;
    margin-right: 10px;
    cursor: pointer;
  }
  .upload button[type='submit'] {
    background: #ffd700;
    color: #12224a;
    border: none;
    border-radius: 8px;
    padding: 9px 18px;
    font: 700 13px/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .upload button[type='submit']:hover {
    background: #ffe033;
  }
  .full {
    margin-top: 18px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 13px;
  }
</style>
