from pathlib import Path

path = Path("src/views/home/home.template.js")
text = path.read_text()

anchor = '''function entityOpenLabel(type = "", id = "") {'''
helper = r'''function activityEntityId(type = "", source = {}) {
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

'''
if "function activityEntityId(" not in text:
    text = text.replace(anchor, helper + anchor, 1)

old = '  const entityId = isInvoice ? invoiceDisplayId(source) : ticketDisplayId(source);'
new = '  const entityId = activityEntityId(entityType, source);'
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("activity entity id anchor not found")

path.write_text(text)

contract_path = Path(".github/scripts/entity_overlay_contract.mjs")
contract = contract_path.read_text()
if "activityEntityId" not in contract:
    anchor = 'assert.match(homeTemplate, /home-activity-entity-button/);'
    insert = '''assert.match(homeTemplate, /function activityEntityId/);\nassert.match(homeTemplate, /raw\\.clientId/);\nassert.match(homeTemplate, /raw\\.userId/);\n'''
    contract = contract.replace(anchor, insert + anchor, 1)
contract_path.write_text(contract)
