/* =========================================================
   Onion Support - Global Avatar System
   Archivo: /src/features/avatar-system/index.js

   SINGLE RUNTIME AUTHORITY · IDENTITY + IMAGE STATE · SPA-WIDE

   Responsabilidades:
   - Ser la única autoridad runtime de identidad visual de los avatares.
   - Mismo usuario => mismas iniciales + mismo tone en cualquier vista.
   - Resolver identidad desde aliases estables disponibles en cada contexto.
   - Mantener loading -> image | fallback | error de forma global.
   - Preservar alfa real de imágenes válidas.
   - Reparar imágenes rotas y DOM dinámico sin icono nativo del navegador.
   - Subordinar hints legacy de Sidebar/Home/Incidencias/Facturas/etc.
   - No hacer HTTP, storage, pixel inspection ni persistir colores.
========================================================= */

"use strict";

import {
  AVATAR_IDENTITY_VERSION,
  avatarInitials,
  cleanAvatarText,
  normalizeAvatarEmail,
  normalizeAvatarName,
  normalizeAvatarUserId,
  normalizeAvatarUsername,
  resolveAvatarPresentation,
} from "./identity.js";

export {
  AVATAR_IDENTITY_VERSION,
  AVATAR_TONE_COUNT,
  avatarEmailFromIdentity,
  avatarIdentityFingerprint,
  avatarInitials,
  avatarNameFromIdentity,
  avatarSeedFromIdentity,
  avatarToneFromIdentity,
  avatarToneFromSeed,
  avatarUserIdFromIdentity,
  avatarUsernameFromIdentity,
  cleanAvatarText,
  hashAvatarSeed,
  normalizeAvatarEmail,
  normalizeAvatarName,
  normalizeAvatarUserId,
  normalizeAvatarUsername,
  resolveAvatarPresentation,
} from "./identity.js";

export const AVATAR_SYSTEM_VERSION =
  "avatar-system.v2-deterministic-identity-authority";

const MOUNT_KEY = "__ONION_AVATAR_SYSTEM__";
const MAX_HOST_DEPTH = 7;
const MAX_SCOPE_DEPTH = 8;

const HOST_QUERY = [
  "[data-avatar-system]",
  "[data-avatar-host]",
  "[data-has-avatar]",
  "[data-avatar-tone]",
  ".ui-avatar",
  ".ui-detail-modal-avatar-frame",
  '[class*="avatar"]',
].join(",");

const FALLBACK_QUERY = [
  "[data-avatar-fallback]",
  "[data-sidebar-avatar-fallback]",
  '[class*="avatar-fallback"]',
  '[class*="avatar-initial"]',
  '[class*="avatar-placeholder"]',
].join(",");

const CURRENT_USER_HOST_QUERY = [
  ".sidebar-user-avatar",
  ".sidebar-account-menu-avatar",
  ".topbar-user-avatar",
  ".topbar-avatar",
  ".home-current-user-avatar",
  ".cuenta-profile-avatar-preview",
  ".cuenta-avatar-preview",
].join(",");

const IDENTITY_SCOPE_QUERY = [
  "[data-user-row='true']",
  "[data-ticket-row='true']",
  "[data-incidencia-row='true']",
  "[data-facturas-row='true']",
  "[data-client-row='true']",
  "[data-cliente-row='true']",
  "[data-home-entity-relation='true']",
  "[data-modal-technician='true']",
  "[data-incidencias-modal-root='true']",
  ".incidencias-assigned-badge",
  ".incidencias-main",
  ".facturas-main",
  ".clientes-main",
  ".usuarios-main",
  ".home-entity-relation",
].join(",");

const EMAIL_NODE_QUERY = [
  "a[href^='mailto:']",
  ".incidencias-client-email",
  ".facturas-factura-email",
  ".clientes-contact-link",
  ".usuarios-user-email",
  ".usuarios-email",
  ".home-entity-relation-detail",
  '[data-email]',
  '[data-user-email]',
  '[data-avatar-email]',
].join(",");

const NAME_NODE_QUERY = [
  ".incidencias-client-name",
  ".incidencias-assigned-name",
  ".facturas-factura-client",
  ".facturas-factura-contact",
  ".clientes-client-name",
  ".clientes-main-copy strong",
  ".usuarios-user-name",
  ".usuarios-main-copy strong",
  ".home-entity-relation-name",
  ".incidencias-modal-technician-copy strong",
  "[data-user-name]",
  "[data-avatar-name]",
].join(",");

const AVATAR_HOST_TOKEN =
  /(?:^|[-_])avatar(?:$|[-_](?:frame|shell|wrap|wrapper|preview|container|box|slot|circle|thumb|media))$/i;

const AVATAR_IMAGE_TOKEN =
  /(?:^|[-_])avatar(?:[-_](?:img|image|photo|picture))$/i;

const AVATAR_FALLBACK_TOKEN =
  /(?:^|[-_])avatar(?:[-_](?:fallback|initial|initials|placeholder))$/i;

const EMAIL_RE =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

let observer = null;
let scanQueued = false;
let active = false;
let runtimeContext = {};

const pendingRoots = new Set();
const lastImageSource = new WeakMap();

const counters = {
  scans: 0,
  hosts: 0,
  images: 0,
  imageStates: 0,
  fallbackStates: 0,
  errorStates: 0,
  identityStates: 0,
  identityCorrections: 0,
  initialsCorrections: 0,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isElement(value = null) {
  return Boolean(
    value &&
    value.nodeType === 1 &&
    typeof value.getAttribute === "function"
  );
}

function isDocument(value = null) {
  return Boolean(value && value.nodeType === 9);
}

function isImage(value = null) {
  return Boolean(
    isElement(value) &&
    String(value.tagName || "").toUpperCase() === "IMG"
  );
}

function isObject(value = null) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function classTokens(value = "") {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => classTokens(item))
      .filter(Boolean);
  }

  if (isElement(value)) {
    return [...(value.classList || [])]
      .map((token) => cleanAvatarText(token, ""))
      .filter(Boolean);
  }

  return cleanAvatarText(value, "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function isAvatarHostClassName(value = "") {
  return classTokens(value).some((token) => AVATAR_HOST_TOKEN.test(token));
}

export function isAvatarImageClassName(value = "") {
  return classTokens(value).some((token) => AVATAR_IMAGE_TOKEN.test(token));
}

export function isAvatarFallbackClassName(value = "") {
  return classTokens(value).some((token) => AVATAR_FALLBACK_TOKEN.test(token));
}

export function resolveAvatarImageState(input = {}) {
  const source = cleanAvatarText(input?.source || "", "");
  const failed = input?.failed === true;
  const hidden = input?.hidden === true;
  const complete = input?.complete === true;
  const naturalWidth = Number(input?.naturalWidth || 0);
  const naturalHeight = Number(input?.naturalHeight || 0);

  if (!source) return "fallback";
  if (failed) return "error";
  if (hidden) return "fallback";
  if (!complete) return "loading";

  return naturalWidth > 0 && naturalHeight > 0
    ? "image"
    : "error";
}

function setAttribute(node = null, name = "", value = "") {
  if (!isElement(node) || !name) return false;

  const next = String(value);
  if (node.getAttribute(name) === next) return false;
  node.setAttribute(name, next);
  return true;
}

function removeAttribute(node = null, name = "") {
  if (!isElement(node) || !name || !node.hasAttribute(name)) return false;
  node.removeAttribute(name);
  return true;
}

function setClass(node = null, className = "", enabled = false) {
  if (!isElement(node) || !node.classList || !className) return false;

  const next = enabled === true;
  if (node.classList.contains(className) === next) return false;
  node.classList.toggle(className, next);
  return true;
}

function isOptedOut(node = null) {
  if (!isElement(node)) return true;

  return (
    node.getAttribute("data-avatar-system") === "off" ||
    node.getAttribute("data-avatar-managed") === "false"
  );
}

/* =========================================================
   HOST DISCOVERY
========================================================= */

function hasAvatarData(node = null) {
  if (!isElement(node)) return false;

  return Boolean(
    node.hasAttribute("data-avatar-host") ||
    node.hasAttribute("data-has-avatar") ||
    node.hasAttribute("data-avatar-tone") ||
    node.hasAttribute("data-avatar-state") ||
    (
      node.hasAttribute("data-avatar-system") &&
      node.getAttribute("data-avatar-system") !== "off"
    )
  );
}

function hasFallbackHint(node = null) {
  if (!isElement(node)) return false;

  return Boolean(
    node.hasAttribute("data-avatar-fallback") ||
    node.hasAttribute("data-sidebar-avatar-fallback") ||
    isAvatarFallbackClassName(node)
  );
}

function directChildren(node = null) {
  return isElement(node)
    ? [...(node.children || [])]
    : [];
}

function hasDirectImage(node = null) {
  return directChildren(node).some((child) => {
    if (isImage(child)) return true;

    return (
      String(child.tagName || "").toUpperCase() === "PICTURE" &&
      Boolean(child.querySelector?.("img"))
    );
  });
}

function isLikelyFallbackSpan(node = null) {
  if (!isElement(node)) return false;
  if (String(node.tagName || "").toUpperCase() !== "SPAN") return false;
  if (hasFallbackHint(node)) return true;
  if (node.children?.length) return false;

  const text = cleanAvatarText(node.textContent || "", "");
  return Boolean(text && Array.from(text).length <= 4);
}

function hasDirectFallback(node = null) {
  return directChildren(node).some(isLikelyFallbackSpan);
}

function isLikelyAvatarHost(node = null) {
  if (!isElement(node) || isImage(node) || isOptedOut(node)) return false;
  if (hasAvatarData(node)) return true;
  if (!isAvatarHostClassName(node)) return false;

  return Boolean(
    hasDirectImage(node) ||
    hasDirectFallback(node) ||
    node.children?.length === 0 ||
    node.querySelector?.("img")
  );
}

function hostScore(node = null, image = null, depth = 0) {
  if (!isLikelyAvatarHost(node)) return Number.NEGATIVE_INFINITY;

  let score = 100 - (Math.max(0, depth) * 5);

  if (node.getAttribute("data-avatar-system") === "true") score += 1000;
  if (node.getAttribute("data-avatar-host") === "true") score += 900;
  if (node.hasAttribute("data-has-avatar")) score += 800;
  if (node.hasAttribute("data-avatar-tone")) score += 600;
  if (isAvatarHostClassName(node)) score += 400;
  if (image?.parentElement === node) score += 180;
  if (hasDirectImage(node)) score += 140;
  if (hasDirectFallback(node)) score += 120;

  return score;
}

export function findAvatarHost(image = null) {
  if (!isImage(image)) return null;

  let node = image.parentElement || null;
  let depth = 0;
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  while (
    isElement(node) &&
    depth <= MAX_HOST_DEPTH &&
    !["HTML", "BODY"].includes(String(node.tagName || "").toUpperCase())
  ) {
    const score = hostScore(node, image, depth);

    if (score > bestScore) {
      best = node;
      bestScore = score;
    }

    node = node.parentElement;
    depth += 1;
  }

  if (best) return best;

  return null;
}

function nearestAvatarHost(node = null) {
  let current = isElement(node) ? node.parentElement : null;
  let depth = 0;

  while (
    isElement(current) &&
    depth <= MAX_HOST_DEPTH &&
    !["HTML", "BODY"].includes(String(current.tagName || "").toUpperCase())
  ) {
    if (isLikelyAvatarHost(current)) return current;
    current = current.parentElement;
    depth += 1;
  }

  return null;
}

function fallbackBelongsToHost(fallback = null, host = null) {
  if (!isElement(fallback) || !isElement(host)) return false;

  let current = fallback.parentElement;

  while (isElement(current) && current !== host) {
    if (isLikelyAvatarHost(current)) return false;
    current = current.parentElement;
  }

  return current === host;
}

function avatarFallbackNodes(host = null) {
  if (!isElement(host)) return [];

  const nodes = new Set();

  for (const child of directChildren(host)) {
    if (isLikelyFallbackSpan(child)) nodes.add(child);
  }

  if (host.querySelectorAll) {
    for (const fallback of host.querySelectorAll(FALLBACK_QUERY)) {
      if (fallbackBelongsToHost(fallback, host)) nodes.add(fallback);
    }
  }

  return [...nodes];
}

function markFallbackNodes(host = null) {
  if (!isElement(host)) return [];

  const nodes = avatarFallbackNodes(host);

  for (const fallback of nodes) {
    fallback.setAttribute("data-avatar-fallback", "true");
  }

  return nodes;
}

/* =========================================================
   IDENTITY RESOLUTION
========================================================= */

function currentAuth() {
  const context = isObject(runtimeContext) ? runtimeContext : {};

  return (
    context.Auth ||
    context.auth ||
    context.AppCore?.auth ||
    context.core?.auth ||
    null
  );
}

function currentRuntimeUser() {
  const auth = currentAuth();

  for (const method of ["getCurrentUser", "getUser", "getProfile"]) {
    try {
      const candidate = auth?.[method]?.();
      if (isObject(candidate)) return candidate;
    } catch {
      // selector fail-soft
    }
  }

  const context = isObject(runtimeContext) ? runtimeContext : {};

  for (const candidate of [
    context.user,
    context.currentUser,
    context.session?.user,
  ]) {
    if (isObject(candidate)) return candidate;
  }

  return {};
}

function datasetValue(node = null, keys = []) {
  if (!isElement(node)) return "";

  for (const key of keys) {
    const value = cleanAvatarText(node?.dataset?.[key] || "", "");
    if (value) return value;
  }

  return "";
}

function emailFromText(value = "") {
  const match = cleanAvatarText(value, "").match(EMAIL_RE);
  return normalizeAvatarEmail(match?.[0] || "");
}

function emailFromNode(node = null) {
  if (!isElement(node)) return "";

  const datasetEmail = normalizeAvatarEmail(
    datasetValue(node, [
      "avatarEmail",
      "userEmail",
      "email",
      "emailLower",
      "clientEmail",
      "clienteEmail",
    ])
  );
  if (datasetEmail) return datasetEmail;

  const href = cleanAvatarText(node.getAttribute?.("href") || "", "");
  if (/^mailto:/i.test(href)) {
    const mail = normalizeAvatarEmail(
      decodeURIComponent(href.replace(/^mailto:/i, "").split("?")[0] || "")
    );
    if (mail) return mail;
  }

  for (const value of [
    node.getAttribute?.("title"),
    node.getAttribute?.("aria-label"),
    node.textContent,
  ]) {
    const email = emailFromText(value || "");
    if (email) return email;
  }

  return "";
}

function userIdFromNode(node = null) {
  if (!isElement(node)) return "";

  return normalizeAvatarUserId(
    datasetValue(node, [
      "avatarUserId",
      "userId",
      "usuarioId",
      "ownerUserId",
      "requesterUserId",
      "createdByUserId",
      "technicianUserId",
      "tecnicoUserId",
    ])
  );
}

function usernameFromNode(node = null) {
  if (!isElement(node)) return "";

  return normalizeAvatarUsername(
    datasetValue(node, [
      "avatarUsername",
      "username",
      "usernameLower",
      "slug",
      "userSlug",
    ])
  );
}

function humanNameFromText(value = "") {
  const raw = cleanAvatarText(value, "");
  if (!raw) return "";

  const withoutEmail = raw
    .replace(EMAIL_RE, " ")
    .replace(/^t[eé]cnico\s*:\s*/i, "")
    .replace(/\s*[·|]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutEmail) return "";
  if (/^(usuario|cliente|avatar|sin email)$/i.test(withoutEmail)) return "";

  return withoutEmail.slice(0, 160);
}

function nameFromNode(node = null) {
  if (!isElement(node)) return "";

  const datasetName = humanNameFromText(
    datasetValue(node, [
      "avatarName",
      "userName",
      "displayName",
      "fullName",
      "name",
    ])
  );
  if (datasetName) return datasetName;

  for (const value of [
    node.getAttribute?.("title"),
    node.getAttribute?.("aria-label"),
  ]) {
    const name = humanNameFromText(value || "");
    if (name) return name;
  }

  return "";
}

function closestIdentityScope(host = null) {
  if (!isElement(host)) return null;

  try {
    const direct = host.closest?.(IDENTITY_SCOPE_QUERY);
    if (direct) return direct;
  } catch {
    // fallback manual below
  }

  let current = host.parentElement;
  let depth = 0;

  while (
    isElement(current) &&
    depth <= MAX_SCOPE_DEPTH &&
    !["HTML", "BODY"].includes(String(current.tagName || "").toUpperCase())
  ) {
    if (
      current.hasAttribute("data-user-id") ||
      current.hasAttribute("data-ticket-id") ||
      current.hasAttribute("data-factura-id") ||
      current.hasAttribute("data-client-id")
    ) {
      return current;
    }

    current = current.parentElement;
    depth += 1;
  }

  return host.parentElement || host;
}

function firstQuery(scope = null, selector = "") {
  if (!isElement(scope) || !selector) return null;

  try {
    return scope.querySelector(selector);
  } catch {
    return null;
  }
}

function firstEmailInScope(scope = null) {
  if (!isElement(scope)) return "";

  const direct = emailFromNode(scope);
  if (direct) return direct;

  const node = firstQuery(scope, EMAIL_NODE_QUERY);
  const fromNode = emailFromNode(node);
  if (fromNode) return fromNode;

  return emailFromText(scope.textContent || "");
}

function firstNameInScope(scope = null) {
  if (!isElement(scope)) return "";

  const direct = nameFromNode(scope);
  if (direct) return direct;

  const node = firstQuery(scope, NAME_NODE_QUERY);
  const fromNode = humanNameFromText(node?.textContent || "");
  if (fromNode) return fromNode;

  return "";
}

function firstUserIdInAncestors(host = null, scope = null) {
  for (const start of [host, scope]) {
    let current = start;
    let depth = 0;

    while (
      isElement(current) &&
      depth <= MAX_SCOPE_DEPTH &&
      !["HTML", "BODY"].includes(String(current.tagName || "").toUpperCase())
    ) {
      const userId = userIdFromNode(current);
      if (userId) return userId;
      current = current.parentElement;
      depth += 1;
    }
  }

  return "";
}

function fallbackText(host = null) {
  for (const node of avatarFallbackNodes(host)) {
    const value = cleanAvatarText(node.textContent || "", "");
    if (value) return value;
  }

  return "";
}

function isCurrentUserHost(host = null) {
  if (!isElement(host)) return false;

  try {
    return host.matches(CURRENT_USER_HOST_QUERY);
  } catch {
    return false;
  }
}

function sameKnownPerson(left = {}, right = {}) {
  const leftEmail = normalizeAvatarEmail(left?.email || left?.emailLower || "");
  const rightEmail = normalizeAvatarEmail(right?.email || right?.emailLower || "");
  if (leftEmail && rightEmail && leftEmail === rightEmail) return true;

  const leftId = normalizeAvatarUserId(left?.userId || left?.id || "");
  const rightId = normalizeAvatarUserId(right?.userId || right?.id || "");
  if (leftId && rightId && leftId === rightId) return true;

  const leftName = normalizeAvatarName(
    left?.displayName || left?.fullName || left?.name || ""
  );
  const rightName = normalizeAvatarName(
    right?.displayName || right?.fullName || right?.name || ""
  );

  return Boolean(
    leftName &&
    rightName &&
    leftName.length >= 5 &&
    leftName === rightName
  );
}

function resolveHostIdentity(host = null) {
  const currentUser = currentRuntimeUser();

  if (isCurrentUserHost(host) && Object.keys(currentUser).length) {
    return currentUser;
  }

  const scope = closestIdentityScope(host);

  const hostEmail = emailFromNode(host);
  const scopeEmail = firstEmailInScope(scope);
  const hostName = nameFromNode(host);
  const scopeName = firstNameInScope(scope);
  const userId = firstUserIdInAncestors(host, scope);
  const username = usernameFromNode(host) || usernameFromNode(scope);

  const candidate = {
    email: hostEmail || scopeEmail,
    userId,
    username,
    name: hostName || scopeName,
  };

  if (
    Object.keys(currentUser).length &&
    sameKnownPerson(candidate, currentUser)
  ) {
    return {
      ...currentUser,
      ...candidate,
      email:
        normalizeAvatarEmail(
          candidate.email || currentUser.emailLower || currentUser.email || ""
        ) || undefined,
      userId:
        candidate.userId ||
        currentUser.userId ||
        currentUser.id ||
        undefined,
      name:
        candidate.name ||
        currentUser.displayName ||
        currentUser.fullName ||
        currentUser.name ||
        undefined,
    };
  }

  /*
    Última compatibilidad: si el DOM sólo conserva las iniciales legacy no las
    usamos como seed (colisionan demasiado), pero sí como nombre de fallback.
  */
  if (!candidate.name) {
    candidate.name = fallbackText(host);
  }

  return candidate;
}

function applyIdentityPresentation(host = null) {
  if (!isElement(host) || isOptedOut(host)) return null;

  const identity = resolveHostIdentity(host);
  const presentation = resolveAvatarPresentation(identity);
  const previousTone = host.getAttribute("data-avatar-tone");

  setAttribute(host, "data-avatar-authority", "global");
  setAttribute(host, "data-avatar-identity-version", AVATAR_IDENTITY_VERSION);
  setAttribute(host, "data-avatar-identity", presentation.fingerprint);
  setAttribute(host, "data-avatar-tone", String(presentation.tone));
  setAttribute(host, "data-avatar-initials", presentation.initials);

  if (
    previousTone !== null &&
    previousTone !== String(presentation.tone)
  ) {
    counters.identityCorrections += 1;
  }

  const fallbacks = markFallbackNodes(host);

  for (const fallback of fallbacks) {
    if (fallback.children?.length) continue;

    if (fallback.textContent !== presentation.initials) {
      fallback.textContent = presentation.initials;
      counters.initialsCorrections += 1;
    }
  }

  counters.identityStates += 1;
  return presentation;
}

/* =========================================================
   IMAGE STATE
========================================================= */

function imageSource(image = null) {
  if (!isImage(image)) return "";

  return cleanAvatarText(
    image.currentSrc ||
    image.getAttribute("src") ||
    image.getAttribute("srcset") ||
    "",
    ""
  );
}

function releaseImageAfterSourceChange(image = null, source = "") {
  if (!isImage(image)) return;

  const previous = lastImageSource.get(image) || "";

  if (source && source !== previous) {
    image.removeAttribute("data-avatar-failed");
    image.removeAttribute("data-avatar-failure-reason");

    if (image.getAttribute("data-avatar-hidden-by-system") === "true") {
      image.hidden = false;
      image.removeAttribute("data-avatar-hidden-by-system");
    }
  }

  lastImageSource.set(image, source);
}

function imageState(image = null) {
  if (!isImage(image)) return "fallback";

  const source = imageSource(image);
  releaseImageAfterSourceChange(image, source);

  return resolveAvatarImageState({
    source,
    failed: image.getAttribute("data-avatar-failed") === "true",
    hidden:
      image.hidden === true &&
      image.getAttribute("data-avatar-hidden-by-system") !== "true",
    complete: image.complete === true,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  });
}

function applyImageVisibility(image = null, state = "fallback") {
  if (!isImage(image)) return;

  setAttribute(image, "data-avatar-image", "true");

  if (state === "image") {
    image.removeAttribute("data-avatar-failed");
    image.removeAttribute("data-avatar-failure-reason");

    if (image.getAttribute("data-avatar-hidden-by-system") === "true") {
      image.hidden = false;
      image.removeAttribute("data-avatar-hidden-by-system");
    }

    return;
  }

  if (state === "error") {
    image.setAttribute("data-avatar-failed", "true");
    image.setAttribute("data-avatar-hidden-by-system", "true");
    image.hidden = true;
  }
}

function applyHostState(
  host = null,
  image = null,
  state = "fallback",
  reason = ""
) {
  if (!isElement(host) || isOptedOut(host)) return false;

  const hasImage = state === "image";

  setAttribute(host, "data-avatar-system", "true");
  setAttribute(host, "data-avatar-host", "true");
  setAttribute(host, "data-avatar-system-version", AVATAR_SYSTEM_VERSION);
  setAttribute(host, "data-avatar-state", state);
  setAttribute(host, "data-has-avatar", hasImage ? "true" : "false");

  if (reason) {
    setAttribute(host, "data-avatar-state-reason", reason);
  } else {
    removeAttribute(host, "data-avatar-state-reason");
  }

  setClass(host, "has-image", hasImage);
  setClass(host, "is-fallback", !hasImage);
  setClass(host, "is-avatar-loading", state === "loading");
  setClass(host, "is-avatar-error", state === "error");

  applyIdentityPresentation(host);
  applyImageVisibility(image, state);

  counters.hosts += 1;

  if (state === "image") counters.imageStates += 1;
  if (state === "fallback") counters.fallbackStates += 1;
  if (state === "error") counters.errorStates += 1;

  return true;
}

function avatarImagesInside(host = null) {
  if (!isElement(host)) return [];

  const images = [...(host.querySelectorAll?.("img") || [])];

  return images.filter((image) => {
    const nearest = nearestAvatarHost(image);

    return (
      nearest === host ||
      findAvatarHost(image) === host
    );
  });
}

export function synchronizeAvatarHost(host = null, preferredImage = null) {
  if (!isElement(host) || isOptedOut(host)) return false;

  const images = avatarImagesInside(host);
  const image = isImage(preferredImage) && host.contains?.(preferredImage)
    ? preferredImage
    : images[0] || null;

  if (!image) {
    return applyHostState(host, null, "fallback", "no-image");
  }

  counters.images += 1;

  const state = imageState(image);

  return applyHostState(
    host,
    image,
    state,
    state === "error" ? "load-error" : ""
  );
}

export function synchronizeAvatarImage(image = null) {
  if (!isImage(image)) return false;

  const host = findAvatarHost(image);
  if (!host || isOptedOut(host)) return false;

  return synchronizeAvatarHost(host, image);
}

function addCandidateHost(set, node = null) {
  if (!isElement(node) || !isLikelyAvatarHost(node)) return;
  set.add(node);
}

export function synchronizeAvatars(root = null) {
  if (!isBrowser()) return 0;

  const scope = root || document;
  if (!isElement(scope) && !isDocument(scope)) return 0;

  counters.scans += 1;

  const hosts = new Set();
  const images = [];

  if (isImage(scope)) {
    images.push(scope);
  } else if (isElement(scope)) {
    addCandidateHost(hosts, scope);
  }

  if (scope.querySelectorAll) {
    for (const image of scope.querySelectorAll("img")) {
      images.push(image);
    }

    for (const candidate of scope.querySelectorAll(HOST_QUERY)) {
      addCandidateHost(hosts, candidate);
    }
  }

  for (const image of images) {
    const host = findAvatarHost(image);
    if (host) hosts.add(host);
  }

  let synchronized = 0;

  for (const host of hosts) {
    if (synchronizeAvatarHost(host)) synchronized += 1;
  }

  return synchronized;
}

/* =========================================================
   OBSERVER / EVENTS
========================================================= */

function queueScan(root = null) {
  if (!isBrowser()) return;

  const candidate =
    isElement(root) || isDocument(root)
      ? root
      : document;

  pendingRoots.add(candidate);

  if (scanQueued) return;
  scanQueued = true;

  queueMicrotask(() => {
    scanQueued = false;

    const roots = [...pendingRoots];
    pendingRoots.clear();

    for (const item of roots) {
      synchronizeAvatars(item);
    }
  });
}

function onImageLoad(event = null) {
  const image = event?.target || null;
  if (!isImage(image)) return;

  image.removeAttribute("data-avatar-failed");
  image.removeAttribute("data-avatar-failure-reason");

  if (image.getAttribute("data-avatar-hidden-by-system") === "true") {
    image.hidden = false;
    image.removeAttribute("data-avatar-hidden-by-system");
  }

  synchronizeAvatarImage(image);
}

function onImageError(event = null) {
  const image = event?.target || null;
  if (!isImage(image)) return;

  const host = findAvatarHost(image);
  if (!host || isOptedOut(host)) return;

  image.setAttribute("data-avatar-failed", "true");
  image.setAttribute("data-avatar-failure-reason", "load-error");
  image.setAttribute("data-avatar-hidden-by-system", "true");
  image.hidden = true;

  applyHostState(host, image, "error", "load-error");
}

function onMutations(records = []) {
  for (const record of records) {
    if (record.type === "childList") {
      for (const node of record.addedNodes || []) {
        if (isElement(node)) queueScan(node);
      }
      continue;
    }

    if (record.type === "characterData") {
      const parent = record.target?.parentElement || null;
      const host = nearestAvatarHost(parent);
      if (host) queueScan(host);
      continue;
    }

    if (record.type === "attributes") {
      const target = record.target || null;

      if (isImage(target)) {
        queueScan(target);
        continue;
      }

      if (isElement(target)) {
        const host = isLikelyAvatarHost(target)
          ? target
          : nearestAvatarHost(target);
        if (host) queueScan(host);
      }
    }
  }
}

function installObserver() {
  if (!isBrowser() || typeof MutationObserver !== "function") return false;
  if (observer) return true;

  observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "src",
      "srcset",
      "hidden",
      "class",
      "title",
      "aria-label",
      "data-avatar-tone",
      "data-avatar-state",
      "data-has-avatar",
      "data-user-id",
      "data-usuario-id",
      "data-user-email",
      "data-email",
    ],
  });

  return true;
}

/* =========================================================
   LIFECYCLE
========================================================= */

export function mountAvatarSystem(context = {}) {
  if (!isBrowser()) return false;

  if (isObject(context)) {
    runtimeContext = context;
  }

  if (active) {
    synchronizeAvatars(document);
    return true;
  }

  const existing = window[MOUNT_KEY];

  if (
    existing?.mounted === true &&
    existing?.version === AVATAR_SYSTEM_VERSION
  ) {
    active = true;
    synchronizeAvatars(document);
    return true;
  }

  document.addEventListener("load", onImageLoad, true);
  document.addEventListener("error", onImageError, true);
  installObserver();

  active = true;

  window[MOUNT_KEY] = Object.freeze({
    mounted: true,
    version: AVATAR_SYSTEM_VERSION,
    identityVersion: AVATAR_IDENTITY_VERSION,
  });

  synchronizeAvatars(document);
  return true;
}

export function destroyAvatarSystem() {
  if (!isBrowser()) return false;

  document.removeEventListener("load", onImageLoad, true);
  document.removeEventListener("error", onImageError, true);

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  pendingRoots.clear();
  scanQueued = false;
  active = false;
  runtimeContext = {};

  try {
    delete window[MOUNT_KEY];
  } catch {
    window[MOUNT_KEY] = null;
  }

  return true;
}

export function getAvatarSystemSnapshot() {
  const current = resolveAvatarPresentation(currentRuntimeUser());

  return Object.freeze({
    version: AVATAR_SYSTEM_VERSION,
    identityVersion: AVATAR_IDENTITY_VERSION,
    active,
    currentIdentity: current.fingerprint,
    counters: Object.freeze({ ...counters }),
    policy: Object.freeze({
      singleRuntimeAuthority: true,
      deterministicIdentityTone: true,
      deterministicInitials: true,
      legacyToneHintsAreSubordinate: true,
      validImageClearsFallbackSurface: true,
      transparentPixelsPreserved: true,
      fallbackOnlyWithoutValidImage: true,
      brokenImagesBecomeFallback: true,
      dynamicSpaDomObserved: true,
      identityMutationsReconciled: true,
      imageFormatsAreContentAgnostic: true,
      noPixelInspection: true,
      noNetwork: true,
      noStorage: true,
      noPersistedColor: true,
    }),
  });
}

export const AvatarSystem = Object.freeze({
  version: AVATAR_SYSTEM_VERSION,
  identityVersion: AVATAR_IDENTITY_VERSION,
  init: mountAvatarSystem,
  mount: mountAvatarSystem,
  sync: synchronizeAvatars,
  syncHost: synchronizeAvatarHost,
  resolve: resolveAvatarPresentation,
  initials: avatarInitials,
  destroy: destroyAvatarSystem,
  getSnapshot: getAvatarSystemSnapshot,
});

export default AvatarSystem;
