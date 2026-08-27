import { createGenericRecordAdapter } from "./generic-record.js";

export const UsuarioEntityAdapter = createGenericRecordAdapter({
  type: "usuario",
  actionPrefixes: ["usuarios", "usuario", "user"],
  apiNames: [
    "getUsuarioById",
    "getUsuarioByIdRequest",
    "loadUsuarioDetail",
    "fetchUsuarioDetailRequest",
    "fetchUserById",
    "getUserById",
  ],
  rendererNames: [
    "renderUsuariosDetailModal",
    "renderUsuarioDetailModal",
    "renderUserDetailModal",
    "renderDetailModal",
  ],
  relationTypes: ["incidencia", "factura", "cliente"],
  moduleLoaders: [
    { kind: "api", load: () => import("../../../views/usuarios/usuarios.api.js") },
    { kind: "api", load: () => import("../../../views/usuarios/usuarios.api.base.js") },
    { kind: "template", load: () => import("../../../views/usuarios/usuarios.template.modal.js") },
    { kind: "template", load: () => import("../../../views/usuarios/usuarios.template.js") },
  ],
});

export default UsuarioEntityAdapter;
