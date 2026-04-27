/* =========================================================
   Onion SPA - Sidebar Events
   Archivo: src/ui/sidebar/events.js

   FINAL EXTREME SYSTEM · SIDEBAR EVENTS / PASSIVE ORCHESTRATOR · 10/10

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
   - sincronizar item activo delegando en state.js
   - sincronizar indicador visual tipo Apple delegando en state.js
   - evitar indicador colgado al colapsar/expandir sin crear transición paralela
   - centralizar commit visual post-router/post-resize/post-auth
   - evitar doble dispatch AppCore.events + window
   - evitar loops entre sidebar:state:synced / syncSidebarState
   - evitar doble toggle entre events.js y fallback delegado de index.js

   REGLA CRÍTICA:
   - events.js NO escribe variables CSS del indicador.
   - events.js NO gestiona transición visual propia del sidebar.
   - state.js es el único dueño de:
     --sidebar-indicator-x/y/w/h/opacity
     .sidebar-transitioning
     .is-transitioning
     transición collapse/expand
========================================================= */

import {
  getElements,
  sanitizeFooterTooltipState,
} from "./dom.js";

import {
  syncActiveMenuItem as syncActiveMenuItemState,
  syncActiveMenuIndicator as syncActiveMenuIndicatorState,
  scheduleActiveMenuIndicator as scheduleActiveMenuIndicatorState,
} from "./state.js";

/* ======================================================
   LOCAL CLEANUP FALLBACK
====================================================== */

const localCleanups = new Map();

/* ======================================================
   CONSTANTS
====================================================== */

const DEFAULT_SCOPE = "ui:sidebar";

const HANDLED_FLAG = "__onionSidebarHandled";
const LOCAL_HANDLED_FLAG = "__onionSidebarEventsHandled";

const VISUAL_COMMIT_DEFAULT_DELAY = 24;
const VISUAL_COMMIT_AFTER_ROUTE_DELAY = 48;
const VISUAL_COMMIT_SETTLED_DELAY = 140;
const VISUAL_COMMIT_RESIZE_DELAY = 120;

const HOVER_FLUSH_ROUTE_MS = 96;

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
  Si events.js escucha ambos canales, emitir doble provoca:
  - doble commit visual
  - doble indicador
  - flicker
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
      return window.setTimeout(safeFn, Math.max(0, Number(ms) || 0));
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
        resolveScope(scope).split(":").slice(0, 2).join(":") || DEFAULT_SCOPE,
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

  /*
    Preferimos AppCore.cleanup.event si existe.
  */
  try {
    if (isFn(AppCore?.cleanup?.event)) {
      const maybeCleanup = AppCore.cleanup.event(
        resolveScope(scope).split(":").slice(0, 2).join(":") || DEFAULT_SCOPE,
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

  /*
    Solo escuchamos window como fallback si NO hay bus.
    Evita recibir dos veces el mismo evento cuando safeEmit usa bus.
  */
  let windowBound = false;
  let windowHandler = null;

  if (!busOff) {
    windowHandler = (event) => {
      safeHandler(event);
    };

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
  }

  const cleanup = () => {
    try {
      busOff?.();
    } catch {}

    if (windowBound && windowHandler) {
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
   ROUTE / LINK HELPERS
====================================================== */

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

function isInside(element = null, target = null) {
  if (!element || !target) {
    return false;
  }

  try {
    return element === target || element.contains(target);
  } catch {
    return false;
  }
}

function closest(target = null, selector = "") {
  if (!target || !selector) {
    return null;
  }

  try {
    return target.closest(selector);
  } catch {
    return null;
  }
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
   STATE.JS DELEGATION WRAPPERS
====================================================== */

export function syncActiveMenuItem(ctx = {}, payload = {}) {
  const AppCore = ctx?.AppCore || ctx;

  return syncActiveMenuItemState(
    AppCore,
    {
      payload: safeObject(payload),
      reason:
        safeText(
          payload?.reason || ctx?.reason,
          "events:sync-active-item"
        ),
    }
  );
}

export function syncActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore = ctx?.AppCore || ctx;

  return syncActiveMenuIndicatorState(
    AppCore,
    {
      ...safeObject(options),
      reason:
        safeText(
          options?.reason || ctx?.reason,
          "events:sync-indicator"
        ),
    }
  );
}

export function scheduleActiveMenuIndicator(ctx = {}, options = {}) {
  const AppCore = ctx?.AppCore || ctx;

  return scheduleActiveMenuIndicatorState(
    AppCore,
    {
      ...safeObject(options),
      reason:
        safeText(
          options?.reason || ctx?.reason,
          "events:schedule-indicator"
        ),
    }
  );
}

export function hideActiveMenuIndicator(ctx = {}, reason = "hide") {
  const AppCore = ctx?.AppCore || ctx;

  return syncActiveMenuIndicatorState(
    AppCore,
    {
      reason,
      reveal: false,
      force: true,
    }
  );
}

/*
  Compatibilidad: antes events.js exponía begin/end transition.
  Ahora NO gestiona clases de transición. Solo pide ocultar/recalcular indicador
  delegando en state.js.
*/
export function beginSidebarLayoutTransition(ctx = {}, reason = "transition") {
  hideActiveMenuIndicator(ctx, `${reason}:begin`);
  return true;
}

export function endSidebarLayoutTransition(ctx = {}, reason = "transition") {
  scheduleActiveMenuIndicator(ctx, {
    reason: `${reason}:end`,
    delayMs: 32,
    reveal: true,
    force: true,
  });

  return true;
}

/* ======================================================
   VISUAL COMMIT PIPELINE
====================================================== */

function createSidebarVisualCommitter(ctx = {}) {
  const AppCore = ctx.AppCore;

  const timers = new Map();

  let committing = false;
  let lastReason = "";
  let generation = 0;

  const clearTimer = (key = "default") => {
    const timer = timers.get(key);

    if (timer) {
      clearWindowTimeout(timer);
      timers.delete(key);
    }
  };

  const cancelAll = () => {
    generation += 1;

    timers.forEach((timer) => {
      clearWindowTimeout(timer);
    });

    timers.clear();

    return true;
  };

  const flushHover = (reason = "visual-commit") => {
    try {
      ctx.api?.flushHover?.(
        reason,
        HOVER_FLUSH_ROUTE_MS
      );
    } catch {}
  };

  const commitNow = (options = {}) => {
    if (committing) {
      return false;
    }

    committing = true;

    const opts = safeObject(options);

    const reason = safeText(
      opts.reason,
      "visual-commit"
    );

    lastReason = reason;

    try {
      if (opts.flushHover === true) {
        flushHover(reason);
      }

      if (opts.closeDropdown === true) {
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

      if (opts.renderIdentity !== false) {
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

      if (opts.sanitize !== false) {
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

      /*
        syncState solo cuando hace falta: shell/app ready/login/logout.
        No lo usamos en sidebar:state:synced para evitar bucles.
      */
      if (opts.syncState === true) {
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

      const detail =
        safeObject(opts.payload);

      const activeItem =
        syncActiveMenuItemState(
          AppCore,
          {
            ...detail,
            payload: detail,
            reason,
            mutate: opts.mutateActive !== false,
          }
        );

      if (opts.indicator !== false) {
        scheduleActiveMenuIndicatorState(
          AppCore,
          {
            ...detail,
            payload: detail,
            reason,
            activeItem,
            delayMs:
              opts.indicatorDelayMs ??
              VISUAL_COMMIT_DEFAULT_DELAY,
            reveal:
              opts.reveal !== false,
            force:
              opts.forceIndicator === true,
          }
        );
      }

      safeEmit(AppCore, "sidebar:visual:committed", {
        source: "SidebarEvents",
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
    const opts = safeObject(options);

    const key = safeText(
      opts.key,
      "default"
    );

    clearTimer(key);

    const delayMs =
      Number.isFinite(Number(opts.delayMs))
        ? Number(opts.delayMs)
        : 0;

    const expectedGeneration = generation;

    const timer = safeWindowTimeout(() => {
      timers.delete(key);

      afterFrames(() => {
        if (expectedGeneration !== generation) {
          return;
        }

        commitNow(opts);
      }, opts.frames || 1);
    }, delayMs);

    if (timer) {
      timers.set(key, timer);
    }

    return true;
  };

  return {
    commitNow,
    schedule,
    cancelAll,

    hideIndicator:
      (reason = "hide") =>
        hideActiveMenuIndicator(
          {
            AppCore,
          },
          reason
        ),

    getLastReason:
      () => lastReason,
  };
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

  if (isInside(toggleBtn, target)) {
    markSidebarEventHandled(event, "document-toggle-sidebar");
    preventDefaultAndStop(event);
    toggleSidebar?.();
    return;
  }

  if (isInside(mobileToggleBtn, target)) {
    markSidebarEventHandled(event, "document-mobile-toggle-sidebar");
    preventDefaultAndStop(event);
    toggleSidebar?.();
    return;
  }

  if (isInside(userToggle, target)) {
    markSidebarEventHandled(event, "document-toggle-dropdown");
    preventDefaultAndStop(event);
    toggleDropdown?.();
    return;
  }

  if (isInside(logoutBtn, target)) {
    markSidebarEventHandled(event, "document-logout");
    preventDefaultAndStop(event);
    void handleLogout?.();
    return;
  }

  if (isInside(userDropdown, target)) {
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

  const link = closest(
    target,
    "a[data-spa], a[data-route], .menu-item"
  );

  if (!link) {
    return;
  }

  if (!sidebarMenu.contains(link)) {
    return;
  }

  /*
    No prevenimos navegación aquí.
    Router global o fallback de SidebarUI gestionan la navegación.
    events.js solo cierra dropdown y deja que state.js recalcule después.
  */
  try {
    closeDropdown?.();
  } catch {}

  safeEmit(AppCore, "sidebar:menu:click", {
    source: "SidebarEvents",
    route: getRouteFromElement(link),
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

    try {
      event.preventDefault?.();
      event.stopPropagation?.();
    } catch {}

    toggleDropdown?.();
    return;
  }

  if (event.key === "Escape") {
    markSidebarEventHandled(event, "user-toggle-keyboard-close");

    try {
      event.preventDefault?.();
      event.stopPropagation?.();
    } catch {}

    closeDropdown?.();
    return;
  }

  if (event.key === "ArrowDown") {
    markSidebarEventHandled(event, "user-toggle-keyboard-open");

    try {
      event.preventDefault?.();
      event.stopPropagation?.();
    } catch {}

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
  const ctx = {
    AppCore,
    Router:
      Router ||
      AppCore?.Router ||
      AppCore?.router,
    getElements: resolver,
  };

  try {
    syncSidebarState?.();
  } catch {}

  try {
    closeDropdown?.();
  } catch {}

  const activeItem =
    syncActiveMenuItemState(
      AppCore,
      {
        reason: "resize",
        mutate: true,
      }
    );

  scheduleActiveMenuIndicatorState(
    AppCore,
    {
      reason: "resize",
      activeItem,
      delayMs: VISUAL_COMMIT_RESIZE_DELAY,
      reveal: true,
      force: true,
    }
  );

  safeEmit(AppCore, "sidebar:resize:handled", {
    source: "SidebarEvents",
    hasActiveItem: Boolean(activeItem),
    routerPresent: Boolean(ctx.Router),
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

  runLocalCleanups(localScope);

  bindDom(
    AppCore,
    localScope,
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
    localScope,
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
    window,
    "resize",
    resizeHandler
  );

  /*
    NO bind de transitionend aquí.
    state.js ya gestiona la transición real del sidebar.
  */

  const {
    userToggle,
    sidebarMenu,
  } = resolveElements(AppCore, resolver);

  if (userToggle) {
    bindDom(
      AppCore,
      localScope,
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
    source: "SidebarEvents",
    scope: scopeName,
    localScope,
  });

  return () => {
    runLocalCleanups(localScope);
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

  runLocalCleanups(localScope);

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

  const scheduleIdentity = (eventOrPayload = {}, reason = "identity") => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "identity",
      reason,
      payload: detail,
      renderIdentity: true,
      syncState: false,
      closeDropdown: false,
      delayMs: VISUAL_COMMIT_DEFAULT_DELAY,
      frames: 2,
      indicatorDelayMs: 48,
    });
  };

  const scheduleIdentityAndState = (eventOrPayload = {}, reason = "identity-and-state") => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "identity-state",
      reason,
      payload: detail,
      renderIdentity: true,
      syncState: true,
      closeDropdown: false,
      delayMs: VISUAL_COMMIT_DEFAULT_DELAY,
      frames: 2,
      indicatorDelayMs: 56,
      forceIndicator: true,
    });
  };

  const scheduleSessionCleared = (eventOrPayload = {}, reason = "session-cleared") => {
    const detail = getEventDetail(eventOrPayload);

    visualCommitter.schedule({
      key: "session-cleared",
      reason,
      payload: detail,
      renderIdentity: true,
      syncState: true,
      closeDropdown: true,
      delayMs: VISUAL_COMMIT_DEFAULT_DELAY,
      frames: 2,
      indicatorDelayMs: 56,
      forceIndicator: true,
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
      localScope,
      eventName,
      (eventOrPayload = {}) =>
        scheduleIdentity(
          eventOrPayload,
          eventName
        )
    );
  });

  [
    "login:success",
    "auth:login:success",
    "app:login:success",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      localScope,
      eventName,
      (eventOrPayload = {}) =>
        scheduleIdentityAndState(
          eventOrPayload,
          eventName
        )
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
      localScope,
      eventName,
      (eventOrPayload = {}) =>
        scheduleSessionCleared(
          eventOrPayload,
          eventName
        )
    );
  });

  /*
    Eventos de estado del sidebar:
    - NO escuchamos sidebar:state:synced para llamar syncState.
    - NO empezamos transición aquí.
    - state.js ya ha hecho el trabajo.
  */
  [
    "app:sidebar:change",
    "sidebar:state:change",
    "sidebar:state:repaired",
    "sidebar:state:unchanged",
    "sidebar:ui:open:set",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      localScope,
      eventName,
      (eventOrPayload = {}) => {
        const detail = getEventDetail(eventOrPayload);

        visualCommitter.schedule({
          key: "sidebar-state-event",
          reason: eventName,
          payload: detail,
          renderIdentity: false,
          syncState: false,
          closeDropdown: false,
          delayMs: 48,
          frames: 2,
          indicatorDelayMs: 56,
          forceIndicator: true,
        });
      }
    );
  });

  /*
    Eventos propios de SidebarUI.
    No forzamos state sync para evitar bucles con refresh()/repair().
  */
  [
    "sidebar:refreshed",
    "sidebar:repaired",
    "sidebar:active-route:synced",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      localScope,
      eventName,
      (eventOrPayload = {}) => {
        const detail = getEventDetail(eventOrPayload);

        visualCommitter.schedule({
          key: "sidebar-ui-event",
          reason: eventName,
          payload: detail,
          renderIdentity: false,
          syncState: false,
          closeDropdown: false,
          delayMs: 24,
          frames: 2,
          indicatorDelayMs: 32,
          forceIndicator: true,
        });
      }
    );
  });

  bindCoreEvent(
    AppCore,
    localScope,
    "router:before-render",
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      try {
        closeDropdown?.();
      } catch {}

      try {
        ctx.api?.flushHover?.(
          "router:before-render",
          HOVER_FLUSH_ROUTE_MS
        );
      } catch {}

      hideActiveMenuIndicator(
        {
          AppCore,
        },
        "router:before-render"
      );

      safeEmit(AppCore, "sidebar:router:before-render:handled", {
        source: "SidebarEvents",
        payload: detail,
      });
    }
  );

  bindCoreEvent(
    AppCore,
    localScope,
    "router:rendered",
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.schedule({
        key: "router-rendered",
        reason: "router:rendered",
        payload: detail,
        renderIdentity: true,
        syncState: true,
        closeDropdown: true,
        flushHover: true,
        delayMs: 0,
        frames: 2,
        indicatorDelayMs: VISUAL_COMMIT_AFTER_ROUTE_DELAY,
        forceIndicator: true,
      });

      visualCommitter.schedule({
        key: "router-rendered-settled",
        reason: "router:rendered:settled",
        payload: detail,
        renderIdentity: false,
        syncState: false,
        closeDropdown: false,
        delayMs: VISUAL_COMMIT_SETTLED_DELAY,
        frames: 2,
        indicatorDelayMs: 0,
        forceIndicator: true,
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
      localScope,
      eventName,
      (eventOrPayload = {}) => {
        const detail = getEventDetail(eventOrPayload);

        visualCommitter.schedule({
          key: "route-change",
          reason: eventName,
          payload: detail,
          renderIdentity: false,
          syncState: false,
          closeDropdown: false,
          flushHover: true,
          delayMs: 16,
          frames: 2,
          indicatorDelayMs: 32,
          forceIndicator: true,
        });
      }
    );
  });

  [
    "router:shell:change",
    "router:shell:state",
    "router:shell:repair",
  ].forEach((eventName) => {
    bindCoreEvent(
      AppCore,
      localScope,
      eventName,
      (eventOrPayload = {}) => {
        const detail = safeObject(
          getEventDetail(eventOrPayload)
        );

        if (detail.hidden || detail.shellHidden) {
          try {
            closeDropdown?.();
          } catch {}

          hideActiveMenuIndicator(
            {
              AppCore,
            },
            `${eventName}:hidden`
          );
        }

        visualCommitter.schedule({
          key: "shell-change",
          reason: eventName,
          payload: detail,
          renderIdentity: true,
          syncState: true,
          closeDropdown: Boolean(detail.hidden || detail.shellHidden),
          delayMs: 32,
          frames: 2,
          indicatorDelayMs: 56,
          forceIndicator: true,
        });
      }
    );
  });

  bindCoreEvent(
    AppCore,
    localScope,
    "app:ui:repair-request",
    (eventOrPayload = {}) => {
      const detail = getEventDetail(eventOrPayload);

      visualCommitter.schedule({
        key: "ui-repair",
        reason: "app:ui:repair-request",
        payload: detail,
        renderIdentity: true,
        syncState: true,
        closeDropdown: false,
        delayMs: 16,
        frames: 2,
        indicatorDelayMs: 56,
        forceIndicator: true,
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
      localScope,
      eventName,
      (eventOrPayload = {}) => {
        const detail = getEventDetail(eventOrPayload);

        visualCommitter.schedule({
          key: "app-ready",
          reason: eventName,
          payload: detail,
          renderIdentity: true,
          syncState: true,
          closeDropdown: false,
          delayMs: 64,
          frames: 2,
          indicatorDelayMs: 56,
          forceIndicator: true,
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
      localScope,
      eventName,
      (eventOrPayload = {}) => {
        const detail = getEventDetail(eventOrPayload);

        visualCommitter.schedule({
          key: "visual-env-change",
          reason: eventName,
          payload: detail,
          renderIdentity: true,
          syncState: false,
          closeDropdown: false,
          delayMs: 32,
          frames: 2,
          indicatorDelayMs: 56,
          forceIndicator: true,
        });
      }
    );
  });

  safeEmit(AppCore, "sidebar:core-events:bound", {
    source: "SidebarEvents",
    scope: scopeName,
    localScope,
  });

  safeLog(AppCore, "core events bound", {
    scope: scopeName,
    localScope,
  });

  return () => {
    visualCommitter.cancelAll();
    runLocalCleanups(localScope);
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
