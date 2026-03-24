(function(){

"use strict";

/* =====================================================
   SINGLETON
===================================================== */

if(window.__onionClientesLoaded) return;
window.__onionClientesLoaded = true;

/* =====================================================
   STATE
===================================================== */

let tbody = null;
let clientesCache = [];
let initialized = false;

/* =====================================================
   API
===================================================== */

const API = {

  async getClientes(){

    const res = await Onion.fetch(
      Onion.config.API + "/clientes"
    );

    // 🔥 NORMALIZACIÓN
    return res?.clientes || res?.data || res || [];

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

/* =====================================================
   AVATAR PRO
===================================================== */

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

  // 🔥 INICIALES
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

/* =====================================================
   ADAPTER
===================================================== */

function adaptCliente(c){

  return {
    id: c.id || "-",
    empresa: c.nombreFiscal || c.empresa || "-",
    nombre: c.nombreContacto || c.nombre || c.name || "-",
    email: c.email || "-",
    telefono: c.telefono || c.phone || "-",
    activo: c.active ?? true,
    fecha: c.created_at || c.fecha || "-",
    avatar: c.avatar || null,
    logo: c.logo || null
  };

}

/* =====================================================
   ROUTE CHECK
===================================================== */

function isClientesRoute(path){
  return path === "/clientes" || path.startsWith("/clientes/");
}

/* =====================================================
   BOOT SPA
===================================================== */

function boot(){

  if(!window.Onion){
    return setTimeout(boot, 50);
  }

  run();

  window.addEventListener("onion:route-change", (e)=>{
    if(isClientesRoute(e.detail)){
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
  tbody = null;

  requestAnimationFrame(() => {
    safeInit();
  });

}

/* =====================================================
   SAFE INIT
===================================================== */

function safeInit(){

  const el = qs("clientes-body");

  if(!el) return;

  if(initialized && tbody === el) return;

  tbody = el;
  initialized = true;

  init();

}

/* =====================================================
   RENDER
===================================================== */

function renderClientes(list = []){

  if(!Array.isArray(list) || list.length === 0){
    renderState("No hay clientes.","empty");
    return;
  }

  const html = list.map(raw => {

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

      <span class="cliente-nombre">
        ${safe(c.empresa)}
      </span>

    </div>
  </td>

  <td class="cliente-email">${email}</td>

  <td>${safe(c.telefono)}</td>

  <td>${estado}</td>

  <td>${safe(c.fecha)}</td>

  <td>
    <div class="table-actions">

      <button
        class="action-btn btn-ver"
        data-id="${c.id}">
        👁
      </button>

      <button
        class="action-btn btn-editar"
        data-id="${c.id}">
        ✏️
      </button>

    </div>
  </td>

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
  <td colspan="7" class="${cls}">
    ${message}
  </td>
</tr>
`;

}

/* =====================================================
   FILTROS
===================================================== */

function applyFilters(){

  const search = qs("search-cliente")?.value.toLowerCase() || "";
  const estado = qs("filter-estado-cliente")?.value || "";

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
      estado === "activo" ? c.active : !c.active
    );
  }

  renderClientes(filtered);

}

function initFilters(){

  qs("search-cliente")?.addEventListener("input", applyFilters);
  qs("filter-estado-cliente")?.addEventListener("change", applyFilters);

}

/* =====================================================
   EVENTS
===================================================== */

function initTableActions(){

  if(!tbody) return;

  const newTbody = tbody.cloneNode(true);
  tbody.parentNode.replaceChild(newTbody, tbody);
  tbody = newTbody;

  tbody.addEventListener("click",(e)=>{

    const btn = e.target.closest("button");
    if(!btn) return;

    const id = btn.dataset.id;
    if(!id) return;

    if(btn.classList.contains("btn-ver")){
      Onion.go(`/clientes/cliente?id=${id}`);
    }

    if(btn.classList.contains("btn-editar")){
      Onion.go(`/clientes/cliente?id=${id}&edit=true`);
    }

  });

}

/* =====================================================
   LOAD
===================================================== */

async function loadClientes(){

  renderState("Cargando clientes…");

  try{

    const clientes = await API.getClientes();

    console.log("📡 CLIENTES:", clientes);

    clientesCache = clientes;

    renderClientes(clientes);

  }
  catch(err){

    console.error("💥 CLIENTES ERROR:", err);

    renderState("Error cargando clientes.","error");

    window.toast?.error?.("Error cargando clientes");

  }

}

/* =====================================================
   INIT
===================================================== */

function init(){

  console.log("✅ CLIENTES INIT OK");

  initFilters();
  initTableActions();
  loadClientes();

}

})();
