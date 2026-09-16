# El padre sigue aislado y el foco no sale del visor · 2026-09-16

## Problema

Cambiar de imagen o vídeo dentro del visor **reactivaba el modal de Incidencias que está debajo**: `aria-hidden` e `inert` se quitaban y se volvían a poner, y el foco caía a `BODY` durante unos fotogramas.

Nada de esto se ve como un destello — `inert` no tiene efecto visual — que es justo por lo que se comprueba **instrumentando las transiciones**, no mirando píxeles.

## Dos causas, ninguna donde parecía

Medido con un muestreo por fotograma del panel padre y de `document.activeElement`:

**1. El re-render del propietario le quitaba el aislamiento.**
`syncAttributes(currentPanel, nextPanel)` copia los atributos de una plantilla que **no sabe nada de la capa que tiene encima**: emite el panel como se vería sin visor. Al sincronizar, borraba `inert` y `aria-hidden` de un panel que la pila seguía sujetando, y la feature los reponía un fotograma después. En medio, un modal tapado volvía a estar vivo.

**2. Desactivar el control con el foco lo tiraba al fondo.**
`syncControls` desactiva las dos flechas mientras dura el intercambio (`gallery.js:504-505`). Desactivar el botón **que tiene el foco** manda el foco al `body`, así que la incidencia tapada pasaba a ser el contexto enfocado en cada cambio de archivo.

Se descartó, con medición, que fuera `setPanelInert`: durante una navegación se registra **una sola** llamada, y el flip ocurría igualmente.

## Cambio

### La pila declara qué atributos son suyos

`MODAL_STACK_OWNED_ATTRIBUTES` en `src/features/entity-overlay/modal-lifecycle.js` — la autoridad que ya posee el aislamiento — enumera `inert`, `aria-hidden` y los dos marcadores de la pila. El host compartido y el parcheador del dominio los **saltan**, así que un re-render no puede soltar un panel que la pila sigue sujetando. Sólo la pila los pone y los quita.

La protección **está acotada al panel que la pila sujeta ahora mismo** (`modalStackProtects` = marcador + atributo). `aria-hidden` es un atributo de contenido corriente en casi todo lo demás — un icono decorativo, una tarjeta que la plantilla muestra u oculta —, así que protegerlo sin condición congelaría estado legítimo y sería un fallo propio. Medido en el escenario real: mientras el padre está tapado, el parcheo compartido escribe **22 atributos de contenido** en ese mismo panel y **0** de los de la pila.

No se crea un segundo gestor de overlays ni de foco.

### Una sola autoridad sujeta y suelta, y hay dos titulares reales

`holdModalPanel` / `releaseModalPanel` viven en `modal-lifecycle.js`. El visor dejó de tener su copia: `setPanelInert` sólo dice **qué panel cubre** y **qué capa debe seguir alcanzable**. La confirmación de cobro de Facturas (`facturas-paid-confirm`) usa la misma autoridad, así que el detalle que tapa deja de estar vivo debajo — antes seguía en el árbol de accesibilidad, con seis controles alcanzables por tecnología asistiva.

Los marcadores se llaman ahora por lo que son: `data-modal-stack-held` y `data-modal-stack-previous-aria-hidden`. Un panel de Facturas sujeto por un diálogo de cobro no está «de fondo de un visor de medios». La única regla CSS que los usaba (`user-select: none`, acotada al panel de Incidencias) conserva exactamente su efecto.

`holdModalPanel` se niega a aislar un **ancestro de la capa activa**: una capa que se tapa a sí misma no es aislamiento, es un modal inalcanzable. En los dos titulares la capa es hermana de lo que cubre, y el contrato lo comprueba.

### El aislamiento no se reafirma

Sujetar un panel ya sujeto sale antes. Pedir un aislamiento que ya se tiene es cómo un cambio de contenido acaba pareciéndose a una reapertura.

### El foco se aparca y se devuelve

El control conserva su `disabled` — de verdad no se puede usar mientras tanto —, pero **antes** de desactivarlo el foco pasa al panel del propio visor, y **se devuelve al mismo control** en cuanto vuelve a ser usable, sólo si el lector no lo ha movido él mismo. Nunca sale de la capa y no se le interrumpe.

Sin `setTimeout`, sin ocultar `BODY`, sin retirar protecciones de accesibilidad.

### El origen del foco puede haber sido sustituido

Defecto preexistente que sale a la luz al recorrer el viaje completo: el control que abre una capa vive **dentro del panel de abajo**, y ese panel puede re-renderizarse mientras la capa lo tapa. Al cerrar, `restoreModalFocus(opener)` apuntaba a un nodo desconectado y el foco caía a `BODY` sin un solo error. Medido: `openerConnected: false`, `activeElement: BODY`.

`liveModalOpener` — en la misma autoridad — devuelve el nodo vivo equivalente **sólo si el suyo ya no existe** y **sólo si su identidad es inequívoca** dentro del panel que se libera. Dos controles con el mismo valor no son una coincidencia, son una suposición: entonces el foco vuelve al panel y no a un botón equivocado. No se roba el foco de ningún otro sitio ni se reabre nada.

## Resultado medido

| | Antes | Después |
| --- | --- | --- |
| Cambios de aislamiento del padre al navegar | `inert` y `aria-hidden` quitados y repuestos | **0** |
| Transiciones de foco fuera del visor | caída a `BODY` en cada cambio | **0 de 9** |
| Tab / Shift+Tab | — | se quedan en la capa |
| Escape | — | cierra sólo el visor |
| Al cerrar | — | libera el padre, devuelve el foco al adjunto que lo abrió y conserva el borrador |
| Detalle de Facturas tapado por el cobro | vivo: `inert` no, `aria-hidden` no, 6 controles alcanzables | **aislado**, y liberado al cerrar sin marcas residuales |
| Escrituras de la pila al re-renderizar el padre tapado | `inert` y `aria-hidden` borrados por la plantilla | **0** (y 22 atributos de contenido sí se actualizan) |
| Foco al cerrar la capa con el origen sustituido | `BODY` | el control equivalente vivo |

## Pruebas

`tools/modal-stack-isolation-contract.mjs`, en `test:browser:ui`. El foco se muestrea **por fotograma**, no por `focusin`: una caída al `body` no levanta `focusin` de forma fiable y el defecto duraba unos pocos fotogramas. Es el método que lo detectó, así que es el método que lo vigila.

Negativas verificadas:

| Regresión | Aserción |
| --- | --- |
| el parcheador del dominio vuelve a borrar los atributos de la pila | *«Navigating inside the viewer changed the owner's isolation 16 time(s)»* |
| no se aparca el foco antes de desactivar | *«Focus left the viewer 4 time(s) while navigating»* |

## La otra ruta real: el host compartido, con un consumidor real

`tools/shared-host-modal-stack-contract.mjs`, también en `test:browser:ui`. **No es un fixture que copie el parcheo**: un fixture que reimplementa la implementación no demuestra que el consumidor real la use. Todo sale de `src/` — la vista de Facturas, `modal-host.js`, la autoridad de la pila y la feature de confirmación, que se instala al importarse igual que la carga el cargador de features. Sólo se sustituye la frontera de pago, así que ninguna escritura sale de la página.

El viaje, con el detalle real de Facturas como padre y la confirmación de cobro como capa superior:

1. el padre es un panel real del shell compartido, cargado desde `src/`;
2. la capa se abre por el mecanismo real: clic en la acción real dentro del detalle;
3. el padre queda sujeto (`inert`, `aria-hidden`, marcador y estado previo anotado) y **no contiene** la capa activa;
4. el contenido del padre se actualiza **estando tapado**, por el camino en sitio del propio controlador (`openFactura(id, null, { retry: true })`, el mismo que usa su control de reintento): 0 escrituras de la pila, 22 de contenido;
5. la capa de arriba se sigue usando: 10 pasos de teclado, ninguno fuera;
6. se cierra **sólo** esa capa;
7. el padre sigue abierto, vuelve a ser interactivo, recupera el `aria-hidden` que tenía (ninguno: se quita, no se deja en `"false"`), no queda ninguna marca de aislamiento, el scroll de la página sigue bloqueado por el padre y el foco vuelve al control que abrió la capa.

Negativas verificadas **por separado**, una condición cada vez:

| Regresión | Aserción |
| --- | --- |
| el host compartido deja de respetar la protección | *«A render of the parent never releases a panel the stack holds»* |
| la capa superior deja de sujetar el panel que cubre | *«The covered parent is inert while a layer is above it»* |
| `liveModalOpener` acepta una identidad ambigua | *«Focus returns to the exact control that opened the layer»* |
| la capa no rehace el foco sobre el nodo vivo | *«Focus returns to the parent that owned the layer»* |

Y el alcance, comprobado como tabla: sobre un panel sujeto se protegen **exactamente** los cuatro atributos de la pila y ninguno de `aria-busy`, `aria-disabled`, `disabled`, `hidden`, `class`, `data-factura-id`, `data-facturas-action` ni `aria-expanded`; sobre un panel no sujeto no se protege **nada**.

## Un aviso del propio repositorio

La primera versión de esta guarda puso en rojo `tools/private-kpi-render-browser-contract.mjs` con un desajuste de `data-stats-scope` que no parecía tener relación. Lo tenía: ese contrato **extrae literalmente el cierre del controlador** de Incidencias y lo sirve como módulo con los imports canónicos que declara a mano. La llamada nueva quedaba como variable libre, el `catch` de `patchListDom` se tragaba el `ReferenceError` y el parche real fallaba en silencio.

El contrato declara ahora también ese import canónico y exige que el controlador lo use. Negativas verificadas: quitarlo del contrato reproduce el desajuste exacto; quitarlo del controlador dispara *«Controller imports the canonical modal-stack attribute authority»*.

## Lo que sigue sin estar unificado

`src/views/incidencias/index.impl.js` mantiene su propio `patchDetailModalDom`. La **regla** del aislamiento sí es única y los dos parcheadores la obedecen, pero **el parcheo no está unificado**, y eso es una unidad arquitectónica aparte. Aquí no se declara «infraestructura unificada».
