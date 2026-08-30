/* =========================================================
   Onion Support - Incidencias Create User Combobox
   Archivo: /src/views/incidencias/incidencias.create-user-combobox.js

   ACCESSIBLE · KEYBOARD-FIRST · DOM ENHANCEMENT

   Responsabilidad:
   - Mejorar exclusivamente el selector de usuario del Create admin.
   - Mantener el foco en el input mientras se navega por resultados.
   - ArrowUp/ArrowDown/Home/End cambian la opción activa.
   - Enter selecciona la opción activa usando el click canónico existente.
   - Enter nunca puede enviar el formulario Create mientras el popup está abierto.
   - Escape cierra únicamente el popup si está abierto; un segundo Escape
     vuelve a pertenecer al controlador del modal.
   - Añadir combobox/listbox/aria-activedescendant sin duplicar selección.
   - Respetar IME/composition.
   - No hacer HTTP, no conocer Store/Auth y no crear una segunda fuente de estado.
========================================================= */

export const INCIDENCIAS_CREATE_USER_COMBOBOX_VERSION =
  "incidencias.create-user-combobox.v2-enter-safe";

const ROOT_SELECTOR = "[data-incidencias-create-root='true']";
const INPUT_SELECTOR = "[data-create-user-search-input='true']";
const LIST_SELECTOR = "[data-create-user-results='true']";
const OPTION_SELECTOR = "[role='option'][data-create-action='create-user-select']";
const LIST_ID = "incidencias-create-user-results-listbox";
const OPTION_ID_PREFIX = "incidencias-create-user-option";

function isElement(value = null) {
  return Boolean(value && value.nodeType === 1 && typeof value.matches === "function");
}

function inputFromEvent(event = null) {
  const target = event?.target;
  return isElement(target) && target.matches(INPUT_SELECTOR) ? target : null;
}

function rootForInput(input = null) {
  return input?.closest?.(ROOT_SELECTOR) || null;
}

function resultsForRoot(root = null) {
  return root?.querySelector?.(LIST_SELECTOR) || null;
}

function optionsForRoot(root = null) {
  return Array.from(root?.querySelectorAll?.(OPTION_SELECTOR) || []);
}

function optionId(index = 0) {
  return `${OPTION_ID_PREFIX}-${Math.max(0, Number(index) || 0)}`;
}

export function getIncidenciasCreateUserComboboxSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_CREATE_USER_COMBOBOX_VERSION,
    selectors: Object.freeze({
      root: ROOT_SELECTOR,
      input: INPUT_SELECTOR,
      list: LIST_SELECTOR,
      option: OPTION_SELECTOR,
    }),
    keyboard: Object.freeze([
      "ArrowDown",
      "ArrowUp",
      "Home",
      "End",
      "Enter",
      "Escape",
    ]),
    policy: Object.freeze({
      inputKeepsFocus: true,
      usesActiveDescendant: true,
      selectionDelegatesToCanonicalClick: true,
      enterNeverSubmitsCreateWhilePopupOpen: true,
      escapeDismissesPopupBeforeModal: true,
      imeSafe: true,
      noHttp: true,
      noAuth: true,
      noStore: true,
    }),
  });
}

export function installIncidenciasCreateUserCombobox({
  document: documentLike = typeof document !== "undefined" ? document : null,
} = {}) {
  if (!documentLike?.addEventListener || !documentLike?.querySelector) {
    return () => false;
  }

  let activeIndex = -1;
  let dismissedValue = null;
  let composing = false;
  let syncQueued = false;
  let destroyed = false;

  function currentInput() {
    return documentLike.querySelector(INPUT_SELECTOR);
  }

  function popupState(input = currentInput()) {
    const root = rootForInput(input);
    const list = resultsForRoot(root);
    const options = optionsForRoot(root);
    const dismissed = Boolean(
      input && dismissedValue !== null && dismissedValue === String(input.value ?? "")
    );

    return {
      input,
      root,
      list,
      options,
      expanded: Boolean(input && list && options.length && !dismissed),
    };
  }

  function syncNow() {
    syncQueued = false;
    if (destroyed) return false;

    const state = popupState();
    const { input, list, options } = state;

    if (!input) {
      activeIndex = -1;
      dismissedValue = null;
      return false;
    }

    if (!options.length) {
      activeIndex = -1;
    } else if (activeIndex >= options.length) {
      activeIndex = options.length - 1;
    }

    const expanded = Boolean(state.expanded);

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-controls", LIST_ID);
    input.setAttribute("aria-expanded", expanded ? "true" : "false");

    if (list) {
      list.id = LIST_ID;
      list.setAttribute("role", "listbox");
      list.hidden = !expanded;
    }

    options.forEach((option, index) => {
      const selected = expanded && index === activeIndex;
      option.id = optionId(index);
      option.tabIndex = -1;
      option.dataset.comboboxIndex = String(index);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", selected ? "true" : "false");
    });

    if (expanded && activeIndex >= 0 && options[activeIndex]) {
      input.setAttribute("aria-activedescendant", options[activeIndex].id);
    } else {
      input.removeAttribute("aria-activedescendant");
    }

    return true;
  }

  function queueSync() {
    if (destroyed || syncQueued) return false;
    syncQueued = true;

    if (typeof queueMicrotask === "function") {
      queueMicrotask(syncNow);
    } else {
      Promise.resolve().then(syncNow);
    }

    return true;
  }

  function setActiveIndex(index = -1) {
    const { options } = popupState();
    if (!options.length) {
      activeIndex = -1;
      syncNow();
      return false;
    }

    const numeric = Number(index);
    activeIndex = Number.isFinite(numeric)
      ? Math.max(0, Math.min(Math.trunc(numeric), options.length - 1))
      : 0;

    dismissedValue = null;
    syncNow();
    return true;
  }

  function moveActive(delta = 1) {
    const { options } = popupState();
    if (!options.length) return false;

    if (activeIndex < 0) {
      return setActiveIndex(delta < 0 ? options.length - 1 : 0);
    }

    const next = (activeIndex + delta + options.length) % options.length;
    return setActiveIndex(next);
  }

  function selectActive() {
    const { options, expanded } = popupState();
    if (!expanded || activeIndex < 0 || !options[activeIndex]) return false;

    const option = options[activeIndex];
    activeIndex = -1;
    dismissedValue = null;

    option.click();
    queueSync();
    return true;
  }

  function dismissPopup(input = currentInput()) {
    if (!input) return false;

    const { expanded } = popupState(input);
    if (!expanded) return false;

    dismissedValue = String(input.value ?? "");
    activeIndex = -1;
    syncNow();
    return true;
  }

  function onKeydown(event) {
    const input = inputFromEvent(event);
    if (!input || !rootForInput(input) || event.isComposing || composing) return;

    const { options, expanded } = popupState(input);

    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      if (!options.length) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "ArrowDown") moveActive(1);
      else if (event.key === "ArrowUp") moveActive(-1);
      else if (event.key === "Home") setActiveIndex(0);
      else setActiveIndex(options.length - 1);

      return;
    }

    if (event.key === "Enter" && expanded) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (activeIndex >= 0) {
        selectActive();
      }

      return;
    }

    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopImmediatePropagation();
      dismissPopup(input);
    }
  }

  function onInput(event) {
    const input = inputFromEvent(event);
    if (!input || event.isComposing || composing) return;

    activeIndex = -1;
    dismissedValue = null;
    queueSync();
  }

  function onCompositionStart(event) {
    if (!inputFromEvent(event)) return;
    composing = true;
    activeIndex = -1;
  }

  function onCompositionEnd(event) {
    if (!inputFromEvent(event)) return;
    composing = false;
    activeIndex = -1;
    dismissedValue = null;
    queueSync();
  }

  function onClick(event) {
    const target = isElement(event?.target) ? event.target : null;
    const option = target?.closest?.(OPTION_SELECTOR);
    if (!option) return;

    activeIndex = -1;
    dismissedValue = null;
    queueSync();
  }

  documentLike.addEventListener("keydown", onKeydown, true);
  documentLike.addEventListener("input", onInput, true);
  documentLike.addEventListener("compositionstart", onCompositionStart, true);
  documentLike.addEventListener("compositionend", onCompositionEnd, true);
  documentLike.addEventListener("click", onClick, true);

  const observer = typeof MutationObserver !== "undefined"
    ? new MutationObserver(queueSync)
    : null;

  observer?.observe?.(documentLike.body || documentLike.documentElement, {
    childList: true,
    subtree: true,
  });

  syncNow();

  return function uninstallIncidenciasCreateUserCombobox() {
    if (destroyed) return false;
    destroyed = true;

    observer?.disconnect?.();
    documentLike.removeEventListener("keydown", onKeydown, true);
    documentLike.removeEventListener("input", onInput, true);
    documentLike.removeEventListener("compositionstart", onCompositionStart, true);
    documentLike.removeEventListener("compositionend", onCompositionEnd, true);
    documentLike.removeEventListener("click", onClick, true);

    return true;
  };
}

export default installIncidenciasCreateUserCombobox;
