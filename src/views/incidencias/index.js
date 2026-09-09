/* =========================================================
   Onion Support - Incidencias View Boundary
   Archivo: /src/views/incidencias/index.js

   CONTROLLER 1:1 · PROGRESSIVE ENHANCEMENTS

   La implementación completa y estable permanece en index.impl.js.
   Esta frontera instala únicamente enhancements DOM acotados y garantiza
   su cleanup junto al controller existente.

   El host del modal se entrega mediante una lease exclusiva por controller:
   un detalle transversal y la ruta propietaria nunca comparten nodo, listeners
   ni ciclo de vida. Una lease reemplazada queda inmediatamente oculta, inert
   y fuera del hit-testing para que jamás sobrevivan dos overlays interactivos.

   El host activo también marca una frontera de intención: el Entity Overlay
   global nunca puede reinterpretar un click en el backdrop como una nueva
   solicitud de apertura de la misma incidencia.
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
  `${Impl.INCIDENCIAS_INDEX_VERSION}.create-user-combobox.truthful-loaded-stats.detail-attachment-policy.hot-list.modal-host-lease.single-interactive-layer`;

export const INCIDENCIAS_VIEW_VERSION =
  INCIDENCIAS_INDEX_VERSION;

const MODAL_HOST_SELECTOR =
  "[data-incidencias-modal-host='true']";
const MODAL_HOST_CANDIDATE_SELECTOR =
  "[data-incidencias-modal-host]";
const DETAIL_ROOT_SELECTOR =
  "[data-incidencias-modal-root='true']";
const DETAIL_PANEL_SELECTOR =
  "[data-incidencias-modal-panel='true']";
const DETAIL_OVERLAY_SELECTOR =
  "[data-incidencias-modal-overlay='true']";
const DETAIL_CLOSE_SELECTOR =
  "[data-detail-action='detail-close']";
const ROUTER_EVENT_HANDLED_KEY =
  "__onionRouterHandled";
const ENTITY_OVERLAY_IGNORE_ATTRIBUTE =
  "data-entity-overlay-ignore";

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

function isDetailOnlyContext(context = {}) {
  return Boolean(
    context &&
    typeof context === "object" &&
    context.detailOnly === true
  );
}

function nextModalOwnerId(context = {}) {
  modalOwnerSequence += 1;

  const kind = isDetailOnlyContext(context)
    ? "detail"
    : "route";

  return [
    "incidencias",
    kind,
    Date.now().toString(36),
    modalOwnerSequence.toString(36),
  ].join("-");
}

function isActiveModalHost(modalHost = null) {
  if (!modalHost?.getAttribute) {
    return false;
  }

  return Boolean(
    modalHost.isConnected &&
    modalHost.getAttribute("data-incidencias-modal-host") === "true" &&
    modalHost.getAttribute("data-incidencias-modal-active-layer") === "true" &&
    modalHost.getAttribute("data-incidencias-modal-host-superseded") !== "true" &&
    modalHost.hidden !== true &&
    !modalHost.hasAttribute("inert") &&
    Boolean(modalHost.querySelector?.("[role='dialog'], [role='alertdialog']"))
  );
}

/*
  Una lease antigua debe seguir conectada hasta que su propio controller
  termine el cleanup: así index.impl.js conserva su referencia directa y jamás
  puede apropiarse del host nuevo. Pero conectada no significa interactiva:
  queda fuera de accesibilidad, pintura y hit-testing de forma inmediata.

  El nodo se elimina únicamente durante el cleanup de su controller.
*/
function quarantineModalHost(modalHost = null) {
  if (!modalHost?.setAttribute) {
    return false;
  }

  modalHost.setAttribute(
    "data-incidencias-modal-host",
    "superseded"
  );
  modalHost.setAttribute(
    "data-incidencias-modal-host-superseded",
    "true"
  );
  modalHost.setAttribute(
    "data-incidencias-modal-active-layer",
    "false"
  );
  modalHost.setAttribute(
    ENTITY_OVERLAY_IGNORE_ATTRIBUTE,
    "true"
  );
  modalHost.setAttribute(
    "aria-hidden",
    "true"
  );
  modalHost.setAttribute(
    "inert",
    ""
  );

  try {
    modalHost.hidden = true;
  } catch {
    // noop
  }

  try {
    modalHost.style?.setProperty?.(
      "display",
      "none",
      "important"
    );
    modalHost.style?.setProperty?.(
      "visibility",
      "hidden",
      "important"
    );
    modalHost.style?.setProperty?.(
      "pointer-events",
      "none",
      "important"
    );
  } catch {
    // noop
  }

  return true;
}

function activateModalHost(modalHost = null) {
  if (!modalHost?.setAttribute) {
    return false;
  }

  modalHost.setAttribute(
    "data-incidencias-modal-host",
    "true"
  );
  modalHost.removeAttribute(
    "data-incidencias-modal-host-superseded"
  );
  modalHost.setAttribute(
    "data-incidencias-modal-active-layer",
    "true"
  );

  /*
    Entity Overlay escucha document en capture, antes que los listeners del
    modal. Esta frontera evita que el backdrop herede data-ticket-id del root y
    sea tratado como una nueva intención de apertura.
  */
  modalHost.setAttribute(
    ENTITY_OVERLAY_IGNORE_ATTRIBUTE,
    "true"
  );
  modalHost.setAttribute(
    "aria-hidden",
    "false"
  );
  modalHost.removeAttribute(
    "inert"
  );

  try {
    modalHost.hidden = false;
  } catch {
    // noop
  }

  try {
    modalHost.style?.removeProperty?.(
      "display"
    );
    modalHost.style?.removeProperty?.(
      "visibility"
    );
    modalHost.style?.removeProperty?.(
      "pointer-events"
    );
  } catch {
    // noop
  }

  return true;
}

function quarantineExistingModalHosts(
  documentLike = null,
  activeHost = null
) {
  if (!isBrowserDocument(documentLike)) {
    return 0;
  }

  let quarantined = 0;

  for (
    const current
    of documentLike.querySelectorAll?.(
      MODAL_HOST_CANDIDATE_SELECTOR
    ) || []
  ) {
    if (current !== activeHost && quarantineModalHost(current)) {
      quarantined += 1;
    }
  }

  return quarantined;
}

/*
  La frontera asigna una referencia explícita y exclusiva. La implementación
  jamás busca un host global ni toma el de otro controller.
*/
function createDedicatedModalHost({
  host = null,
  context = {},
  document: documentLike = null,
} = {}) {
  if (
    !isBrowserDocument(documentLike) ||
    (!isDetailOnlyContext(context) && (
      !host || typeof host !== "object" || typeof host.nodeType !== "number"
    ))
  ) {
    return null;
  }

  // A staged route owns an empty lease only. Mounting can still fail before
  // Router commits it; the currently visible owner's modal must survive.
  const modalHost = documentLike.createElement("div");
  const ownerId = nextModalOwnerId(context);
  const mode = isDetailOnlyContext(context)
    ? "detail"
    : "route";

  activateModalHost(modalHost);

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
    supersededCount: 0,
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
    if (
      destroyed ||
      !isActiveModalHost(modalHost)
    ) {
      return;
    }

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

    try {
      event[ROUTER_EVENT_HANDLED_KEY] = true;
    } catch {
      // noop
    }

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

async function mountIncidenciasOwner(host = null, context = {}) {
  if (context.signal?.aborted) return null;
  const detailOnly = isDetailOnlyContext(context);
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
    const ownerContext = {
      ...context,
      modalHost: lease?.modalHost || null,
      onDetailShell(detail) {
        context.onDetailShell?.(detail);
      },
      onDetailBeforePatch(detail) {
        if (detailOnly) detailStateFeature?.restoreIncidenciasDetailComposer?.(detail.modalHost);
      },
      onDetailRendered(detail) {
        // An empty staged route never supersedes the visible modal owner.
        if (detail.open || detail.createOpen) {
          quarantineExistingModalHosts(documentLike, lease?.modalHost);
          activateModalHost(lease?.modalHost);
        }
        if (detail.open) {
          detailMediaFeature?.default.mount(lease?.modalHost);
          detailViewerFeature?.default.mount(lease?.modalHost);
        } else {
          releaseDetailMedia(lease?.modalHost);
        }
        if (detailOnly) {
          detailStateFeature?.syncIncidenciasDetailState?.(detail);
          detailLiveSyncFeature?.syncIncidenciasDetailLiveSync?.(detail);
          detailCommentAvatarsFeature?.syncIncidenciasCommentAvatars?.(detail.modalHost, detail);
          detailFollowupAvatarsFeature?.syncIncidenciasFollowupAvatars?.(detail.modalHost, detail);
        }
        context.onDetailRendered?.(detail);
      },
    };
    controller = detailOnly
      ? Impl.createIncidenciasController(null, ownerContext).mount()
      : await Impl.IncidenciasView(host, ownerContext);
  } catch (error) {
    quarantineModalHost(
      lease?.modalHost
    );
    lease?.modalHost?.remove?.();
    throw error;
  }

  if (!controller || context.signal?.aborted || controller.getSnapshot?.().destroyed) {
    controller?.destroy?.();
    quarantineModalHost(
      lease?.modalHost
    );
    lease?.modalHost?.remove?.();
    return null;
  }

  if (controller.__incidenciasViewEnhancementsInstalled === true) {
    return controller;
  }

  const uninstallCombobox = detailOnly ? null : installIncidenciasCreateUserCombobox({
    document: documentLike,
  });

  const uninstallStatsScope = detailOnly ? null : installIncidenciasStatsScope({
    host,
    document: documentLike,
  });

  const uninstallDetailAttachmentPolicy = installIncidenciasDetailAttachmentPolicy({
    document: documentLike,
    root: lease?.modalHost,
    getRole: resolveBoundaryRole,
  });

  const uninstallHotList = detailOnly ? null : installIncidenciasHotList({
    host,
    document: documentLike,
  });

  const uninstallModalCloseFailsafe =
    installIncidenciasModalCloseFailsafe({
      modalHost: lease?.modalHost,
      controller,
    });

  const isRouteOwner =
    !isDetailOnlyContext(context);

  if (isRouteOwner) {
    routeOwnerController = controller;
  }

  const originalDestroy = typeof controller.destroy === "function"
    ? controller.destroy.bind(controller)
    : null;

  for (const key of [
    "__incidenciasViewEnhancementsInstalled",
    "__incidenciasDetailAttachmentPolicyInstalled",
    "__incidenciasModalHostLeaseInstalled",
    "__incidenciasModalCloseFailsafeInstalled",
    ...(!detailOnly ? [
      "__incidenciasCreateUserComboboxInstalled",
      "__incidenciasStatsScopeInstalled",
      "__incidenciasHotListInstalled",
    ] : []),
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

  Object.defineProperty(
    controller,
    "__incidenciasModalHost",
    {
      value: lease?.modalHost || null,
      configurable: true,
      enumerable: false,
    }
  );

  controller.destroy = function destroyIncidenciasWithEnhancements() {
    releaseDetailMedia(lease?.modalHost);
    quarantineModalHost(
      lease?.modalHost
    );

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

export async function IncidenciasView(host = null, context = {}) {
  return mountIncidenciasOwner(host, { ...context, detailOnly: false });
}

let detailPreparation = null;
let detailStateFeature = null;
let detailLiveSyncFeature = null;
let detailCommentAvatarsFeature = null;
let detailFollowupAvatarsFeature = null;
let detailMediaFeature = null;
let detailViewerFeature = null;

function releaseDetailMedia(host) {
  // A stale route/controller cannot tear down the next owner's media session.
  if (!host) return;
  detailViewerFeature?.default.destroy(host);
  detailMediaFeature?.default.destroy(host);
}

export function prepareIncidenciaDetail() {
  if (!detailPreparation) {
    detailPreparation = Promise.all([
      import("../../features/incidencias-detail-state/index.js"),
      import("../../features/incidencias-detail-live-sync/index.js"),
      import("../../features/incidencias-comment-avatars/index.js"),
      import("../../features/incidencias-followup-avatars/index.js"),
      import("../../features/incidencias-media-preview/index.js"),
      import("../../features/incidencias-video-preview/index.js"),
    ]).then(([state, liveSync, comments, followup, media, viewer]) => {
      detailStateFeature = state;
      detailLiveSyncFeature = liveSync;
      detailCommentAvatarsFeature = comments;
      detailFollowupAvatarsFeature = followup;
      detailMediaFeature = media;
      detailViewerFeature = viewer;
      return state;
    }).catch((error) => {
      detailPreparation = null;
      throw error;
    });
  }
  return detailPreparation.then((module) => {
    // This authority can have been torn down on a previous session.
    module.mountIncidenciasDetailState();
    detailLiveSyncFeature?.mountIncidenciasDetailLiveSync?.();
    detailCommentAvatarsFeature?.mountIncidenciasCommentAvatars?.();
    detailFollowupAvatarsFeature?.mountIncidenciasFollowupAvatars?.();
    return true;
  });
}

export async function createIncidenciaDetailController(context = {}) {
  if (context.signal?.aborted) return null;
  await prepareIncidenciaDetail();
  if (context.signal?.aborted) return null;
  return mountIncidenciasOwner(null, {
    ...context,
    detailOnly: true,
  });
}

export const IncidenciasIndex = IncidenciasView;

// Public callers and list interactions use the same application dispatcher.
// Only createIncidenciaDetailController exposes the primitive owner method.
export const openIncidenciaDetailById = Impl.openIncidenciaDetailById;

/*
  Impl.destroy() termina invocando el destroy del controller almacenado.
  Ese método queda decorado arriba, así que también limpia los enhancements.
*/
export const destroy = Impl.destroy;
export const getSnapshot = Impl.getSnapshot;
export const getDebugSnapshot = Impl.getDebugSnapshot;

function getModalLayerSnapshot(
  documentLike =
    typeof document !== "undefined"
      ? document
      : null
) {
  if (!isBrowserDocument(documentLike)) {
    return Object.freeze({
      total: 0,
      interactive: 0,
      superseded: 0,
      duplicateInteractive: false,
    });
  }

  const hosts = Array.from(
    documentLike.querySelectorAll?.(
      MODAL_HOST_CANDIDATE_SELECTOR
    ) || []
  );

  const interactive = hosts.filter(
    isActiveModalHost
  ).length;

  const superseded = hosts.filter(
    (modalHost) =>
      modalHost.getAttribute?.(
        "data-incidencias-modal-host-superseded"
      ) === "true"
  ).length;

  return Object.freeze({
    total: hosts.length,
    interactive,
    superseded,
    duplicateInteractive:
      interactive > 1,
  });
}

export function getIncidenciasViewBoundarySnapshot() {
  const ownerSnapshot =
    routeOwnerController?.getSnapshot?.() || null;
  const modalLayers =
    getModalLayerSnapshot();

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
    modalLayers,
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
      modalHostNeverSharedWithDetailOwner: true,
      routeOwnerNeverUsesLastDetailInstance: true,
      closeFailsafeDelegatesToController: true,
      supersededModalHostsAreInert: true,
      singleInteractiveModalLayer: true,
      stagedRoutePreservesCurrentModal: true,
      backdropNeverCreatesEntityIntent: true,
    }),
  });
}

export default IncidenciasView;
