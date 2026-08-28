from pathlib import Path
import re


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text)


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


private_runtime = r'''/* =========================================================
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
'''
write("src/features/private-runtime-ui/index.js", private_runtime)

# App owns Auth/Toast boot only. Router owns private runtime activation.
path = "src/app/index.js"
text = read(path)
text = text.replace('export const APP_VERSION =\n  "app.minimal.v7-global-entity-overlay";', 'export const APP_VERSION =\n  "app.minimal.v8-private-runtime-after-guard";')
text = re.sub(r'\nlet SidebarUI = null;\nlet TopbarUI = null;\nlet EntityOverlayUI = null;\n\nlet authLoadPromise = null;\nlet toastLoadPromise = null;\nlet sidebarLoadPromise = null;\nlet topbarLoadPromise = null;\nlet entityOverlayLoadPromise = null;', '\nlet authLoadPromise = null;\nlet toastLoadPromise = null;', text, count=1)
text = re.sub(r'\nasync function ensureSidebarUI\(\) \{[\s\S]*?\n\}\n\nasync function ensureTopbarUI\(\) \{[\s\S]*?\n\}\n\nasync function ensureEntityOverlayUI\(\) \{[\s\S]*?\n\}', '', text, count=1)
text = text.replace('    Toast,\n    SidebarUI,\n    TopbarUI,\n    EntityOverlay: EntityOverlayUI,', '    Toast,')
text = re.sub(r'\nasync function initGlobalUI\(\n  payload = \{\}\n\) \{[\s\S]*?\n\}\n\n\nasync function initEntityOverlay\(\n  payload = \{\}\n\) \{[\s\S]*?\n\}\n', '\n', text, count=1)
text = re.sub(r'\n    /\*\n      El chrome privado no aporta nada a una visita pública anónima\.[\s\S]*?\n    \}\n\n    notifyPublicHomeSessionHydrated\(\);', '\n    /* La home pública nunca activa Sidebar/Topbar, incluso con sesión restaurada. */\n    void restored;\n\n    notifyPublicHomeSessionHydrated();', text, count=1)
old = '''  /*
    Orden contractual para rutas no fast-path:

    1. Core.
    2. Toast opcional.
    3. Auth.init sin restore.
    4. Auth.restoreSession.
    5. Sidebar/Topbar.
    6. Router.start con URL real.
    7. Loader hidden / App ready.
  */'''
new = '''  /*
    Orden contractual para rutas no fast-path:

    1. Core.
    2. Toast opcional.
    3. Auth.init sin restore.
    4. Auth.restoreSession.
    5. Router.start con URL real.
    6. Router activa runtime privado sólo tras guard Auth+ruta privada.
    7. Loader hidden / App ready.

    Login/reset/activación no importan Sidebar, Topbar, AppChrome ni EntityOverlay.
  */'''
if old not in text: raise SystemExit("app boot comment anchor missing")
text = text.replace(old, new, 1)
old = '''  await restoreAuth(
    payload
  );

  await initGlobalUI(
    payload
  );

  if (lastRestore?.authenticated === true) {
    await initEntityOverlay(
      payload
    );
  }

  await startRouter('''
if old not in text: raise SystemExit("app init private anchor missing")
text = text.replace(old, '''  await restoreAuth(
    payload
  );

  await startRouter(''', 1)
text = re.sub(r'\n\s*sidebar:\n\s*Boolean\(\n\s*SidebarUI\n\s*\),\n\n\s*topbar:\n\s*Boolean\(\n\s*TopbarUI\n\s*\),', '\n        privateRuntimeOwnedByRouter:\n          true,', text, count=1)
write(path, text)

# AppChrome is not pre-router/global public work.
path = "src/app/enhancements.js"
text = read(path)
text = text.replace('export const APP_ENHANCEMENTS_VERSION =\n  "app.enhancements.v17-incidencias-live-media";', 'export const APP_ENHANCEMENTS_VERSION =\n  "app.enhancements.v18-no-private-chrome-preauth";')
old = '''  Object.freeze({
    key: "app-chrome",
    load: () => import("../ui/chrome/index.js"),
  }),
'''
if old not in text: raise SystemExit("app-chrome pre-router anchor missing")
text = text.replace(old, '', 1)
write(path, text)

# Router: private UI after access guard, never before.
path = "src/router/index.js"
text = read(path)
if '../features/private-runtime-ui/index.js' not in text:
    text = text.replace('import RouteStyles from "./styles.js";', 'import RouteStyles from "./styles.js";\nimport {\n  ensurePrivateRuntimeUI,\n  destroyPrivateRuntimeUI,\n} from "../features/private-runtime-ui/index.js";', 1)
text = text.replace('export const ROUTER_VERSION =\n  "router.minimal.v15-public-auth-short-circuit";', 'export const ROUTER_VERSION =\n  "router.minimal.v16-private-runtime-after-guard";')
anchor = '''/* =========================================================
   TRANSITION CANCELLATION
========================================================= */'''
helper = '''async function syncPrivateRuntimeForRoute(
  route = null,
  options = {}
) {
  if (!route || route.public === true) {
    if (!isAuthenticated()) {
      destroyPrivateRuntimeUI();
    }
    return true;
  }

  if (!isAuthenticated()) return false;

  return ensurePrivateRuntimeUI({
    AppCore,
    Auth: getAuth(),
    Router,
    route,
    source: options.source || "router",
  });
}

'''
if anchor not in text: raise SystemExit("router transition anchor missing")
text = text.replace(anchor, helper + anchor, 1)
old = '''    if (
      slugRedirect
    ) {
      return redirectTo(
        slugRedirect,
        options,
        "user-scope"
      );
    }

    return await renderRoute('''
new = '''    if (
      slugRedirect
    ) {
      return redirectTo(
        slugRedirect,
        options,
        "user-scope"
      );
    }

    const privateRuntimeStartedAt = performanceNow();
    const privateRuntimeReady = await syncPrivateRuntimeForRoute(
      match.route,
      options
    );

    if (
      match.route?.public !== true &&
      privateRuntimeReady !== true
    ) {
      return {
        ok: false,
        reason: "private-runtime-unavailable",
        canonicalPath: match.canonicalPath,
        publicPath: stateSafePublicPath(match),
      };
    }

    recordTransitionPhase(
      transition,
      match.route,
      "private-runtime",
      privateRuntimeStartedAt
    );

    if (!transitionIsCurrent(transition)) {
      return {
        ok: false,
        skipped: true,
        reason: "stale-private-runtime",
      };
    }

    return await renderRoute('''
if old not in text: raise SystemExit("router guard/render anchor missing")
text = text.replace(old, new, 1)
old = '''function goAfterLogin(
  fallback = HOME_PATH,
  options = {}
) {
  return replace(
    normalizePostLoginTarget(
      fallback
    ),
    {
      ...options,

      source:
        "login",
    }
  );
}'''
new = '''function goAfterLogin(
  fallback = HOME_PATH,
  options = {}
) {
  /* Login cambia autorización sin recargar: Core debe estar sincronizado. */
  authCall("syncAuthState", false);

  return replace(
    normalizePostLoginTarget(
      fallback
    ),
    {
      ...options,
      force: true,
      source: "login",
    }
  );
}'''
if old not in text: raise SystemExit("goAfterLogin anchor missing")
text = text.replace(old, new, 1)
write(path, text)

# Login: synchronize auth and recover only if a valid session remains on /login.
path = "src/views/public/login/index.js"
text = read(path)
text = text.replace('export const LOGIN_VIEW_VERSION = "login.view.public.controller.v5-portal-2026";', 'export const LOGIN_VIEW_VERSION = "login.view.public.controller.v6-post-auth-transition";')
old = '''      const navigation = await goAfterLogin(result || {}, {
        ...context,
        Auth: auth,
      });

      if (!mounted) return false;

      if (navigation === false || navigation?.ok === false) {
        throw new Error(
          "No se pudo completar la navegación tras el login."
        );
      }

      return true;'''
new = '''      auth.syncAuthState?.();

      const target = resolvePostLoginTarget(result || {}, auth);
      let navigation = await goAfterLogin(result || {}, {
        ...context,
        Auth: auth,
      });

      if (!mounted) return false;

      if (
        isBrowser() &&
        auth.isAuthenticated?.() === true &&
        window.location.pathname === "/login"
      ) {
        const router = getRouter(context);

        if (isFunction(router?.replace)) {
          navigation = await router.replace(target, {
            source: "login.view.recovery",
            replaceState: true,
            force: true,
          });
        }
      }

      if (!mounted) return false;

      if (navigation === false || navigation?.ok === false) {
        throw new Error(
          "No se pudo completar la navegación tras el login."
        );
      }

      if (
        isBrowser() &&
        auth.isAuthenticated?.() === true &&
        window.location.pathname === "/login"
      ) {
        window.location.replace(target);
      }

      return true;'''
if old not in text: raise SystemExit("login navigation anchor missing")
text = text.replace(old, new, 1)
write(path, text)

# Design tokens: boot/public have no private chrome footprint.
path = "src/css/tokens/variables.css"
text = read(path)
text = text.replace('  --app-sidebar-current-width: var(--sidebar-width);', '  --app-sidebar-current-width: 0px;', 1)
text = text.replace('  --app-offset-topbar: calc(var(--topbar-height) + var(--app-safe-top));', '  --app-offset-topbar: 0px;', 1)
write(path, text)

path = "src/css/core/layout.css"
text = read(path)
old = '''  --layout-main-inset-top:
    var(
      --app-offset-topbar,
      calc(
        var(--topbar-height, 58px) +
        var(--layout-safe-top)
      )
    );

  --layout-main-inset-left:
    var(
      --app-sidebar-current-width,
      var(--sidebar-width, 260px)
    );'''
new = '''  /* Chrome privado es opt-in. Boot/auth/public empiezan a viewport completo. */
  --layout-main-inset-top:
    var(--app-offset-topbar, 0px);

  --layout-main-inset-left:
    var(--app-sidebar-current-width, 0px);'''
if old not in text: raise SystemExit("layout inset anchor missing")
text = text.replace(old, new, 1)
text = text.replace('''  --app-sidebar-current-width:
    var(--sidebar-width, 260px);''', '  --app-sidebar-current-width: 0px;', 1)
text = text.replace('body[data-chrome="hidden"]:not([data-route-mode="boot"]),\n  html[data-chrome="hidden"]:not([data-route-mode="boot"]) body', 'body[data-chrome="hidden"],\n  html[data-chrome="hidden"] body')
write(path, text)

path = "src/css/layout/chrome.css"
text = read(path)
text = text.replace('--chrome-sidebar-offset: var(--chrome-sidebar-open-width);', '--chrome-sidebar-offset: 0px;', 1)
old = '''body {
  --chrome-sidebar-offset: var(--chrome-sidebar-open-width);

  /* Compatibilidad: layout.css/topbar.css consumen estas variables. */
  --app-sidebar-current-width: var(--chrome-sidebar-offset);
  --layout-main-inset-left: var(--chrome-sidebar-offset);
  --topbar-effective-sidebar-offset: var(--chrome-sidebar-offset);
}

body:is(
  .sidebar-collapsed,
  [data-sidebar-state="collapsed"],
  [data-sidebar-open="false"]
) {
  --chrome-sidebar-offset: var(--chrome-sidebar-collapsed-width);
}

body:is(
  .sidebar-hidden,
  [data-sidebar-state="hidden"],
  [data-sidebar-hidden="true"]
) {
  --chrome-sidebar-offset: 0px;
}'''
new = '''body {
  --chrome-sidebar-offset: 0px;
  --app-sidebar-current-width: 0px;
  --layout-main-inset-left: 0px;
  --topbar-effective-sidebar-offset: 0px;
  --app-offset-topbar: 0px;
  --layout-main-inset-top: 0px;
}

body[data-route-mode="app"][data-chrome="visible"] {
  --chrome-sidebar-offset: var(--chrome-sidebar-open-width);
  --app-sidebar-current-width: var(--chrome-sidebar-offset);
  --layout-main-inset-left: var(--chrome-sidebar-offset);
  --topbar-effective-sidebar-offset: var(--chrome-sidebar-offset);
  --app-offset-topbar: var(--chrome-topbar-height);
  --layout-main-inset-top: var(--chrome-topbar-height);
}

body[data-route-mode="app"][data-chrome="visible"]:is(
  .sidebar-collapsed,
  [data-sidebar-state="collapsed"],
  [data-sidebar-open="false"]
) {
  --chrome-sidebar-offset: var(--chrome-sidebar-collapsed-width);
}

body[data-route-mode="app"][data-chrome="visible"]:is(
  .sidebar-hidden,
  [data-sidebar-state="hidden"],
  [data-sidebar-hidden="true"]
) {
  --chrome-sidebar-offset: 0px;
}'''
if old not in text: raise SystemExit("chrome body contract anchor missing")
text = text.replace(old, new, 1)
write(path, text)

contract = r'''#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(path, "utf8");
const [app, router, login, enhancements, layout, chrome, variables, privateRuntime] = await Promise.all([
  read("src/app/index.js"),
  read("src/router/index.js"),
  read("src/views/public/login/index.js"),
  read("src/app/enhancements.js"),
  read("src/css/core/layout.css"),
  read("src/css/layout/chrome.css"),
  read("src/css/tokens/variables.css"),
  read("src/features/private-runtime-ui/index.js"),
]);
assert.doesNotMatch(app, /await\s+initGlobalUI\s*\(/);
assert.doesNotMatch(app, /ensureSidebarUI|ensureTopbarUI|ensureEntityOverlayUI/);
assert.doesNotMatch(enhancements, /key:\s*"app-chrome"/);
assert.match(privateRuntime, /ensurePrivateRuntimeUI/);
assert.match(privateRuntime, /isAuthenticated\(context\)/);
assert.match(privateRuntime, /import\("\.\.\/\.\.\/ui\/sidebar\/index\.js"\)/);
assert.match(privateRuntime, /import\("\.\.\/\.\.\/ui\/topbar\/index\.js"\)/);
assert.match(privateRuntime, /import\("\.\.\/\.\.\/ui\/chrome\/index\.js"\)/);
assert.match(privateRuntime, /import\("\.\.\/entity-overlay\/index\.js"\)/);
assert.match(router, /syncPrivateRuntimeForRoute/);
assert.match(router, /await\s+syncPrivateRuntimeForRoute/);
assert.match(router, /authCall\("syncAuthState",\s*false\)/);
assert.match(router, /force:\s*true,[\s\S]*source:\s*"login"/);
assert.match(login, /auth\.syncAuthState\?\.\(\)/);
assert.match(login, /source:\s*"login\.view\.recovery"/);
assert.match(login, /window\.location\.replace\(target\)/);
assert.match(variables, /--app-sidebar-current-width:\s*0px;/);
assert.match(variables, /--app-offset-topbar:\s*0px;/);
assert.match(layout, /--layout-main-inset-left:\s*var\(--app-sidebar-current-width,\s*0px\);/);
assert.match(layout, /body\[data-chrome="hidden"\]/);
assert.doesNotMatch(layout, /data-chrome="hidden"\]:not\(\[data-route-mode="boot"\]\)/);
assert.match(chrome, /body\s*\{[\s\S]*--chrome-sidebar-offset:\s*0px;/);
assert.match(chrome, /body\[data-route-mode="app"\]\[data-chrome="visible"\]\s*\{[\s\S]*--chrome-sidebar-offset:\s*var\(--chrome-sidebar-open-width\)/);
assert.doesNotMatch(chrome, /body\s*\{\s*--chrome-sidebar-offset:\s*var\(--chrome-sidebar-open-width\)/);
console.log("Private runtime/auth layout contract: PASS");
'''
write(".github/scripts/private_runtime_auth_contract.mjs", contract)

path = ".github/ci/validate_spa_contracts.sh"
text = read(path)
needle = 'node --experimental-default-type=module .github/scripts/shell_runtime_contract.mjs'
if 'private_runtime_auth_contract.mjs' not in text:
    if needle in text:
        text = text.replace(needle, needle + '\nnode --experimental-default-type=module .github/scripts/private_runtime_auth_contract.mjs', 1)
    else:
        text += '\nnode --experimental-default-type=module .github/scripts/private_runtime_auth_contract.mjs\n'
write(path, text)

print("private runtime/auth lifecycle refactor applied")
