/* =========================================================
   Onion Support - Sidebar Events
   Archivo: /src/ui/sidebar/events.js

   Responsabilidad:
   - Un único listener delegado sobre el root del sidebar.
   - Click en enlace -> navigateFromSidebar().
   - Click en toggle -> toggleSidebar().
   - Click en logout -> handleLogout().
   - Respetar el dropdown de cuenta sin gestionarlo.
   - Delegar normalización/validación de navegación en actions.js.
   - Bloquear href sensibles antes de que navegue el navegador.
   - Rechazar rutas bloqueadas vía actions.js -> constants.js -> core/config.js.
   - Selectores compartidos desde constants.js.
   - Sin navegación propia.
   - Sin active menu propio.
   - Sin indicadores.
   - Sin resize.
   - Sin abrir/cerrar dropdown.
   - Sin keydown custom.
   - Sin core event storms.
   - Sin CustomEvent.
   - Sin timers.
   - Sin Auth directo.
   - Sin Router directo.
   - Sin Store.
   - Sin Toast.
   - Sin denylist local.
   - Sin /home.
   - Sin /403.
   - Sin /404.
   - Sin 2FA/MFA/OTP.
========================================================= */

import {
  SIDEBAR_SELECTORS,
} from "./constants.js";

import {
  getSidebarRoot,
  isElement,
} from "./dom.js";

import {
  getSafeSidebarTarget,
  handleLogout,
  navigateFromSidebar,
  toggleSidebar,
} from "./actions.js";

export const SIDEBAR_EVENTS_VERSION = "sidebar.events.v7.constants-selectors";

const HANDLED_FLAG = "__onionSidebarHandled";

const DROPDOWN_TRIGGER_SELECTOR =
  SIDEBAR_SELECTORS.dropdownTrigger || "[data-sidebar-dropdown-trigger]";

let boundRoot = null;
let boundHandler = null;
let boundContext = null;

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function contextOf(value = {}) {
  return isObject(value) ? value : {};
}

function eventTarget(event = null) {
  const target = event?.target || null;
  return target?.nodeType === 3 ? target.parentElement : target;
}

function contains(root = null, element = null) {
  try {
    return Boolean(root && element && (root === element || root.contains(element)));
  } catch {
    return false;
  }
}

function closestInside(root = null, target = null, selector = "") {
  if (!isElement(root) || !target || !selector) return null;

  try {
    const element = target.closest?.(selector);
    return contains(root, element) ? element : null;
  } catch {
    return null;
  }
}

function resolveRoot(context = {}) {
  return isElement(context.root) ? context.root : getSidebarRoot();
}

/* =========================================================
   EVENT SAFETY
========================================================= */

function wasHandled(event = null) {
  return Boolean(event?.[HANDLED_FLAG]);
}

function markHandled(event = null) {
  try {
    event[HANDLED_FLAG] = true;
    return true;
  } catch {
    return false;
  }
}

function prevent(event = null) {
  try {
    event?.preventDefault?.();
  } catch {
    // noop
  }

  return true;
}

function isPlainLeftClick(event = null) {
  if (!event) return true;

  return (
    event.button === 0 &&
    event.metaKey !== true &&
    event.ctrlKey !== true &&
    event.shiftKey !== true &&
    event.altKey !== true
  );
}

function browserOwnsClick(link = null, event = null) {
  if (!isElement(link)) return true;
  if (!isPlainLeftClick(event)) return true;
  if (link.hasAttribute("download")) return true;

  const target = text(link.getAttribute("target"), "").toLowerCase();

  return target === "_blank";
}

function isBlocked(element = null) {
  if (!isElement(element)) return true;

  return Boolean(
    element.hidden ||
      element.disabled === true ||
      element.getAttribute("aria-hidden") === "true" ||
      element.getAttribute("aria-disabled") === "true" ||
      element.dataset?.disabled === "true" ||
      element.closest("[hidden], [aria-hidden='true'], [aria-disabled='true'], [data-disabled='true']")
  );
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function isDangerousHref(value = "") {
  const href = text(value, "");
  const lower = href.toLowerCase();

  return Boolean(
    !href ||
      hasSensitiveQuery(href) ||
      href.startsWith("//") ||
      /[\r\n\t\\]/.test(href) ||
      lower.startsWith("javascript:") ||
      lower.startsWith("data:") ||
      lower.startsWith("vbscript:") ||
      lower.startsWith("file:") ||
      lower.startsWith("blob:") ||
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      /^[a-z][a-z0-9+.-]*:/i.test(href)
  );
}

function shouldSwallowInvalidSidebarHref(link = null, rawHref = "") {
  if (!isElement(link)) return false;

  return Boolean(
    link.hasAttribute("data-spa") ||
      link.hasAttribute("data-sidebar-link") ||
      link.hasAttribute("data-sidebar-nav-link") ||
      link.hasAttribute("data-sidebar-brand") ||
      link.hasAttribute("data-sidebar-dropdown-item") ||
      rawHref.startsWith("/")
  );
}

/* =========================================================
   SELECTORS
========================================================= */

function selectorList(...selectors) {
  return selectors
    .flat()
    .map((selector) => text(selector, ""))
    .filter(Boolean)
    .join(",");
}

function sidebarLinkSelector() {
  return selectorList(
    SIDEBAR_SELECTORS.navLink,
    SIDEBAR_SELECTORS.brand,
    SIDEBAR_SELECTORS.link,
    "a[data-spa]",
    "a[data-sidebar-link='true']",
    "a[data-sidebar-nav-link='true']",
    "a[data-sidebar-dropdown-item='true']"
  );
}

function sidebarToggleSelector() {
  return selectorList(
    SIDEBAR_SELECTORS.toggle,
    "[data-sidebar-toggle='true']",
    "[data-sidebar-action='toggle']"
  );
}

function sidebarLogoutSelector() {
  return selectorList(
    SIDEBAR_SELECTORS.logout,
    "[data-sidebar-logout='true']",
    "[data-sidebar-action='logout']",
    "[data-sidebar-menu-action='logout']"
  );
}

/* =========================================================
   TARGETS
========================================================= */

function getLinkTarget(link = null) {
  if (!isElement(link)) return "";

  return text(
    link.dataset?.route ||
      link.dataset?.href ||
      link.dataset?.to ||
      link.getAttribute("data-route") ||
      link.getAttribute("data-href") ||
      link.getAttribute("data-to") ||
      link.getAttribute("href"),
    ""
  );
}

function getNavigableTarget(rawHref = "") {
  if (isDangerousHref(rawHref)) return "";

  /*
    La normalización real se delega en actions.js:
    - rechaza rutas bloqueadas;
    - rechaza rutas bloqueadas bajo /@{slug};
    - preserva /@{slug}/ruta si es válida;
    - evita queries sensibles.
  */
  return getSafeSidebarTarget(rawHref, "");
}

/* =========================================================
   HANDLER
========================================================= */

export function handleSidebarClick(event = null, context = {}) {
  if (wasHandled(event)) return false;
  if (event?.defaultPrevented === true) return false;

  const ctx = contextOf(context);
  const root = resolveRoot(ctx);
  const target = eventTarget(event);

  if (!isElement(root) || !contains(root, target)) {
    return false;
  }

  /*
    El trigger del dropdown lo gestiona dropdown.js.
    Este módulo no abre/cierra menús.
  */
  const dropdownTrigger = closestInside(root, target, DROPDOWN_TRIGGER_SELECTOR);

  if (dropdownTrigger && !isBlocked(dropdownTrigger)) {
    return false;
  }

  const logout = closestInside(root, target, sidebarLogoutSelector());

  if (logout && !isBlocked(logout)) {
    prevent(event);
    markHandled(event);

    void handleLogout({
      ...ctx,
      root,
    });

    return true;
  }

  const toggle = closestInside(root, target, sidebarToggleSelector());

  if (toggle && !isBlocked(toggle)) {
    prevent(event);
    markHandled(event);

    toggleSidebar({
      ...ctx,
      root,
    });

    return true;
  }

  const link = closestInside(root, target, sidebarLinkSelector());

  if (!link) return false;
  if (isBlocked(link)) return false;

  const rawHref = getLinkTarget(link);

  /*
    Nunca permitir que un enlace del sidebar navegue con tokens/códigos
    o protocolos no SPA por navegación nativa.
  */
  if (isDangerousHref(rawHref)) {
    if (shouldSwallowInvalidSidebarHref(link, rawHref)) {
      prevent(event);
      markHandled(event);
      return true;
    }

    return false;
  }

  if (browserOwnsClick(link, event)) {
    return false;
  }

  const targetPath = getNavigableTarget(rawHref);

  if (!targetPath) {
    if (shouldSwallowInvalidSidebarHref(link, rawHref)) {
      prevent(event);
      markHandled(event);
      return true;
    }

    return false;
  }

  prevent(event);
  markHandled(event);

  void navigateFromSidebar({
    ...ctx,
    root,
    target: targetPath,
  });

  return true;
}

/* =========================================================
   BIND / UNBIND
========================================================= */

export function bindSidebarEvents(context = {}) {
  const ctx = contextOf(context);
  const root = resolveRoot(ctx);

  if (!isElement(root)) return false;

  const nextContext = {
    ...ctx,
    root,
  };

  if (boundRoot === root && boundHandler) {
    boundContext = nextContext;
    return true;
  }

  unbindSidebarEvents();

  boundRoot = root;
  boundContext = nextContext;

  boundHandler = (event) => {
    handleSidebarClick(event, boundContext || {});
  };

  try {
    root.addEventListener("click", boundHandler);
    return true;
  } catch {
    boundRoot = null;
    boundHandler = null;
    boundContext = null;
    return false;
  }
}

export function unbindSidebarEvents() {
  try {
    if (boundRoot && boundHandler) {
      boundRoot.removeEventListener("click", boundHandler);
    }
  } catch {
    // noop
  }

  boundRoot = null;
  boundHandler = null;
  boundContext = null;

  return true;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarEventsSnapshot() {
  return {
    version: SIDEBAR_EVENTS_VERSION,

    bound: Boolean(boundRoot && boundHandler),
    hasRoot: isElement(boundRoot),
    rootId: boundRoot?.id || "",

    selectors: {
      dropdownTrigger: DROPDOWN_TRIGGER_SELECTOR,
    },

    policy: {
      delegatedOnly: true,

      ownNavigation: false,
      ownActiveMenu: false,
      ownIndicators: false,
      ownResize: false,
      ownDropdown: false,
      dropdownAware: true,
      dropdownSelectorFromConstants: true,
      ownKeydown: false,
      ownCustomEvent: false,
      ownTimers: false,

      navigationDelegatedToActions: true,
      targetNormalizationDelegatedToActions: true,

      rejectsSensitiveHref: true,
      rejectsBlockedHrefViaActionsConstantsAndCoreConfig: true,
      swallowsInvalidSidebarSpaHref: true,

      noRouterDirect: true,
      noAuthDirect: true,
      noStorage: true,
      noToast: true,
      noLocalBlockedRouteList: true,

      noHomeRoute: true,
      no403Route: true,
      no404Route: true,
      no2fa: true,
      noMfa: true,
      noOtp: true,
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_EVENTS_VERSION,

  handleSidebarClick,

  bindSidebarEvents,
  unbindSidebarEvents,

  getSidebarEventsSnapshot,
};
