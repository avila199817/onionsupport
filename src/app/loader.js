/* =========================================================
   Onion Support - Loader
   Archivo: /src/app/loader.js

   Responsabilidad:
   - Ser la autoridad única sobre #app-loader.
   - Mantener un contrato DOM/ARIA/dataset consistente.
   - Evitar escrituras DOM redundantes durante el boot.
   - Exponer una API pequeña, estable e idempotente.
   - Sin Auth, Router, Store, fetch, storage, timers ni eventos.
========================================================= */

export const LOADER_VERSION =
  "app.loader.minimal.v4-canonical-hide";

const LOADER_ID =
  "app-loader";

export const LOADER_STATES =
  Object.freeze({
    BOOTING: "booting",
    READY: "ready",
    FATAL: "fatal",
    HIDDEN: "hidden",
  });

const LOADER_STATE_ALIASES =
  Object.freeze({
    boot: LOADER_STATES.BOOTING,
    booting: LOADER_STATES.BOOTING,
    loading: LOADER_STATES.BOOTING,

    ready: LOADER_STATES.READY,
    done: LOADER_STATES.READY,
    complete: LOADER_STATES.READY,
    completed: LOADER_STATES.READY,

    fatal: LOADER_STATES.FATAL,
    error: LOADER_STATES.FATAL,
    failed: LOADER_STATES.FATAL,
    fail: LOADER_STATES.FATAL,

    hidden: LOADER_STATES.HIDDEN,
    hide: LOADER_STATES.HIDDEN,
    closed: LOADER_STATES.HIDDEN,
    none: LOADER_STATES.HIDDEN,
  });

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function cleanText(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(
        /[\r\n\t]/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return (
    output ||
    fallback
  );
}

function normalizeState(
  value = LOADER_STATES.BOOTING
) {
  const key =
    cleanText(
      value,
      LOADER_STATES.BOOTING
    )
      .toLowerCase();

  return (
    LOADER_STATE_ALIASES[
      key
    ] ||
    LOADER_STATES.BOOTING
  );
}

/* =========================================================
   DOM HELPERS
========================================================= */

function setAttributeIfChanged(
  node,
  name,
  value
) {
  if (!node) {
    return false;
  }

  const next =
    String(value);

  if (
    node.getAttribute(
      name
    ) === next
  ) {
    return false;
  }

  node.setAttribute(
    name,
    next
  );

  return true;
}

function setDatasetIfChanged(
  node,
  key,
  value
) {
  if (!node?.dataset) {
    return false;
  }

  const next =
    String(value);

  if (
    node.dataset[key] ===
    next
  ) {
    return false;
  }

  node.dataset[key] =
    next;

  return true;
}

function setClassState(
  node,
  className,
  enabled
) {
  if (!node?.classList) {
    return false;
  }

  const shouldHave =
    enabled === true;

  const has =
    node.classList.contains(
      className
    );

  if (
    has === shouldHave
  ) {
    return false;
  }

  node.classList.toggle(
    className,
    shouldHave
  );

  return true;
}

/* =========================================================
   DOM
========================================================= */

export function getLoaderElement() {
  if (!isBrowser()) {
    return null;
  }

  return (
    document.getElementById(
      LOADER_ID
    )
  );
}

export function getLoaderState() {
  const loader =
    getLoaderElement();

  if (!loader) {
    return "missing";
  }

  const datasetState =
    cleanText(
      loader.dataset
        ?.loaderState,
      ""
    );

  if (datasetState) {
    return normalizeState(
      datasetState
    );
  }

  if (
    loader.hidden === true ||
    loader.getAttribute(
      "aria-hidden"
    ) === "true" ||
    loader.classList
      ?.contains(
        "is-hidden"
      )
  ) {
    return (
      LOADER_STATES.HIDDEN
    );
  }

  return (
    LOADER_STATES.BOOTING
  );
}

export function isLoaderVisible() {
  const loader =
    getLoaderElement();

  if (!loader) {
    return false;
  }

  return Boolean(
    loader.hidden !== true &&
    loader.getAttribute(
      "aria-hidden"
    ) !== "true" &&
    !loader.classList
      ?.contains(
        "is-hidden"
      )
  );
}

/* =========================================================
   CANONICAL WRITE
========================================================= */

function writeLoader(
  visible = false,
  state = LOADER_STATES.BOOTING
) {
  const loader =
    getLoaderElement();

  if (!loader) {
    return false;
  }

  const normalized =
    normalizeState(
      state
    );

  const show =
    Boolean(visible) &&
    normalized !==
      LOADER_STATES.HIDDEN;

  const finalState =
    show
      ? normalized
      : LOADER_STATES.HIDDEN;

  const busy =
    show &&
    finalState ===
      LOADER_STATES.BOOTING;

  const ariaHidden =
    show
      ? "false"
      : "true";

  const ariaBusy =
    busy
      ? "true"
      : "false";

  try {
    const alreadyCanonical =
      loader.hidden ===
        !show &&
      loader.classList.contains(
        "is-visible"
      ) === show &&
      loader.classList.contains(
        "is-hidden"
      ) === !show &&
      loader.dataset
        ?.loaderVisible ===
        (
          show
            ? "true"
            : "false"
        ) &&
      loader.dataset
        ?.loaderState ===
        finalState &&
      loader.getAttribute(
        "aria-hidden"
      ) ===
        ariaHidden &&
      loader.getAttribute(
        "aria-busy"
      ) ===
        ariaBusy;

    if (
      alreadyCanonical
    ) {
      return true;
    }

    if (
      loader.hidden !==
      !show
    ) {
      loader.hidden =
        !show;
    }

    setClassState(
      loader,
      "is-visible",
      show
    );

    setClassState(
      loader,
      "is-hidden",
      !show
    );

    setDatasetIfChanged(
      loader,
      "loaderVisible",
      show
        ? "true"
        : "false"
    );

    setDatasetIfChanged(
      loader,
      "loaderState",
      finalState
    );

    setAttributeIfChanged(
      loader,
      "aria-hidden",
      ariaHidden
    );

    setAttributeIfChanged(
      loader,
      "aria-busy",
      ariaBusy
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PUBLIC API
========================================================= */

export function showLoader(
  state = LOADER_STATES.BOOTING
) {
  return writeLoader(
    true,
    state
  );
}

export function hideLoader() {
  return writeLoader(
    false,
    LOADER_STATES.HIDDEN
  );
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getLoaderSnapshot() {
  const loader =
    getLoaderElement();

  return Object.freeze({
    version:
      LOADER_VERSION,

    exists:
      Boolean(loader),

    visible:
      isLoaderVisible(),

    state:
      getLoaderState(),

    busy:
      loader
        ?.getAttribute(
          "aria-busy"
        ) === "true",
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default Object.freeze({
  LOADER_VERSION,
  LOADER_STATES,

  getLoaderElement,
  getLoaderState,
  isLoaderVisible,

  showLoader,
  hideLoader,

  getLoaderSnapshot,
});
