import assert from "node:assert/strict";

import {
  INCIDENCIAS_TEMPLATE_VERSION,
  renderIncidenciasTemplate,
} from "../../src/views/incidencias/incidencias.template.js";

function renderItem(overrides = {}) {
  return renderIncidenciasTemplate({
    canonical: true,
    total: 1,
    items: [
      {
        id: "INC-DATETIME-CONTRACT",
        subject: "Precisión temporal visible",
        description: "Contrato de fecha y hora para la vista de incidencias.",
        status: "open",
        priority: "medium",
        createdAt: "2026-09-02T08:07:00.000Z",
        updatedAt: "2026-09-02T09:11:00.000Z",
        ...overrides,
      },
    ],
  });
}

function cell(html, column) {
  return (
    html.match(
      new RegExp(`<td[^>]*data-column="${column}"[^>]*>([\\s\\S]*?)<\\/td>`)
    )?.[1] || ""
  );
}

assert.match(
  INCIDENCIAS_TEMPLATE_VERSION,
  /visible-date-minute-precision/,
  "la versión de template debe declarar la precisión visible de minutos"
);

const historicalHtml = renderItem();
const createdCell = cell(historicalHtml, "created");
const historicalUpdatedCell = cell(historicalHtml, "updated");

assert.match(
  createdCell,
  /·\s*\d{2}:\d{2}/,
  "Creada debe mostrar hora y minuto junto a la fecha"
);
assert.match(
  historicalUpdatedCell,
  /·\s*\d{2}:\d{2}/,
  "Última novedad histórica debe mostrar hora y minuto junto a la fecha"
);

const recentUpdatedAt = new Date(Date.now() - 90 * 60 * 1000).toISOString();
const recentHtml = renderItem({ updatedAt: recentUpdatedAt });
const recentUpdatedCell = cell(recentHtml, "updated");

assert.match(
  recentUpdatedCell,
  /hace\s+\d+\s+h\s*·\s*\d{2}:\d{2}/,
  "Última novedad relativa debe conservar la antigüedad y añadir la hora exacta"
);

console.log("INCIDENCIAS_DATETIME_CONTRACT_OK");
