/* =========================================================
   Onion Support - Agenda · Crear cita
   Archivo: /src/views/agenda/agenda.template.create.js

   Contenido del alta, NO infraestructura.

   El shell, el portal, el lifecycle, el pie estructural, el botón de cerrar
   y los estados los pone `features/entity-overlay/modal-host.js`. Este
   módulo sólo entrega contenido, campos, acciones y textos, con la misma
   composición de altas que Incidencias, Facturas, Clientes y Usuarios
   (`css/compositions/private-create-modal.css`, clases `inc-create-*`).

   No emite el rol de diálogo, ni backdrop, ni cierre, ni bloqueo de scroll:
   esas piezas son del shell y sólo del shell.
========================================================= */

import {
  renderModalShell,
  renderModalCloseButton,
} from "../../features/entity-overlay/modal-host.js";

import { escapeHtml } from "../../core/escape-html.js";
import { cleanText } from "../../core/presentation-text.js";

import {
  AGENDA_TIME_ZONE,
  browserZone,
  browserZoneDiffers,
  longDateLabelFromKey,
} from "./agenda.dates.js";

export const AGENDA_CREATE_TEMPLATE_VERSION = "agenda.create-modal.v1";

const AGENDA_CREATE_MODAL_ID = "agenda-create-modal";
const AGENDA_CREATE_PANEL_ID = "agenda-create-modal-panel";
export const AGENDA_CREATE_FORM_ID = "agenda-create-form";

export const AGENDA_CREATE_ACTIONS = Object.freeze({
  CLOSE: "create-close",
  CANCEL: "create-cancel",
  SUBMIT: "create-submit",
  USER_SELECT: "create-user-select",
  USER_CLEAR: "create-user-clear",
});

const ASUNTO = "Cita de soporte";

function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

function disabledAttrs(disabled = false) {
  return disabled ? 'disabled aria-disabled="true"' : "";
}

function icon(name = "search") {
  const paths = {
    search: `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`,
    calendar: `<rect x="3.5" y="4.5" width="17" height="16" rx="2.25"/><path d="M7.5 2.75v3.5M16.5 2.75v3.5M3.5 9h17"/>`,
    clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.75"/>`,
    place: `<path d="M12 21s6.5-5.4 6.5-10a6.5 6.5 0 1 0-13 0c0 4.6 6.5 10 6.5 10Z"/><circle cx="12" cy="11" r="2.4"/>`,
  };

  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.search}</svg>`;
}

function renderHidden(name, value) {
  return `<input type="hidden" name="${attr(name)}" value="${attr(value)}">`;
}

function renderFieldError(message = "") {
  const text = cleanText(message, "");
  if (!text) return "";
  return `<span class="inc-create-field-error" role="alert">${escapeHtml(text)}</span>`;
}

function renderAlert(kind, title, message) {
  const text = cleanText(message, "");
  if (!text) return "";
  return `
    <div class="inc-create-alert is-${attr(kind)}" role="${kind === "error" ? "alert" : "status"}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>`;
}

/* =========================================================
   SELECCIÓN DE USUARIO
========================================================= */

function renderUserAvatar(user = {}) {
  const initials = cleanText(user.nombre, "?").slice(0, 1).toLocaleUpperCase("es-ES");

  if (user.avatarUrl) {
    return `<span class="agenda-create-user-avatar inc-create-user-avatar avatar-host" data-avatar-host="true" data-avatar-user-id="${attr(user.userId)}">
      <img src="${attr(user.avatarUrl)}" alt="" loading="lazy" decoding="async">
    </span>`;
  }

  return `<span class="agenda-create-user-avatar inc-create-user-avatar avatar-host is-fallback" data-avatar-host="true" data-avatar-user-id="${attr(user.userId)}" aria-hidden="true">${escapeHtml(initials)}</span>`;
}

function userSubtitle(user = {}) {
  return [
    user.userId || "Sin ID",
    user.email || "Sin correo",
    user.telefono || "Sin teléfono",
  ].join(" · ");
}

function renderSelectedUser(vm = {}) {
  const user = vm.selectedUser;
  if (!user?.userId) return "";

  return `
    <div class="agenda-create-selected-user inc-create-selected-user" data-create-selected-user="true">
      <div class="agenda-create-selected-user-main inc-create-selected-user-main">
        ${renderUserAvatar(user)}
        <span class="agenda-create-user-copy inc-create-selected-user-copy">
          <strong>${escapeHtml(user.nombre || "Usuario seleccionado")}</strong>
          <span>${escapeHtml(userSubtitle(user))}</span>
        </span>
      </div>
      <button type="button" class="agenda-create-user-clear inc-create-selected-user-clear" data-create-action="${AGENDA_CREATE_ACTIONS.USER_CLEAR}" ${disabledAttrs(vm.submitting)}>Quitar</button>
    </div>`;
}

function renderUserSearchResults(vm = {}) {
  const search = vm.userSearch;

  if (search.loading) {
    return `<div class="agenda-create-user-state inc-create-user-search-state" data-user-search-state="loading" aria-live="polite"><span class="inc-create-spinner" aria-hidden="true"></span><span>Buscando usuarios...</span></div>`;
  }

  if (search.error) {
    return `<div class="agenda-create-user-state is-error inc-create-user-search-state" data-user-search-state="error" role="alert">${escapeHtml(search.error)}</div>`;
  }

  if (search.empty) {
    return `<div class="agenda-create-user-state inc-create-user-search-state" data-user-search-state="empty" aria-live="polite">No hay usuarios para esta búsqueda.</div>`;
  }

  if (!search.results.length) return "";

  return `
    <div class="agenda-create-user-results inc-create-user-results" role="listbox" data-create-user-results="true" aria-label="Resultados de búsqueda de usuarios">
      ${search.results.map((user) => `
        <button
          type="button"
          class="agenda-create-user-result inc-create-user-result"
          role="option"
          data-create-action="${AGENDA_CREATE_ACTIONS.USER_SELECT}"
          data-user-id="${attr(user.userId)}"
          data-user-name="${attr(user.nombre)}"
          data-user-email="${attr(user.email)}"
          data-user-phone="${attr(user.telefono)}"
          data-user-avatar="${attr(user.avatarUrl)}"
          ${disabledAttrs(vm.submitting)}
        >
          ${renderUserAvatar(user)}
          <span class="agenda-create-user-copy inc-create-user-result-copy">
            <strong>${escapeHtml(user.nombre)}</strong>
            <span>${escapeHtml(userSubtitle(user))}</span>
          </span>
        </button>`).join("")}
    </div>`;
}

function renderUserBlock(vm = {}) {
  return `
    <section class="inc-create-block inc-create-block--target" data-create-admin-user-search="true">
      <div class="inc-create-block-head">
        <div>
          <span>Usuario</span>
          <strong>Crear cita para</strong>
        </div>
        <small>Busca y selecciona el usuario que debe acudir.</small>
      </div>

      <div class="inc-create-selected-user-slot" data-create-selected-user-slot="true">${renderSelectedUser(vm)}</div>

      <label class="inc-create-field" data-create-field="userSearch">
        <span class="inc-create-label">Buscar usuario</span>
        <span class="inc-create-search-control">
          <span class="inc-create-search-icon" aria-hidden="true">${icon("search")}</span>
          <input
            class="inc-create-input inc-create-input--with-icon inc-create-user-search-input"
            data-field="userSearch"
            data-create-user-search-input="true"
            name="userSearch"
            type="search"
            value="${attr(vm.userSearch.query)}"
            placeholder="Nombre, ID, correo o teléfono"
            autocomplete="off"
            spellcheck="false"
            ${disabledAttrs(vm.submitting)}
          >
        </span>
      </label>

      ${renderHidden("userId", vm.form.userId)}

      <div class="inc-create-user-search-slot" data-create-user-search-slot="true">${renderUserSearchResults(vm)}</div>
      <div class="inc-create-target-error-slot">${renderFieldError(vm.errors.userId)}</div>
    </section>`;
}

/* =========================================================
   CUÁNDO Y DÓNDE
========================================================= */

function renderWhenBlock(vm = {}) {
  const zoneNote = browserZoneDiffers(vm.zona)
    ? `<small class="inc-create-hint">La hora es de ${escapeHtml(vm.zona)}. Tu navegador está en ${escapeHtml(browserZone())}.</small>`
    : `<small class="inc-create-hint">Hora de ${escapeHtml(vm.zona)}.</small>`;

  return `
    <section class="inc-create-block">
      <div class="inc-create-block-head">
        <div>
          <span>Cuándo</span>
          <strong>Hora de inicio</strong>
        </div>
        <small>La fecha es el día que has seleccionado en el calendario.</small>
      </div>

      <div class="inc-create-grid inc-create-grid--2">
        <div class="inc-create-field" data-create-field="fechaLocal">
          <span class="inc-create-label">Fecha</span>
          <p class="agenda-create-fixed-date" data-agenda-create-date-text="true">
            <span class="agenda-create-fixed-date-icon" aria-hidden="true">${icon("calendar")}</span>
            <span>${escapeHtml(vm.fechaLarga)}</span>
          </p>
          ${renderHidden("fechaLocal", vm.form.fechaLocal)}
        </div>

        <label class="inc-create-field" data-create-field="horaLocal">
          <span class="inc-create-label">Hora de inicio <span class="inc-create-required" aria-hidden="true">*</span></span>
          <span class="inc-create-search-control">
            <span class="inc-create-search-icon" aria-hidden="true">${icon("clock")}</span>
            <input
              class="inc-create-input inc-create-input--with-icon"
              data-field="horaLocal"
              name="horaLocal"
              type="time"
              step="300"
              required
              value="${attr(vm.form.horaLocal)}"
              ${disabledAttrs(vm.submitting)}
            >
          </span>
          ${zoneNote}
          ${renderFieldError(vm.errors.horaLocal)}
        </label>
      </div>
    </section>`;
}

function renderWhereBlock(vm = {}) {
  return `
    <section class="inc-create-block">
      <div class="inc-create-block-head">
        <div>
          <span>Dónde</span>
          <strong>Lugar de la cita</strong>
        </div>
        <small>Dirección, oficina, atención telefónica o el lugar que indiques.</small>
      </div>

      <label class="inc-create-field" data-create-field="lugar">
        <span class="inc-create-label">Lugar <span class="inc-create-required" aria-hidden="true">*</span></span>
        <span class="inc-create-search-control">
          <span class="inc-create-search-icon" aria-hidden="true">${icon("place")}</span>
          <input
            class="inc-create-input inc-create-input--with-icon"
            data-field="lugar"
            name="lugar"
            type="text"
            maxlength="200"
            required
            value="${attr(vm.form.lugar)}"
            placeholder="Ej. Oficina de Sant Vicenç, atención telefónica..."
            ${disabledAttrs(vm.submitting)}
          >
        </span>
        ${renderFieldError(vm.errors.lugar)}
      </label>

      <label class="inc-create-field" data-create-field="nota">
        <span class="inc-create-label">Nota para el usuario</span>
        <textarea
          class="inc-create-textarea"
          data-field="nota"
          name="nota"
          rows="3"
          maxlength="600"
          placeholder="Opcional. Lo que escribas aquí lo verá el usuario en su correo y en su cita."
          ${disabledAttrs(vm.submitting)}
        >${escapeHtml(vm.form.nota)}</textarea>
        <small class="inc-create-hint">Esta nota es visible para el destinatario.</small>
        ${renderFieldError(vm.errors.nota)}
      </label>
    </section>`;
}

/* =========================================================
   VIEW MODEL
========================================================= */

export function buildCreateVm(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const form = source.form && typeof source.form === "object" ? source.form : {};
  const search = source.userSearch && typeof source.userSearch === "object" ? source.userSearch : {};

  const fechaLocal = cleanText(form.fechaLocal, "");

  return {
    open: source.open !== false,
    submitting: source.submitting === true,
    zona: cleanText(source.zona, AGENDA_TIME_ZONE),
    fechaLarga: longDateLabelFromKey(fechaLocal),
    serverError: cleanText(source.serverError, ""),
    pastWarning: cleanText(source.pastWarning, ""),
    errors: source.errors && typeof source.errors === "object" ? source.errors : {},
    selectedUser: source.selectedUser && typeof source.selectedUser === "object" ? source.selectedUser : null,
    form: {
      userId: cleanText(form.userId, ""),
      fechaLocal,
      horaLocal: cleanText(form.horaLocal, ""),
      lugar: cleanText(form.lugar, ""),
      nota: typeof form.nota === "string" ? form.nota : "",
      confirmarPasado: form.confirmarPasado === true,
    },
    userSearch: {
      query: cleanText(search.query, ""),
      results: Array.isArray(search.results) ? search.results : [],
      loading: search.loading === true,
      error: cleanText(search.error, ""),
      empty: search.empty === true,
    },
  };
}

/*
  ¿Están todos los datos obligatorios? El botón principal se deshabilita con
  esto, pero NO es la única protección: el manejador vuelve a validar y el
  backend también.
*/
export function createFormIsComplete(vm = {}) {
  return Boolean(
    cleanText(vm.form?.userId, "") &&
    cleanText(vm.form?.fechaLocal, "") &&
    cleanText(vm.form?.horaLocal, "") &&
    cleanText(vm.form?.lugar, "")
  );
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderAgendaCreateModal(input = {}) {
  const vm = buildCreateVm(input);
  if (!vm.open) return "";

  const complete = createFormIsComplete(vm);
  const blocked = vm.submitting || !complete;

  return renderModalShell({
    id: AGENDA_CREATE_MODAL_ID,
    rootClass: "inc-create-root agenda-create-root is-admin",
    rootAttributes: {
      "data-agenda-create-root": "true",
      /* Marcador compartido del selector de usuario: el mismo combobox
         accesible que sirve al alta de Incidencias se engancha aquí. */
      "data-create-user-picker-root": "true",
      "data-agenda-modal": "create",
    },
    overlayAttributes: { "data-agenda-create-modal-overlay": "true" },
    panelId: AGENDA_CREATE_PANEL_ID,
    panelClass: "is-admin",
    panelAttributes: { "data-agenda-create-modal-panel": "true" },
    labelledBy: "agenda-create-title",
    describedBy: "agenda-create-subtitle",
    size: "form",
    height: "auto",
    submitting: vm.submitting,
    header: `
      <div class="inc-create-header-copy" data-create-title-block="true">
        <h2 id="agenda-create-title">Crear cita</h2>
        <p id="agenda-create-subtitle">Día seleccionado: ${escapeHtml(vm.fechaLarga)}</p>
      </div>
      ${renderModalCloseButton({
        label: "Cerrar",
        attributes: {
          "data-create-action": AGENDA_CREATE_ACTIONS.CLOSE,
          disabled: Boolean(vm.submitting),
          "aria-disabled": vm.submitting ? "true" : false,
          "aria-busy": vm.submitting ? "true" : false,
        },
      })}
    `,
    bodyClass: "inc-create-body",
    body: `
      ${vm.serverError ? renderAlert("error", "No se ha podido crear la cita.", vm.serverError) : ""}
      ${vm.pastWarning ? renderAlert("warning", "La fecha y hora ya han pasado.", vm.pastWarning) : ""}

      <form id="${AGENDA_CREATE_FORM_ID}" data-agenda-create-form="true" novalidate class="inc-create-form is-admin">
        ${renderHidden("asunto", ASUNTO)}
        ${vm.form.confirmarPasado ? renderHidden("confirmarPasado", "true") : ""}
        ${renderUserBlock(vm)}
        ${renderWhenBlock(vm)}
        ${renderWhereBlock(vm)}
      </form>
    `,
    footer: `
      <div class="agenda-create-actions inc-create-actions">
        <span class="inc-create-actions-note">${vm.pastWarning
          ? "Ese momento ya ha pasado. Cambia la hora o confirma que quieres registrarla igualmente."
          : "El usuario recibirá la cita por correo y la verá en su cuenta."}</span>
        <span class="agenda-create-actions-group">
          <button
            type="button"
            class="agenda-create-cancel"
            data-create-action="${AGENDA_CREATE_ACTIONS.CANCEL}"
            ${disabledAttrs(vm.submitting)}
          >Cancelar</button>
          <button
            id="agenda-create-submit-btn"
            type="submit"
            form="${AGENDA_CREATE_FORM_ID}"
            data-create-action="${AGENDA_CREATE_ACTIONS.SUBMIT}"
            class="inc-create-submit"
            ${disabledAttrs(blocked)}
          >
            ${vm.submitting
              ? `<span class="inc-create-spinner" aria-hidden="true"></span><span>Creando...</span>`
              : `<span>${vm.pastWarning ? "Crear cita igualmente" : "Crear cita"}</span>`}
          </button>
        </span>
      </div>
    `,
  });
}

export default renderAgendaCreateModal;
