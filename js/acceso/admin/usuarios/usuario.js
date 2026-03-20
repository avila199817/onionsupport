/* =====================================================
   USUARIO VIEW · ONION PANEL
   CLEAN ENGINE
===================================================== */

"use strict";


/* =====================================================
   CONFIG & AUTH
===================================================== */

const API = "https://api.onionit.net";

const token = localStorage.getItem("onion_token");

if(!token){
location.href="/es/acceso/";
}

const headers={
Authorization:`Bearer ${token}`,
"Content-Type":"application/json"
};


/* =====================================================
   STATE
===================================================== */

let userId=null;
let isEditing=false;


/* =====================================================
   HELPERS
===================================================== */

const dom=id=>document.getElementById(id);

const safe=v=>
v && String(v).trim()!=="" ? v : "N/D";


function setText(id,value){

const el=dom(id);
if(!el) return;

el.textContent=safe(value);

}


function setInput(id,value){

const el=dom(id);
if(!el) return;

el.value=value ?? "";

}


function setSelect(id,value){

const el=dom(id);

if(!el || el.tagName!=="SELECT") return;

let val=String(value || "").toLowerCase().trim();

if(val!=="empresa" && val!=="particular"){
val="particular";
}

el.value=val;

}


function toBool(v){
return v===true || v==="true";
}


function formatDate(date){

if(!date) return "N/D";

const d=new Date(date);

return isNaN(d)
? "N/D"
: d.toLocaleString("es-ES");

}


function showToast(message,type="success"){

const container=dom("toastContainer");
if(!container) return;

const toast=document.createElement("div");

toast.className=`toast toast-${type}`;
toast.textContent=message;

container.appendChild(toast);

setTimeout(()=>{

toast.style.opacity="0";

setTimeout(()=>{
toast.remove();
},300);

},2600);

}


/* =====================================================
   GET USER ID
===================================================== */

function getUserId(){

const params=new URLSearchParams(location.search);

let id=params.get("id");

if(id) return id;

const parts=location.pathname.split("/");

const last=parts[parts.length-1];

return last?.startsWith("ON-")
? last
: null;

}


/* =====================================================
   RENDER USER
===================================================== */

function renderUser(u){

if(!u) return;

console.log("RENDER USER:",u);


/* HEADER */

setText("name",u.name);
setText("role",u.role);

const avatar=dom("avatar");

if(avatar){

avatar.src=
(u.hasAvatar && u.avatar)
? u.avatar
: "/media/img/Usuario.png";

avatar.onerror=()=>{
avatar.src="/media/img/Usuario.png";
};

}


/* BASIC INFO */

setText("userId",u.userId || u.id);

setInput("nameInput",u.name);
setInput("email",u.email);
setInput("username",u.username);
setInput("phone",u.phone);
setInput("nif",u.nif);

setSelect("tipo",u.tipo);

setText(
"status",
toBool(u.active) ? "Activo":"Desactivado"
);


/* ADDRESS */

const d=u.direccion || {};

setInput("calle",d.calle);
setInput("cp",d.cp);
setInput("ciudad",d.ciudad);
setInput("provincia",d.provincia);
setInput("pais",d.pais);


/* SECURITY */

setText(
"emailVerified",
toBool(u.emailVerified) ? "Sí":"No"
);

setText(
"twofa",
toBool(u.twofa_enabled) ? "Activo":"Desactivado"
);

setText(
"privacy",
toBool(u.privacyMode) ? "Activo":"Desactivado"
);


/* DATES */

setText("created",formatDate(u.createdAt));
setText("updated",formatDate(u.updatedAt));
setText("passwordChange",formatDate(u.lastPasswordChangeAt));

}


/* =====================================================
   EDIT MODE
===================================================== */

function toggleEdit(){

isEditing=!isEditing;

const fields=document.querySelectorAll("input, select");

const readOnly=[

"email",
"username"

];

fields.forEach(field=>{

if(!readOnly.includes(field.id)){
field.disabled=!isEditing;
}

});

dom("editUserBtn").style.display=
isEditing?"none":"inline-block";

dom("saveUserBtn").style.display=
isEditing?"inline-block":"none";

dom("cancelEditBtn").style.display=
isEditing?"inline-block":"none";

}


/* =====================================================
   SAVE USER
===================================================== */

async function saveUser(){

const saveBtn=dom("saveUserBtn");

if(saveBtn.disabled) return;

saveBtn.disabled=true;
saveBtn.textContent="Guardando...";

const updatedData={

name:dom("nameInput").value,
phone:dom("phone").value,
nif:dom("nif").value,
tipo:dom("tipo").value,

direccion:{

calle:dom("calle").value,
cp:dom("cp").value,
ciudad:dom("ciudad").value,
provincia:dom("provincia").value,
pais:dom("pais").value

}

};

try{

const res=await fetch(

`${API}/api/users/${userId}`,

{
method:"PATCH",
headers,
body:JSON.stringify(updatedData)
}

);

const data=await res.json();

if(data.ok){

renderUser(data.user);

toggleEdit();

showToast(
"Usuario actualizado correctamente",
"success"
);

}else{

showToast(
data.error || "No se pudo guardar",
"error"
);

}

}
catch(err){

console.error("SAVE USER ERROR:",err);

showToast("Error del servidor","error");

}
finally{

saveBtn.disabled=false;
saveBtn.textContent="Guardar";

}

}


/* =====================================================
   LOAD USER
===================================================== */

async function loadUser(){

if(!userId) return;

try{

const res=await fetch(

`${API}/api/users/${userId}`,

{headers}

);

const data=await res.json();

if(data.ok && data.user){

renderUser(data.user);

}

}
catch(err){

console.error("LOAD USER ERROR:",err);

showToast("Error cargando usuario","error");

}

}


/* =====================================================
   INIT
===================================================== */

function init(){

userId=getUserId();

loadUser();

dom("editUserBtn")?.addEventListener(
"click",
toggleEdit
);

dom("saveUserBtn")?.addEventListener(
"click",
saveUser
);

dom("cancelEditBtn")?.addEventListener(
"click",
toggleEdit
);


/* AUTO EDIT */

const params=new URLSearchParams(location.search);

if(params.get("edit")==="true"){

setTimeout(()=>{
toggleEdit();
},200);

}

}


document.addEventListener("DOMContentLoaded",init);