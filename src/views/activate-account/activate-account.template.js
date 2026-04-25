/* =========================================================
   Onion SPA - Activate Account Template
   Archivo: src/views/activate-account/activate-account.template.js

   Responsabilidades:
   - generar el html premium de activación de cuenta
   - reutilizar el MISMO sistema visual de /src/css/auth/login.css
   - mantener layout auth-screen alineado con login y password-reset
   - conservar bloque lateral izquierdo de estado
   - renderizar card principal a la derecha
   - soportar activación automática por token o activación manual
   - incluir toast superior derecho desacoplado
   - usar logo real de empresa según tema activo
   - exponer ids estables para dom.js / activateAccountView.js
   - mantener compatibilidad total con flujo SPA público
========================================================= */

/* =========================================================
   BASICS
========================================================= */

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
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

function resolveStatusCopy(status = ACTIVATE_ACCOUNT_STATUS.IDLE, options = {}) {
  const appName = safeText(options?.appName, "Onion Support");

  const copy = {
    [ACTIVATE_ACCOUNT_STATUS.IDLE]: {
      eyebrow: "ACTIVACIÓN DE CUENTA",
      title: "Activa tu cuenta",
      subtitle:
        "Verifica el enlace recibido por correo para habilitar tu acceso al panel.",
      body:
        "Pulsa el botón para completar la activación. Este proceso valida tu enlace y habilita el acceso asociado a tu cuenta.",
      button: "Activar cuenta",
      badge: "Pendiente",
      footer:
        "Entorno protegido. El enlace de activación es personal y puede caducar.",
    },

    [ACTIVATE_ACCOUNT_STATUS.LOADING]: {
      eyebrow: "VALIDANDO ENLACE",
      title: "Activando tu cuenta",
      subtitle:
        "Estamos verificando tu enlace de activación. Este proceso puede tardar unos segundos.",
      body:
        "No cierres esta ventana hasta que confirmemos el resultado de la activación.",
      button: "Activando...",
      badge: "Procesando",
      footer:
        "Validación segura en curso.",
    },

    [ACTIVATE_ACCOUNT_STATUS.SUCCESS]: {
      eyebrow: "CUENTA ACTIVADA",
      title: "Cuenta activada correctamente",
      subtitle:
        `Tu cuenta de ${appName} ya está lista para iniciar sesión.`,
      body:
        "Ya puedes acceder al panel con tus credenciales. Si el inicio de sesión no se abre automáticamente, usa el botón inferior.",
      button: "Ir al acceso",
      badge: "Activada",
      footer:
        "Acceso habilitado correctamente.",
    },

    [ACTIVATE_ACCOUNT_STATUS.ERROR]: {
      eyebrow: "NO SE PUDO ACTIVAR",
      title: "No se pudo activar la cuenta",
      subtitle:
        "Ha ocurrido un problema al validar el enlace de activación.",
      body:
        "Puedes reintentar la activación. Si el problema continúa, solicita un nuevo enlace o contacta con soporte.",
      button: "Reintentar activación",
      badge: "Error",
      footer:
        "El enlace puede haber caducado o ya haber sido utilizado.",
    },

    [ACTIVATE_ACCOUNT_STATUS.EXPIRED]: {
      eyebrow: "ENLACE CADUCADO",
      title: "El enlace ha caducado",
      subtitle:
        "Por seguridad, los enlaces de activación tienen una duración limitada.",
      body:
        "Solicita un nuevo enlace de activación para completar el acceso a tu cuenta.",
      button: "Volver al acceso",
      badge: "Caducado",
      footer:
        "No se ha realizado ningún cambio en la cuenta.",
    },

    [ACTIVATE_ACCOUNT_STATUS.INVALID]: {
      eyebrow: "ENLACE NO VÁLIDO",
      title: "Enlace de activación no válido",
      subtitle:
        "No hemos podido encontrar un token de activación válido en esta URL.",
      body:
        "Revisa que hayas abierto el enlace completo recibido por correo. También puedes volver al acceso y solicitar ayuda.",
      button: "Volver al acceso",
      badge: "No válido",
      footer:
        "No se ha realizado ningún cambio en la cuenta.",
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
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11 7h2V5h-2v2Zm0 12h2V9h-2v10Zm1-17C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Z"
      />
    </svg>
  `;
}

function getToastCloseIcon() {
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.3 5.71 12 12.01l-6.3-6.3-1.41 1.41 6.3 6.3-6.3 6.29 1.41 1.41 6.3-6.29 6.29 6.29 1.41-1.41-6.29-6.29 6.29-6.3-1.41-1.41Z"
      />
    </svg>
  `;
}

function getBackArrowIcon() {
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.71 6.29a1 1 0 0 1 0 1.41L11.41 11H20a1 1 0 1 1 0 2h-8.59l3.3 3.29a1 1 0 0 1-1.41 1.42l-5-5a1 1 0 0 1 0-1.42l5-5a1 1 0 0 1 1.41 0Z"
      />
    </svg>
  `;
}

function getShieldIcon() {
  return `
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2 4.5 5.25v5.85c0 4.66 3.12 9.02 7.5 10.3 4.38-1.28 7.5-5.64 7.5-10.3V5.25L12 2Zm3.58 7.95-4.2 4.2a1 1 0 0 1-1.42 0l-1.7-1.7a1 1 0 0 1 1.42-1.41l.99.99 3.49-3.49a1 1 0 0 1 1.42 1.41Z"
      />
    </svg>
  `;
}

function getSuccessIcon() {
  return `
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 .01 20.01A10 10 0 0 0 12 2Zm4.7 7.7-5.6 5.6a1 1 0 0 1-1.4 0l-2.4-2.4a1 1 0 1 1 1.4-1.42l1.7 1.7 4.9-4.9a1 1 0 0 1 1.4 1.42Z"
      />
    </svg>
  `;
}

function getWarningIcon() {
  return `
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1.86 19.5 11.13 3.48a1 1 0 0 1 1.74 0l9.27 16.02a1 1 0 0 1-.87 1.5H2.73a1 1 0 0 1-.87-1.5ZM11 9v5h2V9h-2Zm0 7v2h2v-2h-2Z"
      />
    </svg>
  `;
}

function getLoadingIcon() {
  return `
    <span class="activate-account-status-spinner" aria-hidden="true"></span>
  `;
}

function getStatusIcon(status = ACTIVATE_ACCOUNT_STATUS.IDLE) {
  if (status === ACTIVATE_ACCOUNT_STATUS.LOADING) return getLoadingIcon();
  if (status === ACTIVATE_ACCOUNT_STATUS.SUCCESS) return getSuccessIcon();
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
========================================================= */

function renderThemeLogo({
  darkSrc = "/src/media/img/favicon_white.png",
  lightSrc = "/src/media/img/favicon_black.png",
  alt = "Onion Support",
} = {}) {
  return `
    <span class="login-logo-theme" aria-hidden="true">
      <img
        class="login-logo-theme-dark"
        src="${escapeHtml(darkSrc)}"
        alt="${escapeHtml(alt)}"
        width="44"
        height="44"
        loading="eager"
        decoding="async"
      />
      <img
        class="login-logo-theme-light"
        src="${escapeHtml(lightSrc)}"
        alt="${escapeHtml(alt)}"
        width="44"
        height="44"
        loading="eager"
        decoding="async"
      />
    </span>
  `;
}

function renderScopedThemeLogoStyle() {
  return `
    <style>
      .login-logo-theme{
        position:relative;
        display:block;
        width:44px;
        height:44px;
        z-index:1;
      }

      .login-logo-theme img{
        position:absolute;
        inset:0;
        width:44px;
        height:44px;
        object-fit:contain;
        display:block;
      }

      .login-logo-theme-dark{
        opacity:1;
        visibility:visible;
      }

      .login-logo-theme-light{
        opacity:0;
        visibility:hidden;
      }

      [data-theme="light"] .login-logo-theme-dark{
        opacity:0;
        visibility:hidden;
      }

      [data-theme="light"] .login-logo-theme-light{
        opacity:1;
        visibility:visible;
      }
    </style>
  `;
}

/* =========================================================
   SCOPED STYLES
========================================================= */

function renderActivateAccountScopedStyle() {
  return `
    <style>
      .activate-account-view .activate-account-status-box{
        margin:18px 0 0;
        display:grid;
        gap:14px;
      }

      .activate-account-view .activate-account-status-card{
        position:relative;
        overflow:hidden;
        border-radius:20px;
        border:1px solid rgba(148,163,184,.22);
        background:
          radial-gradient(circle at top left, rgba(124,92,255,.10), transparent 36%),
          rgba(255,255,255,.62);
        padding:18px 18px 17px;
        display:grid;
        grid-template-columns:44px minmax(0, 1fr);
        gap:14px;
        align-items:start;
      }

      .activate-account-view .activate-account-status-icon{
        width:44px;
        height:44px;
        border-radius:16px;
        display:grid;
        place-items:center;
        color:#6d53d7;
        background:rgba(124,92,255,.10);
        border:1px solid rgba(124,92,255,.16);
      }

      .activate-account-view[data-status="success"] .activate-account-status-icon{
        color:#258a59;
        background:rgba(54,198,144,.10);
        border-color:rgba(54,198,144,.22);
      }

      .activate-account-view[data-status="error"] .activate-account-status-icon,
      .activate-account-view[data-status="expired"] .activate-account-status-icon,
      .activate-account-view[data-status="invalid"] .activate-account-status-icon{
        color:#c24141;
        background:rgba(255,107,107,.10);
        border-color:rgba(255,107,107,.22);
      }

      .activate-account-view .activate-account-status-copy{
        min-width:0;
        display:grid;
        gap:5px;
      }

      .activate-account-view .activate-account-status-eyebrow{
        font-size:11px;
        line-height:1.1;
        font-weight:760;
        letter-spacing:.085em;
        text-transform:uppercase;
        color:#7b8494;
      }

      .activate-account-view .activate-account-status-title{
        margin:0;
        font-size:17px;
        line-height:1.22;
        font-weight:760;
        letter-spacing:-.025em;
        color:var(--text-strong, #111827);
      }

      .activate-account-view .activate-account-status-text{
        margin:0;
        font-size:13px;
        line-height:1.55;
        color:var(--text-dim, #6b7280);
      }

      .activate-account-view .activate-account-badge{
        width:max-content;
        min-height:28px;
        padding:0 11px;
        border-radius:999px;
        border:1px solid rgba(124,92,255,.18);
        background:rgba(124,92,255,.08);
        color:#6d53d7;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-size:11px;
        font-weight:760;
        letter-spacing:.055em;
        text-transform:uppercase;
      }

      .activate-account-view[data-status="success"] .activate-account-badge{
        border-color:rgba(54,198,144,.22);
        background:rgba(54,198,144,.10);
        color:#258a59;
      }

      .activate-account-view[data-status="error"] .activate-account-badge,
      .activate-account-view[data-status="expired"] .activate-account-badge,
      .activate-account-view[data-status="invalid"] .activate-account-badge{
        border-color:rgba(255,107,107,.22);
        background:rgba(255,107,107,.10);
        color:#c24141;
      }

      .activate-account-view .activate-account-token-note{
        margin-top:12px;
        padding:12px 13px;
        border-radius:16px;
        border:1px solid rgba(15,23,42,.06);
        background:rgba(248,250,252,.68);
        color:#7b8494;
        font-size:12px;
        line-height:1.55;
      }

      .activate-account-view .activate-account-status-spinner{
        width:20px;
        height:20px;
        border-radius:999px;
        border:2px solid rgba(124,92,255,.18);
        border-top-color:currentColor;
        animation:activateAccountSpin .78s linear infinite;
      }

      .activate-account-view .login-button[disabled]{
        cursor:wait;
        opacity:.78;
        pointer-events:none;
      }

      [data-theme="dark"] .activate-account-view .activate-account-status-card{
        border-color:rgba(255,255,255,.08);
        background:
          radial-gradient(circle at top left, rgba(124,92,255,.13), transparent 38%),
          rgba(255,255,255,.045);
      }

      [data-theme="dark"] .activate-account-view .activate-account-status-title{
        color:var(--text-strong, #f8fafc);
      }

      [data-theme="dark"] .activate-account-view .activate-account-status-text{
        color:var(--text-dim, #94a3b8);
      }

      [data-theme="dark"] .activate-account-view .activate-account-token-note{
        border-color:rgba(255,255,255,.07);
        background:rgba(255,255,255,.045);
        color:var(--text-dim, #94a3b8);
      }

      @keyframes activateAccountSpin{
        to{ transform:rotate(360deg); }
      }
    </style>
  `;
}

/* =========================================================
   PARTIALS
========================================================= */

function renderToast() {
  return `
    <div
      class="login-toast-stack login-toast-stack--top-right"
      aria-live="polite"
      aria-atomic="true"
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
            title="Cerrar aviso"
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

function renderSignalItem(text = "") {
  return `
    <div class="login-signal-item">
      <span class="dot" aria-hidden="true"></span>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function renderLeftPanel({
  heroEyebrow = "ONION SUPPORT · ACTIVACIÓN SEGURA",
  heroTitle = "Habilitación protegida de tu cuenta",
  bullets = [],
} = {}) {
  const finalSignals =
    safeArray(bullets).filter(Boolean).length
      ? safeArray(bullets).filter(Boolean)
      : [
          "Validación segura del enlace recibido por correo",
          "Activación controlada antes del primer acceso",
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

function renderStatusCard({
  status = ACTIVATE_ACCOUNT_STATUS.IDLE,
  copy = {},
} = {}) {
  return `
    <div class="activate-account-status-box">
      <div
        class="activate-account-status-card"
        id="activateAccountStatusCard"
      >
        <div
          class="activate-account-status-icon"
          id="activateAccountStatusIcon"
          aria-hidden="true"
        >
          ${getStatusIcon(status)}
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

function renderForm({
  appName = "Onion Support",
  status = ACTIVATE_ACCOUNT_STATUS.IDLE,
  token = "",
  title = "",
  subtitle = "",
  buttonLabel = "",
  loginHref = "/login",
  backLabel = "Volver al acceso",
  logoDarkSrc = "/src/media/img/favicon_white.png",
  logoLightSrc = "/src/media/img/favicon_black.png",
  footerText = "",
  autoSubmit = true,
} = {}) {
  const isLoading = status === ACTIVATE_ACCOUNT_STATUS.LOADING;
  const isSuccess = status === ACTIVATE_ACCOUNT_STATUS.SUCCESS;
  const isInvalid =
    status === ACTIVATE_ACCOUNT_STATUS.INVALID ||
    status === ACTIVATE_ACCOUNT_STATUS.EXPIRED;

  const finalButtonLabel = isSuccess || isInvalid
    ? backLabel
    : buttonLabel;

  const buttonAction = isSuccess || isInvalid
    ? "go-login"
    : "activate-account";

  return `
    <section
      class="login-stage login-stage--right"
      aria-label="Activación de cuenta"
    >
      <div class="login-card-shell login-card-shell--right">
        <div
          class="login-card login-card--offset login-card--clean"
          id="activateAccountCard"
        >
          <header class="login-header">
            <div class="logo-fade" aria-hidden="true">
              ${renderThemeLogo({
                darkSrc: logoDarkSrc,
                lightSrc: logoLightSrc,
                alt: appName,
              })}
            </div>

            <h2 id="activateAccountTitle">
              ${escapeHtml(title)}
            </h2>

            <p
              class="login-subtitle"
              id="activateAccountSubtitle"
            >
              ${escapeHtml(subtitle)}
            </p>
          </header>

          <form
            class="login-form"
            id="activateAccountForm"
            novalidate
            data-auto-submit="${autoSubmit ? "true" : "false"}"
          >
            <input
              type="hidden"
              id="activateAccountToken"
              name="token"
              value="${escapeHtml(token)}"
            />

            <input
              type="hidden"
              id="activateAccountStatus"
              name="status"
              value="${escapeHtml(status)}"
            />

            ${renderStatusCard({
              status,
              copy: {
                badge: buttonLabel ? "" : "",
                title,
              },
            }).replace(
              '<span\n            class="activate-account-badge"\n            id="activateAccountStatusBadge"\n          >\n            \n          </span>',
              ""
            )}

            <div
              class="login-error"
              id="activateAccountError"
              role="alert"
              aria-live="polite"
            ></div>

            <button
              class="login-button"
              id="activateAccountButton"
              type="submit"
              data-action="${escapeHtml(buttonAction)}"
              data-login-href="${escapeHtml(loginHref)}"
              ${isLoading ? 'disabled aria-busy="true"' : ""}
            >
              <span class="login-submit-text">
                ${escapeHtml(finalButtonLabel)}
              </span>
            </button>

            <div class="login-reset">
              <a
                class="login-reset-link"
                href="${escapeHtml(loginHref)}"
                id="activateAccountBackToLoginLink"
                data-spa
              >
                <span
                  class="login-reset-link-icon"
                  aria-hidden="true"
                  style="display:inline-flex;align-items:center;justify-content:center;margin-right:8px;vertical-align:middle;"
                >
                  ${getBackArrowIcon()}
                </span>
                <span>${escapeHtml(backLabel)}</span>
              </a>
            </div>

            <div
              class="activate-account-token-note"
              id="activateAccountTokenNote"
            >
              ${escapeHtml(footerText)}
            </div>
          </form>

          <footer class="login-footer">
            <span>${escapeHtml(footerText)}</span>
          </footer>
        </div>
      </div>
    </section>
  `;
}

function renderFormClean({
  appName = "Onion Support",
  status = ACTIVATE_ACCOUNT_STATUS.IDLE,
  token = "",
  copy = {},
  loginHref = "/login",
  backLabel = "Volver al acceso",
  logoDarkSrc = "/src/media/img/favicon_white.png",
  logoLightSrc = "/src/media/img/favicon_black.png",
  autoSubmit = true,
} = {}) {
  const isLoading = status === ACTIVATE_ACCOUNT_STATUS.LOADING;
  const isSuccess = status === ACTIVATE_ACCOUNT_STATUS.SUCCESS;
  const isInvalid =
    status === ACTIVATE_ACCOUNT_STATUS.INVALID ||
    status === ACTIVATE_ACCOUNT_STATUS.EXPIRED;

  const finalButtonLabel = isSuccess || isInvalid
    ? backLabel
    : copy.button;

  const buttonAction = isSuccess || isInvalid
    ? "go-login"
    : "activate-account";

  return `
    <section
      class="login-stage login-stage--right"
      aria-label="Activación de cuenta"
    >
      <div class="login-card-shell login-card-shell--right">
        <div
          class="login-card login-card--offset login-card--clean"
          id="activateAccountCard"
        >
          <header class="login-header">
            <div class="logo-fade" aria-hidden="true">
              ${renderThemeLogo({
                darkSrc: logoDarkSrc,
                lightSrc: logoLightSrc,
                alt: appName,
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
            class="login-form"
            id="activateAccountForm"
            novalidate
            data-auto-submit="${autoSubmit ? "true" : "false"}"
          >
            <input
              type="hidden"
              id="activateAccountToken"
              name="token"
              value="${escapeHtml(token)}"
            />

            <input
              type="hidden"
              id="activateAccountStatus"
              name="status"
              value="${escapeHtml(status)}"
            />

            ${renderStatusCard({
              status,
              copy,
            })}

            <div
              class="login-error"
              id="activateAccountError"
              role="alert"
              aria-live="polite"
            ></div>

            <button
              class="login-button"
              id="activateAccountButton"
              type="submit"
              data-action="${escapeHtml(buttonAction)}"
              data-login-href="${escapeHtml(loginHref)}"
              ${isLoading ? 'disabled aria-busy="true"' : ""}
            >
              <span class="login-submit-text">
                ${escapeHtml(finalButtonLabel)}
              </span>
            </button>

            <div class="login-reset">
              <a
                class="login-reset-link"
                href="${escapeHtml(loginHref)}"
                id="activateAccountBackToLoginLink"
                data-spa
              >
                <span
                  class="login-reset-link-icon"
                  aria-hidden="true"
                  style="display:inline-flex;align-items:center;justify-content:center;margin-right:8px;vertical-align:middle;"
                >
                  ${getBackArrowIcon()}
                </span>
                <span>${escapeHtml(backLabel)}</span>
              </a>
            </div>
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

  const status = normalizeStatus(
    options?.status
  );

  const token = safeText(
    options?.token ||
      options?.activationToken ||
      options?.activateToken,
    ""
  );

  const computedStatus =
    !token && status === ACTIVATE_ACCOUNT_STATUS.IDLE
      ? ACTIVATE_ACCOUNT_STATUS.INVALID
      : status;

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
    "Volver al acceso"
  );

  return `
    ${renderScopedThemeLogoStyle()}
    ${renderActivateAccountScopedStyle()}

    <section
      class="login-view activate-account-view"
      data-view="activate-account"
      data-activate-account-view="true"
      data-status="${escapeHtml(computedStatus)}"
    >
      ${renderToast()}

      <div class="login-scene">
        <div class="login-grid" id="activateAccountGrid">
          ${renderLeftPanel({
            ...options,
            appName,
          })}

          ${renderFormClean({
            appName,
            status: computedStatus,
            token,
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
            autoSubmit: options?.autoSubmit !== false,
          })}
        </div>
      </div>
    </section>
  `;
}

export {
  ACTIVATE_ACCOUNT_STATUS,
  getActivateAccountTemplate as ActivateAccountTemplate,
};

export default getActivateAccountTemplate;
