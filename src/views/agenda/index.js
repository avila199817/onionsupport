/* =========================================================
   Onion Support - Agenda
   Archivo: /src/views/agenda/index.js

   PRODUCTIVO · CORREO FULL-VIEW PARITY · SIN API

   Responsabilidad:
   - Exponer la vista privada Agenda al Router.
   - Pintar un calendario mensual real usando únicamente fecha local.
   - Mantener navegación de mes, Hoy y selección de día en memoria.
   - Preparar la superficie para futuras visitas/citas sin inventar datos.
   - Sin HTTP, sin storage y sin dependencias de backend.
========================================================= */

import { escapeHtml } from "../../core/escape-html.js";

export const AGENDA_VIEW_VERSION =
  "agenda.view.v2-correo-parity";

export const AGENDA_VIEW_NAME =
  "AgendaView";

export const AGENDA_CANONICAL_PATH =
  "/agenda";

const WEEK_DAYS = Object.freeze([
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
]);

const MINI_WEEK_DAYS = Object.freeze([
  "L",
  "M",
  "X",
  "J",
  "V",
  "S",
  "D",
]);

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isDomNode(node) {
  return Boolean(
    node &&
    node.nodeType === 1 &&
    typeof node.replaceChildren === "function"
  );
}

function localToday() {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value = "") {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function sameDay(a, b) {
  return Boolean(
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const firstVisible = new Date(year, month, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      firstVisible.getFullYear(),
      firstVisible.getMonth(),
      firstVisible.getDate() + index
    );

    return {
      date,
      inMonth: date.getMonth() === month,
    };
  });
}

function capitalize(value = "") {
  const text = String(value || "");
  return text
    ? text.charAt(0).toLocaleUpperCase("es-ES") + text.slice(1)
    : "";
}

function monthLabel(date) {
  try {
    return capitalize(
      new Intl.DateTimeFormat("es-ES", {
        month: "long",
        year: "numeric",
      }).format(date)
    );
  } catch {
    return `${date.getMonth() + 1}/${date.getFullYear()}`;
  }
}

function miniMonthLabel(date) {
  try {
    return capitalize(
      new Intl.DateTimeFormat("es-ES", {
        month: "long",
      }).format(date)
    );
  } catch {
    return String(date.getMonth() + 1);
  }
}

function longDateLabel(date) {
  try {
    return capitalize(
      new Intl.DateTimeFormat("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date)
    );
  } catch {
    return date.toLocaleDateString();
  }
}

function icon(name = "calendar") {
  const paths = {
    calendar: `<rect x="3.5" y="4.5" width="17" height="16" rx="2.25"/><path d="M7.5 2.75v3.5M16.5 2.75v3.5M3.5 9h17"/>`,
    chevronLeft: `<path d="m14.5 6-6 6 6 6"/>`,
    chevronRight: `<path d="m9.5 6 6 6-6 6"/>`,
    check: `<path d="m5 12 4 4L19 6"/>`,
  };

  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.calendar}</svg>`;
}

function renderMiniCalendar(state) {
  const today = state.today;
  const cells = monthCells(
    state.visible.getFullYear(),
    state.visible.getMonth()
  );

  return `
    <div class="agenda-mini-week" aria-hidden="true">
      ${MINI_WEEK_DAYS.map((day) => `<span>${day}</span>`).join("")}
    </div>
    <div class="agenda-mini-grid" role="grid" aria-label="Calendario pequeño">
      ${cells.map(({ date, inMonth }) => {
        const key = dateKey(date);
        const selected = sameDay(date, state.selected);
        const isToday = sameDay(date, today);
        return `<button
          class="agenda-mini-day${inMonth ? "" : " is-outside"}${isToday ? " is-today" : ""}${selected ? " is-selected" : ""}"
          type="button"
          data-agenda-action="select-date"
          data-agenda-date="${key}"
          aria-label="${escapeHtml(longDateLabel(date))}"
          aria-selected="${selected ? "true" : "false"}"
          role="gridcell"
        ><span>${date.getDate()}</span></button>`;
      }).join("")}
    </div>`;
}

function renderMonthGrid(state) {
  const today = state.today;
  const cells = monthCells(
    state.visible.getFullYear(),
    state.visible.getMonth()
  );

  return `
    <div class="agenda-week-head" role="row" aria-hidden="true">
      ${WEEK_DAYS.map((day) => `<span role="columnheader">${day}</span>`).join("")}
    </div>
    <div class="agenda-month-grid" role="grid" aria-label="${escapeHtml(monthLabel(state.visible))}">
      ${cells.map(({ date, inMonth }) => {
        const key = dateKey(date);
        const selected = sameDay(date, state.selected);
        const isToday = sameDay(date, today);
        return `<button
          class="agenda-day${inMonth ? "" : " is-outside"}${isToday ? " is-today" : ""}${selected ? " is-selected" : ""}"
          type="button"
          data-agenda-action="select-date"
          data-agenda-date="${key}"
          aria-label="${escapeHtml(longDateLabel(date))}"
          aria-selected="${selected ? "true" : "false"}"
          role="gridcell"
        >
          <span class="agenda-day-number">${date.getDate()}</span>
          <span class="agenda-day-space" aria-hidden="true"></span>
        </button>`;
      }).join("")}
    </div>`;
}

function renderInspector(state) {
  return `
    <div class="agenda-inspector-head">
      <span class="agenda-inspector-kicker">Día seleccionado</span>
      <h2>${escapeHtml(longDateLabel(state.selected))}</h2>
    </div>

    <div class="agenda-inspector-empty">
      <span class="agenda-inspector-icon" aria-hidden="true">${icon("calendar")}</span>
      <strong>Sin planificación conectada</strong>
      <p>Las visitas, citas y trabajos de este día aparecerán aquí cuando conectemos los datos.</p>
    </div>

    <div class="agenda-ready-block">
      <span class="agenda-ready-label">Preparado para</span>
      <div class="agenda-ready-list" aria-label="Tipos de planificación preparados">
        <span>Visitas</span>
        <span>Citas</span>
        <span>Trabajos</span>
      </div>
    </div>`;
}

function renderWorkspace(state) {
  return `
    <section class="agenda-view-root" data-agenda-scope="true" data-agenda-view="${AGENDA_VIEW_VERSION}" aria-label="Agenda">
      <div class="agenda-workspace">
        <aside class="agenda-side-panel" aria-label="Navegación de Agenda">
          <div class="agenda-identity-card">
            <span class="agenda-identity-icon" aria-hidden="true">${icon("calendar")}</span>
            <span class="agenda-identity-copy">
              <strong>Agenda</strong>
              <small>Planificación</small>
            </span>
          </div>

          <section class="agenda-mini" aria-label="Calendario mensual pequeño">
            <div class="agenda-mini-head">
              <strong data-agenda-mini-title>${escapeHtml(miniMonthLabel(state.visible))}</strong>
              <span data-agenda-mini-year>${state.visible.getFullYear()}</span>
              <div class="agenda-mini-actions">
                <button type="button" data-agenda-action="prev-month" aria-label="Mes anterior">${icon("chevronLeft")}</button>
                <button type="button" data-agenda-action="next-month" aria-label="Mes siguiente">${icon("chevronRight")}</button>
              </div>
            </div>
            <div data-agenda-mini-calendar>${renderMiniCalendar(state)}</div>
          </section>

          <div class="agenda-side-divider"></div>

          <section class="agenda-calendars" aria-labelledby="agenda-calendars-title">
            <h2 id="agenda-calendars-title">Calendarios</h2>
            <div class="agenda-calendar-row is-active" aria-current="true">
              <span class="agenda-calendar-color" aria-hidden="true"></span>
              <span>Agenda principal</span>
              <i aria-hidden="true">${icon("check")}</i>
            </div>
          </section>

          <div class="agenda-side-note">
            <span class="agenda-side-note-dot" aria-hidden="true"></span>
            <span>Lista para conectar planificación</span>
          </div>
        </aside>

        <main class="agenda-main-panel">
          <header class="agenda-toolbar">
            <div class="agenda-toolbar-nav">
              <button class="agenda-btn agenda-btn--today" type="button" data-agenda-action="today">Hoy</button>
              <div class="agenda-nav-pair" aria-label="Navegar meses">
                <button class="agenda-icon-btn" type="button" data-agenda-action="prev-month" aria-label="Mes anterior">${icon("chevronLeft")}</button>
                <button class="agenda-icon-btn" type="button" data-agenda-action="next-month" aria-label="Mes siguiente">${icon("chevronRight")}</button>
              </div>
            </div>

            <h1 data-agenda-month-title>${escapeHtml(monthLabel(state.visible))}</h1>

            <span class="agenda-mode-pill" aria-label="Vista actual">Mes</span>
          </header>

          <section class="agenda-calendar" aria-label="Calendario mensual" data-agenda-main-calendar>
            ${renderMonthGrid(state)}
          </section>
        </main>

        <aside class="agenda-inspector" aria-label="Detalle del día" data-agenda-inspector>
          ${renderInspector(state)}
        </aside>
      </div>
    </section>`;
}

function createController(host, context = {}) {
  const today = localToday();
  const state = {
    today,
    visible: new Date(today.getFullYear(), today.getMonth(), 1),
    selected: today,
  };

  let destroyed = false;

  function render() {
    if (destroyed) return false;
    host.innerHTML = renderWorkspace(state);
    return true;
  }

  function refreshCalendarParts() {
    if (destroyed) return false;

    const title = host.querySelector("[data-agenda-month-title]");
    const miniTitle = host.querySelector("[data-agenda-mini-title]");
    const miniYear = host.querySelector("[data-agenda-mini-year]");
    const miniCalendar = host.querySelector("[data-agenda-mini-calendar]");
    const mainCalendar = host.querySelector("[data-agenda-main-calendar]");
    const inspector = host.querySelector("[data-agenda-inspector]");

    if (title) title.textContent = monthLabel(state.visible);
    if (miniTitle) miniTitle.textContent = miniMonthLabel(state.visible);
    if (miniYear) miniYear.textContent = String(state.visible.getFullYear());
    if (miniCalendar) miniCalendar.innerHTML = renderMiniCalendar(state);
    if (mainCalendar) mainCalendar.innerHTML = renderMonthGrid(state);
    if (inspector) inspector.innerHTML = renderInspector(state);
    return true;
  }

  function shiftMonth(delta) {
    state.visible = new Date(
      state.visible.getFullYear(),
      state.visible.getMonth() + delta,
      1
    );
    refreshCalendarParts();
  }

  function onClick(event) {
    const target = event.target?.closest?.("[data-agenda-action]");
    if (!target || destroyed || !host.contains(target)) return;

    const action = target.dataset.agendaAction || "";

    if (action === "prev-month") {
      shiftMonth(-1);
      return;
    }

    if (action === "next-month") {
      shiftMonth(1);
      return;
    }

    if (action === "today") {
      state.today = localToday();
      state.selected = state.today;
      state.visible = new Date(
        state.today.getFullYear(),
        state.today.getMonth(),
        1
      );
      refreshCalendarParts();
      return;
    }

    if (action === "select-date") {
      const selected = dateFromKey(target.dataset.agendaDate || "");
      if (!selected) return;

      state.selected = selected;

      if (
        selected.getFullYear() !== state.visible.getFullYear() ||
        selected.getMonth() !== state.visible.getMonth()
      ) {
        state.visible = new Date(
          selected.getFullYear(),
          selected.getMonth(),
          1
        );
      }

      refreshCalendarParts();
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    host.removeEventListener("click", onClick);
    host.removeAttribute("data-agenda-host");
  }

  render();
  host.addEventListener("click", onClick);

  const parentSignal = context?.signal;
  if (parentSignal && typeof parentSignal.addEventListener === "function") {
    parentSignal.addEventListener("abort", destroy, { once: true });
  }

  return Object.freeze({
    version: AGENDA_VIEW_VERSION,
    destroy,
  });
}

export function AgendaView(
  host = null,
  context = {}
) {
  if (!isBrowser() || !isDomNode(host)) {
    return null;
  }

  if (context?.signal?.aborted === true) {
    return null;
  }

  host.dataset.view = "agenda";
  host.dataset.agendaHost = "true";
  host.dataset.agendaViewVersion = AGENDA_VIEW_VERSION;

  return createController(
    host,
    context && typeof context === "object" ? context : {}
  );
}

export default AgendaView;
