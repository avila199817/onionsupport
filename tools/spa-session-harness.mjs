/* =========================================================
   Onion Support · Arnés de sesión SPA
   Archivo: /tools/spa-session-harness.mjs

   UNA SOLA FORMA DE LEVANTAR LA APLICACIÓN REAL EN UN NAVEGADOR.

   Sirve el BUILD (`dist`), no el árbol de fuentes: el propio `index.html`
   arrastra su grafo de recursos, de modo que el orden y las capas de CSS son
   los que ve un usuario —incluida la hoja del sistema de avatares, que vive en
   la última capa y decide sobre views y components—. Aquí no hay una lista
   manual de hojas que pueda divergir de la aplicación.

   El navegador sólo puede hablar con este servidor: el origen de la API se
   responde con datos sintéticos y cualquier otro destino se aborta y queda
   anotado. Ninguna persona real, ningún identificador de producción, ninguna
   credencial: el token de sesión es literal y sintético.

   `browser-dist-contract.mjs` usa este mismo servidor y el mismo localizador de
   Chromium. Si mañana cambia la forma de servir el build, cambia en un sitio.
========================================================= */

import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const DIST = resolve(ROOT, process.env.ONION_BUILD_OUT_DIR || "dist");
export const API_ORIGIN = "https://api.onionsupport.com";

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
});

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  "/opt/pw-browsers/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome",
].filter(Boolean);

/* Un PNG de 1×1 transparente. Una fotografía sintética no retrata a nadie. */
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

export async function findBrowserExecutable() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Siguiente ubicación de confianza.
    }
  }
  return "";
}

export async function launchBrowser() {
  const executablePath = await findBrowserExecutable();
  if (!executablePath) {
    throw new Error("Chrome/Chromium no encontrado; define CHROME_BIN para ejecutar los contratos de navegador.");
  }
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
  browser.onionExecutablePath = executablePath;
  return browser;
}

/* Sirve el build tal cual se despliega. `spaFallback` reproduce la reescritura
   del alojamiento estático: una ruta de aplicación devuelve el index. */
export async function serveBuiltApp({ root = DIST, spaFallback = false } = {}) {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      let path = decodeURIComponent(url.pathname);
      if (path === "/") path = "/index.html";
      if (path === "/login") path = "/login.html";

      const canonical = posix.normalize(path).replace(/^\/+/, "");
      if (!canonical || canonical.startsWith("../") || canonical.includes("/../")) {
        response.writeHead(400).end("Bad path");
        return;
      }

      const target = resolve(base, canonical);
      if (!target.startsWith(base)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const targetStat = await stat(target);
      if (!targetStat.isFile()) throw new Error("Not a regular file");
      const contents = await readFile(target);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": CONTENT_TYPES[extname(target)] || "application/octet-stream",
      });
      response.end(contents);
    } catch {
      if (spaFallback && !posix.extname(new URL(request.url || "/", "http://127.0.0.1").pathname)) {
        try {
          const index = await readFile(resolve(base, "index.html"));
          response.writeHead(200, { "Cache-Control": "no-store", "Content-Type": CONTENT_TYPES[".html"] });
          response.end(index);
          return;
        } catch {
          // Cae al 404 de abajo.
        }
      }
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });

  await new Promise((listening, failed) => {
    server.once("error", failed);
    server.listen(0, "127.0.0.1", listening);
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("El servidor estático no pudo abrir un puerto.");

  return {
    server,
    root: base,
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((closed, failed) => server.close((error) => (error ? failed(error) : closed()))),
  };
}

/* =========================================================
   MUNDO SINTÉTICO

   Personas, incidencias, facturas y fotografías inventadas. Ningún dato de una
   captura, de producción o de una persona real llega hasta aquí.
========================================================= */

export const FOTO_A = "/@sintetico/retrato-a.png";
export const FOTO_B = "/@sintetico/retrato-b.png";

export function syntheticWorld() {
  const conectado = {
    id: "u-admin-1", userId: "u-admin-1", name: "Admin Sintético", fullName: "Admin Sintético",
    email: "admin@example.test", role: "admin", status: "active",
  };
  const titular = {
    id: "u-cliente-1", userId: "u-cliente-1", name: "Ana Cliente Sintética", fullName: "Ana Cliente Sintética",
    email: "ana@example.test", role: "user", status: "active", avatarUrl: FOTO_A, hasAvatar: true,
  };
  const segundoTitular = {
    id: "u-cliente-2", userId: "u-cliente-2", name: "Carlos Segundo Sintético", fullName: "Carlos Segundo Sintético",
    email: "carlos@example.test", role: "user", status: "active", avatarUrl: "", hasAvatar: false,
  };
  const tecnico = {
    id: "u-tecnico-1", userId: "u-tecnico-1", name: "Beatriz Técnica Sintética", fullName: "Beatriz Técnica Sintética",
    email: "beatriz@example.test", role: "admin", status: "active", avatarUrl: "", hasAvatar: false,
  };

  const adjuntos = [
    { id: "adj-1", attachmentId: "adj-1", name: "captura-uno.png", filename: "captura-uno.png", contentType: "image/png", size: 1024, viewUrl: "/@sintetico/adjunto-1.png" },
    { id: "adj-2", attachmentId: "adj-2", name: "captura-dos.png", filename: "captura-dos.png", contentType: "image/png", size: 2048, viewUrl: "/@sintetico/adjunto-2.png" },
  ];

  const ticket = (numero, persona, extra = {}) => ({
    id: `INC-SINT-${numero}`, ticketId: `INC-SINT-${numero}`,
    subject: `Incidencia sintética ${numero}`,
    description: `Descripción sintética de la incidencia ${numero}. `.repeat(12),
    status: "open", priority: "medium", category: "technical",
    createdAt: "2026-09-08T09:00:00.000Z", updatedAt: "2026-09-08T09:30:00.000Z",
    userId: persona.userId, clientId: persona.userId, fullName: persona.name, name: persona.name,
    email: persona.email, avatarUrl: persona.avatarUrl, hasAvatar: Boolean(persona.avatarUrl),
    assignedToUserId: tecnico.userId, assignedToName: tecnico.name, assignedToEmail: tecnico.email,
    comments: [], history: [], attachments: [], canComment: true, canUpdate: true,
    ...extra,
  });

  const factura = (numero, extra = {}) => ({
    id: `F-SINT-${numero}`, facturaId: `F-SINT-${numero}`,
    numero: `2026000${numero}`, numeroFacturaLegal: `2026000${numero}`,
    baseImponible: 40, subtotal: 40, iva: 8.4, impuesto: 8.4, total: 48.4, importeTotal: 48.4, moneda: "EUR", currency: "EUR",
    estado: "emitida", estadoPago: "pendiente", pagado: 0, pendiente: 48.4,
    fechaEmision: "2026-09-08T09:00:00.000Z",
    clienteId: titular.userId, userId: titular.userId,
    clienteNombre: titular.name, clienteEmail: titular.email, clienteAvatar: titular.avatarUrl,
    cliente: { id: titular.userId, userId: titular.userId, nombre: titular.name, fullName: titular.name, email: titular.email, avatarUrl: titular.avatarUrl },
    conceptos: [{ descripcion: "Diagnóstico sintético", cantidad: 1, precioUnitario: 40, total: 40 }],
    ...extra,
  });

  return {
    conectado, titular, segundoTitular, tecnico, adjuntos,
    tickets: [
      ticket(1, titular, { attachments: adjuntos }),
      ticket(2, segundoTitular, { subject: "Incidencia sintética 2", category: "billing", status: "pending", priority: "low" }),
      ticket(3, titular, { subject: "Incidencia sintética 3", category: "network", status: "in_progress", priority: "urgent" }),
      /* Valores que la aplicación no declara: deben leerse, no aparecer en crudo. */
      ticket(4, segundoTitular, { subject: "Incidencia sintética 4", category: "chimney_sweeping", status: "awaiting_customer", priority: "trivial" }),
    ],
    facturas: [
      factura(1),
      factura(2, {
        estadoPago: "pagada", paymentStatus: "paid", pagado: 48.4, pendiente: 0,
        pdfUrl: "/@sintetico/documento.pdf", pdfDisponible: true,
        payment: { finalization: { schemaVersion: 2, status: "completed", heartbeatAt: "2026-09-08T09:10:00.000Z", document: { status: "ready" }, delivery: { status: "sent" } } },
      }),
    ],
  };
}

/* =========================================================
   SESIÓN DE NAVEGADOR
========================================================= */

const JSON_TYPE = "application/json; charset=utf-8";

/* Marca que sólo existe en la respuesta de detalle, nunca en la lista. */
export const DETAIL_HYDRATION_MARK = "Hidratado desde el detalle de";
const SESSION_TOKEN = "token-sintetico-de-prueba";

function findById(collection, id) {
  return collection.find((entry) => entry.id === id || entry.ticketId === id || entry.facturaId === id);
}

/* Abre una pestaña con el build servido, la API interceptada y todo lo demás
   cerrado. Devuelve los registros que permiten afirmar lo que NO ha pasado:
   peticiones fuera de origen, escrituras, cargas de documento y errores. */
export async function openSpaSession(browser, origin, options = {}) {
  const world = options.world || syntheticWorld();
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });

  const calls = [];
  const writes = [];
  const uncovered = [];
  const offOrigin = [];
  const pageErrors = [];
  const documents = [];
  const loads = [];

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.protocol.startsWith("chrome")) return route.continue();

    if (url.origin === origin) {
      if (url.pathname.startsWith("/@sintetico/")) {
        const fixture = options.fixtures?.[url.pathname];
        if (fixture === "error") return route.fulfill({ status: 500, body: "" });
        if (fixture?.delayMs) await new Promise((next) => setTimeout(next, fixture.delayMs));
        return route.fulfill({ status: 200, contentType: "image/png", headers: { "Cache-Control": "no-store" }, body: PNG_1X1 });
      }
      return route.continue();
    }

    if (url.origin !== API_ORIGIN) {
      offOrigin.push(url.href);
      return route.abort();
    }

    const path = url.pathname;
    calls.push({ method, path, query: url.search });
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) writes.push({ method, path });

    const respond = (body, status = 200) => route.fulfill({ status, contentType: JSON_TYPE, body: JSON.stringify(body) });

    if (await options.api?.({ route, method, path, url, world, respond }) === true) return undefined;
    if (method === "OPTIONS") return route.fulfill({ status: 204, body: "" });

    const session = {
      accessToken: SESSION_TOKEN, token: SESSION_TOKEN, access_token: SESSION_TOKEN,
      expiresIn: 3600, hasRefreshToken: true, user: world.conectado,
    };
    if (path === "/api/auth/me" || path === "/api/auth/refresh") {
      return respond({ ok: true, ...session, data: { ...session } });
    }

    if (method === "GET") {
      if (path === "/api/tickets") {
        return respond({ ok: true, items: world.tickets, total: world.tickets.length, data: world.tickets });
      }
      const attachment = path.match(/^\/api\/tickets\/([^/]+)\/(?:attachments|files|adjuntos)\/([^/]+)\/view$/u);
      if (attachment) {
        const file = world.adjuntos.find((entry) => entry.id === decodeURIComponent(attachment[2]));
        if (!file) return respond({ ok: false, error: { code: "ATTACHMENT_NOT_FOUND" } }, 404);
        return respond({ ok: true, ...file, data: { ...file } });
      }
      const ticket = path.match(/^\/api\/tickets\/([^/]+)$/u);
      if (ticket) {
        const found = findById(world.tickets, decodeURIComponent(ticket[1]));
        if (!found) return respond({ ok: false, error: { code: "TICKET_NOT_FOUND" } }, 404);
        /* Como un backend real, el detalle trae MÁS que la fila. Ese extra es lo
           único que demuestra que la hidratación de ESTA apertura ha terminado:
           sin él, una lectura abortada pasaría inadvertida porque el modal ya se
           pinta con los datos que la lista tenía. */
        const hidratado = { ...found, description: `${found.description} ${DETAIL_HYDRATION_MARK} ${found.id}.` };
        return respond({ ok: true, ticket: hidratado, data: hidratado, ...hidratado });
      }
      if (path === "/api/facturas/stats") {
        /* Las cifras salen de las mismas facturas sintéticas: una estadística que
           no cuadra con su lista es un contrato que miente. */
        const total = world.facturas.reduce((suma, entrada) => suma + entrada.total, 0);
        const cobrado = world.facturas.reduce((suma, entrada) => suma + entrada.pagado, 0);
        const stats = {
          total: world.facturas.length, count: world.facturas.length,
          importeTotal: total, totalFacturado: total,
          importeCobrado: cobrado, totalCobrado: cobrado,
          importePendiente: total - cobrado, totalPendiente: total - cobrado,
          pagadas: world.facturas.filter((entrada) => entrada.pendiente === 0).length,
          pendientes: world.facturas.filter((entrada) => entrada.pendiente > 0).length,
          moneda: "EUR", currency: "EUR",
        };
        return respond({ ok: true, stats, data: stats, ...stats });
      }
      if (path === "/api/facturas") {
        return respond({ ok: true, items: world.facturas, total: world.facturas.length, data: world.facturas });
      }
      const reviews = path.match(/^\/api\/facturas\/([^/]+)\/valoraciones$/u);
      if (reviews) return respond({ ok: true, summary: { status: "not_requested" }, services: [], data: { summary: { status: "not_requested" }, services: [] } });
      const factura = path.match(/^\/api\/facturas\/([^/]+)$/u);
      if (factura && decodeURIComponent(factura[1]) !== "stats") {
        const found = findById(world.facturas, decodeURIComponent(factura[1]));
        if (!found) return respond({ ok: false, error: { code: "FACTURA_NOT_FOUND" } }, 404);
        return respond({ ok: true, factura: found, data: found, ...found });
      }
      const persona = path.match(/^\/api\/users\/([^/]+)$/u);
      if (persona && decodeURIComponent(persona[1]) !== "avatar") {
        const id = decodeURIComponent(persona[1]);
        const encontrada = [world.titular, world.segundoTitular, world.tecnico, world.conectado]
          .find((quien) => quien.userId === id || quien.id === id);
        if (!encontrada) return respond({ ok: false, error: { code: "USER_NOT_FOUND" } }, 404);
        return respond({ ok: true, user: encontrada, data: encontrada, ...encontrada });
      }
      if (path === "/api/users") {
        const people = [world.titular, world.segundoTitular, world.tecnico, world.conectado];
        return respond({ ok: true, items: people, total: people.length, data: people });
      }
    }

    uncovered.push({ method, path });
    return respond({ ok: true, items: [], total: 0, data: [] });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(options.timeout || 20000);
  page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  page.on("load", () => loads.push(page.url()));
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
  });

  return { context, page, world, calls, writes, uncovered, offOrigin, pageErrors, documents, loads };
}

/* Esperar un ESTADO observable, nunca un número de milisegundos elegido a ojo. */
export async function untilTrue(page, predicate, { arg = undefined, timeout = 15000, message = "" } = {}) {
  try {
    await page.waitForFunction(predicate, arg, { timeout });
  } catch (error) {
    throw new Error(message ? `${message} (${error.message.split("\n")[0]})` : error.message);
  }
}

/* Pulsar DENTRO de la página: Playwright desplazaría el elemento hasta la vista
   y confundiría su propio desplazamiento con el de la aplicación. */
export async function clickInPage(page, selector) {
  const clicked = await page.evaluate((target) => {
    const node = document.querySelector(target);
    if (!node) return false;
    node.click();
    return true;
  }, selector);
  if (!clicked) throw new Error(`No existe el elemento que se quería pulsar: ${selector}`);
  return true;
}
