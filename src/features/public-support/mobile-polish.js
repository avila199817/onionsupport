/* =========================================================
   Onion Support - Public Home Mobile Polish
   Archivo: /src/features/public-support/mobile-polish.js

   Responsabilidades visuales:
   - acceso de cliente también en el top bar móvil;
   - nombre abreviado en superficies públicas;
   - protege el nombre completo del campo visible autenticado;
   - deja intacto el valor completo justo antes del submit.
========================================================= */

export const PUBLIC_SUPPORT_MOBILE_POLISH_VERSION = "public-support.mobile-polish.v1";

const HOME = "[data-public-home]";
const FORM = "[data-public-support-form]";
const FULL_NAME = '[name="fullName"]';
const TOPBAR = "[data-public-support-topbar-account]";

let observer = null;
let destroyed = false;

const clean = (value = "") =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function firstLetter(value = "") {
  return Array.from(clean(value))[0]?.toLocaleUpperCase("es-ES") || "";
}

function shortName(value = "") {
  const parts = clean(value).split(" ").filter(Boolean);
  if (parts.length < 2) return parts[0] || "";

  const initial = firstLetter(parts[1]);
  return initial ? `${parts[0]} ${initial}.` : parts[0];
}

function ensureTopbarAccount(root) {
  if (!root || root.querySelector(TOPBAR)) return root?.querySelector(TOPBAR) || null;

  const navInner = root.querySelector(".public-home-nav-inner");
  const toggle = navInner?.querySelector("[data-public-home-nav-toggle]");
  if (!navInner || !toggle) return null;

  const link = document.createElement("a");
  link.className = "public-home-topbar-account";
  link.href = "/login";
  link.dataset.spa = "true";
  link.dataset.routerLink = "true";
  link.dataset.route = "/login";
  link.dataset.href = "/login";
  link.dataset.publicHomeLogin = "true";
  link.dataset.publicSupportTopbarAccount = "true";
  link.dataset.publicSupportFallback = "Panel";
  link.setAttribute("aria-label", "Abrir panel cliente");
  link.textContent = "Panel";

  navInner.insertBefore(link, toggle);
  return link;
}

function abbreviateIdentity(root) {
  root.querySelectorAll("[data-public-home-login] .public-support-account-name").forEach((node) => {
    const current = clean(node.textContent);
    if (!current) return;

    const source = clean(node.dataset.publicSupportFullDisplayName || current);
    const compact = shortName(source);
    if (!compact) return;

    node.dataset.publicSupportFullDisplayName = source;
    if (node.textContent !== compact) node.textContent = compact;
  });
}

function authenticated(root) {
  return root?.dataset.publicSupportAuthenticated === "true";
}

function maskAuthenticatedFullName(root) {
  if (!authenticated(root)) return;

  const form = root.querySelector(FORM);
  const input = form?.querySelector(FULL_NAME);
  if (!input || input.dataset.publicSupportNameEdited === "true") return;

  const visible = clean(input.value);
  const stored = clean(input.dataset.publicSupportFullName);
  const full = stored || visible;
  if (!full || full.split(" ").filter(Boolean).length < 2) return;

  const compact = shortName(full);
  if (!compact) return;

  input.dataset.publicSupportFullName = full;
  input.dataset.publicSupportMaskedName = "true";
  input.autocomplete = "off";

  if (input.value !== compact) input.value = compact;
}

function restoreFullNameForSubmit(form) {
  const root = form?.closest(HOME);
  if (!root || !authenticated(root)) return null;

  const input = form.querySelector(FULL_NAME);
  const full = clean(input?.dataset.publicSupportFullName);
  if (!input || !full || input.dataset.publicSupportNameEdited === "true") return null;

  input.value = full;
  return { input, full };
}

function remaskAfterSubmit(state) {
  if (!state?.input || !state.input.isConnected) return;
  if (state.input.dataset.publicSupportNameEdited === "true") return;

  state.input.dataset.publicSupportFullName = state.full;
  state.input.dataset.publicSupportMaskedName = "true";
  state.input.value = shortName(state.full);
}

function polish(root) {
  if (!root || destroyed) return;
  ensureTopbarAccount(root);
  abbreviateIdentity(root);
  maskAuthenticatedFullName(root);
}

function scan() {
  if (destroyed) return;
  document.querySelectorAll(HOME).forEach(polish);
}

function onInput(event) {
  const input = event.target;
  if (!input?.matches?.(`${FORM} ${FULL_NAME}`)) return;
  if (!input.dataset.publicSupportFullName) return;

  const compact = shortName(input.dataset.publicSupportFullName);
  if (clean(input.value) === compact) return;

  input.dataset.publicSupportNameEdited = "true";
  delete input.dataset.publicSupportMaskedName;
  delete input.dataset.publicSupportFullName;
  input.autocomplete = "name";
}

function onSubmit(event) {
  const form = event.target?.closest?.(FORM);
  if (!form) return;

  const state = restoreFullNameForSubmit(form);
  if (!state) return;

  window.setTimeout(() => remaskAfterSubmit(state), 0);
}

function onCreated() {
  window.setTimeout(scan, 0);
}

function install() {
  if (destroyed || typeof document === "undefined") return;

  document.addEventListener("input", onInput, true);
  document.addEventListener("submit", onSubmit, true);
  window.addEventListener("onion:public-support:created", onCreated);

  observer = new MutationObserver(scan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "data-public-support-authenticated",
      "data-public-support-account",
      "data-public-support-identity-key",
    ],
  });

  scan();
}

export function destroyPublicSupportMobilePolish() {
  if (destroyed || typeof document === "undefined") return false;
  destroyed = true;

  document.removeEventListener("input", onInput, true);
  document.removeEventListener("submit", onSubmit, true);
  window.removeEventListener("onion:public-support:created", onCreated);

  observer?.disconnect();
  observer = null;
  return true;
}

if (typeof window !== "undefined") install();

export default Object.freeze({
  version: PUBLIC_SUPPORT_MOBILE_POLISH_VERSION,
  scan,
  destroy: destroyPublicSupportMobilePolish,
});
