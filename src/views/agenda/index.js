/* =========================================================
   Onion Support - Agenda
   Archivo: /src/views/agenda/index.js

   SHELL ONLY · SIN DATOS · SIN HTTP · SIN STORAGE

   Responsabilidad:
   - Exponer la vista privada Agenda al Router.
   - Renderizar una base visual limpia y estable para futuras citas/visitas.
   - No inventar datos ni dependencias de backend antes de definir el contrato.
========================================================= */

export const AGENDA_VIEW_VERSION =
  "agenda.view.v1-shell";

export const AGENDA_VIEW_NAME =
  "AgendaView";

export const AGENDA_CANONICAL_PATH =
  "/agenda";

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function createAgendaRoot() {
  const root =
    document.createElement("section");

  root.className =
    "agenda-view-root";

  root.dataset.view =
    "agenda";

  root.dataset.agendaView =
    AGENDA_VIEW_VERSION;

  root.setAttribute(
    "aria-labelledby",
    "agenda-title"
  );

  root.innerHTML = `
    <header class="agenda-hero">
      <div class="agenda-hero-copy">
        <span class="agenda-eyebrow">Planificación</span>
        <h1 id="agenda-title">Agenda</h1>
        <p>Organiza tus próximas visitas, citas y trabajos programados.</p>
      </div>
    </header>

    <section class="agenda-board" aria-labelledby="agenda-calendar-title">
      <header class="agenda-board-header">
        <div class="agenda-board-heading">
          <span class="agenda-board-icon app-icon" data-app-icon="agenda" aria-hidden="true"></span>
          <div>
            <h2 id="agenda-calendar-title">Calendario</h2>
            <p>Vista preparada para empezar a mostrar tu planificación.</p>
          </div>
        </div>

        <span class="agenda-ready-pill">
          <span class="agenda-ready-dot" aria-hidden="true"></span>
          Preparada
        </span>
      </header>

      <div class="agenda-week" aria-hidden="true">
        <span>Lun</span>
        <span>Mar</span>
        <span>Mié</span>
        <span>Jue</span>
        <span>Vie</span>
        <span>Sáb</span>
        <span>Dom</span>
      </div>

      <div class="agenda-empty-state">
        <span class="agenda-empty-icon app-icon" data-app-icon="agenda" aria-hidden="true"></span>
        <h3>Tu agenda está lista</h3>
        <p>Las visitas y citas aparecerán aquí cuando conectemos la planificación.</p>
      </div>
    </section>
  `;

  return root;
}

export function AgendaView(
  host = null,
  context = {}
) {
  if (
    !isBrowser() ||
    !host ||
    host.nodeType !== 1 ||
    typeof host.replaceChildren !== "function"
  ) {
    return null;
  }

  if (context?.signal?.aborted === true) {
    return null;
  }

  const root =
    createAgendaRoot();

  host.replaceChildren(root);

  host.dataset.view =
    "agenda";

  host.dataset.agendaViewVersion =
    AGENDA_VIEW_VERSION;

  return Object.freeze({
    version: AGENDA_VIEW_VERSION,
    destroy() {
      /*
        Vista estática: no registra listeners, timers, observers ni I/O.
        El Router es propietario del host y sustituirá su contenido.
      */
    },
  });
}

export default AgendaView;
