from pathlib import Path
import runpy

script = Path('.github/scripts/patch-incidencias-final-ux.py')
text = script.read_text(encoding='utf-8')
old = "if '!important' in c:\n    raise SystemExit('CSS contract violated: !important found')"
new = "if re.search(r':\\s*[^;{}\\n]*!\\s*important\\b', c, flags=re.I):\n    raise SystemExit('CSS contract violated: !important declaration found')"
if old not in text:
    raise SystemExit('Expected CSS validation guard not found in patcher')
script.write_text(text.replace(old, new, 1), encoding='utf-8')

runpy.run_path(str(script), run_name='__main__')

# The base attachment action function ends with Download. Add the admin-only
# destructive action here as a deterministic final pass so the generated
# markup cannot depend on a broad template-tail replacement.
template = Path('src/views/incidencias/incidencias.template.modal.js')
source = template.read_text(encoding='utf-8')

if 'class="incidencias-modal-delete-btn"' not in source:
    start = source.find('function renderAttachmentActionButtons(')
    end = source.find('function renderAttachments(', start)
    if start < 0 or end < 0:
        raise SystemExit('Attachment action function bounds not found')

    segment = source[start:end]
    needle = '''      </button>
    </div>
  `;
}

'''
    addition = '''      </button>

      ${
        vm.canDeleteAttachments
          ? `
            <button
              type="button"
              data-detail-action="${DETAIL_ACTIONS.ATTACHMENT_DELETE}"
              data-attachment-id="${attr(busy.attachmentId)}"
              ${disabledAttrs(
                noId ||
                busy.isDeleting ||
                vm.submitting,
                busy.isDeleting
              )}
              class="incidencias-modal-delete-btn"
              aria-label="${attr(`Eliminar ${name}`)}"
              title="Eliminar este adjunto"
            >
              ${
                busy.isDeleting
                  ? renderInlineSpinner(
                      "Eliminando..."
                    )
                  : `
                    <span class="incidencias-modal-action-icon">
                      ${icon("trash")}
                    </span>
                    <span>Eliminar</span>
                  `
              }
            </button>
          `
          : ""
      }
    </div>
  `;
}

'''

    if segment.count(needle) != 1:
        raise SystemExit(
            f'Attachment action tail expected once, got {segment.count(needle)}'
        )

    segment = segment.replace(needle, addition, 1)
    source = source[:start] + segment + source[end:]
    template.write_text(source, encoding='utf-8')

print('Guaranteed admin attachment delete markup')
