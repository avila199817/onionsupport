/* =========================================================
   Onion Support - Incidencias View Boundary
   Archivo: /src/views/incidencias/index.js

   CONTROLLER 1:1 · PROGRESSIVE ENHANCEMENTS

   La implementación completa y estable permanece en index.impl.js.
   Esta frontera instala únicamente enhancements DOM acotados y garantiza
   su cleanup junto al controller existente.
========================================================= */

import { AppCore } from "../../core/index.js";
import * as Impl from "./index.impl.js";
import {
  installIncidenciasCreateUserCombobox,
  INCIDENCIAS_CREATE_USER_COMBOBOX_VERSION,
} from "./incidencias.create-user-combobox.js";
import {
  installIncidenciasStatsScope,
  INCIDENCIAS_STATS_SCOPE_VERSION,
} from "./incidencias.stats-scope.js";
import {
  installIncidenciasDetailAttachmentPolicy,
  INCIDENCIAS_DETAIL_ATTACHMENT_POLICY_VERSION,
} from "./incidencias.detail-attachment-policy.js";
import {
  installIncidenciasHotList,
  INCIDENCIAS_HOT_LIST_VERSION,
} from "./incidencias.hot-list.js";

export const INCIDENCIAS_INDEX_VERSION =
  `${Impl.INCIDENCIAS_INDEX_VERSION}.create-user-combobox.truthful-loaded-stats.detail-attachment-policy.hot-list`;

export const INCIDENCIAS_VIEW_VERSION =
  INCIDENCIAS_INDEX_VERSION;

function resolveBoundaryRole() {
  const runtimeState = AppCore.runtimeState.read();
  const implementationSnapshot = Impl.getSnapshot?.() || {};
  const runtimeUser = runtimeState?.user || runtimeState?.auth?.user || {};

  return AppCore.normalizeRole(
    implementationSnapshot.role ||
    runtimeState?.role ||
    runtimeState?.rol ||
    runtimeUser.role ||
    runtimeUser.rol ||
    "user"
  );
}

export async function IncidenciasView(host = null, context = {}) {
  const controller = await Impl.IncidenciasView(host, context);
  if (!controller || controller.__incidenciasViewEnhancementsInstalled === true) {
    return controller;
  }

  const documentLike = host?.ownerDocument ||
    (typeof document !== "undefined" ? document : null);

  const uninstallCombobox = installIncidenciasCreateUserCombobox({
    document: documentLike,
  });

  const uninstallStatsScope = installIncidenciasStatsScope({
    host,
    document: documentLike,
  });

  const uninstallDetailAttachmentPolicy = installIncidenciasDetailAttachmentPolicy({
    document: documentLike,
    getRole: resolveBoundaryRole,
  });

  const uninstallHotList = installIncidenciasHotList({
    host,
    document: documentLike,
  });

  const originalDestroy = typeof controller.destroy === "function"
    ? controller.destroy.bind(controller)
    : null;

  for (const key of [
    "__incidenciasViewEnhancementsInstalled",
    "__incidenciasCreateUserComboboxInstalled",
    "__incidenciasStatsScopeInstalled",
    "__incidenciasDetailAttachmentPolicyInstalled",
    "__incidenciasHotListInstalled",
  ]) {
    Object.defineProperty(controller, key, {
      value: true,
      configurable: true,
      enumerable: false,
    });
  }

  controller.destroy = function destroyIncidenciasWithEnhancements() {
    uninstallHotList?.();
    uninstallDetailAttachmentPolicy?.();
    uninstallStatsScope?.();
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
  Ese método queda decorado arriba, así que también limpia los enhancements.
*/
export const destroy = Impl.destroy;
export const getSnapshot = Impl.getSnapshot;
export const getDebugSnapshot = Impl.getDebugSnapshot;

export function getIncidenciasViewBoundarySnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_VIEW_VERSION,
    implementationVersion: Impl.INCIDENCIAS_VIEW_VERSION,
    createUserComboboxVersion: INCIDENCIAS_CREATE_USER_COMBOBOX_VERSION,
    statsScopeVersion: INCIDENCIAS_STATS_SCOPE_VERSION,
    detailAttachmentPolicyVersion: INCIDENCIAS_DETAIL_ATTACHMENT_POLICY_VERSION,
    hotListVersion: INCIDENCIAS_HOT_LIST_VERSION,
    role: resolveBoundaryRole(),
    policy: Object.freeze({
      controllerImplementationPreserved1to1: true,
      enhancementsInstalledPerController: true,
      enhancementsCleanupOnDestroy: true,
      noSecondSelectionPath: true,
      truthfulLoadedStats: true,
      detailAttachmentLimitsEarly: true,
      canonicalRoleAuthority: true,
      zeroCopyRuntimeState: true,
      searchFocusAndCaretStableAcrossListReconciliation: true,
      hotListOwnsNoBusinessState: true,
    }),
  });
}

export default IncidenciasView;
