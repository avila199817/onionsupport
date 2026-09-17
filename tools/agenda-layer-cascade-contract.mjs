import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

/*
  AGENDA · LA CASCADA NO DEPENDE DE UN ACCIDENTE

  El CSS sin capa gana a TODAS las capas declaradas. La hoja de Agenda cerró
  `@layer views` antes de tiempo y dejó 226 líneas fuera, así que su aviso
  funcionaba por esa circunstancia y no por una autoridad: al devolver esas
  reglas a su capa, el aviso habría perdido contra la composición base.
  Usuarios, que ya emitía `is-warning`, lo tenía neutralizado por lo mismo,
  porque `compositions` va DESPUÉS de `views` en el orden declarado.

  Este contrato fija las dos mitades: que la hoja no vuelva a dejar reglas
  fuera de capa, y que el tono salga de la composición compartida. Lo segundo
  con estilos computados en Chromium, no con búsqueda de texto.
*/

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const leer = (ruta) => readFileSync(join(ROOT, ruta), "utf8");

/* Orden canónico, tal y como lo declara `src/css/app.css`. */
const ORDEN = leer("src/css/app.css").match(/@layer\s+[^;]+;/u)?.[0];
assert.ok(ORDEN && ORDEN.includes("views") && ORDEN.includes("compositions"),
  "se ha localizado el orden de capas canónico en src/css/app.css");
assert.ok(ORDEN.indexOf("views") < ORDEN.indexOf("compositions"),
  "compositions va después de views: por eso el tono del componente manda sobre el de la vista");

const HOJA_AGENDA = "src/css/views/agenda/index.css";
const COMPOSICION = "src/css/compositions/private-create-modal.css";
const resultados = [];
const ok = (linea) => { resultados.push(linea); console.log(`OK   ${linea}`); };

/* =========================================================
   A · NINGUNA REGLA DE LA HOJA DE AGENDA FUERA DE `@layer views`

   Se calcula el límite por balance de llaves, NUNCA por número de línea:
   una guarda con la línea escrita a mano caduca en el primer añadido.
========================================================= */
function restoFueraDeCapa(ruta) {
  const lineas = leer(ruta).split("\n");
  let profundidad = 0;
  let apertura = null;
  let cierre = null;
  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i];
    if (apertura === null && /^\s*@layer\s+[\w-]+\s*\{/u.test(linea)) apertura = i;
    if (apertura === null) continue;
    profundidad += (linea.match(/\{/gu) || []).length - (linea.match(/\}/gu) || []).length;
    if (i > apertura && profundidad === 0) { cierre = i; break; }
  }
  assert.ok(apertura !== null, `${ruta}: declara su bloque @layer`);
  assert.ok(cierre !== null, `${ruta}: su bloque @layer está balanceado`);
  /* Fuera del bloque sólo pueden quedar comentarios y espacios. */
  return lineas
    .slice(cierre + 1)
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .trim();
}

/* El router enlaza las hojas de ruta PLANAS y exige el contrato
   `self-layered-v1`: cada una declara su propia capa. Por eso una cola fuera
   del bloque escapa de verdad, y por eso se barren todas, no sólo la que
   falló. `public/home-critical.css` queda excluida a propósito: es CSS
   crítico del sitio público, deliberadamente sin capa. */
const EXCEPCIONES = new Set(["src/css/views/public/home-critical.css"]);
function hojasDeVista(dir = "src/css/views", acumulado = []) {
  for (const entrada of readdirSync(join(ROOT, dir)).sort()) {
    const rel = `${dir}/${entrada}`;
    if (statSync(join(ROOT, rel)).isDirectory()) hojasDeVista(rel, acumulado);
    else if (rel.endsWith(".css") && !EXCEPCIONES.has(rel)) acumulado.push(rel);
  }
  return acumulado;
}

const barridas = hojasDeVista();
assert.ok(barridas.includes(HOJA_AGENDA), "el barrido incluye la hoja de Agenda");
for (const hoja of barridas) {
  assert.equal(restoFueraDeCapa(hoja), "",
    `${hoja}: hay reglas después del cierre de @layer. El CSS sin capa gana a TODAS las capas, así que esas reglas mandan por accidente y se caen en cuanto alguien sanee la hoja.`);
}
ok(`A · ninguna de las ${barridas.length} hojas de vista deja reglas fuera de su capa`);

/* La composición tiene que declarar las tres variantes del componente. */
const composicion = leer(COMPOSICION);
for (const variante of ["is-success", "is-error", "is-warning"]) {
  assert.match(composicion, new RegExp(`\\.inc-create-alert[^{]*\\)\\.${variante}\\s*\\{`, "u"),
    `la composición compartida declara .${variante} para el componente de alerta`);
}
ok("A · la composición declara las tres variantes: success, error y warning");

/* =========================================================
   B-E · EL TONO, MEDIDO EN CHROMIUM SOBRE LA CASCADA REAL
========================================================= */
const COMUNES = [
  "src/css/tokens/variables.css",
  "src/css/tokens/light.css",
  "src/css/components/ui.css",
  COMPOSICION,
];

const CASOS = [
  {
    nombre: "agenda",
    hojas: [...COMUNES, HOJA_AGENDA],
    marcas: {
      info: "inc-create-alert",
      warning: "inc-create-alert is-warning",
      error: "inc-create-alert is-error",
      success: "inc-create-alert is-success",
    },
  },
  {
    nombre: "usuarios",
    hojas: [...COMUNES, "src/css/views/usuarios/create.css"],
    marcas: {
      info: "usr-create-alert inc-create-alert",
      warning: "usr-create-alert inc-create-alert is-warning",
      error: "usr-create-alert inc-create-alert is-error",
    },
  },
];

const paginas = new Map();
for (const caso of CASOS) {
  const links = caso.hojas.map((hoja) => `<link rel="stylesheet" href="/${hoja}">`).join("\n");
  const nodos = Object.entries(caso.marcas)
    .map(([clave, clase]) => `<div id="${clave}" class="${clase}"></div>`)
    .join("\n");
  paginas.set(`/${caso.nombre}.html`,
    `<!doctype html><html><head><style>${ORDEN}</style>\n${links}</head><body>${nodos}</body></html>`);
}

const server = createServer(async (req, res) => {
  const ruta = (req.url || "/").split("?")[0];
  if (paginas.has(ruta)) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(paginas.get(ruta));
  }
  try {
    const cuerpo = await readFile(resolve(ROOT, ruta.replace(/^\//u, "")));
    res.writeHead(200, { "content-type": ruta.endsWith(".css") ? "text/css" : "text/plain" });
    return res.end(cuerpo);
  } catch {
    res.writeHead(404);
    return res.end("no");
  }
});
await new Promise((listo) => server.listen(0, "127.0.0.1", listo));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });

  for (const caso of CASOS) {
    const page = await browser.newPage();
    await page.goto(`${origin}/${caso.nombre}.html`, { waitUntil: "load" });

    const medido = await page.evaluate((claves) => {
      const tono = (id) => {
        const cs = getComputedStyle(document.getElementById(id));
        return { fondo: cs.backgroundColor, borde: cs.borderTopColor };
      };
      /* E · ninguna regla de estilo suelta fuera de capa en las hojas cargadas. */
      /* Sólo las hojas de VISTA: el resto recibe su capa en el `@import
         ... layer(...)` del entry, así que no declararla dentro es correcto
         para ellas. Las de ruta se enlazan planas y no tienen esa red. */
      const sueltas = [];
      for (const hoja of document.styleSheets) {
        if (!String(hoja.href || "").includes("/src/css/views/")) continue;
        let reglas;
        try { reglas = hoja.cssRules; } catch { continue; }
        for (const regla of reglas) {
          if (regla.constructor?.name === "CSSStyleRule") {
            sueltas.push(`${String(hoja.href).split("/").slice(-2).join("/")} :: ${regla.selectorText}`);
          }
        }
      }
      return { tonos: Object.fromEntries(claves.map((k) => [k, tono(k)])), sueltas };
    }, Object.keys(caso.marcas));

    const { tonos, sueltas } = medido;

    /* B/C · el aviso tiene tono propio, distinto del informativo. */
    assert.notEqual(tonos.warning.fondo, tonos.info.fondo,
      `${caso.nombre}: el aviso pinta con el mismo fondo que el informativo`);
    assert.notEqual(tonos.warning.borde, tonos.info.borde,
      `${caso.nombre}: el aviso pinta con el mismo borde que el informativo`);

    /* D · sin regresión en las otras dos. */
    assert.notEqual(tonos.error.fondo, tonos.info.fondo, `${caso.nombre}: el error conserva su tono`);
    assert.notEqual(tonos.error.fondo, tonos.warning.fondo, `${caso.nombre}: error y aviso no se confunden`);
    if (tonos.success) {
      assert.notEqual(tonos.success.fondo, tonos.info.fondo, `${caso.nombre}: el éxito conserva su tono`);
      assert.notEqual(tonos.success.fondo, tonos.warning.fondo, `${caso.nombre}: éxito y aviso no se confunden`);
    }

    /* E · y nada de esto depende de una regla sin capa. */
    assert.deepEqual(sueltas, [],
      `${caso.nombre}: hay reglas fuera de capa y ganarían a cualquier autoridad: ${sueltas.join(", ")}`);

    ok(`${caso.nombre === "agenda" ? "B" : "C"} · ${caso.nombre}: aviso ${tonos.warning.fondo} frente a informativo ${tonos.info.fondo}, sin reglas sin capa`);
    await page.close();
  }

  ok("D · success y error conservan su tono y no se confunden con el aviso");
  ok("E · ninguna hoja de vista aporta reglas fuera de capa: el tono no depende de un accidente");

  console.log(`\nAgenda layer cascade contract: PASS · ${resultados.length} comprobaciones · estilos computados en Chromium`);
} catch (error) {
  console.error("AGENDA LAYER CASCADE CONTRACT FAILED");
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}
