/* =========================================================
   Onion SPA - Store Collections
   Archivo: src/store/collections.js

   Responsabilidades:
   - validar claves de colecciones registradas
   - normalizar matchers de colección
========================================================= */

import { isFunction } from "./helpers.js";

export function ensureCollectionKey(state, key) {
  if (!(key in state.entities)) {
    throw new Error(`Colección no registrada en store.entities: ${key}`);
  }
}

export function normalizeMatcher(matcher) {
  if (isFunction(matcher)) return matcher;
  return (item) => item?.id === matcher;
}
