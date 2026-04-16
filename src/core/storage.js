/* =========================================================
   Onion SPA - Core Storage
   Archivo: src/core/storage.js

   RESPONSABILIDADES:
   - encapsular acceso localStorage namespaced
   - leer / escribir valores serializados y raw
   - borrar claves legacy de sesión
   - limpiar namespace completo app

   HARDENING EXTREMO:
   - guard browser robusto
   - JSON seguro
   - fallback silencioso ante quota/private mode
   - protección contra "undefined"/"null" corruptos
   - namespace estable
========================================================= */

import { config } from "./config.js";

import {
  isBrowser,
  buildStorageKey,
  safeParse,
} from "./helpers.js";

/* =========================================================
   INTERNAL
========================================================= */

function getStorage() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function safeString(value) {
  return String(value ?? "");
}

function isCorruptedRawValue(raw) {
  return (
    raw === "undefined" ||
    raw === "null"
  );
}

/* =========================================================
   LEGACY CLEANUP
========================================================= */

export function removeLegacySessionKeys(
  utils
) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  try {
    Object.values(
      config.legacyStorageKeys || {}
    ).forEach((key) => {
      if (key) {
        storage.removeItem(key);
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
    return buildStorageKey(key);
  }

  return {
    /* ==============================================
       GET JSON
    ============================================== */
    get(
      key,
      fallback = null
    ) {
      const storage = getStorage();

      if (!storage) {
        return fallback;
      }

      try {
        const raw =
          storage.getItem(
            getNamespacedKey(key)
          );

        if (
          raw === null ||
          isCorruptedRawValue(raw)
        ) {
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
      const storage = getStorage();

      if (!storage) {
        return fallback;
      }

      try {
        const raw =
          storage.getItem(
            getNamespacedKey(key)
          );

        if (
          raw === null ||
          isCorruptedRawValue(raw)
        ) {
          return fallback;
        }

        return raw;
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
      const storage = getStorage();

      if (!storage) {
        return false;
      }

      try {
        storage.setItem(
          getNamespacedKey(key),
          JSON.stringify(value)
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
      const storage = getStorage();

      if (!storage) {
        return false;
      }

      try {
        storage.setItem(
          getNamespacedKey(key),
          safeString(value)
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
      const storage = getStorage();

      if (!storage) {
        return false;
      }

      try {
        storage.removeItem(
          getNamespacedKey(key)
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
      const storage = getStorage();

      if (!storage) {
        return false;
      }

      try {
        return (
          storage.getItem(
            getNamespacedKey(key)
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
      const storage = getStorage();

      if (!storage) {
        return false;
      }

      try {
        const prefix =
          `${config.storagePrefix}:`;

        const keysToRemove =
          [];

        for (
          let i = 0;
          i < storage.length;
          i += 1
        ) {
          const currentKey =
            storage.key(i);

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
            storage.removeItem(key);
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
