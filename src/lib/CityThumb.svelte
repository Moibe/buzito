<script lang="ts">
  import { WORLD_CITIES } from '$lib/cities';
  import { cityFlagCode, cityCountry } from '$lib/cityFlags';

  // A conquered-city poster: the city's first uploaded image (slot 1) as a
  // thumbnail, with its flag + name overlaid. Falls back to a placeholder when
  // no image has been uploaded for that city yet.
  let { name }: { name: string } = $props();

  const n = $derived(WORLD_CITIES.indexOf(name) + 1);
  const code = $derived(cityFlagCode(name));
  const country = $derived(cityCountry(name));

  let src = $state<string | null>(null);

  // Two-step lookup: GET /api/cities/<n> → { slots }, then build the slot-1 URL.
  $effect(() => {
    let cancelled = false;
    src = null;
    if (n > 0 && typeof fetch !== 'undefined') {
      fetch(`/api/cities/${n}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled) return;
          const f = d?.slots?.[0];
          src = f ? `/api/cities/${n}/${f}` : null;
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  });
</script>

<div class="city-thumb" title={country || name}>
  {#if src}
    <img class="city-thumb-img" {src} alt={name} loading="lazy" />
  {:else}
    <div class="city-thumb-ph" aria-hidden="true">🌊</div>
  {/if}
  <span class="city-thumb-check" aria-hidden="true">✓</span>
  <div class="city-thumb-label">
    {#if code}
      <span class="fi fi-{code}" title={country} aria-hidden="true"></span>
    {/if}
    <span class="city-thumb-name">{name}</span>
  </div>
</div>

<style>
  .city-thumb {
    position: relative;
    aspect-ratio: 4 / 3;
    border-radius: 12px;
    overflow: hidden;
    background: rgba(10, 25, 40, 0.6);
    border: 1px solid rgba(255, 215, 0, 0.55);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .city-thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  /* Placeholder when the city has no uploaded image. */
  .city-thumb-ph {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 34px;
    opacity: 0.55;
    background: linear-gradient(160deg, #1e5f8a, #0a3d62);
  }
  /* "Conquered" badge, top-right. */
  .city-thumb-check {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(74, 222, 128, 0.92);
    color: #06331a;
    font: 800 13px/1 system-ui, sans-serif;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }
  /* Name + flag ribbon over a bottom scrim. */
  .city-thumb-label {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 16px 10px 8px;
    background: linear-gradient(to top, rgba(4, 12, 22, 0.9), rgba(4, 12, 22, 0));
  }
  .city-thumb-label .fi {
    font-size: 17px;
    flex-shrink: 0;
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
  }
  .city-thumb-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #fff;
    font: 700 13px/1.2 system-ui, sans-serif;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
  }
</style>
