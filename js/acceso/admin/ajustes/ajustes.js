/* =========================================
   CONFIG
========================================= */

const API_URL = "https://api.onionit.net";
const USER_CACHE_KEY = "onion_user_cache";

let settingsHTML = "";


/* =========================================
   CACHE
========================================= */

function obtenerUsuarioCache(){

  try{

    const raw = localStorage.getItem(USER_CACHE_KEY);

    if(!raw) return null;

    const parsed = JSON.parse(raw);

    if(!parsed || !parsed.user) return null;

    return parsed;

  }catch{

    return null;

  }

}


function guardarUsuarioCache(data){

  try{

    localStorage.setItem(USER_CACHE_KEY, JSON.stringify({
      user:data.user,
      cliente:data.cliente || null,
      savedAt:Date.now()
    }));

  }catch{}

}


/* =========================================
   LOADER
========================================= */

function mostrarLoader(){

  const container = document.querySelector(".settings-container");

  if(!container) return;

  container.innerHTML = `

  <div class="ajustes-loader">

    <div class="loader-spinner"></div>

    <p>Verificando acceso...</p>

  </div>

  `;

}


/* =========================================
   ERROR
========================================= */

function mostrarError(){

  const container = document.querySelector(".settings-container");

  if(!container) return;

  container.innerHTML = `

  <div class="ajustes-error">

    <h2>Error al cargar ajustes</h2>

    <p>No se pudo verificar tu sesión.</p>

  </div>

  `;

}


/* =========================================
   BLOQUEO CLIENTE
========================================= */

function mostrarBloqueoCliente(){

  const container = document.querySelector(".settings-container");

  if(!container) return;

  container.innerHTML = `

  <div class="ajustes-block-wrapper">

    <div class="ajustes-block-card">

      <div class="ajustes-block-icon">🔒</div>

      <h2 class="ajustes-block-title">
        Funcionalidad no disponible
      </h2>

      <p class="ajustes-block-text">
        Tu cuenta no dispone de acceso a esta sección porque
        no tienes una <strong>cuenta cliente activa</strong>.
      </p>

      <p class="ajustes-block-text">
        Contacta con soporte para activar tu cuenta.
      </p>

      <div class="ajustes-block-actions">
        <a href="/es/contacto/" class="btn-soporte">
          Contactar con soporte
        </a>
      </div>

    </div>

  </div>

  `;

}


/* =========================================
   AVATAR
========================================= */

function generarIniciales(nombre){

  if(!nombre) return "U";

  return nombre
    .trim()
    .split(" ")
    .map(p => p[0])
    .slice(0,2)
    .join("")
    .toUpperCase();

}


function crearAvatarSVG(iniciales){

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="100%" height="100%" fill="#e5e5ea"/>
    <text x="50%" y="52%" font-size="80"
      text-anchor="middle"
      fill="#6e6e73"
      font-family="Arial"
      dy=".3em">${iniciales}</text>
  </svg>`;

  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));

}


/* =========================================
   PINTAR USUARIO
========================================= */

function pintarUsuario(user, cliente){

  const nameEl = document.getElementById("userName");
  const emailEl = document.getElementById("userEmail");
  const empresaEl = document.getElementById("userEmpresa");
  const avatarEl = document.getElementById("userAvatar");

  if(nameEl){
    nameEl.textContent = user.name || user.username || "Usuario";
  }

  if(emailEl){
    emailEl.textContent = user.email || "";
  }

  /* 🔥 EMPRESA / NOMBRE FISCAL */

  if(empresaEl){

    let nombreEmpresa = "—";

    if(cliente && cliente.nombreFiscal){
      nombreEmpresa = cliente.nombreFiscal;
    }
    else if(user && user.nombreFiscal){
      nombreEmpresa = user.nombreFiscal;
    }

    empresaEl.textContent = nombreEmpresa;

  }

  if(avatarEl){

    if(user.hasAvatar && user.avatar){

      avatarEl.src = user.avatar;

    }else{

      const iniciales = generarIniciales(user.name);

      avatarEl.src = crearAvatarSVG(iniciales);

    }

  }

}


/* =========================
   CARGAR PERFIL
========================= */

async function cargarPerfil(token){

  const cache = obtenerUsuarioCache();

  if(cache){

    pintarUsuario(cache.user, cache.cliente);
    return;

  }

  try{

    const res = await fetch(`${API_URL}/api/auth/me`,{
      method:"GET",
      headers:{
        Authorization:`Bearer ${token}`,
        Accept:"application/json"
      }
    });

    if(!res.ok) return;

    const data = await res.json();

    if(!data.ok) return;

    guardarUsuarioCache(data);

    pintarUsuario(data.user, data.cliente);

  }
  catch(err){

    console.error("ME ERROR:",err);

  }

}


/* =========================================
   VALIDAR ACCESO AJUSTES
========================================= */

async function validarAcceso(token){

  try{

    const res = await fetch(`${API_URL}/api/ajustes/validate`,{
      method:"GET",
      headers:{
        Authorization:`Bearer ${token}`,
        Accept:"application/json"
      }
    });

    if(res.status === 401){

      location.href="/es/login/";

      return false;

    }

    if(!res.ok) return false;

    const data = await res.json();

    if(!data.ok) return false;

    if(!data.clienteActivo){

      mostrarBloqueoCliente();

      return false;

    }

    return true;

  }
  catch(err){

    console.error("VALIDATE ERROR:",err);

    return false;

  }

}


/* =========================================
   INIT
========================================= */

async function initAjustes(){

  const container = document.querySelector(".settings-container");

  if(!container) return;

  settingsHTML = container.innerHTML;

  mostrarLoader();

  const token = localStorage.getItem("onion_token");

  if(!token){

    location.href="/es/acceso/";

    return;

  }

  const accesoOK = await validarAcceso(token);

  if(!accesoOK) return;

  container.innerHTML = settingsHTML;

  cargarPerfil(token);

}


document.addEventListener("DOMContentLoaded", initAjustes);