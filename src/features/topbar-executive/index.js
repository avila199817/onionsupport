/* =========================================================
   Onion Support - Topbar Executive
   Archivo: /src/features/topbar-executive/index.js

   Mejora global progresiva del Topbar canónico.

   Objetivos:
   - mantener intacto el motor de búsqueda existente;
   - convertir Search en launcher SVG -> campo expandible;
   - añadir centro de notificaciones persistente por usuario/navegador;
   - escuchar eventos reales ya emitidos por la SPA;
   - exponer AppCore.ui.notifications.notify() como contrato canónico;
   - no introducir HTTP, Router, Auth ni lógica de dominio nueva.
========================================================= */

"use strict";

import { AppCore } from "../../core/index.js";

export const TOPBAR_EXECUTIVE_VERSION =
  "topbar.executive.v1-search-bell-notifications";

const TOPBAR_ROOT_SELECTOR =
  "[data-topbar-root='true'], #app-topbar, .app-topbar";
const TOPBAR_RIGHT_SELECTOR =
  "[data-topbar-right='true'], .topbar-right";
const SEARCH_SELECTOR =
  "[data-topbar-search='true'], .topbar-search";
const SEARCH_INPUT_SELECTOR =
  "[data-topbar-search-input='true'], .topbar-search-input";
const SEARCH_SUBMIT_SELECTOR =
  "[data-topbar-search-submit='true'], .topbar-search-submit";
const SEARCH_RESULT_SELECTOR =
  "[data-topbar-search-result='true']";

const STORAGE_PREFIX =
  "onion.topbar.notifications.v1";
const MAX_NOTIFICATIONS = 40;
const MAX_TITLE = 90;
const MAX_MESSAGE = 220;
const MAX_ROUTE = 420;
const DEDUPE_WINDOW_MS = 4_000;

const EVENT_SOURCES = Object.freeze([
  "onion:app-notification",
  "app:notification",
  "onion:correo-new-message",
  "server:status:error",
  "clientes:error",
  "usuarios:error",
  "usuarios:created",
]);

let activeRoot = null;
let localCleanup = null;
let mountObserver = null;
let retryFrame = 0;
let retryCount = 0;
let globalEventsBound = false;
let currentOwner = "";
let notifications = [];
let lastDedupe = new Map();

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "", max = 500) {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const finalValue = output || fallback;
  return Number.isFinite(Number(max)) && Number(max) > 0
    ? finalValue.slice(0, Number(max))
    : finalValue;
}

function redactText(value = "", max = MAX_MESSAGE) {
  return cleanText(value, "", max * 2)
    .replace(
      /([?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    )
    .slice(0, max);
}

function safeRoute(value = "") {
  const raw = cleanText(value, "", MAX_ROUTE);

  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(raw) ||
    /[\r\n\t\\]/.test(raw) ||
    /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization)=/i.test(raw)
  ) {
    return "";
  }

  return raw;
}

function normalizeKind(value = "") {
  const kind = cleanText(value, "info", 30).toLowerCase();
  if (["success", "warning", "error", "mail", "system", "info"].includes(kind)) {
    return kind;
  }
  return "info";
}

function hash(value = "") {
  const source = String(value || "anonymous");
  let output = 0x811c9dc5;

  for (let index = 0; index < source.length; index += 1) {
    output ^= source.charCodeAt(index);
    output = Math.imul(output, 0x01000193) >>> 0;
  }

  return output.toString(36);
}

function getAppState() {
  try {
    return AppCore?.runtimeState?.read?.() || {};
  } catch {
    return {};
  }
}

function ownerIdentity() {
  const state = getAppState();
  const user = state.user || state.currentUser || AppCore?.getCurrentUser?.() || {};
  const identity = cleanText(
    user?.userId ||
      user?.id ||
      user?.uid ||
      user?.email ||
      user?.mail ||
      user?.slug ||
      user?.username ||
      state.userId ||
      "anonymous",
    "anonymous",
    240
  ).toLowerCase();

  return hash(identity);
}

function storageKey(owner = ownerIdentity()) {
  return `${STORAGE_PREFIX}:${owner}`;
}

function payloadFromEvent(event = null) {
  const detail = event?.detail;

  if (isObject(detail?.detail)) return detail.detail;
  if (isObject(detail?.payload)) return detail.payload;
  if (isObject(detail)) return detail;
  if (isObject(event?.payload)) return event.payload;
  return {};
}

function getTopbarRoot() {
  if (!isBrowser()) return null;
  try {
    return document.querySelector(TOPBAR_ROOT_SELECTOR);
  } catch {
    return null;
  }
}

function createElement(tag = "div", className = "", textContent = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent !== "") node.textContent = String(textContent);
  return node;
}

function createSvg(name = "search", className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

  const paths = {
    search: "M11 4a7 7 0 1 0 4.9 12l4.55 4.55 1.4-1.4-4.5-4.5A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z",
    bell: "M12 22a2.6 2.6 0 0 0 2.45-1.75h-4.9A2.6 2.6 0 0 0 12 22Zm7-5.25-1.5-1.7V10a5.5 5.5 0 0 0-4.5-5.4V3.5a1 1 0 0 0-2 0v1.1A5.5 5.5 0 0 0 6.5 10v5.05L5 16.75V18h14v-1.25ZM8.5 16v-6a3.5 3.5 0 1 1 7 0v6h-7Z",
    close: "m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z",
    check: "m5.5 12.5 4 4 9-9 1.4 1.4L9.5 19.3 4.1 13.9l1.4-1.4Z",
    trash: "M8 7h8l-.65 13H8.65L8 7Zm2-4h4l1 2h4v2H5V5h4l1-2Z",
  };

  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (className) svg.setAttribute("class", className);

  path.setAttribute("d", paths[name] || paths.search);
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

/* =========================================================
   NOTIFICATION STORE
========================================================= */

function sanitizeStoredItem(item = {}) {
  if (!isObject(item)) return null;

  const id = cleanText(item.id, "", 120);
  const title = redactText(item.title, MAX_TITLE);
  if (!id || !title) return null;

  return {
    id,
    title,
    message: redactText(item.message, MAX_MESSAGE),
    kind: normalizeKind(item.kind),
    route: safeRoute(item.route),
    createdAt: Number(item.createdAt) || Date.now(),
    read: item.read === true,
    source: cleanText(item.source, "app", 60),
    dedupeKey: cleanText(item.dedupeKey, "", 180),
  };
}

function readNotifications(owner = ownerIdentity()) {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : [])
      .map(sanitizeStoredItem)
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_NOTIFICATIONS);
  } catch {
    return [];
  }
}

function writeNotifications() {
  if (!isBrowser() || !currentOwner) return false;

  try {
    window.localStorage.setItem(
      storageKey(currentOwner),
      JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS))
    );
    return true;
  } catch {
    return false;
  }
}

function syncOwner() {
  const nextOwner = ownerIdentity();
  if (nextOwner === currentOwner) return false;

  currentOwner = nextOwner;
  notifications = readNotifications(currentOwner);
  lastDedupe = new Map();
  return true;
}

function normalizeNotification(detail = {}, defaults = {}) {
  const source = isObject(detail) ? detail : {};
  const fallback = isObject(defaults) ? defaults : {};

  const title = redactText(
    source.title || source.label || fallback.title || "Notificación",
    MAX_TITLE
  );

  const message = redactText(
    source.message || source.text || source.description || fallback.message || "",
    MAX_MESSAGE
  );

  const route = safeRoute(
    source.route || source.href || source.path || fallback.route || ""
  );

  const kind = normalizeKind(
    source.kind || source.type || source.level || fallback.kind || "info"
  );

  const sourceName = cleanText(
    source.source || fallback.source || "app",
    "app",
    60
  );

  const dedupeKey = cleanText(
    source.dedupeKey ||
      fallback.dedupeKey ||
      `${sourceName}:${kind}:${title}:${message}:${route}`,
    "",
    180
  );

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    message,
    route,
    kind,
    source: sourceName,
    createdAt: Date.now(),
    read: false,
    dedupeKey,
  };
}

function notificationIsDuplicate(item) {
  const key = item?.dedupeKey || "";
  if (!key) return false;

  const now = Date.now();
  const last = Number(lastDedupe.get(key)) || 0;
  lastDedupe.set(key, now);

  for (const [candidate, at] of lastDedupe.entries()) {
    if (now - at > DEDUPE_WINDOW_MS * 3) lastDedupe.delete(candidate);
  }

  return last > 0 && now - last < DEDUPE_WINDOW_MS;
}

function notify(detail = {}, defaults = {}) {
  syncOwner();

  const item = normalizeNotification(detail, defaults);
  if (!item.title || notificationIsDuplicate(item)) return null;

  notifications = [item, ...notifications]
    .slice(0, MAX_NOTIFICATIONS);

  writeNotifications();
  renderNotifications();
  emitChanged();
  return Object.freeze({ ...item });
}

function markRead(id = "") {
  const key = cleanText(id, "", 120);
  if (!key) return false;

  let changed = false;
  notifications = notifications.map((item) => {
    if (item.id !== key || item.read === true) return item;
    changed = true;
    return { ...item, read: true };
  });

  if (changed) {
    writeNotifications();
    renderNotifications();
    emitChanged();
  }

  return changed;
}

function markAllRead() {
  let changed = false;
  notifications = notifications.map((item) => {
    if (item.read) return item;
    changed = true;
    return { ...item, read: true };
  });

  if (changed) {
    writeNotifications();
    renderNotifications();
    emitChanged();
  }

  return changed;
}

function clearNotifications() {
  if (!notifications.length) return false;
  notifications = [];
  writeNotifications();
  renderNotifications();
  emitChanged();
  return true;
}

function unreadCount() {
  return notifications.reduce(
    (total, item) => total + (item.read ? 0 : 1),
    0
  );
}

function emitChanged() {
  if (!isBrowser()) return false;
  try {
    window.dispatchEvent(
      new CustomEvent("onion:topbar-notifications-changed", {
        detail: {
          unread: unreadCount(),
          total: notifications.length,
        },
      })
    );
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   EVENT ADAPTERS
========================================================= */

function handleAppNotification(event) {
  notify(payloadFromEvent(event), {
    source: event?.type || "app",
  });
}

function handleMailNotification(event) {
  const payload = payloadFromEvent(event);
  const count = Math.max(1, Number(payload.count) || 1);

  notify(
    {
      title: count === 1 ? "Nuevo correo" : "Nuevos correos",
      message:
        count === 1
          ? "Ha llegado un mensaje nuevo a Correo."
          : `Han llegado ${count} mensajes nuevos a Correo.`,
      kind: "mail",
      route: "/correo",
      source: "correo",
      dedupeKey: `correo:new:${count}`,
    }
  );
}

function handleServerError(event) {
  const payload = payloadFromEvent(event);
  notify({
    title: "Servidor requiere atención",
    message: payload.message || payload.error?.message || "Se ha detectado un error al consultar el estado del servidor.",
    kind: "error",
    route: "/servidor",
    source: "servidor",
    dedupeKey: `server:error:${cleanText(payload.code || payload.message, "status", 80)}`,
  });
}

function handleClientesError(event) {
  const payload = payloadFromEvent(event);
  notify({
    title: "Clientes no se ha podido actualizar",
    message: payload.message || "La última operación de Clientes ha devuelto un error.",
    kind: "warning",
    route: "/clientes",
    source: "clientes",
    dedupeKey: `clientes:error:${cleanText(payload.code || payload.message, "error", 80)}`,
  });
}

function handleUsuariosError(event) {
  const payload = payloadFromEvent(event);
  notify({
    title: "Usuarios no se ha podido actualizar",
    message: payload.message || "La última operación de Usuarios ha devuelto un error.",
    kind: "warning",
    route: "/usuarios",
    source: "usuarios",
    dedupeKey: `usuarios:error:${cleanText(payload.message, "error", 80)}`,
  });
}

function handleUsuarioCreated() {
  notify({
    title: "Usuario creado",
    message: "Se ha creado correctamente un usuario en OnionSupport.",
    kind: "success",
    route: "/usuarios",
    source: "usuarios",
    dedupeKey: "usuarios:created",
  });
}

const EVENT_HANDLERS = Object.freeze({
  "onion:app-notification": handleAppNotification,
  "app:notification": handleAppNotification,
  "onion:correo-new-message": handleMailNotification,
  "server:status:error": handleServerError,
  "clientes:error": handleClientesError,
  "usuarios:error": handleUsuariosError,
  "usuarios:created": handleUsuarioCreated,
});

function bindGlobalEvents() {
  if (!isBrowser() || globalEventsBound) return false;

  for (const name of EVENT_SOURCES) {
    const handler = EVENT_HANDLERS[name];
    if (typeof handler === "function") {
      window.addEventListener(name, handler);
    }
  }

  globalEventsBound = true;
  return true;
}

function unbindGlobalEvents() {
  if (!isBrowser() || !globalEventsBound) return false;

  for (const name of EVENT_SOURCES) {
    const handler = EVENT_HANDLERS[name];
    if (typeof handler === "function") {
      window.removeEventListener(name, handler);
    }
  }

  globalEventsBound = false;
  return true;
}

/* =========================================================
   SEARCH EXECUTIVE DOM
========================================================= */

function setSearchOpen(root, open = true, options = {}) {
  const wrapper = root?.querySelector?.("[data-topbar-exec-search-wrap='true']");
  const trigger = root?.querySelector?.("[data-topbar-exec-search-trigger='true']");
  const input = root?.querySelector?.(SEARCH_INPUT_SELECTOR);
  if (!wrapper || !trigger) return false;

  const value = Boolean(open);
  wrapper.classList.toggle("is-open", value);
  root.classList.toggle("is-executive-search-open", value);
  trigger.setAttribute("aria-expanded", value ? "true" : "false");
  trigger.setAttribute("aria-label", value ? "Cerrar búsqueda" : "Abrir búsqueda");

  if (value && options.focus !== false && input) {
    window.requestAnimationFrame?.(() => {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus?.();
      }
    });
  }

  if (!value) {
    try {
      window.OnionTopbar?.clearSearch?.({ input: false, focus: false });
    } catch {
      // noop
    }
  }

  return true;
}

function searchIsOpen(root) {
  return root?.classList?.contains("is-executive-search-open") === true;
}

function enhanceSearch(root, right) {
  const search = right.querySelector(SEARCH_SELECTOR);
  if (!search) return null;

  let wrapper = search.closest("[data-topbar-exec-search-wrap='true']");

  if (!wrapper) {
    wrapper = createElement("div", "topbar-exec-search-wrap");
    wrapper.dataset.topbarExecSearchWrap = "true";
    right.insertBefore(wrapper, search);
    wrapper.appendChild(search);
  }

  let trigger = wrapper.querySelector("[data-topbar-exec-search-trigger='true']");

  if (!trigger) {
    trigger = createElement("button", "topbar-exec-icon-button topbar-exec-search-trigger");
    trigger.type = "button";
    trigger.dataset.topbarExecSearchTrigger = "true";
    trigger.setAttribute("aria-label", "Abrir búsqueda");
    trigger.setAttribute("aria-expanded", "false");
    trigger.appendChild(createSvg("search", "topbar-exec-icon"));
    wrapper.appendChild(trigger);
  }

  const submit = search.querySelector(SEARCH_SUBMIT_SELECTOR);
  if (submit && submit.dataset.topbarExecutiveIcon !== "true") {
    submit.replaceChildren(createSvg("search", "topbar-exec-icon"));
    submit.dataset.topbarExecutiveIcon = "true";
  }

  const input = search.querySelector(SEARCH_INPUT_SELECTOR);
  if (input?.value) setSearchOpen(root, true, { focus: false });

  return { wrapper, trigger, search, input, submit };
}

/* =========================================================
   NOTIFICATION DOM
========================================================= */

function formatRelativeTime(timestamp = 0) {
  const diff = Math.max(0, Date.now() - Number(timestamp || 0));
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "Ahora";
  if (diff < hour) return `Hace ${Math.max(1, Math.floor(diff / minute))} min`;
  if (diff < day) return `Hace ${Math.max(1, Math.floor(diff / hour))} h`;
  return `Hace ${Math.max(1, Math.floor(diff / day))} d`;
}

function createNotificationItem(item) {
  const node = createElement(item.route ? "a" : "button", "topbar-exec-notification-item");
  node.dataset.topbarNotificationId = item.id;
  node.dataset.notificationRead = item.read ? "true" : "false";
  node.dataset.notificationKind = item.kind;

  if (item.route) {
    node.href = item.route;
    node.dataset.spa = "true";
    node.dataset.route = item.route;
  } else {
    node.type = "button";
  }

  const marker = createElement("span", "topbar-exec-notification-marker");
  marker.setAttribute("aria-hidden", "true");

  const copy = createElement("span", "topbar-exec-notification-copy");
  copy.appendChild(createElement("span", "topbar-exec-notification-title", item.title));

  if (item.message) {
    copy.appendChild(createElement("span", "topbar-exec-notification-message", item.message));
  }

  copy.appendChild(createElement("span", "topbar-exec-notification-time", formatRelativeTime(item.createdAt)));

  node.append(marker, copy);
  return node;
}

function ensureNotifications(root, right) {
  let trigger = right.querySelector("[data-topbar-notifications-trigger='true']");

  if (!trigger) {
    trigger = createElement("button", "topbar-exec-icon-button topbar-exec-notifications-trigger");
    trigger.type = "button";
    trigger.dataset.topbarNotificationsTrigger = "true";
    trigger.setAttribute("aria-label", "Notificaciones");
    trigger.setAttribute("aria-expanded", "false");
    trigger.appendChild(createSvg("bell", "topbar-exec-icon"));

    const badge = createElement("span", "topbar-exec-notification-badge");
    badge.dataset.topbarNotificationBadge = "true";
    badge.hidden = true;
    trigger.appendChild(badge);

    right.appendChild(trigger);
  }

  let panel = root.querySelector("[data-topbar-notifications-panel='true']");

  if (!panel) {
    panel = createElement("section", "topbar-exec-notifications-panel");
    panel.dataset.topbarNotificationsPanel = "true";
    panel.id = "topbar-notifications-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Notificaciones");
    panel.setAttribute("aria-hidden", "true");
    panel.hidden = true;

    trigger.setAttribute("aria-controls", panel.id);

    const header = createElement("header", "topbar-exec-notifications-header");
    const heading = createElement("div", "topbar-exec-notifications-heading");
    heading.append(
      createElement("span", "topbar-exec-notifications-eyebrow", "Actividad"),
      createElement("h2", "topbar-exec-notifications-title", "Notificaciones")
    );

    const actions = createElement("div", "topbar-exec-notifications-actions");

    const markAll = createElement("button", "topbar-exec-notification-action");
    markAll.type = "button";
    markAll.dataset.topbarNotificationsMarkAll = "true";
    markAll.setAttribute("aria-label", "Marcar todas como leídas");
    markAll.appendChild(createSvg("check", "topbar-exec-action-icon"));

    const clear = createElement("button", "topbar-exec-notification-action");
    clear.type = "button";
    clear.dataset.topbarNotificationsClear = "true";
    clear.setAttribute("aria-label", "Limpiar notificaciones");
    clear.appendChild(createSvg("trash", "topbar-exec-action-icon"));

    actions.append(markAll, clear);
    header.append(heading, actions);

    const list = createElement("div", "topbar-exec-notifications-list");
    list.dataset.topbarNotificationsList = "true";

    const footer = createElement(
      "footer",
      "topbar-exec-notifications-footer",
      "Actividad guardada en este navegador para tu sesión de OnionSupport."
    );

    panel.append(header, list, footer);
    root.appendChild(panel);
  }

  return { trigger, panel };
}

function notificationsOpen(root = activeRoot) {
  return root?.classList?.contains("is-executive-notifications-open") === true;
}

function setNotificationsOpen(root, open = true, options = {}) {
  const trigger = root?.querySelector?.("[data-topbar-notifications-trigger='true']");
  const panel = root?.querySelector?.("[data-topbar-notifications-panel='true']");
  if (!trigger || !panel) return false;

  const value = Boolean(open);
  root.classList.toggle("is-executive-notifications-open", value);
  trigger.setAttribute("aria-expanded", value ? "true" : "false");
  panel.hidden = !value;
  panel.setAttribute("aria-hidden", value ? "false" : "true");

  if (value) {
    setSearchOpen(root, false, { focus: false });
    renderNotifications();
  }

  if (!value && options.focus === true) {
    try {
      trigger.focus({ preventScroll: true });
    } catch {
      trigger.focus?.();
    }
  }

  return true;
}

function renderNotifications() {
  syncOwner();

  const root = activeRoot || getTopbarRoot();
  if (!root) return false;

  const badge = root.querySelector("[data-topbar-notification-badge='true']");
  const list = root.querySelector("[data-topbar-notifications-list='true']");
  const markAll = root.querySelector("[data-topbar-notifications-mark-all='true']");
  const clear = root.querySelector("[data-topbar-notifications-clear='true']");

  const unread = unreadCount();

  if (badge) {
    badge.hidden = unread <= 0;
    badge.textContent = unread > 9 ? "9+" : String(unread);
    badge.setAttribute("aria-label", `${unread} sin leer`);
  }

  if (markAll) markAll.disabled = unread <= 0;
  if (clear) clear.disabled = notifications.length <= 0;

  if (!list) return true;

  const fragment = document.createDocumentFragment();

  if (!notifications.length) {
    const empty = createElement("div", "topbar-exec-notifications-empty");
    const icon = createElement("span", "topbar-exec-notifications-empty-icon");
    icon.appendChild(createSvg("bell", "topbar-exec-empty-icon-svg"));
    empty.append(
      icon,
      createElement("strong", "topbar-exec-notifications-empty-title", "Todo al día"),
      createElement("span", "topbar-exec-notifications-empty-text", "Cuando OnionSupport tenga algo importante que contarte, aparecerá aquí.")
    );
    fragment.appendChild(empty);
  } else {
    for (const item of notifications) {
      fragment.appendChild(createNotificationItem(item));
    }
  }

  list.replaceChildren(fragment);
  return true;
}

/* =========================================================
   LOCAL BINDING
========================================================= */

function eventElement(target = null) {
  return target?.nodeType === 3 ? target.parentElement : target;
}

function contains(parent, child) {
  try {
    return Boolean(parent && child && (parent === child || parent.contains(child)));
  } catch {
    return false;
  }
}

function bindRoot(root) {
  if (!root) return false;

  if (localCleanup) {
    try {
      localCleanup();
    } catch {
      // noop
    }
  }

  const right = root.querySelector(TOPBAR_RIGHT_SELECTOR);
  if (!right) return false;

  const searchRefs = enhanceSearch(root, right);
  const notificationRefs = ensureNotifications(root, right);
  root.classList.add("topbar-executive-ready");
  root.dataset.topbarExecutiveVersion = TOPBAR_EXECUTIVE_VERSION;

  const onSearchTrigger = () => {
    const open = searchIsOpen(root);
    const inputValue = cleanText(searchRefs?.input?.value, "");

    if (open && !inputValue) {
      setSearchOpen(root, false, { focus: false });
    } else {
      setNotificationsOpen(root, false);
      setSearchOpen(root, true, { focus: true });
    }
  };

  const onSearchFocus = () => {
    setNotificationsOpen(root, false);
    setSearchOpen(root, true, { focus: false });
  };

  const onNotificationsTrigger = () => {
    setNotificationsOpen(root, !notificationsOpen(root));
  };

  const onPanelClick = (event) => {
    const target = eventElement(event.target);

    const markAllButton = target?.closest?.("[data-topbar-notifications-mark-all='true']");
    if (markAllButton) {
      event.preventDefault();
      markAllRead();
      return;
    }

    const clearButton = target?.closest?.("[data-topbar-notifications-clear='true']");
    if (clearButton) {
      event.preventDefault();
      clearNotifications();
      return;
    }

    const item = target?.closest?.("[data-topbar-notification-id]");
    if (item) {
      markRead(item.dataset.topbarNotificationId);
      setNotificationsOpen(root, false);
    }
  };

  const onDocumentPointerDown = (event) => {
    const target = eventElement(event.target);

    const searchWrap = root.querySelector("[data-topbar-exec-search-wrap='true']");
    const results = root.querySelector("[data-topbar-search-results='true']");
    const panel = root.querySelector("[data-topbar-notifications-panel='true']");
    const bell = root.querySelector("[data-topbar-notifications-trigger='true']");

    if (
      searchIsOpen(root) &&
      !contains(searchWrap, target) &&
      !contains(results, target)
    ) {
      const inputValue = cleanText(searchRefs?.input?.value, "");
      if (!inputValue) setSearchOpen(root, false, { focus: false });
    }

    if (
      notificationsOpen(root) &&
      !contains(panel, target) &&
      !contains(bell, target)
    ) {
      setNotificationsOpen(root, false);
    }
  };

  const onDocumentKeydown = (event) => {
    if (event.key !== "Escape") return;

    if (notificationsOpen(root)) {
      setNotificationsOpen(root, false, { focus: true });
      return;
    }

    if (searchIsOpen(root)) {
      const inputValue = cleanText(searchRefs?.input?.value, "");
      if (!inputValue) setSearchOpen(root, false, { focus: false });
    }
  };

  const onSearchResultClick = (event) => {
    const target = eventElement(event.target);
    if (target?.closest?.(SEARCH_RESULT_SELECTOR)) {
      setSearchOpen(root, false, { focus: false });
    }
  };

  searchRefs?.trigger?.addEventListener("click", onSearchTrigger);
  searchRefs?.input?.addEventListener("focus", onSearchFocus);
  notificationRefs?.trigger?.addEventListener("click", onNotificationsTrigger);
  notificationRefs?.panel?.addEventListener("click", onPanelClick);
  root.addEventListener("click", onSearchResultClick, true);
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("keydown", onDocumentKeydown);

  localCleanup = () => {
    searchRefs?.trigger?.removeEventListener("click", onSearchTrigger);
    searchRefs?.input?.removeEventListener("focus", onSearchFocus);
    notificationRefs?.trigger?.removeEventListener("click", onNotificationsTrigger);
    notificationRefs?.panel?.removeEventListener("click", onPanelClick);
    root.removeEventListener("click", onSearchResultClick, true);
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onDocumentKeydown);
    localCleanup = null;
  };

  renderNotifications();
  return true;
}

function enhanceTopbar() {
  if (!isBrowser()) return false;

  const root = getTopbarRoot();
  if (!root) return false;

  if (
    activeRoot === root &&
    root.dataset.topbarExecutiveVersion === TOPBAR_EXECUTIVE_VERSION
  ) {
    renderNotifications();
    return true;
  }

  activeRoot = root;
  return bindRoot(root);
}

function installMountObserver() {
  if (!isBrowser() || mountObserver || typeof MutationObserver !== "function") {
    return Boolean(mountObserver);
  }

  const mount =
    document.getElementById("topbar-mount") ||
    getTopbarRoot()?.parentElement ||
    null;

  if (!mount) return false;

  mountObserver = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => mutation.type === "childList")) return;
    void enhanceTopbar();
  });

  mountObserver.observe(mount, {
    childList: true,
    subtree: false,
  });

  return true;
}

function scheduleEnhancement() {
  if (!isBrowser() || retryFrame) return false;

  const attempt = () => {
    retryFrame = 0;
    retryCount += 1;

    if (enhanceTopbar()) {
      retryCount = 0;
      installMountObserver();
      return;
    }

    if (retryCount < 90) {
      retryFrame = window.requestAnimationFrame(attempt);
    }
  };

  retryFrame = window.requestAnimationFrame(attempt);
  return true;
}

/* =========================================================
   PUBLIC API / LIFECYCLE
========================================================= */

function getSnapshot() {
  syncOwner();

  return Object.freeze({
    version: TOPBAR_EXECUTIVE_VERSION,
    ready: Boolean(activeRoot),
    owner: currentOwner,
    notifications: Object.freeze({
      total: notifications.length,
      unread: unreadCount(),
      open: notificationsOpen(),
    }),
    search: Object.freeze({
      open: searchIsOpen(activeRoot),
    }),
  });
}

function destroy() {
  if (retryFrame && isBrowser()) {
    window.cancelAnimationFrame?.(retryFrame);
    retryFrame = 0;
  }

  try {
    mountObserver?.disconnect?.();
  } catch {
    // noop
  }
  mountObserver = null;

  try {
    localCleanup?.();
  } catch {
    // noop
  }

  unbindGlobalEvents();

  if (AppCore?.ui?.notifications === TopbarNotifications) {
    delete AppCore.ui.notifications;
  }

  if (isBrowser()) {
    try {
      if (window.OnionNotifications === TopbarNotifications) {
        delete window.OnionNotifications;
      }
    } catch {
      // noop
    }
  }

  activeRoot = null;
  return true;
}

export const TopbarNotifications = Object.freeze({
  version: TOPBAR_EXECUTIVE_VERSION,
  notify,
  markRead,
  markAllRead,
  clear: clearNotifications,
  open: () => setNotificationsOpen(activeRoot, true),
  close: () => setNotificationsOpen(activeRoot, false),
  getSnapshot,
  destroy,
});

function registerPublicApi() {
  try {
    if (isObject(AppCore.ui)) {
      AppCore.ui.notifications = TopbarNotifications;
    }
  } catch {
    // noop
  }

  if (isBrowser()) {
    try {
      window.OnionNotifications = TopbarNotifications;
    } catch {
      // noop
    }
  }
}

function init() {
  if (!isBrowser()) return TopbarNotifications;

  syncOwner();
  bindGlobalEvents();
  registerPublicApi();
  scheduleEnhancement();
  return TopbarNotifications;
}

init();

export default TopbarNotifications;
