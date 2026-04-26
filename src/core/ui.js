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

   HARDENING EXTREMO:
   - no duplicar nodos avatar
   - fallback consistente
   - title reactivo robusto
   - sync UI segura aunque falten nodos
   - browser/server safe
   - recache DOM ligero si el módulo UI montó tarde
   - eventos consistentes
   - snapshots útiles
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
  "10.0.0";

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

const AVATAR_SELECTORS =
  Object.freeze({
    root: [
      "#sidebar-avatar",
      "#sidebarAvatar",
      "[data-sidebar-avatar='true']",
      "[data-sidebar-avatar]",
      ".sidebar-avatar",
    ],

    image: [
      "#sidebarAvatarImage",
      ".avatar-image",
      "img[data-avatar-image='true']",
      "[data-avatar-image]",
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
    ".sidebar-name",
  ]);

const TOPBAR_TITLE_SELECTORS =
  Object.freeze([
    "#topbar-title",
    "[data-topbar-title='true']",
    "[data-topbar-title]",
    ".topbar-title",
  ]);

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

  for (const selector of selectors) {
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

function isConnected(el) {
  if (!el) {
    return false;
  }

  try {
    return Boolean(el.isConnected);
  } catch {}

  try {
    return document.contains(el);
  } catch {}

  return false;
}

function resolveDomNode(dom, key, selectors = []) {
  const cached =
    dom?.[key] || null;

  if (
    cached &&
    isConnected(cached)
  ) {
    return cached;
  }

  const found =
    queryFirst(selectors);

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

export function setDocumentTitle({
  dom,
  events,
  title = config.appName,
  titleKey = "",
  titleParams = {},
  suffix = "",
  updateTopbar = true,
} = {}) {
  const baseTitle =
    safeText(
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

  const topbarTitle =
    dom?.topbarTitle ||
    resolveDomNode(
      dom,
      "topbarTitle",
      TOPBAR_TITLE_SELECTORS
    );

  if (
    updateTopbar !== false &&
    topbarTitle
  ) {
    safeSetText(
      topbarTitle,
      finalTitle
    );

    safeRemoveAttr(
      topbarTitle,
      "title"
    );

    safeRemoveAttr(
      topbarTitle,
      "data-tooltip"
    );
  }

  safeEmit(
    events,
    TITLE_EVENT,
    {
      title:
        finalTitle,
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

export function clearDynamicContainers({
  dom,
  events,
  includeView = false,
} = {}) {
  const cleared =
    [];

  if (clearElement(dom?.topbarViewContainer)) {
    cleared.push("topbarViewContainer");
  }

  if (clearElement(dom?.tableheadContainer)) {
    cleared.push("tableheadContainer");
  }

  if (
    includeView &&
    clearElement(dom?.viewContainer)
  ) {
    cleared.push("viewContainer");
  }

  safeEmit(
    events,
    DYNAMIC_CLEARED_EVENT,
    {
      cleared,
    }
  );

  return true;
}

/* =========================================================
   AVATAR NODES
========================================================= */

function getAvatarNodes(avatarRoot) {
  if (!avatarRoot) {
    return {
      imgEl:
        null,

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

  /*
    No destruimos estructura previa.
    Solo añadimos fallback si no existe.
  */
  try {
    avatarRoot.appendChild(created);
  } catch {}

  return created;
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

  /*
    Regla del proyecto:
    evitamos tooltip nativo. El tooltip custom lo gestiona UI,
    no Core.
  */
  safeRemoveAttr(
    avatarRoot,
    "title"
  );

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
  username = ""
) {
  if (!avatarRoot) {
    return false;
  }

  const imgEl =
    ensureAvatarImageNode(avatarRoot);

  const fallbackEl =
    ensureAvatarFallbackNode(
      avatarRoot,
      avatarText
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
    } catch {}

    safeSetAttr(
      imgEl,
      "aria-hidden",
      "true"
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
      avatarText
    );
  }

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

  return true;
}

function renderAvatarImage(
  avatarRoot,
  avatarUrl,
  avatarAlt,
  displayName,
  avatarText,
  username = ""
) {
  if (!avatarRoot) {
    return false;
  }

  const safeUrl =
    safeText(avatarUrl, "");

  if (!safeUrl) {
    return renderAvatarFallback(
      avatarRoot,
      avatarText,
      avatarAlt,
      displayName,
      username
    );
  }

  const imgEl =
    ensureAvatarImageNode(avatarRoot);

  const fallbackEl =
    ensureAvatarFallbackNode(
      avatarRoot,
      avatarText
    );

  if (!imgEl) {
    return renderAvatarFallback(
      avatarRoot,
      avatarText,
      avatarAlt,
      displayName,
      username
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

    imgEl.onerror =
      () => {
        renderAvatarFallback(
          avatarRoot,
          avatarText,
          avatarAlt,
          displayName,
          username
        );
      };

    /*
      Importante:
      src al final para que onerror ya esté armado.
    */
    imgEl.src =
      safeUrl;

    imgEl.hidden =
      false;
  } catch {
    return renderAvatarFallback(
      avatarRoot,
      avatarText,
      avatarAlt,
      displayName,
      username
    );
  }

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

    safeSetText(
      fallbackEl,
      avatarText
    );
  }

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
    getInitials(displayName) ||
    (
      username
        ? username.slice(0, 2).toUpperCase()
        : DEFAULT_AVATAR_TEXT
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

  safeRemoveAttr(
    sidebarName,
    "title"
  );

  return true;
}

function syncSidebarAvatar(dom, data) {
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

  if (!avatarUrl) {
    renderAvatarFallback(
      avatarRoot,
      avatarText,
      avatarAlt,
      displayName,
      username
    );
  } else {
    renderAvatarImage(
      avatarRoot,
      avatarUrl,
      avatarAlt,
      displayName,
      avatarText,
      username
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
    dom?.userToggle || null;

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

  safeRemoveAttr(
    toggle,
    "title"
  );

  return true;
}

export function syncUserUI({
  state,
  dom,
  events,
} = {}) {
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
        data
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

export function getUiSnapshot({
  state,
  dom,
} = {}) {
  const data =
    resolveUserUiData(state);

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
  };
}

export default {
  setDocumentTitle,
  clearDynamicContainers,
  syncUserUI,
  getUiSnapshot,
};
