# Alta de Facturas sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/views/facturas/facturas.template.create.js` renderiza el alta con `renderModalShell` (variante `data-modal-size="form"` y altura `auto`: la misma anchura y el mismo tope de altura que imponía la composición de altas, con el panel creciendo con el contenido), el bloque de título (`fac-create-header-copy`) y el botón cerrar del shell (`renderModalCloseButton`, deshabilitado durante el envío), el velo de envío como preludio del panel y el formulario como contenido del body del shell (único scroll, clase de contenido `fac-create-body` para su padding y marcador `data-facturas-create-body` que el controlador usa para conservar el scroll). Identidad conservada: `data-facturas-create-root`, `data-facturas-create-modal-overlay`, `data-facturas-create-modal-panel`, ids de root, panel y formulario, acción `create-close`.
- `src/views/facturas/index.js`: el click exterior del alta llega por `modal-lifecycle` (`onBackdrop` → `closeCreateModal`, que sigue rechazando el cierre durante el envío); desaparece la última rama de backdrop del `onClick`.
- CSS: `views/facturas/create.css` 1300 → 1015 líneas (fuera root, overlay, panel, header estructural con icono y eyebrow muertos, botón cerrar, scroll del body, bloqueo del `body`, `@keyframes`, geometría responsive del shell, el bloque de movimiento reducido con cuatro `!important` y las reglas muertas `fac-create-footer*` y `fac-create-btn*`, sin consumidor en la plantilla). El formulario es un bloque de contenido del body del shell: la regla `grid-template-rows: minmax(0, 1fr) auto` que conservaba de cuando envolvía al scroll colapsaba la primera sección dentro del grid del body (lo detectó `factura-create-browser-contract`: los resultados de clientes quedaban bajo la sección de incidencias). `compositions/private-create-modal.css` retira las entradas de Facturas de sus listas estructurales; Clientes y Usuarios siguen recibiendo el chrome de alta desde la composición hasta su migración.

## Contratos

- `tools/modal-shell-contract.mjs`: el alta de Facturas entra en `SHELL_CONSUMERS` (5); el inventario de shells históricos baja de 17 a 15.
- `private_create_modal_contract.py`: Facturas usa `renderModalShell` y `renderModalCloseButton` y conserva `bodyClass: "fac-create-body"`; `private_css_authority_contract.py` deja de nombrar el overlay retirado; `factura-create-browser-contract` localiza overlay y panel por sus marcadores de datos.
- Comportamiento verificado con `factura-create-browser-contract` (controlador y plantillas reales: apertura, Escape, reconciliación del DOM, scroll estable en móvil, sin desbordamiento horizontal), `modal_lifecycle_contract` y `private-owner-modal-browser-contract`.

## Siguiente

Altas de Clientes y Usuarios sobre el mismo shell; al terminar, `private-create-modal.css` queda sólo como autoridad de contenido del formulario de alta.
