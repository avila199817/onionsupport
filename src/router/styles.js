/* =========================================================
   Onion Support - Route Styles
   Archivo: /src/router/styles.js

   ROUTE CSS LOADER · V2 DIRECT MANIFEST · SAFE GATED

   IMPORTANTE:
   - NO crea wrappers CSS.
   - Usa directamente los CSS YA EXISTENTES del proyecto.
   - Mientras el contrato de capas no esté listo, este loader queda
     desactivado aunque exista el archivo.
   - No lee publicPath, query, hash ni tokens.
========================================================= */

export const ROUTE_STYLES_VERSION =
  "route-styles.v2-direct-manifest-safe-gated";

const MODE_ATTRIBUTE =
  "data-css-route-mode";

const ROUTE_MODE =
  "route";

const LAYER_CONTRACT_ATTRIBUTE =
  "data-css-route-layer-contract";

const REQUIRED_LAYER_CONTRACT =
  "self-layered-v1";

const ROUTE_STYLE_MARKER =
  "data-onion-route-style";

const ROUTE_STYLE_HREF =
  "data-onion-route-style-href";

const ROUTE_STYLE_STATE =
  "data-onion-route-style-state";

const ALLOWED_PREFIX =
  "/src/css/";

const MEDIA_ACTIVE =
  "all";

const MEDIA_INACTIVE =
  "not all";

/* =========================================================
   MANIFEST
   Apunta directamente a los CSS existentes.
========================================================= */

const STYLE_MANIFEST = Object.freeze({
  "public-home": Object.freeze([
    "/src/css/auth/login.css",
    "/src/css/views/public/index.css",
  ]),

  login: Object.freeze([
    "/src/css/auth/login.css",
  ]),

  "password-request": Object.freeze([
    "/src/css/auth/login.css",
  ]),

  "password-reset": Object.freeze([
    "/src/css/auth/login.css",
  ]),

  "activate-account": Object.freeze([
    "/src/css/auth/login.css",
  ]),

  home: Object.freeze([
    "/src/css/views/home/index.css",
  ]),

  incidencias: Object.freeze([
    "/src/css/views/incidencias/index.css",
    "/src/css/views/incidencias/create.css",
    "/src/css/views/incidencias/detail.css",
  ]),

  facturas: Object.freeze([
    "/src/css/views/facturas/index.css",
    "/src/css/views/facturas/create.css",
    "/src/css/views/facturas/detail.css",
  ]),

  clientes: Object.freeze([
    "/src/css/views/clientes/index.css",
    "/src/css/views/clientes/create.css",
    "/src/css/views/clientes/detail.css",
  ]),

  usuarios: Object.freeze([
    "/src/css/views/usuarios/index.css",
    "/src/css/views/usuarios/create.css",
  ]),

  servidor: Object.freeze([
    "/src/css/views/servidor/index.css",
  ]),

  cuenta: Object.freeze([
    "/src/css/views/cuenta/index.css",
  ]),

  ajustes: Object.freeze([
    "/src/css/views/ajustes/index.css",
  ]),
});

/* =========================================================
   RUNTIME
========================================================= */

const loadPromises =
  new Map();

const loadedHrefs =
  new Set();

let activeViewKey =
  "";

let activeHrefs =
  new Set();

let preparedViewKey =
  "";

let preparedHrefs =
  new Set();

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
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return output || fallback;
}

function cleanViewKey(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:-]/g, "")
    .slice(0, 96);
}

function routeViewKey(
  route = null
) {
  return cleanViewKey(
    route?.viewKey ||
    route?.name ||
    ""
  );
}

function createAbortError(
  reason = "route-style-aborted"
) {
  try {
    return new DOMException(
      reason,
      "AbortError"
    );
  } catch {
    const error =
      new Error(reason);

    error.name =
      "AbortError";

    error.code =
      "ROUTE_STYLE_ABORTED";

    return error;
  }
}

function throwIfAborted(
  signal = null
) {
  if (
    signal?.aborted !==
    true
  ) {
    return false;
  }

  throw createAbortError(
    cleanText(
      signal.reason,
      "route-style-aborted"
    )
  );
}

/* =========================================================
   MODE / LAYER SAFETY GATE
========================================================= */

function currentMode() {
  if (!isBrowser()) {
    return "server";
  }

  const value =
    cleanText(
      document.documentElement
        ?.getAttribute(
          MODE_ATTRIBUTE
        ),
      "global"
    )
      .toLowerCase();

  return (
    value === ROUTE_MODE
      ? ROUTE_MODE
      : "global"
  );
}

function currentLayerContract() {
  if (!isBrowser()) {
    return "";
  }

  return cleanText(
    document.documentElement
      ?.getAttribute(
        LAYER_CONTRACT_ATTRIBUTE
      ),
    ""
  )
    .toLowerCase();
}

function layerContractReady() {
  return (
    currentLayerContract() ===
    REQUIRED_LAYER_CONTRACT
  );
}

function routeModeEnabled() {
  return (
    currentMode() === ROUTE_MODE &&
    layerContractReady()
  );
}

/* =========================================================
   MANIFEST / URL SAFETY
========================================================= */

function manifestHrefsForViewKey(
  viewKey = ""
) {
  const key =
    cleanViewKey(
      viewKey
    );

  if (!key) {
    return null;
  }

  const hrefs =
    STYLE_MANIFEST[key];

  if (
    !Array.isArray(hrefs) ||
    !hrefs.length
  ) {
    return null;
  }

  return hrefs;
}

function normalizeManifestHref(
  value = ""
) {
  const raw =
    cleanText(
      value,
      ""
    );

  if (
    !raw ||
    !raw.startsWith(
      ALLOWED_PREFIX
    ) ||
    !raw.endsWith(
      ".css"
    )
  ) {
    throw new Error(
      "RouteStyles: href CSS no permitido."
    );
  }

  if (!isBrowser()) {
    return raw;
  }

  const url =
    new URL(
      raw,
      window.location.origin
    );

  if (
    url.origin !==
    window.location.origin
  ) {
    throw new Error(
      "RouteStyles: stylesheet cross-origin rechazado."
    );
  }

  if (
    !url.pathname.startsWith(
      ALLOWED_PREFIX
    ) ||
    !url.pathname.endsWith(
      ".css"
    )
  ) {
    throw new Error(
      "RouteStyles: stylesheet fuera de /src/css/."
    );
  }

  return (
    `${url.pathname}${url.search}`
  );
}

function hrefsForRoute(
  route = null
) {
  const viewKey =
    routeViewKey(
      route
    );

  const hrefs =
    manifestHrefsForViewKey(
      viewKey
    );

  if (hrefs === null) {
    return null;
  }

  return hrefs.map(
    normalizeManifestHref
  );
}

/* =========================================================
   MANAGED LINKS
========================================================= */

function managedLinks() {
  if (!isBrowser()) {
    return [];
  }

  return [
    ...document.querySelectorAll(
      `link[${ROUTE_STYLE_MARKER}="true"]`
    ),
  ];
}

function linkHrefKey(
  link = null
) {
  return cleanText(
    link?.getAttribute?.(
      ROUTE_STYLE_HREF
    ),
    ""
  );
}

function findManagedLink(
  href = ""
) {
  const normalized =
    normalizeManifestHref(
      href
    );

  return (
    managedLinks()
      .find(
        (link) =>
          linkHrefKey(link) ===
          normalized
      ) ||
    null
  );
}

function setManagedLinkActive(
  link = null,
  active = false,
  state = ""
) {
  if (!link) {
    return false;
  }

  try {
    link.media =
      active
        ? MEDIA_ACTIVE
        : MEDIA_INACTIVE;

    link.disabled =
      false;

    if (state) {
      link.setAttribute(
        ROUTE_STYLE_STATE,
        state
      );
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   LOAD
   Descarga con media="not all" para no aplicar la hoja todavía.
========================================================= */

function loadOne(
  href = "",
  signal = null
) {
  throwIfAborted(
    signal
  );

  const normalized =
    normalizeManifestHref(
      href
    );

  if (
    loadedHrefs.has(
      normalized
    )
  ) {
    return Promise.resolve(
      normalized
    );
  }

  if (
    loadPromises.has(
      normalized
    )
  ) {
    return loadPromises
      .get(normalized)
      .then(
        (value) => {
          throwIfAborted(
            signal
          );

          return value;
        }
      );
  }

  const existing =
    findManagedLink(
      normalized
    );

  if (
    existing?.sheet
  ) {
    loadedHrefs.add(
      normalized
    );

    return Promise.resolve(
      normalized
    );
  }

  const promise =
    new Promise(
      (resolve, reject) => {
        if (!isBrowser()) {
          resolve(
            normalized
          );

          return;
        }

        const link =
          existing ||
          document.createElement(
            "link"
          );

        let settled =
          false;

        const cleanup =
          () => {
            link.removeEventListener(
              "load",
              onLoad
            );

            link.removeEventListener(
              "error",
              onError
            );
          };

        const finish =
          (fn, value) => {
            if (settled) {
              return;
            }

            settled =
              true;

            cleanup();

            fn(
              value
            );
          };

        const onLoad =
          () => {
            loadedHrefs.add(
              normalized
            );

            setManagedLinkActive(
              link,
              activeHrefs.has(
                normalized
              ),
              activeHrefs.has(
                normalized
              )
                ? "active"
                : "cached"
            );

            finish(
              resolve,
              normalized
            );
          };

        const onError =
          () => {
            if (
              !existing &&
              link.parentNode
            ) {
              try {
                link.remove();
              } catch {
                // noop
              }
            }

            const error =
              new Error(
                `RouteStyles: no se pudo cargar ${normalized}`
              );

            error.code =
              "ROUTE_STYLE_LOAD_FAILED";

            finish(
              reject,
              error
            );
          };

        link.addEventListener(
          "load",
          onLoad,
          { once: true }
        );

        link.addEventListener(
          "error",
          onError,
          { once: true }
        );

        if (!existing) {
          link.rel =
            "stylesheet";

          link.href =
            normalized;

          link.media =
            MEDIA_INACTIVE;

          link.disabled =
            false;

          link.setAttribute(
            ROUTE_STYLE_MARKER,
            "true"
          );

          link.setAttribute(
            ROUTE_STYLE_HREF,
            normalized
          );

          link.setAttribute(
            ROUTE_STYLE_STATE,
            "loading"
          );

          document.head.appendChild(
            link
          );
        }

        if (
          existing?.sheet
        ) {
          queueMicrotask(
            onLoad
          );
        }
      }
    )
      .catch(
        (error) => {
          loadPromises.delete(
            normalized
          );

          loadedHrefs.delete(
            normalized
          );

          throw error;
        }
      );

  loadPromises.set(
    normalized,
    promise
  );

  return promise.then(
    (value) => {
      throwIfAborted(
        signal
      );

      return value;
    }
  );
}

/* =========================================================
   PRELOAD
   Descarga sin aplicar.
========================================================= */

export async function preloadRouteStyles(
  route = null,
  options = {}
) {
  const signal =
    options?.signal ||
    null;

  throwIfAborted(
    signal
  );

  const viewKey =
    routeViewKey(
      route
    );

  if (
    !isBrowser() ||
    !routeModeEnabled()
  ) {
    return Object.freeze({
      ok: true,
      skipped: true,
      mode: currentMode(),
      layerContractReady:
        layerContractReady(),
      viewKey,
      loaded:
        Object.freeze([]),
    });
  }

  const hrefs =
    hrefsForRoute(
      route
    );

  if (hrefs === null) {
    const error =
      new Error(
        `RouteStyles: no existe manifest CSS para "${viewKey}".`
      );

    error.code =
      "ROUTE_STYLE_MANIFEST_MISSING";

    throw error;
  }

  const loaded =
    await Promise.all(
      hrefs.map(
        (href) =>
          loadOne(
            href,
            signal
          )
      )
    );

  throwIfAborted(
    signal
  );

  return Object.freeze({
    ok: true,
    skipped: false,
    mode: ROUTE_MODE,
    layerContractReady: true,
    viewKey,
    loaded:
      Object.freeze([
        ...loaded,
      ]),
  });
}

/* =========================================================
   PREPARE
   Activa CSS nuevo manteniendo activo el CSS de la vista actual.
========================================================= */

export async function prepareRouteStyles(
  route = null,
  options = {}
) {
  const signal =
    options?.signal ||
    null;

  const preload =
    await preloadRouteStyles(
      route,
      {
        signal,
      }
    );

  if (
    preload.skipped
  ) {
    return preload;
  }

  throwIfAborted(
    signal
  );

  const viewKey =
    routeViewKey(
      route
    );

  const hrefs =
    hrefsForRoute(
      route
    ) ||
    [];

  const nextHrefs =
    new Set(
      hrefs
    );

  for (
    const href
    of nextHrefs
  ) {
    const link =
      findManagedLink(
        href
      );

    if (!link) {
      const error =
        new Error(
          `RouteStyles: link preparado no encontrado para ${href}.`
        );

      error.code =
        "ROUTE_STYLE_LINK_MISSING";

      throw error;
    }

    setManagedLinkActive(
      link,
      true,
      activeHrefs.has(
        href
      )
        ? "active"
        : "prepared"
    );
  }

  preparedViewKey =
    viewKey;

  preparedHrefs =
    nextHrefs;

  return Object.freeze({
    ok: true,
    skipped: false,
    mode: ROUTE_MODE,
    viewKey,
    prepared:
      Object.freeze([
        ...preparedHrefs,
      ]),
  });
}

/* =========================================================
   COMMIT
   Se llama sólo después del commit real de la nueva vista.
========================================================= */

export function commitRouteStyles(
  route = null
) {
  const viewKey =
    routeViewKey(
      route
    );

  if (
    !isBrowser() ||
    !routeModeEnabled()
  ) {
    return Object.freeze({
      ok: true,
      skipped: true,
      mode: currentMode(),
      viewKey,
    });
  }

  const hrefs =
    hrefsForRoute(
      route
    );

  if (hrefs === null) {
    return Object.freeze({
      ok: false,
      skipped: false,
      mode: ROUTE_MODE,
      viewKey,
      reason:
        "manifest-missing",
    });
  }

  const nextActive =
    new Set(
      hrefs
    );

  for (
    const link
    of managedLinks()
  ) {
    const href =
      linkHrefKey(
        link
      );

    const active =
      nextActive.has(
        href
      );

    setManagedLinkActive(
      link,
      active,
      active
        ? "active"
        : "cached"
    );
  }

  activeViewKey =
    viewKey;

  activeHrefs =
    nextActive;

  preparedViewKey =
    "";

  preparedHrefs =
    new Set();

  return Object.freeze({
    ok: true,
    skipped: false,
    mode: ROUTE_MODE,
    viewKey,
    active:
      Object.freeze([
        ...activeHrefs,
      ]),
  });
}

/* =========================================================
   ROLLBACK
========================================================= */

export function rollbackRouteStyles(
  route = null
) {
  const viewKey =
    routeViewKey(
      route
    );

  if (
    !isBrowser() ||
    !routeModeEnabled()
  ) {
    return Object.freeze({
      ok: true,
      skipped: true,
      mode: currentMode(),
      viewKey,
    });
  }

  for (
    const link
    of managedLinks()
  ) {
    const href =
      linkHrefKey(
        link
      );

    const active =
      activeHrefs.has(
        href
      );

    setManagedLinkActive(
      link,
      active,
      active
        ? "active"
        : "cached"
    );
  }

  preparedViewKey =
    "";

  preparedHrefs =
    new Set();

  return Object.freeze({
    ok: true,
    skipped: false,
    mode: ROUTE_MODE,
    viewKey,
    activeViewKey,
    active:
      Object.freeze([
        ...activeHrefs,
      ]),
  });
}

/* =========================================================
   INTROSPECTION
========================================================= */

export function hasRouteStyleManifest(
  viewKey = ""
) {
  return Boolean(
    manifestHrefsForViewKey(
      viewKey
    )
  );
}

export function getRouteStyleHrefs(
  viewKey = ""
) {
  const hrefs =
    manifestHrefsForViewKey(
      viewKey
    );

  return Object.freeze(
    Array.isArray(hrefs)
      ? [...hrefs]
      : []
  );
}

export function getSnapshot() {
  return Object.freeze({
    version:
      ROUTE_STYLES_VERSION,

    mode:
      currentMode(),

    routeModeEnabled:
      routeModeEnabled(),

    layerContract:
      currentLayerContract(),

    layerContractReady:
      layerContractReady(),

    activeViewKey,

    preparedViewKey,

    activeHrefs:
      Object.freeze([
        ...activeHrefs,
      ]),

    preparedHrefs:
      Object.freeze([
        ...preparedHrefs,
      ]),

    loadedHrefs:
      Object.freeze([
        ...loadedHrefs,
      ]),

    loadingHrefs:
      Object.freeze([
        ...loadPromises.keys(),
      ].filter(
        (href) =>
          !loadedHrefs.has(
            href
          )
      )),

    manifestViewKeys:
      Object.freeze(
        Object.keys(
          STYLE_MANIFEST
        )
      ),
  });
}

/* =========================================================
   API
========================================================= */

export const RouteStyles =
  Object.freeze({
    version:
      ROUTE_STYLES_VERSION,

    preloadRouteStyles,
    preload:
      preloadRouteStyles,

    prepareRouteStyles,
    prepare:
      prepareRouteStyles,

    commitRouteStyles,
    commit:
      commitRouteStyles,

    rollbackRouteStyles,
    rollback:
      rollbackRouteStyles,

    hasRouteStyleManifest,
    getRouteStyleHrefs,

    getSnapshot,
    snapshot:
      getSnapshot,
  });

export default RouteStyles;
