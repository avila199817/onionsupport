/* =========================================================
   Onion Support - App Errors
   Archivo: /src/app/errors.js

   Responsabilidad:
   - Compat mínima de errores.
   - Pintar fallback fatal de boot en castellano.
   - Marcar estado fatal.
   - Ocultar loader y chrome mínimo en fatal.
   - Sin imports, eventos de app, Toast, Auth, Router, telemetry,
     debug global, fetch, storage ni lógica de dominio.
========================================================= */

export const APP_ERRORS_VERSION = "app.errors.v5";

const IDS = Object.freeze({
  loader: "app-loader",
  shell: "app-shell",
  sidebar: "sidebar-mount",
  topbar: "topbar-mount",
  tablehead: "table-head",
  tableheadContainer: "tablehead-container",
  view: "view-container",
  appContent: "app-content",
  main: "main-content",
});

const DEFAULT_ERROR_MESSAGE = "Se produjo un error.";
const BOOT_ERROR_TITLE = "Error de arranque";
const BOOT_ERROR_MESSAGE = "No se pudo iniciar Onion Support. Recarga la página.";
const BOOT_ERROR_ACTION = "Volver a intentar";

const CODE_MESSAGES = Object.freeze({
  UNAUTHORIZED: "Necesitas iniciar sesión.",
  SESSION_EXPIRED: "La sesión ha caducado.",
  SESSION_REVOKED: "La sesión ya no está disponible.",
  REFRESH_FAILED: "No se pudo restaurar la sesión.",
  USER_DISABLED: "El usuario está desactivado.",
  USER_DELETED: "El usuario no está disponible.",
  USER_ARCHIVED: "El usuario no está disponible.",
  USER_NOT_AVAILABLE: "El usuario no está disponible.",
  FORBIDDEN: "No tienes permisos para realizar esta acción.",
  ADMIN_REQUIRED: "Se requiere una cuenta de administrador.",
  VALIDATION_ERROR: "Revisa los datos introducidos.",
  RATE_LIMITED: "Demasiadas solicitudes. Inténtalo de nuevo más tarde.",
  SERVER_ERROR: "El servidor no pudo completar la operación.",
  NETWORK_ERROR: "No se pudo conectar con el servidor.",
  MAINTENANCE: "El servicio no está disponible temporalmente.",
});

const STATUS_MESSAGES = Object.freeze({
  400: "La solicitud no es válida.",
  401: "Necesitas iniciar sesión.",
  403: "No tienes permisos para realizar esta acción.",
  404: "El recurso solicitado no existe.",
  408: "La solicitud ha tardado demasiado.",
  409: "La operación no se pudo completar por un conflicto.",
  413: "La solicitud es demasiado grande.",
  415: "El tipo de contenido no es compatible.",
  422: "Revisa los datos introducidos.",
  429: "Demasiadas solicitudes. Inténtalo de nuevo más tarde.",
  500: "El servidor no pudo completar la operación.",
  502: "El servidor no respondió correctamente.",
  503: "El servicio no está disponible temporalmente.",
  504: "El servidor ha tardado demasiado en responder.",
});

let lastError = null;

/* =========================================================
   BASICS
========================================================= */

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

function byId(id = "") {
  return isBrowser() && id ? document.getElementById(id) : null;
}

function documentRoots() {
  if (!isBrowser()) return [];
  return [document.documentElement, document.body].filter(Boolean);
}

function setDataset(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function setAttr(element = null, key = "", value = "") {
  if (!element || !key) return false;

  try {
    element.setAttribute(key, String(value));
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

function setClasses(element = null, {
  add = [],
  remove = [],
} = {}) {
  if (!element) return false;

  try {
    if (remove.length) element.classList.remove(...remove.filter(Boolean));
    if (add.length) element.classList.add(...add.filter(Boolean));
    return true;
  } catch {
    return false;
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

/* =========================================================
   REDACTION / NORMALIZATION
========================================================= */

export function redactTokenInText(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function normalizeErrorCode(error = null) {
  return cleanText(
    error?.code ||
      error?.error ||
      error?.response?.data?.code ||
      error?.response?.data?.error ||
      "",
    ""
  ).toUpperCase();
}

function normalizeErrorStatus(error = null) {
  const status = Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.response?.data?.status ||
      0
  );

  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}

export function resolveErrorMessage(
  error = null,
  fallback = DEFAULT_ERROR_MESSAGE
) {
  if (!error) return fallback;

  const code = normalizeErrorCode(error);
  const status = normalizeErrorStatus(error);

  return (
    CODE_MESSAGES[code] ||
    STATUS_MESSAGES[status] ||
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

    source: cleanText(source, "app").slice(0, 96),
    severity: cleanText(severity, "error").toLowerCase().slice(0, 32),
    boot: Boolean(boot),

    name: cleanText(error?.name, "Error").slice(0, 96),
    message: resolveErrorMessage(error),
    code: normalizeErrorCode(error) || null,
    status: normalizeErrorStatus(error),

    at: nowIso(),
  };
}

/* =========================================================
   FATAL DOM
========================================================= */

function getErrorRoot() {
  if (!isBrowser()) return null;

  return (
    byId(IDS.view) ||
    byId(IDS.appContent) ||
    byId(IDS.main) ||
    document.body ||
    null
  );
}

function markFatalState() {
  for (const root of documentRoots()) {
    setClasses(root, {
      remove: [
        "app-booting",
        "app-loading",
        "app-ready",
        "app-error",
      ],
      add: ["app-fatal"],
    });

    setDataset(root, "mainState", "fatal");
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
  const shell = byId(IDS.shell);

  if (!shell) return false;

  setHidden(shell, false);

  setDataset(shell, "shell", "visible");
  setDataset(shell, "shellState", "fatal");
  setDataset(shell, "shellInteractive", "false");
  setDataset(shell, "chrome", "hidden");
  setDataset(shell, "routeMode", "fatal");

  return true;
}

function hideChromeForFatal() {
  for (const node of [
    byId(IDS.sidebar),
    byId(IDS.topbar),
    byId(IDS.tablehead),
    byId(IDS.tableheadContainer),
  ].filter(Boolean)) {
    setHidden(node, true);
    setDataset(node, "chrome", "hidden");
    setDataset(node, "routeMode", "fatal");
  }

  return true;
}

function hideLoaderForFatal() {
  const loader = byId(IDS.loader);

  if (!loader) return false;

  setHidden(loader, true);

  setClasses(loader, {
    remove: ["is-visible"],
    add: ["is-hidden"],
  });

  setDataset(loader, "loaderVisible", "false");
  setDataset(loader, "loaderState", "fatal");

  return true;
}

function createErrorView() {
  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");
  section.setAttribute("aria-live", "assertive");

  const title = document.createElement("h1");
  title.textContent = BOOT_ERROR_TITLE;

  const message = document.createElement("p");
  message.textContent = BOOT_ERROR_MESSAGE;

  const action = document.createElement("a");
  action.className = "boot-error-view__action";
  action.href = "/";
  action.textContent = BOOT_ERROR_ACTION;
  action.setAttribute("data-spa-disabled", "true");

  section.append(title, message, action);

  return section;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function renderBootError({ error = null } = {}) {
  if (!isBrowser()) return false;

  lastError = createErrorSnapshot({
    source: "boot",
    error,
    severity: "critical",
    boot: true,
  });

  markFatalState();
  showShellForFatal();
  hideChromeForFatal();
  hideLoaderForFatal();

  const root = getErrorRoot();

  if (!root) return false;

  try {
    setHidden(root, false);
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
      visibleErrorsInSpanish: true,
      noImports: true,
      noAppEvents: true,
      noToast: true,
      noAuth: true,
      noRouter: true,
      noTelemetry: true,
      noGlobalDebug: true,
      noFetch: true,
      noStorage: true,
      noDomainLogic: true,
      redactedSnapshot: true,
    },
  };
}

export function resetErrorState() {
  lastError = null;
  return getErrorStateSnapshot();
}

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
