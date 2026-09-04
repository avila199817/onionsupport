/* =========================================================
   Onion Support - Private Runtime UI
   Archivo: /src/features/private-runtime-ui/index.js

   Única puerta de entrada del chrome privado:
   - El build carga CSS, Sidebar, Topbar, AppChrome y overlays tras Auth.
   - AvatarSystem sincroniza avatares ya montados y todo DOM posterior.
   - El bridge de técnico reutiliza únicamente fuentes de imagen ya validadas
     por AvatarSystem para la misma identidad.
   - HomeEntityModal se instala antes de EntityOverlay para fijar el origen.
   - Precarga de entidad se activa sólo tras Auth y nunca captura navegación.
   - Las rutas públicas/anónimas del artefacto no descargan runtime privado.
   - El source legacy conserva app.css completo para rollback y desarrollo.
   - Si falla el chunk CSS compilado, existe fallback same-origin CSP-clean.
   - Router activa este runtime después del guard de una ruta privada.
   - destroy() no provoca imports tardíos: sólo limpia módulos ya cargados.
========================================================= */

import { AppCore } from "../../core/index.js";

export const PRIVATE_RUNTIME_UI_VERSION =
  "private-runtime-ui.v7-technician-avatar-bridge";

const PRIVATE_STYLESHEET_HREF =
  "/src/css/private.css";

const PRIVATE_STYLESHEET_MARKER =
  "data-onion-private-styles";

let SidebarUI = null;
let TopbarUI = null;
let AppChromeUI = null;
let AvatarSystemUI = null;
let IncidenciasTechnicianAvatarBridgeUI = null;
let HomeEntityModalUI = null;
let EntityOverlayUI = null;
let EntityIntentPreloadUI = null;
let stylesheetPromise = null;
let stylesheetReady = false;
let ensurePromise = null;
let active = false;

function isFunction(value) {
  return typeof value === "function";
}

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isProductionBuild() {
  return import.meta.env?.PROD === true;
}

function getAuth(context = {}) {
  try {
    return (
      context.Auth ||
      context.auth ||
      AppCore.getModule?.("auth") ||
      AppCore.auth ||
      AppCore.Auth ||
      null
    );
  } catch {
    return context.Auth || context.auth || null;
  }
}

function isAuthenticated(context = {}) {
  try {
    return getAuth(context)?.isAuthenticated?.() === true;
  } catch {
    return false;
  }
}

function existingPrivateStylesheet() {
  if (!isBrowser()) return null;

  return (
    document.querySelector(
      `link[${PRIVATE_STYLESHEET_MARKER}="true"]`
    ) ||
    null
  );
}

function loadFallbackPrivateStylesheet() {
  if (!isBrowser()) return Promise.resolve(false);

  const existing = existingPrivateStylesheet();
  if (existing?.sheet) return Promise.resolve(true);

  return new Promise((resolve, reject) => {
    const link =
      existing ||
      document.createElement("link");

    let settled = false;

    const cleanup = () => {
      link.removeEventListener("load", onLoad);
      link.removeEventListener("error", onError);
    };

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const onLoad = () => {
      link.setAttribute(
        PRIVATE_STYLESHEET_MARKER,
        "true"
      );
      finish(resolve, true);
    };

    const onError = () => {
      if (!existing && link.parentNode) {
        try { link.remove(); } catch {}
      }

      const error =
        new Error(
          "No se pudo cargar el CSS privado."
        );
      error.code =
        "PRIVATE_STYLESHEET_LOAD_FAILED";
      finish(reject, error);
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
      link.rel = "stylesheet";
      link.href = PRIVATE_STYLESHEET_HREF;
      link.setAttribute(
        PRIVATE_STYLESHEET_MARKER,
        "true"
      );
      document.head.appendChild(link);
    }

    if (existing?.sheet) {
      queueMicrotask(onLoad);
    }
  });
}

async function loadBuiltPrivateStylesheet() {
  await import("../../css/private.css");
  return true;
}

async function ensurePrivateStylesheet() {
  if (stylesheetReady) return true;
  if (stylesheetPromise) return stylesheetPromise;

  stylesheetPromise = (async () => {
    if (!isProductionBuild()) {
      /*
       * Source/legacy conserva los imports privados dentro de app.css.
       * No se añade otro <link> para evitar descargar o aplicar CSS duplicado.
       */
      stylesheetReady = true;
      return true;
    }

    try {
      if (await loadBuiltPrivateStylesheet()) {
        stylesheetReady = true;
        return true;
      }
    } catch {
      // El artefacto conserva /src/css/private.css como recuperación acotada.
    }

    const loaded =
      await loadFallbackPrivateStylesheet();

    stylesheetReady =
      loaded === true;

    return stylesheetReady;
  })().finally(() => {
    stylesheetPromise = null;
  });

  return stylesheetPromise;
}

async function loadPrivateModules() {
  const [
    sidebarModule,
    topbarModule,
    chromeModule,
    avatarSystemModule,
    technicianAvatarBridgeModule,
    homeEntityModalModule,
    overlayModule,
    entityIntentPreloadModule,
  ] = await Promise.all([
    import("../../ui/sidebar/index.js"),
    import("../../ui/topbar/index.js"),
    import("../../ui/chrome/index.js"),
    import("../avatar-system/index.js"),
    import("../incidencias-technician-avatar-bridge/index.js"),
    import("../home-entity-modal/index.js"),
    import("../entity-overlay/index.js"),
    import("../entity-intent-preload/index.js"),
  ]);

  SidebarUI = sidebarModule?.SidebarUI || sidebarModule?.default || null;
  TopbarUI = topbarModule?.TopbarUI || topbarModule?.default || null;
  AppChromeUI = chromeModule?.AppChromeUI || chromeModule?.default || null;
  AvatarSystemUI =
    avatarSystemModule?.AvatarSystem ||
    avatarSystemModule?.default ||
    null;
  IncidenciasTechnicianAvatarBridgeUI =
    technicianAvatarBridgeModule?.IncidenciasTechnicianAvatarBridge ||
    technicianAvatarBridgeModule?.default ||
    null;
  HomeEntityModalUI =
    homeEntityModalModule?.HomeEntityModal ||
    homeEntityModalModule?.default ||
    null;
  EntityOverlayUI = overlayModule?.EntityOverlay || overlayModule?.default || null;
  EntityIntentPreloadUI =
    entityIntentPreloadModule?.EntityIntentPreload ||
    entityIntentPreloadModule?.default ||
    null;

  return Boolean(
    SidebarUI &&
    TopbarUI &&
    AvatarSystemUI &&
    IncidenciasTechnicianAvatarBridgeUI &&
    HomeEntityModalUI &&
    EntityOverlayUI &&
    EntityIntentPreloadUI
  );
}

async function initModule(module, payload = {}) {
  if (!module || !isFunction(module.init)) return false;
  const result = await module.init(payload);
  return result !== false;
}

export async function ensurePrivateRuntimeUI(context = {}) {
  if (!isAuthenticated(context)) return false;

  if (
    active &&
    stylesheetReady &&
    SidebarUI &&
    TopbarUI &&
    AvatarSystemUI &&
    IncidenciasTechnicianAvatarBridgeUI &&
    HomeEntityModalUI &&
    EntityOverlayUI &&
    EntityIntentPreloadUI
  ) {
    try { SidebarUI.sync?.(context); } catch {}
    try { TopbarUI.sync?.(context); } catch {}
    try { AppChromeUI?.sync?.(); } catch {}
    try { AvatarSystemUI.sync?.(document); } catch {}
    try { IncidenciasTechnicianAvatarBridgeUI.sync?.(document); } catch {}
    return true;
  }

  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    if (!isAuthenticated(context)) return false;

    await ensurePrivateStylesheet();
    if (!isAuthenticated(context)) return false;

    await loadPrivateModules();
    if (!isAuthenticated(context)) return false;

    const payload = {
      ...context,
      AppCore,
      core: AppCore,
      Auth: getAuth(context),
    };

    await initModule(SidebarUI, payload);
    await initModule(TopbarUI, payload);
    await initModule(AppChromeUI, payload);

    /*
      Sidebar y Topbar ya existen en este punto. AvatarSystem los sincroniza y
      observa después todo el DOM dinámico de las vistas/modales privadas.
    */
    await initModule(AvatarSystemUI, payload);

    /*
      El bridge se monta sólo después de AvatarSystem: no calcula identidad ni
      estado visual, únicamente reutiliza una imagen global ya validada para la
      misma persona y vuelve a entregar el host a la autoridad global.
    */
    await initModule(IncidenciasTechnicianAvatarBridgeUI, payload);

    /*
      Orden contractual: Home corta su click in-place antes de que el overlay
      global pueda convertirlo en una navegación al owner.
    */
    await initModule(HomeEntityModalUI, payload);
    await initModule(EntityOverlayUI, payload);
    await initModule(EntityIntentPreloadUI, payload);

    active = true;
    return true;
  })().finally(() => {
    ensurePromise = null;
  });

  return ensurePromise;
}

function destroyLoaded(module) {
  if (!module) return false;
  try {
    const fn = module.destroy || module.cleanup || module.dispose;
    if (isFunction(fn)) {
      fn.call(module);
      return true;
    }
  } catch {}
  return false;
}

export function destroyPrivateRuntimeUI() {
  if (ensurePromise) return false;

  destroyLoaded(EntityIntentPreloadUI);
  destroyLoaded(HomeEntityModalUI);
  destroyLoaded(EntityOverlayUI);
  destroyLoaded(IncidenciasTechnicianAvatarBridgeUI);
  destroyLoaded(AvatarSystemUI);
  destroyLoaded(AppChromeUI);
  destroyLoaded(TopbarUI);
  destroyLoaded(SidebarUI);
  active = false;
  return true;
}

export function getPrivateRuntimeUISnapshot() {
  return Object.freeze({
    version: PRIVATE_RUNTIME_UI_VERSION,
    active,
    loading: Boolean(
      ensurePromise ||
      stylesheetPromise
    ),
    stylesReady: stylesheetReady,
    loaded: Object.freeze({
      styles: stylesheetReady,
      sidebar: Boolean(SidebarUI),
      topbar: Boolean(TopbarUI),
      chrome: Boolean(AppChromeUI),
      avatarSystem: Boolean(AvatarSystemUI),
      technicianAvatarBridge: Boolean(IncidenciasTechnicianAvatarBridgeUI),
      homeEntityModal: Boolean(HomeEntityModalUI),
      entityOverlay: Boolean(EntityOverlayUI),
      entityIntentPreload: Boolean(EntityIntentPreloadUI),
    }),
    policy: Object.freeze({
      authenticatedOnly: true,
      avatarSystemAfterChrome: true,
      avatarImageTransparencyAuthority: true,
      avatarFallbackOnlyWithoutValidImage: true,
      technicianAvatarUsesGlobalAuthority: true,
      technicianAvatarNoSyntheticSourceAuthority: true,
      homeEntityAuthorityBeforeGlobalOverlay: true,
      homeOwnerModalsStayInPlace: true,
    }),
  });
}

export const PrivateRuntimeUI = Object.freeze({
  version: PRIVATE_RUNTIME_UI_VERSION,
  ensure: ensurePrivateRuntimeUI,
  destroy: destroyPrivateRuntimeUI,
  getSnapshot: getPrivateRuntimeUISnapshot,
});

export default PrivateRuntimeUI;
