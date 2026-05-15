/* =========================================================
   Onion SPA - Login DOM
   Archivo: src/views/login/login.dom.js

   LOGIN DOM · CORE/AUTH SAFE · NO FREEZE · 16/10

   RESPONSABILIDADES:
   - Resolver refs del DOM del login.
   - Encapsular estados visuales del formulario.
   - Aplicar y limpiar errores.
   - Controlar loading UI sin innerHTML.
   - Integrar opcionalmente el sistema compartido password-field.
   - Gestionar focus inicial.
   - Soportar usuario, email o teléfono como identificador.
   - Evitar doble binding accidental de submit/listeners.
   - Evitar formulario congelado si una promesa externa falla.
   - No duplicar el bind del password-field desde getLoginRefs().

   REGLAS:
   - getLoginRefs() NO bindea password-field.
   - El bind compartido vive en index.js o en bindLoginPasswordFields().
   - setLoginLoading() no usa innerHTML.
   - setLoginLoading(false) limpia flags visuales de submit.
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
  "16.0.0-extreme-pro";

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
      Object.freeze([
        ".login-view",
        "[data-login-view='true']",
        "[data-login-view]",
        "#loginView",
      ]),

    form:
      Object.freeze([
        "#loginForm",
        "[data-login-form='true']",
        "[data-login-form]",
        "form[data-auth-form='login']",
        "form",
      ]),

    identifier:
      Object.freeze([
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
      ]),

    password:
      Object.freeze([
        "#loginPassword",
        "[name='password']",
        "[data-login-password='true']",
        "[data-login-password]",
        "[data-password-input='true']",
        "[data-password-input]",
        "input[type='password']",
        "input[autocomplete='current-password']",
      ]),

    remember:
      Object.freeze([
        "#loginRemember",
        "[name='remember']",
        "[name='rememberMe']",
        "[name='remember_me']",
        "[data-login-remember='true']",
        "[data-login-remember]",
      ]),

    errorBox:
      Object.freeze([
        "#loginError",
        "[data-login-error='true']",
        "[data-login-error]",
        "[data-form-error]",
        ".login-error",
      ]),

    submit:
      Object.freeze([
        "#loginSubmit",
        "[data-login-submit='true']",
        "[data-login-submit]",
        "button[type='submit']",
      ]),

    themeToggle:
      Object.freeze([
        "#loginThemeToggle",
        "[data-login-theme-toggle='true']",
        "[data-login-theme-toggle]",
        "[data-theme-toggle='true']",
        "[data-theme-toggle]",
      ]),

    passwordToggle:
      Object.freeze([
        "#togglePassword",
        "#loginPasswordToggle",
        "[data-password-toggle='true']",
        "[data-password-toggle]",
        "[data-login-password-toggle='true']",
        "[data-login-password-toggle]",
      ]),

    capsIndicator:
      Object.freeze([
        "#loginCapsIndicator",
        "[data-password-caps='true']",
        "[data-password-caps]",
        "[data-login-caps='true']",
        "[data-login-caps]",
      ]),

    forgotPasswordLink:
      Object.freeze([
        "#forgotPasswordLink",
        "[data-forgot-password-link='true']",
        "[data-forgot-password-link]",
        "[data-login-forgot-password]",
      ]),

    fieldIdentifier:
      Object.freeze([
        "[data-field='identifier']",
        "[data-field='email']",
        "[data-login-field='identifier']",
        "[data-login-field='email']",
      ]),

    fieldPassword:
      Object.freeze([
        "[data-field='password']",
        "[data-login-field='password']",
      ]),

    errorIdentifier:
      Object.freeze([
        "[data-error-for='identifier']",
        "[data-error-for='email']",
        "[data-login-error-for='identifier']",
        "[data-login-error-for='email']",
      ]),

    errorPassword:
      Object.freeze([
        "[data-error-for='password']",
        "[data-login-error-for='password']",
      ]),

    submitText:
      Object.freeze([
        ".login-submit-text",
        "[data-login-submit-text]",
      ]),
  });

const DISABLED_MEMORY_KEY =
  "loginPrevDisabled";

const TABINDEX_MEMORY_KEY =
  "loginPrevTabIndex";

const SUBMIT_BINDINGS =
  new WeakMap();

const THEME_TOGGLE_BINDINGS =
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

function setDisabledWithMemory(node, disabled = false, {
  forceEnable = false,
} = {}) {
  if (!node) {
    return false;
  }

  const shouldDisable =
    Boolean(disabled);

  try {
    if (shouldDisable) {
      if (
        node.dataset &&
        node.dataset[DISABLED_MEMORY_KEY] === undefined
      ) {
        node.dataset[DISABLED_MEMORY_KEY] =
          node.disabled ? "true" : "false";
      }

      node.disabled =
        true;

      return true;
    }

    const previous =
      node.dataset?.[DISABLED_MEMORY_KEY];

    if (forceEnable) {
      node.disabled =
        false;
    } else if (previous === "true") {
      node.disabled =
        true;
    } else {
      node.disabled =
        false;
    }

    if (node.dataset) {
      delete node.dataset[DISABLED_MEMORY_KEY];
    }

    return true;
  } catch {
    try {
      node.disabled =
        shouldDisable;
      return true;
    } catch {
      return false;
    }
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

  const fieldIdentifier =
    queryFirst(
      scope,
      SELECTORS.fieldIdentifier
    );

  const errorIdentifier =
    queryFirst(
      scope,
      SELECTORS.errorIdentifier
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
      fieldIdentifier,

    fieldIdentifier,

    fieldPassword:
      queryFirst(
        scope,
        SELECTORS.fieldPassword
      ),

    errorIdentifier,

    errorEmail:
      errorIdentifier,

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

      setDataset(
        form,
        "loginDomSource",
        LOGIN_DOM_SOURCE
      );
    }
  } catch {}

  try {
    if (refs.submitButton) {
      if (!refs.submitButton.getAttribute("type")) {
        refs.submitButton.setAttribute("type", "submit");
      }

      if (!refs.submitButton.dataset.originalLabel) {
        refs.submitButton.dataset.originalLabel =
          toText(
            refs.submitButton.textContent,
            DEFAULT_SUBMIT_LABEL
          );
      }
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

  if (
    refs.fieldIdentifier &&
    refs.fieldIdentifier !== refs.fieldEmail
  ) {
    clearFieldError(
      refs.fieldIdentifier,
      refs.errorIdentifier
    );
  }

  clearFieldError(
    refs.fieldPassword,
    refs.errorPassword
  );

  setInputInvalid(
    refs.emailInput,
    false
  );

  if (
    refs.identifierInput &&
    refs.identifierInput !== refs.emailInput
  ) {
    setInputInvalid(
      refs.identifierInput,
      false
    );
  }

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

  if (
    refs.fieldIdentifier &&
    refs.fieldIdentifier !== refs.fieldEmail
  ) {
    setFieldError(
      refs.fieldIdentifier,
      identifierError,
      refs.errorIdentifier
    );
  }

  setFieldError(
    refs.fieldPassword,
    passwordError,
    refs.errorPassword
  );

  setInputInvalid(
    refs.emailInput,
    Boolean(identifierError)
  );

  if (
    refs.identifierInput &&
    refs.identifierInput !== refs.emailInput
  ) {
    setInputInvalid(
      refs.identifierInput,
      Boolean(identifierError)
    );
  }

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

    setDataset(
      spinner,
      "loginSpinner",
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

function getOriginalSubmitLabel(button, fallback = DEFAULT_SUBMIT_LABEL) {
  if (!button) {
    return fallback;
  }

  try {
    const existing =
      toText(
        button.dataset?.originalLabel,
        ""
      );

    if (existing) {
      return existing;
    }

    const current =
      toText(
        button.textContent,
        fallback
      );

    button.dataset.originalLabel =
      current || fallback;

    return current || fallback;
  } catch {
    return fallback;
  }
}

function renderSubmitButton(button, loading = false, labels = {}) {
  if (!button) {
    return false;
  }

  const originalLabel =
    getOriginalSubmitLabel(
      button,
      DEFAULT_SUBMIT_LABEL
    );

  const submitLabel =
    toText(
      labels.submitLabel,
      originalLabel ||
        DEFAULT_SUBMIT_LABEL
    );

  const loadingLabel =
    toText(
      labels.loadingLabel,
      DEFAULT_LOADING_LABEL
    );

  const isLoading =
    Boolean(loading);

  try {
    button.disabled =
      isLoading;
  } catch {}

  setDataset(
    button,
    "loading",
    isLoading ? "true" : null
  );

  setAttr(
    button,
    "aria-busy",
    isLoading ? "true" : "false"
  );

  setAttr(
    button,
    "aria-disabled",
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
      if (
        link.dataset &&
        link.dataset[TABINDEX_MEMORY_KEY] === undefined
      ) {
        link.dataset[TABINDEX_MEMORY_KEY] =
          String(link.tabIndex);
      }

      link.tabIndex =
        -1;
    } catch {}
  } else {
    try {
      const previous =
        link.dataset?.[TABINDEX_MEMORY_KEY];

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

      if (link.dataset) {
        delete link.dataset[TABINDEX_MEMORY_KEY];
      }
    } catch {}
  }

  return true;
}

function clearSubmitFlags(form) {
  if (!form) {
    return false;
  }

  try {
    delete form.dataset.submitting;
    delete form.dataset.loginSubmitting;
    delete form.dataset.loginSubmitLocked;
    delete form.dataset.busy;
  } catch {}

  setAttr(
    form,
    "aria-busy",
    "false"
  );

  return true;
}

export function setLoginLoading(refs = {}, loading = false, options = {}) {
  const isLoading =
    Boolean(loading);

  const submitLabel =
    toText(
      options.submitLabel,
      ""
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

      form.dataset.loginSubmitting =
        "1";

      form.dataset.loginSubmitLocked =
        "true";
    } else {
      clearSubmitFlags(form);
    }
  }

  setDisabledWithMemory(
    emailInput,
    isLoading,
    {
      forceEnable:
        !isLoading,
    }
  );

  if (
    identifierInput &&
    identifierInput !== emailInput
  ) {
    setDisabledWithMemory(
      identifierInput,
      isLoading,
      {
        forceEnable:
          !isLoading,
      }
    );
  }

  if (passwordInput) {
    setDisabledWithMemory(
      passwordInput,
      disablePassword ? isLoading : false,
      {
        forceEnable:
          !isLoading || !disablePassword,
      }
    );
  }

  if (togglePasswordButton) {
    setDisabledWithMemory(
      togglePasswordButton,
      disablePassword ? isLoading : false,
      {
        forceEnable:
          !isLoading || !disablePassword,
      }
    );
  }

  setDisabledWithMemory(
    rememberInput,
    isLoading,
    {
      forceEnable:
        !isLoading,
    }
  );

  setDisabledWithMemory(
    themeToggleButton,
    isLoading,
    {
      forceEnable:
        !isLoading,
    }
  );

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

export function unlockLoginForm(refs = {}, options = {}) {
  setLoginLoading(
    refs,
    false,
    {
      submitLabel:
        options.submitLabel,
      loadingLabel:
        options.loadingLabel,
    }
  );

  clearSubmitFlags(
    refs.form
  );

  try {
    if (refs.submitButton) {
      refs.submitButton.disabled =
        false;

      setAttr(
        refs.submitButton,
        "aria-disabled",
        "false"
      );

      setAttr(
        refs.submitButton,
        "aria-busy",
        "false"
      );

      setDataset(
        refs.submitButton,
        "loading",
        null
      );
    }
  } catch {}

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

    /*
      Compat legacy:
      Algunos helpers/backends antiguos leen email aunque el usuario escriba username.
    */
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

    unbinders.push(
      bindDomEvent(
        node,
        "change",
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

          if (
            button.disabled ||
            button.getAttribute("aria-disabled") === "true"
          ) {
            return;
          }

          togglePasswordVisibility(refs);

          safeFocus(
            refs.passwordInput,
            {
              preventScroll:
                true,
            }
          );
        };

  const disposeEvent =
    bindDomEvent(
      button,
      "click",
      finalHandler
    );

  const binding = {
    dispose() {
      try {
        disposeEvent();
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

  const existing =
    THEME_TOGGLE_BINDINGS.get(button);

  if (existing) {
    try {
      existing.dispose();
    } catch {}
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

  const disposeEvent =
    bindDomEvent(
      button,
      "click",
      wrapped
    );

  const binding = {
    dispose() {
      try {
        disposeEvent();
      } catch {}

      if (THEME_TOGGLE_BINDINGS.get(button) === binding) {
        THEME_TOGGLE_BINDINGS.delete(button);
      }
    },
  };

  THEME_TOGGLE_BINDINGS.set(
    button,
    binding
  );

  return binding.dispose;
}

export function bindLoginSubmit(refs = {}, handler = null) {
  const form =
    refs.form;

  const button =
    refs.submitButton;

  const target =
    form ||
    button ||
    null;

  if (
    !target ||
    !isFn(handler)
  ) {
    return noop;
  }

  const existing =
    SUBMIT_BINDINGS.get(target);

  /*
    Single-binding real:
    si por remount/hot reload queda un submit anterior en el mismo nodo,
    se elimina antes de montar el nuevo.
  */
  if (existing) {
    try {
      existing.dispose();
    } catch {}
  }

  let disposed =
    false;

  let inFlight =
    false;

  const wrapped =
    (event) => {
      if (disposed) {
        return undefined;
      }

      try {
        event?.preventDefault?.();
      } catch {}

      if (inFlight) {
        return undefined;
      }

      inFlight =
        true;

      let result;

      try {
        result =
          handler(event);
      } catch (error) {
        inFlight =
          false;

        throw error;
      }

      Promise.resolve(result)
        .catch(noop)
        .finally(() => {
          inFlight =
            false;
        });

      return result;
    };

  const unbinders =
    [];

  if (form) {
    unbinders.push(
      bindDomEvent(
        form,
        "submit",
        wrapped
      )
    );
  } else if (button) {
    unbinders.push(
      bindDomEvent(
        button,
        "click",
        wrapped
      )
    );
  }

  const binding = {
    dispose() {
      if (disposed) {
        return;
      }

      disposed =
        true;

      inFlight =
        false;

      for (const unbind of unbinders.splice(0)) {
        try {
          unbind();
        } catch {}
      }

      if (SUBMIT_BINDINGS.get(target) === binding) {
        SUBMIT_BINDINGS.delete(target);
      }

      if (form) {
        setDataset(
          form,
          "loginSubmitBound",
          null
        );

        setDataset(
          form,
          "loginSubmitBindingAt",
          null
        );
      }
    },

    getSnapshot() {
      return {
        disposed,
        inFlight,
        target:
          form ? "form" : "button",
        at:
          safeNowIso(),
      };
    },
  };

  SUBMIT_BINDINGS.set(
    target,
    binding
  );

  if (form) {
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

    setDataset(
      form,
      "loginSubmitBindingAt",
      safeNowIso()
    );
  }

  return binding.dispose;
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

    ariaDisabled:
      toText(
        node.getAttribute?.("aria-disabled"),
        ""
      ),

    dataset: {
      loading:
        node.dataset?.loading || "",

      submitting:
        node.dataset?.submitting || "",

      loginSubmitting:
        node.dataset?.loginSubmitting || "",

      loginSubmitLocked:
        node.dataset?.loginSubmitLocked || "",

      invalid:
        node.dataset?.invalid || "",

      loginSubmitBound:
        node.dataset?.loginSubmitBound || "",
    },
  };
}

export function getLoginDomSnapshot(refs = {}) {
  const formOrButton =
    refs.form ||
    refs.submitButton ||
    null;

  const submitBinding =
    formOrButton
      ? SUBMIT_BINDINGS.get(formOrButton)
      : null;

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

    hasSubmitBinding:
      Boolean(submitBinding),

    submitBinding:
      submitBinding?.getSnapshot?.() || null,

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
  unlockLoginForm,

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
