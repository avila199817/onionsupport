/* =========================================================
   Onion Support - Public Support Intake
   Archivo: /src/features/public-support/index.js

   Responsabilidad:
   - Mejorar la home pública sin acoplarla al controlador visual.
   - Mostrar un formulario de incidencia grande y siempre visible.
   - Enviar un único payload al endpoint público de alta + ticket.
   - No crear usuarios/tickets desde el navegador por separado.
   - Mostrar identidad (avatar + nombre completo) cuando hay sesión.
   - Mantener WhatsApp como canal alternativo, no como flujo principal.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

export const PUBLIC_SUPPORT_VERSION =
  "public-support.intake.v1";

export const PUBLIC_TICKET_ENDPOINT =
  "/api/tickets/public";

const SOURCE = "public-support.intake";
const HOME_SELECTOR = "[data-public-home]";
const FORM_SELECTOR = "[data-public-support-form]";
const SECTION_ID = "incidencia";

const enhancedRoots = new WeakSet();
let observer = null;
let retryTimer = 0;
let destroyed = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }

  return null;
}

function getCoreState() {
  try {
    if (typeof AppCore?.getState === "function") {
      const state = AppCore.getState();
      if (isObject(state)) return state;
    }
  } catch {
    // fallback below
  }

  return isObject(AppCore?.state) ? AppCore.state : {};
}

function getCurrentUser() {
  const state = getCoreState();

  return {
    state,
    user: isObject(state.currentUser)
      ? state.currentUser
      : isObject(state.user)
        ? state.user
        : null,
    authenticated:
      state.authenticated === true ||
      AppCore?.isAuthenticated?.() === true,
  };
}

function userFullName(user = null) {
  if (!isObject(user)) return "";

  const direct = cleanText(
    first(
      user.fullName,
      user.displayName,
      user.name,
      user.nombre,
      user.profile?.fullName,
      user.profile?.displayName,
      user.profile?.name,
      user.profile?.nombre,
      ""
    ),
    ""
  );

  if (direct) return direct;

  return cleanText(
    [
      first(user.firstName, user.nombrePila, user.profile?.firstName, ""),
      first(user.lastName, user.apellidos, user.profile?.lastName, ""),
    ]
      .filter(Boolean)
      .join(" "),
    ""
  );
}

function userEmail(user = null) {
  if (!isObject(user)) return "";

  return cleanText(
    first(
      user.email,
      user.emailLower,
      user.profile?.email,
      user.profile?.emailLower,
      ""
    ),
    ""
  ).toLowerCase();
}

function userPhone(user = null) {
  if (!isObject(user)) return "";

  return cleanText(
    first(
      user.phone,
      user.telefono,
      user.mobile,
      user.profile?.phone,
      user.profile?.telefono,
      ""
    ),
    ""
  );
}

function userAddress(user = null) {
  if (!isObject(user)) return "";

  const address = first(
    user.address,
    user.direccion,
    user.profile?.address,
    user.profile?.direccion,
    ""
  );

  if (typeof address === "string") {
    return cleanText(address, "");
  }

  if (!isObject(address)) return "";

  return cleanText(
    [
      first(address.street, address.address1, address.line1, address.calle, ""),
      first(address.number, address.numero, ""),
      first(address.postalCode, address.zip, address.cp, ""),
      first(address.city, address.locality, address.localidad, ""),
      first(address.region, address.province, address.provincia, ""),
    ]
      .filter(Boolean)
      .join(", "),
    ""
  );
}

function safeAvatarSrc(value = "") {
  const raw = cleanText(value, "");
  if (!raw || /[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";

  if (raw.startsWith("/")) {
    return raw.replace(/\/{2,}/g, "/");
  }

  try {
    const url = new URL(raw, window.location.origin);

    if (url.protocol !== "https:" && url.origin !== window.location.origin) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function userAvatar(user = null) {
  if (!isObject(user)) return "";

  return safeAvatarSrc(
    first(
      user.avatarUrl,
      user.avatar,
      user.picture,
      user.photoUrl,
      user.photoURL,
      user.profile?.avatarUrl,
      user.profile?.avatar,
      user.profile?.picture,
      user.profile?.photoUrl,
      user.profile?.photoURL,
      ""
    )
  );
}

function initials(value = "") {
  const words = cleanText(value, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);

  return words.map((word) => word[0]?.toUpperCase() || "").join("") || "OS";
}

function userHomeHref(state = {}, user = null) {
  const fromState = cleanText(
    first(state.homePath, state.defaultHome, ""),
    ""
  );

  if (fromState.startsWith("/") && !fromState.startsWith("//")) {
    return fromState;
  }

  const slug = cleanText(
    first(
      state.userSlug,
      user?.slug,
      user?.username,
      user?.usernameLower,
      ""
    ),
    ""
  )
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return slug ? `/@${encodeURIComponent(slug)}` : "/";
}

function createAccountIdentity(name = "", avatar = "") {
  const wrap = document.createElement("span");
  wrap.className = "public-support-account";

  const avatarNode = document.createElement("span");
  avatarNode.className = "public-support-account-avatar";
  avatarNode.setAttribute("aria-hidden", "true");

  if (avatar) {
    const image = document.createElement("img");
    image.src = avatar;
    image.alt = "";
    image.loading = "eager";
    image.decoding = "async";
    avatarNode.appendChild(image);
  } else {
    avatarNode.textContent = initials(name);
  }

  const copy = document.createElement("span");
  copy.className = "public-support-account-copy";

  const fullName = document.createElement("strong");
  fullName.className = "public-support-account-name";
  fullName.textContent = name || "Mi cuenta";

  const label = document.createElement("small");
  label.className = "public-support-account-label";
  label.textContent = "Ir al panel";

  copy.append(fullName, label);
  wrap.append(avatarNode, copy);

  return wrap;
}

function syncAuthenticatedIdentity(root = null) {
  if (!root) return false;

  const { state, user, authenticated } = getCurrentUser();
  if (!authenticated || !user) return false;

  const name = userFullName(user) || userEmail(user) || "Mi cuenta";
  const avatar = userAvatar(user);
  const href = userHomeHref(state, user);

  for (const link of root.querySelectorAll("[data-public-home-login]")) {
    link.href = href;
    link.dataset.route = href;
    link.dataset.href = href;
    link.dataset.publicSupportAccount = "true";
    link.classList.add("public-support-account-link");
    link.setAttribute("aria-label", `Abrir el panel de ${name}`);
    link.replaceChildren(createAccountIdentity(name, avatar));
  }

  root.dataset.publicSupportAuthenticated = "true";
  return true;
}

function createFormSection() {
  const section = document.createElement("section");
  section.id = SECTION_ID;
  section.className =
    "public-home-section public-support-section";
  section.dataset.publicSupportSection = "true";
  section.setAttribute(
    "aria-labelledby",
    "public-support-title"
  );

  section.innerHTML = `
    <div class="public-support-layout">
      <div class="public-support-intro">
        <p class="public-home-price-eyebrow">Soporte directo</p>
        <h2 id="public-support-title">Abre tu incidencia ahora.</h2>
        <p class="public-support-lead">
          Cuéntame el problema y dejo el caso registrado desde el primer minuto.
          Si todavía no tienes cuenta, estos mismos datos sirven para crearla.
        </p>

        <div class="public-support-flow" aria-label="Qué ocurrirá después">
          <div class="public-support-flow-item">
            <span>01</span>
            <div>
              <strong>Registramos el caso</strong>
              <p>La incidencia queda asociada a tu correo y preparada para seguimiento.</p>
            </div>
          </div>
          <div class="public-support-flow-item">
            <span>02</span>
            <div>
              <strong>Preparamos tu acceso</strong>
              <p>Si es tu primera vez, recibirás un email seguro para definir tu contraseña.</p>
            </div>
          </div>
          <div class="public-support-flow-item">
            <span>03</span>
            <div>
              <strong>Entras en tu panel</strong>
              <p>Desde ahí podrás seguir incidencias, facturas y tus datos de cliente.</p>
            </div>
          </div>
        </div>

        <p class="public-support-privacy">
          Los datos del formulario se usan para gestionar tu incidencia y tu cuenta de cliente.
        </p>
      </div>

      <form
        class="public-support-form"
        data-public-support-form="true"
        novalidate
        autocomplete="on"
      >
        <div class="public-support-form-head">
          <div>
            <span class="public-support-kicker">Nueva incidencia</span>
            <h3>¿Qué necesitas?</h3>
          </div>
          <span class="public-support-secure">Acceso por email</span>
        </div>

        <div class="public-support-grid">
          <div class="public-support-field">
            <label for="public-support-full-name">Nombre completo</label>
            <input
              id="public-support-full-name"
              name="fullName"
              type="text"
              autocomplete="name"
              maxlength="120"
              required
              placeholder="Nombre y apellidos"
              data-label="Nombre completo"
            >
            <small
              id="public-support-error-full-name"
              class="public-support-error"
              data-public-support-error-for="fullName"
              hidden
            ></small>
          </div>

          <div class="public-support-field">
            <label for="public-support-email">Correo electrónico</label>
            <input
              id="public-support-email"
              name="email"
              type="email"
              inputmode="email"
              autocomplete="email"
              maxlength="180"
              required
              placeholder="tu@correo.com"
              data-label="Correo electrónico"
            >
            <small
              id="public-support-error-email"
              class="public-support-error"
              data-public-support-error-for="email"
              hidden
            ></small>
          </div>

          <div class="public-support-field">
            <label for="public-support-phone">Teléfono</label>
            <input
              id="public-support-phone"
              name="phone"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              maxlength="32"
              required
              placeholder="+34 600 000 000"
              data-label="Teléfono"
            >
            <small
              id="public-support-error-phone"
              class="public-support-error"
              data-public-support-error-for="phone"
              hidden
            ></small>
          </div>

          <div class="public-support-field">
            <label for="public-support-address">Dirección</label>
            <input
              id="public-support-address"
              name="address"
              type="text"
              autocomplete="street-address"
              maxlength="220"
              required
              placeholder="Calle, número, localidad y CP"
              data-label="Dirección"
            >
            <small
              id="public-support-error-address"
              class="public-support-error"
              data-public-support-error-for="address"
              hidden
            ></small>
          </div>

          <div class="public-support-field public-support-field--wide">
            <label for="public-support-subject">Asunto</label>
            <input
              id="public-support-subject"
              name="subject"
              type="text"
              autocomplete="off"
              maxlength="140"
              required
              placeholder="Ej. El portátil no arranca"
              data-label="Asunto"
            >
            <small
              id="public-support-error-subject"
              class="public-support-error"
              data-public-support-error-for="subject"
              hidden
            ></small>
          </div>

          <div class="public-support-field public-support-field--wide">
            <label for="public-support-description">Cuéntame qué ocurre</label>
            <textarea
              id="public-support-description"
              name="description"
              rows="7"
              maxlength="4000"
              required
              placeholder="Qué ocurre, desde cuándo, mensajes de error y cualquier detalle que pueda ayudar."
              data-label="Descripción"
            ></textarea>
            <div class="public-support-field-meta">
              <small>Cuanto más contexto, mejor diagnóstico inicial.</small>
              <small data-public-support-counter="true">0 / 4000</small>
            </div>
            <small
              id="public-support-error-description"
              class="public-support-error"
              data-public-support-error-for="description"
              hidden
            ></small>
          </div>
        </div>

        <div
          class="public-support-honeypot"
          aria-hidden="true"
        >
          <label for="public-support-website">Web</label>
          <input
            id="public-support-website"
            name="website"
            type="text"
            tabindex="-1"
            autocomplete="off"
          >
        </div>

        <div class="public-support-submit-row">
          <div
            class="public-support-status"
            data-public-support-status="true"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            hidden
          ></div>

          <button
            class="public-support-submit"
            type="submit"
            data-public-support-submit="true"
          >
            <span data-public-support-submit-label="true">Crear incidencia</span>
            <span class="public-support-submit-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </div>
  `;

  return section;
}

function ensureFormSection(root = null) {
  if (!root) return null;

  const existing = root.querySelector(
    `[data-public-support-section], #${SECTION_ID}`
  );

  if (existing) return existing;

  const section = createFormSection();
  const hero = root.querySelector(".public-home-hero");
  const content = root.querySelector(".public-home-content");

  if (hero?.parentNode) {
    hero.insertAdjacentElement("afterend", section);
  } else if (content) {
    content.prepend(section);
  } else {
    root.appendChild(section);
  }

  return section;
}

function rewriteCtaLabel(anchor = null, label = "") {
  if (!anchor || !label) return false;

  const candidates = [...anchor.querySelectorAll("span")];
  const textNode = candidates.find(
    (node) => cleanText(node.textContent, "").length > 2
  );

  if (textNode) {
    textNode.textContent = label;
    return true;
  }

  return false;
}

function retargetDiagnosticCtas(root = null) {
  if (!root) return false;

  const selectors = [
    ".public-home-nav-cta",
    ".public-home-hero-actions .public-home-button--primary",
    ".public-home-price-link",
    ".public-home-contact-actions .public-home-button--primary",
  ];

  for (const anchor of root.querySelectorAll(selectors.join(","))) {
    if (anchor.matches(".public-home-floating-whatsapp")) continue;

    anchor.href = `#${SECTION_ID}`;
    anchor.removeAttribute("target");
    anchor.removeAttribute("rel");
    anchor.dataset.publicHomeScrollLink = "true";
    anchor.dataset.publicSupportIntakeLink = "true";

    if (anchor.matches(".public-home-nav-cta")) {
      rewriteCtaLabel(anchor, "Abrir incidencia");
    } else if (
      anchor.matches(
        ".public-home-hero-actions .public-home-button--primary"
      )
    ) {
      rewriteCtaLabel(anchor, "Abrir incidencia");
    } else if (
      anchor.matches(
        ".public-home-contact-actions .public-home-button--primary"
      )
    ) {
      rewriteCtaLabel(anchor, "Crear incidencia");
    }
  }

  return true;
}

function syncFaq(root = null) {
  if (!root) return false;

  for (const item of root.querySelectorAll(".public-home-faq-item")) {
    const summary = item.querySelector("summary");
    const answer = item.querySelector("p");

    if (
      cleanText(summary?.textContent, "").toLowerCase() ===
      "¿cómo solicito un diagnóstico?"
    ) {
      if (answer) {
        answer.textContent =
          "Completa el formulario de la web. Crearemos la incidencia y, si es tu primera vez, recibirás un email para activar tu acceso y definir la contraseña.";
      }

      return true;
    }
  }

  return false;
}

function prefillFromSession(root = null) {
  if (!root) return false;

  const form = root.querySelector(FORM_SELECTOR);
  if (!form) return false;

  const { user, authenticated } = getCurrentUser();
  if (!authenticated || !user) return false;

  const values = {
    fullName: userFullName(user),
    email: userEmail(user),
    phone: userPhone(user),
    address: userAddress(user),
  };

  for (const [name, value] of Object.entries(values)) {
    const input = form.elements.namedItem(name);
    if (!input || cleanText(input.value, "") || !value) continue;
    input.value = value;
  }

  return true;
}

function enhanceRoot(root = null) {
  if (!root || destroyed) return false;

  const fresh = !enhancedRoots.has(root);

  if (fresh) {
    ensureFormSection(root);
    retargetDiagnosticCtas(root);
    syncFaq(root);
    enhancedRoots.add(root);
    root.dataset.publicSupportReady = "true";
  }

  syncAuthenticatedIdentity(root);
  prefillFromSession(root);
  return true;
}

function scan() {
  if (!isBrowser() || destroyed) return false;

  let found = false;

  for (const root of document.querySelectorAll(HOME_SELECTOR)) {
    found = enhanceRoot(root) || found;
  }

  return found;
}

function fieldErrorNode(form = null, name = "") {
  if (!form || !name) return null;

  return form.querySelector(
    `[data-public-support-error-for="${CSS.escape(name)}"]`
  );
}

function setFieldError(form = null, input = null, message = "") {
  if (!form || !input) return false;

  const error = fieldErrorNode(form, input.name);
  const hasError = Boolean(message);

  input.classList.toggle("is-invalid", hasError);
  input.setAttribute("aria-invalid", hasError ? "true" : "false");

  if (error) {
    error.textContent = message;
    error.hidden = !hasError;

    if (hasError && error.id) {
      input.setAttribute("aria-describedby", error.id);
    } else if (
      input.getAttribute("aria-describedby") === error.id
    ) {
      input.removeAttribute("aria-describedby");
    }
  }

  return hasError;
}

function setStatus(form = null, message = "", type = "info") {
  const status = form?.querySelector(
    "[data-public-support-status]"
  );

  if (!status) return false;

  const clean = cleanText(message, "");
  status.textContent = clean;
  status.hidden = !clean;
  status.dataset.status = clean ? type : "";
  return true;
}

function normalizePhone(value = "") {
  return cleanText(value, "")
    .replace(/[^\d+()\s.-]/g, "")
    .slice(0, 32);
}

function phoneDigitCount(value = "") {
  return String(value ?? "").replace(/\D/g, "").length;
}

function readPayload(form = null) {
  const data = new FormData(form);

  return {
    fullName: cleanText(data.get("fullName"), ""),
    email: cleanText(data.get("email"), "").toLowerCase(),
    phone: normalizePhone(data.get("phone")),
    address: cleanText(data.get("address"), ""),
    subject: cleanText(data.get("subject"), ""),
    description: cleanText(data.get("description"), ""),
    source: "public-home",
    channel: "web",
  };
}

function validateForm(form = null) {
  if (!form) return [];

  const errors = [];
  const rules = {
    fullName: (value) =>
      value.length >= 3
        ? ""
        : "Introduce tu nombre completo.",
    email: (value) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? ""
        : "Introduce un correo válido.",
    phone: (value) =>
      phoneDigitCount(value) >= 7
        ? ""
        : "Introduce un teléfono válido.",
    address: (value) =>
      value.length >= 6
        ? ""
        : "Introduce una dirección completa.",
    subject: (value) =>
      value.length >= 4
        ? ""
        : "Resume el problema en el asunto.",
    description: (value) =>
      value.length >= 10
        ? ""
        : "Añade un poco más de detalle sobre el problema.",
  };

  for (const [name, rule] of Object.entries(rules)) {
    const input = form.elements.namedItem(name);
    if (!input) continue;

    const value = cleanText(input.value, "");
    const message = rule(value);

    setFieldError(form, input, message);

    if (message) {
      errors.push({ input, message });
    }
  }

  return errors;
}

function setSubmitting(form = null, submitting = false) {
  if (!form) return false;

  const value = Boolean(submitting);
  form.classList.toggle("is-submitting", value);
  form.dataset.submitting = value ? "true" : "false";

  for (const node of form.querySelectorAll(
    "button, input, textarea, select"
  )) {
    if (node.name === "website") continue;
    node.disabled = value;
  }

  const label = form.querySelector(
    "[data-public-support-submit-label]"
  );

  if (label) {
    label.textContent = value
      ? "Creando incidencia…"
      : "Crear incidencia";
  }

  return true;
}

function responseTicketId(response = null) {
  if (!isObject(response)) return "";

  return cleanText(
    first(
      response.ticketId,
      response.incidenciaId,
      response.ticket?.ticketId,
      response.ticket?.id,
      response.incidencia?.ticketId,
      response.incidencia?.id,
      response.data?.ticketId,
      response.data?.ticket?.ticketId,
      response.data?.ticket?.id,
      ""
    ),
    ""
  );
}

function activationRequired(response = null) {
  if (!isObject(response)) return null;

  const value = first(
    response.activationRequired,
    response.account?.activationRequired,
    response.user?.activationRequired,
    response.data?.activationRequired,
    response.data?.account?.activationRequired,
    null
  );

  return typeof value === "boolean" ? value : null;
}

function successMessage(response = null) {
  const ticketId = responseTicketId(response);
  const activation = activationRequired(response);
  const prefix = ticketId
    ? `Incidencia ${ticketId} creada.`
    : "Incidencia creada.";

  if (activation === false) {
    return `${prefix} Ya puedes consultarla desde tu panel.`;
  }

  return `${prefix} Revisa tu correo: te enviaremos el enlace seguro para activar tu acceso y crear la contraseña.`;
}

function publicErrorMessage(error = null) {
  const status = Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      0
  );

  if (status === 429) {
    return "Has realizado varias solicitudes seguidas. Espera un momento y vuelve a intentarlo.";
  }

  if (status === 400 || status === 422) {
    return "Hay algún dato que el servidor no ha podido validar. Revisa el formulario.";
  }

  if (status === 404 || status === 405 || status === 501) {
    return "El alta directa no está disponible ahora mismo. Puedes contactar por WhatsApp mientras tanto.";
  }

  return "No se pudo crear la incidencia. Revisa tu conexión e inténtalo de nuevo.";
}

async function submitForm(form = null) {
  if (!form || form.dataset.submitting === "true") {
    return false;
  }

  setStatus(form, "", "info");

  const honeypot = cleanText(
    form.elements.namedItem("website")?.value,
    ""
  );

  if (honeypot) {
    setStatus(
      form,
      "Incidencia recibida. Revisa tu correo para continuar.",
      "success"
    );
    return true;
  }

  const errors = validateForm(form);

  if (errors.length) {
    setStatus(
      form,
      "Revisa los campos marcados antes de enviar.",
      "error"
    );
    errors[0].input?.focus?.();
    return false;
  }

  const payload = readPayload(form);
  setSubmitting(form, true);

  try {
    const response = await Http.post(
      PUBLIC_TICKET_ENDPOINT,
      payload,
      {
        public: true,
        auth: false,
        noAuthHeader: true,
        noAutoRefresh: true,
        timeout: 18000,
        source: SOURCE,
      }
    );

    setStatus(
      form,
      successMessage(response),
      "success"
    );

    form.dataset.submitted = "true";

    window.dispatchEvent(
      new CustomEvent("onion:public-support:created", {
        detail: {
          source: SOURCE,
          version: PUBLIC_SUPPORT_VERSION,
          ticketId: responseTicketId(response) || null,
        },
      })
    );

    const keepEmail = payload.email;
    form.reset();

    const emailInput = form.elements.namedItem("email");
    if (emailInput && keepEmail) {
      emailInput.value = keepEmail;
    }

    const counter = form.querySelector(
      "[data-public-support-counter]"
    );
    if (counter) {
      counter.textContent = "0 / 4000";
    }

    prefillFromSession(
      form.closest(HOME_SELECTOR)
    );

    return true;
  } catch (error) {
    setStatus(
      form,
      publicErrorMessage(error),
      "error"
    );

    return false;
  } finally {
    setSubmitting(form, false);
  }
}

function onSubmit(event = null) {
  const form = event?.target?.closest?.(FORM_SELECTOR);
  if (!form) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  submitForm(form);
}

function onInput(event = null) {
  const input = event?.target;
  const form = input?.closest?.(FORM_SELECTOR);

  if (!form || !input?.name) return;

  if (input.name !== "website") {
    setFieldError(form, input, "");
    setStatus(form, "", "info");
  }

  if (input.name === "description") {
    const counter = form.querySelector(
      "[data-public-support-counter]"
    );

    if (counter) {
      counter.textContent =
        `${String(input.value || "").length} / 4000`;
    }
  }
}

function onPublicHomeReady() {
  scan();
}

function install() {
  if (!isBrowser() || destroyed) return false;

  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("input", onInput, true);
  window.addEventListener(
    "onion:main:ready",
    onPublicHomeReady
  );
  document.addEventListener(
    "public-home:ready",
    onPublicHomeReady,
    true
  );

  observer = new MutationObserver(() => {
    scan();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scan();

  let attempts = 0;
  retryTimer = window.setInterval(() => {
    attempts += 1;
    scan();

    if (attempts >= 12) {
      window.clearInterval(retryTimer);
      retryTimer = 0;
    }
  }, 750);

  return true;
}

export function destroyPublicSupport() {
  if (!isBrowser() || destroyed) return false;

  destroyed = true;

  document.removeEventListener("submit", onSubmit, true);
  document.removeEventListener("input", onInput, true);
  window.removeEventListener(
    "onion:main:ready",
    onPublicHomeReady
  );
  document.removeEventListener(
    "public-home:ready",
    onPublicHomeReady,
    true
  );

  observer?.disconnect?.();
  observer = null;

  if (retryTimer) {
    window.clearInterval(retryTimer);
    retryTimer = 0;
  }

  return true;
}

if (isBrowser()) {
  install();
}

export default Object.freeze({
  version: PUBLIC_SUPPORT_VERSION,
  endpoint: PUBLIC_TICKET_ENDPOINT,
  scan,
  destroy: destroyPublicSupport,
});
