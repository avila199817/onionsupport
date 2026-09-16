# Cabecera compartida, ancho útil e IRPF que no aplica · 2026-09-16

Tres defectos del detalle de entidad, los tres de **presentación**. Ningún cálculo, ningún importe persistido y ningún dato del documento cambian.

---

## A · La misma responsabilidad se resolvía con dos variantes

Facturas **sí** pintaba avatar — mi parte anterior dijo que no, a partir de un `grep` de la clase compartida, y era incorrecto. Lo que ocurría es que cada dominio tenía la suya.

Medido en navegador sobre `main a93db093`, con el mismo render y el mismo zoom:

| Anchura | Incidencias | Facturas |
| --- | --- | --- |
| 1280 px | **66×21 px**, radio 0 | 58×58 px, radio 13,72 px |
| 900 px | **66×21 px**, radio 0 | 58×58 px, radio 13,72 px |
| 390 px | 46×46 px, radio 0 | 46×46 px, radio 13,16 px |

Los 66×**21** no son una errata: la autoridad daba tamaño al hueco a través de la columna de la rejilla del hero, pero **nunca al marco**, salvo dentro de dos media queries. Fuera de ellas el marco se encogía al texto de las iniciales y el avatar aparecía sin marco ni recorte. Se ve en la captura «antes».

Y los tamaños de Facturas estaban escritos a mano cuatro veces (58/52/46/50 px) en sus propios cortes (820/560/390), distintos de los del shell (720/540).

### Cambio

La autoridad estructural declara la variante **una vez**:

- `.ui-detail-modal-avatar` toma su tamaño del token `--ui-detail-modal-avatar-size`, el mismo que ya usaba la rejilla del hero, así que el hueco queda reservado antes de que llegue ninguna imagen.
- `.ui-detail-modal-avatar-frame` ocupa ese hueco, recorta (`overflow: hidden`) y redondea con `--ui-detail-modal-avatar-radius`.
- La imagen y el fallback comparten celda: mientras no hay foto, o si falla, el hueco ya está ocupado y la cabecera no se mueve.
- Los tamaños por anchura se cambian **redefiniendo el token**, no repitiendo píxeles en dos selectores. Los valores visibles de ≤720 px (54 px) y ≤540 px (46 px) se conservan exactamente; lo que cambia es dónde se declaran.

Facturas consume esa variante y retira la suya; su hoja se queda **sin una sola regla** de tamaño de avatar. Ambos detalles se registran además en el sistema global de avatares (`data-avatar-host`), que ya usaba Facturas: es aditivo — corrige atributos e iniciales y gestiona el estado de la imagen — y no reconstruye nodos.

**No se propaga `data-modal-hero`.** Un contrato correcto rechazó añadirlo a Facturas porque rompía la simetría entre su estado de carga y su estado listo. Al mirarlo, ese marcador tiene **un productor y cero consumidores**: la unificación es de variante, no de marcador, así que se quitó en vez de relajar el contrato.

### Resultado medido

| Anchura | Incidencias | Facturas |
| --- | --- | --- |
| 1280 px | 66×66, radio 21 px | **66×66, radio 21 px** |
| 900 px | 66×66, radio 21 px | **66×66, radio 21 px** |
| 390 px | 46×46, radio 14 px | **46×46, radio 14 px** |

Con foto válida, ausente o fallida el hueco es el mismo 66×66 en los tres casos. Sin nombre utilizable, las dos cabeceras caen en el fallback del sistema. Con nombres de 92 caracteres no hay desbordamiento ni solape y el cierre sigue alcanzable a 1280 px y a 390 px. Al abrir dos entidades seguidas la identidad declarada cambia y **no queda la fotografía de la anterior**.

---

## B · El contenido de Facturas se encogía a su texto

El cuerpo medía **801 px dentro de una pista de 1179 px**.

La causa no era el tope de legibilidad: `.facturas-detail-body` lleva `margin-inline: auto`, y en un ítem de rejilla los márgenes automáticos **anulan el estirado** y lo dejan a ancho de contenido. Comprobado en vivo, sin tocar ficheros:

| | Ancho del cuerpo |
| --- | --- |
| Antes | 801 px |
| Declarando `inline-size: 100%` | **1171 px** |
| Además sin el tope de 1180 px | 1171 px — *sin efecto* |

El tope **no era la causa y se conserva**. Lo que se declara es que el cuerpo ocupe su pista hasta ese tope y siga centrado cuando la pista es más ancha. Sin anchos por factura, sin `!important` y sin variantes nuevas.

Medido después: 1171 px sobre pista de 1179 px (escritorio), 794/799 (intermedio), 330/332 (móvil), con las tarjetas alineadas al ancho útil y sin desbordamiento horizontal en ninguna.

---

## C · IRPF: dos defectos de lectura, no de cálculo

### C.1 · El detalle ignoraba el campo canónico de importe

`normalizeFinancialAliases`, en la API, lee `result.iva` y `result.irpf` como campos canónicos. El lector del detalle **no los tenía en su lista**: sólo entendía `ivaImporte`, `irpfImporte`, `retencion`… y, para `iva`/`irpf`, únicamente su forma de objeto.

Consecuencia medida sobre una factura normalizada por la API real:

| Factura | Antes | Después |
| --- | --- | --- |
| `iva: 8.4`, sin IRPF | IVA **0,00 €**, IRPF **−0,00 €** | IVA **8,40 €**, sin tarjeta de IRPF |
| `irpf: 7` | IRPF **−0,00 €** | IRPF **−7,00 €** |

Una retención real de 7 € se estaba enseñando como cero. Esto no es «ocultar lo que no aplica»: era **ocultar un importe real**.

### C.2 · La base de la factura acreditaba una retención inexistente

La base del IRPF caía por defecto en `baseImponible` — la base general del documento. Como la tarjeta se pinta si hay importe, porcentaje **o base**, bastaba con que la factura tuviera base — es decir, siempre — para fabricar un IRPF que no existe y enseñarlo como «−0,00 €».

Una retención sólo se acredita con datos suyos: su importe, su tipo, su propia base o una marca explícita de que aplica.

### Tabla de la política · entrada → presentación actual → propuesta → impacto

| # | Entrada | Presentación actual | Presentación propuesta | Impacto |
| --- | --- | --- | --- | --- |
| 1 | Sin ningún campo de retención | Tarjeta IRPF con **−0,00 €** y «Base: 40,00 €» | **Sin tarjeta y sin hueco** | Desaparece una retención inexistente. Ningún importe cambia |
| 1b | `irpf: {}` / `irpfImporte: null` / `""` | Tarjeta con −0,00 € | **Sin tarjeta** | Ausencia = sin retención, conforme al contrato existente |
| 2 | `irpf: 7` (campo canónico) | **−0,00 €** | **−7,00 €** | Deja de ocultarse un importe real |
| 2b | `irpfImporte: 7`, `retencion: -7`, `{importe:7}` | −7,00 € | −7,00 € | Sin cambio |
| 2c | `{enabled:false, importe:7}` | −7,00 € | −7,00 € | Un flag contradictorio no oculta una retención real |
| 2d | Factura histórica de 2021 con IRPF | −7,00 € | −7,00 € | La retención del documento se conserva |
| 3 | `{enabled:true, importe:0}` | **−0,00 €** | **0,00 €** | Se conserva la información aplicable; el cero negativo era un artefacto de representación |
| 4 | `irpfImporte: 0.004` | −0,00 € | −0,00 € **+ «Importe redondeado en pantalla»** | Ni se oculta ni se confunde con un cero real |
| 5 | `irpfImporte: "n/d"` | Tarjeta con **0,00 €** inventado | **«No disponible»** | Un dato ilegible no se convierte en cero ni en «no aplica» |
| 5b | `{enabled:"si"}` sin importe | −0,00 € | **«No disponible»** | Se acredita que aplica sin inventarle importe |
| — | IVA `8.4` en el campo canónico | **0,00 €** | **8,40 €** | Mismo defecto de lectura; se corrige a la vez |

**Lo que NO cambia, verificado en las seis variantes:** base imponible, total, pagado, pendiente, precisión, redondeo, importes persistidos, PDFs e histórico. El render no muta la factura, es determinista y no emite ninguna escritura. El total sale de sus propios campos y nunca se recalcula a partir del IRPF.

`IMPUESTOS NETOS` sí pasa de 0,00 € a 8,40 € en la factura de prueba: se deriva del mismo desglose, así que al dejar de ignorar el campo canónico refleja el impuesto que la factura ya traía (40,00 + 8,40 = 48,40, su total declarado). Es la misma corrección de lectura, no un cálculo nuevo.

---

## Pruebas

- `tools/detail-header-parity-contract.mjs` (`test:browser:ui`): 7 comprobaciones sobre las dos cabeceras a 1280/900/390 px — misma variante y mismas dimensiones, hueco reservado antes de la imagen, foto válida/ausente/fallida, identidad sin nombre, nombres largos, dos entidades seguidas sin herencia, ninguna hoja de dominio dimensionando su propio avatar, y el ancho útil del cuerpo frente a su pista y a su tope.
- `tools/factura-tax-visibility-contract.mjs` (`validate:source`): las cinco políticas como pruebas ejecutables, más el IVA canónico y la invariante de documento intacto.

Negativas verificadas por separado:

| Regresión | Aserción |
| --- | --- |
| reintroducir un tamaño de avatar propio de Facturas | *«escritorio: mismas dimensiones de avatar»* |
| volver a acreditar el IRPF con la base general | *«sin ningún campo de retención: la tarjeta de IRPF no debe existir»* |
| volver a pintar un cero real como cero negativo | *«enabled:true con importe 0: un cero real no lleva signo negativo»* |

## Alcance declarado, no resuelto

- `src/views/clientes/clientes.template.modal.js` tiene una **tercera** composición de cabecera (`clientes-modal-hero`) con sus propias clases. No entra aquí.
- `patchDetailModalDom` de Incidencias sigue existiendo junto al parcheo compartido.
- La tarjeta de IVA sigue pintándose aunque la factura no traiga dato de IVA, porque su base también cae en `baseImponible`. Es el mismo patrón que el del IRPF, pero la autorización de ocultar lo que no aplica era para el IRPF: se deja medido y sin tocar.
