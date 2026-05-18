/* =========================================================
   Onion SPA - Login View Legacy Bridge
   Archivo: src/views/loginView.js

   Responsabilidad:
   - Mantener imports antiguos src/views/loginView.js.
   - Delegar todo en src/views/login/index.js.
   - Sin Auth.
   - Sin Router.
   - Sin Shell.
   - Sin Loader.
   - Sin eventos.
   - Sin debug global.
   - Sin DOM propio.
   - Sin magia negra.
========================================================= */

import * as LoginModule from "./login/index.js";

export const LOGIN_VIEW_BRIDGE_VERSION = "simple-bridge";

const SOURCE = "loginView.legacyBridge";

/* =========================================================
   BASICS
========================================================= */

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function resolveLoginApi() {
  return (
    LoginModule.LoginView ||
    LoginModule.default ||
    LoginModule
  );
}

function callFirst(methods = [], args = [], options = {}) {
  const api = resolveLoginApi();

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

  if (options.throwIfMissing === true) {
    throw new Error("[loginView] src/views/login/index.js no expone un renderer válido.");
  }

  return null;
}

/* =========================================================
   PUBLIC API
========================================================= */

export function render(container, deps = {}) {
  return callFirst(
    ["render", "init", "mount"],
    [container, deps],
    {
      allowCallable: true,
      throwIfMissing: true,
    }
  );
}

export function init(container, deps = {}) {
  return callFirst(
    ["init", "render", "mount"],
    [container, deps],
    {
      allowCallable: true,
      throwIfMissing: true,
    }
  );
}

export function mount(container, deps = {}) {
  return callFirst(
    ["mount", "render", "init"],
    [container, deps],
    {
      allowCallable: true,
      throwIfMissing: true,
    }
  );
}

export function destroy(options = {}) {
  return Boolean(
    callFirst(
      ["destroy", "unmount", "dispose", "teardown"],
      [options],
      {
        allowCallable: false,
        throwIfMissing: false,
      }
    )
  );
}

export function unmount(options = {}) {
  return destroy(options);
}

export function dispose(options = {}) {
  return destroy(options);
}

export function teardown(options = {}) {
  return destroy(options);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSnapshot() {
  const api = resolveLoginApi();

  if (isFunction(LoginModule?.getSnapshot)) {
    return LoginModule.getSnapshot();
  }

  if (isFunction(api?.getSnapshot)) {
    return api.getSnapshot();
  }

  if (isFunction(api?.getDebugSnapshot)) {
    return api.getDebugSnapshot();
  }

  return {
    version: LOGIN_VIEW_BRIDGE_VERSION,
    source: SOURCE,
    delegated: true,
    target: "src/views/login/index.js",
    hasRenderer: Boolean(
      isFunction(LoginModule?.render) ||
        isFunction(LoginModule?.init) ||
        isFunction(LoginModule?.mount) ||
        isFunction(api?.render) ||
        isFunction(api?.init) ||
        isFunction(api?.mount) ||
        isFunction(api)
    ),
    policy: {
      bridgeOnly: true,
      noAuth: true,
      noRouter: true,
      noShell: true,
      noLoader: true,
      noEvents: true,
      noDomOwn: true,
    },
  };
}

export function getDebugSnapshot() {
  return getSnapshot();
}

/* =========================================================
   BRIDGE OBJECT
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
