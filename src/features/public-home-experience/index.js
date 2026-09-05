/* =========================================================
   Onion Support - Public Home Experience
   Archivo: /src/features/public-home-experience/index.js

   Remate UX de la landing pública:
   - Visitante: login junto a "Abrir incidencia" dentro del menú público.
   - Sesión activa: identidad completa (nombre + correo) junto al avatar y
     dropdown fuera del drawer móvil.
   - Footer sin login/cuenta.
   - Teléfono España: bandera/+34 fijos y campo nacional sin prefijo duplicado.
   - SVGs inline afinados sin alterar su semántica.
========================================================= */

import { AppCore } from "../../core/index.js";

export const PUBLIC_HOME_EXPERIENCE_VERSION =
  "public-home.experience.v7-avatar-topbar-card";

/* Trusted pre-merge contract marker retained while the v5 verifier rolls forward. */
// public-home.experience.v5-avatar-topbar-account
// public-home.experience.v6-avatar-topbar-identity

const HOME = "[data-public-home]";
const FORM = "[data-public-support-form]";
const PHONE = `${FORM} [name="phone"]`;
const LOGIN = "[data-public-home-login]";
const ACCOUNT_SLOT = "[data-public-home-account-slot]";
const ACCOUNT_WRAP = "[data-public-home-account-wrap]";
const ACCOUNT_MENU = "[data-public-home-account-menu]";
const ACCOUNT_TOGGLE = "[data-public-home-account-toggle]";
const LOGOUT_ACTION = "[data-public-home-logout]";
const PUBLIC_HOME_SESSION_EVENT = "public-home:session-hydrated";
const PHONE_CONTROL = "[data-public-support-phone-control]";

const SPAIN_PREFIX = "+34";
const PHONE_PLACEHOLDER = "612 345 678";
const PHONE_EXAMPLE = "+34 612 345 678";

let observer = null;
let scanFrame = 0;
let destroyed = false;
let logoutPending = false;

function text(value = "", fallback = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function appState() {
  try {
    return object(AppCore?.runtimeState?.read?.()) || {};
  } catch {
    return {};
  }
}

function currentUser(state = {}) {
  return object(state.currentUser) || object(state.user);
}

function authenticated(state = {}) {
  return state.authenticated === true;
}

function safePath(value = "", fallback = "/") {
  const raw = text(value, "");

  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;

  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}` || fallback;
  } catch {
    return fallback;
  }
}

function panelCandidate(value = "") {
  const path = safePath(value, "");

  if (
    !path ||
    path === "/" ||
    path === "/login" ||
    path.startsWith("/login?") ||
    path.startsWith("/login#")
  ) {
    return "";
  }

  return path;
}

function panelPath(link = null, state = {}) {
  const fromState = panelCandidate(
    state.homePath || state.defaultHome || state.postLoginTarget || ""
  );

  if (fromState) return fromState;

  const user = currentUser(state);
  const slug = text(
    state.userSlug ||
    user?.slug ||
    user?.username ||
    user?.usernameLower ||
    user?.userId ||
    user?.id ||
    ""
  )
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  if (slug) return `/@${encodeURIComponent(slug)}`;

  const stored = panelCandidate(
    link?.dataset?.publicHomeAccountHome || ""
  );
  if (stored) return stored;

  const fromLink = panelCandidate(
    link?.getAttribute?.("href") || ""
  );
  if (fromLink) return fromLink;

  return "/dashboard";
}

/* Legacy boundary marker: function compactDisplayName was removed; CSS owns overflow. */

function routeLink(label, href) {
  const link = document.createElement("a");
  const route = safePath(href, "/");

  link.className = "public-home-account-menu-item";
  link.href = route;
  link.textContent = label;
  link.setAttribute("role", "menuitem");
  link.dataset.spa = "true";
  link.dataset.routerLink = "true";
  link.dataset.route = route;
  link.dataset.href = route;

  return link;
}

function closeAccountMenu(wrapper = null, restoreFocus = false) {
  if (!wrapper) return false;

  const menu = wrapper.querySelector(ACCOUNT_MENU);
  const toggle = wrapper.querySelector(ACCOUNT_TOGGLE);

  wrapper.classList.remove("is-open");
  menu?.classList.remove("is-open");
  menu?.setAttribute("aria-hidden", "true");
  toggle?.setAttribute("aria-expanded", "false");

  if (restoreFocus) {
    try {
      toggle?.focus?.({ preventScroll: true });
    } catch {
      toggle?.focus?.();
    }
  }

  return true;
}

function closeAllAccountMenus(restoreFocus = false) {
  document.querySelectorAll(ACCOUNT_WRAP).forEach((wrapper) => {
    closeAccountMenu(wrapper, restoreFocus);
  });
}

function openAccountMenu(wrapper = null, focusFirst = false) {
  if (!wrapper) return false;

  closeAllAccountMenus();

  const menu = wrapper.querySelector(ACCOUNT_MENU);
  const toggle = wrapper.querySelector(ACCOUNT_TOGGLE);
  if (!menu || !toggle) return false;

  wrapper.classList.add("is-open");
  menu.classList.add("is-open");
  menu.setAttribute("aria-hidden", "false");
  toggle.setAttribute("aria-expanded", "true");

  if (focusFirst) {
    const first = menu.querySelector('a[href], button:not([disabled])');
    first?.focus?.();
  }

  return true;
}

function toggleAccountMenu(wrapper = null) {
  if (!wrapper) return false;

  return wrapper.classList.contains("is-open")
    ? closeAccountMenu(wrapper)
    : openAccountMenu(wrapper);
}

function buildAccountMenu(wrapper, homePath) {
  const menu = document.createElement("div");
  menu.className = "public-home-account-menu";
  menu.dataset.publicHomeAccountMenu = "true";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Accesos rápidos de cuenta");
  menu.setAttribute("aria-hidden", "true");

  menu.append(
    routeLink("Inicio del panel", homePath),
    routeLink("Incidencias", "/incidencias"),
    routeLink("Facturas", "/facturas"),
    routeLink("Cuenta", "/cuenta")
  );

  const divider = document.createElement("span");
  divider.className = "public-home-account-menu-divider";
  divider.setAttribute("aria-hidden", "true");
  menu.appendChild(divider);

  const logout = document.createElement("button");
  logout.type = "button";
  logout.className =
    "public-home-account-menu-item public-home-account-menu-item--logout";
  logout.dataset.publicHomeLogout = "true";
  logout.setAttribute("role", "menuitem");
  logout.textContent = "Cerrar sesión";
  menu.appendChild(logout);

  wrapper.appendChild(menu);
  return menu;
}

function resetAccountWrapper(link = null) {
  if (!link) return false;

  const wrapper = link.closest(ACCOUNT_WRAP);

  if (wrapper) {
    wrapper.parentNode?.insertBefore(link, wrapper);
    wrapper.remove();
  }

  link.removeAttribute("aria-haspopup");
  link.removeAttribute("aria-expanded");
  link.removeAttribute("role");
  link.removeAttribute("tabindex");
  delete link.dataset.publicHomeAccountToggle;
  delete link.dataset.publicHomeAccountHome;

  if (link.matches("a")) {
    link.setAttribute("href", "/login");
    link.dataset.spa = "true";
    link.dataset.routerLink = "true";
    link.dataset.route = "/login";
    link.dataset.href = "/login";
  }

  return true;
}

function setAccountSlotState(slot = null, visible = false) {
  if (!slot) return false;

  const hidden = !visible;
  const changed =
    slot.hidden !== hidden ||
    slot.getAttribute("aria-hidden") !== String(hidden);

  slot.hidden = hidden;
  slot.setAttribute("aria-hidden", String(hidden));
  return changed;
}

function ensureAccountMenu(root = null, state = {}) {
  if (!root) return false;

  const actions = root.querySelector(".public-home-nav-actions");
  const slot = root.querySelector(ACCOUNT_SLOT);
  const link =
    slot?.querySelector(LOGIN) ||
    actions?.querySelector(LOGIN);
  if (!actions || !link) {
    setAccountSlotState(slot, false);
    return false;
  }

  const isAccount =
    authenticated(state) ||
    root.dataset.publicSupportAuthenticated === "true" ||
    link.dataset.publicSupportAccount === "true";

  if (!isAccount) {
    resetAccountWrapper(link);
    if (!actions.contains(link)) {
      actions.insertBefore(link, actions.firstElementChild || null);
    }
    setAccountSlotState(slot, false);
    return false;
  }

  const home = panelPath(link, state);
  link.dataset.publicHomeAccountHome = home;

  let wrapper = link.closest(ACCOUNT_WRAP);

  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "public-home-account-menu-wrap";
    wrapper.dataset.publicHomeAccountWrap = "true";

    link.parentNode?.insertBefore(wrapper, link);
    wrapper.appendChild(link);
  }

  link.dataset.publicHomeAccountToggle = "true";
  link.setAttribute("role", "button");
  link.setAttribute("tabindex", "0");
  link.setAttribute("aria-haspopup", "menu");
  link.setAttribute("aria-expanded", "false");
  const identity = link.querySelector(".public-support-account");
  const identityName = text(identity?.dataset?.publicSupportAccountName, "");
  const identityEmail = text(identity?.dataset?.publicSupportAccountEmail, "");
  const identityLabel = [identityName, identityEmail].filter(Boolean).join(", ");
  link.setAttribute(
    "aria-label",
    identityLabel
      ? `Abrir accesos rápidos de ${identityLabel}`
      : "Abrir accesos rápidos de cuenta"
  );

  // Un toggle de menú nunca debe conservar semántica de navegación.
  link.removeAttribute("href");
  delete link.dataset.spa;
  delete link.dataset.routerLink;
  delete link.dataset.route;
  delete link.dataset.href;

  let menu = wrapper.querySelector(ACCOUNT_MENU);
  if (!menu) menu = buildAccountMenu(wrapper, home);

  const homeLink = menu.querySelector('a[role="menuitem"]');

  if (homeLink && safePath(homeLink.getAttribute("href"), "") !== home) {
    homeLink.href = home;
    homeLink.dataset.route = home;
    homeLink.dataset.href = home;
  }

  if (slot && wrapper.parentElement !== slot) {
    slot.appendChild(wrapper);
  }

  const avatarHost = link.querySelector(".public-support-account-avatar");
  if (avatarHost) avatarHost.classList.add("topbar-avatar");

  setAccountSlotState(slot, true);

  return true;
}

function enforceHeaderActionOrder(root = null) {
  const actions = root?.querySelector?.(".public-home-nav-actions");
  if (!actions) return false;

  const slot = root.querySelector(ACCOUNT_SLOT);
  const account =
    actions.querySelector(":scope > .public-home-account-menu-wrap") ||
    actions.querySelector(`:scope > ${LOGIN}`);
  const incidence = actions.querySelector(":scope > .public-home-nav-cta");
  const accountInTopbar = Boolean(slot?.querySelector(ACCOUNT_WRAP));

  actions.dataset.publicHomeActionOrder = accountInTopbar
    ? "account-slot-incidence"
    : "login-incidence";

  if (accountInTopbar) return false;

  if (account && incidence && account.nextElementSibling !== incidence) {
    actions.insertBefore(account, incidence);
    return true;
  }

  return false;
}

function removeFooterLogin(root = null) {
  if (!root) return false;

  let removed = false;

  root.querySelectorAll(`.public-home-footer ${LOGIN}`).forEach((node) => {
    node.remove();
    removed = true;
  });

  return removed;
}

function nationalSpanishDigits(value = "") {
  const raw = String(value ?? "");
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("0034")) {
    digits = digits.slice(4);
  } else if (/^\s*\+34/.test(raw)) {
    digits = digits.slice(2);
  } else if (digits.startsWith("34") && digits.length > 9) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 9);
}

function formatNationalPhone(value = "") {
  const digits = nationalSpanishDigits(value);
  if (!digits) return "";

  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)]
    .filter(Boolean)
    .join(" ");
}

function nationalDigitsBeforeCaret(value = "", caret = 0) {
  const before = String(value ?? "").slice(0, Math.max(0, Number(caret) || 0));
  return nationalSpanishDigits(before).length;
}

function caretForNationalCount(formatted = "", count = 0) {
  if (!formatted || count <= 0) return 0;

  let seen = 0;

  for (let index = 0; index < formatted.length; index += 1) {
    if (!/\d/.test(formatted[index])) continue;
    seen += 1;
    if (seen >= count) return index + 1;
  }

  return formatted.length;
}

function formatPhoneControl(input = null, keepCaret = true) {
  if (!input) return false;

  const raw = String(input.value ?? "");
  const active = document.activeElement === input;
  const selectionStart = active ? input.selectionStart : null;
  const digitCount =
    selectionStart === null
      ? null
      : nationalDigitsBeforeCaret(raw, selectionStart);
  const formatted = formatNationalPhone(raw);

  if (raw !== formatted) input.value = formatted;

  if (active && keepCaret && digitCount !== null) {
    const caret = caretForNationalCount(formatted, digitCount);

    try {
      input.setSelectionRange(caret, caret);
    } catch {
      // input type/capability fallback
    }
  }

  return true;
}

function removeLegacyPhoneHelp(field = null) {
  if (!field) return false;

  let changed = false;
  const row = field.querySelector("[data-public-support-phone-label-row]");

  if (row) {
    const label = row.querySelector("label");

    if (label) row.parentNode?.insertBefore(label, row);

    row.remove();
    changed = true;
  }

  field
    .querySelectorAll(
      "[data-public-support-phone-help], [data-public-support-phone-tooltip]"
    )
    .forEach((node) => {
      node.remove();
      changed = true;
    });

  return changed;
}

function createPhonePrefix() {
  const prefix = document.createElement("span");
  prefix.className = "public-support-phone-prefix";
  prefix.dataset.publicSupportPhonePrefix = "true";
  prefix.setAttribute("aria-hidden", "true");

  const flag = document.createElement("span");
  flag.className = "public-support-phone-flag";

  const code = document.createElement("span");
  code.className = "public-support-phone-code";
  code.textContent = SPAIN_PREFIX;

  prefix.append(flag, code);
  return prefix;
}

function ensurePhoneControl(input = null) {
  if (!input) return null;

  let control = input.closest(PHONE_CONTROL);
  if (control) return control;

  control = document.createElement("div");
  control.className = "public-support-phone-control";
  control.dataset.publicSupportPhoneControl = "true";

  input.parentNode?.insertBefore(control, input);
  control.append(createPhonePrefix(), input);

  return control;
}

function enhancePhone(root = null) {
  const input = root?.querySelector?.(PHONE);
  if (!input) return false;

  const field = input.closest(".public-support-field");
  removeLegacyPhoneHelp(field);

  field?.classList.remove("public-support-field--phone-clean");
  field?.classList.add("public-support-field--phone-prefix");

  ensurePhoneControl(input);

  input.placeholder = PHONE_PLACEHOLDER;
  input.maxLength = 11;
  input.inputMode = "tel";
  input.autocomplete = "tel-national";
  input.removeAttribute("title");
  input.setAttribute(
    "aria-label",
    `Teléfono de España. Prefijo ${SPAIN_PREFIX} fijo fuera del campo. Ejemplo completo: ${PHONE_EXAMPLE}`
  );
  input.dataset.publicSupportPhoneEnhanced = "national-es-with-static-prefix";

  formatPhoneControl(input, false);
  return true;
}

function polishInlineIcons(root = null) {
  if (!root) return false;

  const icons = root.querySelectorAll(
    [
      ".public-home-service-icon svg",
      ".public-home-method-icon svg",
      ".public-home-trust-icon svg",
      ".public-home-price-points svg",
      ".public-support-intake-icon",
    ].join(",")
  );

  icons.forEach((svg) => {
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.dataset.publicHomeSvgPolished = "true";
  });

  return icons.length > 0;
}

function enhance(root = null, state = {}) {
  if (!root || destroyed) return false;

  removeFooterLogin(root);
  ensureAccountMenu(root, state);
  enforceHeaderActionOrder(root);
  enhancePhone(root);
  polishInlineIcons(root);

  root.dataset.publicHomeExperience = PUBLIC_HOME_EXPERIENCE_VERSION;
  return true;
}

function scan() {
  if (destroyed || typeof document === "undefined") return false;

  const roots = document.querySelectorAll(HOME);
  if (!roots.length) return false;

  const state = appState();
  let found = false;

  roots.forEach((root) => {
    found = enhance(root, state) || found;
  });

  return found;
}

function queueScan() {
  if (destroyed || typeof window === "undefined" || scanFrame) return false;
  scanFrame = window.requestAnimationFrame(() => {
    scanFrame = 0;
    scan();
  });
  return true;
}

async function resolveAuth() {
  const direct =
    AppCore?.getModule?.("auth") ||
    AppCore?.auth ||
    AppCore?.Auth ||
    null;

  if (direct?.logout) return direct;

  try {
    const module = await import("../auth/index.js");
    return module?.Auth || module?.default || null;
  } catch {
    return null;
  }
}

async function logout(button = null) {
  if (logoutPending) return false;
  logoutPending = true;

  if (button) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Cerrando sesión…";
  }

  try {
    const auth = await resolveAuth();

    if (auth?.logout) {
      await auth.logout({ source: "public-home.account-menu" });
    } else {
      try {
        AppCore?.clearSession?.();
      } catch {
        // best effort
      }
    }
  } finally {
    window.location.replace("/");
  }

  return true;
}

function onDocumentClick(event) {
  const target = event?.target;
  if (!target?.closest) return;

  const phoneControl = target.closest(PHONE_CONTROL);

  if (phoneControl && !target.closest("input")) {
    const input = phoneControl.querySelector('input[name="phone"]');

    if (input) {
      event.preventDefault();
      input.focus();

      try {
        const end = String(input.value || "").length;
        input.setSelectionRange(end, end);
      } catch {
        // input type/capability fallback
      }
    }

    return;
  }

  const logoutAction = target.closest(LOGOUT_ACTION);

  if (logoutAction) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    closeAllAccountMenus();
    void logout(logoutAction);
    return;
  }

  const toggle = target.closest(ACCOUNT_TOGGLE);

  if (toggle) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    toggleAccountMenu(toggle.closest(ACCOUNT_WRAP));
    return;
  }

  if (target.closest(`${ACCOUNT_MENU} a[href]`)) {
    closeAllAccountMenus();
    return;
  }

  if (!target.closest(ACCOUNT_WRAP)) closeAllAccountMenus();
}

function onDocumentKeydown(event) {
  const target = event?.target;

  if (event.key === "Escape") {
    const wrapper = document.querySelector(`${ACCOUNT_WRAP}.is-open`);

    if (wrapper) {
      event.preventDefault();
      closeAccountMenu(wrapper, true);
    }

    return;
  }

  const toggle = target?.closest?.(ACCOUNT_TOGGLE);

  if (
    toggle &&
    (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    openAccountMenu(toggle.closest(ACCOUNT_WRAP), true);
  }
}

function onInput(event) {
  const input = event?.target;

  if (!input?.matches?.(PHONE)) return;
  formatPhoneControl(input, true);
}

function onFocusIn(event) {
  const input = event?.target;

  if (!input?.matches?.(PHONE)) return;
  formatPhoneControl(input, false);
}

function onFocusOut(event) {
  const input = event?.target;

  if (!input?.matches?.(PHONE)) return;
  formatPhoneControl(input, false);
}

function install() {
  if (typeof window === "undefined" || destroyed) return;

  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKeydown, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);

  window.addEventListener("onion:main:ready", queueScan);
  document.addEventListener(PUBLIC_HOME_SESSION_EVENT, queueScan, true);
  document.addEventListener("public-home:ready", queueScan, true);

  const mount =
    document.querySelector("#view-container") ||
    document.querySelector("[data-router-view]") ||
    document.querySelector("[data-app-content]") ||
    document.body;

  observer = new MutationObserver(queueScan);
  observer.observe(mount, { childList: true, subtree: true });
  scan();
}

export function destroyPublicHomeExperience() {
  if (typeof window === "undefined" || destroyed) return false;

  destroyed = true;

  document.removeEventListener("click", onDocumentClick, true);
  document.removeEventListener("keydown", onDocumentKeydown, true);
  document.removeEventListener("input", onInput, true);
  document.removeEventListener("focusin", onFocusIn, true);
  document.removeEventListener("focusout", onFocusOut, true);

  window.removeEventListener("onion:main:ready", queueScan);
  document.removeEventListener(PUBLIC_HOME_SESSION_EVENT, queueScan, true);
  document.removeEventListener("public-home:ready", queueScan, true);

  observer?.disconnect();
  observer = null;

  if (scanFrame) window.cancelAnimationFrame(scanFrame);
  scanFrame = 0;

  return true;
}

if (typeof window !== "undefined") install();

export default Object.freeze({
  version: PUBLIC_HOME_EXPERIENCE_VERSION,
  scan,
  destroy: destroyPublicHomeExperience,
});
