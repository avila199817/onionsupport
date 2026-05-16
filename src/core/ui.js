/* =========================================================
   Onion SPA - Core UI
   Archivo: src/core/ui.js

   CORE UI · CLEAN
   - document title + topbar title
   - dynamic containers cleanup
   - user/sidebar/topbar sync
   - avatar seguro sin innerHTML ni inline styles
   - no usuario fantasma si authenticated=false
   - eventos/snapshot sin avatarUrl/tokens reales
========================================================= */

import { config } from "./config.js";

import {
  getUserDisplayName,
  getUserUsername,
  getUserAvatarUrl,
  getInitials,
  redactTokenInText,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const UI_VERSION = "18.0.0-clean";

const DEFAULT_USER_NAME = "Usuario";
const DEFAULT_AVATAR_TEXT = "ON";
const DEFAULT_TITLE = "Onion Support";

export const USER_UI_EVENT = "app:user-ui:sync";
export const TITLE_EVENT = "app:title:change";
export const DYNAMIC_CLEARED_EVENT = "app:dynamic:cleared";
export const AVATAR_LOAD_EVENT = "app:user-ui:avatar-load";
export const AVATAR_ERROR_EVENT = "app:user-ui:avatar-error";
export const AVATAR_FALLBACK_EVENT = "app:user-ui:avatar-fallback";

const USER_RECACHE_EVENT = "app:user-ui:recache";
const USER_DEFERRED_SYNC_EVENT = "app:user-ui:deferred-sync";

const AVATAR_TOKENS = new WeakMap();

let deferredUserSyncScheduled = false;

const SCOPE_SELECTORS = Object.freeze({
  sidebar: Object.freeze([
    "#app-sidebar",
    "#sidebar",
    "#sidebar-mount",
    "[data-sidebar-root]",
    "[data-sidebar]",
    "[data-sidebar-mount]",
    ".sidebar",
    ".app-sidebar",
  ]),

  topbar: Object.freeze([
    "#app-topbar",
    "#topbar",
    "#topbar-mount",
    "[data-topbar-root]",
    "[data-topbar]",
    "[data-topbar-mount]",
    ".topbar",
    ".app-topbar",
  ]),
});

const USER_SELECTORS = Object.freeze({
  sidebarName: Object.freeze([
    "#sidebar-name",
    "#sidebarName",
    "[data-sidebar-name]",
    "[data-user-name='sidebar']",
    ".sidebar-name",
    ".sidebar-user-name",
  ]),

  sidebarEmail: Object.freeze([
    "#sidebar-email",
    "#sidebarEmail",
    "[data-sidebar-email]",
    "[data-user-email='sidebar']",
    ".sidebar-email",
    ".sidebar-user-email",
  ]),

  sidebarRole: Object.freeze([
    "#sidebar-role",
    "#sidebarRole",
    "[data-sidebar-role]",
    "[data-user-role='sidebar']",
    ".sidebar-role",
    ".sidebar-user-role",
  ]),

  topbarUserName: Object.freeze([
    "#topbar-user-name",
    "#topbarUserName",
    "[data-topbar-user-name]",
    "[data-user-name='topbar']",
    "[data-user-name-topbar]",
    ".topbar-user-name",
  ]),

  userToggle: Object.freeze([
    "#userToggle",
    "#user-toggle",
    "[data-user-toggle]",
    "[data-user-menu-toggle]",
  ]),

  userDropdown: Object.freeze([
    "#userDropdown",
    "#user-dropdown",
    "[data-user-dropdown]",
    "[data-user-menu]",
  ]),

  logoutBtn: Object.freeze([
    "#logoutBtn",
    "#logout-button",
    "#logout-btn",
    "[data-logout-button]",
    "[data-logout]",
    "[data-action='logout']",
  ]),

  topbarTitle: Object.freeze([
    "#topbar-title",
    "[data-topbar-title]",
    ".topbar-title",
  ]),
});

const AVATAR_SELECTORS = Object.freeze({
  sidebar: Object.freeze({
    root: Object.freeze([
      "#sidebar-avatar",
      "#sidebarAvatar",
      "[data-sidebar-avatar]",
      "[data-user-avatar='sidebar']",
      ".sidebar-avatar",
      ".sidebar-user-avatar",
    ]),
    image: Object.freeze([
      "#sidebarAvatarImage",
      "#sidebar-avatar-image",
      "img[data-sidebar-avatar-image]",
      "img[data-avatar-image='sidebar']",
      ".sidebar-avatar img",
      ".sidebar-avatar__image",
      ".sidebar-user-avatar img",
    ]),
    fallback: Object.freeze([
      "#sidebarAvatarFallback",
      "#sidebar-avatar-fallback",
      "[data-sidebar-avatar-fallback]",
      "[data-avatar-fallback='sidebar']",
      ".sidebar-avatar-fallback",
      ".sidebar-avatar__fallback",
      ".sidebar-user-avatar-fallback",
    ]),
  }),

  topbar: Object.freeze({
    root: Object.freeze([
      "#topbar-avatar",
      "#topbarAvatar",
      "[data-topbar-avatar]",
      "[data-user-avatar='topbar']",
      "[data-user-avatar-topbar]",
      ".topbar-avatar",
      ".topbar-user-avatar",
    ]),
    image: Object.freeze([
      "#topbarAvatarImage",
      "#topbar-avatar-image",
      "img[data-topbar-avatar-image]",
      "img[data-avatar-image='topbar']",
      ".topbar-avatar img",
      ".topbar-avatar__image",
      ".topbar-user-avatar img",
    ]),
    fallback: Object.freeze([
      "#topbarAvatarFallback",
      "#topbar-avatar-fallback",
      "[data-topbar-avatar-fallback]",
      "[data-avatar-fallback='topbar']",
      ".topbar-avatar-fallback",
      ".topbar-avatar__fallback",
      ".topbar-user-avatar-fallback",
    ]),
  }),
});

const DYNAMIC_SELECTORS = Object.freeze({
  topbarViewContainer: Object.freeze([
    "#topbarview-container",
    "#topbar-view-container",
    "[data-topbar-view-container]",
    ".topbar-view-container",
  ]),

  tableheadContainer: Object.freeze([
    "#tablehead-container",
    "#table-head-container",
    "[data-tablehead-container]",
    "[data-table-head-container]",
    ".tablehead-container",
  ]),

  tablehead: Object.freeze([
    "#table-head",
    "#tablehead",
    "[data-tablehead]",
    "[data-table-head]",
    ".table-head",
    ".tablehead",
  ]),

  viewContainer: Object.freeze([
    "#view-container",
    "#router-view",
    "#app-view",
    "[data-view-root]",
    "[data-view-container]",
    "[data-router-view]",
    "[data-router-outlet]",
    ".view-container",
    ".router-view",
  ]),
});

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();
  return text || fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1) return true;
  if (value === 0) return false;

  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(clean)) return true;
    if (["false", "0", "no", "off"].includes(clean)) return false;
  }

  return Boolean(fallback);
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function safeRedact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "");
  }
}

function removeNativeTooltip(el) {
  try {
    el?.removeAttribute?.("title");
  } catch {}

  return true;
}

function isConnected(el) {
  if (!el) return false;

  try {
    if (
      isBrowser() &&
      (
        el === document ||
        el === window ||
        el === document.documentElement ||
        el === document.body
      )
    ) {
      return true;
    }
  } catch {}

  try {
    return Boolean(el.isConnected);
  } catch {}

  try {
    return document.contains(el);
  } catch {}

  return false;
}

function isImageElement(el) {
  try {
    return safeText(el?.tagName, "").toLowerCase() === "img";
  } catch {
    return false;
  }
}

/* =========================================================
   SAFE DOM
========================================================= */

function queryFirst(selectors = [], root = null) {
  if (!isBrowser()) return null;

  const scope = root || document;

  for (const selector of toArray(selectors)) {
    const clean = safeText(selector, "");

    if (!clean) continue;

    try {
      if (
        scope === document &&
        clean.startsWith("#") &&
        !/[ .:[>+~,]/.test(clean.slice(1))
      ) {
        const byId = document.getElementById(clean.slice(1));
        if (byId) return byId;
      }

      const found = scope.querySelector?.(clean);
      if (found) return found;
    } catch {}
  }

  return null;
}

function queryAll(selectors = [], root = null) {
  if (!isBrowser()) return [];

  const scope = root || document;
  const output = [];

  for (const selector of toArray(selectors)) {
    const clean = safeText(selector, "");

    if (!clean) continue;

    try {
      const nodes = Array.from(scope.querySelectorAll?.(clean) || []);

      for (const node of nodes) {
        if (node && !output.includes(node)) output.push(node);
      }
    } catch {}
  }

  return output;
}

function queryFirstInScopes(selectors = [], scopes = []) {
  for (const scope of toArray(scopes)) {
    if (!scope || !isConnected(scope)) continue;

    const found = queryFirst(selectors, scope);
    if (found) return found;
  }

  return queryFirst(selectors);
}

function cacheNode(dom, key, node) {
  if (!dom || !key || !node) return node || null;

  try {
    dom[key] = node;
    dom[`${key}El`] = node;
  } catch {}

  return node;
}

function cachedNode(dom, key) {
  const node = dom?.[key] || dom?.[`${key}El`] || null;
  return node && isConnected(node) ? node : null;
}

function getScopes(dom, type = "sidebar") {
  if (!isBrowser()) return [];

  const raw =
    type === "topbar"
      ? [
          dom?.topbar,
          dom?.topbarRoot,
          dom?.topbarMount,
          queryFirst(SCOPE_SELECTORS.topbar),
        ]
      : [
          dom?.sidebar,
          dom?.sidebarRoot,
          dom?.sidebarMount,
          queryFirst(SCOPE_SELECTORS.sidebar),
        ];

  return raw.filter((node, index, arr) =>
    node &&
    isConnected(node) &&
    arr.indexOf(node) === index
  );
}

function resolveScopedNode(dom, key, selectors = [], scopeType = "") {
  const cached = cachedNode(dom, key);
  if (cached) return cached;

  const scopes = scopeType ? getScopes(dom, scopeType) : [];
  const found = scopes.length
    ? queryFirstInScopes(selectors, scopes)
    : queryFirst(selectors);

  return cacheNode(dom, key, found);
}

function setText(el, value = "") {
  if (!el) return false;

  try {
    const next = safeText(value, "");

    if (el.textContent !== next) {
      el.textContent = next;
    }

    return true;
  } catch {
    return false;
  }
}

function setAttr(el, name, value) {
  if (!el || !name) return false;

  try {
    if (value === null || value === undefined || value === "") {
      el.removeAttribute(name);
    } else if (el.getAttribute(name) !== String(value)) {
      el.setAttribute(name, String(value));
    }

    return true;
  } catch {
    return false;
  }
}

function removeAttr(el, name) {
  if (!el || !name) return false;

  try {
    el.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function setDataset(el, key, value) {
  if (!el || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete el.dataset[key];
    } else if (el.dataset[key] !== String(value)) {
      el.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function toggleClass(el, className, force) {
  if (!el || !className) return false;

  try {
    el.classList.toggle(className, Boolean(force));
    return true;
  } catch {
    return false;
  }
}

function clearElement(el) {
  if (!el) return false;

  try {
    el.replaceChildren();
    return true;
  } catch {}

  try {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }

    return true;
  } catch {
    return false;
  }
}

function nextFrame(callback) {
  if (!isFunction(callback)) return;

  if (!isBrowser()) {
    try {
      callback();
    } catch {}
    return;
  }

  try {
    window.requestAnimationFrame(() => {
      try {
        callback();
      } catch {}
    });
    return;
  } catch {}

  try {
    setTimeout(() => {
      try {
        callback();
      } catch {}
    }, 0);
  } catch {}
}

/* =========================================================
   EVENTS / SNAPSHOT SANITIZE
========================================================= */

function shouldRedactKey(keyHint = "") {
  const key = safeText(keyHint, "");

  if (!key) return false;
  if (/^has[A-Z]/.test(key)) return false;
  if (/^is[A-Z]/.test(key)) return false;
  if (/^can[A-Z]/.test(key)) return false;

  return /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|avatarUrl|avatar_url|signedUrl|signed_url|sas|blobUrl|downloadUrl|viewUrl/i.test(key);
}

function sanitizePayload(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";

  if (shouldRedactKey(keyHint)) {
    return value ? "***" : null;
  }

  if (value === null || value === undefined) return value;
  if (typeof value === "string") return safeRedact(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (value instanceof Error) {
    return {
      name: value.name || "Error",
      message: safeRedact(value.message || "Error"),
      stack: value.stack ? "[stack]" : null,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) =>
      sanitizePayload(item, depth + 1, keyHint)
    );
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] = sanitizePayload(item, depth + 1, key);
    }

    return output;
  }

  try {
    return safeRedact(String(value));
  } catch {
    return "[unserializable]";
  }
}

function emit(events, eventName, payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  try {
    events?.emit?.(name, sanitizePayload(payload));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   I18N / TITLE
========================================================= */

function runtimeI18n() {
  if (!isBrowser()) return null;

  try {
    return (
      window.OnionI18n ||
      window.I18n ||
      window.AppI18n ||
      window.__ONION_I18N__ ||
      null
    );
  } catch {
    return null;
  }
}

function translate(key = "", params = {}, fallback = "") {
  const cleanKey = safeText(key, "");
  const cleanFallback = safeText(fallback, cleanKey);

  if (!cleanKey) return cleanFallback;

  try {
    const i18n = runtimeI18n();

    if (isFunction(i18n?.t)) {
      return i18n.t(cleanKey, params, cleanFallback) || cleanFallback;
    }
  } catch {}

  return cleanFallback;
}

function normalizeTitleInput(input = {}, extra = {}) {
  if (typeof input === "string") {
    return {
      ...safeObject(extra),
      title: input,
    };
  }

  return safeObject(input);
}

function cleanTitle(value = "", fallback = config.appName || DEFAULT_TITLE) {
  return safeText(value, fallback)
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

export function setDocumentTitle(input = {}, extra = {}) {
  const args = normalizeTitleInput(input, extra);

  const {
    dom,
    events,
    title = config.appName || DEFAULT_TITLE,
    titleKey = "",
    titleParams = {},
    suffix = "",
    updateTopbar = true,
    topbarTitle = "",
    topbarTitleKey = "",
    topbarTitleParams = {},
  } = args;

  const baseTitle = cleanTitle(title, config.appName || DEFAULT_TITLE);

  let finalTitle = titleKey
    ? cleanTitle(translate(titleKey, titleParams, baseTitle), baseTitle)
    : baseTitle;

  const cleanSuffix = cleanTitle(suffix, "");

  if (cleanSuffix && !finalTitle.includes(cleanSuffix)) {
    finalTitle = `${finalTitle} · ${cleanSuffix}`;
  }

  if (isBrowser()) {
    try {
      document.title = finalTitle;
    } catch {}
  }

  const topbarTitleNode =
    cachedNode(dom, "topbarTitle") ||
    resolveScopedNode(dom, "topbarTitle", USER_SELECTORS.topbarTitle, "topbar");

  let finalTopbarTitle = cleanTitle(topbarTitle, baseTitle);

  if (topbarTitleKey) {
    finalTopbarTitle = cleanTitle(
      translate(topbarTitleKey, topbarTitleParams, finalTopbarTitle),
      finalTopbarTitle
    );
  }

  if (updateTopbar !== false && topbarTitleNode) {
    setText(topbarTitleNode, finalTopbarTitle);
    setDataset(topbarTitleNode, "titleSynced", "true");
    setDataset(topbarTitleNode, "titleUpdatedAt", nowIso());
    removeNativeTooltip(topbarTitleNode);
  }

  emit(events, TITLE_EVENT, {
    title: finalTitle,
    topbarTitle: finalTopbarTitle,
    at: nowIso(),
  });

  return finalTitle;
}

/* =========================================================
   DYNAMIC CONTAINERS
========================================================= */

function resolveDynamic(dom, key = "") {
  return (
    cachedNode(dom, key) ||
    resolveScopedNode(dom, key, DYNAMIC_SELECTORS[key] || [], "")
  );
}

export function clearDynamicContainers({
  dom,
  events,
  includeView = false,
  includeTopbar = true,
  includeTablehead = true,
  resetTableheadVisibility = true,
  extraKeys = [],
} = {}) {
  const keys = [];

  if (includeTopbar !== false) keys.push("topbarViewContainer");
  if (includeTablehead !== false) keys.push("tableheadContainer");
  if (includeView === true) keys.push("viewContainer");

  for (const key of toArray(extraKeys)) {
    if (key && !keys.includes(key)) keys.push(key);
  }

  const cleared = [];

  for (const key of keys) {
    const node = resolveDynamic(dom, key);

    if (node && clearElement(node)) {
      cleared.push(key);
    }
  }

  if (
    resetTableheadVisibility !== false &&
    (
      includeTablehead !== false ||
      cleared.includes("tableheadContainer")
    )
  ) {
    const tablehead =
      cachedNode(dom, "tablehead") ||
      cachedNode(dom, "tableHead") ||
      resolveDynamic(dom, "tablehead");

    if (tablehead) {
      try {
        tablehead.hidden = true;
      } catch {}

      setAttr(tablehead, "aria-hidden", "true");
      setDataset(tablehead, "visible", "false");
      setDataset(tablehead, "tableheadState", "empty");
    }
  }

  emit(events, DYNAMIC_CLEARED_EVENT, {
    cleared,
    includeView: Boolean(includeView),
    at: nowIso(),
  });

  return true;
}

/* =========================================================
   USER DATA
========================================================= */

function safeUserDisplayName(user = null) {
  try {
    return getUserDisplayName(user);
  } catch {
    return "";
  }
}

function safeUserUsername(user = null) {
  try {
    return getUserUsername(user);
  } catch {
    return "";
  }
}

function safeUserAvatarUrl(user = null) {
  try {
    return getUserAvatarUrl(user);
  } catch {
    return "";
  }
}

function safeInitials(value = "") {
  try {
    return getInitials(value);
  } catch {
    return "";
  }
}

function normalizeStatus(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .trim();
}

function hasRealUser(user = null) {
  if (!user || typeof user !== "object") return false;

  const status = normalizeStatus(
    user.status ??
      user.estado ??
      user.state ??
      user.accountStatus ??
      user.account_status ??
      ""
  );

  if (
    [
      "disabled",
      "inactive",
      "deleted",
      "blocked",
      "suspended",
      "banned",
      "desactivado",
      "inactivo",
      "eliminado",
      "bloqueado",
      "suspendido",
    ].includes(status)
  ) {
    return false;
  }

  if (
    user.active === false ||
    user.enabled === false ||
    user.disabled === true ||
    user.deleted === true ||
    user.isActive === false ||
    user.is_active === false ||
    user.isEnabled === false ||
    user.is_enabled === false ||
    user.isDisabled === true ||
    user.isDeleted === true ||
    user.blocked === true
  ) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.sub, "") ||
      safeText(user.username, "") ||
      safeText(user.userName, "") ||
      safeText(user.user_name, "") ||
      safeText(user.email, "") ||
      safeText(user.mail, "") ||
      safeText(user.name, "") ||
      safeText(user.displayName, "")
  );
}

function avatarText(value = "") {
  const text = safeText(value, DEFAULT_AVATAR_TEXT)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();

  return text || DEFAULT_AVATAR_TEXT;
}

function resolveUserUiData(state = {}) {
  const root = safeObject(state);
  const authenticated = Boolean(root.authenticated);

  const candidate =
    root.user ||
    root.currentUser ||
    root.authUser ||
    root.sessionUser ||
    root.session?.user ||
    root.sessionData?.user ||
    null;

  const user = authenticated && hasRealUser(candidate)
    ? candidate
    : null;

  const displayName = user
    ? safeUserDisplayName(user) || DEFAULT_USER_NAME
    : DEFAULT_USER_NAME;

  const username = user
    ? safeUserUsername(user) || ""
    : "";

  const email = user
    ? safeText(user.email || user.mail || "", "")
    : "";

  const role = user
    ? safeText(
        root.role ||
          root.userRole ||
          user.role ||
          user.rol ||
          "",
        ""
      )
    : "";

  const avatarUrl = user
    ? safeUserAvatarUrl(user)
    : "";

  const text = avatarText(
    safeInitials(displayName) ||
      (
        username
          ? username.slice(0, 2).toUpperCase()
          : DEFAULT_AVATAR_TEXT
      )
  );

  return {
    user,
    authenticated: Boolean(user && authenticated),
    hasUser: Boolean(user),
    displayName,
    username,
    email,
    role,
    avatarUrl,
    avatarText: text,
    avatarAlt: `${translate("common.user", {}, "Usuario")} ${displayName}`,
  };
}

/* =========================================================
   AVATAR
========================================================= */

function avatarSelectorGroup(kind = "sidebar") {
  return kind === "topbar" ? AVATAR_SELECTORS.topbar : AVATAR_SELECTORS.sidebar;
}

function isValidAvatarUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) return false;

  if (/^(javascript|vbscript):/i.test(raw)) return false;

  if (/^data:/i.test(raw)) {
    return /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(raw);
  }

  if (/^blob:/i.test(raw)) return true;
  if (/^\/(?!\/)/.test(raw)) return true;
  if (/^\.\.?\//.test(raw)) return true;

  try {
    const url = new URL(raw, isBrowser() ? window.location.origin : "http://localhost");
    return ["http:", "https:", "blob:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function avatarSearchRoot(root) {
  if (!root) return null;
  return isImageElement(root) ? root.parentElement || null : root;
}

function getAvatarNodes(root, kind = "sidebar") {
  if (!root) {
    return {
      imgEl: null,
      fallbackEl: null,
    };
  }

  const selectors = avatarSelectorGroup(kind);

  if (isImageElement(root)) {
    const parent = avatarSearchRoot(root);

    return {
      imgEl: root,
      fallbackEl: parent ? queryFirst(selectors.fallback, parent) : null,
    };
  }

  return {
    imgEl: queryFirst(selectors.image, root),
    fallbackEl: queryFirst(selectors.fallback, root),
  };
}

function cacheAvatarNodes(dom, kind = "sidebar", root = null) {
  if (!dom || !root) return;

  const nodes = getAvatarNodes(root, kind);
  const prefix = kind === "topbar" ? "topbar" : "sidebar";

  try {
    dom[`${prefix}Avatar`] = root;
    dom[`${prefix}AvatarImage`] = nodes.imgEl || null;
    dom[`${prefix}AvatarFallback`] = nodes.fallbackEl || null;
  } catch {}
}

function resolveAvatarRoot(dom, kind = "sidebar") {
  const key = kind === "topbar" ? "topbarAvatar" : "sidebarAvatar";
  const cached = cachedNode(dom, key);

  if (cached) {
    cacheAvatarNodes(dom, kind, cached);
    return cached;
  }

  const selectors = avatarSelectorGroup(kind);
  const scopes = getScopes(dom, kind);

  let root = scopes.length
    ? queryFirstInScopes(selectors.root, scopes)
    : queryFirst(selectors.root);

  if (!root) {
    const image = scopes.length
      ? queryFirstInScopes(selectors.image, scopes)
      : queryFirst(selectors.image);

    const fallback = scopes.length
      ? queryFirstInScopes(selectors.fallback, scopes)
      : queryFirst(selectors.fallback);

    if (
      image?.parentElement &&
      fallback?.parentElement &&
      image.parentElement === fallback.parentElement
    ) {
      root = image.parentElement;
    } else if (image?.parentElement) {
      root = image.parentElement;
    } else if (fallback?.parentElement) {
      root = fallback.parentElement;
    } else {
      root = image || fallback || null;
    }
  }

  cacheNode(dom, key, root);
  cacheAvatarNodes(dom, kind, root);

  return root;
}

function nextAvatarToken(root) {
  if (!root) return "";

  const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    AVATAR_TOKENS.set(root, token);
  } catch {}

  return token;
}

function isCurrentAvatarToken(root, token) {
  if (!root) return false;

  try {
    return AVATAR_TOKENS.get(root) === token;
  } catch {
    return true;
  }
}

function ensureAvatarImage(root, kind = "sidebar") {
  if (!root || !isBrowser()) return null;

  if (isImageElement(root)) {
    setDataset(root, "avatarImage", "true");
    return root;
  }

  const existing = getAvatarNodes(root, kind).imgEl;

  if (existing) {
    setDataset(existing, "avatarImage", "true");
    return existing;
  }

  let img = null;

  try {
    img = document.createElement("img");
  } catch {
    return null;
  }

  img.id = kind === "topbar" ? "topbarAvatarImage" : "sidebarAvatarImage";
  img.className = "avatar-image";

  try {
    img.loading = "eager";
    img.decoding = "async";
    img.draggable = false;
    img.referrerPolicy = "no-referrer";
    img.hidden = true;
  } catch {}

  setDataset(img, "avatarImage", "true");
  setAttr(img, "aria-hidden", "true");
  removeNativeTooltip(img);

  try {
    root.appendChild(img);
  } catch {}

  return img;
}

function ensureAvatarFallback(root, text = DEFAULT_AVATAR_TEXT, kind = "sidebar") {
  if (!root || !isBrowser()) return null;

  const selectors = avatarSelectorGroup(kind);
  const cleanText = avatarText(text);

  const container = isImageElement(root)
    ? root.parentElement
    : root;

  if (!container) return null;

  const existing = queryFirst(selectors.fallback, container);

  if (existing) {
    setDataset(existing, "avatarFallback", "true");
    setText(existing, cleanText);
    removeNativeTooltip(existing);
    return existing;
  }

  let fallback = null;

  try {
    fallback = document.createElement("span");
  } catch {
    return null;
  }

  fallback.id = kind === "topbar" ? "topbarAvatarFallback" : "sidebarAvatarFallback";
  fallback.className = "avatar-fallback";

  setDataset(fallback, "avatarFallback", "true");
  setAttr(fallback, "aria-hidden", "true");
  setText(fallback, cleanText);
  removeNativeTooltip(fallback);

  try {
    container.appendChild(fallback);
  } catch {}

  return fallback;
}

function removeDuplicateAvatarNodes(root, kind = "sidebar") {
  if (!root) return false;

  const selectors = avatarSelectorGroup(kind);
  const searchRoot = avatarSearchRoot(root);

  if (!searchRoot) return false;

  const images = isImageElement(root) ? [root] : queryAll(selectors.image, searchRoot);
  const fallbacks = queryAll(selectors.fallback, searchRoot);

  let changed = false;

  for (const node of images.slice(1)) {
    try {
      node.remove();
      changed = true;
    } catch {}
  }

  for (const node of fallbacks.slice(1)) {
    try {
      node.remove();
      changed = true;
    } catch {}
  }

  return changed;
}

function avatarVisualRoot(root) {
  if (!root) return null;
  return isImageElement(root) ? root.parentElement || root : root;
}

function setAvatarMeta(root, data = {}, mode = "") {
  const visual = avatarVisualRoot(root);

  if (!visual) return;

  setAttr(visual, "aria-label", data.avatarAlt || data.displayName || DEFAULT_USER_NAME);
  setDataset(visual, "displayName", data.displayName || DEFAULT_USER_NAME);
  setDataset(visual, "username", data.username || "");
  setDataset(visual, "authenticated", data.authenticated ? "true" : "false");

  if (mode) setDataset(visual, "avatarMode", mode);

  removeNativeTooltip(visual);
}

function emitAvatar(events, eventName, data = {}, extra = {}) {
  return emit(events, eventName, {
    displayName: data.displayName || null,
    username: data.username || null,
    authenticated: Boolean(data.authenticated),
    hasAvatarUrl: Boolean(data.avatarUrl),
    reason: extra.reason || null,
    mode: extra.mode || null,
    at: nowIso(),
  });
}

function renderAvatarFallback(root, data = {}, kind = "sidebar", events = null, reason = "fallback") {
  if (!root) return false;

  const token = nextAvatarToken(root);
  const text = avatarText(data.avatarText);

  removeDuplicateAvatarNodes(root, kind);

  const img = ensureAvatarImage(root, kind);
  const fallback = ensureAvatarFallback(root, text, kind);

  if (img) {
    try {
      img.onload = null;
      img.onerror = null;
      img.hidden = true;
      img.removeAttribute("src");
      img.alt = data.avatarAlt || data.displayName || DEFAULT_USER_NAME;
    } catch {}

    setAttr(img, "aria-hidden", "true");
    setDataset(img, "avatarState", reason);
    removeNativeTooltip(img);
  }

  if (fallback) {
    try {
      fallback.hidden = false;
    } catch {}

    setAttr(fallback, "aria-hidden", "false");
    setText(fallback, text);
    setDataset(fallback, "avatarState", reason);
    removeNativeTooltip(fallback);
  } else if (isImageElement(root)) {
    try {
      root.hidden = false;
    } catch {}

    setAttr(root, "aria-hidden", "false");
    setAttr(root, "alt", data.avatarAlt || data.displayName || DEFAULT_USER_NAME);
  }

  const visual = avatarVisualRoot(root);

  toggleClass(visual, "has-image", false);
  toggleClass(visual, "has-fallback", true);
  toggleClass(visual, "is-loading", false);

  setAvatarMeta(root, data, "fallback");
  setDataset(visual, "avatarState", reason);
  setDataset(visual, "avatarText", text);

  if (isCurrentAvatarToken(root, token)) {
    emitAvatar(events, AVATAR_FALLBACK_EVENT, data, {
      mode: "fallback",
      reason,
    });
  }

  return true;
}

function showAvatarImage(root, img, fallback, data = {}, events = null, token = "") {
  if (!root || !img || !isCurrentAvatarToken(root, token)) return false;

  try {
    img.hidden = false;
  } catch {}

  setAttr(img, "aria-hidden", "false");
  setAttr(img, "alt", data.avatarAlt || data.displayName || DEFAULT_USER_NAME);

  if (fallback) {
    try {
      fallback.hidden = true;
    } catch {}

    setAttr(fallback, "aria-hidden", "true");
  }

  const visual = avatarVisualRoot(root);

  toggleClass(visual, "has-image", true);
  toggleClass(visual, "has-fallback", false);
  toggleClass(visual, "is-loading", false);

  setAvatarMeta(root, data, "image");
  setDataset(visual, "avatarState", "loaded");

  emitAvatar(events, AVATAR_LOAD_EVENT, data, {
    mode: "image",
  });

  return true;
}

function renderAvatarImage(root, data = {}, kind = "sidebar", events = null) {
  if (!root) return false;

  const url = safeText(data.avatarUrl, "");

  if (!isValidAvatarUrl(url)) {
    return renderAvatarFallback(root, data, kind, events, "invalid-url");
  }

  removeDuplicateAvatarNodes(root, kind);

  const token = nextAvatarToken(root);
  const text = avatarText(data.avatarText);
  const img = ensureAvatarImage(root, kind);
  const fallback = ensureAvatarFallback(root, text, kind);

  if (!img) {
    return renderAvatarFallback(root, data, kind, events, "missing-image-node");
  }

  const visual = avatarVisualRoot(root);

  toggleClass(visual, "is-loading", true);
  setDataset(visual, "avatarState", "loading");
  setDataset(visual, "avatarMode", "image");
  setAvatarMeta(root, data, "image");

  if (fallback) {
    try {
      fallback.hidden = false;
    } catch {}

    setAttr(fallback, "aria-hidden", "false");
    setText(fallback, text);
  }

  try {
    img.loading = "eager";
    img.decoding = "async";
    img.draggable = false;
    img.referrerPolicy = "no-referrer";
    img.alt = data.avatarAlt || data.displayName || DEFAULT_USER_NAME;
    img.hidden = true;

    setAttr(img, "aria-hidden", "true");
    removeNativeTooltip(img);

    img.onload = () => {
      showAvatarImage(root, img, fallback, data, events, token);
    };

    img.onerror = () => {
      if (!isCurrentAvatarToken(root, token)) return;

      emitAvatar(events, AVATAR_ERROR_EVENT, data, {
        reason: "image-error",
      });

      renderAvatarFallback(root, data, kind, events, "image-error");
    };

    if (img.src !== url) {
      img.src = url;
    }
  } catch {
    return renderAvatarFallback(root, data, kind, events, "render-error");
  }

  nextFrame(() => {
    try {
      if (img.complete && img.naturalWidth > 0) {
        showAvatarImage(root, img, fallback, data, events, token);
      }
    } catch {}
  });

  return true;
}

function syncAvatar(dom, kind = "sidebar", data = {}, events = null) {
  const root = resolveAvatarRoot(dom, kind);

  if (!root) return false;

  if (!data.avatarUrl) {
    return renderAvatarFallback(
      root,
      data,
      kind,
      events,
      data.authenticated ? "no-avatar-url" : "unauthenticated"
    );
  }

  return renderAvatarImage(root, data, kind, events);
}

/* =========================================================
   USER NODE SYNC
========================================================= */

function syncTextNode(node, data = {}) {
  if (!node) return false;

  setText(node, data.displayName || DEFAULT_USER_NAME);
  setDataset(node, "username", data.username || "");
  setDataset(node, "role", data.role || "");
  setDataset(node, "authenticated", data.authenticated ? "true" : "false");
  removeNativeTooltip(node);

  return true;
}

function syncEmailNode(node, data = {}) {
  if (!node) return false;

  setText(node, data.authenticated ? data.email || "" : "");
  setDataset(node, "authenticated", data.authenticated ? "true" : "false");
  removeNativeTooltip(node);

  return true;
}

function syncRoleNode(node, data = {}) {
  if (!node) return false;

  setText(node, data.authenticated ? data.role || "" : "");
  setDataset(node, "authenticated", data.authenticated ? "true" : "false");
  removeNativeTooltip(node);

  return true;
}

function syncUserToggle(dom, data = {}) {
  const toggle =
    resolveScopedNode(dom, "userToggle", USER_SELECTORS.userToggle, "sidebar") ||
    resolveScopedNode(dom, "userToggle", USER_SELECTORS.userToggle, "topbar");

  if (!toggle) return false;

  setAttr(toggle, "aria-label", data.displayName || DEFAULT_USER_NAME);
  setAttr(toggle, "aria-haspopup", "menu");
  setDataset(toggle, "username", data.username || "");
  setDataset(toggle, "role", data.role || "");
  setDataset(toggle, "authenticated", data.authenticated ? "true" : "false");
  removeNativeTooltip(toggle);

  return true;
}

function syncUserDropdown(dom, data = {}) {
  const dropdown =
    resolveScopedNode(dom, "userDropdown", USER_SELECTORS.userDropdown, "sidebar") ||
    resolveScopedNode(dom, "userDropdown", USER_SELECTORS.userDropdown, "topbar");

  if (!dropdown) return false;

  setDataset(dropdown, "username", data.username || "");
  setDataset(dropdown, "role", data.role || "");
  setDataset(dropdown, "authenticated", data.authenticated ? "true" : "false");

  return true;
}

function syncLogoutButton(dom, data = {}) {
  const button =
    resolveScopedNode(dom, "logoutBtn", USER_SELECTORS.logoutBtn, "sidebar") ||
    resolveScopedNode(dom, "logoutBtn", USER_SELECTORS.logoutBtn, "topbar");

  if (!button) return false;

  setDataset(button, "authenticated", data.authenticated ? "true" : "false");
  removeNativeTooltip(button);

  return true;
}

/* =========================================================
   RECACHE / SYNC
========================================================= */

export function recacheUserNodes(dom, events = null) {
  if (!dom) return {};

  const result = {
    sidebarName: Boolean(resolveScopedNode(dom, "sidebarName", USER_SELECTORS.sidebarName, "sidebar")),
    sidebarEmail: Boolean(resolveScopedNode(dom, "sidebarEmail", USER_SELECTORS.sidebarEmail, "sidebar")),
    sidebarRole: Boolean(resolveScopedNode(dom, "sidebarRole", USER_SELECTORS.sidebarRole, "sidebar")),
    sidebarAvatar: Boolean(resolveAvatarRoot(dom, "sidebar")),

    topbarUserName: Boolean(resolveScopedNode(dom, "topbarUserName", USER_SELECTORS.topbarUserName, "topbar")),
    topbarAvatar: Boolean(resolveAvatarRoot(dom, "topbar")),

    userToggle: Boolean(
      resolveScopedNode(dom, "userToggle", USER_SELECTORS.userToggle, "sidebar") ||
      resolveScopedNode(dom, "userToggle", USER_SELECTORS.userToggle, "topbar")
    ),

    userDropdown: Boolean(
      resolveScopedNode(dom, "userDropdown", USER_SELECTORS.userDropdown, "sidebar") ||
      resolveScopedNode(dom, "userDropdown", USER_SELECTORS.userDropdown, "topbar")
    ),

    logoutBtn: Boolean(
      resolveScopedNode(dom, "logoutBtn", USER_SELECTORS.logoutBtn, "sidebar") ||
      resolveScopedNode(dom, "logoutBtn", USER_SELECTORS.logoutBtn, "topbar")
    ),

    topbarTitle: Boolean(resolveScopedNode(dom, "topbarTitle", USER_SELECTORS.topbarTitle, "topbar")),
  };

  emit(events, USER_RECACHE_EVENT, {
    nodes: result,
    at: nowIso(),
  });

  return result;
}

function normalizeSyncArgs(input = {}) {
  if (
    input &&
    typeof input === "object" &&
    (
      "state" in input ||
      "dom" in input ||
      "events" in input ||
      "recache" in input
    )
  ) {
    return input;
  }

  return {
    state: input,
  };
}

function shouldDeferSync(synced = {}) {
  return !(
    synced.sidebarName ||
    synced.sidebarAvatar ||
    synced.topbarUserName ||
    synced.topbarAvatar ||
    synced.userToggle
  );
}

function scheduleDeferredSync(args = {}) {
  if (deferredUserSyncScheduled || !isBrowser()) return false;

  deferredUserSyncScheduled = true;

  nextFrame(() => {
    deferredUserSyncScheduled = false;

    emit(args.events, USER_DEFERRED_SYNC_EVENT, {
      reason: "nodes-mounted-late",
      at: nowIso(),
    });

    try {
      syncUserUI({
        ...args,
        recache: true,
        deferIfMissing: false,
      });
    } catch {}
  });

  return true;
}

export function syncUserUI(input = {}) {
  const args = normalizeSyncArgs(input);

  const {
    state,
    dom,
    events,
    recache = true,
    deferIfMissing = true,
  } = args;

  if (recache !== false) {
    recacheUserNodes(dom, events);
  }

  const data = resolveUserUiData(state);

  const sidebarName = resolveScopedNode(dom, "sidebarName", USER_SELECTORS.sidebarName, "sidebar");
  const sidebarEmail = resolveScopedNode(dom, "sidebarEmail", USER_SELECTORS.sidebarEmail, "sidebar");
  const sidebarRole = resolveScopedNode(dom, "sidebarRole", USER_SELECTORS.sidebarRole, "sidebar");
  const topbarUserName = resolveScopedNode(dom, "topbarUserName", USER_SELECTORS.topbarUserName, "topbar");

  const synced = {
    sidebarName: syncTextNode(sidebarName, data),
    sidebarEmail: syncEmailNode(sidebarEmail, data),
    sidebarRole: syncRoleNode(sidebarRole, data),

    sidebarAvatar: syncAvatar(dom, "sidebar", data, events),

    topbarUserName: syncTextNode(topbarUserName, data),
    topbarAvatar: syncAvatar(dom, "topbar", data, events),

    userToggle: syncUserToggle(dom, data),
    userDropdown: syncUserDropdown(dom, data),
    logoutBtn: syncLogoutButton(dom, data),
  };

  if (deferIfMissing !== false && shouldDeferSync(synced)) {
    scheduleDeferredSync(args);
  }

  const payload = {
    displayName: data.displayName,
    username: data.username || null,
    role: data.role || null,
    authenticated: data.authenticated,
    hasUser: data.hasUser,
    avatarText: data.avatarText,
    hasAvatarUrl: Boolean(data.avatarUrl),
    synced,
    version: UI_VERSION,
    at: nowIso(),
  };

  emit(events, USER_UI_EVENT, payload);

  return payload;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function elementState(el) {
  if (!el) {
    return {
      exists: false,
    };
  }

  let className = "";

  try {
    className = typeof el.className === "string"
      ? el.className
      : el.className?.baseVal || "";
  } catch {}

  return {
    exists: true,
    connected: isConnected(el),
    tag: safeText(el.tagName, "").toLowerCase(),
    id: safeText(el.id, ""),
    className: safeText(className, ""),
    hidden: Boolean(el.hidden),
    ariaHidden: safeText(el.getAttribute?.("aria-hidden"), ""),
    ariaBusy: safeText(el.getAttribute?.("aria-busy"), ""),
    text: safeText(el.textContent, "").slice(0, 80),
    dataset: {
      avatarMode: el.dataset?.avatarMode || "",
      avatarState: el.dataset?.avatarState || "",
      authenticated: el.dataset?.authenticated || "",
      username: el.dataset?.username || "",
    },
  };
}

function avatarSnapshot(root, kind = "sidebar") {
  const nodes = getAvatarNodes(root, kind);

  return {
    root: elementState(root),
    image: elementState(nodes.imgEl),
    fallback: elementState(nodes.fallbackEl),
    mode: safeText(root?.dataset?.avatarMode, ""),
    state: safeText(root?.dataset?.avatarState, ""),
  };
}

export function getUiSnapshot({
  state,
  dom,
} = {}) {
  const data = resolveUserUiData(state);

  const sidebarAvatar = cachedNode(dom, "sidebarAvatar") || resolveAvatarRoot(dom, "sidebar");
  const topbarAvatar = cachedNode(dom, "topbarAvatar") || resolveAvatarRoot(dom, "topbar");

  return {
    version: UI_VERSION,

    title: isBrowser() ? safeText(document.title, "") : "",

    config: {
      appName: safeText(config?.appName, DEFAULT_TITLE),
      defaultLang: safeText(config?.defaultLang, "es"),
      defaultTheme: safeText(config?.defaultTheme, "dark"),
      syncUserUIOnAuthChange: safeBool(config?.ui?.syncUserUIOnAuthChange, true),
    },

    user: {
      authenticated: data.authenticated,
      hasUser: data.hasUser,
      displayName: data.displayName,
      username: data.username || null,
      role: data.role || null,
      avatarText: data.avatarText,
      hasAvatarUrl: Boolean(data.avatarUrl),
    },

    dom: {
      hasTopbarTitle: Boolean(cachedNode(dom, "topbarTitle")),
      hasSidebarName: Boolean(cachedNode(dom, "sidebarName")),
      hasSidebarEmail: Boolean(cachedNode(dom, "sidebarEmail")),
      hasSidebarRole: Boolean(cachedNode(dom, "sidebarRole")),
      hasSidebarAvatar: Boolean(sidebarAvatar),
      hasTopbarUserName: Boolean(cachedNode(dom, "topbarUserName")),
      hasTopbarAvatar: Boolean(topbarAvatar),
      hasUserToggle: Boolean(cachedNode(dom, "userToggle")),
      hasUserDropdown: Boolean(cachedNode(dom, "userDropdown")),
      hasLogoutBtn: Boolean(cachedNode(dom, "logoutBtn")),
      hasTopbarViewContainer: Boolean(cachedNode(dom, "topbarViewContainer")),
      hasTableheadContainer: Boolean(cachedNode(dom, "tableheadContainer")),
    },

    avatar: {
      sidebar: avatarSnapshot(sidebarAvatar, "sidebar"),
      topbar: avatarSnapshot(topbarAvatar, "topbar"),
    },

    at: nowIso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  UI_VERSION,

  setDocumentTitle,
  clearDynamicContainers,

  recacheUserNodes,
  syncUserUI,

  getUiSnapshot,
};
