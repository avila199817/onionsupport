import assert from "node:assert/strict";

/*
  AGENDA · CITAS · CONTRATO DE DOMINIO (sin navegador)

  Fija lo que el recorrido visual no puede fijar por sí solo:

  - la rejilla del mes lleva la FECHA COMPLETA REAL de cada celda, también
    en los días adyacentes de otro mes, y no depende del mes visible;
  - la etiqueta larga en castellano sale de la autoridad de formato y es la
    misma para la misma fecha civil en cualquier zona del navegador;
  - la normalización de una cita no filtra al usuario campos de gestión;
  - el orden de las citas es estable;
  - los mensajes de error se deciden con la autoridad de presentación sobre
    los códigos que publica el backend, y ningún texto técnico llega a la
    persona;
  - la acción principal del alta sólo se habilita con los cuatro datos
    obligatorios, y el día elegido viaja como dato, no como texto pintado.
*/

const {
  AGENDA_DATES_VERSION,
  AGENDA_TIME_ZONE,
  AGENDA_DATE_PRESETS,
  dateKey,
  dateFromKey,
  isDateKey,
  isTimeKey,
  monthCells,
  monthRange,
  longDateLabel,
  longDateLabelFromKey,
  timeWithZoneLabel,
} = await import("../src/views/agenda/agenda.dates.js");

const {
  AGENDA_API_VERSION,
  CITAS_ENDPOINT,
  AGENDA_ERROR_RULES,
  agendaErrorMessage,
  normalizeCita,
  sortCitas,
  getAgendaApiSnapshot,
} = await import("../src/views/agenda/agenda.api.js");

const {
  AGENDA_CREATE_TEMPLATE_VERSION,
  buildCreateVm,
  createFormIsComplete,
} = await import("../src/views/agenda/agenda.template.create.js");

const {
  AGENDA_DETAIL_TEMPLATE_VERSION,
  buildDetailVm,
  citaStateLabel,
  renderCitaStateBadge,
} = await import("../src/views/agenda/agenda.template.detail.js");

const { AGENDA_VIEW_VERSION } = await import("../src/views/agenda/index.js");

const checks = [];
function pass(label) {
  checks.push(label);
  console.log(`PASS ${label}`);
}

/* =========================================================
   1 · VERSIONES DECLARADAS
========================================================= */
assert.equal(AGENDA_DATES_VERSION, "agenda.dates.v1");
assert.equal(AGENDA_API_VERSION, "agenda.api.v1");
assert.equal(AGENDA_CREATE_TEMPLATE_VERSION, "agenda.create-modal.v1");
assert.equal(AGENDA_DETAIL_TEMPLATE_VERSION, "agenda.detail-modal.v1");
assert.equal(AGENDA_VIEW_VERSION, "agenda.view.v3-citas");
assert.equal(AGENDA_TIME_ZONE, "Europe/Madrid", "la zona canónica es la del backend");
assert.equal(CITAS_ENDPOINT, "/api/citas");
pass("1 · versiones y zona canónica declaradas");

/* =========================================================
   2 · REJILLA: FECHA REAL EN CADA CELDA
========================================================= */
{
  /* Septiembre de 2026: la rejilla empieza el lunes 31 de agosto y termina
     el domingo 11 de octubre. */
  const cells = monthCells(2026, 8);
  assert.equal(cells.length, 42);
  assert.equal(cells[0].key, "2026-08-31");
  assert.equal(cells[0].inMonth, false, "la primera celda es del mes anterior");
  assert.equal(cells[41].key, "2026-10-11");
  assert.equal(cells[41].inMonth, false, "la última es del mes siguiente");

  const cell17 = cells.find((cell) => cell.key === "2026-09-17");
  assert.equal(cell17.inMonth, true);
  assert.equal(cell17.date.getDate(), 17);

  /* Los días adyacentes llevan su MES y AÑO reales, no los visibles. */
  assert.equal(cells[0].date.getMonth(), 7, "31/08 es agosto");
  assert.equal(cells[41].date.getMonth(), 9, "11/10 es octubre");

  assert.deepEqual(monthRange(2026, 8), { desde: "2026-08-31", hasta: "2026-10-11" });

  /* Cruce de año. */
  assert.deepEqual(monthRange(2025, 11), { desde: "2025-12-01", hasta: "2026-01-11" });

  /* Año bisiesto. */
  const feb2028 = monthCells(2028, 1);
  assert.ok(feb2028.some((cell) => cell.key === "2028-02-29"), "2028 es bisiesto");
  assert.ok(!monthCells(2026, 1).some((cell) => cell.key === "2026-02-29"), "2026 no lo es");

  /* Cada celda sabe su fecha; nadie tiene que leer el número pintado. */
  for (const cell of cells) assert.equal(dateKey(cell.date), cell.key);

  pass("2 · la rejilla lleva la fecha completa real de cada celda, también las de otros meses");
}

/* =========================================================
   3 · CLAVES CIVILES
========================================================= */
{
  assert.equal(isDateKey("2026-09-17"), true);
  assert.equal(isDateKey("2027-02-29"), false, "un día inexistente no es una clave válida");
  assert.equal(isDateKey("17/09/2026"), false);
  assert.equal(isDateKey(""), false);
  assert.equal(dateFromKey("2026-13-01"), null);

  assert.equal(isTimeKey("10:00"), true);
  assert.equal(isTimeKey("23:59"), true);
  assert.equal(isTimeKey("24:00"), false);
  assert.equal(isTimeKey("9:00"), false);
  assert.equal(isTimeKey(""), false);

  pass("3 · una fecha y una hora se validan como claves civiles, no como texto libre");
}

/* =========================================================
   4 · ETIQUETA LARGA EN CASTELLANO, INDEPENDIENTE DE LA ZONA
========================================================= */
{
  const expected = "Jueves, 17 de septiembre de 2026";
  assert.equal(longDateLabelFromKey("2026-09-17"), expected);
  assert.equal(longDateLabel(dateFromKey("2026-09-17")), expected);

  /* Los presets son los que declara este módulo, no una copia suelta. */
  assert.deepEqual(Object.keys(AGENDA_DATE_PRESETS), ["longWeekday", "monthYear", "month"]);
  assert.equal(AGENDA_DATE_PRESETS.longWeekday.weekday, "long");

  /* La misma fecha civil produce la misma etiqueta bajo cualquier zona del
     proceso: la fecha nunca pasa por un instante. */
  const previous = process.env.TZ;
  try {
    for (const zone of ["Europe/Madrid", "UTC", "Pacific/Kiritimati", "America/Los_Angeles"]) {
      process.env.TZ = zone;
      assert.equal(longDateLabelFromKey("2026-09-17"), expected, `bajo TZ=${zone}`);
      assert.equal(longDateLabelFromKey("2026-01-01"), "Jueves, 1 de enero de 2026", `bajo TZ=${zone}`);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }

  assert.equal(timeWithZoneLabel("10:00", "Europe/Madrid"), "10:00 (Europe/Madrid)");
  assert.equal(timeWithZoneLabel("", "Europe/Madrid"), "", "sin hora no se inventa texto");

  pass("4 · la fecha larga en castellano es la misma en cualquier zona del navegador");
}

/* =========================================================
   5 · NORMALIZACIÓN Y ORDEN
========================================================= */
{
  const admin = normalizeCita({
    id: "CITA-1",
    fechaLocal: "2026-09-17",
    horaLocal: "10:00",
    zona: "Europe/Madrid",
    lugar: "Oficina",
    nota: "Trae el portátil",
    estado: "programada",
    version: 2,
    userId: "usr-ana",
    destinatarioNombre: "Ana Pérez",
    etag: '"e2"',
    notificacion: { tipo: "creada", estado: "aceptada", etiqueta: "Aceptada por el proveedor de correo", intentos: 1 },
  });

  assert.equal(admin.userId, "usr-ana");
  assert.equal(admin.notificacion.estado, "aceptada");
  assert.equal(admin.etag, '"e2"');

  /* Lo que el backend NO envía al usuario no se inventa en el cliente. */
  const user = normalizeCita({
    id: "CITA-1",
    fechaLocal: "2026-09-17",
    horaLocal: "10:00",
    lugar: "Oficina",
    estado: "programada",
    version: 2,
  });
  assert.equal(user.userId, "");
  assert.equal(user.notificacion, null, "sin estado de notificación para el usuario");
  assert.equal(user.etag, "");
  assert.equal(user.zona, AGENDA_TIME_ZONE, "la zona por defecto es la canónica");

  const ordered = sortCitas([
    { id: "b", fechaLocal: "2026-09-17", horaLocal: "10:00" },
    { id: "a", fechaLocal: "2026-09-17", horaLocal: "10:00" },
    { id: "c", fechaLocal: "2026-09-16", horaLocal: "23:00" },
    { id: "d", fechaLocal: "2026-09-17", horaLocal: "08:30" },
  ]);
  assert.deepEqual(ordered.map((cita) => cita.id), ["c", "d", "a", "b"], "día, hora y después id");

  assert.equal(getAgendaApiSnapshot().endpoints.citas, CITAS_ENDPOINT);

  pass("5 · la proyección por rol no se rellena en el cliente y el orden es estable");
}

/* =========================================================
   6 · MENSAJES DE ERROR
========================================================= */
{
  assert.ok(AGENDA_ERROR_RULES.length >= 8, "hay reglas declaradas para los códigos del backend");

  const conflict = Object.assign(new Error("boom"), {
    status: 409,
    data: { code: "CITA_VERSION_CONFLICTO", message: "La cita ha cambiado." },
  });
  assert.match(agendaErrorMessage(conflict), /Recarga la agenda/u);

  const forbidden = Object.assign(new Error("boom"), {
    status: 403,
    data: { code: "CITA_PERMISO_ADMIN_REQUERIDO" },
  });
  assert.equal(agendaErrorMessage(forbidden), "No tienes permiso para gestionar citas.");

  const missingStorage = Object.assign(new Error("boom"), {
    status: 503,
    data: { code: "CITAS_ALMACENAMIENTO_NO_DISPONIBLE" },
  });
  assert.match(agendaErrorMessage(missingStorage), /todavía no está disponible/u);

  /* Un error del dominio conserva su explicación; un 5xx no expone nada. */
  const domain = Object.assign(new Error("x"), {
    status: 400,
    data: { code: "CITA_HORA_INEXISTENTE", message: "Las 02:30 no existen el 2026-03-29." },
  });
  assert.match(agendaErrorMessage(domain), /no existen/u);

  const server = Object.assign(new Error("stack interno con detalles"), { status: 500, data: {} });
  assert.equal(agendaErrorMessage(server), "El servidor no ha podido completar la operación.");

  const offline = Object.assign(new Error("Failed to fetch"), { status: 0 });
  assert.match(agendaErrorMessage(offline), /No hay conexión/u);

  pass("6 · los mensajes salen de la autoridad de presentación y un 5xx no filtra detalle");
}

/* =========================================================
   7 · ALTA: DATOS OBLIGATORIOS Y DÍA COMO DATO
========================================================= */
{
  const empty = buildCreateVm({ form: { fechaLocal: "2026-09-17" } });
  assert.equal(createFormIsComplete(empty), false);
  assert.equal(empty.fechaLarga, "Jueves, 17 de septiembre de 2026", "la cabecera usa la autoridad de formato");

  assert.equal(
    createFormIsComplete(buildCreateVm({ form: { fechaLocal: "2026-09-17", horaLocal: "10:00", lugar: "Oficina" } })),
    false,
    "sin usuario no está completo"
  );
  assert.equal(
    createFormIsComplete(buildCreateVm({ form: { userId: "usr-ana", fechaLocal: "2026-09-17", lugar: "Oficina" } })),
    false,
    "sin hora no está completo"
  );
  assert.equal(
    createFormIsComplete(buildCreateVm({ form: { userId: "usr-ana", fechaLocal: "2026-09-17", horaLocal: "10:00" } })),
    false,
    "sin lugar no está completo"
  );
  assert.equal(
    createFormIsComplete(buildCreateVm({
      form: { userId: "usr-ana", fechaLocal: "2026-09-17", horaLocal: "10:00", lugar: "Oficina" },
    })),
    true,
    "los cuatro datos obligatorios habilitan la acción"
  );

  /* La nota es opcional y no cuenta para habilitar. */
  const withNote = buildCreateVm({
    form: { userId: "usr-ana", fechaLocal: "2026-09-17", horaLocal: "10:00", lugar: "Oficina", nota: "Trae el portátil" },
  });
  assert.equal(withNote.form.nota, "Trae el portátil");

  pass("7 · la acción principal sólo se habilita con usuario, fecha, hora y lugar");
}

/* =========================================================
   8 · DETALLE: ESTADO Y PERMISOS
========================================================= */
{
  assert.equal(citaStateLabel("programada"), "Programada");
  assert.equal(citaStateLabel("cancelada"), "Cancelada");
  assert.equal(citaStateLabel("inventado"), "Estado desconocido", "no se inventa un estado");

  /* El estado usa la autoridad visual de estados, no colores propios. */
  const badge = renderCitaStateBadge("programada");
  assert.match(badge, /class="agenda-status-chip agenda-status-chip--programada"/u);
  assert.equal(/style=/u.test(badge), false, "sin estilos en línea");

  const cita = { id: "CITA-1", fechaLocal: "2026-09-17", horaLocal: "10:00", lugar: "Oficina", estado: "programada" };
  assert.equal(buildDetailVm({ cita, admin: true }).admin, true);
  assert.equal(buildDetailVm({ cita }).admin, false, "sin rol declarado no hay permisos de gestión");
  assert.equal(buildDetailVm({ cita }).cita.zona, AGENDA_TIME_ZONE);

  pass("8 · el estado se pinta con la autoridad de estados y el rol no se supone");
}

console.log(`\nAgenda citas contract: PASS · ${checks.length} bloques · fechas civiles, proyección por rol, errores y habilitación`);
