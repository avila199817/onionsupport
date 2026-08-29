import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ROUTE_STYLES_VERSION,
  getRouteStyleHrefs,
} from "../../src/router/styles.js";

const read = (path) =>
  readFileSync(path, "utf8");

const BASE_AUTH_CSS =
  "/src/css/auth/login.css";
const PORTAL_LAYOUT_CSS =
  "/src/css/auth/login.portal-layout.css";

const layoutCss =
  read("src/css/auth/login.portal-layout.css");
const executableLayoutCss =
  layoutCss.replace(/\/\*[\s\S]*?\*\//g, "");
const template =
  read("src/views/public/login/template.js");
const packageJson =
  JSON.parse(read("package.json"));

function section(source, startMarker, endMarker) {
  const start =
    source.indexOf(startMarker);

  assert.ok(
    start >= 0,
    `No se encontró la sección ${startMarker}`
  );

  const end =
    source.indexOf(endMarker, start);

  assert.ok(
    end > start,
    `No se encontró el cierre ${endMarker}`
  );

  return source.slice(start, end);
}

function declarationBlock(source, selector) {
  const selectorIndex =
    source.indexOf(selector);

  assert.ok(
    selectorIndex >= 0,
    `No se encontró el selector ${selector}`
  );

  const open =
    source.indexOf("{", selectorIndex);
  const close =
    source.indexOf("}", open);

  assert.ok(
    open > selectorIndex &&
    close > open,
    `Bloque CSS inválido para ${selector}`
  );

  return source.slice(open + 1, close);
}

assert.equal(
  ROUTE_STYLES_VERSION,
  "route-styles.v13-login-card-first",
  "La versión del manifest debe conservar la composición card-first"
);

assert.deepEqual(
  getRouteStyleHrefs("login"),
  [
    BASE_AUTH_CSS,
    PORTAL_LAYOUT_CSS,
  ],
  "Login debe cargar base visual y geometría portal en ese orden"
);

for (const siblingRoute of [
  "password-request",
  "password-reset",
  "activate-account",
]) {
  assert.deepEqual(
    getRouteStyleHrefs(siblingRoute),
    [BASE_AUTH_CSS],
    `${siblingRoute} no debe heredar la composición exclusiva del login`
  );
}

assert.match(
  layoutCss,
  /@layer auth\s*\{/,
  "La composición debe permanecer dentro de la capa auth"
);

assert.equal(
  executableLayoutCss.includes("!important"),
  false,
  "La geometría del login no puede depender de !important"
);

const loginScope =
  declarationBlock(
    layoutCss,
    ".public-auth-shell--login"
  );

for (const invariant of [
  /--login-page-gutter:\s*clamp\(54px, 7vw, 148px\);/,
  /--login-brand-zone-start:\s*clamp\(68px, 9\.2dvh, 80px\);/,
  /--login-brand-zone-end:\s*14px;/,
  /--login-brand-mark-size:\s*48px;/,
]) {
  assert.match(
    loginScope,
    invariant,
    "La zona desktop de marca debe conservar su geometría canónica"
  );
}

const topbar =
  declarationBlock(
    layoutCss,
    ".public-auth-shell--login .login-topbar"
  );

for (const invariant of [
  /align-items:\s*flex-start;/,
  /var\(--login-brand-zone-start\)/,
  /var\(--login-brand-mark-size\)/,
  /var\(--login-brand-zone-end\)/,
  /var\(--login-page-gutter\)/,
]) {
  assert.match(
    topbar,
    invariant,
    "Desktop debe reservar una zona real y estable para la marca"
  );
}

const brand =
  declarationBlock(
    layoutCss,
    ".public-auth-shell--login .login-topbar-brand"
  );

assert.match(
  brand,
  /transform:\s*none;/,
  "La marca no puede volver a depender de un desplazamiento óptico"
);

assert.doesNotMatch(
  executableLayoutCss,
  /@media\s*\(max-height:[\s\S]*?\.public-auth-shell--login \.login-topbar\s*\{/,
  "Ningún viewport corto puede volver a sacar la marca de su zona"
);

const portalMain =
  declarationBlock(
    layoutCss,
    ".public-auth-shell--login .login-portal-main"
  );

assert.match(
  portalMain,
  /padding-inline:\s*var\(--login-page-gutter\);/,
  "El cuerpo debe consumir el mismo gutter que la marca"
);

const cardHomeLinkCss =
  declarationBlock(
    layoutCss,
    ".public-auth-shell--login .login-card-home-link"
  );

for (const invariant of [
  /display:\s*inline-grid;/,
  /place-items:\s*center;/,
  /min-inline-size:\s*72px;/,
  /min-block-size:\s*72px;/,
  /text-decoration:\s*none;/,
  /touch-action:\s*manipulation;/,
  /-webkit-tap-highlight-color:\s*transparent;/,
]) {
  assert.match(
    cardHomeLinkCss,
    invariant,
    "El logo enlazado del card debe conservar una interacción táctil accesible"
  );
}

assert.match(
  layoutCss,
  /\.public-auth-shell--login \.login-card-home-link:focus-visible\s*\{/,
  "El enlace del logo debe tener foco visible"
);

const mobile =
  section(
    layoutCss,
    "4. MOBILE CARD-ONLY · <= 860px",
    "5. COMPACT MOBILE GUTTER · <= 560px"
  );

assert.match(
  mobile,
  /@media \(max-width: 860px\)/,
  "La frontera móvil debe quedar fijada en 860px"
);

const hiddenMobileContent =
  declarationBlock(
    mobile,
    ".public-auth-shell--login .login-page-glow,"
  );

assert.match(
  mobile,
  /\.public-auth-shell--login \.login-topbar,/,
  "La marca exterior debe retirarse en móvil"
);

assert.match(
  mobile,
  /\.public-auth-shell--login \.login-showcase\s*\{/,
  "El showcase debe retirarse en móvil"
);

assert.match(
  hiddenMobileContent,
  /display:\s*none;/,
  "El contenido exterior al card debe quedar fuera del layout móvil"
);

assert.doesNotMatch(
  hiddenMobileContent,
  /login-card-home-link/,
  "El enlace home del logo interior nunca puede quedar oculto en móvil"
);

const mobileMain =
  declarationBlock(
    mobile,
    ".public-auth-shell--login .login-portal-main"
  );

for (const invariant of [
  /grid-template-columns:\s*minmax\(0, 1fr\);/,
  /grid-template-rows:\s*minmax\(min-content, 1fr\);/,
  /min-block-size:\s*100dvh;/,
  /env\(safe-area-inset-top\)/,
  /env\(safe-area-inset-bottom\)/,
]) {
  assert.match(
    mobileMain,
    invariant,
    "El main móvil debe centrar el card y respetar viewport/safe areas"
  );
}

const mobileCard =
  declarationBlock(
    mobile,
    ".public-auth-shell--login .login-card-panel--portal"
  );

assert.match(
  mobileCard,
  /margin-block:\s*auto;/,
  "El card debe centrarse cuando cabe y arrancar sin recorte cuando desborda"
);

assert.doesNotMatch(
  mobileCard,
  /display:\s*none;/,
  "La composición móvil nunca puede ocultar el card"
);

assert.match(
  template,
  /login\.template\.public\.v8-home-logo-link-2026/,
  "El template debe identificar la revisión enlazada a la home"
);

const cardHomeLogo =
  section(
    template,
    "function renderLoginCardHomeLogo()",
    "/* =========================================================\n   FIELD"
  );

for (const invariant of [
  /const homeHref = homeAnchor\(""\);/,
  /class="login-card-home-link"/,
  /href="\$\{escapeAttr\(homeHref\)\}"/,
  /data-spa="true"/,
  /data-router-link="true"/,
  /data-route="\$\{escapeAttr\(homeHref\)\}"/,
  /data-login-home-link="true"/,
  /aria-label="Ir a la página principal de Onion Support"/,
  /shellClass: "login-card-logo-shell"/,
  /imageClass: "login-card-logo"/,
]) {
  assert.match(
    cardHomeLogo,
    invariant,
    "El logo del card debe navegar semánticamente a la home pública"
  );
}

const loginCardSource =
  section(
    template,
    "function renderLoginCard()",
    "/* =========================================================\n   TEMPLATE"
  );

assert.match(
  loginCardSource,
  /\$\{renderLoginCardHomeLogo\(\)\}/,
  "El card debe renderizar el enlace home canónico"
);

for (const selector of [
  "login-topbar",
  "login-showcase",
  "login-card-panel--portal",
  'data-login-card="true"',
  'data-login-home-link="true"',
]) {
  assert.equal(
    template.includes(selector),
    true,
    `El template debe conservar ${selector}`
  );
}

const topbarIndex =
  template.indexOf("${renderTopbar()}");
const showcaseIndex =
  template.indexOf("${renderShowcase()}");
const cardIndex =
  template.indexOf("${renderLoginCard()}");

assert.ok(
  topbarIndex >= 0 &&
  showcaseIndex > topbarIndex &&
  cardIndex > showcaseIndex,
  "La estructura semántica desktop debe conservar topbar, showcase y card"
);

assert.match(
  packageJson.scripts?.["validate:source"] || "",
  /public_login_layout_contract\.mjs/,
  "validate:source debe ejecutar este contrato"
);

console.log(
  `✅ public login layout contract (${ROUTE_STYLES_VERSION} · brand zone · mobile card-only · home link)`
);
