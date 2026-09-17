/* =========================================================
   Onion Support - Agenda
   Archivo: /src/views/agenda/index.js

   PRODUCTIVO · CITAS REALES · PERSISTENCIA EN BASE DE DATOS

   Responsabilidad:
   - Exponer la vista privada Agenda al Router.
   - Pintar el calendario mensual usando sólo fechas civiles.
   - Seleccionar un día, ofrecer «+» a quien pueda crear, y abrir el alta y
     el detalle con el SISTEMA MODAL COMPARTIDO (shell, host y lifecycle de
     `features/entity-overlay`), sin reconstruir ninguna pieza.
   - Consultar al servidor sólo el intervalo visible e integrar el resultado
     confirmado, sin recargar la SPA y sin datos ficticios.
   - Abrir una cita concreta desde un enlace autenticado (`?citaId=`).

   Lo que NO hace: emitir diálogo, backdrop, bloqueo de scroll o cierre
   propios; guardar citas en el navegador; inventar estados.
========================================================= */

import { escapeHtml } from "../../core/escape-html.js";
import { cleanText } from "../../core/presentation-text.js";

import {
  createModalHost,
  renderModalContent,
  renderModalShell,
} from "../../features/entity-overlay/modal-host.js";
import {
  createModalLifecycle,
  restoreModalFocus,
} from "../../features/entity-overlay/modal-lifecycle.js";
import { openModalConfirmation } from "../../features/entity-overlay/modal-confirmation.js";

/* Mismo combobox accesible que sirve al alta de Incidencias: una sola
   autoridad de teclado, ARIA e IME para la selección de usuario. */
import { installIncidenciasCreateUserCombobox } from "../incidencias/incidencias.create-user-combobox.js";

import {
  AGENDA_TIME_ZONE,
  dateFromKey,
  dateKey,
  isDateKey,
  isTimeKey,
  localToday,
  longDateLabel,
  miniMonthLabel,
  monthCells,
  monthLabel,
  monthRange,
  sameDay,
} from "./agenda.dates.js";

import AgendaApi, {
  agendaErrorMessage,
  cancelCita,
  createCita,
  invalidateAgendaCache,
  loadCitaDetail,
  loadCitasRange,
  searchAgendaUsers,
  setAgendaIdentity,
  USERS_SEARCH_MIN_LENGTH,
} from "./agenda.api.js";

import {
  AGENDA_CREATE_ACTIONS,
  AGENDA_CREATE_FORM_ID,
  renderAgendaCreateModal,
} from "./agenda.template.create.js";

import {
  AGENDA_DETAIL_ACTIONS,
  renderAgendaDetailModal,
} from "./agenda.template.detail.js";

const AGENDA_VIEW_VERSION = "agenda.view.v3-citas";

const CREATE_HOST_ID = "agenda-create-modal-root";
const DETAIL_HOST_ID = "agenda-detail-modal-root";
const EXIT_CONFIRM_HOST_ID = "agenda-exit-confirm-root";

const SEARCH_DEBOUNCE_MS = 220;
/* Citas visibles en una casilla antes de ofrecer «+N más». */
const CELL_EVENT_LIMIT = 2;

const WEEK_DAYS = Object.freeze(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
const MINI_WEEK_DAYS = Object.freeze(["L", "M", "X", "J", "V", "S", "D"]);

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isDomNode(node) {
  return Boolean(node && node.nodeType === 1 && typeof node.replaceChildren === "function");
}

function icon(name = "calendar") {
  const paths = {
    calendar: `<rect x="3.5" y="4.5" width="17" height="16" rx="2.25"/><path d="M7.5 2.75v3.5M16.5 2.75v3.5M3.5 9h17"/>`,
    chevronLeft: `<path d="m14.5 6-6 6 6 6"/>`,
    chevronRight: `<path d="m9.5 6 6 6-6 6"/>`,
    check: `<path d="m5 12 4 4L19 6"/>`,
    plus: `<path d="M12 5.5v13M5.5 12h13"/>`,
  };

  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.calendar}</svg>`;
}

/* =========================================================
   MODELO DE CELDA
========================================================= */

function citasByDay(citas = []) {
  const map = new Map();
  for (const cita of citas) {
    if (!map.has(cita.fechaLocal)) map.set(cita.fechaLocal, []);
    map.get(cita.fechaLocal).push(cita);
  }
  return map;
}

function citaChipLabel(cita, admin) {
  const who = admin ? cleanText(cita.destinatarioNombre, "") : "";
  return who ? `${cita.horaLocal} · ${who}` : `${cita.horaLocal} · ${cita.asunto}`;
}

/* =========================================================
   CALENDARIO
========================================================= */

function renderDayEvents(state, key) {
  const items = state.byDay.get(key) || [];
  if (!items.length) return "";

  const visible = items.slice(0, CELL_EVENT_LIMIT);
  const rest = items.length - visible.length;

  return `
    <ul class="agenda-day-events" aria-label="Citas del día">
      ${visible.map((cita) => `
        <li>
          <button
            type="button"
            class="agenda-day-event is-${escapeHtml(cita.estado)}"
            data-agenda-action="open-cita"
            data-agenda-cita="${escapeHtml(cita.id)}"
            data-agenda-cita-user="${escapeHtml(cita.userId || "")}"
            title="${escapeHtml(citaChipLabel(cita, state.admin))}"
          >
            <span class="agenda-day-event-time">${escapeHtml(cita.horaLocal)}</span>
            <span class="agenda-day-event-text">${escapeHtml(state.admin ? (cita.destinatarioNombre || cita.asunto) : cita.asunto)}</span>
          </button>
        </li>`).join("")}
      ${rest > 0
        ? `<li><button type="button" class="agenda-day-more" data-agenda-action="select-date" data-agenda-date="${escapeHtml(key)}">+${rest} más</button></li>`
        : ""}
    </ul>`;
}

/*
  Una casilla es un contenedor, no un botón: dentro viven la superficie de
  selección, el «+» y las citas, todos hermanos. Así ningún clic viaja por
  propagación de un botón a otro ni se abren dos diálogos a la vez.
*/
function renderMonthGrid(state) {
  const cells = monthCells(state.visible.getFullYear(), state.visible.getMonth());

  return `
    <div class="agenda-week-head" role="row" aria-hidden="true">
      ${WEEK_DAYS.map((day) => `<span role="columnheader">${day}</span>`).join("")}
    </div>
    <div class="agenda-month-grid" role="grid" aria-label="${escapeHtml(monthLabel(state.visible))}">
      ${cells.map(({ date, key, inMonth }) => {
        const selected = sameDay(date, state.selected);
        const isToday = sameDay(date, state.today);
        /* La fecha sale del modelo de la casilla, no del texto pintado: los
           días adyacentes llevan su fecha completa real. */
        const label = longDateLabel(date);
        const count = (state.byDay.get(key) || []).length;

        return `
        <div
          class="agenda-day${inMonth ? "" : " is-outside"}${isToday ? " is-today" : ""}${selected ? " is-selected" : ""}"
          role="gridcell"
          data-agenda-cell="true"
          data-agenda-date="${escapeHtml(key)}"
          aria-selected="${selected ? "true" : "false"}"
        >
          <button
            class="agenda-day-surface"
            type="button"
            data-agenda-action="select-date"
            data-agenda-date="${escapeHtml(key)}"
            aria-label="${escapeHtml(count ? `${label}. ${count} cita${count === 1 ? "" : "s"}` : label)}"
          ></button>
          <span class="agenda-day-number" aria-hidden="true">${date.getDate()}</span>
          ${state.canCreate
            ? `<span class="agenda-day-create">
                 <button
                   type="button"
                   class="agenda-day-create-btn"
                   data-agenda-action="create-cita"
                   data-agenda-date="${escapeHtml(key)}"
                   aria-label="${escapeHtml(`Crear cita para el ${label.charAt(0).toLocaleLowerCase("es-ES")}${label.slice(1)}`)}"
                   tabindex="${selected ? "0" : "-1"}"
                 >${icon("plus")}</button>
               </span>`
            : ""}
          ${renderDayEvents(state, key)}
        </div>`;
      }).join("")}
    </div>`;
}

function renderMiniCalendar(state) {
  const cells = monthCells(state.visible.getFullYear(), state.visible.getMonth());

  return `
    <div class="agenda-mini-week" aria-hidden="true">
      ${MINI_WEEK_DAYS.map((day) => `<span>${day}</span>`).join("")}
    </div>
    <div class="agenda-mini-grid" role="grid" aria-label="Calendario pequeño">
      ${cells.map(({ date, key, inMonth }) => {
        const selected = sameDay(date, state.selected);
        const isToday = sameDay(date, state.today);
        return `<button
          class="agenda-mini-day${inMonth ? "" : " is-outside"}${isToday ? " is-today" : ""}${selected ? " is-selected" : ""}"
          type="button"
          data-agenda-action="select-date"
          data-agenda-date="${escapeHtml(key)}"
          aria-label="${escapeHtml(longDateLabel(date))}"
          aria-selected="${selected ? "true" : "false"}"
          role="gridcell"
        ><span>${date.getDate()}</span></button>`;
      }).join("")}
    </div>`;
}

/* =========================================================
   INSPECTOR DEL DÍA
========================================================= */

function renderInspector(state) {
  const key = dateKey(state.selected);
  const items = state.byDay.get(key) || [];

  const list = items.length
    ? `<ul class="agenda-inspector-list">
        ${items.map((cita) => `
          <li>
            <button
              type="button"
              class="agenda-inspector-item is-${escapeHtml(cita.estado)}"
              data-agenda-action="open-cita"
              data-agenda-cita="${escapeHtml(cita.id)}"
              data-agenda-cita-user="${escapeHtml(cita.userId || "")}"
            >
              <span class="agenda-inspector-item-time">${escapeHtml(cita.horaLocal)}</span>
              <span class="agenda-inspector-item-copy">
                <strong>${escapeHtml(state.admin ? (cita.destinatarioNombre || cita.asunto) : cita.asunto)}</strong>
                <small>${escapeHtml(cita.lugar)}</small>
              </span>
              <span class="agenda-status-chip agenda-status-chip--${escapeHtml(cita.estado)}">${escapeHtml(cita.estado === "cancelada" ? "Cancelada" : "Programada")}</span>
            </button>
          </li>`).join("")}
      </ul>`
    : `<div class="agenda-inspector-empty">
        <span class="agenda-inspector-icon" aria-hidden="true">${icon("calendar")}</span>
        <strong>Sin citas este día</strong>
        <p>${state.canCreate ? "Pulsa «+» en la casilla del día para crear una." : "Cuando tengas una cita, aparecerá aquí."}</p>
      </div>`;

  return `
    <div class="agenda-inspector-head">
      <span class="agenda-inspector-kicker">Día seleccionado</span>
      <h2>${escapeHtml(longDateLabel(state.selected))}</h2>
    </div>

    ${state.error ? `<div class="agenda-inspector-error" role="alert">${escapeHtml(state.error)}</div>` : ""}
    ${state.loading ? `<div class="agenda-inspector-loading" aria-live="polite">Cargando citas...</div>` : ""}
    ${list}

    ${state.truncated
      ? `<div class="agenda-inspector-truncated" role="status">Hay más citas en este intervalo de las que se muestran. Acota el mes o consulta un rango más corto.</div>`
      : ""}

    <div class="agenda-ready-block">
      <span class="agenda-ready-label">Zona horaria</span>
      <div class="agenda-ready-list" aria-label="Zona horaria de la agenda">
        <span>${escapeHtml(state.zona)}</span>
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
              <small>Citas</small>
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
            <span>${escapeHtml(state.canCreate ? "Puedes crear citas" : "Aquí ves tus citas")}</span>
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

/* =========================================================
   CONTROLADOR
========================================================= */

function createController(host, context = {}) {
  const today = localToday();

  const state = {
    today,
    visible: new Date(today.getFullYear(), today.getMonth(), 1),
    selected: today,
    citas: [],
    byDay: new Map(),
    zona: AGENDA_TIME_ZONE,
    loading: false,
    error: "",
    truncated: false,
    admin: context?.isAdmin === true || context?.role === "admin",
    canCreate: false,
  };

  const createState = {
    open: false,
    submitting: false,
    serverError: "",
    pastWarning: "",
    errors: {},
    selectedUser: null,
    idempotencyKey: "",
    opener: null,
    form: { userId: "", fechaLocal: "", horaLocal: "", lugar: "", nota: "", confirmarPasado: false },
    userSearch: { query: "", results: [], loading: false, error: "", empty: false },
  };

  const detailState = {
    open: false,
    loading: false,
    saving: false,
    editing: false,
    cancelling: false,
    error: "",
    errors: {},
    cita: null,
    citaId: "",
    userHint: "",
    opener: null,
    form: { fechaLocal: "", horaLocal: "", lugar: "", nota: "", motivo: "" },
  };

  let destroyed = false;
  let rangeRequest = null;
  let rangeSeq = 0;
  let searchSeq = 0;
  let searchTimer = 0;
  let submitInFlight = null;
  let uninstallCombobox = null;

  const createHost = createModalHost({
    id: CREATE_HOST_ID,
    attributes: { "data-agenda-create-host": "true" },
  });
  const detailHost = createModalHost({
    id: DETAIL_HOST_ID,
    attributes: { "data-agenda-detail-host": "true" },
  });

  let createLifecycle = null;
  let detailLifecycle = null;

  /* -------------------------------------------------------
     RENDER
  ------------------------------------------------------- */

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

  function applyCitas(citas = [], meta = {}) {
    state.citas = citas;
    state.byDay = citasByDay(citas);
    state.truncated = meta.truncado === true;
    state.zona = cleanText(meta.zona, AGENDA_TIME_ZONE);
    if (typeof meta.puedeCrear === "boolean") state.canCreate = meta.puedeCrear;
  }

  /* -------------------------------------------------------
     CARGA DEL INTERVALO VISIBLE
  ------------------------------------------------------- */

  async function loadVisibleRange({ force = false } = {}) {
    if (destroyed) return false;

    const { desde, hasta } = monthRange(state.visible.getFullYear(), state.visible.getMonth());
    const seq = ++rangeSeq;

    rangeRequest?.abort?.();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    rangeRequest = controller;

    state.loading = true;
    state.error = "";
    refreshCalendarParts();

    try {
      const result = await loadCitasRange({ desde, hasta, force, signal: controller?.signal });
      /* Una respuesta de otro mes no puede sustituir al mes vigente. */
      if (destroyed || seq !== rangeSeq) return false;
      applyCitas(result.citas, result);
      return true;
    } catch (error) {
      if (destroyed || seq !== rangeSeq || error?.name === "AbortError") return false;
      state.error = agendaErrorMessage(error, "No se han podido cargar las citas.");
      applyCitas([], {});
      return false;
    } finally {
      if (!destroyed && seq === rangeSeq) {
        state.loading = false;
        rangeRequest = null;
        refreshCalendarParts();
      }
    }
  }

  /* -------------------------------------------------------
     ALTA
  ------------------------------------------------------- */

  function createHasDraft() {
    const form = createState.form;
    return Boolean(
      form.userId ||
      cleanText(form.horaLocal, "") ||
      cleanText(form.lugar, "") ||
      cleanText(form.nota, "") ||
      cleanText(createState.userSearch.query, "")
    );
  }

  function paintCreate({ force = false } = {}) {
    const node = createHost.get();
    if (!node) return null;
    return renderModalContent(node, renderAgendaCreateModal(createState), { forceMount: force });
  }

  function newIdempotencyKey() {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `agenda-${crypto.randomUUID()}`;
      }
    } catch {
      /* Sin crypto se usa el respaldo de abajo. */
    }
    return `agenda-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function openCreate(fechaLocal, opener = null) {
    if (!state.canCreate || !isDateKey(fechaLocal)) return false;
    if (createState.open) return false;

    Object.assign(createState, {
      open: true,
      submitting: false,
      serverError: "",
      pastWarning: "",
      errors: {},
      selectedUser: null,
      /* La misma clave para todos los intentos de ESTA alta: un doble clic o
         un reintento tras un timeout no crean dos citas. */
      idempotencyKey: newIdempotencyKey(),
      opener,
      form: { userId: "", fechaLocal, horaLocal: "", lugar: "", nota: "", confirmarPasado: false },
      userSearch: { query: "", results: [], loading: false, error: "", empty: false },
    });

    const node = createHost.ensure();
    if (!node) {
      createState.open = false;
      return false;
    }

    paintCreate({ force: true });

    createLifecycle = createModalLifecycle({
      getPanel: () => node.querySelector('[data-agenda-create-modal-panel="true"]'),
      onEscape: () => { void requestCreateClose(); },
      onBackdrop: () => { void requestCreateClose(); },
      onDetached: () => closeCreate({ silent: true }),
      bodyClasses: ["agenda-create-open"],
    });

    createLifecycle.activate({ opener });

    /* El combobox se instala con el diálogo y se retira con él. */
    uninstallCombobox = installIncidenciasCreateUserCombobox({ document: host.ownerDocument });

    const input = node.querySelector('[data-create-user-search-input="true"]');
    if (input) restoreModalFocus(input);
    return true;
  }

  function closeCreate({ silent = false } = {}) {
    if (!createState.open) return false;

    const opener = createState.opener;
    createState.open = false;
    createState.submitting = false;

    uninstallCombobox?.();
    uninstallCombobox = null;

    createLifecycle?.deactivate({ restoreFocus: false });
    createLifecycle = null;
    createHost.remove();

    if (!silent) restoreModalFocus(opener);
    createState.opener = null;
    return true;
  }

  /* Cerrar con cambios pendientes usa la confirmación compartida. */
  async function requestCreateClose() {
    if (!createState.open) return false;
    if (createState.submitting) return false;

    if (!createHasDraft()) return closeCreate();

    const accepted = await openModalConfirmation({
      host: { id: EXIT_CONFIRM_HOST_ID, attributes: { "data-agenda-exit-confirm-root": "true" } },
      render: (root) => {
        root.innerHTML = renderModalShell({
          rootAttributes: { "data-agenda-exit-confirm": "true" },
          panelAttributes: { "data-agenda-exit-confirm-dialog": "true" },
          role: "alertdialog",
          labelledBy: "agenda-exit-confirm-title",
          describedBy: "agenda-exit-confirm-description",
          size: "confirm",
          height: "auto",
          header: `<div class="inc-create-header-copy"><h3 id="agenda-exit-confirm-title">¿Descartar la cita?</h3></div>`,
          bodyClass: "inc-create-body",
          body: `<p id="agenda-exit-confirm-description">Has empezado a rellenar el formulario. Si cierras ahora se perderá lo que has escrito y no se creará ninguna cita.</p>`,
          footer: `
            <button type="button" class="agenda-create-cancel" data-agenda-exit-action="cancel">Seguir editando</button>
            <button type="button" class="agenda-detail-danger" data-agenda-exit-action="confirm">Descartar</button>`,
        });
        return {
          panel: root.querySelector('[data-agenda-exit-confirm-dialog="true"]'),
          cancel: root.querySelector('[data-agenda-exit-action="cancel"]'),
          confirm: root.querySelector('[data-agenda-exit-action="confirm"]'),
        };
      },
      opener: host.ownerDocument.activeElement,
      bodyClasses: ["agenda-exit-confirm-open"],
    });

    if (!accepted) return false;
    return closeCreate();
  }

  function readCreateForm() {
    const node = createHost.get();
    if (!node) return;
    const form = node.querySelector(`#${AGENDA_CREATE_FORM_ID}`);
    if (!form) return;

    createState.form.horaLocal = cleanText(form.querySelector('[data-field="horaLocal"]')?.value, "");
    createState.form.lugar = cleanText(form.querySelector('[data-field="lugar"]')?.value, "");
    createState.form.nota = String(form.querySelector('[data-field="nota"]')?.value ?? "");
  }

  /*
    El estado sigue al formulario mientras se escribe, pero NO se repinta en
    cada pulsación: sólo se recalcula si la acción principal puede
    habilitarse. Repintar por cada tecla sería innecesario aunque el
    renderizador compartido conserve foco y selección.
  */
  function syncCreateSubmitState() {
    const node = createHost.get();
    if (!node) return false;

    const button = node.querySelector("#agenda-create-submit-btn");
    if (!button) return false;

    const complete = Boolean(
      createState.form.userId &&
      isDateKey(createState.form.fechaLocal) &&
      cleanText(createState.form.horaLocal, "") &&
      cleanText(createState.form.lugar, "")
    );
    const blocked = createState.submitting || !complete;

    button.disabled = blocked;
    if (blocked) button.setAttribute("aria-disabled", "true");
    else button.removeAttribute("aria-disabled");
    return true;
  }

  function validateCreate() {
    const errors = {};
    const form = createState.form;

    if (!form.userId) errors.userId = "Elige el usuario de la cita.";
    if (!isTimeKey(form.horaLocal)) errors.horaLocal = "Indica la hora de inicio.";
    if (!cleanText(form.lugar, "")) errors.lugar = "Indica el lugar de la cita.";
    if (!isDateKey(form.fechaLocal)) errors.fechaLocal = "El día seleccionado no es válido.";

    createState.errors = errors;
    return Object.keys(errors).length === 0;
  }

  async function submitCreate() {
    /* `disabled` no es la única protección: el manejador vuelve a validar y
       una petición en curso bloquea la siguiente. */
    if (!createState.open || createState.submitting || submitInFlight) return false;

    readCreateForm();

    if (!validateCreate()) {
      paintCreate();
      return false;
    }

    createState.submitting = true;
    createState.serverError = "";
    paintCreate();

    const payload = {
      userId: createState.form.userId,
      fechaLocal: createState.form.fechaLocal,
      horaLocal: createState.form.horaLocal,
      lugar: createState.form.lugar,
      ...(cleanText(createState.form.nota, "") ? { nota: createState.form.nota } : {}),
      ...(createState.form.confirmarPasado ? { confirmarPasado: true } : {}),
    };

    submitInFlight = createCita(payload, { idempotencyKey: createState.idempotencyKey });

    try {
      const { cita } = await submitInFlight;
      if (destroyed) return false;

      /* Éxito sólo después de confirmar la persistencia. */
      closeCreate();
      state.selected = dateFromKey(cita.fechaLocal) || state.selected;
      await loadVisibleRange({ force: true });
      focusCita(cita.id);
      return true;
    } catch (error) {
      if (destroyed) return false;

      createState.submitting = false;

      if (cleanText(error?.code || error?.data?.code, "") === "CITA_EN_PASADO") {
        /* No se mueve la fecha: se avisa y se pide confirmación explícita. */
        createState.pastWarning = agendaErrorMessage(error, "Ese momento ya ha pasado.");
        createState.form.confirmarPasado = true;
      } else {
        /* El borrador se conserva: el administrador corrige y reintenta. */
        createState.serverError = agendaErrorMessage(error, "No se ha podido crear la cita.");
      }

      paintCreate();
      return false;
    } finally {
      submitInFlight = null;
    }
  }

  function focusCita(citaId = "") {
      const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(citaId)
      : String(citaId).replace(/["\\]/g, "\\$&");
    const target = host.querySelector(`[data-agenda-cita="${escaped}"]`);
    if (target) restoreModalFocus(target);
  }

  /* -------------------------------------------------------
     BÚSQUEDA DE USUARIO
  ------------------------------------------------------- */

  function scheduleUserSearch(query) {
    createState.userSearch.query = query;

    if (searchTimer) {
      host.ownerDocument.defaultView?.clearTimeout(searchTimer);
      searchTimer = 0;
    }

    if (cleanText(query, "").length < USERS_SEARCH_MIN_LENGTH) {
      createState.userSearch = { query, results: [], loading: false, error: "", empty: false };
      paintCreate();
      return;
    }

    createState.userSearch.loading = true;
    createState.userSearch.error = "";
    paintCreate();

    searchTimer = host.ownerDocument.defaultView?.setTimeout(async () => {
      const seq = ++searchSeq;
      try {
        const results = await searchAgendaUsers(query);
        /* Una respuesta tardía no puede sustituir la búsqueda vigente. */
        if (destroyed || seq !== searchSeq || !createState.open) return;
        createState.userSearch = {
          query,
          results,
          loading: false,
          error: "",
          empty: results.length === 0,
        };
      } catch (error) {
        if (destroyed || seq !== searchSeq || !createState.open) return;
        if (error?.name === "AbortError") return;
        createState.userSearch = {
          query,
          results: [],
          loading: false,
          error: agendaErrorMessage(error, "No se ha podido buscar usuarios."),
          empty: false,
        };
      }
      paintCreate();
    }, SEARCH_DEBOUNCE_MS);
  }

  function selectUser(button) {
    /* Selección por identificador estable, nunca por el texto escrito. */
    const userId = cleanText(button?.dataset?.userId, "");
    if (!userId) return;

    createState.selectedUser = {
      userId,
      nombre: cleanText(button.dataset.userName, ""),
      email: cleanText(button.dataset.userEmail, ""),
      telefono: cleanText(button.dataset.userPhone, ""),
      avatarUrl: cleanText(button.dataset.userAvatar, ""),
    };
    createState.form.userId = userId;
    createState.errors.userId = "";
    createState.userSearch = { query: "", results: [], loading: false, error: "", empty: false };
    AgendaApi.abortAgendaUserSearch();
    paintCreate();
    syncCreateSubmitState();
  }

  function clearUser() {
    createState.selectedUser = null;
    createState.form.userId = "";
    paintCreate();
  }

  /* -------------------------------------------------------
     DETALLE
  ------------------------------------------------------- */

  function paintDetail({ force = false } = {}) {
    const node = detailHost.get();
    if (!node) return null;
    return renderModalContent(
      node,
      renderAgendaDetailModal({ ...detailState, admin: state.admin }),
      { forceMount: force, identityAttribute: "data-cita-id" }
    );
  }

  async function openDetail(citaId = "", { userHint = "", opener = null } = {}) {
    const id = cleanText(citaId, "");
    if (!id) return false;

    if (detailState.open && detailState.citaId === id) return true;
    if (detailState.open) closeDetail({ silent: true });

    Object.assign(detailState, {
      open: true,
      loading: true,
      saving: false,
      editing: false,
      cancelling: false,
      error: "",
      errors: {},
      cita: null,
      citaId: id,
      userHint: cleanText(userHint, ""),
      opener,
      form: { fechaLocal: "", horaLocal: "", lugar: "", nota: "", motivo: "" },
    });

    const node = detailHost.ensure();
    if (!node) {
      detailState.open = false;
      return false;
    }

    paintDetail({ force: true });

    detailLifecycle = createModalLifecycle({
      getPanel: () => node.querySelector('[data-agenda-detail-modal-panel="true"]'),
      onEscape: () => { if (!detailState.saving) closeDetail(); },
      onBackdrop: () => { if (!detailState.saving) closeDetail(); },
      onDetached: () => closeDetail({ silent: true }),
      bodyClasses: ["agenda-detail-open"],
    });

    detailLifecycle.activate({ opener });

    await refreshDetail();
    return true;
  }

  async function refreshDetail() {
    if (!detailState.open) return false;

    detailState.loading = true;
    detailState.error = "";
    paintDetail();

    try {
      const cita = await loadCitaDetail(detailState.citaId, { userId: detailState.userHint });
      if (destroyed || !detailState.open) return false;
      detailState.cita = cita;
      detailState.form = {
        fechaLocal: cita.fechaLocal,
        horaLocal: cita.horaLocal,
        lugar: cita.lugar,
        nota: cita.nota,
        motivo: "",
      };
      return true;
    } catch (error) {
      if (destroyed || !detailState.open) return false;
      detailState.cita = null;
      detailState.error = agendaErrorMessage(error, "No se ha podido abrir la cita.");
      return false;
    } finally {
      if (!destroyed && detailState.open) {
        detailState.loading = false;
        paintDetail();
      }
    }
  }

  function closeDetail({ silent = false } = {}) {
    if (!detailState.open) return false;

    const opener = detailState.opener;
    detailState.open = false;
    detailState.saving = false;

    detailLifecycle?.deactivate({ restoreFocus: false });
    detailLifecycle = null;
    detailHost.remove();

    if (!silent) restoreModalFocus(opener);
    detailState.opener = null;
    return true;
  }

  function readDetailForm() {
    const node = detailHost.get();
    if (!node) return;

    const fecha = node.querySelector('[data-field="fechaLocal"]');
    const hora = node.querySelector('[data-field="horaLocal"]');
    const lugar = node.querySelector('[data-field="lugar"]');
    const nota = node.querySelector('[data-field="nota"]');
    const motivo = node.querySelector('[data-field="motivo"]');

    if (fecha) detailState.form.fechaLocal = cleanText(fecha.value, "");
    if (hora) detailState.form.horaLocal = cleanText(hora.value, "");
    if (lugar) detailState.form.lugar = cleanText(lugar.value, "");
    if (nota) detailState.form.nota = String(nota.value ?? "");
    if (motivo) detailState.form.motivo = String(motivo.value ?? "");
  }

  async function saveDetail() {
    if (!detailState.open || detailState.saving || !detailState.cita) return false;

    readDetailForm();

    const errors = {};
    if (!isDateKey(detailState.form.fechaLocal)) errors.fechaLocal = "Indica una fecha válida.";
    if (!isTimeKey(detailState.form.horaLocal)) errors.horaLocal = "Indica la hora de inicio.";
    if (!cleanText(detailState.form.lugar, "")) errors.lugar = "Indica el lugar de la cita.";
    detailState.errors = errors;

    if (Object.keys(errors).length) {
      paintDetail();
      return false;
    }

    detailState.saving = true;
    detailState.error = "";
    paintDetail();

    try {
      const { cita } = await AgendaApi.updateCita(
        detailState.citaId,
        {
          fechaLocal: detailState.form.fechaLocal,
          horaLocal: detailState.form.horaLocal,
          lugar: detailState.form.lugar,
          nota: detailState.form.nota,
        },
        { etag: detailState.cita.etag, userId: detailState.cita.userId || detailState.userHint }
      );

      if (destroyed) return false;
      detailState.cita = cita;
      detailState.editing = false;
      detailState.form = {
        fechaLocal: cita.fechaLocal,
        horaLocal: cita.horaLocal,
        lugar: cita.lugar,
        nota: cita.nota,
        motivo: "",
      };
      await loadVisibleRange({ force: true });
      return true;
    } catch (error) {
      if (destroyed) return false;
      detailState.error = agendaErrorMessage(error, "No se han podido guardar los cambios.");
      return false;
    } finally {
      if (!destroyed) {
        detailState.saving = false;
        paintDetail();
      }
    }
  }

  async function confirmCancelCita() {
    if (!detailState.open || detailState.saving || !detailState.cita) return false;

    readDetailForm();
    detailState.saving = true;
    detailState.error = "";
    paintDetail();

    try {
      const cita = await cancelCita(
        detailState.citaId,
        cleanText(detailState.form.motivo, "") ? { motivo: detailState.form.motivo } : {},
        { etag: detailState.cita.etag, userId: detailState.cita.userId || detailState.userHint }
      );

      if (destroyed) return false;
      detailState.cita = cita;
      detailState.cancelling = false;
      detailState.editing = false;
      await loadVisibleRange({ force: true });
      return true;
    } catch (error) {
      if (destroyed) return false;
      detailState.error = agendaErrorMessage(error, "No se ha podido cancelar la cita.");
      return false;
    } finally {
      if (!destroyed) {
        detailState.saving = false;
        paintDetail();
      }
    }
  }

  /* -------------------------------------------------------
     EVENTOS
  ------------------------------------------------------- */

  function shiftMonth(delta) {
    state.visible = new Date(state.visible.getFullYear(), state.visible.getMonth() + delta, 1);
    refreshCalendarParts();
    void loadVisibleRange();
  }

  function selectDate(key) {
    const selected = dateFromKey(key);
    if (!selected) return;

    state.selected = selected;

    const monthChanged =
      selected.getFullYear() !== state.visible.getFullYear() ||
      selected.getMonth() !== state.visible.getMonth();

    if (monthChanged) {
      state.visible = new Date(selected.getFullYear(), selected.getMonth(), 1);
    }

    refreshCalendarParts();
    if (monthChanged) void loadVisibleRange();
  }

  function onViewClick(event) {
    const target = event.target?.closest?.("[data-agenda-action]");
    if (!target || destroyed || !host.contains(target)) return;

    const action = target.dataset.agendaAction || "";

    if (action === "prev-month") return shiftMonth(-1);
    if (action === "next-month") return shiftMonth(1);

    if (action === "today") {
      state.today = localToday();
      state.selected = state.today;
      state.visible = new Date(state.today.getFullYear(), state.today.getMonth(), 1);
      refreshCalendarParts();
      void loadVisibleRange();
      return;
    }

    if (action === "select-date") return selectDate(target.dataset.agendaDate || "");

    if (action === "create-cita") {
      /* Pulsar «+» abre el alta con la fecha REAL de esa casilla. */
      const key = target.dataset.agendaDate || "";
      selectDate(key);
      openCreate(key, target);
      return;
    }

    if (action === "open-cita") {
      void openDetail(target.dataset.agendaCita || "", {
        userHint: target.dataset.agendaCitaUser || "",
        opener: target,
      });
    }
  }

  function onModalClick(event) {
    const node = event.target;
    if (!node?.closest) return;

    const createAction = node.closest("[data-create-action]");
    if (createAction && createHost.get()?.contains(createAction)) {
      const action = createAction.dataset.createAction;
      if (action === AGENDA_CREATE_ACTIONS.CLOSE || action === AGENDA_CREATE_ACTIONS.CANCEL) {
        event.preventDefault();
        void requestCreateClose();
        return;
      }
      if (action === AGENDA_CREATE_ACTIONS.USER_SELECT) {
        event.preventDefault();
        selectUser(createAction);
        return;
      }
      if (action === AGENDA_CREATE_ACTIONS.USER_CLEAR) {
        event.preventDefault();
        clearUser();
        return;
      }
    }

    const detailAction = node.closest("[data-detail-action]");
    if (detailAction && detailHost.get()?.contains(detailAction)) {
      const action = detailAction.dataset.detailAction;

      /* Guardar es el envío del formulario: su camino es `submit`, no el
         clic. Cancelar aquí el evento impediría que el formulario se
         enviara nunca. */
      if (action === AGENDA_DETAIL_ACTIONS.SAVE) return;

      event.preventDefault();

      if (action === AGENDA_DETAIL_ACTIONS.CLOSE) return void closeDetail();
      if (action === AGENDA_DETAIL_ACTIONS.RETRY) return void refreshDetail();

      if (action === AGENDA_DETAIL_ACTIONS.EDIT) {
        detailState.editing = true;
        detailState.errors = {};
        paintDetail();
        return;
      }

      if (action === AGENDA_DETAIL_ACTIONS.EDIT_CANCEL) {
        detailState.editing = false;
        detailState.errors = {};
        if (detailState.cita) {
          detailState.form = {
            fechaLocal: detailState.cita.fechaLocal,
            horaLocal: detailState.cita.horaLocal,
            lugar: detailState.cita.lugar,
            nota: detailState.cita.nota,
            motivo: "",
          };
        }
        paintDetail();
        return;
      }

      if (action === AGENDA_DETAIL_ACTIONS.CANCEL_CITA) {
        detailState.cancelling = true;
        paintDetail();
        return;
      }

      if (action === AGENDA_DETAIL_ACTIONS.CANCEL_DISMISS) {
        readDetailForm();
        detailState.cancelling = false;
        paintDetail();
        return;
      }

      if (action === AGENDA_DETAIL_ACTIONS.CANCEL_CONFIRM) return void confirmCancelCita();
    }
  }

  function onModalSubmit(event) {
    const form = event.target;
    if (!form?.matches) return;

    if (form.matches('[data-agenda-create-form="true"]')) {
      event.preventDefault();
      void submitCreate();
      return;
    }

    if (form.matches('[data-agenda-detail-form="true"]')) {
      event.preventDefault();
      void saveDetail();
    }
  }

  function onModalInput(event) {
    const node = event.target;
    if (!node?.matches) return;

    const createNode = createHost.get();
    if (!createNode?.contains(node)) return;

    if (node.matches('[data-create-user-search-input="true"]')) {
      scheduleUserSearch(node.value || "");
      return;
    }

    const field = node.dataset?.field || "";
    if (field === "horaLocal" || field === "lugar" || field === "nota") {
      createState.form[field] = field === "nota" ? String(node.value ?? "") : cleanText(node.value, "");
      syncCreateSubmitState();
    }
  }

  /* -------------------------------------------------------
     CICLO DE VIDA
  ------------------------------------------------------- */

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    const view = host.ownerDocument?.defaultView;
    if (searchTimer) view?.clearTimeout(searchTimer);
    searchTimer = 0;

    rangeRequest?.abort?.();
    rangeRequest = null;
    AgendaApi.abortAgendaUserSearch();

    closeCreate({ silent: true });
    closeDetail({ silent: true });
    invalidateAgendaCache();

    host.removeEventListener("click", onViewClick);
    host.ownerDocument.removeEventListener("click", onModalClick, true);
    host.ownerDocument.removeEventListener("submit", onModalSubmit, true);
    host.ownerDocument.removeEventListener("input", onModalInput, true);
    host.removeAttribute("data-agenda-host");
  }

  /* -------------------------------------------------------
     INTENCIÓN DE ENLACE (?citaId=)
  ------------------------------------------------------- */

  function citaIdFromLocation() {
    try {
      const url = new URL(host.ownerDocument.defaultView.location.href);
      return cleanText(url.searchParams.get("citaId") || url.searchParams.get("cita"), "");
    } catch {
      return "";
    }
  }

  /* -------------------------------------------------------
     ARRANQUE
  ------------------------------------------------------- */

  setAgendaIdentity(cleanText(context?.userId || context?.user?.userId, ""));
  render();

  host.addEventListener("click", onViewClick);
  host.ownerDocument.addEventListener("click", onModalClick, true);
  host.ownerDocument.addEventListener("submit", onModalSubmit, true);
  host.ownerDocument.addEventListener("input", onModalInput, true);

  const parentSignal = context?.signal;
  if (parentSignal && typeof parentSignal.addEventListener === "function") {
    parentSignal.addEventListener("abort", destroy, { once: true });
  }

  void (async () => {
    await loadVisibleRange();
    if (destroyed) return;

    const deepLinkId = citaIdFromLocation();
    if (deepLinkId) {
      const known = state.citas.find((cita) => cita.id === deepLinkId);
      if (known) {
        state.selected = dateFromKey(known.fechaLocal) || state.selected;
        refreshCalendarParts();
      }
      await openDetail(deepLinkId, { userHint: known?.userId || "" });
    }
  })();

  return Object.freeze({
    version: AGENDA_VIEW_VERSION,
    destroy,
    getSnapshot: () =>
      Object.freeze({
        version: AGENDA_VIEW_VERSION,
        visible: dateKey(state.visible),
        selected: dateKey(state.selected),
        citas: state.citas.length,
        canCreate: state.canCreate,
        truncated: state.truncated,
        createOpen: createState.open,
        detailOpen: detailState.open,
      }),
    openCita: (citaId, options) => openDetail(citaId, options),
  });
}

export function AgendaView(host = null, context = {}) {
  if (!isBrowser() || !isDomNode(host)) return null;
  if (context?.signal?.aborted === true) return null;

  host.dataset.view = "agenda";
  host.dataset.agendaHost = "true";
  host.dataset.agendaViewVersion = AGENDA_VIEW_VERSION;

  return createController(host, context && typeof context === "object" ? context : {});
}

export { AGENDA_VIEW_VERSION };
export default AgendaView;
