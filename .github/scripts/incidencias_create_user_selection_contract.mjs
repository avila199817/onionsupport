import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  inferEntityIntentFromElement,
} from "../../src/features/entity-overlay/intent.js";

const read = (path) => readFileSync(path, "utf8");

const incidenciasApi = read(
  "src/views/incidencias/incidencias.api.impl.js"
);
const incidenciasIndex = read(
  "src/views/incidencias/index.js"
);
const incidenciasCreateTemplate = read(
  "src/views/incidencias/incidencias.template.create.js"
);
const entityIntent = read(
  "src/features/entity-overlay/intent.js"
);

/* =========================================================
   END-TO-END SEARCH CONTRACT
========================================================= */

assert.match(
  incidenciasApi,
  /export const USERS_SEARCH_ENDPOINT = "\/api\/users";/,
  "Crear incidencia debe buscar exclusivamente en /api/users"
);

assert.match(
  incidenciasApi,
  /getJson\(USERS_SEARCH_ENDPOINT,[\s\S]*source: "views\.incidencias\.users\.search"/,
  "La búsqueda admin de incidencias debe ejecutar USERS_SEARCH_ENDPOINT"
);

assert.match(
  incidenciasIndex,
  /searchIncidenciaUsers\(/,
  "El controlador de Incidencias debe usar searchIncidenciaUsers()"
);

assert.match(
  incidenciasIndex,
  /!createModal\.form\.targetUserId/,
  "El submit admin debe exigir un targetUserId real"
);

assert.match(
  incidenciasCreateTemplate,
  /data-create-action="\$\{CREATE_ACTIONS\.USER_SELECT\}"/,
  "Cada resultado debe ser una acción local de selección de usuario"
);

/* =========================================================
   GLOBAL ENTITY OVERLAY BOUNDARY
========================================================= */

assert.match(
  entityIntent,
  /\[data-entity-overlay-ignore='true'\], \[data-create-action\]/,
  "Entity Overlay debe reconocer la frontera de interacciones Create"
);

assert.match(
  entityIntent,
  /if \(blocksEntityIntentFromElement\(element\)\) return null;/,
  "La frontera Create debe evaluarse antes de inferir IDs de entidad"
);

function makeElement(dataset = {}) {
  const attrs = new Map([
    ["data-entity-overlay-ignore", dataset.entityOverlayIgnore || ""],
    ["data-entity-overlay-allow", dataset.entityOverlayAllow || ""],
    ["data-entity-overlay-action", dataset.entityOverlayAction || ""],
  ]);

  const node = {
    nodeType: 1,
    dataset: { ...dataset },
    textContent: "Usuario de prueba",
    getAttribute(name) {
      return attrs.get(name) || "";
    },
    closest(selector = "") {
      const source = String(selector);

      if (
        dataset.entityOverlayIgnore === "true" &&
        source.includes("[data-entity-overlay-ignore='true']")
      ) {
        return node;
      }

      if (
        dataset.createAction &&
        source.includes("[data-create-action]")
      ) {
        return node;
      }

      if (
        dataset.clienteId &&
        source.includes("[data-cliente-id]")
      ) {
        return node;
      }

      if (
        dataset.clientId &&
        source.includes("[data-client-id]")
      ) {
        return node;
      }

      if (
        dataset.usuarioId &&
        source.includes("[data-usuario-id]")
      ) {
        return node;
      }

      if (
        dataset.userId &&
        source.includes("[data-user-id]")
      ) {
        return node;
      }

      if (source.includes("button")) {
        return node;
      }

      return null;
    },
  };

  return node;
}

const createUserSelection = makeElement({
  createAction: "create-user-select",
  userId: "ON-202608300001",
  clienteId: "CLI-202608300001",
});

assert.equal(
  inferEntityIntentFromElement(createUserSelection),
  null,
  "Seleccionar usuario en Create Incidencia no puede abrir Cliente ni Usuario"
);

const normalClienteLink = makeElement({
  clienteId: "CLI-202608300001",
});

assert.deepEqual(
  inferEntityIntentFromElement(normalClienteLink),
  {
    type: "cliente",
    id: "CLI-202608300001",
    source: "dom",
  },
  "La protección Create no debe romper quick view de Cliente fuera de Create"
);

const normalUsuarioLink = makeElement({
  userId: "ON-202608300001",
});

assert.deepEqual(
  inferEntityIntentFromElement(normalUsuarioLink),
  {
    type: "usuario",
    id: "ON-202608300001",
    source: "dom",
  },
  "La protección Create no debe romper quick view de Usuario fuera de Create"
);

console.log(
  "Incidencias Create user-selection contract OK."
);
