/* =========================================================
   Onion Support - Incidencias Domain Options
   Archivo: /src/views/incidencias/incidencias.options.js

   Fuente canónica para estado, prioridad y categoría.
   - Reutilizada por creación y edición admin del detalle.
   - Valores enviados al backend sin inventar taxonomías nuevas.
   - Alias únicamente para compatibilidad con datos legacy/español.
========================================================= */

function option(value, label) {
  return Object.freeze({ value, label });
}

export const INCIDENCIA_STATUS_OPTIONS = Object.freeze([
  option("pending", "Pendiente"),
  option("open", "Abierta"),
  option("closed", "Cerrada"),
]);

export const INCIDENCIA_PRIORITY_OPTIONS = Object.freeze([
  option("low", "Baja"),
  option("medium", "Media"),
  option("high", "Alta"),
]);

export const INCIDENCIA_CATEGORY_OPTIONS = Object.freeze([
  option("general", "General"),
  option("technical", "Técnica"),
  option("billing", "Facturación"),
  option("access", "Acceso"),
  option("hardware", "Hardware"),
  option("software", "Software"),
  option("account", "Cuenta"),
  option("network", "Redes"),
  option("documentation", "Documentación"),
  option("sales", "Ventas"),
]);

function key(value = "") {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("es-ES")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

const STATUS_ALIASES = Object.freeze({
  pending: "pending",
  pendiente: "pending",
  new: "pending",
  nueva: "pending",
  nuevo: "pending",

  open: "open",
  opened: "open",
  abierta: "open",
  abierto: "open",
  progress: "open",
  in_progress: "open",
  inprogress: "open",
  en_proceso: "open",

  closed: "closed",
  close: "closed",
  resolved: "closed",
  solved: "closed",
  cerrada: "closed",
  cerrado: "closed",
  resuelta: "closed",
  resuelto: "closed",
  cancelled: "closed",
  canceled: "closed",
  cancelada: "closed",
  cancelado: "closed",
});

const PRIORITY_ALIASES = Object.freeze({
  low: "low",
  baja: "low",

  medium: "medium",
  media: "medium",
  normal: "medium",

  high: "high",
  alta: "high",
  p1: "high",

  // Compatibilidad de lectura: la taxonomía actual sólo tiene tres niveles.
  urgent: "high",
  urgente: "high",
  critical: "high",
  critica: "high",
  critico: "high",
  p0: "high",
});

const CATEGORY_ALIASES = Object.freeze({
  general: "general",

  technical: "technical",
  tecnica: "technical",
  tecnico: "technical",

  billing: "billing",
  facturacion: "billing",

  access: "access",
  acceso: "access",

  hardware: "hardware",
  software: "software",

  account: "account",
  cuenta: "account",

  network: "network",
  networks: "network",
  red: "network",
  redes: "network",

  documentation: "documentation",
  documentacion: "documentation",

  sales: "sales",
  sale: "sales",
  venta: "sales",
  ventas: "sales",
});

function normalizeWith(map, value, fallback = "") {
  return map[key(value)] || fallback;
}

export function normalizeIncidenciaStatus(value = "", fallback = "") {
  return normalizeWith(STATUS_ALIASES, value, fallback);
}

export function normalizeIncidenciaPriority(value = "", fallback = "") {
  return normalizeWith(PRIORITY_ALIASES, value, fallback);
}

export function normalizeIncidenciaCategory(value = "", fallback = "") {
  return normalizeWith(CATEGORY_ALIASES, value, fallback);
}

export function incidenciaOptionLabel(options = [], value = "", fallback = "") {
  return options.find((item) => item.value === value)?.label || fallback;
}

export default Object.freeze({
  status: INCIDENCIA_STATUS_OPTIONS,
  priority: INCIDENCIA_PRIORITY_OPTIONS,
  category: INCIDENCIA_CATEGORY_OPTIONS,
});
