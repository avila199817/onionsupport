(function(){

"use strict";

console.log("✅ Cuenta JS PRO REAL");


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

function set(selector, value){
  const el = $(selector);
  if(el) el.textContent = value;
}


/* =========================
   INIT
========================= */

function init(){

  const Onion = window.Onion;
  const root = getRoot();

  if(!root){
    return setTimeout(init, 50);
  }

  if(!Onion || !Onion.state?.user){
    return setTimeout(init, 50);
  }

  loadCuenta();

}

setTimeout(init, 0);


/* =========================
   LOAD
========================= */

async function loadCuenta(){

  try{

    const Onion = window.Onion;
    const user = Onion.state.user;

    if(!user?.userId){
      throw new Error("UserId no disponible");
    }

    const res = await Onion.fetch(
      Onion.config.API + "/users/" + user.userId
    );

    const u = res.user || res;

    render(u);

  }catch(e){

    console.error("💥 CUENTA ERROR:", e);
    fallback();

  }

}


/* =========================
   RENDER
========================= */

function render(u){

  if(!u) return;

  console.log("🔥 RENDER CUENTA REAL");


  /* =========================
     KPI
  ========================= */

  set("#cuenta-plan", "Go Plan"); // aún no tienes plan en backend

  set("#cuenta-email", u.email || "--");

  set("#cuenta-fecha", formatFecha(u.createdAt));


  /* =========================
     PERFIL
  ========================= */

  set("#cuenta-nombre", u.name || u.username || "Usuario");

  set("#cuenta-rol", (u.role || "user").toUpperCase());

  set("#cuenta-id", "ID: " + (u.userId || "--"));


  /* =========================
     SUMMARY (REAL BASE)
  ========================= */

  setSummary();


  /* =========================
     ESTADO REAL
  ========================= */

  renderEstado(u);


  /* =========================
     EXTRA (DEBUG PRO)
  ========================= */

  console.log("📦 USER FULL:", u);

}


/* =========================
   ESTADO (REAL DATA)
========================= */

function renderEstado(u){

  const root = getRoot();
  if(!root) return;

  const list = root.querySelector(".alerts .alert-list");
  if(!list) return;

  const twoFA = u.twofa_enabled === true;
  const emailOK = u.emailVerified === true;
  const active = u.active === true;

  list.innerHTML = `
    <div class="alert-item ${active ? "info" : "warn"}">
      Cuenta ${active ? "operativa" : "desactivada"}
    </div>

    <div class="alert-item ${twoFA ? "info" : "warn"}">
      2FA: ${twoFA ? "Activado" : "No activado"}
    </div>

    <div class="alert-item ${emailOK ? "info" : "warn"}">
      Email: ${emailOK ? "Verificado" : "No verificado"}
    </div>
  `;

}


/* =========================
   SUMMARY (PREPARADO)
========================= */

function setSummary(){

  const root = getRoot();
  if(!root) return;

  const items = root.querySelectorAll(".summary-value");

  if(!items.length) return;

  items[0].textContent = "0"; // incidencias
  items[1].textContent = "0"; // facturas
  items[2].textContent = "1"; // sesiones

}


/* =========================
   FALLBACK
========================= */

function fallback(){

  set("#cuenta-plan", "Go Plan");
  set("#cuenta-email", "--");
  set("#cuenta-fecha", "--");

  set("#cuenta-nombre", "Usuario");
  set("#cuenta-rol", "USER");
  set("#cuenta-id", "ID: --");

}


/* =========================
   HELPERS
========================= */

function formatFecha(f){
  if(!f) return "--";
  return new Date(f).toLocaleDateString("es-ES");
}

})();
