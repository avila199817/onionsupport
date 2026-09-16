# El payload de error llega como texto, no como ruta codificada · 2026-09-16

## Qué cambia

- `core/http.js` aplicaba la pasada de redacción consciente de URL (`redactUrl`, antes su `redact`) a todas las cadenas del payload de error (`sanitizeData` en `createHttpError`), al mensaje de `stats.lastError` y al de `lastRefreshError`. Esa pasada analiza el texto como URL y lo serializa, así que un mensaje que no es una URL vuelve como ruta codificada. Reproducido con el módulo real y un `fetch` simulado (401 con `{ message: "Credenciales inválidas. Revisa tu contraseña." }`): `error.message` llegaba limpio, pero `error.data.message` y `error.payload.message` llegaban como `/Credenciales%20inv%C3%A1lidas.%20Revisa%20tu%20contrase%C3%B1a.`. Las superficies que leen `data.message`/`payload.message` antes que `message` (Cuenta y su API, Servidor ×3, WhatsApp y su API, alta de Usuarios) mostraban el mensaje del backend codificado cada vez que el backend enviaba uno.
- Ahora las cadenas del payload, `stats.lastError.message` y `lastRefreshError.message` van por `redactSecrets` (patrones: rutas legacy, asignaciones sensibles, `Bearer`, JWT), que conserva el texto y los espacios. `endpoint`, `url` y `lastUrl` siguen por `redactUrl`.
- `core/index.js`: `safeError` (el `state.error.message` que expone `AppCore.getState()`), las cadenas de `sanitizeObject` (parámetros de ruta) y `safeHash` van por `redactSecrets`. `safeHash` devolvía `/#fragmento` (la pasada de URL anteponía la ruta raíz), así que `normalizePublicPath("/incidencias#detalle")` daba `/incidencias/#detalle` y `normalizePublicPath("/#servicios")` daba `//#servicios`; ahora conservan el fragmento tal cual, con `#nombre=valor` sensible enmascarado.
- `tools/http-error-payload-contract.mjs` (en `check:dist`): conduce `core/http.js` con un `fetch` simulado y comprueba que `error.message` y `error.data.message` son el texto del backend, que las cadenas del payload se redactan por patrón conservando espacios (anidadas y en arrays), que las claves sensibles siguen enmascaradas por clave, que `endpoint` y `url` siguen redactados como URL y que `stats.lastError.message` es texto.
- `tools/redaction-contract.mjs` mantiene fijado que `redactUrl` codifica un texto que no es URL: es la definición de esa pasada, que sólo se aplica a rutas y URLs.
- Docs: fila de `FRONTEND_SHARED_SYSTEMS.md`.

## Comportamiento

Cambio de comportamiento explícito y acotado:

| Superficie | Antes | Ahora |
| --- | --- | --- |
| `error.data.message` / `error.payload.message` (todo error HTTP con payload) | `/Credenciales%20inv%C3%A1lidas.%20Revisa%20tu%20contrase%C3%B1a.` | `Credenciales inválidas. Revisa tu contraseña.` |
| Cadenas del payload con secretos | `/Consulta%20/reset-password/confirm/***?token=***…` | `Consulta /reset-password/confirm/***?token=*** o Bearer ***` |
| Cadenas del payload con saltos de línea | colapsadas y codificadas | intactas (las vistas aplican `cleanText`) |
| `AppCore.getState().error.message` | `/Sesi%C3%B3n%20expirada` | `Sesión expirada` |
| `stats.lastError.message`, `lastRefreshError.message` (diagnóstico) | ruta codificada | texto |
| `normalizePublicPath("/incidencias#detalle")` | `/incidencias/#detalle` | `/incidencias#detalle` |
| `normalizePublicPath("/#servicios")` | `//#servicios` | `/#servicios` |
| `endpoint`, `url`, `lastUrl`, rutas del snapshot | redactadas como URL | sin cambio |
| Claves sensibles del payload (`token`, `password`…) | `***` | sin cambio |

Vistas afectadas de forma visible: las que prefieren el mensaje del payload (Cuenta, Servidor, WhatsApp, alta de Usuarios) pasan a mostrar el texto del backend que ya pretendían mostrar. Si un mensaje del backend debe reemplazarse por uno de dominio, eso es la capa de presentación (siguiente unidad de la fase de errores, con tablas por dominio para tu aprobación); esta unidad sólo corrige la codificación.

Observado y sin cambio: el enmascarado por clave de `sanitizeData` trata `code` como sensible (es el `code` de OAuth en la lista de parámetros), así que `error.data.code` y `stats.lastError.code` llegan siempre como `***`; el código del backend viaja en `error.code`. Los extractores de vistas que leen `data.code` como candidato (Clientes, Correo, activación, restablecimiento) sólo lo alcanzan cuando `error.code` falta, y entonces obtienen `***`. Se resuelve en la unidad de extracción, con el candidato retirado o el enmascarado ajustado, según decidas.

## Métricas

6 sitios de llamada cambiados (3 en `http`, 3 en `core`); 1 contrato nuevo; comportamiento modificado: sí (tabla anterior); superficie pública sin cambios de forma.
