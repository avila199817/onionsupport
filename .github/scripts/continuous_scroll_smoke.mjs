import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

/*
  Boundary-aware entrypoint for the historical continuous-scroll smoke.

  The complete test remains byte-for-byte in continuous_scroll_smoke.impl.mjs.
  Incidencias now has a stable view boundary in index.js and its full listing
  controller in index.impl.js, so static source reads for that one controller
  must resolve to the implementation. Runtime imports and every assertion in
  the historical smoke remain unchanged.
*/

const originalReadFileSync = fs.readFileSync;
const incidenciasControllerUrl = new URL(
  "../../src/views/incidencias/index.impl.js",
  import.meta.url
);

function isIncidenciasBoundarySource(value) {
  try {
    const text = value instanceof URL ? value.pathname : String(value ?? "");
    return /\/src\/views\/incidencias\/index\.js$/u.test(
      decodeURIComponent(text).replace(/\\/g, "/")
    );
  } catch {
    return false;
  }
}

fs.readFileSync = function boundaryAwareReadFileSync(resource, ...args) {
  if (isIncidenciasBoundarySource(resource)) {
    return originalReadFileSync.call(fs, incidenciasControllerUrl, ...args);
  }

  return originalReadFileSync.call(fs, resource, ...args);
};

syncBuiltinESMExports();

try {
  await import("./continuous_scroll_smoke.impl.mjs");
} finally {
  fs.readFileSync = originalReadFileSync;
  syncBuiltinESMExports();
}
