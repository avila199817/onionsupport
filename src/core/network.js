/* =========================================================
   Onion SPA - Core Network
   Archivo: src/core/network.js

   Responsabilidades:
   - bind de eventos de conectividad del navegador
   - sincronizar estado online/offline
   - emitir eventos de red del core
   - registrar diagnóstico básico de conectividad
========================================================= */

import { isBrowser } from "./helpers.js";

export function bindNetworkEvents({
  state,
  events,
  cleanup,
  utils,
}) {
  if (!isBrowser()) return;

  cleanup.on("core:network", window, "online", () => {
    state.online = true;

    events?.emit?.("app:network:change", {
      online: true,
    });

    utils?.log?.("Conectividad recuperada.");
  });

  cleanup.on("core:network", window, "offline", () => {
    state.online = false;

    events?.emit?.("app:network:change", {
      online: false,
    });

    utils?.warn?.("El navegador está offline.");
  });
}
