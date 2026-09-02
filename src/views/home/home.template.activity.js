/* =========================================================
   Onion Support - Home Template · generated domain module
   Shared by /src/views/home/home.template.js
========================================================= */

import {
  attr,
  cleanText,
  escapeHtml,
  first,
  formatDate,
  icon,
  invoiceDisplayId,
  isGenericInvoiceTitle,
  isObject,
  normalizeKey,
  safeDisplayId,
  ticketDisplayId,
  visibleText,
} from "./home.template.foundation.js";
import {
  emptyState,
  entityIdBadge,
  freshness,
  panelLoadingRows,
  statusBadge,
} from "./home.template.shared.js";

function activityIcon(type = "") {
  const key = normalizeKey(type);
  if (key.includes("invoice") || key.includes("factura")) return "facturas";
  if (key.includes("ticket") || key.includes("incidencia")) return "incidencias";
  if (key.includes("client") || key.includes("cliente")) return "clientes";
  if (key.includes("user") || key.includes("usuario")) return "usuarios";
  return "activity";
}

function overlayEntityType(type = "") {
  const key = normalizeKey(type);

  if (key.includes("invoice") || key.includes("factura")) return "factura";
  if (key.includes("ticket") || key.includes("incidencia")) return "incidencia";
  if (key.includes("client") || key.includes("cliente")) return "cliente";
  if (key.includes("user") || key.includes("usuario")) return "usuario";

  return "";
}

function entityOwnerRoute(type = "") {
  return {
    factura: "/facturas",
    incidencia: "/incidencias",
    cliente: "/clientes",
    usuario: "/usuarios",
  }[overlayEntityType(type)] || "";
}

function activityEntityId(type = "", source = {}) {
  const entityType = overlayEntityType(type);
  const raw = isObject(source) ? source : {};

  if (entityType === "factura") return invoiceDisplayId(raw);
  if (entityType === "incidencia") return ticketDisplayId(raw);

  if (entityType === "cliente") {
    return safeDisplayId(
      first(
        raw.entityId,
        raw.clienteId,
        raw.clientId,
        raw.customerId,
        raw.id,
        ""
      ),
      ""
    );
  }

  if (entityType === "usuario") {
    return safeDisplayId(
      first(
        raw.entityId,
        raw.usuarioId,
        raw.userId,
        raw.id,
        ""
      ),
      ""
    );
  }

  return "";
}

function entityKind(type = "") {
  const entityType = overlayEntityType(type);

  return {
    factura: "Factura",
    incidencia: "Incidencia",
    cliente: "Cliente",
    usuario: "Usuario",
  }[entityType] || "Actividad";
}

function entityOpenLabel(type = "", id = "") {
  const entityType = overlayEntityType(type);
  const entityId = safeDisplayId(id, "");

  const labels = {
    factura: "factura",
    incidencia: "incidencia",
    cliente: "cliente",
    usuario: "usuario",
  };

  const label = labels[entityType] || "detalle";
  return entityId ? `Abrir ${label} ${entityId}` : `Abrir ${label}`;
}

export function entityTriggerAttributes(type = "", id = "", source = "home") {
  const entityType = overlayEntityType(type);
  const entityId = safeDisplayId(id, "");
  const ownerRoute = entityOwnerRoute(entityType);

  if (!entityType || !entityId || !ownerRoute) return "";

  return `
    data-entity-overlay-trigger="true"
    data-entity-overlay-open="true"
    data-entity-type="${attr(entityType)}"
    data-entity-id="${attr(entityId)}"
    data-home-entity-source="${attr(source)}"
    data-router-link="true"
    data-route="${attr(ownerRoute)}"
    ${entityType === "factura" ? 'data-entity-preload="detail"' : ""}
    aria-haspopup="dialog"
    aria-label="${attr(entityOpenLabel(entityType, entityId))}"
  `;
}

export function entityOpenAffordance(label = "Abrir") {
  return `
    <span class="home-entity-open" aria-hidden="true">
      <span>${escapeHtml(label)}</span>
      ${icon("arrow-right")}
    </span>
  `;
}

/* =========================================================
   ACTIVITY
========================================================= */

function activityItem(item = {}) {
  const source = isObject(item) ? item : {};
  const type = normalizeKey(first(source.type, source.tipo, "activity"));
  const entityType = overlayEntityType(type);
  const isInvoice = entityType === "factura";
  const entityId = activityEntityId(entityType, source);
  const interactive = Boolean(entityType && entityId);

  const rawTitle = visibleText(
    first(
      source.title,
      source.titulo,
      source.subject,
      source.asunto,
      source.name,
      source.nombre
    ),
    isInvoice ? "Factura" : "Actividad registrada"
  );

  const title = isInvoice && isGenericInvoiceTitle(rawTitle)
    ? "Factura"
    : rawTitle;

  const rawStatus = cleanText(first(source.status, source.estado, source.text, ""), "");
  const date = first(
    source.date,
    source.fecha,
    source.updatedAt,
    source.createdAt,
    source.creadoEn,
    ""
  );

  const content = `
    <span class="home-entity-leading home-entity-leading--${attr(entityType || "activity")}" aria-hidden="true">
      ${icon(activityIcon(type))}
    </span>

    <span class="home-entity-copy">
      <span class="home-entity-eyebrow">
        <span class="home-entity-kind">${escapeHtml(entityKind(entityType))}</span>
        ${entityIdBadge(isInvoice ? "Factura" : "ID", entityId)}
      </span>

      <strong class="home-entity-title">${escapeHtml(title)}</strong>

      <span class="home-entity-meta">
        ${statusBadge(rawStatus, "Actualizada")}
        <time datetime="${attr(date || "")}">${escapeHtml(formatDate(date))}</time>
      </span>
    </span>

    ${interactive ? entityOpenAffordance("Abrir detalle") : ""}
  `;

  return `
    <li
      class="home-activity-item home-activity-item--${attr(type)} ${interactive ? "home-activity-item--interactive" : ""}"
      data-home-entity-type="${attr(entityType || type || "activity")}" 
      data-home-entity-id="${attr(entityId)}"
    >
      ${interactive
        ? `<button type="button" class="home-entity-row home-entity-row--activity" ${entityTriggerAttributes(entityType, entityId, "home.activity")}>${content}</button>`
        : `<div class="home-entity-row home-entity-row--activity home-entity-row--static">${content}</div>`}
    </li>
  `;
}

export function activity(vm) {
  const items = vm.activity.slice(0, 6);

  return `
    <section class="home-panel home-panel--activity" data-home-section="activity">
      <div class="home-panel-header">
        <div class="home-panel-heading">
          <p class="home-panel-kicker">Actividad</p>
          <h2>Últimos movimientos</h2>
          <p class="home-panel-description">Cambios recientes de incidencias y facturación.</p>
        </div>

        <div class="home-panel-actions">
          <span class="home-panel-count">${escapeHtml(`${items.length} ${items.length === 1 ? "movimiento" : "movimientos"}`)}</span>
          ${freshness(vm.updatedAt)}
        </div>
      </div>

      ${vm.loading
        ? panelLoadingRows("activity", 4)
        : items.length
          ? `<ul class="home-activity-list">${items.map(activityItem).join("")}</ul>`
          : emptyState("Sin actividad reciente", "Todavía no hay movimientos visibles en el inicio.", "activity")}
    </section>
  `;
}
