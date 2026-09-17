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
  avatarIdentityFingerprint,
  avatarInitials,
  normalizeAvatarEmail,
  normalizeAvatarUserId,
  normalizeAvatarUsername,
  resolveAvatarPresentation,
} from "./identity.js";
import { cleanText } from "../../core/presentation-text.js";
import { isObject } from "../../core/objects.js";

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
  confirmedPhotos: 0,
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

function classTokens(value = "") {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => classTokens(item))
      .filter(Boolean);
  }

  if (isElement(value)) {
    return [...(value.classList || [])]
      .map((token) => cleanText(token, ""))
      .filter(Boolean);
  }

  return cleanText(value, "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function isAvatarHostClassName(value = "") {
  return classTokens(value).some((token) => AVATAR_HOST_TOKEN.test(token));
}

function isAvatarFallbackClassName(value = "") {
  return classTokens(value).some((token) => AVATAR_FALLBACK_TOKEN.test(token));
}

export function resolveAvatarImageState(input = {}) {
  const source = cleanText(input?.source || "", "");
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

  const text = cleanText(node.textContent || "", "");
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

function findAvatarHost(image = null) {
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
    const value = cleanText(node?.dataset?.[key] || "", "");
    if (value) return value;
  }

  return "";
}

function emailFromText(value = "") {
  const match = cleanText(value, "").match(EMAIL_RE);
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

  const href = cleanText(node.getAttribute?.("href") || "", "");
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
  const raw = cleanText(value, "");
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
    const value = cleanText(node.textContent || "", "");
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
  const leftId = normalizeAvatarUserId(left?.userId || left?.id || "");
  const rightId = normalizeAvatarUserId(right?.userId || right?.id || "");
  if (leftId || rightId) return Boolean(leftId && rightId && leftId === rightId);

  const leftEmail = normalizeAvatarEmail(left?.email || left?.emailLower || "");
  const rightEmail = normalizeAvatarEmail(right?.email || right?.emailLower || "");
  return Boolean(leftEmail && rightEmail && leftEmail === rightEmail);
}

function resolveHostIdentity(host = null) {
  const currentUser = currentRuntimeUser();

  if (isCurrentUserHost(host) && Object.keys(currentUser).length) {
    return currentUser;
  }

  // A projected identity is a complete boundary, including empty aliases.
  // Never borrow a requester's email/userId for a nested technician avatar.
  // Hosts without identity metadata retain the legacy DOM discovery below.
  if (["data-avatar-name", "data-avatar-email", "data-avatar-user-id", "data-avatar-username"].some((name) => host.hasAttribute(name))) {
    return {
      name: datasetValue(host, ["avatarName"]),
      email: normalizeAvatarEmail(datasetValue(host, ["avatarEmail"])),
      userId: normalizeAvatarUserId(datasetValue(host, ["avatarUserId"])),
      username: normalizeAvatarUsername(datasetValue(host, ["avatarUsername"])),
    };
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

  return cleanText(
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
    setAttribute(image, "data-avatar-failed", "true");
    setAttribute(image, "data-avatar-hidden-by-system", "true");
    if (!image.hidden) image.hidden = true;
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

/*
  UN ENVOLTORIO NO ES UN AVATAR.

  La cabecera de detalle reserva el hueco con una caja (`ui-detail-modal-avatar`)
  y dentro pinta el host real (`…-avatar-frame`). Ambos nombres casan con el
  patrón de clase de host, así que el envoltorio se adoptaba también como host:
  como la imagen pertenece al marco, el envoltorio se quedaba SIN imagen y el
  sistema le declaraba estado `fallback`. Y `fallback` en un ANTECESOR activa la
  regla de `guardrails`

      :where([data-avatar-system="true"][data-avatar-state="fallback"]
             [data-avatar-image="true"]) { display: none }

  que oculta la imagen del marco de dentro. Con `loading="lazy"`, una imagen
  oculta con `display:none` no se descarga nunca, así que el marco se quedaba en
  `loading` para siempre: círculo con iniciales o vacío, y la fotografía real no
  aparecía jamás aunque la lista sí la mostrara.

  Un nodo que contiene otro host gestionado no declara estado: manda el de
  dentro. Y si el sistema ya le había puesto estado por error, se lo retira.
*/
function containsManagedAvatarHost(host = null) {
  if (!isElement(host)) return false;

  for (const candidate of host.querySelectorAll?.(HOST_QUERY) || []) {
    if (candidate === host || isImage(candidate)) continue;
    if (isOptedOut(candidate)) continue;
    if (isLikelyAvatarHost(candidate)) return true;
  }

  return false;
}

function releaseWrapperState(host = null) {
  if (!isElement(host)) return false;

  removeAttribute(host, "data-avatar-state");
  removeAttribute(host, "data-avatar-state-reason");

  setClass(host, "is-avatar-loading", false);
  setClass(host, "is-avatar-error", false);

  return false;
}

/* =========================================================
   LA FOTOGRAFÍA VIGENTE ES IDENTIDAD, NO UN DATO DEL DOCUMENTO
   =========================================================

   Un ticket y una factura llevan la URL de la foto INCRUSTADA en su payload.
   Esa URL envejece: cuando alguien cambia su fotografía, el documento sigue
   trayendo la anterior, y releer el documento para refrescar una imagen sería
   confundir dos cosas distintas --en una factura, además, tocaría su
   instantánea fiscal, que es histórica y no se toca--.

   Aquí no se relee nada. Cuando el servidor CONFIRMA una fotografía, esta
   autoridad --la única que ya sabe qué identidad representa cada nodo-- anota
   la versión vigente y la aplica a los nodos vivos de esa persona. El nombre,
   la razón social, el NIF y el resto del documento siguen siendo del documento.

   ENLAZAR SÓLO POR ALIAS INEQUÍVOCO. La semilla de identidad es jerárquica
   (userId > email > username > nombre), así que la huella de un nodo la decide
   su alias de mayor precedencia: quien conoce el userId comparte huella aunque
   muestre otro nombre --el caso de una factura a nombre de una sociedad--, y
   quien sólo conoce un NOMBRE tiene una huella propia que aquí no se registra
   jamás. Dos personas no se enlazan por parecerse el nombre.

   Consecuencia deliberada: una factura sin relación inequívoca con un perfil
   conserva su reserva. Es lo correcto: no se adivina a quién retrata.
========================================================= */

const confirmedPhotos = new Map();

/* Sólo identificadores. `name` queda fuera a propósito. */
function identityAliasKeys(identity = {}) {
  const keys = [];

  const userId = normalizeAvatarUserId(
    identity?.userId ?? identity?.id ?? identity?.uid ?? ""
  );
  if (userId) keys.push({ alias: `user:${userId}`, seed: { userId } });

  const email = normalizeAvatarEmail(
    identity?.email ?? identity?.emailLower ?? ""
  );
  if (email) keys.push({ alias: `email:${email}`, seed: { email } });

  const username = normalizeAvatarUsername(identity?.username ?? "");
  if (username) keys.push({ alias: `username:${username}`, seed: { username } });

  return keys;
}

/*
  Una URL confirmada se pinta en un `src`. No se aceptan esquemas ejecutables ni
  cadenas con saltos de línea; tampoco se le añade nada: una URL firmada que se
  toca deja de ser válida.
*/
function usableAvatarUrl(value = "") {
  const raw = cleanText(value, "");
  if (!raw) return "";
  if (/[\r\n\t\\]/u.test(raw)) return "";
  if (/^(javascript|vbscript|file):/iu.test(raw)) return "";
  return raw;
}

/*
  La fotografía que declara la sesión vigente para ESA misma identidad, si la
  persona conectada es ella. Es la autoridad viva del dato; el registro de
  confirmaciones sólo es su proyección para los nodos que se pintan después.
*/
function runtimePhotoForIdentity(identity = {}) {
  const user = currentRuntimeUser();
  if (!isObject(user) || !Object.keys(user).length) return null;

  const mine = new Set(identityAliasKeys(user).map(({ alias }) => alias));
  if (!mine.size) return null;
  if (!identityAliasKeys(identity).some(({ alias }) => mine.has(alias))) return null;

  const url = usableAvatarUrl(
    user.avatarUrl ?? user.avatar ?? user.photoUrl ?? user.picture ?? ""
  );
  const hasAvatar = user.hasAvatar === false ? false : Boolean(url);

  return { url: hasAvatar ? url : "", hasAvatar };
}

/*
  Una confirmación no puede sobrevivir a la sesión que la produjo: si el estado
  vigente de esa persona dice otra cosa --por ejemplo, porque su sesión se ha
  renovado con otra fotografía--, manda la sesión y el registro se pone al día.
  Una respuesta antigua no reemplaza a una versión nueva.
*/
function confirmedPhotoForIdentity(identity = {}) {
  const aliases = identityAliasKeys(identity);

  for (const { alias } of aliases) {
    const record = confirmedPhotos.get(alias);
    if (!record) continue;

    const live = runtimePhotoForIdentity(identity);
    if (!live || (live.url === record.url && live.hasAvatar === record.hasAvatar)) {
      return record;
    }

    const updated = Object.freeze({ url: live.url, hasAvatar: live.hasAvatar });
    for (const { alias: own } of aliases) {
      if (confirmedPhotos.has(own)) confirmedPhotos.set(own, updated);
    }
    return updated;
  }

  return null;
}

/*
  Aplica la fotografía confirmada al nodo, si esa identidad tiene una. Devuelve
  las imágenes que el nodo debe considerar después.
*/
function reconcileConfirmedPhoto(host = null, images = []) {
  const record = confirmedPhotoForIdentity(resolveHostIdentity(host));
  if (!record) return images;

  if (!record.hasAvatar) {
    // Retirada confirmada: el marco vuelve a sus iniciales, que siempre están.
    for (const image of images) image.remove?.();
    setAttribute(host, "data-avatar-confirmed", "none");
    return [];
  }

  const existing = images[0] || null;

  if (existing) {
    if (existing.getAttribute("src") !== record.url) {
      existing.setAttribute("src", record.url);
      existing.removeAttribute("data-avatar-failed");
      existing.removeAttribute("data-avatar-failure-reason");
      if (existing.getAttribute("data-avatar-hidden-by-system") === "true") {
        existing.hidden = false;
        existing.removeAttribute("data-avatar-hidden-by-system");
      }
    }
    setAttribute(host, "data-avatar-confirmed", "image");
    return images;
  }

  const document_ = host?.ownerDocument;
  if (!document_?.createElement) return images;

  /*
    Sin `loading="lazy"`: esta imagen se inserta justo para verse ahora, y una
    imagen diferida que además nace oculta no llega a descargarse nunca.
  */
  const image = document_.createElement("img");
  image.setAttribute("data-avatar-image", "true");
  image.setAttribute("data-avatar-confirmed-image", "true");
  image.setAttribute("alt", "");
  image.setAttribute("decoding", "async");
  image.setAttribute("referrerpolicy", "no-referrer");
  image.setAttribute("draggable", "false");
  image.setAttribute("src", record.url);
  host.insertBefore(image, host.firstChild);
  setAttribute(host, "data-avatar-confirmed", "image");

  return [image];
}

/* La huella de cada alias localiza sus nodos por el índice que ya existe en el
   DOM (`data-avatar-identity`), sin recorrer todo el documento. */
function refreshIdentityHosts(aliasKeys = []) {
  if (!isBrowser() || !aliasKeys.length) return 0;

  const selector = aliasKeys
    .map(({ seed }) => `[data-avatar-identity="${avatarIdentityFingerprint(seed)}"]`)
    .join(",");

  let touched = 0;

  for (const host of document.querySelectorAll(selector)) {
    if (!isLikelyAvatarHost(host) || isOptedOut(host)) continue;
    if (synchronizeAvatarHost(host)) touched += 1;
  }

  return touched;
}

/*
  CONTRATO · La llaman los puntos que YA confirman un perfil, con la identidad
  confirmada y la fotografía que el servidor ha devuelto. No hace peticiones, no
  relee documentos, no toca datos del documento y no enlaza por nombre.
  Devuelve cuántos nodos vivos se han actualizado.
*/
export function applyConfirmedAvatar(identity = {}, photo = {}) {
  const aliasKeys = identityAliasKeys(identity);
  if (!aliasKeys.length) return 0;

  const url = usableAvatarUrl(photo?.url ?? photo?.avatarUrl ?? "");
  const hasAvatar = photo?.hasAvatar === false ? false : Boolean(url);
  const record = Object.freeze({ url: hasAvatar ? url : "", hasAvatar });

  for (const { alias } of aliasKeys) confirmedPhotos.set(alias, record);

  counters.confirmedPhotos += 1;

  return refreshIdentityHosts(aliasKeys);
}

/* La sesión termina: lo vigente de la anterior no lo es de la siguiente.
   No se exporta: su único consumidor está en este módulo, y la superficie
   pública ya la ofrece el objeto AvatarSystem. */
function forgetConfirmedAvatars() {
  const size = confirmedPhotos.size;
  confirmedPhotos.clear();
  return size;
}

export function synchronizeAvatarHost(host = null, preferredImage = null) {
  if (!isElement(host) || isOptedOut(host)) return false;

  const rendered = avatarImagesInside(host);

  // Un envoltorio no adopta imagen ni fotografía: manda el host de dentro.
  if (!rendered.length && containsManagedAvatarHost(host)) {
    return releaseWrapperState(host);
  }

  const images = reconcileConfirmedPhoto(host, rendered);
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

function synchronizeAvatarImage(image = null) {
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

    // A containing scan already covers nested hosts/images queued in this turn.
    // Skip detached roots: their former host is queued by the childList record.
    for (const item of roots.filter((root) =>
      (isDocument(root) || root.isConnected) &&
      !roots.some((other) => other !== root && other.contains?.(root))
    )) {
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
      // Removing/replacing an image or fallback also changes the host state.
      const host = isLikelyAvatarHost(record.target)
        ? record.target
        : nearestAvatarHost(record.target);
      if (host) queueScan(host);
      for (const node of record.addedNodes || []) {
        if (isElement(node)) queueScan(node);
      }
      continue;
    }

    if (record.type === "characterData") {
      const parent = record.target?.parentElement || null;
      const host = isLikelyAvatarHost(parent) ? parent : nearestAvatarHost(parent);
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
        // Identity may live on a row/context containing several avatar hosts.
        // Limit reconciliation to that subtree instead of rescanning the SPA.
        else queueScan(target);
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
      "data-email-lower",
      "data-avatar-name",
      "data-avatar-email",
      "data-avatar-user-id",
      "data-avatar-username",
      "data-user-name",
      "data-display-name",
      "data-full-name",
      "data-name",
      "data-username",
      "data-username-lower",
      "data-slug",
      "data-user-slug",
      "data-owner-user-id",
      "data-requester-user-id",
      "data-created-by-user-id",
      "data-technician-user-id",
      "data-tecnico-user-id",
      "data-client-email",
      "data-cliente-email",
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
  forgetConfirmedAvatars();
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
      confirmedPhotoBeatsEmbeddedUrl: true,
      confirmedPhotoNeedsUnambiguousAlias: true,
      confirmedPhotoNeverReadsDocuments: true,
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
  applyConfirmedAvatar,
  forgetConfirmedAvatars,
  resolve: resolveAvatarPresentation,
  initials: avatarInitials,
  destroy: destroyAvatarSystem,
  getSnapshot: getAvatarSystemSnapshot,
});

export default AvatarSystem;
