document.addEventListener("DOMContentLoaded", () => {

const API_BASE = "https://api.onionit.net";

const form = document.getElementById("deactivateAccountForm");
if (!form) return;


/* =========================
   TOKEN
========================= */

const token = localStorage.getItem("onion_token");

if (!token) {
  window.location.href = "/es/acceso/";
  return;
}


/* =========================
   ELEMENTOS
========================= */

const card = document.querySelector(".login-card");

const passwordInput = document.getElementById("password");
const toggleBtn = document.getElementById("togglePassword");

const capsWarning = document.getElementById("capsWarning");
const confirmCheckbox = document.getElementById("confirmDeactivate");

const button = form.querySelector("button[type='submit']");
const errorBox = document.querySelector(".login-error");

let capsActive = false;
let passwordFocused = false;


/* =========================
   SHAKE CARD
========================= */

function shakeCard(){

if(!card) return;

card.classList.remove("shake");

void card.offsetWidth;

card.classList.add("shake");

}


/* =========================
   TOAST
========================= */

function showToast(msg,type="success"){

let container=document.getElementById("toastContainer");

if(!container){
container=document.createElement("div");
container.id="toastContainer";
container.className="toast-container";
document.body.appendChild(container);
}

const toast=document.createElement("div");

toast.className=`toast toast-${type}`;
toast.textContent=msg;

container.appendChild(toast);

setTimeout(()=>toast.remove(),3000);

}


/* =========================
   ERROR
========================= */

function showError(msg){

if(!errorBox) return;

errorBox.textContent = msg;
errorBox.style.display = "block";

shakeCard();

}

function hideError(){

if(!errorBox) return;

errorBox.style.display = "none";

}


/* =========================
   PASSWORD TOGGLE
========================= */

if(toggleBtn && passwordInput){

toggleBtn.addEventListener("click",()=>{

const isHidden = passwordInput.type === "password";

passwordInput.type = isHidden ? "text" : "password";

toggleBtn.classList.toggle("active");

toggleBtn.setAttribute(
"aria-pressed",
isHidden ? "true" : "false"
);

passwordInput.focus();

});

}


/* =========================
   CAPS LOCK
========================= */

function updateCapsVisual(){

if(!capsWarning) return;

capsWarning.style.display =
(passwordFocused && capsActive)
? "block"
: "none";

}

function updateCapsState(e){

if(!e.getModifierState) return;

const newState = e.getModifierState("CapsLock");

if(newState !== capsActive){

capsActive = newState;

updateCapsVisual();

}

}

document.addEventListener("keydown",updateCapsState);
document.addEventListener("keyup",updateCapsState);

if(passwordInput){

passwordInput.addEventListener("focus",()=>{

passwordFocused = true;
updateCapsVisual();

});

passwordInput.addEventListener("blur",()=>{

passwordFocused = false;
updateCapsVisual();

});

}


/* =========================
   SUBMIT
========================= */

form.addEventListener("submit", async (e)=>{

e.preventDefault();

hideError();

if(!button) return;


/* =========================
   VALIDACIONES
========================= */

if(!confirmCheckbox.checked){

showError("Debes confirmar la desactivación de la cuenta");
return;

}

const password = passwordInput.value.trim();

if(!password){

showError("Introduce tu contraseña");
return;

}


/* =========================
   BLOQUEAR BOTÓN
========================= */

button.disabled = true;
button.textContent = "Procesando...";


try{

const res = await fetch(
`${API_BASE}/api/auth/deactivate/self`,
{
method:"POST",
headers:{
"Content-Type":"application/json",
"Authorization":`Bearer ${token}`
},
body: JSON.stringify({ password })
}
);

const json = await res.json().catch(()=>({}));


/* =========================
   RESPUESTAS
========================= */

/* contraseña incorrecta */

if(res.status === 401){

showError("Contraseña incorrecta");
return;

}

/* otros errores backend */

if(!res.ok || !json.ok){

showError(json?.error || "No se pudo desactivar la cuenta");
return;

}


/* =========================
   SUCCESS
========================= */

showToast("Cuenta desactivada correctamente","success");

setTimeout(()=>{

localStorage.removeItem("onion_token");

window.location.href="/es/acceso/";

},1500);


}catch(err){

console.error("DEACTIVATE ERROR:",err);

showError("Error del servidor");

}
finally{

button.disabled=false;
button.textContent="Desactivar cuenta";

}

});

});