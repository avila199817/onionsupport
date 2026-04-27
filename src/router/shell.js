/* =========================================================
   Onion SPA - Router Shell
   Archivo: src/router/shell.js

   Responsabilidades:
   - resolver elementos visuales del shell
   - limpiar contenedores dinámicos antes de render
   - actualizar título del documento
   - activar menú SPA según ruta actual
   - mostrar u ocultar shell por ruta
   - reparar clases residuales de auth/login tras navegación privada

   HARDENING:
   - guards de browser
   - sync robusto de aria-current
   - compatibilidad con mount dinámico
   - cero throws accidentales
   - no toca history
   - no modifica query/hash
   - no destruye /activate-account?token=...
   - no destruye /activate-account/<token>
   - no destruye /reset-password/confirm?token=...
========================================================= */

import {
  normalizeCanonicalPath,
  resolveSpaHref,
} from "./helpers.js";

/* =========================================================
   INTERNAL
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

function isFn(value) {
  return typeof value === "function";
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeToggleHidden(element, hidden) {
  if (!element) return false;

  try {
    element.hidden = Boolean(hidden);
  } catch {}

  try {
    element.setAttribute(
      "aria-hidden",
      hidden ? "true" : "false"
    );
  } catch {}

  return true;
}

function safeSetBusy(element, busy = false) {
  if (!element) return false;

  try {
    element.setAttribute(
      "aria-busy",
      busy ? "true" : "false"
    );

    return true;
  } catch {
    return false;
  }
}

function safeSetAttribute(element, name, value) {
  if (!element || !name) return false;

  try {
    element.setAttribute(
      name,
      String(value)
    );

    return true;
  } catch {
    return false;
  }
}

function safeRemoveAttribute(element, name) {
  if (!element || !name) return false;

  try {
    element.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function safeClassToggle(element, className, enabled) {
  if (!element || !className) return false;

  try {
    element.classList.toggle(
      className,
      Boolean(enabled)
    );

    return true;
  } catch {
    return false;
  }
}

function safeClassRemove(element, ...classes) {
  if (!element || !classes.length) return false;

  try {
    element.classList.remove(
      ...classes.filter(Boolean)
    );

    return true;
  } catch {
    return false;
  }
}

function safeDataset(element, key, value) {
  if (!element || !key) return false;

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete element.dataset[key];
      return true;
    }

    element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function safeEmit(
  AppCore,
  eventName,
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );

    return true;
  } catch {
    return false;
  }
}

function safeWarn(
  AppCore,
  ...args
) {
  try {
    AppCore?.utils?.warn?.(
      "[Router Shell]",
      ...args
    );
  } catch {}

  try {
    console.warn(
      "[Router Shell]",
      ...args
    );
  } catch {}
}

function resolveDomElement(AppCore, key, selectors = []) {
  if (!isBrowser()) {
    return null;
  }

  try {
    const fromCore =
      AppCore?.dom?.[key];

    if (
      fromCore &&
      document.contains(fromCore)
    ) {
      return fromCore;
    }
  } catch {}

  for (const selector of selectors) {
    try {
      const found =
        selector.startsWith("#")
          ? document.getElementById(selector.slice(1))
          : document.querySelector(selector);

      if (found) {
        try {
          if (AppCore?.dom && key) {
            AppCore.dom[key] = found;
          }
        } catch {}

        return found;
      }
    } catch {}
  }

  return null;
}

function routeRequestsHiddenShell(route = null) {
  const meta =
    safeObject(route?.meta);

  return Boolean(
    route?.hideShell === true ||
      route?.shell === false ||
      route?.showShell === false ||
      route?.layout === "auth" ||
      route?.layout === "public" ||
      meta.hideShell === true ||
      meta.shell === false ||
      meta.showShell === false ||
      meta.layout === "auth" ||
      meta.layout === "public"
  );
}

function routeRequestsAuthScreen(route = null) {
  const meta =
    safeObject(route?.meta);

  return Boolean(
    routeRequestsHiddenShell(route) ||
      route?.authScreen === true ||
      meta.authScreen === true
  );
}

/* =========================================================
   ELEMENTS
========================================================= */

export function getShellElements(AppCore) {
  if (!isBrowser()) {
    return {
      html: null,
      body: null,

      shell: null,
      main: null,
      appContent: null,
      viewContainer: null,

      sidebar: null,
      topbar: null,
      tablehead: null,
      tableheadContainer: null,
      mobileToggle: null,
      loader: null,
    };
  }

  const html =
    document.documentElement || null;

  const body =
    AppCore?.dom?.body ||
    document.body ||
    null;

  return {
    html,
    body,

    shell:
      resolveDomElement(
        AppCore,
        "shell",
        [
          "#app-shell",
          "[data-app-shell]",
          "[data-app-shell='true']",
        ]
      ),

    main:
      resolveDomElement(
        AppCore,
        "main",
        [
          "#main-content",
          ".main-content",
          "[data-main-content]",
        ]
      ),

    appContent:
      resolveDomElement(
        AppCore,
        "appContent",
        [
          "#app-content",
          "[data-app-content]",
        ]
      ),

    viewContainer:
      resolveDomElement(
        AppCore,
        "viewContainer",
        [
          "#view-container",
          "[data-view-root]",
        ]
      ),

    sidebar:
      resolveDomElement(
        AppCore,
        "sidebar",
        [
          ".sidebar",
          "#sidebar",
          "[data-sidebar]",
        ]
      ),

    topbar:
      resolveDomElement(
        AppCore,
        "topbar",
        [
          ".topbar",
          "#topbar",
          "[data-topbar]",
        ]
      ),

    tablehead:
      resolveDomElement(
        AppCore,
        "tablehead",
        [
          "#table-head",
          ".table-head",
          "[data-tablehead]",
        ]
      ),

    tableheadContainer:
      resolveDomElement(
        AppCore,
        "tableheadContainer",
        [
          "#tablehead-container",
          "[data-tablehead-container]",
        ]
      ),

    mobileToggle:
      resolveDomElement(
        AppCore,
        "sidebarMobileToggle",
        [
          "#toggleSidebarMobile",
          "[data-sidebar-mobile-toggle]",
          "[data-mobile-sidebar-toggle]",
        ]
      ),

    loader:
      resolveDomElement(
        AppCore,
        "loader",
        [
          "#app-loader",
          ".app-loader",
          "[data-app-loader]",
        ]
      ),
  };
}

/* =========================================================
   CORE BRIDGES
========================================================= */

export function clearDynamicContainers(AppCore) {
  try {
    if (
      typeof AppCore?.clearDynamicContainers === "function"
    ) {
      AppCore.clearDynamicContainers();
      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "clearDynamicContainers failed",
      error
    );
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    const {
      tablehead,
      tableheadContainer,
    } = getShellElements(AppCore);

    if (tableheadContainer) {
      tableheadContainer.innerHTML = "";
    }

    if (tablehead) {
      safeToggleHidden(tablehead, true);
    }

    document
      .querySelectorAll("[data-router-dynamic], [data-dynamic-slot]")
      .forEach((node) => {
        try {
          if (
            node.id === "view-container" ||
            node.matches?.("#view-container, [data-view-root]")
          ) {
            return;
          }

          node.innerHTML = "";
        } catch {}
      });

    safeEmit(
      AppCore,
      "router:shell:dynamic-cleared",
      {
        source: "router.shell",
      }
    );

    return true;
  } catch {
    return false;
  }
}

export function setDocumentTitle(
  AppCore,
  title = AppCore?.config?.appName
) {
  const appName =
    safeText(
      AppCore?.config?.appName,
      "Onion Support"
    );

  const cleanTitle =
    safeText(
      title,
      appName
    );

  const finalTitle =
    cleanTitle === appName
      ? appName
      : `${cleanTitle} · ${appName}`;

  try {
    if (
      typeof AppCore?.setDocumentTitle === "function"
    ) {
      AppCore.setDocumentTitle(cleanTitle);
      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      "setDocumentTitle failed",
      error
    );
  }

  if (!isBrowser()) {
    return false;
  }

  try {
    document.title = finalTitle;
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ACTIVE MENU
========================================================= */

function getSpaLinks(AppCore) {
  if (!isBrowser()) {
    return [];
  }

  try {
    const fromCore =
      AppCore?.utils?.qsa?.(
        "a[data-spa]"
      );

    if (fromCore) {
      return Array.from(fromCore);
    }
  } catch {}

  try {
    return Array.from(
      document.querySelectorAll("a[data-spa]")
    );
  } catch {
    return [];
  }
}

function resolveLinkCanonical(AppCore, link) {
  try {
    const href =
      link?.getAttribute?.("href") || "";

    if (!href) {
      return "";
    }

    const resolvedHref =
      resolveSpaHref(
        AppCore,
        href
      );

    return normalizeCanonicalPath(
      AppCore,
      resolvedHref
    );
  } catch {
    return "";
  }
}

export function setActiveMenu(
  AppCore,
  pathname = "/"
) {
  if (!isBrowser()) {
    return false;
  }

  let currentCanonical = "/";

  try {
    currentCanonical =
      normalizeCanonicalPath(
        AppCore,
        pathname || "/"
      );
  } catch {
    currentCanonical = "/";
  }

  const links =
    getSpaLinks(AppCore);

  links.forEach((link) => {
    if (!link) return;

    const hrefCanonical =
      resolveLinkCanonical(
        AppCore,
        link
      );

    const active =
      Boolean(
        hrefCanonical &&
          hrefCanonical === currentCanonical
      );

    safeClassToggle(
      link,
      "active",
      active
    );

    safeClassToggle(
      link,
      "is-active",
      active
    );

    safeClassToggle(
      link,
      "router-active",
      active
    );

    if (active) {
      safeSetAttribute(
        link,
        "aria-current",
        "page"
      );
    } else {
      safeRemoveAttribute(
        link,
        "aria-current"
      );
    }
  });

  safeEmit(
    AppCore,
    "router:shell:active-menu",
    {
      canonicalPath: currentCanonical,
      count: links.length,
    }
  );

  return true;
}

/* =========================================================
   SHELL MODE
========================================================= */

function syncShellState(
  AppCore,
  {
    hidden = false,
    routePath = null,
    mode = "shell",
  } = {}
) {
  try {
    AppCore?.setState?.({
      shellVisible: !hidden,
      shellHidden: hidden,
      routeMode: mode,
    });
  } catch {
    try {
      if (AppCore?.state) {
        AppCore.state.shellVisible = !hidden;
        AppCore.state.shellHidden = hidden;
        AppCore.state.routeMode = mode;
      }
    } catch {}
  }

  try {
    if (isFn(AppCore?.setShellVisibility)) {
      AppCore.setShellVisibility(!hidden);
    }
  } catch {}

  return {
    hidden,
    visible: !hidden,
    route: routePath,
    mode,
  };
}

function hideLoaderIfNeeded(AppCore, hideShell = false) {
  if (!hideShell) {
    return false;
  }

  const {
    loader,
    body,
    html,
  } = getShellElements(AppCore);

  try {
    html?.classList?.remove?.("app-loading");
    body?.classList?.remove?.("app-loading", "loading");
  } catch {}

  if (!loader) {
    return false;
  }

  try {
    loader.classList.remove(
      "is-visible",
      "app-loader--visible"
    );

    loader.classList.add(
      "is-hidden",
      "has-hidden"
    );

    loader.setAttribute(
      "aria-hidden",
      "true"
    );

    loader.setAttribute(
      "aria-busy",
      "false"
    );

    loader.dataset.loaderVisible = "false";
    loader.hidden = true;
  } catch {}

  return true;
}

export function setShellMode(
  AppCore,
  route = null
) {
  const hideShell =
    routeRequestsHiddenShell(route);

  const authScreen =
    routeRequestsAuthScreen(route);

  const routePath =
    safeText(
      route?.path,
      ""
    ) || null;

  const mode =
    hideShell ? "auth" : "shell";

  const {
    html,
    body,
    sidebar,
    topbar,
    tablehead,
    tableheadContainer,
    mobileToggle,
    shell,
    main,
    appContent,
    viewContainer,
  } = getShellElements(AppCore);

  /*
    El shell raíz se mantiene disponible.
    Lo que se oculta son las piezas laterales/superiores.
    Esto evita layouts partidos si #app-shell contiene #view-container.
  */
  safeToggleHidden(shell, false);
  safeToggleHidden(main, false);
  safeToggleHidden(appContent, false);
  safeToggleHidden(viewContainer, false);

  safeSetBusy(shell, false);
  safeSetBusy(main, false);
  safeSetBusy(appContent, false);
  safeSetBusy(viewContainer, false);

  safeToggleHidden(
    sidebar,
    hideShell
  );

  safeToggleHidden(
    topbar,
    hideShell
  );

  const hasTableheadContent =
    Boolean(
      tableheadContainer &&
        safeText(
          tableheadContainer.innerHTML,
          ""
        )
    );

  safeToggleHidden(
    tablehead,
    hideShell || !hasTableheadContent
  );

  safeToggleHidden(
    tableheadContainer,
    hideShell
  );

  if (mobileToggle) {
    safeToggleHidden(
      mobileToggle,
      hideShell
    );

    safeSetAttribute(
      mobileToggle,
      "aria-expanded",
      hideShell ? "false" : "true"
    );

    safeSetAttribute(
      mobileToggle,
      "aria-hidden",
      hideShell ? "true" : "false"
    );
  }

  if (html) {
    safeClassRemove(
      html,
      "app-booting",
      "app-loading"
    );

    safeClassToggle(
      html,
      "app-ready",
      true
    );

    safeClassToggle(
      html,
      "route-shell-hidden",
      hideShell
    );

    safeClassToggle(
      html,
      "route-shell-visible",
      !hideShell
    );

    safeDataset(
      html,
      "shell",
      hideShell ? "hidden" : "visible"
    );

    safeDataset(
      html,
      "routeMode",
      mode
    );
  }

  if (body) {
    safeClassRemove(
      body,
      "app-booting",
      "app-loading",
      "loading"
    );

    safeClassToggle(
      body,
      "app-ready",
      true
    );

    safeClassToggle(
      body,
      "route-auth",
      hideShell
    );

    safeClassToggle(
      body,
      "route-shell-hidden",
      hideShell
    );

    safeClassToggle(
      body,
      "route-shell-visible",
      !hideShell
    );

    safeClassToggle(
      body,
      "auth-screen",
      authScreen
    );

    safeClassToggle(
      body,
      "shell-visible",
      !hideShell
    );

    safeClassToggle(
      body,
      "shell-hidden",
      hideShell
    );

    if (!hideShell) {
      safeClassRemove(
        body,
        "login-no-scroll"
      );
    }

    safeDataset(
      body,
      "shell",
      hideShell ? "hidden" : "visible"
    );

    safeDataset(
      body,
      "shellHidden",
      hideShell ? "true" : "false"
    );

    safeDataset(
      body,
      "routeMode",
      mode
    );

    safeDataset(
      body,
      "currentRoute",
      routePath
    );
  }

  hideLoaderIfNeeded(
    AppCore,
    hideShell
  );

  const state =
    syncShellState(
      AppCore,
      {
        hidden: hideShell,
        routePath,
        mode,
      }
    );

  safeEmit(
    AppCore,
    "router:shell:change",
    {
      ...state,
      authScreen,
      route: routePath,
      hasSidebar: Boolean(sidebar),
      hasTopbar: Boolean(topbar),
      hasTablehead: Boolean(tablehead),
      hasShell: Boolean(shell),
      source: "router.shell",
    }
  );

  return state;
}

/* =========================================================
   DEBUG
========================================================= */

export function getShellSnapshot(AppCore) {
  const elements =
    getShellElements(AppCore);

  return {
    route:
      AppCore?.state?.route || null,

    publicPath:
      AppCore?.state?.publicPath || null,

    shellVisible:
      AppCore?.state?.shellVisible ?? null,

    shellHidden:
      AppCore?.state?.shellHidden ?? null,

    routeMode:
      AppCore?.state?.routeMode || null,

    dom: {
      bodyClasses:
        elements.body?.className || "",

      htmlClasses:
        elements.html?.className || "",

      bodyShell:
        elements.body?.dataset?.shell || null,

      htmlShell:
        elements.html?.dataset?.shell || null,

      hasShell:
        Boolean(elements.shell),

      hasMain:
        Boolean(elements.main),

      hasAppContent:
        Boolean(elements.appContent),

      hasViewContainer:
        Boolean(elements.viewContainer),

      hasSidebar:
        Boolean(elements.sidebar),

      hasTopbar:
        Boolean(elements.topbar),

      hasTablehead:
        Boolean(elements.tablehead),

      hasTableheadContainer:
        Boolean(elements.tableheadContainer),

      hasMobileToggle:
        Boolean(elements.mobileToggle),

      hasLoader:
        Boolean(elements.loader),

      sidebarHidden:
        Boolean(elements.sidebar?.hidden),

      topbarHidden:
        Boolean(elements.topbar?.hidden),

      tableheadHidden:
        Boolean(elements.tablehead?.hidden),

      tableheadContainerHidden:
        Boolean(elements.tableheadContainer?.hidden),

      shellHidden:
        Boolean(elements.shell?.hidden),

      viewHidden:
        Boolean(elements.viewContainer?.hidden),
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  getShellElements,

  clearDynamicContainers,
  setDocumentTitle,
  setActiveMenu,
  setShellMode,

  getShellSnapshot,
};
