# Facturas · revisión integral 2026-08-19

Esta revisión consolida la vista privada de Facturas sobre el design system global de Onion Support.

- Listado, creación y detalle usan tokens globales en lugar de paletas locales.
- Dark/light quedan gobernados por el core del tema.
- Se elimina CSS acumulativo y overrides de cierre.
- El template principal se reduce y mantiene acciones declarativas, búsqueda, filtros, orden, infinite scroll, PDF, envío e incidencia vinculada.
- La identidad de avatar del listado usa email o nombre, siguiendo el mismo criterio estable que Incidencias.
- Se preservan los contratos de API, PDF/SAS, creación y detalle existentes.
