(function(){

"use strict";

console.log("✅ Incidencias JS cargado");


/* =========================
   HELPERS
========================= */

function getRoot(){
  return document.querySelector(".panel-content.incidencias");
}

function getTable(){
  const root = getRoot();
  if(!root) return null;
  return root.querySelector("#incidencias-body");
}


/* =========================
   INIT
========================= */

function init(){

  const Onion = window.Onion;

  if(!Onion || !Onion.state?.user){
    return setTimeout(init, 100);
  }

  loadIncidencias();

}

init();


/* =========================
   LOAD
========================= */

async function loadIncidencias(){

  const tbody = getTable();
  if(!tbody) return;

  try{

    tbody.innerHTML = `
      <tr class="table-loading">
        <td colspan="7">Cargando incidencias...</td>
      </tr>
    `;

    const res = await Onion.fetch(Onion.config.API + "/tickets");

    const items = res.tickets || res || [];

    if(!items.length){
      tbody.innerHTML = `
        <tr>
          <td colspan="7">No hay incidencias</td>
        </tr>
      `;
      return;
    }

    render(items);

  }catch(e){

    console.error("💥 INCIDENCIAS ERROR:", e);

    tbody.innerHTML = `
      <tr>
        <td colspan="7">Error cargando incidencias</td>
      </tr>
    `;

  }

}


/* =========================
   RENDER
========================= */

function render(items){

  const tbody = getTable();
  if(!tbody) return;

  tbody.innerHTML = items.map(i => {

    const estado = getEstado(i);
    const prioridad = getPrioridad(i);

    return `
      <tr>

        <td>#${i.id || i.ticketId || "--"}</td>

        <td>${i.titulo || i.title || "Sin título"}</td>

        <td>${i.cliente || i.clienteNombre || "-"}</td>

        <td>
          <span class="badge ${estado.class}">
            ${estado.label}
          </span>
        </td>

        <td>
          <span class="badge ${prioridad.class}">
            ${prioridad.label}
          </span>
        </td>

        <td>${formatFecha(i.createdAt)}</td>

        <td>
          <div class="table-actions">
            <button class="action-btn">👁</button>
          </div>
        </td>

      </tr>
    `;

  }).join("");

}


/* =========================
   HELPERS
========================= */

function getEstado(i){

  const e = (i.status || "").toLowerCase();

  if(e === "closed") return { label:"Cerrada", class:"cerrada" };
  if(e === "in_progress") return { label:"En progreso", class:"progreso" };

  return { label:"Abierta", class:"abierta" };
}

function getPrioridad(i){

  const p = (i.priority || "").toLowerCase();

  if(p === "high") return { label:"Alta", class:"alta" };
  if(p === "medium") return { label:"Media", class:"media" };

  return { label:"Baja", class:"baja" };
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

})();
