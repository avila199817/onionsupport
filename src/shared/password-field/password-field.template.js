/* =========================================================
   Onion SPA - Shared Password Field Template
   Archivo: src/shared/password-field/password-field.template.js

   Responsabilidad:
   - Renderer puro del password-field compartido.
   - Pintar label + input password + toggle eye.
   - Pintar CapsLock opcional.
   - Sin DOM.
   - Sin listeners.
   - Sin AppCore.
   - Sin CSS inline.
   - Sin handlers inline.
   - Sin lógica duplicada.
========================================================= */

export const PASSWORD_FIELD_TEMPLATE_VERSION = "minimal-4";

const DEFAULT_ID = "passwordInput";
const DEFAULT_NAME = "password";
const DEFAULT_FIELD_CLASS = "login-field";
const DEFAULT_WRAPPER_CLASS = "password-wrapper";
const DEFAULT_INPUT_CLASS = "input-text";
const DEFAULT_LABEL_CLASS = "password-label";
const DEFAULT_TOGGLE_CLASS = "password-toggle";
const DEFAULT_ICON_CLASS = "password-toggle-icon";
const DEFAULT_CAPS_CLASS = "password-caps";
const DEFAULT_CAPS_ICON_CLASS = "caps-icon";
const DEFAULT_CAPS_LABEL_CLASS = "caps-label";
const DEFAULT_PLACEHOLDER = "Contraseña";
const DEFAULT_AUTOCOMPLETE = "current-password";
const DEFAULT_SHOW_LABEL = "Mostrar contraseña";
const DEFAULT_HIDE_LABEL = "Ocultar contraseña";
const DEFAULT_CAPS_LABEL = "Bloq Mayús";

/* =========================================================
   BASICS
========================================================= */

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function rawText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const clean = text(value, "").toLowerCase();

  if (["1", "true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["0", "false", "no", "off"].includes(clean)) return false;

  return fallback;
}

function cleanId(value = "", fallback = "") {
  return text(value, fallback)
    .replace(/[^\w:.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120);
}

function cleanName(value = "", fallback = "") {
  return text(value, fallback)
    .replace(/[^\w[\].:-]/g, "")
    .slice(0, 120);
}

function cleanClass(value = "", fallback = "") {
  return text(value, fallback)
    .split(/\s+/)
    .map((item) => item.replace(/[^\w:-]/g, "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
}

function cleanDataName(value = "", fallback = "password") {
  return text(value, fallback)
    .replace(/[^\w.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80) || fallback;
}

function cleanDataKey(value = "") {
  return text(value, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function dataAttrs(attrs = {}, blocked = []) {
  if (!isObject(attrs)) return "";

  const blockedKeys = new Set(blocked.map(cleanDataKey));

  return Object.entries(attrs)
    .map(([key, value]) => {
      const dataKey = cleanDataKey(key);

      if (!dataKey || blockedKeys.has(dataKey)) return "";
      if (value === null || value === undefined || value === false || value === "") return "";

      return ` data-${dataKey}="${escapeHtml(value === true ? "true" : value)}"`;
    })
    .join("");
}

function numberAttr(value = "") {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number) : "";
}

/* =========================================================
   ICONS
========================================================= */

export function getEyeIcon(options = {}) {
  const hidden = bool(options.hidden, false);

  return `
    <svg
      class="password-eye-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      ${hidden ? "hidden" : ""}
    >
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

export function getEyeOffIcon(options = {}) {
  const hidden = bool(options.hidden, false);

  return `
    <svg
      class="password-eye-off-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      ${hidden ? "hidden" : ""}
    >
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
      data-password-caps-icon="true"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
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

/* =========================================================
   OPTIONS
========================================================= */

function normalizeOptions(options = {}) {
  const opts = isObject(options) ? options : {};

  const fieldDataName = cleanDataName(
    opts.fieldDataName || opts.dataField || opts.field,
    "password"
  );

  const inputName = cleanName(
    opts.name || opts.inputName || opts.fieldName || fieldDataName,
    DEFAULT_NAME
  );

  const inputId = cleanId(
    opts.id || opts.inputId || opts.fieldId || opts.passwordId || inputName,
    DEFAULT_ID
  );

  const label = text(opts.label || opts.fieldLabel, "");
  const placeholder = text(opts.placeholder, DEFAULT_PLACEHOLDER);

  return {
    fieldDataName,

    inputId,
    inputName,

    toggleId: cleanId(opts.toggleId || opts.buttonId || `${inputId}Toggle`, `${inputId}Toggle`),
    capsId: cleanId(opts.capsId || opts.capsIndicatorId || `${inputId}Caps`, `${inputId}Caps`),
    fieldRootId: cleanId(opts.fieldRootId || opts.rootId, ""),
    wrapperId: cleanId(opts.wrapperId, ""),

    fieldClass: cleanClass(
      opts.fieldClass || opts.rootClass || opts.rootClassName || opts.fieldClassName,
      DEFAULT_FIELD_CLASS
    ),

    wrapperClass: cleanClass(
      opts.wrapperClass || opts.wrapperClassName,
      DEFAULT_WRAPPER_CLASS
    ),

    inputClass: cleanClass(
      opts.inputClass || opts.inputClassName,
      DEFAULT_INPUT_CLASS
    ),

    labelClass: cleanClass(
      opts.labelClass || opts.labelClassName,
      DEFAULT_LABEL_CLASS
    ),

    toggleClass: cleanClass(
      opts.toggleClass || opts.toggleClassName,
      DEFAULT_TOGGLE_CLASS
    ),

    iconClass: cleanClass(
      opts.toggleIconClass || opts.toggleIconClassName,
      DEFAULT_ICON_CLASS
    ),

    capsClass: cleanClass(
      opts.capsClass || opts.capsClassName,
      DEFAULT_CAPS_CLASS
    ),

    capsIconClass: cleanClass(
      opts.capsIconClass || opts.capsIconClassName,
      DEFAULT_CAPS_ICON_CLASS
    ),

    capsLabelClass: cleanClass(
      opts.capsLabelClass || opts.capsLabelClassName,
      DEFAULT_CAPS_LABEL_CLASS
    ),

    label,
    placeholder,

    ariaLabel: text(
      opts.ariaLabel || opts["aria-label"] || label || placeholder,
      DEFAULT_PLACEHOLDER
    ),

    autocomplete: text(opts.autocomplete, DEFAULT_AUTOCOMPLETE),
    value: rawText(opts.value, ""),

    required: opts.required !== false,
    disabled: bool(opts.disabled, false),
    readonly: bool(opts.readonly ?? opts.readOnly, false),

    minlength: numberAttr(opts.minlength ?? opts.minLength),
    maxlength: numberAttr(opts.maxlength ?? opts.maxLength),

    showToggle:
      opts.showToggle !== false &&
      opts.toggle !== false &&
      opts.showPasswordToggle !== false,

    showCapsIndicator:
      opts.showCapsIndicator !== false &&
      opts.showCaps !== false &&
      opts.caps !== false,

    showLabel: text(
      opts.toggleLabelShow || opts.showLabel || opts.showPasswordLabel,
      DEFAULT_SHOW_LABEL
    ),

    hideLabel: text(
      opts.toggleLabelHide || opts.hideLabel || opts.hidePasswordLabel,
      DEFAULT_HIDE_LABEL
    ),

    capsLabel: text(
      opts.capsLabel || opts.capsText,
      DEFAULT_CAPS_LABEL
    ),

    rootDataAttrs: isObject(opts.rootDataAttrs)
      ? opts.rootDataAttrs
      : isObject(opts.fieldDataAttrs)
        ? opts.fieldDataAttrs
        : {},

    wrapperDataAttrs: isObject(opts.wrapperDataAttrs) ? opts.wrapperDataAttrs : {},

    inputDataAttrs: {
      ...(isObject(opts.dataAttrs) ? opts.dataAttrs : {}),
      ...(isObject(opts.inputDataAttrs) ? opts.inputDataAttrs : {}),
    },

    toggleDataAttrs: isObject(opts.toggleDataAttrs) ? opts.toggleDataAttrs : {},
    capsDataAttrs: isObject(opts.capsDataAttrs) ? opts.capsDataAttrs : {},
  };
}

/* =========================================================
   RENDER
========================================================= */

function renderLabel(data) {
  if (!data.label) return "";

  return `
    <label
      class="${escapeHtml(data.labelClass)}"
      for="${escapeHtml(data.inputId)}"
      data-password-label="true"
    >${escapeHtml(data.label)}</label>
  `;
}

function renderInput(data) {
  return `
    <input
      class="${escapeHtml(data.inputClass)}"
      id="${escapeHtml(data.inputId)}"
      name="${escapeHtml(data.inputName)}"
      type="password"
      autocomplete="${escapeHtml(data.autocomplete)}"
      autocapitalize="none"
      autocorrect="off"
      spellcheck="false"
      placeholder="${escapeHtml(data.placeholder)}"
      aria-label="${escapeHtml(data.ariaLabel)}"
      aria-invalid="false"
      value="${escapeHtml(data.value)}"
      data-password-input="true"
      data-login-password="true"
      data-password-role="${escapeHtml(data.fieldDataName)}"
      ${data.required ? "required" : ""}
      ${data.disabled ? "disabled" : ""}
      ${data.readonly ? "readonly" : ""}
      ${data.minlength ? `minlength="${escapeHtml(data.minlength)}"` : ""}
      ${data.maxlength ? `maxlength="${escapeHtml(data.maxlength)}"` : ""}
      ${dataAttrs(data.inputDataAttrs, [
        "password-input",
        "login-password",
        "password-role",
      ])}
    />
  `;
}

function renderToggle(data) {
  if (!data.showToggle) return "";

  return `
    <button
      id="${escapeHtml(data.toggleId)}"
      class="${escapeHtml(data.toggleClass)}"
      type="button"
      aria-label="${escapeHtml(data.showLabel)}"
      aria-pressed="false"
      aria-controls="${escapeHtml(data.inputId)}"
      data-password-toggle="true"
      data-login-password-toggle="true"
      data-show-label="${escapeHtml(data.showLabel)}"
      data-hide-label="${escapeHtml(data.hideLabel)}"
      ${data.disabled ? "disabled" : ""}
      ${dataAttrs(data.toggleDataAttrs, [
        "password-toggle",
        "login-password-toggle",
        "show-label",
        "hide-label",
      ])}
    >
      <span
        class="${escapeHtml(data.iconClass)}"
        aria-hidden="true"
        data-password-toggle-icon="true"
        data-state="hidden"
      >
        ${getEyeIcon()}
        ${getEyeOffIcon({ hidden: true })}
      </span>
    </button>
  `;
}

function renderCapsIndicator(data) {
  if (!data.showCapsIndicator) return "";

  return `
    <span
      id="${escapeHtml(data.capsId)}"
      class="${escapeHtml(data.capsClass)}"
      role="status"
      aria-live="polite"
      aria-hidden="true"
      hidden
      data-password-caps="true"
      data-login-caps="true"
      ${dataAttrs(data.capsDataAttrs, [
        "password-caps",
        "login-caps",
      ])}
    >
      <span
        class="${escapeHtml(data.capsIconClass)}"
        aria-hidden="true"
        data-password-caps-icon-wrapper="true"
      >${getCapsIcon()}</span>
      <span
        class="${escapeHtml(data.capsLabelClass)}"
        data-password-caps-label="true"
      >${escapeHtml(data.capsLabel)}</span>
    </span>
  `;
}

/* =========================================================
   MAIN RENDERER
========================================================= */

export function renderPasswordField(options = {}) {
  const data = normalizeOptions(options);

  return `
    <div
      ${data.fieldRootId ? `id="${escapeHtml(data.fieldRootId)}"` : ""}
      class="${escapeHtml(data.fieldClass)}"
      data-field="${escapeHtml(data.fieldDataName)}"
      data-login-field="${escapeHtml(data.fieldDataName)}"
      data-password-field="true"
      data-password-field-version="${escapeHtml(PASSWORD_FIELD_TEMPLATE_VERSION)}"
      ${dataAttrs(data.rootDataAttrs, [
        "field",
        "login-field",
        "password-field",
        "password-field-version",
      ])}
    >
      ${renderLabel(data)}

      <div
        ${data.wrapperId ? `id="${escapeHtml(data.wrapperId)}"` : ""}
        class="${escapeHtml(data.wrapperClass)}"
        data-password-wrapper="true"
        data-password-for="${escapeHtml(data.inputId)}"
        ${dataAttrs(data.wrapperDataAttrs, [
          "password-wrapper",
          "password-for",
        ])}
      >
        ${renderInput(data)}
        ${renderCapsIndicator(data)}
        ${renderToggle(data)}
      </div>
    </div>
  `;
}

export default renderPasswordField;
