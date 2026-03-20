/* =====================================================
   INPUT AUTO CONFIG
===================================================== */

(function(){

"use strict";

function autoConfig(scope=document){

scope.querySelectorAll("input").forEach(input=>{

const type = input.type;

if(type === "email" && !input.placeholder){
input.placeholder = "correo@dominio.com";
input.inputMode = "email";
input.autocomplete = "email";
}

if(type === "number"){
input.inputMode = "decimal";
input.pattern = "[0-9]*";
}

if(type === "tel"){
input.inputMode = "tel";
input.autocomplete = "tel";
}

if(type === "password"){
input.autocomplete = "current-password";
}

});

}

function get(id){
return document.getElementById(id)?.value.trim() || "";
}

function clear(form){
form?.reset();
}

window.input = {
autoConfig,
get,
clear
};

})();