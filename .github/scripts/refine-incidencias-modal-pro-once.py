from pathlib import Path

ROOT = Path("src/views/incidencias")
CSS = Path("src/css/views/incidencias/detail.css")


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")
    print(f"updated {path}: {len(text.encode('utf-8'))} bytes")


def rep(text, old, new, label, count=1):
    actual = text.count(old)
    if actual != count:
        raise RuntimeError(f"{label}: expected {count}, got {actual}")
    return text.replace(old, new, count)


# =========================================================
# API: close ticket through canonical PATCH /api/tickets/:id
# =========================================================
api_path = ROOT / "incidencias.api.js"
s = read(api_path)

s = rep(
    s,
    'export const INCIDENCIAS_API_VERSION = "incidencias.api.extreme.v20";',
    'export const INCIDENCIAS_API_VERSION = "incidencias.api.extreme.v21.manual-close";',
    "api version",
)

anchor = '''export async function updateIncidencia(id = "", payload = {}, options = {}) {
  const updated = await updateIncidenciaRequest(id, payload, options);
  return updated ? upsertCachedIncidencia(updated) : null;
}

export async function commentIncidenciaRequest'''
replacement = '''export async function updateIncidencia(id = "", payload = {}, options = {}) {
  const updated = await updateIncidenciaRequest(id, payload, options);
  return updated ? upsertCachedIncidencia(updated) : null;
}

export async function closeIncidenciaRequest(
  id = "",
  { timeout = INCIDENCIAS_TIMEOUT, signal } = {}
) {
  const closed = await updateIncidenciaRequest(
    id,
    { status: "closed", estado: "closed" },
    { timeout, signal }
  );

  if (closed) return closed;

  /*
    Compatibilidad con backends que confirman PATCH con 204/sin body:
    sólo en ese caso refrescamos el detalle para no inventar timestamps
    ni estado local. El camino normal sigue siendo una única petición.
  */
  return getIncidenciaByIdRequest(id, {
    timeout: Math.max(timeout, INCIDENCIAS_DETAIL_TIMEOUT),
    force: true,
    cache: false,
    signal,
  });
}

export async function closeIncidencia(id = "", options = {}) {
  const closed = await closeIncidenciaRequest(id, options);
  return closed ? upsertCachedIncidencia(closed) : null;
}

export async function commentIncidenciaRequest'''
s = rep(s, anchor, replacement, "api manual close")
write(api_path, s)


# =========================================================
# DETAIL TEMPLATE: category label, close action, lazy history
# =========================================================
modal_path = ROOT / "incidencias.template.modal.js"
s = read(modal_path)

s = rep(
    s,
    '"incidencias.template.modal.extreme.v20.preview-sas-safe";',
    '"incidencias.template.modal.extreme.v21.pro-close-history";',
    "modal version",
)

s = rep(
    s,
    '''  COMMENT_SUBMIT: "detail-submit-update",
  COMMENT_CHANGE: "detail-comment-change",

  ATTACHMENTS_ADD:''',
    '''  COMMENT_SUBMIT: "detail-submit-update",
  COMMENT_CHANGE: "detail-comment-change",
  TICKET_CLOSE: "detail-ticket-close",
  HISTORY_TOGGLE: "detail-history-toggle",

  ATTACHMENTS_ADD:''',
    "modal actions",
)

normalize_anchor = '''function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\\u0300-\\u036f]/g,
      ""
    )
    .replace(/[\\s-]+/g, "_")
    .replace(/[^\\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}
'''
normalize_replacement = normalize_anchor + '''
function displayLabel(value = "", fallback = "") {
  const text = cleanText(value, fallback)
    .replace(/[_-]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();

  if (!text) return fallback;

  return text
    .split(" ")
    .map((word) =>
      word
        ? `${word.charAt(0).toLocaleUpperCase("es-ES")}${word.slice(1)}`
        : ""
    )
    .join(" ");
}
'''
s = rep(s, normalize_anchor, normalize_replacement, "display label helper")

s = rep(
    s,
    '''    plus:
      `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,

    ticket:''',
    '''    plus:
      `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,

    check:
      `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,

    history:
      `<svg ${common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>`,

    chevronDown:
      `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,

    ticket:''',
    "modal icons",
)

s = rep(
    s,
    '''    requiresReopen:
      statusWillReopen(
        status
      ),

    feedbackMessage:''',
    '''    requiresReopen:
      statusWillReopen(
        status
      ),

    canCloseTicket:
      !statusWillReopen(
        status
      ),

    historyOpen:
      data.historyOpen === true,

    feedbackMessage:''',
    "modal vm close/history",
)

id_chip_anchor = '''function renderChip(
  label = "",
  modifier = "neutral"
) {'''
header_actions = '''function renderHeaderActions(vm = {}) {
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
s = rep(s, id_chip_anchor, header_actions + id_chip_anchor, "header actions helper")

# Count timeline cheaply without normalizing/sorting a potentially huge history.
build_vm_anchor = '''/* =========================================================
   VIEW MODEL
========================================================= */

function buildVm(input = {}) {'''
count_helper = '''function getTimelineCount(detail = {}) {
  const raw = getRaw(detail);
  const direct = safeArray(first(detail.timeline, raw.timeline, []));
  if (direct.length) return direct.length;

  const history = safeArray(
    first(
      detail.history,
      detail.events,
      raw.history,
      raw.events,
      []
    )
  );

  const comments = safeArray(
    first(
      detail.comments,
      detail.notes,
      detail.messages,
      raw.comments,
      raw.notes,
      raw.messages,
      []
    )
  );

  return history.length + comments.length;
}

'''
s = rep(s, build_vm_anchor, count_helper + build_vm_anchor, "timeline cheap count")

render_timeline_end = '''function renderTimeline(
  detail = {}
) {'''
# We leave renderTimeline unchanged and insert disclosure immediately before TEMPLATE marker.
template_marker = '''/* =========================================================
   TEMPLATE
========================================================= */'''
history_section = '''function renderHistorySection(vm = {}) {
  const count = getTimelineCount(vm.detail);
  const open = vm.historyOpen === true;
  const countLabel = count
    ? `${count} registro${count === 1 ? "" : "s"}`
    : "Sin actividad registrada";

  return `
    <section
      class="incidencias-modal-history-section"
      data-modal-history-slot="true"
      data-history-open="${open ? "true" : "false"}"
      aria-labelledby="incidencias-modal-history-title"
    >
      <button
        type="button"
        class="incidencias-modal-history-toggle"
        data-detail-action="${DETAIL_ACTIONS.HISTORY_TOGGLE}"
        aria-expanded="${open ? "true" : "false"}"
        aria-controls="incidencias-modal-history-content"
        ${disabledAttrs(vm.submitting, vm.submitting)}
      >
        <span class="incidencias-modal-history-toggle-icon" aria-hidden="true">
          ${icon("history")}
        </span>

        <span class="incidencias-modal-history-toggle-copy">
          <strong id="incidencias-modal-history-title">
            Historial y actividad
          </strong>
          <small>${escapeHtml(countLabel)}</small>
        </span>

        <span class="incidencias-modal-history-toggle-action">
          <span>${open ? "Ocultar" : "Ver historial"}</span>
          <span class="incidencias-modal-history-chevron" aria-hidden="true">
            ${icon("chevronDown")}
          </span>
        </span>
      </button>

      ${
        open
          ? `
            <div
              id="incidencias-modal-history-content"
              class="incidencias-modal-history-content"
            >
              ${renderTimeline(vm.detail)}
            </div>
          `
          : ""
      }
    </section>
  `;
}

'''
s = rep(s, template_marker, history_section + template_marker, "history disclosure")

s = rep(
    s,
    '''                  ${renderChip(
                    category,
                    "category"
                  )}''',
    '''                  ${renderChip(
                    displayLabel(category, "General"),
                    "category"
                  )}''',
    "category display label",
)

old_close = '''            <button
              type="button"
              data-detail-action="${DETAIL_ACTIONS.CLOSE}"
              aria-label="Cerrar modal"
              ${disabledAttrs(
                vm.submitting,
                vm.submitting
              )}
              class="incidencias-modal-close-btn"
            >${icon("close")}</button>'''
s = rep(s, old_close, '''            ${renderHeaderActions(vm)}''', "header action render")

old_history = '''            <section
              class="incidencias-modal-history-section"
              data-modal-history-slot="true"
              aria-labelledby="incidencias-modal-history-title"
            >
              <div class="incidencias-modal-section-head">
                <h3 id="incidencias-modal-history-title">
                  Historial y actividad
                </h3>
              </div>

              ${renderTimeline(detail)}
            </section>'''
s = rep(s, old_history, '''            ${renderHistorySection(vm)}''', "lazy history render")

s = rep(
    s,
    '''      submitActionNearComposer:
        true,

      explicitReopenCopy:''',
    '''      submitActionNearComposer:
        true,

      manualTicketClose:
        true,

      historyCollapsedByDefault:
        true,

      historyLazyRender:
        true,

      categoryDisplayTitleCase:
        true,

      explicitReopenCopy:''',
    "modal snapshot policies",
)
write(modal_path, s)


# =========================================================
# INDEX: controller state/actions for close + lazy history
# =========================================================
index_path = ROOT / "index.js"
s = read(index_path)

s = rep(
    s,
    '''  commentIncidencia,
  reopenIncidencia,
  uploadIncidenciaAttachments,''',
    '''  commentIncidencia,
  reopenIncidencia,
  closeIncidencia,
  uploadIncidenciaAttachments,''',
    "index close import",
)

s = rep(
    s,
    '"incidencias.index.extreme.v20";',
    '"incidencias.index.extreme.v21.pro-close-history";',
    "index version",
)

# Make header status/actions authoritative after mutations without full modal rerender.
s = rep(
    s,
    '''          "[data-modal-feedback-slot='true']",
          "[data-modal-preview-slot='true']",
          ".incidencias-modal-meta-grid",''',
    '''          "[data-modal-feedback-slot='true']",
          "[data-modal-preview-slot='true']",
          "[data-modal-header-chips='true']",
          "[data-modal-header-actions='true']",
          "[data-modal-updated='true']",
          ".incidencias-modal-meta-grid",''',
    "index header patch selectors",
)

s = rep(
    s,
    '''    previewFile: null,
  };''',
    '''    previewFile: null,
    historyOpen: false,
  };''',
    "detail state history",
)

# resetDetailModal
s = rep(
    s,
    '''    detailModal.previewFile = null;

    openingTicketId = "";''',
    '''    detailModal.previewFile = null;
    detailModal.historyOpen = false;

    openingTicketId = "";''',
    "reset history",
)

# Two openDetail initialization paths.
s = rep(
    s,
    '''      detailModal.previewFile = null;

      render({''',
    '''      detailModal.previewFile = null;
      detailModal.historyOpen = false;

      render({''',
    "local open history",
)
s = rep(
    s,
    '''      detailModal.downloadingAttachmentId = "";
      detailModal.previewFile = null;

      if (mergedDetail) {''',
    '''      detailModal.downloadingAttachmentId = "";
      detailModal.previewFile = null;
      detailModal.historyOpen = false;

      if (mergedDetail) {''',
    "remote open history",
)

# Add helpers before attachments section, after submitDetailUpdate.
attachments_marker = '''  /* =======================================================
     ATTACHMENTS
  ======================================================= */'''
close_and_history = '''  function toggleDetailHistory() {
    if (
      !detailModal.open ||
      detailModal.submitting
    ) {
      return false;
    }

    detailModal.historyOpen =
      !detailModal.historyOpen;

    renderModals({
      immediate: true,
      focusSelector:
        `[data-detail-action="${DETAIL_ACTIONS.HISTORY_TOGGLE}"]`,
    });

    return true;
  }

  async function closeDetailTicket() {
    if (
      !detailModal.open ||
      detailModal.submitting
    ) {
      return false;
    }

    const ticketId =
      getTicketId(
        detailModal.detail
      );

    if (!ticketId) {
      return false;
    }

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

    if (
      [
        "closed",
        "resolved",
        "cerrada",
        "cerrado",
        "resuelta",
        "resuelto",
      ].includes(status)
    ) {
      return false;
    }

    if (
      isBrowser() &&
      typeof window.confirm === "function"
    ) {
      const draftCopy = detailHasDraft()
        ? "\n\nTienes una actualización sin enviar. Se conservará en pantalla; si la envías después, la incidencia se reabrirá."
        : "";

      const accepted = window.confirm(
        `¿Cerrar esta incidencia?${draftCopy}`
      );

      if (!accepted) {
        return false;
      }
    }

    detailModal.submitting = true;
    detailModal.feedbackMessage = "";
    detailModal.feedbackType = "info";

    renderModals({
      immediate: true,
    });

    try {
      const closed =
        await closeIncidencia(
          ticketId
        );

      const nextDetail =
        mergeTicketData(
          detailModal.detail || {},
          closed || {}
        );

      detailModal.submitting = false;
      detailModal.detail = nextDetail;
      detailModal.feedbackMessage =
        "Incidencia cerrada correctamente.";
      detailModal.feedbackType =
        "success";

      items =
        upsertByTicketId(
          items,
          nextDetail
        );

      render({
        skipModals: true,
      });

      renderModals({
        immediate: true,
        focusSelector:
          DETAIL_MODAL_PANEL_SELECTOR,
      });

      return true;
    } catch (closeError) {
      detailModal.submitting = false;
      detailModal.feedbackMessage =
        safeError(
          closeError,
          "No se pudo cerrar la incidencia."
        );
      detailModal.feedbackType =
        "error";

      renderModals({
        immediate: true,
        focusSelector:
          DETAIL_MODAL_PANEL_SELECTOR,
      });

      return false;
    }
  }

'''
s = rep(s, attachments_marker, close_and_history + attachments_marker, "index close/history handlers")

s = rep(
    s,
    '''    if (
      type ===
      DETAIL_ACTIONS.COMMENT_SUBMIT
    ) {
      return submitDetailUpdate();
    }

    if (
      type ===
      DETAIL_ACTIONS.PENDING_FILE_REMOVE''',
    '''    if (
      type ===
      DETAIL_ACTIONS.COMMENT_SUBMIT
    ) {
      return submitDetailUpdate();
    }

    if (
      type ===
      DETAIL_ACTIONS.TICKET_CLOSE
    ) {
      return closeDetailTicket();
    }

    if (
      type ===
      DETAIL_ACTIONS.HISTORY_TOGGLE
    ) {
      return toggleDetailHistory();
    }

    if (
      type ===
      DETAIL_ACTIONS.PENDING_FILE_REMOVE''',
    "index action routing",
)

s = rep(
    s,
    '''        detailPreviewOpen:
          Boolean(
            detailModal.previewFile
          ),

        attachmentPreviewBusy:''',
    '''        detailPreviewOpen:
          Boolean(
            detailModal.previewFile
          ),

        detailHistoryOpen:
          detailModal.historyOpen === true,

        attachmentPreviewBusy:''',
    "index snapshot history",
)

s = rep(
    s,
    '''          detailPartialSuccessAware: true,

          attachmentPreviewUsesApiViewContract:''',
    '''          detailPartialSuccessAware: true,
          detailManualClose: true,
          detailHistoryCollapsedByDefault: true,
          detailHistoryLazyRender: true,

          attachmentPreviewUsesApiViewContract:''',
    "index policy snapshot",
)
write(index_path, s)


# =========================================================
# CSS: premium composer, distinct manual close, lazy history
# =========================================================
s = read(CSS)

s = rep(
    s,
    "PRODUCTIVO · V16 · PREVIEW SAS SAFE · EXTREME UI",
    "PRODUCTIVO · V21 · PRO CLOSE · LAZY HISTORY · EXTREME UI",
    "css version banner",
)

# Include new controls in the existing button/focus/disabled system.
s = s.replace(
    ".incidencias-modal-close-btn,\n.incidencias-modal-id-chip,",
    ".incidencias-modal-close-btn,\n.incidencias-modal-close-ticket-btn,\n.incidencias-modal-history-toggle,\n.incidencias-modal-id-chip,",
)

# Insert the V21 refinement layer before responsive rules, so breakpoints remain authoritative.
responsive_marker = '''/* =========================================================
   RESPONSIVE · TABLET
========================================================= */'''
pro_css = r'''/* =========================================================
   V21 · PRO ACTION HIERARCHY
   - Close ticket is distinct from closing the window.
   - Update composer is the primary work area.
   - History is a lazy disclosure, collapsed by default.
========================================================= */

.incidencias-modal-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.incidencias-modal-close-ticket-btn {
  min-block-size: 44px;
  min-inline-size: 136px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  padding: 9px 13px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--idm-error) 34%,
      var(--idm-border-soft)
    );

  border-radius: 14px;

  background:
    color-mix(
      in srgb,
      var(--idm-error) 7%,
      var(--idm-control)
    );

  color:
    color-mix(
      in srgb,
      var(--idm-error) 76%,
      var(--idm-text-strong) 24%
    );

  font-size: 11.5px;
  font-weight: 780;
  line-height: 1;

  box-shadow:
    var(--idm-shadow-control);
}

.incidencias-modal-close-ticket-icon {
  inline-size: 18px;
  block-size: 18px;
  display: inline-grid;
  place-items: center;
}

.incidencias-modal-close-ticket-icon > svg {
  inline-size: 18px;
  block-size: 18px;
}

.incidencias-modal-close-ticket-btn:hover:not(:disabled) {
  border-color:
    color-mix(
      in srgb,
      var(--idm-error) 58%,
      var(--idm-border-soft)
    );

  background:
    color-mix(
      in srgb,
      var(--idm-error) 13%,
      var(--idm-control)
    );

  color:
    var(--idm-text-strong);

  transform:
    translateY(-1px);

  box-shadow:
    0 10px 24px
      color-mix(
        in srgb,
        var(--idm-error) 13%,
        transparent
      ),
    var(--idm-shadow-control);
}

.incidencias-modal-close-ticket-btn:active:not(:disabled) {
  transform:
    translateY(0)
    scale(.985);
}

/* ---------------------------------------------------------
   COMPOSER · clearer primary work surface
--------------------------------------------------------- */

.incidencias-modal-composer {
  overflow: hidden;

  padding:
    clamp(18px, 1.7vw, 24px);

  gap: 16px;

  border-color:
    color-mix(
      in srgb,
      var(--idm-accent) 42%,
      var(--idm-border-soft)
    );

  background:
    radial-gradient(
      circle at 0 0,
      color-mix(
        in srgb,
        var(--idm-accent) 12%,
        transparent
      ),
      transparent 38%
    ),
    linear-gradient(
      180deg,
      color-mix(
        in srgb,
        var(--idm-section) 96%,
        var(--idm-accent) 4%
      ),
      var(--idm-section)
    );

  box-shadow:
    0 18px 46px rgba(0, 0, 0, .16),
    0 0 0 1px
      color-mix(
        in srgb,
        var(--idm-accent) 7%,
        transparent
      ),
    inset 0 1px 0 rgba(255, 255, 255, .06);
}

.incidencias-modal-composer::before {
  content: "";
  position: absolute;
  inset-block-start: 0;
  inset-inline: 22px;
  block-size: 2px;

  border-radius: 999px;

  background:
    linear-gradient(
      90deg,
      transparent,
      color-mix(
        in srgb,
        var(--idm-accent-active) 78%,
        transparent
      ),
      transparent
    );

  pointer-events: none;
}

.incidencias-modal-composer-head {
  grid-template-columns:
    44px
    minmax(0, 1fr);

  gap: 13px;
}

.incidencias-modal-composer-icon {
  inline-size: 44px;
  block-size: 44px;

  border-color:
    color-mix(
      in srgb,
      var(--idm-accent-active) 62%,
      var(--idm-border-soft)
    );

  border-radius: 14px;

  background:
    linear-gradient(
      145deg,
      color-mix(
        in srgb,
        var(--idm-accent-active) 28%,
        var(--idm-control)
      ),
      color-mix(
        in srgb,
        var(--idm-accent) 14%,
        var(--idm-control)
      )
    );

  color:
    color-mix(
      in srgb,
      var(--idm-accent-active) 82%,
      white 18%
    );

  box-shadow:
    0 8px 22px
      color-mix(
        in srgb,
        var(--idm-accent) 18%,
        transparent
      ),
    inset 0 1px 0 rgba(255, 255, 255, .09);
}

.incidencias-modal-composer-icon > svg {
  inline-size: 21px;
  block-size: 21px;
  stroke-width: 2.35;
}

.incidencias-modal-composer-copy > h3 {
  font-size: 15px;
  font-weight: 830;
  letter-spacing: -.012em;
}

.incidencias-modal-composer-copy > span {
  max-inline-size: 720px;

  color:
    color-mix(
      in srgb,
      var(--idm-text-soft) 78%,
      var(--idm-text-muted)
    );

  font-size: 12px;
}

.incidencias-modal-comment-textarea {
  min-block-size: 150px;

  padding:
    15px
    16px;

  border-color:
    color-mix(
      in srgb,
      var(--idm-accent) 26%,
      var(--idm-border-soft)
    );

  background:
    color-mix(
      in srgb,
      var(--idm-control) 94%,
      var(--idm-panel-elevated) 6%
    );

  font-size: 13.5px;

  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .045),
    inset 0 0 0 1px rgba(0, 0, 0, .08),
    0 6px 18px rgba(0, 0, 0, .08);
}

.incidencias-modal-comment-textarea:focus {
  border-color:
    color-mix(
      in srgb,
      var(--idm-accent-active) 70%,
      var(--idm-border-soft)
    );

  background:
    color-mix(
      in srgb,
      var(--idm-control) 92%,
      var(--idm-accent) 8%
    );

  box-shadow:
    0 0 0 3px
      color-mix(
        in srgb,
        var(--idm-accent) 18%,
        transparent
      ),
    inset 0 1px 0 rgba(255, 255, 255, .05),
    0 10px 26px rgba(0, 0, 0, .1);
}

.incidencias-modal-comment-textarea::placeholder {
  color:
    color-mix(
      in srgb,
      var(--idm-text-muted) 88%,
      transparent
    );
}

.incidencias-modal-dropzone {
  min-block-size: 86px;

  border-color:
    color-mix(
      in srgb,
      var(--idm-accent) 46%,
      var(--idm-border-soft)
    );

  background:
    color-mix(
      in srgb,
      var(--idm-accent) 6%,
      var(--idm-control)
    );
}

.incidencias-modal-dropzone > span {
  color:
    color-mix(
      in srgb,
      var(--idm-accent-active) 78%,
      var(--idm-text-strong) 22%
    );
}

.incidencias-modal-footer--composer {
  align-items: center;
  justify-content: flex-end;

  padding-block-start: 2px;
}

.incidencias-modal-submit-btn {
  min-block-size: 48px;
  min-inline-size: 210px;

  padding:
    11px
    18px;

  font-size: 12.5px;
  letter-spacing: .005em;
}

/* ---------------------------------------------------------
   HISTORY · collapsed/lazy by default
--------------------------------------------------------- */

.incidencias-modal-history-section {
  overflow: hidden;
  padding: 0;
}

.incidencias-modal-history-toggle {
  inline-size: 100%;
  min-block-size: 72px;

  display: grid;
  grid-template-columns:
    40px
    minmax(0, 1fr)
    auto;

  align-items: center;
  gap: 12px;

  padding:
    14px
    17px;

  border-radius:
    calc(var(--idm-radius-section) - 1px);

  background:
    color-mix(
      in srgb,
      var(--idm-section) 95%,
      var(--idm-control) 5%
    );

  color:
    var(--idm-text);

  text-align: start;
}

.incidencias-modal-history-toggle:hover:not(:disabled) {
  background:
    color-mix(
      in srgb,
      var(--idm-accent) 6%,
      var(--idm-section)
    );
}

.incidencias-modal-history-toggle-icon {
  inline-size: 40px;
  block-size: 40px;

  display: grid;
  place-items: center;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--idm-accent) 30%,
      var(--idm-border-soft)
    );

  border-radius: 12px;

  background:
    color-mix(
      in srgb,
      var(--idm-accent) 8%,
      var(--idm-control)
    );

  color:
    var(--idm-accent-active);
}

.incidencias-modal-history-toggle-copy {
  min-inline-size: 0;
  display: grid;
  gap: 3px;
}

.incidencias-modal-history-toggle-copy > strong {
  color:
    var(--idm-text-strong);

  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
}

.incidencias-modal-history-toggle-copy > small {
  color:
    var(--idm-text-muted);

  font-size: 10.5px;
  font-weight: 620;
}

.incidencias-modal-history-toggle-action {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;

  color:
    var(--idm-text-soft);

  font-size: 11px;
  font-weight: 720;
  white-space: nowrap;
}

.incidencias-modal-history-chevron {
  inline-size: 18px;
  block-size: 18px;

  display: grid;
  place-items: center;

  transition:
    transform
      var(--idm-duration)
      var(--idm-ease);
}

.incidencias-modal-history-toggle[aria-expanded="true"]
  .incidencias-modal-history-chevron {
  transform:
    rotate(180deg);
}

.incidencias-modal-history-content {
  padding:
    0
    17px
    17px;

  border-top:
    1px solid
    var(--idm-border-subtle);

  background:
    color-mix(
      in srgb,
      var(--idm-section) 97%,
      transparent
    );
}

.incidencias-modal-history-content > .incidencias-timeline-list,
.incidencias-modal-history-content > .incidencias-timeline-empty {
  margin-block-start: 14px;
}

'''
s = rep(s, responsive_marker, pro_css + responsive_marker, "css pro block")

# Phone header can host both close-ticket and window-close buttons cleanly.
s = rep(
    s,
    '''  .incidencias-modal-header {
    grid-template-columns:
      minmax(0, 1fr)
      42px;''',
    '''  .incidencias-modal-header {
    grid-template-columns:
      minmax(0, 1fr)
      auto;''',
    "phone header columns",
)

phone_close_anchor = '''  .incidencias-modal-close-btn {
    inline-size: 42px;
    block-size: 42px;

    min-inline-size: 42px;
  }
'''
phone_close_replacement = phone_close_anchor + '''
  .incidencias-modal-header-actions {
    gap: 6px;
  }

  .incidencias-modal-close-ticket-btn {
    inline-size: 42px;
    min-inline-size: 42px;
    block-size: 42px;

    padding: 0;
  }

  .incidencias-modal-close-ticket-label {
    display: none;
  }
'''
s = rep(s, phone_close_anchor, phone_close_replacement, "phone close ticket")

phone_history_anchor = '''  .incidencias-timeline-card {
    padding:
      11px;
  }
}'''
phone_history_replacement = '''  .incidencias-modal-history-toggle {
    grid-template-columns:
      36px
      minmax(0, 1fr)
      auto;

    min-block-size: 66px;

    gap: 9px;

    padding:
      12px;
  }

  .incidencias-modal-history-toggle-icon {
    inline-size: 36px;
    block-size: 36px;

    border-radius: 10px;
  }

  .incidencias-modal-history-toggle-action > span:first-child {
    display: none;
  }

  .incidencias-modal-history-content {
    padding:
      0
      12px
      12px;
  }

  .incidencias-timeline-card {
    padding:
      11px;
  }
}'''
s = rep(s, phone_history_anchor, phone_history_replacement, "phone history")

# Forced colors and print include the new controls.
s = s.replace(
    "  .incidencias-modal-close-btn,\n  .incidencias-modal-id-chip,",
    "  .incidencias-modal-close-btn,\n  .incidencias-modal-close-ticket-btn,\n  .incidencias-modal-history-toggle,\n  .incidencias-modal-id-chip,",
)
s = s.replace(
    "  .incidencias-modal-close-btn,\n  .incidencias-modal-attachment-actions,",
    "  .incidencias-modal-close-btn,\n  .incidencias-modal-close-ticket-btn,\n  .incidencias-modal-attachment-actions,",
)

if "!important" in s.lower():
    raise RuntimeError("detail.css: !important is forbidden")

write(CSS, s)
print("incidencias modal pro refinement complete")
