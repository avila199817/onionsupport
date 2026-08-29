import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

const THEME_CSS_PATHS = Object.freeze([
  "src/css/compositions/public-system-theme-foundation.css",
  "src/css/compositions/public-system-theme-home.css",
  "src/css/compositions/public-system-theme-support.css",
  "src/css/compositions/public-system-theme-auth.css",
]);

const themeFiles = THEME_CSS_PATHS.map((path) => ({ path, source: read(path) }));
const themeCss = themeFiles.map(({ source }) => source).join("\n");
const executableThemeCss = stripComments(themeCss);
const appCss = read("src/css/app.css");
const preboot = read("src/preboot/theme.js");
const packageJson = JSON.parse(read("package.json"));

for (const path of THEME_CSS_PATHS) {
  assert.match(
    appCss,
    new RegExp(`@import url\\("\\./compositions/${path.split("/").at(-1).replaceAll(".", "\\.")}"\\) layer\\(compositions\\);`),
    `app.css debe cargar ${path} dentro de compositions`
  );
}

assert.match(
  packageJson.scripts?.["validate:source"] || "",
  /public_system_theme_contract\.mjs/,
  "validate:source debe ejecutar el contrato del tema público"
);

for (const [token, message] of [
  ['const DARK_QUERY = "(prefers-color-scheme: dark)";', "Preboot debe observar el esquema oscuro del dispositivo"],
  ['const DEFAULTS = Object.freeze({ themeMode: "system", locale: "es" });', "El modo inicial debe seguir al dispositivo"],
  ['return mode === "system" ? getSystemTheme() : mode;', "El tema efectivo debe resolver system antes del primer paint"],
  ['setClass(node, "theme-light", effective === "light")', "Preboot debe aplicar la clase light"],
  ['setClass(node, "theme-dark", effective === "dark")', "Preboot debe aplicar la clase dark"],
  ['setData(node, "theme", effective)', "Preboot debe publicar data-theme"],
  ['query.addEventListener("change", onSystemThemeChange)', "El modo system debe reaccionar a cambios del SO"],
]) {
  assert.ok(preboot.includes(token), message);
}

const lightScope = /html:is\(\[data-theme="light"\], \.theme-light\)/;
assert.match(
  executableThemeCss,
  lightScope,
  "Todos los overrides deben depender del tema light efectivo"
);

for (const [pattern, message] of [
  [/PUBLIC SYSTEM THEME COMPOSITION · HOME \+ AUTH · 2026/, "Falta la identidad del contrato transversal"],
  [/--public-light-canvas:\s*#f4f7fb;/, "Falta el canvas claro canónico"],
  [/--public-home-bg:\s*#f4f7fb;/, "La home debe exponer sus tokens claros"],
  [/--auth-bg:\s*#f4f7fb;/, "Auth debe exponer sus tokens claros"],
  [/\.public-auth-shell--home\s*\{/, "Falta el shell light de la home"],
  [/\.public-home-nav\s*\{/, "Falta la navegación light"],
  [/\.public-home-profile-card--command\s*\{/, "Falta la tarjeta profesional light"],
  [/\.public-home \.public-support-layout\s*\{/, "Falta el intake público light"],
  [/\.public-home \.public-support-form\s*\{/, "Falta el formulario público light"],
  [/\.public-support-submit-overlay\s*\{/, "Falta el overlay de envío light"],
  [/\.public-auth-shell:not\(\.public-auth-shell--home\)\s*\{/, "Falta el shell Auth light"],
  [/\.login-card-panel--portal\s*\{/, "Falta el card de login light"],
  [/\.login-input-shell\s*\{/, "Faltan los campos de login light"],
  [/\.public-home-floating-whatsapp\s*\{[\s\S]*?color:\s*#ffffff;/, "El acceso flotante de WhatsApp debe conservar contraste blanco en light"],
  [/\.public-home-icon--whatsapp path\s*\{[\s\S]*?fill:\s*currentColor;[\s\S]*?stroke:\s*none;/, "El glifo de WhatsApp debe heredar el blanco del acceso flotante"],
  [/@media \(max-width: 1040px\)[\s\S]*?\.public-home-nav-panel\s*\{/, "El menú público light debe cubrir tablet/móvil"],
  [/@media \(max-width: 720px\)[\s\S]*?\.login-card-panel,[\s\S]*?\.password-reset-card-panel/, "Las superficies Auth light deben conservar su fallback móvil"],
]) {
  assert.match(themeCss, pattern, message);
}

for (const selector of [
  ".public-home-service-card",
  ".public-home-method-card",
  ".public-home-price-card",
  ".public-home-contact-panel",
  ".public-home-faq-item",
  ".public-home-footer",
  ".public-home-account-menu",
  ".public-home-floating-whatsapp",
  ".public-support-field input",
  ".login-showcase-title",
  ".login-card-title",
  ".login-input",
  ".password-reset-input",
]) {
  assert.ok(
    executableThemeCss.includes(selector),
    `El tema público light debe cubrir ${selector}`
  );
}

for (const { path, source } of themeFiles) {
  const executable = stripComments(source);

  assert.equal(
    executable.includes("!important"),
    false,
    `${path} no puede depender de !important`
  );

  assert.equal(
    /@import\b/.test(executable),
    false,
    `${path} no puede importar otras hojas`
  );

  assert.equal(
    /url\s*\(/.test(executable),
    false,
    `${path} no puede introducir assets o data-URLs`
  );

  for (const property of [
    "position",
    "display",
    "grid-template",
    "inset",
    "inline-size",
    "block-size",
    "min-inline-size",
    "max-inline-size",
    "min-block-size",
    "max-block-size",
    "margin",
    "padding",
    "overflow",
    "transform",
    "translate",
  ]) {
    assert.doesNotMatch(
      executable,
      new RegExp(`(?:^|[;{]\\s*)${property}(?:-[a-z-]+)?\\s*:`, "m"),
      `${path} no puede modificar geometría: ${property}`
    );
  }
}

const lightSelectorCount = (
  executableThemeCss.match(/html:is\(\[data-theme="light"\], \.theme-light\)/g) || []
).length;

assert.ok(
  lightSelectorCount >= 100,
  "La cobertura light debe ser integral, no un parche parcial"
);

assert.ok(
  themeCss.length >= 35000,
  "La implementación light debe cubrir todas las superficies públicas"
);

console.log("✅ public system theme contract (device/system · home + auth · light/dark · WhatsApp white)");
