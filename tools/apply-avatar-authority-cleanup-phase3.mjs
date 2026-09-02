#!/usr/bin/env node

import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceExact(path, from, to, label) {
  const source = read(path);
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${path}: ${label} esperaba 1 coincidencia y obtuvo ${count}`);
  }
  write(path, source.replace(from, to));
}

function replaceRegex(path, regex, replacement, expected, label) {
  const source = read(path);
  let count = 0;
  const next = source.replace(regex, (...args) => {
    count += 1;
    return typeof replacement === "function" ? replacement(...args) : replacement;
  });
  if (count !== expected) {
    throw new Error(`${path}: ${label} esperaba ${expected} coincidencias y obtuvo ${count}`);
  }
  write(path, next);
}

function ensureImport(path, statement) {
  const source = read(path);
  if (source.includes(statement)) return;
  const firstImport = source.indexOf("import ");
  if (firstImport >= 0) {
    write(path, `${source.slice(0, firstImport)}${statement}\n${source.slice(firstImport)}`);
    return;
  }
  const header = source.match(/^\/\*[\s\S]*?\*\/\s*/);
  if (!header) throw new Error(`${path}: no se encontró cabecera para insertar import`);
  const offset = header[0].length;
  write(path, `${source.slice(0, offset)}\n${statement}\n${source.slice(offset)}`);
}

const IDENTITY_IMPORT_VIEWS =
  'import { resolveAvatarPresentation } from "../../features/avatar-system/identity.js";';

// Enhancement: el antiguo fallback global desaparece; queda sólo el feature de comentarios.
replaceExact(
  "src/app/enhancements.js",
  `  Object.freeze({\n    key: "incidencias-avatar-fallback",\n    scope: "incidencias",\n    load: () => import("../features/incidencias-avatar-fallback/index.js"),\n  }),`,
  `  Object.freeze({\n    key: "incidencias-comment-avatars",\n    scope: "incidencias",\n    load: () => import("../features/incidencias-comment-avatars/index.js"),\n  }),`,
  "migrar enhancement de comentarios"
);

// Perfil técnico: presentación global desde el primer markup.
{
  const path = "src/features/incidencias-technician-profile/index.js";
  ensureImport(
    path,
    'import { resolveAvatarPresentation } from "../avatar-system/identity.js";'
  );
  replaceRegex(
    path,
    /function initials\(value = ""\) \{[\s\S]*?\n\}\n\nfunction hash\(value = ""\) \{[\s\S]*?\n\}\n\n/,
    "",
    1,
    "retirar initials/hash local del perfil técnico"
  );
  replaceRegex(
    path,
    /function avatarMarkup\(tech = \{\}\) \{[\s\S]*?\n\}\n\n(?=function statusChip)/,
    `function avatarMarkup(tech = {}) {\n  const src = safeAvatarUrl(tech.avatar);\n  const presentation = resolveAvatarPresentation({\n    ...tech,\n    displayName: tech.name,\n    name: tech.name,\n    email: tech.email,\n    userId: tech.userId,\n    username: tech.username,\n  });\n  return \`<div class="ui-detail-modal-avatar"><div class="ui-detail-modal-avatar-frame" data-avatar-system="true" data-avatar-host="true" data-avatar-tone="\${presentation.tone}" data-avatar-identity="\${attr(presentation.fingerprint)}" data-avatar-initials="\${attr(presentation.initials)}" data-has-avatar="\${src ? "true" : "false"}" aria-hidden="true">\${src ? \`<img data-avatar-image="true" src="\${attr(src)}" alt="" width="72" height="72" loading="eager" decoding="async" referrerpolicy="no-referrer" draggable="false">\` : ""}<span class="ui-detail-modal-avatar-fallback" data-avatar-fallback="true">\${escapeHtml(presentation.initials)}</span></div></div>\`;\n}\n\n`,
    1,
    "migrar avatar del perfil técnico"
  );
}

// Facturas Create.
{
  const path = "src/views/facturas/facturas.template.create.js";
  ensureImport(path, IDENTITY_IMPORT_VIEWS);
  replaceRegex(
    path,
    /function initialsFrom\(value = "", fallback = "CL"\) \{[\s\S]*?\n\}\n\n/,
    "",
    1,
    "retirar initials local de Facturas Create"
  );
  replaceRegex(
    path,
    /\n\s*initials: initialsFrom\(name, "CL"\),/,
    "",
    1,
    "retirar initials persistidas en cliente normalizado"
  );
  replaceRegex(
    path,
    /function getCreateAvatarTone\(client = \{\}\) \{[\s\S]*?\n\}\n\nfunction renderAvatar\(client = \{\}\) \{[\s\S]*?\n\}\n\n(?=function renderTaxBadge)/,
    `function renderAvatar(client = {}) {\n  const current = normalizeClient(client);\n  const src = safeImageSrc(current.avatarUrl);\n  const presentation = resolveAvatarPresentation({\n    ...current,\n    displayName: current.name,\n    name: current.name,\n    email: current.email,\n    username: current.username,\n    userId: first(current.userId, current.clienteUserId, current.id, current.clienteId, ""),\n  });\n\n  return \`\n    <span class="fac-create-avatar\${src ? " has-image" : " is-fallback"}" aria-hidden="true"\n      data-avatar-system="true" data-avatar-host="true" data-avatar-tone="\${attr(String(presentation.tone))}"\n      data-avatar-identity="\${attr(presentation.fingerprint)}" data-avatar-initials="\${attr(presentation.initials)}"\n      data-has-avatar="\${src ? "true" : "false"}">\n      \${src ? \`<img data-avatar-image="true" src="\${attr(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">\` : ""}\n      <span data-avatar-fallback="true">\${escapeHtml(presentation.initials)}</span>\n    </span>\n  \`;\n}\n\n`,
    1,
    "migrar avatar de Facturas Create"
  );
}

// Incidencias Create.
{
  const path = "src/views/incidencias/incidencias.template.create.impl.js";
  ensureImport(path, IDENTITY_IMPORT_VIEWS);
  replaceRegex(
    path,
    /function hashText\(value = ""\) \{[\s\S]*?\n\}\n\nfunction initialsFrom\(value = ""\) \{[\s\S]*?\n\}\n\n/,
    "",
    1,
    "retirar hash/initials local de Incidencias Create"
  );
  replaceExact(
    path,
    `  const avatarUrl = firstImageSrc(raw, nested);\n  const avatarToneIdentity = email || userId || name;\n\n  return {`,
    `  const avatarUrl = firstImageSrc(raw, nested);\n  const presentation = resolveAvatarPresentation({\n    ...raw,\n    displayName: name,\n    name,\n    email,\n    userId,\n    username,\n  });\n\n  return {`,
    "resolver presentación del usuario seleccionado"
  );
  replaceExact(
    path,
    `    avatarUrl,\n    avatar: avatarUrl || null,\n    initials: initialsFrom(name),\n    tone: hashText(avatarToneIdentity) % 10,`,
    `    avatarUrl,\n    avatar: avatarUrl || null,\n    initials: presentation.initials,\n    tone: presentation.tone,\n    avatarIdentity: presentation.fingerprint,`,
    "usar presentación global en usuario seleccionado"
  );
  replaceRegex(
    path,
    /function renderUserAvatar\(user = \{\}, className = "inc-create-user-avatar"\) \{[\s\S]*?\n\}\n\n(?=function renderSelectedUser)/,
    `function renderUserAvatar(user = {}, className = "inc-create-user-avatar") {\n  const safeUser = normalizeUserResult(user);\n  const avatar = safeImageSrc(safeUser.avatarUrl || safeUser.avatar);\n  const tone = attr(String(safeUser.tone));\n  const common = \`data-avatar-system="true" data-avatar-host="true" data-avatar-tone="\${tone}" data-avatar-identity="\${attr(safeUser.avatarIdentity)}" data-avatar-initials="\${attr(safeUser.initials)}" data-has-avatar="\${avatar ? "true" : "false"}"\`;\n\n  return \`<span class="\${attr(className)} \${avatar ? "has-image" : "is-fallback"}" \${common}>\${avatar ? \`<img data-avatar-image="true" src="\${attr(avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">\` : ""}<span data-avatar-fallback="true">\${escapeHtml(safeUser.initials)}</span></span>\`;\n}\n\n`,
    1,
    "migrar markup de usuario seleccionado"
  );
}

// Incidencias listado.
{
  const path = "src/views/incidencias/incidencias.template.js";
  ensureImport(path, IDENTITY_IMPORT_VIEWS);
  replaceRegex(
    path,
    /function hash\(v = ""\) \{[\s\S]*?\n\}\n\nfunction initials\(v = ""\) \{[\s\S]*?\n\}\n\n/,
    "",
    1,
    "retirar hash/initials local del listado de Incidencias"
  );
  replaceRegex(
    path,
    /function renderAvatar\(it = \{\}\) \{[\s\S]*?\n\}\n\n(?=function renderStatusChip)/,
    `function renderAvatar(it = {}) {\n  const name = getClientName(it);\n  const src = getAvatar(it);\n  const presentation = resolveAvatarPresentation({\n    displayName: name,\n    name,\n    email: getClientEmail(it),\n  });\n  return \`\n    <span class="incidencias-avatar\${src ? " has-image" : " is-fallback"}" data-avatar-system="true" data-avatar-host="true" data-avatar-tone="\${at(String(presentation.tone))}" data-avatar-identity="\${at(presentation.fingerprint)}" data-avatar-initials="\${at(presentation.initials)}" data-has-avatar="\${src ? "true" : "false"}" title="\${at(name)}" aria-hidden="true">\n      \${src ? \`<img class="incidencias-avatar-img" data-avatar-image="true" src="\${at(src)}" alt="" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">\` : ""}\n      <span class="incidencias-avatar-fallback" data-avatar-fallback="true">\${esc(presentation.initials)}</span>\n    </span>\n  \`;\n}\n\n`,
    1,
    "migrar avatar de solicitante en listado"
  );
  replaceRegex(
    path,
    /function renderAssignedBadge\(it = \{\}\) \{[\s\S]*?\n\}\n\n(?=function render)/,
    (match) => {
      const nextFunction = match.match(/(?=function render)/);
      return `function renderAssignedBadge(it = {}) {\n  const name = getAssignedName(it);\n  const norm = key(name);\n  if (!name || norm === "no_asignado" || norm === "sin_asignar") return "";\n  const avatar = getAssignedAvatar(it);\n  const presentation = resolveAvatarPresentation({\n    displayName: name,\n    name,\n    email: getAssignedEmail(it),\n  });\n  return \`\n    <span class="incidencias-assigned-badge" data-assigned="true" title="\${at(\`Técnico: \${name}\`)}">\n      <span class="incidencias-assigned-avatar\${avatar ? " has-image" : " is-fallback"}" data-avatar-system="true" data-avatar-host="true" data-avatar-tone="\${at(String(presentation.tone))}" data-avatar-identity="\${at(presentation.fingerprint)}" data-avatar-initials="\${at(presentation.initials)}" data-has-avatar="\${avatar ? "true" : "false"}" aria-hidden="true">\n        \${avatar ? \`<img data-avatar-image="true" src="\${at(avatar)}" alt="" width="20" height="20" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">\` : ""}\n        <span data-avatar-fallback="true">\${esc(presentation.initials)}</span>\n      </span>\n      <span class="incidencias-assigned-name">\${esc(name)}</span>\n    </span>\n  \`;\n}\n\n`;
    },
    1,
    "migrar avatar de técnico en listado"
  );
}

// Incidencias modal: elimina hash/iniciales locales y usa la presentación global.
{
  const path = "src/views/incidencias/incidencias.template.modal.impl.js";
  ensureImport(path, IDENTITY_IMPORT_VIEWS);
  replaceRegex(
    path,
    /function hashText\(value = ""\) \{[\s\S]*?\n\}\n\nfunction initialsFrom\(value = ""\) \{[\s\S]*?\n\}\n\n/,
    "",
    1,
    "retirar hash/initials local del modal de Incidencias"
  );
  replaceRegex(
    path,
    /  const identity =\n    email \|\|\n    name;\n\n  const tone =\n    hashText\(identity\) % 10;/,
    `  const presentation = resolveAvatarPresentation({\n    displayName: name,\n    name,\n    email,\n  });\n\n  const tone = presentation.tone;`,
    1,
    "resolver avatar del solicitante en modal"
  );
  replaceRegex(
    path,
    /  const tone =\n    hashText\(\n      `\$\{name\}:\$\{email\}`\n    \) % 10;/,
    `  const presentation = resolveAvatarPresentation({\n    displayName: name,\n    name,\n    email,\n  });\n\n  const tone = presentation.tone;`,
    1,
    "resolver avatar del técnico en modal"
  );
  replaceRegex(
    path,
    /initialsFrom\(name\)/g,
    "presentation.initials",
    2,
    "usar iniciales globales en modal"
  );
}

console.log("Avatar authority cleanup phase 3 applied.");
