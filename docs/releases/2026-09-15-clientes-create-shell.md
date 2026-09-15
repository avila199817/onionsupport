# Alta de Clientes sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/views/clientes/clientes.template.create.js` renderiza el alta con `renderModalShell` (variante `data-modal-size="form"` y altura `auto`: la misma anchura de 1080 px y el mismo tope de altura que imponía la composición, con el panel creciendo con el contenido), el bloque de título (`cli-create-header-copy inc-create-header-copy`) y el botón cerrar del shell (`renderModalCloseButton`, deshabilitado durante el envío), el velo de envío como preludio del panel y el formulario como contenido del body del shell (`bodyClass: "cli-create-body inc-create-body"`, único scroll). Identidad conservada: `data-clientes-create-root`, `data-clientes-modal="create"`, `data-clientes-create-modal-overlay`, `data-clientes-create-modal-panel`, ids de root, panel y formulario, acción `create-close`. El mapa de iconos pierde los glifos sin consumidor (`close`, que aporta el shell, y `building` y `user`).
- `src/views/clientes/clientes.create-controller.js`: el click exterior llega por `modal-lifecycle` (`onBackdrop` → `close()`, que sigue rechazándose durante el envío); desaparecen la rama de backdrop del `handleModalClick` y los selectores de root, overlay y body (el host reconcilia con los marcadores del shell y conserva foco y scroll igual que antes).
- CSS: `views/clientes/create.css` 1007 → 747 líneas (fuera root, overlay, panel, header, `title-wrap` e icono muertos, botón cerrar, scroll del body, bloqueo del `body`, `@keyframes`, overlay del tema claro y la geometría responsive/print del shell; la tipografía del título vive bajo `cli-create-header-copy`). **Bug corregido:** en escritorio el título y el subtítulo se pintaban en dos columnas porque `cli-create-header-copy` conservaba la rejilla `auto minmax(0, 1fr)` del icono retirado; ahora se apilan como en las demás altas. `compositions/private-create-modal.css` 1053 → 998: Clientes sale de las listas estructurales; sólo Usuarios recibe ya el chrome de alta desde la composición.

## Contratos

- `tools/modal-shell-contract.mjs`: el alta de Clientes entra en `SHELL_CONSUMERS` (6); el inventario de shells históricos baja de 15 a 13.
- `private_create_modal_contract.py`: Clientes usa `renderModalShell` y `renderModalCloseButton`, conserva `cli-create-header-copy inc-create-header-copy` y `bodyClass: "cli-create-body inc-create-body"` y no puede volver a emitir `cli-create-close`; `private_css_authority_contract.py` deja de nombrar el overlay retirado.
- Comportamiento verificado con `modal_lifecycle_contract` (escenario real del alta de Clientes), `private-owner-modal-browser-contract` 51/51 y una medición directa del alta a 1366 px y 390 px: apertura, click exterior, Escape, botón cerrar, retorno de foco al disparador, ciclo de Tab dentro del panel, un solo host sin nodos huérfanos tras aperturas repetidas, sin desbordamiento horizontal en móvil.

## Siguiente

Alta de Usuarios sobre el mismo shell; al terminar, `private-create-modal.css` queda sólo como autoridad de contenido del formulario de alta.
