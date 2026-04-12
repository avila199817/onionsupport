/* =========================================================
   Onion SPA - Incidencias Utils
   Archivo: src/views/incidencias/incidencias.utils.js

   Responsabilidades:
   - helpers puros reutilizables
   - sanitización
   - fechas
   - números
   - texto
   - normalización
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   BASE
========================================================= */

export function escapeHtml(value = "") {
  return AppCore?.utils?.escapeHtml?.(String(value ?? "")) || "";
}

export function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value).trim();

  return text || fallback;
}

export function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

export function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* =========================================================
   TEXT
========================================================= */

export function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function truncate(value = "", max = 160) {
  const text = safeString(value);

  if (text.length <= max) return text;

  return `${text.slice(0, max).trim()}…`;
}

export function getInitials(value = "") {
  return (
    String(value || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2) || "ON"
  );
}

/* =========================================================
   DATE
========================================================= */

export function toMs(value) {
  if (!value) return 0;

  const ms = new Date(value).getTime();

  return Number.isFinite(ms) ? ms : 0;
}

export function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  const diff = Date.now() - date.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "Hace un momento";
  if (diff < hour) return `Hace ${Math.floor(diff / minute)} min`;
  if (diff < day) return `Hace ${Math.floor(diff / hour)} h`;
  if (diff < day * 7) return `Hace ${Math.floor(diff / day)} d`;

  return formatDate(value);
}
