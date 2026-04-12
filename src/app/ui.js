/* =========================================================
   Onion SPA - App UI Systems
   Archivo: src/app/ui.js

   Responsabilidades:
   - sincronizar UI usuario global
   - inicializar sistemas UI compartidos
   - registrar módulos UI en AppCore
   - refresco UI ante cambio idioma
   - evitar roturas si faltan deps
   - bridge global Toast
========================================================= */

/* =========================================================
   USER UI
========================================================= */
export function syncUserUI(
  AppCore
) {
  if (!AppCore) {
    console.warn(
      "[Onion App UI] syncUserUI sin AppCore"
    );
    return;
  }

  if (
    typeof AppCore.syncUserUI ===
    "function"
  ) {
    AppCore.syncUserUI();
  }

  AppCore.events?.emit?.(
    "app:user-ui:sync",
    {
      user:
        AppCore.state?.user ??
        null,
      authenticated:
        Boolean(
          AppCore.state
            ?.authenticated
        ),
      role:
        AppCore.state?.role ??
        null,
    }
  );
}

/* =========================================================
   LANGUAGE BIND
========================================================= */
export function bindAppLanguageSync(
  AppCore
) {
  if (
    !AppCore?.events?.on
  ) {
    return;
  }

  if (
    AppCore.__appLangUiBound
  ) {
    return;
  }

  AppCore.events.on(
    "app:lang:change",
    () => {
      syncUserUI(
        AppCore
      );

      if (
        AppCore.dom
          ?.topbarTitle &&
        typeof document !==
          "undefined" &&
        document.title
      ) {
        AppCore.dom.topbarTitle.textContent =
          document.title;
      }
    }
  );

  AppCore.__appLangUiBound =
    true;
}

/* =========================================================
   MODULE REGISTRY
========================================================= */
function registerAppModule(
  AppCore,
  name,
  moduleRef
) {
  if (
    !AppCore?.modules ||
    !name ||
    !moduleRef
  ) {
    return;
  }

  if (
    typeof AppCore.modules.has ===
      "function" &&
    AppCore.modules.has(
      name
    )
  ) {
    return;
  }

  if (
    typeof AppCore.modules
      .register ===
    "function"
  ) {
    AppCore.modules.register(
      name,
      moduleRef
    );
  }
}

/* =========================================================
   TOAST BRIDGE
========================================================= */
function bindToastBridge(
  AppCore,
  Toast
) {
  if (
    !AppCore ||
    !Toast
  ) {
    return;
  }

  AppCore.showToast = (
    message = "",
    type = "info",
    options = {}
  ) => {
    const normalizedType =
      String(type || "info")
        .trim()
        .toLowerCase();

    const fallback =
      () =>
        Toast.show?.({
          ...options,
          type:
            normalizedType,
          message,
        });

    switch (
      normalizedType
    ) {
      case "success":
        return (
          Toast.success?.(
            message,
            options
          ) ?? fallback()
        );

      case "error":
        return (
          Toast.error?.(
            message,
            options
          ) ?? fallback()
        );

      case "warning":
        return (
          Toast.warning?.(
            message,
            options
          ) ?? fallback()
        );

      case "loading":
        return (
          Toast.loading?.(
            message,
            options
          ) ?? fallback()
        );

      case "info":
      default:
        return (
          Toast.info?.(
            message,
            options
          ) ?? fallback()
        );
    }
  };
}

/* =========================================================
   INIT
========================================================= */
export function initUISystems({
  AppCore,
  Toast,
  SidebarUI,
  TopbarUI,
  state,
}) {
  if (!AppCore) {
    console.warn(
      "[Onion App UI] initUISystems sin AppCore"
    );
    return;
  }

  if (
    state?.uiInitialized
  ) {
    return;
  }

  registerAppModule(
    AppCore,
    "toast",
    Toast
  );

  registerAppModule(
    AppCore,
    "sidebar",
    SidebarUI
  );

  registerAppModule(
    AppCore,
    "topbar",
    TopbarUI
  );

  if (
    typeof Toast?.init ===
    "function"
  ) {
    Toast.init();
    bindToastBridge(
      AppCore,
      Toast
    );
  }

  if (
    typeof SidebarUI?.init ===
    "function"
  ) {
    SidebarUI.init();
  }

  if (
    typeof TopbarUI?.init ===
    "function"
  ) {
    TopbarUI.init();
  }

  bindAppLanguageSync(
    AppCore
  );

  syncUserUI(
    AppCore
  );

  if (state) {
    state.uiInitialized =
      true;
  }
}
