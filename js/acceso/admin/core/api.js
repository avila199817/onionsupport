const API = "https://api.onionit.net/api";

/* =====================================================
   AUTH
===================================================== */

function getToken(){

const token = localStorage.getItem("onion_token");

if(!token){
throw new Error("NO_TOKEN");
}

return token;

}

function redirectLogin(){

localStorage.removeItem("onion_token");
window.location.href = "/es/acceso/";

}


/* =====================================================
   HEADERS (CACHEADOS)
===================================================== */

let cachedHeaders = null;

function getHeaders(){

const token = getToken();

if(cachedHeaders && cachedHeaders._token === token){
return cachedHeaders;
}

cachedHeaders = {
Authorization: `Bearer ${token}`,
"Content-Type": "application/json",
_token: token // interno para comparar
};

return cachedHeaders;

}


/* =====================================================
   FETCH CORE
===================================================== */

async function fetchJSON(url,options={}){

const controller = new AbortController();
const timeout = options.timeout || 10000;

const id = setTimeout(()=> controller.abort(), timeout);

try{

const res = await fetch(url,{

method: options.method || "GET",

headers: {
...getHeaders(),
...(options.headers || {})
},

body: options.body ? JSON.stringify(options.body) : undefined,

signal: controller.signal,

keepalive: true

});

let json = null;

try{
json = await res.json();
}catch{}

/* AUTH */

if(res.status === 401 || res.status === 403){
redirectLogin();
throw new Error("UNAUTHORIZED");
}

/* ERROR SERVIDOR */

if(!res.ok){
throw new Error(json?.error || `HTTP_${res.status}`);
}

return json;

}catch(err){

if(err.name === "AbortError"){
throw new Error("TIMEOUT");
}

if(err.message === "NO_TOKEN"){
redirectLogin();
throw err;
}

throw err;

}finally{

clearTimeout(id);

}

}