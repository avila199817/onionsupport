"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (usuarios)");
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
  return document.querySelector(".panel-content.usuarios");
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
    loadUsers();
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

    Onion.router.navigate("/usuarios/detalle?id=" + row.dataset.id);

  });

  $("#btn-new-usuario")?.addEventListener("click", ()=>{
    Onion.router.navigate("/usuarios/nuevo");
  });

  $("#search-usuario")?.addEventListener("input", debounce(applyFilters, 250));
  $("#filter-estado-usuario")?.addEventListener("change", applyFilters);
  $("#filter-rol-usuario")?.addEventListener("change", applyFilters);
  $("#filter-tipo-usuario")?.addEventListener("change", applyFilters);

}

/* =========================
   LOAD
========================= */

async function loadUsers(){

  if(loading) return;
  loading = true;

  const tbody = $("#usuarios-body");
  if(!tbody) return;

  const requestId = ++currentRequestId;

  document.activeElement?.blur();

  try{

    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 200));

    const res = await Onion.fetch(Onion.config.API + "/users");
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

    console.error("💥 ERROR USERS:", e);

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
  if(Array.isArray(res.users)) return res.users;
  if(Array.isArray(res.usuarios)) return res.usuarios;
  if(Array.isArray(res.data)) return res.data;
  if(Array.isArray(res.items)) return res.items;

  return [];

}

/* =========================
   FILTERS
========================= */

function applyFilters(){

  const search = ($("#search-usuario")?.value || "").toLowerCase();
  const estado = ($("#filter-estado-usuario")?.value || "").toLowerCase();
  const rol = ($("#filter-rol-usuario")?.value || "").toLowerCase();
  const tipo = ($("#filter-tipo-usuario")?.value || "").toLowerCase();

  filteredItems = currentItems.filter(u => {

    const name = safeText(u.name || u.username);
    const email = safeText(u.email);

    return (
      (!search || name.includes(search) || email.includes(search)) &&
      (!estado || (estado === "activo" ? u.active : !u.active)) &&
      (!rol || (u.role || "").toLowerCase() === rol) &&
      (!tipo || (u.tipo || "").toLowerCase() === tipo)
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
  $("#usuarios-body").innerHTML =
    `<tr><td colspan="7">No hay usuarios</td></tr>`;
}

function setError(){
  $("#usuarios-body").innerHTML =
    `<tr><td colspan="7">Error cargando usuarios</td></tr>`;
}

/* =========================
   RENDER
========================= */

function render(items){

  const tbody = $("#usuarios-body");
  if(!tbody) return;

  const html = items.map(u => {

    const d = mapItem(u);

    return `
<tr data-id="${d.id}">

  <td class="col-id">${d.id}</td>

  <td class="col-main">
    <div class="cell-user">
      <div class="table-avatar">${renderAvatar(d.nombre)}</div>
      <div class="user-info">
        <span class="user-name">${escapeHTML(d.nombre)}</span>
        <span class="user-sub">${escapeHTML(d.email)}</span>
      </div>
    </div>
  </td>

  <td class="col-secondary">
    <span class="badge ${d.rol.class}">
      ${d.rol.label}
    </span>
  </td>

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

function mapItem(u){

  return {
    id: u.id,

    nombre: cleanValue(
      u.name || u.username,
      "Usuario"
    ),

    email: cleanValue(
      u.email,
      "-"
    ),

    fecha: formatFecha(u.createdAt || u.created_at),

    estado: getEstado(u.active),
    rol: getRol(u.role),
    tipo: getTipo(u.tipo)
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

function safeText(val){
  return String(cleanValue(val, "")).toLowerCase();
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

function getRol(r){
  r = (r || "user").toLowerCase();
  return { label: capitalize(r), class: r };
}

function getTipo(t){
  t = (t || "particular").toLowerCase();
  return { label: capitalize(t), class: t };
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
