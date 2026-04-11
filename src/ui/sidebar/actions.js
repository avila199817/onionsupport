/* =========================================================
   Onion SPA - Sidebar Actions
   Archivo: src/ui/sidebar/actions.js

   Responsabilidades:
   - centralizar acciones de negocio del sidebar
   - logout robusto aunque falle el endpoint remoto
   - desactivar controles durante acciones críticas
   - limpiar sesión local con fallback seguro
   - resincronizar UI del sidebar tras logout
========================================================= */

export async function handleLogout({
  AppCore,
  Auth,
  Router,
  closeDropdown,
  renderUser,
  applyRoleVisibility,
  closeSidebarOnMobileAfterNavigation,
  getElements,
  setLogoutInFlight,
  isLogoutInFlight,
}) {
  if (typeof isLogoutInFlight === "function" && isLogoutInFlight()) {
    return;
  }

  if (typeof setLogoutInFlight === "function") {
    setLogoutInFlight(true);
  }

  const elements =
    typeof getElements === "function"
      ? getElements()
      : null;

  const logoutBtn = elements?.logoutBtn || null;

  closeDropdown?.();

  if (logoutBtn) {
    logoutBtn.disabled = true;
    logoutBtn.setAttribute("aria-disabled", "true");
  }

  AppCore?.setLoading?.(true);

  try {
    await Auth.logout({
      silent: true,
      notifyServer: true,
    });
  } catch (error) {
    AppCore?.utils?.warn?.(
      "Logout remoto falló, se limpiará sesión local igualmente.",
      error
    );
  } finally {
    try {
      if (typeof AppCore?.clearSession === "function") {
        AppCore.clearSession();
      } else if (AppCore?.state) {
        AppCore.state.user = null;
        AppCore.state.token = null;
        AppCore.state.role = null;
        AppCore.state.authenticated = false;
      }

      renderUser?.();
      applyRoleVisibility?.();
      closeDropdown?.();
      closeSidebarOnMobileAfterNavigation?.();

      AppCore?.setLoading?.(false);

      Router.navigate("/login", {
        replaceState: true,
        force: true,
      });
    } finally {
      if (typeof setLogoutInFlight === "function") {
        setLogoutInFlight(false);
      }

      if (logoutBtn) {
        logoutBtn.disabled = false;
        logoutBtn.setAttribute("aria-disabled", "false");
      }
    }
  }
}
