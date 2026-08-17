from pathlib import Path
import re

CSS = Path('src/css/views/incidencias/detail.css')
TPL = Path('src/views/incidencias/incidencias.template.modal.js')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


# =========================================================
# TEMPLATE
# ==========================================================
t = TPL.read_text(encoding='utf-8')

t = replace_once(
    t,
    '  "incidencias.template.modal.extreme.v25.history-mode";',
    '  "incidencias.template.modal.extreme.v26.final-polish";',
    'template version',
)

# Native contact icons; no JS action needed for mailto/tel.
t = replace_once(
    t,
    '    paperclip:\n      `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,\n\n    file:',
    '    paperclip:\n      `<svg ${common}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.48-8.49"/></svg>`,\n\n    mail:\n      `<svg ${common}><rect width="18" height="14" x="3" y="5" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,\n\n    phone:\n      `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/></svg>`,\n\n    file:',
    'contact icons',
)

# Helpers are deliberately strict: only real email/tel schemes are ever emitted.
contact_helpers = r'''
function contactEmailHref(value = "") {
  const email = cleanText(value, "");

  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return "";
  }

  return `mailto:${email}`;
}

function contactPhoneHref(value = "") {
  const raw = cleanText(value, "");

  if (!raw) {
    return "";
  }

  const compact = raw
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");

  const digits = compact.replace(/\D/g, "");

  if (digits.length < 6) {
    return "";
  }

  return `tel:${compact}`;
}

function renderContactAction({
  label = "",
  value = "",
  href = "",
  iconName = "file",
  actionLabel = "Abrir",
} = {}) {
  const displayValue = cleanText(value, "—");
  const safeHref = cleanText(href, "");

  if (!safeHref) {
    return renderMetaField(label, displayValue);
  }

  return `
    <a
      class="incidencias-modal-meta-card incidencias-modal-contact-link"
      href="${attr(safeHref)}"
      aria-label="${attr(`${actionLabel}: ${displayValue}`)}"
      title="${attr(actionLabel)}"
    >
      <span class="incidencias-modal-contact-label">
        <span class="incidencias-modal-contact-icon" aria-hidden="true">
          ${icon(iconName)}
        </span>
        <span>${escapeHtml(label)}</span>
      </span>

      <strong>${escapeHtml(displayValue)}</strong>

      <small class="incidencias-modal-contact-action-copy">
        ${escapeHtml(actionLabel)}
      </small>
    </a>
  `;
}

'''

t = replace_once(
    t,
    'function renderTechnicianValue(\n  detail = {}\n) {',
    contact_helpers + 'function renderTechnicianValue(\n  detail = {}\n) {',
    'contact helpers placement',
)

# Technician email is useful as a native mail action too.
t = replace_once(
    t,
    '  const avatarUrl =\n    getTechnicianAvatar(detail);\n\n  const tone =',
    '  const avatarUrl =\n    getTechnicianAvatar(detail);\n\n  const emailHref =\n    contactEmailHref(email);\n\n  const tone =',
    'technician email href',
)

t = replace_once(
    t,
    '''        ${
          email
            ? `<small>${escapeHtml(email)}</small>`
            : ""
        }
''',
    '''        ${
          email
            ? emailHref
              ? `
                <a
                  class="incidencias-modal-technician-email"
                  href="${attr(emailHref)}"
                  aria-label="${attr(`Enviar correo a ${email}`)}"
                  title="Enviar correo"
                >${escapeHtml(email)}</a>
              `
              : `<small>${escapeHtml(email)}</small>`
            : ""
        }
''',
    'technician clickable email',
)

old_contact = '''function renderContactBlock(
  detail = {}
) {
  const email =
    getClientEmail(detail);

  const phone =
    getClientPhone(detail);

  if (
    !email &&
    !phone
  ) {
    return "";
  }

  return `
    <section
      class="incidencias-modal-contact-section"
      aria-labelledby="incidencias-modal-contact-title"
    >
      <div class="incidencias-modal-section-head">
        <h3 id="incidencias-modal-contact-title">
          Contacto
        </h3>
      </div>

      <div class="incidencias-modal-contact-grid">
        ${
          email
            ? renderMetaField(
                "Email",
                email
              )
            : ""
        }

        ${
          phone
            ? renderMetaField(
                "Teléfono",
                phone
              )
            : ""
        }
      </div>
    </section>
  `;
}
'''

new_contact = '''function renderContactBlock(
  detail = {}
) {
  const email =
    getClientEmail(detail);

  const phone =
    getClientPhone(detail);

  if (
    !email &&
    !phone
  ) {
    return "";
  }

  const emailHref =
    contactEmailHref(email);

  const phoneHref =
    contactPhoneHref(phone);

  return `
    <section
      class="incidencias-modal-contact-section"
      aria-labelledby="incidencias-modal-contact-title"
    >
      <div class="incidencias-modal-section-head">
        <h3 id="incidencias-modal-contact-title">
          Contacto
        </h3>
      </div>

      <div class="incidencias-modal-contact-grid">
        ${
          email
            ? renderContactAction({
                label: "Email",
                value: email,
                href: emailHref,
                iconName: "mail",
                actionLabel: "Enviar correo",
              })
            : ""
        }

        ${
          phone
            ? renderContactAction({
                label: "Teléfono",
                value: phone,
                href: phoneHref,
                iconName: "phone",
                actionLabel: "Llamar",
              })
            : ""
        }
      </div>
    </section>
  `;
}
'''

t = replace_once(t, old_contact, new_contact, 'contact block')
TPL.write_text(t, encoding='utf-8')


# =========================================================
# CSS
# ==========================================================
c = CSS.read_text(encoding='utf-8')

c = replace_once(
    c,
    '   PRODUCTIVO · V25 · HISTORY MODE · USER CLOSE READY',
    '   PRODUCTIVO · V26 · FINAL POLISH · CONTACT ACTIONS',
    'css version',
)

# The first composer block handles state-specific specificity. Keep every state amber.
old_first_composer = '''.incidencias-modal-composer {
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

new_first_composer = '''.incidencias-modal-composer {
  --idm-composer-warning: #f6c344;

  position: relative;

  padding:
    18px;

  display: grid;

  gap:
    13px;

  border-color:
    color-mix(
      in srgb,
      var(--idm-composer-warning) 74%,
      var(--idm-border-soft)
    );

  box-shadow:
    var(--idm-shadow-section),
    0 0 0 1px
      color-mix(
        in srgb,
        var(--idm-composer-warning) 10%,
        transparent
      );
}

.incidencias-modal-composer[data-modal-has-draft="true"] {
  border-color:
    color-mix(
      in srgb,
      var(--idm-composer-warning) 88%,
      var(--idm-border-soft)
    );

  box-shadow:
    var(--idm-shadow-section),
    0 0 0 1px
      color-mix(
        in srgb,
        var(--idm-composer-warning) 16%,
        transparent
      ),
    0 12px 34px
      color-mix(
        in srgb,
        var(--idm-composer-warning) 9%,
        transparent
      );
}

.incidencias-modal-composer[data-modal-requires-reopen="true"] {
  border-color:
    color-mix(
      in srgb,
      var(--idm-composer-warning) 80%,
      var(--idm-border-soft)
    );
}
'''

c = replace_once(c, old_first_composer, new_first_composer, 'first composer state block')

# This later V21 block was the real regression: it overwrote the open-ticket border back to accent/blue.
old_v21 = '''.incidencias-modal-composer {
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
'''

new_v21 = '''.incidencias-modal-composer {
  overflow: hidden;

  padding:
    clamp(18px, 1.7vw, 24px);

  gap: 16px;

  border-color:
    color-mix(
      in srgb,
      var(--idm-composer-warning) 74%,
      var(--idm-border-soft)
    );

  background:
    radial-gradient(
      circle at 0 0,
      color-mix(
        in srgb,
        var(--idm-composer-warning) 7%,
        transparent
      ),
      transparent 38%
    ),
    linear-gradient(
      180deg,
      color-mix(
        in srgb,
        var(--idm-section) 97%,
        var(--idm-composer-warning) 3%
      ),
      var(--idm-section)
    );

  box-shadow:
    0 18px 46px rgba(0, 0, 0, .16),
    0 0 0 1px
      color-mix(
        in srgb,
        var(--idm-composer-warning) 12%,
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
        var(--idm-composer-warning) 88%,
        transparent
      ),
      transparent
    );

  pointer-events: none;
}
'''

c = replace_once(c, old_v21, new_v21, 'V21 composer regression override')

# Neutralize the technician photo frame when a real avatar exists. Tone remains only for fallbacks.
tech_anchor = '''.incidencias-modal-technician-avatar--fallback > img,
.incidencias-modal-technician-avatar[data-fallback="true"] > img,
.incidencias-modal-technician-avatar[data-has-avatar="false"] > img {
  display: none;
}

'''
tech_extra = tech_anchor + '''.incidencias-modal-technician-avatar[data-has-avatar="true"] {
  border-color:
    color-mix(
      in srgb,
      var(--idm-border-soft) 74%,
      transparent
    );

  background: transparent;
  box-shadow: none;
}

'''
c = replace_once(c, tech_anchor, tech_extra, 'neutral technician avatar')

# Clickable technician email.
tech_copy_anchor = '''.incidencias-modal-technician-copy > small {
  min-inline-size: 0;

  overflow: hidden;

  color:
    var(--idm-text-muted);

  font-size: 10.5px;
  font-weight: 600;

  text-overflow: ellipsis;
  white-space: nowrap;
}

'''
tech_copy_extra = tech_copy_anchor + '''.incidencias-modal-technician-email {
  min-inline-size: 0;
  overflow: hidden;

  color: var(--idm-text-muted);

  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.3;

  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;

  transition:
    color var(--idm-duration) var(--idm-ease),
    text-decoration-color var(--idm-duration) var(--idm-ease);
}

.incidencias-modal-technician-email:hover {
  color: var(--idm-info);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.incidencias-modal-technician-email:focus-visible {
  outline: none;
  border-radius: 4px;
  box-shadow: var(--idm-focus);
}

'''
c = replace_once(c, tech_copy_anchor, tech_copy_extra, 'technician email CSS')

contact_anchor = '''.incidencias-modal-contact-grid
  .incidencias-modal-meta-card {
  min-block-size: 74px;
}

'''
contact_extra = contact_anchor + '''.incidencias-modal-contact-link {
  position: relative;

  color: inherit;
  text-decoration: none;
  cursor: pointer;

  transition:
    border-color var(--idm-duration) var(--idm-ease),
    background var(--idm-duration) var(--idm-ease),
    box-shadow var(--idm-duration) var(--idm-ease),
    transform var(--idm-duration) var(--idm-ease);
}

.incidencias-modal-contact-link:hover {
  border-color:
    color-mix(
      in srgb,
      var(--idm-info) 46%,
      var(--idm-border-soft)
    );

  background:
    linear-gradient(
      180deg,
      color-mix(
        in srgb,
        var(--idm-info) 7%,
        var(--idm-card)
      ),
      var(--idm-card)
    );

  transform: translateY(-1px);

  box-shadow:
    var(--idm-shadow-control),
    0 10px 24px
      color-mix(
        in srgb,
        var(--idm-info) 8%,
        transparent
      );
}

.incidencias-modal-contact-link:focus-visible {
  outline: none;
  box-shadow: var(--idm-focus);
}

.incidencias-modal-contact-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.incidencias-modal-contact-icon {
  inline-size: 15px;
  block-size: 15px;

  display: inline-grid;
  place-items: center;

  color:
    color-mix(
      in srgb,
      var(--idm-info) 72%,
      var(--idm-text-muted)
    );
}

.incidencias-modal-contact-icon > svg {
  inline-size: 15px;
  block-size: 15px;
}

.incidencias-modal-contact-action-copy {
  color:
    color-mix(
      in srgb,
      var(--idm-info) 64%,
      var(--idm-text-muted)
    );

  font-size: 9.5px;
  font-weight: 720;
  line-height: 1.15;
}

'''
c = replace_once(c, contact_anchor, contact_extra, 'contact links CSS')

if re.search(r':\s*[^;{}\n]*!\s*important\b', c, flags=re.I):
    raise SystemExit('CSS contains !important declaration')

CSS.write_text(c, encoding='utf-8')
print('Final Incidencias modal polish applied')
