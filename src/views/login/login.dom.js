/* =========================================================
   Onion SPA - Login DOM
   Archivo: src/views/login/login.dom.js

   Responsabilidades:
   - resolver refs reales del dom del login
   - encapsular estados visuales del formulario
   - aplicar y limpiar errores
   - controlar loading ui
   - controlar toggle visual de contraseña
   - gestionar focus inicial
   - exponer lectura robusta del formulario
   - tolerar compatibilidad parcial con markup legacy
========================================================= */

/* =========================================================
   HELPERS
========================================================= */

function qs(root, selector) {
  return root?.querySelector?.(selector) || null;
}

function toText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function setHidden(node, hidden) {
  if (!node) return;
  node.hidden = Boolean(hidden);
}

function setAriaInvalid(node, active = false) {
  if (!node) return;
  node.setAttribute("aria-invalid", active ? "true" : "false");
}

/* =========================================================
   REFS
========================================================= */

export function getLoginRefs(container) {
  const root =
    qs(container, ".login-view") ||
    qs(container, '[data-view="login"]') ||
    container ||
    null;

  const identifierInput =
    qs(container, "#username") ||
    qs(container, "#loginEmail");

  const passwordInput =
    qs(container, "#password") ||
    qs(container, "#loginPassword");

  const submitButton =
    qs(container, "#loginButton") ||
    qs(container, "#loginSubmit");

  const togglePasswordButton =
    qs(container, "#togglePassword");

  const eyeOpenIcon =
    qs(container, "#eyeOpenIcon");

  const eyeClosedIcon =
    qs(container, "#eyeClosedIcon");

  const capsIndicator =
    qs(container, "#capsIndicator") ||
    qs(container, "#loginCapsIndicator");

  const capsIcon =
    qs(container, "#capsIcon");

  const capsLabel =
    qs(container, "#capsLabel");

  const forgotPasswordLink =
    qs(container, "#forgotPasswordLink");

  const redirectInput =
    qs(container, 'input[name="redirect"]');

  const fieldIdentifier =
    identifierInput?.closest?.(".login-field") ||
    qs(container, '[data-field="identifier"]') ||
    qs(container, '[data-field="email"]');

  const fieldPassword =
    passwordInput?.closest?.(".login-field") ||
    passwordInput?.closest?.(".password-wrapper") ||
    qs(container, '[data-field="password"]');

  return {
    container,
    root,

    form: qs(container, "#loginForm"),

    identifierInput,
    emailInput: identifierInput,

    passwordInput,
    rememberInput: qs(container, "#loginRemember"),

    redirectInput,

    submitButton,
    themeToggleButton: qs(container, "#loginThemeToggle"),
    togglePasswordButton,

    eyeOpenIcon,
    eyeClosedIcon,

    capsIndicator,
    capsWrap: capsIndicator,
    capsIcon,
    capsLabel,

    forgotPasswordLink,

    errorBox: qs(container, "#loginError"),

    fieldIdentifier,
    fieldEmail: fieldIdentifier,
    fieldPassword,

    toastRoot: qs(container, "#loginToast"),
    toastIcon: qs(container, "#loginToastIcon"),
    toastTitle: qs(container, "#loginToastTitle"),
    toastText: qs(container, "#loginToastText"),
    toastClose: qs(container, "#loginToastClose"),
    toastProgress: qs(container, "#loginToastProgress"),
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
  setAriaInvalid(inputNode, Boolean(invalid));
}

export function setFieldError(fieldNode, message = "") {
  setFieldInvalid(fieldNode, Boolean(toText(message, "")));
}

export function clearFieldError(fieldNode) {
  setFieldInvalid(fieldNode, false);
}

export function clearLoginErrors(refs = {}) {
  clearFieldError(refs.fieldIdentifier);
  clearFieldError(refs.fieldEmail);
  clearFieldError(refs.fieldPassword);

  setInputInvalid(refs.identifierInput, false);
  setInputInvalid(refs.emailInput, false);
  setInputInvalid(refs.passwordInput, false);

  if (refs.errorBox) {
    refs.errorBox.textContent = "";
  }
}

export function applyLoginErrors(refs = {}, errors = {}) {
  const identifierError =
    toText(errors.identifier, "") || toText(errors.email, "");

  const passwordError =
    toText(errors.password, "");

  const firstError =
    identifierError || passwordError || "";

  setFieldError(refs.fieldIdentifier, identifierError);
  setFieldError(refs.fieldEmail, identifierError);
  setFieldError(refs.fieldPassword, passwordError);

  setInputInvalid(refs.identifierInput, Boolean(identifierError));
  setInputInvalid(refs.emailInput, Boolean(identifierError));
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
    "Acceder"
  );

  const loadingLabel = toText(
    options.loadingLabel,
    "Accediendo..."
  );

  const {
    form,
    identifierInput,
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

  if (identifierInput) {
    identifierInput.disabled = isLoading;
  }

  /*
    No deshabilitamos password ni toggle del ojo
    para mantener la experiencia visual estable
    y evitar sensaciones raras durante submit.
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
      ? `<span class="login-submit-text">${loadingLabel}</span>`
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
  const eyeOpenIcon = refs?.eyeOpenIcon;
  const eyeClosedIcon = refs?.eyeClosedIcon;

  if (!passwordInput || !togglePasswordButton) {
    return isVisible;
  }

  passwordInput.type = isVisible ? "text" : "password";

  togglePasswordButton.classList.toggle("active", isVisible);

  togglePasswordButton.setAttribute(
    "aria-label",
    isVisible
      ? "Ocultar contraseña"
      : "Mostrar contraseña"
  );

  togglePasswordButton.setAttribute(
    "title",
    isVisible
      ? "Ocultar contraseña"
      : "Mostrar contraseña"
  );

  togglePasswordButton.setAttribute(
    "aria-pressed",
    String(isVisible)
  );

  if (eyeOpenIcon) {
    setHidden(eyeOpenIcon, isVisible);
  }

  if (eyeClosedIcon) {
    setHidden(eyeClosedIcon, !isVisible);
  }

  return isVisible;
}

export function togglePasswordVisibility(refs = {}) {
  const current = getPasswordVisibilityState(refs);
  return setPasswordVisibility(refs, !current);
}

/* =========================================================
   CAPS
========================================================= */

export function setCapsIndicatorState(refs = {}, visible = false) {
  const isVisible = Boolean(visible);

  if (refs.capsIndicator) {
    refs.capsIndicator.hidden = !isVisible;
    refs.capsIndicator.classList.toggle("is-visible", isVisible);
  }

  if (refs.capsIcon) {
    refs.capsIcon.hidden = !isVisible;
  }

  if (refs.capsLabel) {
    refs.capsLabel.hidden = !isVisible;
  }

  return isVisible;
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

      refs.identifierInput?.focus?.();
      refs.identifierInput?.select?.();
    } catch {}
  });
}

/* =========================================================
   STATE SNAPSHOT
========================================================= */

export function readLoginFormState(refs = {}) {
  return {
    identifier: toText(refs?.identifierInput?.value, ""),
    email: toText(refs?.identifierInput?.value, "").toLowerCase(),
    password: toText(refs?.passwordInput?.value, ""),
    remember: Boolean(refs?.rememberInput?.checked),
    redirect: toText(refs?.redirectInput?.value, ""),
  };
}

/* =========================================================
   BIND HELPERS
========================================================= */

export function bindLoginInputClearers(refs = {}, handler = null) {
  if (typeof handler !== "function") {
    return () => {};
  }

  refs.identifierInput?.addEventListener("input", handler);
  refs.passwordInput?.addEventListener("input", handler);

  return () => {
    refs.identifierInput?.removeEventListener("input", handler);
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
