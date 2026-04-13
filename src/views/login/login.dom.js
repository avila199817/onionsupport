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
    passwordInput: qs(container, "#loginPassword"),
    rememberInput: qs(container, "#loginRemember"),
    errorBox: qs(container, "#loginError"),
    submitButton: qs(container, "#loginSubmit"),
    themeToggleButton: qs(container, "#loginThemeToggle"),
    togglePasswordButton: qs(container, "#togglePassword"),
    fieldEmail: qs(container, '[data-field="email"]'),
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

export function setFieldError(fieldNode, message = "") {
  setFieldInvalid(fieldNode, Boolean(toText(message, "")));
}

export function clearFieldError(fieldNode) {
  setFieldInvalid(fieldNode, false);
}

export function clearLoginErrors(refs = {}) {
  clearFieldError(refs.fieldEmail);
  clearFieldError(refs.fieldPassword);

  if (refs.errorBox) {
    refs.errorBox.textContent = "";
  }
}

export function applyLoginErrors(refs = {}, errors = {}) {
  const emailError = toText(errors.email, "");
  const passwordError = toText(errors.password, "");
  const firstError = emailError || passwordError || "";

  setFieldError(refs.fieldEmail, emailError);
  setFieldError(refs.fieldPassword, passwordError);

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
    "Accediendo…"
  );

  const {
    form,
    emailInput,
    passwordInput,
    rememberInput,
    submitButton,
    themeToggleButton,
    togglePasswordButton,
  } = refs;

  if (form) {
    form.setAttribute("aria-busy", String(isLoading));
  }

  for (const node of [
    emailInput,
    passwordInput,
    rememberInput,
    submitButton,
    themeToggleButton,
    togglePasswordButton,
  ]) {
    if (!node) continue;
    node.disabled = isLoading;
  }

  if (submitButton) {
    submitButton.innerHTML = isLoading
      ? `
        <span class="login-view__spinner" aria-hidden="true"></span>
        <span>${loadingLabel}</span>
      `
      : submitLabel;
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

  if (!passwordInput || !togglePasswordButton) return isVisible;

  passwordInput.type = isVisible ? "text" : "password";

  togglePasswordButton.textContent = isVisible
    ? "Ocultar"
    : "Ver";

  togglePasswordButton.setAttribute(
    "aria-label",
    isVisible
      ? "Ocultar contraseña"
      : "Mostrar contraseña"
  );

  togglePasswordButton.setAttribute(
    "aria-pressed",
    String(isVisible)
  );

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
  const rememberedEmail = Boolean(options.rememberedEmail);

  queueMicrotask(() => {
    try {
      if (rememberedEmail && refs.passwordInput) {
        refs.passwordInput.focus();
        return;
      }

      refs.emailInput?.focus();
    } catch {}
  });
}

/* =========================================================
   STATE SNAPSHOT
========================================================= */

export function readLoginFormState(refs = {}) {
  return {
    email: toText(refs?.emailInput?.value, "").toLowerCase(),
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
