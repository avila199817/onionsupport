/* =========================================================
   Onion SPA - Reset Password Toast Bridge
   Archivo: src/views/password-reset/toast.bridge.js

   Responsabilidades:
   - desacoplar la vista reset-password del sistema Toast global
   - exponer api homogénea tipo login
   - soportar fallback inline toast del DOM local
   - normalizar success / error / info / warning / loading
   - soportar dismiss por id
   - auto close configurable
   - mantener compatibilidad total con index.js
========================================================= */

import Toast from "../../ui/toast/index.js";

import {
  setResetPasswordToastVisibility,
  setResetPasswordToastContent,
  startResetPasswordToastProgress,
  resetResetPasswordToastProgress,
  hideResetPasswordToast,
} from "./reset-password.dom.js";

/* =========================================================
   INTERNAL STATE
========================================================= */

let sequence = 0;

function nextId() {
  sequence += 1;
  return `reset-toast-${Date.now()}-${sequence}`;
}

function isFunction(value) {
  return typeof value === "function";
}

function toText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num)
    ? num
    : fallback;
}

/* =========================================================
   GLOBAL TOAST BRIDGE
========================================================= */

function callGlobal(method, ...args) {
  try {
    if (isFunction(Toast?.[method])) {
      return Toast[method](...args);
    }
  } catch {}

  return null;
}

/* =========================================================
   INLINE LOCAL TOAST
========================================================= */

function showInlineToast(
  refs = {},
  {
    type = "info",
    title = "Aviso",
    message = "",
    duration = 4000,
    persist = false,
  } = {}
) {
  const id = nextId();

  setResetPasswordToastContent(refs, {
    type,
    title,
    message,
  });

  setResetPasswordToastVisibility(
    refs,
    true
  );

  resetResetPasswordToastProgress(
    refs
  );

  if (!persist) {
    startResetPasswordToastProgress(
      refs,
      duration
    );

    window.setTimeout(() => {
      hideResetPasswordToast(refs);
    }, duration);
  }

  return id;
}

/* =========================================================
   FACTORY
========================================================= */

export function createResetPasswordToastBridge(
  refs = {}
) {
  return {
    init() {
      try {
        if (isFunction(Toast?.init)) {
          Toast.init();
        }
      } catch {}

      return true;
    },

    success(
      message = "",
      options = {}
    ) {
      const text = toText(
        message,
        "Operación completada."
      );

      const globalId = callGlobal(
        "success",
        text,
        options
      );

      if (globalId) {
        return globalId;
      }

      return showInlineToast(refs, {
        type: "success",
        title: "Correcto",
        message: text,
        duration: toNumber(
          options?.duration,
          4200
        ),
      });
    },

    error(
      message = "",
      options = {}
    ) {
      const text = toText(
        message,
        "Se produjo un error."
      );

      const globalId = callGlobal(
        "error",
        text,
        options
      );

      if (globalId) {
        return globalId;
      }

      return showInlineToast(refs, {
        type: "error",
        title: "Error",
        message: text,
        duration: toNumber(
          options?.duration,
          5200
        ),
      });
    },

    info(
      message = "",
      options = {}
    ) {
      const text = toText(
        message,
        "Información."
      );

      const globalId = callGlobal(
        "info",
        text,
        options
      );

      if (globalId) {
        return globalId;
      }

      return showInlineToast(refs, {
        type: "info",
        title: "Aviso",
        message: text,
        duration: toNumber(
          options?.duration,
          4200
        ),
      });
    },

    warning(
      message = "",
      options = {}
    ) {
      const text = toText(
        message,
        "Atención."
      );

      const globalId = callGlobal(
        "warning",
        text,
        options
      );

      if (globalId) {
        return globalId;
      }

      return showInlineToast(refs, {
        type: "warning",
        title: "Atención",
        message: text,
        duration: toNumber(
          options?.duration,
          5000
        ),
      });
    },

    loading(
      message = "",
      options = {}
    ) {
      const text = toText(
        message,
        "Procesando..."
      );

      const globalId = callGlobal(
        "loading",
        text,
        options
      );

      if (globalId) {
        return globalId;
      }

      return showInlineToast(refs, {
        type: "info",
        title: "Procesando",
        message: text,
        persist: true,
      });
    },

    dismiss(id = null) {
      callGlobal("dismiss", id);
      hideResetPasswordToast(refs);
      return true;
    },

    hide() {
      hideResetPasswordToast(refs);
      return true;
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default createResetPasswordToastBridge;
