/* =========================================================
   Onion Support - Public Home View Controller
   Archivo: /src/views/public/home/index.js

   Responsabilidad:
   - Controlador de la landing pública de Onion Support 2026.
   - Montar el template recibido desde ./template.js.
   - Leer refs por contrato data-*.
   - Activar menú móvil accesible.
   - Activar scroll suave interno.
   - Activar navegación por sección actual.
   - Activar reveal progresivo opcional.
   - Activar formulario diagnóstico opcional vía WhatsApp.
   - Emitir eventos CustomEvent para tracking sin HTTP.
   - Gestionar destroy limpio.
   - Sin construir HTML inline.
   - Sin Auth obligatorio.
   - Sin HTTP.
   - Sin Store.
   - Sin Toast.
   - Sin dependencias externas.
========================================================= */

import { AppCore } from "../../../core/index.js";
import createPublicHomeTemplate from "./template.js";

export const PUBLIC_HOME_VIEW_VERSION = "public.home.view.controller.productive.2026.1";

const SOURCE = "public.home.view";

const INSTANCES = new WeakMap();

let lastInstance = null;

/* =========================================================
   CONSTANTS
========================================================= */

const BODY_CLASSES = {
  screen: "public-home-screen",
  mounted: "public-home-mounted",
  menuOpen: "public-home-menu-open",
  noScroll: "public-home-no-scroll",
};

const CLASSES = {
  mounted: "is-mounted",
  ready: "is-ready",
  active: "is-active",
  visible: "is-visible",
  menuOpen: "is-menu-open",
  scrolled: "is-scrolled",
  submitting: "is-submitting",
  invalid: "is-invalid",
  copied: "is-copied",
  counterReady: "is-counter-ready",
  magnetic: "is-magnetic",
};

const SELECTORS = {
  root: "[data-public-home]",
  nav: "[data-public-home-nav]",
  navToggle: "[data-public-home-nav-toggle]",
  navMenu: "[data-public-home-menu]",
  navPanel: "[data-public-home-nav-panel]",
  navLink: "[data-public-home-nav-link]",
  scrollLink: "[data-public-home-scroll-link]",
  section: "[data-public-home-section]",
  reveal: "[data-public-home-reveal], [data-reveal]",
  cta: "[data-public-home-cta]",
  login: "[data-public-home-login]",
  diagnosticForm: "[data-public-home-diagnostic-form]",
  formStatus: "[data-public-home-form-status]",
  copyAction: "[data-public-home-copy]",
  metricCounter: "[data-public-home-counter]",
  magnetic: "[data-public-home-magnetic]",
};

const DEFAULT_SCROLL_OFFSET = 92;
const ACTIVE_ROOT_MARGIN = "-34% 0px -54% 0px";

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
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

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function isDomNode(value = null) {
  return Boolean(
    isBrowser() &&
      value &&
      typeof Node !== "undefined" &&
      value instanceof Node
  );
}

function clearNode(node = null) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    try {
      node.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

function setBodyClass(className = "", enabled = false) {
  if (!isBrowser() || !className) return false;

  try {
    document.body.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function safeDataset(node = null, key = "", value = "") {
  if (!node || !key) return false;

  try {
    node.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
}

function removeDataset(node = null, key = "") {
  if (!node || !key) return false;

  try {
    delete node.dataset[key];
    return true;
  } catch {
    return false;
  }
}

function focusSafe(node = null, options = {}) {
  if (!node) return false;

  try {
    node.focus({
      preventScroll: options.preventScroll !== false,
    });
  } catch {
    try {
      node.focus?.();
    } catch {
      return false;
    }
  }

  return true;
}

function getReducedMotion() {
  if (!isBrowser() || !isFunction(window.matchMedia)) return false;

  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function requestFrame(callback) {
  if (!isFunction(callback)) return 0;

  if (isBrowser() && isFunction(window.requestAnimationFrame)) {
    return window.requestAnimationFrame(callback);
  }

  return setTimeout(callback, 16);
}

function cancelFrame(id = 0) {
  if (!id) return false;

  try {
    if (isBrowser() && isFunction(window.cancelAnimationFrame)) {
      window.cancelAnimationFrame(id);
    } else {
      clearTimeout(id);
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ROUTER / CONTEXT
========================================================= */

function getRouter(context = {}) {
  return (
    context.Router ||
    context.router ||
    AppCore.router ||
    AppCore.Router ||
    AppCore.getModule?.("router") ||
    null
  );
}

function getAuth(context = {}) {
  return (
    context.Auth ||
    context.auth ||
    AppCore.auth ||
    AppCore.Auth ||
    AppCore.getModule?.("auth") ||
    null
  );
}

/* =========================================================
   EVENTS
========================================================= */

function addEvent(cleanups, target, type, listener, options) {
  if (!target || !isFunction(target.addEventListener) || !isFunction(listener)) {
    return false;
  }

  target.addEventListener(type, listener, options);

  cleanups.push(() => {
    try {
      target.removeEventListener(type, listener, options);
    } catch {
      // noop
    }
  });

  return true;
}

function dispatchHomeEvent(root = null, name = "", detail = {}) {
  if (!isBrowser() || !root || !name) return false;

  try {
    const event = new CustomEvent(name, {
      bubbles: true,
      cancelable: true,
      detail: {
        source: SOURCE,
        version: PUBLIC_HOME_VIEW_VERSION,
        ...detail,
      },
    });

    return root.dispatchEvent(event);
  } catch {
    return false;
  }
}

function isPlainLeftClick(event = null) {
  if (!event) return false;

  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/* =========================================================
   TEMPLATE
========================================================= */

function htmlToElement(html = "") {
  if (!isBrowser()) return null;

  const template = document.createElement("template");
  template.innerHTML = String(html || "").trim();

  return template.content.firstElementChild || null;
}

function resolveTemplate() {
  if (!isFunction(createPublicHomeTemplate)) {
    throw new Error(
      "[PublicHomeView] template.js debe exportar createPublicHomeTemplate()."
    );
  }

  const view = createPublicHomeTemplate();

  if (isDomNode(view)) {
    return view;
  }

  if (typeof view === "string") {
    const node = htmlToElement(view);

    if (isDomNode(node)) {
      return node;
    }
  }

  throw new Error(
    "[PublicHomeView] createPublicHomeTemplate() debe devolver un nodo DOM o HTML string válido."
  );
}

function mountTemplate(container) {
  const view = resolveTemplate();

  clearNode(container);
  container.appendChild(view);

  return view;
}

/* =========================================================
   REFS
========================================================= */

function toArray(list = null) {
  return Array.from(list || []).filter(Boolean);
}

function getRefs(view = null) {
  if (!view) {
    throw new Error("[PublicHomeView] view inválida.");
  }

  const root = view.matches?.(SELECTORS.root)
    ? view
    : view.querySelector?.(SELECTORS.root) || view;

  if (!root) {
    throw new Error("[PublicHomeView] falta raíz [data-public-home].");
  }

  const refs = {
    view,
    root,

    nav: root.querySelector(SELECTORS.nav),
    navToggle: root.querySelector(SELECTORS.navToggle),
    navMenu: root.querySelector(SELECTORS.navMenu),
    navPanel: root.querySelector(SELECTORS.navPanel),

    navLinks: toArray(root.querySelectorAll(SELECTORS.navLink)),
    scrollLinks: toArray(root.querySelectorAll(SELECTORS.scrollLink)),
    sections: toArray(root.querySelectorAll(SELECTORS.section)),
    revealItems: toArray(root.querySelectorAll(SELECTORS.reveal)),

    diagnosticForm: root.querySelector(SELECTORS.diagnosticForm),
    formStatus: root.querySelector(SELECTORS.formStatus),
    copyActions: toArray(root.querySelectorAll(SELECTORS.copyAction)),
    metricCounters: toArray(root.querySelectorAll(SELECTORS.metricCounter)),
    magneticItems: toArray(root.querySelectorAll(SELECTORS.magnetic)),
  };

  if (!refs.navLinks.length) {
    refs.navLinks = toArray(
      root.querySelectorAll(
        `${SELECTORS.nav} a[href], ${SELECTORS.navMenu} a[href]`
      )
    );
  }

  if (!refs.scrollLinks.length) {
    refs.scrollLinks = toArray(root.querySelectorAll("a[href^='#']"));
  }

  if (!refs.sections.length) {
    refs.sections = toArray(root.querySelectorAll("section[id], [id][data-section]"));
  }

  return refs;
}

/* =========================================================
   URL / HASH
========================================================= */

function decodeHashId(hash = "") {
  const raw = String(hash || "");

  if (!raw || raw === "#") return "";

  const clean = raw.startsWith("#") ? raw.slice(1) : raw;

  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

function cssAttr(value = "") {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getAnchorHash(anchor = null) {
  if (!anchor) return "";

  const rawHref = cleanText(anchor.getAttribute?.("href") || "", "");

  if (!rawHref || rawHref === "#") return "";

  if (rawHref.startsWith("#")) {
    return rawHref.length > 1 ? rawHref : "";
  }

  if (!isBrowser()) return "";

  try {
    const url = new URL(anchor.href, window.location.href);

    const sameOrigin = url.origin === window.location.origin;
    const samePath = url.pathname === window.location.pathname;
    const sameSearch = url.search === window.location.search;

    if (sameOrigin && samePath && sameSearch && url.hash && url.hash !== "#") {
      return url.hash;
    }
  } catch {
    return "";
  }

  return "";
}

function getHashTarget(hash = "", refs = {}) {
  if (!isBrowser()) return null;

  const id = decodeHashId(hash);

  if (!id) return null;

  let target = null;

  try {
    target = document.getElementById(id);
  } catch {
    target = null;
  }

  if (!target) {
    try {
      target = refs.root?.querySelector?.(`[name="${cssAttr(id)}"]`) || null;
    } catch {
      target = null;
    }
  }

  if (target && refs.view?.contains?.(target)) {
    return target;
  }

  if (target && refs.root?.contains?.(target)) {
    return target;
  }

  return null;
}

function getScrollOffset(refs = {}) {
  if (!isBrowser()) return DEFAULT_SCROLL_OFFSET;

  const root = refs.root || document.documentElement;

  try {
    const value = window
      .getComputedStyle(root)
      .getPropertyValue("--public-home-scroll-offset");

    const parsed = Number.parseFloat(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  } catch {
    // noop
  }

  const navHeight = refs.nav?.getBoundingClientRect?.().height || 0;

  return Math.max(DEFAULT_SCROLL_OFFSET, Math.ceil(navHeight + 18));
}

function updateHash(hash = "", replace = false) {
  if (!isBrowser() || !hash) return false;

  try {
    const next = `${window.location.pathname}${window.location.search}${hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (next === current) return true;

    if (replace) {
      window.history.replaceState(
        {
          source: SOURCE,
        },
        "",
        next
      );
    } else {
      window.history.pushState(
        {
          source: SOURCE,
        },
        "",
        next
      );
    }

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   ACTIVE SECTION
========================================================= */

function normalizeHash(hash = "") {
  const raw = cleanText(hash, "");

  if (!raw) return "";
  if (raw.startsWith("#")) return raw;

  return `#${raw}`;
}

function setActiveHash(refs = {}, hash = "") {
  const cleanHash = normalizeHash(hash);
  const activeId = decodeHashId(cleanHash);

  if (!refs.root) return false;

  if (activeId) {
    safeDataset(refs.root, "activeSection", activeId);
  } else {
    removeDataset(refs.root, "activeSection");
  }

  for (const link of refs.navLinks || []) {
    const linkHash = getAnchorHash(link);
    const active = Boolean(cleanHash && linkHash === cleanHash);

    link.classList.toggle(CLASSES.active, active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  dispatchHomeEvent(refs.root, "public-home:section-change", {
    hash: cleanHash,
    section: activeId,
  });

  return true;
}

function sectionHash(section = null) {
  const id = cleanText(section?.id || section?.dataset?.publicHomeSection || "", "");

  return id ? `#${id}` : "";
}

function pickCurrentSection(refs = {}) {
  if (!isBrowser()) return "";

  const sections = refs.sections || [];

  if (!sections.length) return "";

  const offset = getScrollOffset(refs);
  const targetLine = offset + Math.max(80, window.innerHeight * 0.18);

  let bestHash = "";
  let bestScore = Number.POSITIVE_INFINITY;

  for (const section of sections) {
    const hash = sectionHash(section);

    if (!hash) continue;

    const rect = section.getBoundingClientRect();

    if (rect.bottom < offset || rect.top > window.innerHeight) {
      continue;
    }

    const score = Math.abs(rect.top - targetLine);

    if (score < bestScore) {
      bestScore = score;
      bestHash = hash;
    }
  }

  return bestHash;
}

/* =========================================================
   SCROLL
========================================================= */

function scrollToHash(hash = "", refs = {}, options = {}) {
  if (!isBrowser()) return false;

  const cleanHash = normalizeHash(hash);
  const target = getHashTarget(cleanHash, refs);

  if (!target) return false;

  const reduced = getReducedMotion();
  const behavior = options.behavior || (reduced ? "auto" : "smooth");
  const offset = getScrollOffset(refs);

  try {
    const top = Math.max(
      0,
      window.scrollY + target.getBoundingClientRect().top - offset
    );

    window.scrollTo({
      top,
      behavior,
    });
  } catch {
    try {
      target.scrollIntoView({
        behavior,
        block: "start",
      });
    } catch {
      return false;
    }
  }

  setActiveHash(refs, cleanHash);

  if (options.push !== false) {
    updateHash(cleanHash, options.replace === true);
  }

  if (options.focus === true) {
    const hadTabIndex = target.hasAttribute("tabindex");

    if (!hadTabIndex) {
      target.setAttribute("tabindex", "-1");
    }

    const delay = behavior === "smooth" ? 280 : 0;

    window.setTimeout(() => {
      focusSafe(target);

      if (!hadTabIndex) {
        target.removeAttribute("tabindex");
      }
    }, delay);
  }

  return true;
}

/* =========================================================
   MENU
========================================================= */

function getFocusable(container = null) {
  if (!container) return [];

  return toArray(
    container.querySelectorAll(
      [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "[tabindex]:not([tabindex='-1'])",
      ].join(",")
    )
  ).filter((node) => {
    try {
      return node.offsetParent !== null || node === document.activeElement;
    } catch {
      return true;
    }
  });
}

function setMenuOpen(refs = {}, open = false, options = {}) {
  const value = Boolean(open);

  if (!refs.root) return false;

  refs.root.classList.toggle(CLASSES.menuOpen, value);
  safeDataset(refs.root, "menuOpen", value ? "true" : "false");

  refs.nav?.classList.toggle(CLASSES.menuOpen, value);
  refs.navMenu?.classList.toggle(CLASSES.menuOpen, value);
  refs.navPanel?.classList.toggle(CLASSES.menuOpen, value);

  if (refs.navToggle) {
    refs.navToggle.setAttribute("aria-expanded", value ? "true" : "false");
    safeDataset(refs.navToggle, "menuOpen", value ? "true" : "false");
  }

  setBodyClass(BODY_CLASSES.menuOpen, value);
  setBodyClass(BODY_CLASSES.noScroll, value);

  dispatchHomeEvent(refs.root, value ? "public-home:menu-open" : "public-home:menu-close", {
    open: value,
  });

  if (value && options.focus !== false) {
    const first = getFocusable(refs.navMenu || refs.navPanel || refs.nav)[0];

    focusSafe(first || refs.navToggle);
  }

  if (!value && options.restoreFocus === true) {
    focusSafe(refs.navToggle);
  }

  return true;
}

function isMenuOpen(refs = {}) {
  return refs.root?.dataset?.menuOpen === "true";
}

/* =========================================================
   FORM
========================================================= */

function fieldLabel(input = null) {
  if (!input) return "";

  const explicit =
    input.getAttribute("data-label") ||
    input.getAttribute("aria-label") ||
    input.getAttribute("placeholder") ||
    input.name ||
    input.id ||
    "";

  return cleanText(explicit, "Campo");
}

function findFieldError(form = null, input = null) {
  if (!form || !input) return null;

  const name = cleanText(input.name || input.id || "", "");

  if (!name) return null;

  return (
    form.querySelector(`[data-public-home-error-for="${cssAttr(name)}"]`) ||
    form.querySelector(`[data-error-for="${cssAttr(name)}"]`) ||
    null
  );
}

function setFieldError(form = null, input = null, message = "") {
  if (!input) return false;

  const hasError = Boolean(message);
  const error = findFieldError(form, input);

  input.classList.toggle(CLASSES.invalid, hasError);
  input.setAttribute("aria-invalid", hasError ? "true" : "false");

  if (error) {
    error.textContent = message;
    error.hidden = !hasError;

    if (hasError && error.id) {
      input.setAttribute("aria-describedby", error.id);
    }
  }

  return hasError;
}

function setFormStatus(refs = {}, message = "", type = "info") {
  const status = refs.formStatus;

  if (!status) return false;

  const clean = cleanText(message, "");

  status.textContent = clean;
  status.hidden = !clean;
  safeDataset(status, "status", clean ? type : "");

  return true;
}

function readFormPayload(form = null) {
  const payload = {};

  if (!form || !isBrowser()) return payload;

  const data = new FormData(form);

  for (const [key, value] of data.entries()) {
    if (value instanceof File) continue;

    const cleanKey = cleanText(key, "");

    if (!cleanKey) continue;

    payload[cleanKey] = cleanText(value, "");
  }

  return payload;
}

function validateForm(form = null) {
  const errors = [];

  if (!form) return errors;

  const controls = toArray(
    form.querySelectorAll("input, select, textarea")
  );

  for (const input of controls) {
    setFieldError(form, input, "");

    if (input.disabled || input.type === "hidden") {
      continue;
    }

    const value = cleanText(input.value || "", "");

    if (input.required && !value) {
      errors.push({
        input,
        message: `${fieldLabel(input)} es obligatorio.`,
      });

      continue;
    }

    if (input.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push({
        input,
        message: "Introduce un email válido.",
      });
    }
  }

  return errors;
}

function labelFromKey(key = "") {
  return cleanText(key, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function buildWhatsAppMessage(payload = {}) {
  const lines = [
    "Hola, vengo desde Onion Support.",
    "Quiero solicitar un diagnóstico/presupuesto.",
    "",
  ];

  for (const [key, value] of Object.entries(payload)) {
    const cleanValue = cleanText(value, "");

    if (!cleanValue) continue;

    lines.push(`${labelFromKey(key)}: ${cleanValue}`);
  }

  return lines.join("\n").trim();
}

function openWhatsAppFromForm(form = null, payload = {}) {
  if (!isBrowser() || !form) return false;

  const phone = cleanText(form.dataset.whatsappPhone || "", "").replace(/[^\d]/g, "");

  if (!phone) return false;

  const message = buildWhatsAppMessage(payload);
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  try {
    window.open(href, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    window.location.href = href;
    return true;
  }
}

/* =========================================================
   INIT MODULES
========================================================= */

function initBodyState(cleanups) {
  setBodyClass(BODY_CLASSES.screen, true);
  setBodyClass(BODY_CLASSES.mounted, true);

  cleanups.push(() => {
    setBodyClass(BODY_CLASSES.screen, false);
    setBodyClass(BODY_CLASSES.mounted, false);
    setBodyClass(BODY_CLASSES.menuOpen, false);
    setBodyClass(BODY_CLASSES.noScroll, false);
  });

  return true;
}

function initReadyState(refs, cleanups) {
  refs.root.classList.add(CLASSES.mounted);

  const frame = requestFrame(() => {
    refs.root.classList.add(CLASSES.ready);
    safeDataset(refs.root, "ready", "true");

    dispatchHomeEvent(refs.root, "public-home:ready", {
      ready: true,
    });
  });

  cleanups.push(() => {
    cancelFrame(frame);
    refs.root.classList.remove(CLASSES.mounted, CLASSES.ready);
    removeDataset(refs.root, "ready");
  });

  return true;
}

function initMenu(refs, cleanups) {
  let open = false;

  function openMenu(options = {}) {
    open = true;
    return setMenuOpen(refs, true, options);
  }

  function closeMenu(options = {}) {
    open = false;
    return setMenuOpen(refs, false, options);
  }

  function toggleMenu(event = null) {
    event?.preventDefault?.();

    return open ? closeMenu({ restoreFocus: true }) : openMenu({ focus: true });
  }

  function onDocumentPointerDown(event = null) {
    if (!open) return;

    const target = event?.target;

    if (!target) return;

    if (refs.nav?.contains?.(target)) return;

    closeMenu();
  }

  function onKeyDown(event = null) {
    if (!event) return;

    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu({
        restoreFocus: true,
      });

      return;
    }

    if (event.key !== "Tab" || !open) return;

    const focusables = getFocusable(refs.navMenu || refs.navPanel || refs.nav);

    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      focusSafe(last);
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      focusSafe(first);
    }
  }

  if (refs.navToggle) {
    refs.navToggle.setAttribute("aria-expanded", "false");
    addEvent(cleanups, refs.navToggle, "click", toggleMenu);
  }

  addEvent(cleanups, document, "pointerdown", onDocumentPointerDown, {
    passive: true,
  });

  addEvent(cleanups, document, "keydown", onKeyDown);

  setMenuOpen(refs, false);

  return {
    open: openMenu,
    close: closeMenu,
    toggle: toggleMenu,
    isOpen() {
      return open || isMenuOpen(refs);
    },
  };
}

function initAnchorScroll(refs, cleanups, menuControls) {
  function onClick(event = null) {
    if (!isPlainLeftClick(event)) return;

    const anchor = event.target?.closest?.("a[href]");

    if (!anchor || !refs.root.contains(anchor)) return;

    const hash = getAnchorHash(anchor);

    if (!hash) return;

    const target = getHashTarget(hash, refs);

    if (!target) return;

    event.preventDefault();

    menuControls?.close?.();

    const ok = scrollToHash(hash, refs, {
      push: true,
      focus: true,
    });

    dispatchHomeEvent(refs.root, "public-home:navigate-section", {
      hash,
      ok,
    });
  }

  addEvent(cleanups, refs.root, "click", onClick);

  return true;
}

function initCtaTracking(refs, cleanups) {
  function onClick(event = null) {
    const target = event?.target?.closest?.(
      [
        SELECTORS.cta,
        SELECTORS.login,
        "a[href^='tel:']",
        "a[href^='mailto:']",
        "a[href*='wa.me']",
        "a[href*='whatsapp']",
      ].join(",")
    );

    if (!target || !refs.root.contains(target)) return;

    dispatchHomeEvent(refs.root, "public-home:cta-click", {
      label: cleanText(target.textContent, ""),
      href: redact(target.getAttribute?.("href") || ""),
      kind:
        target.matches?.(SELECTORS.login)
          ? "login"
          : target.matches?.(SELECTORS.cta)
            ? "cta"
            : "contact",
    });
  }

  addEvent(cleanups, refs.root, "click", onClick, {
    capture: true,
  });

  return true;
}

function initScrollState(refs, cleanups) {
  let frame = 0;

  function getProgress() {
    if (!isBrowser()) return 0;

    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop || 0;
    const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);

    return Math.max(0, Math.min(1, scrollTop / maxScroll));
  }

  function sync() {
    frame = 0;

    const scrolled = isBrowser() && window.scrollY > 14;
    const progress = getProgress();
    const progressValue = progress.toFixed(4);

    refs.root.classList.toggle(CLASSES.scrolled, scrolled);
    refs.nav?.classList.toggle(CLASSES.scrolled, scrolled);
    safeDataset(refs.root, "scrolled", scrolled ? "true" : "false");
    safeDataset(refs.root, "scrollProgress", progressValue);
    setCssMetric(refs.root, "--public-home-scroll-progress", progressValue);
    setCssMetric(refs.nav, "--public-home-scroll-progress", progressValue);
  }

  function onScroll() {
    if (frame) return;

    frame = requestFrame(sync);
  }

  addEvent(cleanups, window, "scroll", onScroll, {
    passive: true,
  });

  addEvent(cleanups, window, "resize", onScroll, {
    passive: true,
  });

  sync();

  cleanups.push(() => {
    cancelFrame(frame);
    setCssMetric(refs.root, "--public-home-scroll-progress", "0");
    setCssMetric(refs.nav, "--public-home-scroll-progress", "0");
    removeDataset(refs.root, "scrollProgress");
  });

  return true;
}

function initActiveSection(refs, cleanups) {
  const sections = refs.sections || [];

  if (!sections.length) return false;

  let currentHash = "";

  function activate(hash = "") {
    const cleanHash = normalizeHash(hash);

    if (!cleanHash || cleanHash === currentHash) return false;

    currentHash = cleanHash;
    setActiveHash(refs, cleanHash);

    return true;
  }

  function fallbackSync() {
    activate(pickCurrentSection(refs));
  }

  if (isBrowser() && "IntersectionObserver" in window) {
    const visible = new Map();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const hash = sectionHash(entry.target);

          if (!hash) continue;

          if (entry.isIntersecting) {
            visible.set(hash, entry.intersectionRatio);
          } else {
            visible.delete(hash);
          }
        }

        let bestHash = "";
        let bestRatio = 0;

        for (const [hash, ratio] of visible.entries()) {
          if (ratio >= bestRatio) {
            bestRatio = ratio;
            bestHash = hash;
          }
        }

        activate(bestHash || pickCurrentSection(refs));
      },
      {
        root: null,
        rootMargin: ACTIVE_ROOT_MARGIN,
        threshold: [0, 0.12, 0.24, 0.42, 0.66, 0.88, 1],
      }
    );

    for (const section of sections) {
      observer.observe(section);
    }

    cleanups.push(() => {
      try {
        observer.disconnect();
      } catch {
        // noop
      }
    });
  } else {
    let frame = 0;

    function onScroll() {
      if (frame) return;

      frame = requestFrame(() => {
        frame = 0;
        fallbackSync();
      });
    }

    addEvent(cleanups, window, "scroll", onScroll, {
      passive: true,
    });

    cleanups.push(() => {
      cancelFrame(frame);
    });
  }

  fallbackSync();

  return true;
}

function initReveal(refs, cleanups) {
  const items = refs.revealItems || [];

  if (!items.length) return false;

  if (!isBrowser() || getReducedMotion() || !("IntersectionObserver" in window)) {
    for (const item of items) {
      item.classList.add(CLASSES.visible);
      safeDataset(item, "visible", "true");
    }

    return true;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        entry.target.classList.add(CLASSES.visible);
        safeDataset(entry.target, "visible", "true");
        observer.unobserve(entry.target);
      }
    },
    {
      root: null,
      rootMargin: "0px 0px -12% 0px",
      threshold: [0.08, 0.16, 0.32],
    }
  );

  for (const item of items) {
    observer.observe(item);
  }

  cleanups.push(() => {
    try {
      observer.disconnect();
    } catch {
      // noop
    }
  });

  return true;
}

function initPointerFx(refs, cleanups) {
  if (!isBrowser() || getReducedMotion()) return false;

  try {
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    if (!finePointer) return false;
  } catch {
    return false;
  }

  let frame = 0;
  let lastEvent = null;

  function sync() {
    frame = 0;

    if (!lastEvent || !refs.root) return;

    const rect = refs.root.getBoundingClientRect();
    const x = ((lastEvent.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    const y = ((lastEvent.clientY - rect.top) / Math.max(rect.height, 1)) * 100;

    refs.root.style.setProperty("--public-home-pointer-x", `${x.toFixed(2)}%`);
    refs.root.style.setProperty("--public-home-pointer-y", `${y.toFixed(2)}%`);
  }

  function onPointerMove(event = null) {
    lastEvent = event;

    if (frame) return;

    frame = requestFrame(sync);
  }

  addEvent(cleanups, refs.root, "pointermove", onPointerMove, {
    passive: true,
  });

  cleanups.push(() => {
    cancelFrame(frame);

    try {
      refs.root.style.removeProperty("--public-home-pointer-x");
      refs.root.style.removeProperty("--public-home-pointer-y");
    } catch {
      // noop
    }
  });

  return true;
}


function setCssMetric(node = null, key = "", value = "") {
  if (!node || !key) return false;

  try {
    node.style.setProperty(key, String(value));
    return true;
  } catch {
    return false;
  }
}

function parseNumber(value = "", fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));

  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCounterValue(value = 0, decimals = 0, suffix = "") {
  const precision = Math.max(0, Math.min(3, Number.parseInt(decimals, 10) || 0));
  const formatted = Number(value).toLocaleString("es-ES", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

  return `${formatted}${suffix}`;
}

function writeClipboard(value = "") {
  if (!isBrowser()) return Promise.resolve(false);

  const clean = cleanText(value, "");

  if (!clean) return Promise.resolve(false);

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(clean).then(() => true).catch(() => false);
  }

  return new Promise((resolve) => {
    try {
      const input = document.createElement("textarea");
      input.value = clean;
      input.setAttribute("readonly", "true");
      input.style.position = "fixed";
      input.style.inset = "0 auto auto -9999px";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand("copy");
      input.remove();
      resolve(Boolean(ok));
    } catch {
      resolve(false);
    }
  });
}

function initCopyActions(refs, cleanups) {
  const actions = refs.copyActions || [];

  if (!actions.length) return false;

  let timer = 0;

  async function onClick(event = null) {
    const action = event?.target?.closest?.(SELECTORS.copyAction);

    if (!action || !refs.root?.contains?.(action)) return;

    const value =
      action.getAttribute("data-copy-value") ||
      action.dataset.publicHomeCopy ||
      action.href ||
      action.textContent ||
      "";

    const ok = await writeClipboard(value);

    action.classList.toggle(CLASSES.copied, ok);
    safeDataset(action, "copied", ok ? "true" : "false");

    dispatchHomeEvent(refs.root, ok ? "public-home:copy-success" : "public-home:copy-fail", {
      ok,
      value: redact(value),
      label: cleanText(action.textContent, ""),
    });

    clearTimeout(timer);

    if (ok) {
      timer = window.setTimeout(() => {
        action.classList.remove(CLASSES.copied);
        removeDataset(action, "copied");
      }, 1500);
    }
  }

  addEvent(cleanups, refs.root, "click", onClick);

  cleanups.push(() => {
    clearTimeout(timer);
  });

  return true;
}

function animateCounter(node = null) {
  if (!node || node.dataset.counterAnimated === "true") return false;

  const target = parseNumber(node.dataset.counterTarget || node.textContent, 0);
  const start = parseNumber(node.dataset.counterStart || "0", 0);
  const decimals = Number.parseInt(node.dataset.counterDecimals || "0", 10) || 0;
  const suffix = cleanText(node.dataset.counterSuffix || "", "");
  const duration = Math.max(320, Math.min(2200, Number.parseInt(node.dataset.counterDuration || "1100", 10) || 1100));
  const reduced = getReducedMotion();

  node.dataset.counterAnimated = "true";
  node.classList.add(CLASSES.counterReady);

  if (reduced) {
    node.textContent = formatCounterValue(target, decimals, suffix);
    return true;
  }

  const startedAt = performance.now();

  function tick(now) {
    const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = start + (target - start) * eased;

    node.textContent = formatCounterValue(value, decimals, suffix);

    if (progress < 1) {
      requestFrame(tick);
    } else {
      node.textContent = formatCounterValue(target, decimals, suffix);
    }
  }

  requestFrame(tick);

  return true;
}

function initMetricCounters(refs, cleanups) {
  const counters = refs.metricCounters || [];

  if (!counters.length || !isBrowser()) return false;

  if (!("IntersectionObserver" in window)) {
    counters.forEach(animateCounter);
    return true;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    },
    {
      root: null,
      rootMargin: "0px 0px -8% 0px",
      threshold: [0.2, 0.45, 0.7],
    }
  );

  for (const counter of counters) {
    observer.observe(counter);
  }

  cleanups.push(() => {
    try {
      observer.disconnect();
    } catch {
      // noop
    }
  });

  return true;
}

function initMagneticCards(refs, cleanups) {
  const items = refs.magneticItems || [];

  if (!items.length || !isBrowser() || getReducedMotion()) return false;

  try {
    if (!window.matchMedia("(pointer: fine)").matches) return false;
  } catch {
    return false;
  }

  function onMove(event = null) {
    const item = event?.currentTarget;

    if (!item) return;

    const rect = item.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;

    item.classList.add(CLASSES.magnetic);
    setCssMetric(item, "--card-pointer-x", `${x.toFixed(2)}%`);
    setCssMetric(item, "--card-pointer-y", `${y.toFixed(2)}%`);
  }

  function onLeave(event = null) {
    const item = event?.currentTarget;

    if (!item) return;

    item.classList.remove(CLASSES.magnetic);
    setCssMetric(item, "--card-pointer-x", "50%");
    setCssMetric(item, "--card-pointer-y", "50%");
  }

  for (const item of items) {
    addEvent(cleanups, item, "pointermove", onMove, {
      passive: true,
    });
    addEvent(cleanups, item, "pointerleave", onLeave, {
      passive: true,
    });
  }

  return true;
}

function initDiagnosticForm(refs, cleanups) {
  const form = refs.diagnosticForm;

  if (!form) return false;

  let submitting = false;

  function setSubmitting(value = false) {
    submitting = Boolean(value);

    form.classList.toggle(CLASSES.submitting, submitting);
    safeDataset(form, "submitting", submitting ? "true" : "false");

    for (const node of toArray(form.querySelectorAll("button, input, select, textarea"))) {
      if (node.type === "hidden") continue;
      node.disabled = submitting;
    }
  }

  function onInput(event = null) {
    const input = event?.target;

    if (!input || !form.contains(input)) return;

    setFieldError(form, input, "");
    setFormStatus(refs, "", "info");
  }

  function onSubmit(event = null) {
    event?.preventDefault?.();

    if (submitting) return false;

    setFormStatus(refs, "", "info");

    const errors = validateForm(form);

    if (errors.length) {
      for (const error of errors) {
        setFieldError(form, error.input, error.message);
      }

      focusSafe(errors[0].input);

      setFormStatus(
        refs,
        "Revisa los campos marcados antes de enviar.",
        "error"
      );

      dispatchHomeEvent(refs.root, "public-home:diagnostic-invalid", {
        errors: errors.length,
      });

      return false;
    }

    const payload = readFormPayload(form);

    setSubmitting(true);

    try {
      const eventWasDispatched = dispatchHomeEvent(
        refs.root,
        "public-home:diagnostic-submit",
        {
          payload,
        }
      );

      const opened = openWhatsAppFromForm(form, payload);

      if (opened) {
        setFormStatus(
          refs,
          "Abriendo WhatsApp para enviar tu solicitud...",
          "success"
        );
      } else {
        setFormStatus(
          refs,
          "Solicitud preparada. Configura data-whatsapp-phone en el formulario para abrir WhatsApp.",
          "info"
        );
      }

      return eventWasDispatched;
    } catch {
      setFormStatus(
        refs,
        "No se pudo preparar la solicitud. Inténtalo de nuevo.",
        "error"
      );

      return false;
    } finally {
      window.setTimeout(() => {
        setSubmitting(false);
      }, 420);
    }
  }

  addEvent(cleanups, form, "submit", onSubmit);
  addEvent(cleanups, form, "input", onInput);
  addEvent(cleanups, form, "change", onInput);

  return true;
}

function initInitialHash(refs) {
  if (!isBrowser()) return false;

  const hash = cleanText(window.location.hash, "");

  if (!hash || hash === "#") return false;

  requestFrame(() => {
    scrollToHash(hash, refs, {
      push: false,
      replace: true,
      focus: false,
      behavior: "auto",
    });
  });

  return true;
}

/* =========================================================
   INSTANCE
========================================================= */

function destroyPrevious(container) {
  const previous = INSTANCES.get(container);

  if (previous?.destroy) {
    previous.destroy({
      remount: true,
    });

    return true;
  }

  return false;
}

function storeInstance(container, instance) {
  INSTANCES.set(container, instance);
  lastInstance = instance;

  return true;
}

function clearInstance(container, instance) {
  if (INSTANCES.get(container) === instance) {
    INSTANCES.delete(container);
  }

  if (lastInstance === instance) {
    lastInstance = null;
  }

  return true;
}

/* =========================================================
   VIEW
========================================================= */

export function renderPublicHomeView(container, context = {}) {
  if (!isBrowser()) return null;

  if (!container) {
    throw new Error("[PublicHomeView] container requerido.");
  }

  destroyPrevious(container);

  const cleanups = [];

  const view = mountTemplate(container);
  const refs = getRefs(view);

  let mounted = true;

  initBodyState(cleanups);
  initReadyState(refs, cleanups);

  const menuControls = initMenu(refs, cleanups);

  initAnchorScroll(refs, cleanups, menuControls);
  initCtaTracking(refs, cleanups);
  initScrollState(refs, cleanups);
  initActiveSection(refs, cleanups);
  initReveal(refs, cleanups);
  initPointerFx(refs, cleanups);
  initCopyActions(refs, cleanups);
  initMetricCounters(refs, cleanups);
  initMagneticCards(refs, cleanups);
  initDiagnosticForm(refs, cleanups);
  initInitialHash(refs);

  const instance = {
    version: PUBLIC_HOME_VIEW_VERSION,

    root: refs.root,
    view,

    scrollTo(hash = "", options = {}) {
      return scrollToHash(hash, refs, {
        push: true,
        focus: true,
        ...options,
      });
    },

    openMenu() {
      return menuControls?.open?.({
        focus: true,
      });
    },

    closeMenu() {
      return menuControls?.close?.({
        restoreFocus: true,
      });
    },

    toggleMenu() {
      return menuControls?.toggle?.();
    },

    refreshActiveSection() {
      const hash = pickCurrentSection(refs);

      if (!hash) return false;

      return setActiveHash(refs, hash);
    },

    destroy(options = {}) {
      mounted = false;

      try {
        menuControls?.close?.();
      } catch {
        // noop
      }

      for (const cleanup of cleanups.splice(0)) {
        try {
          cleanup?.();
        } catch {
          // noop
        }
      }

      try {
        refs.root.classList.remove(
          CLASSES.mounted,
          CLASSES.ready,
          CLASSES.menuOpen,
          CLASSES.scrolled
        );
      } catch {
        // noop
      }

      if (!options?.keepDom) {
        try {
          clearNode(container);
        } catch {
          // noop
        }
      }

      clearInstance(container, instance);

      return true;
    },

    getSnapshot() {
      const router = getRouter(context);
      const auth = getAuth(context);

      return {
        version: PUBLIC_HOME_VIEW_VERSION,
        source: SOURCE,
        mounted,
        ready: refs.root?.dataset?.ready === "true",
        menuOpen: menuControls?.isOpen?.() === true,
        activeSection: refs.root?.dataset?.activeSection || null,
        sectionCount: refs.sections?.length || 0,
        navLinkCount: refs.navLinks?.length || 0,
        revealCount: refs.revealItems?.length || 0,
        hasDiagnosticForm: Boolean(refs.diagnosticForm),
        copyActionCount: refs.copyActions?.length || 0,
        metricCounterCount: refs.metricCounters?.length || 0,
        magneticItemCount: refs.magneticItems?.length || 0,
        reducedMotion: getReducedMotion(),
        routerAvailable: Boolean(
          router?.navigate ||
            router?.replace ||
            router?.push ||
            router?.go
        ),
        authenticated: auth?.isAuthenticated?.() === true,
        currentPath: isBrowser()
          ? redact(
              `${window.location.pathname}${window.location.search}${window.location.hash}`
            )
          : null,
      };
    },

    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };

  storeInstance(container, instance);

  return instance;
}

/* =========================================================
   EXPORTS
========================================================= */

export function init(container, context = {}) {
  return renderPublicHomeView(container, context);
}

export function mount(container, context = {}) {
  return renderPublicHomeView(container, context);
}

export function destroy(options = {}) {
  try {
    return Boolean(lastInstance?.destroy?.(options));
  } catch {
    return false;
  }
}

export function getSnapshot() {
  if (lastInstance?.getSnapshot) {
    return lastInstance.getSnapshot();
  }

  const auth = getAuth();

  return {
    version: PUBLIC_HOME_VIEW_VERSION,
    source: SOURCE,
    mounted: false,
    authenticated: auth?.isAuthenticated?.() === true,
    browser: isBrowser(),
  };
}

export const getDebugSnapshot = getSnapshot;

export const PublicHomeView = Object.assign(
  function PublicHomeViewCompat(container, context = {}) {
    return renderPublicHomeView(container, context);
  },
  {
    version: PUBLIC_HOME_VIEW_VERSION,
    render: renderPublicHomeView,
    init,
    mount,
    destroy,
    getSnapshot,
    getDebugSnapshot,
  }
);

export { renderPublicHomeView as render };

export default PublicHomeView;
