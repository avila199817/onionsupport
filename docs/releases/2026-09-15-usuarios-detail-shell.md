# Detalle de Usuarios sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/views/usuarios/usuarios.template.modal.js`: el detalle se renderiza con `renderModalShell` en lugar de emitir a mano root, overlay, panel, header, botón cerrar y body con las clases `ui-detail-modal-*` emparejadas con `usuarios-modal-*` y los marcadores `data-ui-detail-modal-*` (sin ningún consumidor). Identidad conservada: ids de root y panel, `data-usuarios-modal-root/-overlay/-panel`, `data-template-version`, `data-user-id`, `data-status`, `data-refreshing`, `data-canonical-model`, `aria-busy` y `is-submitting` durante el refresco, `aria-labelledby` / `aria-describedby`, hero (avatar, chips, título, resumen), acción `close` en el botón cerrar del shell, rejilla de metadatos, secciones y pie como contenido del body. `usuarios-modal-root` y `usuarios-modal-body` siguen como ámbito del dominio.
- El click exterior llega por `onBackdrop` del lifecycle con la misma política que Escape; la rama de overlay del manejador de click delegado, los selectores propios de `renderModalContent` (root, overlay, panel, scroll) y el glifo `close` del mapa de iconos desaparecen. El manejador delegado del host conserva copiar ID, refrescar y cerrar.
- Sin cambios de CSS: `views/usuarios/index.css` no estiliza el diálogo; la autoridad `components/detail-modal.css` ya lo dimensionaba.

## Contratos

- `tools/modal-shell-contract.mjs`: el detalle entra en `SHELL_CONSUMERS` (13); con el perfil del técnico ya no queda ningún diálogo privado que emita el shell a mano.
- Comportamiento verificado con `modal_lifecycle_contract` 22 (apertura repetida y cierre real del detalle), `private-owner-modal-browser-contract` 51/51 (usuario: apertura, cierre, click exterior, reintento, refresco sin sustituir el panel, móvil, cierre arriba a la derecha, matriz de apertura cruzada entre dominios), `avatar_runtime_dom_contract`, `modal_authority_contract` 13, `presentation-text-contract`, `private-user-identity-contract`, `confirmed-user-write-contract`, `avatar_system_contract`, `repo_integrity`. Geometría medida con el módulo real y el CSS del shell antes y después, a 1366 y 390 px: idéntica (panel de 1160 × 707 px, header 113 px, body 591 px con scroll interno en escritorio; pantalla completa con body desplazable en móvil; cierre en (1202, 50) de 42 px). Escape, click exterior y el botón cerrar devuelven el foco al disparador; sin hosts ni raíces huérfanos y clases del `body` restauradas.

## Siguiente

Capas legacy de `ui.css` (`.ui-overlay`, `.ui-modal`, `.ui-drawer`) y revisión del visor de adjuntos.
