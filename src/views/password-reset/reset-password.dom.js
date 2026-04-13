/* =========================================================
   Onion SPA - Reset Password DOM
   Archivo: src/views/reset-password/reset-password.dom.js

   Responsabilidades:
   - resolver refs reales del dom de recuperación
   - encapsular estados visuales del formulario
   - aplicar y limpiar errores
   - controlar loading ui
   - gestionar focus inicial
   - exponer lectura robusta del formulario
   - facilitar bind / unbind desacoplado
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

function setAriaInvalid(node, active = false) {
  if (!node) return;
  node.setAttribute("aria-invalid", active ? "true" : "false");
}

function setHidden(node, hidden) {
  if (!node) return;
  node.hidden = Boolean(hidden);
}

/* =========================================================
   REFS
========================================================= */

export function getResetPasswordRefs(container) {
  const root =
    qs(container, ".reset-password-view") ||
    qs(container, '[data-view="reset-password"]') ||
    container ||
    null;

  const identifierInput =
    qs(container, "#resetIdentifier");

  const submitButton =
    qs(container, "#resetPasswordButton");

  const fieldIdentifier =
    identifierInput?.closest?.(".login-field") ||
    qs(container, '[data-field="identifier"]') ||
    qs(container, '[data-field="email"]');

  return {
    container,
    root,

    form: qs(container, "#resetPasswordForm"),
    card: qs(container, "#resetPasswordCard"),
    stage: qs(container, "#resetPasswordStage"),
    grid: qs(container, "#resetPasswordGrid"),

    identifierInput,
    emailInput: identifierInput,

    submitButton,
    backToLoginLink: qs(container, "#backToLoginLink"),
    themeToggleButton: qs(container, "#resetPasswordThemeToggle"),

    fieldIdentifier,
    fieldEmail: fieldIdentifier,

    errorBox: qs(container, "#resetPasswordError"),

    toastRoot: qs(container, "#resetPasswordToast"),
    toastIcon: qs(container, "#resetPasswordToastIcon"),
    toastTitle: qs(container, "#resetPasswordToastTitle"),
    toastText: qs(container, "#resetPasswordToastText"),
    toastClose: qs(container, "#resetPasswordToastClose"),
    toastProgress: qs(container, "#resetPasswordToastProgress"),
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

export function clearResetPasswordErrors(refs = {}) {
  clearFieldError(refs.fieldIdentifier);
  clearFieldError(refs.fieldEmail);

  setInputInvalid(refs.identifierInput, false);
  setInputInvalid(refs.emailInput, false);

  if (refs.errorBox) {
    refs.errorBox.textContent = "";
  }
}

export function applyResetPasswordErrors(refs = {}, errors = {}) {
  const identifierError =
    toText(errors.identifier, "") || toText(errors.email, "");

  const firstError = identifierError || "";

  setFieldError(refs.fieldIdentifier, identifierError);
  setFieldError(refs.fieldEmail, identifierError);

  setInputInvalid(refs.identifierInput, Boolean(identifierError));
  setInputInvalid(refs.emailInput, Boolean(identifierError));

  if (refs.errorBox) {
    refs.errorBox.textContent = firstError;
  }
}

export function setGlobalResetPasswordError(refs = {}, message = "") {
  if (!refs?.errorBox) return;
  refs.errorBox.textContent = toText(message, "");
}

/* =========================================================
   LOADING STATE
========================================================= */

export function setResetPasswordLoading(
  refs = {},
  loading = false,
  options = {}
) {
  const isLoading = Boolean(loading);

  const submitLabel = toText(
    options.submitLabel,
    "Enviar enlace"
  );

  const loadingLabel = toText(
    options.loadingLabel,
    "Enviando..."
  );

  const {
    form,
    identifierInput,
    submitButton,
    themeToggleButton,
    backToLoginLink,
  } = refs;

  if (form) {
    form.setAttribute("aria-busy", String(isLoading));
    form.dataset.submitting = String(isLoading);
  }

  if (identifierInput) {
    identifierInput.disabled = isLoading;
  }

  if (themeToggleButton) {
    themeToggleButton.disabled = isLoading;
  }

  if (backToLoginLink) {
    backToLoginLink.setAttribute("aria-disabled", String(isLoading));
    backToLoginLink.classList.toggle("is-disabled", isLoading);
    backToLoginLink.tabIndex = isLoading ? -1 : 0;
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
   VISUAL HELPERS
========================================================= */

export function shakeResetPasswordCard(refs = {}) {
  const card = refs?.card;

  if (!card) return;

  card.classList.remove("shake");
  void card.offsetWidth;
  card.classList.add("shake");
}

export function setResetPasswordSuccessState(
  refs = {},
  options = {}
) {
  const title = toText(
    options.title,
    "Revisa tu correo"
  );

  const message = toText(
    options.message,
    "Si el identificador existe, te enviaremos las instrucciones para restablecer la contraseña."
  );

  const form = refs?.form;
  const card = refs?.card;

  if (form) {
    form.setAttribute("data-success", "true");
    form.classList.add("is-success");
  }

  if (card) {
    card.setAttribute("data-success", "true");
    card.classList.add("is-success");
  }

  if (refs?.identifierInput) {
    refs.identifierInput.disabled = true;
  }

  if (refs?.submitButton) {
    refs.submitButton.disabled = true;
    refs.submitButton.dataset.loading = "false";
    refs.submitButton.innerHTML =
      `<span class="login-submit-text">${title}</span>`;
  }

  if (refs?.errorBox) {
    refs.errorBox.textContent = message;
  }
}

export function setResetPasswordNeutralState(refs = {}) {
  const form = refs?.form;
  const card = refs?.card;

  if (form) {
    form.removeAttribute("data-success");
    form.classList.remove("is-success");
  }

  if (card) {
    card.removeAttribute("data-success");
    card.classList.remove("is-success");
  }
}

/* =========================================================
   TOAST VIEW HELPERS
========================================================= */

export function getResetPasswordToastRefs(refs = {}) {
  return {
    toastRoot: refs.toastRoot,
    toastIcon: refs.toastIcon,
    toastTitle: refs.toastTitle,
    toastText: refs.toastText,
    toastClose: refs.toastClose,
    toastProgress: refs.toastProgress,
  };
}

export function hideResetPasswordToast(refs = {}) {
  const { toastRoot, toastProgress } = getResetPasswordToastRefs(refs);

  if (!toastRoot) return;

  toastRoot.classList.remove(
    "is-visible",
    "is-success",
    "is-error",
    "is-info",
    "is-warning"
  );

  toastRoot.hidden = true;
  toastRoot.setAttribute("aria-hidden", "true");
  toastRoot.dataset.state = "default";

  if (toastProgress) {
    toastProgress.style.animation = "none";
    toastProgress.style.transform = "";
    toastProgress.style.opacity = "";
  }
}

export function setResetPasswordToastVisibility(refs = {}, visible = false) {
  const toastRoot = refs?.toastRoot;
  if (!toastRoot) return Boolean(visible);

  setHidden(toastRoot, !visible);
  toastRoot.setAttribute("aria-hidden", visible ? "false" : "true");

  if (!visible) {
    toastRoot.dataset.state = "default";
  }

  return Boolean(visible);
}

/* =========================================================
   FOCUS
========================================================= */

export function focusResetPasswordPrimaryField(
  refs = {},
  options = {}
) {
  const rememberedIdentifier = Boolean(
    options.rememberedIdentifier || options.rememberedEmail
  );

  queueMicrotask(() => {
    try {
      refs.identifierInput?.focus?.();

      if (!rememberedIdentifier) {
        refs.identifierInput?.select?.();
      }
    } catch {}
  });
}

/* =========================================================
   STATE SNAPSHOT
========================================================= */

export function readResetPasswordFormState(refs = {}) {
  return {
    identifier: toText(refs?.identifierInput?.value, ""),
    email: toText(refs?.identifierInput?.value, "").toLowerCase(),
  };
}

/* =========================================================
   BIND HELPERS
========================================================= */

export function bindResetPasswordInputClearers(refs = {}, handler = null) {
  if (typeof handler !== "function") {
    return () => {};
  }

  refs.identifierInput?.addEventListener("input", handler);

  return () => {
    refs.identifierInput?.removeEventListener("input", handler);
  };
}

export function bindResetPasswordSubmit(refs = {}, handler = null) {
  if (typeof handler !== "function") {
    return () => {};
  }

  refs.form?.addEventListener("submit", handler);

  return () => {
    refs.form?.removeEventListener("submit", handler);
  };
}

export function bindResetPasswordToastClose(refs = {}, handler = null) {
  if (typeof handler !== "function") {
    return () => {};
  }

  refs.toastClose?.addEventListener("click", handler);

  return () => {
    refs.toastClose?.removeEventListener("click", handler);
  };
}

export function bindResetPasswordBackLink(refs = {}, handler = null) {
  if (typeof handler !== "function") {
    return () => {};
  }

  refs.backToLoginLink?.addEventListener("click", handler);

  return () => {
    refs.backToLoginLink?.removeEventListener("click", handler);
  };
}

export function bindResetPasswordThemeToggle(refs = {}, handler = null) {
  if (typeof handler !== "function") {
    return () => {};
  }

  refs.themeToggleButton?.addEventListener("click", handler);

  return () => {
    refs.themeToggleButton?.removeEventListener("click", handler);
  };
}
