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

function formatFecha(f){
  if(!f) return "-";
  return new Date(f).toLocaleDateString("es-ES");
}

/* =========================
   AVATAR PRO 🔥
========================= */

function getInitials(name){
  if(!name) return "?";
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .slice(0,2)
    .toUpperCase();
}

function hashString(str){
  let hash = 0;
  for(let i = 0; i < str.length; i++){
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getAvatarColor(name){

  const colors = [
    "#6366f1",
    "#22c55e",
    "#eab308",
    "#ef4444",
    "#06b6d4",
    "#a855f7",
    "#f97316"
  ];

  const index = Math.abs(hashString(name)) % colors.length;
  return colors[index];
}

function renderAvatar(c){

  const fallback = "/media/img/Usuario.png";

  let src = c.logo || c.avatar;

  if(src && typeof src === "string"){

    if(!src.startsWith("http")){
      src = Onion.config.API.replace("/api","") + src;
    }

    return `<img src="${src}" loading="lazy" onerror="this.src='${fallback}'">`;
  }

  const name = c.empresa || c.nombre || "CL";
  const initials = getInitials(name);
  const color = getAvatarColor(name);

  return `
    <div style="
      width:100%;
      height:100%;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      background:${color};
      color:#fff;
      font-weight:600;
      font-size:12px;
    ">
      ${initials}
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
    fecha: c.createdAt || c.created_at || c.fecha || "-"
  };

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

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    const id = row.dataset.id;
    if(!id) return;

    Onion.router.navigate(`/clientes/cliente?id=${id}`);

  });

}

/* =========================
   FILTROS
========================= */

function initFilters(){

  const search = $("search-cliente");
  const estado = $("filter-estado-cliente");

  search && Onion.cleanupEvent(search, "input", applyFilters);
  estado && Onion.cleanupEvent(estado, "change", applyFilters);

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
      estado === "activo" ? c.active : !c.active
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

    const estado = c.activo
      ? `<span class="badge activo">Activo</span>`
      : `<span class="badge inactivo">Inactivo</span>`;

    return `
<tr data-id="${c.id}">

  <td style="white-space:nowrap;">${safe(c.id)}</td>

  <td>
    <div class="cell-user">
      <div class="table-avatar">
        ${renderAvatar(c)}
      </div>
      <div class="user-info">
        <span class="user-name">${safe(c.empresa)}</span>
        <span class="user-sub">${safe(c.email)}</span>
      </div>
    </div>
  </td>

  <td>${safe(c.telefono)}</td>

  <td>${estado}</td>

  <td>${formatFecha(c.fecha)}</td>

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
  <td colspan="5" class="${cls}">
    ${message}
  </td>
</tr>
`;

}

})();
