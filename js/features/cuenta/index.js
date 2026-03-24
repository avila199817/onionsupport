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
   THEME
===================================================== */

function applyTheme(darkMode){

  // 🔥 DARK = default
  if(darkMode){
    document.documentElement.removeAttribute("data-theme");
  }else{
    document.documentElement.setAttribute("data-theme","light");
  }

}

async function saveTheme(darkMode){

  try{

    await Onion.fetch(Onion.config.API + "/user/preferences/privacy", {
      method: "PATCH",
      body: {
        darkMode: darkMode
      }
    });

  }catch(e){
    console.error("💥 ERROR GUARDANDO TEMA:", e);
  }

}

/* =====================================================
   ROUTE CHECK
===================================================== */

function isCuentaRoute(path){
  return path === "/cuenta" || path.startsWith("/cuenta/");
}

/* =====================================================
   BOOT
===================================================== */

function boot(){

  if(!window.Onion){
    return setTimeout(boot, 50);
  }

  run();

  Onion.onGlobalEvent(window, "onion:route-change", (e)=>{
    if(isCuentaRoute(e.detail)){
      run();
    }
  });

}

boot();

/* =====================================================
   RUN
===================================================== */

function run(){

  Onion.cleanupAll();

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
  initThemeToggle();

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

    // 🔥 default = DARK
    applyTheme(u.darkMode !== false);

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

  const toggle = $("#toggle-darkmode");
  const label = $("#cuenta-darkmode");

  const isDark = u.darkMode !== false;

  if(toggle){
    toggle.checked = isDark;
  }

  if(label){
    label.textContent = isDark ? "Activado" : "Desactivado";
  }

}

/* =====================================================
   TOGGLE
===================================================== */

function initThemeToggle(){

  const toggle = $("#toggle-darkmode");
  const label = $("#cuenta-darkmode");

  if(!toggle) return;

  Onion.cleanupEvent(toggle, "change", async ()=>{

    const darkMode = toggle.checked;

    applyTheme(darkMode);

    if(label){
      label.textContent = darkMode ? "Activado" : "Desactivado";
    }

    await saveTheme(darkMode);

  });

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
