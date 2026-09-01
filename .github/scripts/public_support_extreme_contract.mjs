import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.env.ONION_REPO_ROOT || process.cwd());
const read = (path) => readFileSync(resolve(root, path), "utf8");

const enhancements = read("src/app/enhancements.js");
const extreme = read("src/features/public-support-extreme/index.js");
const css = read("src/css/views/public/support-extreme.css");
const intake = read("src/features/public-support/index.js");

function contains(source, snippet, message) {
  assert.ok(source.includes(snippet), message);
}

contains(
  enhancements,
  'key: "public-support-extreme"',
  "El enhancement registry debe declarar public-support-extreme"
);
contains(
  enhancements,
  'import("../features/public-support-extreme/index.js")',
  "La mejora extrema debe cargarse sólo por el registry"
);
contains(
  enhancements,
  'scope: "public"',
  "La mejora extrema debe quedar limitada al scope público"
);

contains(
  extreme,
  '"public-support.extreme.v2-client-facing-feedback"',
  "Falta versión del contrato extremo"
);
contains(
  extreme,
  'import "../../css/views/public/support-extreme.css";',
  "La mejora extrema debe cargar su CSS route-scoped"
);
contains(
  extreme,
  'title.textContent = "Tus datos vinculan la incidencia";',
  "La UI debe explicar la vinculación por contacto con lenguaje de cliente"
);
contains(
  extreme,
  "Usaremos el correo y el móvil que indiques.",
  "La UI debe explicar qué datos vinculan la incidencia"
);
contains(
  extreme,
  "Si ya tienes cuenta, la reutilizamos sin cambiar tus datos; si es tu primera vez, recibirás un acceso seguro.",
  "La UI debe declarar reutilización segura y primer acceso"
);
contains(
  extreme,
  'severity === "error" || severity === "warning" ? "alert" : "status"',
  "Warnings y errores deben usar semántica alert"
);
contains(
  extreme,
  'severity === "error" || severity === "warning" ? "assertive" : "polite"',
  "Warnings y errores deben anunciarse de forma assertive"
);
contains(
  extreme,
  'label.textContent = "Reintentar incidencia";',
  "Los fallos transitorios deben convertir el CTA en reintento"
);
contains(
  extreme,
  "reutilizaremos el mismo intento para evitar duplicados",
  "El warning 503 debe explicar el reintento idempotente"
);
contains(
  extreme,
  "new MutationObserver(queueScan)",
  "La capa extrema debe seguir estados del intake sin monkey-patching HTTP"
);

contains(
  css,
  '.public-support-status[data-status="warning"]',
  "Falta estado visual warning"
);
contains(
  css,
  "@media (min-width: 981px) and (max-width: 1320px)",
  "Falta collision guard de desktop estrecho"
);
contains(
  css,
  ".public-support-person {\n    position: relative;",
  "El collision guard debe sacar al técnico del posicionamiento absoluto"
);
contains(
  css,
  'html:is([data-theme="light"], .theme-light)',
  "La mejora extrema debe conservar soporte light"
);

contains(
  intake,
  'const useAuth = session().authenticated === true;',
  "El frontend puede seguir enviando sesión opcional; la propiedad la resuelve el backend"
);
contains(
  intake,
  '"Idempotency-Key": requestKey',
  "El reintento debe seguir usando Idempotency-Key"
);

console.log("✅ public support extreme contract 18/18");
