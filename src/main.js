/* =========================================================
   Onion SPA - Entry Point
   Archivo: src/main.js

   RESPONSABILIDADES:
   - punto único de arranque de la SPA
   - mantener estado visual de boot desde el primer tick JS
   - esperar DOM ready de forma segura
   - boot idempotente
   - capturar errores fatales de arranque
   - integrar App + AppCore
   - no dejar loader pegado ante fallo fatal

   HARDENING PRO:
   - una sola vía de arranque
   - anti doble boot
   - CSP clean
   - sin innerHTML inseguro para errores
   - fallback robusto si AppCore.ready falla/no existe
   - logs limpios
   - error fatal visible
   - clases html/body coherentes: app-booting/app-loading/app-ready/app-fatal

   ALINEADO CON:
   - index.html con #app-loader estático
   - src/app/index.js
   - src/app/loader.js
   - src/css/core/loader.css
========================================================= */

import { App } from "./app/index.js";
import { AppCore } from "./core/index.js";

/* =========================================================
   STATE
========================================================= */

let bootStarted = false;
let bootSettled = false;
let bootPromise = null;
let readyBound = false;

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
  const eventName = safeText(name, "");
  if (!eventName) return false;

  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );

    return true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );

      return true;
    }
  } catch {}

  return false;
}

function nextFrame() {
  return new Promise((resolve) => {
    try {
      if (
        isBrowser() &&
        typeof window.requestAnimationFrame === "function"
      ) {
        window.requestAnimationFrame(() => resolve());
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

/* =========================================================
   DOCUMENT STATE
========================================================= */

function getHtml() {
  if (!isBrowser()) return null;
  return document.documentElement || null;
}

function getBody() {
  if (!isBrowser()) return null;
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

function toggleClass(el, className, enabled) {
  try {
    el?.classList?.toggle?.(
      className,
      Boolean(enabled)
    );
  } catch {}
}

function setDataset(el, key, value) {
  if (!el || !key) return;

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
  const html = getHtml();
  const body = getBody();

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

  safeEmit("main:booting", {
    reason,
  });
}

function markDocumentReady(reason = "boot-complete") {
  const html = getHtml();
  const body = getBody();

  removeClass(html, "app-booting");
  removeClass(html, "app-loading");
  addClass(html, "app-ready");
  removeClass(html, "app-fatal");

  removeClass(body, "app-booting");
  removeClass(body, "app-loading");
  removeClass(body, "loading");
  addClass(body, "app-ready");
  removeClass(body, "app-fatal");

  setDataset(html, "appLoading", "false");
  setDataset(body, "appLoading", "false");
  setDataset(body, "bootReason", reason);

  safeEmit("main:ready", {
    reason,
  });
}

function markDocumentFatal(reason = "boot-error") {
  const html = getHtml();
  const body = getBody();

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

  safeEmit("main:fatal", {
    reason,
  });
}

/* =========================================================
   LOADER FALLBACK OPS
========================================================= */

function getLoaderElement() {
  if (!isBrowser()) return null;

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

function ensureStaticLoaderVisible() {
  const loader = getLoaderElement();

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

    loader.classList.remove(
      "is-hidden",
      "has-hidden",
      "is-leaving"
    );

    loader.classList.add(
      "is-visible"
    );

    loader.style.display = "";
    loader.style.opacity = "";
    loader.style.visibility = "";
    loader.style.pointerEvents = "";

    return true;
  } catch {
    return false;
  }
}

function forceHideStaticLoader() {
  const loader = getLoaderElement();

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

    loader.classList.remove(
      "is-visible",
      "is-leaving"
    );

    loader.classList.add(
      "is-hidden",
      "has-hidden"
    );

    loader.style.display = "none";
    loader.style.opacity = "0";
    loader.style.visibility = "hidden";
    loader.style.pointerEvents = "none";

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FATAL ERROR VIEW
========================================================= */

function clearNode(node) {
  if (!node) return;

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

  for (const [key, value] of Object.entries(attrs)) {
    try {
      el.setAttribute(key, String(value));
    } catch {}
  }

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

  button.addEventListener(
    "click",
    () => {
      try {
        window.location.reload();
      } catch {}
    }
  );

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

  return button;
}

function getFatalRoot() {
  if (!isBrowser()) return null;

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

function showFatalBootError(error) {
  if (!isBrowser()) {
    return false;
  }

  try {
    markDocumentFatal("boot-error");
    forceHideStaticLoader();

    const root =
      getFatalRoot();

    if (!root) {
      return false;
    }

    const message =
      safeText(
        error?.message,
        "No se pudo iniciar la aplicación."
      );

    clearNode(root);

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
      createDetailsButton(error)
    );

    card.appendChild(eyebrow);
    card.appendChild(title);
    card.appendChild(paragraph);
    card.appendChild(hint);
    card.appendChild(actions);

    section.appendChild(card);
    root.appendChild(section);

    safeEmit("main:boot:fatal-rendered", {
      message,
    });

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

  try {
    if (
      typeof AppCore?.ready === "function"
    ) {
      AppCore.ready(callback);
      return;
    }
  } catch (error) {
    safeWarn(
      "AppCore.ready falló. Usando DOMContentLoaded fallback.",
      error
    );
  }

  void waitForDomReady()
    .then(callback);
}

/* =========================================================
   BOOT
========================================================= */

async function boot() {
  if (bootStarted) {
    return bootPromise;
  }

  bootStarted = true;
  bootSettled = false;

  markDocumentBooting("main-boot");
  ensureStaticLoaderVisible();

  bootPromise =
    Promise.resolve()
      .then(async () => {
        safeLog(
          "Boot iniciando..."
        );

        safeEmit("main:boot:start", {
          readyState:
            isBrowser()
              ? document.readyState
              : "server",
        });

        await nextFrame();

        await App.boot();

        bootSettled = true;

        /*
          App.boot() normalmente ya marca ready/hide loader
          desde src/app/index.js + loader.js.
          Este mark es fallback final para que html/body no queden
          en app-booting/app-loading si algún evento no sincronizó.
        */
        markDocumentReady("main-boot-complete");

        safeEmit("main:boot:complete", {
          appState:
            typeof App?.getState === "function"
              ? App.getState()
              : null,
        });

        safeLog(
          "Boot completado."
        );

        return App;
      })
      .catch((error) => {
        bootSettled = true;

        safeError(
          "Fallo crítico en boot:",
          error
        );

        safeEmit("main:boot:error", {
          message:
            safeText(
              error?.message,
              "Boot error"
            ),
          error,
        });

        showFatalBootError(
          error
        );

        throw error;
      });

  return bootPromise;
}

/* =========================================================
   GLOBAL ERROR SAFETY NET
========================================================= */

function bindGlobalBootSafetyNet() {
  if (!isBrowser()) {
    return;
  }

  try {
    window.addEventListener(
      "error",
      (event) => {
        if (bootSettled) {
          return;
        }

        safeError(
          "Error global durante boot:",
          event?.error || event?.message
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
    void boot();
  });
}

markDocumentBooting("module-load");
ensureStaticLoaderVisible();
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
      getState() {
        return {
          bootStarted,
          bootSettled,
          hasBootPromise:
            Boolean(bootPromise),
          readyBound,
          documentReadyState:
            document.readyState,
          htmlClassName:
            document.documentElement?.className || "",
          bodyClassName:
            document.body?.className || "",
          loaderExists:
            Boolean(getLoaderElement()),
          loaderHidden:
            Boolean(getLoaderElement()?.hidden),
          appState:
            typeof App?.getState === "function"
              ? App.getState()
              : null,
        };
      },
    };
  }
} catch {}
