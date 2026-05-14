/* =========================================================
   Onion SPA - Core UI
   Archivo: src/core/ui.js

   ONION SUPPORT · CORE UI
   GLOBAL UI HELPERS · USER VISUAL SYNC · AVATAR SAFE · 15/10

   RESPONSABILIDADES:
   - helpers UI globales del Core
   - sincronizar título documento
   - limpiar contenedores dinámicos shell
   - sincronizar bloque visual usuario
   - refresco reactivo con i18n
   - pintar avatar robusto en sidebar/topbar sin romper fallback

   FIX CRÍTICO:
   - no destruir la estructura DOM del avatar del sidebar
   - respetar #sidebarAvatarImage y #sidebarAvatarFallback
   - soportar avatarRoot como contenedor o como <img>
   - si falta root, resolverlo desde imagen/fallback existentes
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
   - recache DOM ligero si UI montó tarde
   - eventos consistentes
   - snapshots útiles
   - protección contra onload/onerror obsoletos
   - sin innerHTML
   - sin estilos inline
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
  "15.0.0-avatar-safe";

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

const USER_DEFERRED_SYNC_EVENT =
  "app:user-ui:deferred-sync";

const AVATAR_RENDER_TOKENS =
  new WeakMap();

let deferredUserSyncScheduled =
  false;

const SIDEBAR_SCOPE_SELECTORS =
  Object.freeze([
    "#sidebar",
    "#app-sidebar",
    "#sidebar-mount",
    "[data-sidebar]",
    "[data-sidebar-mount]",
    ".sidebar",
    ".app-sidebar",
  ]);

const TOPBAR_SCOPE_SELECTORS =
  Object.freeze([
    "#topbar",
    "#app-topbar",
    "#topbar-mount",
    "[data-topbar]",
    "[data-topbar-mount]",
    ".topbar",
    ".app-topbar",
  ]);

const AVATAR_SELECTORS =
  Object.freeze({
    sidebarRoot:
      Object.freeze([
        "#sidebar-avatar",
        "#sidebarAvatar",
        "[data-sidebar-avatar='true']",
        "[data-sidebar-avatar]",
        "[data-user-avatar='sidebar']",
        "[data-user-avatar]",
        ".sidebar-avatar",
        ".user-avatar",
      ]),

    topbarRoot:
      Object.freeze([
        "#topbar-avatar",
        "#topbarAvatar",
        "[data-topbar-avatar='true']",
        "[data-topbar-avatar]",
        "[data-user-avatar='topbar']",
        "[data-user-avatar-topbar]",
        ".topbar-avatar",
      ]),

    sidebarImage:
      Object.freeze([
        "#sidebarAvatarImage",
        "img[data-sidebar-avatar-image='true']",
        "[data-sidebar-avatar-image]",
        "img[data-avatar-image='sidebar']",
        ".sidebar-avatar img",
        ".sidebar-avatar__image",
        ".avatar-image",
        "img[data-avatar-image='true']",
        "[data-avatar-image]",
        "img",
      ]),

    topbarImage:
      Object.freeze([
        "#topbarAvatarImage",
        "img[data-topbar-avatar-image='true']",
        "[data-topbar-avatar-image]",
        "img[data-avatar-image='topbar']",
        ".topbar-avatar img",
        ".topbar-avatar__image",
        ".avatar-image",
        "img[data-avatar-image='true']",
        "[data-avatar-image]",
        "img",
      ]),

    sidebarFallback:
      Object.freeze([
        "#sidebarAvatarFallback",
        "[data-sidebar-avatar-fallback='true']",
        "[data-sidebar-avatar-fallback]",
        "[data-avatar-fallback='sidebar']",
        ".sidebar-avatar-fallback",
        ".sidebar-avatar__fallback",
        ".avatar-fallback",
        "[data-avatar-fallback='true']",
        "[data-avatar-fallback]",
      ]),

    topbarFallback:
      Object.freeze([
        "#topbarAvatarFallback",
        "[data-topbar-avatar-fallback='true']",
        "[data-topbar-avatar-fallback]",
        "[data-avatar-fallback='topbar']",
        ".topbar-avatar-fallback",
        ".topbar-avatar__fallback",
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
    "[data-user-name='sidebar']",
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
    "[data-user-name='topbar']",
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
    topbarViewContainer:
      Object.freeze([
        "#topbarview-container",
        "#topbar-view-container",
        "[data-topbar-view-container='true']",
        "[data-topbar-view-container]",
        ".topbar-view-container",
      ]),

    tableheadContainer:
      Object.freeze([
        "#tablehead-container",
        "#table-head-container",
        "[data-tablehead-container='true']",
        "[data-tablehead-container]",
        "[data-table-head-container]",
        ".tablehead-container",
      ]),

    tablehead:
      Object.freeze([
        "#table-head",
        "#tablehead",
        ".table-head",
        ".tablehead",
        "[data-tablehead]",
        "[data-table-head]",
      ]),

    viewContainer:
      Object.freeze([
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
      AVATAR_SELECTORS.sidebarRoot,

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
  if (value === 1) return true;
  if (value === 0) return false;

  if (typeof value === "string") {
    const clean =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
      ].includes(clean)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(clean)
    ) {
      return false;
    }
  }

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

function sanitizeEventPayload(value, depth = 0, keyHint = "") {
  if (depth > 4) {
    return "[depth-limit]";
  }

  if (
    /token|authorization|cookie|password|secret|credential|session|jwt|bearer|refresh|access|otp|mfa|2fa|code|avatarUrl|avatar_url|signedUrl|signed_url|sas|blobUrl|downloadUrl|viewUrl/i.test(
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

function safeSetText(el, value = "") {
  if (!el) {
    return false;
  }

  try {
    const next =
      safeText(value, "");

    if (el.textContent !== next) {
      el.textContent =
        next;
    }

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
    } else if (
      el.getAttribute(name) !== String(value)
    ) {
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
    } else if (
      el.dataset[key] !== String(value)
    ) {
      el.dataset[key] =
        String(value);
    }

    return true;
  } catch {}

  return false;
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

function queryFirstInScopes(selectors = [], scopes = []) {
  for (const scope of safeArray(scopes)) {
    if (!scope || !isConnected(scope)) {
      continue;
    }

    const found =
      queryFirst(
        selectors,
        scope
      );

    if (found) {
      return found;
    }
  }

  return queryFirst(selectors);
}

function getScopeNodes(dom, kind = "sidebar") {
  if (!isBrowser()) {
    return [];
  }

  const nodes =
    [];

  if (kind === "sidebar") {
    nodes.push(
      dom?.sidebar,
      dom?.sidebarRoot,
      dom?.sidebarMount,
      queryFirst(SIDEBAR_SCOPE_SELECTORS)
    );
  } else if (kind === "topbar") {
    nodes.push(
      dom?.topbar,
      dom?.topbarRoot,
      dom?.topbarMount,
      queryFirst(TOPBAR_SCOPE_SELECTORS)
    );
  }

  return nodes.filter((node, index, arr) =>
    node &&
    isConnected(node) &&
    arr.indexOf(node) === index
  );
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
    root
      ? queryFirst(
          selectors,
          root
        )
      : queryFirst(
          selectors
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

function resolveScopedDomNode(dom, key, selectors = [], kind = "") {
  const cached =
    dom?.[key] || null;

  if (
    cached &&
    isConnected(cached)
  ) {
    return cached;
  }

  const scopes =
    kind
      ? getScopeNodes(dom, kind)
      : [];

  const found =
    scopes.length
      ? queryFirstInScopes(
          selectors,
          scopes
        )
      : queryFirst(selectors);

  try {
    if (
      found &&
      dom &&
      key
    ) {
      dom[key] =
        found;
      dom[`${key}El`] =
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
    Regla Onion:
    - eliminar title nativo
    - NO tocar data-tooltip custom
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
    resolveScopedDomNode(
      dom,
      "topbarTitle",
      TOPBAR_TITLE_SELECTORS,
      "topbar"
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
    dom?.[`${key}El`] ||
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
    (
      cleared.includes("tableheadContainer") ||
      includeTablehead !== false
    )
  ) {
    const tablehead =
      dom?.tablehead ||
      dom?.tableHead ||
      dom?.tableheadEl ||
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

function getAvatarSelectors(idPrefix = "sidebar") {
  const prefix =
    safeText(idPrefix, "sidebar")
      .toLowerCase();

  if (prefix === "topbar") {
    return {
      root:
        AVATAR_SELECTORS.topbarRoot,
      image:
        AVATAR_SELECTORS.topbarImage,
      fallback:
        AVATAR_SELECTORS.topbarFallback,
      kind:
        "topbar",
    };
  }

  return {
    root:
      AVATAR_SELECTORS.sidebarRoot,
    image:
      AVATAR_SELECTORS.sidebarImage,
    fallback:
      AVATAR_SELECTORS.sidebarFallback,
    kind:
      "sidebar",
  };
}

function getAvatarNodes(avatarRoot, idPrefix = "sidebar") {
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

  const selectors =
    getAvatarSelectors(idPrefix);

  const imgEl =
    queryFirst(
      selectors.image,
      avatarRoot
    );

  const fallbackEl =
    queryFirst(
      selectors.fallback,
      avatarRoot
    );

  return {
    imgEl,
    fallbackEl,
  };
}

function resolveAvatarRoot(dom, key, idPrefix = "sidebar") {
  const cached =
    dom?.[key] || null;

  if (
    cached &&
    isConnected(cached)
  ) {
    return cached;
  }

  const selectors =
    getAvatarSelectors(idPrefix);

  const scopes =
    getScopeNodes(
      dom,
      selectors.kind
    );

  let root =
    scopes.length
      ? queryFirstInScopes(
          selectors.root,
          scopes
        )
      : queryFirst(
          selectors.root
        );

  if (!root) {
    const image =
      scopes.length
        ? queryFirstInScopes(
            selectors.image,
            scopes
          )
        : queryFirst(
            selectors.image
          );

    const fallback =
      scopes.length
        ? queryFirstInScopes(
            selectors.fallback,
            scopes
          )
        : queryFirst(
            selectors.fallback
          );

    if (
      image?.parentElement &&
      fallback?.parentElement &&
      image.parentElement === fallback.parentElement
    ) {
      root =
        image.parentElement;
    } else if (image?.parentElement) {
      root =
        image.parentElement;
    } else if (fallback?.parentElement) {
      root =
        fallback.parentElement;
    } else {
      root =
        image ||
        fallback ||
        null;
    }
  }

  try {
    if (
      root &&
      dom &&
      key
    ) {
      dom[key] =
        root;
      dom[`${key}El`] =
        root;
    }
  } catch {}

  return root;
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
    getAvatarNodes(
      avatarRoot,
      idPrefix
    );

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

  if (!created.id) {
    created.id =
      idPrefix === "topbar"
        ? "topbarAvatarImage"
        : "sidebarAvatarImage";
  }

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
    getAvatarNodes(
      avatarRoot,
      idPrefix
    );

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

  if (!created.id) {
    created.id =
      idPrefix === "topbar"
        ? "topbarAvatarFallback"
        : "sidebarAvatarFallback";
  }

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

function cleanupDuplicateAvatarNodes(avatarRoot, idPrefix = "sidebar") {
  if (
    !avatarRoot ||
    isImageElement(avatarRoot)
  ) {
    return false;
  }

  const selectors =
    getAvatarSelectors(idPrefix);

  const images =
    queryAll(
      selectors.image,
      avatarRoot
    );

  const fallbacks =
    queryAll(
      selectors.fallback,
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
    avatarRoot,
    idPrefix
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
    try {
      fallbackEl.hidden =
        false;
    } catch {}

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
    avatarRoot,
    idPrefix
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
    try {
      fallbackEl.hidden =
        false;
    } catch {}

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

function normalizeStatus(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .trim();
}

function hasRealUser(user = null) {
  if (!user || !isObject(user)) {
    return false;
  }

  const status =
    normalizeStatus(
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

function resolveUserUiData(state = {}) {
  const root =
    safeObject(state);

  const authenticated =
    Boolean(root.authenticated);

  const candidateUser =
    root.user ||
    root.currentUser ||
    root.authUser ||
    root.sessionUser ||
    root.session?.user ||
    root.sessionData?.user ||
    null;

  const user =
    authenticated && hasRealUser(candidateUser)
      ? candidateUser
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
    authenticated && user
      ? safeText(
          root.role ||
            root.userRole ||
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
    resolveScopedDomNode(
      dom,
      "sidebarName",
      USER_NAME_SELECTORS,
      "sidebar"
    );

  return syncTextUserNode(
    sidebarName,
    data
  );
}

function syncTopbarUserName(dom, data = {}) {
  const topbarUserName =
    dom?.topbarUserName ||
    resolveScopedDomNode(
      dom,
      "topbarUserName",
      TOPBAR_USER_NAME_SELECTORS,
      "topbar"
    );

  return syncTextUserNode(
    topbarUserName,
    data
  );
}

function syncAvatarRoot(dom, key, idPrefix, data, events = null) {
  const avatarRoot =
    resolveAvatarRoot(
      dom,
      key,
      idPrefix
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
    "sidebar",
    data,
    events
  );
}

function syncTopbarAvatar(dom, data, events = null) {
  return syncAvatarRoot(
    dom,
    "topbarAvatar",
    "topbar",
    data,
    events
  );
}

function syncUserToggle(dom, data) {
  const toggle =
    dom?.userToggle ||
    resolveScopedDomNode(
      dom,
      "userToggle",
      USER_TOGGLE_SELECTORS,
      "sidebar"
    ) ||
    resolveScopedDomNode(
      dom,
      "userToggle",
      USER_TOGGLE_SELECTORS,
      "topbar"
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
    resolveScopedDomNode(
      dom,
      "userDropdown",
      USER_DROPDOWN_SELECTORS,
      "sidebar"
    ) ||
    resolveScopedDomNode(
      dom,
      "userDropdown",
      USER_DROPDOWN_SELECTORS,
      "topbar"
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
    resolveScopedDomNode(
      dom,
      "logoutBtn",
      LOGOUT_SELECTORS,
      "sidebar"
    ) ||
    resolveScopedDomNode(
      dom,
      "logoutBtn",
      LOGOUT_SELECTORS,
      "topbar"
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

/* =========================================================
   RECACHE
========================================================= */

export function recacheUserNodes(dom, events = null) {
  if (!dom) {
    return {};
  }

  const result =
    {};

  result.sidebarName =
    Boolean(
      resolveScopedDomNode(
        dom,
        "sidebarName",
        USER_NAME_SELECTORS,
        "sidebar"
      )
    );

  result.sidebarAvatar =
    Boolean(
      resolveAvatarRoot(
        dom,
        "sidebarAvatar",
        "sidebar"
      )
    );

  result.topbarUserName =
    Boolean(
      resolveScopedDomNode(
        dom,
        "topbarUserName",
        TOPBAR_USER_NAME_SELECTORS,
        "topbar"
      )
    );

  result.topbarAvatar =
    Boolean(
      resolveAvatarRoot(
        dom,
        "topbarAvatar",
        "topbar"
      )
    );

  result.userToggle =
    Boolean(
      resolveScopedDomNode(
        dom,
        "userToggle",
        USER_TOGGLE_SELECTORS,
        "sidebar"
      ) ||
      resolveScopedDomNode(
        dom,
        "userToggle",
        USER_TOGGLE_SELECTORS,
        "topbar"
      )
    );

  result.userDropdown =
    Boolean(
      resolveScopedDomNode(
        dom,
        "userDropdown",
        USER_DROPDOWN_SELECTORS,
        "sidebar"
      ) ||
      resolveScopedDomNode(
        dom,
        "userDropdown",
        USER_DROPDOWN_SELECTORS,
        "topbar"
      )
    );

  result.logoutBtn =
    Boolean(
      resolveScopedDomNode(
        dom,
        "logoutBtn",
        LOGOUT_SELECTORS,
        "sidebar"
      ) ||
      resolveScopedDomNode(
        dom,
        "logoutBtn",
        LOGOUT_SELECTORS,
        "topbar"
      )
    );

  result.topbarTitle =
    Boolean(
      resolveScopedDomNode(
        dom,
        "topbarTitle",
        TOPBAR_TITLE_SELECTORS,
        "topbar"
      )
    );

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

function shouldScheduleDeferredSync(synced = {}) {
  return !(
    synced.sidebarName ||
    synced.sidebarAvatar ||
    synced.topbarUserName ||
    synced.topbarAvatar ||
    synced.userToggle
  );
}

function scheduleDeferredUserSync(args = {}) {
  if (
    deferredUserSyncScheduled ||
    !isBrowser()
  ) {
    return false;
  }

  deferredUserSyncScheduled =
    true;

  nextFrame(() => {
    deferredUserSyncScheduled =
      false;

    safeEmit(
      args.events,
      USER_DEFERRED_SYNC_EVENT,
      {
        reason:
          "nodes-mounted-late",

        at:
          safeNowIso(),
      }
    );

    try {
      syncUserUI({
        ...args,
        recache:
          true,
        deferIfMissing:
          false,
      });
    } catch {}
  });

  return true;
}

/* =========================================================
   SYNC USER UI
========================================================= */

export function syncUserUI(input = {}) {
  const args =
    normalizeSyncArgs(input);

  const {
    state,
    dom,
    events,
    recache = true,
    deferIfMissing = true,
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

  if (
    deferIfMissing !== false &&
    shouldScheduleDeferredSync(synced)
  ) {
    scheduleDeferredUserSync(args);
  }

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

function getAvatarSnapshot(root, idPrefix = "sidebar") {
  const avatarNodes =
    getAvatarNodes(
      root,
      idPrefix
    );

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
    resolveAvatarRoot(
      dom,
      "sidebarAvatar",
      "sidebar"
    );

  const topbarAvatarRoot =
    dom?.topbarAvatar ||
    resolveAvatarRoot(
      dom,
      "topbarAvatar",
      "topbar"
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
          sidebarAvatarRoot,
          "sidebar"
        ),

      topbar:
        getAvatarSnapshot(
          topbarAvatarRoot,
          "topbar"
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
