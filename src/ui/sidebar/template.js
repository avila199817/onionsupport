/* =========================================================
   Onion SPA - Sidebar Template
   Archivo: src/ui/sidebar/template.js

   FINAL EXTREME SYSTEM · SIDEBAR TEMPLATE · I18N/A11Y/DOM SAFE · 10/10
   PATCH · ROUTES CANÓNICAS · ACTIVE STATE READY · APPLE INDICATOR READY
   PATCH · FACTURAS / INCIDENCIAS ROUTE HARDENED
   PATCH · DROPDOWN ROUTE BUTTONS SAFE
   PATCH · ADMIN ITEMS HIDDEN-BUT-RECOVERABLE
   PATCH · NO NATIVE TITLE · CUSTOM TOOLTIP ONLY
   PATCH · DATA-ROUTE / DATA-HREF / DATA-TO CONSISTENTES

   RESPONSABILIDADES:
   - generar el HTML base del sidebar
   - centralizar el marcado del módulo
   - consumir constantes del sidebar
   - preparado para i18n real
   - tooltips custom con refresh live
   - evitar tooltips nativos del navegador
   - accesibilidad consistente
   - separar textos estáticos i18n de valores dinámicos de sesión
   - incluir la vista Servidor en el menú lateral
   - mantener compatibilidad total con AppCore.syncUserUI()
   - no pintar tooltip en el logo
   - no pintar tooltip nativo en avatar/footer
   - marcar rutas admin para filtrado visual posterior
   - evitar flash de rutas admin antes de aplicar visibilidad
   - incluir data-sidebar-action para fallback delegado
   - incluir data-action para compatibilidad con delegación genérica
   - incluir data-route / data-href / data-to para navegación robusta
   - dropdown de usuario con button real, data-user-toggle y data-user-dropdown
   - estructura DOM compatible con dom.js / events.js / dropdown.js / index.js
   - SVGs preservados

   HARDENING:
   - IDs alineados con constants.js
   - selectores fallback estables
   - aria-controls / aria-expanded / aria-hidden coherentes
   - dropdown nace cerrado pero desbloqueable por JS
   - evita aria-hidden en contenedores interactivos principales
   - sin title nativo en footer/logo/avatar
   - rutas admin ocultas de inicio hasta applyRoleVisibility()
   - avatar image sin src inicial para evitar request vacío
   - menú preparado para indicador activo tipo Apple desde state.js
   - cada item declara ruta canónica única
   - Facturas SIEMPRE /facturas
   - Incidencias SIEMPRE /incidencias
========================================================= */

import { I18n } from "../../i18n/index.js";

import {
  SIDEBAR_ROOT_ID,
  SIDEBAR_MENU_ID,
  SIDEBAR_RECENTS_ID,
  USER_TOGGLE_ID,
  USER_DROPDOWN_ID,
  LOGOUT_BUTTON_ID,
  SIDEBAR_AVATAR_ID,
  SIDEBAR_NAME_ID,
} from "./constants.js";

/* =========================================================
   LOCAL CONSTANTS
========================================================= */

export const SIDEBAR_TEMPLATE_VERSION = "sidebar-template-v6-route-hardened";

export const SIDEBAR_LOGO_ID = "homeLink";
export const SIDEBAR_TOGGLE_ID = "toggleSidebar";
export const SIDEBAR_MOBILE_TOGGLE_ID = "toggleSidebarMobile";

export const SIDEBAR_AVATAR_IMAGE_ID = "sidebarAvatarImage";
export const SIDEBAR_AVATAR_FALLBACK_ID = "sidebarAvatarFallback";
export const SIDEBAR_USER_PLAN_ID = "sidebarUserPlan";

export const SIDEBAR_ROUTES = Object.freeze({
  home: "/",
  tickets: "/incidencias",
  invoices: "/facturas",
  users: "/usuarios",
  clients: "/clientes",
  account: "/cuenta",
  settings: "/ajustes",
  server: "/servidor",
});

export const SIDEBAR_ROUTE_ALIASES = Object.freeze({
  "/home": SIDEBAR_ROUTES.home,
  "/dashboard": SIDEBAR_ROUTES.home,

  "/tickets": SIDEBAR_ROUTES.tickets,
  "/ticket": SIDEBAR_ROUTES.tickets,
  "/incidents": SIDEBAR_ROUTES.tickets,
  "/incident": SIDEBAR_ROUTES.tickets,

  "/invoices": SIDEBAR_ROUTES.invoices,
  "/invoice": SIDEBAR_ROUTES.invoices,
  "/billing": SIDEBAR_ROUTES.invoices,

  "/users": SIDEBAR_ROUTES.users,
  "/user": SIDEBAR_ROUTES.users,

  "/clients": SIDEBAR_ROUTES.clients,
  "/client": SIDEBAR_ROUTES.clients,
  "/customers": SIDEBAR_ROUTES.clients,
  "/customer": SIDEBAR_ROUTES.clients,

  "/account": SIDEBAR_ROUTES.account,
  "/profile": SIDEBAR_ROUTES.account,

  "/settings": SIDEBAR_ROUTES.settings,
  "/config": SIDEBAR_ROUTES.settings,

  "/server": SIDEBAR_ROUTES.server,
});

/* =========================================================
   I18N
========================================================= */

function t(key, fallback = "", params = {}) {
  try {
    if (typeof I18n?.t === "function") {
      return I18n.t(key, params, fallback);
    }
  } catch {}

  return fallback || key;
}

/* =========================================================
   SAFE HTML
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function isUnsafeHref(value = "") {
  const raw = safeText(value, "").toLowerCase();

  return Boolean(
    raw.startsWith("javascript:") ||
      raw.startsWith("data:") ||
      raw.startsWith("vbscript:") ||
      raw.startsWith("file:")
  );
}

function normalizeRoute(value = "/") {
  let text = safeText(value, "/");

  if (!text) return "/";

  if (isUnsafeHref(text)) return "/";

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  if (text.startsWith("#/")) {
    text = text.replace(/^#\/?/, "/");
  } else if (text.startsWith("#!")) {
    text = text.replace(/^#!\/?/, "/");
  } else if (text.startsWith("#")) {
    return text;
  }

  text = text.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

  if (!text.startsWith("/")) {
    text = `/${text}`;
  }

  const [pathname, query = ""] = text.split("?");

  let cleanPathname = pathname || "/";

  if (cleanPathname.length > 1) {
    cleanPathname = cleanPathname.replace(/\/+$/g, "") || "/";
  }

  const aliased = SIDEBAR_ROUTE_ALIASES[cleanPathname] || cleanPathname;

  return query ? `${aliased}?${query}` : aliased;
}

function attrIf(name = "", enabled = false) {
  const cleanName = safeText(name, "");

  if (!cleanName || !enabled) {
    return "";
  }

  return cleanName;
}

function attr(name = "", value = "") {
  const cleanName = safeText(name, "");
  const cleanValue = safeText(value, "");

  if (!cleanName || !cleanValue) {
    return "";
  }

  return `${cleanName}="${escapeAttr(cleanValue)}"`;
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
              <rect
                x="4"
                y="5"
                width="16"
                height="5"
                rx="1.5"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <rect
                x="4"
                y="14"
                width="16"
                height="5"
                rx="1.5"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <circle cx="8" cy="7.5" r="1" fill="currentColor" />
              <circle cx="8" cy="16.5" r="1" fill="currentColor" />
              <path
                d="M11 7.5h5"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
              <path
                d="M11 16.5h5"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
              />
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

  mobileToggle: `
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            focusable="false"
            aria-hidden="true"
          >
            <path
              d="M4 7h16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M4 12h16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
            <path
              d="M4 17h16"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
  `,
});

/* =========================================================
   LABELS
========================================================= */

function getSidebarLabels() {
  return {
    sidebarAria: t("sidebar.aria.main", "Barra lateral principal"),
    navAria: t("sidebar.aria.navigation", "Navegación principal"),

    logoLink: t("sidebar.logo.ariaLabel", "Ir al inicio"),
    logoAlt: t("sidebar.logo.alt", "Onion Support"),

    collapseSidebar: t("sidebar.toggle.collapse", "Contraer barra lateral"),
    expandSidebar: t("sidebar.toggle.expand", "Expandir barra lateral"),
    openSidebar: t("sidebar.toggle.open", "Abrir navegación"),
    closeSidebar: t("sidebar.toggle.close", "Cerrar navegación"),

    home: t("sidebar.menu.home", "Inicio"),
    tickets: t("sidebar.menu.tickets", "Incidencias"),
    invoices: t("sidebar.menu.invoices", "Facturas"),
    users: t("sidebar.menu.users", "Usuarios"),
    clients: t("sidebar.menu.clients", "Clientes"),
    account: t("sidebar.menu.account", "Cuenta"),
    settings: t("sidebar.menu.settings", "Ajustes"),
    server: t("sidebar.menu.server", "Servidor"),

    recentsAria: t("sidebar.recents.ariaLabel", "Recientes"),
    recentsTitle: t("sidebar.recents.title", "Recientes"),

    userToggle: t("sidebar.user.toggleAriaLabel", "Abrir menú de usuario"),
    userAvatar: t("sidebar.user.avatarAriaLabel", "Avatar usuario"),
    userDefaultName: t("sidebar.user.defaultName", "Usuario"),
    userPlan: t("sidebar.user.plan", "Go Plan"),
    userMenu: t("sidebar.user.dropdownAriaLabel", "Menú de usuario"),

    addAccount: t("sidebar.user.addAccount", "Añadir cuenta"),
    changePlan: t("sidebar.user.changePlan", "Cambiar plan"),
    profile: t("sidebar.user.profile", "Perfil"),
    userSettings: t("sidebar.user.settings", "Configuración"),
    help: t("sidebar.user.help", "Ayuda"),
    logout: t("sidebar.user.logout", "Cerrar sesión"),
  };
}

/* =========================================================
   MENU CONFIG
========================================================= */

function getMainMenuItems(labels) {
  return [
    {
      key: "home",
      route: SIDEBAR_ROUTES.home,
      label: labels.home,
      i18nKey: "sidebar.menu.home",
      icon: Icons.home,
      adminOnly: false,
    },

    {
      key: "tickets",
      route: SIDEBAR_ROUTES.tickets,
      label: labels.tickets,
      i18nKey: "sidebar.menu.tickets",
      icon: Icons.tickets,
      adminOnly: false,
    },

    {
      key: "invoices",
      route: SIDEBAR_ROUTES.invoices,
      label: labels.invoices,
      i18nKey: "sidebar.menu.invoices",
      icon: Icons.invoices,
      adminOnly: false,
    },

    {
      key: "users",
      route: SIDEBAR_ROUTES.users,
      label: labels.users,
      i18nKey: "sidebar.menu.users",
      icon: Icons.users,
      adminOnly: true,
    },

    {
      key: "clients",
      route: SIDEBAR_ROUTES.clients,
      label: labels.clients,
      i18nKey: "sidebar.menu.clients",
      icon: Icons.clients,
      adminOnly: true,
    },

    {
      key: "account",
      route: SIDEBAR_ROUTES.account,
      label: labels.account,
      i18nKey: "sidebar.menu.account",
      icon: Icons.account,
      adminOnly: false,
    },

    {
      key: "settings",
      route: SIDEBAR_ROUTES.settings,
      label: labels.settings,
      i18nKey: "sidebar.menu.settings",
      icon: Icons.settings,
      adminOnly: false,
    },

    {
      key: "server",
      route: SIDEBAR_ROUTES.server,
      label: labels.server,
      i18nKey: "sidebar.menu.server",
      icon: Icons.server,
      adminOnly: true,
    },
  ];
}

/* =========================================================
   MENU ITEM
========================================================= */

function renderAdminVisibilityAttrs(adminOnly = false) {
  if (!adminOnly) {
    return `
          data-required-role=""
          data-requires-role=""
          data-admin-only="false"
          data-sidebar-admin-only="false"
          data-sidebar-visible="true"
          data-role-visible="true"
          data-admin-visible="true"
          data-hidden-default="false"
        `;
  }

  return `
          data-role="admin"
          data-required-role="admin"
          data-requires-role="admin"
          data-admin-only="true"
          data-sidebar-admin-only="true"
          data-sidebar-visible="false"
          data-role-visible="false"
          data-admin-visible="false"
          data-hidden-default="true"
          aria-hidden="true"
          tabindex="-1"
          hidden
        `;
}

function renderMenuItem({
  href = "/",
  label = "",
  i18nKey = "",
  icon = "",
  key = "",
  adminOnly = false,
  extraAttrs = "",
} = {}) {
  const route = normalizeRoute(href);
  const routeKey = normalizeKey(key || label || route);
  const cleanRoute = escapeAttr(route);
  const cleanLabel = escapeAttr(label);
  const cleanI18nKey = escapeAttr(i18nKey);
  const cleanRouteKey = escapeAttr(routeKey);

  return `
        <a
          href="${cleanRoute}"
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
          data-sidebar-item-key="${cleanRouteKey}"
          data-nav-key="${cleanRouteKey}"
          data-route-key="${cleanRouteKey}"
          data-menu-key="${cleanRouteKey}"
          data-action="navigate"
          data-sidebar-action="navigate"
          data-nav-action="navigate"
          data-active="false"
          data-current="false"
          class="menu-item"
          data-tooltip="${cleanLabel}"
          ${i18nKey ? `data-i18n-data-tooltip="${cleanI18nKey}"` : ""}
          aria-label="${cleanLabel}"
          ${i18nKey ? `data-i18n-aria-label="${cleanI18nKey}"` : ""}
          ${renderAdminVisibilityAttrs(adminOnly)}
          ${safeText(extraAttrs, "")}
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
          >${cleanLabel}</span>
        </a>`;
}

/* =========================================================
   USER DROPDOWN ITEM
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
  const cleanI18nKey = escapeAttr(i18nKey);
  const cleanAction = escapeAttr(action || "dropdown-action");
  const normalizedRoute = route ? normalizeRoute(route) : "";
  const cleanRoute = escapeAttr(normalizedRoute);

  return `
          <button
            ${cleanId ? `id="${escapeAttr(cleanId)}"` : ""}
            type="button"
            class="dropdown-item${danger ? " dropdown-item-danger" : ""}"
            role="menuitem"
            tabindex="-1"
            data-sidebar-action="${cleanAction}"
            data-action="${cleanAction}"
            ${cleanRoute ? `data-route="${cleanRoute}" data-href="${cleanRoute}" data-to="${cleanRoute}" data-public-path="${cleanRoute}" data-canonical-path="${cleanRoute}"` : ""}
            aria-label="${escapeAttr(label)}"
            ${i18nKey ? `data-i18n-aria-label="${cleanI18nKey}"` : ""}
            ${attrIf("disabled", disabled)}
            ${disabled ? `aria-disabled="true"` : ""}
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
  return `
        <a
          href="${SIDEBAR_ROUTES.home}"
          data-spa="true"
          data-route="${SIDEBAR_ROUTES.home}"
          data-href="${SIDEBAR_ROUTES.home}"
          data-to="${SIDEBAR_ROUTES.home}"
          data-public-path="${SIDEBAR_ROUTES.home}"
          data-canonical-path="${SIDEBAR_ROUTES.home}"
          data-sidebar-logo="true"
          data-sidebar-action="navigate"
          data-action="navigate"
          class="logo"
          id="${SIDEBAR_LOGO_ID}"
          aria-label="${escapeAttr(labels.logoLink)}"
          data-i18n-aria-label="sidebar.logo.ariaLabel"
        >
          <img
            class="logo-dark"
            draggable="false"
            src="/src/media/img/favicon_white.png"
            alt="${escapeAttr(labels.logoAlt)}"
            data-i18n-alt="sidebar.logo.alt"
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
            data-i18n-alt="sidebar.logo.alt"
            width="36"
            height="36"
            decoding="async"
            loading="eager"
          >
        </a>
  `;
}

function renderDesktopToggle(labels) {
  return `
        <button
          type="button"
          class="sidebar-toggle"
          id="${SIDEBAR_TOGGLE_ID}"
          data-sidebar-toggle="true"
          data-sidebar-action="toggle-sidebar"
          data-action="toggle-sidebar"
          data-tooltip="${escapeAttr(labels.collapseSidebar)}"
          data-i18n-data-tooltip="sidebar.toggle.collapse"
          aria-label="${escapeAttr(labels.collapseSidebar)}"
          data-i18n-aria-label="sidebar.toggle.collapse"
          aria-controls="${SIDEBAR_ROOT_ID} ${SIDEBAR_MENU_ID}"
          aria-expanded="true"
          data-state="open"
        >
${Icons.desktopToggle}
        </button>
  `;
}

function renderMobileToggle(labels) {
  return `
        <button
          type="button"
          class="sidebar-mobile-toggle"
          id="${SIDEBAR_MOBILE_TOGGLE_ID}"
          data-sidebar-mobile-toggle="true"
          data-sidebar-action="mobile-sidebar-toggle"
          data-action="mobile-sidebar-toggle"
          data-tooltip="${escapeAttr(labels.openSidebar)}"
          data-i18n-data-tooltip="sidebar.toggle.open"
          aria-label="${escapeAttr(labels.openSidebar)}"
          data-i18n-aria-label="sidebar.toggle.open"
          aria-controls="${SIDEBAR_ROOT_ID} ${SIDEBAR_MENU_ID}"
          aria-expanded="false"
          data-state="closed"
        >
${Icons.mobileToggle}
        </button>
  `;
}

function renderMainMenu(labels) {
  const items = getMainMenuItems(labels);

  return `
      <nav
        class="sidebar-menu"
        id="${SIDEBAR_MENU_ID}"
        aria-label="${escapeAttr(labels.navAria)}"
        data-i18n-aria-label="sidebar.aria.navigation"
        data-sidebar-menu="true"
        data-nav-area="sidebar"
        data-active-route=""
        data-active-key=""
        data-indicator-ready="false"
        data-indicator-route=""
        data-indicator-reason="initial"
      >
${items.map((item) => renderMenuItem({
  href: item.route,
  label: item.label,
  i18nKey: item.i18nKey,
  key: item.key,
  icon: item.icon,
  adminOnly: item.adminOnly,
})).join("\n")}
      </nav>
  `;
}

function renderRecents(labels) {
  return `
      <section
        class="sidebar-section"
        id="${SIDEBAR_RECENTS_ID}"
        aria-label="${escapeAttr(labels.recentsAria)}"
        data-i18n-aria-label="sidebar.recents.ariaLabel"
        data-sidebar-recents="true"
        data-sidebar-recent="true"
      >
        <span
          class="section-title"
          data-i18n="sidebar.recents.title"
        >${escapeHtml(labels.recentsTitle)}</span>
      </section>
  `;
}

function renderUserToggle(labels) {
  return `
        <button
          type="button"
          class="user"
          id="${USER_TOGGLE_ID}"
          data-user-toggle="true"
          data-sidebar-user-toggle="true"
          data-sidebar-action="toggle-user-dropdown"
          data-action="toggle-user-dropdown"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-controls="${USER_DROPDOWN_ID}"
          aria-label="${escapeAttr(labels.userToggle)}"
          data-i18n-aria-label="sidebar.user.toggleAriaLabel"
          data-state="closed"
        >
          <span
            class="avatar"
            id="${SIDEBAR_AVATAR_ID}"
            aria-label="${escapeAttr(labels.userAvatar)}"
            data-i18n-aria-label="sidebar.user.avatarAriaLabel"
            data-default-avatar="ON"
            data-avatar-root="true"
            data-sidebar-avatar="true"
          >
            <img
              class="avatar-image"
              id="${SIDEBAR_AVATAR_IMAGE_ID}"
              alt=""
              draggable="false"
              decoding="async"
              hidden
            >

            <span
              class="avatar-fallback"
              id="${SIDEBAR_AVATAR_FALLBACK_ID}"
              aria-hidden="true"
            >ON</span>
          </span>

          <span class="user-info">
            <span
              class="name"
              id="${SIDEBAR_NAME_ID}"
              data-sidebar-name="true"
              data-user-name="true"
              data-default-i18n="sidebar.user.defaultName"
              data-default-name="${escapeAttr(labels.userDefaultName)}"
            >${escapeHtml(labels.userDefaultName)}</span>

            <span
              class="plan"
              id="${SIDEBAR_USER_PLAN_ID}"
              data-static="true"
              data-i18n="sidebar.user.plan"
            >${escapeHtml(labels.userPlan)}</span>
          </span>

${Icons.chevron}
        </button>
  `;
}

function renderUserDropdown(labels) {
  return `
        <div
          class="user-dropdown"
          id="${USER_DROPDOWN_ID}"
          role="menu"
          aria-label="${escapeAttr(labels.userMenu)}"
          data-i18n-aria-label="sidebar.user.dropdownAriaLabel"
          data-user-dropdown="true"
          data-user-menu="true"
          data-sidebar-user-dropdown="true"
          data-sidebar-user-menu="true"
          data-sidebar-dropdown="user"
          data-dropdown="user"
          data-dropdown-menu="user"
          data-state="closed"
          aria-hidden="true"
          hidden
        >
${renderDropdownButton({
  label: labels.addAccount,
  i18nKey: "sidebar.user.addAccount",
  action: "add-account",
  icon: Icons.plus,
})}

          <div class="dropdown-divider" role="separator" aria-hidden="true"></div>

${renderDropdownButton({
  label: labels.changePlan,
  i18nKey: "sidebar.user.changePlan",
  action: "change-plan",
  icon: Icons.upgrade,
})}

${renderDropdownButton({
  label: labels.profile,
  i18nKey: "sidebar.user.profile",
  action: "profile",
  route: SIDEBAR_ROUTES.account,
  icon: Icons.account,
})}

${renderDropdownButton({
  label: labels.userSettings,
  i18nKey: "sidebar.user.settings",
  action: "settings",
  route: SIDEBAR_ROUTES.settings,
  icon: Icons.settings,
})}

          <div class="dropdown-divider" role="separator" aria-hidden="true"></div>

${renderDropdownButton({
  label: labels.help,
  i18nKey: "sidebar.user.help",
  action: "help",
  icon: Icons.help,
})}

${renderDropdownButton({
  id: LOGOUT_BUTTON_ID,
  label: labels.logout,
  i18nKey: "sidebar.user.logout",
  action: "logout",
  icon: Icons.logout,
  danger: true,
})}
        </div>
  `;
}

function renderFooter(labels) {
  return `
      <div
        class="sidebar-footer"
        data-sidebar-footer="true"
      >
${renderUserToggle(labels)}

${renderUserDropdown(labels)}
      </div>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getSidebarTemplate() {
  const labels = getSidebarLabels();

  return `
    <aside
      class="sidebar"
      id="${SIDEBAR_ROOT_ID}"
      aria-label="${escapeAttr(labels.sidebarAria)}"
      data-i18n-aria-label="sidebar.aria.main"
      data-sidebar-root="true"
      data-sidebar="true"
      data-component="sidebar"
      data-template-version="${SIDEBAR_TEMPLATE_VERSION}"
      data-open="true"
      data-collapsed="false"
      data-mode="desktop"
      data-viewport="desktop"
      data-dropdown-open="false"
      data-ready="false"
      aria-hidden="false"
    >
      <div
        class="sidebar-top"
        data-sidebar-top="true"
      >
${renderLogo(labels)}

${renderDesktopToggle(labels)}

${renderMobileToggle(labels)}
      </div>

${renderMainMenu(labels)}

${renderRecents(labels)}

${renderFooter(labels)}
    </aside>
  `;
}

/* =========================================================
   DEBUG
========================================================= */

export function getSidebarTemplateSnapshot() {
  return {
    version: SIDEBAR_TEMPLATE_VERSION,
    routes: {
      ...SIDEBAR_ROUTES,
    },
    aliases: {
      ...SIDEBAR_ROUTE_ALIASES,
    },
    ids: {
      sidebarRootId: SIDEBAR_ROOT_ID,
      sidebarMenuId: SIDEBAR_MENU_ID,
      sidebarRecentsId: SIDEBAR_RECENTS_ID,
      userToggleId: USER_TOGGLE_ID,
      userDropdownId: USER_DROPDOWN_ID,
      logoutButtonId: LOGOUT_BUTTON_ID,
      sidebarAvatarId: SIDEBAR_AVATAR_ID,
      sidebarNameId: SIDEBAR_NAME_ID,
      logoId: SIDEBAR_LOGO_ID,
      desktopToggleId: SIDEBAR_TOGGLE_ID,
      mobileToggleId: SIDEBAR_MOBILE_TOGGLE_ID,
      avatarImageId: SIDEBAR_AVATAR_IMAGE_ID,
      avatarFallbackId: SIDEBAR_AVATAR_FALLBACK_ID,
      userPlanId: SIDEBAR_USER_PLAN_ID,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default getSidebarTemplate;
