/* =========================================================
   Onion SPA - Store Collections
   Archivo: src/store/collections.js

   Responsabilidades:
   - validar claves de colecciones registradas
   - normalizar matchers de colección
   - helpers reutilizables para entidades
========================================================= */

import { isFunction } from "./helpers.js";

/* =========================================================
   VALIDATE COLLECTION KEY
========================================================= */
export function ensureCollectionKey(
  state,
  key
) {
  const normalizedKey =
    String(key || "").trim();

  if (!normalizedKey) {
    throw new Error(
      "Clave de colección requerida"
    );
  }

  if (
    !state ||
    !state.entities ||
    typeof state.entities !==
      "object"
  ) {
    throw new Error(
      "state.entities no disponible"
    );
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      state.entities,
      normalizedKey
    )
  ) {
    throw new Error(
      `Colección no registrada en store.entities: ${normalizedKey}`
    );
  }

  return normalizedKey;
}

/* =========================================================
   NORMALIZE MATCHER
========================================================= */
export function normalizeMatcher(
  matcher
) {
  if (
    isFunction(matcher)
  ) {
    return matcher;
  }

  if (
    matcher &&
    typeof matcher ===
      "object"
  ) {
    if (
      "id" in matcher
    ) {
      return (item) =>
        item?.id ===
        matcher.id;
    }
  }

  return (item) =>
    item?.id === matcher;
}
