#!/usr/bin/env python3
from pathlib import Path
p = Path('.github/scripts/tmp_correo_shared_mailbox_patch.py')
text = p.read_text(encoding='utf-8')
old = '''text = replace_once(text, '        mailbox: state.status.mailbox || "",', '        mailbox: state.activeMailbox || state.status.mailbox || "",', 'watcher active mailbox')'''
new = '''old_mailbox = '        mailbox: state.status.mailbox || "",'\nnew_mailbox = '        mailbox: state.activeMailbox || state.status.mailbox || "",'\nmailbox_count = text.count(old_mailbox)\nif mailbox_count != 2:\n    raise SystemExit(f'watcher active mailbox: expected exactly 2 anchors, found {mailbox_count}')\ntext = text.replace(old_mailbox, new_mailbox)'''
count = text.count(old)
if count != 1:
    raise SystemExit(f'driver expected 1 strict watcher anchor, found {count}')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Correo shared patch driver adjusted')
