/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar/index.js

   FINAL FIX · MANUAL SIDEBAR ONLY · STABLE MODE
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

  /* ======================================================
     FLAGS
  ====================================================== */

  function setLogoutInFlight(value) {
    logoutInFlight = Boolean(value);
  }

  function isLogoutInFlight() {
    return logoutInFlight;
  }

  /* ======================================================
     DOM
  ====================================================== */

  function syncSidebarDomIntoAppCore() {
    const el = getElements(AppCore);

    AppCore.dom.sidebar = el.sidebar || null;
    AppCore.dom.sidebarMenu = el.sidebarMenu || null;
    AppCore.dom.sidebarAvatar = el.avatarEl || null;
    AppCore.dom.sidebarName = el.nameEl || null;
    AppCore.dom.userToggle = el.userToggle || null;
    AppCore.dom.userDropdown = el.userDropdown || null;
    AppCore.dom.logoutBtn = el.logoutBtn || null;
    AppCore.dom.sidebarToggle = el.toggleBtn || null;
    AppCore.dom.sidebarMobileToggle = el.mobileToggleBtn || null;
  }

  function refreshSidebarDomRefs() {
    cacheDomRefs(AppCore);
    syncSidebarDomIntoAppCore();
  }

  /* ======================================================
     ROLE
  ====================================================== */

  function isAdmin() {
    const role =
      AppCore?.state?.role ||
      AppCore?.state?.user?.role ||
      AppCore?.state?.user?.rol ||
      "";

    return String(role).trim().toLowerCase() === "admin";
  }

  /* ======================================================
     USER
  ====================================================== */

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
    const username = getUsername(AppCore, user);
    const avatarText = getAvatarText(AppCore, user);
    const avatarUrl = getAvatarUrl(user);

    if (nameEl) {
      nameEl.textContent = displayName;

      if (username) {
        nameEl.dataset.username = username;
      } else {
        delete nameEl.dataset.username;
      }

      nameEl.removeAttribute("title");
      nameEl.removeAttribute("data-tooltip");
    }

    if (avatarEl) {
      renderAvatarImage(
        avatarEl,
        avatarUrl,
        displayName,
        avatarText
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

    userToggle?.setAttribute(
      "aria-label",
      `Abrir menú de usuario de ${displayName}`
    );

    userToggle?.removeAttribute("title");
    userDropdown?.removeAttribute("title");

    sanitizeFooterTooltipState(AppCore);

    AppCore?.events?.emit?.("sidebar:user:rendered", {
      user,
      displayName,
    });
  }

  /* ======================================================
     DROPDOWN
  ====================================================== */

  function closeDropdown() {
    return closeDropdownBase(AppCore, state);
  }

  function ensureSidebarOpenForUserMenu() {
    if (!AppCore?.state?.sidebarOpen) {
      openSidebar();
      return true;
    }

    return false;
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

  /* ======================================================
     SIDEBAR STATE
  ====================================================== */

  function syncSidebarState() {
    refreshSidebarDomRefs();

    return syncSidebarStateBase(
      AppCore,
      closeDropdown
    );
  }

  function setSidebarOpen(open) {
    const nextOpen = Boolean(open);
    const mobile = isMobileViewport(MOBILE_BREAKPOINT);

    if (typeof AppCore?.setSidebarOpen === "function") {
      AppCore.setSidebarOpen(nextOpen);
    } else {
      AppCore.state.sidebarOpen = nextOpen;
    }

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

    const nextOpen = !Boolean(
      AppCore?.state?.sidebarOpen
    );

    setSidebarOpen(nextOpen);

    if (!nextOpen) {
      closeDropdown();
    }
  }

  function getSidebarSnapshot() {
    const { sidebar } = getElements(AppCore);

    const mobile = isMobileViewport(MOBILE_BREAKPOINT);

    const domOpen =
      sidebar &&
      !sidebar.classList.contains("collapsed") &&
      !sidebar.classList.contains("is-collapsed");

    return {
      mobile,
      open:
        typeof AppCore?.state?.sidebarOpen === "boolean"
          ? Boolean(AppCore.state.sidebarOpen)
          : Boolean(domOpen),
    };
  }

  function restoreSidebarState(snapshot) {
    if (!snapshot || snapshot.mobile) return;

    if (
      Boolean(AppCore?.state?.sidebarOpen) ===
      Boolean(snapshot.open)
    ) {
      return;
    }

    setSidebarOpen(snapshot.open);
  }

  function closeSidebarOnMobileAfterNavigation() {
    return isMobileViewport(MOBILE_BREAKPOINT);
  }

  /* ======================================================
     VISIBILITY
  ====================================================== */

  function applyRoleVisibility() {
    refreshSidebarDomRefs();

    return applyRoleVisibilityBase(
      AppCore,
      null,
      isAdmin
    );
  }

  /* ======================================================
     ACTIONS
  ====================================================== */

  async function handleLogout() {
    return handleLogoutBase({
      AppCore,
      Auth,
      Router,
      closeDropdown,
      renderUser,
      applyRoleVisibility,
      closeSidebarOnMobileAfterNavigation,
      getElements: () => getElements(AppCore),
      setLogoutInFlight,
      isLogoutInFlight,
    });
  }

  /* ======================================================
     INIT
  ====================================================== */

  function init() {
    if (initialized) {
      refreshSidebarDomRefs();
      syncSidebarState();
      renderUser();
      applyRoleVisibility();
      return api;
    }

    mountSidebar(AppCore);
    refreshSidebarDomRefs();

    if (!hasSidebarShell(AppCore)) {
      AppCore?.utils?.warn?.("No se pudo montar sidebar.");
      return api;
    }

    sanitizeFooterTooltipState(AppCore);

    if (typeof AppCore.state.sidebarOpen !== "boolean") {
      AppCore.state.sidebarOpen = true;
    }

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    closeDropdown();

    AppCore?.syncUserUI?.();

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
      openDropdown,
      closeDropdown,
      closeSidebar,
      closeSidebarOnMobileAfterNavigation,
      syncSidebarState,
      getElements: () => getElements(AppCore),
      isMobileViewport: () =>
        isMobileViewport(MOBILE_BREAKPOINT),
      getDesiredSidebarOpenState: () =>
        getDesiredSidebarOpenState(AppCore),
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
      getSidebarSnapshot,
      restoreSidebarState,
    });

    initialized = true;

    if (!AppCore.modules.has("sidebar")) {
      AppCore.modules.register("sidebar", api);
    }

    AppCore?.events?.emit?.("sidebar:ready", {
      initialized: true,
    });

    return api;
  }

  /* ======================================================
     API
  ====================================================== */

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

export default SidebarUI;
