/* =========================================================
   Onion SPA - Home Bindings
   Archivo: src/views/home/home.bindings.js

   Responsabilidades:
   - bind DOM robusto
   - refresh / retry dashboard
   - export CSV
   - open widget / bloque
   - copy widget id
   - quick actions / navegación
   - rebind limpio tras rerender
   - cleanup sólido por scope

   FINAL PRO SYSTEM:
   - evita doble click handlers
   - soporta botones dinámicos
   - delegación premium
   - fallback si AppCore.cleanup no existe
   - browser guards
   - bloqueo de targets hidden / inert / disabled
   - soporte data-action y data-home-action
   - soporte botones directos + delegados
   - busy state durante acciones async
   - rutas internas seguras
========================================================= */

import { AppCore } from "../../core/index.js";

const DEFAULT_SCOPE = "view:home";

/* =========================================================
   LOCAL CLEANUP FALLBACK
========================================================= */

const localCleanups = new Map();

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFn(value) {
  return typeof value === "function";
}

function isElement(value) {
  try {
    return (
      typeof Element !== "undefined" &&
      value instanceof Element
    );
  } catch {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.closest === "function"
    );
  }
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
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

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[HomeBindings]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[HomeBindings]",
      ...args
    );
  } catch {}
}

function safeEmit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");

  if (!name) {
    return false;
  }

  try {
    AppCore?.events?.emit?.(
      name,
      payload
    );

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

function resolveScopeName(scope = DEFAULT_SCOPE) {
  return safeText(
    scope,
    DEFAULT_SCOPE
  );
}

function pushLocalCleanup(scope, cleanup) {
  if (!isFn(cleanup)) {
    return;
  }

  const scopeName =
    resolveScopeName(scope);

  const bucket =
    localCleanups.get(scopeName) || [];

  bucket.push(cleanup);
  localCleanups.set(scopeName, bucket);
}

function runLocalCleanups(scope) {
  const scopeName =
    resolveScopeName(scope);

  const bucket =
    localCleanups.get(scopeName) || [];

  bucket.forEach((cleanup) => {
    try {
      cleanup?.();
    } catch {}
  });

  localCleanups.delete(scopeName);
}

function cleanupScope(scope = DEFAULT_SCOPE) {
  const scopeName =
    resolveScopeName(scope);

  try {
    AppCore?.cleanup?.run?.(
      scopeName
    );
  } catch {}

  runLocalCleanups(scopeName);

  return true;
}

function getScope(scope = DEFAULT_SCOPE) {
  const scopeName =
    resolveScopeName(scope);

  cleanupScope(scopeName);

  try {
    return (
      AppCore?.cleanup?.scope?.(
        scopeName
      ) || scopeName
    );
  } catch {
    return scopeName;
  }
}

function bindOn(
  scope,
  target,
  eventName,
  handler,
  options = undefined
) {
  const scopeName =
    resolveScopeName(scope);

  if (
    !target ||
    !eventName ||
    !isFn(handler)
  ) {
    return () => {};
  }

  try {
    if (isFn(AppCore?.cleanup?.on)) {
      AppCore.cleanup.on(
        scopeName,
        target,
        eventName,
        handler,
        options
      );

      return () => {};
    }
  } catch {}

  try {
    target.addEventListener(
      eventName,
      handler,
      options
    );

    const cleanup = () => {
      try {
        target.removeEventListener(
          eventName,
          handler,
          options
        );
      } catch {}
    };

    pushLocalCleanup(
      scopeName,
      cleanup
    );

    return cleanup;
  } catch {
    return () => {};
  }
}

function getContainer() {
  if (!isBrowser()) {
    return null;
  }

  try {
    const fromCore =
      AppCore?.dom?.viewContainer;

    if (
      fromCore &&
      document.contains(fromCore)
    ) {
      return fromCore;
    }
  } catch {}

  try {
    return (
      document.getElementById("view-container") ||
      document.querySelector("[data-view-root]") ||
      document
    );
  } catch {
    return document;
  }
}

function contains(root, node) {
  if (!root || !node) {
    return false;
  }

  try {
    if (root === document) {
      return true;
    }

    return root === node || root.contains(node);
  } catch {
    return false;
  }
}

function closestFromEvent(event, selector, root = null) {
  const target =
    event?.target || null;

  if (!isElement(target)) {
    return null;
  }

  let element = null;

  try {
    element =
      target.closest(selector);
  } catch {
    element = null;
  }

  if (!element) {
    return null;
  }

  if (
    root &&
    !contains(root, element)
  ) {
    return null;
  }

  return element;
}

function getById(id = "") {
  if (!isBrowser()) {
    return null;
  }

  const cleanId =
    safeText(id, "");

  if (!cleanId) {
    return null;
  }

  try {
    return document.getElementById(cleanId);
  } catch {
    return null;
  }
}

function getActionElement(event, actionName = "", root = null) {
  const action =
    safeText(actionName, "");

  if (!action) {
    return null;
  }

  return closestFromEvent(
    event,
    [
      `[data-action="${action}"]`,
      `[data-home-action="${action}"]`,
    ].join(","),
    root
  );
}

function getAnyActionElement(event, root = null) {
  return closestFromEvent(
    event,
    [
      "[data-action]",
      "[data-home-action]",
      "[data-quick-action]",
      "[data-route]",
      "[data-href]",
      "[data-widget-id]",
      "[data-widget-key]",
    ].join(","),
    root
  );
}

function getActionName(element = null) {
  return safeText(
    element?.dataset?.homeAction ||
      element?.getAttribute?.("data-home-action") ||
      element?.dataset?.action ||
      element?.getAttribute?.("data-action"),
    ""
  );
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

function isDisabledElement(element = null) {
  if (!element) {
    return false;
  }

  return Boolean(
    element.disabled === true ||
      element.getAttribute?.("aria-disabled") === "true" ||
      element.closest?.("[disabled]") ||
      element.closest?.("[aria-disabled='true']") ||
      element.closest?.("[data-disabled='true']")
  );
}

function isHiddenElement(element = null) {
  if (!element) {
    return false;
  }

  return Boolean(
    element.hidden === true ||
      element.closest?.("[hidden]") ||
      element.closest?.("[inert]") ||
      element.closest?.("[data-home-hidden='true']") ||
      element.closest?.("[data-visible='false']")
  );
}

function shouldIgnoreEventTarget(element = null) {
  return Boolean(
    !element ||
      isDisabledElement(element) ||
      isHiddenElement(element)
  );
}

function setElementBusy(element = null, busy = false) {
  if (!element) {
    return;
  }

  const value =
    Boolean(busy);

  try {
    element.setAttribute(
      "aria-busy",
      value ? "true" : "false"
    );
  } catch {}

  try {
    element.classList.toggle(
      "is-busy",
      value
    );

    element.classList.toggle(
      "is-loading",
      value
    );
  } catch {}

  try {
    if (
      "disabled" in element &&
      (
        element.tagName === "BUTTON" ||
        element.tagName === "INPUT"
      )
    ) {
      element.disabled = value;
    }
  } catch {}
}

async function withBusy(element, fn) {
  if (!isFn(fn)) {
    return null;
  }

  setElementBusy(element, true);

  try {
    return await fn();
  } finally {
    setElementBusy(element, false);
  }
}

function getWidgetSourceElement(element = null) {
  if (!element) {
    return null;
  }

  try {
    return (
      element.closest?.("[data-widget-id], [data-widget-key]") ||
      element
    );
  } catch {
    return element;
  }
}

function getWidgetId(element = null) {
  const source =
    getWidgetSourceElement(element);

  return safeText(
    source?.dataset?.widgetId ||
      source?.getAttribute?.("data-widget-id") ||
      element?.dataset?.widgetId ||
      element?.getAttribute?.("data-widget-id"),
    ""
  );
}

function getWidgetKey(element = null) {
  const source =
    getWidgetSourceElement(element);

  return safeText(
    source?.dataset?.widgetKey ||
      source?.getAttribute?.("data-widget-key") ||
      element?.dataset?.widgetKey ||
      element?.getAttribute?.("data-widget-key"),
    ""
  );
}

function getWidgetRoute(element = null) {
  const source =
    element?.closest?.("[data-route], [data-href], [href]") ||
    element;

  return safeText(
    source?.dataset?.route ||
      source?.getAttribute?.("data-route") ||
      source?.dataset?.href ||
      source?.getAttribute?.("data-href") ||
      source?.getAttribute?.("href"),
    ""
  );
}

function getQuickActionName(element = null) {
  return safeText(
    element?.dataset?.quickAction ||
      element?.getAttribute?.("data-quick-action") ||
      element?.dataset?.actionName ||
      element?.getAttribute?.("data-action-name"),
    ""
  );
}

function getPayloadFromDataset(element = null) {
  const raw =
    element?.dataset?.payload ||
    element?.getAttribute?.("data-payload") ||
    "";

  const text =
    safeText(raw, "");

  if (!text) {
    return {};
  }

  try {
    const parsed =
      JSON.parse(text);

    return safeObject(parsed);
  } catch (error) {
    safeWarn(
      "payload JSON inválido.",
      error
    );

    return {};
  }
}

function isUnsafeRoute(route = "") {
  const value =
    safeText(route, "");

  return (
    !value ||
    value === "#" ||
    /^(javascript:|data:|vbscript:)/i.test(value)
  );
}

function isExternalRoute(route = "") {
  const value =
    safeText(route, "");

  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    if (!isBrowser()) {
      return true;
    }

    return new URL(value).origin !== window.location.origin;
  } catch {
    return true;
  }
}

function normalizeInternalRoute(route = "") {
  const value =
    safeText(route, "");

  if (
    isUnsafeRoute(value) ||
    isExternalRoute(value)
  ) {
    return "";
  }

  if (value.startsWith("/")) {
    return value;
  }

  if (
    value.startsWith("?") ||
    value.startsWith("#")
  ) {
    return value;
  }

  return `/${value}`;
}

async function safeReload({
  reload,
  loadHomeDashboard,
} = {}) {
  try {
    if (isFn(reload)) {
      await reload();
      return true;
    }

    if (isFn(loadHomeDashboard)) {
      await loadHomeDashboard({
        force: true,
      });

      return true;
    }
  } catch (error) {
    safeWarn(
      "reload falló.",
      error
    );
  }

  return false;
}

/* =========================================================
   ACTION HANDLERS
========================================================= */

async function handleRefresh({
  event,
  element,
  reload,
  loadHomeDashboard,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  safeEmit("home:ui:refresh", {
    source: "bindings",
  });

  return withBusy(
    element,
    () =>
      safeReload({
        reload,
        loadHomeDashboard,
      })
  );
}

async function handleExport({
  event,
  element,
  exportHomeCsvAction,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (!isFn(exportHomeCsvAction)) {
    safeWarn("exportHomeCsvAction no disponible.");
    return false;
  }

  return withBusy(
    element,
    async () => {
      try {
        await exportHomeCsvAction();
        return true;
      } catch (error) {
        safeWarn(
          "exportHomeCsvAction falló.",
          error
        );

        return false;
      }
    }
  );
}

async function handleOpenWidget({
  event,
  element,
  openHomeWidgetAction,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const widgetId =
    getWidgetId(element) ||
    getWidgetKey(element);

  if (!widgetId) {
    safeWarn("open-home-widget sin id.");
    return false;
  }

  if (!isFn(openHomeWidgetAction)) {
    safeWarn("openHomeWidgetAction no disponible.");
    return false;
  }

  return withBusy(
    element,
    async () => {
      try {
        await openHomeWidgetAction({
          widgetId,
        });

        return true;
      } catch (error) {
        safeWarn(
          "openHomeWidgetAction falló.",
          error
        );

        return false;
      }
    }
  );
}

async function handleCopyWidgetId({
  event,
  element,
  copyHomeWidgetIdAction,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const widgetId =
    getWidgetId(element) ||
    getWidgetKey(element);

  if (!widgetId) {
    safeWarn("copy-home-widget-id sin id.");
    return false;
  }

  if (!isFn(copyHomeWidgetIdAction)) {
    safeWarn("copyHomeWidgetIdAction no disponible.");
    return false;
  }

  return withBusy(
    element,
    async () => {
      try {
        await copyHomeWidgetIdAction({
          widgetId,
        });

        return true;
      } catch (error) {
        safeWarn(
          "copyHomeWidgetIdAction falló.",
          error
        );

        return false;
      }
    }
  );
}

async function handleQuickAction({
  event,
  element,
  runHomeQuickAction,
}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  const action =
    getQuickActionName(element);

  const route =
    normalizeInternalRoute(
      getWidgetRoute(element)
    );

  const payload =
    getPayloadFromDataset(element);

  if (!action && !route) {
    safeWarn("run-home-quick-action sin action ni route.");
    return false;
  }

  if (!isFn(runHomeQuickAction)) {
    safeWarn("runHomeQuickAction no disponible.");
    return false;
  }

  return withBusy(
    element,
    async () => {
      try {
        await runHomeQuickAction({
          action,
          route,
          payload,
        });

        return true;
      } catch (error) {
        safeWarn(
          "runHomeQuickAction falló.",
          error
        );

        return false;
      }
    }
  );
}

async function handleNavigate({
  event,
  element,
  navigateFromHomeAction,
}) {
  if (isModifiedClick(event)) {
    return false;
  }

  const route =
    normalizeInternalRoute(
      getWidgetRoute(element)
    );

  if (!route) {
    safeWarn("navigate-home sin route válido.");
    return false;
  }

  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (!isFn(navigateFromHomeAction)) {
    safeWarn("navigateFromHomeAction no disponible.");
    return false;
  }

  return withBusy(
    element,
    async () => {
      try {
        await navigateFromHomeAction({
          route,
        });

        return true;
      } catch (error) {
        safeWarn(
          "navigateFromHomeAction falló.",
          error
        );

        return false;
      }
    }
  );
}

/* =========================================================
   DIRECT BUTTONS
========================================================= */

function bindDirectButton({
  scopeRef,
  id,
  handler,
}) {
  const element =
    getById(id);

  if (!element || !isFn(handler)) {
    return false;
  }

  bindOn(
    scopeRef,
    element,
    "click",
    async (event) => {
      if (
        shouldIgnoreEventTarget(element)
      ) {
        event.preventDefault();
        return;
      }

      await handler(event, element);
    }
  );

  return true;
}

/* =========================================================
   DELEGATED CLICK
========================================================= */

function bindDelegatedClick({
  scopeRef,
  root,
  loadHomeDashboard,
  openHomeWidgetAction,
  copyHomeWidgetIdAction,
  exportHomeCsvAction,
  navigateFromHomeAction,
  runHomeQuickAction,
  reload,
}) {
  if (!root) {
    return false;
  }

  bindOn(
    scopeRef,
    root,
    "click",
    async (event) => {
      if (event.defaultPrevented) {
        return;
      }

      const anyAction =
        getAnyActionElement(
          event,
          root
        );

      if (
        anyAction &&
        shouldIgnoreEventTarget(anyAction)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const refreshBtn =
        getActionElement(
          event,
          "refresh-home",
          root
        ) ||
        getActionElement(
          event,
          "retry-home",
          root
        ) ||
        getActionElement(
          event,
          "reload-home",
          root
        );

      if (refreshBtn) {
        await handleRefresh({
          event,
          element: refreshBtn,
          reload,
          loadHomeDashboard,
        });

        return;
      }

      const exportBtn =
        getActionElement(
          event,
          "export-home-csv",
          root
        ) ||
        getActionElement(
          event,
          "export-home",
          root
        );

      if (exportBtn) {
        await handleExport({
          event,
          element: exportBtn,
          exportHomeCsvAction,
        });

        return;
      }

      const openWidgetBtn =
        getActionElement(
          event,
          "open-home-widget",
          root
        );

      if (openWidgetBtn) {
        await handleOpenWidget({
          event,
          element: openWidgetBtn,
          openHomeWidgetAction,
        });

        return;
      }

      const copyWidgetBtn =
        getActionElement(
          event,
          "copy-home-widget-id",
          root
        );

      if (copyWidgetBtn) {
        await handleCopyWidgetId({
          event,
          element: copyWidgetBtn,
          copyHomeWidgetIdAction,
        });

        return;
      }

      const quickActionBtn =
        getActionElement(
          event,
          "run-home-quick-action",
          root
        );

      if (quickActionBtn) {
        await handleQuickAction({
          event,
          element: quickActionBtn,
          runHomeQuickAction,
        });

        return;
      }

      const navigateBtn =
        getActionElement(
          event,
          "navigate-home",
          root
        );

      if (navigateBtn) {
        await handleNavigate({
          event,
          element: navigateBtn,
          navigateFromHomeAction,
        });

        return;
      }

      /*
        Fallback premium:
        si un botón tiene data-route y data-home-action="navigate",
        también navega.
      */
      if (
        anyAction &&
        getActionName(anyAction) === "navigate"
      ) {
        await handleNavigate({
          event,
          element: anyAction,
          navigateFromHomeAction,
        });
      }
    }
  );

  return true;
}

/* =========================================================
   KEYBOARD A11Y
========================================================= */

function bindKeyboardActivation({
  scopeRef,
  root,
}) {
  if (!root) {
    return false;
  }

  bindOn(
    scopeRef,
    root,
    "keydown",
    (event) => {
      if (
        event.key !== "Enter" &&
        event.key !== " "
      ) {
        return;
      }

      const target =
        event.target;

      if (!isElement(target)) {
        return;
      }

      const actionElement =
        target.closest?.(
          [
            "[role='button'][data-action]",
            "[role='button'][data-home-action]",
            "[tabindex][data-action]",
            "[tabindex][data-home-action]",
          ].join(",")
        );

      if (
        !actionElement ||
        shouldIgnoreEventTarget(actionElement)
      ) {
        return;
      }

      event.preventDefault();

      try {
        actionElement.click?.();
      } catch {}
    }
  );

  return true;
}

/* =========================================================
   MAIN
========================================================= */

export function bindHomeEvents({
  loadHomeDashboard,
  openHomeWidgetAction,
  copyHomeWidgetIdAction,
  exportHomeCsvAction,
  navigateFromHomeAction,
  runHomeQuickAction,
  reload,
  scope = DEFAULT_SCOPE,
} = {}) {
  if (!isBrowser()) {
    return () => {};
  }

  const scopeName =
    resolveScopeName(scope);

  const scopeRef =
    getScope(scopeName);

  const root =
    getContainer();

  bindDirectButton({
    scopeRef,
    id: "home-refresh-btn",
    handler: (event, element) =>
      handleRefresh({
        event,
        element,
        reload,
        loadHomeDashboard,
      }),
  });

  bindDirectButton({
    scopeRef,
    id: "home-retry-btn",
    handler: (event, element) =>
      handleRefresh({
        event,
        element,
        reload,
        loadHomeDashboard,
      }),
  });

  bindDirectButton({
    scopeRef,
    id: "home-export-btn",
    handler: (event, element) =>
      handleExport({
        event,
        element,
        exportHomeCsvAction,
      }),
  });

  bindDelegatedClick({
    scopeRef,
    root,
    loadHomeDashboard,
    openHomeWidgetAction,
    copyHomeWidgetIdAction,
    exportHomeCsvAction,
    navigateFromHomeAction,
    runHomeQuickAction,
    reload,
  });

  bindKeyboardActivation({
    scopeRef,
    root,
  });

  safeEmit("home:bindings:bound", {
    scope: scopeName,
    hasRoot: Boolean(root),
    hasRefreshBtn: Boolean(getById("home-refresh-btn")),
    hasRetryBtn: Boolean(getById("home-retry-btn")),
    hasExportBtn: Boolean(getById("home-export-btn")),
  });

  return () => {
    cleanupScope(scopeName);

    safeEmit("home:bindings:unbound", {
      scope: scopeName,
    });
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  bindHomeEvents,
};
