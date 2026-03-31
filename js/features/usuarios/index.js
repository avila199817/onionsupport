(function(){

"use strict";

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (usuarios)");
  return;
}

let initialized = false;
let tbody = null;
let usersCache = [];

/* =========================
   ROOT
========================= */

function getRoot(){
  return document.querySelector(".panel-content.usuarios");
}

function $(id){
  return getRoot()?.querySelector("#" + id);
}

/* =========================
   API
========================= */

async function getUsers(){

  const res = await Onion.fetch(Onion.config.API + "/users");
  return res?.users || res?.usuarios || res || [];

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

function capitalize(str){
  if(!str) return "-";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/* =========================
   AVATAR PRO
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

function renderAvatarHTML(u){

  const name = u.name || u.username || "U";

  if(u.avatar){
    let src = u.avatar;

    if(!src.startsWith("http")){
      src = Onion.config.API.replace("/api","") + src;
    }

    return `<img src="${src}" alt="${name}" loading="lazy">`;
  }

  const initials = getInitials(name);
  const color = getAvatarColor(name);

  return `
    <div style="
      background:${color};
      width:100%;
      height:100%;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius:50%;
      color:#fff;
      font-weight:600;
      font-size:12px;
    ">
      ${initials}
    </div>
  `;
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

  tbody = $("usuarios-body");
  if(!tbody) return;

  bindEvents();
  initFilters();
  loadUsers();

  Onion.onCleanup(()=>{
    initialized = false;
    tbody = null;
    usersCache = [];
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

    Onion.router.navigate(`/usuarios/usuario?id=${id}`);

  });

}

/* =========================
   FILTROS
========================= */

function initFilters(){

  const search = $("search-usuario");
  const estado = $("filter-estado-usuario");
  const rol = $("filter-rol-usuario");
  const tipo = $("filter-tipo-usuario");

  search && Onion.cleanupEvent(search, "input", applyFilters);
  estado && Onion.cleanupEvent(estado, "change", applyFilters);
  rol && Onion.cleanupEvent(rol, "change", applyFilters);
  tipo && Onion.cleanupEvent(tipo, "change", applyFilters);

}

function applyFilters(){

  const search = $("search-usuario")?.value.toLowerCase() || "";
  const estado = $("filter-estado-usuario")?.value || "";
  const rol = $("filter-rol-usuario")?.value || "";
  const tipo = $("filter-tipo-usuario")?.value || "";

  let filtered = usersCache;

  if(search){
    filtered = filtered.filter(u =>
      (u.username || "").toLowerCase().includes(search) ||
      (u.name || "").toLowerCase().includes(search) ||
      (u.email || "").toLowerCase().includes(search)
    );
  }

  if(estado){
    filtered = filtered.filter(u =>
      estado === "activo" ? u.active : !u.active
    );
  }

  if(rol){
    filtered = filtered.filter(u =>
      (u.role || "").toLowerCase() === rol
    );
  }

  if(tipo){
    filtered = filtered.filter(u =>
      (u.tipo || "").toLowerCase() === tipo
    );
  }

  renderUsers(filtered);

}

/* =========================
   LOAD
========================= */

async function loadUsers(){

  const panel = getRoot();

  panel?.classList.remove("ready");

  renderState("Cargando usuarios…");

  try{

    const users = await getUsers();

    usersCache = users;

    renderUsers(users);

    requestAnimationFrame(()=>{
      panel?.classList.add("ready");
    });

  }catch(err){

    console.error("💥 USERS ERROR:", err);

    renderState("Error cargando usuarios","error");

    panel?.classList.add("ready");

  }

}

/* =========================
   RENDER 🔥 CLAVE
========================= */

function renderUsers(users = []){

  if(!tbody) return;

  if(!Array.isArray(users) || users.length === 0){
    return renderState("No hay usuarios","empty");
  }

  tbody.innerHTML = users.map(u => {

    const estado = u.active
      ? `<span class="badge activo">Activo</span>`
      : `<span class="badge inactivo">Inactivo</span>`;

    const rol = `<span class="badge ${u.role || "user"}">${capitalize(u.role)}</span>`;
    const tipo = `<span class="badge ${u.tipo || "particular"}">${capitalize(u.tipo)}</span>`;

    return `
<tr data-id="${u.id}">

  <td class="col-id">${safe(u.id)}</td>

  <td class="col-main">
    <div class="cell-user">
      <div class="table-avatar">
        ${renderAvatarHTML(u)}
      </div>
      <div class="user-info">
        <span class="user-name">${safe(u.name || u.username)}</span>
        <span class="user-sub">${safe(u.email)}</span>
      </div>
    </div>
  </td>

  <td class="col-secondary">${rol}</td>

  <td class="col-secondary">${tipo}</td>

  <td class="col-status">${estado}</td>

  <td class="col-date">${formatFecha(u.createdAt || u.created_at)}</td>

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
  <td colspan="6" class="${cls}">
    ${message}
  </td>
</tr>
`;

}

})();
