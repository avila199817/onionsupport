# Detalle de Facturas sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/views/facturas/facturas.template.modal.base.js` renderiza el detalle con `renderModalShell` (variante `data-modal-size="wide"`, mismos 1240 px y 92dvh que definía la hoja propia). Los tres estados comparten estructura: carga y «detalle no disponible» usan `renderModalState` (el reintento conserva `retry-factura-detail`); la ficha aporta header (`facturas-detail-header`: identidad, acciones y meta) y body (`facturas-detail-body`) como contenido. El botón cerrar es el del shell (`renderModalCloseButton`, deshabilitado mientras hay una acción en curso, como antes) y deja de formar parte de `facturas-detail-actions`. `renderFacturasDetailContent` sigue devolviendo sólo contenido (header + body) para el contrato del registro técnico.
- Identidad conservada: `data-facturas-detail-root`, `data-facturas-detail-overlay`, `data-facturas-detail-modal`, `data-facturas-detail-body-shell` (ahora el body del shell, único scroll), `data-factura-id/sent/paid/busy` (en el panel), `close-factura-detail`. Desaparecen el alias `data-role="facturas-detail-modal"` y la capa `facturas-detail-layout`.
- `src/views/facturas/index.js`: el click exterior llega por `modal-lifecycle` (`onBackdrop` → `closeDetailModal`, que mantiene su guarda de cobro en curso); la rama propia del `onClick` desaparece; `renderModalContent` ya no recibe selectores (los del shell son el valor por defecto). `facturas-paid-confirm` añade su botón al final de las acciones del dominio y deja de buscar el botón cerrar.
- `src/css/views/facturas/detail.css` pasa de 910 a 671 líneas: fuera root, overlay, panel, `layout`, bloqueo del `body`, `body-shell`, botón cerrar, skeleton de carga, `sr-only`, `@keyframes` y toda la geometría responsive/print del shell; quedan los tokens de contenido (`--fdm-section-radius`, `--fdm-card-radius`) y el contenido del detalle. `components/skeleton.css` retira `.facturas-detail-skeleton` (sin consumidor) y los contratos de carga dejan de exigirlo.

## Contratos

- `tools/modal-shell-contract.mjs`: Facturas entra en `SHELL_CONSUMERS`; el inventario de shells históricos baja de 21 a 19; nuevo check: Incidencias y Facturas producen el mismo esqueleto estructural (elementos y marcadores del shell en orden) en carga y error, idéntico al de la superficie pendiente del dispatcher, con un solo `role="dialog"`, un body, un botón cerrar y un estado compartido; la ficha de Facturas conserva ese esqueleto y declara su anchura como variante.
- `private_css_authority_contract.py` deja de nombrar el overlay retirado.
- Comportamiento verificado con `private-owner-modal-browser-contract` (factura: apertura, cierre, Escape, click exterior, reintento, foco), `facturas-confirmation-browser-contract` (reenvío y cobro sobre el detalle real, scroll del body del shell, DOM estable), `facturas-paid-browser-contract`, `spa-modal-regression`.

## Siguiente

Altas (Incidencias, Facturas, Clientes, Usuarios) sobre el shell; después Clientes, confirmaciones de Facturas, Correo y visor de adjuntos.
