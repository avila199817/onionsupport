(function(){

"use strict";

/* =====================================================
   ONION UTILS · FULL PRO
===================================================== */


/* =====================================================
   FORMATTERS
===================================================== */

const eurFormatter = new Intl.NumberFormat("es-ES",{
  style:"currency",
  currency:"EUR"
});

function eur(v){
  const num = Number(v);
  if(!isFinite(num)) return "0,00 €";
  return eurFormatter.format(num);
}

/* 👉 alias rápido global (para no romper nada) */
window.eur = eur;


/* =====================================================
   NUMBER
===================================================== */

function toNumber(v, def = 0){
  const n = Number(v);
  return isFinite(n) ? n : def;
}

function sum(arr, field){
  if(!Array.isArray(arr)) return 0;

  if(!field){
    return arr.reduce((a,b)=> a + toNumber(b), 0);
  }

  return arr.reduce((a,b)=> a + toNumber(b?.[field]), 0);
}


/* =====================================================
   DATE
===================================================== */

function isThisMonth(date){
  if(!date) return false;

  const d = new Date(date);
  const now = new Date();

  return (
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}


/* =====================================================
   STRINGS
===================================================== */

function safeString(v, def=""){
  return typeof v === "string" ? v : def;
}

function firstName(name){
  return safeString(name).split(" ")[0] || "";
}


/* =====================================================
   DOM
===================================================== */

function qs(sel,scope=document){
  return scope.querySelector(sel);
}

function qsa(sel,scope=document){
  return Array.from(scope.querySelectorAll(sel));
}

function setText(id,value){
  const el = document.getElementById(id);
  if(el) el.textContent = value;
}

function setHTML(id,value){
  const el = document.getElementById(id);
  if(el) el.innerHTML = value;
}


/* =====================================================
   PERFORMANCE
===================================================== */

function debounce(fn,delay=200){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t = setTimeout(()=> fn(...args),delay);
  };
}

function throttle(fn,limit=200){
  let waiting = false;

  return (...args)=>{
    if(waiting) return;

    fn(...args);
    waiting = true;

    setTimeout(()=> waiting=false,limit);
  };
}


/* =====================================================
   SAFE EXEC
===================================================== */

function safe(fn){
  try{
    return fn();
  }catch(e){
    console.warn("SAFE ERROR:", e);
    return null;
  }
}


/* =====================================================
   DEBUG (opcional)
===================================================== */

function log(...args){
  console.log("[ONION]", ...args);
}

function warn(...args){
  console.warn("[ONION]", ...args);
}

function error(...args){
  console.error("[ONION]", ...args);
}


/* =====================================================
   PUBLIC API
===================================================== */

window.utils = {

  /* format */
  eur,

  /* number */
  toNumber,
  sum,

  /* date */
  isThisMonth,

  /* strings */
  safeString,
  firstName,

  /* dom */
  qs,
  qsa,
  setText,
  setHTML,

  /* perf */
  debounce,
  throttle,

  /* safe */
  safe,

  /* debug */
  log,
  warn,
  error

};

})();