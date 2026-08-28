import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(path, "utf8");

const globalCss =
  read("src/css/app.css");
const privateCss =
  read("src/css/private.css");
const runtime =
  read("src/features/private-runtime-ui/index.js");
const viteConfig =
  read("vite.config.js");

const privateImports = Object.freeze([
  "./layout/sidebar.css",
  "./layout/sidebar.executive.css",
  "./layout/sidebar.executive.interactions.css",
  "./layout/topbar.css",
  "./layout/topbar.executive.css",
  "./layout/chrome.css",
  "./compositions/private-admin-parity.css",
  "./compositions/private-admin-interactions.css",
  "./compositions/private-create-modal.css",
  "./compositions/private-amounts.css",
]);

for (const privateImport of privateImports) {
  assert.equal(
    globalCss.includes(privateImport),
    true,
    `app.css source debe conservar ${privateImport} para compatibilidad legacy`
  );

  assert.equal(
    privateCss.includes(privateImport),
    true,
    `private.css debe importar ${privateImport}`
  );

  assert.equal(
    viteConfig.includes(privateImport),
    true,
    `Vite debe declarar ${privateImport} en la frontera de split`
  );
}

let previousIndex = -1;
for (const privateImport of privateImports) {
  const currentIndex =
    privateCss.indexOf(privateImport);

  assert.ok(
    currentIndex > previousIndex,
    `private.css debe conservar el orden de ${privateImport}`
  );

  previousIndex = currentIndex;
}

assert.match(
  globalCss,
  /mobile-datalist\.css/,
  "mobile-datalist debe seguir disponible para controles transversales"
);

for (const forbidden of [
  "tokens/variables.css",
  "tokens/light.css",
  "core/reset.css",
  "components/ui.css",
  "views/public/",
  "auth/login.css",
]) {
  assert.equal(
    privateCss.includes(forbidden),
    false,
    `private.css no puede arrastrar ${forbidden}`
  );
}

assert.match(
  viteConfig,
  /const PRIVATE_CSS_IMPORTS = Object\.freeze\(\[/,
  "Vite debe declarar la lista cerrada de imports privados"
);

assert.match(
  viteConfig,
  /function onionPrivateCssEntrySplit\(\)/,
  "Vite debe aplicar el split antes del procesador CSS"
);

assert.match(
  viteConfig,
  /name: "onion-private-css-entry-split"/,
  "el plugin de split debe tener identidad estable"
);

assert.match(
  viteConfig,
  /enforce: "pre"/,
  "el split debe ejecutarse antes del plugin CSS de Vite"
);

assert.match(
  viteConfig,
  /PRIVATE_CSS_IMPORTS\.map\(privateCssImportStatement\)/,
  "el plugin debe derivar statements exactos desde la lista cerrada"
);

assert.match(
  viteConfig,
  /occurrences !== 1/,
  "el build debe fallar si la frontera fuente deriva"
);

assert.match(
  runtime,
  /import\("\.\.\/\.\.\/css\/private\.css"\)/,
  "private-runtime-ui debe importar private.css dinámicamente"
);

assert.match(
  runtime,
  /"\/src\/css\/private\.css"/,
  "private-runtime-ui debe conservar el fallback del artefacto"
);

assert.match(
  runtime,
  /if \(!isProductionBuild\(\)\) \{[\s\S]*stylesheetReady = true;/,
  "source/legacy no debe aplicar private.css dos veces"
);

const styleGate =
  runtime.indexOf("await ensurePrivateStylesheet()");
const moduleLoad =
  runtime.indexOf("await loadPrivateModules()");

assert.ok(
  styleGate >= 0 &&
  moduleLoad > styleGate,
  "el CSS privado debe estar listo antes de inicializar el chrome"
);

const authGate =
  runtime.indexOf(
    "if (!isAuthenticated(context)) return false;"
  );

assert.ok(
  authGate >= 0 &&
  authGate < styleGate,
  "Auth debe preceder a cualquier carga privada"
);

console.log(
  "Private CSS entry contract OK."
);
