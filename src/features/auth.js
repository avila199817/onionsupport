/* =========================================================
   Onion SPA - Auth / Session
   Archivo: src/features/auth.js

   Responsabilidades:
   - login
   - logout
   - restaurar sesión
   - cargar usuario actual
   - validar acceso por rol
   - exponer helpers auth para toda la SPA

   IMPORTANTE:
   Si tu backend usa otras rutas, cambia SOLO el bloque ENDPOINTS.
========================================================= */

import { AppCore } from "../core/core.js";

export const Auth = (() => {
  "use strict";

  /* =========================================================
     ENDPOINTS
     Ajusta aquí si tu API usa otras rutas.
  ========================================================= */
  const ENDPOINTS = {
    login: "/auth/login",
    logout: "/auth/logout",
    me: "/auth/me",
    refresh: "/auth/refresh",
  };

  /* =========================================================
     ESTADO INTERNO
  ========================================================= */
  const session = {
    restoring: false,
    checking: false,
    refreshing: false,
    lastCheckAt: null,
    lastRefreshAt: null,
  };

  /* =========================================================
     HELPERS
  ========================================================= */
  function sanitizeUsername(value = "") {
    return AppCore.utils.sanitizeUsername
      ? AppCore.utils.sanitizeUsername(value)
      : String(value || "")
          .trim()
          .replace(/^@+/, "")
          .replace(/\s+/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "")
          .toLowerCase();
  }

  function normalizeUser(rawUser) {
    if (!rawUser || typeof rawUser !== "object") return null;

    const username = sanitizeUsername(
      rawUser.username ??
      rawUser.userName ??
      rawUser.nick ??
      rawUser.alias ??
      rawUser.login ??
      ""
    );

    return {
      id: rawUser.id ?? rawUser.user_id ?? rawUser.uuid ?? rawUser._id ?? null,

      username,

      name:
        rawUser.name ??
        rawUser.nombre ??
        rawUser.full_name ??
        rawUser.fullName ??
        rawUser.display_name ??
        rawUser.displayName ??
        rawUser.username ??
        rawUser.email ??
        "Usuario",

      email: rawUser.email ?? rawUser.mail ?? null,

      role:
        rawUser.role ??
        rawUser.rol ??
        rawUser.type ??
        rawUser.user_type ??
        rawUser.userType ??
        null,

      avatar:
        rawUser.avatar ??
        rawUser.photo ??
        rawUser.image ??
        rawUser.picture ??
        null,

      active:
        rawUser.active ??
        rawUser.is_active ??
        rawUser.isActive ??
        true,

      raw: rawUser,
    };
  }

  function extractToken(payload) {
    if (!payload) return null;

    return (
      payload.token ||
      payload.access_token ||
      payload.accessToken ||
      payload.jwt ||
      payload.id_token ||
      payload.data?.token ||
      payload.data?.access_token ||
      payload.data?.accessToken ||
      payload.data?.jwt ||
      payload.meta?.token ||
      null
    );
  }

  function extractRefreshToken(payload) {
    if (!payload) return null;

    return (
      payload.refresh_token ||
      payload.refreshToken ||
      payload.data?.refresh_token ||
      payload.data?.refreshToken ||
      null
    );
  }

  function extractUser(payload) {
    if (!payload) return null;

    return normalizeUser(
      payload.user ||
      payload.data?.user ||
      payload.me ||
      payload.data?.me ||
      payload.profile ||
      payload.data?.profile ||
      payload.account ||
      payload.data?.account ||
      null
    );
  }

  function extractMessage(error) {
    if (!error) return "Error de autenticación";

    if (typeof error === "string") return error;
    if (error.data?.message) return error.data.message;
    if (error.data?.error) return error.data.error;
    if (typeof error.data === "string") return error.data;
    if (error.message) return error.message;

    return "Error de autenticación";
  }

  function resolveLoginIdentifier(credentials = {}) {
    return String(
      credentials.email ??
      credentials.username ??
      credentials.user ??
      credentials.identifier ??
      ""
    ).trim();
  }

  function normalizeLoginPayload(credentials = {}) {
    const identifier = resolveLoginIdentifier(credentials);
    const password = String(credentials.password ?? credentials.pass ?? "").trim();
    const remember = Boolean(credentials.remember);

    return {
      identifier,
      password,
      remember,
    };
  }

  function buildLoginRequestBody(credentials = {}) {
    const { identifier, password, remember } = normalizeLoginPayload(credentials);

    return {
      email: identifier,
      username: identifier,
      identifier,
      password,
      remember,
    };
  }

  function hasValidToken() {
    return Boolean(AppCore.state.token && String(AppCore.state.token).trim());
  }

  function isAuthenticated() {
    return hasValidToken();
  }

  function getCurrentRole() {
    return String(AppCore.state.role || "").trim().toLowerCase();
  }

  function hasRole(...roles) {
    if (!roles.length) return true;

    const currentRole = getCurrentRole();
    if (!currentRole) return false;

    return roles
      .flat()
      .map((role) => String(role || "").trim().toLowerCase())
      .filter(Boolean)
      .includes(currentRole);
  }

  function requireRole(...roles) {
    return isAuthenticated() && hasRole(...roles);
  }

  function getAuthHeader() {
    if (!hasValidToken()) return {};

    return {
      Authorization: `Bearer ${AppCore.state.token}`,
    };
  }

  function getCurrentCanonicalPath() {
    const rawPath = window.location.pathname || "/";
    const normalizer =
      AppCore.utils.normalizeCanonicalPath || AppCore.utils.normalizePath;

    return normalizer(rawPath);
  }

  function isAuthRoute(pathname = window.location.pathname) {
    const normalizer =
      AppCore.utils.normalizeCanonicalPath || AppCore.utils.normalizePath;

    const path = String(normalizer(pathname || "/")).toLowerCase();

    return (
      path === "/login" ||
      path === "/signin" ||
      path === "/auth" ||
      path === "/auth/login"
    );
  }

  function configLikeRoute(path = "/") {
    return AppCore.utils.normalizePath(path || "/");
  }

  function buildLoginRedirectPath(targetPath = null) {
    const loginPath = configLikeRoute(
      AppCore.config?.routes?.login || "/login"
    );

    const canonicalTarget = configLikeRoute(
      targetPath || getCurrentCanonicalPath() || "/"
    );

    if (!canonicalTarget || canonicalTarget === "/login") {
      return loginPath;
    }

    const url = new URL(window.location.origin + loginPath);
    url.searchParams.set("redirect", canonicalTarget);

    return `${url.pathname}${url.search}`;
  }

  function validateAuthResponse(response) {
    const token = extractToken(response);
    const user = extractUser(response);

    if (!token && !user) {
      throw new Error("La respuesta del API no contiene una sesión válida.");
    }

    return {
      token,
      user,
      refreshToken: extractRefreshToken(response),
      response,
    };
  }

  function buildSessionSnapshot(extra = {}) {
    return {
      authenticated: AppCore.state.authenticated,
      token: AppCore.state.token,
      user: AppCore.state.user,
      role: AppCore.state.role,
      ...extra,
    };
  }

  /* =========================================================
     SESIÓN LOCAL
  ========================================================= */
  function applySession({ token = undefined, user = undefined } = {}) {
    const normalizedUser = user === undefined ? undefined : normalizeUser(user);

    if (token !== undefined) {
      AppCore.setToken(token || null);
    }

    if (user !== undefined) {
      AppCore.setUser(normalizedUser || null);
    }

    const snapshot = buildSessionSnapshot();

    AppCore.events.emit("auth:session:applied", snapshot);

    return snapshot;
  }

  function clearSessionLocal() {
    AppCore.clearSession();

    AppCore.events.emit("auth:session:cleared", {
      authenticated: false,
      token: null,
      user: null,
      role: null,
    });
  }

  /* =========================================================
     LOGIN
  ========================================================= */
  async function login(credentials = {}) {
    const payload = normalizeLoginPayload(credentials);

    if (!payload.identifier || !payload.password) {
      const error = new Error("Usuario/email y contraseña son obligatorios.");
      AppCore.setError(error);
      throw error;
    }

    AppCore.events.emit("auth:login:start", {
      identifier: payload.identifier,
    });

    try {
      const response = await AppCore.apiClient.post(
        ENDPOINTS.login,
        buildLoginRequestBody(credentials),
        {
          auth: false,
        }
      );

      const { token, user } = validateAuthResponse(response);

      const snapshot = applySession({
        token: token ?? null,
        user: user ?? null,
      });

      if (!snapshot.token) {
        throw new Error("El login devolvió usuario pero no devolvió token.");
      }

      AppCore.events.emit("auth:login:success", {
        ...snapshot,
        response,
      });

      return {
        ok: true,
        ...snapshot,
        response,
      };
    } catch (error) {
      clearSessionLocal();

      AppCore.events.emit("auth:login:error", {
        error,
        message: extractMessage(error),
      });

      throw error;
    }
  }

  /* =========================================================
     GET CURRENT USER
  ========================================================= */
  async function fetchMe() {
    if (!hasValidToken()) {
      throw new Error("No hay token disponible para consultar /me.");
    }

    session.checking = true;

    AppCore.events.emit("auth:me:start", {});

    try {
      const response = await AppCore.apiClient.get(ENDPOINTS.me, {
        auth: true,
      });

      const user =
        normalizeUser(response?.user) ||
        normalizeUser(response?.data?.user) ||
        normalizeUser(response?.me) ||
        normalizeUser(response?.data?.me) ||
        normalizeUser(response?.profile) ||
        normalizeUser(response?.data?.profile) ||
        normalizeUser(response);

      if (!user) {
        throw new Error("No se pudo resolver el usuario actual.");
      }

      AppCore.setUser(user);
      session.lastCheckAt = Date.now();

      AppCore.events.emit("auth:me:success", {
        user,
      });

      return user;
    } catch (error) {
      AppCore.events.emit("auth:me:error", {
        error,
        message: extractMessage(error),
      });

      throw error;
    } finally {
      session.checking = false;
    }
  }

  /* =========================================================
     REFRESH TOKEN
  ========================================================= */
  async function refreshSession() {
    if (!hasValidToken()) {
      throw new Error("No hay token para intentar refresh.");
    }

    if (session.refreshing) {
      return {
        ok: AppCore.state.authenticated,
        token: AppCore.state.token,
        user: AppCore.state.user,
      };
    }

    session.refreshing = true;

    AppCore.events.emit("auth:refresh:start", {});

    try {
      const response = await AppCore.apiClient.post(
        ENDPOINTS.refresh,
        null,
        {
          auth: true,
        }
      );

      const nextToken = extractToken(response);
      const nextUser = extractUser(response);

      if (!nextToken && !nextUser) {
        throw new Error("La respuesta de refresh no contiene datos de sesión.");
      }

      const snapshot = applySession({
        token: nextToken ?? AppCore.state.token,
        user: nextUser ?? AppCore.state.user,
      });

      if (!snapshot.token) {
        throw new Error("Refresh completado sin token válido.");
      }

      session.lastRefreshAt = Date.now();

      AppCore.events.emit("auth:refresh:success", {
        ...snapshot,
        response,
      });

      return {
        ok: true,
        ...snapshot,
        response,
      };
    } catch (error) {
      AppCore.events.emit("auth:refresh:error", {
        error,
        message: extractMessage(error),
      });

      throw error;
    } finally {
      session.refreshing = false;
    }
  }

  /* =========================================================
     RESTAURAR SESIÓN
  ========================================================= */
  async function restoreSession() {
    if (session.restoring) {
      return {
        ok: AppCore.state.authenticated,
        user: AppCore.state.user,
      };
    }

    session.restoring = true;

    AppCore.events.emit("auth:restore:start", {
      hasToken: hasValidToken(),
      hasUser: Boolean(AppCore.state.user),
    });

    try {
      if (!hasValidToken()) {
        clearSessionLocal();

        AppCore.events.emit("auth:restore:empty", {
          reason: "missing-token",
        });

        return {
          ok: false,
          user: null,
        };
      }

      try {
        const user = await fetchMe();

        AppCore.events.emit("auth:restore:success", {
          user,
          source: "me",
        });

        return {
          ok: true,
          user,
        };
      } catch (meError) {
        AppCore.utils.warn(
          "fetchMe() falló en restoreSession(), intentando refresh.",
          meError
        );

        try {
          const refreshed = await refreshSession();

          if (!AppCore.state.user) {
            await fetchMe();
          }

          AppCore.events.emit("auth:restore:success", {
            user: AppCore.state.user,
            source: "refresh",
          });

          return {
            ok: true,
            user: AppCore.state.user,
            refreshed,
          };
        } catch (refreshError) {
          clearSessionLocal();

          AppCore.events.emit("auth:restore:error", {
            error: refreshError,
            message: extractMessage(refreshError),
          });

          return {
            ok: false,
            user: null,
            error: refreshError,
          };
        }
      }
    } finally {
      session.restoring = false;
    }
  }

  /* =========================================================
     LOGOUT
  ========================================================= */
  async function logout(options = {}) {
    const {
      silent = false,
      redirectTo = "/",
      notifyServer = true,
    } = options;

    AppCore.events.emit("auth:logout:start", {});

    try {
      if (notifyServer && hasValidToken()) {
        await AppCore.apiClient.post(
          ENDPOINTS.logout,
          null,
          {
            auth: true,
          }
        );
      }
    } catch (error) {
      AppCore.utils.warn(
        "Logout remoto falló, se limpiará sesión local igualmente.",
        error
      );
    } finally {
      clearSessionLocal();

      AppCore.events.emit("auth:logout:success", {
        redirectTo,
      });

      if (!silent && typeof window !== "undefined") {
        const nextPath = configLikeRoute(redirectTo);
        window.history.replaceState({}, "", nextPath);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    }

    return {
      ok: true,
    };
  }

  /* =========================================================
     GUARDS
  ========================================================= */
  function guardAuthenticated(options = {}) {
    const {
      redirectTo = "/login",
      hardRedirect = false,
      withRedirectBack = true,
    } = options;

    if (isAuthenticated()) return true;

    const currentPath = getCurrentCanonicalPath();
    const finalRedirect = withRedirectBack
      ? buildLoginRedirectPath(currentPath)
      : configLikeRoute(redirectTo);

    AppCore.events.emit("auth:guard:blocked", {
      reason: "not-authenticated",
      redirectTo: finalRedirect,
      path: currentPath,
    });

    if (hardRedirect && typeof window !== "undefined") {
      window.location.href = finalRedirect;
    }

    return false;
  }

  function guardRole(roles = [], options = {}) {
    const roleList = Array.isArray(roles) ? roles : [roles];
    const { redirectTo = "/" } = options;

    if (!isAuthenticated()) {
      AppCore.events.emit("auth:guard:blocked", {
        reason: "not-authenticated",
        redirectTo: buildLoginRedirectPath(getCurrentCanonicalPath()),
        path: getCurrentCanonicalPath(),
      });
      return false;
    }

    if (hasRole(...roleList)) return true;

    AppCore.events.emit("auth:guard:blocked", {
      reason: "insufficient-role",
      currentRole: AppCore.state.role,
      requiredRoles: roleList,
      redirectTo,
      path: getCurrentCanonicalPath(),
    });

    return false;
  }

  /* =========================================================
     HELPERS UI / FORM
  ========================================================= */
  async function handleLoginFormSubmit(formElement, options = {}) {
    if (!(formElement instanceof HTMLFormElement)) {
      throw new Error("Se esperaba un formulario HTML válido.");
    }

    const formData = new FormData(formElement);

    const credentials = {
      email: formData.get("email") || formData.get("username") || "",
      password: formData.get("password") || "",
      remember:
        formData.get("remember") === "on" ||
        formData.get("remember") === "true",
    };

    const result = await login(credentials);

    if (options.resetOnSuccess) {
      formElement.reset();
    }

    return result;
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    ENDPOINTS,
    session,

    login,
    logout,
    fetchMe,
    refreshSession,
    restoreSession,
    handleLoginFormSubmit,

    isAuthenticated,
    isAuthRoute,
    hasRole,
    requireRole,
    guardAuthenticated,
    guardRole,
    getAuthHeader,
    clearSessionLocal,
    normalizeUser,
    buildLoginRedirectPath,
  };
})();