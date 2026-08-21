/* =========================================================
   Onion Support - Structured Public Support Address
   Archivo: /src/features/public-support-structured/index.js

   Adaptador compatible sobre public-support:
   - mantiene intacto el flujo público existente;
   - añade dirección estructurada para nuevas identidades públicas;
   - valida CP/ciudad/provincia en cliente;
   - enriquece únicamente POST /api/tickets/public;
   - preserva idempotencia, auth opcional y semántica anti-enumeración.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";
import "../public-support/index.js";

export const PUBLIC_SUPPORT_STRUCTURED_ADDRESS_VERSION =
  "public-support.structured-address.v1";

const FORM = "[data-public-support-form]";
const VIEW_ROOT_SELECTOR = "#view-container, [data-router-view='true']";
const PUBLIC_TICKET_ENDPOINT = "/api/tickets/public";

let observer = null;
let installed = false;
let originalPost = null;

const text = (value = "", fallback = "") =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;

function first(...values) {
  return values.find((value) =>
    value !== undefined &&
    value !== null &&
    !(typeof value === "string" && !value.trim())
  ) ?? null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function currentUser() {
  try {
    const state = object(AppCore?.getState?.()) || object(AppCore?.state) || {};
    return object(state.currentUser) || object(state.user) || null;
  } catch {
    return object(AppCore?.state?.currentUser) || object(AppCore?.state?.user) || null;
  }
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
    address: text(first(
      current.street,
      current.line1,
      current.calle,
      user?.calle,
      ""
    )),
    addressLine2: text(first(
      current.line2,
      current.linea2,
      user?.linea2,
      ""
    )),
    postalCode: text(first(
      current.postalCode,
      current.zip,
      current.cp,
      user?.postalCode,
      user?.cp,
      ""
    )),
    city: text(first(
      current.city,
      current.locality,
      current.localidad,
      current.ciudad,
      user?.city,
      user?.ciudad,
      ""
    )),
    province: text(first(
      current.region,
      current.province,
      current.provincia,
      user?.province,
      user?.provincia,
      ""
    )),
    country: text(first(
      current.country,
      current.pais,
      user?.country,
      user?.pais,
      "España"
    ), "España"),
  };
}

function errorNode(name) {
  const node = document.createElement("small");
  node.id = `public-support-error-${name}`;
  node.className = "public-support-error";
  node.dataset.publicSupportErrorFor = name;
  node.hidden = true;
  return node;
}

function createField({
  name,
  label,
  placeholder,
  autocomplete,
  maxlength,
  inputmode = "",
  required = true,
  readonly = false,
  value = "",
}) {
  const wrap = document.createElement("div");
  wrap.className = "public-support-field";
  wrap.dataset.publicSupportStructuredField = name;

  const labelNode = document.createElement("label");
  labelNode.htmlFor = `public-support-${name}`;
  labelNode.textContent = label;

  const input = document.createElement("input");
  input.id = `public-support-${name}`;
  input.name = name;
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = autocomplete;
  input.maxLength = maxlength;
  input.required = required;
  input.readOnly = readonly;
  input.setAttribute("aria-invalid", "false");

  if (inputmode) input.inputMode = inputmode;
  if (value) input.value = value;
  if (readonly) input.setAttribute("aria-readonly", "true");

  wrap.append(labelNode, input, errorNode(name));
  return wrap;
}

function setFieldError(form, name, message = "") {
  const input = form?.elements?.namedItem?.(name);
  if (!input) return false;

  const error = form.querySelector(`[data-public-support-error-for="${name}"]`);
  const invalid = Boolean(message);

  input.classList.toggle("is-invalid", invalid);
  input.setAttribute("aria-invalid", invalid ? "true" : "false");

  if (error) {
    error.textContent = message;
    error.hidden = !invalid;

    if (invalid) input.setAttribute("aria-describedby", error.id);
    else if (input.getAttribute("aria-describedby") === error.id) {
      input.removeAttribute("aria-describedby");
    }
  }

  return invalid;
}

function normalizeCountry(value = "") {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function prefillStructured(form) {
  const user = currentUser();
  if (!user) return false;

  const parts = addressParts(user);
  const source = object(first(user?.address, user?.direccion, user?.profile?.address, null));

  for (const [name, value] of Object.entries(parts)) {
    const input = form.elements.namedItem(name);
    if (!input || !value) continue;

    // Si el usuario ya tiene dirección estructurada, sustituimos el string combinado
    // que el módulo legacy pudo haber precargado en address por la calle real.
    if (name === "address" && source) {
      input.value = value;
      continue;
    }

    if (!text(input.value)) input.value = value;
  }

  return true;
}

function ensureStructuredFields(form) {
  if (!form) return false;

  const addressInput = form.elements.namedItem("address");
  const addressField = addressInput?.closest?.(".public-support-field");
  const grid = addressField?.parentElement;

  if (!addressInput || !addressField || !grid) return false;

  const label = addressField.querySelector(`label[for="${addressInput.id}"]`);
  if (label) label.textContent = "Calle y número";

  addressInput.placeholder = "Calle y número";
  addressInput.autocomplete = "address-line1";
  addressInput.maxLength = 180;

  if (form.dataset.publicSupportStructuredAddress === "true") {
    return true;
  }

  const definitions = [
    {
      name: "addressLine2",
      label: "Piso / puerta",
      placeholder: "Piso, puerta, escalera (opcional)",
      autocomplete: "address-line2",
      maxlength: 120,
      required: false,
    },
    {
      name: "postalCode",
      label: "Código postal",
      placeholder: "08001",
      autocomplete: "postal-code",
      maxlength: 5,
      inputmode: "numeric",
    },
    {
      name: "city",
      label: "Ciudad",
      placeholder: "Barcelona",
      autocomplete: "address-level2",
      maxlength: 90,
    },
    {
      name: "province",
      label: "Provincia",
      placeholder: "Barcelona",
      autocomplete: "address-level1",
      maxlength: 90,
    },
    {
      name: "country",
      label: "País",
      placeholder: "España",
      autocomplete: "country-name",
      maxlength: 90,
      readonly: true,
      value: "España",
    },
  ];

  let cursor = addressField;

  for (const definition of definitions) {
    if (form.elements.namedItem(definition.name)) continue;
    const node = createField(definition);
    cursor.insertAdjacentElement("afterend", node);
    cursor = node;
  }

  form.dataset.publicSupportStructuredAddress = "true";
  prefillStructured(form);
  return true;
}

function structuredValues(form) {
  return {
    addressLine2: text(form?.elements?.namedItem?.("addressLine2")?.value).slice(0, 120),
    postalCode: text(form?.elements?.namedItem?.("postalCode")?.value).slice(0, 5),
    city: text(form?.elements?.namedItem?.("city")?.value).slice(0, 90),
    province: text(form?.elements?.namedItem?.("province")?.value).slice(0, 90),
    country: "España",
  };
}

function validateStructured(form) {
  ensureStructuredFields(form);

  const failures = [];
  const postalCode = text(form?.elements?.namedItem?.("postalCode")?.value);
  const city = text(form?.elements?.namedItem?.("city")?.value);
  const province = text(form?.elements?.namedItem?.("province")?.value);
  const country = text(form?.elements?.namedItem?.("country")?.value, "España");

  const checks = [
    [
      "postalCode",
      /^\d{5}$/.test(postalCode)
        ? ""
        : "Introduce un código postal español válido de 5 dígitos.",
    ],
    [
      "city",
      city.length >= 2 ? "" : "Introduce la ciudad.",
    ],
    [
      "province",
      province.length >= 2 ? "" : "Introduce la provincia.",
    ],
    [
      "country",
      ["espana", "es", "spain"].includes(normalizeCountry(country))
        ? ""
        : "Este formulario solo admite direcciones de España.",
    ],
  ];

  for (const [name, message] of checks) {
    setFieldError(form, name, message);
    if (message) failures.push(form.elements.namedItem(name));
  }

  return failures;
}

function setFormStatus(form, message = "") {
  const node = form?.querySelector?.("[data-public-support-status]");
  if (!node) return;

  node.textContent = text(message);
  node.hidden = !text(message);
  node.dataset.status = message ? "error" : "";
}

function onSubmitCapture(event) {
  const form = event.target?.closest?.(FORM);
  if (!form) return;

  const failures = validateStructured(form);
  if (!failures.length) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  setFormStatus(form, "Revisa los datos de dirección antes de enviar.");
  failures[0]?.focus?.();
}

function installHttpAdapter() {
  if (originalPost) return true;
  if (!Http || typeof Http.post !== "function") return false;

  originalPost = Http.post;

  Http.post = function structuredPublicSupportPost(endpoint, body, options) {
    if (String(endpoint || "") !== PUBLIC_TICKET_ENDPOINT) {
      return originalPost.call(this, endpoint, body, options);
    }

    const form = document.querySelector(FORM);
    if (!form) return originalPost.call(this, endpoint, body, options);

    ensureStructuredFields(form);

    const enrichedBody = body && typeof body === "object" && !Array.isArray(body)
      ? {
          ...body,
          ...structuredValues(form),
        }
      : body;

    return originalPost.call(this, endpoint, enrichedBody, options);
  };

  return true;
}

function scan() {
  if (typeof document === "undefined") return false;

  let found = false;
  document.querySelectorAll(FORM).forEach((form) => {
    found = ensureStructuredFields(form) || found;
  });

  return found;
}

function install() {
  if (installed || typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  installed = true;
  installHttpAdapter();

  // document capture ocurre antes del listener capture que public-support instala
  // sobre el Router view, permitiendo validar los campos nuevos sin alterar su módulo.
  document.addEventListener("submit", onSubmitCapture, true);
  window.addEventListener("onion:main:ready", scan);
  document.addEventListener("public-home:ready", scan, true);

  const root = document.querySelector(VIEW_ROOT_SELECTOR);
  if (root && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(scan);
    observer.observe(root, { childList: true, subtree: true });
  }

  scan();
  return true;
}

export function destroyPublicSupportStructuredAddress() {
  if (!installed || typeof document === "undefined") return false;

  document.removeEventListener("submit", onSubmitCapture, true);
  window.removeEventListener("onion:main:ready", scan);
  document.removeEventListener("public-home:ready", scan, true);

  observer?.disconnect();
  observer = null;

  if (originalPost && Http?.post) {
    Http.post = originalPost;
  }

  originalPost = null;
  installed = false;
  return true;
}

export function getPublicSupportStructuredAddressSnapshot() {
  return Object.freeze({
    version: PUBLIC_SUPPORT_STRUCTURED_ADDRESS_VERSION,
    installed,
    httpAdapter: Boolean(originalPost),
    mountedForms: typeof document === "undefined"
      ? 0
      : document.querySelectorAll(`${FORM}[data-public-support-structured-address="true"]`).length,
  });
}

if (typeof window !== "undefined") install();

export default Object.freeze({
  version: PUBLIC_SUPPORT_STRUCTURED_ADDRESS_VERSION,
  scan,
  destroy: destroyPublicSupportStructuredAddress,
  getSnapshot: getPublicSupportStructuredAddressSnapshot,
});
