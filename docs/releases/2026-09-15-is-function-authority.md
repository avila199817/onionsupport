# `isFunction` en la autoridad de guards de forma · 2026-09-15

## Qué cambia

- 27 módulos definían `isFunction(value)` con el mismo cuerpo (`typeof value === "function"`), 12 de ellos en el kernel y la UI compartida. `src/core/objects.js` la exporta junto a `isObject` y `safeObject`; 26 módulos la importan y la copia muerta de `ui/toast` desaparece.
- `main.js` conserva la suya, como `isObject`: la entrada no importa módulos compartidos (rolldown los plegaría en el chunk de entrada).
- `tools/shape-guards-contract.mjs`: `isFunction` se define sólo en la autoridad (`main.js` exento), toda llamada la importa, y comportamiento con funciones, funciones asíncronas, clases y no funciones.
- Docs: fila de `FRONTEND_SHARED_SYSTEMS.md`.

## Comportamiento

Sin cambio: un solo cuerpo posible.

## Cierres de arranque

Frente a main e9b34da5: app 157355 → 157165 (−190), auth 63733 → 63667 (−66), bootstrapPublicHome 218219 → 218030 (−189). Techos 158000 / 64000 / 218500.

## Métricas

26 copias retiradas y una muerta, 28 ficheros, 94 líneas menos.
