/* =========================================================
   Onion Support - App Errors
   Archivo: /src/app/errors.js

   Responsabilidad:
   - Compat mínima de errores.
   - Pintar error de boot simple.
   - Marcar estado fatal.
   - Ocultar loader.
   - Sin imports.
   - Sin eventos.
   - Sin Toast.
   - Sin Auth.
   - Sin Router.
   - Sin telemetry.
   - Sin debug global.
========================================================= */

export const APP_ERRORS_VERSION = "app.errors.v3";

let lastError = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function roots() {
  if (!isBrowser()) return [];

  return [
    document.documentElement,
    document.body,
  ].filter(Boolean);
}

function setDataset(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete element.dataset[key];
    } else {
      element.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function setAttr(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      element.removeAttribute(key);
    } else {
      element.setAttribute(key, String(value));
    }

    return true;
  } catch {
    return false;
  }
}

function setHidden(element = null, hidden = false) {
  if (!element) return false;

  const value = Boolean(hidden);

  try {
    element.hidden = value;
    setAttr(element, "aria-hidden", value ? "true" : "false");
    setAttr(element, "aria-busy", "false");
    return true;
  } catch {
    return false;
  }
}

function removeClasses(element = null, classes = []) {
  if (!element || !classes.length) return false;

  try {
    element.classList.remove(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function addClasses(element = null, classes = []) {
  if (!element || !classes.length) return false;

  try {
    element.classList.add(...classes.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   REDACTION
========================================================= */

export function redactTokenInText(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

export function resolveErrorMessage(
  error = null,
  fallback = "Se produjo un error."
) {
  if (!error) return fallback;

  if (typeof error === "string") {
    return redactTokenInText(error);
  }

  return redactTokenInText(
    error.message ||
      error.reason ||
      fallback
  );
}

function normalizeErrorCode(error = null) {
  return (
    error?.code ||
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    null
  );
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

export function createErrorSnapshot({
  source = "app",
  error = null,
  severity = "error",
  boot = false,
} = {}) {
  const normalizedSource = cleanText(source, "app").slice(0, 96);
  const normalizedSeverity = cleanText(severity, "error").toLowerCase().slice(0, 32);

  return {
    version: APP_ERRORS_VERSION,

    source: normalizedSource,
    severity: normalizedSeverity,
    boot: Boolean(boot),

    name: cleanText(error?.name, "Error").slice(0, 96),
    message: resolveErrorMessage(error),
    code: normalizeErrorCode(error),

    at: nowIso(),
  };
}

/* =========================================================
   FATAL DOM
========================================================= */

function getErrorRoot() {
  if (!isBrowser()) return null;

  return (
    byId("view-container") ||
    byId("app-content") ||
    byId("main-content") ||
    document.body ||
    null
  );
}

function markFatalState() {
  for (const root of roots()) {
    removeClasses(root, [
      "app-booting",
      "app-loading",
      "app-ready",
      "app-error",
    ]);

    addClasses(root, ["app-fatal"]);

    setDataset(root, "appState", "fatal");
    setDataset(root, "appBooted", "false");
    setDataset(root, "appBooting", "false");
    setDataset(root, "appLoading", "false");
    setDataset(root, "appReady", "false");
    setDataset(root, "appError", "false");
    setDataset(root, "appFatal", "true");

    setDataset(root, "shell", "visible");
    setDataset(root, "shellState", "fatal");
    setDataset(root, "shellInteractive", "false");
    setDataset(root, "chrome", "hidden");
    setDataset(root, "routeMode", "fatal");
  }

  return true;
}

function showShellForFatal() {
  const shell = byId("app-shell");

  if (!shell) return false;

  setHidden(shell, false);

  setDataset(shell, "shell", "visible");
  setDataset(shell, "shellState", "fatal");
  setDataset(shell, "shellInteractive", "false");
  setDataset(shell, "chrome", "hidden");
  setDataset(shell, "routeMode", "fatal");

  setAttr(shell, "aria-hidden", "false");
  setAttr(shell, "aria-busy", "false");

  return true;
}

function hideChromeForFatal() {
  const nodes = [
    byId("sidebar-mount"),
    byId("topbar-mount"),
    byId("table-head"),
    byId("tablehead-container"),
  ].filter(Boolean);

  for (const node of nodes) {
    setHidden(node, true);
    setDataset(node, "chrome", "hidden");
  }

  return true;
}

function hideLoaderForFatal() {
  const loader = byId("app-loader");

  if (!loader) return false;

  setHidden(loader, true);

  removeClasses(loader, ["is-visible"]);
  addClasses(loader, ["is-hidden"]);

  setDataset(loader, "loaderVisible", "false");
  setDataset(loader, "loaderState", "hidden");

  setAttr(loader, "aria-hidden", "true");
  setAttr(loader, "aria-busy", "false");

  return true;
}

function createErrorView() {
  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "Error de arranque";

  const message = document.createElement("p");
  message.textContent = "No se pudo iniciar Onion Support. Recarga la página.";

  const action = document.createElement("a");
  action.className = "boot-error-view__action";
  action.href = "/";
  action.textContent = "Volver a intentar";
  action.setAttribute("data-spa-disabled", "true");

  section.append(title, message, action);

  return section;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function renderBootError({ error = null } = {}) {
  if (!isBrowser()) return false;

  const snapshot = createErrorSnapshot({
    source: "boot",
    error,
    severity: "critical",
    boot: true,
  });

  lastError = snapshot;

  markFatalState();
  showShellForFatal();
  hideChromeForFatal();
  hideLoaderForFatal();

  const root = getErrorRoot();

  if (!root) return false;

  try {
    setAttr(root, "aria-busy", "false");
    setAttr(root, "aria-hidden", "false");
    setDataset(root, "routeMode", "fatal");

    root.replaceChildren(createErrorView());

    return true;
  } catch {
    return false;
  }
}

export function reportAppError({
  error = null,
  source = "runtime",
  severity = "error",
} = {}) {
  lastError = createErrorSnapshot({
    source,
    error,
    severity,
    boot: false,
  });

  return lastError;
}

export function getErrorStateSnapshot() {
  return {
    version: APP_ERRORS_VERSION,

    hasError: Boolean(lastError),
    lastError,

    policy: {
      errorsCompatOnly: true,
      bootFatalFallback: true,

      noImports: true,
      noEvents: true,
      noToast: true,
      noAuth: true,
      noRouter: true,
      noTelemetry: true,
      noGlobalDebug: true,

      redactedSnapshot: true,
    },
  };
}

export function resetErrorState() {
  lastError = null;
  return getErrorStateSnapshot();
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  APP_ERRORS_VERSION,

  renderBootError,
  reportAppError,

  resolveErrorMessage,
  createErrorSnapshot,
  redactTokenInText,

  getErrorStateSnapshot,
  resetErrorState,
};
