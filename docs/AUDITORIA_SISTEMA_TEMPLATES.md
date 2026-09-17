# Auditoría del sistema de templates — hallazgos verificados y pendientes

Fecha: 2026-09-17

Este documento recoge lo que una auditoría del sistema de templates dejó
**medido y sin resolver**. Lo que sí se resolvió está en los commits, con su
medida en el mensaje. Aquí sólo queda lo que no se tocó, y por qué.

No es una lista de mejoras hipotéticas: cada punto trae la evidencia con la que
se comprobó y el criterio con el que se decidió no ejecutarlo todavía.

---

## 1 · `components/ui.css`: 93 de 151 clases no las emite nadie

**Medido.** `src/css/components/ui.css` (3.033 líneas) da estilo a 151 tokens de
clase. Buscando cada nombre completo en `src/**/*.js`, los cuatro HTML de
entrada, el resto de las hojas y los contratos:

| | clases |
|---|---|
| referenciadas en JS/HTML | 42 |
| sólo en otra hoja de estilos (nadie las pinta en el DOM) | 6 |
| sólo en una fixture de contrato | 5 |
| **sin ninguna referencia** | **93** |

Comprobado además que **ninguna** clase `ui-*` se construye por concatenación
(no hay `"ui-btn-" +`, ni `` `ui-${...}` ``): todas se escriben literales, así
que la búsqueda por nombre completo es concluyente.

Lo que está muerto son familias enteras que la aplicación nunca monta, porque
cada vista se hizo la suya:

- **alertas**: `ui-alert`, `ui-alert-content`, `ui-alert-icon`, `ui-alert-text`, `ui-alert-title`
- **desplegables**: `ui-dropdown`, `ui-dropdown-divider`, `ui-dropdown-item`, `ui-dropdown-label`, `dropdown-item`, `dropdown-divider`
- **pestañas**: `ui-tabs`, `ui-tab`
- **paginación**: `ui-pagination`, `ui-page-btn`
- **estado vacío**: `ui-empty`, `ui-empty-content`, `ui-empty-icon`, `ui-empty-text`, `ui-empty-title`
- **página de error completa**: `error-saas`, `error-saas-content`, `error-saas-icon`, `error-card`, `error-icon`, `error-actions`, `ui-error`
- **sistema de formulario**: `ui-field`, `ui-field-row`, `ui-field-stack`, `ui-label`, `ui-label-muted`, `ui-help`, `ui-required`, `ui-check`, `ui-checkbox`, `ui-radio`, `ui-radio-wrap`, `ui-select`, `ui-switch`, `ui-input-wrap`, `ui-input-icon`, `ui-input-action`
- **variantes de botón**: `ui-btn-block`, `ui-btn-danger`, `ui-btn-full`, `ui-btn-group`, `ui-btn-icon`, `ui-btn-info`, `ui-btn-lg`, `ui-btn-sm`, `ui-btn-spinner`, `ui-btn-success`, `ui-btn-warning`
- **barra de herramientas**: `ui-toolbar`, `ui-toolbar-actions`, `ui-toolbar-main`, `ui-toolbar-subtitle`, `ui-toolbar-title`
- **tarjeta**: `ui-card-body`, `ui-card-footer`, `ui-card-header`, `ui-card-subtitle`, `ui-card-title`
- **utilidades**: `ui-stack`, `ui-cluster`, `ui-split`, `ui-center`, `ui-full`, `ui-break`, `ui-nowrap`, `ui-dim`, `ui-muted`, `ui-strong`, `ui-hidden`, `ui-visually-hidden`, `ui-scroll-x`, `ui-scroll-y`, `ui-separator`, `ui-kbd`, `ui-truncate`, `ui-avatar-group`, `ui-chip-close`, `ui-table-action`, `ui-table-scroll`, `cell-actions`, `cell-muted`, `panel-block`, `table-loader`, `has-end`, `is-flat`, `is-static`, `no-hover`, `xs`

Lo que sí se usa de esta hoja es un puñado: `ui-btn`, `ui-btn-secondary`,
`ui-input`, `ui-textarea`, `ui-chip`, `ui-avatar`, `ui-spinner`, la familia
`ui-detail-modal-*` y el bloque `toast`.

**Por qué no se ha borrado aquí.** No por duda sobre el dato, sino por el modo
de fallo. Una clase muerta puede compartir lista de selectores con una viva, y
retirar el selector equivocado deja una regla que el navegador descarta entera.
Eso ya pasó en este repositorio: es literalmente el motivo por el que existe
`tools/css-block-integrity-contract.mjs`, cuyo comentario describe cómo
`.facturas-detail-btn,` seguido de `}` hizo que ocho superficies perdieran
`forced-color-adjust` en alto contraste sin que el build, `check:dist` ni los
contratos de navegador lo rechazaran.

**Cómo hacerlo con red.** Es una unidad de trabajo propia:

1. Transformar con un parser de CSS real, no con expresiones regulares: retirar
   de cada lista sólo los selectores muertos, y la regla completa sólo cuando
   TODOS sus selectores lo estén.
2. Dejar las 5 clases que sólo viven en una fixture (`clickable`, `lg`, `sm`,
   `ui-card`, `ui-loading-overlay`): las pinta
   `.github/scripts/ui_loading_browser_contract.mjs`.
3. Las 6 que sólo aparecen en otra hoja (`padded-lg`, `padded-xl`,
   `table-container`, `ui-table`, `ui-table-wrap`, `ui-truncate`) se retiran a
   la vez que su referencia, no antes.
4. Verificar con una huella de estilo calculado de las vistas **antes y
   después**, no sólo con los contratos: el arnés de
   `tools/detail-styles-ownership-contract.mjs` sirve de modelo, pero sólo cubre
   los paneles de detalle.

`tools/css-block-integrity-contract.mjs:49` exige al menos 60 hojas bajo
`src/css` + `src/features`; hoy hay 81, así que hay margen si además se
consolidan ficheros.

---

## 2 · El mismo estado de dominio se pinta de tres colores según la vista

**Medido.** «Cancelada» no significa lo mismo en tres sitios:

| vista | clase emitida | color resultante |
|---|---|---|
| Incidencias | `incidencias-status-chip--closed` | **verde** (éxito) |
| Agenda | `agenda-status-chip--cancelada` | **rojo** (peligro) |
| Facturas | `facturas-chip--cancelled` | **neutro** |

En Incidencias el color verde sale de que `STATUS_MAP`
(`src/views/incidencias/incidencias.template.js:364`) normaliza
`cancelled`/`canceled`/`cancelada`/`cancelado`/`archived` a `"closed"`, y
`components/status-system.css:186` mete `--closed` en el bloque de éxito. La
etiqueta que se imprime, en cambio, sigue diciendo «Cancelada»
(`incidencias.options.js:174`). Es decir: **un chip verde que dice
«Cancelada»**.

La intención canónica está escrita en el propio fichero de autoridad,
`components/status-system.css:283`:

> `/* Cancelled is terminal but not successful. */`

…y sólo se aplica a Facturas.

**Por qué no se ha unificado aquí.** Porque el arreglo correcto no es añadir un
selector: es que el tono del estado tenga **una sola autoridad**. Hoy hay tres
derivaciones independientes:

- `incidencias.template.js:692` → `incidencias-status-chip--${statusKey}`
- `home.template.shared.js:58` → `home-status--${tone}` + `data-home-status`
- `features/incidencias-detail-state/index.js:801` → `ui-detail-modal-chip--status-*`

Y `statusKey()` se usa a la vez para el chip y para filtrar (`isClosed()`,
`incidencias.template.js:392`), así que cambiar el mapa cambiaría el filtrado.
Arreglar sólo la lista dejaría la lista neutra y el detalle verde: una
inconsistencia nueva en lugar de una resuelta.

**Cómo hacerlo.** Una función `statusTone(valorDeDominio)` en
`src/core/presentation-text.js` --que ya es la autoridad de etiquetas-- que
devuelva `success | danger | pending | neutral | open`, consumida por las tres
derivaciones, con `cancelled`/`archived` en `neutral` según el comentario de
arriba. `statusKey()` se queda como está para el ciclo de vida.

---

## 3 · 83 sitios repiten el indicador de foco

**Medido.** El indicador se pinta con `box-shadow`, y las sombras no se suman:
se sustituyen. Por eso 83 reglas del proyecto llevan
`outline: none; box-shadow: var(--focus-ring)`: cada componente con sombra
propia tenía que volver a declarar el anillo para no perderlo.

El defecto de fondo ya está corregido --el indicador vive ahora en
`src/css/components/focus-system.css`, en la última capa, y su contraste cumple
WCAG 2.4.11 (contrato: `tools/focus-visible-browser-contract.mjs`)-- así que
esas 83 repeticiones ya no hacen falta, pero siguen ahí.

**Por qué no se han retirado.** Retirarlas es un barrido de 83 sitios en 30
hojas, y algunas no son repeticiones: cambian el color o el grosor a propósito
(`views/public/public-support-progress.css:146`,
`views/public/support-request.css:552`). Hay que leerlas una a una.

**Cómo hacerlo.** Pasar el indicador de `box-shadow` a `outline`, que sí
compone con una sombra decorativa en vez de competir con ella. Entonces las 83
desaparecen sin excepción y el `outline: 2px solid transparent` que hoy existe
sólo para `forced-colors` deja de ser necesario.

---

## 4 · Siete tokens que son en realidad hooks de tema

No son defectos, pero conviene que estén nombrados para que nadie los
«arregle» borrándolos: `--border-subtle` (8 sitios),
`--btn-primary-border-hover`, `--focus-ring-color`, `--shadow-color`,
`--sidebar-danger`, `--solid-bg-hover`, `--text-default` se consumen sin estar
declarados, siempre con un fallback válido —
`var(--hook, var(--token-real))`. Es el mismo patrón que usa
`layout/sidebar.css` de forma deliberada: un punto de extensión con valor por
defecto.

La única excepción que merece una decisión: el fallback de `--border-subtle` es
`transparent`, así que las 8 declaraciones
`box-shadow: inset 0 1px 0 var(--border-subtle, transparent)` de
`compositions/home-extreme-*.css` no pintan nada. O el token debía existir y el
realce nunca se cableó, o el realce se descartó y sobran las 8 declaraciones.

---

## 5 · Lo que la auditoría revisó y resultó estar bien

Para que no se vuelva a auditar:

- **La arquitectura de cascada.** `app.css:35` declara un único orden de capas
  y las hojas de ruta se autodeclaran (`src/router/styles.js` exige
  `self-layered-v1`). No hay que rehacerla.
- **`views/public/home-critical.css` sin capa es deliberado**: su propio
  comentario (líneas 11-12) explica que debe ganar a `@layer auth` de la vista.
  Envolverla en una capa la rompe en silencio.
- **`seo/public-service.css` sin capa también**: sólo la sirve el sitio estático
  generado (`tools/sync-public-site.mjs`), nunca `app.css`.
- **Las dos hojas de `src/features` sin capa** (`incidencias-comment-avatars`,
  `incidencias-followup-avatars`, 55 y 49 líneas) no declaran `box-shadow` ni
  reglas de foco, así que no compiten con nada: el riesgo es teórico.
- **Los tokens `--ui-detail-modal-*` redefinidos por dominio** son contrato
  documentado (`docs/UI_MODAL_SYSTEM.md:128`), no deriva.
- **`components/status-system.css`** ya es una autoridad real: traduce los
  nombres de clase de cada vista a cinco tokens semánticos. El problema del
  punto 2 no es la hoja, es quién decide el tono antes de llegar a ella.
