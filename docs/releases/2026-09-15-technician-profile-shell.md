# Perfil del técnico sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/features/incidencias-technician-profile/index.js`: el perfil se renderiza con `renderModalShell` (altura `auto`) en lugar de emitir a mano root, overlay, panel, header y body con las clases `ui-detail-modal-*`. Identidad conservada: ids de root y panel, `data-technician-profile-root`, `data-technician-profile-version`, `data-technician-profile-overlay`, `data-technician-profile-panel`, `aria-labelledby` / `aria-describedby`, hero (avatar, chips, título, resumen) y botón cerrar del shell con la acción `close`. El click exterior llega por `onBackdrop` del lifecycle con la misma política que Escape; la rama de overlay del manejador de click y los selectores propios de `renderModalContent` desaparecen.
- `style.css` 263 → 244 líneas: las reglas sobre `.ui-detail-modal-panel` y `.ui-detail-modal-body` (altura, tope y sus variantes a 720 y 540 px) se sustituyen por el token `--ui-detail-modal-panel-height` en la raíz del perfil (`min(92dvh, 720px)`, `calc(100dvh - 20px)` hasta 720 px); en teléfonos la autoridad ya impone pantalla completa a los paneles `auto`. La hoja estiliza sólo el contenido del perfil.

## Contratos

- `tools/modal-shell-contract.mjs`: el perfil entra en `SHELL_CONSUMERS` (12) y desaparece el inventario de overrides estructurales: ninguna hoja fuera de `components/detail-modal.css` puede reestilizar root, overlay, panel, header, body, footer o botón cerrar del shell; una diferencia de tamaño se declara con una variante o un token.
- `incidencias_technician_profile_extreme_contract.mjs` fija `renderModalShell`, la altura `auto`, `onBackdrop` por el lifecycle, el token de altura en la hoja y la ausencia de clases estructurales y del selector de overlay.
- Comportamiento verificado con `modal_lifecycle_contract` 22 (escenario real del perfil como hijo del detalle), `modal_authority_contract` 13, `avatar_consumer_identity_contract`, `incidencias_detail_window_ui_contract`, `repo_integrity`, `private_css_authority_contract`. Geometría medida con el módulo real y el CSS del shell antes y después, a 1366 y 390 px: idéntica (panel de 1160 × 695 px, header 113 px, body 580 px sin scroll en escritorio; pantalla completa con body desplazable en móvil; cierre en (1202, 55) de 42 px). Escape y click exterior devuelven el foco al disparador; sin hosts ni raíces huérfanos.

## Siguiente

Detalle de Usuarios sobre `renderModalShell`, capas legacy de `ui.css` y visor de adjuntos.
