/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar/index.js

   FINAL PRO FIX · DESKTOP STABLE MODE · ADMIN VISIBILITY HARDENED

   FIX:
   - desktop y mobile separados
   - sin auto-collapse fantasma al cambiar de ruta
   - restore robusto del estado
   - dropdown estable
   - detección admin robusta para ocultar/mostrar items admin
   - soporte roles alias: admin / superadmin / administrator / owner / root
   - soporte flags: isAdmin / admin / canManageUsers / canAccessUsers
   - cleanup scope defensivo
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
  isMobileViewport,
  updateToggleLabel,
  syncSidebarState as syncSidebarStateBase,
  getDesiredSidebarOpenState,
  setSidebarOpen as setSidebarOpenBase,
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
     SAFE HELPERS
  ====================================================== */

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    return [value];
  }

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;

      return value;
    }

    return null;
  }

  function safeBoolean(value, fallback = false) {
    if (typeof value === "boolean") return value;

    if (typeof value === "string") {
      const key = value.trim().toLowerCase();

      if (["true", "1", "yes", "si", "sí"].includes(key)) return true;
      if (["false", "0", "no"].includes(key)) return false;
    }

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    return fallback;
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[SidebarUI]", ...args);
    } catch {}
  }

  function normalizeRole(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "")
      .trim();
  }

  function normalizeRoles(value) {
    return toArray(value)
      .flat(Infinity)
      .map(normalizeRole)
      .filter(Boolean);
  }

  /* ======================================================
     ADMIN ROLE RESOLUTION
  ====================================================== */

  const ADMIN_ROLE_KEYS = new Set([
    "admin",
    "administrator",
    "administrador",
    "superadmin",
    "super_admin",
    "super_administrador",
    "owner",
    "root",
  ]);

  function getAuthUser() {
    try {
      if (typeof Auth?.getUser === "function") {
        return safeObject(Auth.getUser());
      }
    } catch {}

    try {
      if (typeof Auth?.getCurrentUser === "function") {
        return safeObject(Auth.getCurrentUser());
      }
    } catch {}

    try {
      if (typeof Auth?.currentUser === "function") {
        return safeObject(Auth.currentUser());
      }
    } catch {}

    return {};
  }

  function getCurrentUser() {
    return safeObject(
      first(
        AppCore?.state?.user,
        AppCore?.state?.currentUser,
        AppCore?.state?.sessionUser,
        AppCore?.state?.authUser,
        AppCore?.state?.session?.user,
        getAuthUser()
      )
    );
  }

  function getRoleCandidates() {
    const user = getCurrentUser();

    const roleCandidates = [
      AppCore?.state?.role,
      AppCore?.state?.rol,
      AppCore?.state?.userRole,
      AppCore?.state?.type,

      AppCore?.state?.session?.role,
      AppCore?.state?.session?.rol,
      AppCore?.state?.session?.userRole,

      user?.role,
      user?.rol,
      user?.userRole,
      user?.type,
      user?.userType,

      Auth?.role,
      Auth?.userRole,
    ];

    try {
      if (typeof Auth?.getRole === "function") {
        roleCandidates.push(Auth.getRole());
      }
    } catch {}

    try {
      if (typeof Auth?.getCurrentRole === "function") {
        roleCandidates.push(Auth.getCurrentRole());
      }
    } catch {}

    const roleArrays = [
      AppCore?.state?.roles,
      AppCore?.state?.permissions,
      AppCore?.state?.scopes,

      AppCore?.state?.session?.roles,
      AppCore?.state?.session?.permissions,
      AppCore?.state?.session?.scopes,

      user?.roles,
      user?.permissions,
      user?.scopes,

      Auth?.roles,
      Auth?.permissions,
      Auth?.scopes,
    ];

    return [
      ...roleCandidates,
      ...roleArrays.flatMap((value) => toArray(value)),
    ];
  }

  function hasAdminFlag() {
    const user = getCurrentUser();

    return [
      AppCore?.state?.isAdmin,
      AppCore?.state?.admin,
      AppCore?.state?.isSuperAdmin,
      AppCore?.state?.superAdmin,
      AppCore?.state?.canManageUsers,
      AppCore?.state?.canAccessUsers,

      AppCore?.state?.session?.isAdmin,
      AppCore?.state?.session?.admin,
      AppCore?.state?.session?.isSuperAdmin,
      AppCore?.state?.session?.superAdmin,
      AppCore?.state?.session?.canManageUsers,
      AppCore?.state?.session?.canAccessUsers,

      user?.isAdmin,
      user?.admin,
      user?.isSuperAdmin,
      user?.superAdmin,
      user?.canManageUsers,
      user?.canAccessUsers,
    ].some((value) => safeBoolean(value, false));
  }

  function isAdminRole(value = "") {
    return ADMIN_ROLE_KEYS.has(normalizeRole(value));
  }

  function isAdmin() {
    if (hasAdminFlag()) {
      return true;
    }

    const roles = normalizeRoles(getRoleCandidates());

    return roles.some(isAdminRole);
  }

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

    if (!AppCore.dom || typeof AppCore.dom !== "object") {
      AppCore.dom = {};
    }

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

      /*
        Evita tooltip nativo/custom en avatar footer.
      */
      avatarEl.removeAttribute("title");
      avatarEl.removeAttribute("data-tooltip");
    }

    userToggle?.setAttribute(
      "aria-label",
      `Abrir menú de usuario de ${displayName}`
    );

    userToggle?.removeAttribute("title");
    userToggle?.removeAttribute("data-tooltip");
    userDropdown?.removeAttribute("title");
    userDropdown?.removeAttribute("data-tooltip");

    sanitizeFooterTooltipState(AppCore);

    try {
      AppCore?.events?.emit?.("sidebar:user:rendered", {
        user,
        displayName,
        username,
        isAdmin: isAdmin(),
      });
    } catch {}
  }

  /* ======================================================
     DROPDOWN
  ====================================================== */

  function closeDropdown() {
    return closeDropdownBase(AppCore, state);
  }

  function ensureSidebarOpenForUserMenu() {
    if (!getDesiredSidebarOpenState(AppCore)) {
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
    setSidebarOpenBase(
      AppCore,
      Boolean(open),
      closeDropdown
    );

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

    const nextOpen = !getDesiredSidebarOpenState(AppCore);

    setSidebarOpen(nextOpen);

    if (!nextOpen) {
      closeDropdown();
    }
  }

  function getSidebarSnapshot() {
    const mobile = isMobileViewport(MOBILE_BREAKPOINT);
    const open = getDesiredSidebarOpenState(AppCore);

    return {
      mobile,
      open,
      desktopOpen:
        typeof AppCore?.state?.sidebarDesktopOpen === "boolean"
          ? Boolean(AppCore.state.sidebarDesktopOpen)
          : open,
    };
  }

  function restoreSidebarState(snapshot) {
    if (!snapshot) return;

    const mobileNow = isMobileViewport(MOBILE_BREAKPOINT);
    if (mobileNow) return;

    const desiredOpen = Boolean(
      typeof snapshot.desktopOpen === "boolean"
        ? snapshot.desktopOpen
        : snapshot.open
    );

    if (AppCore?.state && typeof AppCore.state === "object") {
      AppCore.state.sidebarDesktopOpen = desiredOpen;
      AppCore.state.sidebarOpen = desiredOpen;
    }

    if (getDesiredSidebarOpenState(AppCore) === desiredOpen) {
      syncSidebarState();
      return;
    }

    setSidebarOpen(desiredOpen);
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
     CLEANUP SCOPE
  ====================================================== */

  function getCleanupScope() {
    try {
      if (typeof AppCore?.cleanup?.scope === "function") {
        return AppCore.cleanup.scope(SCOPE);
      }
    } catch {}

    return SCOPE;
  }

  function cleanup() {
    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}

    closeDropdown();
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
      sanitizeFooterTooltipState(AppCore);
      return api;
    }

    mountSidebar(AppCore);
    refreshSidebarDomRefs();

    if (!hasSidebarShell(AppCore)) {
      safeWarn("No se pudo montar sidebar.");
      return api;
    }

    sanitizeFooterTooltipState(AppCore);

    const mobile = isMobileViewport(MOBILE_BREAKPOINT);
    const desktopOpen = true;

    if (!AppCore.state || typeof AppCore.state !== "object") {
      AppCore.state = {};
    }

    if (typeof AppCore.state.sidebarDesktopOpen !== "boolean") {
      AppCore.state.sidebarDesktopOpen = desktopOpen;
    }

    if (typeof AppCore.state.sidebarOpen !== "boolean") {
      AppCore.state.sidebarOpen = mobile
        ? false
        : AppCore.state.sidebarDesktopOpen;
    } else if (!mobile) {
      AppCore.state.sidebarOpen = AppCore.state.sidebarDesktopOpen;
    }

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    closeDropdown();

    try {
      AppCore?.syncUserUI?.();
    } catch {}

    const scope = getCleanupScope();

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
      getElements: () => getElements(AppCore),
    });

    initialized = true;

    try {
      if (!AppCore.modules.has("sidebar")) {
        AppCore.modules.register("sidebar", api);
      }
    } catch {
      try {
        AppCore.modules.register("sidebar", api);
      } catch {}
    }

    try {
      AppCore?.events?.emit?.("sidebar:ready", {
        initialized: true,
        isAdmin: isAdmin(),
      });
    } catch {}

    return api;
  }

  function destroy() {
    cleanup();
    initialized = false;
    logoutInFlight = false;
    state.dropdownOpen = false;

    try {
      AppCore?.events?.emit?.("sidebar:destroyed", {
        initialized: false,
      });
    } catch {}

    return api;
  }

  /* ======================================================
     API
  ====================================================== */

  const api = {
    init,
    destroy,
    cleanup,

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

    isAdmin,

    getSnapshot: getSidebarSnapshot,
  };

  return api;
})();

export default SidebarUI;
