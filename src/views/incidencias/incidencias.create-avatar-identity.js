/* =========================================================
   Onion Support - Incidencias Create Avatar Identity Boundary
   Archivo: /src/views/incidencias/incidencias.create-avatar-identity.js

   TEMPLATE SAFE · GLOBAL AVATARSYSTEM AUTHORITY

   Responsabilidad:
   - Sellar nombre/email/userId en los avatares del selector de usuario.
   - Evitar que AvatarSystem vuelva a interpretar las iniciales ya renderizadas
     (p. ej. "JH") como si fueran el nombre de la persona ("JH" -> "J").
   - Mantener tono e iniciales exactamente iguales a Microsoft Fluent Persona.
   - No pintar colores, no hacer DOM, HTTP, Auth, Store ni Storage.
========================================================= */

import { resolveAvatarPresentation } from "../../features/avatar-system/identity.js";

export const INCIDENCIAS_CREATE_AVATAR_IDENTITY_VERSION =
  "incidencias.create-avatar-identity.v1-global-authority";

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function object(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output || fallback;
}

function firstText(...values) {
  for (const value of values) {
    const output = text(value, "");
    if (output) return output;
  }
  return "";
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtml(value = "") {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function regexEscape(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readAttribute(tag = "", name = "") {
  const match = String(tag).match(
    new RegExp(`\\s${regexEscape(name)}="([^"]*)"`, "i")
  );
  return decodeHtml(match?.[1] || "");
}

function upsertAttribute(tag = "", name = "", value = "") {
  const source = String(tag);
  const escaped = escapeHtml(value);
  const pattern = new RegExp(`\\s${regexEscape(name)}="[^"]*"`, "i");

  if (pattern.test(source)) {
    return source.replace(pattern, ` ${name}="${escaped}"`);
  }

  return source.replace(/>$/, ` ${name}="${escaped}">`);
}

function selectedIdentity(input = {}) {
  const root = object(input);
  const form = object(root.form || root.values || root);
  const userSearch = object(root.userSearch);
  const selected = object(userSearch.selectedUser);

  const userId = firstText(
    form.targetUserId,
    form.userId,
    form.usuarioId,
    selected.userId,
    selected.id,
    selected.usuarioId
  );

  const name = firstText(
    form.targetUserName,
    form.userName,
    form.clienteNombre,
    selected.displayName,
    selected.fullName,
    selected.name,
    selected.nombre
  );

  const email = firstText(
    form.targetUserEmail,
    form.userEmail,
    form.clienteEmail,
    selected.emailLower,
    selected.email,
    selected.userEmail
  ).toLowerCase();

  const username = firstText(
    selected.usernameLower,
    selected.username,
    selected.userName
  );

  if (!userId && !name && !email && !username) return null;

  return {
    ...selected,
    userId,
    displayName: name,
    name,
    email,
    username,
  };
}

function identityFromResultButton(openingTag = "") {
  const userId = readAttribute(openingTag, "data-user-id");
  const name = readAttribute(openingTag, "data-user-name");
  const email = readAttribute(openingTag, "data-user-email");

  if (!userId && !name && !email) return null;

  return {
    userId,
    displayName: name,
    name,
    email,
  };
}

function sealAvatarTag(tag = "", identity = {}, source = "incidencias-create") {
  const name = firstText(
    identity.displayName,
    identity.fullName,
    identity.name,
    identity.nombre
  );
  const email = firstText(
    identity.emailLower,
    identity.email,
    identity.userEmail,
    identity.clienteEmail
  ).toLowerCase();
  const userId = firstText(
    identity.userId,
    identity.id,
    identity.usuarioId,
    identity.uid
  );
  const username = firstText(
    identity.usernameLower,
    identity.username,
    identity.userName
  );

  const presentation = resolveAvatarPresentation({
    ...object(identity),
    userId,
    displayName: name,
    name,
    email,
    username,
  });

  let output = String(tag);

  const attributes = {
    "data-avatar-authority": "global",
    "data-avatar-source": source,
    "data-avatar-name": name,
    "data-avatar-email": email,
    "data-avatar-user-id": userId,
    "data-avatar-username": username,
    "data-avatar-identity": presentation.fingerprint,
    "data-avatar-tone": String(presentation.tone),
    "data-avatar-initials": presentation.initials,
    "data-avatar-identity-contract": INCIDENCIAS_CREATE_AVATAR_IDENTITY_VERSION,
  };

  for (const [attribute, value] of Object.entries(attributes)) {
    output = upsertAttribute(output, attribute, value);
  }

  return output;
}

function patchSelectedAvatar(html = "", input = {}) {
  const identity = selectedIdentity(input);
  if (!identity) return String(html);

  return String(html).replace(
    /<span\b(?=[^>]*class="[^"]*\binc-create-target-user-avatar\b[^"]*")[^>]*>/i,
    (tag) => sealAvatarTag(tag, identity, "incidencias-create-selected-user")
  );
}

function patchResultAvatars(html = "") {
  return String(html).replace(
    /<button\b(?=[^>]*class="[^"]*\binc-create-user-result\b[^"]*")[^>]*>[\s\S]*?<\/button>/gi,
    (buttonBlock) => {
      const openingTag = buttonBlock.match(/^<button\b[^>]*>/i)?.[0] || "";
      const identity = identityFromResultButton(openingTag);
      if (!identity) return buttonBlock;

      return buttonBlock.replace(
        /<span\b(?=[^>]*class="[^"]*\binc-create-user-avatar\b[^"]*")[^>]*>/i,
        (tag) => sealAvatarTag(tag, identity, "incidencias-create-search-result")
      );
    }
  );
}

export function sealIncidenciasCreateAvatarMarkup(html = "", input = {}) {
  let output = String(html ?? "");
  if (!output) return output;

  output = patchSelectedAvatar(output, input);
  output = patchResultAvatars(output);
  return output;
}

export function getIncidenciasCreateAvatarIdentitySnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_CREATE_AVATAR_IDENTITY_VERSION,
    policy: Object.freeze({
      globalAvatarAuthority: true,
      explicitNameSeed: true,
      explicitEmailSeed: true,
      explicitUserIdSeed: true,
      microsoftPersonaPresentation: true,
      noFallbackTextAsIdentitySeed: true,
      selectedUserCovered: true,
      searchResultsCovered: true,
      noDom: true,
      noHttp: true,
      noStorage: true,
      noLocalPalette: true,
    }),
  });
}

export default sealIncidenciasCreateAvatarMarkup;
