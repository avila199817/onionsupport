(function(){

"use strict";

/* =====================================================
   SINGLETON
===================================================== */

if(window.__onionUsuariosLoaded) return;
window.__onionUsuariosLoaded = true;

/* =====================================================
   STATE
===================================================== */

let tbody = null;
let usersCache = [];
let initialized = false;

/* =====================================================
   API
===================================================== */

const API = {

  async getUsers(){

    const res = await Onion.fetch(
      Onion.config.API + "/users"
    );

    return res?.users || res?.usuarios || res || [];

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

function isUsuariosRoute(path){
  return path === "/usuarios" || path.startsWith("/usuarios/");
}

/* =====================================================
   BOOT (SPA)
===================================================== */

function boot(){

  if(!window.Onion){
    return setTimeout(boot, 50);
  }

  run();

  window.addEventListener("onion:route-change", (e)=>{
    if(isUsuariosRoute(e.detail)){
      run();
    }
  });

}

boot();

/* =====================================================
   RUN (CON CLEANUP)
===================================================== */

function run(){

  Onion.cleanupAll(); // 🔥 limpia listeners anteriores

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

  const el = qs("usuarios-body");

  if(!el) return;

  if(initialized && tbody === el) return;

  tbody = el;
  initialized = true;

  init();

}

/* =====================================================
   RENDER
===================================================== */

function renderUsers(users = []){

  if(!Array.isArray(users) || users.length === 0){
    renderState("No hay usuarios.","empty");
    return;
  }

  const html = users.map(u => {

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

      <img
        src="${avatar(u)}"
        class="usuario-avatar"
        loading="lazy"
        onerror="this.src='/media/img/Usuario.png'">

      <span class="usuario-username">
        ${safe(u.username)}
      </span>

    </div>
  </td>

  <td class="usuario-email">${email}</td>

  <td>${safe(u.role || u.tipo)}</td>

  <td>${estado}</td>

  <td>${safe(u.created_at || u.fecha)}</td>

  <td>
    <div class="table-actions">

      <button
        class="action-btn btn-ver"
        data-id="${u.id}">
        👁
      </button>

      <button
        class="action-btn btn-editar"
        data-id="${u.id}">
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
   FILTROS (CON CLEANUP)
===================================================== */

function initFilters(){

  const search = qs("search-usuario");
  const estado = qs("filter-estado-usuario");

  if(search){
    Onion.cleanupEvent(search, "input", applyFilters);
  }

  if(estado){
    Onion.cleanupEvent(estado, "change", applyFilters);
  }

}

function applyFilters(){

  const search = qs("search-usuario")?.value.toLowerCase() || "";
  const estado = qs("filter-estado-usuario")?.value || "";

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

/* =====================================================
   EVENTS
===================================================== */

function initTableActions(){

  if(!tbody) return;

  Onion.cleanupEvent(tbody, "click", (e)=>{

    const btn = e.target.closest("button");
    if(!btn) return;

    const id = btn.dataset.id;
    if(!id) return;

    if(btn.classList.contains("btn-ver")){
      Onion.go(`/usuarios/usuario?id=${id}`);
    }

    if(btn.classList.contains("btn-editar")){
      Onion.go(`/usuarios/usuario?id=${id}&edit=true`);
    }

  });

}

/* =====================================================
   LOAD (🔥 PANEL READY CONTROL)
===================================================== */

async function loadUsers(){

  const panel = document.querySelector(".panel-content.usuarios");

  if(panel){
    panel.classList.remove("ready"); // 🔥 ocultar UI
  }

  renderState("Cargando usuarios…");

  try{

    const users = await API.getUsers();

    console.log("📡 USERS:", users);

    usersCache = users;

    renderUsers(users);

    // 🔥 mostrar SOLO cuando ya hay datos
    requestAnimationFrame(()=>{
      panel?.classList.add("ready");
    });

  }
  catch(err){

    console.error("💥 USERS ERROR:", err);

    renderState("Error cargando usuarios.","error");

    window.toast?.error?.("Error cargando usuarios");

    // 🔥 incluso en error mostramos panel
    panel?.classList.add("ready");

  }

}

/* =====================================================
   INIT
===================================================== */

function init(){

  console.log("✅ USUARIOS INIT OK");

  initFilters();
  initTableActions();
  loadUsers();

}

})();
