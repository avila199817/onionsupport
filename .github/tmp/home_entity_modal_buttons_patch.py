from pathlib import Path

TEMPLATE = Path("src/views/home/home.template.js")
CSS = Path("src/css/views/home/index.css")
CONTRACT = Path(".github/scripts/entity_overlay_contract.mjs")

template = TEMPLATE.read_text()
template = template.replace(
    '"home.template.private.v10.entity-identifiers"',
    '"home.template.private.v11.entity-modal-buttons"',
    1,
)

activity_start = template.index("function activityItem(item = {}) {")
activity_end = template.index("\nfunction activity(vm) {", activity_start)
activity_block = r'''function overlayEntityType(type = "") {
  const key = normalizeKey(type);

  if (key.includes("invoice") || key.includes("factura")) return "factura";
  if (key.includes("ticket") || key.includes("incidencia")) return "incidencia";
  if (key.includes("client") || key.includes("cliente")) return "cliente";
  if (key.includes("user") || key.includes("usuario")) return "usuario";

  return "";
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

function activityItem(item = {}) {
  const source = isObject(item) ? item : {};
  const type = normalizeKey(first(source.type, source.tipo, "activity"));
  const entityType = overlayEntityType(type);
  const isInvoice = entityType === "factura";
  const entityId = isInvoice ? invoiceDisplayId(source) : ticketDisplayId(source);
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
  `;

  return `
    <li
      class="home-activity-item home-activity-item--${attr(type)} ${interactive ? "home-activity-item--interactive" : ""}"
      data-home-entity-type="${attr(entityType || type || "activity")}"
      data-home-entity-id="${attr(entityId)}"
    >
      ${interactive
        ? `
          <button
            type="button"
            class="home-activity-entity-button"
            data-entity-overlay-trigger="true"
            data-entity-type="${attr(entityType)}"
            data-entity-id="${attr(entityId)}"
            aria-label="${attr(entityOpenLabel(entityType, entityId))}"
          >
            ${content}
          </button>
        `
        : content}
    </li>
  `;
}
'''
template = template[:activity_start] + activity_block + template[activity_end:]

invoice_start = template.index("function invoiceItem(invoice = {}) {")
invoice_end = template.index("\nfunction invoices(vm) {", invoice_start)
invoice_block = r'''function invoiceItem(invoice = {}) {
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

  const content = `
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
  `;

  return `
    <li
      class="home-invoice-item ${interactive ? "home-invoice-item--interactive" : ""}"
      data-home-entity-type="invoice"
      data-home-entity-id="${attr(id)}"
    >
      ${interactive
        ? `
          <button
            type="button"
            class="home-invoice-entity-button"
            data-entity-overlay-trigger="true"
            data-entity-type="factura"
            data-entity-id="${attr(id)}"
            aria-label="${attr(entityOpenLabel("factura", id))}"
          >
            ${content}
          </button>
        `
        : content}
    </li>
  `;
}
'''
template = template[:invoice_start] + invoice_block + template[invoice_end:]
TEMPLATE.write_text(template)

css = CSS.read_text()
marker = "} /* @layer views */"
if marker not in css:
    raise SystemExit("home css layer marker not found")

styles = r'''
/* =========================================================
   HOME ENTITY MODAL BUTTONS
========================================================= */

.home-activity-item--interactive,
.home-invoice-item--interactive {
  padding: 0;
}

.home-activity-entity-button,
.home-invoice-entity-button {
  appearance: none;
  inline-size: 100%;
  min-block-size: inherit;
  margin: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.home-activity-entity-button {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px 12px;
}

.home-invoice-entity-button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px 12px;
}

.home-activity-entity-button:focus-visible,
.home-invoice-entity-button:focus-visible {
  outline: 2px solid var(--focus-ring, var(--border-info));
  outline-offset: -2px;
}

@media (max-width: 760px) {
  .home-activity-entity-button {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .home-activity-entity-button time {
    grid-column: 2;
    justify-self: start;
  }

  .home-invoice-entity-button {
    grid-template-columns: 1fr;
  }

  .home-invoice-entity-button .home-invoice-amount {
    justify-self: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-activity-entity-button,
  .home-invoice-entity-button {
    transition: none;
  }
}

'''
if "HOME ENTITY MODAL BUTTONS" not in css:
    css = css.replace(marker, styles + marker, 1)
CSS.write_text(css)

contract = CONTRACT.read_text()
if "home-entity-modal-buttons" not in contract:
    insert = r'''
const [homeTemplate, homeCss] = await Promise.all([
  read("src/views/home/home.template.js"),
  read("src/css/views/home/index.css"),
]);

assert.match(homeTemplate, /data-entity-overlay-trigger="true"/);
assert.match(homeTemplate, /data-entity-type="\$\{attr\(entityType\)\}"/);
assert.match(homeTemplate, /data-entity-type="factura"/);
assert.match(homeTemplate, /home-activity-entity-button/);
assert.match(homeTemplate, /home-invoice-entity-button/);
assert.match(homeCss, /HOME ENTITY MODAL BUTTONS/);
assert.match(homeCss, /:focus-visible/);

'''
    anchor = "console.log(\n"
    pos = contract.index(anchor)
    contract = contract[:pos] + insert + contract[pos:]
    contract = contract.replace(
        '"Entity overlay contract: PASS · lazy adapters · global intents · view-independent deeplinks"',
        '"Entity overlay contract: PASS · lazy adapters · global intents · home entity modal buttons · canonical deeplinks"',
        1,
    )
CONTRACT.write_text(contract)
