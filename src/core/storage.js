/* =========================================================
   Onion SPA - Core Storage
   Archivo: src/core/storage.js

   Responsabilidades:
   - encapsular acceso a localStorage namespaced
   - leer / escribir valores serializados y raw
   - borrar claves legacy de sesión
   - limpiar todo el namespace de la app
========================================================= */

import { config } from "./config.js";
import { isBrowser, buildStorageKey, safeParse } from "./helpers.js";

/* =========================================================
   LEGACY CLEANUP
========================================================= */
export function removeLegacySessionKeys(utils) {
  if (!isBrowser()) return;

  try {
    Object.values(config.legacyStorageKeys).forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    if (config.debug) {
      console.warn(
        `[${config.appName}] No se pudieron borrar claves legacy`,
        error
      );
    }

    utils?.warn?.("No se pudieron borrar claves legacy.", error);
  }
}

/* =========================================================
   STORAGE FACTORY
========================================================= */
export function createStorage(utils) {
  return {
    get(key, fallback = null) {
      if (!isBrowser()) return fallback;

      try {
        const raw = localStorage.getItem(buildStorageKey(key));
        if (raw === null) return fallback;
        return safeParse(raw, fallback);
      } catch (error) {
        utils?.warn?.(`No se pudo leer storage: ${key}`, error);
        return fallback;
      }
    },

    getRaw(key, fallback = null) {
      if (!isBrowser()) return fallback;

      try {
        const raw = localStorage.getItem(buildStorageKey(key));
        return raw === null ? fallback : raw;
      } catch (error) {
        utils?.warn?.(`No se pudo leer storage raw: ${key}`, error);
        return fallback;
      }
    },

    set(key, value) {
      if (!isBrowser()) return false;

      try {
        localStorage.setItem(buildStorageKey(key), JSON.stringify(value));
        return true;
      } catch (error) {
        utils?.warn?.(`No se pudo guardar storage: ${key}`, error);
        return false;
      }
    },

    setRaw(key, value) {
      if (!isBrowser()) return false;

      try {
        localStorage.setItem(buildStorageKey(key), String(value));
        return true;
      } catch (error) {
        utils?.warn?.(`No se pudo guardar storage raw: ${key}`, error);
        return false;
      }
    },

    remove(key) {
      if (!isBrowser()) return false;

      try {
        localStorage.removeItem(buildStorageKey(key));
        return true;
      } catch (error) {
        utils?.warn?.(`No se pudo borrar storage: ${key}`, error);
        return false;
      }
    },

    has(key) {
      if (!isBrowser()) return false;

      try {
        return localStorage.getItem(buildStorageKey(key)) !== null;
      } catch {
        return false;
      }
    },

    clearAll() {
      if (!isBrowser()) return false;

      try {
        const keysToRemove = [];

        for (let i = 0; i < localStorage.length; i += 1) {
          const currentKey = localStorage.key(i);

          if (
            currentKey &&
            currentKey.startsWith(`${config.storagePrefix}:`)
          ) {
            keysToRemove.push(currentKey);
          }
        }

        keysToRemove.forEach((key) => {
          localStorage.removeItem(key);
        });

        removeLegacySessionKeys(utils);

        return true;
      } catch (error) {
        utils?.warn?.("No se pudo limpiar el storage de la app", error);
        return false;
      }
    },
  };
}
