# Contenido del detalle de Clientes sin alias de Incidencias · 2026-09-15

## Qué cambia

- `src/views/clientes/clientes.template.modal.js`: el contenido del detalle deja de emparejar cada clase `clientes-modal-*` / `clientes-timeline-*` con su alias `incidencias-modal-*` / `incidencias-timeline-*` (37 apariciones: hero, título, chips, rejilla y tarjetas de metadatos, secciones, cabeceras de sección, avatar, feedback, botones, pie y línea temporal). Ningún alias tenía efecto: `views/clientes/detail.css` no los estiliza y las reglas de `views/incidencias/detail.css` están acotadas a `.incidencias-modal-root`, así que ni con la hoja de Incidencias cargada llegaban al detalle de Clientes. El icono del botón de copiar usa la clase de contenido del shell (`ui-detail-modal-action-icon`), la única que tenía dueño real (antes quedaba sin estilo: queda centrado en su botón). Salen del snapshot las banderas `incidenciasAliases` e `incidenciasCssCompatibility` y del encabezado la responsabilidad de mantener esa compatibilidad.
- Sin cambios de CSS: `detail.css` ya era la única autoridad del contenido de Clientes.

## Contratos

- `repo_integrity.py`: como Usuarios, el template de Clientes no puede depender de clases de Incidencias (`incidencias-modal-`, `incidencias-timeline-`).
- Comportamiento verificado con `private-owner-modal-browser-contract` 51/51, `clientes_scale_contract`, `presentation-text-contract`, `avatar_system_contract`, `modal-shell-contract`, `repo_integrity`. Geometría medida con el módulo real (`openClientesDetailModal`) y el CSS de Clientes, con y sin la hoja de Incidencias, antes y después, a 1366 y 390 px: idéntica en panel, hero, título, chips, rejilla, tarjetas, secciones, pie y scroll; la única diferencia es el icono de copiar, ahora centrado verticalmente (2 px) por la clase del shell. Después del cambio las cuatro variantes coinciden entre sí.

## Siguiente

Mapa canónico de la arquitectura de diálogos y cierre de la fase.
