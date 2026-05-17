/* =========================================================
   Onion Support - Core UI
   Archivo: /src/core/ui.js

   Responsabilidad:
   - Título del documento.
   - Limpieza mínima de contenedores dinámicos.
   - Sync mínimo de usuario si existen nodos.
   - Sin imports.
   - Sin config.
   - Sin avatar manager.
   - Sin sidebar/topbar complejos.
   - Sin i18n runtime.
   - Sin snapshots grandes.
   - Sin usuario fantasma.
========================================================= */

export const UI_VERSION = "simple";

export const USER_UI_EVENT = "app:user-ui:sync";
export const TITLE_EVENT = "app:title:change";
export const DYNAMIC_CLEARED_EVENT = "app:dynamic:cleared";

const APP_NAME = "Onion Support";
const DEFAULT_USER_NAME = "Usuario";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function emit(events, name, payload = {}) {
  try {
    if (isFunction(events?.emit)) {
      events.emit(name, payload);
      return true;
    }

    if (isFunction(events?.dispatch)) {
      events.dispatch(name, payload);
      return true;
    }

    if (isFunction(events?.trigger)) {
      events.trigger(name, payload);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function byId(id = "") {
  if (!isBrowser() || !id) return null;

  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function setText(node, value = "") {
  if (!node) return false;

  try {
    node.textContent = text(value, "");
    return true;
  } catch {
    return false;
  }
}

function setData(node, key = "", value = "") {
  if (!node || !key) return false;

  try {
    if (value === null || value === undefined || value === "") {
      delete node.dataset[key];
    } else {
      node.dataset[key] = String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function clearNode(node) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    try {
      node.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

function normalizeRole(value = "") {
  return String(value).toLowerCase() === "admin" ? "admin" : "user";
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function getUser(state = {}) {
  if (!state?.authenticated) return null;

  const user =
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    null;

  if (!isObject(user)) return null;
  if (userDisabled(user)) return null;

  return user;
}

function userName(user = null) {
  if (!user) return DEFAULT_USER_NAME;

  return (
    user.name ||
    user.fullName ||
    user.displayName ||
    user.nombre ||
    user.username ||
    user.email ||
    DEFAULT_USER_NAME
  );
}

function username(user = null) {
  if (!user) return "";

  return user.username || user.slug || user.email || "";
}

function userEmail(user = null) {
  return user?.email || "";
}

function userRole(state = {}, user = null) {
  if (!user) return "";

  return normalizeRole(state.role || user.role || user.rol);
}

function initials(value = "") {
  return text(value, DEFAULT_USER_NAME)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2) || "ON";
}

function resolveUserData(state = {}) {
  const user = getUser(state);
  const authenticated = Boolean(user);

  const displayName = authenticated ? userName(user) : DEFAULT_USER_NAME;
  const handle = authenticated ? username(user) : "";
  const email = authenticated ? userEmail(user) : "";
  const role = authenticated ? userRole(state, user) : "";

  return {
    authenticated,
    hasUser: authenticated,
    displayName,
    username: handle,
    email,
    role,
    avatarText: initials(displayName),
  };
}

function syncNode(id = "", value = "", data = {}) {
  const node = byId(id);

  if (!node) return false;

  setText(node, value);
  setData(node, "authenticated", data.authenticated ? "true" : "false");
  setData(node, "username", data.username || "");
  setData(node, "role", data.role || "");

  try {
    node.removeAttribute("title");
  } catch {
    // noop
  }

  return true;
}

function syncAvatar(id = "", data = {}) {
  const node = byId(id);

  if (!node) return false;

  setText(node, data.avatarText || "ON");
  setData(node, "authenticated", data.authenticated ? "true" : "false");
  setData(node, "username", data.username || "");
  setData(node, "role", data.role || "");

  return true;
}

/* =========================================================
   TITLE
========================================================= */

export function setDocumentTitle(input = {}, extra = {}) {
  const payload =
    typeof input === "string"
      ? {
          ...extra,
          title: input,
        }
      : {
          ...input,
        };

  const title = text(payload.title, APP_NAME);
  const suffix = text(payload.suffix, "");
  const finalTitle = suffix && !title.includes(suffix) ? `${title} · ${suffix}` : title;

  if (isBrowser()) {
    document.title = finalTitle;
  }

  const topbarTitle = byId("topbar-title");

  if (topbarTitle && payload.updateTopbar !== false) {
    setText(topbarTitle, text(payload.topbarTitle, title));
    setData(topbarTitle, "titleSynced", "true");
  }

  emit(payload.events, TITLE_EVENT, {
    title: finalTitle,
  });

  return finalTitle;
}

/* =========================================================
   DYNAMIC CONTAINERS
========================================================= */

export function clearDynamicContainers({
  events = null,
  includeView = false,
  includeTablehead = true,
  extraKeys = [],
} = {}) {
  const ids = [];

  if (includeTablehead !== false) {
    ids.push("tablehead-container", "table-head");
  }

  if (includeView === true) {
    ids.push("view-container");
  }

  for (const key of extraKeys || []) {
    if (key && !ids.includes(key)) {
      ids.push(key);
    }
  }

  const cleared = [];

  for (const id of ids) {
    const node = byId(id);

    if (node && clearNode(node)) {
      cleared.push(id);
    }
  }

  const tableHead = byId("table-head");

  if (tableHead && includeTablehead !== false) {
    tableHead.hidden = true;
    tableHead.setAttribute("aria-hidden", "true");
    setData(tableHead, "visible", "false");
  }

  emit(events, DYNAMIC_CLEARED_EVENT, {
    cleared,
    includeView: Boolean(includeView),
  });

  return true;
}

/* =========================================================
   USER UI
========================================================= */

export function recacheUserNodes() {
  return {
    sidebarName: Boolean(byId("sidebar-name") || byId("sidebarName")),
    sidebarEmail: Boolean(byId("sidebar-email") || byId("sidebarEmail")),
    sidebarRole: Boolean(byId("sidebar-role") || byId("sidebarRole")),
    sidebarAvatar: Boolean(byId("sidebar-avatar") || byId("sidebarAvatar")),
    topbarUserName: Boolean(byId("topbar-user-name") || byId("topbarUserName")),
    userToggle: Boolean(byId("userToggle") || byId("user-toggle")),
    userDropdown: Boolean(byId("userDropdown") || byId("user-dropdown")),
    logoutBtn: Boolean(byId("logoutBtn") || byId("logout-button") || byId("logout-btn")),
  };
}

export function syncUserUI(input = {}) {
  const state = input?.state || input || {};
  const events = input?.events || null;
  const data = resolveUserData(state);

  const synced = {
    sidebarName:
      syncNode("sidebar-name", data.displayName, data) ||
      syncNode("sidebarName", data.displayName, data),

    sidebarEmail:
      syncNode("sidebar-email", data.email, data) ||
      syncNode("sidebarEmail", data.email, data),

    sidebarRole:
      syncNode("sidebar-role", data.role, data) ||
      syncNode("sidebarRole", data.role, data),

    sidebarAvatar:
      syncAvatar("sidebar-avatar", data) ||
      syncAvatar("sidebarAvatar", data) ||
      syncAvatar("sidebarAvatarFallback", data),

    topbarUserName:
      syncNode("topbar-user-name", data.displayName, data) ||
      syncNode("topbarUserName", data.displayName, data),

    userToggle:
      Boolean(byId("userToggle") || byId("user-toggle")),

    userDropdown:
      Boolean(byId("userDropdown") || byId("user-dropdown")),

    logoutBtn:
      Boolean(byId("logoutBtn") || byId("logout-button") || byId("logout-btn")),
  };

  for (const id of ["userToggle", "user-toggle", "userDropdown", "user-dropdown", "logoutBtn", "logout-button", "logout-btn"]) {
    const node = byId(id);

    if (node) {
      setData(node, "authenticated", data.authenticated ? "true" : "false");
      setData(node, "username", data.username || "");
      setData(node, "role", data.role || "");
    }
  }

  const payload = {
    version: UI_VERSION,
    authenticated: data.authenticated,
    hasUser: data.hasUser,
    displayName: data.displayName,
    username: data.username || null,
    role: data.role || null,
    avatarText: data.avatarText,
    synced,
  };

  emit(events, USER_UI_EVENT, payload);

  return payload;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function nodeState(id = "") {
  const node = byId(id);

  return {
    id,
    exists: Boolean(node),
    text: text(node?.textContent, "").slice(0, 80),
    hidden: Boolean(node?.hidden),
  };
}

export function getUiSnapshot({ state = {} } = {}) {
  const data = resolveUserData(state);

  return {
    version: UI_VERSION,
    title: isBrowser() ? document.title : "",
    user: {
      authenticated: data.authenticated,
      hasUser: data.hasUser,
      displayName: data.displayName,
      username: data.username || null,
      role: data.role || null,
      avatarText: data.avatarText,
    },
    nodes: {
      sidebarName: nodeState("sidebar-name"),
      sidebarEmail: nodeState("sidebar-email"),
      sidebarRole: nodeState("sidebar-role"),
      sidebarAvatar: nodeState("sidebar-avatar"),
      topbarUserName: nodeState("topbar-user-name"),
      topbarTitle: nodeState("topbar-title"),
    },
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
