/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar/index.js

   ONION SUPPORT · SIDEBAR UI ORCHESTRATOR · EXTREME 10/10
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
   - Aceptar firmas modernas desde AppUI:
       · renderUser(reason, context)
       · refreshUser(reason, context)
       · updateUser(reason, context)
       · syncUser(reason, context)
       · sync(reason, context)
       · repair(reason, context)
   - Si AppUI entrega user/context, sincronizarlo antes de pintar identidad.
   - Blindar footer/avatar/name contra estados fantasma o usuario obsoleto.

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
  "sidebar-ui-v16-extreme-orchestrator-hardened";

export const SidebarUI = (() => {
  "use strict";

  /* ======================================================
     INTERNAL STATE
  ====================================================== */

  const SOURCE = "SidebarUI";
  const OWNER = "index.js";
  const LOG_PREFIX = "[SidebarUI]";

  const BIND_DEDUP_WINDOW_MS = 250;
  const REPAIR_DEDUP_WINDOW_MS = 180;
  const SYNC_DEDUP_WINDOW_MS = 90;
  const USER_SYNC_DEDUP_WINDOW_MS = 80;

  const INDICATOR_DELAY_INIT_MS = 32;
  const INDICATOR_DELAY_REFRESH_MS = 40;
  const INDICATOR_DELAY_REPAIR_MS = 48;
  const INDICATOR_DELAY_ROUTE_MS = 56;
  const INDICATOR_DELAY_TRANSITION_MS = 420;

  const MODULE_NAMES = Object.freeze([
    "sidebar",
    "SidebarUI",
    "sidebarUI",
  ]);

  const USER_SOURCE_KEYS = Object.freeze([
    "user",
    "usuario",
    "currentUser",
    "authUser",
    "sessionUser",
    "account",
    "profile",
    "me",
  ]);

  const SESSION_SOURCE_KEYS = Object.freeze([
    "session",
    "sessionData",
    "auth",
    "data",
    "payload",
  ]);

  let initialized = false;
  let logoutInFlight = false;

  let eventsBound = false;
  let bindingEvents = false;
  let bindGeneration = 0;

  let lastBindAt = 0;
  let lastBindReason = "";

  let lastRepairAt = 0;
  let lastRepairReason = "";

  let lastSyncAt = 0;
  let lastSyncReason = "";

  let lastUserSyncAt = 0;
  let lastUserSyncSignature = "";

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

  function safeLower(value, fallback = "") {
    return safeText(value, fallback).toLowerCase();
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
      if (value === 1) return true;
      if (value === 0) return false;
    }

    return Boolean(fallback);
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : fallback;
  }

  function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
    const number =
      safeNumber(
        value,
        min
      );

    return Math.min(
      Math.max(number, min),
      max
    );
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function isObjectLike(value) {
    return (
      value !== null &&
      (
        typeof value === "object" ||
        typeof value === "function"
      )
    );
  }

  function canExtend(value) {
    try {
      return (
        isObjectLike(value) &&
        Object.isExtensible(value)
      );
    } catch {
      return false;
    }
  }

  function defineHiddenValue(target, key, value) {
    if (
      !target ||
      !key ||
      !canExtend(target)
    ) {
      return false;
    }

    try {
      Object.defineProperty(
        target,
        key,
        {
          value,
          configurable: true,
          enumerable: false,
          writable: true,
        }
      );

      return true;
    } catch {}

    try {
      target[key] = value;
      return true;
    } catch {}

    return false;
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

  function uniqueStrings(values = []) {
    return [
      ...new Set(
        safeArray(values)
          .flat(Infinity)
          .map((value) =>
            safeText(value, "")
          )
          .filter(Boolean)
      ),
    ];
  }

  function safeWarn(...args) {
    let logged = false;

    try {
      if (isFunction(AppCore?.utils?.warn)) {
        AppCore.utils.warn(
          LOG_PREFIX,
          ...args
        );

        logged = true;
      }
    } catch {
      logged = false;
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

  function getPayload(input = {}) {
    const raw =
      input || {};

    if (
      raw &&
      typeof raw === "object" &&
      "detail" in raw &&
      raw.detail !== undefined
    ) {
      return safeObject(raw.detail);
    }

    if (
      raw &&
      typeof raw === "object" &&
      "payload" in raw &&
      raw.payload !== undefined
    ) {
      return safeObject(raw.payload);
    }

    return safeObject(raw);
  }

  function normalizeInvocation(
    reasonOrPayload = "sidebar",
    context = {},
    fallbackReason = "sidebar"
  ) {
    let reason = fallbackReason;
    let payload = {};
    let options = {};

    if (typeof reasonOrPayload === "string") {
      reason =
        safeText(
          reasonOrPayload,
          fallbackReason
        );

      payload =
        getPayload(context);

      options =
        safeObject(context);
    } else {
      payload =
        getPayload(reasonOrPayload);

      options =
        {
          ...payload,
          ...safeObject(context),
        };

      reason =
        safeText(
          payload.reason ||
            payload.phase ||
            payload.event ||
            payload.type ||
            payload.source ||
            context?.reason,
          fallbackReason
        );
    }

    return {
      reason,
      payload,
      options,
      raw:
        reasonOrPayload,
      context:
        safeObject(context),
    };
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

  function sanitizeForEvent(value, depth = 0) {
    if (depth > 5) {
      return "[MaxDepth]";
    }

    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "string") {
      return value
        .replace(
          /([?&#](token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
          "$1***"
        )
        .replace(
          /(\/activate-account\/)([^/?#\s]+)/gi,
          "$1***"
        )
        .replace(
          /(\/reset-password\/confirm\/)([^/?#\s]+)/gi,
          "$1***"
        )
        .replace(
          /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
          "$1***"
        );
    }

    if (typeof value === "function") {
      return "[Function]";
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 80)
        .map((item) =>
          sanitizeForEvent(item, depth + 1)
        );
    }

    if (
      value &&
      typeof value === "object"
    ) {
      const output = {};

      for (const [key, item] of Object.entries(value)) {
        if (/token|secret|password|authorization|credential|jwt|bearer|otp|code/i.test(key)) {
          output[key] = "***";
          continue;
        }

        output[key] =
          sanitizeForEvent(
            item,
            depth + 1
          );
      }

      return output;
    }

    return String(value);
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
      sanitizeForEvent({
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
      });

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

  /* ======================================================
     USER CONTEXT HARDENING
  ====================================================== */

  function getAuthUser() {
    try {
      return (
        Auth?.getUser?.() ||
        Auth?.getCurrentUser?.() ||
        Auth?.user ||
        null
      );
    } catch {
      return null;
    }
  }

  function getAuthRole() {
    try {
      return (
        Auth?.getCurrentRole?.() ||
        Auth?.getRole?.() ||
        Auth?.role ||
        null
      );
    } catch {
      return null;
    }
  }

  function getState() {
    try {
      return safeObject(AppCore?.state);
    } catch {
      return {};
    }
  }

  function getStateUser() {
    const state =
      getState();

    return (
      state.user ||
      state.currentUser ||
      state.sessionUser ||
      state.authUser ||
      state.session?.user ||
      null
    );
  }

  function resolveAvatar(user = {}) {
    const source =
      safeObject(user);

    return (
      safeText(source.avatar, "") ||
      safeText(source.avatarUrl, "") ||
      safeText(source.avatarURL, "") ||
      safeText(source.avatar_url, "") ||
      safeText(source.photo, "") ||
      safeText(source.photoUrl, "") ||
      safeText(source.photoURL, "") ||
      safeText(source.photo_url, "") ||
      safeText(source.image, "") ||
      safeText(source.imageUrl, "") ||
      safeText(source.imageURL, "") ||
      safeText(source.image_url, "") ||
      safeText(source.profileImage, "") ||
      safeText(source.profile_image, "") ||
      safeText(source.picture, "") ||
      safeText(source.pictureUrl, "") ||
      safeText(source.pictureURL, "") ||
      safeText(source.picture_url, "") ||
      null
    );
  }

  function normalizeUsername(value = "") {
    return safeText(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^@+/, "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();
  }

  function normalizeRole(value = "user") {
    return (
      safeLower(value || "user", "user") ||
      "user"
    );
  }

  function isUserActive(user = {}) {
    const source =
      safeObject(user);

    const status =
      safeLower(
        source.status ||
          source.estado ||
          source.state ||
          source.accountStatus ||
          "",
        ""
      );

    if (
      source.deletedAt ||
      source.deleted === true ||
      source.disabled === true ||
      source.blocked === true ||
      source.banned === true ||
      source.suspended === true ||
      source.revoked === true
    ) {
      return false;
    }

    if (
      [
        "disabled",
        "inactive",
        "deleted",
        "blocked",
        "banned",
        "suspended",
        "revoked",
        "desactivado",
        "inactivo",
        "eliminado",
        "bloqueado",
        "suspendido",
      ].includes(status)
    ) {
      return false;
    }

    const activeCandidate =
      source.active ??
      source.isActive ??
      source.is_active ??
      source.enabled ??
      source.isEnabled;

    if (
      activeCandidate === undefined ||
      activeCandidate === null ||
      activeCandidate === ""
    ) {
      return true;
    }

    return safeBoolean(
      activeCandidate,
      true
    );
  }

  function hasUsableUser(user = {}) {
    const source =
      safeObject(user);

    if (
      !source ||
      !Object.keys(source).length ||
      !isUserActive(source)
    ) {
      return false;
    }

    return Boolean(
      safeText(source.id, "") ||
        safeText(source.userId, "") ||
        safeText(source.user_id, "") ||
        safeText(source.uid, "") ||
        safeText(source.sub, "") ||
        safeText(source._id, "") ||
        safeText(source.username, "") ||
        safeText(source.userName, "") ||
        safeText(source.user_name, "") ||
        safeText(source.email, "") ||
        safeText(source.mail, "") ||
        safeText(source.phone, "") ||
        safeText(source.telefono, "") ||
        safeText(source.mobile, "") ||
        safeText(source.name, "") ||
        safeText(source.displayName, "")
    );
  }

  function normalizeUserForSidebar(user = {}, extra = {}) {
    const source =
      safeObject(user);

    if (!Object.keys(source).length) {
      return null;
    }

    const ctx =
      safeObject(extra);

    const userId =
      safeText(
        first(
          source.userId,
          source.user_id,
          source.uid,
          source.sub,
          source.id,
          source._id,
          ctx.userId,
          ctx.uid,
          ctx.sub
        ),
        ""
      );

    const email =
      safeText(
        first(
          source.email,
          source.mail,
          ctx.email
        ),
        ""
      );

    const username =
      safeText(
        first(
          source.username,
          source.userName,
          source.user_name,
          source.usernameLower,
          source.username_lower,
          source.slug,
          ctx.username,
          email
        ),
        ""
      );

    const usernameLower =
      normalizeUsername(
        first(
          source.usernameLower,
          source.username_lower,
          username
        ) || ""
      );

    const slug =
      normalizeUsername(
        first(
          source.slug,
          source.usernameSlug,
          source.username_slug,
          usernameLower,
          username,
          email,
          userId
        ) || ""
      );

    const role =
      normalizeRole(
        first(
          source.role,
          source.rol,
          source.userRole,
          source.user_role,
          source.type,
          source.tipo,
          ctx.role,
          ctx.rol,
          getState().role,
          getAuthRole(),
          "user"
        )
      );

    const displayName =
      safeText(
        first(
          source.displayName,
          source.fullName,
          source.name,
          source.nombre,
          source.username,
          username,
          email,
          ctx.displayName,
          ctx.name,
          "Usuario"
        ),
        "Usuario"
      );

    const avatar =
      resolveAvatar(source) ||
      safeText(ctx.avatarUrl || ctx.avatar || "", "") ||
      null;

    const plan =
      safeText(
        first(
          source.plan,
          source.planName,
          source.plan_name,
          source.subscriptionPlan,
          source.subscription_plan,
          source.accountPlan,
          source.account_plan,
          source.customerPlan,
          source.customer_plan,
          source.billingPlan,
          source.billing_plan,
          ctx.plan,
          ctx.planName,
          ctx.subscriptionPlan
        ),
        ""
      );

    return {
      ...source,

      id:
        source.id ||
        userId ||
        null,

      userId:
        source.userId ||
        userId ||
        null,

      uid:
        source.uid ||
        userId ||
        null,

      sub:
        source.sub ||
        userId ||
        null,

      email:
        email || null,

      emailLower:
        source.emailLower ||
        source.email_lower ||
        (email ? email.toLowerCase() : null),

      username:
        username || null,

      usernameLower:
        usernameLower || null,

      username_lower:
        source.username_lower ||
        usernameLower ||
        null,

      slug:
        slug || null,

      name:
        displayName,

      nombre:
        source.nombre ||
        displayName,

      displayName,

      fullName:
        source.fullName ||
        displayName,

      role,

      rol:
        role,

      roles:
        uniqueStrings([
          role,
          ...safeArray(source.roles),
        ]),

      permissions:
        safeArray(
          source.permissions ||
            source.permisos
        ),

      permisos:
        safeArray(
          source.permisos ||
            source.permissions
        ),

      avatar:
        avatar || null,

      avatarUrl:
        avatar || null,

      picture:
        avatar || null,

      hasAvatar:
        source.hasAvatar === true ||
        source.has_avatar === true ||
        Boolean(avatar),

      plan:
        plan || source.plan || null,

      planName:
        plan || source.planName || null,

      subscriptionPlan:
        plan || source.subscriptionPlan || null,

      active:
        isUserActive(source),
    };
  }

  function extractUserFromSource(source = {}) {
    const data =
      safeObject(source);

    for (const key of USER_SOURCE_KEYS) {
      if (hasUsableUser(data[key])) {
        return data[key];
      }
    }

    for (const key of SESSION_SOURCE_KEYS) {
      const nested =
        safeObject(data[key]);

      for (const userKey of USER_SOURCE_KEYS) {
        if (hasUsableUser(nested[userKey])) {
          return nested[userKey];
        }
      }

      if (hasUsableUser(nested.user)) {
        return nested.user;
      }
    }

    if (hasUsableUser(data.snapshot?.user)) {
      return data.snapshot.user;
    }

    if (hasUsableUser(data.payload?.snapshot?.user)) {
      return data.payload.snapshot.user;
    }

    if (
      safeText(data.username || data.email || data.displayName || data.name, "")
    ) {
      return {
        id:
          data.userId ||
          data.id ||
          null,

        userId:
          data.userId ||
          data.id ||
          null,

        username:
          data.username ||
          null,

        email:
          data.email ||
          null,

        name:
          data.name ||
          data.displayName ||
          data.username ||
          data.email ||
          "Usuario",

        displayName:
          data.displayName ||
          data.name ||
          data.username ||
          data.email ||
          "Usuario",

        role:
          data.role ||
          data.rol ||
          null,

        avatar:
          data.avatar ||
          data.avatarUrl ||
          null,

        avatarUrl:
          data.avatarUrl ||
          data.avatar ||
          null,

        plan:
          data.plan ||
          data.planName ||
          data.subscriptionPlan ||
          null,
      };
    }

    return null;
  }

  function extractUserContext(reasonOrPayload = {}, context = {}) {
    const payload =
      getPayload(reasonOrPayload);

    const ctx =
      safeObject(context);

    const userCandidate =
      extractUserFromSource(ctx) ||
      extractUserFromSource(payload) ||
      extractUserFromSource(ctx.payload) ||
      extractUserFromSource(payload.payload) ||
      extractUserFromSource(ctx.snapshot) ||
      extractUserFromSource(payload.snapshot) ||
      getAuthUser() ||
      getStateUser() ||
      null;

    const extra =
      {
        ...payload,
        ...ctx,
        ...safeObject(ctx.snapshot),
        ...safeObject(payload.snapshot),
      };

    const normalized =
      normalizeUserForSidebar(
        userCandidate,
        extra
      );

    return {
      user:
        normalized,

      authenticated:
        payload.authenticated === true ||
        ctx.authenticated === true ||
        getState().authenticated === true,

      role:
        safeText(
          extra.role ||
            extra.rol ||
            normalized?.role ||
            getState().role ||
            "",
          ""
        ),

      source:
        safeText(
          extra.source ||
            payload.source ||
            ctx.source ||
            SOURCE,
          SOURCE
        ),
    };
  }

  function getUserSignature(user = null, role = "") {
    if (!hasUsableUser(user)) {
      return "";
    }

    return [
      safeText(user.id || user.userId || user.uid || user.sub, ""),
      safeText(user.username || user.usernameLower || user.slug, ""),
      safeText(user.email || user.emailLower, ""),
      safeText(user.displayName || user.name, ""),
      safeText(user.avatarUrl || user.avatar || user.picture, ""),
      safeText(role || user.role || user.rol, ""),
      safeText(user.plan || user.planName || user.subscriptionPlan, ""),
    ].join("|");
  }

  function shouldDedupeUserSync(user = null, role = "", reason = "", force = false) {
    if (force === true) {
      return false;
    }

    const signature =
      [
        safeText(reason, ""),
        getUserSignature(user, role),
      ].join("::");

    const ts =
      nowTs();

    if (
      signature &&
      signature === lastUserSyncSignature &&
      ts - lastUserSyncAt < USER_SYNC_DEDUP_WINDOW_MS
    ) {
      return true;
    }

    lastUserSyncSignature =
      signature;

    lastUserSyncAt =
      ts;

    return false;
  }

  function applyUserContextToCore(reasonOrPayload = {}, context = {}) {
    const {
      reason,
      options,
    } =
      normalizeInvocation(
        reasonOrPayload,
        context,
        "user-context"
      );

    const userContext =
      extractUserContext(
        reasonOrPayload,
        context
      );

    const user =
      userContext.user;

    if (!hasUsableUser(user)) {
      return {
        applied:
          false,
        user:
          null,
        role:
          userContext.role || "",
      };
    }

    const role =
      normalizeRole(
        userContext.role ||
          user.role ||
          user.rol ||
          "user"
      );

    if (
      shouldDedupeUserSync(
        user,
        role,
        reason,
        options.force === true
      )
    ) {
      return {
        applied:
          false,
        deduped:
          true,
        user,
        role,
      };
    }

    const authenticated =
      userContext.authenticated ||
      getState().authenticated === true;

    const patch = {
      user,
      currentUser:
        user,
      authUser:
        user,
      sessionUser:
        user,

      role,
      rol:
        role,
      userRole:
        role,

      roles:
        uniqueStrings([
          role,
          ...safeArray(user.roles),
        ]),

      currentResolvedUsername:
        user.slug ||
        user.usernameLower ||
        user.username ||
        getState().currentResolvedUsername ||
        null,

      resolvedUsername:
        user.slug ||
        user.usernameLower ||
        user.username ||
        getState().resolvedUsername ||
        null,

      sidebarUserSyncedAt:
        safeIsoDate(),
      sidebarUserSyncedReason:
        reason,
    };

    if (authenticated) {
      patch.authenticated = true;
    }

    try {
      if (
        AppCore?.state &&
        typeof AppCore.state === "object"
      ) {
        Object.assign(
          AppCore.state,
          patch
        );
      }
    } catch {}

    try {
      AppCore?.setState?.(
        patch,
        {
          source:
            "sidebar:user-context",
          emit:
            false,
          emitState:
            false,
          silent:
            true,
        }
      );
    } catch {}

    try {
      AppCore?.patchState?.(
        patch,
        {
          source:
            "sidebar:user-context",
          emit:
            false,
          emitState:
            false,
          silent:
            true,
        }
      );
    } catch {}

    return {
      applied:
        true,
      user,
      role,
    };
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
        AppCore.dom = {};
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

      AppCore.dom.sidebarUserName =
        el.nameEl || null;

      AppCore.dom.sidebarUserPlan =
        el.planEl || null;

      AppCore.dom.sidebarPlan =
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

    let repaired = false;

    try {
      /*
        Limpieza de restos legacy. No se aplican estilos inline nuevos.
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
        AppCore.state = {};
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
        AppCore.state.sidebarMobileOpen = false;
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

  function getRouterPublicPathSafe() {
    try {
      return Router?.getCurrentPublicPath?.() || "";
    } catch {
      return "";
    }
  }

  function getRouterCanonicalPathSafe() {
    try {
      return Router?.getCurrentCanonicalPath?.() || "";
    } catch {
      return "";
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

        getRouterPublicPathSafe(),
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

      canonicalPath:
        normalizeRoutePath(
          opts.canonicalPath ||
            payload.canonicalPath ||
            getRouterCanonicalPathSafe() ||
            AppCore?.state?.canonicalPath ||
            AppCore?.state?.route ||
            normalized
        ) || normalized,
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

  function renderUser(reasonOrPayload = "render-user", context = {}) {
    const {
      reason,
      payload,
    } =
      normalizeInvocation(
        reasonOrPayload,
        context,
        "render-user"
      );

    const userContext =
      applyUserContextToCore(
        {
          ...payload,
          reason,
        },
        context
      );

    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    try {
      return renderUserBase(
        AppCore,
        {
          reason,
          user:
            userContext.user || getStateUser(),
          role:
            userContext.role || getState().role || "",
          source:
            SOURCE,
        }
      );
    } catch {
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
  }

  function refreshUser(reasonOrPayload = "refresh-user", context = {}) {
    return renderUser(
      reasonOrPayload,
      context
    );
  }

  function updateUser(reasonOrPayload = "update-user", context = {}) {
    return renderUser(
      reasonOrPayload,
      context
    );
  }

  function syncUser(reasonOrPayload = "sync-user", context = {}) {
    const {
      reason,
    } =
      normalizeInvocation(
        reasonOrPayload,
        context,
        "sync-user"
      );

    const userRendered =
      renderUser(
        reasonOrPayload,
        context
      );

    const visibilitySynced =
      applyRoleVisibility(
        `${reason}:visibility`,
        context
      );

    return Boolean(
      userRendered ||
        visibilitySynced
    );
  }

  /* ======================================================
     VISIBILITY
  ====================================================== */

  function applyRoleVisibility(reasonOrPayload = "apply-role-visibility", context = {}) {
    const {
      reason,
      payload,
    } =
      normalizeInvocation(
        reasonOrPayload,
        context,
        "apply-role-visibility"
      );

    applyUserContextToCore(
      {
        ...payload,
        reason,
      },
      context
    );

    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    let result =
      false;

    try {
      result =
        applyRoleVisibilityBase(
          AppCore,
          null,
          isAdmin
        );
    } catch (error) {
      safeWarn(
        "applyRoleVisibilityBase falló.",
        error
      );

      result =
        false;
    }

    scheduleRouteAndIndicator(
      reason,
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

  function syncSidebarState(reasonOrPayload = "sync-sidebar-state", context = {}) {
    const {
      reason,
    } =
      normalizeInvocation(
        reasonOrPayload,
        context,
        "sync-sidebar-state"
      );

    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    return syncSidebarStateBase(
      AppCore,
      closeDropdown
    );
  }

  function repairSidebarState(reasonOrPayload = "repair-sidebar-state", context = {}) {
    const {
      reason,
    } =
      normalizeInvocation(
        reasonOrPayload,
        context,
        "repair-sidebar-state"
      );

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

  function syncRouteAndIndicator(reasonOrPayload = "route-sync", options = {}) {
    const {
      reason,
      options: opts,
    } =
      normalizeInvocation(
        reasonOrPayload,
        options,
        "route-sync"
      );

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
        publicPath:
          payload.publicPath,
        canonicalPath:
          payload.canonicalPath,
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

    domEventsCleanup = null;
    coreEventsCleanup = null;
    eventsBound = false;

    if (opts.preserveBindingFlag !== true) {
      bindingEvents = false;
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

    bindingEvents = true;

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
              refreshUser,
              updateUser,
              syncUser,

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
      bindingEvents = false;
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

  function sync(reasonOrPayload = "sync", options = {}) {
    const {
      reason,
      options: opts,
      payload,
    } =
      normalizeInvocation(
        reasonOrPayload,
        options,
        "sync"
      );

    const ts =
      nowTs();

    if (
      opts.force !== true &&
      reason === lastSyncReason &&
      ts - lastSyncAt < SYNC_DEDUP_WINDOW_MS
    ) {
      scheduleRouteAndIndicator(
        `sync:deduped:${reason}`,
        {
          delayMs:
            INDICATOR_DELAY_REFRESH_MS,

          force:
            opts.force === true,
        }
      );

      return api;
    }

    lastSyncAt = ts;
    lastSyncReason = reason;

    mountAndRefresh(reason);
    sanitizeSidebarDom(`sync:${reason}`);

    applyUserContextToCore(
      {
        ...payload,
        reason,
      },
      opts
    );

    syncSidebarState(reason, opts);

    if (opts.user !== false) {
      renderUser(reason, opts);
    }

    if (opts.visibility !== false) {
      applyRoleVisibility(reason, opts);
    }

    if (opts.dropdownRepair === true) {
      repairDropdown(`sync:${reason}`);
    }

    scheduleRouteAndIndicator(
      `sync:${reason}`,
      {
        ...opts,

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
          reason,
          snapshot:
            getSidebarSnapshot(),
        }
      );
    }

    return api;
  }

  function refresh(reasonOrPayload = "refresh", context = {}) {
    const {
      reason,
      options,
      payload,
    } =
      normalizeInvocation(
        reasonOrPayload,
        context,
        "refresh"
      );

    mountAndRefresh(reason);
    ensureRuntimeStateDefaults();

    sanitizeSidebarDom(
      `refresh:${reason}`
    );

    applyUserContextToCore(
      {
        ...payload,
        reason,
      },
      options
    );

    syncSidebarState(reason, options);
    renderUser(reason, options);
    applyRoleVisibility(reason, options);
    repairDropdown(`refresh:${reason}`);

    scheduleRouteAndIndicator(
      `refresh:${reason}`,
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
        reason,
        snapshot:
          getSidebarSnapshot(),
      }
    );

    return api;
  }

  function repair(reasonOrPayload = "repair", options = {}) {
    const {
      reason,
      options: opts,
      payload,
    } =
      normalizeInvocation(
        reasonOrPayload,
        options,
        "repair"
      );

    const ts =
      nowTs();

    if (
      opts.force !== true &&
      ts - lastRepairAt < REPAIR_DEDUP_WINDOW_MS
    ) {
      scheduleRouteAndIndicator(
        `repair:deduped:${reason}`,
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
          reason,
          sinceLastRepairMs:
            ts - lastRepairAt,
          lastRepairReason,
          snapshot:
            getSidebarSnapshot(),
        }
      );

      return api;
    }

    lastRepairAt = ts;
    lastRepairReason = reason;

    const {
      mounted,
    } =
      mountAndRefresh(reason);

    if (!mounted) {
      safeWarn(
        "No se pudo reparar sidebar: shell ausente.",
        {
          reason,
        }
      );

      return api;
    }

    ensureRuntimeStateDefaults();

    sanitizeSidebarDom(
      `repair:${reason}`
    );

    applyUserContextToCore(
      {
        ...payload,
        reason,
      },
      opts
    );

    repairSidebarState(
      `repair:${reason}`,
      opts
    );

    /*
      Orden importante:
      1. Usuario.
      2. Visibilidad.
      3. Dropdown.
      Así roles/admin se calculan con identidad actualizada.
    */
    renderUser(reason, opts);
    applyRoleVisibility(reason, opts);
    repairDropdown(
      `repair:${reason}`
    );

    if (opts.rebind === true) {
      bindEvents(
        `repair:${reason}`,
        {
          force:
            true,
        }
      );
    } else if (!eventsBound) {
      bindEvents(
        `repair:${reason}`
      );
    }

    initialized = true;

    scheduleRouteAndIndicator(
      `repair:${reason}`,
      {
        delayMs:
          INDICATOR_DELAY_REPAIR_MS,

        force:
          true,
      }
    );

    afterPaint(() => {
      ensureMenuInteractive(
        `repair:${reason}:after-paint`
      );

      syncRouteAndIndicator(
        `repair:${reason}:after-paint`,
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
        reason,
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
        repairTimer = null;

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

    try {
      const value =
        AppCore?.modules?.[cleanName];

      if (value) {
        return value;
      }
    } catch {}

    return null;
  }

  function exposeCoreAlias(name = "") {
    const cleanName =
      safeText(name, "");

    if (!cleanName) {
      return false;
    }

    try {
      if (AppCore?.[cleanName] !== api) {
        defineHiddenValue(
          AppCore,
          cleanName,
          api
        );
      }

      return true;
    } catch {
      return false;
    }
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
      exposeCoreAlias(cleanName);
      return false;
    }

    let changed = false;

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

              idempotent:
                true,

              source:
                SOURCE,
            }
          );

        if (result !== false) {
          changed = true;
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

                idempotent:
                  true,

                source:
                  SOURCE,
              }
            );

          if (result !== false) {
            changed = true;
          }
        }
      } catch {}
    }

    if (!changed) {
      try {
        if (
          AppCore?.modules &&
          canExtend(AppCore.modules)
        ) {
          AppCore.modules[cleanName] = api;
          changed = true;
        }
      } catch {}
    }

    try {
      AppCore?.registry?.modules?.set?.(
        cleanName,
        api
      );

      changed = true;
    } catch {}

    exposeCoreAlias(cleanName);

    return changed;
  }

  function registerModule() {
    let changed = false;

    for (const name of MODULE_NAMES) {
      if (registerSingleModule(name)) {
        changed = true;
      }
    }

    try {
      exposeCoreAlias("Sidebar");
      exposeCoreAlias("SidebarUI");
      exposeCoreAlias("sidebar");
      exposeCoreAlias("sidebarUI");
    } catch {}

    if (changed) {
      safeEmit(
        "sidebar:module:registered",
        {
          names:
            [...MODULE_NAMES],
        }
      );
    }

    return changed;
  }

  function exposeGlobalBridge() {
    if (!isBrowser()) {
      return false;
    }

    try {
      if (window.SidebarUI !== api) {
        window.SidebarUI = api;
      }

      if (window.OnionSidebarUI !== api) {
        window.OnionSidebarUI = api;
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
          ...opts,
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

    applyUserContextToCore(
      {
        reason:
          "init",
        user:
          getAuthUser() ||
          getStateUser(),
      },
      opts
    );

    syncSidebarState("init", opts);

    /*
      Orden crítico:
      - user primero para que visibility lea roles/admin actuales.
      - visibility después para ocultar/mostrar correctamente.
      - dropdown después para reparar aria/foco sobre DOM final.
    */
    renderUser("init", opts);
    applyRoleVisibility("init", opts);
    repairDropdown("init");

    closeDropdown(
      {
        force:
          true,

        reason:
          "init",
      }
    );

    initialized = true;

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

    initialized = false;
    logoutInFlight = false;

    runtimeState.dropdownOpen = false;

    bindGeneration += 1;

    lastBindAt = 0;
    lastBindReason = "";

    lastRepairAt = 0;
    lastRepairReason = "";

    lastSyncAt = 0;
    lastSyncReason = "";

    lastUserSyncAt = 0;
    lastUserSyncSignature = "";

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

    let mobile = false;
    let open = true;

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

    return sanitizeForEvent({
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

      lastUserSyncAt,
      lastUserSyncSignature,

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
          getRouterPublicPathSafe(),

        routerCanonicalPath:
          getRouterCanonicalPathSafe(),
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

        hasAvatar:
          Boolean(elements.avatarEl),

        hasAvatarImage:
          Boolean(elements.avatarImage),

        hasAvatarFallback:
          Boolean(elements.avatarFallback),

        hasName:
          Boolean(elements.nameEl),

        hasPlan:
          Boolean(elements.planEl),

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

      appUser:
        (() => {
          try {
            const user =
              getStateUser();

            return {
              hasUser:
                hasUsableUser(user),

              id:
                user?.id ||
                user?.userId ||
                user?.uid ||
                null,

              username:
                user?.username ||
                user?.usernameLower ||
                user?.slug ||
                null,

              displayName:
                user?.displayName ||
                user?.name ||
                null,

              role:
                AppCore?.state?.role ||
                user?.role ||
                user?.rol ||
                null,

              hasAvatar:
                Boolean(
                  user?.avatar ||
                    user?.avatarUrl ||
                    user?.picture
                ),

              plan:
                user?.plan ||
                user?.planName ||
                user?.subscriptionPlan ||
                null,
            };
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
    });
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
      refreshUser,
      updateUser,
      syncUser,

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
