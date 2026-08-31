/* =========================================================
   Onion Support - Incidencias Hot List Interaction Guard

   HOT PATH · PERSISTENT SEARCH DOM ISLAND · ZERO BUSINESS STATE

   Responsabilidad:
   - preservar físicamente el mismo <input> de búsqueda mientras el controller
     reconcilia o vuelve a renderizar el historial;
   - dejar que el navegador sea la autoridad del caret mientras el input sigue
     conectado y enfocado;
   - restaurar foco/selección sólo si una reconciliación reemplazó el nodo;
   - no filtrar datos, no hacer HTTP y no duplicar estado de negocio.

   Invariante:
   escribir nunca programa setTimeout/requestAnimationFrame ni reescribe value.
   El hot path del teclado no toca el caret: sólo captura su última selección.
========================================================= */

export const INCIDENCIAS_HOT_LIST_VERSION =
  "incidencias.hot-list.v2.persistent-search-dom-island";

const SEARCH_INPUT_SELECTOR =
  "[data-incidencias-search-input='true']";

const SEARCH_ROOT_SELECTOR =
  ".incidencias-search";

const SEARCH_CLEAR_SELECTOR =
  ".incidencias-search-clear";

function isSearchInput(node = null) {
  return Boolean(node?.matches?.(SEARCH_INPUT_SELECTOR));
}

function integerOrNull(value = null) {
  return Number.isInteger(value) ? value : null;
}

function clampSelection(value = null, length = 0) {
  if (!Number.isInteger(value)) return null;
  return Math.max(0, Math.min(value, Math.max(0, length)));
}

function selectionDirection(value = "none") {
  const direction = String(value || "none");
  return ["forward", "backward", "none"].includes(direction)
    ? direction
    : "none";
}

export function installIncidenciasHotList({
  host = null,
  document: documentLike = null,
} = {}) {
  if (!host?.addEventListener || !documentLike) {
    return () => {};
  }

  const windowLike =
    documentLike.defaultView ||
    (typeof window !== "undefined" ? window : null);

  let destroyed = false;
  let searchOwned = false;
  let explicitExit = false;
  let internalRestore = false;
  let restoreQueued = false;
  let observer = null;
  let ownedInput = null;

  const snapshot = {
    value: "",
    start: null,
    end: null,
    direction: "none",
  };

  function readSearchState(node = null) {
    if (!isSearchInput(node) || internalRestore) return false;

    searchOwned = true;
    explicitExit = false;
    ownedInput = node;
    snapshot.value = String(node.value ?? "");

    try {
      snapshot.start = integerOrNull(node.selectionStart);
      snapshot.end = integerOrNull(node.selectionEnd);
      snapshot.direction = selectionDirection(node.selectionDirection);
    } catch {
      snapshot.start = null;
      snapshot.end = null;
      snapshot.direction = "none";
    }

    return true;
  }

  function syncSafeAttributes(target = null, source = null) {
    if (!target || !source) return false;

    try {
      for (const attribute of Array.from(target.attributes || [])) {
        if (attribute.name === "value") continue;
        if (!source.hasAttribute(attribute.name)) {
          target.removeAttribute(attribute.name);
        }
      }

      for (const attribute of Array.from(source.attributes || [])) {
        if (attribute.name === "value") continue;
        if (target.getAttribute(attribute.name) !== attribute.value) {
          target.setAttribute(attribute.name, attribute.value);
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  function currentSearchInput() {
    return host.querySelector?.(SEARCH_INPUT_SELECTOR) || null;
  }

  function transplantOwnedInput() {
    const current = currentSearchInput();

    if (
      ownedInput &&
      !ownedInput.isConnected &&
      current &&
      current !== ownedInput
    ) {
      syncSafeAttributes(ownedInput, current);

      try {
        current.replaceWith(ownedInput);
        return ownedInput;
      } catch {
        return current;
      }
    }

    if (ownedInput?.isConnected) {
      return ownedInput;
    }

    if (current) {
      ownedInput = current;
    }

    return current;
  }

  function restoreSearchAfterReplacement() {
    restoreQueued = false;

    if (
      destroyed ||
      !searchOwned ||
      explicitExit ||
      !host?.isConnected
    ) {
      return false;
    }

    const desired = {
      value: snapshot.value,
      start: snapshot.start,
      end: snapshot.end,
      direction: snapshot.direction,
    };

    const input = transplantOwnedInput();
    if (!input) return false;

    /*
       Si el mismo input sigue siendo el activo, no hacemos absolutamente nada.
       El navegador conserva caret, selección, IME y scroll horizontal mejor que
       cualquier restauración manual.
    */
    if (documentLike.activeElement === input) {
      ownedInput = input;
      return true;
    }

    internalRestore = true;

    try {
      input.focus({ preventScroll: true });

      /*
         No reescribimos input.value. El controller ya sincroniza search de forma
         síncrona en cada input event; tocar value aquí provocaría flicker/caret.
      */
      if (
        typeof input.setSelectionRange === "function" &&
        String(input.value ?? "") === desired.value
      ) {
        const length = String(input.value ?? "").length;
        const start = clampSelection(desired.start, length);
        const end = clampSelection(desired.end, length);

        if (start !== null && end !== null) {
          input.setSelectionRange(
            start,
            end,
            selectionDirection(desired.direction)
          );
        }
      }

      ownedInput = input;
      return true;
    } catch {
      try {
        input.focus?.();
        ownedInput = input;
        return true;
      } catch {
        return false;
      }
    } finally {
      internalRestore = false;
    }
  }

  function enqueueMicrotask(callback) {
    if (typeof windowLike?.queueMicrotask === "function") {
      windowLike.queueMicrotask(callback);
      return true;
    }

    if (typeof queueMicrotask === "function") {
      queueMicrotask(callback);
      return true;
    }

    Promise.resolve().then(callback);
    return true;
  }

  function scheduleReplacementRestore() {
    if (
      destroyed ||
      !searchOwned ||
      explicitExit ||
      restoreQueued
    ) {
      return false;
    }

    restoreQueued = true;
    enqueueMicrotask(() => {
      restoreSearchAfterReplacement();
    });

    return true;
  }

  function abandonSearchOwnership() {
    searchOwned = false;
    explicitExit = true;
    restoreQueued = false;
    return true;
  }

  function onFocusIn(event) {
    if (isSearchInput(event.target) && !internalRestore) {
      readSearchState(event.target);
    }
  }

  function onInput(event) {
    if (!isSearchInput(event.target)) return;

    /*
       Sólo snapshot. No focus(), no setSelectionRange(), no timer, no frame.
       Éste es el hot path que se ejecuta en cada pulsación.
    */
    readSearchState(event.target);
  }

  function onSelect(event) {
    if (!isSearchInput(event.target)) return;
    readSearchState(event.target);
  }

  function onKeyDown(event) {
    if (!isSearchInput(event.target)) return;

    if (event.key === "Tab" || event.key === "Escape") {
      abandonSearchOwnership();
      return;
    }

    explicitExit = false;
  }

  function onPointerDown(event) {
    const target = event.target?.nodeType === 3
      ? event.target.parentElement
      : event.target;

    const searchRoot = target?.closest?.(SEARCH_ROOT_SELECTOR) || null;

    if (!searchRoot || !host.contains(searchRoot)) {
      abandonSearchOwnership();
      return;
    }

    explicitExit = false;

    if (target?.closest?.(SEARCH_CLEAR_SELECTOR)) {
      searchOwned = true;
      snapshot.value = "";
      snapshot.start = 0;
      snapshot.end = 0;
      snapshot.direction = "none";
    }
  }

  function onFocusOut(event) {
    if (
      !isSearchInput(event.target) ||
      !searchOwned ||
      explicitExit ||
      internalRestore
    ) {
      return;
    }

    const next = event.relatedTarget;
    if (next?.closest?.(SEARCH_ROOT_SELECTOR)) return;

    /*
       El controller puede enfocar temporalmente su fallback al reconciliar.
       Recuperamos la isla en microtask, antes del siguiente paint, únicamente
       si el usuario no inició una salida real del search.
    */
    scheduleReplacementRestore();
  }

  host.addEventListener("focusin", onFocusIn, true);
  host.addEventListener("focusout", onFocusOut, true);
  host.addEventListener("input", onInput, true);
  host.addEventListener("select", onSelect, true);
  host.addEventListener("keydown", onKeyDown, true);
  host.addEventListener("pointerdown", onPointerDown, true);

  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      if (!searchOwned || explicitExit) return;

      const current = currentSearchInput();
      const inputWasReplaced = Boolean(
        ownedInput &&
        !ownedInput.isConnected &&
        current &&
        current !== ownedInput
      );

      /*
         Una actualización de filas no programa ninguna restauración. Sólo una
         sustitución real del input activa el trasplante de la isla DOM.
      */
      if (inputWasReplaced) {
        scheduleReplacementRestore();
      }
    });

    observer.observe(host, {
      childList: true,
      subtree: true,
    });
  }

  return function uninstallIncidenciasHotList() {
    if (destroyed) return false;
    destroyed = true;
    searchOwned = false;
    explicitExit = true;
    restoreQueued = false;
    ownedInput = null;

    observer?.disconnect?.();
    observer = null;

    host.removeEventListener("focusin", onFocusIn, true);
    host.removeEventListener("focusout", onFocusOut, true);
    host.removeEventListener("input", onInput, true);
    host.removeEventListener("select", onSelect, true);
    host.removeEventListener("keydown", onKeyDown, true);
    host.removeEventListener("pointerdown", onPointerDown, true);

    return true;
  };
}

export default installIncidenciasHotList;
