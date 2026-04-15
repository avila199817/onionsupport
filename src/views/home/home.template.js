/* =========================================================
   Onion SPA - Home Template
   Archivo: src/views/home/home.template.js

   Responsabilidades:
   - renderizar la vista Home premium EXTREME MODE
   - consumir estado real del módulo Home
   - mostrar hero contextual con usuario autenticado
   - renderizar KPIs dinámicos
   - mostrar alertas operativas
   - mostrar actividad reciente
   - soportar loading / error / empty states
   - mantener estructura limpia, premium y escalable
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

function safeText(value, fallback = "—") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
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

function formatNumber(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(
      safeNumber(value, 0)
    );
  } catch {
    return "0";
  }
}

function formatMoney(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(safeNumber(value, 0));
  } catch {
    return `${safeNumber(value, 0)} €`;
  }
}

function formatDateTime(value = "") {
  try {
    if (!value) return "—";

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

function getGreetingByHour() {
  const hour = new Date().getHours();

  if (hour < 6) return "Buenas noches";
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";

  return "Buenas noches";
}

function resolveDisplayName(user) {
  try {
    const byCore =
      typeof AppCore?.getUserDisplayName ===
      "function"
        ? AppCore.getUserDisplayName(user)
        : "";

    if (String(byCore || "").trim()) {
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

/* =========================================================
   STATE
========================================================= */

function resolveHomeState(options = {}) {
  const home =
    safeObject(options?.home);

  const summary =
    safeObject(home.summary);

  const kpis =
    safeObject(summary.kpis);

  return {
    loading:
      home.loading === true,

    loaded:
      home.loaded === true,

    error:
      home.error || null,

    cacheHit:
      home.cacheHit === true,

    lastSyncAt:
      safeText(
        home.lastSyncAt,
        ""
      ),

    summary: {
      generatedAt:
        safeText(
          summary.generatedAt,
          ""
        ),

      alerts:
        safeArray(
          summary.alerts
        ),

      recentActivity:
        safeArray(
          summary.recentActivity
        ),

      kpis: {
        ticketsOpen:
          safeNumber(
            kpis.ticketsOpen
          ),

        ticketsUrgent:
          safeNumber(
            kpis.ticketsUrgent
          ),

        clientesTotal:
          safeNumber(
            kpis.clientesTotal
          ),

        facturasPending:
          safeNumber(
            kpis.facturasPending
          ),

        usersTotal:
          safeNumber(
            kpis.usersTotal
          ),

        facturacionTotal:
          safeNumber(
            kpis.facturacionTotal
          ),
      },
    },
  };
}

/* =========================================================
   PARTIALS
========================================================= */

function renderHero({
  user = null,
  state = {},
} = {}) {
  const displayName =
    resolveDisplayName(user);

  const greeting =
    getGreetingByHour();

  const syncText =
    state.lastSyncAt
      ? `Última sincronización: ${formatDateTime(
          state.lastSyncAt
        )}`
      : "Sincronización pendiente";

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
            Centro operativo principal.
            Control de tickets, facturación,
            clientes y actividad global.
          </p>

          <div class="home-hero__meta">
            <span>
              ${escapeHtml(syncText)}
            </span>

            ${
              state.cacheHit
                ? `
              <span class="home-badge home-badge--cache">
                Cache
              </span>
            `
                : `
              <span class="home-badge">
                Live
              </span>
            `
            }
          </div>

        </div>
      </div>
    </section>
  `;
}

function renderKpi({
  label = "",
  value = "",
  accent = "",
} = {}) {
  return `
    <article class="home-kpi ${accent}">
      <div class="home-kpi__label">
        ${escapeHtml(label)}
      </div>

      <div class="home-kpi__value">
        ${escapeHtml(value)}
      </div>
    </article>
  `;
}

function renderKpis(state = {}) {
  const k =
    state.summary.kpis;

  return `
    <section class="home-grid home-grid--4">

      ${renderKpi({
        label: "Tickets abiertos",
        value: formatNumber(
          k.ticketsOpen
        ),
      })}

      ${renderKpi({
        label: "Urgentes",
        value: formatNumber(
          k.ticketsUrgent
        ),
        accent:
          "is-warning",
      })}

      ${renderKpi({
        label: "Facturas pendientes",
        value: formatNumber(
          k.facturasPending
        ),
      })}

      ${renderKpi({
        label: "Facturación",
        value: formatMoney(
          k.facturacionTotal
        ),
        accent:
          "is-success",
      })}

    </section>
  `;
}

function renderAlerts(state = {}) {
  const alerts =
    safeArray(
      state.summary.alerts
    );

  if (!alerts.length) {
    return `
      <div class="home-empty">
        Sin alertas activas.
      </div>
    `;
  }

  return `
    <section class="home-panel">
      <div class="home-panel__top">
        <h3 class="home-panel__title">
          Alertas
        </h3>
      </div>

      <div class="home-list">
        ${alerts
          .map(
            (item) => `
          <div class="home-row">
            <span class="home-dot"></span>
            <span>
              ${escapeHtml(
                item?.message ||
                "Alerta"
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

function renderRecent(state = {}) {
  const rows =
    safeArray(
      state.summary
        .recentActivity
    );

  if (!rows.length) {
    return `
      <div class="home-empty">
        Sin actividad reciente.
      </div>
    `;
  }

  return `
    <section class="home-panel">
      <div class="home-panel__top">
        <h3 class="home-panel__title">
          Actividad reciente
        </h3>
      </div>

      <div class="home-list">
        ${rows
          .map(
            (item) => `
          <div class="home-row home-row--between">
            <span>
              ${escapeHtml(
                item?.text ||
                item?.label ||
                "Movimiento"
              )}
            </span>

            <span class="home-row__muted">
              ${escapeHtml(
                formatDateTime(
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

function renderQuickStats(
  state = {}
) {
  const k =
    state.summary.kpis;

  return `
    <section class="home-grid home-grid--2">

      <div class="home-panel">
        <div class="home-panel__top">
          <h3 class="home-panel__title">
            Clientes
          </h3>
        </div>

        <div class="home-big-number">
          ${formatNumber(
            k.clientesTotal
          )}
        </div>
      </div>

      <div class="home-panel">
        <div class="home-panel__top">
          <h3 class="home-panel__title">
            Usuarios
          </h3>
        </div>

        <div class="home-big-number">
          ${formatNumber(
            k.usersTotal
          )}
        </div>
      </div>

    </section>
  `;
}

function renderLoading() {
  return `
    <section class="home-panel">
      <div class="home-loading">
        Cargando dashboard...
      </div>
    </section>
  `;
}

function renderError() {
  return `
    <section class="home-panel">
      <div class="home-error">
        Error cargando datos del dashboard.
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
    .home-kpi{
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
    .home-badge{
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

    .home-badge{
      background:rgba(34,197,94,.10);
      color:#86efac;
      border:1px solid rgba(34,197,94,.14);
    }

    .home-badge--cache{
      background:rgba(245,158,11,.10);
      color:#fcd34d;
      border:1px solid rgba(245,158,11,.14);
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
      max-width:72ch;
    }

    .home-hero__meta{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      color:var(--text-muted);
      font-size:13px;
    }

    .home-grid{
      display:grid;
      gap:18px;
    }

    .home-grid--4{
      grid-template-columns:repeat(4,minmax(0,1fr));
    }

    .home-grid--2{
      grid-template-columns:repeat(2,minmax(0,1fr));
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

    .is-warning{
      border-color:rgba(245,158,11,.20);
    }

    .is-success{
      border-color:rgba(34,197,94,.20);
    }

    .home-panel__title{
      margin:0;
      font-size:16px;
      font-weight:800;
      color:var(--text-strong);
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
      min-height:42px;
      padding:0 14px;
      border-radius:16px;
      background:rgba(255,255,255,.025);
      color:var(--text-dim);
    }

    .home-row--between{
      justify-content:space-between;
    }

    .home-row__muted{
      color:var(--text-muted);
      font-size:12px;
    }

    .home-dot{
      width:8px;
      height:8px;
      border-radius:50%;
      background:#f59e0b;
      flex:0 0 auto;
    }

    .home-big-number{
      font-size:42px;
      font-weight:900;
      line-height:1;
      color:var(--text-strong);
      margin-top:18px;
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
    }

    .home-empty{
      color:var(--text-dim);
      border:1px dashed rgba(255,255,255,.08);
    }

    .home-loading{
      color:var(--text-dim);
    }

    .home-error{
      color:#fca5a5;
      background:rgba(239,68,68,.05);
      border:1px solid rgba(239,68,68,.12);
    }

    [data-theme="light"] .home-hero,
    [data-theme="light"] .home-panel,
    [data-theme="light"] .home-kpi{
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

    @media (max-width:1200px){
      .home-grid--4{
        grid-template-columns:repeat(2,minmax(0,1fr));
      }
    }

    @media (max-width:760px){
      .home-view{
        padding:16px;
        gap:16px;
      }

      .home-grid--4,
      .home-grid--2{
        grid-template-columns:1fr;
      }

      .home-hero,
      .home-panel,
      .home-kpi{
        border-radius:22px;
      }

      .home-hero,
      .home-panel{
        padding:20px;
      }

      .home-kpi{
        padding:18px;
      }

      .home-big-number{
        font-size:34px;
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
    body = renderError();
  } else if (
    state.loading &&
    !state.loaded
  ) {
    body = renderLoading();
  } else {
    body = `
      ${renderKpis(state)}

      <section class="home-grid home-grid--2">
        ${renderAlerts(state)}
        ${renderRecent(state)}
      </section>

      ${renderQuickStats(state)}
    `;
  }

  return `
    ${renderStyles()}

    <section
      class="home-view"
      data-view="home"
      data-home-view="true"
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
