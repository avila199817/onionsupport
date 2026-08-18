/* =========================================================
   Onion Support - Public Support Intake
   Archivo: /src/features/public-support/index.js

   Home pública:
   - formulario visible de alta + incidencia;
   - un único POST público al backend;
   - avatar + full name cuando ya existe sesión;
   - WhatsApp queda como canal alternativo.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

export const PUBLIC_SUPPORT_VERSION = "public-support.intake.v2";
export const PUBLIC_TICKET_ENDPOINT = "/api/tickets/public";

const HOME = "[data-public-home]";
const FORM = "[data-public-support-form]";
const SECTION_ID = "incidencia";
const enhanced = new WeakSet();

let observer = null;
let retryTimer = 0;
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

        <div class="public-support-grid">
          ${field("fullName", "Nombre completo", "text", "Nombre y apellidos", "name", 120)}
          ${field("email", "Correo electrónico", "email", "tu@correo.com", "email", 180, "email")}
          ${field("phone", "Teléfono", "tel", "+34 600 000 000", "tel", 32, "tel")}
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

function field(name, label, type, placeholder, autocomplete, maxlength, inputmode = "") {
  const mode = inputmode ? ` inputmode="${inputmode}"` : "";
  return `<div class="public-support-field">
    <label for="public-support-${name}">${label}</label>
    <input id="public-support-${name}" name="${name}" type="${type}"${mode}
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

function retargetCtas(root) {
  const selector = [
    ".public-home-nav-cta",
    ".public-home-hero-actions .public-home-button--primary",
    ".public-home-price-link",
    ".public-home-contact-actions .public-home-button--primary",
  ].join(",");

  for (const link of root.querySelectorAll(selector)) {
    link.href = `#${SECTION_ID}`;
    link.removeAttribute("target");
    link.removeAttribute("rel");
    link.dataset.publicHomeScrollLink = "true";
    link.dataset.publicSupportIntakeLink = "true";

    const label = link.querySelector("span:not([aria-hidden])");
    if (label && link.matches(".public-home-nav-cta, .public-home-hero-actions .public-home-button--primary")) {
      label.textContent = "Abrir incidencia";
    }
  }
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

function prefill(root) {
  const form = root.querySelector(FORM);
  const { user, authenticated } = session();
  if (!form || !authenticated || !user) return;

  const values = {
    fullName: fullName(user),
    email: email(user),
    phone: phone(user),
    address: address(user),
  };

  for (const [name, value] of Object.entries(values)) {
    const input = form.elements.namedItem(name);
    if (input && !text(input.value) && value) input.value = value;
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
  let found = false;
  document.querySelectorAll(HOME).forEach((root) => {
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
  node.textContent = text(message);
  node.hidden = !text(message);
  node.dataset.status = text(message) ? type : "";
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "").length;
}

function validate(form) {
  const rules = {
    fullName: (v) => v.length >= 3 ? "" : "Introduce tu nombre completo.",
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Introduce un correo válido.",
    phone: (v) => digits(v) >= 7 ? "" : "Introduce un teléfono válido.",
    address: (v) => v.length >= 6 ? "" : "Introduce una dirección completa.",
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
    fullName: text(data.get("fullName")),
    email: text(data.get("email")).toLowerCase(),
    phone: text(data.get("phone")).replace(/[^\d+()\s.-]/g, "").slice(0, 32),
    address: text(data.get("address")),
    subject: text(data.get("subject")),
    description: text(data.get("description")),
    source: "public-home",
    channel: "web",
  };
}

function submitting(form, value) {
  form.dataset.submitting = value ? "true" : "false";
  form.classList.toggle("is-submitting", value);

  form.querySelectorAll("button, input, textarea, select").forEach((node) => {
    if (node.name !== "website") node.disabled = value;
  });

  const label = form.querySelector("[data-public-support-submit-label]");
  if (label) label.textContent = value ? "Creando incidencia…" : "Crear incidencia";
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

function successMessage(response) {
  const id = ticketId(response);
  const prefix = id ? `Incidencia ${id} creada.` : "Incidencia creada.";

  return activation(response) === false
    ? `${prefix} Ya puedes consultarla desde tu panel.`
    : `${prefix} Revisa tu correo: te enviaremos el enlace seguro para activar tu acceso y crear la contraseña.`;
}

function errorMessage(error) {
  const code = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  if (code === 429) return "Has realizado varias solicitudes seguidas. Espera un momento y vuelve a intentarlo.";
  if (code === 400 || code === 422) return "Hay algún dato que el servidor no ha podido validar. Revisa el formulario.";
  if ([404, 405, 501].includes(code)) return "El alta directa no está disponible ahora mismo. Puedes contactar por WhatsApp mientras tanto.";
  return "No se pudo crear la incidencia. Revisa tu conexión e inténtalo de nuevo.";
}

async function send(form) {
  if (form.dataset.submitting === "true") return false;
  status(form);

  if (text(form.elements.namedItem("website")?.value)) {
    status(form, "Incidencia recibida. Revisa tu correo para continuar.", "success");
    return true;
  }

  const failures = validate(form);
  if (failures.length) {
    status(form, "Revisa los campos marcados antes de enviar.", "error");
    failures[0]?.focus?.();
    return false;
  }

  const body = payload(form);
  submitting(form, true);

  try {
    const response = await Http.post(PUBLIC_TICKET_ENDPOINT, body, {
      public: true,
      auth: false,
      noAuthHeader: true,
      noAutoRefresh: true,
      timeout: 18000,
      source: "public-support.intake",
    });

    status(form, successMessage(response), "success");

    window.dispatchEvent(new CustomEvent("onion:public-support:created", {
      detail: {
        version: PUBLIC_SUPPORT_VERSION,
        ticketId: ticketId(response) || null,
      },
    }));

    form.reset();
    const counter = form.querySelector("[data-public-support-counter]");
    if (counter) counter.textContent = "0 / 4000";
    prefill(form.closest(HOME));
    return true;
  } catch (error) {
    status(form, errorMessage(error), "error");
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
    setFieldError(form, input, "");
    status(form);
  }

  if (input.name === "description") {
    const counter = form.querySelector("[data-public-support-counter]");
    if (counter) counter.textContent = `${String(input.value || "").length} / 4000`;
  }
}

function install() {
  if (typeof window === "undefined" || destroyed) return;

  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("input", onInput, true);
  window.addEventListener("onion:main:ready", scan);
  document.addEventListener("public-home:ready", scan, true);

  observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scan();

  let attempts = 0;
  retryTimer = window.setInterval(() => {
    scan();
    attempts += 1;
    if (attempts >= 12) {
      clearInterval(retryTimer);
      retryTimer = 0;
    }
  }, 750);
}

export function destroyPublicSupport() {
  if (typeof window === "undefined" || destroyed) return false;
  destroyed = true;

  document.removeEventListener("submit", onSubmit, true);
  document.removeEventListener("input", onInput, true);
  window.removeEventListener("onion:main:ready", scan);
  document.removeEventListener("public-home:ready", scan, true);

  observer?.disconnect();
  observer = null;

  if (retryTimer) clearInterval(retryTimer);
  retryTimer = 0;
  return true;
}

if (typeof window !== "undefined") install();

export default Object.freeze({
  version: PUBLIC_SUPPORT_VERSION,
  endpoint: PUBLIC_TICKET_ENDPOINT,
  scan,
  destroy: destroyPublicSupport,
});
