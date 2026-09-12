#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  avatarColorFromIdentity,
  avatarInitials,
  avatarToneFromIdentity,
  resolveAvatarPresentation,
} from "../../src/features/avatar-system/identity.js";
import {
  getCreateTemplateSnapshot,
  renderIncidenciasCreateModal,
} from "../../src/views/incidencias/incidencias.template.create.js";
import {
  renderIncidenciasCreateModal as renderOriginalCreateModal,
} from "../../src/views/incidencias/incidencias.template.create.impl.js";

const snapshot = getCreateTemplateSnapshot().avatarIdentity;

const css = readFileSync(
  "src/css/components/avatar-system-contexts.css",
  "utf8"
);
const appCss = readFileSync("src/css/app.css", "utf8");

const JAVIER = Object.freeze({
  userId: "ON-1770551914523",
  displayName: "Javier Harandou",
  name: "Javier Harandou",
  email: "harandou@efcusa.com",
  phone: "+34 646 979 996",
});

assert.equal(avatarInitials(JAVIER.displayName), "JH");
assert.equal(avatarToneFromIdentity(JAVIER), 10);
assert.equal(avatarColorFromIdentity(JAVIER), "#CA5010");

const legacyMisread = resolveAvatarPresentation({ displayName: "JH" });
assert.equal(
  legacyMisread.initials,
  "J",
  "El bug original queda reproducido: tratar las iniciales JH como nombre las reduce a J"
);

const html = renderIncidenciasCreateModal({
  open: true,
  admin: true,
  role: "admin",
  form: {
    targetUserId: JAVIER.userId,
    targetUserName: JAVIER.displayName,
    targetUserEmail: JAVIER.email,
    targetUserAvatar: "",
    subject: "Equipo sin conexión",
    description: "El usuario no puede acceder a la red corporativa.",
    priority: "medium",
    category: "general",
    source: "panel_admin",
    attachments: [],
  },
  userSearch: {
    query: "Javier Harandou",
    selectedUser: JAVIER,
    results: [JAVIER],
  },
});

const targetTag = html.match(
  /<span\b(?=[^>]*class="[^"]*\binc-create-target-user-avatar\b[^"]*")[^>]*>/i
)?.[0] || "";

assert.ok(targetTag, "El usuario seleccionado debe renderizar avatar");
assert.match(targetTag, /data-avatar-system="true"/);
assert.match(targetTag, /data-avatar-host="true"/);
assert.match(targetTag, /data-avatar-authority="global"/);
assert.match(targetTag, /data-avatar-source="incidencias-create-selected-user"/);
assert.match(targetTag, /data-avatar-name="Javier Harandou"/);
assert.match(targetTag, /data-avatar-email="harandou@efcusa\.com"/);
assert.match(targetTag, /data-avatar-user-id="ON-1770551914523"/);
assert.match(targetTag, /data-avatar-initials="JH"/);
assert.match(targetTag, /data-avatar-tone="10"/);
assert.match(
  targetTag,
  new RegExp(`data-avatar-identity-contract="${snapshot.version}"`)
);

assert.match(
  html,
  /inc-create-target-user-avatar[\s\S]*?data-avatar-fallback="true">JH<\/span>/,
  "El fallback visible del usuario seleccionado debe conservar JH"
);
assert.doesNotMatch(
  html,
  /inc-create-target-user-avatar[\s\S]{0,900}?data-avatar-fallback="true">J<\/span>/,
  "Javier Harandou nunca puede degradarse a una sola J"
);

const resultButton = html.match(
  /<button\b(?=[^>]*class="[^"]*\binc-create-user-result\b[^"]*")[^>]*>[\s\S]*?<\/button>/i
)?.[0] || "";
const resultAvatarTag = resultButton.match(
  /<span\b(?=[^>]*class="[^"]*\binc-create-user-avatar\b[^"]*")[^>]*>/i
)?.[0] || "";

assert.ok(resultAvatarTag, "Los resultados del buscador deben renderizar avatar");
assert.match(resultAvatarTag, /data-avatar-authority="global"/);
assert.match(resultAvatarTag, /data-avatar-source="incidencias-create-search-result"/);
assert.match(resultAvatarTag, /data-avatar-name="Javier Harandou"/);
assert.match(resultAvatarTag, /data-avatar-email="harandou@efcusa\.com"/);
assert.match(resultAvatarTag, /data-avatar-user-id="ON-1770551914523"/);
assert.match(resultAvatarTag, /data-avatar-initials="JH"/);
assert.match(resultAvatarTag, /data-avatar-tone="10"/);

// The original renderer owns the aliases as well as the visible fallback.
// A wrapper must not reconstruct a different person from raw input or HTML.
function assertCreateAvatar(input, identity, selected = false) {
  const markup = renderIncidenciasCreateModal({ open: true, admin: true, ...input });
  assert.equal(markup, renderOriginalCreateModal({ open: true, admin: true, ...input }));
  const className = selected ? "inc-create-target-user-avatar" : "inc-create-user-avatar";
  const tag = markup.match(new RegExp(`<span\\b(?=[^>]*class="[^"]*\\b${className}\\b[^"]*")[^>]*>`, "i"))?.[0];
  assert.ok(tag, `${className} must render`);
  const attrs = Object.fromEntries([...tag.matchAll(/\s(data-avatar-[\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
  const escaped = (value = "") => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const presentation = resolveAvatarPresentation(identity);
  for (const [alias, field] of [["name", "name"], ["email", "email"], ["user-id", "userId"], ["username", "username"]]) {
    assert.equal(attrs[`data-avatar-${alias}`], escaped(identity[field] || ""), `${className}: explicit ${alias}`);
  }
  assert.equal(attrs["data-avatar-identity"], presentation.fingerprint);
  assert.equal(attrs["data-avatar-tone"], String(presentation.tone));
  assert.equal(attrs["data-avatar-initials"], presentation.initials);
  assert.equal(attrs["data-avatar-source"], `incidencias-create-${selected ? "selected-user" : "search-result"}`);
  return attrs;
}

const selectedUser = { userId: "ON-SELECTED", name: "Selección anterior", email: "selected@example.test", emailLower: "older@example.test", username: "selected.alias" };
const formIdentity = { userId: "ON-FORM", name: "Ana Formulario", email: "form@example.test", username: selectedUser.username };
assertCreateAvatar({
  form: { targetUserId: formIdentity.userId, targetClienteId: "CLI-DISTINCT", targetUserName: formIdentity.name, targetUserEmail: formIdentity.email },
  userSearch: { selectedUser },
}, formIdentity, true);
assertCreateAvatar({
  form: { uid: formIdentity.userId, name: formIdentity.name, email: formIdentity.email },
  userSearch: { selectedUser },
}, formIdentity, true);
assertCreateAvatar({ form: { targetUserId: "ON-ID-ONLY" } }, { userId: "ON-ID-ONLY", name: "ON-ID-ONLY" }, true);

const nestedIdentity = { userId: "ON-NESTED", name: 'Ana "Prueba" & López', email: "nested@example.test", username: "ana.alias" };
assertCreateAvatar({ userSearch: { results: [{ lookup: { userId: nestedIdentity.userId, email: nestedIdentity.email }, profile: { displayName: nestedIdentity.name, username: nestedIdentity.username } }] } }, nestedIdentity);
assertCreateAvatar({ userSearch: { results: [{ name: "Ana López", username: "ana.alias" }] } }, { name: "Ana López", username: "ana.alias" });
assertCreateAvatar({ userSearch: { results: [{ name: "Ana López" }] } }, { name: "Ana López" });

const stableId = { userId: "ON-STABLE", name: "Ana López", email: "old@example.test", username: "ana.old" };
const stable = assertCreateAvatar({ userSearch: { results: [stableId] } }, stableId);
for (const aliases of [{ email: "new@example.test", username: "ana.new" }, { email: "", username: "" }]) {
  const changed = { ...stableId, ...aliases };
  const actual = assertCreateAvatar({ userSearch: { results: [changed] } }, changed);
  assert.equal(actual["data-avatar-identity"], stable["data-avatar-identity"]);
  assert.equal(actual["data-avatar-tone"], stable["data-avatar-tone"]);
}
const homonym = { ...stableId, userId: "ON-OTHER-PERSON" };
const other = assertCreateAvatar({ userSearch: { results: [homonym] } }, homonym);
assert.notEqual(other["data-avatar-identity"], stable["data-avatar-identity"]);

for (const required of [
  ".inc-create-user-avatar",
  ".inc-create-target-user-avatar",
  "--avatar-size: 36px",
  "--avatar-font-size: 14px",
]) {
  assert.ok(css.includes(required), `Falta sizing global Create: ${required}`);
}

for (const forbidden of [
  /background\s*:/,
  /background-color\s*:/,
  /linear-gradient\s*\(/,
  /radial-gradient\s*\(/,
  /\bborder\s*:/,
  /box-shadow\s*:/,
  /data-user-tone/,
  /\[data-avatar-tone=/,
  /--inc-avatar-/,
]) {
  assert.doesNotMatch(
    css,
    forbidden,
    "El contexto Create sólo puede decidir tamaño; color/paint pertenece a AvatarSystem"
  );
}

const authorityImport = appCss.indexOf("./components/avatar-system.css");
const contextImport = appCss.indexOf("./components/avatar-system-contexts.css");
assert.ok(authorityImport >= 0);
assert.ok(contextImport > authorityImport);
assert.match(
  appCss,
  /avatar-system-contexts\.css"\) layer\(guardrails\)/,
  "El sizing Create debe ejecutarse en guardrails después de AvatarSystem"
);

assert.equal(snapshot.policy.globalAvatarAuthority, true);
assert.equal(snapshot.policy.noFallbackTextAsIdentitySeed, true);
assert.equal(snapshot.policy.noLocalPalette, true);

console.log(
  "Incidencias Create avatar identity: PASS · Javier Harandou = JH · stable tone 10 · #CA5010 · global AvatarSystem"
);
