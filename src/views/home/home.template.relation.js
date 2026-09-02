/* =========================================================
   Onion Support - Home Entity Relationship Presentation

   Identidad compacta y canónica para las filas de Inicio.
   Toda presentación de avatar se delega en AvatarSystem:
   - Incidencia: solicitante/cliente y su avatar real.
   - Factura: empresa, contacto, email y avatar del cliente.

   No consulta APIs, no completa datos ausentes y no crea identidades sintéticas.
========================================================= */

import {
  resolveAvatarPresentation,
} from "../../features/avatar-system/identity.js";
import {
  attr,
  cleanText,
  escapeHtml,
  first,
  isObject,
  normalizeKey,
  safeArray,
  safeImageSrc,
} from "./home.template.foundation.js";

export const HOME_ENTITY_RELATION_VERSION =
  "home.entity-relation.v2-global-avatar-authority";

const INVOICE_COMPANY_PATHS = Object.freeze([
  "clienteEmpresa",
  "empresa",
  "company",
  "companyName",
  "razonSocial",
  "cliente.razonSocial",
  "cliente.companyName",
  "cliente.empresa",
  "client.razonSocial",
  "client.companyName",
  "customer.razonSocial",
  "customer.companyName",
  "clienteSnapshot.razonSocial",
]);

const INVOICE_CONTACT_PATHS = Object.freeze([
  "clienteNombre",
  "nombreContacto",
  "contactName",
  "cliente.nombreContacto",
  "cliente.nombre",
  "cliente.name",
  "cliente.displayName",
  "clienteSnapshot.nombreContacto",
  "clientName",
  "client.name",
  "customer.name",
  "name",
  "nombre",
]);

const INVOICE_EMAIL_PATHS = Object.freeze([
  "clienteEmail",
  "emailCliente",
  "cliente.email",
  "cliente.emailLower",
  "clienteSnapshot.email",
  "email",
  "clientEmail",
  "client.email",
  "customer.email",
]);

const INVOICE_AVATAR_PATHS = Object.freeze([
  "clienteAvatar",
  "clientAvatar",
  "avatar",
  "avatarUrl",
  "logo",
  "logoUrl",
  "photo",
  "photoUrl",
  "picture",
  "pictureUrl",
  "cliente.avatar",
  "cliente.avatarUrl",
  "cliente.logo",
  "cliente.logoUrl",
  "client.avatar",
  "client.avatarUrl",
  "customer.avatar",
  "customer.avatarUrl",
]);

function object(value = null) {
  return isObject(value) ? value : {};
}

function readPath(source = {}, path = "") {
  const parts = cleanText(path, "").split(".").filter(Boolean);
  let current = source;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current?.[part];
  }

  return current;
}

function firstPath(source = {}, paths = []) {
  const root = object(source);

  for (const path of safeArray(paths)) {
    const value = readPath(root, path);

    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function firstPathAcross(source = {}, paths = []) {
  const root = object(source);
  const raw = object(root.raw);

  return first(
    firstPath(root, paths),
    firstPath(raw, paths),
    null
  );
}

function firstImage(values = [], seen = new WeakSet()) {
  for (const value of safeArray(values).flat()) {
    if (value === null || value === undefined) continue;

    if (isObject(value)) {
      if (seen.has(value)) continue;
      seen.add(value);

      const nested = firstImage([
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.pictureUrl,
        value.photo,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.logo,
        value.logoUrl,
        value.userAvatar,
        value.userAvatarUrl,
        value.clienteAvatar,
        value.clienteAvatarUrl,
        value.clientAvatar,
        value.clientAvatarUrl,
        value.profile,
        value.raw,
      ], seen);

      if (nested) return nested;
      continue;
    }

    const safe = safeImageSrc(value);
    if (safe) return safe;
  }

  return "";
}

function sameIdentityText(left = "", right = "") {
  const a = normalizeKey(left);
  const b = normalizeKey(right);
  return Boolean(a && b && a === b);
}

function normalizedEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();
  return email.includes("@") ? email : "";
}

function finalizeRelation({
  kind = "relacion",
  name = "",
  secondaryName = "",
  email = "",
  avatarUrl = "",
} = {}) {
  const primary = cleanText(name, "");
  if (!primary) return null;

  const secondary = cleanText(secondaryName, "");
  const safeSecondary =
    secondary && !sameIdentityText(primary, secondary)
      ? secondary
      : "";

  const safeEmail = normalizedEmail(email);
  const visibleEmail =
    safeEmail &&
    !sameIdentityText(primary, safeEmail) &&
    !sameIdentityText(safeSecondary, safeEmail)
      ? safeEmail
      : "";

  const avatar = firstImage([avatarUrl]);
  const presentation = resolveAvatarPresentation({
    displayName: primary,
    name: primary,
    email: safeEmail,
  });

  return Object.freeze({
    kind: normalizeKey(kind) || "relacion",
    name: primary,
    secondaryName: safeSecondary,
    email: visibleEmail,
    identityEmail: presentation.email,
    avatarUrl: avatar,
    initials: presentation.initials,
    tone: presentation.tone,
    colorKey: presentation.colorKey,
    fingerprint: presentation.fingerprint,
  });
}

function unwrapIncidencia(source = {}) {
  const root = object(source);

  return object(
    first(
      root.ticket,
      root.incidencia,
      root.item,
      root.detail,
      root.data?.ticket,
      root.data?.incidencia,
      root.data?.item,
      root.data,
      root
    )
  );
}

function incidenciaRelation(source = {}) {
  const root = unwrapIncidencia(source);
  const declared = object(first(root.relation, root.entityRelation, root.requester, {}));
  const requesterSnapshot = object(root.requesterSnapshot);
  const cliente = object(root.cliente);
  const receptor = object(root.receptor);
  const user = object(root.user);

  const name = cleanText(
    first(
      declared.displayName,
      declared.fullName,
      declared.name,
      declared.nombre,
      root.displayName,
      root.name,
      root.nombre,
      root.clientName,
      root.clienteNombre,
      root.requesterName,
      requesterSnapshot.displayName,
      requesterSnapshot.fullName,
      requesterSnapshot.name,
      requesterSnapshot.nombre,
      cliente.displayName,
      cliente.fullName,
      cliente.name,
      cliente.nombre,
      receptor.displayName,
      receptor.fullName,
      receptor.name,
      receptor.nombre,
      user.displayName,
      user.fullName,
      user.name,
      user.nombre,
      ""
    ),
    ""
  );

  const email = normalizedEmail(
    first(
      declared.email,
      declared.emailLower,
      root.email,
      root.emailLower,
      root.userEmail,
      root.clienteEmail,
      requesterSnapshot.email,
      requesterSnapshot.emailLower,
      cliente.email,
      cliente.emailLower,
      receptor.email,
      receptor.emailLower,
      user.email,
      user.emailLower,
      ""
    )
  );

  const avatarUrl = firstImage([
    declared,
    root.avatarUrl,
    root.avatar,
    root.userAvatarUrl,
    root.userAvatar,
    root.clienteAvatarUrl,
    root.clienteAvatar,
    requesterSnapshot,
    cliente,
    receptor,
    user,
  ]);

  return finalizeRelation({
    kind: "solicitante",
    name,
    email,
    avatarUrl,
  });
}

function facturaRelation(source = {}) {
  const root = object(source);
  const raw = object(root.raw);
  const declared = object(first(root.relation, root.entityRelation, root.customer, {}));

  const company = cleanText(
    first(
      declared.companyName,
      declared.razonSocial,
      declared.company,
      firstPathAcross(root, INVOICE_COMPANY_PATHS),
      ""
    ),
    ""
  );

  const contact = cleanText(
    first(
      declared.displayName,
      declared.fullName,
      declared.contactName,
      declared.name,
      declared.nombre,
      firstPathAcross(root, INVOICE_CONTACT_PATHS),
      ""
    ),
    ""
  );

  const email = normalizedEmail(
    first(
      declared.email,
      declared.emailLower,
      firstPathAcross(root, INVOICE_EMAIL_PATHS),
      ""
    )
  );

  const avatarUrl = firstImage([
    declared,
    firstPath(root, INVOICE_AVATAR_PATHS),
    firstPath(raw, INVOICE_AVATAR_PATHS),
  ]);

  return finalizeRelation({
    kind: "cliente",
    name: company || contact,
    secondaryName:
      company && contact && !sameIdentityText(company, contact)
        ? contact
        : "",
    email,
    avatarUrl,
  });
}

function genericRelation(source = {}, kind = "relacion") {
  const root = object(source);
  const declared = object(first(root.relation, root.entityRelation, {}));

  const name = cleanText(
    first(
      declared.displayName,
      declared.fullName,
      declared.name,
      declared.nombre,
      root.displayName,
      root.fullName,
      root.name,
      root.nombre,
      root.email,
      ""
    ),
    ""
  );

  const email = normalizedEmail(
    first(
      declared.email,
      declared.emailLower,
      root.email,
      root.emailLower,
      root.userEmail,
      root.clienteEmail,
      ""
    )
  );

  const avatarUrl = firstImage([
    declared,
    root.avatarUrl,
    root.avatar,
    root.picture,
    root.photoUrl,
    root.photoURL,
    root.imageUrl,
    root.profile,
    root.raw,
  ]);

  return finalizeRelation({
    kind,
    name,
    email,
    avatarUrl,
  });
}

export function resolveHomeEntityRelation(type = "", source = {}) {
  const entityType = normalizeKey(type);

  if (entityType === "incidencia" || entityType === "ticket") {
    return incidenciaRelation(source);
  }

  if (entityType === "factura" || entityType === "invoice") {
    return facturaRelation(source);
  }

  if (entityType === "cliente" || entityType === "client") {
    return genericRelation(source, "cliente");
  }

  if (entityType === "usuario" || entityType === "user") {
    return genericRelation(source, "usuario");
  }

  return null;
}

export function homeRelationAccessibleName(relation = null) {
  if (!relation || !isObject(relation)) return "";

  return [
    cleanText(relation.name, ""),
    cleanText(relation.secondaryName, ""),
    normalizedEmail(relation.email),
  ]
    .filter(Boolean)
    .join(" · ");
}

function relationDetail(relation = null) {
  if (!relation || !isObject(relation)) return "";

  const details = [
    cleanText(relation.secondaryName, ""),
    normalizedEmail(relation.email),
  ].filter(Boolean);

  if (!details.length) return "";

  return `
    <span
      class="home-entity-relation-detail"
      title="${attr(details.join(" · "))}"
    >
      ${details.map((detail, index) => `
        ${index ? '<span class="home-entity-relation-separator" aria-hidden="true">·</span>' : ""}
        <span>${escapeHtml(detail)}</span>
      `).join("")}
    </span>
  `;
}

export function renderHomeEntityRelation(relation = null) {
  if (!relation || !isObject(relation)) return "";

  const name = cleanText(relation.name, "");
  if (!name) return "";

  const avatarUrl = safeImageSrc(relation.avatarUrl);
  const accessibleName = homeRelationAccessibleName(relation) || name;
  const presentation = resolveAvatarPresentation({
    displayName: name,
    name,
    email: relation.identityEmail || relation.email || "",
  });
  const tone = Number(relation.tone ?? presentation.tone) >>> 0;
  const initials = cleanText(relation.initials, presentation.initials);
  const fingerprint = cleanText(relation.fingerprint, presentation.fingerprint);
  const colorKey = cleanText(relation.colorKey, presentation.colorKey);
  const identityEmail = normalizedEmail(
    relation.identityEmail || relation.email || presentation.email
  );

  return `
    <span
      class="home-entity-relation"
      data-home-entity-relation="true"
      data-home-relation-kind="${attr(relation.kind)}"
      data-home-relation-avatar="${avatarUrl ? "true" : "false"}"
      title="${attr(accessibleName)}"
    >
      <span
        class="home-entity-relation-avatar ${avatarUrl ? "has-image" : "is-fallback"}"
        data-avatar-system="true"
        data-avatar-host="true"
        data-avatar-authority="global"
        data-avatar-state="${avatarUrl ? "image" : "fallback"}"
        data-avatar-tone="${attr(String(tone))}"
        data-avatar-identity="${attr(fingerprint)}"
        data-avatar-color-key="${attr(colorKey)}"
        data-avatar-initials="${attr(initials)}"
        data-avatar-name="${attr(name)}"
        ${identityEmail ? `data-avatar-email="${attr(identityEmail)}"` : ""}
        data-has-avatar="${avatarUrl ? "true" : "false"}"
        aria-hidden="true"
      >
        <span class="home-entity-relation-fallback" data-avatar-fallback="true">${escapeHtml(initials)}</span>
        ${avatarUrl ? `
          <img
            class="home-entity-relation-img"
            data-avatar-image="true"
            src="${attr(avatarUrl)}"
            alt=""
            width="30"
            height="30"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            referrerpolicy="no-referrer"
            draggable="false"
          >
        ` : ""}
      </span>

      <span class="home-entity-relation-copy">
        <strong class="home-entity-relation-name">${escapeHtml(name)}</strong>
        ${relationDetail(relation)}
      </span>
    </span>
  `;
}

export default Object.freeze({
  version: HOME_ENTITY_RELATION_VERSION,
  resolve: resolveHomeEntityRelation,
  render: renderHomeEntityRelation,
  accessibleName: homeRelationAccessibleName,
});