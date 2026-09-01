import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const [
  facturas,
  autorefresh,
  interceptor,
  bridge,
  bridgeStyle,
  incidencias,
  incidenciasBoundary,
  entityIntent,
  avatarFallback,
  followupAvatars,
] = await Promise.all([
  read("src/views/facturas/index.js"),
  read("src/features/facturas-autorefresh/index.js"),
  read("src/features/facturas-incidencia-modal/index.js"),
  read("src/features/incidencia-modal-bridge/index.js"),
  read("src/features/incidencia-modal-bridge/style.css"),
  read("src/views/incidencias/index.impl.js"),
  read("src/views/incidencias/index.js"),
  read("src/features/entity-overlay/intent.js"),
  read("src/features/incidencias-avatar-fallback/index.js"),
  read("src/features/incidencias-followup-avatars/index.js"),
]);

/* El handler legacy sigue presente, pero ya no recibe el click en Facturas. */
assert.match(facturas, /facturas\.open-incidencia/);
assert.match(facturas, /Router\.navigate\(route/);

/* La feature se carga sólo con el enhancement route-scoped de Facturas. */
assert.match(
  autorefresh,
  /import\s+["']\.\.\/facturas-incidencia-modal\/index\.js["']/
);

/* Captura antes del controller y corta por completo la navegación legacy. */
assert.match(interceptor, /document\.addEventListener\("click", onDocumentClick, true\)/);
assert.match(interceptor, /event\.stopImmediatePropagation\?\.\(\)/);
assert.match(interceptor, /openIncidenciaModalFromCurrentView/);
assert.match(interceptor, /routeNavigation:\s*false/);
assert.match(interceptor, /close-factura-detail/);

/* El bridge nunca navega: usa el controller canónico de Incidencias. */
assert.doesNotMatch(bridge, /Router\.navigate|location\.href|location\.assign/);
assert.match(bridge, /module\?\.IncidenciasView/);
assert.match(bridge, /controller\.openDetail/);
assert.match(bridge, /disposeBridge\(\{ invalidate: false, feedback: false \}\)/);
assert.match(bridge, /data-incidencias-modal-bridge-host/);

/*
  Primer paint transversal: el feedback debe existir ANTES del primer await
  que puede bloquear por chunk/CSS/red. Un fallo nunca vuelve a ser silencioso.
*/
assert.match(bridge, /import\s+["']\.\/style\.css["']/);
assert.match(bridge, /data-incidencias-modal-bridge-feedback/);
assert.match(bridge, /showBridgeFeedback/);
assert.match(bridge, /state:\s*["']loading["']/);
assert.match(bridge, /state:\s*["']error["']/);
assert.match(bridge, /Reintentar/);
assert.match(bridge, /INCIDENCIA_MODAL_OPEN_FAILED/);
assert.match(bridge, /INCIDENCIA_MODAL_CONTROLLER_UNAVAILABLE/);

const openFunction = bridge.slice(
  bridge.indexOf("export async function openIncidenciaModalFromCurrentView")
);
assert.ok(openFunction.length > 0, "Debe existir openIncidenciaModalFromCurrentView");
assert.ok(
  openFunction.indexOf("showBridgeFeedback(id") >= 0 &&
    openFunction.indexOf("showBridgeFeedback(id") < openFunction.indexOf("await Promise.all"),
  "El feedback de apertura debe pintarse antes del primer await bloqueante"
);

/* El bridge se precalienta al cargar la feature de Facturas. */
assert.match(bridge, /export function primeIncidenciaModalBridge/);
assert.match(bridge, /primeIncidenciaModalBridge\(\);/);
assert.match(bridge, /void loadIncidenciasModule\(\)\.catch/);
assert.match(bridge, /void ensureStyles\(\)\.catch/);

/*
  El singleton histórico sólo puede actuar como owner si /incidencias es la
  ruta activa; un bridge previo no debe apropiarse de aperturas desde Facturas.
*/
assert.match(bridge, /function currentOwnerIsIncidencias/);
assert.match(bridge, /currentOwnerIsIncidencias\(\)\s*&&/);

/*
  Paridad visual transversal: Facturas mantiene su propia ruta, por lo que el
  bridge carga explícitamente las mejoras de avatar que normalmente aporta
  Incidencias. Son progresivas: nunca pertenecen al Promise.all crítico.
*/
assert.match(
  bridge,
  /import\(["']\.\.\/incidencias-avatar-fallback\/index\.js["']\)/
);
assert.match(
  bridge,
  /import\(["']\.\.\/incidencias-followup-avatars\/index\.js["']\)/
);
assert.match(bridge, /mountIncidenciasAvatarFallback/);
assert.match(bridge, /mountIncidenciasFollowupAvatars/);
assert.match(bridge, /syncIncidenciasCommentAvatars/);
assert.match(bridge, /syncIncidenciasFollowupAvatars/);
assert.match(bridge, /avatarEnhancementsReady/);
assert.match(
  openFunction,
  /const avatarEnhancements = loadIncidenciasAvatarEnhancements\(\)/
);
assert.doesNotMatch(
  openFunction,
  /Promise\.all\(\[\s*loadIncidenciasModule\(\),\s*ensureStyles\(\),\s*loadIncidenciasAvatarEnhancements\(/
);

/* El feedback tiene overlay propio, foco visible y reduced-motion. */
assert.match(bridgeStyle, /\.incidencia-bridge-feedback-overlay/);
assert.match(bridgeStyle, /\.incidencia-bridge-feedback-panel/);
assert.match(bridgeStyle, /\.incidencia-bridge-feedback-spinner/);
assert.match(bridgeStyle, /prefers-reduced-motion/);
assert.match(bridgeStyle, /incidencias-modal-bridge-feedback-open/);

/* Las capas importadas siguen siendo las autoridades canónicas de identidad. */
assert.match(avatarFallback, /export function syncIncidenciasCommentAvatars/);
assert.match(followupAvatars, /import\s+["']\.\/style\.css["']/);
assert.match(
  followupAvatars,
  /\.incidencias-modal-description-comment-head/
);
assert.match(followupAvatars, /export function syncIncidenciasFollowupAvatars/);

/* El modal real vive fuera del host técnico oculto. */
assert.match(incidencias, /document\.body\.appendChild\(\s*modalHost\s*\)/);
assert.match(incidencias, /data-incidencias-modal-host/);

/*
  Regresión crítica bridge -> ruta Incidencias:
  cada controller recibe una lease de modal distinta antes de entrar en Impl.
  Un bridge que se destruya tarde nunca puede retirar listeners/nodo del owner.
*/
assert.match(incidenciasBoundary, /function createDedicatedModalHost/);
assert.match(incidenciasBoundary, /data-incidencias-modal-owner-id/);
assert.match(incidenciasBoundary, /data-incidencias-modal-context/);
assert.match(incidenciasBoundary, /data-incidencias-modal-host-superseded/);
assert.match(
  incidenciasBoundary,
  /const lease = createDedicatedModalHost\([\s\S]*?controller = await Impl\.IncidenciasView/
);
assert.match(
  incidenciasBoundary,
  /modalHostNeverSharedWithBridge:\s*true/
);

/*
  Sólo puede quedar una capa interactiva. Las leases sustituidas permanecen
  conectadas para que su controller no robe el host nuevo, pero quedan ocultas,
  inert y fuera de hit-testing antes de montar el siguiente owner.
*/
assert.match(incidenciasBoundary, /function quarantineModalHost/);
assert.match(incidenciasBoundary, /function quarantineExistingModalHosts/);
assert.match(incidenciasBoundary, /function isActiveModalHost/);
assert.match(incidenciasBoundary, /modalHost\.hidden = true/);
assert.match(
  incidenciasBoundary,
  /modalHost\.setAttribute\(\s*"inert",\s*""\s*\)/
);
assert.match(
  incidenciasBoundary,
  /modalHost\.style\?\.setProperty\?\.\(\s*"display",\s*"none",\s*"important"\s*\)/
);
assert.match(
  incidenciasBoundary,
  /modalHost\.style\?\.setProperty\?\.\(\s*"pointer-events",\s*"none",\s*"important"\s*\)/
);
assert.match(
  incidenciasBoundary,
  /singleInteractiveModalLayer:\s*true/
);
assert.match(
  incidenciasBoundary,
  /supersededModalHostsAreInert:\s*true/
);

/*
  Entity Overlay escucha en document/capture. El host canónico debe ser una
  frontera local para que pinchar el backdrop no herede data-ticket-id del root
  y vuelva a lanzar exactamente la misma incidencia.
*/
assert.match(
  entityIntent,
  /\[data-entity-overlay-ignore='true'\]/
);
assert.match(
  incidenciasBoundary,
  /ENTITY_OVERLAY_IGNORE_ATTRIBUTE/
);
assert.match(
  incidenciasBoundary,
  /modalHost\.setAttribute\(\s*ENTITY_OVERLAY_IGNORE_ATTRIBUTE,\s*"true"\s*\)/
);
assert.match(
  incidenciasBoundary,
  /backdropNeverCreatesEntityIntent:\s*true/
);

/*
  La API externa de apertura sólo usa el controller propietario de la ruta,
  nunca Impl.lastInstance (que también puede ser un modalBridge).
*/
assert.match(incidenciasBoundary, /let routeOwnerController = null/);
assert.match(
  incidenciasBoundary,
  /export async function openIncidenciaDetailById[\s\S]*?const controller = routeOwnerController/
);
assert.doesNotMatch(
  incidenciasBoundary.slice(
    incidenciasBoundary.indexOf("export async function openIncidenciaDetailById")
  ),
  /Impl\.openIncidenciaDetailById/
);
assert.match(
  incidenciasBoundary,
  /routeOwnerNeverUsesLastBridgeInstance:\s*true/
);

/*
  Aunque un listener bubble desaparezca por una carrera, X y backdrop siguen
  delegando al mismo closeDetailModal() canónico y respetan borradores.
*/
assert.match(incidenciasBoundary, /function installIncidenciasModalCloseFailsafe/);
assert.match(incidenciasBoundary, /data-detail-action='detail-close'/);
assert.match(incidenciasBoundary, /!isActiveModalHost\(modalHost\)/);
assert.match(incidenciasBoundary, /event\.stopImmediatePropagation\?\.\(\)/);
assert.match(incidenciasBoundary, /ROUTER_EVENT_HANDLED_KEY/);
assert.match(incidenciasBoundary, /controller\.closeDetailModal\(\)/);
assert.match(
  incidenciasBoundary,
  /closeFailsafeDelegatesToController:\s*true/
);

console.log("facturas direct incidencia modal contract: ok");
