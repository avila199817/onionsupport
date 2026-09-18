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
assert.match(index, /value="email"[\s\S]*?Enviar automáticamente/u,
  "La confirmación debe ofrecer entrega automática");
assert.match(index, /value="manual"[\s\S]*?Generar envío manual/u,
  "La confirmación debe ofrecer entrega manual");
assert.match(index, /Se descargará un \.txt con el mensaje y el enlace/u,
  "El modo manual debe explicar la descarga del template");
assert.doesNotMatch(index, /window\.confirm\s*\(/u,
  "Usuarios no puede degradar la confirmación a browser chrome");
assert.match(index, /resendingActivationUserId/u,
  "El controlador debe tener single-flight visual por usuario");
assert.match(index, /await resendUsuarioActivationRequestApi\(/u,
  "El controlador debe ejecutar el comando API explícito");
assert.match(index, /delivery,[\s\S]*?signal:/u,
  "El controlador debe enviar el modo elegido al adaptador API");
assert.match(index, /buildManualActivationTemplate\(/u,
  "El modo manual debe generar el texto listo para enviar");
assert.match(index, /manualActivationFilename\(/u,
  "La descarga manual debe tener nombre estable");
assert.match(index, /text\/plain;charset=utf-8/u,
  "La plantilla manual debe descargarse como TXT UTF-8");
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
assert.match(resendApi, /\{[\s\S]*?delivery,[\s\S]*?\},[\s\S]*?source:\s*"views\.usuarios\.api\.resend-activation"/u,
  "El transporte debe enviar delivery y conservar source de observabilidad");
assert.match(resendApi, /!\["email", "manual"\]\.includes/u,
  "El adaptador sólo debe aceptar los dos modos soportados");
assert.match(resendApi, /delivery === "manual"[\s\S]*?source\.activationUrl/u,
  "activationUrl sólo puede leerse en el modo manual explícito");
assert.match(resendApi, /USUARIO_ACTIVATION_MANUAL_URL_INVALID/u,
  "El enlace manual debe validarse antes de llegar a la vista");
assert.match(resendApi, /\^https:\\\/\\\/www\\\.onionsupport\\\.com\\\/activate-account\\\//u,
  "El enlace manual debe quedar limitado al host y ruta canónicos");
assert.match(resendApi, /\.\.\.\(delivery === "manual"[\s\S]*?activationUrl/u,
  "Sólo la respuesta manual debe exponer activationUrl a la vista");
assert.match(resendApi, /mail:\s*Object\.freeze\(/u,
  "La respuesta debe conservar el resultado operativo de entrega");
assert.doesNotMatch(resendApi, /token\s*:/u,
  "ningún token crudo debe salir del adaptador API hacia la vista");

assert.match(style, /\.usuarios-chip--action:focus-visible/u,
  "Pendiente debe tener foco visible de teclado");
assert.match(style, /\.usuarios-resend-confirm-btn:focus-visible/u,
  "Las acciones de confirmación deben tener foco visible");
assert.match(style, /\.usuarios-resend-delivery-option:has\(input:checked\)/u,
  "La opción de entrega seleccionada debe ser visible");
assert.match(style, /\.usuarios-resend-delivery-option:has\(input:focus-visible\)/u,
  "Las opciones de entrega deben conservar foco visible");
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
  "Usuarios activation delivery: PASS · pending-only · email/manual choice · safe manual URL · TXT template · single-flight · accessible states"
);
