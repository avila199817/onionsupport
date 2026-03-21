(function(){

"use strict";

console.log("✅ Cuenta JS cargado");


/* =========================
   SINGLETON
========================= */

if(window.__onionCuentaLoaded) return;
window.__onionCuentaLoaded = true;


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

    const u = res.user || res;

    if(!u){
      throw new Error("Respuesta inválida");
    }

    render(u);

  }catch(e){

    console.error("💥 CUENTA ERROR:", e);

  }

}


/* =========================
   RENDER
========================= */

function render(u){

  if(!u) return;

  console.log("🔥 CUENTA RENDER");


  /* KPI */

  set("#cuenta-plan", u.plan || "Go Plan");

  set("#cuenta-email", u.email || "--");

  set("#cuenta-fecha",
    formatFecha(u.createdAt || u.fechaCreacion)
  );


  /* PERFIL */

  set("#cuenta-nombre",
    u.nombre || u.name || u.email || "Usuario"
  );

  set("#cuenta-rol",
    (u.role || "user").toUpperCase()
  );

  set("#cuenta-id",
    "ID: " + (u.id || u.userId || "--")
  );


  /* SUMMARY (base simple) */

  setSummary();

}


/* =========================
   SUMMARY (BASE)
========================= */

function setSummary(){

  const items = document.querySelectorAll(".summary-value");

  if(!items.length) return;

  items[0].textContent = "0"; // incidencias
  items[1].textContent = "0"; // facturas
  items[2].textContent = "1"; // sesiones

}


/* =========================
   HELPERS
========================= */

function set(selector, value){
  const el = $(selector);
  if(el) el.textContent = value;
}

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

})();
