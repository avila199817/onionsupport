/* =========================================================
   Onion Support - Route Styles
   Archivo: /src/router/styles.js

   ROUTE CSS LOADER · STEP 1 · COMPATIBILITY SAFE

   Objetivo:
   - Preparar CSS por ruta antes de renderizar la vista.
   - No activar route-loading mientras <html> no declare:
       data-css-route-mode="route"
   - En modo global no crear links ni requests extra.
   - Usar únicamente rutas CSS same-origin y declaradas en manifest.
   - Cachear cargas y deduplicar requests.
   - Mantener CSS ya cargado durante la sesión.
   - Cooperar con AbortSignal del Router.
   - No leer ni persistir publicPath, query, hash ni tokens.
========================================================= */

export const ROUTE_STYLES_VERSION =
  "route-styles.v1-compat-atomic-loader";

const MODE_ATTRIBUTE =
  "data-css-route-mode";

const ROUTE_MODE =
  "route";

const ROUTE_STYLE_MARKER =
  "data-onion-route-style";

const ROUTE_STYLE_HREF =
  "data-onion-route-style-href";

const ALLOWED_PREFIX =
  "/src/css/routes/";

const STYLE_MANIFEST = Object.freeze({
  "public-home": Object.freeze([
    "/src/css/routes/public-home.css",
  ]),

  login: Object.freeze([
    "/src/css/routes/auth.css",
  ]),

  "password-request": Object.freeze([
    "/src/css/routes/auth.css",
  ]),

  "password-reset": Object.freeze([
    "/src/css/routes/auth.css",
  ]),

  "activate-account": Object.freeze([
    "/src/css/routes/auth.css",
  ]),

  home: Object.freeze([
    "/src/css/routes/home.css",
  ]),

  incidencias: Object.freeze([
    "/src/css/routes/incidencias.css",
  ]),

  facturas: Object.freeze([
    "/src/css/routes/facturas.css",
  ]),

  clientes: Object.freeze([
    "/src/css/routes/clientes.css",
  ]),

  usuarios: Object.freeze([
    "/src/css/routes/usuarios.css",
  ]),

  servidor: Object.freeze([
    "/src/css/routes/servidor.css",
  ]),

  cuenta: Object.freeze([
    "/src/css/routes/cuenta.css",
  ]),

  ajustes: Object.freeze([
    "/src/css/routes/ajustes.css",
  ]),
});

const loadPromises =
  new Map();

const loadedHrefs =
  new Set();

const loadedViewKeys =
  new Set();

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

function currentMode() {
  if (!isBrowser()) {
    return "server";
  }

  const value =
    cleanText(
      document
        .documentElement
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

function routeModeEnabled() {
  return (
    currentMode() ===
    ROUTE_MODE
  );
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
    )
  ) {
    throw new Error(
      "RouteStyles: href fuera del prefijo permitido."
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
    )
  ) {
    throw new Error(
      "RouteStyles: stylesheet fuera de /src/css/routes/."
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
    cleanViewKey(
      route?.viewKey ||
      route?.name ||
      ""
    );

  if (!viewKey) {
    return Object.freeze([]);
  }

  const hrefs =
    STYLE_MANIFEST[
      viewKey
    ];

  if (
    !Array.isArray(hrefs) ||
    !hrefs.length
  ) {
    return null;
  }

  return hrefs;
}

function existingStyleLink(
  href = ""
) {
  if (!isBrowser()) {
    return null;
  }

  const normalized =
    normalizeManifestHref(
      href
    );

  for (
    const link
    of document.querySelectorAll(
      `link[${ROUTE_STYLE_MARKER}]`
    )
  ) {
    if (
      link.getAttribute(
        ROUTE_STYLE_HREF
      ) ===
      normalized
    ) {
      return link;
    }
  }

  return null;
}

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
      .then((value) => {
        throwIfAborted(
          signal
        );

        return value;
      });
  }

  const existing =
    existingStyleLink(
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
          resolve(normalized);
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
            fn(value);
          };

        const onLoad =
          () => {
            loadedHrefs.add(
              normalized
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

          link.setAttribute(
            ROUTE_STYLE_MARKER,
            "true"
          );

          link.setAttribute(
            ROUTE_STYLE_HREF,
            normalized
          );

          link.setAttribute(
            "data-onion-route-style-state",
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
      .then((value) => {
        const link =
          existingStyleLink(
            normalized
          );

        link?.setAttribute(
          "data-onion-route-style-state",
          "ready"
        );

        return value;
      })
      .catch((error) => {
        loadPromises.delete(
          normalized
        );

        throw error;
      });

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

export async function ensureRouteStyles(
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
    cleanViewKey(
      route?.viewKey ||
      route?.name ||
      ""
    );

  if (
    !isBrowser() ||
    !routeModeEnabled()
  ) {
    return Object.freeze({
      ok: true,
      mode: currentMode(),
      viewKey,
      loaded: Object.freeze([]),
      skipped: true,
    });
  }

  const hrefs =
    hrefsForRoute(
      route
    );

  if (
    hrefs ===
    null
  ) {
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

  if (viewKey) {
    loadedViewKeys.add(
      viewKey
    );
  }

  return Object.freeze({
    ok: true,
    mode: ROUTE_MODE,
    viewKey,
    loaded:
      Object.freeze([
        ...loaded,
      ]),
    skipped: false,
  });
}

export function hasRouteStyleManifest(
  viewKey = ""
) {
  return Boolean(
    STYLE_MANIFEST[
      cleanViewKey(viewKey)
    ]
  );
}

export function getRouteStyleHrefs(
  viewKey = ""
) {
  const hrefs =
    STYLE_MANIFEST[
      cleanViewKey(viewKey)
    ];

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

    loadedViewKeys:
      Object.freeze([
        ...loadedViewKeys,
      ]),

    manifestViewKeys:
      Object.freeze(
        Object.keys(
          STYLE_MANIFEST
        )
      ),
  });
}

export const RouteStyles = Object.freeze({
  version:
    ROUTE_STYLES_VERSION,

  ensureRouteStyles,
  ensure:
    ensureRouteStyles,

  hasRouteStyleManifest,
  getRouteStyleHrefs,
  getSnapshot,

  snapshot:
    getSnapshot,
});

export default RouteStyles;
