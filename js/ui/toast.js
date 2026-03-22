/* =====================================================
   ONION TOAST · PRO
===================================================== */

(function(){

"use strict";

const MAX_TOASTS = 5;

function getContainer(){

let container = document.querySelector(".toast-container");

if(!container){

container = document.createElement("div");
container.className = "toast-container";

document.body.appendChild(container);

}

return container;

}


/* =====================================================
   CREATE
===================================================== */

function showToast(message,type="info",duration=3000){

const container = getContainer();

/* limitar cantidad */
if(container.children.length >= MAX_TOASTS){
container.firstChild.remove();
}

const toast = document.createElement("div");
toast.className = `toast toast-${type}`;

/* contenido seguro */
const msg = document.createElement("div");
msg.className = "toast-message";
msg.textContent = message;

const btn = document.createElement("button");
btn.className = "toast-close";
btn.textContent = "✕";

toast.appendChild(msg);
toast.appendChild(btn);

container.appendChild(toast);


/* ANIMACIÓN ENTRADA */
requestAnimationFrame(()=>{
toast.classList.add("show");
});


/* CLOSE */

let timeout = setTimeout(()=>{
removeToast(toast);
},duration);

btn.addEventListener("click",()=>{

clearTimeout(timeout);
removeToast(toast);

});

}


/* =====================================================
   REMOVE
===================================================== */

function removeToast(toast){

if(!toast) return;

toast.classList.remove("show");
toast.classList.add("hide");

setTimeout(()=>{
toast.remove();
},250);

}


/* =====================================================
   API
===================================================== */

window.toast = {

success:(msg,d)=>showToast(msg,"success",d),
error:(msg,d)=>showToast(msg,"error",d),
warning:(msg,d)=>showToast(msg,"warning",d),
info:(msg,d)=>showToast(msg,"info",d),

show:showToast

};

})();
