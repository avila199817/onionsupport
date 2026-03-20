/* =====================================================
   ONION MODAL · CLEAN PRO
===================================================== */

(function(){

"use strict";

function show(el){
el?.classList.remove("hidden");
}

function hide(el){
el?.classList.add("hidden");
}


/* =====================================================
   SETUP
===================================================== */

function setup(openId,modalId,closeId,onOpen){

const openBtn  = document.getElementById(openId);
const modal    = document.getElementById(modalId);
const closeBtn = document.getElementById(closeId);

if(!modal) return;

openBtn?.addEventListener("click", async ()=>{

try{

if(typeof onOpen === "function"){
await onOpen();
}

show(modal);

}catch(err){
console.warn("MODAL ERROR:",err);
}

});

closeBtn?.addEventListener("click",()=> hide(modal));

modal.addEventListener("click",(e)=>{
if(e.target === modal) hide(modal);
});

}


/* =====================================================
   API
===================================================== */

window.modal = {
show,
hide,
setup
};

})();