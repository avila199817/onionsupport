# Onion Support — UI System V7 Audit

## Incidencias adopta Detail Modal transversal

El componente `ui-detail-modal-*` creado en V6 deja de ser una abstracción usada por un solo dominio. Incidencias pasa a consumir la misma autoridad y su `detail.css` conserva únicamente las reglas realmente específicas del ticket.

- Selectores/arms compartidos retirados de `incidencias/detail.css`: **121**
- Clases `ui-detail-modal-*` añadidas al template de Incidencias: **32**
- `incidencias/detail.css` antes: **55,824 bytes**
- `incidencias/detail.css` después: **37,863 bytes**
- CSS duplicado retirado del repositorio: **17,961 bytes**
- Payload estimado de `/incidencias` antes: **118,607 bytes**
- Payload estimado de `/incidencias` después: **119,057 bytes**
- Variación de payload de `/incidencias`: **+450 bytes (+0,4%)**; a cambio el repositorio elimina 17.961 bytes duplicados y Usuarios/Incidencias comparten una única autoridad de shell.

## Arquitectura resultante

- `components/detail-modal.css`: shell, panel, header, avatar, chips, body, meta cards, footer y responsive compartidos.
- `views/incidencias/detail.css`: historial, comentarios, adjuntos, cierre, preview y estados específicos del ticket.
- `views/usuarios/*`: detalle administrativo sobre el mismo shell sin importar CSS de Incidencias.
- Repository Integrity impide que las reglas base de overlay/panel/body/meta vuelvan a duplicarse en Incidencias.

## Verificación de alias

- Alias de clase reparados tras auditoría del template: **1**.
- El validador permanente exige pairing explícito para root, overlay, panel, chip, body y meta-grid.
- Los modificadores dinámicos de chip deben emitir simultáneamente la clase de dominio y la clase transversal.
