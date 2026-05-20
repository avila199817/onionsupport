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

export const APP_ERRORS_VERSION = "app.errors.v2";

let lastError = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function byId(id = "") {
  if (!isBrowser() || !id) return null;
  return document.getElementById(id);
}

function roots() {
  if (!isBrowser()) return [];
  return [document.documentElement, document.body].filter(Boolean);
}

/* =========================================================
   REDACTION
========================================================= */

export function redactTokenInText(value = "") {
  return String(value || "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
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

export function createErrorSnapshot({
  source = "app",
  error = null,
  severity = "error",
  boot = false,
} = {}) {
  return {
    version: APP_ERRORS_VERSION,
    source: cleanText(source, "app"),
    severity: cleanText(severity, "error"),
    boot: Boolean(boot),
    name: cleanText(error?.name, "Error"),
    message: resolveErrorMessage(error),
    code: error?.code || error?.status || error?.statusCode || null,
    at: new Date().toISOString(),
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
    root.classList.remove("app-booting", "app-loading", "app-ready", "app-error");
    root.classList.add("app-fatal");

    root.dataset.appState = "fatal";
    root.dataset.appBooting = "false";
    root.dataset.appLoading = "false";
    root.dataset.appReady = "false";
    root.dataset.shellState = "fatal";
  }

  return true;
}

function showShellForFatal() {
  const shell = byId("app-shell");

  if (!shell) return false;

  shell.hidden = false;
  shell.dataset.shell = "visible";
  shell.dataset.shellState = "fatal";
  shell.dataset.shellInteractive = "false";
  shell.dataset.chrome = "hidden";

  shell.setAttribute("aria-hidden", "false");
  shell.setAttribute("aria-busy", "false");

  return true;
}

function hideLoaderForFatal() {
  const loader = byId("app-loader");

  if (!loader) return false;

  loader.hidden = true;
  loader.classList.remove("is-visible");
  loader.classList.add("is-hidden");

  loader.dataset.loaderVisible = "false";
  loader.dataset.loaderState = "hidden";

  loader.setAttribute("aria-hidden", "true");
  loader.setAttribute("aria-busy", "false");

  return true;
}

function createErrorView(snapshot = {}) {
  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");

  const title = document.createElement("h1");
  title.textContent = "Error de arranque";

  const message = document.createElement("p");
  message.textContent = "No se pudo iniciar Onion Support. Recarga la página.";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Recargar";
  button.addEventListener("click", () => {
    window.location.reload();
  });

  section.append(title, message, button);

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
  hideLoaderForFatal();

  const root = getErrorRoot();

  if (!root) return false;

  root.setAttribute("aria-busy", "false");
  root.setAttribute("aria-hidden", "false");
  root.replaceChildren(createErrorView(snapshot));

  return true;
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
