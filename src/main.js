/* =========================================================
   Onion Support - Main
   Archivo: /src/main.js

   Responsabilidad:
   - Entry point único de la SPA.
   - Bloquear auto-boot legacy.
   - Cargar /src/app/index.js.
   - Ejecutar boot una sola vez.
   - Mantener el token/ruta sensible sólo en memoria durante el handoff al App.
   - No copiar secretos de URL a snapshots/eventos globales.
   - Delegar el loader normal en /src/app/loader.js.
   - Mantener un fallback DOM mínimo sólo para fallo extremo del loader.
   - Mostrar error fatal mínimo en castellano.
   - Sin Auth, Router, Store, Services, fetch, storage ni dominio.
========================================================= */

export const MAIN_VERSION = "main.minimal.v5-hardened";

const APP_MODULE = "./app/index.js";
const LOADER_MODULE = "./app/loader.js";

const BOOT_PROMISE_KEY = "__ONION_BOOT_PROMISE__";
const DISABLE_AUTO_BOOT_KEY = "__ONION_DISABLE_AUTO_BOOT__";
const MAIN_SNAPSHOT_KEY = "__ONION_MAIN__";

const LEGACY_RESET_TOKEN_PATH =
  /(\/(?:reset-password|password-reset)\/confirm\/)([^/?#\s]+)/gi;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

/*
  IMPORTANTE:
  - La URL real se conserva únicamente como variable local durante boot.
  - El App/Router necesita esa URL real para leer ?token=...
  - Snapshots, eventos y errores reciben siempre una versión saneada.
*/
function getInitialPath() {
  if (!isBrowser()) return "/";

  try {
    const {
      pathname = "/",
      search = "",
      hash = "",
    } = window.location;

    return `${pathname || "/"}${search || ""}${hash || ""}`;
  } catch {
    return "/";
  }
}

function redact(value = "") {
  return String(value ?? "")
    .replace(
      LEGACY_RESET_TOKEN_PATH,
      "$1***"
    )
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    )
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    )
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSafeInitialPath() {
  return redact(
    getInitialPath()
  ) || "/";
}

function safeError(error = null) {
  if (!error) {
    return {
      name: "Error",
      message: "",
      status: null,
    };
  }

  return {
    name: redact(
      error?.name || "Error"
    ) || "Error",

    message: redact(
      error?.message ||
      String(error || "")
    ),

    status:
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      null,
  };
}

/* =========================================================
   SNAPSHOT / EVENTS
========================================================= */

function writeMainSnapshot(patch = {}) {
  if (!isBrowser()) return false;

  try {
    const previous = isObject(
      window[MAIN_SNAPSHOT_KEY]
    )
      ? window[MAIN_SNAPSHOT_KEY]
      : {};

    /*
      Defensa adicional:
      aunque un caller pase accidentalmente initialPath real,
      este boundary nunca lo publica sin sanear.
    */
    const nextPatch = {
      ...patch,
    };

    if (
      Object.prototype.hasOwnProperty.call(
        nextPatch,
        "initialPath"
      )
    ) {
      nextPatch.initialPath =
        redact(nextPatch.initialPath) ||
        "/";
    }

    window[MAIN_SNAPSHOT_KEY] = Object.freeze({
      ...previous,
      ...nextPatch,
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
    const safeDetail = {
      ...detail,
    };

    if (
      Object.prototype.hasOwnProperty.call(
        safeDetail,
        "initialPath"
      )
    ) {
      safeDetail.initialPath =
        redact(safeDetail.initialPath) ||
        "/";
    }

    if (safeDetail.error) {
      safeDetail.error = safeError(
        safeDetail.error
      );
    }

    window.dispatchEvent(
      new CustomEvent(
        `onion:main:${name}`,
        {
          detail: {
            version: MAIN_VERSION,
            ...safeDetail,
          },
        }
      )
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   APP STATE
========================================================= */

function setAppState(state = "booting") {
  if (!isBrowser()) return false;

  const value =
    String(state || "booting")
      .toLowerCase();

  const booting =
    value === "booting";

  const ready =
    value === "ready";

  const fatal =
    value === "fatal";

  const nodes = [
    document.documentElement,
    document.body,
  ].filter(Boolean);

  for (const node of nodes) {
    node.dataset.appState = value;
    node.dataset.appLoading =
      booting ? "true" : "false";
    node.dataset.appBooting =
      booting ? "true" : "false";
    node.dataset.appReady =
      ready ? "true" : "false";
    node.dataset.appFatal =
      fatal ? "true" : "false";
    node.dataset.mainVersion =
      MAIN_VERSION;

    if (ready) {
      node.dataset.appBooted = "true";
    }

    node.classList.remove("no-js");
    node.classList.add("js");

    node.classList.toggle(
      "app-booting",
      booting
    );

    node.classList.toggle(
      "app-loading",
      booting
    );

    node.classList.toggle(
      "app-ready",
      ready
    );

    node.classList.toggle(
      "app-fatal",
      fatal
    );
  }

  writeMainSnapshot({
    state: value,
    initialPath: getSafeInitialPath(),
    ...(fatal ? {} : { error: null }),
  });

  return true;
}

/* =========================================================
   LOADER BOUNDARY
========================================================= */

/*
  Fallback extremo:
  sólo se usa si /src/app/loader.js no puede importarse o no expone
  una API compatible. El control normal del loader vive en loader.js.
*/
function emergencyHideLoader() {
  if (!isBrowser()) return false;

  const loader =
    document.getElementById(
      "app-loader"
    );

  if (!loader) return false;

  try {
    loader.hidden = true;

    loader.classList.remove(
      "is-visible"
    );

    loader.classList.add(
      "is-hidden"
    );

    loader.dataset.loaderVisible =
      "false";

    loader.dataset.loaderState =
      "hidden";

    loader.setAttribute(
      "aria-hidden",
      "true"
    );

    loader.setAttribute(
      "aria-busy",
      "false"
    );

    return true;
  } catch {
    return false;
  }
}

async function hideLoaderSafely() {
  if (!isBrowser()) return false;

  try {
    const module =
      await import(
        LOADER_MODULE
      );

    const hide =
      module?.hideLoader ||
      module?.forceHideLoader ||
      module?.default?.hideLoader ||
      module?.default?.forceHideLoader;

    if (isFunction(hide)) {
      const result =
        await hide();

      if (result !== false) {
        return true;
      }
    }
  } catch {
    /*
      El fatal boundary no puede depender de que el módulo
      que controla el loader esté sano.
    */
  }

  return emergencyHideLoader();
}

/* =========================================================
   FATAL UI
========================================================= */

function showNode(node) {
  if (!node) return false;

  try {
    node.hidden = false;
    node.removeAttribute("hidden");
    node.removeAttribute("inert");

    node.setAttribute(
      "aria-hidden",
      "false"
    );

    node.setAttribute(
      "aria-busy",
      "false"
    );

    node.classList.remove(
      "is-hidden",
      "app-hidden",
      "shell-hidden",
      "route-hidden",
      "chrome-hidden"
    );

    node.classList.add(
      "is-visible"
    );

    node.style.removeProperty(
      "display"
    );

    node.style.removeProperty(
      "visibility"
    );

    node.style.removeProperty(
      "opacity"
    );

    node.style.removeProperty(
      "pointer-events"
    );

    return true;
  } catch {
    return false;
  }
}

function getFatalRoot() {
  if (!isBrowser()) return null;

  return (
    document.getElementById(
      "view-container"
    ) ||
    document.getElementById(
      "app-content"
    ) ||
    document.getElementById(
      "main-content"
    ) ||
    document.body ||
    null
  );
}

async function showFatalError(error = null) {
  if (!isBrowser()) return false;

  setAppState("fatal");

  await hideLoaderSafely();

  showNode(
    document.getElementById(
      "app-shell"
    )
  );

  showNode(
    document.getElementById(
      "main-content"
    )
  );

  showNode(
    document.getElementById(
      "app-content"
    )
  );

  showNode(
    document.getElementById(
      "view-container"
    )
  );

  const root =
    getFatalRoot();

  if (!root) {
    return false;
  }

  const section =
    document.createElement(
      "section"
    );

  section.className =
    "boot-error-view";

  section.setAttribute(
    "role",
    "alert"
  );

  section.setAttribute(
    "aria-live",
    "assertive"
  );

  const title =
    document.createElement(
      "h1"
    );

  title.textContent =
    "Error de arranque";

  const text =
    document.createElement(
      "p"
    );

  text.textContent =
    "No se pudo iniciar Onion Support. Recarga la página.";

  const button =
    document.createElement(
      "button"
    );

  button.type =
    "button";

  button.textContent =
    "Recargar";

  button.addEventListener(
    "click",
    () =>
      window.location.reload()
  );

  section.append(
    title,
    text,
    button
  );

  root.replaceChildren(
    section
  );

  const cleanError =
    safeError(error);

  writeMainSnapshot({
    state: "fatal",
    initialPath: getSafeInitialPath(),
    error: cleanError,
  });

  dispatchMainEvent(
    "fatal",
    {
      initialPath:
        getSafeInitialPath(),
      error: cleanError,
    }
  );

  try {
    console.error(
      "[Onion Main] Error de arranque:",
      cleanError
    );
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   BOOT
========================================================= */

async function runBoot() {
  /*
    rawInitialPath puede contener un token válido.
    No sale de este scope salvo para el handoff interno a App.
  */
  const rawInitialPath =
    getInitialPath();

  const safeInitialPath =
    redact(rawInitialPath) ||
    "/";

  setAppState("booting");

  writeMainSnapshot({
    state: "booting",
    initialPath:
      safeInitialPath,
    error: null,
  });

  dispatchMainEvent(
    "boot-start",
    {
      initialPath:
        safeInitialPath,
    }
  );

  const app =
    await import(
      APP_MODULE
    );

  const bootApp =
    isFunction(
      app?.bootApp
    )
      ? app.bootApp
      : app?.default;

  if (!isFunction(bootApp)) {
    throw new Error(
      "/src/app/index.js debe exportar bootApp()."
    );
  }

  await bootApp({
    source: "main",

    /*
      Necesario para que la primera navegación conserve
      query/hash y, en reset, el token de la URL.
      No se publica en snapshots/eventos de Main.
    */
    initialPath:
      rawInitialPath,

    version:
      MAIN_VERSION,
  });

  setAppState("ready");

  writeMainSnapshot({
    state: "ready",
    initialPath:
      safeInitialPath,
    error: null,
  });

  dispatchMainEvent(
    "ready",
    {
      initialPath:
        safeInitialPath,
    }
  );

  return true;
}

export function boot() {
  if (!isBrowser()) {
    return Promise.resolve(
      false
    );
  }

  window[
    DISABLE_AUTO_BOOT_KEY
  ] = true;

  if (
    window[
      BOOT_PROMISE_KEY
    ]
  ) {
    return window[
      BOOT_PROMISE_KEY
    ];
  }

  window[
    BOOT_PROMISE_KEY
  ] = runBoot()
    .catch(
      async (error) => {
        await showFatalError(
          error
        );

        return false;
      }
    );

  return window[
    BOOT_PROMISE_KEY
  ];
}

boot();

export default boot;
