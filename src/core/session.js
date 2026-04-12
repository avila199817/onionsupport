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
   ROUTE
========================================================= */
export function setRoute({
  state,
  setState,
  events,
  route = "/",
} = {}) {
  const previousRoute =
    state.route;

  const normalizedRoute =
    normalizeCanonicalPath(
      route
    );

  setState({
    lastRoute:
      previousRoute,
    route:
      normalizedRoute,
  });

  events?.emit?.(
    "app:route:change",
    {
      route:
        normalizedRoute,
      previousRoute,
    }
  );

  return normalizedRoute;
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
   SESSION WRITE
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

  const authenticated =
    computeAuthenticated(
      normalizedUser,
      state.token
    );

  setState({
    user:
      normalizedUser,
    role:
      normalizedUser
        ?.role ||
      null,
    authenticated,
  });

  if (
    normalizedUser
  ) {
    storage?.set?.(
      config
        .storageKeys
        .user,
      normalizedUser
    );
  } else {
    storage?.remove?.(
      config
        .storageKeys
        .user
    );
  }

  syncUserUI?.();

  events?.emit?.(
    "app:user:change",
    {
      user:
        normalizedUser,
      authenticated,
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

  return normalizedUser;
}

export function setToken({
  state,
  storage,
  events,
  setState,
  token = null,
} = {}) {
  const normalizedToken =
    hasValidToken(token)
      ? String(token).trim()
      : null;

  const authenticated =
    computeAuthenticated(
      state.user,
      normalizedToken
    );

  setState({
    token:
      normalizedToken,
    authenticated,
  });

  if (
    normalizedToken
  ) {
    storage?.set?.(
      config
        .storageKeys
        .token,
      normalizedToken
    );
  } else {
    storage?.remove?.(
      config
        .storageKeys
        .token
    );
  }

  events?.emit?.(
    "app:token:change",
    {
      token:
        normalizedToken,
      authenticated,
    }
  );

  return normalizedToken;
}

export function applySession({
  state,
  events,
  setUser,
  setToken,
  token = undefined,
  user = undefined,
} = {}) {
  /* token first */
  if (
    token !==
    undefined
  ) {
    setToken({
      token,
    });
  }

  /* user second */
  if (
    user !==
    undefined
  ) {
    setUser({
      user,
    });
  }

  const snapshot = {
    authenticated:
      state.authenticated,
    token:
      state.token,
    user:
      state.user,
    role:
      state.role,
  };

  events?.emit?.(
    "app:session:applied",
    snapshot
  );

  return snapshot;
}

export function clearSession({
  state,
  storage,
  events,
  setState,
  syncUserUI,
  utils,
} = {}) {
  storage?.remove?.(
    config
      .storageKeys.user
  );

  storage?.remove?.(
    config
      .storageKeys.token
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
}

/* =========================================================
   LOAD PREFS / SESSION
========================================================= */
export function syncThemeMetaColor({
  dom,
  theme =
    config.defaultTheme,
} = {}) {
  if (
    !dom?.themeColorMeta
  )
    return;

  dom.themeColorMeta.setAttribute(
    "content",
    getThemeColor(
      theme
    )
  );
}

export function loadPreferences({
  state,
  storage,
  dom,
} = {}) {
  const savedTheme =
    storage?.get?.(
      config
        .storageKeys
        .theme,
      config.defaultTheme
    );

  const savedLang =
    storage?.get?.(
      config
        .storageKeys
        .lang,
      config.defaultLang
    );

  const savedSidebarOpen =
    storage?.get?.(
      config
        .storageKeys
        .sidebarOpen,
      true
    );

  state.theme =
    savedTheme ===
    "light"
      ? "light"
      : "dark";

  state.lang =
    savedLang ||
    config.defaultLang;

  state.sidebarOpen =
    typeof savedSidebarOpen ===
    "boolean"
      ? savedSidebarOpen
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
      "sidebar-collapsed",
      !state.sidebarOpen
    );

    dom.body.classList.toggle(
      "sidebar-open",
      state.sidebarOpen
    );

    dom.body.classList.toggle(
      "loading",
      state.loading
    );
  }

  if (dom?.sidebar) {
    dom.sidebar.classList.toggle(
      "collapsed",
      !state.sidebarOpen
    );

    dom.sidebar.classList.toggle(
      "open",
      state.sidebarOpen
    );

    dom.sidebar.classList.toggle(
      "is-collapsed",
      !state.sidebarOpen
    );

    dom.sidebar.classList.toggle(
      "is-open",
      state.sidebarOpen
    );
  }

  if (
    dom?.sidebarToggle
  ) {
    dom.sidebarToggle.setAttribute(
      "aria-expanded",
      String(
        state.sidebarOpen
      )
    );
  }

  if (
    dom?.sidebarMobileToggle
  ) {
    dom.sidebarMobileToggle.setAttribute(
      "aria-expanded",
      String(
        state.sidebarOpen
      )
    );
  }

  if (dom?.loader) {
    dom.loader.hidden =
      !state.loading;

    dom.loader.setAttribute(
      "aria-hidden",
      String(
        !state.loading
      )
    );
  }
}

export function loadSession({
  state,
  storage,
} = {}) {
  const savedUser =
    normalizeUser(
      storage?.get?.(
        config
          .storageKeys
          .user,
        null
      )
    );

  const savedToken =
    storage?.get?.(
      config
        .storageKeys
        .token,
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

  state.role =
    savedUser?.role ||
    null;

  state.authenticated =
    computeAuthenticated(
      savedUser,
      state.token
    );
}

/* =========================================================
   UI STATE
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
    config
      .storageKeys
      .theme,
    normalized
  );

  if (dom?.html) {
    dom.html.setAttribute(
      "data-theme",
      normalized
    );
  }

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
    config
      .storageKeys
      .lang,
    normalized
  );

  if (dom?.html) {
    dom.html.setAttribute(
      "lang",
      normalized
    );
  }

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
  const nextValue =
    Boolean(value);

  setState({
    sidebarOpen:
      nextValue,
  });

  storage?.set?.(
    config
      .storageKeys
      .sidebarOpen,
    nextValue
  );

  if (dom?.body) {
    dom.body.classList.toggle(
      "sidebar-collapsed",
      !nextValue
    );

    dom.body.classList.toggle(
      "sidebar-open",
      nextValue
    );
  }

  if (dom?.sidebar) {
    dom.sidebar.classList.toggle(
      "collapsed",
      !nextValue
    );

    dom.sidebar.classList.toggle(
      "open",
      nextValue
    );

    dom.sidebar.classList.toggle(
      "is-collapsed",
      !nextValue
    );

    dom.sidebar.classList.toggle(
      "is-open",
      nextValue
    );
  }

  if (
    dom?.sidebarToggle
  ) {
    dom.sidebarToggle.setAttribute(
      "aria-expanded",
      String(
        nextValue
      )
    );
  }

  if (
    dom?.sidebarMobileToggle
  ) {
    dom.sidebarMobileToggle.setAttribute(
      "aria-expanded",
      String(
        nextValue
      )
    );
  }

  events?.emit?.(
    "app:sidebar:change",
    {
      open:
        nextValue,
    }
  );

  return nextValue;
}

export function setLoading({
  dom,
  events,
  setState,
  value,
} = {}) {
  const nextValue =
    Boolean(value);

  setState({
    loading:
      nextValue,
  });

  if (dom?.body) {
    dom.body.classList.toggle(
      "loading",
      nextValue
    );
  }

  if (dom?.loader) {
    dom.loader.hidden =
      !nextValue;

    dom.loader.setAttribute(
      "aria-hidden",
      String(
        !nextValue
      )
    );
  }

  events?.emit?.(
    "app:loading:change",
    {
      loading:
        nextValue,
    }
  );

  return nextValue;
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
      state?.authenticated,
    role:
      state?.role,
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
