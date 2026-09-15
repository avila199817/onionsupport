# `escapeHtml` importada desde su autoridad en todos los módulos · 2026-09-15

## Qué cambia

- Cuatro módulos conservaban su propio escapador HTML, dos con otro nombre: `views/agenda` (`escapeHtml`, con `&#039;`), `views/public` (`escapeHtml` como normalizador de una línea más escape de tres caracteres, y `escapeAttr` encima), `views/incidencias/incidencias.template.js` (`esc`) y `features/facturas-paid-confirm/review-panel.js` (`esc`). Los cuatro importan ahora `escapeHtml` de `src/core/escape-html.js`.
- El shared público deja de exportar `escapeHtml`: los tres templates públicos (inicio, acceso, restablecimiento) importan la autoridad y `escapeAttr` la compone (`escapeHtml(text(value))` más el acento grave), con salida idéntica byte a byte a la anterior.
- `core/public-legal.js` conserva su escapador de cinco caracteres: el guard de integridad de la Home exige que el renderer legal sea un módulo sin `import`.
- `tools/presentation-text-contract.mjs`: `escapeHtml` se define sólo en la autoridad (desaparece la lista pendiente) y ningún otro módulo emite `&amp;` por su cuenta, de modo que una copia con otro nombre falla el contrato; `public-legal` es la excepción listada.
- Docs: fila de `FRONTEND_SHARED_SYSTEMS.md`.

## Comportamiento

Sin cambio visible. Las tres copias con la misma política producen la misma salida que la autoridad (Agenda sólo cambia la grafía `&#039;` → `&#39;`, mismo carácter); en los nodos de texto públicos las comillas pasan a escaparse también y el colapso de espacios queda en manos del HTML, con el mismo DOM. Comprobado con una tanda de equivalencia de 23 entradas (nulos, números, entidades, comillas, acento grave, saltos de línea, Unicode, objetos).

## Cierres de arranque

Medidos frente a main 861c5f8a con el cierre estático del contrato de dist: app 157485 → 157537 (+52, lista de precarga de `routes`), auth 63934 sin cambio, bootstrapPublicHome 218266 → 218428 (+162: el chunk `escape-html` entra en el cierre de la Home pública, 162 bytes; `public-*.js` pierde 96 y `home-*.js` gana 44 por su import). Techos 158000 / 64000 / 218500; quedan 72 bytes bajo el de la Home pública. Chunks diferidos: agenda −112, facturas-paid-confirm −110, incidencias −149.

## Métricas

4 copias retiradas (0 restantes fuera de la excepción documentada); 1 exportación menos en el shared público; 43 llamadas renombradas (`esc` → `escapeHtml`).
