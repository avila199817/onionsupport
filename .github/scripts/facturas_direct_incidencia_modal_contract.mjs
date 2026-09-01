import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const [
  facturas,
  autorefresh,
  interceptor,
  bridge,
  incidencias,
  avatarFallback,
  followupAvatars,
] = await Promise.all([
  read("src/views/facturas/index.js"),
  read("src/features/facturas-autorefresh/index.js"),
  read("src/features/facturas-incidencia-modal/index.js"),
  read("src/features/incidencia-modal-bridge/index.js"),
  read("src/views/incidencias/index.impl.js"),
  read("src/features/incidencias-avatar-fallback/index.js"),
  read("src/features/incidencias-followup-avatars/index.js"),
]);

/* El handler legacy sigue presente, pero ya no recibe el click en Facturas. */
assert.match(facturas, /facturas\.open-incidencia/);
assert.match(facturas, /Router\.navigate\(route/);

/* La feature se carga sólo con el enhancement route-scoped de Facturas. */
assert.match(
  autorefresh,
  /import\s+["']\.\.\/facturas-incidencia-modal\/index\.js["']/
);

/* Captura antes del controller y corta por completo la navegación legacy. */
assert.match(interceptor, /document\.addEventListener\("click", onDocumentClick, true\)/);
assert.match(interceptor, /event\.stopImmediatePropagation\?\.\(\)/);
assert.match(interceptor, /openIncidenciaModalFromCurrentView/);
assert.match(interceptor, /routeNavigation:\s*false/);
assert.match(interceptor, /close-factura-detail/);

/* El bridge nunca navega: usa el controller canónico de Incidencias. */
assert.doesNotMatch(bridge, /Router\.navigate|location\.href|location\.assign/);
assert.match(bridge, /module\?\.IncidenciasView/);
assert.match(bridge, /controller\.openDetail/);
assert.match(bridge, /disposeBridge\(\{ invalidate: false \}\)/);
assert.match(bridge, /data-incidencias-modal-bridge-host/);

/*
  Paridad visual transversal: Facturas mantiene su propia ruta, por lo que el
  bridge debe cargar explícitamente las mejoras de avatar que normalmente
  aporta el scope Incidencias y sincronizarlas tras el primer paint.
*/
assert.match(
  bridge,
  /import\(["']\.\.\/incidencias-avatar-fallback\/index\.js["']\)/
);
assert.match(
  bridge,
  /import\(["']\.\.\/incidencias-followup-avatars\/index\.js["']\)/
);
assert.match(bridge, /mountIncidenciasAvatarFallback/);
assert.match(bridge, /mountIncidenciasFollowupAvatars/);
assert.match(bridge, /syncIncidenciasCommentAvatars/);
assert.match(bridge, /syncIncidenciasFollowupAvatars/);
assert.match(bridge, /avatarEnhancementsReady/);

/* Las capas importadas siguen siendo las autoridades canónicas de identidad. */
assert.match(avatarFallback, /export function syncIncidenciasCommentAvatars/);
assert.match(followupAvatars, /import\s+["']\.\/style\.css["']/);
assert.match(
  followupAvatars,
  /\.incidencias-modal-description-comment-head/
);
assert.match(followupAvatars, /export function syncIncidenciasFollowupAvatars/);

/* El modal real vive fuera del host técnico oculto. */
assert.match(incidencias, /document\.body\.appendChild\(\s*modalHost\s*\)/);
assert.match(incidencias, /data-incidencias-modal-host/);

console.log("facturas direct incidencia modal contract: ok");
