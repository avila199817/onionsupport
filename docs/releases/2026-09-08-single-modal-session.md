# Una apertura de detalle para toda la SPA

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
