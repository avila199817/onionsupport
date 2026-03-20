(function(){

"use strict";

/* =====================================================
   ONION CACHE ENGINE · PRO FINAL
===================================================== */

const PREFIX = "onion_cache_";
const VERSION = "v3";

const memory = new Map();
const pending = new Map();

const DEFAULT_TTL = 300000; // 5 min


/* =====================================================
   VERSION CONTROL (AUTO CLEAN)
===================================================== */

(function checkVersion(){

const vKey = PREFIX + "version";

const current = localStorage.getItem(vKey);

if(current !== VERSION){

Object.keys(localStorage).forEach(k=>{
if(k.startsWith(PREFIX)){
localStorage.removeItem(k);
}
});

localStorage.setItem(vKey, VERSION);

}

})();


/* =====================================================
   TIME
===================================================== */

function now(){
return Date.now();
}


/* =====================================================
   KEY
===================================================== */

function key(k){
return PREFIX + VERSION + "_" + k;
}


/* =====================================================
   SIZE (PROTECTION)
===================================================== */

function sizeOf(obj){
try{
return new Blob([JSON.stringify(obj)]).size;
}catch{
return 0;
}
}


/* =====================================================
   SAVE
===================================================== */

function save(k,value){

const entry = {
v:value,
t:now()
};

memory.set(k,entry);

try{

/* evitar guardar cosas enormes (>1MB) */
if(sizeOf(entry) > 1024 * 1024){
console.warn("CACHE SKIPPED (too large):",k);
return;
}

localStorage.setItem(
key(k),
JSON.stringify(entry)
);

}catch(e){

console.warn("CACHE FULL, limpiando...");
clear();

}

}


/* =====================================================
   LOAD LOCAL
===================================================== */

function loadLocal(k){

try{

const raw = localStorage.getItem(key(k));
if(!raw) return null;

const parsed = JSON.parse(raw);

memory.set(k,parsed);

return parsed;

}catch{
return null;
}

}


/* =====================================================
   VALID TTL
===================================================== */

function valid(entry,ttl){
return entry && (now() - entry.t <= ttl);
}


/* =====================================================
   GET
===================================================== */

function get(k,ttl=DEFAULT_TTL){

const mem = memory.get(k);

if(valid(mem,ttl)){
return mem.v;
}

const local = loadLocal(k);

if(valid(local,ttl)){
return local.v;
}

return null;

}


/* =====================================================
   FETCH (DEDUPLICADO)
===================================================== */

async function fetchCache(k,fetcher,ttl=DEFAULT_TTL){

const mem = memory.get(k);

if(valid(mem,ttl)){
return mem.v;
}

if(pending.has(k)){
return pending.get(k);
}

const promise = (async()=>{

try{

const data = await fetcher();

save(k,data);

return data;

}finally{
pending.delete(k);
}

})();

pending.set(k,promise);

return promise;

}


/* =====================================================
   INSTANT (SWR)
===================================================== */

async function instant(k,fetcher,ttl=DEFAULT_TTL){

const mem = memory.get(k);

if(mem){
refreshBackground(k,fetcher,ttl);
return mem.v;
}

const local = loadLocal(k);

if(local){

if(valid(local,ttl)){
return local.v;
}

refreshBackground(k,fetcher,ttl);
return local.v;

}

return fetchCache(k,fetcher,ttl);

}


/* =====================================================
   BACKGROUND REFRESH (SAFE)
===================================================== */

function refreshBackground(k,fetcher,ttl){

if(pending.has(k)) return;

const mem = memory.get(k);

if(valid(mem,ttl)) return;

const run = async ()=>{

try{

const data = await fetcher();
save(k,data);

}catch(err){
console.warn("REFRESH ERROR:",k);
}finally{
pending.delete(k);
}

};

const promise = run();

pending.set(k,promise);

}


/* =====================================================
   REMOVE
===================================================== */

function remove(k){

memory.delete(k);

localStorage.removeItem(
key(k)
);

}


/* =====================================================
   CLEAR
===================================================== */

function clear(){

memory.clear();

Object.keys(localStorage).forEach(k=>{
if(k.startsWith(PREFIX)){
localStorage.removeItem(k);
}
});

}


/* =====================================================
   PUBLIC API
===================================================== */

window.cache = {

get,
set:save,
remove,
clear,

fetch:fetchCache,
instant

};

})();