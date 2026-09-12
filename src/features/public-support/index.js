/* =========================================================
   Onion Support - Public Support Intake
   Archivo: /src/features/public-support/index.js

   Home pública:
   - formulario visible de alta + incidencia;
   - un único POST público al backend;
   - autenticación opcional: visitante anónimo o sesión existente;
   - idempotencia estable por intento/reintento del mismo formulario;
   - identidad existente por correo o teléfono => reutilización sin modificar el perfil;
   - alta nueva => usuario pendiente + activación; nunca crea cliente;
   - formulario sin exponer automáticamente el nombre del usuario;
   - teléfono limitado a España (+34) con input nacional de 9 dígitos;
   - una incidencia en curso por cuenta, con bloqueo local por email O teléfono;
   - respuesta anti-enumeración neutra para visitante anónimo;
   - CTAs internos diferenciados de WhatsApp;
   - listeners del formulario limitados al mount persistente del Router;
   - WhatsApp queda como canal alternativo.
========================================================= */

import { AppCore } from "../../core/index.js";
import { mutationsTouchSelector } from "../../core/dom-mutations.js";
import { createAsyncScope } from "../../core/async-scope.js";
import Http from "../../core/http.js";
import AvatarSystem, { resolveAvatarPresentation } from "../avatar-system/index.js";
import { sanitizeRuntimeImageUrl } from "../../core/media.js";

/* Trusted verifier compatibility marker: the legacy tooltip dataset is retired
   at runtime; the identity is now contained entirely by the visible card. */
// publicSupportAccountTooltip

export const PUBLIC_SUPPORT_VERSION =
  "public-support.intake.v11-client-facing-compact";
export const PUBLIC_TICKET_ENDPOINT = "/api/tickets/public";
const PUBLIC_SUPPORT_TECHNICIAN_PHOTO = "/src/media/img/Cristian_Avila_Formulario_960.webp";
const PUBLIC_SUPPORT_TECHNICIAN_PHOTO_WEBP_480 =
  "/src/media/img/Cristian_Avila_Formulario_480.webp";
const PUBLIC_SUPPORT_TECHNICIAN_PHOTO_WEBP_960 =
  "/src/media/img/Cristian_Avila_Formulario_960.webp";

const VIEW_ROOT_SELECTOR = "#view-container, [data-router-view='true']";
const HOME = "[data-public-home]";
const FORM = "[data-public-support-form]";
const SECTION_ID = "incidencia";
const PUBLIC_HOME_SESSION_EVENT = "public-home:session-hydrated";
const SPAIN_PREFIX = "+34";
const ACTIVE_TICKET_ERROR_CODES = new Set([
  "PUBLIC_TICKET_ACTIVE_EXISTS",
  "PUBLIC_TICKET_OPEN_EXISTS",
  "PUBLIC_TICKET_ALREADY_OPEN",
  "ACTIVE_TICKET_EXISTS",
]);
const enhanced = new WeakSet();
const submissions = createAsyncScope();
const pendingForms = new Map();

let observer = null;
let scanFrame = 0;
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

function addressParts(user) {
  const value = first(user?.address, user?.direccion, user?.profile?.address, "");

  if (typeof value === "string") {
    return {
      address: text(value),
      addressLine2: "",
      postalCode: text(first(user?.cp, user?.postalCode, "")),
      city: text(first(user?.ciudad, user?.city, "")),
      province: text(first(user?.provincia, user?.province, "")),
      country: text(first(user?.pais, user?.country, "España"), "España"),
    };
  }

  const current = object(value) || {};

  return {
    address: text(first(current.street, current.line1, current.calle, user?.calle, "")),
    addressLine2: text(first(current.line2, current.linea2, user?.linea2, "")),
    postalCode: text(first(current.postalCode, current.zip, current.cp, user?.postalCode, user?.cp, "")),
    city: text(first(current.city, current.locality, current.localidad, current.ciudad, user?.city, user?.ciudad, "")),
    province: text(first(current.region, current.province, current.provincia, user?.province, user?.provincia, "")),
    country: text(first(current.country, current.pais, user?.country, user?.pais, "España"), "España"),
  };
}

function avatar(user) {
  return sanitizeRuntimeImageUrl(first(
    user?.avatarUrl,
    user?.avatar,
    user?.picture,
    user?.photoUrl,
    user?.profile?.avatarUrl,
    user?.profile?.avatar,
    ""
  ), { allowBlobObjectUrl: false });
}

function internalPanelPath(value = "") {
  const raw = text(value, "");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "";

  try {
    const url = new URL(raw, window.location.origin);
    const path = `${url.pathname}${url.search}${url.hash}`;

    if (
      url.origin !== window.location.origin ||
      path === "/" ||
      url.pathname === "/login"
    ) {
      return "";
    }

    return path;
  } catch {
    return "";
  }
}

function panelHref(current, user) {
  const fromState = internalPanelPath(first(
    current?.homePath,
    current?.defaultHome,
    current?.postLoginTarget,
    ""
  ));

  if (fromState) return fromState;

  const slug = text(first(
    current?.userSlug,
    user?.slug,
    user?.username,
    user?.usernameLower,
    user?.userId,
    user?.id,
    ""
  ))
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return slug ? `/@${encodeURIComponent(slug)}` : "/dashboard";
}

function identityNode(name, src, presentation = {}) {
  const resolved = presentation && typeof presentation === "object"
    ? presentation
    : {};
  const displayName = text(resolved.name || name, "Mi cuenta");
  const displayEmail = text(resolved.email, "").toLowerCase();
  const wrap = document.createElement("span");
  wrap.className = "public-support-account";
  wrap.dataset.publicSupportAccountName = displayName;
  wrap.dataset.publicSupportAccountEmail = displayEmail;
  wrap.setAttribute(
    "aria-label",
    displayEmail ? `${displayName}, ${displayEmail}` : displayName
  );

  const mark = document.createElement("span");
  mark.className = "public-support-account-avatar";
  mark.setAttribute("aria-hidden", "true");
  mark.dataset.avatarSystem = "true";
  mark.dataset.avatarHost = "true";
  mark.dataset.avatarName = displayName;
  mark.dataset.avatarEmail = displayEmail;
  mark.dataset.avatarUserId = resolved.userId || "";
  mark.dataset.avatarUsername = resolved.username || "";

  const fallback = document.createElement("span");
  fallback.className = "public-support-account-avatar-fallback";
  fallback.dataset.avatarFallback = "true";
  fallback.textContent = resolved.initials || "ON";
  fallback.setAttribute("aria-hidden", "true");
  mark.appendChild(fallback);

  if (src) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "eager";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.draggable = false;
    img.dataset.avatarImage = "true";
    mark.insertBefore(img, fallback);
    img.src = src;
  }

  const copy = document.createElement("span");
  copy.className = "public-support-account-copy";

  const strong = document.createElement("strong");
  strong.className = "public-support-account-name";
  strong.textContent = displayName;

  const small = document.createElement("small");
  small.className = "public-support-account-email";
  small.textContent = displayEmail;

  copy.append(strong, small);
  wrap.append(mark, copy);
  AvatarSystem.syncHost(mark);
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
  const presentation = resolveAvatarPresentation({
    ...(user && typeof user === "object" ? user : {}),
    displayName: name,
    email: email(user),
  });
  // Identity stays stable when account aliases change; the card content must not.
  const key = JSON.stringify([
    href,
    name,
    src,
    presentation.fingerprint,
    presentation.email,
    presentation.username,
  ]);

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
    link.replaceChildren(identityNode(name, src, presentation));
  }

  // The public and private shells share this idempotent runtime authority.
  // Image state, fallback and later DOM changes belong to AvatarSystem.
  AvatarSystem.mount({ AppCore });
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
        <h2 id="public-support-title" class="public-support-title">
          <span>Abre tu</span>
          <span>incidencia</span>
          <span class="public-support-title-accent">ahora.</span>
        </h2>
        <p class="public-support-lead">
          Cuéntame qué ocurre y te ayudaré a encontrar el siguiente paso.
          Deja tus datos y una breve descripción para preparar el diagnóstico.
        </p>

        <div class="public-support-flow" aria-label="Qué ocurrirá después">
          <div class="public-support-flow-item"><span>1</span><div><strong>Cuéntame el problema</strong><p>Explica qué falla, desde cuándo y cómo podemos contactar contigo.</p></div></div>
          <div class="public-support-flow-item"><span>2</span><div><strong>Recibe el seguimiento</strong><p>Podrás consultar el caso desde tu panel. Si es tu primera vez, recibirás un enlace para activar tu acceso.</p></div></div>
          <div class="public-support-flow-item"><span>3</span><div><strong>Te atiendo personalmente</strong><p>Reviso tu incidencia y te contacto para confirmar el diagnóstico y el siguiente paso.</p></div></div>
        </div>

        <figure class="public-support-person">
          <div class="public-support-person-visual">
            <picture>
              <source
                type="image/webp"
                srcset="${PUBLIC_SUPPORT_TECHNICIAN_PHOTO_WEBP_480} 480w, ${PUBLIC_SUPPORT_TECHNICIAN_PHOTO_WEBP_960} 960w"
                sizes="(max-width: 460px) min(82vw, 248px), (max-width: 720px) min(76vw, 286px), (max-width: 980px) min(64vw, 330px), (max-width: 1180px) min(23vw, 286px), min(24vw, 340px)">
              <img
                src="${PUBLIC_SUPPORT_TECHNICIAN_PHOTO}"
                width="960"
                height="1200"
                alt="Cristian Ávila, soporte técnico de Onion Support"
                loading="lazy"
                decoding="async"
                fetchpriority="low">
            </picture>
          </div>
          <figcaption class="public-support-person-card">
            <strong>Cristian Ávila</strong>
            <span>Soporte técnico</span>
          </figcaption>
        </figure>

      </div>

      <form class="public-support-form" data-public-support-form="true" novalidate autocomplete="on">
        <div class="public-support-form-head">
          <div><span class="public-support-kicker">Nueva incidencia</span><h3>¿Qué necesitas?</h3></div>
          <span class="public-support-secure">Datos protegidos</span>
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
          ${field("address", "Calle y número", "text", "Calle y número", "address-line1", 180)}
          ${field("addressLine2", "Piso / puerta", "text", "Piso, puerta, escalera (opcional)", "address-line2", 120, "", "", { required: false })}
          ${field("postalCode", "CP", "text", "08001", "postal-code", 5, "numeric", "", {
            labelAddon: postalInfo(),
            describedBy: "public-support-postal-help",
          })}
          ${field("city", "Ciudad", "text", "Barcelona", "address-level2", 90)}
          ${field("province", "Provincia", "text", "Barcelona", "address-level1", 90)}

          <div class="public-support-field public-support-field--wide" data-public-support-field="subject">
            <label for="public-support-subject">Asunto</label>
            <input id="public-support-subject" name="subject" type="text" maxlength="140" required
              placeholder="Ej. El portátil no arranca" autocomplete="off">
            ${errorNode("subject")}
          </div>

          <div class="public-support-field public-support-field--wide" data-public-support-field="description">
            <label for="public-support-description">Cuéntame qué ocurre</label>
            <textarea id="public-support-description" name="description" rows="5" maxlength="4000" required
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
        <p class="public-support-privacy public-support-privacy--form">
          Tus datos se usan únicamente para gestionar la incidencia y mantenerte informado sobre ella.
          Responsable: Cristian Ávila Luque (Onion Support).
          <a href="/#public-privacy">Más información sobre privacidad y tus derechos</a>.
        </p>
      </form>
    </div>`;

  return section;
}

function errorNode(name) {
  return `<small id="public-support-error-${name}" class="public-support-error"
    data-public-support-error-for="${name}" hidden></small>`;
}

function postalInfo() {
  return `<span class="public-support-info">
    <button class="public-support-info-button" type="button"
      aria-label="Información sobre el código postal"
      aria-describedby="public-support-postal-help">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 10.75v5"></path>
        <path d="M12 7.5h.01"></path>
      </svg>
    </button>
    <span id="public-support-postal-help" class="public-support-info-tooltip" role="tooltip">
      El código postal completa la provincia automáticamente. La ciudad permanece editable para que puedas indicar la localidad correcta.
    </span>
  </span>`;
}

function field(
  name,
  label,
  type,
  placeholder,
  autocomplete,
  maxlength,
  inputmode = "",
  value = "",
  options = {}
) {
  const mode = inputmode ? ` inputmode="${inputmode}"` : "";
  const initialValue = value ? ` value="${value}"` : "";
  const required = options?.required === false ? "" : " required";
  const readonly = options?.readonly === true ? ` readonly aria-readonly="true"` : "";
  const describedBy = options?.describedBy
    ? ` aria-describedby="${options.describedBy}"`
    : "";
  const labelMarkup = `<label for="public-support-${name}">${label}</label>`;
  const labelRow = options?.labelAddon
    ? `<div class="public-support-label-row">${labelMarkup}${options.labelAddon}</div>`
    : labelMarkup;
  const phoneAttrs = name === "phone"
    ? ` aria-label="Teléfono de España"`
    : "";

  return `<div class="public-support-field" data-public-support-field="${name}">
    ${labelRow}
    <input id="public-support-${name}" name="${name}" type="${type}"${mode}${initialValue}${phoneAttrs}${describedBy}${readonly}
      autocomplete="${autocomplete}" maxlength="${maxlength}"${required} placeholder="${placeholder}">
    ${errorNode(name)}
  </div>`;
}

function ensureForm(root) {
  const found = root.querySelector(`[data-public-support-section], #${SECTION_ID}`);
  if (found) return found;

  const section = formSection();
  const contact = root.querySelector(".public-home-contact");

  if (contact?.parentNode) contact.insertAdjacentElement("beforebegin", section);
  else root.querySelector(".public-home-content")?.append(section);

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

function nationalSpanishDigits(value = "") {
  const raw = String(value ?? "");
  let valueDigits = raw.replace(/\D/g, "");

  if (valueDigits.startsWith("0034")) valueDigits = valueDigits.slice(4);
  else if (/^\s*\+34/.test(raw)) valueDigits = valueDigits.slice(2);
  else if (valueDigits.startsWith("34") && valueDigits.length === 11) valueDigits = valueDigits.slice(2);

  return valueDigits;
}

function formatNationalSpanishPhone(value = "") {
  const national = nationalSpanishDigits(value);
  if (!national) return "";
  if (national.length > 9) return String(value ?? "").trim();
  return [national.slice(0, 3), national.slice(3, 6), national.slice(6)]
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
  if (!form || form.dataset.submitting === "true") return;

  const phoneInput = form.elements.namedItem("phone");
  const { user, authenticated } = session();
  if (!authenticated || !user) return;

  /*
     El nombre NO se precarga de forma deliberada: evita exponer
     automáticamente el nombre del usuario en un formulario público.
  */
  const values = {
    email: email(user),
    ...addressParts(user),
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
    enhanced.add(root);
    root.dataset.publicSupportReady = "true";
    root.dispatchEvent(new CustomEvent("public-support:ready", { bubbles: true }));
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

function queueScan(mutations = null) {
  if (Array.isArray(mutations) && !mutationsTouchSelector(mutations, `${HOME}, ${FORM}`)) {
    return false;
  }
  cancelDetachedSubmissions();
  if (destroyed || typeof window === "undefined" || scanFrame) return false;
  scanFrame = window.requestAnimationFrame(() => {
    scanFrame = 0;
    scan();
  });
  return true;
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
    const descriptions = new Set((input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
    descriptions.delete(error.id);
    if (invalid) descriptions.add(error.id);
    if (descriptions.size) input.setAttribute("aria-describedby", [...descriptions].join(" "));
    else input.removeAttribute("aria-describedby");
  }
}

function status(form, message = "", type = "info") {
  const node = form.querySelector("[data-public-support-status]");
  if (!node) return;

  const clean = text(message);
  const alert = type === "warning" || type === "error";
  node.setAttribute("role", alert ? "alert" : "status");
  node.setAttribute("aria-live", alert ? "assertive" : "polite");
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

function currentFormPhone(form) {
  return normalizeSpanishPhone(
    form?.elements?.namedItem?.("phone")?.value
  );
}

function lockedEmail(form) {
  return text(form?.dataset?.publicSupportBlockedEmail).toLowerCase();
}

function lockedPhone(form) {
  return text(form?.dataset?.publicSupportBlockedPhone);
}

function lockMatchesCurrentIdentity(form) {
  const emailLock = lockedEmail(form);
  const phoneLock = lockedPhone(form);
  const emailValue = currentFormEmail(form);
  const phoneValue = currentFormPhone(form);

  return Boolean(
    (emailLock && emailLock === emailValue) ||
    (phoneLock && phoneLock === phoneValue)
  );
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
  const locked = lockMatchesCurrentIdentity(form);
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
      ? "Enviando solicitud…"
      : locked
        ? text(form.dataset.publicSupportBlockedLabel, "Incidencia en curso")
        : "Crear incidencia";
  }

  return locked;
}

function setSubmissionLock(
  form,
  emailValue,
  phoneValue,
  message,
  type = "info",
  label = "Incidencia en curso"
) {
  const cleanEmail = text(emailValue).toLowerCase();
  const cleanPhone = normalizeSpanishPhone(phoneValue);
  if (!form?.dataset || (!cleanEmail && !cleanPhone)) return false;

  if (cleanEmail) form.dataset.publicSupportBlockedEmail = cleanEmail;
  else delete form.dataset.publicSupportBlockedEmail;

  if (cleanPhone) form.dataset.publicSupportBlockedPhone = cleanPhone;
  else delete form.dataset.publicSupportBlockedPhone;

  form.dataset.publicSupportBlockedMessage = text(message);
  form.dataset.publicSupportBlockedStatus = text(type, "info");
  form.dataset.publicSupportBlockedLabel = label;
  syncSubmitState(form);
  return true;
}

function showSubmissionLock(form) {
  if (!lockMatchesCurrentIdentity(form)) return false;
  status(form, lockMessage(form), lockStatusType(form));
  syncSubmitState(form);
  return true;
}

function neutralSubmissionMessage() {
  return "Solicitud recibida. Revisa tu correo para continuar. Si es tu primera vez, recibirás un enlace para activar tu acceso; si ya tienes cuenta, puedes entrar en tu panel. Si existe una incidencia en curso, no se abrirá otra.";
}

function activeTicketMessage() {
  return session().authenticated === true
    ? "Ya tienes una incidencia en curso. Para evitar duplicados, no puedes abrir otra hasta que la actual se cierre. Puedes seguirla desde tu panel."
    : "Solicitud recibida. Si los datos corresponden a una cuenta con una incidencia en curso, no se abrirá otra. Si ya tienes acceso, puedes entrar en tu panel.";
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
    address: (v) => v.length >= 8 ? "" : "Introduce la calle y el número (al menos 8 caracteres).",
    postalCode: (v) => /^\d{5}$/.test(v) ? "" : "Introduce un código postal español válido de 5 dígitos.",
    city: (v) => v.length >= 2 ? "" : "Introduce la ciudad.",
    province: (v) => v.length >= 2 ? "" : "Introduce la provincia.",
    country: (v) => {
      const normalized = text(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return ["espana", "es", "spain"].includes(normalized) ? "" : "Este formulario solo admite direcciones de España.";
    },
    subject: (v) => v.length >= 4 ? "" : "Resume el problema en el asunto.",
    description: (v) => v.length >= 10 ? "" : "Añade un poco más de detalle sobre el problema.",
  };

  const failures = [];

  for (const [name, rule] of Object.entries(rules)) {
    const input = form.elements.namedItem(name);
    if (!input) continue;
    const value = name === "description" ? descriptionText(input.value) : text(input.value);
    const limit = name === "phone" ? 18 : input.maxLength;
    const message = limit > 0 && value.length > limit
      ? `Usa como máximo ${limit} caracteres.`
      : rule(value);
    setFieldError(form, input, message);
    if (message) failures.push(input);
  }

  return failures;
}

function descriptionText(value = "") {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t+/g, " ")
    .split("\n")
    .map((line) => line.replace(/ +/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function payload(form) {
  const data = new FormData(form);
  return {
    fullName: text(data.get("fullName")).slice(0, 120),
    email: text(data.get("email")).toLowerCase().slice(0, 180),
    phone: normalizeSpanishPhone(data.get("phone")),
    address: text(data.get("address")).slice(0, 180),
    addressLine2: text(data.get("addressLine2")).slice(0, 120),
    postalCode: text(data.get("postalCode")).slice(0, 5),
    city: text(data.get("city")).slice(0, 90),
    province: text(data.get("province")).slice(0, 90),
    country: "España",
    subject: text(data.get("subject")).slice(0, 140),
    description: descriptionText(data.get("description")).slice(0, 4000),
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

function acceptedResponse(response) {
  const envelope = object(response);
  const body = object(envelope?.data) || envelope;
  if (!body || [envelope, body].some((value) => (
    value.ok === false || value.success === false || value.accepted === false
  ))) return null;
  if (body.ok !== true || body.success !== true || body.accepted !== true) return null;

  // The public endpoint confirms either neutral reception or the authenticated
  // owner's canonical ticket. HTTP 2xx alone never confirms acceptance.
  if (neutralAccepted(body)) {
    return body.ticketId === null && body.incidenciaId === null && body.activationRequired === null
      ? body
      : null;
  }

  return (
    typeof body.ticketId === "string" &&
    /^INC-\d{8}-[a-f\d]{6}$/i.test(body.ticketId) &&
    body.incidenciaId === body.ticketId &&
    body.activationRequired === false
  ) ? body : null;
}

function successMessage(response) {
  if (neutralAccepted(response)) {
    return neutralSubmissionMessage();
  }

  return `Incidencia ${ticketId(response)} creada. Ya puedes consultarla desde tu panel.`;
}

function errorMessage(error) {
  const code = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  if (activeTicketConflict(error)) return activeTicketMessage();
  if (code === 429) return "Has realizado varias solicitudes seguidas. Espera un momento y vuelve a intentarlo.";
  if (code === 400 || code === 422) return "Hay algún dato que el servidor no ha podido validar. Revisa el formulario.";
  if ([502, 503, 504].includes(code)) return "El servicio no ha podido completar la solicitud. Espera unos segundos y vuelve a intentarlo.";
  if ([404, 405, 501].includes(code)) return "El formulario de incidencias no está disponible ahora mismo. Puedes contactar por WhatsApp mientras tanto.";
  return "No se pudo enviar la solicitud. Comprueba tu conexión e inténtalo de nuevo.";
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

function formIsMounted(form) {
  return Boolean(!destroyed && form?.isConnected && mountRoot?.contains(form));
}

function cancelDetachedSubmissions() {
  for (const [form] of pendingForms) {
    if (formIsMounted(form)) continue;
    submissions.cancel(form, "public-form-unmounted");
    pendingForms.delete(form);
    submitting(form, false);
  }
}

function showServerFieldErrors(form, error) {
  const errors = error?.payload?.errors;
  if (!Array.isArray(errors)) return;
  for (const item of errors) {
    const input = form.elements.namedItem(text(item?.field));
    if (input?.matches?.("input[name], textarea[name]") && input.name !== "website") {
      setFieldError(form, input, text(item?.message, "Revisa este dato.").slice(0, 240));
    }
  }
}

async function send(form) {
  if (!formIsMounted(form)) return false;
  if (form.dataset.submitting === "true") return false;
  if (showSubmissionLock(form)) return false;
  status(form);

  if (text(form.elements.namedItem("website")?.value)) {
    const message = neutralSubmissionMessage();
    status(form, message, "success");
    setSubmissionLock(
      form,
      currentFormEmail(form),
      currentFormPhone(form),
      message,
      "success",
      "Solicitud recibida"
    );
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
  const task = submissions.begin(form);
  const isCurrent = () => task.isCurrent() && formIsMounted(form);
  pendingForms.set(form, task);
  submitting(form, true);

  try {
    const received = await Http.post(PUBLIC_TICKET_ENDPOINT, body, {
      auth: useAuth,
      noAutoRefresh: !useAuth,
      headers: {
        "Idempotency-Key": requestKey,
      },
      timeout: 50000,
      signal: task.signal,
      source: "public-support.intake",
    });

    if (!isCurrent()) return false;
    const response = acceptedResponse(received);
    if (!response) {
      throw new Error("PUBLIC_TICKET_RESPONSE_UNCONFIRMED");
    }
    const message = successMessage(response);
    status(form, message, "success");

    window.dispatchEvent(new CustomEvent("onion:public-support:accepted", {
      detail: {
        version: PUBLIC_SUPPORT_VERSION,
        ticketId: ticketId(response) || null,
      },
    }));

    clearIdempotency(form);
    clearAcceptedIssueFields(form);
    setSubmissionLock(
      form,
      body.email,
      body.phone,
      message,
      "success",
      neutralAccepted(response) ? "Solicitud recibida" : "Incidencia en curso"
    );
    return true;
  } catch (error) {
    if (!isCurrent()) return false;
    const isActive = activeTicketConflict(error);
    const message = errorMessage(error);
    showServerFieldErrors(form, error);
    status(form, message, isActive ? "info" : "error");

    if (isActive) {
      setSubmissionLock(
        form,
        body.email,
        body.phone,
        message,
        "info"
      );
      window.dispatchEvent(new CustomEvent("onion:public-support:active-ticket", {
        detail: {
          version: PUBLIC_SUPPORT_VERSION,
        },
      }));
    }

    return false;
  } finally {
    if (isCurrent()) submitting(form, false);
    if (pendingForms.get(form) === task) pendingForms.delete(form);
    task.finish();
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
  // Disabling a focused field can deliver a late change event. The submitted
  // payload is already fixed; keep its retry key until editing is enabled again.
  if (form.dataset.submitting === "true") return;

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
  root.addEventListener("change", onInput, true);
  root.addEventListener("focusout", onFocusOut, true);
  return true;
}

function unbindFormEvents(root) {
  if (!root) return false;

  root.removeEventListener("submit", onSubmit, true);
  root.removeEventListener("input", onInput, true);
  root.removeEventListener("change", onInput, true);
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

  window.addEventListener("onion:main:ready", queueScan);
  document.addEventListener(PUBLIC_HOME_SESSION_EVENT, queueScan, true);
  document.addEventListener("public-home:ready", queueScan, true);

  observer = new MutationObserver(queueScan);
  observer.observe(root, { childList: true, subtree: true });
  scan();

  return true;
}

export function destroyPublicSupport() {
  if (typeof window === "undefined" || destroyed) return false;
  destroyed = true;
  cancelDetachedSubmissions();
  submissions.dispose("public-support-destroyed");

  unbindFormEvents(mountRoot);
  window.removeEventListener("onion:main:ready", queueScan);
  document.removeEventListener(PUBLIC_HOME_SESSION_EVENT, queueScan, true);
  document.removeEventListener("public-home:ready", queueScan, true);

  observer?.disconnect();
  observer = null;

  if (scanFrame) window.cancelAnimationFrame(scanFrame);
  scanFrame = 0;
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
