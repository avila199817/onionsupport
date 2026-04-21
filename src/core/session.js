/* =========================================================
   Onion SPA - Core Session
   Archivo: src/core/session.js

   RESPONSABILIDADES:
   - cargar preferencias persistidas
   - cargar sesión persistida
   - sincronizar route/publicPath
   - aplicar usuario/token
   - limpiar sesión local
   - mantener auth consistente

   HARDENING PRO:
   - zero ghost auth
   - persistencia robusta
   - setters idempotentes
   - sync UI estable
   - eventos consistentes
   - preserve currentResolvedUsername
   - route/publicPath sync sin degradar contexto
========================================================= */

import { config } from "./config.js";

import {
  normalizePath,
  normalizeCanonicalPath,
  normalizeUser,
  hasValidToken,
  getUserUsername,
  getThemeColor,
  sanitizeUsername,
} from "./helpers.js";

import {
  computeAuthenticated,
} from "./state.js";

import {
  removeLegacySessionKeys,
} from "./storage.js";

/* =========================================================
   INTERNAL
========================================================= */

function resolveRole(user = null) {
  return (
    user?.role ||
    user?.rol ||
    null
  );
}

function resolveResolvedUsername(
  state = {},
  user = null
) {
  return (
    sanitizeUsername(
      state?.currentResolvedUsername ||
        state?.resolvedUsername ||
        getUserUsername(user) ||
        getUserUsername(state?.user) ||
        ""
    ) || null
  );
}

function syncAuthState(state) {
  state.authenticated =
    computeAuthenticated(
      state.user,
      state.token
    );

  state.role =
    state.authenticated
      ? resolveRole(
          state.user
        )
      : null;

  if (!state.authenticated) {
    state.currentResolvedUsername =
      null;
  } else {
    state.currentResolvedUsername =
      resolveResolvedUsername(
        state,
        state.user
      );
  }

  return state;
}

function setAriaExpanded(
  el,
  value
) {
  if (!el) return;

  el.setAttribute(
    "aria-expanded",
    String(Boolean(value))
  );
}

function hasOwn(
  obj,
  key
) {
  return Boolean(
    obj &&
      typeof obj === "object" &&
      Object.prototype.hasOwnProperty.call(
        obj,
        key
      )
  );
}

function resolveThemeFromUser(
  user = null
) {
  if (
    !user ||
    typeof user !== "object"
  ) {
    return null;
  }

  const explicitTheme =
    String(
      user.theme ??
        user?.preferences?.theme ??
        user?.settings?.theme ??
        user?.raw?.theme ??
        user?.raw?.preferences
          ?.theme ??
        user?.raw?.settings
          ?.theme ??
        ""
    )
      .trim()
      .toLowerCase();

  if (
    explicitTheme === "light" ||
    explicitTheme === "dark"
  ) {
    return explicitTheme;
  }

  const hasExplicitDarkMode =
    hasOwn(user, "darkMode") ||
    hasOwn(user, "dark_mode") ||
    hasOwn(user?.raw, "darkMode") ||
    hasOwn(user?.raw, "dark_mode") ||
    hasOwn(
      user?.preferences,
      "darkMode"
    ) ||
    hasOwn(
      user?.settings,
      "darkMode"
    ) ||
    hasOwn(
      user?.raw?.preferences,
      "darkMode"
    ) ||
    hasOwn(
      user?.raw?.settings,
      "darkMode"
    );

  if (
    hasExplicitDarkMode &&
    typeof user.darkMode ===
      "boolean"
  ) {
    return user.darkMode
      ? "dark"
      : "light";
  }

  return null;
}

function createSessionSnapshot(
  state,
  cause = "unknown"
) {
  return {
    authenticated:
      Boolean(
        state?.authenticated
      ),
    token:
      state?.token || null,
    user:
      state?.user || null,
    role:
      state?.role || null,
    username:
      getUserUsername(
        state?.user
      ) || null,
    currentResolvedUsername:
      state?.currentResolvedUsername ||
      null,
    cause,
    changedAt:
      new Date().toISOString(),
  };
}

function userFingerprint(
  user = null
) {
  if (!user) return "";

  return JSON.stringify({
    id:
      user.id ||
      user.userId ||
      null,
    username:
      user.username || null,
    email:
      user.email || null,
    role:
      user.role ||
      user.rol ||
      null,
    avatar:
      user.avatar || null,
  });
}

function syncRouteFields({
  state,
  setState,
  route,
  publicPath,
} = {}) {
  const nextCanonical =
    normalizeCanonicalPath(
      route ||
        state?.route ||
        "/"
    );

  const nextPublicPath =
    normalizePath(
      publicPath ||
        state?.publicPath ||
        nextCanonical
    );

  const resolvedUsername =
    sanitizeUsername(
      state?.currentResolvedUsername ||
        getUserUsername(
          state?.user
        ) ||
        ""
    ) || null;

  setState({
    route: nextCanonical,
    publicPath: nextPublicPath,
    currentResolvedUsername:
      resolvedUsername,
  });

  state.route = nextCanonical;
  state.publicPath =
    nextPublicPath;
  state.currentResolvedUsername =
    resolvedUsername;

  return {
    route: nextCanonical,
    publicPath: nextPublicPath,
    currentResolvedUsername:
      resolvedUsername,
  };
}

/* =========================================================
   ROUTE
========================================================= */

export function setRoute({
  state,
  setState,
  events,
  route = "/",
} = {}) {
  const previousRoute =
    state.route || "/";

  const normalized =
    normalizeCanonicalPath(
      route
    );

  if (
    previousRoute ===
    normalized
  ) {
    return normalized;
  }

  setState({
    lastRoute:
      previousRoute,
    route: normalized,
  });

  state.lastRoute =
    previousRoute;
  state.route = normalized;

  events?.emit?.(
    "app:route:change",
    {
      route: normalized,
      previousRoute,
      publicPath:
        state?.publicPath ||
        normalized,
    }
  );

  return normalized;
}

export function setPublicPath({
  state,
  storage,
  setState,
  events,
  path = "/",
} = {}) {
  const previousPublicPath =
    state?.publicPath || "/";

  const normalized =
    normalizePath(path);

  if (
    previousPublicPath ===
    normalized
  ) {
    return normalized;
  }

  setState({
    publicPath:
      normalized,
  });

  state.publicPath =
    normalized;

  storage?.set?.(
    config.storageKeys
      .lastPublicPath,
    normalized
  );

  events?.emit?.(
    "app:public-path:change",
    {
      publicPath:
        normalized,
      previousPublicPath,
      route:
        state?.route || "/",
    }
  );

  return normalized;
}

/* =========================================================
   USER / TOKEN
========================================================= */

export function setUser({
  state,
  storage,
  events,
  setState,
  syncUserUI,
  user = null,
} = {}) {
  const normalizedUser =
    normalizeUser(user);

  const previousUserFingerprint =
    userFingerprint(
      state.user
    );

  const nextUserFingerprint =
    userFingerprint(
      normalizedUser
    );

  if (
    previousUserFingerprint ===
    nextUserFingerprint
  ) {
    return normalizedUser;
  }

  setState({
    user:
      normalizedUser,
  });

  state.user =
    normalizedUser;

  syncAuthState(state);

  setState({
    role: state.role,
    authenticated:
      state.authenticated,
    currentResolvedUsername:
      state.currentResolvedUsername,
  });

  if (
    normalizedUser
  ) {
    storage?.set?.(
      config.storageKeys.user,
      normalizedUser
    );
  } else {
    storage?.remove?.(
      config.storageKeys.user
    );
  }

  syncUserUI?.();

  events?.emit?.(
    "app:user:change",
    {
      user:
        normalizedUser,
      authenticated:
        state.authenticated,
      username:
        normalizedUser
          ?.username ||
        null,
      currentResolvedUsername:
        state.currentResolvedUsername ||
        null,
      avatarUrl:
        normalizedUser
          ?.avatar ||
        null,
    }
  );

  events?.emit?.(
    "app:session:state",
    createSessionSnapshot(
      state,
      "setUser"
    )
  );

  return normalizedUser;
}

export function setToken({
  state,
  storage,
  events,
  setState,
  token = null,
} = {}) {
  const normalized =
    hasValidToken(token)
      ? String(token).trim()
      : null;

  if (
    state.token ===
    normalized
  ) {
    return normalized;
  }

  setState({
    token:
      normalized,
  });

  state.token =
    normalized;

  syncAuthState(state);

  setState({
    role: state.role,
    authenticated:
      state.authenticated,
    currentResolvedUsername:
      state.currentResolvedUsername,
  });

  if (normalized) {
    storage?.set?.(
      config.storageKeys.token,
      normalized
    );
  } else {
    storage?.remove?.(
      config.storageKeys.token
    );
  }

  events?.emit?.(
    "app:token:change",
    {
      token:
        normalized,
      authenticated:
        state.authenticated,
      currentResolvedUsername:
        state.currentResolvedUsername ||
        null,
    }
  );

  events?.emit?.(
    "app:session:state",
    createSessionSnapshot(
      state,
      "setToken"
    )
  );

  return normalized;
}

/* =========================================================
   APPLY SESSION
========================================================= */

export function applySession({
  state,
  events,
  setUser,
  setToken,
  setState,
  token = undefined,
  user = undefined,
  route = undefined,
  publicPath = undefined,
} = {}) {
  if (
    token !==
    undefined
  ) {
    setToken({
      token,
    });
  }

  if (
    user !==
    undefined
  ) {
    setUser({
      user,
    });
  }

  syncAuthState(state);

  if (
    typeof setState ===
    "function"
  ) {
    syncRouteFields({
      state,
      setState,
      route,
      publicPath,
    });
  }

  const snapshot = {
    ...createSessionSnapshot(
      state,
      "applySession"
    ),
    route:
      state?.route || "/",
    publicPath:
      state?.publicPath ||
      state?.route ||
      "/",
  };

  events?.emit?.(
    "app:session:applied",
    snapshot
  );

  return snapshot;
}

/* =========================================================
   CLEAR SESSION
========================================================= */

export function clearSession({
  state,
  storage,
  events,
  setState,
  syncUserUI,
  utils,
} = {}) {
  storage?.remove?.(
    config.storageKeys.user
  );

  storage?.remove?.(
    config.storageKeys.token
  );

  removeLegacySessionKeys(
    utils
  );

  setState({
    user: null,
    token: null,
    role: null,
    authenticated: false,
    currentResolvedUsername:
      null,
  });

  state.user = null;
  state.token = null;
  state.currentResolvedUsername =
    null;

  syncAuthState(state);

  syncUserUI?.();

  events?.emit?.(
    "app:session:cleared",
    {
      authenticated:
        false,
      token: null,
      user: null,
      role: null,
      currentResolvedUsername:
        null,
    }
  );

  events?.emit?.(
    "app:session:state",
    createSessionSnapshot(
      state,
      "clearSession"
    )
  );

  return true;
}

/* =========================================================
   PREFS LOAD
========================================================= */

export function syncThemeMetaColor({
  dom,
  theme =
    config.defaultTheme,
} = {}) {
  if (
    !dom?.themeColorMeta
  ) {
    return;
  }

  dom.themeColorMeta.setAttribute(
    "content",
    getThemeColor(theme)
  );
}

export function loadPreferences({
  state,
  storage,
  dom,
} = {}) {
  const savedTheme =
    storage?.get?.(
      config.storageKeys
        .theme,
      config.defaultTheme
    );

  const savedLang =
    storage?.get?.(
      config.storageKeys
        .lang,
      config.defaultLang
    );

  /* Regla UX:
     estado natural por defecto = abierto.
     Evitamos arrancar colapsado por residuos legacy de storage. */

  const savedSidebarCollapsedRaw =
    storage?.get?.(
      "sidebar-collapsed",
      null
    );

  const hasCollapsedValue =
    savedSidebarCollapsedRaw ===
      true ||
    savedSidebarCollapsedRaw ===
      false ||
    savedSidebarCollapsedRaw ===
      "true" ||
    savedSidebarCollapsedRaw ===
      "false";

  state.theme =
    savedTheme ===
    "light"
      ? "light"
      : "dark";

  state.lang =
    String(
      savedLang ||
        config.defaultLang
    ).trim() ||
    config.defaultLang;

  state.sidebarOpen = true;

  if (dom?.html) {
    dom.html.setAttribute(
      "data-theme",
      state.theme
    );

    dom.html.setAttribute(
      "lang",
      state.lang
    );
  }

  syncThemeMetaColor({
    dom,
    theme:
      state.theme,
  });

  if (dom?.body) {
    dom.body.classList.toggle(
      "sidebar-open",
      state.sidebarOpen
    );

    dom.body.classList.toggle(
      "sidebar-collapsed",
      !state.sidebarOpen
    );
  }

  if (dom?.sidebar) {
    dom.sidebar.classList.toggle(
      "open",
      state.sidebarOpen
    );

    dom.sidebar.classList.toggle(
      "collapsed",
      !state.sidebarOpen
    );

    dom.sidebar.classList.toggle(
      "is-open",
      state.sidebarOpen
    );

    dom.sidebar.classList.toggle(
      "is-collapsed",
      !state.sidebarOpen
    );
  }

  setAriaExpanded(
    dom?.sidebarToggle,
    state.sidebarOpen
  );

  setAriaExpanded(
    dom?.sidebarMobileToggle,
    state.sidebarOpen
  );
}

/* =========================================================
   SESSION LOAD
========================================================= */

export function loadSession({
  state,
  storage,
  dom,
} = {}) {
  const savedUser =
    normalizeUser(
      storage?.get?.(
        config.storageKeys.user,
        null
      )
    );

  const savedToken =
    storage?.get?.(
      config.storageKeys.token,
      null
    );

  state.user =
    savedUser;

  state.token =
    hasValidToken(
      savedToken
    )
      ? String(
          savedToken
        ).trim()
      : null;

  syncAuthState(state);

  state.currentResolvedUsername =
    resolveResolvedUsername(
      state,
      savedUser
    );

  const userTheme =
    resolveThemeFromUser(
      savedUser
    );

  if (
    userTheme === "light" ||
    userTheme === "dark"
  ) {
    state.theme = userTheme;

    storage?.set?.(
      config.storageKeys.theme,
      userTheme
    );

    dom?.html?.setAttribute(
      "data-theme",
      userTheme
    );

    syncThemeMetaColor({
      dom,
      theme: userTheme,
    });
  }

  return state;
}

/* =========================================================
   UI SETTERS
========================================================= */

export function setTheme({
  dom,
  storage,
  events,
  setState,
  theme =
    config.defaultTheme,
} = {}) {
  const normalized =
    theme ===
    "light"
      ? "light"
      : "dark";

  setState({
    theme:
      normalized,
  });

  storage?.set?.(
    config.storageKeys.theme,
    normalized
  );

  dom?.html?.setAttribute(
    "data-theme",
    normalized
  );

  syncThemeMetaColor({
    dom,
    theme:
      normalized,
  });

  events?.emit?.(
    "app:theme:change",
    {
      theme:
        normalized,
    }
  );

  return normalized;
}

export function setLang({
  dom,
  storage,
  events,
  setState,
  lang =
    config.defaultLang,
} = {}) {
  const normalized =
    String(
      lang ||
        config.defaultLang
    ).trim() ||
    config.defaultLang;

  setState({
    lang:
      normalized,
  });

  storage?.set?.(
    config.storageKeys.lang,
    normalized
  );

  dom?.html?.setAttribute(
    "lang",
    normalized
  );

  events?.emit?.(
    "app:lang:change",
    {
      lang:
        normalized,
    }
  );

  return normalized;
}

export function setSidebarOpen({
  dom,
  storage,
  events,
  setState,
  value,
} = {}) {
  const next =
    Boolean(value);

  setState({
    sidebarOpen:
      next,
  });

  storage?.set?.(
    config.storageKeys
      .sidebarOpen,
    next
  );

  storage?.set?.(
    "sidebar-collapsed",
    !next
  );

  if (dom?.body) {
    dom.body.classList.toggle(
      "sidebar-open",
      next
    );

    dom.body.classList.toggle(
      "sidebar-collapsed",
      !next
    );
  }

  if (dom?.sidebar) {
    dom.sidebar.classList.toggle(
      "open",
      next
    );

    dom.sidebar.classList.toggle(
      "collapsed",
      !next
    );

    dom.sidebar.classList.toggle(
      "is-open",
      next
    );

    dom.sidebar.classList.toggle(
      "is-collapsed",
      !next
    );
  }

  setAriaExpanded(
    dom?.sidebarToggle,
    next
  );

  setAriaExpanded(
    dom?.sidebarMobileToggle,
    next
  );

  events?.emit?.(
    "app:sidebar:change",
    {
      open: next,
    }
  );

  return next;
}

export function setLoading({
  dom,
  events,
  setState,
  value,
} = {}) {
  const next =
    Boolean(value);

  setState({
    loading: next,
  });

  dom?.body?.classList.toggle(
    "loading",
    next
  );

  if (dom?.loader) {
    dom.loader.hidden =
      !next;

    dom.loader.setAttribute(
      "aria-hidden",
      String(!next)
    );
  }

  events?.emit?.(
    "app:loading:change",
    {
      loading: next,
    }
  );

  return next;
}

export function setError({
  events,
  setState,
  cloneError,
  error = null,
} = {}) {
  const normalized =
    error
      ? cloneError(
          error
        ) || error
      : null;

  setState({
    lastError:
      normalized,
  });

  events?.emit?.(
    "app:error",
    {
      error:
        normalized,
    }
  );

  return normalized;
}

/* =========================================================
   BASE UI
========================================================= */

export function syncBaseUI({
  setDocumentTitle,
  syncUserUI,
} = {}) {
  setDocumentTitle?.(
    config.appName
  );

  syncUserUI?.();
}

export function getSessionDebugSnapshot(
  state
) {
  return {
    authenticated:
      Boolean(
        state?.authenticated
      ),
    role:
      state?.role ||
      null,
    username:
      getUserUsername(
        state?.user
      ) || null,
    currentResolvedUsername:
      state?.currentResolvedUsername ||
      null,
    hasToken:
      Boolean(
        state?.token
      ),
    route:
      state?.route || "/",
    publicPath:
      state?.publicPath ||
      null,
  };
}
