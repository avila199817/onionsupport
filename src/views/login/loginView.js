/* =========================================================
   Onion Support - Login View Legacy Bridge
   Archivo: /src/views/loginView.js

   Responsabilidad:
   - Mantener compatibilidad con imports antiguos.
   - Delegar en /src/views/login/index.js.
   - No poseer lógica de login.
   - No renderizar DOM propio.
   - No leer Auth.
   - No leer Router.
   - No tocar Shell.
   - No tocar Loader.
   - No emitir eventos.
   - No hacer navegación.
   - No hacer storage.
   - No hacer HTTP.
   - No hacer Toast.
   - Sin rutas.
   - Sin /home.
   - Sin 2FA/MFA/OTP.
========================================================= */

import * as LoginModule from "./login/index.js";

export const LOGIN_VIEW_BRIDGE_VERSION = "login.view.bridge.v2";

/* =========================================================
   HELPERS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function getApi() {
  return LoginModule.LoginView || LoginModule.default || LoginModule;
}

function call(methods = [], args = [], options = {}) {
  const api = getApi();

  for (const method of methods) {
    if (isFunction(LoginModule?.[method])) {
      return LoginModule[method](...args);
    }

    if (isFunction(api?.[method])) {
      return api[method](...args);
    }
  }

  if (options.allowCallable === true && isFunction(api)) {
    return api(...args);
  }

  if (options.required === true) {
    throw new Error("[loginView] /src/views/login/index.js no expone render/init/mount válido.");
  }

  return null;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function render(container, deps = {}) {
  return call(["render", "init", "mount"], [container, deps], {
    allowCallable: true,
    required: true,
  });
}

export function init(container, deps = {}) {
  return call(["init", "render", "mount"], [container, deps], {
    allowCallable: true,
    required: true,
  });
}

export function mount(container, deps = {}) {
  return call(["mount", "render", "init"], [container, deps], {
    allowCallable: true,
    required: true,
  });
}

export function destroy(options = {}) {
  return Boolean(
    call(["destroy", "unmount", "dispose", "teardown"], [options])
  );
}

export const unmount = destroy;
export const dispose = destroy;
export const teardown = destroy;

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSnapshot() {
  const api = getApi();

  if (isFunction(LoginModule.getSnapshot)) return LoginModule.getSnapshot();
  if (isFunction(api?.getSnapshot)) return api.getSnapshot();

  return {
    version: LOGIN_VIEW_BRIDGE_VERSION,

    delegated: true,
    target: "/src/views/login/index.js",

    hasRenderer: Boolean(
      isFunction(LoginModule.render) ||
        isFunction(LoginModule.init) ||
        isFunction(LoginModule.mount) ||
        isFunction(api?.render) ||
        isFunction(api?.init) ||
        isFunction(api?.mount) ||
        isFunction(api)
    ),

    policy: {
      bridgeOnly: true,
      legacyCompatOnly: true,

      ownsLoginLogic: false,
      ownsDom: false,
      ownsAuth: false,
      ownsRouter: false,
      ownsShell: false,
      ownsLoader: false,
      ownsEvents: false,
      ownsNavigation: false,
      ownsStorage: false,
      ownsHttp: false,
      ownsToast: false,

      noRoutes: true,
      noHomeRoute: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,
    },
  };
}

export const getDebugSnapshot = getSnapshot;

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export const LoginView = Object.freeze({
  version: LOGIN_VIEW_BRIDGE_VERSION,

  render,
  init,
  mount,

  destroy,
  unmount,
  dispose,
  teardown,

  getSnapshot,
  getDebugSnapshot,
});

export default LoginView;
