/* =========================================================
   Entity Overlay Adapter - Usuario
========================================================= */

import { AppCore } from "../../../core/index.js";

import {
  loadUsuarioDetail,
  normalizeUsuarioModel,
} from "../../../views/usuarios/usuarios.api.js";

import {
  openUsuariosModal,
  closeUsuariosModal,
  updateUsuariosModal,
} from "../../../views/usuarios/usuarios.template.modal.js";

export const ENTITY_USUARIO_ADAPTER_VERSION =
  "entity-overlay.usuario.v1";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function eventPayload(event = null) {
  const detail =
    event?.detail?.detail ||
    event?.detail?.payload ||
    event?.detail ||
    event?.payload ||
    {};

  return detail && typeof detail === "object"
    ? detail
    : {};
}

export async function createEntityAdapter({
  service = null,
} = {}) {
  let adapter = null;
  let suppressClose = false;
  let closeNotified = false;
  let currentUserId = "";
  let refreshTask = null;

  const onClosed = (event) => {
    if (suppressClose || closeNotified) {
      return;
    }

    closeNotified = true;

    void service?._adapterClosed?.(
      adapter,
      {
        ...eventPayload(event),
        reason: "usuario-user-close",
      }
    );
  };

  const onRefresh = (event) => {
    const payload = eventPayload(event);
    const userId = cleanText(
      payload.userId ||
      payload.usuarioId ||
      currentUserId
    );

    if (!userId || refreshTask) {
      return;
    }

    refreshTask = Promise.resolve()
      .then(() =>
        loadUsuarioDetail(
          userId,
          {
            force: true,
            dedupe: true,
            allowCacheFallback: true,
          }
        )
      )
      .then((detail) => {
        if (!detail) return false;
        return updateUsuariosModal(
          normalizeUsuarioModel(detail)
        );
      })
      .finally(() => {
        refreshTask = null;
      });
  };

  for (const target of [
    isBrowser() ? window : null,
    isBrowser() ? document : null,
  ]) {
    target?.addEventListener?.(
      "usuarios:modal:closed",
      onClosed
    );
    target?.addEventListener?.(
      "usuarios:modal:refresh",
      onRefresh
    );
  }

  try {
    AppCore?.events?.on?.(
      "usuarios:modal:closed",
      onClosed
    );
    AppCore?.events?.on?.(
      "usuarios:modal:refresh",
      onRefresh
    );
  } catch {
    // CustomEvent sigue activo
  }

  adapter = Object.freeze({
    type: "usuario",
    version: ENTITY_USUARIO_ADAPTER_VERSION,

    async open({
      descriptor = {},
    } = {}) {
      closeNotified = false;
      currentUserId = descriptor.id;

      const detail = await loadUsuarioDetail(
        descriptor.id,
        {
          force: true,
          dedupe: true,
          allowCacheFallback: true,
        }
      );

      if (!detail) {
        return false;
      }

      return (
        openUsuariosModal(
          normalizeUsuarioModel(detail)
        ) !== false
      );
    },

    async close({
      restoreFocus = false,
    } = {}) {
      suppressClose = true;

      try {
        return closeUsuariosModal({
          emit: false,
          restoreFocus,
        });
      } finally {
        suppressClose = false;
        currentUserId = "";
      }
    },

    destroy() {
      suppressClose = true;

      try {
        closeUsuariosModal({
          emit: false,
          restoreFocus: false,
        });
      } finally {
        suppressClose = false;
        currentUserId = "";
      }

      for (const target of [
        isBrowser() ? window : null,
        isBrowser() ? document : null,
      ]) {
        target?.removeEventListener?.(
          "usuarios:modal:closed",
          onClosed
        );
        target?.removeEventListener?.(
          "usuarios:modal:refresh",
          onRefresh
        );
      }

      try {
        AppCore?.events?.off?.(
          "usuarios:modal:closed",
          onClosed
        );
        AppCore?.events?.off?.(
          "usuarios:modal:refresh",
          onRefresh
        );
      } catch {
        // noop
      }

      return true;
    },
  });

  return adapter;
}

export default createEntityAdapter;
