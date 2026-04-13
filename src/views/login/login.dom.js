/* =========================================================
   Onion SPA - Login DOM
   Archivo: src/views/login/login.dom.js

   Responsabilidades:
   - resolver refs del dom del login
   - encapsular estados visuales del formulario
   - aplicar y limpiar errores
   - controlar loading ui
   - controlar toggle de contraseña
   - gestionar focus inicial
   - soportar usuario o email
========================================================= */

/* =========================================================
   HELPERS
========================================================= */

function qs(root, selector) {
  return root?.querySelector(selector) || null;
}

function toText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

/* =========================================================
   REFS
========================================================= */

export function getLoginRefs(container) {
  const root = qs(container, ".login-view");

  return {
    container,
    root,

    form: qs(container, "#loginForm"),

    emailInput: qs(container, "#loginEmail"),
    identifierInput: qs(container, "#loginEmail"),
    passwordInput: qs(container, "#loginPassword"),
    rememberInput: qs(container, "#loginRemember"),

    errorBox: qs(container, "#loginError"),

    submitButton: qs(container, "#loginSubmit"),
    themeToggleButton: qs(container, "#loginThemeToggle"),
    togglePasswordButton: qs(container, "#togglePassword"),

    capsIndicator: qs(container, "#loginCapsIndicator"),

    forgotPasswordLink: qs(container, "#forgotPasswordLink"),

    fieldEmail: qs(container, '[data-field="email"]'),
    fieldIdentifier: qs(container, '[data-field="email"]'),
    fieldPassword: qs(container, '[data-field="password"]'),
  };
}

/* =========================================================
   FIELD ERRORS
========================================================= */

export function setFieldInvalid(fieldNode, invalid = false) {
  if (!fieldNode) return;
  fieldNode.classList.toggle("is-invalid", Boolean(invalid));
}

export function setInputInvalid(inputNode, invalid = false) {
  if (!inputNode) return;
  inputNode.classList.toggle("is-invalid", Boolean(invalid));
  inputNode.setAttribute("aria-invalid", invalid ? "true" : "false");
}

export function setFieldError(fieldNode, message = "") {
  setFieldInvalid(fieldNode, Boolean(toText(message, "")));
}

export function clearFieldError(fieldNode) {
  setFieldInvalid(fieldNode, false);
}

export function clearLoginErrors(refs = {}) {
  clearFieldError(refs.fieldEmail);
  clearFieldError(refs.fieldIdentifier);
  clearFieldError(refs.fieldPassword);

  setInputInvalid(refs.emailInput, false);
  setInputInvalid(refs.identifierInput, false);
  setInputInvalid(refs.passwordInput, false);

  if (refs.errorBox) {
    refs.errorBox.textContent = "";
  }
}

export function applyLoginErrors(refs = {}, errors = {}) {
  const identifierError =
    toText(errors.identifier, "") ||
    toText(errors.email, "");

  const passwordError =
    toText(errors.password, "");

  const firstError =
    identifierError || passwordError || "";

  setFieldError(refs.fieldEmail, identifierError);
  setFieldError(refs.fieldIdentifier, identifierError);
  setFieldError(refs.fieldPassword, passwordError);

  setInputInvalid(refs.emailInput, Boolean(identifierError));
  setInputInvalid(refs.identifierInput, Boolean(identifierError));
  setInputInvalid(refs.passwordInput, Boolean(passwordError));

  if (refs.errorBox) {
    refs.errorBox.textContent = firstError;
  }
}

export function setGlobalLoginError(refs = {}, message = "") {
  if (!refs?.errorBox) return;
  refs.errorBox.textContent = toText(message, "");
}

/* =========================================================
   LOADING STATE
========================================================= */

export function setLoginLoading(
  refs = {},
  loading = false,
  options = {}
) {
  const isLoading = Boolean(loading);

  const submitLabel = toText(
    options.submitLabel,
    "Entrar al panel"
  );

  const loadingLabel = toText(
    options.loadingLabel,
    "Accediendo..."
  );

  const {
    form,
    emailInput,
    passwordInput,
    rememberInput,
    submitButton,
    themeToggleButton,
    togglePasswordButton,
    forgotPasswordLink,
  } = refs;

  if (form) {
    form.setAttribute("aria-busy", String(isLoading));
    form.dataset.submitting = String(isLoading);
  }

  if (emailInput) {
    emailInput.disabled = isLoading;
  }

  /*
    No deshabilitamos password ni toggle para no romper
    la experiencia visual del campo durante el submit.
  */
  if (passwordInput) {
    passwordInput.disabled = false;
  }

  if (togglePasswordButton) {
    togglePasswordButton.disabled = false;
  }

  if (rememberInput) {
    rememberInput.disabled = isLoading;
  }

  if (themeToggleButton) {
    themeToggleButton.disabled = isLoading;
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.setAttribute("aria-disabled", String(isLoading));
    forgotPasswordLink.classList.toggle("is-disabled", isLoading);
    forgotPasswordLink.tabIndex = isLoading ? -1 : 0;
  }

  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.dataset.loading = String(isLoading);
    submitButton.innerHTML = isLoading
      ? `
        <span class="login-view__spinner" aria-hidden="true"></span>
        <span class="login-submit-text">${loadingLabel}</span>
      `
      : `<span class="login-submit-text">${submitLabel}</span>`;
  }
}

/* =========================================================
   PASSWORD VISIBILITY
========================================================= */

export function getPasswordVisibilityState(refs = {}) {
  return refs?.passwordInput?.type === "text";
}

export function setPasswordVisibility(refs = {}, visible = false) {
  const isVisible = Boolean(visible);
  const passwordInput = refs?.passwordInput;
  const togglePasswordButton = refs?.togglePasswordButton;

  if (!passwordInput || !togglePasswordButton) {
    return isVisible;
  }

  const showLabel =
    toText(
      togglePasswordButton.getAttribute("data-show-label"),
      "Mostrar contraseña"
    );

  const hideLabel =
    toText(
      togglePasswordButton.getAttribute("data-hide-label"),
      "Ocultar contraseña"
    );

  const showIcon =
    togglePasswordButton.getAttribute("data-show-icon") || "";

  const hideIcon =
    togglePasswordButton.getAttribute("data-hide-icon") || "";

  passwordInput.type = isVisible ? "text" : "password";

  togglePasswordButton.setAttribute(
    "aria-label",
    isVisible ? hideLabel : showLabel
  );

  togglePasswordButton.setAttribute(
    "aria-pressed",
    String(isVisible)
  );

  togglePasswordButton.innerHTML =
    isVisible
      ? (hideIcon || "Ocultar")
      : (showIcon || "Ver");

  return isVisible;
}

export function togglePasswordVisibility(refs = {}) {
  const current = getPasswordVisibilityState(refs);
  return setPasswordVisibility(refs, !current);
}

/* =========================================================
   FOCUS
========================================================= */

export function focusLoginPrimaryField(
  refs = {},
  options = {}
) {
  const rememberedIdentifier = Boolean(
    options.rememberedIdentifier || options.rememberedEmail
  );

  queueMicrotask(() => {
    try {
      if (rememberedIdentifier && refs.passwordInput) {
        refs.passwordInput.focus();
        return;
      }

      refs.emailInput?.focus();
      refs.emailInput?.select?.();
    } catch {}
  });
}

/* =========================================================
   STATE SNAPSHOT
========================================================= */

export function readLoginFormState(refs = {}) {
  const identifier = toText(refs?.emailInput?.value, "");

  return {
    identifier,
    email: identifier.toLowerCase(),
    password: toText(refs?.passwordInput?.value, ""),
    remember: Boolean(refs?.rememberInput?.checked),
  };
}

/* =========================================================
   BIND HELPERS
========================================================= */

export function bindLoginInputClearers(refs = {}, handler = null) {
  if (typeof handler !== "function") {
    return () => {};
  }

  refs.emailInput?.addEventListener("input", handler);
  refs.passwordInput?.addEventListener("input", handler);

  return () => {
    refs.emailInput?.removeEventListener("input", handler);
    refs.passwordInput?.removeEventListener("input", handler);
  };
}

export function bindPasswordToggle(refs = {}, handler = null) {
  if (typeof handler !== "function") {
    return () => {};
  }

  refs.togglePasswordButton?.addEventListener("click", handler);

  return () => {
    refs.togglePasswordButton?.removeEventListener("click", handler);
  };
}

export function bindThemeToggle(refs = {}, handler = null) {
  if (typeof handler !== "function") {
    return () => {};
  }

  refs.themeToggleButton?.addEventListener("click", handler);

  return () => {
    refs.themeToggleButton?.removeEventListener("click", handler);
  };
}

export function bindLoginSubmit(refs = {}, handler = null) {
  if (typeof handler !== "function") {
    return () => {};
  }

  refs.form?.addEventListener("submit", handler);

  return () => {
    refs.form?.removeEventListener("submit", handler);
  };
}
