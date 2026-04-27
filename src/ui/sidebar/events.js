/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   FINAL EXTREME SYSTEM · SIDEBAR EVENTS / VISUAL COMMIT · 10/10

   Responsabilidades:
   - bind de eventos DOM del sidebar
   - bind de eventos core/auth/router
   - sidebar manual: nunca abrir/cerrar por navegación
   - cerrar dropdown en navegación
   - recalcular usuario / roles tras login/logout/restore/session/user change
   - bloquear clicks sobre elementos hidden/inert/admin ocultos
   - fallback local si AppCore.cleanup no existe
   - cleanup idempotente por scope
   - tolerar DOM re-renderizado
   - cero throws accidentales
   - sincronizar item activo del menú
   - sincronizar indicador visual tipo Apple
   - evitar indicador colgado al colapsar/expandir
   - centralizar commit visual post-router/post-resize/post-auth

   FIX REAL:
   - sin snapshot/restore en navegación desktop
   - sin routeTransition lock
   - sin reanimar sidebar al cambiar de vista
   - dropdown sí se cierra en navegación
   - sidebar solo cambia cuando el usuario lo cambia
   - role visibility se recalcula tras login/logout/restore/session/user change
   - fallback si AppCore.cleanup no existe
   - bloqueo defensivo de clicks sobre elementos hidden/inert/admin ocultos
   - router rendered NO fuerza open/close del sidebar
   - active item se recalcula tras router:rendered/app:route:change
   - indicador se recalcula después del layout final
   - durante transición se oculta el indicador para evitar “burbuja flotante”

   HARDENING 10/10:
   - browser guard total
   - cleanup local robusto
   - usa off() devuelto por AppCore.events.on si existe
   - no rompe si document/window no existen
   - no bloquea clicks sobre iconos aria-hidden dentro de enlaces válidos
   - todos los handlers van envueltos en safeHandler
   - captura errores sync y async/rejected promise
   - AppCore.cleanup.event ya NO registra handlers crudos
   - dedupe defensivo de eventos ya gestionados por SidebarUI
   - commit visual debounced para evitar loops entre eventos
========================================================= */

import {
  getElements,
  isShellHidden,
  sanitizeFooterTooltipState,
} from "./dom.js";

/* ======================================================
   LOCAL CLEANUP FALLBACK
====================================================== */

const localCleanups = new Map();

/* ======================================================
   CONSTANTS
====================================================== */

const DEFAULT_SCOPE = "ui:sidebar";

const INDICATOR_DEFAULT_DELAY = 40;
const INDICATOR_TRANSITION_MS = 360;

const HANDLED_FLAG = "__onionSidebarHandled";
const LOCAL_HANDLED_FLAG = "__onionSidebarEventsHandled";

/* ======================================================
   BASICS
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

function hasDocument() {
  return typeof document !== "undefined";
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function isFn(value) {
  return typeof value === "function";
}

function resolveScope(scope = DEFAULT_SCOPE) {
  return safeText(scope, DEFAULT_SCOPE);
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarEvents]", ...args);
  } catch {}

  try {
    console.warn("[SidebarEvents]", ...args);
  } catch {}
}

function safeLog(AppCore, ...args) {
  try {
    AppCore?.utils?.log?.("[SidebarEvents]", ...args);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

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

function makeSafeHandler(
  AppCore,
  label = "handler",
  handler
) {
  if (!isFn(handler)) {
    return () => {};
  }

  return function safeBoundHandler(...args) {
    try {
      const result = handler(...args);

      if (
        result &&
        typeof result === "object" &&
        isFn(result.catch)
      ) {
        result.catch((error) => {
          safeWarn(
            AppCore,
            `${label} falló async`,
            error
          );
        });
      }

      return result;
    } catch (error) {
      safeWarn(
        AppCore,
        `${label} falló`,
        error
      );

      return undefined;
    }
  };
}

function safeWindowTimeout(fn, ms = 0) {
  if (!isFn(fn)) {
    return null;
  }

  const safeFn = () => {
    try {
      fn();
    } catch {}
  };

  try {
    if (hasWindow()) {
      return window.setTimeout(safeFn, ms);
    }
  } catch {}

  safeFn();

  return null;
}

function clearWindowTimeout(timer) {
  if (!timer) {
    return false;
  }

  try {
    if (hasWindow()) {
      window.clearTimeout(timer);
      return true;
    }
  } catch {}

  return false;
}

function safeRequestAnimationFrame(fn) {
  if (!isFn(fn)) {
    return null;
  }

  const safeFn = () => {
    try {
      fn();
    } catch {}
  };

  try {
    if (
      hasWindow() &&
      isFn(window.requestAnimationFrame)
    ) {
      return window.requestAnimationFrame(safeFn);
    }
  } catch {}

  return safeWindowTimeout(safeFn, 0);
}

function afterFrames(fn, frames = 2) {
  const total = Math.max(1, Number(frames) || 1);

  const step = (remaining) => {
    if (remaining <= 0) {
      try {
        fn?.();
      } catch {}

      return;
    }

    safeRequestAnimationFrame(() => {
      step(remaining - 1);
    });
  };

  step(total);
}

function safeIsShellHidden(AppCore) {
  try {
    return Boolean(isShellHidden(AppCore));
  } catch {
    return false;
  }
}

function resolveElements(AppCore, resolver) {
  if (isFn(resolver)) {
    try {
      return resolver() || getElements(AppCore);
    } catch {
      return getElements(AppCore);
    }
  }

  return getElements(AppCore);
}

function isNode(value = null) {
  if (!value) {
    return false;
  }

  try {
    return typeof Node !== "undefined" && value instanceof Node;
  } catch {
    return Boolean(value && typeof value === "object");
  }
}

function isElement(value = null) {
  if (!value) {
    return false;
  }

  try {
    return typeof Element !== "undefined" && value instanceof Element;
  } catch {
    return Boolean(value && typeof value.closest === "function");
  }
}

function getEventDetail(eventOrPayload = {}) {
  if (
    eventOrPayload?.detail &&
    typeof eventOrPayload.detail === "object"
  ) {
    return eventOrPayload.detail;
  }

  if (
    eventOrPayload?.payload &&
    typeof eventOrPayload.payload === "object"
  ) {
    return eventOrPayload.payload;
  }

  if (
    eventOrPayload &&
    typeof eventOrPayload === "object"
  ) {
    return eventOrPayload;
  }

  return {};
}

function preventDefaultAndStop(event) {
  try {
    event?.preventDefault?.();
  } catch {}

  try {
    event?.stopPropagation?.();
  } catch {}
}

function stopImmediate(event) {
  try {
    event?.stopImmediatePropagation?.();
  } catch {}
}

/* ======================================================
   EVENT DEDUPE
====================================================== */

function markSidebarEventHandled(event, reason = "") {
  if (!event) {
    return false;
  }

  try {
    event[HANDLED_FLAG] = true;
    event[LOCAL_HANDLED_FLAG] = true;
    event.__onionSidebarReason = safeText(reason, "");
  } catch {}

  return true;
}

function wasSidebarEventHandled(event) {
  return Boolean(
    event?.[HANDLED_FLAG] ||
      event?.[LOCAL_HANDLED_FLAG]
  );
}

/* ======================================================
   CLEANUP
====================================================== */

function pushLocalCleanup(scope, cleanup) {
  if (!isFn(cleanup)) {
    return;
  }

  const scopeName = resolveScope(scope);
  const cleanups = localCleanups.get(scopeName) || [];

  cleanups.push(cleanup);
  localCleanups.set(scopeName, cleanups);
}

function runLocalCleanups(scope) {
  const scopeName = resolveScope(scope);
  const cleanups = localCleanups.get(scopeName) || [];

  for (const cleanup of cleanups) {
    try {
      cleanup?.();
    } catch {}
  }

  localCleanups.delete(scopeName);

  return true;
}

/* ======================================================
   DOM BIND LOW LEVEL
====================================================== */

function bindDom(
  AppCore,
  scope,
  target,
  eventName,
  handler,
  options = undefined
) {
  const scopeName = resolveScope(scope);

  if (
    !target ||
    !eventName ||
    !isFn(handler) ||
    !isFn(target.addEventListener)
  ) {
    return () => {};
  }

  const safeHandler = makeSafeHandler(
    AppCore,
    `DOM "${eventName}"`,
    handler
  );

  const cleanup = () => {
    try {
      target.removeEventListener(
        eventName,
        safeHandler,
        options
      );
    } catch {}
  };

  try {
    if (isFn(AppCore?.cleanup?.on)) {
      AppCore.cleanup.on(
        scopeName,
        target,
        eventName,
        safeHandler,
        options
      );

      pushLocalCleanup(scopeName, cleanup);

      return cleanup;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `cleanup.on falló para DOM "${eventName}"`,
      error
    );
  }

  try {
    target.addEventListener(
      eventName,
      safeHandler,
      options
    );

    pushLocalCleanup(scopeName, cleanup);

    return cleanup;
  } catch (error) {
    safeWarn(
      AppCore,
      `addEventListener falló para DOM "${eventName}"`,
      error
    );

    return () => {};
  }
}

/* ======================================================
   CORE EVENT BIND LOW LEVEL
====================================================== */

function bindCoreEvent(
  AppCore,
  scope,
  eventName,
  handler
) {
  const scopeName = resolveScope(scope);
  const cleanEventName = safeText(eventName, "");

  if (!cleanEventName || !isFn(handler)) {
    return () => {};
  }

  const safeHandler = makeSafeHandler(
    AppCore,
    `Core event "${cleanEventName}"`,
    handler
  );

  try {
    if (isFn(AppCore?.cleanup?.event)) {
      const maybeCleanup = AppCore.cleanup.event(
        scopeName,
        cleanEventName,
        safeHandler
      );

      if (isFn(maybeCleanup)) {
        pushLocalCleanup(scopeName, maybeCleanup);
        return maybeCleanup;
      }

      const cleanup = () => {
        try {
          AppCore?.events?.off?.(
            cleanEventName,
            safeHandler
          );
        } catch {}
      };

      pushLocalCleanup(scopeName, cleanup);

      return cleanup;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `cleanup.event falló para "${cleanEventName}"`,
      error
    );
  }

  let busOff = null;

  try {
    if (isFn(AppCore?.events?.on)) {
      const maybeOff = AppCore.events.on(
        cleanEventName,
        safeHandler
      );

      if (isFn(maybeOff)) {
        busOff = maybeOff;
      } else {
        busOff = () => {
          try {
            AppCore?.events?.off?.(
              cleanEventName,
              safeHandler
            );
          } catch {}
        };
      }
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.on falló para "${cleanEventName}"`,
      error
    );
  }

  const windowHandler = (event) => {
    safeHandler(event);
  };

  let windowBound = false;

  try {
    if (hasWindow()) {
      window.addEventListener(
        cleanEventName,
        windowHandler
      );

      windowBound = true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `window.addEventListener falló para "${cleanEventName}"`,
      error
    );
  }

  const cleanup = () => {
    try {
      busOff?.();
    } catch {}

    if (windowBound) {
      try {
        window.removeEventListener(
          cleanEventName,
          windowHandler
        );
      } catch {}
    }
  };

  if (busOff || windowBound) {
    pushLocalCleanup(scopeName, cleanup);
  }

  return cleanup;
}

/* ======================================================
   PATH / ROUTE HELPERS
====================================================== */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function normalizePathname(path = "/") {
  let value = safeText(path, "/");

  if (isHashRouterPath(value)) {
    value = normalizeHashRouterPath(value);
  }

  try {
    const parsed = new URL(value, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      value = normalizeHashRouterPath(parsed.hash);
    } else {
      value = parsed.pathname || "/";
    }
  } catch {
    value = value
      .split("?")[0]
      .split("#")[0];
  }

  value = safeText(value, "/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value || "/";
}

function getBrowserPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    const hash = window.location.hash || "";

    if (hash && isHashRouterPath(hash)) {
      return normalizeHashRouterPath(hash);
    }

    return normalizePathname(
      window.location.pathname || "/"
    );
  } catch {
    return "/";
  }
}

function getRouteFromElement(element = null) {
  if (!element) {
    return "";
  }

  const href = safeText(
    element.getAttribute?.("href"),
    ""
  );

  return safeText(
    element.dataset?.route ||
      element.dataset?.href ||
      element.dataset?.to ||
      element.getAttribute?.("data-route") ||
      element.getAttribute?.("data-href") ||
      element.getAttribute?.("data-to") ||
      href,
    ""
  );
}

function getCurrentPathCandidates(ctx = {}, payload = {}) {
  const AppCore = ctx.AppCore;
  const Router = ctx.Router || AppCore?.Router || AppCore?.router;

  const detail = safeObject(payload);

  const values = [
    detail.publicPath,
    detail.path,
    detail.route,
    detail.canonicalPath,
    detail.to,
    detail.url,

    AppCore?.state?.publicPath,
    AppCore?.state?.route,
    AppCore?.state?.canonicalPath,
    AppCore?.state?.lastRoute,

    Router?.getCurrentPublicPath?.(),
    Router?.getCurrentCanonicalPath?.(),
    Router?.getCurrentPath?.(),

    getBrowserPath(),
  ];

  const output = [];

  for (const value of values) {
    const normalized = normalizePathname(value || "");

    if (
      normalized &&
      !output.includes(normalized)
    ) {
      output.push(normalized);
    }
  }

  return output.length ? output : ["/"];
}

function isRouteMatch(route = "", current = "") {
  const cleanRoute = normalizePathname(route);
  const cleanCurrent = normalizePathname(current);

  if (!cleanRoute || !cleanCurrent) {
    return false;
  }

  if (cleanRoute === "/") {
    return cleanCurrent === "/";
  }

  return (
    cleanCurrent === cleanRoute ||
    cleanCurrent.startsWith(`${cleanRoute}/`)
  );
}

function isHiddenOrInertElement(element = null) {
  if (!isElement(element)) {
    return true;
  }

  try {
    return Boolean(
      element.closest(
        [
          "[hidden]",
          "[inert]",
          "[data-sidebar-visible='false']",
          "[data-role-visible='false']",
          "[data-admin-visible='false']",
        ].join(",")
      )
    );
  } catch {
    return false;
  }
}

function hasLayoutBox(element = null) {
  if (!isElement(element)) {
    return false;
  }

  try {
    const rect = element.getBoundingClientRect();

    return Boolean(
      rect.width > 0 &&
      rect.height > 0
    );
  } catch {
    return false;
  }
}

function getSidebarMenuItems(sidebarMenu = null) {
  if (!sidebarMenu) {
    return [];
  }

  try {
    return Array.from(
      sidebarMenu.querySelectorAll(
        [
          "a[data-route]",
          "a[data-spa]",
          ".menu-item[data-route]",
          ".menu-item[href]",
        ].join(",")
      )
    );
  } catch {
    return [];
  }
}

/* ======================================================
   ACTIVE MENU + APPLE-LIKE INDICATOR
====================================================== */

function hideActiveMenuIndicator(ctx = {}, reason = "hide") {
  const AppCore = ctx.AppCore;

  const {
    sidebarMenu,
  } = resolveElements(
    AppCore,
    ctx.getElements
  );

  if (!sidebarMenu) {
    return false;
  }

  try {
    sidebarMenu.dataset.indicatorReady = "false";
    sidebarMenu.style.setProperty("--sidebar-indicator-opacity", "0");
  } catch {}

  safeEmit(AppCore, "sidebar:indicator:hidden", {
    reason,
  });

  return true;
}

function syncActiveMenuItem(ctx = {}, payload = {}) {
  const AppCore = ctx.AppCore;

  const {
    sidebarMenu,
  } = resolveElements(
    AppCore,
    ctx.getElements
  );

  if (!sidebarMenu) {
    return null;
  }

  const items = getSidebarMenuItems(sidebarMenu);
  const currentPaths = getCurrentPathCandidates(ctx, payload);

  let bestItem = null;
  let bestScore = -1;
  let bestRoute = "";

  for (const item of items) {
    const route = normalizePathname(
      getRouteFromElement(item)
    );

    if (!route) {
      continue;
    }

    for (const current of currentPaths) {
      if (!isRouteMatch(route, current)) {
        continue;
      }

      const score = route.length;

      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
        bestRoute = route;
      }
    }
  }

  for (const item of items) {
    try {
      item.classList.remove("active", "is-active");
      item.removeAttribute("aria-current");
      delete item.dataset.active;
    } catch {}
  }

  if (
    bestItem &&
    !isHiddenOrInertElement(bestItem)
  ) {
    try {
      bestItem.classList.add("active", "is-active");
      bestItem.setAttribute("aria-current", "page");
      bestItem.dataset.active = "true";
    } catch {}
  }

  safeEmit(AppCore, "sidebar:active:sync", {
    route: bestRoute,
    matched: Boolean(bestItem),
    currentPaths,
  });

  return bestItem || null;
}

function getActiveMenuItem(ctx = {}) {
  const AppCore = ctx.AppCore;

  const {
    sidebarMenu,
  } = resolveElements(
    AppCore,
    ctx.getElements
  );

  if (!sidebarMenu) {
    return null;
  }

  try {
    return sidebarMenu.querySelector(
      ".menu-item.active, .menu-item.is-active, .menu-item[aria-current='page']"
    );
  } catch {
    return null;
  }
}

function syncActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore = ctx.AppCore;

  const {
    sidebar,
    sidebarMenu,
  } = resolveElements(
    AppCore,
    ctx.getElements
  );

  if (!sidebar || !sidebarMenu) {
    return false;
  }

  if (safeIsShellHidden(AppCore)) {
    return hideActiveMenuIndicator(ctx, "shell-hidden");
  }

  const activeItem =
    options.activeItem ||
    getActiveMenuItem(ctx) ||
    syncActiveMenuItem(ctx, options.payload || {});

  if (
    !activeItem ||
    isHiddenOrInertElement(activeItem) ||
    !hasLayoutBox(activeItem)
  ) {
    return hideActiveMenuIndicator(
      ctx,
      options.reason || "no-active-item"
    );
  }

  try {
    const menuRect = sidebarMenu.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();

    const x = Math.max(
      0,
      itemRect.left - menuRect.left
    );

    const y = Math.max(
      0,
      itemRect.top - menuRect.top
    );

    const width = Math.max(0, itemRect.width);
    const height = Math.max(0, itemRect.height);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      width <= 0 ||
      height <= 0
    ) {
      return hideActiveMenuIndicator(
        ctx,
        options.reason || "invalid-rect"
      );
    }

    sidebarMenu.style.setProperty(
      "--sidebar-indicator-x",
      `${Math.round(x)}px`
    );

    sidebarMenu.style.setProperty(
      "--sidebar-indicator-y",
      `${Math.round(y)}px`
    );

    sidebarMenu.style.setProperty(
      "--sidebar-indicator-w",
      `${Math.round(width)}px`
    );

    sidebarMenu.style.setProperty(
      "--sidebar-indicator-h",
      `${Math.round(height)}px`
    );

    sidebarMenu.style.setProperty(
      "--sidebar-indicator-opacity",
      options.reveal === false ? "0" : "1"
    );

    sidebarMenu.dataset.indicatorReady = "true";

    safeEmit(AppCore, "sidebar:indicator:sync", {
      reason: safeText(options.reason, "sync"),
      x,
      y,
      width,
      height,
      route:
        activeItem.dataset?.route ||
        activeItem.getAttribute?.("href") ||
        "",
    });

    return true;
  } catch (error) {
    safeWarn(
      AppCore,
      "syncActiveMenuIndicator falló",
      error
    );

    return hideActiveMenuIndicator(
      ctx,
      options.reason || "error"
    );
  }
}

function scheduleActiveMenuIndicator(ctx = {}, options = {}) {
  const delayMs =
    Number.isFinite(Number(options.delayMs))
      ? Number(options.delayMs)
      : INDICATOR_DEFAULT_DELAY;

  safeWindowTimeout(() => {
    afterFrames(() => {
      syncActiveMenuIndicator(ctx, options);
    }, 2);
  }, delayMs);

  return true;
}

function beginSidebarLayoutTransition(ctx = {}, reason = "transition") {
  const AppCore = ctx.AppCore;

  const {
    sidebar,
    body,
    sidebarMenu,
  } = resolveElements(
    AppCore,
    ctx.getElements
  );

  hideActiveMenuIndicator(ctx, `${reason}:begin`);

  try {
    sidebar?.classList?.add?.("is-transitioning");
    body?.classList?.add?.("sidebar-transitioning");
    sidebarMenu?.classList?.add?.("is-transitioning");
  } catch {}

  safeWindowTimeout(() => {
    try {
      sidebar?.classList?.remove?.("is-transitioning");
      body?.classList?.remove?.("sidebar-transitioning");
      sidebarMenu?.classList?.remove?.("is-transitioning");
    } catch {}

    syncActiveMenuItem(ctx, {
      reason:
        `${reason}:after-transition`,
    });

    scheduleActiveMenuIndicator(ctx, {
      reason:
        `${reason}:after-transition`,
      delayMs: 24,
      reveal: true,
    });
  }, INDICATOR_TRANSITION_MS);

  safeEmit(AppCore, "sidebar:transition:begin", {
    reason,
  });

  return true;
}

/* ======================================================
   VISUAL COMMIT PIPELINE
====================================================== */

function createSidebarVisualCommitter(ctx = {}) {
  const AppCore = ctx.AppCore;

  let timer = null;
  let committing = false;
  let lastReason = "";

  const commitNow = (options = {}) => {
    if (committing) {
      return false;
    }

    committing = true;

    const reason = safeText(
      options.reason,
      "visual-commit"
    );

    lastReason = reason;

    try {
      if (options.renderIdentity !== false) {
        try {
          ctx.renderUser?.();
        } catch (error) {
          safeWarn(
            AppCore,
            `renderUser falló en ${reason}`,
            error
          );
        }

        try {
          ctx.applyRoleVisibility?.();
        } catch (error) {
          safeWarn(
            AppCore,
            `applyRoleVisibility falló en ${reason}`,
            error
          );
        }
      }

      if (options.closeDropdown === true) {
        try {
          ctx.closeDropdown?.();
        } catch (error) {
          safeWarn(
            AppCore,
            `closeDropdown falló en ${reason}`,
            error
          );
        }
      }

      if (
        options.syncState === true &&
        !safeIsShellHidden(AppCore)
      ) {
        try {
          ctx.syncSidebarState?.();
        } catch (error) {
          safeWarn(
            AppCore,
            `syncSidebarState falló en ${reason}`,
            error
          );
        }
      }

      if (options.sanitize !== false) {
        try {
          sanitizeFooterTooltipState(AppCore);
        } catch (error) {
          safeWarn(
            AppCore,
            `sanitizeFooterTooltipState falló en ${reason}`,
            error
          );
        }
      }

      const activeItem =
        syncActiveMenuItem(ctx, options.payload || {});

      if (options.indicator !== false) {
        scheduleActiveMenuIndicator(ctx, {
          reason,
          activeItem,
          delayMs:
            options.indicatorDelayMs ??
            INDICATOR_DEFAULT_DELAY,
          reveal: true,
          payload:
            options.payload || {},
        });
      }

      safeEmit(AppCore, "sidebar:visual:committed", {
        reason,
        lastReason,
        hasActiveItem: Boolean(activeItem),
      });

      return true;
    } finally {
      committing = false;
    }
  };

  const schedule = (options = {}) => {
    clearWindowTimeout(timer);

    const delayMs =
      Number.isFinite(Number(options.delayMs))
        ? Number(options.delayMs)
        : 0;

    timer = safeWindowTimeout(() => {
      afterFrames(() => {
        commitNow(options);
      }, options.frames || 1);
    }, delayMs);

    return true;
  };

  return {
    commitNow,
    schedule,

    hideIndicator:
      (reason = "hide") =>
        hideActiveMenuIndicator(ctx, reason),

    beginTransition:
      (reason = "transition") =>
        beginSidebarLayoutTransition(ctx, reason),

    getLastReason:
      () => lastReason,
  };
}

/* ======================================================
   UI SYNC HELPERS
====================================================== */

function syncUserAndRoles({
  AppCore,
  renderUser,
  applyRoleVisibility,
  syncSidebarState,
  closeDropdown,
  sanitize = true,
  syncState = false,
  close = false,
} = {}) {
  safeWindowTimeout(() => {
    try {
      renderUser?.();
    } catch (error) {
      safeWarn(AppCore, "renderUser falló", error);
    }

    try {
      applyRoleVisibility?.();
    } catch (error) {
      safeWarn(AppCore, "applyRoleVisibility falló", error);
    }

    if (sanitize) {
      try {
        sanitizeFooterTooltipState(AppCore);
      } catch (error) {
        safeWarn(
          AppCore,
          "sanitizeFooterTooltipState falló",
          error
        );
      }
    }

    if (close) {
      try {
        closeDropdown?.();
      } catch (error) {
        safeWarn(AppCore, "closeDropdown falló", error);
      }
    }

    if (syncState && !safeIsShellHidden(AppCore)) {
      try {
        syncSidebarState?.();
      } catch (error) {
        safeWarn(AppCore, "syncSidebarState falló", error);
      }
    }
  }, 0);
}

/* ======================================================
   HIDDEN / INERT CLICK GUARD
====================================================== */

function shouldIgnoreHiddenTarget(target = null) {
  if (!isElement(target)) {
    return false;
  }

  const hardHidden = target.closest(
    [
      "[hidden]",
      "[inert]",
      "[data-sidebar-visible='false']",
      "[data-role-visible='false']",
      "[data-admin-visible='false']",
    ].join(",")
  );

  if (hardHidden) {
    return true;
  }

  const ariaHidden = target.closest("[aria-hidden='true']");

  if (!ariaHidden) {
    return false;
  }

  const interactiveParent = target.closest(
    [
      "a[data-spa]",
      "a[href]",
      "button",
      "[role='button']",
      "[data-route]",
      "[data-action]",
      "[data-sidebar-action]",
    ].join(",")
  );

  if (
    interactiveParent &&
    interactiveParent.contains(ariaHidden)
  ) {
    if (ariaHidden === interactiveParent) {
      return true;
    }

    return false;
  }

  return true;
}

function preventHiddenTargetClick(event) {
  const target = event?.target;

  if (!isElement(target)) {
    return false;
  }

  if (!shouldIgnoreHiddenTarget(target)) {
    return false;
  }

  preventDefaultAndStop(event);
  markSidebarEventHandled(event, "hidden-target");

  return true;
}

/* ======================================================
   DOM HANDLERS
====================================================== */

export function handleDocumentClick({
  AppCore,
  event,
  toggleSidebar,
  toggleDropdown,
  closeDropdown,
  handleLogout,
  getElements: resolver,
}) {
  if (wasSidebarEventHandled(event)) {
    return;
  }

  const {
    toggleBtn,
    mobileToggleBtn,
    userToggle,
    userDropdown,
    logoutBtn,
  } = resolveElements(AppCore, resolver);

  const target = event?.target;

  if (!isNode(target)) {
    return;
  }

  if (preventHiddenTargetClick(event)) {
    return;
  }

  if (toggleBtn?.contains?.(target)) {
    markSidebarEventHandled(event, "document-toggle-sidebar");
    preventDefaultAndStop(event);
    toggleSidebar?.();
    return;
  }

  if (mobileToggleBtn?.contains?.(target)) {
    markSidebarEventHandled(event, "document-mobile-toggle-sidebar");
    preventDefaultAndStop(event);
    toggleSidebar?.();
    return;
  }

  if (userToggle?.contains?.(target)) {
    markSidebarEventHandled(event, "document-toggle-dropdown");
    preventDefaultAndStop(event);
    toggleDropdown?.();
    return;
  }

  if (logoutBtn?.contains?.(target)) {
    markSidebarEventHandled(event, "document-logout");
    preventDefaultAndStop(event);
    void handleLogout?.();
    return;
  }

  if (userDropdown?.contains?.(target)) {
    return;
  }

  closeDropdown?.();
}

export function handleSidebarMenuClick({
  AppCore,
  event,
  closeDropdown,
  getElements: resolver,
}) {
  if (wasSidebarEventHandled(event)) {
    return;
  }

  const {
    sidebarMenu,
  } = resolveElements(AppCore, resolver);

  if (!sidebarMenu) {
    return;
  }

  const target = event?.target;

  if (!isElement(target)) {
    return;
  }

  if (preventHiddenTargetClick(event)) {
    return;
  }

  const link = target.closest("a[data-spa], a[data-route], .menu-item");

  if (!link) {
    return;
  }

  if (!sidebarMenu.contains(link)) {
    return;
  }

  closeDropdown?.();
}

export function handleUserToggleKeydown({
  AppCore,
  event,
  toggleDropdown,
  closeDropdown,
  openDropdown,
  getElements: resolver,
}) {
  if (wasSidebarEventHandled(event)) {
    return;
  }

  const {
    userToggle,
  } = resolveElements(AppCore, resolver);

  if (!userToggle) {
    return;
  }

  if (event?.target !== userToggle) {
    return;
  }

  if (
    event.key === "Enter" ||
    event.key === " "
  ) {
    markSidebarEventHandled(event, "user-toggle-keyboard-toggle");
    event.preventDefault?.();
    event.stopPropagation?.();
    toggleDropdown?.();
    return;
  }

  if (event.key === "Escape") {
    markSidebarEventHandled(event, "user-toggle-keyboard-close");
    event.preventDefault?.();
    event.stopPropagation?.();
    closeDropdown?.();
    return;
  }

  if (event.key === "ArrowDown") {
    markSidebarEventHandled(event, "user-toggle-keyboard-open");
    event.preventDefault?.();
    event.stopPropagation?.();

    openDropdown?.({
      focusFirst: true,
    });
  }
}

export function handleGlobalKeydown({
  event,
  closeDropdown,
}) {
  if (wasSidebarEventHandled(event)) {
    return;
  }

  if (event?.key === "Escape") {
    closeDropdown?.();
  }
}

export function handleResize({
  AppCore,
  syncSidebarState,
  closeDropdown,
  getElements: resolver,
}) {
  try {
    syncSidebarState?.();
  } catch {}

  try {
    closeDropdown?.();
  } catch {}

  const ctx = {
    AppCore,
    getElements: resolver,
  };

  syncActiveMenuItem(ctx, {
    reason: "resize",
  });

  scheduleActiveMenuIndicator(ctx, {
    reason: "resize",
    delayMs: 96,
    reveal: true,
  });
}

/* ======================================================
   DOM BINDS
====================================================== */

export function bindDomEvents(ctx = {}) {
  const {
    AppCore,
    scope,
    handleLogout,
    toggleSidebar,
    toggleDropdown,
    openDropdown,
    closeDropdown,
    syncSidebarState,
    getElements: resolver,
  } = ctx;

  if (!isBrowser()) {
    return () => {};
  }

  const scopeName = resolveScope(scope);

  bindDom(
    AppCore,
    scopeName,
    document,
    "click",
    (event) =>
      handleDocumentClick({
        AppCore,
        event,
        toggleSidebar,
        toggleDropdown,
        closeDropdown,
        handleLogout,
        getElements: resolver,
      })
  );

  bindDom(
    AppCore,
    scopeName,
    document,
    "keydown",
    (event) =>
      handleGlobalKeydown({
        event,
        closeDropdown,
      })
  );

  const resizeHandler =
    isFn(AppCore?.utils?.debounce)
      ? AppCore.utils.debounce(
          () =>
            handleResize({
              AppCore,
              syncSidebarState,
              closeDropdown,
              getElements: resolver,
            }),
          120
        )
      : () =>
          handleResize({
            AppCore,
            syncSidebarState,
            closeDropdown,
            getElements: resolver,
          });

  bindDom(
    AppCore,
    scopeName,
    window,
    "resize",
    resizeHandler
  );

  bindDom(
    AppCore,
    scopeName,
    document,
    "transitionend",
    (event) => {
      const target = event?.target;

      if (!isElement(target)) {
        return;
      }

      if (!target.closest?.(".sidebar")) {
        return;
      }

      const propertyName = safeText(
        event?.propertyName,
        ""
      );

      if (
        propertyName &&
        ![
          "inline-size",
          "width",
          "transform",
          "margin-inline-start",
          "max-inline-size",
        ].includes(propertyName)
      ) {
        return;
      }

      const localCtx = {
        AppCore,
        getElements: resolver,
      };

      syncActiveMenuItem(localCtx, {
        reason: "transitionend",
      });

      scheduleActiveMenuIndicator(localCtx, {
        reason: "transitionend",
        delayMs: 24,
        reveal: true,
      });
    },
    true
  );

  const {
    userToggle,
    sidebarMenu,
  } = resolveElements(AppCore, resolver);

  if (userToggle) {
    bindDom(
      AppCore,
      scopeName,
      userToggle,
      "keydown",
      (event) =>
        handleUserToggleKeydown({
          AppCore,
          event,
          toggleDropdown,
          closeDropdown,
          openDropdown,
          getElements: resolver,
        })
    );
  }

  if (sidebarMenu) {
    bindDom(
      AppCore,
      scopeName,
      sidebarMenu,
      "click",
      (event) =>
        handleSidebarMenuClick({
          AppCore,
          event,
          closeDropdown,
          getElements: resolver,
        })
    );
  }

  safeEmit(AppCore, "sidebar:dom-events:bound", {
    scope: scopeName,
  });

  return () => {
    runLocalCleanups(scopeName);
  };
}

/* ======================================================
   CORE EVENTS
====================================================== */

export function bindCoreEvents(ctx = {}) {
  const {
    AppCore,
    scope,
    Router,
    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    closeDropdown,
    getElements: resolver,
  } = ctx;

  const scopeName = resolveScope(scope);

  const visualCtx = {
    ...ctx,
    AppCore,
    Router:
      Router ||
      AppCore?.Router ||
      AppCore?.router,
    renderUser,
    applyRoleVisibility,
    syncSidebarState,
    closeDropdown,
    getElements: resolver,
  };

  const visualCommitter =
    createSidebarVisualCommitter(visualCtx);

  const syncIdentity = () => {
    syncUserAndRoles({
      AppCore,
      renderUser,
      applyRoleVisibility,
      syncSidebarState,
      closeDropdown,
      sanitize: true,
      syncState: false,
      close: false,
    });

    visualCommitter.schedule({
      reason: "identity",
      renderIdentity: false,
      syncState: false,
      indicatorDelayMs: 48,
    });
  };

  const syncIdentityAndState = () => {
    visualCommitter.schedule({
      reason: "identity-and-state",
      renderIdentity: true,
      syncState: true,
      indicatorDelayMs: 56,
    });
  };

  const syncAfterSessionCleared = () => {
    visualCommitter.schedule({
      reason: "session-cleared",
      renderIdentity: true,
      syncState: true,
      closeDropdown: true,
      indicatorDelayMs: 56,
    });
  };

  [
    "app:user:change",
    "app:user:updated",
    "app:user-ui:sync",
    "app:session:change",
    "app:session:restored",
    "app:auth:change",
    "auth:change",
    "auth:updated",
    "auth:restore:success",
    "auth:session:restored",
    "auth:session:applied",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      syncIdentity
    );
  });

  [
    "login:success",
    "auth:login:success",
    "app:login:success",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      syncIdentityAndState
    );
  });

  [
    "app:session:cleared",
    "auth:session:cleared",
    "auth:logout",
    "auth:logout:success",
    "logout:success",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      syncAfterSessionCleared
    );
  });

  [
    "app:sidebar:change",
    "sidebar:state:change",
    "sidebar:open:set",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      (eventOrPayload = {}) => {
        const detail = getEventDetail(eventOrPayload);

        visualCommitter.beginTransition(eventName);

        visualCommitter.schedule({
          reason: eventName,
          payload: detail,
          renderIdentity: false,
          syncState: false,
          delayMs: 40,
          indicatorDelayMs: 80,
        });

        visualCommitter.schedule({
          reason: `${eventName}:settled`,
          payload: detail,
          renderIdentity: false,
          syncState: false,
          delayMs: INDICATOR_TRANSITION_MS,
          indicatorDelayMs: 24,
        });
      }
    );
  });

  [
    "sidebar:state:synced",
    "sidebar:refreshed",
    "sidebar:repaired",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      (eventOrPayload = {}) => {
        const detail = getEventDetail(eventOrPayload);

        visualCommitter.schedule({
          reason: eventName,
          payload: detail,
          renderIdentity: false,
          syncState: false,
          delayMs: 16,
          indicatorDelayMs: 32,
        });
      }
    );
  });

  bindCoreEvent(
    AppCore,
    scopeName,
    "router:before-render",
    () => {
      try {
        closeDropdown?.();
      } catch {}

      visualCommitter.hideIndicator("router:before-render");
    }
  );

  bindCoreEvent(
    AppCore,
    scopeName,
    "router:rendered",
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.schedule({
        reason: "router:rendered",
        payload: detail,
        renderIdentity: true,
        syncState: true,
        closeDropdown: true,
        delayMs: 0,
        frames: 2,
        indicatorDelayMs: 48,
      });

      visualCommitter.schedule({
        reason: "router:rendered:settled",
        payload: detail,
        renderIdentity: false,
        syncState: false,
        delayMs: 120,
        frames: 2,
        indicatorDelayMs: 0,
      });
    }
  );

  [
    "app:route:change",
    "router:route:change",
    "router:navigation:complete",
    "router:render:async-complete",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      (eventOrPayload = {}) => {
        const detail = getEventDetail(eventOrPayload);

        visualCommitter.schedule({
          reason: eventName,
          payload: detail,
          renderIdentity: false,
          syncState: false,
          closeDropdown: false,
          delayMs: 16,
          frames: 2,
          indicatorDelayMs: 32,
        });
      }
    );
  });

  bindCoreEvent(
    AppCore,
    scopeName,
    "router:shell:change",
    (eventOrPayload = {}) => {
      const detail = safeObject(
        getEventDetail(eventOrPayload)
      );

      if (detail.hidden) {
        try {
          closeDropdown?.();
        } catch {}

        visualCommitter.hideIndicator("router:shell:change:hidden");
      }

      visualCommitter.schedule({
        reason: "router:shell:change",
        payload: detail,
        renderIdentity: true,
        syncState: true,
        closeDropdown: Boolean(detail.hidden),
        delayMs: 32,
        frames: 2,
        indicatorDelayMs: 56,
      });
    }
  );

  bindCoreEvent(
    AppCore,
    scopeName,
    "app:ui:repair-request",
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.schedule({
        reason: "app:ui:repair-request",
        payload: detail,
        renderIdentity: true,
        syncState: true,
        delayMs: 16,
        frames: 2,
        indicatorDelayMs: 56,
      });
    }
  );

  [
    "app:ready",
    "app:boot:ready",
    "app:boot:complete",
    "router:bound",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      (eventOrPayload = {}) => {
        const detail = getEventDetail(eventOrPayload);

        visualCommitter.schedule({
          reason: eventName,
          payload: detail,
          renderIdentity: true,
          syncState: true,
          delayMs: 64,
          frames: 2,
          indicatorDelayMs: 56,
        });
      }
    );
  });

  [
    "app:lang:change",
    "i18n:change",
    "theme:change",
    "app:theme:change",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      scopeName,
      eventName,
      (eventOrPayload = {}) => {
        const detail = getEventDetail(eventOrPayload);

        visualCommitter.schedule({
          reason: eventName,
          payload: detail,
          renderIdentity: true,
          syncState: false,
          delayMs: 32,
          frames: 2,
          indicatorDelayMs: 56,
        });
      }
    );
  });

  safeEmit(AppCore, "sidebar:core-events:bound", {
    scope: scopeName,
  });

  safeLog(AppCore, "core events bound", {
    scope: scopeName,
  });

  return () => {
    runLocalCleanups(scopeName);
  };
}

/* ======================================================
   DEFAULT EXPORT
====================================================== */

export default {
  bindDomEvents,
  bindCoreEvents,

  handleDocumentClick,
  handleSidebarMenuClick,
  handleUserToggleKeydown,
  handleGlobalKeydown,
  handleResize,

  syncActiveMenuItem,
  syncActiveMenuIndicator,
  scheduleActiveMenuIndicator,
  hideActiveMenuIndicator,
};
