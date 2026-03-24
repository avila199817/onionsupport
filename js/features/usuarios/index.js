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

function avatar(u){

  const fallback = "/media/img/Usuario.png";

  if(!u) return fallback;

  let src = u.avatar;

  if(!src || typeof src !== "string") return fallback;

  if(src.startsWith("http")) return src;

  return Onion.config.API.replace("/api","") + src;

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

    const btn = e.target.closest("button");
    if(!btn) return;

    const id = btn.dataset.id;
    if(!id) return;

    if(btn.classList.contains("btn-ver")){
      Onion.router.navigate(`/usuarios/usuario?id=${id}`);
    }

    if(btn.classList.contains("btn-editar")){
      Onion.router.navigate(`/usuarios/usuario?id=${id}&edit=true`);
    }

  });

}

/* =========================
   FILTROS
========================= */

function initFilters(){

  const search = $("search-usuario");
  const estado = $("filter-estado-usuario");

  if(search){
    Onion.cleanupEvent(search, "input", applyFilters);
  }

  if(estado){
    Onion.cleanupEvent(estado, "change", applyFilters);
  }

}

function applyFilters(){

  const search = $("search-usuario")?.value.toLowerCase() || "";
  const estado = $("filter-estado-usuario")?.value || "";

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
   RENDER
========================= */

function renderUsers(users = []){

  if(!tbody) return;

  if(!Array.isArray(users) || users.length === 0){
    return renderState("No hay usuarios","empty");
  }

  tbody.innerHTML = users.map(u => {

    const email = safe(u.email) !== "-"
      ? `<a href="mailto:${u.email}">${u.email}</a>`
      : "-";

    const estado = u.active
      ? `<span class="badge activo">Activo</span>`
      : `<span class="badge inactivo">Inactivo</span>`;

    return `
<tr data-id="${u.id}">
  <td>${safe(u.id)}</td>
  <td>
    <div class="usuario-cell">
      <img src="${avatar(u)}" class="usuario-avatar" loading="lazy">
      <span class="usuario-username">${safe(u.username)}</span>
    </div>
  </td>
  <td class="usuario-email">${email}</td>
  <td>${safe(u.role || u.tipo)}</td>
  <td>${estado}</td>
  <td>${safe(u.created_at || u.fecha)}</td>
  <td>
    <div class="table-actions">
      <button class="action-btn btn-ver" data-id="${u.id}">👁</button>
      <button class="action-btn btn-editar" data-id="${u.id}">✏️</button>
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
