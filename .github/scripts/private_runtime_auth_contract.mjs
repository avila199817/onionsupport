#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(path, "utf8");
const [
  app,
  router,
  login,
  enhancements,
  layout,
  chrome,
  variables,
  privateRuntime,
  homeEntityModal,
  entityIntentPreload,
] = await Promise.all([
  read("src/app/index.js"),
  read("src/router/index.js"),
  read("src/views/public/login/index.js"),
  read("src/app/enhancements.js"),
  read("src/css/core/layout.css"),
  read("src/css/layout/chrome.css"),
  read("src/css/tokens/variables.css"),
  read("src/features/private-runtime-ui/index.js"),
  read("src/features/home-entity-modal/index.js"),
  read("src/features/entity-intent-preload/index.js"),
]);
assert.doesNotMatch(app, /await\s+initGlobalUI\s*\(/);
assert.doesNotMatch(app, /ensureSidebarUI|ensureTopbarUI|ensureEntityOverlayUI/);
assert.doesNotMatch(enhancements, /key:\s*"app-chrome"/);
assert.match(privateRuntime, /ensurePrivateRuntimeUI/);
assert.match(privateRuntime, /isAuthenticated\(context\)/);
assert.match(privateRuntime, /import\("\.\.\/\.\.\/ui\/sidebar\/index\.js"\)/);
assert.match(privateRuntime, /import\("\.\.\/\.\.\/ui\/topbar\/index\.js"\)/);
assert.match(privateRuntime, /import\("\.\.\/\.\.\/ui\/chrome\/index\.js"\)/);
assert.match(privateRuntime, /import\("\.\.\/home-entity-modal\/index\.js"\)/);
assert.match(privateRuntime, /import\("\.\.\/entity-overlay\/index\.js"\)/);
assert.match(privateRuntime, /import\("\.\.\/entity-intent-preload\/index\.js"\)/);
assert.match(
  privateRuntime,
  /await initModule\(HomeEntityModalUI, payload\);[\s\S]*await initModule\(EntityOverlayUI, payload\);[\s\S]*await initModule\(EntityIntentPreloadUI, payload\);/
);
assert.match(privateRuntime, /destroyLoaded\(EntityIntentPreloadUI\)/);
assert.match(privateRuntime, /destroyLoaded\(HomeEntityModalUI\)/);
assert.match(homeEntityModal, /document\.addEventListener\("click", onDocumentClick, true\)/);
assert.match(homeEntityModal, /stopImmediatePropagation/);
assert.doesNotMatch(homeEntityModal, /Router\.navigate|history\.(?:pushState|replaceState)/);
assert.match(entityIntentPreload, /authenticated\(\)/);
assert.match(entityIntentPreload, /primeFacturaModalBridge/);
assert.match(entityIntentPreload, /primeIncidenciaModalBridge/);
assert.doesNotMatch(entityIntentPreload, /document\.addEventListener\("click"/);
assert.doesNotMatch(entityIntentPreload, /(^|[^A-Za-z0-9_$])fetch\s*\(/m);
assert.doesNotMatch(entityIntentPreload, /localStorage|sessionStorage|indexedDB/);
assert.match(router, /syncPrivateRuntimeForRoute/);
assert.match(router, /await\s+syncPrivateRuntimeForRoute/);
assert.match(router, /authCall\("syncAuthState",\s*false\)/);
assert.match(router, /force:\s*true,[\s\S]*source:\s*"login"/);
assert.match(login, /auth\.syncAuthState\?\.\(\)/);
assert.match(login, /window\.location\.replace\(target\)/);
assert.match(login, /source:\s*"login\.view\.fallback-router"/);
assert.doesNotMatch(login, /source:\s*"login\.view\.recovery"/);
assert.match(login, /login\.view\.public\.controller\.v7-document-handoff/);
assert.match(variables, /--app-sidebar-current-width:\s*0px;/);
assert.match(variables, /--app-offset-topbar:\s*0px;/);
assert.match(layout, /--layout-main-inset-left:\s*var\(--app-sidebar-current-width,\s*0px\);/);
assert.match(layout, /body\[data-chrome="hidden"\]/);
assert.doesNotMatch(layout, /data-chrome="hidden"\]:not\(\[data-route-mode="boot"\]\)/);
assert.match(chrome, /body\s*\{[\s\S]*--chrome-sidebar-offset:\s*0px;/);
assert.match(chrome, /body\[data-route-mode="app"\]\[data-chrome="visible"\]\s*\{[\s\S]*--chrome-sidebar-offset:\s*var\(--chrome-sidebar-open-width\)/);
assert.doesNotMatch(chrome, /body\s*\{\s*--chrome-sidebar-offset:\s*var\(--chrome-sidebar-open-width\)/);
console.log("Private runtime/auth layout contract: PASS · Home modal authority before global overlay · authenticated owner preload");