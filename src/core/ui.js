/* =========================================================
   Onion SPA - Core UI
   Archivo: src/core/ui.js

   RESPONSABILIDADES:
   - helpers UI globales del core
   - sincronizar título documento
   - limpiar contenedores dinámicos shell
   - sincronizar bloque visual usuario
   - refresco reactivo con i18n
   - pintar avatar robusto en sidebar sin romper fallback

   FIX CRÍTICO:
   - no destruir la estructura DOM del avatar del sidebar
   - respetar #sidebarAvatarImage y #sidebarAvatarFallback
   - evitar innerHTML/textContent sobre el root del avatar
   - evitar title nativo en avatar/nombre
   - mantener data-tooltip libre para tooltip custom si UI lo decide
   - no pintar usuario fantasma si state.authenticated=false

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
========================================================= */

import { config } from "./config.js";

import {
  getUserDisplayName,
  getUserUsername,
  getUserAvatarUrl,
  getInitials,
} from "./helpers.js";

/* =========================================================
   CONSTANTS
========================================================= */

const UI_VERSION =
  "10.1.0";

const DEFAULT_USER_NAME =
  "Usuario";

const DEFAULT_AVATAR_TEXT =
  "ON";

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

const AVATAR_SELECTORS =
  Object.freeze({
    root: [
      "#sidebar-avatar",
      "#sidebarAvatar",
      "[data-sidebar-avatar='true']",
      "[data-sidebar-avatar]",
      "[data-user-avatar]",
      ".sidebar-avatar",
      ".user-avatar",
    ],

    image: [
      "#sidebarAvatarImage",
      ".avatar-image",
      "img[data-avatar-image='true']",
      "[data-avatar-image]",
      "img",
    ],

    fallback: [
      "#sidebarAvatarFallback",
      ".avatar-fallback",
      "[data-avatar-fallback='true']",
      "[data-avatar-fallback]",
    ],
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

const USER_TOGGLE_SELECTORS =
  Object.freeze([
    "#userToggle",
    "#user-toggle",
    "[data-user-toggle='true']",
    "[data-user-toggle]",
    "[data-user-menu-toggle]",
  ]);

const TOPBAR_TITLE_SELECTORS =
  Object.freeze([
    "#topbar-title",
    "[data-topbar-title='true']",
    "[data-topbar-title]",
    ".topbar-title",
  ]);

const DYNAMIC_CONTAINER_KEYS =
  Object.freeze([
    "topbarViewContainer",
    "tableheadContainer",
  ]);

const DYNAMIC_CONTAINER_SELECTORS =
  Object.freeze({
    topbarViewContainer: [
      "#topbarview-container",
      "#topbar-view-container",
      "[data-topbar-view-container='true']",
      "[data-topbar-view-container]",
      ".topbar-view-container",
    ],

    tableheadContainer: [
      "#tablehead-container",
      "#table-head-container",
      "[data-tablehead-container='true']",
      "[data-tablehead-container]",
      "[data-table-head-container]",
      ".tablehead-container",
    ],

    viewContainer: [
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
    ],
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
  return isObject(value)
    ? value
    : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === "true") return true;
  if (value === "false") return false;

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

function safeEmit(events, eventName, payload = {}) {
  try {
    events?.emit?.(
      eventName,
      payload
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
    try {
      const found =
        scope.querySelector?.(
          selector
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
    try {
      const nodes =
        Array.from(
          scope.querySelectorAll?.(
            selector
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

function isValidAvatarUrl(value = "") {
  const url =
    safeText(value, "");

  if (!url) {
    return false;
  }

  if (/^(javascript|vbscript):/i.test(url)) {
    return false;
  }

  return true;
}

function removeNativeTooltip(el) {
  safeRemoveAttr(
    el,
    "title"
  );

  return true;
}

/* =========================================================
   I18N
========================================================= */

function getI18nFromRuntime() {
  try {
    return window?.OnionI18n || window?.I18n || null;
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
   DOCUMENT TITLE
========================================================= */

function normalizeTitle(value = "", fallback = config.appName || "Onion Support") {
  return safeText(
    value,
    fallback
  );
}

export function setDocumentTitle({
  dom,
  events,
  title = config.appName,
  titleKey = "",
  titleParams = {},
  suffix = "",
  updateTopbar = true,
  topbarTitle = "",
} = {}) {
  const baseTitle =
    normalizeTitle(
      title,
      config.appName || "Onion Support"
    );

  let finalTitle =
    baseTitle;

  if (titleKey) {
    finalTitle =
      safeTranslate(
        titleKey,
        titleParams,
        baseTitle
      );
  }

  const cleanSuffix =
    safeText(suffix, "");

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

  if (
    updateTopbar !== false &&
    topbarTitleNode
  ) {
    const topbarText =
      safeText(
        topbarTitle,
        finalTitle
      );

    safeSetText(
      topbarTitleNode,
      topbarText
    );

    removeNativeTooltip(
      topbarTitleNode
    );

    /*
      Evitamos forzar data-tooltip aquí.
      El tooltip custom lo debe gestionar su módulo.
    */
    safeRemoveAttr(
      topbarTitleNode,
      "data-tooltip"
    );
  }

  safeEmit(
    events,
    TITLE_EVENT,
    {
      title:
        finalTitle,

      topbarTitle:
        safeText(topbarTitle, "") || finalTitle,

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
    el.innerHTML =
      "";

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
    if (key && !keys.includes(key)) {
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

function ensureAvatarImageNode(avatarRoot) {
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
    "sidebarAvatarImage";

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

  /*
    No usamos innerHTML en el root.
    Se añade una única imagen controlada.
  */
  try {
    avatarRoot.appendChild(created);
  } catch {}

  return created;
}

function ensureAvatarFallbackNode(avatarRoot, avatarText = DEFAULT_AVATAR_TEXT) {
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
    "sidebarAvatarFallback";

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

  /*
    No destruimos estructura previa.
    Solo añadimos fallback si no existe.
  */
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

function setAvatarRootMeta(avatarRoot, avatarAlt, displayName, username = "") {
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

  removeNativeTooltip(
    avatarRoot
  );

  /*
    Regla del proyecto:
    evitamos tooltip nativo. El tooltip custom lo gestiona UI,
    no Core.
  */
  safeRemoveAttr(
    avatarRoot,
    "data-tooltip"
  );
}

function renderAvatarFallback(
  avatarRoot,
  avatarText,
  avatarAlt,
  displayName,
  username = "",
  events = null
) {
  if (!avatarRoot) {
    return false;
  }

  const cleanAvatarText =
    normalizeAvatarText(avatarText);

  const imgEl =
    ensureAvatarImageNode(avatarRoot);

  const fallbackEl =
    ensureAvatarFallbackNode(
      avatarRoot,
      cleanAvatarText
    );

  if (imgEl) {
    try {
      imgEl.hidden =
        true;

      imgEl.removeAttribute("src");

      imgEl.alt =
        avatarAlt;

      imgEl.onerror =
        null;

      imgEl.onload =
        null;
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
  }

  safeDatasetSet(
    avatarRoot,
    "avatarMode",
    "fallback"
  );

  setAvatarRootMeta(
    avatarRoot,
    avatarAlt,
    displayName,
    username
  );

  safeEmit(
    events,
    AVATAR_LOAD_EVENT,
    {
      mode:
        "fallback",

      displayName,
      username,
      at:
        safeNowIso(),
    }
  );

  return true;
}

function renderAvatarImage(
  avatarRoot,
  avatarUrl,
  avatarAlt,
  displayName,
  avatarText,
  username = "",
  events = null
) {
  if (!avatarRoot) {
    return false;
  }

  const safeUrl =
    safeText(avatarUrl, "");

  const cleanAvatarText =
    normalizeAvatarText(avatarText);

  if (!isValidAvatarUrl(safeUrl)) {
    return renderAvatarFallback(
      avatarRoot,
      cleanAvatarText,
      avatarAlt,
      displayName,
      username,
      events
    );
  }

  cleanupDuplicateAvatarNodes(
    avatarRoot
  );

  const imgEl =
    ensureAvatarImageNode(avatarRoot);

  const fallbackEl =
    ensureAvatarFallbackNode(
      avatarRoot,
      cleanAvatarText
    );

  if (!imgEl) {
    return renderAvatarFallback(
      avatarRoot,
      cleanAvatarText,
      avatarAlt,
      displayName,
      username,
      events
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

    imgEl.onload =
      () => {
        try {
          imgEl.hidden =
            false;

          safeSetAttr(
            imgEl,
            "aria-hidden",
            "false"
          );

          if (fallbackEl) {
            fallbackEl.hidden =
              true;

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
          }

          safeDatasetSet(
            avatarRoot,
            "avatarMode",
            "image"
          );

          safeEmit(
            events,
            AVATAR_LOAD_EVENT,
            {
              mode:
                "image",

              displayName,
              username,
              at:
                safeNowIso(),
            }
          );
        } catch {}
      };

    imgEl.onerror =
      () => {
        safeEmit(
          events,
          AVATAR_ERROR_EVENT,
          {
            avatarUrl:
              safeUrl,

            displayName,
            username,
            at:
              safeNowIso(),
          }
        );

        renderAvatarFallback(
          avatarRoot,
          cleanAvatarText,
          avatarAlt,
          displayName,
          username,
          events
        );
      };

    /*
      src al final para que onerror/onload ya estén armados.
    */
    imgEl.src =
      safeUrl;

    /*
      Optimista, pero si falla onerror revierte a fallback.
      Si ya está cacheada, onload puede disparar rápido.
    */
    imgEl.hidden =
      false;
  } catch {
    return renderAvatarFallback(
      avatarRoot,
      cleanAvatarText,
      avatarAlt,
      displayName,
      username,
      events
    );
  }

  safeSetAttr(
    imgEl,
    "aria-hidden",
    "false"
  );

  removeNativeTooltip(
    imgEl
  );

  if (fallbackEl) {
    fallbackEl.hidden =
      true;

    safeSetAttr(
      fallbackEl,
      "aria-hidden",
      "true"
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
      true
    );

    safeToggleClass(
      avatarRoot,
      "has-fallback",
      false
    );
  }

  safeDatasetSet(
    avatarRoot,
    "avatarMode",
    "image"
  );

  setAvatarRootMeta(
    avatarRoot,
    avatarAlt,
    displayName,
    username
  );

  return true;
}

/* =========================================================
   USER UI
========================================================= */

function resolveUserUiData(state = {}) {
  const user =
    state?.user ?? null;

  const authenticated =
    Boolean(state?.authenticated);

  const displayName =
    authenticated
      ? getUserDisplayName(user) || DEFAULT_USER_NAME
      : DEFAULT_USER_NAME;

  const username =
    authenticated
      ? getUserUsername(user) || ""
      : "";

  const avatarUrl =
    authenticated
      ? getUserAvatarUrl(user)
      : "";

  const avatarText =
    normalizeAvatarText(
      getInitials(displayName) ||
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
      "User"
    )} ${displayName}`;

  return {
    user,
    authenticated,
    displayName,
    username,
    avatarUrl,
    avatarText,
    avatarAlt,
  };
}

function syncSidebarName(dom, {
  displayName,
  username,
  authenticated,
} = {}) {
  const sidebarName =
    dom?.sidebarName ||
    resolveDomNode(
      dom,
      "sidebarName",
      USER_NAME_SELECTORS
    );

  if (!sidebarName) {
    return false;
  }

  safeSetText(
    sidebarName,
    displayName
  );

  safeDatasetSet(
    sidebarName,
    "username",
    username
  );

  safeDatasetSet(
    sidebarName,
    "authenticated",
    authenticated ? "true" : "false"
  );

  safeRemoveAttr(
    sidebarName,
    "data-tooltip"
  );

  removeNativeTooltip(
    sidebarName
  );

  return true;
}

function syncSidebarAvatar(dom, data, events = null) {
  const avatarRoot =
    dom?.sidebarAvatar ||
    resolveDomNode(
      dom,
      "sidebarAvatar",
      AVATAR_SELECTORS.root
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
  } = data;

  cleanupDuplicateAvatarNodes(
    avatarRoot
  );

  if (!avatarUrl) {
    renderAvatarFallback(
      avatarRoot,
      avatarText,
      avatarAlt,
      displayName,
      username,
      events
    );
  } else {
    renderAvatarImage(
      avatarRoot,
      avatarUrl,
      avatarAlt,
      displayName,
      avatarText,
      username,
      events
    );
  }

  safeDatasetSet(
    avatarRoot,
    "authenticated",
    authenticated ? "true" : "false"
  );

  return true;
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
    "authenticated",
    data.authenticated ? "true" : "false"
  );

  removeNativeTooltip(
    toggle
  );

  return true;
}

function recacheUserNodes(dom) {
  if (!dom) {
    return {};
  }

  const result = {
    sidebarName:
      Boolean(
        resolveDomNode(
          dom,
          "sidebarName",
          USER_NAME_SELECTORS
        )
      ),

    sidebarAvatar:
      Boolean(
        resolveDomNode(
          dom,
          "sidebarAvatar",
          AVATAR_SELECTORS.root
        )
      ),

    userToggle:
      Boolean(
        resolveDomNode(
          dom,
          "userToggle",
          USER_TOGGLE_SELECTORS
        )
      ),

    topbarTitle:
      Boolean(
        resolveDomNode(
          dom,
          "topbarTitle",
          TOPBAR_TITLE_SELECTORS
        )
      ),
  };

  return result;
}

export function syncUserUI({
  state,
  dom,
  events,
  recache = true,
} = {}) {
  if (recache !== false) {
    recacheUserNodes(dom);
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

    userToggle:
      syncUserToggle(
        dom,
        data
      ),
  };

  const payload = {
    displayName:
      data.displayName,

    username:
      data.username || null,

    authenticated:
      data.authenticated,

    avatarText:
      data.avatarText,

    avatarUrl:
      data.avatarUrl || null,

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
        el.className,
        ""
      ),

    hidden:
      Boolean(el.hidden),

    ariaHidden:
      safeText(
        el.getAttribute?.("aria-hidden"),
        ""
      ),

    text:
      safeText(
        el.textContent,
        ""
      ).slice(0, 80),
  };
}

export function getUiSnapshot({
  state,
  dom,
} = {}) {
  const data =
    resolveUserUiData(state);

  const avatarRoot =
    dom?.sidebarAvatar ||
    queryFirst(
      AVATAR_SELECTORS.root
    );

  const avatarNodes =
    getAvatarNodes(
      avatarRoot
    );

  return {
    version:
      UI_VERSION,

    title:
      isBrowser()
        ? safeText(document.title, "")
        : "",

    user: {
      authenticated:
        data.authenticated,

      displayName:
        data.displayName,

      username:
        data.username || null,

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

      hasUserToggle:
        Boolean(dom?.userToggle),

      hasTopbarViewContainer:
        Boolean(dom?.topbarViewContainer),

      hasTableheadContainer:
        Boolean(dom?.tableheadContainer),
    },

    avatar: {
      root:
        getElementState(
          avatarRoot
        ),

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
          avatarRoot?.dataset?.avatarMode,
          ""
        ),
    },
  };
}

export default {
  setDocumentTitle,
  clearDynamicContainers,
  syncUserUI,
  getUiSnapshot,
};
