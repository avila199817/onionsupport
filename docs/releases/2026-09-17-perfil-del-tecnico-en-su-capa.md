# El perfil del técnico ocupa su capa · 2026-09-17

## El defecto

El ojo del técnico abría después de Ctrl+F5, pero dejaba de abrir tras usar
otros modales y cambiar de vista.

## Medido en el navegador, no deducido

**El perfil sí abría.** Se pintaba, el foco entraba en su panel y el teclado
funcionaba. Lo que fallaba era el **orden de pintado**: el ratón no llegaba.

| Momento | host del perfil | host del detalle | clic en el centro del perfil |
| --- | --- | --- | --- |
| Sesión recién cargada | `body[8]` | `body[7]` | llega al perfil → usable |
| Tras cambiar de vista y volver | `body[6]` | `body[9]` | llega al **detalle** |
| Detalle abierto desde Home | `body[6]` | `body[8]` | llega al **detalle** |

`#incidencias-technician-profile-host` se crea una vez y **no se retira al
cerrar**; el host del detalle se destruye y se vuelve a añadir al final de
`body` con cada controlador nuevo. Ambas raíces declaran el mismo `--z-modal`
(80) y `body` aísla, así que el empate lo resolvía el orden del árbol. En
cuanto el detalle quedaba después, el perfil se pintaba debajo y el velo del
detalle —`position: fixed; inset: 0; pointer-events: auto`— se quedaba con
todos los clics.

Por eso «se arreglaba» al recargar: una carga nueva devolvía el orden
favorable. La caché no tenía nada que ver.

**Por qué no lo veía ninguna prueba.** El panel existe y el foco entra, así que
comprobar que el panel aparece da verde. Y un clic sintético sobre el nodo
salta el hit-testing del navegador. Medido con 60 aperturas —20 dirigidas y 40
aleatorias— antes de encontrarlo: todas «abrían».

## La corrección, en la autoridad que ya existe

`modal-lifecycle.js` dice de sí misma: *«ONE authority, used by every layer that
covers a panel»*. El visor de adjuntos y la confirmación de cobro la usan. El
perfil del técnico era la tercera capa que cubre un panel y **no la usaba**.

Ahora sí: al pintarse retiene el panel que cubre con `holdModalPanel`, y al
cerrarse lo suelta con `releaseModalPanel` y devuelve el foco al disparador
vivo con `liveModalOpener`. La pila marca lo cubierto con
`data-modal-stack-held` y la hoja compartida —la misma que se añadió para
Valoraciones— baja un escalón esa raíz y apaga su velo.

Sin `z-index` inventado, sin otro gestor de capas, sin otro atrapa-foco, sin
temporizadores y sin tocar el orden de montaje de nadie.

Abierto desde la **insignia de la lista** no cubre ninguna capa: no se retiene
nada, porque no hay empate que deshacer.

| Estado | raíz del detalle | raíz del perfil |
| --- | --- | --- |
| sólo el detalle | z=80, velo `auto` | — |
| con el perfil encima | z=**79**, retenida, velo **`none`** | z=80, velo `auto` |
| tras cerrar el perfil | z=**80**, velo `auto`, 0 retenidos | — |

## El contrato

`tools/technician-profile-layer-contract.mjs`, en `test:browser:ui`. **No lee
`z-index` para juzgar** y **pulsa con el ratón real**, en el orden de montaje
desfavorable:

1. Detalle montado **después** del perfil: el perfil recibe sus propios clics.
2. Tabulador dentro de la capa; Escape cierra sólo el perfil y el detalle
   recupera sus clics, con 0 retenidos.
3. Tres ciclos y un doble clic: una sola capa, nunca atascado.
4. Dos técnicos: cada perfil es el suyo y no se mezclan.
5. Desde la insignia de la lista: 0 retenidos y clics propios.
6. Detalle abierto desde Home: el perfil sigue encima.
7. Cerrado todo: 0 capas, 0 retenidos, 0 inertes; «Nueva incidencia» y Usuarios
   siguen abriendo.

Un documento, cero escrituras de dominio, cero errores de página.

## Negativa verificada

Retirando la retención y reconstruyendo: «La capa cubierta queda marcada por la
pila» falla en el primer escenario.

## Lo que NO se ha tocado

- `mounted` sigue siendo un booleano de módulo y `destroy` no lo llama nadie en
  `src/`. Es el patrón que conviene revisar algún día, pero **hoy es inerte**:
  sin destrucción del portal, el booleano nunca sobrevive a nada. No se cambia
  lo que no se ha demostrado que falle.
- El significado del perfil, sus métricas públicas y sus datos de trayectoria.
