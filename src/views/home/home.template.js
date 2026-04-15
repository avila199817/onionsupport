/* =========================================================
   Onion SPA - Home Template
   Archivo: src/views/home/home.template.js

   Responsabilidades:
   - renderizar la vista Home base
   - generar un hero premium simple
   - mostrar una card principal de bienvenida
   - exponer una estructura limpia y escalable
   - mantener compatibilidad con futuras métricas / widgets
========================================================= */

import { getUserDisplayName } from "../../core/index.js";

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
      typeof getUserDisplayName ===
      "function"
        ? getUserDisplayName(user)
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
   PARTIALS
========================================================= */

function renderMiniStat({
  label = "",
  value = "",
  hint = "",
} = {}) {
  return `
    <article class="home-mini-stat">
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

function renderHero({
  user = null,
} = {}) {
  const displayName =
    resolveDisplayName(user);

  const greeting =
    getGreetingByHour();

  return `
    <section class="home-hero">
      <div class="home-hero__eyebrow">
        Onion Support · Workspace
      </div>

      <div class="home-hero__header">
        <div class="home-hero__copy">
          <h1 class="home-hero__title">
            ${escapeHtml(greeting)}, ${escapeHtml(displayName)}
          </h1>

          <p class="home-hero__subtitle">
            Panel principal de Onion Support. Desde aquí iremos montando
            accesos rápidos, métricas operativas y actividad reciente.
          </p>
        </div>
      </div>
    </section>
  `;
}

function renderMainCard({
  appName = "Onion Support",
} = {}) {
  return `
    <section class="home-main-card">
      <div class="home-main-card__surface">
        <div class="home-main-card__top">
          <div class="home-main-card__badge">
            Vista inicial
          </div>

          <h2 class="home-main-card__title">
            Bienvenido al entorno de trabajo
          </h2>

          <p class="home-main-card__text">
            Esta home es la base inicial del panel. De momento dejamos una
            estructura limpia, sólida y lista para escalar con widgets,
            incidencias recientes, estado del sistema y resúmenes de negocio.
          </p>
        </div>

        <div class="home-mini-stats">
          ${renderMiniStat({
            label: "Vista",
            value: "Home",
            hint: "Base inicial montada",
          })}

          ${renderMiniStat({
            label: "Sistema",
            value: "Operativo",
            hint: "Shell y router activos",
          })}

          ${renderMiniStat({
            label: "Proyecto",
            value: appName,
            hint: "Preparado para crecer",
          })}
        </div>
      </div>
    </section>
  `;
}

function renderScopedStyles() {
  return `
    <style>
      .home-view{
        width:100%;
        display:grid;
        gap:24px;
        padding:24px;
      }

      .home-hero{
        position:relative;
        overflow:hidden;
        border-radius:28px;
        border:1px solid rgba(255,255,255,.08);
        background:
          radial-gradient(circle at top right, rgba(255,255,255,.06), transparent 24%),
          linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015)),
          rgba(24,24,27,.72);
        box-shadow:
          0 20px 50px rgba(0,0,0,.18),
          inset 0 1px 0 rgba(255,255,255,.04);
        padding:28px 28px;
      }

      .home-hero__eyebrow{
        display:inline-flex;
        align-items:center;
        gap:10px;
        margin-bottom:14px;
        color:var(--text-dim);
        font-size:12px;
        font-weight:700;
        letter-spacing:.12em;
        text-transform:uppercase;
      }

      .home-hero__eyebrow::before{
        content:"";
        width:10px;
        height:10px;
        border-radius:50%;
        background:linear-gradient(180deg, #22c55e 0%, #16a34a 100%);
        box-shadow:
          0 0 0 4px rgba(34,197,94,.08),
          0 0 12px rgba(34,197,94,.16);
        flex:none;
      }

      .home-hero__header{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:18px;
      }

      .home-hero__copy{
        min-width:0;
        display:grid;
        gap:12px;
      }

      .home-hero__title{
        margin:0;
        color:var(--text-strong);
        font-size:clamp(28px, 4vw, 44px);
        line-height:1.02;
        font-weight:800;
        letter-spacing:-0.03em;
        text-wrap:balance;
      }

      .home-hero__subtitle{
        margin:0;
        max-width:72ch;
        color:var(--text-dim);
        font-size:15px;
        line-height:1.65;
        text-wrap:pretty;
      }

      .home-main-card{
        width:100%;
      }

      .home-main-card__surface{
        position:relative;
        overflow:hidden;
        border-radius:28px;
        border:1px solid rgba(255,255,255,.08);
        background:
          linear-gradient(180deg, rgba(255,255,255,.024), rgba(255,255,255,.010)),
          rgba(24,24,27,.66);
        box-shadow:
          0 18px 44px rgba(0,0,0,.14),
          inset 0 1px 0 rgba(255,255,255,.04);
        padding:28px;
        display:grid;
        gap:24px;
      }

      .home-main-card__top{
        display:grid;
        gap:14px;
      }

      .home-main-card__badge{
        width:max-content;
        min-height:30px;
        padding:0 12px;
        border-radius:999px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        color:var(--text-soft);
        font-size:12px;
        font-weight:700;
        letter-spacing:.08em;
        text-transform:uppercase;
        border:1px solid rgba(255,255,255,.08);
        background:
          linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02)),
          rgba(255,255,255,.02);
      }

      .home-main-card__title{
        margin:0;
        color:var(--text-strong);
        font-size:clamp(22px, 2.2vw, 30px);
        line-height:1.08;
        font-weight:800;
        letter-spacing:-0.025em;
        text-wrap:balance;
      }

      .home-main-card__text{
        margin:0;
        max-width:72ch;
        color:var(--text-dim);
        font-size:15px;
        line-height:1.7;
      }

      .home-mini-stats{
        display:grid;
        grid-template-columns:repeat(3, minmax(0, 1fr));
        gap:16px;
      }

      .home-mini-stat{
        min-width:0;
        border-radius:22px;
        border:1px solid rgba(255,255,255,.07);
        background:
          linear-gradient(180deg, rgba(255,255,255,.024), rgba(255,255,255,.010)),
          rgba(255,255,255,.015);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
        padding:18px 18px;
        display:grid;
        gap:8px;
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
        letter-spacing:-0.025em;
      }

      .home-mini-stat__hint{
        color:var(--text-muted);
        font-size:13px;
        line-height:1.45;
      }

      [data-theme="light"] .home-hero{
        border-color:rgba(15,23,42,.08);
        background:
          radial-gradient(circle at top right, rgba(255,255,255,.75), transparent 24%),
          linear-gradient(180deg, rgba(255,255,255,.88), rgba(255,255,255,.72)),
          rgba(255,255,255,.84);
        box-shadow:
          0 20px 50px rgba(15,23,42,.08),
          inset 0 1px 0 rgba(255,255,255,.8);
      }

      [data-theme="light"] .home-main-card__surface{
        border-color:rgba(15,23,42,.08);
        background:
          linear-gradient(180deg, rgba(255,255,255,.90), rgba(255,255,255,.78)),
          rgba(255,255,255,.88);
        box-shadow:
          0 18px 44px rgba(15,23,42,.08),
          inset 0 1px 0 rgba(255,255,255,.82);
      }

      [data-theme="light"] .home-mini-stat{
        border-color:rgba(15,23,42,.08);
        background:rgba(255,255,255,.72);
      }

      @media (max-width: 920px){
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

      @media (max-width: 640px){
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

export function getHomeTemplate(options = {}) {
  const appName = safeText(
    options?.appName,
    "Onion Support"
  );

  const user =
    options?.user || null;

  return `
    ${renderScopedStyles()}

    <section
      class="home-view"
      data-view="home"
      data-home-view="true"
    >
      ${renderHero({
        user,
      })}

      ${renderMainCard({
        appName,
      })}
    </section>
  `;
}

export { getHomeTemplate as HomeTemplate };
export default getHomeTemplate;
