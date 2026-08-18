/* =========================================================
   Onion Support - Public Home Experience
   Archivo: /src/features/public-home-experience/index.js

   Remate UX de la landing pública:
   - Login/Cuenta siempre a la izquierda de "Abrir incidencia".
   - Dropdown autenticado con accesos rápidos y cierre de sesión.
   - Nombre compacto: "Nombre I." preservando tildes.
   - Footer sin login/cuenta.
   - Teléfono con placeholder gris y formato +34 XXX XXX XXX al escribir.
   - SVGs inline afinados sin alterar su semántica.
========================================================= */

import { AppCore } from "../../core/index.js";

export const PUBLIC_HOME_EXPERIENCE_VERSION =
  "public-home.experience.v1.production";

const HOME = "[data-public-home]";
const FORM = "[data-public-support-form]";
const PHONE = `${FORM} [name="phone"]`;
const LOGIN = "[data-public-home-login]";
const ACCOUNT_WRAP = "[data-public-home-account-wrap]";
const ACCOUNT_MENU = "[data-public-home-account-menu]";
const ACCOUNT_TOGGLE = "[data-public-home-account-toggle]";
const LOGOUT_ACTION = "[data-public-home-logout]";

const SPAIN_PREFIX = "+34";
const SPAIN_PHONE_DEFAULT = "+34 ";
const PHONE_PLACEHOLDER = "Ejemplo: +34 612 345 678";

let observer = null;
let retryTimer = 0;
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
    return object(AppCore?.getState?.()) || object(AppCore?.state) || {};
  } catch {
    return object(AppCore?.state) || {};
  }
}

function currentUser() {
  const state = appState();
  return object(state.currentUser) || object(state.user);
}

function authenticated() {
  const state = appState();

  try {
    return state.authenticated === true || AppCore?.isAuthenticated?.() === true;
  } catch {
    return state.authenticated === true;
  }
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

function panelPath(link = null) {
  const fromLink = safePath(link?.getAttribute?.("href") || "", "");
  if (fromLink && fromLink !== "/login") return fromLink;

  const state = appState();
  const fromState = safePath(
    state.homePath || state.defaultHome || state.postLoginTarget || "",
    ""
  );

  if (fromState) return fromState;

  const user = currentUser();
  const slug = text(user?.slug || user?.username || user?.usernameLower || "")
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return slug ? `/@${encodeURIComponent(slug)}` : "/dashboard";
}

function compactDisplayName(value = "") {
  const clean = text(value, "");
  if (!clean) return "";

  const parts = clean.split(" ").filter(Boolean);
  if (parts.length < 2) return parts[0];

  const initial = Array.from(parts[1])[0]?.toLocaleUpperCase("es-ES") || "";
  return initial ? `${parts[0]} ${initial}.` : parts[0];
}

function compactAccountIdentity(root = null) {
  if (!root) return false;

  let changed = false;

  root.querySelectorAll(".public-support-account-name").forEach((node) => {
    const original =
      text(node.dataset.publicHomeFullName || "") || text(node.textContent || "");

    if (!original) return;

    if (!node.dataset.publicHomeFullName) {
      node.dataset.publicHomeFullName = original;
    }

    const compact = compactDisplayName(original);

    if (compact && text(node.textContent) !== compact) {
      node.textContent = compact;
      changed = true;
    }

    if (node.title !== original) node.title = original;
  });

  return changed;
}

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

function buildAccountMenu(wrapper, link) {
  const menu = document.createElement("div");
  menu.className = "public-home-account-menu";
  menu.dataset.publicHomeAccountMenu = "true";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Accesos rápidos de cuenta");
  menu.setAttribute("aria-hidden", "true");

  menu.append(
    routeLink("Inicio", panelPath(link)),
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
  delete link.dataset.publicHomeAccountToggle;

  return true;
}

function ensureAccountMenu(root = null) {
  if (!root) return false;

  const actions = root.querySelector(".public-home-nav-actions");
  const link = actions?.querySelector(LOGIN);
  if (!actions || !link) return false;

  const isAccount =
    authenticated() ||
    root.dataset.publicSupportAuthenticated === "true" ||
    link.dataset.publicSupportAccount === "true";

  if (!isAccount) {
    resetAccountWrapper(link);
    return false;
  }

  let wrapper = link.closest(ACCOUNT_WRAP);

  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.className = "public-home-account-menu-wrap";
    wrapper.dataset.publicHomeAccountWrap = "true";

    link.parentNode?.insertBefore(wrapper, link);
    wrapper.appendChild(link);
  }

  link.dataset.publicHomeAccountToggle = "true";
  link.setAttribute("aria-haspopup", "menu");
  link.setAttribute("aria-expanded", "false");
  link.setAttribute("aria-label", "Abrir accesos rápidos de cuenta");

  delete link.dataset.spa;
  delete link.dataset.routerLink;
  delete link.dataset.route;
  delete link.dataset.href;

  const label = link.querySelector(".public-support-account-label");
  if (label && text(label.textContent) !== "Accesos rápidos") {
    label.textContent = "Accesos rápidos";
  }

  let menu = wrapper.querySelector(ACCOUNT_MENU);
  if (!menu) menu = buildAccountMenu(wrapper, link);

  const homeLink = menu.querySelector('a[role="menuitem"]');
  const home = panelPath(link);

  if (homeLink && safePath(homeLink.getAttribute("href"), "") !== home) {
    homeLink.href = home;
    homeLink.dataset.route = home;
    homeLink.dataset.href = home;
  }

  return true;
}

function enforceHeaderActionOrder(root = null) {
  const actions = root?.querySelector?.(".public-home-nav-actions");
  if (!actions) return false;

  const account =
    actions.querySelector(":scope > .public-home-account-menu-wrap") ||
    actions.querySelector(`:scope > ${LOGIN}`);
  const incidence = actions.querySelector(":scope > .public-home-nav-cta");

  actions.dataset.publicHomeActionOrder = "login-incidence";

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

function formatSpanishPhoneInput(value = "") {
  const raw = String(value ?? "");

  if (!text(raw) || text(raw) === SPAIN_PREFIX) return "";

  const digits = nationalSpanishDigits(raw);
  if (!digits) return "";

  const groups = [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 9),
  ].filter(Boolean);

  return `${SPAIN_PREFIX} ${groups.join(" ")}`;
}

function nationalDigitsBeforeCaret(value = "", caret = 0) {
  const before = String(value ?? "").slice(0, Math.max(0, Number(caret) || 0));
  return nationalSpanishDigits(before).length;
}

function caretForNationalCount(formatted = "", count = 0) {
  if (!formatted) return 0;

  const start = formatted.startsWith(SPAIN_PHONE_DEFAULT)
    ? SPAIN_PHONE_DEFAULT.length
    : 0;

  if (count <= 0) return start;

  let seen = 0;

  for (let index = start; index < formatted.length; index += 1) {
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

  const formatted = formatSpanishPhoneInput(raw);

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

function enhancePhone(root = null) {
  const input = root?.querySelector?.(PHONE);
  if (!input) return false;

  const field = input.closest(".public-support-field");
  removeLegacyPhoneHelp(field);

  field?.classList.add("public-support-field--phone-clean");

  input.placeholder = PHONE_PLACEHOLDER;
  input.removeAttribute("title");
  input.setAttribute(
    "aria-label",
    "Teléfono de España. Ejemplo: +34 612 345 678"
  );
  input.dataset.publicSupportPhoneEnhanced = "clean-placeholder";

  if (!text(input.value) || text(input.value) === SPAIN_PREFIX) {
    input.value = "";
  } else {
    formatPhoneControl(input, false);
  }

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

function enhance(root = null) {
  if (!root || destroyed) return false;

  removeFooterLogin(root);
  ensureAccountMenu(root);
  compactAccountIdentity(root);
  enforceHeaderActionOrder(root);
  enhancePhone(root);
  polishInlineIcons(root);

  root.dataset.publicHomeExperience = PUBLIC_HOME_EXPERIENCE_VERSION;
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

  const logoutAction = target.closest(LOGOUT_ACTION);

  if (logoutAction) {
    event.preventDefault();
    event.stopPropagation();
    closeAllAccountMenus();
    void logout(logoutAction);
    return;
  }

  const toggle = target.closest(ACCOUNT_TOGGLE);

  if (toggle) {
    event.preventDefault();
    event.stopPropagation();
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

  if (toggle && (event.key === "ArrowDown" || event.key === "Enter")) {
    event.preventDefault();
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

  if (text(input.value) === SPAIN_PREFIX) {
    input.value = "";
  }
}

function onFocusOut(event) {
  const input = event?.target;

  if (!input?.matches?.(PHONE)) return;

  if (!text(input.value) || text(input.value) === SPAIN_PREFIX) {
    input.value = "";
    return;
  }

  formatPhoneControl(input, false);
}

function install() {
  if (typeof window === "undefined" || destroyed) return;

  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKeydown, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);

  window.addEventListener("onion:main:ready", scan);
  document.addEventListener("public-home:ready", scan, true);

  const mount =
    document.querySelector("#view-container") ||
    document.querySelector("[data-router-view]") ||
    document.querySelector("[data-app-content]") ||
    document.body;

  observer = new MutationObserver(scan);
  observer.observe(mount, { childList: true, subtree: true });

  if (!scan()) {
    let attempts = 0;

    retryTimer = window.setInterval(() => {
      attempts += 1;

      if (scan() || attempts >= 12) {
        window.clearInterval(retryTimer);
        retryTimer = 0;
      }
    }, 500);
  }
}

export function destroyPublicHomeExperience() {
  if (typeof window === "undefined" || destroyed) return false;

  destroyed = true;

  document.removeEventListener("click", onDocumentClick, true);
  document.removeEventListener("keydown", onDocumentKeydown, true);
  document.removeEventListener("input", onInput, true);
  document.removeEventListener("focusin", onFocusIn, true);
  document.removeEventListener("focusout", onFocusOut, true);

  window.removeEventListener("onion:main:ready", scan);
  document.removeEventListener("public-home:ready", scan, true);

  observer?.disconnect();
  observer = null;

  if (retryTimer) window.clearInterval(retryTimer);
  retryTimer = 0;

  return true;
}

if (typeof window !== "undefined") install();

export default Object.freeze({
  version: PUBLIC_HOME_EXPERIENCE_VERSION,
  scan,
  destroy: destroyPublicHomeExperience,
});
