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

   FIX CRÍTICO LIFECYCLE:
   - init() ya no deja el sidebar sin eventos cuando initialized === true
   - añade repair / refresh / bind / rebind / bindEvents para App Bootstrap
   - rebind idempotente de DOM + Core events
   - fallback delegado para collapse, dropdown, logout y navegación SPA
   - corrige botones muertos hasta refrescar página
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
  let eventsBound = false;
  let fallbackDomCleanup = null;
  let lastBindReason = "";

  const state = {
    dropdownOpen: false,
  };

  /* ======================================================
     SAFE HELPERS
  ====================================================== */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

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

    try {
      console.warn("[SidebarUI]", ...args);
    } catch {}
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[SidebarUI]", ...args);
    } catch {}
  }

  function safeEmit(eventName = "", payload = {}) {
    const name = safeText(eventName, "");
    if (!name) return false;

    try {
      AppCore?.events?.emit?.(name, payload);
      return true;
    } catch {}

    try {
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(name, {
            detail: payload,
          })
        );
        return true;
      }
    } catch {}

    return false;
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

  function containsElement(parent, child) {
    if (!parent || !child) {
      return false;
    }

    try {
      return parent === child || parent.contains(child);
    } catch {
      return false;
    }
  }

  function closest(target, selector = "") {
    try {
      return target?.closest?.(selector) || null;
    } catch {
      return null;
    }
  }

  function getDatasetAction(element = null) {
    if (!element) return "";

    return safeText(
      first(
        element.dataset?.sidebarAction,
        element.dataset?.action,
        element.dataset?.homeAction,
        element.getAttribute?.("data-sidebar-action"),
        element.getAttribute?.("data-action"),
        element.getAttribute?.("data-home-action")
      ),
      ""
    );
  }

  function normalizeAction(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_]+/g, "-")
      .trim();
  }

  function isAction(action = "", candidates = []) {
    const key = normalizeAction(action);

    return candidates
      .map(normalizeAction)
      .includes(key);
  }

  function isModifiedClick(event) {
    return Boolean(
      event?.metaKey ||
        event?.ctrlKey ||
        event?.shiftKey ||
        event?.altKey ||
        event?.button === 1
    );
  }

  function isUnsafeHref(href = "") {
    const value = safeText(href, "");

    return (
      !value ||
      value === "#" ||
      value.startsWith("javascript:") ||
      value.startsWith("mailto:") ||
      value.startsWith("tel:")
    );
  }

  function isExternalHref(href = "") {
    const value = safeText(href, "");

    if (!value) {
      return false;
    }

    if (!/^https?:\/\//i.test(value)) {
      return false;
    }

    try {
      return new URL(value).origin !== window.location.origin;
    } catch {
      return true;
    }
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

  function mountAndRefresh() {
    try {
      mountSidebar(AppCore);
    } catch (error) {
      safeWarn("mountSidebar falló.", error);
    }

    refreshSidebarDomRefs();

    return hasSidebarShell(AppCore);
  }

  function ensureRuntimeStateDefaults() {
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

    return AppCore.state;
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

    safeEmit("sidebar:user:rendered", {
      user,
      displayName,
      username,
      isAdmin: isAdmin(),
    });
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
      dropdownOpen: Boolean(state.dropdownOpen),
      initialized,
      eventsBound,
      lastBindReason,
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

  function cleanupFallbackDomEvents() {
    try {
      fallbackDomCleanup?.();
    } catch {}

    fallbackDomCleanup = null;
  }

  function cleanupBoundEvents() {
    cleanupFallbackDomEvents();

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}

    eventsBound = false;
  }

  function cleanup() {
    cleanupBoundEvents();
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

  async function navigateTo(route = "", options = {}) {
    const target = safeText(route, "");
    if (!target) return false;

    const opts = safeObject(options);

    try {
      if (typeof Router?.navigate === "function") {
        Router.navigate(target, opts);
        return true;
      }

      if (typeof Router?.go === "function") {
        Router.go(target, opts);
        return true;
      }

      if (typeof Router?.push === "function") {
        Router.push(target, opts);
        return true;
      }

      if (typeof AppCore?.router?.navigate === "function") {
        AppCore.router.navigate(target, opts);
        return true;
      }

      if (typeof AppCore?.navigate === "function") {
        AppCore.navigate(target, opts);
        return true;
      }
    } catch (error) {
      safeWarn("Navegación sidebar vía Router falló.", error);
    }

    try {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return true;
    } catch {}

    try {
      window.location.assign(target);
      return true;
    } catch {}

    return false;
  }

  function getRouteFromElement(element = null) {
    if (!element) return "";

    const href = safeText(
      element.getAttribute?.("href"),
      ""
    );

    return safeText(
      first(
        element.dataset?.route,
        element.dataset?.href,
        element.dataset?.to,
        element.getAttribute?.("data-route"),
        element.getAttribute?.("data-href"),
        element.getAttribute?.("data-to"),
        href
      ),
      ""
    );
  }

  async function handleNavigationElement(element = null, event = null) {
    if (!element || isModifiedClick(event)) {
      return false;
    }

    const route = getRouteFromElement(element);

    if (
      !route ||
      isUnsafeHref(route) ||
      isExternalHref(route)
    ) {
      return false;
    }

    event?.preventDefault?.();

    closeDropdown();

    await navigateTo(route, {
      source: "sidebar",
      replaceState: false,
    });

    if (closeSidebarOnMobileAfterNavigation()) {
      closeSidebar();
    }

    return true;
  }

  /* ======================================================
     FALLBACK DELEGATED EVENTS
  ====================================================== */

  function getActionElementFromEvent(event = null) {
    const target = event?.target || null;

    return closest(
      target,
      [
        "button",
        "a",
        "[data-sidebar-action]",
        "[data-action]",
        "[data-route]",
        "[data-spa]",
      ].join(",")
    );
  }

  function isInsideSidebarShell(element = null) {
    const {
      sidebar,
      sidebarMenu,
      userToggle,
      userDropdown,
      toggleBtn,
      mobileToggleBtn,
      logoutBtn,
    } = getElements(AppCore);

    return Boolean(
      containsElement(sidebar, element) ||
        containsElement(sidebarMenu, element) ||
        containsElement(userToggle, element) ||
        containsElement(userDropdown, element) ||
        containsElement(toggleBtn, element) ||
        containsElement(mobileToggleBtn, element) ||
        containsElement(logoutBtn, element)
    );
  }

  function isToggleSidebarElement(element = null) {
    if (!element) return false;

    const {
      toggleBtn,
      mobileToggleBtn,
    } = getElements(AppCore);

    const action = getDatasetAction(element);
    const id = safeText(element.id, "");

    return Boolean(
      containsElement(toggleBtn, element) ||
        containsElement(mobileToggleBtn, element) ||
        isAction(action, [
          "toggle-sidebar",
          "sidebar-toggle",
          "toggle-collapse",
          "collapse",
          "toggle",
          "mobile-sidebar-toggle",
          "open-sidebar",
          "close-sidebar",
        ]) ||
        [
          "sidebar-toggle",
          "sidebar-collapse",
          "sidebar-mobile-toggle",
          "mobile-sidebar-toggle",
        ].includes(id)
    );
  }

  function isUserDropdownElement(element = null) {
    if (!element) return false;

    const {
      userToggle,
    } = getElements(AppCore);

    const action = getDatasetAction(element);
    const id = safeText(element.id, "");

    return Boolean(
      containsElement(userToggle, element) ||
        isAction(action, [
          "toggle-user-dropdown",
          "user-dropdown",
          "toggle-dropdown",
          "user-menu",
          "toggle-user-menu",
          "open-user-menu",
        ]) ||
        [
          "sidebar-user-toggle",
          "user-toggle",
          "sidebar-user-menu-toggle",
        ].includes(id)
    );
  }

  function isLogoutElement(element = null) {
    if (!element) return false;

    const {
      logoutBtn,
    } = getElements(AppCore);

    const action = getDatasetAction(element);
    const id = safeText(element.id, "");

    return Boolean(
      containsElement(logoutBtn, element) ||
        isAction(action, [
          "logout",
          "signout",
          "sign-out",
          "log-out",
          "close-session",
        ]) ||
        [
          "logout-btn",
          "sidebar-logout",
          "sidebar-logout-btn",
        ].includes(id)
    );
  }

  function isNavigationElement(element = null) {
    if (!element) return false;

    const tag = safeText(element.tagName, "").toLowerCase();
    const action = getDatasetAction(element);
    const route = getRouteFromElement(element);

    if (
      isAction(action, [
        "toggle-sidebar",
        "sidebar-toggle",
        "toggle-collapse",
        "collapse",
        "toggle-user-dropdown",
        "user-dropdown",
        "toggle-dropdown",
        "user-menu",
        "toggle-user-menu",
        "logout",
        "signout",
        "sign-out",
      ])
    ) {
      return false;
    }

    return Boolean(
      tag === "a" ||
        element.hasAttribute?.("data-spa") ||
        element.hasAttribute?.("data-route") ||
        route
    );
  }

  function bindFallbackDomEvents(reason = "bind-fallback") {
    if (!isBrowser()) {
      return false;
    }

    cleanupFallbackDomEvents();

    const onDocumentClick = async (event) => {
      if (!initialized && !hasSidebarShell(AppCore)) {
        return;
      }

      if (event.defaultPrevented) {
        return;
      }

      refreshSidebarDomRefs();

      const actionElement = getActionElementFromEvent(event);

      if (!actionElement) {
        const {
          userDropdown,
          userToggle,
        } = getElements(AppCore);

        if (
          state.dropdownOpen &&
          !containsElement(userDropdown, event.target) &&
          !containsElement(userToggle, event.target)
        ) {
          closeDropdown();
        }

        return;
      }

      if (!isInsideSidebarShell(actionElement)) {
        return;
      }

      if (isToggleSidebarElement(actionElement)) {
        event.preventDefault();
        event.stopPropagation();

        toggleSidebar();

        safeEmit("sidebar:fallback:action", {
          action: "toggle-sidebar",
          reason,
        });

        return;
      }

      if (isUserDropdownElement(actionElement)) {
        event.preventDefault();
        event.stopPropagation();

        toggleDropdown();

        safeEmit("sidebar:fallback:action", {
          action: "toggle-dropdown",
          reason,
        });

        return;
      }

      if (isLogoutElement(actionElement)) {
        event.preventDefault();
        event.stopPropagation();

        await handleLogout();

        safeEmit("sidebar:fallback:action", {
          action: "logout",
          reason,
        });

        return;
      }

      if (isNavigationElement(actionElement)) {
        const handled =
          await handleNavigationElement(
            actionElement,
            event
          );

        if (handled) {
          safeEmit("sidebar:fallback:action", {
            action: "navigate",
            route: getRouteFromElement(actionElement),
            reason,
          });
        }
      }
    };

    const onDocumentKeydown = (event) => {
      if (event?.key === "Escape" && state.dropdownOpen) {
        closeDropdown();
      }
    };

    document.addEventListener(
      "click",
      onDocumentClick,
      false
    );

    document.addEventListener(
      "keydown",
      onDocumentKeydown,
      false
    );

    fallbackDomCleanup = () => {
      try {
        document.removeEventListener(
          "click",
          onDocumentClick,
          false
        );
      } catch {}

      try {
        document.removeEventListener(
          "keydown",
          onDocumentKeydown,
          false
        );
      } catch {}
    };

    return true;
  }

  /* ======================================================
     EVENT BINDING
  ====================================================== */

  function bindEvents(reason = "bind") {
    lastBindReason = safeText(reason, "bind");

    const mounted = mountAndRefresh();

    if (!mounted) {
      safeWarn("No se pudo bindear sidebar: shell ausente.", {
        reason: lastBindReason,
      });
      return api;
    }

    cleanupBoundEvents();

    const scope = getCleanupScope();

    try {
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
    } catch (error) {
      safeWarn("bindDomEvents falló.", error);
    }

    try {
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
    } catch (error) {
      safeWarn("bindCoreEvents falló.", error);
    }

    bindFallbackDomEvents(lastBindReason);

    eventsBound = true;

    safeEmit("sidebar:events:bound", {
      reason: lastBindReason,
      snapshot: getSidebarSnapshot(),
    });

    return api;
  }

  function rebindEvents(reason = "rebind") {
    return bindEvents(reason);
  }

  /* ======================================================
     REPAIR / REFRESH
  ====================================================== */

  function refresh(reason = "refresh") {
    mountAndRefresh();
    ensureRuntimeStateDefaults();

    sanitizeFooterTooltipState(AppCore);
    syncSidebarState();
    renderUser();
    applyRoleVisibility();

    safeEmit("sidebar:refreshed", {
      reason,
      snapshot: getSidebarSnapshot(),
    });

    return api;
  }

  function repair(reason = "repair") {
    /*
      Reparación idempotente.

      Corrige:
      - sidebar pintado pero sin listeners
      - collapse muerto hasta refrescar
      - dropdown muerto hasta refrescar
      - DOM repintado por restore/router/syncUserUI
    */

    const mounted = mountAndRefresh();

    if (!mounted) {
      safeWarn("No se pudo reparar sidebar: shell ausente.", {
        reason,
      });
      return api;
    }

    ensureRuntimeStateDefaults();

    sanitizeFooterTooltipState(AppCore);
    syncSidebarState();
    renderUser();
    applyRoleVisibility();

    bindEvents(reason);

    initialized = true;

    safeEmit("sidebar:repaired", {
      reason,
      snapshot: getSidebarSnapshot(),
      isAdmin: isAdmin(),
    });

    return api;
  }

  /* ======================================================
     MODULE REGISTRATION
  ====================================================== */

  function registerModule() {
    try {
      if (!AppCore.modules.has("sidebar")) {
        AppCore.modules.register("sidebar", api);
        return;
      }
    } catch {}

    try {
      AppCore.modules.register("sidebar", api);
    } catch {}
  }

  /* ======================================================
     INIT
  ====================================================== */

  function init() {
    if (initialized) {
      return repair("init-already-initialized");
    }

    const mounted = mountAndRefresh();

    if (!mounted) {
      safeWarn("No se pudo montar sidebar.");
      return api;
    }

    ensureRuntimeStateDefaults();

    sanitizeFooterTooltipState(AppCore);

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    closeDropdown();

    try {
      AppCore?.syncUserUI?.();
    } catch {}

    initialized = true;

    bindEvents("init");

    registerModule();

    safeEmit("sidebar:ready", {
      initialized: true,
      isAdmin: isAdmin(),
      snapshot: getSidebarSnapshot(),
    });

    safeLog("ready", getSidebarSnapshot());

    return api;
  }

  function destroy() {
    cleanup();

    initialized = false;
    logoutInFlight = false;
    state.dropdownOpen = false;
    lastBindReason = "";

    safeEmit("sidebar:destroyed", {
      initialized: false,
    });

    return api;
  }

  /* ======================================================
     API
  ====================================================== */

  const api = {
    init,
    destroy,
    cleanup,

    repair,
    refresh,
    sync: refresh,
    render: refresh,

    bind: bindEvents,
    rebind: rebindEvents,
    bindEvents,
    rebindEvents,

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
    getState: getSidebarSnapshot,

    get initialized() {
      return initialized;
    },

    get eventsBound() {
      return eventsBound;
    },
  };

  return api;
})();

export default SidebarUI;
