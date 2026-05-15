/* =========================================================
   Onion SPA - Shared Password Field DOM
   Archivo: src/shared/password-field/password-field.dom.js

   ONION SUPPORT · SHARED PASSWORD FIELD DOM
   MULTI FIELD · NO DUPLICATE LISTENERS · NO INNERHTML · 16/10

   Responsabilidades:
   - bindear todos los campos password reutilizables
   - controlar show/hide password
   - controlar indicador de CapsLock
   - evitar listeners duplicados
   - soportar múltiples campos dentro de una misma vista
   - devolver cleanup real: destroy / unbind / off
   - tolerar DOM parcial y templates legacy
   - no usar innerHTML para alternar iconos
   - no usar estilos inline
========================================================= */

/* =========================================================
   VERSION
========================================================= */

export const PASSWORD_FIELD_DOM_VERSION =
  "16.0.0-extreme-pro";

/* =========================================================
   CONSTANTS
========================================================= */

const FIELD_SELECTOR =
  "[data-password-field='true']";

const WRAPPER_SELECTOR =
  "[data-password-wrapper='true'],.password-wrapper,.auth-password-wrapper";

const INPUT_SELECTOR =
  "[data-password-input='true'],input[type='password'],input[type='text'][data-login-password='true']";

const TOGGLE_SELECTOR =
  "[data-password-toggle='true'],[data-login-password-toggle='true'],.password-toggle,.auth-password-toggle";

const TOGGLE_ICON_SELECTOR =
  "[data-password-toggle-icon='true'],.password-toggle-icon";

const CAPS_SELECTOR =
  "[data-password-caps='true'],[data-login-caps='true'],.caps-indicator,.auth-caps-indicator";

const BOUND_ATTR =
  "passwordFieldBound";

const VISIBLE_ATTR =
  "passwordVisible";

const CAPS_ACTIVE_ATTR =
  "capsLockActive";

const DEFAULT_SHOW_LABEL =
  "Mostrar contraseña";

const DEFAULT_HIDE_LABEL =
  "Ocultar contraseña";

const SVG_NS =
  "http://www.w3.org/2000/svg";

/* =========================================================
   RUNTIME
========================================================= */

const FIELD_BINDINGS =
  new WeakMap();

const INPUT_BINDINGS =
  new WeakMap();

const TOGGLE_BINDINGS =
  new WeakMap();

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function isElement(value) {
  if (!value) {
    return false;
  }

  try {
    return value.nodeType === 1;
  } catch {
    return false;
  }
}

function isDocument(value) {
  if (!value) {
    return false;
  }

  try {
    return value.nodeType === 9;
  } catch {
    return false;
  }
}

function isDocumentFragment(value) {
  if (!value) {
    return false;
  }

  try {
    return value.nodeType === 11;
  } catch {
    return false;
  }
}

function isQueryable(value) {
  return Boolean(
    value &&
      isFunction(value.querySelector) &&
      isFunction(value.querySelectorAll)
  );
}

function isHtmlInput(value) {
  if (!value) {
    return false;
  }

  try {
    return value.tagName?.toLowerCase?.() === "input";
  } catch {
    return false;
  }
}

function isHtmlButton(value) {
  if (!value) {
    return false;
  }

  try {
    return value.tagName?.toLowerCase?.() === "button";
  } catch {
    return false;
  }
}

function safeMatches(element, selector = "") {
  if (
    !isElement(element) ||
    !selector
  ) {
    return false;
  }

  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function safeClosest(element, selector = "") {
  if (
    !isElement(element) ||
    !selector
  ) {
    return null;
  }

  try {
    return element.closest(selector);
  } catch {
    return null;
  }
}

function safeQuery(root, selector = "") {
  if (
    !isQueryable(root) ||
    !selector
  ) {
    return null;
  }

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function safeQueryAll(root, selector = "") {
  if (
    !isQueryable(root) ||
    !selector
  ) {
    return [];
  }

  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function setAttr(element, name = "", value = null) {
  if (
    !isElement(element) ||
    !name
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(
        name,
        String(value)
      );
    }

    return true;
  } catch {
    return false;
  }
}

function setDataset(element, key = "", value = null) {
  if (
    !isElement(element) ||
    !key
  ) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete element.dataset[key];
    } else {
      element.dataset[key] =
        String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function toggleClass(element, className = "", enabled = false) {
  if (
    !isElement(element) ||
    !className
  ) {
    return false;
  }

  try {
    element.classList.toggle(
      className,
      Boolean(enabled)
    );

    return true;
  } catch {
    return false;
  }
}

function replaceChildrenSafe(element, children = []) {
  if (!isElement(element)) {
    return false;
  }

  const finalChildren =
    Array.isArray(children)
      ? children.filter(Boolean)
      : [];

  try {
    element.replaceChildren(...finalChildren);
    return true;
  } catch {}

  try {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }

    for (const child of finalChildren) {
      element.appendChild(child);
    }

    return true;
  } catch {
    return false;
  }
}

function safeFocus(input) {
  if (!input) {
    return false;
  }

  try {
    input.focus({
      preventScroll: true,
    });

    return true;
  } catch {}

  try {
    input.focus();
    return true;
  } catch {
    return false;
  }
}

function getActiveElement() {
  if (!isBrowser()) {
    return null;
  }

  try {
    return document.activeElement || null;
  } catch {
    return null;
  }
}

function addDisposableListener(target, eventName, handler, options = false, disposers = []) {
  if (
    !target ||
    !eventName ||
    !isFunction(handler) ||
    !isFunction(target.addEventListener)
  ) {
    return false;
  }

  try {
    target.addEventListener(
      eventName,
      handler,
      options
    );

    disposers.push(() => {
      try {
        target.removeEventListener(
          eventName,
          handler,
          options
        );
      } catch {}
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SVG ICONS · DOM SAFE
========================================================= */

function createSvgElement(name = "svg", attrs = {}) {
  if (!isBrowser()) {
    return null;
  }

  try {
    const node =
      document.createElementNS(
        SVG_NS,
        name
      );

    for (const [key, value] of Object.entries(attrs || {})) {
      if (
        value !== null &&
        value !== undefined &&
        value !== ""
      ) {
        node.setAttribute(
          key,
          String(value)
        );
      }
    }

    return node;
  } catch {
    return null;
  }
}

function createSvgPath(attrs = {}) {
  return createSvgElement(
    "path",
    attrs
  );
}

function createSvgCircle(attrs = {}) {
  return createSvgElement(
    "circle",
    attrs
  );
}

function createEyeIconNode() {
  const svg =
    createSvgElement(
      "svg",
      {
        class: "password-eye-icon",
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": "true",
        focusable: "false",
        width: "18",
        height: "18",
      }
    );

  if (!svg) {
    return null;
  }

  const path =
    createSvgPath({
      d: "M2.75 12s3.25-6 9.25-6 9.25 6 9.25 6-3.25 6-9.25 6-9.25-6-9.25-6Z",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linejoin": "round",
    });

  const circle =
    createSvgCircle({
      cx: "12",
      cy: "12",
      r: "2.7",
      stroke: "currentColor",
      "stroke-width": "1.8",
    });

  if (path) {
    svg.appendChild(path);
  }

  if (circle) {
    svg.appendChild(circle);
  }

  return svg;
}

function createEyeOffIconNode() {
  const svg =
    createSvgElement(
      "svg",
      {
        class: "password-eye-off-icon",
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": "true",
        focusable: "false",
        width: "18",
        height: "18",
      }
    );

  if (!svg) {
    return null;
  }

  const paths = [
    {
      d: "M3.5 4.5 20.5 19.5",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
    },
    {
      d: "M10.58 5.63A10.5 10.5 0 0 1 12 5.55c6 0 9.25 6 9.25 6a15.72 15.72 0 0 1-3.48 4.11",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    {
      d: "M6.2 8.12A15.18 15.18 0 0 0 2.75 11.55s3.25 6 9.25 6c1.36 0 2.59-.3 3.7-.79",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    {
      d: "M9.88 9.96A2.9 2.9 0 0 0 9.3 11.7a2.7 2.7 0 0 0 4.57 1.96",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
  ];

  for (const attrs of paths) {
    const path =
      createSvgPath(attrs);

    if (path) {
      svg.appendChild(path);
    }
  }

  return svg;
}

/* =========================================================
   FIELD RESOLUTION
========================================================= */

function findInput(root) {
  if (!root) {
    return null;
  }

  if (
    isHtmlInput(root) &&
    safeMatches(root, INPUT_SELECTOR)
  ) {
    return root;
  }

  return safeQuery(
    root,
    INPUT_SELECTOR
  );
}

function findToggle(root) {
  if (!root) {
    return null;
  }

  if (
    isHtmlButton(root) &&
    safeMatches(root, TOGGLE_SELECTOR)
  ) {
    return root;
  }

  return safeQuery(
    root,
    TOGGLE_SELECTOR
  );
}

function findCapsIndicator(root) {
  if (!root) {
    return null;
  }

  if (
    isElement(root) &&
    safeMatches(root, CAPS_SELECTOR)
  ) {
    return root;
  }

  return safeQuery(
    root,
    CAPS_SELECTOR
  );
}

function findIconHolder(toggle) {
  if (!toggle) {
    return null;
  }

  const existing =
    safeQuery(
      toggle,
      TOGGLE_ICON_SELECTOR
    );

  if (existing) {
    return existing;
  }

  try {
    const span =
      document.createElement("span");

    span.className =
      "password-toggle-icon";

    span.setAttribute(
      "aria-hidden",
      "true"
    );

    span.setAttribute(
      "data-password-toggle-icon",
      "true"
    );

    span.dataset.state =
      "hidden";

    replaceChildrenSafe(
      toggle,
      [span]
    );

    return span;
  } catch {
    return null;
  }
}

function resolveRootFromParts(fieldRoot) {
  if (!fieldRoot) {
    return null;
  }

  if (safeMatches(fieldRoot, FIELD_SELECTOR)) {
    return fieldRoot;
  }

  const closest =
    safeClosest(
      fieldRoot,
      FIELD_SELECTOR
    );

  if (closest) {
    return closest;
  }

  const wrapper =
    safeMatches(fieldRoot, WRAPPER_SELECTOR)
      ? fieldRoot
      : safeClosest(fieldRoot, WRAPPER_SELECTOR);

  if (wrapper) {
    const wrapperParent =
      safeClosest(
        wrapper,
        FIELD_SELECTOR
      );

    return wrapperParent || wrapper;
  }

  return fieldRoot;
}

function resolveFieldParts(fieldRoot) {
  const root =
    resolveRootFromParts(fieldRoot);

  if (!root) {
    return {
      root: null,
      input: null,
      toggle: null,
      capsIndicator: null,
      iconHolder: null,
    };
  }

  const input =
    findInput(root);

  const toggle =
    findToggle(root);

  const capsIndicator =
    findCapsIndicator(root);

  const iconHolder =
    findIconHolder(toggle);

  return {
    root,
    input,
    toggle,
    capsIndicator,
    iconHolder,
  };
}

function isValidPasswordParts(parts = {}) {
  return Boolean(
    isElement(parts.root) &&
      isHtmlInput(parts.input) &&
      isHtmlButton(parts.toggle)
  );
}

/* =========================================================
   UI STATE
========================================================= */

function getShowLabel(toggle) {
  return (
    safeText(
      toggle?.dataset?.showLabel,
      ""
    ) ||
    safeText(
      toggle?.getAttribute?.("data-show-label"),
      ""
    ) ||
    DEFAULT_SHOW_LABEL
  );
}

function getHideLabel(toggle) {
  return (
    safeText(
      toggle?.dataset?.hideLabel,
      ""
    ) ||
    safeText(
      toggle?.getAttribute?.("data-hide-label"),
      ""
    ) ||
    DEFAULT_HIDE_LABEL
  );
}

function setIconState(iconHolder, visible = false) {
  if (!isElement(iconHolder)) {
    return false;
  }

  const icon =
    visible
      ? createEyeOffIconNode()
      : createEyeIconNode();

  if (!icon) {
    return false;
  }

  replaceChildrenSafe(
    iconHolder,
    [icon]
  );

  setDataset(
    iconHolder,
    "state",
    visible ? "visible" : "hidden"
  );

  toggleClass(
    iconHolder,
    "is-visible",
    visible
  );

  toggleClass(
    iconHolder,
    "is-hidden",
    !visible
  );

  return true;
}

function setPressedState(toggle, visible = false, iconHolder = null) {
  if (!isHtmlButton(toggle)) {
    return false;
  }

  const isVisible =
    Boolean(visible);

  const showLabel =
    getShowLabel(toggle);

  const hideLabel =
    getHideLabel(toggle);

  setAttr(
    toggle,
    "aria-pressed",
    isVisible ? "true" : "false"
  );

  setAttr(
    toggle,
    "aria-label",
    isVisible ? hideLabel : showLabel
  );

  setDataset(
    toggle,
    VISIBLE_ATTR,
    isVisible ? "true" : "false"
  );

  toggleClass(
    toggle,
    "active",
    isVisible
  );

  toggleClass(
    toggle,
    "is-visible",
    isVisible
  );

  toggleClass(
    toggle,
    "is-hidden",
    !isVisible
  );

  setIconState(
    iconHolder || findIconHolder(toggle),
    isVisible
  );

  return true;
}

function setInputVisibility(input, visible = false) {
  if (!isHtmlInput(input)) {
    return false;
  }

  const nextType =
    visible ? "text" : "password";

  if (input.type === nextType) {
    return true;
  }

  let selectionStart = null;
  let selectionEnd = null;

  try {
    selectionStart =
      input.selectionStart;

    selectionEnd =
      input.selectionEnd;
  } catch {}

  try {
    input.type =
      nextType;
  } catch {
    return false;
  }

  try {
    if (
      selectionStart !== null &&
      selectionEnd !== null &&
      isFunction(input.setSelectionRange)
    ) {
      input.setSelectionRange(
        selectionStart,
        selectionEnd
      );
    }
  } catch {}

  return true;
}

function setCapsState(indicator, active = false) {
  if (!isElement(indicator)) {
    return false;
  }

  const enabled =
    Boolean(active);

  try {
    indicator.hidden =
      !enabled;
  } catch {}

  setAttr(
    indicator,
    "aria-hidden",
    enabled ? "false" : "true"
  );

  setDataset(
    indicator,
    CAPS_ACTIVE_ATTR,
    enabled ? "true" : null
  );

  toggleClass(
    indicator,
    "is-visible",
    enabled
  );

  toggleClass(
    indicator,
    "is-hidden",
    !enabled
  );

  return true;
}

function readCapsStateFromEvent(event) {
  if (
    !event ||
    !isFunction(event.getModifierState)
  ) {
    return false;
  }

  try {
    return Boolean(
      event.getModifierState("CapsLock")
    );
  } catch {
    return false;
  }
}

function shouldShowCapsForInput(input) {
  return Boolean(
    isHtmlInput(input) &&
      getActiveElement() === input
  );
}

/* =========================================================
   PUBLIC BIND API
========================================================= */

export function bindPasswordField(fieldRoot) {
  if (!isBrowser()) {
    return null;
  }

  if (!isElement(fieldRoot)) {
    return null;
  }

  const parts =
    resolveFieldParts(fieldRoot);

  if (!isValidPasswordParts(parts)) {
    return null;
  }

  const {
    root,
    input,
    toggle,
    capsIndicator,
    iconHolder,
  } =
    parts;

  const existingByRoot =
    FIELD_BINDINGS.get(root);

  if (
    existingByRoot &&
    existingByRoot.destroyed !== true
  ) {
    return existingByRoot;
  }

  const existingByInput =
    INPUT_BINDINGS.get(input);

  if (
    existingByInput &&
    existingByInput.destroyed !== true
  ) {
    return existingByInput;
  }

  const existingByToggle =
    TOGGLE_BINDINGS.get(toggle);

  if (
    existingByToggle &&
    existingByToggle.destroyed !== true
  ) {
    return existingByToggle;
  }

  const disposers = [];

  let destroyed =
    false;

  function isDestroyed() {
    return Boolean(destroyed);
  }

  function getVisible() {
    try {
      return input.type === "text";
    } catch {
      return false;
    }
  }

  function syncVisibilityUI() {
    if (destroyed) {
      return false;
    }

    const visible =
      getVisible();

    setDataset(
      root,
      VISIBLE_ATTR,
      visible ? "true" : "false"
    );

    setDataset(
      input,
      VISIBLE_ATTR,
      visible ? "true" : "false"
    );

    setPressedState(
      toggle,
      visible,
      iconHolder
    );

    return visible;
  }

  function setVisible(visible = false, options = {}) {
    if (destroyed) {
      return false;
    }

    const next =
      Boolean(visible);

    const changed =
      setInputVisibility(
        input,
        next
      );

    syncVisibilityUI();

    if (options.focus !== false) {
      safeFocus(input);
    }

    return changed;
  }

  function toggleVisibility(options = {}) {
    if (destroyed) {
      return false;
    }

    if (
      input.disabled ||
      toggle.disabled ||
      toggle.getAttribute("aria-disabled") === "true"
    ) {
      return getVisible();
    }

    return setVisible(
      !getVisible(),
      options
    );
  }

  function syncCapsFromEvent(event) {
    if (
      destroyed ||
      !capsIndicator
    ) {
      return false;
    }

    const active =
      shouldShowCapsForInput(input) &&
      readCapsStateFromEvent(event);

    return setCapsState(
      capsIndicator,
      active
    );
  }

  function hideCaps() {
    if (
      destroyed ||
      !capsIndicator
    ) {
      return false;
    }

    return setCapsState(
      capsIndicator,
      false
    );
  }

  function handleToggleClick(event) {
    try {
      event?.preventDefault?.();
    } catch {}

    toggleVisibility({
      focus: true,
    });
  }

  function handleInputKeyEvent(event) {
    syncCapsFromEvent(event);
  }

  function handleInputFocus(event) {
    syncCapsFromEvent(event);
  }

  function handleInputBlur() {
    hideCaps();
  }

  function handleFormReset() {
    try {
      window.setTimeout(() => {
        if (!destroyed) {
          setVisible(
            false,
            {
              focus: false,
            }
          );

          hideCaps();
        }
      }, 0);
    } catch {}
  }

  addDisposableListener(
    toggle,
    "click",
    handleToggleClick,
    false,
    disposers
  );

  addDisposableListener(
    input,
    "keydown",
    handleInputKeyEvent,
    false,
    disposers
  );

  addDisposableListener(
    input,
    "keyup",
    handleInputKeyEvent,
    false,
    disposers
  );

  addDisposableListener(
    input,
    "focus",
    handleInputFocus,
    false,
    disposers
  );

  addDisposableListener(
    input,
    "blur",
    handleInputBlur,
    false,
    disposers
  );

  const form =
    safeClosest(
      input,
      "form"
    );

  if (form) {
    addDisposableListener(
      form,
      "reset",
      handleFormReset,
      false,
      disposers
    );
  }

  if (isBrowser()) {
    addDisposableListener(
      document,
      "visibilitychange",
      () => {
        if (document.hidden) {
          hideCaps();
        }
      },
      false,
      disposers
    );
  }

  setDataset(
    root,
    BOUND_ATTR,
    "true"
  );

  setDataset(
    root,
    "passwordFieldDomVersion",
    PASSWORD_FIELD_DOM_VERSION
  );

  setDataset(
    input,
    BOUND_ATTR,
    "true"
  );

  setDataset(
    toggle,
    BOUND_ATTR,
    "true"
  );

  setAttr(
    toggle,
    "aria-controls",
    input.id || null
  );

  syncVisibilityUI();
  hideCaps();

  const binding = {
    version:
      PASSWORD_FIELD_DOM_VERSION,

    root,
    input,
    toggle,
    capsIndicator:
      capsIndicator || null,
    iconHolder:
      iconHolder || null,

    get destroyed() {
      return destroyed;
    },

    get visible() {
      return getVisible();
    },

    isDestroyed,
    getVisible,

    setVisible,
    toggleVisibility,
    syncVisibilityUI,
    syncCapsFromEvent,
    hideCaps,

    destroy() {
      if (destroyed) {
        return false;
      }

      destroyed =
        true;

      for (const dispose of disposers.splice(0)) {
        try {
          dispose();
        } catch {}
      }

      hideCaps();

      setDataset(
        root,
        BOUND_ATTR,
        null
      );

      setDataset(
        input,
        BOUND_ATTR,
        null
      );

      setDataset(
        toggle,
        BOUND_ATTR,
        null
      );

      FIELD_BINDINGS.delete(root);
      INPUT_BINDINGS.delete(input);
      TOGGLE_BINDINGS.delete(toggle);

      return true;
    },

    unbind() {
      return this.destroy();
    },

    off() {
      return this.destroy();
    },

    dispose() {
      return this.destroy();
    },

    getSnapshot() {
      return getPasswordFieldSnapshot(binding);
    },
  };

  FIELD_BINDINGS.set(
    root,
    binding
  );

  INPUT_BINDINGS.set(
    input,
    binding
  );

  TOGGLE_BINDINGS.set(
    toggle,
    binding
  );

  return binding;
}

export function unbindPasswordField(fieldRoot) {
  if (!isElement(fieldRoot)) {
    return false;
  }

  const parts =
    resolveFieldParts(fieldRoot);

  const binding =
    FIELD_BINDINGS.get(parts.root) ||
    INPUT_BINDINGS.get(parts.input) ||
    TOGGLE_BINDINGS.get(parts.toggle) ||
    null;

  if (!binding) {
    return false;
  }

  return binding.destroy();
}

export function isPasswordFieldBound(fieldRoot) {
  if (!isElement(fieldRoot)) {
    return false;
  }

  const parts =
    resolveFieldParts(fieldRoot);

  const binding =
    FIELD_BINDINGS.get(parts.root) ||
    INPUT_BINDINGS.get(parts.input) ||
    TOGGLE_BINDINGS.get(parts.toggle) ||
    null;

  return Boolean(
    binding &&
      binding.destroyed !== true
  );
}

function collectFieldRoots(scope = document) {
  if (!isBrowser()) {
    return [];
  }

  const root =
    scope || document;

  if (
    !isQueryable(root) &&
    !isElement(root) &&
    !isDocument(root) &&
    !isDocumentFragment(root)
  ) {
    return [];
  }

  const roots = [];

  if (
    isElement(root) &&
    safeMatches(root, FIELD_SELECTOR)
  ) {
    roots.push(root);
  }

  for (const field of safeQueryAll(root, FIELD_SELECTOR)) {
    roots.push(field);
  }

  /*
    Compat legacy:
    si hay wrappers sin data-password-field, se aceptan como root.
  */
  for (const wrapper of safeQueryAll(root, WRAPPER_SELECTOR)) {
    const closestField =
      safeClosest(
        wrapper,
        FIELD_SELECTOR
      );

    if (!closestField) {
      const input =
        findInput(wrapper);

      const toggle =
        findToggle(wrapper);

      if (
        input &&
        toggle
      ) {
        roots.push(wrapper);
      }
    }
  }

  const unique = [];
  const seen = new Set();

  for (const item of roots) {
    if (
      item &&
      !seen.has(item)
    ) {
      seen.add(item);
      unique.push(item);
    }
  }

  return unique;
}

export function bindPasswordFieldsInScope(scope = document) {
  if (!isBrowser()) {
    return [];
  }

  const roots =
    collectFieldRoots(scope);

  return roots
    .map((root) =>
      bindPasswordField(root)
    )
    .filter(Boolean);
}

export function unbindPasswordFieldsInScope(scope = document) {
  if (!isBrowser()) {
    return 0;
  }

  const roots =
    collectFieldRoots(scope);

  let count = 0;

  for (const root of roots) {
    if (unbindPasswordField(root)) {
      count += 1;
    }
  }

  return count;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getPasswordFieldSnapshot(bindingOrRoot = null) {
  let binding =
    null;

  if (
    bindingOrRoot &&
    bindingOrRoot.root &&
    bindingOrRoot.input
  ) {
    binding =
      bindingOrRoot;
  } else if (isElement(bindingOrRoot)) {
    const parts =
      resolveFieldParts(bindingOrRoot);

    binding =
      FIELD_BINDINGS.get(parts.root) ||
      INPUT_BINDINGS.get(parts.input) ||
      TOGGLE_BINDINGS.get(parts.toggle) ||
      null;
  }

  if (!binding) {
    return {
      version:
        PASSWORD_FIELD_DOM_VERSION,
      bound:
        false,
    };
  }

  return {
    version:
      PASSWORD_FIELD_DOM_VERSION,

    bound:
      binding.destroyed !== true,

    destroyed:
      Boolean(binding.destroyed),

    visible:
      Boolean(binding.visible),

    root: {
      id:
        safeText(binding.root?.id, ""),
      datasetBound:
        safeText(binding.root?.dataset?.[BOUND_ATTR], ""),
      datasetVisible:
        safeText(binding.root?.dataset?.[VISIBLE_ATTR], ""),
    },

    input: {
      id:
        safeText(binding.input?.id, ""),
      name:
        safeText(binding.input?.name, ""),
      type:
        safeText(binding.input?.type, ""),
      disabled:
        Boolean(binding.input?.disabled),
      datasetBound:
        safeText(binding.input?.dataset?.[BOUND_ATTR], ""),
    },

    toggle: {
      id:
        safeText(binding.toggle?.id, ""),
      disabled:
        Boolean(binding.toggle?.disabled),
      ariaPressed:
        safeText(binding.toggle?.getAttribute?.("aria-pressed"), ""),
      ariaLabel:
        safeText(binding.toggle?.getAttribute?.("aria-label"), ""),
      datasetVisible:
        safeText(binding.toggle?.dataset?.[VISIBLE_ATTR], ""),
    },

    caps: {
      exists:
        Boolean(binding.capsIndicator),
      hidden:
        Boolean(binding.capsIndicator?.hidden),
      active:
        safeText(binding.capsIndicator?.dataset?.[CAPS_ACTIVE_ATTR], "") === "true",
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default bindPasswordFieldsInScope;
