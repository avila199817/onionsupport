# Cabecera compartida, ancho útil e IRPF que no aplica · 2026-09-16

Tres defectos del detalle de entidad, los tres de **presentación**. Ningún cálculo, ningún importe persistido y ningún dato del documento cambian.

---

## A · La misma responsabilidad se resolvía con dos variantes

Facturas **sí** pintaba avatar — una parte anterior de mi trabajo dijo que no, a partir de un `grep` de la clase compartida, y era incorrecto. Lo que ocurría es que cada dominio tenía el suyo, de distinto tamaño.

### Cómo se mide esto sin equivocarse

Quien dibuja el avatar es `src/css/components/avatar-system.css`, que los dos entrypoints importan **en la capa `guardrails`, la última** del orden declarado en `app.css`. Una capa posterior gana a cualquier regla de `components/` o `views/` por específica que sea: el tamaño, el radio, el recorte, el color del fallback y el estado de la imagen los decide esa hoja y sólo esa.

Mi primera medición cargó una lista de hojas elegida a mano **sin** esa hoja, y midió otra aplicación: allí el marco parecía obedecer a `detail-modal.css` (66×21 px en Incidencias, 58×58 en Facturas). Esas cifras no describían el producto. La medición buena carga los dos entrypoints reales y las hojas de ruta tal como las sirve el router, con sus capas. El contrato de esta unidad y la validación conjunta lo hacen ahora así.

### Lo que había, medido en el producto

| Anchura | Incidencias | Facturas |
| --- | --- | --- |
| 1280 px | hueco 66×56 px · avatar **56 px** circular | avatar **42 px** circular |
| 900 px | hueco 66×56 px · avatar **56 px** | avatar **42 px** |
| 390 px | hueco **46 px** con un avatar de **56** — se salía | avatar **42 px** |

Tres desacuerdos en la misma cabecera: los dos dominios pintan identidades de distinto tamaño, el hueco que reserva la cabecera no vale lo que el avatar mide, y en móvil el avatar se sale de su columna.

### Cambio

- Facturas deja su variante propia y usa la compartida (`ui-detail-modal-avatar` + `ui-detail-modal-avatar-frame`), con los mismos atributos de identidad que ya usaba. Su hoja se queda **sin una sola regla** de avatar.
- `detail-modal.css` deja de intentar dimensionar y recortar el marco: esas reglas eran letra muerta en el producto y fueron justo las que hicieron creer a un fixture incompleto que mandaba el shell. La autoridad estructural declara **el hueco**, no el dibujo. (El marco conserva sus declaraciones de caja y tipografía, que `incidencias_comment_avatar_contract` fija desde la migración del viejo motor de gradientes; lo que se retira es tamaño, radio y recorte.)
- El hueco deriva del mismo número que pinta el sistema de avatares: `--ui-detail-modal-avatar-size: var(--avatar-size-detail, 56px)`. Desaparecen los tamaños por anchura escritos a mano (58/54/46 px) y el token de radio, que ya no tenía consumidor.

### Resultado medido en el producto

| Anchura | Incidencias | Facturas |
| --- | --- | --- |
| 1280 px | hueco = avatar **56×56 px**, circular | **idéntico** |
| 900 px | hueco = avatar **56×56 px** | **idéntico** |
| 390 px | hueco = avatar **56×56 px** | **idéntico** |

Ni holgura en escritorio ni desbordamiento en móvil, y la misma identidad visual en los dos detalles. Con foto válida, ausente o fallida el hueco no cambia. Sin nombre utilizable, las dos cabeceras caen en el fallback del sistema. Con nombres de 92 caracteres no hay desbordamiento ni solape y el cierre sigue alcanzable a 1280 px y a 390 px. Al abrir dos entidades seguidas la identidad declarada cambia y **no queda la fotografía de la anterior**.

**No se propaga `data-modal-hero`.** Un contrato correcto rechazó añadirlo a Facturas porque rompía la simetría entre su estado de carga y su estado listo. Al mirarlo, ese marcador tiene **un productor y cero consumidores**: la unificación es de variante, no de marcador, así que se quitó en vez de relajar el contrato.

**El contrato de identidad viaja con la variante.** `avatar_runtime_dom_contract.mjs` localizaba el avatar del detalle de Facturas por su clase propia, `.facturas-detail-avatar`. Al retirarla, sus cuatro casos dejaron de encontrar nodo y el contrato cayó con un `TypeError` sin atribución — lo detectó la batería local y lo repitió CI. Los cuatro pasan ahora por el marcador semántico que ya usaba Incidencias, `[data-modal-avatar-frame='true']`: misma responsabilidad, mismo marcador. Y el bucle del contrato falla **por nombre** en lugar de reventar varias líneas más abajo. La clase `facturas-detail-identity` se retira también: no quedaba ninguna regla que la usara.

---

## B · El contenido de Facturas se encogía a su texto

`.facturas-detail-body` lleva `margin-inline: auto`, y en un ítem de rejilla los márgenes automáticos **anulan el estirado** y lo dejan a ancho de contenido. El tope de legibilidad de 1180 px no era la causa: comprobado en vivo, quitarlo no cambiaba nada; declarar `inline-size: 100%` sí. El tope **se conserva**. Sin anchos por factura, sin `!important` y sin variantes nuevas.

Medido con el mismo guion sobre las dos revisiones, con los entrypoints reales:

| Anchura | Pista | Cuerpo antes (`a93db093`) | Cuerpo después |
| --- | --- | --- | --- |
| 1280 px | 1230 px | 807 px | **1179 px** |
| 900 px | 850 px | 611 px | **799 px** |
| 390 px | 366 px | 332 px | 332 px — *sin cambio: a esa anchura ya mandaba el relleno* |

Sin desbordamiento horizontal en ninguna de las tres.

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

## D · Una regla que dejó de existir al retirar un selector

Revisando el diff antes de fusionar apareció un defecto mío. La hoja de Facturas tenía esto:

```css
@media (forced-colors: active) {
  .facturas-detail-section,
  …
  .facturas-detail-btn,
  .facturas-detail-avatar { forced-color-adjust: auto; }
}
```

Al retirar `.facturas-detail-avatar` se fue con él **el bloque de declaraciones**, y la lista quedó terminada en coma seguida de `}`. Un navegador descarta la regla entera: las ocho superficies del detalle perdían `forced-color-adjust: auto` en modo alto contraste.

Ni el build, ni `check:dist`, ni los 23 contratos de navegador, ni CI lo rechazaron: la hoja se compiló y se sirvió sin protesta. Corregido dejando la declaración en el último selector que queda, y añadido `tools/css-block-integrity-contract.mjs` a `validate:source`: recorre las 80 hojas de `src/css` y `src/features`, exige llaves equilibradas y rechaza cualquier lista de selectores que termine en coma. Negativa comprobada por separado: reintroducir la coma colgante hace fallar el contrato por nombre de fichero.

## Pruebas

- `tools/detail-header-parity-contract.mjs` (`test:browser:ui`): 7 comprobaciones sobre las dos cabeceras a 1280/900/390 px, **cargando los dos entrypoints reales y las hojas de ruta con sus capas** — misma variante y mismas dimensiones, hueco igual al avatar que pinta el sistema, foto válida/ausente/fallida, identidad sin nombre, nombres largos, dos entidades seguidas sin herencia, ninguna hoja de dominio ni el propio shell dimensionando el marco, y el ancho útil del cuerpo frente a su pista y a su tope.
- `tools/factura-tax-visibility-contract.mjs` (`validate:source`): las cinco políticas como pruebas ejecutables, más el IVA canónico y la invariante de documento intacto.
- `tools/css-block-integrity-contract.mjs` (`validate:source`): sintaxis de bloque en las 80 hojas del proyecto.

Batería local sobre el commit del PR: `validate` en verde (sin cota superada y sin cambio de superficie exportada), `build:repro` idéntico, y 22 de 23 contratos de navegador en verde. El que falla es el conocido de este entorno, `tools/private-domain-contracts.mjs --browser` → *«SPA document-pdf: usable viewer and explicit close: page.waitForEvent: Timeout 10000ms exceeded»*, **idéntico sobre `main` limpio** (48 PASS / 1 FAIL en ambos) y en verde dentro de CI. No se presenta como prueba local superada.

Negativas verificadas por separado:

| Regresión | Aserción |
| --- | --- |
| reintroducir un tamaño de avatar propio de Facturas | *«… no puede dimensionar su propio avatar de cabecera»* |
| que el shell vuelva a dimensionar o recortar el marco | *«detail-modal.css no puede dimensionar ni recortar el marco: lo hace el sistema de avatares»* |
| que el hueco deje de valer lo que el avatar mide | *«el hueco reservado vale exactamente lo que el sistema de avatares pinta»* |
| volver a acreditar el IRPF con la base general | *«sin ningún campo de retención: la tarjeta de IRPF no debe existir»* |
| volver a pintar un cero real como cero negativo | *«enabled:true con importe 0: un cero real no lleva signo negativo»* |
| dejar una lista de selectores terminada en coma | *«una lista de selectores termina en coma antes de `}` — la regla entera se descarta»* |

### Sobre la medida del scroll al abrir el perfil del técnico

La primera pasada de la validación conjunta midió que el cuerpo del detalle pasaba de 120 px a 0 al abrir el perfil del técnico. **Era el arnés, no el producto.** El disparador vive en la parte alta del cuerpo (contenido 21–114 px): con el cuerpo desplazado 120 px queda fuera de la ventana visible, y `locator.click()` de Playwright lo arrastra a la vista *antes* de pulsar. Con un clic programático — mismo controlador delegado, sin desplazamiento automático — el scroll se conserva en 120 durante la apertura y tras el cierre; con un clic real de ratón a un desplazamiento en el que el disparador sigue visible, se conserva igual. El nodo del cuerpo es el mismo, sus ocho hijos son los mismos y sólo cambian atributos del disparador. El paso 6 de la validación conjunta mide ahora las dos formas y declara cuál es cuál.

### Sobre una medición que describía otra aplicación

Queda anotado porque cuesta de ver: un fixture que sirve una lista de hojas elegida a mano puede pasar todos sus contratos y describir una aplicación que no existe. Aquí faltaba `components/avatar-system.css` —la última capa— y con ella faltaba quien realmente dibuja el avatar. Las cifras de la primera versión de esta nota (66×21, 58×58) eran de ese mundo. El contrato y la validación conjunta cargan ahora `app.css` y `private.css`, que es lo que carga el área autenticada.

## Alcance declarado, no resuelto

- `src/views/clientes/clientes.template.modal.js` tiene una **tercera** composición de cabecera (`clientes-modal-hero`) con sus propias clases. No entra aquí.
- `patchDetailModalDom` de Incidencias sigue existiendo junto al parcheo compartido.
- Los demás fixtures de navegador siguen sirviendo listas de hojas elegidas a mano. Aquí se ha corregido el de esta unidad y el de la validación conjunta; revisarlos todos es otra unidad.
- No hay contrato permanente que fije «abrir y cerrar una capa apilada conserva el scroll del cuerpo»: hoy se mide en la validación conjunta, que no está versionada.
- La tarjeta de IVA sigue pintándose aunque la factura no traiga dato de IVA, porque su base también cae en `baseImponible`. Es el mismo patrón que el del IRPF, pero la autorización de ocultar lo que no aplica era para el IRPF: se deja medido y sin tocar.
