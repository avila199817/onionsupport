/* =========================================================
   Onion Support - Incidencias View Boundary
   Archivo: /src/views/incidencias/index.js

   CONTROLLER 1:1 · PROGRESSIVE ENHANCEMENTS

   La implementación completa y estable permanece en index.impl.js.
   Esta frontera instala únicamente enhancements DOM acotados y garantiza
   su cleanup junto al controller existente.

   El host del modal se entrega mediante una lease exclusiva por controller:
   un bridge transversal y la ruta propietaria nunca comparten nodo, listeners
   ni ciclo de vida. El cierre tiene además un fallback capturado que delega
   siempre en closeDetailModal(), preservando borradores y confirmaciones.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as Impl from "./index.impl.js";
import {
  installIncidenciasCreateUserCombobox,
  INCIDENCIAS_CREATE_USER_COMBOBOX_VERSION,
} from "./incidencias.create-user-combobox.js";
import {
  installIncidenciasStatsScope,
  INCIDENCIAS_STATS_SCOPE_VERSION,
} from "./incidencias.stats-scope.js";
import {
  installIncidenciasDetailAttachmentPolicy,
  INCIDENCIAS_DETAIL_ATTACHMENT_POLICY_VERSION,
} from "./incidencias.detail-attachment-policy.js";
import {
  installIncidenciasHotList,
  INCIDENCIAS_HOT_LIST_VERSION,
} from "./incidencias.hot-list.js";

export const INCIDENCIAS_INDEX_VERSION =
  `${Impl.INCIDENCIAS_INDEX_VERSION}.create-user-combobox.truthful-loaded-stats.detail-attachment-policy.hot-list.modal-host-lease`;

export const INCIDENCIAS_VIEW_VERSION =
  INCIDENCIAS_INDEX_VERSION;

const MODAL_HOST_SELECTOR =
  "[data-incidencias-modal-host='true']";
const DETAIL_ROOT_SELECTOR =
  "[data-incidencias-modal-root='true']";
const DETAIL_PANEL_SELECTOR =
  "[data-incidencias-modal-panel='true']";
const DETAIL_OVERLAY_SELECTOR =
  "[data-incidencias-modal-overlay='true']";
const DETAIL_CLOSE_SELECTOR =
  "[data-detail-action='detail-close']";

let modalOwnerSequence = 0;
let routeOwnerController = null;

function isBrowserDocument(documentLike = null) {
  return Boolean(
    documentLike &&
    typeof documentLike.createElement === "function" &&
    documentLike.body
  );
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function isModalBridgeContext(context = {}) {
  return Boolean(
    context &&
    typeof context === "object" &&
    context.modalBridge === true
  );
}

function nextModalOwnerId(context = {}) {
  modalOwnerSequence += 1;

  const kind = isModalBridgeContext(context)
    ? "bridge"
    : "route";

  return [
    "incidencias",
    kind,
    Date.now().toString(36),
    modalOwnerSequence.toString(36),
  ].join("-");
}

/*
  index.impl.js conserva deliberadamente un único selector de host. Para que
  dos controllers concurrentes no puedan apropiarse del mismo nodo, la frontera
  reserva un host nuevo y retira el selector canónico de cualquier lease vieja
  antes de montar el controller. Los controllers antiguos conservan su referencia
  directa y pueden destruirla con seguridad, pero nunca vuelven a ser elegidos.
*/
function createDedicatedModalHost({
  host = null,
  context = {},
  document: documentLike = null,
} = {}) {
  if (
    !isBrowserDocument(documentLike) ||
    !host ||
    typeof host !== "object" ||
    typeof host.nodeType !== "number"
  ) {
    return null;
  }

  for (const current of documentLike.querySelectorAll?.(MODAL_HOST_SELECTOR) || []) {
    current.setAttribute(
      "data-incidencias-modal-host",
      "superseded"
    );
    current.setAttribute(
      "data-incidencias-modal-host-superseded",
      "true"
    );
  }

  const modalHost = documentLike.createElement("div");
  const ownerId = nextModalOwnerId(context);
  const mode = isModalBridgeContext(context)
    ? "bridge"
    : "route";

  modalHost.setAttribute(
    "data-incidencias-modal-host",
    "true"
  );
  modalHost.setAttribute(
    "data-incidencias-modal-owner-id",
    ownerId
  );
  modalHost.setAttribute(
    "data-incidencias-modal-context",
    mode
  );
  modalHost.setAttribute(
    "data-incidencias-modal-boundary-version",
    INCIDENCIAS_VIEW_VERSION
  );

  if (host?.dataset?.routePath) {
    modalHost.setAttribute(
      "data-incidencias-modal-route",
      cleanText(host.dataset.routePath, "")
    );
  }

  documentLike.body.appendChild(modalHost);

  return {
    modalHost,
    ownerId,
    mode,
  };
}

function modalTarget(event = null) {
  const target = event?.target;

  return target?.nodeType === 3
    ? target.parentElement
    : target;
}

/*
  Defensa final del cierre. El controller sigue siendo la única autoridad:
  este listener no muta DOM ni estado, sólo invoca su API pública. Al vivir en
  capture continúa funcionando aunque otro listener bubble se haya perdido por
  una carrera de montaje o una extensión del navegador.
*/
function installIncidenciasModalCloseFailsafe({
  modalHost = null,
  controller = null,
} = {}) {
  if (
    !modalHost?.addEventListener ||
    typeof controller?.closeDetailModal !== "function"
  ) {
    return () => false;
  }

  let destroyed = false;

  function onClick(event) {
    if (destroyed) return;

    const target = modalTarget(event);
    if (!target?.closest || !modalHost.contains(target)) {
      return;
    }

    const root = target.closest(DETAIL_ROOT_SELECTOR);
    if (!root || !modalHost.contains(root)) {
      return;
    }

    const explicitClose =
      target.closest(DETAIL_CLOSE_SELECTOR);

    const overlay =
      target.closest(DETAIL_OVERLAY_SELECTOR);

    const panel =
      target.closest(DETAIL_PANEL_SELECTOR);

    const backdropClose = Boolean(
      overlay &&
      !panel &&
      target === overlay
    );

    if (!explicitClose && !backdropClose) {
      return;
    }

    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    controller.closeDetailModal();
  }

  modalHost.addEventListener(
    "click",
    onClick,
    true
  );

  return function uninstallIncidenciasModalCloseFailsafe() {
    if (destroyed) return false;
    destroyed = true;

    modalHost.removeEventListener(
      "click",
      onClick,
      true
    );

    return true;
  };
}

function resolveBoundaryRole() {
  const runtimeState = AppCore.runtimeState.read();
  const implementationSnapshot = Impl.getSnapshot?.() || {};
  const runtimeUser = runtimeState?.user || runtimeState?.auth?.user || {};

  return AppCore.normalizeRole(
    implementationSnapshot.role ||
    runtimeState?.role ||
    runtimeState?.rol ||
    runtimeUser.role ||
    runtimeUser.rol ||
    "user"
  );
}

export async function IncidenciasView(host = null, context = {}) {
  const documentLike = host?.ownerDocument ||
    (typeof document !== "undefined" ? document : null);

  /*
    La lease debe existir antes de entrar en Impl.IncidenciasView(): su mount()
    resuelve y enlaza el host de forma síncrona dentro de esa llamada.
  */
  const lease = createDedicatedModalHost({
    host,
    context,
    document: documentLike,
  });

  let controller = null;

  try {
    controller = await Impl.IncidenciasView(host, context);
  } catch (error) {
    lease?.modalHost?.remove?.();
    throw error;
  }

  if (!controller) {
    lease?.modalHost?.remove?.();
    return controller;
  }

  if (controller.__incidenciasViewEnhancementsInstalled === true) {
    return controller;
  }

  const uninstallCombobox = installIncidenciasCreateUserCombobox({
    document: documentLike,
  });

  const uninstallStatsScope = installIncidenciasStatsScope({
    host,
    document: documentLike,
  });

  const uninstallDetailAttachmentPolicy = installIncidenciasDetailAttachmentPolicy({
    document: documentLike,
    getRole: resolveBoundaryRole,
  });

  const uninstallHotList = installIncidenciasHotList({
    host,
    document: documentLike,
  });

  const uninstallModalCloseFailsafe =
    installIncidenciasModalCloseFailsafe({
      modalHost: lease?.modalHost,
      controller,
    });

  const isRouteOwner =
    !isModalBridgeContext(context);

  if (isRouteOwner) {
    routeOwnerController = controller;
  }

  const originalDestroy = typeof controller.destroy === "function"
    ? controller.destroy.bind(controller)
    : null;

  for (const key of [
    "__incidenciasViewEnhancementsInstalled",
    "__incidenciasCreateUserComboboxInstalled",
    "__incidenciasStatsScopeInstalled",
    "__incidenciasDetailAttachmentPolicyInstalled",
    "__incidenciasHotListInstalled",
    "__incidenciasModalHostLeaseInstalled",
    "__incidenciasModalCloseFailsafeInstalled",
  ]) {
    Object.defineProperty(controller, key, {
      value: true,
      configurable: true,
      enumerable: false,
    });
  }

  Object.defineProperty(
    controller,
    "__incidenciasModalOwnerId",
    {
      value: lease?.ownerId || "",
      configurable: true,
      enumerable: false,
    }
  );

  controller.destroy = function destroyIncidenciasWithEnhancements() {
    uninstallModalCloseFailsafe?.();
    uninstallHotList?.();
    uninstallDetailAttachmentPolicy?.();
    uninstallStatsScope?.();
    uninstallCombobox?.();

    if (routeOwnerController === controller) {
      routeOwnerController = null;
    }

    const destroyed = originalDestroy
      ? originalDestroy()
      : true;

    /*
      Si el controller no llegó a adoptar el nodo por una excepción parcial,
      la frontera sigue siendo responsable de no dejar una capa huérfana.
    */
    if (lease?.modalHost?.isConnected) {
      lease.modalHost.remove();
    }

    return destroyed;
  };

  return controller;
}

export const IncidenciasIndex = IncidenciasView;

/*
  Aperturas externas sólo se delegan al controller propietario de la ruta.
  Un controller modalBridge nunca puede sustituir esta autoridad por haber sido
  la última instancia creada.
*/
export async function openIncidenciaDetailById(
  ticketId = "",
  openerNode = null
) {
  const controller = routeOwnerController;
  const snapshot = controller?.getSnapshot?.() || {};

  if (
    !controller ||
    typeof controller.openDetail !== "function" ||
    snapshot.destroyed === true ||
    snapshot.mounted === false
  ) {
    return false;
  }

  try {
    return Boolean(
      await controller.openDetail(
        ticketId,
        openerNode
      )
    );
  } catch {
    return false;
  }
}

/*
  Impl.destroy() termina invocando el destroy del controller almacenado.
  Ese método queda decorado arriba, así que también limpia los enhancements.
*/
export const destroy = Impl.destroy;
export const getSnapshot = Impl.getSnapshot;
export const getDebugSnapshot = Impl.getDebugSnapshot;

export function getIncidenciasViewBoundarySnapshot() {
  const ownerSnapshot =
    routeOwnerController?.getSnapshot?.() || null;

  return Object.freeze({
    version: INCIDENCIAS_VIEW_VERSION,
    implementationVersion: Impl.INCIDENCIAS_VIEW_VERSION,
    createUserComboboxVersion: INCIDENCIAS_CREATE_USER_COMBOBOX_VERSION,
    statsScopeVersion: INCIDENCIAS_STATS_SCOPE_VERSION,
    detailAttachmentPolicyVersion: INCIDENCIAS_DETAIL_ATTACHMENT_POLICY_VERSION,
    hotListVersion: INCIDENCIAS_HOT_LIST_VERSION,
    role: resolveBoundaryRole(),
    routeOwnerMounted: Boolean(
      routeOwnerController &&
      ownerSnapshot?.destroyed !== true &&
      ownerSnapshot?.mounted !== false
    ),
    policy: Object.freeze({
      controllerImplementationPreserved1to1: true,
      enhancementsInstalledPerController: true,
      enhancementsCleanupOnDestroy: true,
      noSecondSelectionPath: true,
      truthfulLoadedStats: true,
      detailAttachmentLimitsEarly: true,
      canonicalRoleAuthority: true,
      zeroCopyRuntimeState: true,
      searchFocusAndCaretStableAcrossListReconciliation: true,
      searchInputPersistentDomIsland: true,
      keyboardHotPathNeverRestoresCaret: true,
      replacementRestoreRunsBeforePaint: true,
      hotListOwnsNoBusinessState: true,
      modalHostLeasePerController: true,
      modalHostNeverSharedWithBridge: true,
      routeOwnerNeverUsesLastBridgeInstance: true,
      closeFailsafeDelegatesToController: true,
    }),
  });
}

export default IncidenciasView;
