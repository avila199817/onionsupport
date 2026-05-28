/* =========================================================
   Onion Support - Core UI
   Archivo: /src/core/ui.js

   Responsabilidad:
   - Título del documento.
   - Limpieza mínima de contenedores dinámicos.
   - Sync mínimo de usuario si existen nodos.
   - Compat básica con IDs actuales/legacy.
   - Sin imports.
   - Sin config.
   - Sin avatar manager.
   - Sin sidebar/topbar complejos.
   - Sin i18n runtime.
   - Sin Auth runtime.
   - Sin Router.
   - Sin Store.
   - Sin fetch.
   - Sin usuario fantasma.
========================================================= */

export const UI_VERSION = "core.ui.v3";

export const USER_UI_EVENT = "app:user-ui:sync";
export const TITLE_EVENT = "app:title:change";
export const DYNAMIC_CLEARED_EVENT = "app:dynamic:cleared";

const APP_NAME = "Onion Support";
const DEFAULT_USER_NAME = "Usuario";

const VALID_ROLES = new Set(["admin", "user"]);

const USER_NODE_IDS = Object.freeze({
  sidebarName: Object.freeze(["sidebar-name", "sidebarName"]),
  sidebarEmail: Object.freeze(["sidebar-email", "sidebarEmail"]),
  sidebarRole: Object.freeze(["sidebar-role", "sidebarRole"]),
  sidebarAvatar: Object.freeze([
    "sidebar-avatar",
    "sidebarAvatar",
    "sidebarAvatarFallback",
  ]),
  topbarUserName: Object.freeze(["topbar-user-name", "topbarUserName"]),
  topbarTitle: Object.freeze(["topbar-title", "topbarTitle"]),
  userToggle: Object.freeze(["userToggle", "user-toggle"]),
  userDropdown: Object.freeze(["userDropdown", "user-dropdown"]),
  logoutBtn: Object.freeze(["logoutBtn", "logout-button", "logout-btn"]),
});

const DYNAMIC_CONTAINER_IDS = Object.freeze({
  tablehead: Object.freeze(["tablehead-container", "table-head"]),
  view: Object.freeze(["view-container"]),
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
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function emit(events, name, payload = {}) {
  if (!name) return false;

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

function firstNode(ids = []) {
  for (const id of ids || []) {
    const node = byId(id);

    if (node) return node;
  }

  return null;
}

function nodeExists(ids = []) {
  return Boolean(firstNode(ids));
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

function setBoolData(node, key = "", value = false) {
  return setData(node, key, value ? "true" : "false");
}

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const value = Boolean(hidden);

  try {
    node.hidden = value;
    node.setAttribute("aria-hidden", value ? "true" : "false");
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

function tagName(node = null) {
  return String(node?.tagName || "").toLowerCase();
}

/* =========================================================
   REDACTION
========================================================= */

function redactUiText(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "***");
}

/* =========================================================
   USER NORMALIZATION
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = text(value, "").toLowerCase();

  return VALID_ROLES.has(role) ? role : "";
}

function getUser(state = {}) {
  if (state?.authenticated !== true) return null;

  const user =
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    null;

  return isObject(user) ? user : null;
}

function userName(user = null) {
  if (!user) return "";

  return text(
    user.displayName ||
      user.fullName ||
      user.name ||
      user.nombre ||
      user.username ||
      "",
    ""
  );
}

function username(user = null) {
  if (!user) return "";

  return text(
    user.username ||
      user.slug ||
      user.lookup?.slug ||
      "",
    ""
  );
}

function userEmail(user = null) {
  return text(user?.email, "");
}

function userRole(state = {}, user = null) {
  if (!user) return "";

  return normalizeRole(
    state.role ||
      state.rol ||
      state.userRole ||
      user.role ||
      user.rol ||
      user.roles
  );
}

function userAvatarUrl(user = null) {
  if (!user) return "";

  return text(
    user.avatarUrl ||
      user.avatar ||
      user.picture ||
      user.pictureUrl ||
      user.photoUrl ||
      user.photoURL ||
      user.imageUrl ||
      user.image ||
      user.profile?.avatarUrl ||
      user.profile?.avatar ||
      user.profile?.picture ||
      "",
    ""
  );
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

  const displayName = authenticated
    ? userName(user) || DEFAULT_USER_NAME
    : "";

  const handle = authenticated ? username(user) : "";
  const email = authenticated ? userEmail(user) : "";
  const role = authenticated ? userRole(state, user) : "";
  const avatarUrl = authenticated ? userAvatarUrl(user) : "";

  return {
    authenticated,
    hasUser: authenticated,

    displayName,
    username: handle,
    email,
    role,

    hasAvatar: Boolean(avatarUrl),
    avatarUrl,
    avatarText: authenticated ? initials(displayName) : "ON",
  };
}

/* =========================================================
   NODE SYNC
========================================================= */

function syncDataset(node, data = {}) {
  if (!node) return false;

  setBoolData(node, "authenticated", data.authenticated);
  setBoolData(node, "hasUser", data.hasUser);
  setBoolData(node, "hasAvatar", data.hasAvatar);

  setData(node, "username", data.username || "");
  setData(node, "role", data.role || "");
  setData(node, "avatarText", data.avatarText || "");

  return true;
}

function syncNode(id = "", value = "", data = {}) {
  const node = byId(id);

  if (!node) return false;

  setText(node, value);
  syncDataset(node, data);

  try {
    node.removeAttribute("title");
  } catch {
    // noop
  }

  return true;
}

function syncFirstNode(ids = [], value = "", data = {}) {
  for (const id of ids || []) {
    if (syncNode(id, value, data)) return true;
  }

  return false;
}

function syncAvatar(id = "", data = {}) {
  const node = byId(id);

  if (!node) return false;

  /*
    Core UI no gestiona imagen/avatar real.
    Sólo sincroniza fallback textual, alt y dataset mínimo.
    El avatar visual complejo pertenece a ui/sidebar/user.js o equivalente.
  */
  if (tagName(node) !== "img") {
    setText(node, data.authenticated ? data.avatarText || "ON" : "ON");
  } else {
    try {
      node.alt = data.authenticated
        ? data.displayName || DEFAULT_USER_NAME
        : APP_NAME;
    } catch {
      // noop
    }
  }

  syncDataset(node, data);

  return true;
}

function syncFirstAvatar(ids = [], data = {}) {
  for (const id of ids || []) {
    if (syncAvatar(id, data)) return true;
  }

  return false;
}

function syncActionNodes(data = {}) {
  const ids = [
    ...USER_NODE_IDS.userToggle,
    ...USER_NODE_IDS.userDropdown,
    ...USER_NODE_IDS.logoutBtn,
  ];

  for (const id of ids) {
    const node = byId(id);

    if (node) {
      syncDataset(node, data);
    }
  }

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

  const title = redactUiText(text(payload.title, APP_NAME));
  const suffix = redactUiText(text(payload.suffix, ""));
  const finalTitle = suffix && !title.includes(suffix)
    ? `${title} · ${suffix}`
    : title;

  if (isBrowser()) {
    document.title = finalTitle;
  }

  const topbarTitle = firstNode(USER_NODE_IDS.topbarTitle);

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
    ids.push(...DYNAMIC_CONTAINER_IDS.tablehead);
  }

  if (includeView === true) {
    ids.push(...DYNAMIC_CONTAINER_IDS.view);
  }

  for (const key of extraKeys || []) {
    const clean = text(key, "");

    if (clean && !ids.includes(clean)) {
      ids.push(clean);
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
    setHidden(tableHead, true);
    setData(tableHead, "visible", "false");
  }

  emit(events, DYNAMIC_CLEARED_EVENT, {
    cleared,
    includeView: Boolean(includeView),
    includeTablehead: includeTablehead !== false,
  });

  return true;
}

/* =========================================================
   USER UI
========================================================= */

export function recacheUserNodes() {
  return {
    sidebarName: nodeExists(USER_NODE_IDS.sidebarName),
    sidebarEmail: nodeExists(USER_NODE_IDS.sidebarEmail),
    sidebarRole: nodeExists(USER_NODE_IDS.sidebarRole),
    sidebarAvatar: nodeExists(USER_NODE_IDS.sidebarAvatar),

    topbarUserName: nodeExists(USER_NODE_IDS.topbarUserName),
    topbarTitle: nodeExists(USER_NODE_IDS.topbarTitle),

    userToggle: nodeExists(USER_NODE_IDS.userToggle),
    userDropdown: nodeExists(USER_NODE_IDS.userDropdown),
    logoutBtn: nodeExists(USER_NODE_IDS.logoutBtn),
  };
}

export function syncUserUI(input = {}) {
  const state = input?.state || input || {};
  const events = input?.events || null;
  const data = resolveUserData(state);

  const synced = {
    sidebarName: syncFirstNode(USER_NODE_IDS.sidebarName, data.displayName, data),
    sidebarEmail: syncFirstNode(USER_NODE_IDS.sidebarEmail, data.email, data),
    sidebarRole: syncFirstNode(USER_NODE_IDS.sidebarRole, data.role, data),
    sidebarAvatar: syncFirstAvatar(USER_NODE_IDS.sidebarAvatar, data),

    topbarUserName: syncFirstNode(USER_NODE_IDS.topbarUserName, data.displayName, data),

    userToggle: nodeExists(USER_NODE_IDS.userToggle),
    userDropdown: nodeExists(USER_NODE_IDS.userDropdown),
    logoutBtn: nodeExists(USER_NODE_IDS.logoutBtn),
  };

  syncActionNodes(data);

  const payload = {
    version: UI_VERSION,

    authenticated: data.authenticated,
    hasUser: data.hasUser,

    displayName: data.displayName || null,
    username: data.username || null,
    email: data.email ? "***" : null,
    role: data.role || null,

    hasAvatar: data.hasAvatar,
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
    text: redactUiText(node?.textContent || "").slice(0, 80),
    hidden: Boolean(node?.hidden),
    ariaHidden: node?.getAttribute?.("aria-hidden") || "",
    authenticated: node?.dataset?.authenticated || "",
    username: node?.dataset?.username || "",
    role: node?.dataset?.role || "",
  };
}

function firstNodeState(ids = []) {
  const node = firstNode(ids);
  const id = node?.id || ids?.[0] || "";

  return nodeState(id);
}

export function getUiSnapshot({ state = {} } = {}) {
  const data = resolveUserData(state);

  return {
    version: UI_VERSION,

    browser: isBrowser(),
    title: isBrowser() ? redactUiText(document.title) : "",

    user: {
      authenticated: data.authenticated,
      hasUser: data.hasUser,
      displayName: data.displayName || null,
      username: data.username || null,
      email: data.email ? "***" : null,
      role: data.role || null,
      hasAvatar: data.hasAvatar,
      avatarText: data.avatarText,
    },

    nodes: {
      sidebarName: firstNodeState(USER_NODE_IDS.sidebarName),
      sidebarEmail: firstNodeState(USER_NODE_IDS.sidebarEmail),
      sidebarRole: firstNodeState(USER_NODE_IDS.sidebarRole),
      sidebarAvatar: firstNodeState(USER_NODE_IDS.sidebarAvatar),

      topbarUserName: firstNodeState(USER_NODE_IDS.topbarUserName),
      topbarTitle: firstNodeState(USER_NODE_IDS.topbarTitle),

      userToggle: firstNodeState(USER_NODE_IDS.userToggle),
      userDropdown: firstNodeState(USER_NODE_IDS.userDropdown),
      logoutBtn: firstNodeState(USER_NODE_IDS.logoutBtn),
    },

    policy: {
      minimalCoreUi: true,
      noImports: true,
      noAuthRuntime: true,
      noRouter: true,
      noStore: true,
      noFetch: true,
      noAvatarManager: true,
      noGhostUser: true,
      trustsNormalizedState: true,
      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  UI_VERSION,

  USER_UI_EVENT,
  TITLE_EVENT,
  DYNAMIC_CLEARED_EVENT,

  setDocumentTitle,
  clearDynamicContainers,

  recacheUserNodes,
  syncUserUI,

  getUiSnapshot,
};
