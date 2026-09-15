# Detalle de Incidencias sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/views/incidencias/incidencias.template.modal.impl.js` renderiza el detalle (carga, error y ficha) con `renderModalShell`: root, overlay, panel, header, body, `role="dialog"`, ARIA y botón cerrar los emite el shell; el dominio aporta contenido, acciones y su identidad (`data-incidencias-modal-*`, `incidencias-modal-root` como ámbito de estilo del contenido). El botón cerrar es `renderModalCloseButton`; la carga y el error usan `renderModalState` (id `incidencias-modal-description`, `Reintentar` con `data-detail-action="detail-retry"`).
- Desaparecen las clases estructurales duplicadas `incidencias-modal-overlay/-panel/-header/-body/-title/-close-btn` y con ellas el CSS que las gobernaba: el bloqueo de scroll del `body` y dos `@keyframes` sin uso en `views/incidencias/detail.css`, el override de posición del panel y los selectores de slots en `media-preview.core.css` (ahora por `[data-modal-body]`), y el bloque de cierre de `compositions/private-admin-interactions.css`.
- `components/detail-modal.css` adopta el lenguaje de cierre del área privada que ese bloque duplicaba (42 px, radio de botón, hover y activo en error): un solo control de cierre para todos los diálogos (Incidencias, Usuarios, perfil del técnico, dispatcher). El body del shell asume `max-inline-size: 100%` y `overflow-wrap: anywhere`, antes en `core/guardrails.css` bajo el alias de Incidencias.
- El click exterior llega al controlador por `modal-lifecycle` (`onBackdrop` → `closeDetailModal`, misma política de borrador que Escape). Se retiran las dos implementaciones propias: la rama del `onClick` del host en `index.impl.js` y la del failsafe en captura de `index.js`, que conserva sólo la defensa del botón cerrar.
- El patcher del controlador localiza header, body y título por los marcadores del shell (`[data-modal-header]`, `[data-modal-body]`, `.ui-detail-modal-title`).
- El perfil del técnico usa `renderModalCloseButton` (desaparece su icono local) y el detalle de Clientes deja de arrastrar el alias muerto `incidencias-modal-close-btn`; ambos conservan su comportamiento (Clientes tiene sus propias reglas de movimiento reducido y colores forzados).

- El shell vive en `src/features/entity-overlay/modal-host.js` junto al host que lo monta y lo actualiza (`modal-shell.js` desaparece). Con dos consumidores más (Incidencias y el perfil del técnico) el bundler separaba el shell en un chunk compartido nuevo y sus indicios de precarga sumaban 117 bytes a los chunks públicos `app`, `routes` y `enhancements`, por encima del techo medido de 218 000 bytes del arranque público. El host ya es el módulo de renderizado DOM que se mantiene fuera del cierre público; el shell pertenece a ese mismo chunk. `renderModalContent` toma por defecto los marcadores del shell.

## Contratos

- `tools/modal-shell-contract.mjs`: `SHELL_CONSUMERS` (dispatcher e Incidencias) importan el shell y no emiten estructura propia; el inventario de overrides estructurales baja de 3 a 1 (perfil del técnico).
- `repo_integrity.py`: el detalle debe renderizarse con `renderModalShell` y no puede contener estructura duplicada; la pareja de clases se exige sólo en las primitivas de contenido compartidas (chip y meta-grid).
- `incidencias_detail_window_ui_contract.mjs` e `INCIDENCIAS_DETAIL_SHARED_VISUAL_CONTRACT`: lista exacta del contrato visual delegado (shell `ui-modal-shell.v1`, root, chip, meta-grid, modifier dinámico) y un único overlay, dialog, header, body y botón cerrar en el render real.
- Comportamiento verificado con `private-owner-modal-browser-contract` (apertura, cierre, Escape, click exterior, borrador, reintento, foco), `modal_lifecycle_contract`, `ui_loading_browser_contract` y `spa-modal-regression`.

## Siguiente

Facturas (detalle, reenvío y cobro) sobre el mismo shell, con un contrato que pruebe que Incidencias y Facturas comparten infraestructura y sólo difieren en contenido.
