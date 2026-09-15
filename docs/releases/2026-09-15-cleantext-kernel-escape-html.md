# `cleanText` importada desde el kernel y `escapeHtml` en su propio módulo · 2026-09-15

## Qué cambia

- Los 16 módulos que quedaban con su copia de `cleanText` la importan de `src/core/presentation-text.js`: `app/index.js`, `app/loader.js`, `core/index.js`, `core/http.js`, `features/auth`, `router/index.js`, `router/routes.js`, `router/styles.js`, las cuatro vistas públicas (inicio, acceso, activación, restablecimiento) y las cuatro mejoras precargadas desde el bootstrap (DataList móvil, soporte público extremo, precarga de intención de ruta, deeplink de tickets). Todas las copias eran idénticas a la canónica. `AppCore.utils.cleanText` pasa a ser la misma función que exporta la autoridad.
- `escapeHtml` sale de `presentation-text.js` a `src/core/escape-html.js` (código idéntico); 23 importadores actualizan la ruta. Las reexportaciones en vivo de Home y Correo conservan la identidad.
- `tools/presentation-text-contract.mjs`: `cleanText` se define sólo en la autoridad (sin lista pendiente); `escapeHtml` sólo en la suya más las dos copias de `views/agenda` y `views/public`, que retira su propia unidad; todo módulo que llama a cualquiera de las dos la importa.
- Docs: filas de `FRONTEND_SHARED_SYSTEMS.md`.

## Por qué se separa el escape HTML

Los cierres de arranque (`app`, `auth`, `bootstrapPublicHome`) tienen techos medidos y `presentation-text` se sirve como chunk propio (lo importan módulos sin `core`, como `http`, `loader` o `modal-host`), así que el kernel no puede fundirlo en `core`. Importar el módulo completo desde el kernel dejaba `auth` en 64088 bytes (techo 64000): 267 bytes de chunk frente a 137 de copias retiradas. Con el normalizador solo, el chunk mide 113 bytes y los tres cierres bajan. El contrato ya trataba escape y normalización como políticas distintas; ahora cada una tiene su módulo.

## Comportamiento

Sin cambio: sustituciones idénticas y rutas de import. Cierres de arranque medidos frente a main a46a4037: app 157616 → 157485 (−131), auth 63958 → 63934 (−24), bootstrapPublicHome 217970 → 217903 (−67); techos 158000 / 64000 / 218000.

## Métricas

16 copias retiradas (31 → 0 en total con la unidad anterior); 2 módulos de autoridad; 23 rutas de import actualizadas.
