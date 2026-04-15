/* =========================================================
   Onion SPA - Reset Password Confirm DOM
   Archivo: src/views/password-reset/confirm/confirm.dom.js

   Responsabilidades:
   - resolver refs del DOM confirm
   - aplicar / limpiar errores
   - controlar loading UI
   - success state
   - focus inicial
   - lectura robusta del formulario
   - binds desacoplados
   - integrar el sistema compartido de password-field
========================================================= */

import {
  bindPasswordFieldsInScope,
} from "../../../shared/password-field/index.js";

/* =========================================================
   HELPERS
========================================================= */

function qs(
  root,
  selector
) {
  return (
    root?.querySelector?.(
      selector
    ) || null
  );
}

function safeText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(
    value
  ).trim();

  return text || fallback;
}

function toggleClass(
  node,
  className,
  active = false
) {
  if (
    !node ||
    !className
  ) {
    return;
  }

  node.classList.toggle(
    className,
    Boolean(active)
  );
}

function setText(
  node,
  value = ""
) {
  if (!node) {
    return;
  }

  node.textContent =
    safeText(value, "");
}

function setDisabled(
  node,
  active = false
) {
  if (!node) {
    return;
  }

  node.disabled =
    Boolean(active);
}

function setInvalid(
  node,
  active = false
) {
  if (!node) {
    return;
  }

  toggleClass(
    node,
    "is-invalid",
    active
  );

  node.setAttribute(
    "aria-invalid",
    active
      ? "true"
      : "false"
  );
}

function setAriaDisabled(
  node,
  active = false
) {
  if (!node) {
    return;
  }

  node.setAttribute(
    "aria-disabled",
    active
      ? "true"
      : "false"
  );
}

function resolvePasswordFieldByInput(
  root,
  inputId = ""
) {
  const input = qs(
    root,
    `#${inputId}`
  );

  if (!input) {
    return {
      input: null,
      field: null,
      toggle: null,
      caps: null,
    };
  }

  const field =
    input.closest(
      '[data-password-field="true"]'
    ) ||
    input.closest(
      ".login-field"
    );

  return {
    input,
    field,
    toggle: qs(
      field,
      '[data-password-toggle="true"]'
    ),
    caps: qs(
      field,
      '[data-password-caps="true"]'
    ),
  };
}

function getBoundPasswordField(
  bindings = [],
  inputId = ""
) {
  return (
    bindings.find(
      (entry) =>
        entry?.input?.id ===
        inputId
    ) || null
  );
}

/* =========================================================
   REFS
========================================================= */

export function getConfirmRefs(
  container
) {
  const root =
    qs(
      container,
      ".confirm-reset-view"
    ) ||
    qs(
      container,
      '[data-confirm-reset-view="true"]'
    ) ||
    qs(
      container,
      '[data-view="reset-password-confirm"]'
    ) ||
    container;

  const passwordFieldBindings =
    bindPasswordFieldsInScope(
      root || container || document
    );

  const boundNewPasswordField =
    getBoundPasswordField(
      passwordFieldBindings,
      "newPassword"
    );

  const boundConfirmPasswordField =
    getBoundPasswordField(
      passwordFieldBindings,
      "confirmPassword"
    );

  const fallbackNewPasswordField =
    resolvePasswordFieldByInput(
      root,
      "newPassword"
    );

  const fallbackConfirmPasswordField =
    resolvePasswordFieldByInput(
      root,
      "confirmPassword"
    );

  const newPasswordField =
    boundNewPasswordField || fallbackNewPasswordField;

  const confirmPasswordField =
    boundConfirmPasswordField || fallbackConfirmPasswordField;

  return {
    container,
    root,

    form:
      qs(
        root,
        "#confirmResetForm"
      ),

    card:
      qs(
        root,
        "#confirmResetCard"
      ),

    tokenInput:
      qs(
        root,
        "#resetToken"
      ),

    passwordInput:
      newPasswordField?.input ||
      null,

    newPasswordInput:
      newPasswordField?.input ||
      null,

    confirmPasswordInput:
      confirmPasswordField?.input ||
      null,

    submitButton:
      qs(
        root,
        "#confirmResetButton"
      ),

    errorBox:
      qs(
        root,
        "#confirmResetError"
      ),

    backLink:
      qs(
        root,
        "#confirmBackToLogin"
      ),

    fieldPassword:
      newPasswordField?.field ||
      qs(
        root,
        '[data-field="password"]'
      ),

    fieldNewPassword:
      newPasswordField?.field ||
      qs(
        root,
        '[data-field="password"]'
      ),

    fieldConfirmPassword:
      confirmPasswordField?.field ||
      qs(
        root,
        '[data-field="confirm-password"]'
      ),

    togglePasswordButton:
      newPasswordField?.toggle ||
      null,

    toggleNewPasswordButton:
      newPasswordField?.toggle ||
      null,

    toggleConfirmPasswordButton:
      confirmPasswordField?.toggle ||
      null,

    capsIndicator:
      newPasswordField?.caps ||
      null,

    newPasswordCapsIndicator:
      newPasswordField?.caps ||
      null,

    confirmCapsIndicator:
      confirmPasswordField?.caps ||
      null,

    passwordFieldBindings,
    passwordField:
      boundNewPasswordField || null,
    confirmPasswordField:
      boundConfirmPasswordField || null,
  };
}

/* =========================================================
   ERRORS
========================================================= */

export function clearConfirmErrors(
  refs = {}
) {
  setInvalid(
    refs.passwordInput,
    false
  );

  setInvalid(
    refs.newPasswordInput,
    false
  );

  setInvalid(
    refs.confirmPasswordInput,
    false
  );

  toggleClass(
    refs.fieldPassword,
    "is-invalid",
    false
  );

  toggleClass(
    refs.fieldNewPassword,
    "is-invalid",
    false
  );

  toggleClass(
    refs.fieldConfirmPassword,
    "is-invalid",
    false
  );

  setText(
    refs.errorBox,
    ""
  );
}

export function applyConfirmErrors(
  refs = {},
  errors = {}
) {
  const passwordError =
    safeText(
      errors.password,
      ""
    ) ||
    safeText(
      errors.newPassword,
      ""
    );

  const confirmError =
    safeText(
      errors.confirmPassword,
      ""
    ) ||
    safeText(
      errors.confirm,
      ""
    );

  const tokenError =
    safeText(
      errors.token,
      ""
    );

  const globalError =
    safeText(
      errors.global,
      ""
    );

  if (passwordError) {
    setInvalid(
      refs.passwordInput,
      true
    );

    setInvalid(
      refs.newPasswordInput,
      true
    );

    toggleClass(
      refs.fieldPassword,
      "is-invalid",
      true
    );

    toggleClass(
      refs.fieldNewPassword,
      "is-invalid",
      true
    );
  }

  if (confirmError) {
    setInvalid(
      refs.confirmPasswordInput,
      true
    );

    toggleClass(
      refs.fieldConfirmPassword,
      "is-invalid",
      true
    );
  }

  setText(
    refs.errorBox,
    globalError ||
      tokenError ||
      passwordError ||
      confirmError
  );
}

export function setGlobalConfirmError(
  refs = {},
  message = ""
) {
  setText(
    refs.errorBox,
    message
  );
}

/* =========================================================
   LOADING
========================================================= */

export function setConfirmLoading(
  refs = {},
  loading = false,
  options = {}
) {
  const isLoading =
    Boolean(loading);

  const submitLabel =
    safeText(
      options.submitLabel,
      "Actualizar contraseña"
    );

  const loadingLabel =
    safeText(
      options.loadingLabel,
      "Procesando..."
    );

  if (refs.form) {
    refs.form.setAttribute(
      "aria-busy",
      isLoading
        ? "true"
        : "false"
    );

    refs.form.dataset.submitting =
      String(isLoading);
  }

  /*
    No deshabilitamos los campos password
    ni los toggles del sistema compartido
    para no romper eye / caps ni la UX.
  */
  setDisabled(
    refs.tokenInput,
    isLoading
  );

  if (refs.submitButton) {
    refs.submitButton.disabled =
      isLoading;

    refs.submitButton.dataset.loading =
      String(
        isLoading
      );

    refs.submitButton.innerHTML =
      isLoading
        ? `
          <span class="login-view__spinner" aria-hidden="true"></span>
          <span class="login-submit-text">${loadingLabel}</span>
        `
        : `<span class="login-submit-text">${submitLabel}</span>`;
  }

  if (refs.backLink) {
    setAriaDisabled(
      refs.backLink,
      isLoading
    );

    toggleClass(
      refs.backLink,
      "is-disabled",
      isLoading
    );

    refs.backLink.tabIndex =
      isLoading
        ? -1
        : 0;
  }
}

/* =========================================================
   SUCCESS
========================================================= */

export function setConfirmSuccessState(
  refs = {},
  message = ""
) {
  setConfirmLoading(
    refs,
    false
  );

  setDisabled(
    refs.passwordInput,
    true
  );

  setDisabled(
    refs.newPasswordInput,
    true
  );

  setDisabled(
    refs.confirmPasswordInput,
    true
  );

  setDisabled(
    refs.togglePasswordButton,
    true
  );

  setDisabled(
    refs.toggleNewPasswordButton,
    true
  );

  setDisabled(
    refs.toggleConfirmPasswordButton,
    true
  );

  setDisabled(
    refs.submitButton,
    true
  );

  if (
    refs.submitButton
  ) {
    refs.submitButton.dataset.loading =
      "false";

    refs.submitButton.innerHTML =
      `<span class="login-submit-text">Actualizado</span>`;
  }

  setText(
    refs.errorBox,
    message
  );

  refs.form?.setAttribute(
    "data-success",
    "true"
  );
}

/* =========================================================
   FOCUS
========================================================= */

export function focusConfirmPrimaryField(
  refs = {}
) {
  queueMicrotask(
    () => {
      try {
        refs.passwordInput?.focus?.();
      } catch {}
    }
  );
}

/* =========================================================
   FORM SNAPSHOT
========================================================= */

export function readConfirmFormState(
  refs = {}
) {
  return {
    token:
      safeText(
        refs.tokenInput
          ?.value,
        ""
      ),

    password:
      String(
        refs.passwordInput
          ?.value || ""
      ),

    newPassword:
      String(
        refs.newPasswordInput
          ?.value || ""
      ),

    confirmPassword:
      String(
        refs
          .confirmPasswordInput
          ?.value || ""
      ),
  };
}

/* =========================================================
   BINDS
========================================================= */

function bind(
  node,
  eventName,
  handler
) {
  if (
    !node ||
    typeof handler !==
      "function"
  ) {
    return () => {};
  }

  node.addEventListener(
    eventName,
    handler
  );

  return () => {
    node.removeEventListener(
      eventName,
      handler
    );
  };
}

export function bindConfirmSubmit(
  refs = {},
  handler
) {
  return bind(
    refs.form,
    "submit",
    handler
  );
}

export function bindConfirmInputClearers(
  refs = {},
  handler
) {
  const off1 = bind(
    refs.passwordInput,
    "input",
    handler
  );

  const off2 = bind(
    refs.confirmPasswordInput,
    "input",
    handler
  );

  return () => {
    off1();
    off2();
  };
}

export function bindConfirmBack(
  refs = {},
  handler
) {
  return bind(
    refs.backLink,
    "click",
    handler
  );
}
