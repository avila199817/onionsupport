(function(){

"use strict";

/* =====================================================
   PASSWORD SYSTEM · FINAL PRO
===================================================== */

let capsActive = false;


/* =====================================================
   INIT
===================================================== */

function init(scope=document){

setupToggle(scope);
setupCaps(scope);
setupValidation(scope);

}


/* =====================================================
   TOGGLE (👁️)
===================================================== */

function setupToggle(scope){

scope.querySelectorAll(".password-toggle").forEach(btn=>{

if(btn._bound) return; // evitar duplicados
btn._bound = true;

btn.addEventListener("click",()=>{

const input = document.getElementById(btn.dataset.target);
if(!input) return;

const isHidden = input.type === "password";

input.type = isHidden ? "text" : "password";

btn.setAttribute("aria-pressed", isHidden);
btn.classList.toggle("active", isHidden);

input.focus();

});

});

}


/* =====================================================
   CAPS LOCK (GLOBAL PRO)
===================================================== */

function setupCaps(scope){

/* detectar caps globalmente UNA VEZ */
if(!window.__capsListener){

window.__capsListener = true;

document.addEventListener("keydown", updateCapsState);
document.addEventListener("keyup", updateCapsState);

}

scope.querySelectorAll('input[type="password"]').forEach(input=>{

if(input._capsBound) return;
input._capsBound = true;

const warning = scope.querySelector(
`.caps-warning[data-caps="${input.id}"]`
);

if(!warning) return;

function updateVisual(){

if(document.activeElement === input && capsActive){
warning.style.display = "block";
}else{
warning.style.display = "none";
}

}

input.addEventListener("focus", updateVisual);
input.addEventListener("blur", ()=> warning.style.display="none");

/* refrescar al escribir */
input.addEventListener("keyup", updateVisual);

});

}


/* estado caps global */

function updateCapsState(e){

if(!e.getModifierState) return;

const state = e.getModifierState("CapsLock");

if(state !== capsActive){
capsActive = state;
}

}


/* =====================================================
   VALIDATION (FUERZA + MATCH)
===================================================== */

function setupValidation(scope){

const pass  = scope.querySelector("[data-password='new']");
const pass2 = scope.querySelector("[data-password='confirm']");

const reqBox   = scope.querySelector("[data-password='requirements']");
const matchBox = scope.querySelector("[data-password='match']");

if(!pass) return;

const rules = {
length: v => v.length >= 10,
upper:  v => /[A-Z]/.test(v),
lower:  v => /[a-z]/.test(v),
number: v => /\d/.test(v),
symbol: v => /[^A-Za-z\d]/.test(v)
};

function updateReq(value){

if(!reqBox) return;

Object.keys(rules).forEach(rule=>{

const el = reqBox.querySelector(`[data-rule="${rule}"]`);
if(!el) return;

const ok = rules[rule](value);

el.classList.toggle("valid", ok);
el.classList.toggle("invalid", !ok);

});

}


function updateMatch(){

if(!matchBox || !pass2) return;

if(!pass2.value){
matchBox.textContent="";
matchBox.className="password-match";
return;
}

const ok = pass.value === pass2.value;

matchBox.textContent = ok
? "Las contraseñas coinciden"
: "Las contraseñas no coinciden";

matchBox.className = `password-match ${ok ? "valid" : "invalid"}`;

}


/* eventos */

pass.addEventListener("input",()=>{
updateReq(pass.value);
updateMatch();
});

pass2?.addEventListener("input", updateMatch);

}


/* =====================================================
   AUTO INIT
===================================================== */

window.addEventListener("onion:app-ready",()=>{

init();

});


/* =====================================================
   API
===================================================== */

window.password = {
init
};

})();