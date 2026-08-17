from pathlib import Path

INDEX = Path('src/views/incidencias/index.js')
TEMPLATE = Path('src/views/incidencias/incidencias.template.modal.js')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)

# 1) History button: use a full modal render when opening the lazy history.
# This bypasses the incremental DOM patch path for the state transition that
# changes the history section from collapsed markup to rendered timeline.
i = INDEX.read_text(encoding='utf-8')

i = replace_once(
    i,
    '  "incidencias.index.extreme.v23.final-ux-admin-files";',
    '  "incidencias.index.extreme.v24.history-open-hard-render";',
    'index version',
)

i = replace_once(
    i,
    '''    renderModals({
      immediate: true,
    });

    nextFrame(() => {
      revealDetailHistory({
        focus: true,
      });
    });
''',
    '''    /*
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
''',
    'header history full render',
)

old_toggle = '''    detailModal.historyOpen =
      !detailModal.historyOpen;

    renderModals({
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
'''

new_toggle = '''    detailModal.historyOpen =
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
'''

i = replace_once(i, old_toggle, new_toggle, 'body history open full render')
INDEX.write_text(i, encoding='utf-8')

# 2) ID chip: all long canonical IDs use the same visual shortening.
# The old numeric-tail exception turned INC-20260810-867010 into #867010,
# which made this one ticket look legacy/different despite its canonical ID.
t = TEMPLATE.read_text(encoding='utf-8')

t = replace_once(
    t,
    '  "incidencias.template.modal.extreme.v23.final-ux-admin-files";',
    '  "incidencias.template.modal.extreme.v24.consistent-id-chip";',
    'template version',
)

t = replace_once(
    t,
    '''  const parts =
    id
      .split(/[\\s:_-]+/)
      .filter(Boolean);

  const last =
    parts.at(-1) ||
    "";

  if (/^\\d{6,}$/.test(last)) {
    return (
      `#${last.slice(-8)}`
    );
  }

  return (
    `${id.slice(0, 7)}` +
    `…${id.slice(-6)}`
  );
''',
    '''  return (
    `${id.slice(0, 7)}` +
    `…${id.slice(-6)}`
  );
''',
    'consistent long id chip',
)

TEMPLATE.write_text(t, encoding='utf-8')
print('Patched history opening and ID chip formatting')
