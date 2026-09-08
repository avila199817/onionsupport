import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  config,
  routes,
  styles,
  sidebar,
  view,
  api,
  template,
  css,
  avatarSystem,
  avatarCss,
  uiCss,
  appIcons,
] = await Promise.all([
  readFile("src/core/config.js", "utf8"),
  readFile("src/router/routes.js", "utf8"),
  readFile("src/router/styles.js", "utf8"),
  readFile("src/ui/sidebar/index.js", "utf8"),
  readFile("src/views/whatsapp/index.js", "utf8"),
  readFile("src/views/whatsapp/whatsapp.api.js", "utf8"),
  readFile("src/views/whatsapp/whatsapp.template.js", "utf8"),
  readFile("src/css/views/whatsapp/index.css", "utf8"),
  readFile("src/features/avatar-system/index.js", "utf8"),
  readFile("src/css/components/avatar-system.css", "utf8"),
  readFile("src/css/components/ui.css", "utf8"),
  readFile("src/css/components/app-icons.css", "utf8"),
]);

// Route remains private/admin and uses the existing route-style boundary.
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

// View owns UI lifecycle only. Network is background work, never a Router gate.
assert.match(view, /export function WhatsAppView\(host = null, context = \{\}\)/);
assert.match(view, /render\(\);[\s\S]*void Promise\.allSettled\(/);
assert.match(view, /return controller;/);
assert.match(view, /POLL_INTERVAL_MS = 12_000/);
assert.match(view, /document\.visibilityState === "hidden"/);
assert.match(view, /abortAll\(controllers\)/);
assert.match(view, /loadUsuarioDetail/);
assert.match(view, /loadClienteDetail/);
assert.match(view, /synchronizeAvatars\(host\)/);
assert.doesNotMatch(view, /\bfetch\s*\(/);
assert.doesNotMatch(view, /\bHttp\s*\./);
assert.doesNotMatch(view, /\/api\/whatsapp/);
assert.doesNotMatch(view, /localStorage|sessionStorage|WebSocket|EventSource/);

// One frontend HTTP boundary, exclusively through Onion backend.
assert.match(api, /import Http from "\.\.\/\.\.\/core\/http\.js"/);
assert.match(api, /meta:\s*"\/api\/whatsapp\/_meta"/);
assert.match(api, /conversations:\s*"\/api\/whatsapp\/conversations"/);
assert.match(api, /messages:\s*"\/api\/whatsapp\/messages"/);
assert.match(api, /Idempotency-Key/);
assert.match(api, /clientMessageId/);
assert.match(api, /signal:\s*options\.signal/);
assert.doesNotMatch(api, /graph\.facebook|facebook\.com|graph\.whatsapp|wa\.me/i);
assert.doesNotMatch(api, /localStorage|sessionStorage|WebSocket|EventSource/);

// Template consumes the global avatar/media authorities instead of inventing one.
assert.match(template, /resolveAvatarPresentation/);
assert.match(template, /sanitizeRuntimeImageUrl/);
assert.match(template, /className = "ui-avatar"/);
assert.match(template, /"ui-avatar whatsapp-conversation-avatar"/);
assert.match(template, /"ui-avatar whatsapp-thread-avatar"/);
assert.match(template, /"ui-avatar whatsapp-contact-avatar"/);
assert.match(template, /data-avatar-system="true"/);
assert.match(template, /data-avatar-fallback="true"/);
assert.match(template, /data-avatar-image="true"/);
assert.match(template, /class="ui-btn ui-btn-primary/);
assert.match(template, /class="ui-input whatsapp-search-input/);
assert.match(template, /class="ui-textarea whatsapp-composer-input/);
assert.match(template, /class="ui-card no-hover whatsapp-pane/);
assert.match(template, /data-app-icon="wa"/);
assert.doesNotMatch(template, /style=/i);
assert.doesNotMatch(template, /\bfetch\s*\(|\bHttp\s*\.|\/api\/whatsapp/);

// Existing global systems actually expose the contracts WhatsApp consumes.
assert.match(avatarSystem, /export function synchronizeAvatars/);
assert.match(avatarSystem, /resolveAvatarPresentation/);
assert.match(avatarCss, /\.ui-avatar/);
assert.match(uiCss, /\.ui-card/);
assert.match(uiCss, /\.ui-btn-primary/);
assert.match(uiCss, /\.ui-input/);
assert.match(uiCss, /\.ui-textarea/);
assert.match(appIcons, /--app-icon-whatsapp/);
assert.match(appIcons, /data-app-icon="wa"/);

// Domain CSS: geometry only, all visual paint comes from existing tokens/systems.
assert.match(css, /DOMAIN-ONLY CSS/);
assert.match(css, /components\/ui\.css/);
assert.match(css, /components\/avatar-system\.css/);
assert.match(css, /components\/app-icons\.css/);
assert.match(css, /\.whatsapp-workspace/);
assert.match(css, /\.whatsapp-message\.is-outbound/);
assert.match(css, /@container \(max-width: 780px\)/);
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
assert.doesNotMatch(css, /:[^;{}]*!important\b/i);
assert.doesNotMatch(css, /@import/);
assert.doesNotMatch(css, /data:image|<svg/i);

console.log("WhatsApp route contract: PASS · professional Onion inbox · centralized backend · shared UI/avatar authority");
