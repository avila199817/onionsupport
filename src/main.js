/* =========================================================
   Onion Support - Main
   Archivo: /src/main.js

   Responsabilidad:
   - Entry point único de la SPA.
   - Bloquear auto-boot legacy.
   - Cargar /src/app/index.js.
   - Ejecutar boot una sola vez.
   - Mostrar error fatal mínimo en castellano.
   - Sin Auth, Router, Store, Services, fetch, storage ni dominio.
========================================================= */

export const MAIN_VERSION = "main.minimal.v4";

const APP_MODULE = "./app/index.js";

const BOOT_PROMISE_KEY = "__ONION_BOOT_PROMISE__";
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";
const MAIN_SNAPSHOT_KEY = "__ONION_MAIN__";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getInitialPath() {
  if (!isBrowser()) return "/";

  try {
    const { pathname = "/", search = "", hash = "" } = window.location;
    return `${pathname || "/"}${search || ""}${hash || ""}`;
  } catch {
    return "/";
  }
}

function redact(value = "") {
  return String(value ?? "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    )
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function writeMainSnapshot(patch = {}) {
  if (!isBrowser()) return false;

  try {
    const previous = isObject(window[MAIN_SNAPSHOT_KEY])
      ? window[MAIN_SNAPSHOT_KEY]
      : {};

    window[MAIN_SNAPSHOT_KEY] = Object.freeze({
      ...previous,
      ...patch,
      version: MAIN_VERSION,
      updatedAt: new Date().toISOString(),
    });

    return true;
  } catch {
    return false;
  }
}

function dispatchMainEvent(name = "", detail = {}) {
  if (!isBrowser() || !name) return false;

  try {
    window.dispatchEvent(
      new CustomEvent(`onion:main:${name}`, {
        detail: {
          version: MAIN_VERSION,
          ...detail,
        },
      })
    );

    return true;
  } catch {
    return false;
  }
}

function setAppState(state = "booting") {
  if (!isBrowser()) return false;

  const value = String(state || "booting").toLowerCase();

  const booting = value === "booting";
  const ready = value === "ready";
  const fatal = value === "fatal";

  for (const node of [document.documentElement, document.body].filter(Boolean)) {
    node.dataset.appState = value;
    node.dataset.appLoading = booting ? "true" : "false";
    node.dataset.appBooting = booting ? "true" : "false";
    node.dataset.appReady = ready ? "true" : "false";
    node.dataset.appFatal = fatal ? "true" : "false";
    node.dataset.mainVersion = MAIN_VERSION;

    if (ready) {
      node.dataset.appBooted = "true";
    }

    node.classList.remove("no-js");
    node.classList.add("js");

    node.classList.toggle("app-booting", booting);
    node.classList.toggle("app-loading", booting);
    node.classList.toggle("app-ready", ready);
    node.classList.toggle("app-fatal", fatal);
  }

  writeMainSnapshot({
    state: value,
    initialPath: getInitialPath(),
  });

  return true;
}

function showNode(node) {
  if (!node) return false;

  try {
    node.hidden = false;
    node.removeAttribute("hidden");
    node.removeAttribute("inert");

    node.setAttribute("aria-hidden", "false");
    node.setAttribute("aria-busy", "false");

    node.classList.remove(
      "is-hidden",
      "app-hidden",
      "shell-hidden",
      "route-hidden",
      "chrome-hidden"
    );

    node.classList.add("is-visible");

    node.style.removeProperty("display");
    node.style.removeProperty("visibility");
    node.style.removeProperty("opacity");
    node.style.removeProperty("pointer-events");

    return true;
  } catch {
    return false;
  }
}

function hideLoader() {
  if (!isBrowser()) return false;

  const loader = document.getElementById("app-loader");

  if (!loader) return false;

  try {
    loader.hidden = true;
    loader.classList.remove("is-visible");
    loader.classList.add("is-hidden");

    loader.dataset.loaderVisible = "false";
    loader.dataset.loaderState = "hidden";

    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-busy", "false");

    return true;
  } catch {
    return false;
  }
}

function getFatalRoot() {
  if (!isBrowser()) return null;

  return (
    document.getElementById("view-container") ||
    document.getElementById("app-content") ||
    document.getElementById("main-content") ||
    document.body ||
    null
  );
}

function showFatalError(error = null) {
  if (!isBrowser()) return false;

  setAppState("fatal");
  hideLoader();

  showNode(document.getElementById("app-shell"));
  showNode(document.getElementById("main-content"));
  showNode(document.getElementById("app-content"));
  showNode(document.getElementById("view-container"));

  const root = getFatalRoot();

  if (!root) return false;

  const section = document.createElement("section");
  section.className = "boot-error-view";
  section.setAttribute("role", "alert");
  section.setAttribute("aria-live", "assertive");

  const title = document.createElement("h1");
  title.textContent = "Error de arranque";

  const text = document.createElement("p");
  text.textContent = "No se pudo iniciar Onion Support. Recarga la página.";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Recargar";
  button.addEventListener("click", () => window.location.reload());

  section.append(title, text, button);
  root.replaceChildren(section);

  const cleanError = {
    name: redact(error?.name || "Error"),
    message: redact(error?.message || String(error || "")),
    status: error?.status || error?.statusCode || null,
  };

  writeMainSnapshot({
    state: "fatal",
    error: cleanError,
  });

  dispatchMainEvent("fatal", {
    error: cleanError,
  });

  try {
    console.error("[Onion Main] Error de arranque:", cleanError);
  } catch {
    // noop
  }

  return true;
}

async function runBoot() {
  const initialPath = getInitialPath();

  setAppState("booting");

  writeMainSnapshot({
    state: "booting",
    initialPath,
  });

  dispatchMainEvent("boot-start", {
    initialPath,
  });

  const app = await import(APP_MODULE);
  const bootApp = typeof app.bootApp === "function" ? app.bootApp : app.default;

  if (typeof bootApp !== "function") {
    throw new Error("/src/app/index.js debe exportar bootApp().");
  }

  await bootApp({
    source: "main",
    initialPath,
    version: MAIN_VERSION,
  });

  setAppState("ready");

  writeMainSnapshot({
    state: "ready",
    initialPath,
  });

  dispatchMainEvent("ready", {
    initialPath,
  });

  return true;
}

export function boot() {
  if (!isBrowser()) return Promise.resolve(false);

  window[DISABLE_AUTO_BOOT_KEY] = true;

  if (window[BOOT_PROMISE_KEY]) {
    return window[BOOT_PROMISE_KEY];
  }

  window[BOOT_PROMISE_KEY] = runBoot().catch((error) => {
    showFatalError(error);
    return false;
  });

  return window[BOOT_PROMISE_KEY];
}

boot();

export default boot;
