# Consolidación de la aplicación privada — 2026-09-12

Esta entrega corrige duplicaciones y carreras reproducidas en modales, perfiles y estadísticas. Parte del frontend público verificado en `ec194ff6` e integra la actualización posterior de Home en `6ef6e58d`. La publicación y el SHA desplegado se acreditan en la PR y sus runs; este documento describe los contratos del código.

## Autoridades y consumidores

| Responsabilidad | Autoridad | Resultado |
| --- | --- | --- |
| Sesión de detalle transversal | `features/entity-overlay/index.js` | Home, listas y relaciones siguen usando los cuatro controladores reales. Cambiar de sesión cancela y destruye el detalle pendiente o visible. |
| Interacción modal | `features/entity-overlay/modal-lifecycle.js` | Un registro controla Escape, Tab, foco, pila y bloqueo de scroll. |
| Montaje y actualización del panel privado | `features/entity-overlay/modal-host.js` | Propiedad del nodo, retirada y actualización estable compartidas; cada dominio conserva formularios, slots y reglas de cierre. |
| Confirmaciones asíncronas | `features/entity-overlay/modal-confirmation.js` | Montaje y resolución común sobre el lifecycle existente, con cancelación al desaparecer el propietario. |
| Perfil confirmado de la sesión actual | `features/user-profile/index.js` y Core | Cuenta y Usuarios reconcilian sobre el usuario de Core; revisión y cola de escrituras compartidas, sin otra caché de perfiles. |
| Representación del avatar | `features/avatar-system/identity.js` y `AvatarSystem` | Cuenta adopta la misma identidad explícita, iniciales, tono y estado de imagen que los demás consumidores. |
| Lectura de métricas | `core/statistics.js` | Cero es un dato; ausencias, valores inválidos y mínimos explícitos conservan su estado desconocido. |
| Estadísticas de facturas | `views/facturas/facturas.stats.js` | Home y Facturas interpretan los mismos campos del servidor, sin rellenar totales globales con una página de filas. |
| Texto de presentación y HTML | `core/presentation-text.js` | Se retiran 30 funciones equivalentes en 20 archivos. Se conservan las variantes con límites o saneamiento de transporte diferentes. |

## Fallos corregidos

- Una respuesta de Cuenta iniciada en otra sesión podía reemplazar el perfil actual o borrar su foto. Un GET anterior al borrado podía resucitar el avatar. La confirmación sólo se aplica al ID y época de sesión que iniciaron la operación y no redefine ACL, tokens ni identidad de navegación.
- Las cachés de detalle de Clientes y Facturas podían sobrevivir al cambio de cuenta o aceptar una respuesta invalidada. Sus propietarios invalidan memoria y peticiones según sesión y cambios de identidad.
- Las vistas de gestión no reaccionaban de manera uniforme a cambios confirmados de usuarios. Reutilizan las señales y los mecanismos de refresco existentes; no hay otro bus ni búsqueda de identidad por nombre.
- Facturas podía completar estadísticas globales incompletas con sumas de filas cargadas. Las cantidades desconocidas permanecen desconocidas. Clientes y Usuarios conservan el alcance explícito de sus indicadores de filas cargadas.
- La deduplicación de estadísticas de Facturas no distinguía la sesión ni las escrituras posteriores. Home podía reutilizar su snapshot para consultas con filtros diferentes. Las lecturas se aíslan por contexto y las consultas especiales no sustituyen el dashboard estándar.
- Las facetas de Incidencias podían presentar mínimos como conteos exactos. Una respuesta remota antigua podía sobrescribir un resultado local completo; la invalidación precede también a las salidas por caché o primera página completa.
- Las señales recibidas durante el alta de una entidad se conservan hasta que el formulario permite reconciliar. Guardar o cancelar consume los cambios pendientes mediante el refresco existente; no exige una actualización manual ni añade una segunda recarga.

## Alcance y verificación

Las pruebas usan módulos, templates y controladores reales con respuestas y cuentas sintéticas. Comprueban aislamiento de sesión, confirmaciones de identidad, eliminación de fotos, cachés, estadísticas parciales, interacción de diálogos y conservación de borradores. Se mantienen los contratos de público, compilación reproducible, artefactos y presupuestos existentes.

La reducción de código no acredita por sí sola una mejora de latencia. La PR registra el balance de fuente y el grafo compilado de esta revisión, separando runtime de pruebas y documentación.

Cuenta y Servidor conservan formularios inline. La bienvenida de Home sigue siendo una ayuda no bloqueante. Menús, comboboxes y medios mantienen su semántica; las acciones de negocio y la propiedad de sus recursos permanecen en el dominio.

No se ejecutan correos, cobros ni mutaciones contra cuentas reales para verificar esta entrega. El recorrido autenticado frontend/backend F1, la revisión completa de persistencia F2 y los pendientes financieros R04/R05 conservan su alcance propio; esta refactorización no los declara cerrados.
