/* =========================================================
   Onion Support - Login Template
   Archivo: /src/views/login/template.js

   Responsabilidad:
   - Construir sólo el DOM del login.
   - Logo, usuario, contraseña, botón Entrar y recuperación.
   - Exponer data-* consumidos por index.js.
   - Sin Auth, Router, HTTP, Store, Toast, validación ni eventos.
========================================================= */

import { ROUTES } from "../../core/config.js";

export const LOGIN_TEMPLATE_VERSION = "login.template.minimal.v1";

const APP_NAME = "Onion Support";

const LOGO_SRC = new URL(
  "../../media/img/favicon_black_circle.png",
  import.meta.url
).href;

const PASSWORD_REQUEST_HREF = ROUTES.passwordRequest || "/password-request";

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function safeInternalHref(value = "", fallback = "/") {
  const raw = text(value, fallback);

  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (/[\r\n\t\\]/.test(raw)) return fallback;
  if (/[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(raw)) {
    return fallback;
  }

  return raw;
}

function create(tag = "div", options = {}) {
  const node = document.createElement(tag);

  if (options.className) {
    node.className = options.className;
  }

  if (options.textContent) {
    node.textContent = options.textContent;
  }

  for (const [key, value] of Object.entries(options.attrs || {})) {
    if (value === false || value === null || value === undefined) continue;
    node.setAttribute(key, value === true ? "" : String(value));
  }

  for (const [key, value] of Object.entries(options.dataset || {})) {
    if (value === false || value === null || value === undefined) continue;
    node.dataset[key] = String(value);
  }

  return node;
}

function createLogo() {
  const wrap = create("div", {
    className: "login-logo-wrap",
  });

  const img = create("img", {
    className: "login-logo",
    attrs: {
      src: LOGO_SRC,
      alt: "",
      width: "56",
      height: "56",
      loading: "eager",
      decoding: "async",
      draggable: "false",
      "aria-hidden": "true",
    },
    dataset: {
      loginLogo: "true",
      authLogo: "public",
    },
  });

  wrap.appendChild(img);
  return wrap;
}

function createField({
  id,
  name,
  label,
  type = "text",
  autocomplete = "",
  placeholder = "",
  dataKey = "",
} = {}) {
  const field = create("div", {
    className: "auth-field login-field login-field-card",
    dataset: {
      loginField: name,
    },
  });

  const labelNode = create("label", {
    className: "auth-label login-label",
    textContent: label,
    attrs: {
      for: id,
    },
  });

  const input = create("input", {
    className: "auth-input login-input",
    attrs: {
      id,
      name,
      type,
      autocomplete,
      placeholder,
      required: true,
      spellcheck: "false",
      autocapitalize: "none",
      "aria-invalid": "false",
      "aria-describedby": `${id}-error`,
    },
    dataset: {
      loginInput: name,
      [dataKey]: "true",
    },
  });

  const error = create("p", {
    className: "auth-field-error login-field-error",
    attrs: {
      id: `${id}-error`,
      hidden: true,
      "aria-live": "polite",
    },
    dataset: {
      loginError: name,
    },
  });

  field.append(labelNode, input, error);
  return field;
}

export function createLoginTemplate() {
  const forgotHref = safeInternalHref(PASSWORD_REQUEST_HREF, "/password-request");

  const view = create("section", {
    className: "auth-view login-view",
    attrs: {
      "aria-labelledby": "login-title",
    },
    dataset: {
      view: "login",
      loginView: "true",
      templateVersion: LOGIN_TEMPLATE_VERSION,
    },
  });

  const shell = create("div", {
    className: "auth-shell login-shell",
  });

  const card = create("article", {
    className: "auth-card login-card",
  });

  const header = create("header", {
    className: "auth-header login-header",
  });

  const title = create("h1", {
    className: "auth-title login-title",
    textContent: "Acceso",
    attrs: {
      id: "login-title",
    },
  });

  const subtitle = create("p", {
    className: "auth-subtitle login-subtitle",
    textContent: `Entra en tu panel de ${APP_NAME}.`,
  });

  header.append(createLogo(), title, subtitle);

  const globalError = create("p", {
    className: "auth-error login-global-error",
    attrs: {
      hidden: true,
      role: "alert",
      "aria-live": "polite",
    },
    dataset: {
      loginGlobalError: "true",
    },
  });

  const form = create("form", {
    className: "auth-form login-form",
    attrs: {
      id: "login-form",
      autocomplete: "on",
      novalidate: true,
      "aria-describedby": "login-global-error",
    },
    dataset: {
      loginForm: "true",
    },
  });

  form.append(
    createField({
      id: "login-identifier",
      name: "identifier",
      label: "Usuario o email",
      type: "text",
      autocomplete: "username",
      placeholder: "Usuario o email",
      dataKey: "loginIdentifier",
    }),
    createField({
      id: "login-password",
      name: "password",
      label: "Contraseña",
      type: "password",
      autocomplete: "current-password",
      placeholder: "Contraseña",
      dataKey: "loginPassword",
    })
  );

  const submit = create("button", {
    className: "auth-button auth-submit login-submit",
    textContent: "Entrar",
    attrs: {
      type: "submit",
    },
    dataset: {
      loginSubmit: "true",
      defaultText: "Entrar",
      loadingText: "Accediendo...",
    },
  });

  const links = create("p", {
    className: "auth-links login-links",
  });

  const forgot = create("a", {
    className: "auth-link login-link",
    textContent: "¿Has olvidado tu contraseña?",
    attrs: {
      href: forgotHref,
    },
    dataset: {
      spa: "true",
      route: forgotHref,
      loginForgotPassword: "true",
    },
  });

  links.appendChild(forgot);
  form.append(submit, links);

  card.append(header, globalError, form);
  shell.appendChild(card);
  view.appendChild(shell);

  return view;
}

export default createLoginTemplate;
