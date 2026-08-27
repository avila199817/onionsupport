/* =========================================================
   Onion Support - Generic Entity Overlay Record Adapter
========================================================= */

import { AppCore } from "../../../core/index.js";

import {
  actionFromNode,
  cleanText,
  entityIdFromData,
  importFirst,
  isAdminRole,
  pickFunction,
  pickRenderer,
  relationId,
  renderAdapterError,
  renderGenericDetail,
  safeArray,
  safeError,
  unwrapEntity,
} from "./adapter-utils.js";

export const GENERIC_RECORD_ADAPTER_VERSION =
  "entity-adapter.generic-record.v1";

function titleFor(type = "entidad", data = {}, id = "") {
  const label = cleanText(
    data?.displayName ||
      data?.name ||
      data?.nombre ||
      data?.companyName ||
      data?.empresa ||
      data?.email ||
      "",
    ""
  );

  return label || `${type} ${id}`;
}

export function createGenericRecordAdapter(config = {}) {
  const type = cleanText(config.type, "entidad").toLowerCase();
  const prefixes = safeArray(config.actionPrefixes);
  const apiNames = safeArray(config.apiNames);
  const rendererNames = safeArray(config.rendererNames);
  const moduleLoaders = safeArray(config.moduleLoaders);
  const relationTypes = safeArray(config.relationTypes);

  let modulesPromise = null;

  async function modules() {
    if (!modulesPromise) {
      modulesPromise = Promise.all([
        importFirst(moduleLoaders.filter((entry) => entry.kind === "api").map((entry) => entry.load)),
        importFirst(moduleLoaders.filter((entry) => entry.kind === "template").map((entry) => entry.load))
          .catch(() => ({})),
      ]).then(([api, template]) => ({ api, template }));
    }

    return modulesPromise;
  }

  async function load({ id = "", signal = null } = {}) {
    const { api } = await modules();
    const loader = pickFunction(
      api,
      apiNames,
      new RegExp(`(?:get|load|fetch).*(?:${type}).*(?:detail|byid|request)`, "i")
    );

    if (typeof loader !== "function") {
      throw new Error(`${type.toUpperCase()}_DETAIL_LOADER_MISSING`);
    }

    const result = await loader(id, {
      signal,
      source: "entity-overlay",
    });

    const item = unwrapEntity(result, type);
    if (!item) throw new Error(`${type.toUpperCase()}_NOT_FOUND`);
    return item;
  }

  async function render(context = {}) {
    if (context.error) {
      return renderAdapterError({
        type,
        id: context.id,
        error: safeError(context.error, `No se pudo cargar ${type}.`),
      });
    }

    const { template } = await modules();
    const renderer = pickRenderer(template, rendererNames);

    if (typeof renderer !== "function") {
      return renderGenericDetail({
        type,
        id: context.id,
        data: context.data,
        title: titleFor(type, context.data, context.id),
      });
    }

    const data = context.data || null;
    const feedback = context.feedback || null;

    return renderer({
      open: true,
      modalOpen: true,
      detailOpen: true,
      detailLoading: context.loading === true,
      loading: context.loading === true,
      item: data,
      detail: data,
      [type]: data,
      client: type === "cliente" ? data : undefined,
      user: type === "usuario" ? data : undefined,
      admin: isAdminRole(AppCore),
      readOnly: true,
      readonly: true,
      canEdit: false,
      embedded: true,
      entityOverlay: true,
      feedbackMessage: cleanText(feedback?.message, ""),
      feedbackType: cleanText(feedback?.type, "info"),
    });
  }

  async function handleAction({ node = null, data = null, overlay = null } = {}) {
    if (!overlay) return false;

    const action = actionFromNode(node, prefixes);
    if (!action) return false;

    if (action.includes("close") || action.includes("cerrar")) {
      overlay.close();
      return true;
    }

    if (action.includes("refresh") || action.includes("reload") || action.includes("actualizar")) {
      await overlay.reload();
      return true;
    }

    for (const relationType of relationTypes) {
      if (
        action.includes(relationType) ||
        (relationType === "factura" && action.includes("invoice")) ||
        (relationType === "incidencia" && action.includes("ticket")) ||
        (relationType === "cliente" && action.includes("client")) ||
        (relationType === "usuario" && action.includes("user"))
      ) {
        const linkedId = relationId(data, relationType, node);
        if (!linkedId) return true;

        await overlay.open({
          type: relationType,
          id: linkedId,
          source: `${type}.relation`,
        });
        return true;
      }
    }

    if (
      [
        "save",
        "edit",
        "delete",
        "disable",
        "enable",
        "reset",
        "password",
        "assign",
        "status",
      ].some((part) => action.includes(part))
    ) {
      overlay.setFeedback({
        type: "info",
        message: `La vista rápida de ${type} es de consulta.`,
      });
      return true;
    }

    return false;
  }

  function afterRender(root = null) {
    if (!root) return false;

    const panel = root.querySelector(
      `[data-${type}-detail-modal='true'], [data-${type}s-detail-modal='true'], [role='dialog']`
    );

    if (panel) {
      panel.dataset.entityOverlayPanel = "true";
      panel.dataset.entityType = type;
      panel.dataset.entityOverlayReadonly = "true";
      if (!panel.hasAttribute("tabindex")) panel.tabIndex = -1;
    }

    for (const node of root.querySelectorAll("button[data-action]")) {
      const action = actionFromNode(node, prefixes);
      if (
        ["save", "edit", "delete", "disable", "enable", "reset", "password"]
          .some((part) => action.includes(part))
      ) {
        node.disabled = true;
        node.setAttribute("aria-disabled", "true");
        node.dataset.entityOverlayDisabled = "true";
      }
    }

    return Boolean(panel);
  }

  return Object.freeze({
    type,
    version: `${GENERIC_RECORD_ADAPTER_VERSION}.${type}`,
    load,
    render,
    handleAction,
    afterRender,
    entityId: (data = {}, fallback = "") =>
      cleanText(entityIdFromData(type, data), fallback),
  });
}

export default createGenericRecordAdapter;
