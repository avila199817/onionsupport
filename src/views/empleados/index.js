/* =========================================================
   Onion Support - Empleados Placeholder
   Archivo: /src/views/empleados/index.js

   Objetivo:
   - Reservar el dominio Empleados dentro de la navegación privada.
   - Separar desde el inicio equipo interno, usuarios y clientes.
   - No consumir API, Store, Auth ni datos hasta definir el contrato.
========================================================= */

"use strict";

export const EMPLEADOS_VIEW_VERSION =
  "empleados.placeholder.v1-reserved-domain";
export const EMPLEADOS_VIEW_NAME =
  "EmpleadosView";

const SVG_NS =
  "http://www.w3.org/2000/svg";
const EMPLOYEE_ICON_PATH =
  "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M8 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M5.5 16.5c.35-2.1 1.45-3.4 2.5-3.4s2.15 1.3 2.5 3.4 M13.5 8H18 M13.5 11.5H18 M13.5 15h3";

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isHost(value = null) {
  return Boolean(
    isBrowser() &&
    value &&
    value.nodeType === 1 &&
    typeof value.replaceChildren === "function"
  );
}

function element(
  tag = "div",
  className = "",
  text = ""
) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function createEmployeeIcon() {
  const shell = element(
    "span",
    "empleados-placeholder-icon"
  );
  shell.setAttribute("aria-hidden", "true");

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("focusable", "false");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", EMPLOYEE_ICON_PATH);
  svg.append(path);
  shell.append(svg);

  return shell;
}

export function EmpleadosView(
  host = null
) {
  if (!isHost(host)) return null;

  const root = element(
    "section",
    "empleados-view"
  );
  root.dataset.view = "empleados";
  root.setAttribute(
    "aria-labelledby",
    "empleados-view-title"
  );

  const card = element(
    "article",
    "empleados-placeholder"
  );

  const badge = element(
    "span",
    "empleados-placeholder-badge",
    "Módulo reservado"
  );

  const title = element(
    "h1",
    "empleados-placeholder-title",
    "Empleados"
  );
  title.id = "empleados-view-title";

  const description = element(
    "p",
    "empleados-placeholder-description",
    "Aquí vivirá la gestión del equipo interno, separada de Usuarios y Clientes."
  );

  const note = element(
    "p",
    "empleados-placeholder-note",
    "La ruta ya está preparada. Todavía no carga datos ni conecta con ninguna API."
  );

  card.append(
    createEmployeeIcon(),
    badge,
    title,
    description,
    note
  );
  root.append(card);
  host.replaceChildren(root);

  let destroyed = false;

  return Object.freeze({
    root,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      if (root.parentNode) root.remove();
      return true;
    },
  });
}

export default EmpleadosView;
