/* =========================================================
   Onion Support - Sidebar User
   Archivo: /src/ui/sidebar/user.js

   Responsabilidad:
   - Compat mínima de usuario para Sidebar.
   - Sin imports.
   - Sin storage.
   - Sin eventos globales.
   - Sin permisos complejos.
   - Sin roles inventados.
   - Sin status legacy.
   - Sin avatar avanzado.
   - Sin CustomEvent.
   - Roles únicos: admin / user.
   - Usuario inválido sólo si disabled.
   - El sidebar real vive en src/ui/sidebar/index.js.
========================================================= */

export const SIDEBAR_USER_VERSION = "simple";

const DEFAULT_DISPLAY_NAME = "Usuario";
const DEFAULT_AVATAR_TEXT = "U";
const DEFAULT_PLAN_LABEL = "";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (isObject(value) && !Object.keys(value).length) continue;

    return value;
  }

  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  return (
    user.disabled === true ||
    String(user.status || "").toLowerCase() === "disabled"
  );
}

function hasUserIdentity(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    user.id ||
      user.userId ||
      user.username ||
      user.slug ||
      user.email
  );
}

function usableUser(user = null) {
  return Boolean(isObject(user) && !userDisabled(user) && hasUserIdentity(user));
}

function emit(AppCore = null, eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: "sidebar.user",
      version: SIDEBAR_USER_VERSION,
      at: nowIso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   DOM
========================================================= */

function query(selector = "", root = null) {
  if (!isBrowser() || !selector) return null;

  const scope = root || document;

  try {
    return scope.querySelector(selector);
  } catch {
    return null;
  }
}

function getSidebarRoot(AppCore = null) {
  if (!isBrowser()) return null;

  return (
    AppCore?.dom?.sidebar ||
    AppCore?.dom?.sidebarRoot ||
    document.getElementById("app-sidebar") ||
    document.getElementById("sidebar") ||
    query("[data-sidebar-root]")
  );
}

function getElements(AppCore = null) {
  const sidebar = getSidebarRoot(AppCore);

  return {
    sidebar,

    nameEl:
      AppCore?.dom?.sidebarName ||
      AppCore?.dom?.sidebarUserName ||
      query("[data-sidebar-name]", sidebar) ||
      query("[data-user-name]", sidebar) ||
      query(".sidebar-user-name", sidebar) ||
      query(".sidebar-user-name") ||
      null,

    planEl:
      AppCore?.dom?.sidebarPlan ||
      AppCore?.dom?.sidebarUserPlan ||
      query("[data-sidebar-user-plan]", sidebar) ||
      query(".sidebar-user-plan", sidebar) ||
      null,

    avatarEl:
      AppCore?.dom?.sidebarAvatar ||
      query("[data-sidebar-avatar]", sidebar) ||
      query("[data-user-avatar]", sidebar) ||
      query(".sidebar-user-avatar", sidebar) ||
      query(".sidebar-avatar", sidebar) ||
      null,

    avatarImage:
      AppCore?.dom?.sidebarAvatarImage ||
      query("[data-avatar-image]", sidebar) ||
      query(".sidebar-user-avatar img", sidebar) ||
      null,

    avatarFallback:
      AppCore?.dom?.sidebarAvatarFallback ||
      query("[data-avatar-fallback]", sidebar) ||
      query(".avatar-fallback", sidebar) ||
      null,

    userToggle:
      AppCore?.dom?.userToggle ||
      query("[data-sidebar-user-toggle]", sidebar) ||
      query("[data-user-toggle]", sidebar) ||
      null,

    userDropdown:
      AppCore?.dom?.userDropdown ||
      query("[data-sidebar-user-dropdown]", sidebar) ||
      query("[data-user-dropdown]", sidebar) ||
      null,
  };
}

function setText(node = null, value = "") {
  if (!node) return false;

  try {
    node.textContent = value;
    return true;
  } catch {
    return false;
  }
}

function setData(node = null, key = "", value = "") {
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

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  try {
    node.hidden = Boolean(hidden);
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   USER SOURCE
========================================================= */

function unwrapUser(payload = null) {
  if (!isObject(payload)) return null;

  return first(
    payload.user,
    payload.usuario,
    payload.currentUser,
    payload.authUser,
    payload.sessionUser,
    payload.me,
    payload.profile,
    payload.account,
    payload.session?.user,
    payload.sessionData?.user,
    payload.data?.user,
    payload.payload?.user,
    payload
  );
}

function authUser(AppCore = null) {
  const candidates = [
    AppCore?.Auth,
    AppCore?.auth,
    AppCore?.modules?.get?.("Auth"),
    AppCore?.modules?.get?.("auth"),
  ];

  for (const auth of candidates) {
    try {
      const user =
        auth?.getUser?.() ||
        auth?.getCurrentUser?.() ||
        auth?.user ||
        auth?.currentUser ||
        null;

      if (usableUser(user)) return user;
    } catch {
      // noop
    }
  }

  return null;
}

export function getUser(AppCore = null, explicitUser = null) {
  const explicit = unwrapUser(explicitUser);

  if (usableUser(explicit)) return explicit;

  const state = isObject(AppCore?.state) ? AppCore.state : {};

  const user =
    unwrapUser(state) ||
    unwrapUser(state.session) ||
    unwrapUser(state.sessionData) ||
    authUser(AppCore);

  return usableUser(user) ? user : {};
}

/* =========================================================
   DISPLAY
========================================================= */

export function getDisplayName(AppCore = null, user = null) {
  const current = user || getUser(AppCore);

  if (!usableUser(current)) return DEFAULT_DISPLAY_NAME;

  return text(
    first(
      current.name,
      current.fullName,
      current.displayName,
      current.nombre,
      current.username,
      current.slug,
      current.email
    ),
    DEFAULT_DISPLAY_NAME
  );
}

function normalizeUsername(value = "") {
  return text(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

export function getUsername(AppCore = null, user = null) {
  const current = user || getUser(AppCore);

  if (!usableUser(current)) return "";

  const direct = normalizeUsername(
    first(
      current.username,
      current.slug,
      current.userName,
      current.user_name,
      current.userId,
      current.id
    )
  );

  if (direct) return direct;

  const email = text(current.email, "");
  return email.includes("@") ? normalizeUsername(email.split("@")[0]) : "";
}

export function getAvatarText(AppCore = null, user = null) {
  const current = user || getUser(AppCore);

  if (!usableUser(current)) return DEFAULT_AVATAR_TEXT;

  const explicit = text(current.avatarText || current.initials || "", "");

  if (explicit) return explicit.slice(0, 2).toUpperCase();

  const name = getDisplayName(AppCore, current);
  const parts = name.split(/\s+/).filter(Boolean);

  if (!parts.length) return DEFAULT_AVATAR_TEXT;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function safeAvatarUrl(value = "") {
  const raw = text(value, "");

  if (!raw) return "";
  if (/[\r\n\t]/.test(raw)) return "";
  if (/^(javascript:|vbscript:|file:|data:text|data:application)/i.test(raw)) return "";
  if (raw.startsWith("//")) return "";

  if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) return raw;
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(raw)) return raw;
  if (raw.startsWith("blob:")) return raw;

  return "";
}

export function getAvatarUrl(user = null) {
  const current = isObject(user) ? user : {};

  if (!usableUser(current)) return "";

  return safeAvatarUrl(
    first(
      current.avatarUrl,
      current.avatar,
      current.picture,
      current.photoUrl,
      current.imageUrl
    )
  );
}

export function getSessionAvatarGradient() {
  return "";
}

export function resetSidebarAvatarColor() {
  return true;
}

/* =========================================================
   ROLE
========================================================= */

export function getUserRoles(AppCore = null, user = null) {
  const current = user || getUser(AppCore);
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  if (!usableUser(current)) return [];

  const role = normalizeRole(
    first(
      state.role,
      current.role,
      current.rol,
      "user"
    )
  );

  return [role];
}

export function isAdmin(AppCore = null, user = null) {
  return getUserRoles(AppCore, user).includes("admin");
}

/* =========================================================
   AVATAR RENDER
========================================================= */

export function renderAvatarFallback(avatarEl = null, displayName = DEFAULT_DISPLAY_NAME, avatarText = DEFAULT_AVATAR_TEXT) {
  if (!avatarEl) return false;

  const textValue = text(avatarText, DEFAULT_AVATAR_TEXT).slice(0, 2).toUpperCase();

  try {
    const img = avatarEl.querySelector?.("img");
    if (img) {
      img.removeAttribute("src");
      img.hidden = true;
    }

    const fallback =
      avatarEl.querySelector?.("[data-avatar-fallback]") ||
      avatarEl.querySelector?.(".avatar-fallback");

    if (fallback) {
      fallback.textContent = textValue;
      fallback.hidden = false;
    } else {
      avatarEl.textContent = textValue;
    }

    avatarEl.classList?.remove?.("has-image");
    avatarEl.classList?.add?.("has-fallback");
    avatarEl.dataset.hasImage = "false";
    avatarEl.dataset.displayName = text(displayName, DEFAULT_DISPLAY_NAME);

    return true;
  } catch {
    return false;
  }
}

export function renderAvatarImage(avatarEl = null, avatarUrl = "", displayName = DEFAULT_DISPLAY_NAME, avatarText = DEFAULT_AVATAR_TEXT) {
  const url = safeAvatarUrl(avatarUrl);

  if (!avatarEl || !url) {
    return renderAvatarFallback(avatarEl, displayName, avatarText);
  }

  try {
    let img = avatarEl.querySelector?.("img");

    if (!img && isBrowser()) {
      img = document.createElement("img");
      avatarEl.appendChild(img);
    }

    if (!img) return renderAvatarFallback(avatarEl, displayName, avatarText);

    img.alt = `Avatar de ${text(displayName, DEFAULT_DISPLAY_NAME)}`;
    img.loading = "eager";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = url;
    img.hidden = false;

    const fallback =
      avatarEl.querySelector?.("[data-avatar-fallback]") ||
      avatarEl.querySelector?.(".avatar-fallback");

    setHidden(fallback, true);

    avatarEl.classList?.add?.("has-image");
    avatarEl.classList?.remove?.("has-fallback");
    avatarEl.dataset.hasImage = "true";
    avatarEl.dataset.displayName = text(displayName, DEFAULT_DISPLAY_NAME);

    return true;
  } catch {
    return renderAvatarFallback(avatarEl, displayName, avatarText);
  }
}

/* =========================================================
   RENDER USER
========================================================= */

function planLabel(AppCore = null, user = null) {
  const current = user || getUser(AppCore);
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return text(
    first(
      state.plan,
      current.plan,
      current.planName,
      current.subscriptionPlan,
      DEFAULT_PLAN_LABEL
    ),
    DEFAULT_PLAN_LABEL
  );
}

function setUserDataset(node = null, { displayName = "", username = "", role = "", hasUser = false } = {}) {
  if (!node) return false;

  setData(node, "displayName", displayName);
  setData(node, "footerName", displayName);
  setData(node, "greetingName", displayName);
  setData(node, "username", username);
  setData(node, "role", role);
  setData(node, "admin", role === "admin" ? "true" : "false");
  setData(node, "hasUser", hasUser ? "true" : "false");

  return true;
}

export function renderUser(AppCore = null, context = {}) {
  const user = getUser(AppCore, context?.user);
  const hasUser = usableUser(user);

  const displayName = hasUser ? getDisplayName(AppCore, user) : DEFAULT_DISPLAY_NAME;
  const username = hasUser ? getUsername(AppCore, user) : "";
  const role = hasUser ? normalizeRole(first(context?.role, user.role, user.rol, AppCore?.state?.role, "user")) : "";
  const avatarText = hasUser ? getAvatarText(AppCore, user) : DEFAULT_AVATAR_TEXT;
  const avatarUrl = hasUser ? getAvatarUrl(user) : "";
  const plan = hasUser ? planLabel(AppCore, user) : DEFAULT_PLAN_LABEL;

  const {
    nameEl,
    planEl,
    avatarEl,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  setText(nameEl, displayName);
  setText(planEl, plan);

  if (avatarEl) {
    if (avatarUrl) renderAvatarImage(avatarEl, avatarUrl, displayName, avatarText);
    else renderAvatarFallback(avatarEl, displayName, avatarText);
  }

  for (const node of [nameEl, planEl, avatarEl, userToggle, userDropdown]) {
    setUserDataset(node, {
      displayName,
      username,
      role,
      hasUser,
    });
  }

  try {
    if (userToggle) {
      userToggle.setAttribute("aria-label", `Usuario: ${displayName}`);
    }
  } catch {
    // noop
  }

  emit(AppCore, "sidebar:user:rendered", {
    hasUser,
    displayName,
    username,
    role,
  });

  return {
    hasUser,
    displayName,
    footerName: displayName,
    greetingName: displayName,
    username,
    role,
    roles: role ? [role] : [],
    isAdmin: role === "admin",
    planLabel: plan,
    avatarText,
    avatarUrl: avatarUrl ? "***" : "",
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarUserSnapshot(AppCore = null) {
  const user = getUser(AppCore);
  const hasUser = usableUser(user);
  const displayName = hasUser ? getDisplayName(AppCore, user) : DEFAULT_DISPLAY_NAME;
  const username = hasUser ? getUsername(AppCore, user) : "";
  const role = hasUser ? normalizeRole(first(user.role, user.rol, AppCore?.state?.role, "user")) : "";

  const elements = getElements(AppCore);

  return {
    version: SIDEBAR_USER_VERSION,

    hasUser,

    user: hasUser
      ? {
          id: user.id || user.userId || null,
          userId: user.userId || user.id || null,
          username,
          displayName,
          name: displayName,
          fullName: displayName,
          footerName: displayName,
          greetingName: displayName,
          role,
        }
      : null,

    displayName,
    footerName: displayName,
    greetingName: displayName,

    username: username || null,
    avatarText: hasUser ? getAvatarText(AppCore, user) : DEFAULT_AVATAR_TEXT,
    avatarUrl: hasUser && getAvatarUrl(user) ? "***" : null,

    planLabel: hasUser ? planLabel(AppCore, user) : DEFAULT_PLAN_LABEL,

    isAdmin: role === "admin",
    roles: role ? [role] : [],

    dom: {
      hasName: Boolean(elements.nameEl),
      nameText: elements.nameEl?.textContent || "",
      hasAvatar: Boolean(elements.avatarEl),
      hasUserToggle: Boolean(elements.userToggle),
      hasUserDropdown: Boolean(elements.userDropdown),
      hasPlan: Boolean(elements.planEl),
      planText: elements.planEl?.textContent || "",
    },

    policy: {
      compatOnly: true,
      noImports: true,
      roles: ["admin", "user"],
      invalidOnlyDisabled: true,
      tokenSafe: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_USER_VERSION,

  getUser,
  getDisplayName,
  getUsername,
  getAvatarText,
  getAvatarUrl,
  getSessionAvatarGradient,
  getUserRoles,
  isAdmin,

  renderAvatarFallback,
  renderAvatarImage,
  renderUser,

  resetSidebarAvatarColor,
  getSidebarUserSnapshot,
};
