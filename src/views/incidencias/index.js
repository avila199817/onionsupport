/* =========================================================
   Onion Support - Incidencias View Boundary
   Archivo: /src/views/incidencias/index.js

   CONTROLLER 1:1 · CREATE USER COMBOBOX ENHANCEMENT

   La implementación completa y estable permanece en index.impl.js.
   Esta frontera añade únicamente el contrato accesible del selector de
   usuario de Create y garantiza su cleanup junto al controller existente.
========================================================= */

import * as Impl from "./index.impl.js";
import {
  installIncidenciasCreateUserCombobox,
  INCIDENCIAS_CREATE_USER_COMBOBOX_VERSION,
} from "./incidencias.create-user-combobox.js";

export const INCIDENCIAS_INDEX_VERSION =
  `${Impl.INCIDENCIAS_INDEX_VERSION}.create-user-combobox`;

export const INCIDENCIAS_VIEW_VERSION =
  INCIDENCIAS_INDEX_VERSION;

export async function IncidenciasView(host = null, context = {}) {
  const controller = await Impl.IncidenciasView(host, context);
  if (!controller || controller.__incidenciasCreateUserComboboxInstalled === true) {
    return controller;
  }

  const documentLike = host?.ownerDocument ||
    (typeof document !== "undefined" ? document : null);

  const uninstallCombobox = installIncidenciasCreateUserCombobox({
    document: documentLike,
  });

  const originalDestroy = typeof controller.destroy === "function"
    ? controller.destroy.bind(controller)
    : null;

  Object.defineProperty(controller, "__incidenciasCreateUserComboboxInstalled", {
    value: true,
    configurable: true,
    enumerable: false,
  });

  controller.destroy = function destroyIncidenciasWithCombobox() {
    uninstallCombobox?.();
    return originalDestroy ? originalDestroy() : true;
  };

  return controller;
}

export const IncidenciasIndex = IncidenciasView;

export const openIncidenciaDetailById =
  Impl.openIncidenciaDetailById;

/*
  Impl.destroy() termina invocando el destroy del controller almacenado.
  Ese método queda decorado arriba, así que también limpia el combobox.
*/
export const destroy = Impl.destroy;
export const getSnapshot = Impl.getSnapshot;
export const getDebugSnapshot = Impl.getDebugSnapshot;

export function getIncidenciasViewBoundarySnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_VIEW_VERSION,
    implementationVersion: Impl.INCIDENCIAS_VIEW_VERSION,
    createUserComboboxVersion: INCIDENCIAS_CREATE_USER_COMBOBOX_VERSION,
    policy: Object.freeze({
      controllerImplementationPreserved1to1: true,
      comboboxInstalledPerController: true,
      comboboxCleanupOnDestroy: true,
      noSecondSelectionPath: true,
    }),
  });
}

export default IncidenciasView;
