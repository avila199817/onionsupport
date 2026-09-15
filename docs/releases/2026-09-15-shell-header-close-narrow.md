# Shell modal: el botón cerrar permanece arriba a la derecha en pantallas estrechas · 2026-09-15

## Problema

`components/detail-modal.css` colapsaba el header de todo diálogo a una sola columna por debajo de 980 px. La regla venía del detalle de Incidencias, cuyo botón cerrar vive dentro de su fila de acciones y cuyos bloques (hero y acciones) deben apilarse en pantallas estrechas. En cualquier header con el botón cerrar como hijo directo (detalle de Facturas, estados pendientes del despachador y del detalle de Incidencias, y las altas migradas al shell) el botón caía debajo del contenido, alineado a la izquierda.

## Cambio

- `detail-modal.css`: la regla de ≤980 px se limita a `.ui-detail-modal-header:not(:has(> .ui-detail-modal-close-btn))`. Un header que compone su propia fila de acciones sigue apilando; un header cuyo cierre es hijo directo lo conserva en dos columnas en todas las anchuras y lo alinea al inicio del header (`align-self: start`): en un header alto, como el del detalle de Facturas en móvil, el cierre vuelve a la esquina superior derecha donde lo situaba su hoja retirada; en un header de título y subtítulo el desplazamiento respecto al centrado anterior es de pocos píxeles.
- `tools/modal-shell-contract.mjs` fija ambas reglas y rechaza un header de una sola columna incondicional; `tools/private-owner-modal-fixture-suite.js` comprueba a 390 px, sobre los controladores reales, que un cierre del shell hijo directo del header queda en su esquina superior derecha (falla en el detalle de Facturas sin la corrección).

## Verificación

Contratos: `modal-shell-contract` (con el pin nuevo; falla sin la corrección), `repo_integrity`, `private_css_authority_contract`, `ui_loading_system_contract`, `incidencias_detail_window_ui_contract`. Browser: `private-owner-modal-browser-contract` 51/51, `modal_lifecycle_contract` 22, `facturas-confirmation-browser-contract` 11, `facturas-paid-browser-contract` 12, `ui_loading_browser_contract`. Medición directa con el alta de Clientes sobre el shell a 390 px: el cierre vuelve a la esquina superior derecha (antes de la corrección quedaba bajo el título) y el header recupera su altura.
