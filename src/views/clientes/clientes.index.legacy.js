/* =========================================================
   Onion Support - Clientes Compatibility Facade
   Archivo: /src/views/clientes/clientes.index.legacy.js

   COMPAT ONLY · NO SECOND CLIENTES VIEW

   El listado, búsqueda, filtros, paginación y detalle pertenecen únicamente a
   ./index.js. Este archivo conserva la API histórica de apertura del alta y la
   delega al controller canónico create-only de ./clientes.create-controller.js.
========================================================= */

import { AppCore } from "../../core/index.js";
import {
  createClientesCreateController,
  CLIENTES_CREATE_CONTROLLER_VERSION,
} from "./clientes.create-controller.js";

export const CLIENTES_LEGACY_FACADE_VERSION =
  "clientes.compat.v1.create-facade-only";

let context = {};
let createController = null;

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function cleanText(value = "", fallback = "") {
  const text = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function currentUser() {
  try {
    const state = AppCore?.runtimeState?.read?.() || {};
    return AppCore?.getCurrentUser?.() || state.user || state.currentUser || null;
  } catch {
    return null;
  }
}

function currentRole() {
  const user = safeObject(currentUser());
  let value = cleanText(
    context.role ||
    context.rol ||
    context.user?.role ||
    context.user?.rol ||
    user.role ||
    user.rol ||
    "user",
    "user"
  );

  try {
    value = AppCore.normalizeRole(value) || "user";
  } catch {
    value = value.toLowerCase();
  }
  return value;
}

function admin() {
  return context.admin === true || currentRole() === "admin";
}

function showToast(message = "", type = "info") {
  const text = cleanText(message, "");
  if (!text) return false;

  for (const toast of [AppCore?.toast, AppCore?.ui?.toast, AppCore?.Toast]) {
    try {
      if (typeof toast?.[type] === "function") {
        toast[type](text);
        return true;
      }
      if (typeof toast?.show === "function") {
        toast.show(text, type);
        return true;
      }
    } catch {
      // noop
    }
  }
  return false;
}

function emitEvent(name = "", payload = {}) {
  const eventName = cleanText(name, "");
  if (!eventName) return false;

  let emitted = false;
  try {
    if (typeof AppCore?.events?.emit === "function") {
      AppCore.events.emit(eventName, payload);
      emitted = true;
    }
  } catch {
    // noop
  }

  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
      emitted = true;
    }
  } catch {
    // noop
  }
  return emitted;
}

function ensureCreateController() {
  if (createController) return createController;

  createController = createClientesCreateController({
    getRole: currentRole,
    getUser: currentUser,
    isAdmin: admin,
    showToast,
    emitEvent,
  });
  return createController;
}

function parseContext(hostOrContext = null, maybeContext = {}) {
  if (
    hostOrContext &&
    typeof hostOrContext === "object" &&
    hostOrContext.nodeType === 1
  ) {
    return safeObject(maybeContext);
  }
  return safeObject(hostOrContext);
}

export async function init(hostOrContext = null, maybeContext = {}) {
  context = {
    ...context,
    ...parseContext(hostOrContext, maybeContext),
  };
  ensureCreateController();
  return getSnapshot();
}

export const mount = init;
export const bootstrap = init;
export const render = init;

export async function openCreate(trigger = null) {
  return ensureCreateController().open(trigger);
}

export async function createCliente(trigger = null) {
  return openCreate(trigger);
}

export async function destroy() {
  try { createController?.destroy?.(); } catch { /* noop */ }
  createController = null;
  context = {};
  return true;
}

export const unmount = destroy;
export const dispose = destroy;

export function getSnapshot() {
  return Object.freeze({
    version: CLIENTES_LEGACY_FACADE_VERSION,
    createControllerVersion: CLIENTES_CREATE_CONTROLLER_VERSION,
    compatibilityOnly: true,
    listingAuthority: "./index.js",
    createAuthority: "./clientes.create-controller.js",
    create: createController?.getSnapshot?.() || null,
  });
}

export const getState = getSnapshot;

export const ClientesView = Object.freeze({
  version: CLIENTES_LEGACY_FACADE_VERSION,
  init,
  mount,
  bootstrap,
  render,
  openCreate,
  createCliente,
  destroy,
  unmount,
  dispose,
  getSnapshot,
  getState,
});

export default ClientesView;
