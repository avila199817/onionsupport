/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/login/index.js

   LOGIN VIEW · SIMPLE
   - renderiza template
   - conecta helpers DOM de la vista
   - llama Auth.login o executor custom
   - Auth aplica sesión; la vista sólo navega si sigue en /login
   - custom executor puede sincronizar sesión vía syncSession()
   - anti doble submit local/global
   - Toast canónico único
   - sin HTTP directo, Store paralelo ni Router paralelo
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import Toast from "../../ui/toast/index.js";

import getLoginTemplate from "./login.template.js";

import {
  loadRememberedIdentifier,
  createLoginPayload,
  validateLoginPayload,
  getFirstLoginError,
  normalizeAuthResult,
  resolveAuthErrorMessage,
  persistRememberedIdentifier,
  syncSession,
  resolveLoginRedirect,
  shouldRedirectAfterLogin,
  hasUsableToken,
  hasUsableUser,
  safeText,
} from "./login.helpers.js";

import {
  getLoginRefs,
  clearLoginErrors,
  applyLoginErrors,
  setGlobalLoginError,
  setLoginLoading,
  unlockLoginForm,
  focusLoginPrimaryField,
  readLoginFormState,
  bindLoginInputClearers,
  bindThemeToggle,
  bindLoginSubmit,
  bindLoginPasswordFields,
  destroyLoginPasswordFields,
  getLoginDomSnapshot,
} from "./login.dom.js";

export const LOGIN_VIEW_VERSION = "21.0.0-simple";

const SOURCE = "login.view";
const LOGIN_ROUTE = "/login";
const DEFAULT_HOME = "/";
const DEFAULT_2FA = "/2fa";
const INSTANCE_KEY = "__ONION_LOGIN_VIEW_INSTANCE__";
const RUNTIME_KEY = "__ONION_LOGIN_VIEW__";
const GLOBAL_SUBMIT_TIMEOUT_MS = 45_000;
const SUCCESS_TOAST_DEDUPE_MS = 1_600;

const LOGIN_EVENTS = Object.freeze({
  ready: "auth:login:view:ready",
  submitStart: "auth:login:view:submit:start",
  submitDone: "auth:login:view:submit:done",
  submitBlocked: "auth:login:view:submit:blocked",
  submitUnlocked: "auth:login:view:submit:unlocked",
  error: "auth:login:view:error",
  navigationStart: "auth:login:view:navigation:start",
  navigationDone: "auth:login:view:navigation:done",
  navigationError: "auth:login:view:navigation:error",
  destroyed: "auth:login:view:destroyed",
});

let globalSubmitPromise = null;
let globalSubmitFingerprint = "";
let globalSubmitStartedAt = 0;
let lastSuccessToastAt = 0;
let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFn = (value) => typeof value === "function";
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const safeObject = (value) => (isObject(value) ? value : {});

function now() {
  try { return Date.now(); } catch { return 0; }
}

function iso(ms = now()) {
  try { return new Date(ms).toISOString(); } catch { return ""; }
}

function normalizeError(error = null) {
  const source = error?.error || error?.reason || error;
  if (!source) return null;

  return {
    name: safeText(source?.name || source?.constructor?.name, "Error"),
    message: safeText(source?.message || source?.reason || source, "Error"),
    code: source?.code || source?.data?.code || source?.response?.data?.code || null,
    status: source?.status || source?.statusCode || source?.response?.status || 0,
    at: iso(),
  };
}

function emit(eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = {
    source: SOURCE,
    version: LOGIN_VIEW_VERSION,
    at: iso(),
    ...safeObject(payload),
  };

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function warn(...args) {
  try { AppCore?.utils?.warn?.("[LoginView]", ...args); } catch {}
}

function log(...args) {
  try { AppCore?.utils?.log?.("[LoginView]", ...args); } catch {}
}

/* =========================================================
   PATH / ROUTER
========================================================= */

function normalizePath(path = DEFAULT_HOME) {
  let value = safeText(path, DEFAULT_HOME).replace(/\\/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  value = value.replace(/\/+/g, "/");
  return value.length > 1 ? value.replace(/\/+$/g, "") || DEFAULT_HOME : value;
}

function stripSearchHash(path = DEFAULT_HOME) {
  return normalizePath(path).split("?")[0].split("#")[0] || DEFAULT_HOME;
}

function currentPath() {
  if (!isBrowser()) return AppCore?.state?.publicPath || AppCore?.state?.route || DEFAULT_HOME;

  try {
    const { pathname, search, hash } = window.location;
    if (hash?.startsWith("#/") || hash?.startsWith("#!")) return normalizePath(hash.replace(/^#!?\/?/, "/"));
    return `${pathname || DEFAULT_HOME}${search || ""}${hash || ""}`;
  } catch {
    return DEFAULT_HOME;
  }
}

function currentCanonicalPath() {
  const statePath = AppCore?.state?.canonicalPath || AppCore?.state?.route || "";
  return stripSearchHash(statePath || currentPath());
}

function isLoginRoute(path = currentCanonicalPath()) {
  const clean = stripSearchHash(path);
  return clean === LOGIN_ROUTE || clean.startsWith(`${LOGIN_ROUTE}/`);
}

function isUnsafeRedirect(path = "") {
  const raw = safeText(path, "");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || /[\r\n\t\\]/.test(raw)) return true;

  try {
    const decoded = decodeURIComponent(raw).trim().replace(/\\/g, "/");
    return decoded.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(decoded) || /[\r\n\t]/.test(decoded);
  } catch {
    return true;
  }
}

function safeInternalPath(path = "", fallback = DEFAULT_HOME, { allowLogin = false } = {}) {
  const candidate = normalizePath(path || fallback || DEFAULT_HOME);
  const fallbackPath = normalizePath(fallback || DEFAULT_HOME);

  if (isUnsafeRedirect(candidate)) return fallbackPath;
  if (!allowLogin && isLoginRoute(candidate)) return fallbackPath;

  return candidate;
}

function configuredHome() {
  return safeInternalPath(
    AppCore?.config?.routes?.home || AppCore?.config?.auth?.homeRoute || AppCore?.config?.auth?.postLoginFallback || DEFAULT_HOME,
    DEFAULT_HOME
  );
}

function getRouter() {
  try {
    return AppCore?.Router || AppCore?.router || AppCore?.modules?.get?.("Router") || AppCore?.modules?.get?.("router") || null;
  } catch {
    return null;
  }
}

async function navigateTo(path = DEFAULT_HOME, options = {}) {
  const target = safeInternalPath(path, configuredHome(), { allowLogin: options.allowLogin === true });
  const router = getRouter();

  emit(LOGIN_EVENTS.navigationStart, { target, method: router ? "router" : "location" });

  const navOptions = {
    replaceState: options.replaceState !== false,
    force: true,
    forceRender: true,
    source: SOURCE,
    fromLogin: true,
    reason: options.reason || "login-navigation",
  };

  try {
    if (isFn(router?.navigate)) {
      await router.navigate(target, navOptions);
      emit(LOGIN_EVENTS.navigationDone, { target, method: "router.navigate" });
      return true;
    }

    if (isFn(router?.replace)) {
      await router.replace(target, navOptions);
      emit(LOGIN_EVENTS.navigationDone, { target, method: "router.replace" });
      return true;
    }

    if (isFn(AppCore?.navigate)) {
      await AppCore.navigate(target, navOptions);
      emit(LOGIN_EVENTS.navigationDone, { target, method: "AppCore.navigate" });
      return true;
    }
  } catch (error) {
    warn("navigation failed", normalizeError(error));
  }

  if (!isBrowser()) return false;

  try {
    window.location.assign(target);
    emit(LOGIN_EVENTS.navigationDone, { target, method: "window.location.assign" });
    return true;
  } catch (error) {
    emit(LOGIN_EVENTS.navigationError, { target, error: normalizeError(error) });
    return false;
  }
}

/* =========================================================
   CHROME / LOADER
========================================================= */

function hideLoader() {
  if (!isBrowser()) return false;

  try {
    document.documentElement?.classList?.remove?.("app-loading", "app-booting", "loading");
    document.body?.classList?.remove?.("app-loading", "app-booting", "loading", "is-loading", "is-booting");
    if (document.documentElement?.dataset) document.documentElement.dataset.appLoading = "false";
    if (document.body?.dataset) document.body.dataset.appLoading = "false";
  } catch {}

  const loader = AppCore?.dom?.loader || document.querySelector?.("#app-loader,[data-app-loader],.app-loader");

  try {
    if (loader) {
      loader.hidden = true;
      loader.setAttribute("aria-hidden", "true");
      loader.setAttribute("aria-busy", "false");
      loader.classList.remove("is-visible", "is-entering", "app-loader--visible");
      loader.classList.add("is-hidden");
    }
  } catch {}

  try { AppCore?.setLoading?.(false); } catch {}
  return true;
}

function setAuthScreen(active = true) {
  if (!isBrowser()) return false;

  try {
    document.body?.classList?.toggle?.("auth-screen", active);
    document.body?.classList?.toggle?.("login-no-scroll", active);
    document.body?.classList?.toggle?.("route-auth", active);
    document.documentElement?.classList?.toggle?.("route-auth", active);

    if (document.body?.dataset) {
      document.body.dataset.authScreen = active ? "true" : "false";
      document.body.dataset.routeMode = active ? "auth" : "app";
      document.body.dataset.chrome = active ? "hidden" : "visible";
    }

    if (document.documentElement?.dataset) {
      document.documentElement.dataset.routeMode = active ? "auth" : "app";
      document.documentElement.dataset.chrome = active ? "hidden" : "visible";
    }
  } catch {}

  try {
    AppCore?.setState?.({
      authScreen: active,
      routeMode: active ? "auth" : "app",
      chromeVisible: !active,
      chromeHidden: active,
      shellHidden: active,
      routeShellHidden: active,
    }, { source: SOURCE, emit: false, silent: true });
  } catch {}

  hideLoader();
  return true;
}

/* =========================================================
   TOAST
========================================================= */

function dismissToast(id) {
  if (id === null || id === undefined || id === "") return;
  try { Toast.dismiss?.(id); } catch {}
}

function toastError(message = "") {
  try { Toast.error?.(message); } catch {}
}

function toastInfo(message = "") {
  try { Toast.info?.(message); } catch {}
}

function toastSuccess(message = "") {
  try { Toast.success?.(message); } catch {}
}

function toastLoading(message = "") {
  try {
    return Toast.loading?.(message, { id: "login:loading", persist: true, duration: 0 });
  } catch {
    return null;
  }
}

/* =========================================================
   GLOBAL SUBMIT LOCK
========================================================= */

function fingerprint(payload = {}) {
  return [
    safeText(payload.identifier || payload.email || payload.username || payload.user || payload.login || "", "").toLowerCase(),
    payload.remember || payload.rememberMe ? "1" : "0",
  ].join("|");
}

function clearGlobalSubmit() {
  globalSubmitPromise = null;
  globalSubmitFingerprint = "";
  globalSubmitStartedAt = 0;
}

function clearStaleGlobalSubmit() {
  if (!globalSubmitPromise) return false;
  if (!globalSubmitStartedAt || now() - globalSubmitStartedAt > GLOBAL_SUBMIT_TIMEOUT_MS) {
    clearGlobalSubmit();
    return true;
  }
  return false;
}

function hasGlobalSubmit() {
  clearStaleGlobalSubmit();
  return Boolean(globalSubmitPromise);
}

function runGlobalSubmit(work, submitFingerprint = "") {
  clearStaleGlobalSubmit();
  if (globalSubmitPromise) return globalSubmitPromise;

  let timer = null;

  globalSubmitStartedAt = now();
  globalSubmitFingerprint = submitFingerprint;

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("LOGIN_SUBMIT_TIMEOUT");
      error.code = "LOGIN_SUBMIT_TIMEOUT";
      reject(error);
    }, GLOBAL_SUBMIT_TIMEOUT_MS);
  });

  globalSubmitPromise = Promise.race([Promise.resolve().then(work), timeout])
    .finally(() => {
      try { clearTimeout(timer); } catch {}
      clearGlobalSubmit();
    });

  return globalSubmitPromise;
}

/* =========================================================
   AUTH EXECUTOR
========================================================= */

function moduleAuth() {
  try {
    return AppCore?.modules?.get?.("Auth") || AppCore?.modules?.get?.("auth") || AppCore?.Auth || AppCore?.auth || null;
  } catch {
    return null;
  }
}

function resolveLoginExecutor(deps = {}) {
  const authModule = moduleAuth();

  const candidates = [
    { fn: deps.onSubmit, owner: deps, source: "deps.onSubmit", custom: true },
    { fn: deps.submitLogin, owner: deps, source: "deps.submitLogin", custom: true },
    { fn: deps.login, owner: deps, source: "deps.login", custom: true },
    { fn: Auth?.login, owner: Auth, source: "Auth.login", custom: false },
    { fn: authModule?.login, owner: authModule, source: "moduleAuth.login", custom: false },
  ];

  return candidates.find((item) => isFn(item.fn)) || null;
}

function buildLoginOptions(deps = {}) {
  return {
    source: SOURCE,
    navigate: false,
    skipNavigate: true,
    skipNavigation: true,
    skipRedirect: true,
    noRedirect: true,
    preserveCurrentRoute: true,
    preserveRoute: true,
    preservePublicPath: true,
    emitLoginSuccessEvent: deps.emitLoginSuccessEvent === true,
    redirectTo: deps.redirectTo,
    redirect: deps.redirect,
    target: deps.target,
  };
}

function stateToken() {
  return safeText(
    AppCore?.state?.token ||
      AppCore?.state?.accessToken ||
      AppCore?.state?.access_token ||
      AppCore?.state?.session?.token ||
      AppCore?.state?.session?.accessToken ||
      "",
    ""
  );
}

function stateUser() {
  return AppCore?.state?.user || AppCore?.state?.currentUser || AppCore?.state?.authUser || AppCore?.state?.sessionUser || AppCore?.state?.session?.user || null;
}

function buildCoreAuthResult() {
  const token = stateToken();
  const user = stateUser();

  if (!hasUsableToken(token) || !hasUsableUser(user)) return null;

  return normalizeAuthResult({
    ok: true,
    success: true,
    authenticated: true,
    token,
    accessToken: token,
    user,
    usuario: user,
    source: "core-state",
  });
}

function normalizeLoginResult(rawResult = null) {
  const normalized = normalizeAuthResult(rawResult || {});

  if (normalized.authenticated || normalized.requires2FA || normalized.explicitFailure) return normalized;

  return buildCoreAuthResult() || normalized;
}

function isAuthenticatedResult(auth = {}) {
  if (!auth || auth.requires2FA || auth.explicitFailure) return false;
  if (auth.authenticated === true) return true;
  return Boolean(hasUsableToken(auth.token || auth.accessToken || auth.access_token || stateToken()) && hasUsableUser(auth.user || auth.usuario || stateUser()));
}

function is2FAResult(auth = {}) {
  const status = safeText(auth?.status, "").toLowerCase();
  return Boolean(auth?.requires2FA === true || ["2fa_required", "mfa_required", "two_factor_required", "otp_required"].includes(status));
}

/* =========================================================
   INSTANCE
========================================================= */

function destroyPrevious(container) {
  try {
    const previous = container?.[INSTANCE_KEY];
    if (previous?.destroy) {
      previous.destroy({ remount: true, preserveAuthScreen: true });
      return true;
    }
  } catch {}

  return false;
}

function storeInstance(container, instance) {
  if (!container || !instance) return false;

  try {
    Object.defineProperty(container, INSTANCE_KEY, { value: instance, configurable: true, enumerable: false, writable: true });
  } catch {
    try { container[INSTANCE_KEY] = instance; } catch {}
  }

  lastInstance = instance;

  try {
    if (isBrowser()) window[RUNTIME_KEY] = instance;
  } catch {}

  return true;
}

function clearInstance(container, instance) {
  try {
    if (container?.[INSTANCE_KEY] === instance) delete container[INSTANCE_KEY];
  } catch {}

  if (lastInstance === instance) lastInstance = null;
  return true;
}

function renderTemplate(container, html = "") {
  const markup = String(html || "");

  if (!isBrowser()) {
    try { container.innerHTML = markup; return true; } catch { return false; }
  }

  try {
    const template = document.createElement("template");
    template.innerHTML = markup;
    container.replaceChildren(template.content.cloneNode(true));
    return true;
  } catch {
    try { container.innerHTML = markup; return true; } catch { return false; }
  }
}

function appName() {
  return safeText(AppCore?.config?.appName, "Onion Support");
}

function forgotHref(deps = {}) {
  return safeText(deps.forgotPasswordHref, "") || safeText(AppCore?.config?.routes?.forgotPassword, "") || "/forgot-password";
}

/* =========================================================
   VIEW
========================================================= */

export function renderLoginView(container, deps = {}) {
  if (!container) throw new Error("[LoginView] container requerido.");

  destroyPrevious(container);
  setAuthScreen(true);

  let mounted = true;
  let submitting = false;
  let leavingLogin = false;
  let loadingToastId = null;
  let watchdog = null;

  const rememberedIdentifier = loadRememberedIdentifier();

  renderTemplate(container, getLoginTemplate({
    appName: appName(),
    identifier: rememberedIdentifier,
    forgotPasswordHref: forgotHref(deps),
    ...safeObject(deps),
  }));

  const refs = getLoginRefs(container);
  const executor = resolveLoginExecutor(deps);

  const submitLabel = safeText(deps.submitLabel, "Entrar al panel");
  const loadingLabel = safeText(deps.loadingLabel, "Accediendo...");

  const passwordBindings = bindLoginPasswordFields(container);
  const disposers = [
    bindLoginInputClearers(refs, () => clearLoginErrors(refs)),
    bindThemeToggle(refs, toggleTheme),
    bindLoginSubmit(refs, handleSubmit),
  ].filter(Boolean);

  function closeLoadingToast() {
    dismissToast(loadingToastId);
    loadingToastId = null;
  }

  function stopWatchdog() {
    if (!watchdog) return;
    try { clearTimeout(watchdog); } catch {}
    watchdog = null;
  }

  function startWatchdog() {
    stopWatchdog();

    watchdog = setTimeout(() => {
      watchdog = null;
      closeLoadingToast();
      clearGlobalSubmit();

      if (!mounted || !isLoginRoute()) return;

      submitting = false;
      leavingLogin = false;
      unlockLoginForm(refs, { submitLabel, loadingLabel });
      emit(LOGIN_EVENTS.submitUnlocked, { reason: "watchdog" });
      toastError("Se recuperó el formulario. Inténtalo de nuevo.");
    }, GLOBAL_SUBMIT_TIMEOUT_MS + 2_500);
  }

  function setSubmitting(value = false) {
    submitting = Boolean(value);

    try {
      if (refs.form?.dataset) {
        if (submitting) refs.form.dataset.loginSubmitting = "1";
        else delete refs.form.dataset.loginSubmitting;
      }
    } catch {}

    setLoginLoading(refs, submitting, { submitLabel, loadingLabel });
  }

  function unlock(reason = "manual") {
    closeLoadingToast();
    stopWatchdog();
    clearGlobalSubmit();

    submitting = false;

    if (mounted) unlockLoginForm(refs, { submitLabel, loadingLabel });
    emit(LOGIN_EVENTS.submitUnlocked, { reason });
    return true;
  }

  async function navigateAfter(auth = {}) {
    if (deps.navigate === false || deps.skipNavigate === true || deps.manualNavigate === true) return false;
    if (!shouldRedirectAfterLogin(auth, deps)) return false;
    if (!isLoginRoute()) return false;

    const target = safeInternalPath(
      resolveLoginRedirect(auth, deps) || (auth.requires2FA ? DEFAULT_2FA : configuredHome()),
      auth.requires2FA ? DEFAULT_2FA : configuredHome(),
      { allowLogin: false }
    );

    leavingLogin = true;
    return navigateTo(target, { replaceState: true, reason: auth.requires2FA ? "login-2fa" : "login-success", allowLogin: auth.requires2FA === true });
  }

  async function handleSubmit(event) {
    try { event?.preventDefault?.(); } catch {}

    if (submitting || leavingLogin || hasGlobalSubmit() || refs.form?.dataset?.loginSubmitting === "1") {
      emit(LOGIN_EVENTS.submitBlocked, { submitting, leavingLogin, hasGlobalSubmit: hasGlobalSubmit(), fingerprint: globalSubmitFingerprint });
      toastInfo("Ya hay un inicio de sesión en curso.");
      return;
    }

    clearLoginErrors(refs);

    const formState = readLoginFormState(refs);
    const payload = createLoginPayload(formState);
    const validationErrors = validateLoginPayload(payload);

    if (Object.keys(validationErrors).length) {
      applyLoginErrors(refs, validationErrors);
      toastError(getFirstLoginError(validationErrors) || "Revisa el formulario.");
      return;
    }

    if (!executor) {
      const message = "No se encontró el módulo de autenticación.";
      setGlobalLoginError(refs, message);
      toastError(message);
      return;
    }

    persistRememberedIdentifier(payload);

    const submitFingerprint = fingerprint(payload);

    try {
      setSubmitting(true);
      startWatchdog();

      loadingToastId = toastLoading("Validando credenciales...");
      emit(LOGIN_EVENTS.submitStart, { executor: executor.source, customExecutor: executor.custom, fingerprint: submitFingerprint });

      const rawResult = await runGlobalSubmit(
        () => executor.fn.call(executor.owner || null, payload, buildLoginOptions(deps)),
        submitFingerprint
      );

      const auth = normalizeLoginResult(rawResult);
      closeLoadingToast();

      if (!mounted) return;

      if (is2FAResult(auth)) {
        toastInfo(auth.message || "Verificación adicional requerida.");
        await navigateAfter({ ...auth, requires2FA: true, redirectTo: auth.redirectTo || DEFAULT_2FA });
        emit(LOGIN_EVENTS.submitDone, { ok: true, twoFactor: true });
        return;
      }

      if (!isAuthenticatedResult(auth)) throw rawResult || new Error("INVALID_LOGIN_RESULT");
      if (executor.custom === true) syncSession(auth, { source: SOURCE });

      if (now() - lastSuccessToastAt > SUCCESS_TOAST_DEDUPE_MS) {
        lastSuccessToastAt = now();
        toastSuccess(auth.message || "Sesión iniciada correctamente.");
      }

      const navigated = await navigateAfter(auth);
      emit(LOGIN_EVENTS.submitDone, { ok: true, authenticated: true, navigated });
    } catch (error) {
      closeLoadingToast();

      const normalized = normalizeError(error);
      const message = normalized?.code === "LOGIN_SUBMIT_TIMEOUT" || normalized?.message === "LOGIN_SUBMIT_TIMEOUT"
        ? "La solicitud tardó demasiado. Revisa tu conexión y vuelve a intentarlo."
        : resolveAuthErrorMessage(error);

      setGlobalLoginError(refs, message);
      toastError(message);
      emit(LOGIN_EVENTS.error, { message, error: normalized });
      warn("login error", normalized);
    } finally {
      stopWatchdog();
      closeLoadingToast();

      if (!leavingLogin || isLoginRoute()) {
        leavingLogin = false;
        unlock("finally");
      }
    }
  }

  function toggleTheme() {
    const current = safeText(AppCore?.state?.theme || document.documentElement?.dataset?.theme || AppCore?.config?.defaultTheme || "dark", "dark").toLowerCase();
    const next = current === "light" ? "dark" : "light";

    try { AppCore?.setTheme?.(next); }
    catch {
      try { document.documentElement.dataset.theme = next; } catch {}
    }

    toastInfo(`Tema ${next} activado.`);
  }

  focusLoginPrimaryField(refs, { rememberedIdentifier });
  hideLoader();

  emit(LOGIN_EVENTS.ready, { route: LOGIN_ROUTE, view: "login", executor: executor?.source || null });

  const instance = {
    version: LOGIN_VIEW_VERSION,

    destroy(options = {}) {
      mounted = false;
      stopWatchdog();
      closeLoadingToast();

      for (const dispose of disposers.splice(0)) {
        try { dispose?.(); } catch {}
      }

      try { destroyLoginPasswordFields(container); }
      catch {
        for (const binding of passwordBindings || []) {
          try {
            if (isFn(binding)) binding();
            else if (isFn(binding?.destroy)) binding.destroy();
            else if (isFn(binding?.unbind)) binding.unbind();
            else if (isFn(binding?.dispose)) binding.dispose();
          } catch {}
        }
      }

      if (options.preserveAuthScreen !== true && options.remount !== true && !isLoginRoute()) setAuthScreen(false);

      clearInstance(container, instance);
      emit(LOGIN_EVENTS.destroyed, { remount: options.remount === true, preserveAuthScreen: options.preserveAuthScreen === true, leavingLogin });
    },

    unlock,

    getSnapshot() {
      return {
        version: LOGIN_VIEW_VERSION,
        source: SOURCE,
        mounted: Boolean(mounted),
        submitting: Boolean(submitting),
        leavingLogin: Boolean(leavingLogin),
        currentPath: currentPath(),
        currentCanonicalPath: currentCanonicalPath(),
        stillOnLogin: isLoginRoute(),
        hasGlobalSubmit: hasGlobalSubmit(),
        globalSubmitFingerprint,
        globalSubmitStartedAt,
        globalSubmitStartedAtIso: globalSubmitStartedAt ? iso(globalSubmitStartedAt) : "",
        hasLoadingToast: Boolean(loadingToastId),
        hasWatchdog: Boolean(watchdog),
        executor: executor?.source || null,
        customExecutor: executor?.custom === true,
        authenticated: Boolean(AppCore?.state?.authenticated),
        hasStateToken: Boolean(stateToken()),
        hasStateUser: hasUsableUser(stateUser()),
        dom: getLoginDomSnapshot(refs),
        at: iso(),
      };
    },

    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };

  storeInstance(container, instance);
  log("ready", { executor: executor?.source || null });

  return instance;
}

/* =========================================================
   COMPAT EXPORTS
========================================================= */

export function init(container, deps = {}) {
  return renderLoginView(container, deps);
}

export function mount(container, deps = {}) {
  return renderLoginView(container, deps);
}

export function destroy(options = {}) {
  if (lastInstance?.destroy) {
    lastInstance.destroy(options);
    return true;
  }

  return false;
}

export function getSnapshot() {
  if (lastInstance?.getSnapshot) return lastInstance.getSnapshot();

  return {
    version: LOGIN_VIEW_VERSION,
    source: SOURCE,
    mounted: false,
    currentPath: isBrowser() ? currentPath() : "",
    currentCanonicalPath: isBrowser() ? currentCanonicalPath() : "",
    stillOnLogin: isBrowser() ? isLoginRoute() : false,
    hasGlobalSubmit: hasGlobalSubmit(),
    at: iso(),
  };
}

export const LoginView = Object.assign(
  function LoginViewCompat(container, deps = {}) {
    return renderLoginView(container, deps);
  },
  {
    version: LOGIN_VIEW_VERSION,
    render: renderLoginView,
    init,
    mount,
    destroy,
    getSnapshot,
    getDebugSnapshot: getSnapshot,
  }
);

try {
  if (isBrowser()) window[RUNTIME_KEY] = LoginView;
} catch {}

export { renderLoginView as render };

export default LoginView;
