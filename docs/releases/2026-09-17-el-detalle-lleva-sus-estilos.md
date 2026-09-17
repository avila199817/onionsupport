# El detalle lleva sus estilos, venga de donde venga · 2026-09-17

## El defecto

Los detalles de Incidencias y Facturas perdían parte de su presentación cuando
se abrían desde otra vista. El armazón estructural compartido sobrevivía; el
CSS de su dominio, no.

## Medido en el navegador, no deducido

No faltaba ninguna hoja: **estaba aparcada**.

Al cambiar de ruta, `src/router/styles.js` no borra las hojas de la anterior.
Las aparca con `media="not all"` para no volver a descargarlas. Siguen en el
`<head>`, y su `.sheet` **sigue sin ser nulo**. `EntityOverlay.ensureStyle()`
las buscaba por `href` y, al encontrarlas con `sheet`, las daba por puestas y
montaba el modal sin ellas.

Por eso el defecto **sólo ocurre en sesión caliente**:

| Sesión | Qué pasa | Resultado |
| --- | --- | --- |
| Entrada en frío (nunca se visitó la ruta del dominio) | no hay `<link>` que encontrar: el overlay crea el suyo | correcto |
| Entrada en caliente (se visitó y se salió) | el `<link>` existe, aparcado, con `.sheet` | **sin estilos de dominio** |

Huella completa del panel, mismo registro, antes de corregir:

| Detalle | Nodos del panel | Nodos que cambian al abrir desde fuera |
| --- | --- | --- |
| Incidencias (`INC-SINT-1`) | 212 | **171** |
| Facturas (`F-SINT-1`) | 151 | **143** |

Un ejemplo concreto: la cabecera de Incidencias pasaba de `779×84` a `873×84`,
y el chip de identificador perdía fondo, borde, radio, peso y distribución
(`flex` → `block`).

## Entradas externas reales, descubiertas en el árbol construido

No se enumeran de memoria. Las cuatro que existen hoy:

| Entrada | Abre |
| --- | --- |
| `facturas.lista` → `.facturas-incidencia-link` | detalle de Incidencia |
| `home.activity` | detalle de Incidencia |
| `home.activity` | detalle de Factura |
| `home.invoices` (tarjeta de facturas) | detalle de Factura |

**Incidencia → Factura no existe** como entrada: en el detalle de una
incidencia el identificador de factura viaja como texto escapado, sin acción
ni atributo de entidad. Queda registrado como medición, no como pendiente.

## La corrección, donde estaba la propiedad del recurso

El `<link>` es uno y ya existe; lo que faltaba era decir **de quién es**
mientras el detalle vive.

- `src/router/styles.js` publica `MODAL_STYLE_CLAIM`
  (`data-modal-style-claim`). `setManagedLinkActive` respeta la reclamación:
  mientras el contador sea mayor que cero, la hoja no se aparca aunque la ruta
  activa sea otra. Publica también `reapplyRouteStyles()`, que vuelve a
  sincronizar el `<head>` con el conjunto activo **ya vigente**: no recalcula
  manifiestos, no descarga nada y no cambia de ruta.
- `src/features/entity-overlay/index.js` reclama la hoja que ya existe al
  abrir —esté puesta o aparcada— y suelta todas sus reclamaciones en
  `stopOwnerSession`, que es donde termina la sesión del detalle.

No hay un segundo cargador, ni copia de estilos de un dominio a otro, ni carga
anticipada al arrancar, ni recursos dejados para siempre, ni `!important`, ni
envoltorios que finjan una página.

Cerrar un consumidor no le retira el recurso a los demás: la reclamación es un
contador, y al soltarla manda la ruta activa.

## El contrato

`tools/detail-styles-ownership-contract.mjs`, en `test:browser:ui`.

No comprueba que exista un `<link>` ni lleva una lista manual de hojas, y el
arnés no precarga el CSS cuya ausencia se busca: compara la **huella completa**
del panel —caja, color, fondo, radio, tipografía, peso, relleno, borde,
distribución y separación de cada nodo— contra el mismo registro abierto en
frío desde su propia ruta.

1. Las entradas externas se descubren en el árbol construido; se comprueba
   además que desde el detalle de Factura no hay ninguna a Incidencia.
2. y 3. Incidencias desde la lista de Facturas y desde la actividad de Home.
4. y 5. Facturas desde la tarjeta de Home y desde su actividad.
6. Propiedad compartida: abrir el detalle **en su propia ruta** y cerrarlo no
   deja a la lista sin sus hojas; fuera de ella, las hojas reclamadas están
   aplicadas mientras vive el detalle y el `<head>` vuelve exactamente al
   estado de la ruta activa al cerrarlo, con cero reclamaciones vivas.
7. Ida y vuelta en caliente: abrir, cerrar, cambiar de ruta y volver a abrir
   desde otra entrada, tres veces, en **un solo documento**.
8. Móvil emulado 390×844 sobre la entrada crítica.

Cero errores de página y cero escrituras de dominio: sólo se abre, se lee y se
cierra.

La espera no mira el reloj ni el alto del panel: repite la huella hasta que dos
muestras consecutivas coinciden. Hizo falta porque la fotografía confirmada
añade `data-has-avatar`, que entra en la regla compartida de avatares y cambia
el `display` del hueco sin cambiar su tamaño. Una hoja ausente da una huella
estable y **distinta**, así que esperar a la estabilidad no tapa el defecto.

## Negativa verificada

Retirando la corrección y reconstruyendo, el contrato falla con el defecto
exacto:

```
Incidencias · desde la lista de Facturas, en caliente:
171 de 212 nodos pierden su presentación.
Primero: frío: DIV.incidencias-modal-hero 779x84 · fuera: 873x84
```

Las cuatro entradas externas lo reproducen: 171/212 en Incidencias, 143/151 en
Facturas.

## Límites

- Sólo se ha tocado la propiedad de las hojas gestionadas. No se ha cambiado
  qué hojas declara cada ruta ni cada tipo de entidad.
- La comparación es contra la apertura en frío desde la propia ruta: define
  «completo» como «igual a su ruta», no como un diseño nuevo.
