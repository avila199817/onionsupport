/* =========================================================
   Onion Support - Public Home View Controller
   Archivo: /src/views/public/home/index.js

   Runtime 2026 orientado a presupuesto de frame:
   - Un único scroll host y un único listener de scroll.
   - Como máximo un requestAnimationFrame pendiente por pipeline.
   - Geometría estructural cacheada e invalidada con ResizeObserver/resize.
   - Sin polling/heartbeat, wheel/touchmove/keydown ni document-scroll global.
   - Lecturas de layout separadas de escrituras visuales.
   - IntersectionObserver para sección activa, reveal y footer.
   - Cleanup completo y contrato público compatible con el Router.
========================================================= */

import { AppCore } from "../../../core/index.js";
import createPublicHomeTemplate from "./template.js";

export const PUBLIC_HOME_VIEW_VERSION =
  "public.home.view.controller.2026.24.frame-budgeted-scroll";

const SOURCE = "public.home.view";
const DEFAULT_SCROLL_OFFSET = 92;
const ACTIVE_ROOT_MARGIN = "-34% 0px -54% 0px";
const INSTANCES = new WeakMap();
const STYLE_CACHE = new WeakMap();
let lastInstance = null;

const BODY_CLASSES = Object.freeze({
  screen: "public-home-screen",
  mounted: "public-home-mounted",
  menuOpen: "public-home-menu-open",
  noScroll: "public-home-no-scroll",
});

const CLASSES = Object.freeze({
  mounted: "is-mounted",
  ready: "is-ready",
  active: "is-active",
  visible: "is-visible",
  menuOpen: "is-menu-open",
  scrolled: "is-scrolled",
  footerVisible: "is-footer-visible",
  copied: "is-copied",
  counterReady: "is-counter-ready",
  magnetic: "is-magnetic",
});

const SELECTORS = Object.freeze({
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
  copyAction: "[data-public-home-copy]",
  metricCounter: "[data-public-home-counter]",
  magnetic: "[data-public-home-magnetic]",
  customScrollbar: "[data-public-home-scrollbar]",
  customScrollbarThumb: "[data-public-home-scrollbar-thumb]",
});

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
  return (
    String(value ?? "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || fallback
  );
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

function toArray(value) {
  try {
    return Array.from(value || []).filter(Boolean);
  } catch {
    return [];
  }
}

function requestFrame(callback) {
  if (!isFunction(callback)) return 0;
  return isBrowser() && isFunction(window.requestAnimationFrame)
    ? window.requestAnimationFrame(callback)
    : setTimeout(callback, 16);
}

function cancelFrame(id = 0) {
  if (!id) return;
  if (isBrowser() && isFunction(window.cancelAnimationFrame)) {
    window.cancelAnimationFrame(id);
  } else {
    clearTimeout(id);
  }
}

function addEvent(cleanups, target, type, listener, options) {
  if (!target?.addEventListener || !isFunction(listener)) return false;
  target.addEventListener(type, listener, options);
  cleanups.push(() => target.removeEventListener(type, listener, options));
  return true;
}

function setBodyClass(className, enabled) {
  document.body?.classList.toggle(className, Boolean(enabled));
}

function setDataset(node, key, value) {
  if (!node?.dataset || !key) return false;
  const next = String(value);
  if (node.dataset[key] === next) return false;
  node.dataset[key] = next;
  return true;
}

function removeDataset(node, key) {
  if (!node?.dataset || !(key in node.dataset)) return false;
  delete node.dataset[key];
  return true;
}

function setClass(node, className, enabled) {
  if (!node?.classList || !className) return false;
  const next = Boolean(enabled);
  if (node.classList.contains(className) === next) return false;
  node.classList.toggle(className, next);
  return true;
}

function setCssMetric(node, key, value) {
  if (!node?.style || !key) return false;
  let cache = STYLE_CACHE.get(node);
  if (!cache) {
    cache = new Map();
    STYLE_CACHE.set(node, cache);
  }
  const next = String(value);
  if (cache.get(key) === next) return false;
  cache.set(key, next);
  node.style.setProperty(key, next);
  return true;
}

function removeCssMetric(node, key) {
  if (!node?.style || !key) return;
  STYLE_CACHE.get(node)?.delete(key);
  node.style.removeProperty(key);
}

function dispatchHomeEvent(root, name, detail = {}) {
  if (!root || !name) return false;
  try {
    return root.dispatchEvent(
      new CustomEvent(name, {
        bubbles: true,
        cancelable: true,
        detail: { source: SOURCE, version: PUBLIC_HOME_VIEW_VERSION, ...detail },
      })
    );
  } catch {
    return false;
  }
}

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function focusSafe(node) {
  if (!node?.focus) return false;
  try {
    node.focus({ preventScroll: true });
  } catch {
    try {
      node.focus();
    } catch {
      return false;
    }
  }
  return true;
}

function htmlToElement(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "").trim();
  return template.content.firstElementChild || null;
}

function resolveTemplate() {
  if (!isFunction(createPublicHomeTemplate)) {
    throw new Error("[PublicHomeView] template.js debe exportar createPublicHomeTemplate().");
  }
  const output = createPublicHomeTemplate();
  if (typeof Node !== "undefined" && output instanceof Node) return output;
  if (typeof output === "string") {
    const node = htmlToElement(output);
    if (node) return node;
  }
  throw new Error("[PublicHomeView] template público inválido.");
}

function mountTemplate(container) {
  const view = resolveTemplate();
  container.replaceChildren(view);
  return view;
}

function getRefs(view) {
  const root = view.matches?.(SELECTORS.root)
    ? view
    : view.querySelector?.(SELECTORS.root) || view;
  if (!root) throw new Error("[PublicHomeView] falta [data-public-home].");

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
    copyActions: toArray(root.querySelectorAll(SELECTORS.copyAction)),
    metricCounters: toArray(root.querySelectorAll(SELECTORS.metricCounter)),
    magneticItems: toArray(root.querySelectorAll(SELECTORS.magnetic)),
    customScrollbar: root.querySelector(SELECTORS.customScrollbar),
    customScrollbarThumb: root.querySelector(SELECTORS.customScrollbarThumb),
  };

  if (!refs.navLinks.length) {
    refs.navLinks = toArray(
      root.querySelectorAll(`${SELECTORS.nav} a[href], ${SELECTORS.navMenu} a[href]`)
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

function isScrollableElement(node) {
  if (!node || node === document.body || node === document.documentElement) return false;
  try {
    const style = window.getComputedStyle(node);
    return (
      /auto|scroll|overlay/.test(String(style.overflowY || style.overflow || "")) &&
      node.scrollHeight - node.clientHeight > 2
    );
  } catch {
    return false;
  }
}

function resolveScrollHost(refs) {
  const candidates = [
    refs.root.closest?.(".main-content"),
    refs.root.closest?.("[data-scroll-container]"),
    refs.root.closest?.(".public-auth-body"),
    refs.root.closest?.(".public-auth-shell--home"),
    document.querySelector(".main-content"),
    document.querySelector("[data-scroll-container]"),
    document.querySelector(".public-auth-body"),
  ].filter(Boolean);

  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (isScrollableElement(candidate)) return candidate;
  }
  return window;
}

function isWindowHost(host) {
  return !host || host === window;
}

function hostScrollTop(host) {
  if (isWindowHost(host)) {
    return Math.max(
      0,
      window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0
    );
  }
  return Math.max(0, host.scrollTop || 0);
}

function hostScrollTo(host, top, behavior = "auto") {
  const next = Math.max(0, Number(top) || 0);
  try {
    if (isWindowHost(host)) window.scrollTo({ top: next, behavior });
    else host.scrollTo({ top: next, behavior });
    return true;
  } catch {
    if (isWindowHost(host)) window.scrollTo(0, next);
    else host.scrollTop = next;
    return true;
  }
}

function getScrollOffset(refs) {
  try {
    const cssValue = window
      .getComputedStyle(refs.root)
      .getPropertyValue("--public-home-scroll-offset");
    const parsed = Number.parseFloat(cssValue);
    if (Number.isFinite(parsed)) return parsed;
  } catch {
    // fallback below
  }
  return Math.max(
    DEFAULT_SCROLL_OFFSET,
    Math.ceil((refs.nav?.getBoundingClientRect?.().height || 0) + 18)
  );
}

function normalizeHash(value = "") {
  const clean = cleanText(value, "");
  if (!clean) return "";
  return clean.startsWith("#") ? clean : `#${clean}`;
}

function decodeHashId(hash = "") {
  const raw = normalizeHash(hash).slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function getAnchorHash(anchor) {
  const raw = cleanText(anchor?.getAttribute?.("href") || "", "");
  if (!raw || raw === "#") return "";
  if (raw.startsWith("#")) return raw;
  try {
    const url = new URL(anchor.href, window.location.href);
    if (
      url.origin === window.location.origin &&
      url.pathname === window.location.pathname &&
      url.search === window.location.search
    ) {
      return url.hash && url.hash !== "#" ? url.hash : "";
    }
  } catch {
    // not an internal anchor
  }
  return "";
}

function getHashTarget(hash, refs) {
  const id = decodeHashId(hash);
  if (!id) return null;
  const node = document.getElementById(id);
  return node && refs.root.contains(node) ? node : null;
}

function replaceHash(hash) {
  if (!hash) return false;
  try {
    const next = `${window.location.pathname}${window.location.search}${hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === next) {
      return true;
    }
    window.history.replaceState({ source: SOURCE }, "", next);
    return true;
  } catch {
    return false;
  }
}

function sectionHash(section) {
  const id = cleanText(section?.id || section?.dataset?.publicHomeSection || "", "");
  return id ? `#${id}` : "";
}

function setActiveHash(refs, hash, state) {
  const clean = normalizeHash(hash);
  if (!clean || state.activeHash === clean) return false;
  state.activeHash = clean;
  const activeId = decodeHashId(clean);
  setDataset(refs.root, "activeSection", activeId);

  for (const link of refs.navLinks) {
    const active = getAnchorHash(link) === clean;
    setClass(link, CLASSES.active, active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }

  dispatchHomeEvent(refs.root, "public-home:section-change", {
    hash: clean,
    section: activeId,
  });
  return true;
}

function scrollToHash(hash, refs, host, activeState, options = {}) {
  const clean = normalizeHash(hash);
  const target = getHashTarget(clean, refs);
  if (!target) return false;

  const behavior = options.behavior || (reducedMotion() ? "auto" : "smooth");
  const offset = getScrollOffset(refs);
  const targetRect = target.getBoundingClientRect();
  const hostTop = isWindowHost(host) ? 0 : host.getBoundingClientRect().top;
  const top = hostScrollTop(host) + targetRect.top - hostTop - offset;
  hostScrollTo(host, top, behavior);
  setActiveHash(refs, clean, activeState);
  if (options.replace !== false) replaceHash(clean);

  if (options.focus) {
    const hadTabIndex = target.hasAttribute("tabindex");
    if (!hadTabIndex) target.setAttribute("tabindex", "-1");
    const timer = window.setTimeout(() => {
      focusSafe(target);
      if (!hadTabIndex) target.removeAttribute("tabindex");
    }, behavior === "smooth" ? 260 : 0);
    options.cleanups?.push?.(() => window.clearTimeout(timer));
  }
  return true;
}

function initBodyState(refs, cleanups) {
  setBodyClass(BODY_CLASSES.screen, true);
  setBodyClass(BODY_CLASSES.mounted, true);
  setClass(refs.root, CLASSES.mounted, true);

  const frame = requestFrame(() => {
    setClass(refs.root, CLASSES.ready, true);
    setDataset(refs.root, "ready", "true");
    dispatchHomeEvent(refs.root, "public-home:ready", { ready: true });
  });

  cleanups.push(() => {
    cancelFrame(frame);
    setBodyClass(BODY_CLASSES.screen, false);
    setBodyClass(BODY_CLASSES.mounted, false);
    setBodyClass(BODY_CLASSES.menuOpen, false);
    setBodyClass(BODY_CLASSES.noScroll, false);
    setClass(refs.root, CLASSES.mounted, false);
    setClass(refs.root, CLASSES.ready, false);
    removeDataset(refs.root, "ready");
  });
}

function getFocusable(container) {
  return toArray(
    container?.querySelectorAll?.(
      "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])"
    )
  ).filter((node) => {
    try {
      return node.offsetParent !== null || node === document.activeElement;
    } catch {
      return true;
    }
  });
}

function initMenu(refs, cleanups) {
  let open = false;

  function apply(next, options = {}) {
    open = Boolean(next);
    for (const node of [refs.root, refs.nav, refs.navMenu, refs.navPanel]) {
      setClass(node, CLASSES.menuOpen, open);
    }
    setDataset(refs.root, "menuOpen", open ? "true" : "false");
    if (refs.navToggle) {
      refs.navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    setBodyClass(BODY_CLASSES.menuOpen, open);
    setBodyClass(BODY_CLASSES.noScroll, open);
    dispatchHomeEvent(refs.root, open ? "public-home:menu-open" : "public-home:menu-close", {
      open,
    });

    if (open && options.focus !== false) {
      focusSafe(getFocusable(refs.navMenu || refs.navPanel || refs.nav)[0] || refs.navToggle);
    } else if (!open && options.restoreFocus) {
      focusSafe(refs.navToggle);
    }
    return true;
  }

  const controls = {
    open: (options = {}) => apply(true, options),
    close: (options = {}) => apply(false, options),
    toggle: () => apply(!open, { focus: !open, restoreFocus: open }),
    isOpen: () => open,
  };

  if (refs.navToggle) {
    refs.navToggle.setAttribute("aria-expanded", "false");
    addEvent(cleanups, refs.navToggle, "click", (event) => {
      event.preventDefault();
      controls.toggle();
    });
  }

  addEvent(cleanups, document, "pointerdown", (event) => {
    if (open && !refs.nav?.contains?.(event.target)) controls.close();
  }, { passive: true });

  addEvent(cleanups, document, "keydown", (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      controls.close({ restoreFocus: true });
      return;
    }
    if (event.key !== "Tab") return;
    const items = getFocusable(refs.navMenu || refs.navPanel || refs.nav);
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      focusSafe(last);
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      focusSafe(first);
    }
  });

  apply(false, { focus: false });
  return controls;
}

function initAnchorScroll(refs, cleanups, host, activeState, menu) {
  addEvent(cleanups, refs.root, "click", (event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;

    const anchor = event.target?.closest?.("a[href]");
    if (!anchor || !refs.root.contains(anchor)) return;
    const hash = getAnchorHash(anchor);
    if (!hash || !getHashTarget(hash, refs)) return;

    event.preventDefault();
    menu.close({ focus: false });
    const ok = scrollToHash(hash, refs, host, activeState, {
      replace: true,
      focus: true,
      cleanups,
    });
    dispatchHomeEvent(refs.root, "public-home:navigate-section", { hash, ok });
  });
}

function initCtaTracking(refs, cleanups) {
  addEvent(cleanups, refs.root, "click", (event) => {
    const target = event.target?.closest?.(
      `${SELECTORS.cta},${SELECTORS.login},a[href^='tel:'],a[href^='mailto:'],a[href*='wa.me'],a[href*='whatsapp']`
    );
    if (!target || !refs.root.contains(target)) return;
    dispatchHomeEvent(refs.root, "public-home:cta-click", {
      label: cleanText(target.textContent, ""),
      href: redact(target.getAttribute?.("href") || ""),
      kind: target.matches?.(SELECTORS.login)
        ? "login"
        : target.matches?.(SELECTORS.cta)
          ? "cta"
          : "contact",
    });
  }, { capture: true });
}

function createFrameScheduler(task) {
  let frame = 0;
  return {
    schedule() {
      if (frame) return false;
      frame = requestFrame(() => {
        frame = 0;
        task();
      });
      return true;
    },
    flush() {
      if (frame) cancelFrame(frame);
      frame = 0;
      task();
    },
    cancel() {
      cancelFrame(frame);
      frame = 0;
    },
  };
}

function initScrollPipeline(refs, cleanups, host) {
  const state = {
    metricsDirty: true,
    max: 1,
    viewport: 1,
    scrollSize: 1,
    trackRect: null,
    thumbSize: 0,
    travel: 1,
    progressValue: null,
    progressPercent: null,
    thumbTop: null,
    thumbCenter: null,
    scrolled: null,
  };

  function measureGeometry() {
    state.metricsDirty = false;
    if (isWindowHost(host)) {
      const doc = document.documentElement;
      const body = document.body;
      state.viewport = Math.max(1, window.innerHeight || doc?.clientHeight || 1);
      state.scrollSize = Math.max(
        state.viewport,
        doc?.scrollHeight || 0,
        body?.scrollHeight || 0,
        doc?.offsetHeight || 0,
        body?.offsetHeight || 0
      );
    } else {
      state.viewport = Math.max(1, host.clientHeight || 1);
      state.scrollSize = Math.max(state.viewport, host.scrollHeight || state.viewport);
    }
    state.max = Math.max(1, state.scrollSize - state.viewport);

    const track = refs.customScrollbar;
    const thumb = refs.customScrollbarThumb;
    if (track && thumb) {
      state.trackRect = track.getBoundingClientRect();
      const trackSize = Math.max(1, state.trackRect.height || 1);
      const ratio = Math.max(0.08, Math.min(1, state.viewport / state.scrollSize));
      const maxThumbSize = Math.max(82, Math.round(trackSize * 0.24));
      state.thumbSize = Math.max(
        58,
        Math.min(trackSize, Math.min(maxThumbSize, Math.round(trackSize * ratio)))
      );
      state.travel = Math.max(1, trackSize - state.thumbSize);
      setCssMetric(refs.root, "--public-home-scrollbar-thumb-size", `${Math.round(state.thumbSize)}px`);
      setCssMetric(track, "--public-home-scrollbar-thumb-size", `${Math.round(state.thumbSize)}px`);
    } else {
      state.trackRect = null;
      state.thumbSize = 0;
      state.travel = 1;
    }
  }

  function writeProgress() {
    if (state.metricsDirty) measureGeometry();

    const top = Math.max(0, Math.min(state.max, hostScrollTop(host)));
    const progress = Math.max(0, Math.min(1, top / state.max));
    const progressValue = progress.toFixed(4);
    const progressPercent = `${(progress * 100).toFixed(2)}%`;
    const scrolled = top > 14;
    const thumbTopNumber = Math.round(state.travel * progress);
    const thumbTop = `${thumbTopNumber}px`;
    const thumbCenter = `${Math.round(thumbTopNumber + state.thumbSize / 2)}px`;

    if (state.scrolled !== scrolled) {
      state.scrolled = scrolled;
      setClass(refs.root, CLASSES.scrolled, scrolled);
      setClass(refs.nav, CLASSES.scrolled, scrolled);
      setDataset(refs.root, "scrolled", scrolled ? "true" : "false");
    }

    if (state.progressValue !== progressValue) {
      state.progressValue = progressValue;
      setDataset(refs.root, "scrollProgress", progressValue);
      setDataset(refs.customScrollbar, "scrollProgress", progressValue);
      setCssMetric(refs.root, "--public-home-scroll-progress", progressValue);
      setCssMetric(refs.customScrollbar, "--public-home-scroll-progress", progressValue);
      setCssMetric(refs.nav, "--public-home-scroll-progress", progressValue);
    }

    if (state.progressPercent !== progressPercent) {
      state.progressPercent = progressPercent;
      setDataset(refs.root, "scrollProgressPercent", progressPercent);
      setCssMetric(refs.root, "--public-home-scroll-progress-percent", progressPercent);
      setCssMetric(refs.customScrollbar, "--public-home-scroll-progress-percent", progressPercent);
      setCssMetric(refs.nav, "--public-home-scroll-progress-percent", progressPercent);
    }

    if (state.thumbTop !== thumbTop) {
      state.thumbTop = thumbTop;
      setCssMetric(refs.root, "--public-home-scrollbar-thumb-top", thumbTop);
      setCssMetric(refs.customScrollbar, "--public-home-scrollbar-thumb-top", thumbTop);
    }

    if (state.thumbCenter !== thumbCenter) {
      state.thumbCenter = thumbCenter;
      setCssMetric(refs.root, "--public-home-scrollbar-thumb-center", thumbCenter);
      setCssMetric(refs.customScrollbar, "--public-home-scrollbar-thumb-center", thumbCenter);
    }
  }

  const scheduler = createFrameScheduler(writeProgress);
  const scrollTarget = isWindowHost(host) ? window : host;
  addEvent(cleanups, scrollTarget, "scroll", scheduler.schedule, { passive: true });

  function invalidate() {
    state.metricsDirty = true;
    scheduler.schedule();
  }

  addEvent(cleanups, window, "resize", invalidate, { passive: true });

  let resizeObserver = null;
  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(invalidate);
    resizeObserver.observe(refs.root);
    if (refs.customScrollbar) resizeObserver.observe(refs.customScrollbar);
    if (!isWindowHost(host)) resizeObserver.observe(host);
    cleanups.push(() => resizeObserver?.disconnect());
  }

  if (refs.customScrollbar) {
    let dragging = false;
    let pointerId = null;

    function scrollFromPointer(event) {
      if (state.metricsDirty) measureGeometry();
      const rect = state.trackRect;
      if (!rect) return;
      const localY = (Number(event.clientY) || 0) - rect.top - state.thumbSize / 2;
      const progress = Math.max(0, Math.min(1, localY / state.travel));
      hostScrollTo(host, progress * state.max, "auto");
      scheduler.schedule();
    }

    addEvent(cleanups, refs.customScrollbar, "pointerdown", (event) => {
      if (event.button !== 0) return;
      dragging = true;
      pointerId = event.pointerId ?? null;
      setClass(refs.root, "is-scrollbar-dragging", true);
      setDataset(refs.root, "scrollbarDragging", "true");
      refs.customScrollbar.setPointerCapture?.(pointerId);
      scrollFromPointer(event);
      event.preventDefault();
    });

    addEvent(cleanups, refs.customScrollbar, "pointermove", (event) => {
      if (!dragging) return;
      scrollFromPointer(event);
      event.preventDefault();
    });

    const stop = (event) => {
      if (!dragging) return;
      dragging = false;
      try {
        refs.customScrollbar.releasePointerCapture?.(pointerId ?? event?.pointerId);
      } catch {
        // no active capture
      }
      pointerId = null;
      setClass(refs.root, "is-scrollbar-dragging", false);
      removeDataset(refs.root, "scrollbarDragging");
    };
    addEvent(cleanups, refs.customScrollbar, "pointerup", stop);
    addEvent(cleanups, refs.customScrollbar, "pointercancel", stop);
    addEvent(cleanups, refs.customScrollbar, "lostpointercapture", stop);
  }

  scheduler.flush();

  cleanups.push(() => {
    scheduler.cancel();
    for (const node of [refs.root, refs.customScrollbar, refs.nav]) {
      for (const key of [
        "--public-home-scroll-progress",
        "--public-home-scroll-progress-percent",
        "--public-home-scrollbar-thumb-top",
        "--public-home-scrollbar-thumb-center",
        "--public-home-scrollbar-thumb-size",
      ]) removeCssMetric(node, key);
    }
    setClass(refs.root, CLASSES.scrolled, false);
    setClass(refs.nav, CLASSES.scrolled, false);
    setClass(refs.root, "is-scrollbar-dragging", false);
    for (const key of ["scrolled", "scrollProgress", "scrollProgressPercent", "scrollbarDragging"]) {
      removeDataset(refs.root, key);
    }
    removeDataset(refs.customScrollbar, "scrollProgress");
  });

  return Object.freeze({ host, invalidate, schedule: scheduler.schedule });
}

function initActiveSection(refs, cleanups, host, activeState) {
  if (!refs.sections.length) return;

  const activate = (hash) => setActiveHash(refs, hash, activeState);

  if (!("IntersectionObserver" in window)) {
    activate(sectionHash(refs.sections[0]));
    return;
  }

  const visible = new Map();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const hash = sectionHash(entry.target);
      if (!hash) continue;
      if (entry.isIntersecting) visible.set(hash, entry.intersectionRatio);
      else visible.delete(hash);
    }
    let bestHash = "";
    let bestRatio = -1;
    for (const [hash, ratio] of visible) {
      if (ratio >= bestRatio) {
        bestHash = hash;
        bestRatio = ratio;
      }
    }
    if (bestHash) activate(bestHash);
  }, {
    root: isWindowHost(host) ? null : host,
    rootMargin: ACTIVE_ROOT_MARGIN,
    threshold: [0, 0.12, 0.24, 0.42, 0.66, 0.88, 1],
  });

  refs.sections.forEach((section) => observer.observe(section));
  cleanups.push(() => observer.disconnect());
  activate(sectionHash(refs.sections[0]));
}

function initReveal(refs, cleanups, host) {
  if (!refs.revealItems.length) return;
  if (reducedMotion() || !("IntersectionObserver" in window)) {
    refs.revealItems.forEach((item) => {
      setClass(item, CLASSES.visible, true);
      setDataset(item, "visible", "true");
    });
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      setClass(entry.target, CLASSES.visible, true);
      setDataset(entry.target, "visible", "true");
      observer.unobserve(entry.target);
    }
  }, {
    root: isWindowHost(host) ? null : host,
    rootMargin: "0px 0px -12% 0px",
    threshold: [0.08, 0.16, 0.32],
  });

  refs.revealItems.forEach((item) => observer.observe(item));
  cleanups.push(() => observer.disconnect());
}

function initFooterVisibility(refs, cleanups, host) {
  const footer = refs.root.querySelector(".public-home-footer");
  if (!footer || !("IntersectionObserver" in window)) return;

  let visible = null;
  const observer = new IntersectionObserver((entries) => {
    const next = entries.some((entry) => entry.isIntersecting);
    if (next === visible) return;
    visible = next;
    setClass(refs.root, CLASSES.footerVisible, next);
    setClass(refs.nav, CLASSES.footerVisible, next);
    setDataset(refs.root, "footerVisible", next ? "true" : "false");
    dispatchHomeEvent(refs.root, "public-home:footer-visibility", { visible: next });
  }, {
    root: isWindowHost(host) ? null : host,
    rootMargin: "0px",
    threshold: [0, 0.01, 0.08],
  });
  observer.observe(footer);
  cleanups.push(() => {
    observer.disconnect();
    setClass(refs.root, CLASSES.footerVisible, false);
    setClass(refs.nav, CLASSES.footerVisible, false);
    removeDataset(refs.root, "footerVisible");
  });
}

function initPointerFx(refs, cleanups) {
  if (reducedMotion()) return;
  try {
    if (!window.matchMedia("(pointer: fine)").matches) return;
  } catch {
    return;
  }

  let frame = 0;
  let x = 50;
  let y = 50;
  const write = () => {
    frame = 0;
    setCssMetric(refs.root, "--public-home-pointer-x", `${x.toFixed(2)}%`);
    setCssMetric(refs.root, "--public-home-pointer-y", `${y.toFixed(2)}%`);
  };

  addEvent(cleanups, refs.root, "pointermove", (event) => {
    x = Math.max(0, Math.min(100, (event.clientX / Math.max(1, window.innerWidth)) * 100));
    y = Math.max(0, Math.min(100, (event.clientY / Math.max(1, window.innerHeight)) * 100));
    if (!frame) frame = requestFrame(write);
  }, { passive: true });

  cleanups.push(() => {
    cancelFrame(frame);
    removeCssMetric(refs.root, "--public-home-pointer-x");
    removeCssMetric(refs.root, "--public-home-pointer-y");
  });
}

function initMagneticCards(refs, cleanups) {
  if (!refs.magneticItems.length || reducedMotion()) return;
  try {
    if (!window.matchMedia("(pointer: fine)").matches) return;
  } catch {
    return;
  }

  const states = new WeakMap();
  for (const item of refs.magneticItems) {
    const state = { rect: null, frame: 0, x: 50, y: 50 };
    states.set(item, state);

    addEvent(cleanups, item, "pointerenter", () => {
      state.rect = item.getBoundingClientRect();
    }, { passive: true });

    addEvent(cleanups, item, "pointermove", (event) => {
      const rect = state.rect || item.getBoundingClientRect();
      state.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      state.y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
      if (state.frame) return;
      state.frame = requestFrame(() => {
        state.frame = 0;
        setClass(item, CLASSES.magnetic, true);
        setCssMetric(item, "--card-pointer-x", `${state.x.toFixed(2)}%`);
        setCssMetric(item, "--card-pointer-y", `${state.y.toFixed(2)}%`);
      });
    }, { passive: true });

    addEvent(cleanups, item, "pointerleave", () => {
      state.rect = null;
      cancelFrame(state.frame);
      state.frame = 0;
      setClass(item, CLASSES.magnetic, false);
      setCssMetric(item, "--card-pointer-x", "50%");
      setCssMetric(item, "--card-pointer-y", "50%");
    }, { passive: true });

    cleanups.push(() => cancelFrame(state.frame));
  }
}

function writeClipboard(value) {
  const clean = cleanText(value, "");
  if (!clean) return Promise.resolve(false);
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(clean).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}

function initCopyActions(refs, cleanups) {
  if (!refs.copyActions.length) return;
  let timer = 0;
  addEvent(cleanups, refs.root, "click", async (event) => {
    const action = event.target?.closest?.(SELECTORS.copyAction);
    if (!action || !refs.root.contains(action)) return;
    const value = action.getAttribute("data-copy-value") || action.href || action.textContent || "";
    const ok = await writeClipboard(value);
    setClass(action, CLASSES.copied, ok);
    setDataset(action, "copied", ok ? "true" : "false");
    dispatchHomeEvent(refs.root, ok ? "public-home:copy-success" : "public-home:copy-fail", {
      ok,
      value: redact(value),
    });
    clearTimeout(timer);
    if (ok) timer = window.setTimeout(() => {
      setClass(action, CLASSES.copied, false);
      removeDataset(action, "copied");
    }, 1500);
  });
  cleanups.push(() => clearTimeout(timer));
}

function parseNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function initMetricCounters(refs, cleanups, host) {
  if (!refs.metricCounters.length) return;
  const frames = new Set();

  function animate(node) {
    if (node.dataset.counterAnimated === "true") return;
    node.dataset.counterAnimated = "true";
    setClass(node, CLASSES.counterReady, true);
    const target = parseNumber(node.dataset.counterTarget || node.textContent, 0);
    const start = parseNumber(node.dataset.counterStart, 0);
    const duration = Math.max(320, Math.min(2200, Number(node.dataset.counterDuration) || 1100));
    const suffix = cleanText(node.dataset.counterSuffix || "", "");
    const decimals = Math.max(0, Math.min(3, Number(node.dataset.counterDecimals) || 0));

    if (reducedMotion()) {
      node.textContent = `${target.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
      return;
    }

    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = start + (target - start) * eased;
      node.textContent = `${value.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
      if (progress < 1) {
        const id = requestFrame(tick);
        frames.add(id);
      }
    };
    const id = requestFrame(tick);
    frames.add(id);
  }

  if (!("IntersectionObserver" in window)) {
    refs.metricCounters.forEach(animate);
  } else {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        animate(entry.target);
        observer.unobserve(entry.target);
      }
    }, {
      root: isWindowHost(host) ? null : host,
      rootMargin: "0px 0px -8% 0px",
      threshold: [0.2, 0.45, 0.7],
    });
    refs.metricCounters.forEach((node) => observer.observe(node));
    cleanups.push(() => observer.disconnect());
  }

  cleanups.push(() => {
    for (const frame of frames) cancelFrame(frame);
    frames.clear();
  });
}

function initFaqCollapsed(refs, cleanups) {
  const items = toArray(refs.root.querySelectorAll(".public-home-faq-item"));
  if (!items.length) return;
  for (const item of items) {
    try {
      item.open = false;
      item.removeAttribute("open");
    } catch {
      // no-op
    }
  }
  cleanups.push(() => {
    for (const item of items) {
      try {
        item.open = false;
        item.removeAttribute("open");
      } catch {
        // no-op
      }
    }
  });
}

function initInitialTop(refs, host, activeState) {
  try {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    if (window.location.hash && window.location.hash !== "#") {
      window.history.replaceState(
        { source: SOURCE, reason: "public-home-initial-top" },
        "",
        `${window.location.pathname}${window.location.search}`
      );
    }
  } catch {
    // navigation remains usable
  }
  requestFrame(() => {
    hostScrollTo(host, 0, "auto");
    const first = refs.sections.find((section) => sectionHash(section) === "#inicio") || refs.sections[0];
    if (first) setActiveHash(refs, sectionHash(first), activeState);
  });
}

function appAuth() {
  return AppCore.auth || AppCore.Auth || AppCore.getModule?.("auth") || null;
}

function appRouter() {
  return AppCore.router || AppCore.Router || AppCore.getModule?.("router") || null;
}

function destroyPrevious(container) {
  const previous = INSTANCES.get(container);
  if (!previous?.destroy) return false;
  previous.destroy({ remount: true });
  return true;
}

export function renderPublicHomeView(container, context = {}) {
  if (!isBrowser()) return null;
  if (!container) throw new Error("[PublicHomeView] container requerido.");

  destroyPrevious(container);
  const cleanups = [];
  const view = mountTemplate(container);
  const refs = getRefs(view);
  const activeState = { activeHash: "" };
  const host = resolveScrollHost(refs);
  let mounted = true;

  initBodyState(refs, cleanups);
  const menu = initMenu(refs, cleanups);
  initAnchorScroll(refs, cleanups, host, activeState, menu);
  initCtaTracking(refs, cleanups);
  initScrollPipeline(refs, cleanups, host);
  initFooterVisibility(refs, cleanups, host);
  initActiveSection(refs, cleanups, host, activeState);
  initReveal(refs, cleanups, host);
  initPointerFx(refs, cleanups);
  initCopyActions(refs, cleanups);
  initMetricCounters(refs, cleanups, host);
  initMagneticCards(refs, cleanups);
  initFaqCollapsed(refs, cleanups);
  initInitialTop(refs, host, activeState);

  const instance = {
    version: PUBLIC_HOME_VIEW_VERSION,
    root: refs.root,
    view,
    scrollTo(hash = "", options = {}) {
      return scrollToHash(hash, refs, host, activeState, {
        replace: true,
        focus: true,
        cleanups,
        ...options,
      });
    },
    openMenu() {
      return menu.open({ focus: true });
    },
    closeMenu() {
      return menu.close({ restoreFocus: true });
    },
    toggleMenu() {
      return menu.toggle();
    },
    refreshActiveSection() {
      return activeState.activeHash
        ? setActiveHash(refs, activeState.activeHash, { activeHash: "" })
        : false;
    },
    destroy(options = {}) {
      if (!mounted) return true;
      mounted = false;
      try {
        menu.close({ focus: false });
      } catch {
        // continue teardown
      }
      for (const cleanup of cleanups.splice(0).reverse()) {
        try {
          cleanup?.();
        } catch {
          // independent cleanup boundary
        }
      }
      if (!options.keepDom) container.replaceChildren();
      if (INSTANCES.get(container) === instance) INSTANCES.delete(container);
      if (lastInstance === instance) lastInstance = null;
      return true;
    },
    getSnapshot() {
      const router = context.Router || context.router || appRouter();
      const auth = context.Auth || context.auth || appAuth();
      return Object.freeze({
        version: PUBLIC_HOME_VIEW_VERSION,
        source: SOURCE,
        mounted,
        ready: refs.root?.dataset?.ready === "true",
        menuOpen: menu.isOpen(),
        activeSection: refs.root?.dataset?.activeSection || null,
        sectionCount: refs.sections.length,
        navLinkCount: refs.navLinks.length,
        revealCount: refs.revealItems.length,
        metricCounterCount: refs.metricCounters.length,
        magneticItemCount: refs.magneticItems.length,
        reducedMotion: reducedMotion(),
        scrollHost: isWindowHost(host) ? "window" : "element",
        scrollPipeline: "single-listener-frame-budgeted",
        routerAvailable: Boolean(router?.navigate || router?.replace || router?.push || router?.go),
        authenticated: auth?.isAuthenticated?.() === true,
        currentPath: redact(`${window.location.pathname}${window.location.search}${window.location.hash}`),
      });
    },
    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };

  INSTANCES.set(container, instance);
  lastInstance = instance;
  return instance;
}

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
  if (lastInstance?.getSnapshot) return lastInstance.getSnapshot();
  return Object.freeze({
    version: PUBLIC_HOME_VIEW_VERSION,
    source: SOURCE,
    mounted: false,
    browser: isBrowser(),
    authenticated: appAuth()?.isAuthenticated?.() === true,
  });
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
