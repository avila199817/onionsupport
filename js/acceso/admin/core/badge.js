(function(){

"use strict";

/* =====================================================
   BADGE ENGINE
   Sistema centralizado de etiquetas
===================================================== */


/* =====================================================
   STATUS
===================================================== */

const STATUS = {

open:{
label:"Abierta",
class:"badge badge-open badge-dot"
},

pending:{
label:"Pendiente",
class:"badge badge-pending badge-dot"
},

closed:{
label:"Cerrada",
class:"badge badge-closed"
}

};


/* =====================================================
   ROLE
===================================================== */

const ROLE = {

admin:{
label:"Admin",
class:"badge badge-admin"
},

user:{
label:"User",
class:"badge badge-user"
}

};


/* =====================================================
   TYPE
===================================================== */

const TYPE = {

empresa:{
label:"Empresa",
class:"badge badge-empresa"
},

particular:{
label:"Particular",
class:"badge badge-particular"
}

};


/* =====================================================
   ACTIVE / STATUS
===================================================== */

const ACTIVE = {

true:{
label:"Activo",
class:"badge badge-activo badge-dot"
},

false:{
label:"Inactivo",
class:"badge badge-inactivo"
}

};


/* =====================================================
   RENDER
===================================================== */

function render(map,value){

const data = map[value];

if(!data){

return `<span class="badge badge-neutral">${value ?? "-"}</span>`;

}

return `<span class="${data.class}">${data.label}</span>`;

}


/* =====================================================
   PUBLIC API
===================================================== */

window.badge = {

status(v){
return render(STATUS,v);
},

role(v){
return render(ROLE,v);
},

type(v){
return render(TYPE,v);
},

active(v){
return render(ACTIVE,String(v));
}

};

})();