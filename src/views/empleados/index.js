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
  "empleados.placeholder.v2-internal-company-polish";
export const EMPLEADOS_VIEW_NAME =
  "EmpleadosView";

const SVG_NS =
  "http://www.w3.org/2000/svg";
const EMPLOYEE_ICON_PATH =
  "M8.5 6V4.75A1.75 1.75 0 0 1 10.25 3h3.5a1.75 1.75 0 0 1 1.75 1.75V6 M5.25 6h13.5A2.25 2.25 0 0 1 21 8.25v9.5A2.25 2.25 0 0 1 18.75 20H5.25A2.25 2.25 0 0 1 3 17.75v-9.5A2.25 2.25 0 0 1 5.25 6Z M3 11.25c2.65 1.45 5.65 2.2 9 2.2s6.35-.75 9-2.2 M9.75 12.9v2.35h4.5V12.9 M18.25 2.75v2.5 M17 4h2.5";

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
