document.addEventListener("DOMContentLoaded", async () => {

const token = localStorage.getItem("onion_token");

if (!token) {
window.location.href = "/es/acceso/";
return;
}

const loader = document.getElementById("topLoader");
const pageContent = document.getElementById("pageContent");

const qrImg = document.getElementById("qrImage");
const manualCodeEl = document.getElementById("manualCode");

const form = document.getElementById("verify2faForm");
const hiddenInput = document.getElementById("code");
const boxes = document.querySelectorAll(".code-box");

const button = form?.querySelector("button[type='submit']");
const errorBox = document.querySelector(".login-error");

const toastContainer = document.querySelector(".toast-container");

/* =========================
   TOAST
========================= */

function showToast(message,type="success"){

if(!toastContainer) return;

const toast = document.createElement("div");

toast.className = `toast toast-${type}`;

toast.textContent = message;

toastContainer.appendChild(toast);

setTimeout(()=>{
toast.remove();
},4000);

}

/* =========================
   ERROR UI
========================= */

const showError = (msg) => {
if (!errorBox) return;
errorBox.textContent = msg;
errorBox.style.display = "block";
};

const hideError = () => {
if (!errorBox) return;
errorBox.style.display = "none";
};

/* =========================
   LOADER CONTROL
========================= */

const finishLoading = () => {

if (loader) loader.style.display = "none";

if (pageContent) {
pageContent.style.visibility = "visible";
}

};

/* =========================
   UPDATE HIDDEN INPUT
========================= */

const updateHidden = () => {

if (!hiddenInput) return;

hiddenInput.value = Array
.from(boxes)
.map(b => b.value.replace(/\D/g,""))
.join("");

};

/* =========================
   INPUT HANDLING
========================= */

boxes.forEach((box,index)=>{

box.addEventListener("input",(e)=>{

hideError();

let value = e.target.value.replace(/\D/g,"");

if(value.length>1){
value = value[0];
}

e.target.value = value;

if(value && index < boxes.length-1){
boxes[index+1].focus();
}

updateHidden();

});

box.addEventListener("keydown",(e)=>{

if(e.key==="Backspace" && !box.value && index>0){
boxes[index-1].focus();
}

if(e.key==="ArrowLeft" && index>0){
boxes[index-1].focus();
}

if(e.key==="ArrowRight" && index<boxes.length-1){
boxes[index+1].focus();
}

});

box.addEventListener("paste",(e)=>{

e.preventDefault();

hideError();

const paste = e.clipboardData
.getData("text")
.replace(/\D/g,"")
.slice(0,6);

paste.split("").forEach((num,i)=>{

if(boxes[i]){
boxes[i].value = num;
}

});

updateHidden();

const focusIndex = Math.min(paste.length,boxes.length-1);

if(boxes[focusIndex]){
boxes[focusIndex].focus();
}

});

});

if(boxes[0]){
boxes[0].focus();
}

/* =========================
   PEDIR QR AL BACKEND
========================= */

try{

const res = await fetch(
"https://api.onionit.net/api/auth/2fa/setup",
{
method:"POST",
headers:{
Authorization:`Bearer ${token}`
}
}
);

const json = await res.json().catch(()=>({}));

if(!res.ok || !json.qr){
throw new Error("SETUP_ERROR");
}

if(qrImg){
qrImg.src = json.qr;
}

if(manualCodeEl){
manualCodeEl.textContent = json.manualCode;
}

finishLoading();

}catch(err){

console.error("2FA SETUP ERROR:",err);

showError("No se pudo generar el QR");

finishLoading();

return;

}

/* =========================
   VERIFICAR CÓDIGO
========================= */

if(!form) return;

form.addEventListener("submit", async (e)=>{

e.preventDefault();

hideError();

const code = hiddenInput?.value || "";

if(!code || code.length!==6){
showError("Código inválido");
return;
}

if(button){
button.disabled = true;
button.textContent = "Verificando…";
}

try{

const res = await fetch(
"https://api.onionit.net/api/auth/2fa/verify",
{
method:"POST",
headers:{
"Content-Type":"application/json",
Authorization:`Bearer ${token}`
},
body:JSON.stringify({code})
}
);

const json = await res.json().catch(()=>({}));

if(!res.ok || !json.ok){
throw new Error("INVALID_CODE");
}

/* =========================
   ÉXITO
========================= */

showToast("Verificación en dos pasos activada correctamente");

setTimeout(()=>{
window.location.href="/es/acceso/admin/cuenta/?2fa=enabled";
},3000);

}catch(err){

console.error("2FA VERIFY ERROR:",err);

showError("Código incorrecto");

boxes.forEach(b=>b.value="");

if(hiddenInput) hiddenInput.value="";

if(boxes[0]) boxes[0].focus();

}finally{

if(button){
button.disabled = false;
button.textContent = "Verificar y activar";
}

}

});

});