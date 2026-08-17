from pathlib import Path
import re

ROOT = Path('.')
TEMPLATE = ROOT / 'src/views/incidencias/incidencias.template.modal.js'
INDEX = ROOT / 'src/views/incidencias/index.js'
API = ROOT / 'src/views/incidencias/incidencias.api.js'
CSS = ROOT / 'src/css/views/incidencias/detail.css'


def read(path):
    return path.read_text(encoding='utf-8')


def write(path, text):
    path.write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)


def insert_before_once(text, marker, addition, label):
    count = text.count(marker)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 marker, got {count}')
    return text.replace(marker, addition + marker, 1)


# ==========================================================
# TEMPLATE
# ==========================================================
t = read(TEMPLATE)

t = replace_once(
    t,
    '  "incidencias.template.modal.extreme.v22.history-first";',
    '  "incidencias.template.modal.extreme.v23.final-ux-admin-files";',
    'template version',
)

t = replace_once(
    t,
    '  TICKET_CLOSE: "detail-ticket-close",\n  HISTORY_TOGGLE: "detail-history-toggle",\n\n  ATTACHMENTS_ADD: "detail-attachments-add",',
    '  TICKET_CLOSE: "detail-ticket-close",\n  HISTORY_TOGGLE: "detail-history-toggle",\n  HISTORY_REVEAL: "detail-history-reveal",\n\n  ATTACHMENTS_ADD: "detail-attachments-add",',
    'template history reveal action',
)

t = replace_once(
    t,
    '  ATTACHMENT_OPEN: "detail-attachment-open",\n  ATTACHMENT_DOWNLOAD: "detail-attachment-download",',
    '  ATTACHMENT_OPEN: "detail-attachment-open",\n  ATTACHMENT_DOWNLOAD: "detail-attachment-download",\n  ATTACHMENT_DELETE: "detail-attachment-delete",',
    'template delete attachment action',
)

t = replace_once(
    t,
    '    history:\n      `<svg ${common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>`,\n\n    chevronDown:',
    '    history:\n      `<svg ${common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>`,\n\n    trash:\n      `<svg ${common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>`,\n\n    chevronDown:',
    'template trash icon',
)

t = replace_once(
    t,
    '    historyOpen:\n      data.historyOpen === true,\n\n    feedbackMessage:',
    '    historyOpen:\n      data.historyOpen === true,\n\n    historyCount:\n      getTimelineCount(detail),\n\n    admin:\n      data.admin === true,\n\n    canDeleteAttachments:\n      data.admin === true,\n\n    deletingAttachmentId:\n      cleanText(\n        data.deletingAttachmentId,\n        ""\n      ),\n\n    feedbackMessage:',
    'template admin/delete vm',
)

old_header = '''function renderHeaderActions(vm = {}) {
  return `
    <div
      class="incidencias-modal-header-actions"
      data-modal-header-actions="true"
    >
      ${
        vm.canCloseTicket
          ? `
            <button
              type="button"
              data-detail-action="${DETAIL_ACTIONS.TICKET_CLOSE}"
              data-ticket-id="${attr(vm.ticketId)}"
              class="incidencias-modal-close-ticket-btn"
              aria-label="Cerrar ticket"
              title="Cerrar esta incidencia manualmente"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >
              <span class="incidencias-modal-close-ticket-icon">
                ${icon("check")}
              </span>
              <span class="incidencias-modal-close-ticket-label">
                Cerrar ticket
              </span>
            </button>
          `
          : ""
      }

      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.CLOSE}"
        aria-label="Cerrar modal"
        title="Cerrar ventana"
        ${disabledAttrs(vm.submitting, vm.submitting)}
        class="incidencias-modal-close-btn"
      >${icon("close")}</button>
    </div>
  `;
}
'''

new_header = '''function renderHeaderActions(vm = {}) {
  return `
    <div
      class="incidencias-modal-header-actions"
      data-modal-header-actions="true"
    >
      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.HISTORY_REVEAL}"
        class="incidencias-modal-history-jump-btn"
        aria-label="Abrir historial y actividad"
        title="Ver historial y actividad"
        ${disabledAttrs(vm.submitting, vm.submitting)}
      >
        <span class="incidencias-modal-history-jump-icon">
          ${icon("history")}
        </span>
        <span class="incidencias-modal-history-jump-label">
          Historial
        </span>
        <span class="incidencias-modal-history-jump-count" aria-hidden="true">
          ${escapeHtml(String(vm.historyCount))}
        </span>
      </button>

      ${
        vm.canCloseTicket
          ? `
            <button
              type="button"
              data-detail-action="${DETAIL_ACTIONS.TICKET_CLOSE}"
              data-ticket-id="${attr(vm.ticketId)}"
              class="incidencias-modal-close-ticket-btn"
              aria-label="Cerrar ticket"
              title="Cerrar esta incidencia manualmente"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >
              <span class="incidencias-modal-close-ticket-icon">
                ${icon("check")}
              </span>
              <span class="incidencias-modal-close-ticket-label">
                Cerrar ticket
              </span>
            </button>
          `
          : ""
      }

      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.CLOSE}"
        aria-label="Cerrar modal"
        title="Cerrar ventana"
        ${disabledAttrs(vm.submitting, vm.submitting)}
        class="incidencias-modal-close-btn"
      >${icon("close")}</button>
    </div>
  `;
}
'''

t = replace_once(t, old_header, new_header, 'template header actions')

t = replace_once(
    t,
    '    isDownloading:\n      Boolean(\n        attachmentId &&\n        vm.downloadingAttachmentId ===\n          attachmentId\n      ),\n  };',
    '    isDownloading:\n      Boolean(\n        attachmentId &&\n        vm.downloadingAttachmentId ===\n          attachmentId\n      ),\n\n    isDeleting:\n      Boolean(\n        attachmentId &&\n        vm.deletingAttachmentId ===\n          attachmentId\n      ),\n  };',
    'template attachment delete busy',
)

old_actions_tail = '''      </button>
    </div>
  `;
}

function renderAttachments(
'''
new_actions_tail = '''      </button>

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

function renderAttachments(
'''
# Restrict this replacement to the action-buttons function by locating it first.
action_start = t.find('function renderAttachmentActionButtons(')
action_end = t.find('function renderAttachments(', action_start)
if action_start < 0 or action_end < 0:
    raise SystemExit('template attachment action function not found')
segment = t[action_start:action_end]
if segment.count(old_actions_tail[:-len('function renderAttachments(\n')]) != 1:
    # Replace a shorter unique tail inside the segment.
    short_old = '      </button>\n    </div>\n  `;\n}\n\n'
    short_new = new_actions_tail.replace('function renderAttachments(\n', '')
    if segment.count(short_old) != 1:
        raise SystemExit('template attachment action tail mismatch')
    segment = segment.replace(short_old, short_new, 1)
else:
    segment = segment.replace(old_actions_tail, new_actions_tail, 1)
t = t[:action_start] + segment + t[action_end:]

# Add explicit admin/history features to the template snapshot when the marker exists.
snapshot_marker = '      historyLazyRender:\n        true,\n'
if snapshot_marker in t:
    t = replace_once(
        t,
        snapshot_marker,
        snapshot_marker + '\n      historyHeaderAccess:\n        true,\n\n      adminAttachmentDelete:\n        true,\n',
        'template snapshot features',
    )

write(TEMPLATE, t)


# ==========================================================
# API
# ==========================================================
a = read(API)
a = replace_once(
    a,
    'export const INCIDENCIAS_API_VERSION = "incidencias.api.extreme.v21.manual-close";',
    'export const INCIDENCIAS_API_VERSION = "incidencias.api.extreme.v23.admin-attachment-delete";',
    'api version',
)

api_marker = '''export async function uploadIncidenciaAttachments(id = "", files = [], options = {}) {
  const updated = await uploadIncidenciaAttachmentsRequest(id, files, options);
  return updated ? upsertCachedIncidencia(updated) : null;
}

'''
api_add = '''export async function uploadIncidenciaAttachments(id = "", files = [], options = {}) {
  const updated = await uploadIncidenciaAttachmentsRequest(id, files, options);
  return updated ? upsertCachedIncidencia(updated) : null;
}

export async function deleteIncidenciaAttachment(
  {
    ticketId = "",
    attachmentId = "",
  } = {},
  options = {}
) {
  const ticketKey = normalizeIncidenciaId(ticketId);
  const attachmentKey = cleanText(attachmentId, "");

  if (!ticketKey) throw new Error("INCIDENCIA_ID_REQUIRED");
  if (!attachmentKey) throw new Error("INCIDENCIA_ATTACHMENT_ID_REQUIRED");

  /*
    Contrato real del backend actual: incidenciaUpdate acepta
    deleteAttachments sólo para roles admin/support. El mismo PATCH elimina
    metadata en Cosmos y, tras guardar, borra el Blob registrado.
  */
  const updated = await updateIncidenciaRequest(
    ticketKey,
    {
      deleteAttachments: [attachmentKey],
    },
    options
  );

  if (updated) return upsertCachedIncidencia(updated);

  const refreshed = await getIncidenciaByIdRequest(ticketKey, {
    ...options,
    force: true,
    cache: false,
  });

  return refreshed ? upsertCachedIncidencia(refreshed) : null;
}

'''
a = replace_once(a, api_marker, api_add, 'api attachment delete function')

a = replace_once(
    a,
    '  openIncidenciaAttachment,\n  downloadIncidenciaAttachment,\n\n  computeIncidenciasStats,',
    '  openIncidenciaAttachment,\n  downloadIncidenciaAttachment,\n  deleteIncidenciaAttachment,\n\n  computeIncidenciasStats,',
    'api default delete export',
)
write(API, a)


# ==========================================================
# INDEX / CONTROLLER
# ==========================================================
i = read(INDEX)
i = replace_once(
    i,
    '  openIncidenciaAttachment,\n  downloadIncidenciaAttachment,\n  computeIncidenciasStats,',
    '  openIncidenciaAttachment,\n  downloadIncidenciaAttachment,\n  deleteIncidenciaAttachment,\n  computeIncidenciasStats,',
    'index delete api import',
)
i = replace_once(
    i,
    '  "incidencias.index.extreme.v21.pro-close-history";',
    '  "incidencias.index.extreme.v23.final-ux-admin-files";',
    'index version',
)

replace_helper = '''
function replaceByTicketId(
  items = [],
  item = null
) {
  const next =
    safeObject(
      item,
      null
    );

  if (!next) {
    return safeArray(items);
  }

  const id =
    getTicketId(next);

  if (!id) {
    return safeArray(items);
  }

  let found = false;

  const output =
    safeArray(items).map((current) => {
      if (getTicketId(current) !== id) {
        return current;
      }

      found = true;
      return next;
    });

  if (!found) {
    output.push(next);
  }

  return output.sort((a, b) => {
    const diff =
      ticketSortTime(b) -
      ticketSortTime(a);

    if (diff !== 0) {
      return diff;
    }

    return getTicketId(b)
      .localeCompare(
        getTicketId(a),
        "es",
        {
          numeric: true,
          sensitivity: "base",
        }
      );
  });
}

'''
i = insert_before_once(i, 'function nextFrame(callback) {', replace_helper, 'index replaceByTicketId')

i = replace_once(
    i,
    '    openingAttachmentId: "",\n    downloadingAttachmentId: "",\n\n    previewFile: null,',
    '    openingAttachmentId: "",\n    downloadingAttachmentId: "",\n    deletingAttachmentId: "",\n\n    previewFile: null,',
    'index detail delete state',
)

# Reset deleting state in all known detail-reset/open blocks.
i = i.replace(
    'detailModal.downloadingAttachmentId = "";\n\n    detailModal.previewFile = null;',
    'detailModal.downloadingAttachmentId = "";\n    detailModal.deletingAttachmentId = "";\n\n    detailModal.previewFile = null;',
)
i = i.replace(
    'detailModal.downloadingAttachmentId = "";\n\n      detailModal.previewFile = null;',
    'detailModal.downloadingAttachmentId = "";\n      detailModal.deletingAttachmentId = "";\n\n      detailModal.previewFile = null;',
)
i = i.replace(
    'detailModal.downloadingAttachmentId = "";\n      detailModal.previewFile = null;',
    'detailModal.downloadingAttachmentId = "";\n      detailModal.deletingAttachmentId = "";\n      detailModal.previewFile = null;',
)

history_reveal_helper = '''
  function revealDetailHistory({
    focus = true,
  } = {}) {
    if (
      !isBrowser() ||
      destroyed ||
      !detailModal.open ||
      !modalHost?.isConnected
    ) {
      return false;
    }

    const root =
      modalHost.querySelector(
        DETAIL_ROOT_SELECTOR
      );

    const history =
      root?.querySelector?.(
        "[data-modal-history-slot='true']"
      ) ||
      null;

    if (!history) {
      return false;
    }

    try {
      history.scrollIntoView?.({
        behavior:
          prefersReducedMotion()
            ? "auto"
            : "smooth",
        block: "start",
        inline: "nearest",
      });
    } catch {
      try {
        history.scrollIntoView?.();
      } catch {
        // noop
      }
    }

    if (!focus) {
      return true;
    }

    const toggle =
      history.querySelector?.(
        `[data-detail-action="${DETAIL_ACTIONS.HISTORY_TOGGLE}"]`
      );

    nextFrame(() => {
      try {
        toggle?.focus?.({
          preventScroll: true,
        });
      } catch {
        toggle?.focus?.();
      }
    });

    return true;
  }

'''
i = insert_before_once(i, '  function activeElementInside(', history_reveal_helper, 'index history reveal helper')

open_history = '''  function openDetailHistory() {
    if (
      !detailModal.open ||
      detailModal.submitting
    ) {
      return false;
    }

    detailModal.historyOpen = true;

    renderModals({
      immediate: true,
    });

    nextFrame(() => {
      revealDetailHistory({
        focus: true,
      });
    });

    return true;
  }

'''
i = insert_before_once(i, '  function toggleDetailHistory() {', open_history, 'index open history action')

# When the body disclosure is opened, reveal it automatically too.
old_toggle_end = '''    renderModals({
      immediate: true,
      focusSelector:
        `[data-detail-action="${DETAIL_ACTIONS.HISTORY_TOGGLE}"]`,
    });

    return true;
  }

  async function closeDetailTicket() {
'''
new_toggle_end = '''    renderModals({
      immediate: true,
      focusSelector:
        `[data-detail-action="${DETAIL_ACTIONS.HISTORY_TOGGLE}"]`,
    });

    if (detailModal.historyOpen) {
      nextFrame(() => {
        revealDetailHistory({
          focus: false,
        });
      });
    }

    return true;
  }

  async function closeDetailTicket() {
'''
i = replace_once(i, old_toggle_end, new_toggle_end, 'index toggle history reveal')

# Insert admin attachment deletion immediately before preview close.
delete_handler = '''  async function deleteAttachment(
    attachmentId = ""
  ) {
    const id =
      cleanText(
        attachmentId,
        ""
      );

    const ticketId =
      getTicketId(
        detailModal.detail
      );

    if (
      !id ||
      !ticketId ||
      !detailModal.open ||
      detailModal.deletingAttachmentId
    ) {
      return false;
    }

    if (!isAdmin()) {
      detailModal.feedbackMessage =
        "Solo un administrador puede eliminar adjuntos.";
      detailModal.feedbackType =
        "error";
      renderModals({ immediate: true });
      return false;
    }

    const attachment =
      getAttachmentById(id);

    const filename =
      cleanText(
        first(
          attachment?.name,
          attachment?.filename,
          attachment?.fileName,
          "este adjunto"
        ),
        "este adjunto"
      );

    if (
      isBrowser() &&
      typeof window.confirm === "function"
    ) {
      const accepted = window.confirm(
        `¿Eliminar definitivamente “${filename}”?\n\nSe quitará de la incidencia y del almacenamiento. Esta acción no se puede deshacer.`
      );

      if (!accepted) {
        return false;
      }
    }

    detailModal.deletingAttachmentId = id;
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    renderModals({
      immediate: true,
    });

    try {
      const updated =
        await deleteIncidenciaAttachment({
          ticketId,
          attachmentId: id,
        });

      if (!updated) {
        throw new Error(
          "El backend no devolvió la incidencia actualizada."
        );
      }

      detailModal.deletingAttachmentId = "";
      detailModal.detail = updated;

      if (
        cleanText(
          first(
            detailModal.previewFile?.id,
            detailModal.previewFile?.attachmentId,
            ""
          ),
          ""
        ) === id
      ) {
        attachmentPreviewSeq += 1;
        detailModal.previewFile = null;
        detailModal.openingAttachmentId = "";
      }

      detailModal.feedbackMessage =
        `Adjunto “${filename}” eliminado correctamente.`;
      detailModal.feedbackType =
        "success";

      items =
        replaceByTicketId(
          items,
          updated
        );

      render({
        skipModals: true,
      });

      renderModals({
        immediate: true,
        focusSelector:
          "[data-modal-files-slot='true'] button, [data-modal-history-slot='true'] button",
      });

      return true;
    } catch (deleteError) {
      detailModal.deletingAttachmentId = "";
      detailModal.feedbackMessage =
        safeError(
          deleteError,
          "No se pudo eliminar el adjunto."
        );
      detailModal.feedbackType =
        "error";

      renderModals({
        immediate: true,
      });

      return false;
    }
  }

'''
i = insert_before_once(i, '  function closePreview() {', delete_handler, 'index delete attachment handler')

# Route the new permanent header history action.
i = replace_once(
    i,
    '    if (\n      type ===\n      DETAIL_ACTIONS.HISTORY_TOGGLE\n    ) {\n      return toggleDetailHistory();\n    }\n\n    if (\n      type ===\n      DETAIL_ACTIONS.PENDING_FILE_REMOVE',
    '    if (\n      type ===\n      DETAIL_ACTIONS.HISTORY_REVEAL\n    ) {\n      return openDetailHistory();\n    }\n\n    if (\n      type ===\n      DETAIL_ACTIONS.HISTORY_TOGGLE\n    ) {\n      return toggleDetailHistory();\n    }\n\n    if (\n      type ===\n      DETAIL_ACTIONS.PENDING_FILE_REMOVE',
    'index history reveal dispatch',
)

i = replace_once(
    i,
    '    if (\n      type ===\n      DETAIL_ACTIONS.ATTACHMENT_DOWNLOAD\n    ) {\n      return downloadAttachment(\n        node?.dataset?.attachmentId ||\n        ""\n      );\n    }\n\n    if (\n      type ===\n      DETAIL_ACTIONS.PREVIEW_CLOSE',
    '    if (\n      type ===\n      DETAIL_ACTIONS.ATTACHMENT_DOWNLOAD\n    ) {\n      return downloadAttachment(\n        node?.dataset?.attachmentId ||\n        ""\n      );\n    }\n\n    if (\n      type ===\n      DETAIL_ACTIONS.ATTACHMENT_DELETE\n    ) {\n      return deleteAttachment(\n        node?.dataset?.attachmentId ||\n        ""\n      );\n    }\n\n    if (\n      type ===\n      DETAIL_ACTIONS.PREVIEW_CLOSE',
    'index attachment delete dispatch',
)

# Snapshot/debug fields, non-functional but useful for diagnostics.
snap_marker = '''        detailHistoryOpen:
          detailModal.historyOpen === true,

        attachmentPreviewBusy:
'''
if snap_marker in i:
    i = replace_once(
        i,
        snap_marker,
        '''        detailHistoryOpen:
          detailModal.historyOpen === true,

        deletingAttachmentId:
          detailModal.deletingAttachmentId
            ? "***"
            : "",

        attachmentPreviewBusy:
''',
        'index snapshot delete state',
    )

policy_marker = '          detailHistoryLazyRender: true,\n'
if policy_marker in i:
    i = replace_once(
        i,
        policy_marker,
        policy_marker + '          detailHistoryHeaderAccess: true,\n          adminAttachmentDelete: true,\n',
        'index snapshot policies',
    )

write(INDEX, i)


# ==========================================================
# CSS
# ==========================================================
c = read(CSS)
c = replace_once(
    c,
    '   PRODUCTIVO · V21 · PRO CLOSE · LAZY HISTORY · EXTREME UI',
    '   PRODUCTIVO · V23 · FINAL UX · HEADER HISTORY · ADMIN FILE DELETE',
    'css version',
)

v23_css = r'''
/* =========================================================
   V23 · FINAL UX PASS
   - Historial siempre accesible desde el header fijo.
   - Caret explícito y visible en el composer.
   - Icono + con tratamiento cian/azul de mayor contraste.
   - Eliminación de adjuntos sólo expuesta por el template a admin.
   - Sin !important, sin estilos inline, sin hacks de especificidad.
========================================================= */

.incidencias-modal-history-jump-btn {
  appearance: none;

  min-block-size: 44px;
  min-inline-size: 118px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  padding: 9px 11px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--idm-info) 36%,
      var(--idm-border-soft)
    );

  border-radius: 14px;

  background:
    linear-gradient(
      145deg,
      color-mix(
        in srgb,
        var(--idm-info) 10%,
        var(--idm-control)
      ),
      color-mix(
        in srgb,
        var(--idm-accent) 8%,
        var(--idm-control)
      )
    );

  color: var(--idm-text-strong);

  font: inherit;
  font-size: 11.5px;
  font-weight: 790;
  line-height: 1;

  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  box-shadow:
    var(--idm-shadow-control),
    0 8px 24px
      color-mix(
        in srgb,
        var(--idm-info) 8%,
        transparent
      );

  transition:
    border-color var(--idm-duration) var(--idm-ease),
    background var(--idm-duration) var(--idm-ease),
    box-shadow var(--idm-duration) var(--idm-ease),
    transform var(--idm-duration) var(--idm-ease),
    opacity var(--idm-duration) var(--idm-ease);
}

.incidencias-modal-history-jump-btn:hover:not(:disabled) {
  border-color:
    color-mix(
      in srgb,
      var(--idm-info) 66%,
      var(--idm-accent-border)
    );

  background:
    linear-gradient(
      145deg,
      color-mix(
        in srgb,
        var(--idm-info) 17%,
        var(--idm-control)
      ),
      color-mix(
        in srgb,
        var(--idm-accent) 13%,
        var(--idm-control)
      )
    );

  transform: translateY(-1px);

  box-shadow:
    var(--idm-shadow-control),
    0 10px 28px
      color-mix(
        in srgb,
        var(--idm-info) 14%,
        transparent
      );
}

.incidencias-modal-history-jump-btn:active:not(:disabled) {
  transform: translateY(0) scale(.985);
}

.incidencias-modal-history-jump-btn:focus-visible {
  outline: none;
  box-shadow:
    var(--idm-shadow-control),
    var(--idm-focus);
}

.incidencias-modal-history-jump-btn:disabled {
  cursor: not-allowed;
  opacity: .56;
  transform: none;
}

.incidencias-modal-history-jump-icon {
  inline-size: 18px;
  block-size: 18px;

  display: inline-grid;
  place-items: center;

  color:
    color-mix(
      in srgb,
      var(--idm-info) 72%,
      var(--idm-text-strong)
    );
}

.incidencias-modal-history-jump-icon > svg {
  inline-size: 18px;
  block-size: 18px;
}

.incidencias-modal-history-jump-count {
  min-inline-size: 22px;
  min-block-size: 22px;

  display: inline-grid;
  place-items: center;

  padding-inline: 6px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--idm-info) 24%,
      var(--idm-border-subtle)
    );

  border-radius: 999px;

  background:
    color-mix(
      in srgb,
      var(--idm-info) 10%,
      transparent
    );

  color: var(--idm-text-soft);

  font-size: 9.5px;
  font-weight: 800;
}

.incidencias-modal-history-section {
  scroll-margin-block: 24px;
}

/* Composer: caret visible + plus with a clearer premium accent. */
.incidencias-modal-comment-textarea {
  color: var(--idm-text-strong);
  caret-color: var(--idm-info);
}

.incidencias-modal-comment-textarea:focus {
  caret-color:
    color-mix(
      in srgb,
      var(--idm-info) 78%,
      white 22%
    );
}

.incidencias-modal-comment-textarea::selection {
  background:
    color-mix(
      in srgb,
      var(--idm-info) 28%,
      transparent
    );

  color: var(--idm-text-strong);
}

.incidencias-modal-composer-icon {
  border-color:
    color-mix(
      in srgb,
      var(--idm-info) 64%,
      var(--idm-border-soft)
    );

  background:
    linear-gradient(
      145deg,
      color-mix(
        in srgb,
        var(--idm-info) 38%,
        var(--idm-control)
      ),
      color-mix(
        in srgb,
        var(--idm-accent) 30%,
        var(--idm-control)
      )
    );

  color:
    color-mix(
      in srgb,
      var(--idm-info) 48%,
      white 52%
    );

  box-shadow:
    0 9px 26px
      color-mix(
        in srgb,
        var(--idm-info) 20%,
        transparent
      ),
    inset 0 1px 0 rgba(255, 255, 255, .14);
}

.incidencias-modal-composer-icon > svg {
  stroke-width: 2.55;
}

/* Admin attachment delete action. */
.incidencias-modal-attachment-actions {
  flex-wrap: wrap;
}

.incidencias-modal-delete-btn {
  appearance: none;

  min-block-size: 38px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;

  padding: 8px 11px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--idm-error) 28%,
      var(--idm-border-subtle)
    );

  border-radius: 11px;

  background:
    color-mix(
      in srgb,
      var(--idm-error) 5%,
      var(--idm-control)
    );

  color:
    color-mix(
      in srgb,
      var(--idm-error) 70%,
      var(--idm-text-soft)
    );

  font: inherit;
  font-size: 11.5px;
  font-weight: 760;
  line-height: 1;

  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  box-shadow: var(--idm-shadow-control);

  transition:
    border-color var(--idm-duration) var(--idm-ease),
    background var(--idm-duration) var(--idm-ease),
    color var(--idm-duration) var(--idm-ease),
    box-shadow var(--idm-duration) var(--idm-ease),
    transform var(--idm-duration) var(--idm-ease),
    opacity var(--idm-duration) var(--idm-ease);
}

.incidencias-modal-delete-btn:hover:not(:disabled) {
  border-color:
    color-mix(
      in srgb,
      var(--idm-error) 62%,
      var(--idm-border-soft)
    );

  background:
    color-mix(
      in srgb,
      var(--idm-error) 12%,
      var(--idm-control)
    );

  color: var(--idm-text-strong);
  transform: translateY(-1px);

  box-shadow:
    var(--idm-shadow-control),
    0 8px 22px
      color-mix(
        in srgb,
        var(--idm-error) 12%,
        transparent
      );
}

.incidencias-modal-delete-btn:active:not(:disabled) {
  transform: translateY(0) scale(.985);
}

.incidencias-modal-delete-btn:focus-visible {
  outline: none;
  box-shadow: var(--idm-focus);
}

.incidencias-modal-delete-btn:disabled {
  cursor: not-allowed;
  opacity: .5;
  transform: none;
}

@media (max-width: 760px) {
  .incidencias-modal-history-jump-btn {
    inline-size: 42px;
    min-inline-size: 42px;
    block-size: 42px;
    min-block-size: 42px;
    padding: 0;
  }

  .incidencias-modal-history-jump-label,
  .incidencias-modal-history-jump-count {
    display: none;
  }

  .incidencias-modal-attachment-actions {
    justify-content: flex-start;
  }
}

'''

css_marker = '/* =========================================================\n   RESPONSIVE · TABLET\n========================================================= */\n'
c = insert_before_once(c, css_marker, v23_css, 'css v23 section')

if '!important' in c:
    raise SystemExit('CSS contract violated: !important found')

write(CSS, c)

print('Patched Incidencias final UX successfully')
