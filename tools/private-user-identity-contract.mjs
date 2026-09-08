import assert from "node:assert/strict";
import Http from "../src/core/http.js";
import { AppCore } from "../src/core/index.js";
import { userNameFromIdentity } from "../src/core/user-identity.js";
import { resolveAvatarPresentation } from "../src/features/avatar-system/identity.js";
import { normalizeUsuarioModel, updateUsuarioRequest } from "../src/views/usuarios/usuarios.api.js";
import { normalizeIncidencia, searchIncidenciaUsers } from "../src/views/incidencias/incidencias.api.js";
import { normalizeFactura } from "../src/views/facturas/facturas.api.base.js";
import { renderUsuariosTemplate } from "../src/views/usuarios/usuarios.template.js";
import { renderUsuariosDetailModal } from "../src/views/usuarios/usuarios.template.modal.js";
import { renderIncidenciasTemplate } from "../src/views/incidencias/incidencias.template.js";
import { renderIncidenciasDetailModal } from "../src/views/incidencias/incidencias.template.modal.impl.js";
import { renderHomeTemplate } from "../src/views/home/home.template.js";
import { resolveHomeEntityRelation } from "../src/views/home/home.template.relation.js";
import { buildVm } from "../src/views/home/home.template.viewmodel.js";

const person = {
  userId: "ON-IDENTITY-FIXTURE", username: "fixture-person",
  name: "Álex Nombre Completo", displayName: "Álex Corto", fullName: "Álex Antiguo",
  email: "alex@example.test", role: "user",
};
const original = structuredClone(person);
const ticketSource = {
  ...person, ticketId: "INC-IDENTITY-FIXTURE", subject: "Revisión del equipo", status: "open",
  requesterSnapshot: { ...person, name: "Nombre histórico" },
};
const user = normalizeUsuarioModel(person);
const ticket = normalizeIncidencia(ticketSource);
const relation = resolveHomeEntityRelation("ticket", ticket);
const coreUser = AppCore.publicUser(person);
for (const model of [user, ticket, ticket.requesterSnapshot, ticket.cliente, ticket.receptor, relation, coreUser]) {
  assert.equal(model.name, person.name, "la proyección actual debe conservar el único nombre canónico");
}
assert.equal(coreUser.displayName, person.name, "el alias de sesión se deriva de name");
assert.deepEqual(person, original, "la normalización no modifica los datos recibidos");
assert.equal(ticketSource.requesterSnapshot.name, "Nombre histórico", "la presentación no reescribe el snapshot persistido");

const dashboard = {
  incidencias: [ticket], facturas: [],
  activity: [{ type: "ticket", entityId: ticket.ticketId, title: ticket.subject }],
  summary: { incidencias: 1, facturas: 0 },
};
const screens = new Map([
  ["usuarios", renderUsuariosTemplate({ items: [person] })],
  ["detalle de usuario", renderUsuariosDetailModal({ detail: person })],
  ["incidencias", renderIncidenciasTemplate({ items: [ticket] })],
  ["detalle de incidencia", renderIncidenciasDetailModal({ open: true, detail: ticket })],
  ["inicio", renderHomeTemplate({ user: coreUser, dashboard })],
]);
for (const [screen, html] of screens) {
  assert.ok(html.includes(person.name), `${screen} debe mostrar el nombre completo`);
  assert.ok(!html.includes("Álex Corto") && !html.includes("Álex Antiguo"), `${screen} no debe elegir aliases obsoletos`);
}
const avatar = resolveAvatarPresentation(person);
for (const identity of [user, ticket, relation, coreUser]) {
  const resolved = resolveAvatarPresentation(identity);
  assert.equal(resolved.name, person.name);
  assert.equal(resolved.fingerprint, avatar.fingerprint);
  assert.equal(resolved.tone, avatar.tone);
  assert.equal(resolved.initials, avatar.initials);
}
assert.equal(resolveAvatarPresentation({ ...person, name: "Nombre actualizado" }).fingerprint, avatar.fingerprint,
  "un cambio de nombre no cambia la identidad estable del avatar");

assert.equal(userNameFromIdentity({ displayName: "Alias antiguo", profile: { name: person.name } }), person.name);
assert.equal(userNameFromIdentity({ displayName: "Nombre legacy" }), "Nombre legacy");
assert.equal(userNameFromIdentity({ fullName: "Nombre Completo Legacy", displayName: "Alias legacy" }), "Nombre Completo Legacy");
assert.equal(userNameFromIdentity({ firstName: "Ana", lastName: "García" }), "Ana García");
assert.equal(userNameFromIdentity({ name: { unsafe: true } }, "Usuario"), "Usuario");
assert.equal(userNameFromIdentity({ name: "  Ana\n García  " }), "Ana García");
assert.equal(userNameFromIdentity({}), "", "un nombre ausente no se inventa");
assert.ok(!renderUsuariosTemplate({ items: [{ ...person, name: '<img src=x onerror="alert(1)">' }] })
  .includes('<img src=x onerror="alert(1)">'), "el nombre se escapa antes de insertarlo en HTML");

const invoice = normalizeFactura({
  facturaId: "202600001", userId: person.userId, name: person.name,
  clienteNombre: "Receptor fiscal histórico", clienteSnapshot: { nombreContacto: "Receptor fiscal histórico" },
  total: 12, paymentStatus: "paid",
});
assert.equal(invoice.clienteNombre, "Receptor fiscal histórico");
assert.equal(resolveHomeEntityRelation("invoice", invoice).name, "Receptor fiscal histórico",
  "el receptor de una factura emitida conserva su identidad fiscal histórica");

const counts = buildVm({ role: "admin", dashboard: { summary: {
  incidencias: null, tickets: 8, facturas: 0, clientes: null, usuarios: 14,
} } }).counts;
assert.deepEqual([counts.incidencias, counts.facturas, counts.clientes, counts.usuarios], [null, 0, null, 14]);
assert.equal(buildVm({ dashboard: { incidencias: [ticket] } }).counts.incidencias, null,
  "un subconjunto de filas no demuestra el total global");

// Replace the HTTP boundary explicitly: no requests leave this process.
const originalGet = Http.get;
const originalPatch = Http.patch;
const writes = [];
try {
  Http.get = async () => ({ items: [person] });
  Http.patch = async (path, body) => {
    writes.push({ path, body });
    return { ok: true, user: { ...person, ...body } };
  };
  const search = await searchIncidenciaUsers("Álex");
  assert.equal(search[0].name, person.name, "el selector de solicitante comparte el nombre de Usuarios");
  await updateUsuarioRequest(person.userId, { name: person.name, displayName: "Alias antiguo", fullName: "Otro alias" });
  assert.deepEqual(writes[0].body, { name: person.name }, "la edición solo persiste el campo canónico name");
} finally {
  Http.get = originalGet;
  Http.patch = originalPatch;
}

console.log("Private user identity: PASS · one canonical name across Core/users/tickets/Home · stable avatar · fiscal snapshot preserved · no network");
