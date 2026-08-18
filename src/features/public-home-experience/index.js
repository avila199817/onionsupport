/* =========================================================
   Onion Support - Public Home Experience
   Archivo: /src/features/public-home-experience/index.js

   Responsabilidad:
   - Remate UX de la landing pública sin duplicar el intake.
   - Fijar el orden Login/Cuenta -> Abrir incidencia.
   - Añadir accesos rápidos a la cuenta autenticada.
   - Retirar el acceso de login/cuenta del footer.
   - Formatear en vivo teléfonos españoles (+34 XXX XXX XXX).
   - Añadir ayuda accesible de formato al campo teléfono.
   - Normalizar la presentación de SVGs inline sin alterar su semántica.
   - Logout mediante el módulo Auth canónico.
   - Sin HTTP propio, sin storage y sin lógica de creación de incidencias.
========================================================= */

import { AppCore } from "../../core/index.js";

export const PUBLIC_HOME_EXPERIENCE_VERSION =
  "public-home.experience.v1.production";

const HOME = "[data-public-home]";
const FORM = "[data-public-support-form]";
const PHONE = `${FORM} [name="phone"]`;
const LOGIN = "[data-public-home-login]";
const HEADER_LOGIN = `.public-home-nav-actions ${LOGIN}`;
const FOOTER_LOGIN = `.public-home-footer ${LOGIN}`;
const ACCOUNT_WRAP = "[data-public-home-account-wrap]";
const ACCOUNT_MENU = "[data-public-home-account-menu]";
const ACCOUNT_TOGGLE = "[data-public-home-account-toggle]";
const LOGOUT_ACTION = "[data-public-home-logout]";
const SPAIN_PREFIX = "+34";
const SPAIN_PHONE_DEFAULT = "+34 ";
const PHONE_EXAMPLE = "+34 612 345 678";

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
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
    ? value
    : null;
}

function safePath(value = "", fallback = "/") {
  const raw = text(value, "");

  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(raw, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}` || fallback;
  } catch {
    return fallback;
  }
}

function appState() {
  try {
    return object(AppCore?.getState?.()) || object(AppCore?.state) || {};
  } catch {
    return object(AppCore?.state) || {};
  }
}

function currentUser() {
  const current = appState();
  return object(current.currentUser) || object(current.user);
}

function isAuthenticated() {
  const current = appState();

  try {
    return current.authenticated === true || AppCore?.isAuthenticated?.() === true;
  } catch {
    return current.authenticated === true;
  }
}

function panelPath(link = null) {
  const current = appState();
  const fromLink = safePath(link?.getAttribute?.("href") || "", "");
  if (fromLink && fromLink !== "/login") return fromLink;

  const fromState = safePath(
    current.homePath || current.defaultHome || current.postLoginTarget || "",
    ""
  );

  if (fromState) return fromState;

  const user = currentUser();
  const slug = text(user?.slug || user?.username || user?.usernameLower || "")
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return slug ? `/@${encodeURIComponent(slug)}` : "/dashboard";
}

function routeLink(label, href, extraClass = "") {
  const link = document.createElement("a");
  const route = safePath(href, "/");

  link.className = `public-home-account-menu-item ${extraClass}`.trim();
  link.href = route;
  link.textContent = label;
  link.setAttribute("role", "menuitem");
  link.dataset.spa = "true";
  link.dataset.routerLink = "true";
  link.dataset.route = route;
  link.dataset.href = route;

  return link;
}

function closeAccountMenu(wrapper = null, options = {}) {
  if (!wrapper) return false;

  const menu = wrapper.querySelector(ACCOUNT_MENU);
  const toggle = wrapper.querySelector(ACCOUNT_TOGGLE);

  wrapper.classList.remove("is-open");
  menu?.classList.remove("is-open");
  menu?.setAttribute("aria-hidden", "true");
  toggle?.setAttribute("aria-expanded", "false");

  if (options.restoreFocus === true) {
    try {
      toggle?.focus?.({ preventScroll: true });
    } catch {
      toggle?.focus?.();
    }
  }

  return true;
}

function closeAllAccountMenus(options = {}) {
  if (typeof document === "undefined") return false;

  document.querySelectorAll(ACCOUNT_WRAP).forEach((wrapper) => {
    closeAccountMenu(wrapper, options);
  });

  return true;
}

function openAccountMenu(wrapper = null, options = {}) {
  if (!wrapper) return false;

  closeAllAccountMenus();

  const menu = wrapper.querySelector(ACCOUNT_MENU);
  const toggle = wrapper.querySelector(ACCOUNT_TOGGLE);

  if (!menu || !toggle) return false;

  wrapper.classList.add("is-open");
  menu.classList.add("is-open");
  menu.setAttribute("aria-hidden", "false");
  toggle.setAttribute("aria-expanded", "true");

  if (options.focusFirst === true) {
    const first = menu.querySelector("a[href], button:not([disabled])");
    try {
      first?.focus?.({ preventScroll: true });
    } catch {
      first?.focus?.();
    }
  }

  return true;
}

function toggleAccountMenu(wrapper = null) {
  if (!wrapper) return false;

  return wrapper.classList.contains("is-open")
    ? closeAccountMenu(wrapper)
    : openAccountMenu(wrapper);
}

function resetLoginLink(link = null) {
  if (!link) return false;

  const wrapper = link.closest(ACCOUNT_WRAP);

  if (wrapper) {
    wrapper.parentNode?.insertBefore(link, wrapper);
    wrapper.remove();
  }

  link.classList.remove("public-support-account-link");
  link.removeAttribute("aria-haspopup");
  link.removeAttribute("aria-expanded");
  delete link.dataset.publicHomeAccountToggle;

  link.href = "/login";
  link.dataset.spa = "true";
  link.dataset.routerLink = "true";
  link.dataset.route = "/login";
  link.dataset.href = "/login";
  link.setAttribute("aria-label", "Iniciar sesión");
  if (text(link.textContent) !== "Iniciar sesión") {
    link.textContent = "Iniciar sesión";
  }

  return true;
}

function buildAccountMenu(wrapper, link) {
  const menu = document.createElement("div");
  menu.className = "public-home-account-menu";
  menu.dataset.publicHomeAccountMenu = "true";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Accesos rápidos de cuenta");
  menu.setAttribute("aria-hidden", "true");

  const home = panelPath(link);

  menu.append(
    routeLink("Inicio", home),
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

function ensureAccountMenu(root = null) {
  if (!root) return false;

  const link = root.querySelector(HEADER_LOGIN);
  if (!link) return false;

  const authenticated =
    isAuthenticated() ||
    root.dataset.publicSupportAuthenticated === "true" ||
    link.dataset.publicSupportAccount === "true";

  if (!authenticated) {
    resetLoginLink(link);
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

  /*
    El enlace de identidad lo gestiona public-support. Aquí lo convertimos
    únicamente en disparador de menú, por lo que retiramos los marcadores de
    navegación del Router para evitar que un click abra el panel directamente.
    El href se conserva como fallback semántico y para construir "Inicio".
  */
  delete link.dataset.spa;
  delete link.dataset.routerLink;
  delete link.dataset.route;
  delete link.dataset.href;

  const label = link.querySelector(".public-support-account-label");
  if (label && text(label.textContent) !== "Accesos rápidos") {
    label.textContent = "Accesos rápidos";
  }

  if (!wrapper.querySelector(ACCOUNT_MENU)) {
    buildAccountMenu(wrapper, link);
  } else {
    const home = wrapper.querySelector(`${ACCOUNT_MENU} a[role="menuitem"]`);
    const href = panelPath(link);

    if (home && safePath(home.getAttribute("href"), "") !== href) {
      home.href = href;
      home.dataset.route = href;
      home.dataset.href = href;
    }
  }

  return true;
}

function removeFooterLogin(root = null) {
  if (!root) return false;

  let removed = false;

  root.querySelectorAll(FOOTER_LOGIN).forEach((node) => {
    node.remove();
    removed = true;
  });

  return removed;
}

function enforceHeaderActionOrder(root = null) {
  const actions = root?.querySelector?.(".public-home-nav-actions");
  if (!actions) return false;

  actions.dataset.publicHomeActionOrder = "login-incidence";
  return true;
}

function nationalSpanishDigits(value = "") {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (digits.startsWith("0034")) {
    digits = digits.slice(4);
  } else if (digits.startsWith("34")) {
    digits = digits.slice(2);
  }

  return digits.slice(0, 9);
}

function formatSpanishPhoneInput(value = "") {
  const digits = nationalSpanishDigits(value);
  if (!digits) return SPAIN_PHONE_DEFAULT;

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

function formatPhoneControl(input = null, options = {}) {
  if (!input) return false;

  const raw = String(input.value ?? "");
  const active = document.activeElement === input;
  const selectionStart = active ? input.selectionStart : null;
  const count = selectionStart === null
    ? null
    : nationalDigitsBeforeCaret(raw, selectionStart);
  const formatted = formatSpanishPhoneInput(raw);

  if (raw !== formatted) {
    input.value = formatted;
  }

  if (active && count !== null && options.keepCaret !== false) {
    const nextCaret = caretForNationalCount(formatted, count);

    try {
      input.setSelectionRange(nextCaret, nextCaret);
    } catch {
      // input type/capability fallback: no-op
    }
  }

  return true;
}

function mergeDescribedBy(input = null, id = "") {
  if (!input || !id) return false;

  const ids = new Set(
    text(input.getAttribute("aria-describedby") || "", "")
      .split(" ")
      .filter(Boolean)
  );

  ids.add(id);
  input.setAttribute("aria-describedby", [...ids].join(" "));
  return true;
}

function ensurePhoneHelp(root = null) {
  const input = root?.querySelector?.(PHONE);
  if (!input) return false;

  const field = input.closest(".public-support-field");
  const label = field?.querySelector(`label[for="${input.id}"]`);
  if (!field || !label) return false;

  field.classList.add("public-support-field--phone");
  input.dataset.publicSupportPhoneEnhanced = "true";
  input.title = `Ejemplo: ${PHONE_EXAMPLE}`;
  input.setAttribute("aria-label", "Teléfono de España, formato +34 y 9 dígitos");

  let row = field.querySelector("[data-public-support-phone-label-row]");

  if (!row) {
    row = document.createElement("div");
    row.className = "public-support-label-row";
    row.dataset.publicSupportPhoneLabelRow = "true";

    label.parentNode?.insertBefore(row, label);
    row.appendChild(label);
  }

  let help = row.querySelector("[data-public-support-phone-help]");
  let tooltip = row.querySelector("[data-public-support-phone-tooltip]");

  if (!help) {
    help = document.createElement("button");
    help.type = "button";
    help.className = "public-support-field-help";
    help.dataset.publicSupportPhoneHelp = "true";
    help.setAttribute("aria-label", "Ver ejemplo de formato de teléfono");
    help.textContent = "?";
    row.appendChild(help);
  }

  if (!tooltip) {
    tooltip = document.createElement("span");
    tooltip.id = "public-support-phone-example";
    tooltip.className = "public-support-field-tooltip";
    tooltip.dataset.publicSupportPhoneTooltip = "true";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = `Ejemplo: ${PHONE_EXAMPLE}`;
    row.appendChild(tooltip);
  }

  help.setAttribute("aria-describedby", tooltip.id);
  mergeDescribedBy(input, tooltip.id);
  formatPhoneControl(input, { keepCaret: false });

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
  enforceHeaderActionOrder(root);
  ensureAccountMenu(root);
  ensurePhoneHelp(root);
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
        // fallback local best-effort
      }
    }
  } finally {
    try {
      window.location.replace("/");
    } catch {
      window.location.href = "/";
    }
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

  const menuItem = target.closest(`${ACCOUNT_MENU} a[href]`);
  if (menuItem) {
    closeAllAccountMenus();
    return;
  }

  const wrapper = target.closest(ACCOUNT_WRAP);
  if (!wrapper) closeAllAccountMenus();
}

function onDocumentKeydown(event) {
  const target = event?.target;

  if (event.key === "Escape") {
    const open = document.querySelector(`${ACCOUNT_WRAP}.is-open`);
    if (open) {
      event.preventDefault();
      closeAccountMenu(open, { restoreFocus: true });
    }
    return;
  }

  if (event.key === "ArrowDown" && target?.closest?.(ACCOUNT_TOGGLE)) {
    event.preventDefault();
    openAccountMenu(target.closest(ACCOUNT_WRAP), { focusFirst: true });
  }
}

function onInput(event) {
  const input = event?.target;
  if (!input?.matches?.(PHONE)) return;

  formatPhoneControl(input);
}

function onFocusIn(event) {
  const input = event?.target;
  if (!input?.matches?.(PHONE)) return;

  formatPhoneControl(input, { keepCaret: false });
}

function onFocusOut(event) {
  const input = event?.target;
  if (!input?.matches?.(PHONE)) return;

  formatPhoneControl(input, { keepCaret: false });
}

function install() {
  if (typeof window === "undefined" || destroyed) return false;

  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKeydown, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  window.addEventListener("resize", closeAllAccountMenus, { passive: true });
  window.addEventListener("onion:main:ready", scan);
  document.addEventListener("public-home:ready", scan, true);

  const mount =
    document.querySelector("#view-container") ||
    document.querySelector("[data-router-view]") ||
    document.querySelector("[data-app-content]") ||
    document.body;

  observer = new MutationObserver(scan);
  observer.observe(mount, {
    childList: true,
    subtree: true,
  });

  if (!scan()) {
    let attempts = 0;

    retryTimer = window.setInterval(() => {
      attempts += 1;

      if (scan() || attempts >= 16) {
        window.clearInterval(retryTimer);
        retryTimer = 0;
      }
    }, 500);
  }

  return true;
}

export function destroyPublicHomeExperience() {
  if (typeof window === "undefined" || destroyed) return false;
  destroyed = true;

  document.removeEventListener("click", onDocumentClick, true);
  document.removeEventListener("keydown", onDocumentKeydown, true);
  document.removeEventListener("input", onInput, true);
  document.removeEventListener("focusin", onFocusIn, true);
  document.removeEventListener("focusout", onFocusOut, true);
  window.removeEventListener("resize", closeAllAccountMenus);
  window.removeEventListener("onion:main:ready", scan);
  document.removeEventListener("public-home:ready", scan, true);

  observer?.disconnect();
  observer = null;

  if (retryTimer) window.clearInterval(retryTimer);
  retryTimer = 0;
  closeAllAccountMenus();

  return true;
}

if (typeof window !== "undefined") install();

export default Object.freeze({
  version: PUBLIC_HOME_EXPERIENCE_VERSION,
  scan,
  destroy: destroyPublicHomeExperience,
});
