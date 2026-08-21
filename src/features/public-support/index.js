/* =========================================================
   Onion Support - Public Support Intake
   Archivo: /src/features/public-support/index.js

   Home pública:
   - formulario visible de alta + incidencia;
   - un único POST público al backend;
   - autenticación opcional: visitante anónimo o sesión existente;
   - idempotencia estable por intento/reintento del mismo formulario;
   - identidad del cliente autenticado en su acceso al panel;
   - formulario sin exponer automáticamente el nombre del usuario;
   - teléfono limitado a España (+34) con input nacional de 9 dígitos;
   - una incidencia en curso por cuenta, preparada para enforcement backend;
   - respuesta anti-enumeración neutra para visitante anónimo;
   - CTAs internos diferenciados de WhatsApp;
   - listeners del formulario limitados al mount persistente del Router;
   - WhatsApp queda como canal alternativo.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

export const PUBLIC_SUPPORT_VERSION = "public-support.intake.v7-national-phone-field";
export const PUBLIC_TICKET_ENDPOINT = "/api/tickets/public";

const VIEW_ROOT_SELECTOR = "#view-container, [data-router-view='true']";
const HOME = "[data-public-home]";
const FORM = "[data-public-support-form]";
const SECTION_ID = "incidencia";
const SPAIN_PREFIX = "+34";
const ACTIVE_TICKET_ERROR_CODES = new Set([
  "PUBLIC_TICKET_ACTIVE_EXISTS",
  "PUBLIC_TICKET_OPEN_EXISTS",
  "PUBLIC_TICKET_ALREADY_OPEN",
  "ACTIVE_TICKET_EXISTS",
]);
const enhanced = new WeakSet();

let observer = null;
let retryTimer = 0;
let mountRoot = null;
let installed = false;
let destroyed = false;

const text = (value = "", fallback = "") =>
  String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim() || fallback;

function first(...values) {
  return values.find((value) =>
    value !== undefined &&
    value !== null &&
    !(typeof value === "string" && !value.trim())
  ) ?? null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function state() {
  try {
    return object(AppCore?.getState?.()) || object(AppCore?.state) || {};
  } catch {
    return object(AppCore?.state) || {};
  }
}

function session() {
  const current = state();
  const user = object(current.currentUser) || object(current.user);

  return {
    state: current,
    user,
    authenticated: current.authenticated === true || AppCore?.isAuthenticated?.() === true,
  };
}

function fullName(user) {
  if (!user) return "";

  return text(first(
    user.fullName,
    user.displayName,
    user.name,
    user.nombre,
    user.profile?.fullName,
    user.profile?.displayName,
    [user.firstName, user.lastName].filter(Boolean).join(" "),
    ""
  ));
}

function email(user) {
  return text(first(user?.email, user?.emailLower, user?.profile?.email, "")).toLowerCase();
}

function phone(user) {
  return text(first(user?.phone, user?.telefono, user?.mobile, user?.profile?.phone, ""));
}

function address(user) {
  const value = first(user?.address, user?.direccion, user?.profile?.address, "");
  if (typeof value === "string") return text(value);
  if (!object(value)) return "";

  return text([
    first(value.street, value.line1, value.calle, ""),
    first(value.number, value.numero, ""),
    first(value.postalCode, value.zip, value.cp, ""),
    first(value.city, value.locality, value.localidad, ""),
    first(value.region, value.province, value.provincia, ""),
  ].filter(Boolean).join(", "));
}

function avatar(user) {
  const raw = text(first(
    user?.avatarUrl,
    user?.avatar,
    user?.picture,
    user?.photoUrl,
    user?.profile?.avatarUrl,
    user?.profile?.avatar,
    ""
  ));

  if (!raw || /[\r\n\t\\]/.test(raw) || /^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");

  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol === "https:" || url.origin === window.location.origin) return url.href;
  } catch {
    // noop
  }

  return "";
}

function initials(name) {
  return text(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "OS";
}

function panelHref(current, user) {
  const existing = text(first(current?.homePath, current?.defaultHome, ""));
  if (existing.startsWith("/") && !existing.startsWith("//")) return existing;

  const slug = text(first(current?.userSlug, user?.slug, user?.username, user?.usernameLower, ""))
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return slug ? `/@${encodeURIComponent(slug)}` : "/";
}

function identityNode(name, src) {
  const wrap = document.createElement("span");
  wrap.className = "public-support-account";

  const mark = document.createElement("span");
  mark.className = "public-support-account-avatar";
  mark.setAttribute("aria-hidden", "true");

  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "eager";
    img.decoding = "async";
    mark.appendChild(img);
  } else {
    mark.textContent = initials(name);
  }

  const copy = document.createElement("span");
  copy.className = "public-support-account-copy";

  const strong = document.createElement("strong");
  strong.className = "public-support-account-name";
  strong.textContent = name;

  const small = document.createElement("small");
  small.className = "public-support-account-label";
  small.textContent = "Ir al panel";

  copy.append(strong, small);
  wrap.append(mark, copy);
  return wrap;
}

function syncIdentity(root) {
  const { state: current, user, authenticated } = session();
  const links = root.querySelectorAll("[data-public-home-login]");

  if (!authenticated || !user) {
    for (const link of links) {
      if (link.dataset.publicSupportAccount !== "true") continue;
      link.href = "/login";
      link.dataset.route = "/login";
      link.dataset.href = "/login";
      link.classList.remove("public-support-account-link");
      delete link.dataset.publicSupportAccount;
      delete link.dataset.publicSupportIdentityKey;
      link.setAttribute("aria-label", "Abrir panel cliente");
      link.textContent = "Panel cliente";
    }

    delete root.dataset.publicSupportAuthenticated;
    return false;
  }

  const name = fullName(user) || email(user) || "Mi cuenta";
  const src = avatar(user);
  const href = panelHref(current, user);
  const key = `${href}|${name}|${src}`;

  for (const link of links) {
    if (
      link.dataset.publicSupportAccount === "true" &&
      link.dataset.publicSupportIdentityKey === key
    ) continue;

    link.href = href;
    link.dataset.route = href;
    link.dataset.href = href;
    link.dataset.publicSupportAccount = "true";
    link.dataset.publicSupportIdentityKey = key;
    link.classList.add("public-support-account-link");
    link.setAttribute("aria-label", `Abrir el panel de ${name}`);
    link.replaceChildren(identityNode(name, src));
  }

  root.dataset.publicSupportAuthenticated = "true";
  return true;
}

function formSection() {
  const section = document.createElement("section");
  section.id = SECTION_ID;
  section.className = "public-home-section public-support-section";
  section.dataset.publicSupportSection = "true";
  section.setAttribute("aria-labelledby", "public-support-title");

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
          <div class="public-support-flow-item"><span>01</span><div><strong>Registramos el caso</strong><p>La incidencia queda asociada a tu correo y preparada para seguimiento.</p></div></div>
          <div class="public-support-flow-item"><span>02</span><div><strong>Preparamos tu acceso</strong><p>Si es tu primera vez, recibirás un email seguro para definir tu contraseña.</p></div></div>
          <div class="public-support-flow-item"><span>03</span><div><strong>Entras en tu panel</strong><p>Desde ahí podrás seguir incidencias, facturas y tus datos de cliente.</p></div></div>
        </div>

        <p class="public-support-privacy">
          Los datos del formulario se usan para gestionar tu incidencia y tu cuenta de cliente.
        </p>
      </div>

      <form class="public-support-form" data-public-support-form="true" novalidate autocomplete="on">
        <div class="public-support-form-head">
          <div><span class="public-support-kicker">Nueva incidencia</span><h3>¿Qué necesitas?</h3></div>
          <span class="public-support-secure">Acceso por email</span>
        </div>

        <div class="public-support-flow-item" data-public-support-one-open-policy="true">
          <span>1×</span>
          <div>
            <strong>Una incidencia en curso por cuenta</strong>
            <p>Para evitar duplicados, si ya existe una incidencia abierta no se creará otra hasta que la actual se cierre.</p>
          </div>
        </div>

        <div class="public-support-grid">
          ${field("fullName", "Nombre completo", "text", "Nombre y apellidos", "name", 120)}
          ${field("email", "Correo electrónico", "email", "tu@correo.com", "email", 180, "email")}
          ${field("phone", "Teléfono", "tel", "612 345 678", "tel-national", 11, "tel")}
          ${field("address", "Dirección", "text", "Calle, número, localidad y CP", "street-address", 220)}

          <div class="public-support-field public-support-field--wide">
            <label for="public-support-subject">Asunto</label>
            <input id="public-support-subject" name="subject" type="text" maxlength="140" required
              placeholder="Ej. El portátil no arranca" autocomplete="off">
            ${errorNode("subject")}
          </div>

          <div class="public-support-field public-support-field--wide">
            <label for="public-support-description">Cuéntame qué ocurre</label>
            <textarea id="public-support-description" name="description" rows="7" maxlength="4000" required
              placeholder="Qué ocurre, desde cuándo, mensajes de error y cualquier detalle que pueda ayudar."></textarea>
            <div class="public-support-field-meta">
              <small>Cuanto más contexto, mejor diagnóstico inicial.</small>
              <small data-public-support-counter="true">0 / 4000</small>
            </div>
            ${errorNode("description")}
          </div>
        </div>

        <div class="public-support-honeypot" aria-hidden="true">
          <label for="public-support-website">Web</label>
          <input id="public-support-website" name="website" type="text" tabindex="-1" autocomplete="off">
        </div>

        <div class="public-support-submit-row">
          <div class="public-support-status" data-public-support-status="true"
            role="status" aria-live="polite" aria-atomic="true" hidden></div>

          <button class="public-support-submit" type="submit">
            <span data-public-support-submit-label="true">Crear incidencia</span>
            <span class="public-support-submit-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </div>`;

  return section;
}

function errorNode(name) {
  return `<small id="public-support-error-${name}" class="public-support-error"
    data-public-support-error-for="${name}" hidden></small>`;
}

function field(name, label, type, placeholder, autocomplete, maxlength, inputmode = "", value = "") {
  const mode = inputmode ? ` inputmode="${inputmode}"` : "";
  const initialValue = value ? ` value="${value}"` : "";
  const phoneAttrs = name === "phone"
    ? ` aria-label="Teléfono de España"`
    : "";

  return `<div class="public-support-field">
    <label for="public-support-${name}">${label}</label>
    <input id="public-support-${name}" name="${name}" type="${type}"${mode}${initialValue}${phoneAttrs}
      autocomplete="${autocomplete}" maxlength="${maxlength}" required placeholder="${placeholder}">
    ${errorNode(name)}
  </div>`;
}

function ensureForm(root) {
  const found = root.querySelector(`[data-public-support-section], #${SECTION_ID}`);
  if (found) return found;

  const section = formSection();
  const hero = root.querySelector(".public-home-hero");

  if (hero?.parentNode) hero.insertAdjacentElement("afterend", section);
  else root.querySelector(".public-home-content")?.prepend(section);

  return section;
}

function intakeIconNode() {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("class", "public-home-icon public-support-intake-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const paths = [
    "M7.25 3.75h9.5a2 2 0 0 1 2 2v12.5a2 2 0 0 1-2 2h-9.5a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2Z",
    "M9 8.25h6",
    "M9 11.75h6",
    "M12 14.5v4",
    "M10 16.5h4",
  ];

  for (const d of paths) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }

  return svg;
}

function syncIntakeCta(link) {
  if (!link) return;

  link.href = `#${SECTION_ID}`;
  link.removeAttribute("target");
  link.removeAttribute("rel");
  link.dataset.publicHomeScrollLink = "true";
  link.dataset.publicSupportIntakeLink = "true";

  const context = text(link.closest(".public-home-price-card")?.querySelector("h3")?.textContent);
  link.setAttribute(
    "aria-label",
    context ? `Abrir incidencia sobre ${context}` : "Abrir formulario de incidencia"
  );

  if (link.matches(".public-home-price-link")) {
    const arrow = link.querySelector(".public-home-icon--arrow");
    if (arrow) link.replaceChildren(document.createTextNode("Abrir incidencia "), arrow);
    else link.textContent = "Abrir incidencia";
    return;
  }

  const label = link.querySelector("span:not([aria-hidden])");
  if (label) label.textContent = "Abrir incidencia";

  const whatsappIcon = link.querySelector(".public-home-icon--whatsapp");
  if (whatsappIcon) whatsappIcon.replaceWith(intakeIconNode());
}

function retargetCtas(root) {
  const selector = [
    ".public-home-nav-cta",
    ".public-home-hero-actions .public-home-button--primary",
    ".public-home-price-link",
    ".public-home-contact-actions .public-home-button--primary",
  ].join(",");

  root.querySelectorAll(selector).forEach(syncIntakeCta);
}

function syncFaq(root) {
  for (const item of root.querySelectorAll(".public-home-faq-item")) {
    const summary = text(item.querySelector("summary")?.textContent).toLowerCase();
    if (summary !== "¿cómo solicito un diagnóstico?") continue;

    const answer = item.querySelector("p");
    if (answer) {
      answer.textContent =
        "Completa el formulario de la web. Crearemos la incidencia y, si es tu primera vez, recibirás un email para activar tu acceso y definir la contraseña.";
    }
    break;
  }
}

function nationalSpanishDigits(value = "") {
  let valueDigits = String(value ?? "").replace(/\D/g, "");

  if (valueDigits.startsWith("0034")) valueDigits = valueDigits.slice(4);
  else if (valueDigits.startsWith("34") && valueDigits.length === 11) valueDigits = valueDigits.slice(2);

  return valueDigits.slice(0, 9);
}

function formatNationalSpanishPhone(value = "") {
  const national = nationalSpanishDigits(value);
  if (!national) return "";
  return [national.slice(0, 3), national.slice(3, 6), national.slice(6, 9)]
    .filter(Boolean)
    .join(" ");
}

function normalizeSpanishPhone(value = "") {
  const national = nationalSpanishDigits(value);
  if (!/^[6789]\d{8}$/.test(national)) return "";

  return `${SPAIN_PREFIX} ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 9)}`;
}

function prefill(root) {
  const form = root?.querySelector?.(FORM);
  if (!form) return;

  const phoneInput = form.elements.namedItem("phone");
  const { user, authenticated } = session();
  if (!authenticated || !user) return;

  /*
     El nombre NO se precarga de forma deliberada: evita exponer
     automáticamente el nombre del usuario en un formulario público.
  */
  const values = {
    email: email(user),
    address: address(user),
  };

  for (const [name, value] of Object.entries(values)) {
    const input = form.elements.namedItem(name);
    if (input && !text(input.value) && value) input.value = value;
  }

  const storedPhone = formatNationalSpanishPhone(phone(user));
  if (phoneInput && storedPhone && !text(phoneInput.value)) {
    phoneInput.value = storedPhone;
  }
}

function enhance(root) {
  if (!root || destroyed) return false;

  if (!enhanced.has(root)) {
    ensureForm(root);
    retargetCtas(root);
    syncFaq(root);
    enhanced.add(root);
    root.dataset.publicSupportReady = "true";
  }

  syncIdentity(root);
  prefill(root);
  return true;
}

function scan() {
  if (destroyed || typeof document === "undefined") return false;

  const scope = mountRoot || document;
  let found = false;
  scope.querySelectorAll(HOME).forEach((root) => {
    found = enhance(root) || found;
  });
  return found;
}

function errorFor(form, name) {
  return form.querySelector(`[data-public-support-error-for="${name}"]`);
}

function setFieldError(form, input, message = "") {
  const error = errorFor(form, input.name);
  const invalid = Boolean(message);

  input.classList.toggle("is-invalid", invalid);
  input.setAttribute("aria-invalid", invalid ? "true" : "false");

  if (error) {
    error.textContent = message;
    error.hidden = !invalid;
    if (invalid) input.setAttribute("aria-describedby", error.id);
    else if (input.getAttribute("aria-describedby") === error.id) input.removeAttribute("aria-describedby");
  }
}

function status(form, message = "", type = "info") {
  const node = form.querySelector("[data-public-support-status]");
  if (!node) return;

  const clean = text(message);
  node.textContent = clean;
  node.hidden = !clean;
  node.dataset.status = clean ? type : "";
}

function normalizedErrorCode(error) {
  return text(first(
    error?.code,
    error?.payload?.code,
    error?.payload?.error,
    error?.data?.code,
    error?.data?.error,
    ""
  ))
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function activeTicketConflict(error) {
  const httpStatus = Number(
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    0
  );

  return (
    (httpStatus === 409 || httpStatus === 423) &&
    ACTIVE_TICKET_ERROR_CODES.has(normalizedErrorCode(error))
  );
}

function currentFormEmail(form) {
  return text(form?.elements?.namedItem?.("email")?.value).toLowerCase();
}

function lockedEmail(form) {
  return text(form?.dataset?.publicSupportBlockedEmail).toLowerCase();
}

function lockMatchesCurrentEmail(form) {
  const locked = lockedEmail(form);
  return Boolean(locked && locked === currentFormEmail(form));
}

function lockMessage(form) {
  return text(
    form?.dataset?.publicSupportBlockedMessage,
    "Ya hay una incidencia en curso para esta cuenta. No se abrirá otra hasta que se cierre."
  );
}

function lockStatusType(form) {
  return text(form?.dataset?.publicSupportBlockedStatus, "info");
}

function syncSubmitState(form) {
  if (!form) return false;

  const busy = form.dataset.submitting === "true";
  const locked = lockMatchesCurrentEmail(form);
  const submit = form.querySelector(".public-support-submit");
  const label = form.querySelector("[data-public-support-submit-label]");

  form.classList.toggle("has-active-ticket", locked);
  form.dataset.activeTicket = locked ? "true" : "false";

  if (submit) {
    submit.disabled = busy;
    submit.setAttribute("aria-disabled", busy || locked ? "true" : "false");
  }

  if (label) {
    label.textContent = busy
      ? "Creando incidencia…"
      : locked
        ? "Incidencia en curso"
        : "Crear incidencia";
  }

  return locked;
}

function setSubmissionLock(form, emailValue, message, type = "info") {
  const cleanEmail = text(emailValue).toLowerCase();
  if (!form?.dataset || !cleanEmail) return false;

  form.dataset.publicSupportBlockedEmail = cleanEmail;
  form.dataset.publicSupportBlockedMessage = text(message);
  form.dataset.publicSupportBlockedStatus = text(type, "info");
  syncSubmitState(form);
  return true;
}

function showSubmissionLock(form) {
  if (!lockMatchesCurrentEmail(form)) return false;
  status(form, lockMessage(form), lockStatusType(form));
  syncSubmitState(form);
  return true;
}

function activeTicketMessage() {
  return session().authenticated === true
    ? "Ya tienes una incidencia en curso. Para evitar duplicados, no puedes abrir otra hasta que la actual se cierre. Puedes seguirla desde tu panel."
    : "Solicitud recibida. Si ya existe una incidencia en curso, no se abrirá otra. Revisa tu correo o entra en tu panel para continuar.";
}

function hasFullName(value = "") {
  const parts = text(value).split(" ").filter(Boolean);
  return parts.length >= 2 && parts.join(" ").length >= 3;
}

function validate(form) {
  const rules = {
    fullName: (v) => hasFullName(v) ? "" : "Introduce tu nombre y apellidos.",
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Introduce un correo válido.",
    phone: (v) => normalizeSpanishPhone(v) ? "" : "Introduce un teléfono de España válido (9 dígitos).",
    address: (v) => v.length >= 8 ? "" : "Introduce una dirección completa.",
    subject: (v) => v.length >= 4 ? "" : "Resume el problema en el asunto.",
    description: (v) => v.length >= 10 ? "" : "Añade un poco más de detalle sobre el problema.",
  };

  const failures = [];

  for (const [name, rule] of Object.entries(rules)) {
    const input = form.elements.namedItem(name);
    if (!input) continue;
    const message = rule(text(input.value));
    setFieldError(form, input, message);
    if (message) failures.push(input);
  }

  return failures;
}

function payload(form) {
  const data = new FormData(form);
  return {
    fullName: text(data.get("fullName")).slice(0, 120),
    email: text(data.get("email")).toLowerCase().slice(0, 180),
    phone: normalizeSpanishPhone(data.get("phone")),
    address: text(data.get("address")).slice(0, 220),
    subject: text(data.get("subject")).slice(0, 140),
    description: text(data.get("description")).slice(0, 4000),
    source: "public-home",
    channel: "web",
  };
}

function utcDateSegment(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function randomIdempotencyNonce() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // fallback no criptográfico: la clave sólo identifica un reintento, no autoriza nada.
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`;
}

function idempotencyKey(form) {
  const existing = text(form?.dataset?.publicSupportIdempotencyKey);
  if (existing) return existing;

  const key = `${utcDateSegment()}:${randomIdempotencyNonce()}`;
  if (form?.dataset) form.dataset.publicSupportIdempotencyKey = key;
  return key;
}

function clearIdempotency(form) {
  if (form?.dataset) delete form.dataset.publicSupportIdempotencyKey;
}

function submitting(form, value) {
  form.dataset.submitting = value ? "true" : "false";
  form.classList.toggle("is-submitting", value);
  form.setAttribute("aria-busy", value ? "true" : "false");

  form.querySelectorAll("input, textarea, select").forEach((node) => {
    if (node.name !== "website") node.disabled = value;
  });

  syncSubmitState(form);
}

function ticketId(response) {
  return text(first(
    response?.ticketId,
    response?.incidenciaId,
    response?.ticket?.ticketId,
    response?.ticket?.id,
    response?.data?.ticketId,
    response?.data?.ticket?.ticketId,
    response?.data?.ticket?.id,
    ""
  ));
}

function activation(response) {
  const value = first(
    response?.activationRequired,
    response?.account?.activationRequired,
    response?.data?.activationRequired,
    response?.data?.account?.activationRequired,
    null
  );
  return typeof value === "boolean" ? value : null;
}

function neutralAccepted(response) {
  const accepted = first(
    response?.accepted,
    response?.data?.accepted,
    false
  ) === true;

  return accepted && !ticketId(response) && activation(response) === null;
}

function successMessage(response) {
  if (neutralAccepted(response)) {
    return "Solicitud recibida. Revisa tu correo para continuar. Si ya había una incidencia en curso, no se abrirá otra.";
  }

  const id = ticketId(response);
  const prefix = id ? `Incidencia ${id} creada.` : "Incidencia creada.";

  return activation(response) === false
    ? `${prefix} Ya puedes consultarla desde tu panel.`
    : `${prefix} Revisa tu correo: te enviaremos el enlace seguro para activar tu acceso y crear la contraseña.`;
}

function errorMessage(error) {
  const code = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  if (activeTicketConflict(error)) return activeTicketMessage();
  if (code === 429) return "Has realizado varias solicitudes seguidas. Espera un momento y vuelve a intentarlo.";
  if (code === 400 || code === 422) return "Hay algún dato que el servidor no ha podido validar. Revisa el formulario.";
  if ([502, 503, 504].includes(code)) return "El servicio no ha podido completar la solicitud. Espera unos segundos y vuelve a intentarlo.";
  if ([404, 405, 501].includes(code)) return "El alta directa no está disponible ahora mismo. Puedes contactar por WhatsApp mientras tanto.";
  return "No se pudo crear la incidencia. Comprueba tu conexión e inténtalo de nuevo.";
}

function clearAcceptedIssueFields(form) {
  for (const name of ["subject", "description", "website"]) {
    const input = form.elements.namedItem(name);
    if (input) input.value = "";
  }

  for (const input of form.querySelectorAll("input[name], textarea[name]")) {
    if (input.name !== "website") setFieldError(form, input, "");
  }

  const counter = form.querySelector("[data-public-support-counter]");
  if (counter) counter.textContent = "0 / 4000";
}

async function send(form) {
  if (form.dataset.submitting === "true") return false;
  if (showSubmissionLock(form)) return false;
  status(form);

  if (text(form.elements.namedItem("website")?.value)) {
    const message = "Incidencia recibida. Revisa tu correo para continuar.";
    status(form, message, "success");
    setSubmissionLock(form, currentFormEmail(form), message, "success");
    return true;
  }

  const failures = validate(form);
  if (failures.length) {
    status(form, "Revisa los campos marcados antes de enviar.", "error");
    failures[0]?.focus?.();
    return false;
  }

  const body = payload(form);
  const requestKey = idempotencyKey(form);
  const useAuth = session().authenticated === true;
  submitting(form, true);

  try {
    const response = await Http.post(PUBLIC_TICKET_ENDPOINT, body, {
      auth: useAuth,
      noAutoRefresh: !useAuth,
      headers: {
        "Idempotency-Key": requestKey,
      },
      timeout: 50000,
      source: "public-support.intake",
    });

    const message = successMessage(response);
    status(form, message, "success");

    window.dispatchEvent(new CustomEvent("onion:public-support:created", {
      detail: {
        version: PUBLIC_SUPPORT_VERSION,
        ticketId: ticketId(response) || null,
      },
    }));

    clearIdempotency(form);
    clearAcceptedIssueFields(form);
    setSubmissionLock(form, body.email, message, "success");
    return true;
  } catch (error) {
    const isActive = activeTicketConflict(error);
    const message = errorMessage(error);
    status(form, message, isActive ? "info" : "error");

    if (isActive) {
      setSubmissionLock(form, body.email, message, "info");
      window.dispatchEvent(new CustomEvent("onion:public-support:active-ticket", {
        detail: {
          version: PUBLIC_SUPPORT_VERSION,
        },
      }));
    }

    return false;
  } finally {
    submitting(form, false);
  }
}

function onSubmit(event) {
  const form = event.target?.closest?.(FORM);
  if (!form) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  void send(form);
}

function onInput(event) {
  const input = event.target;
  const form = input?.closest?.(FORM);
  if (!form || !input?.name) return;

  if (input.name !== "website") {
    clearIdempotency(form);
    setFieldError(form, input, "");
    syncSubmitState(form);

    if (!showSubmissionLock(form)) status(form);
  }

  if (input.name === "description") {
    const counter = form.querySelector("[data-public-support-counter]");
    if (counter) counter.textContent = `${String(input.value || "").length} / 4000`;
  }
}

function onFocusOut(event) {
  const input = event.target;
  if (!input?.matches?.(`${FORM} [name="phone"]`)) return;

  input.value = formatNationalSpanishPhone(input.value);
}

function bindFormEvents(root) {
  if (!root) return false;

  root.addEventListener("submit", onSubmit, true);
  root.addEventListener("input", onInput, true);
  root.addEventListener("focusout", onFocusOut, true);
  return true;
}

function unbindFormEvents(root) {
  if (!root) return false;

  root.removeEventListener("submit", onSubmit, true);
  root.removeEventListener("input", onInput, true);
  root.removeEventListener("focusout", onFocusOut, true);
  return true;
}

function install() {
  if (typeof window === "undefined" || destroyed || installed) return false;

  const root = document.querySelector(VIEW_ROOT_SELECTOR);
  if (!root || typeof MutationObserver === "undefined") return false;

  mountRoot = root;
  installed = true;
  bindFormEvents(root);

  window.addEventListener("onion:main:ready", scan);
  document.addEventListener("public-home:ready", scan, true);

  observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });

  if (!scan()) {
    let attempts = 0;
    retryTimer = window.setInterval(() => {
      attempts += 1;
      if (scan() || attempts >= 12) {
        clearInterval(retryTimer);
        retryTimer = 0;
      }
    }, 750);
  }

  return true;
}

export function destroyPublicSupport() {
  if (typeof window === "undefined" || destroyed) return false;
  destroyed = true;

  unbindFormEvents(mountRoot);
  window.removeEventListener("onion:main:ready", scan);
  document.removeEventListener("public-home:ready", scan, true);

  observer?.disconnect();
  observer = null;

  if (retryTimer) clearInterval(retryTimer);
  retryTimer = 0;
  mountRoot = null;
  installed = false;
  return true;
}

export function getPublicSupportSnapshot() {
  return Object.freeze({
    version: PUBLIC_SUPPORT_VERSION,
    endpoint: PUBLIC_TICKET_ENDPOINT,
    installed,
    listenerScope: mountRoot ? "router-view" : "none",
    observerScope: mountRoot ? "router-view" : "none",
    homeMounted: Boolean(mountRoot?.querySelector?.(HOME)),
  });
}

if (typeof window !== "undefined") install();

export default Object.freeze({
  version: PUBLIC_SUPPORT_VERSION,
  endpoint: PUBLIC_TICKET_ENDPOINT,
  scan,
  destroy: destroyPublicSupport,
  getSnapshot: getPublicSupportSnapshot,
});