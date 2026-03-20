/* =====================================================
   ONION PUBLIC NAV
===================================================== */

document.addEventListener("DOMContentLoaded", initPublicNav);

async function initPublicNav(){

const container = document.getElementById("nav-container");
if(!container) return;

try{

/* =====================================================
   LOAD NAV HTML
===================================================== */

const res = await fetch("/es/components/nav.html",{cache:"force-cache"});
if(!res.ok) throw new Error("NAV_LOAD_ERROR");

container.innerHTML = await res.text();


/* =====================================================
   DOM
===================================================== */

const navTop   = container.querySelector(".nav-top");
const toggle   = container.querySelector("#navToggle");
const links    = container.querySelector(".nav-links");

const navAvatarImg   = container.querySelector("#navAvatarImg");
const navGreeting    = container.querySelector("#navGreetingName");
const navUserTrigger = container.querySelector("#navUserTrigger");
const navUserMenu    = container.querySelector("#navUserMenu");
const logoutBtn      = container.querySelector("#logoutBtn");

const navSearchBtn   = container.querySelector("#navSearchBtn");


/* =====================================================
   LOAD NAV SEARCH
===================================================== */

if(navSearchBtn){

const script = document.createElement("script");

script.src="/js/acceso/admin/components/nav_search.js";
script.defer=true;

document.body.appendChild(script);

}


/* =====================================================
   SCROLL EFFECT
===================================================== */

window.addEventListener("scroll",()=>{

if(window.scrollY>10){
navTop?.classList.add("scrolled");
}else{
navTop?.classList.remove("scrolled");
}

});


/* =====================================================
   MOBILE MENU
===================================================== */

function openMenu(){

links?.classList.add("open");
toggle?.classList.add("active");

document.body.classList.add("nav-open");

}

function closeMenu(){

links?.classList.remove("open");
toggle?.classList.remove("active");

document.body.classList.remove("nav-open");

}

toggle?.addEventListener("click",(e)=>{

e.stopPropagation();

const isOpen = links?.classList.contains("open");

if(isOpen){
closeMenu();
}else{
openMenu();
}

});


links?.querySelectorAll("a").forEach(link=>{

link.addEventListener("click",()=>{

closeMenu();

});

});


document.addEventListener("click",(e)=>{

if(!links?.classList.contains("open")) return;

if(!container.contains(e.target)){

closeMenu();

}

});


/* =====================================================
   USER DROPDOWN + LOGIN REDIRECT
===================================================== */

if(navUserTrigger && navUserMenu){

navUserTrigger.addEventListener("click",(e)=>{

e.stopPropagation();

const token = localStorage.getItem("onion_token");

/* NO LOGIN → REDIRECT */

if(!token){

window.location.href="/es/acceso/";
return;

}

/* LOGIN → DROPDOWN */

const isOpen = navUserMenu.classList.toggle("open");

if(isOpen){
navUserTrigger.classList.add("active");
}else{
navUserTrigger.classList.remove("active");
}

});

document.addEventListener("click",(e)=>{

if(!navUserMenu.contains(e.target) && !navUserTrigger.contains(e.target)){

navUserMenu.classList.remove("open");
navUserTrigger.classList.remove("active");

}

});

}


/* =====================================================
   CACHE USER (INSTANT PAINT)
===================================================== */

const cachedUser = getCachedUser();

if(cachedUser){

pintarUsuarioLogeado(
navAvatarImg,
navGreeting,
cachedUser
);

}else{

pintarUsuarioAnonimo(
navAvatarImg,
navGreeting
);

}


/* =====================================================
   VALIDATE SESSION BACKGROUND
===================================================== */

await validarSesion(
navAvatarImg,
navGreeting
);


logoutBtn?.addEventListener("click",logout);


}catch(err){

console.error("NAV LOAD ERROR",err);

}

}


/* =====================================================
   CACHE USER
===================================================== */

function getCachedUser(){

try{

const raw = localStorage.getItem("onion_user");
if(!raw) return null;

return JSON.parse(raw);

}catch{

return null;

}

}

function setCachedUser(user){

localStorage.setItem("onion_user",JSON.stringify(user));

}

function clearCachedUser(){

localStorage.removeItem("onion_user");

}


/* =====================================================
   VALIDAR SESION
===================================================== */

async function validarSesion(navAvatarImg,navGreeting){

const token = localStorage.getItem("onion_token");

if(!token){

clearCachedUser();
pintarUsuarioAnonimo(navAvatarImg,navGreeting);
return;

}

try{

const res = await fetch(
"https://api.onionit.net/api/auth/me",
{
headers:{
Authorization:`Bearer ${token}`
}
}
);

if(res.status===401 || res.status===403){

localStorage.removeItem("onion_token");
clearCachedUser();

pintarUsuarioAnonimo(navAvatarImg,navGreeting);
return;

}

if(!res.ok) return;

const json = await res.json();

if(!json.ok || !json.user) return;


/* UPDATE CACHE */

setCachedUser(json.user);


/* REPAINT */

pintarUsuarioLogeado(
navAvatarImg,
navGreeting,
json.user
);

}catch(err){

console.warn("AUTH NAV ERROR",err);

}

}


/* =====================================================
   PAINT USER LOGGED
===================================================== */

function pintarUsuarioLogeado(navAvatarImg,navGreeting,user){

if(!navAvatarImg || !navGreeting) return;

const avatar = user.avatar || "/media/img/Usuario.png";

const name =
(user.name || user.email || "Cuenta")
.split(" ")[0];

navAvatarImg.src = avatar;
navGreeting.textContent = name;

}


/* =====================================================
   PAINT USER ANON
===================================================== */

function pintarUsuarioAnonimo(navAvatarImg,navGreeting){

if(!navAvatarImg || !navGreeting) return;

navAvatarImg.src="/media/img/Usuario.png";

navGreeting.textContent="Iniciar sesión";

}


/* =====================================================
   LOGOUT
===================================================== */

function logout(){

localStorage.removeItem("onion_token");

clearCachedUser();

window.location.href="/es/acceso/";

}