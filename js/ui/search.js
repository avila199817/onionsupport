"use strict";

(function(){

if(!window.Onion){
  console.error("💥 Onion no definido (search)");
  return;
}

const Onion = window.Onion;

/* =========================
   SINGLETON
========================= */

if(window.__onionSearchLoaded) return;
window.__onionSearchLoaded = true;


/* =========================
   INIT
========================= */

Onion.ui = Onion.ui || {};
Onion.ui.search = Onion.ui.search || {};

Onion.ui.search.init = function(){

const input = document.querySelector("#topbar-search");
const container = document.querySelector("#topbar-search-results");

if(!input || !container) return;
if(input.__searchInit) return;

input.__searchInit = true;


/* =========================
   STATE
========================= */

let timer = null;
let controller = null;

let index = [];
let indexLoaded = false;

let activeIndex = -1;
let currentResults = [];


/* =========================
   UTILS
========================= */

const normalize = v =>
String(v || "")
.toLowerCase()
.normalize("NFD")
.replace(/[\u0300-\u036f]/g,"");

function fuzzy(text,q){
let t=0,qc=0;
while(t<text.length && qc<q.length){
if(text[t]===q[qc]) qc++;
t++;
}
return qc===q.length;
}


/* =========================
   UI
========================= */

function show(){
container.hidden = false;
container.classList.add("active");
}

function hide(){
container.classList.remove("active");
container.hidden = true;
container.innerHTML = "";
activeIndex = -1;
}


/* =========================
   HIGHLIGHT
========================= */

function highlight(text,q){
if(!q) return text;

const i = text.toLowerCase().indexOf(q.toLowerCase());
if(i === -1) return text;

return text.slice(0,i)
+ "<mark>"+text.slice(i,i+q.length)+"</mark>"
+ text.slice(i+q.length);
}


/* =========================
   ICONS
========================= */

const icons = {
cliente:"🏢",
user:"👤",
factura:"🧾",
incidencia:"🎫",
nav:"📂",
action:"🛠️",
settings:"⚙️"
};


/* =========================
   GROUP
========================= */

function group(results){
const g={};
results.forEach(r=>{
(g[r.type] ||= []).push(r);
});
return g;
}


/* =========================
   RENDER
========================= */

function render(results, q=""){

container.innerHTML = "";
currentResults = results;
activeIndex = -1;

if(!results.length){
container.innerHTML = `<div class="search-empty">Sin resultados</div>`;
return show();
}

const groups = group(results);

Object.keys(groups).forEach(type=>{

const header = document.createElement("div");
header.className = "search-group";
header.textContent = type;

container.appendChild(header);

groups[type].slice(0,6).forEach((r)=>{

const el = document.createElement("div");
el.className = "search-result";

el.innerHTML = `
<span class="search-icon">${icons[r.type] || "🔎"}</span>
<div class="search-text">
  <div class="search-title">${highlight(r.title || "", q)}</div>
  ${r.subtitle ? `<div class="search-subtitle">${highlight(r.subtitle, q)}</div>`:""}
</div>
`;

el.addEventListener("click", ()=>{
hide();
if(r.url){
Onion.router?.navigate?.(r.url);
}
});

container.appendChild(el);

});

});

show();

}


/* =========================
   API SEARCH
========================= */

async function searchAPI(q){

try{

if(controller) controller.abort();

controller = new AbortController();

const url = Onion.config.API + "/search?q=" + encodeURIComponent(q);

const data = await Onion.fetch(url,{ signal:controller.signal });

return data?.results || [];

}catch(e){

if(e.name === "AbortError") return [];

console.error("💥 SEARCH API ERROR:", e);
return [];

}

}


/* =========================
   INDEX LOAD
========================= */

async function loadIndex(){

if(indexLoaded) return;

try{

const data = await Onion.fetch(Onion.config.API + "/admin/search/index");

index = (data?.results || []).map(i=>({

...i,
t: normalize(i.title),
s: normalize(i.subtitle),
k: (i.keywords||[]).map(normalize)

}));

indexLoaded = true;

}catch(e){
console.error("💥 INDEX ERROR:", e);
}

}


/* =========================
   LOCAL SEARCH
========================= */

function searchLocal(q){

q = normalize(q);

return index
.map(i=>{

let score=0;

if(i.t.includes(q)) score+=10;
else if(fuzzy(i.t,q)) score+=6;

if(i.s?.includes(q)) score+=4;
if(i.k?.some(k=>k.includes(q))) score+=8;

return {i,score};

})
.filter(r=>r.score>0)
.sort((a,b)=>b.score-a.score)
.slice(0,20)
.map(r=>r.i);

}


/* =========================
   MAIN SEARCH
========================= */

async function runSearch(q){

// 1. instant local
const local = searchLocal(q);
render(local, q);

// 2. async API mejora resultados
const api = await searchAPI(q);

if(api.length){
render(api, q);
}

}


/* =========================
   INPUT
========================= */

function onInput(){

const value = input.value.trim();

clearTimeout(timer);

if(!value){
hide();
return;
}

timer = setTimeout(()=> runSearch(value), 150);

}

input.addEventListener("input", onInput);


/* =========================
   FOCUS
========================= */

input.addEventListener("focus", async ()=>{

if(!input.value.trim()) return;

await loadIndex();
runSearch(input.value);

});


/* =========================
   CLICK OUTSIDE
========================= */

document.addEventListener("click",(e)=>{
if(!e.target.closest(".topbar-search-wrap")){
hide();
}
});


/* =========================
   KEYBOARD NAV
========================= */

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
items[activeIndex].scrollIntoView({block:"nearest"});
}

}


/* =========================
   PRELOAD
========================= */

setTimeout(loadIndex, 1000);


/* =========================
   CLEANUP
========================= */

Onion.onCleanup(()=>{

clearTimeout(timer);

if(controller){
try{ controller.abort(); }catch{}
}

input.removeEventListener("input", onInput);

input.__searchInit = false;

});

};

})();
