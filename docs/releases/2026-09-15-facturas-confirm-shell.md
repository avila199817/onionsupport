# Confirmaciones de Facturas sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/features/entity-overlay/modal-host.js`: `renderModalShell` acepta `role` (`dialog` por defecto, `alertdialog` para confirmaciones que interrumpen una tarea); cualquier otro valor cae en `dialog`.
- `src/features/entity-overlay/modal-confirmation.js` (`openModalConfirmation`): el click exterior llega por `onBackdrop` del lifecycle en lugar de un listener propio sobre el overlay; el contrato de `render` pasa a devolver `{ panel, cancel, confirm }` (el overlay ya no es asunto del propietario).
- `src/views/facturas/index.js`: las confirmaciones de reenvío y de registro de cobro se renderizan con `renderModalShell` (`role="alertdialog"`, tamaño `confirm` de 520 px, altura `auto`): eyebrow y título en el header, icono, descripción y metadatos en el body, Cancelar y la acción en el slot `footer`. Identidad conservada: `data-facturas-resend-confirm-overlay`, `data-facturas-resend-confirm-dialog` / `data-facturas-payment-confirm-dialog`, `data-facturas-confirmation-kind`, acciones `data-facturas-*-confirm-action`, ids de título y descripción, host `#facturas-resend-confirm-root`. Los textos con datos (etiqueta, destinatario, importe) se escapan con `escapeHtml`; el panel se localiza con `MODAL_SHELL_SELECTORS.panel`.
- CSS: `views/facturas/resend-confirm.css` 216 → 165 líneas (fuera bloqueo del `body`, `box-sizing`, `:empty`, overlay con `position: fixed` y `z-index` propio, tarjeta y su `focus-visible`, fila de acciones); queda el contenido (icono, copy, eyebrow, metadatos, botones) y la rejilla del body. En móvil los dos botones comparten la fila del footer a partes iguales (antes se apilaban en la tarjeta).

## Contratos

- `tools/modal-shell-contract.mjs`: `SHELL_CONSUMERS` 9 (`views/facturas/index.js`), inventario de shells históricos 9 → 8, y el shell prueba `role: "alertdialog"` y el fallback a `dialog`.
- `facturas_continuous_scroll_contract.py`: las confirmaciones son `alertdialog` sobre el shell con tamaño `confirm` y el backdrop de `openModalConfirmation` cancela por el lifecycle; `facturas-confirmation-browser-contract` localiza el overlay por su marcador de datos.
- Comportamiento verificado con `facturas-confirmation-browser-contract` 11 escenarios (Cancelar, Escape, Tab, abort, detach, popstate, hashchange, pagehide, backdrop: se resuelve una sola vez, el detalle padre sigue abierto y el foco vuelve al disparador), `modal_lifecycle_contract` 22, `facturas-paid-browser-contract` 12, `private-owner-modal-browser-contract` 51/51, `facturas_loading_parity_contract`, `private_css_authority_contract`, `repo_integrity`. Captura sobre el detalle real: panel opaco de 520 × 265 px con header, body y footer del shell.

## Siguiente

Flujo de registro de cobro (`fpc-*`), Correo, visor multimedia y capas legacy de `ui.css`.
