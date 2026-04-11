/* =========================================================
   Onion SPA - Core Hooks
   Archivo: src/core/hooks.js

   Responsabilidades:
   - registrar hooks internos del core
   - validar tipos de hook soportados
   - eliminar hooks registrados
   - exponer tipos disponibles
========================================================= */

export function createHooks({
  registry,
}) {
  return {
    add(type, handler) {
      if (!registry?.hooks?.[type]) {
        throw new Error(`Hook desconocido: ${type}`);
      }

      if (typeof handler !== "function") {
        throw new Error("El hook debe ser una función");
      }

      registry.hooks[type].push(handler);

      return () => {
        registry.hooks[type] = registry.hooks[type].filter(
          (fn) => fn !== handler
        );
      };
    },

    types() {
      return Object.keys(registry?.hooks || {});
    },
  };
}
