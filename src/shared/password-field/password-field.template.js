/* =========================================================
   Onion SPA - Shared Password Field Template
   Archivo: src/shared/password-field/password-field.template.js

   Responsabilidad:
   - Renderer puro del password-field compartido.
   - Pintar label + input + toggle eye.
   - Sin DOM.
   - Sin listeners.
   - Sin AppCore.
   - Sin CSS inline.
   - Sin handlers inline.
   - Sin CapsLock.
   - Sin lógica duplicada.
========================================================= */

export const PASSWORD_FIELD_TEMPLATE_VERSION = "minimal-1";

const DEFAULT_INPUT_ID = "passwordInput";
const DEFAULT_INPUT_NAME = "password";
const DEFAULT_FIELD_CLASS = "login-field";
const DEFAULT_WRAPPER_CLASS = "password-wrapper";
const DEFAULT_INPUT_CLASS = "input-text";
const DEFAULT_TOGGLE_CLASS = "password-toggle";
const DEFAULT_TOGGLE_ICON_CLASS = "password-toggle-icon";
const DEFAULT_LABEL_CLASS = "password-label";
const DEFAULT_PLACEHOLDER = "Contraseña";
const DEFAULT_AUTOCOMPLETE = "current-password";
const DEFAULT_FIELD_DATA_NAME = "password";
const DEFAULT_SHOW_LABEL = "Mostrar contraseña";
const DEFAULT_HIDE_LABEL = "Ocultar contraseña";

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

function cleanDataName(value = "", fallback = DEFAULT_FIELD_DATA_NAME) {
  return text(value, fallback)
    .replace(/[^\w.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80) || fallback;
}

function cleanClass(value = "", fallback = "") {
  return text(value, fallback)
    .split(/\s+/)
    .map((item) => item.replace(/[^\w:-]/g, "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 300);
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

function attr(name = "", value = "") {
  const key = text(name, "");

  if (!key) return "";
  if (value === null || value === undefined || value === false || value === "") return "";
  if (value === true) return ` ${key}`;

  return ` ${key}="${escapeHtml(value)}"`;
}

function dataAttrs(attrs = {}) {
  if (!isObject(attrs)) return "";

  return Object.entries(attrs)
    .map(([key, value]) => {
      const cleanKey = cleanDataKey(key);
      if (!cleanKey) return "";
      return attr(`data-${cleanKey}`, value === true ? "true" : value);
    })
    .join("");
}

function numberAttr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number) : fallback ? String(fallback) : "";
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

/* Compat: se mantiene exportado, pero el template mínimo no renderiza CapsLock. */
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
   NORMALIZATION
========================================================= */

function normalizeOptions(options = {}) {
  const opts = isObject(options) ? options : {};

  const fieldDataName = cleanDataName(
    opts.fieldDataName ?? opts.dataField ?? opts.field,
    DEFAULT_FIELD_DATA_NAME
  );

  const inputName = cleanName(
    opts.name ?? opts.inputName ?? opts.fieldName ?? fieldDataName,
    DEFAULT_INPUT_NAME
  );

  const inputId = cleanId(
    opts.id ?? opts.inputId ?? opts.fieldId ?? opts.passwordId ?? inputName,
    DEFAULT_INPUT_ID
  );

  const label = text(opts.label ?? opts.fieldLabel, "");
  const placeholder = text(opts.placeholder, DEFAULT_PLACEHOLDER);

  return {
    fieldDataName,

    inputId,
    inputName,

    wrapperId: cleanId(opts.wrapperId, ""),
    fieldRootId: cleanId(opts.fieldRootId ?? opts.rootId, ""),
    toggleId: cleanId(opts.toggleId ?? opts.buttonId ?? `${inputId}Toggle`, `${inputId}Toggle`),

    fieldClass: cleanClass(
      opts.fieldClass ?? opts.rootClass ?? opts.rootClassName ?? opts.fieldClassName,
      DEFAULT_FIELD_CLASS
    ),

    wrapperClass: cleanClass(
      opts.wrapperClass ?? opts.wrapperClassName,
      DEFAULT_WRAPPER_CLASS
    ),

    inputClass: cleanClass(
      opts.inputClass ?? opts.inputClassName,
      DEFAULT_INPUT_CLASS
    ),

    labelClass: cleanClass(
      opts.labelClass ?? opts.labelClassName,
      DEFAULT_LABEL_CLASS
    ),

    toggleClass: cleanClass(
      opts.toggleClass ?? opts.toggleClassName,
      DEFAULT_TOGGLE_CLASS
    ),

    toggleIconClass: cleanClass(
      opts.toggleIconClass ?? opts.toggleIconClassName,
      DEFAULT_TOGGLE_ICON_CLASS
    ),

    label,
    placeholder,
    ariaLabel: text(opts.ariaLabel ?? opts["aria-label"] ?? label ?? placeholder, DEFAULT_PLACEHOLDER),
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

    showLabel: text(
      opts.toggleLabelShow ?? opts.showLabel ?? opts.showPasswordLabel,
      DEFAULT_SHOW_LABEL
    ),

    hideLabel: text(
      opts.toggleLabelHide ?? opts.hideLabel ?? opts.hidePasswordLabel,
      DEFAULT_HIDE_LABEL
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
  };
}

/* =========================================================
   RENDER PARTS
========================================================= */

function renderLabel(data) {
  if (!data.label) return "";

  return `
    <label
      class="${escapeHtml(data.labelClass)}"
      for="${escapeHtml(data.inputId)}"
      data-password-label="true"
    >
      ${escapeHtml(data.label)}
    </label>
  `;
}

function renderInput(data) {
  const inputDataAttrs = {
    ...data.inputDataAttrs,

    passwordInput: true,
    loginPassword: true,
    passwordRole: data.fieldDataName,
  };

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
      ${data.required ? "required" : ""}
      ${data.disabled ? "disabled" : ""}
      ${data.readonly ? "readonly" : ""}
      ${data.minlength ? `minlength="${escapeHtml(data.minlength)}"` : ""}
      ${data.maxlength ? `maxlength="${escapeHtml(data.maxlength)}"` : ""}
      ${dataAttrs(inputDataAttrs)}
    />
  `;
}

function renderToggle(data) {
  if (!data.showToggle) return "";

  const toggleDataAttrs = {
    ...data.toggleDataAttrs,

    passwordToggle: true,
    loginPasswordToggle: true,
    showLabel: data.showLabel,
    hideLabel: data.hideLabel,
  };

  return `
    <button
      id="${escapeHtml(data.toggleId)}"
      class="${escapeHtml(data.toggleClass)}"
      type="button"
      aria-label="${escapeHtml(data.showLabel)}"
      aria-pressed="false"
      aria-controls="${escapeHtml(data.inputId)}"
      ${data.disabled ? "disabled" : ""}
      ${dataAttrs(toggleDataAttrs)}
    >
      <span
        class="${escapeHtml(data.toggleIconClass)}"
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

/* =========================================================
   MAIN RENDERER
========================================================= */

export function renderPasswordField(options = {}) {
  const data = normalizeOptions(options);

  const rootDataAttrs = {
    ...data.rootDataAttrs,

    field: data.fieldDataName,
    loginField: data.fieldDataName,
    passwordField: true,
    passwordFieldVersion: PASSWORD_FIELD_TEMPLATE_VERSION,
  };

  const wrapperDataAttrs = {
    ...data.wrapperDataAttrs,

    passwordWrapper: true,
    passwordFor: data.inputId,
  };

  return `
    <div
      ${data.fieldRootId ? `id="${escapeHtml(data.fieldRootId)}"` : ""}
      class="${escapeHtml(data.fieldClass)}"
      ${dataAttrs(rootDataAttrs)}
    >
      ${renderLabel(data)}

      <div
        ${data.wrapperId ? `id="${escapeHtml(data.wrapperId)}"` : ""}
        class="${escapeHtml(data.wrapperClass)}"
        ${dataAttrs(wrapperDataAttrs)}
      >
        ${renderInput(data)}
        ${renderToggle(data)}
      </div>
    </div>
  `;
}

export default renderPasswordField;
