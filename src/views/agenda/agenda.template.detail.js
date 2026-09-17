/* =========================================================
   Onion Support - Agenda · Detalle de cita
   Archivo: /src/views/agenda/agenda.template.detail.js

   Contenido del detalle, NO infraestructura: el shell, el portal, el
   lifecycle y el pie los pone `features/entity-overlay/modal-host.js`.

   Lo que ve cada rol lo decide el backend en su proyección; aquí sólo se
   pinta lo que ha llegado. Las acciones administrativas no aparecen como
   disponibles para el usuario porque el backend no envía ni su versión ni
   el estado de la notificación.
========================================================= */

import {
  renderModalShell,
  renderModalCloseButton,
  renderModalState,
} from "../../features/entity-overlay/modal-host.js";

import { escapeHtml } from "../../core/escape-html.js";
import { cleanText } from "../../core/presentation-text.js";

import {
  AGENDA_TIME_ZONE,
  browserZone,
  browserZoneDiffers,
  longDateLabelFromKey,
  timeWithZoneLabel,
} from "./agenda.dates.js";

export const AGENDA_DETAIL_TEMPLATE_VERSION = "agenda.detail-modal.v1";

const AGENDA_DETAIL_MODAL_ID = "agenda-detail-modal";
const AGENDA_DETAIL_PANEL_ID = "agenda-detail-modal-panel";
const AGENDA_DETAIL_FORM_ID = "agenda-detail-form";

export const AGENDA_DETAIL_ACTIONS = Object.freeze({
  CLOSE: "detail-close",
  EDIT: "detail-edit",
  EDIT_CANCEL: "detail-edit-cancel",
  SAVE: "detail-save",
  /* Producto la llama «Eliminar cita»; el backend no tiene DELETE y la
     operación real es la cancelación contractual. La confirmación la pone
     `openModalConfirmation`, no una caja propia dentro del cuerpo. */
  DELETE_CITA: "detail-eliminar",
  RETRY: "detail-retry",
});

export const AGENDA_DELETE_CONFIRM_ACTION = "agenda-delete-action";

const STATE_LABEL = Object.freeze({
  programada: "Programada",
  cancelada: "Cancelada",
});

function attr(value = "") {
  return escapeHtml(cleanText(value, ""));
}

function disabledAttrs(disabled = false) {
  return disabled ? 'disabled aria-disabled="true"' : "";
}

export function citaStateLabel(estado = "") {
  return STATE_LABEL[cleanText(estado, "")] || "Estado desconocido";
}

/*
  El estado se pinta con la autoridad visual de estados del sistema
  (`css/components/status-system.css`), que declara las clases de cada
  dominio y sus tonos. Agenda no inventa colores.
*/
export function renderCitaStateBadge(estado = "") {
  const value = cleanText(estado, "");
  return `<span class="agenda-status-chip agenda-status-chip--${attr(value)}" data-status="${attr(value)}">${escapeHtml(citaStateLabel(value))}</span>`;
}

function row(label, value, options = {}) {
  const text = cleanText(value, "");
  if (!text && !options.always) return "";
  return `
    <div class="agenda-detail-row">
      <dt>${escapeHtml(label)}</dt>
      <dd${options.multiline ? ' class="is-multiline"' : ""}>${options.html ? value : escapeHtml(text || "—")}</dd>
    </div>`;
}

function renderNotificationRow(cita = {}) {
  const notificacion = cita.notificacion;
  if (!notificacion?.estado) return "";

  return `
    <div class="agenda-detail-row">
      <dt>Comunicación</dt>
      <dd>
        <span class="agenda-detail-notice" data-notification-state="${attr(notificacion.estado)}">${escapeHtml(notificacion.etiqueta)}</span>
        ${notificacion.intentos > 1 ? `<small>${escapeHtml(String(notificacion.intentos))} intentos</small>` : ""}
      </dd>
    </div>`;
}

/* =========================================================
   LECTURA
========================================================= */

/* Un error DE OPERACIÓN no puede tragarse el cuerpo: si lo sustituye por el
   panel de error, el borrador de la edición desaparece de la vista y el único
   camino de vuelta --«Reintentar»-- lo recarga del servidor. Se pinta en línea,
   sobre lo que el usuario estaba haciendo. El panel completo queda para el
   error de CARGA, que es el único en el que no hay nada que conservar. */
function renderOperationError(vm = {}) {
  if (!vm.error) return "";
  return `
    <div class="inc-create-alert is-error" role="alert" data-detail-error="true">
      <span class="agenda-alert-icon" aria-hidden="true"></span>
      <div class="agenda-alert-copy">
        <p>${escapeHtml(vm.error)}</p>
      </div>
    </div>`;
}

function renderRead(vm = {}) {
  const cita = vm.cita;
  const zoneNote = browserZoneDiffers(cita.zona)
    ? `<small class="agenda-detail-hint">Tu navegador está en ${escapeHtml(browserZone())}; la cita es hora de ${escapeHtml(cita.zona)}.</small>`
    : "";

  return `
    ${renderOperationError(vm)}
    <dl class="agenda-detail-grid">
      ${row("Asunto", cita.asunto, { always: true })}
      ${row("Día", longDateLabelFromKey(cita.fechaLocal), { always: true })}
      ${row("Hora", timeWithZoneLabel(cita.horaLocal, cita.zona), { always: true })}
      ${vm.admin ? row("Usuario", cita.destinatarioNombre || cita.userId, { always: true }) : ""}
      ${row("Lugar", cita.lugar, { always: true })}
      ${cita.nota ? row("Nota", `<span class="agenda-detail-note">${escapeHtml(cita.nota).replace(/\n/g, "<br>")}</span>`, { html: true, multiline: true }) : ""}
      ${row("Estado", renderCitaStateBadge(cita.estado), { html: true, always: true })}
      ${cita.estado === "cancelada" && cita.cancelacion?.motivo ? row("Motivo", cita.cancelacion.motivo, { multiline: true }) : ""}
      ${vm.admin ? renderNotificationRow(cita) : ""}
    </dl>
    ${zoneNote}`;
}

/* =========================================================
   EDICIÓN
========================================================= */

function field(label, name, control, error = "") {
  return `
    <label class="inc-create-field" data-detail-field="${attr(name)}">
      <span class="inc-create-label">${escapeHtml(label)}</span>
      ${control}
      ${error ? `<span class="inc-create-field-error" role="alert">${escapeHtml(error)}</span>` : ""}
    </label>`;
}

function renderEdit(vm = {}) {
  const cita = vm.cita;
  const form = vm.form;

  return `
    ${renderOperationError(vm)}
    ${vm.conflict ? `
      <div class="inc-create-alert is-warning" role="status" data-detail-conflict="true">
        <span class="agenda-alert-icon" aria-hidden="true"></span>
        <div class="agenda-alert-copy">
          <strong>La cita ha cambiado mientras la estabas editando.</strong>
          <p>${escapeHtml(vm.conflict)}</p>
        </div>
      </div>` : ""}
    ${vm.pastWarning ? `
      <div class="inc-create-alert is-warning" role="status">
        <span class="agenda-alert-icon" aria-hidden="true"></span>
        <div class="agenda-alert-copy">
          <strong>La fecha y hora ya han pasado.</strong>
          <p>${escapeHtml(vm.pastWarning)}</p>
        </div>
      </div>` : ""}
    <form id="${AGENDA_DETAIL_FORM_ID}" data-agenda-detail-form="true" novalidate class="inc-create-form is-admin">
      ${form.confirmarPasado ? `<input type="hidden" name="confirmarPasado" value="true">` : ""}
      <div class="inc-create-grid inc-create-grid--2">
        ${field("Fecha", "fechaLocal", `<input class="inc-create-input" data-field="fechaLocal" name="fechaLocal" type="date" required value="${attr(form.fechaLocal)}" ${disabledAttrs(vm.saving)}>`, vm.errors.fechaLocal)}
        ${field("Hora de inicio", "horaLocal", `<input class="inc-create-input" data-field="horaLocal" name="horaLocal" type="time" step="300" required value="${attr(form.horaLocal)}" ${disabledAttrs(vm.saving)}>`, vm.errors.horaLocal)}
      </div>
      ${field("Lugar", "lugar", `<input class="inc-create-input" data-field="lugar" name="lugar" type="text" maxlength="200" required value="${attr(form.lugar)}" ${disabledAttrs(vm.saving)}>`, vm.errors.lugar)}
      ${field("Nota para el usuario", "nota", `<textarea class="inc-create-textarea" data-field="nota" name="nota" rows="3" maxlength="600" ${disabledAttrs(vm.saving)}>${escapeHtml(form.nota)}</textarea>`, vm.errors.nota)}
      <small class="agenda-form-hint">La hora es de ${escapeHtml(cita.zona)}. Cada cambio se comunica al usuario.</small>
    </form>`;
}

/* =========================================================
   VIEW MODEL
========================================================= */

export function buildDetailVm(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const cita = source.cita && typeof source.cita === "object" ? source.cita : null;
  const form = source.form && typeof source.form === "object" ? source.form : {};

  return {
    open: source.open !== false,
    loading: source.loading === true,
    error: cleanText(source.error, ""),
    saving: source.saving === true,
    editing: source.editing === true,
    admin: source.admin === true,
    errors: source.errors && typeof source.errors === "object" ? source.errors : {},
    cita: cita
      ? {
          ...cita,
          zona: cleanText(cita.zona, AGENDA_TIME_ZONE),
        }
      : null,
    form: {
      fechaLocal: cleanText(form.fechaLocal, ""),
      horaLocal: cleanText(form.horaLocal, ""),
      lugar: cleanText(form.lugar, ""),
      nota: typeof form.nota === "string" ? form.nota : "",
      motivo: typeof form.motivo === "string" ? form.motivo : "",
      confirmarPasado: form.confirmarPasado === true,
    },
    pastWarning: cleanText(source.pastWarning, ""),
    conflict: cleanText(source.conflict, ""),
  };
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderAgendaDetailModal(input = {}) {
  const vm = buildDetailVm(input);
  if (!vm.open) return "";

  const cita = vm.cita;
  const activa = Boolean(cita && cita.estado !== "cancelada");
  const puedeGestionar = vm.admin && activa;

  /* Sin cita cargada no hay nada que conservar: ahí sí manda el panel. */
  const errorDeCarga = Boolean(vm.error) && !cita;

  let body = "";
  if (vm.loading) {
    body = renderModalState({ kind: "loading", title: "Cargando la cita", message: "Un momento." });
  } else if (errorDeCarga) {
    body = renderModalState({
      kind: "error",
      title: "No se ha podido abrir la cita",
      message: vm.error,
      /* La API compartida compone el botón a partir de {label, attributes}: una
         cadena HTML aquí se descarta en silencio y el reintento no existe. */
      action: {
        label: "Reintentar",
        attributes: { "data-detail-action": AGENDA_DETAIL_ACTIONS.RETRY },
      },
    });
  } else if (!cita) {
    body = renderModalState({ kind: "empty", title: "No se ha encontrado la cita", message: "" });
  } else {
    body = vm.editing ? renderEdit(vm) : renderRead(vm);
  }

  const footer = !cita || vm.loading || errorDeCarga
    ? ""
    : vm.editing
      ? `
        <div class="agenda-create-actions inc-create-actions">
          <span class="inc-create-actions-note">Se comunicará al usuario lo que cambie.</span>
          <span class="agenda-create-actions-group">
            <button type="button" class="agenda-create-cancel" data-detail-action="${AGENDA_DETAIL_ACTIONS.EDIT_CANCEL}" ${disabledAttrs(vm.saving)}>Descartar</button>
            <button type="submit" form="${AGENDA_DETAIL_FORM_ID}" class="inc-create-submit" data-detail-action="${AGENDA_DETAIL_ACTIONS.SAVE}" ${disabledAttrs(vm.saving)}>
              ${vm.saving ? `<span class="inc-create-spinner" aria-hidden="true"></span><span>Guardando...</span>` : `<span>Guardar cambios</span>`}
            </button>
          </span>
        </div>`
      : puedeGestionar
        ? `
        <div class="agenda-create-actions inc-create-actions">
          <span class="inc-create-actions-note">Editar o eliminar avisa al usuario por correo.</span>
          <span class="agenda-create-actions-group">
            <button type="button" class="agenda-detail-danger" data-detail-action="${AGENDA_DETAIL_ACTIONS.DELETE_CITA}" ${disabledAttrs(vm.saving)}>Eliminar cita</button>
            <button type="button" class="inc-create-submit" data-detail-action="${AGENDA_DETAIL_ACTIONS.EDIT}" ${disabledAttrs(vm.saving)}>Editar</button>
          </span>
        </div>`
        : "";

  return renderModalShell({
    id: AGENDA_DETAIL_MODAL_ID,
    rootClass: "agenda-detail-root",
    rootAttributes: {
      "data-agenda-detail-root": "true",
      "data-agenda-modal": "detail",
      "data-cita-id": cita?.id || "",
    },
    overlayAttributes: { "data-agenda-detail-modal-overlay": "true" },
    panelId: AGENDA_DETAIL_PANEL_ID,
    panelAttributes: { "data-agenda-detail-modal-panel": "true" },
    labelledBy: "agenda-detail-title",
    size: "compact",
    height: "auto",
    submitting: vm.saving,
    header: `
      <div class="inc-create-header-copy">
        <h2 id="agenda-detail-title">${vm.editing ? "Editar cita" : "Cita"}</h2>
        <p>${cita ? escapeHtml(longDateLabelFromKey(cita.fechaLocal)) : "Detalle de la cita"}</p>
      </div>
      ${renderModalCloseButton({
        label: "Cerrar",
        attributes: {
          "data-detail-action": AGENDA_DETAIL_ACTIONS.CLOSE,
          disabled: Boolean(vm.saving),
          "aria-disabled": vm.saving ? "true" : false,
        },
      })}
    `,
    bodyClass: "agenda-detail-body inc-create-body",
    body,
    footer,
  });
}

/* =========================================================
   CONFIRMACIÓN DE «ELIMINAR CITA»

   El botón se llama «Eliminar cita» porque es la acción de producto, pero la
   operación real es la cancelación contractual: el backend no expone DELETE y
   el documento se conserva. El texto lo dice, en vez de dejar creer que se
   borra algo.
========================================================= */

export function renderAgendaDeleteConfirm({ motivo = "", saving = false } = {}) {
  return renderModalShell({
    rootAttributes: { "data-agenda-delete-confirm": "true" },
    panelAttributes: { "data-agenda-delete-confirm-dialog": "true" },
    role: "alertdialog",
    labelledBy: "agenda-delete-confirm-title",
    describedBy: "agenda-delete-confirm-description",
    size: "confirm",
    height: "auto",
    header: `<div class="inc-create-header-copy"><h3 id="agenda-delete-confirm-title">Eliminar cita</h3></div>`,
    bodyClass: "inc-create-body",
    body: `
      <p id="agenda-delete-confirm-description">Esta cita se marcará como cancelada. No se eliminará físicamente del historial, y el usuario recibirá un aviso de cancelación.</p>
      <label class="inc-create-field">
        <span class="inc-create-label">Motivo (opcional)</span>
        <textarea class="inc-create-textarea" data-field="motivo" name="motivo" rows="2" maxlength="300" ${disabledAttrs(saving)}>${escapeHtml(motivo)}</textarea>
      </label>`,
    footer: `
      <button type="button" class="agenda-create-cancel" data-${AGENDA_DELETE_CONFIRM_ACTION}="cancel">Volver</button>
      <button type="button" class="agenda-detail-danger" data-${AGENDA_DELETE_CONFIRM_ACTION}="confirm">Eliminar cita</button>`,
  });
}

export default renderAgendaDetailModal;
