/* =========================================================
   Onion Support - Agenda Dates
   Archivo: /src/views/agenda/agenda.dates.js

   Autoridad de fecha del calendario, del lado del navegador.

   El calendario de Agenda trabaja con DÍAS CIVILES, no con instantes: una
   celda es «17 de septiembre de 2026», no «un momento del tiempo». Por eso
   una fecha viaja siempre como texto `AAAA-MM-DD` y nunca se convierte a
   UTC para navegar, seleccionar o consultar. Es el mismo criterio que la
   autoridad del backend (`router/citas/cita_time.js`).

   Los formateadores salen del núcleo (`core/format.js`): aquí sólo viven
   los conjuntos de opciones que usa esta vista, como indica esa autoridad
   ("un preset usado por un módulo se queda con ese módulo").
========================================================= */

import { dateFormatter } from "../../core/format.js";
import { cleanText } from "../../core/presentation-text.js";

export const AGENDA_DATES_VERSION = "agenda.dates.v1";

/* Zona canónica de la agenda. La misma que declara el backend. */
export const AGENDA_TIME_ZONE = "Europe/Madrid";

/*
  Los presets declaran `timeZone: "UTC"` A PROPÓSITO, y siempre se formatea
  un instante construido con `Date.UTC` a partir de la fecha civil. Así la
  etiqueta es una FUNCIÓN PURA del día civil: no depende de la zona del
  navegador ni del orden en que se construyó el formateador. Un navegador en
  Tokio y otro en Madrid leen exactamente el mismo texto para el mismo día,
  que es lo que hace que el calendario, el modal, el detalle y el correo
  representen el mismo momento.
*/
export const AGENDA_DAY_PRESETS = Object.freeze({
  /* "jueves, 17 de septiembre de 2026" */
  longWeekday: Object.freeze({
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }),
  /* "septiembre de 2026" */
  monthYear: Object.freeze({ month: "long", year: "numeric", timeZone: "UTC" }),
  /* "septiembre" */
  month: Object.freeze({ month: "long", timeZone: "UTC" }),
});

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_KEY = /^(\d{2}):(\d{2})$/;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function capitalize(value = "") {
  const text = String(value || "");
  return text ? text.charAt(0).toLocaleUpperCase("es-ES") + text.slice(1) : "";
}

/* =========================================================
   CLAVES CIVILES
========================================================= */

/* Clave civil de un Date construido con componentes locales. */
export function dateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/* Date local a medianoche desde una clave civil, o null. */
export function dateFromKey(value = "") {
  const match = cleanText(value, "").match(DATE_KEY);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function isDateKey(value = "") {
  return Boolean(dateFromKey(value));
}

export function isTimeKey(value = "") {
  const match = cleanText(value, "").match(TIME_KEY);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

export function sameDay(a, b) {
  return Boolean(
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function localToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/* =========================================================
   REJILLA MENSUAL
========================================================= */

/*
  Las 42 celdas visibles del mes: seis semanas desde el lunes de la semana
  del día 1. Cada celda conoce su FECHA COMPLETA REAL, también las de los
  meses adyacentes: nunca se raspa el número del texto ni se supone el mes
  visible.
*/
export function monthCells(year, month) {
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const firstVisible = new Date(year, month, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      firstVisible.getFullYear(),
      firstVisible.getMonth(),
      firstVisible.getDate() + index
    );

    return Object.freeze({
      date,
      key: dateKey(date),
      inMonth: date.getMonth() === month,
    });
  });
}

/* Intervalo civil que cubre la rejilla visible, días adyacentes incluidos. */
export function monthRange(year, month) {
  const cells = monthCells(year, month);
  return Object.freeze({ desde: cells[0].key, hasta: cells[41].key });
}

/* =========================================================
   PRESENTACIÓN
========================================================= */

/*
  Formatea el DÍA CIVIL de un `Date` local: se toman sus componentes de
  calendario y se reconstruyen con `Date.UTC`, que es lo que el preset
  formatea. Nunca se pasa el instante local directamente al formateador.
*/
function format(date, preset) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  try {
    const civil = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    return dateFormatter(preset).format(civil);
  } catch {
    return "";
  }
}

/* "Jueves, 17 de septiembre de 2026" */
export function longDateLabel(date) {
  const text = format(date, AGENDA_DAY_PRESETS.longWeekday);
  return text ? capitalize(text) : date instanceof Date ? date.toLocaleDateString() : "";
}

/* La misma etiqueta desde una clave civil, sin inventar un instante. */
export function longDateLabelFromKey(value = "") {
  const date = dateFromKey(value);
  return date ? longDateLabel(date) : cleanText(value, "");
}

export function monthLabel(date) {
  const text = format(date, AGENDA_DAY_PRESETS.monthYear);
  return text ? capitalize(text) : `${date.getMonth() + 1}/${date.getFullYear()}`;
}

export function miniMonthLabel(date) {
  const text = format(date, AGENDA_DAY_PRESETS.month);
  return text ? capitalize(text) : String(date.getMonth() + 1);
}

/* "10:00 (Europe/Madrid)". La zona se muestra donde ayuda a no confundirse. */
export function timeWithZoneLabel(horaLocal = "", zona = AGENDA_TIME_ZONE) {
  const hora = cleanText(horaLocal, "");
  if (!hora) return "";
  const zone = cleanText(zona, "");
  return zone ? `${hora} (${zone})` : hora;
}

/*
  ¿La zona del navegador es otra? Entonces la hora de la cita puede no
  coincidir con el reloj de quien la lee, y conviene decirlo.
*/
export function browserZone() {
  try {
    return cleanText(Intl.DateTimeFormat().resolvedOptions().timeZone, "");
  } catch {
    return "";
  }
}

export function browserZoneDiffers(zona = AGENDA_TIME_ZONE) {
  const zone = browserZone();
  return Boolean(zone) && zone !== cleanText(zona, AGENDA_TIME_ZONE);
}

export default {
  AGENDA_DATES_VERSION,
  AGENDA_TIME_ZONE,
  AGENDA_DAY_PRESETS,
  dateKey,
  dateFromKey,
  isDateKey,
  isTimeKey,
  sameDay,
  localToday,
  monthCells,
  monthRange,
  longDateLabel,
  longDateLabelFromKey,
  monthLabel,
  miniMonthLabel,
  timeWithZoneLabel,
  browserZone,
  browserZoneDiffers,
};
