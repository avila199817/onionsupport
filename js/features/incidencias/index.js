(function(){

"use strict";

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (incidencias)");
  return;
}

let initialized = false;
let currentItems = [];
let filteredItems = [];

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

  const root = getRoot();
  if(!root) return;

  if(initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  bindEvents();
  loadIncidencias();

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* =========================
   EVENTS
========================= */

function bindEvents(){

  const root = getRoot();
  if(!root) return;

  // VIEW
  Onion.cleanupEvent(root, "click", (e)=>{

    const btn = e.target.closest(".view-btn");
    if(!btn) return;

    const id = btn.dataset.id;

    const item = currentItems.find(i =>
      String(i.id || i.ticketId) === String(id)
    );

    if(item) showDetalle(item);

  });

  // SEARCH
  $("#search-incidencia")?.addEventListener("input", applyFilters);

  // FILTERS
  $("#filter-status")?.addEventListener("change", applyFilters);
  $("#filter-priority")?.addEventListener("change", applyFilters);

}

/* =========================
   FILTER SYSTEM
========================= */

function applyFilters(){

  const search = ($("#search-incidencia")?.value || "").toLowerCase();
  const status = ($("#filter-status")?.value || "").toLowerCase();
  const priority = ($("#filter-priority")?.value || "").toLowerCase();

  filteredItems = currentItems.filter(i => {

    const title = (i.titulo || i.title || "").toLowerCase();
    const cliente = (i.cliente || i.clienteNombre || "").toLowerCase();

    const itemStatus = mapStatus(i.status);
    const itemPriority = mapPriority(i.priority);

    const matchSearch =
      !search ||
      title.includes(search) ||
      cliente.includes(search) ||
      String(i.id).includes(search);

    const matchStatus =
      !status || itemStatus === status;

    const matchPriority =
      !priority || itemPriority === priority;

    return matchSearch && matchStatus && matchPriority;

  });

  render(filteredItems);

}

/* =========================
   RESIZE TABLE
========================= */

function initTableResize(){

  const root = getRoot();
  if(!root) return;

  const resizers = root.querySelectorAll(".resizer");

  resizers.forEach(resizer => {

    let startX, startWidth, index;

    resizer.addEventListener("mousedown", e => {

      const th = e.target.parentElement;

      startX = e.pageX;
      startWidth = th.offsetWidth;

      index = Array.from(th.parentNode.children).indexOf(th);

      function onMouseMove(e){

        const min = 60;
        const max = 500;

        let newWidth = startWidth + (e.pageX - startX);

        if(newWidth < min) newWidth = min;
        if(newWidth > max) newWidth = max;

        root.querySelectorAll("tr").forEach(row => {
          if(row.children[index]){
            row.children[index].style.width = newWidth + "px";
          }
        });

      }

      function onMouseUp(){
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);

    });

  });

}

/* =========================
   LOAD
========================= */

async function loadIncidencias(){

  const panel = getRoot();
  const tbody = $("#incidencias-body");

  panel?.classList.remove("ready");

  if(!tbody) return;

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/tickets");

    const items = normalize(res);

    currentItems = items;
    filteredItems = items;

    if(!items.length){
      setEmpty();
      updateKPIs([]);
      panel?.classList.add("ready");
      return;
    }

    render(items);
    updateKPIs(items);

    initTableResize();

    requestAnimationFrame(()=>{
      panel?.classList.add("ready");
    });

  }catch(e){

    console.error("💥 ERROR INCIDENCIAS:", e);

    setError();
    panel?.classList.add("ready");

  }

}

/* =========================
   NORMALIZE
========================= */

function normalize(res){

  if(!res) return [];

  if(Array.isArray(res)) return res;
  if(res.tickets) return res.tickets;
  if(res.data) return res.data;

  return [];

}

/* =========================
   STATES
========================= */

function setLoading(){
  $("#incidencias-body").innerHTML =
    `<tr><td colspan="7">Cargando incidencias...</td></tr>`;
}

function setEmpty(){
  $("#incidencias-body").innerHTML =
    `<tr><td colspan="7">No hay incidencias</td></tr>`;
}

function setError(){
  $("#incidencias-body").innerHTML =
    `<tr><td colspan="7">Error cargando incidencias</td></tr>`;
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
      <tr>
        <td>#${data.id}</td>
        <td>${escapeHTML(data.title)}</td>
        <td>${escapeHTML(data.cliente)}</td>
        <td><span class="badge ${data.estado.class}">${data.estado.label}</span></td>
        <td><span class="badge ${data.prioridad.class}">${data.prioridad.label}</span></td>
        <td>${data.fecha}</td>
        <td>
          <div class="table-actions">
            <button class="action-btn view-btn" data-id="${data.id}">👁</button>
          </div>
        </td>
      </tr>
    `;

  }).join("");

}

/* =========================
   MAP
========================= */

function mapItem(i){

  return {
    id: i.id || i.ticketId || "--",
    title: i.titulo || i.title || "Sin título",
    cliente: i.cliente || i.clienteNombre || "-",
    estado: getEstado(i),
    prioridad: getPrioridad(i),
    fecha: formatFecha(i.createdAt)
  };

}

/* =========================
   HELPERS
========================= */

function mapStatus(s){
  s = (s || "").toLowerCase();
  if(s === "closed") return "cerrada";
  if(s === "in_progress") return "progreso";
  return "abierta";
}

function mapPriority(p){
  p = (p || "").toLowerCase();
  if(p === "high") return "alta";
  if(p === "medium") return "media";
  return "baja";
}

function getEstado(i){
  const s = mapStatus(i.status);
  if(s === "cerrada") return { label:"Cerrada", class:"cerrada" };
  if(s === "progreso") return { label:"En progreso", class:"progreso" };
  return { label:"Abierta", class:"abierta" };
}

function getPrioridad(i){
  const p = mapPriority(i.priority);
  if(p === "alta") return { label:"Alta", class:"alta" };
  if(p === "media") return { label:"Media", class:"media" };
  return { label:"Baja", class:"baja" };
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

})();
