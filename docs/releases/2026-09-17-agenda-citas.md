# Agenda · el calendario deja de ser una maqueta y pasa a tener citas reales · 2026-09-17

## Qué había

`/agenda` pintaba un calendario mensual correcto y **sin datos**: su propia cabecera lo declaraba, «PRODUCTIVO · CORREO FULL-VIEW PARITY · SIN API». Estado en memoria, ninguna petición, ningún almacenamiento, y un inspector que decía «Las visitas, citas y trabajos de este día aparecerán aquí cuando conectemos los datos».

## Qué hay ahora

El recorrido completo, con persistencia real en Cosmos y permisos reales:

**pincho un día → aparece el «+» → abro «Crear cita» → elijo usuario, hora y lugar → guardo una vez → la cita aparece y permanece → el destinatario recibe la comunicación o el administrador ve el fallo real → el usuario entra en su cuenta y ve su cita → otro usuario no puede verla.**

El backend (entidad, partición, idempotencia, concurrencia, permisos, plantillas y outbox) vive en [`oniontech/docs/production/2026-09-17-agenda-citas-v1.md`](https://github.com/avila199817/oniontech/blob/main/docs/production/2026-09-17-agenda-citas-v1.md). Aquí se documenta el frontend.

## La casilla deja de ser un botón

No se puede meter un `<button>` dentro de otro `<button>`, y la casilla lo era. Ahora es un contenedor `role="gridcell"` con **tres hermanos**, nunca anidados:

| Pieza | Qué hace |
|---|---|
| `.agenda-day-surface` | botón transparente que cubre la casilla (`inset: 0`, `z-index: 0`); es el objetivo de clic y de teclado para **seleccionar el día** |
| `.agenda-day-number` | el número, por encima y con `pointer-events: none`, así que un clic sobre él llega a la superficie |
| `.agenda-day-create` | la caja del «+», arriba a la derecha, fuera del flujo: **no desplaza el número** |
| `.agenda-day-events` | las citas, cada una su propio botón |

Al ser hermanos, **ningún clic viaja de un botón a otro**: pulsar la casilla selecciona, pulsar «+» abre el alta y pulsar una cita abre ESA cita. No hay dos diálogos por propagación.

El «+» aparece **por selección**, no sólo por hover (`.agenda-day.is-selected .agenda-day-create`), que es lo que lo hace utilizable con teclado y en pantallas táctiles, donde no hay hover. Su `tabindex` es `0` sólo en la casilla seleccionada, para no meter 42 paradas de tabulación en la rejilla. Su nombre accesible es la fecha completa: «Crear cita para el jueves 17 de septiembre de 2026».

El «+» sólo se pinta si el servidor dice `puedeCrear`. **La autorización real la decide el backend**; ocultar un botón no es un control.

## La fecha sale del modelo, nunca del texto

Cada celda declara su clave civil `AAAA-MM-DD` y la lleva en `data-agenda-date`. El alta recibe esa clave, no el número pintado ni el mes visible: por eso un día adyacente de otro mes abre «Crear cita» con **su** mes y **su** año. No hay ningún `septiembre de 2026` escrito en el código.

`src/views/agenda/agenda.dates.js` es la autoridad. Sus tres presets declaran `timeZone: "UTC"` y siempre formatean un instante construido con `Date.UTC` a partir de la fecha civil, así que **la etiqueta es una función pura del día**: un navegador en Tokio y otro en Madrid leen exactamente el mismo texto. Los formateadores siguen saliendo de `core/format.js`; sólo el juego de opciones es de esta vista, como manda esa autoridad.

Medido en cinco zonas: `Europe/Madrid`, `UTC`, `Pacific/Kiritimati`, `Asia/Tokyo` y `America/Los_Angeles` producen `Jueves, 17 de septiembre de 2026` y `Jueves, 1 de enero de 2026`.

## El modal es el de siempre

Ninguna pieza de infraestructura es nueva. «Crear cita» y el detalle usan `renderModalShell`, `renderModalCloseButton`, `renderModalState`, `createModalHost`, `renderModalContent`, `createModalLifecycle` y `openModalConfirmation`, exactamente como las otras cuatro altas y los cuatro detalles. Cambia el contenido, no la infraestructura:

- alta: `data-modal-size="form"`, altura `auto`, acción principal en el slot `footer` con `form=` (el pie compartido del 2026-09-16), composición de altas `inc-create-*`;
- detalle: tamaño `compact`, altura `auto`, estados de carga y error del shell;
- salida con borrador: `openModalConfirmation`, la misma confirmación asíncrona que usan las de Facturas.

`tools/modal-shell-contract.mjs` pasa de 14 a 17 consumidores del shell.

## El selector de usuario se reutiliza, no se copia

El combobox accesible (teclado, ARIA, `aria-activedescendant`, IME, Enter que no envía el formulario, Escape que cierra el popup antes que el diálogo) estaba atado por selector al alta de Incidencias. Su raíz pasa a ser un **marcador compartido**, `data-create-user-picker-root`, que Incidencias declara junto a su marca de dominio y Agenda declara también.

Es toda la intervención sobre Incidencias: **un atributo añadido y una constante generalizada**. Ningún comportamiento suyo cambia, y sus tres contratos de alta (combobox, selección de usuario y validación) pasan sin tocarlos.

La **presentación** del selector, en cambio, es de cada alta y vive en su hoja de ruta, como hace Clientes con sus `cli-create-user-*`. Agenda emite sus `agenda-create-user-*` junto a las clases prestadas y las estiliza en `views/agenda/index.css`: así `/agenda` **no depende de la hoja de Incidencias**, que su ruta no carga. Separar así comportamiento y presentación es lo que permite compartir la autoridad sin compartir hojas de estilo.

La búsqueda usa el **mismo endpoint autorizado** (`/api/users`) con la misma forma de consulta. Agenda no arrastra el módulo de Incidencias a su chunk: su frontera HTTP es propia y pequeña. La selección es por identificador estable; un texto escrito **no** habilita la acción principal, y una respuesta tardía no puede sustituir a la búsqueda vigente (secuencia + `AbortController`).

## Guardar una vez

- El botón principal se deshabilita si faltan los cuatro datos obligatorios, **y el manejador vuelve a validar**: `disabled` no es la única protección.
- Cada apertura del alta genera **una** clave de idempotencia que se reutiliza en todos sus intentos, así que un doble clic o un reintento tras un timeout no crean dos citas. Además, una petición en curso bloquea la siguiente.
- El éxito sólo se muestra **después** de confirmar la persistencia; el diálogo se cierra con el resultado del servidor, y el calendario se recarga con el rango visible, sin recargar la SPA.
- Ante error, **el borrador se conserva** para corregir y reintentar.
- Si el instante ya pasó, el backend responde `409 CITA_EN_PASADO` y la interfaz **avisa y pide confirmación explícita**; nunca mueve la fecha a hoy.

## Lo que ve cada rol

Lo decide la proyección del backend, no el cliente. El usuario recibe día, hora, zona, lugar, nota y estado; **no** recibe `userId`, ni organizador, ni `etag`, ni el estado de la notificación, así que el detalle no puede pintarlos aunque quisiera. Sin `etag` tampoco podría mutar, y las acciones de gestión no se emiten.

## Caché

`agenda.api.js` recuerda la última respuesta por `(identidad, rango)`. No sustituye a la persistencia: se invalida entera al crear, editar o cancelar, se limpia al cambiar de identidad, y una respuesta de otro rango no puede sustituir al vigente porque el rango está en la clave. Además el controlador descarta por número de secuencia cualquier respuesta que llegue tarde tras un cambio de mes.

Si el servidor declara `truncado`, el inspector lo dice: **un calendario incompleto no se presenta como completo**.

## Pruebas

| Contrato | Qué fija |
|---|---|
| `tools/agenda-citas-contract.mjs` (en `validate:source`) | 8 bloques: rejilla con la fecha real de cada celda incluidos los meses adyacentes, cruce de año, bisiestos, claves civiles, etiqueta idéntica en cuatro zonas, proyección por rol que el cliente no rellena, orden estable, mensajes por la autoridad de presentación (un 5xx no filtra detalle) y habilitación de la acción principal |
| `tools/agenda-citas-browser-contract.mjs` (en `test:browser:ui`) | 11 escenarios con el **build real** (controlador, plantillas, sistema modal y cascada CSS de producción) y **sólo la red aislada**: el «+» por selección sin mover el número, día adyacente con su fecha correcta, alta con una sola persistencia, doble clic sin duplicar, recarga, varias citas con orden y «+N más», el usuario sin acciones de gestión, editar y cancelar con `If-Match`, enlace `?citaId=`, ciclo montar/desmontar sin residuos y móvil a 390 px |

Ningún contrato envía correo ni toca datos de cliente.

## Presupuestos medidos

El cierre bootstrap/Home pasa de **218567** a **218698** raw bytes (+131). Los cinco chunks raíz (`main`, `app`, `enhancements` y los dos `home`) son **byte a byte idénticos** a `main`: el crecimiento son listas de precarga dentro de `routes`, porque la ruta `/agenda` ahora depende del sistema modal compartido y del combobox. La reutilización es la regla, no el payload. El techo pasa a 218750, dejando 52 bytes. Incidencias **encoge** 3.511 bytes, porque el combobox se extrae a un chunk compartido.

El baseline de superficie exportada de Agenda pasa de 1 a 52, a conciencia: Agenda deja de ser una vista sin datos y pasa a ser un dominio con frontera HTTP, autoridad de fecha y dos plantillas de diálogo. Cada exportación tiene consumidor.

## Limitaciones declaradas

- El texto plano de **todos** los correos de Onion Support sale en una sola línea: `normalizeRendererOutput` aplica `safeText` a esa alternativa. Las citas heredan ese comportamiento; la información está completa, incluido el enlace. Corregirlo es un cambio de una línea en la autoridad compartida que altera Incidencias y Facturas, y queda fuera de esta entrega.
- El contrato de navegador aísla la red con un doble; **no acredita** un recorrido autenticado contra el backend de producción.
- La Agenda del rol usuario reutiliza la misma vista. No hay vista de semana ni de día: la V1 es mensual.
