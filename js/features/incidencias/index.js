(function(){

"use strict";

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (incidencias)");
  return;
}

let initialized = false;
let currentItems = [];

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

  Onion.cleanupEvent(root, "click", (e)=>{

    const btn = e.target.closest(".view-btn");
    if(!btn) return;

    const id = btn.dataset.id;
    if(!id) return;

    const item = currentItems.find(i =>
      String(i.id || i.ticketId) === String(id)
    );

    if(item){
      showDetalle(item);
    }

  });

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
        const newWidth = startWidth + (e.pageX - startX);

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

  if(panel){
    panel.classList.remove("ready");
  }

  if(!tbody) return;

  setLoading();

  try{

    const res = await Onion.fetch(Onion.config.API + "/tickets");

    const items = normalize(res);
    currentItems = items;

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
  const el = $("#incidencias-body");
  if(!el) return;

  el.innerHTML = `
    <tr class="table-loading">
      <td colspan="7">Cargando incidencias...</td>
    </tr>
  `;
}

function setEmpty(){
  const el = $("#incidencias-body");
  if(!el) return;

  el.innerHTML = `
    <tr>
      <td colspan="7">No hay incidencias</td>
    </tr>
  `;
}

function setError(){
  const el = $("#incidencias-body");
  if(!el) return;

  el.innerHTML = `
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
   DETALLE
========================= */

function showDetalle(item){

  const box = $("#detalle-incidencia");
  if(!box) return;

  box.style.display = "block";

  const titulo = $("#detalle-titulo");
  const desc = $("#detalle-desc");
  const estadoEl = $("#detalle-estado");
  const prioridadEl = $("#detalle-prioridad");
  const fechaEl = $("#detalle-fecha");

  if(titulo) titulo.textContent = item.titulo || item.title || "--";
  if(desc) desc.textContent = item.descripcion || item.desc || "--";

  const estado = getEstado(item);
  const prioridad = getPrioridad(item);

  if(estadoEl) estadoEl.textContent = "Estado: " + estado.label;
  if(prioridadEl) prioridadEl.textContent = "Prioridad: " + prioridad.label;
  if(fechaEl) fechaEl.textContent = "Fecha: " + formatFecha(item.createdAt);

}

/* =========================
   KPIs
========================= */

function updateKPIs(items){

  const open = items.filter(i => i.status === "open").length;
  const progress = items.filter(i => i.status === "in_progress").length;
  const closed = items.filter(i => i.status === "closed").length;

  if($("#inc-open")) $("#inc-open").textContent = open;
  if($("#inc-progress")) $("#inc-progress").textContent = progress;
  if($("#inc-closed")) $("#inc-closed").textContent = closed;

  if($("#inc-time")) $("#inc-time").textContent = calcAvgTime(items);

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

  try{
    return new Date(f).toLocaleDateString("es-ES");
  }catch{
    return "--";
  }
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

})();
