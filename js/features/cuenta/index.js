(function(){

"use strict";

/* =====================================================
   SINGLETON
===================================================== */

if(window.__onionCuentaLoaded) return;
window.__onionCuentaLoaded = true;

/* =====================================================
   STATE
===================================================== */

let initialized = false;

/* =====================================================
   ROOT / DOM
===================================================== */

function getRoot(){
  return document.querySelector(".panel-content.cuenta");
}

function $(selector){
  return getRoot()?.querySelector(selector);
}

function set(selector, value){
  const el = $(selector);
  if(el) el.textContent = value ?? "--";
}

function setAttr(selector, attr, value){
  const el = $(selector);
  if(el) el.setAttribute(attr, value);
}

/* =====================================================
   HELPERS
===================================================== */

function safe(v){
  return v && String(v).trim() !== "" ? v : "--";
}

function formatFecha(f){
  if(!f) return "--";

  try{
    return new Date(f).toLocaleDateString("es-ES");
  }catch{
    return "--";
  }
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

function isCuentaRoute(path){
  return path === "/cuenta" || path.startsWith("/cuenta/");
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
    if(isCuentaRoute(e.detail)){
      run();
    }
  });

}

boot();

/* =====================================================
   RUN (🔥 CLAVE)
===================================================== */

function run(){

  Onion.cleanupAll(); // 🔥 limpia eventos

  initialized = false;

  requestAnimationFrame(()=>{
    safeInit();
  });

}

/* =====================================================
   SAFE INIT
===================================================== */

function safeInit(){

  const root = getRoot();

  if(!root) return;

  if(initialized) return;

  if(!Onion.state?.user){
    return setTimeout(safeInit, 100);
  }

  initialized = true;

  init();

}

/* =====================================================
   INIT
===================================================== */

function init(){

  Onion.log("👤 CUENTA INIT OK");

  loadCuenta();

  // 🔥🔥🔥 ESTA ES LA PUTA CLAVE
  Onion.onCleanup(()=>{
    initialized = false;
  });

}

/* =====================================================
   LOAD
===================================================== */

async function loadCuenta(){

  const panel = getRoot();

  if(panel){
    panel.classList.remove("ready");
  }

  try{

    const userState = Onion.state.user;

    const id = userState.userId || userState.id;

    if(!id){
      throw new Error("UserId no disponible");
    }

    const res = await Onion.fetch(
      Onion.config.API + "/users/" + id
    );

    const u = res?.user || res;

    if(!u){
      throw new Error("Usuario vacío");
    }

    render(u);

    requestAnimationFrame(()=>{
      panel?.classList.add("ready");
    });

  }catch(err){

    console.error("💥 CUENTA ERROR:", err);

    fallback();

    panel?.classList.add("ready");

  }

}

/* =====================================================
   RENDER
===================================================== */

function render(u){

  const root = getRoot();
  if(!root) return;

  Onion.log("🔥 Render cuenta");

  const name =
    u.name ||
    u.username ||
    u.email ||
    "Usuario";

  set("#cuenta-nombre", name);
  set("#cuenta-nombre-main", name);

  set("#cuenta-email", safe(u.email));

  const twoFA = u.twofa_enabled === true;
  set("#cuenta-2fa", twoFA ? "Activado" : "Desactivado");

  set("#cuenta-plan", safe(u.plan || "Go Plan"));
  set("#cuenta-fecha", formatFecha(u.createdAt));
  set("#cuenta-id", safe(u.userId || u.id));

  setAttr("#cuenta-avatar", "src", avatar(u));

}

/* =====================================================
   FALLBACK
===================================================== */

function fallback(){

  set("#cuenta-nombre", "Usuario");
  set("#cuenta-nombre-main", "Usuario");

  set("#cuenta-email", "--");
  set("#cuenta-2fa", "Desactivado");

  set("#cuenta-plan", "Go Plan");
  set("#cuenta-fecha", "--");
  set("#cuenta-id", "--");

  setAttr("#cuenta-avatar", "src", "/media/img/Usuario.png");

}

})();
