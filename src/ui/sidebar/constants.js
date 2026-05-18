/* =========================================================
   Onion Support - Sidebar Constants
   Archivo: /src/ui/sidebar/constants.js

   Responsabilidad:
   - Constantes mínimas de compat para Sidebar.
   - Sin imports.
   - Sin DOM.
   - Sin runtime.
   - Sin storage keys.
   - Sin permisos complejos.
   - Sin roles inventados.
   - Sin rutas legacy.
   - Token param único: token.
   - Roles únicos: admin / user.
========================================================= */

export const SIDEBAR_CONSTANTS_VERSION = "simple";

/* =========================================================
   HELPERS
========================================================= */

function freeze(value) {
  try {
    return Object.freeze(value);
  } catch {
    return value;
  }
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function cloneArray(value = []) {
  return Array.isArray(value) ? [...value] : [];
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* =========================================================
   MODULE / SCOPES
========================================================= */

export const SIDEBAR_MODULE_NAME = "SidebarUI";
export const SIDEBAR_MODULE_KEY = "sidebar";
export const SIDEBAR_COMPONENT_NAME = "sidebar";

export const SCOPE = "ui:sidebar";
export const SIDEBAR_SCOPE = SCOPE;
export const SIDEBAR_DOM_SCOPE = `${SCOPE}:dom`;
export const SIDEBAR_CORE_SCOPE = `${SCOPE}:core`;
export const SIDEBAR_EVENTS_SCOPE = `${SCOPE}:events`;
export const SIDEBAR_FALLBACK_SCOPE = `${SCOPE}:fallback`;
export const SIDEBAR_STATE_SCOPE = `${SCOPE}:state`;
export const SIDEBAR_DROPDOWN_SCOPE = `${SCOPE}:dropdown`;
export const SIDEBAR_VISIBILITY_SCOPE = `${SCOPE}:visibility`;
export const SIDEBAR_ACTIONS_SCOPE = `${SCOPE}:actions`;
export const SIDEBAR_TEMPLATE_SCOPE = `${SCOPE}:template`;
export const SIDEBAR_USER_SCOPE = `${SCOPE}:user`;
export const SIDEBAR_INDICATOR_SCOPE = `${SCOPE}:indicator`;
export const SIDEBAR_REPAIR_SCOPE = `${SCOPE}:repair`;
export const SIDEBAR_DIAGNOSTICS_SCOPE = `${SCOPE}:diagnostics`;

/* =========================================================
   RESPONSIVE / TIMINGS
========================================================= */

export const MOBILE_BREAKPOINT = 900;
export const SIDEBAR_MOBILE_BREAKPOINT = MOBILE_BREAKPOINT;
export const SIDEBAR_NARROW_BREAKPOINT = 640;
export const SIDEBAR_COMPACT_BREAKPOINT = 420;

export const SIDEBAR_TRANSITION_MS = 200;
export const SIDEBAR_VISUAL_SYNC_DELAY_MS = 0;
export const SIDEBAR_VISUAL_SYNC_AFTER_NAV_MS = 0;
export const SIDEBAR_VISUAL_SYNC_AFTER_RENDER_MS = 0;
export const SIDEBAR_VISUAL_SYNC_AFTER_TRANSITION_MS = 0;
export const SIDEBAR_HOVER_FLUSH_MS = 0;
export const SIDEBAR_BIND_DEDUP_WINDOW_MS = 0;
export const SIDEBAR_REPAIR_DEDUP_WINDOW_MS = 0;
export const SIDEBAR_REFRESH_DEDUP_WINDOW_MS = 0;
export const SIDEBAR_SYNC_DEDUP_WINDOW_MS = 0;
export const SIDEBAR_INDICATOR_DEFAULT_DELAY_MS = 0;
export const SIDEBAR_INDICATOR_RECALC_DELAY_MS = 0;
export const SIDEBAR_INDICATOR_SETTLED_DELAY_MS = 0;
export const SIDEBAR_DROPDOWN_CLOSE_DELAY_MS = 0;
export const SIDEBAR_DROPDOWN_FOCUS_DELAY_MS = 0;
export const SIDEBAR_DROPDOWN_OUTSIDE_POINTER_DELAY_MS = 0;
export const SIDEBAR_RESIZE_DEBOUNCE_MS = 0;
export const SIDEBAR_ROUTER_SETTLED_DELAY_MS = 0;
export const SIDEBAR_AUTH_SETTLED_DELAY_MS = 0;
export const SIDEBAR_LANG_SETTLED_DELAY_MS = 0;
export const SIDEBAR_THEME_SETTLED_DELAY_MS = 0;

/* =========================================================
   DOM IDS
========================================================= */

export const SIDEBAR_ROOT_ID = "sidebar";
export const SIDEBAR_ROOT_LEGACY_ID = "app-sidebar";
export const SIDEBAR_MOUNT_ID = "sidebar-mount";
export const SIDEBAR_NAV_ID = "sidebar-nav";
export const SIDEBAR_MENU_ID = "sidebar-menu";
export const SIDEBAR_RECENTS_ID = "sidebar-recents";
export const SIDEBAR_FOOTER_ID = "sidebar-footer";
export const SIDEBAR_INDICATOR_ID = "sidebar-active-indicator";
export const SIDEBAR_SCROLL_ID = "sidebar-scroll";
export const SIDEBAR_CONTENT_ID = "sidebar-content";

export const SIDEBAR_TOGGLE_ID = "toggleSidebar";
export const SIDEBAR_TOGGLE_LEGACY_ID = "sidebarToggle";
export const SIDEBAR_MOBILE_TOGGLE_ID = "toggleSidebarMobile";
export const SIDEBAR_MOBILE_TOGGLE_LEGACY_ID = "sidebarMobileToggle";

export const SIDEBAR_LOGO_ID = "homeLink";
export const SIDEBAR_LOGO_LEGACY_ID = "sidebarLogo";

export const USER_SECTION_ID = "sidebar-user";
export const USER_TOGGLE_ID = "userToggle";
export const USER_TOGGLE_LEGACY_ID = "sidebarUserToggle";
export const USER_DROPDOWN_ID = "userDropdown";
export const USER_DROPDOWN_LEGACY_ID = "sidebarUserDropdown";

export const LOGOUT_BUTTON_ID = "logoutBtn";
export const LOGOUT_BUTTON_LEGACY_ID = "sidebarLogout";

export const SIDEBAR_AVATAR_ID = "sidebar-avatar";
export const SIDEBAR_AVATAR_LEGACY_ID = "sidebarAvatar";
export const SIDEBAR_AVATAR_IMAGE_ID = "sidebarAvatarImage";
export const SIDEBAR_AVATAR_FALLBACK_ID = "sidebarAvatarFallback";

export const SIDEBAR_NAME_ID = "sidebar-name";
export const SIDEBAR_NAME_LEGACY_ID = "sidebarName";
export const SIDEBAR_USER_PLAN_ID = "sidebarUserPlan";

export const SERVER_NAV_ID = "sidebar-server-link";

/* =========================================================
   ROUTES
========================================================= */

export const HOME_ROUTE = "/";
export const INCIDENCIAS_ROUTE = "/incidencias";
export const FACTURAS_ROUTE = "/facturas";
export const USUARIOS_ROUTE = "/usuarios";
export const CLIENTES_ROUTE = "/clientes";
export const CUENTA_ROUTE = "/cuenta";
export const AJUSTES_ROUTE = "/ajustes";
export const SERVER_ROUTE = "/servidor";

export const LOGIN_ROUTE = "/login";
export const ACTIVATE_ACCOUNT_ROUTE = "/activate-account";
export const PASSWORD_REQUEST_ROUTE = "/password-request";
export const PASSWORD_RESET_ROUTE = "/password-reset";

/* Compat vacía: estas rutas no existen en el SPA mínimo. */
export const LOGOUT_ROUTE = "";
export const RESET_PASSWORD_ROUTE = "";
export const RESET_PASSWORD_CONFIRM_ROUTE = "";
export const FORGOT_PASSWORD_ROUTE = "";
export const RECOVER_PASSWORD_ROUTE = "";
export const NOT_FOUND_ROUTE = "";
export const FORBIDDEN_ROUTE = "";

export const SIDEBAR_ROUTE_KEYS = freeze({
  home: "home",
  incidencias: "incidencias",
  facturas: "facturas",
  usuarios: "usuarios",
  clientes: "clientes",
  cuenta: "cuenta",
  ajustes: "ajustes",
  servidor: "servidor",
  login: "login",
  activateAccount: "activateAccount",
  passwordRequest: "passwordRequest",
  passwordReset: "passwordReset",

  /* Compat aliases internos, no rutas nuevas. */
  tickets: "incidencias",
  invoices: "facturas",
  users: "usuarios",
  clients: "clientes",
  account: "cuenta",
  settings: "ajustes",
  server: "servidor",
});

export const SIDEBAR_ROUTES = freeze({
  home: HOME_ROUTE,
  incidencias: INCIDENCIAS_ROUTE,
  facturas: FACTURAS_ROUTE,
  usuarios: USUARIOS_ROUTE,
  clientes: CLIENTES_ROUTE,
  cuenta: CUENTA_ROUTE,
  ajustes: AJUSTES_ROUTE,
  servidor: SERVER_ROUTE,

  login: LOGIN_ROUTE,
  activateAccount: ACTIVATE_ACCOUNT_ROUTE,
  passwordRequest: PASSWORD_REQUEST_ROUTE,
  passwordReset: PASSWORD_RESET_ROUTE,

  /* Compat aliases internos. */
  tickets: INCIDENCIAS_ROUTE,
  invoices: FACTURAS_ROUTE,
  users: USUARIOS_ROUTE,
  clients: CLIENTES_ROUTE,
  account: CUENTA_ROUTE,
  settings: AJUSTES_ROUTE,
  server: SERVER_ROUTE,
});

/* Sin aliases legacy. Sólo normalización exacta. */
export const SIDEBAR_ROUTE_ALIASES = freeze({});

function isHashRouterPath(value = "") {
  const raw = text(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = text(value, "/");

  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";

  return raw.replace(/^#\/?/, "/") || "/";
}

function normalizePathname(path = "/") {
  let value = text(path, "/").replace(/\\/g, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value || "/";
}

function splitPath(path = "/") {
  let raw = text(path, "/");

  if (isHashRouterPath(raw)) raw = normalizeHashRouterPath(raw);

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const url = new URL(raw, "http://localhost");
      raw = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    } catch {
      raw = "/";
    }
  }

  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return {
    pathname: normalizePathname(pathname),
    search: search ? `?${search.replace(/^\?+/, "")}` : "",
    hash: hash ? `#${hash.replace(/^#+/, "")}` : "",
  };
}

export function normalizeSidebarRoute(path = "/") {
  return splitPath(path).pathname || "/";
}

export function normalizeSidebarPublicPath(path = "/", options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const parts = splitPath(path);

  return `${parts.pathname}${opts.preserveSearch !== false ? parts.search : ""}${opts.preserveHash === true ? parts.hash : ""}`;
}

export function resolveSidebarRouteAlias(path = "/") {
  return normalizeSidebarRoute(path);
}

export const SIDEBAR_PUBLIC_ROUTES = freeze([
  LOGIN_ROUTE,
  ACTIVATE_ACCOUNT_ROUTE,
  PASSWORD_REQUEST_ROUTE,
  PASSWORD_RESET_ROUTE,
]);

export const SIDEBAR_TECHNICAL_PUBLIC_ROUTES = freeze([
  ACTIVATE_ACCOUNT_ROUTE,
  PASSWORD_RESET_ROUTE,
]);

export const SIDEBAR_AUTH_ROUTES = freeze([...SIDEBAR_PUBLIC_ROUTES]);
export const SIDEBAR_SHELL_HIDDEN_ROUTES = freeze([...SIDEBAR_PUBLIC_ROUTES]);

export const SIDEBAR_PRIVATE_ROUTES = freeze([
  HOME_ROUTE,
  INCIDENCIAS_ROUTE,
  FACTURAS_ROUTE,
  USUARIOS_ROUTE,
  CLIENTES_ROUTE,
  CUENTA_ROUTE,
  AJUSTES_ROUTE,
  SERVER_ROUTE,
]);

export const SIDEBAR_ADMIN_ROUTES = freeze([
  USUARIOS_ROUTE,
  CLIENTES_ROUTE,
  SERVER_ROUTE,
]);

export function isSidebarPublicRoute(path = "/") {
  return SIDEBAR_PUBLIC_ROUTES.includes(normalizeSidebarRoute(path));
}

export function isSidebarAuthRoute(path = "/") {
  return SIDEBAR_AUTH_ROUTES.includes(normalizeSidebarRoute(path));
}

export function isSidebarShellHiddenRoute(path = "/") {
  return SIDEBAR_SHELL_HIDDEN_ROUTES.includes(normalizeSidebarRoute(path));
}

export function isSidebarAdminRoute(path = "/") {
  return SIDEBAR_ADMIN_ROUTES.includes(normalizeSidebarRoute(path));
}

/* =========================================================
   TOKEN SAFETY
========================================================= */

export const SIDEBAR_SENSITIVE_QUERY_PARAM_NAMES = freeze(["token"]);

export const SIDEBAR_TOKEN_ROUTE_PREFIXES = freeze([]);

export function redactSidebarSensitiveText(value = "") {
  let output = text(value, "");

  if (!output) return "";

  try {
    output = output.replace(
      new RegExp(`([?&#]${escapeRegExp("token")}=)([^&#\\s]+)`, "gi"),
      "$1***"
    );
  } catch {
    // noop
  }

  try {
    output = output.replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
  } catch {
    // noop
  }

  return output;
}

/* =========================================================
   MENU
========================================================= */

export const SIDEBAR_MENU_KEYS = freeze({
  home: "home",
  tickets: "incidencias",
  invoices: "facturas",
  users: "usuarios",
  clients: "clientes",
  account: "cuenta",
  settings: "ajustes",
  server: "servidor",

  incidencias: "incidencias",
  facturas: "facturas",
  usuarios: "usuarios",
  clientes: "clientes",
  cuenta: "cuenta",
  ajustes: "ajustes",
  servidor: "servidor",
});

export const SIDEBAR_MENU_ORDER = freeze([
  HOME_ROUTE,
  INCIDENCIAS_ROUTE,
  FACTURAS_ROUTE,
  USUARIOS_ROUTE,
  CLIENTES_ROUTE,
  CUENTA_ROUTE,
  AJUSTES_ROUTE,
  SERVER_ROUTE,
]);

export const SIDEBAR_NAV_ITEMS = freeze([
  {
    key: "home",
    route: HOME_ROUTE,
    labelFallback: "Inicio",
    adminOnly: false,
    order: 10,
  },
  {
    key: "incidencias",
    route: INCIDENCIAS_ROUTE,
    labelFallback: "Incidencias",
    adminOnly: false,
    order: 20,
  },
  {
    key: "facturas",
    route: FACTURAS_ROUTE,
    labelFallback: "Facturas",
    adminOnly: false,
    order: 30,
  },
  {
    key: "usuarios",
    route: USUARIOS_ROUTE,
    labelFallback: "Usuarios",
    adminOnly: true,
    requiredRole: "admin",
    requiredRoles: ["admin"],
    order: 40,
  },
  {
    key: "clientes",
    route: CLIENTES_ROUTE,
    labelFallback: "Clientes",
    adminOnly: true,
    requiredRole: "admin",
    requiredRoles: ["admin"],
    order: 50,
  },
  {
    key: "cuenta",
    route: CUENTA_ROUTE,
    labelFallback: "Cuenta",
    adminOnly: false,
    order: 60,
  },
  {
    key: "ajustes",
    route: AJUSTES_ROUTE,
    labelFallback: "Ajustes",
    adminOnly: false,
    order: 70,
  },
  {
    key: "servidor",
    route: SERVER_ROUTE,
    labelFallback: "Servidor",
    adminOnly: true,
    requiredRole: "admin",
    requiredRoles: ["admin"],
    order: 80,
  },
]);

export function getSidebarNavItems() {
  return SIDEBAR_NAV_ITEMS.map((item) => ({
    ...item,
    requiredRoles: cloneArray(item.requiredRoles),
  }));
}

export function getSidebarRouteKeyByPath(path = "/") {
  const route = normalizeSidebarRoute(path);
  return SIDEBAR_NAV_ITEMS.find((item) => item.route === route)?.key || "";
}

/* =========================================================
   ACTIONS
========================================================= */

export const SIDEBAR_ACTION_NAVIGATE = "navigate";
export const SIDEBAR_ACTION_TOGGLE = "toggle-sidebar";
export const SIDEBAR_ACTION_OPEN = "open-sidebar";
export const SIDEBAR_ACTION_CLOSE = "close-sidebar";
export const SIDEBAR_ACTION_COLLAPSE = "collapse-sidebar";
export const SIDEBAR_ACTION_EXPAND = "expand-sidebar";
export const SIDEBAR_ACTION_TOGGLE_MOBILE = "mobile-sidebar-toggle";
export const SIDEBAR_ACTION_OPEN_MOBILE = "open-mobile-sidebar";
export const SIDEBAR_ACTION_CLOSE_MOBILE = "close-mobile-sidebar";
export const SIDEBAR_ACTION_TOGGLE_USER = "toggle-user-dropdown";
export const SIDEBAR_ACTION_OPEN_USER_MENU = "open-user-menu";
export const SIDEBAR_ACTION_CLOSE_USER_MENU = "close-user-menu";
export const SIDEBAR_ACTION_REFRESH = "refresh-sidebar";
export const SIDEBAR_ACTION_REPAIR = "repair-sidebar";
export const SIDEBAR_ACTION_SYNC_USER = "sync-user";
export const SIDEBAR_ACTION_SYNC_ACTIVE = "sync-active";
export const SIDEBAR_ACTION_ADD_ACCOUNT = "add-account";
export const SIDEBAR_ACTION_CHANGE_PLAN = "change-plan";
export const SIDEBAR_ACTION_PROFILE = "profile";
export const SIDEBAR_ACTION_SETTINGS = "settings";
export const SIDEBAR_ACTION_HELP = "help";
export const SIDEBAR_ACTION_LOGOUT = "logout";

export const SIDEBAR_ACTIONS = freeze({
  navigate: SIDEBAR_ACTION_NAVIGATE,
  toggle: SIDEBAR_ACTION_TOGGLE,
  open: SIDEBAR_ACTION_OPEN,
  close: SIDEBAR_ACTION_CLOSE,
  collapse: SIDEBAR_ACTION_COLLAPSE,
  expand: SIDEBAR_ACTION_EXPAND,
  toggleMobile: SIDEBAR_ACTION_TOGGLE_MOBILE,
  openMobile: SIDEBAR_ACTION_OPEN_MOBILE,
  closeMobile: SIDEBAR_ACTION_CLOSE_MOBILE,
  toggleUser: SIDEBAR_ACTION_TOGGLE_USER,
  openUserMenu: SIDEBAR_ACTION_OPEN_USER_MENU,
  closeUserMenu: SIDEBAR_ACTION_CLOSE_USER_MENU,
  refresh: SIDEBAR_ACTION_REFRESH,
  repair: SIDEBAR_ACTION_REPAIR,
  syncUser: SIDEBAR_ACTION_SYNC_USER,
  syncActive: SIDEBAR_ACTION_SYNC_ACTIVE,
  profile: SIDEBAR_ACTION_PROFILE,
  settings: SIDEBAR_ACTION_SETTINGS,
  help: SIDEBAR_ACTION_HELP,
  logout: SIDEBAR_ACTION_LOGOUT,
});

export const SIDEBAR_ACTION_ALIASES = freeze({
  navigate: SIDEBAR_ACTION_NAVIGATE,
  toggle: SIDEBAR_ACTION_TOGGLE,
  open: SIDEBAR_ACTION_OPEN,
  close: SIDEBAR_ACTION_CLOSE,
  logout: SIDEBAR_ACTION_LOGOUT,
});

/* =========================================================
   DATA ATTRS / SELECTORS
========================================================= */

export const SIDEBAR_DATA_ATTRS = freeze({
  root: "data-sidebar-root",
  mount: "data-sidebar-mount",
  nav: "data-sidebar-nav",
  item: "data-sidebar-nav-link",
  route: "data-route",
  spa: "data-spa",
  active: "data-active",
  logout: "data-sidebar-logout",
});

export const SIDEBAR_SELECTORS = freeze({
  root: "#app-sidebar, #sidebar, [data-sidebar-root]",
  mount: "#sidebar-mount, [data-sidebar-mount]",
  nav: "[data-sidebar-nav]",
  menu: "[data-sidebar-nav]",
  footer: "[data-sidebar-footer]",
  logoutButton: "[data-sidebar-logout]",
  navItems: "[data-sidebar-nav-link]",
  spaLinks: "a[data-spa]",
  adminOnly: "[data-admin-only='true'], [data-required-role='admin']",
  roleManaged: "[data-role], [data-roles], [data-required-role], [data-required-roles]",
  hiddenOrDisabled: "[hidden], [aria-hidden='true'], [aria-disabled='true']",
  focusable: "a[href], button, input, select, textarea, [tabindex]",
});

/* =========================================================
   STORAGE / CLASSES / DATA VALUES
========================================================= */

export const DESKTOP_COLLAPSED_STORAGE_KEY = "";
export const LEGACY_SIDEBAR_OPEN_STORAGE_KEY = "";
export const SIDEBAR_STORAGE_NAMESPACE = "";
export const SIDEBAR_STORAGE_NAMESPACE_ONION = "";
export const SIDEBAR_STORAGE_KEYS = freeze({});

export const SIDEBAR_CLASSES = freeze({
  root: "sidebar",
  mounted: "sidebar-mounted",
  ready: "is-ready",
  collapsed: "is-collapsed",
  isCollapsed: "is-collapsed",
  expanded: "is-open",
  isExpanded: "is-open",
  open: "is-open",
  isOpen: "is-open",
  mobileOpen: "is-open",
  hidden: "is-hidden",
  visuallyHidden: "is-visually-hidden",
  active: "active",
  isActive: "is-active",
  routerActive: "router-active",
  disabled: "is-disabled",
  loading: "is-loading",
  dropdownOpen: "is-open",
  dropdownIsOpen: "is-open",
  dropdownVisible: "is-visible",
  roleHidden: "is-role-hidden",
  adminHidden: "is-admin-hidden",
  permissionHidden: "is-role-hidden",
  transitioning: "is-transitioning",
  bodyTransitioning: "sidebar-transitioning",
  visualSyncing: "is-visual-syncing",
  bodyVisualSyncing: "sidebar-visual-syncing",
  tooltipsActive: "sidebar-tooltips-active",
  avatarHasImage: "has-image",
  avatarHasFallback: "has-fallback",
  avatarLoading: "is-loading",
});

export const SIDEBAR_SEARCH_GLASS_CLASSES = freeze({
  active: "",
  sidebarStable: "",
  topbarStable: "",
  chromeStable: "",
});

export const SIDEBAR_DATASET_VALUES = freeze({
  true: "true",
  false: "false",
  open: "open",
  closed: "closed",
  hidden: "hidden",
  visible: "visible",
  desktop: "desktop",
  mobile: "mobile",
  admin: "admin",
  user: "user",
  page: "page",
  ready: "ready",
  pending: "pending",
  error: "error",
});

/* =========================================================
   SHELL / EVENTS
========================================================= */

export const SIDEBAR_SHELL_HIDDEN_BODY_CLASSES = freeze(["route-auth", "shell-hidden"]);
export const SIDEBAR_SHELL_VISIBLE_BODY_CLASSES = freeze(["route-app", "shell-visible"]);

export const SIDEBAR_SHELL_DATA_VALUES = freeze({
  hidden: "hidden",
  visible: "visible",
  auth: "auth",
  app: "app",
});

export const SIDEBAR_EVENTS = freeze({
  ready: "sidebar:ready",
  destroyed: "sidebar:destroyed",
  mounted: "sidebar:mounted",
  unmounted: "sidebar:unmounted",
  repaired: "sidebar:repaired",
  refreshed: "sidebar:refreshed",
  eventsBound: "sidebar:events:bound",
  eventsUnbound: "sidebar:events:unbound",
  stateSynced: "sidebar:state:synced",
  activeRouteSynced: "sidebar:active-route:synced",
  userRendered: "sidebar:user:rendered",
  userCleared: "sidebar:user:cleared",
  roleVisibilityApplied: "sidebar:role-visibility:applied",
  visibilityApplied: "sidebar:visibility:applied",
  dropdownOpen: "sidebar:dropdown:open",
  dropdownClose: "sidebar:dropdown:close",
  dropdownToggle: "sidebar:dropdown:toggle",
  navigationRequest: "sidebar:navigation:request",
  logoutStart: "sidebar:logout:start",
  logoutComplete: "sidebar:logout:complete",
  logoutError: "sidebar:logout:error",
});

export const SIDEBAR_OBSERVED_APP_EVENTS = freeze([]);
export const SIDEBAR_OBSERVED_AUTH_EVENTS = freeze([]);
export const SIDEBAR_OBSERVED_ROUTER_EVENTS = freeze([]);
export const SIDEBAR_BLOCKED_ROUTER_EVENTS = freeze([]);

/* =========================================================
   ROLES / FLAGS
========================================================= */

export const SIDEBAR_ADMIN_ROLE_KEYS = freeze(["admin"]);
export const SIDEBAR_SUPPORT_ROLE_KEYS = freeze([]);
export const SIDEBAR_MANAGER_ROLE_KEYS = freeze([]);
export const SIDEBAR_CLIENT_ROLE_KEYS = freeze(["user"]);

export const SIDEBAR_ADMIN_PERMISSION_KEYS = freeze([]);
export const SIDEBAR_SUPPORT_PERMISSION_KEYS = freeze([]);

export const SIDEBAR_ADMIN_FLAG_KEYS = freeze(["isAdmin", "admin"]);
export const SIDEBAR_SUPPORT_FLAG_KEYS = freeze([]);

export const SIDEBAR_ROLE_GROUPS = freeze({
  admin: SIDEBAR_ADMIN_ROLE_KEYS,
  user: SIDEBAR_CLIENT_ROLE_KEYS,
  support: SIDEBAR_SUPPORT_ROLE_KEYS,
  manager: SIDEBAR_MANAGER_ROLE_KEYS,
  client: SIDEBAR_CLIENT_ROLE_KEYS,
});

/* =========================================================
   HANDLED FLAGS / I18N
========================================================= */

export const SIDEBAR_HANDLED_FLAG = "__onionSidebarHandled";
export const SIDEBAR_EVENTS_HANDLED_FLAG = "__onionSidebarEventsHandled";
export const SIDEBAR_HANDLED_REASON_FLAG = "__onionSidebarReason";

export const SIDEBAR_I18N_KEYS = freeze({
  ariaMain: "sidebar.aria.main",
  ariaNavigation: "sidebar.aria.navigation",
  menuHome: "sidebar.menu.home",
  menuTickets: "sidebar.menu.tickets",
  menuInvoices: "sidebar.menu.invoices",
  menuUsers: "sidebar.menu.users",
  menuClients: "sidebar.menu.clients",
  menuAccount: "sidebar.menu.account",
  menuSettings: "sidebar.menu.settings",
  menuServer: "sidebar.menu.server",
  userLogout: "sidebar.user.logout",
});

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarConstantsSnapshot() {
  return freeze({
    version: SIDEBAR_CONSTANTS_VERSION,

    module: {
      name: SIDEBAR_MODULE_NAME,
      key: SIDEBAR_MODULE_KEY,
      component: SIDEBAR_COMPONENT_NAME,
      scope: SCOPE,
    },

    routes: {
      routes: SIDEBAR_ROUTES,
      public: SIDEBAR_PUBLIC_ROUTES,
      auth: SIDEBAR_AUTH_ROUTES,
      shellHidden: SIDEBAR_SHELL_HIDDEN_ROUTES,
      private: SIDEBAR_PRIVATE_ROUTES,
      admin: SIDEBAR_ADMIN_ROUTES,
    },

    menu: {
      keys: SIDEBAR_MENU_KEYS,
      order: SIDEBAR_MENU_ORDER,
      items: SIDEBAR_NAV_ITEMS,
    },

    actions: SIDEBAR_ACTIONS,
    selectors: SIDEBAR_SELECTORS,
    dataAttrs: SIDEBAR_DATA_ATTRS,

    roles: {
      admin: SIDEBAR_ADMIN_ROLE_KEYS,
      user: SIDEBAR_CLIENT_ROLE_KEYS,
    },

    tokenSafe: {
      sensitiveParams: SIDEBAR_SENSITIVE_QUERY_PARAM_NAMES,
      tokenParam: "token",
    },

    policy: {
      compatOnly: true,
      noLegacyRoutes: true,
      noStorage: true,
      noEventStorms: true,
      roles: ["admin", "user"],
    },
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default freeze({
  SIDEBAR_MODULE_NAME,
  SIDEBAR_MODULE_KEY,
  SIDEBAR_COMPONENT_NAME,
  SIDEBAR_CONSTANTS_VERSION,

  SCOPE,
  SIDEBAR_SCOPE,
  SIDEBAR_DOM_SCOPE,
  SIDEBAR_CORE_SCOPE,
  SIDEBAR_EVENTS_SCOPE,
  SIDEBAR_FALLBACK_SCOPE,
  SIDEBAR_STATE_SCOPE,
  SIDEBAR_DROPDOWN_SCOPE,
  SIDEBAR_VISIBILITY_SCOPE,
  SIDEBAR_ACTIONS_SCOPE,
  SIDEBAR_TEMPLATE_SCOPE,
  SIDEBAR_USER_SCOPE,
  SIDEBAR_INDICATOR_SCOPE,
  SIDEBAR_REPAIR_SCOPE,
  SIDEBAR_DIAGNOSTICS_SCOPE,

  MOBILE_BREAKPOINT,
  SIDEBAR_MOBILE_BREAKPOINT,
  SIDEBAR_NARROW_BREAKPOINT,
  SIDEBAR_COMPACT_BREAKPOINT,

  SIDEBAR_TRANSITION_MS,
  SIDEBAR_VISUAL_SYNC_DELAY_MS,
  SIDEBAR_VISUAL_SYNC_AFTER_NAV_MS,
  SIDEBAR_VISUAL_SYNC_AFTER_RENDER_MS,
  SIDEBAR_VISUAL_SYNC_AFTER_TRANSITION_MS,
  SIDEBAR_HOVER_FLUSH_MS,
  SIDEBAR_BIND_DEDUP_WINDOW_MS,
  SIDEBAR_REPAIR_DEDUP_WINDOW_MS,
  SIDEBAR_REFRESH_DEDUP_WINDOW_MS,
  SIDEBAR_SYNC_DEDUP_WINDOW_MS,
  SIDEBAR_INDICATOR_DEFAULT_DELAY_MS,
  SIDEBAR_INDICATOR_RECALC_DELAY_MS,
  SIDEBAR_INDICATOR_SETTLED_DELAY_MS,
  SIDEBAR_DROPDOWN_CLOSE_DELAY_MS,
  SIDEBAR_DROPDOWN_FOCUS_DELAY_MS,
  SIDEBAR_DROPDOWN_OUTSIDE_POINTER_DELAY_MS,
  SIDEBAR_RESIZE_DEBOUNCE_MS,
  SIDEBAR_ROUTER_SETTLED_DELAY_MS,
  SIDEBAR_AUTH_SETTLED_DELAY_MS,
  SIDEBAR_LANG_SETTLED_DELAY_MS,
  SIDEBAR_THEME_SETTLED_DELAY_MS,

  SIDEBAR_ROOT_ID,
  SIDEBAR_ROOT_LEGACY_ID,
  SIDEBAR_MOUNT_ID,
  SIDEBAR_NAV_ID,
  SIDEBAR_MENU_ID,
  SIDEBAR_RECENTS_ID,
  SIDEBAR_FOOTER_ID,
  SIDEBAR_INDICATOR_ID,
  SIDEBAR_SCROLL_ID,
  SIDEBAR_CONTENT_ID,
  SIDEBAR_TOGGLE_ID,
  SIDEBAR_TOGGLE_LEGACY_ID,
  SIDEBAR_MOBILE_TOGGLE_ID,
  SIDEBAR_MOBILE_TOGGLE_LEGACY_ID,
  SIDEBAR_LOGO_ID,
  SIDEBAR_LOGO_LEGACY_ID,
  USER_SECTION_ID,
  USER_TOGGLE_ID,
  USER_TOGGLE_LEGACY_ID,
  USER_DROPDOWN_ID,
  USER_DROPDOWN_LEGACY_ID,
  LOGOUT_BUTTON_ID,
  LOGOUT_BUTTON_LEGACY_ID,
  SIDEBAR_AVATAR_ID,
  SIDEBAR_AVATAR_LEGACY_ID,
  SIDEBAR_AVATAR_IMAGE_ID,
  SIDEBAR_AVATAR_FALLBACK_ID,
  SIDEBAR_NAME_ID,
  SIDEBAR_NAME_LEGACY_ID,
  SIDEBAR_USER_PLAN_ID,
  SERVER_NAV_ID,

  HOME_ROUTE,
  INCIDENCIAS_ROUTE,
  FACTURAS_ROUTE,
  USUARIOS_ROUTE,
  CLIENTES_ROUTE,
  CUENTA_ROUTE,
  AJUSTES_ROUTE,
  SERVER_ROUTE,
  LOGIN_ROUTE,
  LOGOUT_ROUTE,
  ACTIVATE_ACCOUNT_ROUTE,
  RESET_PASSWORD_ROUTE,
  RESET_PASSWORD_CONFIRM_ROUTE,
  FORGOT_PASSWORD_ROUTE,
  RECOVER_PASSWORD_ROUTE,
  PASSWORD_REQUEST_ROUTE,
  PASSWORD_RESET_ROUTE,
  NOT_FOUND_ROUTE,
  FORBIDDEN_ROUTE,

  SIDEBAR_ROUTE_KEYS,
  SIDEBAR_ROUTES,
  SIDEBAR_ROUTE_ALIASES,

  normalizeSidebarRoute,
  normalizeSidebarPublicPath,
  resolveSidebarRouteAlias,

  SIDEBAR_PUBLIC_ROUTES,
  SIDEBAR_TECHNICAL_PUBLIC_ROUTES,
  SIDEBAR_AUTH_ROUTES,
  SIDEBAR_SHELL_HIDDEN_ROUTES,
  SIDEBAR_PRIVATE_ROUTES,
  SIDEBAR_ADMIN_ROUTES,

  isSidebarPublicRoute,
  isSidebarAuthRoute,
  isSidebarShellHiddenRoute,
  isSidebarAdminRoute,

  SIDEBAR_SENSITIVE_QUERY_PARAM_NAMES,
  SIDEBAR_TOKEN_ROUTE_PREFIXES,
  redactSidebarSensitiveText,

  SIDEBAR_MENU_KEYS,
  SIDEBAR_MENU_ORDER,
  SIDEBAR_NAV_ITEMS,
  getSidebarNavItems,
  getSidebarRouteKeyByPath,

  SIDEBAR_ACTION_NAVIGATE,
  SIDEBAR_ACTION_TOGGLE,
  SIDEBAR_ACTION_OPEN,
  SIDEBAR_ACTION_CLOSE,
  SIDEBAR_ACTION_COLLAPSE,
  SIDEBAR_ACTION_EXPAND,
  SIDEBAR_ACTION_TOGGLE_MOBILE,
  SIDEBAR_ACTION_OPEN_MOBILE,
  SIDEBAR_ACTION_CLOSE_MOBILE,
  SIDEBAR_ACTION_TOGGLE_USER,
  SIDEBAR_ACTION_OPEN_USER_MENU,
  SIDEBAR_ACTION_CLOSE_USER_MENU,
  SIDEBAR_ACTION_REFRESH,
  SIDEBAR_ACTION_REPAIR,
  SIDEBAR_ACTION_SYNC_USER,
  SIDEBAR_ACTION_SYNC_ACTIVE,
  SIDEBAR_ACTION_ADD_ACCOUNT,
  SIDEBAR_ACTION_CHANGE_PLAN,
  SIDEBAR_ACTION_PROFILE,
  SIDEBAR_ACTION_SETTINGS,
  SIDEBAR_ACTION_HELP,
  SIDEBAR_ACTION_LOGOUT,

  SIDEBAR_ACTIONS,
  SIDEBAR_ACTION_ALIASES,

  SIDEBAR_DATA_ATTRS,
  SIDEBAR_SELECTORS,

  DESKTOP_COLLAPSED_STORAGE_KEY,
  LEGACY_SIDEBAR_OPEN_STORAGE_KEY,
  SIDEBAR_STORAGE_NAMESPACE,
  SIDEBAR_STORAGE_NAMESPACE_ONION,
  SIDEBAR_STORAGE_KEYS,

  SIDEBAR_CLASSES,
  SIDEBAR_SEARCH_GLASS_CLASSES,
  SIDEBAR_DATASET_VALUES,

  SIDEBAR_SHELL_HIDDEN_BODY_CLASSES,
  SIDEBAR_SHELL_VISIBLE_BODY_CLASSES,
  SIDEBAR_SHELL_DATA_VALUES,

  SIDEBAR_EVENTS,
  SIDEBAR_OBSERVED_APP_EVENTS,
  SIDEBAR_OBSERVED_AUTH_EVENTS,
  SIDEBAR_OBSERVED_ROUTER_EVENTS,
  SIDEBAR_BLOCKED_ROUTER_EVENTS,

  SIDEBAR_ADMIN_ROLE_KEYS,
  SIDEBAR_SUPPORT_ROLE_KEYS,
  SIDEBAR_MANAGER_ROLE_KEYS,
  SIDEBAR_CLIENT_ROLE_KEYS,
  SIDEBAR_ADMIN_PERMISSION_KEYS,
  SIDEBAR_SUPPORT_PERMISSION_KEYS,
  SIDEBAR_ADMIN_FLAG_KEYS,
  SIDEBAR_SUPPORT_FLAG_KEYS,
  SIDEBAR_ROLE_GROUPS,

  SIDEBAR_HANDLED_FLAG,
  SIDEBAR_EVENTS_HANDLED_FLAG,
  SIDEBAR_HANDLED_REASON_FLAG,

  SIDEBAR_I18N_KEYS,

  getSidebarConstantsSnapshot,
});
