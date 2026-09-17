#!/usr/bin/env node
/* =========================================================
   Onion Support · La puerta de la PR y la del despliegue

   UNA SOLA LISTA. La revisión tiene que ejecutar los MISMOS contratos de fuente
   que el despliegue exige después, y tiene que hacerlo invocando el comando
   canónico, no una copia de su contenido.

   POR QUÉ EXISTE. `validate:source` vivía dentro de `validate:ci`, que sólo se
   dispara en el `push` a main. Una PR podía quedar verde y romper la
   publicación al fusionarse. Pasó de verdad: una capa copió la clase del panel
   del shell, `modal-shell-contract` lo rechazaba, y la puerta de la PR no lo
   ejecutaba.

   QUÉ SE COMPRUEBA AQUÍ, y por qué cada cosa:
     1. el job existe, se dispara en las PR a main y ejecuta el comando entero;
     2. no reaparece una segunda lista escrita a mano --si alguien vuelve a
        enumerar contratos ahí, las dos versiones divergirán en silencio--;
     3. el job es del candidato pero NO es privilegiado: sin secretos, sin
        credenciales persistidas, sin escritura, sin construir ni publicar;
     4. la verificación posterior al merge sigue en pie: adelantar detección no
        es retirar protecciones.
========================================================= */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

const paquete = JSON.parse(leer("package.json"));
const FUENTE = paquete.scripts["validate:source"];
const DESPLIEGUE = paquete.scripts["validate:ci"];
assert.ok(FUENTE, "package.json declara validate:source");
assert.match(DESPLIEGUE, /\bnpm run validate\b/u, "validate:ci sigue componiendo validate");
assert.match(paquete.scripts.validate, /\bnpm run validate:source\b/u, "validate compone validate:source");

/* Las rutas que `validate:source` ejecuta, extraídas del propio comando. */
const RUTA = /((?:\.github\/(?:scripts|ci)|tools)\/[\w.\-]+)/u;
const contratos = FUENTE.split("&&")
  .map((paso) => paso.match(RUTA)?.[1])
  .filter(Boolean);
assert.ok(contratos.length >= 30, `validate:source declara ${contratos.length} contratos`);

const JOB = ".github/workflows/repo-integrity.yml";
const flujo = leer(JOB);

/* 1 · Se dispara en las PR a main y ejecuta el comando, no una copia. */
assert.match(flujo, /^on:\n(?:.*\n)*?\s{2}pull_request:\n\s{4}branches:\n\s{6}- main$/mu,
  `${JOB} debe dispararse en las pull requests contra main`);
const invocaciones = flujo.match(/npm run validate:source/gu) || [];
assert.equal(invocaciones.length, 1,
  `${JOB} invoca el comando canónico exactamente una vez (${invocaciones.length})`);

/* 2 · Ninguna segunda lista a mano: ni una sola entrada re-enumerada. */
const reenumerados = contratos.filter((ruta) => flujo.includes(ruta));
assert.deepEqual(reenumerados, [],
  `${JOB} vuelve a enumerar contratos que validate:source ya declara, y las dos ` +
  `listas divergirán: ${reenumerados.join(", ")}`);

/* 3 · Candidato sí, privilegios no. */
assert.match(flujo, /^permissions:\n\s{2}contents:\s*read\n/mu, `${JOB} sólo pide contents: read`);
assert.match(flujo, /persist-credentials:\s*false/u, `${JOB} no persiste credenciales`);
for (const prohibido of [
  [/\bsecrets\./u, "usa secretos"],
  [/pull_request_target/u, "se dispara en el contexto privilegiado"],
  [/npm run build\b/u, "construye el candidato"],
  [/npm run deploy|static-web-apps-deploy|azure\/login/iu, "publica o despliega"],
  [/permissions:\s*\n(?:\s+\w+:\s*(?:write|admin)\s*\n)/u, "pide permisos de escritura"],
]) {
  const [patron, motivo] = prohibido;
  assert.doesNotMatch(flujo, patron, `${JOB} ${motivo}: el job de la PR debe quedarse en lectura`);
}

/* El comando corre sobre un árbol sin dependencias: ningún `npm ci` que lo
   convierta en otra cosa, y ningún paso que ejecute el candidato con permisos. */
assert.doesNotMatch(flujo, /npm (?:ci|install)/u, `${JOB} no instala dependencias: los contratos son de fuente`);

/* 4 · La verificación posterior al merge NO se retira. */
const publicacion = leer(".github/workflows/azure-static-web-apps-polite-bay-086469a1e.yml");
assert.match(publicacion, /npm run validate:ci/u, "el despliegue conserva su validación completa");
assert.match(publicacion, /^on:\n\s{2}push:\n\s{4}branches:\n\s{6}- main$/mu,
  "el despliegue sigue disparándose en el push a main");
const posterior = leer(".github/workflows/production-verification.yml");
assert.match(posterior, /npm run check:dist/u, "la verificación de producción se conserva");

console.log(
  `Pre-merge coverage contract: PASS · ${contratos.length} contratos de validate:source ` +
  `ejecutados antes del merge por el comando canónico · 0 listas duplicadas · ` +
  `job sin secretos, sin credenciales, sin construir y sin publicar · verificación posterior intacta`
);
