/* =========================================================
   Onion API - Search Module
   Archivo: /router/search/index.js

   FULL PRO SAAS PANEL · EXTREME GOD MODE · CORS READY

   Responsabilidades:
   - montar el módulo global de búsqueda
   - aplicar request id por petición
   - resolver CORS/preflight antes de auth
   - endurecer auth guard del módulo
   - añadir trazabilidad útil para debug
   - aplicar rate limit ligero anti spam
   - montar submódulos de users / clientes / incidencias
   - montar aliases estables:
     · /users       + /usuarios
     · /clientes    + /clients
     · /incidencias + /tickets
   - montar búsqueda global para topbar
   - responder health local del módulo
   - centralizar 404 y error handler del search
   - mantener logs útiles sin exponer secretos

   Subrutas:
   - OPTIONS /api/search/*
   - GET     /api/search/_health
   - HEAD    /api/search/_health
   - /api/search/users
   - /api/search/usuarios
   - /api/search/clientes
   - /api/search/clients
   - /api/search/incidencias
   - /api/search/tickets
   - /api/search/
========================================================= */

"use strict";

import express from "express";
import crypto from "crypto";

import searchRouter from "./search.router.js";
import usersSearchCreate from "./search_users_create.js";
import clientesSearchCreate from "./search_clientes_create.js";
import incidenciasSearchCreate from "./search_incidencias_create.js";

/* =========================================================
   MODULE FACTORY
========================================================= */

export default function createSearchModule(
  clientesContainer,
  usersContainer,
  ticketsContainer,
  facturasContainer,
  requireAuth
) {
  const router = express.Router({
    caseSensitive: false,
    strict: false,
  });

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const MODULE_NAME = "onion-search";
  const MODULE_VERSION = "2026.06.extreme.cors.1";

  const REQUEST_ID_HEADER = "x-request-id";
  const CORRELATION_ID_HEADER = "x-correlation-id";

  const RATE_LIMIT_WINDOW_MS = envNumber("SEARCH_RATE_LIMIT_WINDOW_MS", 10_000);
  const RATE_LIMIT_MAX_HITS = envNumber("SEARCH_RATE_LIMIT_MAX_HITS", 48);
  const RATE_LIMIT_SWEEP_MS = envNumber("SEARCH_RATE_LIMIT_SWEEP_MS", 60_000);
  const RATE_LIMIT_ENTRY_TTL_MS = RATE_LIMIT_WINDOW_MS * 3;

  const REQUEST_ID_MAX_LENGTH = 96;
  const LOG_QUERY_MAX_LENGTH = 220;
  const LOG_UA_MAX_LENGTH = 220;
  const LOG_PATH_MAX_LENGTH = 260;
  const MAX_METHOD_LENGTH = 12;

  const hits = new Map();
  let lastSweepAt = Date.now();

  const PUBLIC_HEALTH =
    parseBoolean(process.env.SEARCH_PUBLIC_HEALTH, true);

  const REQUIRE_USER_ID =
    parseBoolean(process.env.SEARCH_REQUIRE_USER_ID, true);

  const LOG_SUCCESS_IN_PRODUCTION =
    parseBoolean(process.env.SEARCH_LOG_SUCCESS_IN_PRODUCTION, false);

  const ALLOWED_METHODS = new Set([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);

  const DEFAULT_CORS_ALLOWED_ORIGINS = new Set([
    "https://www.onionsupport.com",
    "https://onionsupport.com",

    "https://api.onionit.net",

    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5500",
    "http://localhost:8080",

    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:8080",
  ]);

  const DEFAULT_CORS_HEADERS = [
    "Authorization",
    "Content-Type",
    "Accept",
    "Origin",
    "X-Requested-With",
    "X-Search-Source",
    "X-Request-Id",
    "X-Correlation-Id",
    "X-CSRF-Token",
    "X-XSRF-Token",
  ];

  const EXPOSED_CORS_HEADERS = [
    "X-Request-Id",
    "X-Correlation-Id",
    "X-Search-Module",
    "X-Search-Version",
    "X-Search-Route-Group",
    "X-Rate-Limit-Window-Ms",
    "X-Rate-Limit-Max",
    "X-Rate-Limit-Remaining",
    "X-Rate-Limit-Reset-Ms",
    "Retry-After",
  ];

  /* =========================================================
     BASIC HELPERS
  ========================================================= */

  function now() {
    return Date.now();
  }

  function envNumber(name = "", fallback = 0) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function safeString(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value)
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
      .trim();

    return text || fallback;
  }

  function safeObject(value, fallback = {}) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : fallback;
  }

  function parseBoolean(value, fallback = false) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    if (typeof value === "boolean") return value;

    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    const text = safeString(value, "").toLowerCase();

    if (["1", "true", "yes", "y", "on", "enabled", "si", "sí"].includes(text)) {
      return true;
    }

    if (["0", "false", "no", "n", "off", "disabled"].includes(text)) {
      return false;
    }

    return fallback;
  }

  function truncate(value = "", maxLength = 120) {
    const text = safeString(value, "");

    if (text.length <= maxLength) return text;

    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  function normalizeHeaderValue(value = "") {
    return safeString(value, "")
      .replace(/[\r\n]/g, "")
      .slice(0, REQUEST_ID_MAX_LENGTH);
  }

  function getHeader(req, name = "") {
    const key = safeString(name, "").toLowerCase();

    if (!key || !req?.headers) return "";

    try {
      if (typeof req.get === "function") {
        return safeString(req.get(key), "");
      }
    } catch {}

    const value = req.headers[key];

    if (Array.isArray(value)) {
      return safeString(value[0], "");
    }

    return safeString(value, "");
  }

  function getFirstHeaderValue(value) {
    if (Array.isArray(value)) return value[0] || "";
    return value || "";
  }

  function getClientIp(req) {
    const forwardedFor = getFirstHeaderValue(req?.headers?.["x-forwarded-for"]);
    const forwardedIp = forwardedFor ? forwardedFor.split(",")[0]?.trim() : "";

    return safeString(
      getFirstHeaderValue(req?.headers?.["cf-connecting-ip"]) ||
        forwardedIp ||
        getFirstHeaderValue(req?.headers?.["x-real-ip"]) ||
        req?.ip ||
        req?.socket?.remoteAddress ||
        "",
      ""
    )
      .replace(/^::ffff:/, "")
      .trim();
  }

  function normalizeRole(value = "") {
    return safeString(value, "").toLowerCase();
  }

  function normalizeEmail(value = "") {
    return safeString(value, "").toLowerCase();
  }

  function getUserRole(req) {
    return normalizeRole(
      req?.user?.role ||
        req?.user?.rol ||
        req?.user?.profile?.role ||
        req?.user?.profile?.rol ||
        req?.user?.claims?.role ||
        req?.user?.claims?.rol ||
        ""
    );
  }

  function getUserId(req) {
    return safeString(
      req?.user?.userId ||
        req?.user?.uid ||
        req?.user?.id ||
        req?.user?.sub ||
        req?.user?.user_id ||
        req?.user?.profile?.userId ||
        req?.user?.profile?.id ||
        req?.user?.claims?.userId ||
        req?.user?.claims?.sub ||
        "",
      ""
    );
  }

  function getUserEmail(req) {
    return normalizeEmail(
      req?.user?.email ||
        req?.user?.mail ||
        req?.user?.profile?.email ||
        req?.user?.claims?.email ||
        ""
    );
  }

  function getUserClienteId(req) {
    return safeString(
      req?.user?.clienteId ||
        req?.user?.clientId ||
        req?.user?.customerId ||
        req?.user?.empresaId ||
        req?.user?.profile?.clienteId ||
        req?.user?.profile?.clientId ||
        req?.user?.cliente?.id ||
        req?.user?.cliente?.clienteId ||
        req?.user?.client?.id ||
        req?.user?.claims?.clienteId ||
        "",
      ""
    );
  }

  function buildRequestId(req) {
    const incoming =
      normalizeHeaderValue(getHeader(req, REQUEST_ID_HEADER)) ||
      normalizeHeaderValue(getHeader(req, CORRELATION_ID_HEADER));

    if (incoming && /^[a-zA-Z0-9._:/@=-]{8,96}$/.test(incoming)) {
      return incoming;
    }

    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return crypto.randomBytes(16).toString("hex");
  }

  function getLogEnabled() {
    if (parseBoolean(process.env.SEARCH_LOG_DISABLED, false)) {
      return false;
    }

    if (safeString(process.env.NODE_ENV, "") === "test") {
      return false;
    }

    return true;
  }

  function getDebugEnabled() {
    return parseBoolean(process.env.SEARCH_DEBUG, false);
  }

  function shouldLogRequest(req, statusCode = 200) {
    if (!getLogEnabled()) return false;
    if (req.method === "HEAD") return false;
    if (req.method === "OPTIONS") return getDebugEnabled();

    if (
      process.env.NODE_ENV === "production" &&
      statusCode < 400 &&
      !LOG_SUCCESS_IN_PRODUCTION &&
      !getDebugEnabled()
    ) {
      return false;
    }

    return true;
  }

  function getSearchPath(req) {
    const originalUrl = safeString(req?.originalUrl || req?.url, "");
    const baseUrl = safeString(req?.baseUrl, "/api/search");

    try {
      const parsed = new URL(originalUrl, "http://localhost");
      const pathname = parsed.pathname || "/";

      if (baseUrl && pathname.startsWith(baseUrl)) {
        return pathname.slice(baseUrl.length) || "/";
      }

      const marker = "/api/search";

      if (pathname.includes(marker)) {
        return pathname.slice(pathname.indexOf(marker) + marker.length) || "/";
      }

      return pathname || "/";
    } catch {
      return safeString(req?.path || req?.url, "/");
    }
  }

  function getRouteGroup(req) {
    const path = getSearchPath(req).toLowerCase();

    if (path === "/" || path === "") return "global";
    if (path === "/_health" || path.startsWith("/_health/")) return "health";

    if (path === "/users" || path.startsWith("/users/")) return "users";
    if (path === "/usuarios" || path.startsWith("/usuarios/")) return "users";

    if (path === "/clientes" || path.startsWith("/clientes/")) return "clientes";
    if (path === "/clients" || path.startsWith("/clients/")) return "clientes";

    if (path === "/incidencias" || path.startsWith("/incidencias/")) return "incidencias";
    if (path === "/tickets" || path.startsWith("/tickets/")) return "incidencias";

    return "unknown";
  }

  function getRequestUrlInfo(req) {
    const searchPath = getSearchPath(req);

    return {
      originalUrl: truncate(req?.originalUrl, LOG_PATH_MAX_LENGTH),
      baseUrl: truncate(req?.baseUrl, LOG_PATH_MAX_LENGTH),
      path: truncate(req?.path, LOG_PATH_MAX_LENGTH),
      url: truncate(req?.url, LOG_PATH_MAX_LENGTH),
      searchPath: truncate(searchPath, LOG_PATH_MAX_LENGTH),
      routeGroup: getRouteGroup(req),
    };
  }

  function redactEmail(value = "") {
    const email = normalizeEmail(value);

    if (!email || !email.includes("@")) return email;

    const [local = "", domain = ""] = email.split("@");

    return `${local.slice(0, 2)}***@${domain || "***"}`;
  }

  function redactFreeText(value = "", max = LOG_QUERY_MAX_LENGTH) {
    return truncate(
      safeString(value, "")
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***")
        .replace(/token=[^&\s]+/gi, "token=***")
        .replace(/password=[^&\s]+/gi, "password=***")
        .replace(/sig=[^&\s]+/gi, "sig=***")
        .replace(/signature=[^&\s]+/gi, "signature=***"),
      max
    );
  }

  function buildSafeQueryLog(req) {
    const query = safeObject(req?.query);
    const result = {};

    const pick = (name, value, max = LOG_QUERY_MAX_LENGTH, transform = null) => {
      const raw = typeof transform === "function" ? transform(value) : value;
      const text = redactFreeText(raw, max);
      if (text) result[name] = text;
    };

    pick("q", query.q || query.search || query.term || query.text);
    pick("type", query.type || query.entity || query.kind, 60);
    pick("mode", query.mode, 60);

    pick("id", query.id, 90);
    pick("ticketId", query.ticketId || query.incidenciaId || query.incidentId, 90);
    pick("clienteId", query.clienteId || query.clientId || query.customerId || query.empresaId, 90);
    pick("userId", query.userId || query.uid || query.usuarioId, 90);

    pick("email", query.email || query.mail, 120, redactEmail);
    pick("username", query.username || query.slug, 80);

    if (query.nif || query.cif || query.dni || query.taxId) {
      result.taxId = "***";
    }

    pick("status", query.status || query.estado, 60);
    pick("priority", query.priority || query.prioridad, 60);
    pick("severity", query.severity || query.gravedad, 60);
    pick("category", query.category || query.categoria, 80);
    pick("subcategory", query.subcategory || query.subcategoria, 80);

    pick("source", query.source || query.origen, 80);
    pick("channel", query.channel || query.canal, 80);

    pick("includeClosed", query.includeClosed, 16);
    pick("includeAll", query.includeAll, 16);
    pick("onlyMine", query.onlyMine, 16);
    pick("includeAttachments", query.includeAttachments, 16);
    pick("includeHistory", query.includeHistory, 16);
    pick("includeAudit", query.includeAudit, 16);
    pick("includeTotal", query.includeTotal, 16);
    pick("includeRaw", query.includeRaw, 16);
    pick("includeInactive", query.includeInactive, 16);
    pick("includeUsers", query.includeUsers, 16);
    pick("recent", query.recent, 16);

    pick("limit", query.limit, 24);
    pick("offset", query.offset, 24);
    pick("fetchLimit", query.fetchLimit, 24);
    pick("contactLimit", query.contactLimit, 24);

    return result;
  }

  function buildTracePayload(req, extra = {}) {
    return {
      requestId: req.requestId,
      module: MODULE_NAME,
      version: MODULE_VERSION,
      method: truncate(req.method, MAX_METHOD_LENGTH),
      ...getRequestUrlInfo(req),
      userId: getUserId(req) || null,
      clienteId: getUserClienteId(req) || null,
      email: getUserEmail(req) ? redactEmail(getUserEmail(req)) : null,
      role: getUserRole(req) || null,
      ip: getClientIp(req) || null,
      ...extra,
    };
  }

  function isValidMethod(req) {
    return ALLOWED_METHODS.has(safeString(req?.method, "").toUpperCase());
  }

  /* =========================================================
     CORS HELPERS
     Importante:
     - Con credentials no se puede usar "*".
     - OPTIONS debe responder antes de requireAuth.
  ========================================================= */

  function splitEnvList(value = "") {
    return safeString(value, "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeOrigin(value = "") {
    const origin = safeString(value, "");

    if (!origin) return "";

    try {
      const parsed = new URL(origin);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return "";
    }
  }

  function getCorsAllowedOrigins() {
    const values = [
      ...DEFAULT_CORS_ALLOWED_ORIGINS,
      ...splitEnvList(process.env.SEARCH_CORS_ORIGINS),
      ...splitEnvList(process.env.CORS_ORIGINS),
      ...splitEnvList(process.env.ALLOWED_ORIGINS),
      ...splitEnvList(process.env.FRONTEND_ORIGINS),
      ...splitEnvList(process.env.FRONTEND_URL),
      ...splitEnvList(process.env.CLIENT_URL),
    ];

    return new Set(
      values
        .map(normalizeOrigin)
        .filter(Boolean)
    );
  }

  function isAllowedSearchOrigin(origin = "") {
    const normalized = normalizeOrigin(origin);

    if (!normalized) return false;

    const allowed = getCorsAllowedOrigins();

    if (allowed.has(normalized)) return true;

    if (parseBoolean(process.env.SEARCH_CORS_ALLOW_ALL, false)) {
      return true;
    }

    return false;
  }

  function appendVaryHeader(res, value = "Origin") {
    const current = safeString(res.getHeader?.("vary"), "");

    if (!current) {
      res.setHeader("vary", value);
      return;
    }

    const values = new Set(
      current
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );

    values.add(value);

    res.setHeader("vary", Array.from(values).join(", "));
  }

  function getRequestedCorsHeaders(req) {
    const requested = safeString(req.headers?.["access-control-request-headers"], "");

    if (requested) {
      return requested
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .join(", ");
    }

    return DEFAULT_CORS_HEADERS.join(", ");
  }

  function applySearchCors(req, res) {
    const origin = safeString(req.headers?.origin, "");

    if (!origin) return false;
    if (!isAllowedSearchOrigin(origin)) return false;

    const normalizedOrigin = normalizeOrigin(origin);

    res.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", getRequestedCorsHeaders(req));
    res.setHeader("Access-Control-Expose-Headers", EXPOSED_CORS_HEADERS.join(", "));
    res.setHeader("Access-Control-Max-Age", "600");

    appendVaryHeader(res, "Origin");
    appendVaryHeader(res, "Access-Control-Request-Method");
    appendVaryHeader(res, "Access-Control-Request-Headers");

    return true;
  }

  function sendCorsPreflight(req, res) {
    const origin = safeString(req.headers?.origin, "");

    applySearchCors(req, res);

    if (origin && !isAllowedSearchOrigin(origin)) {
      return res.status(403).json({
        ok: false,
        success: false,
        error: "CORS_ORIGIN_NOT_ALLOWED",
        code: "CORS_ORIGIN_NOT_ALLOWED",
        message: "Origen no permitido para el módulo de búsqueda.",
        requestId: req.requestId || null,
      });
    }

    return res.status(204).end();
  }

  /* =========================================================
     RATE LIMIT HELPERS
  ========================================================= */

  function sweepRateLimitStore() {
    const current = now();

    if (current - lastSweepAt < RATE_LIMIT_SWEEP_MS) {
      return;
    }

    lastSweepAt = current;

    for (const [key, entry] of hits.entries()) {
      if (!entry || current - entry.lastHitAt > RATE_LIMIT_ENTRY_TTL_MS) {
        hits.delete(key);
      }
    }
  }

  function buildRateLimitKey(req) {
    const userId = getUserId(req);
    const routeGroup = getRouteGroup(req);

    if (userId) {
      return `uid:${userId}:route:${routeGroup}`;
    }

    const ip = getClientIp(req);

    if (ip) {
      return `ip:${ip}:route:${routeGroup}`;
    }

    return `anonymous:route:${routeGroup}`;
  }

  function shouldApplyRateLimit(req) {
    const searchPath = getSearchPath(req).toLowerCase();

    if (req.method === "OPTIONS") return false;
    if (req.method === "HEAD") return false;

    if (searchPath === "/_health") return false;
    if (searchPath.endsWith("/_health")) return false;
    if (searchPath.includes("/_cache/")) return false;

    return true;
  }

  function getRateLimitEntry(key = "") {
    const current = now();
    const existing = hits.get(key);

    if (!existing || current >= existing.resetAt) {
      return {
        count: 0,
        firstHitAt: current,
        lastHitAt: current,
        resetAt: current + RATE_LIMIT_WINDOW_MS,
      };
    }

    return existing;
  }

  function applyRateLimit(req, res) {
    sweepRateLimitStore();

    if (!shouldApplyRateLimit(req)) {
      return {
        limited: false,
        remaining: RATE_LIMIT_MAX_HITS,
        resetAt: now() + RATE_LIMIT_WINDOW_MS,
      };
    }

    const key = buildRateLimitKey(req);
    const current = now();
    const entry = getRateLimitEntry(key);

    entry.count += 1;
    entry.lastHitAt = current;

    hits.set(key, entry);

    const remaining = Math.max(0, RATE_LIMIT_MAX_HITS - entry.count);
    const resetInMs = Math.max(0, entry.resetAt - current);

    try {
      res.setHeader("x-rate-limit-window-ms", String(RATE_LIMIT_WINDOW_MS));
      res.setHeader("x-rate-limit-max", String(RATE_LIMIT_MAX_HITS));
      res.setHeader("x-rate-limit-remaining", String(remaining));
      res.setHeader("x-rate-limit-reset-ms", String(resetInMs));
    } catch {}

    if (entry.count > RATE_LIMIT_MAX_HITS) {
      return {
        limited: true,
        key,
        remaining,
        resetAt: entry.resetAt,
        resetInMs,
      };
    }

    return {
      limited: false,
      key,
      remaining,
      resetAt: entry.resetAt,
      resetInMs,
    };
  }

  /* =========================================================
     CONTAINER HEALTH
  ========================================================= */

  function containerStatus(container) {
    return Boolean(container?.items && typeof container?.items?.query === "function");
  }

  function buildHealthPayload(req = null) {
    return {
      ok: true,
      service: "search",
      module: MODULE_NAME,
      version: MODULE_VERSION,
      status: "running",
      timestamp: new Date().toISOString(),
      requestId: req?.requestId || null,

      auth: {
        middlewareConfigured: typeof requireAuth === "function",
        publicHealth: PUBLIC_HEALTH,
        requireUserId: REQUIRE_USER_ID,
      },

      cors: {
        enabled: true,
        credentials: true,
        allowedOrigins: Array.from(getCorsAllowedOrigins()),
        env: {
          SEARCH_CORS_ORIGINS: Boolean(process.env.SEARCH_CORS_ORIGINS),
          CORS_ORIGINS: Boolean(process.env.CORS_ORIGINS),
          SEARCH_CORS_ALLOW_ALL: parseBoolean(process.env.SEARCH_CORS_ALLOW_ALL, false),
        },
      },

      containers: {
        clientes: containerStatus(clientesContainer),
        users: containerStatus(usersContainer),
        usuarios: containerStatus(usersContainer),
        tickets: containerStatus(ticketsContainer),
        incidencias: containerStatus(ticketsContainer),
        facturas: containerStatus(facturasContainer),
      },

      routes: {
        health: "/_health",
        global: "/",
        users: "/users",
        usuarios: "/usuarios",
        clientes: "/clientes",
        clients: "/clients",
        incidencias: "/incidencias",
        tickets: "/tickets",
      },

      aliases: {
        users: ["/users", "/usuarios"],
        clientes: ["/clientes", "/clients"],
        incidencias: ["/incidencias", "/tickets"],
      },

      rateLimit: {
        windowMs: RATE_LIMIT_WINDOW_MS,
        maxHits: RATE_LIMIT_MAX_HITS,
        routeScoped: true,
        activeKeys: hits.size,
      },

      partitions: {
        clientes: "/id",
        usuarios: "/userId",
        users: "/userId",
        tickets: "/ticketId",
        facturas: "/clienteId",
      },
    };
  }

  /* =========================================================
     RESPONSE HELPERS
  ========================================================= */

  function sendJson(res, status, payload) {
    if (res.headersSent || res.writableEnded || res.destroyed) {
      return undefined;
    }

    return res.status(status).json(payload);
  }

  function sendUnauthorized(req, res) {
    return sendJson(res, 401, {
      ok: false,
      success: false,
      error: "UNAUTHORIZED",
      code: "UNAUTHORIZED",
      message: "Sesión no autenticada.",
      requestId: req.requestId,
    });
  }

  function sendRateLimited(req, res, meta) {
    try {
      res.setHeader(
        "retry-after",
        String(Math.ceil((meta?.resetInMs || RATE_LIMIT_WINDOW_MS) / 1000))
      );
    } catch {}

    return sendJson(res, 429, {
      ok: false,
      success: false,
      error: "RATE_LIMIT",
      code: "RATE_LIMIT",
      message: "Demasiadas búsquedas seguidas. Espera unos segundos e inténtalo de nuevo.",
      requestId: req.requestId,
      retryAfterMs: meta?.resetInMs || RATE_LIMIT_WINDOW_MS,
    });
  }

  function sendMissingAuthMiddleware(req, res) {
    return sendJson(res, 500, {
      ok: false,
      success: false,
      error: "AUTH_MIDDLEWARE_MISSING",
      code: "AUTH_MIDDLEWARE_MISSING",
      message: "El módulo de búsqueda no tiene middleware de autenticación configurado.",
      requestId: req.requestId,
    });
  }

  function sendMethodNotAllowed(req, res) {
    try {
      res.setHeader("allow", Array.from(ALLOWED_METHODS).join(", "));
    } catch {}

    return sendJson(res, 405, {
      ok: false,
      success: false,
      error: "METHOD_NOT_ALLOWED",
      code: "METHOD_NOT_ALLOWED",
      message: "Método no permitido en el módulo de búsqueda.",
      requestId: req.requestId,
      method: req.method,
    });
  }

  function sendNotFound(req, res) {
    return sendJson(res, 404, {
      ok: false,
      success: false,
      error: "SEARCH_ROUTE_NOT_FOUND",
      code: "SEARCH_ROUTE_NOT_FOUND",
      message: "Ruta de búsqueda no encontrada.",
      requestId: req.requestId,
      method: req.method,
      ...getRequestUrlInfo(req),
      availableRoutes: {
        health: "/_health",
        global: "/",
        users: "/users",
        usuarios: "/usuarios",
        clientes: "/clientes",
        clients: "/clients",
        incidencias: "/incidencias",
        tickets: "/tickets",
      },
    });
  }

  function createUnavailableRouter(name = "unknown", reason = "ROUTER_UNAVAILABLE") {
    const fallbackRouter = express.Router({
      caseSensitive: false,
      strict: false,
    });

    fallbackRouter.use((req, res) => {
      applySearchCors(req, res);

      return sendJson(res, 503, {
        ok: false,
        success: false,
        error: "SEARCH_SUBMODULE_UNAVAILABLE",
        code: "SEARCH_SUBMODULE_UNAVAILABLE",
        message: `El submódulo de búsqueda ${name} no está disponible.`,
        requestId: req.requestId,
        submodule: name,
        reason,
      });
    });

    return fallbackRouter;
  }

  function createSafeSubrouter(name = "unknown", factory, args = []) {
    try {
      if (typeof factory !== "function") {
        return createUnavailableRouter(name, "FACTORY_NOT_FUNCTION");
      }

      const instance = factory(...args);

      if (!instance || typeof instance !== "function") {
        return createUnavailableRouter(name, "ROUTER_NOT_FUNCTION");
      }

      return instance;
    } catch (error) {
      console.error("❌ SEARCH SUBROUTER INIT ERROR", {
        module: MODULE_NAME,
        submodule: name,
        message: error?.message || "UNKNOWN_ERROR",
        code: error?.code || null,
        stack: getDebugEnabled() ? error?.stack || null : null,
      });

      return createUnavailableRouter(
        name,
        error?.code || error?.message || "INIT_ERROR"
      );
    }
  }

  /* =========================================================
     ROUTER INSTANCES
     Nota:
     - Se crean una sola vez.
     - Luego se montan en aliases.
     - Así no duplicamos caches internas de users/clientes.
  ========================================================= */

  const usersRouter = createSafeSubrouter(
    "users",
    usersSearchCreate,
    [usersContainer, clientesContainer]
  );

  const clientesRouter = createSafeSubrouter(
    "clientes",
    clientesSearchCreate,
    [clientesContainer, usersContainer]
  );

  const incidenciasRouter = createSafeSubrouter(
    "incidencias",
    incidenciasSearchCreate,
    [ticketsContainer, clientesContainer, usersContainer]
  );

  const globalRouter = createSafeSubrouter(
    "global",
    searchRouter,
    [clientesContainer, usersContainer, ticketsContainer, facturasContainer]
  );

  /* =========================================================
     REQUEST ID / SECURITY HEADERS / TRACE BASE
  ========================================================= */

  router.use((req, res, next) => {
    req.requestId = buildRequestId(req);
    req.searchStartedAt = now();

    try {
      res.setHeader(REQUEST_ID_HEADER, req.requestId);
      res.setHeader(CORRELATION_ID_HEADER, req.requestId);
      res.setHeader("x-search-module", MODULE_NAME);
      res.setHeader("x-search-version", MODULE_VERSION);

      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
      res.setHeader("x-permitted-cross-domain-policies", "none");

      res.setHeader(
        "cache-control",
        "no-store, no-cache, must-revalidate, proxy-revalidate, private"
      );
      res.setHeader("pragma", "no-cache");
      res.setHeader("expires", "0");
      res.setHeader("surrogate-control", "no-store");

      res.removeHeader("x-powered-by");
    } catch {}

    res.locals.search = {
      requestId: req.requestId,
      startedAt: req.searchStartedAt,
      module: MODULE_NAME,
      version: MODULE_VERSION,
      searchPath: getSearchPath(req),
      routeGroup: getRouteGroup(req),
    };

    next();
  });

  /* =========================================================
     CORS / PREFLIGHT
     Debe ir antes de method guard, requireAuth y rate limit.
  ========================================================= */

  router.use((req, res, next) => {
    applySearchCors(req, res);

    if (req.method === "OPTIONS") {
      return sendCorsPreflight(req, res);
    }

    return next();
  });

  /* =========================================================
     METHOD GUARD
  ========================================================= */

  router.use((req, res, next) => {
    if (!isValidMethod(req)) {
      return sendMethodNotAllowed(req, res);
    }

    next();
  });

  /* =========================================================
     HEALTH LOCAL
     Nota:
     - Por defecto queda antes de requireAuth para diagnosticar montaje.
     - Si SEARCH_PUBLIC_HEALTH=false, pasa por auth.
  ========================================================= */

  if (PUBLIC_HEALTH) {
    router.get("/_health", (req, res) => {
      applySearchCors(req, res);
      return res.json(buildHealthPayload(req));
    });

    router.head("/_health", (req, res) => {
      applySearchCors(req, res);
      return res.status(204).end();
    });
  }

  /* =========================================================
     AUTH FAIL-CLOSED
  ========================================================= */

  router.use((req, res, next) => {
    applySearchCors(req, res);

    if (typeof requireAuth !== "function") {
      return sendMissingAuthMiddleware(req, res);
    }

    try {
      const result = requireAuth(req, res, next);

      if (result && typeof result.catch === "function") {
        result.catch(next);
      }
    } catch (error) {
      next(error);
    }
  });

  if (!PUBLIC_HEALTH) {
    router.get("/_health", (req, res) => {
      applySearchCors(req, res);
      return res.json(buildHealthPayload(req));
    });

    router.head("/_health", (req, res) => {
      applySearchCors(req, res);
      return res.status(204).end();
    });
  }

  /* =========================================================
     GUARD EXTRA: req.user obligatorio
  ========================================================= */

  router.use((req, res, next) => {
    applySearchCors(req, res);

    if (!req.user) {
      return sendUnauthorized(req, res);
    }

    if (REQUIRE_USER_ID && !getUserId(req)) {
      return sendUnauthorized(req, res);
    }

    next();
  });

  /* =========================================================
     DEBUG / TRACE PER REQUEST
  ========================================================= */

  router.use((req, res, next) => {
    const startedAt = now();

    res.on("finish", () => {
      if (!shouldLogRequest(req, res.statusCode)) {
        return;
      }

      const durationMs = now() - startedAt;

      const payload = buildTracePayload(req, {
        status: res.statusCode,
        durationMs,
        query: buildSafeQueryLog(req),
        corsOrigin: req.headers?.origin ? normalizeOrigin(req.headers.origin) : null,
      });

      if (getDebugEnabled()) {
        payload.ua = truncate(req.headers["user-agent"] || "-", LOG_UA_MAX_LENGTH);
        payload.rateLimitRemaining = res.getHeader("x-rate-limit-remaining") || null;
        payload.rateLimitResetMs = res.getHeader("x-rate-limit-reset-ms") || null;
      }

      const isError = res.statusCode >= 500;
      const isWarn = res.statusCode >= 400 && res.statusCode < 500;

      if (isError) {
        console.error("❌ SEARCH REQUEST", payload);
        return;
      }

      if (isWarn) {
        console.warn("⚠️ SEARCH REQUEST", payload);
        return;
      }

      console.log("🔎 SEARCH REQUEST", payload);
    });

    next();
  });

  /* =========================================================
     RATE LIMIT LIGHT / ROUTE-SCOPED
  ========================================================= */

  router.use((req, res, next) => {
    const meta = applyRateLimit(req, res);

    if (meta.limited) {
      if (getLogEnabled()) {
        console.warn(
          "🚧 SEARCH RATE LIMIT",
          buildTracePayload(req, {
            rateLimitKey: meta.key,
            retryAfterMs: meta.resetInMs,
          })
        );
      }

      return sendRateLimited(req, res, meta);
    }

    next();
  });

  /* =========================================================
     ROUTE MARKER
     Ayuda a saber qué router recibió la request.
  ========================================================= */

  router.use((req, res, next) => {
    const routeGroup = getRouteGroup(req);

    try {
      res.setHeader("x-search-route-group", routeGroup);
    } catch {}

    if (res.locals.search) {
      res.locals.search.routeGroup = routeGroup;
      res.locals.search.searchPath = getSearchPath(req);
    }

    next();
  });

  /* =========================================================
     SEARCH USERS
     Aliases:
     - /users
     - /usuarios
  ========================================================= */

  router.use("/users", usersRouter);
  router.use("/usuarios", usersRouter);

  /* =========================================================
     SEARCH CLIENTES
     Aliases:
     - /clientes
     - /clients
  ========================================================= */

  router.use("/clientes", clientesRouter);
  router.use("/clients", clientesRouter);

  /* =========================================================
     SEARCH INCIDENCIAS / TICKETS
     Aliases:
     - /incidencias
     - /tickets
  ========================================================= */

  router.use("/incidencias", incidenciasRouter);
  router.use("/tickets", incidenciasRouter);

  /* =========================================================
     GLOBAL SEARCH
     Topbar/global:
     - /api/search?q=...
     - /api/search?type=incidencia&q=...
  ========================================================= */

  router.use("/", globalRouter);

  /* =========================================================
     404 LOCAL
     Nota: si globalRouter tiene su propio 404 final, este fallback no se ejecutará.
     Se conserva para subrouters que hagan next().
  ========================================================= */

  router.use((req, res) => {
    applySearchCors(req, res);
    return sendNotFound(req, res);
  });

  /* =========================================================
     ERROR HANDLER LOCAL
  ========================================================= */

  router.use((err, req, res, _next) => {
    applySearchCors(req, res);

    const statusCode = Number(err?.status || err?.statusCode || 500);
    const safeStatus = statusCode >= 400 && statusCode < 600 ? statusCode : 500;

    const payload = buildTracePayload(req, {
      status: safeStatus,
      error: err?.message || "UNKNOWN_ERROR",
      code: err?.code || null,
    });

    if (getDebugEnabled()) {
      payload.stack = err?.stack || null;
    }

    console.error("❌ SEARCH ERROR", payload);

    if (res.headersSent || res.writableEnded || res.destroyed) {
      return undefined;
    }

    if (safeStatus === 401) {
      return sendUnauthorized(req, res);
    }

    if (safeStatus === 429) {
      return sendRateLimited(req, res, {
        resetInMs: RATE_LIMIT_WINDOW_MS,
      });
    }

    return sendJson(res, safeStatus, {
      ok: false,
      success: false,
      error: safeStatus >= 500 ? "INTERNAL_ERROR" : "SEARCH_REQUEST_ERROR",
      code: safeStatus >= 500 ? "INTERNAL_ERROR" : "SEARCH_REQUEST_ERROR",
      message:
        safeStatus >= 500
          ? "Error interno del módulo de búsqueda."
          : err?.message || "No se pudo procesar la búsqueda.",
      requestId: req.requestId,
      ...(getDebugEnabled()
        ? {
            detail: err?.message || null,
            stack: err?.stack || null,
          }
        : {}),
    });
  });

  return router;
}
