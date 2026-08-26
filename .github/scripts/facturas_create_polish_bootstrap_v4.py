#!/usr/bin/env python3
from pathlib import Path

path = Path('.github/scripts/facturas_continuous_scroll_contract.py')
text = path.read_text(encoding='utf-8')

anchor = 'STYLE = (ROOT / "src/css/views/facturas/index.css").read_text(encoding="utf-8")\n'
insert = anchor + 'CREATE_TEMPLATE = (ROOT / "src/views/facturas/facturas.template.create.js").read_text(encoding="utf-8")\nCREATE_STYLE = (ROOT / "src/css/views/facturas/create.css").read_text(encoding="utf-8")\n'
if text.count(anchor) != 1:
    raise SystemExit('contract source anchor mismatch')
text = text.replace(anchor, insert, 1)

replacements = {
    "reject(TEMPLATE, 'CLIENT_CLEAR: \"create-client-clear\"',": "reject(CREATE_TEMPLATE, 'CLIENT_CLEAR: \"create-client-clear\"',",
    "reject(TEMPLATE, 'TICKET_CLEAR: \"create-ticket-clear\"',": "reject(CREATE_TEMPLATE, 'TICKET_CLEAR: \"create-ticket-clear\"',",
    'reject(TEMPLATE, "Política automática:",': 'reject(CREATE_TEMPLATE, "Política automática:",',
    'reject(TEMPLATE, "fac-create-footer-summary",': 'reject(CREATE_TEMPLATE, "fac-create-footer-summary",',
    "require(TEMPLATE, 'LINE_ADD: \"create-line-add\"',": "require(CREATE_TEMPLATE, 'LINE_ADD: \"create-line-add\"',",
    "require(TEMPLATE, 'LINE_REMOVE: \"create-line-remove\"',": "require(CREATE_TEMPLATE, 'LINE_REMOVE: \"create-line-remove\"',",
    "require(TEMPLATE, 'data-line-field=\"concepto\"',": "require(CREATE_TEMPLATE, 'data-line-field=\"concepto\"',",
    "require(TEMPLATE, 'data-line-field=\"unidad\"',": "require(CREATE_TEMPLATE, 'data-line-field=\"unidad\"',",
    'require(TEMPLATE, "fac-create-avatar--tone-${tone}",': 'require(CREATE_TEMPLATE, "fac-create-avatar--tone-${tone}",',
    'require(STYLE, ".fac-create-avatar--tone-7",': 'require(CREATE_STYLE, ".fac-create-avatar--tone-7",',
}

for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f'contract target mismatch: {old}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('facturas-create-polish-bootstrap-v4: contract targets corrected')
