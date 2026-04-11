/* =========================================================
   Onion SPA - Sidebar Template
   Archivo: src/ui/sidebar/template.js

   Responsabilidades:
   - generar el HTML base del sidebar
   - centralizar el marcado del módulo
   - consumir constantes del sidebar
   - evitar ids hardcodeados fuera del módulo
   - preparar el sidebar para i18n real
   - evitar literales fijos de idioma en UI crítica
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

function t(key, fallback = "", params = {}) {
  try {
    return I18n.t(key, params, fallback);
  } catch {
    return fallback || key;
  }
}

export function getSidebarTemplate() {
  const labels = {
    sidebarAria: t(
      "sidebar.aria.main",
      "Barra lateral principal"
    ),
    homeLinkAria: t(
      "sidebar.logo.ariaLabel",
      "Ir al inicio"
    ),
    homeTooltip: t(
      "sidebar.logo.tooltip",
      "Inicio"
    ),
    collapseSidebar: t(
      "sidebar.toggle.collapse",
      "Contraer barra lateral"
    ),
    menuAria: t(
      "sidebar.aria.navigation",
      "Navegación principal"
    ),

    home: t("sidebar.menu.home", "Inicio"),
    tickets: t(
      "sidebar.menu.tickets",
      "Incidencias"
    ),
    invoices: t(
      "sidebar.menu.invoices",
      "Facturas"
    ),
    users: t("sidebar.menu.users", "Usuarios"),
    clients: t(
      "sidebar.menu.clients",
      "Clientes"
    ),
    account: t(
      "sidebar.menu.account",
      "Cuenta"
    ),
    settings: t(
      "sidebar.menu.settings",
      "Ajustes"
    ),

    recentsAria: t(
      "sidebar.recents.ariaLabel",
      "Recientes"
    ),
    recentsTitle: t(
      "sidebar.recents.title",
      "Recientes"
    ),

    userMenuToggle: t(
      "sidebar.user.toggleAriaLabel",
      "Abrir menú de usuario"
    ),
    userAvatarAria: t(
      "sidebar.user.avatarAriaLabel",
      "Avatar usuario"
    ),
    userName: t(
      "sidebar.user.defaultName",
      "Usuario"
    ),
    userPlan: t(
      "sidebar.user.plan",
      "Go Plan"
    ),

    userDropdownAria: t(
      "sidebar.user.dropdownAriaLabel",
      "Menú de usuario"
    ),
    addAccount: t(
      "sidebar.user.addAccount",
      "Añadir cuenta"
    ),
    changePlan: t(
      "sidebar.user.changePlan",
      "Cambiar plan"
    ),
    profile: t(
      "sidebar.user.profile",
      "Perfil"
    ),
    configuration: t(
      "sidebar.user.configuration",
      "Configuración"
    ),
    help: t("sidebar.user.help", "Ayuda"),
    logout: t(
      "sidebar.user.logout",
      "Cerrar sesión"
    ),
  };

  return `
    <aside
      class="sidebar"
      id="${SIDEBAR_ROOT_ID}"
      aria-label="${labels.sidebarAria}"
      data-i18n-aria-label="sidebar.aria.main"
    >
      <div class="sidebar-top">
        <a
          href="/"
          data-spa
          class="logo"
          id="homeLink"
          aria-label="${labels.homeLinkAria}"
          data-i18n-aria-label="sidebar.logo.ariaLabel"
          title="${labels.homeTooltip}"
          data-i18n-title="sidebar.logo.tooltip"
          data-tooltip="${labels.homeTooltip}"
        >
          <img
            class="logo-dark"
            draggable="false"
            src="/src/media/img/favicon_white.png"
            alt="Onion Support"
            width="36"
            height="36"
            decoding="async"
          >
          <img
            class="logo-light"
            draggable="false"
            src="/src/media/img/favicon_black.png"
            alt="Onion Support"
            width="36"
            height="36"
            decoding="async"
          >
        </a>

        <button
          type="button"
          class="sidebar-toggle"
          id="toggleSidebar"
          title="${labels.collapseSidebar}"
          data-i18n-title="sidebar.toggle.collapse"
          data-tooltip="${labels.collapseSidebar}"
          aria-label="${labels.collapseSidebar}"
          data-i18n-aria-label="sidebar.toggle.collapse"
          aria-controls="${SIDEBAR_MENU_ID}"
          aria-expanded="true"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
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
        </button>
      </div>

      <nav
        class="sidebar-menu"
        id="${SIDEBAR_MENU_ID}"
        aria-label="${labels.menuAria}"
        data-i18n-aria-label="sidebar.aria.navigation"
      >
        <a
          href="/"
          data-spa
          class="menu-item"
          title="${labels.home}"
          data-i18n-title="sidebar.menu.home"
          data-tooltip="${labels.home}"
          aria-label="${labels.home}"
          data-i18n-aria-label="sidebar.menu.home"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span data-i18n="sidebar.menu.home">${labels.home}</span>
        </a>

        <a
          href="/incidencias"
          data-spa
          class="menu-item"
          title="${labels.tickets}"
          data-i18n-title="sidebar.menu.tickets"
          data-tooltip="${labels.tickets}"
          aria-label="${labels.tickets}"
          data-i18n-aria-label="sidebar.menu.tickets"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
          </span>
          <span data-i18n="sidebar.menu.tickets">${labels.tickets}</span>
        </a>

        <a
          href="/facturas"
          data-spa
          class="menu-item"
          title="${labels.invoices}"
          data-i18n-title="sidebar.menu.invoices"
          data-tooltip="${labels.invoices}"
          aria-label="${labels.invoices}"
          data-i18n-aria-label="sidebar.menu.invoices"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M6 2h9l5 5v15H6z" stroke="currentColor" stroke-width="1.6"/>
              <path d="M14 2v6h6" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>
          <span data-i18n="sidebar.menu.invoices">${labels.invoices}</span>
        </a>

        <a
          href="/usuarios"
          data-spa
          class="menu-item"
          data-role="admin"
          title="${labels.users}"
          data-i18n-title="sidebar.menu.users"
          data-tooltip="${labels.users}"
          aria-label="${labels.users}"
          data-i18n-aria-label="sidebar.menu.users"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>
          <span data-i18n="sidebar.menu.users">${labels.users}</span>
        </a>

        <a
          href="/clientes"
          data-spa
          class="menu-item"
          data-role="admin"
          title="${labels.clients}"
          data-i18n-title="sidebar.menu.clients"
          data-tooltip="${labels.clients}"
          aria-label="${labels.clients}"
          data-i18n-aria-label="sidebar.menu.clients"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="6.5" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
              <circle cx="17.5" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
              <path d="M4 20c0-3.5 3.5-5.5 8-5.5s8 2 8 5.5" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>
          <span data-i18n="sidebar.menu.clients">${labels.clients}</span>
        </a>

        <a
          href="/cuenta"
          data-spa
          class="menu-item"
          title="${labels.account}"
          data-i18n-title="sidebar.menu.account"
          data-tooltip="${labels.account}"
          aria-label="${labels.account}"
          data-i18n-aria-label="sidebar.menu.account"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M5.5 21a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>
          <span data-i18n="sidebar.menu.account">${labels.account}</span>
        </a>

        <a
          href="/ajustes"
          data-spa
          class="menu-item"
          title="${labels.settings}"
          data-i18n-title="sidebar.menu.settings"
          data-tooltip="${labels.settings}"
          aria-label="${labels.settings}"
          data-i18n-aria-label="sidebar.menu.settings"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h10" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="16" cy="6" r="2" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 12h6" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 18h12" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="18" cy="18" r="2" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>
          <span data-i18n="sidebar.menu.settings">${labels.settings}</span>
        </a>
      </nav>

      <section
        class="sidebar-section"
        id="${SIDEBAR_RECENTS_ID}"
        aria-label="${labels.recentsAria}"
        data-i18n-aria-label="sidebar.recents.ariaLabel"
      >
        <span
          class="section-title"
          data-i18n="sidebar.recents.title"
        >${labels.recentsTitle}</span>
      </section>

      <div class="sidebar-footer">
        <div
          class="user"
          id="${USER_TOGGLE_ID}"
          role="button"
          tabindex="0"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-controls="${USER_DROPDOWN_ID}"
          aria-label="${labels.userMenuToggle}"
          data-i18n-aria-label="sidebar.user.toggleAriaLabel"
        >
          <div
            class="avatar"
            id="${SIDEBAR_AVATAR_ID}"
            aria-label="${labels.userAvatarAria}"
            data-i18n-aria-label="sidebar.user.avatarAriaLabel"
          >
            ON
          </div>

          <div class="user-info">
            <span
              class="name"
              id="${SIDEBAR_NAME_ID}"
              data-i18n="sidebar.user.defaultName"
            >${labels.userName}</span>

            <span
              class="plan"
              data-i18n="sidebar.user.plan"
            >${labels.userPlan}</span>
          </div>

          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
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
        </div>

        <div
          class="user-dropdown"
          id="${USER_DROPDOWN_ID}"
          role="menu"
          aria-label="${labels.userDropdownAria}"
          data-i18n-aria-label="sidebar.user.dropdownAriaLabel"
          aria-hidden="true"
          hidden
        >
          <button type="button" class="dropdown-item" role="menuitem" tabindex="-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6"/>
            </svg>
            <span data-i18n="sidebar.user.addAccount">${labels.addAccount}</span>
          </button>

          <div class="dropdown-divider" role="separator"></div>

          <button type="button" class="dropdown-item" role="menuitem" tabindex="-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 4v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M8 8l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 20h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <span data-i18n="sidebar.user.changePlan">${labels.changePlan}</span>
          </button>

          <button type="button" class="dropdown-item" role="menuitem" tabindex="-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6" fill="none"/>
            </svg>
            <span data-i18n="sidebar.user.profile">${labels.profile}</span>
          </button>

          <button type="button" class="dropdown-item" role="menuitem" tabindex="-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12h16" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/>
            </svg>
            <span data-i18n="sidebar.user.configuration">${labels.configuration}</span>
          </button>

          <div class="dropdown-divider" role="separator"></div>

          <button type="button" class="dropdown-item" role="menuitem" tabindex="-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
              <path d="M12 16v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              <circle cx="12" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span data-i18n="sidebar.user.help">${labels.help}</span>
          </button>

          <button
            type="button"
            class="dropdown-item dropdown-item-danger"
            id="${LOGOUT_BUTTON_ID}"
            role="menuitem"
            tabindex="-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 4h5v16H4z" stroke="currentColor" stroke-width="1.6"/>
            </svg>
            <span data-i18n="sidebar.user.logout">${labels.logout}</span>
          </button>
        </div>
      </div>
    </aside>
  `;
}
