/* =========================================================
   Onion Support - Private Runtime UI
   Archivo: /src/features/private-runtime-ui/index.js

   Única puerta de entrada del chrome privado:
   - Sidebar, Topbar, AppChrome y EntityOverlay sólo se importan tras Auth.
   - Las rutas públicas/anónimas no descargan ni inicializan runtime privado.
   - Router activa este runtime después del guard de una ruta privada.
   - destroy() no provoca imports tardíos: sólo limpia módulos ya cargados.
========================================================= */

import { AppCore } from "../../core/index.js";

export const PRIVATE_RUNTIME_UI_VERSION =
  "private-runtime-ui.v1-auth-private-only";

let SidebarUI = null;
let TopbarUI = null;
let AppChromeUI = null;
let EntityOverlayUI = null;
let ensurePromise = null;
let active = false;

function isFunction(value) {
  return typeof value === "function";
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

async function loadPrivateModules() {
  const [sidebarModule, topbarModule, chromeModule, overlayModule] =
    await Promise.all([
      import("../../ui/sidebar/index.js"),
      import("../../ui/topbar/index.js"),
      import("../../ui/chrome/index.js"),
      import("../entity-overlay/index.js"),
    ]);

  SidebarUI = sidebarModule?.SidebarUI || sidebarModule?.default || null;
  TopbarUI = topbarModule?.TopbarUI || topbarModule?.default || null;
  AppChromeUI = chromeModule?.AppChromeUI || chromeModule?.default || null;
  EntityOverlayUI = overlayModule?.EntityOverlay || overlayModule?.default || null;
  return Boolean(SidebarUI && TopbarUI);
}

async function initModule(module, payload = {}) {
  if (!module || !isFunction(module.init)) return false;
  const result = await module.init(payload);
  return result !== false;
}

export async function ensurePrivateRuntimeUI(context = {}) {
  if (!isAuthenticated(context)) return false;

  if (active && SidebarUI && TopbarUI) {
    try { SidebarUI.sync?.(context); } catch {}
    try { TopbarUI.sync?.(context); } catch {}
    try { AppChromeUI?.sync?.(); } catch {}
    return true;
  }

  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
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
    await initModule(EntityOverlayUI, payload);
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

  destroyLoaded(EntityOverlayUI);
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
    loading: Boolean(ensurePromise),
    loaded: Object.freeze({
      sidebar: Boolean(SidebarUI),
      topbar: Boolean(TopbarUI),
      chrome: Boolean(AppChromeUI),
      entityOverlay: Boolean(EntityOverlayUI),
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
