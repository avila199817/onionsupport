/* =========================================================
   Onion SPA - Login DOM
   Archivo: src/views/login/login.dom.js

   LOGIN DOM · FINAL EXTREME PRO SYSTEM · 15/10

   RESPONSABILIDADES:
   - resolver refs del DOM del login
   - encapsular estados visuales del formulario
   - aplicar y limpiar errores
   - controlar loading UI sin innerHTML
   - integrar opcionalmente el sistema compartido password-field
   - gestionar focus inicial
   - soportar usuario, email o teléfono como identificador
   - evitar doble binding accidental de submit/listeners
   - no duplicar el bind del password-field desde getLoginRefs()

   REGLAS:
   - getLoginRefs() NO bindea password-field.
   - El bind compartido vive en index.js o en bindLoginPasswordFields().
   - setLoginLoading() no usa innerHTML.
   - Password no se trimea al leer el formulario.
   - Submit/input/theme listeners devuelven cleanup idempotente.
========================================================= */

import {
  bindPasswordFieldsInScope,
} from "../../shared/password-field/index.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const LOGIN_DOM_VERSION =
  "15.0.0-final-extreme";

const LOGIN_DOM_SOURCE =
  "login.dom";

const DEFAULT_SUBMIT_LABEL =
  "Entrar al panel";

const DEFAULT_LOADING_LABEL =
  "Accediendo...";

const DEFAULT_SHOW_PASSWORD_LABEL =
  "Mostrar contraseña";

const DEFAULT_HIDE_PASSWORD_LABEL =
  "Ocultar contraseña";

const SELECTORS =
  Object.freeze({
    root:
      [
        ".login-view",
        "[data-login-view='true']",
        "[data-login-view]",
        "#loginView",
      ],

    form:
      [
        "#loginForm",
        "[data-login-form='true']",
        "[data-login-form]",
        "form[data-auth-form='login']",
        "form",
      ],

    identifier:
      [
        "#loginIdentifier",
        "#loginEmail",
        "[name='identifier']",
        "[name='email']",
        "[name='username']",
        "[name='user']",
        "[name='login']",
        "[data-login-identifier='true']",
        "[data-login-identifier]",
        "input[type='email']",
        "input[autocomplete='username']",
      ],

    password:
      [
        "#loginPassword",
        "[name='password']",
        "[data-login-password='true']",
        "[data-login-password]",
        "[data-password-input='true']",
        "[data-password-input]",
        "input[type='password']",
        "input[autocomplete='current-password']",
      ],

    remember:
      [
        "#loginRemember",
        "[name='remember']",
        "[name='rememberMe']",
        "[name='remember_me']",
        "[data-login-remember='true']",
        "[data-login-remember]",
      ],

    errorBox:
      [
        "#loginError",
        "[data-login-error='true']",
        "[data-login-error]",
        "[data-form-error]",
        ".login-error",
      ],

    submit:
      [
        "#loginSubmit",
        "[data-login-submit='true']",
        "[data-login-submit]",
        "button[type='submit']",
      ],

    themeToggle:
      [
        "#loginThemeToggle",
        "[data-login-theme-toggle='true']",
        "[data-login-theme-toggle]",
        "[data-theme-toggle='true']",
        "[data-theme-toggle]",
      ],

    passwordToggle:
      [
        "#togglePassword",
        "#loginPasswordToggle",
        "[data-password-toggle='true']",
        "[data-password-toggle]",
        "[data-login-password-toggle='true']",
        "[data-login-password-toggle]",
      ],

    capsIndicator:
      [
        "#loginCapsIndicator",
        "[data-password-caps='true']",
        "[data-password-caps]",
        "[data-login-caps='true']",
        "[data-login-caps]",
      ],

    forgotPasswordLink:
      [
        "#forgotPasswordLink",
        "[data-forgot-password-link='true']",
        "[data-forgot-password-link]",
        "[data-login-forgot-password]",
      ],

    fieldIdentifier:
      [
        "[data-field='identifier']",
        "[data-field='email']",
        "[data-login-field='identifier']",
        "[data-login-field='email']",
      ],

    fieldPassword:
      [
        "[data-field='password']",
        "[data-login-field='password']",
      ],

    errorIdentifier:
      [
        "[data-error-for='identifier']",
        "[data-error-for='email']",
        "[data-login-error-for='identifier']",
        "[data-login-error-for='email']",
      ],

    errorPassword:
      [
        "[data-error-for='password']",
        "[data-login-error-for='password']",
      ],

    submitText:
      [
        ".login-submit-text",
        "[data-login-submit-text]",
      ],
  });

const SUBMIT_BINDINGS =
  new WeakMap();

const PASSWORD_TOGGLE_BINDINGS =
  new WeakMap();

const PASSWORD_SHARED_BINDINGS =
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

function isFn(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function toText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function toRawValue(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1) return true;
  if (value === 0) return false;

  if (typeof value === "string") {
    const clean =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
      ].includes(clean)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(clean)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeNowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function noop() {}

function qs(root, selector) {
  if (
    !root ||
    !selector
  ) {
    return null;
  }

  try {
    return root.querySelector(selector) || null;
  } catch {
    return null;
  }
}

function queryFirst(root, selectors = []) {
  const scope =
    root ||
    (
      isBrowser()
        ? document
        : null
    );

  if (!scope) {
    return null;
  }

  for (const selector of safeArray(selectors)) {
    const cleanSelector =
      toText(selector, "");

    if (!cleanSelector) {
      continue;
    }

    try {
      if (
        cleanSelector.startsWith("#") &&
        scope === document
      ) {
        const byId =
          document.getElementById(
            cleanSelector.slice(1)
          );

        if (byId) {
          return byId;
        }
      }

      const found =
        scope.querySelector?.(
          cleanSelector
        );

      if (found) {
        return found;
      }
    } catch {}
  }

  return null;
}

function isConnected(node) {
  if (!node) {
    return false;
  }

  try {
    return Boolean(node.isConnected);
  } catch {}

  try {
    return document.contains(node);
  } catch {}

  return false;
}

function setAttr(node, name, value) {
  if (
    !node ||
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
      node.removeAttribute(name);
    } else {
      node.setAttribute(
        name,
        String(value)
      );
    }

    return true;
  } catch {
    return false;
  }
}

function removeAttr(node, name) {
  if (
    !node ||
    !name
  ) {
    return false;
  }

  try {
    node.removeAttribute(name);
    return true;
  } catch {
    return false;
  }
}

function setDataset(node, key, value) {
  if (
    !node ||
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
      delete node.dataset[key];
    } else {
      node.dataset[key] =
        String(value);
    }

    return true;
  } catch {
    return false;
  }
}

function toggleClass(node, className, enabled) {
  if (
    !node ||
    !className
  ) {
    return false;
  }

  try {
    node.classList.toggle(
      className,
      Boolean(enabled)
    );

    return true;
  } catch {
    return false;
  }
}

function addClass(node, ...classes) {
  if (!node) {
    return false;
  }

  const clean =
    classes
      .map((item) => toText(item, ""))
      .filter(Boolean);

  if (!clean.length) {
    return false;
  }

  try {
    node.classList.add(...clean);
    return true;
  } catch {
    return false;
  }
}

function removeClass(node, ...classes) {
  if (!node) {
    return false;
  }

  const clean =
    classes
      .map((item) => toText(item, ""))
      .filter(Boolean);

  if (!clean.length) {
    return false;
  }

  try {
    node.classList.remove(...clean);
    return true;
  } catch {
    return false;
  }
}

function setText(node, value = "") {
  if (!node) {
    return false;
  }

  try {
    node.textContent =
      toText(value, "");

    return true;
  } catch {
    return false;
  }
}

function setHidden(node, hidden = false) {
  if (!node) {
    return false;
  }

  try {
    node.hidden =
      Boolean(hidden);
  } catch {}

  setAttr(
    node,
    "aria-hidden",
    hidden ? "true" : "false"
  );

  return true;
}

function createSpan(className = "", text = "") {
  if (!isBrowser()) {
    return null;
  }

  try {
    const span =
      document.createElement("span");

    if (className) {
      span.className =
        className;
    }

    if (text) {
      span.textContent =
        text;
    }

    return span;
  } catch {
    return null;
  }
}

function replaceChildrenSafe(node, children = []) {
  if (!node) {
    return false;
  }

  const cleanChildren =
    safeArray(children)
      .filter(Boolean);

  try {
    node.replaceChildren(...cleanChildren);
    return true;
  } catch {}

  try {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }

    for (const child of cleanChildren) {
      node.appendChild(child);
    }

    return true;
  } catch {
    return false;
  }
}

function scheduleMicrotask(callback) {
  if (!isFn(callback)) {
    return;
  }

  try {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(callback);
      return;
    }
  } catch {}

  try {
    Promise.resolve()
      .then(callback)
      .catch(noop);

    return;
  } catch {}

  try {
    setTimeout(callback, 0);
  } catch {}
}

function safeFocus(node, options = {}) {
  if (!node) {
    return false;
  }

  try {
    node.focus({
      preventScroll:
        options.preventScroll !== false,
    });

    return true;
  } catch {}

  try {
    node.focus();
    return true;
  } catch {
    return false;
  }
}

function safeSelect(node) {
  if (!node) {
    return false;
  }

  try {
    node.select?.();
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SHARED PASSWORD FIELD · OPTIONAL API
========================================================= */

export function bindLoginPasswordFields(container = null, options = {}) {
  const root =
    container ||
    (
      isBrowser()
        ? document
        : null
    );

  if (!root) {
    return [];
  }

  if (
    PASSWORD_SHARED_BINDINGS.has(root) &&
    options.force !== true
  ) {
    return PASSWORD_SHARED_BINDINGS.get(root) || [];
  }

  try {
    const bindings =
      bindPasswordFieldsInScope(root);

    const normalized =
      Array.isArray(bindings)
        ? bindings
        : [];

    PASSWORD_SHARED_BINDINGS.set(
      root,
      normalized
    );

    return normalized;
  } catch {
    PASSWORD_SHARED_BINDINGS.set(
      root,
      []
    );

    return [];
  }
}

export function destroyLoginPasswordFields(container = null) {
  const root =
    container ||
    (
      isBrowser()
        ? document
        : null
    );

  if (!root) {
    return false;
  }

  const bindings =
    PASSWORD_SHARED_BINDINGS.get(root) || [];

  for (const binding of bindings) {
    try {
      if (isFn(binding)) {
        binding();
        continue;
      }

      if (isFn(binding?.destroy)) {
        binding.destroy();
        continue;
      }

      if (isFn(binding?.unbind)) {
        binding.unbind();
        continue;
      }

      if (isFn(binding?.off)) {
        binding.off();
      }
    } catch {}
  }

  PASSWORD_SHARED_BINDINGS.delete(root);

  return true;
}

/* =========================================================
   REFS
========================================================= */

export function getLoginRefs(container) {
  const safeContainer =
    container ||
    (
      isBrowser()
        ? document
        : null
    );

  const root =
    queryFirst(
      safeContainer,
      SELECTORS.root
    ) ||
    safeContainer;

  const form =
    queryFirst(
      root,
      SELECTORS.form
    );

  const scope =
    form ||
    root ||
    safeContainer;

  const identifierInput =
    queryFirst(
      scope,
      SELECTORS.identifier
    );

  const passwordInput =
    queryFirst(
      scope,
      SELECTORS.password
    );

  const togglePasswordButton =
    queryFirst(
      scope,
      SELECTORS.passwordToggle
    );

  const capsIndicator =
    queryFirst(
      scope,
      SELECTORS.capsIndicator
    );

  const refs = {
    container:
      safeContainer,

    root,

    form,

    emailInput:
      identifierInput,

    identifierInput,

    passwordInput,

    rememberInput:
      queryFirst(
        scope,
        SELECTORS.remember
      ),

    errorBox:
      queryFirst(
        scope,
        SELECTORS.errorBox
      ),

    submitButton:
      queryFirst(
        scope,
        SELECTORS.submit
      ),

    themeToggleButton:
      queryFirst(
        scope,
        SELECTORS.themeToggle
      ),

    togglePasswordButton,

    capsIndicator,

    forgotPasswordLink:
      queryFirst(
        scope,
        SELECTORS.forgotPasswordLink
      ),

    fieldEmail:
      queryFirst(
        scope,
        SELECTORS.fieldIdentifier
      ),

    fieldIdentifier:
      queryFirst(
        scope,
        SELECTORS.fieldIdentifier
      ),

    fieldPassword:
      queryFirst(
        scope,
        SELECTORS.fieldPassword
      ),

    errorIdentifier:
      queryFirst(
        scope,
        SELECTORS.errorIdentifier
      ),

    errorEmail:
      queryFirst(
        scope,
        SELECTORS.errorIdentifier
      ),

    errorPassword:
      queryFirst(
        scope,
        SELECTORS.errorPassword
      ),

    submitText:
      queryFirst(
        scope,
        SELECTORS.submitText
      ),

    /*
      Compatibilidad:
      getLoginRefs NO bindea shared password-field.
    */
    passwordFieldBindings:
      [],

    passwordField: {
      input:
        passwordInput,

      toggle:
        togglePasswordButton,

      capsIndicator,
    },
  };

  try {
    if (form) {
      form.noValidate =
        true;

      setDataset(
        form,
        "loginDomVersion",
        LOGIN_DOM_VERSION
      );
    }
  } catch {}

  return refs;
}

/* =========================================================
   FIELD ERRORS
========================================================= */

export function setFieldInvalid(fieldNode, invalid = false) {
  if (!fieldNode) {
    return false;
  }

  const isInvalid =
    Boolean(invalid);

  toggleClass(
    fieldNode,
    "is-invalid",
    isInvalid
  );

  setDataset(
    fieldNode,
    "invalid",
    isInvalid ? "true" : null
  );

  return true;
}

export function setInputInvalid(inputNode, invalid = false) {
  if (!inputNode) {
    return false;
  }

  const isInvalid =
    Boolean(invalid);

  toggleClass(
    inputNode,
    "is-invalid",
    isInvalid
  );

  setAttr(
    inputNode,
    "aria-invalid",
    isInvalid ? "true" : "false"
  );

  return true;
}

export function setFieldError(fieldNode, message = "", errorNode = null) {
  const text =
    toText(message, "");

  setFieldInvalid(
    fieldNode,
    Boolean(text)
  );

  if (fieldNode) {
    setDataset(
      fieldNode,
      "error",
      text || null
    );
  }

  if (errorNode) {
    setText(
      errorNode,
      text
    );

    setHidden(
      errorNode,
      !text
    );

    setAttr(
      errorNode,
      "role",
      text ? "alert" : null
    );
  }

  return true;
}

export function clearFieldError(fieldNode, errorNode = null) {
  setFieldInvalid(
    fieldNode,
    false
  );

  if (fieldNode) {
    setDataset(
      fieldNode,
      "error",
      null
    );
  }

  if (errorNode) {
    setText(
      errorNode,
      ""
    );

    setHidden(
      errorNode,
      true
    );

    removeAttr(
      errorNode,
      "role"
    );
  }

  return true;
}

function setGlobalErrorNode(errorBox, message = "") {
  const text =
    toText(message, "");

  if (!errorBox) {
    return false;
  }

  setText(
    errorBox,
    text
  );

  setHidden(
    errorBox,
    !text
  );

  toggleClass(
    errorBox,
    "is-visible",
    Boolean(text)
  );

  toggleClass(
    errorBox,
    "is-empty",
    !text
  );

  setAttr(
    errorBox,
    "role",
    text ? "alert" : null
  );

  setAttr(
    errorBox,
    "aria-live",
    text ? "polite" : null
  );

  return true;
}

export function clearLoginErrors(refs = {}) {
  clearFieldError(
    refs.fieldEmail,
    refs.errorEmail
  );

  clearFieldError(
    refs.fieldIdentifier,
    refs.errorIdentifier
  );

  clearFieldError(
    refs.fieldPassword,
    refs.errorPassword
  );

  setInputInvalid(
    refs.emailInput,
    false
  );

  setInputInvalid(
    refs.identifierInput,
    false
  );

  setInputInvalid(
    refs.passwordInput,
    false
  );

  setGlobalErrorNode(
    refs.errorBox,
    ""
  );

  try {
    refs.form?.removeAttribute?.(
      "data-error"
    );
  } catch {}

  return true;
}

export function applyLoginErrors(refs = {}, errors = {}, options = {}) {
  const identifierError =
    toText(
      errors.identifier,
      ""
    ) ||
    toText(
      errors.email,
      ""
    ) ||
    toText(
      errors.username,
      ""
    ) ||
    toText(
      errors.user,
      ""
    ) ||
    toText(
      errors.login,
      ""
    );

  const passwordError =
    toText(
      errors.password,
      ""
    );

  const globalError =
    toText(
      errors.global,
      ""
    ) ||
    toText(
      errors.form,
      ""
    ) ||
    toText(
      errors.message,
      ""
    );

  const firstError =
    identifierError ||
    passwordError ||
    globalError ||
    "";

  setFieldError(
    refs.fieldEmail,
    identifierError,
    refs.errorEmail
  );

  setFieldError(
    refs.fieldIdentifier,
    identifierError,
    refs.errorIdentifier
  );

  setFieldError(
    refs.fieldPassword,
    passwordError,
    refs.errorPassword
  );

  setInputInvalid(
    refs.emailInput,
    Boolean(identifierError)
  );

  setInputInvalid(
    refs.identifierInput,
    Boolean(identifierError)
  );

  setInputInvalid(
    refs.passwordInput,
    Boolean(passwordError)
  );

  setGlobalErrorNode(
    refs.errorBox,
    firstError
  );

  try {
    if (refs.form) {
      if (firstError) {
        refs.form.dataset.error =
          "true";
      } else {
        delete refs.form.dataset.error;
      }
    }
  } catch {}

  if (options.focus !== false) {
    scheduleMicrotask(() => {
      if (identifierError) {
        safeFocus(
          refs.identifierInput ||
            refs.emailInput
        );

        return;
      }

      if (passwordError) {
        safeFocus(
          refs.passwordInput
        );
      }
    });
  }

  return firstError;
}

export function setGlobalLoginError(refs = {}, message = "") {
  const text =
    toText(message, "");

  setGlobalErrorNode(
    refs.errorBox,
    text
  );

  try {
    if (refs.form) {
      if (text) {
        refs.form.dataset.error =
          "true";
      } else {
        delete refs.form.dataset.error;
      }
    }
  } catch {}

  return text;
}

/* =========================================================
   LOADING STATE
========================================================= */

function createSubmitSpinner() {
  const spinner =
    createSpan(
      "login-view__spinner",
      ""
    );

  if (spinner) {
    setAttr(
      spinner,
      "aria-hidden",
      "true"
    );
  }

  return spinner;
}

function createSubmitText(text = "") {
  const label =
    createSpan(
      "login-submit-text",
      text
    );

  if (label) {
    setDataset(
      label,
      "loginSubmitText",
      "true"
    );
  }

  return label;
}

function renderSubmitButton(button, loading = false, labels = {}) {
  if (!button) {
    return false;
  }

  const submitLabel =
    toText(
      labels.submitLabel,
      DEFAULT_SUBMIT_LABEL
    );

  const loadingLabel =
    toText(
      labels.loadingLabel,
      DEFAULT_LOADING_LABEL
    );

  const isLoading =
    Boolean(loading);

  button.disabled =
    isLoading;

  setDataset(
    button,
    "loading",
    String(isLoading)
  );

  setAttr(
    button,
    "aria-busy",
    isLoading ? "true" : "false"
  );

  const textNode =
    createSubmitText(
      isLoading
        ? loadingLabel
        : submitLabel
    );

  if (isLoading) {
    replaceChildrenSafe(
      button,
      [
        createSubmitSpinner(),
        textNode,
      ]
    );

    return true;
  }

  replaceChildrenSafe(
    button,
    [
      textNode,
    ]
  );

  return true;
}

function setLinkDisabled(link, disabled = false) {
  if (!link) {
    return false;
  }

  const isDisabled =
    Boolean(disabled);

  setAttr(
    link,
    "aria-disabled",
    isDisabled ? "true" : "false"
  );

  toggleClass(
    link,
    "is-disabled",
    isDisabled
  );

  if (isDisabled) {
    try {
      if (!link.dataset.prevTabIndex) {
        link.dataset.prevTabIndex =
          String(link.tabIndex);
      }

      link.tabIndex =
        -1;
    } catch {}
  } else {
    try {
      const previous =
        link.dataset.prevTabIndex;

      if (
        previous !== undefined &&
        previous !== null &&
        previous !== ""
      ) {
        link.tabIndex =
          Number(previous);
      } else {
        link.removeAttribute("tabindex");
      }

      delete link.dataset.prevTabIndex;
    } catch {}
  }

  return true;
}

export function setLoginLoading(refs = {}, loading = false, options = {}) {
  const isLoading =
    Boolean(loading);

  const submitLabel =
    toText(
      options.submitLabel,
      DEFAULT_SUBMIT_LABEL
    );

  const loadingLabel =
    toText(
      options.loadingLabel,
      DEFAULT_LOADING_LABEL
    );

  const disablePassword =
    options.disablePassword === true ||
    options.disablePasswordDuringSubmit === true;

  const {
    container,
    root,
    form,
    emailInput,
    identifierInput,
    passwordInput,
    rememberInput,
    submitButton,
    themeToggleButton,
    togglePasswordButton,
    forgotPasswordLink,
  } =
    refs;

  if (container) {
    toggleClass(
      container,
      "is-loading",
      isLoading
    );

    setDataset(
      container,
      "loginLoading",
      isLoading ? "true" : null
    );
  }

  if (root) {
    toggleClass(
      root,
      "is-loading",
      isLoading
    );

    setDataset(
      root,
      "loginLoading",
      isLoading ? "true" : null
    );
  }

  if (form) {
    setAttr(
      form,
      "aria-busy",
      isLoading ? "true" : "false"
    );

    if (isLoading) {
      form.dataset.submitting =
        "true";
    } else {
      delete form.dataset.submitting;
    }
  }

  if (emailInput) {
    emailInput.disabled =
      isLoading;
  }

  if (
    identifierInput &&
    identifierInput !== emailInput
  ) {
    identifierInput.disabled =
      isLoading;
  }

  /*
    Por defecto no deshabilitamos password/toggle para no romper el
    componente visual shared durante submit. Puede forzarse por opción.
  */
  if (passwordInput) {
    passwordInput.disabled =
      disablePassword ? isLoading : false;
  }

  if (togglePasswordButton) {
    togglePasswordButton.disabled =
      disablePassword ? isLoading : false;
  }

  if (rememberInput) {
    rememberInput.disabled =
      isLoading;
  }

  if (themeToggleButton) {
    themeToggleButton.disabled =
      isLoading;
  }

  setLinkDisabled(
    forgotPasswordLink,
    isLoading
  );

  renderSubmitButton(
    submitButton,
    isLoading,
    {
      submitLabel,
      loadingLabel,
    }
  );

  return true;
}

/* =========================================================
   PASSWORD VISIBILITY · LEGACY FALLBACK
========================================================= */

export function getPasswordVisibilityState(refs = {}) {
  return refs?.passwordInput?.type === "text";
}

export function setPasswordVisibility(refs = {}, visible = false) {
  const isVisible =
    Boolean(visible);

  const passwordInput =
    refs?.passwordInput;

  const togglePasswordButton =
    refs?.togglePasswordButton;

  if (!passwordInput) {
    return isVisible;
  }

  try {
    passwordInput.type =
      isVisible
        ? "text"
        : "password";
  } catch {}

  if (togglePasswordButton) {
    const showLabel =
      toText(
        togglePasswordButton.getAttribute("data-show-label"),
        DEFAULT_SHOW_PASSWORD_LABEL
      );

    const hideLabel =
      toText(
        togglePasswordButton.getAttribute("data-hide-label"),
        DEFAULT_HIDE_PASSWORD_LABEL
      );

    setAttr(
      togglePasswordButton,
      "aria-label",
      isVisible ? hideLabel : showLabel
    );

    setAttr(
      togglePasswordButton,
      "aria-pressed",
      String(isVisible)
    );

    setDataset(
      togglePasswordButton,
      "passwordVisible",
      isVisible ? "true" : "false"
    );

    toggleClass(
      togglePasswordButton,
      "is-visible",
      isVisible
    );

    toggleClass(
      togglePasswordButton,
      "is-hidden",
      !isVisible
    );

    const icon =
      qs(
        togglePasswordButton,
        "[data-password-toggle-icon]"
      ) ||
      qs(
        togglePasswordButton,
        ".password-toggle-icon"
      );

    if (icon) {
      setDataset(
        icon,
        "state",
        isVisible ? "visible" : "hidden"
      );

      toggleClass(
        icon,
        "is-visible",
        isVisible
      );

      toggleClass(
        icon,
        "is-hidden",
        !isVisible
      );
    }
  }

  return isVisible;
}

export function togglePasswordVisibility(refs = {}) {
  const current =
    getPasswordVisibilityState(refs);

  return setPasswordVisibility(
    refs,
    !current
  );
}

/* =========================================================
   FOCUS
========================================================= */

export function focusLoginPrimaryField(refs = {}, options = {}) {
  const rememberedIdentifier =
    Boolean(
      options.rememberedIdentifier ||
        options.rememberedEmail
    );

  scheduleMicrotask(() => {
    try {
      if (
        rememberedIdentifier &&
        refs.passwordInput &&
        !refs.passwordInput.disabled
      ) {
        safeFocus(
          refs.passwordInput
        );

        return;
      }

      const target =
        refs.identifierInput ||
        refs.emailInput;

      if (
        target &&
        !target.disabled
      ) {
        safeFocus(target);
        safeSelect(target);
      }
    } catch {}
  });

  return true;
}

/* =========================================================
   FORM STATE
========================================================= */

function normalizeIdentifier(value = "") {
  return toText(value, "")
    .normalize("NFKC")
    .replace(/\s+/g, " ");
}

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    toText(value, "")
  );
}

function looksLikePhone(value = "") {
  const clean =
    toText(value, "")
      .replace(/[^\d+]/g, "");

  return /^\+?\d{6,20}$/.test(clean);
}

export function readLoginFormState(refs = {}) {
  const identifier =
    normalizeIdentifier(
      refs?.identifierInput?.value ??
        refs?.emailInput?.value ??
        ""
    );

  const email =
    looksLikeEmail(identifier)
      ? identifier.toLowerCase()
      : "";

  const phone =
    !email && looksLikePhone(identifier)
      ? identifier.replace(/[^\d+]/g, "")
      : "";

  const username =
    !email && !phone
      ? identifier
      : "";

  return {
    identifier,

    email:
      email || identifier.toLowerCase(),

    username,

    user:
      username || identifier,

    login:
      identifier,

    phone,
    telefono:
      phone,

    /*
      Importante:
      No se trimea la contraseña.
    */
    password:
      toRawValue(
        refs?.passwordInput?.value,
        ""
      ),

    remember:
      Boolean(
        refs?.rememberInput?.checked
      ),
  };
}

/* =========================================================
   LISTENER HELPERS
========================================================= */

function bindDomEvent(target, eventName, handler, options = false) {
  if (
    !target ||
    !eventName ||
    !isFn(handler)
  ) {
    return noop;
  }

  let disposed =
    false;

  try {
    target.addEventListener(
      eventName,
      handler,
      options
    );
  } catch {
    return noop;
  }

  return () => {
    if (disposed) {
      return;
    }

    disposed =
      true;

    try {
      target.removeEventListener(
        eventName,
        handler,
        options
      );
    } catch {}
  };
}

function composeUnbinders(unbinders = []) {
  let disposed =
    false;

  return () => {
    if (disposed) {
      return;
    }

    disposed =
      true;

    for (const unbind of safeArray(unbinders)) {
      try {
        if (isFn(unbind)) {
          unbind();
        }
      } catch {}
    }
  };
}

/* =========================================================
   BIND HELPERS
========================================================= */

export function bindLoginInputClearers(refs = {}, handler = null) {
  if (!isFn(handler)) {
    return noop;
  }

  const nodes =
    [
      refs.identifierInput,
      refs.emailInput,
      refs.passwordInput,
    ].filter((node, index, list) =>
      node &&
      list.indexOf(node) === index
    );

  const unbinders =
    [];

  for (const node of nodes) {
    unbinders.push(
      bindDomEvent(
        node,
        "input",
        handler
      )
    );
  }

  return composeUnbinders(unbinders);
}

export function bindPasswordToggle(refs = {}, handler = null) {
  const button =
    refs.togglePasswordButton;

  if (!button) {
    return noop;
  }

  const existing =
    PASSWORD_TOGGLE_BINDINGS.get(button);

  if (existing) {
    return existing.dispose;
  }

  const finalHandler =
    isFn(handler)
      ? handler
      : (event) => {
          try {
            event?.preventDefault?.();
          } catch {}

          togglePasswordVisibility(refs);

          safeFocus(
            refs.passwordInput,
            {
              preventScroll:
                true,
            }
          );
        };

  const dispose =
    bindDomEvent(
      button,
      "click",
      finalHandler
    );

  const binding = {
    dispose() {
      try {
        dispose();
      } catch {}

      PASSWORD_TOGGLE_BINDINGS.delete(button);
    },
  };

  PASSWORD_TOGGLE_BINDINGS.set(
    button,
    binding
  );

  return binding.dispose;
}

export function bindThemeToggle(refs = {}, handler = null) {
  const button =
    refs.themeToggleButton;

  if (
    !button ||
    !isFn(handler)
  ) {
    return noop;
  }

  const wrapped =
    (event) => {
      try {
        event?.preventDefault?.();
      } catch {}

      if (
        button.disabled ||
        button.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }

      handler(event);
    };

  return bindDomEvent(
    button,
    "click",
    wrapped
  );
}

export function bindLoginSubmit(refs = {}, handler = null) {
  const form =
    refs.form;

  if (
    !form ||
    !isFn(handler)
  ) {
    return noop;
  }

  let map =
    SUBMIT_BINDINGS.get(form);

  if (!map) {
    map =
      new Map();

    SUBMIT_BINDINGS.set(
      form,
      map
    );
  }

  if (map.has(handler)) {
    const existing =
      map.get(handler);

    existing.count += 1;

    return () => {
      existing.count -= 1;

      if (existing.count <= 0) {
        existing.dispose();
      }
    };
  }

  const wrapped =
    (event) => {
      try {
        event?.preventDefault?.();
      } catch {}

      return handler(event);
    };

  const unbind =
    bindDomEvent(
      form,
      "submit",
      wrapped
    );

  const binding = {
    count:
      1,

    dispose() {
      try {
        unbind();
      } catch {}

      try {
        map.delete(handler);

        if (map.size === 0) {
          SUBMIT_BINDINGS.delete(form);
        }
      } catch {}
    },
  };

  map.set(
    handler,
    binding
  );

  setDataset(
    form,
    "loginSubmitBound",
    "true"
  );

  setDataset(
    form,
    "loginDomSource",
    LOGIN_DOM_SOURCE
  );

  return () => {
    binding.count -= 1;

    if (binding.count <= 0) {
      binding.dispose();
    }
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getNodeSnapshot(node) {
  if (!node) {
    return {
      exists:
        false,
    };
  }

  return {
    exists:
      true,

    connected:
      isConnected(node),

    tag:
      toText(
        node.tagName,
        ""
      ).toLowerCase(),

    id:
      toText(
        node.id,
        ""
      ),

    className:
      toText(
        typeof node.className === "string"
          ? node.className
          : "",
        ""
      ),

    disabled:
      Boolean(node.disabled),

    hidden:
      Boolean(node.hidden),

    ariaInvalid:
      toText(
        node.getAttribute?.("aria-invalid"),
        ""
      ),

    ariaBusy:
      toText(
        node.getAttribute?.("aria-busy"),
        ""
      ),

    dataset: {
      loading:
        node.dataset?.loading || "",

      submitting:
        node.dataset?.submitting || "",

      invalid:
        node.dataset?.invalid || "",
    },
  };
}

export function getLoginDomSnapshot(refs = {}) {
  return {
    version:
      LOGIN_DOM_VERSION,

    root:
      getNodeSnapshot(refs.root),

    form:
      getNodeSnapshot(refs.form),

    identifierInput:
      getNodeSnapshot(
        refs.identifierInput ||
          refs.emailInput
      ),

    passwordInput:
      getNodeSnapshot(refs.passwordInput),

    rememberInput:
      getNodeSnapshot(refs.rememberInput),

    errorBox:
      getNodeSnapshot(refs.errorBox),

    submitButton:
      getNodeSnapshot(refs.submitButton),

    themeToggleButton:
      getNodeSnapshot(refs.themeToggleButton),

    togglePasswordButton:
      getNodeSnapshot(refs.togglePasswordButton),

    hasSharedPasswordBindings:
      Boolean(
        refs.passwordFieldBindings?.length
      ),

    at:
      safeNowIso(),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  LOGIN_DOM_VERSION,

  getLoginRefs,

  bindLoginPasswordFields,
  destroyLoginPasswordFields,

  setFieldInvalid,
  setInputInvalid,
  setFieldError,
  clearFieldError,

  clearLoginErrors,
  applyLoginErrors,
  setGlobalLoginError,

  setLoginLoading,

  getPasswordVisibilityState,
  setPasswordVisibility,
  togglePasswordVisibility,

  focusLoginPrimaryField,
  readLoginFormState,

  bindLoginInputClearers,
  bindPasswordToggle,
  bindThemeToggle,
  bindLoginSubmit,

  getLoginDomSnapshot,
};
