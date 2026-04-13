/* =========================================================
   Onion SPA - Login Template
   Archivo: src/views/login/login.template.js

   Responsabilidades:
   - generar el html del login
   - centralizar el markup de la vista
   - consumir helpers de escape
   - mantener ids y data-hooks estables
   - soportar dark / light mediante tokens globales
========================================================= */

import { escapeHtml } from "./login.helpers.js";

/* =========================================================
   ICONS
========================================================= */

function getLogoIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5 4.5 7.75 12 12l7.5-4.25L12 3.5Z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <path
        d="M4.5 12.25 12 16.5l7.5-4.25"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M4.5 16.25 12 20.5l7.5-4.25"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

function getEmailIcon() {
  return `
    <svg class="login-view__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7.5h16v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
        stroke="currentColor"
        stroke-width="1.7"
      />
      <path
        d="m5 8 7 5 7-5"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

function getPasswordIcon() {
  return `
    <svg class="login-view__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 11V8.75a4.5 4.5 0 1 1 9 0V11"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
      <rect
        x="4.5"
        y="11"
        width="15"
        height="9"
        rx="2.5"
        stroke="currentColor"
        stroke-width="1.7"
      />
    </svg>
  `;
}

/* =========================================================
   PARTIALS
========================================================= */

function renderBullet({
  icon = "•",
  title = "",
  text = "",
} = {}) {
  return `
    <div class="login-view__bullet">
      <div class="login-view__bullet-icon" aria-hidden="true">
        ${escapeHtml(icon)}
      </div>

      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(text)}</span>
      </div>
    </div>
  `;
}

function renderKpi({
  label = "",
  value = "",
  note = "",
} = {}) {
  return `
    <div class="login-view__kpi">
      <span class="login-view__kpi-label">${escapeHtml(label)}</span>
      <span class="login-view__kpi-value">${escapeHtml(value)}</span>
      <span class="login-view__kpi-note">${escapeHtml(note)}</span>
    </div>
  `;
}

function renderHero({
  appName = "Onion Support",
  heroEyebrow = "Acceso seguro · Panel operativo",
  heroTitle = "Onion Support",
  heroSubtitle = "Acceso centralizado para incidencias, facturación, clientes y operaciones internas.",
  bullets = [],
  kpis = [],
} = {}) {
  const finalBullets = Array.isArray(bullets) && bullets.length
    ? bullets
    : [
        {
          icon: "✓",
          title: "Autenticación limpia",
          text: "La vista sólo consume el servicio de toast. No monta ni gestiona el sistema global.",
        },
        {
          icon: "◎",
          title: "Design tokens reales",
          text: "Inputs, card, sombras y estados dependen de variables globales para que dark y light respiren igual.",
        },
        {
          icon: "⚡",
          title: "Preparado para SPA",
          text: "Hace sync de sesión con AppCore, emite eventos y redirige sin romper el router.",
        },
      ];

  const finalKpis = Array.isArray(kpis) && kpis.length
    ? kpis
    : [
        {
          label: "Estado",
          value: "Seguro",
          note: "Validación y feedback desacoplado",
        },
        {
          label: "Tema",
          value: "Tokenizado",
          note: "Sin colores hardcoded en light",
        },
        {
          label: "Navegación",
          value: "SPA Ready",
          note: "Integración limpia con router",
        },
      ];

  return `
    <aside class="login-view__hero" aria-hidden="false">
      <div class="login-view__hero-inner">
        <div class="login-view__eyebrow">
          ${escapeHtml(heroEyebrow)}
        </div>

        <div class="login-view__brand">
          <div class="login-view__logo" aria-hidden="true">
            ${getLogoIcon()}
          </div>

          <div class="login-view__brand-copy">
            <h1 class="login-view__brand-title">
              ${escapeHtml(heroTitle || appName)}
            </h1>

            <p class="login-view__brand-subtitle">
              ${escapeHtml(heroSubtitle)}
            </p>
          </div>
        </div>

        <div class="login-view__bullets">
          ${finalBullets.map(renderBullet).join("")}
        </div>
      </div>

      <div class="login-view__hero-kpis">
        ${finalKpis.map(renderKpi).join("")}
      </div>
    </aside>
  `;
}

function renderForm({
  email = "",
  forgotPasswordHref = "/recuperar-acceso",
  title = "Iniciar sesión",
  subtitle = "Introduce tus credenciales para acceder al panel.",
  submitLabel = "Entrar al panel",
  themeToggleLabel = "Alternar tema",
  rememberLabel = "Recordar email",
  forgotLabel = "¿Has olvidado tu contraseña?",
  footerText = "Acceso protegido. Usa tus credenciales corporativas autorizadas.",
} = {}) {
  const hasEmail = Boolean(String(email || "").trim());

  return `
    <div class="login-view__card">
      <div class="login-view__card-inner">
        <div class="login-view__card-top">
          <h2 class="login-view__title">${escapeHtml(title)}</h2>
          <p class="login-view__subtitle">${escapeHtml(subtitle)}</p>
        </div>

        <form class="login-view__form" id="loginForm" novalidate>
          <div class="login-view__field" data-field="email">
            <label class="login-view__label" for="loginEmail">Email</label>

            <div class="login-view__control">
              ${getEmailIcon()}

              <input
                class="login-view__input"
                id="loginEmail"
                name="email"
                type="email"
                inputmode="email"
                autocomplete="username"
                placeholder="nombre@empresa.com"
                value="${escapeHtml(email)}"
                required
              />
            </div>
          </div>

          <div class="login-view__field" data-field="password">
            <label class="login-view__label" for="loginPassword">Contraseña</label>

            <div class="login-view__control">
              ${getPasswordIcon()}

              <input
                class="login-view__input"
                id="loginPassword"
                name="password"
                type="password"
                autocomplete="current-password"
                placeholder="••••••••••"
                required
              />

              <button
                class="login-view__toggle-pass"
                type="button"
                id="togglePassword"
                aria-label="Mostrar contraseña"
                aria-pressed="false"
              >
                Ver
              </button>
            </div>
          </div>

          <div class="login-view__meta">
            <label class="login-view__checkbox">
              <input
                id="loginRemember"
                name="remember"
                type="checkbox"
                ${hasEmail ? "checked" : ""}
              />
              <span>${escapeHtml(rememberLabel)}</span>
            </label>

            <a
              class="login-view__link"
              href="${escapeHtml(forgotPasswordHref)}"
              data-spa
            >
              ${escapeHtml(forgotLabel)}
            </a>
          </div>

          <div
            class="login-view__error"
            id="loginError"
            role="alert"
            aria-live="polite"
          ></div>

          <div class="login-view__actions">
            <button
              class="login-view__submit"
              id="loginSubmit"
              type="submit"
            >
              ${escapeHtml(submitLabel)}
            </button>

            <button
              class="login-view__secondary"
              id="loginThemeToggle"
              type="button"
            >
              ${escapeHtml(themeToggleLabel)}
            </button>
          </div>
        </form>

        <div class="login-view__footer">
          ${escapeHtml(footerText)}
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function getLoginTemplate(options = {}) {
  const {
    appName = "Onion Support",
    email = "",
  } = options;

  return `
    <section class="login-view" data-view="login">
      <div class="login-view__shell">
        ${renderHero({
          ...options,
          appName,
        })}

        ${renderForm({
          ...options,
          email,
        })}
      </div>
    </section>
  `;
}

export default getLoginTemplate;
