import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [config, routes, styles, sidebar, view, css] = await Promise.all([
  readFile("src/core/config.js", "utf8"),
  readFile("src/router/routes.js", "utf8"),
  readFile("src/router/styles.js", "utf8"),
  readFile("src/ui/sidebar/index.js", "utf8"),
  readFile("src/views/whatsapp/index.js", "utf8"),
  readFile("src/css/views/whatsapp/index.css", "utf8"),
]);

assert.match(config, /whatsapp:\s*"\/whatsapp"/);
assert.match(config, /ADMIN_ROUTES[\s\S]*ROUTES\.whatsapp/);

assert.match(routes, /WHATSAPP:\s*\n\s*ROUTES\.whatsapp\s*\|\|\s*\n\s*"\/whatsapp"/);
assert.match(routes, /WHATSAPP:\s*"whatsapp"/);
assert.match(routes, /whatsapp:\s*Object\.freeze\(\{[\s\S]*?\.\.\/views\/whatsapp\/index\.js[\s\S]*?WhatsAppView/);
assert.match(routes, /path:\s*ROUTE_PATHS\.WHATSAPP,[\s\S]*?name:\s*ROUTE_NAMES\.WHATSAPP,[\s\S]*?title:\s*"WhatsApp",[\s\S]*?viewKey:\s*"whatsapp",[\s\S]*?adminOnly:\s*true,[\s\S]*?order:\s*54/);

const whatsappRouteIndex = routes.indexOf("path: ROUTE_PATHS.WHATSAPP");
const correoRouteIndex = routes.indexOf("path: ROUTE_PATHS.CORREO");
assert.ok(whatsappRouteIndex >= 0 && correoRouteIndex > whatsappRouteIndex, "WhatsApp must remain ahead of Correo in route order");

assert.match(styles, /whatsapp:\s*Object\.freeze\(\[\s*"\/src\/css\/views\/whatsapp\/index\.css"/);
assert.match(sidebar, /const WHATSAPP_SIDEBAR_PATH =\s*ROUTES\.whatsapp\s*\|\|\s*"\/whatsapp"/);
assert.match(sidebar, /clean ===\s*ROUTES\.whatsapp[\s\S]*?return "whatsapp"/);
assert.match(sidebar, /!seen\.has\([\s\S]*?WHATSAPP_SIDEBAR_PATH/);

assert.match(view, /export function WhatsAppView\(host = null\)/);
assert.match(view, /data-whatsapp-phase/);
assert.match(view, /"prepared"/);
assert.match(view, /host\.replaceChildren\(root\)/);
assert.doesNotMatch(view, /\bfetch\s*\(/);
assert.doesNotMatch(view, /\bHttp\s*\./);
assert.doesNotMatch(view, /\/api\/whatsapp/);
assert.doesNotMatch(view, /localStorage|sessionStorage|WebSocket|EventSource/);

assert.match(css, /\.whatsapp-page/);
assert.match(css, /\.whatsapp-prepared/);

console.log("WhatsApp route contract: PASS · routed admin placeholder · no data plane");
