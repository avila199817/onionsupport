#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  getHomeTemplateSnapshot,
  renderHomeTemplate,
} from "../../src/views/home/home.template.js";

const requesterAvatar =
  "https://cdn.example.com/avatars/maria-lopez.jpg";
const invoiceAvatar =
  "https://cdn.example.com/avatars/cristian-avila.jpg";

const html = renderHomeTemplate({
  user: {
    displayName: "Administrador Onion",
    role: "admin",
  },
  role: "admin",
  dashboard: {
    admin: true,
    updatedAt: "2026-09-02T06:43:00Z",
    summary: {
      incidencias: 2,
      facturas: 2,
      clientes: 2,
      usuarios: 2,
      invoiceStatsAvailable: true,
      totalInvoiced: 145.2,
      paidTotal: 96.8,
      outstandingAmount: 48.4,
      currency: "EUR",
    },
    incidencias: [
      {
        ticketId: "INC-20260901-760310",
        subject: "Incidencia de red",
        status: "open",
        updatedAt: "2026-09-02T06:41:00Z",
        requesterSnapshot: {
          displayName: "María del Carmen López García",
          email: "maria.lopez@example.com",
          avatarUrl: requesterAvatar,
        },
      },
      {
        ticketId: "INC-20260902-286839",
        subject: "PC no enciende",
        status: "open",
        updatedAt: "2026-09-02T06:12:00Z",
        clienteNombre: "Juan Pablo Ruiz Martín",
        clienteEmail: "juan.ruiz@example.com",
      },
    ],
    facturas: [
      {
        numeroFacturaLegal: "202600052",
        concepto: "Integración de interfaz",
        paymentStatus: "pending",
        total: 48.4,
        currency: "EUR",
        updatedAt: "2026-08-27T17:53:00Z",
        clienteEmpresa: "Onion Support IT, S.L.",
        clienteNombre: "Cristian Ávila Luque",
        clienteEmail: "cristian@onionsupport.com",
        clienteAvatar: invoiceAvatar,
      },
      {
        numeroFacturaLegal: "202600049",
        concepto: "Servicio técnico",
        paymentStatus: "paid",
        total: 96.8,
        currency: "EUR",
        updatedAt: "2026-08-25T00:52:00Z",
      },
    ],
    activity: [
      {
        type: "ticket",
        entityId: "INC-20260901-760310",
        title: "Incidencia de red",
        status: "open",
        date: "2026-09-02T06:41:00Z",
      },
      {
        type: "ticket",
        entityId: "INC-20260902-286839",
        title: "PC no enciende",
        status: "open",
        date: "2026-09-02T06:12:00Z",
      },
      {
        type: "invoice",
        entityId: "202600052",
        title: "202600052",
        status: "pending",
        date: "2026-08-27T17:53:00Z",
      },
    ],
  },
});

assert.match(
  html,
  /data-home-relation-version="home\.entity-relation\.v1-domain-identity-parity"/
);

assert.equal(
  (html.match(/data-home-entity-relation="true"/g) || []).length,
  4,
  "Two incidencias plus the same invoice in Activity and Facturas must expose four truthful relation identities"
);

assert.equal(
  (html.match(/data-home-has-relation="true"/g) || []).length,
  4,
  "Only rows backed by a real relation in the loaded domain DTO may claim relation data"
);

assert.match(html, /María del Carmen López García/);
assert.match(html, /maria\.lopez@example\.com/);
assert.match(html, new RegExp(requesterAvatar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

assert.match(html, /Juan Pablo Ruiz Martín/);
assert.match(html, /juan\.ruiz@example\.com/);
assert.match(
  html,
  /data-home-relation-avatar="false"[\s\S]*?home-entity-relation-fallback">JR</,
  "A missing photo must use initials derived from the real full name, never a fabricated asset"
);

assert.match(
  html,
  /<strong class="home-entity-title">Integración de interfaz<\/strong>/,
  "Activity must reuse the loaded invoice concept instead of repeating the invoice ID"
);

assert.match(html, /Onion Support IT, S\.L\./);
assert.match(html, /Cristian Ávila Luque/);
assert.match(html, /cristian@onionsupport\.com/);
assert.equal(
  (html.match(new RegExp(invoiceAvatar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length,
  2,
  "The invoice relation must remain identical in Activity and the Facturas panel"
);

assert.equal(
  (html.match(/data-home-has-relation="false"/g) || []).length,
  1,
  "A factura without client identity must stay explicitly empty instead of inventing a person"
);

assert.match(
  html,
  /aria-label="Abrir incidencia INC-20260901-760310 · María del Carmen López García · maria\.lopez@example\.com"/
);
assert.match(
  html,
  /aria-label="Abrir factura 202600052 · Onion Support IT, S\.L\. · Cristian Ávila Luque · cristian@onionsupport\.com"/
);

const [
  relationSource,
  activitySource,
  billingSource,
  relationCss,
  compositionEntry,
] = await Promise.all([
  readFile("src/views/home/home.template.relation.js", "utf8"),
  readFile("src/views/home/home.template.activity.js", "utf8"),
  readFile("src/views/home/home.template.billing.js", "utf8"),
  readFile("src/css/compositions/home-extreme-relations.css", "utf8"),
  readFile("src/css/compositions/home-extreme.css", "utf8"),
]);

for (const canonicalAlias of [
  "requesterSnapshot",
  "clienteNombre",
  "clienteEmail",
  "clienteAvatar",
  "clienteEmpresa",
  "nombreContacto",
  "companyName",
  "razonSocial",
]) {
  assert.match(
    relationSource,
    new RegExp(canonicalAlias),
    `Home relation resolver must preserve the canonical ${canonicalAlias} alias`
  );
}

assert.match(
  relationSource,
  /return finalizeRelation\(\{[\s\S]*?kind: "solicitante",[\s\S]*?name,[\s\S]*?email,[\s\S]*?avatarUrl/
);
assert.doesNotMatch(
  relationSource,
  /name:\s*(?:name|company \|\| contact) \|\| email/,
  "Home must not promote an email address into a fabricated full name"
);

assert.match(activitySource, /function findActivityDomainSource/);
assert.match(activitySource, /entityTriggerAttributesWithRelation/);
assert.match(activitySource, /domainCollection\(vm, entityType\)/);
assert.match(activitySource, /resolveHomeEntityRelation\(entityType, relationSource\)/);
assert.match(billingSource, /resolveHomeEntityRelation\("factura", source\)/);

for (const forbidden of [
  /\bfetch\s*\(/,
  /\bHttp\b/,
  /\bRouter\b/,
  /\bStore\b/,
  /localStorage/,
  /sessionStorage/,
  /indexedDB/,
]) {
  assert.doesNotMatch(
    relationSource,
    forbidden,
    "Relationship presentation must only consume already loaded domain data"
  );
}

assert.match(
  compositionEntry,
  /home-extreme-entities\.css"\);[\s\S]*home-extreme-relations\.css"\);[\s\S]*home-extreme-interactions\.css"\);/
);
assert.match(
  relationCss,
  /\.home-view-root \.home-entity-relation\s*\{[\s\S]*display:\s*grid;/
);
assert.match(
  relationCss,
  /\.home-view-root \.home-entity-relation-avatar\s*\{[\s\S]*border-radius:\s*50%;/
);
assert.match(
  relationCss,
  /\.home-view-root \.home-entity-relation-name\s*\{[\s\S]*white-space:\s*normal;[\s\S]*overflow-wrap:\s*anywhere;/
);
assert.doesNotMatch(relationCss, /!important/);
assert.doesNotMatch(
  relationCss,
  /\.home-(?:header|header-main|header-copy|title|subtitle|current-user-avatar)\b/
);

const relationContainerBlock = relationCss.slice(
  relationCss.indexOf(".home-view-root .home-entity-relation {"),
  relationCss.indexOf(".home-view-root .home-entity-relation-avatar {")
);
assert.doesNotMatch(
  relationContainerBlock,
  /\bborder\s*:|\bbackground\s*:|\bbox-shadow\s*:/,
  "The relationship identity must remain flat and must not become a card inside a card"
);

const snapshot = getHomeTemplateSnapshot();
assert.equal(snapshot.policy.canonicalRelationIdentity, true);
assert.equal(snapshot.policy.relationIdentitySource, "loaded_domain_dto");
assert.equal(snapshot.policy.relationIdentityAddsNoRequests, true);
assert.equal(snapshot.policy.syntheticRelationData, false);

console.log(
  "Home relation identity contract: PASS · full names · truthful avatars · domain alias parity · zero synthetic data"
);
