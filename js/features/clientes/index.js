"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (clientes)");
  return;
}

let initialized = false;
let currentItems = [];
let filteredItems = [];
let loading = false;
let currentRequestId = 0;

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.clientes");
}

function $(selector){
  const root = getRoot();
  return root ? root.querySelector(selector) : null;
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

  requestAnimationFrame(()=>{
    loadClientes();
  });

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

    Onion.router.navigate("/clientes/cliente?id=" + row.dataset.id);

  });

  $("#btn-new-cliente")?.addEventListener("click", ()=>{
    Onion.router.navigate("/clientes/nuevo");
  });

  $("#search-cliente")?.addEventListener("input", debounce(applyFilters, 250));
  $("#filter-estado-cliente")?.addEventListener("change", applyFilters);
  $("#filter-tipo-cliente")?.addEventListener("change", applyFilters);

}

/* =========================
   LOAD
========================= */

async function loadClientes(){

  if(loading) return;
  loading = true;

  const tbody = $("#clientes-body");
  if(!tbody) return;

  const requestId = ++currentRequestId;

  document.activeElement?.blur();

  try{

    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 200));

    const res = await Onion.fetch(Onion.config.API + "/clientes");
    const items = normalize(res);

    if(requestId !== currentRequestId) return;

    currentItems = items;
    filteredItems = items;

    if(!items.length){
      setEmpty();
      return;
    }

    requestAnimationFrame(()=>{
      render(items);
    });

  }catch(e){

    console.error("💥 ERROR CLIENTES:", e);

    if(requestId !== currentRequestId) return;

    setError();

  }finally{
    loading = false;
  }

}

/* =========================
   NORMALIZE
========================= */

function normalize(res){

  if(!res) return [];

  if(Array.isArray(res)) return res;
  if(Array.isArray(res.clientes)) return res.clientes;
  if(Array.isArray(res.data)) return res.data;
  if(Array.isArray(res.items)) return res.items;

  return [];

}

/* =========================
   FILTERS
========================= */

function applyFilters(){

  const search = ($("#search-cliente")?.value || "").toLowerCase();
  const estado = ($("#filter-estado-cliente")?.value || "").toLowerCase();
  const tipo = ($("#filter-tipo-cliente")?.value || "").toLowerCase();

  filteredItems = currentItems.filter(c => {

    const d = mapItem(c);

    const text =
      d.nombre + " " +
      d.empresa + " " +
      d.email + " " +
      d.ubicacion;

    return (
      (!search || text.toLowerCase().includes(search)) &&
      (!estado || (estado === "activo" ? d.activo : !d.activo)) &&
      (!tipo || d.tipo.raw === tipo)
    );

  });

  requestAnimationFrame(()=>{
    render(filteredItems);
  });

}

/* =========================
   STATES
========================= */

function setEmpty(){
  $("#clientes-body").innerHTML =
    `<tr><td colspan="7">No hay clientes</td></tr>`;
}

function setError(){
  $("#clientes-body").innerHTML =
    `<tr><td colspan="7">Error cargando clientes</td></tr>`;
}

/* =========================
   RENDER
========================= */

function render(items){

  const tbody = $("#clientes-body");
  if(!tbody) return;

  const html = items.map(c => {

    const d = mapItem(c);

    return `
<tr data-id="${d.id}">

  <td class="col-id">${d.id}</td>

  <td class="col-main">
    <div class="cell-user">
      <div class="table-avatar">${renderAvatar(d.displayName)}</div>
      <div class="user-info">
        <span class="user-name">${escapeHTML(d.displayName)}</span>
        <span class="user-sub">${escapeHTML(d.email)}</span>
      </div>
    </div>
  </td>

  <td class="col-secondary">${escapeHTML(d.ubicacion)}</td>

  <td class="col-secondary">
    <span class="badge ${d.tipo.class}">
      ${d.tipo.label}
    </span>
  </td>

  <td class="col-status">
    <span class="badge ${d.estado.class}">
      ${d.estado.label}
    </span>
  </td>

  <td class="col-date">${d.fecha}</td>

  <td class="col-actions">
    <div class="actions">
      <button class="btn-action view" data-id="${d.id}">Ver</button>
    </div>
  </td>

</tr>
`;

  }).join("");

  tbody.innerHTML = html;

}

/* =========================
   MAP
========================= */

function mapItem(c){

  const empresa = cleanValue(
    c.nombreFiscal || c.empresa,
    ""
  );

  const nombre = cleanValue(
    c.nombreContacto || c.nombre,
    "Cliente"
  );

  const displayName = empresa || nombre;

  return {
    id: c.id,

    nombre,
    empresa,
    displayName,

    email: cleanValue(c.email, "-"),
    ubicacion: cleanValue(
      c.ubicacion || c.localidad || c.ciudad,
      "-"
    ),

    fecha: formatFecha(c.createdAt || c.created_at || c.fecha),

    activo: c.active ?? true,

    estado: getEstado(c.active),

    tipo: getTipo(c.tipo || (c.esEmpresa ? "empresa" : "particular"))
  };

}

/* =========================
   HELPERS
========================= */

function cleanValue(val, fallback){
  if(!val) return fallback;
  let v = String(val).trim();
  if(v === "" || v === "null" || v === "undefined") return fallback;
  return v;
}

function renderAvatar(name){
  return avatarHTML(getInitials(name), getAvatarColor(name));
}

function avatarHTML(initials, color){
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

function hashString(str){
  let hash = 0;
  for(let i = 0; i < str.length; i++){
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getAvatarColor(name){
  const colors = ["#6366f1","#22c55e","#eab308","#ef4444","#06b6d4","#a855f7","#f97316"];
  return colors[Math.abs(hashString(name)) % colors.length];
}

function getInitials(name){
  return name ? name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase() : "?";
}

function getEstado(active){
  if(active) return { label:"Activo", class:"success" };
  return { label:"Inactivo", class:"danger" };
}

function getTipo(t){
  t = (t || "particular").toLowerCase();
  return { label: capitalize(t), class: t, raw:t };
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

function capitalize(str){
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "-";
}

function escapeHTML(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}

function debounce(fn, delay){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), delay);
  };
}

})();
