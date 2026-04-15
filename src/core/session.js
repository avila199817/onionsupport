/* =========================================================
   Onion SPA - Core Session
   Archivo: src/core/session.js

   Responsabilidades:
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
========================================================= */

import { config } from "./config.js";

import {
  normalizePath,
  normalizeCanonicalPath,
  normalizeUser,
  hasValidToken,
  getUserUsername,
  getThemeColor,
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

  events?.emit?.(
    "app:route:change",
    {
      route: normalized,
      previousRoute,
    }
  );

  return normalized;
}

export function setPublicPath({
  storage,
  setState,
  events,
  path = "/",
} = {}) {
  const normalized =
    normalizePath(path);

  setState({
    publicPath:
      normalized,
  });

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
  token = undefined,
  user = undefined,
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

  const snapshot = {
    ...createSessionSnapshot(
      state,
      "applySession"
    ),
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
  });

  state.user = null;
  state.token = null;

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

  const savedSidebar =
    storage?.get?.(
      config.storageKeys
        .sidebarOpen,
      true
    );

  state.theme =
    savedTheme ===
    "light"
      ? "light"
      : "dark";

  state.lang =
    String(
      savedLang ||
        config.defaultLang
    ).trim();

  state.sidebarOpen =
    typeof savedSidebar ===
    "boolean"
      ? savedSidebar
      : true;

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
    hasToken:
      Boolean(
        state?.token
      ),
  };
}
