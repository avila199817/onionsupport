import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  config,
  routes,
  router,
  styles,
  sidebar,
  view,
  api,
  template,
  css,
  fullViewComposition,
  appCss,
  avatarSystem,
  avatarCss,
  uiCss,
  appIcons,
] = await Promise.all([
  readFile("src/core/config.js", "utf8"),
  readFile("src/router/routes.js", "utf8"),
  readFile("src/router/index.js", "utf8"),
  readFile("src/router/styles.js", "utf8"),
  readFile("src/ui/sidebar/index.js", "utf8"),
  readFile("src/views/whatsapp/index.js", "utf8"),
  readFile("src/views/whatsapp/whatsapp.api.js", "utf8"),
  readFile("src/views/whatsapp/whatsapp.template.js", "utf8"),
  readFile("src/css/views/whatsapp/index.css", "utf8"),
  readFile("src/css/compositions/private-fullview-routes.css", "utf8"),
  readFile("src/css/app.css", "utf8"),
  readFile("src/features/avatar-system/index.js", "utf8"),
  readFile("src/css/components/avatar-system.css", "utf8"),
  readFile("src/css/components/ui.css", "utf8"),
  readFile("src/css/components/app-icons.css", "utf8"),
]);

const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");
const fullViewCode = fullViewComposition.replace(/\/\*[\s\S]*?\*\//g, "");

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

// Router commits every view through one canonical intermediate host.
assert.match(router, /const ROUTE_HOST_CLASS\s*=\s*\n\s*"route-view-host"/);
assert.match(router, /host\.dataset\.routeHost\s*=\s*\n\s*"true"/);
assert.match(router, /host\.dataset\.viewKey\s*=\s*\n\s*route\?\.viewKey/);
assert.match(router, /root\.replaceChildren\(\s*nextHost\s*\)/);

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
assert.match(view, /mobilePanel:\s*"list"/);
assert.match(view, /state\.mobilePanel\s*=\s*"thread"/);
assert.match(view, /action === "back-to-list"[\s\S]*state\.mobilePanel\s*=\s*"list"/);
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

// Template consumes shared authorities and is a true full-view workspace.
assert.match(template, /WHATSAPP_TEMPLATE_VERSION[\s\S]*correo-fullview/);
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
assert.match(template, /class="whatsapp-pane whatsapp-conversations-pane/);
assert.match(template, /class="whatsapp-pane whatsapp-thread-pane/);
assert.match(template, /class="whatsapp-pane whatsapp-info-pane/);
assert.match(template, /data-whatsapp-mobile-panel=/);
assert.match(template, /data-whatsapp-action="back-to-list"/);
assert.match(template, /data-app-icon="wa"/);
assert.match(template, /data-app-icon="reload"/);
assert.match(template, /aria-label="WhatsApp Business"/);
assert.doesNotMatch(template, /whatsapp-page-head|<h1|whatsapp-page-title/);
assert.doesNotMatch(template, /class="ui-card/);
assert.doesNotMatch(template, /style=/i);
assert.doesNotMatch(template, /\bfetch\s*\(|\bHttp\s*\.|\/api\/whatsapp/);

// Existing global systems expose everything WhatsApp consumes.
assert.match(avatarSystem, /export function synchronizeAvatars/);
assert.match(avatarSystem, /resolveAvatarPresentation/);
assert.match(avatarCss, /\.ui-avatar/);
assert.match(uiCss, /\.ui-btn-primary/);
assert.match(uiCss, /\.ui-btn-ghost/);
assert.match(uiCss, /\.ui-input/);
assert.match(uiCss, /\.ui-textarea/);
assert.match(uiCss, /\.ui-chip/);
assert.match(uiCss, /\.ui-spinner/);
assert.match(appIcons, /--app-icon-whatsapp/);
assert.match(appIcons, /--app-icon-refresh/);
assert.match(appIcons, /data-app-icon="wa"/);
assert.match(appIcons, /data-app-icon="reload"/);

// Domain CSS: Correo-like viewport discipline, geometry only, shared paint.
assert.match(css, /DOMAIN-ONLY CSS/);
assert.match(css, /CORREO FULL-VIEW PARITY/);
assert.match(css, /components\/ui\.css/);
assert.match(css, /components\/avatar-system\.css/);
assert.match(css, /components\/app-icons\.css/);
assert.match(cssCode, /\.panel-content\[data-view="whatsapp"\]/);
assert.match(cssCode, /\.main-content:has\(\.whatsapp-page\)/);
assert.match(cssCode, /\.whatsapp-workspace/);
assert.match(cssCode, /grid-template-columns:[\s\S]*clamp\(300px, 23vw, 380px\)[\s\S]*minmax\(500px, 1fr\)/);
assert.match(cssCode, /\.whatsapp-message\.is-outbound/);
assert.match(cssCode, /\.whatsapp-pane-actions/);
assert.match(cssCode, /@container \(max-width: 780px\)/);
assert.doesNotMatch(cssCode, /#[0-9a-f]{3,8}\b/i);
assert.doesNotMatch(cssCode, /!important\b/i);
assert.doesNotMatch(cssCode, /@import/);
assert.doesNotMatch(cssCode, /data:image|<svg/i);

// Cross-view geometry closes every real DOM level, including Router route-view-host.
assert.match(appCss, /@import url\("\.\/compositions\/private-fullview-routes\.css"\) layer\(compositions\);/);
assert.match(fullViewComposition, /FULL-VIEW CHAIN · ALL VIEWPORTS/);
assert.match(fullViewCode, /\.main-content:has\(\.whatsapp-page\)/);
assert.match(fullViewCode, /#app-content:has\(\.whatsapp-page\)[\s\S]*block-size:\s*100%/);
assert.match(fullViewCode, /#view-container:has\(\.whatsapp-page\)[\s\S]*display:\s*flex/);
assert.match(fullViewCode, /\.route-view-host\[data-view-key="whatsapp"\]/);
assert.match(fullViewCode, /\[data-route-host="true"\]\[data-view-key="whatsapp"\]/);
assert.match(fullViewCode, /#view-container:has\(\.whatsapp-page\)[\s\S]*\.route-view-host\[data-view-key="whatsapp"\][\s\S]*:not\(\[hidden\]\)[\s\S]*flex:\s*1 1 0/);
assert.match(fullViewCode, /\.route-view-host\[data-view-key="whatsapp"\][\s\S]*> \.whatsapp-page[\s\S]*block-size:\s*auto[\s\S]*flex:\s*1 1 0/);
assert.match(fullViewCode, /\.content-wrapper:has\(\.whatsapp-page\)[\s\S]*padding:\s*0/);
assert.match(fullViewCode, /\.panel-content\[data-view="whatsapp"\]:has\(\.whatsapp-page\)[\s\S]*block-size:\s*100%/);
assert.match(fullViewCode, /\.whatsapp-page,[\s\S]*\.whatsapp-workspace,[\s\S]*\.whatsapp-pane[\s\S]*max-block-size:\s*100%/);
assert.match(fullViewCode, /@container \(max-width: 1180px\)/);
assert.match(fullViewCode, /@container \(max-width: 780px\)[\s\S]*\.whatsapp-workspace[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(fullViewCode, /@container \(max-width: 780px\)[\s\S]*\.whatsapp-thread-scroll[\s\S]*min-block-size:\s*0/);
assert.match(fullViewCode, /@container \(max-width: 780px\)[\s\S]*\.whatsapp-composer-row[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
assert.match(fullViewCode, /\.whatsapp-refresh-button[\s\S]*min-block-size:\s*44px/);
assert.match(fullViewCode, /\.whatsapp-mobile-back[\s\S]*min-block-size:\s*44px/);
assert.match(fullViewCode, /@container \(max-width: 520px\)[\s\S]*\.whatsapp-thread-link[\s\S]*display:\s*none/);
assert.match(fullViewCode, /@media \(max-height: 560px\)/);
assert.doesNotMatch(fullViewCode, /!important\b/i);
assert.doesNotMatch(fullViewCode, /#[0-9a-f]{3,8}\b/i);

console.log("WhatsApp route contract: PASS · real route-host full-view · desktop/tablet/mobile · centralized backend · shared UI/avatar authority");
