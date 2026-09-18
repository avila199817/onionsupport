/* =========================================================
   Onion Support · El mismo estado, el mismo tono, en todas las vistas
   Archivo: /tools/status-tone-contract.mjs

   QUÉ PROTEGE ESTO

   `css/components/status-system.css` declara en su cabecera el contrato visual
   del SPA, y una de sus líneas es literal:

       «Cancelado => neutral, nunca falso éxito.»

   La hoja cumplía su parte. El paso anterior --quién decide el tono-- no tenía
   autoridad, y cada vista lo resolvía por su cuenta. Medido antes de
   `src/core/status-tone.js`, el mismo estado de negocio se pintaba así:

     cancelada   Incidencias VERDE · Agenda ROJO · Facturas neutro · Home ROJO
                 y, dentro del MISMO modal de Facturas, el chip de pago sin
                 tono y el de estado en rojo
     archivada   Incidencias VERDE
     en curso    lista de Incidencias neutro · su propio detalle azul
     nueva       Incidencias y Clientes ámbar · Home AZUL
     inactivo    lista de Usuarios rojo · su propio detalle VERDE
     bloqueado   lista de Usuarios rojo · su propio detalle neutro

   Este contrato no comprueba que exista una función: RENDERIZA el chip de cada
   vista con el mismo estado y compara el tono que declara cada una.

   Además cierra las tres puertas por las que volvería la divergencia:
   que una vista deje de declarar el tono, que alguien vuelva a escribir una
   tabla privada de estado a tono, y que las reglas del atributo dejen de ser
   las últimas de la hoja.
========================================================= */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { STATUS_TONES, STATUS_TONE_ATTRIBUTE, statusTone } from "../src/core/status-tone.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const SHEET = "src/css/components/status-system.css";

let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

/* =========================================================
   1 · LA AUTORIDAD

   Cinco tonos, ni uno más: son exactamente las cinco familias de tokens que
   declara la hoja. Un sexto tono sería un color sin token.
========================================================= */

assert.deepEqual(
  [...STATUS_TONES].sort(),
  ["danger", "neutral", "open", "pending", "success"],
  "los tonos del sistema son cinco y sólo cinco"
);
checks += 1;

const sheet = read(SHEET);
for (const tone of STATUS_TONES) {
  ok(
    sheet.includes(`--ui-status-${tone}-fg:`),
    `el tono "${tone}" no tiene familia de tokens en ${SHEET}`
  );
}

/* La línea que este módulo existe para hacer cumplir. */
for (const state of ["cancelled", "canceled", "cancelada", "cancelado", "anulada", "void", "archived", "archivada"]) {
  ok(
    statusTone(state) === "neutral",
    `"${state}" cierra el asunto sin resolverlo: tiene que ser neutral, no ${statusTone(state)}`
  );
}

/* Un estado que nadie declara no se inventa un significado. */
ok(statusTone("") === "neutral", "un estado vacío no puede tener tono propio");
ok(statusTone("azafran_del_futuro") === "neutral", "un estado desconocido no puede tener tono propio");

/* =========================================================
   2 · CONVERGENCIA MEDIDA · SE RENDERIZA, NO SE SUPONE

   Cada entrada es una superficie real y la función pública con la que se
   pinta. Se busca el `data-status-tone` del chip de estado en el HTML que
   devuelve.
========================================================= */

const chipTone = (html, chipClass) => {\n  const tags = String(html || "").match(/<(?:span|button)\b[^>]*>/gu) || [];\n  const chip = tags.find((tag) => {\n    const className = /class="([^"]*)"/u.exec(tag)?.[1] || "";\n    return (\n      className.split(/\s+/u).includes(chipClass) &&\n      tag.includes(`${STATUS_TONE_ATTRIBUTE}="`)\n    );\n  });\n  assert.ok(chip, `no se encontró ningún chip "${chipClass}" con ${STATUS_TONE_ATTRIBUTE} en el HTML renderizado`);\n  const tone = /data-status-tone="([^"]*)"/u.exec(chip);\n  assert.ok(tone, `el chip no declara ${STATUS_TONE_ATTRIBUTE}: ${chip}`);\n  return tone[1];\n};

const incidencias = await import("../src/views/incidencias/incidencias.template.js");
const facturas = await import("../src/views/facturas/facturas.template.js");
const usuarios = await import("../src/views/usuarios/usuarios.template.js");
const clientes = await import("../src/views/clientes/clientes.template.js");
const agenda = await import("../src/views/agenda/agenda.template.detail.js");
const home = await import("../src/views/home/home.template.shared.js");

const SURFACES = Object.freeze({
  "Incidencias · listado": (state) => {
    const items = [{ id: "T-1", ticketId: "T-1", titulo: "x", status: state, priority: "medium" }];
    return chipTone(incidencias.renderTemplate({ items, incidencias: items }), "incidencias-status-chip");
  },
  "Facturas · listado": (state) => {
    const items = [{ id: "F-1", numero: "F-1", estadoPago: state, total: 10, cliente: { nombre: "X" } }];
    return chipTone(facturas.renderTable({ items, facturas: items }), "facturas-chip");
  },
  "Usuarios · listado": (state) => {
    const items = [{ id: "u1", name: "N", email: "a@b.c", status: state }];
    return chipTone(usuarios.renderTable({ items, usuarios: items }), "usuarios-chip");
  },
  "Clientes · listado": (state) => {
    const items = [{ id: "c1", nombre: "N", email: "a@b.c", status: state }];
    return chipTone(clientes.renderClientesTemplate({ items, clientes: items }), "clientes-chip");
  },
  "Agenda · detalle": (state) => chipTone(agenda.renderCitaStateBadge(state), "agenda-status-chip"),
  "Home · resumen": (state) => chipTone(home.statusBadge(state), "home-status"),
});

/* Qué superficie emite realmente qué estado. Pedirle «programada» a Facturas
   no probaría nada: mide la convergencia donde de verdad se solapan. */
const CROSS_DOMAIN = Object.freeze([
  { state: "cancelada", tone: "neutral", surfaces: ["Incidencias · listado", "Facturas · listado", "Agenda · detalle", "Home · resumen"] },
  { state: "cancelled", tone: "neutral", surfaces: ["Incidencias · listado", "Facturas · listado", "Home · resumen"] },
  { state: "pending", tone: "pending", surfaces: ["Incidencias · listado", "Facturas · listado", "Usuarios · listado", "Clientes · listado", "Home · resumen"] },
  { state: "active", tone: "success", surfaces: ["Usuarios · listado", "Clientes · listado"] },
  { state: "inactive", tone: "danger", surfaces: ["Usuarios · listado", "Clientes · listado"] },
  { state: "blocked", tone: "danger", surfaces: ["Usuarios · listado", "Clientes · listado"] },
  { state: "new", tone: "pending", surfaces: ["Incidencias · listado", "Clientes · listado", "Home · resumen"] },
  { state: "paid", tone: "success", surfaces: ["Facturas · listado", "Home · resumen"] },
  { state: "overdue", tone: "danger", surfaces: ["Facturas · listado", "Home · resumen"] },
  { state: "resolved", tone: "success", surfaces: ["Incidencias · listado", "Home · resumen"] },
  { state: "in_progress", tone: "open", surfaces: ["Incidencias · listado", "Home · resumen"] },
]);

const measured = [];
for (const { state, tone, surfaces } of CROSS_DOMAIN) {
  const seen = new Map();
  for (const surface of surfaces) {
    const rendered = SURFACES[surface](state);
    seen.set(surface, rendered);
  }

  const distinct = new Set(seen.values());
  assert.equal(
    distinct.size,
    1,
    `"${state}" se pinta de ${distinct.size} formas distintas: ` +
      [...seen].map(([surface, value]) => `${surface}=${value}`).join(" · ")
  );
  assert.equal(
    [...distinct][0],
    tone,
    `"${state}" debería declarar "${tone}" y declara "${[...distinct][0]}"`
  );
  assert.equal(statusTone(state), tone, `la autoridad y las vistas no coinciden en "${state}"`);
  checks += 3;
  measured.push(`${state.padEnd(12)} ${tone.padEnd(8)} en ${surfaces.length} superficies`);
}

/* =========================================================
   3 · NADIE VUELVE A DECIDIR EL TONO POR SU CUENTA

   Toda superficie que emite un chip de estado tiene que pedirle el tono a la
   autoridad. Se comprueba en el fichero: importa `statusTone` y su chip lleva
   el atributo.
========================================================= */

const EMITTERS = Object.freeze([
  "src/views/incidencias/incidencias.template.js",
  "src/views/incidencias/incidencias.template.modal.impl.js",
  "src/views/facturas/facturas.template.js",
  "src/views/facturas/facturas.template.modal.base.js",
  "src/views/usuarios/usuarios.template.js",
  "src/views/usuarios/usuarios.template.modal.js",
  "src/views/clientes/clientes.template.js",
  "src/views/clientes/clientes.template.modal.js",
  "src/views/agenda/agenda.template.detail.js",
  "src/views/agenda/index.js",
  "src/views/home/home.template.shared.js",
]);

for (const path of EMITTERS) {
  const source = read(path);
  ok(
    /import \{ statusTone \} from "[^"]*core\/status-tone\.js";/.test(source),
    `${path} pinta estados y no importa la autoridad`
  );
  ok(
    source.includes(STATUS_TONE_ATTRIBUTE),
    `${path} pinta estados y no declara ${STATUS_TONE_ATTRIBUTE}`
  );
}

/* Las dos tablas privadas que llegaron a contradecirse dentro del mismo
   fichero, y la de Home. Si alguna vuelve, este contrato cae. */
for (const [path, name] of [
  ["src/views/facturas/facturas.template.modal.base.js", "getEstadoPagoTone"],
  ["src/views/facturas/facturas.template.modal.base.js", "getEstadoTone"],
  ["src/views/home/home.template.foundation.js", "statusKey"],
]) {
  ok(
    !new RegExp(`function ${name}\\s*\\(`).test(read(path)),
    `${path} ha vuelto a declarar su propia lectura del estado: ${name}()`
  );
}

/* =========================================================
   4 · LA HOJA · EL ATRIBUTO TIENE LA ÚLTIMA PALABRA

   Las reglas del atributo y las de clase tienen especificidad cero --todas
   viven en `:where()`--, así que entre iguales decide el ORDEN. Si alguien
   mueve el bloque del atributo hacia arriba, el nombre de la clase volvería a
   ganar y la divergencia regresaría en silencio.
========================================================= */

const firstAttributeRule = sheet.indexOf(`:where([${STATUS_TONE_ATTRIBUTE}=`);
ok(firstAttributeRule > 0, `${SHEET} no declara el bloque de ${STATUS_TONE_ATTRIBUTE}`);

for (const tone of STATUS_TONES) {
  const rule = `:where([${STATUS_TONE_ATTRIBUTE}="${tone}"])`;
  ok(sheet.includes(rule), `${SHEET} no declara ${rule}`);
  ok(
    sheet.indexOf(rule) >= firstAttributeRule,
    `${rule} quedó fuera del bloque del atributo`
  );
}

for (const family of ["open", "pending", "success", "danger"]) {
  const classBlock = sheet.indexOf(`--ui-status-fg: var(--ui-status-${family}-fg);`);
  ok(
    classBlock < firstAttributeRule,
    `el bloque de clase "${family}" quedó DESPUÉS del atributo: el nombre de la clase volvería a ganar`
  );
}

/* La cabecera de la hoja promete que cancelar no es rojo. Agenda lo
   incumplía. */
const dangerBlock = sheet.slice(
  sheet.indexOf("DANGER / BLOCKED"),
  sheet.indexOf("CANCELADO / ARCHIVADO")
);
ok(dangerBlock.length > 0, `${SHEET} perdió la frontera entre el bloque rojo y el neutro`);
ok(
  !dangerBlock.includes("cancel"),
  `${SHEET} vuelve a pintar de rojo algo cancelado: cerrar sin resolver no es un fallo`
);

/* El hueco por el que una incidencia EN CURSO salía neutra en la lista. */
ok(
  sheet.includes(".incidencias-status-chip--progress"),
  `${SHEET} no recoge "--progress", el nombre que emite la lista de Incidencias`
);

/* =========================================================
   5 · EL FILTRADO NO SE TOCA

   `statusKey()` pliega «cancelada» sobre «cerrada» a propósito: `isClosed()`
   filtra con él. El tono dejó de usarlo; el ciclo de vida sigue igual.
========================================================= */

/* Se mide RENDERIZANDO, no leyendo el fichero: el pliegue se ve en la clase
   que sale --`--closed` para una incidencia cancelada-- y eso es lo que usa
   `isClosed()`. Comprobarlo sobre el texto fuente ataría el contrato a cómo
   está escrita una línea, que no es lo que hay que proteger. */
const LIFECYCLE = Object.freeze([
  ["cancelada", "closed", "neutral"],
  ["archivada", "closed", "neutral"],
  ["resuelta", "resolved", "success"],
  ["cerrada", "closed", "success"],
  ["abierta", "open", "open"],
]);

for (const [state, lifecycleKey, tone] of LIFECYCLE) {
  const row = [{ id: "T-1", ticketId: "T-1", titulo: "x", status: state, priority: "medium" }];
  const html = incidencias.renderTemplate({ items: row, incidencias: row });

  /* La clave de ciclo de vida sigue saliendo en la clase: el filtrado depende
     de ella y este trabajo no la tocó. */
  ok(
    html.includes(`incidencias-status-chip--${lifecycleKey} is-${lifecycleKey}`),
    `"${state}" ya no pliega sobre "${lifecycleKey}": cambiaría el filtrado de Incidencias`
  );

  /* Y el tono ya no sale de esa clave. «Cancelada» y «cerrada» comparten
     clave y NO comparten tono: ésa es toda la separación. */
  ok(
    new RegExp(`${STATUS_TONE_ATTRIBUTE}="${tone}"`).test(html),
    `"${state}" debería declarar el tono "${tone}"`
  );
}

console.log(
  `Status tone contract: PASS · ${checks} comprobaciones · ` +
    `${CROSS_DOMAIN.length} estados medidos en ${Object.keys(SURFACES).length} superficies reales`
);
for (const line of measured) console.log(`  ${line}`);
