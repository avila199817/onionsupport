document.addEventListener("DOMContentLoaded", () => {

const API_BASE = "https://api.onionit.net";

const form = document.getElementById("deactivateAccountForm");
if (!form) return;

const token = localStorage.getItem("onion_token");

if (!token) {
  window.location.href = "/es/acceso/";
  return;
}

/* =========================
   ELEMENTOS
========================= */

const searchInput = document.getElementById("user_search");
const resultsBox = document.getElementById("searchResults");

const userIdField = document.getElementById("account_id");
const emailField = document.getElementById("account_email");
const roleField = document.getElementById("account_role");

const passwordInput = document.getElementById("admin_password");
const reasonInput = document.getElementById("reason");

const button = form.querySelector("button[type='submit']");

let debounceTimer = null;


/* =========================
   TOAST
========================= */

function showToast(msg,type="success"){

let container=document.getElementById("toast-container");

if(!container){
container=document.createElement("div");
container.id="toast-container";
container.className="toast-container";
document.body.appendChild(container);
}

const toast=document.createElement("div");
toast.className=`toast ${type}`;
toast.textContent=msg;

container.appendChild(toast);

setTimeout(()=>toast.remove(),3000);

}


/* =========================
   SEARCH USERS
========================= */

if(searchInput){

searchInput.addEventListener("input",()=>{

const q=searchInput.value.trim();

if(q.length<2){
resultsBox.innerHTML="";
resultsBox.style.display="none";
return;
}

clearTimeout(debounceTimer);

debounceTimer=setTimeout(async()=>{

try{

const res = await fetch(
`${API_BASE}/api/admin/search/users?q=${encodeURIComponent(q)}`,
{
headers:{
Authorization:`Bearer ${token}`
}
}
);

const json = await res.json().catch(()=>({}));

if(!res.ok || !json.ok){
resultsBox.style.display="none";
return;
}

renderResults(json.users || []);

}catch(err){

console.error("SEARCH ERROR:",err);

}

},250);

});

}


/* =========================
   RENDER USERS
========================= */

function renderResults(users){

resultsBox.innerHTML="";

if(!users.length){
resultsBox.style.display="none";
return;
}

users.forEach(user=>{

const item=document.createElement("div");

item.className="search-result-item";
item.textContent=`${user.name} — ${user.email}`;

item.onclick=()=>{

searchInput.value=`${user.name} — ${user.email}`;

userIdField.value=user.userId || "";
emailField.value=user.email || "";
roleField.value=user.role || "user";

resultsBox.innerHTML="";
resultsBox.style.display="none";

};

resultsBox.appendChild(item);

});

resultsBox.style.display="block";

}


/* =========================
   CLICK OUTSIDE SEARCH
========================= */

document.addEventListener("click",(e)=>{

if(
searchInput &&
resultsBox &&
!searchInput.contains(e.target) &&
!resultsBox.contains(e.target)
){
resultsBox.style.display="none";
}

});


/* =========================
   SUBMIT
========================= */

form.addEventListener("submit", async (e) => {

e.preventDefault();

if(!button) return;

button.disabled=true;
button.textContent="Procesando...";

try{

const userId = userIdField.value.trim();
const password = passwordInput.value.trim();
const reason = reasonInput.value.trim();

/* VALIDACIONES */

if(!userId){
showToast("Selecciona un usuario","error");
return;
}

if(!password){
showToast("Introduce la contraseña","error");
return;
}

/* =========================
   API CALL
========================= */

const res = await fetch(
`${API_BASE}/api/auth/deactivate/admin`,
{
method:"POST",
headers:{
"Content-Type":"application/json",
Authorization:`Bearer ${token}`
},
body: JSON.stringify({
userId,
password,
reason
})
}
);

const json = await res.json().catch(()=>({}));

if(res.status === 401){
showToast("Contraseña incorrecta","error");
return;
}

if(!res.ok || !json.ok){
showToast(json?.error || "No se pudo desactivar la cuenta","error");
return;
}


/* =========================
   SUCCESS
========================= */

showToast("Cuenta desactivada correctamente","success");

form.reset();

searchInput.value="";
userIdField.value="";
emailField.value="";
roleField.value="";

resultsBox.innerHTML="";
resultsBox.style.display="none";

}catch(err){

console.error("DEACTIVATE ERROR:",err);
showToast("Error del servidor","error");

}finally{

button.disabled=false;
button.textContent="Desactivar cuenta";

}

});

});