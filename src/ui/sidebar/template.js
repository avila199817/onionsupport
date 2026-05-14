/* =========================================================
   Onion SPA - Sidebar Template
   Archivo: src/ui/sidebar/template.js

   ONION SUPPORT · SIDEBAR TEMPLATE · EXTREME 10/10
   I18N · A11Y · DOM SAFE · DROPDOWN SAFE · ROUTE SAFE

   Responsabilidades:
   - Generar el HTML base del sidebar.
   - Centralizar el marcado del módulo SidebarUI.
   - Consumir constants.js como fuente única de ids/rutas/acciones.
   - Preparado para i18n real.
   - Tooltips custom con refresh live.
   - Evitar title nativo del navegador.
   - Accesibilidad consistente.
   - Separar textos estáticos i18n de valores dinámicos de sesión.
   - Mantener compatibilidad con AppCore.syncUserUI().
   - Mantener compatibilidad con dom.js / state.js / events.js.
   - Mantener compatibilidad con dropdown.js / user.js / visibility.js.
   - No pintar tooltip en el logo.
   - No pintar tooltip nativo en avatar/footer.
   - Marcar rutas admin para filtrado visual posterior.
   - Evitar flash de rutas admin antes de applyRoleVisibility().
   - Incluir data-sidebar-action para fallback delegado.
   - Incluir data-action para compatibilidad con delegación genérica.
   - Incluir data-route / data-href / data-to para navegación robusta.
   - Dropdown de usuario con button real, data-user-toggle y data-user-dropdown.
   - Avatar compatible con #sidebarAvatarImage / #sidebarAvatarFallback.
   - SVGs preservados.
   - Indicador activo tipo Apple preparado.
   - No renderiza toggle móvil interno duplicado.

   HARDENING EXTREMO:
   - cero CSS inline
   - cero JS inline
   - cero title nativo
   - cero rutas externas
   - cero href unsafe
   - cero src vacío en avatar
   - ids alineados con constants.js
   - rutas canónicas únicas
   - admin hidden pero recuperable
   - dropdown cerrado y desbloqueable por JS
   - no aria-hidden en contenedores interactivos principales
   - no dependencias de window/document
========================================================= */

import { I18n } from "../../i18n/index.js";

import {
  SIDEBAR_MODULE_NAME,
  SIDEBAR_COMPONENT_NAME,
  SIDEBAR_CONSTANTS_VERSION,

  SIDEBAR_ROOT_ID,
  SIDEBAR_MOUNT_ID,
  SIDEBAR_NAV_ID,
  SIDEBAR_MENU_ID,
  SIDEBAR_RECENTS_ID,
  SIDEBAR_FOOTER_ID,
  SIDEBAR_INDICATOR_ID,

  SIDEBAR_TOGGLE_ID,
  SIDEBAR_MOBILE_TOGGLE_ID,

  SIDEBAR_LOGO_ID,

  USER_SECTION_ID,
  USER_TOGGLE_ID,
  USER_DROPDOWN_ID,

  LOGOUT_BUTTON_ID,

  SIDEBAR_AVATAR_ID,
  SIDEBAR_AVATAR_IMAGE_ID,
  SIDEBAR_AVATAR_FALLBACK_ID,

  SIDEBAR_NAME_ID,
  SIDEBAR_USER_PLAN_ID,

  SERVER_NAV_ID,

  SIDEBAR_ROUTES,
  SIDEBAR_ROUTE_ALIASES,
  SIDEBAR_NAV_ITEMS,

  SIDEBAR_ACTION_NAVIGATE,
  SIDEBAR_ACTION_TOGGLE,
  SIDEBAR_ACTION_TOGGLE_USER,
  SIDEBAR_ACTION_ADD_ACCOUNT,
  SIDEBAR_ACTION_CHANGE_PLAN,
  SIDEBAR_ACTION_PROFILE,
  SIDEBAR_ACTION_SETTINGS,
  SIDEBAR_ACTION_HELP,
  SIDEBAR_ACTION_LOGOUT,

  SIDEBAR_DATA_ATTRS,
  SIDEBAR_I18N_KEYS,
} from "./constants.js";

/* =========================================================
   VERSION
========================================================= */

export const SIDEBAR_TEMPLATE_VERSION =
  "sidebar-template-v16-extreme-dom-contract";

/* =========================================================
   SAFE TEXT / HTML
========================================================= */

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeObject(value, fallback = {}) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function booleanAttr(name = "", enabled = false) {
  const cleanName = safeText(name, "");

  if (!cleanName || !enabled) {
    return "";
  }

  return ` ${cleanName}`;
}

function attr(name = "", value = "") {
  const cleanName = safeText(name, "");

  if (!cleanName) {
    return "";
  }

  if (!/^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(cleanName)) {
    return "";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return ` ${cleanName}="${escapeAttr(value)}"`;
}

/* =========================================================
   LOCAL CONTRACT FALLBACKS
========================================================= */

const I18N_KEYS =
  safeObject(SIDEBAR_I18N_KEYS);

const RAW_ROUTES =
  safeObject(SIDEBAR_ROUTES);

const ROUTE_ALIASES =
  Object.freeze({
    ...safeObject(SIDEBAR_ROUTE_ALIASES),
  });

const ACTIONS =
  Object.freeze({
    navigate:
      safeText(SIDEBAR_ACTION_NAVIGATE, "navigate"),

    toggle:
      safeText(SIDEBAR_ACTION_TOGGLE, "toggle-sidebar"),

    toggleUser:
      safeText(SIDEBAR_ACTION_TOGGLE_USER, "toggle-user-dropdown"),

    addAccount:
      safeText(SIDEBAR_ACTION_ADD_ACCOUNT, "add-account"),

    changePlan:
      safeText(SIDEBAR_ACTION_CHANGE_PLAN, "change-plan"),

    profile:
      safeText(SIDEBAR_ACTION_PROFILE, "profile"),

    settings:
      safeText(SIDEBAR_ACTION_SETTINGS, "settings"),

    help:
      safeText(SIDEBAR_ACTION_HELP, "help"),

    logout:
      safeText(SIDEBAR_ACTION_LOGOUT, "logout"),
  });

const IDS =
  Object.freeze({
    root:
      safeText(SIDEBAR_ROOT_ID, "app-sidebar"),

    mount:
      safeText(SIDEBAR_MOUNT_ID, "sidebar-mount"),

    nav:
      safeText(SIDEBAR_NAV_ID, "sidebar-nav"),

    menu:
      safeText(SIDEBAR_MENU_ID, "sidebar-menu"),

    recents:
      safeText(SIDEBAR_RECENTS_ID, "sidebar-recents"),

    footer:
      safeText(SIDEBAR_FOOTER_ID, "sidebar-footer"),

    indicator:
      safeText(SIDEBAR_INDICATOR_ID, "sidebar-active-indicator"),

    toggle:
      safeText(SIDEBAR_TOGGLE_ID, "toggleSidebar"),

    mobileToggle:
      safeText(SIDEBAR_MOBILE_TOGGLE_ID, "toggleSidebarMobile"),

    logo:
      safeText(SIDEBAR_LOGO_ID, "sidebar-logo"),

    userSection:
      safeText(USER_SECTION_ID, "sidebar-user-section"),

    userToggle:
      safeText(USER_TOGGLE_ID, "userToggle"),

    userDropdown:
      safeText(USER_DROPDOWN_ID, "userDropdown"),

    logout:
      safeText(LOGOUT_BUTTON_ID, "logout-btn"),

    avatar:
      safeText(SIDEBAR_AVATAR_ID, "sidebarAvatar"),

    avatarImage:
      safeText(SIDEBAR_AVATAR_IMAGE_ID, "sidebarAvatarImage"),

    avatarFallback:
      safeText(SIDEBAR_AVATAR_FALLBACK_ID, "sidebarAvatarFallback"),

    name:
      safeText(SIDEBAR_NAME_ID, "sidebarName"),

    plan:
      safeText(SIDEBAR_USER_PLAN_ID, "sidebarUserPlan"),

    server:
      safeText(SERVER_NAV_ID, "server-nav"),
  });

function i18nKey(name = "", fallback = "") {
  return safeText(
    I18N_KEYS[name],
    fallback
  );
}

/* =========================================================
   I18N
========================================================= */

function t(key, fallback = "", params = {}) {
  const cleanKey = safeText(key, "");
  const cleanFallback = safeText(fallback, cleanKey);

  if (!cleanKey) {
    return cleanFallback;
  }

  try {
    if (typeof I18n?.t === "function") {
      const attempts = [
        () => I18n.t(cleanKey, params, cleanFallback),
        () => I18n.t(cleanKey, cleanFallback, params),
        () => I18n.t(cleanKey),
      ];

      for (const attempt of attempts) {
        try {
          const value = safeText(attempt(), "");

          if (
            value &&
            value !== cleanKey
          ) {
            return value;
          }
        } catch {}
      }
    }
  } catch {}

  return cleanFallback;
}

/* =========================================================
   ROUTE SAFETY
========================================================= */

function isUnsafeHref(value = "") {
  const raw = safeText(value, "");
  const lower = raw.toLowerCase();

  return Boolean(
    !raw ||
      /[\r\n\t\\]/.test(raw) ||
      lower.startsWith("//") ||
      lower.startsWith("javascript:") ||
      lower.startsWith("data:") ||
      lower.startsWith("vbscript:") ||
      lower.startsWith("file:") ||
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
  );
}

function normalizePathnameOnly(pathname = "/") {
  let value =
    safeText(pathname, "/")
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  const segments = [];

  for (const rawSegment of value.split("/").filter(Boolean)) {
    let segment = rawSegment;

    try {
      segment = decodeURIComponent(rawSegment);
    } catch {}

    if (
      segment === "." ||
      segment === ""
    ) {
      continue;
    }

    if (segment === "..") {
      segments.pop();
      continue;
    }

    segments.push(rawSegment);
  }

  value = `/${segments.join("/")}`;

  if (!value) {
    value = "/";
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function normalizeSearch(search = "") {
  const value = safeText(search, "");

  if (!value) {
    return "";
  }

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = safeText(hash, "");

  if (!value) {
    return "";
  }

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitRoute(value = "/") {
  const raw = safeText(value, "/");

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
    pathname,
    search,
    hash,
  };
}

function normalizeRoute(value = "/", {
  preserveSearch = false,
  preserveHash = false,
} = {}) {
  let text = safeText(value, "/");

  if (!text || isUnsafeHref(text)) {
    return "/";
  }

  if (text.startsWith("#/")) {
    text = text.replace(/^#\/?/, "/");
  } else if (text.startsWith("#!")) {
    text = text.replace(/^#!\/?/, "/");
  } else if (text.startsWith("#")) {
    return "/";
  }

  if (!text.startsWith("/")) {
    text = `/${text}`;
  }

  const parts = splitRoute(text);

  const pathname =
    normalizePathnameOnly(parts.pathname || "/");

  const aliased =
    ROUTE_ALIASES[pathname] ||
    pathname;

  return `${aliased}${
    preserveSearch ? normalizeSearch(parts.search) : ""
  }${
    preserveHash ? normalizeHash(parts.hash) : ""
  }`;
}

function canonicalRoute(value = "/") {
  return normalizeRoute(value, {
    preserveSearch: false,
    preserveHash: false,
  });
}

const ROUTES =
  Object.freeze({
    home:
      canonicalRoute(RAW_ROUTES.home || "/"),

    tickets:
      canonicalRoute(RAW_ROUTES.tickets || RAW_ROUTES.incidencias || "/incidencias"),

    invoices:
      canonicalRoute(RAW_ROUTES.invoices || RAW_ROUTES.facturas || "/facturas"),

    users:
      canonicalRoute(RAW_ROUTES.users || RAW_ROUTES.usuarios || "/usuarios"),

    clients:
      canonicalRoute(RAW_ROUTES.clients || RAW_ROUTES.clientes || "/clientes"),

    account:
      canonicalRoute(RAW_ROUTES.account || RAW_ROUTES.profile || "/cuenta"),

    settings:
      canonicalRoute(RAW_ROUTES.settings || RAW_ROUTES.configuracion || "/configuracion"),

    server:
      canonicalRoute(RAW_ROUTES.server || RAW_ROUTES.servidor || "/servidor"),
  });

function getDefaultNavItems() {
  return [
    {
      key: "home",
      route: ROUTES.home,
      icon: "home",
      i18nKey: "sidebar.nav.home",
      labelFallback: "Inicio",
      order: 10,
    },
    {
      key: "tickets",
      route: ROUTES.tickets,
      icon: "tickets",
      i18nKey: "sidebar.nav.tickets",
      labelFallback: "Incidencias",
      order: 20,
    },
    {
      key: "invoices",
      route: ROUTES.invoices,
      icon: "invoices",
      i18nKey: "sidebar.nav.invoices",
      labelFallback: "Facturas",
      order: 30,
    },
    {
      key: "clients",
      route: ROUTES.clients,
      icon: "clients",
      i18nKey: "sidebar.nav.clients",
      labelFallback: "Clientes",
      order: 40,
      adminOnly: true,
      requiredRole: "admin",
    },
    {
      key: "users",
      route: ROUTES.users,
      icon: "users",
      i18nKey: "sidebar.nav.users",
      labelFallback: "Usuarios",
      order: 50,
      adminOnly: true,
      requiredRole: "admin",
    },
    {
      key: "server",
      route: ROUTES.server,
      icon: "server",
      i18nKey: "sidebar.nav.server",
      labelFallback: "Servidor",
      order: 60,
      adminOnly: true,
      requiredRole: "admin",
    },
  ];
}

function getNavItems() {
  const source =
    Array.isArray(SIDEBAR_NAV_ITEMS) &&
    SIDEBAR_NAV_ITEMS.length
      ? SIDEBAR_NAV_ITEMS
      : getDefaultNavItems();

  const seen = new Set();

  return source
    .map((item) => {
      const sourceItem = safeObject(item);

      const route =
        canonicalRoute(
          sourceItem.route ||
            sourceItem.path ||
            sourceItem.href ||
            ROUTES.home
        );

      const key =
        normalizeKey(
          sourceItem.key ||
            sourceItem.id ||
            route
        );

      return {
        ...sourceItem,
        key,
        route,
        order:
          Number.isFinite(Number(sourceItem.order))
            ? Number(sourceItem.order)
            : 999,
      };
    })
    .filter((item) => {
      if (
        !item.key ||
        !item.route ||
        seen.has(item.route)
      ) {
        return false;
      }

      seen.add(item.route);
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

/* =========================================================
   ICONS
========================================================= */

const Icons = Object.freeze({
  home: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <path
                d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
            </svg>
  `,

  tickets: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.8"/>
              <path
                d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3
                1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2
                0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0
                1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0A1.7 1.7 0 0 0 10
                3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7
                1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
  `,

  invoices: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <path d="M6 2h9l5 5v15H6z" stroke="currentColor" stroke-width="1.6"/>
              <path d="M14 2v6h6" stroke="currentColor" stroke-width="1.6"/>
              <path d="M8.5 12h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M8.5 16h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
  `,

  users: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6"/>
            </svg>
  `,

  clients: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="6.5" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
              <circle cx="17.5" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
              <path d="M4 20c0-3.5 3.5-5.5 8-5.5s8 2 8 5.5" stroke="currentColor" stroke-width="1.6"/>
            </svg>
  `,

  account: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M5.5 21a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.6"/>
            </svg>
  `,

  settings: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <path d="M4 6h10" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="16" cy="6" r="2" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 12h6" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 18h12" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="18" cy="18" r="2" stroke="currentColor" stroke-width="1.6"/>
            </svg>
  `,

  server: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <rect x="4" y="5" width="16" height="5" rx="1.5" stroke="currentColor" stroke-width="1.6"/>
              <rect x="4" y="14" width="16" height="5" rx="1.5" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="8" cy="7.5" r="1" fill="currentColor"/>
              <circle cx="8" cy="16.5" r="1" fill="currentColor"/>
              <path d="M11 7.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              <path d="M11 16.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
  `,

  plus: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
  `,

  upgrade: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <path d="M12 4v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M8 8l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 20h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
  `,

  help: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
              <path d="M12 16v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              <circle cx="12" cy="8" r="1" fill="currentColor"/>
            </svg>
  `,

  logout: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false" aria-hidden="true">
              <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M4 4h5v16H4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
  `,

  chevron: `
            <svg
              class="user-chevron"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              focusable="false"
              aria-hidden="true"
            >
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
  `,

  desktopToggle: `
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            focusable="false"
            aria-hidden="true"
          >
            <rect
              x="3"
              y="4"
              width="18"
              height="16"
              rx="3"
              stroke="currentColor"
              stroke-width="1.6"
            />
            <path
              d="M9 4v16"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
  `,
});

/* =========================================================
   LABELS
========================================================= */

function getSidebarLabels(overrides = {}) {
  const source = safeObject(overrides);

  const labels = {
    sidebarAria:
      t(
        i18nKey("ariaMain", "sidebar.aria.main"),
        "Barra lateral principal"
      ),

    navAria:
      t(
        i18nKey("ariaNavigation", "sidebar.aria.navigation"),
        "Navegación principal"
      ),

    logoLink:
      t(
        i18nKey("logoAriaLabel", "sidebar.logo.ariaLabel"),
        "Ir al inicio"
      ),

    logoAlt:
      t(
        i18nKey("logoAlt", "sidebar.logo.alt"),
        "Onion Support"
      ),

    collapseSidebar:
      t(
        i18nKey("toggleCollapse", "sidebar.toggle.collapse"),
        "Contraer barra lateral"
      ),

    expandSidebar:
      t(
        i18nKey("toggleExpand", "sidebar.toggle.expand"),
        "Expandir barra lateral"
      ),

    recentsAria:
      t(
        i18nKey("recentsAriaLabel", "sidebar.recents.ariaLabel"),
        "Recientes"
      ),

    recentsTitle:
      t(
        i18nKey("recentsTitle", "sidebar.recents.title"),
        "Recientes"
      ),

    userToggle:
      t(
        i18nKey("userToggleAriaLabel", "sidebar.user.toggle"),
        "Abrir menú de usuario"
      ),

    userAvatar:
      t(
        i18nKey("userAvatarAriaLabel", "sidebar.user.avatar"),
        "Avatar usuario"
      ),

    userDefaultName:
      t(
        i18nKey("userDefaultName", "sidebar.user.defaultName"),
        "Usuario"
      ),

    userPlan:
      t(
        i18nKey("userPlan", "sidebar.user.plan"),
        "Go Plan"
      ),

    userMenu:
      t(
        i18nKey("userDropdownAriaLabel", "sidebar.user.menu"),
        "Menú de usuario"
      ),

    addAccount:
      t(
        i18nKey("userAddAccount", "sidebar.user.addAccount"),
        "Añadir cuenta"
      ),

    changePlan:
      t(
        i18nKey("userChangePlan", "sidebar.user.changePlan"),
        "Cambiar plan"
      ),

    profile:
      t(
        i18nKey("userProfile", "sidebar.user.profile"),
        "Perfil"
      ),

    userSettings:
      t(
        i18nKey("userSettings", "sidebar.user.settings"),
        "Configuración"
      ),

    help:
      t(
        i18nKey("userHelp", "sidebar.user.help"),
        "Ayuda"
      ),

    logout:
      t(
        i18nKey("userLogout", "sidebar.user.logout"),
        "Cerrar sesión"
      ),
  };

  return {
    ...labels,
    ...source,
  };
}

function getMenuLabel(item = {}) {
  return t(
    item.i18nKey || `sidebar.nav.${item.key}`,
    item.labelFallback || item.label || item.key || ""
  );
}

/* =========================================================
   MENU ITEM VISIBILITY
========================================================= */

function renderRoleVisibilityAttrs(item = {}) {
  const adminOnly =
    item.adminOnly === true ||
    item.admin === true ||
    item.requiresAdmin === true;

  const requiredRole =
    adminOnly
      ? safeText(
          item.requiredRole ||
            item.role ||
            "admin",
          "admin"
        )
      : "";

  const requiredRoles =
    adminOnly
      ? (
          Array.isArray(item.requiredRoles)
            ? item.requiredRoles.join(",")
            : requiredRole
        )
      : "";

  if (!adminOnly) {
    return `
          data-role=""
          data-roles=""
          data-required-role=""
          data-required-roles=""
          data-requires-role=""
          data-requires-roles=""
          data-admin-only="false"
          data-sidebar-admin-only="false"
          data-sidebar-visible="true"
          data-role-visible="true"
          data-admin-visible="true"
          data-hidden-default="false"
          data-role-hidden="false"
        `;
  }

  return `
          data-role="${escapeAttr(requiredRole)}"
          data-roles="${escapeAttr(requiredRoles)}"
          data-required-role="${escapeAttr(requiredRole)}"
          data-required-roles="${escapeAttr(requiredRoles)}"
          data-requires-role="${escapeAttr(requiredRole)}"
          data-requires-roles="${escapeAttr(requiredRoles)}"
          data-admin-only="true"
          data-sidebar-admin-only="true"
          data-sidebar-visible="false"
          data-role-visible="false"
          data-admin-visible="false"
          data-hidden-default="true"
          data-role-hidden="true"
          aria-hidden="true"
          tabindex="-1"
          hidden
        `;
}

/* =========================================================
   MENU ITEM
========================================================= */

function renderMenuItem(item = {}, index = 0) {
  const route =
    canonicalRoute(
      item.route || ROUTES.home
    );

  const label = getMenuLabel(item);

  const i18nKey =
    safeText(
      item.i18nKey || `sidebar.nav.${item.key}`,
      ""
    );

  const routeKey =
    normalizeKey(
      item.key ||
        item.route ||
        label ||
        route
    );

  const icon =
    Icons[item.icon] ||
    Icons[item.key] ||
    Icons.home;

  const isServer =
    route === ROUTES.server ||
    item.key === "server";

  const cleanRoute = escapeAttr(route);
  const cleanLabel = escapeAttr(label);
  const cleanI18nKey = escapeAttr(i18nKey);
  const cleanRouteKey = escapeAttr(routeKey);

  const adminOnly =
    item.adminOnly === true ||
    item.admin === true ||
    item.requiresAdmin === true;

  const itemClass = [
    "menu-item",
    adminOnly ? "is-role-hidden is-admin-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
        <a
          ${isServer ? `id="${IDS.server}"` : ""}
          href="${cleanRoute}"
          class="${itemClass}"
          data-spa="true"
          data-route="${cleanRoute}"
          data-href="${cleanRoute}"
          data-to="${cleanRoute}"
          data-public-path="${cleanRoute}"
          data-canonical-path="${cleanRoute}"
          data-sidebar-route="${cleanRoute}"
          data-sidebar-route-canonical="${cleanRoute}"
          data-sidebar-nav="true"
          data-sidebar-item="true"
          data-sidebar-menu-item="true"
          data-sidebar-item-key="${cleanRouteKey}"
          data-nav-key="${cleanRouteKey}"
          data-route-key="${cleanRouteKey}"
          data-menu-key="${cleanRouteKey}"
          data-menu-index="${Number(index) || 0}"
          data-action="${ACTIONS.navigate}"
          data-sidebar-action="${ACTIONS.navigate}"
          data-nav-action="${ACTIONS.navigate}"
          data-active="false"
          data-current="false"
          data-selected="false"
          data-tooltip="${cleanLabel}"
          ${i18nKey ? `data-i18n-data-tooltip="${cleanI18nKey}"` : ""}
          aria-label="${cleanLabel}"
          aria-current="false"
          ${i18nKey ? `data-i18n-aria-label="${cleanI18nKey}"` : ""}
          ${renderRoleVisibilityAttrs(item)}
        >
          <span
            class="menu-item-icon menu-icon"
            aria-hidden="true"
          >
${icon}
          </span>

          <span
            class="menu-item-label menu-label"
            ${i18nKey ? `data-i18n="${cleanI18nKey}"` : ""}
          >${escapeHtml(label)}</span>
        </a>`;
}

/* =========================================================
   DROPDOWN ITEM
========================================================= */

function renderDropdownButton({
  id = "",
  label = "",
  i18nKey = "",
  action = "",
  route = "",
  icon = "",
  danger = false,
  disabled = false,
} = {}) {
  const cleanId = safeText(id, "");
  const cleanLabel = escapeHtml(label);
  const cleanLabelAttr = escapeAttr(label);
  const cleanI18nKey = escapeAttr(i18nKey);

  const dropdownAction =
    safeText(action || "dropdown-action", "dropdown-action");

  const normalizedRoute =
    route
      ? canonicalRoute(route)
      : "";

  const cleanRoute = escapeAttr(normalizedRoute);

  const primaryAction =
    normalizedRoute
      ? ACTIONS.navigate
      : dropdownAction;

  return `
          <button
            ${cleanId ? `id="${escapeAttr(cleanId)}"` : ""}
            type="button"
            class="dropdown-item${danger ? " dropdown-item-danger" : ""}"
            role="menuitem"
            data-dropdown-item="true"
            data-dropdown-action="${escapeAttr(dropdownAction)}"
            data-sidebar-action="${escapeAttr(primaryAction)}"
            data-action="${escapeAttr(primaryAction)}"
            ${cleanRoute ? `data-route="${cleanRoute}" data-href="${cleanRoute}" data-to="${cleanRoute}" data-public-path="${cleanRoute}" data-canonical-path="${cleanRoute}" data-sidebar-route="${cleanRoute}"` : ""}
            aria-label="${cleanLabelAttr}"
            ${i18nKey ? `data-i18n-aria-label="${cleanI18nKey}"` : ""}
            ${disabled ? `aria-disabled="true"` : ""}
            ${booleanAttr("disabled", disabled)}
          >
            <span
              class="dropdown-item-icon"
              aria-hidden="true"
            >
${icon}
            </span>

            <span
              class="dropdown-item-label"
              ${i18nKey ? `data-i18n="${cleanI18nKey}"` : ""}
            >${cleanLabel}</span>
          </button>`;
}

/* =========================================================
   TEMPLATE PARTIALS
========================================================= */

function renderLogo(labels) {
  const route = ROUTES.home;

  return `
        <a
          id="${IDS.logo}"
          href="${route}"
          class="logo"
          data-spa="true"
          data-route="${route}"
          data-href="${route}"
          data-to="${route}"
          data-public-path="${route}"
          data-canonical-path="${route}"
          data-sidebar-logo="true"
          data-sidebar-action="${ACTIONS.navigate}"
          data-action="${ACTIONS.navigate}"
          aria-label="${escapeAttr(labels.logoLink)}"
          data-i18n-aria-label="${escapeAttr(i18nKey("logoAriaLabel", "sidebar.logo.ariaLabel"))}"
        >
          <img
            class="logo-dark"
            draggable="false"
            src="/src/media/img/favicon_white.png"
            alt="${escapeAttr(labels.logoAlt)}"
            data-i18n-alt="${escapeAttr(i18nKey("logoAlt", "sidebar.logo.alt"))}"
            width="36"
            height="36"
            decoding="async"
            loading="eager"
          >

          <img
            class="logo-light"
            draggable="false"
            src="/src/media/img/favicon_black.png"
            alt="${escapeAttr(labels.logoAlt)}"
            data-i18n-alt="${escapeAttr(i18nKey("logoAlt", "sidebar.logo.alt"))}"
            width="36"
            height="36"
            decoding="async"
            loading="eager"
          >
        </a>`;
}

function renderDesktopToggle(labels, {
  collapsed = false,
} = {}) {
  const expanded =
    collapsed
      ? "false"
      : "true";

  const state =
    collapsed
      ? "collapsed"
      : "open";

  const tooltip =
    collapsed
      ? labels.expandSidebar
      : labels.collapseSidebar;

  const i18nKeyValue =
    collapsed
      ? i18nKey("toggleExpand", "sidebar.toggle.expand")
      : i18nKey("toggleCollapse", "sidebar.toggle.collapse");

  return `
        <button
          id="${IDS.toggle}"
          type="button"
          class="sidebar-toggle"
          data-sidebar-toggle="true"
          data-sidebar-action="${ACTIONS.toggle}"
          data-action="${ACTIONS.toggle}"
          data-tooltip="${escapeAttr(tooltip)}"
          data-i18n-data-tooltip="${escapeAttr(i18nKeyValue)}"
          aria-label="${escapeAttr(tooltip)}"
          data-i18n-aria-label="${escapeAttr(i18nKeyValue)}"
          aria-controls="${IDS.root} ${IDS.menu}"
          aria-expanded="${expanded}"
          data-state="${state}"
        >
${Icons.desktopToggle}
        </button>`;
}

function renderMainMenu(labels) {
  const items = getNavItems();

  return `
      <nav
        id="${IDS.nav}"
        class="sidebar-nav"
        data-sidebar-nav-id="true"
        data-sidebar-nav-root="true"
        aria-label="${escapeAttr(labels.navAria)}"
        data-i18n-aria-label="${escapeAttr(i18nKey("ariaNavigation", "sidebar.aria.navigation"))}"
      >
        <div
          id="${IDS.menu}"
          class="sidebar-menu"
          data-sidebar-menu="true"
          data-nav-area="sidebar"
          data-active-route=""
          data-active-key=""
          data-indicator-ready="false"
          data-indicator-route=""
          data-indicator-current=""
          data-indicator-reason="initial"
        >
          <span
            id="${IDS.indicator}"
            class="sidebar-active-indicator"
            aria-hidden="true"
            data-sidebar-indicator="true"
            data-sidebar-indicator-target=""
            data-state="idle"
          ></span>

${items.map((item, index) => renderMenuItem(item, index)).join("\n")}
        </div>
      </nav>`;
}

function renderRecents(labels) {
  return `
      <section
        id="${IDS.recents}"
        class="sidebar-section"
        aria-label="${escapeAttr(labels.recentsAria)}"
        data-i18n-aria-label="${escapeAttr(i18nKey("recentsAriaLabel", "sidebar.recents.ariaLabel"))}"
        data-sidebar-recents="true"
        data-sidebar-recent="true"
      >
        <span
          class="section-title"
          data-i18n="${escapeAttr(i18nKey("recentsTitle", "sidebar.recents.title"))}"
        >${escapeHtml(labels.recentsTitle)}</span>
      </section>`;
}

function renderUserToggle(labels) {
  return `
        <button
          id="${IDS.userToggle}"
          type="button"
          class="user"
          data-user-toggle="true"
          data-user-menu-toggle="true"
          data-sidebar-user-toggle="true"
          data-dropdown-toggle="user"
          data-dropdown-target="${IDS.userDropdown}"
          data-sidebar-action="${ACTIONS.toggleUser}"
          data-action="${ACTIONS.toggleUser}"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-controls="${IDS.userDropdown}"
          aria-label="${escapeAttr(labels.userToggle)}"
          data-i18n-aria-label="${escapeAttr(i18nKey("userToggleAriaLabel", "sidebar.user.toggle"))}"
          data-state="closed"
          data-dropdown-open="false"
          data-authenticated="false"
        >
          <span
            id="${IDS.avatar}"
            class="avatar"
            role="img"
            aria-label="${escapeAttr(labels.userAvatar)}"
            data-i18n-aria-label="${escapeAttr(i18nKey("userAvatarAriaLabel", "sidebar.user.avatar"))}"
            data-default-avatar="ON"
            data-avatar-root="true"
            data-sidebar-avatar="true"
            data-user-avatar="true"
            data-avatar-mode="fallback"
            data-avatar-state="initial"
            data-authenticated="false"
          >
            <img
              id="${IDS.avatarImage}"
              class="avatar-image"
              alt=""
              draggable="false"
              decoding="async"
              loading="eager"
              referrerpolicy="no-referrer"
              data-avatar-image="true"
              aria-hidden="true"
              hidden
            >

            <span
              id="${IDS.avatarFallback}"
              class="avatar-fallback"
              data-avatar-fallback="true"
              aria-hidden="true"
            >ON</span>
          </span>

          <span class="user-info">
            <span
              id="${IDS.name}"
              class="name"
              data-sidebar-name="true"
              data-user-name="true"
              data-default-i18n="${escapeAttr(i18nKey("userDefaultName", "sidebar.user.defaultName"))}"
              data-default-name="${escapeAttr(labels.userDefaultName)}"
              data-authenticated="false"
              aria-live="polite"
            >${escapeHtml(labels.userDefaultName)}</span>

            <span
              id="${IDS.plan}"
              class="plan"
              data-sidebar-user-plan="true"
              data-static="true"
              data-i18n="${escapeAttr(i18nKey("userPlan", "sidebar.user.plan"))}"
            >${escapeHtml(labels.userPlan)}</span>
          </span>

${Icons.chevron}
        </button>`;
}

function renderUserDropdown(labels) {
  return `
        <div
          id="${IDS.userDropdown}"
          class="user-dropdown"
          role="menu"
          aria-label="${escapeAttr(labels.userMenu)}"
          data-i18n-aria-label="${escapeAttr(i18nKey("userDropdownAriaLabel", "sidebar.user.menu"))}"
          data-user-dropdown="true"
          data-user-menu="true"
          data-sidebar-user-dropdown="true"
          data-sidebar-user-menu="true"
          data-sidebar-dropdown="user"
          data-dropdown="user"
          data-dropdown-menu="user"
          data-dropdown-state="closed"
          data-state="closed"
          data-open="false"
          aria-hidden="true"
          hidden
        >
${renderDropdownButton({
  label: labels.addAccount,
  i18nKey: i18nKey("userAddAccount", "sidebar.user.addAccount"),
  action: ACTIONS.addAccount,
  icon: Icons.plus,
})}

          <div class="dropdown-divider" role="separator" aria-hidden="true"></div>

${renderDropdownButton({
  label: labels.changePlan,
  i18nKey: i18nKey("userChangePlan", "sidebar.user.changePlan"),
  action: ACTIONS.changePlan,
  icon: Icons.upgrade,
})}

${renderDropdownButton({
  label: labels.profile,
  i18nKey: i18nKey("userProfile", "sidebar.user.profile"),
  action: ACTIONS.profile,
  route: ROUTES.account,
  icon: Icons.account,
})}

${renderDropdownButton({
  label: labels.userSettings,
  i18nKey: i18nKey("userSettings", "sidebar.user.settings"),
  action: ACTIONS.settings,
  route: ROUTES.settings,
  icon: Icons.settings,
})}

          <div class="dropdown-divider" role="separator" aria-hidden="true"></div>

${renderDropdownButton({
  label: labels.help,
  i18nKey: i18nKey("userHelp", "sidebar.user.help"),
  action: ACTIONS.help,
  icon: Icons.help,
})}

${renderDropdownButton({
  id: IDS.logout,
  label: labels.logout,
  i18nKey: i18nKey("userLogout", "sidebar.user.logout"),
  action: ACTIONS.logout,
  icon: Icons.logout,
  danger: true,
})}
        </div>`;
}

function renderFooter(labels) {
  return `
      <footer
        id="${IDS.footer}"
        class="sidebar-footer"
        data-sidebar-footer="true"
        data-sidebar-user-section="true"
        data-state="closed"
        data-user-dropdown-open="false"
      >
        <div
          id="${IDS.userSection}"
          class="sidebar-user"
          data-sidebar-user-section="true"
        >
${renderUserToggle(labels)}

${renderUserDropdown(labels)}
        </div>
      </footer>`;
}

/* =========================================================
   ROOT ATTRS
========================================================= */

function resolveInitialUiState(options = {}) {
  const collapsed =
    options?.collapsed === true ||
    options?.desktopCollapsed === true;

  const open = !collapsed;

  return {
    collapsed,
    open,

    dataOpen:
      open ? "true" : "false",

    dataCollapsed:
      collapsed ? "true" : "false",

    dataState:
      collapsed ? "collapsed" : "open",
  };
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getSidebarTemplate(options = {}) {
  const opts = safeObject(options);

  const labels =
    getSidebarLabels(opts.labels);

  const ui =
    resolveInitialUiState(opts);

  const rootClasses = [
    "sidebar",
    ui.collapsed ? "collapsed is-collapsed" : "open is-open",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <aside
      id="${IDS.root}"
      class="${rootClasses}"
      role="complementary"
      aria-label="${escapeAttr(labels.sidebarAria)}"
      data-i18n-aria-label="${escapeAttr(i18nKey("ariaMain", "sidebar.aria.main"))}"
      data-sidebar-root="true"
      data-sidebar="true"
      data-component="${escapeAttr(safeText(SIDEBAR_COMPONENT_NAME, "sidebar"))}"
      data-module="${escapeAttr(safeText(SIDEBAR_MODULE_NAME, "SidebarUI"))}"
      data-template-version="${SIDEBAR_TEMPLATE_VERSION}"
      data-constants-version="${escapeAttr(safeText(SIDEBAR_CONSTANTS_VERSION, ""))}"
      data-mounted="false"
      data-ready="false"
      data-open="${ui.dataOpen}"
      data-collapsed="${ui.dataCollapsed}"
      data-state="${ui.dataState}"
      data-mode="desktop"
      data-viewport="desktop"
      data-user-dropdown-open="false"
      data-dropdown-open="false"
      data-active-route=""
      data-active-key=""
      data-shell-visible="true"
    >
      <div
        class="sidebar-top"
        data-sidebar-top="true"
      >
${renderLogo(labels)}

${renderDesktopToggle(labels, ui)}
      </div>

${renderMainMenu(labels)}

${renderRecents(labels)}

${renderFooter(labels)}
    </aside>`;
}

/* =========================================================
   DEBUG
========================================================= */

export function getSidebarTemplateSnapshot() {
  const navItems =
    getNavItems();

  return {
    version:
      SIDEBAR_TEMPLATE_VERSION,

    component:
      safeText(SIDEBAR_COMPONENT_NAME, "sidebar"),

    module:
      safeText(SIDEBAR_MODULE_NAME, "SidebarUI"),

    constantsVersion:
      safeText(SIDEBAR_CONSTANTS_VERSION, ""),

    routes:
      {
        ...ROUTES,
      },

    aliases:
      {
        ...ROUTE_ALIASES,
      },

    navItems:
      navItems.map((item) => ({
        key:
          item.key,

        route:
          item.route,

        icon:
          item.icon,

        i18nKey:
          item.i18nKey || `sidebar.nav.${item.key}`,

        adminOnly:
          item.adminOnly === true ||
          item.admin === true ||
          item.requiresAdmin === true,

        order:
          item.order || 0,
      })),

    ids: {
      sidebarRootId:
        IDS.root,

      sidebarMountId:
        IDS.mount,

      sidebarNavId:
        IDS.nav,

      sidebarMenuId:
        IDS.menu,

      sidebarRecentsId:
        IDS.recents,

      sidebarFooterId:
        IDS.footer,

      sidebarIndicatorId:
        IDS.indicator,

      userToggleId:
        IDS.userToggle,

      userDropdownId:
        IDS.userDropdown,

      logoutButtonId:
        IDS.logout,

      sidebarAvatarId:
        IDS.avatar,

      sidebarNameId:
        IDS.name,

      logoId:
        IDS.logo,

      desktopToggleId:
        IDS.toggle,

      mobileToggleId:
        IDS.mobileToggle,

      mobileToggleRenderedInsideSidebar:
        false,

      avatarImageId:
        IDS.avatarImage,

      avatarFallbackId:
        IDS.avatarFallback,

      userPlanId:
        IDS.plan,
    },

    actions:
      {
        ...ACTIONS,
      },

    contract: {
      logoTooltip:
        false,

      nativeTitle:
        false,

      menuIndicatorReady:
        true,

      dropdownInitialState:
        "closed",

      adminItemsHiddenButRecoverable:
        true,

      internalMobileToggleRendered:
        false,

      avatarImageInitialSrc:
        false,

      appCoreSyncUserUICompatible:
        true,

      usesConstantsRoutes:
        true,

      usesConstantsIds:
        true,

      unsafeExternalRoutes:
        false,
    },

    dataAttrs:
      {
        ...safeObject(SIDEBAR_DATA_ATTRS),
      },
  };
}

/* =========================================================
   LEGACY RE-EXPORTS
========================================================= */

export {
  SIDEBAR_LOGO_ID,
  SIDEBAR_TOGGLE_ID,
  SIDEBAR_MOBILE_TOGGLE_ID,
  SIDEBAR_AVATAR_IMAGE_ID,
  SIDEBAR_AVATAR_FALLBACK_ID,
  SIDEBAR_USER_PLAN_ID,
  SIDEBAR_ROUTES,
  SIDEBAR_ROUTE_ALIASES,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default getSidebarTemplate;
