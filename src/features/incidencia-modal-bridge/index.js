/* =========================================================
   Onion Support - Incidencia Modal Bridge

   Permite abrir el modal canónico de Incidencias desde otras vistas sin
   navegar a /incidencias. El controller real de Incidencias sigue siendo la
   única autoridad sobre carga, acciones, adjuntos, foco y cierre del modal.

   La política conversacional del usuario NO se replica aquí:
   `incidencias-detail-state` es la única autoridad de presentación para
   permitir/bloquear nuevas actualizaciones, tanto en la ruta Incidencias como
   cuando el mismo modal se abre transversalmente desde Home/Facturas.

   Reglas de apertura transversal:
   - feedback visible inmediato antes de imports/red/detalle;
   - CSS, controller y autoridad canónica de Detail State se precalientan;
   - la autoridad conversacional debe estar montada ANTES de abrir el modal;
   - avatares son mejora progresiva y nunca bloquean el primer paint;
   - sólo se delega al owner global cuando /incidencias es realmente la ruta;
   - cualquier fallo conserva una UI recuperable con Reintentar/Cerrar.
========================================================= */

import "./style.css";

export const INCIDENCIA_MODAL_BRIDGE_VERSION =
  "incidencia-modal-bridge.v4.canonical-detail-authority";

const BRIDGE_HOST_ID = "incidencias-modal-bridge-host";
const FEEDBACK_HOST_ID = "incidencias-modal-bridge-feedback";
const MODAL_ROOT_SELECTOR = "[data-incidencias-modal-root='true']";
const ROUTE_HOST_SELECTOR =
  "[data-route-host='true'][data-route-host-state='ready']:not([hidden])[data-route-path]";
const STYLE_TIMEOUT_MS = 4_000;

const STYLE_PATHS = Object.freeze([
  "/src/css/components/detail-modal.css",
  "/src/css/views/incidencias/detail.css",
  "/src/css/views/incidencias/media-preview.css",
]);

let bridgeHost = null;
let bridgeController = null;
let closeObserver = null;
let feedbackHost = null;
let activeFeedback = null;
let openSequence = 0;
let modulePromise = null;
let detailStateAuthorityPromise = null;
let detailStateAuthorityReady = false;
let avatarEnhancementsPromise = null;
let avatarEnhancementsReady = false;
let primed = false;
let lastOpenFailed = false;

const stylePromises = new Map();

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output || fallback;
}

function absoluteUrl(path = "") {
  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return cleanText(path, "");
  }
}

function currentOwnerIsIncidencias() {
  if (!isBrowser()) return false;

  const committed = document.querySelector(ROUTE_HOST_SELECTOR);
  const pathname = cleanText(
    committed?.dataset?.routePath || window.location?.pathname || "",
    ""
  )
    .split("?")[0]
    .split("#")[0]
    .toLowerCase();

  return pathname.split("/").filter(Boolean).includes("incidencias");
}

function ensureStyle(path = "") {
  const href = absoluteUrl(path);
  if (!href || !isBrowser()) return Promise.resolve(false);
  if (stylePromises.has(href)) return stylePromises.get(href);

  const existing = Array.from(
    document.querySelectorAll("link[rel='stylesheet']")
  ).find((link) => link.href === href);

  if (existing?.sheet) {
    const ready = Promise.resolve(true);
    stylePromises.set(href, ready);
    return ready;
  }

  const promise = new Promise((resolve) => {
    const link = existing || document.createElement("link");
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      link.removeEventListener("load", onLoad);
      link.removeEventListener("error", onError);
      resolve(Boolean(ok));
    };

    const onLoad = () => finish(true);
    const onError = () => finish(false);
    const timeoutId = window.setTimeout(
      () => finish(Boolean(link.sheet)),
      STYLE_TIMEOUT_MS
    );

    link.addEventListener("load", onLoad, { once: true });
    link.addEventListener("error", onError, { once: true });

    if (!existing) {
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.incidenciasModalBridgeStyle = "true";
      document.head.appendChild(link);
    }
  });

  stylePromises.set(href, promise);

  void promise.then((ok) => {
    if (!ok && stylePromises.get(href) === promise) {
      stylePromises.delete(href);
    }
  });

  return promise;
}

async function ensureStyles() {
  const results = await Promise.all(
    STYLE_PATHS.map((path) => ensureStyle(path))
  );
  return results.every(Boolean);
}

function loadIncidenciasModule() {
  if (!modulePromise) {
    const pending = import("../../views/incidencias/index.js")
      .catch((error) => {
        if (modulePromise === pending) modulePromise = null;
        throw error;
      });

    modulePromise = pending;
  }

  return modulePromise;
}

/*
  AUTORIDAD ÚNICA DE TURNO/COMPOSER.

  La ruta /incidencias ya carga este mismo módulo desde App Enhancements. El
  bridge no calcula permisos ni mantiene un segundo estado: importa exactamente
  la misma autoridad y exige que esté montada antes de crear/abrir el controller
  transversal. El cache nativo de ESM garantiza una única instancia de módulo.
*/
function loadIncidenciasDetailStateAuthority() {
  if (detailStateAuthorityPromise) {
    return detailStateAuthorityPromise;
  }

  const pending = import("../incidencias-detail-state/index.js")
    .then((authority) => {
      if (typeof authority?.mountIncidenciasDetailState !== "function") {
        throw new Error("INCIDENCIA_DETAIL_STATE_AUTHORITY_UNAVAILABLE");
      }

      const mounted = authority.mountIncidenciasDetailState();
      const snapshot =
        authority.getIncidenciasDetailStateSnapshot?.() ||
        authority.default?.getSnapshot?.() ||
        {};

      if (mounted !== true && snapshot?.mounted !== true) {
        throw new Error("INCIDENCIA_DETAIL_STATE_AUTHORITY_NOT_MOUNTED");
      }

      detailStateAuthorityReady = true;
      return authority;
    })
    .catch((error) => {
      detailStateAuthorityReady = false;

      if (detailStateAuthorityPromise === pending) {
        detailStateAuthorityPromise = null;
      }

      throw error;
    });

  detailStateAuthorityPromise = pending;
  return pending;
}

function loadIncidenciasAvatarEnhancements() {
  if (avatarEnhancementsPromise) return avatarEnhancementsPromise;

  const pending = Promise.all([
    import("../incidencias-comment-avatars/index.js"),
    import("../incidencias-followup-avatars/index.js"),
  ])
    .then(([comments, followup]) => {
      comments?.mountIncidenciasCommentAvatars?.();
      followup?.mountIncidenciasFollowupAvatars?.();
      avatarEnhancementsReady = true;

      return Object.freeze({
        comments,
        followup,
      });
    })
    .catch(() => {
      /*
        Los avatares son mejora progresiva: un fallo de chunk/CSS no puede
        bloquear la apertura del detalle canónico. Se permite reintento en la
        siguiente apertura dejando el promise vacío.
      */
      avatarEnhancementsReady = false;
      if (avatarEnhancementsPromise === pending) {
        avatarEnhancementsPromise = null;
      }
      return null;
    });

  avatarEnhancementsPromise = pending;
  return pending;
}

function syncIncidenciasAvatarEnhancements(enhancements = null) {
  if (!isBrowser() || !enhancements) return false;

  let synced = false;

  try {
    enhancements.comments?.syncIncidenciasCommentAvatars?.(document);
    synced = true;
  } catch {
    // noop
  }

  try {
    enhancements.followup?.syncIncidenciasFollowupAvatars?.(document);
    synced = true;
  } catch {
    // noop
  }

  return synced;
}

function ensureBridgeHost() {
  if (!isBrowser()) return null;
  if (bridgeHost?.isConnected) return bridgeHost;

  document.getElementById(BRIDGE_HOST_ID)?.remove?.();

  bridgeHost = document.createElement("div");
  bridgeHost.id = BRIDGE_HOST_ID;
  bridgeHost.hidden = true;
  bridgeHost.setAttribute("aria-hidden", "true");
  bridgeHost.setAttribute("data-incidencias-modal-bridge-host", "true");
  document.body.appendChild(bridgeHost);
  return bridgeHost;
}

function ensureFeedbackHost() {
  if (!isBrowser()) return null;
  if (feedbackHost?.isConnected) return feedbackHost;

  document.getElementById(FEEDBACK_HOST_ID)?.remove?.();

  feedbackHost = document.createElement("div");
  feedbackHost.id = FEEDBACK_HOST_ID;
  feedbackHost.setAttribute("data-incidencias-modal-bridge-feedback", "true");
  document.body.appendChild(feedbackHost);
  return feedbackHost;
}

function clearBridgeFeedback() {
  if (!isBrowser()) {
    activeFeedback = null;
    feedbackHost = null;
    return false;
  }

  activeFeedback = null;

  try {
    feedbackHost?.replaceChildren?.();
    feedbackHost?.remove?.();
  } catch {
    // noop
  }

  feedbackHost = null;
  document.body?.classList?.remove("incidencias-modal-bridge-feedback-open");
  return true;
}

function showBridgeFeedback(
  ticketId = "",
  {
    state = "loading",
    message = "",
    openerNode = null,
    context = {},
  } = {}
) {
  if (!isBrowser()) return false;

  const id = cleanText(ticketId, "");
  if (!id) return false;

  const mode = state === "error" ? "error" : "loading";
  const host = ensureFeedbackHost();
  if (!host) return false;

  activeFeedback = {
    ticketId: id,
    state: mode,
    openerNode: openerNode?.isConnected ? openerNode : null,
    context: context && typeof context === "object" ? context : {},
  };

  host.replaceChildren();
  host.dataset.state = mode;

  const overlay = document.createElement("div");
  overlay.className = "incidencia-bridge-feedback-overlay";
  overlay.dataset.incidenciaBridgeFeedbackOverlay = "true";

  const panel = document.createElement("section");
  panel.className = "incidencia-bridge-feedback-panel";
  panel.dataset.incidenciaBridgeFeedbackPanel = "true";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "incidencia-bridge-feedback-title");
  panel.setAttribute("aria-describedby", "incidencia-bridge-feedback-description");
  panel.tabIndex = -1;

  const visual = document.createElement("div");
  visual.className = `incidencia-bridge-feedback-visual incidencia-bridge-feedback-visual--${mode}`;
  visual.setAttribute("aria-hidden", "true");

  if (mode === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "incidencia-bridge-feedback-spinner";
    visual.appendChild(spinner);
  } else {
    visual.textContent = "!";
  }

  const copy = document.createElement("div");
  copy.className = "incidencia-bridge-feedback-copy";

  const eyebrow = document.createElement("span");
  eyebrow.className = "incidencia-bridge-feedback-eyebrow";
  eyebrow.textContent = `Incidencia ${id}`;

  const title = document.createElement("h3");
  title.id = "incidencia-bridge-feedback-title";
  title.textContent = mode === "loading"
    ? "Abriendo detalle"
    : "No se pudo abrir la incidencia";

  const description = document.createElement("p");
  description.id = "incidencia-bridge-feedback-description";
  description.setAttribute("aria-live", mode === "error" ? "assertive" : "polite");
  description.textContent = cleanText(
    message,
    mode === "loading"
      ? "Estamos cargando el detalle completo y verificando su información."
      : "La incidencia no se ha perdido. Puedes reintentar la apertura ahora."
  );

  copy.append(eyebrow, title, description);

  const actions = document.createElement("div");
  actions.className = "incidencia-bridge-feedback-actions";

  if (mode === "error") {
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "incidencia-bridge-feedback-button incidencia-bridge-feedback-button--primary";
    retryButton.dataset.incidenciaBridgeFeedbackAction = "retry";
    retryButton.textContent = "Reintentar";
    retryButton.addEventListener("click", () => {
      const retry = activeFeedback;
      if (!retry?.ticketId) return;

      const retryId = retry.ticketId;
      const retryOpener = retry.openerNode;
      const retryContext = retry.context;
      clearBridgeFeedback();

      void openIncidenciaModalFromCurrentView(
        retryId,
        retryOpener,
        retryContext
      );
    });
    actions.appendChild(retryButton);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "incidencia-bridge-feedback-button incidencia-bridge-feedback-button--secondary";
  closeButton.dataset.incidenciaBridgeFeedbackAction = "close";
  closeButton.textContent = mode === "loading" ? "Cancelar" : "Cerrar";
  closeButton.addEventListener("click", () => {
    destroyIncidenciaModalBridge();
  });
  actions.appendChild(closeButton);

  panel.append(visual, copy, actions);
  overlay.appendChild(panel);
  host.appendChild(overlay);
  document.body?.classList?.add("incidencias-modal-bridge-feedback-open");

  nextMicrotaskFocus(
    mode === "error"
      ? host.querySelector("[data-incidencia-bridge-feedback-action='retry']")
      : panel
  );

  return true;
}

function nextMicrotaskFocus(node = null) {
  if (!node?.focus) return false;

  queueMicrotask(() => {
    if (!node?.isConnected) return;
    try {
      node.focus({ preventScroll: true });
    } catch {
      try {
        node.focus();
      } catch {
        // noop
      }
    }
  });

  return true;
}

function stopCloseObserver() {
  closeObserver?.disconnect?.();
  closeObserver = null;
}

function disposeBridge({ invalidate = true, feedback = true } = {}) {
  if (invalidate) openSequence += 1;
  stopCloseObserver();

  const controller = bridgeController;
  bridgeController = null;

  try {
    controller?.destroy?.();
  } catch {
    // noop
  }

  try {
    bridgeHost?.replaceChildren?.();
    bridgeHost?.remove?.();
  } catch {
    // noop
  }

  bridgeHost = null;

  if (feedback) {
    clearBridgeFeedback();
  }

  return true;
}

function watchBridgeModalClose() {
  stopCloseObserver();
  if (!isBrowser() || typeof MutationObserver !== "function") return false;

  let modalSeen = Boolean(document.querySelector(MODAL_ROOT_SELECTOR));

  closeObserver = new MutationObserver(() => {
    const open = Boolean(document.querySelector(MODAL_ROOT_SELECTOR));

    if (open) {
      modalSeen = true;
      return;
    }

    if (modalSeen) {
      disposeBridge({ invalidate: true, feedback: true });
    }
  });

  closeObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return true;
}

async function ensureBridgeController(module, context = {}) {
  const snapshot = bridgeController?.getSnapshot?.();
  if (
    bridgeController &&
    bridgeHost?.isConnected &&
    snapshot?.destroyed !== true
  ) {
    return bridgeController;
  }

  /*
    Limpia restos de una instancia anterior SIN invalidar la apertura actual.
    La invalidación sólo pertenece a cierres externos o nuevas aperturas.
  */
  disposeBridge({ invalidate: false, feedback: false });

  const host = ensureBridgeHost();
  if (!host || typeof module?.IncidenciasView !== "function") return null;

  const safeContext = context && typeof context === "object" ? context : {};
  bridgeController = await module.IncidenciasView(host, {
    ...safeContext,
    modalBridge: true,
    source: "incidencia-modal-bridge",
  });

  return bridgeController;
}

function syncAvatarEnhancementsWhenReady(
  promise = null,
  sequence = openSequence
) {
  void Promise.resolve(promise)
    .then((enhancements) => {
      if (
        sequence !== openSequence ||
        !document.querySelector(MODAL_ROOT_SELECTOR)
      ) {
        return false;
      }

      return syncIncidenciasAvatarEnhancements(enhancements);
    })
    .catch(() => false);
}

export function primeIncidenciaModalBridge() {
  if (!isBrowser()) return false;

  primed = true;

  void loadIncidenciasModule().catch(() => null);
  void loadIncidenciasDetailStateAuthority().catch(() => null);
  void ensureStyles().catch(() => false);
  void loadIncidenciasAvatarEnhancements().catch(() => null);

  return true;
}

export async function openIncidenciaModalFromCurrentView(
  ticketId = "",
  openerNode = null,
  context = {}
) {
  const id = cleanText(ticketId, "");
  if (!id || !isBrowser()) return false;

  const sequence = ++openSequence;
  const safeContext = context && typeof context === "object" ? context : {};

  lastOpenFailed = false;

  /*
    Primer paint inmediato: el usuario recibe feedback antes de esperar chunk,
    CSS, controller, red o los reintentos de integridad del Detail.
  */
  showBridgeFeedback(id, {
    state: "loading",
    openerNode,
    context: safeContext,
  });

  /*
    Los avatares son estrictamente progresivos. Arrancan en paralelo pero
    nunca forman parte del await que gobierna la apertura del modal.
  */
  const avatarEnhancements = loadIncidenciasAvatarEnhancements();

  try {
    /*
      Detail State es dependencia dura del Modal Details transversal. Así el
      controller nunca llega a pintar un composer antes de que la MISMA
      autoridad que usa /incidencias esté observando las leases en body.
    */
    const [module] = await Promise.all([
      loadIncidenciasModule(),
      loadIncidenciasDetailStateAuthority(),
      ensureStyles(),
    ]);

    if (sequence !== openSequence) return false;

    /*
      El singleton histórico sólo es owner cuando /incidencias es realmente la
      ruta activa. Un controller bridge previo nunca puede apropiarse de una
      apertura lanzada desde otra vista.
    */
    if (
      currentOwnerIsIncidencias() &&
      typeof module?.openIncidenciaDetailById === "function"
    ) {
      const openedByOwner = await module.openIncidenciaDetailById(
        id,
        openerNode
      );

      if (sequence !== openSequence) return false;

      if (openedByOwner) {
        clearBridgeFeedback();
        syncAvatarEnhancementsWhenReady(avatarEnhancements, sequence);
        return true;
      }
    }

    const controller = await ensureBridgeController(module, safeContext);
    if (
      sequence !== openSequence ||
      !controller ||
      typeof controller.openDetail !== "function"
    ) {
      if (sequence === openSequence) {
        throw new Error("INCIDENCIA_MODAL_CONTROLLER_UNAVAILABLE");
      }
      return false;
    }

    const opened = Boolean(await controller.openDetail(id, openerNode));
    if (sequence !== openSequence) return false;

    if (opened) {
      clearBridgeFeedback();
      syncAvatarEnhancementsWhenReady(avatarEnhancements, sequence);
      watchBridgeModalClose();
      return true;
    }

    throw new Error("INCIDENCIA_MODAL_OPEN_FAILED");
  } catch {
    if (sequence !== openSequence) return false;

    lastOpenFailed = true;
    disposeBridge({ invalidate: false, feedback: false });

    showBridgeFeedback(id, {
      state: "error",
      message:
        "No hemos podido completar la carga del detalle. Puedes reintentarlo sin salir de esta vista.",
      openerNode,
      context: safeContext,
    });

    return false;
  }
}

export function destroyIncidenciaModalBridge() {
  return disposeBridge({ invalidate: true, feedback: true });
}

export function getIncidenciaModalBridgeSnapshot() {
  const snapshot = bridgeController?.getSnapshot?.() || null;

  return Object.freeze({
    version: INCIDENCIA_MODAL_BRIDGE_VERSION,
    active: Boolean(bridgeController && bridgeHost?.isConnected),
    modalOpen: Boolean(
      isBrowser() && document.querySelector(MODAL_ROOT_SELECTOR)
    ),
    feedbackOpen: Boolean(feedbackHost?.isConnected),
    feedbackState: cleanText(activeFeedback?.state, ""),
    primed,
    lastOpenFailed,
    detailStateAuthorityReady,
    avatarEnhancementsReady,
    controller: snapshot,
  });
}

primeIncidenciaModalBridge();

export default Object.freeze({
  version: INCIDENCIA_MODAL_BRIDGE_VERSION,
  prime: primeIncidenciaModalBridge,
  open: openIncidenciaModalFromCurrentView,
  destroy: destroyIncidenciaModalBridge,
  getSnapshot: getIncidenciaModalBridgeSnapshot,
});
