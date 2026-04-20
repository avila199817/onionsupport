/* =========================================================
   Onion SPA - Incidencias Template (CLIENT EXPERIENCE MODE)
   Archivo: src/views/incidencias/incidencias.table.template.js

   DEFINITIVE PRO / AIR MODE / CLIENT FIRST

   Objetivo:
   - header más fino y ordenado
   - botones arriba derecha
   - título ancho real
   - resumen con 2 cajas: abiertas / cerradas
   - tabla más compacta y limpia
   - orden en incidencia: número -> asunto -> descripción
   - columnas:
     incidencia / estado / fecha de creación / última novedad / importe / acciones
   - última novedad solo relativa
   - acciones: solo ver detalle
   - tooltip de avatar con nombre completo
   - paginación a 5 incidencias por vista
========================================================= */

import { incidenciasState } from "./incidencias.state.js";

import {
  getIncidencias,
  sortIncidenciasByUpdatedDesc,
} from "./incidencias.store.js";

import {
  escapeHtml,
  formatDate,
  formatRelativeDate,
  truncate,
} from "./incidencias.utils.js";

/* =========================================================
   SAFE
========================================================= */

const PAGE_SIZE = 5;

function safeText(value, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

/* =========================================================
   SHARED STYLES
========================================================= */

function renderScopedStyles() {
  return `
    <style>
      @keyframes incidenciasPulse {
        0% { transform: scale(.92); opacity: .72; }
        50% { transform: scale(1.06); opacity: 1; }
        100% { transform: scale(.92); opacity: .72; }
      }

      @keyframes incidenciasSpin {
        to { transform: rotate(360deg); }
      }

      @keyframes incidenciasSkeleton {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      .incidencias-hero{
        position:relative;
        overflow:hidden;
        border-radius:calc(var(--panel-radius) + 4px);
        border:1px solid var(--border-soft);
        background:
          radial-gradient(circle at top left, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,.012), transparent 28%),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-soft);
      }

      .incidencias-hero::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:linear-gradient(180deg, rgba(255,255,255,.022), transparent 34%);
        opacity:.84;
      }

      .incidencias-hero > *{
        position:relative;
        z-index:1;
      }

      .incidencias-hero-inner{
        display:grid;
        gap:var(--space-lg);
        padding:clamp(18px, 2.4vw, 28px);
      }

      .incidencias-hero-actions-row{
        display:flex;
        justify-content:flex-end;
        align-items:center;
      }

      .incidencias-hero-actions{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:10px;
        flex-wrap:wrap;
      }

      .incidencias-hero-copy{
        display:grid;
        gap:10px;
        min-inline-size:0;
        width:100%;
      }

      .incidencias-eyebrow{
        display:inline-flex;
        align-items:center;
        width:max-content;
        min-block-size:28px;
        padding-inline:12px;
        border-radius:999px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft));
        background:color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent);
        color:var(--text-soft);
        font-size:11px;
        font-weight:var(--weight-bold);
        letter-spacing:.06em;
        text-transform:uppercase;
      }

      .incidencias-hero-title{
        margin:0;
        max-inline-size:none;
        width:100%;
        font-size:clamp(26px, 4.8vw, 56px);
        line-height:1.02;
        letter-spacing:-.05em;
        color:var(--text-strong);
        text-wrap:balance;
      }

      .incidencias-hero-subtitle{
        margin:0;
        max-inline-size:1040px;
        color:var(--text-dim);
        font-size:var(--font-lg);
        line-height:1.58;
      }

      .incidencias-meta{
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }

      .incidencias-meta-pill{
        display:inline-flex;
        align-items:center;
        min-block-size:28px;
        padding-inline:10px;
        border-radius:999px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
        color:var(--text-dim);
        font-size:11px;
        font-weight:var(--weight-bold);
        letter-spacing:.04em;
        text-transform:uppercase;
      }

      .incidencias-meta-pill.is-live{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 20%, var(--border-soft));
        background:color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent);
        color:var(--text-soft);
        gap:8px;
      }

      .incidencias-live-dot{
        inline-size:8px;
        block-size:8px;
        border-radius:999px;
        background:var(--accent, #7c5cff);
        animation:incidenciasPulse 1.2s ease-in-out infinite;
      }

      .incidencias-summary-grid{
        display:grid;
        grid-template-columns:repeat(2, minmax(0, 260px));
        gap:var(--space-md);
      }

      .incidencias-summary-card{
        position:relative;
        overflow:hidden;
        display:grid;
        gap:8px;
        min-block-size:112px;
        padding:18px;
        border-radius:calc(var(--panel-radius) + 1px);
        border:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, rgba(255,255,255,.016), transparent 70%),
          var(--surface-2, var(--surface-glass));
        box-shadow:var(--shadow-xs);
      }

      .incidencias-summary-card.is-open{
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent 70%),
          var(--surface-2, var(--surface-glass));
      }

      .incidencias-summary-card.is-closed{
        border-color:color-mix(in srgb, var(--success, #22c55e) 18%, var(--border-soft));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--success, #22c55e) 8%, transparent), transparent 70%),
          var(--surface-2, var(--surface-glass));
      }

      .incidencias-summary-card::before{
        content:"";
        position:absolute;
        inset:0;
        pointer-events:none;
        background:linear-gradient(180deg, rgba(255,255,255,.020), transparent 30%);
      }

      .incidencias-summary-card > *{
        position:relative;
        z-index:1;
      }

      .incidencias-summary-label{
        color:var(--text-dim);
        font-size:11px;
        line-height:1;
        font-weight:var(--weight-bold);
        letter-spacing:.08em;
        text-transform:uppercase;
      }

      .incidencias-summary-value{
        color:var(--text-strong);
        font-size:clamp(28px, 4vw, 40px);
        line-height:1;
        font-weight:var(--weight-black);
        letter-spacing:-.05em;
      }

      .incidencias-summary-caption{
        margin:0;
        color:var(--text-dim);
        font-size:var(--font-sm);
        line-height:1.5;
      }

      .incidencias-state{
        display:grid;
        gap:16px;
        padding:22px;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-xs);
      }

      .incidencias-state.is-error{
        border-color:color-mix(in srgb, var(--error, #ef4444) 18%, var(--border-soft));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--error, #ef4444) 8%, transparent), transparent 74%),
          var(--surface-1, var(--surface-glass));
      }

      .incidencias-state-header{
        display:grid;
        gap:8px;
      }

      .incidencias-state-title{
        margin:0;
        color:var(--text-strong);
        font-size:clamp(22px, 3vw, 30px);
        line-height:1.08;
        letter-spacing:-.04em;
      }

      .incidencias-state-text{
        margin:0;
        max-inline-size:760px;
        color:var(--text-dim);
        font-size:var(--font-base);
        line-height:1.6;
      }

      .incidencias-state-actions{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      .incidencias-table-wrap{
        position:relative;
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, rgba(255,255,255,.012), transparent 28%),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-xs);
      }

      .incidencias-table-toolbar{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        flex-wrap:wrap;
        padding:14px 16px;
        border-bottom:1px solid var(--border-soft);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 4%, transparent), transparent),
          var(--surface-2, var(--surface-glass));
      }

      .incidencias-table-toolbar-main{
        display:grid;
        gap:4px;
      }

      .incidencias-table-toolbar-title{
        color:var(--text-strong);
        font-size:var(--font-base);
        line-height:1.2;
        font-weight:var(--weight-bold);
      }

      .incidencias-table-toolbar-subtitle{
        color:var(--text-dim);
        font-size:var(--font-sm);
        line-height:1.35;
      }

      .incidencias-table-toolbar-actions{
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }

      .incidencias-table-scroll{
        inline-size:100%;
        overflow:auto;
      }

      .incidencias-table-scroll::-webkit-scrollbar{
        inline-size:10px;
        block-size:10px;
      }

      .incidencias-table-scroll::-webkit-scrollbar-thumb{
        background:color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft));
        border-radius:999px;
      }

      .incidencias-table-scroll::-webkit-scrollbar-track{
        background:transparent;
      }

      .incidencias-table{
        inline-size:100%;
        min-inline-size:900px;
        border-collapse:separate;
        border-spacing:0;
        table-layout:fixed;
      }

      .incidencias-table thead th{
        padding:12px 16px;
        text-align:left;
        font-size:11px;
        line-height:1;
        letter-spacing:.08em;
        text-transform:uppercase;
        color:var(--text-dim);
        font-weight:var(--weight-bold);
        border-bottom:1px solid var(--border-soft);
        background:var(--surface-2, var(--surface-glass));
        white-space:nowrap;
      }

      .incidencias-table thead th.is-right{
        text-align:right;
      }

      .incidencias-table tbody td{
        padding:14px 16px;
        vertical-align:middle;
        border-bottom:1px solid var(--border-soft);
      }

      .incidencias-table tbody tr{
        transition:
          background var(--duration-fast) var(--ease-standard),
          opacity var(--duration-fast) var(--ease-standard);
      }

      .incidencias-table tbody tr:hover{
        background:color-mix(in srgb, var(--accent, #7c5cff) 4%, transparent);
      }

      .incidencias-table tbody tr:last-child td{
        border-bottom:none;
      }

      .incidencias-row.is-opening{
        opacity:.72;
      }

      .incidencias-row.is-opening:hover{
        background:color-mix(in srgb, var(--warning, #f59e0b) 5%, transparent);
      }

      .incidencias-cell-identity{
        display:flex;
        gap:12px;
        align-items:center;
        min-inline-size:0;
      }

      .incidencias-avatar{
        position:relative;
        flex:0 0 auto;
        overflow:hidden;
        border-radius:14px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
        box-shadow:var(--shadow-xs);
      }

      .incidencias-avatar img{
        display:block;
        inline-size:100%;
        block-size:100%;
        object-fit:cover;
      }

      .incidencias-avatar-fallback{
        position:absolute;
        inset:0;
        display:none;
        place-items:center;
        font-weight:var(--weight-black);
        letter-spacing:.03em;
        backdrop-filter:blur(8px);
      }

      .incidencias-avatar[data-avatar-fallback="true"] img{
        display:none !important;
      }

      .incidencias-avatar[data-avatar-fallback="true"] .incidencias-avatar-fallback{
        display:grid !important;
      }

      .incidencias-identity-copy{
        display:grid;
        gap:2px;
        min-inline-size:0;
      }

      .incidencias-ticket-code{
        color:var(--text-soft);
        font-size:12px;
        line-height:1.2;
        font-weight:var(--weight-bold);
        letter-spacing:.04em;
        text-transform:uppercase;
      }

      .incidencias-title-btn{
        margin:0;
        padding:0;
        border:none;
        background:transparent;
        text-align:left;
        color:var(--text-strong);
        font-size:var(--font-xl);
        line-height:1.18;
        font-weight:var(--weight-black);
        letter-spacing:-.02em;
        cursor:pointer;
      }

      .incidencias-title-btn[disabled]{
        cursor:wait;
      }

      .incidencias-ticket-preview{
        color:var(--text-dim);
        font-size:12px;
        line-height:1.4;
        word-break:break-word;
      }

      .incidencias-chip{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-block-size:28px;
        padding-inline:10px;
        border-radius:999px;
        font-size:11px;
        font-weight:var(--weight-bold);
        letter-spacing:.04em;
        text-transform:uppercase;
        white-space:nowrap;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
        color:var(--text-soft);
      }

      .incidencias-chip.is-open{
        color:var(--accent, #7c5cff);
        background:color-mix(in srgb, var(--accent, #7c5cff) 10%, transparent);
        border-color:color-mix(in srgb, var(--accent, #7c5cff) 24%, transparent);
      }

      .incidencias-chip.is-pending{
        color:var(--warning, #f59e0b);
        background:color-mix(in srgb, var(--warning, #f59e0b) 10%, transparent);
        border-color:color-mix(in srgb, var(--warning, #f59e0b) 24%, transparent);
      }

      .incidencias-chip.is-progress{
        color:var(--info, #60a5fa);
        background:color-mix(in srgb, var(--info, #60a5fa) 10%, transparent);
        border-color:color-mix(in srgb, var(--info, #60a5fa) 24%, transparent);
      }

      .incidencias-chip.is-resolved{
        color:var(--success, #22c55e);
        background:color-mix(in srgb, var(--success, #22c55e) 10%, transparent);
        border-color:color-mix(in srgb, var(--success, #22c55e) 24%, transparent);
      }

      .incidencias-chip.is-closed{
        color:var(--text-dim);
        background:var(--surface-glass);
        border-color:var(--border-soft);
      }

      .incidencias-date-main{
        color:var(--text-strong);
        font-size:13px;
        line-height:1.25;
        font-weight:var(--weight-semibold);
      }

      .incidencias-update-relative{
        color:var(--text-soft);
        font-size:13px;
        line-height:1.2;
        font-weight:var(--weight-semibold);
      }

      .incidencias-amount{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-block-size:30px;
        padding-inline:10px;
        border-radius:999px;
        border:1px solid color-mix(in srgb, var(--success, #22c55e) 20%, var(--border-soft));
        background:color-mix(in srgb, var(--success, #22c55e) 10%, transparent);
        color:var(--text-strong);
        font-size:12px;
        line-height:1;
        font-weight:var(--weight-bold);
        letter-spacing:.01em;
        white-space:nowrap;
      }

      .incidencias-amount.is-empty{
        border-color:var(--border-soft);
        background:var(--surface-glass);
        color:var(--text-dim);
      }

      .incidencias-actions{
        display:flex;
        justify-content:flex-end;
        gap:8px;
        flex-wrap:wrap;
      }

      .incidencias-detail-btn{
        min-inline-size:112px;
      }

      .incidencias-mobile-list{
        display:none;
        gap:12px;
        padding:14px;
      }

      .incidencias-mobile-card{
        display:grid;
        gap:14px;
        padding:16px;
        border-radius:18px;
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-xs);
      }

      .incidencias-mobile-top{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
      }

      .incidencias-mobile-status{
        display:grid;
        justify-items:end;
        gap:8px;
      }

      .incidencias-mobile-grid{
        display:grid;
        grid-template-columns:repeat(3, minmax(0, 1fr));
        gap:10px;
      }

      .incidencias-mobile-box{
        display:grid;
        gap:4px;
        padding:12px;
        border-radius:14px;
        border:1px solid var(--border-soft);
        background:var(--surface-glass);
      }

      .incidencias-mobile-box-label{
        font-size:11px;
        line-height:1;
        color:var(--text-faint);
        font-weight:var(--weight-bold);
        letter-spacing:.05em;
        text-transform:uppercase;
      }

      .incidencias-mobile-box-value{
        color:var(--text-strong);
        font-size:var(--font-sm);
        line-height:1.35;
        font-weight:var(--weight-semibold);
        word-break:break-word;
      }

      .incidencias-mobile-actions{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      .incidencias-table-overlay{
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        padding:18px;
        background:color-mix(in srgb, var(--surface-1, #0f1115) 74%, transparent);
        backdrop-filter:blur(4px);
        -webkit-backdrop-filter:blur(4px);
        z-index:4;
      }

      .incidencias-table-overlay-card{
        display:grid;
        justify-items:center;
        gap:10px;
        min-inline-size:min(100%, 220px);
        padding:16px 18px;
        border-radius:18px;
        border:1px solid color-mix(in srgb, var(--accent, #7c5cff) 18%, var(--border-soft));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--accent, #7c5cff) 8%, transparent), transparent),
          var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-md);
      }

      .incidencias-table-overlay-spinner{
        inline-size:26px;
        block-size:26px;
        border-radius:999px;
        border:3px solid color-mix(in srgb, var(--accent, #7c5cff) 16%, transparent);
        border-top-color:var(--accent, #7c5cff);
        animation:incidenciasSpin .8s linear infinite;
      }

      .incidencias-loading-shell{
        overflow:hidden;
        border-radius:var(--panel-radius);
        border:1px solid var(--border-soft);
        background:var(--surface-1, var(--surface-glass));
        box-shadow:var(--shadow-xs);
      }

      .incidencias-skeleton-head,
      .incidencias-skeleton-row{
        display:grid;
        grid-template-columns: 2.8fr .9fr 1fr .9fr .9fr .9fr;
        gap:0;
      }

      .incidencias-skeleton-head{
        border-bottom:1px solid var(--border-soft);
        background:var(--surface-2, var(--surface-glass));
      }

      .incidencias-skeleton-row{
        border-bottom:1px solid var(--border-soft);
      }

      .incidencias-skeleton-row:last-child{
        border-bottom:none;
      }

      .incidencias-skeleton-cell{
        padding:14px 16px;
      }

      .incidencias-skeleton-bar{
        border-radius:999px;
        background:
          linear-gradient(
            90deg,
            var(--surface-glass),
            color-mix(in srgb, var(--accent, #7c5cff) 8%, var(--surface-glass)),
            var(--surface-glass)
          );
        background-size:200% 100%;
        animation:incidenciasSkeleton 1.2s linear infinite;
      }

      .incidencias-skeleton-id{
        display:flex;
        gap:12px;
        align-items:center;
      }

      .incidencias-skeleton-avatar{
        inline-size:40px;
        block-size:40px;
        border-radius:14px;
      }

      .incidencias-skeleton-stack{
        display:grid;
        gap:8px;
        flex:1;
      }

      @media (max-width: 1120px){
        .incidencias-summary-grid{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 980px){
        .incidencias-desktop-table{
          display:none !important;
        }

        .incidencias-mobile-list{
          display:grid !important;
        }

        .incidencias-mobile-grid{
          grid-template-columns:repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 760px){
        .incidencias-hero-inner{
          padding:16px;
        }

        .incidencias-hero-title{
          font-size:clamp(24px, 8vw, 38px);
        }

        .incidencias-hero-subtitle{
          font-size:var(--font-base);
        }

        .incidencias-hero-actions-row{
          justify-content:flex-start;
        }

        .incidencias-summary-grid{
          grid-template-columns:1fr;
        }

        .incidencias-table-toolbar{
          padding:12px 14px;
        }

        .incidencias-mobile-grid{
          grid-template-columns:1fr;
        }
      }
    </style>
  `;
}

/* =========================================================
   BACKEND ENVELOPE / REAL DATA RESOLVE
========================================================= */

function looksLikeTicketsEnvelope(value) {
  const obj = safeObject(value);

  return Boolean(
    Array.isArray(obj?.tickets) ||
      Array.isArray(obj?.items) ||
      Array.isArray(obj?.data) ||
      Array.isArray(obj?.results)
  );
}

function unwrapItemsEnvelope(value) {
  const obj = safeObject(value);

  if (Array.isArray(value)) return value;
  if (Array.isArray(obj?.tickets)) return obj.tickets;
  if (Array.isArray(obj?.items)) return obj.items;
  if (Array.isArray(obj?.data)) return obj.data;
  if (Array.isArray(obj?.results)) return obj.results;

  if (looksLikeTicketsEnvelope(obj?.data)) {
    return unwrapItemsEnvelope(obj.data);
  }

  return [];
}

function resolveRemoteCount(items, state = {}) {
  const localState = safeObject(state);

  return safeNumber(
    first(
      localState?.remoteCount,
      localState?.count,
      localState?.total,
      safeObject(localState?.stats)?.total,
      safeObject(localState?.response)?.count,
      safeObject(localState?.payload)?.count,
      safeObject(localState?.lastResponse)?.count,
      safeObject(items)?.count
    ),
    safeArray(items).length
  );
}

/* =========================================================
   STATS
========================================================= */

function computeStats(items = []) {
  const list = safeArray(items);

  let openCount = 0;
  let closedCount = 0;

  list.forEach((item) => {
    const status = safeText(first(item.status, item.estado), "open")
      .trim()
      .toLowerCase();

    if (["resolved", "resuelta", "resuelto", "closed", "cerrada", "cerrado"].includes(status)) {
      closedCount += 1;
      return;
    }

    openCount += 1;
  });

  return {
    openCount,
    closedCount,
  };
}

/* =========================================================
   LABELS / TONES
========================================================= */

function getStatusLabel(value = "") {
  const key = String(value || "").trim().toLowerCase();

  switch (key) {
    case "open":
    case "abierta":
    case "abierto":
      return "Recibida";

    case "pending":
    case "pendiente":
      return "Pendiente";

    case "in_progress":
    case "in-progress":
    case "progress":
    case "en_proceso":
    case "en proceso":
      return "En revisión";

    case "resolved":
    case "resuelta":
    case "resuelto":
      return "Resuelta";

    case "closed":
    case "cerrada":
    case "cerrado":
      return "Cerrada";

    default:
      return safeText(value, "Recibida");
  }
}

function getStatusTone(value = "") {
  const key = String(value || "").trim().toLowerCase();

  if (["open", "abierta", "abierto"].includes(key)) return "is-open";
  if (["pending", "pendiente"].includes(key)) return "is-pending";

  if (
    ["in_progress", "in-progress", "progress", "en_proceso", "en proceso"].includes(
      key
    )
  ) {
    return "is-progress";
  }

  if (["resolved", "resuelta", "resuelto"].includes(key)) return "is-resolved";
  if (["closed", "cerrada", "cerrado"].includes(key)) return "is-closed";

  return "";
}

function renderStatusChip(value = "") {
  return `
    <span class="incidencias-chip ${getStatusTone(value)}">
      ${escapeHtml(getStatusLabel(value))}
    </span>
  `;
}

/* =========================================================
   DATA RESOLVE
========================================================= */

function getResolvedItems(items) {
  const direct = safeArray(items);

  if (direct.length) {
    return sortIncidenciasByUpdatedDesc(direct);
  }

  const fromEnvelope = unwrapItemsEnvelope(items);

  if (fromEnvelope.length) {
    return sortIncidenciasByUpdatedDesc(fromEnvelope);
  }

  try {
    return sortIncidenciasByUpdatedDesc(getIncidencias());
  } catch {
    return [];
  }
}

function getTicketId(item = {}) {
  return safeText(first(item.ticketId, item.id, item.code), "");
}

function getTicketCode(item = {}) {
  return safeText(
    first(item.ticketId, item.id, item.code, item.ticketCode),
    "—"
  );
}

function getTitle(item = {}) {
  return safeText(
    first(item.subject, item.title, item.asunto, item.name),
    "Incidencia sin asunto"
  );
}

function getPreview(item = {}) {
  return safeText(
    first(item.preview, item.descripcion, item.description, item.message),
    "Sin descripción"
  );
}

function getStatusValue(item = {}) {
  return safeText(first(item.status, item.estado), "open");
}

function getUpdatedAt(item = {}) {
  return first(item.updatedAt, item.closedAt, item.createdAt);
}

function getCreatedAt(item = {}) {
  return first(item.createdAt, item.createdAtES, item.updatedAt);
}

function resolveAmount(item = {}) {
  return firstFiniteNumber(
    item.amount,
    item.total,
    item.importe,
    item.price,
    item.cost,
    item.coste,
    safeObject(item?.meta)?.amount,
    safeObject(item?.meta)?.importe
  );
}

function getCurrency(item = {}) {
  return safeText(
    first(
      item.currency,
      item.moneda,
      safeObject(item?.meta)?.currency,
      safeObject(item?.meta)?.moneda
    ),
    "EUR"
  );
}

function formatMoney(amount, currency = "EUR") {
  const value = Number(amount);

  if (!Number.isFinite(value)) return "Pendiente";

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || "EUR"}`;
  }
}

function renderAmountPill(item = {}) {
  const amount = resolveAmount(item);

  if (!Number.isFinite(amount)) {
    return `
      <span class="incidencias-amount is-empty">
        Pendiente
      </span>
    `;
  }

  return `
    <span class="incidencias-amount">
      ${escapeHtml(formatMoney(amount, getCurrency(item)))}
    </span>
  `;
}

function getClientDisplayName(item = {}) {
  return safeText(
    first(
      item?.cliente?.nombre,
      item?.cliente?.name,
      item.client,
      item.clientName,
      item.cliente,
      item.empresa,
      item.company,
      item.name,
      item?.receptor?.name,
      item?.createdBy?.name
    ),
    "Cliente"
  );
}

function getClientInitials(item = {}) {
  const raw = getClientDisplayName(item);
  const clean = String(raw).trim();

  if (!clean) return "ON";

  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (initials || clean.slice(0, 2) || "ON").toUpperCase();
}

function getClientAvatarUrl(item = {}) {
  return safeText(
    first(
      item?.cliente?.avatar,
      item?.cliente?.avatarUrl,
      item?.clientAvatar,
      item?.clientAvatarUrl,
      item?.avatar,
      item?.avatarUrl,
      item?.createdBy?.avatar,
      item?.createdBy?.avatarUrl,
      item?.receptor?.avatar,
      item?.receptor?.avatarUrl
    ),
    ""
  );
}

function getAvatarToneSeed(item = {}) {
  return safeText(
    first(
      getTicketId(item),
      getTitle(item),
      getTicketCode(item)
    ),
    "onion"
  );
}

function getStableHash(value = "") {
  const source = String(value || "onion");
  let hash = 0;

  for (let i = 0; i < source.length; i += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

function getFallbackAvatarTheme(seed = "") {
  const themes = [
    {
      bg: "linear-gradient(135deg, rgba(124,92,255,.24), rgba(88,72,200,.12))",
      border: "rgba(124,92,255,.24)",
      text: "#efeaff",
      glow: "rgba(124,92,255,.18)",
    },
    {
      bg: "linear-gradient(135deg, rgba(54,198,144,.24), rgba(35,131,95,.12))",
      border: "rgba(54,198,144,.24)",
      text: "#ddfff1",
      glow: "rgba(54,198,144,.18)",
    },
    {
      bg: "linear-gradient(135deg, rgba(96,165,250,.24), rgba(37,99,235,.12))",
      border: "rgba(96,165,250,.24)",
      text: "#e7f2ff",
      glow: "rgba(96,165,250,.18)",
    },
    {
      bg: "linear-gradient(135deg, rgba(255,188,66,.24), rgba(217,119,6,.12))",
      border: "rgba(255,188,66,.24)",
      text: "#fff4d8",
      glow: "rgba(255,188,66,.18)",
    },
    {
      bg: "linear-gradient(135deg, rgba(255,107,107,.24), rgba(190,24,93,.12))",
      border: "rgba(255,107,107,.24)",
      text: "#ffe4e4",
      glow: "rgba(255,107,107,.18)",
    },
    {
      bg: "linear-gradient(135deg, rgba(179,136,255,.24), rgba(109,40,217,.12))",
      border: "rgba(179,136,255,.24)",
      text: "#f3e8ff",
      glow: "rgba(179,136,255,.18)",
    },
  ];

  return themes[getStableHash(seed) % themes.length];
}

/* =========================================================
   PAGINATION
========================================================= */

function clampPage(page = 1, totalPages = 1) {
  const current = safeNumber(page, 1);
  return Math.min(Math.max(current, 1), Math.max(totalPages, 1));
}

function getPagination(items = [], state = {}) {
  const list = safeArray(items);
  const localState = safeObject(state);

  const pageSize = Math.max(1, safeNumber(localState.pageSize, PAGE_SIZE));
  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = clampPage(localState.page || 1, totalPages);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    start,
    end,
    items: list.slice(start, end),
    from: totalItems ? start + 1 : 0,
    to: Math.min(end, totalItems),
  };
}

/* =========================================================
   HEADER
========================================================= */

function renderSummaryCard({ label = "", value = "0", caption = "", tone = "" } = {}) {
  return `
    <article class="incidencias-summary-card ${tone}">
      <span class="incidencias-summary-label">
        ${escapeHtml(label)}
      </span>

      <strong class="incidencias-summary-value">
        ${escapeHtml(String(value))}
      </strong>

      <p class="incidencias-summary-caption">
        ${escapeHtml(caption)}
      </p>
    </article>
  `;
}

export function renderHeader({ items = [], state = {} } = {}) {
  const list = getResolvedItems(items);
  const localState = state || incidenciasState || {};
  const loading = Boolean(localState?.loading);
  const refreshing = Boolean(localState?.refreshing);
  const creating = Boolean(localState?.creating);
  const remoteCount = resolveRemoteCount(items, localState) || list.length;
  const lastSyncText = localState?.lastSyncAt
    ? formatRelativeDate(localState.lastSyncAt)
    : "Sin sincronización reciente";

  const stats = computeStats(list);

  return `
    ${renderScopedStyles()}

    <section class="incidencias-hero">
      <div class="incidencias-hero-inner">
        <div class="incidencias-hero-actions-row">
          <div class="incidencias-hero-actions">
            <button
              id="incidencias-export-btn"
              type="button"
              class="ui-btn ui-btn-secondary"
            >
              Exportar historial
            </button>

            <button
              id="incidencias-create-btn"
              type="button"
              class="ui-btn ui-btn-primary"
              ${creating ? "disabled" : ""}
            >
              ${creating ? "Abriendo..." : "Crear nueva incidencia"}
            </button>
          </div>
        </div>

        <div class="incidencias-hero-copy">
          <span class="incidencias-eyebrow">
            Ayuda y seguimiento
          </span>

          <div class="page-header-main">
            <h1 class="incidencias-hero-title">
              Tus incidencias y solicitudes
            </h1>

            <p class="incidencias-hero-subtitle">
              Consulta el estado de tus incidencias, revisa las actualizaciones más recientes y crea nuevas solicitudes desde una vista clara, cercana y fácil de seguir.
            </p>
          </div>
        </div>

        <div class="incidencias-meta">
          <span class="incidencias-meta-pill">
            ${escapeHtml(String(remoteCount))} solicitudes registradas
          </span>

          <span class="incidencias-meta-pill">
            Última actualización · ${escapeHtml(lastSyncText)}
          </span>

          ${
            refreshing || loading
              ? `
                <span class="incidencias-meta-pill is-live">
                  <span class="incidencias-live-dot" aria-hidden="true"></span>
                  Actualizando
                </span>
              `
              : ""
          }
        </div>

        <div class="incidencias-summary-grid">
          ${renderSummaryCard({
            label: "Incidencias abiertas",
            value: stats.openCount,
            caption: "Solicitudes activas o pendientes de revisión.",
            tone: "is-open",
          })}

          ${renderSummaryCard({
            label: "Incidencias cerradas",
            value: stats.closedCount,
            caption: "Casos resueltos o ya cerrados.",
            tone: "is-closed",
          })}
        </div>
      </div>
    </section>
  `;
}

/* =========================================================
   STATES
========================================================= */

export function renderLoadingState() {
  return `
    ${renderScopedStyles()}

    <section class="incidencias-loading-shell">
      <div class="incidencias-skeleton-head">
        ${Array.from({ length: 6 })
          .map(
            () => `
              <div class="incidencias-skeleton-cell">
                <div class="incidencias-skeleton-bar" style="height:11px; width:68%;"></div>
              </div>
            `
          )
          .join("")}
      </div>

      ${Array.from({ length: PAGE_SIZE })
        .map(
          () => `
            <div class="incidencias-skeleton-row">
              <div class="incidencias-skeleton-cell">
                <div class="incidencias-skeleton-id">
                  <div class="incidencias-skeleton-bar incidencias-skeleton-avatar"></div>
                  <div class="incidencias-skeleton-stack">
                    <div class="incidencias-skeleton-bar" style="height:11px; width:120px;"></div>
                    <div class="incidencias-skeleton-bar" style="height:14px; width:220px;"></div>
                    <div class="incidencias-skeleton-bar" style="height:11px; width:200px;"></div>
                  </div>
                </div>
              </div>

              <div class="incidencias-skeleton-cell">
                <div class="incidencias-skeleton-bar" style="height:28px; width:96px;"></div>
              </div>

              <div class="incidencias-skeleton-cell">
                <div class="incidencias-skeleton-bar" style="height:12px; width:110px;"></div>
              </div>

              <div class="incidencias-skeleton-cell">
                <div class="incidencias-skeleton-bar" style="height:12px; width:86px;"></div>
              </div>

              <div class="incidencias-skeleton-cell">
                <div class="incidencias-skeleton-bar" style="height:28px; width:92px;"></div>
              </div>

              <div class="incidencias-skeleton-cell" style="display:flex; justify-content:flex-end;">
                <div class="incidencias-skeleton-bar" style="height:38px; width:112px; border-radius:12px;"></div>
              </div>
            </div>
          `
        )
        .join("")}
    </section>
  `;
}

export function renderErrorState(message = "No se pudo cargar la colección.") {
  return `
    ${renderScopedStyles()}

    <section class="incidencias-state is-error">
      <div class="incidencias-state-header">
        <span class="incidencias-meta-pill is-live" style="width:max-content;">
          <span class="incidencias-live-dot" aria-hidden="true"></span>
          No se ha podido cargar
        </span>

        <h3 class="incidencias-state-title">
          No se ha podido mostrar tu historial de incidencias
        </h3>

        <p class="incidencias-state-text">
          ${escapeHtml(safeText(message, "Ha ocurrido un error al cargar las incidencias."))}
        </p>
      </div>

      <div class="incidencias-state-actions">
        <button
          id="incidencias-retry-btn"
          type="button"
          class="ui-btn ui-btn-primary"
        >
          Volver a intentar
        </button>
      </div>
    </section>
  `;
}

export function renderEmptyState() {
  return `
    ${renderScopedStyles()}

    <section class="incidencias-state">
      <div class="incidencias-state-header">
        <span class="incidencias-meta-pill" style="width:max-content;">
          Sin incidencias
        </span>

        <h3 class="incidencias-state-title">
          Aún no tienes incidencias registradas
        </h3>

        <p class="incidencias-state-text">
          Cuando envíes una nueva solicitud, podrás seguir aquí su estado y las actualizaciones del equipo.
        </p>
      </div>

      <div class="incidencias-state-actions">
        <button
          id="incidencias-create-btn"
          type="button"
          class="ui-btn ui-btn-primary"
        >
          Crear incidencia
        </button>
      </div>
    </section>
  `;
}

function renderTableToolbar({
  total = 0,
  page = 1,
  totalPages = 1,
  from = 0,
  to = 0,
  refreshing = false,
} = {}) {
  return `
    <div class="incidencias-table-toolbar">
      <div class="incidencias-table-toolbar-main">
        <strong class="incidencias-table-toolbar-title">
          Historial de incidencias
        </strong>

        <span class="incidencias-table-toolbar-subtitle">
          Mostrando ${escapeHtml(String(from))}-${escapeHtml(String(to))} de ${escapeHtml(String(total))} · página ${escapeHtml(String(page))} de ${escapeHtml(String(totalPages))}
        </span>
      </div>

      <div class="incidencias-table-toolbar-actions">
        ${
          refreshing
            ? `
              <span class="incidencias-meta-pill is-live">
                <span class="incidencias-live-dot" aria-hidden="true"></span>
                Actualizando
              </span>
            `
            : ""
        }

        <button
          type="button"
          data-action="prev-page"
          class="ui-btn ui-btn-secondary ui-btn-sm"
          ${page <= 1 ? "disabled" : ""}
        >
          Anterior
        </button>

        <button
          type="button"
          data-action="next-page"
          class="ui-btn ui-btn-secondary ui-btn-sm"
          ${page >= totalPages ? "disabled" : ""}
        >
          Siguiente
        </button>
      </div>
    </div>
  `;
}

/* =========================================================
   AVATAR
========================================================= */

function renderIdentityAvatar({
  avatarUrl = "",
  initials = "ON",
  seed = "onion",
  size = 40,
  title = "Cliente",
} = {}) {
  const theme = getFallbackAvatarTheme(seed);
  const safeUrl = safeText(avatarUrl, "");
  const safeTitle = escapeHtml(title);

  if (safeUrl) {
    return `
      <div
        class="incidencias-avatar"
        title="${safeTitle}"
        aria-label="${safeTitle}"
        style="inline-size:${size}px; block-size:${size}px;"
      >
        <img
          src="${escapeHtml(safeUrl)}"
          alt="${safeTitle}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.parentNode.setAttribute('data-avatar-fallback','true');"
        />
        <span
          class="incidencias-avatar-fallback"
          style="
            background:${theme.bg};
            color:${theme.text};
            border-color:${theme.border};
          "
        >
          ${escapeHtml(initials)}
        </span>
      </div>
    `;
  }

  return `
    <div
      class="incidencias-avatar"
      data-avatar-fallback="true"
      title="${safeTitle}"
      aria-label="${safeTitle}"
      style="
        inline-size:${size}px;
        block-size:${size}px;
        border-color:${theme.border};
        background:${theme.bg};
        box-shadow:0 8px 20px ${theme.glow};
      "
    >
      <span
        class="incidencias-avatar-fallback"
        style="
          display:grid;
          background:${theme.bg};
          color:${theme.text};
        "
      >
        ${escapeHtml(initials)}
      </span>
    </div>
  `;
}

/* =========================================================
   ROW / CARD
========================================================= */

function renderOpenTicketButton({ ticketId = "", isOpening = false } = {}) {
  return `
    <button
      type="button"
      data-action="open-ticket"
      data-ticket-id="${escapeHtml(ticketId)}"
      class="ui-btn ui-btn-secondary ui-btn-sm incidencias-detail-btn"
      ${isOpening ? "disabled" : ""}
    >
      ${
        isOpening
          ? `
            <span style="display:inline-flex; align-items:center; gap:8px;">
              <span
                aria-hidden="true"
                style="
                  inline-size:12px;
                  block-size:12px;
                  border-radius:999px;
                  border:2px solid color-mix(in srgb, var(--text-soft) 22%, transparent);
                  border-top-color:var(--text-soft);
                  animation:incidenciasSpin .8s linear infinite;
                "
              ></span>
              Abriendo...
            </span>
          `
          : "Ver detalle"
      }
    </button>
  `;
}

function renderIncidenciaRow(item = {}, state = {}) {
  const localState = safeObject(state);
  const openingTicketId = safeText(localState?.openingTicketId, "");
  const ticketId = getTicketId(item);
  const code = getTicketCode(item);
  const title = getTitle(item);
  const preview = truncate(getPreview(item), 88);
  const statusValue = getStatusValue(item);
  const createdAt = formatDate(getCreatedAt(item));
  const updatedAtRelative = formatRelativeDate(getUpdatedAt(item));
  const initials = getClientInitials(item);
  const avatarUrl = getClientAvatarUrl(item);
  const avatarSeed = getAvatarToneSeed(item);
  const avatarTitle = getClientDisplayName(item);
  const isOpening = Boolean(openingTicketId && openingTicketId === ticketId);

  return `
    <tr class="incidencias-row ${isOpening ? "is-opening" : ""}" data-ticket-id="${escapeHtml(ticketId)}">
      <td>
        <div class="incidencias-cell-identity">
          ${renderIdentityAvatar({
            avatarUrl,
            initials,
            seed: avatarSeed,
            size: 40,
            title: avatarTitle,
          })}

          <div class="incidencias-identity-copy">
            <span class="incidencias-ticket-code">
              ${escapeHtml(code)}
            </span>

            <button
              type="button"
              data-action="open-ticket"
              data-ticket-id="${escapeHtml(ticketId)}"
              class="incidencias-title-btn"
              ${isOpening ? "disabled" : ""}
              title="Abrir detalle de la incidencia"
            >
              ${escapeHtml(title)}
            </button>

            <span class="incidencias-ticket-preview">
              ${escapeHtml(preview)}
            </span>
          </div>
        </div>
      </td>

      <td>
        ${renderStatusChip(statusValue)}
      </td>

      <td>
        <strong class="incidencias-date-main">
          ${escapeHtml(createdAt)}
        </strong>
      </td>

      <td>
        <span class="incidencias-update-relative">
          ${escapeHtml(updatedAtRelative)}
        </span>
      </td>

      <td>
        ${renderAmountPill(item)}
      </td>

      <td>
        <div class="incidencias-actions">
          ${renderOpenTicketButton({ ticketId, isOpening })}
        </div>
      </td>
    </tr>
  `;
}

function renderMobileIncidenciaCard(item = {}, state = {}) {
  const localState = safeObject(state);
  const openingTicketId = safeText(localState?.openingTicketId, "");
  const ticketId = getTicketId(item);
  const code = getTicketCode(item);
  const title = getTitle(item);
  const preview = truncate(getPreview(item), 110);
  const statusValue = getStatusValue(item);
  const createdAt = formatDate(getCreatedAt(item));
  const updatedAtRelative = formatRelativeDate(getUpdatedAt(item));
  const initials = getClientInitials(item);
  const avatarUrl = getClientAvatarUrl(item);
  const avatarSeed = getAvatarToneSeed(item);
  const avatarTitle = getClientDisplayName(item);
  const isOpening = Boolean(openingTicketId && openingTicketId === ticketId);

  return `
    <article
      class="incidencias-mobile-card ${isOpening ? "is-opening" : ""}"
      data-ticket-id="${escapeHtml(ticketId)}"
      style="opacity:${isOpening ? ".72" : "1"};"
    >
      <div class="incidencias-mobile-top">
        <div class="incidencias-cell-identity">
          ${renderIdentityAvatar({
            avatarUrl,
            initials,
            seed: avatarSeed,
            size: 40,
            title: avatarTitle,
          })}

          <div class="incidencias-identity-copy">
            <span class="incidencias-ticket-code">
              ${escapeHtml(code)}
            </span>

            <button
              type="button"
              data-action="open-ticket"
              data-ticket-id="${escapeHtml(ticketId)}"
              class="incidencias-title-btn"
              ${isOpening ? "disabled" : ""}
            >
              ${escapeHtml(title)}
            </button>

            <span class="incidencias-ticket-preview">
              ${escapeHtml(preview)}
            </span>
          </div>
        </div>

        <div class="incidencias-mobile-status">
          ${renderStatusChip(statusValue)}
          ${renderAmountPill(item)}
        </div>
      </div>

      <div class="incidencias-mobile-grid">
        <div class="incidencias-mobile-box">
          <span class="incidencias-mobile-box-label">Fecha de creación</span>
          <strong class="incidencias-mobile-box-value">${escapeHtml(createdAt)}</strong>
        </div>

        <div class="incidencias-mobile-box">
          <span class="incidencias-mobile-box-label">Última novedad</span>
          <strong class="incidencias-mobile-box-value">${escapeHtml(updatedAtRelative)}</strong>
        </div>
      </div>

      <div class="incidencias-mobile-actions">
        ${renderOpenTicketButton({ ticketId, isOpening })}
      </div>
    </article>
  `;
}

function renderDesktopTable(items = [], state = {}) {
  return `
    <div class="incidencias-table-scroll">
      <table class="incidencias-table">
        <colgroup>
          <col style="width:44%">
          <col style="width:12%">
          <col style="width:16%">
          <col style="width:13%">
          <col style="width:7%">
          <col style="width:8%">
        </colgroup>

        <thead>
          <tr>
            <th>Incidencia</th>
            <th>Estado</th>
            <th>Fecha de creación</th>
            <th>Última novedad</th>
            <th>Importe</th>
            <th class="is-right">Acciones</th>
          </tr>
        </thead>

        <tbody>
          ${safeArray(items)
            .map((item) => renderIncidenciaRow(item, state))
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMobileCards(items = [], state = {}) {
  return `
    <div class="incidencias-mobile-list">
      ${safeArray(items)
        .map((item) => renderMobileIncidenciaCard(item, state))
        .join("")}
    </div>
  `;
}

function renderTableLoadingOverlay(message = "Actualizando incidencias...") {
  return `
    <div class="incidencias-table-overlay" aria-live="polite" aria-busy="true">
      <div class="incidencias-table-overlay-card">
        <span class="incidencias-table-overlay-spinner" aria-hidden="true"></span>

        <strong
          style="
            color:var(--text-strong);
            font-size:13px;
            letter-spacing:-.02em;
          "
        >
          ${escapeHtml(message)}
        </strong>

        <span
          style="
            color:var(--text-dim);
            font-size:12px;
            line-height:1.35;
          "
        >
          Solo se está actualizando el historial
        </span>
      </div>
    </div>
  `;
}

/* =========================================================
   MAIN
========================================================= */

export function renderTable({ items = [], state = {} } = {}) {
  const localState = state || incidenciasState || {};
  const list = getResolvedItems(items);
  const refreshing = Boolean(localState?.refreshing);
  const loading = Boolean(localState?.loading);

  if (loading && !list.length) {
    return renderLoadingState();
  }

  if (localState.error && !list.length) {
    return renderErrorState(localState.error);
  }

  if (!list.length) {
    return renderEmptyState();
  }

  const pagination = getPagination(list, localState);

  return `
    ${renderScopedStyles()}

    <section class="incidencias-table-wrap">
      ${renderTableToolbar({
        total: pagination.totalItems,
        page: pagination.page,
        totalPages: pagination.totalPages,
        from: pagination.from,
        to: pagination.to,
        refreshing,
      })}

      <div class="incidencias-desktop-table">
        ${renderDesktopTable(pagination.items, localState)}
      </div>

      ${renderMobileCards(pagination.items, localState)}

      ${refreshing ? renderTableLoadingOverlay("Actualizando incidencias...") : ""}
    </section>
  `;
}

export function renderCards({ items = [], state = {} } = {}) {
  return renderTable({ items, state });
}
