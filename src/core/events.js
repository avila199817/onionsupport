/* =========================================================
   Onion SPA - Core Events
   Archivo: src/core/events.js

   Responsabilidades:
   - centralizar el event bus del core
   - emitir eventos custom sobre document
   - registrar listeners persistentes o once
   - desacoplar módulos a través de eventos
========================================================= */

import { isBrowser, normalizeListenerOptions } from "./helpers.js";

export function createEvents() {
  return {
    emit(name, detail = {}) {
      if (!isBrowser()) return;
      document.dispatchEvent(new CustomEvent(name, { detail }));
    },

    on(name, handler, options = false) {
      if (!isBrowser() || !name || typeof handler !== "function") {
        return () => {};
      }

      document.addEventListener(name, handler, options);

      return () => {
        document.removeEventListener(name, handler, options);
      };
    },

    off(name, handler, options = false) {
      if (!isBrowser() || !name || typeof handler !== "function") return;
      document.removeEventListener(name, handler, options);
    },

    once(name, handler, options = false) {
      if (!isBrowser() || !name || typeof handler !== "function") {
        return () => {};
      }

      const finalOptions = {
        ...normalizeListenerOptions(options),
        once: true,
      };

      document.addEventListener(name, handler, finalOptions);

      return () => {
        document.removeEventListener(name, handler, finalOptions);
      };
    },
  };
}
