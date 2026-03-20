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
let DOM = {};


/* =====================================================
   HELPERS
===================================================== */

function qs(id){
  return document.getElementById(id);
}

function setText(el,val){
  if(el) el.textContent = val;
}

function safe(v){
  return v && String(v).trim() !== "" ? v : "-";
}

function tiempoRelativo(fechaISO){

  if(!fechaISO) return "—";

  const now=new Date();
  const date=new Date(fechaISO);

  const diff=now-date;

  const min=Math.floor(diff/60000);
  const hour=Math.floor(diff/3600000);
  const day=Math.floor(diff/86400000);
  const month=Math.floor(day/30);

  if(month>0) return `Hace ${month} mes${month>1?"es":""}`;
  if(day>0) return `Hace ${day} día${day>1?"s":""}`;
  if(hour>0) return `Hace ${hour} hora${hour>1?"s":""}`;

  return `Hace ${min} min`;
}

function toast(msg,type="success"){

  const container=document.querySelector(".toast-container");
  if(!container) return;

  const t=document.createElement("div");
  t.className=`toast toast-${type}`;
  t.textContent=msg;

  container.appendChild(t);

  setTimeout(()=>{
    t.style.opacity="0";
    t.style.transform="translateX(40px)";
    setTimeout(()=>t.remove(),300);
  },3000);

}


/* =====================================================
   AVATAR
===================================================== */

const FALLBACK="/media/img/Usuario.png";

function setAvatar(url){

  if(!DOM.avatarImg) return;

  if(!url){
    DOM.avatarImg.src=FALLBACK;
    DOM.avatarPreview && (DOM.avatarPreview.src=FALLBACK);
    return;
  }

  const fresh=url+"?t="+Date.now();

  DOM.avatarImg.src=fresh;
  DOM.avatarPreview && (DOM.avatarPreview.src=fresh);

}


/* =====================================================
   RENDER
===================================================== */

function render(user){

  if(!user) return;

  console.log("🔥 CUENTA RENDER");

  const name = user.name || user.username || "Usuario";
  const email = user.email || "usuario@dominio.com";

  setText(DOM.profileName,name);
  setText(DOM.cardName,name);

  setText(DOM.profileEmail,email);
  setText(DOM.cardEmail,email);

  setAvatar(user.avatar);

  if(user.lastPasswordChangeAt && DOM.passwordText){
    DOM.passwordText.textContent =
      `Último cambio: ${tiempoRelativo(user.lastPasswordChangeAt)}`;
  }

  render2FA(user.twofa_enabled === true);

}


/* =====================================================
   2FA
===================================================== */

function render2FA(enabled){

  if(!DOM.twoFAStatus || !DOM.twoFAButton) return;

  if(enabled){

    DOM.twoFAStatus.textContent="Activado";
    DOM.twoFAStatus.classList.add("text-success");

    DOM.twoFAButton.textContent="Desactivar";
    DOM.twoFAButton.dataset.mode="disable";

  }else{

    DOM.twoFAStatus.textContent="No activado";
    DOM.twoFAStatus.classList.remove("text-success");

    DOM.twoFAButton.textContent="Activar";
    DOM.twoFAButton.dataset.mode="enable";

  }

}


/* =====================================================
   EVENTS
===================================================== */

function bindEvents(){

  DOM.avatar?.addEventListener("click",()=>{
    DOM.avatarModal?.classList.add("open");
  });

  DOM.avatarClose?.addEventListener("click",closeModal);
  DOM.avatarOverlay?.addEventListener("click",closeModal);

  DOM.uploadAvatarBtn?.addEventListener("click",()=>{
    DOM.avatarInput?.click();
  });

  DOM.avatarInput?.addEventListener("change",handleUpload);

  DOM.removeAvatarBtn?.addEventListener("click",removeAvatar);

  DOM.twoFAButton?.addEventListener("click",()=>{

    const mode = DOM.twoFAButton.dataset.mode;

    if(mode==="enable") Onion.go("/2fa/activate");
    if(mode==="disable") Onion.go("/2fa/disable");

  });

  document.querySelectorAll("[data-href]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      Onion.go(btn.dataset.href);
    });
  });

}

function closeModal(){
  DOM.avatarModal?.classList.remove("open");
}


/* =====================================================
   AVATAR UPLOAD
===================================================== */

async function handleUpload(){

  const file = DOM.avatarInput.files[0];
  if(!file) return;

  if(!file.type.startsWith("image/")){
    toast("Solo imágenes","error");
    return;
  }

  if(file.size > 2*1024*1024){
    toast("Máx 2MB","error");
    return;
  }

  const reader = new FileReader();
  reader.onload = e => setAvatar(e.target.result);
  reader.readAsDataURL(file);

  try{

    const formData=new FormData();
    formData.append("avatar",file);

    const res = await fetch(Onion.config.API+"/users/avatar",{
      method:"POST",
      headers:{Authorization:"Bearer "+localStorage.getItem("onion_token")},
      body:formData
    });

    const json = await res.json();

    if(json?.avatarUrl){
      setAvatar(json.avatarUrl);
      Onion.state.user.avatar = json.avatarUrl;
      toast("Avatar actualizado");
    }else{
      throw new Error();
    }

  }catch(e){
    console.error(e);
    toast("Error subiendo avatar","error");
  }

  closeModal();

}


/* =====================================================
   REMOVE AVATAR
===================================================== */

async function removeAvatar(){

  try{

    await Onion.fetch(Onion.config.API+"/users/avatar",{
      method:"DELETE"
    });

    setAvatar(null);
    Onion.state.user.avatar = null;

    toast("Avatar eliminado");
    closeModal();

  }catch(e){
    console.error(e);
    toast("Error eliminando avatar","error");
  }

}


/* =====================================================
   INIT FLOW (🔥 CLAVE)
===================================================== */

function mapDOM(){

  DOM = {
    profileName:qs("profileUserName"),
    profileEmail:qs("profileUserEmail"),
    cardName:qs("cardUserName"),
    cardEmail:qs("cardUserEmail"),
    passwordText:qs("lastPasswordChangeText"),
    twoFAStatus:qs("twofaStatus"),
    twoFAButton:qs("twofaButton"),
    avatar:qs("profileAvatar"),
    avatarImg:qs("avatarImg"),
    avatarInput:qs("avatarInput"),
    avatarModal:qs("avatarModal"),
    avatarOverlay:qs("avatarModalOverlay"),
    avatarClose:qs("closeAvatarModal"),
    avatarPreview:qs("avatarPreviewImg"),
    uploadAvatarBtn:qs("uploadAvatarBtn"),
    removeAvatarBtn:qs("removeAvatarBtn")
  };
}


function boot(){

  if(!window.Onion){
    return setTimeout(boot,50);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded", waitUser, {once:true});
  }else{
    waitUser();
  }

}

boot();


function waitUser(){

  if(Onion.state?.user){
    safeInit();
  }else{
    window.addEventListener("onion:user-ready", safeInit, {once:true});
  }

}


function safeInit(){

  if(initialized) return;
  initialized = true;

  init();

}


/* =====================================================
   INIT
===================================================== */

function init(){

  console.log("✅ CUENTA INIT OK");

  mapDOM();

  if(!DOM.profileName){
    console.warn("❌ DOM no listo (cuenta)");
    return;
  }

  bindEvents();

  render(Onion.state.user);

}

})();