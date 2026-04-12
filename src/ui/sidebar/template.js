/* =========================================================
   Onion SPA - Sidebar Template
   Archivo: src/ui/sidebar/template.js

   Responsabilidades:
   - generar el HTML base del sidebar
   - centralizar el marcado del módulo
   - consumir constantes del sidebar
   - evitar ids hardcodeados fuera del módulo
   - preparado para i18n real
   - tooltips custom con refresh live
   - evitar tooltips nativos del navegador
   - accesibilidad consistente
   - separar textos estáticos i18n de valores dinámicos de sesión
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

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getSidebarTemplate() {
  const labels = {
    sidebarAria: t(
      "sidebar.aria.main",
      "Barra lateral principal"
    ),

    navAria: t(
      "sidebar.aria.navigation",
      "Navegación principal"
    ),

    logoLink: t(
      "sidebar.logo.ariaLabel",
      "Ir al inicio"
    ),

    logoTooltip: t(
      "sidebar.logo.tooltip",
      "Inicio"
    ),

    logoAlt: t(
      "sidebar.logo.alt",
      "Onion Support"
    ),

    collapseSidebar: t(
      "sidebar.toggle.collapse",
      "Contraer barra lateral"
    ),

    home: t(
      "sidebar.menu.home",
      "Inicio"
    ),

    tickets: t(
      "sidebar.menu.tickets",
      "Incidencias"
    ),

    invoices: t(
      "sidebar.menu.invoices",
      "Facturas"
    ),

    users: t(
      "sidebar.menu.users",
      "Usuarios"
    ),

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

    userToggle: t(
      "sidebar.user.toggleAriaLabel",
      "Abrir menú de usuario"
    ),

    userAvatar: t(
      "sidebar.user.avatarAriaLabel",
      "Avatar usuario"
    ),

    userDefaultName: t(
      "sidebar.user.defaultName",
      "Usuario"
    ),

    userMenu: t(
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

    userSettings: t(
      "sidebar.user.settings",
      "Configuración"
    ),

    help: t(
      "sidebar.user.help",
      "Ayuda"
    ),

    logout: t(
      "sidebar.user.logout",
      "Cerrar sesión"
    ),
  };

  return `
    <aside
      class="sidebar"
      id="${SIDEBAR_ROOT_ID}"
      aria-label="${escapeHtml(labels.sidebarAria)}"
      data-i18n-aria-label="sidebar.aria.main"
    >
      <div class="sidebar-top">
        <a
          href="/"
          data-spa
          class="logo"
          id="homeLink"
          aria-label="${escapeHtml(labels.logoLink)}"
          data-i18n-aria-label="sidebar.logo.ariaLabel"
          data-tooltip="${escapeHtml(labels.logoTooltip)}"
          data-i18n-data-tooltip="sidebar.logo.tooltip"
        >
          <img
            class="logo-dark"
            draggable="false"
            src="/src/media/img/favicon_white.png"
            alt="${escapeHtml(labels.logoAlt)}"
            data-i18n-alt="sidebar.logo.alt"
            width="36"
            height="36"
            decoding="async"
          >

          <img
            class="logo-light"
            draggable="false"
            src="/src/media/img/favicon_black.png"
            alt="${escapeHtml(labels.logoAlt)}"
            data-i18n-alt="sidebar.logo.alt"
            width="36"
            height="36"
            decoding="async"
          >
        </a>

        <button
          type="button"
          class="sidebar-toggle"
          id="toggleSidebar"
          data-tooltip="${escapeHtml(labels.collapseSidebar)}"
          data-i18n-data-tooltip="sidebar.toggle.collapse"
          aria-label="${escapeHtml(labels.collapseSidebar)}"
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
        aria-label="${escapeHtml(labels.navAria)}"
        data-i18n-aria-label="sidebar.aria.navigation"
      >
        <a
          href="/"
          data-spa
          class="menu-item"
          data-tooltip="${escapeHtml(labels.home)}"
          data-i18n-data-tooltip="sidebar.menu.home"
          aria-label="${escapeHtml(labels.home)}"
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

          <span data-i18n="sidebar.menu.home">${escapeHtml(labels.home)}</span>
        </a>

        <a
          href="/incidencias"
          data-spa
          class="menu-item"
          data-tooltip="${escapeHtml(labels.tickets)}"
          data-i18n-data-tooltip="sidebar.menu.tickets"
          aria-label="${escapeHtml(labels.tickets)}"
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

          <span data-i18n="sidebar.menu.tickets">${escapeHtml(labels.tickets)}</span>
        </a>

        <a
          href="/facturas"
          data-spa
          class="menu-item"
          data-tooltip="${escapeHtml(labels.invoices)}"
          data-i18n-data-tooltip="sidebar.menu.invoices"
          aria-label="${escapeHtml(labels.invoices)}"
          data-i18n-aria-label="sidebar.menu.invoices"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M6 2h9l5 5v15H6z" stroke="currentColor" stroke-width="1.6"/>
              <path d="M14 2v6h6" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>

          <span data-i18n="sidebar.menu.invoices">${escapeHtml(labels.invoices)}</span>
        </a>

        <a
          href="/usuarios"
          data-spa
          class="menu-item"
          data-role="admin"
          data-tooltip="${escapeHtml(labels.users)}"
          data-i18n-data-tooltip="sidebar.menu.users"
          aria-label="${escapeHtml(labels.users)}"
          data-i18n-aria-label="sidebar.menu.users"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>

          <span data-i18n="sidebar.menu.users">${escapeHtml(labels.users)}</span>
        </a>

        <a
          href="/clientes"
          data-spa
          class="menu-item"
          data-role="admin"
          data-tooltip="${escapeHtml(labels.clients)}"
          data-i18n-data-tooltip="sidebar.menu.clients"
          aria-label="${escapeHtml(labels.clients)}"
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

          <span data-i18n="sidebar.menu.clients">${escapeHtml(labels.clients)}</span>
        </a>

        <a
          href="/cuenta"
          data-spa
          class="menu-item"
          data-tooltip="${escapeHtml(labels.account)}"
          data-i18n-data-tooltip="sidebar.menu.account"
          aria-label="${escapeHtml(labels.account)}"
          data-i18n-aria-label="sidebar.menu.account"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M5.5 21a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>

          <span data-i18n="sidebar.menu.account">${escapeHtml(labels.account)}</span>
        </a>

        <a
          href="/ajustes"
          data-spa
          class="menu-item"
          data-tooltip="${escapeHtml(labels.settings)}"
          data-i18n-data-tooltip="sidebar.menu.settings"
          aria-label="${escapeHtml(labels.settings)}"
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

          <span data-i18n="sidebar.menu.settings">${escapeHtml(labels.settings)}</span>
        </a>
      </nav>

      <section
        class="sidebar-section"
        id="${SIDEBAR_RECENTS_ID}"
        aria-label="${escapeHtml(labels.recentsAria)}"
        data-i18n-aria-label="sidebar.recents.ariaLabel"
      >
        <span
          class="section-title"
          data-i18n="sidebar.recents.title"
        >${escapeHtml(labels.recentsTitle)}</span>
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
          aria-label="${escapeHtml(labels.userToggle)}"
          data-i18n-aria-label="sidebar.user.toggleAriaLabel"
        >
          <div
            class="avatar"
            id="${SIDEBAR_AVATAR_ID}"
            aria-label="${escapeHtml(labels.userAvatar)}"
            data-i18n-aria-label="sidebar.user.avatarAriaLabel"
          >
            ON
          </div>

          <div class="user-info">
            <span
              class="name"
              id="${SIDEBAR_NAME_ID}"
              data-default-i18n="${escapeHtml(labels.userDefaultName)}"
            >${escapeHtml(labels.userDefaultName)}</span>

            <span
              class="plan"
              id="sidebarUserPlan"
            >Go Plan</span>
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
          aria-label="${escapeHtml(labels.userMenu)}"
          data-i18n-aria-label="sidebar.user.dropdownAriaLabel"
          aria-hidden="true"
          hidden
        >
          <button
            type="button"
            class="dropdown-item"
            role="menuitem"
            tabindex="-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6"/>
            </svg>
            <span data-i18n="sidebar.user.addAccount">${escapeHtml(labels.addAccount)}</span>
          </button>

          <div class="dropdown-divider" role="separator"></div>

          <button
            type="button"
            class="dropdown-item"
            role="menuitem"
            tabindex="-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 4v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M8 8l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 20h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <span data-i18n="sidebar.user.changePlan">${escapeHtml(labels.changePlan)}</span>
          </button>

          <button
            type="button"
            class="dropdown-item"
            role="menuitem"
            tabindex="-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6" fill="none"/>
            </svg>
            <span data-i18n="sidebar.user.profile">${escapeHtml(labels.profile)}</span>
          </button>

          <button
            type="button"
            class="dropdown-item"
            role="menuitem"
            tabindex="-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12h16" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/>
            </svg>
            <span data-i18n="sidebar.user.settings">${escapeHtml(labels.userSettings)}</span>
          </button>

          <div class="dropdown-divider" role="separator"></div>

          <button
            type="button"
            class="dropdown-item"
            role="menuitem"
            tabindex="-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
              <path d="M12 16v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              <circle cx="12" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span data-i18n="sidebar.user.help">${escapeHtml(labels.help)}</span>
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
            <span data-i18n="sidebar.user.logout">${escapeHtml(labels.logout)}</span>
          </button>
        </div>
      </div>
    </aside>
  `;
}
