# Cadencia y tiempos de espera declarados: las tres últimas copias con `value = 0` · 2026-09-16

## Problema

La vista y la API base de Servidor y la API de Usuarios conservaban el cuerpo de `finiteNumber` declarado con `value = 0`. Con ese valor por defecto, una llamada que omite la opción no recibe el valor que declara, sino 0, y el `clamp` o el tope genérico de `core/http` deciden en su lugar. El resultado era un runtime que no coincidía con su propio contrato en cuatro sitios alcanzables.

## Causa raíz

`function number(value = 0, fallback = 0)`: el parámetro por defecto convierte `undefined` en 0 antes de la comprobación de blanco, así que `number(options.timeout, USUARIOS_DETAIL_TIMEOUT)` con `options.timeout` ausente devuelve 0 y no 18 000. Nadie eligió esos valores: son el suelo del `clamp` (5 s, 1 s) o el valor por defecto de `core/http` (30 s).

## Autoridad de cada valor

| Valor | Autoridad declarante | Consumidores |
| --- | --- | --- |
| Cadencia del modo en vivo | `SERVER_AUTO_REFRESH_DEFAULT_MS = 30_000` (`src/views/server/server.api.base.js`) | La vista lo renombra `SERVER_REFRESH_INTERVAL_MS`; `startLive` y `setServerAutoRefresh` |
| Tiempo de espera de health | `SERVER_REQUEST_TIMEOUT_MS = 15_000` (misma API base) | Los dos transportes de `httpGet` |
| Tiempos de espera de Usuarios | `USUARIOS_TIMEOUT` 15 s, `USUARIOS_LIST_TIMEOUT` 20 s, `USUARIOS_DETAIL_TIMEOUT` 18 s, `USUARIOS_CREATE_TIMEOUT`, `USUARIOS_UPDATE_TIMEOUT` y `USUARIOS_DELETE_TIMEOUT` 30 s (`src/views/usuarios/usuarios.api.js`) | Cada petición nombra el suyo; el transporte común acota con `clamp(…, 1 s, 120 s)` |

## Presupuesto del backend (verificado en oniontech)

- `server.js`: `conditionalTimeout(NORMAL_API_TIMEOUT_MS)` con **15 s** por defecto para toda ruta normal, health y Usuarios incluidos. Sólo el alta pública de tickets, la subida de adjuntos, las estadísticas de facturas y la finalización de pago tienen presupuestos propios.
- `config/cosmos.js`: `COSMOS_REQUEST_TIMEOUT_MS` por defecto **10 s** (mínimo 3 s), por debajo del presupuesto de la ruta.
- `router/health/internal.js`: el comando de disco corta a 1,8 s y los umbrales consideran crítica una latencia total de 1,5 s.

Por tanto **15 s para health es exactamente el presupuesto que el servidor se da a sí mismo**, y ninguna dependencia tiene un contrato permitido superior: a los 15 s la petición ya ha fallado en el servidor. Los 18 s y 30 s de Usuarios quedan por encima del corte del servidor, que es la dirección segura: la persona ve la respuesta del backend en lugar de un aborto del cliente.

## Cambio

| Entrada | Hoy | Con la autoridad | Impacto |
| --- | --- | --- | --- |
| Botón «En vivo» sin `intervalMs` | `clamp(0, 5 s, 600 s)` = **5 s** | **30 s** | Cadencia visible del refresco automático. Seis veces menos peticiones a `/health/internal`; con 30 s de cadencia y 15 s de tope, dos ciclos ya no pueden solaparse (hoy podían hasta seis) |
| Carga de health sin `timeout` | `core/http` aplica su valor por defecto: **30 s** | **15 s** | Una carga que tarde entre 15 y 30 s hoy responde; ahora corta a la vez que el servidor, que ya la había abandonado |
| Detalle de Usuarios | `clamp(0, 1 s, 120 s)` = **1 s** | **18 s** | El detalle dejaba de cargarse con cualquier backend que tardara más de un segundo |
| Alta de Usuarios | **1 s** | **30 s** | El alta abortaba al segundo aunque el POST siguiera en curso en el servidor |
| Edición y borrado de Usuarios (exportados, sin llamadores en la aplicación) | **1 s** | **30 s** | Igual que el alta cuando alguien los use |
| Estadísticas de Usuarios llamadas directamente | **1 s** | **15 s** | La Home ya pasaba su propio tiempo (`HOME_TIMEOUT_MS`): sin cambio por esa vía |
| Listado de Usuarios | 20 s (explícito) | 20 s | Sin cambio |
| Umbrales de health, `remoteCount`, `lastSyncAt`, `schemaVersion` de la caché | Inalcanzables (el backend y la caché siempre los escriben) | Igual | Ninguno |
| `pagination.pages` de Usuarios | 0 | 1 | `lastResponseMeta.pages` no tiene consumidor |

La cadencia en vivo mantiene su estado correcto durante el intervalo: el tick llama a `load({ force: true, silent: true })`, que no cambia el estado visible de carga, y una secuencia (`loadSequence`) descarta respuestas tardías.

## Abortos y temporizadores

- `createRequestAbort` usa **un solo** `AbortController`: el temporizador y la señal externa lo abortan, y un `abort` posterior sobre un controlador ya abortado no emite un segundo evento (comprobado en el contrato: un aborto externo seguido del temporizador produce exactamente un evento).
- `cleanup()` se ejecuta siempre en el `finally` de la petición, limpia el temporizador y retira el oyente de la señal externa.
- El temporizador del modo en vivo se limpia antes de reemplazarse, al parar y en el desmontaje (`destroy` → `abortLoad` + `stopLive`).

## Pruebas

- `tools/declared-timings-contract.mjs` (en `check:dist`): los valores declarados; que una opción omitida aterriza en el valor declarado y nunca en el suelo del `clamp`; que un valor explícito sigue ganando y que el suelo protege un valor demasiado pequeño; que `normalizeTimeout` de `core/http` no acorta un tiempo declarado (y que 0 caía a su valor por defecto genérico, el comportamiento antiguo); un aborto por petición con el temporizador programado con el tiempo declarado y limpiado en `cleanup`; que cada sitio de llamada lee la constante declarante; y que el tick en vivo refresca en silencio. Prueba negativa: sustituir la constante de cadencia por 0 hace fallar el contrato.
- `tools/first-numbers-clock-contract.mjs`: la cota `FINITE_VALUE_ZERO_PENDING` queda vacía; ningún módulo vuelve a declarar ese cuerpo.
- `npm run validate`, batería de navegador y espejo con el tooling de `main`: en la PR.

## Riesgo

Medio-bajo y acotado. Tres cambios mejoran claramente el comportamiento (detalle, alta y edición de Usuarios dejan de abortar al segundo). Dos son deliberados y visibles: la cadencia del modo en vivo pasa de 5 s a 30 s (el valor declarado, con menos carga sobre el backend) y el tope de health baja de 30 s a 15 s (el mismo presupuesto del servidor). Ningún importe, dato persistido ni permiso cambia.
