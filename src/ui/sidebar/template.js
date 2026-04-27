/* =========================================================
   Onion SPA - Sidebar Template
   Archivo: src/ui/sidebar/template.js

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
   - incluir data-sidebar-action para fallback delegado
   - incluir data-route para navegación robusta
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
   I18N
========================================================= */

function t(key, fallback = "", params = {}) {
  try {
    return I18n.t(key, params, fallback);
  } catch {
    return fallback || key;
  }
}

/* =========================================================
   SAFE HTML
========================================================= */

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* =========================================================
   MENU ITEM
========================================================= */

function renderMenuItem({
  href = "/",
  label = "",
  i18nKey = "",
  icon = "",
  extraAttrs = "",
} = {}) {
  const cleanHref = escapeHtml(href);
  const cleanLabel = escapeHtml(label);
  const cleanI18nKey = escapeHtml(i18nKey);

  return `
        <a
          href="${cleanHref}"
          data-spa
          data-route="${cleanHref}"
          data-sidebar-nav="true"
          class="menu-item"
          data-tooltip="${cleanLabel}"
          ${
            i18nKey
              ? `data-i18n-data-tooltip="${cleanI18nKey}"`
              : ""
          }
          aria-label="${cleanLabel}"
          ${
            i18nKey
              ? `data-i18n-aria-label="${cleanI18nKey}"`
              : ""
          }
          ${extraAttrs}
        >
          <span
            class="menu-item-icon"
            aria-hidden="true"
          >
            ${icon}
          </span>

          <span
            class="menu-item-label"
            ${
              i18nKey
                ? `data-i18n="${cleanI18nKey}"`
                : ""
            }
          >${cleanLabel}</span>
        </a>`;
}

/* =========================================================
   TEMPLATE
========================================================= */

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

    logoAlt: t(
      "sidebar.logo.alt",
      "Onion Support"
    ),

    collapseSidebar: t(
      "sidebar.toggle.collapse",
      "Contraer barra lateral"
    ),

    expandSidebar: t(
      "sidebar.toggle.expand",
      "Expandir barra lateral"
    ),

    openSidebar: t(
      "sidebar.toggle.open",
      "Abrir navegación"
    ),

    closeSidebar: t(
      "sidebar.toggle.close",
      "Cerrar navegación"
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

    server: t(
      "sidebar.menu.server",
      "Servidor"
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
      data-sidebar-root="true"
      data-open="true"
      data-collapsed="false"
      data-mode="desktop"
    >
      <div class="sidebar-top">
        <a
          href="/"
          data-spa
          data-route="/"
          class="logo"
          id="homeLink"
          aria-label="${escapeHtml(labels.logoLink)}"
          data-i18n-aria-label="sidebar.logo.ariaLabel"
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
          data-sidebar-action="toggle-sidebar"
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

        <button
          type="button"
          class="sidebar-mobile-toggle"
          id="toggleSidebarMobile"
          data-sidebar-action="mobile-sidebar-toggle"
          data-tooltip="${escapeHtml(labels.openSidebar)}"
          data-i18n-data-tooltip="sidebar.toggle.open"
          aria-label="${escapeHtml(labels.openSidebar)}"
          data-i18n-aria-label="sidebar.toggle.open"
          aria-controls="${SIDEBAR_MENU_ID}"
          aria-expanded="false"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
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
        </button>
      </div>

      <nav
        class="sidebar-menu"
        id="${SIDEBAR_MENU_ID}"
        aria-label="${escapeHtml(labels.navAria)}"
        data-i18n-aria-label="sidebar.aria.navigation"
      >
${renderMenuItem({
  href: "/",
  label: labels.home,
  i18nKey: "sidebar.menu.home",
  icon: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
            </svg>
  `,
})}

${renderMenuItem({
  href: "/incidencias",
  label: labels.tickets,
  i18nKey: "sidebar.menu.tickets",
  icon: `
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
  `,
})}

${renderMenuItem({
  href: "/facturas",
  label: labels.invoices,
  i18nKey: "sidebar.menu.invoices",
  icon: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M6 2h9l5 5v15H6z" stroke="currentColor" stroke-width="1.6"/>
              <path d="M14 2v6h6" stroke="currentColor" stroke-width="1.6"/>
            </svg>
  `,
})}

${renderMenuItem({
  href: "/usuarios",
  label: labels.users,
  i18nKey: "sidebar.menu.users",
  extraAttrs: `
          data-role="admin"
          data-admin-only="true"
          data-sidebar-visible="true"
        `,
  icon: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6"/>
            </svg>
  `,
})}

${renderMenuItem({
  href: "/clientes",
  label: labels.clients,
  i18nKey: "sidebar.menu.clients",
  extraAttrs: `
          data-role="admin"
          data-admin-only="true"
          data-sidebar-visible="true"
        `,
  icon: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="6.5" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
              <circle cx="17.5" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
              <path d="M4 20c0-3.5 3.5-5.5 8-5.5s8 2 8 5.5" stroke="currentColor" stroke-width="1.6"/>
            </svg>
  `,
})}

${renderMenuItem({
  href: "/cuenta",
  label: labels.account,
  i18nKey: "sidebar.menu.account",
  icon: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M5.5 21a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.6"/>
            </svg>
  `,
})}

${renderMenuItem({
  href: "/ajustes",
  label: labels.settings,
  i18nKey: "sidebar.menu.settings",
  icon: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h10" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="16" cy="6" r="2" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 12h6" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 18h12" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="18" cy="18" r="2" stroke="currentColor" stroke-width="1.6"/>
            </svg>
  `,
})}

${renderMenuItem({
  href: "/servidor",
  label: labels.server,
  i18nKey: "sidebar.menu.server",
  extraAttrs: `
          data-role="admin"
          data-admin-only="true"
          data-sidebar-visible="true"
        `,
  icon: `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
})}
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
          data-sidebar-action="toggle-user-dropdown"
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
            data-default-avatar="ON"
            data-avatar-root="true"
          >
            <img
              class="avatar-image"
              id="sidebarAvatarImage"
              src=""
              alt="${escapeHtml(labels.userDefaultName)}"
              draggable="false"
              decoding="async"
              hidden
            >

            <span
              class="avatar-fallback"
              id="sidebarAvatarFallback"
              aria-hidden="true"
            >
              ON
            </span>
          </div>

          <div class="user-info">
            <span
              class="name"
              id="${SIDEBAR_NAME_ID}"
              data-default-i18n="sidebar.user.defaultName"
              data-default-name="${escapeHtml(labels.userDefaultName)}"
            >${escapeHtml(labels.userDefaultName)}</span>

            <span
              class="plan"
              id="sidebarUserPlan"
              data-static="true"
            >Go Plan</span>
          </div>

          <svg
            class="user-chevron"
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
            data-sidebar-action="add-account"
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
            data-sidebar-action="change-plan"
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
            data-sidebar-action="profile"
            data-route="/cuenta"
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
            data-sidebar-action="settings"
            data-route="/ajustes"
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
            data-sidebar-action="help"
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
            data-sidebar-action="logout"
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
