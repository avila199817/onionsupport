(function(){

"use strict";

console.log("✅ Incidencias PRO cargado");


/* =========================
   ROOT / DOM
========================= */

function getRoot(){
  return document.querySelector(".panel-content.incidencias");
}

function $(selector){
  return getRoot()?.querySelector(selector);
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

  const tbody = $("#incidencias-body");
  if(!tbody) return;

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/tickets");

    const items = normalize(res);

    if(!items.length){
      setEmpty();
      updateKPIs([]);
      return;
    }

    render(items);
    updateKPIs(items);

  }catch(e){

    console.error("💥 ERROR INCIDENCIAS:", e);
    setError();

  }

}


/* =========================
   NORMALIZE
========================= */

function normalize(res){

  if(!res) return [];

  if(Array.isArray(res)) return res;

  if(res.tickets) return res.tickets;

  return [];

}


/* =========================
   STATES
========================= */

function setLoading(){
  $("#incidencias-body").innerHTML = `
    <tr class="table-loading">
      <td colspan="7">Cargando incidencias...</td>
    </tr>
  `;
}

function setEmpty(){
  $("#incidencias-body").innerHTML = `
    <tr>
      <td colspan="7">No hay incidencias</td>
    </tr>
  `;
}

function setError(){
  $("#incidencias-body").innerHTML = `
    <tr>
      <td colspan="7">Error cargando incidencias</td>
    </tr>
  `;
}


/* =========================
   RENDER
========================= */

function render(items){

  const tbody = $("#incidencias-body");
  if(!tbody) return;

  tbody.innerHTML = items.map(i => {

    const data = mapItem(i);

    return `
      <tr data-id="${data.id}">

        <td>#${data.id}</td>

        <td>${escapeHTML(data.title)}</td>

        <td>${escapeHTML(data.cliente)}</td>

        <td>
          <span class="badge ${data.estado.class}">
            ${data.estado.label}
          </span>
        </td>

        <td>
          <span class="badge ${data.prioridad.class}">
            ${data.prioridad.label}
          </span>
        </td>

        <td>${data.fecha}</td>

        <td>
          <div class="table-actions">
            <button class="action-btn view-btn">👁</button>
          </div>
        </td>

      </tr>
    `;

  }).join("");

  bindEvents(items);

}


/* =========================
   MAP DATA
========================= */

function mapItem(i){

  const id = i.id || i.ticketId || "--";

  return {
    id,
    title: i.titulo || i.title || "Sin título",
    cliente: i.cliente || i.clienteNombre || "-",
    estado: getEstado(i),
    prioridad: getPrioridad(i),
    fecha: formatFecha(i.createdAt),
    raw: i
  };

}


/* =========================
   EVENTS
========================= */

function bindEvents(items){

  document.querySelectorAll(".view-btn").forEach((btn, index) => {

    btn.addEventListener("click", () => {
      showDetalle(items[index]);
    });

  });

}


/* =========================
   DETALLE
========================= */

function showDetalle(item){

  const box = $("#detalle-incidencia");
  if(!box) return;

  box.style.display = "block";

  $("#detalle-titulo").textContent = item.titulo || item.title || "--";
  $("#detalle-desc").textContent = item.descripcion || item.desc || "--";

  const estado = getEstado(item);
  const prioridad = getPrioridad(item);

  $("#detalle-estado").textContent = "Estado: " + estado.label;
  $("#detalle-prioridad").textContent = "Prioridad: " + prioridad.label;
  $("#detalle-fecha").textContent = "Fecha: " + formatFecha(item.createdAt);

}


/* =========================
   KPIs
========================= */

function updateKPIs(items){

  const open = items.filter(i => i.status === "open").length;
  const progress = items.filter(i => i.status === "in_progress").length;
  const closed = items.filter(i => i.status === "closed").length;

  $("#inc-open") && ($("#inc-open").textContent = open);
  $("#inc-progress") && ($("#inc-progress").textContent = progress);
  $("#inc-closed") && ($("#inc-closed").textContent = closed);

  $("#inc-time") && ($("#inc-time").textContent = calcAvgTime(items));

}

function calcAvgTime(items){

  const closed = items.filter(i => i.closedAt && i.createdAt);

  if(!closed.length) return "--";

  const avg = closed.reduce((acc, i) => {
    return acc + (new Date(i.closedAt) - new Date(i.createdAt));
  }, 0) / closed.length;

  const hours = Math.round(avg / (1000 * 60 * 60));

  return hours + "h";
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

function escapeHTML(str){
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

})();
