/* =========================================================
   Onion SPA - Core UI
   Archivo: src/core/ui.js

   ONION SUPPORT · CORE UI
   GLOBAL UI HELPERS · USER VISUAL SYNC · AVATAR SAFE · 14/10

   RESPONSABILIDADES:
   - helpers UI globales del core
   - sincronizar título documento
   - limpiar contenedores dinámicos shell
   - sincronizar bloque visual usuario
   - refresco reactivo con i18n
   - pintar avatar robusto en sidebar/topbar sin romper fallback

   FIX CRÍTICO:
   - no destruir la estructura DOM del avatar del sidebar
   - respetar #sidebarAvatarImage y #sidebarAvatarFallback
   - evitar innerHTML/textContent sobre el root del avatar
   - evitar title nativo en avatar/nombre
   - no forzar ni borrar data-tooltip custom
   - no pintar usuario fantasma si state.authenticated=false
   - no emitir avatarUrl sensible/SAS en eventos

   HARDENING EXTREMO:
   - no duplicar nodos avatar
   - fallback consistente
   - title reactivo robusto
   - sync UI segura aunque falten nodos
   - browser/server safe
   - recache DOM ligero si el módulo UI montó tarde
   - eventos consistentes
   - snapshots útiles
   - soporte avatarRoot img o contenedor
   - soporte usuario/topbar/sidebar montados tarde
   - protección contra onload/onerror obsoletos
   - sin innerHTML
   - sin imports duplicados
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

const UI_VERSION =
  "14.0.0";

const DEFAULT_USER_NAME =
  "Usuario";

const DEFAULT_AVATAR_TEXT =
  "ON";

const DEFAULT_TITLE =
  "Onion Support";

const USER_UI_EVENT =
  "app:user-ui:sync";

const TITLE_EVENT =
  "app:title:change";

const DYNAMIC_CLEARED_EVENT =
  "app:dynamic:cleared";

const AVATAR_LOAD_EVENT =
  "app:user-ui:avatar-load";

const AVATAR_ERROR_EVENT =
  "app:user-ui:avatar-error";

const AVATAR_FALLBACK_EVENT =
  "app:user-ui:avatar-fallback";

const USER_RECACHE_EVENT =
  "app:user-ui:recache";

const AVATAR_RENDER_TOKENS =
  new WeakMap();

const AVATAR_SELECTORS =
  Object.freeze({
    root: Object.freeze([
      "#sidebar-avatar",
      "#sidebarAvatar",
      "[data-sidebar-avatar='true']",
      "[data-sidebar-avatar]",
      "[data-user-avatar]",
      ".sidebar-avatar",
      ".user-avatar",
    ]),

    topbarRoot: Object.freeze([
      "#topbar-avatar",
      "#topbarAvatar",
      "[data-topbar-avatar='true']",
      "[data-topbar-avatar]",
      "[data-user-avatar-topbar]",
      ".topbar-avatar",
    ]),

    image: Object.freeze([
      "#sidebarAvatarImage",
      "#topbarAvatarImage",
      ".avatar-image",
      "img[data-avatar-image='true']",
      "[data-avatar-image]",
      "img",
    ]),

    fallback: Object.freeze([
      "#sidebarAvatarFallback",
      "#topbarAvatarFallback",
      ".avatar-fallback",
      "[data-avatar-fallback='true']",
      "[data-avatar-fallback]",
    ]),
  });

const USER_NAME_SELECTORS =
  Object.freeze([
    "#sidebar-name",
    "#sidebarName",
    "[data-sidebar-name='true']",
    "[data-sidebar-name]",
    "[data-user-name]",
    ".sidebar-name",
    ".user-name",
  ]);

const TOPBAR_USER_NAME_SELECTORS =
  Object.freeze([
    "#topbar-user-name",
    "#topbarUserName",
    "[data-topbar-user-name='true']",
    "[data-topbar-user-name]",
    "[data-user-name-topbar]",
    ".topbar-user-name",
  ]);

const USER_TOGGLE_SELECTORS =
  Object.freeze([
    "#userToggle",
    "#user-toggle",
    "[data-user-toggle='true']",
    "[data-user-toggle]",
    "[data-user-menu-toggle]",
  ]);

const USER_DROPDOWN_SELECTORS =
  Object.freeze([
    "#userDropdown",
    "#user-dropdown",
    "[data-user-dropdown='true']",
    "[data-user-dropdown]",
    "[data-user-menu]",
  ]);

const LOGOUT_SELECTORS =
  Object.freeze([
    "#logoutBtn",
    "#logout-button",
    "#logout-btn",
    "[data-logout-button='true']",
    "[data-logout-button]",
    "[data-logout]",
    "[data-action='logout']",
  ]);

const TOPBAR_TITLE_SELECTORS =
  Object.freeze([
    "#topbar-title",
    "[data-topbar-title='true']",
    "[data-topbar-title]",
    ".topbar-title",
  ]);

const DYNAMIC_CONTAINER_SELECTORS =
  Object.freeze({
    topbarViewContainer: Object.freeze([
      "#topbarview-container",
      "#topbar-view-container",
      "[data-topbar-view-container='true']",
      "[data-topbar-view-container]",
      ".topbar-view-container",
    ]),

    tableheadContainer: Object.freeze([
      "#tablehead-container",
      "#table-head-container",
      "[data-tablehead-container='true']",
      "[data-tablehead-container]",
      "[data-table-head-container]",
      ".tablehead-container",
    ]),

    tablehead: Object.freeze([
      "#table-head",
      "#tablehead",
      ".table-head",
      ".tablehead",
      "[data-tablehead]",
      "[data-table-head]",
    ]),

    viewContainer: Object.freeze([
      "#view-container",
      "#router-view",
      "#app-view",
      "[data-view-root]",
      "[data-view-container='true']",
      "[data-view-container]",
      "[data-router-view]",
      "[data-router-outlet]",
      ".view-container",
      ".router-view",
    ]),
  });

const USER_NODE_MAP =
  Object.freeze({
    sidebarName:
      USER_NAME_SELECTORS,

    sidebarAvatar:
      AVATAR_SELECTORS.root,

    topbarUserName:
      TOPBAR_USER_NAME_SELECTORS,

    topbarAvatar:
      AVATAR_SELECTORS.topbarRoot,

    userToggle:
      USER_TOGGLE_SELECTORS,

    userDropdown:
      USER_DROPDOWN_SELECTORS,

    logoutBtn:
      LOGOUT_SELECTORS,

    topbarTitle:
      TOPBAR_TITLE_SELECTORS,
  });

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object"
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeObject(value, fallback = {}) {
  return isPlainObject(value)
    ? value
    : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === 1) return true;
  if (value === 0) return false;

  return Boolean(fallback);
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeNowIso() {
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

function safeEmit(events, eventName, payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    events?.emit?.(
      name,
      sanitizeEventPayload(payload)
    );

    return true;
  } catch {}

  return false;
}

function sanitizeEventPayload(value, depth = 0, keyHint = "") {
  if (depth > 4) {
    return "[depth-limit]";
  }

  if (
    /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|avatarUrl|avatar_url|signedUrl|sas/i.test(
      safeText(keyHint, "")
    )
  ) {
    return value ? "***" : null;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (typeof value === "string") {
    return safeRedact(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "function") {
    return "[function]";
  }

  if (value instanceof Error) {
    return {
      name:
        value.name || "Error",

      message:
        safeRedact(
          value.message || "Error"
        ),

      stack:
        value.stack
          ? "[stack]"
          : null,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizeEventPayload(
          item,
          depth + 1,
          keyHint
        )
      );
  }

  if (isPlainObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      output[key] =
        sanitizeEventPayload(
          item,
          depth + 1,
          key
        );
    }

    return output;
  }

  try {
    return safeRedact(String(value));
  } catch {
    return "[unserializable]";
  }
}

function safeSetText(el, value = "") {
  if (!el) {
    return false;
  }

  try {
    el.textContent =
      safeText(value, "");

    return true;
  } catch {}

  return false;
}

function safeSetAttr(el, name, value) {
  if (
    !el ||
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
      el.removeAttribute(name);
    } else {
      el.setAttribute(
        name,
        String(value)
      );
    }

    return true;
  } catch {}

  return false;
}

function safeRemoveAttr(el, name) {
  if (
    !el ||
    !name
  ) {
    return false;
  }

  try {
    el.removeAttribute(name);
    return true;
  } catch {}

  return false;
}

function safeToggleClass(el, className, force) {
  if (
    !el ||
    !className
  ) {
    return false;
  }

  try {
    el.classList.toggle(
      className,
      Boolean(force)
    );

    return true;
  } catch {}

  return false;
}

function safeClassAdd(el, ...classes) {
  if (!el) {
    return false;
  }

  const clean =
    classes
      .map((item) => safeText(item, ""))
      .filter(Boolean);

  if (!clean.length) {
    return false;
  }

  try {
    el.classList.add(...clean);
    return true;
  } catch {}

  return false;
}

function safeClassRemove(el, ...classes) {
  if (!el) {
    return false;
  }

  const clean =
    classes
      .map((item) => safeText(item, ""))
      .filter(Boolean);

  if (!clean.length) {
    return false;
  }

  try {
    el.classList.remove(...clean);
    return true;
  } catch {}

  return false;
}

function safeDatasetSet(el, key, value) {
  if (
    !el ||
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
      delete el.dataset[key];
    } else {
      el.dataset[key] =
        String(value);
    }

    return true;
  } catch {}

  return false;
}

function queryFirst(selectors = [], root = null) {
  if (!isBrowser()) {
    return null;
  }

  const scope =
    root || document;

  for (const selector of safeArray(selectors)) {
    const cleanSelector =
      safeText(selector, "");

    if (!cleanSelector) {
      continue;
    }

    try {
      if (
        cleanSelector.startsWith("#") &&
        scope === document
      ) {
        const foundById =
          document.getElementById(
            cleanSelector.slice(1)
          );

        if (foundById) {
          return foundById;
        }
      }

      const found =
        scope.querySelector?.(
          cleanSelector
        );

      if (found) {
        return found;
      }
    } catch {}
  }

  return null;
}

function queryAll(selectors = [], root = null) {
  if (!isBrowser()) {
    return [];
  }

  const scope =
    root || document;

  const output =
    [];

  for (const selector of safeArray(selectors)) {
    const cleanSelector =
      safeText(selector, "");

    if (!cleanSelector) {
      continue;
    }

    try {
      const nodes =
        Array.from(
          scope.querySelectorAll?.(
            cleanSelector
          ) || []
        );

      for (const node of nodes) {
        if (!output.includes(node)) {
          output.push(node);
        }
      }
    } catch {}
  }

  return output;
}

function isConnected(el) {
  if (!el) {
    return false;
  }

  try {
    if (
      isBrowser() &&
      (
        el === document ||
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

function resolveDomNode(dom, key, selectors = [], root = null) {
  const cached =
    dom?.[key] || null;

  if (
    cached &&
    isConnected(cached)
  ) {
    return cached;
  }

  const found =
    queryFirst(
      selectors,
      root
    );

  try {
    if (
      found &&
      dom &&
      key
    ) {
      dom[key] =
        found;
    }
  } catch {}

  return found;
}

function isImageElement(el) {
  try {
    return safeText(
      el?.tagName,
      ""
    ).toLowerCase() === "img";
  } catch {
    return false;
  }
}

function removeNativeTooltip(el) {
  /*
    Regla del proyecto:
    - eliminar title nativo
    - no tocar data-tooltip custom
  */
  safeRemoveAttr(
    el,
    "title"
  );

  return true;
}

function nextFrame(callback) {
  if (!isFunction(callback)) {
    return;
  }

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

function getConfigValue(path = "", fallback = undefined) {
  const parts =
    safeText(path, "")
      .split(".")
      .filter(Boolean);

  let current =
    config;

  for (const part of parts) {
    if (
      !current ||
      current[part] === undefined
    ) {
      return fallback;
    }

    current =
      current[part];
  }

  return current === undefined
    ? fallback
    : current;
}

/* =========================================================
   SAFE USER HELPERS
========================================================= */

function safeGetUserDisplayName(user = null) {
  try {
    return getUserDisplayName(user);
  } catch {
    return "";
  }
}

function safeGetUserUsername(user = null) {
  try {
    return getUserUsername(user);
  } catch {
    return "";
  }
}

function safeGetUserAvatarUrl(user = null) {
  try {
    return getUserAvatarUrl(user);
  } catch {
    return "";
  }
}

function safeGetInitials(value = "") {
  try {
    return getInitials(value);
  } catch {
    return "";
  }
}

/* =========================================================
   I18N
========================================================= */

function getI18nFromRuntime() {
  if (!isBrowser()) {
    return null;
  }

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

function safeTranslate(key, params = {}, fallback = "") {
  const cleanKey =
    safeText(key, "");

  const cleanFallback =
    safeText(fallback, cleanKey);

  if (!cleanKey) {
    return cleanFallback;
  }

  try {
    const runtimeI18n =
      getI18nFromRuntime();

    if (isFunction(runtimeI18n?.t)) {
      return (
        runtimeI18n.t(
          cleanKey,
          params,
          cleanFallback
        ) ||
        cleanFallback
      );
    }
  } catch {}

  return cleanFallback;
}

/* =========================================================
   ARG NORMALIZATION
========================================================= */

function normalizeTitleArgs(input = {}, maybeExtra = {}) {
  if (typeof input === "string") {
    return {
      ...safeObject(maybeExtra),
      title:
        input,
    };
  }

  return safeObject(input);
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
    state:
      input,
  };
}

/* =========================================================
   DOCUMENT TITLE
========================================================= */

function normalizeTitle(value = "", fallback = config.appName || DEFAULT_TITLE) {
  return safeText(
    value,
    fallback
  )
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

export function setDocumentTitle(input = {}, maybeExtra = {}) {
  const args =
    normalizeTitleArgs(
      input,
      maybeExtra
    );

  const {
    dom,
    events,
    title = config.appName,
    titleKey = "",
    titleParams = {},
    suffix = "",
    updateTopbar = true,
    topbarTitle = "",
    topbarTitleKey = "",
    topbarTitleParams = {},
  } =
    args;

  const baseTitle =
    normalizeTitle(
      title,
      config.appName || DEFAULT_TITLE
    );

  let finalTitle =
    baseTitle;

  if (titleKey) {
    finalTitle =
      normalizeTitle(
        safeTranslate(
          titleKey,
          titleParams,
          baseTitle
        ),
        baseTitle
      );
  }

  const cleanSuffix =
    normalizeTitle(
      suffix,
      ""
    );

  if (
    cleanSuffix &&
    !finalTitle.includes(cleanSuffix)
  ) {
    finalTitle =
      `${finalTitle} · ${cleanSuffix}`;
  }

  if (isBrowser()) {
    try {
      document.title =
        finalTitle;
    } catch {}
  }

  const topbarTitleNode =
    dom?.topbarTitle ||
    resolveDomNode(
      dom,
      "topbarTitle",
      TOPBAR_TITLE_SELECTORS
    );

  let finalTopbarTitle =
    normalizeTitle(
      topbarTitle,
      baseTitle
    );

  if (topbarTitleKey) {
    finalTopbarTitle =
      normalizeTitle(
        safeTranslate(
          topbarTitleKey,
          topbarTitleParams,
          finalTopbarTitle
        ),
        finalTopbarTitle
      );
  }

  if (
    updateTopbar !== false &&
    topbarTitleNode
  ) {
    safeSetText(
      topbarTitleNode,
      finalTopbarTitle
    );

    safeDatasetSet(
      topbarTitleNode,
      "titleSynced",
      "true"
    );

    safeDatasetSet(
      topbarTitleNode,
      "titleUpdatedAt",
      safeNowIso()
    );

    removeNativeTooltip(
      topbarTitleNode
    );
  }

  safeEmit(
    events,
    TITLE_EVENT,
    {
      title:
        finalTitle,

      topbarTitle:
        finalTopbarTitle,

      at:
        safeNowIso(),
    }
  );

  return finalTitle;
}

/* =========================================================
   CLEAR DYNAMIC CONTAINERS
========================================================= */

function clearElement(el) {
  if (!el) {
    return false;
  }

  try {
    el.replaceChildren();
    return true;
  } catch {}

  try {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }

    return true;
  } catch {}

  return false;
}

function resolveDynamicContainer(dom, key = "") {
  const selectors =
    DYNAMIC_CONTAINER_SELECTORS[key] || [];

  return (
    dom?.[key] ||
    resolveDomNode(
      dom,
      key,
      selectors
    )
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
  const cleared =
    [];

  const keys =
    [];

  if (includeTopbar !== false) {
    keys.push(
      "topbarViewContainer"
    );
  }

  if (includeTablehead !== false) {
    keys.push(
      "tableheadContainer"
    );
  }

  if (includeView === true) {
    keys.push(
      "viewContainer"
    );
  }

  for (const key of safeArray(extraKeys)) {
    if (
      key &&
      !keys.includes(key)
    ) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    const node =
      resolveDynamicContainer(
        dom,
        key
      );

    if (
      node &&
      clearElement(node)
    ) {
      cleared.push(key);
    }
  }

  if (
    resetTableheadVisibility !== false &&
    cleared.includes("tableheadContainer")
  ) {
    const tablehead =
      dom?.tablehead ||
      dom?.tableHead ||
      resolveDynamicContainer(
        dom,
        "tablehead"
      );

    if (tablehead) {
      try {
        tablehead.hidden =
          true;
      } catch {}

      safeSetAttr(
        tablehead,
        "aria-hidden",
        "true"
      );

      safeDatasetSet(
        tablehead,
        "visible",
        "false"
      );

      safeDatasetSet(
        tablehead,
        "tableheadState",
        "empty"
      );
    }
  }

  safeEmit(
    events,
    DYNAMIC_CLEARED_EVENT,
    {
      cleared,
      includeView:
        Boolean(includeView),
      at:
        safeNowIso(),
    }
  );

  return true;
}

/* =========================================================
   AVATAR URL SAFETY
========================================================= */

function isValidAvatarUrl(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  if (/^(javascript|vbscript):/i.test(raw)) {
    return false;
  }

  if (/^data:/i.test(raw)) {
    return /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(raw);
  }

  if (/^blob:/i.test(raw)) {
    return true;
  }

  if (/^\/(?!\/)/.test(raw)) {
    return true;
  }

  if (/^\.\.?\//.test(raw)) {
    return true;
  }

  try {
    const url =
      new URL(
        raw,
        isBrowser()
          ? window.location.origin
          : "http://localhost"
      );

    return [
      "http:",
      "https:",
      "blob:",
    ].includes(url.protocol);
  } catch {
    return false;
  }
}

/* =========================================================
   AVATAR NODES
========================================================= */

function normalizeAvatarText(value = "") {
  const text =
    safeText(value, DEFAULT_AVATAR_TEXT)
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase();

  return text || DEFAULT_AVATAR_TEXT;
}

function getAvatarNodes(avatarRoot) {
  if (!avatarRoot) {
    return {
      imgEl:
        null,

      fallbackEl:
        null,
    };
  }

  if (isImageElement(avatarRoot)) {
    return {
      imgEl:
        avatarRoot,

      fallbackEl:
        null,
    };
  }

  const imgEl =
    queryFirst(
      AVATAR_SELECTORS.image,
      avatarRoot
    );

  const fallbackEl =
    queryFirst(
      AVATAR_SELECTORS.fallback,
      avatarRoot
    );

  return {
    imgEl,
    fallbackEl,
  };
}

function getNextAvatarRenderToken(avatarRoot) {
  if (!avatarRoot) {
    return "";
  }

  const next =
    `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    AVATAR_RENDER_TOKENS.set(
      avatarRoot,
      next
    );
  } catch {}

  return next;
}

function isCurrentAvatarRenderToken(avatarRoot, token) {
  if (!avatarRoot) {
    return false;
  }

  try {
    return AVATAR_RENDER_TOKENS.get(avatarRoot) === token;
  } catch {
    return true;
  }
}

function ensureAvatarImageNode(avatarRoot, idPrefix = "sidebar") {
  if (
    !avatarRoot ||
    !isBrowser()
  ) {
    return null;
  }

  if (isImageElement(avatarRoot)) {
    safeDatasetSet(
      avatarRoot,
      "avatarImage",
      "true"
    );

    return avatarRoot;
  }

  const { imgEl } =
    getAvatarNodes(avatarRoot);

  if (imgEl) {
    safeDatasetSet(
      imgEl,
      "avatarImage",
      "true"
    );

    return imgEl;
  }

  let created =
    null;

  try {
    created =
      document.createElement("img");
  } catch {
    return null;
  }

  created.id =
    created.id ||
    `${idPrefix}AvatarImage`;

  created.className =
    safeText(
      created.className,
      "avatar-image"
    );

  safeDatasetSet(
    created,
    "avatarImage",
    "true"
  );

  try {
    created.loading =
      "eager";

    created.decoding =
      "async";

    created.draggable =
      false;

    created.referrerPolicy =
      "no-referrer";
  } catch {}

  created.hidden =
    true;

  safeSetAttr(
    created,
    "aria-hidden",
    "true"
  );

  removeNativeTooltip(
    created
  );

  try {
    avatarRoot.appendChild(created);
  } catch {}

  return created;
}

function ensureAvatarFallbackNode(avatarRoot, avatarText = DEFAULT_AVATAR_TEXT, idPrefix = "sidebar") {
  if (
    !avatarRoot ||
    !isBrowser()
  ) {
    return null;
  }

  if (isImageElement(avatarRoot)) {
    return null;
  }

  const { fallbackEl } =
    getAvatarNodes(avatarRoot);

  if (fallbackEl) {
    safeDatasetSet(
      fallbackEl,
      "avatarFallback",
      "true"
    );

    if (
      !safeText(
        fallbackEl.textContent,
        ""
      )
    ) {
      safeSetText(
        fallbackEl,
        avatarText
      );
    }

    removeNativeTooltip(
      fallbackEl
    );

    return fallbackEl;
  }

  let created =
    null;

  try {
    created =
      document.createElement("span");
  } catch {
    return null;
  }

  created.id =
    created.id ||
    `${idPrefix}AvatarFallback`;

  created.className =
    safeText(
      created.className,
      "avatar-fallback"
    );

  safeDatasetSet(
    created,
    "avatarFallback",
    "true"
  );

  safeSetAttr(
    created,
    "aria-hidden",
    "true"
  );

  safeSetText(
    created,
    avatarText
  );

  removeNativeTooltip(
    created
  );

  try {
    avatarRoot.appendChild(created);
  } catch {}

  return created;
}

function cleanupDuplicateAvatarNodes(avatarRoot) {
  if (
    !avatarRoot ||
    isImageElement(avatarRoot)
  ) {
    return false;
  }

  const images =
    queryAll(
      AVATAR_SELECTORS.image,
      avatarRoot
    );

  const fallbacks =
    queryAll(
      AVATAR_SELECTORS.fallback,
      avatarRoot
    );

  let changed =
    false;

  images.slice(1).forEach((node) => {
    try {
      node.remove();
      changed =
        true;
    } catch {}
  });

  fallbacks.slice(1).forEach((node) => {
    try {
      node.remove();
      changed =
        true;
    } catch {}
  });

  return changed;
}

function setAvatarRootMeta(avatarRoot, {
  avatarAlt,
  displayName,
  username = "",
  authenticated = false,
  mode = "",
} = {}) {
  if (!avatarRoot) {
    return;
  }

  safeSetAttr(
    avatarRoot,
    "aria-label",
    avatarAlt
  );

  safeDatasetSet(
    avatarRoot,
    "displayName",
    displayName
  );

  safeDatasetSet(
    avatarRoot,
    "username",
    username
  );

  safeDatasetSet(
    avatarRoot,
    "authenticated",
    authenticated ? "true" : "false"
  );

  if (mode) {
    safeDatasetSet(
      avatarRoot,
      "avatarMode",
      mode
    );
  }

  removeNativeTooltip(
    avatarRoot
  );
}

function emitAvatarEvent(events, eventName, payload = {}) {
  return safeEmit(
    events,
    eventName,
    {
      mode:
        payload.mode || null,

      reason:
        payload.reason || null,

      displayName:
        payload.displayName || null,

      username:
        payload.username || null,

      authenticated:
        Boolean(payload.authenticated),

      hasAvatarUrl:
        Boolean(payload.hasAvatarUrl),

      at:
        safeNowIso(),
    }
  );
}

function renderAvatarFallback(
  avatarRoot,
  {
    avatarText = DEFAULT_AVATAR_TEXT,
    avatarAlt = DEFAULT_USER_NAME,
    displayName = DEFAULT_USER_NAME,
    username = "",
    authenticated = false,
    idPrefix = "sidebar",
    events = null,
    reason = "fallback",
  } = {}
) {
  if (!avatarRoot) {
    return false;
  }

  const renderToken =
    getNextAvatarRenderToken(
      avatarRoot
    );

  const cleanAvatarText =
    normalizeAvatarText(
      avatarText
    );

  cleanupDuplicateAvatarNodes(
    avatarRoot
  );

  const imgEl =
    ensureAvatarImageNode(
      avatarRoot,
      idPrefix
    );

  const fallbackEl =
    ensureAvatarFallbackNode(
      avatarRoot,
      cleanAvatarText,
      idPrefix
    );

  if (imgEl) {
    try {
      imgEl.onload =
        null;

      imgEl.onerror =
        null;

      imgEl.hidden =
        true;

      imgEl.removeAttribute("src");

      imgEl.alt =
        avatarAlt;
    } catch {}

    safeSetAttr(
      imgEl,
      "aria-hidden",
      "true"
    );

    removeNativeTooltip(
      imgEl
    );
  }

  if (fallbackEl) {
    fallbackEl.hidden =
      false;

    safeSetAttr(
      fallbackEl,
      "aria-hidden",
      "false"
    );

    safeSetText(
      fallbackEl,
      cleanAvatarText
    );

    removeNativeTooltip(
      fallbackEl
    );
  }

  if (!isImageElement(avatarRoot)) {
    safeToggleClass(
      avatarRoot,
      "has-image",
      false
    );

    safeToggleClass(
      avatarRoot,
      "has-fallback",
      true
    );

    safeToggleClass(
      avatarRoot,
      "is-loading",
      false
    );
  }

  setAvatarRootMeta(
    avatarRoot,
    {
      avatarAlt,
      displayName,
      username,
      authenticated,
      mode:
        "fallback",
    }
  );

  safeDatasetSet(
    avatarRoot,
    "avatarState",
    reason
  );

  if (
    isCurrentAvatarRenderToken(
      avatarRoot,
      renderToken
    )
  ) {
    emitAvatarEvent(
      events,
      AVATAR_FALLBACK_EVENT,
      {
        mode:
          "fallback",

        reason,
        displayName,
        username,
        authenticated,
        hasAvatarUrl:
          false,
      }
    );
  }

  return true;
}

function applyAvatarImageVisible({
  avatarRoot,
  imgEl,
  fallbackEl,
  avatarAlt,
  displayName,
  username,
  authenticated,
  events,
  renderToken,
} = {}) {
  if (
    !avatarRoot ||
    !imgEl ||
    !isCurrentAvatarRenderToken(
      avatarRoot,
      renderToken
    )
  ) {
    return false;
  }

  try {
    imgEl.hidden =
      false;
  } catch {}

  safeSetAttr(
    imgEl,
    "aria-hidden",
    "false"
  );

  if (fallbackEl) {
    try {
      fallbackEl.hidden =
        true;
    } catch {}

    safeSetAttr(
      fallbackEl,
      "aria-hidden",
      "true"
    );
  }

  if (!isImageElement(avatarRoot)) {
    safeToggleClass(
      avatarRoot,
      "has-image",
      true
    );

    safeToggleClass(
      avatarRoot,
      "has-fallback",
      false
    );

    safeToggleClass(
      avatarRoot,
      "is-loading",
      false
    );
  }

  setAvatarRootMeta(
    avatarRoot,
    {
      avatarAlt,
      displayName,
      username,
      authenticated,
      mode:
        "image",
    }
  );

  safeDatasetSet(
    avatarRoot,
    "avatarState",
    "loaded"
  );

  emitAvatarEvent(
    events,
    AVATAR_LOAD_EVENT,
    {
      mode:
        "image",

      displayName,
      username,
      authenticated,
      hasAvatarUrl:
        true,
    }
  );

  return true;
}

function renderAvatarImage(
  avatarRoot,
  {
    avatarUrl = "",
    avatarAlt = DEFAULT_USER_NAME,
    displayName = DEFAULT_USER_NAME,
    avatarText = DEFAULT_AVATAR_TEXT,
    username = "",
    authenticated = false,
    idPrefix = "sidebar",
    events = null,
  } = {}
) {
  if (!avatarRoot) {
    return false;
  }

  const safeUrl =
    safeText(avatarUrl, "");

  if (!isValidAvatarUrl(safeUrl)) {
    return renderAvatarFallback(
      avatarRoot,
      {
        avatarText,
        avatarAlt,
        displayName,
        username,
        authenticated,
        idPrefix,
        events,
        reason:
          "invalid-url",
      }
    );
  }

  cleanupDuplicateAvatarNodes(
    avatarRoot
  );

  const renderToken =
    getNextAvatarRenderToken(
      avatarRoot
    );

  const cleanAvatarText =
    normalizeAvatarText(
      avatarText
    );

  const imgEl =
    ensureAvatarImageNode(
      avatarRoot,
      idPrefix
    );

  const fallbackEl =
    ensureAvatarFallbackNode(
      avatarRoot,
      cleanAvatarText,
      idPrefix
    );

  if (!imgEl) {
    return renderAvatarFallback(
      avatarRoot,
      {
        avatarText:
          cleanAvatarText,
        avatarAlt,
        displayName,
        username,
        authenticated,
        idPrefix,
        events,
        reason:
          "missing-image-node",
      }
    );
  }

  if (!isImageElement(avatarRoot)) {
    safeToggleClass(
      avatarRoot,
      "is-loading",
      true
    );
  }

  safeDatasetSet(
    avatarRoot,
    "avatarState",
    "loading"
  );

  safeDatasetSet(
    avatarRoot,
    "avatarMode",
    "image"
  );

  setAvatarRootMeta(
    avatarRoot,
    {
      avatarAlt,
      displayName,
      username,
      authenticated,
      mode:
        "image",
    }
  );

  if (fallbackEl) {
    fallbackEl.hidden =
      false;

    safeSetAttr(
      fallbackEl,
      "aria-hidden",
      "false"
    );

    safeSetText(
      fallbackEl,
      cleanAvatarText
    );
  }

  try {
    imgEl.loading =
      "eager";

    imgEl.decoding =
      "async";

    imgEl.draggable =
      false;

    imgEl.referrerPolicy =
      "no-referrer";

    imgEl.alt =
      avatarAlt;

    imgEl.hidden =
      true;

    safeSetAttr(
      imgEl,
      "aria-hidden",
      "true"
    );

    imgEl.onload =
      () => {
        applyAvatarImageVisible({
          avatarRoot,
          imgEl,
          fallbackEl,
          avatarAlt,
          displayName,
          username,
          authenticated,
          events,
          renderToken,
        });
      };

    imgEl.onerror =
      () => {
        if (
          !isCurrentAvatarRenderToken(
            avatarRoot,
            renderToken
          )
        ) {
          return;
        }

        emitAvatarEvent(
          events,
          AVATAR_ERROR_EVENT,
          {
            displayName,
            username,
            authenticated,
            hasAvatarUrl:
              true,
          }
        );

        renderAvatarFallback(
          avatarRoot,
          {
            avatarText:
              cleanAvatarText,
            avatarAlt,
            displayName,
            username,
            authenticated,
            idPrefix,
            events,
            reason:
              "image-error",
          }
        );
      };

    if (imgEl.src !== safeUrl) {
      imgEl.src =
        safeUrl;
    }
  } catch {
    return renderAvatarFallback(
      avatarRoot,
      {
        avatarText:
          cleanAvatarText,
        avatarAlt,
        displayName,
        username,
        authenticated,
        idPrefix,
        events,
        reason:
          "render-error",
      }
    );
  }

  removeNativeTooltip(
    imgEl
  );

  nextFrame(() => {
    try {
      if (
        imgEl.complete &&
        imgEl.naturalWidth > 0
      ) {
        applyAvatarImageVisible({
          avatarRoot,
          imgEl,
          fallbackEl,
          avatarAlt,
          displayName,
          username,
          authenticated,
          events,
          renderToken,
        });
      }
    } catch {}
  });

  return true;
}

/* =========================================================
   USER UI DATA
========================================================= */

function hasRealUser(user = null) {
  if (!user || !isObject(user)) {
    return false;
  }

  if (
    user.active === false ||
    user.disabled === true ||
    user.deleted === true ||
    user.status === "disabled" ||
    user.status === "inactive" ||
    user.estado === "disabled" ||
    user.estado === "inactive"
  ) {
    return false;
  }

  return Boolean(
    safeText(user.id, "") ||
      safeText(user.userId, "") ||
      safeText(user.user_id, "") ||
      safeText(user._id, "") ||
      safeText(user.uid, "") ||
      safeText(user.username, "") ||
      safeText(user.email, "") ||
      safeText(user.name, "") ||
      safeText(user.displayName, "")
  );
}

function resolveUserUiData(state = {}) {
  const root =
    safeObject(state);

  const authenticated =
    Boolean(root.authenticated);

  const user =
    authenticated && hasRealUser(root.user)
      ? root.user
      : null;

  const displayName =
    authenticated && user
      ? safeGetUserDisplayName(user) || DEFAULT_USER_NAME
      : DEFAULT_USER_NAME;

  const username =
    authenticated && user
      ? safeGetUserUsername(user) || ""
      : "";

  const role =
    authenticated
      ? safeText(
          root.role ||
            user?.role ||
            user?.rol ||
            "",
          ""
        )
      : "";

  const avatarUrl =
    authenticated && user
      ? safeGetUserAvatarUrl(user)
      : "";

  const avatarText =
    normalizeAvatarText(
      safeGetInitials(displayName) ||
      (
        username
          ? username.slice(0, 2).toUpperCase()
          : DEFAULT_AVATAR_TEXT
      )
    );

  const avatarAlt =
    `${safeTranslate(
      "common.user",
      {},
      "Usuario"
    )} ${displayName}`;

  return {
    user,
    authenticated,
    hasUser:
      Boolean(user),
    displayName,
    username,
    role,
    avatarUrl,
    avatarText,
    avatarAlt,
  };
}

/* =========================================================
   USER NODE SYNC
========================================================= */

function syncTextUserNode(node, {
  displayName,
  username,
  role,
  authenticated,
} = {}) {
  if (!node) {
    return false;
  }

  safeSetText(
    node,
    displayName
  );

  safeDatasetSet(
    node,
    "username",
    username
  );

  safeDatasetSet(
    node,
    "role",
    role
  );

  safeDatasetSet(
    node,
    "authenticated",
    authenticated ? "true" : "false"
  );

  removeNativeTooltip(
    node
  );

  return true;
}

function syncSidebarName(dom, data = {}) {
  const sidebarName =
    dom?.sidebarName ||
    resolveDomNode(
      dom,
      "sidebarName",
      USER_NAME_SELECTORS
    );

  return syncTextUserNode(
    sidebarName,
    data
  );
}

function syncTopbarUserName(dom, data = {}) {
  const topbarUserName =
    dom?.topbarUserName ||
    resolveDomNode(
      dom,
      "topbarUserName",
      TOPBAR_USER_NAME_SELECTORS
    );

  return syncTextUserNode(
    topbarUserName,
    data
  );
}

function syncAvatarRoot(dom, key, selectors, idPrefix, data, events = null) {
  const avatarRoot =
    dom?.[key] ||
    resolveDomNode(
      dom,
      key,
      selectors
    );

  if (!avatarRoot) {
    return false;
  }

  const {
    avatarUrl,
    avatarText,
    avatarAlt,
    displayName,
    username,
    authenticated,
  } =
    data;

  if (!avatarUrl) {
    return renderAvatarFallback(
      avatarRoot,
      {
        avatarText,
        avatarAlt,
        displayName,
        username,
        authenticated,
        idPrefix,
        events,
        reason:
          authenticated
            ? "no-avatar-url"
            : "unauthenticated",
      }
    );
  }

  return renderAvatarImage(
    avatarRoot,
    {
      avatarUrl,
      avatarAlt,
      displayName,
      avatarText,
      username,
      authenticated,
      idPrefix,
      events,
    }
  );
}

function syncSidebarAvatar(dom, data, events = null) {
  return syncAvatarRoot(
    dom,
    "sidebarAvatar",
    AVATAR_SELECTORS.root,
    "sidebar",
    data,
    events
  );
}

function syncTopbarAvatar(dom, data, events = null) {
  return syncAvatarRoot(
    dom,
    "topbarAvatar",
    AVATAR_SELECTORS.topbarRoot,
    "topbar",
    data,
    events
  );
}

function syncUserToggle(dom, data) {
  const toggle =
    dom?.userToggle ||
    resolveDomNode(
      dom,
      "userToggle",
      USER_TOGGLE_SELECTORS
    );

  if (!toggle) {
    return false;
  }

  safeSetAttr(
    toggle,
    "aria-label",
    data.displayName
  );

  safeDatasetSet(
    toggle,
    "username",
    data.username
  );

  safeDatasetSet(
    toggle,
    "role",
    data.role
  );

  safeDatasetSet(
    toggle,
    "authenticated",
    data.authenticated ? "true" : "false"
  );

  safeSetAttr(
    toggle,
    "aria-haspopup",
    "menu"
  );

  removeNativeTooltip(
    toggle
  );

  return true;
}

function syncUserDropdown(dom, data) {
  const dropdown =
    dom?.userDropdown ||
    resolveDomNode(
      dom,
      "userDropdown",
      USER_DROPDOWN_SELECTORS
    );

  if (!dropdown) {
    return false;
  }

  safeDatasetSet(
    dropdown,
    "username",
    data.username
  );

  safeDatasetSet(
    dropdown,
    "role",
    data.role
  );

  safeDatasetSet(
    dropdown,
    "authenticated",
    data.authenticated ? "true" : "false"
  );

  return true;
}

function syncLogoutButton(dom, data) {
  const logoutBtn =
    dom?.logoutBtn ||
    resolveDomNode(
      dom,
      "logoutBtn",
      LOGOUT_SELECTORS
    );

  if (!logoutBtn) {
    return false;
  }

  safeDatasetSet(
    logoutBtn,
    "authenticated",
    data.authenticated ? "true" : "false"
  );

  removeNativeTooltip(
    logoutBtn
  );

  return true;
}

export function recacheUserNodes(dom, events = null) {
  if (!dom) {
    return {};
  }

  const result =
    {};

  for (const [key, selectors] of Object.entries(USER_NODE_MAP)) {
    result[key] =
      Boolean(
        resolveDomNode(
          dom,
          key,
          selectors
        )
      );
  }

  safeEmit(
    events,
    USER_RECACHE_EVENT,
    {
      nodes:
        result,

      at:
        safeNowIso(),
    }
  );

  return result;
}

export function syncUserUI(input = {}) {
  const args =
    normalizeSyncArgs(input);

  const {
    state,
    dom,
    events,
    recache = true,
  } =
    args;

  if (recache !== false) {
    recacheUserNodes(
      dom,
      events
    );
  }

  const data =
    resolveUserUiData(state);

  const synced = {
    sidebarName:
      syncSidebarName(
        dom,
        data
      ),

    sidebarAvatar:
      syncSidebarAvatar(
        dom,
        data,
        events
      ),

    topbarUserName:
      syncTopbarUserName(
        dom,
        data
      ),

    topbarAvatar:
      syncTopbarAvatar(
        dom,
        data,
        events
      ),

    userToggle:
      syncUserToggle(
        dom,
        data
      ),

    userDropdown:
      syncUserDropdown(
        dom,
        data
      ),

    logoutBtn:
      syncLogoutButton(
        dom,
        data
      ),
  };

  const payload = {
    displayName:
      data.displayName,

    username:
      data.username || null,

    role:
      data.role || null,

    authenticated:
      data.authenticated,

    hasUser:
      data.hasUser,

    avatarText:
      data.avatarText,

    hasAvatarUrl:
      Boolean(data.avatarUrl),

    synced,

    version:
      UI_VERSION,

    at:
      safeNowIso(),
  };

  safeEmit(
    events,
    USER_UI_EVENT,
    payload
  );

  return payload;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getElementState(el) {
  if (!el) {
    return {
      exists:
        false,
    };
  }

  let className =
    "";

  try {
    className =
      typeof el.className === "string"
        ? el.className
        : el.className?.baseVal || "";
  } catch {}

  return {
    exists:
      true,

    connected:
      isConnected(el),

    tag:
      safeText(
        el.tagName,
        ""
      ).toLowerCase(),

    id:
      safeText(
        el.id,
        ""
      ),

    className:
      safeText(
        className,
        ""
      ),

    hidden:
      Boolean(el.hidden),

    ariaHidden:
      safeText(
        el.getAttribute?.("aria-hidden"),
        ""
      ),

    ariaBusy:
      safeText(
        el.getAttribute?.("aria-busy"),
        ""
      ),

    text:
      safeText(
        el.textContent,
        ""
      ).slice(0, 80),

    dataset: {
      avatarMode:
        el.dataset?.avatarMode || "",

      avatarState:
        el.dataset?.avatarState || "",

      authenticated:
        el.dataset?.authenticated || "",

      username:
        el.dataset?.username || "",
    },
  };
}

function getAvatarSnapshot(root) {
  const avatarNodes =
    getAvatarNodes(root);

  return {
    root:
      getElementState(root),

    image:
      getElementState(
        avatarNodes.imgEl
      ),

    fallback:
      getElementState(
        avatarNodes.fallbackEl
      ),

    mode:
      safeText(
        root?.dataset?.avatarMode,
        ""
      ),

    state:
      safeText(
        root?.dataset?.avatarState,
        ""
      ),
  };
}

export function getUiSnapshot({
  state,
  dom,
} = {}) {
  const data =
    resolveUserUiData(state);

  const sidebarAvatarRoot =
    dom?.sidebarAvatar ||
    queryFirst(
      AVATAR_SELECTORS.root
    );

  const topbarAvatarRoot =
    dom?.topbarAvatar ||
    queryFirst(
      AVATAR_SELECTORS.topbarRoot
    );

  return {
    version:
      UI_VERSION,

    title:
      isBrowser()
        ? safeText(document.title, "")
        : "",

    config: {
      appName:
        safeText(config?.appName, DEFAULT_TITLE),

      defaultLang:
        safeText(config?.defaultLang, "es"),

      defaultTheme:
        safeText(config?.defaultTheme, "dark"),

      syncUserUIOnAuthChange:
        safeBool(
          getConfigValue(
            "ui.syncUserUIOnAuthChange",
            true
          ),
          true
        ),
    },

    user: {
      authenticated:
        data.authenticated,

      hasUser:
        data.hasUser,

      displayName:
        data.displayName,

      username:
        data.username || null,

      role:
        data.role || null,

      avatarText:
        data.avatarText,

      hasAvatarUrl:
        Boolean(data.avatarUrl),
    },

    dom: {
      hasTopbarTitle:
        Boolean(dom?.topbarTitle),

      hasSidebarName:
        Boolean(dom?.sidebarName),

      hasSidebarAvatar:
        Boolean(dom?.sidebarAvatar),

      hasTopbarUserName:
        Boolean(dom?.topbarUserName),

      hasTopbarAvatar:
        Boolean(dom?.topbarAvatar),

      hasUserToggle:
        Boolean(dom?.userToggle),

      hasUserDropdown:
        Boolean(dom?.userDropdown),

      hasLogoutBtn:
        Boolean(dom?.logoutBtn),

      hasTopbarViewContainer:
        Boolean(dom?.topbarViewContainer),

      hasTableheadContainer:
        Boolean(dom?.tableheadContainer),
    },

    avatar: {
      sidebar:
        getAvatarSnapshot(
          sidebarAvatarRoot
        ),

      topbar:
        getAvatarSnapshot(
          topbarAvatarRoot
        ),
    },

    at:
      safeNowIso(),
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export {
  UI_VERSION,
  USER_UI_EVENT,
  TITLE_EVENT,
  DYNAMIC_CLEARED_EVENT,
};

export default {
  UI_VERSION,

  setDocumentTitle,
  clearDynamicContainers,

  recacheUserNodes,
  syncUserUI,

  getUiSnapshot,
};
