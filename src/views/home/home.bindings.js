/* =========================================================
   Onion SPA - Home Bindings
   Archivo: src/views/home/home.bindings.js

   Responsabilidades:
   - enlazar eventos de la vista Home
   - registrar y limpiar listeners del DOM
   - preparar hooks para futura interacción
   - mantener la vista desacoplada del template
   - exponer cleanup robusto para re-render seguro
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isElement(value) {
  return (
    value instanceof Element ||
    value instanceof HTMLDocument
  );
}

function safeQuery(root, selector) {
  if (!isElement(root) || !selector) {
    return null;
  }

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function safeQueryAll(root, selector) {
  if (!isElement(root) || !selector) {
    return [];
  }

  try {
    return Array.from(
      root.querySelectorAll(selector)
    );
  } catch {
    return [];
  }
}

function createDisposerBag() {
  const disposers = [];

  return {
    add(disposer) {
      if (typeof disposer === "function") {
        disposers.push(disposer);
      }
    },

    flush() {
      while (disposers.length) {
        const disposer =
          disposers.pop();

        try {
          disposer?.();
        } catch (error) {
          console.error(
            "[HomeBindings] cleanup error",
            error
          );
        }
      }
    },
  };
}

function addEventListenerSafe(
  target,
  eventName,
  handler,
  options
) {
  if (
    !target ||
    typeof target.addEventListener !==
      "function" ||
    typeof handler !== "function"
  ) {
    return () => {};
  }

  target.addEventListener(
    eventName,
    handler,
    options
  );

  return () => {
    try {
      target.removeEventListener(
        eventName,
        handler,
        options
      );
    } catch {}
  };
}

function safeEmit(eventName, payload) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch (error) {
    console.warn(
      "[HomeBindings] emit warning",
      error
    );
  }
}

/* =========================================================
   DOM HELPERS
========================================================= */

function getHomeRoot(container) {
  return (
    safeQuery(
      container,
      '[data-home-view="true"]'
    ) ||
    safeQuery(
      container,
      ".home-view"
    ) ||
    container ||
    null
  );
}

function collectDom(root) {
  return {
    root,
    hero:
      safeQuery(
        root,
        ".home-hero"
      ),
    title:
      safeQuery(
        root,
        ".home-hero__title"
      ),
    subtitle:
      safeQuery(
        root,
        ".home-hero__subtitle"
      ),
    mainCard:
      safeQuery(
        root,
        ".home-main-card"
      ),
    mainSurface:
      safeQuery(
        root,
        ".home-main-card__surface"
      ),
    miniStats:
      safeQueryAll(
        root,
        ".home-mini-stat"
      ),
  };
}

/* =========================================================
   BINDERS
========================================================= */

function bindViewLifecycle({
  root,
  dom,
  bag,
}) {
  safeEmit(
    "home:view:bound",
    {
      root,
      hasHero: Boolean(dom.hero),
      hasMainCard: Boolean(
        dom.mainCard
      ),
      statCards:
        dom.miniStats.length,
    }
  );

  bag.add(() => {
    safeEmit(
      "home:view:unbound",
      {
        root,
      }
    );
  });
}

function bindWindowResize({
  root,
  bag,
}) {
  if (!isBrowser()) {
    return;
  }

  const onResize = () => {
    safeEmit(
      "home:view:resize",
      {
        width:
          window.innerWidth,
        height:
          window.innerHeight,
        root,
      }
    );
  };

  bag.add(
    addEventListenerSafe(
      window,
      "resize",
      onResize,
      { passive: true }
    )
  );
}

function bindCardHoverTelemetry({
  dom,
  bag,
}) {
  if (!dom.mainSurface) {
    return;
  }

  const onPointerEnter = () => {
    safeEmit(
      "home:card:hover",
      {
        section: "main",
      }
    );
  };

  bag.add(
    addEventListenerSafe(
      dom.mainSurface,
      "pointerenter",
      onPointerEnter,
      { passive: true }
    )
  );
}

function bindMiniStatsTelemetry({
  dom,
  bag,
}) {
  if (!Array.isArray(dom.miniStats)) {
    return;
  }

  dom.miniStats.forEach(
    (item, index) => {
      const onClick = () => {
        safeEmit(
          "home:stat:click",
          {
            index,
            text:
              item?.textContent
                ?.trim?.() || "",
          }
        );
      };

      bag.add(
        addEventListenerSafe(
          item,
          "click",
          onClick
        )
      );
    }
  );
}

/* =========================================================
   MAIN BIND
========================================================= */

export function bindHomeView({
  container,
} = {}) {
  if (!isBrowser()) {
    return () => {};
  }

  if (!isElement(container)) {
    console.warn(
      "[HomeBindings] container inválido"
    );
    return () => {};
  }

  const root =
    getHomeRoot(container);

  if (!root) {
    console.warn(
      "[HomeBindings] root no encontrado"
    );
    return () => {};
  }

  const dom =
    collectDom(root);

  const bag =
    createDisposerBag();

  bindViewLifecycle({
    root,
    dom,
    bag,
  });

  bindWindowResize({
    root,
    bag,
  });

  bindCardHoverTelemetry({
    dom,
    bag,
  });

  bindMiniStatsTelemetry({
    dom,
    bag,
  });

  return function cleanupHomeView() {
    bag.flush();
  };
}

export default bindHomeView;
