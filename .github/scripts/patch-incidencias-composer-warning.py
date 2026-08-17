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

  /*
     La zona de trabajo conserva siempre el mismo lenguaje visual:
     amarillo = área donde el usuario puede añadir una actualización.
     El estado del ticket ya se comunica en los chips del header.
  */
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

count = css.count(old)
if count != 1:
    raise SystemExit(f'Expected composer block exactly once, got {count}')

css = css.replace(old, new, 1)
path.write_text(css, encoding='utf-8')
print('Composer border normalized to warning yellow')
