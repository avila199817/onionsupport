/* =========================================================
   Onion SPA - Shared Password Field Template
   Archivo: src/shared/password-field/password-field.template.js

   ONION SUPPORT · SHARED PASSWORD FIELD TEMPLATE
   CSP CLEAN · NO INLINE STYLE · STABLE DOM CONTRACT · 16/10

   Responsabilidades:
   - centralizar el markup reutilizable de campos password
   - evitar duplicación entre login / reset / settings / profile
   - exponer iconos eye / eye-off / caps
   - soportar indicador caps opcional por campo
   - mantener estructura estable para password-field.dom.js
   - alinear IDs/data-hooks con login.dom.js
   - aceptar aliases legacy/modernos de opciones
   - no generar estilos inline
   - no usar handlers inline
   - no exponer HTML inyectable

   Contrato DOM estable:
   - [data-password-field="true"]
   - [data-password-wrapper="true"]
   - [data-password-input="true"]
   - [data-password-toggle="true"]
   - [data-password-toggle-icon="true"]
   - [data-password-caps="true"]
   - data-show-label / data-hide-label
   - aria-controls apunta al input
========================================================= */

/* =========================================================
   VERSION
========================================================= */

export const PASSWORD_FIELD_TEMPLATE_VERSION =
  "16.0.0-extreme-pro";

/* =========================================================
   DEFAULTS
========================================================= */

const DEFAULT_INPUT_ID =
  "passwordInput";

const DEFAULT_INPUT_NAME =
  "password";

const DEFAULT_FIELD_CLASS =
  "login-field";

const DEFAULT_WRAPPER_CLASS =
  "password-wrapper";

const DEFAULT_INPUT_CLASS =
  "input-text";

const DEFAULT_TOGGLE_CLASS =
  "password-toggle";

const DEFAULT_TOGGLE_ICON_CLASS =
  "password-toggle-icon";

const DEFAULT_CAPS_CLASS =
  "caps-indicator";

const DEFAULT_CAPS_ICON_CLASS =
  "caps-icon";

const DEFAULT_CAPS_LABEL_CLASS =
  "caps-label";

const DEFAULT_PLACEHOLDER =
  "Contraseña";

const DEFAULT_ARIA_LABEL =
  "Contraseña";

const DEFAULT_AUTOCOMPLETE =
  "current-password";

const DEFAULT_FIELD_DATA_NAME =
  "password";

const DEFAULT_SHOW_LABEL =
  "Mostrar contraseña";

const DEFAULT_HIDE_LABEL =
  "Ocultar contraseña";

const DEFAULT_CAPS_LABEL =
  "Bloq Mayús";

/* =========================================================
   BASIC HELPERS
========================================================= */

function fallbackEscapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value, fallback = {}) {
  return isPlainObject(value)
    ? value
    : fallback;
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeRawText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  return String(value);
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === "string") {
    const clean =
      value.trim().toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "on",
        "enabled",
      ].includes(clean)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "disabled",
      ].includes(clean)
    ) {
      return false;
    }
  }

  return Boolean(fallback);
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function createEscaper(escapeHtml = fallbackEscapeHtml) {
  if (!isFunction(escapeHtml)) {
    return fallbackEscapeHtml;
  }

  return (value = "") => {
    try {
      return String(
        escapeHtml(
          String(value ?? "")
        )
      );
    } catch {
      return fallbackEscapeHtml(value);
    }
  };
}

function normalizeId(value = "", fallback = "") {
  const raw =
    safeText(value, fallback);

  if (!raw) {
    return "";
  }

  return raw
    .replace(/[^\w:.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 120);
}

function normalizeName(value = "", fallback = "") {
  const raw =
    safeText(value, fallback);

  if (!raw) {
    return "";
  }

  return raw
    .replace(/[^\w[\].:-]/g, "")
    .slice(0, 120);
}

function normalizeDataName(value = "", fallback = DEFAULT_FIELD_DATA_NAME) {
  const raw =
    safeText(value, fallback);

  if (!raw) {
    return DEFAULT_FIELD_DATA_NAME;
  }

  return raw
    .replace(/[^\w.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80) || DEFAULT_FIELD_DATA_NAME;
}

function normalizeClassName(value = "", fallback = "") {
  const raw =
    safeText(value, fallback);

  if (!raw) {
    return "";
  }

  return raw
    .split(/\s+/)
    .map((part) =>
      part
        .replace(/[^\w:-]/g, "")
        .trim()
    )
    .filter(Boolean)
    .join(" ")
    .slice(0, 400);
}

function uniqueClassName(...values) {
  const output = [];
  const seen = new Set();

  for (const value of values) {
    const classes =
      normalizeClassName(value, "")
        .split(/\s+/)
        .filter(Boolean);

    for (const className of classes) {
      if (!seen.has(className)) {
        seen.add(className);
        output.push(className);
      }
    }
  }

  return output.join(" ");
}

function normalizeAutocomplete(value = DEFAULT_AUTOCOMPLETE) {
  const clean =
    safeText(value, DEFAULT_AUTOCOMPLETE)
      .toLowerCase()
      .replace(/[^\w -]/g, "")
      .slice(0, 80);

  return clean || DEFAULT_AUTOCOMPLETE;
}

function normalizeInputType(value = "password") {
  const clean =
    safeText(value, "password")
      .toLowerCase();

  return clean === "text"
    ? "text"
    : "password";
}

function normalizeAriaDescribedBy(...values) {
  const ids = [];

  for (const value of values.flat(Infinity)) {
    const clean =
      normalizeId(value, "");

    if (
      clean &&
      !ids.includes(clean)
    ) {
      ids.push(clean);
    }
  }

  return ids.join(" ");
}

function booleanAttr(name = "", value = false) {
  return value
    ? ` ${name}`
    : "";
}

function attr(name = "", value = "", escape = fallbackEscapeHtml) {
  const attrName =
    safeText(name, "");

  if (!attrName) {
    return "";
  }

  if (
    value === null ||
    value === undefined ||
    value === false ||
    value === ""
  ) {
    return "";
  }

  if (value === true) {
    return ` ${attrName}`;
  }

  return ` ${attrName}="${escape(value)}"`;
}

function dataAttr(name = "", value = "", escape = fallbackEscapeHtml) {
  const cleanName =
    safeText(name, "")
      .replace(/[^\w-]/g, "")
      .replace(/^-+|-+$/g, "");

  if (!cleanName) {
    return "";
  }

  return attr(
    `data-${cleanName}`,
    value,
    escape
  );
}

/* =========================================================
   ICONS
========================================================= */

export function getEyeIcon() {
  return `
    <svg
      class="password-eye-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
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

export function getEyeOffIcon() {
  return `
    <svg
      class="password-eye-off-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
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
   OPTION NORMALIZATION
========================================================= */

function normalizePasswordFieldOptions(options = {}) {
  const opts =
    safeObject(options);

  const escape =
    createEscaper(opts.escapeHtml);

  const fieldDataName =
    normalizeDataName(
      opts.fieldDataName ??
        opts.dataField ??
        opts.field ??
        opts.role ??
        DEFAULT_FIELD_DATA_NAME,
      DEFAULT_FIELD_DATA_NAME
    );

  const inputName =
    normalizeName(
      opts.fieldName ??
        opts.name ??
        opts.inputName ??
        fieldDataName ??
        DEFAULT_INPUT_NAME,
      DEFAULT_INPUT_NAME
    );

  const inputId =
    normalizeId(
      opts.inputId ??
        opts.id ??
        opts.fieldId ??
        opts.passwordId ??
        inputName ??
        DEFAULT_INPUT_ID,
      DEFAULT_INPUT_ID
    );

  const fieldRootId =
    normalizeId(
      opts.fieldRootId ??
        opts.rootId ??
        "",
      ""
    );

  const wrapperId =
    normalizeId(
      opts.wrapperId ??
        "",
      ""
    );

  const toggleId =
    normalizeId(
      opts.toggleId ??
        opts.buttonId ??
        opts.toggleButtonId ??
        `${inputId}Toggle`,
      `${inputId}Toggle`
    );

  const capsId =
    normalizeId(
      opts.capsId ??
        opts.capsIndicatorId ??
        `${inputId}CapsIndicator`,
      `${inputId}CapsIndicator`
    );

  const helpId =
    normalizeId(
      opts.helpId ??
        opts.describedBy ??
        "",
      ""
    );

  const errorId =
    normalizeId(
      opts.errorId ??
        "",
      ""
    );

  const showCapsIndicator =
    opts.showCapsIndicator !== false &&
    opts.caps !== false &&
    opts.showCaps !== false;

  const showToggle =
    opts.showToggle !== false &&
    opts.toggle !== false &&
    opts.showPasswordToggle !== false;

  const disabled =
    safeBoolean(
      opts.disabled,
      false
    );

  const readonly =
    safeBoolean(
      opts.readonly ??
        opts.readOnly,
      false
    );

  const required =
    opts.required !== false;

  const ariaDescribedBy =
    normalizeAriaDescribedBy(
      opts.ariaDescribedBy,
      opts["aria-describedby"],
      helpId,
      errorId
    );

  return {
    escape,

    fieldRootId,
    wrapperId,
    inputId,
    inputName,
    toggleId,
    capsId,
    helpId,
    errorId,

    fieldDataName,

    fieldClass:
      uniqueClassName(
        DEFAULT_FIELD_CLASS,
        opts.fieldClass,
        opts.rootClass
      ) || DEFAULT_FIELD_CLASS,

    wrapperClass:
      uniqueClassName(
        DEFAULT_WRAPPER_CLASS,
        opts.wrapperClass
      ) || DEFAULT_WRAPPER_CLASS,

    inputClass:
      uniqueClassName(
        DEFAULT_INPUT_CLASS,
        opts.inputClass
      ) || DEFAULT_INPUT_CLASS,

    toggleClass:
      uniqueClassName(
        DEFAULT_TOGGLE_CLASS,
        opts.toggleClass
      ) || DEFAULT_TOGGLE_CLASS,

    toggleIconClass:
      uniqueClassName(
        DEFAULT_TOGGLE_ICON_CLASS,
        opts.toggleIconClass
      ) || DEFAULT_TOGGLE_ICON_CLASS,

    capsClass:
      uniqueClassName(
        DEFAULT_CAPS_CLASS,
        opts.capsClass
      ) || DEFAULT_CAPS_CLASS,

    capsIconClass:
      uniqueClassName(
        DEFAULT_CAPS_ICON_CLASS,
        opts.capsIconClass
      ) || DEFAULT_CAPS_ICON_CLASS,

    capsLabelClass:
      uniqueClassName(
        DEFAULT_CAPS_LABEL_CLASS,
        opts.capsLabelClass
      ) || DEFAULT_CAPS_LABEL_CLASS,

    label:
      safeText(
        opts.label ??
          opts.fieldLabel ??
          "",
        ""
      ),

    labelClass:
      uniqueClassName(
        "password-label",
        opts.labelClass
      ),

    placeholder:
      safeText(
        opts.placeholder,
        DEFAULT_PLACEHOLDER
      ),

    ariaLabel:
      safeText(
        opts.ariaLabel ??
          opts["aria-label"] ??
          opts.label ??
          DEFAULT_ARIA_LABEL,
        DEFAULT_ARIA_LABEL
      ),

    autocomplete:
      normalizeAutocomplete(
        opts.autocomplete ||
          DEFAULT_AUTOCOMPLETE
      ),

    inputType:
      normalizeInputType(
        opts.type ||
          "password"
      ),

    value:
      safeRawText(
        opts.value,
        ""
      ),

    required,
    disabled,
    readonly,

    minlength:
      safeNumber(
        opts.minlength ??
          opts.minLength,
        0
      ),

    maxlength:
      safeNumber(
        opts.maxlength ??
          opts.maxLength,
        0
      ),

    showCapsIndicator,
    showToggle,

    capsLabel:
      safeText(
        opts.capsLabel,
        DEFAULT_CAPS_LABEL
      ),

    toggleLabelShow:
      safeText(
        opts.toggleLabelShow ??
          opts.showLabel ??
          opts.showPasswordLabel,
        DEFAULT_SHOW_LABEL
      ),

    toggleLabelHide:
      safeText(
        opts.toggleLabelHide ??
          opts.hideLabel ??
          opts.hidePasswordLabel,
        DEFAULT_HIDE_LABEL
      ),

    ariaDescribedBy,
  };
}

/* =========================================================
   RENDER HELPERS
========================================================= */

function renderLabel(options = {}) {
  const {
    escape,
    label,
    labelClass,
    inputId,
  } = options;

  if (!label) {
    return "";
  }

  return `
    <label
      class="${escape(labelClass)}"
      for="${escape(inputId)}"
      data-password-label="true"
    >
      ${escape(label)}
    </label>
  `;
}

function renderCapsIndicator(options = {}) {
  const {
    escape,
    showCapsIndicator,
    capsId,
    capsClass,
    capsIconClass,
    capsLabelClass,
    capsLabel,
  } = options;

  if (!showCapsIndicator) {
    return "";
  }

  return `
    <span
      id="${escape(capsId)}"
      class="${escape(capsClass)}"
      role="status"
      aria-live="polite"
      aria-hidden="true"
      hidden
      data-password-caps="true"
      data-login-caps="true"
    >
      <span
        class="${escape(capsIconClass)}"
        aria-hidden="true"
        data-password-caps-icon-wrapper="true"
      >
        ${getCapsIcon()}
      </span>

      <span
        class="${escape(capsLabelClass)}"
        data-password-caps-label="true"
      >
        ${escape(capsLabel)}
      </span>
    </span>
  `;
}

function renderToggleButton(options = {}) {
  const {
    escape,
    showToggle,
    toggleId,
    toggleClass,
    toggleIconClass,
    inputId,
    toggleLabelShow,
    toggleLabelHide,
  } = options;

  if (!showToggle) {
    return "";
  }

  return `
    <button
      id="${escape(toggleId)}"
      class="${escape(toggleClass)}"
      type="button"
      aria-label="${escape(toggleLabelShow)}"
      aria-pressed="false"
      aria-controls="${escape(inputId)}"
      data-password-toggle="true"
      data-login-password-toggle="true"
      data-show-label="${escape(toggleLabelShow)}"
      data-hide-label="${escape(toggleLabelHide)}"
    >
      <span
        class="${escape(toggleIconClass)}"
        aria-hidden="true"
        data-password-toggle-icon="true"
        data-state="hidden"
      >
        ${getEyeIcon()}
      </span>
    </button>
  `;
}

function renderPasswordInput(options = {}) {
  const {
    escape,
    inputId,
    inputName,
    inputClass,
    inputType,
    placeholder,
    ariaLabel,
    autocomplete,
    value,
    required,
    disabled,
    readonly,
    minlength,
    maxlength,
    fieldDataName,
    ariaDescribedBy,
  } = options;

  return `
    <input
      class="${escape(inputClass)}"
      id="${escape(inputId)}"
      name="${escape(inputName)}"
      type="${escape(inputType)}"
      autocomplete="${escape(autocomplete)}"
      autocapitalize="none"
      autocorrect="off"
      spellcheck="false"
      placeholder="${escape(placeholder)}"
      aria-label="${escape(ariaLabel)}"
      value="${escape(value)}"
      data-password-input="true"
      data-login-password="true"
      data-password-role="${escape(fieldDataName)}"
      ${required ? "required" : ""}
      ${disabled ? "disabled" : ""}
      ${readonly ? "readonly" : ""}
      ${ariaDescribedBy ? `aria-describedby="${escape(ariaDescribedBy)}"` : ""}
      ${minlength > 0 ? `minlength="${escape(minlength)}"` : ""}
      ${maxlength > 0 ? `maxlength="${escape(maxlength)}"` : ""}
    />
  `;
}

/* =========================================================
   MAIN RENDERER
========================================================= */

export function renderPasswordField(options = {}) {
  const data =
    normalizePasswordFieldOptions(options);

  const {
    escape,
    fieldRootId,
    wrapperId,
    inputId,
    fieldClass,
    wrapperClass,
    fieldDataName,
  } = data;

  return `
    <div
      ${fieldRootId ? `id="${escape(fieldRootId)}"` : ""}
      class="${escape(fieldClass)}"
      data-field="${escape(fieldDataName)}"
      data-login-field="${escape(fieldDataName)}"
      data-password-field="true"
      data-password-field-version="${escape(PASSWORD_FIELD_TEMPLATE_VERSION)}"
    >
      ${renderLabel(data)}

      <div
        ${wrapperId ? `id="${escape(wrapperId)}"` : ""}
        class="${escape(wrapperClass)}"
        data-password-wrapper="true"
        data-password-for="${escape(inputId)}"
      >
        ${renderPasswordInput(data)}

        ${renderCapsIndicator(data)}

        ${renderToggleButton(data)}
      </div>
    </div>
  `;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default renderPasswordField;
