# buzito

Juego de submarino con movimiento libre sobre una arena 3D de hexágonos de
**tamaño fijo** (~620 tiles, independiente del tamaño de la ventana), enmarcada
por un borde visible. La cámara hace zoom para que la arena completa siempre
quepa en pantalla: una ventana más grande muestra los mismos tiles más grandes,
no más tiles — así la dificultad (el objetivo es sumergirse en todos los tiles)
es constante. Tablero y malla del submarino extraídos de `hexa-turnos`; el motor
de movimiento es nuevo: integración continua desde el teclado en vez de turnos
por hexágono. El submarino queda confinado a la arena.

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

- `src/lib/hex.ts` — matemática hexagonal (axial ↔ mundo, arena rectangular iso)
- `src/lib/Board.svelte` — mar hexagonal (InstancedMesh + oleaje), arena fija
- `src/lib/Submarine.svelte` — malla del submarino (renderer puro: recibe `x/z/heading`)
- `src/lib/OceanCurrents.svelte` — partículas de espuma (corriente ambiental)
- `src/lib/ArenaFrame.svelte` — borde 3D que enmarca el área de juego
- `src/lib/Scene.svelte` — física + teclado + cámara fija con zoom-to-fit + clamp rectangular a la arena
- `src/lib/game.svelte.ts` — estado compartido (posición, rumbo, sumergido)
- `src/routes/+page.svelte` — Canvas + HUD (botón de inmersión)
