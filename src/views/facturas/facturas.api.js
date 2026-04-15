/* =========================================================
   Onion SPA - Facturas API
   Archivo: src/views/facturas/facturas.api.js

   Responsabilidades:
   - centralizar las llamadas HTTP del módulo de facturas
   - exponer operaciones de listado, detalle, pdf y envío
   - aislar la vista del acceso directo al apiClient
   - mantener endpoints y timeouts en un único punto
========================================================= */

import { AppCore } from "../../core/index.js";

const FACTURAS_ENDPOINT = "/api/facturas";
const FACTURAS_TIMEOUT = 15000;
const FACTURAS_SEND_TIMEOUT = 20000;

function getApiClient() {
  const client = AppCore?.apiClient;

  if (!client) {
    throw new Error("FACTURAS_API_CLIENT_UNAVAILABLE");
  }

  return client;
}

function getFacturaEndpoint(id = "") {
  const facturaId = String(id ?? "").trim();

  if (!facturaId) {
    throw new Error("FACTURA_ID_REQUIRED");
  }

  return `${FACTURAS_ENDPOINT}/${encodeURIComponent(facturaId)}`;
}

export async function fetchFacturasRequest() {
  return getApiClient().get(FACTURAS_ENDPOINT, {
    timeout: FACTURAS_TIMEOUT,
    auth: true,
  });
}

export async function fetchFacturaDetailRequest(id) {
  return getApiClient().get(getFacturaEndpoint(id), {
    timeout: FACTURAS_TIMEOUT,
    auth: true,
  });
}

export async function fetchFacturaPdfUrlRequest(id, disposition = "attachment") {
  const endpoint =
    disposition === "inline"
      ? `${getFacturaEndpoint(id)}/pdf?disposition=inline`
      : `${getFacturaEndpoint(id)}/descargar?disposition=attachment`;

  return getApiClient().get(endpoint, {
    timeout: FACTURAS_TIMEOUT,
    auth: true,
  });
}

export async function sendFacturaRequest(id) {
  return getApiClient().post(
    `${getFacturaEndpoint(id)}/enviar`,
    {},
    {
      timeout: FACTURAS_SEND_TIMEOUT,
      auth: true,
    }
  );
}
