/* =========================================================
   Onion SPA - Home Template
   Archivo: src/views/home/home.template.js

   FINAL PRO SYSTEM · EXTREME MODE · 10/10

   Responsabilidades:
   - renderizar la vista Home premium EXTREME MODE
   - consumir estado real del módulo Home
   - soportar summary normalizado y payload envuelto
   - mostrar hero contextual con usuario autenticado
   - renderizar KPIs dinámicos reales
   - mostrar alertas operativas
   - mostrar actividad reciente
   - mostrar quick actions
   - mostrar health status de módulos
   - soportar loading / error / empty / degraded states
   - mantener estructura limpia, premium y escalable
   - tolerar payloads parciales sin romper pintado
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   BASICS
========================================================= */

function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeText(
  value,
  fallback = "—"
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(
  value,
  fallback = 0
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeBool(
  value,
  fallback = false
) {
  return typeof value === "boolean"
    ? value
    : fallback;
}

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat(
      "es-ES"
    ).format(
      safeNumber(value, 0)
    );
  } catch {
    return "0";
  }
}

function formatMoney(value = 0) {
  try {
    return new Intl.NumberFormat(
      "es-ES",
      {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
      }
    ).format(
      safeNumber(value, 0)
    );
  } catch {
    return `${safeNumber(value, 0)} €`;
  }
}

function formatDateTime(value = "") {
  try {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "es-ES",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    ).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(
  value = ""
) {
  try {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    const diffMs =
      date.getTime() - Date.now();

    const absMs =
      Math.abs(diffMs);

    const minute =
      1000 * 60;
    const hour =
      minute * 60;
    const day =
      hour * 24;

    if (absMs < minute) {
      return diffMs >= 0
        ? "En unos segundos"
        : "Ahora mismo";
    }

    if (absMs < hour) {
      const minutes = Math.round(
        absMs / minute
      );

      return diffMs >= 0
        ? `En ${minutes} min`
        : `Hace ${minutes} min`;
    }

    if (absMs < day) {
      const hours = Math.round(
        absMs / hour
      );

      return diffMs >= 0
        ? `En ${hours} h`
        : `Hace ${hours} h`;
    }

    return formatDateTime(value);
  } catch {
    return "—";
  }
}

function getGreetingByHour() {
  const hour = new Date().getHours();

  if (hour < 6) {
    return "Buenas noches";
  }

  if (hour < 12) {
    return "Buenos días";
  }

  if (hour < 20) {
    return "Buenas tardes";
  }

  return "Buenas noches";
}

function resolveDisplayName(user) {
  try {
    const byCore =
      typeof AppCore?.getUserDisplayName ===
      "function"
        ? AppCore.getUserDisplayName(user)
        : "";

    if (
      String(byCore || "").trim()
    ) {
      return String(byCore).trim();
    }
  } catch {}

  return safeText(
    user?.username ||
      user?.name ||
      user?.email,
    "equipo"
  );
}

function resolveUserRole(user) {
  return safeText(
    user?.role ||
      user?.rol,
    "unknown"
  );
}

function resolveSpaHref(
  href = "#"
) {
  try {
    if (
      typeof AppCore?.utils
        ?.resolveSpaHref ===
      "function"
    ) {
      return AppCore.utils.resolveSpaHref(
        href
      );
    }
  } catch {}

  return safeText(href, "#");
}

/* =========================================================
   SUMMARY NORMALIZATION
========================================================= */

function looksLikeSummaryPayload(
  value
) {
  const obj = safeObject(value);

  return Boolean(
    obj.generatedAt ||
      obj.kpis ||
      obj.alerts ||
      obj.recentActivity ||
      obj.quickActions ||
      obj.health ||
      obj.user
  );
}

function unwrapSummaryEnvelope(
  value
) {
  const raw = safeObject(value);

  if (
    looksLikeSummaryPayload(raw)
  ) {
    return raw;
  }

  const data = safeObject(raw.data);

  if (
    looksLikeSummaryPayload(data)
  ) {
    return data;
  }

  const dataData =
    safeObject(data.data);

  if (
    looksLikeSummaryPayload(
      dataData
    )
  ) {
    return dataData;
  }

  const summary =
    safeObject(raw.summary);

  if (
    looksLikeSummaryPayload(
      summary
    )
  ) {
    return summary;
  }

  const dataSummary =
    safeObject(data.summary);

  if (
    looksLikeSummaryPayload(
      dataSummary
    )
  ) {
    return dataSummary;
  }

  return {};
}

/* =========================================================
   STATE RESOLUTION
========================================================= */

function resolveHomeState(
  options = {}
) {
  const home = safeObject(
    options?.home
  );

  const summary =
    unwrapSummaryEnvelope(
      home.summary
    );

  const kpis = safeObject(
    summary.kpis
  );

  const health = safeObject(
    summary.health
  );

  return {
    loading:
      home.loading === true,

    loaded:
      home.loaded === true,

    error:
      home.error || null,

    source: safeText(
      home.source,
      "idle"
    ),

    remoteOk:
      home.remoteOk === true,

    degraded:
      home.degraded === true,

    cacheHit:
      home.cacheHit === true,

    lastSyncAt: safeText(
      home.lastSyncAt ||
        summary.generatedAt,
      ""
    ),

    hydratedAt: safeText(
      home.hydratedAt,
      ""
    ),

    summary: {
      user: safeObject(
        summary.user
      ),

      generatedAt: safeText(
        summary.generatedAt,
        ""
      ),

      alerts: safeArray(
        summary.alerts
      ),

      recentActivity: safeArray(
        summary.recentActivity
      ),

      quickActions: safeArray(
        summary.quickActions
      ),

      health: {
        tickets: safeBool(
          health.tickets,
          false
        ),
        clientes: safeBool(
          health.clientes,
          false
        ),
        facturas: safeBool(
          health.facturas,
          false
        ),
        users: safeBool(
          health.users,
          false
        ),
      },

      kpis: {
        ticketsOpen:
          safeNumber(
            kpis.ticketsOpen,
            0
          ),
        ticketsUrgent:
          safeNumber(
            kpis.ticketsUrgent,
            0
          ),
        clientesTotal:
          safeNumber(
            kpis.clientesTotal,
            0
          ),
        facturasPending:
          safeNumber(
            kpis.facturasPending,
            0
          ),
        usersTotal:
          safeNumber(
            kpis.usersTotal,
            0
          ),
        facturacionTotal:
          safeNumber(
            kpis.facturacionTotal,
            0
          ),
      },
    },
  };
}

/* =========================================================
   DERIVED HELPERS
========================================================= */

function getSourceLabel(
  state = {}
) {
  const source = safeText(
    state.source,
    "idle"
  );

  if (source === "remote") {
    return "Live";
  }

  if (source === "cache:fresh") {
    return "Cache fresca";
  }

  if (source === "cache:stale") {
    return "Cache stale";
  }

  if (source === "fallback:local") {
    return "Fallback local";
  }

  if (source === "error") {
    return "Error";
  }

  return "Idle";
}

function getSourceBadgeClass(
  state = {}
) {
  const source = safeText(
    state.source,
    "idle"
  );

  if (source === "remote") {
    return "home-badge--live";
  }

  if (
    source === "cache:fresh"
  ) {
    return "home-badge--cache";
  }

  if (
    source === "cache:stale"
  ) {
    return "home-badge--warning";
  }

  if (
    source === "fallback:local" ||
    source === "error"
  ) {
    return "home-badge--danger";
  }

  return "";
}

function hasMeaningfulData(
  state = {}
) {
  const k = safeObject(
    state.summary?.kpis
  );

  const total =
    safeNumber(
      k.ticketsOpen,
      0
    ) +
    safeNumber(
      k.ticketsUrgent,
      0
    ) +
    safeNumber(
      k.clientesTotal,
      0
    ) +
    safeNumber(
      k.facturasPending,
      0
    ) +
    safeNumber(
      k.usersTotal,
      0
    ) +
    safeNumber(
      k.facturacionTotal,
      0
    );

  return total > 0;
}

function renderStatusHint(
  state = {}
) {
  if (state.degraded === true) {
    return "Visualizando datos degradados. El resumen remoto no está disponible ahora mismo.";
  }

  if (state.cacheHit === true) {
    return "Visualizando datos servidos desde caché.";
  }

  if (state.remoteOk === true) {
    return "Datos sincronizados correctamente con el backend.";
  }

  return "Sincronización pendiente.";
}

/* =========================================================
   PARTIALS
========================================================= */

function renderHero({
  user = null,
  state = {},
} = {}) {
  const displayName =
    resolveDisplayName(
      user ||
        state.summary?.user ||
        null
    );

  const greeting =
    getGreetingByHour();

  const syncText =
    state.lastSyncAt
      ? `Última sincronización: ${formatDateTime(
          state.lastSyncAt
        )}`
      : "Sincronización pendiente";

  const roleText =
    resolveUserRole(
      user ||
        state.summary?.user ||
        null
    );

  const sourceLabel =
    getSourceLabel(state);

  const sourceClass =
    getSourceBadgeClass(state);

  const hint =
    renderStatusHint(state);

  return `
    <section class="home-hero">
      <div class="home-hero__eyebrow">
        Onion Support · Dashboard
      </div>

      <div class="home-hero__content">
        <div class="home-hero__copy">
          <h1 class="home-hero__title">
            ${escapeHtml(greeting)},
            ${escapeHtml(displayName)}
          </h1>

          <p class="home-hero__subtitle">
            Centro operativo principal. Control de tickets,
            facturación, clientes, usuarios y salud general del sistema.
          </p>

          <div class="home-hero__meta">
            <span class="home-meta-pill">
              Rol: ${escapeHtml(roleText)}
            </span>

            <span class="home-meta-pill">
              ${escapeHtml(syncText)}
            </span>

            <span class="home-badge ${escapeHtml(sourceClass)}">
              ${escapeHtml(sourceLabel)}
            </span>
          </div>

          <p class="home-hero__hint">
            ${escapeHtml(hint)}
          </p>
        </div>
      </div>
    </section>
  `;
}

function renderKpi({
  label = "",
  value = "",
  accent = "",
  helper = "",
} = {}) {
  return `
    <article class="home-kpi ${escapeHtml(accent)}">
      <div class="home-kpi__label">
        ${escapeHtml(label)}
      </div>

      <div class="home-kpi__value">
        ${escapeHtml(value)}
      </div>

      ${
        helper
          ? `
        <div class="home-kpi__helper">
          ${escapeHtml(helper)}
        </div>
      `
          : ""
      }
    </article>
  `;
}

function renderKpis(
  state = {}
) {
  const k = safeObject(
    state.summary?.kpis
  );

  return `
    <section class="home-grid home-grid--3">
      ${renderKpi({
        label: "Tickets abiertos",
        value: formatNumber(
          k.ticketsOpen
        ),
        helper:
          "Carga operativa actual",
      })}

      ${renderKpi({
        label: "Tickets urgentes",
        value: formatNumber(
          k.ticketsUrgent
        ),
        accent:
          "is-warning",
        helper:
          "Prioridad alta",
      })}

      ${renderKpi({
        label: "Clientes",
        value: formatNumber(
          k.clientesTotal
        ),
        helper:
          "Base activa",
      })}

      ${renderKpi({
        label: "Facturas pendientes",
        value: formatNumber(
          k.facturasPending
        ),
        helper:
          "Cobro pendiente",
      })}

      ${renderKpi({
        label: "Usuarios",
        value: formatNumber(
          k.usersTotal
        ),
        helper:
          "Accesos registrados",
      })}

      ${renderKpi({
        label: "Facturación",
        value: formatMoney(
          k.facturacionTotal
        ),
        accent:
          "is-success",
        helper:
          "Volumen total",
      })}
    </section>
  `;
}

function renderAlerts(
  state = {}
) {
  const alerts = safeArray(
    state.summary?.alerts
  );

  if (!alerts.length) {
    return `
      <section class="home-panel">
        <div class="home-panel__top">
          <h3 class="home-panel__title">
            Alertas
          </h3>
          <span class="home-panel__count">
            0 activas
          </span>
        </div>

        <div class="home-empty home-empty--compact">
          Sin alertas activas.
        </div>
      </section>
    `;
  }

  return `
    <section class="home-panel">
      <div class="home-panel__top">
        <h3 class="home-panel__title">
          Alertas
        </h3>
        <span class="home-panel__count">
          ${escapeHtml(
            formatNumber(
              alerts.length
            )
          )} activas
        </span>
      </div>

      <div class="home-list">
        ${alerts
          .map((item) => {
            const level = safeText(
              item?.level,
              "info"
            );

            const levelClass =
              level === "error" ||
              level === "danger"
                ? "home-row--danger"
                : level === "warning"
                ? "home-row--warning"
                : level === "success"
                ? "home-row--success"
                : "";

            return `
              <div class="home-row ${levelClass}">
                <span class="home-dot"></span>

                <div class="home-row__content">
                  <span class="home-row__title">
                    ${escapeHtml(
                      item?.message ||
                        "Alerta"
                    )}
                  </span>
                  <span class="home-row__muted home-row__muted--block">
                    ${escapeHtml(
                      safeText(
                        item?.code,
                        "SIN_CODIGO"
                      )
                    )}
                  </span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderRecent(
  state = {}
) {
  const rows = safeArray(
    state.summary
      ?.recentActivity
  );

  if (!rows.length) {
    return `
      <section class="home-panel">
        <div class="home-panel__top">
          <h3 class="home-panel__title">
            Actividad reciente
          </h3>
        </div>

        <div class="home-empty home-empty--compact">
          Sin actividad reciente.
        </div>
      </section>
    `;
  }

  return `
    <section class="home-panel">
      <div class="home-panel__top">
        <h3 class="home-panel__title">
          Actividad reciente
        </h3>
        <span class="home-panel__count">
          ${escapeHtml(
            formatNumber(
              rows.length
            )
          )} items
        </span>
      </div>

      <div class="home-list">
        ${rows
          .map(
            (item) => `
          <div class="home-row home-row--between">
            <div class="home-row__content">
              <span class="home-row__title">
                ${escapeHtml(
                  item?.text ||
                    item?.label ||
                    "Movimiento"
                )}
              </span>

              <span class="home-row__muted home-row__muted--block">
                ${escapeHtml(
                  safeText(
                    item?.id,
                    ""
                  )
                )}
              </span>
            </div>

            <span class="home-row__muted">
              ${escapeHtml(
                formatRelativeDate(
                  item?.date ||
                    item?.createdAt
                )
              )}
            </span>
          </div>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderQuickActions(
  state = {}
) {
  const actions = safeArray(
    state.summary
      ?.quickActions
  );

  if (!actions.length) {
    return `
      <section class="home-panel">
        <div class="home-panel__top">
          <h3 class="home-panel__title">
            Acciones rápidas
          </h3>
        </div>

        <div class="home-empty home-empty--compact">
          Sin acciones rápidas configuradas.
        </div>
      </section>
    `;
  }

  return `
    <section class="home-panel">
      <div class="home-panel__top">
        <h3 class="home-panel__title">
          Acciones rápidas
        </h3>
      </div>

      <div class="home-actions">
        ${actions
          .map(
            (item) => `
          <a
            class="home-action"
            href="${escapeHtml(
              resolveSpaHref(
                item?.href || "#"
              )
            )}"
            data-spa
            data-home-action="${escapeHtml(
              safeText(
                item?.key,
                "action"
              )
            )}"
            aria-label="${escapeHtml(
              safeText(
                item?.label,
                "Acción"
              )
            )}"
          >
            <span class="home-action__label">
              ${escapeHtml(
                item?.label ||
                  "Acción"
              )}
            </span>

            <span class="home-action__arrow">
              →
            </span>
          </a>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderHealth(
  state = {}
) {
  const health = safeObject(
    state.summary?.health
  );

  const items = [
    {
      key: "tickets",
      label: "Tickets",
      ok: health.tickets,
    },
    {
      key: "clientes",
      label: "Clientes",
      ok: health.clientes,
    },
    {
      key: "facturas",
      label: "Facturas",
      ok: health.facturas,
    },
    {
      key: "users",
      label: "Usuarios",
      ok: health.users,
    },
  ];

  return `
    <section class="home-panel">
      <div class="home-panel__top">
        <h3 class="home-panel__title">
          Salud del sistema
        </h3>
      </div>

      <div class="home-health-grid">
        ${items
          .map(
            (item) => `
          <div class="home-health-card">
            <span class="home-health-card__label">
              ${escapeHtml(
                item.label
              )}
            </span>

            <span class="home-health-state ${
              item.ok
                ? "is-ok"
                : "is-ko"
            }">
              ${
                item.ok
                  ? "Operativo"
                  : "Sin validar"
              }
            </span>
          </div>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderEmptyState() {
  return `
    <section class="home-panel">
      <div class="home-empty home-empty--xl">
        <div class="home-empty__title">
          Dashboard sin datos relevantes todavía
        </div>

        <div class="home-empty__text">
          El backend aún no ha devuelto actividad operativa, KPIs o alertas
          con volumen suficiente para poblar la Home.
        </div>
      </div>
    </section>
  `;
}

function renderLoading() {
  return `
    <section class="home-grid home-grid--3">
      ${Array.from({ length: 6 })
        .map(
          () => `
        <article class="home-kpi home-kpi--skeleton">
          <div class="home-skeleton home-skeleton--sm"></div>
          <div class="home-skeleton home-skeleton--lg"></div>
          <div class="home-skeleton home-skeleton--xs"></div>
        </article>
      `
        )
        .join("")}
      <section class="home-panel home-panel--skeleton home-span-2">
        <div class="home-skeleton home-skeleton--sm"></div>
        <div class="home-skeleton-list">
          ${Array.from({ length: 4 })
            .map(
              () => `
            <div class="home-skeleton-row"></div>
          `
            )
            .join("")}
        </div>
      </section>
      <section class="home-panel home-panel--skeleton">
        <div class="home-skeleton home-skeleton--sm"></div>
        <div class="home-skeleton-list">
          ${Array.from({ length: 4 })
            .map(
              () => `
            <div class="home-skeleton-row"></div>
          `
            )
            .join("")}
        </div>
      </section>
    </section>
  `;
}

function renderError(
  error = null
) {
  const message = safeText(
    error?.message ||
      error ||
      "Error cargando datos del dashboard.",
    "Error cargando datos del dashboard."
  );

  return `
    <section class="home-panel">
      <div class="home-error">
        <div class="home-error__title">
          No se pudo cargar el dashboard
        </div>

        <div class="home-error__text">
          ${escapeHtml(message)}
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   STYLES
========================================================= */

function renderStyles() {
  return `
  <style>
    .home-view{
      width:100%;
      display:grid;
      gap:24px;
      padding:24px;
    }

    .home-hero,
    .home-panel,
    .home-kpi,
    .home-health-card,
    .home-action{
      border-radius:28px;
      border:1px solid rgba(255,255,255,.08);
      background:
        linear-gradient(
          180deg,
          rgba(255,255,255,.03),
          rgba(255,255,255,.01)
        ),
        rgba(24,24,27,.72);
      box-shadow:
        0 18px 48px rgba(0,0,0,.16),
        inset 0 1px 0 rgba(255,255,255,.04);
    }

    .home-hero,
    .home-panel{
      padding:28px;
    }

    .home-hero__content,
    .home-hero__copy{
      display:grid;
      gap:14px;
    }

    .home-hero__eyebrow,
    .home-badge,
    .home-meta-pill{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:max-content;
      min-height:30px;
      padding:0 12px;
      border-radius:999px;
      font-size:12px;
      font-weight:800;
      letter-spacing:.08em;
      text-transform:uppercase;
    }

    .home-hero__eyebrow{
      color:var(--text-soft);
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
    }

    .home-meta-pill{
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
      color:var(--text-dim);
    }

    .home-badge{
      color:var(--text-strong);
    }

    .home-badge--live{
      background:rgba(34,197,94,.10);
      color:#86efac;
      border:1px solid rgba(34,197,94,.14);
    }

    .home-badge--cache{
      background:rgba(59,130,246,.10);
      color:#93c5fd;
      border:1px solid rgba(59,130,246,.14);
    }

    .home-badge--warning{
      background:rgba(245,158,11,.10);
      color:#fcd34d;
      border:1px solid rgba(245,158,11,.14);
    }

    .home-badge--danger{
      background:rgba(239,68,68,.10);
      color:#fca5a5;
      border:1px solid rgba(239,68,68,.14);
    }

    .home-hero__title{
      margin:0;
      font-size:clamp(30px,4vw,46px);
      line-height:1.04;
      letter-spacing:-.03em;
      font-weight:900;
      color:var(--text-strong);
    }

    .home-hero__subtitle{
      margin:0;
      color:var(--text-dim);
      line-height:1.65;
      max-width:78ch;
    }

    .home-hero__meta{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      color:var(--text-muted);
      font-size:13px;
    }

    .home-hero__hint{
      margin:0;
      color:var(--text-muted);
      font-size:13px;
      line-height:1.6;
    }

    .home-grid{
      display:grid;
      gap:18px;
    }

    .home-grid--3{
      grid-template-columns:repeat(3,minmax(0,1fr));
    }

    .home-grid--2{
      grid-template-columns:repeat(2,minmax(0,1fr));
    }

    .home-span-2{
      grid-column:span 2;
    }

    .home-kpi{
      padding:22px;
      display:grid;
      gap:10px;
    }

    .home-kpi__label{
      font-size:12px;
      letter-spacing:.08em;
      text-transform:uppercase;
      font-weight:800;
      color:var(--text-dim);
    }

    .home-kpi__value{
      font-size:30px;
      line-height:1;
      font-weight:900;
      letter-spacing:-.03em;
      color:var(--text-strong);
    }

    .home-kpi__helper{
      font-size:12px;
      color:var(--text-muted);
      line-height:1.5;
    }

    .is-warning{
      border-color:rgba(245,158,11,.20);
    }

    .is-success{
      border-color:rgba(34,197,94,.20);
    }

    .home-panel__top{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
    }

    .home-panel__title{
      margin:0;
      font-size:16px;
      font-weight:800;
      color:var(--text-strong);
    }

    .home-panel__count{
      color:var(--text-muted);
      font-size:12px;
      font-weight:700;
      letter-spacing:.04em;
      text-transform:uppercase;
    }

    .home-list{
      display:grid;
      gap:12px;
      margin-top:18px;
    }

    .home-row{
      display:flex;
      gap:10px;
      align-items:center;
      min-height:48px;
      padding:14px;
      border-radius:16px;
      background:rgba(255,255,255,.025);
      color:var(--text-dim);
      border:1px solid transparent;
    }

    .home-row--between{
      justify-content:space-between;
    }

    .home-row--warning{
      border-color:rgba(245,158,11,.12);
    }

    .home-row--danger{
      border-color:rgba(239,68,68,.12);
    }

    .home-row--success{
      border-color:rgba(34,197,94,.12);
    }

    .home-row__content{
      display:grid;
      gap:4px;
      min-width:0;
    }

    .home-row__title{
      color:var(--text-strong);
      font-weight:700;
      line-height:1.45;
      word-break:break-word;
    }

    .home-row__muted{
      color:var(--text-muted);
      font-size:12px;
      text-align:right;
      flex:0 0 auto;
      padding-left:12px;
    }

    .home-row__muted--block{
      display:block;
      text-align:left;
      padding-left:0;
    }

    .home-dot{
      width:8px;
      height:8px;
      border-radius:50%;
      background:#f59e0b;
      flex:0 0 auto;
      margin-top:6px;
    }

    .home-actions{
      display:grid;
      gap:12px;
      margin-top:18px;
    }

    .home-action{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:18px 20px;
      text-decoration:none;
      color:var(--text-strong);
      transition:
        transform .18s ease,
        border-color .18s ease,
        background .18s ease;
    }

    .home-action:hover{
      transform:translateY(-1px);
      border-color:rgba(255,255,255,.14);
      background:
        linear-gradient(
          180deg,
          rgba(255,255,255,.05),
          rgba(255,255,255,.02)
        ),
        rgba(24,24,27,.72);
    }

    .home-action__label{
      font-weight:800;
      line-height:1.4;
    }

    .home-action__arrow{
      color:var(--text-muted);
      font-size:16px;
      flex:0 0 auto;
    }

    .home-health-grid{
      display:grid;
      gap:12px;
      margin-top:18px;
      grid-template-columns:repeat(2,minmax(0,1fr));
    }

    .home-health-card{
      padding:18px;
      display:grid;
      gap:10px;
    }

    .home-health-card__label{
      color:var(--text-dim);
      font-size:12px;
      font-weight:800;
      letter-spacing:.08em;
      text-transform:uppercase;
    }

    .home-health-state{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:max-content;
      min-height:30px;
      padding:0 12px;
      border-radius:999px;
      font-size:12px;
      font-weight:800;
      letter-spacing:.05em;
      text-transform:uppercase;
    }

    .home-health-state.is-ok{
      background:rgba(34,197,94,.10);
      color:#86efac;
      border:1px solid rgba(34,197,94,.14);
    }

    .home-health-state.is-ko{
      background:rgba(245,158,11,.10);
      color:#fcd34d;
      border:1px solid rgba(245,158,11,.14);
    }

    .home-empty,
    .home-loading,
    .home-error{
      min-height:120px;
      display:grid;
      place-items:center;
      border-radius:20px;
      text-align:center;
      padding:18px;
      margin-top:18px;
    }

    .home-empty{
      color:var(--text-dim);
      border:1px dashed rgba(255,255,255,.08);
    }

    .home-empty--compact{
      min-height:110px;
    }

    .home-empty--xl{
      min-height:220px;
      gap:10px;
    }

    .home-empty__title{
      font-size:20px;
      line-height:1.2;
      font-weight:900;
      color:var(--text-strong);
    }

    .home-empty__text{
      color:var(--text-dim);
      max-width:62ch;
      line-height:1.7;
    }

    .home-error{
      gap:10px;
      color:#fca5a5;
      background:rgba(239,68,68,.05);
      border:1px solid rgba(239,68,68,.12);
    }

    .home-error__title{
      font-size:20px;
      line-height:1.2;
      font-weight:900;
      color:#fecaca;
    }

    .home-error__text{
      color:#fca5a5;
      line-height:1.7;
      max-width:64ch;
    }

    .home-panel--skeleton,
    .home-kpi--skeleton{
      overflow:hidden;
    }

    .home-skeleton{
      border-radius:999px;
      background:
        linear-gradient(
          90deg,
          rgba(255,255,255,.05) 0%,
          rgba(255,255,255,.10) 50%,
          rgba(255,255,255,.05) 100%
        );
      background-size:200% 100%;
      animation:homeSkeleton 1.4s linear infinite;
    }

    .home-skeleton--xs{
      width:36%;
      height:12px;
    }

    .home-skeleton--sm{
      width:42%;
      height:14px;
    }

    .home-skeleton--lg{
      width:64%;
      height:34px;
    }

    .home-skeleton-list{
      display:grid;
      gap:12px;
      margin-top:18px;
    }

    .home-skeleton-row{
      height:48px;
      border-radius:16px;
      background:
        linear-gradient(
          90deg,
          rgba(255,255,255,.04) 0%,
          rgba(255,255,255,.09) 50%,
          rgba(255,255,255,.04) 100%
        );
      background-size:200% 100%;
      animation:homeSkeleton 1.4s linear infinite;
    }

    @keyframes homeSkeleton{
      0%{
        background-position:200% 0;
      }
      100%{
        background-position:-200% 0;
      }
    }

    [data-theme="light"] .home-hero,
    [data-theme="light"] .home-panel,
    [data-theme="light"] .home-kpi,
    [data-theme="light"] .home-health-card,
    [data-theme="light"] .home-action{
      border-color:rgba(15,23,42,.08);
      background:
        linear-gradient(
          180deg,
          rgba(255,255,255,.94),
          rgba(255,255,255,.82)
        ),
        rgba(255,255,255,.92);
      box-shadow:
        0 18px 44px rgba(15,23,42,.08),
        inset 0 1px 0 rgba(255,255,255,.82);
    }

    [data-theme="light"] .home-row{
      background:rgba(15,23,42,.025);
    }

    [data-theme="light"] .home-empty{
      border-color:rgba(15,23,42,.08);
    }

    @media (max-width:1200px){
      .home-grid--3{
        grid-template-columns:repeat(2,minmax(0,1fr));
      }

      .home-span-2{
        grid-column:auto;
      }
    }

    @media (max-width:760px){
      .home-view{
        padding:16px;
        gap:16px;
      }

      .home-grid--3,
      .home-grid--2,
      .home-health-grid{
        grid-template-columns:1fr;
      }

      .home-hero,
      .home-panel,
      .home-kpi,
      .home-health-card,
      .home-action{
        border-radius:22px;
      }

      .home-hero,
      .home-panel{
        padding:20px;
      }

      .home-kpi{
        padding:18px;
      }

      .home-row,
      .home-row--between{
        align-items:flex-start;
        flex-direction:column;
      }

      .home-row__muted{
        padding-left:0;
        text-align:left;
      }

      .home-action{
        padding:16px 18px;
      }
    }
  </style>
  `;
}

/* =========================================================
   FULL TEMPLATE
========================================================= */

export function getHomeTemplate(
  options = {}
) {
  const user =
    options?.user || null;

  const state =
    resolveHomeState(
      options
    );

  let body = "";

  if (state.error) {
    body = renderError(
      state.error
    );
  } else if (
    state.loading &&
    state.loaded !== true
  ) {
    body = renderLoading();
  } else if (
    hasMeaningfulData(state) ||
    safeArray(
      state.summary?.alerts
    ).length > 0 ||
    safeArray(
      state.summary
        ?.recentActivity
    ).length > 0 ||
    safeArray(
      state.summary
        ?.quickActions
    ).length > 0
  ) {
    body = `
      ${renderKpis(state)}

      <section class="home-grid home-grid--2">
        ${renderAlerts(state)}
        ${renderRecent(state)}
      </section>

      <section class="home-grid home-grid--2">
        ${renderQuickActions(state)}
        ${renderHealth(state)}
      </section>
    `;
  } else {
    body = renderEmptyState();
  }

  return `
    ${renderStyles()}

    <section
      class="home-view"
      data-view="home"
      data-home-view="true"
      data-home-source="${escapeHtml(
        safeText(
          state.source,
          "idle"
        )
      )}"
      data-home-degraded="${
        state.degraded === true
          ? "true"
          : "false"
      }"
    >
      ${renderHero({
        user,
        state,
      })}

      ${body}
    </section>
  `;
}

export {
  getHomeTemplate as HomeTemplate,
};

export default getHomeTemplate;
