/* =========================================================
   Onion SPA - Login View Legacy Bridge
   Archivo: src/views/loginView.js

   AUTH VIEW LEGACY BRIDGE · FINAL PRO SYSTEM · 15/10

   RESPONSABILIDADES:
   - mantener compatibilidad con imports legacy: src/views/loginView.js
   - delegar el render real en src/views/login/index.js
   - evitar dos orquestadores de login en paralelo
   - evitar doble Auth.login
   - evitar doble syncSession
   - evitar doble navegación post-login
   - evitar doble toast
   - evitar lógica legacy de loader/shell con estilos inline
   - preparar el shell mínimo de auth-screen por compatibilidad
   - exponer API estable: render/init/destroy/mount/unmount/dispose
   - emitir diagnóstico seguro

   REGLAS:
   - Este archivo NO ejecuta Auth.login.
   - Este archivo NO llama syncSession().
   - Este archivo NO decide redirect post-login.
   - Este archivo NO toca storage auth.
   - Este archivo NO usa CSS inline.
   - Este archivo NO renderiza toast inline.
   - El login real vive en src/views/login/index.js.
========================================================= */

import { AppCore } from "../core/index.js";
import renderLoginView from "./login/index.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const LOGIN_VIEW_BRIDGE_VERSION =
  "15.0.0-legacy-bridge";

const SOURCE =
  "LoginViewLegacyBridge";

const SCOPE =
  "view:login:legacy-bridge";

const DEFAULT_CONTAINER_ID =
  "view-container";

const LOGIN_ROUTE =
  "/login";

const AUTH_SCREEN_CLASSES =
  Object.freeze([
    "auth-screen",
    "login-no-scroll",
    "route-auth",
    "route-shell-hidden",
  ]);

const LOADING_CLASSES =
  Object.freeze([
    "loading",
    "app-loading",
    "is-loading",
  ]);

/* =========================================================
   RUNTIME
========================================================= */

let activeController =
  null;

let activeContainer =
  null;

let renderEpoch =
  0;

let lastRenderAt =
  "";

let lastDestroyAt =
  "";

let lastError =
  null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isPlainObject(value)
    ? value
    : {};
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeIsoNow() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function isDomNode(value) {
  if (!value) {
    return false;
  }

  try {
    return (
      value === document ||
      value === window ||
      value.nodeType === 1 ||
      value.nodeType === 9 ||
      value.nodeType === 11
    );
  } catch {
    return false;
  }
}

function isConnected(node) {
  if (!node) {
    return false;
  }

  try {
    if (
      node === document ||
      node === window
    ) {
      return true;
    }

    return Boolean(node.isConnected);
  } catch {}

  try {
    return document.contains(node);
  } catch {}

  return false;
}

function sanitizeError(error = null) {
  if (!error) {
    return null;
  }

  return {
    name:
      safeText(
        error?.name,
        "Error"
      ),

    message:
      safeText(
        error?.message || error,
        "Error"
      ),

    status:
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      0,

    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      null,

    at:
      safeIsoNow(),
  };
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(
      `[${SOURCE}]`,
      ...args
    );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      `[${SOURCE}]`,
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        `[${SOURCE}]`,
        ...args
      );
    }
  } catch {}
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(
      `[${SOURCE}]`,
      ...args
    );
  } catch {}

  try {
    console.error(
      `[${SOURCE}]`,
      ...args
    );
  } catch {}
}

function safeEmit(eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload = {
    source:
      SOURCE,

    version:
      LOGIN_VIEW_BRIDGE_VERSION,

    at:
      safeIsoNow(),

    ...safeObject(payload),
  };

  let emitted =
    false;

  try {
    AppCore?.events?.emit?.(
      name,
      cleanPayload
    );

    emitted =
      true;
  } catch {}

  try {
    if (
      isBrowser() &&
      !emitted &&
      typeof CustomEvent !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail:
            cleanPayload,
        })
      );

      emitted =
        true;
    }
  } catch {}

  return emitted;
}

/* =========================================================
   PATH / ROUTE HELPERS
========================================================= */

function normalizePath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  try {
    if (isFunction(AppCore?.utils?.normalizePath)) {
      const normalized =
        AppCore.utils.normalizePath(raw);

      if (normalized) {
        return normalized;
      }
    }
  } catch {}

  if (raw === "/") {
    return "/";
  }

  return (
    raw
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") ||
    "/"
  );
}

function stripSearchAndHash(path = "/") {
  return (
    normalizePath(path)
      .split("?")[0]
      .split("#")[0] ||
    "/"
  );
}

function getCurrentPath() {
  if (!isBrowser()) {
    return "/";
  }

  try {
    return normalizePath(
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return "/";
  }
}

function isLoginRoute(path = getCurrentPath()) {
  const clean =
    stripSearchAndHash(path);

  return (
    clean === LOGIN_ROUTE ||
    clean.startsWith(`${LOGIN_ROUTE}/`)
  );
}

/* =========================================================
   DOM / SHELL HELPERS
========================================================= */

function getFallbackContainer() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById(DEFAULT_CONTAINER_ID) ||
      document.querySelector("#view-container") ||
      null
    );
  } catch {
    return null;
  }
}

function resolveContainer(candidate = null) {
  if (
    candidate &&
    isDomNode(candidate)
  ) {
    return candidate;
  }

  return getFallbackContainer();
}

function setAuthScreenMode(active = true) {
  if (
    !isBrowser() ||
    !document?.body
  ) {
    return false;
  }

  const enabled =
    Boolean(active);

  try {
    for (const className of AUTH_SCREEN_CLASSES) {
      document.body.classList.toggle(
        className,
        enabled
      );
    }

    return true;
  } catch {
    return false;
  }
}

function releaseAuthScreenModeIfNeeded() {
  if (!isBrowser()) {
    return false;
  }

  if (isLoginRoute()) {
    return false;
  }

  return setAuthScreenMode(false);
}

function stopGlobalLoadingFallback() {
  /*
    Regla:
    - no estilos inline.
    - loader.js/AppCore siguen siendo los dueños reales.
    - aquí sólo se pide estado ready como fallback de compatibilidad.
  */
  try {
    AppCore?.setLoading?.(false);
  } catch {}

  try {
    const loader =
      AppCore?.modules?.get?.("loader") ||
      AppCore?.modules?.get?.("Loader") ||
      AppCore?.loader ||
      null;

    if (isFunction(loader?.hide)) {
      loader.hide({
        source:
          SOURCE,
      });
    } else if (isFunction(loader?.finalize)) {
      loader.finalize({
        source:
          SOURCE,
      });
    }
  } catch {}

  try {
    if (isBrowser()) {
      for (const className of LOADING_CLASSES) {
        document.body?.classList?.remove?.(
          className
        );

        document.documentElement?.classList?.remove?.(
          className
        );
      }
    }
  } catch {}

  return true;
}

function prepareLoginShell() {
  setAuthScreenMode(true);

  stopGlobalLoadingFallback();

  try {
    AppCore?.clearDynamicContainers?.({
      includeView:
        false,
      includeTopbar:
        true,
      includeTablehead:
        true,
    });
  } catch {}

  try {
    AppCore?.setDocumentTitle?.(
      AppCore?.config?.appName ||
        "Onion Support"
    );
  } catch {}

  return true;
}

/* =========================================================
   CONTROLLER HELPERS
========================================================= */

function hasController(value = null) {
  return Boolean(
    value &&
    (
      isFunction(value.destroy) ||
      isFunction(value.unmount) ||
      isFunction(value.dispose) ||
      isFunction(value.teardown)
    )
  );
}

function destroyController(controller = null) {
  if (!controller) {
    return false;
  }

  const methods = [
    "destroy",
    "unmount",
    "dispose",
    "teardown",
  ];

  for (const method of methods) {
    try {
      if (isFunction(controller?.[method])) {
        controller[method]();
        return true;
      }
    } catch (error) {
      lastError =
        sanitizeError(error);

      safeWarn(
        `Error ejecutando controller.${method}().`,
        lastError
      );

      return false;
    }
  }

  return false;
}

function clearScopedCleanup() {
  try {
    AppCore?.cleanup?.run?.(SCOPE);
  } catch {}

  try {
    AppCore?.cleanup?.clear?.(SCOPE);
  } catch {}

  return true;
}

function destroyActiveController({
  preserveAuthScreen = false,
  emit = true,
} = {}) {
  const hadController =
    Boolean(activeController);

  try {
    destroyController(
      activeController
    );
  } finally {
    activeController =
      null;

    activeContainer =
      null;

    clearScopedCleanup();

    if (!preserveAuthScreen) {
      releaseAuthScreenModeIfNeeded();
    }

    lastDestroyAt =
      safeIsoNow();

    if (emit && hadController) {
      safeEmit(
        "login:view:destroyed",
        {
          epoch:
            renderEpoch,

          preserveAuthScreen:
            Boolean(preserveAuthScreen),
        }
      );
    }
  }

  return hadController;
}

/* =========================================================
   ARG NORMALIZATION
========================================================= */

function normalizeRenderArgs(input = null, maybeDeps = {}) {
  let container =
    null;

  let deps =
    {};

  if (isDomNode(input)) {
    container =
      input;

    deps =
      safeObject(maybeDeps);
  } else if (isPlainObject(input)) {
    container =
      input.container ||
      input.target ||
      input.root ||
      input.el ||
      null;

    deps = {
      ...input,
    };

    delete deps.container;
    delete deps.target;
    delete deps.root;
    delete deps.el;
  } else {
    deps =
      safeObject(maybeDeps);
  }

  return {
    container:
      resolveContainer(container),

    deps,
  };
}

/* =========================================================
   PUBLIC RENDER API
========================================================= */

function render(input = null, maybeDeps = {}) {
  if (!isBrowser()) {
    safeWarn(
      "Render ignorado fuera de browser."
    );

    return null;
  }

  const {
    container,
    deps,
  } =
    normalizeRenderArgs(
      input,
      maybeDeps
    );

  if (!container) {
    const error =
      new Error(
        "LoginView: no se encontró #view-container."
      );

    lastError =
      sanitizeError(error);

    safeError(
      lastError.message
    );

    safeEmit(
      "login:view:error",
      {
        error:
          lastError,
      }
    );

    return null;
  }

  if (!isFunction(renderLoginView)) {
    const error =
      new Error(
        "LoginView: src/views/login/index.js no exporta un renderer válido."
      );

    lastError =
      sanitizeError(error);

    safeError(
      lastError.message
    );

    safeEmit(
      "login:view:error",
      {
        error:
          lastError,
      }
    );

    return null;
  }

  renderEpoch += 1;

  const epoch =
    renderEpoch;

  destroyActiveController({
    preserveAuthScreen:
      true,
    emit:
      false,
  });

  prepareLoginShell();

  safeEmit(
    "login:view:before-render",
    {
      epoch,
      path:
        normalizePath(
          getCurrentPath()
        ),
    }
  );

  try {
    const controller =
      renderLoginView(
        container,
        {
          source:
            SOURCE,

          legacyBridge:
            true,

          ...deps,
        }
      );

    activeController =
      hasController(controller)
        ? controller
        : {
            destroy() {},
          };

    activeContainer =
      container;

    lastRenderAt =
      safeIsoNow();

    lastError =
      null;

    stopGlobalLoadingFallback();

    safeEmit(
      "login:view:rendered",
      {
        epoch,
        containerId:
          safeText(
            container.id,
            ""
          ),

        connected:
          isConnected(container),
      }
    );

    safeLog(
      "Login bridge render OK.",
      {
        epoch,
      }
    );

    return activeController;
  } catch (error) {
    lastError =
      sanitizeError(error);

    activeController =
      null;

    activeContainer =
      null;

    releaseAuthScreenModeIfNeeded();

    safeEmit(
      "login:view:error",
      {
        epoch,
        error:
          lastError,
      }
    );

    safeError(
      "Error renderizando login delegado.",
      lastError
    );

    throw error;
  }
}

function init(input = null, maybeDeps = {}) {
  return render(
    input,
    maybeDeps
  );
}

function mount(input = null, maybeDeps = {}) {
  return render(
    input,
    maybeDeps
  );
}

function destroy(options = {}) {
  return destroyActiveController({
    preserveAuthScreen:
      options?.preserveAuthScreen === true,
    emit:
      options?.emit !== false,
  });
}

function unmount(options = {}) {
  return destroy(options);
}

function dispose(options = {}) {
  return destroy(options);
}

function teardown(options = {}) {
  return destroy(options);
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getLoginViewSnapshot() {
  return {
    version:
      LOGIN_VIEW_BRIDGE_VERSION,

    source:
      SOURCE,

    scope:
      SCOPE,

    active:
      Boolean(activeController),

    hasActiveController:
      hasController(activeController),

    activeContainer: {
      exists:
        Boolean(activeContainer),

      id:
        safeText(
          activeContainer?.id,
          ""
        ),

      connected:
        isConnected(activeContainer),
    },

    renderEpoch,

    currentPath:
      isBrowser()
        ? normalizePath(
            getCurrentPath()
          )
        : "",

    isLoginRoute:
      isBrowser()
        ? isLoginRoute()
        : false,

    lastRenderAt,
    lastDestroyAt,

    lastError,

    delegatedRenderer:
      Boolean(renderLoginView),

    at:
      safeIsoNow(),
  };
}

/* =========================================================
   LEGACY COMPAT OBJECT
========================================================= */

export const LoginView =
  Object.freeze({
    version:
      LOGIN_VIEW_BRIDGE_VERSION,

    render,
    init,
    mount,

    destroy,
    unmount,
    dispose,
    teardown,

    getSnapshot:
      getLoginViewSnapshot,

    getDebugSnapshot:
      getLoginViewSnapshot,
  });

/* =========================================================
   OPTIONAL GLOBAL DEBUG BRIDGE
========================================================= */

try {
  if (isBrowser()) {
    window.LoginView =
      window.LoginView || LoginView;
  }
} catch {}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default LoginView;
