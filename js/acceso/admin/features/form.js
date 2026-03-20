/* =====================================================
   FORM SYSTEM
===================================================== */

(function(){

"use strict";

function setup(formId,handler){

const form = document.getElementById(formId);
if(!form) return;

const btn = form.querySelector("button[type='submit']");

form.addEventListener("submit", async (e)=>{

e.preventDefault();

button.setLoading(btn);

try{

await handler(form,btn);

}catch(err){

console.error("FORM ERROR:",err);
toast.error("Error inesperado");

}finally{

button.reset(btn);

}

});

}

window.form = {
setup
};

})();