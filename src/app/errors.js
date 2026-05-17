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

export const APP_ERRORS_VERSION = "simple";

let lastError = null;
let handlersBound = false;

export function redactTokenInText(value = "") {
  return String(value || "")
    .replace(/([?&#][^=]*(token|code|otp|jwt|session|authorization)[^=]*=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

export function resolveErrorMessage(error = null, fallback = "Se produjo un error.") {
  if (!error) return fallback;

  if (typeof error === "string") {
    return redactTokenInText(error);
  }

  return redactTokenInText(error.message || error.reason || fallback);
}

export function createErrorSnapshot({
  source = "app",
  error = null,
  severity = "error",
  boot = false,
} = {}) {
  return {
    version: APP_ERRORS_VERSION,
    source,
    severity,
    boot: Boolean(boot),
    name: error?.name || "Error",
    message: resolveErrorMessage(error),
    code: error?.code || error?.status || error?.statusCode || null,
    at: new Date().toISOString(),
  };
}

function byId(id) {
  return document.getElementById(id);
}

function getRoot() {
  return byId("view-container") || byId("app-content") || byId("main-content") || document.body;
}

function hideLoader() {
  const loader = byId("app-loader");

  if (!loader) return false;

  loader.hidden = true;
  loader.setAttribute("aria-hidden", "true");
  loader.setAttribute("aria-busy", "false");
  loader.classList.remove("is-visible");
  loader.classList.add("is-hidden");
  loader.dataset.loaderVisible = "false";
  loader.dataset.loaderState = "hidden";

  return true;
}

function showShell() {
  const shell = byId("app-shell");

  if (!shell) return false;

  shell.hidden = false;
  shell.setAttribute("aria-hidden", "false");
  shell.setAttribute("aria-busy", "false");
  shell.dataset.shellState = "fatal";

  return true;
}

function markFatal() {
  for (const element of [document.documentElement, document.body].filter(Boolean)) {
    element.classList.remove("app-booting", "app-loading", "app-ready");
    element.classList.add("app-fatal");

    element.dataset.appState = "fatal";
    element.dataset.appBooting = "false";
    element.dataset.appLoading = "false";
    element.dataset.appReady = "false";
    element.dataset.shellState = "fatal";
  }
}

function createErrorView(snapshot) {
  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "Error de arranque";

  const message = document.createElement("p");
  message.textContent = snapshot.message || "No se pudo iniciar Onion Support.";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Recargar";
  button.addEventListener("click", () => window.location.reload());

  section.append(title, message, button);

  return section;
}

export function renderBootError({ error = null } = {}) {
  const snapshot = createErrorSnapshot({
    source: "boot",
    error,
    severity: "critical",
    boot: true,
  });

  lastError = snapshot;

  markFatal();
  showShell();
  hideLoader();

  const root = getRoot();

  if (!root) return false;

  root.replaceChildren(createErrorView(snapshot));

  return true;
}

export function reportAppError({ error = null, source = "runtime", severity = "error" } = {}) {
  lastError = createErrorSnapshot({
    source,
    error,
    severity,
    boot: false,
  });

  return lastError;
}

export function bindGlobalErrorHandlers() {
  handlersBound = false;
  return () => unbindGlobalErrorHandlers();
}

export function unbindGlobalErrorHandlers() {
  handlersBound = false;
  return true;
}

export function clearAuthSession(_Auth = null, AppCore = null) {
  const patch = {
    authenticated: false,
    hasToken: false,
    user: null,
    currentUser: null,
    sessionUser: null,
    token: null,
    accessToken: null,
    refreshToken: null,
    role: null,
    roles: [],
  };

  if (AppCore?.state && typeof AppCore.state === "object") {
    Object.assign(AppCore.state, patch);
  }

  if (typeof AppCore?.setState === "function") {
    try {
      AppCore.setState(patch, { silent: true, emit: false });
    } catch {
      // Compat mínima.
    }
  }

  return true;
}

export function getErrorStateSnapshot() {
  return {
    version: APP_ERRORS_VERSION,
    handlersBound,
    lastError,
  };
}

export function resetErrorState() {
  lastError = null;
  handlersBound = false;

  return getErrorStateSnapshot();
}

export function exposeDebugApi() {
  return {
    version: APP_ERRORS_VERSION,
    getSnapshot: getErrorStateSnapshot,
    reset: resetErrorState,
    report: reportAppError,
    renderBootError,
  };
}

export default {
  APP_ERRORS_VERSION,

  renderBootError,

  bindGlobalErrorHandlers,
  unbindGlobalErrorHandlers,

  reportAppError,
  resolveErrorMessage,
  createErrorSnapshot,

  clearAuthSession,

  getErrorStateSnapshot,
  resetErrorState,

  exposeDebugApi,

  redactTokenInText,
};
