from pathlib import Path
import re

TEMPLATE = Path('src/views/incidencias/incidencias.template.modal.js')
CSS = Path('src/css/views/incidencias/detail.css')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


# ==========================================================
# TEMPLATE · semantic timeline tones
# ==========================================================
t = TEMPLATE.read_text(encoding='utf-8')

marker = '''function getTimelineCount(detail = {}) {
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

helper = marker + '''function getTimelineTone(entry = {}) {
  const kind = normalizeKey(entry.kind || "event");
  const type = normalizeKey(entry.type || "update");

  if (kind === "comment") return "comment";
  if (type === "created") return "created";

  const text = normalizeKey(
    [
      type,
      entry.title,
      entry.body,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (
    /adjunt|attach|archivo|document|file/.test(text)
  ) {
    return "attachment";
  }

  if (
    /cerrad|closed|resolved|resuelt/.test(text)
  ) {
    return "closed";
  }

  if (
    /reabiert|reopen|abiert|opened/.test(text)
  ) {
    return "reopened";
  }

  if (
    /prioridad|priority|urgent|urgente/.test(text)
  ) {
    return "priority";
  }

  if (
    /tecnico|técnico|technician|asign/.test(text)
  ) {
    return "assignment";
  }

  if (
    /factura|invoice/.test(text)
  ) {
    return "invoice";
  }

  return "update";
}

'''

t = replace_once(t, marker, helper, 'timeline tone helper')

old_vars = '''            const isCreated =
              type === "created";

            const title =
'''
new_vars = '''            const isCreated =
              type === "created";

            const tone =
              getTimelineTone(entry);

            const title =
'''
t = replace_once(t, old_vars, new_vars, 'timeline tone variable')

old_class = '''                class="${joinClasses(
                  "incidencias-timeline-card",

                  isComment
                    ? "is-comment"
                    : "",

                  isCreated
                    ? "is-created"
                    : ""
                )}"
              >
'''
new_class = '''                class="${joinClasses(
                  "incidencias-timeline-card",
                  `tone-${tone}`,

                  isComment
                    ? "is-comment"
                    : "",

                  isCreated
                    ? "is-created"
                    : ""
                )}"
                data-timeline-tone="${attr(tone)}"
              >
'''
t = replace_once(t, old_class, new_class, 'timeline tone class')

TEMPLATE.write_text(t, encoding='utf-8')


# ==========================================================
# CSS · balanced bottom spacing + semantic color system
# ==========================================================
c = CSS.read_text(encoding='utf-8')

old_standalone = '''.incidencias-modal-history-content--standalone {
  padding: 0;
  border-top: 0;
  background: transparent;
}

.incidencias-modal-history-content--standalone > .incidencias-timeline-list,
.incidencias-modal-history-content--standalone > .incidencias-timeline-empty {
  margin-block-start: 0;
}
'''

new_standalone = '''.incidencias-modal-history-content--standalone {
  padding:
    0
    0
    clamp(
      24px,
      2vw,
      34px
    );

  border-top: 0;
  background: transparent;
}

.incidencias-modal-history-content--standalone > .incidencias-timeline-list,
.incidencias-modal-history-content--standalone > .incidencias-timeline-empty {
  margin-block-start: 0;
}
'''
c = replace_once(c, old_standalone, new_standalone, 'history bottom spacing')

old_card = '''.incidencias-timeline-card {
  position: relative;

  min-inline-size: 0;

  display: grid;

  grid-template-columns:
    3px
    minmax(0, 1fr)
    minmax(130px, auto);

  gap: 13px;

  align-items: start;

  padding:
    12px
    13px;

  border:
    1px solid
    var(--idm-border-subtle);

  border-radius:
    var(--idm-radius-card);

  background:
    color-mix(
      in srgb,
      var(--idm-card) 96%,
      transparent
    );
}

.incidencias-timeline-card.is-comment {
  border-color:
    color-mix(
      in srgb,
      var(--idm-accent) 26%,
      var(--idm-border-subtle)
    );
}

.incidencias-timeline-card.is-created {
  border-color:
    color-mix(
      in srgb,
      var(--idm-success) 24%,
      var(--idm-border-subtle)
    );
}

.incidencias-timeline-accent {
  align-self: stretch;

  inline-size: 3px;

  border-radius: 999px;

  background:
    color-mix(
      in srgb,
      var(--idm-text-muted) 34%,
      transparent
    );
}

.incidencias-timeline-card.is-comment
  .incidencias-timeline-accent {
  background:
    var(--idm-accent);
}

.incidencias-timeline-card.is-created
  .incidencias-timeline-accent {
  background:
    var(--idm-success);
}
'''

new_card = '''.incidencias-timeline-card {
  --timeline-tone: #3b82f6;

  position: relative;

  min-inline-size: 0;

  display: grid;

  grid-template-columns:
    3px
    minmax(0, 1fr)
    minmax(130px, auto);

  gap: 13px;

  align-items: start;

  padding:
    12px
    13px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--timeline-tone) 24%,
      var(--idm-border-subtle)
    );

  border-radius:
    var(--idm-radius-card);

  background:
    linear-gradient(
      100deg,
      color-mix(
        in srgb,
        var(--timeline-tone) 5%,
        var(--idm-card)
      ),
      color-mix(
        in srgb,
        var(--idm-card) 97%,
        transparent
      ) 34%
    );

  box-shadow:
    inset 0 1px 0
      color-mix(
        in srgb,
        var(--timeline-tone) 5%,
        transparent
      );
}

.incidencias-timeline-card.tone-update {
  --timeline-tone: #3b82f6;
}

.incidencias-timeline-card.tone-comment {
  --timeline-tone: #a855f7;
}

.incidencias-timeline-card.tone-created {
  --timeline-tone: #22c55e;
}

.incidencias-timeline-card.tone-attachment {
  --timeline-tone: #06b6d4;
}

.incidencias-timeline-card.tone-closed {
  --timeline-tone: #ef4444;
}

.incidencias-timeline-card.tone-reopened {
  --timeline-tone: #eab308;
}

.incidencias-timeline-card.tone-priority {
  --timeline-tone: #f97316;
}

.incidencias-timeline-card.tone-assignment {
  --timeline-tone: #6366f1;
}

.incidencias-timeline-card.tone-invoice {
  --timeline-tone: #14b8a6;
}

.incidencias-timeline-accent {
  align-self: stretch;

  inline-size: 3px;

  border-radius: 999px;

  background:
    var(--timeline-tone);

  box-shadow:
    0 0 18px
      color-mix(
        in srgb,
        var(--timeline-tone) 24%,
        transparent
      );
}
'''
c = replace_once(c, old_card, new_card, 'timeline card palette')

old_kind = '''.incidencias-timeline-kind {
  display: inline-flex;
  align-items: center;

  min-block-size: 20px;

  padding:
    3px
    6px;

  border:
    1px solid
    var(--idm-border-subtle);

  border-radius: 999px;

  color:
    var(--idm-text-muted);

  font-size: 9px;
  font-weight: 760;

  line-height: 1;
}
'''

new_kind = '''.incidencias-timeline-kind {
  display: inline-flex;
  align-items: center;

  min-block-size: 20px;

  padding:
    3px
    7px;

  border:
    1px solid
    color-mix(
      in srgb,
      var(--timeline-tone) 30%,
      var(--idm-border-subtle)
    );

  border-radius: 999px;

  background:
    color-mix(
      in srgb,
      var(--timeline-tone) 9%,
      transparent
    );

  color:
    color-mix(
      in srgb,
      var(--timeline-tone) 66%,
      var(--idm-text-strong)
    );

  font-size: 9px;
  font-weight: 780;

  line-height: 1;
}
'''
c = replace_once(c, old_kind, new_kind, 'timeline badge palette')

# Make hover feel premium without turning the history into a neon dashboard.
anchor = '''.incidencias-timeline-main {
'''
hover = '''.incidencias-timeline-card:hover {
  border-color:
    color-mix(
      in srgb,
      var(--timeline-tone) 38%,
      var(--idm-border-soft)
    );

  background:
    linear-gradient(
      100deg,
      color-mix(
        in srgb,
        var(--timeline-tone) 8%,
        var(--idm-card)
      ),
      color-mix(
        in srgb,
        var(--idm-card) 98%,
        transparent
      ) 38%
    );
}

'''
if c.count(anchor) != 1:
    raise SystemExit(f'timeline hover anchor expected once, got {c.count(anchor)}')
c = c.replace(anchor, hover + anchor, 1)

# No new !important declarations in the modified view.
if re.search(r':\s*[^;{}\n]*!\s*important\b', c, flags=re.I):
    raise SystemExit('detail.css contains an !important declaration')

CSS.write_text(c, encoding='utf-8')
print('Incidencias history spacing and semantic colors applied')
