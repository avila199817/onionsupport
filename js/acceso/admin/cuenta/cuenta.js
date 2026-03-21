(function(){

"use strict";

console.log("✅ Cuenta JS PRO cargado");


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
   INIT (ANTI-ROTURAS)
========================= */

function init(){

  const Onion = window.Onion;
  const root = getRoot();

  if(!root){
    console.warn("⏳ Esperando DOM cuenta...");
    return setTimeout(init, 50);
  }

  if(!Onion || !Onion.state?.user){
    console.warn("⏳ Esperando usuario...");
    return setTimeout(init, 50);
  }

  console.log("🔥 INIT CUENTA OK");

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

    console.log("👤 USER STATE:", user);

    if(!user?.userId){
      throw new Error("UserId no disponible");
    }

    const res = await Onion.fetch(
      Onion.config.API + "/users/" + user.userId
    );

    console.log("📡 API RESPONSE:", res);

    const u = res.user || res;

    if(!u){
      throw new Error("Respuesta inválida");
    }

    render(u);

  }catch(e){

    console.error("💥 CUENTA ERROR:", e);

    fallback(); // 👈 nunca deja la pantalla vacía

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


  /* SUMMARY */

  setSummary();


  /* ESTADO DINÁMICO (2FA + EMAIL) */

  renderEstado(u);

}


/* =========================
   ESTADO CUENTA (PRO)
========================= */

function renderEstado(u){

  const root = getRoot();
  if(!root) return;

  const list = root.querySelector(".alerts .alert-list");
  if(!list) return;

  const twoFA = u.twofa_enabled === true;
  const emailOK = u.emailVerified === true;

  list.innerHTML = `
    <div class="alert-item info">
      Cuenta operativa
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
   SUMMARY (BASE PREPARADA)
========================= */

function setSummary(){

  const root = getRoot();
  if(!root) return;

  const items = root.querySelectorAll(".summary-value");

  if(!items.length) return;

  // 🔥 preparado para conectar API real
  items[0].textContent = "0"; // incidencias
  items[1].textContent = "0"; // facturas
  items[2].textContent = "1"; // sesiones

}


/* =========================
   FALLBACK (NO PANTALLA VACÍA)
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
