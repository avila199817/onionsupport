# Sistema compartido de modales

La apertura de detalle de Home, listas, relaciones, teclado y APIs públicas pertenece a `src/features/entity-overlay/index.js` (`entity-overlay.v5-single-detail-session`). La interacción de todos los diálogos pertenece a `modal-lifecycle.js` en ese mismo directorio. Los controladores de dominio conservan formularios, peticiones, confirmaciones y templates.

Estado de publicación y evidencia de esta revisión: [entrega del 2026-09-08](releases/2026-09-08-single-modal-session.md).

## Apertura de entidades

```js
import { EntityOverlay } from "../../features/entity-overlay/index.js";

await EntityOverlay.open({
  type: "incidencia", // factura | incidencia | cliente | usuario
  id: ticketId,
  opener: triggerElement,
  originHost: routeHost, // host conectado de la vista comprometida
});
```

`originHost` es opcional: el dispatcher lo resuelve desde el disparador o la vista comprometida. Un disparador retirado o un host todavía en montaje no puede adoptar otra página como origen. `signal` permite vincular la apertura a una cancelación externa. Los disparadores HTML de Home se generan en `src/views/home/home.template.activity.js`; `intent.js` interpreta sólo intenciones semánticas de apertura. Descargar, enviar y otros comandos pertenecen a su controlador.

La apertura no cambia la vista ni escribe historial. Repetir la misma entidad y origen reutiliza la operación existente. Abrir otra entidad solicita primero el cierre al controlador actual; una operación pendiente o la confirmación de un borrador pueden impedir la sustitución. La sesión contiene como máximo un detalle de entidad, aunque ese detalle pueda abrir una confirmación anidada mediante el lifecycle compartido.

| Tipo | Entrada pública que delega en `EntityOverlay.open` | Factory de detalle, reservada al dispatcher |
| --- | --- | --- |
| `factura` | `src/views/facturas/index.js`: `openFacturaDetailById` | `createFacturaDetailController` |
| `incidencia` | `src/views/incidencias/index.js`: `openIncidenciaDetailById` | `createIncidenciaDetailController` |
| `cliente` | `src/views/clientes/index.js`: `openCliente` | `createClienteDetailController` |
| `usuario` | `src/views/usuarios/index.js`: `openUsuario` | `createUsuarioDetailController` |

Las factories montan el mismo controlador de dominio en modo `detailOnly`. No montan listas ni hosts de rutas ocultos. `EntityOverlay.preload(type)` prepara módulos y estilos; `entity-intent-preload` lo invoca por intención de hover/foco sin pedir datos de detalle.

## Contrato entre sesión y controlador

El dispatcher crea la sesión y su `AsyncScope` antes de importar el dominio. Entrega el `signal` y estos callbacks:

| Callback | Responsabilidad |
| --- | --- |
| `onDetailShell({ modalHost })` o `onDetailShell({ host })` | El panel del dominio ya está montado. Se retira la superficie temporal de carga y los clics de ese host quedan bajo su controlador. |
| `onDetailClosed()` | El cierre ya aceptado termina la sesión, destruye el controlador y permite recuperar el foco del origen. |
| `openEntityDetail({ type, id, opener })` | Una relación vuelve al dispatcher y conserva un disparador de la página de origen. No mantiene una pila de entidades anterior. |

El controlador expone su método de apertura (`openFactura` o `openDetail`), `closeDetailModal()`, `getSnapshot().detailModalOpen` y `destroy()`. La política de cierre permanece en `closeDetailModal()`: ni Escape, ni backdrop, ni la sustitución por otra entidad pueden saltársela.

El Router llama a `releaseOrigin(previousHost)` al confirmar la sustitución de la vista y durante su teardown. Un fallo al montar la ruta siguiente conserva el modal de la vista vigente. `activateOrigin(nextHost)` interpreta enlaces heredados con `entity` y `entityId` sólo después del commit de ese host, sin introducir otro router.

Las listas consultan `isOriginOpen(host)` y se suscriben a `subscribe(({ phase, type, id, originHost }) => ...)`, con fases `opened` y `closed`. Mientras su detalle está abierto aplazan la reconciliación; al cerrar aplican los cambios confirmados. Cada lista elimina la suscripción al desmontarse. La sesión recupera el foco mediante el ID de entidad si el nodo que abrió el modal fue reemplazado.

## Peticiones y estabilidad del panel

Hay una sola invocación inicial a la API de detalle por apertura, incluso con doble clic. El controlador es dueño de esa petición y de su resultado. Cancelación y comprobación de vigencia impiden que una respuesta tardía pinte después del cierre, de otra selección o de un cambio de vista.

En Incidencias y Facturas, el panel de dominio conserva su identidad física durante carga, datos, error, reintento y refresco. Se actualizan sus slots; no se sustituye el panel conectado. El indicador temporal anterior a la carga del módulo es otra superficie y se retira cuando se recibe `onDetailShell`. Clientes y Usuarios entregan sus templates reales al completar su lectura.

En Incidencias, `src/views/incidencias/index.impl.js` posee `requestDetail` y `refreshDetail`. Las llamadas concurrentes para el mismo ID comparten la promesa activa. La frontera `src/views/incidencias/index.js` usa `onDetailBeforePatch` para conservar el compositor y `onDetailRendered` para distribuir el mismo resultado a estado, live sync y avatares de comentarios/seguimiento. Esas mejoras no vuelven a leer el detalle ni mantienen otra autoridad de mutación. Las señales de refresco vuelven a `controller.refreshDetail`, conservando borradores y archivos pendientes.

Para futuras modificaciones, cambiar el dispatcher cuando cambie la apertura, el lifecycle cuando cambie la interacción o el controlador cuando cambie el dominio. No reintroducir `home-entity-modal`, `factura-modal-bridge`, `incidencia-modal-bridge`, `facturas-incidencia-modal`, adaptadores de detalle de lectura, historial modal, ramas de apertura según ruta o lecturas de detalle desde mejoras visuales. El contrato `private_domain_owner_contract.mjs` fija estas fronteras.

## Lifecycle de interacción compartido

El lifecycle compartido controla:

- una pila de diálogos por documento y un listener de teclado mientras exista algún diálogo activo;
- Escape exclusivamente para el diálogo superior, respetando la política de cierre del controlador;
- Tab y Shift+Tab entre controles visibles y habilitados;
- bloqueo de scroll con propietarios, conservación de clases previas y restauración exacta de estilos inline;
- devolución segura de foco, sin moverlo fuera de otro diálogo abierto;
- limpieza de registros y bloqueo cuando se desmonta una vista.

La resolución de un botón de retorno que se ha vuelto a renderizar, el scroll del visor de adjuntos y la selección de texto del formulario siguen siendo responsabilidades del propietario. No son motores de modal alternativos.

## Integraciones

| Superficie | Propietario del contenido y las acciones |
| --- | --- |
| Preferencias de consentimiento Google | `analytics/google-tag.js` |
| Entidades transversales | `features/entity-overlay/index.js` |
| Incidencias: alta, detalle y confirmaciones internas | `views/incidencias/index.impl.js` |
| Facturas: alta, detalle y confirmación de reenvío | `views/facturas/index.js` |
| Confirmación de cobro | `features/facturas-paid-confirm/index.js` |
| Clientes: alta y detalle | `views/clientes/clientes.create-controller.js`, `clientes.template.modal.js` |
| Usuarios: alta y detalle | `views/usuarios/usuarios.template.create.js`, `usuarios.template.modal.js` |
| Correo: redacción, firma y confirmaciones | `views/correo/index.js` |
| Perfil del técnico | `features/incidencias-technician-profile/index.js` |
| Visor de adjuntos | `features/incidencias-video-preview/core.js` |

Los menús desplegables, comboboxes y la navegación móvil mantienen sus interacciones semánticas. El listener compartido permite que un combobox consuma Escape antes de cerrar su diálogo.

## Uso

```js
const lifecycle = createModalLifecycle({
  getPanel: () => host.querySelector('[role="dialog"]'),
  onEscape: () => { if (!submitting) closeDialog(); },
  bodyClasses: ['feature-dialog-open'],
});

// Después de insertar el panel conectado al documento.
lifecycle.activate({ opener: document.activeElement });

// Al cerrar o destruir; no modifica el contenido del formulario.
lifecycle.deactivate();
```

`getPanel` se evalúa de forma diferida para soportar un rerender síncrono del mismo diálogo. Activar un panel inexistente o desconectado no bloquea la página. Repetir `activate` actualiza las clases sin crear entradas duplicadas. `onDetached` permite resolver una confirmación pendiente si el propietario desaparece; un error de esa limpieza no impide liberar otros registros.

El propietario debe insertar el diálogo antes de activarlo y liberar su lifecycle durante su teardown normal. El observer compartido es una protección final ante DOM retirado externamente.

## Verificación

Gate completo de una entrega, con Node `22.23.2`, npm `10.9.8` y dependencias del lockfile:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run validate:ci
```

Los contratos de navegador necesitan Chrome/Chromium; indicar su ejecutable con `CHROME_BIN` si no se detecta automáticamente. Para aislar una regresión de apertura o identidad:

```bash
node tools/private-domain-contracts.mjs --browser
node .github/scripts/modal_lifecycle_contract.mjs
node .github/scripts/incidencias_comment_avatar_runtime_contract.mjs
```

`private-domain-contracts.mjs --browser` ejecuta los contratos de propietarios, identidad de usuario, contadores de Home, eventos de dominio y la matriz de controladores reales de los cuatro dominios. El registro de release conserva los resultados de la revisión concreta. Las fronteras de sesión/API usan datos sintéticos y no acreditan un recorrido autenticado contra el backend de producción.

`.github/scripts/modal_lifecycle_contract.mjs` ejecuta en Chromium escenarios de anidamiento, cierre en orden inverso, guardas de operación pendiente, foco visible, diálogos vacíos, combobox, rerender, desmontaje y eliminación de listeners. También abre los módulos reales de Usuarios, Clientes y confirmación de reenvío de Facturas. Comprueba además consentimiento Google denegado antes de configurar etiquetas, exclusión de rutas privadas, saneamiento de URLs y foco/teclado del diálogo real de preferencias. Las solicitudes Google se interceptan localmente. No realiza mutaciones de dominio ni envía correos.

## Attachment owner lifecycle and Home identifiers

Ticket attachments share the same detail owner whether opened from Home, a
list or an invoice relation. `prepareIncidenciaDetail()` loads the thumbnail and
viewer modules without installing them. The Incidencias boundary passes its
exclusive, active modal host to their `mount(host)` methods when the detail is
rendered; close/disposal calls `destroy(host)` before removing that host. A
stale controller cannot dispose a newer owner's media session. Thumbnail,
viewer and gallery observers are confined to that host, not the route tree or
an automatically discovered global host. Gallery and viewer are composed by
the existing attachment feature; the ticket controller remains the authority
for `/view`, preview state, errors and close actions.

`core/entity-identity.js` selects the record ID used by Home and by the actual
Incidencias/Facturas controllers. Home projects `entityId` separately from
`displayId`; legal invoice numbers remain visible but never replace an existing
record ID. Truncation for presentation must not truncate a modal request target.

Regression coverage lives in `tools/home-entity-identity-contract.mjs` and
`tools/spa-modal-regression.mjs`, integrated into `private-domain-contracts.mjs`.
The browser harness uses production templates/controllers/features and isolates
only HTTP/session boundaries. It covers real Home markup, nested clicks, media
at desktop/mobile widths, gallery, close/focus/scroll, permission errors, late
responses and owner replacement. These tests are not a claim of authenticated
verification against production data.
