/* =========================================================
   Onion Support - WhatsApp
   Archivo: /src/views/whatsapp/index.js

   ROUTED PLACEHOLDER · ADMIN ONLY · NO DATA PLANE

   Responsabilidad actual:
   - Dar destino real y estable a /whatsapp.
   - Mantener el shell SPA, Router y Sidebar canónicos.
   - Reservar una superficie accesible para la futura bandeja.
   - NO llamar todavía al backend ni a Meta.
   - NO mantener estado de conversaciones.
   - NO crear listeners globales, timers, storage ni sockets.
========================================================= */

"use strict";

export const WHATSAPP_VIEW_VERSION =
  "whatsapp.view.v1-routed-placeholder";

export const WHATSAPP_VIEW_NAME =
  "WhatsAppView";

export const WHATSAPP_CANONICAL_PATH =
  "/whatsapp";

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function create(tag, options = {}) {
  const node = document.createElement(tag);

  if (options.className) {
    node.className = options.className;
  }

  if (options.text) {
    node.textContent = String(options.text);
  }

  for (const [name, value] of Object.entries(options.attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "true" : String(value));
  }

  return node;
}

export function WhatsAppView(host = null) {
  if (
    !isBrowser() ||
    !host ||
    host.nodeType !== 1 ||
    typeof host.replaceChildren !== "function"
  ) {
    return null;
  }

  const titleId = "whatsapp-prepared-title";

  const root = create("section", {
    className: "whatsapp-page",
    attrs: {
      "data-view": "whatsapp",
      "data-whatsapp-phase": "prepared",
      "aria-labelledby": titleId,
    },
  });

  const card = create("div", {
    className: "whatsapp-prepared",
    attrs: {
      "data-whatsapp-prepared": "true",
    },
  });

  const badge = create("span", {
    className: "whatsapp-prepared-badge",
    text: "Canal preparado",
  });

  const title = create("h1", {
    className: "whatsapp-prepared-title",
    text: "WhatsApp",
    attrs: {
      id: titleId,
    },
  });

  const copy = create("p", {
    className: "whatsapp-prepared-copy",
    text: "La ruta ya está conectada al sistema central. La bandeja de conversaciones se construirá en el siguiente paso.",
  });

  card.append(badge, title, copy);
  root.append(card);
  host.replaceChildren(root);

  let destroyed = false;

  const destroy = () => {
    if (destroyed) return false;
    destroyed = true;

    if (root.parentNode === host) {
      root.remove();
    }

    return true;
  };

  return Object.freeze({
    version: WHATSAPP_VIEW_VERSION,
    path: WHATSAPP_CANONICAL_PATH,
    prepared: true,
    destroy,
    cleanup: destroy,
    unmount: destroy,
  });
}

export default WhatsAppView;
