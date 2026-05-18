/* =========================================================
   Onion Support - Home Index
   Archivo: /src/views/home/index.js

   Responsabilidad:
   - Entry público de la vista Home para el Router.
   - Delegar en homeView.js.
   - No validar rutas.
   - No resolver slug.
   - No leer Auth.
   - No leer Router.
   - No tocar AppCore.
   - No crear globals.
   - No hacer DOM manual.
   - No duplicar lógica visual.
   - No bloquear render si Router ya resolvió Home.
========================================================= */

import * as HomeViewModule from "./homeView.js";

export const HOME_INDEX_VERSION = "home.index.v1";

/* =========================================================
   VIEW RESOLUTION
========================================================= */

const View =
  HomeViewModule.HomeView ||
  HomeViewModule.default ||
  HomeViewModule ||
  null;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function methodOf(target = null, names = []) {
  if (!target) return null;

  for (const name of names) {
    if (isFunction(target?.[name])) {
      return target[name].bind(target);
    }
  }

  return null;
}

function callableViewFor(names = []) {
  const method = methodOf(View, names);

  if (method) return method;

  if (names.includes("render") && isFunction(View)) {
    return View;
  }

  return null;
}

/* =========================================================
   LIFECYCLE
========================================================= */

export async function init(...args) {
  const fn = callableViewFor(["init", "mount", "render", "bootstrap"]);

  if (!fn) return HomeView;

  return fn(...args);
}

export async function mount(...args) {
  const fn = callableViewFor(["mount", "init", "render", "bootstrap"]);

  if (!fn) return HomeView;

  return fn(...args);
}

export async function render(...args) {
  const fn = callableViewFor(["render", "mount", "init", "bootstrap"]);

  if (!fn) return null;

  return fn(...args);
}

export async function refresh(...args) {
  const fn = callableViewFor(["refresh", "reload", "render"]);

  if (!fn) return render(...args);

  return fn(...args);
}

export async function reload(...args) {
  const fn = callableViewFor(["reload", "refresh", "render"]);

  if (!fn) return render(...args);

  return fn(...args);
}

export function destroy(...args) {
  const fn = callableViewFor(["destroy", "unmount", "cleanup"]);

  if (!fn) return true;

  return fn(...args);
}

export function unmount(...args) {
  return destroy(...args);
}

export function cleanup(...args) {
  return destroy(...args);
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getState(...args) {
  const fn = callableViewFor(["getState"]);

  if (!fn) return {};

  return fn(...args);
}

export function getSnapshot(...args) {
  const fn = callableViewFor(["getSnapshot", "getDebugSnapshot"]);

  if (fn) return fn(...args);

  return {
    version: HOME_INDEX_VERSION,
    viewAvailable: Boolean(View),
    methods: {
      init: Boolean(methodOf(View, ["init"])),
      mount: Boolean(methodOf(View, ["mount"])),
      render: Boolean(methodOf(View, ["render"]) || isFunction(View)),
      destroy: Boolean(methodOf(View, ["destroy", "unmount", "cleanup"])),
    },
  };
}

export function getDebugSnapshot(...args) {
  return getSnapshot(...args);
}

/* =========================================================
   API
========================================================= */

export const HomeView = {
  version: HOME_INDEX_VERSION,

  init,
  mount,
  render,

  refresh,
  reload,

  destroy,
  unmount,
  cleanup,

  getState,
  getSnapshot,
  getDebugSnapshot,

  get view() {
    return View;
  },

  get ready() {
    return Boolean(View);
  },
};

export const HomeIndex = HomeView;

export default HomeView;
