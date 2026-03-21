(function(){

"use strict";

/* =====================================================
   SINGLETON
===================================================== */

if(window.__onionNavSearchLoaded) return;
window.__onionNavSearchLoaded = true;

if(!window.Onion) return;


/* =====================================================
   INIT
===================================================== */

Onion.events.on("nav:ready", init);

let initialized = false;

function init(){

/* ================= DOM ================= */

const input     = document.getElementById("topbar-search");
const container = document.getElementById("topbar-search-results");

if(!input || !container) return;
if(initialized) return;
initialized = true;


/* =====================================================
   STATE
===================================================== */

let timer;
let activeIndex = -1;


/* =====================================================
   UTILS
===================================================== */

function highlight(text,q){

if(!q) return text;

const i = text.toLowerCase().indexOf(q.toLowerCase());
if(i === -1) return text;

return text.substring(0,i)
+ "<mark>" + text.substring(i,i+q.length) + "</mark>"
+ text.substring(i+q.length);

}


/* =====================================================
   ICONS
===================================================== */

const icons = {
cliente:"🏢",
user:"👤",
factura:"🧾",
incidencia:"🎫",
nav:"📂",
action:"🛠️",
settings:"⚙️"
};


/* =====================================================
   SHOW / HIDE
===================================================== */

function show(){
container.classList.add("active");
}

function hide(){
container.classList.remove("active");
container.innerHTML = "";
activeIndex = -1;
}


/* =====================================================
   RENDER
===================================================== */

function render(results, query=""){

container.innerHTML = "";
activeIndex = -1;

if(!results.length){
container.innerHTML = '<div class="search-empty">Sin resultados</div>';
show();
return;
}

results.slice(0,20).forEach((r)=>{

const el = document.createElement("a");
el.className = "search-result";
el.href = r.url || "#";

el.innerHTML = `
<span class="search-icon">${icons[r.type] || "🔎"}</span>
<div class="search-text">
  <div class="search-title">${highlight(r.title || "", query)}</div>
  ${r.subtitle ? `<div class="search-subtitle">${highlight(r.subtitle, query)}</div>`:""}
</div>
`;

el.addEventListener("click",(e)=>{
e.preventDefault();
hide();
if(r.url) Onion.go(r.url);
});

container.appendChild(el);

});

show();
}


/* =====================================================
   SEARCH (SIN SILENCIOS 💥)
===================================================== */

async function search(q){

const url = Onion.config.API + "/search?q=" + encodeURIComponent(q);

console.log("🔎 SEARCH URL:", url);

try{

const data = await Onion.fetch(url);

console.log("✅ SEARCH DATA:", data);

return data?.results || [];

}catch(err){

console.error("💥 SEARCH ERROR REAL:", err);
throw err; // 👈 CLAVE: no ocultar errores

}

}


/* =====================================================
   EVENTS
===================================================== */

input.addEventListener("input",()=>{

const v = input.value.trim();

clearTimeout(timer);

if(!v){
hide();
return;
}

timer = setTimeout(async ()=>{

try{
const results = await search(v);
render(results, v);
}catch(e){
console.error("❌ INPUT SEARCH FAIL:", e);
hide();
}

}, 150);

});


input.addEventListener("focus", async ()=>{

const v = input.value.trim();
if(!v) return;

try{
const results = await search(v);
render(results, v);
}catch(e){
console.error("❌ FOCUS SEARCH FAIL:", e);
}

});


document.addEventListener("click",(e)=>{
if(!e.target.closest(".topbar-search-wrap")){
hide();
}
});


/* =====================================================
   KEYBOARD NAV
===================================================== */

document.addEventListener("keydown",(e)=>{

const items = container.querySelectorAll(".search-result");

if(!items.length) return;

if(e.key==="ArrowDown"){
e.preventDefault();
activeIndex = Math.min(activeIndex+1, items.length-1);
updateActive(items);
}

if(e.key==="ArrowUp"){
e.preventDefault();
activeIndex = Math.max(activeIndex-1, 0);
updateActive(items);
}

if(e.key==="Enter" && activeIndex>=0){
items[activeIndex]?.click();
}

if(e.key==="Escape"){
hide();
}

});


function updateActive(items){

items.forEach(el=>el.classList.remove("active"));

if(items[activeIndex]){
items[activeIndex].classList.add("active");
items[activeIndex].scrollIntoView({ block:"nearest" });
}

}


/* =====================================================
   🔥 LISTEN CLOSE EVENT (ANTES FALTABA)
===================================================== */

Onion.events.on("nav:search:close", hide);

}

})();
