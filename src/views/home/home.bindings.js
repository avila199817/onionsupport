/* =========================================================
   Onion SPA - Home Bindings
   Archivo: src/views/home/home.bindings.js

   FINAL PRO SYSTEM · DOM BINDINGS REAL · 10/10

   Responsabilidades:
   - enlazar eventos reales de la vista Home
   - registrar y limpiar listeners del DOM
   - delegar acciones sobre data-home-action y data-home-card
   - mantener la vista desacoplada del template
   - conectar DOM con home.actions.js
   - exponer cleanup robusto para re-render seguro
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  handleHomeCardAction,
  handleHomeQuickAction,
} from "./home.actions.js";

import {
  patchHomeUi,
  setHomeAction,
  setHomeSelectedCard,
} from "./home.store.js";

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

function safeText(
  value = "",
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function safeQuery(
  root,
  selector
) {
  if (
    !isElement(root) ||
    !selector
  ) {
    return null;
  }

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function safeQueryAll(
  root,
  selector
) {
  if (
    !isElement(root) ||
    !selector
  ) {
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

function safeEmit(
  eventName,
  payload = {}
) {
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

    hero: safeQuery(
      root,
      ".home-hero"
    ),

    kpis: safeQueryAll(
      root,
      ".home-kpi"
    ),

    panels: safeQueryAll(
      root,
      ".home-panel"
    ),

    actions: safeQueryAll(
      root,
      "[data-home-action]"
    ),

    cards: safeQueryAll(
      root,
      "[data-home-card]"
    ),
  };
}

function extractActionPayload(
  element
) {
  if (!element) {
    return {
      action: "",
      href: "",
      card: "",
      source: "",
    };
  }

  return {
    action: safeText(
      element.getAttribute(
        "data-home-action"
      ),
      ""
    ),
    href: safeText(
      element.getAttribute("href"),
      ""
    ),
    card: safeText(
      element.getAttribute(
        "data-home-card"
      ),
      ""
    ),
    source: safeText(
      element.getAttribute(
        "data-home-source"
      ),
      ""
    ),
  };
}

function extractCardPayload(
  element
) {
  if (!element) {
    return {
      card: "",
      action: "",
    };
  }

  return {
    card: safeText(
      element.getAttribute(
        "data-home-card"
      ),
      ""
    ),
    action: safeText(
      element.getAttribute(
        "data-home-action"
      ),
      ""
    ),
  };
}

/* =========================================================
   VISUAL STATE
========================================================= */

function clearSelectedCards(root) {
  safeQueryAll(
    root,
    '[data-home-card].is-active'
  ).forEach((node) => {
    try {
      node.classList.remove(
        "is-active"
      );
      node.setAttribute(
        "aria-pressed",
        "false"
      );
    } catch {}
  });
}

function markSelectedCard(
  root,
  cardKey = ""
) {
  const normalized =
    safeText(cardKey, "");

  if (!normalized) {
    return;
  }

  const selector = `[data-home-card="${CSS?.escape ? CSS.escape(normalized) : normalized}"]`;
  const node =
    safeQuery(root, selector);

  if (!node) {
    return;
  }

  try {
    node.classList.add(
      "is-active"
    );
    node.setAttribute(
      "aria-pressed",
      "true"
    );
  } catch {}
}

function syncSelectedCardVisual(
  root,
  cardKey = ""
) {
  clearSelectedCards(root);
  markSelectedCard(root, cardKey);
}

/* =========================================================
   ACTION EXECUTION
========================================================= */

async function runQuickActionFromElement(
  element,
  root
) {
  const payload =
    extractActionPayload(
      element
    );

  if (!payload.action) {
    return {
      ok: false,
      error: new Error(
        "Quick action sin data-home-action."
      ),
    };
  }

  setHomeAction(
    payload.action
  );

  if (payload.card) {
    setHomeSelectedCard(
      payload.card
    );
    syncSelectedCardVisual(
      root,
      payload.card
    );
  }

  patchHomeUi({
    lastAction:
      payload.action,
    activeCard:
      payload.card ||
      payload.action,
  });

  safeEmit(
    "home:bindings:action:start",
    {
      action:
        payload.action,
      href: payload.href,
      card: payload.card,
      source:
        payload.source ||
        "dom",
    }
  );

  const result =
    await handleHomeQuickAction(
      payload.action,
      {
        href: payload.href,
        card:
          payload.card ||
          payload.action,
        source:
          payload.source ||
          "dom",
        trigger: "binding",
      }
    );

  safeEmit(
    result?.ok === true
      ? "home:bindings:action:success"
      : "home:bindings:action:error",
    {
      action:
        payload.action,
      href: payload.href,
      card: payload.card,
      result,
    }
  );

  return result;
}

async function runCardActionFromElement(
  element,
  root
) {
  const payload =
    extractCardPayload(
      element
    );

  const cardKey =
    payload.card ||
    payload.action;

  if (!cardKey) {
    return {
      ok: false,
      error: new Error(
        "Card action sin data-home-card ni data-home-action."
      ),
    };
  }

  setHomeSelectedCard(
    cardKey
  );
  setHomeAction(
    payload.action ||
      cardKey
  );

  patchHomeUi({
    activeCard: cardKey,
    lastAction:
      payload.action ||
      cardKey,
  });

  syncSelectedCardVisual(
    root,
    cardKey
  );

  safeEmit(
    "home:bindings:card:start",
    {
      card: cardKey,
      action:
        payload.action ||
        cardKey,
    }
  );

  const result =
    await handleHomeCardAction(
      payload.action ||
        cardKey,
      {
        card: cardKey,
        source: "card",
        trigger: "binding",
      }
    );

  safeEmit(
    result?.ok === true
      ? "home:bindings:card:success"
      : "home:bindings:card:error",
    {
      card: cardKey,
      action:
        payload.action ||
        cardKey,
      result,
    }
  );

  return result;
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
      hasHero: Boolean(
        dom.hero
      ),
      actionCount:
        dom.actions.length,
      cardCount:
        dom.cards.length,
      panelCount:
        dom.panels.length,
      kpiCount:
        dom.kpis.length,
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

function bindRootClickDelegation({
  root,
  bag,
}) {
  const onClick =
    async (event) => {
      const quickActionNode =
        event?.target?.closest?.(
          "[data-home-action]"
        );

      if (
        quickActionNode &&
        root.contains(
          quickActionNode
        )
      ) {
        event.preventDefault();

        try {
          await runQuickActionFromElement(
            quickActionNode,
            root
          );
        } catch (error) {
          console.error(
            "[HomeBindings] quick action error",
            error
          );
        }

        return;
      }

      const cardNode =
        event?.target?.closest?.(
          "[data-home-card]"
        );

      if (
        cardNode &&
        root.contains(cardNode)
      ) {
        event.preventDefault();

        try {
          await runCardActionFromElement(
            cardNode,
            root
          );
        } catch (error) {
          console.error(
            "[HomeBindings] card action error",
            error
          );
        }
      }
    };

  bag.add(
    addEventListenerSafe(
      root,
      "click",
      onClick
    )
  );
}

function bindHoverTelemetry({
  root,
  bag,
}) {
  const hoverables =
    safeQueryAll(
      root,
      ".home-kpi, .home-panel, .home-action, .home-health-card"
    );

  hoverables.forEach(
    (node, index) => {
      const onPointerEnter =
        () => {
          safeEmit(
            "home:hover:item",
            {
              index,
              className:
                node.className,
            }
          );
        };

      bag.add(
        addEventListenerSafe(
          node,
          "pointerenter",
          onPointerEnter,
          { passive: true }
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

  bindRootClickDelegation({
    root,
    bag,
  });

  bindHoverTelemetry({
    root,
    bag,
  });

  return function cleanupHomeView() {
    bag.flush();
  };
}

export default bindHomeView;
