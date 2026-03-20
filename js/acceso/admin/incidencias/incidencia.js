/* =====================================================
   INCIDENCIA VIEW · ONION PANEL
   CLEAN PRO VERSION
===================================================== */

"use strict";


/* =====================================================
   CONFIG & AUTH
===================================================== */

const API = "https://api.onionit.net";
const token = localStorage.getItem("onion_token");

if (!token) {
  window.location.href = "/es/acceso/";
}

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json"
};


/* =====================================================
   HELPERS
===================================================== */

const dom = (id) => document.getElementById(id);

function setText(id, value){

  const el = dom(id);
  if(!el) return;

  el.textContent =
    (value === undefined || value === null || value === "")
      ? "N/D"
      : value;
}

function formatDate(date){

  if(!date) return "N/D";

  const d = new Date(date);

  return isNaN(d)
    ? "N/D"
    : d.toLocaleString("es-ES");
}

async function fetchJSON(url){

  const res = await fetch(url,{ headers });

  if(!res.ok){
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
}


/* =====================================================
   ID RECOVERY
===================================================== */

function getTicketId(){

  const params = new URLSearchParams(window.location.search);

  let id = params.get("id");

  if(id) return id;

  const parts = window.location.pathname.split("/");
  const last = parts[parts.length - 1];

  return (last && last.startsWith("INC-"))
    ? last
    : null;
}

const ticketId = getTicketId();


/* =====================================================
   USER AVATAR
===================================================== */

function fillUser(user){

  if(!user) return;

  const avatar = dom("avatar");

  if(!avatar) return;

  avatar.src =
    (user.hasAvatar && user.avatar)
      ? user.avatar
      : "/media/img/Usuario.png";

  avatar.onerror = () => {
    avatar.src = "/media/img/Usuario.png";
  };

}


async function loadUser(userId){

  if(!userId) return;

  try{

    const data = await fetchJSON(`${API}/api/users/${userId}`);

    if(data.ok && data.user){
      fillUser(data.user);
    }

  }catch(err){

    console.error("USER LOAD ERROR:",err);

  }

}


/* =====================================================
   STATUS
===================================================== */

function paintStatus(status){

  const el = dom("status");
  if(!el) return;

  const labels = {
    open:"Abierta",
    pending:"Pendiente",
    closed:"Cerrada"
  };

  el.textContent = labels[status] || status;

  el.classList.remove(
    "badge-open",
    "badge-pending",
    "badge-closed"
  );

  el.classList.add(`badge-${status}`);

}


/* =====================================================
   RENDER TICKET
===================================================== */

function fillTicket(t){

  if(!t) return;

  console.log("TICKET:",t);

  const labels = {
    open:"Abierta",
    pending:"Pendiente",
    closed:"Cerrada"
  };

  const statusLabel = labels[t.status] || t.status;

  setText("ticketId", t.ticketId);

  paintStatus(t.status);
  setText("statusText", statusLabel);

  setText("name", t.name);
  setText("email", t.email);
  setText("clienteId", t.clienteId);

  setText("tipo", t.tipo);
  setText("tecnico", t.tecnico?.name);

  setText("descripcion", t.descripcion || t.message);

  setText("created", formatDate(t.createdAt));
  setText("updated", formatDate(t.updatedAt));

  if(t.userId){
    loadUser(t.userId);
  }

}


/* =====================================================
   SESSION VALIDATION
===================================================== */

async function validarSesion(){

  try{

    const res = await fetch(`${API}/api/auth/me`,{ headers });

    if(!res.ok){
      throw new Error("invalid session");
    }

  }catch{

    localStorage.removeItem("onion_token");

    window.location.href = "/es/acceso/";

  }

}


/* =====================================================
   LOAD TICKET
===================================================== */

async function loadTicket(){

  if(!ticketId){
    console.warn("NO TICKET ID");
    return;
  }

  try{

    const data = await fetchJSON(`${API}/api/tickets/${ticketId}`);

    console.log("API RESPONSE:",data);

    if(data.ok && data.ticket){
      fillTicket(data.ticket);
    }

  }catch(err){

    console.error("TICKET LOAD ERROR:",err);

  }

}


/* =====================================================
   INIT
===================================================== */

async function init(){

  await validarSesion();

  await loadTicket();

}

document.addEventListener("DOMContentLoaded", init);