# Una apertura de detalle para toda la SPA

## Estado y trazabilidad

| Referencia | Evidencia |
| --- | --- |
| Implementación | Commit local `3d513970`, rama `codex/spa-modal-single-lifecycle`. |
| Base de revisión | `5358d6c493c43c7f97618c5cc6cc52cd8a41cf2d`. |
| Publicación autorizada | El titular autorizó el 2026-09-08 la integración y publicación en producción, con documentación actualizada. |
| PR y SHA integrado | Pendientes de integración. |
| CI y preview | Pendientes de los runs de esta publicación. |
| Despliegue y verificación de producción | Pendientes de los runs y comprobaciones del SHA integrado. |

Este registro debe enlazar el SHA de runtime y sus runs una vez finalizados. Una actualización documental posterior no cambia por sí misma la revisión funcional verificada.

La revisión parte del árbol publicado en `5358d6c493c43c7f97618c5cc6cc52cd8a41cf2d`.

## Problemas corregidos

- Home y las listas elegían distintos caminos de apertura. Clientes y Usuarios usaban adaptadores de lectura separados de sus modales reales.
- Incidencias sustituía el panel al terminar una carga sin datos locales. Los módulos de estado, sincronización y avatares también solicitaban y proyectaban el detalle por su cuenta.
- La pila de adaptadores mantenía su propio historial y podía sobrevivir a cambios de vista o coexistir con otro detalle.
- La captura de clics confundía identificadores de comandos con aperturas: descargar, enviar o abrir una incidencia relacionada no deben abrir la factura contenedora.

## Comportamiento resultante

`EntityOverlay.open` es el punto de entrada para Home, filas, teclado, enlaces y APIs públicas de Facturas, Incidencias, Clientes y Usuarios. Una sesión posee el origen, la cancelación y exactamente un controller de detalle. Cada dominio conserva sus plantillas y acciones reales, sin montar un listado oculto.

El origen se comprueba contra la vista comprometida. Los modales no escriben historial ni navegan. El Router libera el detalle cuando confirma la sustitución de su vista; un montaje fallido no destruye el modal vigente. Los cierres respetan operaciones en curso y confirmaciones de borrador.

La carga, el error, el reintento y la actualización de Incidencias y Facturas conservan su panel. Las mejoras de Incidencias reciben el resultado del controller; el refresco por señales vuelve a ese mismo controller y comparte la petición en curso. Una respuesta posterior al cierre o a la sustitución no puede recuperar la sesión anterior.

Los listados aplazan sus renders mientras hay un detalle sobre su origen y aplican los cambios confirmados al cerrar. Se recupera el foco por identificador de fila si el nodo original se ha renovado. La captura global deja los eventos del panel a su controller y distingue abrir de ejecutar otro comando.

## Verificación

- Node `22.23.2`, npm `10.9.8`, dependencias del lockfile.
- Validación de fuentes, compilación y comprobación de distribución correctas.
- Contrato de navegador: 21 escenarios, incluida una matriz ampliada de 43 comprobaciones correctas y cero fallos.
- Cuatro dominios desde Home y listados reales; doble clic; una petición inicial; identidad física del panel; cierre por botón, Escape y fondo; cancelación; respuesta tardía; error y reintento; relaciones; borradores; refresco concurrente; fallo de montaje de otra ruta y tamaño móvil.
- Contrato de avatares ejecutado en Chromium: identidad estable y cero lecturas de detalle adicionales.

Los contratos cargan controllers, templates y ciclo de vida reales. Sustituyen sesión y fronteras de API con datos sintéticos; no realizan operaciones contra producción. Los tests estáticos se han ajustado para exigir la única autoridad y rechazar el retorno de adaptadores, historial de modal o aperturas dependientes de la ruta.

Comandos de la entrega:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run validate:ci
```

Para repetir sólo la comprobación funcional de apertura durante una intervención:

```bash
node tools/private-domain-contracts.mjs --browser
node .github/scripts/modal_lifecycle_contract.mjs
node .github/scripts/incidencias_comment_avatar_runtime_contract.mjs
```

Los contratos de navegador requieren Chrome/Chromium, configurable mediante `CHROME_BIN`. La versión del lockfile y los umbrales de validación se mantienen como referencia. Los resultados locales de esta sección no sustituyen las evidencias de CI y publicación de la tabla superior.

## Continuidad de mantenimiento

[UI_MODAL_SYSTEM.md](../UI_MODAL_SYSTEM.md) define las entradas públicas, factories, callbacks, origen, cierre, foco, peticiones y estabilidad del panel. [FRONTEND_SHARED_SYSTEMS.md](../FRONTEND_SHARED_SYSTEMS.md) sitúa esta autoridad junto al Router, AvatarSystem y AsyncScope. [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md), [ROADMAP.md](../ROADMAP.md) y el README apuntan a esta entrega para evitar varias afirmaciones incompatibles de versión vigente.

El recorrido autenticado completo frontend/backend sigue pendiente y conserva su alcance en F1 del roadmap. Esta refactorización no acredita escrituras reales, correo, pagos ni el modelo de permisos del backend.

## Publicación y reversión

La rama pasa por PR, integridad del repositorio y preview confiable antes de fusionarse a `main`. El workflow de Azure Static Web Apps compila y publica el SHA integrado; Production Verification Gate acredita por separado el artefacto publicado. Los cambios limitados a `docs/**` y `.github/**` están excluidos del disparador de SWA; un cambio en `README.md` sí puede iniciarlo. El cierre de evidencias se limita a `docs/**` y su SHA debe distinguirse del SHA funcional de esta tabla.

Si esta entrega necesita revertirse, revertir su PR mediante el mismo pipeline y verificar el nuevo SHA publicado. El modo de emergencia `legacy-root` de [BUILD_FOUNDATION.md](../BUILD_FOUNDATION.md) está fijado a una revisión mucho más antigua y no constituye una reversión específica de esta refactorización.
