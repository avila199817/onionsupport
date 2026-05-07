/* =========================================================
   Onion SPA - Activate Account Template
   Archivo: src/views/activate-account/activate-account.template.js

   ACTIVATE ACCOUNT · AUTH TEMPLATE · FINAL PRO SYSTEM · CSP CLEAN · 10/10
   LOGIN.CSS CONTRACT ALIGNED · APPLE STYLE · PRO SAAS AUTH

   RESPONSABILIDADES:
   - generar el HTML premium de activación de cuenta
   - reutilizar el MISMO sistema visual de /src/css/auth/login.css
   - mantener layout auth-screen alineado con login y password-reset
   - conservar bloque lateral izquierdo de estado
   - renderizar card principal a la derecha
   - soportar activación por token capturado en memoria
   - pedir contraseña nueva antes de activar la cuenta
   - reutilizar el sistema compartido de password-field
   - no exponer token real en DOM
   - incluir toast superior derecho desacoplado
   - usar logo real de empresa según tema activo
   - alinear contrato de logo con login.template.js y reset-password.template.js
   - exponer ids estables para dom.js / activateAccountView.js
   - mantener compatibilidad total con flujo SPA público
   - evitar botones duplicados de retorno
   - sin recuperación manual de token en UI
   - sin CSS inline
   - sin <style>
   - sin JS visual
========================================================= */

import { renderPasswordField } from "../../shared/password-field/index.js";

/* =========================================================
   BASICS
========================================================= */

function safeText(value = "", fallback = "") {
  if ( value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeBool(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =========================================================
   STATUS
========================================================= */

const ACTIVATE_ACCOUNT_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  ERROR: "error",
  EXPIRED: "expired",
  INVALID: "invalid",
});

const CAPTURED_TOKEN_SENTINELS = new Set([
  "__captured_activation_token__",
  "__captured_token__",
  "__token_captured__",
]);

function normalizeStatus(value = "") {
  const status = safeText(value, ACTIVATE_ACCOUNT_STATUS.IDLE).toLowerCase();

  if (
    [
      ACTIVATE_ACCOUNT_STATUS.IDLE,
      ACTIVATE_ACCOUNT_STATUS.LOADING,
      ACTIVATE_ACCOUNT_STATUS.SUCCESS,
      ACTIVATE_ACCOUNT_STATUS.ERROR,
      ACTIVATE_ACCOUNT_STATUS.EXPIRED,
      ACTIVATE_ACCOUNT_STATUS.INVALID,
    ].includes(status)
  ) {
    return status;
  }

  return ACTIVATE_ACCOUNT_STATUS.IDLE;
}

function resolveHasCapturedToken(options = {}) {
  const explicit =
    options?.hasToken ??
    options?.tokenCaptured ??
    options?.hasActivationToken ??
    null;

  if (explicit !== null && explicit !== undefined) {
    return safeBool(explicit, false);
  }

  const token = safeText(
    options?.token ||
      options?.activationToken ||
      options?.activateToken,
    ""
  );

  if (!token) {
    return false;
  }

  if (CAPTURED_TOKEN_SENTINELS.has(token)) {
    return true;
  }

  return true;
}

function shouldRenderPasswordFields(status, hasToken) {
  return (
    hasToken === true &&
    (
      status === ACTIVATE_ACCOUNT_STATUS.IDLE ||
      status === ACTIVATE_ACCOUNT_STATUS.ERROR
    )
  );
}

function isTerminalStatus(status = "") {
  return (
    status === ACTIVATE_ACCOUNT_STATUS.SUCCESS ||
    status === ACTIVATE_ACCOUNT_STATUS.EXPIRED ||
    status === ACTIVATE_ACCOUNT_STATUS.INVALID
  );
}

function resolveStatusCopy(status = ACTIVATE_ACCOUNT_STATUS.IDLE, options = {}) {
  const appName = safeText(options?.appName, "Onion Support");

  const copy = {
    [ACTIVATE_ACCOUNT_STATUS.IDLE]: {
      eyebrow: "ACTIVACIÓN DE CUENTA",
      title: "Activa tu cuenta",
      subtitle: "Define una contraseña segura para habilitar tu acceso al panel.",
      body: "Introduce tu nueva contraseña y confirma la activación. El enlace ya ha sido validado y no se mostrará en pantalla.",
      button: "Activar cuenta",
      badge: "Pendiente",
      footer: "Entorno protegido. Usa una contraseña segura y personal.",
    },

    [ACTIVATE_ACCOUNT_STATUS.LOADING]: {
      eyebrow: "VALIDANDO ACTIVACIÓN",
      title: "Activando tu cuenta",
      subtitle: "Estamos guardando tu contraseña y activando tu acceso.",
      body: "No cierres esta ventana hasta que confirmemos el resultado de la activación.",
      button: "Activando...",
      badge: "Procesando",
      footer: "Validación segura en curso.",
    },

    [ACTIVATE_ACCOUNT_STATUS.SUCCESS]: {
      eyebrow: "CUENTA ACTIVADA",
      title: "Cuenta activada correctamente",
      subtitle: `Tu cuenta de ${appName} ya está lista para iniciar sesión.`,
      body: "Ya puedes acceder al panel con la contraseña que acabas de configurar.",
      button: "Ir al acceso",
      badge: "Activada",
      footer: "Acceso habilitado correctamente.",
    },

    [ACTIVATE_ACCOUNT_STATUS.ERROR]: {
      eyebrow: "NO SE PUDO ACTIVAR",
      title: "No se pudo activar la cuenta",
      subtitle: "Ha ocurrido un problema al guardar la contraseña o validar la activación.",
      body: "Revisa la contraseña e inténtalo de nuevo. Si el problema continúa, solicita un nuevo enlace o contacta con soporte.",
      button: "Reintentar activación",
      badge: "Error",
      footer: "El enlace puede haber caducado, haber sido utilizado o la contraseña no cumplir los requisitos.",
    },

    [ACTIVATE_ACCOUNT_STATUS.EXPIRED]: {
      eyebrow: "ENLACE CADUCADO",
      title: "El enlace ha caducado",
      subtitle: "Por seguridad, los enlaces de activación tienen una duración limitada.",
      body: "Solicita un nuevo enlace de activación para completar el acceso a tu cuenta.",
      button: "Volver al acceso",
      badge: "Caducado",
      footer: "No se ha realizado ningún cambio en la cuenta.",
    },

    [ACTIVATE_ACCOUNT_STATUS.INVALID]: {
      eyebrow: "ENLACE NO VÁLIDO",
      title: "Enlace de activación no válido",
      subtitle: "No hemos podido encontrar un token de activación válido en esta URL.",
      body: "Abre el enlace completo recibido por correo. El enlace debe incluir el token de activación en la URL.",
      button: "Volver al acceso",
      badge: "No válido",
      footer: "No se ha realizado ningún cambio en la cuenta.",
    },
  };

  const base = copy[status] || copy[ACTIVATE_ACCOUNT_STATUS.IDLE];

  const customCopy =
    options?.copy &&
    typeof options.copy === "object" &&
    !Array.isArray(options.copy)
      ? options.copy
      : {};

  return {
    eyebrow: safeText(customCopy.eyebrow, base.eyebrow),
    title: safeText(customCopy.title, base.title),
    subtitle: safeText(customCopy.subtitle, base.subtitle),
    body: safeText(customCopy.body, base.body),
    button: safeText(customCopy.button, base.button),
    badge: safeText(customCopy.badge, base.badge),
    footer: safeText(customCopy.footer, base.footer),
  };
}

/* =========================================================
   ICONS
========================================================= */

function getToastInfoIcon() {
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M11 7h2V5h-2v2Zm0 12h2V9h-2v10Zm1-17C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Z"
      />
    </svg>
  `;
}

function getToastCloseIcon() {
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.29 1.41 1.41 6.3-6.29 6.29 6.29 1.41-1.41-6.29-6.29 6.29-6.3-1.41-1.41Z"
      />
    </svg>
  `;
}

function getShieldIcon() {
  return `
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2 4.5 5.25v5.85c0 4.66 3.12 9.02 7.5 10.3 4.38-1.28 7.5-5.64 7.5-10.3V5.25L12 2Zm3.58 7.95-4.2 4.2a1 1 0 0 1-1.42 0l-1.7-1.7a1 1 0 0 1 1.42-1.41l.99.99 3.49-3.49a1 1 0 0 1 1.42 1.41Z"
      />
    </svg>
  `;
}

function getSuccessIcon() {
  return `
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 .01 20.01A10 10 0 0 0 12 2Zm4.7 7.7-5.6 5.6a1 1 0 0 1-1.4 0l-2.4-2.4a1 1 0 1 1 1.4-1.42l1.7 1.7 4.9-4.9a1 1 0 0 1 1.4 1.42Z"
      />
    </svg>
  `;
}

function getWarningIcon() {
  return `
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M1.86 19.5 11.13 3.48a1 1 0 0 1 1.74 0l9.27 16.02a1 1 0 0 1-.87 1.5H2.73a1 1 0 0 1-.87-1.5ZM11 9v5h2V9h-2Zm0 7v2h2v-2h-2Z"
      />
    </svg>
  `;
}

function getLoadingIcon() {
  return `
    <span
      class="activate-account-status-spinner"
      aria-hidden="true"
    ></span>
  `;
}

function getStatusIcon(status = ACTIVATE_ACCOUNT_STATUS.IDLE) {
  if (status === ACTIVATE_ACCOUNT_STATUS.LOADING) {
    return getLoadingIcon();
  }

  if (status === ACTIVATE_ACCOUNT_STATUS.SUCCESS) {
    return getSuccessIcon();
  }

  if (
    status === ACTIVATE_ACCOUNT_STATUS.ERROR ||
    status === ACTIVATE_ACCOUNT_STATUS.EXPIRED ||
    status === ACTIVATE_ACCOUNT_STATUS.INVALID
  ) {
    return getWarningIcon();
  }

  return getShieldIcon();
}

/* =========================================================
   LOGO
   Contrato alineado con login.template.js + reset-password.template.js:
   - .login-logo-theme
   - .login-logo-theme-img
   - .login-logo-theme-dark
   - .login-logo-theme-light
   - .logo-dark / .logo-light aliases
   - .login-logo--dark / .login-logo--light aliases
========================================================= */

function renderThemeLogo({
  darkSrc = "/src/media/img/favicon_white.png",
  lightSrc = "/src/media/img/favicon_black.png",
  alt = "Onion Support",
} = {}) {
  const finalAlt = safeText(alt, "Onion Support");

  return `
    <span
      class="login-logo-theme"
      aria-label="${escapeHtml(finalAlt)}"
      data-login-logo="true"
      data-login-logo-theme="true"
    >
      <img
        class="login-logo-theme-img login-logo-theme-dark logo-dark login-logo--dark"
        src="${escapeHtml(darkSrc)}"
        alt=""
        width="44"
        height="44"
        loading="eager"
        decoding="async"
        aria-hidden="true"
      />

      <img
        class="login-logo-theme-img login-logo-theme-light logo-light login-logo--light"
        src="${escapeHtml(lightSrc)}"
        alt=""
        width="44"
        height="44"
        loading="eager"
        decoding="async"
        aria-hidden="true"
      />
    </span>
  `;
}

/* =========================================================
   TOAST
========================================================= */

function renderToast() {
  return `
    <div
      class="login-toast-stack login-toast-stack--top-right"
      aria-live="polite"
      aria-atomic="true"
      data-activate-account-toast-stack="true"
    >
      <div
        id="activateAccountToast"
        class="login-toast"
        role="status"
        aria-hidden="true"
        data-state="default"
        hidden
      >
        <div class="login-toast-glow" aria-hidden="true"></div>

        <div class="login-toast-body">
          <div
            id="activateAccountToastIcon"
            class="login-toast-icon"
            aria-hidden="true"
          >
            ${getToastInfoIcon()}
          </div>

          <div class="login-toast-content">
            <div
              id="activateAccountToastTitle"
              class="login-toast-title"
            >
              Aviso
            </div>

            <div
              id="activateAccountToastText"
              class="login-toast-text"
            ></div>
          </div>

          <button
            type="button"
            id="activateAccountToastClose"
            class="login-toast-close"
            aria-label="Cerrar aviso"
            data-tooltip="Cerrar aviso"
            data-activate-account-toast-close="true"
          >
            ${getToastCloseIcon()}
          </button>
        </div>

        <span
          id="activateAccountToastProgress"
          class="login-toast-progress"
          aria-hidden="true"
        ></span>
      </div>
    </div>
  `;
}

/* =========================================================
   LEFT PANEL
========================================================= */

function renderSignalItem(text = "") {
  const label = safeText(text, "");

  if (!label) {
    return "";
  }

  return `
    <div class="login-signal-item">
      <span class="dot" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function renderLeftPanel({
  heroEyebrow = "ONION SUPPORT · ACTIVACIÓN SEGURA",
  heroTitle = "Habilitación protegida de tu cuenta",
  bullets = [],
} = {}) {
  const customSignals = safeArray(bullets)
    .map((item) => safeText(item, ""))
    .filter(Boolean);

  const finalSignals = customSignals.length
    ? customSignals
    : [
        "Validación segura del enlace recibido por correo",
        "Contraseña creada antes del primer acceso",
        "Flujo público desacoplado del panel privado",
      ];

  return `
    <aside
      class="login-side login-side-left login-side-left--raised"
      aria-label="Estado de activación"
    >
      <div class="login-side-panel login-side-panel--status">
        <div class="login-side-eyebrow">
          ${escapeHtml(heroEyebrow)}
        </div>

        <h3>
          ${escapeHtml(heroTitle)}
        </h3>

        <div class="login-signal-list">
          ${finalSignals.map(renderSignalItem).join("")}
        </div>
      </div>
    </aside>
  `;
}

/* =========================================================
   STATUS CARD
========================================================= */

function renderStatusCard({
  status = ACTIVATE_ACCOUNT_STATUS.IDLE,
  copy = {},
} = {}) {
  const finalStatus = normalizeStatus(status);

  return `
    <div
      class="activate-account-status-box"
      data-activate-account-status-box="true"
    >
      <div
        class="activate-account-status-card"
        id="activateAccountStatusCard"
        data-activate-account-status-card="true"
      >
        <div
          class="activate-account-status-icon"
          id="activateAccountStatusIcon"
          aria-hidden="true"
        >
          ${getStatusIcon(finalStatus)}
        </div>

        <div class="activate-account-status-copy">
          <span
            class="activate-account-badge"
            id="activateAccountStatusBadge"
          >
            ${escapeHtml(copy.badge)}
          </span>

          <div
            class="activate-account-status-eyebrow"
            id="activateAccountEyebrow"
          >
            ${escapeHtml(copy.eyebrow)}
          </div>

          <h3
            class="activate-account-status-title"
            id="activateAccountStatusTitle"
          >
            ${escapeHtml(copy.title)}
          </h3>

          <p
            class="activate-account-status-text"
            id="activateAccountStatusText"
          >
            ${escapeHtml(copy.body)}
          </p>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   PASSWORD FIELDS
========================================================= */

function renderActivationPasswordFields({
  passwordPlaceholder = "Nueva contraseña",
  confirmPasswordPlaceholder = "Repetir contraseña",
  passwordAriaLabel = "Nueva contraseña",
  confirmPasswordAriaLabel = "Repetir contraseña",
  passwordHelp = "La contraseña debe cumplir los requisitos de seguridad configurados para la plataforma.",
} = {}) {
  const finalPasswordPlaceholder = safeText(
    passwordPlaceholder,
    "Nueva contraseña"
  );

  const finalConfirmPasswordPlaceholder = safeText(
    confirmPasswordPlaceholder,
    "Repetir contraseña"
  );

  const finalPasswordAriaLabel = safeText(
    passwordAriaLabel,
    "Nueva contraseña"
  );

  const finalConfirmPasswordAriaLabel = safeText(
    confirmPasswordAriaLabel,
    "Repetir contraseña"
  );

  const finalPasswordHelp = safeText(
    passwordHelp,
    "La contraseña debe cumplir los requisitos de seguridad configurados para la plataforma."
  );

  return `
    <div
      class="activate-account-password-fields"
      id="activateAccountPasswordFields"
      data-activate-password-fields="true"
    >
      ${renderPasswordField({
        escapeHtml,
        fieldId: "activateAccountPassword",
        fieldName: "password",
        placeholder: finalPasswordPlaceholder,
        ariaLabel: finalPasswordAriaLabel,
        autocomplete: "new-password",
        fieldClass: "login-field activate-account-password-field",
        fieldDataName: "password",
        wrapperClass: "password-wrapper",
        inputClass: "input-text",
        required: true,
        showCapsIndicator: true,
        capsLabel: "Bloq Mayús",
        toggleLabelShow: "Mostrar contraseña",
        toggleLabelHide: "Ocultar contraseña",
      })}

      ${renderPasswordField({
        escapeHtml,
        fieldId: "activateAccountPasswordConfirm",
        fieldName: "confirmPassword",
        placeholder: finalConfirmPasswordPlaceholder,
        ariaLabel: finalConfirmPasswordAriaLabel,
        autocomplete: "new-password",
        fieldClass: "login-field activate-account-password-field",
        fieldDataName: "confirmPassword",
        wrapperClass: "password-wrapper",
        inputClass: "input-text",
        required: true,
        showCapsIndicator: true,
        capsLabel: "Bloq Mayús",
        toggleLabelShow: "Mostrar contraseña",
        toggleLabelHide: "Ocultar contraseña",
      })}

      <p
        class="activate-account-password-help"
        id="activateAccountPasswordHelp"
      >
        ${escapeHtml(finalPasswordHelp)}
      </p>
    </div>
  `;
}

/* =========================================================
   FORM
========================================================= */

function renderForm({
  appName = "Onion Support",
  status = ACTIVATE_ACCOUNT_STATUS.IDLE,
  hasToken = false,
  copy = {},
  loginHref = "/login",
  backLabel = "Volver al acceso",
  logoDarkSrc = "/src/media/img/favicon_white.png",
  logoLightSrc = "/src/media/img/favicon_black.png",
  autoSubmit = false,
  passwordPlaceholder = "Nueva contraseña",
  confirmPasswordPlaceholder = "Repetir contraseña",
  passwordHelp = "La contraseña debe cumplir los requisitos de seguridad configurados para la plataforma.",
} = {}) {
  const finalAppName = safeText(appName, "Onion Support");
  const finalStatus = normalizeStatus(status);
  const finalHasToken = safeBool(hasToken, false);
  const finalLoginHref = safeText(loginHref, "/login");
  const finalBackLabel = safeText(backLabel, "Volver al acceso");

  const isLoading =
    finalStatus === ACTIVATE_ACCOUNT_STATUS.LOADING;

  const renderPasswords =
    shouldRenderPasswordFields(finalStatus, finalHasToken);

  const terminal =
    isTerminalStatus(finalStatus);

  const effectiveAutoSubmit =
    finalHasToken === true &&
    terminal === false &&
    renderPasswords === false &&
    autoSubmit === true;

  const finalButtonLabel =
    terminal
      ? finalBackLabel
      : safeText(copy.button, "Activar cuenta");

  const buttonAction =
    terminal
      ? "go-login"
      : "activate-account";

  return `
    <section
      class="login-stage login-stage--right"
      aria-label="Activación de cuenta"
    >
      <div class="login-card-shell login-card-shell--right">
        <div
          class="login-card login-card--offset login-card--clean activate-account-card"
          id="activateAccountCard"
          data-activate-account-card="true"
        >
          <header class="login-header">
            <div class="logo-fade" aria-hidden="true">
              ${renderThemeLogo({
                darkSrc: logoDarkSrc,
                lightSrc: logoLightSrc,
                alt: finalAppName,
              })}
            </div>

            <h2 id="activateAccountTitle">
              ${escapeHtml(copy.title)}
            </h2>

            <p
              class="login-subtitle"
              id="activateAccountSubtitle"
            >
              ${escapeHtml(copy.subtitle)}
            </p>
          </header>

          <form
            class="login-form activate-account-form"
            id="activateAccountForm"
            data-activate-account-form="true"
            novalidate
            data-auto-submit="${effectiveAutoSubmit ? "true" : "false"}"
            data-has-token="${finalHasToken ? "true" : "false"}"
            data-requires-password="${renderPasswords ? "true" : "false"}"
            data-status="${escapeHtml(finalStatus)}"
          >
            <input
              type="hidden"
              id="activateAccountToken"
              name="token"
              value=""
              autocomplete="off"
              data-token-present="${finalHasToken ? "true" : "false"}"
            />

            <input
              type="hidden"
              id="activateAccountStatus"
              name="status"
              value="${escapeHtml(finalStatus)}"
              autocomplete="off"
            />

            ${renderStatusCard({
              status: finalStatus,
              copy,
            })}

            ${
              renderPasswords
                ? renderActivationPasswordFields({
                    passwordPlaceholder,
                    confirmPasswordPlaceholder,
                    passwordHelp,
                  })
                : ""
            }

            <div
              class="login-error"
              id="activateAccountError"
              role="alert"
              aria-live="polite"
              aria-atomic="true"
              hidden
            ></div>

            <button
              class="login-button"
              id="activateAccountButton"
              type="submit"
              data-action="${escapeHtml(buttonAction)}"
              data-login-href="${escapeHtml(finalLoginHref)}"
              data-activate-account-submit="true"
              ${isLoading ? 'disabled aria-busy="true"' : ""}
            >
              <span class="login-submit-text">
                ${escapeHtml(finalButtonLabel)}
              </span>
            </button>
          </form>

          <footer class="login-footer">
            <span>${escapeHtml(copy.footer)}</span>
          </footer>
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function getActivateAccountTemplate(options = {}) {
  const appName = safeText(
    options?.appName,
    "Onion Support"
  );

  const requestedStatus = normalizeStatus(
    options?.status
  );

  const hasToken =
    resolveHasCapturedToken(options);

  const computedStatus =
    !hasToken && requestedStatus === ACTIVATE_ACCOUNT_STATUS.IDLE
      ? ACTIVATE_ACCOUNT_STATUS.INVALID
      : requestedStatus;

  const copy = resolveStatusCopy(
    computedStatus,
    {
      ...options,
      appName,
    }
  );

  const loginHref = safeText(
    options?.loginHref ||
      options?.backHref,
    "/login"
  );

  const backLabel = safeText(
    options?.backLabel,
    computedStatus === ACTIVATE_ACCOUNT_STATUS.SUCCESS
      ? "Ir al acceso"
      : "Volver al acceso"
  );

  return `
    <section
      class="login-view activate-account-view"
      data-view="activate-account"
      data-activate-account-view="true"
      data-status="${escapeHtml(computedStatus)}"
      data-has-token="${hasToken ? "true" : "false"}"
    >
      ${renderToast()}

      <div class="login-scene">
        <div
          class="login-grid"
          id="activateAccountGrid"
          data-activate-account-grid="true"
        >
          ${renderLeftPanel({
            ...options,
            appName,
          })}

          ${renderForm({
            appName,
            status: computedStatus,
            hasToken,
            copy,
            loginHref,
            backLabel,
            logoDarkSrc: safeText(
              options?.logoDarkSrc,
              "/src/media/img/favicon_white.png"
            ),
            logoLightSrc: safeText(
              options?.logoLightSrc,
              "/src/media/img/favicon_black.png"
            ),
            autoSubmit: options?.autoSubmit === true,
            passwordPlaceholder: safeText(
              options?.passwordPlaceholder,
              "Nueva contraseña"
            ),
            confirmPasswordPlaceholder: safeText(
              options?.confirmPasswordPlaceholder,
              "Repetir contraseña"
            ),
            passwordHelp: safeText(
              options?.passwordHelp,
              "La contraseña debe tener al menos 8 caracteres."
            ),
          })}
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   EXPORTS
========================================================= */

export {
  ACTIVATE_ACCOUNT_STATUS,
  getActivateAccountTemplate as ActivateAccountTemplate,
};

export default getActivateAccountTemplate;
