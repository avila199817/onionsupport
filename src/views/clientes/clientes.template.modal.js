import { resolveAvatarPresentation } from "../../features/avatar-system/identity.js";
import { createModalLifecycle, restoreModalFocus } from "../../features/entity-overlay/modal-lifecycle.js";
/* =========================================================
   Onion Support - Clientes Detail Template
   Archivo: /src/views/clientes/clientes.template.modal.js

   PRODUCTIVO · READ ONLY · INDEX V6 / API V4 · V4

   Responsabilidad:
   - Renderizar el detalle de un cliente ya normalizado por clientes.api.js.
   - Mantener el contrato DOM/clases de /src/css/views/clientes/detail.css.
   - Mantener compatibilidad visual con aliases incidencias-modal-*.
   - Mantener bridge open/show/render/close consumido por clientes/index.js.
   - Ser una isla SPA segura: host propio, ownership propio y teardown seguro.
   - Mantener detalle estrictamente read-only:
       GET /api/clientes/:id
       SIN PATCH / PUT / DELETE.
   - Mostrar billing / privacy / audit legacy sólo si existen realmente.
   - No duplicar direcciones equivalentes.
   - Avatar runtime seguro: SAS permitido únicamente en Azure Blob.
   - Escape, focus trap, Escape, overlay-close y retorno de foco.
   - No hacer HTTP, fetch, Store, Router, Auth ni localStorage.
========================================================= */

export const CLIENTES_MODAL_TEMPLATE_VERSION =
  "clientes.template.modal.backend-contract.v4.readonly.index-v6-api-v4";

export const CLIENTES_MODAL_VERSION =
  CLIENTES_MODAL_TEMPLATE_VERSION;

export const DETAIL_ACTIONS = Object.freeze({
  CLOSE: "detail-close",
  COPY_ID: "detail-copy-id",
  COPY_EMAIL: "detail-copy-email",
  COPY_PHONE: "detail-copy-phone",
  COPY_FIELD: "detail-copy-field",
});

export const CLIENTES_DETAIL_ACTIONS =
  DETAIL_ACTIONS;

const MODAL_ID =
  "clientes-detail-modal-root";

const PANEL_ID =
  "clientes-detail-modal-panel";

const DEFAULT_CURRENCY =
  "EUR";

const MODAL_HOST_SELECTOR =
  "[data-clientes-detail-modal-host='true']";



const BRIDGE_HOST_OWNER_KEY =
  Symbol.for(
    "onion.support.clientes.detail-modal.host-owner"
  );

const BRIDGE_OWNER_TOKEN =
  Object.freeze({
    module:
      "clientes.template.modal",
    version:
      CLIENTES_MODAL_TEMPLATE_VERSION,
  });

let bridgeHost = null;
let bridgeReturnFocus = null;
let bridgeAbortController = null;
let feedbackTimer = 0;
let bridgeSession = 0;

let bridgeState = {
  open: false,
  detail: null,
  clienteId: "",
  feedbackMessage: "",
  feedbackType: "info",
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(
  value,
  fallback = {}
) {
  return isObject(value)
    ? value
    : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function cleanText(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return output || fallback;
}

/*
  No aplanar arrays:
  permissions/audit son colecciones reales.
*/
function first(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    if (
      isObject(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function number(
  value = 0,
  fallback = 0
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  if (
    typeof value === "string"
  ) {
    let normalized =
      value
        .trim()
        .replace(/[€$£¥%]/g, "")
        .replace(/[^\d.,+\-\s]/g, "")
        .replace(/\s+/g, "");

    if (
      !normalized ||
      normalized === "+" ||
      normalized === "-"
    ) {
      return fallback;
    }

    const comma =
      normalized.lastIndexOf(",");

    const dot =
      normalized.lastIndexOf(".");

    if (
      comma >= 0 &&
      dot >= 0
    ) {
      normalized =
        comma > dot
          ? normalized
              .replace(/\./g, "")
              .replace(/,/g, ".")
          : normalized
              .replace(/,/g, "");
    } else if (
      comma >= 0
    ) {
      normalized =
        normalized.replace(/,/g, ".");
    }

    const parsed =
      Number(normalized);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function optionalNumber(
  ...values
) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const parsed =
      number(
        value,
        Number.NaN
      );

    if (
      Number.isFinite(parsed)
    ) {
      return parsed;
    }
  }

  return null;
}

function parseBoolean(
  value,
  fallback = null
) {
  if (
    value === true ||
    value === false
  ) {
    return value;
  }

  if (
    value === 1 ||
    value === "1"
  ) {
    return true;
  }

  if (
    value === 0 ||
    value === "0"
  ) {
    return false;
  }

  if (
    typeof value === "string"
  ) {
    const key =
      normalizeKey(value);

    if (
      [
        "true",
        "yes",
        "si",
        "on",
        "enabled",
        "active",
        "activo",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "no",
        "off",
        "disabled",
        "inactive",
        "inactivo",
      ].includes(key)
    ) {
      return false;
    }
  }

  return fallback;
}

function escapeHtml(
  value = ""
) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function attr(
  value = ""
) {
  return escapeHtml(
    cleanText(
      value,
      ""
    )
  );
}

function joinClasses(
  ...values
) {
  return values
    .flat(Infinity)
    .map(
      (value) =>
        cleanText(
          value,
          ""
        )
    )
    .filter(Boolean)
    .join(" ");
}

function normalizeKey(
  value = ""
) {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeClassModifier(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[_\s]+/g,
      "-"
    )
    .replace(
      /[^a-z0-9-]+/g,
      ""
    )
    .replace(
      /-+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

function normalizeEmail(
  value = ""
) {
  const email =
    cleanText(
      value,
      ""
    ).toLowerCase();

  if (!email) {
    return "";
  }

  if (
    [
      "null",
      "undefined",
      "none",
      "sin email",
      "sin_email",
      "no email",
      "no_email",
      "__no_email__",
    ].includes(email)
  ) {
    return "";
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  )
    ? email
    : "";
}

function firstValidEmail(
  ...values
) {
  for (const value of values) {
    const email =
      normalizeEmail(
        value
      );

    if (email) {
      return email;
    }
  }

  return "";
}

function hasOwn(
  source = {},
  key = ""
) {
  return Boolean(
    isObject(source) &&
    Object.prototype
      .hasOwnProperty
      .call(
        source,
        key
      )
  );
}

function hasKeys(
  source = {}
) {
  return Boolean(
    isObject(source) &&
    Object.keys(source).length
  );
}

function hasAnyOwn(
  source = {},
  keys = []
) {
  return safeArray(keys)
    .some(
      (key) =>
        hasOwn(
          source,
          key
        )
    );
}

/* =========================================================
   SAFE AVATAR URL
========================================================= */

function hasAppSecretQuery(
  value = ""
) {
  return /[?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=/i.test(
    String(value || "")
  );
}

function isAzureBlobHost(
  hostname = ""
) {
  const host =
    cleanText(
      hostname,
      ""
    ).toLowerCase();

  return (
    host.endsWith(
      ".blob.core.windows.net"
    ) ||
    host ===
      "blob.core.windows.net"
  );
}

function hasAzureSignature(
  parsed = null
) {
  return Boolean(
    parsed?.searchParams &&
    (
      parsed.searchParams.has("sig") ||
      parsed.searchParams.has("signature") ||
      parsed.searchParams.has("sas")
    )
  );
}

function safeAvatarUrl(
  value = ""
) {
  const raw =
    cleanText(
      value,
      ""
    );

  if (!raw) {
    return "";
  }

  if (
    raw.startsWith("//") ||
    /[\r\n\t\\]/.test(raw) ||
    /^(?:javascript|data|vbscript|file):/i.test(
      raw
    )
  ) {
    return "";
  }

  if (
    /^blob:/i.test(raw)
  ) {
    return raw;
  }

  if (
    raw.startsWith("/")
  ) {
    return raw.replace(
      /\/{2,}/g,
      "/"
    );
  }

  if (
    raw.startsWith("./") ||
    raw.startsWith("../")
  ) {
    return raw;
  }

  if (
    /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(
      raw
    )
  ) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  if (
    !/^https:\/\//i.test(
      raw
    )
  ) {
    return "";
  }

  try {
    const parsed =
      new URL(raw);

    if (
      hasAppSecretQuery(
        parsed.href
      )
    ) {
      return "";
    }

    /*
      Una firma SAS sólo se permite en Azure Blob.
      URLs HTTPS sin firma siguen siendo válidas.
    */
    if (
      hasAzureSignature(
        parsed
      ) &&
      !isAzureBlobHost(
        parsed.hostname
      )
    ) {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}

function firstAvatarUrl(
  ...values
) {
  const queue =
    [...values];

  const seen =
    new Set();

  while (
    queue.length
  ) {
    const value =
      queue.shift();

    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      isObject(value)
    ) {
      if (
        seen.has(value)
      ) {
        continue;
      }

      seen.add(value);

      queue.unshift(
        value.avatarUrl,
        value.avatar,
        value.picture,
        value.photoUrl,
        value.photoURL,
        value.imageUrl,
        value.logoUrl,

        value.profile
          ?.avatarUrl,

        value.profile
          ?.avatar,

        value.contacto
          ?.avatarUrl,

        value.contacto
          ?.avatar,

        value.raw
          ?.avatarUrl,

        value.raw
          ?.avatar,

        value.raw
          ?.picture
      );

      continue;
    }

    const url =
      safeAvatarUrl(
        value
      );

    if (url) {
      return url;
    }
  }

  return "";
}

function redactIban(
  value = ""
) {
  const raw =
    cleanText(
      value,
      ""
    );

  if (!raw) {
    return "";
  }

  const compact =
    raw.replace(
      /\s+/g,
      ""
    );

  if (
    compact.length <= 8
  ) {
    return raw;
  }

  return (
    `${compact.slice(0, 4)} ` +
    `${"•".repeat(
      Math.max(
        4,
        compact.length - 8
      )
    )} ` +
    compact.slice(-4)
  );
}

/* =========================================================
   ICONS
========================================================= */

function icon(
  name = ""
) {
  const common =
    `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

  const icons = {
    close:
      `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,

    copy:
      `<svg ${common}><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,

    mail:
      `<svg ${common}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a2 2 0 0 1-2.06 0L2 7"/></svg>`,

    phone:
      `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.2a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`,

    euro:
      `<svg ${common}><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2C8.9 4 5 7.6 5 12s3.9 8 8.8 8A7.7 7.7 0 0 0 19 18"/></svg>`,

    alert:
      `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  };

  return (
    icons[name] ||
    icons.copy
  );
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatMoney(
  value = 0,
  currency =
    DEFAULT_CURRENCY
) {
  try {
    return new Intl.NumberFormat(
      "es-ES",
      {
        style:
          "currency",

        currency:
          cleanText(
            currency,
            DEFAULT_CURRENCY
          ).toUpperCase(),

        maximumFractionDigits:
          2,
      }
    ).format(
      number(
        value,
        0
      )
    );
  } catch {
    return (
      `${number(value, 0)
        .toFixed(2)
        .replace(".", ",")} €`
    );
  }
}

function toTimestamp(
  value = null
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (
    value instanceof Date
  ) {
    const ms =
      value.getTime();

    return Number.isFinite(ms)
      ? ms
      : 0;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value >
      9_999_999_999
        ? value
        : value * 1000;
  }

  const raw =
    cleanText(
      value,
      ""
    );

  if (!raw) {
    return 0;
  }

  if (
    /^[+\-]?\d+(?:\.\d+)?$/.test(
      raw
    )
  ) {
    const numeric =
      Number(raw);

    if (
      Number.isFinite(
        numeric
      )
    ) {
      return numeric >
        9_999_999_999
          ? numeric
          : numeric * 1000;
    }
  }

  const parsed =
    Date.parse(raw);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatDate(
  value = null
) {
  const timestamp =
    toTimestamp(
      value
    );

  if (!timestamp) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        day:
          "2-digit",
        month:
          "2-digit",
        year:
          "numeric",
        hour:
          "2-digit",
        minute:
          "2-digit",
      }
    ).format(
      new Date(timestamp)
    );
  } catch {
    return new Date(
      timestamp
    ).toISOString();
  }
}

function formatShortDate(
  value = null
) {
  const timestamp =
    toTimestamp(
      value
    );

  if (!timestamp) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        day:
          "2-digit",
        month:
          "short",
        year:
          "numeric",
      }
    ).format(
      new Date(timestamp)
    );
  } catch {
    return new Date(
      timestamp
    )
      .toISOString()
      .slice(0, 10);
  }
}

function formatRelativeDate(
  value = null
) {
  const timestamp =
    toTimestamp(
      value
    );

  if (!timestamp) {
    return "Sin actividad";
  }

  const diffMs =
    Date.now() -
    timestamp;

  const future =
    diffMs < 0;

  const absolute =
    Math.abs(diffMs);

  const minutes =
    Math.round(
      absolute /
      60_000
    );

  if (
    minutes < 1
  ) {
    return "ahora";
  }

  if (
    minutes < 60
  ) {
    return future
      ? `en ${minutes} min`
      : `hace ${minutes} min`;
  }

  const hours =
    Math.round(
      minutes /
      60
    );

  if (
    hours < 24
  ) {
    return future
      ? `en ${hours} h`
      : `hace ${hours} h`;
  }

  const days =
    Math.round(
      hours /
      24
    );

  if (
    days <= 7
  ) {
    return future
      ? `en ${days} d`
      : `hace ${days} d`;
  }

  return formatShortDate(
    timestamp
  );
}

function formatPercent(
  value = 0
) {
  return (
    `${String(
      number(
        value,
        0
      )
    ).replace(".", ",")}%`
  );
}

function formatPhoneHref(
  value = ""
) {
  const raw =
    cleanText(
      value,
      ""
    );

  if (!raw) {
    return "";
  }

  const plus =
    raw.startsWith("+")
      ? "+"
      : "";

  const digits =
    raw.replace(
      /[^\d]/g,
      ""
    );

  return digits
    ? `tel:${plus}${digits}`
    : "";
}

function formatMailHref(
  value = ""
) {
  const email =
    normalizeEmail(
      value
    );

  return email
    ? `mailto:${email}`
    : "";
}

/* =========================================================
   ADDRESS
========================================================= */

function normalizeAddress(
  address = {}
) {
  const source =
    safeObject(
      address
    );

  return {
    calle:
      cleanText(
        first(
          source.calle,
          source.street,
          source.line1,
          source.addressLine1,
          ""
        ),
        ""
      ),

    linea2:
      cleanText(
        first(
          source.linea2,
          source.line2,
          source.addressLine2,
          ""
        ),
        ""
      ),

    cp:
      cleanText(
        first(
          source.cp,
          source.postalCode,
          source.zip,
          ""
        ),
        ""
      ),

    ciudad:
      cleanText(
        first(
          source.ciudad,
          source.city,
          ""
        ),
        ""
      ),

    provincia:
      cleanText(
        first(
          source.provincia,
          source.province,
          source.region,
          source.state,
          ""
        ),
        ""
      ),

    pais:
      cleanText(
        first(
          source.pais,
          source.country,
          ""
        ),
        ""
      ),
  };
}

function addressKey(
  address = {}
) {
  const normalized =
    normalizeAddress(
      address
    );

  return [
    normalized.calle,
    normalized.linea2,
    normalized.cp,
    normalized.ciudad,
    normalized.provincia,
    normalized.pais,
  ]
    .map(
      (value) =>
        value.toLowerCase()
    )
    .join("|");
}

function hasAddress(
  address = {}
) {
  const normalized =
    normalizeAddress(
      address
    );

  return Boolean(
    normalized.calle ||
    normalized.linea2 ||
    normalized.cp ||
    normalized.ciudad ||
    normalized.provincia ||
    normalized.pais
  );
}

function formatAddress(
  address = {}
) {
  const current =
    normalizeAddress(
      address
    );

  return [
    current.calle,
    current.linea2,

    [
      current.cp,
      current.ciudad,
    ]
      .filter(Boolean)
      .join(" "),

    current.provincia,
    current.pais,
  ]
    .filter(Boolean)
    .join(" · ");
}

/* =========================================================
   CANONICAL DETAIL READERS
========================================================= */

function resolveDetail(
  input = {}
) {
  const data =
    safeObject(
      input
    );

  return safeObject(
    first(
      data.detail,
      data.cliente,
      data.client,
      data.customer,
      data.item,

      data.data
        ?.cliente,

      data.data
        ?.client,

      data.data
        ?.customer,

      data.data
        ?.item,

      data.data,
      data
    ),
    {}
  );
}

function getRaw(
  detail = {}
) {
  return safeObject(
    detail?.raw,
    safeObject(detail)
  );
}

function hasRenderableDetail(
  detail = {}
) {
  const current =
    safeObject(
      detail,
      {}
    );

  const raw =
    getRaw(
      current
    );

  return Boolean(
    getClienteId(current) ||
    cleanText(
      first(
        current.nombreFiscal,
        current.razonSocial,
        current.displayName,
        current.fullName,
        current.name,
        current.nombre,

        raw.nombreFiscal,
        raw.razonSocial,
        raw.businessName,
        raw.companyName,
        raw.displayName,
        raw.name,
        raw.nombre,

        current.email,
        raw.email,

        current.userId,
        raw.userId,
        ""
      ),
      ""
    )
  );
}

function getContact(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return safeObject(
    first(
      detail.contacto,
      detail.contact,
      raw.contacto,
      raw.contact,
      {}
    ),
    {}
  );
}

function getClienteId(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanText(
    first(
      detail.clienteId,
      detail.id,
      detail.clientId,
      detail.customerId,
      detail._id,
      detail.uid,

      raw.clienteId,
      raw.id,
      raw.clientId,
      raw.customerId,
      raw._id,
      raw.uid,
      ""
    ),
    ""
  );
}

function getCodigoCliente(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanText(
    first(
      detail.code,
      detail.codigo,
      raw.code,
      raw.codigo,
      getClienteId(detail)
    ),
    getClienteId(detail)
  );
}

function getUserId(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanText(
    first(
      detail.userId,
      detail.usuarioId,

      raw.userId,
      raw.usuarioId,
      raw.ownerUserId,

      raw.user
        ?.userId,

      raw.user
        ?.id,

      ""
    ),
    ""
  );
}

function getDisplayName(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const contact =
    getContact(detail);

  return cleanText(
    first(
      detail.nombreFiscal,
      detail.displayName,
      detail.fullName,
      detail.name,
      detail.nombre,

      raw.nombreFiscal,
      raw.razonSocial,
      raw.businessName,
      raw.companyName,
      raw.displayName,
      raw.name,
      raw.nombre,

      contact.nombre,
      contact.name,

      getClienteId(detail),
      "Cliente"
    ),
    "Cliente"
  );
}

function getFiscalName(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanText(
    first(
      detail.nombreFiscal,
      raw.nombreFiscal,
      raw.razonSocial,
      raw.businessName,
      raw.companyName,
      getDisplayName(detail)
    ),
    getDisplayName(detail)
  );
}

function getCommercialName(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanText(
    first(
      detail.nombreComercial,
      raw.nombreComercial,
      raw.commercialName,
      ""
    ),
    ""
  );
}

function getContactName(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const contact =
    getContact(detail);

  return cleanText(
    first(
      detail.nombreContacto,
      detail.contactoNombre,

      raw.nombreContacto,
      raw.contactoNombre,

      contact.nombre,
      contact.name,
      contact.displayName,

      getDisplayName(detail)
    ),
    getDisplayName(detail)
  );
}

function getEmail(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const contact =
    getContact(detail);

  return firstValidEmail(
    detail.email,
    detail.emailLower,
    detail.contactEmail,
    detail.contactoEmail,

    raw.email,
    raw.emailLower,
    raw.contactoEmail,
    raw.contactEmail,

    contact.email,
    contact.emailLower,
    ""
  );
}

function getBillingEmail(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const billing =
    safeObject(
      first(
        raw.billing,
        raw.facturacion,
        {}
      )
    );

  return firstValidEmail(
    detail.billingEmail,
    raw.billingEmail,
    raw.emailFacturacion,

    billing.emailFacturacion,
    billing.email,
    ""
  );
}

function getPhone(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const contact =
    getContact(detail);

  return cleanText(
    first(
      detail.phone,
      detail.telefono,
      detail.contactoPhone,

      raw.phone,
      raw.telefono,
      raw.contactoPhone,

      contact.phone,
      contact.telefono,
      ""
    ),
    ""
  );
}

function getUsername(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const contact =
    getContact(detail);

  return cleanText(
    first(
      detail.username,
      raw.username,
      raw.usernameLower,
      raw.slug,

      contact.username,
      contact.usernameLower,
      contact.slug,
      ""
    ),
    ""
  );
}

function getNif(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return cleanText(
    first(
      detail.nif,
      detail.cif,
      detail.taxId,

      raw.nif,
      raw.cif,
      raw.taxId,
      raw.vatNumber,
      ""
    ),
    ""
  ).toUpperCase();
}

function getType(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const type =
    normalizeKey(
      first(
        detail.tipo,
        detail.type,
        detail.clienteTipo,
        detail.segment,

        raw.tipo,
        raw.type,
        raw.clienteTipo,
        raw.segmento,
        ""
      )
    );

  if (
    [
      "empresa",
      "company",
      "business",
      "b2b",
      "autonomo",
    ].includes(type)
  ) {
    return "empresa";
  }

  if (
    [
      "particular",
      "persona",
      "individual",
      "b2c",
    ].includes(type)
  ) {
    return "particular";
  }

  return (
    type ||
    "cliente"
  );
}

function typeLabel(
  type = ""
) {
  const value =
    normalizeKey(
      type
    );

  const labels = {
    empresa:
      "Empresa",

    particular:
      "Particular",

    cliente:
      "Cliente",
  };

  return (
    labels[value] ||
    cleanText(
      type,
      "Cliente"
    )
  );
}

function getStatus(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const explicit =
    normalizeKey(
      first(
        detail.status,
        detail.estado,
        detail.state,

        raw.status,
        raw.estado,
        raw.state,
        ""
      )
    );

  if (
    [
      "inactive",
      "inactivo",
      "disabled",
      "archived",
      "deleted",
    ].includes(explicit)
  ) {
    return "inactive";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "suspended",
      "locked",
    ].includes(explicit)
  ) {
    return "blocked";
  }

  if (
    [
      "pending",
      "pendiente",
      "new",
      "nuevo",
      "invited",
    ].includes(explicit)
  ) {
    return "pending";
  }

  if (
    [
      "vip",
      "premium",
    ].includes(explicit)
  ) {
    return "vip";
  }

  if (
    [
      "active",
      "activo",
      "enabled",
      "ok",
    ].includes(explicit)
  ) {
    return "active";
  }

  const blocked =
    parseBoolean(
      first(
        detail.blocked,
        raw.blocked,
        null
      ),
      null
    );

  const disabled =
    parseBoolean(
      first(
        detail.disabled,
        raw.disabled,
        null
      ),
      null
    );

  const active =
    parseBoolean(
      first(
        detail.active,
        detail.isActive,
        detail.enabled,

        raw.active,
        raw.isActive,
        raw.enabled,
        null
      ),
      null
    );

  if (
    blocked === true
  ) {
    return "blocked";
  }

  if (
    disabled === true ||
    active === false
  ) {
    return "inactive";
  }

  return "active";
}

function statusLabel(
  status = ""
) {
  const labels = {
    active:
      "Activo",

    pending:
      "Pendiente",

    blocked:
      "Bloqueado",

    inactive:
      "Inactivo",

    vip:
      "VIP",
  };

  return (
    labels[
      normalizeKey(status)
    ] ||
    cleanText(
      status,
      "Activo"
    )
  );
}

function statusClass(
  status = ""
) {
  const value =
    normalizeKey(
      status
    );

  if (
    value === "vip"
  ) {
    return "active";
  }

  if (
    [
      "active",
      "pending",
      "blocked",
      "inactive",
    ].includes(value)
  ) {
    return value;
  }

  return "active";
}

function getAvatar(
  detail = {}
) {
  return firstAvatarUrl(
    detail,
    getRaw(detail),
    getContact(detail)
  );
}

function getCreatedAt(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return first(
    detail.createdAt,

    raw.createdAt,
    raw.created_at,
    raw.fechaCreacion,
    null
  );
}

function getUpdatedAt(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return first(
    detail.lastActivityAt,
    detail.updatedAt,

    raw.lastActivityAt,
    raw.updatedAt,
    raw.updated_at,
    raw.modifiedAt,

    getCreatedAt(detail),
    null
  );
}

function getMainAddress(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const nested =
    safeObject(
      first(
        detail.direccion,
        detail.address,
        raw.direccion,
        raw.address,
        {}
      )
    );

  return normalizeAddress({
    ...nested,

    calle:
      first(
        nested.calle,
        nested.street,
        raw.calle,
        ""
      ),

    cp:
      first(
        nested.cp,
        nested.postalCode,
        raw.cp,
        ""
      ),

    ciudad:
      first(
        nested.ciudad,
        nested.city,
        detail.ciudad,
        detail.city,
        raw.ciudad,
        raw.city,
        ""
      ),

    provincia:
      first(
        nested.provincia,
        nested.province,
        raw.provincia,
        ""
      ),

    pais:
      first(
        nested.pais,
        nested.country,
        raw.pais,
        ""
      ),
  });
}

function getExplicitFiscalAddress(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const address =
    safeObject(
      first(
        detail.direccionFiscal,
        raw.direccionFiscal,
        {}
      )
    );

  return hasAddress(address)
    ? normalizeAddress(address)
    : {};
}

function getExplicitServiceAddress(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const address =
    safeObject(
      first(
        detail.direccionServicio,
        raw.direccionServicio,
        {}
      )
    );

  return hasAddress(address)
    ? normalizeAddress(address)
    : {};
}

function getCity(
  detail = {}
) {
  return cleanText(
    getMainAddress(
      detail
    ).ciudad,
    ""
  );
}

function getProvince(
  detail = {}
) {
  return cleanText(
    getMainAddress(
      detail
    ).provincia,
    ""
  );
}

function getCurrency(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const billing =
    safeObject(
      first(
        raw.billing,
        raw.facturacion,
        {}
      )
    );

  return cleanText(
    first(
      detail.currency,
      detail.moneda,

      raw.currency,
      raw.moneda,

      billing.currency,
      billing.moneda,

      DEFAULT_CURRENCY
    ),
    DEFAULT_CURRENCY
  ).toUpperCase();
}

function getTicketsCount(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return Math.max(
    0,
    number(
      first(
        detail.ticketsCount,
        detail.incidenciasCount,
        detail.ticketCount,

        raw.ticketsCount,
        raw.incidenciasCount,
        raw.ticketCount,

        raw.stats
          ?.ticketsCount,

        0
      ),
      0
    )
  );
}

function getInvoicesCount(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return Math.max(
    0,
    number(
      first(
        detail.invoicesCount,
        detail.facturasCount,
        detail.invoiceCount,

        raw.invoicesCount,
        raw.facturasCount,
        raw.invoiceCount,

        raw.stats
          ?.facturasCount,

        0
      ),
      0
    )
  );
}

function getTotalAmount(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return number(
    first(
      detail.totalAmount,
      detail.totalImporte,
      detail.facturasTotal,

      raw.totalAmount,
      raw.totalImporte,
      raw.facturasTotal,

      raw.stats
        ?.totalFacturado,

      0
    ),
    0
  );
}

function getOptionalStats(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const stats =
    safeObject(
      raw.stats
    );

  return {
    openTickets:
      optionalNumber(
        detail.openTicketsCount,
        raw.openTicketsCount,
        stats.openTicketsCount
      ),

    closedTickets:
      optionalNumber(
        detail.closedTicketsCount,
        raw.closedTicketsCount,
        stats.closedTicketsCount
      ),

    paid:
      optionalNumber(
        detail.totalPagado,
        raw.totalPagado,
        stats.totalPagado
      ),

    pending:
      optionalNumber(
        detail.totalPendiente,
        raw.totalPendiente,
        stats.totalPendiente
      ),

    lastTicketAt:
      first(
        detail.lastTicketAt,
        raw.lastTicketAt,
        stats.lastTicketAt,
        null
      ),

    lastInvoiceAt:
      first(
        detail.lastInvoiceAt,
        raw.lastInvoiceAt,
        stats.lastInvoiceAt,
        null
      ),
  };
}

function getBillingSources(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const billing =
    safeObject(
      raw.billing
    );

  const facturacion =
    safeObject(
      raw.facturacion
    );

  return {
    raw,
    billing,
    facturacion,
  };
}

function getAuditEntries(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const audit =
    first(
      detail.audit,
      raw.audit,
      []
    );

  return Array.isArray(audit)
    ? audit
    : [];
}

function getPermissions(
  detail = {}
) {
  const raw =
    getRaw(detail);

  return safeArray(
    first(
      detail.permissions,
      raw.permissions,
      []
    )
  );
}

/* =========================================================
   VIEW MODEL
========================================================= */

function buildVm(
  input = {}
) {
  const data =
    safeObject(
      input
    );

  const detail =
    resolveDetail(
      data
    );

  const clienteId =
    getClienteId(
      detail
    );

  return {
    open:
      data.open !== false &&
      hasRenderableDetail(
        detail
      ),

    detail,
    clienteId,

    submitting:
      data.submitting ===
      true,

    feedbackMessage:
      cleanText(
        data.feedbackMessage,
        ""
      ),

    feedbackType:
      cleanText(
        data.feedbackType,
        "info"
      ),
  };
}

/* =========================================================
   SMALL PARTIALS
========================================================= */

function renderChip(
  label = "",
  modifier = "neutral"
) {
  const safeModifier =
    normalizeClassModifier(
      modifier
    ) ||
    "neutral";

  return (
    `<span class="clientes-modal-chip incidencias-modal-chip incidencias-modal-chip--${attr(safeModifier)} clientes-modal-chip--${attr(safeModifier)}">` +
    `${escapeHtml(label)}` +
    `</span>`
  );
}

function renderAvatar(
  detail = {}
) {
  const name =
    getDisplayName(
      detail
    );

  const contactName =
    getContactName(
      detail
    );

  const email =
    getEmail(
      detail
    );

  const avatarUrl =
    getAvatar(
      detail
    );

  const presentation = resolveAvatarPresentation({
    name: contactName || name,
    email,
    userId: getUserId(detail),
  });

  return `
    <div
      class="clientes-modal-avatar incidencias-modal-avatar"
      title="${attr(name)}"
    >
      <div
        class="${joinClasses(
          "clientes-modal-avatar-frame incidencias-modal-avatar-frame",
          avatarUrl
            ? ""
            : "clientes-modal-avatar-frame--fallback incidencias-modal-avatar-frame--fallback"
        )}"
        data-modal-avatar-frame="true"
        data-avatar-system="true"
        data-avatar-host="true"
        data-avatar-name="${attr(presentation.name)}"
        data-avatar-email="${attr(presentation.email)}"
        data-avatar-user-id="${attr(presentation.userId)}"
        data-avatar-initials="${attr(presentation.initials)}"
        data-avatar-identity="${attr(presentation.fingerprint)}"
        data-has-avatar="${avatarUrl ? "true" : "false"}"
        data-fallback="${avatarUrl ? "false" : "true"}"
        data-avatar-tone="${attr(String(presentation.tone))}"
      >
        ${
          avatarUrl
            ? `<img
                src="${attr(avatarUrl)}"
                alt=""
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                draggable="false"
                data-modal-avatar-img="true"
              >`
            : ""
        }

        <span
          class="clientes-modal-avatar-fallback incidencias-modal-avatar-fallback"
        >${escapeHtml(presentation.initials)}</span>
      </div>
    </div>
  `;
}

function renderMetaField(
  label = "",
  value = "",
  options = {}
) {
  const classes =
    joinClasses(
      "clientes-modal-meta-card incidencias-modal-meta-card",
      options.className ||
      ""
    );

  return `
    <div class="${classes}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(cleanText(value, "—"))}</strong>
    </div>
  `;
}

function renderFeedbackBox(
  vm = {}
) {
  const message =
    cleanText(
      vm.feedbackMessage,
      ""
    );

  if (!message) {
    return "";
  }

  const type =
    normalizeKey(
      vm.feedbackType ||
      "info"
    );

  const safeType =
    [
      "info",
      "success",
      "warning",
      "error",
    ].includes(type)
      ? type
      : "info";

  const title =
    safeType === "error"
      ? "No se ha podido completar la acción"
      : safeType === "success"
        ? "Acción completada"
        : safeType === "warning"
          ? "Aviso"
          : "Información";

  return `
    <div
      class="clientes-modal-feedback incidencias-modal-feedback incidencias-modal-feedback--${attr(safeType)} clientes-modal-feedback--${attr(safeType)}"
      role="${safeType === "error" ? "alert" : "status"}"
      aria-live="${safeType === "error" ? "assertive" : "polite"}"
      data-modal-feedback="true"
    >
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderCopyButton(
  action =
    DETAIL_ACTIONS.COPY_FIELD,
  value = "",
  label = "Copiar"
) {
  const clean =
    cleanText(
      value,
      ""
    );

  if (!clean) {
    return "";
  }

  return `
    <button
      type="button"
      class="clientes-modal-copy-btn incidencias-modal-view-btn"
      data-detail-action="${attr(action)}"
      data-copy-value="${attr(clean)}"
      aria-label="${attr(label)}"
    >
      <span class="incidencias-modal-action-icon">
        ${icon("copy")}
      </span>

      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderLinkedValue({
  label = "",
  value = "",
  href = "",
  action = "",
  iconName = "copy",
} = {}) {
  const clean =
    cleanText(
      value,
      ""
    );

  if (!clean) {
    return "";
  }

  return `
    <div
      class="clientes-modal-linked-field incidencias-modal-meta-card"
    >
      <span>${escapeHtml(label)}</span>

      <strong>
        ${
          href
            ? `<a
                href="${attr(href)}"
                class="clientes-modal-link"
                data-clientes-link="true"
              >${icon(iconName)} ${escapeHtml(clean)}</a>`
            : escapeHtml(clean)
        }
      </strong>

      ${renderCopyButton(
        action ||
        DETAIL_ACTIONS.COPY_FIELD,
        clean,
        "Copiar"
      )}
    </div>
  `;
}

function renderSectionHeader(
  title = "",
  subtitle = ""
) {
  return `
    <div
      class="clientes-modal-section-head incidencias-modal-section-head"
    >
      <h3>${escapeHtml(title)}</h3>

      ${
        subtitle
          ? `<span>${escapeHtml(subtitle)}</span>`
          : ""
      }
    </div>
  `;
}

function renderInfoRow(
  label = "",
  value = "",
  options = {}
) {
  const safeValue =
    cleanText(
      value,
      ""
    );

  if (
    !safeValue &&
    options.hideEmpty !==
      false
  ) {
    return "";
  }

  return `
    <div class="clientes-modal-info-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(safeValue || "—")}</strong>
    </div>
  `;
}

function renderAddressCard(
  title = "",
  address = {}
) {
  if (
    !hasAddress(address)
  ) {
    return "";
  }

  const normalized =
    normalizeAddress(
      address
    );

  return `
    <article
      class="clientes-modal-address-card incidencias-modal-meta-card"
    >
      <span>${escapeHtml(title)}</span>

      <strong>
        ${escapeHtml(formatAddress(normalized))}
      </strong>

      <small>
        ${escapeHtml(
          [
            normalized.cp,
            normalized.ciudad,
            normalized.provincia,
            normalized.pais,
          ]
            .filter(Boolean)
            .join(" · ") ||
          "Dirección registrada"
        )}
      </small>
    </article>
  `;
}

/* =========================================================
   CONTENT BLOCKS
========================================================= */

function renderFiscalBlock(
  detail = {}
) {
  const type =
    getType(detail);

  const fiscalName =
    getFiscalName(detail);

  const commercialName =
    getCommercialName(detail);

  const nif =
    getNif(detail);

  const clienteId =
    getClienteId(detail);

  const codigo =
    getCodigoCliente(detail);

  const userId =
    getUserId(detail);

  return `
    <section
      class="clientes-modal-section clientes-modal-fiscal-section incidencias-modal-description-section"
    >
      ${renderSectionHeader(
        "Datos fiscales",
        "Identificación del cliente"
      )}

      <div class="clientes-modal-info-grid">
        ${renderInfoRow(
          "Nombre fiscal",
          fiscalName,
          {
            hideEmpty:
              false,
          }
        )}

        ${
          commercialName &&
          commercialName !==
            fiscalName
            ? renderInfoRow(
                "Nombre comercial",
                commercialName
              )
            : ""
        }

        ${renderInfoRow(
          "Tipo",
          typeLabel(type),
          {
            hideEmpty:
              false,
          }
        )}

        ${renderInfoRow(
          "NIF / CIF",
          nif || "—",
          {
            hideEmpty:
              false,
          }
        )}

        ${renderInfoRow(
          "Código cliente",
          codigo ||
          clienteId ||
          "—",
          {
            hideEmpty:
              false,
          }
        )}

        ${renderInfoRow(
          "Usuario vinculado",
          userId ||
          "—",
          {
            hideEmpty:
              false,
          }
        )}
      </div>
    </section>
  `;
}

function renderContactBlock(
  detail = {}
) {
  const contactName =
    getContactName(detail);

  const email =
    getEmail(detail);

  const phone =
    getPhone(detail);

  const username =
    getUsername(detail);

  return `
    <section
      class="clientes-modal-section clientes-modal-contact-section incidencias-modal-contact-section"
    >
      ${renderSectionHeader(
        "Contacto",
        "Datos registrados para soporte"
      )}

      <div
        class="clientes-modal-contact-grid incidencias-modal-contact-grid"
      >
        ${renderLinkedValue({
          label:
            "Email",
          value:
            email,
          href:
            formatMailHref(
              email
            ),
          action:
            DETAIL_ACTIONS
              .COPY_EMAIL,
          iconName:
            "mail",
        })}

        ${renderLinkedValue({
          label:
            "Teléfono",
          value:
            phone,
          href:
            formatPhoneHref(
              phone
            ),
          action:
            DETAIL_ACTIONS
              .COPY_PHONE,
          iconName:
            "phone",
        })}

        ${renderMetaField(
          "Contacto",
          contactName ||
          "—"
        )}

        ${
          username
            ? renderMetaField(
                "Usuario / slug",
                username
              )
            : ""
        }
      </div>
    </section>
  `;
}

function renderAddressesBlock(
  detail = {}
) {
  const main =
    getMainAddress(
      detail
    );

  const fiscal =
    getExplicitFiscalAddress(
      detail
    );

  const service =
    getExplicitServiceAddress(
      detail
    );

  const cards = [];
  const seen =
    new Set();

  for (
    const [
      title,
      address,
    ]
    of [
      [
        "Dirección principal",
        main,
      ],
      [
        "Dirección fiscal",
        fiscal,
      ],
      [
        "Dirección servicio",
        service,
      ],
    ]
  ) {
    if (
      !hasAddress(address)
    ) {
      continue;
    }

    const key =
      addressKey(
        address
      );

    if (
      !key ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    cards.push(
      renderAddressCard(
        title,
        address
      )
    );
  }

  if (
    !cards.length
  ) {
    return "";
  }

  return `
    <section
      class="clientes-modal-section clientes-modal-address-section"
    >
      ${renderSectionHeader(
        "Direcciones",
        cards.length === 1
          ? "Dirección registrada"
          : `${cards.length} direcciones diferenciadas`
      )}

      <div class="clientes-modal-address-grid">
        ${cards.join("")}
      </div>
    </section>
  `;
}

function renderBillingBlock(
  detail = {}
) {
  const {
    raw,
    billing,
    facturacion,
  } =
    getBillingSources(
      detail
    );

  const billingEmail =
    getBillingEmail(
      detail
    );

  const hasConfig =
    hasKeys(billing) ||
    hasKeys(facturacion) ||
    hasAnyOwn(
      raw,
      [
        "billingEmail",
        "emailFacturacion",
        "currency",
        "moneda",
        "porcentajeIVA",
        "porcentajeIRPF",
        "formaPagoDefault",
        "metodoPagoDefault",
        "cuentaPagoDefault",
        "paymentTermsDays",
      ]
    );

  if (
    !hasConfig &&
    !billingEmail
  ) {
    return "";
  }

  const rows = [];

  const enabled =
    hasOwn(
      billing,
      "enabled"
    )
      ? parseBoolean(
          billing.enabled,
          null
        )
      : hasOwn(
          facturacion,
          "enabled"
        )
        ? parseBoolean(
            facturacion.enabled,
            null
          )
        : null;

  if (
    enabled !== null
  ) {
    rows.push(
      renderInfoRow(
        "Estado",
        enabled
          ? "Activa"
          : "Desactivada"
      )
    );
  }

  const currency =
    cleanText(
      first(
        billing.currency,
        billing.moneda,

        facturacion.currency,
        facturacion.moneda,

        raw.currency,
        raw.moneda,
        ""
      ),
      ""
    ).toUpperCase();

  if (currency) {
    rows.push(
      renderInfoRow(
        "Moneda",
        currency
      )
    );
  }

  const ivaEnabled =
    hasOwn(
      billing,
      "aplicaIVA"
    )
      ? parseBoolean(
          billing.aplicaIVA,
          null
        )
      : hasOwn(
          safeObject(
            billing.iva
          ),
          "enabled"
        )
        ? parseBoolean(
            billing.iva.enabled,
            null
          )
        : hasOwn(
            safeObject(
              facturacion.iva
            ),
            "enabled"
          )
          ? parseBoolean(
              facturacion.iva.enabled,
              null
            )
          : null;

  const iva =
    optionalNumber(
      billing.porcentajeIVA,

      billing.iva
        ?.porcentaje,

      facturacion.iva
        ?.porcentaje,

      raw.porcentajeIVA
    );

  if (
    ivaEnabled !== null ||
    iva !== null
  ) {
    rows.push(
      renderInfoRow(
        "IVA",
        ivaEnabled === false
          ? "No aplica"
          : iva !== null
            ? formatPercent(
                iva
              )
            : "Aplica"
      )
    );
  }

  const irpfEnabled =
    hasOwn(
      billing,
      "aplicaIRPF"
    )
      ? parseBoolean(
          billing.aplicaIRPF,
          null
        )
      : hasOwn(
          safeObject(
            billing.irpf
          ),
          "enabled"
        )
        ? parseBoolean(
            billing.irpf.enabled,
            null
          )
        : hasOwn(
            safeObject(
              facturacion.irpf
            ),
            "enabled"
          )
          ? parseBoolean(
              facturacion.irpf.enabled,
              null
            )
          : null;

  const irpf =
    optionalNumber(
      billing.porcentajeIRPF,

      billing.irpf
        ?.porcentaje,

      facturacion.irpf
        ?.porcentaje,

      raw.porcentajeIRPF
    );

  if (
    irpfEnabled !== null ||
    irpf !== null
  ) {
    rows.push(
      renderInfoRow(
        "IRPF",
        irpfEnabled === false
          ? "No aplica"
          : irpf !== null
            ? formatPercent(
                irpf
              )
            : "Aplica"
      )
    );
  }

  const payment =
    cleanText(
      first(
        billing
          .formaPagoDefault,

        billing
          .metodoPagoDefault,

        facturacion
          .formaPago,

        facturacion
          .metodoPago,

        raw.formaPagoDefault,
        raw.metodoPagoDefault,
        ""
      ),
      ""
    );

  if (payment) {
    rows.push(
      renderInfoRow(
        "Forma de pago",
        payment
      )
    );
  }

  const terms =
    optionalNumber(
      billing
        .paymentTermsDays,

      facturacion
        .paymentTermsDays,

      raw.paymentTermsDays
    );

  if (
    terms !== null
  ) {
    rows.push(
      renderInfoRow(
        "Vencimiento",
        `${terms} días`
      )
    );
  }

  if (
    billingEmail
  ) {
    rows.push(
      renderInfoRow(
        "Email facturación",
        billingEmail
      )
    );
  }

  const account =
    cleanText(
      first(
        billing
          .cuentaPagoDefault,

        facturacion
          .cuentaPago,

        raw.cuentaPagoDefault,
        ""
      ),
      ""
    );

  if (account) {
    rows.push(
      renderInfoRow(
        "Cuenta de pago",
        redactIban(
          account
        )
      )
    );
  }

  const filtered =
    rows.filter(Boolean);

  if (
    !filtered.length
  ) {
    return "";
  }

  return `
    <section
      class="clientes-modal-section clientes-modal-billing-section"
    >
      ${renderSectionHeader(
        "Facturación",
        "Solo se muestran valores realmente presentes en el cliente"
      )}

      <div class="clientes-modal-info-grid">
        ${filtered.join("")}
      </div>
    </section>
  `;
}

function renderStatsBlock(
  detail = {}
) {
  const currency =
    getCurrency(
      detail
    );

  const tickets =
    getTicketsCount(
      detail
    );

  const invoices =
    getInvoicesCount(
      detail
    );

  const total =
    getTotalAmount(
      detail
    );

  const optional =
    getOptionalStats(
      detail
    );

  const ticketParts = [
    `${tickets} total`,
  ];

  if (
    optional.openTickets !==
      null
  ) {
    ticketParts.push(
      `${optional.openTickets} abiertos`
    );
  }

  if (
    optional.closedTickets !==
      null
  ) {
    ticketParts.push(
      `${optional.closedTickets} cerrados`
    );
  }

  const extraMoney = [];

  if (
    optional.paid !== null
  ) {
    extraMoney.push(
      renderMetaField(
        "Pagado",
        formatMoney(
          optional.paid,
          currency
        )
      )
    );
  }

  if (
    optional.pending !==
      null
  ) {
    extraMoney.push(
      renderMetaField(
        "Pendiente",
        formatMoney(
          optional.pending,
          currency
        )
      )
    );
  }

  return `
    <section
      class="clientes-modal-section clientes-modal-stats-section"
    >
      ${renderSectionHeader(
        "Actividad",
        "Resumen disponible del cliente"
      )}

      <div class="clientes-modal-stat-grid">
        ${renderMetaField(
          "Tickets",
          ticketParts.join(" · ")
        )}

        ${renderMetaField(
          "Facturas",
          `${invoices} documentos`
        )}

        ${renderMetaField(
          "Facturado",
          formatMoney(
            total,
            currency
          )
        )}

        ${extraMoney.join("")}

        ${renderMetaField(
          "Último ticket",
          optional.lastTicketAt
            ? formatRelativeDate(
                optional.lastTicketAt
              )
            : "—"
        )}

        ${renderMetaField(
          "Última factura",
          optional.lastInvoiceAt
            ? formatRelativeDate(
                optional.lastInvoiceAt
              )
            : "—"
        )}
      </div>
    </section>
  `;
}

function renderPrivacyBlock(
  detail = {}
) {
  const raw =
    getRaw(detail);

  const privacy =
    safeObject(
      raw.privacy
    );

  const visibility =
    safeObject(
      raw.visibility
    );

  const meta =
    safeObject(
      raw.meta
    );

  const permissions =
    getPermissions(
      detail
    );

  const items = [];

  const pushBooleanChip = (
    source,
    key,
    yes,
    no
  ) => {
    if (
      !hasOwn(
        source,
        key
      )
    ) {
      return;
    }

    const value =
      parseBoolean(
        source[key],
        null
      );

    if (
      value === null
    ) {
      return;
    }

    items.push(
      value
        ? yes
        : no
    );
  };

  pushBooleanChip(
    privacy,
    "containsPersonalData",
    "Datos personales",
    "Sin marca de datos personales"
  );

  pushBooleanChip(
    privacy,
    "containsAddress",
    "Contiene dirección",
    "Sin marca de dirección"
  );

  pushBooleanChip(
    privacy,
    "containsBillingData",
    "Datos de facturación",
    "Sin marca de facturación"
  );

  pushBooleanChip(
    visibility,
    "adminVisible",
    "Visible admin",
    "Oculto admin"
  );

  pushBooleanChip(
    visibility,
    "userVisible",
    "Visible usuario",
    "Oculto usuario"
  );

  pushBooleanChip(
    meta,
    "hasUser",
    "Usuario vinculado",
    "Sin usuario vinculado"
  );

  if (
    !items.length &&
    !permissions.length
  ) {
    return "";
  }

  return `
    <section
      class="clientes-modal-section clientes-modal-privacy-section"
    >
      ${renderSectionHeader(
        "Visibilidad y permisos",
        permissions.length
          ? `${permissions.length} permiso${permissions.length === 1 ? "" : "s"}`
          : "Metadatos legacy presentes"
      )}

      ${
        items.length
          ? `<div class="clientes-modal-chip-list">
              ${items
                .map(
                  (item) =>
                    renderChip(
                      item,
                      "category"
                    )
                )
                .join("")}
            </div>`
          : ""
      }

      ${
        permissions.length
          ? `<div class="clientes-modal-permissions-list">
              ${permissions
                .map(
                  (permission) => {
                    const text =
                      cleanText(
                        isObject(permission)
                          ? first(
                              permission.name,
                              permission.key,
                              permission.code,
                              JSON.stringify(
                                permission
                              )
                            )
                          : permission,
                        ""
                      );

                    return text
                      ? `<span>${escapeHtml(text)}</span>`
                      : "";
                  }
                )
                .join("")}
            </div>`
          : ""
      }
    </section>
  `;
}

function normalizeAuditEntry(
  item = {},
  index = 0
) {
  const raw =
    safeObject(
      item
    );

  return {
    id:
      cleanText(
        first(
          raw.id,
          raw.eventId,
          `audit_${index}`
        ),
        `audit_${index}`
      ),

    event:
      cleanText(
        first(
          raw.event,
          raw.type,
          raw.action,
          "cliente.updated"
        ),
        "cliente.updated"
      ),

    source:
      cleanText(
        first(
          raw.source,
          raw.by,
          raw.actor,
          "sistema"
        ),
        "sistema"
      ),

    at:
      first(
        raw.at,
        raw.createdAt,
        raw.date,
        raw.timestamp,
        null
      ),

    schemaVersion:
      cleanText(
        first(
          raw.schemaVersion,
          raw.version,
          ""
        ),
        ""
      ),
  };
}

function renderAuditBlock(
  detail = {}
) {
  const audit =
    getAuditEntries(
      detail
    ).map(
      normalizeAuditEntry
    );

  /*
    Ausencia de audit no significa "sin actividad".
    Simplemente no mostramos sección.
  */
  if (
    !audit.length
  ) {
    return "";
  }

  return `
    <section
      class="clientes-modal-section clientes-modal-history-section incidencias-modal-history-section"
    >
      ${renderSectionHeader(
        "Historial",
        `${audit.length} evento${audit.length === 1 ? "" : "s"} registrado${audit.length === 1 ? "" : "s"}`
      )}

      <div
        class="clientes-timeline-list incidencias-timeline-list"
      >
        ${audit
          .map(
            (entry) => `
              <article
                class="clientes-timeline-card incidencias-timeline-card ${entry.event.includes("created") ? "is-created" : ""}"
                data-audit-id="${attr(entry.id)}"
              >
                <div
                  class="clientes-timeline-accent incidencias-timeline-accent"
                ></div>

                <div
                  class="clientes-timeline-main incidencias-timeline-main"
                >
                  <div
                    class="clientes-timeline-title-row incidencias-timeline-title-row"
                  >
                    <strong
                      class="clientes-timeline-title incidencias-timeline-title"
                    >${escapeHtml(entry.event)}</strong>

                    <span
                      class="clientes-timeline-kind incidencias-timeline-kind"
                    >${escapeHtml(entry.source)}</span>
                  </div>

                  <p
                    class="clientes-timeline-body incidencias-timeline-body"
                  >
                    ${escapeHtml(
                      entry.schemaVersion
                        ? `schemaVersion ${entry.schemaVersion}`
                        : "Evento registrado"
                    )}
                  </p>
                </div>

                <div
                  class="clientes-timeline-meta incidencias-timeline-meta"
                >
                  <strong>${escapeHtml(entry.source)}</strong>
                  <span>${escapeHtml(formatDate(entry.at))}</span>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderFooter(
  vm = {}
) {
  const email =
    getEmail(
      vm.detail
    );

  const phone =
    getPhone(
      vm.detail
    );

  return `
    <footer
      class="clientes-modal-footer incidencias-modal-footer"
      data-modal-footer="true"
    >
      <button
        type="button"
        data-detail-action="${DETAIL_ACTIONS.CLOSE}"
        class="clientes-modal-submit-btn incidencias-modal-submit-btn"
      >
        Cerrar
      </button>

      <div class="clientes-modal-footer-actions">
        ${
          email
            ? `<a
                href="${attr(formatMailHref(email))}"
                class="clientes-modal-footer-link incidencias-modal-view-btn"
              >${icon("mail")} Email</a>`
            : ""
        }

        ${
          phone
            ? `<a
                href="${attr(formatPhoneHref(phone))}"
                class="clientes-modal-footer-link incidencias-modal-view-btn"
              >${icon("phone")} Llamar</a>`
            : ""
        }
      </div>
    </footer>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function renderClientesDetailModal(
  input = {}
) {
  const vm =
    buildVm(
      input
    );

  if (
    !vm.open
  ) {
    return "";
  }

  const detail =
    vm.detail;

  const clienteId =
    vm.clienteId ||
    getClienteId(
      detail
    );

  const status =
    getStatus(
      detail
    );

  const type =
    getType(
      detail
    );

  const title =
    getDisplayName(
      detail
    );

  const fiscalName =
    getFiscalName(
      detail
    );

  const contactName =
    getContactName(
      detail
    );

  const email =
    getEmail(
      detail
    );

  const phone =
    getPhone(
      detail
    );

  const city =
    getCity(
      detail
    );

  const province =
    getProvince(
      detail
    );

  const updatedAgo =
    formatRelativeDate(
      getUpdatedAt(
        detail
      )
    );

  const createdAt =
    formatDate(
      getCreatedAt(
        detail
      )
    );

  const total =
    getTotalAmount(
      detail
    );

  const currency =
    getCurrency(
      detail
    );

  return `
    <section
      id="${MODAL_ID}"
      class="clientes-modal-root incidencias-modal-root"
      data-clientes-modal-root="true"
      data-incidencias-modal-root="true"
      data-template-version="${attr(CLIENTES_MODAL_TEMPLATE_VERSION)}"
      data-cliente-id="${attr(clienteId)}"
      data-open="true"
      data-read-only="true"
      data-backend-contract="v4-readonly"
      data-compatible-index="v6"
      data-compatible-api="v4"
      data-submitting="${vm.submitting ? "true" : "false"}"
    >
      <div
        class="clientes-modal-overlay incidencias-modal-overlay"
        data-clientes-modal-overlay="true"
        data-incidencias-modal-overlay="true"
      >
        <div
          id="${PANEL_ID}"
          class="${joinClasses(
            "clientes-modal-panel incidencias-modal-panel",
            vm.submitting
              ? "is-submitting"
              : ""
          )}"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clientes-modal-title"
          aria-describedby="clientes-modal-summary"
          tabindex="-1"
          data-clientes-modal-panel="true"
          data-incidencias-modal-panel="true"
        >
          <header
            class="clientes-modal-header incidencias-modal-header"
          >
            <div
              class="clientes-modal-hero incidencias-modal-hero"
            >
              ${renderAvatar(detail)}

              <div
                class="clientes-modal-hero-content incidencias-modal-hero-content"
              >
                <div
                  class="clientes-modal-hero-chips incidencias-modal-hero-chips"
                >
                  <button
                    type="button"
                    data-detail-action="${DETAIL_ACTIONS.COPY_ID}"
                    data-cliente-id="${attr(clienteId)}"
                    data-copy-value="${attr(clienteId)}"
                    class="clientes-modal-id-chip incidencias-modal-id-chip"
                    aria-label="Copiar ID de cliente"
                  >
                    ${escapeHtml(clienteId || "—")}
                  </button>

                  ${renderChip(
                    statusLabel(status),
                    `status-${statusClass(status)}`
                  )}

                  ${renderChip(
                    typeLabel(type),
                    "category"
                  )}

                  ${
                    city
                      ? renderChip(
                          city,
                          "category"
                        )
                      : ""
                  }
                </div>

                <h2
                  id="clientes-modal-title"
                  class="clientes-modal-title incidencias-modal-title"
                >
                  ${escapeHtml(title)}
                </h2>

                <span
                  id="clientes-modal-summary"
                  class="clientes-modal-updated incidencias-modal-updated"
                >
                  ${escapeHtml(contactName)}
                  ${email ? ` · ${escapeHtml(email)}` : ""}
                  ${phone ? ` · ${escapeHtml(phone)}` : ""}
                  · Última actualización ${escapeHtml(updatedAgo)}
                </span>
              </div>
            </div>

            <button
              type="button"
              data-detail-action="${DETAIL_ACTIONS.CLOSE}"
              aria-label="Cerrar modal"
              class="clientes-modal-close-btn incidencias-modal-close-btn"
            >
              ${icon("close")}
            </button>
          </header>

          <main
            class="clientes-modal-body incidencias-modal-body"
          >
            <div
              data-modal-feedback-slot="true"
              aria-live="polite"
            >
              ${renderFeedbackBox(vm)}
            </div>

            <div
              class="clientes-modal-meta-grid incidencias-modal-meta-grid"
            >
              ${renderMetaField(
                "Cliente",
                getCodigoCliente(detail) ||
                clienteId
              )}

              ${renderMetaField(
                "NIF/CIF",
                getNif(detail) ||
                "—"
              )}

              ${renderMetaField(
                "Creado",
                createdAt
              )}

              ${renderMetaField(
                "Facturado",
                formatMoney(
                  total,
                  currency
                )
              )}

              ${renderMetaField(
                "Ubicación",
                [
                  city,
                  province,
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                "—"
              )}

              ${renderMetaField(
                "Nombre fiscal",
                fiscalName
              )}
            </div>

            ${renderFiscalBlock(detail)}
            ${renderContactBlock(detail)}
            ${renderAddressesBlock(detail)}
            ${renderBillingBlock(detail)}
            ${renderStatsBlock(detail)}
            ${renderPrivacyBlock(detail)}
            ${renderAuditBlock(detail)}
            ${renderFooter(vm)}
          </main>
        </div>
      </div>
    </section>
  `;
}

export function renderClientesDetailModalClosed() {
  return "";
}

/* =========================================================
   DOM BRIDGE
   - Sólo lifecycle DOM del modal.
   - Sin HTTP / Store / Router / Auth.
========================================================= */

function emitBridgeEvent(
  name = "",
  detail = {}
) {
  if (
    !isBrowser() ||
    !name
  ) {
    return false;
  }

  try {
    window.dispatchEvent(
      new CustomEvent(
        name,
        {
          detail:
            safeObject(
              detail
            ),
        }
      )
    );

    return true;
  } catch {
    return false;
  }
}

function hostIsOwned(
  host = null
) {
  return Boolean(
    host &&
    host[
      BRIDGE_HOST_OWNER_KEY
    ] ===
      BRIDGE_OWNER_TOKEN
  );
}

function bindBridgeHost(
  host = null
) {
  if (
    !host ||
    !isBrowser()
  ) {
    return false;
  }

  try {
    bridgeAbortController
      ?.abort?.();
  } catch {
    // noop
  }

  bridgeAbortController =
    typeof AbortController !==
      "undefined"
      ? new AbortController()
      : null;

  const options =
    bridgeAbortController
      ? {
          capture: true,
          signal:
            bridgeAbortController
              .signal,
        }
      : true;

  host.addEventListener(
    "click",
    onBridgeClick,
    options
  );

  return true;
}

function unbindBridgeHost(
  host = bridgeHost
) {
  try {
    bridgeAbortController
      ?.abort?.();
  } catch {
    // noop
  }

  bridgeAbortController =
    null;

  if (
    !host
  ) {
    return true;
  }

  /*
    Fallback para navegadores sin AbortController/signal.
  */
  try {
    host.removeEventListener(
      "click",
      onBridgeClick,
      true
    );

  } catch {
    // noop
  }

  return true;
}

function ensureBridgeHost() {
  if (
    !isBrowser()
  ) {
    return null;
  }

  if (
    bridgeHost
      ?.isConnected &&
    hostIsOwned(
      bridgeHost
    )
  ) {
    return bridgeHost;
  }

  let candidate =
    document.querySelector(
      MODAL_HOST_SELECTOR
    );

  /*
    Hot reload / versión anterior:
    no heredamos listeners ni ownership de otro módulo.
  */
  if (
    candidate &&
    !hostIsOwned(
      candidate
    )
  ) {
    try {
      candidate.remove();
    } catch {
      try {
        candidate.innerHTML =
          "";
      } catch {
        // noop
      }
    }

    candidate =
      null;
  }

  bridgeHost =
    candidate ||
    document.createElement(
      "div"
    );

  try {
    bridgeHost[
      BRIDGE_HOST_OWNER_KEY
    ] =
      BRIDGE_OWNER_TOKEN;
  } catch {
    // noop
  }

  bridgeHost.setAttribute(
    "data-clientes-detail-modal-host",
    "true"
  );

  bridgeHost.setAttribute(
    "data-owner",
    CLIENTES_MODAL_TEMPLATE_VERSION
  );

  bridgeHost.setAttribute(
    "data-runtime-owner",
    "clientes-detail-modal-v4"
  );

  if (
    !bridgeHost.isConnected
  ) {
    document.body
      .appendChild(
        bridgeHost
      );
  }

  bindBridgeHost(
    bridgeHost
  );

  return bridgeHost;
}

const modalLifecycle = createModalLifecycle({
  getPanel: () => bridgeHost?.querySelector("[data-clientes-modal-panel='true']"),
  onEscape: () => closeBridge(),
  bodyClasses: ['clientes-modal-open', 'clientes-detail-open'],
});

function syncBodyModalClass(detailOpen = false) {
  return detailOpen
    ? modalLifecycle.activate({ opener: bridgeReturnFocus })
    : modalLifecycle.deactivate({ restoreFocus: false });
}

function paintBridge({
  focusPanel = false,
} = {}) {
  const host =
    ensureBridgeHost();

  if (!host) {
    return false;
  }

  host.innerHTML =
    bridgeState.open
      ? renderClientesDetailModal({
          open:
            true,

          detail:
            bridgeState.detail,

          feedbackMessage:
            bridgeState
              .feedbackMessage,

          feedbackType:
            bridgeState
              .feedbackType,
        })
      : "";

  syncBodyModalClass(
    bridgeState.open
  );

  if (
    focusPanel &&
    bridgeState.open
  ) {
    try {
      host
        .querySelector(
          "[data-clientes-modal-panel='true'], [data-incidencias-modal-panel='true']"
        )
        ?.focus?.({
          preventScroll:
            true,
        });
    } catch {
      // noop
    }
  }

  return true;
}

function updateFeedbackSlot() {
  const slot =
    bridgeHost
      ?.querySelector?.(
        "[data-modal-feedback-slot='true']"
      );

  if (!slot) {
    return false;
  }

  slot.innerHTML =
    renderFeedbackBox(
      bridgeState
    );

  return true;
}

function restoreBridgeFocus() {
  const target = bridgeReturnFocus;
  bridgeReturnFocus = null;
  return restoreModalFocus(target);
}

function clearFeedbackTimer() {
  if (
    !feedbackTimer
  ) {
    return false;
  }

  if (
    isBrowser()
  ) {
    window.clearTimeout?.(
      feedbackTimer
    );
  }

  feedbackTimer = 0;

  return true;
}

function closeBridge({
  emit = true,
  restoreFocus = true,
} = {}) {
  if (
    !bridgeState.open &&
    !bridgeHost
      ?.innerHTML
  ) {
    syncBodyModalClass(
      false
    );

    return true;
  }

  clearFeedbackTimer();

  bridgeSession += 1;

  const previousDetail =
    bridgeState.detail;

  const clienteId =
    getClienteId(
      previousDetail ||
      {}
    );

  bridgeState = {
    open:
      false,

    detail:
      null,

    clienteId:
      "",

    feedbackMessage:
      "",

    feedbackType:
      "info",
  };

  if (
    bridgeHost &&
    hostIsOwned(
      bridgeHost
    )
  ) {
    bridgeHost.innerHTML =
      "";
  }

  syncBodyModalClass(
    false
  );

  if (emit) {
    emitBridgeEvent(
      "clientes:modal:closed",
      {
        clienteId,

        source:
          CLIENTES_MODAL_TEMPLATE_VERSION,
      }
    );
  }

  if (
    restoreFocus &&
    isBrowser()
  ) {
    const closeSession =
      bridgeSession;

    window.setTimeout?.(
      () => {
        if (
          bridgeSession !==
            closeSession ||
          bridgeState.open
        ) {
          return;
        }

        restoreBridgeFocus();
      },
      0
    );
  } else {
    bridgeReturnFocus =
      null;
  }

  return true;
}

async function copyText(
  value = ""
) {
  const text =
    cleanText(
      value,
      ""
    );

  if (
    !text ||
    !isBrowser()
  ) {
    return false;
  }

  try {
    if (
      !navigator.clipboard
        ?.writeText
    ) {
      return false;
    }

    await navigator.clipboard
      .writeText(
        text
      );

    return true;
  } catch {
    return false;
  }
}

function setFeedback(
  message = "",
  type = "info"
) {
  bridgeState = {
    ...bridgeState,

    feedbackMessage:
      cleanText(
        message,
        ""
      ),

    feedbackType:
      cleanText(
        type,
        "info"
      ),
  };

  updateFeedbackSlot();

  clearFeedbackTimer();

  if (
    bridgeState
      .feedbackMessage &&
    isBrowser()
  ) {
    const expected =
      bridgeState
        .feedbackMessage;

    const session =
      bridgeSession;

    feedbackTimer =
      window.setTimeout?.(
        () => {
          if (
            session !==
              bridgeSession ||
            bridgeState
              .feedbackMessage !==
              expected
          ) {
            return;
          }

          bridgeState = {
            ...bridgeState,

            feedbackMessage:
              "",

            feedbackType:
              "info",
          };

          updateFeedbackSlot();

          feedbackTimer = 0;
        },
        1600
      );
  }

  return true;
}

async function onBridgeClick(
  event = null
) {
  if (
    !bridgeState.open
  ) {
    return;
  }

  const target =
    event
      ?.target
      ?.closest?.(
        "[data-detail-action], [data-clientes-modal-overlay='true']"
      );

  if (
    !target ||
    !bridgeHost
      ?.contains?.(
        target
      )
  ) {
    return;
  }

  const overlayClick =
    target.matches?.(
      "[data-clientes-modal-overlay='true']"
    ) &&
    event?.target ===
      target;

  const action =
    cleanText(
      target
        ?.dataset
        ?.detailAction,
      ""
    );

  if (
    overlayClick ||
    action ===
      DETAIL_ACTIONS.CLOSE
  ) {
    event
      ?.preventDefault?.();

    event
      ?.stopPropagation?.();

    closeBridge();

    return;
  }

  if (
    [
      DETAIL_ACTIONS
        .COPY_ID,

      DETAIL_ACTIONS
        .COPY_EMAIL,

      DETAIL_ACTIONS
        .COPY_PHONE,

      DETAIL_ACTIONS
        .COPY_FIELD,
    ].includes(action)
  ) {
    event
      ?.preventDefault?.();

    event
      ?.stopPropagation?.();

    const value =
      first(
        target
          ?.dataset
          ?.copyValue,

        target
          ?.dataset
          ?.clienteId,

        ""
      );

    const ok =
      await copyText(
        value
      );

    setFeedback(
      ok
        ? "Copiado al portapapeles."
        : "El navegador no permitió copiar automáticamente.",
      ok
        ? "success"
        : "warning"
    );
  }
}

export function openClientesDetailModal(
  detail = {},
  options = {}
) {
  const normalized =
    resolveDetail(
      detail
    );

  const clienteId =
    getClienteId(
      normalized
    );

  if (
    !hasRenderableDetail(
      normalized
    )
  ) {
    return false;
  }

  const wasOpen =
    bridgeState.open;

  const previousDetail =
    bridgeState.detail;

  const sameClient =
    Boolean(
      wasOpen &&
      bridgeState
        .clienteId &&
      clienteId &&
      bridgeState
        .clienteId ===
        clienteId
    );

  if (
    isBrowser() &&
    !wasOpen
  ) {
    const active =
      document.activeElement;

    bridgeReturnFocus =
      active &&
      active !==
        document.body &&
      active?.focus
        ? active
        : null;
  }

  bridgeSession += 1;

  bridgeState = {
    open:
      true,

    detail:
      normalized,

    clienteId,

    feedbackMessage:
      cleanText(
        options
          .feedbackMessage,
        sameClient
          ? bridgeState
              .feedbackMessage
          : ""
      ),

    feedbackType:
      cleanText(
        options
          .feedbackType,
        sameClient
          ? bridgeState
              .feedbackType
          : "info"
      ),
  };

  /*
    Apertura normal = un único mount.
    Re-apertura del mismo objeto exacto no repinta el panel.
  */
  if (
    sameClient &&
    previousDetail ===
      normalized &&
    !options.forceRender
  ) {
    syncBodyModalClass(
      true
    );

    return true;
  }

  paintBridge({
    focusPanel:
      !wasOpen,
  });

  emitBridgeEvent(
    "clientes:modal:open",
    {
      clienteId,

      cliente:
        normalized,

      detail:
        normalized,

      source:
        CLIENTES_MODAL_TEMPLATE_VERSION,
    }
  );

  return true;
}

export function showClientesDetailModal(
  detail = {},
  options = {}
) {
  return openClientesDetailModal(
    detail,
    options
  );
}

export function renderClientesModal(
  detail = {},
  options = {}
) {
  return openClientesDetailModal(
    detail,
    options
  );
}

export function closeClientesDetailModal() {
  return closeBridge();
}

export function destroyClientesDetailModalBridge({
  emit = false,
  restoreFocus = false,
} = {}) {
  closeBridge({
    emit,
    restoreFocus,
  });

  clearFeedbackTimer();
  unbindBridgeHost();

  if (
    bridgeHost &&
    hostIsOwned(
      bridgeHost
    )
  ) {
    try {
      bridgeHost.remove();
    } catch {
      try {
        bridgeHost.innerHTML =
          "";
      } catch {
        // noop
      }
    }
  }

  bridgeHost =
    null;

  bridgeReturnFocus =
    null;

  syncBodyModalClass(
    false
  );

  return true;
}

/* =========================================================
   HELPERS / COMPAT EXPORTS
========================================================= */

export function getClienteDetailId(
  detail = {}
) {
  return getClienteId(
    resolveDetail(
      detail
    )
  );
}

export function getClienteDetailContact(
  detail = {}
) {
  const current =
    resolveDetail(
      detail
    );

  return {
    name:
      getContactName(
        current
      ),

    email:
      getEmail(
        current
      ),

    phone:
      getPhone(
        current
      ),

    username:
      getUsername(
        current
      ),
  };
}

/*
  Compatibilidad con código antiguo:
  nunca simular una edición que el backend no soporta.
*/
export function validateDetailUpdate() {
  return {
    valid:
      false,

    supported:
      false,

    code:
      "CLIENTES_UPDATE_NOT_SUPPORTED",

    message:
      "La edición de clientes no está disponible en el contrato productivo actual.",
  };
}

export function getDetailTemplateSnapshot(
  input = {}
) {
  const detail =
    resolveDetail(
      input
    );

  const raw =
    getRaw(
      detail
    );

  const billingPresent =
    hasKeys(
      raw.billing
    ) ||
    hasKeys(
      raw.facturacion
    ) ||
    Boolean(
      getBillingEmail(
        detail
      )
    );

  const privacyPresent =
    hasKeys(
      raw.privacy
    ) ||
    hasKeys(
      raw.visibility
    ) ||
    safeArray(
      raw.permissions
    ).length > 0;

  const auditPresent =
    getAuditEntries(
      detail
    ).length > 0;

  return {
    version:
      CLIENTES_MODAL_TEMPLATE_VERSION,

    actions:
      DETAIL_ACTIONS,

    clienteId:
      getClienteId(
        detail
      ),

    status:
      getStatus(
        detail
      ),

    avatarSafe:
      Boolean(
        getAvatar(
          detail
        )
      ),

    fields: [
      "clienteId",
      "userId",
      "tipo",
      "nombreFiscal",
      "nif",
      "contactoNombre",
      "contactoEmail",
      "contactoPhone",
      "direccion",
      "status",
      "createdAt",
      "updatedAt",
      "ticketsCount",
      "invoicesCount",
      "totalAmount",
    ],

    sections: {
      hero:
        true,

      meta:
        true,

      fiscal:
        true,

      contact:
        true,

      addresses:
        (
          hasAddress(
            getMainAddress(
              detail
            )
          ) ||
          hasAddress(
            getExplicitFiscalAddress(
              detail
            )
          ) ||
          hasAddress(
            getExplicitServiceAddress(
              detail
            )
          )
        ),

      billing:
        billingPresent,

      stats:
        true,

      privacy:
        privacyPresent,

      audit:
        auditPresent,
    },

    backendContract: {
      detail:
        "GET /api/clientes/:id",

      update:
        false,

      delete:
        false,

      readOnly:
        true,
    },

    compatibility: {
      clientesIndex:
        "v6",

      clientesApi:
        "v4",

      detailCss:
        true,

      incidenciasAliases:
        true,
    },

    policy: {
      templateRenderPure:
        true,

      bridgeOpenCompatible:
        true,

      bridgeHostOwnership:
        true,

      staleBridgeHostReplacement:
        true,

      singleMountOpen:
        true,

      returnFocusNotOverwrittenOnReopen:
        true,

      bodyClassPreservesCreateModal:
        true,

      globalModalClassPreservesOtherDialogs:
        true,

      emptyDetailRejected:
        true,

      statusCssContractExact:
        true,

      validEmailAliasFallback:
        true,

      spaIslandCompatible:
        true,

      detailActionsStable:
        true,

      noHttp:
        true,

      noFetch:
        true,

      noStore:
        true,

      noRouter:
        true,

      noAuth:
        true,

      noLocalStorage:
        true,

      readOnly:
        true,

      noSyntheticBilling:
        true,

      noSyntheticPrivacy:
        true,

      noSyntheticAudit:
        true,

      noDuplicateAddresses:
        true,

      azureSasAvatarRuntimeSafe:
        true,

      externalSignedAvatarRejected:
        true,

      strictBooleanStatus:
        true,

      strictBooleanLegacyBilling:
        true,

      escapeHtml:
        true,

      escapeToClose:
        true,

      overlayToClose:
        true,

      focusTrap:
        true,

      restoreFocus:
        true,

      destroyBridge:
        true,

      incidenciasCssCompatibility:
        true,
    },
  };
}

export const getSnapshot =
  getDetailTemplateSnapshot;

export const renderClienteDetailModal =
  renderClientesDetailModal;

export const renderClienteDetailModalClosed =
  renderClientesDetailModalClosed;

export const renderDetailModal =
  renderClientesDetailModal;

export const renderDetailModalClosed =
  renderClientesDetailModalClosed;

export const open =
  openClientesDetailModal;

export const show =
  showClientesDetailModal;

export const render =
  renderClientesModal;

export const close =
  closeClientesDetailModal;

export const destroy =
  destroyClientesDetailModalBridge;

export const dispose =
  destroyClientesDetailModalBridge;

const ClientesDetailModalBridge =
  Object.freeze({
    open:
      openClientesDetailModal,

    show:
      showClientesDetailModal,

    render:
      renderClientesModal,

    close:
      closeClientesDetailModal,

    destroy:
      destroyClientesDetailModalBridge,

    dispose:
      destroyClientesDetailModalBridge,

    renderHtml:
      renderClientesDetailModal,

    renderClosed:
      renderClientesDetailModalClosed,

    getSnapshot:
      getDetailTemplateSnapshot,

    version:
      CLIENTES_MODAL_TEMPLATE_VERSION,

    actions:
      DETAIL_ACTIONS,
  });

export default ClientesDetailModalBridge;
