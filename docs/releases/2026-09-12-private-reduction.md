# Simplificación incremental de PRIVATE — 2026-09-12

## Auditoría de recuperación

La ejecución se reanuda desde `7adf50359f123f6d2125b553d1e877233b92bbc4`, presente en `main` local y remoto. La PR #588 está fusionada; su árbol coincide con el último commit de integración local `55fd004b`. No hay cambios de código preparados ni pendientes en los checkouts de la ejecución anterior. Los archivos sin seguimiento de los auxiliares son dependencias y cachés generadas; no se descarta ni se reescribe trabajo previo.

La entrega anterior completó la sesión de detalle transversal, el host/lifecycle modal, la reconciliación de perfil sobre Core, AvatarSystem en Cuenta, los selectores de estadísticas y la invalidación del buscador. No se vuelve a implementar esas autoridades. El recorrido autenticado F1 con cuentas reales y los demás pendientes expresos del roadmap conservan su alcance; no son cambios perdidos por la interrupción.

## Bloques de esta continuación

El objetivo es que cada template produzca su representación correcta desde el modelo y que los consumidores deleguen los comportamientos comunes en las autoridades existentes. Se retiran reparadores del DOM y copias de funciones; no se introduce otro store, bus, renderer ni registro de identidad.

| Bloque | Sustitución | Estado |
| --- | --- | --- |
| Texto de presentación privado | 22 copias equivalentes en 16 consumidores → `core/presentation-text.js` | Validado: 3.234 comparaciones, templates reales y `npm run validate` |
| Alta de Incidencias | Reparador de HTML de avatares → atributos explícitos en el render original | Pendiente |
| Filtros de Facturas | Conteos leídos del DOM y observer → selector de la cabecera en el template | Pendiente |
| Alcance de KPI de Incidencias | Postprocesador/observer → copy generado desde el alcance del modelo | Pendiente |
| Detalle de Facturas | Montaje/parche modal local → `renderModalContent` | Pendiente |

Cada bloque se valida y se confirma por separado. La integración final conserva los contratos de fuente, navegador, compilación reproducible y presupuestos del repositorio. Las métricas finales y la publicación del SHA exacto se registran en la PR de esta continuación.
