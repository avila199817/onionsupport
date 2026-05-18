/* =========================================================
   Onion SPA - Reset Password Confirm View
   Archivo: src/views/password-reset/confirm/confirmView.js

   Responsabilidad:
   - Bridge mínimo para la ruta legacy confirm.
   - Delegar el flujo real en ../resetPasswordView.js.
   - Forzar mode="confirm".
   - Extraer token básico desde URL/deps.
   - Sin fetch directo.
   - Sin Router propio.
   - Sin Toast.
   - Sin bridge.
   - Sin DOM propio.
   - Sin AppCore cleanup.
   - Sin logs.
   - Sin magia negra.
========================================================= */

import PasswordResetView, {
  renderResetPasswordView,
} from "../resetPasswordView.js";

export const CONFIRM_RESET_PASSWORD_VIEW_VERSION = "minimal-1";

let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isContainer(value) {
  return Boolean(value && typeof value.querySelector === "function");
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

/* =========================================================
   TOKEN
========================================================= */

function normalizeToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";

  if (
    ["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
      token.toLowerCase()
    )
  ) {
    return "";
  }

  return token;
}

function tokenFromSearch(search = "") {
  const raw = text(search, "");
  if (!raw) return "";

  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);

    return (
      normalizeToken(params.get("token")) ||
      normalizeToken(params.get("resetToken")) ||
      normalizeToken(params.get("passwordResetToken")) ||
      normalizeToken(params.get("code")) ||
      normalizeToken(params.get("t"))
    );
  } catch {
    return "";
  }
}

function tokenFromHash(hash = "") {
  const raw = text(hash, "");
  if (!raw) return "";

  const query = raw.includes("?")
    ? raw.split("?").slice(1).join("?")
    : "";

  return tokenFromSearch(query);
}

function tokenFromPath(pathname = "") {
  const path = text(pathname, "");
  if (!path) return "";

  try {
    const parts = path.split("/").filter(Boolean);
    const index = parts.findIndex((part, position) => {
      return (
        part === "reset-password" &&
        parts[position + 1] === "confirm"
      );
    });

    return normalizeToken(index >= 0 ? decodeURIComponent(parts[index + 2] || "") : "");
  } catch {
    return "";
  }
}

function tokenFromUrl() {
  if (!isBrowser()) return "";

  try {
    return (
      tokenFromSearch(window.location.search) ||
      tokenFromHash(window.location.hash) ||
      tokenFromPath(window.location.pathname)
    );
  } catch {
    return "";
  }
}

function resolveToken(deps = {}) {
  return normalizeToken(
    deps.token ||
      deps.resetToken ||
      deps.passwordResetToken ||
      deps.code ||
      deps.t ||
      tokenFromUrl()
  );
}

/* =========================================================
   ARGS
========================================================= */

function resolveArgs(arg1 = null, arg2 = {}) {
  if (isContainer(arg1)) {
    return {
      container: arg1,
      deps: isObject(arg2) ? arg2 : {},
    };
  }

  return {
    container: null,
    deps: isObject(arg1) ? arg1 : {},
  };
}

function buildDeps(deps = {}) {
  return {
    ...deps,
    mode: "confirm",
    flow: "confirm",
    isConfirm: true,
    token: resolveToken(deps),
  };
}

/* =========================================================
   PUBLIC API
========================================================= */

export function render(arg1 = null, arg2 = {}) {
  const { container, deps } = resolveArgs(arg1, arg2);

  lastInstance = renderResetPasswordView(
    container,
    buildDeps(deps)
  );

  return lastInstance;
}

export function init(arg1 = null, arg2 = {}) {
  return render(arg1, arg2);
}

export function mount(arg1 = null, arg2 = {}) {
  return render(arg1, arg2);
}

export function destroy(options = {}) {
  try {
    return Boolean(lastInstance?.destroy?.(options));
  } catch {
    return false;
  }
}

export function unmount(options = {}) {
  return destroy(options);
}

export function getState() {
  return getSnapshot();
}

export function getSnapshot() {
  if (lastInstance?.getSnapshot) {
    return {
      ...lastInstance.getSnapshot(),
      version: CONFIRM_RESET_PASSWORD_VIEW_VERSION,
      confirmBridge: true,
    };
  }

  return {
    version: CONFIRM_RESET_PASSWORD_VIEW_VERSION,
    mounted: false,
    mode: "confirm",
    hasToken: Boolean(resolveToken()),
    confirmBridge: true,
  };
}

export const getDebugSnapshot = getSnapshot;

/* =========================================================
   FACADE
========================================================= */

export const ConfirmResetPasswordView = Object.assign(
  function ConfirmResetPasswordViewCompat(container, deps = {}) {
    return render(container, deps);
  },
  {
    version: CONFIRM_RESET_PASSWORD_VIEW_VERSION,

    render,
    init,
    mount,

    destroy,
    unmount,

    getState,
    getSnapshot,
    getDebugSnapshot,
  }
);

export default ConfirmResetPasswordView;
