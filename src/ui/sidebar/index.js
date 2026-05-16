/* =========================================================
   Onion SPA - Sidebar UI
   Archivo: src/ui/sidebar/index.js

   SIDEBAR UI · SIMPLE ORCHESTRATOR
   - monta sidebar
   - registra módulo sin duplicidades
   - sincroniza refs DOM con AppCore
   - delega identidad/avatar/footer en user.js
   - delega visibilidad por rol en visibility.js
   - delega estado visual en state.js
   - delega dropdown en dropdown.js
   - delega acciones en actions.js
   - delega eventos en events.js
   - footer/greetings priorizan user.name real
   - sin auth/router/http/store paralelos
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import { Router } from "../../router/index.js";

import {
  SCOPE,
  MOBILE_BREAKPOINT,
  SIDEBAR_MODULE_NAME,
  SIDEBAR_MODULE_KEY,
  SIDEBAR_EVENTS,
  SIDEBAR_BIND_DEDUP_WINDOW_MS,
  SIDEBAR_REPAIR_DEDUP_WINDOW_MS,
  SIDEBAR_SYNC_DEDUP_WINDOW_MS,
  SIDEBAR_INDICATOR_DEFAULT_DELAY_MS,
  SIDEBAR_INDICATOR_RECALC_DELAY_MS,
  SIDEBAR_INDICATOR_SETTLED_DELAY_MS,
  SIDEBAR_VISUAL_SYNC_AFTER_TRANSITION_MS,
  normalizeSidebarPublicPath,
  normalizeSidebarRoute,
  redactSidebarSensitiveText,
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

export const SIDEBAR_UI_VERSION = "sidebar-ui-v18-simple-orchestrator";

export const SidebarUI = (() => {
  "use strict";

  const SOURCE = "SidebarUI";
  const OWNER = "index.js";
  const LOG_PREFIX = "[SidebarUI]";

  const BIND_DEDUP_WINDOW_MS = Number(SIDEBAR_BIND_DEDUP_WINDOW_MS) || 250;
  const REPAIR_DEDUP_WINDOW_MS = Number(SIDEBAR_REPAIR_DEDUP_WINDOW_MS) || 180;
  const SYNC_DEDUP_WINDOW_MS = Number(SIDEBAR_SYNC_DEDUP_WINDOW_MS) || 90;
  const USER_SYNC_DEDUP_WINDOW_MS = 80;

  const INDICATOR_DELAY_INIT_MS = Number(SIDEBAR_INDICATOR_RECALC_DELAY_MS) || 32;
  const INDICATOR_DELAY_REFRESH_MS = Number(SIDEBAR_INDICATOR_DEFAULT_DELAY_MS) || 40;
  const INDICATOR_DELAY_REPAIR_MS = (Number(SIDEBAR_INDICATOR_DEFAULT_DELAY_MS) || 40) + 8;
  const INDICATOR_DELAY_ROUTE_MS = (Number(SIDEBAR_INDICATOR_DEFAULT_DELAY_MS) || 40) + 16;
  const INDICATOR_DELAY_TRANSITION_MS =
    Number(SIDEBAR_VISUAL_SYNC_AFTER_TRANSITION_MS) ||
    Number(SIDEBAR_INDICATOR_SETTLED_DELAY_MS) ||
    420;

  const MODULE_NAMES = Object.freeze([
    SIDEBAR_MODULE_KEY || "sidebar",
    SIDEBAR_MODULE_NAME || "SidebarUI",
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
    "result",
    "body",
    "response",
  ]);

  const INACTIVE_STATUSES = Object.freeze([
    "disabled",
    "inactive",
    "deleted",
    "blocked",
    "banned",
    "suspended",
    "revoked",
    "archived",
    "desactivado",
    "inactivo",
    "eliminado",
    "bloqueado",
    "suspendido",
    "archivado",
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

  /* =====================================================
     SAFE HELPERS
  ===================================================== */

  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
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
    if (value === null || value === undefined) return fallback;

    const text = String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text || fallback;
  }

  function safeLower(value, fallback = "") {
    return safeText(value, fallback).toLowerCase();
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function safeArray(value) {
    if (Array.isArray(value)) return value;
    if (value instanceof Set) return [...value];
    if (value === null || value === undefined) return [];
    return [value];
  }

  function safeBoolean(value, fallback = false) {
    if (value === true || value === false) return value;
    if (value === 1 || value === "1") return true;
    if (value === 0 || value === "0") return false;

    const key = safeLower(value, "");
    if (["true", "yes", "si", "sí", "ok", "on", "active", "enabled"].includes(key)) return true;
    if (["false", "no", "off", "inactive", "disabled"].includes(key)) return false;

    return Boolean(fallback);
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clampNumber(value, min = 0, max = Number.POSITIVE_INFINITY) {
    return Math.min(Math.max(safeNumber(value, min), min), max);
  }

  function isFunction(value) {
    return typeof value === "function";
  }

  function canExtend(value) {
    try {
      return Boolean(value && (typeof value === "object" || typeof value === "function") && Object.isExtensible(value));
    } catch {
      return false;
    }
  }

  function defineHiddenValue(target, key, value) {
    if (!target || !key || !canExtend(target)) return false;

    try {
      Object.defineProperty(target, key, {
        value,
        configurable: true,
        enumerable: false,
        writable: true,
      });
      return true;
    } catch {}

    try {
      target[key] = value;
      return true;
    } catch {
      return false;
    }
  }

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;
      return value;
    }

    return null;
  }

  function uniqueStrings(values = []) {
    return [
      ...new Set(
        safeArray(values)
          .flat(Infinity)
          .map((value) => safeText(value, ""))
          .filter(Boolean)
      ),
    ];
  }

  function safeWarn(...args) {
    try {
      if (isFunction(AppCore?.utils?.warn)) {
        AppCore.utils.warn(LOG_PREFIX, ...args);
        return;
      }
    } catch {}

    try {
      console.warn(LOG_PREFIX, ...args);
    } catch {}
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.(LOG_PREFIX, ...args);
    } catch {}
  }

  function safeSetTimeout(callback, ms = 0) {
    if (!isFunction(callback)) return null;

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
    if (!timer || !hasWindow()) return false;

    try {
      window.clearTimeout(timer);
      return true;
    } catch {
      return false;
    }
  }

  function afterPaint(callback) {
    if (!isFunction(callback)) return;

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

  function queryAll(root = null, selector = "") {
    if (!root || !selector) return [];

    try {
      return [...root.querySelectorAll(selector)];
    } catch {
      return [];
    }
  }

  function getPayload(input = {}) {
    const raw = input || {};

    if (raw && typeof raw === "object" && "detail" in raw && raw.detail !== undefined) {
      return safeObject(raw.detail);
    }

    if (raw && typeof raw === "object" && "payload" in raw && raw.payload !== undefined) {
      return safeObject(raw.payload);
    }

    return safeObject(raw);
  }

  function normalizeInvocation(reasonOrPayload = "sidebar", context = {}, fallbackReason = "sidebar") {
    let reason = fallbackReason;
    let payload = {};
    let options = {};

    if (typeof reasonOrPayload === "string") {
      reason = safeText(reasonOrPayload, fallbackReason);
      payload = getPayload(context);
      options = safeObject(context);
    } else {
      payload = getPayload(reasonOrPayload);
      options = { ...payload, ...safeObject(context) };
      reason = safeText(
        payload.reason || payload.phase || payload.event || payload.type || payload.source || context?.reason,
        fallbackReason
      );
    }

    return { reason, payload, options, raw: reasonOrPayload, context: safeObject(context) };
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

  function isDomNodeLike(value) {
    if (!value || typeof value !== "object") return false;

    try {
      return Boolean(typeof Node !== "undefined" && value instanceof Node);
    } catch {}

    try {
      return Boolean(value.nodeType && value.nodeName);
    } catch {
      return false;
    }
  }

  function redactText(value = "") {
    const text = safeText(value, "");
    if (!text) return "";

    try {
      return redactSidebarSensitiveText(text);
    } catch {}

    return text
      .replace(/([?&#](token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi, "$1***")
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
  }

  function sanitizeForEvent(value, depth = 0) {
    if (depth > 5) return "[MaxDepth]";
    if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return redactText(value);
    if (typeof value === "function") return "[Function]";

    if (isDomNodeLike(value)) {
      return {
        node: safeText(value.nodeName, "Node"),
        id: safeText(value.id, ""),
        className: safeText(value.className?.baseVal || value.className, ""),
      };
    }

    if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeForEvent(item, depth + 1));

    if (value && typeof value === "object") {
      const output = {};
      for (const [key, item] of Object.entries(value)) {
        output[key] = /token|secret|password|authorization|credential|jwt|bearer|otp|code/i.test(key)
          ? "***"
          : sanitizeForEvent(item, depth + 1);
      }
      return output;
    }

    return String(value);
  }

  function safeEmit(eventName = "", payload = {}) {
    const name = safeText(eventName, "");
    if (!name) return false;

    const data = safeObject(payload);
    const finalPayload = sanitizeForEvent({
      ...data,
      source: safeText(data.source, SOURCE),
      owner: OWNER,
      version: SIDEBAR_UI_VERSION,
      at: safeText(data.at, safeIsoDate()),
      ts: data.ts || nowTs(),
    });

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
        window.dispatchEvent(new CustomEvent(name, { detail: finalPayload }));
        return true;
      }
    } catch {}

    return false;
  }

  /* =====================================================
     USER CONTEXT
  ===================================================== */

  function getAuthUser() {
    try {
      return Auth?.getUser?.() || Auth?.getCurrentUser?.() || Auth?.user || null;
    } catch {
      return null;
    }
  }

  function getAuthRole() {
    try {
      return Auth?.getCurrentRole?.() || Auth?.getRole?.() || Auth?.role || null;
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
    const state = getState();

    return (
      state.user ||
      state.currentUser ||
      state.sessionUser ||
      state.authUser ||
      state.account ||
      state.profile ||
      state.session?.user ||
      state.sessionData?.user ||
      null
    );
  }

  function resolveAvatar(user = {}) {
    const source = safeObject(user);
    const profile = safeObject(source.profile);
    const raw = safeObject(source.raw);

    if (source.hasAvatar === false || source.has_avatar === false || profile.hasAvatar === false || raw.hasAvatar === false) return null;

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
      safeText(profile.avatar, "") ||
      safeText(profile.avatarUrl, "") ||
      safeText(raw.avatar, "") ||
      safeText(raw.avatarUrl, "") ||
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
    const role = safeLower(value || "user", "user") || "user";
    return ["admin", "administrator", "administrador", "superadmin", "super_admin", "owner", "root"].includes(role)
      ? "admin"
      : "user";
  }

  function isUserActive(user = {}) {
    const source = safeObject(user);
    const status = safeLower(source.status || source.estado || source.state || source.accountStatus || "", "");

    if (
      source.deletedAt ||
      source.deleted === true ||
      source.disabled === true ||
      source.blocked === true ||
      source.banned === true ||
      source.suspended === true ||
      source.revoked === true ||
      source.archived === true
    ) {
      return false;
    }

    if (INACTIVE_STATUSES.includes(status)) return false;

    const activeCandidate = source.active ?? source.isActive ?? source.is_active ?? source.enabled ?? source.isEnabled;
    if (activeCandidate === undefined || activeCandidate === null || activeCandidate === "") return true;

    return safeBoolean(activeCandidate, true);
  }

  function hasUsableUser(user = {}) {
    const source = safeObject(user);
    if (!Object.keys(source).length || !isUserActive(source)) return false;

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

  function resolveFullName(source = {}, ctx = {}) {
    const user = safeObject(source);
    const profile = safeObject(user.profile);
    const raw = safeObject(user.raw);
    const context = safeObject(ctx);

    return safeText(
      first(
        user.name,
        user.nombre,
        user.fullName,
        user.full_name,
        user.displayName,
        user.display_name,
        profile.name,
        profile.nombre,
        profile.fullName,
        profile.displayName,
        raw.name,
        raw.nombre,
        raw.fullName,
        raw.displayName,
        context.name,
        context.nombre,
        context.fullName,
        context.displayName,
        user.username,
        context.username,
        user.email,
        context.email,
        "Usuario"
      ),
      "Usuario"
    );
  }

  function normalizeUserForSidebar(user = {}, extra = {}) {
    const source = safeObject(user);
    if (!Object.keys(source).length) return null;

    const ctx = safeObject(extra);
    const userId = safeText(first(source.userId, source.user_id, source.uid, source.sub, source.id, source._id, ctx.userId, ctx.uid, ctx.sub), "");
    const email = safeText(first(source.email, source.mail, ctx.email), "");
    const fullName = resolveFullName(source, ctx);

    const username = safeText(
      first(
        source.username,
        source.userName,
        source.user_name,
        source.usernameLower,
        source.username_lower,
        source.slug,
        ctx.username,
        email,
        userId
      ),
      ""
    );

    const usernameLower = normalizeUsername(first(source.usernameLower, source.username_lower, username) || "");
    const slug = normalizeUsername(first(source.slug, source.usernameSlug, source.username_slug, usernameLower, username, email, userId) || "");
    const role = normalizeRole(first(source.role, source.rol, source.userRole, source.user_role, source.type, source.tipo, ctx.role, ctx.rol, getState().role, getAuthRole(), "user"));
    const avatar = resolveAvatar(source) || safeText(ctx.avatarUrl || ctx.avatar || "", "") || null;
    const plan = safeText(
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

      id: source.id || userId || null,
      userId: source.userId || userId || null,
      uid: source.uid || userId || null,
      sub: source.sub || userId || null,

      email: email || null,
      emailLower: source.emailLower || source.email_lower || (email ? email.toLowerCase() : null),
      email_lower: source.email_lower || source.emailLower || (email ? email.toLowerCase() : null),

      username: username || null,
      usernameLower: usernameLower || null,
      username_lower: source.username_lower || usernameLower || null,
      slug: slug || null,

      // Regla crítica: footer y greetings siempre priorizan el nombre real del JSON.
      name: fullName,
      nombre: source.nombre || fullName,
      displayName: fullName,
      display_name: fullName,
      fullName,
      full_name: fullName,
      footerName: fullName,
      greetingName: fullName,

      role,
      rol: role,
      userRole: role,
      roles: uniqueStrings([role, ...safeArray(source.roles)]),

      permissions: safeArray(source.permissions || source.permisos),
      permisos: safeArray(source.permisos || source.permissions),

      avatar: avatar || null,
      avatarUrl: avatar || null,
      picture: avatar || null,
      hasAvatar: source.hasAvatar === true || source.has_avatar === true || Boolean(avatar),

      plan: plan || source.plan || null,
      planName: plan || source.planName || null,
      subscriptionPlan: plan || source.subscriptionPlan || null,

      active: isUserActive(source),
    };
  }

  function extractUserFromSource(source = {}) {
    const data = safeObject(source);

    for (const key of USER_SOURCE_KEYS) {
      if (hasUsableUser(data[key])) return data[key];
    }

    for (const key of SESSION_SOURCE_KEYS) {
      const nested = safeObject(data[key]);

      for (const userKey of USER_SOURCE_KEYS) {
        if (hasUsableUser(nested[userKey])) return nested[userKey];
      }

      if (hasUsableUser(nested.user)) return nested.user;
    }

    if (hasUsableUser(data.snapshot?.user)) return data.snapshot.user;
    if (hasUsableUser(data.payload?.snapshot?.user)) return data.payload.snapshot.user;

    if (safeText(data.name || data.displayName || data.username || data.email, "")) {
      return {
        id: data.userId || data.id || null,
        userId: data.userId || data.id || null,
        username: data.username || null,
        email: data.email || null,
        name: data.name || data.displayName || data.username || data.email || "Usuario",
        displayName: data.displayName || data.name || data.username || data.email || "Usuario",
        role: data.role || data.rol || null,
        avatar: data.avatar || data.avatarUrl || null,
        avatarUrl: data.avatarUrl || data.avatar || null,
        plan: data.plan || data.planName || data.subscriptionPlan || null,
      };
    }

    return null;
  }

  function isExplicitUnauthPayload(reasonOrPayload = {}, context = {}) {
    const payload = getPayload(reasonOrPayload);
    const ctx = safeObject(context);
    const reason = safeLower(payload.reason || payload.event || payload.type || payload.source || ctx.reason || ctx.event || ctx.type || ctx.source || "", "");
    const clearReason = /logout|session:cleared|session-cleared|auth:logout|clear-session|session_cleared|unauth|login_failed|login-failed|auth-state-cleared/.test(reason);
    const explicitFalse = payload.authenticated === false || ctx.authenticated === false || payload.isAuthenticated === false || ctx.isAuthenticated === false;
    const explicitNullUser = payload.user === null || payload.currentUser === null || payload.authUser === null || payload.sessionUser === null || ctx.user === null || ctx.currentUser === null || ctx.authUser === null || ctx.sessionUser === null;

    return Boolean(clearReason || (explicitFalse && explicitNullUser));
  }

  function clearUserContextInCore(reason = "clear-user-context") {
    const patch = {
      authenticated: false,
      isAuthenticated: false,
      user: null,
      currentUser: null,
      authUser: null,
      sessionUser: null,
      profile: null,
      account: null,
      role: null,
      rol: null,
      userRole: null,
      roles: [],
      permissions: [],
      permisos: [],
      currentResolvedUsername: null,
      resolvedUsername: null,
      sidebarUserSyncedAt: safeIsoDate(),
      sidebarUserSyncedReason: reason,
    };

    try {
      if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, patch);
    } catch {}

    for (const method of ["setState", "patchState"]) {
      try {
        AppCore?.[method]?.(patch, {
          source: "sidebar:user-context-clear",
          emit: false,
          emitState: false,
          silent: true,
        });
      } catch {}
    }

    lastUserSyncSignature = "";
    lastUserSyncAt = 0;

    return { applied: true, cleared: true, user: null, role: "" };
  }

  function extractUserContext(reasonOrPayload = {}, context = {}) {
    const payload = getPayload(reasonOrPayload);
    const ctx = safeObject(context);

    if (isExplicitUnauthPayload(reasonOrPayload, context)) {
      return {
        user: null,
        authenticated: false,
        role: "",
        source: safeText(payload.source || ctx.source || SOURCE, SOURCE),
        clear: true,
      };
    }

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

    const extra = {
      ...payload,
      ...ctx,
      ...safeObject(ctx.snapshot),
      ...safeObject(payload.snapshot),
    };

    const normalized = normalizeUserForSidebar(userCandidate, extra);

    return {
      user: normalized,
      authenticated: payload.authenticated === true || ctx.authenticated === true || getState().authenticated === true,
      role: safeText(extra.role || extra.rol || normalized?.role || getState().role || "", ""),
      source: safeText(extra.source || payload.source || ctx.source || SOURCE, SOURCE),
      clear: false,
    };
  }

  function getUserSignature(user = null, role = "") {
    if (!hasUsableUser(user)) return "";

    return [
      safeText(user.id || user.userId || user.uid || user.sub, ""),
      safeText(user.username || user.usernameLower || user.slug, ""),
      safeText(user.email || user.emailLower, ""),
      safeText(user.name || user.displayName || user.fullName || user.footerName || user.greetingName, ""),
      safeText(user.avatarUrl || user.avatar || user.picture, ""),
      safeText(role || user.role || user.rol, ""),
      safeText(user.plan || user.planName || user.subscriptionPlan, ""),
    ].join("|");
  }

  function shouldDedupeUserSync(user = null, role = "", reason = "", force = false) {
    if (force === true) return false;

    const signature = redactText([safeText(reason, ""), getUserSignature(user, role)].join("::"));
    const ts = nowTs();

    if (signature && signature === lastUserSyncSignature && ts - lastUserSyncAt < USER_SYNC_DEDUP_WINDOW_MS) return true;

    lastUserSyncSignature = signature;
    lastUserSyncAt = ts;

    return false;
  }

  function applyUserContextToCore(reasonOrPayload = {}, context = {}) {
    const { reason, options } = normalizeInvocation(reasonOrPayload, context, "user-context");
    const userContext = extractUserContext(reasonOrPayload, context);

    if (userContext.clear) return clearUserContextInCore(reason);

    const user = userContext.user;
    if (!hasUsableUser(user)) return { applied: false, user: null, role: userContext.role || "" };

    const role = normalizeRole(userContext.role || user.role || user.rol || "user");

    if (shouldDedupeUserSync(user, role, reason, options.force === true)) {
      return { applied: false, deduped: true, user, role };
    }

    const authenticated = userContext.authenticated || getState().authenticated === true;
    const username = user.slug || user.usernameLower || user.username || getState().currentResolvedUsername || null;

    const patch = {
      user,
      currentUser: user,
      authUser: user,
      sessionUser: user,
      profile: user,
      account: user,

      role,
      rol: role,
      userRole: role,
      roles: uniqueStrings([role, ...safeArray(user.roles)]),

      name: user.name,
      displayName: user.displayName,
      fullName: user.fullName,
      footerName: user.footerName,
      greetingName: user.greetingName,

      currentResolvedUsername: username,
      resolvedUsername: username,

      sidebarUserSyncedAt: safeIsoDate(),
      sidebarUserSyncedReason: reason,
    };

    if (authenticated) {
      patch.authenticated = true;
      patch.isAuthenticated = true;
    }

    try {
      if (AppCore?.state && typeof AppCore.state === "object") Object.assign(AppCore.state, patch);
    } catch {}

    for (const method of ["setState", "patchState"]) {
      try {
        AppCore?.[method]?.(patch, {
          source: "sidebar:user-context",
          emit: false,
          emitState: false,
          silent: true,
        });
      } catch {}
    }

    return { applied: true, user, role };
  }

  /* =====================================================
     SHELL / DOM
  ===================================================== */

  function isShellBlocked() {
    try {
      return Boolean(isRealShellHidden(AppCore));
    } catch {}

    try {
      return Boolean(isDomRealShellHidden(AppCore));
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
      if (!AppCore.dom || typeof AppCore.dom !== "object") AppCore.dom = {};

      Object.assign(AppCore.dom, {
        sidebar: el.sidebar || null,
        sidebarRoot: el.sidebar || null,
        sidebarMount: el.sidebarMount || null,
        sidebarMenu: el.sidebarMenu || null,
        sidebarRecents: el.sidebarRecents || null,
        sidebarAvatar: el.avatarEl || null,
        sidebarAvatarImage: el.avatarImage || null,
        sidebarAvatarFallback: el.avatarFallback || null,
        sidebarName: el.nameEl || null,
        sidebarUserName: el.nameEl || null,
        sidebarUserPlan: el.planEl || null,
        sidebarPlan: el.planEl || null,
        sidebarLogo: el.logoEl || null,
        userToggle: el.userToggle || null,
        userDropdown: el.userDropdown || null,
        logoutBtn: el.logoutBtn || null,
        sidebarToggle: el.sidebarToggle || el.toggleBtn || null,
        toggleBtn: el.sidebarToggle || el.toggleBtn || null,
        sidebarMobileToggle: el.mobileToggleBtn || null,
        mobileSidebarToggle: el.mobileToggleBtn || null,
        serverLink: el.serverLink || null,
      });
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
    if (!isBrowser()) return false;

    const { sidebarMenu } = getElements(AppCore);
    if (!sidebarMenu) return false;

    let repaired = false;

    try {
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
      safeEmit(SIDEBAR_EVENTS?.menuInteractionRestored || "sidebar:menu:interaction-restored", {
        reason,
        snapshot: getSidebarSnapshot(),
      });
    }

    return repaired;
  }

  function mountAndRefresh(reason = "mount") {
    try {
      mountSidebar(AppCore, { reason });
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
      if (!AppCore.state || typeof AppCore.state !== "object") AppCore.state = {};

      const desiredOpen = getDesiredSidebarOpenState(AppCore);

      if (typeof AppCore.state.sidebarDesktopOpen !== "boolean") AppCore.state.sidebarDesktopOpen = mobile ? true : Boolean(desiredOpen);
      if (typeof AppCore.state.sidebarMobileOpen !== "boolean") AppCore.state.sidebarMobileOpen = false;

      AppCore.state.sidebarOpen = mobile ? Boolean(AppCore.state.sidebarMobileOpen) : Boolean(AppCore.state.sidebarDesktopOpen);
      AppCore.state.sidebarMode = mobile ? "mobile" : "desktop";
      AppCore.state.sidebarLastMode = AppCore.state.sidebarMode;

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

  /* =====================================================
     ROUTES
  ===================================================== */

  function normalizeRoutePath(value = "") {
    const raw = safeText(value, "");
    if (!raw) return "";

    try {
      return normalizeSidebarPublicPath(raw, { preserveSearch: true, preserveHash: false });
    } catch {}

    try {
      if (isBrowser()) {
        const url = new URL(raw, window.location.origin);

        if (url.hash && (url.hash.startsWith("#/") || url.hash.startsWith("#!"))) {
          return url.hash.replace(/^#!\/?/, "/").replace(/^#\/?/, "/") || "/";
        }

        return `${url.pathname || "/"}${url.search || ""}`;
      }
    } catch {}

    if (raw.startsWith("#/") || raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/").replace(/^#\/?/, "/") || "/";
    return raw.startsWith("/") ? raw : `/${raw}`;
  }

  function normalizeCanonicalRoutePath(value = "") {
    try {
      return normalizeSidebarRoute(value || "/") || "/";
    } catch {
      return normalizeRoutePath(value || "/").split("?")[0] || "/";
    }
  }

  function getBrowserPath() {
    if (!isBrowser()) return "/";

    try {
      const hash = window.location.hash || "";
      if (hash.startsWith("#/") || hash.startsWith("#!")) return normalizeRoutePath(hash) || "/";
      return normalizeRoutePath(`${window.location.pathname || "/"}${window.location.search || ""}`) || "/";
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
    const opts = safeObject(options);
    const payload = safeObject(opts.payload);

    const route = first(
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

    const normalized = normalizeRoutePath(route) || "/";

    return {
      ...payload,
      ...opts,
      route: normalized,
      publicPath: normalized,
      path: normalized,
      currentPublicPath: normalized,
      canonicalPath: normalizeCanonicalRoutePath(
        opts.canonicalPath || payload.canonicalPath || getRouterCanonicalPathSafe() || AppCore?.state?.canonicalPath || AppCore?.state?.route || normalized
      ) || normalized,
    };
  }

  function getRouteFromElement(element = null) {
    if (!element) return "";

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
    const { sidebarMenu } = getElements(AppCore);
    if (!sidebarMenu) return [];

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

  /* =====================================================
     USER / VISIBILITY
  ===================================================== */

  function isAdmin() {
    try {
      return Boolean(isAdminBase(AppCore));
    } catch {
      return false;
    }
  }

  function renderUser(reasonOrPayload = "render-user", context = {}) {
    const { reason, payload } = normalizeInvocation(reasonOrPayload, context, "render-user");
    const userContext = applyUserContextToCore({ ...payload, reason }, context);

    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    try {
      return renderUserBase(AppCore, {
        reason,
        user: userContext.user || getStateUser(),
        role: userContext.role || getState().role || "",
        source: SOURCE,
      });
    } catch {
      try {
        return renderUserBase(AppCore);
      } catch (error) {
        safeWarn("renderUserBase falló.", error);
        return false;
      }
    }
  }

  function refreshUser(reasonOrPayload = "refresh-user", context = {}) {
    return renderUser(reasonOrPayload, context);
  }

  function updateUser(reasonOrPayload = "update-user", context = {}) {
    return renderUser(reasonOrPayload, context);
  }

  function syncUser(reasonOrPayload = "sync-user", context = {}) {
    const { reason } = normalizeInvocation(reasonOrPayload, context, "sync-user");
    const userRendered = renderUser(reasonOrPayload, context);
    const visibilitySynced = applyRoleVisibility(`${reason}:visibility`, context);
    return Boolean(userRendered || visibilitySynced);
  }

  function applyRoleVisibility(reasonOrPayload = "apply-role-visibility", context = {}) {
    const { reason, payload } = normalizeInvocation(reasonOrPayload, context, "apply-role-visibility");

    applyUserContextToCore({ ...payload, reason }, context);
    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    let result = false;

    try {
      result = applyRoleVisibilityBase(AppCore, null, isAdmin);
    } catch (error) {
      safeWarn("applyRoleVisibilityBase falló.", error);
    }

    scheduleRouteAndIndicator(reason, { delayMs: INDICATOR_DELAY_REFRESH_MS, force: true });
    return result;
  }

  /* =====================================================
     STATE / INDICATOR
  ===================================================== */

  function syncSidebarState(reasonOrPayload = "sync-sidebar-state", context = {}) {
    const { reason } = normalizeInvocation(reasonOrPayload, context, "sync-sidebar-state");
    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);
    return syncSidebarStateBase(AppCore, closeDropdown);
  }

  function repairSidebarState(reasonOrPayload = "repair-sidebar-state", context = {}) {
    const { reason } = normalizeInvocation(reasonOrPayload, context, "repair-sidebar-state");
    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    const result = repairSidebarStateBase(AppCore, closeDropdown);
    scheduleRouteAndIndicator(reason, { delayMs: INDICATOR_DELAY_REPAIR_MS, force: true });
    return result;
  }

  function syncRouteAndIndicator(reasonOrPayload = "route-sync", options = {}) {
    const { reason, options: opts } = normalizeInvocation(reasonOrPayload, options, "route-sync");
    const payload = resolveRoutePayload(opts);

    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);

    const activeItem = syncActiveMenuItem(AppCore, {
      ...payload,
      reason,
      mutate: true,
      preferExplicitRoute: opts.preferExplicitRoute === true,
      forceRoute: opts.forceRoute === true,
    });

    scheduleActiveMenuIndicator(AppCore, {
      ...payload,
      reason,
      activeItem,
      delayMs: typeof opts.delayMs === "number" ? opts.delayMs : INDICATOR_DELAY_ROUTE_MS,
      reveal: opts.reveal !== false,
      force: opts.force === true,
      preferExplicitRoute: opts.preferExplicitRoute === true,
      forceRoute: opts.forceRoute === true,
    });

    safeEmit(SIDEBAR_EVENTS?.activeRouteSynced || "sidebar:active-route:synced", {
      reason,
      route: payload.route,
      publicPath: payload.publicPath,
      canonicalPath: payload.canonicalPath,
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

      if (opts.bindGenerationSafe !== false && generation !== bindGeneration) return;

      afterPaint(() => {
        if (opts.bindGenerationSafe !== false && generation !== bindGeneration) return;
        syncRouteAndIndicator(reason, opts);
      });
    }, clampNumber(opts.delayMs, 0, 5000));

    return true;
  }

  /* =====================================================
     DROPDOWN / ACTIONS
  ===================================================== */

  function ensureSidebarOpenForUserMenu(options = {}) {
    const opts = safeObject(options);
    return actionEnsureSidebarOpenForUserMenu({
      AppCore,
      closeDropdown,
      syncSidebarState,
      reason: safeText(opts.reason || opts.source, "ensure-sidebar-open-for-user-menu"),
    });
  }

  function openDropdown(options = {}) {
    if (isShellBlocked()) return false;

    refreshSidebarDomRefs();
    ensureMenuInteractive("open-dropdown");

    const result = openDropdownBase(AppCore, runtimeState, ensureSidebarOpenForUserMenu, safeObject(options));
    scheduleRouteAndIndicator("open-dropdown", { delayMs: 32, force: false });
    return result;
  }

  function closeDropdown(options = {}) {
    refreshSidebarDomRefs();
    ensureMenuInteractive("close-dropdown");

    const result = closeDropdownBase(AppCore, runtimeState, safeObject(options));
    scheduleRouteAndIndicator("close-dropdown", { delayMs: 24, force: false });
    return result;
  }

  function toggleDropdown(options = {}) {
    if (isShellBlocked()) return false;

    refreshSidebarDomRefs();
    ensureMenuInteractive("toggle-dropdown");

    const result = toggleDropdownBase(AppCore, runtimeState, ensureSidebarOpenForUserMenu, safeObject(options));
    scheduleRouteAndIndicator("toggle-dropdown", { delayMs: 32, force: false });
    return result;
  }

  function repairDropdown(reason = "repair-dropdown") {
    refreshSidebarDomRefs();
    ensureMenuInteractive(reason);
    return repairDropdownBase(AppCore, runtimeState, { emit: true, reason });
  }

  function sidebarAction(action, reason, indicatorDelay = INDICATOR_DELAY_TRANSITION_MS) {
    const result = action();
    scheduleRouteAndIndicator(reason, { delayMs: indicatorDelay, force: true });
    return result;
  }

  function setSidebarOpen(open, options = {}) {
    const opts = safeObject(options);
    return sidebarAction(
      () => actionSetSidebarOpen({ AppCore, open: Boolean(open), closeDropdown, syncSidebarState, reason: safeText(opts.reason || opts.source, "set-sidebar-open") }),
      "set-sidebar-open"
    );
  }

  function openSidebar(options = {}) {
    const opts = safeObject(options);
    return sidebarAction(
      () => actionOpenSidebar({ AppCore, closeDropdown, syncSidebarState, reason: safeText(opts.reason || opts.source, "open-sidebar") }),
      "open-sidebar"
    );
  }

  function closeSidebar(options = {}) {
    const opts = safeObject(options);
    return sidebarAction(
      () => actionCloseSidebar({ AppCore, closeDropdown, syncSidebarState, reason: safeText(opts.reason || opts.source, "close-sidebar") }),
      "close-sidebar"
    );
  }

  function toggleSidebar(options = {}) {
    const opts = safeObject(options);
    return sidebarAction(
      () => actionToggleSidebar({ AppCore, closeDropdown, syncSidebarState, reason: safeText(opts.reason || opts.source, "toggle-sidebar") }),
      "toggle-sidebar"
    );
  }

  function collapseSidebar(options = {}) {
    const opts = safeObject(options);
    return sidebarAction(
      () => actionCollapseSidebar({ AppCore, closeDropdown, syncSidebarState, reason: safeText(opts.reason || opts.source, "collapse-sidebar") }),
      "collapse-sidebar"
    );
  }

  function expandSidebar(options = {}) {
    const opts = safeObject(options);
    return sidebarAction(
      () => actionExpandSidebar({ AppCore, closeDropdown, syncSidebarState, reason: safeText(opts.reason || opts.source, "expand-sidebar") }),
      "expand-sidebar"
    );
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
    const opts = safeObject(options);
    const target = normalizeRoutePath(route);
    if (!target) return false;

    const result = await actionNavigateFromSidebar({
      AppCore,
      Router,
      target,
      closeDropdown,
      closeSidebarOnMobile: true,
      syncSidebarState,
      replace: opts.replace === true || opts.replaceState === true,
      source: safeText(opts.source, "sidebar-ui"),
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
      setLogoutInFlight: (value) => {
        logoutInFlight = Boolean(value);
      },
      isLogoutInFlight: () => logoutInFlight,
    });

    scheduleRouteAndIndicator("logout", { delayMs: 80, force: true });
    return result;
  }

  /* =====================================================
     EVENTS / CLEANUP
  ===================================================== */

  function cleanupBoundEvents(options = {}) {
    const opts = safeObject(options);

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

    if (opts.preserveBindingFlag !== true) bindingEvents = false;

    ensureMenuInteractive("cleanup-bound-events");
    return true;
  }

  function cleanup() {
    cleanupBoundEvents();

    try {
      closeDropdown({ force: true, reason: "sidebar-cleanup" });
    } catch {}

    ensureMenuInteractive("cleanup");
    return true;
  }

  function bindEvents(reason = "bind", options = {}) {
    const opts = safeObject(options);
    const cleanReason = safeText(reason, "bind");
    const ts = nowTs();

    lastBindReason = cleanReason;

    const { mounted } = mountAndRefresh(cleanReason);

    if (!mounted) {
      safeWarn("No se pudo bindear sidebar: shell ausente.", { reason: cleanReason });
      return api;
    }

    ensureMenuInteractive(`bind-events:${cleanReason}`);

    if (eventsBound && opts.force !== true) {
      scheduleRouteAndIndicator(`bind-events:already-bound:${cleanReason}`, { delayMs: INDICATOR_DELAY_REFRESH_MS, force: true });
      safeEmit(SIDEBAR_EVENTS?.eventsBindSkipped || "sidebar:events:bind-skipped", {
        reason: cleanReason,
        cause: "already-bound",
        generation: bindGeneration,
        sinceLastBindMs: ts - lastBindAt,
        snapshot: getSidebarSnapshot(),
      });
      return api;
    }

    if (bindingEvents) {
      safeEmit(SIDEBAR_EVENTS?.eventsBindIgnored || "sidebar:events:bind-ignored", {
        reason: cleanReason,
        cause: "binding-in-progress",
        generation: bindGeneration,
      });
      return api;
    }

    if (ts - lastBindAt < BIND_DEDUP_WINDOW_MS && opts.force !== true) {
      safeEmit(SIDEBAR_EVENTS?.eventsBindIgnored || "sidebar:events:bind-ignored", {
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
      cleanupBoundEvents({ preserveBindingFlag: true });

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
          refreshUser,
          updateUser,
          syncUser,
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

      eventsBound = Boolean(domEventsCleanup || coreEventsCleanup);
      lastBindAt = nowTs();

      ensureMenuInteractive(`bind-events:${cleanReason}:after`);
      scheduleRouteAndIndicator(`bind-events:${cleanReason}`, { delayMs: 64, force: true });

      safeEmit(SIDEBAR_EVENTS?.eventsBound || "sidebar:events:bound", {
        reason: cleanReason,
        generation: bindGeneration,
        scope: SCOPE,
        domBound: Boolean(domEventsCleanup),
        coreBound: Boolean(coreEventsCleanup),
        eventsBound,
        snapshot: getSidebarSnapshot(),
      });

      return api;
    } finally {
      bindingEvents = false;
    }
  }

  function rebindEvents(reason = "rebind") {
    return bindEvents(reason, { force: true });
  }

  /* =====================================================
     REFRESH / SYNC / REPAIR
  ===================================================== */

  function sync(reasonOrPayload = "sync", options = {}) {
    const { reason, options: opts, payload } = normalizeInvocation(reasonOrPayload, options, "sync");
    const ts = nowTs();

    if (opts.force !== true && reason === lastSyncReason && ts - lastSyncAt < SYNC_DEDUP_WINDOW_MS) {
      scheduleRouteAndIndicator(`sync:deduped:${reason}`, { delayMs: INDICATOR_DELAY_REFRESH_MS, force: opts.force === true });
      return api;
    }

    lastSyncAt = ts;
    lastSyncReason = reason;

    mountAndRefresh(reason);
    sanitizeSidebarDom(`sync:${reason}`);
    applyUserContextToCore({ ...payload, reason }, opts);
    syncSidebarState(reason, opts);

    if (opts.user !== false) renderUser(reason, opts);
    if (opts.visibility !== false) applyRoleVisibility(reason, opts);
    if (opts.dropdownRepair === true) repairDropdown(`sync:${reason}`);

    scheduleRouteAndIndicator(`sync:${reason}`, {
      ...opts,
      delayMs: typeof opts.delayMs === "number" ? opts.delayMs : INDICATOR_DELAY_REFRESH_MS,
      force: opts.force === true,
    });

    if (opts.emit === true) safeEmit("sidebar:synced", { reason, snapshot: getSidebarSnapshot() });
    return api;
  }

  function refresh(reasonOrPayload = "refresh", context = {}) {
    const { reason, options, payload } = normalizeInvocation(reasonOrPayload, context, "refresh");

    mountAndRefresh(reason);
    ensureRuntimeStateDefaults();
    sanitizeSidebarDom(`refresh:${reason}`);
    applyUserContextToCore({ ...payload, reason }, options);
    syncSidebarState(reason, options);
    renderUser(reason, options);
    applyRoleVisibility(reason, options);
    repairDropdown(`refresh:${reason}`);

    scheduleRouteAndIndicator(`refresh:${reason}`, { delayMs: INDICATOR_DELAY_REFRESH_MS, force: true });
    safeEmit(SIDEBAR_EVENTS?.refreshed || "sidebar:refreshed", { reason, snapshot: getSidebarSnapshot() });

    return api;
  }

  function repair(reasonOrPayload = "repair", options = {}) {
    const { reason, options: opts, payload } = normalizeInvocation(reasonOrPayload, options, "repair");
    const ts = nowTs();

    if (opts.force !== true && ts - lastRepairAt < REPAIR_DEDUP_WINDOW_MS) {
      scheduleRouteAndIndicator(`repair:deduped:${reason}`, { delayMs: INDICATOR_DELAY_REPAIR_MS, force: true });
      safeEmit(SIDEBAR_EVENTS?.repairDeduped || "sidebar:repair:deduped", {
        reason,
        sinceLastRepairMs: ts - lastRepairAt,
        lastRepairReason,
        snapshot: getSidebarSnapshot(),
      });
      return api;
    }

    lastRepairAt = ts;
    lastRepairReason = reason;

    const { mounted } = mountAndRefresh(reason);
    if (!mounted) {
      safeWarn("No se pudo reparar sidebar: shell ausente.", { reason });
      return api;
    }

    ensureRuntimeStateDefaults();
    sanitizeSidebarDom(`repair:${reason}`);
    applyUserContextToCore({ ...payload, reason }, opts);
    repairSidebarState(`repair:${reason}`, opts);
    renderUser(reason, opts);
    applyRoleVisibility(reason, opts);
    repairDropdown(`repair:${reason}`);

    if (opts.rebind === true) bindEvents(`repair:${reason}`, { force: true });
    else if (!eventsBound) bindEvents(`repair:${reason}`);

    initialized = true;

    scheduleRouteAndIndicator(`repair:${reason}`, { delayMs: INDICATOR_DELAY_REPAIR_MS, force: true });

    afterPaint(() => {
      ensureMenuInteractive(`repair:${reason}:after-paint`);
      syncRouteAndIndicator(`repair:${reason}:after-paint`, { delayMs: 0, force: true });
    });

    safeEmit(SIDEBAR_EVENTS?.repaired || "sidebar:repaired", { reason, snapshot: getSidebarSnapshot(), isAdmin: isAdmin() });
    return api;
  }

  function scheduleRepair(reason = "scheduled-repair", options = {}) {
    const opts = safeObject(options);
    clearRepairTimer();

    repairTimer = safeSetTimeout(() => {
      repairTimer = null;
      repair(reason, { ...opts, force: opts.force === true });
    }, clampNumber(opts.delayMs, 0, 1000));

    return api;
  }

  function restoreSidebarState(snapshot = null) {
    const data = safeObject(snapshot);
    if (!Object.keys(data).length) return false;
    if (isMobileViewport(MOBILE_BREAKPOINT)) return false;

    const desiredOpen = Boolean(typeof data.desktopOpen === "boolean" ? data.desktopOpen : data.open);

    try {
      if (AppCore?.state && typeof AppCore.state === "object") {
        AppCore.state.sidebarDesktopOpen = desiredOpen;
        AppCore.state.sidebarOpen = desiredOpen;
        AppCore.state.sidebarMode = "desktop";
        AppCore.state.sidebarLastMode = "desktop";
      }
    } catch {}

    const result = actionSetSidebarOpen({ AppCore, open: desiredOpen, closeDropdown, syncSidebarState, reason: "restore-sidebar-state" });
    scheduleRouteAndIndicator("restore-sidebar-state", { delayMs: INDICATOR_DELAY_TRANSITION_MS, force: true });
    return result;
  }

  /* =====================================================
     MODULE REGISTRATION
  ===================================================== */

  function getRegisteredModule(name = "") {
    const cleanName = safeText(name, "");
    if (!cleanName) return null;

    try {
      return AppCore?.modules?.get?.(cleanName) || null;
    } catch {}

    try {
      return AppCore?.registry?.modules?.get?.(cleanName) || null;
    } catch {}

    try {
      return AppCore?.modules?.[cleanName] || null;
    } catch {
      return null;
    }
  }

  function exposeCoreAlias(name = "") {
    const cleanName = safeText(name, "");
    if (!cleanName) return false;

    try {
      if (AppCore?.[cleanName] !== api) defineHiddenValue(AppCore, cleanName, api);
      return true;
    } catch {
      return false;
    }
  }

  function registerSingleModule(name = "") {
    const cleanName = safeText(name, "");
    if (!cleanName) return false;

    if (getRegisteredModule(cleanName) === api) {
      exposeCoreAlias(cleanName);
      return false;
    }

    let changed = false;

    try {
      if (isFunction(AppCore?.modules?.register)) {
        const result = AppCore.modules.register(cleanName, api, {
          replace: true,
          overwrite: true,
          silentDuplicate: true,
          idempotent: true,
          source: SOURCE,
        });
        changed = result !== false;
      }
    } catch {}

    if (!changed) {
      try {
        if (isFunction(AppCore?.modules?.set)) {
          const result = AppCore.modules.set(cleanName, api, {
            replace: true,
            overwrite: true,
            silentDuplicate: true,
            idempotent: true,
            source: SOURCE,
          });
          changed = result !== false;
        }
      } catch {}
    }

    if (!changed) {
      try {
        if (AppCore?.modules && canExtend(AppCore.modules)) {
          AppCore.modules[cleanName] = api;
          changed = true;
        }
      } catch {}
    }

    try {
      AppCore?.registry?.modules?.set?.(cleanName, api);
      changed = true;
    } catch {}

    exposeCoreAlias(cleanName);
    return changed;
  }

  function registerModule() {
    let changed = false;

    for (const name of MODULE_NAMES) {
      if (registerSingleModule(name)) changed = true;
    }

    exposeCoreAlias("Sidebar");
    exposeCoreAlias("SidebarUI");
    exposeCoreAlias("sidebar");
    exposeCoreAlias("sidebarUI");

    if (changed) safeEmit("sidebar:module:registered", { names: [...MODULE_NAMES] });
    return changed;
  }

  function exposeGlobalBridge() {
    if (!isBrowser()) return false;

    try {
      window.SidebarUI = api;
      window.OnionSidebarUI = api;
      return true;
    } catch {
      return false;
    }
  }

  /* =====================================================
     INIT / DESTROY
  ===================================================== */

  function init(options = {}) {
    const opts = safeObject(options);

    if (initialized) {
      registerModule();
      exposeGlobalBridge();

      if (!eventsBound) bindEvents("init-already-initialized", { force: false });

      return sync("init-already-initialized", { ...opts, force: opts.force === true, emit: false });
    }

    const { mounted } = mountAndRefresh("init");
    if (!mounted) {
      safeWarn("No se pudo montar sidebar.");
      return api;
    }

    ensureRuntimeStateDefaults();
    sanitizeSidebarDom("init");
    applyUserContextToCore({ reason: "init", user: getAuthUser() || getStateUser() }, opts);
    syncSidebarState("init", opts);
    renderUser("init", opts);
    applyRoleVisibility("init", opts);
    repairDropdown("init");
    closeDropdown({ force: true, reason: "init" });

    initialized = true;

    registerModule();
    exposeGlobalBridge();
    bindEvents("init");

    scheduleRouteAndIndicator("init", { delayMs: INDICATOR_DELAY_INIT_MS, force: true });

    afterPaint(() => {
      ensureMenuInteractive("init:after-paint");
      syncRouteAndIndicator("init:after-paint", { delayMs: 0, force: true });
    });

    safeEmit(SIDEBAR_EVENTS?.ready || "sidebar:ready", {
      initialized: true,
      isAdmin: isAdmin(),
      snapshot: getSidebarSnapshot(),
    });

    safeLog("ready", getSidebarSnapshot());
    return api;
  }

  function destroy() {
    cleanup();

    try {
      resetSidebarStateRuntime(AppCore, "sidebar-ui-destroy");
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
    safeEmit(SIDEBAR_EVENTS?.destroyed || "sidebar:destroyed", { initialized: false });

    return api;
  }

  /* =====================================================
     SNAPSHOT / DEBUG
  ===================================================== */

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
      .filter((item) => Boolean(item.classList?.contains?.("active") || item.classList?.contains?.("is-active") || item.classList?.contains?.("router-active") || item.getAttribute?.("aria-current") === "page" || item.dataset?.active === "true"))
      .map((item) => ({
        route: normalizeRoutePath(getRouteFromElement(item)),
        rawRoute: getRouteFromElement(item),
        text: safeText(item.textContent, ""),
        hidden: Boolean(item.hidden || item.closest?.("[hidden],[inert],[aria-hidden='true']")),
      }));

    return sanitizeForEvent({
      version: SIDEBAR_UI_VERSION,
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
      desktopOpen: typeof AppCore?.state?.sidebarDesktopOpen === "boolean" ? Boolean(AppCore.state.sidebarDesktopOpen) : null,
      mobileOpen: typeof AppCore?.state?.sidebarMobileOpen === "boolean" ? Boolean(AppCore.state.sidebarMobileOpen) : null,
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
        routerPublicPath: getRouterPublicPathSafe(),
        routerCanonicalPath: getRouterCanonicalPathSafe(),
      },
      dom: {
        hasSidebar: Boolean(elements.sidebar),
        hasSidebarMenu: Boolean(elements.sidebarMenu),
        hasToggle: Boolean(elements.toggleBtn || elements.sidebarToggle),
        hasMobileToggle: Boolean(elements.mobileToggleBtn),
        hasUserToggle: Boolean(elements.userToggle),
        hasUserDropdown: Boolean(elements.userDropdown),
        hasLogout: Boolean(elements.logoutBtn),
        hasAvatar: Boolean(elements.avatarEl),
        hasAvatarImage: Boolean(elements.avatarImage),
        hasAvatarFallback: Boolean(elements.avatarFallback),
        hasName: Boolean(elements.nameEl),
        hasPlan: Boolean(elements.planEl),
        sidebarHidden: Boolean(elements.sidebar?.hidden),
        sidebarAriaHidden: elements.sidebar?.getAttribute?.("aria-hidden") || "",
        sidebarClassName: elements.sidebar?.className || "",
        sidebarMenuPointerEvents: elements.sidebarMenu?.style?.pointerEvents || "",
        sidebarMenuInert: Boolean(elements.sidebarMenu?.hasAttribute?.("inert")),
        sidebarMenuAriaDisabled: elements.sidebarMenu?.getAttribute?.("aria-disabled") || "",
      },
      dropdown: safeObject(getDropdownSnapshot(AppCore, runtimeState)),
      user: (() => {
        try {
          return getSidebarUserSnapshot(AppCore);
        } catch {
          return {};
        }
      })(),
      appUser: (() => {
        try {
          const user = getStateUser();
          return {
            hasUser: hasUsableUser(user),
            id: user?.id || user?.userId || user?.uid || null,
            username: user?.username || user?.usernameLower || user?.slug || null,
            displayName: user?.displayName || user?.name || null,
            footerName: user?.footerName || user?.name || user?.displayName || null,
            greetingName: user?.greetingName || user?.name || user?.displayName || null,
            role: AppCore?.state?.role || user?.role || user?.rol || null,
            hasAvatar: Boolean(user?.avatar || user?.avatarUrl || user?.picture),
            plan: user?.plan || user?.planName || user?.subscriptionPlan || null,
          };
        } catch {
          return {};
        }
      })(),
      visibility: (() => {
        try {
          return getRoleVisibilitySnapshot(AppCore, isAdmin);
        } catch {
          return {};
        }
      })(),
      sidebarDom: (() => {
        try {
          return getSidebarDomSnapshot(AppCore);
        } catch {
          return {};
        }
      })(),
      sidebarState: (() => {
        try {
          return getSidebarStateSnapshot(AppCore);
        } catch {
          return {};
        }
      })(),
      sidebarEvents: (() => {
        try {
          return getSidebarEventsSnapshot(SCOPE);
        } catch {
          return {};
        }
      })(),
      activeRoute: { activeItems },
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
      modules: {
        sidebar: getRegisteredModule("sidebar") === api,
        SidebarUI: getRegisteredModule("SidebarUI") === api,
        sidebarUI: getRegisteredModule("sidebarUI") === api,
      },
      actions: safeObject(getSidebarActionsSnapshot()),
    });
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

    const payload = resolveRoutePayload({ reason: "debug-indicator", force: true });
    const activeItem = syncActiveMenuItem(AppCore, { ...payload, reason: "debug-indicator", mutate: false });
    const { sidebarMenu } = getElements(AppCore);

    const snapshot = {
      route: payload.route,
      browserRoute: getBrowserPath(),
      hasSidebarMenu: Boolean(sidebarMenu),
      hasActiveItem: Boolean(activeItem),
      activeRoute: activeItem ? normalizeRoutePath(getRouteFromElement(activeItem)) : "",
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
        active: Boolean(item.classList?.contains?.("active") || item.classList?.contains?.("is-active") || item.classList?.contains?.("router-active") || item.getAttribute?.("aria-current") === "page" || item.dataset?.active === "true"),
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

  /* =====================================================
     API
  ===================================================== */

  const api = {
    version: SIDEBAR_UI_VERSION,

    init,
    destroy,
    cleanup,

    sync,
    render: sync,
    refresh,
    repair,
    scheduleRepair,

    bind: bindEvents,
    rebind: rebindEvents,
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
    navigate: navigateTo,

    handleLogout,

    updateToggleLabel: () => updateToggleLabel(AppCore),

    syncRouteAndIndicator,
    syncIndicator: (reason = "api:syncIndicator") => scheduleRouteAndIndicator(reason, { delayMs: 0, force: true }),
    scheduleIndicatorSync: scheduleRouteAndIndicator,

    ensureMenuInteractive,
    sanitizeSidebarDom,

    isAdmin,

    registerModule,
    exposeGlobalBridge,

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
