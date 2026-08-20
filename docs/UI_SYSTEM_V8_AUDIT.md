# Onion Support — UI System V8 Audit

## Tokens canónicos del Detail Modal

V8 elimina el último acoplamiento semántico del componente transversal con Incidencias. Los tokens que ya gobiernan el shell compartido pasan de `--incidencias-modal-*` a `--ui-detail-modal-*` en toda la fuente productiva.

- Tokens compartidos canonicalizados: **28**
- Referencias/declaraciones sustituidas: **56**
- Archivos productivos modificados por la migración: **4**
- `detail-modal.css`: **18,411 → 16,403 bytes**
- Aliases locales eliminados del componente: **28**

## Archivos afectados

- `src/css/components/detail-modal.css`
- `src/css/tokens/light.css`
- `src/css/tokens/variables.css`
- `src/css/views/incidencias/detail.css`

## Mapa de tokens

- `--incidencias-modal-avatar-radius` → `--ui-detail-modal-avatar-radius`
- `--incidencias-modal-avatar-size` → `--ui-detail-modal-avatar-size`
- `--incidencias-modal-bg` → `--ui-detail-modal-bg`
- `--incidencias-modal-body-gap` → `--ui-detail-modal-body-gap`
- `--incidencias-modal-border` → `--ui-detail-modal-border`
- `--incidencias-modal-card-bg` → `--ui-detail-modal-card-bg`
- `--incidencias-modal-card-border` → `--ui-detail-modal-card-border`
- `--incidencias-modal-card-radius` → `--ui-detail-modal-card-radius`
- `--incidencias-modal-chip-font-size` → `--ui-detail-modal-chip-font-size`
- `--incidencias-modal-chip-height` → `--ui-detail-modal-chip-height`
- `--incidencias-modal-chip-padding-x` → `--ui-detail-modal-chip-padding-x`
- `--incidencias-modal-footer-button-height` → `--ui-detail-modal-footer-button-height`
- `--incidencias-modal-footer-button-radius` → `--ui-detail-modal-footer-button-radius`
- `--incidencias-modal-header-border` → `--ui-detail-modal-header-border`
- `--incidencias-modal-header-gap` → `--ui-detail-modal-header-gap`
- `--incidencias-modal-header-padding` → `--ui-detail-modal-header-padding`
- `--incidencias-modal-meta-card-padding` → `--ui-detail-modal-meta-card-padding`
- `--incidencias-modal-meta-grid-gap` → `--ui-detail-modal-meta-grid-gap`
- `--incidencias-modal-overlay-bg` → `--ui-detail-modal-overlay-bg`
- `--incidencias-modal-overlay-blur` → `--ui-detail-modal-overlay-blur`
- `--incidencias-modal-padding` → `--ui-detail-modal-padding`
- `--incidencias-modal-radius` → `--ui-detail-modal-radius`
- `--incidencias-modal-shadow` → `--ui-detail-modal-shadow`
- `--incidencias-modal-title-clamp` → `--ui-detail-modal-title-clamp`
- `--incidencias-modal-title-letter` → `--ui-detail-modal-title-letter`
- `--incidencias-modal-title-line` → `--ui-detail-modal-title-line`
- `--incidencias-modal-title-size` → `--ui-detail-modal-title-size`
- `--incidencias-modal-width` → `--ui-detail-modal-width`

## Contrato

- `components/detail-modal.css` consume directamente tokens `--ui-detail-modal-*`.
- `variables.css` y `light.css` son la autoridad de esos tokens.
- Los tokens `--incidencias-modal-*` supervivientes sólo pueden representar necesidades específicas del ticket.
- Repository Integrity bloquea la reaparición de cualquiera de los 28 nombres legacy compartidos en `src/`.
