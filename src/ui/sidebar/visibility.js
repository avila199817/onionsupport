/* =========================================================
   Onion Support - Sidebar Visibility
   Archivo: /src/ui/sidebar/visibility.js

   Responsabilidad:
   - Compat mínima de visibilidad Sidebar.
   - Elementos normales visibles.
   - Elementos admin sólo visibles para admin.
   - Roles únicos: admin / user.
   - Sin imports.
   - Sin permisos complejos.
   - Sin roles legacy.
   - Sin server ensure legacy.
   - Sin focus/inert complejo.
   - Sin CustomEvent.
   - Sin magia negra.
   - El sidebar real vive en src/ui/sidebar/index.js.
========================================================= */

export const SIDEBAR_VISIBILITY_VERSION = "simple";

const SOURCE = "sidebar.visibility";

const ADMIN_ROUTES = new Set([
  "/usuarios",
  "/clientes",
  "/servidor",
]);

const CONTROLLED_SELECTOR = [
  "[data-admin-only]",
  "[data-sidebar-admin-only]",
  "[data-role]",
  "[data-roles]",
  "[data-requires-role]",
  "[data-requires-roles]",
  "[data-required-role]",
  "[data-required-roles]",
].join(",");

const MENU_SELECTOR = [
  "[data-sidebar-nav-link]",
  "[data-sidebar-item]",
  "a[data-spa]",
  "a[data-route]",
  "a[href]",
].join(",");

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

function nowIso() {
  return new Date().toISOString();
}

function emit(AppCore = null, eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: SIDEBAR_VISIBILITY_VERSION,
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

function queryAll(selector = "", root = null) {
  if (!isBrowser() || !selector) return [];

  const scope = root || document;

  try {
    return [...scope.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

function sidebarRoot(AppCore = null) {
  if (!isBrowser()) return null;

  return (
    AppCore?.dom?.sidebar ||
    AppCore?.dom?.sidebarRoot ||
    document.getElementById("app-sidebar") ||
    document.getElementById("sidebar") ||
    query("[data-sidebar-root]")
  );
}

function setVisible(element = null, visible = true) {
  if (!element) return false;

  const show = Boolean(visible);

  try {
    element.hidden = !show;
    element.setAttribute("aria-hidden", show ? "false" : "true");

    if (show) {
      element.removeAttribute("hidden");
      element.removeAttribute("inert");
      element.classList.remove("is-hidden", "is-role-hidden", "is-admin-hidden");
      element.dataset.sidebarVisible = "true";
      element.dataset.roleVisible = "true";
      element.dataset.adminVisible = "true";
    } else {
      element.setAttribute("hidden", "");
      element.setAttribute("inert", "");
      element.classList.remove("active", "is-active", "router-active");
      element.classList.add("is-role-hidden", "is-admin-hidden");
      element.removeAttribute("aria-current");
      element.dataset.active = "false";
      element.dataset.current = "false";
      element.dataset.selected = "false";
      element.dataset.sidebarVisible = "false";
      element.dataset.roleVisible = "false";
      element.dataset.adminVisible = "false";
    }

    return true;
  } catch {
    return false;
  }
}

function elementVisible(element = null) {
  if (!element) return false;

  return !(
    element.hidden ||
    element.getAttribute?.("aria-hidden") === "true" ||
    element.hasAttribute?.("hidden") ||
    element.hasAttribute?.("inert") ||
    element.dataset?.sidebarVisible === "false" ||
    element.dataset?.roleVisible === "false" ||
    element.dataset?.adminVisible === "false"
  );
}

/* =========================================================
   ROUTES
========================================================= */

function normalizePath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/").split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function elementRoute(element = null) {
  if (!element) return "";

  return normalizePath(
    element.dataset?.route ||
      element.dataset?.href ||
      element.dataset?.to ||
      element.getAttribute?.("data-route") ||
      element.getAttribute?.("data-href") ||
      element.getAttribute?.("data-to") ||
      element.getAttribute?.("href") ||
      ""
  );
}

function isAdminRouteElement(element = null) {
  const route = elementRoute(element);
  return ADMIN_ROUTES.has(route);
}

/* =========================================================
   ROLES
========================================================= */

function normalizeRole(value = "") {
  return String(value || "").toLowerCase() === "admin" ? "admin" : "user";
}

function splitRoles(value = "") {
  return text(value, "")
    .split(/[,\s|;]+/)
    .map((role) => String(role || "").toLowerCase())
    .filter(Boolean);
}

function validRole(role = "") {
  return role === "admin" || role === "user";
}

function elementAdminOnly(element = null) {
  if (!element) return false;

  const adminOnly =
    element.getAttribute?.("data-admin-only") ??
    element.getAttribute?.("data-sidebar-admin-only");

  if (adminOnly === "" || adminOnly === "true" || adminOnly === true) return true;

  if (isAdminRouteElement(element)) return true;

  const roles = requiredRoles(element);

  return roles.includes("admin") && !roles.includes("user");
}

function requiredRoles(element = null) {
  if (!element) return [];

  const raw = [
    ...splitRoles(element.getAttribute?.("data-role")),
    ...splitRoles(element.getAttribute?.("data-roles")),
    ...splitRoles(element.getAttribute?.("data-requires-role")),
    ...splitRoles(element.getAttribute?.("data-requires-roles")),
    ...splitRoles(element.getAttribute?.("data-required-role")),
    ...splitRoles(element.getAttribute?.("data-required-roles")),
  ];

  return [...new Set(raw.filter(validRole))];
}

function accessControlled(element = null) {
  if (!element) return false;

  try {
    return Boolean(
      element.matches?.(CONTROLLED_SELECTOR) ||
        elementAdminOnly(element) ||
        isAdminRouteElement(element)
    );
  } catch {
    return false;
  }
}

function currentRole(AppCore = null, isAdminFn = null) {
  try {
    if (isFunction(isAdminFn) && isAdminFn(AppCore) === true) return "admin";
  } catch {
    // noop
  }

  const state = isObject(AppCore?.state) ? AppCore.state : {};
  const user =
    state.user ||
    state.currentUser ||
    state.authUser ||
    state.sessionUser ||
    state.session?.user ||
    null;

  try {
    const Auth =
      AppCore?.Auth ||
      AppCore?.auth ||
      AppCore?.modules?.get?.("Auth") ||
      AppCore?.modules?.get?.("auth") ||
      null;

    if (Auth?.isCurrentUserAdmin?.() === true || Auth?.isAdmin?.() === true) {
      return "admin";
    }

    const role = Auth?.getCurrentRole?.() || Auth?.getRole?.();
    if (role) return normalizeRole(role);
  } catch {
    // noop
  }

  return normalizeRole(state.role || user?.role || user?.rol || "user");
}

function userCanSee(element = null, role = "user") {
  if (!accessControlled(element)) return true;
  if (role === "admin") return true;

  if (elementAdminOnly(element)) return false;

  const roles = requiredRoles(element);

  if (!roles.length) return true;

  return roles.includes("user");
}

/* =========================================================
   REPAIR NORMAL ITEMS
========================================================= */

function repairNormalItems(root = null) {
  let repaired = 0;

  for (const element of queryAll(MENU_SELECTOR, root)) {
    if (accessControlled(element)) continue;

    const wasHidden = !elementVisible(element);

    setVisible(element, true);

    if (wasHidden) repaired += 1;
  }

  return repaired;
}

function clearHiddenActive(root = null) {
  let cleared = 0;

  for (const element of queryAll(".active,.is-active,.router-active,[aria-current]", root)) {
    if (elementVisible(element)) continue;

    try {
      element.classList.remove("active", "is-active", "router-active");
      element.removeAttribute("aria-current");
      element.dataset.active = "false";
      element.dataset.current = "false";
      element.dataset.selected = "false";
      cleared += 1;
    } catch {
      // noop
    }
  }

  return cleared;
}

/* =========================================================
   MAIN
========================================================= */

export function applyRoleVisibility(AppCore = null, _ensureServerNavItem = null, isAdminFn = null) {
  const root = sidebarRoot(AppCore);

  if (!root) {
    return false;
  }

  const role = currentRole(AppCore, isAdminFn);
  const admin = role === "admin";

  const controlled = [
    ...new Set([
      ...queryAll(CONTROLLED_SELECTOR, root),
      ...queryAll(MENU_SELECTOR, root).filter(isAdminRouteElement),
    ]),
  ];

  let visibleCount = 0;
  let hiddenCount = 0;

  for (const element of controlled) {
    const visible = userCanSee(element, role);

    setVisible(element, visible);

    if (visible) visibleCount += 1;
    else hiddenCount += 1;
  }

  const normalRepairedCount = repairNormalItems(root);
  const clearedActiveCount = clearHiddenActive(root);

  const payload = {
    ok: true,
    isAdmin: admin,
    role,
    roles: [role],
    visibleCount,
    hiddenCount,
    totalCount: controlled.length,
    normalRepairedCount,
    clearedActiveCount,
  };

  emit(AppCore, "sidebar:role-visibility:applied", payload);
  emit(AppCore, "sidebar:visibility:applied", payload);

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function elementSnapshot(element = null) {
  if (!element) return null;

  return {
    id: element.id || "",
    tag: element.tagName?.toLowerCase?.() || "",
    text: text(element.textContent, ""),
    route: elementRoute(element),
    accessControlled: accessControlled(element),
    requiredRoles: requiredRoles(element),
    adminOnly: elementAdminOnly(element),
    visible: elementVisible(element),
    hidden: Boolean(element.hidden),
    ariaHidden: element.getAttribute?.("aria-hidden") || "",
    sidebarVisible: element.dataset?.sidebarVisible || "",
    roleVisible: element.dataset?.roleVisible || "",
    adminVisible: element.dataset?.adminVisible || "",
  };
}

export function getRoleVisibilitySnapshot(AppCore = null, isAdminFn = null) {
  const root = sidebarRoot(AppCore);
  const role = currentRole(AppCore, isAdminFn);
  const controlled = root
    ? [
        ...new Set([
          ...queryAll(CONTROLLED_SELECTOR, root),
          ...queryAll(MENU_SELECTOR, root).filter(isAdminRouteElement),
        ]),
      ]
    : [];

  const visible = controlled.filter(elementVisible);
  const hidden = controlled.filter((element) => !elementVisible(element));

  return {
    version: SIDEBAR_VISIBILITY_VERSION,

    ok: Boolean(root),
    isAdmin: role === "admin",
    role,
    roles: [role],

    counts: {
      roleManagedTotal: controlled.length,
      roleManagedVisible: visible.length,
      roleManagedHidden: hidden.length,
    },

    roleItems: controlled.map(elementSnapshot),

    policy: {
      compatOnly: true,
      noImports: true,
      roles: ["admin", "user"],
      noPermissions: true,
      noLegacyRoles: true,
      noCustomEvent: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_VISIBILITY_VERSION,
  applyRoleVisibility,
  getRoleVisibilitySnapshot,
};
