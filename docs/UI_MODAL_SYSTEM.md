# Sistema compartido de modales

La apertura de detalle de Home, listas, relaciones, teclado y APIs públicas pertenece a `src/features/entity-overlay/index.js` (`entity-overlay.v5-single-detail-session`). La interacción de todos los diálogos pertenece a `modal-lifecycle.js` en ese mismo directorio. Los controladores de dominio conservan formularios, peticiones, confirmaciones y templates.

La [entrega del 2026-09-08](releases/2026-09-08-single-modal-session.md) centraliza la sesión. La [consolidación privada del 2026-09-12](releases/2026-09-12-private-centralization.md) comparte el montaje y la actualización DOM, añade confirmaciones comunes e invalida el detalle al cambiar de sesión.

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

La invalidación de sesión de Core fuerza el desmontaje del detalle, incluido un módulo todavía en carga. Esta frontera no consulta la guarda de borrador de una sesión que ya ha terminado ni devuelve el foco a contenido de esa cuenta. Una respuesta tardía no puede recuperar el panel.

Las listas consultan `isOriginOpen(host)` y se suscriben a `subscribe(({ phase, type, id, originHost }) => ...)`, con fases `opened` y `closed`. Mientras su detalle está abierto aplazan la reconciliación; al cerrar aplican los cambios confirmados. Cada lista elimina la suscripción al desmontarse. La sesión recupera el foco mediante el ID de entidad si el nodo que abrió el modal fue reemplazado.

## Peticiones y estabilidad del panel

Hay una sola invocación inicial a la API de detalle por apertura, incluso con doble clic. El controlador es dueño de esa petición y de su resultado. Cancelación y comprobación de vigencia impiden que una respuesta tardía pinte después del cierre, de otra selección o de un cambio de vista.

En Incidencias y Facturas, el panel de dominio conserva su identidad física durante carga, datos, error, reintento y refresco. Se actualizan sus slots; no se sustituye el panel conectado. El indicador temporal anterior a la carga del módulo es otra superficie y se retira cuando se recibe `onDetailShell`. Clientes y Usuarios entregan sus templates reales al completar su lectura.

En Incidencias, `src/views/incidencias/index.impl.js` posee `requestDetail` y `refreshDetail`. Las llamadas concurrentes para el mismo ID comparten la promesa activa. La frontera `src/views/incidencias/index.js` usa `onDetailBeforePatch` para conservar el compositor y `onDetailRendered` para distribuir el mismo resultado a estado, live sync y avatares de comentarios/seguimiento. Esas mejoras no vuelven a leer el detalle ni mantienen otra autoridad de mutación. Las señales de refresco vuelven a `controller.refreshDetail`, conservando borradores y archivos pendientes.

Para futuras modificaciones, cambiar el dispatcher cuando cambie la apertura, el lifecycle cuando cambie la interacción o el controlador cuando cambie el dominio. No reintroducir `home-entity-modal`, `factura-modal-bridge`, `incidencia-modal-bridge`, `facturas-incidencia-modal`, adaptadores de detalle de lectura, historial modal, ramas de apertura según ruta o lecturas de detalle desde mejoras visuales. El contrato `private_domain_owner_contract.mjs` fija estas fronteras.

## Shell canónico y CSS estructural

Desde la [consolidación del 2026-09-15](releases/2026-09-15-modal-shell-authority.md) el sistema modal es un solo conjunto de piezas; ninguna feature reconstruye una de ellas:

| Responsabilidad | Autoridad | Qué entrega |
| --- | --- | --- |
| Estructura DOM, ARIA, tamaños, botón cerrar, estados de carga/error/vacío | `src/features/entity-overlay/modal-host.js` (`ui-modal-shell.v1`) | `renderModalShell`, `renderModalCloseButton`, `renderModalState`, `MODAL_SHELL_SELECTORS`, `MODAL_SIZES`, `MODAL_HEIGHTS` |
| CSS estructural (root, overlay, panel, header, body, footer, estados, responsive, movimiento reducido, forced-colors, impresión) | `src/css/components/detail-modal.css` (namespace `ui-detail-modal-*`) | Se importa con el área privada (`app.css` y `private.css`, layer `components`); ninguna ruta ni dispatcher lo carga aparte |
| Escape, Tab, click exterior, scroll, foco de retorno, clases de `body` | `src/features/entity-overlay/modal-lifecycle.js` | `createModalLifecycle({ getPanel, onEscape, onBackdrop, bodyClasses })` |
| Portal y actualización del panel | `src/features/entity-overlay/modal-host.js` | `createModalHost`, `renderModalContent` |
| Confirmaciones | `src/features/entity-overlay/modal-confirmation.js` | `openModalConfirmation` |
| Sesión de detalle de entidad | `src/features/entity-overlay/index.js` | `EntityOverlay.open`; su superficie de carga/error usa el mismo shell |

Estructura que emite el shell, la única válida para un diálogo privado:

```html
<section class="ui-detail-modal-root" data-modal-shell="ui-modal-shell.v1" data-modal-size="detail|wide|form|compact|confirm|stage" data-modal-height="fixed|auto" data-open="true" …identidad del dominio…>
  <div class="ui-detail-modal-overlay" data-modal-overlay="true">
    <div class="ui-detail-modal-panel" role="dialog|alertdialog" aria-modal="true" aria-labelledby|aria-label tabindex="-1" data-modal-panel="true">
      <!-- prelude: confirmaciones anidadas y velos de ocupado del dominio -->
      <header class="ui-detail-modal-header" data-modal-header="true">…</header>
      <main class="ui-detail-modal-body" data-modal-body="true">…</main>
      <footer class="ui-detail-modal-footer" data-modal-footer="true">…</footer> <!-- opcional -->
    </div>
  </div>
</section>
```

Reglas para un dominio:

- Entrega contenido, campos, acciones, permisos, textos y sus `data-*` de identidad (`rootAttributes`, `overlayAttributes`, `panelAttributes`). No emite `role="dialog"`, backdrop, cierre ni bloqueo de scroll propios.
- Una diferencia legítima se expresa con `data-modal-size` / `data-modal-height`, con un token `--ui-detail-modal-*` en su clase raíz o con una clase semántica del contenido; nunca con otra hoja de shell ni con `!important`.
- El click exterior llega por `onBackdrop` del lifecycle; el dominio decide si cierra (borradores, peticiones en curso), igual que con Escape.
- El botón cerrar del shell es hijo directo del header y ocupa su esquina superior derecha en todas las anchuras, sea cual sea la altura del contenido que tiene al lado. Sólo un header que compone su propia fila de acciones (detalle de Incidencias, con el cierre dentro de la fila) apila sus bloques por debajo de 980 px.
- `data-modal-height="auto"` hace que el panel crezca con su contenido hasta el tope de su tamaño (las altas lo declaran: la composición retirada las dimensionaba igual); en teléfonos todo diálogo, `auto` incluido, ocupa la pantalla completa.
- Su CSS estiliza únicamente el contenido interno. `tools/modal-shell-contract.mjs` mantiene el inventario completo de reglas `position: fixed` fuera de la autoridad: cada shell histórico lleva la unidad que lo retira y cada capa no modal (chrome, loader, toasts, landing pública) su motivo; una regla nueva o una entrada que ya no existe hacen fallar la CI. También comprueba que ninguna hoja fuera de la autoridad reestiliza las clases estructurales del shell (root, overlay, panel, header, body, footer, botón cerrar): una altura o anchura propia se declara como variante o como token `--ui-detail-modal-*` en la raíz del dominio, como hacen Clientes, Correo y el perfil del técnico.

Estado de la familia (se actualiza en cada unidad):

| Superficie | Estado |
| --- | --- |
| Dispatcher de entidades (carga / error) | shell canónico |
| Perfil del técnico | shell canónico (`renderModalShell`, altura `auto` con su tope de 720 px declarado como token `--ui-detail-modal-panel-height` en la raíz), botón cerrar del shell, click exterior por el lifecycle; `style.css` estiliza sólo el contenido |
| Detalle de Usuarios | shell canónico (`renderModalShell`), botón cerrar del shell, click exterior por el lifecycle; sin CSS estructural propio (`views/usuarios/index.css` no estiliza el diálogo) |
| Detalle de Incidencias | shell canónico: `renderModalShell` (carga, error y detalle), botón cerrar del shell, click exterior por el lifecycle; el dominio conserva `incidencias-modal-root` como ámbito de su contenido |
| Alta de Incidencias | shell canónico (`renderModalShell`, variante `data-modal-size="form"`; el modo cliente ajusta la anchura por token en `inc-create-root.is-client`), botón cerrar del shell, click exterior por el lifecycle; `private-create-modal.css` conserva sólo el contenido del formulario y la tipografía de título y subtítulo de las cuatro altas |
| Detalle de Facturas | shell canónico (`renderModalShell`, variante `data-modal-size="wide"`), botón cerrar del shell, estados de carga y error compartidos, click exterior por el lifecycle; el dominio conserva `facturas-detail-modal-root` como ámbito de su contenido |
| Alta de Facturas | shell canónico (`renderModalShell`, variante `data-modal-size="form"`), botón cerrar del shell, click exterior por el lifecycle; `create.css` estiliza sólo el formulario |
| Confirmaciones de reenvío y de cobro de Facturas | shell canónico a través de `openModalConfirmation` (`role="alertdialog"`, tamaño `confirm`, altura `auto`, acciones en el slot `footer`); el click exterior llega por el lifecycle |
| Registro de cobro de Facturas (flujo `fpc-*`) | shell canónico (`renderModalShell`, tamaño `compact`, altura `auto`), botón cerrar del shell, click exterior por el lifecycle; en móvil ocupa la pantalla como el resto de diálogos (antes era una hoja inferior) |
| Alta de Clientes | shell canónico (`renderModalShell`, variante `data-modal-size="form"`), botón cerrar del shell, click exterior por el lifecycle; `create.css` estiliza sólo el formulario y conserva el préstamo de clases de contenido `inc-create-*` que resuelve la composición de altas |
| Detalle de Clientes | shell canónico (`renderModalShell`; su anchura de 1080 px es un token `--ui-detail-modal-panel-width` en `clientes-modal-root`), botón cerrar del shell, click exterior por el lifecycle; el contenido usa sólo sus clases `clientes-modal-*` más el icono de acción del shell (`ui-detail-modal-action-icon`); los alias `incidencias-modal-*` / `incidencias-timeline-*`, que la ruta /clientes no carga, se retiraron |
| Alta de Usuarios | shell canónico (`renderModalShell`, variante `data-modal-size="form"`, altura `auto`), botón cerrar del shell, click exterior por el lifecycle; `private-create-modal.css` queda como autoridad del contenido y de la tipografía de título y subtítulo de las cuatro altas |
| Correo (redacción, firma, confirmación) | shell canónico dentro del host inline de la ruta: redacción con geometría de ventana (840 × 650 px) y firma con su paleta (oscura por defecto, clara en tema claro) declaradas como tokens `--ui-detail-modal-*` / `--surface-2` en sus clases raíz, confirmación `alertdialog` de tamaño `confirm`; click exterior por el lifecycle |
| Visor de adjuntos | shell canónico (`renderModalShell`, tamaño `stage`: el panel no pinta chrome y centra la tarjeta del visor, que conserva su cabecera, su frame, la galería y el anclaje de scroll propio); backdrop más tenue que el del detalle declarado como token `--incidencias-media-viewer-overlay-bg`; Escape y click exterior por el lifecycle |
| Consentimiento Google | excepción: página pública, sin CSS privado |

## Mapa canónico de la familia modal (corte 2026-09-15)

Una responsabilidad, una autoridad, un contrato, muchos consumidores. Ningún diálogo privado emite ya su propia estructura, backdrop, cierre o bloqueo de scroll.

| Responsabilidad | Autoridad | Contrato que la protege | Consumidores |
| --- | --- | --- | --- |
| Sesión única de detalle de entidad (apertura, sustitución, foco de origen, invalidación) | `src/features/entity-overlay/index.js` | `private_domain_owner_contract.mjs`, `modal_authority_contract.mjs`, `private-owner-modal-browser-contract.mjs` | Home, listas, relaciones entre entidades, deep links |
| Estructura DOM y ARIA del diálogo, tamaños (`detail`, `wide`, `form`, `compact`, `confirm`, `stage`), alturas (`fixed`, `auto`), rol (`dialog`, `alertdialog`), botón cerrar, estados de carga/error/vacío | `src/features/entity-overlay/modal-host.js` (`renderModalShell`, `ui-modal-shell.v1`) | `tools/modal-shell-contract.mjs` (14 consumidores, ningún shell histórico ni override pendiente) | Dispatcher (carga/error), detalles de Incidencias, Facturas, Clientes y Usuarios, las cuatro altas, confirmaciones de Facturas, flujo de cobro, Correo (redacción, firma, confirmación), perfil del técnico, visor de adjuntos |
| CSS estructural del diálogo (root, overlay, panel, header, body, footer, estados, responsive, movimiento reducido, forced-colors, impresión) | `src/css/components/detail-modal.css` (`ui-detail-modal-*`, layer `components`) | `tools/modal-shell-contract.mjs` (inventario de reglas `position: fixed`; ninguna hoja fuera de la autoridad reestiliza clases estructurales), `private_css_authority_contract.py` | Todo diálogo privado; las diferencias se declaran con `data-modal-size` / `data-modal-height` o tokens `--ui-detail-modal-*` en la raíz del dominio |
| Interacción: Escape, Tab, click exterior, bloqueo de scroll, foco de retorno, clases de `body` | `src/features/entity-overlay/modal-lifecycle.js` | `modal_lifecycle_contract.mjs` (22 escenarios en Chromium) | 13 propietarios de dominio |
| Portal del diálogo y actualización del panel conectado | `src/features/entity-overlay/modal-host.js` (`createModalHost`, `renderModalContent`) | `private-owner-modal-browser-contract.mjs` (51 aserciones, cuatro dominios) | Detalles, altas, perfil del técnico, flujo de cobro |
| Aislamiento de la capa de abajo mientras otra la tapa, y devolución del foco a su origen (`holdModalPanel`, `releaseModalPanel`, `modalStackProtects`, `liveModalOpener`) | `src/features/entity-overlay/modal-lifecycle.js` | `tools/modal-stack-isolation-contract.mjs` (parcheador de Incidencias + visor), `tools/shared-host-modal-stack-contract.mjs` (host compartido + detalle de Facturas y confirmación de cobro) | Titulares: visor de adjuntos, confirmación de cobro de Facturas. La respetan los dos parcheadores: `modal-host.js` y `views/incidencias/index.impl.js` |
| Confirmaciones asíncronas | `src/features/entity-overlay/modal-confirmation.js` (`openModalConfirmation`) | `facturas-confirmation-browser-contract.mjs` (11 escenarios) | Reenvío y cobro de Facturas |
| Contenido y acciones de cada diálogo | Hojas de ruta (`views/*/detail.css`, `views/*/create.css`), composición de las altas (`compositions/private-create-modal.css`) y las clases de contenido del shell (`ui-detail-modal-hero`, `-chip`, `-meta-card`, `-section-head`, …) | `private_create_modal_contract.py`, `repo_integrity.py` (ningún dominio depende de clases de otro), contratos de dominio | Controladores y templates de cada dominio |

**Pendiente y declarado:** el parcheo del DOM **no** está unificado. Incidencias conserva su propio `patchDetailModalDom` junto al `renderModalContent` compartido. La regla del aislamiento sí es única y ambos la obedecen, pero unificar el parcheo es una unidad aparte y aquí no se da por hecha.

Fuera de la autoridad sólo quedan capas fijas que no son diálogos (chrome, loader, toasts, landing pública), todas inventariadas con su motivo en `tools/modal-shell-contract.mjs`. Las capas legacy de `ui.css` (`.ui-overlay`, `.ui-modal`, `.ui-drawer`) y sus tokens se retiraron el 2026-09-15.

## Lifecycle de interacción compartido

El lifecycle compartido controla:

- una pila de diálogos por documento y un listener de teclado mientras exista algún diálogo activo;
- Escape exclusivamente para el diálogo superior, respetando la política de cierre del controlador;
- Tab y Shift+Tab entre controles visibles y habilitados;
- bloqueo de scroll con propietarios, conservación de clases previas y restauración exacta de estilos inline;
- devolución segura de foco, sin moverlo fuera de otro diálogo abierto;
- limpieza de registros y bloqueo cuando se desmonta una vista.

La resolución de un botón de retorno que se ha vuelto a renderizar, el scroll del visor de adjuntos y los borradores siguen siendo responsabilidades del propietario. El renderer común conserva foco, selección y scroll del cuerpo cuando actualiza un panel compatible.

## Montaje y actualización del DOM privado

`modal-host.js` es el único módulo que renderiza DOM de diálogo: emite el shell (`renderModalShell`, `renderModalCloseButton`, `renderModalState`) y aporta `createModalHost` y `renderModalContent`; `renderModalContent` usa por defecto los marcadores del shell (`MODAL_SHELL_SELECTORS`). Un solo chunk compartido sirve a todos los diálogos privados y nada de esto entra en el cierre público del consentimiento. El primero crea y retira sólo el nodo de su propietario; no adopta ni elimina el portal de un controlador posterior. El segundo actualiza un panel compatible sin sustituir su root, overlay o panel conectado. Conserva atributos, foco, selección de texto y scroll del cuerpo; un cambio explícito de entidad o tipo de formulario permite un montaje nuevo.

El detalle de Facturas usa directamente `renderModalContent` sin selectores propios (los marcadores del shell son el valor por defecto) para carga, resultado, error y refresco; el callback de montaje sólo se emite al crear el shell. Su alta conserva reconciliación de controles por claves para mantener identidad y valores de entrada, dentro del mismo host y lifecycle.

Los formularios y las peticiones permanecen en su controlador. Incidencias conserva sus slots y borradores, Correo usa el host inline de su shell y los visores mantienen la propiedad de blobs y medios. Este helper privado no se carga con el consentimiento público ni crea otra sesión o registro de teclado.

`modal-confirmation.js` resuelve las confirmaciones asíncronas con el lifecycle compartido. Cancelar, retirar el origen o desmontar el diálogo resuelve la espera una sola vez. La confirmación de cobro y la de reenvío de Facturas conservan su contenido y sus acciones; una apertura desde Home no cae en `window.confirm`.

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

Cuenta y Servidor tienen formularios inline, no diálogos adicionales. La bienvenida de Home es una ayuda no bloqueante y no adquiere el scroll ni la pila modal.

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

## Una capa retenida no compite por el pintado ni se queda con los clics

Todas las raíces modales declaran el mismo `--z-modal`, y las de dos dominios distintos cuelgan de `body`, que aísla. Empate en el mismo contexto de apilamiento: decide el **orden del árbol**. Medido en el navegador con el detalle de Facturas abierto y Valoraciones encima:

| Nodo | Hijo de `body` | Cuándo se crea |
| --- | --- | --- |
| `#onion-facturas-paid-confirm-root` | 6 | su módulo, al importarse; no se mueve nunca |
| `#facturas-detail-root` | 7 | se destruye al cerrar y se vuelve a añadir al final en cada apertura |

Así que el detalle ganaba siempre el empate y el diálogo salía debajo. Y salía además **inalcanzable**: `holdModalPanel` retiene el *panel*, pero su velo hermano seguía con `pointer-events: auto`, de modo que el clic en el centro del diálogo y el clic en su propio botón aterrizaban los dos en `.ui-detail-modal-overlay`. Eso es lo que se veía como «la interfaz bloqueada».

El orden de pintado sigue ahora a la **pila**, no al árbol. La pila ya marca lo que está cubierto con `data-modal-stack-held`; `components/detail-modal.css` lee esa marca, baja un escalón la raíz retenida —derivado del token, `calc(var(--z-modal) - 1)`, no un número inventado— y apaga su velo. La pila declara el estado; esta autoridad lo dibuja. No hay otro gestor de capas, ni otro atrapa-foco, ni temporizadores.

El `>` de la segunda regla importa: una capa que se monta **dentro** de la raíz que cubre —el visor de adjuntos sobre Incidencias— tiene su propio velo, hijo directo de *su* raíz y no de la retenida, así que conserva su clic para cerrarse.

Contrato: `tools/paid-confirm-layer-contract.mjs`, ocho escenarios. No lee `z-index`: hace **prueba de impacto** con `elementFromPoint` sobre el diálogo y sobre su botón. Un `z-index` correcto con un velo vivo encima seguiría siendo una interfaz bloqueada.
