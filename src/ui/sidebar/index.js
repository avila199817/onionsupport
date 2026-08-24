/* =========================================================
   Onion Support - Sidebar UI
   Archivo: /src/ui/sidebar/index.js

   Responsabilidad:
   - Controlador mínimo del sidebar.
   - Montar en #sidebar-mount.
   - Calcular usuario, rutas visibles y estado open/collapsed.
   - Consumir template.js para TODO el DOM visual.
   - Conectar callbacks de template: toggle/dropdown/logout.
   - Dejar navegación normal en Router global vía data-spa/data-route.
   - Reutilizar el DOM mientras no cambie su estructura.
   - Actualizar sólo active/open/hidden cuando cambia la navegación.
   - Delegar logout en Auth.
   - Sin construir HTML visual.
   - Sin guards.
   - Sin HTTP.
   - Sin Toast.
   - Sin Store.
   - Sin Services.
   - Sin rutas inventadas.
========================================================= */

import { AppCore } from "../../core/index.js";
import { sanitizeRuntimeImageUrl } from "../../core/media.js";
import { Auth as DefaultAuth } from "../../features/auth/index.js";
import { Router as DefaultRouter } from "../../router/index.js";

import {
  ROUTES,
  USER_HOME_PREFIX,
  buildUserHomeRoute,
  buildUserScopedRoute,
  isBlockedRoutePath,
  normalizeRoutePath,
  normalizeUserSlug,
} from "../../core/config.js";

import { getImmutableRoutes } from "../../router/routes.js";

import {
  createSidebarTemplate,
  bindSidebarTemplate,
  unbindSidebarTemplate,
  setSidebarTemplateOpen,
  closeSidebarDropdown,
} from "./template.js";

export const SIDEBAR_VERSION =
  "sidebar.controller.v6-router-context-reuse";

const SIDEBAR_ROOT_ID =
  "app-sidebar";

const SIDEBAR_MOUNT_ID =
  "sidebar-mount";

const BRAND_LABEL =
  "Onion Support";

const LEGACY_RESET_TOKEN_PATH =
  /(\/(?:reset-password|password-reset)\/confirm\/)([^/?#\s]+)/gi;

let initialized = false;
let mounted = false;
let sidebarOpen = true;
let logoutInFlight = false;

let root = null;
let cleanupTemplate = null;

let lastStructureSignature = "";

const metrics = {
  structuralRenders: 0,
  fastSyncs: 0,
  activePatches: 0,
  hiddenSyncs: 0,
  purges: 0,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return (
    typeof value === "function"
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

function redact(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .replace(
      LEGACY_RESET_TOKEN_PATH,
      "$1***"
    )
    .replace(
      /([?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=)([^&#\s]+)/gi,
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

function stablePart(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .replace(
      /[|~]/g,
      "_"
    )
    .slice(
      0,
      500
    );
}

/* =========================================================
   IDEMPOTENT DOM HELPERS
========================================================= */

function setAttributeIfChanged(
  node = null,
  name = "",
  value = ""
) {
  if (
    !node ||
    !name
  ) {
    return false;
  }

  const next =
    String(value);

  if (
    node.getAttribute(
      name
    ) === next
  ) {
    return false;
  }

  node.setAttribute(
    name,
    next
  );

  return true;
}

function setDatasetIfChanged(
  node = null,
  key = "",
  value = ""
) {
  if (
    !node?.dataset ||
    !key
  ) {
    return false;
  }

  const next =
    String(value);

  if (
    node.dataset[key] ===
    next
  ) {
    return false;
  }

  node.dataset[key] =
    next;

  return true;
}

function setClassState(
  node = null,
  className = "",
  enabled = false
) {
  if (
    !node?.classList ||
    !className
  ) {
    return false;
  }

  const next =
    enabled === true;

  if (
    node.classList.contains(
      className
    ) === next
  ) {
    return false;
  }

  node.classList.toggle(
    className,
    next
  );

  return true;
}

/* =========================================================
   DOM
========================================================= */

function byId(
  id = ""
) {
  if (
    !isBrowser() ||
    !id
  ) {
    return null;
  }

  return document.getElementById(
    id
  );
}

function getMount() {
  if (!isBrowser()) {
    return null;
  }

  return (
    byId(
      SIDEBAR_MOUNT_ID
    ) ||
    document.querySelector?.(
      "[data-sidebar-mount]"
    ) ||
    null
  );
}

function clear(
  node = null
) {
  if (!node) {
    return false;
  }

  try {
    if (
      node.childNodes
        ?.length
    ) {
      node.replaceChildren();
    }

    return true;
  } catch {
    try {
      if (
        node.textContent
      ) {
        node.textContent =
          "";
      }

      return true;
    } catch {
      return false;
    }
  }
}

function setHidden(
  node = null,
  hidden = false
) {
  if (!node) {
    return false;
  }

  const value =
    hidden === true;

  let changed = false;

  try {
    if (
      node.hidden !== value
    ) {
      node.hidden =
        value;

      changed = true;
    }

    changed =
      setAttributeIfChanged(
        node,
        "aria-hidden",
        value
          ? "true"
          : "false"
      ) ||
      changed;

    return changed;
  } catch {
    return false;
  }
}

function rootIsMounted() {
  const mount =
    getMount();

  return Boolean(
    root &&
    mount &&
    root.parentNode ===
      mount
  );
}

function cacheDom() {
  try {
    const dom =
      isObject(
        AppCore.dom
      )
        ? AppCore.dom
        : null;

    if (!dom) {
      return false;
    }

    const mount =
      getMount();

    if (
      dom.sidebar !==
      root
    ) {
      dom.sidebar =
        root;
    }

    if (
      dom.appSidebar !==
      root
    ) {
      dom.appSidebar =
        root;
    }

    if (
      dom.sidebarRoot !==
      root
    ) {
      dom.sidebarRoot =
        root;
    }

    if (
      dom.sidebarMount !==
      mount
    ) {
      dom.sidebarMount =
        mount;
    }

    return true;
  } catch {
    return false;
  }
}

function clearDomCache() {
  try {
    if (
      !isObject(
        AppCore.dom
      )
    ) {
      return false;
    }

    delete AppCore.dom.sidebar;
    delete AppCore.dom.appSidebar;
    delete AppCore.dom.sidebarRoot;
    delete AppCore.dom.sidebarMount;

    return true;
  } catch {
    return false;
  }
}

function unbindTemplate() {
  try {
    cleanupTemplate?.();
  } catch {
    // noop
  }

  try {
    if (root) {
      unbindSidebarTemplate(
        root
      );
    }
  } catch {
    // noop
  }

  cleanupTemplate =
    null;

  return true;
}

function ensureTemplateBound() {
  if (
    !root
  ) {
    return false;
  }

  if (
    isFunction(
      cleanupTemplate
    )
  ) {
    return true;
  }

  try {
    cleanupTemplate =
      bindSidebarTemplate(
        root,
        {
          onOpenChange:
            onTemplateOpenChange,

          onLogout:
            onTemplateLogout,
        }
      );

    return isFunction(
      cleanupTemplate
    );
  } catch {
    cleanupTemplate =
      null;

    return false;
  }
}

function purgeSidebarDom() {
  const mount =
    getMount();

  unbindTemplate();

  try {
    closeSidebarDropdown(
      root,
      {
        focus: false,
      }
    );
  } catch {
    // noop
  }

  if (mount) {
    clear(
      mount
    );

    setHidden(
      mount,
      true
    );
  }

  root = null;
  mounted = false;

  lastStructureSignature =
    "";

  clearDomCache();

  metrics.purges +=
    1;

  return true;
}

/* =========================================================
   CORE / AUTH / ROUTER
========================================================= */

function readCoreState() {
  try {
    if (
      isFunction(
        AppCore?.runtimeState?.read
      )
    ) {
      return (
        AppCore.runtimeState.read() ||
        {}
      );
    }
  } catch {
    // noop
  }

  return {};
}

function getAuth() {
  return (
    AppCore.auth ||
    AppCore.Auth ||
    AppCore.getModule?.(
      "auth"
    ) ||
    DefaultAuth ||
    null
  );
}

function getRouter() {
  return (
    AppCore.router ||
    AppCore.Router ||
    AppCore.getModule?.(
      "router"
    ) ||
    DefaultRouter ||
    null
  );
}

function authUserFallback() {
  const auth =
    getAuth();

  try {
    return (
      auth?.getUser?.() ||
      auth?.getCurrentUser?.() ||
      AppCore.getCurrentUser?.() ||
      null
    );
  } catch {
    return null;
  }
}

function authRoleFallback() {
  const auth =
    getAuth();

  try {
    return (
      auth?.getRole?.() ||
      auth?.getCurrentRole?.() ||
      AppCore.getCurrentRole?.() ||
      ""
    );
  } catch {
    return "";
  }
}

function isAuthenticated() {
  const state =
    readCoreState();

  if (
    typeof state.authenticated ===
    "boolean"
  ) {
    return (
      state.authenticated ===
      true
    );
  }

  const auth =
    getAuth();

  try {
    return Boolean(
      auth
        ?.isAuthenticated
        ?.() === true ||
      AppCore
        .isAuthenticated
        ?.() === true
    );
  } catch {
    return false;
  }
}

function isAdmin() {
  const state =
    readCoreState();

  const role =
    cleanText(
      state.role ||
      state.rol ||
      authRoleFallback(),
      ""
    )
      .toLowerCase();

  if (
    role === "admin"
  ) {
    return true;
  }

  const auth =
    getAuth();

  try {
    return (
      auth?.isAdmin?.() ===
      true
    );
  } catch {
    return false;
  }
}

/* =========================================================
   USER
========================================================= */

function safeImageUrl(
  value = ""
) {
  return sanitizeRuntimeImageUrl(
    value,
    {
      allowRelative: true,
      allowBlobObjectUrl: true,
      allowSameOrigin: true,
      allowOnionApi: true,
      allowAzureBlob: true,
      allowAzureBlobSas: true,
    }
  );
}

function initialsFrom(
  value = ""
) {
  return (
    cleanText(
      value,
      ""
    )
      .split(
        /\s+/
      )
      .filter(Boolean)
      .slice(
        0,
        2
      )
      .map(
        (part) =>
          part[0]
            ?.toUpperCase() ||
          ""
      )
      .join("")
      .slice(
        0,
        2
      ) ||
    "ON"
  );
}

function getUserViewModel(
  rawUser = undefined,
  options = {}
) {
  const authenticated =
    options.authenticated ===
      true;

  const raw =
    rawUser ===
      undefined
      ? authUserFallback()
      : rawUser;

  if (
    !raw ||
    !authenticated
  ) {
    return {
      hasUser: false,
      role: "",
      roles: [],
      isAdmin: false,
      isUser: false,
      displayName:
        "Usuario",
      initials:
        "ON",
      avatarUrl: "",
      hasAvatar: false,
      slug: "",
    };
  }

  const publicUser =
    isFunction(
      AppCore.publicUser
    )
      ? (
          AppCore.publicUser(
            raw
          ) ||
          raw
        )
      : raw;

  const role =
    AppCore.normalizeRole(
      publicUser?.role ||
      raw.role ||
      raw.rol ||
      options.role ||
      authRoleFallback()
    );

  const displayName =
    cleanText(
      publicUser
        ?.displayName ||
      publicUser
        ?.fullName ||
      publicUser
        ?.name ||
      raw.displayName ||
      raw.fullName ||
      raw.name ||
      raw.nombre ||
      raw.username ||
      "Usuario",
      "Usuario"
    );

  const slug =
    normalizeUserSlug(
      publicUser?.slug ||
      raw.slug ||
      raw.lookup?.slug ||
      raw.profile?.slug ||
      raw.username ||
      raw.userId ||
      raw.id ||
      ""
    );

  const avatarUrl =
    safeImageUrl(
      publicUser?.avatarUrl ||
      publicUser?.avatar ||
      publicUser?.picture ||
      publicUser?.photoUrl ||
      raw.avatarUrl ||
      raw.avatar ||
      raw.picture ||
      raw.photoUrl ||
      raw.profile?.avatarUrl ||
      ""
    );

  return {
    hasUser: true,

    id:
      publicUser?.id ||
      raw.id ||
      raw.userId ||
      null,

    userId:
      publicUser?.userId ||
      raw.userId ||
      raw.id ||
      null,

    username:
      publicUser?.username ||
      raw.username ||
      "",

    slug,

    displayName,
    name:
      displayName,

    role,
    rol:
      role,

    roles:
      [role],

    roleLabel:
      role === "admin"
        ? "Administrador"
        : "Estándar",

    isAdmin:
      role === "admin",

    isUser:
      role === "user",

    avatarUrl,

    hasAvatar:
      Boolean(
        avatarUrl
      ),

    initials:
      initialsFrom(
        displayName
      ),
  };
}

/* =========================================================
   PATHS
========================================================= */

function normalizePath(
  path = "/"
) {
  try {
    return (
      normalizeRoutePath(
        path
      ) ||
      "/"
    );
  } catch {
    let value =
      cleanText(
        path,
        "/"
      )
        .split("?")[0]
        .split("#")[0]
        .replace(
          /\\/g,
          "/"
        );

    if (
      !value.startsWith(
        "/"
      )
    ) {
      value =
        `/${value}`;
    }

    value =
      value.replace(
        /\/{2,}/g,
        "/"
      );

    if (
      value.length > 1
    ) {
      value =
        value.replace(
          /\/+$/g,
          ""
        ) ||
        "/";
    }

    return (
      value ||
      "/"
    );
  }
}

function routeLookupPath(
  path = "/"
) {
  const clean =
    normalizePath(
      path
    );

  if (
    !clean.startsWith(
      USER_HOME_PREFIX
    )
  ) {
    return clean;
  }

  const rest =
    clean.slice(
      USER_HOME_PREFIX.length
    );

  const [
    ,
    ...segments
  ] =
    rest.split(
      "/"
    );

  /*
    /@slug es el home privado canónico.
    config.js ya define ROUTES.home como canonical home.
  */
  return segments.length
    ? normalizePath(
        `/${segments.join("/")}`
      )
    : normalizePath(
        ROUTES.home ||
        ROUTES.privateHome ||
        ROUTES.dashboard ||
        "/dashboard"
      );
}

function currentPublicPath(
  state = readCoreState()
) {
  const router =
    getRouter();

  try {
    return (
      router
        ?.getCurrentPublicPath
        ?.() ||
      router
        ?.getCurrentPath
        ?.() ||
      state.publicPath ||
      (
        isBrowser()
          ? `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
          : "/"
      )
    );
  } catch {
    return "/";
  }
}

function currentCanonicalPath(
  state = readCoreState()
) {
  const router =
    getRouter();

  try {
    return normalizePath(
      router
        ?.getCurrentCanonicalPath
        ?.() ||
      state.canonicalPath ||
      state.route ||
      routeLookupPath(
        currentPublicPath(
          state
        )
      )
    );
  } catch {
    return "/";
  }
}

function isUnsafePath(
  path = ""
) {
  const raw =
    cleanText(
      path,
      ""
    );

  const lower =
    raw.toLowerCase();

  return Boolean(
    !raw ||
    raw.startsWith(
      "//"
    ) ||
    /^[a-z][a-z0-9+.-]*:/i.test(
      raw
    ) ||
    /[\r\n\t\\]/.test(
      raw
    ) ||
    /[?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=/i.test(
      raw
    ) ||
    lower.startsWith(
      "javascript:"
    ) ||
    lower.startsWith(
      "data:"
    ) ||
    lower.startsWith(
      "vbscript:"
    )
  );
}

function safePath(
  path = "/",
  fallback = "/"
) {
  const raw =
    cleanText(
      path ||
      fallback,
      fallback
    );

  if (
    isUnsafePath(
      raw
    )
  ) {
    return fallback;
  }

  const normalized =
    normalizePath(
      raw
    );

  try {
    if (
      isBlockedRoutePath(
        normalized
      )
    ) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return (
    normalized ||
    fallback
  );
}

function userHomeHref(
  user
) {
  const slug =
    normalizeUserSlug(
      user?.slug ||
      ""
    );

  if (!slug) {
    return "/";
  }

  try {
    return (
      buildUserHomeRoute(
        slug
      ) ||
      `${USER_HOME_PREFIX}${slug}`
    );
  } catch {
    return (
      `${USER_HOME_PREFIX}${slug}`
    );
  }
}

function routeHref(
  routePath = "/",
  user
) {
  const path =
    safePath(
      routePath,
      "/"
    );

  const slug =
    normalizeUserSlug(
      user?.slug ||
      ""
    );

  if (!slug) {
    return path;
  }

  try {
    return buildUserScopedRoute(
      slug,
      path
    );
  } catch {
    return path ===
      (
        ROUTES.home ||
        ROUTES.privateHome ||
        ROUTES.dashboard ||
        "/dashboard"
      )
      ? `${USER_HOME_PREFIX}${slug}`
      : `${USER_HOME_PREFIX}${slug}${path}`;
  }
}

/* =========================================================
   MENU
========================================================= */

function routeIcon(
  path = "/"
) {
  const clean =
    normalizePath(
      path
    );

  const privateHome =
    normalizePath(
      ROUTES.home ||
      ROUTES.privateHome ||
      ROUTES.dashboard ||
      "/dashboard"
    );

  if (
    clean === "/" ||
    clean === privateHome
  ) {
    return "home";
  }

  if (
    clean ===
    ROUTES.incidencias
  ) {
    return "incidencias";
  }

  if (
    clean ===
    ROUTES.facturas
  ) {
    return "facturas";
  }

  if (
    clean ===
    ROUTES.clientes
  ) {
    return "clientes";
  }

  if (
    clean ===
    ROUTES.usuarios
  ) {
    return "usuarios";
  }

  if (
    clean ===
    ROUTES.servidor
  ) {
    return "servidor";
  }

  if (
    clean ===
    ROUTES.cuenta
  ) {
    return "cuenta";
  }

  return "home";
}

function routeLabel(
  route = null
) {
  const path =
    normalizePath(
      route?.path ||
      "/"
    );

  if (
    route?.title
  ) {
    return cleanText(
      route.title
    );
  }

  if (
    route?.label
  ) {
    return cleanText(
      route.label
    );
  }

  const privateHome =
    normalizePath(
      ROUTES.home ||
      ROUTES.privateHome ||
      ROUTES.dashboard ||
      "/dashboard"
    );

  if (
    path === "/" ||
    path === privateHome
  ) {
    return "Inicio";
  }

  return cleanText(
    route?.name ||
    path.replace(
      /^\/+/,
      ""
    ),
    path
  );
}

function isRouteAdmin(
  route = null
) {
  return Boolean(
    route?.adminOnly ||
    route?.requiresAdmin
  );
}

function isRouteVisible(
  route = null,
  user = null
) {
  if (
    !user?.hasUser ||
    !route?.path
  ) {
    return false;
  }

  if (
    route.public ===
    true
  ) {
    return false;
  }

  if (
    route.hideShell ===
      true ||
    route.layout ===
      "auth"
  ) {
    return false;
  }

  if (
    route.showInSidebar ===
      false ||
    route.sidebar ===
      false
  ) {
    return false;
  }

  const path =
    normalizePath(
      route.path
    );

  if (!path) {
    return false;
  }

  try {
    if (
      isBlockedRoutePath(
        path
      )
    ) {
      return false;
    }
  } catch {
    return false;
  }

  if (
    isRouteAdmin(
      route
    ) &&
    user.isAdmin !==
      true
  ) {
    return false;
  }

  return true;
}

function isActive(
  path = "/",
  current = "/"
) {
  const itemPath =
    routeLookupPath(
      path
    );

  const activePath =
    routeLookupPath(
      current
    );

  if (
    itemPath ===
    normalizePath(
      ROUTES.home ||
      ROUTES.privateHome ||
      ROUTES.dashboard ||
      "/dashboard"
    )
  ) {
    return (
      activePath ===
      itemPath
    );
  }

  return (
    activePath ===
      itemPath ||
    activePath.startsWith(
      `${itemPath}/`
    )
  );
}

function getMenuItems(
  context
) {
  if (
    !context?.authenticated ||
    !context.user?.hasUser
  ) {
    return [];
  }

  const user =
    context.user;

  const seen =
    new Set();

  return getImmutableRoutes()
    .filter(
      (route) =>
        isRouteVisible(
          route,
          user
        )
    )
    .map(
      (route, index) => {
        const path =
          normalizePath(
            route.path
          );

        const lookup =
          routeLookupPath(
            path
          );

        if (
          seen.has(
            lookup
          )
        ) {
          return null;
        }

        seen.add(
          lookup
        );

        return {
          key:
            cleanText(
              route.sidebarKey ||
              route.viewKey ||
              route.name ||
              lookup,
              lookup
            ),

          href:
            routeHref(
              path,
              user
            ),

          path,

          label:
            routeLabel(
              route
            ),

          icon:
            routeIcon(
              path
            ),

          active:
            isActive(
              path,
              context.canonicalPath
            ),

          adminOnly:
            isRouteAdmin(
              route
            ),

          order:
            Number(
              route.order ||
              index ||
              0
            ),
        };
      }
    )
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.order -
          b.order ||
        a.href.localeCompare(
          b.href
        )
    );
}

/* =========================================================
   CONTEXT / VISIBILITY
========================================================= */

function getCurrentRoute(
  publicPath = "",
  canonicalPath = ""
) {
  const router =
    getRouter();

  try {
    const direct =
      router
        ?.getCurrentRoute
        ?.();

    if (direct) {
      return direct;
    }

    return (
      router
        ?.getRoute
        ?.(
          publicPath ||
          canonicalPath ||
          "/"
        ) ||
      null
    );
  } catch {
    return null;
  }
}

function getContext(
  overrides = {}
) {
  const supplied =
    isObject(overrides)
      ? overrides
      : {};

  const state =
    readCoreState();

  const auth =
    supplied.Auth ||
    getAuth();

  const router =
    supplied.Router ||
    getRouter();

  const authenticated =
    typeof state.authenticated ===
      "boolean"
      ? state.authenticated ===
        true
      : isAuthenticated();

  const rawUser =
    state.user ||
    state.currentUser ||
    authUserFallback();

  const role =
    supplied.role ||
    state.role ||
    state.rol ||
    authRoleFallback();

  const user =
    getUserViewModel(
      rawUser,
      {
        authenticated,
        role,
      }
    );

  const suppliedPublicPath =
    cleanText(
      supplied.publicPath,
      ""
    );

  const publicPath =
    suppliedPublicPath ||
    currentPublicPath(
      state
    );

  const suppliedCanonicalPath =
    cleanText(
      supplied.canonicalPath ||
      supplied.route?.path,
      ""
    );

  const canonicalPath =
    suppliedCanonicalPath
      ? normalizePath(
suppliedCanonicalPath
        )
      : currentCanonicalPath(
state
        );

  const route =
    supplied.route !==
      undefined
      ? supplied.route
      : getCurrentRoute(
publicPath,
canonicalPath
        );

  return {
    AppCore,
    Auth:
      auth,
    Router:
      router,

    user,

    role:
      user.role ||
      "",

    authenticated,

    hasUser:
      user.hasUser ===
      true,

    hasSession:
      authenticated &&
      user.hasUser ===
        true,

    publicPath,
    canonicalPath,
    route,
  };
}
function shouldRenderSidebar(
  context
) {
  if (
    !context?.authenticated ||
    !context.user?.hasUser
  ) {
    return false;
  }

  const route =
    context.route;

  if (
    route?.public ===
    true
  ) {
    return false;
  }

  if (
    route?.hideShell ===
    true
  ) {
    return false;
  }

  if (
    route?.layout ===
    "auth"
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   DOCUMENT STATE
========================================================= */

function syncDocumentSidebarState(
  open = false,
  options = {}
) {
  if (!isBrowser()) {
    return false;
  }

  const hidden =
    options?.hidden ===
    true;

  const nextOpen =
    hidden
      ? false
      : open === true;

  const state =
    hidden
      ? "hidden"
      : (
          nextOpen
            ? "open"
            : "collapsed"
        );

  const nodes =
    [
      document.documentElement,
      document.body,
    ].filter(Boolean);

  let changed = false;

  for (
    const node
    of nodes
  ) {
    changed =
      setClassState(
        node,
        "sidebar-open",
        state === "open"
      ) ||
      changed;

    changed =
      setClassState(
        node,
        "sidebar-collapsed",
        state ===
          "collapsed"
      ) ||
      changed;

    changed =
      setClassState(
        node,
        "sidebar-hidden",
        state === "hidden"
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        node,
        "sidebarState",
        state
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        node,
        "sidebarOpen",
        state === "open"
          ? "true"
          : "false"
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        node,
        "sidebarHidden",
        state === "hidden"
          ? "true"
          : "false"
      ) ||
      changed;
  }

  return changed;
}

/* =========================================================
   TEMPLATE CALLBACKS
========================================================= */

function onTemplateOpenChange(
  open = false
) {
  const next =
    open === true;

  const changed =
    sidebarOpen !==
    next;

  sidebarOpen =
    next;

  try {
    syncDocumentSidebarState(
      sidebarOpen
    );
  } catch {
    // noop
  }

  if (changed) {
    try {
      AppCore
        .setSidebarOpen
        ?.(
          sidebarOpen
        );
    } catch {
      // noop
    }
  }

  return sidebarOpen;
}

async function onTemplateLogout() {
  await handleLogout();
}

/* =========================================================
   FAST DOM SYNC
========================================================= */

function getRootOpenState() {
  if (!root) {
    return null;
  }

  if (
    root.dataset?.open ===
    "true"
  ) {
    return true;
  }

  if (
    root.dataset?.open ===
    "false"
  ) {
    return false;
  }

  return root.classList
    ?.contains(
      "is-open"
    ) === true;
}

function syncRootOpenState() {
  if (!root) {
    return false;
  }

  const current =
    getRootOpenState();

  if (
    current ===
    sidebarOpen
  ) {
    return false;
  }

  try {
    return setSidebarTemplateOpen(
      root,
      sidebarOpen,
      {
        onOpenChange:
          onTemplateOpenChange,
      }
    );
  } catch {
    return false;
  }
}

function syncActiveMenuDom(
  context,
  items = []
) {
  if (!root) {
    return false;
  }

  const activeItem =
    items.find(
      (item) =>
        item.active ===
        true
    ) ||
    null;

  const activeKey =
    cleanText(
      activeItem?.key,
      ""
    );

  let changed = false;

  const links =
    root.querySelectorAll?.(
      "[data-sidebar-nav-link='true'][data-sidebar-key]"
    ) ||
    [];

  for (
    const link
    of links
  ) {
    const key =
      cleanText(
        link.dataset
          ?.sidebarKey,
        ""
      );

    const href =
      cleanText(
        link.dataset
          ?.route ||
        link.getAttribute?.(
          "href"
        ),
        ""
      );

    const active =
      activeKey
        ? key ===
          activeKey
        : isActive(
            href,
            context?.canonicalPath ||
            "/"
          );

    changed =
      setClassState(
        link,
        "is-active",
        active
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        link,
        "sidebarActive",
        active
          ? "true"
          : "false"
      ) ||
      changed;

    if (active) {
      changed =
        setAttributeIfChanged(
          link,
          "aria-current",
          "page"
        ) ||
        changed;
    } else if (
      link.hasAttribute?.(
        "aria-current"
      )
    ) {
      link.removeAttribute(
        "aria-current"
      );

      changed =
        true;
    }

    const item =
      link.closest?.(
        "[data-sidebar-item='true']"
      );

    if (item) {
      changed =
        setDatasetIfChanged(
          item,
          "active",
          active
            ? "true"
            : "false"
        ) ||
        changed;

      changed =
        setClassState(
          item,
          "is-active",
          active
        ) ||
        changed;
    }
  }

  if (changed) {
    metrics.activePatches +=
      1;
  }

  return changed;
}

function setLogoutBusy(
  busy = false
) {
  if (!root) {
    return false;
  }

  const button =
    root.querySelector?.(
      "[data-sidebar-logout='true']"
    );

  if (!button) {
    return false;
  }

  const value =
    busy === true;

  let changed = false;

  try {
    if (
      "disabled" in button &&
      button.disabled !==
        value
    ) {
      button.disabled =
        value;

      changed = true;
    }

    changed =
      setAttributeIfChanged(
        button,
        "aria-disabled",
        value
          ? "true"
          : "false"
      ) ||
      changed;

    changed =
      setAttributeIfChanged(
        button,
        "aria-busy",
        value
          ? "true"
          : "false"
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        button,
        "logoutBusy",
        value
          ? "true"
          : "false"
      ) ||
      changed;

    return changed;
  } catch {
    return false;
  }
}

/* =========================================================
   STRUCTURE SIGNATURE
========================================================= */

function getSidebarStructureSignature(
  context,
  items = []
) {
  const user =
    context?.user ||
    {};

  const brandHref =
    userHomeHref(
      user
    );

  const cuentaHref =
    routeHref(
      ROUTES.cuenta ||
      "/cuenta",
      user
    );

  const ajustesHref =
    routeHref(
      ROUTES.ajustes ||
      "/ajustes",
      user
    );

  const userPart =
    [
      user.id ||
        "",
      user.userId ||
        "",
      user.username ||
        "",
      user.slug ||
        "",
      user.displayName ||
        "",
      user.role ||
        "",
      user.avatarUrl ||
        "",
      user.initials ||
        "",
    ]
      .map(
        stablePart
      )
      .join("~");

  const menuPart =
    items
      .map(
        (item) =>
          [
            item.key,
            item.href,
            item.path,
            item.label,
            item.icon,
            item.adminOnly
              ? "1"
              : "0",
            item.order,
          ]
            .map(
              stablePart
            )
            .join("~")
      )
      .join("|");

  return [
    SIDEBAR_VERSION,
    userPart,
    stablePart(
      brandHref
    ),
    stablePart(
      cuentaHref
    ),
    stablePart(
      ajustesHref
    ),
    menuPart,
  ].join("||");
}

/* =========================================================
   MOUNT / RENDER
========================================================= */

function mountRoot(
  nextRoot,
  signature = ""
) {
  const mount =
    getMount();

  if (
    !mount ||
    !nextRoot
  ) {
    return null;
  }

  unbindTemplate();

  clear(
    mount
  );

  mount.appendChild(
    nextRoot
  );

  root =
    nextRoot;

  setHidden(
    mount,
    false
  );

  setHidden(
    root,
    false
  );

  cleanupTemplate =
    bindSidebarTemplate(
      root,
      {
        onOpenChange:
          onTemplateOpenChange,

        onLogout:
          onTemplateLogout,
      }
    );

  lastStructureSignature =
    signature;

  cacheDom();

  mounted =
    true;

  metrics.structuralRenders +=
    1;

  return root;
}

function showExistingSidebar(
  context,
  items = []
) {
  const mount =
    getMount();

  if (
    !mount ||
    !root ||
    !rootIsMounted()
  ) {
    return false;
  }

  setHidden(
    mount,
    false
  );

  setHidden(
    root,
    false
  );

  ensureTemplateBound();
  syncRootOpenState();

  syncActiveMenuDom(
    context,
    items
  );

  syncDocumentSidebarState(
    sidebarOpen
  );

  cacheDom();

  mounted =
    true;

  metrics.fastSyncs +=
    1;

  return true;
}

function hideSidebar(
  options = {}
) {
  const mount =
    getMount();

  if (
    options.purge ===
    true
  ) {
    try {
      syncDocumentSidebarState(
        false,
        {
          hidden: true,
        }
      );
    } catch {
      // noop
    }

    purgeSidebarDom();

    return true;
  }

  /*
    No desmontamos ni desregistramos listeners por cambiar a una ruta
    pública. El DOM queda oculto y puede reutilizarse al volver al panel.
  */
  try {
    closeSidebarDropdown(
      root,
      {
        focus: false,
      }
    );
  } catch {
    // noop
  }

  if (root) {
    setHidden(
      root,
      true
    );
  }

  if (mount) {
    setHidden(
      mount,
      true
    );
  }

  try {
    syncDocumentSidebarState(
      false,
      {
        hidden: true,
      }
    );
  } catch {
    // noop
  }

  mounted =
    false;

  cacheDom();

  metrics.hiddenSyncs +=
    1;

  return true;
}

function renderSidebar(
  context = getContext()
) {
  if (
    !shouldRenderSidebar(
      context
    )
  ) {
    hideSidebar();

    return SidebarUI;
  }

  const user =
    context.user;

  const items =
    getMenuItems(
      context
    );

  const signature =
    getSidebarStructureSignature(
      context,
      items
    );

  /*
    Ruta distinta, misma persona, mismo menú:
    NO reconstruimos sidebar, avatar, iconos ni listeners.
  */
  if (
    rootIsMounted() &&
    signature ===
      lastStructureSignature
  ) {
    showExistingSidebar(
      context,
      items
    );

    return SidebarUI;
  }

  const nextRoot =
    createSidebarTemplate({
      id:
        SIDEBAR_ROOT_ID,

      open:
        sidebarOpen,

      user,

      items,

      brandLabel:
        BRAND_LABEL,

      brandHref:
        userHomeHref(
          user
        ),

      accountLinks: {
        cuentaHref:
          routeHref(
            ROUTES.cuenta ||
            "/cuenta",
            user
          ),

        ajustesHref:
          routeHref(
            ROUTES.ajustes ||
            "/ajustes",
            user
          ),
      },
    });

  if (!nextRoot) {
    hideSidebar();

    return SidebarUI;
  }

  mountRoot(
    nextRoot,
    signature
  );

  syncDocumentSidebarState(
    sidebarOpen
  );

  syncActiveMenuDom(
    context,
    items
  );

  return SidebarUI;
}

function sync(
  context = {}
) {
  if (!isBrowser()) {
    return SidebarUI;
  }

  return renderSidebar(
    getContext(
      isObject(context)
        ? context
        : {}
    )
  );
}

/* =========================================================
   ACTIONS
========================================================= */

async function navigateTo(
  path = "/",
  options = {}
) {
  const router =
    getRouter();

  const context =
    getContext();

  const target =
    routeHref(
      path,
      context.user
    );

  if (
    !router ||
    !target ||
    !isFunction(
      router.navigate
    )
  ) {
    return false;
  }

  const result =
    await router.navigate(
      target,
      {
        source:
          "sidebar",

        ...options,
      }
    );

  closeSidebar();

  return (
    result !== false
  );
}

function setSidebarOpen(
  value = true
) {
  const next =
    value === true;

  if (
    sidebarOpen === next &&
    (
      !root ||
      getRootOpenState() ===
        next
    )
  ) {
    return sidebarOpen;
  }

  sidebarOpen =
    next;

  if (root) {
    const current =
      getRootOpenState();

    if (
      current !==
      sidebarOpen
    ) {
      setSidebarTemplateOpen(
        root,
        sidebarOpen,
        {
          onOpenChange:
            onTemplateOpenChange,
        }
      );
    } else {
      onTemplateOpenChange(
        sidebarOpen
      );
    }
  } else {
    onTemplateOpenChange(
      sidebarOpen
    );
  }

  return sidebarOpen;
}

function openSidebar() {
  return setSidebarOpen(
    true
  );
}

function closeSidebar() {
  try {
    closeSidebarDropdown(
      root,
      {
        focus: false,
      }
    );
  } catch {
    // noop
  }

  return setSidebarOpen(
    false
  );
}

function toggleSidebar() {
  return setSidebarOpen(
    !sidebarOpen
  );
}

async function handleLogout(
  options = {}
) {
  if (
    logoutInFlight
  ) {
    return false;
  }

  const auth =
    getAuth();

  const router =
    getRouter();

  logoutInFlight =
    true;

  setLogoutBusy(
    true
  );

  try {
    closeSidebarDropdown(
      root,
      {
        focus: false,
      }
    );
  } catch {
    // noop
  }

  try {
    await auth
      ?.logout
      ?.(
        options
      );
  } catch {
    // logout remoto best-effort
  } finally {
    logoutInFlight =
      false;

    sidebarOpen =
      false;

    /*
      Logout sí purga el DOM porque puede contener nombre/avatar
      del usuario que acaba de cerrar sesión.
    */
    hideSidebar({
      purge: true,
    });

    if (
      isFunction(
        router?.replace
      )
    ) {
      await router.replace(
        ROUTES.login ||
        "/login",
        {
          source:
            "sidebar.logout",

          replaceState:
            true,
        }
      );
    }
  }

  return true;
}

/* =========================================================
   REGISTRATION
========================================================= */

function registerModule() {
  try {
    if (
      isObject(
        AppCore.ui
      )
    ) {
      AppCore.ui.sidebar =
        SidebarUI;
    }

    AppCore
      .registerModule
      ?.(
        "sidebar",
        SidebarUI,
        {
          overwrite:
            true,
        }
      );

    return true;
  } catch {
    return false;
  }
}

function unregisterModule() {
  try {
    if (
      AppCore.ui?.sidebar ===
      SidebarUI
    ) {
      delete AppCore.ui.sidebar;
    }

    AppCore.modules
      ?.remove
      ?.(
        "sidebar"
      );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   LIFECYCLE
========================================================= */

function init() {
  if (
    !initialized
  ) {
    initialized =
      true;

    registerModule();
  }

  sync();

  return SidebarUI;
}

function destroy() {
  unbindTemplate();

  try {
    syncDocumentSidebarState(
      false,
      {
        hidden: true,
      }
    );
  } catch {
    // noop
  }

  const mount =
    getMount();

  if (mount) {
    clear(
      mount
    );

    setHidden(
      mount,
      true
    );
  }

  mounted =
    false;

  initialized =
    false;

  sidebarOpen =
    false;

  logoutInFlight =
    false;

  root =
    null;

  lastStructureSignature =
    "";

  clearDomCache();
  unregisterModule();

  metrics.purges +=
    1;

  return SidebarUI;
}

/* =========================================================
   SNAPSHOT
========================================================= */

function getSnapshot() {
  const context =
    getContext();

  const items =
    shouldRenderSidebar(
      context
    )
      ? getMenuItems(
          context
        )
      : [];

  return Object.freeze({
    version:
      SIDEBAR_VERSION,

    initialized,
    mounted,

    hasRoot:
      Boolean(
        root
      ),

    rootMounted:
      rootIsMounted(),

    open:
      sidebarOpen,

    logoutInFlight,

    publicPath:
      redact(
        context.publicPath
      ),

    canonicalPath:
      redact(
        context.canonicalPath
      ),

    authenticated:
      context.authenticated,

    isAdmin:
      context.user
        ?.isAdmin ===
      true,

    user:
      context.user
        ?.hasUser
        ? {
            hasUser:
              true,

            id:
              context.user.id ||
              null,

            userId:
              context.user.userId ||
              null,

            slug:
              context.user.slug ||
              null,

            username:
              context.user.username ||
              "",

            displayName:
              context.user.displayName,

            role:
              context.user.role,

            roleLabel:
              context.user.roleLabel,

            isAdmin:
              context.user.isAdmin,

            avatarUrl:
              context.user.avatarUrl
                ? "***"
                : "",

            hasAvatar:
              context.user.hasAvatar,

            initials:
              context.user.initials,
          }
        : null,

    menuItems:
      items.map(
        (item) => ({
          href:
            redact(
              item.href
            ),

          label:
            item.label,

          active:
            item.active,

          adminOnly:
            item.adminOnly,
        })
      ),

    metrics:
      Object.freeze({
        structuralRenders:
          metrics.structuralRenders,

        fastSyncs:
          metrics.fastSyncs,

        activePatches:
          metrics.activePatches,

        hiddenSyncs:
          metrics.hiddenSyncs,

        purges:
          metrics.purges,
      }),

    policy:
      Object.freeze({
        templateOwnsVisualDom:
          true,

        structuralRenderReuse:
          true,

        routeChangeFastSync:
          true,

        routerContextReuse:
          true,

        idempotentDocumentState:
          true,

        purgeUserDomOnLogout:
          true,

        noHttp:
          true,

        noToast:
          true,

        noStore:
          true,

        noServices:
          true,
      }),
  });
}

/* =========================================================
   API
========================================================= */

export const SidebarUI = {
  version:
    SIDEBAR_VERSION,

  init,
  destroy,

  cleanup:
    destroy,

  sync,

  render:
    sync,

  refresh:
    sync,

  navigateTo,

  navigate:
    navigateTo,

  setSidebarOpen,
  openSidebar,
  closeSidebar,
  toggleSidebar,

  handleLogout,

  logout:
    handleLogout,

  isAdmin,

  getSnapshot,

  getState:
    getSnapshot,

  getDebugSnapshot:
    getSnapshot,

  get initialized() {
    return initialized;
  },

  get mounted() {
    return mounted;
  },

  get logoutInFlight() {
    return logoutInFlight;
  },
};

export default SidebarUI;
