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
   - endurecer acceso al DOM y consistencia visual
========================================================= */

/* =========================================================
   HELPERS
========================================================= */

function qs(root, selector) {
  return root?.querySelector?.(selector) || null;
}

function toText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

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

function setDisabled(node, disabled) {
  if (!node) return;
  node.disabled = Boolean(disabled);
}

function setText(node, value = "") {
  if (!node) return;
  node.textContent = toText(value, "");
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
    qs(root, "#resetIdentifier") ||
    qs(root, 'input[name="identifier"]') ||
    qs(root, 'input[name="email"]');

  const submitButton =
    qs(root, "#resetPasswordButton") ||
    qs(root, 'button[type="submit"]');

  const fieldIdentifier =
    identifierInput?.closest?.(".login-field") ||
    qs(root, '[data-field="identifier"]') ||
    qs(root, '[data-field="email"]') ||
    null;

  return {
    container,
    root,

    form:
      qs(root, "#resetPasswordForm") ||
      qs(root, "form"),

    card:
      qs(root, "#resetPasswordCard") ||
      qs(root, ".login-card"),

    stage:
      qs(root, "#resetPasswordStage") ||
      qs(root, ".login-stage"),

    grid:
      qs(root, "#resetPasswordGrid") ||
      qs(root, ".login-grid"),

    identifierInput,
    emailInput: identifierInput,

    submitButton,

    backToLoginLink:
      qs(root, "#backToLoginLink") ||
      qs(root, 'a[data-spa]'),

    themeToggleButton:
      qs(root, "#resetPasswordThemeToggle") ||
      qs(root, '[data-action="theme-toggle"]'),

    fieldIdentifier,
    fieldEmail: fieldIdentifier,

    errorBox:
      qs(root, "#resetPasswordError") ||
      qs(root, '[role="alert"]'),

    toastRoot: qs(root, "#resetPasswordToast"),
    toastIcon: qs(root, "#resetPasswordToastIcon"),
    toastTitle: qs(root, "#resetPasswordToastTitle"),
    toastText: qs(root, "#resetPasswordToastText"),
    toastClose: qs(root, "#resetPasswordToastClose"),
    toastProgress: qs(root, "#resetPasswordToastProgress"),
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

  setText(refs.errorBox, "");
}

export function applyResetPasswordErrors(refs = {}, errors = {}) {
  const identifierError =
    toText(errors.identifier, "") ||
    toText(errors.email, "");

  const firstError = identifierError || "";

  setFieldError(refs.fieldIdentifier, identifierError);
  setFieldError(refs.fieldEmail, identifierError);

  setInputInvalid(refs.identifierInput, Boolean(identifierError));
  setInputInvalid(refs.emailInput, Boolean(identifierError));

  setText(refs.errorBox, firstError);
}

export function setGlobalResetPasswordError(refs = {}, message = "") {
  setText(refs.errorBox, message);
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

  setDisabled(identifierInput, isLoading);
  setDisabled(themeToggleButton, isLoading);

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
    form.setAttribute("aria-busy", "false");
    form.dataset.submitting = "false";
  }

  if (card) {
    card.setAttribute("data-success", "true");
    card.classList.add("is-success");
  }

  setDisabled(refs.identifierInput, true);
  setDisabled(refs.themeToggleButton, true);

  if (refs?.backToLoginLink) {
    refs.backToLoginLink.setAttribute("aria-disabled", "false");
    refs.backToLoginLink.classList.remove("is-disabled");
    refs.backToLoginLink.tabIndex = 0;
  }

  if (refs?.submitButton) {
    refs.submitButton.disabled = true;
    refs.submitButton.dataset.loading = "false";
    refs.submitButton.innerHTML =
      `<span class="login-submit-text">${title}</span>`;
  }

  setText(refs.errorBox, message);
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

      if (rememberedIdentifier) {
        return;
      }

      refs.identifierInput?.select?.();
    } catch {}
  });
}

/* =========================================================
   STATE SNAPSHOT
========================================================= */

export function readResetPasswordFormState(refs = {}) {
  const identifier = toText(refs?.identifierInput?.value, "");

  return {
    identifier,
    email: identifier.toLowerCase(),
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
