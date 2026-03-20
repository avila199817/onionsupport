/* =========================
   GET CLIENTE ID
========================= */

function getClienteId(){

const params = new URLSearchParams(window.location.search);

let id = params.get("id");

if(id) return id;

const parts = window.location.pathname.split("/");
const last = parts[parts.length-1];

if(last && last.startsWith("CON-")){
return last;
}

return null;

}

const clienteId = getClienteId();


/* =========================
   HELPERS
========================= */

function dom(id){
return document.getElementById(id);
}

function formatDate(date){

if(!date) return "-";

return new Date(date).toLocaleString("es-ES",{
year:"numeric",
month:"2-digit",
day:"2-digit",
hour:"2-digit",
minute:"2-digit"
});

}

function badge(text,type){
return `<span class="badge badge-${type}">${text}</span>`;
}

function setText(id,value){

const el = dom(id);
if(!el) return;

el.textContent = value || "-";

}

function setValue(id,value){

const el = dom(id);
if(!el) return;

el.value = value || "";

}

function setHTML(id,value){

const el = dom(id);
if(!el) return;

el.innerHTML = value;

}


/* =========================
   EDIT MODE
========================= */

let editMode = false;

function toggleEdit(){

editMode = !editMode;

const fields = [
"empresa",
"contacto",
"email",
"telefono",
"nif",
"calle",
"cp",
"ciudad",
"provincia",
"pais",
"tipo",
"plan"
];

fields.forEach(id=>{

const el = dom(id);
if(!el) return;

if(editMode){
el.removeAttribute("disabled");
}else{
el.setAttribute("disabled","true");
}

});


if(editMode){

dom("editClientBtn").style.display="none";
dom("saveClientBtn").style.display="inline-flex";
dom("cancelEditClientBtn").style.display="inline-flex";

}else{

dom("editClientBtn").style.display="inline-flex";
dom("saveClientBtn").style.display="none";
dom("cancelEditClientBtn").style.display="none";

}

}


/* =========================
   LOAD CLIENTE
========================= */

async function loadCliente(){

if(!clienteId){

document.body.innerHTML = `
<div style="padding:40px;text-align:center;font-family:system-ui">
<h2>Error</h2>
<p>No se pudo identificar el cliente.</p>
</div>
`;

return;

}

try{

const token = localStorage.getItem("onion_token");

const res = await fetch(
`https://api.onionit.net/api/clientes/${clienteId}`,
{
headers:{
Authorization:`Bearer ${token}`
}
});

if(!res.ok){
throw new Error("API_ERROR");
}

const data = await res.json();
const c = data.cliente;

if(!c){
throw new Error("NO_CLIENTE");
}


/* =========================
   AVATAR
========================= */

const avatar = dom("avatar");

if(avatar){

const name = c.nombreFiscal || c.contacto?.nombre || "";

const initials = name
.split(" ")
.map(n=>n[0])
.slice(0,2)
.join("")
.toUpperCase();

avatar.textContent = initials || "CL";

}


/* =========================
   HEADER
========================= */

setText("name", c.nombreFiscal || c.contacto?.nombre);

setHTML(
"status",
c.active
? badge("Activo","active")
: badge("Desactivado","disabled")
);


/* =========================
   INFORMACIÓN GENERAL
========================= */

setValue("empresa", c.nombreFiscal);
setValue("contacto", c.contacto?.nombre);
setValue("email", c.contacto?.email);
setValue("telefono", c.contacto?.phone);
setValue("nif", c.nif);


/* =========================
   DIRECCIÓN
========================= */

setValue("calle", c.direccion?.calle);
setValue("cp", c.direccion?.cp);
setValue("ciudad", c.direccion?.ciudad);
setValue("provincia", c.direccion?.provincia);
setValue("pais", c.direccion?.pais);


/* =========================
   FACTURACIÓN
========================= */

setValue("tipo", c.tipo);
setValue("plan", c.plan);


/* =========================
   FECHAS
========================= */

setText("created", formatDate(c.createdAt));
setText("updated", formatDate(c.updatedAt));

}
catch(err){

console.error("CLIENTE LOAD ERROR:",err);

document.body.innerHTML = `
<div style="padding:40px;text-align:center;font-family:system-ui">
<h2>Error cargando cliente</h2>
<p>No se pudo obtener la información del cliente.</p>
</div>
`;

}

}


/* =========================
   SAVE CLIENTE
========================= */

async function saveCliente(){

try{

const token = localStorage.getItem("onion_token");

const payload = {

nombreFiscal:dom("empresa").value,
nif:dom("nif").value,

contacto:{
nombre:dom("contacto").value,
email:dom("email").value,
phone:dom("telefono").value
},

direccion:{
calle:dom("calle").value,
cp:dom("cp").value,
ciudad:dom("ciudad").value,
provincia:dom("provincia").value,
pais:dom("pais").value
},

tipo:dom("tipo").value,
plan:dom("plan").value

};

const res = await fetch(

`https://api.onionit.net/api/clientes/update/${clienteId}`,

{
method:"PUT",
headers:{
"Content-Type":"application/json",
Authorization:`Bearer ${token}`
},
body:JSON.stringify(payload)
}

);

if(!res.ok){
throw new Error("UPDATE_ERROR");
}

toggleEdit();
loadCliente();

showToast("Cliente actualizado correctamente","success");

}
catch(err){

console.error("SAVE CLIENTE ERROR:",err);

showToast("Error actualizando cliente","error");

}

}


/* =========================
   TOAST
========================= */

function showToast(message,type="success"){

const container = document.getElementById("toastContainer");

if(!container) return;

const toast = document.createElement("div");

toast.className = `toast toast-${type}`;

toast.textContent = message;

container.appendChild(toast);

setTimeout(()=>{

toast.style.opacity="0";
toast.style.transform="translateY(-10px)";

setTimeout(()=>{
toast.remove();
},300);

},2500);

}


/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded",()=>{

loadCliente();

const params = new URLSearchParams(window.location.search);

const editParam = params.get("edit")==="true";

if(editParam){

toggleEdit();

}else{

dom("editClientBtn")?.addEventListener("click",toggleEdit);

}

dom("saveClientBtn")?.addEventListener("click",saveCliente);

dom("cancelEditClientBtn")?.addEventListener("click",()=>{

window.location.href="/es/acceso/admin/clientes/";

});

});