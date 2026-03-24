(function(){

"use strict";

const Onion = window.Onion;

if(!Onion){
  console.error("💥 Onion no disponible (cuenta)");
  return;
}

let initialized = false;

/* =========================
   ROOT
========================= */

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

/* =========================
   HELPERS
========================= */

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

/* =========================
   THEME
========================= */

function applyTheme(darkMode){

  if(darkMode){
    document.documentElement.removeAttribute("data-theme");
  }else{
    document.documentElement.setAttribute("data-theme","light");
  }

}

async function saveTheme(darkMode){

  try{
    await Onion.fetch("/user/preferences/privacy", {
      method: "PATCH",
      body: { darkMode }
    });
  }catch(e){
    console.error("💥 ERROR GUARDANDO TEMA:", e);
  }

}

/* =========================
   INIT
========================= */

function init(){

  const root = getRoot();
  if(!root) return;

  if(initialized) return;

  if(!Onion.state?.user){
    return setTimeout(init, 100);
  }

  initialized = true;

  loadCuenta();
  initThemeToggle();

  Onion.onCleanup(()=>{
    initialized = false;
  });

}

init();

/* =========================
   LOAD
========================= */

async function loadCuenta(){

  const panel = getRoot();

  panel?.classList.remove("ready");

  try{

    const userState = Onion.state.user;
    const id = userState?.userId || userState?.id;

    if(!id){
      throw new Error("UserId no disponible");
    }

    const res = await Onion.fetch("/users/" + id);

    const u = res?.user || res;

    if(!u){
      throw new Error("Usuario vacío");
    }

    render(u);

    const isDark = u.darkMode !== false;
    applyTheme(isDark);

    requestAnimationFrame(()=>{
      panel?.classList.add("ready");
    });

  }catch(err){

    console.error("💥 CUENTA ERROR:", err);

    fallback();

    panel?.classList.add("ready");

  }

}

/* =========================
   RENDER
========================= */

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

/* =========================
   TOGGLE
========================= */

function initThemeToggle(){

  const toggle = $("#toggle-darkmode");
  const label = $("#cuenta-darkmode");

  if(!toggle || toggle.__bound) return;

  toggle.__bound = true;

  Onion.cleanupEvent(toggle, "change", async ()=>{

    const darkMode = toggle.checked;

    applyTheme(darkMode);

    if(label){
      label.textContent = darkMode ? "Activado" : "Desactivado";
    }

    await saveTheme(darkMode);

  });

}

/* =========================
   FALLBACK
========================= */

function fallback(){

  set("#cuenta-nombre", "Usuario");
  set("#cuenta-nombre-main", "Usuario");

  set("#cuenta-email", "--");
  set("#cuenta-2fa", "Desactivado");

  set("#cuenta-plan", "Go Plan");
  set("#cuenta-fecha", "--");
  set("#cuenta-id", "--");

  setAttr("#cuenta-avatar", "src", "/media/img/Usuario.png");

  applyTheme(true);

}

})();
