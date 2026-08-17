from pathlib import Path
import re

path = Path('src/css/views/incidencias/detail.css')
css = path.read_text(encoding='utf-8')

css = css.replace(
    'PRODUCTIVO · V26 · FINAL POLISH · CONTACT ACTIONS',
    'PRODUCTIVO · V27 · PRO LOADING SPINNER',
    1,
)

old_box = '''.incidencias-modal-loading-box {
  display: inline-flex;
  align-items: center;

  gap: 10px;

  padding:
    13px
    15px;

  border:
    1px solid
    var(--idm-border-soft);

  border-radius:
    var(--idm-radius-control);

  background:
    var(--idm-panel-elevated);

  color:
    var(--idm-text-strong);

  box-shadow:
    var(--idm-shadow-section);
}

.incidencias-modal-loading-box > span {
  inline-size: 17px;
  block-size: 17px;

  border:
    2px solid
    var(--idm-accent-active);

  border-inline-end-color:
    transparent;

  border-radius: 50%;

  animation:
    incidenciasDetailSpin
    .72s
    linear
    infinite;
}

.incidencias-modal-loading-box > strong {
  font-size: 12px;
  font-weight: 760;
}
'''

new_box = '''.incidencias-modal-loading-box {
  display: inline-flex;
  align-items: center;

  gap: 12px;

  min-block-size: 52px;

  padding:
    13px
    17px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--idm-info) 24%,
      var(--idm-border-soft)
    );

  border-radius:
    var(--idm-radius-control);

  background:
    linear-gradient(
      145deg,
      color-mix(
        in srgb,
        var(--idm-info) 5%,
        var(--idm-panel-elevated)
      ),
      var(--idm-panel-elevated)
    );

  color:
    var(--idm-text-strong);

  box-shadow:
    var(--idm-shadow-section),
    0 12px 34px
      color-mix(
        in srgb,
        var(--idm-info) 8%,
        transparent
      );
}

.incidencias-modal-loading-box > span {
  position: relative;

  inline-size: 22px;
  block-size: 22px;

  flex: 0 0 22px;

  border:
    2px solid
    color-mix(
      in srgb,
      var(--idm-info) 22%,
      var(--idm-border-soft)
    );

  border-block-start-color:
    var(--idm-info);

  border-inline-end-color:
    color-mix(
      in srgb,
      var(--idm-composer-warning, var(--idm-warning)) 82%,
      var(--idm-info)
    );

  border-radius: 50%;

  box-shadow:
    0 0 0 1px
      color-mix(
        in srgb,
        var(--idm-info) 5%,
        transparent
      ),
    0 0 18px
      color-mix(
        in srgb,
        var(--idm-info) 14%,
        transparent
      );

  animation:
    incidenciasDetailSpin
    .68s
    linear
    infinite;
}

.incidencias-modal-loading-box > span::after {
  content: "";

  position: absolute;
  inset: 50% auto auto 50%;

  inline-size: 4px;
  block-size: 4px;

  border-radius: 50%;

  background:
    color-mix(
      in srgb,
      var(--idm-info) 72%,
      white 28%
    );

  box-shadow:
    0 0 8px
      color-mix(
        in srgb,
        var(--idm-info) 52%,
        transparent
      );

  transform:
    translate(-50%, -50%);
}

.incidencias-modal-loading-box > strong {
  font-size: 12.5px;
  font-weight: 780;
  letter-spacing: -.008em;
}
'''

count = css.count(old_box)
if count != 1:
    raise SystemExit(f'Expected exactly one loading box block, got {count}')

css = css.replace(old_box, new_box, 1)

if re.search(r':\s*[^;{}\n]*!\s*important\b', css, flags=re.I):
    raise SystemExit('CSS contains an !important declaration')

path.write_text(css, encoding='utf-8')
print('Incidencias loading spinner polished')
