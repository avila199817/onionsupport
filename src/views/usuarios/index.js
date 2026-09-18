/* =========================================================
   Onion Support - Usuarios Index
   Archivo: /src/views/usuarios/index.js

   CURSOR-FIRST · SERVER FILTERED · SILENT REVALIDATION · SESSION ORDER V14

   Objetivos:
   - No precargar el dataset completo.
   - Buscar y filtrar en backend.
   - Cargar páginas mediante continuation token opaco.
   - Mantener las filas actuales durante refresh/búsqueda/filtro silencioso.
   - No mostrar un loader de actualización encima de una tabla ya cargada.
   - Orden visual por inicio de sesión real (lastLoginAt), DESC por defecto.
   - No presentar un subconjunto local como dataset completo.
   - Preservar detalle, alta, foco, scroll y protección de controladores.
========================================================= */

import { cleanText } from "../../core/presentation-text.js";
import { escapeHtml } from "../../core/escape-html.js";
import { AppCore } from "../../core/index.js";
import { onDomainChanged } from "../../core/domain-events.js";
import { openModalConfirmation } from "../../features/entity-overlay/modal-confirmation.js";
import { MODAL_SHELL_SELECTORS, renderModalShell } from "../../features/entity-overlay/modal-host.js";

import {
  renderUsuariosTableTemplate,
  sortBySessionStart,
  USUARIOS_ACTIONS,
  USUARIOS_DEFAULT_SORT_ORDER,
  USUARIOS_DEFAULT_VISIBLE_ROWS,
} from "./usuarios.template.js";

import UsuariosCreateModal from "./usuarios.template.create.js";
import UsuariosDetailModal from "./usuarios.template.modal.js";

import {
  USUARIOS_API_VERSION,
  USUARIOS_ENDPOINT,
  USUARIOS_CREATE_ENDPOINT,
  USUARIOS_STATS_ENDPOINT,
  USUARIOS_CACHE_KEY,
  USUARIOS_CACHE_TTL_MS,
  USUARIOS_FETCH_LIMIT,
  USUARIOS_MAX_LIMIT,
  USUARIOS_MAX_PAGES,
  fetchUsuariosRequest as fetchUsuariosRequestApi,
  getUsuarioByIdRequest as getUsuarioByIdRequestApi,
  createUsuarioRequest as createUsuarioRequestApi,
  resendUsuarioActivationRequest as resendUsuarioActivationRequestApi,
  updateUsuarioRequest as updateUsuarioRequestApi,
  deleteUsuarioRequest as deleteUsuarioRequestApi,
  fetchUsuariosStatsRequest,
  hydrateFromCache as hydrateFromCacheApi,
  hydrateUsuariosFromCache as hydrateUsuariosFromCacheApi,
  loadUsuarioDetail as loadUsuarioDetailApi,
  createUsuario as createUsuarioApiRequest,
  updateUsuario as updateUsuarioApiRequest,
  deleteUsuario as deleteUsuarioApiRequest,
  usuariosState as usuariosApiState,
  getUsuarios as getUsuariosApiStore,
  getSortedUsuariosStore as getSortedUsuariosApiStore,
  getUsuarioByIdStore as getUsuarioByIdApiStore,
  getUsuariosCount as getUsuariosApiCount,
  hasUsuarios as hasUsuariosApi,
  getUsuariosStoreSnapshot as getUsuariosApiStoreSnapshot,
  getUsuariosStateSnapshot as getUsuariosApiStateSnapshot,
  getUsuariosApiSnapshot,
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  findUsuarioById,
  paginateUsuarios,
  computeUsuariosStats,
} from "./usuarios.api.js";

import {
  USUARIOS_CURSOR_VERSION,
  USUARIOS_CURSOR_PAGE_SIZE,
  fetchUsuariosCursorPage,
  mergeUsuariosCursorItems,
} from "./usuarios.cursor.js";
import { isObject, safeObject, isFunction, firstNonEmpty } from "../../core/objects.js";
import { safeArray } from "../../core/arrays.js";
import { slugKey } from "../../core/slug-key.js";
import { ERROR_MESSAGE_POLICIES, errorCode, errorMessage, errorStatus } from "../../core/errors.js";
import { coercedNumber } from "../../core/numbers.js";

const USUARIOS_MODULE_NAME = "usuarios";
const USUARIOS_VIEW_NAME = "UsuariosView";
const USUARIOS_CANONICAL_PATH = "/usuarios";
const USUARIOS_INDEX_VERSION =
  "usuarios.index.v16.activation-delivery";
const USUARIOS_VIEW_VERSION = USUARIOS_INDEX_VERSION;
const USUARIOS_INDEX_SOURCE = "views.usuarios.index";

export {
  USUARIOS_API_VERSION,
  USUARIOS_ENDPOINT,
  USUARIOS_CREATE_ENDPOINT,
  USUARIOS_STATS_ENDPOINT,
  USUARIOS_CACHE_KEY,
  USUARIOS_CACHE_TTL_MS,
  USUARIOS_FETCH_LIMIT,
  USUARIOS_MAX_LIMIT,
  USUARIOS_MAX_PAGES,
  USUARIOS_CURSOR_VERSION,
  USUARIOS_CURSOR_PAGE_SIZE,
  fetchUsuariosStatsRequest,
  normalizeUsuarioModel,
  normalizeUsuariosCollection,
  findUsuarioById,
  paginateUsuarios,
  computeUsuariosStats,
};

const SEARCH_DEBOUNCE_MS = 250;
const RESUME_REVALIDATE_MIN_AGE_MS = 60_000;
const USUARIOS_INFINITE_ROOT_MARGIN = "0px 0px 900px 0px";
const DEFAULT_VISIBLE_ROWS = Number(USUARIOS_DEFAULT_VISIBLE_ROWS) || USUARIOS_CURSOR_PAGE_SIZE;

const USUARIOS_CONTROLLER_KEY = Symbol.for("onion.support.usuarios.controller");
const USUARIOS_GLOBAL_CONTROLLER_KEY = Symbol.for("onion.support.usuarios.active-controller");

const ACTIONS = Object.freeze({
  DETAIL: USUARIOS_ACTIONS?.DETAIL || "detail",
  RESEND_ACTIVATION: USUARIOS_ACTIONS?.RESEND_ACTIVATION || "resend-activation",
  CREATE: USUARIOS_ACTIONS?.CREATE || "create",
  REFRESH: USUARIOS_ACTIONS?.REFRESH || "refresh",
  RETRY: USUARIOS_ACTIONS?.RETRY || "retry",
  EXPORT: USUARIOS_ACTIONS?.EXPORT || "export",
  FILTER: USUARIOS_ACTIONS?.FILTER || "filter",
  SORT_TOGGLE: USUARIOS_ACTIONS?.SORT_TOGGLE || "sort-toggle",
  CLEAR_SEARCH: USUARIOS_ACTIONS?.CLEAR_SEARCH || "clear-search",
  CLEAR_FILTERS: USUARIOS_ACTIONS?.CLEAR_FILTERS || "clear-filters",
  RETRY_PAGE: USUARIOS_ACTIONS?.RETRY_PAGE || "retry-page",
});

const ACTION_ALIASES = Object.freeze({
  detail: ACTIONS.DETAIL,
  open_user: ACTIONS.DETAIL,
  resend_activation: ACTIONS.RESEND_ACTIVATION,
  activation_resend: ACTIONS.RESEND_ACTIVATION,
  create: ACTIONS.CREATE,
  create_user: ACTIONS.CREATE,
  refresh: ACTIONS.REFRESH,
  retry: ACTIONS.RETRY,
  export: ACTIONS.EXPORT,
  export_csv: ACTIONS.EXPORT,
  filter: ACTIONS.FILTER,
  filter_usuarios: ACTIONS.FILTER,
  sort: ACTIONS.SORT_TOGGLE,
  sort_toggle: ACTIONS.SORT_TOGGLE,
  session_sort: ACTIONS.SORT_TOGGLE,
  clear_search: ACTIONS.CLEAR_SEARCH,
  clear_filters: ACTIONS.CLEAR_FILTERS,
  retry_page: ACTIONS.RETRY_PAGE,
});

const CREATE_SUCCESS_EVENTS = Object.freeze([
  "usuarios:create:success",
  "usuarios:create:created",
  "usuarios:created",
  "usuario:created",
]);
const CREATE_CLOSE_EVENTS = Object.freeze([
  "usuarios:create:closed",
  "usuarios:create:close",
]);
let controllerSequence = 0;
let lastController = null;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
function normalizeAction(value = "") {
  return ACTION_ALIASES[slugKey(value)] || "";
}
function normalizeSessionSortOrder(value = USUARIOS_DEFAULT_SORT_ORDER) {
  return slugKey(value) === "asc" ? "asc" : "desc";
}
function cloneItems(items = []) {
  return safeArray(items).map((item) => ({ ...safeObject(item) }));
}
function getGlobalObject() {
  try {
    return globalThis;
  } catch {
    return {};
  }
}
function getAppState() {
  try {
    if (typeof AppCore?.runtimeState?.read === "function") {
      return AppCore.runtimeState.read() || {};
    }
  } catch {
    // noop
  }
  return {};
}
function getCurrentUser(state = getAppState()) {
  return state.user || state.currentUser || null;
}
function getCurrentRole(context = {}, state = getAppState()) {
  const user = safeObject(getCurrentUser(state), {});
  const raw = firstNonEmpty(
    context.role,
    context.rol,
    context.user?.role,
    context.user?.rol,
    state.role,
    state.rol,
    state.roles,
    user.role,
    user.rol,
    user.roles,
    "user"
  );
  try {
    if (isFunction(AppCore?.normalizeRole)) {
      return AppCore.normalizeRole(raw) || "user";
    }
  } catch {
    // fallback below
  }
  return slugKey(Array.isArray(raw) ? raw[0] : raw) === "admin" ? "admin" : "user";
}
function isAdminContext(context = {}) {
  return context.admin === true || getCurrentRole(context) === "admin";
}
function normalizePathname(path = "/") {
  let value = cleanText(path, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .split("?")[0]
    .split("#")[0] || "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";
  const segments = value.split("/").filter(Boolean);
  if (segments[0]?.startsWith("@")) value = `/${segments.slice(1).join("/")}` || "/";
  return value;
}
function getBrowserPath() {
  if (!isBrowser()) return "";
  try {
    const hash = window.location.hash || "";
    if (hash.startsWith("#/")) return normalizePathname(hash.slice(1));
    if (hash.startsWith("#!/")) return normalizePathname(hash.slice(2));
    return normalizePathname(window.location.pathname || "/");
  } catch {
    return "";
  }
}
function routePathFromContext(context = {}) {
  return cleanText(
    firstNonEmpty(
      context.canonicalPath,
      context.routePath,
      context.route?.path,
      context.publicPath,
      context.requestedPath,
      context.path,
      context.options?.canonicalPath,
      context.options?.routePath,
      context.options?.path,
      ""
    ),
    ""
  );
}
function isUsuariosRoute(context = {}) {
  const explicit = routePathFromContext(context);
  if (explicit) return normalizePathname(explicit) === USUARIOS_CANONICAL_PATH;
  const browserPath = getBrowserPath();
  return browserPath ? browserPath === USUARIOS_CANONICAL_PATH : true;
}
function resolveHost(host = null, context = {}) {
  if (host?.nodeType === 1) return host;
  if (context.host?.nodeType === 1) return context.host;
  if (context.root?.nodeType === 1) return context.root;
  if (context.container?.nodeType === 1) return context.container;
  if (!isBrowser()) return null;
  return (
    document.querySelector("[data-view-host='usuarios']") ||
    document.querySelector("[data-usuarios-host='true']") ||
    document.querySelector("#app-content") ||
    document.querySelector("main") ||
    null
  );
}
function showToast(message = "", type = "info") {
  const text = cleanText(message, "");
  if (!text) return false;
  for (const toast of [AppCore?.toast, AppCore?.ui?.toast, AppCore?.Toast]) {
    try {
      if (isFunction(toast?.[type])) {
        toast[type](text);
        return true;
      }
      if (isFunction(toast?.show)) {
        toast.show(text, type);
        return true;
      }
    } catch {
      // noop
    }
  }
  return false;
}
function emitEvent(name = "", detail = {}) {
  const eventName = cleanText(name, "");
  if (!eventName) return false;
  let emitted = false;
  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(eventName, detail);
      emitted = true;
    }
  } catch {
    // noop
  }
  try {
    if (isBrowser()) {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
      emitted = true;
    }
  } catch {
    // noop
  }
  return emitted;
}
function subscribeEvent(name = "", handler = null) {
  if (!cleanText(name, "") || !isFunction(handler)) return () => {};
  let appBound = false;
  let windowBound = false;
  try {
    if (isFunction(AppCore?.events?.on)) {
      AppCore.events.on(name, handler);
      appBound = true;
    }
  } catch {
    // noop
  }
  try {
    if (isBrowser()) {
      window.addEventListener(name, handler);
      windowBound = true;
    }
  } catch {
    // noop
  }
  return () => {
    try {
      if (appBound) AppCore?.events?.off?.(name, handler);
    } catch {
      // noop
    }
    try {
      if (windowBound && isBrowser()) window.removeEventListener(name, handler);
    } catch {
      // noop
    }
  };
}
function safeCall(target = null, method = "", args = [], fallback = null) {
  try {
    const fn = target?.[method];
    return isFunction(fn) ? fn.apply(target, safeArray(args)) : fallback;
  } catch {
    return fallback;
  }
}
async function safeAsyncCall(target = null, methods = [], args = [], fallback = null) {
  for (const method of safeArray(methods)) {
    const fn = target?.[method];
    if (isFunction(fn)) return await fn.apply(target, safeArray(args));
  }
  return fallback;
}
function getUsuarioId(item = {}) {
  return cleanText(firstNonEmpty(item.userId, item.usuarioId, item.id, item.uid, item.email, ""), "");
}
function mergeUsuariosFreshPageFirst(previousItems = [], freshPage = []) {
  return mergeUsuariosCursorItems(previousItems, freshPage);
}
function csvSafeCell(value = "") {
  let text = String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\t/g, " ").trim();
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return text;
}
function csvEscape(value = "") {
  return `"${csvSafeCell(value).replace(/"/g, '""')}"`;
}
function buildUsuariosCsv(items = []) {
  const rows = safeArray(items).map((item) => [
    getUsuarioId(item),
    firstNonEmpty(item.fullName, item.displayName, item.name, item.nombre, item.username, ""),
    firstNonEmpty(item.email, item.emailLower, item.mail, ""),
    firstNonEmpty(item.phone, item.telefono, item.mobile, ""),
    firstNonEmpty(item.city, item.ciudad, item.direccion?.ciudad, item.address?.city, ""),
    firstNonEmpty(item.role, item.rol, "user"),
    firstNonEmpty(item.status, item.estado, item.state, item.active === false ? "inactive" : "active"),
    firstNonEmpty(item.lastLoginAt, ""),
  ]);
  return [
    ["ID", "Nombre", "Email", "Teléfono", "Ciudad", "Rol", "Estado", "Inicio de sesión"],
    ...rows,
  ].map((row) => row.map(csvEscape).join(";")).join("\r\n");
}
function downloadTextFile(
  content = "",
  filename = "usuarios.csv",
  mimeType = "text/csv;charset=utf-8"
) {
  if (!isBrowser()) return false;
  try {
    const blob = new Blob(
      ["\uFEFF", String(content || "")],
      {
        type:
          cleanText(
            mimeType,
            "text/plain;charset=utf-8"
          ),
      }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = cleanText(filename, "descarga.txt");
    anchor.rel = "noopener";
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

const USUARIOS_RESEND_CONFIRM_ROOT_ID =
  "usuarios-resend-activation-confirm-root";

let activeUsuarioActivationConfirm = null;

function usuarioDisplayName(item = {}) {
  return cleanText(
    firstNonEmpty(
      item.fullName,
      item.displayName,
      item.name,
      item.nombre,
      item.username,
      item.email,
      "Usuario"
    ),
    "Usuario"
  );
}

function usuarioEmail(item = {}) {
  return cleanText(
    firstNonEmpty(
      item.email,
      item.emailLower,
      item.mail,
      ""
    ),
    ""
  ).toLowerCase();
}

function usuarioFirstName(item = {}) {
  return (
    usuarioDisplayName(item)
      .split(/\s+/u)
      .filter(Boolean)[0] ||
    "usuario"
  );
}

function buildManualActivationTemplate(
  user = {},
  result = {}
) {
  const name =
    usuarioFirstName(user);
  const email =
    cleanText(
      result?.email,
      usuarioEmail(user)
    ).toLowerCase();
  const activationUrl =
    cleanText(
      result?.activationUrl,
      ""
    );

  if (!activationUrl) {
    throw new Error(
      "USUARIOS_MANUAL_ACTIVATION_URL_REQUIRED"
    );
  }

  return [
    email ? `Para: ${email}` : "",
    "Asunto: Activación de tu cuenta · Onion Support",
    "",
    `Hola ${name},`,
    "",
    "Te envío un nuevo enlace de activación para que puedas finalizar el alta de tu cuenta de Onion Support y crear tu contraseña de acceso.",
    "",
    "Puedes activar la cuenta desde el siguiente enlace:",
    "",
    activationUrl,
    "",
    "Este enlace es nuevo y será válido durante las próximas 24 horas. Si habías recibido algún enlace anterior, utiliza únicamente este, ya que los anteriores han quedado invalidados.",
    "",
    "Una vez accedas al enlace, podrás establecer tu contraseña y completar la activación de la cuenta.",
    "",
    "Si tienes cualquier problema durante el proceso, respóndeme a este mismo correo y lo revisamos.",
    "",
    "Un saludo,",
    "",
  ]
    .filter((line, index, lines) =>
      line !== "" ||
      index > 1 ||
      Boolean(lines[0])
    )
    .join("\r\n");
}

function manualActivationFilename(user = {}) {
  const id =
    getUsuarioId(user)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) ||
    "usuario";

  return `activacion-manual-${id}.txt`;
}

function renderUsuarioActivationConfirmation(
  root,
  {
    user,
    onDeliveryChange = null,
  } = {}
) {
  const name = usuarioDisplayName(user);
  const email = usuarioEmail(user);
  const titleId = "usuarios-resend-activation-confirm-title";
  const descriptionId = "usuarios-resend-activation-confirm-description";

  root.innerHTML = renderModalShell({
    rootAttributes: {
      "data-usuarios-resend-confirm-shell": "true",
    },
    overlayAttributes: {
      "data-usuarios-resend-confirm-overlay": "true",
    },
    panelAttributes: {
      "data-usuarios-resend-confirm-dialog": "true",
    },
    role: "alertdialog",
    labelledBy: titleId,
    describedBy: descriptionId,
    size: "confirm",
    height: "auto",
    header: `<div class="usuarios-resend-confirm-heading">
      <span class="usuarios-resend-confirm-eyebrow">Cuenta pendiente</span>
      <h2 id="${titleId}">Activación de cuenta</h2>
    </div>`,
    bodyClass: "usuarios-resend-confirm-body",
    body: `<span class="usuarios-resend-confirm-icon" aria-hidden="true">↻</span>
      <div class="usuarios-resend-confirm-copy">
        <p id="${descriptionId}">Se generará un enlace nuevo para <strong>${escapeHtml(email || "su correo")}</strong>. El enlace anterior dejará de ser válido y el nuevo caducará en 24 horas.</p>
        <div class="usuarios-resend-confirm-meta">
          <span>${escapeHtml(name)}</span>
          ${email ? `<span>${escapeHtml(email)}</span>` : ""}
        </div>
        <fieldset class="usuarios-resend-delivery" aria-label="Método de entrega">
          <label class="usuarios-resend-delivery-option">
            <input type="radio" name="usuarios-activation-delivery" value="email" data-usuarios-activation-delivery="email" checked>
            <span class="usuarios-resend-delivery-copy">
              <strong>Enviar automáticamente</strong>
              <span>Onion Support enviará el template de activación al correo del usuario.</span>
            </span>
          </label>
          <label class="usuarios-resend-delivery-option">
            <input type="radio" name="usuarios-activation-delivery" value="manual" data-usuarios-activation-delivery="manual">
            <span class="usuarios-resend-delivery-copy">
              <strong>Generar envío manual</strong>
              <span>No se enviará correo automático. Se descargará un .txt con el mensaje y el enlace para enviarlo desde tu correo.</span>
            </span>
          </label>
        </fieldset>
      </div>`,
    footer: `<button type="button" class="usuarios-resend-confirm-btn usuarios-resend-confirm-btn--cancel" data-usuarios-resend-confirm-action="cancel">Cancelar</button>
      <button type="button" class="usuarios-resend-confirm-btn usuarios-resend-confirm-btn--confirm" data-usuarios-resend-confirm-action="confirm">Continuar</button>`,
  });

  for (
    const input
    of root.querySelectorAll(
      "[data-usuarios-activation-delivery]"
    )
  ) {
    input.addEventListener(
      "change",
      () => {
        if (
          input.checked &&
          isFunction(onDeliveryChange)
        ) {
          onDeliveryChange(
            cleanText(
              input.value,
              "email"
            )
          );
        }
      }
    );
  }

  return {
    panel: root.querySelector(MODAL_SHELL_SELECTORS.panel),
    cancel: root.querySelector("[data-usuarios-resend-confirm-action='cancel']"),
    confirm: root.querySelector("[data-usuarios-resend-confirm-action='confirm']"),
  };
}

function confirmUsuarioActivationResend({
  user = {},
  opener = null,
  signal = undefined,
} = {}) {
  const userId = getUsuarioId(user);

  if (activeUsuarioActivationConfirm) {
    if (
      activeUsuarioActivationConfirm.userId === userId &&
      activeUsuarioActivationConfirm.signal === signal
    ) {
      return activeUsuarioActivationConfirm.promise;
    }
    return Promise.resolve("");
  }

  let selectedDelivery = "email";

  const confirmationPromise = openModalConfirmation({
    host: {
      id: USUARIOS_RESEND_CONFIRM_ROOT_ID,
      attributes: {
        "data-usuarios-resend-confirm-root": "true",
      },
    },
    render: (root) =>
      renderUsuarioActivationConfirmation(
        root,
        {
          user,
          onDeliveryChange:
            (value) => {
              selectedDelivery =
                value === "manual"
                  ? "manual"
                  : "email";
            },
        }
      ),
    opener,
    signal,
    bodyClasses: [
      "usuarios-resend-confirm-open",
    ],
  });

  const promise =
    confirmationPromise.then(
      (confirmed) =>
        confirmed
          ? selectedDelivery
          : ""
    );

  activeUsuarioActivationConfirm = {
    userId,
    signal,
    promise,
  };

  void promise.finally(() => {
    if (activeUsuarioActivationConfirm?.promise === promise) {
      activeUsuarioActivationConfirm = null;
    }
  });

  return promise;
}

async function dispatchUsuarioDetail(id, opener = null, originHost = null) {
  if (!cleanText(id, "")) return false;
  const { EntityOverlay } = await import("../../features/entity-overlay/index.js");
  return EntityOverlay.open({ type: "usuario", id, opener, originHost });
}

/* SÓLO HABLA QUIEN PUEDE RESPONDER.

   `errorMessage` extrae el texto que un error lleva dentro; decidir si ese
   texto se le enseña a alguien es de esta vista. Un error del backend llega
   siempre con estado HTTP o con código --lo pone `core/http.js`, y el cursor de
   Usuarios además copia el mensaje de la respuesta--, así que sigue hablando
   con sus propias palabras. Una falta de programación no trae ninguno de los
   dos: `ReferenceError: directoryKey is not defined` tenía `status: null` y
   `code: null`, y aun así acabó impreso en la pantalla de Usuarios.

   Cuando no hay ni estado ni código no sabemos de qué hablamos, así que manda
   el texto por defecto que declara cada llamada. El detalle técnico no se
   pierde: el motor lo sigue registrando y `describeError` lo conserva.

   Se decide por los hechos que ya calcula la autoridad --estado y código--, no
   por el nombre de la clase del error: así ningún error propio del producto con
   nombre propio se queda mudo por parecerse a una falta del motor. */
function humanErrorText(error, fallback) {
  return errorStatus(error, 0) || errorCode(error)
    ? errorMessage(error, fallback, ERROR_MESSAGE_POLICIES.messageFirst)
    : cleanText(fallback, "");
}

function createUsuariosController(rawHost = null, rawContext = {}) {
  const context = safeObject(rawContext, {});
  const detailOnly = context.detailOnly === true;
  const host = detailOnly ? null : resolveHost(rawHost, context);
  const ownerId = `${USUARIOS_VIEW_VERSION}:${++controllerSequence}`;

  let mounted = false;
  let destroyed = false;
  let loading = false;
  let loadingMore = false;
  let refreshing = false;
  let exporting = false;
  let creating = false;
  let createOpen = false;
  let openingUserId = "";
  let resendingActivationUserId = "";
  let resendConfirmationAbort = null;
  let error = "";
  let loadMoreError = "";

  let items = [];
  let continuationToken = "";
  let hasMore = false;
  let seenPageCursors = new Set();
  let totalKnown = false;
  let totalCount = null;
  let lastSyncAt = 0;
  let filter = "all";
  let search = "";
  let searchDraft = "";
  let sortOrder = normalizeSessionSortOrder(USUARIOS_DEFAULT_SORT_ORDER);

  let queryEpoch = 0;
  let detailEpoch = 0;
  let detailRefreshEpoch = 0;
  let detailModalOpen = false;
  let detailId = "";
  let detailTask = null;
  let detailRequest = null;
  let deferredListRender = false;
  let domainDirty = false;
  let loadTask = null;
  let loadMoreTask = null;
  let infiniteObserver = null;
  let searchTimer = 0;
  let searchComposing = false;
  let focusHandler = null;
  let visibilityHandler = null;
  let hostClickHandler = null;
  let hostInputHandler = null;
  let hostCompositionStartHandler = null;
  let hostCompositionEndHandler = null;
  let hostKeydownHandler = null;
  const unsubscribers = [];

  function originModalOpen() {
    return detailModalOpen || Boolean(host && AppCore.getModule?.("entities")?.isOriginOpen?.(host));
  }
  function refreshChangedDomain() {
    if (detailOnly || destroyed || !domainDirty || originModalOpen() || loading || refreshing || loadTask || loadMoreTask) return;
    domainDirty = false;
    void refresh();
  }
  function ownsHost() {
    return Boolean(host && host[USUARIOS_CONTROLLER_KEY] === controller);
  }
  function ownsGlobal() {
    return getGlobalObject()?.[USUARIOS_GLOBAL_CONTROLLER_KEY] === controller;
  }
  function routeActive() {
    return !context.signal?.aborted && (detailOnly || isUsuariosRoute(context));
  }
  function admin() {
    return isAdminContext(context);
  }
  function currentQuery() {
    return {
      search: cleanText(search, ""),
      status: filter,
    };
  }
  function displayItems() {
    return sortBySessionStart(items, sortOrder);
  }
  function stateSnapshot() {
    const visibleSearch = searchDraft;
    return {
      loading,
      loadingMore,
      refreshing,
      exporting,
      creating,
      openingUserId,
      resendingActivationUserId,
      error,
      loadMoreError,
      filter,
      activeFilter: filter,
      search: visibleSearch,
      searchQuery: visibleSearch,
      searchPending: Boolean(searchTimer) || searchComposing,
      sortField: "lastLoginAt",
      sortOrder,
      totalKnown,
      totalCount,
      remoteCount: totalKnown ? totalCount : null,
      loadedCount: items.length,
      hasMore,
      lastSyncAt,
      pageSize: USUARIOS_CURSOR_PAGE_SIZE,
      page: Math.max(1, Math.ceil(items.length / USUARIOS_CURSOR_PAGE_SIZE)),
      currentPage: Math.max(1, Math.ceil(items.length / USUARIOS_CURSOR_PAGE_SIZE)),
      cursorPresent: Boolean(continuationToken),
      cursorHidden: true,
    };
  }
  function viewPayload() {
    const state = getAppState();
    const role = getCurrentRole(context, state);
    const admin = context.admin === true || role === "admin";
    const viewState = stateSnapshot();
    return {
      items,
      users: items,
      usuarios: items,
      rows: items,
      state: viewState,
      ...viewState,
      admin,
      role,
      forbidden: !admin,
      restricted: !admin,
      accessDenied: !admin,
      route: USUARIOS_CANONICAL_PATH,
      source: USUARIOS_INDEX_SOURCE,
      version: USUARIOS_VIEW_VERSION,
      totalKnown,
      totalCount,
      remoteCount: totalKnown ? totalCount : items.length,
      visibleLimit: items.length || DEFAULT_VISIBLE_ROWS,
      usuariosVisibleLimit: items.length || DEFAULT_VISIBLE_ROWS,
      cursorDriven: true,
      serverFiltered: true,
      localDatasetCeiling: false,
    };
  }
  function actionFocusScope(node = null) {
    if (!node?.matches) return "";
    if (node.matches(".usuarios-stat-card")) return "stat-card";
    if (node.matches(".usuarios-filter-pill")) return "filter-pill";
    if (node.matches(".usuarios-feed-retry")) return "feed-retry";
    if (node.closest?.(".usuarios-hero-actions")) return "hero-action";
    return "action";
  }
  function captureDomState() {
    if (!host || !isBrowser()) return {};
    const active = document.activeElement;
    const searchInput = host.querySelector("[data-usuarios-search-input='true']");
    const row = active?.closest?.("[data-user-row='true'][data-user-id]");
    const action = active?.closest?.("[data-usuarios-action], [data-action]");
    const actionNodes = Array.from(
      host.querySelectorAll("[data-usuarios-action], [data-action]")
    );
    const scrollRoot = resolveInfiniteScrollRoot();
    return {
      scrollTop: coercedNumber(scrollRoot?.scrollTop, 0),
      searchFocused: active === searchInput,
      selectionStart: active === searchInput ? searchInput.selectionStart : null,
      selectionEnd: active === searchInput ? searchInput.selectionEnd : null,
      userId: cleanText(row?.getAttribute?.("data-user-id"), ""),
      action: cleanText(
        firstNonEmpty(
          action?.getAttribute?.("data-usuarios-action"),
          action?.getAttribute?.("data-action"),
          ""
        ),
        ""
      ),
      filter: cleanText(action?.getAttribute?.("data-filter"), ""),
      sortOrder: cleanText(action?.getAttribute?.("data-sort-order"), ""),
      actionScope: actionFocusScope(action),
      actionIndex: action ? actionNodes.indexOf(action) : -1,
      elementId: cleanText(active?.id, ""),
      statusFocused: active?.matches?.(".usuarios-history-subtitle") === true,
    };
  }
  function restoreDomState(snapshot = {}) {
    if (!host || !isBrowser()) return false;
    try {
      const scrollRoot = resolveInfiniteScrollRoot();
      if (scrollRoot) scrollRoot.scrollTop = coercedNumber(snapshot.scrollTop, 0);
      if (snapshot.searchFocused) {
        const input = host.querySelector("[data-usuarios-search-input='true']");
        input?.focus?.({ preventScroll: true });
        if (
          input &&
          Number.isInteger(snapshot.selectionStart) &&
          Number.isInteger(snapshot.selectionEnd)
        ) {
          input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
        }
        return true;
      }

      let target = null;
      if (snapshot.userId) {
        target = Array.from(
          host.querySelectorAll("[data-user-row='true'][data-user-id]")
        ).find(
          (candidate) =>
            cleanText(candidate.getAttribute("data-user-id"), "") === snapshot.userId
        ) || null;
      }
      if (!target && snapshot.elementId) {
        const candidate = document.getElementById(snapshot.elementId);
        if (candidate && host.contains(candidate)) target = candidate;
      }
      if (!target && snapshot.action) {
        const actionNodes = Array.from(
          host.querySelectorAll("[data-usuarios-action], [data-action]")
        );
        const matchesActionIdentity = (candidate) => {
          const actionName = cleanText(
            firstNonEmpty(
              candidate.getAttribute("data-usuarios-action"),
              candidate.getAttribute("data-action"),
              ""
            ),
            ""
          );
          const filterValue = cleanText(candidate.getAttribute("data-filter"), "");
          const candidateSort = cleanText(candidate.getAttribute("data-sort-order"), "");
          const scope = actionFocusScope(candidate);
          return (
            actionName === snapshot.action &&
            (!snapshot.filter || filterValue === snapshot.filter) &&
            (!snapshot.sortOrder || candidateSort === snapshot.sortOrder || actionName === ACTIONS.SORT_TOGGLE) &&
            (!snapshot.actionScope || scope === snapshot.actionScope)
          );
        };
        const indexedCandidate = Number.isInteger(snapshot.actionIndex)
          ? actionNodes[snapshot.actionIndex]
          : null;
        target = indexedCandidate && matchesActionIdentity(indexedCandidate)
          ? indexedCandidate
          : actionNodes.find(matchesActionIdentity) || null;
      }
      if (
        !target &&
        (
          snapshot.statusFocused ||
          [ACTIONS.RETRY_PAGE, ACTIONS.RETRY, ACTIONS.REFRESH].includes(
            snapshot.action
          )
        )
      ) {
        target = host.querySelector(".usuarios-history-subtitle");
      }
      target?.focus?.({ preventScroll: true });
      return true;
    } catch {
      return false;
    }
  }
  function disconnectInfiniteObserver(observer = infiniteObserver) {
    if (!observer) return false;
    if (infiniteObserver === observer) infiniteObserver = null;
    try {
      observer.takeRecords?.();
    } catch {
      // noop
    }
    try {
      observer.disconnect();
    } catch {
      // noop
    }
    return true;
  }
  function resolveInfiniteScrollRoot() {
    if (!isBrowser()) return null;
    const mainContent = document.getElementById("main-content");
    if (mainContent?.contains?.(host)) return mainContent;
    return host?.closest?.(".main-content, [data-main-content='true']") || null;
  }
  function cancelSearchDebounce() {
    const hadPendingSearch = Boolean(searchTimer);
    if (hadPendingSearch && isBrowser()) window.clearTimeout(searchTimer);
    searchTimer = 0;
    return hadPendingSearch;
  }
  function invalidateContinuationForPendingSearch() {
    queryEpoch += 1;
    loadMoreTask = null;
    loadingMore = false;
    loadMoreError = "";
    disconnectInfiniteObserver();
    return true;
  }
  function focusSearchInput() {
    if (!host || !isBrowser()) return false;
    const input = host.querySelector("[data-usuarios-search-input='true']");
    if (!input) return false;
    try {
      input.focus({ preventScroll: true });
      const end = String(input.value || "").length;
      input.setSelectionRange?.(end, end);
      return document.activeElement === input;
    } catch {
      return false;
    }
  }
  function syncInfiniteObserver() {
    disconnectInfiniteObserver();
    if (
      !isBrowser() ||
      !mounted ||
      destroyed ||
      !routeActive() ||
      !admin() ||
      !ownsHost() ||
      originModalOpen() ||
      loading ||
      refreshing ||
      loadingMore ||
      Boolean(searchTimer) ||
      searchComposing ||
      Boolean(loadMoreError) ||
      hasMore !== true ||
      !continuationToken ||
      typeof window.IntersectionObserver !== "function"
    ) {
      return false;
    }

    const sentinel = host?.querySelector?.(
      "[data-usuarios-infinite-sentinel='true']"
    );
    const scrollRoot = resolveInfiniteScrollRoot();
    if (!sentinel || !scrollRoot) return false;

    try {
      const observer = new window.IntersectionObserver(
        (entries) => {
          if (infiniteObserver !== observer) {
            disconnectInfiniteObserver(observer);
            return;
          }
          if (
            destroyed ||
            !mounted ||
            !routeActive() ||
            !admin() ||
            !ownsHost() ||
            originModalOpen() ||
            loading ||
            refreshing ||
            loadingMore ||
            Boolean(searchTimer) ||
            searchComposing ||
            Boolean(loadMoreError) ||
            hasMore !== true ||
            !continuationToken
          ) {
            disconnectInfiniteObserver(observer);
            return;
          }
          if (!entries.some((entry) => entry.isIntersecting)) return;
          disconnectInfiniteObserver(observer);
          void loadMore();
        },
        {
          root: scrollRoot,
          rootMargin: USUARIOS_INFINITE_ROOT_MARGIN,
          threshold: 0.01,
        }
      );
      infiniteObserver = observer;
      observer.observe(sentinel);
      return true;
    } catch {
      disconnectInfiniteObserver();
      return false;
    }
  }
  function render({ preserveDom = true } = {}) {
    if (detailOnly) return false;
    disconnectInfiniteObserver();
    if (destroyed || !host || !routeActive() || !ownsHost()) return false;
    if (openingUserId || originModalOpen()) { deferredListRender = true; return false; }
    deferredListRender = false;
    const dom = preserveDom ? captureDomState() : {};
    const template = document.createElement("template");
    template.innerHTML = renderUsuariosTableTemplate(viewPayload()).trim();
    host.replaceChildren(template.content);
    host.setAttribute("data-usuarios-controller", ownerId);
    host.setAttribute("data-usuarios-version", USUARIOS_VIEW_VERSION);
    if (preserveDom) restoreDomState(dom);
    syncInfiniteObserver();
    return true;
  }
  function applyPage(
    page = {},
    {
      append = false,
      preservePages = false,
      preservedToken = "",
      preservedHasMore = false,
    } = {}
  ) {
    items = append
      ? mergeUsuariosCursorItems(items, page.items)
      : preservePages
        ? mergeUsuariosFreshPageFirst(items, page.items)
        : normalizeUsuariosCollection(page.items);
    continuationToken = preservePages
      ? cleanText(preservedToken, "")
      : cleanText(page.continuationToken, "");
    hasMore = preservePages
      ? preservedHasMore === true && Boolean(continuationToken)
      : page.hasMore === true && Boolean(continuationToken);
    if (page.totalKnown === true) {
      totalKnown = true;
      totalCount = Math.max(items.length, coercedNumber(page.total, items.length));
    } else if (!append && !preservePages) {
      totalKnown = false;
      totalCount = null;
    }
    lastSyncAt = Date.now();
    error = "";
    loadMoreError = "";
    return items;
  }
  async function loadFirstPage({ silent = false, preservePages = false } = {}) {
    if (detailOnly || destroyed || !routeActive() || !admin()) return items;
    const keepAccumulatedPages = preservePages === true && items.length > 0;
    const keepVisibleRows = items.length > 0 && (silent === true || keepAccumulatedPages);
    const preservedToken = continuationToken;
    const preservedHasMore = hasMore;
    const epoch = ++queryEpoch;
    loadMoreTask = null;
    loadingMore = false;

    // Stale-while-revalidate: una actualización silenciosa nunca vacía una
    // tabla que el administrador ya está leyendo. La respuesta fresca la
    // sustituye al completar la consulta.
    if (!keepVisibleRows) {
      items = [];
      continuationToken = "";
      hasMore = false;
      seenPageCursors = new Set();
      totalKnown = false;
      totalCount = null;
    }

    loadMoreError = "";
    loading = !keepVisibleRows;
    refreshing = keepVisibleRows;
    error = "";
    render();

    try {
      const page = await fetchUsuariosCursorPage({
        ...currentQuery(),
        cursor: "",
        limit: USUARIOS_CURSOR_PAGE_SIZE,
        includeTotal: true,
      });
      if (destroyed || epoch !== queryEpoch || !routeActive()) return items;
      applyPage(page, {
        append: false,
        preservePages: keepAccumulatedPages,
        preservedToken,
        preservedHasMore,
      });
      if (!keepAccumulatedPages) {
        seenPageCursors = new Set(
          continuationToken ? [continuationToken] : []
        );
      }
      loading = false;
      refreshing = false;
      render();
      emitEvent("usuarios:loaded", {
        source: USUARIOS_INDEX_SOURCE,
        version: USUARIOS_VIEW_VERSION,
        count: items.length,
        totalKnown,
        totalCount,
        hasMore,
        cursorDriven: true,
        sortField: "lastLoginAt",
        sortOrder,
        lastSyncAt,
      });
      return items;
    } catch (loadError) {
      if (destroyed || epoch !== queryEpoch) return items;
      error = humanErrorText(loadError, "No se pudieron cargar los usuarios.");
      loading = false;
      refreshing = false;
      if (keepVisibleRows && !keepAccumulatedPages) {
        // La query nueva falló: conservamos las filas antiguas como fallback,
        // pero no reutilizamos su cursor con los filtros nuevos.
        continuationToken = "";
        hasMore = false;
        seenPageCursors = new Set();
        totalKnown = false;
        totalCount = null;
      }
      render();
      if (!silent) showToast(error, "error");
      emitEvent("usuarios:error", { source: USUARIOS_INDEX_SOURCE, message: error });
      return items;
    } finally {
      if (epoch === queryEpoch) refreshChangedDomain();
    }
  }
  function load(options = {}) {
    if (detailOnly || destroyed || !routeActive()) return Promise.resolve(items);
    if (loadTask) return loadTask;
    loadTask = loadFirstPage(options).finally(() => {
      loadTask = null;
      refreshChangedDomain();
    });
    return loadTask;
  }
  async function loadMore({ retry = false } = {}) {
    if (
      detailOnly ||
      destroyed ||
      !routeActive() ||
      !admin() ||
      originModalOpen() ||
      loading ||
      refreshing ||
      Boolean(loadTask) ||
      Boolean(searchTimer) ||
      searchComposing ||
      !hasMore ||
      !continuationToken ||
      (Boolean(loadMoreError) && !retry)
    ) {
      return items.length;
    }
    if (loadMoreTask) {
      await loadMoreTask;
      return items.length;
    }
    const epoch = queryEpoch;
    const cursor = continuationToken;
    loadingMore = true;
    error = "";
    loadMoreError = "";
    render();
    const task = (async () => {
      try {
        const page = await fetchUsuariosCursorPage({
          ...currentQuery(),
          cursor,
          limit: USUARIOS_CURSOR_PAGE_SIZE,
          includeTotal: false,
        });
        if (
          destroyed ||
          epoch !== queryEpoch ||
          cursor !== continuationToken ||
          !routeActive()
        ) {
          return items.length;
        }
        const responseCursor = cleanText(page.continuationToken, "");
        const responseHasMore = page.hasMore === true && Boolean(responseCursor);
        const mergedItems = mergeUsuariosCursorItems(items, page.items);
        if (
          responseHasMore &&
          (responseCursor === cursor || seenPageCursors.has(responseCursor))
        ) {
          const cursorError = new Error(
            "La API devolvió un cursor de usuarios ya recorrido."
          );
          cursorError.code = "USUARIOS_CURSOR_DID_NOT_ADVANCE";
          throw cursorError;
        }
        if (responseHasMore && mergedItems.length <= items.length) {
          const progressError = new Error(
            "La siguiente página de usuarios no añadió registros nuevos."
          );
          progressError.code = "USUARIOS_PAGE_DID_NOT_ADVANCE";
          throw progressError;
        }
        applyPage(page, { append: true });
        if (responseCursor) seenPageCursors.add(responseCursor);
        render();
        emitEvent("usuarios:page:loaded", {
          count: items.length,
          totalKnown,
          totalCount,
          hasMore,
          cursorDriven: true,
          sortField: "lastLoginAt",
          sortOrder,
        });
        return items.length;
      } catch (pageError) {
        if (!destroyed && epoch === queryEpoch) {
          loadMoreError = humanErrorText(pageError, "No se pudieron cargar más usuarios.");
          showToast(loadMoreError, "error");
          render();
        }
        return items.length;
      } finally {
        if (!destroyed && epoch === queryEpoch) {
          loadingMore = false;
          render();
        }
      }
    })();
    loadMoreTask = task;
    try {
      return await task;
    } finally {
      if (loadMoreTask === task) loadMoreTask = null;
      refreshChangedDomain();
    }
  }
  function retryLoadMore() {
    if (!loadMoreError) return Promise.resolve(items.length);
    return loadMore({ retry: true });
  }
  function retryFirstPage() {
    return loadFirstPage({ silent: false });
  }
  function refresh() {
    return load({ silent: true, preservePages: true });
  }
  function setFilter(value = "all") {
    cancelSearchDebounce();
    search = cleanText(searchDraft, "");
    const next = slugKey(value);
    filter = ["active", "pending", "blocked"].includes(next) ? next : "all";
    void loadFirstPage({ silent: true });
    return filter;
  }
  function setSearch(value = "") {
    cancelSearchDebounce();
    searchDraft = String(value ?? "");
    search = cleanText(searchDraft, "");
    void loadFirstPage({ silent: true });
    return search;
  }
  function scheduleSearch(value = "") {
    searchDraft = String(value ?? "");
    if (!isBrowser()) return setSearch(searchDraft);
    cancelSearchDebounce();
    invalidateContinuationForPendingSearch();
    searchTimer = window.setTimeout(() => {
      searchTimer = 0;
      search = cleanText(searchDraft, "");
      void loadFirstPage({ silent: true });
    }, SEARCH_DEBOUNCE_MS);
    render();
    return true;
  }
  function setSortOrder(value = USUARIOS_DEFAULT_SORT_ORDER) {
    sortOrder = normalizeSessionSortOrder(value);
    render();
    return sortOrder;
  }
  function toggleSortOrder(value = "") {
    const requested = slugKey(value);
    sortOrder = requested === "asc" || requested === "desc"
      ? requested
      : sortOrder === "desc"
        ? "asc"
        : "desc";
    render();
    return sortOrder;
  }
  function clearFilters() {
    cancelSearchDebounce();
    filter = "all";
    search = "";
    searchDraft = "";
    sortOrder = "desc";
    void loadFirstPage({ silent: true });
    return true;
  }
  function abortDetail() {
    detailRequest?.abort();
    detailRequest = null;
    detailTask = null;
  }
  function onDetailClosed({ notify = true } = {}) {
    const closedId = detailId;
    detailModalOpen = false;
    detailId = "";
    detailEpoch += 1;
    detailRefreshEpoch += 1;
    openingUserId = "";
    abortDetail();
    if (notify && !destroyed) context.onDetailClosed?.({ controller, id: closedId });
  }
  function closeDetailModal({ notify = true, restoreFocus = true } = {}) {
    if (!detailOnly) return AppCore.getModule?.("entities")?.close?.() ?? false;
    if (detailModalOpen) {
      return UsuariosDetailModal.close({ notify, restoreFocus });
    }
    detailEpoch += 1;
    detailRefreshEpoch += 1;
    openingUserId = "";
    abortDetail();
    return true;
  }
  function mountDetail(detail, opener = null) {
    detailId = getUsuarioId(detail);
    detailModalOpen = true;
    const opened = UsuariosDetailModal.open(detail, {
      controller,
      opener,
      onClosed: onDetailClosed,
    });
    if (opened === false) {
      detailModalOpen = false;
      detailId = "";
      return false;
    }
    context.onDetailShell?.({ controller, id: detailId, modalHost: document.querySelector("[data-usuarios-modal-host='true']") });
    return true;
  }
  function openUsuario(userId = "", opener = null) {
    const id = cleanText(userId, "");
    if (!id || destroyed || !routeActive() || !admin()) return Promise.resolve(null);
    if (!detailOnly) return dispatchUsuarioDetail(id, opener, host);
    if (openingUserId === id && detailTask) return detailTask;
    if (detailModalOpen && detailId === id) {
      return Promise.resolve(UsuariosDetailModal.getState().detail);
    }
    if (detailModalOpen) closeDetailModal({ restoreFocus: false, notify: false });
    abortDetail();
    const epoch = ++detailEpoch;
    detailRefreshEpoch += 1;
    const request = new AbortController();
    detailRequest = request;
    openingUserId = id;
    const cached = getUsuarioByIdApiStore(id) || null;
    if (cached) mountDetail(normalizeUsuarioModel(cached), opener);
    const task = (async () => {
      try {
        const detail = await loadUsuarioDetailApi(id, {
          force: true,
          dedupe: false,
          signal: request.signal,
          allowCacheFallback: true,
        });
        if (destroyed || request.signal.aborted || epoch !== detailEpoch || !routeActive()) return null;
        if (!detail) throw new Error("USUARIO_DETAIL_NOT_FOUND");
        const normalized = normalizeUsuarioModel(detail);
        if (getUsuarioId(normalized) !== id) throw new Error("USUARIO_DETAIL_ID_MISMATCH");
        if (detailModalOpen && detailId === id) UsuariosDetailModal.update(normalized);
        else mountDetail(normalized, opener);
        return normalized;
      } catch (detailError) {
        if (destroyed || request.signal.aborted || epoch !== detailEpoch || !routeActive()) return null;
        if (!cached) showToast(humanErrorText(detailError, "No se pudo abrir el usuario."), "error");
        return cached;
      } finally {
        if (detailRequest === request) detailRequest = null;
        if (epoch === detailEpoch) {
          openingUserId = "";
          if (!detailModalOpen && deferredListRender) render();
        }
      }
    })();
    detailTask = task;
    void task.finally(() => { if (detailTask === task) detailTask = null; });
    return task;
  }
  async function refreshUsuario(userId = "") {
    const id = cleanText(firstNonEmpty(userId, detailId, ""), "");
    if (!id || destroyed || !routeActive() || !detailModalOpen || detailId !== id) return null;
    // The shell can be used during its initial cache revalidation. Refresh
    // shares that request instead of fetching and painting the same user twice.
    if (openingUserId === id && detailTask) return detailTask;
    abortDetail();
    const epoch = ++detailRefreshEpoch;
    const request = new AbortController();
    detailRequest = request;
    try {
      const detail = await loadUsuarioDetailApi(id, {
        force: true,
        dedupe: false,
        signal: request.signal,
        allowCacheFallback: true,
      });
      if (!detail || destroyed || request.signal.aborted || epoch !== detailRefreshEpoch || !routeActive() || !detailModalOpen || detailId !== id) return null;
      const normalized = normalizeUsuarioModel(detail);
      if (getUsuarioId(normalized) !== id) throw new Error("USUARIO_DETAIL_ID_MISMATCH");
      UsuariosDetailModal.update(normalized);
      return normalized;
    } catch (refreshError) {
      if (!request.signal.aborted && epoch === detailRefreshEpoch && !destroyed) {
        showToast(humanErrorText(refreshError, "No se pudo actualizar el usuario."), "error");
      }
      return null;
    } finally {
      if (detailRequest === request) detailRequest = null;
    }
  }
  async function copyUsuarioId(userId = "") {
    const id = cleanText(firstNonEmpty(userId, detailId, ""), "");
    if (!detailModalOpen || id !== detailId) return false;
    return UsuariosDetailModal.copyId();
  }
  async function openCreate() {
    if (detailOnly || destroyed || creating || createOpen) return false;
    creating = true;
    render();
    try {
      const result = await safeAsyncCall(
        UsuariosCreateModal,
        ["open", "mount", "init"],
        [{ source: USUARIOS_INDEX_SOURCE, context }],
        false
      );
      createOpen = result !== false;
      if (!createOpen) createOpen = emitEvent("usuarios:create:open", { source: USUARIOS_INDEX_SOURCE });
      return createOpen;
    } catch (createError) {
      showToast(humanErrorText(createError, "No se pudo abrir el alta de usuario."), "error");
      return false;
    } finally {
      creating = false;
      render();
    }
  }
  function closeCreate() {
    createOpen = false;
    return Boolean(
      safeCall(UsuariosCreateModal, "close", [], null) ??
      safeCall(UsuariosCreateModal, "unmount", [], null) ??
      emitEvent("usuarios:create:close", {})
    );
  }
  async function submitCreateUsuario(payloadValue = {}) {
    const submit = UsuariosCreateModal?.submit || UsuariosCreateModal?.submitCreate || UsuariosCreateModal?.save;
    if (!isFunction(submit)) throw new Error("USUARIOS_CREATE_MODAL_SUBMIT_UNAVAILABLE");
    return submit.call(UsuariosCreateModal, safeObject(payloadValue));
  }
  async function resendActivation(userId = "", opener = null) {
    const id = cleanText(userId, "");
    if (
      !id ||
      destroyed ||
      !routeActive() ||
      !admin() ||
      resendingActivationUserId
    ) {
      return false;
    }

    const user =
      findUsuarioById(items, id) ||
      getUsuarioByIdApiStore(id) ||
      null;

    if (!user) {
      showToast(
        "No se ha encontrado el usuario pendiente. Actualiza la lista y vuelve a intentarlo.",
        "warning"
      );
      return false;
    }

    resendConfirmationAbort?.abort();
    const confirmation = new AbortController();
    resendConfirmationAbort = confirmation;

    let delivery = "";
    try {
      delivery = await confirmUsuarioActivationResend({
        user,
        opener,
        signal: confirmation.signal,
      });
    } finally {
      if (resendConfirmationAbort === confirmation) {
        resendConfirmationAbort = null;
      }
    }

    if (
      !delivery ||
      destroyed ||
      !routeActive() ||
      !admin()
    ) {
      return false;
    }

    resendingActivationUserId = id;
    render();

    try {
      const result =
        await resendUsuarioActivationRequestApi(
          id,
          {
            delivery,
            signal:
              context.signal,
          }
        );

      const email =
        cleanText(
          result?.email,
          usuarioEmail(user)
        );

      if (delivery === "manual") {
        const text =
          buildManualActivationTemplate(
            user,
            result
          );

        if (
          !downloadTextFile(
            text,
            manualActivationFilename(user),
            "text/plain;charset=utf-8"
          )
        ) {
          throw new Error(
            "USUARIOS_MANUAL_ACTIVATION_DOWNLOAD_FAILED"
          );
        }

        showToast(
          email
            ? `Enlace nuevo generado. Se ha descargado la plantilla manual para ${email}.`
            : "Enlace nuevo generado. Se ha descargado la plantilla manual.",
          "success"
        );
      } else if (result?.mail?.sent === true) {
        showToast(
          email
            ? `Nuevo enlace de activación enviado a ${email}.`
            : "Nuevo enlace de activación enviado.",
          "success"
        );
      } else {
        showToast(
          cleanText(
            result?.message,
            "Se ha generado un enlace nuevo, pero el correo no se ha podido entregar. Puedes volver a intentarlo en modo manual."
          ),
          "warning"
        );
      }

      return result;
    } catch (resendError) {
      const code = errorCode(resendError);

      if (
        code === "ACCOUNT_ALREADY_ACTIVE" ||
        code === "ACTIVATION_STATE_CHANGED"
      ) {
        showToast(
          code === "ACCOUNT_ALREADY_ACTIVE"
            ? "La cuenta ya está activada. Se actualizará la lista."
            : "El estado del usuario ha cambiado. Se actualizará la lista.",
          "info"
        );
        void loadFirstPage({
          silent: true,
          preservePages: true,
        });
        return false;
      }

      showToast(
        humanErrorText(
          resendError,
          delivery === "manual"
            ? "No se pudo generar la activación manual."
            : "No se pudo volver a enviar el enlace de activación."
        ),
        "error"
      );
      return false;
    } finally {
      if (resendingActivationUserId === id) {
        resendingActivationUserId = "";
      }
      if (!destroyed) {
        render();
      }
    }
  }

  async function exportCsv() {
    if (exporting || !items.length || destroyed) return false;
    exporting = true;
    render();
    try {
      const date = new Date().toISOString().slice(0, 10);
      const orderedItems = displayItems();
      if (!downloadTextFile(buildUsuariosCsv(orderedItems), `usuarios-cargados-${date}.csv`)) {
        throw new Error("USUARIOS_CSV_DOWNLOAD_FAILED");
      }
      showToast(`CSV generado con ${items.length} usuarios cargados.`, "success");
      return true;
    } catch (exportError) {
      showToast(humanErrorText(exportError, "No se pudo exportar el CSV."), "error");
      return false;
    } finally {
      exporting = false;
      render();
    }
  }
  function actionFrom(node = null) {
    return normalizeAction(firstNonEmpty(node?.getAttribute?.("data-usuarios-action"), node?.getAttribute?.("data-action"), ""));
  }
  async function handleAction(node = null, event = null) {
    const action = actionFrom(node);
    if (!action) return false;
    const userId = cleanText(
      firstNonEmpty(
        node?.getAttribute?.("data-user-id"),
        node?.closest?.("[data-user-id]")?.getAttribute?.("data-user-id"),
        ""
      ),
      ""
    );
    switch (action) {
      case ACTIONS.DETAIL:
        event?.preventDefault?.();
        await openUsuario(userId, node);
        return true;
      case ACTIONS.RESEND_ACTIVATION:
        event?.preventDefault?.();
        event?.stopPropagation?.();
        await resendActivation(userId, node);
        return true;
      case ACTIONS.CREATE:
        event?.preventDefault?.();
        await openCreate();
        return true;
      case ACTIONS.RETRY:
        event?.preventDefault?.();
        await retryFirstPage();
        return true;
      case ACTIONS.REFRESH:
        event?.preventDefault?.();
        await refresh();
        return true;
      case ACTIONS.EXPORT:
        event?.preventDefault?.();
        await exportCsv();
        return true;
      case ACTIONS.FILTER:
        event?.preventDefault?.();
        setFilter(node?.getAttribute?.("data-filter") || "all");
        return true;
      case ACTIONS.SORT_TOGGLE:
        event?.preventDefault?.();
        toggleSortOrder(node?.getAttribute?.("data-next-sort-order") || "");
        return true;
      case ACTIONS.CLEAR_SEARCH:
        event?.preventDefault?.();
        setSearch("");
        focusSearchInput();
        return true;
      case ACTIONS.CLEAR_FILTERS:
        event?.preventDefault?.();
        clearFilters();
        return true;
      case ACTIONS.RETRY_PAGE:
        event?.preventDefault?.();
        await retryLoadMore();
        return true;
      default:
        return false;
    }
  }
  function bindHost() {
    if (!host || hostClickHandler) return false;
    hostClickHandler = async (event) => {
      const target = event.target;
      if (typeof Element === "undefined" || !(target instanceof Element)) return;
      const node = target.closest("[data-usuarios-action], [data-action]");
      if (node && host.contains(node)) await handleAction(node, event);
    };
    hostInputHandler = (event) => {
      const target = event.target;
      if (
        typeof HTMLInputElement !== "undefined" &&
        target instanceof HTMLInputElement &&
        target.matches("[data-usuarios-search-input='true']")
      ) {
        if (event.isComposing || searchComposing) {
          searchComposing = true;
          searchDraft = String(target.value ?? "");
          cancelSearchDebounce();
          invalidateContinuationForPendingSearch();
          return;
        }
        scheduleSearch(target.value);
      }
    };
    hostCompositionStartHandler = (event) => {
      const target = event.target;
      if (
        typeof HTMLInputElement !== "undefined" &&
        target instanceof HTMLInputElement &&
        target.matches("[data-usuarios-search-input='true']")
      ) {
        searchComposing = true;
        searchDraft = String(target.value ?? "");
        cancelSearchDebounce();
        invalidateContinuationForPendingSearch();
      }
    };
    hostCompositionEndHandler = (event) => {
      const target = event.target;
      if (
        typeof HTMLInputElement !== "undefined" &&
        target instanceof HTMLInputElement &&
        target.matches("[data-usuarios-search-input='true']")
      ) {
        searchComposing = false;
        scheduleSearch(target.value);
      }
    };
    hostKeydownHandler = async (event) => {
      const target = event.target;
      if (typeof Element === "undefined" || !(target instanceof Element)) return;
      if (
        (event.key === "Enter" || event.key === " ") &&
        target.matches("[data-user-row='true'][data-user-id]")
      ) {
        event.preventDefault();
        await openUsuario(target.getAttribute("data-user-id"), target);
      }
    };
    host.addEventListener("click", hostClickHandler);
    host.addEventListener("input", hostInputHandler);
    host.addEventListener("compositionstart", hostCompositionStartHandler);
    host.addEventListener("compositionend", hostCompositionEndHandler);
    host.addEventListener("keydown", hostKeydownHandler);
    return true;
  }
  function unbindHost() {
    if (!host) return false;
    try {
      if (hostClickHandler) host.removeEventListener("click", hostClickHandler);
      if (hostInputHandler) host.removeEventListener("input", hostInputHandler);
      if (hostCompositionStartHandler) host.removeEventListener("compositionstart", hostCompositionStartHandler);
      if (hostCompositionEndHandler) host.removeEventListener("compositionend", hostCompositionEndHandler);
      if (hostKeydownHandler) host.removeEventListener("keydown", hostKeydownHandler);
    } catch {
      // noop
    }
    hostClickHandler = null;
    hostInputHandler = null;
    hostCompositionStartHandler = null;
    hostCompositionEndHandler = null;
    hostKeydownHandler = null;
    return true;
  }
  function bindEvents() {
    for (const eventName of CREATE_SUCCESS_EVENTS) {
      unsubscribers.push(subscribeEvent(eventName, () => {
        createOpen = false;
        void loadFirstPage({ silent: true, preservePages: true });
      }));
    }
    for (const eventName of CREATE_CLOSE_EVENTS) {
      unsubscribers.push(subscribeEvent(eventName, () => {
        createOpen = false;
        render();
      }));
    }
  }
  function unbindEvents() {
    while (unsubscribers.length) {
      try {
        unsubscribers.pop()?.();
      } catch {
        // noop
      }
    }
  }
  function bindResumeSignals() {
    if (!isBrowser()) return;
    const revalidate = () => {
      if (
        destroyed ||
        !mounted ||
        !routeActive() ||
        !admin() ||
        originModalOpen() ||
        loading ||
        refreshing ||
        loadTask ||
        loadMoreTask ||
        loadingMore ||
        Boolean(searchTimer) ||
        searchComposing ||
        Boolean(loadMoreError) ||
        Date.now() - lastSyncAt < RESUME_REVALIDATE_MIN_AGE_MS
      ) {
        return;
      }
      void load({ silent: true, preservePages: true });
    };
    focusHandler = revalidate;
    visibilityHandler = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("focus", focusHandler, { passive: true });
    document.addEventListener("visibilitychange", visibilityHandler, { passive: true });
  }
  function unbindResumeSignals() {
    if (!isBrowser()) return;
    try {
      if (focusHandler) window.removeEventListener("focus", focusHandler);
      if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
    } catch {
      // noop
    }
    focusHandler = null;
    visibilityHandler = null;
  }

  const controller = {
    version: USUARIOS_VIEW_VERSION,
    name: USUARIOS_MODULE_NAME,
    ownerId,
    host,
    context,
    async mount() {
      if (destroyed || mounted) return controller;
      if (context.signal?.aborted) { controller.destroy(); return controller; }
      if (!host && !detailOnly) throw new Error("USUARIOS_HOST_REQUIRED");
      mounted = true;
      context.signal?.addEventListener("abort", controller.destroy, { once: true });
      if (detailOnly) return controller;
      bindHost();
      bindEvents();
      bindResumeSignals();
      unsubscribers.push(onDomainChanged((domain) => {
        if (domain !== "usuarios" || creating || UsuariosCreateModal.getState?.().submitting) return;
        domainDirty = true;
        refreshChangedDomain();
      }));
      const unsubscribeModal = AppCore.getModule?.("entities")?.subscribe?.((event) => {
        if (event.originHost !== host) return;
        if (event.phase === "opened") disconnectInfiniteObserver();
        else if (event.phase === "closed") {
          if (deferredListRender) render();
          refreshChangedDomain();
          syncInfiniteObserver();
        }
      });
      if (unsubscribeModal) unsubscribers.push(unsubscribeModal);
      if (!routeActive()) return controller;
      if (!admin()) {
        render({ preserveDom: false });
        return controller;
      }
      // Sólo la primera entrada sin datos usa el estado de carga inicial.
      // Las revalidaciones posteriores mantienen las filas y son visualmente silenciosas.
      void load({ silent: false });
      return controller;
    },
    render,
    reload: refresh,
    refresh,
    load,
    loadMore,
    retryLoadMore,
    retryFirstPage,
    openUsuario,
    openDetail: openUsuario,
    closeDetailModal,
    refreshUsuario,
    copyUsuarioId,
    resendActivation,
    openCreate,
    closeCreate,
    submitCreateUsuario,
    exportCsv,
    setFilter,
    setSearch,
    setSortOrder,
    toggleSortOrder,
    clearFilters,
    setVisibleLimit(value = DEFAULT_VISIBLE_ROWS) {
      if (coercedNumber(value, DEFAULT_VISIBLE_ROWS) > items.length && hasMore) void loadMore();
      return items.length;
    },
    goToPage(value = 1) {
      const target = Math.max(1, Math.floor(coercedNumber(value, 1)));
      if (target * USUARIOS_CURSOR_PAGE_SIZE > items.length && hasMore) void loadMore();
      return Math.max(1, Math.ceil(items.length / USUARIOS_CURSOR_PAGE_SIZE));
    },
    goPrevPage() {
      return Math.max(1, Math.ceil(items.length / USUARIOS_CURSOR_PAGE_SIZE));
    },
    goNextPage() {
      if (hasMore) void loadMore();
      return Math.max(1, Math.ceil(items.length / USUARIOS_CURSOR_PAGE_SIZE));
    },
    changePageSize(value = DEFAULT_VISIBLE_ROWS) {
      return controller.setVisibleLimit(value);
    },
    getItems() {
      return cloneItems(displayItems());
    },
    getFilteredItems() {
      return cloneItems(displayItems());
    },
    getPageItems() {
      return cloneItems(displayItems());
    },
    getVisibleItems() {
      return cloneItems(displayItems());
    },
    getPagination() {
      return {
        page: Math.max(1, Math.ceil(items.length / USUARIOS_CURSOR_PAGE_SIZE)),
        currentPage: Math.max(1, Math.ceil(items.length / USUARIOS_CURSOR_PAGE_SIZE)),
        pageSize: USUARIOS_CURSOR_PAGE_SIZE,
        visibleLimit: items.length,
        visibleCount: items.length,
        loadedCount: items.length,
        totalKnown,
        totalCount,
        remoteCount: totalKnown ? totalCount : null,
        hasPrev: false,
        hasNext: hasMore,
        hasMore,
        cursorPresent: Boolean(continuationToken),
      };
    },
    getUsuarioById(id = "") {
      return findUsuarioById(items, id) || null;
    },
    getState() {
      return { ...stateSnapshot(), items: cloneItems(displayItems()) };
    },
    isAdmin: admin,
    isInitialized() {
      return mounted && !destroyed;
    },
    isMounted() {
      return mounted && !destroyed;
    },
    isDestroyed() {
      return destroyed;
    },
    getSnapshot() {
      const state = getAppState();
      const role = getCurrentRole(context, state);
      const admin = context.admin === true || role === "admin";
      return {
        version: USUARIOS_VIEW_VERSION,
        apiVersion: USUARIOS_API_VERSION,
        cursorVersion: USUARIOS_CURSOR_VERSION,
        ownerId,
        detailOnly,
        detailModalOpen,
        originModalOpen: originModalOpen(),
        detailId,
        mounted,
        destroyed,
        hostOwner: ownsHost(),
        globalOwner: ownsGlobal(),
        routeActive: routeActive(),
        admin,
        role,
        loading,
        loadingMore,
        refreshing,
        exporting,
        creating,
        resendingActivation: Boolean(resendingActivationUserId),
        count: items.length,
        totalKnown,
        totalCount,
        hasMore,
        cursorPresent: Boolean(continuationToken),
        continuationTokenHidden: true,
        filter,
        sortField: "lastLoginAt",
        sortOrder,
        searchPresent: Boolean(search),
        lastSyncAt,
        error,
        loadMoreError,
        architecture: {
          cursorFirst: true,
          serverFiltered: true,
          backendPagination: true,
          legacyFetchAllUsed: false,
          localDatasetCeiling: false,
          exactTotalOptIn: true,
          staleResponseProtected: true,
          detailRefreshRaceProtected: true,
          loadMoreTaskIdentityProtected: true,
          modalDestroyCleanup: true,
          activationResendConfirmation: true,
          activationResendSingleFlight: true,
          duplicateMountProtected: true,
          routeCommitNonBlocking: true,
          csvLoadedRowsOnly: true,
          silentStaleWhileRevalidate: true,
          sessionStartVisualOrder: true,
          neverLoggedInAlwaysLast: true,
        },
      };
    },
    destroy() {
      if (destroyed) return true;
      const wasHostOwner = ownsHost();
      const wasGlobalOwner = ownsGlobal();
      const wasActiveOwner = wasHostOwner || wasGlobalOwner || lastController === controller;
      destroyed = true;
      mounted = false;
      queryEpoch += 1;
      detailEpoch += 1;
      detailRefreshEpoch += 1;
      abortDetail();
      resendConfirmationAbort?.abort();
      resendConfirmationAbort = null;
      resendingActivationUserId = "";
      context.signal?.removeEventListener("abort", controller.destroy);
      if (detailModalOpen) closeDetailModal({ notify: false, restoreFocus: false });
      detailModalOpen = false;
      detailId = "";
      cancelSearchDebounce();
      loadTask = null;
      loadMoreTask = null;
      disconnectInfiniteObserver();
      unbindHost();
      unbindEvents();
      unbindResumeSignals();
      if (!detailOnly && host) AppCore.getModule?.("entities")?.releaseOrigin?.(host);
      if (wasActiveOwner) {
        createOpen = false;
        openingUserId = "";
        try {
          UsuariosCreateModal?.close?.();
        } catch {
          // noop
        }
      }
      if (wasHostOwner) {
        try {
          delete host[USUARIOS_CONTROLLER_KEY];
          host.replaceChildren();
        } catch {
          host[USUARIOS_CONTROLLER_KEY] = null;
        }
      }
      const root = getGlobalObject();
      if (wasGlobalOwner) {
        try {
          delete root[USUARIOS_GLOBAL_CONTROLLER_KEY];
        } catch {
          root[USUARIOS_GLOBAL_CONTROLLER_KEY] = null;
        }
      }
      if (lastController === controller) lastController = null;
      return true;
    },
    unmount() {
      return controller.destroy();
    },
    cleanup() {
      return controller.destroy();
    },
    dispose() {
      return controller.destroy();
    },
  };

  return controller;
}

export async function createUsuarioDetailController(context = {}) {
  return createUsuariosController(null, { ...context, detailOnly: true }).mount();
}

export async function UsuariosView(host = null, context = {}) {
  const resolvedHost = resolveHost(host, context);
  if (!resolvedHost) throw new Error("USUARIOS_HOST_REQUIRED");
  const root = getGlobalObject();
  const seen = new Set();
  for (const previous of [
    resolvedHost[USUARIOS_CONTROLLER_KEY] || null,
    root?.[USUARIOS_GLOBAL_CONTROLLER_KEY] || null,
  ]) {
    if (!previous || seen.has(previous)) continue;
    seen.add(previous);
    try {
      previous.destroy?.();
    } catch {
      // noop
    }
  }
  const controller = createUsuariosController(resolvedHost, context);
  resolvedHost[USUARIOS_CONTROLLER_KEY] = controller;
  root[USUARIOS_GLOBAL_CONTROLLER_KEY] = controller;
  lastController = controller;
  registerGlobalBridge(controller);
  try {
    return await controller.mount();
  } catch (error) {
    controller.destroy();
    throw error;
  }
}

const UsuariosIndex = UsuariosView;
export const view = UsuariosView;
export const component = UsuariosView;
export const page = UsuariosView;
export default UsuariosView;

function getActiveUsuariosController() {
  const active = getGlobalObject()?.[USUARIOS_GLOBAL_CONTROLLER_KEY] || lastController || null;
  return active?.isDestroyed?.() === true ? null : active;
}

export const init = (...args) => UsuariosView(...args);
export const mount = (...args) => UsuariosView(...args);
export const bootstrap = (...args) => UsuariosView(...args);
export const render = (options = {}) => getActiveUsuariosController()?.render?.(options) || false;
export const reload = () => getActiveUsuariosController()?.reload?.() || Promise.resolve([]);
export const refresh = () => getActiveUsuariosController()?.refresh?.() || Promise.resolve([]);
export const destroy = () => getActiveUsuariosController()?.destroy?.() || true;
export const unmount = destroy;
export const dispose = destroy;
export const openUsuario = (userId = "", opener = null) => dispatchUsuarioDetail(userId, opener);
export const refreshUsuario = (userId = "") => {
  const modal = UsuariosDetailModal.getState();
  return !userId || modal.userId === userId ? UsuariosDetailModal.refresh() : Promise.resolve(null);
};
const copyUsuarioId = (userId = "") => {
  const modal = UsuariosDetailModal.getState();
  return !userId || modal.userId === userId ? UsuariosDetailModal.copyId() : Promise.resolve(false);
};
export const openCreate = () => getActiveUsuariosController()?.openCreate?.() || Promise.resolve(false);
export const createUsuario = openCreate;
const createUsuarioView = openCreate;
const closeCreate = () => getActiveUsuariosController()?.closeCreate?.() ?? true;
const renderCreate = () => safeCall(UsuariosCreateModal, "render", [], null);
const resetCreate = () => safeCall(UsuariosCreateModal, "reset", [], undefined);
const getCreateState = () => safeCall(UsuariosCreateModal, "getState", [], null);
const submitCreateUsuario = (payloadValue = {}) => {
  const controller = getActiveUsuariosController();
  if (controller?.submitCreateUsuario) return controller.submitCreateUsuario(payloadValue);
  const submit = UsuariosCreateModal?.submit || UsuariosCreateModal?.submitCreate || UsuariosCreateModal?.save;
  return isFunction(submit) ? submit.call(UsuariosCreateModal, safeObject(payloadValue)) : Promise.resolve(null);
};
export const exportCsv = () => getActiveUsuariosController()?.exportCsv?.() || Promise.resolve(false);
export const loadMore = () => getActiveUsuariosController()?.loadMore?.() || Promise.resolve(0);
export const setSortOrder = (order = USUARIOS_DEFAULT_SORT_ORDER) => getActiveUsuariosController()?.setSortOrder?.(order) || normalizeSessionSortOrder(order);
export const toggleSortOrder = (order = "") => getActiveUsuariosController()?.toggleSortOrder?.(order) || normalizeSessionSortOrder(order || USUARIOS_DEFAULT_SORT_ORDER);
const setVisibleLimit = (limit = DEFAULT_VISIBLE_ROWS) => getActiveUsuariosController()?.setVisibleLimit?.(limit) || 0;
const goToPage = (pageNumber = 1) => getActiveUsuariosController()?.goToPage?.(pageNumber) || 1;
const goPrevPage = () => getActiveUsuariosController()?.goPrevPage?.() || 1;
const goNextPage = () => getActiveUsuariosController()?.goNextPage?.() || 1;
const changePageSize = (size = DEFAULT_VISIBLE_ROWS) => getActiveUsuariosController()?.changePageSize?.(size) || 0;

export const fetchUsuariosRequest = (options = {}) => fetchUsuariosRequestApi(options);
export const getUsuarioByIdRequest = (id = "", options = {}) => getUsuarioByIdRequestApi(id, options);
export const createUsuarioRequest = (payloadValue = {}, options = {}) => createUsuarioRequestApi(payloadValue, options);
export const updateUsuarioRequest = (id = "", payloadValue = {}, options = {}) => updateUsuarioRequestApi(id, payloadValue, options);
export const deleteUsuarioRequest = (id = "", options = {}) => deleteUsuarioRequestApi(id, options);
export const hydrateFromCache = (options = {}) => hydrateFromCacheApi(options);
export const hydrateUsuariosFromCache = (options = {}) => hydrateUsuariosFromCacheApi(options);
export async function loadUsuarios(options = {}) {
  const controller = getActiveUsuariosController();
  if (controller?.load) return controller.load(options);
  const result = await fetchUsuariosCursorPage({
    search: options.search || options.q || "",
    status: options.status || "all",
    includeTotal: options.includeTotal !== false,
    limit: options.limit || USUARIOS_CURSOR_PAGE_SIZE,
  });
  return sortBySessionStart(result.items, options.sortOrder || USUARIOS_DEFAULT_SORT_ORDER);
}
export const listUsuarios = loadUsuarios;
export const loadUsuarioDetail = (id = "", options = {}) => loadUsuarioDetailApi(id, options);
const getUsuarioByIdApi = loadUsuarioDetail;
const createUsuarioApi = (payloadValue = {}, options = {}) => createUsuarioApiRequest(payloadValue, options);
const updateUsuarioApi = (id = "", payloadValue = {}, options = {}) => updateUsuarioApiRequest(id, payloadValue, options);
const deleteUsuarioApi = (id = "", options = {}) => deleteUsuarioApiRequest(id, options);

export const usuariosState = usuariosApiState;
export const getUsuarios = () => {
  const controller = getActiveUsuariosController();
  return controller?.getItems ? controller.getItems() : cloneItems(getUsuariosApiStore());
};
export const getSortedUsuariosStore = () => {
  const controller = getActiveUsuariosController();
  return controller?.getItems
    ? controller.getItems()
    : sortBySessionStart(cloneItems(getSortedUsuariosApiStore()), USUARIOS_DEFAULT_SORT_ORDER);
};
export const getUsuariosCount = () => {
  const controller = getActiveUsuariosController();
  return controller?.getItems ? controller.getItems().length : getUsuariosApiCount();
};
export const hasUsuarios = () => {
  const controller = getActiveUsuariosController();
  return controller?.getItems ? controller.getItems().length > 0 : hasUsuariosApi();
};
export const getUsuariosStoreSnapshot = () => {
  const controller = getActiveUsuariosController();
  if (!controller) return getUsuariosApiStoreSnapshot();
  const state = controller.getState();
  return {
    version: USUARIOS_VIEW_VERSION,
    apiVersion: USUARIOS_API_VERSION,
    cursorVersion: USUARIOS_CURSOR_VERSION,
    items: cloneItems(state.items),
    count: safeArray(state.items).length,
    totalKnown: state.totalKnown === true,
    remoteCount: state.totalKnown ? state.totalCount : null,
    hasMore: state.hasMore === true,
    sortField: state.sortField,
    sortOrder: state.sortOrder,
    lastSyncAt: coercedNumber(state.lastSyncAt, 0),
  };
};
export const getUsuariosStateSnapshot = () => ({
  ...getUsuariosApiStateSnapshot(),
  view: getActiveUsuariosController()?.getState?.() || null,
});
export const getItems = getUsuarios;
const getPageItems = () => getActiveUsuariosController()?.getPageItems?.() || [];
const getVisibleItems = () => getActiveUsuariosController()?.getVisibleItems?.() || getPageItems();
const getPagination = () => getActiveUsuariosController()?.getPagination?.() || null;
export const getUsuarioByIdStore = (id = "") => getActiveUsuariosController()?.getUsuarioById?.(id) || getUsuarioByIdApiStore(id) || null;
export const getUsuarioById = getUsuarioByIdStore;
export const getState = () => getActiveUsuariosController()?.getState?.() || { ...getUsuariosApiStateSnapshot(), items: getUsuarios() };
export const getSnapshot = () => getActiveUsuariosController()?.getSnapshot?.() || {
  version: USUARIOS_VIEW_VERSION,
  apiVersion: USUARIOS_API_VERSION,
  cursorVersion: USUARIOS_CURSOR_VERSION,
  mounted: false,
  destroyed: false,
  api: getUsuariosApiSnapshot(),
  architecture: {
    cursorFirst: true,
    backendPagination: true,
    legacyFetchAllUsed: false,
    localDatasetCeiling: false,
    silentStaleWhileRevalidate: true,
    sessionStartVisualOrder: true,
  },
};
export const isAdmin = () => getActiveUsuariosController()?.isAdmin?.() || isAdminContext({});
const isInitialized = () => getActiveUsuariosController()?.isInitialized?.() || false;
const isDestroyed = () => getActiveUsuariosController()?.isDestroyed?.() ?? true;
const isMounted = () => getActiveUsuariosController()?.isMounted?.() || false;
const canRenderUsuariosNow = (context = {}) => isUsuariosRoute(safeObject(context, {}));
export const getUsuariosRouteDebug = (context = {}) => {
  const state = getAppState();
  const role = getCurrentRole(context, state);
  const admin = context.admin === true || role === "admin";
  return {
    browserPath: getBrowserPath(),
    contextPath: routePathFromContext(context),
    canonicalPath: USUARIOS_CANONICAL_PATH,
    allowed: isUsuariosRoute(context),
    role,
    admin,
    apiVersion: USUARIOS_API_VERSION,
    cursorVersion: USUARIOS_CURSOR_VERSION,
    cursorFirst: true,
    serverFiltered: true,
    localDatasetCeiling: false,
    sortField: "lastLoginAt",
    defaultSortOrder: USUARIOS_DEFAULT_SORT_ORDER,
  };
};

/* =========================================================
   MODAL COMPAT
========================================================= */

const openModal = (detail = {}, opener = null) => openUsuario(getUsuarioId(normalizeUsuarioModel(detail)), opener);
export const closeModal = () => AppCore.getModule?.("entities")?.close?.() ?? UsuariosDetailModal.close();
const refreshModal = () => UsuariosDetailModal?.refresh?.() || false;
const updateModal = (detail = {}) => UsuariosDetailModal?.update?.(normalizeUsuarioModel(detail)) || false;
const getModalState = () => UsuariosDetailModal?.getState?.() || null;

const UsuariosModule = {
  name: USUARIOS_MODULE_NAME,
  viewName: USUARIOS_VIEW_NAME,
  version: USUARIOS_VIEW_VERSION,
  source: USUARIOS_INDEX_SOURCE,
  UsuariosView,
  UsuariosIndex,
  View: UsuariosView,
  view,
  component,
  page,
  init,
  mount,
  bootstrap,
  render,
  reload,
  refresh,
  destroy,
  unmount,
  dispose,
  openUsuario,
  refreshUsuario,
  copyUsuarioId,
  openCreate,
  createUsuario,
  createUsuarioView,
  closeCreate,
  renderCreate,
  resetCreate,
  getCreateState,
  submitCreateUsuario,
  exportCsv,
  loadMore,
  setSortOrder,
  toggleSortOrder,
  setVisibleLimit,
  goToPage,
  goPrevPage,
  goNextPage,
  changePageSize,
  getUsuarios,
  getItems,
  getPageItems,
  getVisibleItems,
  getPagination,
  getUsuarioByIdStore,
  getUsuarioById,
  getState,
  getSnapshot,
  openModal,
  closeModal,
  refreshModal,
  updateModal,
  getModalState,
  isAdmin,
  isInitialized,
  isDestroyed,
  isMounted,
  canRenderUsuariosNow,
  getUsuariosRouteDebug,
  api: {
    fetchUsuariosRequest,
    fetchUsuariosCursorPage,
    getUsuarioByIdRequest,
    createUsuarioRequest,
    updateUsuarioRequest,
    deleteUsuarioRequest,
    fetchUsuariosStatsRequest,
    hydrateFromCache,
    hydrateUsuariosFromCache,
    loadUsuarios,
    listUsuarios,
    loadUsuarioDetail,
    getUsuarioById: getUsuarioByIdApi,
    createUsuario: createUsuarioApi,
    updateUsuario: updateUsuarioApi,
    deleteUsuario: deleteUsuarioApi,
    getSnapshot: getUsuariosApiSnapshot,
  },
  store: {
    getUsuarios,
    getSortedUsuariosStore,
    getUsuarioByIdStore,
    getUsuariosCount,
    hasUsuarios,
    getUsuariosStoreSnapshot,
  },
  model: {
    normalizeUsuarioModel,
    normalizeUsuariosCollection,
    findUsuarioById,
    paginateUsuarios,
    computeUsuariosStats,
    sortBySessionStart,
  },
  state: usuariosState,
};

export function registerGlobalBridge(controller = null) {
  const root = getGlobalObject();
  const active = controller || getActiveUsuariosController();
  try {
    root.OnionUsuarios = {
      ...safeObject(root.OnionUsuarios, {}),
      ...UsuariosModule,
      controller: active,
    };
    root.OnionUsuariosView = UsuariosView;
    root.UsuariosView = UsuariosView;
    if (!root.OnionUsuariosModal) root.OnionUsuariosModal = UsuariosDetailModal;
    if (!root.OnionUsuariosCreateModal) root.OnionUsuariosCreateModal = UsuariosCreateModal;
  } catch {
    // noop
  }
  try {
    if (AppCore) {
      if (!isObject(AppCore.modules)) AppCore.modules = {};
      AppCore.modules.Usuarios = UsuariosModule;
      AppCore.modules.UsuariosView = UsuariosModule;
      AppCore.modules.OnionUsuarios = UsuariosModule;
    }
  } catch {
    // noop
  }
  emitEvent("usuarios:index:ready", {
    version: USUARIOS_VIEW_VERSION,
    apiVersion: USUARIOS_API_VERSION,
    cursorVersion: USUARIOS_CURSOR_VERSION,
    source: USUARIOS_INDEX_SOURCE,
    mounted: Boolean(active?.isMounted?.()),
    route: getBrowserPath(),
    cursorFirst: true,
    serverFiltered: true,
    localDatasetCeiling: false,
    silentStaleWhileRevalidate: true,
    sessionStartVisualOrder: true,
  });
  return UsuariosModule;
}

export const bridge = UsuariosModule;
export const ready = true;
