/* =========================================================
   Onion Support - Factura Modal Bridge

   Abre el modal canónico de Facturas sobre la vista actual sin navegar. El
   controller real de Facturas conserva toda la autoridad de carga, acciones,
   foco, cierre y mutaciones; el bridge sólo aporta una isla técnica oculta,
   precarga por intención y cleanup transversal.

   Contrato Home:
   - pathname, history y host visible permanecen intactos;
   - primer feedback antes de imports/CSS/red;
   - módulo, CSS y detalle se precalientan en paralelo;
   - el shell canónico se muestra antes de esperar la hidratación remota;
   - una relación hacia Incidencias abre su modal transversal sin navegar.
========================================================= */

import "./style.css";

export const FACTURA_MODAL_BRIDGE_VERSION =
  "factura-modal-bridge.v1-home-stay-owner-controller";

const BRIDGE_HOST_ID = "facturas-modal-bridge-host";
const FEEDBACK_HOST_ID = "facturas-modal-bridge-feedback";
const DETAIL_HOST_ID = "facturas-detail-root";

const DETAIL_ROOT_SELECTOR =
  "[data-facturas-detail-root='true']";

const OPEN_INCIDENCIA_SELECTOR = [
  "[data-facturas-action='open-incidencia']",
  "[data-action='open-incidencia']",
].join(",");

const ROUTE_HOST_SELECTOR =
  "[data-route-host='true'][data-route-host-state='ready']:not([hidden])";

const HOME_SCOPE_SELECTOR =
  "[data-home-scope='true']";

const ROUTE_OBSERVATION_ROOT =
  "#view-container, [data-view-container='true']";

const ENTITY_OVERLAY_IGNORE_ATTRIBUTE =
  "data-entity-overlay-ignore";

const ROUTER_EVENT_HANDLED_KEY =
  "__onionRouterHandled";

const STYLE_TIMEOUT_MS = 4_000;
const MODAL_SHELL_TIMEOUT_MS = 1_500;

const STYLE_PATHS = Object.freeze([
  "/src/css/views/facturas/detail.css",
]);

let bridgeHost = null;
let bridgeController = null;
let feedbackHost = null;
let activeFeedback = null;
let closeObserver = null;
let originObserver = null;
let relationInstalled = false;
let relationOpening = false;
let openSequence = 0;
let modulePromise = null;
let apiPromise = null;
let relatedIncidenciaModule = null;
let primed = false;
let lastOpenFailed = false;

let activeOriginHost = null;
let activeOpener = null;
let activeFacturaId = "";
let activeContext = {};

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

function cleanId(value = "") {
  return cleanText(value, "")
    .replace(/[\r\n\t]/g, "")
    .slice(0, 160);
}

function eventTarget(event = null) {
  const target = event?.target;
  return target?.nodeType === 3 ? target.parentElement : target;
}

function absoluteUrl(path = "") {
  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return cleanText(path, "");
  }
}

function homeRouteHostFrom(node = null) {
  const scope = node?.closest?.(HOME_SCOPE_SELECTOR) || null;
  const routeHost = scope?.closest?.(ROUTE_HOST_SELECTOR) || null;
  if (!scope || !routeHost || !routeHost.contains(scope)) return null;

  const viewKey = cleanText(routeHost.dataset?.viewKey, "").toLowerCase();
  return !viewKey || viewKey === "home" ? routeHost : null;
}

function originHomeStillCommitted() {
  if (!activeOriginHost?.isConnected || activeOriginHost.hidden) return false;
  if (activeOriginHost.getAttribute?.("data-route-host-state") !== "ready") return false;
  if (!activeOriginHost.querySelector?.(HOME_SCOPE_SELECTOR)) return false;

  const current = document.querySelector(ROUTE_HOST_SELECTOR);
  return current === activeOriginHost;
}

function loadFacturasModule() {
  if (!modulePromise) {
    const pending = import("../../views/facturas/index.js")
      .catch((error) => {
        if (modulePromise === pending) modulePromise = null;
        throw error;
      });

    modulePromise = pending;
  }

  return modulePromise;
}

function loadFacturasApi() {
  if (!apiPromise) {
    const pending = import("../../views/facturas/facturas.api.js")
      .catch((error) => {
        if (apiPromise === pending) apiPromise = null;
        throw error;
      });

    apiPromise = pending;
  }

  return apiPromise;
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
      link.dataset.facturaModalBridgeStyle = "true";
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

function ensureBridgeHost() {
  if (!isBrowser()) return null;
  if (bridgeHost?.isConnected) return bridgeHost;

  document.getElementById(BRIDGE_HOST_ID)?.remove?.();

  bridgeHost = document.createElement("div");
  bridgeHost.id = BRIDGE_HOST_ID;
  bridgeHost.hidden = true;
  bridgeHost.setAttribute("aria-hidden", "true");
  bridgeHost.setAttribute("data-facturas-modal-bridge-host", "true");
  bridgeHost.setAttribute(ENTITY_OVERLAY_IGNORE_ATTRIBUTE, "true");
  document.body.appendChild(bridgeHost);
  return bridgeHost;
}

function ensureFeedbackHost() {
  if (!isBrowser()) return null;
  if (feedbackHost?.isConnected) return feedbackHost;

  document.getElementById(FEEDBACK_HOST_ID)?.remove?.();

  feedbackHost = document.createElement("div");
  feedbackHost.id = FEEDBACK_HOST_ID;
  feedbackHost.setAttribute("data-facturas-modal-bridge-feedback", "true");
  feedbackHost.setAttribute(ENTITY_OVERLAY_IGNORE_ATTRIBUTE, "true");
  document.body.appendChild(feedbackHost);
  return feedbackHost;
}

function nextMicrotaskFocus(node = null) {
  if (!node?.focus) return false;

  queueMicrotask(() => {
    if (!node?.isConnected) return;

    try {
      node.focus({ preventScroll: true });
    } catch {
      try { node.focus(); } catch { /* noop */ }
    }
  });

  return true;
}

function clearBridgeFeedback() {
  activeFeedback = null;

  if (!isBrowser()) {
    feedbackHost = null;
    return false;
  }

  try {
    feedbackHost?.replaceChildren?.();
    feedbackHost?.remove?.();
  } catch {
    // noop
  }

  feedbackHost = null;
  document.body?.classList?.remove("factura-modal-bridge-feedback-open");
  return true;
}

function showBridgeFeedback(
  facturaId = "",
  {
    state = "loading",
    message = "",
    openerNode = null,
    context = {},
  } = {}
) {
  if (!isBrowser()) return false;

  const id = cleanId(facturaId);
  if (!id) return false;

  const mode = state === "error" ? "error" : "loading";
  const host = ensureFeedbackHost();
  if (!host) return false;

  activeFeedback = {
    facturaId: id,
    state: mode,
    openerNode: openerNode?.isConnected ? openerNode : null,
    context: context && typeof context === "object" ? context : {},
  };

  host.replaceChildren();
  host.dataset.state = mode;

  const overlay = document.createElement("div");
  overlay.className = "factura-bridge-feedback-overlay";
  overlay.dataset.facturaBridgeFeedbackOverlay = "true";

  const panel = document.createElement("section");
  panel.className = "factura-bridge-feedback-panel";
  panel.dataset.facturaBridgeFeedbackPanel = "true";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "factura-bridge-feedback-title");
  panel.setAttribute("aria-describedby", "factura-bridge-feedback-description");
  panel.tabIndex = -1;

  const visual = document.createElement("div");
  visual.className = `factura-bridge-feedback-visual factura-bridge-feedback-visual--${mode}`;
  visual.setAttribute("aria-hidden", "true");

  if (mode === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "factura-bridge-feedback-spinner";
    visual.appendChild(spinner);
  } else {
    visual.textContent = "!";
  }

  const copy = document.createElement("div");
  copy.className = "factura-bridge-feedback-copy";

  const eyebrow = document.createElement("span");
  eyebrow.className = "factura-bridge-feedback-eyebrow";
  eyebrow.textContent = "Factura";

  const title = document.createElement("h3");
  title.id = "factura-bridge-feedback-title";
  title.textContent = mode === "loading"
    ? "Abriendo detalle"
    : "No se pudo abrir la factura";

  const description = document.createElement("p");
  description.id = "factura-bridge-feedback-description";
  description.setAttribute("aria-live", mode === "error" ? "assertive" : "polite");
  description.textContent = cleanText(
    message,
    mode === "loading"
      ? "Estamos preparando el modal completo sin abandonar el inicio."
      : "La factura sigue disponible. Puedes reintentar la apertura sin salir del inicio."
  );

  copy.append(eyebrow, title, description);

  const actions = document.createElement("div");
  actions.className = "factura-bridge-feedback-actions";

  if (mode === "error") {
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "factura-bridge-feedback-button factura-bridge-feedback-button--primary";
    retryButton.dataset.facturaBridgeFeedbackAction = "retry";
    retryButton.textContent = "Reintentar";
    retryButton.addEventListener("click", () => {
      const retry = activeFeedback;
      if (!retry?.facturaId) return;

      const retryId = retry.facturaId;
      const retryOpener = retry.openerNode;
      const retryContext = retry.context;
      clearBridgeFeedback();

      void openFacturaModalFromCurrentView(
        retryId,
        retryOpener,
        retryContext
      );
    });
    actions.appendChild(retryButton);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "factura-bridge-feedback-button factura-bridge-feedback-button--secondary";
  closeButton.dataset.facturaBridgeFeedbackAction = "close";
  closeButton.textContent = mode === "loading" ? "Cancelar" : "Cerrar";
  closeButton.addEventListener("click", () => {
    destroyFacturaModalBridge();
  });
  actions.appendChild(closeButton);

  panel.append(visual, copy, actions);
  overlay.appendChild(panel);
  host.appendChild(overlay);
  document.body?.classList?.add("factura-modal-bridge-feedback-open");

  nextMicrotaskFocus(
    mode === "error"
      ? host.querySelector("[data-factura-bridge-feedback-action='retry']")
      : panel
  );

  return true;
}

function stopCloseObserver() {
  closeObserver?.disconnect?.();
  closeObserver = null;
}

function stopOriginObserver() {
  originObserver?.disconnect?.();
  originObserver = null;
}

function restoreHomeFocus(
  originHost = null,
  openerNode = null,
  facturaId = ""
) {
  if (!isBrowser() || !originHost?.isConnected) return false;

  window.requestAnimationFrame?.(() => {
    let target = openerNode?.isConnected ? openerNode : null;

    if (!target && facturaId) {
      target = Array.from(
        originHost.querySelectorAll(
          "[data-home-entity-source][data-entity-type='factura'][data-entity-id]"
        )
      ).find((node) => cleanId(node.dataset?.entityId) === facturaId) || null;
    }

    if (!target?.focus) return;

    try {
      target.focus({ preventScroll: true });
    } catch {
      try { target.focus(); } catch { /* noop */ }
    }
  });

  return true;
}

function disposeBridge({
  invalidate = true,
  feedback = true,
  restoreFocus = false,
  preserveOrigin = false,
} = {}) {
  if (invalidate) openSequence += 1;

  stopCloseObserver();
  stopOriginObserver();

  const controller = bridgeController;
  const originHost = activeOriginHost;
  const openerNode = activeOpener;
  const facturaId = activeFacturaId;

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
  relationOpening = false;

  if (feedback) clearBridgeFeedback();
  if (restoreFocus) restoreHomeFocus(originHost, openerNode, facturaId);

  if (!preserveOrigin) {
    activeOriginHost = null;
    activeOpener = null;
    activeFacturaId = "";
    activeContext = {};
  }

  return true;
}

function markCanonicalModalOrigin() {
  if (!isBrowser()) return null;

  const host = document.getElementById(DETAIL_HOST_ID);
  const root = host?.querySelector?.(DETAIL_ROOT_SELECTOR) ||
    document.querySelector(DETAIL_ROOT_SELECTOR);

  for (const node of [host, root]) {
    if (!node?.setAttribute) continue;
    node.setAttribute(ENTITY_OVERLAY_IGNORE_ATTRIBUTE, "true");
    node.setAttribute("data-entity-modal-origin", "home");
    node.setAttribute("data-factura-modal-bridge", "true");
  }

  return root || null;
}

function waitForModalShell(sequence = openSequence) {
  const immediate = markCanonicalModalOrigin();
  if (immediate) return Promise.resolve(immediate);

  if (!isBrowser() || typeof MutationObserver !== "function") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;

    const finish = (root = null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeoutId);
      resolve(root);
    };

    const observer = new MutationObserver(() => {
      if (sequence !== openSequence) {
        finish(null);
        return;
      }

      const root = markCanonicalModalOrigin();
      if (root) finish(root);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const timeoutId = window.setTimeout(
      () => finish(markCanonicalModalOrigin()),
      MODAL_SHELL_TIMEOUT_MS
    );
  });
}

function watchBridgeModalClose() {
  stopCloseObserver();
  if (!isBrowser() || typeof MutationObserver !== "function") return false;

  let modalSeen = Boolean(markCanonicalModalOrigin());

  closeObserver = new MutationObserver(() => {
    const root = markCanonicalModalOrigin();

    if (root) {
      modalSeen = true;
      return;
    }

    if (modalSeen) {
      disposeBridge({
        invalidate: true,
        feedback: true,
        restoreFocus: true,
      });
    }
  });

  closeObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return true;
}

function watchOriginRoute() {
  stopOriginObserver();
  if (!isBrowser() || typeof MutationObserver !== "function") return false;

  const root = document.querySelector(ROUTE_OBSERVATION_ROOT);
  if (!root) return false;

  originObserver = new MutationObserver(() => {
    queueMicrotask(() => {
      if (!originHomeStillCommitted()) {
        disposeBridge({
          invalidate: true,
          feedback: true,
          restoreFocus: false,
        });
      }
    });
  });

  originObserver.observe(root, {
    childList: true,
    subtree: false,
    attributes: true,
    attributeFilter: ["hidden", "data-route-host-state"],
  });

  return true;
}

async function ensureBridgeController(module = null, context = {}) {
  const snapshot = bridgeController?.getSnapshot?.() || null;

  if (
    bridgeController &&
    bridgeHost?.isConnected &&
    snapshot?.destroyed !== true
  ) {
    return bridgeController;
  }

  disposeBridge({
    invalidate: false,
    feedback: false,
    restoreFocus: false,
    preserveOrigin: true,
  });

  const host = ensureBridgeHost();
  if (!host || typeof module?.FacturasView !== "function") return null;

  const safeContext = context && typeof context === "object" ? context : {};

  bridgeController = await module.FacturasView(host, {
    ...safeContext,
    modalBridge: true,
    source: "factura-modal-bridge",
  });

  return bridgeController;
}

function actionFrom(node = null) {
  return cleanText(
    node?.dataset?.facturasAction ||
    node?.dataset?.action ||
    "",
    ""
  );
}

function ticketIdFrom(node = null) {
  return cleanText(
    node?.dataset?.ticketId ||
    node?.dataset?.incidenciaId ||
    "",
    ""
  );
}

async function onRelatedIncidenciaClick(event = null) {
  if (!bridgeController || relationOpening || !markCanonicalModalOrigin()) return;

  const target = eventTarget(event);
  const actionNode = target?.closest?.(OPEN_INCIDENCIA_SELECTOR) || null;
  if (!actionNode || actionFrom(actionNode) !== "open-incidencia") return;

  const detailRoot = actionNode.closest?.(DETAIL_ROOT_SELECTOR);
  if (!detailRoot || !detailRoot.hasAttribute("data-factura-modal-bridge")) return;

  const ticketId = ticketIdFrom(actionNode);
  if (!ticketId) return;

  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();

  try {
    event[ROUTER_EVENT_HANDLED_KEY] = true;
  } catch {
    // noop
  }

  relationOpening = true;

  const opener = activeOpener?.isConnected ? activeOpener : null;
  const context = activeContext;
  const controller = bridgeController;

  try {
    const closed = controller?.closeDetailModal?.();
    if (closed === false) return;

    disposeBridge({
      invalidate: true,
      feedback: true,
      restoreFocus: false,
    });

    relatedIncidenciaModule = await import("../incidencia-modal-bridge/index.js");

    await relatedIncidenciaModule?.openIncidenciaModalFromCurrentView?.(
      ticketId,
      opener,
      {
        ...context,
        source: "home.factura.related-incidencia",
        originView: "home",
        stayInView: true,
      }
    );
  } finally {
    relationOpening = false;
  }
}

function installRelationInterceptor() {
  if (!isBrowser() || relationInstalled) return relationInstalled;

  document.addEventListener("click", onRelatedIncidenciaClick, true);
  relationInstalled = true;
  return true;
}

function uninstallRelationInterceptor() {
  if (isBrowser() && relationInstalled) {
    document.removeEventListener("click", onRelatedIncidenciaClick, true);
  }

  relationInstalled = false;
  relationOpening = false;
  return true;
}

export function primeFacturaModalBridge(facturaId = "", options = {}) {
  if (!isBrowser()) return false;

  primed = true;
  installRelationInterceptor();

  void loadFacturasModule().catch(() => null);
  void ensureStyles().catch(() => false);

  const id = cleanId(facturaId);
  if (id) {
    void loadFacturasApi()
      .then((module) => {
        const prefetch =
          module?.prefetchFacturaDetail ||
          module?.default?.prefetchFacturaDetail;

        return typeof prefetch === "function"
          ? prefetch(id, {
              ...options,
              source: options?.source || "factura-modal-bridge.prime",
            })
          : null;
      })
      .catch(() => null);
  }

  return true;
}

export async function openFacturaModalFromCurrentView(
  facturaId = "",
  openerNode = null,
  context = {}
) {
  const id = cleanId(facturaId);
  if (!id || !isBrowser()) return false;

  const originHost = homeRouteHostFrom(openerNode);
  if (!originHost) return false;

  const sequence = ++openSequence;
  const safeContext = context && typeof context === "object" ? context : {};

  activeOriginHost = originHost;
  activeOpener = openerNode?.isConnected ? openerNode : null;
  activeFacturaId = id;
  activeContext = safeContext;
  lastOpenFailed = false;

  installRelationInterceptor();

  /* Primer paint antes de esperar chunk, CSS, controller o red. */
  showBridgeFeedback(id, {
    state: "loading",
    openerNode,
    context: safeContext,
  });

  /* La hidratación empieza en paralelo y comparte cache/single-flight. */
  const detailWarmup = loadFacturasApi()
    .then((module) => {
      const prefetch =
        module?.prefetchFacturaDetail ||
        module?.default?.prefetchFacturaDetail;

      return typeof prefetch === "function"
        ? prefetch(id, {
            source: "factura-modal-bridge.open",
          })
        : null;
    })
    .catch(() => null);

  try {
    const [module, stylesReady] = await Promise.all([
      loadFacturasModule(),
      ensureStyles(),
    ]);

    if (sequence !== openSequence || !originHomeStillCommitted()) return false;
    if (!stylesReady) throw new Error("FACTURA_MODAL_STYLES_UNAVAILABLE");

    const controller = await ensureBridgeController(module, safeContext);

    if (
      sequence !== openSequence ||
      !controller ||
      typeof controller.openFactura !== "function"
    ) {
      throw new Error("FACTURA_MODAL_CONTROLLER_UNAVAILABLE");
    }

    /*
      openFactura monta el shell de forma síncrona antes de su primer await.
      Conservamos el Promise para validar la hidratación sin bloquear el paint.
    */
    const openTask = Promise.resolve(
      controller.openFactura(id, openerNode)
    );

    const shell = await waitForModalShell(sequence);
    if (sequence !== openSequence || !originHomeStillCommitted()) return false;

    if (shell) {
      clearBridgeFeedback();
      watchBridgeModalClose();
      watchOriginRoute();
    }

    const opened = await openTask;
    await detailWarmup;

    if (sequence !== openSequence || !originHomeStillCommitted()) return false;

    const modalOpen = Boolean(markCanonicalModalOrigin());

    if (modalOpen) {
      clearBridgeFeedback();
      watchBridgeModalClose();
      watchOriginRoute();
      return true;
    }

    if (opened) return true;
    throw new Error("FACTURA_MODAL_OPEN_FAILED");
  } catch {
    if (sequence !== openSequence) return false;

    lastOpenFailed = true;

    disposeBridge({
      invalidate: false,
      feedback: false,
      restoreFocus: false,
      preserveOrigin: true,
    });

    showBridgeFeedback(id, {
      state: "error",
      message:
        "No hemos podido completar la apertura. Puedes reintentarlo sin abandonar el inicio.",
      openerNode,
      context: safeContext,
    });

    return false;
  }
}

export function destroyFacturaModalBridge() {
  openSequence += 1;
  uninstallRelationInterceptor();

  disposeBridge({
    invalidate: false,
    feedback: true,
    restoreFocus: false,
  });

  try {
    relatedIncidenciaModule?.destroyIncidenciaModalBridge?.();
  } catch {
    // noop
  }

  relatedIncidenciaModule = null;
  return true;
}

export function getFacturaModalBridgeSnapshot() {
  const controller = bridgeController?.getSnapshot?.() || null;

  return Object.freeze({
    version: FACTURA_MODAL_BRIDGE_VERSION,
    active: Boolean(bridgeController && bridgeHost?.isConnected),
    modalOpen: Boolean(isBrowser() && markCanonicalModalOrigin()),
    feedbackOpen: Boolean(feedbackHost?.isConnected),
    feedbackState: cleanText(activeFeedback?.state, ""),
    originHomeCommitted: Boolean(isBrowser() && originHomeStillCommitted()),
    relationInterceptor: relationInstalled,
    relationOpening,
    primed,
    lastOpenFailed,
    controller,
    policy: Object.freeze({
      canonicalFacturasController: true,
      hiddenTechnicalHost: true,
      routeNavigation: false,
      historyMutation: false,
      pathnameStable: true,
      immediateFeedback: true,
      shellBeforeRemoteHydration: true,
      boundedDetailPrefetch: true,
      relatedIncidenciaStaysInHome: true,
      entityOverlayBoundary: true,
      restoresHomeFocus: true,
      rawIdentifiersInSnapshot: false,
    }),
  });
}

export default Object.freeze({
  version: FACTURA_MODAL_BRIDGE_VERSION,
  prime: primeFacturaModalBridge,
  preload: primeFacturaModalBridge,
  open: openFacturaModalFromCurrentView,
  destroy: destroyFacturaModalBridge,
  getSnapshot: getFacturaModalBridgeSnapshot,
});
