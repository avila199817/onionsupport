/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar/index.js

   ONION SUPPORT · SIDEBAR UI ORCHESTRATOR · 15/10
   ORCHESTRATOR ONLY · STATE OWNER · EVENTS OWNER · ACTIONS OWNER

   RESPONSABILIDADES:
   - Montar sidebar.
   - Registrar módulo en AppCore.modules sin duplicidades.
   - Mantener referencias DOM sincronizadas.
   - Renderizar usuario/avatar delegando en user.js.
   - Aplicar visibilidad por rol/admin delegando en visibility.js.
   - Exponer API pública estable.
   - Delegar estado visual en state.js.
   - Delegar dropdown en dropdown.js.
   - Delegar acciones de negocio en actions.js.
   - Delegar eventos DOM/core/router en events.js.
   - Sincronizar item activo delegando en state.js.
   - Sincronizar indicador activo delegando en state.js.
   - Reparar DOM tras login/restore/router render sin duplicar binds.
   - Evitar tormentas de bind/repair/init.
   - Evitar pointer-events:none colgado en .sidebar-menu.
   - No escribir variables CSS del indicador desde index.js.
   - No gestionar transición visual propia desde index.js.
   - No registrar módulos si ya existe el mismo objeto.
   - No llamar refresh pesado en sync/render normales.

   REGLA DE ARQUITECTURA:
   - template.js   = DOM base.
   - dom.js        = refs / mount / sanitation.
   - state.js      = estado visual sidebar + active item + indicator.
   - dropdown.js   = dropdown usuario.
   - user.js       = identidad/avatar/footer.
   - visibility.js = permisos/rol.
   - actions.js    = acciones de negocio.
   - events.js     = listeners DOM/core/router.
   - index.js      = orquestador público.
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
  isRealShellHidden as isDomRealShellHidden,
  sanitizeFooterTooltipState,
  getSidebarDomSnapshot,
} from "./dom.js";

import {
  renderUser as renderUserBase,
  isAdmin as isAdminBase,
  getSidebarUserSnapshot,
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
  getSidebarStateSnapshot,
  resetSidebarStateRuntime,
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
  getRoleVisibilitySnapshot,
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
  disposeSidebarEvents,
  getSidebarEventsSnapshot,
} from "./events.js";

export const SIDEBAR_UI_VERSION =
  "sidebar-ui-v15-orchestrator-only";

export const SidebarUI = (() => {
  "use strict";

  /* ======================================================
     INTERNAL STATE
  ====================================================== */

  const SOURCE =
    "SidebarUI";

  const OWNER =
    "index.js";

  const LOG_PREFIX =
    "[SidebarUI]";

  const BIND_DEDUP_WINDOW_MS =
    250;

  const REPAIR_DEDUP_WINDOW_MS =
    180;

  const SYNC_DEDUP_WINDOW_MS =
    90;

  const INDICATOR_DELAY_INIT_MS =
    32;

  const INDICATOR_DELAY_REFRESH_MS =
    40;

  const INDICATOR_DELAY_REPAIR_MS =
    48;

  const INDICATOR_DELAY_ROUTE_MS =
    56;

  const INDICATOR_DELAY_TRANSITION_MS =
    420;

  const MODULE_NAMES =
    Object.freeze([
      "sidebar",
      "SidebarUI",
      "sidebarUI",
    ]);

  let initialized =
    false;

  let logoutInFlight =
    false;

  let eventsBound =
    false;

  let bindingEvents =
    false;

  let bindGeneration =
    0;

  let lastBindAt =
    0;

  let lastBindReason =
    "";

  let lastRepairAt =
    0;

  let lastRepairReason =
    "";

  let lastSyncAt =
    0;

  let lastSyncReason =
    "";

  let domEventsCleanup =
    null;

  let coreEventsCleanup =
    null;

  let visualSyncTimer =
    null;

  let repairTimer =
    null;

  const runtimeState =
    {
      dropdownOpen:
        false,
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

  function safeIsoDate(ms = nowTs()) {
    try {
      return new Date(ms).toISOString();
    } catch {
      return "";
    }
  }

  function safeText(value, fallback = "") {
    if (
      value === null ||
      value === undefined
    ) {
      return fallback;
    }

    const text =
      String(value)
        .replace(/[\r\n\t]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return text || fallback;
  }

  function safeObject(value) {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    )
      ? value
      : {};
  }

  function safeBoolean(value, fallback = false) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const key =
        value
          .trim()
          .toLowerCase();

      if (
        [
          "true",
          "1",
          "yes",
          "si",
          "sí",
          "ok",
          "on",
        ].includes(key)
      ) {
        return true;
      }

      if (
        [
          "false",
          "0",
          "no",
          "off",
        ].includes(key)
      ) {
        return false;
      }
    }

    if (typeof value === "number") {
      if (value === 1) {
        return true;
      }

      if (value === 0) {
        return false;
      }
    }

    return fallback;
  }

  function safeNumber(value, fallback = 0) {
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
    const number =
      safeNumber(value, min);

    return Math.min(
      Math.max(number, min),
      max
    );
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function first(...values) {
    for (const value of values) {
      if (
        value === undefined ||
        value === null
      ) {
        continue;
      }

      if (
        typeof value === "string" &&
        value.trim() === ""
      ) {
        continue;
      }

      if (
        Array.isArray(value) &&
        value.length === 0
      ) {
        continue;
      }

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
    let logged =
      false;

    try {
      if (isFunction(AppCore?.utils?.warn)) {
        AppCore.utils.warn(
          LOG_PREFIX,
          ...args
        );

        logged =
          true;
      }
    } catch {
      logged =
        false;
    }

    if (logged) {
      return;
    }

    try {
      console.warn(
        LOG_PREFIX,
        ...args
      );
    } catch {}
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(
        LOG_PREFIX,
        ...args
      );
    } catch {}
  }

  /*
    Importante:
    No emitimos por AppCore.events Y window a la vez.
    events.js escucha el bus cuando existe.
  */
  function safeEmit(eventName = "", payload = {}) {
    const name =
      safeText(eventName, "");

    if (!name) {
      return false;
    }

    const data =
      safeObject(payload);

    const finalPayload =
      {
        ...data,

        source:
          safeText(data.source, SOURCE),

        owner:
          OWNER,

        version:
          SIDEBAR_UI_VERSION,

        at:
          safeText(data.at, safeIsoDate()),

        ts:
          data.ts || nowTs(),
      };

    try {
      if (isFunction(AppCore?.events?.emit)) {
        AppCore.events.emit(
          name,
          finalPayload
        );

        return true;
      }
    } catch (error) {
      safeWarn(
        `AppCore.events.emit("${name}") falló.`,
        error
      );
    }

    try {
      if (
        isBrowser() &&
        typeof CustomEvent !== "undefined"
      ) {
        window.dispatchEvent(
          new CustomEvent(
            name,
            {
              detail:
                finalPayload,
            }
          )
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

    const delay =
      clampNumber(
        ms,
        0,
        60000
      );

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
    if (
      !timer ||
      !hasWindow()
    ) {
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

    safeSetTimeout(
      callback,
      0
    );
  }

  function queryAll(root = null, selector = "") {
    if (
      !root ||
      !selector
    ) {
      return [];
    }

    try {
      return Array.from(
        root.querySelectorAll(selector)
      );
    } catch {
      return [];
    }
  }

  function clearVisualSyncTimer() {
    if (visualSyncTimer) {
      safeClearTimeout(visualSyncTimer);
      visualSyncTimer =
        null;
    }

    return true;
  }

  function clearRepairTimer() {
    if (repairTimer) {
      safeClearTimeout(repairTimer);
      repairTimer =
        null;
    }

    return true;
  }

  /* ======================================================
     SHELL / DOM
  ====================================================== */

  function isShellBlocked() {
    try {
      return Boolean(
        isRealShellHidden(AppCore)
      );
    } catch {}

    try {
      return Boolean(
        isDomRealShellHidden(AppCore)
      );
    } catch {}

    try {
      return Boolean(
        isShellHidden(AppCore)
      );
    } catch {
      return false;
    }
  }

  function syncSidebarDomIntoAppCore() {
    const el =
      getElements(AppCore);

    try {
      if (
        !AppCore.dom ||
        typeof AppCore.dom !== "object"
      ) {
        AppCore.dom =
          {};
      }

      AppCore.dom.sidebar =
        el.sidebar || null;

      AppCore.dom.sidebarRoot =
        el.sidebar || null;

      AppCore.dom.sidebarMount =
        el.sidebarMount || null;

      AppCore.dom.sidebarMenu =
        el.sidebarMenu || null;

      AppCore.dom.sidebarRecents =
        el.sidebarRecents || null;

      AppCore.dom.sidebarAvatar =
        el.avatarEl || null;

      AppCore.dom.sidebarAvatarImage =
        el.avatarImage || null;

      AppCore.dom.sidebarAvatarFallback =
        el.avatarFallback || null;

      AppCore.dom.sidebarName =
        el.nameEl || null;

      AppCore.dom.sidebarUserPlan =
        el.planEl || null;

      AppCore.dom.sidebarLogo =
        el.logoEl || null;

      AppCore.dom.userToggle =
        el.userToggle || null;

      AppCore.dom.userDropdown =
        el.userDropdown || null;

      AppCore.dom.logoutBtn =
        el.logoutBtn || null;

      AppCore.dom.sidebarToggle =
        el.sidebarToggle || el.toggleBtn || null;

      AppCore.dom.toggleBtn =
        el.sidebarToggle || el.toggleBtn || null;

      AppCore.dom.sidebarMobileToggle =
        el.mobileToggleBtn || null;

      AppCore.dom.mobileSidebarToggle =
        el.mobileToggleBtn || null;

      AppCore.dom.serverLink =
        el.serverLink || null;
    } catch {}

    return el;
  }

  function refreshSidebarDomRefs() {
    try {
      cacheDomRefs(AppCore);
    } catch {}

    return syncSidebarDomIntoAppCore();
  }

  function ensureMenuInteractive(reason = "ensure-menu-interactive") {
    if (!isBrowser()) {
      return false;
    }

    const {
      sidebarMenu,
    } =
      getElements(AppCore);

    if (!sidebarMenu) {
      return false;
    }

    let repaired =
      false;

    try {
      if (sidebarMenu.style.pointerEvents === "none") {
        sidebarMenu.style.pointerEvents =
          "";

        repaired =
          true;
      }

      if (sidebarMenu.hasAttribute("inert")) {
        sidebarMenu.removeAttribute("inert");
        repaired =
          true;
      }

      if (sidebarMenu.getAttribute("aria-disabled") === "true") {
        sidebarMenu.removeAttribute("aria-disabled");
        repaired =
          true;
      }

      if (sidebarMenu.dataset.visualSyncing === "true") {
        delete sidebarMenu.dataset.visualSyncing;
        delete sidebarMenu.dataset.visualSyncReason;
        repaired =
          true;
      }

      sidebarMenu.classList?.remove?.(
        "is-visual-syncing"
      );
    } catch {}

    if (repaired) {
      safeEmit(
        "sidebar:menu:interaction-restored",
        {
          reason,
          snapshot:
            getSidebarSnapshot(),
        }
      );
    }

    return repaired;
  }

  function mountAndRefresh(reason = "mount") {
    try {
      mountSidebar(
        AppCore,
        {
          reason,
        }
      );
    } catch (error) {
      safeWarn(
        "mountSidebar falló.",
        error
      );
    }

    const elements =
      refreshSidebarDomRefs();

    ensureMenuInteractive(
      `mount:${reason}`
    );

    return {
      mounted:
        hasSidebarShell(AppCore),

      elements,
    };
  }

  function ensureRuntimeStateDefaults() {
    const mobile =
      isMobileViewport(MOBILE_BREAKPOINT);

    try {
      if (
        !AppCore.state ||
        typeof AppCore.state !== "object"
      ) {
        AppCore.state =
          {};
      }

      const desiredOpen =
        getDesiredSidebarOpenState(AppCore);

      if (typeof AppCore.state.sidebarDesktopOpen !== "boolean") {
        AppCore.state.sidebarDesktopOpen =
          mobile
            ? true
            : Boolean(desiredOpen);
      }

      if (typeof AppCore.state.sidebarMobileOpen !== "boolean") {
        AppCore.state.sidebarMobileOpen =
          false;
      }

      AppCore.state.sidebarOpen =
        mobile
          ? Boolean(AppCore.state.sidebarMobileOpen)
          : Boolean(AppCore.state.sidebarDesktopOpen);

      AppCore.state.sidebarMode =
        mobile
          ? "mobile"
          : "desktop";

      AppCore.state.sidebarLastMode =
        AppCore.state.sidebarMode;

      return AppCore.state;
    } catch {
      return {};
    }
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
  ====================================================== */

  function normalizeRoutePath(value = "") {
    const raw =
      safeText(value, "");

    if (!raw) {
      return "";
    }

    try {
      if (isBrowser()) {
        const url =
          new URL(
            raw,
            window.location.origin
          );

        if (
          url.hash &&
          (
            url.hash.startsWith("#/") ||
            url.hash.startsWith("#!")
          )
        ) {
          return (
            url.hash
              .replace(/^#!\/?/, "/")
              .replace(/^#\/?/, "/") ||
            "/"
          );
        }

        return `${url.pathname || "/"}${url.search || ""}`;
      }
    } catch {}

    if (
      raw.startsWith("#/") ||
      raw.startsWith("#!")
    ) {
      return (
        raw
          .replace(/^#!\/?/, "/")
          .replace(/^#\/?/, "/") ||
        "/"
      );
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
      const hash =
        window.location.hash || "";

      if (
        hash.startsWith("#/") ||
        hash.startsWith("#!")
      ) {
        return normalizeRoutePath(hash) || "/";
      }

      return (
        normalizeRoutePath(
          `${window.location.pathname || "/"}${window.location.search || ""}`
        ) || "/"
      );
    } catch {
      return "/";
    }
  }

  function resolveRoutePayload(options = {}) {
    const opts =
      safeObject(options);

    const payload =
      safeObject(opts.payload);

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

        Router?.getCurrentPublicPath?.(),
        AppCore?.state?.publicPath,
        AppCore?.state?.route,
        AppCore?.state?.canonicalPath,
        getBrowserPath()
      ) || "/";

    const normalized =
      normalizeRoutePath(route) || "/";

    return {
      ...payload,
      ...opts,

      route:
        normalized,

      publicPath:
        normalized,

      path:
        normalized,

      currentPublicPath:
        normalized,
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
    } =
      getElements(AppCore);

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
     USER / ROLE
  ====================================================== */

  function isAdmin() {
    try {
      return Boolean(
        isAdminBase(AppCore)
      );
    } catch {
      return false;
    }
  }

  function renderUser() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("render-user");

    try {
      return renderUserBase(AppCore);
    } catch (error) {
      safeWarn(
        "renderUserBase falló.",
        error
      );

      return false;
    }
  }

  /* ======================================================
     VISIBILITY
  ====================================================== */

  function applyRoleVisibility() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("apply-role-visibility");

    const result =
      applyRoleVisibilityBase(
        AppCore,
        null,
        isAdmin
      );

    scheduleRouteAndIndicator(
      "apply-role-visibility",
      {
        delayMs:
          INDICATOR_DELAY_REFRESH_MS,

        force:
          true,
      }
    );

    return result;
  }

  /* ======================================================
     STATE / INDICATOR
  ====================================================== */

  function syncSidebarState() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("sync-sidebar-state");

    return syncSidebarStateBase(
      AppCore,
      closeDropdown
    );
  }

  function repairSidebarState(reason = "repair-sidebar-state") {
    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    const result =
      repairSidebarStateBase(
        AppCore,
        closeDropdown
      );

    scheduleRouteAndIndicator(
      reason,
      {
        delayMs:
          INDICATOR_DELAY_REPAIR_MS,

        force:
          true,
      }
    );

    return result;
  }

  function syncRouteAndIndicator(reason = "route-sync", options = {}) {
    const opts =
      safeObject(options);

    const payload =
      resolveRoutePayload(opts);

    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    const activeItem =
      syncActiveMenuItem(
        AppCore,
        {
          ...payload,

          reason,
          mutate:
            true,

          preferExplicitRoute:
            opts.preferExplicitRoute === true,

          forceRoute:
            opts.forceRoute === true,
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

        reveal:
          opts.reveal !== false,

        force:
          opts.force === true,

        preferExplicitRoute:
          opts.preferExplicitRoute === true,

        forceRoute:
          opts.forceRoute === true,
      }
    );

    safeEmit(
      "sidebar:route-indicator:sync",
      {
        reason,
        route:
          payload.route,
        hasActiveItem:
          Boolean(activeItem),
      }
    );

    return activeItem;
  }

  function scheduleRouteAndIndicator(reason = "scheduled-route-sync", options = {}) {
    const opts =
      safeObject(options);

    const generation =
      bindGeneration;

    clearVisualSyncTimer();

    visualSyncTimer =
      safeSetTimeout(() => {
        visualSyncTimer =
          null;

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

          syncRouteAndIndicator(
            reason,
            opts
          );
        });
      }, clampNumber(opts.delayMs, 0, 5000));

    return true;
  }

  /* ======================================================
     DROPDOWN
  ====================================================== */

  function ensureSidebarOpenForUserMenu(options = {}) {
    const opts =
      safeObject(options);

    return actionEnsureSidebarOpenForUserMenu(
      {
        AppCore,
        closeDropdown,
        syncSidebarState,
        reason:
          safeText(
            opts.reason || opts.source,
            "ensure-sidebar-open-for-user-menu"
          ),
      }
    );
  }

  function openDropdown(options = {}) {
    const opts =
      safeObject(options);

    if (isShellBlocked()) {
      return false;
    }

    refreshSidebarDomRefs();
    ensureMenuInteractive("open-dropdown");

    const result =
      openDropdownBase(
        AppCore,
        runtimeState,
        ensureSidebarOpenForUserMenu,
        opts
      );

    scheduleRouteAndIndicator(
      "open-dropdown",
      {
        delayMs:
          32,

        force:
          false,
      }
    );

    return result;
  }

  function closeDropdown(options = {}) {
    const opts =
      safeObject(options);

    refreshSidebarDomRefs();
    ensureMenuInteractive("close-dropdown");

    const result =
      closeDropdownBase(
        AppCore,
        runtimeState,
        opts
      );

    scheduleRouteAndIndicator(
      "close-dropdown",
      {
        delayMs:
          24,

        force:
          false,
      }
    );

    return result;
  }

  function toggleDropdown(options = {}) {
    const opts =
      safeObject(options);

    if (isShellBlocked()) {
      return false;
    }

    refreshSidebarDomRefs();
    ensureMenuInteractive("toggle-dropdown");

    const result =
      toggleDropdownBase(
        AppCore,
        runtimeState,
        ensureSidebarOpenForUserMenu,
        opts
      );

    scheduleRouteAndIndicator(
      "toggle-dropdown",
      {
        delayMs:
          32,

        force:
          false,
      }
    );

    return result;
  }

  function repairDropdown(reason = "repair-dropdown") {
    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    return repairDropdownBase(
      AppCore,
      runtimeState,
      {
        emit:
          true,

        reason,
      }
    );
  }

  /* ======================================================
     SIDEBAR ACTION WRAPPERS
  ====================================================== */

  function setSidebarOpen(open, options = {}) {
    const opts =
      safeObject(options);

    const result =
      actionSetSidebarOpen(
        {
          AppCore,
          open:
            Boolean(open),
          closeDropdown,
          syncSidebarState,
          reason:
            safeText(
              opts.reason || opts.source,
              "set-sidebar-open"
            ),
        }
      );

    scheduleRouteAndIndicator(
      "set-sidebar-open",
      {
        delayMs:
          INDICATOR_DELAY_TRANSITION_MS,

        force:
          true,
      }
    );

    return result;
  }

  function openSidebar(options = {}) {
    const opts =
      safeObject(options);

    const result =
      actionOpenSidebar(
        {
          AppCore,
          closeDropdown,
          syncSidebarState,
          reason:
            safeText(
              opts.reason || opts.source,
              "open-sidebar"
            ),
        }
      );

    scheduleRouteAndIndicator(
      "open-sidebar",
      {
        delayMs:
          INDICATOR_DELAY_TRANSITION_MS,

        force:
          true,
      }
    );

    return result;
  }

  function closeSidebar(options = {}) {
    const opts =
      safeObject(options);

    const result =
      actionCloseSidebar(
        {
          AppCore,
          closeDropdown,
          syncSidebarState,
          reason:
            safeText(
              opts.reason || opts.source,
              "close-sidebar"
            ),
        }
      );

    scheduleRouteAndIndicator(
      "close-sidebar",
      {
        delayMs:
          INDICATOR_DELAY_TRANSITION_MS,

        force:
          true,
      }
    );

    return result;
  }

  function toggleSidebar(options = {}) {
    const opts =
      safeObject(options);

    const result =
      actionToggleSidebar(
        {
          AppCore,
          closeDropdown,
          syncSidebarState,
          reason:
            safeText(
              opts.reason || opts.source,
              "toggle-sidebar"
            ),
        }
      );

    scheduleRouteAndIndicator(
      "toggle-sidebar",
      {
        delayMs:
          INDICATOR_DELAY_TRANSITION_MS,

        force:
          true,
      }
    );

    return result;
  }

  function collapseSidebar(options = {}) {
    const opts =
      safeObject(options);

    const result =
      actionCollapseSidebar(
        {
          AppCore,
          closeDropdown,
          syncSidebarState,
          reason:
            safeText(
              opts.reason || opts.source,
              "collapse-sidebar"
            ),
        }
      );

    scheduleRouteAndIndicator(
      "collapse-sidebar",
      {
        delayMs:
          INDICATOR_DELAY_TRANSITION_MS,

        force:
          true,
      }
    );

    return result;
  }

  function expandSidebar(options = {}) {
    const opts =
      safeObject(options);

    const result =
      actionExpandSidebar(
        {
          AppCore,
          closeDropdown,
          syncSidebarState,
          reason:
            safeText(
              opts.reason || opts.source,
              "expand-sidebar"
            ),
        }
      );

    scheduleRouteAndIndicator(
      "expand-sidebar",
      {
        delayMs:
          INDICATOR_DELAY_TRANSITION_MS,

        force:
          true,
      }
    );

    return result;
  }

  function closeSidebarOnMobileAfterNavigation(options = {}) {
    const opts =
      safeObject(options);

    return actionCloseSidebarOnMobileAfterNavigation(
      {
        AppCore,
        closeDropdown,
        syncSidebarState,
        reason:
          safeText(
            opts.reason || opts.source,
            "mobile-navigation"
          ),
      }
    );
  }

  async function navigateTo(route = "", options = {}) {
    const opts =
      safeObject(options);

    const target =
      normalizeRoutePath(route);

    if (!target) {
      return false;
    }

    const result =
      await actionNavigateFromSidebar(
        {
          AppCore,
          Router,
          target,
          closeDropdown,
          closeSidebarOnMobile:
            true,
          syncSidebarState,
          replace:
            opts.replace === true ||
            opts.replaceState === true,
          source:
            safeText(
              opts.source,
              "sidebar-ui"
            ),
        }
      );

    scheduleRouteAndIndicator(
      "navigate-to",
      {
        route:
          target,

        publicPath:
          target,

        path:
          target,

        delayMs:
          INDICATOR_DELAY_ROUTE_MS,

        force:
          true,

        preferExplicitRoute:
          true,

        forceRoute:
          true,
      }
    );

    return result;
  }

  /* ======================================================
     LOGOUT
  ====================================================== */

  function setLogoutInFlight(value) {
    logoutInFlight =
      Boolean(value);
  }

  function isLogoutInFlight() {
    return logoutInFlight;
  }

  async function handleLogout() {
    const result =
      await handleLogoutBase(
        {
          AppCore,
          Auth,
          Router,
          closeDropdown,
          renderUser,
          applyRoleVisibility,
          closeSidebarOnMobileAfterNavigation,
          syncSidebarState,
          getElements:
            () => getElements(AppCore),
          setLogoutInFlight,
          isLogoutInFlight,
        }
      );

    scheduleRouteAndIndicator(
      "logout",
      {
        delayMs:
          80,

        force:
          true,
      }
    );

    return result;
  }

  /* ======================================================
     CLEANUP / EVENTS
  ====================================================== */

  function cleanupBoundEvents(options = {}) {
    const opts =
      safeObject(options);

    clearVisualSyncTimer();
    clearRepairTimer();

    try {
      domEventsCleanup?.();
    } catch {}

    try {
      coreEventsCleanup?.();
    } catch {}

    try {
      disposeSidebarEvents(SCOPE);
    } catch {}

    domEventsCleanup =
      null;

    coreEventsCleanup =
      null;

    eventsBound =
      false;

    if (opts.preserveBindingFlag !== true) {
      bindingEvents =
        false;
    }

    ensureMenuInteractive("cleanup-bound-events");

    return true;
  }

  function cleanup() {
    cleanupBoundEvents();

    try {
      closeDropdown(
        {
          force:
            true,

          reason:
            "sidebar-cleanup",
        }
      );
    } catch {}

    ensureMenuInteractive("cleanup");

    return true;
  }

  function bindEvents(reason = "bind", options = {}) {
    const opts =
      safeObject(options);

    const cleanReason =
      safeText(reason, "bind");

    const ts =
      nowTs();

    lastBindReason =
      cleanReason;

    const {
      mounted,
    } =
      mountAndRefresh(cleanReason);

    if (!mounted) {
      safeWarn(
        "No se pudo bindear sidebar: shell ausente.",
        {
          reason:
            cleanReason,
        }
      );

      return api;
    }

    ensureMenuInteractive(
      `bind-events:${cleanReason}`
    );

    if (
      eventsBound &&
      opts.force !== true
    ) {
      scheduleRouteAndIndicator(
        `bind-events:already-bound:${cleanReason}`,
        {
          delayMs:
            INDICATOR_DELAY_REFRESH_MS,

          force:
            true,
        }
      );

      safeEmit(
        "sidebar:events:bind-skipped",
        {
          reason:
            cleanReason,

          cause:
            "already-bound",

          generation:
            bindGeneration,

          sinceLastBindMs:
            ts - lastBindAt,

          snapshot:
            getSidebarSnapshot(),
        }
      );

      return api;
    }

    if (bindingEvents) {
      safeEmit(
        "sidebar:events:bind-ignored",
        {
          reason:
            cleanReason,

          cause:
            "binding-in-progress",

          generation:
            bindGeneration,
        }
      );

      return api;
    }

    if (
      ts - lastBindAt < BIND_DEDUP_WINDOW_MS &&
      opts.force !== true
    ) {
      safeEmit(
        "sidebar:events:bind-ignored",
        {
          reason:
            cleanReason,

          cause:
            "dedupe-window",

          sinceLastBindMs:
            ts - lastBindAt,

          generation:
            bindGeneration,
        }
      );

      return api;
    }

    bindingEvents =
      true;

    try {
      bindGeneration += 1;

      cleanupBoundEvents(
        {
          preserveBindingFlag:
            true,
        }
      );

      try {
        domEventsCleanup =
          bindDomEvents(
            {
              AppCore,
              Router,
              Auth,
              state:
                runtimeState,
              scope:
                SCOPE,
              api,

              handleLogout,
              toggleSidebar,
              toggleDropdown,
              openDropdown,
              closeDropdown,
              closeSidebar,
              closeSidebarOnMobileAfterNavigation,
              syncSidebarState,

              getElements:
                () => getElements(AppCore),

              isMobileViewport:
                () => isMobileViewport(MOBILE_BREAKPOINT),

              getDesiredSidebarOpenState:
                () => getDesiredSidebarOpenState(AppCore),
            }
          ) || null;
      } catch (error) {
        safeWarn(
          "bindDomEvents falló.",
          error
        );
      }

      try {
        coreEventsCleanup =
          bindCoreEvents(
            {
              AppCore,
              Router,
              Auth,
              state:
                runtimeState,
              scope:
                SCOPE,
              api,

              renderUser,
              applyRoleVisibility,
              syncSidebarState,
              closeDropdown,
              closeSidebarOnMobileAfterNavigation,

              getSidebarSnapshot,
              restoreSidebarState,

              getElements:
                () => getElements(AppCore),
            }
          ) || null;
      } catch (error) {
        safeWarn(
          "bindCoreEvents falló.",
          error
        );
      }

      eventsBound =
        Boolean(
          domEventsCleanup ||
          coreEventsCleanup
        );

      lastBindAt =
        nowTs();

      ensureMenuInteractive(
        `bind-events:${cleanReason}:after`
      );

      scheduleRouteAndIndicator(
        `bind-events:${cleanReason}`,
        {
          delayMs:
            64,

          force:
            true,
        }
      );

      safeEmit(
        "sidebar:events:bound",
        {
          reason:
            cleanReason,

          generation:
            bindGeneration,

          scope:
            SCOPE,

          domBound:
            Boolean(domEventsCleanup),

          coreBound:
            Boolean(coreEventsCleanup),

          eventsBound:
            Boolean(eventsBound),

          snapshot:
            getSidebarSnapshot(),
        }
      );

      return api;
    } finally {
      bindingEvents =
        false;
    }
  }

  function rebindEvents(reason = "rebind") {
    return bindEvents(
      reason,
      {
        force:
          true,
      }
    );
  }

  /* ======================================================
     REFRESH / SYNC / REPAIR
  ====================================================== */

  function sync(reason = "sync", options = {}) {
    const opts =
      safeObject(options);

    const cleanReason =
      safeText(reason, "sync");

    const ts =
      nowTs();

    if (
      opts.force !== true &&
      cleanReason === lastSyncReason &&
      ts - lastSyncAt < SYNC_DEDUP_WINDOW_MS
    ) {
      scheduleRouteAndIndicator(
        `sync:deduped:${cleanReason}`,
        {
          delayMs:
            INDICATOR_DELAY_REFRESH_MS,

          force:
            opts.force === true,
        }
      );

      return api;
    }

    lastSyncAt =
      ts;

    lastSyncReason =
      cleanReason;

    mountAndRefresh(cleanReason);
    sanitizeSidebarDom(`sync:${cleanReason}`);

    syncSidebarState();

    if (opts.user !== false) {
      renderUser();
    }

    if (opts.visibility !== false) {
      applyRoleVisibility();
    }

    if (opts.dropdownRepair === true) {
      repairDropdown(`sync:${cleanReason}`);
    }

    scheduleRouteAndIndicator(
      `sync:${cleanReason}`,
      {
        delayMs:
          typeof opts.delayMs === "number"
            ? opts.delayMs
            : INDICATOR_DELAY_REFRESH_MS,

        force:
          opts.force === true,
      }
    );

    if (opts.emit === true) {
      safeEmit(
        "sidebar:synced",
        {
          reason:
            cleanReason,

          snapshot:
            getSidebarSnapshot(),
        }
      );
    }

    return api;
  }

  function refresh(reason = "refresh") {
    const cleanReason =
      safeText(reason, "refresh");

    mountAndRefresh(cleanReason);
    ensureRuntimeStateDefaults();

    sanitizeSidebarDom(
      `refresh:${cleanReason}`
    );

    syncSidebarState();
    renderUser();
    applyRoleVisibility();
    repairDropdown(
      `refresh:${cleanReason}`
    );

    scheduleRouteAndIndicator(
      `refresh:${cleanReason}`,
      {
        delayMs:
          INDICATOR_DELAY_REFRESH_MS,

        force:
          true,
      }
    );

    safeEmit(
      "sidebar:refreshed",
      {
        reason:
          cleanReason,

        snapshot:
          getSidebarSnapshot(),
      }
    );

    return api;
  }

  function repair(reason = "repair", options = {}) {
    const opts =
      safeObject(options);

    const cleanReason =
      safeText(reason, "repair");

    const ts =
      nowTs();

    if (
      opts.force !== true &&
      ts - lastRepairAt < REPAIR_DEDUP_WINDOW_MS
    ) {
      scheduleRouteAndIndicator(
        `repair:deduped:${cleanReason}`,
        {
          delayMs:
            INDICATOR_DELAY_REPAIR_MS,

          force:
            true,
        }
      );

      safeEmit(
        "sidebar:repair:deduped",
        {
          reason:
            cleanReason,

          sinceLastRepairMs:
            ts - lastRepairAt,

          lastRepairReason,

          snapshot:
            getSidebarSnapshot(),
        }
      );

      return api;
    }

    lastRepairAt =
      ts;

    lastRepairReason =
      cleanReason;

    const {
      mounted,
    } =
      mountAndRefresh(cleanReason);

    if (!mounted) {
      safeWarn(
        "No se pudo reparar sidebar: shell ausente.",
        {
          reason:
            cleanReason,
        }
      );

      return api;
    }

    ensureRuntimeStateDefaults();

    sanitizeSidebarDom(
      `repair:${cleanReason}`
    );

    repairSidebarState(
      `repair:${cleanReason}`
    );

    /*
      Orden importante:
      1. Usuario.
      2. Visibilidad.
      3. Dropdown.
      Así roles/admin se calculan con identidad actualizada.
    */
    renderUser();
    applyRoleVisibility();
    repairDropdown(
      `repair:${cleanReason}`
    );

    if (opts.rebind === true) {
      bindEvents(
        `repair:${cleanReason}`,
        {
          force:
            true,
        }
      );
    } else if (!eventsBound) {
      bindEvents(
        `repair:${cleanReason}`
      );
    }

    initialized =
      true;

    scheduleRouteAndIndicator(
      `repair:${cleanReason}`,
      {
        delayMs:
          INDICATOR_DELAY_REPAIR_MS,

        force:
          true,
      }
    );

    afterPaint(() => {
      ensureMenuInteractive(
        `repair:${cleanReason}:after-paint`
      );

      syncRouteAndIndicator(
        `repair:${cleanReason}:after-paint`,
        {
          delayMs:
            0,

          force:
            true,
        }
      );
    });

    safeEmit(
      "sidebar:repaired",
      {
        reason:
          cleanReason,

        snapshot:
          getSidebarSnapshot(),

        isAdmin:
          isAdmin(),
      }
    );

    return api;
  }

  function scheduleRepair(reason = "scheduled-repair", options = {}) {
    const opts =
      safeObject(options);

    const delayMs =
      clampNumber(
        opts.delayMs,
        0,
        1000
      );

    clearRepairTimer();

    repairTimer =
      safeSetTimeout(() => {
        repairTimer =
          null;

        repair(
          reason,
          {
            ...opts,

            force:
              opts.force === true,
          }
        );
      }, delayMs);

    return api;
  }

  function restoreSidebarState(snapshot = null) {
    const data =
      safeObject(snapshot);

    if (
      !data ||
      !Object.keys(data).length
    ) {
      return false;
    }

    if (isMobileViewport(MOBILE_BREAKPOINT)) {
      return false;
    }

    const desiredOpen =
      Boolean(
        typeof data.desktopOpen === "boolean"
          ? data.desktopOpen
          : data.open
      );

    try {
      if (
        AppCore?.state &&
        typeof AppCore.state === "object"
      ) {
        AppCore.state.sidebarDesktopOpen =
          desiredOpen;

        AppCore.state.sidebarOpen =
          desiredOpen;

        AppCore.state.sidebarMode =
          "desktop";

        AppCore.state.sidebarLastMode =
          "desktop";
      }
    } catch {}

    const result =
      actionSetSidebarOpen(
        {
          AppCore,
          open:
            desiredOpen,
          closeDropdown,
          syncSidebarState,
          reason:
            "restore-sidebar-state",
        }
      );

    scheduleRouteAndIndicator(
      "restore-sidebar-state",
      {
        delayMs:
          INDICATOR_DELAY_TRANSITION_MS,

        force:
          true,
      }
    );

    return result;
  }

  /* ======================================================
     MODULE REGISTRATION
  ====================================================== */

  function getRegisteredModule(name = "") {
    const cleanName =
      safeText(name, "");

    if (!cleanName) {
      return null;
    }

    try {
      const value =
        AppCore?.modules?.get?.(cleanName);

      if (value) {
        return value;
      }
    } catch {}

    try {
      const value =
        AppCore?.registry?.modules?.get?.(cleanName);

      if (value) {
        return value;
      }
    } catch {}

    return null;
  }

  function registerSingleModule(name = "") {
    const cleanName =
      safeText(name, "");

    if (!cleanName) {
      return false;
    }

    const current =
      getRegisteredModule(cleanName);

    if (current === api) {
      return false;
    }

    let changed =
      false;

    try {
      if (isFunction(AppCore?.modules?.register)) {
        const result =
          AppCore.modules.register(
            cleanName,
            api,
            {
              replace:
                true,

              overwrite:
                true,

              silentDuplicate:
                true,

              source:
                SOURCE,
            }
          );

        if (result !== false) {
          changed =
            true;
        }
      }
    } catch {}

    if (!changed) {
      try {
        if (isFunction(AppCore?.modules?.set)) {
          const result =
            AppCore.modules.set(
              cleanName,
              api,
              {
                replace:
                  true,

                overwrite:
                  true,

                silentDuplicate:
                  true,

                source:
                  SOURCE,
              }
            );

          if (result !== false) {
            changed =
              true;
          }
        }
      } catch {}
    }

    try {
      AppCore?.registry?.modules?.set?.(
        cleanName,
        api
      );

      changed =
        true;
    } catch {}

    return changed;
  }

  function registerModule() {
    let changed =
      false;

    for (const name of MODULE_NAMES) {
      if (registerSingleModule(name)) {
        changed =
          true;
      }
    }

    return changed;
  }

  function exposeGlobalBridge() {
    if (!isBrowser()) {
      return false;
    }

    try {
      if (window.SidebarUI !== api) {
        window.SidebarUI =
          api;
      }

      if (window.OnionSidebarUI !== api) {
        window.OnionSidebarUI =
          api;
      }

      return true;
    } catch {
      return false;
    }
  }

  /* ======================================================
     INIT / DESTROY
  ====================================================== */

  function init(options = {}) {
    const opts =
      safeObject(options);

    if (initialized) {
      registerModule();
      exposeGlobalBridge();

      if (!eventsBound) {
        bindEvents(
          "init-already-initialized",
          {
            force:
              false,
          }
        );
      }

      return sync(
        "init-already-initialized",
        {
          force:
            opts.force === true,

          emit:
            false,
        }
      );
    }

    const {
      mounted,
    } =
      mountAndRefresh("init");

    if (!mounted) {
      safeWarn(
        "No se pudo montar sidebar."
      );

      return api;
    }

    ensureRuntimeStateDefaults();

    sanitizeSidebarDom("init");

    syncSidebarState();

    /*
      Orden crítico:
      - user primero para que visibility lea roles/admin actuales.
      - visibility después para ocultar/mostrar correctamente.
      - dropdown después para reparar aria/foco sobre DOM final.
    */
    renderUser();
    applyRoleVisibility();
    repairDropdown("init");

    closeDropdown(
      {
        force:
          true,

        reason:
          "init",
      }
    );

    initialized =
      true;

    registerModule();
    exposeGlobalBridge();

    bindEvents("init");

    scheduleRouteAndIndicator(
      "init",
      {
        delayMs:
          INDICATOR_DELAY_INIT_MS,

        force:
          true,
      }
    );

    afterPaint(() => {
      ensureMenuInteractive("init:after-paint");

      syncRouteAndIndicator(
        "init:after-paint",
        {
          delayMs:
            0,

          force:
            true,
        }
      );
    });

    safeEmit(
      "sidebar:ready",
      {
        initialized:
          true,

        isAdmin:
          isAdmin(),

        snapshot:
          getSidebarSnapshot(),
      }
    );

    safeLog(
      "ready",
      getSidebarSnapshot()
    );

    return api;
  }

  function destroy() {
    cleanup();

    try {
      resetSidebarStateRuntime(
        AppCore,
        "sidebar-ui-destroy"
      );
    } catch {}

    initialized =
      false;

    logoutInFlight =
      false;

    runtimeState.dropdownOpen =
      false;

    bindGeneration += 1;

    lastBindAt =
      0;

    lastBindReason =
      "";

    lastRepairAt =
      0;

    lastRepairReason =
      "";

    lastSyncAt =
      0;

    lastSyncReason =
      "";

    ensureMenuInteractive("destroy");

    safeEmit(
      "sidebar:destroyed",
      {
        initialized:
          false,
      }
    );

    return api;
  }

  /* ======================================================
     DEBUG / SNAPSHOT
  ====================================================== */

  function getSidebarSnapshot() {
    const elements =
      getElements(AppCore);

    let mobile =
      false;

    let open =
      true;

    try {
      mobile =
        isMobileViewport(MOBILE_BREAKPOINT);
    } catch {}

    try {
      open =
        getDesiredSidebarOpenState(AppCore);
    } catch {}

    const activeItems =
      getAllMenuItems()
        .filter((item) =>
          Boolean(
            item.classList?.contains?.("active") ||
              item.classList?.contains?.("is-active") ||
              item.classList?.contains?.("router-active") ||
              item.getAttribute?.("aria-current") === "page" ||
              item.dataset?.active === "true"
          )
        )
        .map((item) => ({
          route:
            normalizeRoutePath(
              getRouteFromElement(item)
            ),

          rawRoute:
            getRouteFromElement(item),

          text:
            safeText(
              item.textContent,
              ""
            ),

          hidden:
            Boolean(
              item.hidden ||
                item.closest?.("[hidden],[inert],[aria-hidden='true']")
            ),
        }));

    return {
      version:
        SIDEBAR_UI_VERSION,

      initialized,
      eventsBound,
      bindingEvents,

      bindGeneration,
      lastBindAt,
      lastBindReason,

      lastRepairAt,
      lastRepairReason,

      lastSyncAt,
      lastSyncReason,

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

      dropdownOpen:
        Boolean(runtimeState.dropdownOpen),

      isAdmin:
        isAdmin(),

      shellHidden:
        (() => {
          try {
            return Boolean(
              isShellHidden(AppCore)
            );
          } catch {
            return false;
          }
        })(),

      realShellHidden:
        (() => {
          try {
            return Boolean(
              isRealShellHidden(AppCore)
            );
          } catch {
            return false;
          }
        })(),

      hasShell:
        (() => {
          try {
            return Boolean(
              hasSidebarShell(AppCore)
            );
          } catch {
            return false;
          }
        })(),

      route: {
        browser:
          getBrowserPath(),

        appRoute:
          AppCore?.state?.route || "",

        appPublicPath:
          AppCore?.state?.publicPath || "",

        appCanonicalPath:
          AppCore?.state?.canonicalPath || "",

        routerPublicPath:
          (() => {
            try {
              return Router?.getCurrentPublicPath?.() || "";
            } catch {
              return "";
            }
          })(),
      },

      dom: {
        hasSidebar:
          Boolean(elements.sidebar),

        hasSidebarMenu:
          Boolean(elements.sidebarMenu),

        hasToggle:
          Boolean(elements.toggleBtn || elements.sidebarToggle),

        hasMobileToggle:
          Boolean(elements.mobileToggleBtn),

        hasUserToggle:
          Boolean(elements.userToggle),

        hasUserDropdown:
          Boolean(elements.userDropdown),

        hasLogout:
          Boolean(elements.logoutBtn),

        sidebarHidden:
          Boolean(elements.sidebar?.hidden),

        sidebarAriaHidden:
          elements.sidebar?.getAttribute?.("aria-hidden") || "",

        sidebarClassName:
          elements.sidebar?.className || "",

        sidebarMenuPointerEvents:
          elements.sidebarMenu?.style?.pointerEvents || "",

        sidebarMenuInert:
          Boolean(elements.sidebarMenu?.hasAttribute?.("inert")),

        sidebarMenuAriaDisabled:
          elements.sidebarMenu?.getAttribute?.("aria-disabled") || "",
      },

      dropdown:
        safeObject(
          getDropdownSnapshot(
            AppCore,
            runtimeState
          )
        ),

      user:
        (() => {
          try {
            return getSidebarUserSnapshot(AppCore);
          } catch {
            return {};
          }
        })(),

      visibility:
        (() => {
          try {
            return getRoleVisibilitySnapshot(AppCore, isAdmin);
          } catch {
            return {};
          }
        })(),

      sidebarDom:
        (() => {
          try {
            return getSidebarDomSnapshot(AppCore);
          } catch {
            return {};
          }
        })(),

      sidebarState:
        (() => {
          try {
            return getSidebarStateSnapshot(AppCore);
          } catch {
            return {};
          }
        })(),

      sidebarEvents:
        (() => {
          try {
            return getSidebarEventsSnapshot(SCOPE);
          } catch {
            return {};
          }
        })(),

      activeRoute: {
        activeItems,
      },

      indicator: {
        ready:
          elements.sidebarMenu?.dataset?.indicatorReady || "",

        reason:
          elements.sidebarMenu?.dataset?.indicatorReason || "",

        route:
          elements.sidebarMenu?.dataset?.indicatorRoute || "",

        current:
          elements.sidebarMenu?.dataset?.indicatorCurrent || "",

        x:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-x") || "",

        y:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-y") || "",

        w:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-w") || "",

        h:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-h") || "",

        opacity:
          elements.sidebarMenu?.style?.getPropertyValue?.("--sidebar-indicator-opacity") || "",
      },

      modules: {
        sidebar:
          getRegisteredModule("sidebar") === api,

        SidebarUI:
          getRegisteredModule("SidebarUI") === api,

        sidebarUI:
          getRegisteredModule("sidebarUI") === api,
      },

      actions:
        safeObject(
          getSidebarActionsSnapshot()
        ),
    };
  }

  function debugDropdown() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("debug-dropdown");

    const snapshot =
      getDropdownSnapshot(
        AppCore,
        runtimeState
      );

    try {
      console.log(
        "[SidebarUI:dropdown]",
        snapshot
      );
    } catch {}

    return snapshot;
  }

  function debugIndicator() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("debug-indicator");

    const payload =
      resolveRoutePayload(
        {
          reason:
            "debug-indicator",

          force:
            true,
        }
      );

    const activeItem =
      syncActiveMenuItem(
        AppCore,
        {
          ...payload,

          reason:
            "debug-indicator",

          mutate:
            false,
        }
      );

    const {
      sidebarMenu,
    } =
      getElements(AppCore);

    const snapshot =
      {
        route:
          payload.route,

        browserRoute:
          getBrowserPath(),

        hasSidebarMenu:
          Boolean(sidebarMenu),

        hasActiveItem:
          Boolean(activeItem),

        activeRoute:
          activeItem
            ? normalizeRoutePath(
                getRouteFromElement(activeItem)
              )
            : "",

        activeText:
          safeText(
            activeItem?.textContent,
            ""
          ),

        indicatorReady:
          sidebarMenu?.dataset?.indicatorReady || "",

        indicatorReason:
          sidebarMenu?.dataset?.indicatorReason || "",

        indicatorRoute:
          sidebarMenu?.dataset?.indicatorRoute || "",

        indicatorCurrent:
          sidebarMenu?.dataset?.indicatorCurrent || "",

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
              normalizeRoutePath(
                getRouteFromElement(item)
              ),

            rawRoute:
              getRouteFromElement(item),

            text:
              safeText(
                item.textContent,
                ""
              ),

            active:
              Boolean(
                item.classList?.contains?.("active") ||
                  item.classList?.contains?.("is-active") ||
                  item.classList?.contains?.("router-active") ||
                  item.getAttribute?.("aria-current") === "page" ||
                  item.dataset?.active === "true"
              ),
          })),
      };

    try {
      console.log(
        "[SidebarUI:indicator]",
        snapshot
      );
    } catch {}

    return snapshot;
  }

  function debug() {
    refreshSidebarDomRefs();
    ensureMenuInteractive("debug");

    const snapshot =
      getSidebarSnapshot();

    try {
      console.log(
        "[SidebarUI]",
        snapshot
      );
    } catch {}

    return snapshot;
  }

  /* ======================================================
     API
  ====================================================== */

  const api =
    {
      version:
        SIDEBAR_UI_VERSION,

      init,
      destroy,
      cleanup,

      sync,

      render:
        sync,

      refresh,
      repair,
      scheduleRepair,

      bind:
        bindEvents,

      rebind:
        rebindEvents,

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

      navigate:
        navigateTo,

      handleLogout,

      updateToggleLabel:
        () => updateToggleLabel(AppCore),

      syncRouteAndIndicator,

      syncIndicator:
        (reason = "api:syncIndicator") =>
          scheduleRouteAndIndicator(
            reason,
            {
              delayMs:
                0,

              force:
                true,
            }
          ),

      scheduleIndicatorSync:
        scheduleRouteAndIndicator,

      ensureMenuInteractive,
      sanitizeSidebarDom,

      isAdmin,

      registerModule,
      exposeGlobalBridge,

      debug,
      debugDropdown,
      debugIndicator,

      getSnapshot:
        getSidebarSnapshot,

      getState:
        getSidebarSnapshot,

      get initialized() {
        return initialized;
      },

      get eventsBound() {
        return eventsBound;
      },

      get bindingEvents() {
        return bindingEvents;
      },

      get logoutInFlight() {
        return logoutInFlight;
      },
    };

  return api;
})();

export default SidebarUI;
