"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (usuarios)");
  return;
}

let initialized = false;
let tbody = null;

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
  loadUsers();

  Onion.onCleanup(()=>{
    initialized = false;
    tbody = null;
  });

}

init();

/* =========================
   EVENTS
========================= */

function bindEvents(){

  if(!tbody) return;

  // click fila
  Onion.cleanupEvent(tbody, "click", (e)=>{

    const row = e.target.closest("tr[data-id]");
    if(!row) return;

    const id = row.dataset.id;
    if(!id) return;

    Onion.router.navigate(`/usuarios/usuario?id=${id}`);

  });

  // botón nuevo
  const btnNew = $("btn-new-usuario");

  if(btnNew){
    Onion.cleanupEvent(btnNew, "click", ()=>{
      Onion.router.navigate("/usuarios/nuevo");
    });
  }

}

/* =========================
   LOAD
========================= */

async function loadUsers(){

  const panel = getRoot();

  try{

    const res = await Onion.fetch(Onion.config.API + "/users");
    const users = res?.users || res || [];

    render(users);

    requestAnimationFrame(()=>{
      panel?.classList.add("ready");
    });

  }catch(err){

    console.error("💥 USERS ERROR:", err);
    render([]);

  }

}

/* =========================
   RENDER
========================= */

function render(users){

  if(!tbody) return;

  if(!users.length){
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; opacity:.6;">
          No hay usuarios
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr data-id="${u.id}">
      <td class="col-id">${u.id}</td>
      <td class="col-main">${u.name || u.username || "-"}</td>
      <td class="col-secondary">${u.role || "-"}</td>
      <td class="col-secondary">${u.tipo || "-"}</td>
      <td class="col-status">${u.active ? "Activo" : "Inactivo"}</td>
      <td class="col-date">${u.createdAt ? new Date(u.createdAt).toLocaleDateString("es-ES") : "-"}</td>
    </tr>
  `).join("");

}

})();
