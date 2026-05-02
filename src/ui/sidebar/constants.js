/* =========================================================
   Onion SPA - Sidebar Constants
   Archivo: src/ui/sidebar/constants.js

   FINAL EXTREME SYSTEM · SIDEBAR CONSTANTS · 10/10

   RESPONSABILIDADES:
   - centralizar constantes del módulo sidebar
   - ids del DOM
   - rutas internas del sidebar
   - acciones semánticas del sidebar
   - selectores DOM estables
   - breakpoint mobile
   - claves de storage
   - scope de cleanup / eventos
   - eventos públicos del sidebar
   - clases visuales compartidas
   - flags de rol/admin
   - orden canónico del menú
   - aliases legacy controlados

   HARDENING:
   - ids únicos y estables
   - rutas canónicas sin query/hash
   - storage key versionada / namespaced
   - compatibilidad legacy con sidebar-collapsed/sidebarOpen
   - constantes listas para i18n / template / eventos / estado
   - desktop toggle alineado con DOM real: toggleSidebar
   - sidebarToggle queda solo como legacy selector
   - no se fuerzan imports circulares
========================================================= */

/* =========================================================
   MODULE
========================================================= */

export const SIDEBAR_MODULE_NAME = "SidebarUI";
export const SIDEBAR_MODULE_KEY = "sidebar";
export const SIDEBAR_COMPONENT_NAME = "sidebar";
export const SIDEBAR_CONSTANTS_VERSION = "sidebar-constants-v5-final-pro";

/* =========================================================
   SCOPE
========================================================= */

export const SCOPE = "ui:sidebar";
export const SIDEBAR_SCOPE = SCOPE;

export const SIDEBAR_DOM_SCOPE = `${SCOPE}:dom`;
export const SIDEBAR_CORE_SCOPE = `${SCOPE}:core`;
export const SIDEBAR_FALLBACK_SCOPE = `${SCOPE}:fallback`;

/* =========================================================
   RESPONSIVE
========================================================= */

export const MOBILE_BREAKPOINT = 900;

/* =========================================================
   TIMINGS
========================================================= */

export const SIDEBAR_TRANSITION_MS = 380;
export const SIDEBAR_VISUAL_SYNC_DELAY_MS = 32;
export const SIDEBAR_VISUAL_SYNC_AFTER_NAV_MS = 80;
export const SIDEBAR_HOVER_FLUSH_MS = 96;
export const SIDEBAR_BIND_DEDUP_WINDOW_MS = 250;

export const SIDEBAR_INDICATOR_DEFAULT_DELAY_MS = 40;
export const SIDEBAR_INDICATOR_RECALC_DELAY_MS = 32;
export const SIDEBAR_INDICATOR_SETTLED_DELAY_MS =
  SIDEBAR_TRANSITION_MS + 36;

/* =========================================================
   DOM IDS
========================================================= */

export const SIDEBAR_ROOT_ID = "sidebar";
export const SIDEBAR_MENU_ID = "sidebar-menu";
export const SIDEBAR_RECENTS_ID = "sidebar-recents";

export const SIDEBAR_MOUNT_ID = "sidebar-mount";

/*
  IMPORTANTE:
  El DOM/template actual usa toggleSidebar.
  sidebarToggle queda como alias legacy.
*/
export const SIDEBAR_TOGGLE_ID = "toggleSidebar";
export const SIDEBAR_TOGGLE_LEGACY_ID = "sidebarToggle";

export const SIDEBAR_MOBILE_TOGGLE_ID = "toggleSidebarMobile";
export const SIDEBAR_MOBILE_TOGGLE_LEGACY_ID = "sidebarMobileToggle";

export const SIDEBAR_LOGO_ID = "homeLink";
export const SIDEBAR_LOGO_LEGACY_ID = "sidebarLogo";

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

export const SIDEBAR_ROUTES = Object.freeze({
  home: HOME_ROUTE,

  tickets: INCIDENCIAS_ROUTE,
  incidencias: INCIDENCIAS_ROUTE,

  invoices: FACTURAS_ROUTE,
  facturas: FACTURAS_ROUTE,

  users: USUARIOS_ROUTE,
  usuarios: USUARIOS_ROUTE,

  clients: CLIENTES_ROUTE,
  clientes: CLIENTES_ROUTE,

  account: CUENTA_ROUTE,
  cuenta: CUENTA_ROUTE,

  settings: AJUSTES_ROUTE,
  ajustes: AJUSTES_ROUTE,

  server: SERVER_ROUTE,
  servidor: SERVER_ROUTE,

  login: LOGIN_ROUTE,
});

export const SIDEBAR_ROUTE_ALIASES = Object.freeze({
  "/home": HOME_ROUTE,
  "/inicio": HOME_ROUTE,

  "/tickets": INCIDENCIAS_ROUTE,
  "/ticket": INCIDENCIAS_ROUTE,
  "/incidencia": INCIDENCIAS_ROUTE,

  "/invoices": FACTURAS_ROUTE,
  "/invoice": FACTURAS_ROUTE,
  "/factura": FACTURAS_ROUTE,

  "/users": USUARIOS_ROUTE,
  "/user": USUARIOS_ROUTE,
  "/usuario": USUARIOS_ROUTE,

  "/clients": CLIENTES_ROUTE,
  "/client": CLIENTES_ROUTE,
  "/customers": CLIENTES_ROUTE,
  "/customer": CLIENTES_ROUTE,
  "/cliente": CLIENTES_ROUTE,

  "/account": CUENTA_ROUTE,
  "/profile": CUENTA_ROUTE,
  "/perfil": CUENTA_ROUTE,

  "/settings": AJUSTES_ROUTE,
  "/configuracion": AJUSTES_ROUTE,
  "/configuración": AJUSTES_ROUTE,

  "/server": SERVER_ROUTE,
});

/* =========================================================
   MENU
========================================================= */

export const SIDEBAR_MENU_KEYS = Object.freeze({
  home: "home",
  tickets: "tickets",
  invoices: "invoices",
  users: "users",
  clients: "clients",
  account: "account",
  settings: "settings",
  server: "server",
});

export const SIDEBAR_MENU_ORDER = Object.freeze([
  HOME_ROUTE,
  INCIDENCIAS_ROUTE,
  FACTURAS_ROUTE,
  USUARIOS_ROUTE,
  CLIENTES_ROUTE,
  CUENTA_ROUTE,
  AJUSTES_ROUTE,
  SERVER_ROUTE,
]);

export const SIDEBAR_NAV_ITEMS = Object.freeze([
  Object.freeze({
    key: SIDEBAR_MENU_KEYS.home,
    route: HOME_ROUTE,
    i18nKey: "sidebar.menu.home",
    icon: "home",
    adminOnly: false,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.tickets,
    route: INCIDENCIAS_ROUTE,
    i18nKey: "sidebar.menu.tickets",
    icon: "tickets",
    adminOnly: false,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.invoices,
    route: FACTURAS_ROUTE,
    i18nKey: "sidebar.menu.invoices",
    icon: "invoices",
    adminOnly: false,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.users,
    route: USUARIOS_ROUTE,
    i18nKey: "sidebar.menu.users",
    icon: "users",
    adminOnly: true,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.clients,
    route: CLIENTES_ROUTE,
    i18nKey: "sidebar.menu.clients",
    icon: "clients",
    adminOnly: true,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.account,
    route: CUENTA_ROUTE,
    i18nKey: "sidebar.menu.account",
    icon: "account",
    adminOnly: false,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.settings,
    route: AJUSTES_ROUTE,
    i18nKey: "sidebar.menu.settings",
    icon: "settings",
    adminOnly: false,
  }),

  Object.freeze({
    key: SIDEBAR_MENU_KEYS.server,
    route: SERVER_ROUTE,
    i18nKey: "sidebar.menu.server",
    icon: "server",
    adminOnly: true,
  }),
]);

/* =========================================================
   ACTIONS
========================================================= */

export const SIDEBAR_ACTION_NAVIGATE = "navigate";

export const SIDEBAR_ACTION_TOGGLE = "toggle-sidebar";
export const SIDEBAR_ACTION_TOGGLE_MOBILE = "mobile-sidebar-toggle";
export const SIDEBAR_ACTION_TOGGLE_USER = "toggle-user-dropdown";

export const SIDEBAR_ACTION_OPEN_USER_MENU = "open-user-menu";
export const SIDEBAR_ACTION_CLOSE_USER_MENU = "close-user-menu";

export const SIDEBAR_ACTION_ADD_ACCOUNT = "add-account";
export const SIDEBAR_ACTION_CHANGE_PLAN = "change-plan";
export const SIDEBAR_ACTION_PROFILE = "profile";
export const SIDEBAR_ACTION_SETTINGS = "settings";
export const SIDEBAR_ACTION_HELP = "help";
export const SIDEBAR_ACTION_LOGOUT = "logout";

export const SIDEBAR_ACTIONS = Object.freeze({
  navigate: SIDEBAR_ACTION_NAVIGATE,

  toggle: SIDEBAR_ACTION_TOGGLE,
  toggleSidebar: SIDEBAR_ACTION_TOGGLE,
  toggleMobile: SIDEBAR_ACTION_TOGGLE_MOBILE,
  toggleUser: SIDEBAR_ACTION_TOGGLE_USER,

  openUserMenu: SIDEBAR_ACTION_OPEN_USER_MENU,
  closeUserMenu: SIDEBAR_ACTION_CLOSE_USER_MENU,

  addAccount: SIDEBAR_ACTION_ADD_ACCOUNT,
  changePlan: SIDEBAR_ACTION_CHANGE_PLAN,
  profile: SIDEBAR_ACTION_PROFILE,
  settings: SIDEBAR_ACTION_SETTINGS,
  help: SIDEBAR_ACTION_HELP,
  logout: SIDEBAR_ACTION_LOGOUT,
});

/* =========================================================
   DATA ATTRIBUTES
========================================================= */

export const SIDEBAR_DATA_ATTRS = Object.freeze({
  root: "data-sidebar",
  rootFlag: "data-sidebar-root",

  mount: "data-sidebar-mount",

  menu: "data-sidebar-menu",
  recents: "data-sidebar-recents",
  recent: "data-sidebar-recent",

  item: "data-sidebar-item",
  itemKey: "data-sidebar-item-key",
  nav: "data-sidebar-nav",

  action: "data-sidebar-action",
  route: "data-route",
  href: "data-href",
  to: "data-to",
  spa: "data-spa",

  role: "data-role",
  adminOnly: "data-admin-only",
  requiresRole: "data-requires-role",
  requiredRole: "data-required-role",

  sidebarVisible: "data-sidebar-visible",
  roleVisible: "data-role-visible",
  adminVisible: "data-admin-visible",

  userToggle: "data-user-toggle",
  userDropdown: "data-user-dropdown",
  userMenu: "data-user-menu",

  dropdown: "data-dropdown",
  dropdownMenu: "data-dropdown-menu",

  tooltip: "data-tooltip",
  i18n: "data-i18n",
  i18nAriaLabel: "data-i18n-aria-label",
  i18nDataTooltip: "data-i18n-data-tooltip",
});

/* =========================================================
   SELECTORS
========================================================= */

export const SIDEBAR_SELECTORS = Object.freeze({
  root: [
    `#${SIDEBAR_ROOT_ID}`,
    "aside.sidebar",
    ".sidebar[data-sidebar-root='true']",
    ".sidebar[data-sidebar-root]",
    "[data-sidebar-root='true']",
    "[data-sidebar-root]",
    "[data-sidebar='true']",
  ].join(", "),

  mount: [
    `#${SIDEBAR_MOUNT_ID}`,
    "[data-sidebar-mount]",
  ].join(", "),

  menu: [
    `#${SIDEBAR_MENU_ID}`,
    ".sidebar-menu",
    "[data-sidebar-menu]",
    "nav.sidebar-menu",
  ].join(", "),

  recents: [
    `#${SIDEBAR_RECENTS_ID}`,
    ".sidebar-recents",
    "[data-sidebar-recents]",
    "[data-sidebar-recent]",
  ].join(", "),

  logo: [
    `#${SIDEBAR_LOGO_ID}`,
    `#${SIDEBAR_LOGO_LEGACY_ID}`,
    "a.logo",
    ".logo",
    ".sidebar-logo",
    "[data-sidebar-logo]",
  ].join(", "),

  toggle: [
    `#${SIDEBAR_TOGGLE_ID}`,
    `#${SIDEBAR_TOGGLE_LEGACY_ID}`,
    ".sidebar-toggle",
    "[data-sidebar-toggle]",
    `[data-sidebar-action="${SIDEBAR_ACTION_TOGGLE}"]`,
    `[data-action="${SIDEBAR_ACTION_TOGGLE}"]`,
  ].join(", "),

  mobileToggle: [
    `#${SIDEBAR_MOBILE_TOGGLE_ID}`,
    `#${SIDEBAR_MOBILE_TOGGLE_LEGACY_ID}`,
    ".sidebar-mobile-toggle",
    "[data-sidebar-mobile-toggle]",
    `[data-sidebar-action="${SIDEBAR_ACTION_TOGGLE_MOBILE}"]`,
    `[data-action="${SIDEBAR_ACTION_TOGGLE_MOBILE}"]`,
  ].join(", "),

  userToggle: [
    `#${USER_TOGGLE_ID}`,
    `#${USER_TOGGLE_LEGACY_ID}`,
    "#sidebar-user-toggle",
    "#sidebarUserMenuToggle",
    "#sidebar-user-menu-toggle",
    ".user[role='button']",
    ".sidebar-user-toggle",
    ".sidebar-user__toggle",
    ".sidebar-footer-user-toggle",
    ".sidebar-footer__user-toggle",
    ".user-toggle",
    ".user-menu-toggle",
    `[aria-controls="${USER_DROPDOWN_ID}"]`,
    "[data-user-toggle]",
    "[data-sidebar-user-toggle]",
    `[data-sidebar-action="${SIDEBAR_ACTION_TOGGLE_USER}"]`,
    `[data-action="${SIDEBAR_ACTION_TOGGLE_USER}"]`,
  ].join(", "),

  userDropdown: [
    `#${USER_DROPDOWN_ID}`,
    `#${USER_DROPDOWN_LEGACY_ID}`,
    "#sidebar-user-dropdown",
    "#sidebarUserMenu",
    "#sidebar-user-menu",
    ".user-dropdown",
    ".user-menu",
    ".sidebar-user-dropdown",
    ".sidebar-user-menu",
    ".sidebar-user__dropdown",
    ".sidebar-user__menu",
    ".sidebar-footer-user-dropdown",
    ".sidebar-footer-user-menu",
    ".sidebar-footer__user-dropdown",
    ".sidebar-footer__user-menu",
    "[data-user-dropdown]",
    "[data-user-menu]",
    "[data-sidebar-user-dropdown]",
    "[data-sidebar-user-menu]",
    "[data-dropdown='user']",
    "[data-dropdown-menu='user']",
    "[data-sidebar-dropdown='user']",
  ].join(", "),

  logoutButton: [
    `#${LOGOUT_BUTTON_ID}`,
    `#${LOGOUT_BUTTON_LEGACY_ID}`,
    "#logoutButton",
    "#sidebar-logout",
    ".sidebar-logout",
    ".logout-button",
    ".logout-btn",
    `[data-sidebar-action="${SIDEBAR_ACTION_LOGOUT}"]`,
    `[data-action="${SIDEBAR_ACTION_LOGOUT}"]`,
    "[data-logout]",
    "[data-sidebar-logout]",
  ].join(", "),

  avatar: [
    `#${SIDEBAR_AVATAR_ID}`,
    `#${SIDEBAR_AVATAR_LEGACY_ID}`,
    ".avatar[data-avatar-root='true']",
    ".sidebar-avatar",
    ".sidebar-user-avatar",
    "[data-sidebar-avatar]",
    "[data-user-avatar]",
  ].join(", "),

  avatarImage: [
    `#${SIDEBAR_AVATAR_IMAGE_ID}`,
    ".avatar-image",
    "[data-avatar-image]",
  ].join(", "),

  avatarFallback: [
    `#${SIDEBAR_AVATAR_FALLBACK_ID}`,
    ".avatar-fallback",
    "[data-avatar-fallback]",
  ].join(", "),

  name: [
    `#${SIDEBAR_NAME_ID}`,
    `#${SIDEBAR_NAME_LEGACY_ID}`,
    "#sidebarUserName",
    "#sidebar-user-name",
    ".sidebar-name",
    ".sidebar-user-name",
    ".user-info .name",
    "[data-sidebar-name]",
    "[data-user-name]",
  ].join(", "),

  serverLink: [
    `#${SERVER_NAV_ID}`,
    `[data-sidebar-item-key="server"]`,
    `[data-nav-key="server"]`,
    `[data-route="${SERVER_ROUTE}"]`,
    `[href="${SERVER_ROUTE}"]`,
  ].join(", "),

  navItems: [
    "a[data-sidebar-nav='true']",
    "a[data-sidebar-item='true']",
    "a.menu-item",
    "a[data-spa]",
    "a[data-route]",
    ".menu-item[data-route]",
  ].join(", "),

  spaLinks: "a[data-spa]",

  adminOnly: [
    "[data-admin-only='true']",
    "[data-sidebar-admin-only='true']",
    "[data-role='admin']",
    "[data-requires-role='admin']",
    "[data-required-role='admin']",
  ].join(", "),

  hiddenOrDisabled: [
    "[hidden]",
    "[inert]",
    "[aria-hidden='true']",
    "[aria-disabled='true']",
    "[data-sidebar-visible='false']",
    "[data-role-visible='false']",
    "[data-admin-visible='false']",
  ].join(", "),
});

/* =========================================================
   STORAGE
========================================================= */

/*
  Legacy principal:
  Se mantiene porque state.js y builds anteriores lo leen.
  Semántica:
    true  => desktop colapsado
    false => desktop abierto
*/
export const DESKTOP_COLLAPSED_STORAGE_KEY = "sidebar-collapsed";

/*
  Legacy secundario:
  Semántica inversa:
    true  => sidebar abierto
    false => sidebar colapsado
*/
export const LEGACY_SIDEBAR_OPEN_STORAGE_KEY = "sidebarOpen";

export const SIDEBAR_STORAGE_NAMESPACE = "ui.sidebar";
export const SIDEBAR_STORAGE_NAMESPACE_ONION = "onion.ui.sidebar";

export const SIDEBAR_STORAGE_KEYS = Object.freeze({
  desktopCollapsed: DESKTOP_COLLAPSED_STORAGE_KEY,
  legacyDesktopOpen: LEGACY_SIDEBAR_OPEN_STORAGE_KEY,

  desktopCollapsedV2: `${SIDEBAR_STORAGE_NAMESPACE}.desktopCollapsed`,
  desktopOpen: `${SIDEBAR_STORAGE_NAMESPACE}.desktopOpen`,
  mobileOpen: `${SIDEBAR_STORAGE_NAMESPACE}.mobileOpen`,
  userDropdownOpen: `${SIDEBAR_STORAGE_NAMESPACE}.userDropdownOpen`,

  onionDesktopCollapsed: `${SIDEBAR_STORAGE_NAMESPACE_ONION}.desktopCollapsed`,
  onionDesktopOpen: `${SIDEBAR_STORAGE_NAMESPACE_ONION}.desktopOpen`,
  onionMobileOpen: `${SIDEBAR_STORAGE_NAMESPACE_ONION}.mobileOpen`,
});

/* =========================================================
   CLASSES
========================================================= */

export const SIDEBAR_CLASSES = Object.freeze({
  root: "sidebar",

  mounted: "sidebar-mounted",
  ready: "is-ready",

  collapsed: "collapsed",
  isCollapsed: "is-collapsed",

  open: "open",
  isOpen: "is-open",
  mobileOpen: "mobile-open",

  hidden: "is-hidden",

  active: "active",
  isActive: "is-active",
  routerActive: "router-active",

  disabled: "is-disabled",

  dropdownOpen: "open",
  dropdownIsOpen: "is-open",

  adminHidden: "is-admin-hidden",

  transitioning: "is-transitioning",
  bodyTransitioning: "sidebar-transitioning",

  visualSyncing: "is-visual-syncing",
  bodyVisualSyncing: "sidebar-visual-syncing",

  tooltipsActive: "sidebar-tooltips-active",
});

/* =========================================================
   DATASET VALUES
========================================================= */

export const SIDEBAR_DATASET_VALUES = Object.freeze({
  true: "true",
  false: "false",

  open: "open",
  closed: "closed",
  hidden: "hidden",

  desktop: "desktop",
  mobile: "mobile",

  admin: "admin",
  user: "user",

  page: "page",
});

/* =========================================================
   EVENTS
========================================================= */

export const SIDEBAR_EVENTS = Object.freeze({
  ready: "sidebar:ready",
  destroyed: "sidebar:destroyed",

  repaired: "sidebar:repaired",
  refreshed: "sidebar:refreshed",

  eventsBound: "sidebar:events:bound",
  eventsBindSkipped: "sidebar:events:bind-skipped",
  eventsBindIgnored: "sidebar:events:bind-ignored",

  domEventsBound: "sidebar:dom-events:bound",
  coreEventsBound: "sidebar:core-events:bound",

  stateSynced: "sidebar:state:synced",
  stateChange: "sidebar:state:change",
  stateChangeStart: "sidebar:state:change:start",
  stateChangeBlocked: "sidebar:state:change:blocked",
  stateUnchanged: "sidebar:state:unchanged",
  stateRepaired: "sidebar:state:repaired",

  uiOpenSet: "sidebar:ui:open:set",

  activeItemSynced: "sidebar:active:item:synced",
  activeRouteSynced: "sidebar:active-route:synced",

  indicatorSynced: "sidebar:indicator:synced",
  indicatorDisabled: "sidebar:indicator:disabled",
  indicatorCleared: "sidebar:indicator:cleared",

  visualCommitted: "sidebar:visual:committed",

  transitionBegin: "sidebar:transition:begin",
  transitionEnd: "sidebar:transition:end",
  transitionStart: "sidebar:transition:start",
  transitionFinish: "sidebar:transition:finish",

  userRendered: "sidebar:user:rendered",

  roleVisibilityApplied: "sidebar:role-visibility:applied",

  dropdownOpen: "sidebar:dropdown:open",
  dropdownClose: "sidebar:dropdown:close",
  dropdownToggle: "sidebar:dropdown:toggle",

  navigationRequest: "sidebar:navigation:request",
  dropdownNavigationRequest: "sidebar:dropdown:navigation:request",

  fallbackAction: "sidebar:fallback:action",
  userToggleDirect: "sidebar:user-toggle:direct",

  menuInteractionRestored: "sidebar:menu:interaction-restored",

  logoutStart: "sidebar:logout:start",
  logoutComplete: "sidebar:logout:complete",
  logoutError: "sidebar:logout:error",
});

/* =========================================================
   APP / ROUTER / AUTH EVENTS OBSERVED BY SIDEBAR
========================================================= */

export const SIDEBAR_OBSERVED_APP_EVENTS = Object.freeze([
  "app:ready",
  "app:boot:ready",
  "app:boot:complete",

  "app:user:change",
  "app:user:updated",
  "app:session:change",
  "app:session:restored",
  "app:session:cleared",
  "app:auth:change",

  "app:route:change",
  "app:ui:repair-request",

  "app:lang:change",
  "i18n:change",

  "theme:change",
  "app:theme:change",
]);

export const SIDEBAR_OBSERVED_AUTH_EVENTS = Object.freeze([
  "auth:change",
  "auth:updated",
  "auth:restore:success",
  "auth:session:restored",
  "auth:session:applied",
  "auth:session:cleared",

  "login:success",
  "auth:login:success",
  "app:login:success",

  "auth:logout",
  "auth:logout:success",
  "logout:success",
]);

export const SIDEBAR_OBSERVED_ROUTER_EVENTS = Object.freeze([
  "router:bound",
  "router:before-render",
  "router:rendered",
  "router:route:change",
  "router:navigation:complete",
  "router:render:async-complete",
]);

/* =========================================================
   ROLE FLAGS
========================================================= */

export const SIDEBAR_ADMIN_ROLE_KEYS = Object.freeze([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super_administrador",
  "owner",
  "root",
  "staff",
  "support",
]);

export const SIDEBAR_ADMIN_PERMISSION_KEYS = Object.freeze([
  "admin:*",
  "admin.all",
  "admin.full",
  "admin.manage",

  "users.manage",
  "users:manage",
  "users.write",
  "users:write",
  "users.admin",

  "usuarios.manage",
  "usuarios:manage",
  "usuarios.write",
  "usuarios:write",
  "usuarios.admin",

  "manage_users",
  "can_manage_users",
  "access_users",
  "can_access_users",
]);

export const SIDEBAR_ADMIN_FLAG_KEYS = Object.freeze([
  "isAdmin",
  "admin",
  "is_admin",

  "isSuperAdmin",
  "superAdmin",
  "is_super_admin",

  "canManageUsers",
  "can_manage_users",

  "canAccessUsers",
  "can_access_users",
]);

/* =========================================================
   EVENT HANDLED FLAGS
========================================================= */

export const SIDEBAR_HANDLED_FLAG = "__onionSidebarHandled";
export const SIDEBAR_EVENTS_HANDLED_FLAG = "__onionSidebarEventsHandled";
export const SIDEBAR_HANDLED_REASON_FLAG = "__onionSidebarReason";

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_MODULE_NAME,
  SIDEBAR_MODULE_KEY,
  SIDEBAR_COMPONENT_NAME,
  SIDEBAR_CONSTANTS_VERSION,

  SCOPE,
  SIDEBAR_SCOPE,
  SIDEBAR_DOM_SCOPE,
  SIDEBAR_CORE_SCOPE,
  SIDEBAR_FALLBACK_SCOPE,

  MOBILE_BREAKPOINT,

  SIDEBAR_TRANSITION_MS,
  SIDEBAR_VISUAL_SYNC_DELAY_MS,
  SIDEBAR_VISUAL_SYNC_AFTER_NAV_MS,
  SIDEBAR_HOVER_FLUSH_MS,
  SIDEBAR_BIND_DEDUP_WINDOW_MS,
  SIDEBAR_INDICATOR_DEFAULT_DELAY_MS,
  SIDEBAR_INDICATOR_RECALC_DELAY_MS,
  SIDEBAR_INDICATOR_SETTLED_DELAY_MS,

  SIDEBAR_ROOT_ID,
  SIDEBAR_MENU_ID,
  SIDEBAR_RECENTS_ID,
  SIDEBAR_MOUNT_ID,

  SIDEBAR_TOGGLE_ID,
  SIDEBAR_TOGGLE_LEGACY_ID,
  SIDEBAR_MOBILE_TOGGLE_ID,
  SIDEBAR_MOBILE_TOGGLE_LEGACY_ID,

  SIDEBAR_LOGO_ID,
  SIDEBAR_LOGO_LEGACY_ID,

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

  SIDEBAR_ROUTES,
  SIDEBAR_ROUTE_ALIASES,

  SIDEBAR_MENU_KEYS,
  SIDEBAR_MENU_ORDER,
  SIDEBAR_NAV_ITEMS,

  SIDEBAR_ACTION_NAVIGATE,
  SIDEBAR_ACTION_TOGGLE,
  SIDEBAR_ACTION_TOGGLE_MOBILE,
  SIDEBAR_ACTION_TOGGLE_USER,
  SIDEBAR_ACTION_OPEN_USER_MENU,
  SIDEBAR_ACTION_CLOSE_USER_MENU,
  SIDEBAR_ACTION_ADD_ACCOUNT,
  SIDEBAR_ACTION_CHANGE_PLAN,
  SIDEBAR_ACTION_PROFILE,
  SIDEBAR_ACTION_SETTINGS,
  SIDEBAR_ACTION_HELP,
  SIDEBAR_ACTION_LOGOUT,
  SIDEBAR_ACTIONS,

  SIDEBAR_DATA_ATTRS,
  SIDEBAR_SELECTORS,

  DESKTOP_COLLAPSED_STORAGE_KEY,
  LEGACY_SIDEBAR_OPEN_STORAGE_KEY,
  SIDEBAR_STORAGE_NAMESPACE,
  SIDEBAR_STORAGE_NAMESPACE_ONION,
  SIDEBAR_STORAGE_KEYS,

  SIDEBAR_CLASSES,
  SIDEBAR_DATASET_VALUES,

  SIDEBAR_EVENTS,
  SIDEBAR_OBSERVED_APP_EVENTS,
  SIDEBAR_OBSERVED_AUTH_EVENTS,
  SIDEBAR_OBSERVED_ROUTER_EVENTS,

  SIDEBAR_ADMIN_ROLE_KEYS,
  SIDEBAR_ADMIN_PERMISSION_KEYS,
  SIDEBAR_ADMIN_FLAG_KEYS,

  SIDEBAR_HANDLED_FLAG,
  SIDEBAR_EVENTS_HANDLED_FLAG,
  SIDEBAR_HANDLED_REASON_FLAG,
};
