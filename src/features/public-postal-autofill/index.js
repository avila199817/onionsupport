/* =========================================================
   Onion Support - Public Postal Autofill
   Archivo: /src/features/public-postal-autofill/index.js

   Responsabilidad:
   - ocultar País en el formulario público porque el intake solo admite España;
   - mantener country="España" como responsabilidad del payload canónico;
   - normalizar el CP a 5 dígitos;
   - autocompletar la provincia a partir del prefijo postal oficial 01..52;
   - no inventar municipio: Ciudad permanece editable;
   - no usar APIs, red, polling ni observers persistentes.
========================================================= */

import "../public-support/index.js";

export const PUBLIC_POSTAL_AUTOFILL_VERSION =
  "public-postal-autofill.v1-local-province";

const VIEW_ROOT_SELECTOR = "#view-container, [data-router-view='true']";
const FORM = "[data-public-support-form='true']";
const POSTAL_NAME = "postalCode";
const PROVINCE_NAME = "province";
const COUNTRY_NAME = "country";

const PROVINCES = Object.freeze({
  "01": "Álava",
  "02": "Albacete",
  "03": "Alicante",
  "04": "Almería",
  "05": "Ávila",
  "06": "Badajoz",
  "07": "Illes Balears",
  "08": "Barcelona",
  "09": "Burgos",
  "10": "Cáceres",
  "11": "Cádiz",
  "12": "Castellón",
  "13": "Ciudad Real",
  "14": "Córdoba",
  "15": "A Coruña",
  "16": "Cuenca",
  "17": "Girona",
  "18": "Granada",
  "19": "Guadalajara",
  "20": "Gipuzkoa",
  "21": "Huelva",
  "22": "Huesca",
  "23": "Jaén",
  "24": "León",
  "25": "Lleida",
  "26": "La Rioja",
  "27": "Lugo",
  "28": "Madrid",
  "29": "Málaga",
  "30": "Murcia",
  "31": "Navarra",
  "32": "Ourense",
  "33": "Asturias",
  "34": "Palencia",
  "35": "Las Palmas",
  "36": "Pontevedra",
  "37": "Salamanca",
  "38": "Santa Cruz de Tenerife",
  "39": "Cantabria",
  "40": "Segovia",
  "41": "Sevilla",
  "42": "Soria",
  "43": "Tarragona",
  "44": "Teruel",
  "45": "Toledo",
  "46": "Valencia",
  "47": "Valladolid",
  "48": "Bizkaia",
  "49": "Zamora",
  "50": "Zaragoza",
  "51": "Ceuta",
  "52": "Melilla",
});

let mountRoot = null;
let observer = null;
let installed = false;
let destroyed = false;

function postalDigits(value = "") {
  return String(value ?? "").replace(/\D/g, "").slice(0, 5);
}

function provinceForPostal(value = "") {
  const digits = postalDigits(value);
  return digits.length >= 2 ? PROVINCES[digits.slice(0, 2)] || "" : "";
}

function clearProvinceAutofill(input = null) {
  if (!input?.dataset) return false;
  delete input.dataset.publicPostalAutofill;
  delete input.dataset.publicPostalCode;
  return true;
}

function syncProvince(form = null) {
  const postal = form?.elements?.namedItem?.(POSTAL_NAME);
  const province = form?.elements?.namedItem?.(PROVINCE_NAME);
  if (!postal || !province) return false;

  const digits = postalDigits(postal.value);
  if (postal.value !== digits) postal.value = digits;

  const next = provinceForPostal(digits);
  const wasAutofilled = province.dataset.publicPostalAutofill === "true";
  const previousPostal = province.dataset.publicPostalCode || "";

  if (!next) {
    if (wasAutofilled && previousPostal !== digits) {
      province.value = "";
      clearProvinceAutofill(province);
    }
    return false;
  }

  if (province.value && !wasAutofilled) return false;

  province.value = next;
  province.dataset.publicPostalAutofill = "true";
  province.dataset.publicPostalCode = digits;
  return true;
}

function removeCountryField(form = null) {
  const input = form?.elements?.namedItem?.(COUNTRY_NAME);
  if (!input) return false;

  const field = input.closest?.(".public-support-field");
  if (field) field.remove();
  else input.remove?.();
  return true;
}

function enhanceForm(form = null) {
  if (!form || form.dataset.publicPostalAutofillReady === "true") return Boolean(form);

  form.dataset.publicPostalAutofillReady = "true";
  removeCountryField(form);

  const postal = form.elements.namedItem(POSTAL_NAME);
  if (postal) {
    postal.inputMode = "numeric";
    postal.autocomplete = "postal-code";
    postal.maxLength = 5;
    postal.pattern = "[0-9]{5}";
    postal.setAttribute("aria-label", "Código postal de España, 5 dígitos");
  }

  const province = form.elements.namedItem(PROVINCE_NAME);
  if (province) province.autocomplete = "address-level1";

  syncProvince(form);
  return true;
}

function scan() {
  if (destroyed || typeof document === "undefined") return false;

  const root = mountRoot || document;
  const forms = root.querySelectorAll?.(FORM) || [];
  let found = false;

  forms.forEach((form) => {
    found = enhanceForm(form) || found;
  });

  if (found) {
    observer?.disconnect();
    observer = null;
  }

  return found;
}

function armOneShotObserver() {
  if (
    destroyed ||
    observer ||
    !mountRoot ||
    typeof MutationObserver === "undefined"
  ) {
    return false;
  }

  observer = new MutationObserver(() => {
    scan();
  });
  observer.observe(mountRoot, { childList: true, subtree: true });
  return true;
}

function ensureReady() {
  if (scan()) return true;
  armOneShotObserver();
  return false;
}

function onInput(event) {
  const input = event?.target;
  const form = input?.closest?.(FORM);
  if (!form || !input?.name) return;

  if (input.name === POSTAL_NAME) {
    const digits = postalDigits(input.value);
    if (input.value !== digits) input.value = digits;
    syncProvince(form);
    return;
  }

  if (input.name === PROVINCE_NAME) {
    clearProvinceAutofill(input);
  }
}

function onHomeReady() {
  ensureReady();
}

function install() {
  if (
    installed ||
    destroyed ||
    typeof window === "undefined" ||
    typeof document === "undefined"
  ) {
    return false;
  }

  mountRoot = document.querySelector(VIEW_ROOT_SELECTOR);
  if (!mountRoot) return false;

  installed = true;
  mountRoot.addEventListener("input", onInput, true);
  window.addEventListener("onion:main:ready", onHomeReady);
  document.addEventListener("public-home:ready", onHomeReady, true);
  ensureReady();
  return true;
}

export function destroyPublicPostalAutofill() {
  if (!installed || destroyed) return false;
  destroyed = true;

  mountRoot?.removeEventListener("input", onInput, true);
  window.removeEventListener("onion:main:ready", onHomeReady);
  document.removeEventListener("public-home:ready", onHomeReady, true);

  observer?.disconnect();
  observer = null;
  mountRoot = null;
  installed = false;
  return true;
}

export function getPublicPostalAutofillSnapshot() {
  return Object.freeze({
    version: PUBLIC_POSTAL_AUTOFILL_VERSION,
    installed,
    observerActive: Boolean(observer),
    formReady: Boolean(
      mountRoot?.querySelector?.(`${FORM}[data-public-postal-autofill-ready='true']`)
    ),
    networkDependencies: 0,
  });
}

if (typeof window !== "undefined") install();

export default Object.freeze({
  version: PUBLIC_POSTAL_AUTOFILL_VERSION,
  scan,
  destroy: destroyPublicPostalAutofill,
  getSnapshot: getPublicPostalAutofillSnapshot,
});
