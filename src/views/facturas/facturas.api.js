import { AppCore } from "../../core/index.js";

const ENDPOINT = "/api/facturas";

function getApiClient() {
  return AppCore.apiClient;
}

export async function fetchFacturas() {
  return getApiClient().get(ENDPOINT, {
    timeout: 15000,
    auth: true,
  });
}

export async function fetchFacturaDetail(id) {
  return getApiClient().get(`${ENDPOINT}/${encodeURIComponent(id)}`, {
    timeout: 15000,
    auth: true,
  });
}

export async function fetchFacturaPdfUrl(id, disposition = "attachment") {
  const endpoint =
    disposition === "inline"
      ? `${ENDPOINT}/${encodeURIComponent(id)}/pdf?disposition=inline`
      : `${ENDPOINT}/${encodeURIComponent(id)}/descargar?disposition=attachment`;

  return getApiClient().get(endpoint, {
    timeout: 15000,
    auth: true,
  });
}

export async function sendFacturaRequest(id) {
  return getApiClient().post(
    `${ENDPOINT}/${encodeURIComponent(id)}/enviar`,
    {},
    {
      timeout: 20000,
      auth: true,
    }
  );
}
