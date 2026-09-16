/* =========================================================
   Onion Support - Incidencias Domain Options
   Archivo: /src/views/incidencias/incidencias.options.js

   Fuente canónica para estado, prioridad y categoría.
   - Reutilizada por creación y edición admin del detalle.
   - Valores enviados al backend sin inventar taxonomías nuevas.
   - Alias únicamente para compatibilidad con datos legacy/español.
   - Release 2026-09-06: precisión temporal visible HH:MM validada por contrato.
========================================================= */

import { slugKey } from "../../core/slug-key.js";

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

/* ETIQUETAS: LA MISMA AUTORIDAD QUE DECLARA LOS VALORES DECLARA CÓMO SE LEEN.
 *
 * Los selects del detalle ya salían de estas listas; los chips no, y por eso la MISMA
 * incidencia se leía «Technical» en la cabecera y «Técnica» en el desplegable, con acentos
 * perdidos en media taxonomía (Billing, Access, Network, Documentation, Sales) y con el
 * token crudo del backend a la vista en cuanto llegaba un alias (`in_progress`, `urgent`,
 * `abierta`). Con una sola función, chip y select no pueden discrepar.
 *
 * Estados heredados: la taxonomía vigente tiene tres estados, pero el detalle sabía leer dos
 * más. Se conservan sus textos EXACTOS en vez de reescribirlos como «Abierta»/«Cerrada»: la
 * etiqueta no es el sitio donde recortar una taxonomía.
 *
 * Desconocido y ausente no son lo mismo: un valor ausente cae en el valor por defecto
 * declarado del campo; uno desconocido se muestra legible tal cual llega, sin inventarle un
 * estado que no tiene. */
const STATUS_LEGACY_LABELS = Object.freeze({
  progress: "En proceso",
  resolved: "Resuelta",
});

function readableValue(value = "") {
  const text = String(value ?? "")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!text) return "";

  return text
    .split(" ")
    .map((word) => (word ? `${word.charAt(0).toLocaleUpperCase("es-ES")}${word.slice(1)}` : ""))
    .join(" ");
}

function labelWith(options, aliases, legacy, value, fallback) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;

  const key = slugKey(raw);
  if (legacy?.[key]) return legacy[key];

  const canonical = aliases[key] || "";
  const declared = options.find((entry) => entry.value === canonical);
  if (declared) return declared.label;

  return readableValue(raw) || fallback;
}

export function incidenciaStatusLabel(value = "", fallback = "Abierta") {
  return labelWith(INCIDENCIA_STATUS_OPTIONS, STATUS_ALIASES, STATUS_LEGACY_LABELS, value, fallback);
}

export function incidenciaPriorityLabel(value = "", fallback = "Media") {
  return labelWith(INCIDENCIA_PRIORITY_OPTIONS, PRIORITY_ALIASES, null, value, fallback);
}

export function incidenciaCategoryLabel(value = "", fallback = "General") {
  return labelWith(INCIDENCIA_CATEGORY_OPTIONS, CATEGORY_ALIASES, null, value, fallback);
}

function normalizeWith(map, value, fallback = "") {
  return map[slugKey(value)] || fallback;
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

export default Object.freeze({
  status: INCIDENCIA_STATUS_OPTIONS,
  priority: INCIDENCIA_PRIORITY_OPTIONS,
  category: INCIDENCIA_CATEGORY_OPTIONS,
});
