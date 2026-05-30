/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/public/login/template.js

   Responsabilidad:
   - Construir sólo el DOM/HTML del login público.
   - Usar el layout común de /src/views/public/index.js.
   - Pintar usuario/email, contraseña, botón Entrar y recuperación.
   - Exponer data-* consumidos por index.js.
   - Sin Auth, Router, HTTP, Store, Toast, validación ni eventos.
========================================================= */

import { ROUTES } from "../../../core/config.js";

import {
  escapeAttr,
  escapeHtml,
  renderPublicShell,
  safeInternalHref,
} from "../index.js";

export const LOGIN_TEMPLATE_VERSION = "login.template.public.v2";

const PASSWORD_REQUEST_HREF = ROUTES.passwordRequest || "/password-request";

/* =========================================================
   BASICS
========================================================= */

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function dataFlag(name = "") {
  const clean = text(name, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return clean ? `data-${escapeAttr(clean)}="true"` : "";
}

/* =========================================================
   ICONS
========================================================= */

function renderIcon(name = "") {
  const icons = {
    user: `
      <svg class="login-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 12.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z"></path>
        <path d="M4.75 20.25a7.25 7.25 0 0 1 14.5 0"></path>
      </svg>
    `,

    lock: `
      <svg class="login-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7.75 10.25V8a4.25 4.25 0 0 1 8.5 0v2.25"></path>
        <path d="M6.75 10.25h10.5a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5v-7a1.5 1.5 0 0 1 1.5-1.5Z"></path>
        <path d="M12 15.25v1.5"></path>
      </svg>
    `,

    shield: `
      <svg class="login-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.75 19.25 6v5.25c0 4.35-2.88 7.55-7.25 9-4.37-1.45-7.25-4.65-7.25-9V6L12 3.75Z"></path>
        <path d="m9.25 12.25 1.85 1.85 3.9-4.2"></path>
      </svg>
    `,

    spark: `
      <svg class="login-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.75 13.65 9 19 10.65 13.65 12.3 12 17.75 10.35 12.3 5 10.65 10.35 9 12 3.75Z"></path>
        <path d="M18.25 15.75 19 18l2.25.75L19 19.5l-.75 2.25-.75-2.25-2.25-.75L17.5 18l.75-2.25Z"></path>
      </svg>
    `,
  };

  return icons[name] || "";
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderTrustItem({ icon = "shield", title = "", text: body = "" } = {}) {
  return `
    <li class="login-trust-item">
      <span class="login-trust-icon" aria-hidden="true">
        ${renderIcon(icon)}
      </span>

      <span class="login-trust-copy">
        <strong>${escapeHtml(text(title, ""))}</strong>
        <span>${escapeHtml(text(body, ""))}</span>
      </span>
    </li>
  `;
}

function renderField({
  id,
  name,
  label,
  type = "text",
  autocomplete = "",
  placeholder = "",
  hint = "",
  icon = "",
  dataKey = "",
  enterKeyHint = "",
} = {}) {
  const cleanId = text(id, "");
  const cleanName = text(name, "");
  const cleanLabel = text(label, cleanName);
  const cleanType = text(type, "text");
  const cleanAutocomplete = text(autocomplete, "");
  const cleanPlaceholder = text(placeholder, cleanLabel);
  const cleanHint = text(hint, "");
  const cleanEnterKeyHint = text(enterKeyHint, "");

  const describedBy = [
    cleanHint ? `${cleanId}-hint` : "",
    `${cleanId}-error`,
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div
      class="auth-field login-field login-field-card"
      data-login-field="${escapeAttr(cleanName)}"
    >
      <div class="login-field-head">
        <label
          class="auth-label login-label"
          for="${escapeAttr(cleanId)}"
        >
          ${escapeHtml(cleanLabel)}
        </label>
      </div>

      <div class="login-input-shell">
        <span class="login-input-icon" aria-hidden="true">
          ${renderIcon(icon)}
        </span>

        <input
          class="auth-input login-input"
          id="${escapeAttr(cleanId)}"
          name="${escapeAttr(cleanName)}"
          type="${escapeAttr(cleanType)}"
          autocomplete="${escapeAttr(cleanAutocomplete)}"
          placeholder="${escapeAttr(cleanPlaceholder)}"
          required
          spellcheck="false"
          autocapitalize="none"
          aria-invalid="false"
          aria-describedby="${escapeAttr(describedBy)}"
          ${cleanEnterKeyHint ? `enterkeyhint="${escapeAttr(cleanEnterKeyHint)}"` : ""}
          data-login-input="${escapeAttr(cleanName)}"
          ${dataFlag(dataKey)}
        >
      </div>

      ${
        cleanHint
          ? `
            <p
              class="auth-field-hint login-field-hint"
              id="${escapeAttr(cleanId)}-hint"
            >
              ${escapeHtml(cleanHint)}
            </p>
          `
          : ""
      }

      <p
        class="auth-field-error login-field-error"
        id="${escapeAttr(cleanId)}-error"
        data-login-error="${escapeAttr(cleanName)}"
        aria-live="polite"
        hidden
      ></p>
    </div>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function getLoginTemplate() {
  const forgotHref = safeInternalHref(
    PASSWORD_REQUEST_HREF,
    "/password-request"
  );

  return renderPublicShell({
    view: "login",
    title: "Acceso privado",
    subtitle: "Onion Support · Panel seguro",

    body: `
      <section
        class="login-pro"
        aria-label="Acceso a Onion Support"
        data-login-template-version="${escapeAttr(LOGIN_TEMPLATE_VERSION)}"
      >
        <div class="login-orb login-orb-primary" aria-hidden="true"></div>
        <div class="login-orb login-orb-secondary" aria-hidden="true"></div>
        <div class="login-grid-glow" aria-hidden="true"></div>

        <div class="login-pro-grid">
          <aside class="login-hero" aria-label="Resumen de Onion Support">
            <div class="login-brand-stack">
              <div class="login-brand-mark" aria-hidden="true">
                <span>OS</span>
              </div>

              <div class="login-brand-copy">
                <p class="login-eyebrow">Onion Support SPA</p>
                <h2 class="login-hero-title">
                  Gestión privada, rápida y precisa.
                </h2>
              </div>
            </div>

            <p class="login-hero-text">
              Accede al panel para gestionar incidencias, clientes, facturas y operaciones internas desde una experiencia limpia y segura.
            </p>

            <div class="login-status-card" aria-label="Estado del acceso">
              <span class="login-status-pulse" aria-hidden="true"></span>

              <div class="login-status-copy">
                <strong>Área restringida</strong>
                <span>Entrada exclusiva para usuarios autorizados.</span>
              </div>
            </div>

            <ul class="login-trust-list" aria-label="Características del panel">
              ${renderTrustItem({
                icon: "shield",
                title: "Acceso protegido",
                text: "Validación de sesión y rutas privadas desde la SPA.",
              })}

              ${renderTrustItem({
                icon: "spark",
                title: "Panel optimizado",
                text: "Interfaz modular, ligera y preparada para operación diaria.",
              })}

              ${renderTrustItem({
                icon: "lock",
                title: "Datos sensibles fuera del cliente",
                text: "Sin exposición de tokens, secretos ni lógica crítica en la vista.",
              })}
            </ul>
          </aside>

          <section
            class="login-card-panel"
            aria-labelledby="login-panel-title"
          >
            <div class="login-card-sheen" aria-hidden="true"></div>

            <header class="login-card-header">
              <p class="login-card-kicker">Bienvenido de nuevo</p>

              <h2
                class="login-card-title"
                id="login-panel-title"
              >
                Entra en tu panel
              </h2>

              <p class="login-card-subtitle">
                Introduce tus credenciales para continuar.
              </p>
            </header>

            <p
              class="auth-error login-global-error"
              data-login-global-error="true"
              role="alert"
              aria-live="polite"
              hidden
            ></p>

            <form
              class="auth-form login-form"
              id="login-form"
              autocomplete="on"
              novalidate
              data-login-form="true"
            >
              ${renderField({
                id: "login-identifier",
                name: "identifier",
                label: "Usuario o email",
                type: "text",
                autocomplete: "username",
                placeholder: "tu.usuario@empresa.com",
                hint: "Usa el identificador asociado a tu cuenta.",
                icon: "user",
                dataKey: "login-identifier",
                enterKeyHint: "next",
              })}

              ${renderField({
                id: "login-password",
                name: "password",
                label: "Contraseña",
                type: "password",
                autocomplete: "current-password",
                placeholder: "Introduce tu contraseña",
                hint: "La contraseña se valida de forma segura en el backend.",
                icon: "lock",
                dataKey: "login-password",
                enterKeyHint: "go",
              })}

              <div class="login-form-row">
                <span class="login-form-note">
                  Acceso seguro
                </span>

                <a
                  class="auth-link login-link login-forgot-link"
                  href="${escapeAttr(forgotHref)}"
                  data-spa="true"
                  data-route="${escapeAttr(forgotHref)}"
                  data-login-forgot-password="true"
                >
                  ¿Has olvidado tu contraseña?
                </a>
              </div>

              <button
                class="auth-button auth-submit login-submit"
                type="submit"
                data-login-submit="true"
                data-default-text="Entrar al panel"
                data-loading-text="Accediendo..."
              >
                Entrar al panel
              </button>

              <p class="login-security-note">
                Onion Support nunca solicitará tu contraseña fuera de esta pantalla.
              </p>
            </form>
          </section>
        </div>
      </section>
    `,
  });
}

export function createLoginTemplate() {
  const template = document.createElement("template");

  template.innerHTML = getLoginTemplate().trim();

  return template.content.firstElementChild;
}

export default createLoginTemplate;
