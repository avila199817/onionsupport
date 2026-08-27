#!/usr/bin/env python3
from pathlib import Path

p = Path('.github/scripts/tmp_correo_shared_mailbox_patch.py')
text = p.read_text(encoding='utf-8')

# Las versiones de API/view están fijadas por contratos globales V9/V11.
text = text.replace(
    "'export const CORREO_API_VERSION = \"correo.api.microsoft.production.v4-mailbox-context\";'",
    "'export const CORREO_API_VERSION = \"correo.api.microsoft.production.v3-pure-http\";'",
    1,
)
text = text.replace(
    "'export const CORREO_VIEW_VERSION = \"correo.view.microsoft.production.v7-shared-mailbox\";'",
    "'export const CORREO_VIEW_VERSION = \"correo.view.microsoft.production.v6-canonical-user\";'",
    1,
)

old_strict = '''text = replace_once(text, '        mailbox: state.status.mailbox || "",', '        mailbox: state.activeMailbox || state.status.mailbox || "",', 'watcher active mailbox')'''
new_strict = '''old_mailbox = '        mailbox: state.status.mailbox || "",'\nnew_mailbox = '        mailbox: state.activeMailbox || state.status.mailbox || "",'\nmailbox_count = text.count(old_mailbox)\nif mailbox_count != 2:\n    raise SystemExit(f'watcher/snapshot mailbox: expected exactly 2 anchors, found {mailbox_count}')\ntext = text.replace(old_mailbox, new_mailbox)\ntext = replace_once(text, 'configureMailWatcher({ inboxFolderId: inbox?.id || "", mailbox: state.status.mailbox || "", seedMessages: inbox?.id === state.selectedFolderId ? state.messages : [] });', 'configureMailWatcher({ inboxFolderId: inbox?.id || "", mailbox: state.activeMailbox || state.status.mailbox || "", seedMessages: inbox?.id === state.selectedFolderId ? state.messages : [] });', 'notifications watcher active mailbox')'''
if text.count(old_strict) != 1:
    raise SystemExit(f'driver strict watcher anchor expected 1, found {text.count(old_strict)}')
text = text.replace(old_strict, new_strict, 1)

old_snapshot_source = '''text = replace_once(text, '        mailbox: state.status.mailbox || "",\\n        folders:', '        mailbox: state.status.mailbox || "",\\n        activeMailbox: state.activeMailbox || state.status.mailbox || "",\\n        mailboxCount: state.mailboxes.length,\\n        folders:', 'snapshot mailbox state')'''
new_snapshot_source = '''text = replace_once(text, '        mailbox: state.activeMailbox || state.status.mailbox || "",\\n        folders:', '        mailbox: state.status.mailbox || "",\\n        activeMailbox: state.activeMailbox || state.status.mailbox || "",\\n        mailboxCount: state.mailboxes.length,\\n        folders:', 'snapshot mailbox state')'''
if text.count(old_snapshot_source) != 1:
    raise SystemExit(f'driver snapshot source anchor expected 1, found {text.count(old_snapshot_source)}')
text = text.replace(old_snapshot_source, new_snapshot_source, 1)

p.write_text(text, encoding='utf-8')
print('Correo shared patch driver adjusted · canonical identities preserved')
