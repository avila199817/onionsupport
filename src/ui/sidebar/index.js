/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar/index.js

   FINAL EXTREME SYSTEM · DESKTOP/MOBILE STABLE · DROPDOWN SAFE · APPLE INDICATOR · 10/10

   RESPONSABILIDADES:
   - montar sidebar
   - mantener desktop/mobile separados
   - sincronizar estado visual del sidebar
   - renderizar usuario/avatar
   - controlar dropdown de usuario
   - controlar logout
   - aplicar visibilidad por rol/admin
   - reparar eventos tras login/restore/router render
   - registrar módulo en AppCore.modules
   - sincronizar item activo del menú
   - delegar indicador activo tipo Apple en state.js
   - evitar doble toggle entre events.js y fallback delegado
   - evitar carreras tras router render / auth restore / rebind
   - neutralizar hover/focus fantasma al cambiar de vista
   - soportar rutas públicas con /@username sin romper active item

   REGLAS:
   - SidebarUI NO escribe variables CSS del indicador.
   - SidebarUI solo marca active/aria-current y pide recálculo.
   - state.js escribe variables:
     --sidebar-indicator-x/y/w/h/opacity
   - events.js centraliza commits visuales post-evento.
   - index.js no debe emitir eventos que causen doble transición.
   - El matching visual de menú debe normalizar /@slug.
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
  isRealShellHidden,
  updateToggleLabel,
  syncSidebarState as syncSidebarStateBase,
  getDesiredSidebarOpenState,
  setSidebarOpen as setSidebarOpenBase,
  repairSidebarState as repairSidebarStateBase,
  syncActiveMenuIndicator,
  scheduleActiveMenuIndicator,
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

  /* ======================================================
     INTERNAL STATE
  ====================================================== */

  let initialized = false;
  let logoutInFlight = false;
  let eventsBound = false;

  let fallbackDomCleanup = null;
  let activeCleanupScope = null;
  let lastBindReason = "";
  let bindGeneration = 0;

  let visualSyncTimer = null;
  let hoverFlushTimer = null;

  const VISUAL_SYNC_DEFAULT_DELAY = 24;
  const VISUAL_SYNC_AFTER_NAV_DELAY = 80;
  const VISUAL_SYNC_AFTER_TRANSITION_DELAY = 430;
  const HOVER_FLUSH_MS = 96;

  const runtimeState = {
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

  function isFunction(value) {
    return typeof value === "function";
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

      if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) {
        return true;
      }

      if (["false", "0", "no", "off"].includes(key)) {
        return false;
      }
    }

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    return fallback;
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : fallback;
  }

  function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
    const n = safeNumber(value, min);

    return Math.min(
      Math.max(n, min),
      max
    );
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

    let emitted = false;

    try {
      AppCore?.events?.emit?.(name, payload);
      emitted = true;
    } catch {}

    try {
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(name, {
            detail: payload,
          })
        );

        emitted = true;
      }
    } catch {}

    return emitted;
  }

  function preventDefault(event) {
    try {
      event?.preventDefault?.();
    } catch {}
  }

  function stopPropagation(event) {
    try {
      event?.stopPropagation?.();
    } catch {}
  }

  function stopImmediatePropagation(event) {
    try {
      event?.stopImmediatePropagation?.();
    } catch {}
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

  function queryAll(root = null, selector = "") {
    if (!root || !selector) {
      return [];
    }

    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function afterPaint(callback) {
    if (!isFunction(callback)) {
      return;
    }

    if (!isBrowser()) {
      try {
        callback();
      } catch {}

      return;
    }

    try {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          try {
            callback();
          } catch {}
        });
      });

      return;
    } catch {}

    try {
      window.setTimeout(() => {
        try {
          callback();
        } catch {}
      }, 0);
    } catch {}
  }

  function safeSetTimeout(callback, ms = 0) {
    if (!isFunction(callback)) {
      return null;
    }

    if (!isBrowser()) {
      try {
        callback();
      } catch {}

      return null;
    }

    try {
      return window.setTimeout(() => {
        try {
          callback();
        } catch {}
      }, ms);
    } catch {
      try {
        callback();
      } catch {}

      return null;
    }
  }

  function safeClearTimeout(timer) {
    if (!timer || !isBrowser()) {
      return false;
    }

    try {
      window.clearTimeout(timer);
      return true;
    } catch {
      return false;
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
      /^javascript:/i.test(value) ||
      /^data:/i.test(value) ||
      /^vbscript:/i.test(value) ||
      /^mailto:/i.test(value) ||
      /^tel:/i.test(value)
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

    if (!isBrowser()) {
      return true;
    }

    try {
      return new URL(value, window.location.origin).origin !== window.location.origin;
    } catch {
      return true;
    }
  }

  function markSidebarEventHandled(event, reason = "") {
    if (!event) {
      return false;
    }

    try {
      event.__onionSidebarHandled = true;
      event.__onionSidebarEventsHandled = true;
      event.__onionSidebarReason = safeText(reason, "");
    } catch {}

    return true;
  }

  function wasSidebarEventHandled(event) {
    return Boolean(
      event?.__onionSidebarHandled ||
        event?.__onionSidebarEventsHandled
    );
  }

  function isElementHiddenOrDisabled(element = null) {
    if (!element) {
      return true;
    }

    try {
      if (element.hidden === true) {
        return true;
      }

      if (element.disabled === true) {
        return true;
      }

      if (element.getAttribute?.("aria-disabled") === "true") {
        return true;
      }

      if (element.getAttribute?.("aria-hidden") === "true") {
        return true;
      }

      if (element.dataset?.sidebarVisible === "false") {
        return true;
      }

      if (element.dataset?.roleVisible === "false") {
        return true;
      }

      if (element.dataset?.adminVisible === "false") {
        return true;
      }

      if (
        element.closest?.(
          [
            "[hidden]",
            "[inert]",
            "[data-sidebar-visible='false']",
            "[data-role-visible='false']",
            "[data-admin-visible='false']",
          ].join(",")
        )
      ) {
        return true;
      }

      const rect = element.getBoundingClientRect?.();

      if (
        rect &&
        (
          rect.width <= 0 ||
          rect.height <= 0
        )
      ) {
        return true;
      }
    } catch {}

    return false;
  }

  function isShellBlocked() {
    /*
      Para acciones interactivas usamos isRealShellHidden().
      isShellHidden() puede leer sidebar.hidden y bloquear tras rutas auth
      si el router todavía no ha terminado de reparar el DOM.
    */
    try {
      return Boolean(isRealShellHidden(AppCore));
    } catch {
      return Boolean(isShellHidden(AppCore));
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

  const ADMIN_PERMISSION_KEYS = new Set([
    "admin:*",
    "admin.all",
    "admin.full",
    "admin.manage",

    "users.manage",
    "users:manage",
    "users.write",
    "users:write",
    "users.admin",

    "usuarios.manage",
    "usuarios:manage",
    "usuarios.write",
    "usuarios:write",
    "usuarios.admin",

    "manage_users",
    "can_manage_users",
    "access_users",
    "can_access_users",
  ]);

  function normalizeRole(value = "") {
    return safeText(value, "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_")
      .replace(/[^a-z0-9_:.]/g, "")
      .trim();
  }

  function flattenRoleValue(value) {
    if (value === null || value === undefined) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap(flattenRoleValue);
    }

    if (typeof value === "string") {
      return value
        .split(/[,\s|]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return [value];
    }

    if (typeof value === "object") {
      const entries = Object.entries(value);

      const truthyKeys = entries
        .filter(([, entryValue]) => safeBoolean(entryValue, false))
        .map(([key]) => key);

      return [
        value.role,
        value.rol,
        value.name,
        value.key,
        value.value,
        value.id,
        value.code,
        value.slug,
        value.type,
        value.scope,
        value.permission,

        value.roles,
        value.roleList,
        value.role_list,
        value.permissions,
        value.scopes,
        value.groups,
        value.authorities,
        value.items,
        value.list,

        ...truthyKeys,
      ].flatMap(flattenRoleValue);
    }

    return [];
  }

  function normalizeRoles(value) {
    return flattenRoleValue(value)
      .flat(Infinity)
      .map(normalizeRole)
      .filter(Boolean);
  }

  function isAdminRole(value = "") {
    return ADMIN_ROLE_KEYS.has(normalizeRole(value));
  }

  function isAdminPermission(value = "") {
    const key = normalizeRole(value);

    if (!key) {
      return false;
    }

    if (ADMIN_PERMISSION_KEYS.has(key)) {
      return true;
    }

    return (
      key.startsWith("admin:") ||
      key.startsWith("admin.") ||
      key.includes(":admin") ||
      key.includes(".admin")
    );
  }

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
    const raw = safeObject(user?.raw);
    const profile = safeObject(user?.profile);
    const account = safeObject(user?.account);
    const meta = safeObject(user?.meta);
    const claims = safeObject(user?.claims);

    const rawProfile = safeObject(raw?.profile);
    const rawMeta = safeObject(raw?.meta);
    const rawClaims = safeObject(raw?.claims);

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
      user?.user_role,
      user?.type,
      user?.userType,
      user?.user_type,
      user?.perfil,

      profile.role,
      profile.rol,
      profile.userRole,
      profile.user_role,
      profile.type,
      profile.perfil,

      account.role,
      account.rol,
      account.userRole,
      account.type,

      meta.role,
      meta.rol,
      meta.userRole,

      claims.role,
      claims.rol,
      claims.userRole,
      claims["custom:role"],
      claims["https://onion/role"],

      raw.role,
      raw.rol,
      raw.userRole,
      raw.user_role,
      raw.type,
      raw.userType,
      raw.user_type,
      raw.perfil,

      rawProfile.role,
      rawProfile.rol,
      rawProfile.userRole,
      rawProfile.user_role,
      rawProfile.type,
      rawProfile.perfil,

      rawMeta.role,
      rawMeta.rol,
      rawMeta.userRole,

      rawClaims.role,
      rawClaims.rol,
      rawClaims.userRole,
      rawClaims["custom:role"],
      rawClaims["https://onion/role"],

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
      user?.roleList,
      user?.role_list,
      user?.permissions,
      user?.scopes,
      user?.groups,
      user?.authorities,

      profile.roles,
      profile.permissions,
      profile.scopes,
      profile.groups,
      profile.authorities,

      account.roles,
      account.permissions,
      account.scopes,
      account.groups,

      meta.roles,
      meta.permissions,
      meta.scopes,
      meta.groups,

      claims.roles,
      claims.permissions,
      claims.scopes,
      claims.groups,

      raw.roles,
      raw.roleList,
      raw.role_list,
      raw.permissions,
      raw.scopes,
      raw.groups,
      raw.authorities,

      rawProfile.roles,
      rawProfile.permissions,
      rawProfile.scopes,
      rawProfile.groups,

      rawMeta.roles,
      rawMeta.permissions,
      rawMeta.scopes,

      rawClaims.roles,
      rawClaims.permissions,
      rawClaims.scopes,
      rawClaims.groups,

      Auth?.roles,
      Auth?.permissions,
      Auth?.scopes,
    ];

    return [
      ...roleCandidates,
      ...roleArrays,
    ];
  }

  function hasAdminFlag() {
    const user = getCurrentUser();
    const raw = safeObject(user?.raw);
    const profile = safeObject(user?.profile);
    const account = safeObject(user?.account);
    const meta = safeObject(user?.meta);
    const claims = safeObject(user?.claims);

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

      profile.isAdmin,
      profile.admin,
      profile.isSuperAdmin,
      profile.superAdmin,
      profile.canManageUsers,
      profile.canAccessUsers,

      account.isAdmin,
      account.admin,
      account.isSuperAdmin,
      account.superAdmin,

      meta.isAdmin,
      meta.admin,
      meta.isSuperAdmin,
      meta.superAdmin,
      meta.canManageUsers,
      meta.canAccessUsers,

      claims.isAdmin,
      claims.admin,
      claims.isSuperAdmin,
      claims.superAdmin,
      claims.canManageUsers,
      claims.canAccessUsers,

      raw.isAdmin,
      raw.admin,
      raw.is_admin,
      raw.isSuperAdmin,
      raw.superAdmin,
      raw.is_super_admin,
      raw.canManageUsers,
      raw.can_manage_users,
      raw.canAccessUsers,
      raw.can_access_users,
    ].some((value) => safeBoolean(value, false));
  }

  function isAdmin() {
    if (hasAdminFlag()) {
      return true;
    }

    try {
      if (
        typeof Auth?.isCurrentUserAdmin === "function" &&
        Auth.isCurrentUserAdmin()
      ) {
        return true;
      }
    } catch {}

    try {
      if (
        typeof Auth?.hasRole === "function" &&
        Auth.hasRole(
          "admin",
          "administrator",
          "administrador",
          "superadmin",
          "super_admin",
          "owner",
          "root"
        )
      ) {
        return true;
      }
    } catch {}

    const roles = normalizeRoles(getRoleCandidates());

    return roles.some((role) => {
      return isAdminRole(role) || isAdminPermission(role);
    });
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

    try {
      if (!AppCore.dom || typeof AppCore.dom !== "object") {
        AppCore.dom = {};
      }

      AppCore.dom.sidebar = el.sidebar || null;
      AppCore.dom.sidebarMenu = el.sidebarMenu || null;
      AppCore.dom.sidebarRecents = el.sidebarRecents || null;
      AppCore.dom.sidebarAvatar = el.avatarEl || null;
      AppCore.dom.sidebarName = el.nameEl || null;
      AppCore.dom.sidebarLogo = el.logoEl || null;
      AppCore.dom.userToggle = el.userToggle || null;
      AppCore.dom.userDropdown = el.userDropdown || null;
      AppCore.dom.logoutBtn = el.logoutBtn || null;
      AppCore.dom.sidebarToggle = el.toggleBtn || null;
      AppCore.dom.sidebarMobileToggle = el.mobileToggleBtn || null;
      AppCore.dom.mobileSidebarToggle = el.mobileToggleBtn || null;
    } catch {}
  }

  function refreshSidebarDomRefs() {
    try {
      cacheDomRefs(AppCore);
    } catch {}

    syncSidebarDomIntoAppCore();

    return getElements(AppCore);
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

    try {
      if (!AppCore.state || typeof AppCore.state !== "object") {
        AppCore.state = {};
      }

      /*
        No pisamos el estado desktop guardado.
        getDesiredSidebarOpenState() ya lee storage y normaliza memoria.
      */
      const desiredOpen = getDesiredSidebarOpenState(AppCore);

      if (typeof AppCore.state.sidebarDesktopOpen !== "boolean") {
        AppCore.state.sidebarDesktopOpen = mobile
          ? true
          : Boolean(desiredOpen);
      }

      if (typeof AppCore.state.sidebarMobileOpen !== "boolean") {
        AppCore.state.sidebarMobileOpen = false;
      }

      AppCore.state.sidebarOpen = mobile
        ? Boolean(AppCore.state.sidebarMobileOpen)
        : Boolean(AppCore.state.sidebarDesktopOpen);

      AppCore.state.sidebarMode = mobile
        ? "mobile"
        : "desktop";

      AppCore.state.sidebarLastMode = AppCore.state.sidebarMode;

      return AppCore.state;
    } catch {
      return {};
    }
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
      try {
        nameEl.textContent = displayName;

        if (username) {
          nameEl.dataset.username = username;
        } else {
          delete nameEl.dataset.username;
        }

        nameEl.removeAttribute("title");
        nameEl.removeAttribute("data-tooltip");
        nameEl.removeAttribute("aria-describedby");
      } catch {}
    }

    if (avatarEl) {
      try {
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

        avatarEl.removeAttribute("title");
        avatarEl.removeAttribute("data-tooltip");
        avatarEl.removeAttribute("aria-describedby");
      } catch {}
    }

    if (userToggle) {
      try {
        userToggle.setAttribute(
          "aria-label",
          `Abrir menú de usuario de ${displayName}`
        );

        userToggle.setAttribute(
          "aria-haspopup",
          "menu"
        );

        userToggle.removeAttribute("title");
        userToggle.removeAttribute("data-tooltip");
        userToggle.removeAttribute("aria-describedby");

        if (
          userDropdown?.id &&
          !userToggle.getAttribute("aria-controls")
        ) {
          userToggle.setAttribute(
            "aria-controls",
            userDropdown.id
          );
        }
      } catch {}
    }

    if (userDropdown) {
      try {
        userDropdown.removeAttribute("title");
        userDropdown.removeAttribute("data-tooltip");
        userDropdown.removeAttribute("aria-describedby");

        if (!userDropdown.getAttribute("role")) {
          userDropdown.setAttribute("role", "menu");
        }
      } catch {}
    }

    try {
      sanitizeFooterTooltipState(AppCore);
    } catch {}

    safeEmit("sidebar:user:rendered", {
      user,
      displayName,
      username,
      isAdmin: isAdmin(),
    });

    return true;
  }

  /* ======================================================
     ROUTE / ACTIVE MENU
  ====================================================== */

  function getBrowserPath() {
    if (!isBrowser()) {
      return "/";
    }

    try {
      const pathname = window.location.pathname || "/";
      const search = window.location.search || "";
      const hash = window.location.hash || "";

      if (
        hash.startsWith("#/") ||
        hash.startsWith("#!")
      ) {
        return hash
          .replace(/^#!\/?/, "/")
          .replace(/^#\/?/, "/") || "/";
      }

      return `${pathname}${search}`;
    } catch {
      return "/";
    }
  }

  function stripPublicUsernamePrefix(pathname = "/") {
    const value =
      safeText(pathname, "/")
        .replace(/^\/@[^/]+(?=\/|$)/i, "");

    return value || "/";
  }

  function stripSearchHash(path = "/") {
    const raw = safeText(path, "/");

    return raw
      .split("?")[0]
      .split("#")[0] || "/";
  }

  function normalizeRoutePath(path = "/") {
    let value = safeText(path, "/");

    if (!value) {
      value = "/";
    }

    try {
      if (isBrowser()) {
        const parsed = new URL(value, window.location.origin);

        if (
          parsed.hash &&
          (
            parsed.hash.startsWith("#/") ||
            parsed.hash.startsWith("#!")
          )
        ) {
          value = parsed.hash
            .replace(/^#!\/?/, "/")
            .replace(/^#\/?/, "/");
        } else {
          value = `${parsed.pathname || "/"}${parsed.search || ""}`;
        }
      }
    } catch {}

    value = stripSearchHash(value)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    value = stripPublicUsernamePrefix(value);

    if (
      value.length > 1 &&
      value.endsWith("/")
    ) {
      value = value.replace(/\/+$/g, "") || "/";
    }

    return value || "/";
  }

  function resolvePreferredRouteFromOptions(options = {}) {
    const opts = safeObject(options);
    const payload = safeObject(opts.payload);

    return first(
      opts.route,
      opts.path,
      opts.publicPath,
      opts.canonicalPath,

      payload.publicPath,
      payload.path,
      payload.requestedPath,
      payload.canonicalPath,
      payload.to,
      payload.url,
      payload.route
    );
  }

  function getCurrentRoutePath(preferred = "") {
    const normalizedPreferred = normalizeRoutePath(preferred || "");

    if (preferred && normalizedPreferred) {
      return normalizedPreferred;
    }

    /*
      Para active menu, la URL visible es la fuente más estable.
      Corrige el caso:
        /@cristian/usuarios
      donde AppCore.state.publicPath puede quedar un tick tarde.
    */
    const browserPath =
      normalizeRoutePath(getBrowserPath());

    const candidates = [
      browserPath,

      Router?.getCurrentPublicPath?.(),
      Router?.getCurrentCanonicalPath?.(),
      Router?.getCurrentPath?.(),

      AppCore?.state?.publicPath,
      AppCore?.state?.route,
      AppCore?.state?.canonicalPath,

      Router?.getPath?.(),
      Router?.currentPath,
    ];

    for (const candidate of candidates) {
      const value = normalizeRoutePath(candidate || "");

      if (value) {
        return value;
      }
    }

    return "/";
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

  function getAllMenuItems() {
    const {
      sidebarMenu,
    } = getElements(AppCore);

    if (!sidebarMenu) {
      return [];
    }

    return queryAll(
      sidebarMenu,
      [
        "a[data-sidebar-nav='true']",
        "a.menu-item",
        "a[data-spa]",
        "a[data-route]",
        ".menu-item[data-route]",
      ].join(",")
    );
  }

  function getMenuItems() {
    return getAllMenuItems()
      .filter((item) => !isElementHiddenOrDisabled(item));
  }

  function getMenuItemRoute(element = null) {
    return normalizeRoutePath(
      getRouteFromElement(element)
    );
  }

  function routeMatches(currentPath = "/", itemPath = "/") {
    const current = normalizeRoutePath(currentPath);
    const item = normalizeRoutePath(itemPath);

    if (!item) {
      return false;
    }

    if (item === "/") {
      return current === "/";
    }

    return (
      current === item ||
      current.startsWith(`${item}/`)
    );
  }

  function resolveActiveMenuItem(route = "") {
    const currentPath =
      normalizeRoutePath(route || getCurrentRoutePath());

    const items = getMenuItems();

    if (!items.length) {
      return null;
    }

    let exact = null;
    let partial = null;
    let partialLength = -1;

    for (const item of items) {
      const itemPath =
        getMenuItemRoute(item);

      if (!itemPath) {
        continue;
      }

      if (currentPath === itemPath) {
        exact = item;
        break;
      }

      if (
        itemPath !== "/" &&
        routeMatches(currentPath, itemPath) &&
        itemPath.length > partialLength
      ) {
        partial = item;
        partialLength = itemPath.length;
      }
    }

    return exact || partial || null;
  }

  function clearAllActiveRouteMarkers() {
    const allItems = getAllMenuItems();

    for (const item of allItems) {
      try {
        item.classList.remove(
          "active",
          "is-active",
          "router-active"
        );

        item.removeAttribute("aria-current");

        delete item.dataset.active;
      } catch {}
    }

    return allItems.length;
  }

  function syncActiveRouteMarkers(route = "") {
    refreshSidebarDomRefs();

    const currentPath =
      normalizeRoutePath(route || getCurrentRoutePath());

    const activeItem =
      resolveActiveMenuItem(currentPath);

    clearAllActiveRouteMarkers();

    if (activeItem && !isElementHiddenOrDisabled(activeItem)) {
      try {
        activeItem.classList.add(
          "active",
          "is-active"
        );

        activeItem.setAttribute(
          "aria-current",
          "page"
        );

        activeItem.dataset.active = "true";
      } catch {}
    }

    safeEmit("sidebar:active-route:synced", {
      route: currentPath,
      hasActiveItem: Boolean(activeItem),
      activeRoute:
        activeItem
          ? getMenuItemRoute(activeItem)
          : "",
    });

    return activeItem;
  }

  function clearVisualSyncTimer() {
    if (visualSyncTimer) {
      safeClearTimeout(visualSyncTimer);
      visualSyncTimer = null;
    }
  }

  function clearHoverFlushTimer() {
    if (hoverFlushTimer) {
      safeClearTimeout(hoverFlushTimer);
      hoverFlushTimer = null;
    }
  }

  function flushMenuHoverState(reason = "hover-flush", durationMs = HOVER_FLUSH_MS) {
    if (!isBrowser()) {
      return false;
    }

    const {
      body,
      sidebar,
      sidebarMenu,
    } = getElements(AppCore);

    if (!sidebarMenu) {
      return false;
    }

    clearHoverFlushTimer();

    const duration =
      clampNumber(durationMs, 16, 600);

    try {
      body?.classList?.add?.("sidebar-visual-syncing");
      sidebar?.classList?.add?.("is-visual-syncing");
      sidebarMenu?.classList?.add?.("is-visual-syncing");

      sidebarMenu.dataset.visualSyncing = "true";
      sidebarMenu.dataset.visualSyncReason = reason;

      if (!sidebarMenu.dataset.previousPointerEventsSet) {
        sidebarMenu.dataset.previousPointerEvents =
          sidebarMenu.style.pointerEvents || "__empty__";

        sidebarMenu.dataset.previousPointerEventsSet = "true";
      }

      /*
        Esto fuerza al navegador a soltar :hover real.
        Es la pieza que mata el “hover colgado” después de navegación.
      */
      sidebarMenu.style.pointerEvents = "none";

      const active = document.activeElement;

      if (
        active &&
        sidebarMenu.contains(active) &&
        typeof active.blur === "function"
      ) {
        active.blur();
      }
    } catch {}

    hoverFlushTimer = safeSetTimeout(() => {
      hoverFlushTimer = null;

      try {
        body?.classList?.remove?.("sidebar-visual-syncing");
        sidebar?.classList?.remove?.("is-visual-syncing");
        sidebarMenu?.classList?.remove?.("is-visual-syncing");

        delete sidebarMenu.dataset.visualSyncing;
        delete sidebarMenu.dataset.visualSyncReason;

        const previous =
          sidebarMenu.dataset.previousPointerEvents;

        if (!previous || previous === "__empty__") {
          sidebarMenu.style.pointerEvents = "";
        } else {
          sidebarMenu.style.pointerEvents = previous;
        }

        delete sidebarMenu.dataset.previousPointerEvents;
        delete sidebarMenu.dataset.previousPointerEventsSet;
      } catch {}
    }, duration);

    return true;
  }

  function scheduleSidebarVisualSync(reason = "visual-sync", options = {}) {
    const opts = safeObject(options);
    const delayMs = clampNumber(
      opts.delayMs,
      0,
      5000
    );

    const expectedGeneration =
      typeof opts.generation === "number"
        ? opts.generation
        : bindGeneration;

    const route =
      normalizeRoutePath(
        resolvePreferredRouteFromOptions(opts) ||
          ""
      );

    clearVisualSyncTimer();

    if (opts.flushHover !== false) {
      flushMenuHoverState(
        reason,
        opts.hoverFlushMs || HOVER_FLUSH_MS
      );
    }

    visualSyncTimer = safeSetTimeout(() => {
      visualSyncTimer = null;

      if (
        typeof expectedGeneration === "number" &&
        expectedGeneration !== bindGeneration
      ) {
        return;
      }

      afterPaint(() => {
        if (
          typeof expectedGeneration === "number" &&
          expectedGeneration !== bindGeneration
        ) {
          return;
        }

        refreshSidebarDomRefs();

        const activeItem =
          syncActiveRouteMarkers(route);

        try {
          scheduleActiveMenuIndicator(AppCore, {
            reason,
            delayMs: 0,
            reveal: opts.reveal !== false,
            force: opts.force === true,
            activeItem,
          });
        } catch {
          try {
            syncActiveMenuIndicator(AppCore, {
              reason,
              reveal: opts.reveal !== false,
              force: opts.force === true,
              activeItem,
            });
          } catch {}
        }
      });
    }, delayMs);

    return true;
  }

  function syncRouteAndIndicator(reason = "route-sync", options = {}) {
    const opts = safeObject(options);
    const route =
      normalizeRoutePath(
        resolvePreferredRouteFromOptions(opts) ||
          ""
      );

    syncActiveRouteMarkers(route);

    scheduleSidebarVisualSync(reason, {
      ...opts,
      route,
      delayMs:
        typeof opts.delayMs === "number"
          ? opts.delayMs
          : 16,
      reveal: opts.reveal !== false,
      force: opts.force === true,
    });

    return true;
  }

  /* ======================================================
     DROPDOWN
  ====================================================== */

  function closeDropdown() {
    refreshSidebarDomRefs();

    const result =
      closeDropdownBase(AppCore, runtimeState);

    scheduleSidebarVisualSync("close-dropdown", {
      delayMs: 24,
      flushHover: false,
    });

    return result;
  }

  function ensureSidebarOpenForUserMenu() {
    if (isShellBlocked()) {
      return false;
    }

    const open =
      getDesiredSidebarOpenState(AppCore);

    if (!open) {
      setSidebarOpen(true, {
        source: "ensure-user-menu",
      });

      return true;
    }

    return false;
  }

  function openDropdown() {
    if (isShellBlocked()) return false;

    refreshSidebarDomRefs();

    const result =
      openDropdownBase(
        AppCore,
        runtimeState,
        ensureSidebarOpenForUserMenu
      );

    scheduleSidebarVisualSync("open-dropdown", {
      delayMs: 32,
      flushHover: false,
    });

    return result;
  }

  function toggleDropdown() {
    if (isShellBlocked()) return false;

    refreshSidebarDomRefs();

    const result =
      toggleDropdownBase(
        AppCore,
        runtimeState,
        ensureSidebarOpenForUserMenu
      );

    scheduleSidebarVisualSync("toggle-dropdown", {
      delayMs: 32,
      flushHover: false,
    });

    return result;
  }

  /* ======================================================
     SIDEBAR STATE
  ====================================================== */

  function syncSidebarState() {
    refreshSidebarDomRefs();

    const result =
      syncSidebarStateBase(
        AppCore,
        closeDropdown
      );

    syncActiveRouteMarkers();

    return result;
  }

  function repairSidebarState(reason = "repair-sidebar-state") {
    refreshSidebarDomRefs();

    const result =
      repairSidebarStateBase(
        AppCore,
        closeDropdown
      );

    scheduleSidebarVisualSync(reason, {
      delayMs: 48,
      force: true,
    });

    return result;
  }

  function setSidebarOpen(open, options = {}) {
    if (isShellBlocked()) {
      return false;
    }

    const opts = safeObject(options);
    const nextOpen = Boolean(open);

    const previousOpen =
      getDesiredSidebarOpenState(AppCore);

    if (!nextOpen) {
      closeDropdown();
    }

    const result =
      setSidebarOpenBase(
        AppCore,
        nextOpen,
        closeDropdown
      );

    /*
      No emitimos sidebar:open:set.
      events.js ya escucha sidebar:state:change desde state.js.
      Emitir ambos provocaba doble transición / indicador flotante.
    */
    safeEmit("sidebar:ui:open:set", {
      open: nextOpen,
      previousOpen,
      changed: previousOpen !== nextOpen,
      source: opts.source || "SidebarUI",
      snapshot: getSidebarSnapshot(),
    });

    scheduleSidebarVisualSync("set-sidebar-open", {
      delayMs: previousOpen !== nextOpen
        ? VISUAL_SYNC_AFTER_TRANSITION_DELAY
        : 32,
      force: true,
      flushHover: true,
    });

    return Boolean(result);
  }

  function openSidebar() {
    if (isShellBlocked()) return false;

    return setSidebarOpen(true, {
      source: "openSidebar",
    });
  }

  function closeSidebar() {
    return setSidebarOpen(false, {
      source: "closeSidebar",
    });
  }

  function toggleSidebar() {
    if (isShellBlocked()) return false;

    const nextOpen =
      !getDesiredSidebarOpenState(AppCore);

    return setSidebarOpen(nextOpen, {
      source: "toggleSidebar",
    });
  }

  function getSidebarSnapshot() {
    const mobile = isMobileViewport(MOBILE_BREAKPOINT);
    const open = getDesiredSidebarOpenState(AppCore);
    const elements = getElements(AppCore);

    return {
      mobile,
      open,

      desktopOpen:
        typeof AppCore?.state?.sidebarDesktopOpen === "boolean"
          ? Boolean(AppCore.state.sidebarDesktopOpen)
          : open,

      mobileOpen:
        typeof AppCore?.state?.sidebarMobileOpen === "boolean"
          ? Boolean(AppCore.state.sidebarMobileOpen)
          : false,

      dropdownOpen:
        Boolean(runtimeState.dropdownOpen),

      initialized,
      eventsBound,
      logoutInFlight,
      lastBindReason,
      bindGeneration,

      isAdmin:
        isAdmin(),

      shellHidden:
        isShellHidden(AppCore),

      realShellHidden:
        isRealShellHidden(AppCore),

      hasShell:
        hasSidebarShell(AppCore),

      route:
        getCurrentRoutePath(),

      dom: {
        hasSidebar:
          Boolean(elements.sidebar),

        hasSidebarMenu:
          Boolean(elements.sidebarMenu),

        hasToggle:
          Boolean(elements.toggleBtn),

        hasMobileToggle:
          Boolean(elements.mobileToggleBtn),

        hasUserToggle:
          Boolean(elements.userToggle),

        hasUserDropdown:
          Boolean(elements.userDropdown),

        hasLogout:
          Boolean(elements.logoutBtn),
      },

      dropdownDom: {
        userToggleId:
          elements.userToggle?.id || "",

        userToggleAriaExpanded:
          elements.userToggle?.getAttribute?.("aria-expanded") || "",

        userDropdownId:
          elements.userDropdown?.id || "",

        userDropdownHidden:
          Boolean(elements.userDropdown?.hidden),

        userDropdownAriaHidden:
          elements.userDropdown?.getAttribute?.("aria-hidden") || "",

        userDropdownClassName:
          elements.userDropdown?.className || "",
      },

      activeRouteDom: {
        currentRoute:
          getCurrentRoutePath(),

        activeItems:
          getAllMenuItems()
            .filter((item) => {
              return Boolean(
                item.classList?.contains?.("active") ||
                  item.classList?.contains?.("is-active") ||
                  item.getAttribute?.("aria-current") === "page"
              );
            })
            .map((item) => ({
              route:
                getMenuItemRoute(item),

              text:
                safeText(item.textContent, ""),

              hidden:
                isElementHiddenOrDisabled(item),
            })),
      },

      indicatorDom: {
        ready:
          elements.sidebarMenu?.dataset?.indicatorReady || "",

        reason:
          elements.sidebarMenu?.dataset?.indicatorReason || "",

        route:
          elements.sidebarMenu?.dataset?.indicatorRoute || "",

        opacity:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-opacity") || "",

        x:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-x") || "",

        y:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-y") || "",

        w:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-w") || "",

        h:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-h") || "",
      },
    };
  }

  function restoreSidebarState(snapshot) {
    if (!snapshot) return false;

    const mobileNow = isMobileViewport(MOBILE_BREAKPOINT);

    if (mobileNow) {
      return false;
    }

    const desiredOpen = Boolean(
      typeof snapshot.desktopOpen === "boolean"
        ? snapshot.desktopOpen
        : snapshot.open
    );

    try {
      if (AppCore?.state && typeof AppCore.state === "object") {
        AppCore.state.sidebarDesktopOpen = desiredOpen;
        AppCore.state.sidebarOpen = desiredOpen;
        AppCore.state.sidebarMode = "desktop";
        AppCore.state.sidebarLastMode = "desktop";
      }
    } catch {}

    if (getDesiredSidebarOpenState(AppCore) === desiredOpen) {
      syncSidebarState();

      scheduleSidebarVisualSync("restore-sidebar-state:same", {
        delayMs: 48,
        force: true,
      });

      return true;
    }

    setSidebarOpen(desiredOpen, {
      source: "restoreSidebarState",
    });

    return true;
  }

  function closeSidebarOnMobileAfterNavigation() {
    return isMobileViewport(MOBILE_BREAKPOINT);
  }

  /* ======================================================
     VISIBILITY
  ====================================================== */

  function applyRoleVisibility() {
    refreshSidebarDomRefs();

    const result =
      applyRoleVisibilityBase(
        AppCore,
        null,
        isAdmin
      );

    syncActiveRouteMarkers();

    scheduleSidebarVisualSync("apply-role-visibility", {
      delayMs: 32,
      force: true,
    });

    return result;
  }

  /* ======================================================
     CLEANUP SCOPE
  ====================================================== */

  function getCleanupScope() {
    /*
      Importante:
      events.js normaliza scope con String(scope).
      Aquí usamos siempre el nombre estable SCOPE.
    */
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
    clearVisualSyncTimer();
    clearHoverFlushTimer();

    try {
      if (
        activeCleanupScope &&
        typeof AppCore?.cleanup?.run === "function"
      ) {
        AppCore.cleanup.run(activeCleanupScope);
      }
    } catch {}

    try {
      if (
        activeCleanupScope !== SCOPE &&
        typeof AppCore?.cleanup?.run === "function"
      ) {
        AppCore.cleanup.run(SCOPE);
      }
    } catch {}

    activeCleanupScope = null;
    eventsBound = false;
  }

  function cleanup() {
    cleanupBoundEvents();

    try {
      closeDropdown();
    } catch {}

    return true;
  }

  /* ======================================================
     ACTIONS
  ====================================================== */

  async function handleLogout() {
    const result =
      await handleLogoutBase({
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

    scheduleSidebarVisualSync("logout", {
      delayMs: 80,
      force: true,
    });

    return result;
  }

  async function navigateTo(route = "", options = {}) {
    const target = safeText(route, "");
    if (!target) return false;

    const opts = safeObject(options);

    try {
      if (typeof Router?.navigate === "function") {
        await Promise.resolve(
          Router.navigate(target, opts)
        );

        scheduleSidebarVisualSync("navigate:router.navigate", {
          route: target,
          delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
          force: true,
        });

        return true;
      }

      if (typeof Router?.go === "function") {
        await Promise.resolve(
          Router.go(target, opts)
        );

        scheduleSidebarVisualSync("navigate:router.go", {
          route: target,
          delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
          force: true,
        });

        return true;
      }

      if (typeof Router?.push === "function") {
        await Promise.resolve(
          Router.push(target, opts)
        );

        scheduleSidebarVisualSync("navigate:router.push", {
          route: target,
          delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
          force: true,
        });

        return true;
      }

      if (typeof AppCore?.router?.navigate === "function") {
        await Promise.resolve(
          AppCore.router.navigate(target, opts)
        );

        scheduleSidebarVisualSync("navigate:appcore.router.navigate", {
          route: target,
          delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
          force: true,
        });

        return true;
      }

      if (typeof AppCore?.navigate === "function") {
        await Promise.resolve(
          AppCore.navigate(target, opts)
        );

        scheduleSidebarVisualSync("navigate:appcore.navigate", {
          route: target,
          delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
          force: true,
        });

        return true;
      }
    } catch (error) {
      safeWarn("Navegación sidebar vía Router falló.", error);
    }

    if (!isBrowser()) {
      return false;
    }

    try {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));

      scheduleSidebarVisualSync("navigate:history", {
        route: target,
        delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
        force: true,
      });

      return true;
    } catch {}

    try {
      window.location.assign(target);
      return true;
    } catch {}

    return false;
  }

  async function handleNavigationElement(
    element = null,
    event = null,
    {
      skipNavigation = false,
    } = {}
  ) {
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

    preventDefault(event);

    closeDropdown();

    syncActiveRouteMarkers(route);

    flushMenuHoverState(
      "navigation",
      HOVER_FLUSH_MS
    );

    if (!skipNavigation) {
      await navigateTo(route, {
        source: "sidebar",
        replaceState: false,
      });
    } else {
      scheduleSidebarVisualSync("navigation-post-router", {
        route,
        delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
        force: true,
      });
    }

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
          "toggleSidebar",
          "toggleSidebarMobile",
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
          "sidebarUserToggle",
          "userToggle",
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
          "cerrar-sesion",
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

  function handleOutsideDropdownClick(event = null) {
    if (!runtimeState.dropdownOpen) {
      return false;
    }

    const {
      userDropdown,
      userToggle,
    } = getElements(AppCore);

    if (
      !containsElement(userDropdown, event?.target) &&
      !containsElement(userToggle, event?.target)
    ) {
      closeDropdown();
      return true;
    }

    return false;
  }

  function bindDirectUserToggleGuard(reason = "bind-direct-user-toggle", generation = bindGeneration) {
    const {
      userToggle,
    } = getElements(AppCore);

    if (!userToggle) {
      return () => {};
    }

    const onUserToggleClick = (event) => {
      if (generation !== bindGeneration) {
        return;
      }

      if (!initialized && !hasSidebarShell(AppCore)) {
        return;
      }

      if (!containsElement(userToggle, event?.target)) {
        return;
      }

      /*
        Listener en capture sobre el botón real.
        Evita doble toggle entre:
        - events.js document click
        - fallback delegado
        - bubbling del propio botón
      */
      markSidebarEventHandled(event, "direct-user-toggle");

      preventDefault(event);
      stopPropagation(event);
      stopImmediatePropagation(event);

      refreshSidebarDomRefs();

      toggleDropdown();

      safeEmit("sidebar:user-toggle:direct", {
        reason,
        snapshot: getSidebarSnapshot(),
      });
    };

    const onUserToggleKeydown = (event) => {
      if (generation !== bindGeneration) {
        return;
      }

      if (!containsElement(userToggle, event?.target)) {
        return;
      }

      if (
        event?.key !== "Enter" &&
        event?.key !== " " &&
        event?.key !== "ArrowDown" &&
        event?.key !== "Escape"
      ) {
        return;
      }

      markSidebarEventHandled(event, "direct-user-toggle-keydown");

      preventDefault(event);
      stopPropagation(event);
      stopImmediatePropagation(event);

      if (event.key === "Escape") {
        closeDropdown();
        return;
      }

      if (event.key === "ArrowDown") {
        openDropdown();
        return;
      }

      toggleDropdown();
    };

    try {
      userToggle.addEventListener(
        "click",
        onUserToggleClick,
        true
      );

      userToggle.addEventListener(
        "keydown",
        onUserToggleKeydown,
        true
      );
    } catch {
      return () => {};
    }

    return () => {
      try {
        userToggle.removeEventListener(
          "click",
          onUserToggleClick,
          true
        );
      } catch {}

      try {
        userToggle.removeEventListener(
          "keydown",
          onUserToggleKeydown,
          true
        );
      } catch {}
    };
  }

  function bindFallbackDomEvents(reason = "bind-fallback") {
    if (!isBrowser()) {
      return false;
    }

    cleanupFallbackDomEvents();

    const generation =
      bindGeneration;

    const directUserToggleCleanup =
      bindDirectUserToggleGuard(reason, generation);

    const onDocumentClick = async (event) => {
      if (generation !== bindGeneration) {
        return;
      }

      if (wasSidebarEventHandled(event)) {
        return;
      }

      if (!initialized && !hasSidebarShell(AppCore)) {
        return;
      }

      refreshSidebarDomRefs();

      const actionElement = getActionElementFromEvent(event);

      if (!actionElement) {
        handleOutsideDropdownClick(event);
        return;
      }

      if (!isInsideSidebarShell(actionElement)) {
        handleOutsideDropdownClick(event);
        return;
      }

      const defaultWasPrevented = Boolean(event.defaultPrevented);

      /*
        Si events.js ya procesó un control, no repetimos acción.
        Esto mata el bug de abrir/cerrar dropdown en el mismo click.
      */
      if (
        defaultWasPrevented &&
        (
          isToggleSidebarElement(actionElement) ||
          isUserDropdownElement(actionElement) ||
          isLogoutElement(actionElement)
        )
      ) {
        markSidebarEventHandled(
          event,
          "fallback-skip-default-prevented-control"
        );

        return;
      }

      if (isToggleSidebarElement(actionElement)) {
        markSidebarEventHandled(event, "fallback-toggle-sidebar");

        preventDefault(event);
        stopPropagation(event);

        toggleSidebar();

        safeEmit("sidebar:fallback:action", {
          action: "toggle-sidebar",
          reason,
        });

        return;
      }

      if (isUserDropdownElement(actionElement)) {
        markSidebarEventHandled(event, "fallback-toggle-dropdown");

        preventDefault(event);
        stopPropagation(event);

        toggleDropdown();

        safeEmit("sidebar:fallback:action", {
          action: "toggle-dropdown",
          reason,
          snapshot: getSidebarSnapshot(),
        });

        return;
      }

      if (isLogoutElement(actionElement)) {
        markSidebarEventHandled(event, "fallback-logout");

        preventDefault(event);
        stopPropagation(event);

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
            event,
            {
              skipNavigation: defaultWasPrevented,
            }
          );

        if (handled) {
          markSidebarEventHandled(event, "fallback-navigation");

          safeEmit("sidebar:fallback:action", {
            action: defaultWasPrevented
              ? "navigate-post-router"
              : "navigate",
            route: getRouteFromElement(actionElement),
            reason,
          });
        }
      }
    };

    const onDocumentKeydown = (event) => {
      if (generation !== bindGeneration) {
        return;
      }

      if (wasSidebarEventHandled(event)) {
        return;
      }

      if (event?.key === "Escape" && runtimeState.dropdownOpen) {
        closeDropdown();
      }
    };

    const onWindowResize = () => {
      if (generation !== bindGeneration) {
        return;
      }

      scheduleSidebarVisualSync("window-resize", {
        delayMs: 120,
        force: true,
        flushHover: true,
      });
    };

    const onWindowPopState = () => {
      if (generation !== bindGeneration) {
        return;
      }

      scheduleSidebarVisualSync("window-popstate", {
        delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
        force: true,
        flushHover: true,
      });
    };

    const onHashChange = () => {
      if (generation !== bindGeneration) {
        return;
      }

      scheduleSidebarVisualSync("window-hashchange", {
        delayMs: VISUAL_SYNC_AFTER_NAV_DELAY,
        force: true,
        flushHover: true,
      });
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

    try {
      window.addEventListener(
        "resize",
        onWindowResize,
        false
      );

      window.addEventListener(
        "popstate",
        onWindowPopState,
        false
      );

      window.addEventListener(
        "hashchange",
        onHashChange,
        false
      );
    } catch {}

    fallbackDomCleanup = () => {
      try {
        directUserToggleCleanup?.();
      } catch {}

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

      try {
        window.removeEventListener(
          "resize",
          onWindowResize,
          false
        );

        window.removeEventListener(
          "popstate",
          onWindowPopState,
          false
        );

        window.removeEventListener(
          "hashchange",
          onHashChange,
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

    /*
      Primero invalidamos generación vieja.
      Luego limpiamos listeners antiguos.
    */
    bindGeneration += 1;

    cleanupBoundEvents();

    const scope = getCleanupScope();

    activeCleanupScope = scope;

    try {
      bindDomEvents({
        AppCore,
        Router,
        Auth,
        state: runtimeState,
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
        state: runtimeState,
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

    scheduleSidebarVisualSync(`bind-events:${lastBindReason}`, {
      delayMs: 64,
      force: true,
      flushHover: false,
      generation: bindGeneration,
    });

    safeEmit("sidebar:events:bound", {
      reason: lastBindReason,
      generation: bindGeneration,
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

    try {
      sanitizeFooterTooltipState(AppCore);
    } catch {}

    syncSidebarState();
    renderUser();
    applyRoleVisibility();

    syncRouteAndIndicator(`refresh:${reason}`, {
      delayMs: VISUAL_SYNC_DEFAULT_DELAY,
      force: true,
    });

    safeEmit("sidebar:refreshed", {
      reason,
      snapshot: getSidebarSnapshot(),
    });

    return api;
  }

  function repair(reason = "repair") {
    const mounted = mountAndRefresh();

    if (!mounted) {
      safeWarn("No se pudo reparar sidebar: shell ausente.", {
        reason,
      });

      return api;
    }

    ensureRuntimeStateDefaults();

    try {
      sanitizeFooterTooltipState(AppCore);
    } catch {}

    repairSidebarState(`repair:${reason}`);
    renderUser();
    applyRoleVisibility();

    bindEvents(reason);

    initialized = true;

    syncRouteAndIndicator(`repair:${reason}`, {
      delayMs: 32,
      force: true,
    });

    afterPaint(() => {
      syncRouteAndIndicator(`repair:${reason}:after-paint`, {
        delayMs: 0,
        force: true,
      });
    });

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
      if (
        AppCore?.modules &&
        typeof AppCore.modules.has === "function" &&
        typeof AppCore.modules.register === "function"
      ) {
        if (!AppCore.modules.has("sidebar")) {
          AppCore.modules.register("sidebar", api);
        }

        if (!AppCore.modules.has("SidebarUI")) {
          AppCore.modules.register("SidebarUI", api);
        }

        return true;
      }
    } catch {}

    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules.register === "function"
      ) {
        AppCore.modules.register("sidebar", api);
        AppCore.modules.register("SidebarUI", api);
        return true;
      }
    } catch {}

    try {
      if (
        AppCore?.modules &&
        typeof AppCore.modules.set === "function"
      ) {
        AppCore.modules.set("sidebar", api);
        AppCore.modules.set("SidebarUI", api);
        return true;
      }
    } catch {}

    try {
      AppCore.modules = AppCore.modules || {};
      AppCore.modules.sidebar = api;
      AppCore.modules.SidebarUI = api;
      return true;
    } catch {}

    return false;
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

    try {
      sanitizeFooterTooltipState(AppCore);
    } catch {}

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

    syncRouteAndIndicator("init", {
      delayMs: 32,
      force: true,
      flushHover: false,
    });

    afterPaint(() => {
      syncRouteAndIndicator("init:after-paint", {
        delayMs: 0,
        force: true,
        flushHover: false,
      });
    });

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
    runtimeState.dropdownOpen = false;
    lastBindReason = "";
    bindGeneration += 1;

    safeEmit("sidebar:destroyed", {
      initialized: false,
    });

    return api;
  }

  /* ======================================================
     DEBUG
  ====================================================== */

  function debugDropdown() {
    refreshSidebarDomRefs();

    const {
      userToggle,
      userDropdown,
    } = getElements(AppCore);

    const snapshot = {
      stateDropdownOpen:
        Boolean(runtimeState.dropdownOpen),

      hasUserToggle:
        Boolean(userToggle),

      hasUserDropdown:
        Boolean(userDropdown),

      userToggleId:
        userToggle?.id || "",

      userToggleClassName:
        userToggle?.className || "",

      userToggleAriaExpanded:
        userToggle?.getAttribute?.("aria-expanded") || "",

      userToggleHidden:
        Boolean(userToggle?.hidden),

      userToggleInert:
        Boolean(userToggle?.hasAttribute?.("inert")),

      userToggleParentHidden:
        Boolean(
          userToggle?.closest?.("[hidden],[inert],[aria-hidden='true']")
        ),

      userDropdownId:
        userDropdown?.id || "",

      userDropdownClassName:
        userDropdown?.className || "",

      userDropdownHidden:
        Boolean(userDropdown?.hidden),

      userDropdownAriaHidden:
        userDropdown?.getAttribute?.("aria-hidden") || "",

      userDropdownInert:
        Boolean(userDropdown?.hasAttribute?.("inert")),

      userDropdownParentHidden:
        Boolean(
          userDropdown?.closest?.("[hidden],[inert],[aria-hidden='true']")
        ),

      sidebarSnapshot:
        getSidebarSnapshot(),
    };

    try {
      console.log("[SidebarUI:dropdown]", snapshot);
    } catch {}

    return snapshot;
  }

  function debugIndicator() {
    refreshSidebarDomRefs();

    const {
      sidebarMenu,
    } = getElements(AppCore);

    const activeItem =
      resolveActiveMenuItem();

    const snapshot = {
      route:
        getCurrentRoutePath(),

      browserRoute:
        normalizeRoutePath(getBrowserPath()),

      stateRoute:
        normalizeRoutePath(AppCore?.state?.route || ""),

      statePublicPath:
        normalizeRoutePath(AppCore?.state?.publicPath || ""),

      routerPublicPath:
        normalizeRoutePath(Router?.getCurrentPublicPath?.() || ""),

      hasSidebarMenu:
        Boolean(sidebarMenu),

      hasActiveItem:
        Boolean(activeItem),

      activeRoute:
        activeItem
          ? getMenuItemRoute(activeItem)
          : "",

      activeText:
        safeText(activeItem?.textContent, ""),

      indicatorReady:
        sidebarMenu?.dataset?.indicatorReady || "",

      indicatorReason:
        sidebarMenu?.dataset?.indicatorReason || "",

      indicatorRoute:
        sidebarMenu?.dataset?.indicatorRoute || "",

      visualSyncing:
        sidebarMenu?.dataset?.visualSyncing || "",

      variables: {
        x:
          sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-x") || "",

        y:
          sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-y") || "",

        w:
          sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-w") || "",

        h:
          sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-h") || "",

        opacity:
          sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-opacity") || "",
      },

      menuItems:
        getAllMenuItems().map((item) => ({
          route:
            getMenuItemRoute(item),

          rawRoute:
            getRouteFromElement(item),

          text:
            safeText(item.textContent, ""),

          hidden:
            isElementHiddenOrDisabled(item),

          active:
            item.classList?.contains?.("active") ||
            item.classList?.contains?.("is-active") ||
            item.getAttribute?.("aria-current") === "page",
        })),
    };

    try {
      console.log("[SidebarUI:indicator]", snapshot);
    } catch {}

    return snapshot;
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
    repairSidebarState,

    openDropdown,
    closeDropdown,
    toggleDropdown,

    openSidebar,
    closeSidebar,
    toggleSidebar,
    setSidebarOpen,

    updateToggleLabel: () =>
      updateToggleLabel(AppCore),

    syncIndicator:
      (reason = "api:syncIndicator") =>
        scheduleSidebarVisualSync(reason, {
          delayMs: 0,
          force: true,
        }),

    syncRouteAndIndicator,

    scheduleIndicatorSync:
      scheduleSidebarVisualSync,

    flushHover:
      flushMenuHoverState,

    handleLogout,

    isAdmin,

    debugDropdown,
    debugIndicator,

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
