from pathlib import Path
import re

INDEX = Path('src/views/incidencias/index.js')
TEMPLATE = Path('src/views/incidencias/incidencias.template.modal.js')
CSS = Path('src/css/views/incidencias/detail.css')


def ro(path):
    return path.read_text(encoding='utf-8')


def wr(path, text):
    path.write_text(text, encoding='utf-8')


def one(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


def before(text, marker, addition, label):
    count = text.count(marker)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 marker, got {count}')
    return text.replace(marker, addition + marker, 1)


# ==========================================================
# TEMPLATE
# ==========================================================
t = ro(TEMPLATE)
t = one(t, '  "incidencias.template.modal.extreme.v26.final-polish";', '  "incidencias.template.modal.extreme.v28.close-confirm-loader";', 'template version')
t = one(t, '  TICKET_CLOSE: "detail-ticket-close",\n  HISTORY_TOGGLE: "detail-history-toggle",', '  TICKET_CLOSE: "detail-ticket-close",\n  TICKET_CLOSE_CONFIRM: "detail-ticket-close-confirm",\n  TICKET_CLOSE_CANCEL: "detail-ticket-close-cancel",\n  HISTORY_TOGGLE: "detail-history-toggle",', 'detail actions')
t = one(t, '    trash:\n      `<svg ${common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>`,\n\n    chevronDown:', '    trash:\n      `<svg ${common}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>`,\n\n    alertTriangle:\n      `<svg ${common}><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,\n\n    chevronDown:', 'alert icon')
t = one(t, '    submitting:\n      data.submitting === true,\n\n    commentDraft,', '    submitting:\n      data.submitting === true,\n\n    operation:\n      cleanText(data.operation, ""),\n\n    closeConfirmOpen:\n      data.closeConfirmOpen === true,\n\n    commentDraft,', 'vm close state')

confirm_renderer = '''
function renderCloseConfirmation(vm = {}) {
  if (!vm.closeConfirmOpen) {
    return "";
  }

  return `
    <div
      class="incidencias-modal-confirm-overlay"
      data-detail-close-confirm-overlay="true"
    >
      <section
        class="incidencias-modal-confirm-dialog"
        data-detail-close-confirm-dialog="true"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="incidencias-close-confirm-title"
        aria-describedby="incidencias-close-confirm-description"
        tabindex="-1"
      >
        <div class="incidencias-modal-confirm-icon" aria-hidden="true">
          ${icon("alertTriangle")}
        </div>

        <div class="incidencias-modal-confirm-copy">
          <span class="incidencias-modal-confirm-eyebrow">Confirmar cierre</span>
          <h3 id="incidencias-close-confirm-title">¿Cerrar esta incidencia?</h3>
          <p id="incidencias-close-confirm-description">
            La incidencia pasará a estado cerrado. Podrás volver a abrirla
            más adelante enviando una nueva actualización.
          </p>

          ${
            vm.hasDraft
              ? `<div class="incidencias-modal-confirm-warning" role="note">Tienes una actualización sin enviar. Si confirmas el cierre, ese borrador se descartará cuando se cierre esta ventana.</div>`
              : ""
          }
        </div>

        <div class="incidencias-modal-confirm-actions">
          <button
            type="button"
            class="incidencias-modal-confirm-btn incidencias-modal-confirm-btn--cancel"
            data-detail-action="${DETAIL_ACTIONS.TICKET_CLOSE_CANCEL}"
          >Cancelar</button>

          <button
            type="button"
            class="incidencias-modal-confirm-btn incidencias-modal-confirm-btn--danger"
            data-detail-action="${DETAIL_ACTIONS.TICKET_CLOSE_CONFIRM}"
          >
            <span class="incidencias-modal-confirm-btn-icon" aria-hidden="true">${icon("check")}</span>
            <span>Sí, cerrar incidencia</span>
          </button>
        </div>
      </section>
    </div>
  `;
}

'''
t = before(t, 'function renderLoadingOverlay(', confirm_renderer, 'confirm renderer')
t = one(t, '      data-submitting="${vm.submitting ? "true" : "false"}"\n      data-has-draft="${vm.hasDraft ? "true" : "false"}"', '      data-submitting="${vm.submitting ? "true" : "false"}"\n      data-operation="${attr(vm.operation)}"\n      data-close-confirm-open="${vm.closeConfirmOpen ? "true" : "false"}"\n      data-has-draft="${vm.hasDraft ? "true" : "false"}"', 'root attrs')
t = one(t, '''          ${
            vm.submitting
              ? renderLoadingOverlay(
                  "Actualizando incidencia..."
                )
              : ""
          }

          <header''', '''          ${renderCloseConfirmation(vm)}

          ${
            vm.submitting
              ? renderLoadingOverlay(
                  vm.operation === "close"
                    ? "Cerrando incidencia..."
                    : "Actualizando incidencia..."
                )
              : ""
          }

          <header''', 'confirm + close loader')
wr(TEMPLATE, t)


# ==========================================================
# INDEX
# ==========================================================
i = ro(INDEX)
i = one(i, '  "incidencias.index.extreme.v25.history-mode";', '  "incidencias.index.extreme.v28.close-confirm-loader";', 'index version')
i = one(i, 'const DETAIL_PREVIEW_CLOSE_SELECTOR =\n  `[data-detail-action="${DETAIL_ACTIONS.PREVIEW_CLOSE}"]`;\n\nconst FOCUSABLE_SELECTOR', 'const DETAIL_PREVIEW_CLOSE_SELECTOR =\n  `[data-detail-action="${DETAIL_ACTIONS.PREVIEW_CLOSE}"]`;\n\nconst DETAIL_CLOSE_CONFIRM_SELECTOR =\n  "[data-detail-close-confirm-dialog=\'true\']";\n\nconst FOCUSABLE_SELECTOR', 'confirm selector')
i = one(i, '    submitting: false,\n\n    commentDraft: "",', '    submitting: false,\n    operation: "",\n    closeConfirmOpen: false,\n\n    commentDraft: "",', 'detail state')
i = one(i, '''    if (detailModal.open) {
      return modalHost.querySelector(
        DETAIL_MODAL_PANEL_SELECTOR
      );
    }
''', '''    if (detailModal.open) {
      if (detailModal.closeConfirmOpen) {
        return (
          modalHost.querySelector(DETAIL_CLOSE_CONFIRM_SELECTOR) ||
          modalHost.querySelector(DETAIL_MODAL_PANEL_SELECTOR)
        );
      }

      return modalHost.querySelector(
        DETAIL_MODAL_PANEL_SELECTOR
      );
    }
''', 'focus trap confirm')

sync_confirm = '''
  function syncDetailCloseConfirmOverlay(
    currentRoot = null,
    nextRoot = null
  ) {
    const currentPanel =
      currentRoot?.querySelector?.(
        DETAIL_MODAL_PANEL_SELECTOR
      );

    const nextPanel =
      nextRoot?.querySelector?.(
        DETAIL_MODAL_PANEL_SELECTOR
      );

    if (!currentPanel || !nextPanel) {
      return false;
    }

    try {
      currentPanel
        .querySelectorAll(
          ":scope > .incidencias-modal-confirm-overlay"
        )
        .forEach((node) => node.remove());

      const nextOverlay =
        nextPanel.querySelector(
          ":scope > .incidencias-modal-confirm-overlay"
        );

      if (nextOverlay) {
        currentPanel.insertBefore(
          nextOverlay.cloneNode(true),
          currentPanel.firstChild
        );
      }

      return true;
    } catch {
      return false;
    }
  }

'''
i = before(i, '  function syncDetailLoadingOverlay(', sync_confirm, 'sync confirm overlay')
i = one(i, '''      syncDetailLoadingOverlay(
        currentRoot,
        nextRoot
      );

      if (
''', '''      syncDetailCloseConfirmOverlay(
        currentRoot,
        nextRoot
      );

      syncDetailLoadingOverlay(
        currentRoot,
        nextRoot
      );

      if (
''', 'patch confirm overlay')
i = one(i, '    detailModal.submitting = false;\n\n    detailModal.commentDraft = "";', '    detailModal.submitting = false;\n    detailModal.operation = "";\n    detailModal.closeConfirmOpen = false;\n\n    detailModal.commentDraft = "";', 'reset close state')
open_old = '      detailModal.submitting = false;\n      detailModal.commentDraft = "";'
open_new = '      detailModal.submitting = false;\n      detailModal.operation = "";\n      detailModal.closeConfirmOpen = false;\n      detailModal.commentDraft = "";'
if i.count(open_old) != 2:
    raise SystemExit(f'open resets expected 2, got {i.count(open_old)}')
i = i.replace(open_old, open_new, 2)

i = one(i, '    detailModal.submitting = true;\n    detailModal.feedbackMessage = "";\n    detailModal.feedbackType = "info";\n\n    renderModals({\n      immediate: true,\n    });\n\n    let nextDetail =', '    detailModal.submitting = true;\n    detailModal.operation = "update";\n    detailModal.closeConfirmOpen = false;\n    detailModal.feedbackMessage = "";\n    detailModal.feedbackType = "info";\n\n    renderModals({\n      immediate: true,\n    });\n\n    let nextDetail =', 'update operation start')

submit_start = i.find('  async function submitDetailUpdate()')
submit_end = i.find('  function openDetailHistory()', submit_start)
if submit_start < 0 or submit_end < 0:
    raise SystemExit('submit update bounds not found')
segment = i[submit_start:submit_end]
segment = one(segment, '      detailModal.submitting = false;\n      detailModal.detail = nextDetail;', '      detailModal.submitting = false;\n      detailModal.operation = "";\n      detailModal.detail = nextDetail;', 'update operation success')
segment = one(segment, '      detailModal.submitting = false;\n\n      /*\n         Conservamos cualquier resultado confirmado.\n      */', '      detailModal.submitting = false;\n      detailModal.operation = "";\n\n      /*\n         Conservamos cualquier resultado confirmado.\n      */', 'update operation catch')
i = i[:submit_start] + segment + i[submit_end:]

close_start = i.find('  async function closeDetailTicket() {')
close_end = i.find('  /* =======================================================\n     ATTACHMENTS', close_start)
if close_start < 0 or close_end < 0:
    raise SystemExit('close flow bounds not found')

close_flow = '''  function ticketIsAlreadyClosed() {
    const status =
      cleanText(
        first(
          detailModal.detail?.status,
          detailModal.detail?.estado,
          detailModal.detail?.statusKey,
          detailModal.detail?.lifecycle?.status,
          ""
        ),
        ""
      )
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "");

    return [
      "closed",
      "resolved",
      "cerrada",
      "cerrado",
      "resuelta",
      "resuelto",
    ].includes(status);
  }

  function closeDetailTicket() {
    if (
      !detailModal.open ||
      detailModal.submitting ||
      ticketIsAlreadyClosed()
    ) {
      return false;
    }

    if (!getTicketId(detailModal.detail)) {
      return false;
    }

    detailModal.closeConfirmOpen = true;
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    renderModals({
      immediate: true,
      focusSelector:
        `[data-detail-action="${DETAIL_ACTIONS.TICKET_CLOSE_CONFIRM}"]`,
    });

    return true;
  }

  function cancelDetailTicketClose() {
    if (
      !detailModal.open ||
      detailModal.submitting ||
      !detailModal.closeConfirmOpen
    ) {
      return false;
    }

    detailModal.closeConfirmOpen = false;

    renderModals({
      immediate: true,
      focusSelector:
        `[data-detail-action="${DETAIL_ACTIONS.TICKET_CLOSE}"]`,
    });

    return true;
  }

  async function confirmDetailTicketClose() {
    if (
      !detailModal.open ||
      detailModal.submitting ||
      !detailModal.closeConfirmOpen ||
      ticketIsAlreadyClosed()
    ) {
      return false;
    }

    const ticketId =
      getTicketId(detailModal.detail);

    if (!ticketId) {
      return false;
    }

    detailModal.closeConfirmOpen = false;
    detailModal.submitting = true;
    detailModal.operation = "close";
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    renderModals({
      immediate: true,
    });

    try {
      const closed =
        await closeIncidencia(ticketId);

      const nextDetail =
        mergeTicketData(
          detailModal.detail || {},
          closed || {}
        );

      items =
        upsertByTicketId(
          items,
          nextDetail
        );

      render({
        skipModals: true,
      });

      detailModal.submitting = false;
      detailModal.operation = "";

      resetDetailModal();

      renderModals({
        immediate: true,
      });

      restoreModalReturnFocus();
      return true;
    } catch (closeError) {
      detailModal.submitting = false;
      detailModal.operation = "";
      detailModal.closeConfirmOpen = false;
      detailModal.feedbackMessage =
        safeError(
          closeError,
          "No se pudo cerrar la incidencia."
        );
      detailModal.feedbackType = "error";

      renderModals({
        immediate: true,
        focusSelector:
          DETAIL_MODAL_PANEL_SELECTOR,
      });

      return false;
    }
  }

'''
i = i[:close_start] + close_flow + i[close_end:]
i = one(i, '''  function closeDetailModal(
    options = {}
  ) {
    if (
      detailModal.submitting
    ) {
      return false;
    }

    const force =''', '''  function closeDetailModal(
    options = {}
  ) {
    if (
      detailModal.submitting
    ) {
      return false;
    }

    if (
      detailModal.closeConfirmOpen &&
      options.force !== true
    ) {
      return cancelDetailTicketClose();
    }

    const force =''', 'close modal confirm first')
i = one(i, '''    if (
      type ===
      DETAIL_ACTIONS.TICKET_CLOSE
    ) {
      return closeDetailTicket();
    }

    if (
      type ===
      DETAIL_ACTIONS.HISTORY_REVEAL''', '''    if (
      type ===
      DETAIL_ACTIONS.TICKET_CLOSE
    ) {
      return closeDetailTicket();
    }

    if (
      type ===
      DETAIL_ACTIONS.TICKET_CLOSE_CANCEL
    ) {
      return cancelDetailTicketClose();
    }

    if (
      type ===
      DETAIL_ACTIONS.TICKET_CLOSE_CONFIRM
    ) {
      return confirmDetailTicketClose();
    }

    if (
      type ===
      DETAIL_ACTIONS.HISTORY_REVEAL''', 'close action dispatch')
i = one(i, '''        if (
          detailModal.previewFile
        ) {
          closePreview();
          return;
        }

        closeDetailModal();''', '''        if (
          detailModal.closeConfirmOpen
        ) {
          cancelDetailTicketClose();
          return;
        }

        if (
          detailModal.previewFile
        ) {
          closePreview();
          return;
        }

        closeDetailModal();''', 'escape confirm first')
wr(INDEX, i)


# ==========================================================
# CSS
# ==========================================================
c = ro(CSS)
c = one(c, '   PRODUCTIVO · V27 · PRO LOADING SPINNER', '   PRODUCTIVO · V28 · CLOSE CONFIRM · CLOSE LOADER', 'css version')

confirm_css = '''/* =========================================================
   CLOSE CONFIRMATION
========================================================= */

.incidencias-modal-confirm-overlay {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: clamp(18px, 3vw, 34px);
  background: color-mix(in srgb, var(--idm-panel) 76%, transparent);
  backdrop-filter: blur(10px) saturate(1.05);
  -webkit-backdrop-filter: blur(10px) saturate(1.05);
}

.incidencias-modal-confirm-dialog {
  inline-size: min(440px, 100%);
  min-inline-size: 0;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 18px 16px;
  padding: clamp(20px, 2.4vw, 28px);
  border: 1px solid color-mix(in srgb, var(--idm-error) 34%, var(--idm-border-soft));
  border-radius: clamp(18px, 2vw, 22px);
  background:
    radial-gradient(circle at 0 0, color-mix(in srgb, var(--idm-error) 8%, transparent), transparent 42%),
    linear-gradient(155deg, color-mix(in srgb, var(--idm-panel-elevated) 97%, #fff 3%), var(--idm-panel-elevated));
  color: var(--idm-text);
  box-shadow:
    0 30px 80px rgba(0, 0, 0, .42),
    0 8px 28px rgba(0, 0, 0, .22),
    inset 0 1px 0 rgba(255, 255, 255, .075);
  outline: none;
}

.incidencias-modal-confirm-dialog:focus-visible {
  box-shadow:
    0 30px 80px rgba(0, 0, 0, .42),
    var(--idm-focus);
}

.incidencias-modal-confirm-icon {
  inline-size: 52px;
  block-size: 52px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--idm-error) 46%, var(--idm-border-soft));
  border-radius: 16px;
  background: color-mix(in srgb, var(--idm-error) 12%, var(--idm-control));
  color: color-mix(in srgb, var(--idm-error) 82%, white 18%);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--idm-error) 12%, transparent);
}

.incidencias-modal-confirm-icon > svg {
  inline-size: 24px;
  block-size: 24px;
}

.incidencias-modal-confirm-copy {
  min-inline-size: 0;
  display: grid;
  gap: 8px;
}

.incidencias-modal-confirm-eyebrow {
  color: color-mix(in srgb, var(--idm-error) 68%, var(--idm-text-muted));
  font-size: 10px;
  font-weight: 820;
  line-height: 1;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.incidencias-modal-confirm-copy h3 {
  margin: 0;
  color: var(--idm-text-strong);
  font-size: clamp(18px, 2vw, 22px);
  font-weight: 850;
  line-height: 1.15;
  letter-spacing: -.025em;
}

.incidencias-modal-confirm-copy p {
  margin: 0;
  color: var(--idm-text-soft);
  font-size: 12.5px;
  font-weight: 560;
  line-height: 1.55;
}

.incidencias-modal-confirm-warning {
  margin-block-start: 4px;
  padding: 10px 11px;
  border: 1px solid color-mix(in srgb, var(--idm-warning) 30%, var(--idm-border-subtle));
  border-radius: 11px;
  background: color-mix(in srgb, var(--idm-warning) 7%, transparent);
  color: color-mix(in srgb, var(--idm-warning) 56%, var(--idm-text-soft));
  font-size: 11px;
  font-weight: 650;
  line-height: 1.45;
}

.incidencias-modal-confirm-actions {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  padding-block-start: 2px;
}

.incidencias-modal-confirm-btn {
  appearance: none;
  min-block-size: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--idm-border-soft);
  border-radius: 12px;
  background: var(--idm-control);
  color: var(--idm-text-soft);
  font: inherit;
  font-size: 11.5px;
  font-weight: 780;
  line-height: 1;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  box-shadow: var(--idm-shadow-control);
  transition:
    border-color var(--idm-duration) var(--idm-ease),
    background var(--idm-duration) var(--idm-ease),
    color var(--idm-duration) var(--idm-ease),
    box-shadow var(--idm-duration) var(--idm-ease),
    transform var(--idm-duration) var(--idm-ease);
}

.incidencias-modal-confirm-btn:hover {
  transform: translateY(-1px);
}

.incidencias-modal-confirm-btn:active {
  transform: translateY(0) scale(.985);
}

.incidencias-modal-confirm-btn:focus-visible {
  outline: none;
  box-shadow: var(--idm-shadow-control), var(--idm-focus);
}

.incidencias-modal-confirm-btn--cancel:hover {
  border-color: color-mix(in srgb, var(--idm-info) 36%, var(--idm-border-soft));
  background: color-mix(in srgb, var(--idm-info) 6%, var(--idm-control-hover));
  color: var(--idm-text-strong);
}

.incidencias-modal-confirm-btn--danger {
  border-color: color-mix(in srgb, var(--idm-error) 56%, var(--idm-border-soft));
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--idm-error) 17%, var(--idm-control)),
      color-mix(in srgb, var(--idm-error) 9%, var(--idm-control))
    );
  color: color-mix(in srgb, var(--idm-error) 72%, white 28%);
}

.incidencias-modal-confirm-btn--danger:hover {
  border-color: color-mix(in srgb, var(--idm-error) 78%, var(--idm-border-soft));
  background: color-mix(in srgb, var(--idm-error) 20%, var(--idm-control-hover));
  color: #fff;
  box-shadow:
    var(--idm-shadow-control),
    0 10px 28px color-mix(in srgb, var(--idm-error) 14%, transparent);
}

.incidencias-modal-confirm-btn-icon {
  inline-size: 16px;
  block-size: 16px;
  display: inline-grid;
  place-items: center;
}

.incidencias-modal-confirm-btn-icon > svg {
  inline-size: 16px;
  block-size: 16px;
}

@media (max-width: 560px) {
  .incidencias-modal-confirm-dialog {
    grid-template-columns: 1fr;
  }

  .incidencias-modal-confirm-icon {
    inline-size: 46px;
    block-size: 46px;
  }

  .incidencias-modal-confirm-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .incidencias-modal-confirm-btn {
    inline-size: 100%;
  }
}

'''
c = before(c, '/* =========================================================\n   LOADING OVERLAY\n========================================================= */', confirm_css, 'confirm css')
if re.search(r':\s*[^;{}\n]*!\s*important\b', c, flags=re.I):
    raise SystemExit('!important declaration found')
wr(CSS, c)

print('close confirm patch applied')
