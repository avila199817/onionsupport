# Alta de Incidencias sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/views/incidencias/incidencias.template.create.impl.js` renderiza el alta con `renderModalShell` (variante `data-modal-size="form"` y altura `auto`: los mismos 1080 px y el mismo tope de 92dvh / 900 px que definía la composición de altas, con el panel creciendo con el contenido; en teléfonos el shell extiende la pantalla completa también a los paneles `auto`, regla nueva en `detail-modal.css` fijada por `modal-shell-contract`). El header lleva el bloque de título (`inc-create-header-copy`) y el botón cerrar del shell (`renderModalCloseButton`, deshabilitado mientras se envía, como antes); el body del shell es el único scroll y conserva la clase de contenido `inc-create-body` (padding del formulario); el velo de envío es el preludio del panel. Identidad conservada: `data-incidencias-create-root`, `data-incidencias-modal="create"`, `data-incidencias-create-modal-overlay`, `data-incidencias-create-modal-panel`, `data-create-mode`, ids de root, panel y formulario, acción `create-close`. El modo cliente (900 px) es un token del shell: `.inc-create-root.is-client { --ui-detail-modal-panel-width }`.
- `src/views/incidencias/index.impl.js`: el click exterior del alta llega por `modal-lifecycle` (`onBackdrop` → `closeCreateModal`, que sigue rechazando el cierre durante el envío); desaparece la última rama de backdrop del `onClick` del host.
- CSS: `views/incidencias/create.css` pasa de 1257 a 1039 líneas (fuera root, overlay, panel, header estructural, botón cerrar, scroll del body, bloqueo del `body`, `@keyframes`, tema claro del overlay y la geometría responsive/print del shell; la tipografía del título vive bajo `inc-create-header-copy`). `compositions/private-create-modal.css` (1110 → 1082) retira las entradas de Incidencias de sus listas estructurales `:is()`; Facturas, Clientes y Usuarios siguen recibiendo el chrome de alta desde esa composición hasta su migración.

## Contratos

- `tools/modal-shell-contract.mjs`: el alta de Incidencias entra en `SHELL_CONSUMERS` (4); el inventario de shells históricos baja de 19 a 17 (las dos reglas `position: fixed` de `create.css` desaparecen y las listas `:is()` de la composición ya no nombran a Incidencias).
- `private_create_modal_contract.py`: Incidencias sigue siendo la referencia del alta; su estructura es el shell (`renderModalShell`, `renderModalCloseButton`, `bodyClass: "inc-create-body"`, `inc-create-header-copy`). `private_css_authority_contract.py` deja de nombrar el overlay retirado.
- Comportamiento verificado con los contratos de alta (validación, combobox, selección de usuario, identidad de avatar, refresco tras crear), `modal_lifecycle_contract` y `private-owner-modal-browser-contract`.

## Siguiente

Altas de Facturas, Clientes y Usuarios sobre el mismo shell; al terminar, `private-create-modal.css` queda sólo como autoridad de contenido del formulario de alta.
