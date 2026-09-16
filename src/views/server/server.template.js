/* =========================================================
   Onion Support - Servidor Template Boundary
   Archivo: /src/views/server/server.template.js

   V4 · OBSERVABILIDAD TÉCNICA + FINOPS

   Mantiene el template V3 intacto en server.template.base.js y
   añade una capa FinOps alimentada exclusivamente por snapshot canónico.
========================================================= */

import * as Base from "./server.template.base.js";
import { cleanText } from "../../core/presentation-text.js";
import { escapeHtml } from "../../core/escape-html.js";
import { isObject, safeObject } from "../../core/objects.js";
import { safeArray } from "../../core/arrays.js";
import { finiteNumber } from "../../core/numbers.js";
import { CURRENCY_POLICIES, formatCurrency } from "../../core/format.js";


export const SERVER_TEMPLATE_VERSION =
  "server.template.observability.v4-health-finops";
export const SERVIDOR_TEMPLATE_VERSION = SERVER_TEMPLATE_VERSION;

export const DEFAULT_PAGE_SIZE = Base.DEFAULT_PAGE_SIZE;
export const SERVER_ACTIONS = Base.SERVER_ACTIONS;
export const SERVER_STATUS = Base.SERVER_STATUS;



function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

function formatMoney(value, currency = "EUR", options = {}) {
  const number = finiteNumber(value, null);
  if (number === null) return "—";
  const code = /^[A-Z]{3}$/.test(cleanText(currency, "").toUpperCase())
    ? cleanText(currency).toUpperCase()
    : "EUR";
  return formatCurrency(number, code, options.compact ? CURRENCY_POLICIES.standard : CURRENCY_POLICIES.precise);
}

function formatPercent(value) {
  const number = finiteNumber(value, null);
  if (number === null) return "—";
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(Math.abs(number) >= 10 ? 0 : 1)}%`;
}

function formatShortDate(value = "") {
  const raw = cleanText(value, "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw || "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    }).format(
      new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    );
  } catch {
    return `${match[3]}/${match[2]}`;
  }
}

function formatDateTime(value = "") {
  const parsed = Date.parse(cleanText(value, ""));
  if (!Number.isFinite(parsed)) return "—";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(parsed));
  } catch {
    return "—";
  }
}

function icon(name = "") {
  const common = [
    'aria-hidden="true"',
    'focusable="false"',
    'width="18"',
    'height="18"',
    'viewBox="0 0 24 24"',
    'fill="none"',
    'stroke="currentColor"',
    'stroke-width="2"',
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
  ].join(" ");

  const icons = {
    euro: `<svg ${common}><path d="M4 10h10"/><path d="M4 14h9"/><path d="M19 6.5A7 7 0 1 0 19 17.5"/></svg>`,
    chart: `<svg ${common}><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>`,
    calendar: `<svg ${common}><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
    activity: `<svg ${common}><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>`,
    cloud: `<svg ${common}><path d="M17.5 19H8a6 6 0 1 1 5.6-8.1A4.5 4.5 0 1 1 17.5 19z"/></svg>`,
    alert: `<svg ${common}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    resource: `<svg ${common}><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/></svg>`,
  };

  return icons[name] || icons.euro;
}

function costSnapshot(input = {}) {
  return safeObject(input?.snapshot?.costs, {});
}

function costTrendClass(level = "unknown") {
  const value = cleanText(level, "unknown").toLowerCase();
  if (["normal", "watch", "spike"].includes(value)) return value;
  return "unknown";
}

function renderCostKpi({ label, value, detail, tone = "neutral", iconName = "euro" }) {
  return `
    <article class="server-cost-kpi server-cost-kpi--${attr(tone)}">
      <span class="server-cost-kpi-icon">
        ${icon(iconName)}
      </span>

      <div class="server-cost-kpi-copy">
        <span class="server-cost-kpi-label">
          ${escapeHtml(label)}
        </span>

        <strong class="server-cost-kpi-value">
          ${escapeHtml(value)}
        </strong>

        <span class="server-cost-kpi-detail">
          ${escapeHtml(detail)}
        </span>
      </div>
    </article>
  `;
}

function axisMoney(value, currency) {
  const number = finiteNumber(value, 0);
  const code = cleanText(currency, "EUR").toUpperCase();

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: /^[A-Z]{3}$/.test(code) ? code : "EUR",
      notation: number >= 1000 ? "compact" : "standard",
      minimumFractionDigits: 0,
      maximumFractionDigits: number < 2 ? 2 : 1,
    }).format(number);
  } catch {
    return number.toFixed(number < 2 ? 2 : 1);
  }
}

function renderCostChart(costs = {}) {
  const daily = safeArray(costs.daily).filter((item) => cleanText(item?.date, ""));
  const currency = cleanText(costs.currency, "EUR");

  if (!daily.length) {
    return `
      <div class="server-cost-chart-empty">
        ${icon("chart")}
        <strong>Sin serie diaria todavía.</strong>
        <span>Cost Management aún no ha devuelto puntos para el mes actual.</span>
      </div>
    `;
  }

  const width = 920;
  const height = 270;
  const left = 62;
  const right = 18;
  const top = 20;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const maxCost = Math.max(
    0.01,
    ...daily.map((item) => finiteNumber(item?.cost, 0))
  );

  const step = plotWidth / Math.max(daily.length, 1);
  const barWidth = Math.max(4, Math.min(22, step * 0.62));

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = top + plotHeight - plotHeight * ratio;
      const value = maxCost * ratio;

      return `
        <line
          class="server-cost-grid-line"
          x1="${left}"
          x2="${width - right}"
          y1="${y.toFixed(2)}"
          y2="${y.toFixed(2)}"
        />
        <text
          class="server-cost-axis-label"
          x="${left - 10}"
          y="${(y + 4).toFixed(2)}"
          text-anchor="end"
        >${escapeHtml(axisMoney(value, currency))}</text>
      `;
    })
    .join("");

  const bars = daily
    .map((item, index) => {
      const cost = Math.max(0, finiteNumber(item?.cost, 0));
      const h = Math.max(cost > 0 ? 2 : 0, (cost / maxCost) * plotHeight);
      const x = left + index * step + (step - barWidth) / 2;
      const y = top + plotHeight - h;
      const day = finiteNumber(item?.day, index + 1);
      const showLabel =
        index === 0 ||
        index === daily.length - 1 ||
        day % 5 === 0;

      return `
        <g class="server-cost-bar-group${item?.partial === true ? " is-partial" : ""}">
          <rect
            class="server-cost-bar"
            x="${x.toFixed(2)}"
            y="${y.toFixed(2)}"
            width="${barWidth.toFixed(2)}"
            height="${h.toFixed(2)}"
            rx="2"
          >
            <title>${escapeHtml(`${formatShortDate(item.date)} · ${formatMoney(cost, currency, { compact: true })}${item?.partial ? " · parcial" : ""}`)}</title>
          </rect>

          ${showLabel
            ? `<text
                class="server-cost-x-label"
                x="${(x + barWidth / 2).toFixed(2)}"
                y="${height - 15}"
                text-anchor="middle"
              >${escapeHtml(String(day))}</text>`
            : ""}
        </g>
      `;
    })
    .join("");

  return `
    <div class="server-cost-chart-wrap">
      <svg
        class="server-cost-chart"
        viewBox="0 0 ${width} ${height}"
        role="img"
        aria-label="Coste diario del mes actual"
      >
        ${grid}
        ${bars}
      </svg>
    </div>
  `;
}

function renderBreakdownList(items = [], currency = "EUR", type = "service") {
  const list = safeArray(items).slice(0, 5);

  if (!list.length) {
    return `
      <div class="server-cost-breakdown-empty">
        Sin desglose disponible.
      </div>
    `;
  }

  return list
    .map((item) => {
      const meta = type === "resource"
        ? [cleanText(item.resourceGroup, ""), cleanText(item.serviceName, "")]
            .filter(Boolean)
            .join(" · ")
        : `${finiteNumber(item.sharePct, 0).toFixed(1)}% del mes`;

      return `
        <article class="server-cost-breakdown-item">
          <div class="server-cost-breakdown-head">
            <div class="server-cost-breakdown-copy">
              <strong title="${attr(item.name)}">
                ${escapeHtml(cleanText(item.name, "Sin nombre"))}
              </strong>
              <span>
                ${escapeHtml(meta || "Sin detalle")}
              </span>
            </div>

            <span class="server-cost-breakdown-value">
              ${escapeHtml(formatMoney(item.total, currency, { compact: true }))}
            </span>
          </div>

          <meter
            class="server-cost-share-meter"
            min="0"
            max="100"
            value="${attr(Math.max(0, Math.min(100, finiteNumber(item.sharePct, 0))))}"
            aria-label="${attr(`Peso de ${cleanText(item.name, "elemento")} en el coste del mes`)}"
          ></meter>
        </article>
      `;
    })
    .join("");
}

function renderUnavailableCosts(costs = {}) {
  const setupRequired = costs.setupRequired === true;

  return `
    <section class="server-panel server-panel--costs" data-cost-status="unavailable">
      <header class="server-section-head">
        <div>
          <p class="server-section-kicker">FinOps</p>
          <h2 class="server-section-title">Coste Azure</h2>
        </div>

        <span class="server-cost-state server-cost-state--unknown">
          ${setupRequired ? "Conexión pendiente" : "No disponible"}
        </span>
      </header>

      <div class="server-cost-unavailable">
        <span class="server-cost-unavailable-icon">
          ${icon(setupRequired ? "cloud" : "alert")}
        </span>

        <div>
          <strong>
            ${setupRequired
              ? "Falta conectar Cost Management al backend."
              : "Cost Management no responde ahora mismo."}
          </strong>

          <span>
            ${escapeHtml(
              cleanText(
                costs.message,
                "El health técnico sigue operativo; el coste se recuperará de forma independiente."
              )
            )}
          </span>

          <code>${escapeHtml(cleanText(costs.code, "AZURE_COST_UNAVAILABLE"))}</code>
        </div>
      </div>
    </section>
  `;
}

export function renderCostObservability(input = {}) {
  const costs = costSnapshot(input);

  if (costs.available !== true || !isObject(costs.currentMonth)) {
    return renderUnavailableCosts(costs);
  }

  const month = safeObject(costs.currentMonth);
  const comparison = safeObject(costs.comparison);
  const trend = safeObject(costs.trend);
  const currency = cleanText(costs.currency, "EUR");
  const trendClass = costTrendClass(trend.level);

  const latest = safeObject(month.latestCompleteDay, {});
  const comparablePct = finiteNumber(comparison.deltaComparablePct, null);
  const comparisonTone = comparablePct === null
    ? "neutral"
    : comparablePct > 20
      ? "watch"
      : comparablePct < -20
        ? "good"
        : "neutral";

  return `
    <section
      class="server-panel server-panel--costs"
      data-cost-status="available"
      data-cost-trend="${attr(trendClass)}"
    >
      <header class="server-section-head server-cost-section-head">
        <div>
          <p class="server-section-kicker">FinOps</p>
          <h2 class="server-section-title">
            Coste Azure · ${escapeHtml(cleanText(month.label, "Mes actual"))}
          </h2>
        </div>

        <div class="server-cost-head-meta">
          <span class="server-cost-state server-cost-state--${attr(trendClass)}">
            ${escapeHtml(cleanText(trend.label, "Patrón sin evaluar"))}
          </span>

          <span class="server-section-badge">
            ${escapeHtml(
              costs.costDataThrough
                ? `Datos hasta ${formatShortDate(costs.costDataThrough)}`
                : `Consultado ${formatDateTime(costs.checkedAt)}`
            )}
          </span>
        </div>
      </header>

      <div class="server-cost-kpi-grid">
        ${renderCostKpi({
          label: "Mes actual",
          value: formatMoney(month.total, currency),
          detail: `${finiteNumber(month.completedDays, 0)} días completos · PreTaxCost`,
          tone: "primary",
          iconName: "euro",
        })}

        ${renderCostKpi({
          label: "Último día completo",
          value: latest.date ? formatMoney(latest.cost, currency) : "—",
          detail: latest.date ? formatShortDate(latest.date) : "Sin día completo todavía",
          tone: trendClass === "spike" ? "danger" : trendClass === "watch" ? "watch" : "good",
          iconName: "calendar",
        })}

        ${renderCostKpi({
          label: "Proyección simple",
          value: formatMoney(month.projected, currency),
          detail: `${formatMoney(month.averageDaily, currency, { compact: true })}/día · no es Azure Forecast`,
          tone: "neutral",
          iconName: "chart",
        })}

        ${renderCostKpi({
          label: "Vs. mismo periodo anterior",
          value: comparablePct === null ? "Nuevo consumo" : formatPercent(comparablePct),
          detail: `${formatMoney(month.total, currency, { compact: true })} vs ${formatMoney(comparison.previousComparableTotal, currency, { compact: true })}`,
          tone: comparisonTone,
          iconName: "activity",
        })}
      </div>

      <div class="server-cost-main-grid">
        <div class="server-cost-chart-panel">
          <div class="server-cost-subhead">
            <div>
              <span class="server-cost-subtitle">Coste diario</span>
              <strong>Evolución mensual</strong>
            </div>

            <span class="server-cost-subnote">
              ${escapeHtml(cleanText(trend.detail, ""))}
            </span>
          </div>

          ${renderCostChart(costs)}

          <div class="server-cost-chart-foot">
            <span>
              Máximo: ${escapeHtml(
                month.peakDay?.date
                  ? `${formatMoney(month.peakDay.cost, currency, { compact: true })} · ${formatShortDate(month.peakDay.date)}`
                  : "—"
              )}
            </span>

            <span>
              Total mes anterior: ${escapeHtml(formatMoney(comparison.previousMonthTotal, currency, { compact: true }))}
            </span>
          </div>
        </div>

        <aside class="server-cost-breakdowns">
          <section class="server-cost-breakdown-group">
            <header class="server-cost-subhead">
              <div>
                <span class="server-cost-subtitle">Servicios</span>
                <strong>Qué está costando</strong>
              </div>
              ${icon("cloud")}
            </header>

            <div class="server-cost-breakdown-list">
              ${renderBreakdownList(costs.services, currency, "service")}
            </div>
          </section>

          <section class="server-cost-breakdown-group">
            <header class="server-cost-subhead">
              <div>
                <span class="server-cost-subtitle">Recursos</span>
                <strong>Quién genera el coste</strong>
              </div>
              ${icon("resource")}
            </header>

            <div class="server-cost-breakdown-list">
              ${renderBreakdownList(costs.resources, currency, "resource")}
            </div>
          </section>
        </aside>
      </div>

      <footer class="server-cost-footer">
        <span>
          Azure Cost Management · caché backend ${Math.max(1, Math.round(finiteNumber(costs.cache?.ttlMs, 900000) / 60000))} min
        </span>

        <span>
          ${costs.cache?.stale === true
            ? "Mostrando último snapshot válido porque el refresco falló."
            : "Los costes pueden llevar retraso respecto al consumo en tiempo real."}
        </span>
      </footer>
    </section>
  `;
}

function injectCostPanel(html = "", input = {}) {
  const source = String(html || "");
  const marker = '<section class="server-panel server-panel--services">';

  if (!source.includes(marker)) return source;

  const upgraded = source
    .replace(
      "Estado operativo del backend, Cosmos DB y runtime Node.",
      "Estado operativo del backend, Cosmos DB, runtime Node y coste Azure."
    )
    .replace(
      "Latencias, recursos y señales críticas en una sola vista.",
      "Latencias, recursos, coste mensual y señales críticas en una sola vista."
    );

  return upgraded.replace(
    marker,
    `${renderCostObservability(input)}\n\n    ${marker}`
  );
}

export function renderHeader(input = {}) {
  return Base.renderHeader(input);
}

export function renderServiceCard(service = {}, snapshot = {}) {
  return Base.renderServiceCard(service, snapshot);
}

export function renderDashboard(input = {}) {
  return `${renderCostObservability(input)}${Base.renderDashboard(input)}`;
}

export function renderLoadingState(input = {}) {
  return injectCostPanel(Base.renderLoadingState(input), input);
}

export function renderErrorState(input = {}) {
  return injectCostPanel(Base.renderErrorState(input), input);
}

export function renderAccessDeniedState(input = {}) {
  return Base.renderAccessDeniedState(input);
}

export function renderServerTemplate(input = {}) {
  return injectCostPanel(Base.renderServerTemplate(input), input);
}

export function renderServidorTemplate(input = {}) {
  return renderServerTemplate(input);
}

export function renderTemplate(input = {}) {
  return renderServerTemplate(input);
}

export function getServerTemplateSnapshot(input = {}) {
  const base = Base.getServerTemplateSnapshot(input);
  const costs = costSnapshot(input);

  return {
    ...base,
    version: SERVER_TEMPLATE_VERSION,
    costs: {
      available: costs.available === true,
      status: cleanText(costs.status, "pending"),
      currentMonthTotal: finiteNumber(costs.currentMonth?.total, null),
      currency: cleanText(costs.currency, ""),
      trend: cleanText(costs.trend?.level, "unknown"),
      dailyPoints: safeArray(costs.daily).length,
    },
    architecture: {
      ...safeObject(base.architecture),
      finOpsPanel: true,
      inlineChartLibrary: false,
      costCredentialsInBrowser: false,
    },
  };
}

export function getSnapshot(input = {}) {
  return getServerTemplateSnapshot(input);
}

export const normalizeStatus = Base.normalizeStatus;
export const getStatusLabel = Base.getStatusLabel;

export default renderServerTemplate;
