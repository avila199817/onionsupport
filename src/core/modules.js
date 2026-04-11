/* =========================================================
   Onion SPA - Core Modules
   Archivo: src/core/modules.js

   Responsabilidades:
   - registrar módulos en el core
   - consultar módulos registrados
   - listar aliases disponibles
   - desregistrar módulos de forma segura
========================================================= */

export function createModules({
  registry,
  events,
}) {
  return {
    register(name, instance) {
      if (!name) {
        throw new Error("modules.register(name, instance) requiere un nombre");
      }

      registry.modules.set(name, instance);

      events?.emit?.("app:module:registered", {
        name,
        instance,
      });

      return instance;
    },

    get(name) {
      return registry.modules.get(name) || null;
    },

    has(name) {
      return registry.modules.has(name);
    },

    unregister(name) {
      const exists = registry.modules.has(name);

      if (!exists) return false;

      const instance = registry.modules.get(name);
      registry.modules.delete(name);

      events?.emit?.("app:module:unregistered", {
        name,
        instance,
      });

      return true;
    },

    list() {
      return Array.from(registry.modules.keys());
    },
  };
}
