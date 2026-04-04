"use strict";

(function(){

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (cliente detalle)");
  return;
}

/* =========================
   ROOT
========================= */
function getRoot(){
  return document.querySelector(".panel-content.cliente-detalle");
}

function $(id){
  return getRoot()?.querySelector("#" + id);
}

/* =========================
   INIT
========================= */
function init(){

  const root = getRoot();
  if(!root) return;

  bindEvents();
  loadCliente();

}

init();

/* =========================
   EVENTS
========================= */
function bindEvents(){

  const btnBack = $("btn-back");

  if(btnBack){
    btnBack.onclick = ()=>{
      Onion.router.navigate("/clientes");
    };
  }

}

/* =========================
   GET ID
========================= */
function getId(){
  return new URLSearchParams(location.search).get("id");
}

/* =========================
   LOAD
========================= */
async function loadCliente(){

  const id = getId();
  if(!id) return;

  try{

    const res = await Onion.fetch(
      Onion.config.API + "/clientes/" + id
    );

    const c = res?.cliente || res;
    if(!c) return;

    render(c);

  }catch(err){
    console.error("💥 ERROR CLIENTE:", err);
  }

}

/* =========================
   RENDER
========================= */
function render(c){

  set("detalle-nombre", c.nombre || c.nombreContacto);
  set("detalle-nombre-full", c.nombre || c.nombreContacto);
  set("detalle-email", c.email);
  set("detalle-id", "ID: " + c.id);

  set("detalle-telefono", c.telefono || "-");
  set("detalle-empresa", c.empresa || c.razonSocial || "-");
  set("detalle-nif", c.nif || c.cif || "-");

  set("detalle-estado", c.activo ? "Activo" : "Inactivo");
  set("detalle-fecha", formatFecha(c.createdAt));

  set("detalle-direccion", c.direccion || "-");
  set("detalle-notas", c.notas || "-");

  renderAvatar(c);

}

/* =========================
   HELPERS
========================= */
function set(id, value){
  const el = $(id);
  if(el) el.textContent = value || "-";
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

/* =========================
   AVATAR
========================= */
function renderAvatar(c){

  const el = $("detalle-avatar");
  if(!el) return;

  const name = c.nombre || c.nombreContacto || "C";

  const initials = name
    .split(" ")
    .map(n=>n[0])
    .slice(0,2)
    .join("")
    .toUpperCase();

  el.textContent = initials;

}

})();
