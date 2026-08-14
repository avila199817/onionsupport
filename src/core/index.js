/* =========================================================
   Onion Support - Core
   Archivo: /src/core/index.js

   Responsabilidad:
   - Kernel mínimo global.
   - Estado mínimo en memoria.
   - Sesión actual en memoria.
   - Helpers básicos de usuario/rol/ruta.
   - Registro mínimo de módulos.
   - Puente único hacia core/http.js.
   - Mantener derivados de Auth coherentes sin mutar en cada lectura.
   - Evitar que rutas/tokens sensibles entren en snapshots o estado público.
   - Sin Store.
   - Sin Services.
   - Sin hooks.
   - Sin cleanup global.
   - Sin event bus.
   - Sin network listeners.
   - Sin fetch propio.
   - Sin i18n funcional.
   - Sin framework interno.
========================================================= */

import {
  config,
  USER_HOME_PREFIX as CONFIG_USER_HOME_PREFIX,
  ALLOWED_ROLES,
  SENSITIVE_QUERY_PARAMS,
  buildUserHomeRoute as configBuildUserHomeRoute,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "./config.js";

import Http from "./http.js";

export const CORE_VERSION =
  "core.minimal.v6-hardened";

const APP_NAME =
  config?.appName ||
  config?.name ||
  "Onion Support";

const ROOT_PATH = "/";

const USER_HOME_PREFIX =
  CONFIG_USER_HOME_PREFIX ||
  "/@";

const LEGACY_RESET_TOKEN_PATH =
  /(\/(?:reset-password|password-reset)\/confirm\/)([^/?#\s]+)/gi;

const VALID_ROLES =
  new Set(
    (
      Array.isArray(ALLOWED_ROLES) &&
      ALLOWED_ROLES.length
        ? ALLOWED_ROLES
        : ["admin", "user"]
    ).map(
      (role) =>
        String(role)
          .toLowerCase()
    )
  );

const DISABLED_STATUSES =
  new Set([
    "disabled",
    "desactivado",
    "inactive",
    "inactivo",
    "deleted",
    "eliminado",
    "archived",
    "archivado",
    "revoked",
    "revocado",
    "blocked",
    "bloqueado",
    "banned",
    "suspended",
    "suspendido",
  ]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return (
    typeof value === "function"
  );
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function cleanText(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(
        /[\r\n\t]/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return (
    output ||
    fallback
  );
}

function normalizeKey(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .replace(
      /[-_\s]/g,
      ""
    )
    .toLowerCase();
}

function first(...values) {
  for (
    const value
    of values
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value ===
        "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function clone(value) {
  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    value === null
  ) {
    return null;
  }

  try {
    if (
      typeof structuredClone ===
      "function"
    ) {
      return structuredClone(
        value
      );
    }
  } catch {
    // fallback abajo
  }

  try {
    const serialized =
      JSON.stringify(
        value
      );

    return (
      serialized === undefined
        ? undefined
        : JSON.parse(
            serialized
          )
    );
  } catch {
    return null;
  }
}

/* =========================================================
   SECURITY KEYS
========================================================= */

const SENSITIVE_STATE_KEYS =
  new Set(
    [
      "__proto__",
      "prototype",
      "constructor",

      "password",
      "passwordHash",
      "password_hash",
      "passwordMeta",
      "password_meta",

      "refreshToken",
      "refresh_token",
      "idToken",
      "id_token",
      "jwt",
      "bearer",
      "authorization",

      "resetToken",
      "reset_token",
      "activationToken",
      "activation_token",

      "secret",
      "secrets",
      "apiKey",
      "api_key",
      "connectionString",
      "connection_string",
      "sas",

      "_rid",
      "_self",
      "_etag",
      "_attachments",
      "_ts",
      "_lsn",
      "_metadata",
    ]
      .map(normalizeKey)
      .filter(Boolean)
  );

const SENSITIVE_OBJECT_KEYS =
  new Set(
    [
      ...SENSITIVE_STATE_KEYS,

      "token",
      "accessToken",
      "access_token",

      "sessionId",
      "session_id",

      "cookie",
      "setCookie",
      "set_cookie",

      "code",
      "sig",
      "signature",
    ]
      .map(normalizeKey)
      .filter(Boolean)
  );

const SENSITIVE_QUERY_KEYS =
  new Set(
    (
      Array.isArray(
        SENSITIVE_QUERY_PARAMS
      ) &&
      SENSITIVE_QUERY_PARAMS.length
        ? SENSITIVE_QUERY_PARAMS
        : [
            "token",
            "access_token",
            "accessToken",
            "refresh_token",
            "refreshToken",
            "id_token",
            "idToken",
            "code",
            "secret",
            "session",
            "sessionId",
            "session_id",
            "password",
            "pwd",
            "key",
            "sig",
            "signature",
            "jwt",
            "authorization",
            "reset_token",
            "resetToken",
            "activation_token",
            "activationToken",
          ]
    )
      .map(normalizeKey)
      .filter(Boolean)
  );

/* =========================================================
   STATE
========================================================= */

const state = {
  initialized: false,
  ready: false,
  booting: false,
  loading: false,
  error: null,

  token: null,
  accessToken: null,
  access_token: null,
  hasToken: false,

  authenticated: false,
  user: null,
  currentUser: null,
  hasUser: false,

  role: null,
  rol: null,
  roles: [],

  userSlug: null,
  homePath: ROOT_PATH,
  defaultHome: ROOT_PATH,
  postLoginTarget: null,

  session: null,
  sessionData: null,
  sessionId: null,
  sessionUserId: null,
  hasSession: false,
  hasRefreshToken: false,

  route: ROOT_PATH,
  canonicalPath: ROOT_PATH,
  publicPath: ROOT_PATH,
  routeParams: {},

  sidebarOpen: false,

  lang: "es",
  locale: "es-ES",
  theme: "system",

  updatedAt: null,
};

const dom = {};
const ui = {};

const moduleRegistry =
  new Map();

let httpClient = null;
let toastBridge = null;

/* =========================================================
   MUTATION HELPERS
========================================================= */

function touch() {
  state.updatedAt =
    new Date()
      .toISOString();

  return state.updatedAt;
}

function sameArray(
  left = [],
  right = []
) {
  if (
    !Array.isArray(left) ||
    !Array.isArray(right) ||
    left.length !==
      right.length
  ) {
    return false;
  }

  return left.every(
    (value, index) =>
      value ===
      right[index]
  );
}

function setScalar(
  key,
  value
) {
  if (
    state[key] === value
  ) {
    return false;
  }

  state[key] =
    value;

  return true;
}

function setArray(
  key,
  value = []
) {
  const next =
    Array.isArray(value)
      ? value
      : [];

  if (
    sameArray(
      state[key],
      next
    )
  ) {
    return false;
  }

  state[key] =
    [...next];

  return true;
}

function mutate(
  mutator = null,
  options = {}
) {
  if (
    !isFunction(mutator)
  ) {
    return false;
  }

  let changed = false;

  try {
    changed =
      mutator() === true;
  } catch {
    changed = false;
  }

  if (
    changed &&
    options.touch !== false
  ) {
    touch();
  }

  return changed;
}

/* =========================================================
   REDACTION / SAFE OBJECTS
========================================================= */

function redact(
  value = ""
) {
  let output =
    cleanText(
      value,
      ""
    );

  if (!output) {
    return "";
  }

  output =
    output.replace(
      LEGACY_RESET_TOKEN_PATH,
      "$1***"
    );

  try {
    const fakeUrl =
      new URL(
        output,
        "https://onionsupport.local"
      );

    for (
      const key
      of [
        ...fakeUrl
          .searchParams
          .keys(),
      ]
    ) {
      if (
        SENSITIVE_QUERY_KEYS.has(
          normalizeKey(
            key
          )
        )
      ) {
        fakeUrl
          .searchParams
          .set(
            key,
            "***"
          );
      }
    }

    output =
      /^https?:\/\//i.test(
        output
      )
        ? fakeUrl.toString()
        : `${fakeUrl.pathname}${fakeUrl.search}${fakeUrl.hash}`;
  } catch {
    output =
      output.replace(
        /([?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=)([^&#\s]+)/gi,
        "$1***"
      );
  }

  return output
    .replace(
      LEGACY_RESET_TOKEN_PATH,
      "$1***"
    )
    .replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    )
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function safeError(
  error = null
) {
  if (!error) {
    return null;
  }

  return {
    name:
      cleanText(
        error?.name,
        "Error"
      ),

    message:
      redact(
        error?.message ||
        String(error)
      ),

    status:
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      null,

    code:
      cleanText(
        error?.code ||
        error?.error ||
        "",
        ""
      ) ||
      null,
  };
}

function sanitizeObject(
  value,
  depth = 0
) {
  if (
    depth > 6
  ) {
    return null;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    return redact(value);
  }

  if (
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
      "function" ||
    typeof value ===
      "symbol" ||
    typeof value ===
      "bigint"
  ) {
    return undefined;
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .slice(0, 250)
      .map(
        (item) =>
          sanitizeObject(
            item,
            depth + 1
          )
      );
  }

  if (
    !isObject(value)
  ) {
    return null;
  }

  const output =
    Object.create(null);

  for (
    const [
      key,
      child,
    ]
    of Object.entries(
      value
    )
  ) {
    const normalized =
      normalizeKey(
        key
      );

    if (
      SENSITIVE_OBJECT_KEYS.has(
        normalized
      )
    ) {
      output[key] =
        child
          ? "***"
          : null;

      continue;
    }

    const safeChild =
      sanitizeObject(
        child,
        depth + 1
      );

    if (
      safeChild !== undefined
    ) {
      output[key] =
        safeChild;
    }
  }

  return output;
}

/* =========================================================
   TOKEN / ROLE / USER
========================================================= */

function stripBearer(
  value = ""
) {
  return cleanText(
    value,
    ""
  ).replace(
    /^Bearer\s+/i,
    ""
  );
}

function tokenOk(
  value = ""
) {
  const token =
    stripBearer(
      value
    );

  if (!token) {
    return false;
  }

  if (
    /\s/.test(
      token
    )
  ) {
    return false;
  }

  if (
    token.length >
    8192
  ) {
    return false;
  }

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(
    token.toLowerCase()
  );
}

function cleanToken(
  value = ""
) {
  const token =
    stripBearer(
      value
    );

  return tokenOk(
    token
  )
    ? token
    : null;
}

function normalizeRole(
  value = ""
) {
  if (
    Array.isArray(value)
  ) {
    const roles =
      value
        .map(
          normalizeRole
        )
        .filter(Boolean);

    if (
      roles.includes(
        "admin"
      )
    ) {
      return "admin";
    }

    if (
      roles.includes(
        "user"
      )
    ) {
      return "user";
    }

    return "";
  }

  const role =
    cleanText(
      value,
      ""
    ).toLowerCase();

  return VALID_ROLES.has(
    role
  )
    ? role
    : "";
}

function normalizeSlug(
  value = ""
) {
  try {
    if (
      isFunction(
        configNormalizeUserSlug
      )
    ) {
      return (
        configNormalizeUserSlug(
          value
        ) ||
        ""
      );
    }
  } catch {
    // fallback abajo
  }

  const slug =
    cleanText(
      value,
      ""
    )
      .normalize(
        "NFD"
      )
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /^\/+/,
        ""
      )
      .replace(
        /^@+/,
        ""
      )
      .split(
        /[/?#]/
      )[0]
      .replace(
        /\s+/g,
        ""
      )
      .replace(
        /[^a-zA-Z0-9._-]/g,
        ""
      )
      .toLowerCase();

  if (!slug) {
    return "";
  }

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(
    slug
  )
    ? slug
    : "";
}

function extractUserSlug(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return "";
  }

  return normalizeSlug(
    first(
      user.slug,
      user.lookup?.slug,
      user.profile?.slug,
      user.routing?.slug,
      user.username,
      user.userName,
      user.user_name,
      user.usernameLower,
      user.username_lower,
      user.userId,
      user.id,
      ""
    )
  );
}

function buildUserHomePath(
  userOrSlug = null
) {
  const slug =
    isObject(
      userOrSlug
    )
      ? extractUserSlug(
          userOrSlug
        )
      : normalizeSlug(
          userOrSlug
        );

  if (!slug) {
    return ROOT_PATH;
  }

  try {
    if (
      isFunction(
        configBuildUserHomeRoute
      )
    ) {
      return (
        configBuildUserHomeRoute(
          slug
        ) ||
        `${USER_HOME_PREFIX}${slug}`
      );
    }
  } catch {
    // fallback abajo
  }

  return (
    `${USER_HOME_PREFIX}${slug}`
  );
}

function userStatus(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return "";
  }

  return cleanText(
    first(
      user.status,
      user.estado,
      user.state,
      user.accountStatus,
      ""
    ),
    ""
  ).toLowerCase();
}

function userLooksDisabledByFlag(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return true;
  }

  return Boolean(
    user.usable === false ||
    user.disabled === true ||
    user.deleted === true ||
    user.archived === true ||
    user.revoked === true ||
    user.blocked === true ||
    user.banned === true ||
    user.suspended === true ||
    user.active === false ||
    user.enabled === false
  );
}

function isUsableUser(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return false;
  }

  if (
    userLooksDisabledByFlag(
      user
    )
  ) {
    return false;
  }

  return !DISABLED_STATUSES.has(
    userStatus(
      user
    )
  );
}

function normalizePermissions(
  value = []
) {
  const input =
    Array.isArray(value)
      ? value.flat(
          Infinity
        )
      : [];

  return [
    ...new Set(
      input
        .map(
          (item) =>
            cleanText(
              item,
              ""
            )
        )
        .filter(Boolean)
        .slice(0, 250)
    ),
  ];
}

function publicUser(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return null;
  }

  const role =
    normalizeRole(
      first(
        user.role,
        user.rol,
        user.roles,
        ""
      )
    ) ||
    "user";

  const slug =
    extractUserSlug(
      user
    );

  const status =
    userStatus(
      user
    ) ||
    (
      userLooksDisabledByFlag(
        user
      )
        ? "disabled"
        : "active"
    );

  return {
    id:
      first(
        user.id,
        user.userId,
        null
      ),

    userId:
      first(
        user.userId,
        user.id,
        null
      ),

    username:
      first(
        user.username,
        user.userName,
        user.user_name,
        null
      ),

    slug,

    displayName:
      first(
        user.displayName,
        user.fullName,
        user.name,
        user.nombre,
        user.profile
          ?.displayName,
        user.profile
          ?.name,
        user.username,
        "Usuario"
      ),

    role,
    rol: role,
    roles: [role],

    avatarUrl:
      cleanText(
        first(
          user.avatarUrl,
          user.avatar,
          user.picture,
          user.photoUrl,
          user.profile
            ?.avatarUrl,
          user.profile
            ?.avatar,
          ""
        ),
        ""
      ),

    status,
  };
}

function normalizeUser(
  user = null
) {
  const output =
    publicUser(
      user
    );

  if (!output) {
    return null;
  }

  const permissions =
    normalizePermissions(
      first(
        user.permissions,
        user.permisos,
        user.profile
          ?.permissions,
        []
      )
    );

  return {
    ...output,

    permissions,
    permisos:
      [...permissions],

    usable:
      isUsableUser(
        user
      ),
  };
}

/* =========================================================
   AUTH DERIVED STATE
========================================================= */

function syncAuthDerivedState(
  options = {}
) {
  const user =
    state.user;

  const usableUser =
    isUsableUser(
      user
    );

  const token =
    cleanToken(
      state.token ||
      state.accessToken ||
      state.access_token
    );

  const safeUser =
    usableUser
      ? user
      : null;

  const role =
    safeUser
      ? (
          normalizeRole(
            first(
              safeUser.role,
              safeUser.rol,
              safeUser.roles,
              state.role,
              state.rol,
              "user"
            )
          ) ||
          "user"
        )
      : null;

  const slug =
    safeUser
      ? extractUserSlug(
          safeUser
        )
      : "";

  const homePath =
    safeUser
      ? buildUserHomePath(
          slug
        )
      : ROOT_PATH;

  const roles =
    safeUser &&
    role
      ? [role]
      : [];

  const hasSession =
    Boolean(
      state.session ||
      state.sessionId ||
      state.sessionUserId
    );

  let changed = false;

  changed =
    setScalar(
      "token",
      token
    ) ||
    changed;

  changed =
    setScalar(
      "accessToken",
      token
    ) ||
    changed;

  changed =
    setScalar(
      "access_token",
      token
    ) ||
    changed;

  changed =
    setScalar(
      "hasToken",
      Boolean(token)
    ) ||
    changed;

  changed =
    setScalar(
      "user",
      safeUser
    ) ||
    changed;

  changed =
    setScalar(
      "currentUser",
      safeUser
    ) ||
    changed;

  changed =
    setScalar(
      "hasUser",
      Boolean(safeUser)
    ) ||
    changed;

  changed =
    setScalar(
      "role",
      role
    ) ||
    changed;

  changed =
    setScalar(
      "rol",
      role
    ) ||
    changed;

  changed =
    setArray(
      "roles",
      roles
    ) ||
    changed;

  changed =
    setScalar(
      "userSlug",
      safeUser
        ? slug ||
          null
        : null
    ) ||
    changed;

  changed =
    setScalar(
      "homePath",
      homePath
    ) ||
    changed;

  changed =
    setScalar(
      "defaultHome",
      homePath
    ) ||
    changed;

  changed =
    setScalar(
      "postLoginTarget",
      token &&
      safeUser
        ? homePath
        : null
    ) ||
    changed;

  changed =
    setScalar(
      "authenticated",
      Boolean(
        token &&
        safeUser
      )
    ) ||
    changed;

  changed =
    setScalar(
      "hasSession",
      hasSession
    ) ||
    changed;

  if (
    changed &&
    options.touch === true
  ) {
    touch();
  }

  return changed;
}

/* =========================================================
   ROUTES
========================================================= */

function normalizePathname(
  value = ROOT_PATH
) {
  try {
    if (
      isFunction(
        configNormalizeRoutePath
      )
    ) {
      return (
        configNormalizeRoutePath(
          value
        ) ||
        ROOT_PATH
      );
    }
  } catch {
    // fallback abajo
  }

  let path =
    cleanText(
      value,
      ROOT_PATH
    )
      .split("#")[0]
      .split("?")[0]
      .replace(
        /\\/g,
        "/"
      );

  if (
    !path.startsWith(
      "/"
    )
  ) {
    path =
      `/${path}`;
  }

  path =
    path.replace(
      /\/{2,}/g,
      "/"
    );

  if (
    path.length > 1
  ) {
    path =
      path.replace(
        /\/+$/g,
        ""
      ) ||
      ROOT_PATH;
  }

  return (
    path ||
    ROOT_PATH
  );
}

function sanitizeLegacyTokenPath(
  value = ROOT_PATH
) {
  return cleanText(
    value,
    ROOT_PATH
  ).replace(
    LEGACY_RESET_TOKEN_PATH,
    "$1***"
  );
}

function safeSearch(
  value = ""
) {
  const raw =
    cleanText(
      value,
      ""
    );

  if (
    !raw ||
    raw === "?"
  ) {
    return "";
  }

  const search =
    raw.startsWith("?")
      ? raw
      : `?${raw.replace(
          /^\?+/,
          ""
        )}`;

  try {
    const params =
      new URLSearchParams(
        search
      );

    for (
      const key
      of [
        ...params.keys(),
      ]
    ) {
      if (
        SENSITIVE_QUERY_KEYS.has(
          normalizeKey(
            key
          )
        )
      ) {
        params.delete(
          key
        );
      }
    }

    const output =
      params.toString();

    return output
      ? `?${output}`
      : "";
  } catch {
    return "";
  }
}

function safeHash(
  value = ""
) {
  const hash =
    cleanText(
      value,
      ""
    );

  if (
    !hash ||
    hash === "#"
  ) {
    return "";
  }

  if (
    /[\r\n\t\\]/.test(
      hash
    )
  ) {
    return "";
  }

  const normalized =
    hash.startsWith("#")
      ? hash
      : `#${hash.replace(
          /^#+/,
          ""
        )}`;

  return redact(
    normalized
  );
}

function pathFromInput(
  value = ROOT_PATH
) {
  const raw =
    cleanText(
      value,
      ROOT_PATH
    );

  try {
    if (
      isFunction(
        configRoutePathFromUrlLike
      )
    ) {
      return (
        configRoutePathFromUrlLike(
          raw
        ) ||
        ROOT_PATH
      );
    }
  } catch {
    // fallback abajo
  }

  if (!raw) {
    return ROOT_PATH;
  }

  if (
    raw.startsWith(
      "//"
    )
  ) {
    return ROOT_PATH;
  }

  if (
    /^[a-z][a-z0-9+.-]*:/i.test(
      raw
    )
  ) {
    try {
      const url =
        new URL(
          raw
        );

      if (
        isBrowser() &&
        url.origin ===
          window.location.origin
      ) {
        return (
          `${url.pathname || ROOT_PATH}${url.search || ""}${url.hash || ""}`
        );
      }

      return ROOT_PATH;
    } catch {
      return ROOT_PATH;
    }
  }

  if (
    /[\r\n\t\\]/.test(
      raw
    )
  ) {
    return ROOT_PATH;
  }

  return raw;
}

function splitPath(
  value = ROOT_PATH
) {
  let pathname =
    pathFromInput(
      value
    );

  let search = "";
  let hash = "";

  const hashIndex =
    pathname.indexOf(
      "#"
    );

  if (
    hashIndex >= 0
  ) {
    hash =
      pathname.slice(
        hashIndex
      );

    pathname =
      pathname.slice(
        0,
        hashIndex
      ) ||
      ROOT_PATH;
  }

  const searchIndex =
    pathname.indexOf(
      "?"
    );

  if (
    searchIndex >= 0
  ) {
    search =
      pathname.slice(
        searchIndex
      );

    pathname =
      pathname.slice(
        0,
        searchIndex
      ) ||
      ROOT_PATH;
  }

  return {
    pathname:
      normalizePathname(
        sanitizeLegacyTokenPath(
          pathname
        )
      ),

    search:
      safeSearch(
        search
      ),

    hash:
      safeHash(
        hash
      ),
  };
}

function normalizePublicPath(
  value = ROOT_PATH
) {
  const parts =
    splitPath(
      value
    );

  return (
    `${parts.pathname}${parts.search}${parts.hash}` ||
    ROOT_PATH
  );
}

function normalizeCanonicalPath(
  value = ROOT_PATH
) {
  const pathname =
    splitPath(
      value
    ).pathname;

  if (
    !pathname.startsWith(
      USER_HOME_PREFIX
    )
  ) {
    return (
      pathname ||
      ROOT_PATH
    );
  }

  const rest =
    pathname.slice(
      USER_HOME_PREFIX.length
    );

  const [
    ,
    ...segments
  ] =
    rest.split(
      "/"
    );

  return segments.length
    ? normalizePathname(
        `/${segments.join("/")}`
      )
    : ROOT_PATH;
}

function getUserScopedRouteInfo(
  value = ROOT_PATH
) {
  const safeValue =
    normalizePublicPath(
      value
    );

  try {
    if (
      isFunction(
        configGetUserScopedRouteInfo
      )
    ) {
      return (
        configGetUserScopedRouteInfo(
          safeValue
        )
      );
    }
  } catch {
    // fallback abajo
  }

  const pathname =
    splitPath(
      safeValue
    ).pathname;

  if (
    !pathname.startsWith(
      USER_HOME_PREFIX
    )
  ) {
    return {
      scoped: false,
      home: false,
      slug: "",
      canonicalPath:
        pathname,
      restPath:
        pathname,
      lookupPath:
        pathname,
    };
  }

  const rest =
    pathname.slice(
      USER_HOME_PREFIX.length
    );

  const [
    slugSegment = "",
    ...segments
  ] =
    rest.split(
      "/"
    );

  const slug =
    normalizeSlug(
      slugSegment
    );

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      canonicalPath:
        pathname,
      restPath:
        pathname,
      lookupPath:
        pathname,
    };
  }

  const restPath =
    segments.length
      ? normalizePathname(
          `/${segments.join("/")}`
        )
      : ROOT_PATH;

  return {
    scoped: true,
    home:
      restPath ===
      ROOT_PATH,
    slug,
    canonicalPath:
      restPath,
    restPath,
    lookupPath:
      restPath,
  };
}

function safeInternalPath(
  value = ROOT_PATH
) {
  const raw =
    cleanText(
      value,
      ROOT_PATH
    );

  if (!raw) {
    return ROOT_PATH;
  }

  if (
    raw.startsWith(
      "//"
    )
  ) {
    return ROOT_PATH;
  }

  if (
    /^[a-z][a-z0-9+.-]*:/i.test(
      raw
    )
  ) {
    return ROOT_PATH;
  }

  if (
    /[\r\n\t\\]/.test(
      raw
    )
  ) {
    return ROOT_PATH;
  }

  const path =
    normalizePublicPath(
      raw
    );

  return (
    path.startsWith("/")
      ? path
      : ROOT_PATH
  );
}

/* =========================================================
   SESSION
========================================================= */

function normalizeSessionContext(
  value = null,
  user = null
) {
  if (
    !isObject(value)
  ) {
    return null;
  }

  const sessionId =
    cleanText(
      first(
        value.sessionId,
        value.session_id,
        value.sid,
        value.id,
        ""
      ),
      ""
    );

  const userId =
    cleanText(
      first(
        value.sessionUserId,
        value.session_user_id,
        value.userId,
        value.user_id,
        user?.userId,
        user?.id,
        ""
      ),
      ""
    );

  const expiresAt =
    first(
      value.expiresAt,
      value.expires_at,
      value.refreshExpiresAt,
      value.refresh_expires_at,
      null
    );

  if (
    !sessionId &&
    !userId &&
    !expiresAt
  ) {
    return null;
  }

  return {
    sessionId:
      sessionId ||
      null,

    id:
      sessionId ||
      null,

    userId:
      userId ||
      null,

    sessionUserId:
      userId ||
      null,

    expiresAt,

    active:
      value.active !== false,

    revoked:
      value.revoked === true,

    persistent:
      value.persistent === true ||
      value.restoreOnBoot === true,
  };
}

/* =========================================================
   STATE SANITIZATION
========================================================= */

function sanitizePatchValue(
  key = "",
  value = null
) {
  const normalizedKey =
    normalizeKey(
      key
    );

  if (
    SENSITIVE_STATE_KEYS.has(
      normalizedKey
    )
  ) {
    return undefined;
  }

  if (
    normalizedKey ===
      "error" ||
    normalizedKey ===
      "lasterror"
  ) {
    return safeError(
      value
    );
  }

  if (
    normalizedKey ===
      "route" ||
    normalizedKey ===
      "publicpath"
  ) {
    return normalizePublicPath(
      value
    );
  }

  if (
    normalizedKey ===
      "canonicalpath"
  ) {
    return normalizeCanonicalPath(
      value
    );
  }

  if (
    normalizedKey ===
      "routeparams"
  ) {
    const safe =
      sanitizeObject(
        isObject(value)
          ? value
          : {}
      );

    return (
      isObject(safe)
        ? safe
        : {}
    );
  }

  if (
    normalizedKey ===
    "theme"
  ) {
    return "system";
  }

  if (
    normalizedKey ===
    "lang"
  ) {
    return "es";
  }

  if (
    normalizedKey ===
    "locale"
  ) {
    return "es-ES";
  }

  if (
    typeof value ===
      "function" ||
    typeof value ===
      "symbol" ||
    typeof value ===
      "bigint"
  ) {
    return undefined;
  }

  return clone(
    value
  );
}

/* =========================================================
   STATE READ / WRITE
========================================================= */

function getState(
  options = {}
) {
  /*
    No tocamos updatedAt al leer.
    Sólo corregimos derivados si alguien ha mutado AppCore.state
    directamente por compatibilidad legacy.
  */
  syncAuthDerivedState({
    touch: false,
  });

  if (
    options.raw === true
  ) {
    return state;
  }

  const snapshot =
    clone(
      state
    ) ||
    {};

  if (
    options.includeToken !==
    true
  ) {
    snapshot.token = null;
    snapshot.accessToken =
      null;
    snapshot.access_token =
      null;
  }

  return snapshot;
}

function setState(
  patch = {},
  options = {}
) {
  if (
    !isObject(patch)
  ) {
    return getState(
      options
    );
  }

  let changed = false;

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      patch
    )
  ) {
    const normalizedKey =
      normalizeKey(
        key
      );

    if (
      [
        "user",
        "currentuser",
        "authuser",
        "sessionuser",
      ].includes(
        normalizedKey
      )
    ) {
      const next =
        normalizeUser(
          value
        );

      changed =
        setScalar(
          "user",
          next
        ) ||
        changed;

      continue;
    }

    if (
      [
        "token",
        "accesstoken",
      ].includes(
        normalizedKey
      )
    ) {
      const next =
        cleanToken(
          value
        );

      changed =
        setScalar(
          "token",
          next
        ) ||
        changed;

      changed =
        setScalar(
          "accessToken",
          next
        ) ||
        changed;

      changed =
        setScalar(
          "access_token",
          next
        ) ||
        changed;

      continue;
    }

    if (
      [
        "session",
        "sessiondata",
        "currentsession",
      ].includes(
        normalizedKey
      )
    ) {
      const session =
        normalizeSessionContext(
          value,
          state.user
        );

      changed =
        setScalar(
          "session",
          session
        ) ||
        changed;

      changed =
        setScalar(
          "sessionData",
          session
        ) ||
        changed;

      changed =
        setScalar(
          "sessionId",
          session
            ?.sessionId ||
          null
        ) ||
        changed;

      changed =
        setScalar(
          "sessionUserId",
          session
            ?.sessionUserId ||
          null
        ) ||
        changed;

      changed =
        setScalar(
          "hasSession",
          Boolean(session)
        ) ||
        changed;

      continue;
    }

    const sanitized =
      sanitizePatchValue(
        key,
        value
      );

    if (
      sanitized ===
      undefined
    ) {
      continue;
    }

    if (
      Array.isArray(
        sanitized
      )
    ) {
      changed =
        setArray(
          key,
          sanitized
        ) ||
        changed;

      continue;
    }

    if (
      state[key] !==
      sanitized
    ) {
      state[key] =
        sanitized;

      changed = true;
    }
  }

  const derivedChanged =
    syncAuthDerivedState({
      touch: false,
    });

  if (
    changed ||
    derivedChanged
  ) {
    touch();
  }

  return getState(
    options
  );
}

function patchState(
  patch = {},
  options = {}
) {
  return setState(
    patch,
    options
  );
}

function setRoute(
  route = ROOT_PATH
) {
  const publicPath =
    normalizePublicPath(
      route
    );

  const canonicalPath =
    normalizeCanonicalPath(
      route
    );

  mutate(
    () => {
      let changed =
        false;

      changed =
        setScalar(
          "route",
          canonicalPath
        ) ||
        changed;

      changed =
        setScalar(
          "canonicalPath",
          canonicalPath
        ) ||
        changed;

      changed =
        setScalar(
          "publicPath",
          publicPath
        ) ||
        changed;

      return changed;
    }
  );

  return getState();
}

function setPublicPath(
  path = ROOT_PATH
) {
  const publicPath =
    normalizePublicPath(
      path
    );

  const canonicalPath =
    normalizeCanonicalPath(
      path
    );

  mutate(
    () => {
      let changed =
        false;

      changed =
        setScalar(
          "publicPath",
          publicPath
        ) ||
        changed;

      changed =
        setScalar(
          "canonicalPath",
          canonicalPath
        ) ||
        changed;

      changed =
        setScalar(
          "route",
          canonicalPath
        ) ||
        changed;

      return changed;
    }
  );

  return getState();
}

function setUser(
  user = null
) {
  const next =
    normalizeUser(
      user
    );

  const changed =
    setScalar(
      "user",
      next
    );

  const derivedChanged =
    syncAuthDerivedState({
      touch: false,
    });

  if (
    changed ||
    derivedChanged
  ) {
    touch();
  }

  return getState();
}

function setToken(
  token = null
) {
  const clean =
    cleanToken(
      token
    );

  let changed =
    false;

  changed =
    setScalar(
      "token",
      clean
    ) ||
    changed;

  changed =
    setScalar(
      "accessToken",
      clean
    ) ||
    changed;

  changed =
    setScalar(
      "access_token",
      clean
    ) ||
    changed;

  const derivedChanged =
    syncAuthDerivedState({
      touch: false,
    });

  if (
    changed ||
    derivedChanged
  ) {
    touch();
  }

  return getState();
}

function applySession(
  payload = {}
) {
  if (
    !isObject(payload)
  ) {
    return getState();
  }

  const token =
    first(
      payload.token,
      payload.accessToken,
      payload.access_token,
      payload.data?.token,
      payload.data
        ?.accessToken,
      payload.data
        ?.access_token,
      payload.auth?.token,
      payload.auth
        ?.accessToken,
      null
    );

  const user =
    first(
      payload.user,
      payload.currentUser,
      payload.data?.user,
      payload.data
        ?.currentUser,
      payload.auth?.user,
      payload.auth
        ?.currentUser,
      null
    );

  const sessionPayload =
    first(
      payload.session,
      payload.sessionData,
      payload.currentSession,
      payload.data
        ?.session,
      payload.auth
        ?.session,
      null
    );

  let changed = false;

  if (
    token !== null &&
    token !== undefined
  ) {
    const clean =
      cleanToken(
        token
      );

    changed =
      setScalar(
        "token",
        clean
      ) ||
      changed;

    changed =
      setScalar(
        "accessToken",
        clean
      ) ||
      changed;

    changed =
      setScalar(
        "access_token",
        clean
      ) ||
      changed;
  }

  if (
    user !== null &&
    user !== undefined
  ) {
    changed =
      setScalar(
        "user",
        normalizeUser(
          user
        )
      ) ||
      changed;
  }

  if (
    sessionPayload !==
      null &&
    sessionPayload !==
      undefined
  ) {
    const session =
      normalizeSessionContext(
        sessionPayload,
        state.user
      );

    changed =
      setScalar(
        "session",
        session
      ) ||
      changed;

    changed =
      setScalar(
        "sessionData",
        session
      ) ||
      changed;

    changed =
      setScalar(
        "sessionId",
        session
          ?.sessionId ||
        null
      ) ||
      changed;

    changed =
      setScalar(
        "sessionUserId",
        session
          ?.sessionUserId ||
        null
      ) ||
      changed;

    changed =
      setScalar(
        "hasSession",
        Boolean(session)
      ) ||
      changed;
  }

  if (
    payload.hasRefreshToken !==
    undefined
  ) {
    changed =
      setScalar(
        "hasRefreshToken",
        payload.hasRefreshToken ===
          true
      ) ||
      changed;
  }

  const derivedChanged =
    syncAuthDerivedState({
      touch: false,
    });

  if (
    changed ||
    derivedChanged
  ) {
    touch();
  }

  return getState();
}

function clearSession() {
  let changed = false;

  const nullKeys = [
    "token",
    "accessToken",
    "access_token",
    "user",
    "currentUser",
    "role",
    "rol",
    "userSlug",
    "postLoginTarget",
    "session",
    "sessionData",
    "sessionId",
    "sessionUserId",
  ];

  for (
    const key
    of nullKeys
  ) {
    changed =
      setScalar(
        key,
        null
      ) ||
      changed;
  }

  const falseKeys = [
    "hasToken",
    "authenticated",
    "hasUser",
    "hasSession",
    "hasRefreshToken",
  ];

  for (
    const key
    of falseKeys
  ) {
    changed =
      setScalar(
        key,
        false
      ) ||
      changed;
  }

  changed =
    setArray(
      "roles",
      []
    ) ||
    changed;

  changed =
    setScalar(
      "homePath",
      ROOT_PATH
    ) ||
    changed;

  changed =
    setScalar(
      "defaultHome",
      ROOT_PATH
    ) ||
    changed;

  try {
    getHttpClient()
      ?.clearAuthTokens
      ?.();
  } catch {
    // noop
  }

  if (changed) {
    touch();
  }

  return getState();
}

function setTheme() {
  if (
    state.theme !==
    "system"
  ) {
    state.theme =
      "system";

    touch();
  }

  return getState();
}

function setLang() {
  const changed =
    (
      state.lang !==
      "es"
    ) ||
    (
      state.locale !==
      "es-ES"
    );

  state.lang = "es";
  state.locale = "es-ES";

  if (changed) {
    touch();
  }

  return getState();
}

function setSidebarOpen(
  value = false
) {
  const next =
    value === true;

  if (
    state.sidebarOpen !==
    next
  ) {
    state.sidebarOpen =
      next;

    touch();
  }

  return getState();
}

function setLoading(
  value = false
) {
  const next =
    value === true;

  if (
    state.loading !==
    next
  ) {
    state.loading =
      next;

    touch();
  }

  return getState();
}

function setError(
  error = null
) {
  const next =
    safeError(
      error
    );

  state.error =
    next;

  touch();

  return getState();
}

/* =========================================================
   AUTH HELPERS
========================================================= */

function isAuthenticated() {
  return (
    getState()
      .authenticated ===
    true
  );
}

function getCurrentUser() {
  const snapshot =
    getState();

  return snapshot.hasUser
    ? snapshot.user ||
      null
    : null;
}

function getCurrentRole() {
  return (
    getState().role ||
    null
  );
}

function hasRole(
  roleOrRoles = []
) {
  const snapshot =
    getState();

  if (
    !snapshot.authenticated
  ) {
    return false;
  }

  const requested =
    Array.isArray(
      roleOrRoles
    )
      ? roleOrRoles.flat(
          Infinity
        )
      : [roleOrRoles];

  const roles =
    requested
      .map(
        normalizeRole
      )
      .filter(Boolean);

  if (
    !roles.length
  ) {
    return true;
  }

  if (
    snapshot.role ===
    "admin"
  ) {
    return true;
  }

  return roles.includes(
    snapshot.role
  );
}

function getAuthHeader() {
  const token =
    cleanToken(
      state.token ||
      state.accessToken ||
      state.access_token
    );

  return token
    ? {
        Authorization:
          `Bearer ${token}`,
      }
    : {};
}

/* =========================================================
   MODULES
========================================================= */

function registerModule(
  name = "",
  value = null,
  options = {}
) {
  const key =
    cleanText(
      name,
      ""
    );

  if (!key) {
    return null;
  }

  if (
    moduleRegistry.has(
      key
    ) &&
    options.overwrite ===
      false
  ) {
    return moduleRegistry.get(
      key
    );
  }

  moduleRegistry.set(
    key,
    value
  );

  return value;
}

function getModule(
  name = ""
) {
  return (
    moduleRegistry.get(
      cleanText(
        name,
        ""
      )
    ) ||
    null
  );
}

function removeModule(
  name = ""
) {
  return moduleRegistry.delete(
    cleanText(
      name,
      ""
    )
  );
}

function listModules() {
  return [
    ...moduleRegistry.keys(),
  ];
}

const modules = {
  register:
    registerModule,

  get:
    getModule,

  remove:
    removeModule,

  list:
    listModules,
};

/* =========================================================
   HTTP
========================================================= */

function setHttpClient(
  value = null
) {
  if (!value) {
    return false;
  }

  if (
    httpClient === value
  ) {
    return true;
  }

  httpClient =
    value;

  registerModule(
    "http",
    httpClient,
    {
      overwrite: true,
    }
  );

  return true;
}

function getHttpClient() {
  if (
    httpClient
  ) {
    return httpClient;
  }

  httpClient = Http;

  registerModule(
    "http",
    httpClient,
    {
      overwrite: true,
    }
  );

  return httpClient;
}

function installHttpBridge(
  value = null
) {
  if (value) {
    setHttpClient(
      value
    );
  }

  const client =
    getHttpClient();

  try {
    client
      ?.install
      ?.(AppCore);
  } catch {
    // noop
  }

  return client;
}

function getActiveRequest() {
  const client =
    getHttpClient();

  if (
    isFunction(
      client?.request
    )
  ) {
    return client
      .request
      .bind(
        client
      );
  }

  if (
    isFunction(
      client
    )
  ) {
    return client;
  }

  return null;
}

function getActiveApiClient() {
  return getHttpClient();
}

function request(
  ...args
) {
  const activeRequest =
    getActiveRequest();

  if (
    !isFunction(
      activeRequest
    )
  ) {
    throw new Error(
      "HTTP request() no disponible."
    );
  }

  return activeRequest(
    ...args
  );
}

/* =========================================================
   TOAST BRIDGE
========================================================= */

function setShowToast(
  fn = null
) {
  if (
    !isFunction(fn)
  ) {
    return false;
  }

  toastBridge = fn;

  return true;
}

function showToast(
  message = "",
  type = "info",
  options = {}
) {
  const text =
    isObject(
      message
    )
      ? cleanText(
          first(
            message.message,
            message.text,
            message.title,
            ""
          )
        )
      : cleanText(
          message,
          ""
        );

  if (!text) {
    return null;
  }

  const variant =
    isObject(
      message
    )
      ? cleanText(
          first(
            message.type,
            message.variant,
            type,
            "info"
          ),
          "info"
        )
      : cleanText(
          type,
          "info"
        );

  if (
    toastBridge
  ) {
    return toastBridge(
      text,
      variant,
      options
    );
  }

  const toast =
    getModule(
      "toast"
    );

  if (
    isFunction(
      toast?.show
    )
  ) {
    return toast.show({
      ...(
        isObject(options)
          ? options
          : {}
      ),

      type:
        variant,

      message:
        text,
    });
  }

  if (
    isFunction(
      toast?.[variant]
    )
  ) {
    return toast[
      variant
    ](
      text,
      options
    );
  }

  return null;
}

/* =========================================================
   LIFECYCLE
========================================================= */

function ready(
  fn = null
) {
  if (
    !isFunction(fn)
  ) {
    return () =>
      false;
  }

  if (
    !isBrowser() ||
    document.readyState !==
      "loading"
  ) {
    try {
      fn();
    } catch {
      // noop
    }

    return () =>
      true;
  }

  document.addEventListener(
    "DOMContentLoaded",
    fn,
    {
      once: true,
    }
  );

  return () => {
    try {
      document.removeEventListener(
        "DOMContentLoaded",
        fn
      );
    } catch {
      // noop
    }

    return true;
  };
}

async function init() {
  if (
    state.initialized
  ) {
    return AppCore;
  }

  state.booting = true;
  state.loading = true;
  state.ready = false;
  state.error = null;
  touch();

  try {
    installHttpBridge(
      Http
    );

    state.initialized =
      true;

    state.booting =
      false;

    state.loading =
      false;

    state.ready =
      true;

    touch();

    return AppCore;
  } catch (error) {
    state.booting =
      false;

    state.loading =
      false;

    state.ready =
      false;

    state.error =
      safeError(
        error
      );

    touch();

    throw error;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

function snapshotUser(
  user = null
) {
  const safe =
    publicUser(
      user
    );

  if (!safe) {
    return null;
  }

  return {
    ...safe,

    avatarUrl:
      safe.avatarUrl
        ? "***"
        : "",
  };
}

function getSnapshot() {
  const snapshot =
    getState();

  return Object.freeze({
    version:
      CORE_VERSION,

    appName:
      APP_NAME,

    initialized:
      snapshot.initialized ===
      true,

    ready:
      snapshot.ready ===
      true,

    booting:
      snapshot.booting ===
      true,

    loading:
      snapshot.loading ===
      true,

    authenticated:
      snapshot.authenticated ===
      true,

    hasToken:
      snapshot.hasToken ===
      true,

    hasUser:
      snapshot.hasUser ===
      true,

    user:
      snapshotUser(
        snapshot.user
      ),

    role:
      snapshot.role,

    roles:
      Array.isArray(
        snapshot.roles
      )
        ? [
            ...snapshot.roles,
          ]
        : [],

    userSlug:
      snapshot.userSlug,

    homePath:
      snapshot.homePath ||
      ROOT_PATH,

    route:
      redact(
        snapshot.route ||
        ROOT_PATH
      ),

    canonicalPath:
      redact(
        snapshot.canonicalPath ||
        ROOT_PATH
      ),

    publicPath:
      redact(
        snapshot.publicPath ||
        ROOT_PATH
      ),

    lang:
      snapshot.lang,

    locale:
      snapshot.locale,

    theme:
      snapshot.theme,

    hasHttp:
      Boolean(
        httpClient
      ),

    modules:
      Object.freeze(
        listModules()
      ),

    session:
      Object.freeze({
        hasSession:
          snapshot.hasSession ===
          true,

        sessionId:
          snapshot.sessionId
            ? "***"
            : null,

        sessionUserId:
          snapshot.sessionUserId
            ? "***"
            : null,

        hasRefreshToken:
          snapshot.hasRefreshToken ===
          true,
      }),

    error:
      snapshot.error,

    updatedAt:
      snapshot.updatedAt,
  });
}

/* =========================================================
   API
========================================================= */

export const AppCore = {
  CORE_VERSION,
  version:
    CORE_VERSION,

  config,
  state,
  dom,
  ui,

  modules,

  init,
  ready,

  getState,
  setState,
  patchState,

  isAuthenticated,
  getCurrentUser,
  getCurrentRole,
  hasRole,
  getAuthHeader,

  setRoute,
  setPublicPath,

  setUser,
  setToken,
  applySession,
  clearSession,

  setTheme,
  setLang,
  setSidebarOpen,
  setLoading,
  setError,

  setShowToast,
  showToast,

  registerModule,
  getModule,

  installHttpBridge,
  setHttpClient,
  getHttpClient,
  getActiveRequest,
  getActiveApiClient,
  request,

  normalizeRole,
  normalizeUser,
  normalizeSlug,
  extractUserSlug,
  buildUserHomePath,
  publicUser,
  isUsableUser,

  normalizeSessionContext,

  normalizePublicPath,
  normalizeCanonicalPath,
  getUserScopedRouteInfo,
  safeInternalPath,

  utils: {
    cleanText,
    text:
      cleanText,

    clone,
    redact,
    safeError,
    isObject,
    isFunction,
  },

  getSnapshot,

  getDebugSnapshot:
    getSnapshot,

  snapshot:
    getSnapshot,
};

/* =========================================================
   COMPATIBILITY PROPERTIES
========================================================= */

function defineModuleAlias(
  name = "",
  registryName = ""
) {
  Object.defineProperty(
    AppCore,
    name,
    {
      configurable: true,
      enumerable: false,

      get() {
        return getModule(
          registryName
        );
      },

      set(value) {
        registerModule(
          registryName,
          value,
          {
            overwrite: true,
          }
        );
      },
    }
  );
}

Object.defineProperties(
  AppCore,
  {
    http: {
      configurable: true,
      enumerable: false,

      get() {
        return getHttpClient();
      },

      set(value) {
        setHttpClient(
          value
        );
      },
    },

    Http: {
      configurable: true,
      enumerable: false,

      get() {
        return getHttpClient();
      },

      set(value) {
        setHttpClient(
          value
        );
      },
    },
  }
);

defineModuleAlias(
  "auth",
  "auth"
);

defineModuleAlias(
  "Auth",
  "auth"
);

defineModuleAlias(
  "router",
  "router"
);

defineModuleAlias(
  "Router",
  "router"
);

defineModuleAlias(
  "toast",
  "toast"
);

defineModuleAlias(
  "Toast",
  "toast"
);

defineModuleAlias(
  "sidebar",
  "sidebar"
);

defineModuleAlias(
  "Sidebar",
  "sidebar"
);

defineModuleAlias(
  "topbar",
  "topbar"
);

defineModuleAlias(
  "Topbar",
  "topbar"
);

export default AppCore;
