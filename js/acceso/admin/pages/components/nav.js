(function(){

"use strict";

if(!window.Onion) return;

/* =====================================================
   INIT
===================================================== */

Onion.events.on("nav:ready", init);

function init(){

const input     = document.getElementById("topbar-search");
const container = document.getElementById("topbar-search-results");

if(!input || !container) return;

/* 🔥 EVITAR DUPLICADOS (CLAVE) */
if(input.dataset.searchBound === "true") return;
input.dataset.searchBound = "true";

console.log("🔥 SEARCH INIT OK");

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
<span class="search-icon">🔎</span>
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
   SEARCH
===================================================== */

async function search(q){

const url = Onion.config.API + "/search?q=" + encodeURIComponent(q);

try{
const data = await Onion.fetch(url);
return data?.results || [];
}catch(err){
console.error("SEARCH ERROR:", err);
return [];
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
const results = await search(v);
render(results, v);
}, 150);

});

input.addEventListener("focus", async ()=>{

const v = input.value.trim();
if(!v) return;

const results = await search(v);
render(results, v);

});

document.addEventListener("click",(e)=>{
if(!e.target.closest(".topbar-search-wrap")){
hide();
}
});

/* =====================================================
   CLOSE EVENT
===================================================== */

Onion.events.on("nav:search:close", hide);

}

})();
