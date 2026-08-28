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
    false,
    `app.css no puede importar ${privateImport}`
  );

  assert.equal(
    privateCss.includes(privateImport),
    true,
    `private.css debe importar ${privateImport}`
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
  runtime,
  /import\.meta\.env\?\.PROD/,
  "el build debe seleccionar el chunk CSS privado"
);

assert.match(
  runtime,
  /import\("\.\.\/\.\.\/css\/private\.css"\)/,
  "private-runtime-ui debe importar private.css dinámicamente"
);

assert.match(
  runtime,
  /"\/src\/css\/private\.css"/,
  "private-runtime-ui debe conservar el fallback source"
);

assert.match(
  runtime,
  /data-onion-private-styles/,
  "el fallback debe quedar identificado de forma determinista"
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
