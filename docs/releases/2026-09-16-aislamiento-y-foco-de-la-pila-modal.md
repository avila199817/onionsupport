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

`MODAL_STACK_OWNED_ATTRIBUTES` en `src/features/entity-overlay/modal-lifecycle.js` — la autoridad que ya posee el aislamiento — enumera `inert`, `aria-hidden` y los marcadores del visor. El host compartido y el parcheador del dominio los **saltan**, así que un re-render no puede soltar un panel que la pila sigue sujetando. Sólo la pila los pone y los quita.

No se crea un segundo gestor de overlays ni de foco.

### El aislamiento no se reafirma

`setPanelInert(root, true)` sale antes si el panel ya está sujeto. Pedir un aislamiento que ya se tiene es cómo un cambio de contenido acaba pareciéndose a una reapertura.

### El foco se aparca y se devuelve

El control conserva su `disabled` — de verdad no se puede usar mientras tanto —, pero **antes** de desactivarlo el foco pasa al panel del propio visor, y **se devuelve al mismo control** en cuanto vuelve a ser usable, sólo si el lector no lo ha movido él mismo. Nunca sale de la capa y no se le interrumpe.

Sin `setTimeout`, sin ocultar `BODY`, sin retirar protecciones de accesibilidad.

## Resultado medido

| | Antes | Después |
| --- | --- | --- |
| Cambios de aislamiento del padre al navegar | `inert` y `aria-hidden` quitados y repuestos | **0** |
| Transiciones de foco fuera del visor | caída a `BODY` en cada cambio | **0 de 9** |
| Tab / Shift+Tab | — | se quedan en la capa |
| Escape | — | cierra sólo el visor |
| Al cerrar | — | libera el padre, devuelve el foco al adjunto que lo abrió y conserva el borrador |

## Pruebas

`tools/modal-stack-isolation-contract.mjs`, en `test:browser:ui`. El foco se muestrea **por fotograma**, no por `focusin`: una caída al `body` no levanta `focusin` de forma fiable y el defecto duraba unos pocos fotogramas. Es el método que lo detectó, así que es el método que lo vigila.

Negativas verificadas:

| Regresión | Aserción |
| --- | --- |
| el parcheador del dominio vuelve a borrar los atributos de la pila | *«Navigating inside the viewer changed the owner's isolation 16 time(s)»* |
| no se aparca el foco antes de desactivar | *«Focus left the viewer 4 time(s) while navigating»* |

## Cobertura declarada, no reclamada

La misma guarda en `modal-host.js` es por coherencia para los dominios que sí usan el parcheo compartido; Incidencias usa el suyo, así que **esta batería no ejercita esa rama**. Se declara en lugar de contarse como cubierta.
