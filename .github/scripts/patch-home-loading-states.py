from pathlib import Path
import re

TEMPLATE = Path('src/views/home/home.template.js')
CSS = Path('src/css/views/home/index.css')


def read(path):
    return path.read_text(encoding='utf-8')


def write(path, text):
    path.write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


def replace_regex_once(text, pattern, replacement, label, flags=0):
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 regex match, got {count}')
    return new_text


# ==========================================================
# TEMPLATE
# ==========================================================
t = read(TEMPLATE)

t = replace_once(
    t,
    '  "home.template.inicio.v8.total-invoiced.production";',
    '  "home.template.inicio.v9.loading-states.production";',
    'template version',
)

t = replace_once(
    t,
    '    return "No disponible";',
    '    return "Pendiente";',
    'billing formatter fallback',
)

t = replace_once(
    t,
    '    loading: data.loading === true,\n    error: cleanText(first(data.error, dashboard.error, ""), ""),',
    '    loading: data.loading === true,\n    refreshing: data.refreshing === true,\n    error: cleanText(first(data.error, dashboard.error, ""), ""),',
    'refreshing vm state',
)

loading_helper = r'''
function panelLoadingRows(
  type = "activity",
  count = 4
) {
  const kind =
    type === "invoice"
      ? "invoice"
      : "activity";

  return `
    <div
      class="home-panel-loading home-panel-loading--${kind}"
      aria-hidden="true"
      data-home-panel-loading="${kind}"
    >
      ${Array.from({ length: count }, (_, index) => {
        if (kind === "invoice") {
          return `
            <div class="home-panel-loading-row home-panel-loading-row--invoice" data-home-loading-row="${index + 1}">
              <span class="home-panel-loading-copy">
                <span class="home-skeleton home-panel-loading-title"></span>
                <span class="home-skeleton home-panel-loading-meta"></span>
              </span>
              <span class="home-skeleton home-panel-loading-amount"></span>
            </div>
          `;
        }

        return `
          <div class="home-panel-loading-row home-panel-loading-row--activity" data-home-loading-row="${index + 1}">
            <span class="home-skeleton home-panel-loading-icon"></span>
            <span class="home-panel-loading-copy">
              <span class="home-skeleton home-panel-loading-title"></span>
              <span class="home-skeleton home-panel-loading-meta"></span>
            </span>
            <span class="home-skeleton home-panel-loading-date"></span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

'''

t = replace_once(
    t,
    'function emptyState(\n',
    loading_helper + 'function emptyState(\n',
    'panel loading helper',
)

t = replace_once(
    t,
    '    : "Facturado: no disponible";',
    '    : "Facturado: pendiente de sincronizar";',
    'stats billing fallback',
)

activity_fn = r'''function activity(vm) {
  const items = vm.activity.slice(0, 6);

  return `
    <section class="home-panel home-panel--activity" data-home-section="activity">
      <div class="home-panel-header">
        <div>
          <p class="home-panel-kicker">Actividad</p>
          <h2>Últimos movimientos</h2>
        </div>
      </div>
      ${
        vm.loading
          ? panelLoadingRows("activity", 4)
          : items.length
            ? `<ul class="home-activity-list">${items.map(activityItem).join("")}</ul>`
            : emptyState(
                "Sin actividad reciente",
                "Todavía no hay movimientos visibles en el inicio.",
                "activity"
              )
      }
    </section>
  `;
}
'''

t = replace_regex_once(
    t,
    r'function activity\(vm\) \{.*?\n\}\n\n/\* =========================================================\n   INVOICES',
    activity_fn + '\n/* =========================================================\n   INVOICES',
    'activity loading state',
    flags=re.S,
)

invoices_fn = r'''function invoices(vm) {
  const items = vm.facturas.slice(0, 5);
  const route = safeRoute(vm.routes.facturas, "/facturas");

  const billingState =
    vm.loading
      ? "loading"
      : vm.counts.invoiceStatsAvailable
        ? "ready"
        : "pending";

  const billedAmount =
    billingState === "ready"
      ? formatBillingAmount(
          vm.counts.totalInvoiced,
          vm.counts.currency,
          true
        )
      : "";

  const billingContent =
    billingState === "loading"
      ? `
        <div class="home-billing-loading" role="status" aria-live="polite">
          <span class="home-skeleton home-skeleton--billing-value"></span>
          <small>Calculando facturación…</small>
        </div>
      `
      : billingState === "ready"
        ? `<strong>${escapeHtml(billedAmount)}</strong>`
        : `
          <div class="home-billing-status home-billing-status--pending" role="status">
            <span class="home-billing-status-icon" aria-hidden="true">${icon("clock")}</span>
            <span class="home-billing-status-copy">
              <strong>Total pendiente</strong>
              <small>Se mostrará cuando las estadísticas terminen de sincronizarse.</small>
            </span>
          </div>
        `;

  return `
    <section class="home-panel home-panel--invoices" data-home-section="invoices">
      <div class="home-panel-header">
        <div>
          <p class="home-panel-kicker">Facturación</p>
          <h2>Facturas</h2>
        </div>
        ${actionButton({
          label: "Ver facturas",
          route,
          iconName: "arrowRight",
          className: "home-link-button",
          ariaLabel: "Ver facturas",
        })}
      </div>

      <div
        class="home-billing-total"
        data-home-billing-total="invoiced"
        data-home-billing-source="api-facturas-stats"
        data-home-billing-state="${billingState}"
      >
        <span>Importe total facturado</span>
        ${billingContent}
      </div>

      ${
        vm.loading
          ? panelLoadingRows("invoice", 4)
          : items.length
            ? `<ul class="home-invoice-list">${items.map(invoiceItem).join("")}</ul>`
            : emptyState(
                "Sin facturas visibles",
                "Cuando haya facturas disponibles aparecerán aquí.",
                "invoice"
              )
      }
    </section>
  `;
}
'''

t = replace_regex_once(
    t,
    r'function invoices\(vm\) \{.*?\n\}\n\n/\* =========================================================\n   STATES / MAIN TEMPLATE',
    invoices_fn + '\n/* =========================================================\n   STATES / MAIN TEMPLATE',
    'invoice loading and pending states',
    flags=re.S,
)

if 'No disponible' in t:
    raise SystemExit('template still contains exact "No disponible"')

write(TEMPLATE, t)


# ==========================================================
# CSS
# ==========================================================
c = read(CSS)

c = replace_once(
    c,
    '   PRODUCCIÓN · CONSOLIDADO · CSS 10/10',
    '   PRODUCCIÓN · CONSOLIDADO · HOME LOADING POLISH',
    'css header',
)

c = replace_once(
    c,
    '.home-billing-total span {',
    '.home-billing-total > span {',
    'billing label direct child',
)

c = replace_once(
    c,
    '.home-billing-total strong {',
    '.home-billing-total > strong {',
    'billing amount direct child',
)

c = replace_once(
    c,
    '[data-theme="light"] .home-billing-total strong {',
    '[data-theme="light"] .home-billing-total > strong {',
    'light billing amount direct child',
)

loading_css = r'''
.home-billing-total[data-home-billing-state="loading"] {
  border-color:
    color-mix(
      in srgb,
      var(--warning) 22%,
      var(--badge-border)
    );

  background:
    radial-gradient(
      circle at 0% 0%,
      color-mix(in srgb, var(--warning) 10%, transparent),
      transparent 46%
    ),
    color-mix(in srgb, var(--badge-bg) 82%, transparent);
}

.home-billing-loading {
  display: flex;
  align-items: center;
  gap: 14px;
  min-block-size: 40px;
}

.home-skeleton--billing-value {
  inline-size: min(250px, 46%);
  min-inline-size: 150px;
  block-size: clamp(30px, 2.2vw, 42px);
  border-radius: 12px;
}

.home-billing-loading small {
  color:
    color-mix(
      in srgb,
      var(--warning) 54%,
      var(--text-muted)
    );

  font-size: 11px;
  line-height: 1.3;
  font-weight: 760;
  letter-spacing: -.005em;
}

.home-billing-total[data-home-billing-state="pending"] {
  border-color:
    color-mix(
      in srgb,
      var(--warning) 22%,
      var(--badge-border)
    );

  background:
    radial-gradient(
      circle at 0% 0%,
      color-mix(in srgb, var(--warning) 9%, transparent),
      transparent 46%
    ),
    color-mix(in srgb, var(--badge-bg) 82%, transparent);
}

.home-billing-status {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 11px;
  min-inline-size: 0;
}

.home-billing-status-icon {
  display: grid;
  place-items: center;
  inline-size: 38px;
  block-size: 38px;
  border:
    1px solid
    color-mix(
      in srgb,
      var(--warning) 30%,
      rgba(255, 255, 255, .12)
    );
  border-radius: 13px;
  color:
    color-mix(
      in srgb,
      var(--warning) 72%,
      var(--text-strong)
    );
  background:
    color-mix(
      in srgb,
      var(--warning) 8%,
      rgba(255, 255, 255, .025)
    );
}

.home-billing-status-icon svg {
  inline-size: 17px;
  block-size: 17px;
}

.home-billing-status-copy {
  display: grid;
  gap: 3px;
  min-inline-size: 0;
}

.home-billing-status-copy strong {
  color: var(--text-strong);
  font-size: 15px;
  line-height: 1.1;
  font-weight: 880;
  letter-spacing: -.02em;
}

.home-billing-status-copy small {
  color: var(--text-muted);
  font-size: 10.5px;
  line-height: 1.35;
  font-weight: 620;
}

.home-panel-loading {
  display: grid;
  gap: 8px;
  padding: 14px;
}

.home-panel-loading-row {
  min-inline-size: 0;
  min-block-size: 60px;
  padding: 10px 12px;
  border:
    1px solid
    color-mix(
      in srgb,
      var(--data-table-row-border) 84%,
      transparent
    );
  border-radius: 18px;
  background: rgba(255, 255, 255, .018);
}

.home-panel-loading-row--activity {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 70px;
  align-items: center;
  gap: 12px;
}

.home-panel-loading-row--invoice {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px;
  align-items: center;
  gap: 12px;
}

.home-panel-loading-copy {
  display: grid;
  gap: 7px;
  min-inline-size: 0;
}

.home-panel-loading-icon {
  inline-size: 42px;
  block-size: 42px;
  border-radius: 15px;
}

.home-panel-loading-title {
  inline-size: min(280px, 72%);
  block-size: 11px;
}

.home-panel-loading-meta {
  inline-size: min(210px, 52%);
  block-size: 9px;
  opacity: .72;
}

.home-panel-loading-date {
  inline-size: 68px;
  block-size: 9px;
  justify-self: end;
  opacity: .64;
}

.home-panel-loading-amount {
  inline-size: 82px;
  block-size: 12px;
  justify-self: end;
  opacity: .78;
}

'''

marker = '/* =========================================================\n   12. VACÍO / SKELETON\n========================================================= */'
if c.count(marker) != 1:
    raise SystemExit(f'loading css marker: expected 1, got {c.count(marker)}')
c = c.replace(marker, loading_css + marker, 1)

responsive_old = '''  .home-activity-item,
  .home-invoice-item {
    grid-template-columns: minmax(0, 1fr);
  }
'''
responsive_new = '''  .home-activity-item,
  .home-invoice-item,
  .home-panel-loading-row--activity,
  .home-panel-loading-row--invoice {
    grid-template-columns: minmax(0, 1fr);
  }

  .home-panel-loading-icon,
  .home-panel-loading-date,
  .home-panel-loading-amount {
    display: none;
  }

  .home-billing-loading {
    align-items: flex-start;
    flex-direction: column;
    gap: 9px;
  }

  .home-skeleton--billing-value {
    inline-size: min(220px, 72%);
  }
'''
c = replace_once(c, responsive_old, responsive_new, 'responsive loading rows')

if re.search(r':\s*[^;{}\n]*!\s*important\b', c, flags=re.I):
    raise SystemExit('CSS contains !important declaration')

write(CSS, c)
print('Home loading states patch applied')
