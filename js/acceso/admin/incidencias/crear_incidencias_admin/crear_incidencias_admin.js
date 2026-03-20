/* =====================================================
   CREATE INCIDENCIA · ONION PANEL ENGINE
   FULL PRO VERSION · NO CONFLICT NAV SEARCH
===================================================== */

(function(){

"use strict";


/* =====================================================
   WAIT CORE READY
===================================================== */

window.addEventListener("onion:core-ready", init);


/* =====================================================
   STATE
===================================================== */

let form;

let titleInput;
let categoryInput;
let priorityInput;
let statusInput;
let descriptionInput;

let userSearchInput;

let emailInput;
let roleInput;
let idInput;

let resultsBox;

let searchTimer = null;
let searchCache = new Map();

let abortController = null;


/* =====================================================
   UTILS
===================================================== */

function capitalize(v){

if(!v) return "";

v = String(v);

return v.charAt(0).toUpperCase() + v.slice(1);

}


/* =====================================================
   CREATE RESULTS BOX
===================================================== */

function createResultsBox(){

resultsBox = document.createElement("div");

resultsBox.id = "userSearchResults";

resultsBox.style.position = "absolute";
resultsBox.style.zIndex = "900";
resultsBox.style.display = "none";

document.body.appendChild(resultsBox);

}


/* =====================================================
   POSITION RESULTS
===================================================== */

function positionResults(){

if(!userSearchInput || !resultsBox) return;

const rect = userSearchInput.getBoundingClientRect();

resultsBox.style.left = rect.left + "px";
resultsBox.style.top = rect.bottom + window.scrollY + "px";
resultsBox.style.width = rect.width + "px";

}


/* =====================================================
   RENDER RESULTS
===================================================== */

function renderResults(users = []){

if(!resultsBox) return;

if(!Array.isArray(users) || users.length === 0){

resultsBox.style.display = "none";
resultsBox.innerHTML = "";

return;

}

positionResults();

resultsBox.innerHTML = users.map(u => `

<div
class="search-result-item"
data-id="${u.userId || ""}"
data-name="${u.name || ""}"
data-email="${u.email || ""}"
data-role="${u.role || ""}"
data-tipo="${u.tipo || ""}"
>

${u.label || `${u.name || ""} · ${u.email || ""}`}

</div>

`).join("");

resultsBox.style.display = "block";

}


/* =====================================================
   SELECT USER
===================================================== */

function selectUser(user){

if(!user) return;

userSearchInput.value = user.name || user.email || "";

emailInput.value = user.email || "";
idInput.value = user.userId || "";

roleInput.value = capitalize(user.tipo);

resultsBox.style.display = "none";

}


/* =====================================================
   RESULT CLICK
===================================================== */

function initResultClick(){

if(!resultsBox) return;

resultsBox.addEventListener("click", function(e){

const item = e.target.closest(".search-result-item");
if(!item) return;

const user = {

userId: item.dataset.id,
name: item.dataset.name,
email: item.dataset.email,
role: item.dataset.role,
tipo: item.dataset.tipo

};

selectUser(user);

});

}


/* =====================================================
   SEARCH USERS
===================================================== */

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

`${API}/admin/search/users?q=${encodeURIComponent(q)}&mode=incidencias`,

{
headers: getHeaders(),
signal: abortController.signal
}

);

const users = Array.isArray(json?.users) ? json.users : [];

searchCache.set(q, users);

renderResults(users);

}catch(err){

if(err.name !== "AbortError"){

console.error("USER SEARCH ERROR:", err);

}

}

}


/* =====================================================
   INPUT EVENT
===================================================== */

function initSearch(){

userSearchInput.addEventListener("input", function(e){

const q = e.target.value.trim();

clearTimeout(searchTimer);

if(q.length < 2){

renderResults([]);
return;

}

searchTimer = setTimeout(function(){

searchUsers(q);

}, 250);

});

}


/* =====================================================
   OUTSIDE CLICK
===================================================== */

function initOutsideClick(){

document.addEventListener("click", function(e){

if(!resultsBox) return;

if(e.target === userSearchInput) return;

if(e.target.closest("#userSearchResults")) return;

resultsBox.style.display = "none";

});

}


/* =====================================================
   CREATE TICKET
===================================================== */

async function createTicket(e){

e.preventDefault();

try{

const payload = {

clienteId: idInput.value,
userId: idInput.value,

tipo: titleInput.value || "Incidencia",

categoria: categoryInput.value,
prioridad: priorityInput.value,

descripcion: descriptionInput.value,

receptorEmail: emailInput.value

};


/* VALIDATION */

if(!payload.clienteId){

toast.error("Selecciona un usuario primero");
return;

}

if(!payload.descripcion){

toast.error("La descripción es obligatoria");
return;

}


/* API */

const json = await fetchJSON(

`${API}/tickets/create`,

{
method: "POST",
headers: getHeaders(),
body: JSON.stringify(payload)
}

);


/* SUCCESS */

toast.success(`Incidencia creada · Ticket ${json.ticketId}`);


/* REDIRECT */

setTimeout(function(){

window.location.href = "/es/acceso/admin/incidencias/";

}, 1200);

}catch(err){

console.error("CREATE TICKET ERROR:", err);

toast.error("Error creando incidencia");

}

}


/* =====================================================
   INIT FORM
===================================================== */

function initForm(){

if(!form) return;

form.addEventListener("submit", createTicket);

}


/* =====================================================
   INIT
===================================================== */

function init(){

form = qs("createTicketForm");
userSearchInput = qs("userSearch");

if(!form || !userSearchInput) return;

titleInput = qs("title");
categoryInput = qs("category");
priorityInput = qs("priority");
statusInput = qs("status");
descriptionInput = qs("description");

emailInput = qs("user_email");
roleInput = qs("account_type");
idInput = qs("account_id");


createResultsBox();

initSearch();
initResultClick();
initOutsideClick();

initForm();

}

})();