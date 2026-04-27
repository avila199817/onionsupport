/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   FINAL EXTREME SYSTEM · SIDEBAR EVENTS / VISUAL COMMIT · BIND SAFE · 10/10

   Responsabilidades:
   - bind de eventos DOM del sidebar
   - bind de eventos core/auth/router
   - sidebar manual: nunca abrir/cerrar por navegación
   - cerrar dropdown en navegación/render
   - recalcular usuario / roles tras login/logout/restore/session/user change
   - bloquear clicks sobre elementos hidden/inert/admin ocultos
   - cleanup local idempotente por scope
   - tolerar DOM re-renderizado
   - cero throws accidentales
   - sincronizar item activo del menú delegando en state.js
   - sincronizar indicador visual tipo Apple delegando en state.js
   - evitar indicador colgado al colapsar/expandir
   - centralizar commit visual post-router/post-resize/post-auth
   - evitar tormentas AppCore.cleanup.run / cleanup:disposed / firebreak
   - evitar doble suscripción AppCore.events + window
   - evitar doble cleanup AppCore.cleanup + cleanup local

   FIX REAL:
   - NO usa AppCore.cleanup.on/event para eventos del sidebar.
   - Usa cleanup local propio por scope.
   - Usa AppCore.events como fuente principal para eventos core.
   - Solo usa window.addEventListener como fallback si no existe AppCore.events.
   - safeEmit NO emite por AppCore.events y window a la vez.
   - NO escucha sidebar:refreshed/sidebar:repaired/sidebar:state:synced.
   - NO escucha app:user-ui:sync para evitar bucles de sync visual.
   - NO escucha router:shell:state para evitar loops con repairShell().
   - router rendered NO fuerza open/close del sidebar.
   - active item se recalcula tras router:rendered/app:route:change.
   - indicador se recalcula después del layout final.
   - durante transición se oculta el indicador para evitar burbuja flotante.
   - handlers viejos quedan invalidados por epoch aunque el bus no permita off().

   FIX CLICK SIDEBAR:
   - Los clicks del menú navegan explícitamente con Router.navigate().
   - Ya no depende solo del listener global del Router.
   - Soporta data-route / data-href / data-to / href.
   - Respeta Ctrl/Cmd/Shift/Alt click.
   - Respeta target="_blank", download, URLs externas y href inseguros.
   - Los botones del dropdown con data-route también navegan.
========================================================= */

import {
  getElements,
  isShellHidden,
  sanitizeFooterTooltipState,
} from "./dom.js";

import {
  syncActiveMenuItem as syncActiveMenuItemBase,
  syncActiveMenuIndicator as syncActiveMenuIndicatorBase,
  scheduleActiveMenuIndicator as scheduleActiveMenuIndicatorBase,
} from "./state.js";

/* ======================================================
   LOCAL CLEANUP / EPOCHS
====================================================== */

const localCleanups = new Map();
const scopeEpochs = new Map();

/* ======================================================
   CONSTANTS
====================================================== */

const DEFAULT_SCOPE = "ui:sidebar";

const INDICATOR_DEFAULT_DELAY = 40;
const INDICATOR_TRANSITION_MS = 380;

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

function resolveLocalScope(scope = DEFAULT_SCOPE, type = "local") {
  return `${resolveScope(scope)}:${safeText(type, "local")}`;
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

/*
  Importante:
  No emitimos por AppCore.events Y window a la vez.
  Si el bus existe, usamos el bus. Si no existe, fallback a window.
*/
function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(name, payload);
      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló`,
      error
    );
  }

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
      return window.setTimeout(
        safeFn,
        Math.max(0, Number(ms) || 0)
      );
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

/* ======================================================
   NAVIGATION HELPERS
====================================================== */

function isPrimaryClick(event) {
  if (!event) {
    return true;
  }

  if (
    "button" in event &&
    event.button !== 0
  ) {
    return false;
  }

  return true;
}

function isModifiedClick(event) {
  return Boolean(
    event?.metaKey ||
      event?.ctrlKey ||
      event?.shiftKey ||
      event?.altKey
  );
}

function getBaseOrigin() {
  try {
    if (isBrowser() && window.location?.origin) {
      return window.location.origin;
    }
  } catch {}

  return "http://localhost";
}

function isUnsafeHref(value = "") {
  const href =
    safeText(value, "").toLowerCase();

  return (
    href.startsWith("javascript:") ||
    href.startsWith("data:") ||
    href.startsWith("vbscript:") ||
    href.startsWith("file:")
  );
}

function isProtocolHref(value = "") {
  return /^[a-z][a-z0-9+.-]*:/i.test(
    safeText(value, "")
  );
}

function isExternalHref(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  if (!isProtocolHref(raw)) {
    return false;
  }

  try {
    const url = new URL(
      raw,
      getBaseOrigin()
    );

    if (
      url.protocol === "http:" ||
      url.protocol === "https:"
    ) {
      return url.origin !== getBaseOrigin();
    }

    return true;
  } catch {
    return true;
  }
}

function isHashOnlyHref(value = "") {
  const href =
    safeText(value, "");

  return (
    href.startsWith("#") &&
    !href.startsWith("#/")
  );
}

function isDisabledInteractive(element = null) {
  if (!element) {
    return false;
  }

  return Boolean(
    element.disabled ||
      element.hasAttribute?.("disabled") ||
      element.getAttribute?.("aria-disabled") === "true"
  );
}

function getRouteFromElement(element = null) {
  if (!element) {
    return "";
  }

  return (
    safeText(element.getAttribute?.("data-route"), "") ||
    safeText(element.getAttribute?.("data-href"), "") ||
    safeText(element.getAttribute?.("data-to"), "") ||
    safeText(element.getAttribute?.("href"), "")
  );
}

function normalizeSidebarTarget(AppCore, Router, value = "") {
  let raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (
    isUnsafeHref(raw) ||
    isExternalHref(raw) ||
    isHashOnlyHref(raw)
  ) {
    return "";
  }

  try {
    if (isFn(Router?.resolveSpaHref)) {
      raw = safeText(
        Router.resolveSpaHref(raw),
        raw
      );
    }
  } catch {}

  if (
    !raw ||
    isUnsafeHref(raw) ||
    isExternalHref(raw) ||
    isHashOnlyHref(raw)
  ) {
    return "";
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(
        raw,
        getBaseOrigin()
      );

      if (url.origin !== getBaseOrigin()) {
        return "";
      }

      raw = `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    }
  } catch {
    return "";
  }

  try {
    if (isFn(AppCore?.utils?.normalizePath)) {
      return AppCore.utils.normalizePath(raw || "/");
    }
  } catch {}

  if (raw.startsWith("#/")) {
    return raw.replace(/^#\/?/, "/");
  }

  return raw.startsWith("/")
    ? raw
    : `/${raw}`;
}

async function navigateFromSidebar({
  AppCore,
  Router,
  target = "",
  source = "sidebar",
} = {}) {
  const finalRouter =
    Router ||
    AppCore?.Router ||
    AppCore?.router;

  const cleanTarget =
    normalizeSidebarTarget(
      AppCore,
      finalRouter,
      target
    );

  if (!cleanTarget) {
    return false;
  }

  try {
    if (isFn(finalRouter?.navigate)) {
      await Promise.resolve(
        finalRouter.navigate(cleanTarget, {
          source,
          force: false,
        })
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "Router.navigate falló desde sidebar.",
      {
        target:
          cleanTarget,
        source,
        error,
      }
    );
  }

  try {
    if (isBrowser()) {
      window.location.href = cleanTarget;
      return true;
    }
  } catch {}

  return false;
}

function getSidebarNavigationElement(target = null) {
  if (!target || !isElement(target)) {
    return null;
  }

  return target.closest?.(
    [
      "[data-sidebar-nav='true']",
      "a[data-sidebar-item='true']",
      "a[data-spa]",
      "a[data-route]",
      "a[data-href]",
      "a[data-to]",
      "a[href]",
      ".menu-item[data-route]",
      ".menu-item[data-href]",
      ".menu-item[data-to]",
    ].join(",")
  ) || null;
}

function getDropdownNavigationElement(target = null) {
  if (!target || !isElement(target)) {
    return null;
  }

  return target.closest?.(
    [
      "a[data-spa]",
      "a[data-route]",
      "a[data-href]",
      "a[data-to]",
      "a[href]",
      "button[data-route]",
      "button[data-href]",
      "button[data-to]",
      "[data-sidebar-action='profile']",
      "[data-sidebar-action='settings']",
    ].join(",")
  ) || null;
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
   SCOPE EPOCH / CLEANUP
====================================================== */

function getScopeEpoch(scope) {
  const scopeName = resolveScope(scope);

  return Number(scopeEpochs.get(scopeName) || 0);
}

function bumpScopeEpoch(scope) {
  const scopeName = resolveScope(scope);
  const next = getScopeEpoch(scopeName) + 1;

  scopeEpochs.set(scopeName, next);

  return next;
}

function isCurrentScopeEpoch(scope, epoch) {
  return getScopeEpoch(scope) === epoch;
}

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

function resetLocalScope(scope) {
  const scopeName = resolveScope(scope);
  const epoch = bumpScopeEpoch(scopeName);

  runLocalCleanups(scopeName);

  return epoch;
}

function disposeLocalScope(scope) {
  const scopeName = resolveScope(scope);

  bumpScopeEpoch(scopeName);
  runLocalCleanups(scopeName);

  return true;
}

function makeSafeHandler(
  AppCore,
  scope,
  epoch,
  label = "handler",
  handler
) {
  if (!isFn(handler)) {
    return () => {};
  }

  const scopeName = resolveScope(scope);

  return function safeBoundHandler(...args) {
    if (!isCurrentScopeEpoch(scopeName, epoch)) {
      return undefined;
    }

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

/* ======================================================
   DOM BIND LOW LEVEL
====================================================== */

function bindDom(
  AppCore,
  scope,
  epoch,
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
    scopeName,
    epoch,
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

  /*
    No usamos AppCore.cleanup.on aquí.
    El sidebar tiene cleanup local propio.
  */
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
  epoch,
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
    scopeName,
    epoch,
    `Core event "${cleanEventName}"`,
    handler
  );

  let busOff = null;
  let boundToBus = false;

  /*
    Preferimos AppCore.events.
    NO nos suscribimos también a window si el bus existe.
  */
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

      boundToBus = true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.on falló para "${cleanEventName}"`,
      error
    );
  }

  if (boundToBus) {
    const cleanup = () => {
      try {
        busOff?.();
      } catch {}
    };

    pushLocalCleanup(scopeName, cleanup);

    return cleanup;
  }

  /*
    Fallback real:
    Solo usamos window si no existe AppCore.events.
  */
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
    if (windowBound) {
      try {
        window.removeEventListener(
          cleanEventName,
          windowHandler
        );
      } catch {}
    }
  };

  if (windowBound) {
    pushLocalCleanup(scopeName, cleanup);
  }

  return cleanup;
}

/* ======================================================
   ACTIVE MENU / INDICATOR BRIDGE TO state.js
====================================================== */

function syncActiveMenuItem(ctx = {}, payload = {}) {
  const AppCore = ctx.AppCore;

  try {
    return syncActiveMenuItemBase(AppCore, {
      reason:
        safeText(
          payload?.reason ||
            payload?.type ||
            payload?.event ||
            "sidebar-events:active-sync",
          "sidebar-events:active-sync"
        ),
      mutate: true,
    });
  } catch (error) {
    safeWarn(
      AppCore,
      "syncActiveMenuItemBase falló",
      error
    );

    return null;
  }
}

function syncActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore = ctx.AppCore;

  try {
    return syncActiveMenuIndicatorBase(AppCore, {
      reason:
        safeText(
          options.reason,
          "sidebar-events:indicator-sync"
        ),
      reveal:
        options.reveal !== false,
      force:
        options.force === true,
    });
  } catch (error) {
    safeWarn(
      AppCore,
      "syncActiveMenuIndicatorBase falló",
      error
    );

    return false;
  }
}

function scheduleActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore = ctx.AppCore;

  try {
    return scheduleActiveMenuIndicatorBase(AppCore, {
      reason:
        safeText(
          options.reason,
          "sidebar-events:indicator-scheduled"
        ),
      delayMs:
        Number.isFinite(Number(options.delayMs))
          ? Number(options.delayMs)
          : INDICATOR_DEFAULT_DELAY,
      reveal:
        options.reveal !== false,
      force:
        options.force === true,
    });
  } catch (error) {
    safeWarn(
      AppCore,
      "scheduleActiveMenuIndicatorBase falló",
      error
    );

    return false;
  }
}

function hideActiveMenuIndicator(ctx = {}, reason = "hide") {
  const AppCore = ctx.AppCore;

  try {
    return syncActiveMenuIndicatorBase(AppCore, {
      reason:
        safeText(reason, "hide"),
      reveal: false,
      force: true,
    });
  } catch {
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

    return true;
  }
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

  safeEmit(AppCore, "sidebar:transition:begin", {
    reason,
  });

  return true;
}

function endSidebarLayoutTransition(ctx = {}, reason = "transition") {
  const AppCore = ctx.AppCore;

  const {
    sidebar,
    body,
    sidebarMenu,
  } = resolveElements(
    AppCore,
    ctx.getElements
  );

  try {
    sidebar?.classList?.remove?.("is-transitioning");
    body?.classList?.remove?.("sidebar-transitioning");
    sidebarMenu?.classList?.remove?.("is-transitioning");
  } catch {}

  syncActiveMenuItem(ctx, {
    reason: `${reason}:end`,
  });

  scheduleActiveMenuIndicator(ctx, {
    reason: `${reason}:end`,
    delayMs: 24,
    reveal: true,
    force: true,
  });

  safeEmit(AppCore, "sidebar:transition:end", {
    reason,
  });

  return true;
}

/* ======================================================
   VISUAL COMMIT PIPELINE
====================================================== */

function createSidebarVisualCommitter(ctx = {}) {
  const AppCore = ctx.AppCore;

  const timers = new Map();

  let transitionTimer = null;
  let committing = false;
  let lastReason = "";

  const clearTimer = (key = "default") => {
    const timer = timers.get(key);

    if (timer) {
      clearWindowTimeout(timer);
      timers.delete(key);
    }
  };

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

      if (options.renderIdentity === true) {
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

      /*
        syncState solo se usa en arranque/estado explícito.
        No se usa en navegación normal para evitar bucles con state events.
      */
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

      syncActiveMenuItem(ctx, {
        ...(options.payload || {}),
        reason,
      });

      if (options.indicator !== false) {
        scheduleActiveMenuIndicator(ctx, {
          reason,
          delayMs:
            options.indicatorDelayMs ??
            INDICATOR_DEFAULT_DELAY,
          reveal:
            options.reveal !== false,
          force:
            options.force === true,
        });
      }

      safeEmit(AppCore, "sidebar:visual:committed", {
        reason,
        lastReason,
      });

      return true;
    } finally {
      committing = false;
    }
  };

  const schedule = (options = {}) => {
    const key = safeText(
      options.key,
      "default"
    );

    clearTimer(key);

    const delayMs =
      Number.isFinite(Number(options.delayMs))
        ? Number(options.delayMs)
        : 0;

    const timer = safeWindowTimeout(() => {
      timers.delete(key);

      afterFrames(() => {
        commitNow(options);
      }, options.frames || 1);
    }, delayMs);

    if (timer) {
      timers.set(key, timer);
    }

    return true;
  };

  const cancelAll = () => {
    timers.forEach((timer) => {
      clearWindowTimeout(timer);
    });

    timers.clear();

    clearWindowTimeout(transitionTimer);
    transitionTimer = null;

    return true;
  };

  const beginTransition = (reason = "transition") => {
    clearWindowTimeout(transitionTimer);

    beginSidebarLayoutTransition(ctx, reason);

    transitionTimer = safeWindowTimeout(() => {
      transitionTimer = null;
      endSidebarLayoutTransition(ctx, reason);
    }, INDICATOR_TRANSITION_MS);

    return true;
  };

  return {
    commitNow,
    schedule,
    cancelAll,

    hideIndicator:
      (reason = "hide") =>
        hideActiveMenuIndicator(ctx, reason),

    beginTransition,

    endTransition:
      (reason = "transition") => {
        clearWindowTimeout(transitionTimer);
        transitionTimer = null;
        return endSidebarLayoutTransition(ctx, reason);
      },

    getLastReason:
      () => lastReason,
  };
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
  Router,
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
    sidebarMenu,
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

  /*
    Fallback delegado:
    Si el bind directo sobre sidebarMenu no estaba disponible en el primer mount,
    el document click aún puede navegar correctamente.
  */
  const sidebarNav =
    getSidebarNavigationElement(target);

  if (
    sidebarNav &&
    sidebarMenu?.contains?.(sidebarNav)
  ) {
    if (
      !isPrimaryClick(event) ||
      isModifiedClick(event) ||
      isDisabledInteractive(sidebarNav) ||
      sidebarNav.hasAttribute?.("download") ||
      safeText(sidebarNav.getAttribute?.("target"), "").toLowerCase() === "_blank"
    ) {
      return;
    }

    const finalRouter =
      Router ||
      AppCore?.Router ||
      AppCore?.router;

    const targetPath =
      normalizeSidebarTarget(
        AppCore,
        finalRouter,
        getRouteFromElement(sidebarNav)
      );

    if (!targetPath) {
      return;
    }

    markSidebarEventHandled(
      event,
      "document-sidebar-menu:navigate"
    );

    preventDefaultAndStop(event);

    try {
      closeDropdown?.();
    } catch {}

    safeEmit(
      AppCore,
      "sidebar:navigation:request",
      {
        target:
          targetPath,

        source:
          "sidebar-menu",
      }
    );

    void navigateFromSidebar({
      AppCore,
      Router:
        finalRouter,
      target:
        targetPath,
      source:
        "sidebar-menu",
    });

    return;
  }

  if (userDropdown?.contains?.(target)) {
    const routeButton =
      getDropdownNavigationElement(target);

    if (!routeButton) {
      return;
    }

    if (
      !isPrimaryClick(event) ||
      isModifiedClick(event) ||
      isDisabledInteractive(routeButton) ||
      routeButton.hasAttribute?.("download") ||
      safeText(routeButton.getAttribute?.("target"), "").toLowerCase() === "_blank"
    ) {
      return;
    }

    const finalRouter =
      Router ||
      AppCore?.Router ||
      AppCore?.router;

    const targetPath =
      normalizeSidebarTarget(
        AppCore,
        finalRouter,
        getRouteFromElement(routeButton)
      );

    if (!targetPath) {
      return;
    }

    markSidebarEventHandled(
      event,
      "sidebar-dropdown:navigate"
    );

    preventDefaultAndStop(event);

    try {
      closeDropdown?.();
    } catch {}

    safeEmit(
      AppCore,
      "sidebar:dropdown:navigation:request",
      {
        target:
          targetPath,

        source:
          "sidebar-dropdown",
      }
    );

    void navigateFromSidebar({
      AppCore,
      Router:
        finalRouter,
      target:
        targetPath,
      source:
        "sidebar-dropdown",
    });

    return;
  }

  closeDropdown?.();
}

export function handleSidebarMenuClick({
  AppCore,
  Router,
  event,
  closeDropdown,
  getElements: resolver,
}) {
  if (wasSidebarEventHandled(event)) {
    return;
  }

  if (
    !isPrimaryClick(event) ||
    isModifiedClick(event)
  ) {
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

  const link =
    getSidebarNavigationElement(target);

  if (!link) {
    return;
  }

  if (!sidebarMenu.contains(link)) {
    return;
  }

  if (
    isDisabledInteractive(link) ||
    link.hasAttribute?.("download") ||
    safeText(link.getAttribute?.("target"), "").toLowerCase() === "_blank"
  ) {
    return;
  }

  const finalRouter =
    Router ||
    AppCore?.Router ||
    AppCore?.router;

  const targetPath =
    normalizeSidebarTarget(
      AppCore,
      finalRouter,
      getRouteFromElement(link)
    );

  if (!targetPath) {
    return;
  }

  markSidebarEventHandled(
    event,
    "sidebar-menu:navigate"
  );

  preventDefaultAndStop(event);

  try {
    closeDropdown?.();
  } catch {}

  safeEmit(
    AppCore,
    "sidebar:navigation:request",
    {
      target:
        targetPath,

      source:
        "sidebar-menu",
    }
  );

  void navigateFromSidebar({
    AppCore,
    Router:
      finalRouter,
    target:
      targetPath,
    source:
      "sidebar-menu",
  });
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
  Router,
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
    Router:
      Router ||
      AppCore?.Router ||
      AppCore?.router,
    getElements: resolver,
  };

  syncActiveMenuItem(ctx, {
    reason: "resize",
  });

  scheduleActiveMenuIndicator(ctx, {
    reason: "resize",
    delayMs: 96,
    reveal: true,
    force: true,
  });
}

/* ======================================================
   DOM BINDS
====================================================== */

export function bindDomEvents(ctx = {}) {
  const {
    AppCore,
    scope,
    Router,
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
  const localScope = resolveLocalScope(scopeName, "dom");
  const epoch = resetLocalScope(localScope);

  bindDom(
    AppCore,
    localScope,
    epoch,
    document,
    "click",
    (event) =>
      handleDocumentClick({
        AppCore,
        Router,
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
    localScope,
    epoch,
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
              Router,
              syncSidebarState,
              closeDropdown,
              getElements: resolver,
            }),
          120
        )
      : () =>
          handleResize({
            AppCore,
            Router,
            syncSidebarState,
            closeDropdown,
            getElements: resolver,
          });

  bindDom(
    AppCore,
    localScope,
    epoch,
    window,
    "resize",
    resizeHandler
  );

  bindDom(
    AppCore,
    localScope,
    epoch,
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
        Router:
          Router ||
          AppCore?.Router ||
          AppCore?.router,
        getElements: resolver,
      };

      endSidebarLayoutTransition(
        localCtx,
        "transitionend"
      );
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
      localScope,
      epoch,
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
      localScope,
      epoch,
      sidebarMenu,
      "click",
      (event) =>
        handleSidebarMenuClick({
          AppCore,
          Router,
          event,
          closeDropdown,
          getElements: resolver,
        })
    );
  }

  safeEmit(AppCore, "sidebar:dom-events:bound", {
    scope: scopeName,
    localScope,
    epoch,
  });

  return () => {
    disposeLocalScope(localScope);
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
  const localScope = resolveLocalScope(scopeName, "core");
  const epoch = resetLocalScope(localScope);

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

  const bindMany = (eventNames = [], handler) => {
    eventNames.forEach((eventName) => {
      bindCoreEvent(
        AppCore,
        localScope,
        epoch,
        eventName,
        handler
      );
    });
  };

  const commitIdentity = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "identity",
      reason:
        safeText(
          detail.reason ||
            detail.type ||
            detail.event ||
            "identity",
          "identity"
        ),
      payload: detail,
      renderIdentity: true,
      syncState: false,
      closeDropdown: false,
      delayMs: 16,
      frames: 1,
      indicatorDelayMs: 48,
    });
  };

  const commitIdentityAndState = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "identity-state",
      reason:
        safeText(
          detail.reason ||
            detail.type ||
            detail.event ||
            "identity-state",
          "identity-state"
        ),
      payload: detail,
      renderIdentity: true,
      syncState: true,
      closeDropdown: false,
      delayMs: 24,
      frames: 1,
      indicatorDelayMs: 56,
    });
  };

  const commitSessionCleared = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "session-cleared",
      reason:
        safeText(
          detail.reason ||
            detail.type ||
            detail.event ||
            "session-cleared",
          "session-cleared"
        ),
      payload: detail,
      renderIdentity: true,
      syncState: true,
      closeDropdown: true,
      delayMs: 24,
      frames: 1,
      indicatorDelayMs: 56,
    });
  };

  const commitRoute = (eventName) => {
    return (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.schedule({
        key: "route",
        reason: eventName,
        payload: detail,
        renderIdentity: false,
        syncState: false,
        closeDropdown: false,
        delayMs: 24,
        frames: 2,
        indicatorDelayMs: 32,
        force: true,
      });
    };
  };

  const commitRouterRendered = (eventOrPayload = {}) => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "router-rendered",
      reason: "router:rendered",
      payload: detail,
      renderIdentity: false,
      syncState: false,
      closeDropdown: true,
      delayMs: 0,
      frames: 2,
      indicatorDelayMs: 48,
      force: true,
    });

    visualCommitter.schedule({
      key: "router-rendered-settled",
      reason: "router:rendered:settled",
      payload: detail,
      renderIdentity: false,
      syncState: false,
      closeDropdown: false,
      delayMs: 140,
      frames: 2,
      indicatorDelayMs: 0,
      force: true,
    });
  };

  const commitSidebarTransition = (eventName) => {
    return (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.beginTransition(eventName);

      visualCommitter.schedule({
        key: "sidebar-transition-live",
        reason: eventName,
        payload: detail,
        renderIdentity: false,
        syncState: false,
        closeDropdown: false,
        delayMs: 48,
        indicatorDelayMs: 80,
        force: true,
      });

      visualCommitter.schedule({
        key: "sidebar-transition-settled",
        reason: `${eventName}:settled`,
        payload: detail,
        renderIdentity: false,
        syncState: false,
        closeDropdown: false,
        delayMs: INDICATOR_TRANSITION_MS,
        indicatorDelayMs: 24,
        force: true,
      });
    };
  };

  /*
    Identidad / sesión.
    NO escuchamos app:user-ui:sync para evitar bucle:
      syncUserUI -> event -> SidebarEvents -> renderUser/applyRole -> syncUserUI...
  */
  bindMany(
    [
      "app:user:change",
      "app:user:updated",
      "app:session:change",
      "app:session:restored",
      "app:auth:change",

      "auth:change",
      "auth:updated",
      "auth:restore:success",
      "auth:session:restored",
      "auth:session:applied",
    ],
    commitIdentity
  );

  bindMany(
    [
      "login:success",
      "auth:login:success",
      "app:login:success",
    ],
    commitIdentityAndState
  );

  bindMany(
    [
      "app:session:cleared",
      "auth:session:cleared",
      "auth:logout",
      "auth:logout:success",
      "logout:success",
    ],
    commitSessionCleared
  );

  /*
    Cambios manuales del sidebar.
    NO escuchamos sidebar:state:synced / sidebar:refreshed / sidebar:repaired,
    porque esos pueden salir de los propios commits visuales.
  */
  bindMany(
    [
      "app:sidebar:change",
      "sidebar:state:change",
    ],
    commitSidebarTransition("sidebar:state:change")
  );

  bindCoreEvent(
    AppCore,
    localScope,
    epoch,
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
    localScope,
    epoch,
    "router:rendered",
    commitRouterRendered
  );

  [
    "app:route:change",
    "router:route:change",
    "router:navigation:complete",
    "router:render:async-complete",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      localScope,
      epoch,
      eventName,
      commitRoute(eventName)
    );
  });

  /*
    NO escuchamos:
      - router:shell:state
      - router:shell:repair
      - router:shell:change

    El shell lo gestiona App/Shell/Router.
    Escucharlo aquí creaba bucles con repairShell().
  */

  bindCoreEvent(
    AppCore,
    localScope,
    epoch,
    "app:ui:repair-request",
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      /*
        Solo commit visual local.
        No repair(), no rebind(), no hard sync.
      */
      visualCommitter.schedule({
        key: "ui-repair-request",
        reason: "app:ui:repair-request",
        payload: detail,
        renderIdentity: true,
        syncState: detail.syncState === true,
        closeDropdown: false,
        delayMs: 32,
        frames: 2,
        indicatorDelayMs: 56,
        force: true,
      });
    }
  );

  bindMany(
    [
      "app:ready",
      "app:boot:ready",
      "app:boot:complete",
      "router:bound",
    ],
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.schedule({
        key: "app-ready",
        reason:
          safeText(
            detail.reason ||
              detail.type ||
              detail.event ||
              "app-ready",
            "app-ready"
          ),
        payload: detail,
        renderIdentity: true,
        syncState: false,
        closeDropdown: false,
        delayMs: 64,
        frames: 2,
        indicatorDelayMs: 56,
        force: true,
      });
    }
  );

  bindMany(
    [
      "app:lang:change",
      "i18n:change",
      "theme:change",
      "app:theme:change",
    ],
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.schedule({
        key: "visual-env-change",
        reason:
          safeText(
            detail.reason ||
              detail.type ||
              detail.event ||
              "visual-env-change",
            "visual-env-change"
          ),
        payload: detail,
        renderIdentity: true,
        syncState: false,
        closeDropdown: false,
        delayMs: 48,
        frames: 2,
        indicatorDelayMs: 56,
        force: true,
      });
    }
  );

  safeEmit(AppCore, "sidebar:core-events:bound", {
    scope: scopeName,
    localScope,
    epoch,
  });

  safeLog(AppCore, "core events bound", {
    scope: scopeName,
    localScope,
    epoch,
  });

  return () => {
    visualCommitter.cancelAll();
    disposeLocalScope(localScope);
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

  beginSidebarLayoutTransition,
  endSidebarLayoutTransition,
};
