/* =========================================================
   Onion SPA - Sidebar Template
   Archivo: src/ui/sidebar/template.js

   Responsabilidades:
   - generar el HTML base del sidebar
   - centralizar el marcado del módulo
   - consumir constantes del sidebar
   - evitar ids hardcodeados fuera del módulo
========================================================= */

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

export function getSidebarTemplate() {
  return `
    <aside
      class="sidebar"
      id="${SIDEBAR_ROOT_ID}"
      aria-label="Barra lateral principal"
    >
      <div class="sidebar-top">
        <a
          href="/"
          data-spa
          class="logo"
          id="homeLink"
          aria-label="Ir al inicio"
          data-tooltip="Inicio"
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
          data-tooltip="Contraer barra lateral"
          aria-label="Contraer barra lateral"
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
        aria-label="Navegación principal"
      >
        <a
          href="/"
          data-spa
          class="menu-item"
          data-tooltip="Inicio"
          aria-label="Inicio"
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
          <span data-i18n="Inicio">Inicio</span>
        </a>

        <a
          href="/incidencias"
          data-spa
          class="menu-item"
          data-tooltip="Incidencias"
          aria-label="Incidencias"
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
          <span data-i18n="Incidencias">Incidencias</span>
        </a>

        <a
          href="/facturas"
          data-spa
          class="menu-item"
          data-tooltip="Facturas"
          aria-label="Facturas"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M6 2h9l5 5v15H6z" stroke="currentColor" stroke-width="1.6"/>
              <path d="M14 2v6h6" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>
          <span data-i18n="Facturas">Facturas</span>
        </a>

        <a
          href="/usuarios"
          data-spa
          class="menu-item"
          data-tooltip="Usuarios"
          data-role="admin"
          aria-label="Usuarios"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>
          <span data-i18n="Usuarios">Usuarios</span>
        </a>

        <a
          href="/clientes"
          data-spa
          class="menu-item"
          data-tooltip="Clientes"
          data-role="admin"
          aria-label="Clientes"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="3.2" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="6.5" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
              <circle cx="17.5" cy="10" r="2.5" stroke="currentColor" stroke-width="1.4" opacity="0.6"/>
              <path d="M4 20c0-3.5 3.5-5.5 8-5.5s8 2 8 5.5" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>
          <span data-i18n="Clientes">Clientes</span>
        </a>

        <a
          href="/cuenta"
          data-spa
          class="menu-item"
          data-tooltip="Cuenta"
          aria-label="Cuenta"
        >
          <span aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M5.5 21a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </span>
          <span data-i18n="Cuenta">Cuenta</span>
        </a>

        <a
          href="/ajustes"
          data-spa
          class="menu-item"
          data-tooltip="Ajustes"
          aria-label="Ajustes"
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
          <span data-i18n="Ajustes">Ajustes</span>
        </a>
      </nav>

      <section
        class="sidebar-section"
        id="${SIDEBAR_RECENTS_ID}"
        aria-label="Recientes"
      >
        <span class="section-title">Recientes</span>
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
          aria-label="Abrir menú de usuario"
        >
          <div
            class="avatar"
            id="${SIDEBAR_AVATAR_ID}"
            aria-label="Avatar usuario"
          >
            ON
          </div>

          <div class="user-info">
            <span class="name" id="${SIDEBAR_NAME_ID}">Usuario</span>
            <span class="plan">Go Plan</span>
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
          aria-label="Menú de usuario"
          aria-hidden="true"
          hidden
        >
          <button type="button" class="dropdown-item" role="menuitem" tabindex="-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6"/>
            </svg>
            <span>Añadir cuenta</span>
          </button>

          <div class="dropdown-divider" role="separator"></div>

          <button type="button" class="dropdown-item" role="menuitem" tabindex="-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 4v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M8 8l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5 20h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            <span>Cambiar plan</span>
          </button>

          <button type="button" class="dropdown-item" role="menuitem" tabindex="-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" stroke-width="1.6" fill="none"/>
            </svg>
            <span>Perfil</span>
          </button>

          <button type="button" class="dropdown-item" role="menuitem" tabindex="-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12h16" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/>
            </svg>
            <span>Configuración</span>
          </button>

          <div class="dropdown-divider" role="separator"></div>

          <button type="button" class="dropdown-item" role="menuitem" tabindex="-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/>
              <path d="M12 16v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              <circle cx="12" cy="8" r="1" fill="currentColor"/>
            </svg>
            <span>Ayuda</span>
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
            <span>Cerrar sesión</span>
          </button>
        </div>
      </div>
    </aside>
  `;
}
