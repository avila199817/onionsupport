# El visor deja de reconstruir la lista de adjuntos · 2026-09-16

## Problema

Al pasar al siguiente adjunto parpadeaba el modal de Incidencias que está detrás.

## Medido, no deducido

Marcando los nodos vivos y navegando, con plantillas reales y datos sintéticos:

| Nodo | Antes | Después |
| --- | --- | --- |
| panel y cuerpo del modal | sobreviven | sobreviven |
| slot de adjuntos | **reemplazado** | **el mismo** |
| rejilla | **reemplazada** | **la misma** |
| tarjetas intactas | **0 de 5** | **4 de 5** |
| peor paso de 10 navegaciones | — | **1 tarjeta** |
| imágenes decodificadas | — | **2 de 2 conservadas** |

El HTML del slot era **byte a byte idéntico**: 18194 → 18194. Se sustituía una parte que no había cambiado. **La identidad de nodo es la prueba, no el marcado**: marcado idéntico que se reemplaza igualmente se vuelve a maquetar y pintar.

Y renderizando la plantilla con dos adjuntos previsualizados distintos, **las cuatro tarjetas salen idénticas**. Navegar por el visor no cambia ninguna tarjeta, así que ninguna debía reconstruirse.

## Causa

`navigate()` de la galería sintetiza un clic sobre el botón de la tarjeta en la lista del propietario. Eso entra en el camino de «abrir adjunto», que lanza `renderModals`, y ese render reemplazaba el slot entero aunque lo único que cambia es qué adjunto está ocupado o previsualizado.

El código ya conocía el criterio: la confirmación de borrado pasa `preserveAttachmentList: true` con el comentario *«La confirmación no cambia los adjuntos… evita un repintado innecesario»*. El visor no lo hacía.

## Quién posee qué dentro de una tarjeta

| Parte | Dueño |
| --- | --- |
| acción, etiquetas, estado ocupado, permisos | **la plantilla** |
| miniatura de una imagen: el marco | la plantilla (`data-modal-thumb-frame` + `<img src>`) |
| miniatura de una imagen: su estado de carga | **la feature** (`data-preview-state`, `data-thumb-error`) |
| miniatura de un vídeo u otro tipo | **la feature**, que asciende el cuadrado liso en el sitio |

La plantilla emite para un vídeo un cuadrado con `data-renderable-thumbnail="false"`; `incidencias-video-preview` lo convierte en un marco hidratado con el primer fotograma decodificado dentro. Por eso una tarjeta de vídeo **no podía igualar nunca** a su render recién generado: se reconstruía en todos los renders, y al reconstruirla se perdía el fotograma y había que hidratar otra vez.

## Cambio

`preserveAttachmentList` deja de significar «ignora la lista» y pasa a significar **«reconcíliala tarjeta a tarjeta»**:

- Las tarjetas se emparejan **por el id del adjunto**, nunca por posición.
- La comparación se hace **tras normalizar lo que poseen las features**, no entre las dos cadenas de HTML crudas.
- Si el conjunto de adjuntos cambió, se reemplaza el slot entero, como antes.

### Sin arrastrar datos obsoletos

No se copia el DOM anterior para forzar igualdad. Lo que la plantilla posee **se aplica siempre desde el render entrante**, también sobre un nodo que se conserva, así que no pueden sobrevivir una etiqueta vieja, un estado ocupado viejo ni un permiso retirado. Sólo se conserva lo que la feature posee e invalida por su propia clave. La imagen ya decodificada se traslada **únicamente cuando su `src` es literalmente el mismo**, de modo que un fichero sustituido o un enlace caducado no pueden quedarse en pantalla. Los nodos se **mueven**, no se clonan: ningún listener se duplica.

### Qué se reemplaza, y por qué

De las cinco tarjetas sólo se reemplaza el adjunto que **pasa a estar activo**: su estado ocupado cambia de verdad (`is-loading`, `disabled`, `aria-busy`, y el texto «Abriendo…» → «Ver»). Es un cambio real, limitado a ese elemento, y aun así su imagen decodificada se traslada en lugar de reiniciarse.

### Alcance del mismo criterio

Los tres renders de `downloadAttachment` tenían el mismo defecto: marcar y desmarcar una descarga reconstruía la lista entera. También preservan ahora.

## Descartado con medición

- **El bloqueo de scroll no se libera:** las escrituras de clase en `<body>` son idempotentes (`old === now`).
- **No hay animaciones fuera del visor:** cero eventos de `animationstart`/`transitionstart`.
- **`data-media-viewer-background` no oscurece nada:** su única regla es `user-select: none`.
- **`sortAttachments()` no interviene:** interceptando los métodos de la rejilla, cero movimientos.

## Pruebas

`tools/media-viewer-stability-contract.mjs`, en `test:browser:ui`, comprobando **identidad de nodo**:

| Escenario | Comprobación |
| --- | --- |
| navegar | slot, rejilla y tarjetas no afectadas conservan su identidad |
| 10 navegaciones sobre formatos mixtos | **por paso**, no acumulado: como mucho una tarjeta reconstruida y ninguna miniatura reiniciada |
| abrir y cerrar el visor | la lista sobrevive |
| respuesta tardía fuera de orden | no sustituye al adjunto activo |
| error de carga | el padre sigue montado y la lista intacta |
| descargar un adjunto | no reconstruye la lista |
| vídeo hidratado que sí cambia | su marco hidratado sobrevive |

Negativas verificadas: comparar HTML crudo dispara *«Navigating rebuilt 3 of 4 attachment cards»*; quitar la preservación en la descarga dispara *«Downloading an attachment does not replace the attachment slot»*; quitarla en «abriendo», «preview lista» o al cerrar dispara sus aserciones de slot.

## Cobertura declarada, no reclamada

1. El **trasplante** del marco hidratado es una red para cuando una tarjeta ascendida cambia con el foco fuera de ella. Al hacer clic, el foco queda dentro y la reconciliación entrega el mismo comportamiento por su rama de preservación de foco, así que esa rama interna **no la ejercita esta batería**. El comportamiento sí queda comprobado.
2. `setPanelInert` apaga y vuelve a encender `aria-hidden`/`inert` del panel padre en cada navegación, con el foco pasando por `BODY` ~9 ms. No repinta, pero es agitación de foco y aislamiento. **Unidad propia, autorizada y pendiente.**
