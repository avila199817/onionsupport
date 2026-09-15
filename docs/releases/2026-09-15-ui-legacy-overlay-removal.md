# Capas legacy de `ui.css` retiradas · 2026-09-15

## Qué cambia

- `src/css/components/ui.css` 3269 → 3012 líneas: desaparece la sección `MODAL / DRAWER / OVERLAY` (`.ui-overlay`, `.ui-modal` y sus tamaños, `.ui-modal-header/-footer/-body/-title`, `.ui-modal-close`, `.ui-drawer`, `.ui-drawer-close`, sus scrollbars, estados ocultos y variantes a 768 px, transparencia y movimiento reducidos, forced-colors e impresión) y las 45 entradas de esas clases en las listas compartidas de `box-sizing`, tap-highlight, botones de icono y foco. Ninguna plantilla, controlador ni página las emitía: eran el sistema de diálogos anterior a la autoridad `components/detail-modal.css`.
- `src/css/core/guardrails.css`: se retira la salvaguarda de viewport de `.incidencias-modal, .facturas-modal, .clientes-modal, .usuarios-modal, .ui-modal, .ui-drawer` (ninguna de esas clases existe en el DOM; los diálogos reales llevan `ui-detail-modal-panel`, cubierto por la autoridad y por la salvaguarda `[role="dialog"]`) y la de cuerpos queda en `.clientes-modal-body, .usuarios-modal-body`, las dos únicas que se renderizan.
- Tokens huérfanos retirados de `tokens/variables.css` y `tokens/light.css` (sin ningún `var()` fuera de la sección eliminada): `--z-drawer`, `--modal-bg`, `--drawer-bg`, `--shadow-modal`, `--overlay-blur`, `--modal-width-sm/-md/-lg/-xl`, `--drawer-width`, `--drawer-width-lg`, `--overlay-enter-duration`, `--overlay-exit-duration`, `--modal-padding`, `--modal-header-gap`, `--modal-body-gap`, `--modal-footer-gap`. Se conservan `--overlay-bg` (lo consume la bienvenida de Home), `--modal-radius` (base de `--ui-detail-modal-radius`) y `--z-modal`.

## Contratos

- `tools/modal-shell-contract.mjs`: salen las entradas `.ui-overlay` y `.ui-drawer` del inventario de reglas `position: fixed`; queda un único shell histórico pendiente (`.incidencias-media-viewer`, unidad `media-viewer-review`). Verificado con `modal-shell-contract`, `repo_integrity`, `private_css_authority_contract` y `npm run validate`.

## Siguiente

Revisión del visor de adjuntos de Incidencias y unidad de contenido de los detalles.
