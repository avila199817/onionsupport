/* =========================================================
   Onion Support - Topbar Executive Event Bridge
   Archivo: /src/features/topbar-executive/events.js

   Une el bus AppCore.events con el centro ejecutivo de notificaciones.
   El runtime base ya escucha CustomEvent de window; este bridge cubre los
   productores que publican exclusivamente a través del bus canónico.
========================================================= */

"use strict";

import { AppCore } from "../../core/index.js";
import { TopbarNotifications } from "./index.base.js";

export const TOPBAR_EXECUTIVE_EVENTS_VERSION =
  "topbar.executive.events.v1-appcore-bridge";

const EVENT_NAMES = Object.freeze([
  "onion:app-notification",
  "app:notification",
  "onion:correo-new-message",
  "server:status:error",
  "clientes:error",
  "usuarios:error",
  "usuarios:created",
]);

const bindings = [];
let bound = false;

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "", max = 180) {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (output || fallback).slice(0, max);
}

function payload(value = null) {
  if (isObject(value?.detail?.detail)) return value.detail.detail;
  if (isObject(value?.detail?.payload)) return value.detail.payload;
  if (isObject(value?.detail)) return value.detail;
  if (isObject(value?.payload)) return value.payload;
  if (isObject(value)) return value;
  return {};
}

function publish(detail = {}, defaults = {}) {
  try {
    return TopbarNotifications.notify(
      isObject(detail) ? detail : {},
      isObject(defaults) ? defaults : {}
    );
  } catch {
    return null;
  }
}

function adapter(name = "", value = null) {
  const data = payload(value);

  switch (name) {
    case "onion:app-notification":
    case "app:notification":
      return publish(data, {
        source: name,
      });

    case "onion:correo-new-message": {
      const count = Math.max(1, Number(data.count) || 1);
      return publish({
        title: count === 1 ? "Nuevo correo" : "Nuevos correos",
        message:
          count === 1
            ? "Ha llegado un mensaje nuevo a Correo."
            : `Han llegado ${count} mensajes nuevos a Correo.`,
        kind: "mail",
        route: "/correo",
        source: "correo",
        dedupeKey: `correo:new:${count}`,
      });
    }

    case "server:status:error":
      return publish({
        title: "Servidor requiere atención",
        message:
          data.message ||
          data.error?.message ||
          "Se ha detectado un error al consultar el estado del servidor.",
        kind: "error",
        route: "/servidor",
        source: "servidor",
        dedupeKey: `server:error:${cleanText(data.code || data.message, "status", 80)}`,
      });

    case "clientes:error":
      return publish({
        title: "Clientes no se ha podido actualizar",
        message:
          data.message ||
          "La última operación de Clientes ha devuelto un error.",
        kind: "warning",
        route: "/clientes",
        source: "clientes",
        dedupeKey: `clientes:error:${cleanText(data.code || data.message, "error", 80)}`,
      });

    case "usuarios:error":
      return publish({
        title: "Usuarios no se ha podido actualizar",
        message:
          data.message ||
          "La última operación de Usuarios ha devuelto un error.",
        kind: "warning",
        route: "/usuarios",
        source: "usuarios",
        dedupeKey: `usuarios:error:${cleanText(data.message, "error", 80)}`,
      });

    case "usuarios:created":
      return publish({
        title: "Usuario creado",
        message: "Se ha creado correctamente un usuario en OnionSupport.",
        kind: "success",
        route: "/usuarios",
        source: "usuarios",
        dedupeKey: "usuarios:created",
      });

    default:
      return null;
  }
}

export function bindTopbarExecutiveEventBridge() {
  if (bound) return true;

  const on = AppCore?.events?.on;
  if (typeof on !== "function") return false;

  for (const name of EVENT_NAMES) {
    const handler = (value) => adapter(name, value);

    try {
      on.call(AppCore.events, name, handler);
      bindings.push({ name, handler });
    } catch {
      // Un evento que no se pueda enlazar no bloquea el resto del bridge.
    }
  }

  bound = bindings.length > 0;
  return bound;
}

export function unbindTopbarExecutiveEventBridge() {
  const off = AppCore?.events?.off;

  if (typeof off === "function") {
    for (const { name, handler } of bindings.splice(0)) {
      try {
        off.call(AppCore.events, name, handler);
      } catch {
        // noop
      }
    }
  } else {
    bindings.length = 0;
  }

  bound = false;
  return true;
}

bindTopbarExecutiveEventBridge();

export default Object.freeze({
  version: TOPBAR_EXECUTIVE_EVENTS_VERSION,
  bind: bindTopbarExecutiveEventBridge,
  unbind: unbindTopbarExecutiveEventBridge,
});
