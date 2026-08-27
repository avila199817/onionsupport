from pathlib import Path


def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f"anchor not found: {label}")
    return text.replace(old, new, 1)


# Router: Auth deja de ser import crítico. Lo consume desde AppCore cuando se hidrata.
p = Path("src/router/index.js")
text = p.read_text(encoding="utf-8")
text = must_replace(
    text,
    'import { AppCore } from "../core/index.js";\nimport { Auth } from "../features/auth/index.js";\n',
    'import { AppCore } from "../core/index.js";\n',
    "router static auth import",
)
text = must_replace(
    text,
    '''function getAuth() {
  return (
    AppCore.auth ||
    AppCore.Auth ||
    Auth
  );
}
''',
    '''function getAuth() {
  try {
    return (
      AppCore.getModule?.("auth") ||
      AppCore.modules?.get?.("auth") ||
      AppCore.auth ||
      AppCore.Auth ||
      null
    );
  } catch {
    return (
      AppCore.auth ||
      AppCore.Auth ||
      null
    );
  }
}
''',
    "router getAuth",
)
p.write_text(text, encoding="utf-8")


# App: módulos privados pasan a imports dinámicos. Core + Router quedan críticos.
p = Path("src/app/index.js")
text = p.read_text(encoding="utf-8")
text = must_replace(
    text,
    '''import { AppCore } from "../core/index.js";
import { Auth } from "../features/auth/index.js";
import { Router } from "../router/index.js";

import Toast from "../ui/toast/index.js";
import SidebarUI from "../ui/sidebar/index.js";
import TopbarUI from "../ui/topbar/index.js";
''',
    '''import { AppCore } from "../core/index.js";
import { Router } from "../router/index.js";
''',
    "app static private imports",
)
text = must_replace(
    text,
    '  "app.minimal.v5-public-fast-boot";',
    '  "app.minimal.v6-public-lean-graph";',
    "app version",
)
text = must_replace(
    text,
    '''let bootPromise = null;
let publicHydrationPromise = null;
let ready = false;
let publicFastBoot = false;
''',
    '''let bootPromise = null;
let publicHydrationPromise = null;
let ready = false;
let publicFastBoot = false;

let Auth = null;
let Toast = null;
let SidebarUI = null;
let TopbarUI = null;

let authLoadPromise = null;
let toastLoadPromise = null;
let sidebarLoadPromise = null;
let topbarLoadPromise = null;
''',
    "app runtime module state",
)
anchor = '''function isFunction(value) {
  return (
    typeof value === "function"
  );
}
'''
helpers = anchor + '''
async function loadRuntimeModule(
  current = null,
  promise = null,
  loader = null,
  names = []
) {
  if (current) {
    return { value: current, promise };
  }

  const activePromise =
    promise ||
    Promise.resolve()
      .then(loader)
      .then((module) => {
        for (const name of names) {
          if (module?.[name]) {
            return module[name];
          }
        }
        return module?.default || module || null;
      });

  return {
    value: await activePromise,
    promise: activePromise,
  };
}

async function ensureAuth() {
  const loaded = await loadRuntimeModule(
    Auth,
    authLoadPromise,
    () => import("../features/auth/index.js"),
    ["Auth"]
  );
  authLoadPromise = loaded.promise;
  Auth = loaded.value;
  return Auth;
}

async function ensureToast() {
  const loaded = await loadRuntimeModule(
    Toast,
    toastLoadPromise,
    () => import("../ui/toast/index.js"),
    ["Toast"]
  );
  toastLoadPromise = loaded.promise;
  Toast = loaded.value;
  return Toast;
}

async function ensureSidebarUI() {
  const loaded = await loadRuntimeModule(
    SidebarUI,
    sidebarLoadPromise,
    () => import("../ui/sidebar/index.js"),
    ["SidebarUI"]
  );
  sidebarLoadPromise = loaded.promise;
  SidebarUI = loaded.value;
  return SidebarUI;
}

async function ensureTopbarUI() {
  const loaded = await loadRuntimeModule(
    TopbarUI,
    topbarLoadPromise,
    () => import("../ui/topbar/index.js"),
    ["TopbarUI"]
  );
  topbarLoadPromise = loaded.promise;
  TopbarUI = loaded.value;
  return TopbarUI;
}

function withRuntimeModules(payload = {}) {
  return {
    ...payload,
    Auth,
    Router,
    Toast,
    SidebarUI,
    TopbarUI,
  };
}
'''
text = must_replace(text, anchor, helpers, "runtime module helpers")
text = must_replace(
    text,
    '''    Auth,
    Router,

    Toast,
    SidebarUI,
    TopbarUI,
''',
    '''    Router,
''',
    "boot payload private refs",
)
text = must_replace(
    text,
    '''async function initToast(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.TOAST
  );

  const result =
    await call(
      Toast,
      "init",
      payload,
      false
    );
''',
    '''async function initToast(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.TOAST
  );

  const toast = await ensureToast();

  const result =
    await call(
      toast,
      "init",
      withRuntimeModules(payload),
      false
    );
''',
    "initToast dynamic",
)
text = must_replace(
    text,
    '''async function initAuth(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.AUTH
  );

  /*
    Auth se inicializa sin restaurar aquí.
    restoreSession() se ejecuta una sola vez después.
  */
  const result =
    await call(
      Auth,
      "init",
      {
        ...payload,
        ...AUTH_BOOT_OPTIONS,
        restoreOnBoot: false,
      },
      true
    );
''',
    '''async function initAuth(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.AUTH
  );

  const auth = await ensureAuth();

  /*
    Auth se inicializa sin restaurar aquí.
    restoreSession() se ejecuta una sola vez después.
  */
  const result =
    await call(
      auth,
      "init",
      {
        ...withRuntimeModules(payload),
        ...AUTH_BOOT_OPTIONS,
        restoreOnBoot: false,
      },
      true
    );
''',
    "initAuth dynamic",
)
text = must_replace(
    text,
    '''async function restoreAuth(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.RESTORE
  );

  /*
''',
    '''async function restoreAuth(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.RESTORE
  );

  const auth = await ensureAuth();

  /*
''',
    "restoreAuth ensure",
)
text = must_replace(
    text,
    '''    await call(
      Auth,
      "restoreSession",
      {
        ...payload,
        ...AUTH_BOOT_OPTIONS,
      },
''',
    '''    await call(
      auth,
      "restoreSession",
      {
        ...withRuntimeModules(payload),
        ...AUTH_BOOT_OPTIONS,
      },
''',
    "restoreAuth dynamic",
)
text = must_replace(
    text,
    '''async function initGlobalUI(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.UI
  );

  /*
    Se mantiene secuencial:
    no introducimos concurrencia entre módulos UI sin necesidad.
  */
  const sidebarResult =
    await call(
      SidebarUI,
      "init",
      payload,
      false
    );
''',
    '''async function initGlobalUI(
  payload = {}
) {
  setBootPhase(
    BOOT_PHASES.UI
  );

  /*
    Se mantiene secuencial:
    no introducimos concurrencia entre módulos UI sin necesidad.
  */
  const sidebar = await ensureSidebarUI();
  const sidebarResult =
    await call(
      sidebar,
      "init",
      withRuntimeModules(payload),
      false
    );
''',
    "sidebar dynamic",
)
text = must_replace(
    text,
    '''  const topbarResult =
    await call(
      TopbarUI,
      "init",
      payload,
      false
    );
''',
    '''  const topbar = await ensureTopbarUI();
  const topbarResult =
    await call(
      topbar,
      "init",
      withRuntimeModules(payload),
      false
    );
''',
    "topbar dynamic",
)
text = must_replace(
    text,
    '''      createRouterPayload(
        payload,
        rawInitialPath
      ),
''',
    '''      createRouterPayload(
        withRuntimeModules(payload),
        rawInitialPath
      ),
''',
    "router payload runtime modules",
)
text = must_replace(
    text,
    '''    Fast-path exclusivo de la home pública exacta (/):
    - Auth.init instala el contexto local, pero NO restaura por red.
    - Router puede renderizar public-home porque la ruta es pública.
    - El loader se retira antes de cualquier refresh/me remoto.
    - Toast, restore de sesión y chrome se hidratan después en background.
''',
    '''    Fast-path exclusivo de la home pública exacta (/):
    - NO descarga Auth, Toast, Sidebar ni Topbar antes del primer render.
    - Router trata la ruta pública como anónima si Auth aún no está registrado.
    - El loader se retira antes de cualquier módulo privado o refresh/me remoto.
    - Auth/Toast/UI se descargan e hidratan después en background.
''',
    "fast path comment",
)
text = must_replace(
    text,
    '''  if (publicFastBoot) {
    await initAuth(
      payload
    );

    await startRouter(
''',
    '''  if (publicFastBoot) {
    await startRouter(
''',
    "remove public initAuth",
)
p.write_text(text, encoding="utf-8")


# Main: en / no espera PRE_ROUTER; lo arranca en background tras bootApp.
p = Path("src/main.js")
text = p.read_text(encoding="utf-8")
text = must_replace(
    text,
    'export const MAIN_VERSION = "main.minimal.v8-canonical-loader";',
    'export const MAIN_VERSION = "main.minimal.v9-public-lean-graph";',
    "main version",
)
anchor = '''function getSafeInitialPath() {
  return redact(getInitialPath()) || "/";
}
'''
helper = anchor + '''
function isExactPublicHome(
  value = getInitialPath()
) {
  try {
    const raw = String(value || "/");
    const pathname = raw
      .split("#")[0]
      .split("?")[0]
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") || "/";
    return pathname === "/";
  } catch {
    return false;
  }
}
'''
text = must_replace(text, anchor, helper, "main public path helper")
anchor = '''function startPostRouterEnhancements(enhancements) {
'''
helper = '''function startDeferredPreRouterEnhancements(enhancements) {
  return Promise.resolve()
    .then(() => enhancements.initPreRouter())
    .catch((error) => {
      try {
        console.error(
          "[Onion Main] Pre-router diferido no crítico:",
          safeError(error)
        );
      } catch {
        // noop
      }
      return false;
    });
}

'''
text = must_replace(text, anchor, helper + anchor, "deferred pre-router helper")
old = '''  const enhancements = await loadEnhancements();

  /*
    ticket-deeplink debe canonicalizar /tickets/<id> antes de capturar
    la ruta del Router. Chrome también se prepara antes del App.
  */
  await enhancements.initPreRouter();

  const rawInitialPath = getInitialPath();
'''
new = '''  const enhancements = await loadEnhancements();
  const rawInitialPath = getInitialPath();
  const publicHomeFastPath = isExactPublicHome(rawInitialPath);

  /*
    En rutas privadas/token, ticket-deeplink y Chrome conservan su barrera
    histórica previa al App. En la home pública exacta no son necesarios para
    el primer paint y se difieren hasta después de bootApp().
  */
  if (!publicHomeFastPath) {
    await enhancements.initPreRouter();
  }

'''
text = must_replace(text, old, new, "main pre-router gate")
text = must_replace(
    text,
    '''  /*
    El App/Router ya está listo. A partir de aquí los módulos son progresivos:
    empiezan en background y no retrasan `ready` ni convierten un fallo aislado
    en un fatal de arranque.
  */
  void startPostRouterEnhancements(enhancements);
''',
    '''  /*
    El App/Router ya está listo. En `/`, completamos también los módulos
    pre-router que se excluyeron deliberadamente del camino crítico.
  */
  if (publicHomeFastPath) {
    void startDeferredPreRouterEnhancements(enhancements);
  }
  void startPostRouterEnhancements(enhancements);
''',
    "main deferred pre-router start",
)
p.write_text(text, encoding="utf-8")


# Index: hints privados dejan de ser incondicionales.
p = Path("index.html")
text = p.read_text(encoding="utf-8")
text = must_replace(
    text,
    '''  <link
    rel="modulepreload"
    href="/src/features/ticket-deeplink/index.js"
  >
  <link
    rel="modulepreload"
    href="/src/ui/chrome/index.js"
  >
''',
    "",
    "private modulepreloads",
)
p.write_text(text, encoding="utf-8")


# Preboot: en rutas no-root recupera hints privados; en root mantiene hints públicos.
p = Path("src/preboot/public-home-preload.js")
text = p.read_text(encoding="utf-8")
old = '''    if (window.location.pathname !== "/") return;

    const head = document.head;
    if (!head) return;

    const heroImageSrcset = [
'''
new = '''    const head = document.head;
    if (!head) return;

    if (window.location.pathname !== "/") {
      for (const href of [
        "/src/features/ticket-deeplink/index.js",
        "/src/ui/chrome/index.js",
      ]) {
        if (head.querySelector(`link[href="${href}"]`)) continue;
        const link = document.createElement("link");
        link.rel = "modulepreload";
        link.href = href;
        link.dataset.onionPrivateBootPreload = "true";
        head.appendChild(link);
      }
      return;
    }

    const heroImageSrcset = [
'''
text = must_replace(text, old, new, "preboot path split")
p.write_text(text, encoding="utf-8")
