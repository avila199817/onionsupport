/* =========================================================
   Onion SPA - Sidebar Template
   Archivo: src/ui/sidebar/template.js

   ONION SUPPORT · SIDEBAR TEMPLATE · 15/10
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
  "sidebar-template-v15-extreme-dom-contract";

/* =========================================================
   I18N
========================================================= */

function t(key, fallback = "", params = {}) {
  const cleanKey =
    safeText(key, "");

  const cleanFallback =
    safeText(fallback, cleanKey);

  if (!cleanKey) {
    return cleanFallback;
  }

  try {
    if (typeof I18n?.t === "function") {
      return (
        I18n.t(
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
  const cleanName =
    safeText(name, "");

  if (!cleanName || !enabled) {
    return "";
  }

  return ` ${cleanName}`;
}

function attr(name = "", value = "") {
  const cleanName =
    safeText(name, "");

  if (!cleanName) {
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

function dataAttr(name = "", value = "") {
  return attr(
    name,
    value
  );
}

/* =========================================================
   ROUTE SAFETY
========================================================= */

function isUnsafeHref(value = "") {
  const raw =
    safeText(value, "")
      .toLowerCase();

  return Boolean(
    raw.startsWith("javascript:") ||
      raw.startsWith("data:") ||
      raw.startsWith("vbscript:") ||
      raw.startsWith("file:") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("tel:")
  );
}

function splitRoute(value = "/") {
  const raw =
    safeText(value, "/");

  let pathname =
    raw;

  let search =
    "";

  let hash =
    "";

  const hashIndex =
    pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash =
      pathname.slice(hashIndex);

    pathname =
      pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex =
    pathname.indexOf("?");

  if (searchIndex >= 0) {
    search =
      pathname.slice(searchIndex);

    pathname =
      pathname.slice(0, searchIndex) || "/";
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
  let text =
    safeText(value, "/");

  if (!text || isUnsafeHref(text)) {
    return "/";
  }

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text)) {
    return "/";
  }

  if (text.startsWith("#/")) {
    text =
      text.replace(/^#\/?/, "/");
  } else if (text.startsWith("#!")) {
    text =
      text.replace(/^#!\/?/, "/");
  } else if (text.startsWith("#")) {
    return "/";
  }

  text =
    text
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!text.startsWith("/")) {
    text =
      `/${text}`;
  }

  const parts =
    splitRoute(text);

  let pathname =
    parts.pathname || "/";

  if (
    pathname.length > 1 &&
    pathname.endsWith("/")
  ) {
    pathname =
      pathname.replace(/\/+$/g, "") || "/";
  }

  const aliased =
    SIDEBAR_ROUTE_ALIASES[pathname] ||
    pathname;

  return `${aliased}${
    preserveSearch ? parts.search : ""
  }${
    preserveHash ? parts.hash : ""
  }`;
}

function canonicalRoute(value = "/") {
  return normalizeRoute(
    value,
    {
      preserveSearch:
        false,
      preserveHash:
        false,
    }
  );
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
});

/* =========================================================
   LABELS
========================================================= */

function getSidebarLabels(overrides = {}) {
  const source =
    overrides &&
    typeof overrides === "object"
      ? overrides
      : {};

  const labels = {
    sidebarAria:
      t(
        SIDEBAR_I18N_KEYS.ariaMain,
        "Barra lateral principal"
      ),

    navAria:
      t(
        SIDEBAR_I18N_KEYS.ariaNavigation,
        "Navegación principal"
      ),

    logoLink:
      t(
        SIDEBAR_I18N_KEYS.logoAriaLabel,
        "Ir al inicio"
      ),

    logoAlt:
      t(
        SIDEBAR_I18N_KEYS.logoAlt,
        "Onion Support"
      ),

    collapseSidebar:
      t(
        SIDEBAR_I18N_KEYS.toggleCollapse,
        "Contraer barra lateral"
      ),

    expandSidebar:
      t(
        SIDEBAR_I18N_KEYS.toggleExpand,
        "Expandir barra lateral"
      ),

    recentsAria:
      t(
        SIDEBAR_I18N_KEYS.recentsAriaLabel,
        "Recientes"
      ),

    recentsTitle:
      t(
        SIDEBAR_I18N_KEYS.recentsTitle,
        "Recientes"
      ),

    userToggle:
      t(
        SIDEBAR_I18N_KEYS.userToggleAriaLabel,
        "Abrir menú de usuario"
      ),

    userAvatar:
      t(
        SIDEBAR_I18N_KEYS.userAvatarAriaLabel,
        "Avatar usuario"
      ),

    userDefaultName:
      t(
        SIDEBAR_I18N_KEYS.userDefaultName,
        "Usuario"
      ),

    userPlan:
      t(
        SIDEBAR_I18N_KEYS.userPlan,
        "Go Plan"
      ),

    userMenu:
      t(
        SIDEBAR_I18N_KEYS.userDropdownAriaLabel,
        "Menú de usuario"
      ),

    addAccount:
      t(
        SIDEBAR_I18N_KEYS.userAddAccount,
        "Añadir cuenta"
      ),

    changePlan:
      t(
        SIDEBAR_I18N_KEYS.userChangePlan,
        "Cambiar plan"
      ),

    profile:
      t(
        SIDEBAR_I18N_KEYS.userProfile,
        "Perfil"
      ),

    userSettings:
      t(
        SIDEBAR_I18N_KEYS.userSettings,
        "Configuración"
      ),

    help:
      t(
        SIDEBAR_I18N_KEYS.userHelp,
        "Ayuda"
      ),

    logout:
      t(
        SIDEBAR_I18N_KEYS.userLogout,
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
    item.i18nKey,
    item.labelFallback || item.key || ""
  );
}

/* =========================================================
   MENU ITEM VISIBILITY
========================================================= */

function renderRoleVisibilityAttrs(item = {}) {
  const adminOnly =
    item.adminOnly === true;

  const requiredRole =
    adminOnly
      ? safeText(
          item.requiredRole,
          "admin"
        )
      : "";

  const requiredRoles =
    Array.isArray(item.requiredRoles)
      ? item.requiredRoles.join(",")
      : requiredRole;

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
          aria-hidden="true"
          tabindex="-1"
          hidden
        `;
}

/* =========================================================
   MENU ITEM
========================================================= */

function renderMenuItem(item = {}) {
  const route =
    canonicalRoute(
      item.route || SIDEBAR_ROUTES.home
    );

  const label =
    getMenuLabel(item);

  const i18nKey =
    safeText(
      item.i18nKey,
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
    route === SIDEBAR_ROUTES.server ||
    item.key === "server";

  const cleanRoute =
    escapeAttr(route);

  const cleanLabel =
    escapeAttr(label);

  const cleanI18nKey =
    escapeAttr(i18nKey);

  const cleanRouteKey =
    escapeAttr(routeKey);

  const itemClass =
    item.adminOnly
      ? "menu-item is-role-hidden is-admin-hidden"
      : "menu-item";

  return `
        <a
          ${isServer ? `id="${SERVER_NAV_ID}"` : ""}
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
          data-action="${SIDEBAR_ACTION_NAVIGATE}"
          data-sidebar-action="${SIDEBAR_ACTION_NAVIGATE}"
          data-nav-action="${SIDEBAR_ACTION_NAVIGATE}"
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
  const cleanId =
    safeText(id, "");

  const cleanLabel =
    escapeHtml(label);

  const cleanLabelAttr =
    escapeAttr(label);

  const cleanI18nKey =
    escapeAttr(i18nKey);

  const cleanDropdownAction =
    escapeAttr(
      action || "dropdown-action"
    );

  const normalizedRoute =
    route
      ? canonicalRoute(route)
      : "";

  const cleanRoute =
    escapeAttr(normalizedRoute);

  const primaryAction =
    normalizedRoute
      ? SIDEBAR_ACTION_NAVIGATE
      : cleanDropdownAction;

  return `
          <button
            ${cleanId ? `id="${escapeAttr(cleanId)}"` : ""}
            type="button"
            class="dropdown-item${danger ? " dropdown-item-danger" : ""}"
            role="menuitem"
            data-dropdown-item="true"
            data-dropdown-action="${cleanDropdownAction}"
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
  const route =
    SIDEBAR_ROUTES.home;

  return `
        <a
          id="${SIDEBAR_LOGO_ID}"
          href="${route}"
          class="logo"
          data-spa="true"
          data-route="${route}"
          data-href="${route}"
          data-to="${route}"
          data-public-path="${route}"
          data-canonical-path="${route}"
          data-sidebar-logo="true"
          data-sidebar-action="${SIDEBAR_ACTION_NAVIGATE}"
          data-action="${SIDEBAR_ACTION_NAVIGATE}"
          aria-label="${escapeAttr(labels.logoLink)}"
          data-i18n-aria-label="${SIDEBAR_I18N_KEYS.logoAriaLabel}"
        >
          <img
            class="logo-dark"
            draggable="false"
            src="/src/media/img/favicon_white.png"
            alt="${escapeAttr(labels.logoAlt)}"
            data-i18n-alt="${SIDEBAR_I18N_KEYS.logoAlt}"
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
            data-i18n-alt="${SIDEBAR_I18N_KEYS.logoAlt}"
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

  const i18nKey =
    collapsed
      ? SIDEBAR_I18N_KEYS.toggleExpand
      : SIDEBAR_I18N_KEYS.toggleCollapse;

  return `
        <button
          id="${SIDEBAR_TOGGLE_ID}"
          type="button"
          class="sidebar-toggle"
          data-sidebar-toggle="true"
          data-sidebar-action="${SIDEBAR_ACTION_TOGGLE}"
          data-action="${SIDEBAR_ACTION_TOGGLE}"
          data-tooltip="${escapeAttr(tooltip)}"
          data-i18n-data-tooltip="${i18nKey}"
          aria-label="${escapeAttr(tooltip)}"
          data-i18n-aria-label="${i18nKey}"
          aria-controls="${SIDEBAR_ROOT_ID} ${SIDEBAR_MENU_ID}"
          aria-expanded="${expanded}"
          data-state="${state}"
        >
${Icons.desktopToggle}
        </button>`;
}

function renderMainMenu() {
  const items =
    SIDEBAR_NAV_ITEMS
      .slice()
      .sort((a, b) =>
        Number(a.order || 0) - Number(b.order || 0)
      );

  return `
      <nav
        id="${SIDEBAR_NAV_ID}"
        class="sidebar-nav"
        data-sidebar-nav-id="true"
        data-sidebar-nav-root="true"
        aria-label="${escapeAttr(t(SIDEBAR_I18N_KEYS.ariaNavigation, "Navegación principal"))}"
        data-i18n-aria-label="${SIDEBAR_I18N_KEYS.ariaNavigation}"
      >
        <div
          id="${SIDEBAR_MENU_ID}"
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
            id="${SIDEBAR_INDICATOR_ID}"
            class="sidebar-active-indicator"
            aria-hidden="true"
            data-sidebar-indicator="true"
            data-sidebar-indicator-target=""
            data-state="idle"
          ></span>

${items.map((item) => renderMenuItem(item)).join("\n")}
        </div>
      </nav>`;
}

function renderRecents(labels) {
  return `
      <section
        id="${SIDEBAR_RECENTS_ID}"
        class="sidebar-section"
        aria-label="${escapeAttr(labels.recentsAria)}"
        data-i18n-aria-label="${SIDEBAR_I18N_KEYS.recentsAriaLabel}"
        data-sidebar-recents="true"
        data-sidebar-recent="true"
      >
        <span
          class="section-title"
          data-i18n="${SIDEBAR_I18N_KEYS.recentsTitle}"
        >${escapeHtml(labels.recentsTitle)}</span>
      </section>`;
}

function renderUserToggle(labels) {
  return `
        <button
          id="${USER_TOGGLE_ID}"
          type="button"
          class="user"
          data-user-toggle="true"
          data-user-menu-toggle="true"
          data-sidebar-user-toggle="true"
          data-dropdown-toggle="user"
          data-dropdown-target="${USER_DROPDOWN_ID}"
          data-sidebar-action="${SIDEBAR_ACTION_TOGGLE_USER}"
          data-action="${SIDEBAR_ACTION_TOGGLE_USER}"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-controls="${USER_DROPDOWN_ID}"
          aria-label="${escapeAttr(labels.userToggle)}"
          data-i18n-aria-label="${SIDEBAR_I18N_KEYS.userToggleAriaLabel}"
          data-state="closed"
          data-dropdown-open="false"
          data-authenticated="false"
        >
          <span
            id="${SIDEBAR_AVATAR_ID}"
            class="avatar"
            aria-label="${escapeAttr(labels.userAvatar)}"
            data-i18n-aria-label="${SIDEBAR_I18N_KEYS.userAvatarAriaLabel}"
            data-default-avatar="ON"
            data-avatar-root="true"
            data-sidebar-avatar="true"
            data-user-avatar="true"
            data-avatar-mode="fallback"
            data-avatar-state="initial"
            data-authenticated="false"
          >
            <img
              id="${SIDEBAR_AVATAR_IMAGE_ID}"
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
              id="${SIDEBAR_AVATAR_FALLBACK_ID}"
              class="avatar-fallback"
              data-avatar-fallback="true"
              aria-hidden="false"
            >ON</span>
          </span>

          <span class="user-info">
            <span
              id="${SIDEBAR_NAME_ID}"
              class="name"
              data-sidebar-name="true"
              data-user-name="true"
              data-default-i18n="${SIDEBAR_I18N_KEYS.userDefaultName}"
              data-default-name="${escapeAttr(labels.userDefaultName)}"
              data-authenticated="false"
            >${escapeHtml(labels.userDefaultName)}</span>

            <span
              id="${SIDEBAR_USER_PLAN_ID}"
              class="plan"
              data-sidebar-user-plan="true"
              data-static="true"
              data-i18n="${SIDEBAR_I18N_KEYS.userPlan}"
            >${escapeHtml(labels.userPlan)}</span>
          </span>

${Icons.chevron}
        </button>`;
}

function renderUserDropdown(labels) {
  return `
        <div
          id="${USER_DROPDOWN_ID}"
          class="user-dropdown"
          role="menu"
          aria-label="${escapeAttr(labels.userMenu)}"
          data-i18n-aria-label="${SIDEBAR_I18N_KEYS.userDropdownAriaLabel}"
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
  i18nKey: SIDEBAR_I18N_KEYS.userAddAccount,
  action: SIDEBAR_ACTION_ADD_ACCOUNT,
  icon: Icons.plus,
})}

          <div class="dropdown-divider" role="separator" aria-hidden="true"></div>

${renderDropdownButton({
  label: labels.changePlan,
  i18nKey: SIDEBAR_I18N_KEYS.userChangePlan,
  action: SIDEBAR_ACTION_CHANGE_PLAN,
  icon: Icons.upgrade,
})}

${renderDropdownButton({
  label: labels.profile,
  i18nKey: SIDEBAR_I18N_KEYS.userProfile,
  action: SIDEBAR_ACTION_PROFILE,
  route: SIDEBAR_ROUTES.account,
  icon: Icons.account,
})}

${renderDropdownButton({
  label: labels.userSettings,
  i18nKey: SIDEBAR_I18N_KEYS.userSettings,
  action: SIDEBAR_ACTION_SETTINGS,
  route: SIDEBAR_ROUTES.settings,
  icon: Icons.settings,
})}

          <div class="dropdown-divider" role="separator" aria-hidden="true"></div>

${renderDropdownButton({
  label: labels.help,
  i18nKey: SIDEBAR_I18N_KEYS.userHelp,
  action: SIDEBAR_ACTION_HELP,
  icon: Icons.help,
})}

${renderDropdownButton({
  id: LOGOUT_BUTTON_ID,
  label: labels.logout,
  i18nKey: SIDEBAR_I18N_KEYS.userLogout,
  action: SIDEBAR_ACTION_LOGOUT,
  icon: Icons.logout,
  danger: true,
})}
        </div>`;
}

function renderFooter(labels) {
  return `
      <footer
        id="${SIDEBAR_FOOTER_ID}"
        class="sidebar-footer"
        data-sidebar-footer="true"
        data-sidebar-user-section="true"
        data-state="closed"
        data-user-dropdown-open="false"
      >
        <div
          id="${USER_SECTION_ID}"
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

  const open =
    !collapsed;

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
  const opts =
    options &&
    typeof options === "object"
      ? options
      : {};

  const labels =
    getSidebarLabels(
      opts.labels
    );

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
      id="${SIDEBAR_ROOT_ID}"
      class="${rootClasses}"
      role="complementary"
      aria-label="${escapeAttr(labels.sidebarAria)}"
      data-i18n-aria-label="${SIDEBAR_I18N_KEYS.ariaMain}"
      data-sidebar-root="true"
      data-sidebar="true"
      data-component="${SIDEBAR_COMPONENT_NAME}"
      data-module="${SIDEBAR_MODULE_NAME}"
      data-template-version="${SIDEBAR_TEMPLATE_VERSION}"
      data-constants-version="${SIDEBAR_CONSTANTS_VERSION}"
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
  return {
    version:
      SIDEBAR_TEMPLATE_VERSION,

    component:
      SIDEBAR_COMPONENT_NAME,

    module:
      SIDEBAR_MODULE_NAME,

    constantsVersion:
      SIDEBAR_CONSTANTS_VERSION,

    routes:
      {
        ...SIDEBAR_ROUTES,
      },

    aliases:
      {
        ...SIDEBAR_ROUTE_ALIASES,
      },

    navItems:
      SIDEBAR_NAV_ITEMS.map((item) => ({
        key:
          item.key,

        route:
          item.route,

        icon:
          item.icon,

        i18nKey:
          item.i18nKey,

        adminOnly:
          item.adminOnly === true,

        order:
          item.order || 0,
      })),

    ids: {
      sidebarRootId:
        SIDEBAR_ROOT_ID,

      sidebarMountId:
        SIDEBAR_MOUNT_ID,

      sidebarNavId:
        SIDEBAR_NAV_ID,

      sidebarMenuId:
        SIDEBAR_MENU_ID,

      sidebarRecentsId:
        SIDEBAR_RECENTS_ID,

      sidebarFooterId:
        SIDEBAR_FOOTER_ID,

      sidebarIndicatorId:
        SIDEBAR_INDICATOR_ID,

      userToggleId:
        USER_TOGGLE_ID,

      userDropdownId:
        USER_DROPDOWN_ID,

      logoutButtonId:
        LOGOUT_BUTTON_ID,

      sidebarAvatarId:
        SIDEBAR_AVATAR_ID,

      sidebarNameId:
        SIDEBAR_NAME_ID,

      logoId:
        SIDEBAR_LOGO_ID,

      desktopToggleId:
        SIDEBAR_TOGGLE_ID,

      mobileToggleId:
        SIDEBAR_MOBILE_TOGGLE_ID,

      mobileToggleRenderedInsideSidebar:
        false,

      avatarImageId:
        SIDEBAR_AVATAR_IMAGE_ID,

      avatarFallbackId:
        SIDEBAR_AVATAR_FALLBACK_ID,

      userPlanId:
        SIDEBAR_USER_PLAN_ID,
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
    },

    dataAttrs:
      {
        ...SIDEBAR_DATA_ATTRS,
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
