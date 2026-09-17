import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  AGENDA_DAY_PRESETS,
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
  renderAgendaDetailModal,
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
  assert.deepEqual(Object.keys(AGENDA_DAY_PRESETS), ["longWeekday", "monthYear", "month"]);
  assert.equal(AGENDA_DAY_PRESETS.longWeekday.weekday, "long");

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

/* =========================================================
   9 · EL REINTENTO DEL DETALLE EXISTE DE VERDAD

   `renderModalState` compone el botón a partir de {label, attributes}: una
   cadena HTML se descarta en silencio. Pasó: el botón no se pintaba nunca y el
   manejador del reintento era inalcanzable, sin que nada fallara.
========================================================= */
{
  const salida = renderAgendaDetailModal({ open: true, error: "Sin red", admin: true });
  assert.match(salida, /data-detail-action="detail-retry"/u,
    "el estado de error tiene que ofrecer su reintento");
  assert.match(salida, /Reintentar/u);

  pass("9 · el error del detalle pinta su reintento, no una cadena descartada");
}

/* =========================================================
   10 · REPROGRAMAR AL PASADO TIENE SALIDA

   El backend responde 409 CITA_EN_PASADO y exige `confirmarPasado`. Si la
   edición no puede darlo, ese cambio es un callejón sin salida permanente.
========================================================= */
{
  const cita = { id: "CITA-1", fechaLocal: "2026-09-17", horaLocal: "10:00", lugar: "Oficina", estado: "programada" };

  const sinConfirmar = buildDetailVm({ cita, admin: true, editing: true });
  assert.equal(sinConfirmar.form.confirmarPasado, false, "por defecto no se confirma nada");
  assert.equal(sinConfirmar.pastWarning, "", "sin aviso no hay aviso");

  const conAviso = renderAgendaDetailModal({
    open: true, admin: true, editing: true, cita,
    form: { ...cita, nota: "", motivo: "", confirmarPasado: true },
    pastWarning: "Ese momento ya ha pasado.",
  });
  assert.match(conAviso, /name="confirmarPasado" value="true"/u,
    "la confirmación tiene que viajar con la edición");
  assert.match(conAviso, /Ese momento ya ha pasado\./u, "y decirse, no esconderse");

  pass("10 · la edición puede confirmar un instante pasado y lo avisa antes");
}

/* =========================================================
   11 · /agenda SE VISTE CON LAS HOJAS QUE /agenda CARGA

   La ruta declara UNA hoja propia; el resto que puede usar son las comunes.
   Una clase que sólo exista en `views/incidencias` es inerte aquí --el router
   aparca esa hoja-- y el bloque sale sin estilo. Pasó con las once clases del
   selector de usuario.
========================================================= */
{
  const raiz = resolve(fileURLToPath(new URL("../", import.meta.url)));
  const leer = (ruta) => readFileSync(join(raiz, ruta), "utf8");
  const hojas = (dir, acc = []) => {
    for (const entrada of readdirSync(join(raiz, dir))) {
      const rel = `${dir}/${entrada}`;
      if (statSync(join(raiz, rel)).isDirectory()) hojas(rel, acc);
      else if (rel.endsWith(".css")) acc.push(rel);
    }
    return acc;
  };

  const CARGADAS = [
    ...hojas("src/css/views/agenda"),
    ...hojas("src/css/components"),
    ...hojas("src/css/compositions"),
    ...hojas("src/css/core"),
    ...hojas("src/css/layout"),
    ...hojas("src/css/tokens"),
    "src/css/app.css",
    "src/css/private.css",
  ];
  const cargado = CARGADAS.map(leer).join("\n");
  const incidencias = hojas("src/css/views/incidencias").map(leer).join("\n");

  const emitidas = new Set();
  for (const modulo of ["index.js", "agenda.template.create.js", "agenda.template.detail.js"]) {
    const texto = leer(`src/views/agenda/${modulo}`);
    for (const match of texto.matchAll(/class="([^"]*)"/gu)) {
      for (const clase of match[1].split(/\s+/)) {
        if (clase && !clase.includes("${")) emitidas.add(clase);
      }
    }
  }

  const definida = (clase, hoja) => new RegExp(`\\.${clase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\w-])`, "u").test(hoja);
  const huerfanas = [];
  const prestadas = [];
  for (const clase of [...emitidas].sort()) {
    if (!/^(?:inc-|agenda-|ui-)/u.test(clase)) continue;
    if (definida(clase, cargado)) continue;
    (definida(clase, incidencias) ? prestadas : huerfanas).push(clase);
  }

  assert.deepEqual(prestadas, [],
    `Agenda se viste con clases que sólo existen en la hoja de Incidencias, que /agenda no carga: ${prestadas.join(", ")}`);
  assert.deepEqual(huerfanas, [],
    `Agenda emite clases que ninguna hoja declara: ${huerfanas.join(", ")}`);

  pass(`11 · las ${emitidas.size} clases de Agenda se declaran en hojas que la ruta carga`);
}

/* =========================================================
   12 · LA PRESENTACION DEL AVATAR Y EL TONO DE LAS ALERTAS

   Dos cosas que el bloque 11 no puede ver:

   a) las iniciales. Agenda derivaba las suyas con `slice(0,1)`: una autoridad
      paralela, de una sola letra y sin tono. Las decide
      `resolveAvatarPresentation`, como las otras superficies.

   b) los modificadores `is-*`. El bloque 11 sólo mira clases con prefijo
      `inc-`, `agenda-` o `ui-`, asi que un `is-warning` inexistente pasaba
      de largo y el aviso salia en azul informativo.
========================================================= */
{
  const raiz = resolve(fileURLToPath(new URL("../", import.meta.url)));
  const leer = (ruta) => readFileSync(join(raiz, ruta), "utf8");
  const alta = leer("src/views/agenda/agenda.template.create.js");
  const detalle = leer("src/views/agenda/agenda.template.detail.js");

  assert.match(alta, /resolveAvatarPresentation/u,
    "el alta de Agenda resuelve el avatar con la autoridad compartida");
  assert.doesNotMatch(alta, /\.slice\(\s*0\s*,\s*1\s*\)[\s\S]{0,40}toLocaleUpperCase/u,
    "ninguna vista de Agenda deriva iniciales por su cuenta");
  for (const atributo of ["data-avatar-system", "data-avatar-tone", "data-avatar-identity",
                          "data-avatar-initials", "data-has-avatar", "data-avatar-fallback"]) {
    assert.ok(alta.includes(atributo), `el avatar de Agenda emite ${atributo}`);
  }

  /* Toda alerta declara sus dos huecos: icono y copy. Con hijos sueltos el
     titulo caia en la columna de 34px reservada al icono. */
  for (const [nombre, texto] of [["alta", alta], ["detalle", detalle]]) {
    for (const bloqueAlerta of texto.matchAll(/<div class="inc-create-alert[^"]*"[^>]*>([\s\S]*?)<\/div>/gu)) {
      assert.match(bloqueAlerta[1], /agenda-alert-icon|inc-create-alert-icon/u,
        `la alerta del ${nombre} declara su hueco de icono`);
      assert.match(bloqueAlerta[1], /agenda-alert-copy|inc-create-alert-copy/u,
        `la alerta del ${nombre} declara su hueco de texto`);
    }
  }

  /* Y su tono tiene que existir en una hoja que la ruta cargue. */
  const hojasCargadas = [
    "src/css/views/agenda/index.css",
    "src/css/compositions/private-create-modal.css",
  ].map(leer).join("\n");
  assert.doesNotMatch(leer("src/css/views/agenda/index.css"), /\.inc-create-alert\.(?:is-|agenda-alert--)/u,
    "la hoja de Agenda no declara tonos para un componente compartido");
  /* Agenda ya no declara tonos propios: emite `is-<tipo>` y el tono lo pone
     la composicion compartida, dentro de su capa. Se comprueba que no vuelve
     a aparecer un mecanismo paralelo de tono para este componente. */
  assert.match(alta, /class="inc-create-alert is-\$\{attr\(kind\)\}"/u,
    "el alta emite el modificador compartido, no uno propio");
  const modificadores = new Set();
  for (const m of alta.matchAll(/renderAlert\(\s*"(\w+)"/gu)) modificadores.add(`is-${m[1]}`);
  for (const m of detalle.matchAll(/class="inc-create-alert ([^"$]*)"/gu)) {
    for (const clase of m[1].split(/\s+/)) if (clase) modificadores.add(clase);
  }
  assert.ok(modificadores.size >= 2, "se han encontrado los tonos que Agenda pinta");
  for (const clase of modificadores) {
    assert.match(clase, /^is-[a-z]+$/u,
      `el tono de una alerta compartida se nombra \`is-*\` y lo declara la composicion, no la vista (${clase})`);
  }
  const sinHoja = [...modificadores].filter(
    (clase) => !new RegExp(`\\.${clase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?![\\w-])`, "u").test(hojasCargadas));
  assert.deepEqual(sinHoja, [],
    `Agenda pinta una alerta con un modificador que ninguna hoja cargada declara: ${sinHoja.join(", ")}`);

  pass(`12 · el avatar usa la autoridad compartida y los ${modificadores.size} tonos de alerta existen`);
}

/* =========================================================
   13 · «ELIMINAR CITA» ES LA CANCELACIÓN CONTRACTUAL, Y LA LEYENDA SE FUE

   Tres cosas que sólo se ven leyendo el origen:

   a) no se ha inventado un DELETE. El backend no lo expone, y el botón que
      producto llama «Eliminar cita» tiene que acabar en `POST /:id/cancelar`;
   b) el frontend no habla con Cosmos: habla con la API;
   c) la leyenda «Aquí ves tus citas» --texto, punto verde y caja-- ha
      desaparecido del origen, no está escondida con `display:none`, y no ha
      dejado selectores huérfanos en ninguna hoja.
========================================================= */
{
  const raiz = resolve(fileURLToPath(new URL("../", import.meta.url)));
  const leer = (ruta) => readFileSync(join(raiz, ruta), "utf8");

  const ficherosAgenda = [
    "src/views/agenda/index.js",
    "src/views/agenda/agenda.api.js",
    "src/views/agenda/agenda.template.detail.js",
    "src/views/agenda/agenda.template.create.js",
  ];
  const fuenteAgenda = ficherosAgenda.map(leer).join("\n");

  /* a) Ningún DELETE de citas, ni por método ni por ayudante. */
  assert.doesNotMatch(fuenteAgenda, /method:\s*["']DELETE["']/iu,
    "Agenda no emite ningún DELETE");
  assert.doesNotMatch(fuenteAgenda, /\bHttp\s*\.\s*del(ete)?\s*\(/u,
    "Agenda no usa el ayudante de borrado del cliente HTTP");
  assert.match(leer("src/views/agenda/agenda.api.js"), /\/cancelar/u,
    "la eliminación pasa por la ruta de cancelación del backend");

  /* Y el botón destructivo desemboca ahí, no en otra cosa. */
  const detalle = leer("src/views/agenda/agenda.template.detail.js");
  assert.match(detalle, /DELETE_CITA:\s*"detail-eliminar"/u,
    "la acción destructiva del detalle está declarada");
  assert.match(detalle, /Eliminar cita/u, "y se presenta con el nombre de producto");
  const controlador = leer("src/views/agenda/index.js");
  assert.match(controlador, /no se eliminará físicamente/iu,
    "la confirmación dice que el documento se conserva");
  assert.match(controlador, /openModalConfirmation\(/u,
    "y la pide a la autoridad compartida, no a una caja propia");
  assert.match(controlador,
    /AGENDA_DETAIL_ACTIONS\.DELETE_CITA\) return void requestDeleteCita\(\)/u,
    "el manejador enruta la acción destructiva a la cancelación contractual");

  /* b) Nada de Cosmos desde el navegador. */
  for (const patron of [/@azure\/cosmos/u, /documents\.azure\.com/u, /CosmosClient/u]) {
    assert.doesNotMatch(fuenteAgenda, patron, `Agenda no habla con Cosmos: ${patron}`);
  }

  /* c) La leyenda ya no existe en ningún origen, ni oculta. */
  const hojas = [
    "src/css/views/agenda/index.css",
    "src/css/compositions/private-create-modal.css",
  ].map(leer).join("\n");
  const todo = `${fuenteAgenda}\n${hojas}`;

  for (const rastro of [/ves tus citas/iu, /puedes crear citas/iu,
                        /agenda-side-note/u, /agenda-detail-confirm/u]) {
    assert.doesNotMatch(todo, rastro, `queda un rastro de la leyenda retirada: ${rastro}`);
  }

  pass("13 · «Eliminar cita» cancela por contrato, sin DELETE ni Cosmos, y la leyenda no deja rastro");
}

console.log(`\nAgenda citas contract: PASS · ${checks.length} bloques · fechas civiles, proyección por rol, errores y habilitación`);
