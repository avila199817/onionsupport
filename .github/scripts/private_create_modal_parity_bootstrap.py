#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_between(path: Path, start_marker: str, end_marker: str, replacement: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"{label}: start marker not found")
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"{label}: end marker not found")
    updated = text[:start] + replacement + text[end:]
    if updated == text:
        raise SystemExit(f"{label}: replacement produced no change")
    path.write_text(updated, encoding="utf-8")


# -----------------------------------------------------------------------------
# FACTURAS — preserve business logic, replace only modal chrome/structure.
# -----------------------------------------------------------------------------
fac = ROOT / "src/views/facturas/facturas.template.create.js"
fac_replacement = r'''function renderFacturaCreateLoadingOverlay(vm = {}) {
  const lineCount = safeArray(vm.form?.lineas).length;
  const ticketCount = safeArray(vm.selectedTickets).length;
  const detail = [
    lineCount ? `${lineCount === 1 ? "1 partida" : `${lineCount} partidas`}` : "",
    ticketCount ? `${ticketCount === 1 ? "1 incidencia" : `${ticketCount} incidencias`}` : "",
  ].filter(Boolean).join(" · ");

  return `
    <div class="fac-create-loading-overlay" aria-live="polite" aria-busy="true">
      <div class="fac-create-loading-card" role="status">
        <span class="fac-create-loading-spinner" aria-hidden="true"></span>
        <span class="fac-create-loading-copy">
          <strong>Creando factura...</strong>
          <small>${escapeHtml(detail ? `Guardando ${detail} y preparando la factura.` : "Guardando la factura y preparando el documento.")}</small>
        </span>
      </div>
    </div>
  `;
}

export function renderFacturasCreateModal(input = {}) {
  const vm = buildVm(input);
  if (!vm.open) return "";

  const errors = vm.errors;
  const clientCount = vm.selectedClientes.length;
  const disabled = vm.submitting || !vm.canCreate;

  return `
    <section
      id="${MODAL_ID}"
      class="fac-create-root"
      data-facturas-create-root="true"
      data-open="true"
      data-template-version="${attr(FACTURAS_CREATE_TEMPLATE_VERSION)}"
      role="presentation"
    >
      <div class="fac-create-overlay" data-facturas-create-modal-overlay="true">
        <div
          id="${PANEL_ID}"
          class="fac-create-panel"
          data-facturas-create-modal-panel="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="${PANEL_ID}-title"
          aria-describedby="${PANEL_ID}-subtitle"
          tabindex="-1"
        >
          <header class="fac-create-header">
            <div class="fac-create-header-copy">
              <h2 id="${PANEL_ID}-title">Crear factura</h2>
              <p id="${PANEL_ID}-subtitle">Selecciona el cliente, vincula la incidencia y añade todas las partidas que deban facturarse.</p>
            </div>
            <button
              type="button"
              class="fac-create-close"
              data-factura-create-action="${FACTURA_CREATE_ACTIONS.CLOSE}"
              aria-label="Cerrar"
              ${vm.submitting ? "disabled" : ""}
            >${icon("close")}</button>
          </header>

          <div class="fac-create-body" data-facturas-create-body="true">
            ${vm.serverError ? `<div class="fac-create-alert is-error" role="alert">${escapeHtml(vm.serverError)}</div>` : ""}
            ${vm.successMessage ? `<div class="fac-create-alert is-success" role="status">${escapeHtml(vm.successMessage)}</div>` : ""}

            <form id="${FORM_ID}" class="fac-create-form" data-facturas-create-form="true" novalidate>
              <section class="fac-create-section">
                <div class="fac-create-section-head">
                  <div>
                    <span>Cliente</span>
                    <strong>Cliente y perfil fiscal</strong>
                  </div>
                  <small>El cliente principal determina el perfil fiscal de la factura.</small>
                </div>

                <div data-slot="selected-clientes">${renderSelectedClientes(vm)}</div>
                <div data-error-slot="clienteId">${renderFieldError(errors.clienteId)}</div>

                <label class="fac-create-field fac-create-field--search">
                  <span class="fac-create-label">${clientCount ? "Añadir otro cliente" : "Buscar cliente"}</span>
                  <span class="fac-create-search-shell">
                    <span aria-hidden="true">${icon("search")}</span>
                    <input
                      class="fac-create-input${errors.clienteId ? " is-error" : ""}"
                      data-field="clienteSearch"
                      data-create-field="clienteSearch"
                      name="clienteSearch"
                      type="search"
                      value="${attr(vm.clientSearch.query)}"
                      placeholder="Nombre, email, empresa o NIF..."
                      autocomplete="off"
                      spellcheck="false"
                      ${disabled ? "disabled" : ""}
                    >
                  </span>
                </label>

                <div
                  class="fac-create-search-slot"
                  data-slot="client-search-results"
                  aria-live="polite"
                  aria-busy="${vm.clientSearch.loading ? "true" : "false"}"
                >${renderClientSearchResults(vm)}</div>

                ${vm.primaryClient ? `
                  <div class="fac-create-tax-policy ${vm.taxProfile.aplicaIrpf ? "is-business" : "is-particular"}">
                    <span class="fac-create-tax-policy-icon">${icon("shield")}</span>
                    <div>
                      <strong>${escapeHtml(vm.taxProfile.label)}</strong>
                      <span>${escapeHtml(vm.taxProfile.detail)}${vm.primaryClient.nif ? ` · ${escapeHtml(vm.primaryClient.nif)}` : ""}</span>
                    </div>
                  </div>
                ` : ""}
              </section>

              <section class="fac-create-section">
                <div class="fac-create-section-head">
                  <div>
                    <span>Incidencia</span>
                    <strong>Incidencia vinculada</strong>
                  </div>
                  <div class="fac-create-section-actions">
                    <button
                      type="button"
                      class="fac-create-link-btn"
                      data-factura-create-action="${FACTURA_CREATE_ACTIONS.TICKET_REFRESH}"
                      ${disabled || !clientCount || vm.ticketSearch.loading ? "disabled" : ""}
                      aria-busy="${vm.ticketSearch.loading ? "true" : "false"}"
                    >${vm.ticketSearch.loading ? "Cargando..." : "Recargar"}</button>
                  </div>
                </div>

                <div data-slot="selected-tickets">${renderSelectedTickets(vm)}</div>
                <div data-error-slot="incidenciaId">${renderFieldError(errors.incidenciaId)}</div>

                <label class="fac-create-field fac-create-field--search">
                  <span class="fac-create-label">Filtrar incidencias del cliente</span>
                  <span class="fac-create-search-shell">
                    <span aria-hidden="true">${icon("search")}</span>
                    <input
                      class="fac-create-input${errors.incidenciaId ? " is-error" : ""}"
                      data-field="ticketSearch"
                      data-create-field="ticketSearch"
                      name="ticketSearch"
                      type="search"
                      value="${attr(vm.ticketSearch.query)}"
                      placeholder="ID, asunto o estado..."
                      autocomplete="off"
                      spellcheck="false"
                      ${disabled || !clientCount ? "disabled" : ""}
                    >
                  </span>
                </label>

                <div
                  class="fac-create-search-slot"
                  data-slot="ticket-search-results"
                  aria-live="polite"
                  aria-busy="${vm.ticketSearch.loading ? "true" : "false"}"
                >${renderTicketSearchResults(vm)}</div>
              </section>

              <section class="fac-create-section">
                <div class="fac-create-section-head">
                  <div>
                    <span>Facturación</span>
                    <strong>Conceptos e importes</strong>
                  </div>
                  <div class="fac-create-section-actions">
                    <button type="button" class="fac-create-link-btn fac-create-line-add" data-factura-create-action="${FACTURA_CREATE_ACTIONS.LINE_ADD}" ${disabled ? "disabled" : ""}>${icon("plus")}<span>Añadir concepto</span></button>
                  </div>
                </div>

                ${renderLineItems(vm, disabled)}
                ${renderFieldError(errors.lineas)}

                <div class="fac-create-form-grid fac-create-form-grid--meta">
                  ${renderInput({ label: "Fecha de servicio", name: "fechaServicio", value: vm.form.fechaServicio, type: "date", required: true, error: errors.fechaServicio, disabled })}
                  ${renderSelect({ label: "Forma de pago", name: "formaPago", value: vm.form.formaPago, options: PAYMENT_OPTIONS, error: errors.formaPago, disabled })}
                  ${renderSelect({ label: "Estado de pago", name: "estadoPago", value: vm.form.estadoPago, options: PAYMENT_STATUS_OPTIONS, error: errors.estadoPago, disabled })}

                  <label class="fac-create-toggle">
                    <span><strong>Enviar por email</strong><small>Enviar la factura al cliente al finalizar.</small></span>
                    <span class="fac-create-toggle-control">
                      <input data-field="sendEmail" name="sendEmail" type="checkbox" ${vm.form.sendEmail ? "checked" : ""} ${disabled ? "disabled" : ""}>
                      <span aria-hidden="true"></span>
                    </span>
                  </label>
                </div>
              </section>

              ${renderTotalStrip(vm)}

              <div class="fac-create-actions">
                <span class="fac-create-actions-note">La factura se creará con el cliente, las incidencias y todas las partidas seleccionadas.</span>
                <button
                  type="submit"
                  class="fac-create-submit"
                  data-factura-create-action="${FACTURA_CREATE_ACTIONS.SUBMIT}"
                  ${disabled ? "disabled" : ""}
                  aria-busy="${vm.submitting ? "true" : "false"}"
                >
                  ${vm.submitting ? renderSpinner("Creando...") : `<span>Crear factura</span>`}
                </button>
              </div>
            </form>
          </div>

          ${vm.submitting ? renderFacturaCreateLoadingOverlay(vm) : ""}
        </div>
      </div>
    </section>
  `;
}

'''
replace_between(
    fac,
    "export function renderFacturasCreateModal(input = {}) {",
    "export function renderFacturasCreateModalClosed() {",
    fac_replacement,
    "facturas create modal",
)

# -----------------------------------------------------------------------------
# CLIENTES — it already reuses Incidencias classes; remove remaining drift.
# -----------------------------------------------------------------------------
cli = ROOT / "src/views/clientes/clientes.template.create.js"
cli_loading = r'''function renderLoadingOverlay(
  label = "Creando cliente..."
) {
  return `
    <div
      class="cli-create-loading-overlay inc-create-loading-overlay"
      aria-live="polite"
      aria-busy="true"
      data-create-loading-overlay="true"
    >
      <div class="cli-create-loading-card inc-create-loading-card" role="status">
        <span class="cli-create-loading-spinner inc-create-loading-spinner" aria-hidden="true"></span>
        <span class="cli-create-loading-copy inc-create-loading-copy">
          <strong>${escapeHtml(label)}</strong>
          <small>Guardando el cliente y sincronizando la vinculación con el usuario.</small>
        </span>
      </div>
    </div>
  `;
}

'''
replace_between(
    cli,
    "function renderLoadingOverlay(\n",
    "/* =========================================================\n   TEMPLATE\n========================================================= */",
    cli_loading,
    "clientes loading overlay",
)

cli_modal = r'''export function renderClientesCreateModal(
  input = {}
) {
  const vm = buildVm(input);
  if (!vm.open) return "";

  return `
    <section
      id="${MODAL_ID}"
      data-clientes-create-root="true"
      data-clientes-modal="create"
      data-open="true"
      data-template-version="${attr(CLIENTES_CREATE_TEMPLATE_VERSION)}"
      class="cli-create-root inc-create-root"
      role="presentation"
    >
      <div
        class="cli-create-overlay inc-create-overlay"
        data-clientes-create-modal-overlay="true"
      >
        <div
          id="${PANEL_ID}"
          data-clientes-create-modal-panel="true"
          class="cli-create-panel inc-create-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clientes-create-title"
          aria-describedby="clientes-create-subtitle"
          tabindex="-1"
        >
          <header class="cli-create-header inc-create-header">
            <div class="cli-create-header-copy inc-create-header-copy">
              <h2 id="clientes-create-title">Crear cliente</h2>
              <p id="clientes-create-subtitle">Vincula un usuario real y completa los datos fiscales, de contacto y dirección del cliente.</p>
            </div>

            <button
              type="button"
              class="cli-create-close inc-create-close"
              data-create-action="${CREATE_ACTIONS.CLOSE}"
              aria-label="Cerrar"
              ${disabledAttrs(vm.submitting, vm.submitting)}
            >${icon("close")}</button>
          </header>

          <div class="cli-create-body inc-create-body">
            ${vm.successMessage ? renderAlert("success", "Cliente creado.", vm.successMessage) : ""}
            ${vm.serverError ? renderAlert("error", "No se pudo crear el cliente.", vm.serverError) : ""}

            <form
              id="${FORM_ID}"
              data-clientes-create-form="true"
              novalidate
              class="cli-create-form inc-create-form"
              autocomplete="off"
            >
              ${renderAdminUserSearch(vm)}
              ${renderFiscalBlock(vm)}
              ${renderContactBlock(vm)}
              ${renderAddressBlock(vm)}

              <div class="cli-create-actions inc-create-actions">
                <span class="cli-create-actions-note inc-create-actions-note">El cliente quedará vinculado al usuario seleccionado y disponible en las vistas privadas.</span>
                <button
                  id="clientes-create-submit-btn"
                  type="submit"
                  data-create-action="${CREATE_ACTIONS.SUBMIT}"
                  ${disabledAttrs(vm.submitting || !vm.admin, vm.submitting)}
                  class="cli-create-submit inc-create-submit"
                >
                  <span class="cli-create-submit-inner inc-create-submit-inner">
                    ${vm.submitting ? `<span class="cli-create-spinner inc-create-spinner" aria-hidden="true"></span>Creando...` : "Crear cliente"}
                  </span>
                </button>
              </div>
            </form>
          </div>

          ${vm.submitting ? renderLoadingOverlay("Creando cliente y sincronizando usuario...") : ""}
        </div>
      </div>
    </section>
  `;
}

'''
replace_between(
    cli,
    "export function renderClientesCreateModal(\n",
    "export function renderClientesCreateModalClosed() {",
    cli_modal,
    "clientes create modal",
)

# -----------------------------------------------------------------------------
# USUARIOS — preserve activation behavior while using Incidencias modal chrome.
# -----------------------------------------------------------------------------
usr = ROOT / "src/views/usuarios/usuarios.template.create.js"
usr_feedback = r'''function renderAlert() {
  if (!state.error) return "";

  const warning = state.error.startsWith("El usuario se creó");

  return `
    <div
      class="usr-create-alert inc-create-alert ${warning ? "is-warning" : "is-error"}"
      role="${warning ? "status" : "alert"}"
    >
      <span class="usr-create-alert-icon inc-create-alert-icon" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/></svg>
      </span>
      <span class="usr-create-alert-copy inc-create-alert-copy">
        <strong>${warning ? "Atención con el alta" : "No se pudo crear el usuario"}</strong>
        <span>${escapeHtml(state.error)}</span>
      </span>
    </div>
  `;
}

function renderLoadingOverlay() {
  if (!state.submitting) return "";

  return `
    <div
      class="usr-create-loading-overlay inc-create-loading-overlay"
      aria-live="polite"
      aria-busy="true"
    >
      <div class="usr-create-loading-card inc-create-loading-card" role="status">
        <span class="usr-create-loading-spinner inc-create-loading-spinner" aria-hidden="true"></span>
        <span class="usr-create-loading-copy inc-create-loading-copy">
          <strong>Creando usuario y enviando activación...</strong>
          <small>Guardando la cuenta y preparando el correo de activación.</small>
        </span>
      </div>
    </div>
  `;
}

'''
replace_between(
    usr,
    "function renderAlert() {",
    "function renderModalHtml() {",
    usr_feedback,
    "usuarios alerts/loading",
)

usr_modal = r'''function renderModalHtml() {
  const form = cloneForm(state.form);
  const errors = safeObject(state.errors);
  const disabled = state.submitting;
  const empresa = form.tipo === "empresa";

  return `
    <section
      id="${ROOT_ID}"
      class="usuarios-create-modal-host is-open inc-create-root"
      data-usuarios-create-root="true"
      data-version="${attr(USUARIOS_CREATE_MODAL_VERSION)}"
      data-api-version="${attr(USUARIOS_API_VERSION)}"
      data-create-endpoint="${attr(USUARIOS_CREATE_ENDPOINT)}"
      data-activation-flow="true"
      role="presentation"
    >
      <div
        class="usr-create-overlay inc-create-overlay"
        data-usr-create-action="overlay"
        aria-hidden="false"
      >
        <div
          id="${PANEL_ID}"
          class="usr-create-panel inc-create-panel${state.submitting ? " is-submitting" : ""}"
          data-usuarios-create-panel="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="usuarios-create-title"
          aria-describedby="usuarios-create-description"
          tabindex="-1"
        >
          <header class="usr-create-header inc-create-header">
            <div class="usr-create-header-copy inc-create-header-copy">
              <h2 id="usuarios-create-title">Crear usuario</h2>
              <p id="usuarios-create-description">Completa los datos de la cuenta. Se enviará un correo para que el usuario active su acceso.</p>
            </div>

            <button
              type="button"
              class="usr-create-close inc-create-close"
              data-usr-create-action="close"
              aria-label="Cerrar"
              ${disabled ? "disabled" : ""}
            >
              <svg aria-hidden="true" focusable="false" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </header>

          <div class="usr-create-body inc-create-body">
            ${renderAlert()}

            <form
              id="${FORM_ID}"
              class="usr-create-form inc-create-form"
              data-usuarios-create-form="true"
              novalidate
            >
              <section class="usr-create-main inc-create-block">
                <div class="usr-create-inline-grid inc-create-grid inc-create-grid--2">
                  ${renderField({
                    label: "Nombre completo",
                    name: "name",
                    value: form.name,
                    placeholder: "Nombre y apellidos",
                    autocomplete: "name",
                    required: true,
                    error: errors.name,
                    disabled,
                    maxLength: 140,
                  })}

                  ${renderField({
                    label: "Email",
                    name: "email",
                    type: "email",
                    value: form.email,
                    placeholder: "usuario@dominio.com",
                    autocomplete: "email",
                    required: true,
                    error: errors.email,
                    disabled,
                    maxLength: 254,
                    hint: "Aquí recibirá el enlace de activación.",
                  })}
                </div>

                <div class="usr-create-inline-grid usr-create-inline-grid--3 inc-create-grid inc-create-grid--3">
                  ${renderField({
                    label: "Teléfono",
                    name: "phone",
                    type: "tel",
                    value: form.phone,
                    placeholder: "+34 600 000 000",
                    autocomplete: "tel",
                    error: errors.phone,
                    disabled,
                    maxLength: 40,
                  })}

                  ${renderSelect({
                    label: "Tipo",
                    name: "tipo",
                    value: form.tipo,
                    error: errors.tipo,
                    disabled,
                    options: [
                      { value: "particular", label: "Particular" },
                      { value: "empresa", label: "Empresa" },
                    ],
                  })}

                  ${renderField({
                    label: "NIF / CIF",
                    name: "nif",
                    value: form.nif,
                    placeholder: empresa ? "Obligatorio para empresa" : "Opcional",
                    autocomplete: "off",
                    required: empresa,
                    error: errors.nif,
                    disabled,
                    maxLength: 32,
                    hint: empresa ? "" : "Solo es obligatorio cuando el tipo es Empresa.",
                  })}
                </div>

                <div class="usr-create-inline-grid inc-create-grid inc-create-grid--2">
                  ${renderField({
                    label: "Calle / dirección",
                    name: "calle",
                    value: form.calle,
                    placeholder: "Calle, número, piso...",
                    autocomplete: "street-address",
                    error: errors.calle,
                    disabled,
                    maxLength: 150,
                  })}

                  ${renderField({
                    label: "Código postal",
                    name: "cp",
                    value: form.cp,
                    placeholder: "00000",
                    autocomplete: "postal-code",
                    error: errors.cp,
                    disabled,
                    maxLength: 20,
                  })}
                </div>

                <div class="usr-create-inline-grid usr-create-inline-grid--3 inc-create-grid inc-create-grid--3">
                  ${renderField({
                    label: "Ciudad",
                    name: "ciudad",
                    value: form.ciudad,
                    placeholder: "Ciudad",
                    autocomplete: "address-level2",
                    error: errors.ciudad,
                    disabled,
                    maxLength: 100,
                  })}

                  ${renderField({
                    label: "Provincia",
                    name: "provincia",
                    value: form.provincia,
                    placeholder: "Provincia",
                    autocomplete: "address-level1",
                    error: errors.provincia,
                    disabled,
                    maxLength: 100,
                  })}

                  ${renderField({
                    label: "País",
                    name: "pais",
                    value: form.pais,
                    placeholder: "País",
                    autocomplete: "country-name",
                    error: errors.pais,
                    disabled,
                    maxLength: 100,
                  })}
                </div>

                <div class="usr-create-inline-grid inc-create-grid inc-create-grid--2">
                  ${renderSelect({
                    label: "Privacidad",
                    name: "privacyMode",
                    value: String(Boolean(form.privacyMode)),
                    disabled,
                    options: [
                      { value: "false", label: "Modo estándar" },
                      { value: "true", label: "Modo privacidad" },
                    ],
                  })}

                  ${renderSelect({
                    label: "Apariencia inicial",
                    name: "darkMode",
                    value: String(Boolean(form.darkMode)),
                    disabled,
                    options: [
                      { value: "true", label: "Modo oscuro" },
                      { value: "false", label: "Modo claro" },
                    ],
                  })}
                </div>

                <div
                  class="usr-create-alert inc-create-alert"
                  role="note"
                  data-usuarios-create-activation-note="true"
                >
                  <span class="usr-create-alert-icon inc-create-alert-icon" aria-hidden="true">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  </span>
                  <span class="usr-create-alert-copy inc-create-alert-copy">
                    <strong>Activación por correo</strong>
                    <span>El usuario se crea pendiente de activación. El nombre de usuario se genera automáticamente desde su email.</span>
                  </span>
                </div>
              </section>

              <div class="usr-create-actions inc-create-actions">
                <span class="usr-create-actions-note inc-create-actions-note">El usuario recibirá el enlace de activación en el email indicado.</span>
                <button
                  type="submit"
                  class="usr-create-submit inc-create-submit"
                  data-usr-create-action="submit"
                  ${disabled ? "disabled" : ""}
                >
                  ${state.submitting ? `<span class="usr-create-spinner inc-create-spinner" aria-hidden="true"></span><span>Creando...</span>` : `<span>Crear y enviar activación</span>`}
                </button>
              </div>
            </form>
          </div>

          ${renderLoadingOverlay()}
        </div>
      </div>
    </section>
  `;
}

'''
replace_between(
    usr,
    "function renderModalHtml() {",
    "/* =========================================================\n   DOM / FOCUS\n========================================================= */",
    usr_modal,
    "usuarios create modal",
)

print("private-create-modal-parity-bootstrap: Facturas/Clientes/Usuarios templates aligned to Incidencias Create")
