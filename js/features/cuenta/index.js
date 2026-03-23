(function(){

"use strict";

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (cuenta)");
  return;
}

let initialized = false;

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
   INIT (ANTI DUPLICADO REAL)
========================= */

function init(){

  if(initialized) return;

  const root = getRoot();
  if(!root) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  Onion.log("👤 Cuenta init");

  loadCuenta();

  // 🔥 cleanup SPA
  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* =========================
   LOAD
========================= */

async function loadCuenta(){

  try{

    const user = Onion.state.user;

    if(!user?.userId && !user?.id){
      throw new Error("UserId no disponible");
    }

    const id = user.userId || user.id;

    const res = await Onion.fetch(
      Onion.config.API + "/users/" + id
    );

    const u = res?.user || res;

    if(!u){
      throw new Error("Usuario vacío");
    }

    render(u);

  }catch(e){

    Onion.error("💥 CUENTA ERROR:", e);
    fallback();

  }

}

/* =========================
   RENDER
========================= */

function render(u){

  const root = getRoot();
  if(!root) return;

  Onion.log("🔥 Render cuenta");

  /* =========================
     KPI
  ========================= */

  set("#cuenta-plan", u.plan || "Go Plan");
  set("#cuenta-email", u.email || "--");
  set("#cuenta-fecha", formatFecha(u.createdAt));

  /* =========================
     PERFIL
  ========================= */

  const name =
    u.name ||
    u.username ||
    u.email ||
    "Usuario";

  set("#cuenta-nombre", name);
  set("#cuenta-rol", (u.role || "user").toUpperCase());
  set("#cuenta-id", "ID: " + (u.userId || u.id || "--"));

  /* =========================
     SUMMARY
  ========================= */

  setSummary(u);

  /* =========================
     ESTADO
  ========================= */

  renderEstado(u);

}

/* =========================
   ESTADO (REAL)
========================= */

function renderEstado(u){

  const root = getRoot();
  if(!root) return;

  const list = root.querySelector(".alerts .alert-list");
  if(!list) return;

  const twoFA = u.twofa_enabled === true;
  const emailOK = u.emailVerified === true;
  const active = u.active !== false;

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
   SUMMARY (ESCALABLE)
========================= */

function setSummary(u){

  const root = getRoot();
  if(!root) return;

  const items = root.querySelectorAll(".summary-value");
  if(!items.length) return;

  // 🔥 preparado para backend real
  items[0].textContent = u.totalTickets ?? "0";
  items[1].textContent = u.totalFacturas ?? "0";
  items[2].textContent = u.activeSessions ?? "1";

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

  try{
    return new Date(f).toLocaleDateString("es-ES");
  }catch{
    return "--";
  }
}

})();
