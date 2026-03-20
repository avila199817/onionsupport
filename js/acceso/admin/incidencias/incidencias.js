(function(){

"use strict";

/* =====================================================
   SINGLETON (EVITA DUPLICADOS)
===================================================== */

if(window.__onionIncidenciasLoaded) return;
window.__onionIncidenciasLoaded = true;

/* =====================================================
   STATE
===================================================== */

let tbody = null;
let initialized = false;

/* =====================================================
   API
===================================================== */

const API = {

  async getTickets(){

    const res = await Onion.fetch(
      Onion.config.API + "/tickets"
    );

    return res?.tickets || res || [];

  }

};

/* =====================================================
   HELPERS
===================================================== */

function qs(id){
  return document.getElementById(id);
}

function safe(v){
  return v && String(v).trim() !== "" ? v : "-";
}

/* AVATAR */
function avatar(u){

  const fallback = "/media/img/Usuario.png";

  if(!u) return fallback;

  let src = u.avatar;

  if(!src || typeof src !== "string") return fallback;

  if(src.startsWith("http")) return src;

  return Onion.config.API.replace("/api","") + src;

}

/* =====================================================
   ROUTE CHECK
===================================================== */

function isIncidenciasRoute(path){
  return path === "/incidencias" || path.startsWith("/incidencias/");
}

/* =====================================================
   BOOT (SPA)
===================================================== */

function boot(){

  if(!window.Onion){
    return setTimeout(boot, 50);
  }

  // primera carga
  run();

  // cambios de ruta SPA
  window.addEventListener("onion:route-change", (e)=>{
    if(isIncidenciasRoute(e.detail)){
      run();
    }
  });

}

boot();

/* =====================================================
   RUN
===================================================== */

function run(){

  initialized = false;

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", safeInit, { once:true });
  }else{
    safeInit();
  }

}

function safeInit(){

  if(initialized) return;
  initialized = true;

  init();

}

/* =====================================================
   ADAPTER
===================================================== */

function adaptTicket(t){

  return {
    id: t.ticketId || t.id || "-",

    cliente: {
      name: t.clienteNombre || t.name || "-",
      avatar: t.clienteAvatar || null
    },

    tipo: t.tipo || "-",
    estado: t.status || "-",
    fecha: t.createdAtES || "-"
  };

}

/* =====================================================
   RENDER
===================================================== */

function renderTickets(list = []){

  if(!Array.isArray(list) || list.length === 0){
    renderState("No hay incidencias.","empty");
    return;
  }

  const html = list.map(raw => {

    const t = adaptTicket(raw);

    return `
<tr data-id="${safe(t.id)}">

  <!-- CLIENTE -->
  <td>
    <div class="usuario-cell">
      <img
        src="${avatar(t.cliente)}"
        class="usuario-avatar"
        loading="lazy"
        onerror="this.src='/media/img/Usuario.png'">
      <span class="usuario-username">
        ${safe(t.cliente.name)}
      </span>
    </div>
  </td>

  <!-- ID -->
  <td>
    <span class="ticket-id">${safe(t.id)}</span>
  </td>

  <!-- TIPO -->
  <td>${safe(t.tipo)}</td>

  <!-- ESTADO -->
  <td>
    ${window.badge?.status 
      ? badge.status(t.estado) 
      : safe(t.estado)}
  </td>

  <!-- FECHA -->
  <td>${safe(t.fecha)}</td>

</tr>
`;

  }).join("");

  tbody.innerHTML = html;

}

/* =====================================================
   STATES
===================================================== */

function renderState(message,cls="loading"){

  if(!tbody) return;

  tbody.innerHTML = `
<tr>
  <td colspan="5" class="${cls}">
    ${message}
  </td>
</tr>
`;

}

/* =====================================================
   EVENTS
===================================================== */

function initTableActions(){

  if(!tbody) return;

  // limpiar listeners previos
  tbody.onclick = null;

  tbody.addEventListener("click",(e)=>{

    const row = e.target.closest("tr");
    if(!row) return;

    const id = row.dataset.id;
    if(!id) return;

    Onion.go(`/incidencias/incidencia?id=${id}`);

  });

}

/* =====================================================
   LOAD
===================================================== */

async function loadTickets(){

  renderState("Cargando incidencias…");

  try{

    const tickets = await API.getTickets();

    console.log("📡 TICKETS:", tickets);

    renderTickets(tickets);

  }
  catch(err){

    console.error("💥 TICKETS ERROR:", err);

    renderState("Error cargando incidencias.","error");

    window.toast?.error?.("Error cargando incidencias");

  }

}

/* =====================================================
   INIT
===================================================== */

function init(){

  tbody = qs("incidencias-body");

  if(!tbody){
    console.warn("❌ incidencias-body no encontrado");
    return;
  }

  // limpiar siempre en SPA
  tbody.innerHTML = "";

  console.log("✅ INCIDENCIAS INIT OK");

  initTableActions();
  loadTickets();

}

})();