/* =========================================================
   Onion SPA - Core Storage
   Archivo: src/core/storage.js

   Responsabilidades:
   - encapsular acceso localStorage namespaced
   - leer / escribir valores serializados y raw
   - borrar claves legacy de sesión
   - limpiar namespace completo app
========================================================= */

import { config } from "./config.js";

import {
  isBrowser,
  buildStorageKey,
  safeParse,
} from "./helpers.js";

/* =========================================================
   LEGACY CLEANUP
========================================================= */
export function removeLegacySessionKeys(
  utils
) {
  if (!isBrowser()) {
    return;
  }

  try {
    Object.values(
      config.legacyStorageKeys || {}
    ).forEach((key) => {
      if (key) {
        localStorage.removeItem(
          key
        );
      }
    });
  } catch (error) {
    if (config.debug) {
      console.warn(
        `[${config.appName}] No se pudieron borrar claves legacy`,
        error
      );
    }

    utils?.warn?.(
      "No se pudieron borrar claves legacy.",
      error
    );
  }
}

/* =========================================================
   STORAGE FACTORY
========================================================= */
export function createStorage(
  utils
) {
  function getNamespacedKey(
    key
  ) {
    return buildStorageKey(
      key
    );
  }

  return {
    /* ==============================================
       GET JSON
    ============================================== */
    get(
      key,
      fallback = null
    ) {
      if (!isBrowser()) {
        return fallback;
      }

      try {
        const raw =
          localStorage.getItem(
            getNamespacedKey(
              key
            )
          );

        if (raw === null) {
          return fallback;
        }

        return safeParse(
          raw,
          fallback
        );
      } catch (error) {
        utils?.warn?.(
          `No se pudo leer storage: ${key}`,
          error
        );

        return fallback;
      }
    },

    /* ==============================================
       GET RAW
    ============================================== */
    getRaw(
      key,
      fallback = null
    ) {
      if (!isBrowser()) {
        return fallback;
      }

      try {
        const raw =
          localStorage.getItem(
            getNamespacedKey(
              key
            )
          );

        return raw === null
          ? fallback
          : raw;
      } catch (error) {
        utils?.warn?.(
          `No se pudo leer storage raw: ${key}`,
          error
        );

        return fallback;
      }
    },

    /* ==============================================
       SET JSON
    ============================================== */
    set(
      key,
      value
    ) {
      if (!isBrowser()) {
        return false;
      }

      try {
        localStorage.setItem(
          getNamespacedKey(
            key
          ),
          JSON.stringify(
            value
          )
        );

        return true;
      } catch (error) {
        utils?.warn?.(
          `No se pudo guardar storage: ${key}`,
          error
        );

        return false;
      }
    },

    /* ==============================================
       SET RAW
    ============================================== */
    setRaw(
      key,
      value
    ) {
      if (!isBrowser()) {
        return false;
      }

      try {
        localStorage.setItem(
          getNamespacedKey(
            key
          ),
          String(
            value
          )
        );

        return true;
      } catch (error) {
        utils?.warn?.(
          `No se pudo guardar storage raw: ${key}`,
          error
        );

        return false;
      }
    },

    /* ==============================================
       REMOVE
    ============================================== */
    remove(
      key
    ) {
      if (!isBrowser()) {
        return false;
      }

      try {
        localStorage.removeItem(
          getNamespacedKey(
            key
          )
        );

        return true;
      } catch (error) {
        utils?.warn?.(
          `No se pudo borrar storage: ${key}`,
          error
        );

        return false;
      }
    },

    /* ==============================================
       HAS
    ============================================== */
    has(
      key
    ) {
      if (!isBrowser()) {
        return false;
      }

      try {
        return (
          localStorage.getItem(
            getNamespacedKey(
              key
            )
          ) !== null
        );
      } catch {
        return false;
      }
    },

    /* ==============================================
       CLEAR ALL APP NAMESPACE
    ============================================== */
    clearAll() {
      if (!isBrowser()) {
        return false;
      }

      try {
        const prefix =
          `${config.storagePrefix}:`;

        const keysToRemove =
          [];

        for (
          let i = 0;
          i <
          localStorage.length;
          i += 1
        ) {
          const currentKey =
            localStorage.key(
              i
            );

          if (
            currentKey &&
            currentKey.startsWith(
              prefix
            )
          ) {
            keysToRemove.push(
              currentKey
            );
          }
        }

        keysToRemove.forEach(
          (key) => {
            localStorage.removeItem(
              key
            );
          }
        );

        removeLegacySessionKeys(
          utils
        );

        return true;
      } catch (error) {
        utils?.warn?.(
          "No se pudo limpiar el storage de la app",
          error
        );

        return false;
      }
    },
  };
}
