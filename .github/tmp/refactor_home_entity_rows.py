from pathlib import Path
import re

TEMPLATE = Path("src/views/home/home.template.js")
CSS = Path("src/css/views/home/index.css")
CONTRACT = Path(".github/scripts/entity_overlay_contract.mjs")

# ---------------------------------------------------------
# HOME TEMPLATE
# ---------------------------------------------------------
template = TEMPLATE.read_text()
template = template.replace(
    '"home.template.private.v11.entity-modal-buttons"',
    '"home.template.private.v12.entity-hit-targets"',
    1,
)

shared_pattern = re.compile(
    r'function entityOpenLabel\(type = "", id = ""\) \{.*?\n\}\n\nfunction activityItem',
    re.S,
)
shared_replacement = r'''function entityOpenLabel(type = "", id = "") {
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

function entityHitTarget(type = "", id = "") {
  const entityType = overlayEntityType(type);
  const entityId = safeDisplayId(id, "");

  if (!entityType || !entityId) return "";

  return `
    <button
      type="button"
      class="home-entity-hit-target"
      data-entity-overlay-trigger="true"
      data-entity-type="${attr(entityType)}"
      data-entity-id="${attr(entityId)}"
      aria-label="${attr(entityOpenLabel(entityType, entityId))}"
    ></button>
  `;
}

function activityItem'''

template, count = shared_pattern.subn(shared_replacement, template, count=1)
if count != 1:
    raise SystemExit("home.template.js: entityOpenLabel/activityItem boundary not found")

activity_pattern = re.compile(
    r'function activityItem\(item = \{\}\) \{.*?\n\}\n\nfunction activity\(vm\)',
    re.S,
)
activity_replacement = r'''function activityItem(item = {}) {
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

  return `
    <li
      class="home-activity-item home-activity-item--${attr(type)} ${interactive ? "home-activity-item--interactive" : ""}"
      data-home-entity-type="${attr(entityType || type || "activity")}"
      data-home-entity-id="${attr(entityId)}"
    >
      <span class="home-activity-icon" aria-hidden="true">${icon(activityIcon(type))}</span>
      <span class="home-activity-body">
        <span class="home-activity-heading">
          <strong>${escapeHtml(title)}</strong>
          ${entityIdBadge(isInvoice ? "Factura" : "ID", entityId)}
        </span>
        <span class="home-activity-meta">
          ${statusBadge(rawStatus, "Actualizada")}
        </span>
      </span>
      <time datetime="${attr(date || "")}">${escapeHtml(formatDate(date))}</time>
      ${interactive ? entityHitTarget(entityType, entityId) : ""}
    </li>
  `;
}

function activity(vm)'''

template, count = activity_pattern.subn(activity_replacement, template, count=1)
if count != 1:
    raise SystemExit("home.template.js: activityItem block not found")

invoice_pattern = re.compile(
    r'function invoiceItem\(invoice = \{\}\) \{.*?\n\}\n\nfunction invoices\(vm\)',
    re.S,
)
invoice_replacement = r'''function invoiceItem(invoice = {}) {
  const source = isObject(invoice) ? invoice : {};
  const id = invoiceDisplayId(source);
  const interactive = Boolean(id);

  const concept = cleanText(
    first(source.concepto, source.title, source.titulo, source.name, source.nombre, ""),
    ""
  );

  const usefulConcept = Boolean(concept && !isGenericInvoiceTitle(concept));
  const label = usefulConcept ? concept : "Factura";
  const rawStatus = cleanText(
    first(
      source.paymentStatus,
      source.estadoPago,
      source.status,
      source.estado,
      source.paid ? "paid" : "issued"
    ),
    "issued"
  );

  const amount = first(
    source.total,
    source.totalFactura,
    source.invoiceAmount,
    source.amount,
    source.importe,
    source.paidAmount,
    null
  );

  const currency = cleanText(first(source.currency, source.moneda, "EUR"), "EUR");

  return `
    <li
      class="home-invoice-item ${interactive ? "home-invoice-item--interactive" : ""}"
      data-home-entity-type="invoice"
      data-home-entity-id="${attr(id)}"
    >
      <span class="home-invoice-main">
        <span class="home-invoice-heading">
          <strong>${escapeHtml(label)}</strong>
          ${id ? entityIdBadge("ID", id) : ""}
        </span>
        <span class="home-invoice-meta">
          ${statusBadge(rawStatus, "Emitida")}
          ${usefulConcept ? `<span class="home-invoice-concept">${escapeHtml(concept)}</span>` : ""}
        </span>
      </span>
      <strong class="home-invoice-amount">${hasAmount(amount) ? escapeHtml(formatMoney(amount, currency)) : "—"}</strong>
      ${interactive ? entityHitTarget("factura", id) : ""}
    </li>
  `;
}

function invoices(vm)'''

template, count = invoice_pattern.subn(invoice_replacement, template, count=1)
if count != 1:
    raise SystemExit("home.template.js: invoiceItem block not found")

TEMPLATE.write_text(template)

# ---------------------------------------------------------
# HOME CSS
# ---------------------------------------------------------
css = CSS.read_text()
interaction_pattern = re.compile(
    r'/\* =========================================================\n   HOME ENTITY MODAL BUTTONS\n========================================================= \*/.*?\n\}\s*/\* @layer views \*/',
    re.S,
)
interaction_block = r'''/* =========================================================
   HOME ENTITY INTERACTION LAYER

   La geometría pertenece siempre a la fila. El botón de interacción es una
   capa absoluta y no participa en grid/flex, de modo que activar un modal no
   puede cambiar posición, anchura ni wrapping del contenido visible.
========================================================= */

.home-activity-item--interactive,
.home-invoice-item--interactive {
  position: relative;
  isolation: isolate;
}

.home-activity-item--interactive > :not(.home-entity-hit-target),
.home-invoice-item--interactive > :not(.home-entity-hit-target) {
  position: relative;
  z-index: 1;
  pointer-events: none;
}

.home-entity-hit-target {
  appearance: none;
  position: absolute;
  inset: 0;
  z-index: 2;
  inline-size: 100%;
  block-size: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.home-entity-hit-target:focus-visible {
  outline: 2px solid var(--focus-ring, var(--border-info));
  outline-offset: -2px;
}

@media print {
  .home-entity-hit-target {
    display: none;
  }
}

} /* @layer views */'''

css, count = interaction_pattern.subn(interaction_block, css, count=1)
if count != 1:
    raise SystemExit("home css: legacy entity modal button block not found")

CSS.write_text(css)

# ---------------------------------------------------------
# CONTRACT
# ---------------------------------------------------------
contract = CONTRACT.read_text()
contract_pattern = re.compile(
    r'assert\.match\(homeTemplate, /data-entity-overlay-trigger="true"/\);.*?assert\.match\(homeCss, /:focus-visible/\);',
    re.S,
)
contract_replacement = r'''assert.match(homeTemplate, /data-entity-overlay-trigger="true"/);
assert.match(homeTemplate, /function activityEntityId/);
assert.match(homeTemplate, /raw\.clientId/);
assert.match(homeTemplate, /raw\.userId/);
assert.match(homeTemplate, /function entityHitTarget/);
assert.match(homeTemplate, /class="home-entity-hit-target"/);
assert.match(homeTemplate, /entityHitTarget\(entityType, entityId\)/);
assert.match(homeTemplate, /entityHitTarget\("factura", id\)/);
assert.doesNotMatch(homeTemplate, /home-activity-entity-button/);
assert.doesNotMatch(homeTemplate, /home-invoice-entity-button/);
assert.match(homeCss, /HOME ENTITY INTERACTION LAYER/);
assert.match(
  homeCss,
  /\.home-activity-item\s*\{[\s\S]*?grid-template-columns:\s*38px minmax\(0,\s*1fr\) auto;/
);
assert.match(
  homeCss,
  /\.home-entity-hit-target\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;/
);
assert.doesNotMatch(homeCss, /home-activity-entity-button/);
assert.doesNotMatch(homeCss, /home-invoice-entity-button/);'''

contract, count = contract_pattern.subn(lambda _: contract_replacement, contract, count=1)
if count != 1:
    raise SystemExit("entity overlay contract: Home assertions block not found")

CONTRACT.write_text(contract)
