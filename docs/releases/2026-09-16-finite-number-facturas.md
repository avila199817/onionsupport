# Facturas usa `finiteNumber`: auditoría por sitio de las copias con `value = 0` · 2026-09-16

## Problema

Cuatro módulos conservaban el cuerpo de `finiteNumber` declarado con `value = 0` (vista y API base de Servidor, vista de Facturas, API de Usuarios; 76 llamadas). En ellos `undefined` es 0 en lugar del fallback que la llamada declara, y el contrato los listaba como cota pendiente. La regla de esta unidad: migrar sólo lo que no cambia comportamiento visible ni semántica de importes.

## Causa raíz

El parámetro por defecto `value = 0` convierte `undefined` en 0 antes de la comprobación de blanco, así que `number(undefined, fallback)` devuelve 0 y no `fallback`. Frente a la autoridad, la única diferencia del mecanismo es `undefined` con fallback distinto de 0 (corpus de 31 valores × 9 fallbacks: 279 comprobaciones, 8 diferencias, todas ese caso). Que la diferencia sea alcanzable depende de cada sitio de llamada.

## Cambio

- `src/views/facturas/index.js`: la copia `number` desaparece y sus 21 llamadas importan `finiteNumber` de `core/numbers.js`. Cada sitio es idéntico en lo alcanzable: siete llamadas con fallback 0 (importes y `lastSyncAt`); las de paginación están envueltas en `Math.max(fallback, …)` o `clamp` con suelo igual al fallback, reciben el resultado de `firstNonEmpty` (que devuelve `null`, nunca `undefined`), un parámetro con valor por defecto (`requestPage`, `setPage(value = DEFAULT_PAGE)`, `removeCreateLineItem(index = -1)`) o `nextPage`, que el estado y la caché mantienen como número o `null`; `data-line-index` se renderiza siempre junto a `data-line-field` y en el botón de quitar línea, y la reconciliación local del alta sincroniza todos los atributos, así que el `dataset` nunca llega sin él. 16 formas de sitio × entradas alcanzables (14.184 comprobaciones): 0 diferencias.
- `tools/first-numbers-clock-contract.mjs`: la cota `FINITE_VALUE_ZERO_PENDING` pasa de cuatro a tres módulos; el cuerpo con `value = 0` en Facturas haría fallar el contrato.
- `src/core/numbers.js` (cabecera) y la fila de números de `docs/FRONTEND_SHARED_SYSTEMS.md` describen los tres módulos pendientes y esta nota.

## Pendiente: los tres módulos con diferencias alcanzables

Entrada → comportamiento actual → comportamiento con la autoridad → impacto. Ninguno toca importes; todos se deben al parámetro por defecto, no a una política deliberada.

| Módulo | Entrada | Hoy | Con `finiteNumber` | Impacto |
| --- | --- | --- | --- | --- |
| Servidor, vista (`startLive`) | Botón «En vivo» (`toggleLive()` sin `intervalMs`; `startServerLive`/`toggleServerLive` sin llamadores externos) | `clamp(0, 5 s, 600 s)` = 5 s: el modo en vivo refresca cada 5 s y `server:live:changed` publica `intervalMs: 5000` | 30 s (`SERVER_REFRESH_INTERVAL_MS`, el valor declarado) | Cadencia visible del refresco automático; seis veces menos peticiones a `/health/internal` |
| Servidor, API base (`httpGet`) | La vista carga con `{ source, signal }` sin `timeout` (`loadServerSnapshot` → `fetchServerHealthRequest`) | `timeout: 0` → `core/http` aplica su valor por defecto: 30 s | 15 s (`SERVER_REQUEST_TIMEOUT_MS`) | Una carga de health que tarde entre 15 y 30 s hoy responde; con la autoridad fallaría por tiempo de espera. Sólo visible con backend lento |
| Servidor, API base (umbrales, 8 llamadas) | `thresholds.*` del payload | Inalcanzable: `getDetailedHealth` envía siempre `thresholds` con las ocho claves y `normalizeServerSnapshot` sólo recibe esa respuesta | Igual hoy; con un backend sin `thresholds`, los valores por defecto en vez de 0 (que marcaría «crítico» cualquier uso) | Ninguno con el backend actual |
| Servidor, API base (`setServerAutoRefresh`) | `options.intervalMs` ausente | 5 s | 30 s | Exportación pública sin llamadores en la aplicación |
| Usuarios, API (`httpRequest`) | Detalle desde la vista (`loadUsuarioDetail` con `{ force, dedupe, signal, allowCacheFallback }`), alta desde el formulario (`createUsuario(payload)`), perfil técnico (`getUsuarioByIdRequest(id, { dedupe: true })`) | `timeout: number(undefined, X)` = 0 → `clamp(0, 1 s, 120 s)` = 1 s: la petición aborta al segundo | 18 s (detalle), 30 s (alta), los valores declarados | Visible con backend lento (más de 1 s): hoy error de tiempo de espera, y en el alta el POST puede haberse ejecutado; con la autoridad, la espera declarada. Lista (`loadUsuarios` pasa 20 s) y estadísticas desde la Home (`HOME_TIMEOUT_MS`) no cambian; edición y borrado no tienen llamadores en la aplicación |
| Usuarios, API (`pages`) | `response.pagination.pages`, que el backend no envía | 0 | 1 | `lastResponseMeta.pages` no tiene consumidor |

El resto de llamadas de los tres módulos es idéntico: fallback 0, guardas previas de `null`/`undefined`, parámetros con valor por defecto (`= null`, `= 0`, `= Date.now()`, `maxLength = 120`, `maxItems = 100`, `pageSize = 20`, `page = 1`), `Math.max`/`clamp` con suelo igual al fallback, cadenas `||` que terminan en constante, y las claves `remoteCount`/`lastSyncAt` que la caché de Usuarios escribe siempre.

## Pruebas

- `scratchpad/u11afix-facturas-equivalence.mjs`: mecanismo (279 comprobaciones; diferencias sólo en `undefined` con fallback distinto de 0) y 16 formas de sitio sobre entradas alcanzables (14.184 comprobaciones, 0 diferencias).
- `npm run validate` (fuente, build confiable, build y `check:dist` con el contrato de números: PASS, cota de tres módulos).
- Batería de navegador y espejo con el tooling de `main` (véase la PR).

## Cierres de arranque

`app` 156026 → 156026, `auth` 62996 → 62996, `bootstrapPublicHome` 216106 → 216106 (techos 158000 / 64000 / 218500). Chunk `facturas` 175233 → 175146 (−87 B).

## Riesgo

Bajo. Una copia retirada (−7 líneas, +1 nombre importado) con equivalencia por sitio; sin cambio de importes ni de valores mostrados. Los tres módulos pendientes no se tocan.
