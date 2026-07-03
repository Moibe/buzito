# buzito

Juego de submarino con movimiento libre sobre una arena hexagonal 3D de
tamaño fijo (disco de radio 8, siempre completo en pantalla). Tablero y
malla del submarino extraídos de `hexa-turnos`; el motor de movimiento es
nuevo: integración continua desde el teclado en vez de turnos por hexágono.
El submarino queda confinado a la arena — no hay océano más allá.

## Controles

- **← / →** — girar el rumbo
- **↑ / ↓** — avanzar / reversa
- **Espacio** o el botón **Sumergir/Emerger** — inmersión

Sumergido, el submarino corre a media velocidad (baterías) y se ve como una
silueta translúcida con burbujas.

## Stack

SvelteKit 2 + Svelte 5 (runes) + TypeScript, render 3D con Threlte 8
(`@threlte/core`) sobre three.js.

## Desarrollo

```sh
npm install
npm run dev
```

## Estructura

- `src/lib/hex.ts` — matemática hexagonal (axial ↔ mundo, disco de tablero)
- `src/lib/Board.svelte` — mar hexagonal (InstancedMesh + oleaje), arena fija
- `src/lib/Submarine.svelte` — malla del submarino (renderer puro: recibe `x/z/heading`)
- `src/lib/OceanCurrents.svelte` — partículas de espuma (corriente ambiental)
- `src/lib/Scene.svelte` — física + teclado + cámara fija con zoom auto-ajustado + clamp a la arena
- `src/lib/game.svelte.ts` — estado compartido (posición, rumbo, sumergido)
- `src/routes/+page.svelte` — Canvas + HUD (botón de inmersión)
