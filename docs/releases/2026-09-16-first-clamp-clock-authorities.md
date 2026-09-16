# `firstNonBlank`/`firstNonEmpty`, `clamp` y `nowIso`/`nowMs` como autoridades · 2026-09-16

## Qué cambia

- 44 módulos definían `first(...values)` con dos comportamientos bajo el mismo nombre: 12 saltaban `null`, `undefined` y cadenas en blanco; 32 saltaban además arrays vacíos y objetos planos sin claves. `src/core/objects.js` exporta `firstNonBlank` y `firstNonEmpty` y los 44 módulos (más 5 plantillas de Home que la importaban de su base) importan la política que reproducen: 1.161 llamadas renombradas. Ninguna aplana argumentos; `repo_integrity.py` mantiene esa invariante sobre los nombres de la autoridad.
- Los selectores viven junto a los guards de objeto y no en un módulo propio: medido, `core/first.js` se convertía en un chunk que importan los tres cierres de arranque (+529 B en la Home pública, por encima del techo).
- `src/core/numbers.js` exporta `clamp(value, min, max)` sin política numérica. Tres copias puras la importan. Cinco copias analizaban dentro de `clamp` (`number(value, min)` en Servidor y Usuarios, `safeNumber` en la plantilla de Servidor): sus 12 llamadas analizan ahora en la llamada con el parser del módulo (7 envueltas con `number(x, min)`; 5 ya pasaban un número analizado o finito, demostrado por sustitución). `correo.api` conserva `clamp(value, fallback, min, max)`, un análisis de entero con fallback que se resuelve con la unidad de números; el contrato lo lista.
- `src/core/clock.js` exporta `nowIso()` y `nowMs()`. Cinco `nowIso` (una con `try/catch` inalcanzable) y tres `now()` sobre `Date.now()` la importan. `runtime-performance` conserva `now()` sobre `performance.now()` (otra semántica).
- `tools/first-numbers-clock-contract.mjs` (en `check:dist`): comportamiento de las políticas, un definidor por nombre (`correo.api` pendiente para `clamp`), ningún `first(...values)`, `now()` ni `nowIso()` local, cada llamada importa la autoridad por su nombre, y `main.js`/analytics no importan estos módulos.
- Fixtures: `private-kpi-render-browser-contract` importa `firstNonEmpty` en la clausura extraída; `private-create-refresh-contract` inyecta `firstNonBlank` real en lugar de un stub llamado `first`.
- Docs: tres filas en `FRONTEND_SHARED_SYSTEMS.md`; `PROJECT_CONTEXT.md` nombra la autoridad en la invariante de arrays.

## Comportamiento

Sin cambio. Equivalencia sobre `origin/main`: las 44 copias de `first` frente a su política en 1.188.000 tuplas (nulos, cadenas en blanco, `0`, `false`, `NaN`, arrays vacíos y anidados, objetos con y sin claves, `Date`, `Map`, `Symbol`, `BigInt`); las 3 copias puras y las 5 con coerción de `clamp` frente a la autoridad y a la composición usada en cada llamada, 3.618 comprobaciones; `new Date().toISOString()` no lanza.

## Cierres de arranque

Frente a main 1de597d3: app 157165 → 157380 (+215), auth 63667 → 63729 (+62), bootstrapPublicHome 218030 → 218260 (+230). Techos 158000 / 64000 / 218500. El kernel retira tres copias de la política corta pero exporta las dos políticas que usan las vistas (+287 en `user-identity`), y el chunk `numbers` añade su entrada de precarga en `routes` (+53); las vistas perezosas bajan entre 77 y 942 bytes cada una.

## Métricas

58 copias retiradas (44 `first`, 8 `clamp`, 5 `nowIso`, 3 `now`; `correo.api` pendiente); 3 autoridades (2 módulos nuevos, 1 ampliado); 56 ficheros de `src` migrados; 1.161 + 12 + 9 + 10 llamadas; 2 políticas de selección y 1 política numérica local documentadas; 746 líneas menos netas (contrato y nota de release incluidos).
