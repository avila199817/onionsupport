/* =========================================================
   Onion SPA - Ajustes Edit View
   Archivo: src/views/ajustes/ajustesEditView.js

   FINAL PRO SYSTEM · EDIT VIEW · 10/10

   RESPONSABILIDADES:
   - flujo simple de edición / creación de ajustes
   - abrir / cerrar view de edición
   - bind robusto del formulario
   - hidratar form desde saveDraft / editView
   - submit seguro con create / update
   - validación mínima enterprise-safe
   - compatibilidad con ajustesView.js / index.js

   HARDENING PRO:
   - no rompe si faltan módulos externos
   - safe rerender
   - cleanup completo
   - fallback a modal / toast / navegación
   - preparado para iterar diseño después
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  ajustesState,
  setSaving,
  setEditViewForm,
  patchEditViewForm,
  setEditViewErrors,
  clearEditViewErrors,
  setEditViewSubmitting,
  setEditViewServerError,
  setEditViewSuccess,
  clearEditViewSuccess,
  resetEditViewState,
  setSaveDraft,
  patchSaveDraft,
  clearSaveDraft,
} from "./ajustes.state.js";

import {
  createAjuste,
  updateAjuste,
  validateAjustes,
} from "./ajustes.api.js";

import {
  safeText,
  safeObject,
  safeArray,
  showToast,
  escapeHtml,
  stringifyValue,
} from "./ajustes.utils.js";

/* =========================================================
   MODULE
========================================================= */

export const AjustesEditView = (() => {
  "use strict";

  const SCOPE = "view:ajustes:edit";

  let initialized = false;
  let destroyed = false;
  let bindingsCleanup = null;
  let currentMode = "create";
  let currentItem = null;

  /* =====================================================
     HELPERS CORE
  ===================================================== */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[AjustesEditView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[AjustesEditView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    try {
      AppCore?.events?.emit?.(event, payload);
    } catch {}
  }

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function safeCall(target, method, ...args) {
    try {
      const fn = target?.[method];
      if (typeof fn === "function") {
        return fn(...args);
      }
    } catch {}
    return undefined;
  }

  function getFormState() {
    return safeObject(ajustesState?.editView?.form);
  }

  function getErrorsState() {
    return safeObject(ajustesState?.editView?.errors);
  }

  function getServerError() {
    return safeText(ajustesState?.editView?.serverError, "");
  }

  function isSubmitting() {
    return Boolean(ajustesState?.editView?.submitting);
  }

  function getSavedSettingId() {
    return safeText(ajustesState?.editView?.savedSettingId, "");
  }

  function getSuccessMessage() {
    return safeText(ajustesState?.editView?.successMessage, "");
  }

  function getTitleByMode() {
    return currentMode === "edit"
      ? "Editar ajuste"
      : "Nuevo ajuste";
  }

  function getSubmitLabel() {
    if (isSubmitting()) {
      return currentMode === "edit"
        ? "Guardando..."
        : "Creando...";
    }

    return currentMode === "edit"
      ? "Guardar cambios"
      : "Crear ajuste";
  }

  function normalizeOptionsInput(value = "") {
    const text = safeText(value, "");

    if (!text) {
      return [];
    }

    return text
      .split(",")
      .map((part) => safeText(part, ""))
      .filter(Boolean)
      .map((part) => ({
        label: part,
        value: part,
      }));
  }

  function optionsToInput(options = []) {
    return safeArray(options)
      .map((entry) => {
        if (typeof entry === "string") {
          return safeText(entry, "");
        }

        const item = safeObject(entry);

        return safeText(
          item.label ||
            item.value ||
            item.name ||
            item.title,
          ""
        );
      })
      .filter(Boolean)
      .join(", ");
  }

  function getPayloadFromForm() {
    const form = getFormState();

    return {
      settingId: safeText(form.settingId, ""),
      key: safeText(form.key, ""),
      title: safeText(form.title, ""),
      description: safeText(form.description, ""),
      category: safeText(form.category, "General"),
      value: safeText(form.value, ""),
      type: safeText(form.type, "text"),
      status: safeText(form.status, "active"),
      visibility: safeText(form.visibility, "private"),
      options: normalizeOptionsInput(form.optionsInput || ""),
      tags: safeText(form.tags, ""),
      updatedByName: safeText(form.updatedByName, ""),
    };
  }

  function normalizeIncomingItem(item = {}) {
    const source = safeObject(item);

    return {
      settingId: safeText(
        source.settingId ||
          source.ajusteId ||
          source.id,
        ""
      ),
      key: safeText(source.key, ""),
      title: safeText(
        source.title ||
          source.name ||
          source.label,
        ""
      ),
      description: safeText(
        source.description ||
          source.descripcion ||
          source.helpText,
        ""
      ),
      category: safeText(source.category, "General"),
      value: stringifyValue(source.value, ""),
      type: safeText(source.type, "text"),
      status: safeText(source.status, "active"),
      visibility: safeText(source.visibility, "private"),
      optionsInput: optionsToInput(source.options),
      tags: Array.isArray(source.tags)
        ? source.tags.join(", ")
        : safeText(source.tags, ""),
      updatedByName: safeText(source.updatedByName, ""),
      validateBeforeSave: true,
      publishOnSave: false,
    };
  }

  function validateForm(form = {}) {
    const data = safeObject(form);
    const errors = {};

    if (!safeText(data.key, "")) {
      errors.key = "La key es obligatoria.";
    }

    if (!safeText(data.title, "")) {
      errors.title = "El título es obligatorio.";
    }

    if (!safeText(data.category, "")) {
      errors.category = "La categoría es obligatoria.";
    }

    if (!safeText(data.type, "")) {
      errors.type = "El tipo es obligatorio.";
    }

    if (!safeText(data.status, "")) {
      errors.status = "El estado es obligatorio.";
    }

    if (!safeText(data.visibility, "")) {
      errors.visibility = "La visibilidad es obligatoria.";
    }

    return errors;
  }

  function setFormFromItem(item = {}) {
    const normalized = normalizeIncomingItem(item);

    setSaveDraft(normalized);
    setEditViewForm(normalized);
    clearEditViewErrors();
    setEditViewServerError("");
    clearEditViewSuccess();

    return normalized;
  }

  function getBackHandler() {
    try {
      const globalView = window?.OnionAjustes;
      if (globalView?.render) {
        return () => globalView.render();
      }
    } catch {}

    return () => {
      try {
        window.history.back();
      } catch {}
    };
  }

  /* =====================================================
     RENDER
  ===================================================== */

  function renderField({
    label = "",
    name = "",
    value = "",
    placeholder = "",
    type = "text",
    textarea = false,
    select = false,
    options = [],
    error = "",
  } = {}) {
    const commonStyles = `
      width:100%;
      min-height:44px;
      padding:12px 14px;
      border-radius:14px;
      border:1px solid ${
        error
          ? "color-mix(in srgb, var(--danger-strong, #ff6b6b) 28%, var(--border-soft))"
          : "var(--border-soft)"
      };
      background:var(--surface-1, var(--surface-glass));
      color:var(--text-strong);
      font:inherit;
      outline:none;
      box-sizing:border-box;
    `;

    return `
      <label
        style="
          display:grid;
          gap:8px;
        "
      >
        <span
          style="
            color:var(--text-soft);
            font-size:13px;
            font-weight:var(--weight-bold, 700);
            letter-spacing:.02em;
          "
        >
          ${escapeHtml(label)}
        </span>

        ${
          textarea
            ? `
              <textarea
                name="${escapeHtml(name)}"
                placeholder="${escapeHtml(placeholder)}"
                style="${commonStyles} min-height:120px; resize:vertical;"
              >${escapeHtml(value)}</textarea>
            `
            : select
              ? `
                <select
                  name="${escapeHtml(name)}"
                  style="${commonStyles}"
                >
                  ${safeArray(options)
                    .map((opt) => {
                      const option = safeObject(opt);
                      const optionValue = safeText(option.value, "");
                      const optionLabel = safeText(option.label, optionValue);
                      const selected = optionValue === safeText(value, "")
                        ? "selected"
                        : "";

                      return `
                        <option
                          value="${escapeHtml(optionValue)}"
                          ${selected}
                        >
                          ${escapeHtml(optionLabel)}
                        </option>
                      `;
                    })
                    .join("")}
                </select>
              `
              : `
                <input
                  type="${escapeHtml(type)}"
                  name="${escapeHtml(name)}"
                  value="${escapeHtml(value)}"
                  placeholder="${escapeHtml(placeholder)}"
                  style="${commonStyles}"
                />
              `
        }

        ${
          error
            ? `
              <span
                style="
                  color:var(--danger-strong, #ff6b6b);
                  font-size:12px;
                  line-height:1.35;
                "
              >
                ${escapeHtml(error)}
              </span>
            `
            : ""
        }
      </label>
    `;
  }

  function buildHtml() {
    const form = getFormState();
    const errors = getErrorsState();
    const serverError = getServerError();
    const successMessage = getSuccessMessage();
    const savedSettingId = getSavedSettingId();
    const submitting = isSubmitting();

    return `
      <section class="panel-content dashboard ready">
        <div class="content-wrapper">
          <section
            class="panel-surface"
            style="
              display:grid;
              gap:18px;
              padding:24px;
              border-radius:var(--panel-radius);
              border:1px solid var(--border-soft);
              background:var(--surface-1, var(--surface-glass));
              box-shadow:var(--shadow-sm);
            "
          >
            <div
              style="
                display:flex;
                align-items:flex-start;
                justify-content:space-between;
                gap:16px;
                flex-wrap:wrap;
              "
            >
              <div style="display:grid; gap:8px;">
                <span
                  style="
                    display:inline-flex;
                    width:max-content;
                    min-height:28px;
                    align-items:center;
                    padding:0 12px;
                    border-radius:999px;
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-dim);
                    font-size:12px;
                    letter-spacing:.06em;
                    text-transform:uppercase;
                    font-weight:var(--weight-bold, 700);
                  "
                >
                  Ajustes
                </span>

                <h1
                  style="
                    margin:0;
                    font-size:clamp(28px, 4vw, 40px);
                    line-height:1;
                    letter-spacing:-.04em;
                    color:var(--text-strong);
                  "
                >
                  ${escapeHtml(getTitleByMode())}
                </h1>
              </div>

              <div
                style="
                  display:flex;
                  gap:10px;
                  flex-wrap:wrap;
                "
              >
                <button
                  type="button"
                  data-action="edit-cancel"
                  style="
                    min-height:42px;
                    padding:0 14px;
                    border-radius:var(--btn-radius);
                    border:1px solid var(--border-soft);
                    background:var(--surface-glass);
                    color:var(--text-soft);
                    font-weight:var(--weight-bold, 700);
                    cursor:pointer;
                  "
                >
                  Volver
                </button>

                <button
                  type="button"
                  data-action="edit-submit"
                  ${submitting ? "disabled" : ""}
                  style="
                    min-height:42px;
                    padding:0 16px;
                    border-radius:var(--btn-radius);
                    border:1px solid var(--btn-primary-border, color-mix(in srgb, var(--accent, #7c5cff) 28%, transparent));
                    background:var(--btn-primary-bg, var(--accent, #7c5cff));
                    color:var(--btn-primary-text, #fff);
                    font-weight:var(--weight-bold, 700);
                    cursor:${submitting ? "wait" : "pointer"};
                    opacity:${submitting ? ".82" : "1"};
                  "
                >
                  ${escapeHtml(getSubmitLabel())}
                </button>
              </div>
            </div>

            ${
              serverError
                ? `
                  <div
                    style="
                      padding:14px 16px;
                      border-radius:14px;
                      border:1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 26%, var(--border-soft));
                      background:color-mix(in srgb, var(--danger-strong, #ff6b6b) 8%, transparent);
                      color:var(--danger-strong, #ff6b6b);
                    "
                  >
                    ${escapeHtml(serverError)}
                  </div>
                `
                : ""
            }

            ${
              successMessage
                ? `
                  <div
                    style="
                      padding:14px 16px;
                      border-radius:14px;
                      border:1px solid color-mix(in srgb, var(--success-strong, #36c690) 26%, var(--border-soft));
                      background:color-mix(in srgb, var(--success-strong, #36c690) 8%, transparent);
                      color:var(--success-strong, #36c690);
                    "
                  >
                    ${escapeHtml(successMessage)}
                    ${
                      savedSettingId
                        ? ` · ID ${escapeHtml(savedSettingId)}`
                        : ""
                    }
                  </div>
                `
                : ""
            }

            <form
              id="ajustes-edit-form"
              style="
                display:grid;
                gap:16px;
              "
            >
              <div
                style="
                  display:grid;
                  gap:16px;
                  grid-template-columns:repeat(2, minmax(0, 1fr));
                "
                class="ajustes-edit-grid"
              >
                ${renderField({
                  label: "Key",
                  name: "key",
                  value: form.key,
                  placeholder: "payment.default_method",
                  error: errors.key,
                })}

                ${renderField({
                  label: "Título",
                  name: "title",
                  value: form.title,
                  placeholder: "Método de pago por defecto",
                  error: errors.title,
                })}

                ${renderField({
                  label: "Categoría",
                  name: "category",
                  value: form.category,
                  placeholder: "Pagos",
                  error: errors.category,
                })}

                ${renderField({
                  label: "Tipo",
                  name: "type",
                  value: form.type || "text",
                  select: true,
                  options: [
                    { value: "text", label: "Texto" },
                    { value: "number", label: "Número" },
                    { value: "boolean", label: "Booleano" },
                    { value: "select", label: "Selección" },
                    { value: "json", label: "JSON" },
                    { value: "payment_method", label: "Método de pago" },
                    { value: "email", label: "Email" },
                    { value: "url", label: "URL" },
                  ],
                  error: errors.type,
                })}

                ${renderField({
                  label: "Estado",
                  name: "status",
                  value: form.status || "active",
                  select: true,
                  options: [
                    { value: "active", label: "Activo" },
                    { value: "inactive", label: "Inactivo" },
                    { value: "draft", label: "Borrador" },
                    { value: "error", label: "Error" },
                  ],
                  error: errors.status,
                })}

                ${renderField({
                  label: "Visibilidad",
                  name: "visibility",
                  value: form.visibility || "private",
                  select: true,
                  options: [
                    { value: "private", label: "Privado" },
                    { value: "internal", label: "Interno" },
                    { value: "public", label: "Público" },
                  ],
                  error: errors.visibility,
                })}

                ${renderField({
                  label: "Valor",
                  name: "value",
                  value: form.value,
                  placeholder: "Ej: stripe",
                  error: errors.value,
                })}

                ${renderField({
                  label: "Actualizado por",
                  name: "updatedByName",
                  value: form.updatedByName,
                  placeholder: "Sistema",
                  error: errors.updatedByName,
                })}

                ${renderField({
                  label: "Opciones",
                  name: "optionsInput",
                  value: form.optionsInput,
                  placeholder: "stripe, paypal, transferencia",
                  error: errors.optionsInput,
                })}

                ${renderField({
                  label: "Tags",
                  name: "tags",
                  value: form.tags,
                  placeholder: "pagos, cliente, preferencia",
                  error: errors.tags,
                })}
              </div>

              ${renderField({
                label: "Descripción",
                name: "description",
                value: form.description,
                placeholder: "Describe el propósito del ajuste...",
                textarea: true,
                error: errors.description,
              })}

              <div
                style="
                  display:flex;
                  gap:14px;
                  flex-wrap:wrap;
                "
              >
                <label
                  style="
                    display:inline-flex;
                    align-items:center;
                    gap:10px;
                    color:var(--text-soft);
                    font-size:14px;
                  "
                >
                  <input
                    type="checkbox"
                    name="validateBeforeSave"
                    ${form.validateBeforeSave ? "checked" : ""}
                  />
                  Validar antes de guardar
                </label>

                <label
                  style="
                    display:inline-flex;
                    align-items:center;
                    gap:10px;
                    color:var(--text-soft);
                    font-size:14px;
                  "
                >
                  <input
                    type="checkbox"
                    name="publishOnSave"
                    ${form.publishOnSave ? "checked" : ""}
                  />
                  Publicar al guardar
                </label>
              </div>
            </form>

            <style>
              @media (max-width: 820px) {
                .ajustes-edit-grid {
                  grid-template-columns: 1fr !important;
                }
              }
            </style>
          </section>
        </div>
      </section>
    `;
  }

  function render() {
    const container = getContainer();

    if (!container) {
      safeWarn("No se encontró #view-container.");
      return null;
    }

    try {
      AppCore?.setDocumentTitle?.(
        currentMode === "edit" ? "Editar ajuste" : "Nuevo ajuste"
      );
    } catch {}

    container.innerHTML = buildHtml();

    return container;
  }

  function rerender() {
    if (destroyed) {
      return null;
    }

    const container = render();

    if (!destroyed) {
      bind();
    }

    return container;
  }

  /* =====================================================
     FORM
  ===================================================== */

  function readFormFromDom() {
    const formEl = document.getElementById("ajustes-edit-form");

    if (!formEl) {
      return getFormState();
    }

    const formData = new FormData(formEl);
    const current = getFormState();

    return {
      ...current,
      key: safeText(formData.get("key"), ""),
      title: safeText(formData.get("title"), ""),
      description: safeText(formData.get("description"), ""),
      category: safeText(formData.get("category"), "General"),
      value: safeText(formData.get("value"), ""),
      type: safeText(formData.get("type"), "text"),
      status: safeText(formData.get("status"), "active"),
      visibility: safeText(formData.get("visibility"), "private"),
      optionsInput: safeText(formData.get("optionsInput"), ""),
      tags: safeText(formData.get("tags"), ""),
      updatedByName: safeText(formData.get("updatedByName"), ""),
      validateBeforeSave: formData.get("validateBeforeSave") === "on",
      publishOnSave: formData.get("publishOnSave") === "on",
    };
  }

  async function handleSubmit() {
    if (isSubmitting()) {
      return false;
    }

    const form = readFormFromDom();

    setEditViewForm(form);
    patchSaveDraft(form);
    clearEditViewErrors();
    setEditViewServerError("");
    clearEditViewSuccess();

    const errors = validateForm(form);

    if (Object.keys(errors).length) {
      setEditViewErrors(errors);
      rerender();
      showToast("Revisa los campos obligatorios.", "warning");
      return false;
    }

    const payload = getPayloadFromForm();

    setEditViewSubmitting(true);
    setSaving(true);
    rerender();

    try {
      if (form.validateBeforeSave) {
        try {
          await validateAjustes(payload);
        } catch (error) {
          safeWarn("validateAjustes falló:", error);
        }
      }

      const result =
        currentMode === "edit" && safeText(payload.settingId, "")
          ? await updateAjuste(payload.settingId, payload)
          : await createAjuste(payload);

      const savedId = safeText(
        result?.settingId || result?.id || payload.settingId,
        ""
      );

      setEditViewSuccess({
        savedSettingId: savedId,
        successMessage:
          currentMode === "edit"
            ? "Ajuste actualizado correctamente."
            : "Ajuste creado correctamente.",
      });

      if (result) {
        currentItem = result;
        currentMode = "edit";
        setFormFromItem(result);
      }

      showToast(
        currentMode === "edit"
          ? "Ajuste guardado."
          : "Ajuste creado.",
        "success"
      );

      safeEmit("ajustes:edit:success", {
        mode: currentMode,
        detail: result,
        settingId: savedId,
      });

      rerender();

      return result;
    } catch (error) {
      const message = safeText(
        error?.message ||
          error?.response?.message ||
          error?.data?.message,
        currentMode === "edit"
          ? "No se pudo actualizar el ajuste."
          : "No se pudo crear el ajuste."
      );

      setEditViewServerError(message);
      showToast(message, "error");
      rerender();

      return false;
    } finally {
      setEditViewSubmitting(false);
      setSaving(false);
    }
  }

  /* =====================================================
     BIND
  ===================================================== */

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      const cancelBtn = event.target.closest('[data-action="edit-cancel"]');
      if (cancelBtn) {
        event.preventDefault();
        close();
        return;
      }

      const submitBtn = event.target.closest('[data-action="edit-submit"]');
      if (submitBtn) {
        event.preventDefault();
        await handleSubmit();
        return;
      }
    };

    const onChange = (event) => {
      const target = event.target;
      if (!target || !target.name) {
        return;
      }

      const form = readFormFromDom();
      setEditViewForm(form);
      patchSaveDraft(form);
    };

    container.addEventListener("click", onClick);
    container.addEventListener("change", onChange);
    container.addEventListener("input", onChange);

    return () => {
      container.removeEventListener("click", onClick);
      container.removeEventListener("change", onChange);
      container.removeEventListener("input", onChange);
    };
  }

  function bind() {
    cleanupBindings();

    const container = getContainer();
    const cleanups = [];

    cleanups.push(bindNativeActions(container));

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =====================================================
     PUBLIC
  ===================================================== */

  function init(options = {}) {
    destroyed = false;
    initialized = true;

    if (safeText(options?.mode, "") === "edit") {
      currentMode = "edit";
    }

    if (options?.item) {
      currentItem = safeObject(options.item);
      setFormFromItem(currentItem);
    } else if (!safeObject(ajustesState?.editView?.form).key) {
      setFormFromItem({});
    }

    rerender();
    safeLog("init");

    return api;
  }

  function open(item = null) {
    destroyed = false;
    initialized = true;

    currentItem = item ? safeObject(item) : null;
    currentMode = currentItem ? "edit" : "create";

    if (currentItem) {
      setFormFromItem(currentItem);
    } else {
      resetEditViewState();
      clearSaveDraft();
      setFormFromItem({});
    }

    rerender();
    safeEmit("ajustes:edit:open", {
      mode: currentMode,
      item: currentItem,
    });

    return api;
  }

  function close() {
    cleanupBindings();

    safeEmit("ajustes:edit:close", {
      mode: currentMode,
    });

    const back = getBackHandler();
    back();

    return true;
  }

  function destroy() {
    destroyed = true;
    initialized = false;
    cleanupBindings();

    safeLog("destroy");

    return true;
  }

  const api = {
    init,
    open,
    close,
    destroy,
    render: rerender,
    submit: handleSubmit,

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },

    get mode() {
      return currentMode;
    },

    get item() {
      return currentItem;
    },
  };

  return api;
})();

export default AjustesEditView;
