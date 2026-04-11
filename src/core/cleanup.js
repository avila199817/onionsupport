/* =========================================================
   Onion SPA - Core Cleanup
   Archivo: src/core/cleanup.js

   Responsabilidades:
   - gestionar scopes de cleanup del core
   - registrar listeners y cleaners por scope
   - limpiar recursos de forma segura
   - soportar listeners DOM y eventos del event bus
========================================================= */

export function createCleanup({
  registry,
  events,
  utils,
}) {
  function ensureScope(name = "global") {
    if (!registry.scopes.has(name)) {
      registry.scopes.set(name, {
        listeners: [],
        cleaners: [],
      });
    }

    return registry.scopes.get(name);
  }

  return {
    scope(name = "global") {
      ensureScope(name);
      return name;
    },

    on(scopeName = "global", target, event, handler, options = false) {
      const scope = ensureScope(scopeName);

      if (!target || !event || typeof handler !== "function") {
        return () => {};
      }

      target.addEventListener(event, handler, options);

      const disposer = () => {
        target.removeEventListener(event, handler, options);
      };

      scope.listeners.push(disposer);
      return disposer;
    },

    event(scopeName = "global", name, handler, options = false) {
      const off = events.on(name, handler, options);
      const scope = ensureScope(scopeName);
      scope.cleaners.push(off);
      return off;
    },

    add(scopeName = "global", disposer) {
      if (typeof disposer !== "function") {
        return () => {};
      }

      const scope = ensureScope(scopeName);
      scope.cleaners.push(disposer);
      return disposer;
    },

    run(scopeName = "global") {
      const scope = registry.scopes.get(scopeName);
      if (!scope) return;

      [...scope.listeners, ...scope.cleaners].forEach((dispose) => {
        try {
          dispose();
        } catch (error) {
          utils?.warn?.(`Error limpiando scope "${scopeName}"`, error);
        }
      });

      registry.scopes.delete(scopeName);
    },

    runAll() {
      Array.from(registry.scopes.keys()).forEach((scopeName) => {
        this.run(scopeName);
      });
    },
  };
}
