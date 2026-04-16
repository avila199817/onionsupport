/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar/index.js

   Responsabilidades:
   - punto de entrada del módulo sidebar
   - composición de submódulos internos
   - API pública del sidebar
   - init seguro una sola vez
========================================================= */

import { AppCore } from "../../core/core.js";
import { Auth } from "../../features/auth.js";
import { Router } from "../../router/router.js";

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
  isAdmin,
} from "./user.js";

import {
  renderAvatarImage,
} from "./avatar.js";

import {
  getSavedSidebarCollapsed,
  saveSidebarCollapsed,
  isMobileViewport,
  updateToggleLabel,
  syncSidebarState as syncSidebarStateBase,
} from "./state.js";

import {
  ensureServerNavItem,
} from "./server-nav.js";

import {
  setDropdownOpen,
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

  function renderUser() {
    const { nameEl, avatarEl, userToggle, userDropdown } = getElements(AppCore);
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

    sanitizeFooterTooltipState(AppCore);

    AppCore.events.emit("sidebar:user:rendered", {
      user,
      displayName,
      avatarText,
      avatarUrl: avatarUrl || null,
      username: username || null,
    });
  }

  function closeDropdown() {
    return closeDropdownBase(AppCore, state);
  }

  function openDropdown() {
    if (isShellHidden(AppCore)) return;
    ensureSidebarOpenForUserMenu();
    return openDropdownBase(AppCore, state, ensureSidebarOpenForUserMenu);
  }

  function toggleDropdown() {
    return toggleDropdownBase(AppCore, state, ensureSidebarOpenForUserMenu);
  }

  function syncSidebarState() {
    return syncSidebarStateBase(AppCore, closeDropdown);
  }

  function setSidebarOpen(open) {
    const nextOpen = Boolean(open);
    const mobile = isMobileViewport(MOBILE_BREAKPOINT);

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

    const currentOpen = Boolean(AppCore.state.sidebarOpen);
    const nextOpen = !currentOpen;

    setSidebarOpen(nextOpen);

    if (!nextOpen) {
      closeDropdown();
    }
  }

  function ensureSidebarOpenForUserMenu() {
    if (isShellHidden(AppCore)) return false;

    const { sidebar } = getElements(AppCore);
    if (!sidebar) return false;

    const mobile = isMobileViewport(MOBILE_BREAKPOINT);

    const isCollapsedDesktop =
      !mobile &&
      (sidebar.classList.contains("collapsed") ||
        sidebar.classList.contains("is-collapsed"));

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
    if (isMobileViewport(MOBILE_BREAKPOINT)) {
      closeSidebar();
    }
  }

  function applyRoleVisibility() {
    return applyRoleVisibilityBase(AppCore, ensureServerNavItem, isAdmin);
  }

  async function handleLogout() {
    if (logoutInFlight) return;
    logoutInFlight = true;

    try {
      await handleLogoutBase({
        AppCore,
        Auth,
        Router,
        closeDropdown,
        renderUser,
        applyRoleVisibility,
        closeSidebarOnMobileAfterNavigation,
        getElements: () => getElements(AppCore),
      });
    } finally {
      logoutInFlight = false;
    }
  }

  function init() {
    if (initialized) {
      cacheDomRefs(AppCore);
      ensureServerNavItem(AppCore, isAdmin);
      sanitizeFooterTooltipState(AppCore);
      syncSidebarState();
      renderUser();
      applyRoleVisibility();
      return api;
    }

    mountSidebar(AppCore);
    cacheDomRefs(AppCore);

    if (!hasSidebarShell(AppCore)) {
      AppCore.utils.warn?.("No se pudo montar .sidebar desde SidebarUI.");
      return api;
    }

    ensureServerNavItem(AppCore, isAdmin);
    sanitizeFooterTooltipState(AppCore);

    if (typeof AppCore.state.sidebarOpen !== "boolean") {
      AppCore.state.sidebarOpen = !getSavedSidebarCollapsed();
    }

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    closeDropdown();

    const scope = AppCore.cleanup.scope(SCOPE);

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
      closeDropdown,
      closeSidebar,
      syncSidebarState,
      getElements: () => getElements(AppCore),
      isMobileViewport: () => isMobileViewport(MOBILE_BREAKPOINT),
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
      ensureServerNavItem: () => ensureServerNavItem(AppCore, isAdmin),
      syncSidebarState,
      closeDropdown,
      closeSidebarOnMobileAfterNavigation,
    });

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
    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    openDropdown,
    closeDropdown,
    toggleDropdown,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    updateToggleLabel: () => updateToggleLabel(AppCore),
    ensureServerNavItem: () => ensureServerNavItem(AppCore, isAdmin),
    handleLogout,
  };

  return api;
})();
