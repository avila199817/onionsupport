/* =========================================================
   Onion Support - Home Template · generated domain module
   Shared by /src/views/home/home.template.js
========================================================= */

import {
  HOME_ACTIONS,
  attr,
  cleanText,
  escapeHtml,
  formatDate,
  icon,
  initialsFrom,
  normalizeKey,
  safeDisplayId,
  safeImageSrc,
  safeRoute,
  statusKey,
  toDate,
  visibleStatus,
} from "./home.template.foundation.js";

export function avatar(user = {}) {
  const image = safeImageSrc(user.avatarUrl);
  const name = cleanText(user.displayName, "Usuario");
  const initials = cleanText(user.initials, initialsFrom(name));

  return `
    <span
      class="home-current-user-avatar ${image ? "has-image" : "is-fallback"}"
      aria-label="${attr(name)}"
      data-has-avatar="${image ? "true" : "false"}"
    >
      ${image ? `<img src="${attr(image)}" alt="" loading="eager" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" draggable="false">` : ""}
      <span class="home-avatar-initials" aria-hidden="true">${escapeHtml(initials)}</span>
    </span>
  `;
}

export function statusBadge(value = "", fallback = "Sin estado") {
  const label = visibleStatus(value) || fallback;
  const tone = statusKey(value);

  return `<span class="home-status home-status--${attr(tone)}" data-home-status="${attr(normalizeKey(value))}">${escapeHtml(label)}</span>`;
}

export function entityIdBadge(kind = "ID", value = "") {
  const id = safeDisplayId(value, "");
  if (!id) return "";

  const label = cleanText(kind, "ID");
  const showLabel = normalizeKey(label) !== "id";

  return `
    <span
      class="home-entity-id"
      data-home-id-kind="${attr(normalizeKey(label) || "id")}"
      title="${attr(`${label} ${id}`)}"
    >
      ${showLabel ? `<span>${escapeHtml(label)}</span>` : ""}
      <code>${escapeHtml(id)}</code>
    </span>
  `;
}

export function actionButton({ label = "", route = "/", ariaLabel = "" } = {}) {
  const href = safeRoute(route, "/");

  return `
    <button
      type="button"
      class="home-link-button"
      data-home-action="${HOME_ACTIONS.NAVIGATE}"
      data-route="${attr(href)}"
      aria-label="${attr(ariaLabel || label)}"
    >
      <span>${escapeHtml(label)}</span>
      ${icon("arrow-right", "home-link-button-icon")}
    </button>
  `;
}

export function emptyState(title = "Sin datos", text = "No hay información disponible.", iconName = "activity") {
  return `
    <div class="home-empty-state">
      <span class="home-empty-state-icon" aria-hidden="true">${icon(iconName)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

export function errorBanner(message = "") {
  const text = cleanText(message, "");
  if (!text) return "";

  return `
    <div class="home-alert home-alert--error" role="alert">
      <span class="home-alert-icon" aria-hidden="true">${icon("alert")}</span>
      <span>${escapeHtml(text)}</span>
      <button type="button" class="home-btn" data-home-action="${HOME_ACTIONS.RETRY}">
        ${icon("refresh")}
        <span>Reintentar</span>
      </button>
    </div>
  `;
}

export function staleBanner(stale = false) {
  if (!stale) return "";

  return `
    <div class="home-alert home-alert--stale" role="status">
      <span class="home-alert-icon" aria-hidden="true">${icon("clock")}</span>
      <span>Mostrando datos guardados temporalmente.</span>
    </div>
  `;
}

export function loadingCards(count = 4) {
  return Array.from({ length: count }, (_, index) => `
    <article class="home-stat-card home-stat-card--loading" aria-hidden="true" data-home-loading-card="${index + 1}">
      <span class="home-skeleton home-skeleton--icon"></span>
      <span class="home-skeleton home-skeleton--title"></span>
      <span class="home-skeleton home-skeleton--value"></span>
      <span class="home-skeleton home-skeleton--text"></span>
    </article>
  `).join("");
}

export function panelLoadingRows(type = "activity", count = 4) {
  const invoice = type === "invoice";

  return `
    <div class="home-panel-loading home-panel-loading--${invoice ? "invoice" : "activity"}" aria-hidden="true">
      ${Array.from({ length: count }, (_, index) => `
        <div class="home-panel-loading-row home-panel-loading-row--${invoice ? "invoice" : "activity"}" data-home-loading-row="${index + 1}">
          <span class="home-skeleton home-panel-loading-icon"></span>
          <span class="home-panel-loading-copy">
            <span class="home-skeleton home-panel-loading-title"></span>
            <span class="home-skeleton home-panel-loading-meta"></span>
          </span>
          <span class="home-skeleton ${invoice ? "home-panel-loading-amount" : "home-panel-loading-date"}"></span>
        </div>
      `).join("")}
    </div>
  `;
}

export function freshness(updatedAt = "") {
  const date = toDate(updatedAt);
  if (!date) return "";

  return `
    <span class="home-panel-freshness" title="Última actualización">
      ${icon("clock")}
      <span>${escapeHtml(formatDate(date))}</span>
    </span>
  `;
}

/* =========================================================
   HEADER / STATS
========================================================= */
