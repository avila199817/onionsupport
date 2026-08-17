from pathlib import Path

css_path = Path('src/css/views/incidencias/detail.css')
css = css_path.read_text(encoding='utf-8')

old = '''.incidencias-modal-history-view {
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
'''

new = '''.incidencias-modal-history-view {
  min-block-size: 0;
  overflow: visible;

  display: grid;
  align-content: start;
  gap: 16px;

  /*
     El historial ya es un modo completo del body del modal.
     No necesita otra caja visual contenedora: dejamos respirar
     cabecera y tarjetas directamente sobre el panel principal.
  */
  padding:
    8px
    clamp(10px, .9vw, 14px)
    24px;

  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.incidencias-modal-history-view:focus,
.incidencias-modal-history-view:focus-visible {
  outline: none;
  box-shadow: none;
}
'''

count = css.count(old)
if count != 1:
    raise SystemExit(f'Expected history view CSS block once, got {count}')

css = css.replace(old, new, 1)

if '!important' in css:
    # Existing policy: never introduce !important in this view.
    raise SystemExit('detail.css contains !important')

css_path.write_text(css, encoding='utf-8')
print('History outer box removed')
