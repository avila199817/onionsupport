from pathlib import Path
import re

INDEX = Path('src/views/incidencias/index.js')
TEMPLATE = Path('src/views/incidencias/incidencias.template.modal.js')
CSS = Path('src/css/views/incidencias/detail.css')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


# ==========================================================
# TEMPLATE — history becomes an explicit modal mode
# ==========================================================
t = TEMPLATE.read_text(encoding='utf-8')

t = replace_once(
    t,
    '  "incidencias.template.modal.extreme.v24.consistent-id-chip";',
    '  "incidencias.template.modal.extreme.v25.history-mode";',
    'template version',
)

old_history_fn = re.search(
    r'function renderHistorySection\(vm = \{\}\) \{.*?\n\}\n\n/\* =========================================================\n   TEMPLATE',
    t,
    flags=re.S,
)
if not old_history_fn:
    raise SystemExit('renderHistorySection function not found')

new_history_fn = r'''function renderHistorySection(vm = {}) {
  const count = getTimelineCount(vm.detail);
  const countLabel = count
    ? `${count} registro${count === 1 ? "" : "s"}`
    : "Sin actividad registrada";

  return `
    <section
      class="incidencias-modal-history-section incidencias-modal-history-view"
      data-modal-history-slot="true"
      data-history-open="true"
      aria-labelledby="incidencias-modal-history-title"
      tabindex="-1"
    >
      <div class="incidencias-modal-history-view-head">
        <div class="incidencias-modal-history-view-heading">
          <span class="incidencias-modal-history-view-icon" aria-hidden="true">
            ${icon("history")}
          </span>

          <div>
            <h3 id="incidencias-modal-history-title">
              Historial y actividad
            </h3>
            <span>${escapeHtml(countLabel)}</span>
          </div>
        </div>

        <button
          type="button"
          class="incidencias-modal-history-back-btn"
          data-detail-action="${DETAIL_ACTIONS.HISTORY_REVEAL}"
          ${disabledAttrs(vm.submitting, vm.submitting)}
        >
          Volver al ticket
        </button>
      </div>

      <div
        id="incidencias-modal-history-content"
        class="incidencias-modal-history-content incidencias-modal-history-content--standalone"
      >
        ${renderTimeline(vm.detail)}
      </div>
    </section>
  `;
}

function renderTicketBody(
  vm = {},
  {
    detail = {},
    attachments = [],
    createdAt = "—",
  } = {}
) {
  return `
    <div
      data-modal-feedback-slot="true"
      aria-live="polite"
    >
      ${renderFeedbackBox(vm)}
    </div>

    <div
      data-modal-preview-slot="true"
      data-preview-active="${vm.previewFile ? "true" : "false"}"
      aria-live="polite"
    >
      ${renderAttachmentPreview(vm)}
    </div>

    <div class="incidencias-modal-meta-grid">
      ${renderMetaField(
        "Técnico",
        renderTechnicianValue(detail),
        {
          html: true,
        }
      )}

      ${renderMetaField(
        "Factura",
        getInvoiceLabel(detail)
      )}

      ${renderMetaField(
        "Creada",
        createdAt
      )}

      ${renderMetaField(
        "Adjuntos",
        String(
          attachments.length
        )
      )}
    </div>

    ${renderDescription(detail)}

    ${renderContactBlock(detail)}

    <div data-modal-files-slot="true">
      ${renderAttachments(vm)}
    </div>

    <div data-modal-composer-slot="true">
      ${renderComposer(vm)}
    </div>
  `;
}

/* =========================================================
   TEMPLATE'''

t = t[:old_history_fn.start()] + new_history_fn + t[old_history_fn.end():]

old_history_button = '''      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.HISTORY_REVEAL}"
        class="incidencias-modal-history-jump-btn"
        aria-label="Abrir historial y actividad"
        title="Ver historial y actividad"
        ${disabledAttrs(vm.submitting, vm.submitting)}
      >
'''
new_history_button = '''      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.HISTORY_REVEAL}"
        class="${joinClasses(
          "incidencias-modal-history-jump-btn",
          vm.historyOpen
            ? "is-active"
            : ""
        )}"
        aria-label="${attr(
          vm.historyOpen
            ? "Volver al detalle de la incidencia"
            : "Abrir historial y actividad"
        )}"
        title="${attr(
          vm.historyOpen
            ? "Volver al ticket"
            : "Ver historial y actividad"
        )}"
        aria-pressed="${vm.historyOpen ? "true" : "false"}"
        ${disabledAttrs(vm.submitting, vm.submitting)}
      >
'''
t = replace_once(t, old_history_button, new_history_button, 'header history button')

# Replace the whole main body with an explicit ticket/history mode switch.
main_pattern = re.compile(
    r'''          <main\n            class="incidencias-modal-body"\n            data-modal-body="true"\n          >.*?          </main>''',
    flags=re.S,
)
main_match = main_pattern.search(t)
if not main_match:
    raise SystemExit('detail modal main block not found')

new_main = '''          <main
            class="incidencias-modal-body"
            data-modal-body="true"
            data-history-mode="${vm.historyOpen ? "history" : "ticket"}"
          >
            ${
              vm.historyOpen
                ? renderHistorySection(vm)
                : renderTicketBody(
                    vm,
                    {
                      detail,
                      attachments,
                      createdAt,
                    }
                  )
            }
          </main>'''

t = t[:main_match.start()] + new_main + t[main_match.end():]

TEMPLATE.write_text(t, encoding='utf-8')


# ==========================================================
# INDEX — replace only the body when switching history mode
# ==========================================================
i = INDEX.read_text(encoding='utf-8')

i = replace_once(
    i,
    '  "incidencias.index.extreme.v24.history-open-hard-render";',
    '  "incidencias.index.extreme.v25.history-mode";',
    'index version',
)

# Add a deterministic mode-switch branch after the loading overlay sync and
# before the normal fine-grained patch loop.
marker = '''      syncDetailLoadingOverlay(
        currentRoot,
        nextRoot
      );

      for (
        const selector
        of [
'''
addition = '''      syncDetailLoadingOverlay(
        currentRoot,
        nextRoot
      );

      const currentHistoryMode =
        cleanText(
          currentBody?.dataset?.historyMode,
          "ticket"
        );

      const nextHistoryMode =
        cleanText(
          nextBody?.dataset?.historyMode,
          "ticket"
        );

      if (
        currentBody &&
        nextBody &&
        currentHistoryMode !== nextHistoryMode
      ) {
        /*
           Historial es un modo de contenido del modal, no un scroll-jump.
           Sustituimos exclusivamente el body para mantener vivo el header,
           el host y sus listeners. Así no hay parpadeo del panel y el
           histórico nunca puede quedar fuera del viewport detrás del composer.
        */
        replacePart(
          currentRoot,
          nextRoot,
          "[data-modal-header-actions='true']",
          {
            preserveFocus: false,
          }
        );

        currentBody.replaceWith(
          nextBody.cloneNode(true)
        );

        if (options.focusSelector) {
          focusAfterRender(
            options.focusSelector,
            currentRoot
          );
        }

        return true;
      }

      for (
        const selector
        of [
'''
i = replace_once(i, marker, addition, 'history mode DOM patch')

old_open = '''  function openDetailHistory() {
    if (
      !detailModal.open ||
      detailModal.submitting
    ) {
      return false;
    }

    detailModal.historyOpen = true;

    /*
       La apertura del historial cambia el DOM estructuralmente: pasa de
       disclosure lazy sin contenido a timeline renderizada. Forzamos un
       render completo del modal en esta transición para no depender del
       patch incremental del history-slot. El host y sus listeners se
       conservan; sólo se sustituye el HTML interior.
    */
    renderModals({
      immediate: true,
      fullRender: true,
    });

    nextFrame(() => {
      revealDetailHistory({
        focus: true,
      });
    });

    return true;
  }

  function toggleDetailHistory() {
    if (
      !detailModal.open ||
      detailModal.submitting
    ) {
      return false;
    }

    detailModal.historyOpen =
      !detailModal.historyOpen;

    const openingHistory =
      detailModal.historyOpen === true;

    renderModals({
      immediate: true,
      fullRender: openingHistory,
      focusSelector:
        `[data-detail-action="${DETAIL_ACTIONS.HISTORY_TOGGLE}"]`,
    });

    if (openingHistory) {
      nextFrame(() => {
        revealDetailHistory({
          focus: false,
        });
      });
    }

    return true;
  }
'''

new_open = '''  function openDetailHistory() {
    if (
      !detailModal.open ||
      detailModal.submitting
    ) {
      return false;
    }

    detailModal.historyOpen =
      !detailModal.historyOpen;

    const openingHistory =
      detailModal.historyOpen === true;

    renderModals({
      immediate: true,
      focusSelector:
        openingHistory
          ? "[data-modal-history-slot='true']"
          : DETAIL_MODAL_PANEL_SELECTOR,
    });

    return true;
  }

  function toggleDetailHistory() {
    return openDetailHistory();
  }
'''
i = replace_once(i, old_open, new_open, 'history action controller')

INDEX.write_text(i, encoding='utf-8')


# ==========================================================
# CSS — standalone history mode, no scroll trickery
# ==========================================================
c = CSS.read_text(encoding='utf-8')
c = replace_once(
    c,
    '   PRODUCTIVO · V23 · FINAL UX · HEADER HISTORY · ADMIN FILE DELETE',
    '   PRODUCTIVO · V25 · HISTORY MODE · USER CLOSE READY',
    'css version',
)

insert_marker = '''/* =========================================================
   V23 · FINAL UX PASS
'''
if insert_marker not in c:
    raise SystemExit('CSS V23 marker not found')

v25_css = r'''/* =========================================================
   V25 · HISTORY MODE
   El historial sustituye temporalmente el contenido de trabajo del modal.
   Un solo scroll, cero saltos al composer y sin re-render del panel completo.
========================================================= */

.incidencias-modal-history-view {
  min-block-size: 100%;
  overflow: visible;

  display: grid;
  align-content: start;
  gap: 16px;

  padding:
    clamp(16px, 1.4vw, 22px);

  border:
    1px solid
    color-mix(
      in srgb,
      var(--idm-info) 24%,
      var(--idm-border-soft)
    );

  border-radius:
    var(--idm-radius-section);

  background:
    radial-gradient(
      circle at 0 0,
      color-mix(
        in srgb,
        var(--idm-info) 9%,
        transparent
      ),
      transparent 34%
    ),
    color-mix(
      in srgb,
      var(--idm-section) 98%,
      var(--idm-info) 2%
    );

  box-shadow:
    var(--idm-shadow-section);
}

.incidencias-modal-history-view:focus {
  outline: none;
}

.incidencias-modal-history-view:focus-visible {
  box-shadow:
    var(--idm-shadow-section),
    var(--idm-focus);
}

.incidencias-modal-history-view-head {
  min-inline-size: 0;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.incidencias-modal-history-view-heading {
  min-inline-size: 0;

  display: flex;
  align-items: center;
  gap: 12px;
}

.incidencias-modal-history-view-heading > div {
  min-inline-size: 0;
  display: grid;
  gap: 2px;
}

.incidencias-modal-history-view-heading h3 {
  margin: 0;

  color: var(--idm-text-strong);

  font-size:
    clamp(15px, 1.35vw, 18px);
  font-weight: 840;
  line-height: 1.2;
  letter-spacing: -.012em;
}

.incidencias-modal-history-view-heading span {
  color: var(--idm-text-muted);
  font-size: 11px;
  font-weight: 650;
}

.incidencias-modal-history-view-icon {
  flex: 0 0 auto;

  inline-size: 42px;
  block-size: 42px;

  display: grid;
  place-items: center;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--idm-info) 34%,
      var(--idm-border-soft)
    );

  border-radius: 13px;

  background:
    color-mix(
      in srgb,
      var(--idm-info) 10%,
      var(--idm-control)
    );

  color: var(--idm-info);
}

.incidencias-modal-history-back-btn {
  appearance: none;

  min-block-size: 40px;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  padding: 9px 13px;

  border:
    1px solid
    var(--idm-border-soft);

  border-radius: 12px;

  background: var(--idm-control);
  color: var(--idm-text-strong);

  font: inherit;
  font-size: 11.5px;
  font-weight: 760;
  line-height: 1;

  cursor: pointer;

  box-shadow: var(--idm-shadow-control);

  transition:
    border-color var(--idm-duration) var(--idm-ease),
    background var(--idm-duration) var(--idm-ease),
    transform var(--idm-duration) var(--idm-ease),
    box-shadow var(--idm-duration) var(--idm-ease);
}

.incidencias-modal-history-back-btn:hover:not(:disabled) {
  border-color:
    color-mix(
      in srgb,
      var(--idm-info) 42%,
      var(--idm-border-soft)
    );

  background:
    color-mix(
      in srgb,
      var(--idm-info) 7%,
      var(--idm-control)
    );

  transform: translateY(-1px);
}

.incidencias-modal-history-back-btn:focus-visible {
  outline: none;
  box-shadow: var(--idm-focus);
}

.incidencias-modal-history-content--standalone {
  padding: 0;
  border-top: 0;
  background: transparent;
}

.incidencias-modal-history-content--standalone > .incidencias-timeline-list,
.incidencias-modal-history-content--standalone > .incidencias-timeline-empty {
  margin-block-start: 0;
}

.incidencias-modal-history-jump-btn[aria-pressed="true"] {
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
        var(--idm-info) 18%,
        var(--idm-control)
      ),
      color-mix(
        in srgb,
        var(--idm-accent) 13%,
        var(--idm-control)
      )
    );
}

@media (max-width: 620px) {
  .incidencias-modal-history-view-head {
    align-items: stretch;
    flex-direction: column;
  }

  .incidencias-modal-history-back-btn {
    inline-size: 100%;
  }
}

'''

c = c.replace(insert_marker, v25_css + insert_marker, 1)

if re.search(r':\s*[^;{}\n]*!\s*important\b', c, flags=re.I):
    raise SystemExit('detail.css contains an !important declaration')

CSS.write_text(c, encoding='utf-8')

print('Patched Incidencias history mode successfully')
