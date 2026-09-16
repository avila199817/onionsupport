# El botón de actualizar sale de la tarjeta de comentario · 2026-09-16

## Problema

En el detalle de Incidencias el botón vivía **dentro** de la tarjeta «Añadir actualización», así que decía que sólo enviaba un comentario cuando en realidad ya guardaba también estado, prioridad y tipo. Y estaba siempre habilitado: pulsarlo sin cambios no escribía nada, pero contestaba con un error como si el usuario se hubiera equivocado.

## Lo que se comprobó antes de tocar nada

Reproducido en la batería aislada del repo, con plantillas reales y datos sintéticos:

| Pregunta | Respuesta medida |
| --- | --- |
| ¿Hay algún `<form>` en el panel? | **No, ninguno.** No hay envíos accidentales que arreglar ni hace falta el atributo `form`. |
| ¿Dónde estaba el `<footer data-modal-footer>`? | Dentro del cuerpo desplazable, con la clase `--composer`. |
| ¿Qué controles son editables? | `status`, `priority`, `category`, `comment`, `attachments`. |
| ¿Alguno guarda por su cuenta? | **Ninguno.** No queda una mezcla incoherente. |
| ¿Pulsar sin cambios escribía? | **No.** Mostraba un error. El defecto era el botón habilitado, no una escritura. |

## Autoridad única

`src/views/incidencias/incidencias.detail-pending.js`, pura: sin DOM, sin E/S, sin reloj.

```
hayCambios      = campos editables distintos O comentario real O adjuntos preparados
puedeActualizar = hayCambios Y válido Y con permiso Y sin guardado en curso
```

La comparación es contra la última clasificación **confirmada por el servidor**, normalizada por la misma autoridad que usan el editor y el escritor, así que devolver un campo a su valor inicial deja de contar. No se compara nada volátil: ni marcas de tiempo, ni banderas de carga, ni identidad de objeto, ni URLs temporales.

Antes había **tres** respuestas inline a «¿hay algo pendiente?» —en la vista, en el modelo y en el manejador— que no podían mantenerse de acuerdo. Ahora las tres preguntan a la misma función. La autoridad también **nombra** lo pendiente, para que el footer renderizado y el sincronizado al teclear no puedan redactar el mismo estado de dos formas.

`disabled` es una cortesía, no la protección: `submitDetailChanges` vuelve a preguntar, de modo que un clic que llegue sin cambios —teclado, DOM obsoleto, doble envío— no hace nada y no escribe nada.

## El fallo que costó encontrar

La plantilla emitía el footer correctamente en todas sus capas, y el DOM no lo mostraba nunca.

Incidencias **no usa** `renderModalContent` del host compartido: tiene su propio `patchDetailModalDom`. Ese parcheador sí lleva `[data-modal-footer='true']` en su lista, pero:

1. el panel se monta con el esqueleto de **carga**, que no tiene footer;
2. la transición carga → listo sólo reconciliaba **cabecera y cuerpo**, y salía antes;
3. `replacePart` devolvía `false` para una parte que aparece por primera vez, y el bucle ignoraba el valor devuelto.

Resultado: la parte se descartaba **en silencio**.

Se intentó primero dar footer al esqueleto de carga. Lo rechazó un contrato correcto —*«loading: same structural skeleton»*—, porque hacía divergir a Incidencias del resto de dominios. **No se relajó: se revirtió.** La corrección final es la que apunta a la causa: `replacePart` sabe insertar una parte nueva en la posición que ocupa en el árbol siguiente, y la transición carga → listo reconcilia el footer como reconcilia lo demás.

## Pruebas

`tools/incidencia-update-browser-contract.mjs`, en `test:browser:ui`, en navegador real contra las plantillas y el parcheador reales:

| Caso | Resultado |
| --- | --- |
| Abrir sin tocar nada | deshabilitado, «No hay cambios pendientes.» |
| Enfocar y desenfocar | sigue deshabilitado |
| Comentario de sólo espacios | deshabilitado |
| Comentario real | habilitado, pendiente = `comment` |
| Borrar el comentario | deshabilitado |
| Sólo prioridad | habilitado, pendiente = `fields` |
| Revertir el campo | deshabilitado |
| Todo el recorrido | **cero escrituras**, sin errores de página |
| Ubicación | footer del shell, hijo directo del panel, nunca en la tarjeta de comentario |

Negativas verificadas: dejar el botón siempre habilitado dispara *«Opening the modal without touching anything leaves nothing to save»*; devolverlo al compositor dispara *«The global action is rendered in the shell footer slot»*.

Trece conductas de la autoridad pura se comprueban además sin navegador.

## Alcance

No se añaden campos editables ni capacidades nuevas, y los flujos independientes conservan su contrato. La tarjeta «Añadir actualización» se queda sólo con su contenido.

## Pendiente, declarado

Que Incidencias reimplemente el parcheo del host compartido sigue siendo una duplicación de infraestructura. Esta unidad la corrige donde dolía, sin reescribir el parcheador: eso es una unidad propia.
