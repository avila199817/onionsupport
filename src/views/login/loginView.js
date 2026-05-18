/* =========================================================
   Onion SPA - Login View Legacy Bridge
   Archivo: src/views/loginView.js

   Responsabilidad:
   - Mantener compatibilidad con imports antiguos.
   - Delegar en src/views/login/index.js.
   - Sin Auth.
   - Sin Router.
   - Sin Shell.
   - Sin Loader.
   - Sin eventos.
   - Sin DOM propio.
   - Sin debug pesado.
========================================================= */

import * as LoginModule from "./login/index.js";

export const LOGIN_VIEW_BRIDGE_VERSION = "minimal-1";

/* =========================================================
   HELPERS
========================================================= */

function isFn(value) {
  return typeof value === "function";
}

function getApi() {
  return LoginModule.LoginView || LoginModule.default || LoginModule;
}

function call(methods = [], args = [], options = {}) {
  const api = getApi();

  for (const method of methods) {
    if (isFn(LoginModule[method])) {
      return LoginModule[method](...args);
    }

    if (isFn(api?.[method])) {
      return api[method](...args);
    }
  }

  if (options.allowCallable === true && isFn(api)) {
    return api(...args);
  }

  if (options.required === true) {
    throw new Error("[loginView] src/views/login/index.js no expone render/init/mount válido.");
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
   SNAPSHOT MÍNIMO
========================================================= */

export function getSnapshot() {
  const api = getApi();

  if (isFn(LoginModule.getSnapshot)) return LoginModule.getSnapshot();
  if (isFn(api?.getSnapshot)) return api.getSnapshot();

  return {
    version: LOGIN_VIEW_BRIDGE_VERSION,
    delegated: true,
    target: "src/views/login/index.js",
    hasRenderer: Boolean(
      isFn(LoginModule.render) ||
        isFn(LoginModule.init) ||
        isFn(LoginModule.mount) ||
        isFn(api?.render) ||
        isFn(api?.init) ||
        isFn(api?.mount) ||
        isFn(api)
    ),
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
