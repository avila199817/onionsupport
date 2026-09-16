# `coercedNumber` y `finiteNumber`: dos políticas numéricas nombradas en `core/numbers.js` · 2026-09-16

## Qué cambia

- 15 definiciones locales en 14 módulos hacían la misma coerción (`Number(value)` finito o el fallback) con dos lecturas distintas del valor en blanco, bajo cuatro nombres (`number`, `safeNumber`, `finiteNumber`, `optionalNumber`). `src/core/numbers.js` exporta las dos políticas y cada módulo importa la que reproducía:
  - `coercedNumber(value = 0, fallback = 0)`: `undefined`, `null`, `""` y espacios son 0, como los lee `Number()` (las copias declaraban `value = 0`); sólo `NaN` e infinitos caen al fallback. 8 copias (`number` en las plantillas y controladores de Clientes y Usuarios, el cursor de Usuarios, las facetas y el alta de Incidencias; `finiteNumber` en la API de Incidencias), 35 llamadas.
  - `finiteNumber(value, fallback = 0)`: un blanco (`undefined`, `null`, `""`) es el fallback; el resto, `Number(value)` si es finito. 7 copias (`safeNumber` en la API, la plantilla y la base de plantilla de Servidor; `number` en el perfil técnico y en la base de plantillas de Home; `optionalNumber` de Home y `finiteNumber` de la factura canónica, ambas con fallback `null`, que ahora lo nombran en la llamada), 56 llamadas. `nonNegativeInteger` del perfil técnico compone la autoridad.
- Cuatro módulos conservan el cuerpo de `finiteNumber` declarado con `value = 0` (vista y API base de Servidor, vista de Facturas, API de Usuarios; 77 llamadas): en ellos `undefined` es 0 mientras `null` y `""` son el fallback. Migrarlos cambia valores alcanzables (véase «Pendiente»); el contrato los lista como cota superior hasta esa decisión.
- Quedan locales, con política propia y listadas en el contrato: `clamp(value, fallback, min, max)` de `correo.api` (entero con fallback), `integer` de la Home (entero seguro ≥ 0), `parseNumber` de la Home pública (coma decimal sobre `parseFloat`), el `number` positivo del alta de Incidencias y los parsers de importes (símbolos, coma decimal, `round2`), que son la unidad de importes.
- `tools/first-numbers-clock-contract.mjs` (en `check:dist`): comportamiento de las dos políticas (blancos, espacios, booleanos, arrays, hexadecimal, exponente, coma decimal no aceptada, `NaN`, infinitos, `-0`, fallbacks por defecto), un definidor por nombre, ningún cuerpo de `coercedNumber`, `finiteNumber` ni `optionalNumber(value)` fuera de la autoridad, la cota de los cuatro módulos con `value = 0`, cada llamada importa la autoridad por su nombre y `main.js`/analytics no importan el módulo.
- `clientes_scale_contract.py` admite que el controlador de Clientes importe `coercedNumber` de la autoridad en lugar de definir su copia.
- Docs: fila de números en `FRONTEND_SHARED_SYSTEMS.md`.

## Comportamiento

Sin cambio. Equivalencia de cada copia retirada (extraída de `HEAD`) frente a su política sobre un corpus de 41 valores (números, `-0`, `2^53`, `NaN`, infinitos, cadenas numéricas, con espacios, con coma, hexadecimal, exponente, texto, blancos, booleanos, arrays, objetos, `Date`, `BigInt`, `Symbol`) × 7 fallbacks (`0`, `null`, `42`, `-1`, `undefined`, `NaN`, texto) y con un solo argumento: 4.428 comprobaciones sobre las 15 copias y la composición de `nonNegativeInteger`. Idénticas salvo un caso no alcanzable: las cuatro copias con `fallback = null` por defecto (`safeNumber` ×3, `number` del perfil técnico) devolvían `null` cuando se omitía el fallback y la autoridad devuelve 0; las 45 llamadas nombran su fallback.

## Pendiente: los cuatro módulos con `value = 0`

Frente a `finiteNumber`, las cuatro copias sólo difieren en `undefined` con fallback distinto de 0 (5 casos por copia en el corpus). En sus 77 llamadas, 54 pasan un fallback distinto de 0; las que pueden recibir `undefined`, con su efecto hoy (`undefined` → 0) frente a la política (`undefined` → fallback), por módulo:

- Servidor (`server.api.base`): `timeout: number(options.timeout, 15 s)` en `httpGet` → hoy 0 y `core/http.js` aplica su tope por defecto (30 s); con la política, 15 s. Umbrales `number(thresholds.cpuWarnPercent, 85)` y siete más → hoy 0 (todo uso ≥ 0 sería crítico) cuando el payload no trae `thresholds`; el backend los envía en la respuesta normal. `setServerAutoRefresh` (sin llamadores) → intervalo 5 s (suelo del `clamp`) frente a 30 s.
- Servidor (vista): `startLive(options)` → `clamp(number(options.intervalMs, 30 s), 5 s, …)` → hoy 5 s cuando no llega `intervalMs`; con la política, 30 s (el valor por defecto declarado).
- Facturas (vista): `number(field.dataset?.lineIndex, -1)` y `number(node?.dataset?.lineIndex, -1)` → hoy línea 0 cuando falta el índice; con la política, −1 (sin línea). `Math.max(DEFAULT_PAGE, number(nextPage, page + 1))` → hoy página 1 si `nextPage` falta; con la política, `page + 1`. El resto de llamadas están envueltas en `Math.max` con el propio fallback y no cambian.
- Usuarios (API): `clamp(number(options.timeout, USUARIOS_TIMEOUT), 1 s, 120 s)` → hoy 1 s cuando no llega `timeout`; con la política, el tiempo declarado. Cinco `timeout: number(options.timeout, X)` → hoy 30 s (tope de `http`) frente a X. `Math.max(0, number(payload.remoteCount, items.length))`, `pages: number(response?.pagination?.pages, 1)`, `lastSyncAt` → hoy 0 frente a `items.length`, 1 y la fecha de caché.

Todos van en la dirección del fallback que la llamada declara; ninguno afecta a importes. Decisión del propietario antes de migrarlos (unidad U11a-fix), por el cambio de cadencia y de tiempos de espera visibles.

## Cierres de arranque

Frente a main 92f04fca: app 155917 → 155920 (+3), auth 62996 → 62996 (0), bootstrapPublicHome 215880 → 215921 (+41). Techos 158000 / 64000 / 218500. El chunk `numbers` crece 172 bytes con las dos políticas y las vistas perezosas bajan: Servidor −315, Usuarios −124, Incidencias −95, Clientes −88, perfil técnico −56, `invoice-api` −44, modal de Usuarios −25, API de Incidencias −20; el resto de variaciones (+3 en `routes`, +34/+38 en chunks que no cambian de código) son los nombres con hash de la lista de precarga.

## Métricas

15 copias retiradas (8 `coercedNumber`, 7 `finiteNumber`); 1 autoridad ampliada con 2 políticas; 15 ficheros de `src` migrados; 91 llamadas; 4 copias en cota pendiente con auditoría; 5 políticas locales documentadas; 57 líneas menos en `src` (145 + / 202 −); +41 netas en total con el contrato ampliado y esta nota.
