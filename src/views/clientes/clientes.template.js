/* =========================================================
   Onion Support - Clientes Template
   Archivo: /src/views/clientes/clientes.template.js

   PRODUCTIVO · TEMPLATE PURO · INDEX V6 / API V4 · V5

   Responsabilidad:
   - Renderizar exclusivamente la vista/listado de Clientes.
   - Consumir el modelo canónico entregado por clientes.api.js/index.js.
   - Mantener el contrato DOM/clases/data-* usado por index.js y CSS.
   - Filtrar, ordenar y limitar filas sólo en presentación.
   - Mantener 20 filas visibles iniciales y máximo visual de 500.
   - Escapar todo contenido dinámico.
   - Permitir avatar SAS únicamente cuando pertenece a Azure Blob.
   - Interpretar booleanos de dominio de forma estricta.
   - No hacer HTTP, fetch, DOM imperativo, Store, Router, Auth
     ni localStorage.
========================================================= */

export const CLIENTES_TEMPLATE_VERSION =
  "clientes.template.backend-contract.v5.index-v6-api-v4";

export const CLIENTES_TABLE_TEMPLATE_VERSION =
  CLIENTES_TEMPLATE_VERSION;

export const CLIENTES_VIEW_TEMPLATE_VERSION =
  CLIENTES_TEMPLATE_VERSION;

export const CLIENTES_ACTIONS = Object.freeze({
  REFRESH: "refresh",

  CREATE_OPEN: "create-open",
  CREATE: "create-open",

  FILTER: "filter",
  SORT_TOGGLE: "sort-toggle",

  CLEAR_FILTERS: "clear-filters",
  CLEAR_SEARCH: "clear-search",

  OPEN_DETAIL: "open-detail",
  DETAIL: "open-detail",

  LOAD_MORE: "load-more",
  EXPORT: "export",
});

export const CLIENTES_TABLE_ACTIONS =
  CLIENTES_ACTIONS;

const DEFAULT_ROUTE = "/clientes";
const DEFAULT_VISIBLE_ROWS = 20;
const MAX_VISIBLE_ROWS = 500;
const DEFAULT_CURRENCY = "EUR";
const DEFAULT_SORT_ORDER = "desc";
const TABLE_SCALE = "110";
const AVATAR_TONE_COUNT = 10;

export const CLIENTES_DEFAULT_VISIBLE_ROWS =
  DEFAULT_VISIBLE_ROWS;

export const CLIENTES_DEFAULT_PAGE_SIZE =
  DEFAULT_VISIBLE_ROWS;

export const CLIENTES_MAX_VISIBLE_ROWS =
  MAX_VISIBLE_ROWS;

const FILTERS = Object.freeze([
  {
    key: "all",
    label: "Todos",
  },
  {
    key: "active",
    label: "Activos",
  },
  {
    key: "pending",
    label: "Pendientes",
  },
  {
    key: "blocked",
    label: "Bloqueados",
  },
]);

export const CLIENTES_TABLE_COLUMNS =
  Object.freeze([
    {
      key: "main",
      label: "Cliente",
      colClass:
        "clientes-col clientes-col--main",
      thClass:
        "clientes-th clientes-th--main clientes-col clientes-col--main",
      cellClass:
        "clientes-cell clientes-cell--main",
    },
    {
      key: "status",
      label: "Estado",
      colClass:
        "clientes-col clientes-col--status",
      thClass:
        "clientes-th clientes-th--status clientes-col clientes-col--status",
      cellClass:
        "clientes-cell clientes-cell--status",
    },
    {
      key: "created",
      label: "Alta",
      colClass:
        "clientes-col clientes-col--date clientes-col--created",
      thClass:
        "clientes-th clientes-th--date clientes-th--created clientes-col clientes-col--date clientes-col--created",
      cellClass:
        "clientes-cell clientes-cell--date clientes-cell--created",
    },
    {
      key: "contact",
      label: "Contacto",
      colClass:
        "clientes-col clientes-col--email clientes-col--contact",
      thClass:
        "clientes-th clientes-th--email clientes-th--contact clientes-col clientes-col--email clientes-col--contact",
      cellClass:
        "clientes-cell clientes-cell--email clientes-cell--contact",
    },
    {
      key: "amount",
      label: "Importe",
      colClass:
        "clientes-col clientes-col--amount clientes-col--importe",
      thClass:
        "clientes-th clientes-th--amount clientes-th--importe clientes-col clientes-col--amount clientes-col--importe",
      cellClass:
        "clientes-cell clientes-cell--amount clientes-cell--importe",
    },
  ]);

/* =========================================================
   SAFE HELPERS
========================================================= */

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
  No aplanar arrays de dominio.
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

function clamp(
  value = 0,
  min = 0,
  max = 1
) {
  return Math.min(
    Math.max(
      number(value, min),
      min
    ),
    max
  );
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

function normalizeSearch(
  value = ""
) {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9@._+\-\s]+/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function htmlAttrs(
  attributes = {}
) {
  return Object.entries(
    safeObject(
      attributes,
      {}
    )
  )
    .map(
      ([
        name,
        value,
      ]) => {
        if (
          !name ||
          value === false ||
          value === null ||
          value === undefined
        ) {
          return "";
        }

        if (
          value === true
        ) {
          return escapeHtml(
            name
          );
        }

        return (
          `${escapeHtml(name)}="${escapeHtml(value)}"`
        );
      }
    )
    .filter(Boolean)
    .join(" ");
}

/* =========================================================
   AVATAR URL POLICY
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
    parsed
      ?.searchParams &&
    (
      parsed.searchParams
        .has("sig") ||
      parsed.searchParams
        .has("signature") ||
      parsed.searchParams
        .has("sas")
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
      SAS runtime: sólo Azure Blob.
      Un `sig=` externo queda rechazado.
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

function hashText(
  value = ""
) {
  const source =
    cleanText(
      value,
      "onion"
    );

  let output =
    2166136261;

  for (
    let index = 0;
    index < source.length;
    index += 1
  ) {
    output ^=
      source.charCodeAt(
        index
      );

    output +=
      (output << 1) +
      (output << 4) +
      (output << 7) +
      (output << 8) +
      (output << 24);
  }

  return Math.abs(
    output >>> 0
  );
}

function initials(
  value = ""
) {
  return (
    cleanText(value, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]
            ?.toUpperCase() ||
          ""
      )
      .join("")
      .slice(0, 2) ||
    "CL"
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
    users:
      `<svg ${common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,

    refresh:
      `<svg ${common}><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><path d="M21 21v-5h-5"/></svg>`,

    plus:
      `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,

    search:
      `<svg ${common}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,

    close:
      `<svg ${common}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,

    alert:
      `<svg ${common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,

    euro:
      `<svg ${common}><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2C8.9 4 5 7.6 5 12s3.9 8 8.8 8A7.7 7.7 0 0 0 19 18"/></svg>`,

    chevronDown:
      `<svg ${common}><path d="m6 9 6 6 6-6"/></svg>`,

    calendar:
      `<svg ${common}><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,

    mail:
      `<svg ${common}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,

    phone:
      `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.2a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`,

    shield:
      `<svg ${common}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.5a1.2 1.2 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`,
  };

  return (
    icons[name] ||
    icons.users
  );
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatNumber(
  value = 0
) {
  try {
    return new Intl.NumberFormat(
      "es-ES"
    ).format(
      number(
        value,
        0
      )
    );
  } catch {
    return String(
      number(
        value,
        0
      )
    );
  }
}

function formatMoney(
  value = 0,
  currency =
    DEFAULT_CURRENCY
) {
  try {
    return new Intl.NumberFormat(
      "es-ES",
      {
        style: "currency",
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
    const timestamp =
      value.getTime();

    return Number.isFinite(
      timestamp
    )
      ? timestamp
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

  return Number.isFinite(
    parsed
  )
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
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    ).format(
      new Date(
        timestamp
      )
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
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    ).format(
      new Date(
        timestamp
      )
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

  const diffMinutes =
    Math.round(
      (
        timestamp -
        Date.now()
      ) /
      60_000
    );

  const absoluteMinutes =
    Math.abs(
      diffMinutes
    );

  if (
    absoluteMinutes < 1
  ) {
    return "Ahora mismo";
  }

  if (
    absoluteMinutes < 60
  ) {
    return (
      diffMinutes > 0
        ? `En ${absoluteMinutes} min`
        : `Hace ${absoluteMinutes} min`
    );
  }

  const hours =
    Math.round(
      absoluteMinutes /
      60
    );

  if (
    hours < 24
  ) {
    return (
      diffMinutes > 0
        ? `En ${hours} h`
        : `Hace ${hours} h`
    );
  }

  const days =
    Math.round(
      hours /
      24
    );

  if (
    days <= 7
  ) {
    return (
      diffMinutes > 0
        ? `En ${days} día${days === 1 ? "" : "s"}`
        : `Hace ${days} día${days === 1 ? "" : "s"}`
    );
  }

  return formatShortDate(
    value
  );
}

function normalizeSort(
  value = ""
) {
  const order =
    normalizeKey(
      value ||
      DEFAULT_SORT_ORDER
    );

  if (
    [
      "asc",
      "ascending",
      "oldest",
      "antiguos",
    ].includes(order)
  ) {
    return "asc";
  }

  return "desc";
}

function nextSort(
  value =
    DEFAULT_SORT_ORDER
) {
  return (
    normalizeSort(
      value
    ) === "asc"
      ? "desc"
      : "asc"
  );
}

function sortLabel(
  value =
    DEFAULT_SORT_ORDER
) {
  return (
    normalizeSort(
      value
    ) === "asc"
      ? "Fecha ↑"
      : "Fecha ↓"
  );
}

/* =========================================================
   CANONICAL CLIENT PROJECTION
========================================================= */

function unwrapCliente(
  value = {}
) {
  const item =
    safeObject(
      value,
      {}
    );

  return safeObject(
    first(
      item.cliente,
      item.client,
      item.customer,
      item.item,
      item.detail,

      item.data
        ?.cliente,

      item.data
        ?.client,

      item.data
        ?.customer,

      item.data
        ?.item,

      item.data,
      item
    ),
    item
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

  if (
    !email ||
    !email.includes("@")
  ) {
    return "";
  }

  return email;
}

function normalizeClienteType(
  value = ""
) {
  const type =
    normalizeKey(
      value
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

  return "cliente";
}

function normalizeClienteStatus(
  value = "",
  source = {}
) {
  const raw =
    safeObject(
      source,
      {}
    );

  const status =
    normalizeKey(
      first(
        value,
        raw.status,
        raw.estado,
        raw.state,
        ""
      )
    );

  if (
    [
      "pending",
      "pendiente",
      "new",
      "nuevo",
      "invited",
    ].includes(status)
  ) {
    return "pending";
  }

  if (
    [
      "blocked",
      "bloqueado",
      "suspended",
      "locked",
    ].includes(status)
  ) {
    return "blocked";
  }

  if (
    [
      "inactive",
      "inactivo",
      "disabled",
      "archived",
      "deleted",
    ].includes(status)
  ) {
    return "inactive";
  }

  if (
    [
      "vip",
      "premium",
    ].includes(status)
  ) {
    return "vip";
  }

  if (
    [
      "active",
      "activo",
      "enabled",
      "ok",
    ].includes(status)
  ) {
    return "active";
  }

  const blocked =
    parseBoolean(
      raw.blocked,
      null
    );

  const disabled =
    parseBoolean(
      raw.disabled,
      null
    );

  const active =
    parseBoolean(
      first(
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

function statusBucket(
  item = {}
) {
  const status =
    normalizeClienteStatus(
      item.status,
      item
    );

  if (
    status === "pending"
  ) {
    return "pending";
  }

  if (
    status === "blocked" ||
    status === "inactive"
  ) {
    return "blocked";
  }

  return "active";
}

export function normalizeClienteModel(
  item = {}
) {
  const source =
    unwrapCliente(
      item
    );

  const raw =
    safeObject(
      source.raw,
      source
    );

  const contacto =
    safeObject(
      first(
        source.contacto,
        raw.contacto,
        {}
      ),
      {}
    );

  const direccion =
    safeObject(
      first(
        source.direccion,
        source.address,
        raw.direccion,
        raw.address,
        {}
      ),
      {}
    );

  const clienteId =
    cleanText(
      first(
        source.clienteId,
        source.clientId,
        source.customerId,
        source.id,
        source._id,
        source.uid,

        raw.clienteId,
        raw.clientId,
        raw.customerId,
        raw.id,
        raw._id,
        raw.uid,
        ""
      ),
      ""
    );

  const userId =
    cleanText(
      first(
        source.userId,
        raw.userId,
        source.usuarioId,
        raw.usuarioId,
        ""
      ),
      ""
    );

  const nombreFiscal =
    cleanText(
      first(
        source.nombreFiscal,
        source.razonSocial,
        source.businessName,
        source.companyName,
        source.displayName,
        source.name,
        source.nombre,

        raw.nombreFiscal,
        raw.razonSocial,
        raw.displayName,
        raw.name,

        clienteId,
        "Cliente"
      ),
      "Cliente"
    );

  const contactoNombre =
    cleanText(
      first(
        source.contactoNombre,
        source.nombreContacto,
        contacto.nombre,
        contacto.name,
        raw.contactoNombre,
        nombreFiscal,
        ""
      ),
      ""
    );

  const email =
    normalizeEmail(
      first(
        source.email,
        source.emailLower,
        source.contactoEmail,
        source.contactEmail,
        contacto.email,
        contacto.emailLower,
        raw.email,
        raw.contactoEmail,
        ""
      )
    );

  const phone =
    cleanText(
      first(
        source.phone,
        source.telefono,
        source.contactoPhone,
        contacto.phone,
        contacto.telefono,
        raw.phone,
        raw.telefono,
        raw.contactoPhone,
        ""
      ),
      ""
    );

  const nif =
    cleanText(
      first(
        source.nif,
        source.cif,
        source.taxId,
        raw.nif,
        raw.cif,
        raw.taxId,
        ""
      ),
      ""
    ).toUpperCase();

  const city =
    cleanText(
      first(
        source.city,
        source.ciudad,
        direccion.city,
        direccion.ciudad,
        raw.city,
        raw.ciudad,
        ""
      ),
      ""
    );

  const tipo =
    normalizeClienteType(
      first(
        source.tipo,
        source.type,
        raw.tipo,
        raw.type,
        ""
      )
    );

  const status =
    normalizeClienteStatus(
      first(
        source.status,
        source.estado,
        raw.status,
        raw.estado,
        ""
      ),
      {
        ...raw,
        ...source,
      }
    );

  const avatar =
    safeAvatarUrl(
      first(
        source.avatar,
        source.avatarUrl,
        source.photoUrl,
        source.picture,

        raw.avatar,
        raw.avatarUrl,
        raw.photoUrl,
        raw.picture,
        ""
      )
    );

  const createdAt =
    first(
      source.createdAt,
      raw.createdAt,
      null
    );

  const updatedAt =
    first(
      source.updatedAt,
      source.lastActivityAt,
      raw.updatedAt,
      raw.lastActivityAt,
      createdAt,
      null
    );

  const totalAmount =
    number(
      first(
        source.totalAmount,
        source.totalImporte,
        source.facturasTotal,

        raw.totalAmount,
        raw.totalImporte,
        raw.facturasTotal,
        0
      ),
      0
    );

  return {
    ...source,

    /*
      El template no persiste raw; sólo lo conserva en memoria
      para compatibilidad de proyección.
    */
    raw,

    id:
      clienteId,

    clienteId,
    clientId:
      clienteId,

    customerId:
      clienteId,

    userId,

    code:
      cleanText(
        first(
          source.code,
          source.codigo,
          clienteId
        ),
        clienteId ||
        "CLI-SIN-ID"
      ),

    codigo:
      cleanText(
        first(
          source.codigo,
          source.code,
          clienteId
        ),
        clienteId ||
        "CLI-SIN-ID"
      ),

    nombreFiscal,

    razonSocial:
      cleanText(
        first(
          source.razonSocial,
          nombreFiscal
        ),
        nombreFiscal
      ),

    displayName:
      cleanText(
        first(
          source.displayName,
          nombreFiscal
        ),
        nombreFiscal
      ),

    name:
      cleanText(
        first(
          source.name,
          nombreFiscal
        ),
        nombreFiscal
      ),

    nombre:
      cleanText(
        first(
          source.nombre,
          nombreFiscal
        ),
        nombreFiscal
      ),

    contactoNombre,
    nombreContacto:
      contactoNombre,

    contacto: {
      ...contacto,

      nombre:
        contactoNombre,

      name:
        contactoNombre,

      email,
      emailLower:
        email,

      phone,
      telefono:
        phone,
    },

    email,
    emailLower:
      email,

    phone,
    telefono:
      phone,

    nif,
    cif:
      nif,

    taxId:
      nif,

    direccion: {
      ...direccion,

      ciudad:
        city,

      city,
    },

    address: {
      ...direccion,

      ciudad:
        city,

      city,
    },

    city,
    ciudad:
      city,

    tipo,
    type:
      tipo,

    status,
    estado:
      status,

    active:
      status === "active" ||
      status === "vip",

    isActive:
      status === "active" ||
      status === "vip",

    blocked:
      status === "blocked",

    vip:
      status === "vip",

    avatar,
    avatarUrl:
      avatar,

    createdAt,
    updatedAt,

    lastActivityAt:
      first(
        source.lastActivityAt,
        updatedAt,
        createdAt,
        null
      ),

    totalAmount,
    totalImporte:
      totalAmount,

    facturasTotal:
      totalAmount,
  };
}

function getClienteId(
  item = {}
) {
  return cleanText(
    normalizeClienteModel(
      item
    ).clienteId,
    ""
  );
}

function getClienteCode(
  item = {}
) {
  const current =
    normalizeClienteModel(
      item
    );

  return cleanText(
    first(
      current.code,
      current.codigo,
      current.clienteId,
      "CLI-SIN-ID"
    ),
    "CLI-SIN-ID"
  );
}

function getClienteName(
  item = {}
) {
  return cleanText(
    normalizeClienteModel(
      item
    ).nombreFiscal,
    "Cliente"
  );
}

function getClienteEmail(
  item = {}
) {
  return normalizeClienteModel(
    item
  ).email;
}

function getClientePhone(
  item = {}
) {
  return cleanText(
    normalizeClienteModel(
      item
    ).phone,
    ""
  );
}

function getClienteCity(
  item = {}
) {
  return cleanText(
    normalizeClienteModel(
      item
    ).city,
    ""
  );
}

function getClienteNif(
  item = {}
) {
  return cleanText(
    normalizeClienteModel(
      item
    ).nif,
    ""
  ).toUpperCase();
}

function getClienteType(
  item = {}
) {
  return normalizeClienteModel(
    item
  ).tipo;
}

function getClienteTypeLabel(
  item = {}
) {
  const type =
    getClienteType(
      item
    );

  if (
    type === "empresa"
  ) {
    return "Empresa";
  }

  if (
    type === "particular"
  ) {
    return "Particular";
  }

  return "Cliente";
}

function getClienteStatus(
  item = {}
) {
  return normalizeClienteModel(
    item
  ).status;
}

function getClienteStatusLabel(
  itemOrStatus = {}
) {
  const status =
    typeof itemOrStatus ===
      "string"
      ? normalizeClienteStatus(
          itemOrStatus
        )
      : getClienteStatus(
          itemOrStatus
        );

  const labels = {
    active: "Activo",
    vip: "VIP",
    pending: "Pendiente",
    blocked: "Bloqueado",
    inactive: "Inactivo",
  };

  return (
    labels[status] ||
    "Activo"
  );
}

function getClienteCreatedAt(
  item = {}
) {
  return normalizeClienteModel(
    item
  ).createdAt;
}

function getClienteUpdatedAt(
  item = {}
) {
  const current =
    normalizeClienteModel(
      item
    );

  return first(
    current.lastActivityAt,
    current.updatedAt,
    current.createdAt,
    null
  );
}

function getClienteAmount(
  item = {}
) {
  return number(
    normalizeClienteModel(
      item
    ).totalAmount,
    0
  );
}

function getClienteAvatar(
  item = {}
) {
  return normalizeClienteModel(
    item
  ).avatar;
}

function getClienteInitials(
  item = {}
) {
  const current =
    normalizeClienteModel(
      item
    );

  const name =
    cleanText(
      first(
        current.contactoNombre,
        current.nombreFiscal
      ),
      ""
    );

  if (
    name &&
    !name.includes("@")
  ) {
    return initials(
      name
    );
  }

  const emailLocal =
    current.email
      .split("@")[0] ||
    "";

  if (
    emailLocal
  ) {
    return initials(
      emailLocal.replace(
        /[._+\-\d]+/g,
        " "
      )
    );
  }

  return initials(
    first(
      current.code,
      current.clienteId,
      "CL"
    )
  );
}

function clienteSortTime(
  item = {}
) {
  return (
    toTimestamp(
      getClienteUpdatedAt(
        item
      )
    ) ||
    toTimestamp(
      getClienteCreatedAt(
        item
      )
    )
  );
}

export function normalizeClientesCollection(
  items = []
) {
  const map =
    new Map();

  let anonymousIndex = 0;

  for (
    const value
    of safeArray(items)
  ) {
    if (
      !isObject(value)
    ) {
      continue;
    }

    const normalized =
      normalizeClienteModel(
        value
      );

    const id =
      normalized.clienteId;

    const key =
      id
        ? id.toLowerCase()
        : `anonymous:${anonymousIndex++}`;

    if (
      map.has(key)
    ) {
      const previous =
        map.get(key);

      map.set(
        key,
        normalizeClienteModel({
          ...previous,
          ...normalized,

          raw: {
            ...safeObject(
              previous.raw
            ),

            ...safeObject(
              normalized.raw
            ),
          },
        })
      );

      continue;
    }

    map.set(
      key,
      normalized
    );
  }

  return [
    ...map.values(),
  ].sort(
    (a, b) => {
      const diff =
        clienteSortTime(b) -
        clienteSortTime(a);

      if (
        diff !== 0
      ) {
        return diff;
      }

      return getClienteName(a)
        .localeCompare(
          getClienteName(b),
          "es",
          {
            numeric: true,
            sensitivity: "base",
          }
        );
    }
  );
}

/* =========================================================
   VIEW MODEL
========================================================= */

function envelopeObjects(
  payload = null,
  maxDepth = 6
) {
  const output = [];

  const queue = [
    {
      value:
        payload,

      depth:
        0,
    },
  ];

  const seen =
    new Set();

  while (
    queue.length
  ) {
    const {
      value,
      depth,
    } =
      queue.shift();

    if (
      !isObject(value) ||
      seen.has(value) ||
      depth > maxDepth
    ) {
      continue;
    }

    seen.add(value);
    output.push(value);

    for (
      const key
      of [
        "data",
        "payload",
        "result",
        "response",
        "body",
      ]
    ) {
      if (
        isObject(
          value[key]
        )
      ) {
        queue.push({
          value:
            value[key],

          depth:
            depth + 1,
        });
      }
    }
  }

  return output;
}

function resolveItems(
  input = {}
) {
  if (
    Array.isArray(input)
  ) {
    return input;
  }

  for (
    const source
    of envelopeObjects(
      input
    )
  ) {
    for (
      const key
      of [
        "items",
        "clientes",
        "clients",
        "customers",
        "rows",
        "results",
      ]
    ) {
      if (
        Array.isArray(
          source[key]
        )
      ) {
        return source[key];
      }
    }
  }

  return [];
}

function normalizeFilter(
  value = "all"
) {
  const filter =
    normalizeKey(
      value ||
      "all"
    ) ||
    "all";

  return FILTERS.some(
    (item) =>
      item.key ===
      filter
  )
    ? filter
    : "all";
}

function clienteSearchText(
  item = {}
) {
  const current =
    normalizeClienteModel(
      item
    );

  return normalizeSearch(
    [
      current.clienteId,
      current.userId,
      current.code,
      current.nombreFiscal,
      current.contactoNombre,
      current.email,
      current.phone,
      current.city,
      current.nif,
      current.tipo,
      current.status,
    ].join(" ")
  );
}

function filterAndSort(
  items = [],
  {
    filter = "all",
    search = "",
    sortOrder =
      DEFAULT_SORT_ORDER,
  } = {}
) {
  const normalizedFilter =
    normalizeFilter(
      filter
    );

  const query =
    normalizeSearch(
      search
    );

  const terms =
    query
      .split(/\s+/)
      .filter(Boolean);

  const order =
    normalizeSort(
      sortOrder
    );

  return normalizeClientesCollection(
    items
  )
    .filter(
      (item) => {
        if (
          normalizedFilter !==
            "all" &&
          statusBucket(
            item
          ) !==
            normalizedFilter
        ) {
          return false;
        }

        if (
          !terms.length
        ) {
          return true;
        }

        const haystack =
          clienteSearchText(
            item
          );

        return terms.every(
          (term) =>
            haystack.includes(
              term
            )
        );
      }
    )
    .sort(
      (a, b) => {
        const diff =
          order === "asc"
            ? (
                clienteSortTime(a) -
                clienteSortTime(b)
              )
            : (
                clienteSortTime(b) -
                clienteSortTime(a)
              );

        if (
          diff !== 0
        ) {
          return diff;
        }

        return getClienteName(a)
          .localeCompare(
            getClienteName(b),
            "es",
            {
              numeric: true,
              sensitivity: "base",
            }
          );
      }
    );
}

function filterCounts(
  items = []
) {
  const counts = {
    all: 0,
    active: 0,
    pending: 0,
    blocked: 0,
  };

  for (
    const item
    of normalizeClientesCollection(
      items
    )
  ) {
    const bucket =
      statusBucket(
        item
      );

    counts.all += 1;
    counts[bucket] += 1;
  }

  return counts;
}

function computeStats(
  items = [],
  incoming = {}
) {
  const normalized =
    normalizeClientesCollection(
      items
    );

  const counts =
    filterCounts(
      normalized
    );

  const source =
    safeObject(
      incoming,
      {}
    );

  const calculatedAmount =
    normalized.reduce(
      (
        total,
        item
      ) =>
        total +
        getClienteAmount(
          item
        ),
      0
    );

  const calculatedLastUpdate =
    normalized.reduce(
      (
        latest,
        item
      ) =>
        Math.max(
          latest,
          clienteSortTime(
            item
          )
        ),
      0
    );

  return {
    total:
      normalized.length,

    activeCount:
      counts.active,

    pendingCount:
      counts.pending,

    blockedCount:
      counts.blocked,

    vipCount:
      normalized.filter(
        (item) =>
          getClienteStatus(
            item
          ) === "vip"
      ).length,

    totalAmount:
      number(
        first(
          source.totalAmount,
          source.invoiceTotal,
          calculatedAmount
        ),
        calculatedAmount
      ),

    invoiceTotal:
      number(
        first(
          source.invoiceTotal,
          source.totalAmount,
          calculatedAmount
        ),
        calculatedAmount
      ),

    lastUpdateTs:
      number(
        first(
          source.lastUpdateTs,
          calculatedLastUpdate
        ),
        calculatedLastUpdate
      ),
  };
}

function buildVm(
  input = {}
) {
  const data =
    safeObject(
      input,
      {}
    );

  const items =
    normalizeClientesCollection(
      resolveItems(
        data
      )
    );

  const filter =
    normalizeFilter(
      first(
        data.filter,
        data.status,
        data.state
          ?.filter,
        "all"
      )
    );

  const search =
    cleanText(
      first(
        data.search,
        data.query,
        data.q,
        data.state
          ?.search,
        ""
      ),
      ""
    );

  const sortOrder =
    normalizeSort(
      first(
        data.sortOrder,
        data.order,
        data.state
          ?.sortOrder,
        DEFAULT_SORT_ORDER
      )
    );

  const filteredItems =
    filterAndSort(
      items,
      {
        filter,
        search,
        sortOrder,
      }
    );

  const visibleLimit =
    clamp(
      first(
        data.visibleLimit,
        data.limit,
        data.state
          ?.visibleLimit,
        DEFAULT_VISIBLE_ROWS
      ),
      1,
      MAX_VISIBLE_ROWS
    );

  const visibleItems =
    filteredItems.slice(
      0,
      visibleLimit
    );

  const reportedTotal =
    Math.max(
      0,
      number(
        first(
          data.total,
          data.remoteCount,
          data.totalCount,
          items.length
        ),
        items.length
      )
    );

  const total =
    items.length;

  const role =
    normalizeKey(
      data.role
    );

  return {
    data,

    route:
      cleanText(
        first(
          data.route,
          data.routes
            ?.clientes,
          DEFAULT_ROUTE
        ),
        DEFAULT_ROUTE
      ),

    admin:
      Boolean(
        data.admin === true ||
        role === "admin"
      ),

    items,
    filteredItems,
    visibleItems,

    total,
    reportedTotal,

    filteredTotal:
      filteredItems.length,

    visibleCount:
      visibleItems.length,

    visibleLimit,

    remainingCount:
      Math.max(
        0,
        filteredItems.length -
        visibleItems.length
      ),

    hasMore:
      filteredItems.length >
      visibleItems.length,

    loading:
      data.loading === true,

    refreshing:
      data.refreshing === true,

    creating:
      data.creating === true,

    loadingMore:
      data.loadingMore === true,

    error:
      cleanText(
        first(
          data.error,
          data.state
            ?.error,
          ""
        ),
        ""
      ),

    filter,
    search,
    sortOrder,

    sortLabel:
      sortLabel(
        sortOrder
      ),

    nextSortOrder:
      nextSort(
        sortOrder
      ),

    nextSortLabel:
      sortLabel(
        nextSort(
          sortOrder
        )
      ),

    filterCounts:
      filterCounts(
        items
      ),

    stats:
      computeStats(
        items,
        data.stats
      ),

    openingClienteId:
      cleanText(
        first(
          data.openingClienteId,
          data.openingClientId,
          ""
        ),
        ""
      ),

    diagnostics: {
      templateVersion:
        CLIENTES_TEMPLATE_VERSION,

      extractedItems:
        items.length,

      reportedTotal,

      totalMismatch:
        reportedTotal !==
        items.length,

      canonicalBoundary:
        true,

      backendPagination:
        false,

      visibleLimitMax:
        MAX_VISIBLE_ROWS,
    },
  };
}

/* =========================================================
   ROW HELPERS
========================================================= */

function formatPhone(
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

  const digits =
    raw.replace(
      /[^\d]/g,
      ""
    );

  if (!digits) {
    return raw;
  }

  let prefix = "";
  let national =
    digits;

  if (
    digits.length === 11 &&
    digits.startsWith("34")
  ) {
    prefix = "+34 ";
    national =
      digits.slice(2);
  } else if (
    raw.startsWith("+34") &&
    digits.length >= 11
  ) {
    prefix = "+34 ";
    national =
      digits.slice(-9);
  }

  if (
    national.length === 9
  ) {
    return (
      `${prefix}` +
      `${national.slice(0, 3)} ` +
      `${national.slice(3, 6)} ` +
      `${national.slice(6)}`
    );
  }

  return raw;
}

function mailtoHref(
  email = ""
) {
  const value =
    normalizeEmail(
      email
    );

  if (!value) {
    return "";
  }

  return (
    `mailto:${encodeURIComponent(value)
      .replace(/%40/g, "@")
      .replace(/%2E/g, ".")}`
  );
}

function telHref(
  phone = ""
) {
  const raw =
    cleanText(
      phone,
      ""
    );

  if (!raw) {
    return "";
  }

  const digits =
    raw.replace(
      /[^\d]/g,
      ""
    );

  if (!digits) {
    return "";
  }

  return (
    `tel:${raw.startsWith("+") ? "+" : ""}${digits}`
  );
}

/* =========================================================
   ROW RENDERERS
========================================================= */

function renderAvatar(
  item = {}
) {
  const name =
    getClienteName(
      item
    );

  const src =
    getClienteAvatar(
      item
    );

  const tone =
    hashText(
      `${getClienteId(item)}:${name}`
    ) %
    AVATAR_TONE_COUNT;

  return `
    <span
      class="clientes-avatar${src ? " has-image" : " is-fallback"} clientes-avatar-tone-${attr(String(tone))}"
      data-avatar-tone="${attr(String(tone))}"
      data-has-avatar="${src ? "true" : "false"}"
      data-fallback="${src ? "false" : "true"}"
      aria-hidden="true"
    >
      ${
        src
          ? `<img
              class="clientes-avatar-img"
              src="${attr(src)}"
              alt=""
              width="48"
              height="48"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              draggable="false"
            >`
          : ""
      }

      <span class="clientes-avatar-fallback">
        ${escapeHtml(getClienteInitials(item))}
      </span>
    </span>
  `;
}

function renderStatusChip(
  item = {}
) {
  const bucket =
    statusBucket(
      item
    );

  const label =
    getClienteStatusLabel(
      item
    );

  return `
    <span
      class="clientes-status-chip clientes-status-chip--${attr(bucket)} is-${attr(bucket)}"
      data-status-chip="${attr(bucket)}"
      data-status="${attr(bucket)}"
    >
      <span class="clientes-status-dot" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderAmountChip(
  item = {}
) {
  const amount =
    getClienteAmount(
      item
    );

  const state =
    amount > 0
      ? "positive"
      : "idle";

  return `
    <span
      class="clientes-importe-chip clientes-amount-chip clientes-amount-chip--${attr(state)}"
      data-importe-status="${attr(state)}"
      data-amount-status="${attr(state)}"
    >
      ${
        state !== "idle"
          ? icon("euro")
          : ""
      }

      <span>${escapeHtml(formatMoney(amount, DEFAULT_CURRENCY))}</span>
    </span>
  `;
}

function renderContactLine(
  item = {}
) {
  const email =
    getClienteEmail(
      item
    );

  const rawPhone =
    getClientePhone(
      item
    );

  const phone =
    formatPhone(
      rawPhone
    );

  if (
    !email &&
    !phone
  ) {
    return (
      `<span class="clientes-contact-empty">Sin contacto</span>`
    );
  }

  return `
    <span class="clientes-contact-line">
      ${
        email
          ? `<a
              class="clientes-email clientes-contact-link"
              href="${attr(mailtoHref(email))}"
              data-action=""
              data-clientes-action=""
              aria-label="Enviar correo a ${attr(email)}"
            >${icon("mail")}<span>${escapeHtml(email)}</span></a>`
          : ""
      }

      ${
        email &&
        phone
          ? `<span class="clientes-client-separator">·</span>`
          : ""
      }

      ${
        phone
          ? `<a
              class="clientes-phone clientes-contact-link"
              href="${attr(telHref(rawPhone))}"
              data-action=""
              data-clientes-action=""
              aria-label="Llamar a ${attr(phone)}"
            >${icon("phone")}<span>${escapeHtml(phone)}</span></a>`
          : ""
      }
    </span>
  `;
}

function renderRow(
  item = {},
  vm = {}
) {
  const current =
    normalizeClienteModel(
      item
    );

  const id =
    current.clienteId;

  const bucket =
    statusBucket(
      current
    );

  const email =
    current.email;

  const city =
    current.city;

  const nif =
    current.nif;

  const isOpening =
    Boolean(
      id &&
      vm.openingClienteId ===
        id
    );

  const interactive =
    Boolean(id);

  return `
    <tr
      class="clientes-row${interactive ? " clientes-row--clickable" : ""} clientes-row--${attr(bucket)}${isOpening ? " is-loading" : ""}"
      data-client-row="true"
      data-cliente-row="true"
      data-detail-target="${interactive ? "true" : "false"}"
      data-client-id="${attr(id)}"
      data-cliente-id="${attr(id)}"
      ${
        interactive
          ? `data-clientes-action="${CLIENTES_ACTIONS.OPEN_DETAIL}" data-action="${CLIENTES_ACTIONS.OPEN_DETAIL}" tabindex="0" role="button" aria-label="Abrir cliente ${attr(current.nombreFiscal)}"`
          : `aria-disabled="true"`
      }
      ${htmlAttrs({
        "aria-busy":
          isOpening
            ? "true"
            : false,
      })}
    >
      <td
        class="clientes-cell clientes-cell--main"
        data-column="main"
      >
        <div class="clientes-main">
          ${renderAvatar(current)}

          <div class="clientes-main-copy">
            <div class="clientes-ticket-line clientes-client-line-top">
              <span class="clientes-code clientes-ticket-id">
                ${escapeHtml(getClienteCode(current))}
              </span>

              <span class="clientes-category-pill">
                ${escapeHtml(getClienteTypeLabel(current))}
              </span>
            </div>

            <div class="clientes-name clientes-ticket-subject">
              ${escapeHtml(current.nombreFiscal)}
            </div>

            <div class="clientes-description clientes-ticket-description">
              ${escapeHtml(
                [
                  email,
                  nif ||
                  city,
                ]
                  .filter(Boolean)
                  .join(" · ") ||
                "Sin datos fiscales"
              )}
            </div>

            <div class="clientes-client-line">
              ${
                city
                  ? `<span class="clientes-location">${escapeHtml(city)}</span>`
                  : `<span class="clientes-location is-empty">Sin ciudad</span>`
              }
            </div>

            <div class="clientes-row-badges">
              ${
                nif
                  ? `<span class="clientes-nif-chip">${escapeHtml(nif)}</span>`
                  : ""
              }
            </div>
          </div>
        </div>
      </td>

      <td
        class="clientes-cell clientes-cell--status"
        data-column="status"
      >
        ${renderStatusChip(current)}
      </td>

      <td
        class="clientes-cell clientes-cell--date clientes-cell--created"
        data-column="created"
      >
        <span
          class="clientes-date-inline clientes-date"
          title="${attr(formatDate(current.createdAt))}"
        >
          ${escapeHtml(formatShortDate(current.createdAt))}
        </span>
      </td>

      <td
        class="clientes-cell clientes-cell--email clientes-cell--contact"
        data-column="contact"
      >
        ${renderContactLine(current)}
      </td>

      <td
        class="clientes-cell clientes-cell--amount clientes-cell--importe"
        data-column="amount"
      >
        ${renderAmountChip(current)}
      </td>
    </tr>
  `;
}

/* =========================================================
   HEADER / FILTERS
========================================================= */

function spinner(
  label =
    "Cargando..."
) {
  return (
    `<span class="clientes-spinner" aria-hidden="true"></span>` +
    `<span>${escapeHtml(label)}</span>`
  );
}

function renderHeader(
  vm = {}
) {
  const stats =
    vm.stats;

  const updatedAt =
    stats.lastUpdateTs
      ? new Date(
          stats.lastUpdateTs
        ).toISOString()
      : "";

  return `
    <section
      class="clientes-hero"
      data-clientes-hero="true"
    >
      <div class="clientes-hero-top">
        <div class="clientes-hero-copy">
          <h1 class="clientes-title clientes-page-title">
            Centro de control de clientes
          </h1>

          <p class="clientes-subtitle clientes-page-subtitle">
            Consulta clientes, revisa altas, facturación y contactos desde un único panel.
          </p>
        </div>

        <div class="clientes-hero-actions">
          ${
            vm.admin
              ? `
                <button
                  type="button"
                  id="clientes-create-btn"
                  class="clientes-btn clientes-btn--create clientes-btn--primary"
                  data-clientes-action="${CLIENTES_ACTIONS.CREATE_OPEN}"
                  data-action="${CLIENTES_ACTIONS.CREATE_OPEN}"
                  ${htmlAttrs({
                    disabled:
                      vm.creating ||
                      vm.loading,

                    "aria-disabled":
                      vm.creating ||
                      vm.loading
                        ? "true"
                        : false,

                    "aria-busy":
                      vm.creating
                        ? "true"
                        : false,
                  })}
                >
                  ${
                    vm.creating
                      ? spinner("Creando...")
                      : `${icon("plus")}<span>Nuevo cliente</span>`
                  }
                </button>
              `
              : ""
          }

          <button
            type="button"
            id="clientes-refresh-btn"
            class="clientes-btn${vm.refreshing ? " is-loading" : ""}"
            data-clientes-action="${CLIENTES_ACTIONS.REFRESH}"
            data-action="${CLIENTES_ACTIONS.REFRESH}"
            ${htmlAttrs({
              disabled:
                vm.refreshing ||
                vm.loading,

              "aria-disabled":
                vm.refreshing ||
                vm.loading
                  ? "true"
                  : false,

              "aria-busy":
                vm.refreshing
                  ? "true"
                  : false,
            })}
          >
            ${
              vm.refreshing
                ? spinner("Actualizando...")
                : `${icon("refresh")}<span>Actualizar</span>`
            }
          </button>
        </div>
      </div>

      <div class="clientes-hero-meta">
        <span
          class="clientes-meta-pill"
          data-meta="total"
        >
          ${icon("users")}
          <span>
            ${escapeHtml(`${formatNumber(vm.total)} clientes registrados`)}
          </span>
        </span>

        <span
          class="clientes-meta-pill"
          data-meta="updated"
        >
          ${icon("refresh")}
          <span>
            ${
              updatedAt
                ? escapeHtml(`Última actualización · ${formatRelativeDate(updatedAt)}`)
                : "Sin actualizaciones recientes"
            }
          </span>
        </span>

        <span
          class="clientes-meta-pill"
          data-meta="amount"
        >
          ${icon("euro")}
          <span>
            ${escapeHtml(formatMoney(stats.totalAmount, DEFAULT_CURRENCY))}
          </span>
        </span>
      </div>

      <div class="clientes-stats">
        <article
          class="clientes-stat-card clientes-stat-card--total"
          data-stat="total"
        >
          <div class="clientes-stat-label">
            Clientes
          </div>

          <div class="clientes-stat-value">
            ${escapeHtml(formatNumber(stats.total))}
          </div>

          <div class="clientes-stat-text">
            Registros totales visibles.
          </div>
        </article>

        <article
          class="clientes-stat-card clientes-stat-card--active"
          data-stat="active"
        >
          <div class="clientes-stat-label">
            Activos
          </div>

          <div class="clientes-stat-value">
            ${escapeHtml(formatNumber(stats.activeCount))}
          </div>

          <div class="clientes-stat-text">
            Clientes operativos.
          </div>
        </article>

        <article
          class="clientes-stat-card clientes-stat-card--pending"
          data-stat="pending"
        >
          <div class="clientes-stat-label">
            Pendientes
          </div>

          <div class="clientes-stat-value">
            ${escapeHtml(formatNumber(stats.pendingCount))}
          </div>

          <div class="clientes-stat-text">
            Altas o validaciones pendientes.
          </div>
        </article>

        <article
          class="clientes-stat-card clientes-stat-card--blocked"
          data-stat="blocked"
        >
          <div class="clientes-stat-label">
            Bloqueados
          </div>

          <div class="clientes-stat-value">
            ${escapeHtml(formatNumber(stats.blockedCount))}
          </div>

          <div class="clientes-stat-text">
            Cuentas restringidas o inactivas.
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderSearch(
  vm = {}
) {
  return `
    <div
      class="clientes-search"
      role="search"
      aria-label="Buscar clientes"
    >
      <span
        class="clientes-search-icon"
        aria-hidden="true"
      >
        ${icon("search")}
      </span>

      <input
        id="clientes-search-input"
        class="clientes-search-input"
        type="search"
        value="${attr(vm.search)}"
        placeholder="Buscar cliente, email, NIF..."
        autocomplete="off"
        spellcheck="false"
        data-clientes-search-input="true"
        data-clientes-field="search"
        data-field="search"
        data-search-input="clientes"
        aria-label="Buscar clientes por nombre, email, NIF o identificador"
      >

      ${
        vm.search
          ? `
            <button
              type="button"
              class="clientes-search-clear"
              data-clientes-action="${CLIENTES_ACTIONS.CLEAR_SEARCH}"
              data-action="${CLIENTES_ACTIONS.CLEAR_SEARCH}"
              aria-label="Limpiar búsqueda"
            >
              ${icon("close")}
            </button>
          `
          : ""
      }
    </div>
  `;
}

function renderFilters(
  vm = {}
) {
  const order =
    normalizeSort(
      vm.sortOrder
    );

  const next =
    nextSort(
      order
    );

  return `
    <div
      class="clientes-filters"
      data-clientes-filters="true"
    >
      <div
        class="clientes-filter-pills"
        role="tablist"
        aria-label="Filtrar clientes"
      >
        ${FILTERS
          .map(
            (filter) => {
              const active =
                filter.key ===
                vm.filter;

              return `
                <button
                  type="button"
                  role="tab"
                  class="clientes-filter-pill${active ? " is-active" : ""}"
                  data-clientes-action="${CLIENTES_ACTIONS.FILTER}"
                  data-action="${CLIENTES_ACTIONS.FILTER}"
                  data-filter="${attr(filter.key)}"
                  aria-selected="${active ? "true" : "false"}"
                  aria-pressed="${active ? "true" : "false"}"
                >
                  <span>${escapeHtml(filter.label)}</span>
                  <strong>
                    ${escapeHtml(formatNumber(vm.filterCounts[filter.key] || 0))}
                  </strong>
                </button>
              `;
            }
          )
          .join("")}
      </div>

      <div
        class="clientes-sort-pills"
        data-clientes-sort-pills="true"
      >
        <button
          type="button"
          class="clientes-sort-pill is-active"
          data-clientes-action="${CLIENTES_ACTIONS.SORT_TOGGLE}"
          data-action="${CLIENTES_ACTIONS.SORT_TOGGLE}"
          data-sort-order="${attr(order)}"
          data-next-sort-order="${attr(next)}"
          aria-pressed="true"
          aria-label="Cambiar orden a ${attr(sortLabel(next))}"
          title="Cambiar orden a ${attr(sortLabel(next))}"
        >
          ${icon("calendar")}
          <span>
            ${escapeHtml(sortLabel(order))}
          </span>
        </button>
      </div>

      ${renderSearch(vm)}
    </div>
  `;
}

/* =========================================================
   TABLE / STATES
========================================================= */

function renderColgroup() {
  return `
    <colgroup>
      ${CLIENTES_TABLE_COLUMNS
        .map(
          (column) =>
            `<col class="${attr(column.colClass)}">`
        )
        .join("")}
    </colgroup>
  `;
}

function renderThead() {
  return `
    <thead>
      <tr>
        ${CLIENTES_TABLE_COLUMNS
          .map(
            (column) => `
              <th
                class="${attr(column.thClass)}"
                scope="col"
                data-column="${attr(column.key)}"
              >
                ${escapeHtml(column.label)}
              </th>
            `
          )
          .join("")}
      </tr>
    </thead>
  `;
}

function renderTableLoading(
  rows =
    DEFAULT_VISIBLE_ROWS
) {
  const count =
    Math.max(
      4,
      Math.min(
        MAX_VISIBLE_ROWS,
        number(
          rows,
          DEFAULT_VISIBLE_ROWS
        )
      )
    );

  return `
    <div
      class="clientes-table-wrap is-loading"
      data-clientes-table-wrap="true"
    >
      <div
        class="clientes-table-loading"
        aria-hidden="true"
      >
        <div class="clientes-table-shell">
          <table
            class="clientes-table clientes-table--no-actions clientes-table--scale-110"
            role="table"
            aria-label="Cargando clientes"
            data-table-columns="${attr(String(CLIENTES_TABLE_COLUMNS.length))}"
            data-table-actions="false"
            data-table-scale="${attr(TABLE_SCALE)}"
          >
            ${renderColgroup()}
            ${renderThead()}

            <tbody>
              ${Array
                .from({
                  length:
                    count,
                })
                .map(
                  (
                    _,
                    index
                  ) => `
                    <tr
                      class="clientes-row clientes-row--skeleton"
                      aria-hidden="true"
                      data-skeleton-row="${index + 1}"
                    >
                      ${CLIENTES_TABLE_COLUMNS
                        .map(
                          (column) => `
                            <td
                              class="${attr(column.cellClass)}"
                              data-column="${attr(column.key)}"
                            >
                              <span
                                class="clientes-skeleton clientes-skeleton--${attr(column.key)}"
                              ></span>
                            </td>
                          `
                        )
                        .join("")}
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderRefreshOverlay() {
  return `
    <div
      class="clientes-refresh-overlay"
      aria-live="polite"
      aria-busy="true"
    >
      <span class="clientes-inline-loading">
        <span
          class="clientes-inline-spinner"
          aria-hidden="true"
        ></span>

        <span>
          Actualizando clientes...
        </span>
      </span>
    </div>
  `;
}

function renderEmpty(
  vm = {}
) {
  const hasError =
    Boolean(
      vm.error
    );

  const filtering =
    vm.filter !== "all" ||
    Boolean(
      vm.search
    );

  const title =
    hasError
      ? "No se pudieron cargar los clientes"
      : filtering
        ? "No hay clientes con esos filtros"
        : "Todavía no hay clientes";

  const text =
    hasError
      ? vm.error
      : filtering
        ? "Prueba a limpiar la búsqueda o cambia el filtro activo para volver al historial completo."
        : "Cuando haya clientes registrados aparecerán aquí con su estado, alta, contacto y facturación asociada.";

  return `
    <div
      class="clientes-empty"
      data-clientes-empty="true"
    >
      <div
        class="clientes-empty-icon"
        aria-hidden="true"
      >
        ${
          hasError
            ? icon("alert")
            : icon("users")
        }
      </div>

      <h3>
        ${escapeHtml(title)}
      </h3>

      <p>
        ${escapeHtml(text)}
      </p>

      ${
        hasError
          ? `
            <button
              type="button"
              class="clientes-btn"
              data-clientes-action="${CLIENTES_ACTIONS.REFRESH}"
              data-action="${CLIENTES_ACTIONS.REFRESH}"
            >
              ${icon("refresh")}
              <span>Reintentar</span>
            </button>
          `
          : filtering
            ? `
              <button
                type="button"
                class="clientes-btn"
                data-clientes-action="${CLIENTES_ACTIONS.CLEAR_FILTERS}"
                data-action="${CLIENTES_ACTIONS.CLEAR_FILTERS}"
              >
                ${icon("close")}
                <span>Limpiar filtros</span>
              </button>
            `
            : ""
      }
    </div>
  `;
}

function renderFeedFooter(
  vm = {}
) {
  if (
    !vm.total ||
    !vm.visibleCount
  ) {
    return `
      <div
        class="clientes-feed-sentinel"
        data-clientes-load-more="true"
        data-clientes-infinite-sentinel="true"
        aria-hidden="true"
      ></div>
    `;
  }

  if (
    !vm.hasMore
  ) {
    return `
      <div
        class="clientes-feed-end"
        data-clientes-feed-end="true"
        data-clientes-load-more="false"
      >
        <span class="clientes-feed-end-text">
          Has visto todos los clientes disponibles.
        </span>
      </div>
    `;
  }

  const nextVisibleLimit =
    Math.min(
      MAX_VISIBLE_ROWS,
      vm.visibleLimit +
      DEFAULT_VISIBLE_ROWS
    );

  return `
    <div
      class="clientes-feed-more"
      data-clientes-feed-more="true"
    >
      <button
        type="button"
        class="clientes-load-more-btn${vm.loadingMore ? " is-loading" : ""}"
        data-clientes-action="${CLIENTES_ACTIONS.LOAD_MORE}"
        data-action="${CLIENTES_ACTIONS.LOAD_MORE}"
        data-clientes-load-more-button="true"
        data-visible-limit="${attr(String(nextVisibleLimit))}"
        ${htmlAttrs({
          disabled:
            vm.loadingMore,

          "aria-disabled":
            vm.loadingMore
              ? "true"
              : false,

          "aria-busy":
            vm.loadingMore
              ? "true"
              : false,
        })}
      >
        ${
          vm.loadingMore
            ? spinner("Cargando más clientes...")
            : (
                `${icon("chevronDown")}` +
                `<span>Mostrar más</span>` +
                `<span class="clientes-load-more-count">${escapeHtml(`${formatNumber(vm.remainingCount)} restantes`)}</span>`
              )
        }
      </button>

      <div
        class="clientes-feed-sentinel"
        data-clientes-load-more="true"
        data-clientes-infinite-sentinel="true"
        data-load-more-sentinel="true"
        aria-hidden="true"
      ></div>
    </div>
  `;
}

function renderTable(
  vm = {}
) {
  if (
    !vm.visibleItems.length
  ) {
    return renderEmpty(
      vm
    );
  }

  return `
    <div class="clientes-table-shell">
      <table
        class="clientes-table clientes-table--no-actions clientes-table--scale-110"
        role="table"
        aria-label="Listado de clientes"
        data-table-columns="${attr(String(CLIENTES_TABLE_COLUMNS.length))}"
        data-table-actions="false"
        data-table-scale="${attr(TABLE_SCALE)}"
        data-sort-order="${attr(vm.sortOrder)}"
      >
        ${renderColgroup()}
        ${renderThead()}

        <tbody>
          ${vm.visibleItems
            .map(
              (item) =>
                renderRow(
                  item,
                  vm
                )
            )
            .join("")}
        </tbody>
      </table>
    </div>

    ${renderFeedFooter(vm)}
  `;
}

function renderHistory(
  vm = {}
) {
  const initialLoading =
    vm.loading &&
    !vm.visibleItems.length;

  const refreshing =
    vm.refreshing &&
    vm.visibleItems.length;

  const activeLabel =
    FILTERS.find(
      (filter) =>
        filter.key ===
        vm.filter
    )?.label ||
    "Todos";

  const criteria = [
    vm.filter !== "all"
      ? activeLabel
      : "",

    vm.search
      ? `búsqueda “${vm.search}”`
      : "",
  ].filter(Boolean);

  const subtitle =
    initialLoading
      ? "Cargando clientes..."
      : (
          vm.filter !== "all" ||
          vm.search
        )
        ? (
            `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.filteredTotal)}` +
            `${criteria.length ? ` · ${criteria.join(" · ")}` : ""}` +
            ` · orden ${sortLabel(vm.sortOrder).toLowerCase()}`
          )
        : (
            `Mostrando ${formatNumber(vm.visibleCount)} de ${formatNumber(vm.total)}` +
            ` · orden ${sortLabel(vm.sortOrder).toLowerCase()}`
          );

  return `
    <section
      class="clientes-history"
      data-clientes-scroll-host="true"
      data-clientes-scroll-mode="infinite"
    >
      <div
        class="clientes-history-head"
        data-clientes-history-head="true"
      >
        <div class="clientes-history-copy">
          <h2 class="clientes-history-title">
            Historial de clientes
          </h2>

          <p class="clientes-history-subtitle">
            ${escapeHtml(subtitle)}
          </p>
        </div>

        <button
          type="button"
          class="clientes-btn clientes-btn--export"
          data-clientes-action="${CLIENTES_ACTIONS.EXPORT}"
          data-action="${CLIENTES_ACTIONS.EXPORT}"
          ${htmlAttrs({
            disabled:
              !vm.items.length,

            "aria-disabled":
              !vm.items.length
                ? "true"
                : false,
          })}
        >
          ${icon("chevronDown")}
          <span>Exportar</span>
        </button>

        ${renderFilters(vm)}
      </div>

      ${
        initialLoading
          ? renderTableLoading(
              DEFAULT_VISIBLE_ROWS
            )
          : `
            <div
              class="clientes-table-wrap${refreshing ? " is-refreshing" : ""}"
              data-clientes-table-wrap="true"
              data-clientes-scroll-mode="infinite"
            >
              ${
                refreshing
                  ? renderRefreshOverlay()
                  : ""
              }

              ${renderTable(vm)}
            </div>
          `
      }
    </section>
  `;
}

/* =========================================================
   PUBLIC RENDERERS
========================================================= */

export function renderClientesLoadingState(
  input = {}
) {
  const vm =
    buildVm({
      ...safeObject(
        input,
        {}
      ),

      loading:
        true,
    });

  return `
    <section
      class="clientes-view-root clientes-view-root--loading is-loading"
      data-clientes-scope="true"
      data-template-version="${attr(CLIENTES_TEMPLATE_VERSION)}"
      data-total="${attr(String(vm.total))}"
      data-visible="${attr(String(vm.visibleCount))}"
      data-visible-limit="${attr(String(vm.visibleLimit))}"
      data-visible-limit-max="${attr(String(MAX_VISIBLE_ROWS))}"
      data-filter="${attr(vm.filter)}"
      data-sort-order="${attr(vm.sortOrder)}"
      data-table-actions="false"
      data-table-scale="${attr(TABLE_SCALE)}"
      aria-busy="true"
    >
      ${renderHeader(vm)}
      ${renderHistory(vm)}
    </section>
  `;
}

export function renderClientesErrorState(
  input = {}
) {
  const data =
    typeof input ===
      "string"
      ? {
          error:
            input,
        }
      : safeObject(
          input,
          {}
        );

  const message =
    cleanText(
      first(
        data.error,
        data.message,
        "No se pudieron cargar los clientes."
      ),
      "No se pudieron cargar los clientes."
    );

  return `
    <section
      class="clientes-view-root clientes-view-root--error has-error"
      data-clientes-scope="true"
      data-template-version="${attr(CLIENTES_TEMPLATE_VERSION)}"
      data-table-actions="false"
      data-table-scale="${attr(TABLE_SCALE)}"
      aria-busy="false"
    >
      <section
        class="clientes-error"
        role="alert"
      >
        <div
          class="clientes-error-icon"
          aria-hidden="true"
        >
          ${icon("alert")}
        </div>

        <div class="clientes-error-copy">
          <h3 class="clientes-error-title">
            No se pudo renderizar la vista de clientes
          </h3>

          <p class="clientes-error-text">
            ${escapeHtml(message)}
          </p>
        </div>

        <button
          type="button"
          class="clientes-btn"
          data-clientes-action="${CLIENTES_ACTIONS.REFRESH}"
          data-action="${CLIENTES_ACTIONS.REFRESH}"
        >
          ${icon("refresh")}
          <span>Reintentar</span>
        </button>
      </section>
    </section>
  `;
}

export function renderLoadingState(
  input = {}
) {
  return renderClientesLoadingState(
    input
  );
}

export function renderErrorState(
  input = {}
) {
  return renderClientesErrorState(
    input
  );
}

export function renderAccessDeniedState() {
  return `
    <section
      class="clientes-view-root clientes-view-root--forbidden has-error"
      data-clientes-scope="true"
      data-template-version="${attr(CLIENTES_TEMPLATE_VERSION)}"
      data-table-actions="false"
      data-table-scale="${attr(TABLE_SCALE)}"
      aria-busy="false"
    >
      <section
        class="clientes-error clientes-error--forbidden"
        role="alert"
      >
        <div
          class="clientes-error-icon"
          aria-hidden="true"
        >
          ${icon("shield")}
        </div>

        <div class="clientes-error-copy">
          <h3 class="clientes-error-title">
            Acceso restringido
          </h3>

          <p class="clientes-error-text">
            No tienes permisos suficientes para acceder a la gestión de clientes.
          </p>
        </div>
      </section>
    </section>
  `;
}

export function renderClientesTemplate(
  input = {}
) {
  const vm =
    buildVm(
      input
    );

  if (
    vm.data.forbidden ||
    vm.data.accessDenied ||
    vm.data.restricted
  ) {
    return renderAccessDeniedState(
      input
    );
  }

  return `
    <section
      class="${joinClasses(
        "clientes-view-root",
        vm.loading
          ? "is-loading"
          : "",
        vm.refreshing
          ? "is-refreshing"
          : "",
        vm.creating
          ? "is-creating"
          : "",
        vm.error
          ? "has-error"
          : ""
      )}"
      data-clientes-scope="true"
      data-template-version="${attr(CLIENTES_TEMPLATE_VERSION)}"
      data-route="${attr(vm.route)}"
      data-total="${attr(String(vm.total))}"
      data-visible="${attr(String(vm.visibleCount))}"
      data-visible-limit="${attr(String(vm.visibleLimit))}"
      data-visible-limit-max="${attr(String(MAX_VISIBLE_ROWS))}"
      data-filter="${attr(vm.filter)}"
      data-search-active="${vm.search ? "true" : "false"}"
      data-sort-order="${attr(vm.sortOrder)}"
      data-loading="${vm.loading ? "true" : "false"}"
      data-refreshing="${vm.refreshing ? "true" : "false"}"
      data-table-actions="false"
      data-table-scale="${attr(TABLE_SCALE)}"
      data-items-extracted="${attr(String(vm.items.length))}"
      data-reported-total="${attr(String(vm.reportedTotal))}"
      data-total-mismatch="${vm.diagnostics.totalMismatch ? "true" : "false"}"
      data-total-greater-than-items="${vm.reportedTotal > vm.items.length ? "true" : "false"}"
      aria-busy="${vm.loading || vm.refreshing ? "true" : "false"}"
    >
      ${
        vm.error
          ? `
            <div
              class="clientes-alert"
              role="alert"
            >
              ${icon("alert")}
              <span>${escapeHtml(vm.error)}</span>
            </div>
          `
          : ""
      }

      ${renderHeader(vm)}
      ${renderHistory(vm)}
    </section>
  `;
}

export function renderClientesTableTemplate(
  input = {}
) {
  return renderClientesTemplate(
    input
  );
}

export function renderTemplate(
  input = {}
) {
  return renderClientesTemplate(
    input
  );
}

export const renderEmptyState =
  renderClientesTemplate;

export const renderCards =
  renderClientesTemplate;

export const renderTableTemplate =
  renderClientesTemplate;

/* =========================================================
   SNAPSHOT
========================================================= */

export function getClientesTemplateSnapshot(
  input = {}
) {
  const vm =
    buildVm(
      input
    );

  return {
    version:
      CLIENTES_TEMPLATE_VERSION,

    total:
      vm.total,

    reportedTotal:
      vm.reportedTotal,

    totalMismatch:
      vm.diagnostics
        .totalMismatch,

    extractedItems:
      vm.items.length,

    visibleCount:
      vm.visibleCount,

    visibleLimit:
      vm.visibleLimit,

    maxVisibleRows:
      MAX_VISIBLE_ROWS,

    filteredTotal:
      vm.filteredTotal,

    filter:
      vm.filter,

    searchLength:
      vm.search.length,

    sortOrder:
      vm.sortOrder,

    columns:
      CLIENTES_TABLE_COLUMNS
        .map(
          (column) =>
            column.key
        ),

    actions: {
      ...CLIENTES_ACTIONS,
    },

    tableScale:
      TABLE_SCALE,

    policy:
      Object.freeze({
        templateOnly:
          true,

        canonicalClientProjection:
          true,

        backendPagination:
          false,

        noHttp:
          true,

        noFetch:
          true,

        noDom:
          true,

        noStore:
          true,

        noRouter:
          true,

        noAuth:
          true,

        noLocalStorage:
          true,

        noDataImageAvatar:
          true,

        azureSasAvatarRuntimeSafe:
          true,

        externalSignedAvatarRejected:
          true,

        strictBooleanStatus:
          true,

        escapedDynamicContent:
          true,

        createAdminOnly:
          true,

        initialVisibleRows:
          DEFAULT_VISIBLE_ROWS,

        maxVisibleRows:
          MAX_VISIBLE_ROWS,

        compatibleWithClientesIndexV6:
          true,

        compatibleWithClientesApiV4:
          true,

        tableColumnCount:
          CLIENTES_TABLE_COLUMNS.length,
      }),
  };
}

export function getClientesTableTemplateSnapshot(
  input = {}
) {
  return getClientesTemplateSnapshot(
    input
  );
}

export function getSnapshot(
  input = {}
) {
  return getClientesTemplateSnapshot(
    input
  );
}

export default renderClientesTemplate;
