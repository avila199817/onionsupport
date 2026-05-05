/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar/index.js

   FINAL EXTREME SYSTEM · SIDEBAR UI ORCHESTRATOR · 14/10
   ORCHESTRATOR ONLY · STATE.JS OWNER · EVENTS.JS OWNER · ACTIONS.JS OWNER
   DESKTOP/MOBILE STABLE · DROPDOWN SAFE · BIND DEDUPE
   ACTIVE ROUTE HARDENED · APPLE INDICATOR · NO STALE ROUTE
   NO DOUBLE TOGGLE · NO DOUBLE NAVIGATION · NO POINTER-EVENTS NONE

   RESPONSABILIDADES:
   - montar sidebar
   - registrar módulo en AppCore.modules
   - mantener referencias DOM sincronizadas
   - renderizar usuario/avatar
   - aplicar visibilidad por rol/admin
   - exponer API pública estable
   - delegar estado visual en state.js
   - delegar dropdown en dropdown.js
   - delegar acciones de negocio en actions.js
   - delegar eventos DOM/core/router en events.js
   - sincronizar item activo delegando en state.js
   - sincronizar indicador activo delegando en state.js
   - reparar DOM tras login/restore/router render sin duplicar binds
   - evitar tormentas de bind/repair/init
   - evitar pointer-events:none colgado en .sidebar-menu
   - no escribir variables CSS del indicador desde index.js
   - no gestionar transición visual propia desde index.js

   REGLA DE ARQUITECTURA:
   - template.js  = DOM base
   - dom.js       = refs / mount / sanitation
   - state.js     = estado visual sidebar + active item + indicator
   - dropdown.js  = dropdown usuario
   - visibility.js= permisos/rol
   - actions.js   = acciones de negocio
   - events.js    = listeners DOM/core/router
   - index.js     = orquestador público
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
  repairSidebarState as repairSidebarStateBase,
  syncActiveMenuItem,
  scheduleActiveMenuIndicator,
} from "./state.js";

import {
  openDropdown as openDropdownBase,
  closeDropdown as closeDropdownBase,
  toggleDropdown as toggleDropdownBase,
  repairDropdown as repairDropdownBase,
  getDropdownSnapshot,
} from "./dropdown.js";

import {
  applyRoleVisibility as applyRoleVisibilityBase,
} from "./visibility.js";

import {
  setSidebarOpen as actionSetSidebarOpen,
  openSidebar as actionOpenSidebar,
  closeSidebar as actionCloseSidebar,
  toggleSidebar as actionToggleSidebar,
  collapseSidebar as actionCollapseSidebar,
  expandSidebar as actionExpandSidebar,
  ensureSidebarOpenForUserMenu as actionEnsureSidebarOpenForUserMenu,
  closeSidebarOnMobileAfterNavigation as actionCloseSidebarOnMobileAfterNavigation,
  navigateFromSidebar as actionNavigateFromSidebar,
  handleLogout as handleLogoutBase,
  getSidebarActionsSnapshot,
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

  const SOURCE = "SidebarUI";

  const BIND_DEDUP_WINDOW_MS = 250;
  const REPAIR_DEDUP_WINDOW_MS = 180;

  const INDICATOR_DELAY_INIT_MS = 32;
  const INDICATOR_DELAY_REFRESH_MS = 40;
  const INDICATOR_DELAY_REPAIR_MS = 48;
  const INDICATOR_DELAY_ROUTE_MS = 56;
  const INDICATOR_DELAY_TRANSITION_MS = 420;

  let initialized = false;
  let logoutInFlight = false;

  let eventsBound = false;
  let bindingEvents = false;

  let bindGeneration = 0;
  let lastBindAt = 0;
  let lastBindReason = "";

  let lastRepairAt = 0;
  let lastRepairReason = "";

  let domEventsCleanup = null;
  let coreEventsCleanup = null;

  let visualSyncTimer = null;
  let repairTimer = null;

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

  function hasWindow() {
    return typeof window !== "undefined";
  }

  function nowTs() {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text || fallback;
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function safeArray(value) {
    return Array.isArray(value)
      ? value
      : [];
  }

  function safeBoolean(value, fallback = false) {
    if (typeof value === "boolean") {
      return value;
    }

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

  function isFunction(value) {
    return typeof value === "function";
  }

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
      ) {
        continue;
      }

      return value;
    }

    return null;
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

  /*
    Importante:
    No emitimos por AppCore.events Y window a la vez.
    events.js escucha el bus cuando existe.
  */
  function safeEmit(eventName = "", payload = {}) {
    const name = safeText(eventName, "");

    if (!name) {
      return false;
    }

    const finalPayload = {
      source: SOURCE,
      ...safeObject(payload),
    };

    try {
      if (isFunction(AppCore?.events?.emit)) {
        AppCore.events.emit(name, finalPayload);
        return true;
      }
    } catch (error) {
      safeWarn(`AppCore.events.emit("${name}") falló.`, error);
    }

    try {
      if (isBrowser() && typeof CustomEvent !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(name, {
            detail: finalPayload,
          })
        );

        return true;
      }
    } catch {}

    return false;
  }

  function safeSetTimeout(callback, ms = 0) {
    if (!isFunction(callback)) {
      return null;
    }

    const delay = clampNumber(ms, 0, 60000);

    if (!hasWindow()) {
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
      }, delay);
    } catch {
      try {
        callback();
      } catch {}

      return null;
    }
  }

  function safeClearTimeout(timer) {
    if (!timer || !hasWindow()) {
      return false;
    }

    try {
      window.clearTimeout(timer);
      return true;
    } catch {
      return false;
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

    safeSetTimeout(callback, 0);
  }

  function containsElement(parent = null, child = null) {
    if (!parent || !child) {
      return false;
    }

    try {
      return parent === child || parent.contains(child);
    } catch {
      return false;
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

  function clearVisualSyncTimer() {
    if (visualSyncTimer) {
      safeClearTimeout(visualSyncTimer);
      visualSyncTimer = null;
    }

    return true;
  }

  function clearRepairTimer() {
    if (repairTimer) {
      safeClearTimeout(repairTimer);
      repairTimer = null;
    }

    return true;
  }

  /* ======================================================
     SHELL / DOM
  ====================================================== */

  function isShellBlocked() {
    try {
      return Boolean(isRealShellHidden(AppCore));
    } catch {}

    try {
      return Boolean(isShellHidden(AppCore));
    } catch {
      return false;
    }
  }

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

    return el;
  }

  function refreshSidebarDomRefs() {
    try {
      cacheDomRefs(AppCore);
    } catch {}

    return syncSidebarDomIntoAppCore();
  }

  function mountAndRefresh(reason = "mount") {
    try {
      mountSidebar(AppCore);
    } catch (error) {
      safeWarn("mountSidebar falló.", error);
    }

    const elements = refreshSidebarDomRefs();

    ensureMenuInteractive(`mount:${reason}`);

    return {
      mounted: hasSidebarShell(AppCore),
      elements,
    };
  }

  function ensureRuntimeStateDefaults() {
    const mobile = isMobileViewport(MOBILE_BREAKPOINT);

    try {
      if (!AppCore.state || typeof AppCore.state !== "object") {
        AppCore.state = {};
      }

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

  function ensureMenuInteractive(reason = "ensure-menu-interactive") {
    if (!isBrowser()) {
      return false;
    }

    const {
      sidebarMenu,
    } = getElements(AppCore);

    if (!sidebarMenu) {
      return false;
    }

    let repaired = false;

    try {
      /*
        Nunca se debe usar pointer-events:none en el menú.
        Si quedó de CSS/JS legacy, lo saneamos aquí.
      */
      if (sidebarMenu.style.pointerEvents === "none") {
        sidebarMenu.style.pointerEvents = "";
        repaired = true;
      }

      if (sidebarMenu.hasAttribute("inert")) {
        sidebarMenu.removeAttribute("inert");
        repaired = true;
      }

      if (sidebarMenu.getAttribute("aria-disabled") === "true") {
        sidebarMenu.removeAttribute("aria-disabled");
        repaired = true;
      }

      if (sidebarMenu.dataset.visualSyncing === "true") {
        delete sidebarMenu.dataset.visualSyncing;
        delete sidebarMenu.dataset.visualSyncReason;
        repaired = true;
      }

      sidebarMenu.classList?.remove?.("is-visual-syncing");
    } catch {}

    if (repaired) {
      safeEmit("sidebar:menu:interaction-restored", {
        reason,
        snapshot: getSidebarSnapshot(),
      });
    }

    return repaired;
  }

  function sanitizeSidebarDom(reason = "sanitize") {
    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    try {
      sanitizeFooterTooltipState(AppCore);
    } catch {}

    return true;
  }

  /* ======================================================
     ROUTE HELPERS · LIGHTWEIGHT ONLY
     state.js/events.js hacen la resolución fuerte.
  ====================================================== */

  function normalizeRoutePath(value = "") {
    const raw = safeText(value, "");

    if (!raw) {
      return "";
    }

    try {
      if (isBrowser()) {
        const url = new URL(raw, window.location.origin);

        if (
          url.hash &&
          (
            url.hash.startsWith("#/") ||
            url.hash.startsWith("#!")
          )
        ) {
          return url.hash
            .replace(/^#!\/?/, "/")
            .replace(/^#\/?/, "/") || "/";
        }

        return `${url.pathname || "/"}${url.search || ""}`;
      }
    } catch {}

    if (raw.startsWith("#/") || raw.startsWith("#!")) {
      return raw
        .replace(/^#!\/?/, "/")
        .replace(/^#\/?/, "/") || "/";
    }

    if (raw.startsWith("/")) {
      return raw;
    }

    return `/${raw}`;
  }

  function getBrowserPath() {
    if (!isBrowser()) {
      return "/";
    }

    try {
      const hash = window.location.hash || "";

      if (
        hash.startsWith("#/") ||
        hash.startsWith("#!")
      ) {
        return normalizeRoutePath(hash) || "/";
      }

      return normalizeRoutePath(
        `${window.location.pathname || "/"}${window.location.search || ""}`
      ) || "/";
    } catch {
      return "/";
    }
  }

  function resolveRoutePayload(options = {}) {
    const opts = safeObject(options);
    const payload = safeObject(opts.payload);

    const route =
      first(
        opts.publicPath,
        opts.route,
        opts.path,
        opts.canonicalPath,

        payload.publicPath,
        payload.path,
        payload.requestedPath,
        payload.canonicalPath,
        payload.to,
        payload.url,
        payload.route,

        getBrowserPath(),
        AppCore?.state?.publicPath,
        AppCore?.state?.route,
        AppCore?.state?.canonicalPath
      ) || "/";

    const normalized = normalizeRoutePath(route) || "/";

    return {
      ...payload,
      ...opts,
      route: normalized,
      publicPath: normalized,
      path: normalized,
      currentPublicPath: normalized,
    };
  }

  function getRouteFromElement(element = null) {
    if (!element) {
      return "";
    }

    return safeText(
      first(
        element.dataset?.route,
        element.dataset?.href,
        element.dataset?.to,
        element.getAttribute?.("data-route"),
        element.getAttribute?.("data-href"),
        element.getAttribute?.("data-to"),
        element.getAttribute?.("href")
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
        ".menu-item",
        "a[data-sidebar-nav='true']",
        "a[data-sidebar-item='true']",
        "a[data-spa]",
        "a[data-route]",
        "a[data-href]",
        "a[data-to]",
      ].join(",")
    );
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
     USER RENDER
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

        userToggle.setAttribute("aria-haspopup", "menu");

        userToggle.removeAttribute("title");
        userToggle.removeAttribute("data-tooltip");
        userToggle.removeAttribute("aria-describedby");

        if (
          userDropdown?.id &&
          !userToggle.getAttribute("aria-controls")
        ) {
          userToggle.setAttribute("aria-controls", userDropdown.id);
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
     VISIBILITY
  ====================================================== */

  function applyRoleVisibility() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("apply-role-visibility");

    const result = applyRoleVisibilityBase(
      AppCore,
      null,
      isAdmin
    );

    scheduleRouteAndIndicator("apply-role-visibility", {
      delayMs: INDICATOR_DELAY_REFRESH_MS,
      force: true,
    });

    return result;
  }

  /* ======================================================
     STATE / INDICATOR
  ====================================================== */

  function syncSidebarState() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("sync-sidebar-state");

    const result = syncSidebarStateBase(
      AppCore,
      closeDropdown
    );

    return result;
  }

  function repairSidebarState(reason = "repair-sidebar-state") {
    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    const result = repairSidebarStateBase(
      AppCore,
      closeDropdown
    );

    scheduleRouteAndIndicator(reason, {
      delayMs: INDICATOR_DELAY_REPAIR_MS,
      force: true,
    });

    return result;
  }

  function syncRouteAndIndicator(reason = "route-sync", options = {}) {
    const opts = safeObject(options);
    const payload = resolveRoutePayload(opts);

    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    const activeItem = syncActiveMenuItem(
      AppCore,
      {
        ...payload,
        reason,
        mutate: true,
        preferExplicitRoute: opts.preferExplicitRoute === true,
        forceRoute: opts.forceRoute === true,
      }
    );

    scheduleActiveMenuIndicator(
      AppCore,
      {
        ...payload,
        reason,
        activeItem,
        delayMs:
          typeof opts.delayMs === "number"
            ? opts.delayMs
            : INDICATOR_DELAY_ROUTE_MS,
        reveal: opts.reveal !== false,
        force: opts.force === true,
        preferExplicitRoute: opts.preferExplicitRoute === true,
        forceRoute: opts.forceRoute === true,
      }
    );

    safeEmit("sidebar:route-indicator:sync", {
      reason,
      route: payload.route,
      hasActiveItem: Boolean(activeItem),
    });

    return activeItem;
  }

  function scheduleRouteAndIndicator(reason = "scheduled-route-sync", options = {}) {
    const opts = safeObject(options);
    const generation = bindGeneration;

    clearVisualSyncTimer();

    visualSyncTimer = safeSetTimeout(() => {
      visualSyncTimer = null;

      if (
        opts.bindGenerationSafe !== false &&
        generation !== bindGeneration
      ) {
        return;
      }

      afterPaint(() => {
        if (
          opts.bindGenerationSafe !== false &&
          generation !== bindGeneration
        ) {
          return;
        }

        syncRouteAndIndicator(reason, opts);
      });
    }, clampNumber(opts.delayMs, 0, 5000));

    return true;
  }

  /* ======================================================
     DROPDOWN
  ====================================================== */

  function ensureSidebarOpenForUserMenu() {
    return actionEnsureSidebarOpenForUserMenu({
      AppCore,
      closeDropdown,
      syncSidebarState,
      reason: "ensure-sidebar-open-for-user-menu",
    });
  }

  function openDropdown(options = {}) {
    if (isShellBlocked()) {
      return false;
    }

    refreshSidebarDomRefs();
    ensureMenuInteractive("open-dropdown");

    const result = openDropdownBase(
      AppCore,
      runtimeState,
      ensureSidebarOpenForUserMenu,
      safeObject(options)
    );

    scheduleRouteAndIndicator("open-dropdown", {
      delayMs: 32,
      force: false,
    });

    return result;
  }

  function closeDropdown(options = {}) {
    refreshSidebarDomRefs();
    ensureMenuInteractive("close-dropdown");

    const result = closeDropdownBase(
      AppCore,
      runtimeState,
      safeObject(options)
    );

    scheduleRouteAndIndicator("close-dropdown", {
      delayMs: 24,
      force: false,
    });

    return result;
  }

  function toggleDropdown(options = {}) {
    if (isShellBlocked()) {
      return false;
    }

    refreshSidebarDomRefs();
    ensureMenuInteractive("toggle-dropdown");

    const result = toggleDropdownBase(
      AppCore,
      runtimeState,
      ensureSidebarOpenForUserMenu,
      safeObject(options)
    );

    scheduleRouteAndIndicator("toggle-dropdown", {
      delayMs: 32,
      force: false,
    });

    return result;
  }

  function repairDropdown(reason = "repair-dropdown") {
    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    const result = repairDropdownBase(
      AppCore,
      runtimeState,
      {
        emit: true,
        reason,
      }
    );

    return result;
  }

  /* ======================================================
     SIDEBAR ACTION WRAPPERS
  ====================================================== */

  function setSidebarOpen(open, options = {}) {
    const opts = safeObject(options);

    const result = actionSetSidebarOpen({
      AppCore,
      open: Boolean(open),
      closeDropdown,
      syncSidebarState,
      reason: safeText(opts.reason || opts.source, "set-sidebar-open"),
    });

    scheduleRouteAndIndicator("set-sidebar-open", {
      delayMs: INDICATOR_DELAY_TRANSITION_MS,
      force: true,
    });

    return result;
  }

  function openSidebar(options = {}) {
    const opts = safeObject(options);

    const result = actionOpenSidebar({
      AppCore,
      closeDropdown,
      syncSidebarState,
      reason: safeText(opts.reason || opts.source, "open-sidebar"),
    });

    scheduleRouteAndIndicator("open-sidebar", {
      delayMs: INDICATOR_DELAY_TRANSITION_MS,
      force: true,
    });

    return result;
  }

  function closeSidebar(options = {}) {
    const opts = safeObject(options);

    const result = actionCloseSidebar({
      AppCore,
      closeDropdown,
      syncSidebarState,
      reason: safeText(opts.reason || opts.source, "close-sidebar"),
    });

    scheduleRouteAndIndicator("close-sidebar", {
      delayMs: INDICATOR_DELAY_TRANSITION_MS,
      force: true,
    });

    return result;
  }

  function toggleSidebar(options = {}) {
    const opts = safeObject(options);

    const result = actionToggleSidebar({
      AppCore,
      closeDropdown,
      syncSidebarState,
      reason: safeText(opts.reason || opts.source, "toggle-sidebar"),
    });

    scheduleRouteAndIndicator("toggle-sidebar", {
      delayMs: INDICATOR_DELAY_TRANSITION_MS,
      force: true,
    });

    return result;
  }

  function collapseSidebar(options = {}) {
    const opts = safeObject(options);

    const result = actionCollapseSidebar({
      AppCore,
      closeDropdown,
      syncSidebarState,
      reason: safeText(opts.reason || opts.source, "collapse-sidebar"),
    });

    scheduleRouteAndIndicator("collapse-sidebar", {
      delayMs: INDICATOR_DELAY_TRANSITION_MS,
      force: true,
    });

    return result;
  }

  function expandSidebar(options = {}) {
    const opts = safeObject(options);

    const result = actionExpandSidebar({
      AppCore,
      closeDropdown,
      syncSidebarState,
      reason: safeText(opts.reason || opts.source, "expand-sidebar"),
    });

    scheduleRouteAndIndicator("expand-sidebar", {
      delayMs: INDICATOR_DELAY_TRANSITION_MS,
      force: true,
    });

    return result;
  }

  function closeSidebarOnMobileAfterNavigation(options = {}) {
    const opts = safeObject(options);

    return actionCloseSidebarOnMobileAfterNavigation({
      AppCore,
      closeDropdown,
      syncSidebarState,
      reason: safeText(opts.reason || opts.source, "mobile-navigation"),
    });
  }

  async function navigateTo(route = "", options = {}) {
    const target = normalizeRoutePath(route);

    if (!target) {
      return false;
    }

    const result = await actionNavigateFromSidebar({
      AppCore,
      Router,
      target,
      closeDropdown,
      closeSidebarOnMobile: true,
      syncSidebarState,
      replace: options?.replace === true || options?.replaceState === true,
      source: safeText(options?.source, "sidebar-ui"),
    });

    scheduleRouteAndIndicator("navigate-to", {
      route: target,
      publicPath: target,
      path: target,
      delayMs: INDICATOR_DELAY_ROUTE_MS,
      force: true,
      preferExplicitRoute: true,
      forceRoute: true,
    });

    return result;
  }

  /* ======================================================
     LOGOUT
  ====================================================== */

  function setLogoutInFlight(value) {
    logoutInFlight = Boolean(value);
  }

  function isLogoutInFlight() {
    return logoutInFlight;
  }

  async function handleLogout() {
    const result = await handleLogoutBase({
      AppCore,
      Auth,
      Router,
      closeDropdown,
      renderUser,
      applyRoleVisibility,
      closeSidebarOnMobileAfterNavigation,
      syncSidebarState,
      getElements: () => getElements(AppCore),
      setLogoutInFlight,
      isLogoutInFlight,
    });

    scheduleRouteAndIndicator("logout", {
      delayMs: 80,
      force: true,
    });

    return result;
  }

  /* ======================================================
     CLEANUP / EVENTS
  ====================================================== */

  function cleanupBoundEvents() {
    clearVisualSyncTimer();
    clearRepairTimer();

    try {
      domEventsCleanup?.();
    } catch {}

    try {
      coreEventsCleanup?.();
    } catch {}

    domEventsCleanup = null;
    coreEventsCleanup = null;

    eventsBound = false;
    bindingEvents = false;

    ensureMenuInteractive("cleanup-bound-events");

    return true;
  }

  function cleanup() {
    cleanupBoundEvents();

    try {
      closeDropdown({
        force: true,
        reason: "sidebar-cleanup",
      });
    } catch {}

    ensureMenuInteractive("cleanup");

    return true;
  }

  function bindEvents(reason = "bind", options = {}) {
    const opts = safeObject(options);
    const cleanReason = safeText(reason, "bind");
    const ts = nowTs();

    lastBindReason = cleanReason;

    const {
      mounted,
    } = mountAndRefresh(cleanReason);

    if (!mounted) {
      safeWarn("No se pudo bindear sidebar: shell ausente.", {
        reason: cleanReason,
      });

      return api;
    }

    ensureMenuInteractive(`bind-events:${cleanReason}`);

    if (
      eventsBound &&
      opts.force !== true
    ) {
      scheduleRouteAndIndicator(`bind-events:already-bound:${cleanReason}`, {
        delayMs: INDICATOR_DELAY_REFRESH_MS,
        force: true,
      });

      safeEmit("sidebar:events:bind-skipped", {
        reason: cleanReason,
        cause: "already-bound",
        generation: bindGeneration,
        sinceLastBindMs: ts - lastBindAt,
        snapshot: getSidebarSnapshot(),
      });

      return api;
    }

    if (bindingEvents) {
      safeEmit("sidebar:events:bind-ignored", {
        reason: cleanReason,
        cause: "binding-in-progress",
        generation: bindGeneration,
      });

      return api;
    }

    if (
      ts - lastBindAt < BIND_DEDUP_WINDOW_MS &&
      opts.force !== true
    ) {
      safeEmit("sidebar:events:bind-ignored", {
        reason: cleanReason,
        cause: "dedupe-window",
        sinceLastBindMs: ts - lastBindAt,
        generation: bindGeneration,
      });

      return api;
    }

    bindingEvents = true;

    try {
      bindGeneration += 1;

      cleanupBoundEvents();

      try {
        domEventsCleanup = bindDomEvents({
          AppCore,
          Router,
          Auth,
          state: runtimeState,
          scope: SCOPE,
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
          isMobileViewport: () => isMobileViewport(MOBILE_BREAKPOINT),
          getDesiredSidebarOpenState: () => getDesiredSidebarOpenState(AppCore),
        }) || null;
      } catch (error) {
        safeWarn("bindDomEvents falló.", error);
      }

      try {
        coreEventsCleanup = bindCoreEvents({
          AppCore,
          Router,
          Auth,
          state: runtimeState,
          scope: SCOPE,
          api,

          renderUser,
          applyRoleVisibility,
          syncSidebarState,
          closeDropdown,
          closeSidebarOnMobileAfterNavigation,

          getSidebarSnapshot,
          restoreSidebarState,
          getElements: () => getElements(AppCore),
        }) || null;
      } catch (error) {
        safeWarn("bindCoreEvents falló.", error);
      }

      eventsBound = true;
      lastBindAt = nowTs();

      ensureMenuInteractive(`bind-events:${cleanReason}:after`);

      scheduleRouteAndIndicator(`bind-events:${cleanReason}`, {
        delayMs: 64,
        force: true,
      });

      safeEmit("sidebar:events:bound", {
        reason: cleanReason,
        generation: bindGeneration,
        scope: SCOPE,
        snapshot: getSidebarSnapshot(),
      });

      return api;
    } finally {
      bindingEvents = false;
    }
  }

  function rebindEvents(reason = "rebind") {
    return bindEvents(reason, {
      force: true,
    });
  }

  /* ======================================================
     REFRESH / REPAIR
  ====================================================== */

  function refresh(reason = "refresh") {
    const cleanReason = safeText(reason, "refresh");

    mountAndRefresh(cleanReason);
    ensureRuntimeStateDefaults();

    sanitizeSidebarDom(`refresh:${cleanReason}`);

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    repairDropdown(`refresh:${cleanReason}`);

    scheduleRouteAndIndicator(`refresh:${cleanReason}`, {
      delayMs: INDICATOR_DELAY_REFRESH_MS,
      force: true,
    });

    safeEmit("sidebar:refreshed", {
      reason: cleanReason,
      snapshot: getSidebarSnapshot(),
    });

    return api;
  }

  function repair(reason = "repair", options = {}) {
    const opts = safeObject(options);
    const cleanReason = safeText(reason, "repair");
    const ts = nowTs();

    if (
      opts.force !== true &&
      ts - lastRepairAt < REPAIR_DEDUP_WINDOW_MS
    ) {
      scheduleRouteAndIndicator(`repair:deduped:${cleanReason}`, {
        delayMs: INDICATOR_DELAY_REPAIR_MS,
        force: true,
      });

      safeEmit("sidebar:repair:deduped", {
        reason: cleanReason,
        sinceLastRepairMs: ts - lastRepairAt,
        lastRepairReason,
        snapshot: getSidebarSnapshot(),
      });

      return api;
    }

    lastRepairAt = ts;
    lastRepairReason = cleanReason;

    const {
      mounted,
    } = mountAndRefresh(cleanReason);

    if (!mounted) {
      safeWarn("No se pudo reparar sidebar: shell ausente.", {
        reason: cleanReason,
      });

      return api;
    }

    ensureRuntimeStateDefaults();
    sanitizeSidebarDom(`repair:${cleanReason}`);

    repairSidebarState(`repair:${cleanReason}`);
    repairDropdown(`repair:${cleanReason}`);

    renderUser();
    applyRoleVisibility();

    if (opts.rebind === true) {
      bindEvents(`repair:${cleanReason}`, {
        force: true,
      });
    } else if (!eventsBound) {
      bindEvents(`repair:${cleanReason}`);
    }

    initialized = true;

    scheduleRouteAndIndicator(`repair:${cleanReason}`, {
      delayMs: INDICATOR_DELAY_REPAIR_MS,
      force: true,
    });

    afterPaint(() => {
      ensureMenuInteractive(`repair:${cleanReason}:after-paint`);

      syncRouteAndIndicator(`repair:${cleanReason}:after-paint`, {
        delayMs: 0,
        force: true,
      });
    });

    safeEmit("sidebar:repaired", {
      reason: cleanReason,
      snapshot: getSidebarSnapshot(),
      isAdmin: isAdmin(),
    });

    return api;
  }

  function scheduleRepair(reason = "scheduled-repair", options = {}) {
    const opts = safeObject(options);
    const delayMs = clampNumber(opts.delayMs, 0, 1000);

    clearRepairTimer();

    repairTimer = safeSetTimeout(() => {
      repairTimer = null;

      repair(reason, {
        ...opts,
        force: opts.force === true,
      });
    }, delayMs);

    return api;
  }

  function restoreSidebarState(snapshot = null) {
    const data = safeObject(snapshot);

    if (!data || !Object.keys(data).length) {
      return false;
    }

    if (isMobileViewport(MOBILE_BREAKPOINT)) {
      return false;
    }

    const desiredOpen = Boolean(
      typeof data.desktopOpen === "boolean"
        ? data.desktopOpen
        : data.open
    );

    try {
      if (AppCore?.state && typeof AppCore.state === "object") {
        AppCore.state.sidebarDesktopOpen = desiredOpen;
        AppCore.state.sidebarOpen = desiredOpen;
        AppCore.state.sidebarMode = "desktop";
        AppCore.state.sidebarLastMode = "desktop";
      }
    } catch {}

    const result = actionSetSidebarOpen({
      AppCore,
      open: desiredOpen,
      closeDropdown,
      syncSidebarState,
      reason: "restore-sidebar-state",
    });

    scheduleRouteAndIndicator("restore-sidebar-state", {
      delayMs: INDICATOR_DELAY_TRANSITION_MS,
      force: true,
    });

    return result;
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

  function exposeGlobalBridge() {
    if (!isBrowser()) {
      return false;
    }

    try {
      window.SidebarUI = api;
      window.OnionSidebarUI = api;
      return true;
    } catch {
      return false;
    }
  }

  /* ======================================================
     INIT / DESTROY
  ====================================================== */

  function init() {
    if (initialized) {
      registerModule();
      exposeGlobalBridge();

      return refresh("init-already-initialized");
    }

    const {
      mounted,
    } = mountAndRefresh("init");

    if (!mounted) {
      safeWarn("No se pudo montar sidebar.");
      return api;
    }

    ensureRuntimeStateDefaults();
    sanitizeSidebarDom("init");

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    repairDropdown("init");
    closeDropdown({
      force: true,
      reason: "init",
    });

    initialized = true;

    registerModule();
    exposeGlobalBridge();

    bindEvents("init");

    scheduleRouteAndIndicator("init", {
      delayMs: INDICATOR_DELAY_INIT_MS,
      force: true,
    });

    afterPaint(() => {
      ensureMenuInteractive("init:after-paint");

      syncRouteAndIndicator("init:after-paint", {
        delayMs: 0,
        force: true,
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

    bindGeneration += 1;
    lastBindAt = 0;
    lastBindReason = "";

    lastRepairAt = 0;
    lastRepairReason = "";

    ensureMenuInteractive("destroy");

    safeEmit("sidebar:destroyed", {
      initialized: false,
    });

    return api;
  }

  /* ======================================================
     DEBUG / SNAPSHOT
  ====================================================== */

  function getSidebarSnapshot() {
    const elements = getElements(AppCore);

    let mobile = false;
    let open = true;

    try {
      mobile = isMobileViewport(MOBILE_BREAKPOINT);
    } catch {}

    try {
      open = getDesiredSidebarOpenState(AppCore);
    } catch {}

    const activeItems = getAllMenuItems()
      .filter((item) => {
        return Boolean(
          item.classList?.contains?.("active") ||
            item.classList?.contains?.("is-active") ||
            item.classList?.contains?.("router-active") ||
            item.getAttribute?.("aria-current") === "page" ||
            item.dataset?.active === "true"
        );
      })
      .map((item) => ({
        route: normalizeRoutePath(getRouteFromElement(item)),
        rawRoute: getRouteFromElement(item),
        text: safeText(item.textContent, ""),
        hidden: Boolean(
          item.hidden ||
            item.closest?.("[hidden],[inert],[aria-hidden='true']")
        ),
      }));

    return {
      initialized,
      eventsBound,
      bindingEvents,

      bindGeneration,
      lastBindAt,
      lastBindReason,

      lastRepairAt,
      lastRepairReason,

      logoutInFlight,

      mobile,
      open,

      desktopOpen:
        typeof AppCore?.state?.sidebarDesktopOpen === "boolean"
          ? Boolean(AppCore.state.sidebarDesktopOpen)
          : null,

      mobileOpen:
        typeof AppCore?.state?.sidebarMobileOpen === "boolean"
          ? Boolean(AppCore.state.sidebarMobileOpen)
          : null,

      dropdownOpen: Boolean(runtimeState.dropdownOpen),

      isAdmin: isAdmin(),

      shellHidden: (() => {
        try {
          return Boolean(isShellHidden(AppCore));
        } catch {
          return false;
        }
      })(),

      realShellHidden: (() => {
        try {
          return Boolean(isRealShellHidden(AppCore));
        } catch {
          return false;
        }
      })(),

      hasShell: (() => {
        try {
          return Boolean(hasSidebarShell(AppCore));
        } catch {
          return false;
        }
      })(),

      route: {
        browser: getBrowserPath(),
        appRoute: AppCore?.state?.route || "",
        appPublicPath: AppCore?.state?.publicPath || "",
        appCanonicalPath: AppCore?.state?.canonicalPath || "",
        routerPublicPath: (() => {
          try {
            return Router?.getCurrentPublicPath?.() || "";
          } catch {
            return "";
          }
        })(),
      },

      dom: {
        hasSidebar: Boolean(elements.sidebar),
        hasSidebarMenu: Boolean(elements.sidebarMenu),
        hasToggle: Boolean(elements.toggleBtn),
        hasMobileToggle: Boolean(elements.mobileToggleBtn),
        hasUserToggle: Boolean(elements.userToggle),
        hasUserDropdown: Boolean(elements.userDropdown),
        hasLogout: Boolean(elements.logoutBtn),

        sidebarHidden: Boolean(elements.sidebar?.hidden),
        sidebarAriaHidden: elements.sidebar?.getAttribute?.("aria-hidden") || "",
        sidebarClassName: elements.sidebar?.className || "",

        sidebarMenuPointerEvents: elements.sidebarMenu?.style?.pointerEvents || "",
        sidebarMenuInert: Boolean(elements.sidebarMenu?.hasAttribute?.("inert")),
        sidebarMenuAriaDisabled: elements.sidebarMenu?.getAttribute?.("aria-disabled") || "",
      },

      dropdown: {
        ...safeObject(getDropdownSnapshot(AppCore, runtimeState)),
      },

      activeRoute: {
        activeItems,
      },

      indicator: {
        ready: elements.sidebarMenu?.dataset?.indicatorReady || "",
        reason: elements.sidebarMenu?.dataset?.indicatorReason || "",
        route: elements.sidebarMenu?.dataset?.indicatorRoute || "",
        current: elements.sidebarMenu?.dataset?.indicatorCurrent || "",

        x: elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-x") || "",
        y: elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-y") || "",
        w: elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-w") || "",
        h: elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-h") || "",
        opacity: elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-opacity") || "",
      },

      actions: safeObject(getSidebarActionsSnapshot()),
    };
  }

  function debugDropdown() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("debug-dropdown");

    const snapshot = getDropdownSnapshot(AppCore, runtimeState);

    try {
      console.log("[SidebarUI:dropdown]", snapshot);
    } catch {}

    return snapshot;
  }

  function debugIndicator() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("debug-indicator");

    const payload = resolveRoutePayload({
      reason: "debug-indicator",
      force: true,
    });

    const activeItem = syncActiveMenuItem(
      AppCore,
      {
        ...payload,
        reason: "debug-indicator",
        mutate: false,
      }
    );

    const {
      sidebarMenu,
    } = getElements(AppCore);

    const snapshot = {
      route: payload.route,
      browserRoute: getBrowserPath(),

      hasSidebarMenu: Boolean(sidebarMenu),
      hasActiveItem: Boolean(activeItem),

      activeRoute: activeItem
        ? normalizeRoutePath(getRouteFromElement(activeItem))
        : "",

      activeText: safeText(activeItem?.textContent, ""),

      indicatorReady: sidebarMenu?.dataset?.indicatorReady || "",
      indicatorReason: sidebarMenu?.dataset?.indicatorReason || "",
      indicatorRoute: sidebarMenu?.dataset?.indicatorRoute || "",
      indicatorCurrent: sidebarMenu?.dataset?.indicatorCurrent || "",

      variables: {
        x: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-x") || "",
        y: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-y") || "",
        w: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-w") || "",
        h: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-h") || "",
        opacity: sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-opacity") || "",
      },

      menuItems: getAllMenuItems().map((item) => ({
        route: normalizeRoutePath(getRouteFromElement(item)),
        rawRoute: getRouteFromElement(item),
        text: safeText(item.textContent, ""),
        active: Boolean(
          item.classList?.contains?.("active") ||
            item.classList?.contains?.("is-active") ||
            item.classList?.contains?.("router-active") ||
            item.getAttribute?.("aria-current") === "page" ||
            item.dataset?.active === "true"
        ),
      })),
    };

    try {
      console.log("[SidebarUI:indicator]", snapshot);
    } catch {}

    return snapshot;
  }

  function debug() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("debug");

    const snapshot = getSidebarSnapshot();

    try {
      console.log("[SidebarUI]", snapshot);
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

    refresh,
    repair,
    scheduleRepair,

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
    repairDropdown,

    setSidebarOpen,
    openSidebar,
    closeSidebar,
    toggleSidebar,
    collapseSidebar,
    expandSidebar,

    ensureSidebarOpenForUserMenu,
    closeSidebarOnMobileAfterNavigation,

    navigateTo,
    navigate: navigateTo,

    handleLogout,

    updateToggleLabel: () => updateToggleLabel(AppCore),

    syncRouteAndIndicator,

    syncIndicator: (reason = "api:syncIndicator") =>
      scheduleRouteAndIndicator(reason, {
        delayMs: 0,
        force: true,
      }),

    scheduleIndicatorSync: scheduleRouteAndIndicator,

    ensureMenuInteractive,
    sanitizeSidebarDom,

    isAdmin,

    debug,
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

    get logoutInFlight() {
      return logoutInFlight;
    },
  };

  return api;
})();

export default SidebarUI;
