import assert from "node:assert/strict";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";

const DIST =
  resolve(process.env.ONION_DIST_DIR || "dist");

const read = (path) =>
  readFileSync(path, "utf8");

function cssHrefs(html) {
  return [
    ...html.matchAll(
      /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+\.css(?:\?[^"']*)?)["'])[^>]*>/gi
    ),
  ].map((match) => match[1]);
}

function localCssPath(href) {
  const clean =
    String(href || "")
      .split("#")[0]
      .split("?")[0]
      .replace(/^\/+/, "");

  assert.ok(
    clean &&
    !clean.includes(".."),
    `href CSS no permitido: ${href}`
  );

  return join(DIST, clean);
}

const publicDocuments = Object.freeze([
  "index.html",
  "login.html",
]);

const linkedCss = new Set();
for (const documentName of publicDocuments) {
  const html =
    read(join(DIST, documentName));
  const hrefs =
    cssHrefs(html);

  assert.ok(
    hrefs.length > 0,
    `${documentName} debe enlazar CSS`
  );

  for (const href of hrefs) {
    linkedCss.add(
      localCssPath(href)
    );
  }
}

const activationMarker =
  join(DIST, "src", "css", "private.css");

if (!existsSync(activationMarker)) {
  console.log(
    "CSS entry split dist contract OK (foundation inactive)."
  );
  process.exit(0);
}

const publicCss =
  [...linkedCss]
    .map((path) => {
      assert.ok(
        statSync(path).isFile(),
        `CSS público ausente: ${path}`
      );
      return read(path);
    })
    .join("\n");

for (const sentinel of [
  "--sb-open-w",
  "--chrome-sidebar-offset",
  "private-admin-toolbar",
  "private-create-modal",
]) {
  assert.equal(
    publicCss.includes(sentinel),
    false,
    `el CSS público contiene el sentinel privado ${sentinel}`
  );
}

const assetsCssDirectory =
  join(DIST, "assets", "css");

const assetCssFiles =
  readdirSync(assetsCssDirectory)
    .filter((name) => name.endsWith(".css"))
    .map((name) => join(assetsCssDirectory, name));

const privateAsset =
  assetCssFiles.find((path) => {
    const text = read(path);
    return (
      text.includes("--sb-open-w") &&
      text.includes("--chrome-sidebar-offset")
    );
  });

assert.ok(
  privateAsset,
  "el build debe emitir un chunk CSS privado fingerprinted"
);

assert.equal(
  linkedCss.has(privateAsset),
  false,
  "Home/Login no pueden enlazar el chunk CSS privado"
);

console.log(
  `CSS entry split dist contract OK: ${privateAsset}`
);
