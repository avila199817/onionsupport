/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar.js

   Responsabilidades:
   - montar el HTML del sidebar desde JS
   - toggle sidebar desktop / mobile
   - persistencia collapsed/expanded
   - dropdown de usuario robusto
   - render de usuario
   - pintar avatar real si existe
   - fallback a iniciales si no hay avatar o falla la imagen
   - visibilidad por rol
   - cierre inteligente en navegación
   - abrir sidebar automáticamente al hacer click en user dropdown
     si el sidebar está cerrado
   - logout robusto aunque falle el endpoint remoto
   - evitar warnings de aria-hidden al cerrar dropdown
   - init seguro una sola vez
   - sincronización robusta con AppCore
   - inyectar acceso admin a estado del servidor
   - soporte limpio para tooltips CSS vía data-tooltip
========================================================= */

import { AppCore } from "../core/core.js";
import { Auth } from "../features/auth.js";
import { Router } from "../router/router.js";

export const SidebarUI = (() => {
  "use strict";

  const SCOPE = "ui:sidebar";
  const MOBILE_BREAKPOINT = 900;
  const SERVER_NAV_ID = "sidebar-server-link";
  const SERVER_ROUTE = "/servidor";
  const SIDEBAR_ROOT_ID = "sidebar";
  const SIDEBAR_MENU_ID = "sidebar-menu";

  let initialized = false;
  let resizeHandler = null;
  let logoutInFlight = false;

  const state = {
    dropdownOpen: false,
  };

  /* =========================================================
     TEMPLATE
  ========================================================= */
  function getSidebarTemplate() {
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
          id="sidebar-recents"
          aria-label="Recientes"
        >
          <span class="section-title">Recientes</span>
        </section>

        <div class="sidebar-footer">
          <div
            class="user"
            id="userToggle"
            role="button"
            tabindex="0"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-controls="userDropdown"
            aria-label="Abrir menú de usuario"
          >
            <div
              class="avatar"
              id="sidebar-avatar"
              aria-label="Avatar usuario"
            >
              ON
            </div>

            <div class="user-info">
              <span class="name" id="sidebar-name">Usuario</span>
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
            id="userDropdown"
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
              id="logoutBtn"
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

  function getMainContentEl() {
    return (
      AppCore.dom.mainContent ||
      document.getElementById("main-content") ||
      document.querySelector(".main-content")
    );
  }

  function getAppShellEl() {
    return (
      AppCore.dom.appShell ||
      document.getElementById("app-shell") ||
      document.querySelector(".layout")
    );
  }

  function mountSidebar() {
    let sidebar = document.getElementById(SIDEBAR_ROOT_ID);
    if (sidebar) return sidebar;

    const mainContent = getMainContentEl();
    const appShell = getAppShellEl();

    if (mainContent && mainContent.parentElement) {
      mainContent.insertAdjacentHTML("beforebegin", getSidebarTemplate());
    } else if (appShell) {
      appShell.insertAdjacentHTML("afterbegin", getSidebarTemplate());
    } else if (document.body) {
      document.body.insertAdjacentHTML("afterbegin", getSidebarTemplate());
    }

    sidebar = document.getElementById(SIDEBAR_ROOT_ID);
    return sidebar || null;
  }

  function cacheDomRefs() {
    const sidebar = document.getElementById(SIDEBAR_ROOT_ID);
    const sidebarMenu = document.getElementById(SIDEBAR_MENU_ID);
    const sidebarRecents = document.getElementById("sidebar-recents");
    const sidebarToggle = document.getElementById("toggleSidebar");
    const mobileToggleBtn = document.getElementById("toggleSidebarMobile");
    const userToggle = document.getElementById("userToggle");
    const userDropdown = document.getElementById("userDropdown");
    const logoutBtn = document.getElementById("logoutBtn");
    const avatarEl = document.getElementById("sidebar-avatar");
    const nameEl = document.getElementById("sidebar-name");
    const body = document.body;

    AppCore.dom.body = body;
    AppCore.dom.sidebar = sidebar;
    AppCore.dom.sidebarMenu = sidebarMenu;
    AppCore.dom.sidebarRecents = sidebarRecents;
    AppCore.dom.sidebarToggle = sidebarToggle;
    AppCore.dom.mobileSidebarToggle = mobileToggleBtn;
    AppCore.dom.userToggle = userToggle;
    AppCore.dom.userDropdown = userDropdown;
    AppCore.dom.logoutBtn = logoutBtn;
    AppCore.dom.sidebarAvatar = avatarEl;
    AppCore.dom.sidebarName = nameEl;
  }

  /* =========================================================
     ELEMENTS
  ========================================================= */
  function getElements() {
    return {
      body: AppCore.dom.body || document.body,

      sidebar:
        AppCore.dom.sidebar ||
        document.getElementById(SIDEBAR_ROOT_ID) ||
        document.querySelector(".sidebar"),

      sidebarMenu:
        AppCore.dom.sidebarMenu ||
        document.getElementById(SIDEBAR_MENU_ID) ||
        document.querySelector(".sidebar-menu"),

      toggleBtn:
        AppCore.dom.sidebarToggle ||
        document.getElementById("toggleSidebar"),

      mobileToggleBtn:
        AppCore.dom.mobileSidebarToggle ||
        document.getElementById("toggleSidebarMobile"),

      userToggle:
        AppCore.dom.userToggle ||
        document.getElementById("userToggle"),

      userDropdown:
        AppCore.dom.userDropdown ||
        document.getElementById("userDropdown"),

      logoutBtn:
        AppCore.dom.logoutBtn ||
        document.getElementById("logoutBtn"),

      avatarEl:
        AppCore.dom.sidebarAvatar ||
        document.getElementById("sidebar-avatar"),

      nameEl:
        AppCore.dom.sidebarName ||
        document.getElementById("sidebar-name"),
    };
  }

  function hasSidebarShell() {
    const { sidebar } = getElements();
    return Boolean(sidebar);
  }

  function isShellHidden() {
    return Boolean(
      document.body?.classList.contains("route-shell-hidden") ||
      AppCore.dom.body?.classList.contains("route-shell-hidden")
    );
  }

  function blurIfInside(element) {
    try {
      const activeEl = document.activeElement;
      if (element && activeEl && element.contains(activeEl)) {
        activeEl.blur?.();
      }
    } catch {
      /* noop */
    }
  }

  function sanitizeFooterTooltipState() {
    const { sidebar, userToggle, userDropdown, avatarEl, nameEl } = getElements();
    if (!sidebar) return;

    [userToggle, userDropdown, avatarEl, nameEl].forEach((element) => {
      if (!element) return;
      element.removeAttribute("data-tooltip");
      element.removeAttribute("title");
    });

    sidebar
      .querySelectorAll(
        ".sidebar-footer [data-tooltip], .sidebar-footer [title]"
      )
      .forEach((element) => {
        element.removeAttribute("data-tooltip");
        element.removeAttribute("title");
      });
  }

  /* =========================================================
     USER HELPERS
  ========================================================= */
  function getUser() {
    return AppCore.state.user || null;
  }

  function getDisplayName(user = null) {
    const currentUser = user || getUser();

    return (
      currentUser?.name ||
      currentUser?.nombre ||
      currentUser?.username ||
      currentUser?.email ||
      "Usuario"
    );
  }

  function getUsername(user = null) {
    const currentUser = user || getUser();

    if (typeof AppCore.getUserUsername === "function") {
      return AppCore.getUserUsername(currentUser);
    }

    if (typeof AppCore.utils?.getUserUsername === "function") {
      return AppCore.utils.getUserUsername(currentUser);
    }

    return String(currentUser?.username || "")
      .trim()
      .toLowerCase();
  }

  function getAvatarText(user = null) {
    const currentUser = user || getUser();
    const displayName = getDisplayName(currentUser);
    const username = getUsername(currentUser);

    const initials = String(displayName || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2);

    return initials || (username ? username.slice(0, 2).toUpperCase() : "ON");
  }

  function getAvatarUrl(user = null) {
    const currentUser = user || getUser();

    return String(
      currentUser?.avatar ||
      currentUser?.avatarUrl ||
      currentUser?.photo ||
      currentUser?.image ||
      currentUser?.profileImage ||
      currentUser?.picture ||
      ""
    ).trim();
  }

  function isAdmin(user = null) {
    const currentUser = user || getUser();
    const role =
      currentUser?.role ||
      AppCore.state.role ||
      "";

    return String(role).trim().toLowerCase() === "admin";
  }

  /* =========================================================
     RESPONSIVE
  ========================================================= */
  function isMobileViewport() {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  }

  /* =========================================================
     SIDEBAR STATE
  ========================================================= */
  function getSavedSidebarCollapsed() {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  }

  function saveSidebarCollapsed(value) {
    try {
      localStorage.setItem("sidebar-collapsed", String(Boolean(value)));
    } catch {
      /* noop */
    }
  }

  function getDesiredSidebarOpenState() {
    return Boolean(AppCore.state.sidebarOpen);
  }

  function isSidebarCollapsedDesktop() {
    const { sidebar } = getElements();
    if (!sidebar) return false;
    if (isMobileViewport()) return false;

    return (
      sidebar.classList.contains("collapsed") ||
      sidebar.classList.contains("is-collapsed")
    );
  }

  function syncTooltipMode(isOpen = null) {
    const { sidebar, body } = getElements();
    if (!sidebar || !body) return;

    const open =
      typeof isOpen === "boolean"
        ? isOpen
        : !isSidebarCollapsedDesktop();

    const enableCssTooltipMode =
      !isMobileViewport() &&
      !open &&
      !isShellHidden();

    sidebar.classList.toggle("sidebar-tooltips-active", enableCssTooltipMode);
    body.classList.toggle("sidebar-tooltips-active", enableCssTooltipMode);

    sanitizeFooterTooltipState();
  }

  function updateToggleLabel(isOpen = null) {
    const { toggleBtn, mobileToggleBtn, sidebar } = getElements();
    if (!sidebar) return;

    const open =
      typeof isOpen === "boolean"
        ? isOpen
        : (
            !sidebar.classList.contains("collapsed") &&
            !sidebar.classList.contains("is-collapsed")
          );

    const desktopText = open
      ? "Contraer barra lateral"
      : "Expandir barra lateral";

    const mobileText = open
      ? "Cerrar navegación"
      : "Abrir navegación";

    if (toggleBtn) {
      toggleBtn.dataset.tooltip = desktopText;
      toggleBtn.setAttribute("aria-label", desktopText);
      toggleBtn.setAttribute("aria-expanded", String(open));
      toggleBtn.classList.toggle("is-active", open);
      toggleBtn.removeAttribute("title");
    }

    if (mobileToggleBtn) {
      mobileToggleBtn.setAttribute("aria-label", mobileText);
      mobileToggleBtn.setAttribute("aria-expanded", String(open));
      mobileToggleBtn.classList.toggle("is-active", open);
      mobileToggleBtn.removeAttribute("title");
    }

    syncTooltipMode(open);
  }

  function syncSidebarState() {
    const { sidebar, body } = getElements();
    if (!sidebar) return;

    if (isShellHidden()) {
      sidebar.hidden = true;
      sidebar.classList.remove("open", "is-open", "collapsed", "is-collapsed");
      body?.classList.remove("sidebar-open", "sidebar-collapsed");
      syncTooltipMode(true);
      closeDropdown();
      updateToggleLabel(false);
      return;
    }

    sidebar.hidden = false;

    const mobile = isMobileViewport();
    const isOpen = getDesiredSidebarOpenState();

    if (mobile) {
      sidebar.classList.toggle("open", isOpen);
      sidebar.classList.toggle("is-open", isOpen);
      sidebar.classList.remove("collapsed", "is-collapsed");

      body?.classList.toggle("sidebar-open", isOpen);
      body?.classList.remove("sidebar-collapsed");
    } else {
      sidebar.classList.toggle("collapsed", !isOpen);
      sidebar.classList.toggle("is-collapsed", !isOpen);
      sidebar.classList.remove("open", "is-open");

      body?.classList.toggle("sidebar-collapsed", !isOpen);
      body?.classList.remove("sidebar-open");
    }

    updateToggleLabel(isOpen);

    AppCore.events.emit("sidebar:state:synced", {
      open: isOpen,
      mobile,
    });
  }

  function setSidebarOpen(open) {
    const nextOpen = Boolean(open);
    const mobile = isMobileViewport();

    AppCore.state.sidebarOpen = nextOpen;

    if (!mobile) {
      saveSidebarCollapsed(!nextOpen);
    }

    syncSidebarState();
  }

  function openSidebar() {
    if (isShellHidden()) return;
    setSidebarOpen(true);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function toggleSidebar() {
    if (isShellHidden()) return;

    const currentOpen = getDesiredSidebarOpenState();
    const nextOpen = !currentOpen;

    setSidebarOpen(nextOpen);

    if (!nextOpen) {
      closeDropdown();
    }
  }

  function ensureSidebarOpenForUserMenu() {
    if (isShellHidden()) return false;

    const { sidebar } = getElements();
    if (!sidebar) return false;

    const mobile = isMobileViewport();
    const isCollapsedDesktop =
      !mobile &&
      (
        sidebar.classList.contains("collapsed") ||
        sidebar.classList.contains("is-collapsed")
      );

    const isClosedMobile =
      mobile &&
      !sidebar.classList.contains("open") &&
      !sidebar.classList.contains("is-open");

    if (isCollapsedDesktop || isClosedMobile) {
      openSidebar();
      return true;
    }

    return false;
  }

  function closeSidebarOnMobileAfterNavigation() {
    if (isMobileViewport()) {
      closeSidebar();
    }
  }

  /* =========================================================
     SERVER NAV ITEM
  ========================================================= */
  function getServerNavMarkup() {
    return `
      <a
        href="${SERVER_ROUTE}"
        data-spa
        class="menu-item"
        id="${SERVER_NAV_ID}"
        data-tooltip="Estado del servidor"
        data-role="admin"
        aria-label="Estado del servidor"
      >
        <span aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="4" width="16" height="6" rx="2" stroke="currentColor" stroke-width="1.6"/>
            <rect x="4" y="14" width="16" height="6" rx="2" stroke="currentColor" stroke-width="1.6"/>
            <circle cx="8" cy="7" r="1" fill="currentColor"/>
            <circle cx="8" cy="17" r="1" fill="currentColor"/>
            <path d="M12 7h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M12 17h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </span>
        <span data-i18n="Servidor">Servidor</span>
      </a>
    `;
  }

  function ensureServerNavItem() {
    const { sidebarMenu } = getElements();
    if (!sidebarMenu) return null;

    let serverLink = document.getElementById(SERVER_NAV_ID);

    if (serverLink) {
      serverLink.hidden = !isAdmin();
      serverLink.setAttribute("aria-hidden", String(!isAdmin()));
      serverLink.style.display = isAdmin() ? "" : "none";
      serverLink.removeAttribute("title");
      return serverLink;
    }

    const facturasLink = sidebarMenu.querySelector('a[href="/facturas"]');
    const usuariosLink = sidebarMenu.querySelector('a[href="/usuarios"]');

    if (usuariosLink) {
      usuariosLink.insertAdjacentHTML("beforebegin", getServerNavMarkup());
    } else if (facturasLink) {
      facturasLink.insertAdjacentHTML("afterend", getServerNavMarkup());
    } else {
      sidebarMenu.insertAdjacentHTML("beforeend", getServerNavMarkup());
    }

    serverLink = document.getElementById(SERVER_NAV_ID);

    if (serverLink) {
      serverLink.hidden = !isAdmin();
      serverLink.setAttribute("aria-hidden", String(!isAdmin()));
      serverLink.style.display = isAdmin() ? "" : "none";
      serverLink.removeAttribute("title");
    }

    return serverLink;
  }

  /* =========================================================
     DROPDOWN
  ========================================================= */
  function syncDropdownA11y(open) {
    const { userToggle, userDropdown } = getElements();

    if (userToggle) {
      userToggle.setAttribute("aria-haspopup", "menu");
      userToggle.setAttribute("aria-expanded", String(open));
      userToggle.removeAttribute("data-tooltip");
      userToggle.removeAttribute("title");
    }

    if (userDropdown) {
      userDropdown.setAttribute("aria-hidden", String(!open));
      userDropdown.removeAttribute("data-tooltip");
      userDropdown.removeAttribute("title");
    }

    sanitizeFooterTooltipState();
  }

  function setDropdownOpen(value) {
    const { userDropdown, userToggle } = getElements();

    state.dropdownOpen = Boolean(value);

    if (!userDropdown) {
      syncDropdownA11y(state.dropdownOpen);
      return;
    }

    if (!state.dropdownOpen) {
      blurIfInside(userDropdown);
    }

    userDropdown.classList.toggle("open", state.dropdownOpen);
    userDropdown.classList.toggle("active", state.dropdownOpen);
    userDropdown.hidden = !state.dropdownOpen;

    if (userToggle) {
      userToggle.classList.toggle("active", state.dropdownOpen);
      userToggle.removeAttribute("data-tooltip");
      userToggle.removeAttribute("title");
    }

    userDropdown.removeAttribute("data-tooltip");
    userDropdown.removeAttribute("title");

    syncDropdownA11y(state.dropdownOpen);

    AppCore.events.emit("sidebar:dropdown:change", {
      open: state.dropdownOpen,
    });
  }

  function openDropdown() {
    if (isShellHidden()) return;
    ensureSidebarOpenForUserMenu();
    setDropdownOpen(true);
  }

  function closeDropdown() {
    setDropdownOpen(false);
  }

  function toggleDropdown() {
    if (isShellHidden()) {
      closeDropdown();
      return;
    }

    const sidebarWasForcedOpen = ensureSidebarOpenForUserMenu();

    if (sidebarWasForcedOpen) {
      setDropdownOpen(true);
      return;
    }

    setDropdownOpen(!state.dropdownOpen);
  }

  /* =========================================================
     USER UI
  ========================================================= */
  function renderAvatarFallback(avatarEl, displayName, avatarText) {
    if (!avatarEl) return;

    avatarEl.innerHTML = "";
    avatarEl.textContent = avatarText;
    avatarEl.classList.remove("has-image");
    avatarEl.setAttribute("aria-label", `Avatar ${displayName}`);
    avatarEl.removeAttribute("data-tooltip");
    avatarEl.removeAttribute("title");
  }

  function renderAvatarImage(avatarEl, avatarUrl, displayName, avatarText) {
    if (!avatarEl) return;

    const safeUrl = String(avatarUrl || "").trim();

    if (!safeUrl) {
      renderAvatarFallback(avatarEl, displayName, avatarText);
      return;
    }

    avatarEl.classList.add("has-image");
    avatarEl.setAttribute("aria-label", `Avatar ${displayName}`);
    avatarEl.removeAttribute("data-tooltip");
    avatarEl.removeAttribute("title");

    const img = document.createElement("img");
    img.src = safeUrl;
    img.alt = `Avatar de ${displayName}`;
    img.loading = "eager";
    img.decoding = "async";
    img.draggable = false;
    img.referrerPolicy = "no-referrer";

    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.borderRadius = "50%";
    img.style.display = "block";

    img.onerror = () => {
      renderAvatarFallback(avatarEl, displayName, avatarText);
    };

    avatarEl.innerHTML = "";
    avatarEl.appendChild(img);
  }

  function renderUser() {
    const { nameEl, avatarEl, userToggle, userDropdown } = getElements();
    const user = getUser();

    const displayName = getDisplayName(user);
    const avatarText = getAvatarText(user);
    const username = getUsername(user);
    const avatarUrl = getAvatarUrl(user);

    if (nameEl) {
      nameEl.textContent = displayName;
      nameEl.removeAttribute("data-tooltip");
      nameEl.removeAttribute("title");

      if (username) {
        nameEl.dataset.username = username;
      } else {
        delete nameEl.dataset.username;
      }
    }

    if (avatarEl) {
      renderAvatarImage(avatarEl, avatarUrl, displayName, avatarText);

      if (username) {
        avatarEl.dataset.username = username;
      } else {
        delete avatarEl.dataset.username;
      }
    }

    if (userToggle) {
      userToggle.setAttribute(
        "aria-label",
        `Abrir menú de usuario de ${displayName}`
      );
      userToggle.removeAttribute("data-tooltip");
      userToggle.removeAttribute("title");
    }

    if (userDropdown) {
      userDropdown.removeAttribute("data-tooltip");
      userDropdown.removeAttribute("title");
    }

    sanitizeFooterTooltipState();

    AppCore.events.emit("sidebar:user:rendered", {
      user,
      displayName,
      avatarText,
      avatarUrl: avatarUrl || null,
      username: username || null,
    });
  }

  /* =========================================================
     ROLE VISIBILITY
  ========================================================= */
  function applyRoleVisibility() {
    const admin = isAdmin();
    const { sidebar } = getElements();

    ensureServerNavItem();

    if (!sidebar) return;

    sidebar.querySelectorAll('[data-role="admin"]').forEach((element) => {
      element.hidden = !admin;
      element.setAttribute("aria-hidden", String(!admin));
      element.style.display = admin ? "" : "none";
      element.removeAttribute("title");
    });

    sanitizeFooterTooltipState();

    AppCore.events.emit("sidebar:roles:applied", {
      isAdmin: admin,
    });
  }

  /* =========================================================
     ACTIONS
  ========================================================= */
  async function handleLogout() {
    if (logoutInFlight) return;

    logoutInFlight = true;

    const { logoutBtn } = getElements();

    closeDropdown();

    if (logoutBtn) {
      logoutBtn.disabled = true;
      logoutBtn.setAttribute("aria-disabled", "true");
    }

    AppCore.setLoading?.(true);

    try {
      await Auth.logout({
        silent: true,
        notifyServer: true,
      });
    } catch (error) {
      AppCore.utils.warn?.(
        "Logout remoto falló, se limpiará sesión local igualmente.",
        error
      );
    } finally {
      try {
        if (typeof AppCore.clearSession === "function") {
          AppCore.clearSession();
        } else {
          AppCore.state.user = null;
          AppCore.state.token = null;
          AppCore.state.role = null;
          AppCore.state.authenticated = false;
        }

        renderUser();
        applyRoleVisibility();
        closeDropdown();
        closeSidebarOnMobileAfterNavigation();

        AppCore.setLoading?.(false);

        Router.navigate("/login", {
          replaceState: true,
          force: true,
        });
      } finally {
        logoutInFlight = false;

        if (logoutBtn) {
          logoutBtn.disabled = false;
          logoutBtn.setAttribute("aria-disabled", "false");
        }
      }
    }
  }

  /* =========================================================
     DOM EVENTS
  ========================================================= */
  function handleDocumentClick(event) {
    const {
      sidebar,
      toggleBtn,
      mobileToggleBtn,
      userToggle,
      userDropdown,
      logoutBtn,
    } = getElements();

    const target = event.target;
    if (!(target instanceof Node)) return;

    if (toggleBtn && toggleBtn.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
      return;
    }

    if (mobileToggleBtn && mobileToggleBtn.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
      return;
    }

    if (userToggle && userToggle.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      toggleDropdown();
      return;
    }

    if (logoutBtn && logoutBtn.contains(target)) {
      event.preventDefault();
      event.stopPropagation();
      handleLogout();
      return;
    }

    if (userDropdown && userDropdown.contains(target)) {
      return;
    }

    if (
      isMobileViewport() &&
      sidebar &&
      (sidebar.classList.contains("open") || sidebar.classList.contains("is-open")) &&
      !sidebar.contains(target) &&
      !(mobileToggleBtn && mobileToggleBtn.contains(target))
    ) {
      closeSidebar();
    }

    closeDropdown();
  }

  function handleSidebarMenuClick(event) {
    const { sidebarMenu } = getElements();
    if (!sidebarMenu) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest('a[data-spa]');
    if (!link || !sidebarMenu.contains(link)) return;

    closeDropdown();
    closeSidebarOnMobileAfterNavigation();
  }

  function handleUserToggleKeydown(event) {
    const { userToggle } = getElements();
    if (!userToggle || event.target !== userToggle) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleDropdown();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      openDropdown();
    }
  }

  function handleGlobalKeydown(event) {
    if (event.key === "Escape") {
      closeDropdown();

      if (isMobileViewport() && getDesiredSidebarOpenState()) {
        closeSidebar();
      }
    }
  }

  function handleResize() {
    syncSidebarState();
    closeDropdown();
  }

  /* =========================================================
     CORE / APP EVENTS
  ========================================================= */
  function bindCoreEvents(scope) {
    AppCore.cleanup.event(scope, "app:user:change", () => {
      renderUser();
      applyRoleVisibility();
    });

    AppCore.cleanup.event(scope, "app:session:cleared", () => {
      renderUser();
      applyRoleVisibility();
      closeDropdown();
    });

    AppCore.cleanup.event(scope, "app:sidebar:change", () => {
      syncSidebarState();
    });

    AppCore.cleanup.event(scope, "router:before-render", () => {
      closeDropdown();
    });

    AppCore.cleanup.event(scope, "router:rendered", () => {
      ensureServerNavItem();
      renderUser();
      applyRoleVisibility();
      syncSidebarState();
      closeDropdown();
      closeSidebarOnMobileAfterNavigation();
    });

    AppCore.cleanup.event(scope, "router:shell:change", ({ detail }) => {
      if (detail?.hidden) {
        closeDropdown();
      }

      syncSidebarState();
    });

    AppCore.cleanup.event(scope, "app:user-ui:sync", () => {
      renderUser();
    });

    AppCore.cleanup.event(scope, "app:theme:change", () => {
      syncSidebarState();
    });

    AppCore.cleanup.event(scope, "login:success", () => {
      window.setTimeout(() => {
        ensureServerNavItem();
        renderUser();
        applyRoleVisibility();
        syncSidebarState();
      }, 0);
    });
  }

  function bindDomEvents(scope) {
    AppCore.cleanup.on(scope, document, "click", handleDocumentClick);
    AppCore.cleanup.on(scope, document, "keydown", handleGlobalKeydown);

    resizeHandler =
      typeof AppCore.utils?.debounce === "function"
        ? AppCore.utils.debounce(handleResize, 120)
        : handleResize;

    AppCore.cleanup.on(scope, window, "resize", resizeHandler);

    const { userToggle, sidebarMenu } = getElements();

    if (userToggle) {
      AppCore.cleanup.on(scope, userToggle, "keydown", handleUserToggleKeydown);
    }

    if (sidebarMenu) {
      AppCore.cleanup.on(scope, sidebarMenu, "click", handleSidebarMenuClick);
    }
  }

  /* =========================================================
     INIT
  ========================================================= */
  function init() {
    if (initialized) {
      cacheDomRefs();
      ensureServerNavItem();
      sanitizeFooterTooltipState();
      syncSidebarState();
      renderUser();
      applyRoleVisibility();
      return api;
    }

    mountSidebar();
    cacheDomRefs();

    if (!hasSidebarShell()) {
      AppCore.utils.warn?.("No se pudo montar .sidebar desde SidebarUI.");
      return api;
    }

    const { userToggle, userDropdown, logoutBtn } = getElements();
    const scope = AppCore.cleanup.scope(SCOPE);

    ensureServerNavItem();
    sanitizeFooterTooltipState();

    if (logoutBtn) {
      logoutBtn.classList.add("dropdown-item-danger");
    }

    if (userToggle) {
      userToggle.setAttribute("aria-haspopup", "menu");
      userToggle.setAttribute("aria-expanded", "false");
      userToggle.setAttribute("tabindex", "0");
      userToggle.removeAttribute("data-tooltip");
      userToggle.removeAttribute("title");
    }

    if (userDropdown) {
      userDropdown.setAttribute("role", "menu");
      userDropdown.setAttribute("aria-hidden", "true");
      userDropdown.hidden = true;
      userDropdown.removeAttribute("data-tooltip");
      userDropdown.removeAttribute("title");
    }

    if (typeof AppCore.state.sidebarOpen !== "boolean") {
      AppCore.state.sidebarOpen = !getSavedSidebarCollapsed();
    }

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    closeDropdown();

    bindDomEvents(scope);
    bindCoreEvents(scope);

    initialized = true;

    if (!AppCore.modules.has("sidebar")) {
      AppCore.modules.register("sidebar", api);
    }

    AppCore.events.emit("sidebar:ready", {
      initialized: true,
    });

    AppCore.utils.log?.("SidebarUI inicializado correctamente.");

    return api;
  }

  const api = {
    init,
    mountSidebar,
    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    openDropdown,
    closeDropdown,
    toggleDropdown,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    updateToggleLabel,
    ensureServerNavItem,
    handleLogout,
  };

  return api;
})();
