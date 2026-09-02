#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function file(relative) {
  return path.join(ROOT, relative);
}

function read(relative) {
  return fs.readFileSync(file(relative), "utf8");
}

function write(relative, content) {
  fs.writeFileSync(file(relative), content, "utf8");
}

function replaceCount(relative, regex, replacement, expected, label) {
  const source = read(relative);
  let count = 0;
  const next = source.replace(regex, (...args) => {
    count += 1;
    return typeof replacement === "function" ? replacement(...args) : replacement;
  });
  if (count !== expected) {
    throw new Error(`${relative}: ${label} esperaba ${expected}, obtuvo ${count}`);
  }
  write(relative, next);
}

function ensureImport(relative, statement) {
  const source = read(relative);
  if (source.includes(statement)) return;

  const firstImport = source.indexOf("import ");
  if (firstImport >= 0) {
    write(relative, `${source.slice(0, firstImport)}${statement}\n${source.slice(firstImport)}`);
    return;
  }

  const header = source.match(/^\/\*[\s\S]*?\*\/\s*/);
  if (!header) throw new Error(`${relative}: no se pudo localizar cabecera para import`);
  const offset = header[0].length;
  write(relative, `${source.slice(0, offset)}\n${statement}\n${source.slice(offset)}`);
}

function removeLegacyToneRules(relative) {
  let source = read(relative);
  const rule = /(^|\n)([^{}]*(?:\[data-avatar-tone=["'][0-9]["']\]|(?:avatar[^{}\n]*tone-[0-9]))[^{}]*)\{[^{}]*\}\s*/gm;
  let total = 0;
  while (true) {
    let iteration = 0;
    source = source.replace(rule, (match, prefix) => {
      iteration += 1;
      return prefix;
    });
    total += iteration;
    if (!iteration) break;
  }
  if (!total) throw new Error(`${relative}: no encontró reglas legacy de tone`);
  write(relative, source);
  return total;
}

// 1) La composición privada deja de pintar avatares por completo.
replaceCount(
  "src/css/compositions/private-admin-parity.css",
  /\/\* =========================================================\n   CANONICAL FALLBACK AVATAR\n========================================================= \*\/[\s\S]*?(?=\/\* =========================================================\n   SHARED CHIPS \/ SKELETONS \/ EMPTY \/ FEED)/,
  "/* =========================================================\n   AVATAR LAYOUT\n   Geometría, estado, imagen y paint: components/avatar-system.css\n========================================================= */\n\n",
  1,
  "retirar autoridad visual legacy de listados"
);

// 2) Detail modal conserva tipografía/contexto, nunca paint/paletas de avatar.
replaceCount(
  "src/css/components/detail-modal.css",
  /\.ui-detail-modal-avatar-frame \{[\s\S]*?\n\}/,
  `.ui-detail-modal-avatar-frame {\n  display: grid;\n  place-items: center;\n  font-size: var(--font-lg);\n  font-weight: var(--weight-black);\n  letter-spacing: var(--letter-tight);\n}\n`,
  1,
  "delegar paint de avatar de detail modal"
);
removeLegacyToneRules("src/css/components/detail-modal.css");
replaceCount(
  "src/css/components/detail-modal.css",
  /\.ui-detail-modal-avatar-frame img \{[\s\S]*?\n\}\s*\.ui-detail-modal-avatar-frame\[data-has-avatar="true"\] \.ui-detail-modal-avatar-fallback \{[\s\S]*?\n\}\s*/,
  "",
  1,
  "retirar image/fallback local del detail modal"
);
replaceCount(
  "src/css/components/detail-modal.css",
  /(\.ui-detail-modal-avatar,\n\.ui-detail-modal-avatar-frame \{\ninline-size: 46px;\n    block-size: 46px;)\n    border-radius: var\(--radius-sm\);/,
  "$1",
  1,
  "retirar shape local responsive"
);
replaceCount(
  "src/css/components/detail-modal.css",
  /\n\.ui-detail-modal-avatar-frame \{\nborder: 1px solid CanvasText;\n  background: Canvas;\n  color: CanvasText;\n  box-shadow: none;\n\}\n/,
  "\n",
  1,
  "retirar forced-colors local"
);

// 3) El resto de CSS pierde únicamente reglas tone 0..9; los tamaños de contexto sobreviven.
for (const css of [
  "src/css/views/clientes/create.css",
  "src/css/views/clientes/detail.css",
  "src/css/views/facturas/create.css",
  "src/css/views/facturas/detail.css",
  "src/css/views/incidencias/index.css",
]) {
  removeLegacyToneRules(css);
}

const identityImport = `import { resolveAvatarPresentation } from "../../features/avatar-system/identity.js";`;

// 4) Clientes principal: adapter de DTO -> presentación global.
ensureImport("src/views/clientes/clientes.template.js", identityImport);
replaceCount(
  "src/views/clientes/clientes.template.js",
  /function initials\(value = ""\) \{[\s\S]*?\n\}\n\nfunction avatarTone\(item = \{\}\) \{[\s\S]*?\n\}\n\n(?=function safeAvatarUrl)/,
  `function avatarPresentation(item = {}, label = "Cliente") {\n  const current = normalizeClienteModel(item);\n  return resolveAvatarPresentation({\n    ...current,\n    displayName: cleanText(label, "Cliente"),\n    name: cleanText(label, "Cliente"),\n    email: current.email,\n    userId: first(current.userId, current.clienteId, current.clientId, current.id, ""),\n  });\n}\n\n`,
  1,
  "retirar initials/tone local de Clientes"
);
replaceCount(
  "src/views/clientes/clientes.template.js",
  /function renderAvatar\(item = \{\}\) \{[\s\S]*?\n\}\n\n(?=function renderContact)/,
  `function renderAvatar(item = {}) {\n  const current = normalizeClienteModel(item);\n  const label = cleanText(first(current.contactoNombre, current.nombreFiscal, "Cliente"), "Cliente");\n  const src = safeAvatarUrl(first(current.avatar, current.avatarUrl, ""));\n  const presentation = avatarPresentation(current, label);\n  return \`\n    <span class="clientes-avatar\${src ? " has-image" : " is-fallback"}" aria-hidden="true"\n      data-avatar-system="true" data-avatar-host="true" data-avatar-tone="\${attr(String(presentation.tone))}"\n      data-avatar-identity="\${attr(presentation.fingerprint)}" data-avatar-initials="\${attr(presentation.initials)}"\n      data-has-avatar="\${src ? "true" : "false"}">\n      \${src ? \`<img class="clientes-avatar-img" data-avatar-image="true" src="\${attr(src)}" alt="" width="42" height="42" loading="lazy" decoding="async" referrerpolicy="no-referrer">\` : ""}\n      <span class="clientes-avatar-fallback" data-avatar-fallback="true">\${escapeHtml(presentation.initials)}</span>\n    </span>\n  \`;\n}\n\n`,
  1,
  "render global de avatar de Clientes"
);

// 5) Clientes legacy aún es módulo activo; elimina sólo su algoritmo visual local.
ensureImport("src/views/clientes/clientes.template.legacy.js", identityImport);
replaceCount(
  "src/views/clientes/clientes.template.legacy.js",
  /function initials\(value = ""\) \{[\s\S]*?\n\}\n\nfunction avatarTone\(item = \{\}\) \{[\s\S]*?\n\}\n\n(?=function renderAvatar)/,
  `function avatarPresentation(item = {}, label = "Cliente") {\n  const current = normalizeClienteModel(item);\n  return resolveAvatarPresentation({\n    ...current,\n    displayName: cleanText(label, "Cliente"),\n    name: cleanText(label, "Cliente"),\n    email: current.email,\n    userId: first(current.userId, current.clienteId, current.clientId, current.id, ""),\n  });\n}\n\n`,
  1,
  "retirar initials/tone local de Clientes legacy"
);
replaceCount(
  "src/views/clientes/clientes.template.legacy.js",
  /function renderAvatar\(item = \{\}\) \{[\s\S]*?\n\}\n\n(?=function renderStatusChip|function statusLabel|function render)/,
  (match) => {
    const fnEnd = match.lastIndexOf("\n}\n\n");
    if (fnEnd < 0) throw new Error("Clientes legacy: renderAvatar sin cierre");
    return `function renderAvatar(item = {}) {\n  const current = normalizeClienteModel(item);\n  const src = safeAvatarUrl(current.avatar);\n  const label = cleanText(first(current.contactoNombre, current.nombreFiscal, current.email, "Cliente"), "Cliente");\n  const presentation = avatarPresentation(current, label);\n  return \`<span class="clientes-avatar\${src ? " has-image" : " is-fallback"}" aria-hidden="true" data-avatar-system="true" data-avatar-host="true" data-avatar-tone="\${attr(String(presentation.tone))}" data-avatar-identity="\${attr(presentation.fingerprint)}" data-avatar-initials="\${attr(presentation.initials)}" data-has-avatar="\${src ? "true" : "false"}">\${src ? \`<img class="clientes-avatar-img" data-avatar-image="true" src="\${attr(src)}" alt="" width="42" height="42" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">\` : ""}<span class="clientes-avatar-fallback" data-avatar-fallback="true">\${escapeHtml(presentation.initials)}</span></span>\`;\n}\n\n`;
  },
  1,
  "render global de avatar de Clientes legacy"
);

// 6) Usuarios principal.
ensureImport("src/views/usuarios/usuarios.template.js", identityImport);
replaceCount(
  "src/views/usuarios/usuarios.template.js",
  /function initials\(value = ""\) \{[\s\S]*?\n\}\nfunction avatarTone\(item = \{\}\) \{[\s\S]*?\n\}\n(?=function renderAvatar)/,
  `function avatarPresentation(item = {}) {\n  const name = getName(item);\n  const email = cleanText(first(item.email, item.emailLower, item.mail, ""), "").toLowerCase();\n  return resolveAvatarPresentation({\n    ...item,\n    displayName: name,\n    name,\n    email,\n    userId: getId(item),\n    username: first(item.username, item.userName, item.slug, ""),\n  });\n}\n`,
  1,
  "retirar initials/tone local de Usuarios"
);
replaceCount(
  "src/views/usuarios/usuarios.template.js",
  /function renderAvatar\(item = \{\}\) \{[\s\S]*?\n\}\n(?=function renderStatusChip)/,
  `function renderAvatar(item = {}) {\n  const name = getName(item);\n  const src = safeAvatarUrl(first(item.avatarUrl, item.avatar, item.photoUrl, item.picture, ""));\n  const presentation = avatarPresentation(item);\n  return \`<span class="usuarios-avatar\${src ? " has-image" : " is-fallback"}" aria-hidden="true" data-avatar-system="true" data-avatar-host="true" data-avatar-tone="\${attr(String(presentation.tone))}" data-avatar-identity="\${attr(presentation.fingerprint)}" data-avatar-initials="\${attr(presentation.initials)}" data-has-avatar="\${src ? "true" : "false"}">\${src ? \`<img class="usuarios-avatar-img" data-avatar-image="true" src="\${attr(src)}" alt="" width="42" height="42" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">\` : ""}<span class="usuarios-avatar-fallback" data-avatar-fallback="true">\${escapeHtml(presentation.initials)}</span></span>\`;\n}\n`,
  1,
  "render global de avatar de Usuarios"
);

// 7) Facturas principal.
ensureImport("src/views/facturas/facturas.template.js", identityImport);
replaceCount(
  "src/views/facturas/facturas.template.js",
  /function hashIdentity\(value = ""\) \{[\s\S]*?\n\}\n\n/,
  "",
  1,
  "retirar hashIdentity local de Facturas"
);
replaceCount(
  "src/views/facturas/facturas.template.js",
  /function getInitials\(value = ""\) \{[\s\S]*?\n\}\n\nfunction getAvatarToneClass\(item = \{\}\) \{[\s\S]*?\n\}\n\n/,
  `function getAvatarPresentation(item = {}) {\n  const name = getClientName(item);\n  const email = getClientEmail(item);\n  return resolveAvatarPresentation({\n    ...item,\n    displayName: name,\n    name,\n    email,\n    userId: firstPath(item, ["clienteId", "clientId", "customerId", "userId", "id"]),\n  });\n}\n\n`,
  1,
  "retirar initials/tone local de Facturas"
);
replaceCount(
  "src/views/facturas/facturas.template.js",
  /function renderAvatar\(item = \{\}\) \{[\s\S]*?\n\}\n\n(?=function renderEstadoPagoChip)/,
  `function renderAvatar(item = {}) {\n  const name = getClientName(item);\n  const avatarUrl = getClientAvatar(item);\n  const presentation = getAvatarPresentation(item);\n  return \`\n    <span class="facturas-avatar\${avatarUrl ? " has-image" : " is-fallback"}"\n      \${tooltipAttrs(name, name)} data-facturas-avatar="true" aria-hidden="true"\n      data-avatar-system="true" data-avatar-host="true" data-avatar-tone="\${attr(String(presentation.tone))}"\n      data-avatar-identity="\${attr(presentation.fingerprint)}" data-avatar-initials="\${attr(presentation.initials)}"\n      data-has-avatar="\${avatarUrl ? "true" : "false"}">\n      \${avatarUrl ? \`<img class="facturas-avatar-img" data-avatar-image="true" src="\${attr(avatarUrl)}" alt="" width="42" height="42" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false" data-facturas-avatar-img="true">\` : ""}\n      <span class="facturas-avatar-fallback" data-avatar-fallback="true">\${escapeHtml(presentation.initials)}</span>\n    </span>\`;\n}\n\n`,
  1,
  "render global de avatar de Facturas"
);

console.log("Avatar authority cleanup phase 1 applied.");
