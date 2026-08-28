from pathlib import Path

LOGIN = Path('src/views/public/login/index.js')
SPA = Path('.github/ci/validate_spa_contracts.sh')

text = LOGIN.read_text(encoding='utf-8')
text = text.replace(
    'export const LOGIN_VIEW_VERSION = "login.view.public.controller.v6-post-auth-transition";',
    'export const LOGIN_VIEW_VERSION = "login.view.public.controller.v7-document-handoff";',
    1,
)

old_helpers = '''function resolvePostLoginTarget(result = {}, auth = null) {
  return (
    result?.postLoginTarget ||
    result?.homePath ||
    result?.defaultHome ||
    auth?.getPostLoginTarget?.() ||
    auth?.getDefaultHome?.() ||
    "/"
  );
}

async function goAfterLogin(result = {}, context = {}) {
  const router = getRouter(context);
  const auth = getAuth(context);

  if (!router) {
    throw new Error("Router no disponible.");
  }

  const target = resolvePostLoginTarget(result, auth);
  const options = {
    source: SOURCE,
    replaceState: true,
  };

  if (isFunction(router.goAfterLogin)) {
    return router.goAfterLogin(target, options);
  }

  if (isFunction(router.replace)) {
    return router.replace(target, options);
  }

  if (isFunction(router.navigate)) {
    return router.navigate(target, options);
  }

  throw new Error("Router no permite navegación.");
}
'''

new_helpers = '''function redirectTargetFromLocation(router = null) {
  if (!isBrowser()) return "";

  let candidate = "";

  try {
    candidate = new URLSearchParams(
      window.location.search || ""
    ).get("redirect") || "";
  } catch {
    return "";
  }

  candidate = cleanText(candidate, "");

  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\\r\\n\\t\\\\]/.test(candidate)
  ) {
    return "";
  }

  try {
    const match = router?.getRouteMatch?.(candidate);

    if (
      !match?.route ||
      match.route.public === true ||
      match.blocked === true ||
      match.sensitive === true
    ) {
      return "";
    }

    const safe = isFunction(router?.safePublicPath)
      ? router.safePublicPath(candidate)
      : candidate;

    if (
      !safe ||
      !safe.startsWith("/") ||
      safe.startsWith("//")
    ) {
      return "";
    }

    return safe;
  } catch {
    return "";
  }
}

function resolvePostLoginTarget(result = {}, auth = null, context = {}) {
  const router = getRouter(context);
  const redirected = redirectTargetFromLocation(router);

  if (redirected) return redirected;

  const fallback = cleanText(
    result?.postLoginTarget ||
      result?.homePath ||
      result?.defaultHome ||
      auth?.getPostLoginTarget?.() ||
      auth?.getDefaultHome?.() ||
      "/",
    "/"
  );

  try {
    const safe = isFunction(router?.safePublicPath)
      ? router.safePublicPath(fallback)
      : fallback;
    const match = router?.getRouteMatch?.(safe);

    if (
      match?.route &&
      match.route.public !== true &&
      match.blocked !== true &&
      match.sensitive !== true
    ) {
      return safe;
    }
  } catch {
    // fallback abajo
  }

  return cleanText(
    auth?.getDefaultHome?.() || "/",
    "/"
  );
}

async function handoffAfterLogin(result = {}, context = {}) {
  const router = getRouter(context);
  const auth = getAuth(context);

  if (auth?.isAuthenticated?.() !== true) {
    throw new Error("La sesión no quedó autenticada.");
  }

  const target = resolvePostLoginTarget(result, auth, context);

  /*
    La frontera guest -> private es una frontera de documento.
    El panel nace desde boot con Auth ya válida; no intentamos convertir
    el runtime público del login en el runtime privado en caliente.
  */
  if (isBrowser()) {
    try {
      window.location.replace(target);

      return {
        ok: true,
        documentNavigation: true,
        target,
      };
    } catch {
      try {
        window.location.assign(target);

        return {
          ok: true,
          documentNavigation: true,
          target,
        };
      } catch {
        // fallback Router para entornos sin navegación de documento.
      }
    }
  }

  const options = {
    source: "login.view.fallback-router",
    replaceState: true,
    force: true,
  };

  if (isFunction(router?.goAfterLogin)) {
    return router.goAfterLogin(target, options);
  }

  if (isFunction(router?.replace)) {
    return router.replace(target, options);
  }

  if (isFunction(router?.navigate)) {
    return router.navigate(target, options);
  }

  throw new Error("No se pudo abandonar la vista de acceso.");
}
'''

if old_helpers not in text:
    raise SystemExit('login helper anchor missing')
text = text.replace(old_helpers, new_helpers, 1)

old_submit = '''      auth.syncAuthState?.();

      const target = resolvePostLoginTarget(result || {}, auth);
      let navigation = await goAfterLogin(result || {}, {
        ...context,
        Auth: auth,
      });

      if (!mounted) return false;

      if (
        isBrowser() &&
        auth.isAuthenticated?.() === true &&
        window.location.pathname === "/login"
      ) {
        const router = getRouter(context);

        if (isFunction(router?.replace)) {
          navigation = await router.replace(target, {
            source: "login.view.recovery",
            replaceState: true,
            force: true,
          });
        }
      }

      if (!mounted) return false;

      if (navigation === false || navigation?.ok === false) {
        throw new Error(
          "No se pudo completar la navegación tras el login."
        );
      }

      if (
        isBrowser() &&
        auth.isAuthenticated?.() === true &&
        window.location.pathname === "/login"
      ) {
        window.location.replace(target);
      }

      return true;
'''

new_submit = '''      auth.syncAuthState?.();

      const navigation = await handoffAfterLogin(result || {}, {
        ...context,
        Auth: auth,
      });

      if (!mounted) return false;

      if (navigation === false || navigation?.ok === false) {
        throw new Error(
          "No se pudo completar la salida del login."
        );
      }

      return true;
'''

if old_submit not in text:
    raise SystemExit('login submit navigation anchor missing')
text = text.replace(old_submit, new_submit, 1)
LOGIN.write_text(text, encoding='utf-8')

spa = SPA.read_text(encoding='utf-8')
spa = spa.replace('        "goAfterLogin",', '        "handoffAfterLogin",', 1)
needle = 'node --experimental-default-type=module .github/scripts/private_runtime_auth_contract.mjs\n'
replacement = needle + 'node --experimental-default-type=module .github/scripts/login_document_handoff_contract.mjs\n'
if needle not in spa:
    raise SystemExit('validate_spa_contracts insertion anchor missing')
spa = spa.replace(needle, replacement, 1)
SPA.write_text(spa, encoding='utf-8')

print('login document handoff refactor applied')
