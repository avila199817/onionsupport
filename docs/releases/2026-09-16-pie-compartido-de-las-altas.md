# La acción principal de un alta vive en el pie del shell · 2026-09-16

## Problema

El botón «Crear incidencia» no tenía aire: aparecía pegado al último bloque del formulario, sin nada que lo separase del contenido.

Medido en el navegador antes de tocar nada, sobre el render real:

| | Crear incidencia | Detalle de incidencia |
| --- | --- | --- |
| Pie estructural del shell | **ninguno** | 80 px, borde superior 1 px |
| `padding` del pie | — | `12px 20.27px` |
| Dónde vive la acción | dentro del `<form>`, dentro del cuerpo desplazable | en el slot `footer` del shell |

Y no era de Incidencias: **ninguna de las cuatro altas** usaba el slot. Facturas, Clientes, Usuarios e Incidencias dejaban su fila de acciones dentro del formulario, es decir dentro del cuerpo que se desplaza.

Por eso no se arregla con un margen: el problema no era cuánto espacio había, sino **dónde estaba el botón**.

## Cambio

Las cuatro altas pasan su fila de acciones al slot `footer` de `renderModalShell`, el mismo que usa el detalle desde #676. El pie estructural ya declara su aire, su borde y su superficie en `src/css/components/detail-modal.css`; no se añade ni un margen de dominio ni un `!important`.

El botón sale del `<form>` y declara a cuál pertenece con el atributo `form`, que es el mecanismo estándar para un control situado fuera de él. Ninguna ruta de envío cambia.

La regla compartida de la fila de acciones deja de poner su propio `padding-block-start`: el pie es quien pone el aire.

**No se crea ninguna clase de pie por dominio.** El primer intento declaraba `fac-create-footer`, y un contrato correcto lo rechazó — ese nombre era justo el del pie *sticky* propio que Facturas tuvo y se retiró. La corrección fue quitar la clase, no relajar el contrato: el pie del shell se basta.

## Resultado medido

Los cinco modales comparten exactamente la misma geometría, en las dos anchuras:

| Anchura | `padding` | Borde superior | Acción dentro del cuerpo | El pie se desplaza |
| --- | --- | --- | --- | --- |
| 1280 px | `12px 20.27px` | `1px solid` | **no** | **no** |
| 390 px | `12px 13.54px` | `1px solid` | **no** | **no** |

En móvil el pie apila la nota sobre el botón a ancho completo, con la misma regla compartida que ya existía.

## Pruebas

`tools/modal-footer-parity-contract.mjs`, en `test:browser:ui`: renderiza las altas de Incidencias, Clientes y Facturas y el detalle de Incidencias con las hojas reales, y exige pie propio del panel, acción fuera del cuerpo, y `padding`, borde y fondo **idénticos** entre los cuatro, a 1280 px y a 390 px. Comprueba además que ninguna hoja de dominio reestiliza `.ui-detail-modal-footer` y que la fila compartida no gana con `!important`.

**Limitación declarada:** Usuarios no exporta su marcado — `renderCreateModal` monta y parchea, y el HTML sale de un `renderModalHtml()` privado. No se reimplementa para poder medirlo: se comprueba en la fuente que declara el mismo slot, que su envío declara su formulario y que su fila de acciones ya no está dentro del `<form>`; su comportamiento vivo lo cubre su propia batería.

Negativa verificada: devolver la fila de acciones de una alta al cuerpo dispara *«clientes-create: the modal must expose the shell footer slot»*.

## Riesgo

Presentación y estructura del DOM; ningún cambio en validación, en lo que se envía ni en los datos. Las contratos de las altas (`private_create_modal_contract.py`, validación, combobox, selección de usuario, refresco y la batería de creación de Facturas) pasan sin tocarlas.
