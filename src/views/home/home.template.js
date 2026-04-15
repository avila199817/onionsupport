/* =========================================================
   Onion SPA - Home Template
   Archivo: src/views/home/home.template.js

   Responsabilidades:
   - renderizar la vista Home premium
   - consumir estado real del módulo Home
   - mostrar hero contextual con usuario autenticado
   - renderizar métricas dinámicas
   - soportar loading / error / empty states
   - mantener estructura limpia y escalable
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

function formatDateTime(
  value = ""
) {
  try {
    if (!value) {
      return "—";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
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
  const hour =
    new Date().getHours();

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

function resolveDisplayName(
  user
) {
  try {
    const byCore =
      typeof AppCore?.getUserDisplayName ===
      "function"
        ? AppCore.getUserDisplayName(user)
        : "";

    if (
      String(
        byCore || ""
      ).trim()
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

/* =========================================================
   STATE RESOLVE
========================================================= */

function resolveHomeState(
  options = {}
) {
  const home =
    safeObject(
      options?.home
    );

  const summary =
    safeObject(
      home.summary
    );

  return {
    loading:
      home.loading === true,
    loaded:
      home.loaded === true,
    error:
      home.error || null,
    lastSyncAt:
      safeText(
        home.lastSyncAt,
        ""
      ),
    cacheHit:
      home.cacheHit === true,
    summary: {
      status:
        safeText(
          summary.status,
          "idle"
        ),
      cards:
        safeNumber(
          summary.cards,
          0
        ),
      metrics:
        safeArray(
          summary.metrics
        ),
      recentActivity:
        safeArray(
          summary.recentActivity
        ),
      generatedAt:
        safeText(
          summary.generatedAt,
          ""
        ),
    },
  };
}

/* =========================================================
   PARTIALS
========================================================= */

function renderMiniStat({
  label = "",
  value = "",
  hint = "",
} = {}) {
  return `
    <article
      class="home-mini-stat"
      tabindex="0"
    >
      <div class="home-mini-stat__label">
        ${escapeHtml(label)}
      </div>

      <div class="home-mini-stat__value">
        ${escapeHtml(value)}
      </div>

      <div class="home-mini-stat__hint">
        ${escapeHtml(hint)}
      </div>
    </article>
  `;
}

function renderMetricsGrid(
  metrics = []
) {
  const finalMetrics =
    safeArray(metrics);

  if (!finalMetrics.length) {
    return `
      <div class="home-empty">
        No hay métricas disponibles.
      </div>
    `;
  }

  return `
    <div class="home-mini-stats">
      ${finalMetrics
        .map(
          (
            item,
            index
          ) =>
            renderMiniStat({
              label:
                item?.label ||
                `Métrica ${index + 1}`,
              value:
                item?.value ||
                "—",
              hint:
                item?.hint ||
                "",
            })
        )
        .join("")}
    </div>
  `;
}

function renderLoadingGrid() {
  return `
    <div class="home-mini-stats">
      ${Array.from({
        length: 3,
      })
        .map(
          () => `
          <div class="home-mini-stat home-skeleton">
            <div class="home-skeleton-line home-skeleton-line--sm"></div>
            <div class="home-skeleton-line home-skeleton-line--lg"></div>
            <div class="home-skeleton-line home-skeleton-line--md"></div>
          </div>
        `
        )
        .join("")}
    </div>
  `;
}

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
        Onion Support · Workspace
      </div>

      <div class="home-hero__header">
        <div class="home-hero__copy">
          <h1 class="home-hero__title">
            ${escapeHtml(greeting)},
            ${escapeHtml(displayName)}
          </h1>

          <p class="home-hero__subtitle">
            Panel principal de operaciones. Accesos rápidos,
            métricas clave y visión general del sistema.
          </p>

          <div class="home-hero__meta">
            <span>
              ${escapeHtml(
                syncText
              )}
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

function renderMainCard({
  appName = "Onion Support",
  state = {},
} = {}) {
  const hasError =
    Boolean(
      state.error
    );

  return `
    <section class="home-main-card">
      <div class="home-main-card__surface">

        <div class="home-main-card__top">
          <div class="home-main-card__badge">
            Dashboard
          </div>

          <h2 class="home-main-card__title">
            Bienvenido a ${escapeHtml(
              appName
            )}
          </h2>

          <p class="home-main-card__text">
            Base inicial del panel premium.
            Desde aquí crecerán widgets,
            actividad reciente, negocio
            y control operativo.
          </p>
        </div>

        ${
          hasError
            ? `
          <div class="home-error">
            Error cargando datos de la Home.
          </div>
        `
            : state.loading
            ? renderLoadingGrid()
            : renderMetricsGrid(
                state.summary
                  .metrics
              )
        }

      </div>
    </section>
  `;
}

/* =========================================================
   STYLES
========================================================= */

function renderScopedStyles() {
  return `
    <style>
      .home-view{
        width:100%;
        display:grid;
        gap:24px;
        padding:24px;
      }

      .home-hero,
      .home-main-card__surface{
        position:relative;
        overflow:hidden;
        border-radius:28px;
        border:1px solid rgba(255,255,255,.08);
        background:
          linear-gradient(
            180deg,
            rgba(255,255,255,.03),
            rgba(255,255,255,.01)
          ),
          rgba(24,24,27,.70);
        box-shadow:
          0 18px 48px rgba(0,0,0,.16),
          inset 0 1px 0 rgba(255,255,255,.04);
      }

      .home-hero{
        padding:28px;
      }

      .home-main-card__surface{
        padding:28px;
        display:grid;
        gap:24px;
      }

      .home-hero__eyebrow,
      .home-main-card__badge{
        display:inline-flex;
        align-items:center;
        gap:10px;
        width:max-content;
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        font-size:12px;
        font-weight:700;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:var(--text-soft);
        border:1px solid rgba(255,255,255,.08);
        background:
          rgba(255,255,255,.03);
      }

      .home-hero__eyebrow{
        margin-bottom:14px;
      }

      .home-hero__title,
      .home-main-card__title{
        margin:0;
        color:var(--text-strong);
        font-weight:800;
        letter-spacing:-0.03em;
        line-height:1.04;
      }

      .home-hero__title{
        font-size:clamp(28px,4vw,44px);
      }

      .home-main-card__title{
        font-size:clamp(22px,2.4vw,30px);
      }

      .home-hero__subtitle,
      .home-main-card__text{
        margin:0;
        color:var(--text-dim);
        font-size:15px;
        line-height:1.65;
        max-width:72ch;
      }

      .home-hero__copy,
      .home-main-card__top{
        display:grid;
        gap:14px;
      }

      .home-hero__meta{
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        align-items:center;
        margin-top:4px;
        color:var(--text-muted);
        font-size:13px;
      }

      .home-badge{
        min-height:28px;
        padding:0 10px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        background:rgba(34,197,94,.10);
        color:#86efac;
        border:1px solid rgba(34,197,94,.14);
        font-weight:700;
      }

      .home-badge--cache{
        background:rgba(245,158,11,.10);
        color:#fcd34d;
        border:1px solid rgba(245,158,11,.14);
      }

      .home-mini-stats{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:16px;
      }

      .home-mini-stat{
        min-width:0;
        border-radius:22px;
        border:1px solid rgba(255,255,255,.07);
        background:
          linear-gradient(
            180deg,
            rgba(255,255,255,.024),
            rgba(255,255,255,.010)
          ),
          rgba(255,255,255,.015);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.03);
        padding:18px;
        display:grid;
        gap:8px;
        transition:
          transform .18s ease,
          border-color .18s ease,
          box-shadow .18s ease;
      }

      .home-mini-stat:hover{
        transform:translateY(-2px);
        border-color:rgba(255,255,255,.12);
      }

      .home-mini-stat__label{
        color:var(--text-dim);
        font-size:12px;
        font-weight:700;
        letter-spacing:.08em;
        text-transform:uppercase;
      }

      .home-mini-stat__value{
        color:var(--text-strong);
        font-size:24px;
        line-height:1;
        font-weight:800;
        letter-spacing:-0.02em;
      }

      .home-mini-stat__hint{
        color:var(--text-muted);
        font-size:13px;
        line-height:1.45;
      }

      .home-empty,
      .home-error{
        min-height:110px;
        border-radius:22px;
        display:grid;
        place-items:center;
        text-align:center;
        padding:18px;
        font-size:14px;
      }

      .home-empty{
        color:var(--text-dim);
        border:1px dashed rgba(255,255,255,.10);
      }

      .home-error{
        color:#fca5a5;
        border:1px solid rgba(239,68,68,.12);
        background:rgba(239,68,68,.05);
      }

      .home-skeleton{
        pointer-events:none;
      }

      .home-skeleton-line{
        height:12px;
        border-radius:999px;
        background:
          linear-gradient(
            90deg,
            rgba(255,255,255,.04),
            rgba(255,255,255,.10),
            rgba(255,255,255,.04)
          );
        background-size:200% 100%;
        animation:homeShimmer 1.2s linear infinite;
      }

      .home-skeleton-line--sm{
        width:40%;
      }

      .home-skeleton-line--md{
        width:62%;
      }

      .home-skeleton-line--lg{
        width:74%;
        height:22px;
      }

      @keyframes homeShimmer{
        from{
          background-position:200% 0;
        }
        to{
          background-position:-200% 0;
        }
      }

      [data-theme="light"] .home-hero,
      [data-theme="light"] .home-main-card__surface{
        border-color:rgba(15,23,42,.08);
        background:
          linear-gradient(
            180deg,
            rgba(255,255,255,.92),
            rgba(255,255,255,.80)
          ),
          rgba(255,255,255,.88);
        box-shadow:
          0 18px 44px rgba(15,23,42,.08),
          inset 0 1px 0 rgba(255,255,255,.82);
      }

      [data-theme="light"] .home-mini-stat{
        border-color:rgba(15,23,42,.08);
        background:rgba(255,255,255,.72);
      }

      @media (max-width:920px){
        .home-view{
          padding:18px;
          gap:18px;
        }

        .home-hero,
        .home-main-card__surface{
          padding:22px;
          border-radius:24px;
        }

        .home-mini-stats{
          grid-template-columns:1fr;
        }
      }

      @media (max-width:640px){
        .home-view{
          padding:14px;
        }

        .home-hero,
        .home-main-card__surface{
          padding:18px;
          border-radius:22px;
        }

        .home-hero__title{
          font-size:30px;
        }

        .home-hero__subtitle,
        .home-main-card__text{
          font-size:14px;
        }

        .home-mini-stat__value{
          font-size:22px;
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
  const appName =
    safeText(
      options?.appName,
      "Onion Support"
    );

  const user =
    options?.user || null;

  const state =
    resolveHomeState(
      options
    );

  return `
    ${renderScopedStyles()}

    <section
      class="home-view"
      data-view="home"
      data-home-view="true"
    >
      ${renderHero({
        user,
        state,
      })}

      ${renderMainCard({
        appName,
        state,
      })}
    </section>
  `;
}

export {
  getHomeTemplate as HomeTemplate,
};

export default getHomeTemplate;
