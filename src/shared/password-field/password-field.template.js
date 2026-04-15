/* =========================================================
   Onion SPA - Shared Password Field Template
   Archivo: src/shared/password-field/password-field.template.js

   Responsabilidades:
   - centralizar el markup reutilizable de campos password
   - evitar duplicación entre login / reset / settings / profile
   - exponer iconos eye / eye-off / caps
   - soportar indicador caps opcional por campo
   - mantener estructura estable para password-field.dom.js
========================================================= */

function fallbackEscapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getEyeIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
      <path
        d="M2.75 12s3.25-6 9.25-6 9.25 6 9.25 6-3.25 6-9.25 6-9.25-6-9.25-6Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.7"
        stroke="currentColor"
        stroke-width="1.8"
      />
    </svg>
  `;
}

export function getEyeOffIcon() {
  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18">
      <path
        d="M3.5 4.5 20.5 19.5"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <path
        d="M10.58 5.63A10.5 10.5 0 0 1 12 5.55c6 0 9.25 6 9.25 6a15.72 15.72 0 0 1-3.48 4.11"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M6.2 8.12A15.18 15.18 0 0 0 2.75 11.55s3.25 6 9.25 6c1.36 0 2.59-.3 3.7-.79"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M9.88 9.96A2.9 2.9 0 0 0 9.3 11.7a2.7 2.7 0 0 0 4.57 1.96"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

export function getCapsIcon() {
  return `
    <svg
      class="caps-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      width="16"
      height="16"
    >
      <path
        d="M12 4.5 6.5 10H10v6h4v-6h3.5L12 4.5Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
      <path
        d="M8 18.5h8"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  `;
}

export function renderPasswordField(options = {}) {
  const {
    escapeHtml = fallbackEscapeHtml,
    fieldId = "",
    fieldName = "",
    placeholder = "",
    ariaLabel = "",
    autocomplete = "current-password",
    wrapperClass = "password-wrapper",
    inputClass = "input-text",
    fieldClass = "login-field",
    fieldDataName = "password",
    required = true,
    showCapsIndicator = true,
    capsLabel = "Bloq Mayús",
    toggleLabelShow = "Mostrar contraseña",
    toggleLabelHide = "Ocultar contraseña",
    value = "",
  } = options;

  const requiredAttr = required ? "required" : "";
  const finalFieldId = escapeHtml(fieldId);
  const finalFieldName = escapeHtml(fieldName);
  const finalPlaceholder = escapeHtml(placeholder);
  const finalAriaLabel = escapeHtml(ariaLabel);
  const finalAutocomplete = escapeHtml(autocomplete);
  const finalValue = escapeHtml(value);
  const finalFieldClass = escapeHtml(fieldClass);
  const finalWrapperClass = escapeHtml(wrapperClass);
  const finalInputClass = escapeHtml(inputClass);
  const finalFieldDataName = escapeHtml(fieldDataName);
  const finalShowLabel = escapeHtml(toggleLabelShow);
  const finalHideLabel = escapeHtml(toggleLabelHide);
  const finalCapsLabel = escapeHtml(capsLabel);

  return `
    <div
      class="${finalFieldClass}"
      data-field="${finalFieldDataName}"
      data-password-field="true"
    >
      <div class="${finalWrapperClass}">
        <input
          class="${finalInputClass}"
          id="${finalFieldId}"
          name="${finalFieldName}"
          type="password"
          autocomplete="${finalAutocomplete}"
          placeholder="${finalPlaceholder}"
          aria-label="${finalAriaLabel}"
          value="${finalValue}"
          ${requiredAttr}
          data-password-input="true"
        />

        ${
          showCapsIndicator
            ? `
              <span
                class="caps-indicator"
                aria-hidden="true"
                hidden
                data-password-caps="true"
              >
                ${getCapsIcon()}
                <span class="caps-label">${finalCapsLabel}</span>
              </span>
            `
            : ""
        }

        <button
          class="password-toggle"
          type="button"
          aria-label="${finalShowLabel}"
          aria-pressed="false"
          data-password-toggle="true"
          data-show-label="${finalShowLabel}"
          data-hide-label="${finalHideLabel}"
        >
          ${getEyeIcon()}
        </button>
      </div>
    </div>
  `;
}

export default renderPasswordField;
