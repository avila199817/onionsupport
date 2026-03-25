"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (incidencias)");
  return;
}

let initialized = false;
let currentItems = [];
let filteredItems = [];

/* =========================
   ROOT
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
  if(!root || initialized) return;

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

  Onion.cleanupEvent(root, "click", (e)=>{

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    const id = row.dataset.id;

    const item = currentItems.find(i =>
      String(i.id || i.ticketId) === String(id)
    );

    if(item) showDetalle(item);

  });

  $("#search-incidencia")?.addEventListener("input", debounce(applyFilters, 250));
  $("#filter-status")?.addEventListener("change", applyFilters);
  $("#filter-priority")?.addEventListener("change", applyFilters);

}

/* =========================
   FILTERS
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

    return (
      (!search || title.includes(search) || cliente.includes(search) || String(i.id).includes(search)) &&
      (!status || itemStatus === status) &&
      (!priority || itemPriority === priority)
    );

  });

  render(filteredItems);

}

/* =========================
   RESIZE (OPTIMIZADO)
========================= */

function initTableResize(){

  const root = getRoot();
  if(!root) return;

  root.querySelectorAll(".resizer").forEach(resizer => {

    let startX, startWidth, index;

    resizer.addEventListener("mousedown", e => {

      const th = e.target.parentElement;

      startX = e.pageX;
      startWidth = th.offsetWidth;

      index = Array.from(th.parentNode.children).indexOf(th);

      function move(e){

        let newWidth = startWidth + (e.pageX - startX);

        if(newWidth < 60) newWidth = 60;
        if(newWidth > 500) newWidth = 500;

        root.querySelectorAll("tr").forEach(row => {
          if(row.children[index]){
            row.children[index].style.width = newWidth + "px";
          }
        });

      }

      function stop(){
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", stop);
      }

      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", stop);

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
      panel?.classList.add("ready");
      return;
    }

    render(items);

    requestAnimationFrame(()=>{
      initTableResize();
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
    `<tr><td colspan="6">Cargando incidencias...</td></tr>`;
}

function setEmpty(){
  $("#incidencias-body").innerHTML =
    `<tr><td colspan="6">No hay incidencias</td></tr>`;
}

function setError(){
  $("#incidencias-body").innerHTML =
    `<tr><td colspan="6">Error cargando incidencias</td></tr>`;
}

/* =========================
   RENDER (MÁS LIMPIO)
========================= */

function render(items){

  const tbody = $("#incidencias-body");
  if(!tbody) return;

  const html = items.map(i => {

    const d = mapItem(i);

    return `
      <tr data-id="${d.id}">
        <td>${d.id}</td>
        <td>${escapeHTML(d.title)}</td>
        <td>${escapeHTML(d.cliente)}</td>
        <td><span class="badge ${d.estado.class}">${d.estado.label}</span></td>
        <td><span class="badge ${d.prioridad.class}">${d.prioridad.label}</span></td>
        <td>${d.fecha}</td>
      </tr>
    `;

  }).join("");

  tbody.innerHTML = html;

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

/* =========================
   DETALLE
========================= */

function showDetalle(item){
  console.log("👁 Detalle:", item);
}

/* =========================
   UTILS
========================= */

function debounce(fn, delay){
  let t;
  return function(...args){
    clearTimeout(t);
    t = setTimeout(()=> fn.apply(this, args), delay);
  };
}

})();
