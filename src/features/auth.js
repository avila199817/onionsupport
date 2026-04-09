/* =========================================================
   Onion SPA - Auth / Session (FULL PRO SAAS PANEL)
   Archivo: src/features/auth.js

   Responsabilidades:
   - login
   - logout
   - restaurar sesión
   - cargar usuario actual
   - refrescar access token
   - validar acceso por rol
   - exponer helpers auth para toda la SPA

   BACKEND ESPERADO:
   - POST   /api/auth/login
   - POST   /api/auth/logout
   - GET    /api/auth/me
   - POST   /api/auth/refresh

   NOTAS:
   - soporta username o email
   - soporta 2FA opcional con tempToken
   - soporta refresh token + sessionId + userId
   - restaura sesión incluso si el access token ya no existe
========================================================= */

import { AppCore } from "../core/core.js";

export const Auth = (() => {
  "use strict";

  /* =========================================================
     ENDPOINTS
  ========================================================= */
  const ENDPOINTS = {
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    me: "/api/auth/me",
    refresh: "/api/auth/refresh",
  };

  /* =========================================================
     STORAGE KEYS
  ========================================================= */
  const STORAGE_KEYS = {
    refreshToken: "refresh_token",
    tempToken: "temp_token",
    userSlug: "user_slug",
    userName: "user_name",
    role: "role",
    sessionId: "session_id",
    sessionUserId: "session_user_id",
  };

  const AUTH_CONSTANTS = {
    identifierMaxLength: 160,
    passwordMaxLength: 1024,
    tokenMaxLength: 4096,
    refreshRetryCooldownMs: 30_000,
    maxSequentialRefreshFailures: 3,
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
    refreshPromise: null,
    mePromise: null,
    restorePromise: null,
    refreshFailCount: 0,
    refreshBlockedUntil: 0,
  };

  /* =========================================================
     HELPERS BASE
  ========================================================= */
  function isBrowser() {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

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

  function normalizeTokenValue(token = null) {
    if (token === null || token === undefined) return null;

    const normalized = String(token).trim();
    if (!normalized) return null;

    return normalized.slice(0, AUTH_CONSTANTS.tokenMaxLength);
  }

  function normalizeSessionValue(value = null, maxLength = 128) {
    if (value === null || value === undefined) return null;

    const normalized = String(value).trim();
    if (!normalized) return null;

    return normalized.slice(0, maxLength);
  }

  function isSafeRelativePath(path = "") {
    const raw = String(path || "").trim();
    if (!raw) return false;
    if (!raw.startsWith("/")) return false;
    if (raw.startsWith("//")) return false;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(raw)) return false;
    return true;
  }

  function slugify(value = "") {
    return AppCore.utils.slugify
      ? AppCore.utils.slugify(value)
      : String(value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "");
  }

  function clone(value) {
    return AppCore.utils.safeClone
      ? AppCore.utils.safeClone(value, value)
      : value;
  }

  function normalizeUser(rawUser) {
    if (!rawUser || typeof rawUser !== "object") return null;

    const username = sanitizeUsername(
      rawUser.username ??
        rawUser.userName ??
        rawUser.nick ??
        rawUser.alias ??
        rawUser.login ??
        rawUser.slug ??
        ""
    );

    const displayName =
      rawUser.name ??
      rawUser.nombre ??
      rawUser.full_name ??
      rawUser.fullName ??
      rawUser.display_name ??
      rawUser.displayName ??
      rawUser.username ??
      rawUser.email ??
      "Usuario";

    const role =
      rawUser.role ??
      rawUser.rol ??
      rawUser.type ??
      rawUser.user_type ??
      rawUser.userType ??
      "user";

    const userSlug = rawUser.slug || slugify(username || displayName || "usuario");

    return {
      id: rawUser.id ?? rawUser.userId ?? rawUser.user_id ?? rawUser.uuid ?? rawUser._id ?? null,
      userId: rawUser.userId ?? rawUser.id ?? rawUser.user_id ?? rawUser.uuid ?? rawUser._id ?? null,
      username,
      slug: userSlug,
      name: displayName,
      email: rawUser.email ?? rawUser.mail ?? "",
      role,
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
      raw: clone(rawUser),
    };
  }

  function normalizeSessionPayload(payload = null) {
    if (!payload || typeof payload !== "object") return null;

    const sessionNode = payload.session || payload.data?.session || payload.meta?.session || null;

    if (!sessionNode || typeof sessionNode !== "object") {
      return null;
    }

    const sessionId = String(
      sessionNode.sessionId ??
        sessionNode.id ??
        ""
    ).trim();

    const userId = String(
      sessionNode.userId ??
        payload.user?.userId ??
        payload.user?.id ??
        payload.data?.user?.userId ??
        payload.data?.user?.id ??
        ""
    ).trim();

    return {
      sessionId: sessionId || null,
      userId: userId || null,
      expiresAt: sessionNode.expiresAt || null,
      createdAt: sessionNode.createdAt || null,
      lastActiveAt: sessionNode.lastActiveAt || null,
      lastRefreshAt: sessionNode.lastRefreshAt || null,
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
      payload.meta?.refreshToken ||
      payload.meta?.refresh_token ||
      null
    );
  }

  function extractTempToken(payload) {
    if (!payload) return null;

    return (
      payload.tempToken ||
      payload.temp_token ||
      payload.data?.tempToken ||
      payload.data?.temp_token ||
      payload.meta?.tempToken ||
      payload.meta?.temp_token ||
      null
    );
  }

  function extractRequires2FA(payload) {
    if (!payload) return false;

    return Boolean(
      payload.requires2FA ||
        payload.requires_2fa ||
        payload.requiresTwoFactor ||
        payload.data?.requires2FA ||
        payload.data?.requires_2fa ||
        payload.data?.requiresTwoFactor
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
      credentials.identifier ??
        credentials.username ??
        credentials.user ??
        credentials.email ??
        ""
    ).trim();
  }

  function normalizeLoginPayload(credentials = {}) {
    const rawIdentifier = resolveLoginIdentifier(credentials);
    const cleanIdentifier = String(rawIdentifier || "")
      .trim()
      .replace(/\s+/g, " ");
    const identifier = cleanIdentifier.slice(0, AUTH_CONSTANTS.identifierMaxLength);

    const rawPassword = String(credentials.password ?? credentials.pass ?? "");
    const password = rawPassword.slice(0, AUTH_CONSTANTS.passwordMaxLength);
    const remember = Boolean(credentials.remember);

    return {
      identifier,
      password,
      remember,
    };
  }

  function buildLoginRequestBody(credentials = {}) {
    const { identifier, password, remember } = normalizeLoginPayload(credentials);
    const cleanIdentifier = String(identifier || "").trim();
    const looksLikeEmail = cleanIdentifier.includes("@");

    return {
      identifier,
      email: looksLikeEmail ? cleanIdentifier.toLowerCase() : undefined,
      username: looksLikeEmail ? undefined : sanitizeUsername(cleanIdentifier),
      password,
      remember,
    };
  }

  function hasValidToken(token = AppCore.state.token) {
    return Boolean(token && String(token).trim());
  }

  function getStoredRefreshToken() {
    return AppCore.storage.getRaw(STORAGE_KEYS.refreshToken, null);
  }

  function hasRefreshToken() {
    const refreshToken = getStoredRefreshToken();
    return Boolean(refreshToken && String(refreshToken).trim());
  }

  function getStoredSessionId() {
    return AppCore.storage.getRaw(STORAGE_KEYS.sessionId, null);
  }

  function getStoredSessionUserId() {
    return AppCore.storage.getRaw(STORAGE_KEYS.sessionUserId, null);
  }

  function hasRefreshContext() {
    return Boolean(
      hasRefreshToken() &&
      String(getStoredSessionId() || "").trim() &&
      String(getStoredSessionUserId() || "").trim()
    );
  }

  function isAuthenticated() {
    return hasValidToken(AppCore.state.token);
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
    const rawPath = isBrowser()
      ? `${window.location.pathname || "/"}${window.location.search || ""}`
      : "/";

    const normalizer =
      AppCore.utils.normalizeCanonicalPath || AppCore.utils.normalizePath;

    return normalizer(rawPath);
  }

  function isAuthRoute(pathname = isBrowser() ? window.location.pathname : "/") {
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
    const loginPath = configLikeRoute(AppCore.config?.routes?.login || "/login");

    const canonicalTarget = configLikeRoute(
      targetPath || getCurrentCanonicalPath() || "/"
    );

    if (!canonicalTarget || canonicalTarget === "/login") {
      return loginPath;
    }

    if (!isBrowser()) {
      return `${loginPath}?redirect=${encodeURIComponent(canonicalTarget)}`;
    }

    const url = new URL(window.location.origin + loginPath);
    url.searchParams.set("redirect", canonicalTarget);

    return `${url.pathname}${url.search}`;
  }

  function validateAuthResponse(response) {
    const token = extractToken(response);
    const user = extractUser(response);
    const refreshToken = extractRefreshToken(response);
    const requires2FA = extractRequires2FA(response);
    const tempToken = extractTempToken(response);
    const sessionData = normalizeSessionPayload(response);

    if (requires2FA && tempToken) {
      return {
        token: null,
        user: null,
        refreshToken: null,
        sessionData: null,
        requires2FA: true,
        tempToken,
        response,
      };
    }

    if (!token && !user) {
      throw new Error("La respuesta del API no contiene una sesión válida.");
    }

    return {
      token,
      user,
      refreshToken,
      sessionData,
      requires2FA: false,
      tempToken: null,
      response,
    };
  }

  function buildSessionSnapshot(extra = {}) {
    return {
      authenticated: AppCore.state.authenticated,
      token: AppCore.state.token,
      user: AppCore.state.user,
      role: AppCore.state.role,
      refreshToken: getStoredRefreshToken(),
      sessionId: getStoredSessionId(),
      sessionUserId: getStoredSessionUserId(),
      ...extra,
    };
  }

  function getPostLoginTarget(user = AppCore.state.user) {
    if (isBrowser()) {
      const redirectParam = new URLSearchParams(window.location.search).get("redirect");

      if (redirectParam) {
        const candidate = AppCore.utils.normalizePath(redirectParam);

        if (isSafeRelativePath(candidate) && !isAuthRoute(candidate)) {
          return candidate;
        }
      }
    }

    const slug = user?.slug || slugify(user?.username || user?.name || "");

    if (slug) {
      return `/@${slug}`;
    }

    return AppCore.config?.routes?.home || "/";
  }

  /* =========================================================
     STORAGE / SESIÓN LOCAL
  ========================================================= */
  function persistAuxSessionData(normalizedUser = null) {
    if (normalizedUser?.slug) {
      AppCore.storage.setRaw(STORAGE_KEYS.userSlug, normalizedUser.slug);
    } else {
      AppCore.storage.remove(STORAGE_KEYS.userSlug);
    }

    if (normalizedUser?.name) {
      AppCore.storage.setRaw(STORAGE_KEYS.userName, normalizedUser.name);
    } else {
      AppCore.storage.remove(STORAGE_KEYS.userName);
    }

    if (normalizedUser?.role) {
      AppCore.storage.setRaw(STORAGE_KEYS.role, normalizedUser.role);
    } else {
      AppCore.storage.remove(STORAGE_KEYS.role);
    }
  }

  function persistRefreshToken(refreshToken = null) {
    const normalized = normalizeTokenValue(refreshToken);

    if (normalized) {
      AppCore.storage.setRaw(STORAGE_KEYS.refreshToken, normalized);
    } else {
      AppCore.storage.remove(STORAGE_KEYS.refreshToken);
    }
  }

  function persistTempToken(tempToken = null) {
    const normalized = normalizeTokenValue(tempToken);

    if (normalized) {
      AppCore.storage.setRaw(STORAGE_KEYS.tempToken, normalized);
    } else {
      AppCore.storage.remove(STORAGE_KEYS.tempToken);
    }
  }

  function persistSessionContext(sessionData = null, fallbackUser = null) {
    const sessionId = normalizeSessionValue(sessionData?.sessionId, 128);
    const sessionUserId = normalizeSessionValue(
      sessionData?.userId ||
        fallbackUser?.userId ||
        fallbackUser?.id ||
        "",
      128
    );

    if (sessionId) {
      AppCore.storage.setRaw(STORAGE_KEYS.sessionId, sessionId);
    } else {
      AppCore.storage.remove(STORAGE_KEYS.sessionId);
    }

    if (sessionUserId) {
      AppCore.storage.setRaw(STORAGE_KEYS.sessionUserId, sessionUserId);
    } else {
      AppCore.storage.remove(STORAGE_KEYS.sessionUserId);
    }
  }

  function applySession({
    token = undefined,
    user = undefined,
    refreshToken = undefined,
    sessionData = undefined,
  } = {}) {
    const normalizedUser = user === undefined ? undefined : normalizeUser(user);

    if (token !== undefined) {
      AppCore.setToken(token || null);
    }

    if (user !== undefined) {
      AppCore.setUser(normalizedUser || null);
    }

    if (refreshToken !== undefined) {
      persistRefreshToken(refreshToken || null);
    }

    if (sessionData !== undefined) {
      persistSessionContext(sessionData || null, normalizedUser || AppCore.state.user);
    }

    persistAuxSessionData(
      normalizedUser === undefined ? AppCore.state.user : normalizedUser
    );

    const snapshot = buildSessionSnapshot();

    AppCore.events.emit("auth:session:applied", snapshot);

    return snapshot;
  }

  function clearSessionLocal() {
    AppCore.clearSession();
    AppCore.storage.remove(STORAGE_KEYS.tempToken);
    AppCore.storage.remove(STORAGE_KEYS.refreshToken);
    AppCore.storage.remove(STORAGE_KEYS.userSlug);
    AppCore.storage.remove(STORAGE_KEYS.userName);
    AppCore.storage.remove(STORAGE_KEYS.role);
    AppCore.storage.remove(STORAGE_KEYS.sessionId);
    AppCore.storage.remove(STORAGE_KEYS.sessionUserId);

    AppCore.events.emit("auth:session:cleared", {
      authenticated: false,
      token: null,
      user: null,
      role: null,
      refreshToken: null,
      sessionId: null,
      sessionUserId: null,
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
      apiBase: AppCore.config.apiBase,
      endpoint: ENDPOINTS.login,
    });

    try {
      const response = await AppCore.apiClient.post(
        ENDPOINTS.login,
        buildLoginRequestBody(credentials),
        {
          auth: false,
        }
      );

      const authData = validateAuthResponse(response);

      if (authData.requires2FA && authData.tempToken) {
        persistTempToken(authData.tempToken);

        AppCore.events.emit("auth:login:2fa-required", {
          identifier: payload.identifier,
          tempToken: authData.tempToken,
          response,
        });

        return {
          ok: true,
          requires2FA: true,
          tempToken: authData.tempToken,
          redirectTo: "/2fa",
          response,
        };
      }

      persistTempToken(null);

      const snapshot = applySession({
        token: authData.token ?? null,
        user: authData.user ?? null,
        refreshToken: authData.refreshToken ?? null,
        sessionData: authData.sessionData ?? null,
      });

      if (!snapshot.token) {
        throw new Error("El login devolvió usuario pero no devolvió token.");
      }

      const redirectTo = getPostLoginTarget(snapshot.user);

      AppCore.events.emit("auth:login:success", {
        ...snapshot,
        redirectTo,
        response,
      });

      return {
        ok: true,
        ...snapshot,
        redirectTo,
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

    if (session.mePromise) {
      return session.mePromise;
    }

    session.checking = true;

    AppCore.events.emit("auth:me:start", {});

    session.mePromise = (async () => {
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

        const snapshot = applySession({
          user,
        });

        session.lastCheckAt = Date.now();

        AppCore.events.emit("auth:me:success", {
          user: snapshot.user,
        });

        return snapshot.user;
      } catch (error) {
        AppCore.events.emit("auth:me:error", {
          error,
          message: extractMessage(error),
        });

        throw error;
      } finally {
        session.checking = false;
        session.mePromise = null;
      }
    })();

    return session.mePromise;
  }

  /* =========================================================
     REFRESH TOKEN
  ========================================================= */
 async function refreshSession() {
  if (!hasRefreshContext()) {
    throw new Error("No hay contexto de refresh disponible.");
  }

  if (session.refreshPromise) {
    return session.refreshPromise;
  }

  const now = Date.now();
  if (session.refreshBlockedUntil > now) {
    throw new Error("Refresh temporalmente bloqueado por seguridad.");
  }

  session.refreshing = true;

  AppCore.events.emit("auth:refresh:start", {});

  session.refreshPromise = (async () => {
    try {
      const storedRefreshToken = getStoredRefreshToken();
      const storedSessionId = getStoredSessionId();
      const storedSessionUserId = getStoredSessionUserId();

      const requestBody = {
        refreshToken: String(storedRefreshToken || "").trim(),
        sessionId: String(storedSessionId || "").trim(),
        userId: String(storedSessionUserId || "").trim(),
      };

      const response = await AppCore.apiClient.post(
        ENDPOINTS.refresh,
        requestBody,
        {
          auth: false,
        }
      );

      const nextToken = extractToken(response);
      const nextUser = extractUser(response);
      const nextRefreshToken = extractRefreshToken(response);
      const nextSessionData = normalizeSessionPayload(response);

      if (!nextToken && !nextUser) {
        throw new Error("La respuesta de refresh no contiene datos de sesión.");
      }

      const snapshot = applySession({
        token: nextToken ?? AppCore.state.token,
        user: nextUser ?? AppCore.state.user,
        refreshToken: nextRefreshToken ?? storedRefreshToken,
        sessionData: nextSessionData ?? {
          sessionId: storedSessionId,
          userId: storedSessionUserId,
        },
      });

      if (!snapshot.token) {
        throw new Error("Refresh completado sin token válido.");
      }

      session.lastRefreshAt = Date.now();
      session.refreshFailCount = 0;
      session.refreshBlockedUntil = 0;

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
      session.refreshFailCount += 1;

      if (session.refreshFailCount >= AUTH_CONSTANTS.maxSequentialRefreshFailures) {
        session.refreshBlockedUntil =
          Date.now() + AUTH_CONSTANTS.refreshRetryCooldownMs;
      }

      AppCore.events.emit("auth:refresh:error", {
        error,
        message: extractMessage(error),
        refreshFailCount: session.refreshFailCount,
        refreshBlockedUntil: session.refreshBlockedUntil || null,
      });

      throw error;
    } finally {
      session.refreshing = false;
      session.refreshPromise = null;
    }
  })();

  return session.refreshPromise;
}
   
  /* =========================================================
     RESTAURAR SESIÓN
  ========================================================= */
  async function restoreSession() {
    if (session.restorePromise) {
      return session.restorePromise;
    }

    session.restoring = true;

    AppCore.events.emit("auth:restore:start", {
      hasToken: hasValidToken(),
      hasUser: Boolean(AppCore.state.user),
      hasRefreshContext: hasRefreshContext(),
    });

    session.restorePromise = (async () => {
      try {
        if (!hasValidToken()) {
          if (!hasRefreshContext()) {
            clearSessionLocal();

            AppCore.events.emit("auth:restore:empty", {
              reason: "missing-token-and-refresh-context",
            });

            return {
              ok: false,
              user: null,
            };
          }

          try {
            const refreshed = await refreshSession();

            if (!AppCore.state.user && hasValidToken()) {
              await fetchMe();
            }

            AppCore.events.emit("auth:restore:success", {
              user: AppCore.state.user,
              source: "refresh-without-token",
            });

            return {
              ok: true,
              user: AppCore.state.user,
              refreshed,
            };
          } catch (refreshWithoutTokenError) {
            clearSessionLocal();

            AppCore.events.emit("auth:restore:error", {
              error: refreshWithoutTokenError,
              message: extractMessage(refreshWithoutTokenError),
            });

            return {
              ok: false,
              user: null,
              error: refreshWithoutTokenError,
            };
          }
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

          if (!hasRefreshContext()) {
            clearSessionLocal();

            AppCore.events.emit("auth:restore:error", {
              error: meError,
              message: extractMessage(meError),
            });

            return {
              ok: false,
              user: null,
              error: meError,
            };
          }

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
        session.restorePromise = null;
      }
    })();

    return session.restorePromise;
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
        await AppCore.apiClient.post(ENDPOINTS.logout, null, {
          auth: true,
        });
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

      if (!silent && isBrowser()) {
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

    if (hardRedirect && isBrowser()) {
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
      identifier:
        formData.get("identifier") ||
        formData.get("username") ||
        formData.get("email") ||
        formData.get("user") ||
        "",
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
    STORAGE_KEYS,
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
    getPostLoginTarget,

    hasRefreshToken,
    hasRefreshContext,
    getStoredSessionId,
    getStoredSessionUserId,
  };
})();
