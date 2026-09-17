import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const template = read("src/views/usuarios/usuarios.template.js");
const index = read("src/views/usuarios/index.js");
const api = read("src/views/usuarios/usuarios.api.js");
const style = read("src/css/views/usuarios/index.css");
const confirmation = read("src/features/entity-overlay/modal-confirmation.js");

assert.match(template, /RESEND_ACTIVATION:\s*"resend-activation"/u,
  "Usuarios debe declarar una acción explícita de reenvío");
assert.match(template, /status !== "pending" \|\| !id/u,
  "Sólo Pendiente puede convertirse en acción");
assert.match(template, /<button type="button" class="usuarios-chip usuarios-chip--pending usuarios-chip--action/u,
  "Pendiente debe conservar el chip visual pero ser un botón real");
assert.match(template, /data-usuarios-action="\$\{USUARIOS_ACTIONS\.RESEND_ACTIVATION\}"/u,
  "El botón Pendiente debe delegar la acción al controlador");
assert.match(template, /aria-busy="\$\{busy \? "true" : "false"\}"/u,
  "El reenvío debe exponer estado ocupado accesible");
assert.match(template, /disabled aria-disabled="true"/u,
  "Un reenvío en curso debe bloquear dobles envíos");

assert.match(index, /openModalConfirmation/u,
  "La confirmación debe usar la autoridad modal compartida");
assert.match(index, /role:\s*"alertdialog"/u,
  "La confirmación debe anunciarse como alertdialog");
assert.match(index, /size:\s*"confirm"/u,
  "La confirmación debe usar el tamaño canónico");
assert.match(index, /El enlace anterior dejará de ser válido y el nuevo caducará en 24 horas\./u,
  "El administrador debe conocer rotación y caducidad antes de confirmar");
assert.doesNotMatch(index, /window\.confirm\s*\(/u,
  "Usuarios no puede degradar la confirmación a browser chrome");
assert.match(index, /resendingActivationUserId/u,
  "El controlador debe tener single-flight visual por usuario");
assert.match(index, /await resendUsuarioActivationRequestApi\(/u,
  "El controlador debe ejecutar el comando API explícito");
assert.match(index, /code === "ACCOUNT_ALREADY_ACTIVE"/u,
  "Una fila obsoleta ya activa debe reconciliarse");
assert.match(index, /code === "ACTIVATION_STATE_CHANGED"/u,
  "Una carrera de activación debe reconciliarse");
assert.match(index, /resendConfirmationAbort\?\.abort\(\)/u,
  "Desmontar o reemplazar la vista debe cancelar su confirmación");

const apiStart = api.indexOf("export async function resendUsuarioActivationRequest");
assert.ok(apiStart >= 0, "falta resendUsuarioActivationRequest");
const apiEnd = api.indexOf("\nexport async function updateUsuarioRequest", apiStart);
assert.ok(apiEnd > apiStart, "no se pudo aislar resendUsuarioActivationRequest");
const resendApi = api.slice(apiStart, apiEnd);
assert.match(resendApi, /"POST",[\s\S]*?\$\{getUsuarioEndpoint\(userId\)\}\/resend-activation/u,
  "El comando debe usar POST /api/users/:id/resend-activation");
assert.match(resendApi, /source:\s*"views\.usuarios\.api\.resend-activation"/u,
  "El transporte debe conservar source de observabilidad");
assert.match(resendApi, /mail:\s*Object\.freeze\(/u,
  "La respuesta de vista sólo necesita el resultado de entrega");
assert.doesNotMatch(resendApi, /activationUrl\s*:/u,
  "activationUrl nunca debe salir del adaptador API hacia la vista");
assert.doesNotMatch(resendApi, /token\s*:/u,
  "ningún token debe salir del adaptador API hacia la vista");

assert.match(style, /\.usuarios-chip--action:focus-visible/u,
  "Pendiente debe tener foco visible de teclado");
assert.match(style, /\.usuarios-resend-confirm-btn:focus-visible/u,
  "Las acciones de confirmación deben tener foco visible");
assert.match(style, /@media \(prefers-reduced-motion: reduce\)/u,
  "La microinteracción debe respetar reduced motion");
assert.match(style, /@media \(forced-colors: active\)/u,
  "La interacción debe conservarse en forced colors");

assert.match(confirmation, /onEscape: \(\) => settle\(false\)/u,
  "Escape debe cancelar con el lifecycle común");
assert.match(confirmation, /onBackdrop: \(\) => settle\(false\)/u,
  "Backdrop debe cancelar con el lifecycle común");
assert.match(confirmation, /restoreModalFocus\(opener\)/u,
  "El foco debe volver al chip Pendiente");

console.log(
  "Usuarios activation resend: PASS · pending-only · canonical confirmation · POST command · safe DTO · single-flight · accessible states"
);
