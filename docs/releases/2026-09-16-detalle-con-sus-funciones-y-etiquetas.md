# El detalle lleva sus funciones y sus etiquetas venga de donde venga · 2026-09-16

## Problema

Dos fallos distintos que se veían como uno: el ojo del técnico no aparecía, y el mismo tipo de incidencia se leía «Technical» en el chip y «Técnica» en el desplegable.

## A · El detalle no llevaba sus funciones fuera de su ruta

El registro de mejoras decidía qué cargar **sólo por el `pathname`**. Pero el detalle de una incidencia no vive sólo en `/incidencias`: la capa de entidad lo abre desde Home, desde el botón de incidencia de una factura, desde una relación y desde un enlace profundo.

Medido ejecutando `routeScopes()`, la función real del registro, sobre las 13 rutas:

| Ruta | Ámbitos activos | El detalle de incidencia llega… |
| --- | --- | --- |
| `/incidencias`, `/tickets` | `global, data-list, incidencias` | completo |
| `/`, `/home`, `/facturas`, `/clientes`, `/usuarios`, `/agenda`, `/correo`, `/cuenta`, `/servidor`, `/whatsapp`, `/empleados` | sin `incidencias` | **sin sus 5 features** |

Las cinco: `incidencias-detail-state`, `incidencias-detail-live-sync`, `incidencias-technician-profile`, `incidencias-comment-avatars`, `incidencias-followup-avatars`. `src/app/enhancements.js` es el **único** cargador del perfil del técnico, así que fuera de esas dos rutas el ojo no existía, no es que estuviera oculto.

### Cambio

El ámbito pasa a ser **la ruta MÁS lo que está realmente montado**. `MOUNTED_SCOPE_SELECTORS` declara, en lista cerrada, qué portal significa qué dominio; el portal del detalle cuelga de `body`, y el observador que ya existía pasa a mirar también ahí — **la misma instancia**, `subtree: false` en los dos objetivos, sin observar el interior de la vista.

No se carga nada por adelantado: medido en el propio contrato, arrancar el registro en una ruta que no nombra ningún dominio deja **0 de 12** features de dominio cargadas, y sólo al montarse el portal se cargan las cinco de Incidencias — Facturas y públicas siguen sin cargarse.

### Segundo fallo, del propio perfil

Con la feature ya cargada, el ojo salía la primera vez y no volvía: el portal del detalle se destruye al cerrar y al reabrir hay **uno nuevo**, pero la feature observaba `#view-container` (donde el portal no está) y seguía enganchada al host anterior. Ahora observa también los hijos directos de `body`, así que un portal nuevo se reengancha. Reabrir no duplica ni el control ni la etiqueta.

## B · El chip y el desplegable no se leían igual

Los selects del editor ya salían de `incidencias.options.js`. El chip de la cabecera no: capitalizaba el valor crudo. Medido sobre las funciones reales, antes y después:

| Campo · entrada | Antes | Después |
| --- | --- | --- |
| categoría `technical` | `Technical` | **Técnica** |
| categoría `billing` | `Billing` | **Facturación** |
| categoría `access` | `Access` | **Acceso** |
| categoría `network` | `Network` | **Redes** |
| categoría `documentation` | `Documentation` | **Documentación** |
| categoría `sales` | `Sales` | **Ventas** |
| categoría `account` | `Account` | **Cuenta** |
| categoría `tecnica`, `facturacion` (sin tilde) | `Tecnica`, `Facturacion` | **Técnica**, **Facturación** |
| prioridad `urgent`, `critical`, `p0` | `urgent`, `critical`, `p0` | **Alta** |
| prioridad `baja`, `alta` | `baja`, `alta` | **Baja**, **Alta** |
| estado `abierta`, `cerrada`, `Nueva` | `abierta`, `cerrada`, `Nueva` | **Abierta**, **Cerrada**, **Pendiente** |
| estado `progress`, `resolved` | `En proceso`, `Resuelta` | **igual** (etiqueta heredada declarada) |
| valor ausente | `Abierta` / `Media` / `General` | **igual** |
| valor desconocido (`weird-value`) | `weird-value` | `Weird Value` |

Nada de esto cambia el valor enviado a la API: **sólo se lee**. La prioridad `urgent` ya se pintaba con el color de `high`; lo único que discrepaba era el texto.

Desconocido y ausente no son lo mismo: un valor ausente cae en el valor por defecto declarado del campo; uno desconocido se muestra legible tal cual llega, sin inventarle un estado que no tiene. Y los dos estados heredados conservan su texto exacto en lugar de recortarse a la taxonomía de tres: la etiqueta no es el sitio donde recortar una taxonomía.

Se retiran del detalle `statusLabel`, `priorityLabel` y `displayLabel`: tres copias locales menos, ninguna traducción local de un valor de taxonomía.

## Lo que sigue divergiendo, declarado

| Copia | Dónde | Por qué no entra aquí |
| --- | --- | --- |
| `STATUS_MAP` + `STATUS_LABELS` de 5 estados | `src/views/incidencias/incidencias.template.js` | clasifica además los KPI y las facetas (`OPEN_STATUS_KEYS`, `CLOSED_STATUS_KEYS`): unificarla es cambiar agrupaciones, no etiquetas |
| `STATUS_LABELS` multidominio | `src/views/home/home.template.foundation.js` | mezcla incidencias, facturas y usuarios, y dice «En curso» donde el detalle dice «En proceso» |

Son una unidad aparte con su propia equivalencia. **No se declara «etiquetas unificadas»**: lo que está unificado es el detalle.

## Pruebas

- `tools/detail-features-by-mount-contract.mjs` (en `test:browser:ui`): registro real, capa de entidad real y controlador real de Incidencias sobre una ruta que no nombra el dominio. Recorre ámbito vacío → arranque sin cargar dominios → detalle abierto fuera de su ruta → control presente, visible, alcanzable por teclado y en castellano → reapertura idempotente.
- `tools/incidencia-labels-contract.mjs` (en `validate:source`): tabla congelada de 37 entradas, toda opción declarada se lee como su propia etiqueta, cuatro renders reales del detalle donde chip y opción seleccionada coinciden, y ninguna copia local de etiquetas.

Negativas verificadas por separado:

| Regresión | Aserción |
| --- | --- |
| el ámbito vuelve a salir sólo de la URL | el detalle abierto fuera de ruta nunca carga su feature |
| el registro deja de observar la aparición del portal | igual, y `mountTriggers` se queda en 0 |
| la feature deja de ver un portal nuevo | el ojo no vuelve al reabrir |
| el chip vuelve a etiquetar por su cuenta | *«chip "Técnica" missing, got ["Abierta","Alta","technical"]»* |
| reaparece una copia local de etiquetas | *«the detail template must not keep its own function displayLabel(»* |
