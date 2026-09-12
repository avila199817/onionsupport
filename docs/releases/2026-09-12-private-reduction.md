# Simplificación incremental de PRIVATE — 2026-09-12

## Auditoría de recuperación

La ejecución se reanuda desde `7adf50359f123f6d2125b553d1e877233b92bbc4`, presente en `main` local y remoto. La PR #588 está fusionada; su árbol coincide con el último commit de integración local `55fd004b`. No hay cambios de código preparados ni pendientes en los checkouts de la ejecución anterior. Los archivos sin seguimiento de los auxiliares son dependencias y cachés generadas; no se descarta ni se reescribe trabajo previo.

La entrega anterior completó la sesión de detalle transversal, el host/lifecycle modal, la reconciliación de perfil sobre Core, AvatarSystem en Cuenta, los selectores de estadísticas y la invalidación del buscador. No se vuelve a implementar esas autoridades. El recorrido autenticado F1 con cuentas reales y los demás pendientes expresos del roadmap conservan su alcance; no son cambios perdidos por la interrupción.

## Bloques de esta continuación

El objetivo es que cada template produzca su representación correcta desde el modelo y que los consumidores deleguen los comportamientos comunes en las autoridades existentes. Se retiran reparadores del DOM y copias de funciones; no se introduce otro store, bus, renderer ni registro de identidad.

| Bloque | Sustitución | Estado |
| --- | --- | --- |
| Texto de presentación privado | 22 copias equivalentes en 16 consumidores → `core/presentation-text.js` | Validado: 3.234 comparaciones, templates reales y `npm run validate` |
| Alta de Incidencias | Reparador de HTML de avatares → atributos explícitos en el render original | Validado: identidad, selección, validación, combobox y AvatarSystem en navegador |
| Filtros de Facturas | Conteos leídos del DOM y observer → selector de la cabecera en el template | Validado: global, cero, desconocido, mínimo y filtros; transiciones síncronas en navegador |
| Alcance de KPI de Incidencias | Postprocesador/observer → copy generado desde el alcance del modelo | Validado: scopes, facetas, fechas y patch real conservando foco |
| Detalle de Facturas | Montaje/parche modal local → `renderModalContent` | Validado: propietarios, lifecycle, confirmaciones y continuidad física del panel |

Cada bloque se valida y se confirma por separado. La validación conjunta `npm run validate`, la compilación reproducible (196 archivos idénticos) y los contratos dirigidos de navegador pasan. La integración final conserva los contratos de fuente, navegador, compilación reproducible y presupuestos del repositorio. Las métricas finales y la publicación del SHA exacto se registran en la PR de esta continuación.

## Reducción y comportamiento

Respecto a `7adf5035`, los cinco bloques eliminan **1.026 líneas netas de runtime** y **25.516 bytes de código fuente**. Se retiran por completo `incidencias.create-avatar-identity.js`, `facturas-filter-counts/index.js` e `incidencias.stats-scope.js`, incluidos los dos observers que reparaban estadísticas después del render. El artefacto compilado pasa de 1.852.963 a 1.842.572 bytes JS (−10.391); la suma gzip nivel 6 por archivo pasa de 573.251 a 569.866 bytes (−3.385). Los bytes CSS no cambian. Una reducción de código no acredita por sí sola menor latencia.

- El alta de Incidencias produce la identidad completa del avatar desde su renderer, incluidos aliases vacíos. AvatarSystem conserva la autoridad visual y de actualización. Se conservan validaciones y límites de archivos.
- Cabecera y filtros de Facturas reciben la misma proyección de estadísticas. Desconocido no equivale a cero; las filas cargadas no inventan totales globales. Incidencias expresa por separado el alcance de facetas y del importe cuando sólo uno es exacto.
- El detalle de Facturas delega el montaje y el refresco en el renderer compartido. Conserva root, overlay, panel, foco y scroll. El alta conserva reconciliación por claves para no sustituir controles ni perder sus valores.
- Las 22 funciones equivalentes pasan a la autoridad existente de texto. Las políticas de transporte, truncado y texto multilínea con distinta semántica mantienen su responsabilidad.

Los contratos permanentes usan templates y controladores reales con datos sintéticos; comprueban transiciones dentro de la misma tarea de render y no esperan un reparador posterior. La revisión independiente de la integración no detectó regresiones accionables. El contrato estático de scroll de Facturas deja de prohibir cualquier acceso a conteos y exige una proyección compartida; rechaza reintroducir un cálculo sobre filas filtradas. Los contratos de comportamiento mantienen la comprobación de global/desconocido/cero/mínimo y alcance cargado. No se han relajado presupuestos, procedencia de artefactos ni requisitos de validación.

## Límites de validación

Los bloques pasan sus contratos dirigidos y compilación. La validación conjunta y la publicación se acreditan con los runs de la PR y el SHA fusionado, sin reutilizar los resultados de #588. El Chromium 149 local tiene un timeout preexistente en la navegación del visor PDF del contrato SPA, reproducido también en la base; el contrato íntegro se exige en el Chrome de CI. No se altera la prueba para ocultarlo.

No se han realizado escrituras de negocio, cobros, correos ni cambios en cuentas reales para probar el refactor. F1 autenticado, el inventario completo F2 y R04/R05 financieros siguen pendientes según el roadmap.
