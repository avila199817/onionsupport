# Valoraciones ocupa su capa, y la devuelve · 2026-09-17

## El defecto

Con el detalle de una factura abierto, pulsar «Valoraciones» abría su diálogo
**detrás** y dejaba la interfaz bloqueada hasta recargar.

## Medido en el navegador, no deducido

Sobre el build real, con el detalle abierto y el diálogo encima:

| Hecho | Medición |
| --- | --- |
| Raíz del diálogo | `#onion-facturas-paid-confirm-root`, hijo **6** de `body` |
| Raíz del detalle | `#facturas-detail-root`, hijo **7** de `body` |
| `z-index` de ambas `.ui-detail-modal-root` | **80** y **80** |
| `isolation` de `body` | `isolate` |
| Clic en el centro del diálogo | llegaba a `DIV.ui-detail-modal-overlay` del detalle |
| Clic en el **botón** del diálogo | llegaba a `DIV.ui-detail-modal-overlay` del detalle |
| Foco | sí estaba en `BUTTON.fpc-btn` |

Dos fallos distintos, no uno:

1. **Pintado.** Empate de `z-index` en el mismo contexto de apilamiento: decide
   el orden del árbol. El portal del diálogo lo crea su módulo al importarse y
   no se mueve; el host del detalle se destruye al cerrar y se vuelve a añadir
   al final de `body` en cada apertura. El detalle acaba siempre después.
2. **Impacto.** `holdModalPanel` retiene el *panel*, pero su velo hermano sigue
   siendo `position: fixed; inset: 0; pointer-events: auto`. La capa de debajo
   se quedaba con todos los clics, incluidos los del diálogo.

El foco sí era correcto: por eso el teclado funcionaba y el ratón no.

## La corrección, en la autoridad compartida

La pila modal ya marca lo cubierto con `data-modal-stack-held`.
`components/detail-modal.css` lee esa marca:

```css
.ui-detail-modal-root:has([data-modal-stack-held="true"]) {
  z-index: calc(var(--z-modal) - 1);
}
.ui-detail-modal-root:has([data-modal-stack-held="true"]) > .ui-detail-modal-overlay {
  pointer-events: none;
}
```

El orden de pintado pasa a seguir a la pila, no al árbol. Sin `z-index`
inventado —se deriva del token—, sin otro gestor de overlays, sin otro
atrapa-foco, sin portal improvisado, sin limpieza global de `inert` y sin
temporizadores. `:has()` ya se usa en 12 hojas del proyecto, incluida ésta.

El `>` de la segunda regla es deliberado: el visor de adjuntos se monta **dentro**
de la raíz de Incidencias que cubre, así que su propio velo es hijo directo de
*su* raíz y conserva su clic para cerrarse.

## Después de corregir

| Estado | `facturas-detail-root` | `onion-facturas-paid-confirm-root` |
| --- | --- | --- |
| sólo el detalle | z=80, velo `auto` | — |
| con Valoraciones | z=**79**, retenida, velo **`none`** | z=80, velo `auto` |
| tras cerrar el diálogo | z=**80**, velo `auto` | — |

Al cerrar, el foco vuelve a `BUTTON.facturas-detail-btn` —el disparador vivo— y
la factura sigue abierta con su posición de lectura.

## El contrato

`tools/paid-confirm-layer-contract.mjs`, ocho escenarios, **sin leer `z-index`
para juzgar la superposición**: prueba de impacto con `elementFromPoint` sobre
el diálogo y sobre su botón.

1. El orden real de montaje de producción, comprobado: el caso desfavorable.
2. El diálogo recibe sus propios clics; la capa activa se pinta sobre la retenida.
3. El fondo cubierto no recibe interacciones.
4. Tab ×6 y Shift+Tab ×3 se quedan en el diálogo.
5. Escape cierra sólo su capa: la factura conserva lectura, recupera sus clics y
   el foco vuelve a su disparador vivo.
6. Reapertura, doble clic y cierre por teclado: nunca dos capas, nunca atascado.
7. Cierre durante una lectura lenta: una respuesta tardía no resucita la capa
   cerrada ni deja la factura muda.
8. Cerrar todo: 0 capas, 0 retenidos, 0 inertes, cuerpo sin marcar; Facturas,
   Valoraciones y «Nueva incidencia» reabren **sin recargar**.

Un documento, cero escrituras de dominio, cero errores de página. No se confirma
ningún pago ni se envía ninguna valoración: los controles usados son cerrar y
releer.

## Negativas verificadas

| Mutación | Resultado medido |
| --- | --- |
| Retirar el escalón de pintado | «La capa activa se pinta por encima de la retenida (80 > 80)» |
| Retirar el apagado del velo retenido | «El velo de la capa retenida no se queda con los clics» |
| Retirar el apagado, en el recorrido conjunto | el mismo mensaje, en el paso 15 |

Son independientes: sin el escalón, el diálogo se pinta detrás aunque el clic
pase; sin el apagado, el clic no llega.

## Por qué no lo detectaba nada

`shared-host-modal-stack-contract` importa la feature **con el detalle ya
montado**, que es el caso favorable: el portal del diálogo queda entonces
después en el árbol y por tanto encima. El contrato nuevo comprueba
explícitamente el orden de montaje antes de juzgar nada.

## Consumidores de la autoridad, comprobados

`modal-stack-isolation`, `shared-host-modal-stack`, `media-viewer-stability`,
`modal-footer-parity`, `detail-header-parity`, `facturas-confirmation`,
`facturas-paid`, `correo-modal`, `incidencia-update` y `modal_lifecycle`: los
diez pasan.
