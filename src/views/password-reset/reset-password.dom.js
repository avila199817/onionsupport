/* =========================================================
   Onion SPA - Reset Password DOM
   Archivo: src/views/password-reset/reset-password.dom.js

   Responsabilidades:
   - resolver refs del dom de recuperación
   - encapsular estados visuales del formulario
   - aplicar y limpiar errores
   - controlar loading ui
   - gestionar focus inicial
   - facilitar bind / unbind desacoplado
   - soportar toast inline del reset
   - mantener consistencia con login.css
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

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isFunction(value) {
  return typeof value === "function";
}

function setText(node, value = "") {
  if (!node) return;
  node.textContent = toText(value, "");
}

function setHtml(node, value = "") {
  if (!node) return;
  node.innerHTML = String(value ?? "");
}

function setHidden(node, hidden) {
  if (!node) return;
  node.hidden = Boolean(hidden);
}

function setDisabled(node, disabled) {
  if (!node) return;
  node.disabled = Boolean(disabled);
}

function setAriaInvalid(node, active = false) {
  if (!node) return;
  node.setAttribute("aria-invalid", active ? "true" : "false");
}

function setAriaBusy(node, active = false) {
  if (!node) return;
  node.setAttribute("aria-busy", active ? "true" : "false");
}

function toggleClass(node, className, active = false) {
  if (!node || !className) return;
  node.classList.toggle(className, Boolean(active));
}

function removeClasses(node, classNames = []) {
  if (!node || !Array.isArray(classNames) || classNames.length === 0) {
    return;
  }

  node.classList.remove(...classNames);
}

function resolveSubmitMarkup(label = "") {
  return `<span class="login-submit-text">${toText(label, "")}</span>`;
}

function resolveFieldNode(inputNode, root, selectors = []) {
  const parentField =
    inputNode?.closest?.(".login-field") ||
    inputNode?.closest?.("[data-field]") ||
    null;

  if (parentField) {
    return parentField;
  }

  for (const selector of selectors) {
    const found = qs(root, selector);
    if (found) {
      return found;
    }
  }

  return null;
}

function bindDomEvent(node, eventName, handler, options) {
  if (!node || !isFunction(handler) || !toText(eventName, "")) {
    return () => {};
  }

  node.addEventListener(eventName, handler, options);

  return () => {
    node.removeEventListener(eventName, handler, options);
  };
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
    qs(root, 'input[name="email"]') ||
    null;

  const submitButton =
    qs(root, "#resetPasswordButton") ||
    qs(root, 'button[type="submit"]') ||
    null;

  const fieldIdentifier = resolveFieldNode(
    identifierInput,
    root,
    [
      '[data-field="identifier"]',
      '[data-field="email"]',
    ]
  );

  return {
    container,
    root,

    form:
      qs(root, "#resetPasswordForm") ||
      qs(root, "form") ||
      null,

    card:
      qs(root, "#resetPasswordCard") ||
      qs(root, ".login-card") ||
      null,

    stage:
      qs(root, "#resetPasswordStage") ||
      qs(root, ".login-stage") ||
      null,

    grid:
      qs(root, "#resetPasswordGrid") ||
      qs(root, ".login-grid") ||
      null,

    identifierInput,
    emailInput: identifierInput,

    submitButton,

    backToLoginLink:
      qs(root, "#backToLoginLink") ||
      qs(root, 'a[data-spa]') ||
      null,

    themeToggleButton:
      qs(root, "#resetPasswordThemeToggle") ||
      qs(root, '[data-action="theme-toggle"]') ||
      null,

    fieldIdentifier,
    fieldEmail: fieldIdentifier,

    errorBox:
      qs(root, "#resetPasswordError") ||
      qs(root, '[role="alert"]') ||
      null,

    toastRoot:
      qs(root, "#resetPasswordToast") ||
      null,

    toastIcon:
      qs(root, "#resetPasswordToastIcon") ||
      null,

    toastTitle:
      qs(root, "#resetPasswordToastTitle") ||
      null,

    toastText:
      qs(root, "#resetPasswordToastText") ||
      null,

    toastClose:
      qs(root, "#resetPasswordToastClose") ||
      null,

    toastProgress:
      qs(root, "#resetPasswordToastProgress") ||
      null,
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

  toggleClass(inputNode, "is-invalid", Boolean(invalid));
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

  const globalError =
    toText(errors.global, "") ||
    toText(errors.message, "");

  const firstError =
    identifierError ||
    globalError ||
    "";

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
   LOADING / SUCCESS / NEUTRAL
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
    card,
  } = refs;

  if (form) {
    setAriaBusy(form, isLoading);
    form.dataset.submitting = String(isLoading);
  }

  if (card) {
    card.dataset.submitting = String(isLoading);
    toggleClass(card, "is-loading", isLoading);
  }

  setDisabled(identifierInput, isLoading);
  setDisabled(themeToggleButton, isLoading);

  if (backToLoginLink) {
    backToLoginLink.setAttribute(
      "aria-disabled",
      String(isLoading)
    );
    toggleClass(backToLoginLink, "is-disabled", isLoading);
    backToLoginLink.tabIndex = isLoading ? -1 : 0;
  }

  if (submitButton) {
    submitButton.disabled = isLoading;
    submitButton.dataset.loading = String(isLoading);
    setHtml(
      submitButton,
      resolveSubmitMarkup(
        isLoading ? loadingLabel : submitLabel
      )
    );
  }
}

export function shakeResetPasswordCard(refs = {}) {
  const card = refs?.card;

  if (!card) return;

  card.classList.remove("shake");
  void card.offsetWidth;
  card.classList.add("shake");
}

export function setResetPasswordSuccessState(refs = {}, options = {}) {
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
    form.classList.remove("is-loading");
    setAriaBusy(form, false);
    form.dataset.submitting = "false";
  }

  if (card) {
    card.setAttribute("data-success", "true");
    card.classList.add("is-success");
    card.classList.remove("is-loading");
    card.dataset.submitting = "false";
  }

  setDisabled(refs.identifierInput, true);
  setDisabled(refs.themeToggleButton, true);

  if (refs.backToLoginLink) {
    refs.backToLoginLink.setAttribute("aria-disabled", "false");
    refs.backToLoginLink.classList.remove("is-disabled");
    refs.backToLoginLink.tabIndex = 0;
  }

  if (refs.submitButton) {
    refs.submitButton.disabled = true;
    refs.submitButton.dataset.loading = "false";
    setHtml(
      refs.submitButton,
      resolveSubmitMarkup(title)
    );
  }

  setText(refs.errorBox, message);
}

export function setResetPasswordNeutralState(refs = {}, options = {}) {
  const submitLabel = toText(
    options.submitLabel,
    "Enviar enlace"
  );

  const form = refs?.form;
  const card = refs?.card;

  if (form) {
    form.removeAttribute("data-success");
    form.classList.remove("is-success", "is-loading");
    setAriaBusy(form, false);
    form.dataset.submitting = "false";
  }

  if (card) {
    card.removeAttribute("data-success");
    card.classList.remove("is-success", "is-loading");
    card.dataset.submitting = "false";
  }

  setDisabled(refs.identifierInput, false);
  setDisabled(refs.themeToggleButton, false);

  if (refs.backToLoginLink) {
    refs.backToLoginLink.setAttribute("aria-disabled", "false");
    refs.backToLoginLink.classList.remove("is-disabled");
    refs.backToLoginLink.tabIndex = 0;
  }

  if (refs.submitButton) {
    refs.submitButton.disabled = false;
    refs.submitButton.dataset.loading = "false";
    setHtml(
      refs.submitButton,
      resolveSubmitMarkup(submitLabel)
    );
  }
}

/* =========================================================
   TOAST
========================================================= */

export function getResetPasswordToastRefs(refs = {}) {
  return {
    toastRoot: refs.toastRoot || null,
    toastIcon: refs.toastIcon || null,
    toastTitle: refs.toastTitle || null,
    toastText: refs.toastText || null,
    toastClose: refs.toastClose || null,
    toastProgress: refs.toastProgress || null,
  };
}

export function hideResetPasswordToast(refs = {}) {
  const {
    toastRoot,
    toastProgress,
  } = getResetPasswordToastRefs(refs);

  if (!toastRoot) return;

  removeClasses(toastRoot, [
    "is-visible",
    "is-success",
    "is-error",
    "is-info",
    "is-warning",
  ]);

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

  if (!toastRoot) {
    return Boolean(visible);
  }

  setHidden(toastRoot, !visible);
  toastRoot.setAttribute(
    "aria-hidden",
    visible ? "false" : "true"
  );

  if (!visible) {
    toastRoot.dataset.state = "default";
  }

  return Boolean(visible);
}

export function setResetPasswordToastContent(refs = {}, options = {}) {
  const {
    toastRoot,
    toastTitle,
    toastText,
  } = getResetPasswordToastRefs(refs);

  if (!toastRoot) {
    return false;
  }

  const title = toText(options.title, "Aviso");
  const message = toText(options.message, "");
  const type = toText(options.type, "info").toLowerCase();

  removeClasses(toastRoot, [
    "is-success",
    "is-error",
    "is-info",
    "is-warning",
  ]);

  toastRoot.dataset.state = type;
  toastRoot.classList.add(`is-${type}`);

  setText(toastTitle, title);
  setText(toastText, message);

  return true;
}

export function resetResetPasswordToastProgress(refs = {}) {
  const { toastProgress } = getResetPasswordToastRefs(refs);

  if (!toastProgress) {
    return;
  }

  toastProgress.style.animation = "none";
  toastProgress.style.transform = "";
  toastProgress.style.opacity = "";
}

export function startResetPasswordToastProgress(
  refs = {},
  duration = 0,
  animationName = "loginToastProgress"
) {
  const { toastProgress } = getResetPasswordToastRefs(refs);

  if (!toastProgress) {
    return false;
  }

  const safeDuration = Math.max(0, toNumber(duration, 0));

  resetResetPasswordToastProgress(refs);

  if (safeDuration <= 0) {
    return true;
  }

  void toastProgress.offsetWidth;
  toastProgress.style.animation =
    `${animationName} ${safeDuration}ms linear forwards`;

  return true;
}

export function showResetPasswordToast(refs = {}, options = {}) {
  const duration = Math.max(
    0,
    toNumber(options.duration, 3200)
  );

  const autoHide =
    Object.prototype.hasOwnProperty.call(options, "autoHide")
      ? Boolean(options.autoHide)
      : true;

  setResetPasswordToastContent(refs, options);
  setResetPasswordToastVisibility(refs, true);

  if (refs.toastRoot) {
    refs.toastRoot.classList.add("is-visible");
  }

  if (autoHide && duration > 0) {
    startResetPasswordToastProgress(refs, duration);

    window.setTimeout(() => {
      hideResetPasswordToast(refs);
    }, duration);
  } else {
    resetResetPasswordToastProgress(refs);
  }

  return true;
}

/* =========================================================
   FOCUS
========================================================= */

export function focusResetPasswordPrimaryField(refs = {}, options = {}) {
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
  return bindDomEvent(
    refs.identifierInput,
    "input",
    handler
  );
}

export function bindResetPasswordSubmit(refs = {}, handler = null) {
  return bindDomEvent(
    refs.form,
    "submit",
    handler
  );
}

export function bindResetPasswordToastClose(refs = {}, handler = null) {
  return bindDomEvent(
    refs.toastClose,
    "click",
    handler
  );
}

export function bindResetPasswordBackLink(refs = {}, handler = null) {
  return bindDomEvent(
    refs.backToLoginLink,
    "click",
    handler
  );
}

export function bindResetPasswordThemeToggle(refs = {}, handler = null) {
  return bindDomEvent(
    refs.themeToggleButton,
    "click",
    handler
  );
}
