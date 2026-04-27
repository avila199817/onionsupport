/* =========================================================
   Onion SPA - Entry Point
   Archivo: src/main.js

   RESPONSABILIDADES:
   - punto único de arranque de la SPA
   - mantener estado visual de boot desde el primer tick JS
   - capturar URL inicial antes de que el router normalice
   - preservar rutas públicas técnicas con token
   - esperar DOM ready de forma segura
   - boot idempotente
   - capturar errores fatales de arranque
   - integrar App + AppCore
   - no dejar loader pegado ante fallo fatal o timeout
   - exponer diagnóstico mínimo en window.OnionApp.main

   HARDENING PRO:
   - una sola vía de arranque
   - anti doble boot
   - CSP clean: sin innerHTML, sin estilos inline
   - fallback robusto si AppCore.ready falla/no existe
   - logs limpios
   - error fatal visible
   - timeout de boot configurable
   - clases html/body coherentes:
     app-booting / app-loading / app-ready / app-fatal

   ALINEADO CON:
   - index.html con #app-loader estático
   - src/app/index.js
   - src/app/loader.js
   - src/css/core/loader.css
   - router/helpers.js + router/history.js + router/render.js
========================================================= */

import { App } from "./app/index.js";
import { AppCore } from "./core/index.js";

/* =========================================================
   STATE
========================================================= */

let bootStarted = false;
let bootSettled = false;
let bootFailed = false;
let bootPromise = null;
let readyBound = false;
let fatalRendered = false;
let globalSafetyNetBound = false;

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_BOOT_TIMEOUT_MS = 45000;

const ACTIVATION_PATH = "/activate-account";
const RESET_CONFIRM_PATH = "/reset-password/confirm";

const ACTIVATION_TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "activationToken",
  "activateToken",
  "code",
  "t",
]);

const RESET_TOKEN_PARAM_NAMES = Object.freeze([
  "token",
  "resetToken",
  "passwordResetToken",
  "confirmToken",
  "code",
  "t",
]);

const PROTECTED_PUBLIC_ROUTES = Object.freeze([
  Object.freeze({
    path: ACTIVATION_PATH,
    windowKeys: Object.freeze([
      "__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__",
    ]),
    tokenNames: ACTIVATION_TOKEN_PARAM_NAMES,
    scrubbedFlags: Object.freeze([
      "scrubbedActivationToken",
    ]),
  }),

  Object.freeze({
    path: RESET_CONFIRM_PATH,
    windowKeys: Object.freeze([
      "__ONION_RESET_CONFIRM_INITIAL_URL__",
      "__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__",
    ]),
    tokenNames: RESET_TOKEN_PARAM_NAMES,
    scrubbedFlags: Object.freeze([
      "scrubbedResetToken",
      "scrubbedResetPasswordToken",
    ]),
  }),
]);

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
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

function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(
      "[Main]",
      ...args
    );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[Main]",
      ...args
    );
  } catch {}

  try {
    console.warn("[Main]", ...args);
  } catch {}
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(
      "[Main]",
      ...args
    );
  } catch {}

  try {
    console.error("[Main]", ...args);
  } catch {}
}

function safeEmit(name = "", payload = {}) {
  const eventName =
    safeText(name, "");

  if (!eventName) {
    return false;
  }

  let emitted = false;

  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );

    emitted = true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

function nextFrame() {
  return new Promise((resolve) => {
    try {
      if (
        isBrowser() &&
        isFunction(window.requestAnimationFrame)
      ) {
        window.requestAnimationFrame(() => {
          resolve();
        });

        return;
      }
    } catch {}

    try {
      setTimeout(resolve, 0);
    } catch {
      resolve();
    }
  });
}

async function nextPaint() {
  await nextFrame();
  await nextFrame();
}

/* =========================================================
   INITIAL URL / TOKEN PRESERVATION
========================================================= */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

function normalizePathnameOnly(pathname = "/") {
  let value =
    String(pathname || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  if (!value) {
    value = "/";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  if (
    value.length > 1 &&
    value.endsWith("/")
  ) {
    value =
      value.replace(/\/+$/g, "") || "/";
  }

  return value;
}

function isHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    String(value || "").trim();

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/");
  }

  return raw.replace(/^#\/?/, "/");
}

function pathFromUrlLike(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "";
  }

  if (isHashRouterPath(raw)) {
    return normalizeHashRouterPath(raw);
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      return normalizeHashRouterPath(
        parsed.hash
      );
    }

    return `${normalizePathnameOnly(
      parsed.pathname || "/"
    )}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    const hashIndex =
      raw.indexOf("#");

    if (hashIndex >= 0) {
      const hash =
        raw.slice(hashIndex);

      if (isHashRouterPath(hash)) {
        return normalizeHashRouterPath(hash);
      }
    }

    return raw.startsWith("/")
      ? raw
      : `/${raw}`;
  }
}

function stripSearchAndHash(path = "/") {
  const raw =
    safeText(path, "/");

  return normalizePathnameOnly(
    raw.split("?")[0].split("#")[0] || "/"
  );
}

function isPathOrChild(path = "/", basePath = "/") {
  const clean =
    stripSearchAndHash(
      pathFromUrlLike(path) || path || "/"
    );

  return (
    clean === basePath ||
    clean.startsWith(`${basePath}/`)
  );
}

function getPathToken(path = "", basePath = "") {
  const clean =
    stripSearchAndHash(
      pathFromUrlLike(path) || path || "/"
    );

  if (
    !basePath ||
    !clean.startsWith(`${basePath}/`)
  ) {
    return "";
  }

  const token =
    clean
      .slice(`${basePath}/`.length)
      .split("/")[0];

  try {
    return safeText(
      decodeURIComponent(token || ""),
      ""
    );
  } catch {
    return safeText(token, "");
  }
}

function hasTokenInSearch(search = "", tokenNames = []) {
  try {
    const params =
      new URLSearchParams(search || "");

    return tokenNames.some((name) => {
      return Boolean(
        safeText(
          params.get(name),
          ""
        )
      );
    });
  } catch {
    return false;
  }
}

function hasProtectedRouteToken(value = "", routeConfig = null) {
  if (!routeConfig) {
    return false;
  }

  const raw =
    safeText(value, "");

  if (!raw) {
    return false;
  }

  const path =
    pathFromUrlLike(raw) || raw;

  if (
    isPathOrChild(path, routeConfig.path) &&
    getPathToken(path, routeConfig.path)
  ) {
    return true;
  }

  try {
    const parsed =
      new URL(raw, getBaseOrigin());

    if (
      hasTokenInSearch(
        parsed.search,
        routeConfig.tokenNames
      )
    ) {
      return true;
    }

    if (
      parsed.hash &&
      parsed.hash.includes("?")
    ) {
      const query =
        parsed.hash
          .split("?")
          .slice(1)
          .join("?");

      return hasTokenInSearch(
        query ? `?${query}` : "",
        routeConfig.tokenNames
      );
    }
  } catch {
    if (path.includes("?")) {
      const query =
        path
          .split("?")
          .slice(1)
          .join("?")
          .split("#")[0];

      if (
        hasTokenInSearch(
          query ? `?${query}` : "",
          routeConfig.tokenNames
        )
      ) {
        return true;
      }
    }

    if (
      path.includes("#") &&
      path.includes("?")
    ) {
      const query =
        path
          .split("?")
          .slice(1)
          .join("?");

      if (
        hasTokenInSearch(
          query ? `?${query}` : "",
          routeConfig.tokenNames
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function isProtectedRouteScrubbed(routeConfig = null) {
  if (
    !isBrowser() ||
    !routeConfig
  ) {
    return false;
  }

  try {
    const state =
      window.history?.state || {};

    return routeConfig.scrubbedFlags.some(
      (flag) => Boolean(state?.[flag])
    );
  } catch {
    return false;
  }
}

function setWindowValueOnce(key = "", value = "") {
  if (
    !isBrowser() ||
    !key ||
    !value
  ) {
    return false;
  }

  try {
    if (!window[key]) {
      window[key] = value;
      return true;
    }
  } catch {}

  return false;
}

function captureInitialUrl(reason = "main") {
  if (!isBrowser()) {
    return false;
  }

  let captured = false;

  try {
    const href =
      window.location.href;

    captured =
      setWindowValueOnce(
        "__ONION_INITIAL_URL__",
        href
      ) || captured;

    const publicPath =
      pathFromUrlLike(href);

    for (const routeConfig of PROTECTED_PUBLIC_ROUTES) {
      if (
        isProtectedRouteScrubbed(routeConfig)
      ) {
        continue;
      }

      if (
        !isPathOrChild(publicPath, routeConfig.path) ||
        !hasProtectedRouteToken(href, routeConfig)
      ) {
        continue;
      }

      routeConfig.windowKeys.forEach((key) => {
        captured =
          setWindowValueOnce(
            key,
            href
          ) || captured;
      });
    }

    safeEmit(
      "main:initial-url:capture",
      {
        reason,
        href,
        publicPath,
        captured,
      }
    );

    return captured;
  } catch (error) {
    safeWarn(
      "No se pudo capturar URL inicial.",
      error
    );

    return false;
  }
}

/* =========================================================
   DOCUMENT STATE
========================================================= */

function getHtml() {
  if (!isBrowser()) {
    return null;
  }

  return document.documentElement || null;
}

function getBody() {
  if (!isBrowser()) {
    return null;
  }

  return document.body || null;
}

function addClass(el, className) {
  try {
    el?.classList?.add?.(className);
  } catch {}
}

function removeClass(el, className) {
  try {
    el?.classList?.remove?.(className);
  } catch {}
}

function setDataset(el, key, value) {
  if (
    !el ||
    !key
  ) {
    return;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete el.dataset[key];
      return;
    }

    el.dataset[key] = String(value);
  } catch {}
}

function markDocumentBooting(reason = "main") {
  const html =
    getHtml();

  const body =
    getBody();

  addClass(html, "app-booting");
  addClass(html, "app-loading");
  removeClass(html, "app-ready");
  removeClass(html, "app-fatal");

  addClass(body, "app-booting");
  addClass(body, "app-loading");
  addClass(body, "loading");
  removeClass(body, "app-ready");
  removeClass(body, "app-fatal");

  setDataset(html, "appLoading", "true");
  setDataset(body, "appLoading", "true");
  setDataset(body, "bootReason", reason);

  safeEmit(
    "main:booting",
    {
      reason,
    }
  );
}

function markDocumentReady(reason = "boot-complete") {
  const html =
    getHtml();

  const body =
    getBody();

  removeClass(html, "app-booting");
  removeClass(html, "app-loading");
  removeClass(html, "app-fatal");
  addClass(html, "app-ready");

  removeClass(body, "app-booting");
  removeClass(body, "app-loading");
  removeClass(body, "loading");
  removeClass(body, "app-fatal");
  addClass(body, "app-ready");

  setDataset(html, "appLoading", "false");
  setDataset(body, "appLoading", "false");
  setDataset(body, "bootReason", reason);

  safeEmit(
    "main:ready",
    {
      reason,
    }
  );
}

function markDocumentFatal(reason = "boot-error") {
  const html =
    getHtml();

  const body =
    getBody();

  removeClass(html, "app-booting");
  removeClass(html, "app-loading");
  removeClass(html, "app-ready");
  addClass(html, "app-fatal");

  removeClass(body, "app-booting");
  removeClass(body, "app-loading");
  removeClass(body, "loading");
  removeClass(body, "app-ready");
  addClass(body, "app-fatal");

  setDataset(html, "appLoading", "false");
  setDataset(body, "appLoading", "false");
  setDataset(body, "bootReason", reason);

  safeEmit(
    "main:fatal",
    {
      reason,
    }
  );
}

/* =========================================================
   LOADER FALLBACK OPS
========================================================= */

function getLoaderElement() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return (
      document.getElementById("app-loader") ||
      document.querySelector("[data-app-loader='true']") ||
      document.querySelector(".app-loader") ||
      null
    );
  } catch {
    return null;
  }
}

function ensureStaticLoaderVisible(reason = "main") {
  const loader =
    getLoaderElement();

  if (!loader) {
    return false;
  }

  try {
    loader.hidden = false;
    loader.removeAttribute("hidden");

    loader.setAttribute(
      "aria-hidden",
      "false"
    );

    loader.setAttribute(
      "aria-busy",
      "true"
    );

    loader.dataset.loaderVisible = "true";
    loader.dataset.loaderReason = reason;

    loader.classList.remove(
      "is-hidden",
      "has-hidden",
      "is-leaving"
    );

    loader.classList.add(
      "is-visible"
    );

    safeEmit(
      "main:loader:visible",
      {
        reason,
      }
    );

    return true;
  } catch {
    return false;
  }
}

function forceHideStaticLoader(reason = "main") {
  const loader =
    getLoaderElement();

  if (!loader) {
    return false;
  }

  try {
    loader.hidden = true;

    loader.setAttribute(
      "aria-hidden",
      "true"
    );

    loader.setAttribute(
      "aria-busy",
      "false"
    );

    loader.dataset.loaderVisible = "false";
    loader.dataset.loaderReason = reason;

    loader.classList.remove(
      "is-visible",
      "is-leaving"
    );

    loader.classList.add(
      "is-hidden",
      "has-hidden"
    );

    safeEmit(
      "main:loader:hidden",
      {
        reason,
      }
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FATAL ERROR VIEW
========================================================= */

function clearNode(node) {
  if (!node) {
    return;
  }

  try {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  } catch {}
}

function createElement(tag, {
  className = "",
  text = "",
  attrs = {},
} = {}) {
  const el =
    document.createElement(tag);

  if (className) {
    el.className = className;
  }

  if (text) {
    el.textContent = text;
  }

  Object.entries(
    safeObject(attrs)
  ).forEach(([key, value]) => {
    try {
      el.setAttribute(
        key,
        String(value)
      );
    } catch {}
  });

  return el;
}

function createReloadButton() {
  const button =
    createElement("button", {
      className: "fatal-boot-button",
      text: "Recargar",
      attrs: {
        type: "button",
      },
    });

  try {
    button.addEventListener(
      "click",
      () => {
        try {
          window.location.reload();
        } catch {}
      }
    );
  } catch {}

  return button;
}

function createDetailsButton(error) {
  const button =
    createElement("button", {
      className: "fatal-boot-button fatal-boot-button-secondary",
      text: "Detalles",
      attrs: {
        type: "button",
      },
    });

  try {
    button.addEventListener(
      "click",
      () => {
        try {
          console.group("[Main] Boot fatal details");
          console.error(error);
          console.groupEnd();
        } catch {}
      }
    );
  } catch {}

  return button;
}

function exposeFatalRoot(root) {
  if (!root) {
    return false;
  }

  try {
    root.hidden = false;
    root.removeAttribute("hidden");
    root.setAttribute("aria-hidden", "false");
    root.setAttribute("aria-busy", "false");
  } catch {}

  try {
    let node =
      root.parentElement;

    while (node) {
      node.hidden = false;
      node.setAttribute("aria-hidden", "false");
      node = node.parentElement;
    }
  } catch {}

  return true;
}

function getFatalRoot() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return (
      document.getElementById("view-container") ||
      document.getElementById("app-content") ||
      document.getElementById("main-content") ||
      document.getElementById("app-shell") ||
      document.body ||
      null
    );
  } catch {
    return null;
  }
}

function normalizeBootError(error) {
  if (error instanceof Error) {
    return error;
  }

  const message =
    safeText(
      error?.message ||
        error?.reason ||
        error,
      "No se pudo iniciar la aplicación."
    );

  const normalized =
    new Error(message);

  try {
    normalized.raw = error;
  } catch {}

  return normalized;
}

function showFatalBootError(error) {
  if (
    !isBrowser() ||
    fatalRendered
  ) {
    return false;
  }

  fatalRendered = true;

  try {
    const normalizedError =
      normalizeBootError(error);

    markDocumentFatal("boot-error");
    forceHideStaticLoader("boot-error");

    const root =
      getFatalRoot();

    if (!root) {
      return false;
    }

    exposeFatalRoot(root);
    clearNode(root);

    const message =
      safeText(
        normalizedError?.message,
        "No se pudo iniciar la aplicación."
      );

    const section =
      createElement("section", {
        className: "fatal-boot",
        attrs: {
          role: "alert",
          "aria-live": "assertive",
        },
      });

    const card =
      createElement("div", {
        className: "fatal-boot-card",
      });

    const eyebrow =
      createElement("p", {
        className: "fatal-boot-eyebrow",
        text: "Onion Support",
      });

    const title =
      createElement("h1", {
        className: "fatal-boot-title",
        text: "Error de arranque",
      });

    const paragraph =
      createElement("p", {
        className: "fatal-boot-message",
        text: message,
      });

    const hint =
      createElement("p", {
        className: "fatal-boot-hint",
        text: "Recarga la página. Si el problema persiste, revisa la consola del navegador.",
      });

    const actions =
      createElement("div", {
        className: "fatal-boot-actions",
      });

    actions.appendChild(
      createReloadButton()
    );

    actions.appendChild(
      createDetailsButton(
        normalizedError
      )
    );

    card.appendChild(eyebrow);
    card.appendChild(title);
    card.appendChild(paragraph);
    card.appendChild(hint);
    card.appendChild(actions);

    section.appendChild(card);
    root.appendChild(section);

    safeEmit(
      "main:boot:fatal-rendered",
      {
        message,
      }
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   READY HANDLING
========================================================= */

function waitForDomReady() {
  if (!isBrowser()) {
    return Promise.resolve();
  }

  try {
    if (
      document.readyState === "interactive" ||
      document.readyState === "complete"
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const done = () => {
        try {
          document.removeEventListener(
            "DOMContentLoaded",
            done
          );
        } catch {}

        resolve();
      };

      document.addEventListener(
        "DOMContentLoaded",
        done,
        {
          once: true,
        }
      );
    });
  } catch {
    return Promise.resolve();
  }
}

function bindReady(callback) {
  if (readyBound) {
    return;
  }

  readyBound = true;

  const guardedCallback = () => {
    void waitForDomReady()
      .then(() => {
        try {
          callback();
        } catch (error) {
          safeError(
            "Callback de ready falló.",
            error
          );

          showFatalBootError(error);
        }
      });
  };

  try {
    if (
      isFunction(AppCore?.ready)
    ) {
      AppCore.ready(
        guardedCallback
      );

      return;
    }
  } catch (error) {
    safeWarn(
      "AppCore.ready falló. Usando DOMContentLoaded fallback.",
      error
    );
  }

  void waitForDomReady()
    .then(guardedCallback);
}

/* =========================================================
   BOOT TIMEOUT
========================================================= */

function getBootTimeoutMs() {
  const configured =
    safeNumber(
      AppCore?.config?.bootTimeoutMs ??
        AppCore?.config?.appBootTimeoutMs ??
        AppCore?.config?.startupTimeoutMs,
      DEFAULT_BOOT_TIMEOUT_MS
    );

  return Math.max(
    0,
    configured
  );
}

function createBootTimeoutPromise(timeoutMs = 0) {
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    return {
      promise: new Promise(() => {}),
      clear() {},
    };
  }

  let timeoutId = null;

  const promise =
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error =
          new Error(
            `El arranque superó el límite de ${timeoutMs}ms.`
          );

        error.code = "BOOT_TIMEOUT";
        error.status = 408;
        error.timeout = true;

        reject(error);
      }, timeoutMs);
    });

  return {
    promise,

    clear() {
      try {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      } catch {}

      timeoutId = null;
    },
  };
}

/* =========================================================
   APP BOOT EXECUTION
========================================================= */

async function executeAppBoot() {
  if (
    !App ||
    !isFunction(App.boot)
  ) {
    const error =
      new Error(
        "App.boot no está disponible."
      );

    error.code = "APP_BOOT_MISSING";

    throw error;
  }

  return App.boot();
}

/* =========================================================
   BOOT
========================================================= */

async function boot(options = {}) {
  if (
    bootStarted &&
    bootPromise
  ) {
    return bootPromise;
  }

  bootStarted = true;
  bootSettled = false;
  bootFailed = false;
  fatalRendered = false;

  const startedAt =
    Date.now();

  captureInitialUrl("boot-start");

  markDocumentBooting("main-boot");
  ensureStaticLoaderVisible("main-boot");

  const timeoutMs =
    options.timeoutMs === undefined
      ? getBootTimeoutMs()
      : safeNumber(
          options.timeoutMs,
          getBootTimeoutMs()
        );

  const bootTimeout =
    createBootTimeoutPromise(
      timeoutMs
    );

  bootPromise =
    Promise.resolve()
      .then(async () => {
        safeLog(
          "Boot iniciando...",
          {
            timeoutMs,
          }
        );

        safeEmit(
          "main:boot:start",
          {
            readyState:
              isBrowser()
                ? document.readyState
                : "server",
            timeoutMs,
          }
        );

        /*
          Primer paint con estado app-booting/app-loading aplicado.
        */
        await nextFrame();

        const result =
          await Promise.race([
            executeAppBoot(),
            bootTimeout.promise,
          ]);

        bootTimeout.clear();

        bootSettled = true;
        bootFailed = false;

        /*
          Fallback final:
          App.boot() debería haber sincronizado loader/shell.
          Main sólo remata clases globales y evita loader pegado.
        */
        await nextPaint();

        markDocumentReady(
          "main-boot-complete"
        );

        forceHideStaticLoader(
          "main-boot-complete"
        );

        safeEmit(
          "main:boot:complete",
          {
            durationMs:
              Date.now() - startedAt,
            appState:
              isFunction(App?.getState)
                ? App.getState()
                : null,
          }
        );

        safeLog(
          "Boot completado.",
          {
            durationMs:
              Date.now() - startedAt,
          }
        );

        return result || App;
      })
      .catch((error) => {
        bootTimeout.clear();

        bootSettled = true;
        bootFailed = true;

        const normalizedError =
          normalizeBootError(error);

        safeError(
          "Fallo crítico en boot:",
          normalizedError
        );

        safeEmit(
          "main:boot:error",
          {
            durationMs:
              Date.now() - startedAt,
            message:
              safeText(
                normalizedError?.message,
                "Boot error"
              ),
            code:
              normalizedError?.code || null,
            timeout:
              Boolean(normalizedError?.timeout),
            error:
              normalizedError,
          }
        );

        showFatalBootError(
          normalizedError
        );

        throw normalizedError;
      });

  return bootPromise;
}

/* =========================================================
   GLOBAL ERROR SAFETY NET
========================================================= */

function bindGlobalBootSafetyNet() {
  if (
    !isBrowser() ||
    globalSafetyNetBound
  ) {
    return;
  }

  globalSafetyNetBound = true;

  try {
    window.addEventListener(
      "error",
      (event) => {
        if (bootSettled) {
          return;
        }

        safeError(
          "Error global durante boot:",
          event?.error ||
            event?.message
        );
      }
    );
  } catch {}

  try {
    window.addEventListener(
      "unhandledrejection",
      (event) => {
        if (bootSettled) {
          return;
        }

        safeError(
          "Promise rechazada durante boot:",
          event?.reason
        );
      }
    );
  } catch {}
}

/* =========================================================
   START
========================================================= */

function start() {
  bindGlobalBootSafetyNet();

  bindReady(() => {
    captureInitialUrl("ready");

    markDocumentBooting("dom-ready");
    ensureStaticLoaderVisible("dom-ready");

    void boot().catch(() => {
      /*
        showFatalBootError ya se ejecuta dentro de boot().
        Evitamos un unhandled rejection adicional en el arranque automático.
      */
    });
  });
}

/* =========================================================
   FIRST TICK
========================================================= */

captureInitialUrl("module-load");
markDocumentBooting("module-load");
ensureStaticLoaderVisible("module-load");
start();

/* =========================================================
   DEBUG EXPORT
========================================================= */

try {
  if (isBrowser()) {
    window.OnionApp =
      window.OnionApp || {};

    window.OnionApp.main = {
      boot,

      start,

      captureInitialUrl,

      markDocumentBooting,
      markDocumentReady,
      markDocumentFatal,

      ensureStaticLoaderVisible,
      forceHideStaticLoader,

      getState() {
        const loader =
          getLoaderElement();

        return {
          bootStarted,
          bootSettled,
          bootFailed,
          hasBootPromise:
            Boolean(bootPromise),
          readyBound,
          fatalRendered,
          globalSafetyNetBound,

          bootTimeoutMs:
            getBootTimeoutMs(),

          documentReadyState:
            document.readyState,

          htmlClassName:
            document.documentElement?.className || "",

          bodyClassName:
            document.body?.className || "",

          loaderExists:
            Boolean(loader),

          loaderHidden:
            Boolean(loader?.hidden),

          loaderVisible:
            loader?.dataset?.loaderVisible || null,

          initialUrl:
            window.__ONION_INITIAL_URL__ || null,

          activationInitialUrl:
            window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__ || null,

          resetConfirmInitialUrl:
            window.__ONION_RESET_CONFIRM_INITIAL_URL__ ||
            window.__ONION_RESET_PASSWORD_CONFIRM_INITIAL_URL__ ||
            null,

          appState:
            isFunction(App?.getState)
              ? App.getState()
              : null,
        };
      },
    };
  }
} catch {}

export default {
  boot,
  start,
};
