/* =========================================================
   Onion Support - Public Not Found Template
   Archivo: /src/views/public/not-found/template.js

   Responsabilidad:
   - Página 404 pública: la misma tarjeta de acceso, sin formulario.
   - Recuperación inmediata: inicio, catálogo de servicios, incidencia y acceso.
   - Sin Router, Auth, HTTP ni estado; el Router la monta como fallback.
========================================================= */

import { PUBLIC_SERVICES } from "../../../core/public-site.js";
import { escapeHtml } from "../../../core/escape-html.js";

import {
  PUBLIC_AUTH_LOGO,
  PUBLIC_AUTH_LOGO_WEBP,
  escapeAttr,
  renderPublicShell,
  safeAssetSrc,
  safeInternalHref,
} from "../index.js";

export const NOT_FOUND_TEMPLATE_VERSION = "not-found.template.public.v1";

const APP_NAME = "Onion Support";

function renderHomeLogo() {
  const homeHref = safeInternalHref("/", "/");
  const logo = safeAssetSrc(PUBLIC_AUTH_LOGO, PUBLIC_AUTH_LOGO);
  const logoWebp = safeAssetSrc(PUBLIC_AUTH_LOGO_WEBP, PUBLIC_AUTH_LOGO_WEBP);

  return `
    <a
      class="login-card-logo-wrap auth-link"
      href="${escapeAttr(homeHref)}"
      data-spa="true"
      data-router-link="true"
      data-route="${escapeAttr(homeHref)}"
      aria-label="Ir al inicio de Onion Support"
    >
      <span class="login-card-logo-shell" aria-hidden="true">
        <picture>
          <source type="image/webp" srcset="${escapeAttr(logoWebp)}">
          <img
            class="login-card-logo"
            src="${escapeAttr(logo)}"
            alt=""
            width="72"
            height="72"
            loading="eager"
            decoding="async"
            draggable="false"
          >
        </picture>
      </span>
    </a>
  `;
}

function renderServiceLinks() {
  return PUBLIC_SERVICES.map((service) => `
    <li>
      <a
        class="not-found-link"
        href="${escapeAttr(service.path)}"
        data-document-navigation="true"
      >${escapeHtml(service.label)}</a>
    </li>
  `).join("");
}

export function getNotFoundTemplate() {
  const homeHref = safeInternalHref("/", "/");
  const intakeHref = safeInternalHref("/#incidencia", "/");
  const loginHref = safeInternalHref("/login", "/login");

  return renderPublicShell({
    view: "not-found",
    appName: APP_NAME,
    header: false,
    footer: true,
    ariaLabelledBy: "not-found-title",
    body: `
      <section
        class="login-pro password-reset-pro not-found-pro"
        aria-labelledby="not-found-title"
        data-not-found-template-version="${escapeAttr(NOT_FOUND_TEMPLATE_VERSION)}"
      >
        <section
          class="login-card-panel password-reset-card-panel not-found-card-panel"
          aria-labelledby="not-found-title"
          data-public-not-found="true"
        >
          <div class="login-card-sheen" aria-hidden="true"></div>

          <header class="login-card-header password-reset-card-header">
            ${renderHomeLogo()}

            <p class="not-found-code" aria-hidden="true">404</p>

            <h1 class="login-card-title password-reset-title" id="not-found-title">
              Página no encontrada
            </h1>

            <p class="login-card-subtitle password-reset-subtitle">
              La dirección no existe o ha cambiado. Estas son las páginas que sí puedes visitar.
            </p>
          </header>

          <nav class="not-found-actions" aria-label="Volver a Onion Support">
            <a
              class="auth-button auth-submit not-found-primary"
              href="${escapeAttr(intakeHref)}"
              data-spa="true"
              data-router-link="true"
              data-route="${escapeAttr(intakeHref)}"
            >Abrir incidencia</a>

            <a
              class="auth-link login-link not-found-home"
              href="${escapeAttr(homeHref)}"
              data-spa="true"
              data-router-link="true"
              data-route="${escapeAttr(homeHref)}"
            >Ir al inicio</a>
          </nav>

          <nav class="not-found-services" aria-labelledby="not-found-services-title">
            <p class="not-found-services-title" id="not-found-services-title">Servicios informáticos</p>
            <ul>${renderServiceLinks()}</ul>
          </nav>

          <nav class="auth-links login-links not-found-links" aria-label="Área de clientes">
            <a
              class="auth-link login-link"
              href="${escapeAttr(loginHref)}"
              data-spa="true"
              data-router-link="true"
              data-route="${escapeAttr(loginHref)}"
            >Iniciar sesión</a>
          </nav>
        </section>
      </section>
    `,
  });
}

export function createNotFoundTemplate() {
  if (typeof document === "undefined") {
    throw new Error("[NotFoundTemplate] document no disponible.");
  }

  const template = document.createElement("template");
  template.innerHTML = getNotFoundTemplate().trim();

  const root = template.content.firstElementChild;

  if (!root) {
    throw new Error("[NotFoundTemplate] no se pudo construir el DOM.");
  }

  return root;
}

export default createNotFoundTemplate;
