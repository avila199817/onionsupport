(function(){

"use strict";

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (clientes)");
  return;
}

let initialized = false;
let tbody = null;
let clientesCache = [];

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.clientes");
}

function $(id){
  return getRoot()?.querySelector("#" + id);
}

/* =========================
   API
========================= */

async function getClientes(){

  const res = await Onion.fetch(Onion.config.API + "/clientes");

  return res?.clientes || res?.data || res || [];

}

/* =========================
   HELPERS
========================= */

function safe(v){
  return v && String(v).trim() !== "" ? v : "-";
}

function avatar(c){

  const fallback = "/media/img/Usuario.png";
  let src = c?.logo || c?.avatar;

  if(src){

    if(typeof src !== "string") return fallback;

    if(!src.startsWith("http")){
      src = Onion.config.API.replace("/api","") + src;
    }

    return `
<img
  src="${src}"
  class="cliente-avatar"
  loading="lazy"
  onerror="this.src='${fallback}'">
`;
  }

  const nombre = (c?.empresa || "CL").trim();

  const iniciales = nombre
    .split(" ")
    .slice(0,2)
    .map(p => p[0])
    .join("")
    .toUpperCase();

  return `
<div class="cliente-avatar cliente-avatar-fallback">
${iniciales}
</div>
`;

}

/* =========================
   ADAPTER
========================= */

function adaptCliente(c){

  return {
    id: c.id || "-",
    empresa: c.nombreFiscal || c.empresa || "-",
    nombre: c.nombreContacto || c.nombre || c.name || "-",
    email: c.email || "-",
    telefono: c.telefono || c.phone || "-",
    activo: c.active ?? true,
    fecha: c.created_at || c.fecha || "-"
  };

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

  tbody = $("clientes-body");

  if(!tbody) return;

  bindEvents();
  initFilters();
  loadClientes();

  Onion.onCleanup(()=>{
    initialized = false;
    tbody = null;
    clientesCache = [];
  });

}

init();

/* =========================
   EVENTS
========================= */

function bindEvents(){

  if(!tbody) return;

  Onion.cleanupEvent(tbody, "click", (e)=>{

    const btn = e.target.closest("button");
    if(!btn) return;

    const id = btn.dataset.id;
    if(!id) return;

    if(btn.classList.contains("btn-ver")){
      Onion.router.navigate(`/clientes/cliente?id=${id}`);
    }

    if(btn.classList.contains("btn-editar")){
      Onion.router.navigate(`/clientes/cliente?id=${id}&edit=true`);
    }

  });

}

/* =========================
   FILTROS
========================= */

function initFilters(){

  const search = $("search-cliente");
  const estado = $("filter-estado-cliente");

  if(search){
    Onion.cleanupEvent(search, "input", applyFilters);
  }

  if(estado){
    Onion.cleanupEvent(estado, "change", applyFilters);
  }

}

function applyFilters(){

  const search = $("search-cliente")?.value.toLowerCase() || "";
  const estado = $("filter-estado-cliente")?.value || "";

  let filtered = clientesCache;

  if(search){
    filtered = filtered.filter(c =>
      (c.nombre || "").toLowerCase().includes(search) ||
      (c.empresa || "").toLowerCase().includes(search) ||
      (c.email || "").toLowerCase().includes(search)
    );
  }

  if(estado){
    filtered = filtered.filter(c =>
      estado === "activo" ? c.activo : !c.activo
    );
  }

  renderClientes(filtered);

}

/* =========================
   LOAD
========================= */

async function loadClientes(){

  const panel = getRoot();

  panel?.classList.remove("ready");

  renderState("Cargando clientes…");

  try{

    const clientes = await getClientes();

    clientesCache = clientes;

    renderClientes(clientes);

    requestAnimationFrame(()=>{
      panel?.classList.add("ready");
    });

  }catch(err){

    console.error("💥 CLIENTES ERROR:", err);

    renderState("Error cargando clientes","error");

    panel?.classList.add("ready");

  }

}

/* =========================
   RENDER
========================= */

function renderClientes(list = []){

  if(!tbody) return;

  if(!Array.isArray(list) || list.length === 0){
    return renderState("No hay clientes","empty");
  }

  tbody.innerHTML = list.map(raw => {

    const c = adaptCliente(raw);

    const email = safe(c.email) !== "-"
      ? `<a href="mailto:${c.email}">${c.email}</a>`
      : "-";

    const estado = c.activo
      ? `<span class="badge activo">Activo</span>`
      : `<span class="badge inactivo">Inactivo</span>`;

    return `
<tr data-id="${c.id}">
  <td>${safe(c.id)}</td>
  <td>
    <div class="cliente-cell">
      ${avatar(c)}
      <span class="cliente-nombre">${safe(c.empresa)}</span>
    </div>
  </td>
  <td class="cliente-email">${email}</td>
  <td>${safe(c.telefono)}</td>
  <td>${estado}</td>
  <td>${safe(c.fecha)}</td>
  <td>
    <div class="table-actions">
      <button class="action-btn btn-ver" data-id="${c.id}">👁</button>
      <button class="action-btn btn-editar" data-id="${c.id}">✏️</button>
    </div>
  </td>
</tr>
`;

  }).join("");

}

/* =========================
   STATES
========================= */

function renderState(message, cls="loading"){

  if(!tbody) return;

  tbody.innerHTML = `
<tr>
  <td colspan="7" class="${cls}">
    ${message}
  </td>
</tr>
`;

}

})();
