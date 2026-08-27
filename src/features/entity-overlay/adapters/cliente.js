import { createGenericRecordAdapter } from "./generic-record.js";

export const ClienteEntityAdapter = createGenericRecordAdapter({
  type: "cliente",
  actionPrefixes: ["clientes", "cliente", "client"],
  apiNames: [
    "getClienteById",
    "getClienteByIdRequest",
    "loadClienteDetail",
    "fetchClienteDetailRequest",
    "fetchClienteById",
  ],
  rendererNames: [
    "renderClientesDetailModal",
    "renderClienteDetailModal",
    "renderClientDetailModal",
    "renderDetailModal",
  ],
  relationTypes: ["incidencia", "factura", "usuario"],
  moduleLoaders: [
    { kind: "api", load: () => import("../../../views/clientes/clientes.api.js") },
    { kind: "api", load: () => import("../../../views/clientes/clientes.api.base.js") },
    { kind: "template", load: () => import("../../../views/clientes/clientes.template.modal.js") },
  ],
});

export default ClienteEntityAdapter;
