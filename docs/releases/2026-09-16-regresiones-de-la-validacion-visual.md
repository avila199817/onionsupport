# Las regresiones que se vieron mirando el producto · 2026-09-16

Cinco defectos detectados en una validación visual, más el arnés que impide que vuelvan. Ninguno es una hipótesis: cada uno se reprodujo primero sobre el **build real** servido en un navegador, con el router, el registro de features, los controladores y la cascada de CSS de producción, y con la API respondiendo datos sintéticos.

Ningún importe, dato fiscal, permiso, PDF ni regla de reapertura cambia aquí.

---

## Por qué la medición anterior no valía

Un fixture que elige a mano las hojas de estilo mide **otra** aplicación. Por eso todo lo que sigue se midió sirviendo `dist/`: el `index.html` del build arrastra su propio grafo de recursos y el orden de capas es el que ve una persona, incluida `components/avatar-system.css`, que vive en `guardrails` —la última capa— y gana a `components/` y a `views/` por muy específicas que sean.

Ese arnés es ahora `tools/spa-session-harness.mjs`, y `browser-dist-contract.mjs` usa el mismo servidor y el mismo localizador de navegador: una sola forma de levantar la aplicación, no dos que puedan divergir.

---

## A · Un clic en el vacío abría una incidencia que nadie había señalado

**Medido.** Barrido de 29 zonas vacías de la lista (fondo del hero, separación entre secciones, cabecera de la tabla, barra de filtros, pie de la lista). Once de ellas abrían un detalle **real**, siempre el mismo: la primera incidencia pintada. En la sesión sintética, `GET /api/tickets/INC-SINT-4` sin que nadie hubiera pulsado INC-SINT-4.

**Causa.** El despachador global de entidad (`src/features/entity-overlay/index.js`, `click` en captura sobre `document`) pide la intención a `inferEntityIntentFromElement`. Esa función resuelve el nodo con un `closest()` que incluye `[data-route]`, y la raíz de la vista de Incidencias **es** un `[data-route]` que envuelve toda la lista. Sin identificador explícito, la identidad se deducía del texto: `textId()` busca el primer `INC-…` del `textContent` del nodo resuelto, que es el de la primera fila. Un contenedor no es un disparador, y el texto de una lista entera no es la identidad de nadie.

**Cambio.** La identidad derivada de texto queda reservada a los elementos que de verdad se pulsan: enlaces, botones, `role="button"/"link"/"menuitem"/"option"`, `summary`, enlaces del router y nodos con `tabindex` alcanzable. Un contenedor sigue aportando su ruta y sus `data-*`, pero ya no presta su texto. No se ha añadido `stopPropagation()` en ninguna parte ni se ha tocado la delegación de la vista.

**Lo que sigue funcionando** (probado): fila, teclado, icono/SVG dentro de la fila, y la lista tras filtrar y ordenar.

---

## A2 · «Nueva incidencia» dejaba de abrir hasta recargar

**Medido.** Abrir y cerrar un detalle, y después pulsar «Nueva incidencia»: el panel no aparecía. Ni `disabled`, ni `inert`, ni una capa por encima: el botón respondía y no pasaba nada. Sólo Ctrl+F5 lo devolvía a la vida.

**Causa.** El préstamo de capa («una sola capa interactiva») es asimétrico. Al abrir un detalle se ponían en cuarentena los anfitriones de modal existentes —incluido el del alta—, pero al desmontar la capa **nadie los devolvía**. `ensureModalHost()` encontraba el anfitrión en cuarentena, devolvía `null` y el alta no tenía dónde pintarse.

**Cambio.** Lo que se toma se devuelve: el préstamo recuerda **qué** anfitriones desplazó y, al desmontarse, reactiva el último que siga conectado, siempre que no quede ninguna capa viva. Sin recargas, sin temporizadores «por si acaso», sin borrar estado global y sin retirar guardas.

---

## B · Fotografías de perfil que no llegaban al detalle

Dos causas distintas, medidas por separado.

### B.1 · La imagen existía y no se veía

El detalle anida marcos: un envoltorio con nombre de avatar contiene el marco real. El sistema adoptaba **también** el envoltorio, no encontraba imagen dentro de él y lo marcaba como `fallback`; la regla de `guardrails` para ese estado pone `display: none` a las imágenes descendientes, y la imagen del marco interior —con `loading="lazy"`— nunca llegaba a cargarse: quedaba en `loading` para siempre.

**Cambio.** Un envoltorio que contiene otro anfitrión gestionado deja de reclamar estado propio: suelta el suyo y no pinta reserva sobre el marco que sí tiene la fotografía. Medido en Incidencias y en Facturas: `data-avatar-state="image"`, imagen cargada y visible.

### B.2 · Un cambio confirmado no llegaba al detalle abierto

`onDomainChanged` es la autoridad de invalidación y ya la escuchan lista, Home, barra lateral, barra superior y las cachés de API. El detalle no: la lista **aplaza** su recarga mientras hay una capa delante —y hace bien— y esa misma puerta dejaba al modal sin enterarse.

**Cambio.** Aplazar la lista y refrescar el detalle son dos efectos distintos. El detalle abierto relee su propio endpoint autoritativo con las guardas que ya tenía (`refreshDetail`, forzado y silencioso, que respeta envíos en curso y confirmaciones abiertas). Ni una caché nueva, ni un bus nuevo, ni `Date.now()` en las URLs.

### Lo que además quedó probado

- Nombre válido sin fotografía → iniciales visibles sobre fondo de color. Nunca un círculo vacío.
- Fotografía que no carga → iniciales, no un hueco.
- Carrera A→B: abrir una persona con fotografía lenta, cerrar y abrir otra; cuando la primera imagen llega, el modal de la segunda sigue mostrando **su** identidad.

---

## C · La lista hablaba dos idiomas

**Medido** con ocho incidencias sintéticas: `Technical`, `Billing`, `Network`, `Documentation`, `Sales`, `Access` en las píldoras de categoría, y en los valores que la lista no reconoce, el token del backend en crudo: `awaiting_customer`, `trivial`.

**Cambio.** La píldora de categoría consulta `incidenciaCategoryLabel`, la misma autoridad que ya usaban el detalle y los selectores. Estado y prioridad conservan los mapas de la lista —que no son una traducción, sino su modelo de agrupación— y delegan en la autoridad de dominio **sólo** cuando no reconocen el valor.

**Por qué no se unifican a ciegas.** Medido sobre la propia autoridad: `incidenciaStatusLabel("in_progress")` devuelve «Abierta» donde la lista dice «En proceso», y `incidenciaStatusLabel("archived")` devuelve «Archived» donde la lista dice «Cerrada». Sustituir los mapas degradaría lo que hoy se lee bien. La etiqueta no es el sitio donde recortar una taxonomía.

Un valor que la aplicación no declara se hace **legible** («Chimney Sweeping», «Trivial»), no se traduce: el contenido libre de una persona no se reescribe.

---

## D · El botón «Valoraciones» no tenía icono

**Medido.** El `<svg>` estaba en el DOM, ocupaba sus 16×16 px y no pintaba un solo trazo: `stroke: none`, `fill: none`.

**Causa.** El registro de iconos de `facturas-paid-confirm` emite marcado sin atributos de pintura porque sus consumidores son los nodos `.fpc-*`, cuya hoja les da `fill`, `stroke` y grosor. El botón de reintento, en cambio, vive en el pie del detalle de Facturas como `.facturas-detail-btn-icon`, donde la única regla aplicable fija tamaño y no pintura; con `svg:not([fill]) { fill: none }` del reset y el trazo por defecto en `none`, el icono era un hueco. Además, el icono era un **check**, no una valoración, y al pasar la factura a completada sólo se reescribía el texto: el nombre accesible seguía diciendo «Finalizar factura pagada» mientras se leía «Valoraciones».

**Cambio.** El trazo viaja con el icono (los atributos de presentación ceden ante cualquier regla CSS, así que las hojas `.fpc-*` siguen mandando donde ya mandaban), se incorpora **una sola vez** la estrella al registro existente, y una única función decide etiqueta, icono, `title` y nombre accesible, tanto al crear el botón como al actualizarlo. Ninguna librería ni recurso externo.

Medido junto a sus vecinos del mismo pie: 16×16 px, grosor 2, extremos redondeados, alineado al centro del botón y del color del texto.

---

## E · El recorrido que no se puede perder

`tools/spa-session-contract.mjs` abre la aplicación **una vez** y recorre dieciséis pasos sin recargar el documento: listar, barrer el vacío, abrir por identidad, leer etiquetas, comprobar avatar e iniciales, escribir un borrador, fijar una posición de lectura, abrir una capa superior, **cambiar su contenido**, cerrarla, comprobar que la lectura y el borrador siguen ahí, cerrar el detalle, abrir y cancelar el alta tres veces, volver a abrir un detalle, ver la fotografía vigente y llegar a Facturas por el router.

Invariantes de toda la sesión: **un** documento, cero peticiones fuera del origen, cero errores de página y cero escrituras de dominio.

Siete pruebas negativas acompañan al recorrido:

| | Impide que… | Hoy |
| --- | --- | --- |
| N1 | un clic sin identidad resuelva al primer registro | reproduce el defecto A |
| N2 | cancelar un alta deje bloqueada la siguiente | reproduce el defecto A2 |
| N3 | se reutilice una instancia o una señal ya abortada | guarda |
| N4 | se ignore la fotografía vigente al abrir | guarda |
| N5 | un token del backend se lea en la lista | reproduce el defecto C |
| N6 | el icono de una acción desaparezca | reproduce el defecto D |
| N7 | se pierdan la posición de lectura o el borrador | guarda |

«Reproduce» significa comprobado: retirando la corrección y reconstruyendo, la prueba falla; con ella, pasa.

Dos disciplinas del arnés, porque sin ellas la prueba mentiría:

- Se pulsa **dentro de la página** cuando después hay que juzgar el desplazamiento: si Playwright llevara el elemento a la vista, su propio desplazamiento se confundiría con el de la aplicación. Y se pulsa **con el ratón de verdad** donde lo que se juzga es si algo tapa un botón: un clic sintético atraviesa una capa invisible sin enterarse.
- Se espera un **estado observable**, nunca un número de milisegundos elegido a ojo.

La propagación de un cambio confirmado a un detalle abierto (B.2) se prueba en `tools/private-create-refresh-contract.mjs`, sobre las funciones de producción extraídas del módulo: sin detalle abierto no se pide nada, con detalle abierto se relee una vez y la lista sigue aplazada.

---

## Lo que NO se ha tocado

- Botón global «Actualizar incidencia», detección de cambios, borrador ante error y reconciliación de adjuntos.
- Aislamiento del padre, restauración del foco y el ojo del técnico.
- Pie compartido, cabeceras y avatares de la misma variante, ancho útil de Facturas, IRPF y lectura del IVA.
- Importes, precisión, redondeos, datos fiscales, PDFs, permisos y semántica del botón de cobro.
- Vite, el router y el sistema modal.

## Límites conocidos

- La propagación del cambio de fotografía al **detalle abierto** está resuelta en Incidencias. Facturas, Clientes y Usuarios no tienen hoy una relectura de detalle reutilizable, y releer una factura tocaría la instantánea fiscal del cliente, que es histórica: queda declarado, no improvisado.
- La aceptación visual de **producción** no se ha hecho: el proxy de salida sigue rechazando la navegación. Lo que aquí se afirma está medido sobre el build local servido en un navegador.
