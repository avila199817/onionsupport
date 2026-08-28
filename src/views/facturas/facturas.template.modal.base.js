/* =========================================================
   Onion Support - Facturas Modal Template
   Archivo: /src/views/facturas/facturas.template.modal.js

   PRODUCTIVO · MODAL DETAIL 10/10 · V4

   Responsabilidad:
   - Render HTML puro del modal detalle de factura.
   - Cabecera, estados, cliente, totales, impuestos,
     conceptos, envío e incidencia vinculada.
   - Feedback local preparado para index.js V11+.
   - Exponer data-action/data-facturas-action estables.
   - Acción admin explícita para registrar cobro completo.
   - Compatible con DTOs legacy/v2/v3.
   - Sin AppCore.
   - Sin Auth.
   - Sin Router.
   - Sin HTTP.
   - Sin Store.
   - Sin listeners.
   - Sin DOM API.
   - Sin Toast.
   - Sin navegación real.

   Arquitectura visual esperada:
   - Header fijo gestionado por detail.css.
   - Body como único propietario del scroll.
   - Acciones de documento siempre accesibles.
   - Información financiera legible y jerarquizada.

   IMPORTANTE:
   - Focus trap, restauración de foco, confirmación de reenvío/pago
     y feedback de operaciones viven en index.js.
========================================================= */

export const FACTURAS_MODAL_TEMPLATE_VERSION =
  "facturas.template.modal.productivo.v4.admin-payment";

export const FACTURA_MODAL_ACTIONS = Object.freeze({
  CLOSE: "close-factura-detail",
  VIEW_PDF: "view-factura-pdf",
  DOWNLOAD_PDF: "download-factura",
  SEND: "send-factura",
  MARK_PAID: "mark-factura-paid",
  OPEN_INCIDENCIA: "open-incidencia",
});

const DEFAULT_CURRENCY = "EUR";

/* =========================================================
   BASICS
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

function hasOwnKeys(
  value = {}
) {
  return Boolean(
    isObject(value) &&
    Object.keys(value).length
  );
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

function cleanMultiline(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();

  return output || fallback;
}

/*
   NO aplanar arrays.
   lineas/impuestos/relations son valores completos.
*/
function first(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
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

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  if (typeof value === "boolean") {
    return value
      ? 1
      : 0;
  }

  if (typeof value === "object") {
    return fallback;
  }

  if (typeof value === "string") {
    let clean =
      value
        .trim()
        .replace(/[€$£¥%]/g, "")
        .replace(/[^\d.,+\-\s]/g, "")
        .replace(/\s+/g, "");

    if (
      !clean ||
      clean === "-" ||
      clean === "+"
    ) {
      return fallback;
    }

    const hasComma =
      clean.includes(",");

    const hasDot =
      clean.includes(".");

    if (hasComma && hasDot) {
      clean =
        clean.lastIndexOf(",") >
        clean.lastIndexOf(".")
          ? clean
              .replace(/\./g, "")
              .replace(/,/g, ".")
          : clean.replace(/,/g, "");
    } else if (hasComma) {
      clean =
        clean.replace(/,/g, ".");
    }

    const parsed =
      Number(clean);

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

function bool(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const key =
    normalizeKey(value);

  if (
    [
      "true",
      "1",
      "yes",
      "si",
      "on",
    ].includes(key)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
    ].includes(key)
  ) {
    return false;
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
    cleanText(value, "")
  );
}

function htmlAttrs(
  attrs = {}
) {
  return Object.entries(
    safeObject(attrs)
  )
    .map(([key, value]) => {
      if (!key) {
        return "";
      }

      if (
        value === false ||
        value === null ||
        value === undefined
      ) {
        return "";
      }

      if (value === true) {
        return escapeHtml(key);
      }

      return `${escapeHtml(key)}="${escapeHtml(value)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

function disabledAttrs(
  disabled = false,
  busy = false
) {
  return htmlAttrs({
    disabled:
      Boolean(disabled),

    "aria-disabled":
      disabled
        ? "true"
        : false,

    "aria-busy":
      busy
        ? "true"
        : false,
  });
}

function normalizeText(
  value = ""
) {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );
}

function normalizeKey(
  value = ""
) {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readPath(
  source = {},
  path = ""
) {
  const parts =
    cleanText(path, "")
      .split(".")
      .map(
        (part) =>
          part.trim()
      )
      .filter(Boolean);

  let current =
    source;

  for (const part of parts) {
    if (
      current === null ||
      current === undefined
    ) {
      return undefined;
    }

    current =
      current?.[part];
  }

  return current;
}

function uniqueObjects(
  items = []
) {
  const output = [];
  const seen =
    new Set();

  for (
    const item
    of safeArray(items)
  ) {
    if (!isObject(item)) {
      continue;
    }

    if (!hasOwnKeys(item)) {
      continue;
    }

    if (seen.has(item)) {
      continue;
    }

    seen.add(item);
    output.push(item);
  }

  return output;
}

function getPayloadSources(
  payload = {}
) {
  const item =
    safeObject(payload);

  const raw =
    safeObject(item.raw);

  const rawRaw =
    safeObject(raw.raw);

  return uniqueObjects([
    item,
    raw,
    rawRaw,

    safeObject(item.data),
    safeObject(item.payload),
    safeObject(item.result),
    safeObject(item.item),
    safeObject(item.factura),
    safeObject(item.invoice),
    safeObject(item.billing),
    safeObject(item.totales),
    safeObject(item.totals),
    safeObject(item.summary),
    safeObject(item.payment),
    safeObject(item.meta),

    safeObject(raw.data),
    safeObject(raw.payload),
    safeObject(raw.result),
    safeObject(raw.item),
    safeObject(raw.factura),
    safeObject(raw.invoice),
    safeObject(raw.billing),
    safeObject(raw.totales),
    safeObject(raw.totals),
    safeObject(raw.summary),
    safeObject(raw.payment),
    safeObject(raw.meta),

    safeObject(rawRaw.data),
    safeObject(rawRaw.payload),
    safeObject(rawRaw.result),
    safeObject(rawRaw.item),
    safeObject(rawRaw.factura),
    safeObject(rawRaw.invoice),
    safeObject(rawRaw.billing),
    safeObject(rawRaw.totales),
    safeObject(rawRaw.totals),
    safeObject(rawRaw.summary),
    safeObject(rawRaw.payment),
    safeObject(rawRaw.meta),
  ]);
}

function firstFromSources(
  sources = [],
  paths = []
) {
  for (
    const source
    of safeArray(sources)
  ) {
    for (
      const path
      of safeArray(paths)
    ) {
      const value =
        readPath(
          source,
          path
        );

      if (
        value === undefined ||
        value === null
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
  }

  return null;
}

function safeUrl(
  value = ""
) {
  const raw =
    cleanText(value, "");

  if (!raw) {
    return "";
  }

  if (raw.startsWith("//")) {
    return "";
  }

  if (/[\r\n\t\\]/.test(raw)) {
    return "";
  }

  if (
    /^(javascript|data|vbscript|file):/i
      .test(raw)
  ) {
    return "";
  }

  if (
    /^blob:/i.test(raw)
  ) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return raw.replace(
      /\/{2,}/g,
      "/"
    );
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).href;
    } catch {
      return "";
    }
  }

  return "";
}

function firstUrl(
  ...values
) {
  for (
    const value
    of values.flat()
  ) {
    const url =
      safeUrl(value);

    if (url) {
      return url;
    }
  }

  return "";
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatMoney(
  value = 0,
  currency = DEFAULT_CURRENCY
) {
  const amount =
    number(value, 0);

  const code =
    cleanText(
      currency,
      DEFAULT_CURRENCY
    ).toUpperCase();

  try {
    return new Intl.NumberFormat(
      "es-ES",
      {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    ).format(amount);
  } catch {
    return `${amount
      .toFixed(2)
      .replace(".", ",")} ${code}`;
  }
}

function formatPercent(
  value = 0
) {
  const parsed =
    Math.abs(
      number(value, 0)
    );

  if (!parsed) {
    return "";
  }

  const clean =
    Number.isInteger(parsed)
      ? String(parsed)
      : String(parsed)
          .replace(".", ",");

  return `${clean}%`;
}

function normalizeDateInput(
  value = null
) {
  if (!value) {
    return null;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return (
      value >
      9_999_999_999
        ? new Date(value)
        : new Date(
            value * 1000
          )
    );
  }

  const raw =
    cleanText(value, "");

  if (!raw) {
    return null;
  }

  return new Date(
    raw.includes("T")
      ? raw
      : `${raw}T00:00:00`
  );
}

function formatDate(
  value = null
) {
  const date =
    normalizeDateInput(value);

  if (
    !date ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).format(date);
  } catch {
    return "—";
  }
}

function formatDateTime(
  value = null
) {
  const date =
    normalizeDateInput(value);

  if (
    !date ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-ES",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }
    ).format(date);
  } catch {
    return "—";
  }
}

function formatRelativeDate(
  value = null
) {
  const date =
    normalizeDateInput(value);

  if (
    !date ||
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "Sin fecha";
  }

  const diffMs =
    date.getTime() -
    Date.now();

  const diffMin =
    Math.round(
      diffMs / 60000
    );

  const absMin =
    Math.abs(diffMin);

  if (absMin < 1) {
    return "ahora";
  }

  if (absMin < 60) {
    return (
      diffMin > 0
        ? `en ${absMin} min`
        : `hace ${absMin} min`
    );
  }

  const diffHours =
    Math.round(
      absMin / 60
    );

  if (diffHours < 24) {
    return (
      diffMin > 0
        ? `en ${diffHours} h`
        : `hace ${diffHours} h`
    );
  }

  const diffDays =
    Math.round(
      diffHours / 24
    );

  if (diffDays <= 7) {
    return (
      diffMin > 0
        ? `en ${diffDays} día${diffDays === 1 ? "" : "s"}`
        : `hace ${diffDays} día${diffDays === 1 ? "" : "s"}`
    );
  }

  return formatDate(value);
}

function capitalizeFirst(
  value = "",
  fallback = "—"
) {
  const text =
    cleanText(
      value,
      fallback
    );

  if (
    !text ||
    text === fallback
  ) {
    return text;
  }

  const clean =
    text
      .replace(/\s+/g, " ")
      .trim();

  if (!clean) {
    return fallback;
  }

  const normalizeRest =
    clean ===
      clean.toLocaleLowerCase("es-ES") ||
    clean ===
      clean.toLocaleUpperCase("es-ES");

  const firstLetter =
    clean
      .charAt(0)
      .toLocaleUpperCase("es-ES");

  const rest =
    normalizeRest
      ? clean
          .slice(1)
          .toLocaleLowerCase("es-ES")
      : clean.slice(1);

  return `${firstLetter}${rest}`;
}

function formatPaymentMethodLabel(
  value = "",
  fallback = "—"
) {
  const text =
    cleanText(
      value,
      fallback
    );

  if (
    !text ||
    text === fallback
  ) {
    return text;
  }

  const key =
    normalizeKey(text);

  switch (key) {
    case "transferencia_bancaria":
    case "transferencia":
    case "bank_transfer":
    case "wire_transfer":
    case "sepa_transfer":
      return "Transferencia bancaria";

    case "efectivo":
    case "cash":
      return "Efectivo";

    case "tarjeta":
    case "tarjeta_bancaria":
    case "card":
    case "credit_card":
    case "debit_card":
      return "Tarjeta";

    case "bizum":
      return "Bizum";

    case "paypal":
      return "PayPal";

    case "domiciliacion":
    case "domiciliacion_bancaria":
    case "direct_debit":
      return "Domiciliación bancaria";

    default:
      return capitalizeFirst(
        text,
        fallback
      );
  }
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

    eye:
      `<svg ${common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,

    download:
      `<svg ${common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`,

    send:
      `<svg ${common}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,

    check:
      `<svg ${common}><path d="m20 6-11 11-5-5"/></svg>`,

    ticket:
      `<svg ${common}><path d="M3 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z"/><path d="M13 5v14"/></svg>`,

    file:
      `<svg ${common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>`,

    mail:
      `<svg ${common}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-10 6L2 7"/></svg>`,
  };

  return (
    icons[name] ||
    icons.file
  );
}

/* =========================================================
   FACTURA PICKERS
========================================================= */

function getFacturaId(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return cleanText(
    firstFromSources(
      sources,
      [
        "id",
        "_id",
        "facturaId",
        "invoiceId",
        "documentId",
        "uuid",
        "numeroFacturaLegal",
        "numeroFacturaSistema",
        "numeroFactura",
        "numero",
      ]
    ),
    ""
  );
}

function getFacturaNumero(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return cleanText(
    firstFromSources(
      sources,
      [
        "numeroFacturaLegal",
        "legalInvoiceNumber",
        "legalNumber",
        "numeroLegal",
        "numeroFactura",
        "invoiceNumber",
        "number",
        "numero",
        "code",
        "facturaCode",
        "facturaId",
        "invoiceId",
        "id",
      ]
    ),
    "—"
  );
}

function getFacturaSistema(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return cleanText(
    firstFromSources(
      sources,
      [
        "numeroFacturaSistema",
        "systemInvoiceNumber",
        "systemNumber",
      ]
    ),
    ""
  );
}

function getClienteNombre(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return cleanText(
    firstFromSources(
      sources,
      [
        "cliente.nombreContacto",
        "cliente.nombreCompleto",
        "cliente.nombre",
        "cliente.name",
        "cliente.displayName",

        "clienteSnapshot.nombreContacto",
        "clienteSnapshot.nombreCompleto",
        "clienteSnapshot.nombre",
        "clienteSnapshot.name",
        "clienteSnapshot.displayName",

        "client.contactName",
        "client.name",
        "client.displayName",

        "customer.contactName",
        "customer.name",
        "customer.displayName",

        "clienteNombre",
        "clientName",
        "customerName",
        "nombreContacto",
        "displayName",
        "name",
      ]
    ),
    "Cliente"
  );
}

function getClienteEmpresa(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return cleanText(
    firstFromSources(
      sources,
      [
        "cliente.empresa",
        "cliente.razonSocial",
        "cliente.companyName",
        "cliente.businessName",

        "clienteSnapshot.empresa",
        "clienteSnapshot.razonSocial",
        "clienteSnapshot.companyName",

        "client.company",
        "client.companyName",
        "client.businessName",

        "customer.company",
        "customer.companyName",

        "clienteEmpresa",
        "empresa",
        "razonSocial",
        "companyName",
        "businessName",
      ]
    ),
    ""
  );
}

function getClienteEmail(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return cleanText(
    firstFromSources(
      sources,
      [
        "cliente.email",
        "cliente.emailLower",
        "cliente.correo",

        "clienteSnapshot.email",
        "clienteSnapshot.emailLower",

        "client.email",
        "customer.email",

        "clienteEmail",
        "emailCliente",
        "clientEmail",
        "customerEmail",
        "recipientEmail",
        "email",
      ]
    ),
    ""
  );
}

function getClienteAvatar(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  for (const source of sources) {
    const url =
      firstUrl(
        source?.cliente?.avatarUrl,
        source?.cliente?.avatar,
        source?.cliente?.picture,
        source?.cliente?.photoUrl,

        source?.clienteSnapshot?.avatarUrl,
        source?.clienteSnapshot?.avatar,
        source?.clienteSnapshot?.picture,

        source?.client?.avatarUrl,
        source?.client?.avatar,

        source?.customer?.avatarUrl,
        source?.customer?.avatar,

        source?.clienteAvatarUrl,
        source?.clienteAvatar,
        source?.clientAvatarUrl,
        source?.clientAvatar,
        source?.avatarUrl,
        source?.avatar
      );

    if (url) {
      return url;
    }
  }

  return "";
}

function getFacturaMoneda(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return cleanText(
    firstFromSources(
      sources,
      [
        "currency",
        "moneda",
        "currencyCode",
        "billing.currency",
        "totales.currency",
        "totals.currency",
      ]
    ),
    DEFAULT_CURRENCY
  ).toUpperCase();
}

function getFacturaFecha(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return firstFromSources(
    sources,
    [
      "fechaFactura",
      "fechaEmision",
      "issuedAt",
      "issueDate",
      "invoiceDate",
      "date",
      "createdAt",
      "created_at",
    ]
  );
}

function getFacturaServicioAt(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return firstFromSources(
    sources,
    [
      "fechaServicio",
      "serviceDate",
      "serviceAt",
      "servicioAt",
      "periodoServicio",
      "billing.serviceDate",
      "meta.fechaServicio",
    ]
  );
}

function getFacturaUpdatedAt(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return firstFromSources(
    sources,
    [
      "updatedAt",
      "modifiedAt",
      "lastActivityAt",
      "lastUpdatedAt",
      "sentAt",
      "fechaEnvio",
      "createdAt",
    ]
  );
}

function getFacturaFechaEnvio(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return firstFromSources(
    sources,
    [
      "sentAt",
      "fechaEnvio",
      "sentDate",
      "emailSentAt",
      "delivery.sentAt",
      "delivery.emailSentAt",
      "mail.sentAt",
      "meta.sentAt",
    ]
  );
}

function getFacturaEnviadoA(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return cleanText(
    firstFromSources(
      sources,
      [
        "sentTo",
        "enviadoA",
        "recipientEmail",
        "emailSentTo",
        "delivery.sentTo",
        "delivery.recipient",
        "delivery.email",
        "mail.to",
        "mail.recipient",
        "meta.sentTo",
        "cliente.email",
        "clienteSnapshot.email",
        "client.email",
        "customer.email",
        "clienteEmail",
        "clientEmail",
      ]
    ),
    "—"
  );
}

function getFacturaFormaPago(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  const value =
    firstFromSources(
      sources,
      [
        "formaPago",
        "metodoPago",
        "paymentMethod",
        "payment.method",
        "paymentMethodLabel",
        "billing.paymentMethod",
      ]
    );

  return formatPaymentMethodLabel(
    value,
    "—"
  );
}

function getFacturaPreview(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return cleanMultiline(
    firstFromSources(
      sources,
      [
        "descripcion",
        "description",
        "concepto",
        "concept",
        "preview",
        "notes",
        "notas",
        "observaciones",
        "summary",
        "detalle",
        "billing.description",
      ]
    ),
    "Sin descripción adicional."
  );
}

/* =========================================================
   MONEY / TOTALS
========================================================= */

function firstNumericFromSources(
  sources = [],
  paths = []
) {
  const raw =
    firstFromSources(
      sources,
      paths
    );

  if (
    raw === null ||
    raw === undefined ||
    raw === ""
  ) {
    return null;
  }

  const parsed =
    number(raw, NaN);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function getFacturaBase(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  const explicit =
    firstNumericFromSources(
      sources,
      [
        "baseImponible",
        "taxableBase",
        "subtotal",
        "base",
        "importeBase",
        "netAmount",
        "totales.baseImponible",
        "totals.taxableBase",
        "totales.base",
        "totals.subtotal",
        "summary.base",
        "billing.subtotal",
      ]
    );

  if (explicit !== null) {
    return explicit;
  }

  const lines =
    getLineasRaw(factura);

  if (lines.length) {
    return lines.reduce(
      (sum, line) =>
        sum +
        getLineaSubtotal(line),
      0
    );
  }

  return 0;
}

function getFacturaTotal(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  const explicit =
    firstNumericFromSources(
      sources,
      [
        "total",
        "totalFactura",
        "importeTotal",
        "amount",
        "invoiceAmount",
        "grandTotal",
        "totalAmount",
        "grossAmount",

        "totales.total",
        "totales.totalFactura",
        "totals.total",
        "totals.grandTotal",
        "summary.total",
        "billing.total",
      ]
    );

  if (explicit !== null) {
    return explicit;
  }

  const base =
    getFacturaBase(factura);

  const taxes =
    getFacturaImpuestos(
      factura
    );

  return base + taxes;
}

function getFacturaPagado(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  const explicit =
    firstNumericFromSources(
      sources,
      [
        "totalPagado",
        "pagado",
        "paidAmount",
        "amountPaid",
        "payment.paidAmount",
        "payment.amountPaid",
        "totales.pagado",
        "totals.paid",
        "summary.paid",
      ]
    );

  if (explicit !== null) {
    return explicit;
  }

  const status =
    normalizeKey(
      getFacturaEstadoPagoRaw(
        factura
      )
    );

  return [
    "paid",
    "pagada",
    "pagado",
    "cobrada",
    "abonada",
  ].includes(status)
    ? getFacturaTotal(factura)
    : 0;
}

function getFacturaPendiente(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  const explicit =
    firstNumericFromSources(
      sources,
      [
        "totalPendiente",
        "pendiente",
        "pendingAmount",
        "outstandingAmount",
        "amountDue",
        "payment.pendingAmount",
        "payment.outstandingAmount",
        "totales.pendiente",
        "totals.pending",
        "summary.pending",
      ]
    );

  if (explicit !== null) {
    return Math.max(
      0,
      explicit
    );
  }

  const total =
    getFacturaTotal(factura);

  const paid =
    getFacturaPagado(factura);

  const status =
    normalizeKey(
      getFacturaEstadoPagoRaw(
        factura
      )
    );

  if (
    [
      "cancelled",
      "canceled",
      "cancelada",
      "cancelado",
    ].includes(status)
  ) {
    return 0;
  }

  return Math.max(
    0,
    total - paid
  );
}

/* =========================================================
   STATUS
========================================================= */

function getFacturaEstadoPagoRaw(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return firstFromSources(
    sources,
    [
      "estadoPago",
      "paymentStatus",
      "payment.status",
      "billing.paymentStatus",
    ]
  );
}

function getFacturaEstadoRaw(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  return firstFromSources(
    sources,
    [
      "estado",
      "status",
      "invoiceStatus",
      "documentStatus",
    ]
  );
}

function getEstadoPagoLabel(
  value = ""
) {
  const key =
    normalizeKey(value);

  switch (key) {
    case "paid":
    case "pagada":
    case "pagado":
    case "cobrada":
    case "abonada":
      return "Pagada";

    case "pending":
    case "pendiente":
    case "unpaid":
      return "Pendiente";

    case "overdue":
    case "vencida":
    case "vencido":
      return "Vencida";

    case "cancelled":
    case "canceled":
    case "cancelada":
    case "cancelado":
      return "Cancelada";

    case "draft":
    case "borrador":
      return "Borrador";

    case "partial":
    case "parcial":
    case "pago_parcial":
      return "Pago parcial";

    default:
      return cleanText(
        value,
        "Pendiente"
      );
  }
}

function getEstadoLabel(
  value = ""
) {
  const key =
    normalizeKey(value);

  switch (key) {
    case "emitida":
    case "emitido":
    case "issued":
      return "Emitida";

    case "enviada":
    case "enviado":
    case "sent":
      return "Enviada";

    case "anulada":
    case "anulado":
    case "void":
      return "Anulada";

    case "borrador":
    case "draft":
      return "Borrador";

    case "cancelada":
    case "cancelado":
    case "cancelled":
    case "canceled":
      return "Cancelada";

    case "abonada":
    case "paid":
      return "Abonada";

    default:
      return cleanText(
        value,
        "Emitida"
      );
  }
}

function getFacturaEstadoPagoLabel(
  factura = {}
) {
  return getEstadoPagoLabel(
    getFacturaEstadoPagoRaw(
      factura
    )
  );
}

function getFacturaEstadoLabel(
  factura = {}
) {
  return getEstadoLabel(
    getFacturaEstadoRaw(
      factura
    )
  );
}

function isFacturaPaid(
  factura = {}
) {
  return [
    "paid",
    "pagada",
    "pagado",
    "cobrada",
    "cobrado",
    "abonada",
    "abonado",
  ].includes(
    normalizeKey(
      getFacturaEstadoPagoRaw(
        factura
      )
    )
  );
}

function getEstadoPagoTone(
  value = ""
) {
  const key =
    normalizeKey(value);

  if (
    [
      "paid",
      "pagada",
      "pagado",
      "cobrada",
      "abonada",
    ].includes(key)
  ) {
    return "success";
  }

  if (
    [
      "pending",
      "pendiente",
      "partial",
      "parcial",
      "unpaid",
    ].includes(key)
  ) {
    return "warning";
  }

  if (
    [
      "overdue",
      "vencida",
      "vencido",
    ].includes(key)
  ) {
    return "danger";
  }

  if (
    [
      "cancelled",
      "canceled",
      "cancelada",
      "cancelado",
    ].includes(key)
  ) {
    return "muted";
  }

  return "neutral";
}

function getEstadoTone(
  value = ""
) {
  const key =
    normalizeKey(value);

  if (
    [
      "enviada",
      "enviado",
      "sent",
      "abonada",
      "paid",
    ].includes(key)
  ) {
    return "success";
  }

  if (
    [
      "borrador",
      "draft",
    ].includes(key)
  ) {
    return "warning";
  }

  if (
    [
      "anulada",
      "anulado",
      "void",
      "cancelada",
      "cancelado",
      "cancelled",
      "canceled",
    ].includes(key)
  ) {
    return "danger";
  }

  if (
    [
      "emitida",
      "emitido",
      "issued",
    ].includes(key)
  ) {
    return "accent";
  }

  return "neutral";
}

/* =========================================================
   INCIDENCIA RELATION
========================================================= */

function pickTicketIdFromArray(
  value = []
) {
  for (
    const item
    of safeArray(value)
  ) {
    if (
      typeof item === "string" ||
      typeof item === "number"
    ) {
      const candidate =
        cleanText(item, "");

      if (candidate) {
        return candidate;
      }

      continue;
    }

    if (!isObject(item)) {
      continue;
    }

    const candidate =
      first(
        item.ticketId,
        item.incidenciaId,
        item.id,
        item.code,

        item.ticket?.ticketId,
        item.ticket?.incidenciaId,
        item.ticket?.id,

        item.incidencia?.ticketId,
        item.incidencia?.incidenciaId,
        item.incidencia?.id,

        item.linkedTicket?.ticketId,
        item.linkedTicket?.incidenciaId,
        item.linkedTicket?.id
      );

    if (candidate) {
      return cleanText(
        candidate,
        ""
      );
    }
  }

  return "";
}

function getRelationSources(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  const relationSources = [];

  for (const source of sources) {
    relationSources.push(
      safeObject(
        source.incidencia
      ),

      safeObject(
        source.ticket
      ),

      safeObject(
        source.linkedTicket
      ),

      safeObject(
        source.relatedTicket
      ),

      safeObject(
        source.relatedIncident
      ),

      safeObject(
        source.supportTicket
      ),

      safeObject(
        source.case
      ),

      safeObject(
        source.relations?.ticket
      ),

      safeObject(
        source.relations?.incidencia
      ),

      safeObject(
        source.meta
      )
    );
  }

  return uniqueObjects([
    ...sources,
    ...relationSources,
  ]);
}

function getFacturaIncidenciaId(
  factura = {}
) {
  const sources =
    getRelationSources(factura);

  const direct =
    cleanText(
      firstFromSources(
        sources,
        [
          "ticketId",
          "incidenciaId",

          "incidencia.ticketId",
          "incidencia.id",
          "incidencia.incidenciaId",

          "ticket.ticketId",
          "ticket.id",
          "ticket.incidenciaId",

          "linkedTicket.ticketId",
          "linkedTicket.id",
          "linkedTicket.incidenciaId",

          "relations.ticket.ticketId",
          "relations.ticket.id",
          "relations.ticket.incidenciaId",

          "relations.incidencia.ticketId",
          "relations.incidencia.id",
          "relations.incidencia.incidenciaId",

          "relatedTicket.ticketId",
          "relatedTicket.id",
          "relatedTicket.incidenciaId",

          "relatedIncident.ticketId",
          "relatedIncident.id",
          "relatedIncident.incidenciaId",

          "supportTicket.ticketId",
          "supportTicket.id",
          "supportTicket.incidenciaId",

          "relatedTicketId",
          "relatedIncidentId",
          "supportTicketId",
          "caseId",

          "meta.ticketId",
          "meta.incidenciaId",
          "meta.linkedTicketId",
        ]
      ),
      ""
    );

  if (direct) {
    return direct;
  }

  for (const source of sources) {
    const arrayCandidate =
      first(
        pickTicketIdFromArray(
          source.ticketIds
        ),

        pickTicketIdFromArray(
          source.incidenciaIds
        ),

        pickTicketIdFromArray(
          source.relatedTicketIds
        ),

        pickTicketIdFromArray(
          source.relatedIncidentIds
        ),

        pickTicketIdFromArray(
          source.linkedTickets
        ),

        pickTicketIdFromArray(
          source.incidencias
        ),

        pickTicketIdFromArray(
          source.tickets
        ),

        pickTicketIdFromArray(
          source.relatedTickets
        ),

        pickTicketIdFromArray(
          source.relations
        ),

        pickTicketIdFromArray(
          source.invoiceRelations
        )
      );

    if (arrayCandidate) {
      return cleanText(
        arrayCandidate,
        ""
      );
    }
  }

  return "";
}

function getFacturaIncidenciaSubject(
  factura = {}
) {
  const sources =
    getRelationSources(factura);

  return cleanText(
    firstFromSources(
      sources,
      [
        "incidencia.subject",
        "incidencia.asunto",
        "incidencia.title",

        "ticket.subject",
        "ticket.asunto",
        "ticket.title",

        "linkedTicket.subject",
        "linkedTicket.asunto",
        "linkedTicket.title",

        "subject",
        "asunto",
        "title",
      ]
    ),
    ""
  );
}

/* =========================================================
   LINES
========================================================= */

function getLineasRaw(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  const value =
    firstFromSources(
      sources,
      [
        "lineas",
        "items",
        "conceptos",
        "lines",
        "invoiceLines",
        "billing.lines",
      ]
    );

  return safeArray(value);
}

function getLineas(
  factura = {}
) {
  const rows =
    getLineasRaw(factura);

  if (rows.length) {
    return rows;
  }

  const concepto =
    getFacturaPreview(factura);

  const base =
    firstNumericFromSources(
      getPayloadSources(factura),
      [
        "baseImponible",
        "taxableBase",
        "subtotal",
        "base",
        "importeBase",
        "netAmount",
        "totales.baseImponible",
        "totals.taxableBase",
      ]
    );

  if (
    concepto &&
    base !== null &&
    base !== 0
  ) {
    return [
      {
        id: "linea-principal",
        concepto,
        descripcion: "",
        cantidad: 1,
        precioUnitario: base,
        subtotal: base,
      },
    ];
  }

  return [];
}

function getLineaConcepto(
  linea = {}
) {
  return cleanText(
    first(
      linea?.concepto,
      linea?.descripcionCorta,
      linea?.descriptionShort,
      linea?.name,
      linea?.title,
      linea?.description
    ),
    "Línea"
  );
}

function getLineaDescripcion(
  linea = {}
) {
  return cleanMultiline(
    first(
      linea?.descripcion,
      linea?.detalle,
      linea?.description,
      linea?.detail,
      linea?.notes
    ),
    ""
  );
}

function getLineaCantidad(
  linea = {}
) {
  return number(
    first(
      linea?.cantidad,
      linea?.qty,
      linea?.quantity,
      1
    ),
    1
  );
}

function getLineaUnitario(
  linea = {}
) {
  return number(
    first(
      linea?.precioUnitario,
      linea?.importeUnitario,
      linea?.unitPrice,
      linea?.precio,
      linea?.price
    ),
    0
  );
}

function getLineaSubtotal(
  linea = {}
) {
  const explicit =
    first(
      linea?.subtotal,
      linea?.base,
      linea?.importeBase,
      linea?.lineTotal,
      linea?.total
    );

  if (
    explicit !== null &&
    explicit !== undefined &&
    explicit !== ""
  ) {
    return number(
      explicit,
      0
    );
  }

  return (
    getLineaCantidad(linea) *
    getLineaUnitario(linea)
  );
}

function getLineaIvaPct(
  linea = {}
) {
  return number(
    first(
      linea?.ivaPorcentaje,
      linea?.porcentajeIva,
      linea?.ivaRate,
      linea?.taxRate
    ),
    0
  );
}

function getLineaIrpfPct(
  linea = {}
) {
  return number(
    first(
      linea?.irpfPorcentaje,
      linea?.porcentajeIrpf,
      linea?.irpfRate,
      linea?.withholdingRate
    ),
    0
  );
}

/* =========================================================
   TAXES
========================================================= */

function getTaxLines(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  const value =
    firstFromSources(
      sources,
      [
        "impuestos",
        "taxes",
        "taxLines",
        "desgloseImpuestos",
        "taxBreakdown",
      ]
    );

  return safeArray(value);
}

function normalizeTaxLine(
  entry = {}
) {
  const impuesto =
    safeObject(entry);

  const tipo =
    cleanText(
      first(
        impuesto.tipo,
        impuesto.taxType,
        impuesto.nombre,
        impuesto.name,
        impuesto.label,
        impuesto.code
      ),
      "Impuesto"
    );

  return {
    tipo,
    key:
      normalizeKey(tipo),

    porcentaje:
      number(
        first(
          impuesto.porcentaje,
          impuesto.percent,
          impuesto.rate,
          impuesto.tipoPorcentaje
        ),
        0
      ),

    base:
      number(
        first(
          impuesto.base,
          impuesto.taxBase,
          impuesto.baseAmount
        ),
        0
      ),

    importe:
      number(
        first(
          impuesto.importe,
          impuesto.amount,
          impuesto.total,
          impuesto.value
        ),
        0
      ),

    sign:
      cleanText(
        first(
          impuesto.sign,
          impuesto.tipoOperacion
        ),
        ""
      ),
  };
}

function getObjectTax(
  factura = {},
  type = "iva"
) {
  const sources =
    getPayloadSources(factura);

  const paths =
    type === "iva"
      ? [
          "iva",
          "tax.iva",
          "taxes.iva",
        ]
      : [
          "irpf",
          "retencionIrpf",
          "withholding",
          "tax.irpf",
          "taxes.irpf",
        ];

  const obj =
    safeObject(
      firstFromSources(
        sources,
        paths
      )
    );

  if (!hasOwnKeys(obj)) {
    return null;
  }

  const importe =
    number(
      first(
        obj.importe,
        obj.amount,
        obj.total,
        obj.value
      ),
      0
    );

  const porcentaje =
    number(
      first(
        obj.porcentaje,
        obj.percent,
        obj.rate,
        obj.tipoPorcentaje
      ),
      0
    );

  const base =
    number(
      first(
        obj.base,
        obj.taxBase,
        obj.baseAmount
      ),
      0
    );

  const enabled =
    bool(
      obj.enabled,
      Boolean(
        importe ||
        porcentaje ||
        base
      )
    );

  if (
    !enabled &&
    !importe &&
    !porcentaje &&
    !base
  ) {
    return null;
  }

  return {
    tipo:
      type === "iva"
        ? "IVA"
        : "IRPF",

    key:
      type,

    porcentaje,
    base,
    importe,

    sign:
      type === "irpf"
        ? "negative"
        : "positive",

    source:
      "object",
  };
}

function getExplicitTax(
  factura = {},
  type = "iva"
) {
  const sources =
    getPayloadSources(factura);

  const objectTax =
    getObjectTax(
      factura,
      type
    );

  if (objectTax) {
    return objectTax;
  }

  if (type === "iva") {
    const importe =
      number(
        firstFromSources(
          sources,
          [
            "ivaImporte",
            "importeIva",
            "totalIva",
            "ivaTotal",
            "ivaAmount",
            "totales.iva",
            "totals.iva",
            "summary.iva",
            "meta.displayIva",
          ]
        ),
        0
      );

    const porcentaje =
      number(
        firstFromSources(
          sources,
          [
            "ivaPorcentaje",
            "porcentajeIva",
            "ivaRate",
            "taxRate",
          ]
        ),
        0
      );

    const base =
      number(
        firstFromSources(
          sources,
          [
            "ivaBase",
            "baseIva",
            "baseImponible",
            "totales.baseImponible",
          ]
        ),
        0
      );

    if (
      importe ||
      porcentaje ||
      base
    ) {
      return {
        tipo: "IVA",
        key: "iva",
        porcentaje,
        base,
        importe,
        sign: "positive",
        source: "explicit",
      };
    }

    return null;
  }

  const importe =
    number(
      firstFromSources(
        sources,
        [
          "irpfImporte",
          "importeIrpf",
          "totalIrpf",
          "irpfTotal",
          "irpfAmount",
          "retencion",
          "retencionIrpf",
          "withholding",
          "withholdingAmount",
          "totales.irpf",
          "totals.irpf",
          "summary.irpf",
          "meta.displayIrpf",
        ]
      ),
      0
    );

  const porcentaje =
    number(
      firstFromSources(
        sources,
        [
          "irpfPorcentaje",
          "porcentajeIrpf",
          "irpfRate",
          "retencionPorcentaje",
          "withholdingRate",
        ]
      ),
      0
    );

  const base =
    number(
      firstFromSources(
        sources,
        [
          "irpfBase",
          "baseIrpf",
          "retencionBase",
          "baseImponible",
          "totales.baseImponible",
        ]
      ),
      0
    );

  if (
    importe ||
    porcentaje ||
    base
  ) {
    return {
      tipo: "IRPF",
      key: "irpf",
      porcentaje,
      base,
      importe,
      sign: "negative",
      source: "explicit",
    };
  }

  return null;
}

function getImpuestosBreakdown(
  factura = {}
) {
  const impuestos =
    getTaxLines(factura)
      .filter(isObject);

  let iva = null;
  let irpf = null;
  const otros = [];

  for (
    const entry
    of impuestos
  ) {
    const normalized =
      normalizeTaxLine(entry);

    const key =
      normalized.key;

    if (
      key.includes("iva") ||
      key.includes("vat")
    ) {
      iva = {
        ...normalized,
        tipo: "IVA",
        key: "iva",
      };

      continue;
    }

    if (
      key.includes("irpf") ||
      key.includes("retencion") ||
      key.includes("retention") ||
      key.includes("withholding")
    ) {
      irpf = {
        ...normalized,
        tipo: "IRPF",
        key: "irpf",
        sign:
          normalized.sign ||
          "negative",
      };

      continue;
    }

    otros.push(
      normalized
    );
  }

  if (!iva) {
    iva =
      getExplicitTax(
        factura,
        "iva"
      );
  }

  if (!irpf) {
    irpf =
      getExplicitTax(
        factura,
        "irpf"
      );
  }

  const totalFallback =
    getFacturaImpuestosExplicit(
      factura
    );

  if (
    !iva &&
    !irpf &&
    !otros.length &&
    totalFallback
  ) {
    otros.push({
      tipo: "Impuestos",
      key: "impuestos",
      porcentaje: 0,
      base:
        getFacturaBase(
          factura
        ),
      importe:
        totalFallback,
      sign:
        totalFallback < 0
          ? "negative"
          : "positive",
      source: "fallback",
    });
  }

  return {
    iva,
    irpf,
    otros,
  };
}

function getFacturaImpuestosExplicit(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  const explicit =
    firstNumericFromSources(
      sources,
      [
        "impuestos",
        "taxAmount",
        "taxesAmount",
        "totalImpuestos",
        "importeImpuestos",
        "netTaxAmount",
        "totales.impuestos",
        "totals.taxes",
        "summary.taxes",
      ]
    );

  return (
    explicit !== null
      ? explicit
      : 0
  );
}

function getFacturaImpuestos(
  factura = {}
) {
  const explicit =
    getFacturaImpuestosExplicit(
      factura
    );

  if (explicit) {
    return explicit;
  }

  const breakdown =
    getImpuestosBreakdown(
      factura
    );

  let total = 0;

  if (breakdown.iva) {
    total +=
      number(
        breakdown.iva.importe,
        0
      );
  }

  if (breakdown.irpf) {
    const amount =
      Math.abs(
        number(
          breakdown.irpf.importe,
          0
        )
      );

    total -= amount;
  }

  for (
    const item
    of breakdown.otros
  ) {
    const amount =
      number(
        item.importe,
        0
      );

    const negative =
      normalizeKey(item.sign) ===
        "negative" ||
      amount < 0;

    total +=
      negative
        ? -Math.abs(amount)
        : amount;
  }

  return total;
}

/* =========================================================
   PDF / SEND STATE
========================================================= */

function getFacturaPdfAvailable(
  factura = {}
) {
  const sources =
    getPayloadSources(factura);

  const raw =
    firstFromSources(
      sources,
      [
        "pdfAvailable",
        "hasPdf",
        "pdf.available",
        "document.pdfAvailable",
        "blob.pdfAvailable",
      ]
    );

  if (
    raw !== null &&
    raw !== undefined
  ) {
    return bool(
      raw,
      false
    );
  }

  for (const source of sources) {
    const url =
      firstUrl(
        source?.pdfUrl,
        source?.pdf?.url,
        source?.pdf?.viewUrl,
        source?.pdf?.downloadUrl,
        source?.blobUrl,
        source?.downloadUrl
      );

    if (url) {
      return true;
    }
  }

  /*
     El backend de OnionSupport puede generar/resolver el PDF por ID.
     Si existe ID, dejamos habilitadas las acciones para que index.js
     resuelva el recurso por API.
  */
  return Boolean(
    getFacturaId(factura)
  );
}

function isFacturaAlreadySent(
  factura = {}
) {
  if (
    getFacturaFechaEnvio(
      factura
    )
  ) {
    return true;
  }

  const sources =
    getPayloadSources(factura);

  const explicit =
    firstFromSources(
      sources,
      [
        "sent",
        "isSent",
        "emailSent",
        "delivery.sent",
        "mail.sent",
      ]
    );

  if (
    explicit !== null &&
    explicit !== undefined
  ) {
    return bool(
      explicit,
      false
    );
  }

  const state =
    normalizeKey(
      getFacturaEstadoRaw(
        factura
      )
    );

  return [
    "enviada",
    "enviado",
    "sent",
  ].includes(state);
}

/* =========================================================
   UI PARTIALS
========================================================= */

function renderActionSpinner(
  label = ""
) {
  return `
    <span class="facturas-detail-action-loading">
      <span
        class="facturas-detail-spinner"
        aria-hidden="true"
      ></span>

      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderChip(
  label = "",
  tone = "neutral"
) {
  return `
    <span
      class="facturas-detail-chip facturas-detail-chip--${attr(tone)}"
    >${escapeHtml(label)}</span>
  `;
}

export function renderMiniMeta(
  label = "",
  value = ""
) {
  return `
    <div class="facturas-detail-mini">
      <span class="facturas-detail-mini-label">
        ${escapeHtml(label)}
      </span>

      <strong class="facturas-detail-mini-value">
        ${escapeHtml(
          cleanText(
            value,
            "—"
          )
        )}
      </strong>
    </div>
  `;
}

export function renderDetailStat(
  label = "",
  value = "",
  options = {}
) {
  const tone =
    normalizeKey(
      options.tone ||
      "neutral"
    );

  return `
    <article
      class="facturas-detail-stat facturas-detail-stat--${attr(tone)}"
    >
      <span class="facturas-detail-stat-label">
        ${escapeHtml(label)}
      </span>

      <strong class="facturas-detail-stat-value">
        ${escapeHtml(value)}
      </strong>
    </article>
  `;
}

function renderTaxCard(
  label = "",
  tax = null,
  moneda = DEFAULT_CURRENCY,
  tone = "neutral"
) {
  const item =
    safeObject(tax);

  const porcentaje =
    formatPercent(
      item.porcentaje
    );

  const base =
    number(
      item.base,
      0
    );

  const importeRaw =
    number(
      item.importe,
      0
    );

  const displayAmount =
    tone === "irpf"
      ? -Math.abs(importeRaw)
      : importeRaw;

  const captionParts = [];

  if (porcentaje) {
    captionParts.push(
      `Tipo aplicado: ${porcentaje}`
    );
  }

  if (base) {
    captionParts.push(
      `Base: ${formatMoney(
        base,
        moneda
      )}`
    );
  }

  if (tone === "irpf") {
    captionParts.push(
      "Retención descontada del total"
    );
  }

  const caption =
    captionParts.join(" · ");

  return `
    <article
      class="facturas-detail-tax-card facturas-detail-tax-card--${attr(tone)}"
    >
      <span class="facturas-detail-tax-label">
        ${escapeHtml(
          porcentaje
            ? `${label} · ${porcentaje}`
            : label
        )}
      </span>

      <strong class="facturas-detail-tax-value">
        ${escapeHtml(
          formatMoney(
            displayAmount,
            moneda
          )
        )}
      </strong>

      ${
        caption
          ? `
            <span class="facturas-detail-tax-caption">
              ${escapeHtml(caption)}
            </span>
          `
          : ""
      }
    </article>
  `;
}

export function renderSectionCard({
  title = "",
  subtitle = "",
  content = "",
  className = "",
  id = "",
} = {}) {
  return `
    <section
      class="facturas-detail-section ${attr(className)}"
      ${id ? `id="${attr(id)}"` : ""}
    >
      <div class="facturas-detail-section-head">
        <h3 class="facturas-detail-section-title">
          ${escapeHtml(title)}
        </h3>

        ${
          subtitle
            ? `
              <p class="facturas-detail-section-subtitle">
                ${escapeHtml(subtitle)}
              </p>
            `
            : ""
        }
      </div>

      ${content}
    </section>
  `;
}

function renderAvatar(
  factura = {}
) {
  const raw =
    cleanText(
      first(
        getClienteEmpresa(factura),
        getClienteNombre(factura)
      ),
      "ON"
    );

  const parts =
    raw
      .split(/\s+/)
      .filter(Boolean);

  const initials =
    parts.length >= 2
      ? `${parts[0][0] || ""}${parts[1][0] || ""}`
          .toUpperCase()
      : raw
          .slice(0, 2)
          .toUpperCase();

  const avatarUrl =
    getClienteAvatar(
      factura
    );

  return `
    <div
      class="facturas-detail-avatar"
      data-has-avatar="${avatarUrl ? "true" : "false"}"
      aria-hidden="true"
    >
      ${
        avatarUrl
          ? `
            <img
              src="${attr(avatarUrl)}"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              draggable="false"
              class="facturas-detail-avatar-image"
            >
          `
          : ""
      }

      <span class="facturas-detail-avatar-fallback">
        ${escapeHtml(
          initials || "ON"
        )}
      </span>
    </div>
  `;
}

function renderIncidenciaMini(
  factura = {}
) {
  const incidenciaId =
    getFacturaIncidenciaId(
      factura
    );

  const incidenciaSubject =
    getFacturaIncidenciaSubject(
      factura
    );

  const facturaId =
    getFacturaId(
      factura
    );

  if (!incidenciaId) {
    return renderMiniMeta(
      "Incidencia",
      "Sin vincular"
    );
  }

  return `
    <div class="facturas-detail-mini">
      <span class="facturas-detail-mini-label">
        Incidencia
      </span>

      <button
        type="button"
        class="facturas-detail-incidencia-btn"
        data-action="${FACTURA_MODAL_ACTIONS.OPEN_INCIDENCIA}"
        data-facturas-action="${FACTURA_MODAL_ACTIONS.OPEN_INCIDENCIA}"
        data-ticket-id="${attr(incidenciaId)}"
        data-incidencia-id="${attr(incidenciaId)}"
        data-factura-id="${attr(facturaId)}"
        title="${attr(
          incidenciaSubject ||
          "Abrir incidencia relacionada"
        )}"
        aria-label="${attr(
          incidenciaSubject
            ? `Abrir incidencia ${incidenciaId}: ${incidenciaSubject}`
            : `Abrir incidencia ${incidenciaId}`
        )}"
      >
        <span
          class="facturas-detail-incidencia-icon"
          aria-hidden="true"
        >${icon("ticket")}</span>

        <span>${escapeHtml(incidenciaId)}</span>
      </button>
    </div>
  `;
}

function renderFeedback({
  message = "",
  type = "info",
} = {}) {
  const text =
    cleanText(
      message,
      ""
    );

  if (!text) {
    return "";
  }

  const tone =
    [
      "success",
      "warning",
      "error",
      "info",
    ].includes(
      normalizeKey(type)
    )
      ? normalizeKey(type)
      : "info";

  const title =
    tone === "success"
      ? "Acción completada"
      : tone === "warning"
        ? "Aviso"
        : tone === "error"
          ? "No se pudo completar la acción"
          : "Información";

  return `
    <div
      class="facturas-detail-feedback facturas-detail-feedback--${attr(tone)}"
      role="${tone === "error" ? "alert" : "status"}"
      aria-live="${tone === "error" ? "assertive" : "polite"}"
      data-facturas-detail-feedback="true"
    >
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

/* =========================================================
   ACTIONS
========================================================= */

export function renderHeaderActions({
  factura = {},
  admin = false,
  sending = false,
  markingPaid = false,
  viewingPdf = false,
  downloading = false,
} = {}) {
  const facturaId =
    getFacturaId(
      factura
    );

  const pdfAvailable =
    Boolean(
      facturaId &&
      getFacturaPdfAvailable(
        factura
      )
    );

  const alreadySent =
    isFacturaAlreadySent(
      factura
    );

  const alreadyPaid =
    isFacturaPaid(
      factura
    );

  const canMarkPaid =
    Boolean(
      admin &&
      facturaId &&
      !alreadyPaid
    );

  const busy =
    Boolean(
      sending ||
      markingPaid ||
      viewingPdf ||
      downloading
    );

  const sendLabel =
    alreadySent
      ? "Reenviar"
      : "Enviar";

  const sendBusyLabel =
    alreadySent
      ? "Reenviando..."
      : "Enviando...";

  return `
    <div
      class="facturas-detail-actions"
      aria-label="Acciones de factura"
    >
      <button
        type="button"
        class="facturas-detail-btn"
        data-action="${FACTURA_MODAL_ACTIONS.VIEW_PDF}"
        data-facturas-action="${FACTURA_MODAL_ACTIONS.VIEW_PDF}"
        data-factura-id="${attr(facturaId)}"
        title="Ver PDF"
        aria-label="Ver PDF de la factura"
        ${disabledAttrs(
          !pdfAvailable ||
          busy,
          viewingPdf
        )}
      >
        ${
          viewingPdf
            ? renderActionSpinner(
                "Abriendo..."
              )
            : `
              <span class="facturas-detail-btn-icon">
                ${icon("eye")}
              </span>
              <span>Ver PDF</span>
            `
        }
      </button>

      <button
        type="button"
        class="facturas-detail-btn"
        data-action="${FACTURA_MODAL_ACTIONS.DOWNLOAD_PDF}"
        data-facturas-action="${FACTURA_MODAL_ACTIONS.DOWNLOAD_PDF}"
        data-factura-id="${attr(facturaId)}"
        title="Descargar PDF"
        aria-label="Descargar PDF de la factura"
        ${disabledAttrs(
          !pdfAvailable ||
          busy,
          downloading
        )}
      >
        ${
          downloading
            ? renderActionSpinner(
                "Bajando..."
              )
            : `
              <span class="facturas-detail-btn-icon">
                ${icon("download")}
              </span>
              <span>Descargar</span>
            `
        }
      </button>

      <button
        type="button"
        class="facturas-detail-btn ${canMarkPaid ? "" : "facturas-detail-btn--primary"}"
        data-action="${FACTURA_MODAL_ACTIONS.SEND}"
        data-facturas-action="${FACTURA_MODAL_ACTIONS.SEND}"
        data-factura-id="${attr(facturaId)}"
        data-factura-already-sent="${alreadySent ? "true" : "false"}"
        data-send-label="${attr(sendLabel)}"
        title="${attr(
          alreadySent
            ? "Reenviar factura al destinatario"
            : "Enviar factura al destinatario"
        )}"
        aria-label="${attr(
          alreadySent
            ? "Reenviar factura"
            : "Enviar factura"
        )}"
        ${disabledAttrs(
          !facturaId ||
          busy,
          sending
        )}
      >
        ${
          sending
            ? renderActionSpinner(
                sendBusyLabel
              )
            : `
              <span class="facturas-detail-btn-icon">
                ${icon("send")}
              </span>
              <span>${escapeHtml(sendLabel)}</span>
            `
        }
      </button>

      ${
        canMarkPaid
          ? `
            <button
              type="button"
              class="facturas-detail-btn facturas-detail-btn--primary"
              data-action="${FACTURA_MODAL_ACTIONS.MARK_PAID}"
              data-facturas-action="${FACTURA_MODAL_ACTIONS.MARK_PAID}"
              data-factura-id="${attr(facturaId)}"
              title="Registrar el cobro completo de esta factura"
              aria-label="Marcar factura como pagada"
              ${disabledAttrs(
                busy,
                markingPaid
              )}
            >
              ${
                markingPaid
                  ? renderActionSpinner(
                      "Registrando..."
                    )
                  : `
                    <span class="facturas-detail-btn-icon">
                      ${icon("check")}
                    </span>
                    <span>Marcar pagada</span>
                  `
              }
            </button>
          `
          : ""
      }

      <button
        type="button"
        class="facturas-detail-btn facturas-detail-btn--close"
        data-action="${FACTURA_MODAL_ACTIONS.CLOSE}"
        data-facturas-action="${FACTURA_MODAL_ACTIONS.CLOSE}"
        aria-label="Cerrar detalle de factura"
        title="Cerrar"
        ${disabledAttrs(
          busy,
          false
        )}
      >${icon("close")}</button>
    </div>
  `;
}

/* =========================================================
   SECTIONS
========================================================= */

function renderHeroMeta(
  factura = {}
) {
  const servicioAt =
    getFacturaServicioAt(
      factura
    );

  const moneda =
    getFacturaMoneda(
      factura
    );

  return `
    <div class="facturas-detail-meta-grid">
      ${renderMiniMeta(
        "Número legal",
        getFacturaNumero(
          factura
        )
      )}

      ${renderMiniMeta(
        "Fecha emisión",
        formatDate(
          getFacturaFecha(
            factura
          )
        )
      )}

      ${renderMiniMeta(
        "Servicio",
        servicioAt
          ? formatDate(servicioAt)
          : "—"
      )}

      ${renderMiniMeta(
        "Forma de pago",
        getFacturaFormaPago(
          factura
        )
      )}

      ${renderIncidenciaMini(
        factura
      )}

      ${renderMiniMeta(
        "Enviado a",
        getFacturaEnviadoA(
          factura
        )
      )}

      ${renderMiniMeta(
        "Pagado",
        formatMoney(
          getFacturaPagado(
            factura
          ),
          moneda
        )
      )}

      ${renderMiniMeta(
        "Pendiente",
        formatMoney(
          getFacturaPendiente(
            factura
          ),
          moneda
        )
      )}
    </div>
  `;
}

function renderResumenSection(
  factura = {}
) {
  const moneda =
    getFacturaMoneda(
      factura
    );

  const paymentTone =
    getEstadoPagoTone(
      getFacturaEstadoPagoRaw(
        factura
      )
    );

  return renderSectionCard({
    title:
      "Resumen económico",

    subtitle:
      "Importes principales y situación de cobro del documento.",

    className:
      "facturas-detail-section--summary",

    content: `
      <div class="facturas-detail-stats-grid">
        ${renderDetailStat(
          "Total",
          formatMoney(
            getFacturaTotal(
              factura
            ),
            moneda
          ),
          {
            tone: "accent",
          }
        )}

        ${renderDetailStat(
          "Base imponible",
          formatMoney(
            getFacturaBase(
              factura
            ),
            moneda
          )
        )}

        ${renderDetailStat(
          "Impuestos netos",
          formatMoney(
            getFacturaImpuestos(
              factura
            ),
            moneda
          )
        )}

        ${renderDetailStat(
          "Pago",
          getFacturaEstadoPagoLabel(
            factura
          ),
          {
            tone:
              paymentTone,
          }
        )}
      </div>
    `,
  });
}

function renderImpuestosSection(
  factura = {}
) {
  const moneda =
    getFacturaMoneda(
      factura
    );

  const breakdown =
    getImpuestosBreakdown(
      factura
    );

  const cards = [];

  if (breakdown.iva) {
    cards.push(
      renderTaxCard(
        "IVA",
        breakdown.iva,
        moneda,
        "iva"
      )
    );
  }

  if (breakdown.irpf) {
    cards.push(
      renderTaxCard(
        "IRPF",
        breakdown.irpf,
        moneda,
        "irpf"
      )
    );
  }

  breakdown.otros.forEach(
    (item) => {
      cards.push(
        renderTaxCard(
          item.tipo,
          item,
          moneda,
          "neutral"
        )
      );
    }
  );

  return renderSectionCard({
    title:
      "Impuestos",

    subtitle:
      "IVA, IRPF/retenciones y otros conceptos fiscales detectados.",

    className:
      "facturas-detail-section--taxes",

    content:
      cards.length
        ? `
          <div class="facturas-detail-tax-grid">
            ${cards.join("")}
          </div>
        `
        : renderMiniMeta(
            "Desglose",
            "Sin desglose fiscal disponible"
          ),
  });
}

function renderDescripcionSection(
  factura = {}
) {
  const incidenciaId =
    getFacturaIncidenciaId(
      factura
    );

  const incidenciaSubject =
    getFacturaIncidenciaSubject(
      factura
    );

  const preview =
    getFacturaPreview(
      factura
    );

  const subtitle =
    incidenciaId
      ? `Vinculada con ${incidenciaId}${incidenciaSubject ? ` · ${incidenciaSubject}` : ""}`
      : "Concepto y contexto asociados al documento.";

  return renderSectionCard({
    title:
      "Descripción / incidencia",

    subtitle,

    className:
      "facturas-detail-section--description",

    content: `
      <div class="facturas-detail-description">
        ${escapeHtml(preview)}
      </div>
    `,
  });
}

function renderLineaItem(
  linea = {},
  moneda = DEFAULT_CURRENCY
) {
  const item =
    safeObject(linea);

  const descripcion =
    getLineaDescripcion(
      item
    );

  const ivaPct =
    getLineaIvaPct(
      item
    );

  const irpfPct =
    getLineaIrpfPct(
      item
    );

  return `
    <article class="facturas-detail-linea">
      <div class="facturas-detail-linea-top">
        <div class="facturas-detail-linea-copy">
          <strong class="facturas-detail-linea-title">
            ${escapeHtml(
              getLineaConcepto(
                item
              )
            )}
          </strong>

          ${
            descripcion
              ? `
                <span class="facturas-detail-linea-desc">
                  ${escapeHtml(descripcion)}
                </span>
              `
              : ""
          }

          ${
            ivaPct ||
            irpfPct
              ? `
                <div class="facturas-detail-chip-row">
                  ${
                    ivaPct
                      ? renderChip(
                          `IVA ${formatPercent(ivaPct)}`,
                          "success"
                        )
                      : ""
                  }

                  ${
                    irpfPct
                      ? renderChip(
                          `IRPF ${formatPercent(irpfPct)}`,
                          "danger"
                        )
                      : ""
                  }
                </div>
              `
              : ""
          }
        </div>

        <strong class="facturas-detail-linea-amount">
          ${escapeHtml(
            formatMoney(
              getLineaSubtotal(
                item
              ),
              moneda
            )
          )}
        </strong>
      </div>

      <div class="facturas-detail-linea-grid">
        ${renderMiniMeta(
          "Cantidad",
          String(
            getLineaCantidad(
              item
            )
          )
        )}

        ${renderMiniMeta(
          "Unitario",
          formatMoney(
            getLineaUnitario(
              item
            ),
            moneda
          )
        )}

        ${renderMiniMeta(
          "Base línea",
          formatMoney(
            getLineaSubtotal(
              item
            ),
            moneda
          )
        )}
      </div>
    </article>
  `;
}

function renderLineasSection(
  factura = {}
) {
  const lineas =
    getLineas(
      factura
    );

  const moneda =
    getFacturaMoneda(
      factura
    );

  return renderSectionCard({
    title:
      "Conceptos",

    subtitle:
      lineas.length
        ? `${lineas.length} línea${lineas.length === 1 ? "" : "s"} facturada${lineas.length === 1 ? "" : "s"}.`
        : "Líneas facturadas y base económica de cada concepto.",

    className:
      "facturas-detail-section--lines",

    content:
      lineas.length
        ? `
          <div class="facturas-detail-lineas">
            ${lineas
              .map(
                (linea) =>
                  renderLineaItem(
                    linea,
                    moneda
                  )
              )
              .join("")}
          </div>
        `
        : renderMiniMeta(
            "Líneas",
            "Sin líneas"
          ),
  });
}

function renderEnvioSection(
  factura = {}
) {
  const fechaEnvio =
    getFacturaFechaEnvio(
      factura
    );

  const enviadoA =
    getFacturaEnviadoA(
      factura
    );

  const pdfAvailable =
    getFacturaPdfAvailable(
      factura
    );

  const updatedAt =
    getFacturaUpdatedAt(
      factura
    );

  const sent =
    isFacturaAlreadySent(
      factura
    );

  if (
    !fechaEnvio &&
    enviadoA === "—" &&
    !pdfAvailable &&
    !updatedAt
  ) {
    return "";
  }

  return renderSectionCard({
    title:
      "Envío",

    subtitle:
      sent
        ? "Información de la última entrega del documento fiscal."
        : "Estado de preparación y entrega del documento fiscal.",

    className:
      "facturas-detail-section--delivery",

    content: `
      <div class="facturas-detail-meta-grid facturas-detail-meta-grid--delivery">
        ${renderMiniMeta(
          "Estado",
          sent
            ? "Enviada"
            : "Pendiente de envío"
        )}

        ${renderMiniMeta(
          "Enviado a",
          enviadoA
        )}

        ${renderMiniMeta(
          "Fecha envío",
          fechaEnvio
            ? formatDateTime(
                fechaEnvio
              )
            : "—"
        )}

        ${renderMiniMeta(
          "PDF",
          pdfAvailable
            ? "Disponible"
            : "No disponible"
        )}

        ${renderMiniMeta(
          "Última actualización",
          updatedAt
            ? formatDateTime(
                updatedAt
              )
            : "—"
        )}
      </div>
    `,
  });
}

/* =========================================================
   CONTENT
========================================================= */

export function renderFacturasDetailContent({
  factura = null,
  loading = false,
  admin = false,
  markingPaidFacturaId = "",
  sendingFacturaId = "",
  viewingFacturaId = "",
  downloadingFacturaId = "",
  feedbackMessage = "",
  feedbackType = "info",
} = {}) {
  if (loading) {
    return `
      <div
        class="facturas-detail-loading"
        aria-live="polite"
        aria-busy="true"
      >
        <span class="sr-only">
          Cargando detalle de factura
        </span>

        <div class="facturas-detail-skeleton facturas-detail-skeleton--hero"></div>
        <div class="facturas-detail-skeleton facturas-detail-skeleton--summary"></div>
        <div class="facturas-detail-skeleton facturas-detail-skeleton--body"></div>
      </div>
    `;
  }

  if (!factura) {
    return `
      <div class="facturas-detail-layout facturas-detail-layout--empty">
        <header class="facturas-detail-header">
          <div class="facturas-detail-hero">
            <div class="facturas-detail-identity">
              <div class="facturas-detail-avatar" aria-hidden="true">
                <span class="facturas-detail-avatar-fallback">
                  ON
                </span>
              </div>

              <div class="facturas-detail-title-stack">
                <h2
                  id="facturas-detail-modal-title"
                  class="facturas-detail-title"
                >
                  Detalle no disponible
                </h2>

                <span class="facturas-detail-subtitle">
                  No hemos podido cargar la factura solicitada.
                </span>
              </div>
            </div>

            <div class="facturas-detail-actions">
              <button
                type="button"
                class="facturas-detail-btn facturas-detail-btn--close"
                data-action="${FACTURA_MODAL_ACTIONS.CLOSE}"
                data-facturas-action="${FACTURA_MODAL_ACTIONS.CLOSE}"
                aria-label="Cerrar detalle de factura"
                title="Cerrar"
              >${icon("close")}</button>
            </div>
          </div>
        </header>

        <div class="facturas-detail-body-shell">
          <main class="facturas-detail-body">
            ${renderMiniMeta(
              "Detalle",
              "No disponible"
            )}
          </main>
        </div>
      </div>
    `;
  }

  const facturaId =
    getFacturaId(
      factura
    );

  const markingPaid =
    String(
      markingPaidFacturaId
    ) ===
    String(facturaId);

  const sending =
    String(
      sendingFacturaId
    ) ===
    String(facturaId);

  const viewingPdf =
    String(
      viewingFacturaId
    ) ===
    String(facturaId);

  const downloading =
    String(
      downloadingFacturaId
    ) ===
    String(facturaId);

  const paymentRaw =
    getFacturaEstadoPagoRaw(
      factura
    );

  const estadoRaw =
    getFacturaEstadoRaw(
      factura
    );

  const numero =
    getFacturaNumero(
      factura
    );

  const numeroSistema =
    getFacturaSistema(
      factura
    );

  const clienteEmail =
    getClienteEmail(
      factura
    );

  const empresa =
    getClienteEmpresa(
      factura
    );

  const clienteNombre =
    getClienteNombre(
      factura
    );

  const updatedAt =
    getFacturaUpdatedAt(
      factura
    );

  const alreadySent =
    isFacturaAlreadySent(
      factura
    );

  const alreadyPaid =
    isFacturaPaid(
      factura
    );

  const busy =
    Boolean(
      markingPaid ||
      sending ||
      viewingPdf ||
      downloading
    );

  return `
    <div
      class="facturas-detail-layout"
      data-factura-id="${attr(facturaId)}"
      data-factura-sent="${alreadySent ? "true" : "false"}"
      data-factura-paid="${alreadyPaid ? "true" : "false"}"
      data-factura-busy="${busy ? "true" : "false"}"
    >
      <header
        class="facturas-detail-header"
        data-facturas-detail-header="true"
      >
        <div class="facturas-detail-hero">
          <div class="facturas-detail-identity">
            ${renderAvatar(
              factura
            )}

            <div class="facturas-detail-title-stack">
              <div class="facturas-detail-chip-row">
                <span class="facturas-detail-number">
                  ${escapeHtml(numero)}
                </span>

                ${
                  numeroSistema &&
                  numeroSistema !== numero
                    ? `
                      <span class="facturas-detail-system-number">
                        ${escapeHtml(numeroSistema)}
                      </span>
                    `
                    : ""
                }

                ${renderChip(
                  getFacturaEstadoPagoLabel(
                    factura
                  ),
                  getEstadoPagoTone(
                    paymentRaw
                  )
                )}

                ${renderChip(
                  getFacturaEstadoLabel(
                    factura
                  ),
                  getEstadoTone(
                    estadoRaw
                  )
                )}
              </div>

              <div class="facturas-detail-title-extra">
                <h2
                  id="facturas-detail-modal-title"
                  class="facturas-detail-title"
                >
                  ${escapeHtml(
                    empresa ||
                    clienteNombre
                  )}
                </h2>

                ${
                  empresa &&
                  empresa !== clienteNombre
                    ? `
                      <span class="facturas-detail-subtitle">
                        ${escapeHtml(clienteNombre)}
                      </span>
                    `
                    : ""
                }

                ${
                  clienteEmail
                    ? `
                      <span class="facturas-detail-subtitle">
                        ${escapeHtml(clienteEmail)}
                      </span>
                    `
                    : ""
                }

                <span class="facturas-detail-subtitle">
                  Última actualización
                  ${escapeHtml(
                    formatRelativeDate(
                      updatedAt
                    )
                  )}
                </span>
              </div>
            </div>
          </div>

          ${renderHeaderActions({
            factura,
            admin,
            markingPaid,
            sending,
            viewingPdf,
            downloading,
          })}
        </div>

        ${renderHeroMeta(
          factura
        )}
      </header>

      <div
        class="facturas-detail-body-shell"
        data-facturas-detail-body-shell="true"
      >
        <main
          class="facturas-detail-body"
          data-facturas-detail-body="true"
        >
          <div
            class="facturas-detail-feedback-slot"
            data-facturas-detail-feedback-slot="true"
          >
            ${renderFeedback({
              message:
                feedbackMessage,
              type:
                feedbackType,
            })}
          </div>

          ${renderResumenSection(
            factura
          )}

          ${renderImpuestosSection(
            factura
          )}

          ${renderDescripcionSection(
            factura
          )}

          ${renderLineasSection(
            factura
          )}

          ${renderEnvioSection(
            factura
          )}
        </main>
      </div>
    </div>
  `;
}

/* =========================================================
   MODAL
========================================================= */

export function renderFacturasDetailModal({
  open = false,
  detailOpen = false,
  detailLoading = false,
  loading = false,
  factura = null,
  item = null,
  detail = null,

  admin = false,
  markingPaidFacturaId = "",
  sendingFacturaId = "",
  viewingFacturaId = "",
  downloadingFacturaId = "",

  feedbackMessage = "",
  feedbackType = "info",
} = {}) {
  const visible =
    open === true ||
    detailOpen === true;

  const currentFactura =
    factura ||
    item ||
    detail ||
    null;

  if (!visible) {
    return "";
  }

  const facturaId =
    getFacturaId(
      currentFactura ||
      {}
    );

  return `
    <section
      class="facturas-detail-modal-root"
      data-facturas-detail-root="true"
      data-template-version="${attr(FACTURAS_MODAL_TEMPLATE_VERSION)}"
      data-factura-id="${attr(facturaId)}"
      data-open="true"
    >
      <div
        class="facturas-detail-overlay"
        data-facturas-detail-overlay="true"
      >
        <div
          class="facturas-detail-modal"
          data-role="facturas-detail-modal"
          data-facturas-detail-modal="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby="facturas-detail-modal-title"
          tabindex="-1"
        >
          ${renderFacturasDetailContent({
            factura:
              currentFactura,

            loading:
              loading === true ||
              detailLoading === true,

            admin,
            markingPaidFacturaId,
            sendingFacturaId,
            viewingFacturaId,
            downloadingFacturaId,

            feedbackMessage,
            feedbackType,
          })}
        </div>
      </div>
    </section>
  `;
}

export function renderFacturasDetailModalClosed() {
  return "";
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getFacturasModalTemplateSnapshot() {
  return {
    version:
      FACTURAS_MODAL_TEMPLATE_VERSION,

    actions:
      FACTURA_MODAL_ACTIONS,

    contract: {
      modalSelector:
        "[data-facturas-detail-modal='true']",

      overlaySelector:
        "[data-facturas-detail-overlay='true']",

      bodySelector:
        "[data-facturas-detail-body='true']",

      feedbackSlot:
        "[data-facturas-detail-feedback-slot='true']",
    },

    policy: {
      templateOnly: true,

      noAppCore: true,
      noAuth: true,
      noRouter: true,
      noHttp: true,
      noStore: true,
      noListeners: true,
      noDomApi: true,
      noToast: true,
      noNavigation: true,

      modalDetail: true,
      fixedHeaderReady: true,
      singleBodyScrollReady: true,

      pdfActions: true,
      sendAction: true,
      smartResendLabel: true,
      paymentAction: true,
      paymentActionAdminOnly: true,
      paymentActionHiddenWhenPaid: true,
      localFeedbackReady: true,

      openIncidenciaAction: true,

      ivaIrpfBreakdown: true,
      lineItems: true,
      deliveryInfo: true,

      clientAvatarAliasCompatibility: true,
      invoiceAliasCompatibility: true,
      relationAliasCompatibility: true,
      taxAliasCompatibility: true,

      ariaLabelledBy: true,
    },
  };
}

/* =========================================================
   EXPORTS
========================================================= */

export const renderFacturaDetailModal =
  renderFacturasDetailModal;

export const renderFacturaDetailContent =
  renderFacturasDetailContent;

export default {
  FACTURAS_MODAL_TEMPLATE_VERSION,
  FACTURA_MODAL_ACTIONS,

  renderMiniMeta,
  renderDetailStat,
  renderSectionCard,
  renderHeaderActions,

  renderFacturasDetailContent,
  renderFacturaDetailContent,

  renderFacturasDetailModal,
  renderFacturaDetailModal,
  renderFacturasDetailModalClosed,

  getFacturasModalTemplateSnapshot,
};
