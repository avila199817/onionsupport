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

let index = [];
let loaded = false;
let loading = false;
let timer;
let activeIndex = -1;


/* =====================================================
   UTILS
===================================================== */

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

function highlight(text,q){
if(!q) return text;
const i = text.toLowerCase().indexOf(q.toLowerCase());
if(i === -1) return text;
return text.substring(0,i)
+ "<mark>" + text.substring(i,i+q.length) + "</mark>"
+ text.substring(i+q.length);
}


/* =====================================================
   LOAD INDEX
===================================================== */

async function loadIndex(){

if(loaded || loading) return;

loading = true;

try{

const data = await Onion.fetch(Onion.config.API + "/search");
const results = data?.results || data || [];

index = results.map(i=>({
...i,
t: normalize(i.title),
s: normalize(i.subtitle),
k: (i.keywords||[]).map(normalize)
}));

loaded = true;

}catch(err){
console.error("SEARCH LOAD ERROR:", err);
}finally{
loading = false;
}

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
Onion.go(r.url);
});

container.appendChild(el);

});

show();
}


/* =====================================================
   SEARCH
===================================================== */

function run(q){

q = normalize(q.trim());

if(!q){
hide();
return;
}

const results = index

.map(i=>{

let score=1; // 👈 fallback para que SIEMPRE haya resultados

if(i.t.includes(q)) score+=10;
else if(fuzzy(i.t,q)) score+=6;

if(i.s?.includes(q)) score+=4;
if(i.k?.some(k=>k.includes(q))) score+=8;

return {i,score};

})

.sort((a,b)=>b.score-a.score)
.map(r=>r.i);

render(results, q);

}


/* =====================================================
   EVENTS
===================================================== */

input.addEventListener("input",()=>{

const v = input.value;
clearTimeout(timer);

if(!v){
hide();
return;
}

timer = setTimeout(async ()=>{
await loadIndex();
run(v);
}, 120);

});

input.addEventListener("focus", ()=>{
if(input.value) run(input.value);
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
   PRELOAD
===================================================== */

setTimeout(loadIndex, 1000);

}

})();
