/* =====================================================
   CREATE CLIENTE · ONION SUPPORT PANEL
   SAAS PRO FINAL VERSION
   SEARCH + AUTOFILL + CREATE CLIENT
===================================================== */

(function(){

"use strict";

window.addEventListener("onion:core-ready", init);


/* =========================
   STATE
========================= */

let form;

let userSearchInput;

let nameInput;
let emailInput;
let phoneInput;
let nifInput;

let tipoInput;
let empresaInput;

let calleInput;
let cpInput;
let ciudadInput;
let provinciaInput;
let paisInput;

let idInput;

let resultsBox;

let searchTimer;
let searchCache = new Map();

let abortController = null;


/* =========================
   CREATE RESULTS BOX
========================= */

function createResultsBox(){

resultsBox = document.createElement("div");

resultsBox.id = "userSearchResults";

resultsBox.style.position = "absolute";
resultsBox.style.zIndex = "900";
resultsBox.style.display = "none";

document.body.appendChild(resultsBox);

}


/* =========================
   POSITION RESULTS
========================= */

function positionResults(){

const rect = userSearchInput.getBoundingClientRect();

resultsBox.style.left = rect.left + "px";
resultsBox.style.top = rect.bottom + window.scrollY + "px";
resultsBox.style.width = rect.width + "px";

}


/* =========================
   RENDER RESULTS
========================= */

function renderResults(users=[]){

if(!users.length){

resultsBox.style.display="none";
resultsBox.innerHTML="";
return;

}

positionResults();

resultsBox.innerHTML = users.map(u=>`

<div
class="search-result-item"
data-id="${u.userId || ""}"
data-name="${u.name || ""}"
data-email="${u.email || ""}"
data-phone="${u.phone || ""}"
data-nif="${u.nif || ""}"
data-tipo="${u.tipo || ""}"

data-calle="${u.direccion?.calle || ""}"
data-cp="${u.direccion?.cp || ""}"
data-ciudad="${u.direccion?.ciudad || ""}"
data-provincia="${u.direccion?.provincia || ""}"
data-pais="${u.direccion?.pais || ""}"
>

${u.label || `${u.name} · ${u.email}`}

</div>

`).join("");

resultsBox.style.display="block";

}


/* =========================
   SELECT USER
========================= */

function selectUser(user){

userSearchInput.value = user.name || user.email || "";

idInput.value = user.userId || "";

nameInput.value = user.name || "";
emailInput.value = user.email || "";
phoneInput.value = user.phone || "";
nifInput.value = user.nif || "";

tipoInput.value = user.tipo || "particular";

/* DIRECCIÓN */

calleInput.value = user.calle || "";
cpInput.value = user.cp || "";
ciudadInput.value = user.ciudad || "";
provinciaInput.value = user.provincia || "";
paisInput.value = user.pais || "";

toggleEmpresa();

resultsBox.style.display="none";

}


/* =========================
   RESULT CLICK
========================= */

function initResultClick(){

resultsBox.addEventListener("click",(e)=>{

const item = e.target.closest(".search-result-item");
if(!item) return;

const user={

userId:item.dataset.id,
name:item.dataset.name,
email:item.dataset.email,
phone:item.dataset.phone,
nif:item.dataset.nif,
tipo:item.dataset.tipo,

calle:item.dataset.calle,
cp:item.dataset.cp,
ciudad:item.dataset.ciudad,
provincia:item.dataset.provincia,
pais:item.dataset.pais

};

selectUser(user);

});

}


/* =========================
   SEARCH USERS
========================= */

async function searchUsers(q){

if(searchCache.has(q)){
renderResults(searchCache.get(q));
return;
}

if(abortController){
abortController.abort();
}

abortController = new AbortController();

try{

const json = await fetchJSON(

`${API}/admin/search/users?q=${encodeURIComponent(q)}&mode=clientes`,

{
headers:getHeaders(),
signal:abortController.signal
}

);

const users = json?.users || [];

searchCache.set(q,users);

renderResults(users);

}catch(err){

if(err.name!=="AbortError"){
console.error("USER SEARCH ERROR:",err);
}

}

}


/* =========================
   INPUT SEARCH
========================= */

function initSearch(){

userSearchInput.addEventListener("input",(e)=>{

const q = e.target.value.trim();

clearTimeout(searchTimer);

if(q.length<2){

renderResults([]);
return;

}

searchTimer=setTimeout(()=>{

searchUsers(q);

},250);

});

}


/* =========================
   TOGGLE EMPRESA
========================= */

function toggleEmpresa(){

if(tipoInput.value === "empresa"){

empresaInput.disabled = false;

}else{

empresaInput.disabled = true;
empresaInput.value = "";

}

}


/* =========================
   CREATE CLIENT
========================= */

async function createClient(e){

e.preventDefault();

/* PAYLOAD ALINEADO CON BACKEND */

const payload={

userId:idInput.value,

tipo:tipoInput.value,

nombreFiscal:nameInput.value,
nif:nifInput.value,

calle:calleInput.value,
cp:cpInput.value,
ciudad:ciudadInput.value,
provincia:provinciaInput.value,
pais:paisInput.value,

contactoNombre:nameInput.value,
contactoEmail:emailInput.value,
contactoPhone:phoneInput.value

};


if(!payload.userId){

toast.error("Selecciona un usuario primero");
return;

}

try{

await fetchJSON(

`${API}/clientes`,

{
method:"POST",
headers:getHeaders(),
body:JSON.stringify(payload)
}

);

toast.success("Cliente creado correctamente");

setTimeout(()=>{

window.location.href="/es/acceso/admin/clientes/";

},1200);

}catch(err){

console.error("CLIENT CREATE ERROR:",err);

toast.error("Error creando cliente");

}

}


/* =========================
   INIT
========================= */

function init(){

form = qs("createClientForm");
userSearchInput = qs("userSearch");

if(!form || !userSearchInput) return;

nameInput = qs("name");
emailInput = qs("email");
phoneInput = qs("phone");
nifInput = qs("nif");

tipoInput = qs("tipo");
empresaInput = qs("empresa");

calleInput = qs("calle");
cpInput = qs("cp");
ciudadInput = qs("ciudad");
provinciaInput = qs("provincia");
paisInput = qs("pais");

/* HIDDEN USER ID */

idInput = document.createElement("input");
idInput.type="hidden";
form.appendChild(idInput);

createResultsBox();

initSearch();
initResultClick();

tipoInput.addEventListener("change",toggleEmpresa);
toggleEmpresa();

form.addEventListener("submit",createClient);

}

})();