# Onion Support — UI System V6 Audit

## Detail Modal transversal

Usuarios deja de cargar `src/css/views/incidencias/detail.css`. Su template conserva sus clases `usuarios-modal-*` y pasa a consumir el shell transversal `ui-detail-modal-*` desde `src/css/components/detail-modal.css`.

- Clases/contratos compartidos detectados: **29**
- `incidencias/detail.css`: **55,824 bytes**
- Nuevo `components/detail-modal.css`: **18,338 bytes**
- Payload CSS estimado anterior de la ruta Usuarios: **104,182 bytes**
- Payload CSS estimado nuevo de la ruta Usuarios: **66,696 bytes**
- Reducción estimada: **37,486 bytes (36.0%)**

## Invariantes nuevas

- `usuarios.template.modal.js` no contiene clases `incidencias-modal-*`.
- El manifest de Usuarios no carga `incidencias/detail.css`.
- El componente transversal no contiene selectores `.usuarios-*` ni `.incidencias-modal-*`.
- Repository Integrity bloquea cualquier regresión de esos contratos.
- El componente se carga por ruta; no aumenta el CSS global de la landing pública.

## Siguiente fase

Migrar el shell equivalente del detalle de Incidencias al mismo `ui-detail-modal-*` y retirar de `incidencias/detail.css` las reglas ya absorbidas por el componente, de forma que ambos dominios compartan una sola implementación real.
