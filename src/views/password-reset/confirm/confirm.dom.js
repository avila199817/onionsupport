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
========================================================= */

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
    ) || container;

  return {
    container,
    root,

    form:
      qs(
        root,
        "#confirmResetForm"
      ),

    tokenInput:
      qs(
        root,
        "#resetToken"
      ),

    passwordInput:
      qs(
        root,
        "#newPassword"
      ),

    confirmPasswordInput:
      qs(
        root,
        "#confirmPassword"
      ),

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
      qs(
        root,
        '[data-field="password"]'
      ),

    fieldConfirmPassword:
      qs(
        root,
        '[data-field="confirm-password"]'
      ),
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
    refs.confirmPasswordInput,
    false
  );

  toggleClass(
    refs.fieldPassword,
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
    );

  const confirmError =
    safeText(
      errors.confirmPassword,
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

    toggleClass(
      refs.fieldPassword,
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

  setDisabled(
    refs.passwordInput,
    isLoading
  );

  setDisabled(
    refs.confirmPasswordInput,
    isLoading
  );

  setDisabled(
    refs.submitButton,
    isLoading
  );

  setDisabled(
    refs.backLink,
    isLoading
  );

  if (
    refs.submitButton
  ) {
    refs.submitButton.textContent =
      isLoading
        ? loadingLabel
        : submitLabel;

    refs.submitButton.dataset.loading =
      String(
        isLoading
      );
  }

  if (refs.form) {
    refs.form.setAttribute(
      "aria-busy",
      isLoading
        ? "true"
        : "false"
    );
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
    refs.confirmPasswordInput,
    true
  );

  setDisabled(
    refs.submitButton,
    true
  );

  if (
    refs.submitButton
  ) {
    refs.submitButton.textContent =
      "Actualizado";
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
