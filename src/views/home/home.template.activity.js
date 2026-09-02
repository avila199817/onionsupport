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
  safeArray,
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
import {
  homeRelationAccessibleName,
  renderHomeEntityRelation,
  resolveHomeEntityRelation,
} from "./home.template.relation.js";

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

function entityOpenLabel(type = "", id = "", relation = null) {
  const entityType = overlayEntityType(type);
  const entityId = safeDisplayId(id, "");

  const labels = {
    factura: "factura",
    incidencia: "incidencia",
    cliente: "cliente",
    usuario: "usuario",
  };

  const label = labels[entityType] || "detalle";
  const relationName = homeRelationAccessibleName(relation);
  const target = entityId ? `${label} ${entityId}` : label;

  return relationName
    ? `Abrir ${target} · ${relationName}`
    : `Abrir ${target}`;
}

export function entityTriggerAttributes(
  type = "",
  id = "",
  source = "home"
) {
  const entityType = overlayEntityType(type);
  const entityId = safeDisplayId(id, "");
  const ownerInPlace = ["factura", "incidencia"].includes(entityType);

  if (!entityType || !entityId) return "";

  return `
    data-entity-overlay-trigger="true"
    data-entity-overlay-open="true"
    data-entity-type="${attr(entityType)}"
    data-entity-id="${attr(entityId)}"
    data-home-entity-source="${attr(source)}"
    data-entity-stay-view="home"
    ${ownerInPlace ? 'data-entity-overlay-ignore="true" data-entity-open-mode="in-place" data-entity-preload="detail"' : 'data-entity-open-mode="overlay"'}
    aria-haspopup="dialog"
    aria-label="${attr(entityOpenLabel(entityType, entityId))}"
  `;
}

export function entityTriggerAttributesWithRelation(
  attributes = "",
  type = "",
  id = "",
  relation = null
) {
  const base = String(attributes || "");
  const accessibleName = homeRelationAccessibleName(relation);
  if (!base || !accessibleName) return base;

  return base.replace(
    /aria-label="[^"]*"/,
    `aria-label="${attr(entityOpenLabel(type, id, relation))}"`
  );
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

function domainCollection(vm = {}, entityType = "") {
  if (entityType === "incidencia") return safeArray(vm.incidencias);
  if (entityType === "factura") return safeArray(vm.facturas);
  return [];
}

function findActivityDomainSource(vm = {}, entityType = "", entityId = "") {
  const id = safeDisplayId(entityId, "");
  if (!id) return null;

  return domainCollection(vm, entityType).find((candidate) => (
    activityEntityId(entityType, candidate) === id
  )) || null;
}

function relationSourceForActivity(
  source = {},
  vm = {},
  entityType = "",
  entityId = ""
) {
  const canonical = findActivityDomainSource(vm, entityType, entityId);
  if (!canonical) return source;

  /*
    buildActivity() conserva una proyección pequeña para ordenar el feed.
    La identidad relacional procede siempre de la entidad canónica que ya
    está cargada en el mismo dashboard; no se inventa ni se solicita de nuevo.
  */
  return {
    ...canonical,
    ...source,
    raw: isObject(canonical.raw)
      ? canonical.raw
      : source.raw,
  };
}

function activityItem(item = {}, vm = {}) {
  const source = isObject(item) ? item : {};
  const type = normalizeKey(first(source.type, source.tipo, "activity"));
  const entityType = overlayEntityType(type);
  const isInvoice = entityType === "factura";
  const entityId = activityEntityId(entityType, source);
  const interactive = Boolean(entityType && entityId);

  const relationSource = relationSourceForActivity(
    source,
    vm,
    entityType,
    entityId
  );

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

  const canonicalInvoiceTitle = isInvoice
    ? visibleText(
        first(
          relationSource.concepto,
          relationSource.concept,
          relationSource.description,
          relationSource.descripcion,
          relationSource.subject,
          relationSource.asunto,
          ""
        ),
        ""
      )
    : "";

  const projectedTitleIsId = Boolean(
    isInvoice &&
    entityId &&
    safeDisplayId(rawTitle, "") === entityId
  );

  const title =
    isInvoice &&
    (isGenericInvoiceTitle(rawTitle) || projectedTitleIsId)
      ? canonicalInvoiceTitle || "Factura"
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

  const relation = resolveHomeEntityRelation(entityType, relationSource);
  const relationHtml = renderHomeEntityRelation(relation);
  const relationAttribute = relationHtml
    ? 'data-home-has-relation="true"'
    : 'data-home-has-relation="false"';
  const baseTriggerAttributes = entityTriggerAttributes(entityType, entityId, "home.activity");
  const triggerAttributes = entityTriggerAttributesWithRelation(
    baseTriggerAttributes,
    entityType,
    entityId,
    relation
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

      ${relationHtml}

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
        ? `<button type="button" class="home-entity-row home-entity-row--activity" ${relationAttribute} ${triggerAttributes}>${content}</button>`
        : `<div class="home-entity-row home-entity-row--activity home-entity-row--static" ${relationAttribute}>${content}</div>`}
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
          ? `<ul class="home-activity-list">${items.map((item) => activityItem(item, vm)).join("")}</ul>`
          : emptyState("Sin actividad reciente", "Todavía no hay movimientos visibles en el inicio.", "activity")}
    </section>
  `;
}
