/* =========================================================
   Onion SPA - Entry Point
   Archivo: /src/main.js

   ONION SUPPORT · MAIN ENTRYPOINT
   PRIVATE SPA · SINGLE BOOT OWNER · CSP CLEAN · 10/10

   RESPONSABILIDADES:
   - Ser el único entrypoint físico cargado por index.html.
   - Esperar DOM ready de forma segura.
   - Capturar URL inicial mínima antes del boot lógico.
   - Invocar App.boot() una sola vez.
   - Evitar doble arranque.
   - Capturar errores fatales del arranque físico.
   - Exponer diagnóstico mínimo en window.OnionApp.main.
   - No montar UI.
   - No configurar Router/Auth/Store.
   - No controlar el loader salvo estado documental mínimo.
   - No contener CSS.
   - No inyectar estilos.
   - No duplicar lógica de src/app/index.js.
   - No duplicar lógica de src/app/loader.js.

   CONTRATO:
   - index.html carga /src/main.js.
   - src/app/index.js exporta App, pero NO autoarranca.
   - src/app/loader.js gobierna el loader real.
   - src/app/index.js gobierna bootstrap, restore, router, UI y finalize.
========================================================= */

import { App } from "./app/index.js";
import { AppCore } from "./core/index.js";

/* =========================================================
   CONSTANTS
========================================================= */

const MAIN_VERSION = "11.0.0";

const MAIN_SOURCE = "main";

const RUNTIME_KEY = "__ONION_MAIN__";

const INITIAL_URL_KEY = "__ONION_INITIAL_URL__";

const BOOT_CONTEXT_KEY = "__ONION_MAIN_BOOT_CONTEXT__";

const DEFAULT_FATAL_TITLE = "Error de arranque";

const DEFAULT_FATAL_MESSAGE = "No se pudo iniciar Onion Support.";

const SENSITIVE_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
  "access_token",
  "refresh_token",
  "id_token",
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
]);

const MAIN_EVENTS = Object.freeze({
  bootStart: "main:boot:start",
  bootReady: "main:boot:ready",
  bootError: "main:boot:error",
  fatalRendered: "main:fatal:rendered",
  initialUrlCaptured: "main:initial-url:captured",
  bridgeReady: "main:bridge:ready",
  globalError: "main:global:error",
  unhandledRejection: "main:global:unhandled-rejection",
});

/* =========================================================
   STATE
========================================================= */

const state = {
  version: MAIN_VERSION,

  started: false,
  settled: false,
  failed: false,

  bootPromise: null,

  startedAt: 0,
  settledAt: 0,

  readyBound: false,
  readyCallbackCalled: false,

  safetyNetBound: false,
  fatalRendered: false,
  debugBridgeExposed: false,

  lastBootContext: null,
  lastError: null,
};

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function nowIso(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

/* =========================================================
   TOKEN REDACTION
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function redactSensitiveText(value = "") {
  let output = safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    for (const name of SENSITIVE_PARAM_NAMES) {
      const escaped = escapeRegExp(name);

      output = output.replace(
        new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
        "$1***"
      );
    }

    output = output.replace(
      /(\/activate-account\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
      "$1***"
    );

    output = output.replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    );

    output = output.replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
  } catch {}

  return output;
}

function sanitizeError(error = null) {
  if (!error) {
    return null;
  }

  const candidate =
    error?.reason ||
    error?.error ||
    error;

  return {
    name: safeText(candidate?.name, "Error"),
    message: redactSensitiveText(
      safeText(
        candidate?.message ||
          candidate?.reason ||
          candidate,
        "Error"
      )
    ),
    code: safeText(
      candidate?.code ||
        candidate?.statusCode ||
        "",
      ""
    ),
    status: Number(candidate?.status || 0) || 0,
    timeout: Boolean(candidate?.timeout),
    at: nowIso(),
  };
}

function sanitizePayload(payload = {}) {
  if (!isObject(payload)) {
    return payload;
  }

  const clean = {
    ...payload,
  };

  for (const key of [
    "href",
    "url",
    "path",
    "route",
    "publicPath",
    "canonicalPath",
    "initialUrl",
    "redirectTo",
  ]) {
    if (clean[key]) {
      clean[key] = redactSensitiveText(clean[key]);
    }
  }

  for (const key of [
    "token",
    "accessToken",
    "access_token",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "password",
    "authorization",
  ]) {
    if (key in clean) {
      clean[key] = "***";
    }
  }

  if (clean.error) {
    clean.error = sanitizeError(clean.error);
  }

  if (clean.bootContext && isObject(clean.bootContext)) {
    clean.bootContext = sanitizeBootContext(clean.bootContext);
  }

  return clean;
}

function sanitizeBootContext(context = {}) {
  const ctx = safeObject(context);

  return {
    version: MAIN_VERSION,
    source: MAIN_SOURCE,
    reason: safeText(ctx.reason, ""),
    href: redactSensitiveText(ctx.href || ""),
    initialUrl: redactSensitiveText(ctx.initialUrl || ""),
    pathname: safeText(ctx.pathname, ""),
    search: ctx.search ? "***" : "",
    hash: ctx.hash ? redactSensitiveText(ctx.hash) : "",
    capturedAt: safeText(ctx.capturedAt, ""),
  };
}

/* =========================================================
   LOG / EVENTS
========================================================= */

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(
      "[Main]",
      ...args.map((item) => sanitizePayload(item))
    );

    return;
  } catch {}

  try {
    console.log(
      "[Main]",
      ...args.map((item) => sanitizePayload(item))
    );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[Main]",
      ...args.map((item) => sanitizePayload(item))
    );

    return;
  } catch {}

  try {
    console.warn(
      "[Main]",
      ...args.map((item) => sanitizePayload(item))
    );
  } catch {}
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(
      "[Main]",
      ...args.map((item) => sanitizePayload(item))
    );

    return;
  } catch {}

  try {
    console.error(
      "[Main]",
      ...args.map((item) => sanitizePayload(item))
    );
  } catch {}
}

function safeCreateCustomEvent(name = "", detail = {}) {
  if (!isBrowser()) {
    return null;
  }

  const eventName = safeText(name, "");

  if (!eventName) {
    return null;
  }

  try {
    if (typeof CustomEvent === "function") {
      return new CustomEvent(eventName, {
        detail,
      });
    }
  } catch {}

  try {
    const event = document.createEvent("CustomEvent");

    event.initCustomEvent(
      eventName,
      false,
      false,
      detail
    );

    return event;
  } catch {
    return null;
  }
}

function safeEmit(name = "", payload = {}, options = {}) {
  const eventName = safeText(name, "");

  if (!eventName) {
    return false;
  }

  const cleanPayload = sanitizePayload({
    source: MAIN_SOURCE,
    version: MAIN_VERSION,
    ...safeObject(payload),
  });

  const opts = safeObject(options);

  let busAvailable = false;
  let busEmitted = false;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      busAvailable = true;

      AppCore.events.emit(
        eventName,
        cleanPayload
      );

      busEmitted = true;
    }
  } catch {}

  if (
    opts.window === true ||
    (!busAvailable && isBrowser())
  ) {
    try {
      const event = safeCreateCustomEvent(
        eventName,
        cleanPayload
      );

      if (event) {
        window.dispatchEvent(event);
        return true;
      }
    } catch {}
  }

  return busEmitted;
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getHtml() {
  if (!isBrowser()) {
    return null;
  }

  return document.documentElement || null;
}

function getBody() {
  if (!isBrowser()) {
    return null;
  }

  return document.body || null;
}

function byId(id = "") {
  if (
    !isBrowser() ||
    !id
  ) {
    return null;
  }

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function setAttr(element, name, value) {
  if (
    !element ||
    !name
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(
        name,
        String(value)
      );
    }

    return true;
  } catch {
    return false;
  }
}

function setDataset(element, key, value) {
  if (
    !element ||
    !key
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete element.dataset[key];
    } else {
      element.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function addClass(element, className) {
  if (
    !element ||
    !className
  ) {
    return false;
  }

  try {
    element.classList.add(className);
    return true;
  } catch {
    return false;
  }
}

function removeClass(element, className) {
  if (
    !element ||
    !className
  ) {
    return false;
  }

  try {
    element.classList.remove(className);
    return true;
  } catch {
    return false;
  }
}

function clearNode(node) {
  if (!node) {
    return false;
  }

  try {
    node.replaceChildren();
    return true;
  } catch {}

  try {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }

    return true;
  } catch {
    return false;
  }
}

function createElement(tagName = "div", {
  className = "",
  text = "",
  attrs = {},
  dataset = {},
} = {}) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text) {
    element.textContent = text;
  }

  for (const [key, value] of Object.entries(safeObject(attrs))) {
    setAttr(element, key, value);
  }

  for (const [key, value] of Object.entries(safeObject(dataset))) {
    setDataset(element, key, value);
  }

  return element;
}

/* =========================================================
   DOCUMENT STATE
========================================================= */

function markDocumentBooting(reason = "main-booting") {
  if (!isBrowser()) {
    return false;
  }

  const html = getHtml();
  const body = getBody();

  for (const element of [html, body]) {
    if (!element) {
      continue;
    }

    removeClass(element, "app-ready");
    removeClass(element, "app-fatal");

    addClass(element, "app-booting");
    addClass(element, "app-loading");

    setDataset(element, "appLoading", "true");
    setDataset(element, "routeMode", "boot");
  }

  if (html) {
    setDataset(html, "appState", "booting");
    setDataset(html, "shellState", "booting");
  }

  if (body) {
    setDataset(body, "shellState", "booting");
    setDataset(body, "bootReason", reason);
  }

  try {
    AppCore?.setState?.({
      mainReady: false,
      mainBooting: true,
      mainFatal: false,
      mainPhase: "booting",
      mainReason: reason,
      mainUpdatedAt: nowIso(),
    });
  } catch {}

  return true;
}

function markDocumentReady(reason = "main-ready") {
  if (!isBrowser()) {
    return false;
  }

  const html = getHtml();
  const body = getBody();

  for (const element of [html, body]) {
    if (!element) {
      continue;
    }

    removeClass(element, "app-booting");
    removeClass(element, "app-loading");
    removeClass(element, "app-fatal");

    addClass(element, "app-ready");

    setDataset(element, "appLoading", "false");
  }

  if (html) {
    setDataset(html, "appState", "ready");

    if (html.dataset.routeMode === "boot") {
      setDataset(html, "routeMode", "app");
    }

    setDataset(html, "shellState", "ready");
  }

  if (body) {
    if (body.dataset.routeMode === "boot") {
      setDataset(body, "routeMode", "app");
    }

    setDataset(body, "shellState", "ready");
    setDataset(body, "bootReason", reason);
  }

  try {
    AppCore?.setState?.({
      mainReady: true,
      mainBooting: false,
      mainFatal: false,
      mainPhase: "ready",
      mainReason: reason,
      mainUpdatedAt: nowIso(),
    });
  } catch {}

  return true;
}

function markDocumentFatal(reason = "main-fatal") {
  if (!isBrowser()) {
    return false;
  }

  const html = getHtml();
  const body = getBody();

  for (const element of [html, body]) {
    if (!element) {
      continue;
    }

    removeClass(element, "app-booting");
    removeClass(element, "app-loading");
    removeClass(element, "app-ready");

    addClass(element, "app-fatal");

    setDataset(element, "appLoading", "false");
    setDataset(element, "routeMode", "fatal");
  }

  if (html) {
    setDataset(html, "appState", "fatal");
    setDataset(html, "shellState", "fatal");
  }

  if (body) {
    setDataset(body, "shellState", "fatal");
    setDataset(body, "bootReason", reason);
  }

  try {
    AppCore?.setState?.({
      mainReady: false,
      mainBooting: false,
      mainFatal: true,
      mainPhase: "fatal",
      mainReason: reason,
      mainUpdatedAt: nowIso(),
      mainLastError: sanitizeError(state.lastError),
    });
  } catch {}

  return true;
}

/* =========================================================
   URL CAPTURE
========================================================= */

function getCurrentHref() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return window.location.href || "";
  } catch {
    return "";
  }
}

function captureInitialUrl(reason = "main") {
  if (!isBrowser()) {
    return null;
  }

  const href = getCurrentHref();

  const context = {
    version: MAIN_VERSION,
    source: MAIN_SOURCE,
    reason,
    href,
    initialUrl: href,
    pathname: window.location?.pathname || "/",
    search: window.location?.search || "",
    hash: window.location?.hash || "",
    capturedAt: nowIso(),
  };

  try {
    if (
      href &&
      !window[INITIAL_URL_KEY]
    ) {
      window[INITIAL_URL_KEY] = href;
    }

    window[BOOT_CONTEXT_KEY] = context;
  } catch {}

  try {
    AppCore?.setState?.({
      mainInitialUrl: href,
      mainInitialPath: context.pathname,
      mainInitialHash: context.hash,
      mainBootContextCapturedAt: context.capturedAt,
    });
  } catch {}

  state.lastBootContext = context;

  safeEmit(
    MAIN_EVENTS.initialUrlCaptured,
    {
      reason,
      bootContext: context,
    }
  );

  return context;
}

/* =========================================================
   DOM READY
========================================================= */

function waitForDomReady() {
  if (!isBrowser()) {
    return Promise.resolve();
  }

  try {
    if (
      document.readyState === "interactive" ||
      document.readyState === "complete"
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const done = () => {
        try {
          document.removeEventListener(
            "DOMContentLoaded",
            done
          );
        } catch {}

        resolve();
      };

      document.addEventListener(
        "DOMContentLoaded",
        done,
        {
          once: true,
        }
      );
    });
  } catch {
    return Promise.resolve();
  }
}

function bindReady(callback) {
  if (state.readyBound) {
    return false;
  }

  state.readyBound = true;

  const runOnce = () => {
    if (state.readyCallbackCalled) {
      return;
    }

    state.readyCallbackCalled = true;

    try {
      callback();
    } catch (error) {
      void handleFatalError(error, "ready-callback");
    }
  };

  try {
    if (isFunction(AppCore?.ready)) {
      AppCore.ready(() => {
        void waitForDomReady().then(runOnce);
      });

      return true;
    }
  } catch (error) {
    safeWarn(
      "AppCore.ready no disponible. Usando DOM ready.",
      {
        error,
      }
    );
  }

  void waitForDomReady().then(runOnce);

  return true;
}

/* =========================================================
   FATAL VIEW
========================================================= */

function getFatalRoot() {
  return (
    byId("view-container") ||
    byId("app-content") ||
    byId("main-content") ||
    byId("app-shell") ||
    getBody()
  );
}

function exposeFatalRoot(root) {
  if (!root) {
    return false;
  }

  try {
    root.hidden = false;

    setAttr(root, "aria-hidden", "false");
    setAttr(root, "aria-busy", "false");

    let parent = root.parentElement;

    while (parent) {
      parent.hidden = false;

      setAttr(parent, "aria-hidden", "false");

      parent = parent.parentElement;
    }

    return true;
  } catch {
    return false;
  }
}

function normalizeBootError(error = null) {
  if (error instanceof Error) {
    return error;
  }

  const normalized = new Error(
    safeText(
      error?.message ||
        error?.reason ||
        error,
      DEFAULT_FATAL_MESSAGE
    )
  );

  try {
    normalized.raw = error;
  } catch {}

  return normalized;
}

function createReloadButton() {
  const button = createElement("button", {
    className: "fatal-boot-button",
    text: "Recargar",
    attrs: {
      type: "button",
    },
  });

  try {
    button.addEventListener("click", () => {
      try {
        window.location.reload();
      } catch {}
    });
  } catch {}

  return button;
}

function createDetailsButton(error) {
  const button = createElement("button", {
    className: "fatal-boot-button fatal-boot-button-secondary",
    text: "Detalles",
    attrs: {
      type: "button",
    },
  });

  try {
    button.addEventListener("click", () => {
      try {
        console.group("[Onion Support] Boot error details");
        console.error(error);
        console.groupEnd();
      } catch {}
    });
  } catch {}

  return button;
}

function renderFatalBootError(error = null) {
  if (
    !isBrowser() ||
    state.fatalRendered
  ) {
    return false;
  }

  state.fatalRendered = true;

  const normalizedError = normalizeBootError(error);

  state.lastError = normalizedError;

  markDocumentFatal("boot-error");

  const root = getFatalRoot();

  if (!root) {
    return false;
  }

  exposeFatalRoot(root);
  clearNode(root);

  const message = redactSensitiveText(
    safeText(
      normalizedError.message,
      DEFAULT_FATAL_MESSAGE
    )
  );

  const section = createElement("section", {
    className: "fatal-boot",
    attrs: {
      role: "alert",
      "aria-live": "assertive",
    },
    dataset: {
      fatalBoot: "true",
    },
  });

  const card = createElement("div", {
    className: "fatal-boot-card",
  });

  const eyebrow = createElement("p", {
    className: "fatal-boot-eyebrow",
    text: "Onion Support",
  });

  const title = createElement("h1", {
    className: "fatal-boot-title",
    text: DEFAULT_FATAL_TITLE,
  });

  const paragraph = createElement("p", {
    className: "fatal-boot-message",
    text: message,
  });

  const hint = createElement("p", {
    className: "fatal-boot-hint",
    text: "Recarga la página. Si el problema persiste, revisa la consola del navegador.",
  });

  const actions = createElement("div", {
    className: "fatal-boot-actions",
  });

  actions.appendChild(createReloadButton());
  actions.appendChild(createDetailsButton(normalizedError));

  card.appendChild(eyebrow);
  card.appendChild(title);
  card.appendChild(paragraph);
  card.appendChild(hint);
  card.appendChild(actions);

  section.appendChild(card);
  root.appendChild(section);

  safeEmit(
    MAIN_EVENTS.fatalRendered,
    {
      message,
      error: normalizedError,
    }
  );

  return true;
}

async function handleFatalError(error = null, reason = "fatal") {
  const normalizedError = normalizeBootError(error);

  state.failed = true;
  state.settled = true;
  state.settledAt = nowMs();
  state.lastError = normalizedError;

  safeError(
    "Fallo fatal en main.",
    {
      reason,
      error: normalizedError,
    }
  );

  safeEmit(
    MAIN_EVENTS.bootError,
    {
      reason,
      durationMs:
        state.startedAt && state.settledAt
          ? state.settledAt - state.startedAt
          : 0,
      error: normalizedError,
      bootContext: state.lastBootContext,
    }
  );

  renderFatalBootError(normalizedError);

  return normalizedError;
}

/* =========================================================
   GLOBAL SAFETY NET
========================================================= */

function bindGlobalSafetyNet() {
  if (
    !isBrowser() ||
    state.safetyNetBound
  ) {
    return false;
  }

  state.safetyNetBound = true;

  try {
    window.addEventListener(
      "error",
      (event) => {
        if (state.settled) {
          return;
        }

        const error =
          event?.error ||
          event?.message ||
          null;

        safeEmit(
          MAIN_EVENTS.globalError,
          {
            message: event?.message || "Global error",
            filename: redactSensitiveText(event?.filename || ""),
            lineno: event?.lineno || 0,
            colno: event?.colno || 0,
            error,
          }
        );
      },
      true
    );
  } catch {}

  try {
    window.addEventListener(
      "unhandledrejection",
      (event) => {
        if (state.settled) {
          return;
        }

        const reason = event?.reason || null;

        safeEmit(
          MAIN_EVENTS.unhandledRejection,
          {
            message: safeText(
              reason?.message ||
                reason,
              "Unhandled rejection"
            ),
            error: reason,
          }
        );
      }
    );
  } catch {}

  return true;
}

/* =========================================================
   BOOT
========================================================= */

async function boot(options = {}) {
  const opts = safeObject(options);

  if (state.bootPromise) {
    return state.bootPromise;
  }

  if (
    state.started &&
    state.settled &&
    !state.failed &&
    opts.force !== true
  ) {
    return App;
  }

  state.started = true;
  state.settled = false;
  state.failed = false;
  state.fatalRendered = false;
  state.lastError = null;
  state.startedAt = nowMs();
  state.settledAt = 0;

  const context =
    captureInitialUrl("boot") ||
    state.lastBootContext ||
    {};

  markDocumentBooting("main-boot");

  safeEmit(
    MAIN_EVENTS.bootStart,
    {
      bootContext: context,
      readyState: isBrowser()
        ? document.readyState
        : "server",
    }
  );

  state.bootPromise = Promise.resolve()
    .then(async () => {
      if (
        !App ||
        !isFunction(App.boot)
      ) {
        const error = new Error("App.boot no está disponible.");

        error.code = "APP_BOOT_MISSING";

        throw error;
      }

      safeLog(
        "Iniciando App.boot().",
        {
          bootContext: context,
        }
      );

      const result = await App.boot({
        source: MAIN_SOURCE,
        bootContext: context,
        ...opts,
      });

      state.settled = true;
      state.failed = false;
      state.settledAt = nowMs();

      markDocumentReady("main-boot-complete");

      safeEmit(
        MAIN_EVENTS.bootReady,
        {
          durationMs: state.settledAt - state.startedAt,
          bootContext: context,
          appState: isFunction(App?.getState)
            ? App.getState()
            : null,
        }
      );

      safeLog(
        "Arranque completado.",
        {
          durationMs: state.settledAt - state.startedAt,
        }
      );

      return result || App;
    })
    .catch(async (error) => {
      await handleFatalError(error, "boot");
      throw normalizeBootError(error);
    })
    .finally(() => {
      state.bootPromise = null;
    });

  return state.bootPromise;
}

function start(options = {}) {
  if (state.started && state.bootPromise) {
    return state.bootPromise;
  }

  bindGlobalSafetyNet();

  captureInitialUrl("start");
  markDocumentBooting("main-start");

  bindReady(() => {
    void boot(options).catch(() => {
      /*
        handleFatalError() ya renderiza el estado fatal.
        Se evita un unhandled rejection extra en autoarranque.
      */
    });
  });

  return state.bootPromise || App;
}

/* =========================================================
   SNAPSHOT / DEBUG
========================================================= */

function getMainSnapshot() {
  const html = getHtml();
  const body = getBody();

  let appState = null;

  try {
    appState = isFunction(App?.getState)
      ? App.getState()
      : null;
  } catch {
    appState = null;
  }

  return sanitizePayload({
    version: MAIN_VERSION,

    started: state.started,
    settled: state.settled,
    failed: state.failed,

    hasBootPromise: Boolean(state.bootPromise),

    startedAt: state.startedAt,
    startedAtIso: state.startedAt
      ? nowIso(state.startedAt)
      : "",

    settledAt: state.settledAt,
    settledAtIso: state.settledAt
      ? nowIso(state.settledAt)
      : "",

    durationMs:
      state.startedAt && state.settledAt
        ? state.settledAt - state.startedAt
        : state.startedAt
          ? nowMs() - state.startedAt
          : 0,

    readyBound: state.readyBound,
    readyCallbackCalled: state.readyCallbackCalled,
    safetyNetBound: state.safetyNetBound,
    fatalRendered: state.fatalRendered,
    debugBridgeExposed: state.debugBridgeExposed,

    documentReadyState: isBrowser()
      ? document.readyState
      : "server",

    htmlClassName: html?.className || "",
    bodyClassName: body?.className || "",

    htmlDataset: {
      appState: html?.dataset?.appState || "",
      appLoading: html?.dataset?.appLoading || "",
      routeMode: html?.dataset?.routeMode || "",
      shellState: html?.dataset?.shellState || "",
      theme: html?.dataset?.theme || "",
      themeMode: html?.dataset?.themeMode || "",
    },

    bodyDataset: {
      appLoading: body?.dataset?.appLoading || "",
      authenticated: body?.dataset?.authenticated || "",
      routeMode: body?.dataset?.routeMode || "",
      shellState: body?.dataset?.shellState || "",
    },

    bootContext: state.lastBootContext,
    lastError: sanitizeError(state.lastError),
    appState,
  });
}

function exposeDebugBridge() {
  if (
    !isBrowser() ||
    state.debugBridgeExposed
  ) {
    return false;
  }

  try {
    window.OnionApp = window.OnionApp || {};

    window.OnionApp.main = {
      version: MAIN_VERSION,

      start,
      boot,

      captureInitialUrl,

      markDocumentBooting,
      markDocumentReady,
      markDocumentFatal,

      getState: getMainSnapshot,
      getSnapshot: getMainSnapshot,
    };

    window[RUNTIME_KEY] = window.OnionApp.main;

    state.debugBridgeExposed = true;

    safeEmit(
      MAIN_EVENTS.bridgeReady,
      {
        version: MAIN_VERSION,
      }
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FIRST TICK
========================================================= */

captureInitialUrl("module-load");
markDocumentBooting("module-load");
exposeDebugBridge();
start();

/* =========================================================
   EXPORTS
========================================================= */

export {
  MAIN_VERSION,

  start,
  boot,

  captureInitialUrl,

  markDocumentBooting,
  markDocumentReady,
  markDocumentFatal,

  getMainSnapshot,
};

export default {
  MAIN_VERSION,

  start,
  boot,

  captureInitialUrl,

  markDocumentBooting,
  markDocumentReady,
  markDocumentFatal,

  getState: getMainSnapshot,
  getSnapshot: getMainSnapshot,
};
