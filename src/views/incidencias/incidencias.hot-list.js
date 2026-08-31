/* =========================================================
   Onion Support - Incidencias Hot List Interaction Guard

   HOT PATH · SEARCH FOCUS STABILITY · ZERO RERENDER OWNERSHIP

   Responsabilidad:
   - preservar foco/caret del search mientras el controller reconcilia la lista;
   - sobrevivir a list-patches y a un full render de transición de consulta;
   - no filtrar datos, no hacer HTTP y no duplicar estado de negocio.
========================================================= */

export const INCIDENCIAS_HOT_LIST_VERSION =
  "incidencias.hot-list.v1.stable-search-focus";

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
  let restoreTimer = 0;
  let restoreFrame = 0;
  let observer = null;

  const snapshot = {
    value: "",
    start: null,
    end: null,
    direction: "none",
  };

  function readSearchState(node = null) {
    if (!isSearchInput(node)) return false;

    searchOwned = true;
    snapshot.value = String(node.value ?? "");

    try {
      snapshot.start = integerOrNull(node.selectionStart);
      snapshot.end = integerOrNull(node.selectionEnd);
      snapshot.direction = String(node.selectionDirection || "none");
    } catch {
      snapshot.start = null;
      snapshot.end = null;
      snapshot.direction = "none";
    }

    return true;
  }

  function restoreSearchFocus() {
    if (destroyed || !searchOwned || !host?.isConnected) {
      return false;
    }

    const input = host.querySelector?.(SEARCH_INPUT_SELECTOR) || null;
    if (!input) return false;

    try {
      if (input.value !== snapshot.value) {
        input.value = snapshot.value;
      }

      if (documentLike.activeElement !== input) {
        input.focus({ preventScroll: true });
      }

      if (typeof input.setSelectionRange === "function") {
        const length = String(input.value ?? "").length;
        const start = clampSelection(snapshot.start, length);
        const end = clampSelection(snapshot.end, length);

        if (start !== null && end !== null) {
          input.setSelectionRange(
            start,
            end,
            ["forward", "backward", "none"].includes(snapshot.direction)
              ? snapshot.direction
              : "none"
          );
        }
      }

      return true;
    } catch {
      try {
        input.focus?.();
        return true;
      } catch {
        return false;
      }
    }
  }

  function cancelScheduledRestore() {
    if (restoreTimer && windowLike?.clearTimeout) {
      windowLike.clearTimeout(restoreTimer);
    }
    restoreTimer = 0;

    if (restoreFrame && windowLike?.cancelAnimationFrame) {
      windowLike.cancelAnimationFrame(restoreFrame);
    }
    restoreFrame = 0;
  }

  function scheduleRestore() {
    if (destroyed || !searchOwned) return false;

    cancelScheduledRestore();

    if (windowLike?.setTimeout) {
      restoreTimer = windowLike.setTimeout(() => {
        restoreTimer = 0;
        restoreSearchFocus();
      }, 0);
    }

    if (windowLike?.requestAnimationFrame) {
      restoreFrame = windowLike.requestAnimationFrame(() => {
        restoreFrame = windowLike.requestAnimationFrame(() => {
          restoreFrame = 0;
          restoreSearchFocus();
        });
      });
    }

    return true;
  }

  function onFocusIn(event) {
    if (isSearchInput(event.target)) {
      readSearchState(event.target);
    }
  }

  function onInput(event) {
    if (!isSearchInput(event.target)) return;
    readSearchState(event.target);
    scheduleRestore();
  }

  function onSelect(event) {
    if (!isSearchInput(event.target)) return;
    readSearchState(event.target);
  }

  function onKeyDown(event) {
    if (!isSearchInput(event.target)) return;

    if (event.key === "Tab" || event.key === "Escape") {
      searchOwned = false;
      cancelScheduledRestore();
      return;
    }

    readSearchState(event.target);
  }

  function onPointerDown(event) {
    const target = event.target?.nodeType === 3
      ? event.target.parentElement
      : event.target;

    const searchRoot = target?.closest?.(SEARCH_ROOT_SELECTOR) || null;

    if (!searchRoot || !host.contains(searchRoot)) {
      searchOwned = false;
      cancelScheduledRestore();
      return;
    }

    if (target?.closest?.(SEARCH_CLEAR_SELECTOR)) {
      searchOwned = true;
      snapshot.value = "";
      snapshot.start = 0;
      snapshot.end = 0;
      snapshot.direction = "none";
      scheduleRestore();
    }
  }

  function onFocusOut(event) {
    if (!isSearchInput(event.target) || !searchOwned) return;

    const next = event.relatedTarget;
    if (next?.closest?.(SEARCH_ROOT_SELECTOR)) return;

    /*
       Un list-patch puede mover el foco de forma transitoria a la tabla.
       Si el usuario no inició una salida explícita (pointer/Tab/Escape),
       recuperamos search + selección sin scroll-jump.
    */
    scheduleRestore();
  }

  host.addEventListener("focusin", onFocusIn, true);
  host.addEventListener("focusout", onFocusOut, true);
  host.addEventListener("input", onInput, true);
  host.addEventListener("select", onSelect, true);
  host.addEventListener("keydown", onKeyDown, true);
  host.addEventListener("pointerdown", onPointerDown, true);

  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      if (searchOwned) scheduleRestore();
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

    cancelScheduledRestore();
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
