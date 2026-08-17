from pathlib import Path

path = Path('src/css/views/incidencias/detail.css')
css = path.read_text(encoding='utf-8')

old = '''.incidencias-modal-composer {
  position: relative;

  padding:
    18px;

  display: grid;

  gap:
    13px;

  border-color:
    color-mix(
      in srgb,
      var(--idm-accent) 26%,
      var(--idm-border-soft)
    );
}

.incidencias-modal-composer[data-modal-has-draft="true"] {
  border-color:
    color-mix(
      in srgb,
      var(--idm-accent) 52%,
      var(--idm-border-soft)
    );

  box-shadow:
    var(--idm-shadow-section),
    0 0 0 1px
      color-mix(
        in srgb,
        var(--idm-accent) 8%,
        transparent
      );
}

.incidencias-modal-composer[data-modal-requires-reopen="true"] {
  border-color:
    color-mix(
      in srgb,
      var(--idm-warning) 48%,
      var(--idm-border-soft)
    );
}
'''

new = '''.incidencias-modal-composer {
  position: relative;

  padding:
    18px;

  display: grid;

  gap:
    13px;

  border-color:
    color-mix(
      in srgb,
      var(--idm-warning) 50%,
      var(--idm-border-soft)
    );

  box-shadow:
    var(--idm-shadow-section),
    0 0 0 1px
      color-mix(
        in srgb,
        var(--idm-warning) 5%,
        transparent
      );
}

.incidencias-modal-composer[data-modal-has-draft="true"] {
  border-color:
    color-mix(
      in srgb,
      var(--idm-warning) 68%,
      var(--idm-border-soft)
    );

  box-shadow:
    var(--idm-shadow-section),
    0 0 0 1px
      color-mix(
        in srgb,
        var(--idm-warning) 12%,
        transparent
      ),
    0 12px 34px
      color-mix(
        in srgb,
        var(--idm-warning) 7%,
        transparent
      );
}

.incidencias-modal-composer[data-modal-requires-reopen="true"] {
  border-color:
    color-mix(
      in srgb,
      var(--idm-warning) 58%,
      var(--idm-border-soft)
    );
}
'''

if css.count(old) != 1:
    raise SystemExit('Composer CSS contract not found exactly once')

path.write_text(css.replace(old, new, 1), encoding='utf-8')
print('Composer yellow unified')
