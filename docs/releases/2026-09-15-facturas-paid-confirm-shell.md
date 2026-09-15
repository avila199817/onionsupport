# Registro de cobro de Facturas sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/features/facturas-paid-confirm/index.js` renderiza el diálogo del flujo de cobro con `renderModalShell` (tamaño `compact`, altura `auto`): el hero (icono y copy con eyebrow, título y descripción) y el botón cerrar del shell (`renderModalCloseButton`, acción `cancel`, deshabilitado mientras carga o envía) en el header; resumen, pasos, avisos, errores, acciones, resultado y panel de valoraciones como contenido del body. Identidad conservada: host `#onion-facturas-paid-confirm-root`, `data-fpc-overlay`, `data-fpc-dialog`, ids `fpc-title` / `fpc-description`, acciones `data-fpc-action`. El click exterior llega por `onBackdrop` del lifecycle con la misma política que Escape (no cierra mientras envía); desaparecen el listener de click del host y los selectores de root/panel/scroll de `renderModalContent`.
- `style.css` 642 → 511 líneas: fuera bloqueo del `body`, `box-sizing`, `:empty`, overlay con `z-index` propio, tarjeta y su `focus-visible`, header estructural con su degradado, botón cerrar, scroll del body, `@keyframes` y la geometría móvil (hoja inferior). Queda el contenido: `fpc-hero` (rejilla icono + copy), tipografía del título, resumen, pasos, avisos, resultado, botones y sus versiones responsive.
- Normalizaciones visibles, documentadas: anchura 660 → 720 px (tamaño `compact` del shell), en móvil pantalla completa como el resto de diálogos en lugar de hoja inferior, cierre de 42 px (antes 38) y header sin degradado propio.

## Contratos

- `tools/modal-shell-contract.mjs`: el flujo entra en `SHELL_CONSUMERS` (10), el inventario de shells históricos baja de 8 a 7 y la unidad `facturas-confirm-shell` queda cerrada; el contrato admite consumidores que importan el shell desde una feature hermana (`../entity-overlay/modal-host.js`).
- Comportamiento verificado con `facturas-paid-browser-contract` 12 escenarios (API real de facturas, normalizadores, caché y modal; una sola llamada de pago, reintentos, valoraciones, cierre con `done`), `facturas-confirmation-browser-contract` 11, `modal_lifecycle_contract` 22, `modal_authority_contract`, `ui_loading_browser_contract`, `facturas-paid-state-contract`, `repo_integrity`, `private_css_authority_contract`. Captura sobre el fixture real con el CSS del shell: panel opaco de 720 px con hero, cierre arriba a la derecha y contenido del flujo.

## Siguiente

Correo (redacción, confirmación, firma), visor multimedia de Incidencias, capas legacy de `ui.css` y el override del perfil de técnico.
