# Visor de adjuntos sobre el shell canónico · 2026-09-15

## Qué cambia

- `src/features/entity-overlay/modal-host.js` y `components/detail-modal.css`: nuevo tamaño `stage` del shell para superficies que traen su propia tarjeta. El panel no pinta chrome (fondo, borde, sombra y radio nulos, anchura `fit-content`, tope de altura de la pantalla), el header vacío no ocupa sitio y el body centra el contenido sin padding ni reserva de scrollbar. Backdrop, centrado, `role="dialog"`, foco, Escape, click exterior y bloqueo de scroll siguen siendo los del shell.
- `src/features/incidencias-video-preview/core.js`: la capa del visor se renderiza con `renderModalShell` (tamaño `stage`, altura `auto`) dentro del root del detalle, con el escenario (`incidencias-media-viewer-stage`) como body y la tarjeta del adjunto adoptada dentro. Identidad conservada: clase raíz `incidencias-media-viewer`, `data-incidencias-media-viewer`, `data-viewer-state` (apertura, listo, cierre), `data-gallery-navigating`, el escenario y su marcador. `aria-labelledby` con el título del adjunto pasa al panel del shell; el lifecycle recibe el panel y el click exterior por `onBackdrop` (el click en el escenario alrededor de la tarjeta sigue cerrando desde el manejador del visor). La galería (flechas, contador, buffer visual) no cambia.
- CSS: `views/incidencias/media-preview.core.css` y `media-preview.css`: fuera la capa `position: fixed` con `z-index` 90, tamaño de viewport, centrado, backdrop y `pointer-events` propios. El backdrop del visor, más tenue que el del detalle sobre el que se abre, se declara como token `--incidencias-media-viewer-overlay-bg` en la raíz del detalle (mezcla del token del shell, sin referencia circular) y el visor lo adopta como `--ui-detail-modal-overlay-bg` junto a su desenfoque; el aire alrededor de la tarjeta y los márgenes de zona segura en móvil pasan al escenario. El fundido propio del visor (`data-viewer-state`) se mantiene.

## Contratos

- `tools/modal-shell-contract.mjs`: `MODAL_SIZES` incluye `stage`; el visor entra en `SHELL_CONSUMERS` (14) y el inventario de shells históricos queda vacío: toda regla `position: fixed` fuera de la autoridad es una capa no modal con su motivo.
- Comportamiento verificado con `tools/spa-modal-regression.mjs` (imagen a 1280 y 390 px con foco anidado, borrador y scroll exactos; galería sin segundo visor; vídeo, documento no previsualizable, error de permiso con reintento, cierre del propietario con `/view` pendiente, reinicialización del runtime, origen en lista; el escenario del PDF nativo no se puede ejercer en este entorno y falla igual antes y después), `modal_lifecycle_contract` 22, `ui_loading_browser_contract`, `incidencias_media_gallery_observer_contract`, `home-entity-identity-contract`, `modal_authority_contract`, `app_entrypoint_integrity`, `repo_integrity`, `private_css_authority_contract`. Capturas de la regresión antes y después: tarjeta del visor en la misma posición y tamaño a 1280 y 390 px (la reserva de scrollbar del body se anula en `stage` para conservar el centrado exacto).

## Siguiente

Unidad de contenido de los detalles y mapa canónico de la arquitectura.
