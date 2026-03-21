(function(){

"use strict";

console.log("✅ Cuenta JS cargado");


/* =========================
   ROOT / DOM
========================= */

function getRoot(){
  return document.querySelector(".panel-content.cuenta");
}

function $(selector){
  return getRoot()?.querySelector(selector);
}


/* =========================
   INIT
========================= */

function init(){

  const Onion = window.Onion;

  if(!Onion || !Onion.state?.user){
    return setTimeout(init, 100);
  }

  loadCuenta();

}

init();


/* =========================
   LOAD
========================= */

async function loadCuenta(){

  try{

    const Onion = window.Onion;
    const user = Onion.state.user;

    if(!user?.userId){
      throw new Error("User no disponible");
    }

    const res = await Onion.fetch(
      Onion.config.API + "/users/" + user.userId
    );

    if(!res){
      throw new Error("Respuesta inválida");
    }

    render(res);

  }catch(e){

    console.error("💥 CUENTA ERROR:", e);

  }

}


/* =========================
   RENDER
========================= */

function render(u){

  if(!u) return;

  /* KPI */

  $("#cuenta-plan") &&
    ($("#cuenta-plan").textContent = u.plan || "Go Plan");

  $("#cuenta-email") &&
    ($("#cuenta-email").textContent = u.email || "--");

  $("#cuenta-fecha") &&
    ($("#cuenta-fecha").textContent = formatFecha(u.createdAt));


  /* PERFIL */

  $("#cuenta-nombre") &&
    ($("#cuenta-nombre").textContent = u.nombre || u.name || "Usuario");

  $("#cuenta-rol") &&
    ($("#cuenta-rol").textContent = u.role || "user");

  $("#cuenta-id") &&
    ($("#cuenta-id").textContent = "ID: " + (u.id || u.userId));


  /* SUMMARY (si luego quieres métricas reales, aquí se conectan) */

  setSummary();


}


/* =========================
   SUMMARY MOCK (EXTENSIBLE)
========================= */

function setSummary(){

  const summary = document.querySelectorAll(".summary-value");

  if(!summary.length) return;

  summary[0].textContent = "--"; // incidencias
  summary[1].textContent = "--"; // facturas
  summary[2].textContent = "--"; // accesos

}


/* =========================
   HELPERS
========================= */

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

})();
