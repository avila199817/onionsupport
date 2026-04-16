/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar/index.js

   Responsabilidades:
   - punto de entrada del módulo sidebar
   - composición de submódulos internos
   - API pública del sidebar
   - init seguro una sola vez
   - sidebar limpio sin server-nav legacy
   - rehidratar referencias DOM del sidebar tras mount
   - sincronizar avatar/nombre también en AppCore.dom para compatibilidad
   - mantener collapsed manual persistente sin autoapertura inteligente
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import { Router } from "../../router/index.js";

import {
  SCOPE,
  MOBILE_BREAKPOINT,
} from "./constants.js";

import {
  mountSidebar,
  cacheDomRefs,
  getElements,
  hasSidebarShell,
  isShellHidden,
  sanitizeFooterTooltipState,
} from "./dom.js";

import {
  getUser,
  getDisplayName,
  getUsername,
  getAvatarText,
  getAvatarUrl,
  renderAvatarImage,
} from "./user.js";

import {
  getSavedSidebarCollapsed,
  saveSidebarCollapsed,
  isMobileViewport,
  updateToggleLabel,
  syncSidebarState as syncSidebarStateBase,
  getDesiredSidebarOpenState,
} from "./state.js";

import {
  openDropdown as openDropdownBase,
  closeDropdown as closeDropdownBase,
  toggleDropdown as toggleDropdownBase,
} from "./dropdown.js";

import {
  applyRoleVisibility as applyRoleVisibilityBase,
} from "./visibility.js";

import {
  handleLogout as handleLogoutBase,
} from "./actions.js";

import {
  bindDomEvents,
  bindCoreEvents,
} from "./events.js";

export const SidebarUI = (() => {
  "use strict";

  let initialized = false;
  let logoutInFlight = false;

  const state = {
    dropdownOpen: false,
  };

  /* =========================================================
     INTERNAL FLAGS
  ========================================================= */
  function setLogoutInFlight(value) {
    logoutInFlight = Boolean(value);
  }

  function isLogoutInFlight() {
    return Boolean(logoutInFlight);
  }

  /* =========================================================
     DOM REFS SYNC
     Muy importante:
     - AppCore.cacheDom() corre antes de montar el sidebar
     - aquí rehidratamos refs para que AppCore.syncUserUI() funcione
  ========================================================= */
  function syncSidebarDomIntoAppCore() {
    const elements = getElements(AppCore);

    AppCore.dom.sidebar =
      elements.sidebar || AppCore.dom.sidebar || null;

    AppCore.dom.sidebarMenu =
      elements.sidebarMenu || AppCore.dom.sidebarMenu || null;

    AppCore.dom.sidebarAvatar =
      elements.avatarEl || AppCore.dom.sidebarAvatar || null;

    AppCore.dom.sidebarName =
      elements.nameEl || AppCore.dom.sidebarName || null;

    AppCore.dom.userToggle =
      elements.userToggle || AppCore.dom.userToggle || null;

    AppCore.dom.userDropdown =
      elements.userDropdown || AppCore.dom.userDropdown || null;

    AppCore.dom.logoutBtn =
      elements.logoutBtn || AppCore.dom.logoutBtn || null;

    AppCore.dom.sidebarToggle =
      elements.sidebarToggle || AppCore.dom.sidebarToggle || null;

    AppCore.dom.sidebarMobileToggle =
      elements.sidebarMobileToggle || AppCore.dom.sidebarMobileToggle || null;
  }

  function refreshSidebarDomRefs() {
    cacheDomRefs(AppCore);
    syncSidebarDomIntoAppCore();
  }

  /* =========================================================
     ROLE HELPERS
  ========================================================= */
  function isAdmin() {
    const role =
      AppCore?.state?.role ||
      AppCore?.state?.user?.role ||
      AppCore?.state?.user?.rol ||
      "";

    return String(role)
      .trim()
      .toLowerCase() === "admin";
  }

  /* =========================================================
     USER RENDER
  ========================================================= */
  function renderUser() {
    refreshSidebarDomRefs();

    const {
      nameEl,
      avatarEl,
      userToggle,
      userDropdown,
    } = getElements(AppCore);

    const user = getUser(AppCore);

    const displayName = getDisplayName(AppCore, user);
    const avatarText = getAvatarText(AppCore, user);
    const username = getUsername(AppCore, user);
    const avatarUrl = getAvatarUrl(user);

    if (nameEl) {
      nameEl.textContent = displayName;

      if (username) {
        nameEl.dataset.username = username;
      } else {
        delete nameEl.dataset.username;
      }

      nameEl.removeAttribute("data-tooltip");
      nameEl.removeAttribute("title");
    }

    if (avatarEl) {
      renderAvatarImage(
        avatarEl,
        avatarUrl,
        displayName,
        avatarText
      );

      avatarEl.setAttribute(
        "title",
        displayName
      );

      avatarEl.setAttribute(
        "aria-label",
        `Avatar de ${displayName}`
      );

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

    sanitizeFooterTooltipState(AppCore);

    AppCore?.events?.emit?.(
      "sidebar:user:rendered",
      {
        user,
        displayName,
        avatarText,
        avatarUrl: avatarUrl || null,
        username: username || null,
      }
    );
  }

  /* =========================================================
     DROPDOWN
  ========================================================= */
  function closeDropdown() {
    return closeDropdownBase(
      AppCore,
      state
    );
  }

  function openDropdown() {
    if (isShellHidden(AppCore)) return;

    refreshSidebarDomRefs();

    return openDropdownBase(
      AppCore,
      state,
      ensureSidebarOpenForUserMenu
    );
  }

  function toggleDropdown() {
    refreshSidebarDomRefs();

    return toggleDropdownBase(
      AppCore,
      state,
      ensureSidebarOpenForUserMenu
    );
  }

  /* =========================================================
     SIDEBAR STATE
  ========================================================= */
  function syncSidebarState() {
    refreshSidebarDomRefs();

    return syncSidebarStateBase(
      AppCore,
      closeDropdown
    );
  }

  function setSidebarOpen(open) {
    const nextOpen = Boolean(open);

    const mobile =
      isMobileViewport(
        MOBILE_BREAKPOINT
      );

    AppCore.state.sidebarOpen = nextOpen;

    if (!mobile) {
      saveSidebarCollapsed(!nextOpen);
    }

    syncSidebarState();
  }

  function openSidebar() {
    if (isShellHidden(AppCore)) return;
    setSidebarOpen(true);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function toggleSidebar() {
    if (isShellHidden(AppCore)) return;

    const currentOpen = Boolean(
      AppCore.state.sidebarOpen
    );

    const nextOpen = !currentOpen;

    setSidebarOpen(nextOpen);

    if (!nextOpen) {
      closeDropdown();
    }
  }

  /* =========================================================
     MANUAL COLLAPSE ONLY
     - no autoabrir el sidebar al abrir el menú de usuario
     - el botón collapsed sigue funcionando
     - el estado sigue siendo persistente
  ========================================================= */
  function ensureSidebarOpenForUserMenu() {
    return false;
  }

  function closeSidebarOnMobileAfterNavigation() {
    if (
      isMobileViewport(
        MOBILE_BREAKPOINT
      )
    ) {
      closeSidebar();
    }
  }

  /* =========================================================
     ROLE VISIBILITY
  ========================================================= */
  function applyRoleVisibility() {
    refreshSidebarDomRefs();

    return applyRoleVisibilityBase(
      AppCore,
      null,
      isAdmin
    );
  }

  /* =========================================================
     ACTIONS
  ========================================================= */
  async function handleLogout() {
    return handleLogoutBase({
      AppCore,
      Auth,
      Router,
      closeDropdown,
      renderUser,
      applyRoleVisibility,
      closeSidebarOnMobileAfterNavigation,
      getElements: () =>
        getElements(AppCore),
      setLogoutInFlight,
      isLogoutInFlight,
    });
  }

  /* =========================================================
     INIT
  ========================================================= */
  function init() {
    if (initialized) {
      refreshSidebarDomRefs();
      sanitizeFooterTooltipState(
        AppCore
      );
      syncSidebarState();
      renderUser();
      applyRoleVisibility();
      return api;
    }

    mountSidebar(AppCore);
    refreshSidebarDomRefs();

    if (!hasSidebarShell(AppCore)) {
      AppCore?.utils?.warn?.(
        "No se pudo montar .sidebar desde SidebarUI."
      );

      return api;
    }

    sanitizeFooterTooltipState(
      AppCore
    );

    if (
      typeof AppCore.state
        .sidebarOpen !== "boolean"
    ) {
      AppCore.state.sidebarOpen =
        !getSavedSidebarCollapsed();
    }

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    closeDropdown();

    /* compatibilidad extra:
       si existe syncUserUI global, ahora ya tiene refs válidas */
    if (
      typeof AppCore.syncUserUI ===
      "function"
    ) {
      AppCore.syncUserUI();
    }

    const scope =
      AppCore.cleanup.scope(SCOPE);

    bindDomEvents({
      AppCore,
      Router,
      Auth,
      state,
      scope,
      api,
      handleLogout,
      toggleSidebar,
      toggleDropdown,
      openDropdown,
      closeDropdown,
      closeSidebar,
      closeSidebarOnMobileAfterNavigation,
      syncSidebarState,
      getElements: () =>
        getElements(AppCore),
      isMobileViewport: () =>
        isMobileViewport(
          MOBILE_BREAKPOINT
        ),
      getDesiredSidebarOpenState:
        () =>
          getDesiredSidebarOpenState(
            AppCore
          ),
    });

    bindCoreEvents({
      AppCore,
      Router,
      Auth,
      state,
      scope,
      api,
      renderUser,
      applyRoleVisibility,
      syncSidebarState,
      closeDropdown,
      closeSidebarOnMobileAfterNavigation,
    });

    initialized = true;

    if (
      !AppCore.modules.has(
        "sidebar"
      )
    ) {
      AppCore.modules.register(
        "sidebar",
        api
      );
    }

    AppCore?.events?.emit?.(
      "sidebar:ready",
      {
        initialized: true,
      }
    );

    AppCore?.utils?.log?.(
      "SidebarUI inicializado correctamente."
    );

    return api;
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */
  const api = {
    init,
    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    openDropdown,
    closeDropdown,
    toggleDropdown,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    updateToggleLabel: () =>
      updateToggleLabel(AppCore),
    handleLogout,
  };

  return api;
})();
