# Una autoridad para `cleanText` en los módulos de dominio · 2026-09-15

## Qué cambia

- 15 módulos fuera de los cierres de arranque dejan de llevar su copia de `cleanText` e importan la canónica de `src/core/presentation-text.js`: Clientes (api, model), Cuenta, Empleados, Facturas (api base, vista), Incidencias (api, vista, impl), Usuarios (api), avatares de comentarios, toasts, topbar ejecutivo (eventos y base) y WhatsApp (api).
- Las tres variantes que además recortaban o filtraban componen la canónica en lugar de copiarla: `clipText(value, fallback, max)` en `features/topbar-executive` (180 / 500 por defecto) y `cleanMessageText(value, fallback, max)` en `views/whatsapp/whatsapp.api.js` (elimina caracteres de control y recorta a 4096). Mismo resultado para toda entrada.
- `tools/presentation-text-contract.mjs` recorre `src/**/*.js`: `cleanText` sólo se define en la autoridad y en las 16 copias listadas (app, loader, core, http, auth, router ×3, vistas públicas ×4 y las cuatro mejoras precargadas desde el bootstrap: DataList móvil, soporte público extremo, precarga de intención de ruta y deeplink de tickets), y todo módulo que la llama la importa. La lista no admite altas; la retira la unidad que lleva el helper al chunk del kernel y mide los cierres de arranque.

## Por qué las cuatro mejoras esperan

Sus importaciones dinámicas viven en el chunk `enhancements`, que pertenece al cierre `bootstrapPublicHome`. Al importar la autoridad, cada una añadía el chunk `presentation-text` a su lista de precarga: +68 bytes en un cierre con 30 de margen (medido: 217970 → 218041 frente al techo 218000). Cuando el kernel importe el helper, ese chunk desaparece y las listas no crecen.

## Comportamiento

Sin cambio: las 12 copias sustituidas eran idénticas a la canónica (la de avatares sin parámetro de reserva, equivalente con la reserva vacía por defecto; la de Usuarios trataba `null`/`undefined` aparte con el mismo resultado). Las tres variantes compuestas se compararon con las originales sobre más de 4000 combinaciones (caracteres de control, NBSP, separadores de línea, objetos, números, todos los `max`). Cierres de arranque: app +3 y bootstrapPublicHome +6 bytes (listas de precarga que nombran el chunk `presentation-text`), auth sin cambio; techos respetados.

## Métricas

15 copias retiradas en `src`; 16 pendientes de la unidad de arranque.
