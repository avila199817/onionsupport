#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  getDetailTemplateSnapshot,
  renderIncidenciasDetailModal,
} from "../../src/views/incidencias/incidencias.template.modal.js";

function fragmentAround(html = "", marker = "", before = 320, after = 1400) {
  const source = String(html);
  const index = source.indexOf(marker);
  assert.ok(index >= 0, `No se encontró ${marker}`);
  return source.slice(Math.max(0, index - before), index + after);
}

const html = renderIncidenciasDetailModal({
  open: true,
  admin: true,
  detail: {
    ticketId: "INC-20260902-286839",
    subject: "PC no enciende y portátil.",
    status: "open",
    priority: "medium",
    category: "general",
    clienteNombre: "Albert Palmer Filba",
    clienteEmail: "albertpafi@gmail.com",
    assignedToName: "Cristian Ávila Luque",
    assignedToEmail: "cristian@onionsupport.com",
    assignedToAvatarUrl: "https://cdn.example.com/avatars/cristian.jpg",
    createdAt: "2026-09-02T06:02:00Z",
    updatedAt: "2026-09-03T06:02:00Z",
    attachments: [],
    history: [],
    comments: [],
  },
});

assert.match(
  html,
  /data-detail-avatar-ui-version="incidencias\.detail-avatar-ui\.v1-global-identity-boundary"/
);

const requester = fragmentAround(html, 'data-modal-avatar-frame="true"');
assert.match(requester, /data-avatar-system="true"/);
assert.match(requester, /data-avatar-host="true"/);
assert.match(requester, /data-avatar-identity-source="incidencias-detail-requester"/);
assert.match(requester, /data-avatar-name="Albert Palmer Filba"/);
assert.match(requester, /data-avatar-email="albertpafi@gmail\.com"/);
assert.match(
  requester,
  /incidencias-modal-avatar-fallback[^>]*>[\s\S]*?AF[\s\S]*?<\/span>/,
  "Albert Palmer Filba debe conservar las iniciales Microsoft Persona AF"
);
assert.doesNotMatch(
  requester,
  /Cristian Ávila Luque|cristian@onionsupport\.com/,
  "El avatar principal nunca puede heredar la identidad del técnico"
);

const technician = fragmentAround(
  html,
  'data-modal-technician-avatar-frame="true"',
  260,
  1600
);
assert.match(technician, /data-avatar-system="true"/);
assert.match(technician, /data-avatar-host="true"/);
assert.match(technician, /data-avatar-identity-source="incidencias-detail-technician"/);
assert.match(technician, /data-avatar-name="Cristian Ávila Luque"/);
assert.match(technician, /data-avatar-email="cristian@onionsupport\.com"/);
assert.match(technician, /style="--avatar-size:32px;--avatar-font-size:14px"/);
assert.match(technician, /src="https:\/\/cdn\.example\.com\/avatars\/cristian\.jpg"/);
assert.doesNotMatch(
  technician,
  /data-avatar-name="Albert Palmer Filba"/,
  "El técnico debe conservar su propia identidad"
);

const unassignedHtml = renderIncidenciasDetailModal({
  open: true,
  admin: true,
  detail: {
    ticketId: "INC-UNASSIGNED-1",
    subject: "Sin técnico",
    clienteNombre: "Albert Palmer Filba",
    clienteEmail: "albertpafi@gmail.com",
  },
});

const unassigned = fragmentAround(
  unassignedHtml,
  'data-modal-technician-avatar-frame="true"',
  220,
  700
);
assert.match(unassigned, /data-technician-assigned="false"/);
assert.match(unassigned, /data-avatar-system="off"/);
assert.match(unassigned, /data-avatar-managed="false"/);
assert.doesNotMatch(
  unassigned,
  /data-avatar-name="Albert Palmer Filba"/,
  "El placeholder sin técnico no puede apropiarse de la identidad del solicitante"
);

const snapshot = getDetailTemplateSnapshot();
assert.equal(snapshot.avatarUi.requesterUsesOwnIdentity, true);
assert.equal(snapshot.avatarUi.technicianUsesOwnIdentity, true);
assert.equal(snapshot.avatarUi.technicianSizePx, 32);
assert.equal(snapshot.avatarUi.unassignedTechnicianOptOut, true);
assert.equal(snapshot.policy.requesterAvatarIdentityBoundAtRender, true);
assert.equal(snapshot.policy.technicianAvatarIdentityBoundAtRender, true);
assert.equal(snapshot.policy.unassignedTechnicianNeverStealsRequesterIdentity, true);

console.log(
  "Incidencias detail avatar identity contract: PASS · requester/technician isolated · technician 32px · unassigned opt-out"
);