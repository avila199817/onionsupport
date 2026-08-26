#!/usr/bin/env python3
from pathlib import Path
import re

INDEX = Path('src/views/facturas/index.js')
STYLE = Path('src/css/views/facturas/create.css')
CONTRACT = Path('.github/scripts/facturas_continuous_scroll_contract.py')


def sub_once(text, pattern, repl, label, flags=0):
    out, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return out


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)


s = INDEX.read_text(encoding='utf-8')
s = replace_once(s, '"facturas.index.productivo.v19.client-only-create-search"', '"facturas.index.productivo.v20.multi-line-create-polish"', 'index version')
s = sub_once(s, r'''const TICKET_SEARCH_ENDPOINTS = Object\.freeze\(\[.*?\]\);''', 'const TICKET_SEARCH_ENDPOINTS = Object.freeze([\n  "/api/search/incidencias",\n]);', 'canonical ticket endpoint', flags=re.S)
s = s.replace('if (!ticketClienteId && !ticketUserId) return true;', 'if (!ticketClienteId && !ticketUserId) return false;')

patch_marker = '''    const value =\n      field.type === "checkbox"\n        ? Boolean(field.checked)\n        : field.tagName === "TEXTAREA"\n          ? multilineValue(field.value)\n          : field.value;\n\n    createModal.form = {\n      ...createModal.form,\n      [name]: value,\n    };'''
patch_repl = '''    const value =\n      field.type === "checkbox"\n        ? Boolean(field.checked)\n        : field.tagName === "TEXTAREA"\n          ? multilineValue(field.value)\n          : field.value;\n\n    const lineField = cleanText(field.dataset?.lineField, "");\n    const lineIndex = number(field.dataset?.lineIndex, -1);\n\n    if (lineField && Number.isInteger(lineIndex) && lineIndex >= 0) {\n      const lineas = safeArray(createModal.form.lineas).map((linea) => ({ ...safeObject(linea) }));\n      if (!lineas[lineIndex]) return false;\n      lineas[lineIndex] = { ...lineas[lineIndex], [lineField]: value };\n      createModal.form = { ...createModal.form, lineas };\n      const errorKey = `lineas.${lineIndex}.${lineField}`;\n      if (createModal.errors[errorKey]) {\n        const next = { ...createModal.errors };\n        delete next[errorKey];\n        createModal.errors = next;\n      }\n      createModal.serverError = "";\n      patchCreateTotalsDom();\n      return true;\n    }\n\n    createModal.form = {\n      ...createModal.form,\n      [name]: value,\n    };'''
s = replace_once(s, patch_marker, patch_repl, 'line field state')

s = replace_once(s, '''    if (totalNode) {\n      totalNode.textContent = formatMoney(breakdown.totalFactura);\n    }\n\n    return true;''', '''    if (totalNode) {\n      totalNode.textContent = formatMoney(breakdown.totalFactura);\n    }\n\n    safeArray(breakdown.lineas).forEach((linea, index) => {\n      const node = createModalHost.querySelector(`[data-line-total="${index}"]`);\n      if (node) node.textContent = formatMoney(linea.base);\n    });\n\n    return true;''', 'live line totals')

s = s.replace('autoSelectLatest:\n        createModal.selectedTickets.length === 0,', 'autoSelectLatest: false,')

old_ticket_reset = '''    createModal.ticketSearch = {\n      query: "",\n      loading: false,\n      error: "",\n      results: [],\n      empty: false,\n    };\n\n    rerenderCreateWithFocus(\n      "[data-field='ticketSearch'], [data-create-field='ticketSearch'], input[name='ticketSearch']"\n    );\n\n    return true;\n  }\n\n  function removeTicket'''
new_ticket_reset = '''    createModal.ticketSearch = {\n      ...createModal.ticketSearch,\n      loading: false,\n      error: "",\n      empty: createModal.ticketSearch.results.length === 0,\n    };\n\n    rerenderCreateWithFocus(\n      "[data-field='ticketSearch'], [data-create-field='ticketSearch'], input[name='ticketSearch']"\n    );\n\n    return true;\n  }\n\n  function removeTicket'''
s = replace_once(s, old_ticket_reset, new_ticket_reset, 'retain ticket results after select')

payload_marker = '  function buildFacturaPayload() {'
line_controller_helpers = r'''  function addCreateLineItem() {
    const lineas = safeArray(createModal.form.lineas).map((linea) => ({ ...safeObject(linea) }));
    const id = `linea-${Date.now()}-${lineas.length + 1}`;
    lineas.push({ id, concepto: "", descripcion: "", cantidad: 1, unidad: "ud", precioUnitario: 0 });
    createModal.form = { ...createModal.form, lineas };
    createModal.serverError = "";
    renderCreateModal({ immediate: true, preserveFocus: true, focusSelector: `[data-line-index="${lineas.length - 1}"][data-line-field="concepto"]` });
    return true;
  }

  function removeCreateLineItem(index = -1) {
    const lineas = safeArray(createModal.form.lineas).map((linea) => ({ ...safeObject(linea) }));
    const targetIndex = number(index, -1);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= lineas.length || lineas.length <= 1) return false;
    lineas.splice(targetIndex, 1);
    createModal.form = { ...createModal.form, lineas };
    createModal.errors = {};
    createModal.serverError = "";
    renderCreateModal({ immediate: true, preserveFocus: true, focusSelector: `[data-line-index="${Math.max(0, targetIndex - 1)}"][data-line-field="concepto"]` });
    return true;
  }

  function readCreateLineItems(formNode = null) {
    if (!formNode?.querySelectorAll) return safeArray(createModal.form.lineas);
    return Array.from(formNode.querySelectorAll("[data-line-item='true']")).map((row, index) => {
      const read = (field) => row.querySelector(`[data-line-field="${field}"]`)?.value ?? "";
      return {
        id: cleanText(first(safeArray(createModal.form.lineas)[index]?.id, `linea-${index + 1}`), `linea-${index + 1}`),
        concepto: cleanText(read("concepto"), ""),
        descripcion: multilineValue(read("descripcion")),
        cantidad: number(read("cantidad"), 0),
        unidad: cleanText(read("unidad"), "ud"),
        precioUnitario: number(read("precioUnitario"), 0),
      };
    });
  }

'''
s = replace_once(s, payload_marker, line_controller_helpers + payload_marker, 'line controller helpers')

s = sub_once(s, r'''\n      lineas: \[\n        \{.*?\n        \},\n      \],''', r'''
      lineas: safeArray(breakdown.lineas).map((linea, index) => {
        const baseLinea = number(linea.base, 0);
        const ivaImporte = Math.round((baseLinea * (breakdown.ivaRate / 100) + Number.EPSILON) * 100) / 100;
        const irpfImporte = breakdown.aplicaIrpf ? -Math.round((baseLinea * (breakdown.irpfRate / 100) + Number.EPSILON) * 100) / 100 : 0;
        return {
          id: cleanText(first(linea.id, `linea-${index + 1}`), `linea-${index + 1}`),
          lineNumber: index + 1,
          concepto: cleanText(linea.concepto, ""),
          descripcion: cleanText(first(linea.descripcion, linea.concepto), ""),
          cantidad: number(linea.cantidad, 0),
          unidad: cleanText(linea.unidad, "ud"),
          precioUnitario: number(linea.precioUnitario, 0),
          subtotal: baseLinea,
          base: baseLinea,
          baseImponible: baseLinea,
          totalLinea: baseLinea,
          total: baseLinea,
          importe: baseLinea,
          iva: { porcentaje: breakdown.ivaRate, importe: ivaImporte },
          irpf: { porcentaje: breakdown.irpfRate, importe: irpfImporte },
        };
      }),''', 'multi-line payload', flags=re.S)

s = sub_once(s, r'''    createModal\.form = \{\n      \.\.\.createModal\.form,\n      concepto:.*?\n      sendEmail: Boolean\(formNode\?\.querySelector\?\.\("\[name='sendEmail'\]"\)\?\.checked\),\n    \};''', r'''    const lineas = readCreateLineItems(formNode);
    createModal.form = {
      ...createModal.form,
      lineas,
      fechaServicio: cleanText(formNode?.querySelector?.("[name='fechaServicio']")?.value || createModal.form.fechaServicio, createModal.form.fechaServicio),
      formaPago: cleanText(formNode?.querySelector?.("[name='formaPago']")?.value || createModal.form.formaPago, createModal.form.formaPago),
      estadoPago: cleanText(formNode?.querySelector?.("[name='estadoPago']")?.value || createModal.form.estadoPago, createModal.form.estadoPago),
      sendEmail: Boolean(formNode?.querySelector?.("[name='sendEmail']")?.checked),
    };''', 'submit reads line items', flags=re.S)

s = replace_once(s, '    if (type === FACTURA_CREATE_ACTIONS.SUBMIT) {\n', '    if (type === FACTURA_CREATE_ACTIONS.LINE_ADD) return addCreateLineItem();\n\n    if (type === FACTURA_CREATE_ACTIONS.LINE_REMOVE) {\n      return removeCreateLineItem(number(node?.dataset?.lineIndex, -1));\n    }\n\n    if (type === FACTURA_CREATE_ACTIONS.SUBMIT) {\n', 'line action handlers')
s = sub_once(s, r'''\n    if \(type === FACTURA_CREATE_ACTIONS\.CLIENT_CLEAR\) \{\n      return clearClients\(\);\n    \}\n''', '\n', 'remove client clear handler')
s = sub_once(s, r'''\n    if \(type === FACTURA_CREATE_ACTIONS\.TICKET_CLEAR\) \{\n      return clearTickets\(\);\n    \}\n''', '\n', 'remove ticket clear handler')
INDEX.write_text(s, encoding='utf-8')

c = STYLE.read_text(encoding='utf-8')
c = c.replace('PRODUCTIVO · TAX PROFILE AWARE · V6', 'PRODUCTIVO · MULTI-LINE BILLING · V7')
c = replace_once(c, '''  border: 1px solid var(--border-strong);\n  border-radius: var(--radius-sm);\n  background: var(--avatar-bg, var(--badge-bg));\n  color: var(--text-strong);''', '''  border: 1px solid color-mix(in srgb, var(--fac-avatar-a) 44%, var(--border-default));\n  border-radius: var(--radius-sm);\n  background: linear-gradient(135deg, var(--fac-avatar-a), var(--fac-avatar-b));\n  color: var(--text-on-accent, #fff);\n  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 18%, transparent);''', 'create avatar palette base')
avatar_tones = '''\n.fac-create-avatar--tone-0 { --fac-avatar-a: var(--accent); --fac-avatar-b: var(--info); }\n.fac-create-avatar--tone-1 { --fac-avatar-a: var(--success); --fac-avatar-b: var(--info); }\n.fac-create-avatar--tone-2 { --fac-avatar-a: var(--warning); --fac-avatar-b: var(--accent); }\n.fac-create-avatar--tone-3 { --fac-avatar-a: var(--error); --fac-avatar-b: var(--warning); }\n.fac-create-avatar--tone-4 { --fac-avatar-a: var(--info); --fac-avatar-b: var(--accent); }\n.fac-create-avatar--tone-5 { --fac-avatar-a: var(--success); --fac-avatar-b: var(--accent); }\n.fac-create-avatar--tone-6 { --fac-avatar-a: var(--info); --fac-avatar-b: var(--success); }\n.fac-create-avatar--tone-7 { --fac-avatar-a: var(--warning); --fac-avatar-b: var(--error); }\n.fac-create-avatar--tone-8 { --fac-avatar-a: var(--error); --fac-avatar-b: var(--accent); }\n.fac-create-avatar--tone-9 { --fac-avatar-a: var(--accent); --fac-avatar-b: var(--success); }\n'''
c = replace_once(c, '.fac-create-avatar img {', avatar_tones + '\n.fac-create-avatar img {', 'create avatar tones')
c = replace_once(c, '  justify-content: space-between;\n  gap: var(--space-md);\n  padding: 14px clamp(18px, 2vw, 30px);', '  justify-content: flex-end;\n  gap: var(--space-md);\n  padding: 14px clamp(18px, 2vw, 30px);', 'footer alignment')

line_css = r'''
/* =========================================================
   MULTI-LINE BILLING
========================================================= */
.fac-create-line-items { min-inline-size: 0; display: grid; gap: var(--space-sm); }
.fac-create-line-item { min-inline-size: 0; display: grid; gap: var(--space-sm); padding: 13px; border: 1px solid var(--border-default); border-radius: var(--radius-sm); background: var(--solid-bg-1, var(--panel-bg)); }
.fac-create-line-head { min-inline-size: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); }
.fac-create-line-head > div:first-child { min-inline-size: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.fac-create-line-kicker { flex: 0 0 auto; padding: 4px 7px; border: 1px solid var(--badge-border); border-radius: var(--radius-pill); background: var(--badge-bg); color: var(--text-muted); font-size: 9px; font-weight: var(--weight-black); letter-spacing: .055em; text-transform: uppercase; }
.fac-create-line-head strong { min-inline-size: 0; overflow: hidden; color: var(--text-strong); font-size: var(--font-sm); text-overflow: ellipsis; white-space: nowrap; }
.fac-create-line-head-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 7px; }
.fac-create-line-total { color: var(--text-strong); font-size: var(--font-sm); font-weight: var(--weight-black); font-variant-numeric: tabular-nums; }
.fac-create-line-grid { min-inline-size: 0; display: grid; grid-template-columns: minmax(180px, 1.4fr) minmax(180px, 1.4fr) minmax(100px, .55fr) minmax(120px, .65fr) minmax(130px, .7fr); gap: 10px; align-items: start; }
.fac-create-line-add { display: inline-flex; align-items: center; gap: 6px; }
.fac-create-line-add svg { inline-size: 14px; block-size: 14px; }
.fac-create-search-result--ticket.is-selected { border-color: var(--border-success); background: var(--success-bg); cursor: default; opacity: 1; }
.fac-create-search-result--ticket.is-selected .fac-create-result-plus { color: var(--success-strong, var(--success)); }
@media (max-width: 980px) { .fac-create-line-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .fac-create-line-concept, .fac-create-line-description { grid-column: 1 / -1; } }
@media (max-width: 640px) { .fac-create-line-head { align-items: flex-start; } .fac-create-line-grid { grid-template-columns: 1fr; } .fac-create-line-concept, .fac-create-line-description { grid-column: auto; } .fac-create-line-head strong { white-space: normal; } }

'''
c = replace_once(c, '/* =========================================================\n   TOTALS\n========================================================= */', line_css + '/* =========================================================\n   TOTALS\n========================================================= */', 'line css')
STYLE.write_text(c, encoding='utf-8')

k = CONTRACT.read_text(encoding='utf-8')
contract_insert = r'''
# Nueva factura is a line-item editor with one canonical client and incident domain.
reject(TEMPLATE, 'CLIENT_CLEAR: "create-client-clear"', "Create invoice must not expose a duplicate client clear action")
reject(TEMPLATE, 'TICKET_CLEAR: "create-ticket-clear"', "Create invoice must not expose a duplicate ticket clear action")
reject(TEMPLATE, "Política automática:", "Create invoice must not render the redundant automatic tax policy footnote")
reject(TEMPLATE, "fac-create-footer-summary", "Create invoice footer must contain actions only")
require(TEMPLATE, 'LINE_ADD: "create-line-add"', "Create invoice must support adding line items")
require(TEMPLATE, 'LINE_REMOVE: "create-line-remove"', "Create invoice must support removing line items")
require(TEMPLATE, 'data-line-field="concepto"', "Line-item editor must expose per-line concepts")
require(TEMPLATE, 'data-line-field="unidad"', "Line-item editor must support service/material units")
require(INDEX, "readCreateLineItems", "Controller must read every invoice line before submit")
require(INDEX, "safeArray(breakdown.lineas).map", "Create payload must serialize every validated invoice line")
require(INDEX, 'const TICKET_SEARCH_ENDPOINTS = Object.freeze([\n  "/api/search/incidencias",\n]);', "Invoice incidents must use the canonical client-scoped incidence search")
require(INDEX, "autoSelectLatest: false", "Client incidents must remain a visible explicit choice instead of being auto-selected")
require(TEMPLATE, "fac-create-avatar--tone-${tone}", "Create invoice avatars must inherit the same deterministic palette as Facturas")
require(STYLE, ".fac-create-avatar--tone-7", "Create invoice must carry the full Facturas avatar tone palette")
'''
k = replace_once(k, '# Facturas resend UX must stay inside the product visual system, never browser chrome.\n', contract_insert + '\n# Facturas resend UX must stay inside the product visual system, never browser chrome.\n', 'contract insertion')
CONTRACT.write_text(k, encoding='utf-8')

print('facturas-create-polish-bootstrap-v2: continuation applied')
