/* =====================================================
   BUTTON LOADING SYSTEM
===================================================== */

(function(){

"use strict";

function setLoading(button,text="Procesando..."){

if(!button) return;

button.dataset.originalText = button.textContent;
button.textContent = text;

button.disabled = true;
button.classList.add("btn-loading");

}

function reset(button){

if(!button) return;

button.textContent = button.dataset.originalText || "Enviar";

button.disabled = false;
button.classList.remove("btn-loading");

}

window.button = {
setLoading,
reset
};

})();